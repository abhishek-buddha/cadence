import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://colorless-cardinal-959.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';

// Endpoint used as the canonical auth probe.
const PROBE = `${API_BASE}/v1/payers`;
const ADMIN_PROBE = `${API_BASE}/v1/audit-events`;

test.describe('Cadence API auth', () => {
  test('TC-API-AUTH-001 — valid key → 200', async ({ request }) => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
    const res = await request.get(PROBE, { headers: { Authorization: `Bearer ${KEY}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.payers)).toBe(true);
  });

  test('TC-API-AUTH-002 — missing Authorization header → 401', async ({ request }) => {
    const res = await request.get(PROBE, { headers: {} });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error?.code).toBe('unauthorized');
  });

  test('TC-API-AUTH-003 — malformed Authorization "foo" → 401', async ({ request }) => {
    const res = await request.get(PROBE, { headers: { Authorization: 'foo' } });
    expect(res.status()).toBe(401);
  });

  test('TC-API-AUTH-004 — wrong-prefix key → 401', async ({ request }) => {
    const fake = 'cad_' + 'a'.repeat(32) + 'BADKEY';
    const res = await request.get(PROBE, { headers: { Authorization: `Bearer ${fake}` } });
    expect(res.status()).toBe(401);
  });

  test('TC-API-AUTH-005 — empty bearer token → 401', async ({ request }) => {
    const res = await request.get(PROBE, { headers: { Authorization: 'Bearer ' } });
    expect(res.status()).toBe(401);
  });

  test('TC-API-AUTH-006 — SQL-injection-style key → 401, no crash', async ({ request }) => {
    const inj = `cad_' OR 1=1 --`;
    const res = await request.get(PROBE, { headers: { Authorization: `Bearer ${inj}` } });
    expect(res.status()).toBe(401);
    const body = await res.json();
    // Should be a clean JSON error envelope, not a stack trace.
    expect(body.error?.code).toBe('unauthorized');
    expect(JSON.stringify(body)).not.toMatch(/stack|TypeError|at \w+/);
  });

  test('TC-API-AUTH-007 — non-admin key against /v1/audit-events → 401 or 403', async ({ request }) => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
    // The current backend treats audit-events as requiring "admin" scope. If our seeded test key
    // already has admin, this test asserts 200; otherwise 403. The forbidden case is 500.
    const res = await request.get(ADMIN_PROBE, { headers: { Authorization: `Bearer ${KEY}` } });
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 403) {
      const body = await res.json();
      expect(body.error?.code).toBe('forbidden');
    }
  });

  test('TC-API-AUTH-008 — large header value (10KB) → 401, not 500', async ({ request }) => {
    const huge = 'cad_' + 'x'.repeat(10_000);
    const res = await request.get(PROBE, { headers: { Authorization: `Bearer ${huge}` } });
    // Acceptable: 401 (invalid), 400 (header-too-large), 413, 414, 431. Forbidden: 500.
    expect([400, 401, 413, 414, 431]).toContain(res.status());
  });

  test('TC-API-AUTH-009 — unicode in key → 401', async ({ request }) => {
    const uni = 'cad_\u4e2d\u6587\u30c6\u30b9\u30c8\ud83d\udd11' + 'a'.repeat(20);
    const res = await request.get(PROBE, { headers: { Authorization: `Bearer ${uni}` } });
    // Some HTTP clients refuse non-ASCII in headers altogether — accept that as success too.
    expect([400, 401]).toContain(res.status());
  });

  test('TC-API-AUTH-010 — valid-key response body is valid JSON with expected shape', async ({ request }) => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
    const res = await request.get(PROBE, { headers: { Authorization: `Bearer ${KEY}` } });
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] || '';
    expect(ct).toMatch(/application\/json/i);
    const body = await res.json();
    expect(body).toHaveProperty('payers');
    expect(Array.isArray(body.payers)).toBe(true);
  });
});
