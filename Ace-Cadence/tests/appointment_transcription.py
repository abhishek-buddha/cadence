"""Real ElevenLabs + SQL review: pass synthetic audio path and API key on stdin."""
import asyncio
from pathlib import Path
import sys
import httpx
from sqlalchemy import text
from common.db import AsyncSessionLocal, engine
from app.config import settings
from app.appointment_recordings import save_transcription, transcribe


async def main():
    assert engine.url.database == 'cadence_review', 'Only the disposable review database is allowed'
    assert not settings.twilio_account_sid, 'No real dialing credentials allowed in review'
    settings.elevenlabs_api_key = sys.stdin.read().strip()
    assert settings.elevenlabs_api_key, 'Provide the ElevenLabs key on stdin'
    audio = Path(sys.argv[1]).read_bytes()
    async with AsyncSessionLocal() as db:
        result = await db.execute(text("""INSERT INTO calls
            (use_case,status,started_at,completed_at,handoff_state,transcript,human_recording_path)
            VALUES ('appointment','completed',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'handoff_ended',
                    'Agent: Synthetic review before operator takeover.', 'review-recording')"""))
        call_id = result.lastrowid
        await db.execute(text("""INSERT INTO appointment_calls(call_id,appointment_id,transcription_error)
            VALUES (:id,1,'Previous transcription failed')"""), {'id':call_id})
        await db.commit()
        # Invalid media must preserve the recording and provide a retryable error.
        await transcribe(call_id)
        row = (await db.execute(text('SELECT human_recording_path FROM calls WHERE id=:id'), {'id':call_id})).scalar_one()
        assert row == 'review-recording'
        assert (await db.execute(text('SELECT transcription_error FROM appointment_calls WHERE call_id=:id'), {'id':call_id})).scalar_one().startswith('Could not transcribe')
        await db.commit()
        await save_transcription(db, call_id, audio)
        row = (await db.execute(text('SELECT human_transcript,transcript,status FROM calls WHERE id=:id'), {'id':call_id})).mappings().one()
        transcript = row['human_transcript']
        for phrase in ('insurance card', 'identification', 'appointment'):
            assert phrase in transcript.lower(), (phrase, transcript)
        assert len({line.split(':', 1)[0] for line in transcript.splitlines()}) >= 2, transcript
        assert row['transcript'] == 'Agent: Synthetic review before operator takeover.'
        assert row['status'] == 'completed'
        assert (await db.execute(text('SELECT transcription_error FROM appointment_calls WHERE call_id=:id'), {'id':call_id})).scalar_one() is None
        # No actual Twilio recording exists for this synthetic fixture.
        await db.execute(text('UPDATE calls SET human_recording_path=NULL WHERE id=:id'), {'id':call_id})
        await db.commit()
    await transcribe(call_id)  # Existing transcript must skip download/provider billing.
    async with httpx.AsyncClient(base_url='http://127.0.0.1:8004', headers={'Authorization':'Bearer review-session'}) as client:
        response = await client.get('/appointments/1/calls')
        response.raise_for_status()
        saved = next(call for call in response.json() if call['id'] == call_id)
        assert saved['human_transcript'] == transcript and saved['transcription_error'] is None
    print('PASS: real two-speaker ElevenLabs transcription, SQL persistence, error clearing, agent transcript preservation, duplicate skip, and history API')
    print('REVIEW_TRANSCRIPT_CALL_ID=' + str(call_id))


asyncio.run(main())
