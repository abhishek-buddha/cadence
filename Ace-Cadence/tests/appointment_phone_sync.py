"""Run in the isolated review API: python /review-tests/appointment_phone_sync.py."""
import asyncio
import uuid
import httpx
from sqlalchemy import text
from common.db import engine
from app.config import settings


async def main():
    assert engine.url.database == 'cadence_review'
    assert not settings.twilio_account_sid, 'Never run against a dialing environment'
    patients, appointments = [], []
    session = uuid.uuid4().hex
    cid = None
    try:
        async with engine.begin() as db:
            await db.execute(text("""INSERT INTO sessions
                (session_token,user_id,user_email,user_role,user_name,created_at,expires_at)
                VALUES (:token,2,'phone-review@example.test','admin','Phone Review',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))"""), {'token': session})
            for _ in range(2):
                result = await db.execute(text("""INSERT INTO patients
                    (first_name,last_name,date_of_birth,member_id,phone)
                    VALUES ('Phone','Regression','1980-01-01',:member,'+12025550110')"""), {'member': uuid.uuid4().hex})
                patients.append(result.lastrowid)
            for pid, status in [(patients[0], s) for s in ('scheduled', 'rescheduled', 'cancelled')] + [(patients[1], 'scheduled')]:
                result = await db.execute(text("""INSERT INTO appointments
                    (patient_id,provider_id,patient_phone,appointment_type,scheduled_at,timezone,location,status)
                    VALUES (:pid,1,'+12025550111','Phone regression','2090-01-20 14:30','UTC','Review',:status)"""), {'pid': pid, 'status': status})
                appointments.append(result.lastrowid)
            cid = (await db.execute(text("""INSERT INTO calls(use_case,status,started_at,completed_at,transcript)
                VALUES ('appointment','completed',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'Preserve call history')"""))).lastrowid
            await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid': cid, 'aid': appointments[0]})

        async def snapshot():
            async with engine.connect() as db:
                patient = (await db.execute(text('SELECT phone,first_name FROM patients WHERE id=:id'), {'id': patients[0]})).mappings().one()
                rows = (await db.execute(text('SELECT id,patient_phone,status,scheduled_at FROM appointments WHERE patient_id IN (:p1,:p2) ORDER BY id'), {'p1': patients[0], 'p2': patients[1]})).mappings().all()
                call = (await db.execute(text('SELECT * FROM calls WHERE id=:id'), {'id': cid})).mappings().one()
                return dict(patient), [dict(row) for row in rows], dict(call)

        async with httpx.AsyncClient(base_url='http://master:8003', timeout=15) as client:
            path = f'/patients/{patients[0]}'
            original = await snapshot()
            # The UI submits phone even for edits to other patient fields.
            assert (await client.patch(path, json={'first_name': 'Updated', 'phone': '+12025550110'})).status_code == 200
            before = await snapshot()
            assert before[1:] == original[1:], 'Unchanged master phone must preserve appointment overrides'
            for value in ('invalid', None, ''):
                rejected = await client.patch(path, json={'first_name': 'Must roll back', 'phone': value})
                assert rejected.status_code == 422, rejected.text
                assert await snapshot() == before, 'Rejected phone edit must roll back every field'
            updated = await client.patch(path, json={'phone': ' +12025550112 '})
            assert updated.status_code == 200 and updated.json()['phone'] == '+12025550112', updated.text
            after = await snapshot()
            assert after[0]['phone'] == '+12025550112'
            expected = [{**row, 'patient_phone': '+12025550112'} for row in before[1][:3]] + before[1][3:]
            assert after[1] == expected, 'Only matching patient phones may change; preserve every booking status/slot'
            assert after[2] == before[2], 'Call history must remain unchanged'
            assert (await client.patch(path, json={'last_name': 'Updated'})).status_code == 200
            assert (await snapshot())[1:] == after[1:]
            async with httpx.AsyncClient(base_url='http://127.0.0.1:8004', headers={'Authorization': f'Bearer {session}'}, timeout=15) as api:
                body = dict(patient_id=patients[0], provider_id=1, patient_phone='+12025550113',
                            appointment_type='Phone regression', scheduled_at='2090-01-20T14:30', timezone='UTC', location='Review')
                for aid, status in zip(appointments[:3], ('scheduled', 'rescheduled', 'cancelled')):
                    response = await api.put(f'/appointments/{aid}', json={**body, 'status': status})
                    assert response.status_code == 200, response.text
                reverse = await snapshot()
                assert reverse[0]['phone'] == '+12025550113'
                assert all(row['patient_phone'] == '+12025550113' for row in reverse[1][:3])
                assert reverse[1][3:] == after[1][3:] and reverse[2] == after[2]
                assert [r['status'] for r in reverse[1]] == [r['status'] for r in after[1]]
                rejected = await api.put(f'/appointments/{appointments[0]}', json={**body, 'patient_phone': 'invalid'})
                assert rejected.status_code == 422 and await snapshot() == reverse
                async with engine.begin() as db:
                    await db.execute(text("UPDATE calls SET status='in_progress',completed_at=NULL WHERE id=:id"), {'id': cid})
                active = await snapshot()
                rejected = await api.put(f'/appointments/{appointments[0]}', json={**body, 'patient_phone': '+12025550114'})
                assert rejected.status_code == 409 and await snapshot() == active
                async with engine.begin() as db:
                    await db.execute(text('UPDATE calls SET status=:status,completed_at=:ended WHERE id=:id'), {'id': cid, 'status': reverse[2]['status'], 'ended': reverse[2]['completed_at']})
                # Concurrent writes from both screens must serialize to one number.
                for _ in range(5):
                    responses = await asyncio.gather(
                        client.patch(path, json={'phone': '+12025550115'}),
                        api.put(f'/appointments/{appointments[0]}', json={**body, 'patient_phone': '+12025550116'}))
                    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
                    concurrent = await snapshot()
                    assert all(row['patient_phone'] == concurrent[0]['phone'] for row in concurrent[1][:3])
                details = dict(first_name='Shared', last_name='Patient', date_of_birth='1981-02-03', member_id='SYNC-MEMBER',
                               group_number='SYNC-GROUP', policy_number='SYNC-POLICY', subscriber_name='Shared Subscriber', relationship='spouse')
                assert (await client.patch(path, json=details)).status_code == 200
                appointment = (await api.get(f'/appointments/{appointments[0]}')).json()
                assert appointment['patient_name'] == 'Shared Patient'
                assert all(appointment[key] == value for key, value in details.items() if key not in ('first_name', 'last_name'))
                created = await api.post('/appointments', json={**body, 'patient_phone': '+12025550117'})
                assert created.status_code == 201, created.text
                appointments.insert(3, created.json()['id'])
                new_snapshot = await snapshot()
                assert new_snapshot[0]['phone'] == '+12025550117'
                assert all(row['patient_phone'] == '+12025550117' for row in new_snapshot[1] if row['id'] != appointments[-1])
                # Reassigning an appointment changes only the newly selected patient's phone.
                moved = await api.put(f'/appointments/{appointments[3]}', json={**body, 'patient_id': patients[1], 'patient_phone': '+12025550118'})
                assert moved.status_code == 200, moved.text
                assert (await client.get(f'/patients/{patients[1]}')).json()['phone'] == '+12025550118'
                assert (await snapshot())[0]['phone'] == '+12025550117'
            # Clearing remains supported for patients without appointments.
            async with engine.begin() as db:
                await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id': appointments[-1]})
                await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id': appointments[3]})
            cleared = await client.patch(f'/patients/{patients[1]}', json={'phone': None})
            assert cleared.status_code == 200 and cleared.json()['phone'] is None, cleared.text
        print('PASS: two-way phone sync, all booking statuses, create/reassign, patient fields joined, concurrent saves, active/invalid rollback, unchanged history and unrelated patients, clearing rules')
    finally:
        async with engine.begin() as db:
            await db.execute(text('DELETE FROM appointment_calls WHERE call_id=:id'), {'id': cid})
            await db.execute(text('DELETE FROM calls WHERE id=:id'), {'id': cid})
            for aid in appointments:
                await db.execute(text("DELETE FROM audit_events WHERE resource_type='appointment' AND resource_id=:id"), {'id': str(aid)})
                await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id': aid})
            for pid in patients:
                await db.execute(text("DELETE FROM audit_events WHERE resource_type='patient' AND resource_id=:id"), {'id': str(pid)})
                await db.execute(text('DELETE FROM patients WHERE id=:id'), {'id': pid})
            await db.execute(text('DELETE FROM sessions WHERE session_token=:token'), {'token': session})
        await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
