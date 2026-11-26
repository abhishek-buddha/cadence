"""Exercise inline status updates over HTTP against isolated review SQL only."""
import asyncio
import httpx
from sqlalchemy import text
from common.db import engine


async def main():
    assert engine.url.database == 'cadence_review'
    async with engine.begin() as db:
        result = await db.execute(text('''INSERT INTO appointments
            (patient_id,provider_id,patient_phone,appointment_type,scheduled_at,timezone,location)
            SELECT patient_id,provider_id,patient_phone,'Inline status review',scheduled_at,timezone,location
            FROM appointments ORDER BY id LIMIT 1'''))
        aid = result.lastrowid
    cids = []
    try:
        async with httpx.AsyncClient(base_url='http://127.0.0.1:8004', timeout=15) as client:
            path = f'/appointments/{aid}/status'
            assert (await client.patch(path, json={'field':'call_status','value':'completed'})).status_code == 403
            client.headers['Authorization'] = 'Bearer review-admin-session'
            original = (await client.get(f'/appointments/{aid}')).json()
            for field, values in [('appointment_status', ['rescheduled','cancelled','scheduled']),
                                  ('call_status', ['callback_needed','completed','no_answer','failed','not_called'])]:
                for value in values:
                    response = await client.patch(path, json={'field':field,'value':value})
                    assert response.status_code == 200, response.text
                    row = response.json()
                    assert row['scheduled_at'] == original['scheduled_at']
                    if field == 'appointment_status':
                        assert row['status'] == value
                    else:
                        assert row['call_status_override'] == (None if value == 'callback_needed' else value)
                        assert bool(row['callback_requested_at']) == (value == 'callback_needed')
                    assert (await client.get(f'/appointments/{aid}/calls')).json() == [], 'Tags must not fabricate calls'
            for field, value in [('call_status','in_progress'),('call_status','invalid'),('call_status',[]),('patient_phone','completed')]:
                assert (await client.patch(path,json={'field':field,'value':value})).status_code == 422
            async with engine.begin() as db:
                result = await db.execute(text("INSERT INTO calls(use_case,status,started_at,completed_at,outcome,transcript) VALUES ('appointment','completed',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'confirmed','Preserved transcript')"))
                cid = result.lastrowid
                cids.append(cid)
                await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid':cid,'aid':aid})
            before = (await client.get(f'/appointments/{aid}/calls')).json()
            assert (await client.patch(path,json={'field':'call_status','value':'failed'})).status_code == 200
            assert (await client.get(f'/appointments/{aid}/calls')).json() == before
            async with engine.begin() as db:
                await db.execute(text("UPDATE calls SET status='in_progress',completed_at=NULL WHERE id=:id"), {'id':cid})
            for field, value in [('call_status','completed'),('appointment_status','cancelled')]:
                assert (await client.patch(path,json={'field':field,'value':value})).status_code == 409
            async with engine.connect() as db:
                assert (await db.execute(text("SELECT COUNT(*) FROM audit_events WHERE resource_type='appointment' AND resource_id=:id AND payload_summary LIKE 'Manual %'"), {'id':str(aid)})).scalar() == 9
            print('PASS: all editable statuses, auth/invalid/active guards, unchanged dates and call history, no fabricated calls, audit logging')
    finally:
        async with engine.begin() as db:
            await db.execute(text('DELETE FROM appointment_calls WHERE appointment_id=:id'), {'id':aid})
            for cid in cids:
                await db.execute(text('DELETE FROM calls WHERE id=:id'), {'id':cid})
            await db.execute(text("DELETE FROM audit_events WHERE resource_type='appointment' AND resource_id=:id"), {'id':str(aid)})
            await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id':aid})


asyncio.run(main())
