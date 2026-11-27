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

    def test_call_failure_explanations_do_not_leak_callback_credentials(self):
        self.assertIsNone(rules.call_failure_reason({'status': 'completed'}))
        self.assertIn('No failure reason', rules.call_failure_reason({'status': 'failed'}))
        self.assertIn('did not answer', rules.call_failure_reason({'status': 'no_answer'}))
        self.assertIn('busy', rules.twilio_failure_reason(None, 'busy'))
        self.assertIn('invalid', rules.twilio_failure_reason(21211, 'failed'))
        self.assertIn('call instructions', rules.twilio_failure_reason(11200, 'completed'))
        self.assertIn('99999', rules.twilio_failure_reason(99999, 'completed'))
        reason = rules.call_failure_reason({'error_message': 'Failed https://example.test/call?token=private token=secret +14155550123'})
        for secret in ('private', 'secret', '+14155550123', 'https://'):
            self.assertNotIn(secret, reason)

    def test_reminder_amounts_and_approval_validation(self):
        approval = dict(authorization_status='approved', approved_visits=3, remaining_visits=2,
                        authorization_valid_from='2027-01-01', authorization_valid_until='2027-02-01')
        row = rules.validate_appointment({**self.body, **approval, 'doctor_name': ' Dr. Carter ', 'estimated_patient_cost': '85.00'})
        self.assertEqual(row['doctor_name'], 'Dr. Carter')
        self.assertTrue(rules.reminder_context(row)['prior_authorization']['applicable_to_appointment'])
        for update in ({'estimated_patient_cost': '-1'}, {'estimated_patient_cost': 'NaN'},
                       {'estimated_patient_cost': '1.001'}, {'estimated_patient_cost': True},
                       {'remaining_visits': 4}, {'remaining_visits': True}, {'approved_visits': 1.5},
                       {'authorization_valid_until': '2026-01-01'}, {'authorization_valid_until': None},
                       {'authorization_status': 'covered'}, {'doctor_name': []}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                rules.validate_appointment({**self.body, **approval, **update})

    def test_missing_zero_and_inapplicable_reminder_details(self):
        missing = rules.reminder_context(self.body)
        self.assertIsNone(missing['doctor_name'])
        self.assertIsNone(missing['estimated_patient_cost'])
        self.assertFalse(missing['prior_authorization']['applicable_to_appointment'])
        row = {**self.body, 'estimated_patient_cost': 0, 'authorization_status': 'approved',
               'approved_visits': 3, 'remaining_visits': 2,
               'authorization_valid_from': '2027-01-15', 'authorization_valid_until': '2027-01-15'}
        self.assertEqual(rules.reminder_context(row)['estimated_patient_cost']['amount'], '0')
        self.assertTrue(rules.reminder_context(row)['prior_authorization']['applicable_to_appointment'])
        for update in ({'scheduled_at': '2027-02-01T10:30'}, {'scheduled_at': '2027-01-14T10:30'},
                       {'remaining_visits': 0}, {'remaining_visits': None}, {'status': 'cancelled'},
                       {'authorization_status': 'pending'}, {'authorization_status': 'not_required'},
                       {'authorization_status': 'denied'}):
            with self.subTest(update=update):
                self.assertFalse(rules.reminder_context({**row, **update})['prior_authorization']['applicable_to_appointment'])

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
