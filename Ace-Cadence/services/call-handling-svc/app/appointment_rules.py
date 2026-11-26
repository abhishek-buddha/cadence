"""Appointment input rules; independent of telephony and database connections."""
import re
import base64
import hashlib
import hmac
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def validate_appointment(body: dict) -> dict:
    fields = {
        'patient_id', 'provider_id', 'patient_phone', 'appointment_type',
        'scheduled_at', 'timezone', 'location', 'instructions', 'notes', 'status',
    }
    if set(body) - fields:
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
