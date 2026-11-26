"""Run in the isolated review container; all SQL changes are rolled back."""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import text
from common.db import AsyncSessionLocal, engine
from app.routers.twilio_compat import _close_call


async def main():
    assert engine.url.database == 'cadence_review'
    async with AsyncSessionLocal() as db:
        try:
            aid = (await db.execute(text('SELECT id FROM appointments ORDER BY id LIMIT 1'))).scalar_one()
            requested = datetime.utcnow()-timedelta(minutes=5)
            connected = requested+timedelta(minutes=1)

            async def pending(at=requested):
                await db.execute(text("UPDATE appointments SET callback_requested_at=:at,callback_reason='Callback regression check' WHERE id=:id"), {'at': at, 'id': aid})

            async def is_pending():
                return (await db.execute(text('SELECT callback_requested_at FROM appointments WHERE id=:id'), {'id': aid})).scalar() is not None

            async def new_call(use_case='appointment', state=None, did_connect=False):
                result = await db.execute(text("INSERT INTO calls(use_case,status,started_at,handoff_state,outcome) VALUES (:kind,'in_progress',:at,:state,'callback_needed')"), {'kind': use_case, 'at': requested, 'state': state})
                cid = result.lastrowid
                if use_case == 'appointment':
                    await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid': cid, 'aid': aid})
                if did_connect:
                    await db.execute(text("INSERT INTO call_events(call_id,type,timestamp) VALUES (:id,'handoff_connected',:at)"), {'id': cid, 'at': connected})
                return cid

            for state, did_connect, final in [(None, False, 'completed'), (None, False, 'no-answer'), ('awaiting_human', False, 'completed'), ('accepting', False, 'completed'), ('connected', True, 'failed')]:
                await pending()
                cid = await new_call(state=state, did_connect=did_connect)
                await _close_call(db, call_id=cid, twilio_status_value=final)
                assert await is_pending(), (state, did_connect, final)

            for state in ['connected', 'handoff_ended']:
                await pending()
                cid = await new_call(state=state, did_connect=True)
                assert await is_pending(), 'Joining alone must not clear the request'
                await _close_call(db, call_id=cid)
                assert not await is_pending(), 'Patient or operator hangup must clear a completed human callback'
                assert (await db.execute(text('SELECT callback_reason FROM appointments WHERE id=:id'), {'id': aid})).scalar() is None
                assert (await db.execute(text('SELECT outcome FROM calls WHERE id=:id'), {'id': cid})).scalar() == 'callback_needed', 'Preserve historical outcome'
                await _close_call(db, call_id=cid)
                assert (await db.execute(text("SELECT COUNT(*) FROM call_events WHERE call_id=:id AND type='callback_completed'"), {'id': cid})).scalar() == 1
                await pending(datetime.utcnow()+timedelta(seconds=1))
                await _close_call(db, call_id=cid)
                assert await is_pending(), 'Duplicate old callbacks must not clear a newer request'

            cid = await new_call(use_case='claim', state='connected', did_connect=True)
            await _close_call(db, call_id=cid)
            assert await is_pending(), 'Claims must not affect appointment callbacks'
            print('PASS: human completion clears callback; AI, unanswered, unconnected, failed and claim calls preserve it; repeat events preserve newer requests and history')
        finally:
            await db.rollback()


asyncio.run(main())
