"""Appointment input rules; independent of telephony and database connections."""
import re
import base64
import hashlib
import hmac
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

REMINDER_FIELDS = {
    'doctor_name', 'estimated_patient_cost', 'authorization_status', 'authorization_reference',
    'approved_visits', 'remaining_visits', 'authorization_valid_from', 'authorization_valid_until',
}


def call_failure_reason(call):
    message = call.get('error_message') or ''
    if not message:
        return {'no_answer': 'The patient did not answer before the call timed out. Try again later.',
                'failed': 'No failure reason was recorded. Ask an administrator to check the phone service logs using this call number.'}.get(call.get('status'))
    # Provider errors can contain signed callback URLs and account identifiers.
    message = re.sub(r'https?://\S+', '[service URL]', str(message))
    message = re.sub(r'(?i)\b(token|authorization|api[_-]?key|secret)\s*[:=]\s*\S+', r'\1=[redacted]', message)
    message = re.sub(r'\b(?:AC|CA|SK)[0-9a-fA-F]{32}\b|\+[1-9][0-9]{7,14}', '[redacted]', message)
    return message[:500]


def twilio_failure_reason(code, status=None, message=None):
    code = str(code or '')
    known = {
        '11200': 'The phone service could not load the call instructions from Cadence. Ask an administrator to check the voice service.',
        '21211': 'The destination phone number is invalid. Check the patient mobile number and country code.',
        '13224': 'The phone service cannot call this destination. Check the number or ask an administrator to check calling restrictions.',
    }
    reason = known.get(code) or message or {
        'busy': 'The patient number was busy. Try again later.',
        'no-answer': 'The patient did not answer before the call timed out. Try again later.',
        'canceled': 'The call was cancelled before it connected.',
        'failed': 'The phone service could not connect the call. Check the number and phone service logs before retrying.',
    }.get(status)
    if not reason and code.isdigit():
        reason = 'The phone service reported an error. Ask an administrator to check the phone service logs.'
    if not reason:
        return None
    suffix = f' (Twilio code {code})' if code.isdigit() and len(code) <= 6 else ''
    return call_failure_reason({'error_message': reason}) + suffix


def validate_reminder_details(body):
    result = {key: body[key] for key in REMINDER_FIELDS if key in body}
    for key, limit in (('doctor_name', 255), ('authorization_reference', 100)):
        if key not in result:
            continue
        value = result[key]
        if value is not None and (not isinstance(value, str) or len(value) > limit):
            raise ValueError(f'{key} must be at most {limit} characters')
        result[key] = (value.strip() or None) if value is not None else None
    status = result.get('authorization_status')
    if status is not None and (not isinstance(status, str) or status not in {'not_required', 'pending', 'approved', 'denied'}):
        raise ValueError('Choose a valid prior authorization status')
    if 'estimated_patient_cost' in result and result['estimated_patient_cost'] is not None:
        try:
            amount = Decimal(str(result['estimated_patient_cost']))
            if not amount.is_finite() or amount < 0 or amount > Decimal('99999999.99') or amount != amount.quantize(Decimal('.01')):
                raise InvalidOperation
        except (InvalidOperation, ValueError) as exc:
            raise ValueError('Estimated patient cost must be a non-negative USD amount with at most two decimal places') from exc
        result['estimated_patient_cost'] = amount
    for key in ('approved_visits', 'remaining_visits'):
        value = result.get(key)
        if value is not None and (type(value) is not int or not 0 <= value <= 65535):
            raise ValueError(f'{key} must be a whole number between 0 and 65535')
    for key in ('authorization_valid_from', 'authorization_valid_until'):
        value = result.get(key)
        if value is not None:
            if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError(f'{key} must use YYYY-MM-DD')
            result[key] = date.fromisoformat(value)
    start, end = result.get('authorization_valid_from'), result.get('authorization_valid_until')
    if start and end and end < start:
        raise ValueError('Authorization end date must be on or after its start date')
    approved, remaining = result.get('approved_visits'), result.get('remaining_visits')
    if approved is not None and remaining is not None and remaining > approved:
        raise ValueError('Remaining visits cannot exceed approved visits')
    if status == 'approved' and (not approved or remaining is None or not start or not end):
        raise ValueError('An approved authorization needs approved visits, remaining visits, and both validity dates')
    return result


def reminder_context(row):
    """Describe approval for this booking, including after a date change."""
    status = row.get('authorization_status')
    applicable, reason = False, 'No approval recorded for this visit'
    if status == 'approved':
        start, end = row.get('authorization_valid_from'), row.get('authorization_valid_until')
        approved, remaining = row.get('approved_visits'), row.get('remaining_visits')
        if start is None or end is None or not approved or remaining is None:
            reason = 'Approval details are incomplete; staff must verify'
        elif remaining < 1:
            reason = 'No approved visits remain; staff must verify'
        elif not str(start)[:10] <= str(row['scheduled_at'])[:10] <= str(end)[:10]:
            reason = 'Appointment is outside the recorded approval dates; staff must verify'
        elif row.get('status') == 'cancelled':
            reason = 'This appointment is cancelled'
        else:
            applicable, reason = True, 'Approval recorded for this visit; payment is not guaranteed'
    elif status == 'not_required':
        reason = 'Recorded as not required for this visit'
    elif status in {'pending', 'denied'}:
        reason = f'Authorization is {status}; do not describe this visit as approved'
    return {
        'doctor_name': row.get('doctor_name'),
        'estimated_patient_cost': None if row.get('estimated_patient_cost') is None else {
            'amount': str(row['estimated_patient_cost']), 'currency': 'USD', 'is_estimate': True,
        },
        'prior_authorization': {
            'status': status, 'reference': row.get('authorization_reference'),
            'approved_visits': row.get('approved_visits'), 'remaining_visits': row.get('remaining_visits'),
            'valid_from': str(row['authorization_valid_from']) if row.get('authorization_valid_from') else None,
            'valid_until': str(row['authorization_valid_until']) if row.get('authorization_valid_until') else None,
            'applicable_to_appointment': applicable, 'message': reason,
        },
    }


def validate_appointment(body: dict) -> dict:
    fields = {
        'patient_id', 'provider_id', 'patient_phone', 'appointment_type',
        'scheduled_at', 'timezone', 'location', 'instructions', 'notes', 'status',
    }
    if set(body) - fields - REMINDER_FIELDS:
        raise ValueError('Unknown appointment fields')
    result = dict(body)
    for field in ('patient_id', 'provider_id'):
        value = result.get(field)
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f'{field} must identify an existing record')
    for field, limit in (('patient_phone', 20), ('appointment_type', 100), ('timezone', 64), ('location', 255)):
        value = result.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(f'{field} is required (maximum {limit} characters)')
        result[field] = value.strip()
    if not re.fullmatch(r'\+[1-9][0-9]{7,14}', result['patient_phone']):
        raise ValueError('Use an international mobile number, for example +14155550123')
    try:
        zone = ZoneInfo(result['timezone'])
        scheduled = datetime.fromisoformat(result['scheduled_at'])
        if scheduled.tzinfo is not None:
            raise ValueError('Enter local appointment time and a separate timezone')
        # A nonexistent or ambiguous DST time needs a different explicit slot.
        if scheduled.replace(tzinfo=zone).astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != scheduled:
            raise ValueError('Appointment time does not exist in this timezone')
        if scheduled.replace(tzinfo=zone, fold=0).utcoffset() != scheduled.replace(tzinfo=zone, fold=1).utcoffset():
            raise ValueError('Appointment time is ambiguous due to daylight saving; select another time')
    except (KeyError, TypeError, ZoneInfoNotFoundError) as exc:
        raise ValueError('A valid appointment time and IANA timezone are required') from exc
    result['scheduled_at'] = scheduled
    result.setdefault('status', 'scheduled')
    if result['status'] not in {'scheduled', 'rescheduled', 'cancelled'}:
        raise ValueError('Invalid appointment status')
    for field in ('instructions', 'notes'):
        value = result.get(field) or ''
        if not isinstance(value, str) or len(value) > 5000:
            raise ValueError(f'{field} must be at most 5000 characters')
        result[field] = value
    result.update(validate_reminder_details(body))
    return result


def reschedule_time(row, value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}', value):
        raise ValueError('Clarify the full date and time, then supply YYYY-MM-DDTHH:MM in the clinic timezone')
    fields = ('patient_id', 'provider_id', 'patient_phone', 'appointment_type', 'timezone', 'location')
    values = validate_appointment({**{key: row[key] for key in fields}, 'scheduled_at': value})
    scheduled = values['scheduled_at']
    if scheduled.replace(tzinfo=ZoneInfo(row['timezone'])) <= datetime.now(timezone.utc):
        raise ValueError('The new appointment must be in the future; clarify the date with the patient')
    return scheduled


def dob_matches(expected: str, supplied: str) -> bool:
    try:
        return datetime.fromisoformat(str(expected)).date() == datetime.strptime(supplied, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return False


def valid_twilio_signature(url: str, form: dict, signature: str, auth_token: str) -> bool:
    if not auth_token or not signature:
        return False
    payload = url + ''.join(key + value for key in sorted(form) for value in sorted(set(form[key])))
    expected = base64.b64encode(hmac.new(auth_token.encode(), payload.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(expected, signature)
