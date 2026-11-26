// Real isolated review API and local UI; no calls are placed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:5173';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const ids = { patients: [], appointments: [] };
  const marker = `Editor-${Date.now()}`;
  const manifest = path.join(process.env.TEMP, 'cadence-patient-editor-fixtures.json');
  const saveManifest = () => fs.writeFileSync(manifest, JSON.stringify(ids));
  const headers = { Authorization: 'Bearer review-admin-session' };
  const api = async (method, route, data) => {
    const response = await page.request[method](base + '/api' + route, { headers, data });
    assert(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  try {
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('cadence_auth', '1');
      sessionStorage.setItem('cadence_session_token', 'review-admin-session');
      sessionStorage.setItem('cadence_current_user', JSON.stringify({ userId: '2', name: 'Review Admin', email: 'admin@example.test', role: 'admin' }));
    });
    await page.goto(base + '/master-data');
    await page.getByRole('button', { name: 'Add Patient', exact: true }).click();
    for (const [label, value] of [['First Name', 'Editor'], ['Last Name', marker], ['Date of Birth', '1980-01-01'],
      ['Member ID', marker], ['Mobile number (with country code)', '+12025550110']]) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole('dialog').getByRole('button', { name: 'Add Patient', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const patient = (await api('get', '/master-data/patients')).find(row => row.member_id === marker);
    assert(patient, 'Existing Add Patient flow must continue working');
    ids.patients.push(patient.id); saveManifest();
    for (let i = 0; i < 2; i++) {
      const appointment = await api('post', '/appointments', { patient_id: patient.id, provider_id: 1,
        patient_phone: '+12025550110', appointment_type: marker, scheduled_at: '2090-01-20T14:30', timezone: 'UTC', location: 'Review' });
      ids.appointments.push(appointment.id); saveManifest();
    }
    await page.goto(`${base}/appointments/scheduling/${ids.appointments[0]}`);
    await page.getByRole('button', { name: 'Edit patient', exact: true }).click();
    const details = [
      ['First Name', 'Shared', 'first_name'], ['Last Name', marker, 'last_name'],
      ['Date of Birth', '1982-03-04', 'date_of_birth'], ['Member ID', marker + '-updated', 'member_id'],
      ['Group Number', 'GROUP-UPDATED', 'group_number'], ['Policy Number', 'POLICY-UPDATED', 'policy_number'],
      ['Subscriber Name', 'Updated Subscriber', 'subscriber_name'], ['Mobile number (with country code)', '+12025550111', 'phone'],
    ];
    for (const [label, value] of details) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel('Relationship', { exact: true }).selectOption('spouse');
    await page.screenshot({ path: path.join(process.env.TEMP, 'cadence-shared-patient-editor-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Update Patient', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const updated = await api('get', `/master-data/patients/${patient.id}`);
    for (const [, value, key] of details) assert.equal(updated[key], value);
    assert.equal(updated.relationship, 'spouse');
    for (const id of ids.appointments) {
      const record = await api('get', `/appointments/${id}`);
      assert.equal(record.patient_name, `Shared ${marker}`);
      assert.equal(record.patient_phone, '+12025550111');
      assert.equal(record.group_number, 'GROUP-UPDATED');
    }
    await page.goto(base + '/master-data');
    await page.getByRole('textbox').first().fill(marker);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.getByLabel('First Name', { exact: true }).inputValue(), 'Shared');
    // A stale form must not restore an untouched phone changed in another screen.
    await api('patch', `/master-data/patients/${patient.id}`, { phone: '+12025550112' });
    await page.getByLabel('First Name', { exact: true }).fill('Master');
    await page.getByLabel('Date of Birth', { exact: true }).fill('1983-04-05');
    await page.getByRole('button', { name: 'Update Patient', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    const fromMaster = await api('get', `/appointments/${ids.appointments[0]}`);
    assert.equal(fromMaster.patient_name, `Master ${marker}`);
    assert.equal(fromMaster.date_of_birth, '1983-04-05');
    assert.equal(fromMaster.patient_phone, '+12025550112');
    await page.goto(`${base}/appointments/scheduling/${ids.appointments[0]}`);
    await page.getByRole('button', { name: 'Edit appointment', exact: true }).click();
    await page.getByLabel(/^Patient mobile/).fill('+12025550113');
    await page.getByRole('button', { name: 'Save appointment', exact: true }).click();
    await page.getByRole('heading', { name: 'Edit appointment', exact: true }).waitFor({ state: 'detached' });
    assert.equal((await api('get', `/master-data/patients/${patient.id}`)).phone, '+12025550113');
    assert.equal((await api('get', `/appointments/${ids.appointments[1]}`)).patient_phone, '+12025550113');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/appointments/reminder/${ids.appointments[0]}`);
    await page.getByRole('button', { name: 'Edit patient', exact: true }).click();
    await page.getByLabel('Subscriber Name', { exact: true }).scrollIntoViewIfNeeded();
    assert(await page.getByLabel('Subscriber Name', { exact: true }).isVisible());
    await page.screenshot({ path: path.join(process.env.TEMP, 'cadence-shared-patient-editor-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.deepEqual(errors, []);
    console.log('PASS: shared patient editor from appointments and Master Data, every field, two-way phone sync, stale-field preservation, both appointment tabs and mobile');
  } finally {
    saveManifest();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
