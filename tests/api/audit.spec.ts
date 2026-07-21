import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://colorless-cardinal-959.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';
const NON_ADMIN_KEY = process.env.CADENCE_API_KEY_NONADMIN ?? '';
const auth = () => ({ Authorization: `Bearer ${KEY}` });

test.describe('Cadence /v1/audit-events', () => {
  test.beforeEach(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
  });

  test('TC-API-AUD-001 — GET /v1/audit-events with admin key → 200 + events array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events`, { headers: auth() });
    if (res.status() === 403) {
      test.skip(true, 'CADENCE_API_KEY lacks admin scope; provide an admin key to exercise this test');
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
  });

  test('TC-API-AUD-002 — GET /v1/audit-events?action=create → filtered list, all events match filter', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?action=create&limit=20`, { headers: auth() });
    if (res.status() === 403) test.skip(true, 'admin scope required');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    for (const ev of body.events) {
      expect(ev.action).toBe('create');
    }
  });

  test('TC-API-AUD-003 — pagination params (limit) honoured', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?limit=3`, { headers: auth() });
    if (res.status() === 403) test.skip(true, 'admin scope required');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.events.length).toBeLessThanOrEqual(3);
  });

  test('TC-API-AUD-004 — resourceType filter narrows results', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?resourceType=call&limit=10`, { headers: auth() });
    if (res.status() === 403) test.skip(true, 'admin scope required');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const ev of body.events) {
      expect(ev.resourceType).toBe('call');
    }
  });

  test('TC-API-AUD-005 — non-admin key → 403 with forbidden envelope', async ({ request }) => {
    test.skip(!NON_ADMIN_KEY, 'CADENCE_API_KEY_NONADMIN not provided; set it to a key without admin scope');
    const res = await request.get(`${API_BASE}/v1/audit-events`, {
      headers: { Authorization: `Bearer ${NON_ADMIN_KEY}` },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error?.code).toBe('forbidden');
    expect(body.error?.message || '').toMatch(/admin/i);
  });
});
