"""Replace isolated review appointments with realistic synthetic UI examples; never dial."""
import argparse
import asyncio
import json
from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy import text
from common.db import engine
from app.config import settings


SAMPLES = [
    ('Maria', 'Alvarez', '1985-04-12', 0, 'New patient visit', 'scheduled', 'completed', 'confirmed', 1, '09:00'),
    ('James', 'Carter', '1972-09-08', 1, 'Follow-up', 'rescheduled', 'completed', 'rescheduled', 1, '14:30'),
    ('Priya', 'Shah', '1991-01-23', 0, 'Cleaning', 'scheduled', None, None, 0, '10:15'),
    ('Robert', 'Chen', '1968-11-05', 2, 'Annual checkup', 'scheduled', 'no_answer', None, 2, '11:00'),
    ('Sofia', 'Martinez', '1993-06-17', 0, 'Consultation', 'cancelled', 'completed', 'cancelled', 1, '15:45'),
    ('David', 'Thompson', '1980-03-29', 1, 'Follow-up', 'scheduled', 'completed', 'callback_needed', 1, '13:00'),
    ('Aisha', 'Khan', '1988-08-14', 2, 'New patient visit', 'scheduled', None, None, 0, '09:30'),
    ('Michael', 'Reed', '1975-12-02', 0, 'Cleaning', 'scheduled', 'failed', None, 1, '16:00'),
    ('Olivia', 'Bennett', '1996-02-20', 1, 'Consultation', 'rescheduled', 'completed', 'rescheduled', 2, '11:45'),
    ('Daniel', 'Kim', '1983-07-09', 2, 'Annual checkup', 'scheduled', 'no_answer', None, 1, '14:15'),
]
CLINICS = [('Dr. Whitfield Dental Group', 'Suite 210', 'Dentistry'),
           ('Lakeside Family Practice', 'Building B, Room 104', 'Family Medicine'),
           ('Oakwood Medical Center', 'Suite 305', 'Primary Care')]


async def main(args):
    assert engine.url.database == 'cadence_review' and not settings.twilio_account_sid, 'Review DB without dialing credentials only'
    async with engine.begin() as db:
        appointments = [dict(r) for r in (await db.execute(text('SELECT * FROM appointments ORDER BY id'))).mappings()]
        links = [dict(r) for r in (await db.execute(text('SELECT * FROM appointment_calls ORDER BY call_id'))).mappings()]
        assert not (await db.execute(text("SELECT COUNT(*) FROM calls WHERE use_case='appointment' AND completed_at IS NULL"))).scalar(), 'Finish review calls first'
        snapshot = json.loads(json.dumps({'appointments': appointments, 'appointment_calls': links}, default=str))
        if args.archive:
            # Retain real-agent test artifacts alongside the old appointment links.
            snapshot['calls'] = [dict(r) for r in (await db.execute(text("SELECT * FROM calls WHERE use_case='appointment' ORDER BY id"))).mappings()]
            snapshot['call_events'] = [dict(r) for r in (await db.execute(text("SELECT e.* FROM call_events e JOIN calls c ON c.id=e.call_id WHERE c.use_case='appointment'"))).mappings()]
            with Path(args.archive).open('x', encoding='utf-8') as archive:
                json.dump(snapshot, archive, default=str, indent=2)
            print(f'Archived {len(appointments)} appointments and their call evidence to {args.archive}')
            return
        saved = json.loads(Path(args.replace_from).read_text(encoding='utf-8'))
        assert all(snapshot[key] == saved[key] for key in snapshot), 'Review data changed after backup; make a fresh archive'
        await db.execute(text('DELETE FROM appointment_calls'))
        await db.execute(text('DELETE FROM appointments'))
        # Old call artifacts remain in calls; the archive preserves their original links.
        provider_ids = []
        for index, (name, location, specialty) in enumerate(CLINICS):
            npi = f'199999990{index}'
            pid = (await db.execute(text('SELECT id FROM providers WHERE npi=:npi'), {'npi': npi})).scalar()
            if not pid:
                result = await db.execute(text('''INSERT INTO providers(practice_name,npi,tax_id,address,phone,specialty)
                    VALUES(:name,:npi,'000000000',:address,'+12025550100',:specialty)'''),
                    {'name':name,'npi':npi,'address':location,'specialty':specialty})
                pid = result.lastrowid
            provider_ids.append(pid)
        for index, (first, last, dob, clinic, kind, status, call_status, outcome, attempts, clock) in enumerate(SAMPLES):
            member = f'PREVIEW-{index+1:04}'
            phone = f'+120255501{index+10:02}'
            patient_id = (await db.execute(text('SELECT id FROM patients WHERE member_id=:member'), {'member':member})).scalar()
            if not patient_id:
                result = await db.execute(text('''INSERT INTO patients(first_name,last_name,date_of_birth,member_id,phone,group_number,policy_number,subscriber_name,relationship)
                    VALUES(:first,:last,:dob,:member,:phone,'GRP-2048',:policy,:subscriber,'Self')'''),
                    {'first':first,'last':last,'dob':dob,'member':member,'phone':phone,'policy':f'POL-{42000+index}','subscriber':f'{first} {last}'})
                patient_id = result.lastrowid
            slot = datetime.fromisoformat(f'2026-12-{18-index:02}T{clock}')
            start = datetime(2026,11,26,14,14) - timedelta(minutes=index*17)
            original = slot - timedelta(days=2) if status == 'rescheduled' else None
            result = await db.execute(text('''INSERT INTO appointments(patient_id,provider_id,patient_phone,appointment_type,scheduled_at,timezone,location,instructions,notes,status,confirmed_at,original_scheduled_at,original_timezone,callback_requested_at,callback_reason)
                VALUES(:patient,:provider,:phone,:kind,:slot,'America/New_York',:location,:instructions,:notes,:status,:confirmed,:original,:original_zone,:callback,:reason)'''),
                {'patient':patient_id,'provider':provider_ids[clinic],'phone':phone,'kind':kind,'slot':slot,'location':CLINICS[clinic][1],
                 'instructions':'Please arrive 15 minutes early and bring your photo ID and insurance card.',
                 'notes':'Synthetic preview record. Call history below is illustrative; no phone call was placed.',
                 'status':status,'confirmed':start if outcome in {'confirmed','rescheduled'} else None,'original':original,
                 'original_zone':'America/New_York' if original else None,'callback':start if outcome=='callback_needed' else None,
                 'reason':'Patient asked about insurance coverage. Please arrange a callback.' if outcome=='callback_needed' else None})
            aid = result.lastrowid
            for attempt in range(attempts):
                latest = attempt == attempts-1
                call_start = start - timedelta(days=attempts-1-attempt)
                transcript = None
                if latest and call_status == 'completed':
                    transcript = {'confirmed':'Agent: Can you confirm you will attend your appointment?\nPatient: Yes, I will be there.\nAgent: Thank you. Please bring your insurance card.',
                                  'rescheduled':f'Patient: Could we move my appointment to {slot:%B %d at %I:%M %p}?\nAgent: Please confirm that new date and time.\nPatient: Yes, please change it.\nAgent: Your appointment has been rescheduled.',
                                  'cancelled':'Patient: I need to cancel my appointment.\nAgent: Please confirm you want to cancel this appointment.\nPatient: Yes, cancel it.\nAgent: Your appointment has been cancelled.',
                                  'callback_needed':'Patient: Is my insurance accepted for this visit?\nAgent: I need the clinic to help with that. No operator is available. Would you like a callback?\nPatient: Yes, please.\nAgent: I have saved your callback request.'}[outcome]
                result = await db.execute(text('''INSERT INTO calls(use_case,status,started_at,completed_at,duration,outcome,transcript,assigned_agent_name,handoff_token,error_message)
                    VALUES('appointment',:status,:start,:end,:duration,:outcome,:transcript,'Voice AI Agent',:token,:error)'''),
                    {'status':call_status if latest else 'no_answer','start':call_start,'end':call_start+timedelta(seconds=94 if transcript else 25),
                     'duration':94 if transcript else 25,'outcome':outcome if latest else None,'transcript':transcript,
                     'token':f'preview-{aid}-{attempt}','error':'Illustrative failed connection.' if call_status=='failed' else None})
                cid = result.lastrowid
                await db.execute(text('INSERT INTO appointment_calls(call_id,appointment_id,identity_verified) VALUES(:cid,:aid,:verified)'), {'cid':cid,'aid':aid,'verified':bool(transcript)})
                if latest and outcome in {'rescheduled','cancelled'}:
                    message = f'Changed from {original} to {slot} (America/New_York).' if original else f'Patient confirmed cancellation of {slot} (America/New_York).'
                    await db.execute(text('INSERT INTO call_events(call_id,type,message,`timestamp`) VALUES(:cid,:type,:message,:start)'), {'cid':cid,'type':'reschedule_appointment' if original else 'cancel_appointment','message':message,'start':call_start})
        assert (await db.execute(text('SELECT COUNT(*) FROM appointments'))).scalar() == len(SAMPLES)
        assert (await db.execute(text('SELECT COUNT(*) FROM appointment_calls'))).scalar() == sum(row[8] for row in SAMPLES)
        print('Created 10 synthetic patient appointments with consistent booking tags, attempts and illustrative transcripts. Original call artifacts retained.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--archive')
    action.add_argument('--replace-from')
    asyncio.run(main(parser.parse_args()))
