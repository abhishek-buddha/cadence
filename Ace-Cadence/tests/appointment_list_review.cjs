const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const baseURL = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:5173';
assert(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('cadence_auth', '1');
      sessionStorage.setItem('cadence_session_token', 'review-admin-session');
      sessionStorage.setItem('cadence_current_user', JSON.stringify({ userId: '2', name: 'Review Admin', email: 'admin@example.test', role: 'admin' }));
    });
    await page.goto(`${baseURL}/appointments`);
    await page.getByRole('link', { name: 'Maria Alvarez', exact: true }).waitFor();
    const response = await page.request.get(`${baseURL}/api/appointments`, { headers: { Authorization: 'Bearer review-admin-session' } });
    assert(response.ok());
    const records = await response.json();
    const ids = () => page.locator('tbody a').evaluateAll(links => links.map(link => Number(link.href.split('/').pop())));
    const allIds = records.map(record => record.id);
    assert.equal(records.length, 10, 'Curated review fixtures must be loaded');
    assert.deepEqual((await page.getByRole('columnheader').allTextContents()).slice(0, 4), ['Patient Name', 'Appointment Status', 'Call Status', 'Appointment Date/Time']);
    assert.equal(await page.getByRole('columnheader', { name: /^(Call Outcome|Follow-up)$/ }).count(), 0);
    const status = await page.getByRole('columnheader', { name: 'Call Status', exact: true }).boundingBox();
    assert(status.x + status.width < 900, 'Both status columns must be visible near the front');
    await page.getByText('2026-12-18 9:00 AM', { exact: true }).waitFor();
    await page.getByText('2026-11-26 9:14 AM', { exact: true }).waitFor();
    for (const [booking, call, search] of [
      ['scheduled', '', ''], ['rescheduled', '', ''], ['cancelled', '', ''],
      ['', 'not_called', ''], ['', 'no_answer', ''], ['', 'completed', ''], ['', 'failed', ''], ['', 'callback_needed', ''],
      ['rescheduled', 'completed', ''], ['cancelled', 'no_answer', ''], ['scheduled', 'completed', 'Maria'],
    ]) {
      await page.getByLabel('Booking status', { exact: true }).selectOption(booking);
      await page.getByLabel('Call status', { exact: true }).selectOption(call);
      await page.getByRole('textbox', { name: 'Search patients, providers, or status' }).fill(search);
      const expected = records.filter(r => {
        const displayStatus = ['initiating', 'ringing', 'in_progress'].includes(r.last_call_status) ? r.last_call_status : r.callback_requested_at ? 'callback_needed' : r.last_call_status || 'not_called';
        return (!booking || r.status === booking) && (!call || displayStatus === call) && (!search || r.patient_name.includes(search));
      }).map(r => r.id);
      await page.waitForFunction(count => document.querySelectorAll('tbody a').length === count, expected.length);
      assert.deepEqual(await ids(), expected);
      if (!expected.length) assert(await page.getByText('No matching appointments', { exact: true }).isVisible());
    }
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.deepEqual(await ids(), allIds);
    assert.equal(await page.getByRole('tablist', { name: 'Appointment views' }).count(), 0);
    assert.deepEqual(await ids(), allIds);
    await page.screenshot({ path: path.join(process.env.TEMP, 'cadence-appointment-tags-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Toolbar must wrap within mobile width');
    await page.screenshot({ path: path.join(process.env.TEMP, 'cadence-appointment-tags-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: 'Maria Alvarez', exact: true }).click();
    assert.match(page.url(), /\/appointments\/\d+$/);
    await page.getByRole('heading', { name: 'Call History, Transcripts & Recordings', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Call patient', exact: true }).isVisible());
    assert(await page.getByRole('button', { name: 'Edit appointment', exact: true }).isVisible());
    assert.equal(await page.getByRole('heading', { name: /No-Show Risk|Call Attempt History|Preferred Date\/Time Options|Confirmed Appointment/ }).count(), 0);
    await page.locator('details summary').first().click();
    await page.getByRole('heading', { name: 'Voice agent transcript', exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(process.env.TEMP, 'cadence-unified-appointment-desktop.png'), fullPage: true, animations: 'disabled' });
    const id = page.url().split('/').pop();
    for (const route of ['scheduling', 'reminder']) {
      await page.goto(`${baseURL}/appointments/${route}/${id}`);
      await page.getByRole('heading', { name: 'Appointment Details', exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Call patient', exact: true }).isVisible());
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(process.env.TEMP, 'cadence-unified-appointment-mobile.png'), fullPage: true, animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log('PASS: filters, date format, front statuses, unified list/detail, merged transcript history, legacy links and mobile layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
