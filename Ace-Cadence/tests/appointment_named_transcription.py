"""Real SQL/TwiML/ElevenLabs review using synthetic stereo speech; no phone calls."""
import asyncio
from pathlib import Path
import sys
from xml.etree import ElementTree
from starlette.requests import Request
from sqlalchemy import text
from common.db import AsyncSessionLocal, engine
from app.config import settings
from app.appointment_recordings import save_transcription, format_transcription
from app.routers.handoff import payer_conference_twiml


async def main():
    assert engine.url.database == 'cadence_review' and not settings.twilio_account_sid
    settings.elevenlabs_api_key = sys.stdin.read().strip()
    assert settings.elevenlabs_api_key
    names = {0:'Review Patient',1:'Review Operator'}
    assert format_transcription({'words':[{'type':'word','text':'Hello','channel_index':1},{'type':'word','text':'Yes','channel_index':0}]},names) == 'Review Operator: Hello\nReview Patient: Yes'
    assert format_transcription({'words':[{'type':'word','text':'Hello'}]},names) == 'Unidentified speaker: Hello'
    ids = []
    async with AsyncSessionLocal() as db:
        try:
            aid = (await db.execute(text('SELECT id FROM appointments ORDER BY id LIMIT 1'))).scalar()
            for kind in ['claim','appointment']:
                result = await db.execute(text("INSERT INTO calls(use_case,status,started_at,completed_at,handoff_token) VALUES (:kind,'completed',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'review-named-recording')"), {'kind':kind})
                cid = result.lastrowid
                ids.append(cid)
                if kind == 'appointment':
                    await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid':cid,'aid':aid})
                request = Request({'type':'http','scheme':'http','server':('review',80),'path':'/','query_string':b'','headers':[(b'host',b'review')]})
                response = await payer_conference_twiml(cid,request,db)
                dial = ElementTree.fromstring(response.body).find('Dial')
                conference = dial.find('Conference')
                if kind == 'appointment':
                    assert dial.attrib['record'] == 'record-from-answer-dual'
                    assert '/appointment-voice/recording?' in dial.attrib['recordingStatusCallback']
                    assert 'record' not in conference.attrib, 'Do not create a duplicate conference recording'
                else:
                    assert 'record' not in dial.attrib
                    assert conference.attrib['record'] == 'record-from-start'
                    assert '/twilio-recording-status?' in conference.attrib['recordingStatusCallback']
            await db.commit()
            await save_transcription(db,cid,Path(sys.argv[1]).read_bytes(),names)
            transcript = (await db.execute(text('SELECT human_transcript FROM calls WHERE id=:id'), {'id':cid})).scalar()
            assert 'Review Patient:' in transcript and 'Review Operator:' in transcript, transcript
            assert 'appointment' in transcript.lower() and 'insurance' in transcript.lower(), transcript
            assert 'speaker_' not in transcript and 'Unidentified' not in transcript, transcript
            print('PASS: appointment-only dual-channel TwiML, unchanged claims recording, real named multichannel transcription and SQL persistence')
            print(transcript)
        finally:
            await db.rollback()
            for cid in ids:
                await db.execute(text('DELETE FROM appointment_calls WHERE call_id=:id'), {'id':cid})
                await db.execute(text('DELETE FROM calls WHERE id=:id'), {'id':cid})
            await db.commit()


asyncio.run(main())
