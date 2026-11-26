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
    cid = None
    try:
        async with engine.begin() as db:
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
            # Clearing remains supported for patients without appointments.
            async with engine.begin() as db:
                await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id': appointments[-1]})
            cleared = await client.patch(f'/patients/{patients[1]}', json={'phone': None})
            assert cleared.status_code == 200 and cleared.json()['phone'] is None, cleared.text
        print('PASS: all booking statuses sync; unrelated patients, slots and history preserved; unchanged phone preserves overrides; invalid/clear edits roll back; unlinked patient can clear')
    finally:
        async with engine.begin() as db:
            await db.execute(text('DELETE FROM appointment_calls WHERE call_id=:id'), {'id': cid})
            await db.execute(text('DELETE FROM calls WHERE id=:id'), {'id': cid})
            for aid in appointments:
                await db.execute(text('DELETE FROM appointments WHERE id=:id'), {'id': aid})
            for pid in patients:
                await db.execute(text("DELETE FROM audit_events WHERE resource_type='patient' AND resource_id=:id"), {'id': str(pid)})
                await db.execute(text('DELETE FROM patients WHERE id=:id'), {'id': pid})
        await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
