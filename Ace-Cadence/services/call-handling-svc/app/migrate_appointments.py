"""Explicit, repeatable appointment migration. Preserves records and call history."""
import argparse
import asyncio
from pathlib import Path
from sqlalchemy import text
from common.db import engine
from .config import settings


async def migrate(path: Path, apply: bool):
    if not settings.appointments_enabled:
        print('Appointments disabled; migration skipped.')
        return
    async with engine.connect() as db:
        locked = (await db.execute(text("SELECT GET_LOCK('cadence_appointments_migration',30)"))).scalar()
        if locked != 1:
            raise RuntimeError('Another appointment migration is running')
        try:
            columns = (await db.execute(text("SELECT IS_NULLABLE,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='calls' AND COLUMN_NAME='insurance_contact_id'"))).first()
            if not columns or columns[1] != 'bigint':
                raise RuntimeError('Unexpected calls.insurance_contact_id schema; manual review required')
            tables = set((await db.execute(text("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()"))).scalars())
            phone = (await db.execute(text("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patients' AND COLUMN_NAME='phone'"))).scalar()
            if phone and phone != 'varchar(20)':
                raise RuntimeError('Unexpected patients.phone schema; manual review required')
            extra = dict((await db.execute(text("SELECT COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointments' AND COLUMN_NAME IN ('confirmed_at','original_scheduled_at','original_timezone')"))).all())
            expected = {'confirmed_at': 'datetime', 'original_scheduled_at': 'datetime', 'original_timezone': 'varchar(64)'}
            if any(extra[key] != expected[key] for key in extra):
                raise RuntimeError('Unexpected appointment date schema; manual review required')
            booking_change = (await db.execute(text("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='appointment_calls' AND COLUMN_NAME='pending_booking_change'"))).scalar()
            if booking_change and booking_change != 'json':
                raise RuntimeError('Unexpected booking confirmation schema; manual review required')
            pending = not {'appointments', 'appointment_calls'} <= tables or columns[0] != 'YES' or not phone or extra != expected or not booking_change
            if not apply:
                print('Appointment migration pending.' if pending else 'Appointment migration already applied.')
                return
            statements = [s.strip() for s in path.read_text(encoding='utf-8').split(';') if s.strip()]
            for statement in statements:
                if statement.startswith('ALTER TABLE calls') and columns[0] == 'YES':
                    continue
                if statement.startswith('ALTER TABLE patients') and phone:
                    continue
                if statement.startswith('ALTER TABLE appointments ADD COLUMN') and statement.split()[5] in extra:
                    continue
                if statement.startswith('ALTER TABLE appointment_calls ADD COLUMN') and booking_change:
                    continue
                await db.execute(text(statement))
            # Preserve attendance recorded by the earlier confirmation-only preview.
            await db.execute(text("UPDATE appointments SET confirmed_at=COALESCE(confirmed_at,updated_at),status='scheduled' WHERE status='confirmed'"))
            await db.commit()
            print('Appointment migration applied; existing records preserved.')
        finally:
            await db.execute(text("SELECT RELEASE_LOCK('cadence_appointments_migration')"))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--sql', type=Path, default=Path('/migrations/001_appointments.sql'))
    args = parser.parse_args()
    asyncio.run(migrate(args.sql, args.apply))
