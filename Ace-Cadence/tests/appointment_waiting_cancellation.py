"""Focused real-SQL tool check; no PSTN call or provider request."""
import asyncio
from starlette.requests import Request
from sqlalchemy import text
from common.db import AsyncSessionLocal, engine
from app.config import settings
from app.routers.appointments import tool

async def main():
    assert engine.url.database == 'cadence_review' and not settings.twilio_account_sid
    aid = cid = None
    async with AsyncSessionLocal() as db:
        try:
            aid = (await db.execute(text("INSERT INTO appointments(patient_id,provider_id,patient_phone,appointment_type,scheduled_at,timezone,location,status) SELECT patient_id,provider_id,patient_phone,'Waiting cancellation review','2090-01-20 14:30','America/New_York',location,'scheduled' FROM appointments LIMIT 1"))).lastrowid
            cid = (await db.execute(text("INSERT INTO calls(use_case,status,started_at,handoff_token) VALUES('appointment','in_progress',UTC_TIMESTAMP(),'waiting-cancellation-review')"))).lastrowid
            await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES(:cid,:aid)'), {'cid':cid,'aid':aid})
            await db.commit()
            request = Request({'type':'http','headers':[(b'authorization', ('Bearer '+settings.appointment_bridge_secret).encode())]})
            async def invoke(name, args, turn=1):
                return await tool(request, {'callId':cid,'token':'waiting-cancellation-review','name':name,'arguments':args,'patient_turn':turn}, db)
            for invalid in (False, 'true', None):
                assert not (await invoke('verify_patient', {'is_intended_patient':invalid}))['verified']
            verified = await invoke('verify_patient', {'is_intended_patient':True})
            assert verified['verified'] and 'date_of_birth' not in verified and 'notes' not in verified
            prepared = await invoke('cancel_appointment', {'confirmed':False}, 2)
            args = {'confirmation_id':prepared['confirmation_id'],'confirmed':True}
            assert (await invoke('cancel_appointment', args, 2))['status']=='confirmation_required'
            # Reproduce an operator reservation without contacting any operator.
            await db.execute(text("UPDATE calls SET handoff_state='awaiting_human',handoff_requested_at=UTC_TIMESTAMP() WHERE id=:id"), {'id':cid})
            await db.commit()
            waiting = await invoke('request_human', {'reason':'Patient asked for a person'}, 3)
            assert waiting['status']=='waiting_for_operator' and 'not connected' in waiting['message']
            repeated = await invoke('cancel_appointment', {**args,'confirmed':False}, 4)
            assert repeated['status']=='confirmation_required' and repeated['confirmation_id']==args['confirmation_id']
            assert (await db.execute(text('SELECT status FROM appointments WHERE id=:id'), {'id':aid})).scalar()=='scheduled'
            assert (await invoke('cancel_appointment', args, 5))['status']=='cancelled'
            assert (await db.execute(text('SELECT status FROM appointments WHERE id=:id'), {'id':aid})).scalar()=='cancelled'
            assert (await db.execute(text('SELECT outcome FROM calls WHERE id=:id'), {'id':cid})).scalar()=='cancelled'
            print('PASS: named-patient confirmation without DOB; repeated cancellation survives human request; explicit confirmation updates SQL immediately')
        finally:
            await db.rollback()
            if cid:
                await db.execute(text('DELETE FROM call_events WHERE call_id=:id'), {'id':cid})
                await db.execute(text('DELETE FROM appointment_calls WHERE call_id=:id'), {'id':cid})
                await db.execute(text('DELETE FROM calls WHERE id=:id'), {'id':cid})
            if aid:
                await db.execute(text("DELETE FROM audit_events WHERE resource_type='appointment' AND resource_id=:id"), {'id':str(aid)})
                await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id':aid})
            await db.commit()

asyncio.run(main())
