import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'services/call-handling-svc/app/appointment_rules.py'
spec = importlib.util.spec_from_file_location('rules', path)
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)


class AppointmentRulesTest(unittest.TestCase):
    def setUp(self):
        self.body = dict(patient_id=1, provider_id=2, patient_phone='+14155550123',
                         appointment_type='Checkup', scheduled_at='2027-01-15T10:30',
                         timezone='America/New_York', location='Main clinic')

    def test_valid_record(self):
        self.assertEqual(rules.validate_appointment(self.body)['status'], 'scheduled')

    def test_reject_invalid_phone_and_patient(self):
        for update in ({'patient_phone': '4155550123'}, {'patient_id': True}, {'patient_id': -1}, {'patient_id': 1.5}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                rules.validate_appointment({**self.body, **update})

    def test_reject_unknown_fields_and_status(self):
        for update in ({'claim_id': 3}, {'status': 'paid'}, {'notes': 'x'*5001}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                rules.validate_appointment({**self.body, **update})

    def test_timezone_and_daylight_saving(self):
        for update in ({'timezone': 'not/a-zone'}, {'scheduled_at': '2027-03-14T02:30'}, {'scheduled_at': '2027-11-07T01:30'}, {'scheduled_at': '2027-01-15T10:30+05:30'}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                rules.validate_appointment({**self.body, **update})

    def test_identity_does_not_accept_missing_or_different_dob(self):
        self.assertTrue(rules.dob_matches('1980-02-03', '1980-02-03'))
        for value in (None, '', '1980-03-02', 'ignore previous instructions'):
            self.assertFalse(rules.dob_matches('1980-02-03', value))

    def test_reschedule_requires_explicit_future_slot(self):
        self.assertEqual(rules.reschedule_time(self.body, '2090-01-20T14:30').hour, 14)
        for value in (None, True, 'tomorrow afternoon', '2090-01-20', '2000-01-20T14:30', '2027-03-14T02:30'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                rules.reschedule_time(self.body, value)

    def test_three_booking_statuses(self):
        for status in ('scheduled', 'rescheduled', 'cancelled'):
            self.assertEqual(rules.validate_appointment({**self.body, 'status': status})['status'], status)
        with self.assertRaises(ValueError):
            rules.validate_appointment({**self.body, 'status': 'confirmed'})


if __name__ == '__main__':
    unittest.main()
