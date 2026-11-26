import assert from 'node:assert/strict';
import { appointmentTime, callTime, patientDate } from '../../Ace-Cadence-Ui/src/features/appointments/format.js';

assert.equal(patientDate('1971-09-18'), '1971-Sep-18');
assert.equal(patientDate('2000-01-01'), '2000-Jan-01');
assert.equal(patientDate(null), '—');
assert.equal(patientDate('invalid'), '—');
assert.equal(patientDate('1971-13-18'), '—');

assert.equal(appointmentTime({ scheduled_at: '2026-07-18T14:14:00' }), '2026-07-18 2:14 PM');
assert.equal(appointmentTime({ scheduled_at: '2026-07-18 00:05:00' }), '2026-07-18 12:05 AM');
assert.equal(appointmentTime({ scheduled_at: '2026-07-18T12:00:00' }), '2026-07-18 12:00 PM');
assert.equal(appointmentTime({}), '—');
assert.equal(callTime('2026-07-18T18:14:00', 'America/New_York'), '2026-07-18 2:14 PM');
assert.equal(callTime('2026-07-18T18:14:00Z', 'America/New_York'), '2026-07-18 2:14 PM');
assert.equal(callTime('2026-07-18T14:14:00-04:00', 'America/New_York'), '2026-07-18 2:14 PM');
assert.equal(callTime('2026-07-18T01:00:00Z', 'America/New_York'), '2026-07-17 9:00 PM');
assert.equal(callTime('2026-12-18T18:14:00Z', 'America/New_York'), '2026-12-18 1:14 PM');
assert.equal(callTime(null), '—');
assert.equal(callTime('invalid'), '—');
console.log('PASS: appointment/call display, noon/midnight, UTC offsets, date rollover and daylight saving');
