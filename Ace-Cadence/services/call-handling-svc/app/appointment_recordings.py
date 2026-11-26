"""Appointment conference transcription, isolated from claims recording handling."""
import asyncio
import hmac
import re
import urllib.parse
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from common.db import AsyncSessionLocal, get_db
from .config import settings
from .appointment_rules import valid_twilio_signature
from .routers.appointments import call_record, staff
from .routers.recordings import _fetch_media
from .routers.calls import _auth_header
from .invalidate import publish_invalidation

router = APIRouter(tags=['appointments'])
_transcribing = set()


def format_transcription(result, speaker_names=None):
    lines, speaker, words = [], None, []
    for word in result.get('words', []):
        if word.get('type') != 'word':
            continue
        current = speaker_names.get(word.get('channel_index'), 'Unidentified speaker') if speaker_names else word.get('speaker_id') or 'Speaker'
        if speaker is not None and current != speaker:
            lines.append(speaker + ': ' + ' '.join(words))
            words = []
        speaker = current
        words.append(word.get('text', ''))
    if words:
        lines.append(speaker + ': ' + ' '.join(words))
    return '\n'.join(lines) or result.get('text')


async def save_transcription(db: AsyncSession, call_id: int, audio: bytes, speaker_names=None):
    options = {'model_id': 'scribe_v2', 'diarize': 'true'}
    if speaker_names:
        options.update({'diarize': 'false', 'use_multi_channel': 'true', 'multichannel_output_style': 'combined'})
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post('https://api.elevenlabs.io/v1/speech-to-text',
            headers={'xi-api-key': settings.elevenlabs_api_key},
            data=options,
            files={'file': ('operator.mp3', audio, 'audio/mpeg')})
        response.raise_for_status()
        result = response.json()
    transcript = format_transcription(result, speaker_names)
    if not transcript:
        raise ValueError('No speech was transcribed')
    await db.execute(text('UPDATE calls SET human_transcript=:value WHERE id=:id'), {'id': call_id, 'value': transcript})
    await db.execute(text('UPDATE appointment_calls SET transcription_error=NULL WHERE call_id=:id'), {'id': call_id})
    await db.commit()


async def transcribe(call_id: int):
    if call_id in _transcribing:
        return
    _transcribing.add(call_id)
    try:
        async with AsyncSessionLocal() as db:
            call = await call_record(db, call_id)
            if call.get('human_transcript'):
                return
            url = call.get('human_recording_path') or ''
            prefix = f'https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Recordings/'
            if not url.startswith(prefix) or not re.fullmatch(r'RE[0-9a-fA-F]{32}\.mp3', url[len(prefix):]):
                raise ValueError('Operator recording is not ready')
            headers = {'Authorization': _auth_header(settings.twilio_account_sid, settings.twilio_auth_token)}
            async with httpx.AsyncClient(timeout=30) as client:
                metadata = await client.get(url.removesuffix('.mp3') + '.json', headers=headers)
                metadata.raise_for_status()
                metadata = metadata.json()
            speaker_names = None
            if metadata.get('channels') == 2 and metadata.get('source') == 'DialVerb' and metadata.get('call_sid') == call.get('twilio_call_sid'):
                patient = (await db.execute(text('''SELECT CONCAT(p.first_name,' ',p.last_name) FROM patients p
                    JOIN appointments a ON a.patient_id=p.id WHERE a.id=:id'''), {'id': call['appointment_id']})).scalar()
                speaker_names = {0: patient or 'Patient', 1: call.get('assigned_agent_name') or 'Operator'}
            audio = await asyncio.to_thread(_fetch_media, url + ('?RequestedChannels=2' if speaker_names else ''), headers)
            if not audio or len(audio[0]) >= 64*1024*1024:
                raise ValueError('Operator recording could not be downloaded')
            await save_transcription(db, call_id, audio[0], speaker_names)
    except Exception:
        async with AsyncSessionLocal() as db:
            await db.execute(text('UPDATE appointment_calls SET transcription_error=:error WHERE call_id=:id'),
                             {'id': call_id, 'error': 'Could not transcribe the operator recording. You can retry or listen to the recording.'})
            await db.commit()
    finally:
        _transcribing.discard(call_id)
        await publish_invalidation('call', call_id)


@router.post('/appointment-voice/recording')
async def recording(request: Request, callId: int, token: str, tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    form = urllib.parse.parse_qs((await request.body()).decode(), keep_blank_values=True)
    url = settings.public_base_url.rstrip('/') + request.url.path + '?' + request.url.query
    if not valid_twilio_signature(url, form, request.headers.get('x-twilio-signature', ''), settings.twilio_auth_token):
        raise HTTPException(403, 'Invalid Twilio signature')
    call = await call_record(db, callId)
    if not hmac.compare_digest(call.get('handoff_token') or '', token):
        raise HTTPException(403, 'Invalid call token')
    sid = form.get('RecordingSid', [''])[0]
    if not re.fullmatch(r'RE[0-9a-fA-F]{32}', sid):
        raise HTTPException(422, 'Invalid recording ID')
    media = f'https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Recordings/{sid}.mp3'
    await db.execute(text('UPDATE calls SET human_recording_path=:url,recording_path=:url WHERE id=:id'), {'url': media, 'id': callId})
    await db.commit()
    await publish_invalidation('call', callId)
    tasks.add_task(transcribe, callId)
    return {'ok': True}


@router.post('/appointments/calls/{call_id:int}/transcribe')
async def retry_transcription(call_id: int, tasks: BackgroundTasks, _=Depends(staff), db: AsyncSession = Depends(get_db)):
    call = await call_record(db, call_id)
    if not call.get('human_recording_path'):
        raise HTTPException(409, 'No operator recording is ready')
    tasks.add_task(transcribe, call_id)
    return {'ok': True}
