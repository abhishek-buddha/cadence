"""Optional patient appointment calling. Claims retain their existing dialer."""
import asyncio
import hmac
import json
import secrets
import urllib.parse
import urllib.error
from datetime import datetime, timedelta, timezone
from html import escape
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from common.audit import write_audit_event
from common.db import get_db
from common.serialize import row_to_dict, rows_to_dicts
from ..appointment_rules import validate_appointment, reschedule_time, dob_matches, valid_twilio_signature
from ..config import settings
from ..invalidate import publish_invalidation
from ..handoff_states import LIVE_HANDOFF_STATES
from .calls import _auth_header, _post_form
from .handoff import _is_active_call, _log_event
from .twilio_compat import _close_call, _FINAL_TWILIO_STATUSES

router = APIRouter(tags=['appointments'])
_SELECT = '''SELECT a.*, CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
 p.date_of_birth, p.member_id, p.group_number, p.policy_number, p.subscriber_name, p.relationship,
 pr.practice_name AS provider_name, pr.phone AS provider_phone
 FROM appointments a JOIN patients p ON p.id=a.patient_id
 JOIN providers pr ON pr.id=a.provider_id'''


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def staff(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    if not settings.appointments_enabled:
        raise HTTPException(404, 'Appointment calling is not enabled')
    token = request.headers.get('authorization', '').removeprefix('Bearer ')
    row = row_to_dict((await db.execute(text(
        'SELECT * FROM sessions WHERE session_token=:token AND expires_at>UTC_TIMESTAMP()'
    ), {'token': token})).first())
    if not row or row.get('user_role') not in {'admin', 'manager', 'operator'}:
        raise HTTPException(403, 'Sign in as an operator or administrator')
    return row


async def appointment(db, appointment_id, lock=False):
    row = row_to_dict((await db.execute(text(_SELECT + ' WHERE a.id=:id' + (' FOR UPDATE' if lock else '')), {'id': appointment_id})).first())
    if row is None:
        raise HTTPException(404, 'Appointment not found')
    return row


async def call_record(db, call_id, lock=False):
    row = row_to_dict((await db.execute(text('''SELECT c.*, ac.appointment_id, ac.identity_verified, ac.pending_booking_change
        FROM calls c JOIN appointment_calls ac ON ac.call_id=c.id WHERE c.id=:id'''
        + (' FOR UPDATE' if lock else '')), {'id': call_id})).first())
    if not row:
        raise HTTPException(404, 'Appointment call not found')
    return row


async def bridge_call(request, db, call_id, token, lock=False):
    secret = settings.appointment_bridge_secret
    if not secret or not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + secret):
        raise HTTPException(403, 'Invalid bridge credentials')
    call = await call_record(db, call_id, lock)
    if not token or not hmac.compare_digest(call.get('handoff_token') or '', token):
        raise HTTPException(403, 'Invalid call credentials')
    return call


@router.get('/appointments/config')
async def config():
    return {'enabled': settings.appointments_enabled}


@router.get('/appointments')
async def list_appointments(_=Depends(staff), db: AsyncSession = Depends(get_db)):
    query = _SELECT.replace('SELECT a.*,', '''SELECT a.*, COALESCE(summary.call_attempts,0) AS call_attempts,
        latest.started_at AS last_attempt, latest.outcome AS last_outcome, latest.status AS last_call_status,
        latest.assigned_agent_name,''') + '''
        LEFT JOIN (SELECT appointment_id, COUNT(*) AS call_attempts, MAX(call_id) AS last_call_id
            FROM appointment_calls GROUP BY appointment_id) summary ON summary.appointment_id=a.id
        LEFT JOIN calls latest ON latest.id=summary.last_call_id
        ORDER BY a.scheduled_at DESC, a.id DESC'''
    return rows_to_dicts(await db.execute(text(query)))


@router.get('/appointments/{appointment_id:int}')
async def get_appointment(appointment_id: int, _=Depends(staff), db: AsyncSession = Depends(get_db)):
    return await appointment(db, appointment_id)


async def save(db, body, appointment_id=None):
    action = 'update' if appointment_id is not None else 'create'
    try:
        values = validate_appointment(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    for table, field in (('patients', 'patient_id'), ('providers', 'provider_id')):
        if not (await db.execute(text(f'SELECT id FROM {table} WHERE id=:id'), {'id': values[field]})).first():
            raise HTTPException(422, f'{field} does not exist')
    if appointment_id is not None:
        previous = await appointment(db, appointment_id, lock=True)
        active = (await db.execute(text('''SELECT c.id FROM calls c JOIN appointment_calls ac ON ac.call_id=c.id
            WHERE ac.appointment_id=:id AND c.completed_at IS NULL AND c.status IN ('initiating','in_progress')'''), {'id': appointment_id})).first()
        if active:
            raise HTTPException(409, 'End the active call before changing appointment details')
        if datetime.fromisoformat(previous['scheduled_at']) != values['scheduled_at'] or previous['timezone'] != values['timezone']:
            values['original_scheduled_at'] = previous['original_scheduled_at'] or previous['scheduled_at']
            values['original_timezone'] = previous['original_timezone'] or previous['timezone']
            values['confirmed_at'] = None
            if values['status'] != 'cancelled':
                values['status'] = 'rescheduled'
        elif values['status'] == 'cancelled' or previous['status'] == 'cancelled':
            values['confirmed_at'] = None
        if any(previous[key] != values[key] for key in ('patient_id', 'provider_id', 'location', 'appointment_type')):
            values['confirmed_at'] = None
        await db.execute(text('UPDATE appointments SET ' + ', '.join(f'{k}=:{k}' for k in values) + ' WHERE id=:id'), {**values, 'id': appointment_id})
    else:
        result = await db.execute(text('INSERT INTO appointments (' + ','.join(values) + ') VALUES (' + ','.join(':'+k for k in values) + ')'), values)
        appointment_id = result.lastrowid
    await write_audit_event(db, action=action, resource_type='appointment', resource_id=str(appointment_id))
    await db.commit()
    await publish_invalidation('appointment', appointment_id)
    return await appointment(db, appointment_id)


@router.post('/appointments', status_code=201)
async def create_appointment(body: dict, _=Depends(staff), db: AsyncSession = Depends(get_db)):
    return await save(db, body)


@router.put('/appointments/{appointment_id:int}')
async def update_appointment(appointment_id: int, body: dict, _=Depends(staff), db: AsyncSession = Depends(get_db)):
    return await save(db, body, appointment_id)


@router.post('/appointments/{appointment_id:int}/complete-callback')
async def complete_callback(appointment_id: int, _=Depends(staff), db: AsyncSession = Depends(get_db)):
    await appointment(db, appointment_id)
    await db.execute(text('UPDATE appointments SET callback_requested_at=NULL, callback_reason=NULL WHERE id=:id'), {'id': appointment_id})
    await db.commit()
    await publish_invalidation('appointment', appointment_id)
    return {'ok': True}


@router.post('/appointments/operators/presence')
async def presence(body: dict, user=Depends(staff), db: AsyncSession = Depends(get_db)):
    key = 'appointmentOperator:' + str(user['user_id'])
    value = now().isoformat() if body.get('ready') is True else ''
    await db.execute(text('INSERT INTO call_settings (`key`,value) VALUES (:key,:value) ON DUPLICATE KEY UPDATE value=:value'), {'key': key, 'value': value})
    await db.commit()
    return {'ok': True}


@router.get('/appointments/{appointment_id:int}/calls')
async def history(appointment_id: int, _=Depends(staff), db: AsyncSession = Depends(get_db)):
    await appointment(db, appointment_id)
    calls = rows_to_dicts(await db.execute(text('''SELECT c.*, ac.transcription_error FROM calls c JOIN appointment_calls ac ON ac.call_id=c.id
        WHERE ac.appointment_id=:id ORDER BY c.id DESC'''), {'id': appointment_id}))
    events = rows_to_dicts(await db.execute(text('''SELECT e.call_id,e.type,e.message,e.timestamp
        FROM call_events e JOIN appointment_calls ac ON ac.call_id=e.call_id
        WHERE ac.appointment_id=:id AND e.type IN ('reschedule_appointment','cancel_appointment','confirm_appointment')
        ORDER BY e.id'''), {'id': appointment_id}))
    by_id = {call['id']: call for call in calls}
    for call in calls:
        call['booking_changes'] = []
    for event in events:
        by_id[event['call_id']]['booking_changes'].append(event)
    return calls


@router.post('/appointments/{appointment_id:int}/calls', status_code=201)
async def dial(appointment_id: int, _=Depends(staff), db: AsyncSession = Depends(get_db)):
    if not all((settings.appointment_agent_id, settings.appointment_bridge_secret, settings.twilio_account_sid,
                settings.twilio_auth_token, settings.twilio_phone_number)):
        raise HTTPException(503, 'Appointment calling has not been configured')
    row = await appointment(db, appointment_id, lock=True)
    if row['status'] == 'cancelled':
        raise HTTPException(409, 'Cannot call for a cancelled appointment')
    active = (await db.execute(text('''SELECT c.id FROM calls c JOIN appointment_calls ac ON ac.call_id=c.id
        WHERE ac.appointment_id=:id AND c.completed_at IS NULL AND c.status IN ('initiating','in_progress')'''), {'id': appointment_id})).first()
    if active:
        raise HTTPException(409, 'This appointment already has an active call')
    token = secrets.token_hex(24)
    result = await db.execute(text('''INSERT INTO calls (use_case,status,started_at,handoff_token)
        VALUES ('appointment','initiating',:now,:token)'''), {'now': now(), 'token': token})
    call_id = result.lastrowid
    await db.execute(text('INSERT INTO appointment_calls (call_id,appointment_id) VALUES (:call,:appointment)'), {'call': call_id, 'appointment': appointment_id})
    await db.commit()
    base = settings.public_base_url.rstrip('/')
    try:
        response = await asyncio.to_thread(_post_form,
            f'https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls.json',
            {'To': row['patient_phone'], 'From': settings.twilio_phone_number,
             'Url': f'{base}/appointment-voice/start?callId={call_id}&token={token}',
             'StatusCallback': f'{base}/appointment-voice/status?callId={call_id}&token={token}',
             'StatusCallbackEvent': 'initiated ringing answered completed', 'Timeout': '45'},
            _auth_header(settings.twilio_account_sid, settings.twilio_auth_token))
    except urllib.error.HTTPError as exc:
        if 400 <= exc.code < 500:
            await db.execute(text("UPDATE calls SET status='failed',completed_at=:now,error_message=:error WHERE id=:id"), {'id': call_id, 'now': now(), 'error': f'Twilio rejected the call ({exc.code})'})
            await db.commit()
            await publish_invalidation('call', call_id)
        raise HTTPException(502, 'Twilio could not place the call. Check call history and the mobile number.') from exc
    except Exception as exc:
        # A transport timeout can mean Twilio accepted the call. Keep it reserved
        # until a status callback/reconciliation resolves it; never auto-redial.
        await db.execute(text('UPDATE calls SET error_message=:error WHERE id=:id'), {'id': call_id, 'error': 'Call placement could not be confirmed; check call status before retrying.'})
        await db.commit()
        await publish_invalidation('call', call_id)
        raise HTTPException(502, 'Call placement could not be confirmed. Check call history before retrying.') from exc
    await db.execute(text("UPDATE calls SET twilio_call_sid=:sid, status=IF(completed_at IS NULL,'in_progress',status) WHERE id=:id"), {'id': call_id, 'sid': response['sid']})
    await _log_event(db, call_id, 'appointment_called', 'Appointment confirmation call placed')
    await db.commit()
    await publish_invalidation('call', call_id)
    return {'callId': call_id}


@router.api_route('/appointment-voice/start', methods=['POST'])
async def start(request: Request, callId: int, token: str, db: AsyncSession = Depends(get_db)):
    form = urllib.parse.parse_qs((await request.body()).decode())
    public_url = settings.public_base_url.rstrip('/') + request.url.path + '?' + request.url.query
    if not valid_twilio_signature(public_url, form, request.headers.get('x-twilio-signature', ''), settings.twilio_auth_token):
        raise HTTPException(403, 'Invalid Twilio signature')
    call = await call_record(db, callId)
    if not hmac.compare_digest(call.get('handoff_token') or '', token) or call.get('completed_at'):
        raise HTTPException(403, 'Invalid or ended call')
    # Correlate early callbacks, which can arrive before Calls.json returns.
    sid = form.get('CallSid', [''])[0]
    if sid and not call.get('twilio_call_sid'):
        await db.execute(text('UPDATE calls SET twilio_call_sid=:sid WHERE id=:id AND twilio_call_sid IS NULL'), {'sid': sid, 'id': callId})
        await db.commit()
    url = settings.bridge_server_url.rstrip('/') + '/appointment-media-stream'
    xml = f'''<Response><Connect><Stream url="{escape(url)}"><Parameter name="callId" value="{callId}"/>
        <Parameter name="token" value="{escape(token)}"/></Stream></Connect></Response>'''
    return Response(xml, media_type='application/xml')


@router.post('/appointment-voice/status')
async def status(request: Request, callId: int, token: str, db: AsyncSession = Depends(get_db)):
    form = urllib.parse.parse_qs((await request.body()).decode())
    url = settings.public_base_url.rstrip('/') + request.url.path + '?' + request.url.query
    if not valid_twilio_signature(url, form, request.headers.get('x-twilio-signature', ''), settings.twilio_auth_token):
        raise HTTPException(403, 'Invalid Twilio signature')
    call = await call_record(db, callId, lock=True)
    if not hmac.compare_digest(call.get('handoff_token') or '', token):
        raise HTTPException(403, 'Invalid call token')
    sid = form.get('CallSid', [''])[0]
    if not sid or (call.get('twilio_call_sid') and call['twilio_call_sid'] != sid):
        raise HTTPException(403, 'Invalid call ID')
    await db.execute(text('UPDATE calls SET twilio_call_sid=:sid WHERE id=:id'), {'sid': sid, 'id': callId})
    value = form.get('CallStatus', [''])[0]
    if value in _FINAL_TWILIO_STATUSES:
        await _close_call(db, call_id=callId, twilio_status_value=value, duration=form.get('CallDuration', [None])[0])
    elif value == 'in-progress':
        await db.execute(text("UPDATE calls SET status='in_progress' WHERE id=:id AND completed_at IS NULL"), {'id': callId})
    await db.commit()
    await publish_invalidation('call', callId)
    return {'ok': True}


@router.get('/appointment-voice/metadata')
async def metadata(request: Request, callId: int, token: str, db: AsyncSession = Depends(get_db)):
    call = await bridge_call(request, db, callId, token)
    if call.get('completed_at'):
        raise HTTPException(409, 'Call ended')
    if call.get('handoff_state') in {'accepting', 'connected', 'handoff_ended'}:
        raise HTTPException(409, 'The operator has taken over; the voice agent must stop using tools')
    row = await appointment(db, call['appointment_id'])
    # Details are returned only by verify_patient; the model never sees the DOB.
    return {'agent_id': settings.appointment_agent_id,
            'dynamic_variables': {'patient_name': row['patient_name'], 'practice_name': row['provider_name']}}


async def operator_candidates(db, user_id=None):
    # Reserve users before calls: occupancy reads can scan other incoming calls.
    return rows_to_dicts(await db.execute(text("SELECT * FROM users WHERE status!='disabled' AND (role='operator' OR id=:id) ORDER BY id FOR UPDATE"), {'id': user_id or -1}))


async def request_operator(db, call, reason, candidates, user_id=None):
    if call.get('completed_at') or call['status'] not in {'initiating', 'in_progress'}:
        raise HTTPException(409, 'Call already ended')
    if call.get('handoff_state') in LIVE_HANDOFF_STATES:
        requested = call.get('handoff_requested_at')
        if call['handoff_state'] == 'awaiting_human' and requested and datetime.fromisoformat(requested) < now()-timedelta(seconds=60):
            await db.execute(text("UPDATE calls SET handoff_state=NULL,assigned_agent_user_id=NULL,assigned_agent_email=NULL,assigned_agent_name=NULL WHERE id=:id"), {'id': call['id']})
            return {'status': 'no_operator', 'message': 'The operator did not answer. Offer a callback and record it if the patient agrees.'}
        return {'status': 'waiting_for_operator', 'message': 'An operator has already been requested'}
    chosen = None
    for user in candidates:
        if user_id is not None and str(user['id']) != str(user_id):
            continue
        ready = (await db.execute(text('SELECT value FROM call_settings WHERE `key`=:key'), {'key': 'appointmentOperator:'+str(user['id'])})).scalar()
        if not ready or ready < (now()-timedelta(seconds=45)).isoformat():
            continue
        # A locking read sees a reservation committed while we waited for the user lock.
        calls = rows_to_dicts(await db.execute(text('SELECT * FROM calls WHERE assigned_agent_user_id=:id ORDER BY id DESC LIMIT 25 FOR UPDATE'), {'id': user['id']}))
        if not any(_is_active_call(c) for c in calls if c['id'] != call['id']):
            chosen = user
            break
    if not chosen:
        return {'status': 'no_operator', 'message': 'No operator is available. Offer a callback; record it only if the patient agrees.'}
    await db.execute(text('''UPDATE calls SET handoff_state='awaiting_human', handoff_requested_at=:now,
        handoff_reason=:reason, assigned_agent_user_id=:agent, assigned_agent_email=:email,
        assigned_agent_name=:name, conference_name=:conference WHERE id=:id'''),
        {'now': now(), 'reason': reason[:255], 'agent': chosen['id'], 'email': chosen['email'],
         'name': chosen.get('name') or chosen['email'], 'conference': f"cadence-{call['id']}", 'id': call['id']})
    await _log_event(db, call['id'], 'handoff_requested', reason[:255])
    return {'status': 'waiting_for_operator', 'message': 'Tell the patient an operator is joining. Stay on the line until takeover.'}


@router.post('/appointments/calls/{call_id:int}/takeover')
async def takeover(call_id: int, user=Depends(staff), db: AsyncSession = Depends(get_db)):
    candidates = await operator_candidates(db, int(user['user_id']))
    call = await call_record(db, call_id, lock=True)
    if call.get('handoff_state') in LIVE_HANDOFF_STATES and str(call.get('assigned_agent_user_id')) != str(user['user_id']):
        raise HTTPException(409, 'This call is assigned to another operator')
    result = await request_operator(db, call, 'Monitoring operator requested takeover', candidates, int(user['user_id']))
    await db.commit()
    await publish_invalidation('call', call_id)
    if result['status'] == 'no_operator':
        raise HTTPException(409, 'Prepare the browser phone and finish any other call or wrap-up first')
    return result


@router.post('/appointments/calls/{call_id:int}/release')
async def release(call_id: int, user=Depends(staff), db: AsyncSession = Depends(get_db)):
    await call_record(db, call_id)
    await db.execute(text("""UPDATE calls SET handoff_state='awaiting_human'
        WHERE id=:id AND assigned_agent_user_id=:user AND handoff_state='accepting' AND completed_at IS NULL"""), {'id': call_id, 'user': user['user_id']})
    await db.commit()
    await publish_invalidation('call', call_id)
    return {'ok': True}


@router.post('/appointment-voice/tool')
async def tool(request: Request, body: dict, db: AsyncSession = Depends(get_db)):
    name, args = body.get('name'), body.get('arguments') or {}
    call = await bridge_call(request, db, int(body.get('callId') or 0), str(body.get('token') or ''), lock=name != 'request_human')
    candidates = None
    if name == 'request_human':
        candidates = await operator_candidates(db)
        call = await call_record(db, call['id'], lock=True)
    if call.get('completed_at'):
        raise HTTPException(409, 'Call ended')
    if call.get('handoff_state') in {'accepting', 'connected', 'handoff_ended'}:
        raise HTTPException(409, 'The operator has taken over; the voice agent must stop using tools')
    if not isinstance(args, dict):
        raise HTTPException(422, 'Tool arguments must be an object')
    # Booking mutations need a slot lock; operator reservation has its own locks.
    row = await appointment(db, call['appointment_id'], lock=name in {'confirm_appointment', 'reschedule_appointment', 'cancel_appointment'})
    if name == 'verify_patient':
        if not dob_matches(row['date_of_birth'], args.get('date_of_birth')):
            return {'verified': False, 'message': 'Do not disclose appointment details. Offer an operator or a callback.'}
        await db.execute(text('UPDATE appointment_calls SET identity_verified=TRUE WHERE call_id=:id'), {'id': call['id']})
        result = {'verified': True, 'patient_name': row['patient_name'], 'provider': row['provider_name'],
                  'scheduled_at': str(row['scheduled_at']), 'timezone': row['timezone'], 'location': row['location'],
                  'appointment_type': row['appointment_type'], 'instructions': row['instructions'], 'status': row['status'],
                  'current_clinic_time': datetime.now(ZoneInfo(row['timezone'])).isoformat(),
                  'attendance_confirmed': bool(row['confirmed_at']),
                  'clinic_phone': row['provider_phone'], 'patient_record': {key: row.get(key) for key in
                      ('member_id', 'group_number', 'policy_number', 'subscriber_name', 'relationship')}}
    elif name == 'confirm_appointment':
        if not call['identity_verified']:
            raise HTTPException(403, 'Verify the patient before confirming')
        if row['status'] == 'cancelled':
            raise HTTPException(409, 'Appointment is cancelled')
        await db.execute(text("UPDATE appointments SET confirmed_at=COALESCE(confirmed_at,:now) WHERE id=:id"), {'id': row['id'], 'now': now()})
        await db.execute(text("UPDATE calls SET outcome='confirmed' WHERE id=:id"), {'id': call['id']})
        result = {'status': 'confirmed'}
    elif name in {'reschedule_appointment', 'cancel_appointment'}:
        if not call['identity_verified']:
            raise HTTPException(403, 'Verify the patient before changing the booking')
        if name == 'reschedule_appointment':
            if row['status'] == 'cancelled':
                return {'status': 'cancelled', 'message': 'This booking is cancelled and cannot be rescheduled. Do not claim it was changed.'}
            try:
                scheduled = reschedule_time(row, args.get('scheduled_at'))
            except ValueError as exc:
                return {'status': 'clarification_required', 'message': str(exc)}
        turn = body.get('patient_turn')
        if isinstance(turn, bool) or not isinstance(turn, int) or turn < 1:
            raise HTTPException(422, 'A patient conversation turn is required')
        pending = call.get('pending_booking_change')
        if isinstance(pending, str):
            pending = json.loads(pending)
        slot = scheduled.isoformat() if name == 'reschedule_appointment' else str(row['scheduled_at'])
        if not pending or pending['name'] != name or pending['slot'] != slot or args.get('confirmation_id') != pending['id']:
            pending = {'id': secrets.token_hex(16), 'name': name, 'slot': slot, 'turn': turn}
            await db.execute(text('UPDATE appointment_calls SET pending_booking_change=:pending WHERE call_id=:id'), {'id':call['id'], 'pending':json.dumps(pending)})
            await db.commit()
            return {'status': 'confirmation_required', 'confirmation_id': pending['id'],
                    'message': f"Nothing has been changed. Ask whether the patient confirms {'rescheduling to' if name == 'reschedule_appointment' else 'cancelling'} {slot} ({row['timezone']}). Wait for their next spoken answer before calling this tool again with this confirmation_id and confirmed=true. If they decline, do not change the booking."}
        if turn <= pending['turn']:
            return {'status': 'confirmation_required', 'confirmation_id': pending['id'], 'message': 'Wait for a new patient answer. No change has been saved.'}
        if args.get('confirmed') is not True:
            await db.execute(text('UPDATE appointment_calls SET pending_booking_change=NULL WHERE call_id=:id'), {'id':call['id']})
            await db.commit()
            return {'status': 'unchanged', 'message': 'The booking has not changed. Ask again before any future change.'}
        if name == 'reschedule_appointment':
            await db.execute(text('''UPDATE appointments SET
                original_scheduled_at=COALESCE(original_scheduled_at,scheduled_at),
                original_timezone=COALESCE(original_timezone,timezone),
                scheduled_at=:scheduled, status='rescheduled', confirmed_at=:now WHERE id=:id'''),
                {'id': row['id'], 'scheduled': scheduled, 'now': now()})
            result = {'status': 'rescheduled', 'scheduled_at': scheduled.isoformat(), 'timezone': row['timezone'],
                      'message': f"Changed from {row['scheduled_at']} to {scheduled.isoformat()} ({row['timezone']})."}
        else:
            await db.execute(text("UPDATE appointments SET status='cancelled',confirmed_at=NULL WHERE id=:id"), {'id': row['id']})
            result = {'status': 'cancelled', 'message': f"Patient confirmed cancellation of {row['scheduled_at']} ({row['timezone']})."}
        await db.execute(text('UPDATE calls SET outcome=:outcome WHERE id=:id'), {'id': call['id'], 'outcome': result['status']})
        await db.execute(text('UPDATE appointment_calls SET pending_booking_change=NULL WHERE call_id=:id'), {'id':call['id']})
        await write_audit_event(db, action='update', resource_type='appointment', resource_id=str(row['id']))
    elif name == 'request_human':
        result = await request_operator(db, call, str(args.get('reason') or 'Patient requested assistance')[:500], candidates)
    elif name == 'request_callback':
        reason = str(args.get('reason') or 'Patient requested a callback')[:500]
        await db.execute(text('UPDATE appointments SET callback_requested_at=COALESCE(callback_requested_at,:now),callback_reason=:reason WHERE id=:id'), {'id': row['id'], 'now': now(), 'reason': reason})
        await db.execute(text("UPDATE calls SET outcome='callback_needed' WHERE id=:id"), {'id': call['id']})
        result = {'status': 'callback_recorded', 'message': 'A callback request is saved. Do not promise a time.'}
    else:
        raise HTTPException(422, 'Unknown appointment tool')
    await _log_event(db, call['id'], name, result.get('message') or result.get('status') or 'Patient verified')
    await db.commit()
    await publish_invalidation('call', call['id'])
    await publish_invalidation('appointment', row['id'])
    return result


@router.post('/appointment-voice/artifacts')
async def artifacts(request: Request, body: dict, db: AsyncSession = Depends(get_db)):
    call = await bridge_call(request, db, int(body.get('callId') or 0), str(body.get('token') or ''))
    await db.execute(text('''UPDATE calls SET eleven_labs_conversation_id=COALESCE(eleven_labs_conversation_id,:cid),
        transcript=COALESCE(:transcript,transcript) WHERE id=:id'''),
        {'id': call['id'], 'cid': body.get('conversation_id'), 'transcript': body.get('transcript') or None})
    # Closing the AI stream is expected during takeover; Twilio owns call end.
    await db.commit()
    await publish_invalidation('call', call['id'])
    return {'ok': True}


async def enrich_handoff(db, calls):
    ids = [int(c['id']) for c in calls if c.get('use_case') == 'appointment']
    if not ids:
        return calls
    rows = rows_to_dicts(await db.execute(text('''SELECT ac.call_id, a.*, p.first_name AS patient_first_name,
        p.last_name AS patient_last_name, p.date_of_birth AS patient_dob, pr.practice_name AS provider_name
        FROM appointment_calls ac JOIN appointments a ON a.id=ac.appointment_id
        JOIN patients p ON p.id=a.patient_id JOIN providers pr ON pr.id=a.provider_id
        WHERE ac.call_id IN (''' + ','.join(str(i) for i in ids) + ')')))
    by_id = {r['call_id']: r for r in rows}
    for call in calls:
        row = by_id.get(call['id'])
        if row:
            call.update({k: row[k] for k in ('patient_first_name','patient_last_name','patient_dob','provider_name')})
            call['appointment'] = row
    return calls
