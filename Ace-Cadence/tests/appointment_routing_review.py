"""Real SQL routing check; all changes are rolled back in the isolated review DB."""
import asyncio
from datetime import timedelta

from sqlalchemy import text
from common.db import AsyncSessionLocal, engine
from common.serialize import row_to_dict
from app.routers.appointments import now, operator_candidates, request_operator


async def main():
    assert engine.url.database == 'cadence_review'
    async with AsyncSessionLocal() as db:
        try:
            await db.execute(text("UPDATE users SET status='disabled' WHERE role='operator'"))
            ids = []
            for name, role, status in [('B Routing', 'operator', 'active'), ('A Routing', 'operator', 'active'), ('0 Admin', 'admin', 'active'), ('0 Disabled', 'operator', 'disabled')]:
                result = await db.execute(text('INSERT INTO users(email,name,role,status) VALUES (:email,:name,:role,:status)'),
                                          dict(email=name.replace(' ', '')+'@routing.example.test', name=name, role=role, status=status))
                ids.append(result.lastrowid)
            candidates = await operator_candidates(db)
            assert [u['id'] for u in candidates] == [ids[1], ids[0]], 'Match claims ordering; exclude admins and disabled users'

            async def new_call():
                result = await db.execute(text("INSERT INTO calls(use_case,status,started_at) VALUES ('appointment','in_progress',UTC_TIMESTAMP())"))
                return row_to_dict((await db.execute(text('SELECT * FROM calls WHERE id=:id'), {'id': result.lastrowid})).first())

            first = await new_call()
            assert (await request_operator(db, first, 'Patient requests a human', candidates))['status'] == 'waiting_for_operator'
            assigned = row_to_dict((await db.execute(text('SELECT * FROM calls WHERE id=:id'), {'id': first['id']})).first())
            assert assigned['assigned_agent_user_id'] == ids[1], 'Missing heartbeat must not reject an available operator'
            await db.execute(text("UPDATE calls SET status='completed',completed_at=UTC_TIMESTAMP(),handoff_state='handoff_ended' WHERE id=:id"), {'id': first['id']})
            second = await new_call()
            assert (await request_operator(db, second, 'Next patient', candidates))['status'] == 'waiting_for_operator'
            assert (await db.execute(text('SELECT assigned_agent_user_id FROM calls WHERE id=:id'), {'id': second['id']})).scalar() == ids[0], 'Skip operators in wrap-up'
            third = await new_call()
            assert (await request_operator(db, third, 'All busy', candidates))['status'] == 'no_operator'
            waiting = row_to_dict((await db.execute(text('SELECT * FROM calls WHERE id=:id'), {'id': second['id']})).first())
            waiting['handoff_requested_at'] = (now()-timedelta(seconds=61)).isoformat()
            assert (await request_operator(db, waiting, 'No answer', candidates))['status'] == 'no_operator'
            assert (await db.execute(text('SELECT assigned_agent_user_id FROM calls WHERE id=:id'), {'id': second['id']})).scalar() is None
            assert (await request_operator(db, third, 'Manual takeover', candidates, ids[0]))['status'] == 'no_operator', 'Manual takeover still requires browser readiness'
            await db.execute(text('INSERT INTO call_settings (`key`,value) VALUES (:key,:value)'), {'key': 'appointmentOperator:'+str(ids[0]), 'value': now().isoformat()})
            assert (await request_operator(db, third, 'Manual takeover', candidates, ids[0]))['status'] == 'waiting_for_operator'
            print('PASS: assignment without heartbeat, claims ordering, admin/disabled exclusion, busy/wrap-up exclusion, unanswered fallback and manual readiness')
        finally:
            await db.rollback()


asyncio.run(main())
