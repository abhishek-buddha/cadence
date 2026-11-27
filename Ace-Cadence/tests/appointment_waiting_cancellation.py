"""Focused real-SQL tool check; no PSTN call or provider request."""
import asyncio
from starlette.requests import Request
from sqlalchemy import text
from common.db import AsyncSessionLocal, engine
from app.config import settings
from app.routers.appointments import tool, appointment, save, metadata, history, artifacts

async def main():
    assert engine.url.database == 'cadence_review' and not settings.twilio_account_sid
    aid = cid = None
    async with AsyncSessionLocal() as db:
        try:
            aid = (await db.execute(text("INSERT INTO appointments(patient_id,provider_id,patient_phone,appointment_type,scheduled_at,timezone,location,status) SELECT patient_id,provider_id,patient_phone,'Waiting cancellation review','2090-01-20 14:30','America/New_York',location,'scheduled' FROM appointments LIMIT 1"))).lastrowid
            await db.commit()
            record = await appointment(db, aid)
            fields = ('patient_id', 'provider_id', 'patient_phone', 'appointment_type', 'scheduled_at', 'timezone', 'location', 'status', 'notes', 'instructions')
            old_payload = {key: record[key] for key in fields}
            details = dict(doctor_name='Dr. Review', estimated_patient_cost='85.00', authorization_status='approved',
                           approved_visits=3, remaining_visits=2, authorization_valid_from='2090-01-01', authorization_valid_until='2090-12-31')
            saved = await save(db, {**old_payload, **details}, aid)
            assert saved['reminder_context']['prior_authorization']['applicable_to_appointment']
            saved = await save(db, old_payload, aid)
            assert saved['doctor_name'] == 'Dr. Review' and saved['estimated_patient_cost'] == 85
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
            assert verified['doctor_name'] == 'Dr. Review' and verified['prior_authorization']['remaining_visits'] == 2
            greeting = await metadata(request, cid, 'waiting-cancellation-review', db)
            assert greeting['dynamic_variables']['greeting'] in {'Good morning', 'Good afternoon', 'Good evening'}
            reschedule = await invoke('reschedule_appointment', {'scheduled_at':'2091-01-20T14:30', 'confirmed':False}, 2)
            changed = await invoke('reschedule_appointment', {'scheduled_at':'2091-01-20T14:30', 'confirmed':True, 'confirmation_id':reschedule['confirmation_id']}, 3)
            assert changed['status'] == 'rescheduled' and not changed['prior_authorization']['applicable_to_appointment']
            assert changed['prior_authorization']['remaining_visits'] == 2
            prepared = await invoke('cancel_appointment', {'confirmed':False}, 4)
            args = {'confirmation_id':prepared['confirmation_id'],'confirmed':True}
            assert (await invoke('cancel_appointment', args, 4))['status']=='confirmation_required'
            # Reproduce an operator reservation without contacting any operator.
            await db.execute(text("UPDATE calls SET handoff_state='awaiting_human',handoff_requested_at=UTC_TIMESTAMP() WHERE id=:id"), {'id':cid})
            await db.commit()
            waiting = await invoke('request_human', {'reason':'Patient asked for a person'}, 5)
            assert waiting['status']=='waiting_for_operator' and 'not connected' in waiting['message']
            repeated = await invoke('cancel_appointment', {**args,'confirmed':False}, 6)
            assert repeated['status']=='confirmation_required' and repeated['confirmation_id']==args['confirmation_id']
            assert (await db.execute(text('SELECT status FROM appointments WHERE id=:id'), {'id':aid})).scalar()=='rescheduled'
            assert (await invoke('cancel_appointment', args, 7))['status']=='cancelled'
            assert (await db.execute(text('SELECT status FROM appointments WHERE id=:id'), {'id':aid})).scalar()=='cancelled'
            assert (await db.execute(text('SELECT outcome FROM calls WHERE id=:id'), {'id':cid})).scalar()=='cancelled'
            await artifacts(request, {'callId':cid, 'token':'waiting-cancellation-review', 'failure_code':'agent_unavailable'}, db)
            calls = await history(aid, {}, db)
            assert 'voice agent could not start' in calls[0]['failure_reason']
            print('PASS: reminder fields round-trip, older edits preserve them, verified context and greeting, rescheduling rechecks approval without consuming visits, cancellation survives human request, failure explanation reaches history')
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
