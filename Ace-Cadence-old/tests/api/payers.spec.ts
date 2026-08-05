import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://rapid-pheasant-510.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';
const auth = () => ({ Authorization: `Bearer ${KEY}` });

test.describe('Cadence /v1/payers', () => {
  test.beforeEach(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
  });

  test('TC-API-PAY-001 — list payers, count > 0', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/payers`, { headers: auth() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.payers)).toBe(true);
    expect(body.payers.length, 'expected seeded demo payers').toBeGreaterThan(0);
  });

  test('TC-API-PAY-002 — payer object has expected fields', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/payers`, { headers: auth() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const sample = body.payers[0];
    expect(sample).toBeTruthy();
    expect(typeof sample._id).toBe('string');
    expect(typeof sample.name).toBe('string');
    expect(typeof sample.phone).toBe('string');
    // userId is on every record per schema
    expect(typeof sample.userId).toBe('string');
  });

  test('TC-API-PAY-003 — bogus payerId path returns 404 from generic router OR a defined error', async ({ request }) => {
    // /v1/payers/{id} is not implemented as a single-record route in http.ts. The Convex
    // HTTP router will respond with its own 404 for an unrouted path. Either is acceptable here.
    const res = await request.get(`${API_BASE}/v1/payers/does_not_exist_123`, { headers: auth() });
    expect([404, 405]).toContain(res.status());
  });

  test('TC-API-PAY-004 — array shape stable (pagination not implemented for v1; returns full array)', async ({ request }) => {
    const a = await request.get(`${API_BASE}/v1/payers`, { headers: auth() });
    const b = await request.get(`${API_BASE}/v1/payers?limit=1`, { headers: auth() });
    expect(a.status()).toBe(200);
    expect(b.status()).toBe(200);
    const aJson = await a.json();
    const bJson = await b.json();
    // Pagination is unimplemented on /v1/payers — the response shape must still be the same.
    expect(Array.isArray(aJson.payers)).toBe(true);
    expect(Array.isArray(bJson.payers)).toBe(true);
  });

  test('TC-API-PAY-005 — Content-Type: application/json', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/payers`, { headers: auth() });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/application\/json/i);
  });
});
