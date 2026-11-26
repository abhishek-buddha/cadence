"""Run inside isolated review api container, never against the production DB."""
import asyncio
import base64
import hashlib
import hmac
from datetime import datetime, timedelta
from pathlib import Path
import httpx
from sqlalchemy import text
from common.db import engine
from app.migrate_appointments import migrate
from app.routers.twilio_compat import _close_call


async def main():
    assert engine.url.database == 'cadence_review', 'Only the disposable review database is allowed'
    async with engine.begin() as db:
        for statement in Path('/review-db/schema.sql').read_text().split(';'):
            if statement.strip():
                await db.execute(text(statement))
    await migrate(Path('/review-db/migrations/001_appointments.sql'), True)
    await migrate(Path('/review-db/migrations/001_appointments.sql'), True)
    async with engine.begin() as db:
        await db.execute(text("UPDATE call_settings SET value='' WHERE `key` LIKE 'appointmentOperator:%'"))
        await db.execute(text("UPDATE calls SET status='completed',completed_at=UTC_TIMESTAMP(),handoff_state=IF(handoff_state IS NULL,NULL,'handoff_ended'),wrap_up_completed_at=UTC_TIMESTAMP() WHERE handoff_token IN ('review-call-token','review-concurrent-token') AND completed_at IS NULL"))
        await db.execute(text("INSERT INTO users (id,email,name,role,status) VALUES (1,'review@example.test','Review Operator','operator','active') ON DUPLICATE KEY UPDATE name=VALUES(name)"))
        await db.execute(text("INSERT INTO patients (id,first_name,last_name,date_of_birth,member_id) VALUES (1,'Review','Patient','1980-02-03','REVIEW-1') ON DUPLICATE KEY UPDATE first_name=VALUES(first_name)"))
        await db.execute(text("INSERT INTO providers (id,practice_name,npi,tax_id,address,phone) VALUES (1,'Review Clinic','1234567890','123456789','Review address','+14155550100') ON DUPLICATE KEY UPDATE practice_name=VALUES(practice_name)"))
        await db.execute(text("INSERT INTO sessions (session_token,user_id,user_email,user_role,user_name,created_at,expires_at) VALUES ('review-session',1,'review@example.test','operator','Review Operator',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)"))
        await db.execute(text("INSERT INTO users (id,email,name,role,status) VALUES (2,'admin@example.test','Review Admin','admin','active') ON DUPLICATE KEY UPDATE name=VALUES(name)"))
        await db.execute(text("INSERT INTO sessions (session_token,user_id,user_email,user_role,user_name,created_at,expires_at) VALUES ('review-admin-session',2,'admin@example.test','admin','Review Admin',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)"))
    async with httpx.AsyncClient(base_url='http://master:8003', timeout=15) as master:
        assert (await master.patch('/patients/1',json={'phone':'555-0123'})).status_code==422
        updated = await master.patch('/patients/1',json={'phone':'+14155550123'})
        assert updated.status_code==200, updated.text
        assert updated.json()['phone']=='+14155550123' and updated.json()['member_id']=='REVIEW-1'
        assert (await master.patch('/patients/1',json={'phone':None})).json()['phone'] is None
        assert (await master.patch('/patients/1',json={'phone':'+14155550123'})).status_code==200
    async with httpx.AsyncClient(base_url='http://127.0.0.1:8004', timeout=15) as client:
        assert (await client.get('/appointments')).status_code == 403
        client.headers['Authorization'] = 'Bearer review-session'
        body = dict(patient_id=1,provider_id=1,patient_phone='+14155550123',appointment_type='Checkup',scheduled_at='2027-01-15T10:30',timezone='America/New_York',location='Review clinic',instructions='Bring your existing paperwork.',notes='Internal note')
        invalid = await client.post('/appointments', json={**body,'patient_phone':'555-0123'})
        assert invalid.status_code == 422, invalid.text
        response = await client.post('/appointments', json=body)
        assert response.status_code == 201, response.text
        appointment = response.json()
        aid = appointment['id']
        assert appointment['patient_name'] == 'Review Patient'
        assert (await client.put(f'/appointments/{aid}', json={**body,'location':'Updated clinic'})).status_code == 200
        assert (await client.post(f'/appointments/{aid}/calls')).status_code == 503, 'Test environment must not place phone calls'
        async with engine.begin() as db:
            result = await db.execute(text("INSERT INTO calls (use_case,status,started_at,handoff_token) VALUES ('appointment','in_progress',UTC_TIMESTAMP(),'review-call-token')"))
            cid = result.lastrowid
            await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid':cid,'aid':aid})
        assert (await client.put(f'/appointments/{aid}', json=body)).status_code == 409
        assert all(c['id'] != cid for c in (await client.get('/calls')).json()), 'Appointment calls must not change claim reports'
        assert (await client.get(f'/appointments/{aid}/calls')).json()[0]['id'] == cid
        call_body = {'callId':cid,'token':'review-call-token'}
        bridge_headers = {'Authorization':'Bearer review-bridge-secret'}
        async def tool(name, arguments=None, patient_turn=1):
            return await client.post('/appointment-voice/tool', json={**call_body,'name':name,'arguments':arguments or {},'patient_turn':patient_turn}, headers=bridge_headers)
        assert (await tool('confirm_appointment')).status_code == 403
        assert (await tool('reschedule_appointment', {'scheduled_at':'2090-01-20T14:30','confirmed':True})).status_code == 403
        assert (await tool('cancel_appointment', {'confirmed':True})).status_code == 403
        assert (await tool('verify_patient',{'date_of_birth':'1981-02-03'})).json()['verified'] is False
        verified = (await tool('verify_patient',{'date_of_birth':'1980-02-03'})).json()
        assert verified['verified'] and verified['location']=='Updated clinic'
        assert 'date_of_birth' not in verified and 'notes' not in verified
        assert (await tool('confirm_appointment')).json()['status']=='confirmed'
        confirmed = (await client.get(f'/appointments/{aid}')).json()
        assert confirmed['status']=='scheduled' and confirmed['confirmed_at']
        assert (await tool('cancel_appointment', {'confirmed':False})).json()['status']=='confirmation_required'
        assert (await tool('reschedule_appointment', {'scheduled_at':'2090-01-20T14:30','confirmed':'true'})).json()['status']=='confirmation_required'
        assert (await tool('reschedule_appointment', {'scheduled_at':'2000-01-20T14:30','confirmed':True})).json()['status']=='clarification_required'
        prepared = (await tool('reschedule_appointment', {'scheduled_at':'2090-01-20T14:30','confirmed':True})).json()
        assert prepared['status']=='confirmation_required', 'Even an eager agent cannot skip preparation'
        commit = {'scheduled_at':'2090-01-20T14:30','confirmed':True,'confirmation_id':prepared['confirmation_id']}
        assert (await tool('reschedule_appointment', commit)).json()['status']=='confirmation_required', 'A new patient turn is required'
        assert (await client.get(f'/appointments/{aid}')).json()['scheduled_at']==confirmed['scheduled_at']
        assert (await tool('reschedule_appointment', commit, patient_turn=2)).json()['status']=='rescheduled'
        changed = (await client.get(f'/appointments/{aid}')).json()
        assert changed['status']=='rescheduled' and changed['scheduled_at'].startswith('2090-01-20T14:30')
        assert changed['original_scheduled_at']==confirmed['scheduled_at'] and changed['confirmed_at']
        assert (await tool('confirm_appointment')).json()['status']=='confirmed'
        assert (await client.get(f'/appointments/{aid}')).json()['status']=='rescheduled', 'Attendance must not erase the rescheduled tag'
        prepared = (await tool('cancel_appointment', {'confirmed':False}, patient_turn=3)).json()
        assert prepared['status']=='confirmation_required'
        assert (await tool('cancel_appointment', {'confirmed':False,'confirmation_id':prepared['confirmation_id']}, patient_turn=4)).json()['status']=='unchanged'
        assert (await client.get(f'/appointments/{aid}')).json()['status']=='rescheduled'
        prepared = (await tool('cancel_appointment', {'confirmed':False}, patient_turn=5)).json()
        assert (await tool('cancel_appointment', {'confirmed':True,'confirmation_id':prepared['confirmation_id']}, patient_turn=6)).json()['status']=='cancelled'
        cancelled = (await client.get(f'/appointments/{aid}')).json()
        assert cancelled['status']=='cancelled' and not cancelled['confirmed_at']
        assert (await tool('confirm_appointment')).status_code==409
        assert (await tool('reschedule_appointment', {'scheduled_at':'2090-01-21T14:30','confirmed':True})).json()['status']=='cancelled'
        call = (await client.get(f'/appointments/{aid}/calls')).json()[0]
        assert call['handoff_state'] is None and call['outcome']=='cancelled', 'Booking changes must not request an operator'
        assert any(e['type']=='reschedule_appointment' and '2090-01-20T14:30' in e['message'] for e in call['booking_changes'])
        listed = next(a for a in (await client.get('/appointments')).json() if a['id']==aid)
        assert listed['status']=='cancelled' and listed['call_attempts']==1 and listed['last_outcome']=='cancelled'
        assert (await tool('request_human',{'reason':'Clinical question'})).json()['status']=='no_operator'
        assert (await tool('request_callback',{'reason':'Please help with a clinical question'})).json()['status']=='callback_recorded'
        assert (await client.get(f'/appointments/{aid}')).json()['callback_requested_at']
        assert (await client.post('/appointments/operators/presence',json={'ready':True})).status_code==200
        assert (await tool('request_human',{'reason':'Patient question'})).json()['status']=='waiting_for_operator'
        handoff = (await client.get(f'/handoff/{cid}')).json()['call']
        assert handoff['patient_first_name']=='Review' and handoff['appointment']['id']==aid
        for _ in range(2):
            assert (await client.post(f'/handoff/{cid}/accept',json={'agent_user_id':1})).json()['ok']
        assert (await tool('cancel_appointment', {'confirmed':True})).status_code==409, 'Agent must not change bookings during takeover'
        assert (await client.post('/appointment-voice/artifacts',json={**call_body,'transcript':'Agent: Hello\nPatient: Hello'},headers=bridge_headers)).status_code==200
        assert (await client.get(f'/calls/{cid}')).json()['status']=='in_progress', 'Ending AI stream must not end human call'
        assert (await client.post(f'/appointments/calls/{cid}/release')).status_code==200
        assert (await client.post(f'/appointments/{aid}/complete-callback')).status_code==200
        path = f'/appointment-voice/status?callId={cid}&token=review-call-token'
        form = {'CallSid':'CA'+'0'*32,'CallStatus':'no-answer'}
        assert (await client.post(path,data=form)).status_code==403
        payload = 'http://127.0.0.1:18080'+path+''.join(k+form[k] for k in sorted(form))
        signature = base64.b64encode(hmac.new(b'review-signature-token',payload.encode(),hashlib.sha1).digest()).decode()
        assert (await client.post(path,data=form,headers={'X-Twilio-Signature':signature})).status_code==200
        ended = (await client.get(f'/calls/{cid}')).json()
        assert ended['status']=='no_answer' and ended['twilio_call_sid']==form['CallSid'], 'Preserve No Answer without changing the booking status'
        listed = next(a for a in (await client.get('/appointments')).json() if a['id']==aid)
        assert listed['last_call_status']=='no_answer' and listed['status']=='cancelled'
        async with engine.begin() as db:
            legacy = await db.execute(text("INSERT INTO calls(use_case,status,started_at) VALUES ('claim','in_progress',UTC_TIMESTAMP())"))
            await _close_call(db, call_id=legacy.lastrowid, twilio_status_value='no-answer')
            assert (await db.execute(text('SELECT status FROM calls WHERE id=:id'), {'id':legacy.lastrowid})).scalar()=='failed', 'Keep existing claims semantics'
        missed = (await client.post('/appointments', json={**body, 'appointment_type':'Unanswered reminder review'})).json()
        async with engine.begin() as db:
            missed_call = await db.execute(text("INSERT INTO calls(use_case,status,started_at) VALUES ('appointment','in_progress',UTC_TIMESTAMP())"))
            await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid':missed_call.lastrowid,'aid':missed['id']})
            await _close_call(db, call_id=missed_call.lastrowid, twilio_status_value='no-answer')
        assert (await tool('cancel_appointment', {'confirmed':True})).status_code==409
        # Preserve an ended synthetic call for browser history verification.
        async with engine.begin() as db:
            await db.execute(text("UPDATE calls SET status='completed',completed_at=UTC_TIMESTAMP(),handoff_state='handoff_ended',wrap_up_completed_at=UTC_TIMESTAMP() WHERE id=:id"),{'id':cid})
        for _ in range(5):
            async with engine.begin() as db:
                concurrent_ids = []
                for _ in range(2):
                    result = await db.execute(text("INSERT INTO calls(use_case,status,started_at,handoff_token) VALUES ('appointment','in_progress',UTC_TIMESTAMP(),'review-concurrent-token')"))
                    concurrent_ids.append(result.lastrowid)
                    await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid':result.lastrowid,'aid':aid})
            responses = await asyncio.gather(*[client.post('/appointment-voice/tool', headers=bridge_headers,
                json={'callId':call_id,'token':'review-concurrent-token','name':'request_human','arguments':{'reason':'Concurrent review'}}) for call_id in concurrent_ids])
            assert all(r.status_code==200 for r in responses), [r.text for r in responses]
            assert sorted(r.json()['status'] for r in responses)==['no_operator','waiting_for_operator'], 'Two simultaneous requests must not reserve the same operator'
            async with engine.begin() as db:
                for call_id in concurrent_ids:
                    await db.execute(text("UPDATE calls SET status='completed',completed_at=UTC_TIMESTAMP(),handoff_state='handoff_ended',wrap_up_completed_at=UTC_TIMESTAMP() WHERE id=:id"), {'id':call_id})
        print('PASS: migration rerun, phone/CRUD/auth, verified confirmation/reschedule/cancel, booking history, No Answer tag, unchanged claims outcome, callback/concurrent routing/takeover, signed callback, lifecycle and report isolation')
        print('Browser review appointment:',aid)


asyncio.run(main())
