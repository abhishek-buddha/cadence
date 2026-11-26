"""Create/finish synthetic calls for the real agent/bridge tests; never dial."""
import argparse
import asyncio
import json
from sqlalchemy import text
from common.db import engine
from app.config import settings


async def main(finish):
    assert engine.url.database == 'cadence_review' and not settings.twilio_account_sid
    async with engine.begin() as db:
        await db.execute(text("UPDATE calls SET status='completed',completed_at=UTC_TIMESTAMP() WHERE handoff_token='review-voice-token' AND completed_at IS NULL"))
        if finish:
            return
        result = await db.execute(text("""INSERT INTO appointments(patient_id,provider_id,patient_phone,appointment_type,scheduled_at,timezone,location)
            VALUES(1,1,'+14155550123','Agent booking review','2027-01-15 10:30:00','America/New_York','Review clinic')"""))
        aid = result.lastrowid
        result = await db.execute(text("INSERT INTO calls(use_case,status,started_at,handoff_token) VALUES('appointment','in_progress',UTC_TIMESTAMP(),'review-voice-token')"))
        cid = result.lastrowid
        await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id) VALUES (:cid,:aid)'), {'cid':cid,'aid':aid})
        print(json.dumps({'appointment_id': aid, 'call_id': cid}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--finish', action='store_true')
    asyncio.run(main(parser.parse_args().finish))
