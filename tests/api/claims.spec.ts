import { test, expect } from '@playwright/test';

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://colorless-cardinal-959.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';
const auth = () => ({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

// Resolve required FKs from the running deployment so we use real Convex IDs.
async function getFkIds(request: any): Promise<{
  payerId: string;
  patientId: string;
  providerId: string;
}> {
  const payersRes = await request.get(`${API_BASE}/v1/payers`, { headers: auth() });
  expect(payersRes.status()).toBe(200);
  const payers = (await payersRes.json()).payers;
  expect(payers.length).toBeGreaterThan(0);

  // /v1/claim-cases?limit=1 returns claims with patientId/providerId we can reuse.
  const claimsRes = await request.get(`${API_BASE}/v1/claim-cases?limit=1`, { headers: auth() });
  expect(claimsRes.status()).toBe(200);
  const claims = (await claimsRes.json()).claims;
  expect(claims.length, 'need at least 1 seeded claim to borrow patient/provider IDs').toBeGreaterThan(0);
  const example = claims[0];

  return {
    payerId: payers[0]._id,
    patientId: example.patientId,
    providerId: example.providerId,
  };
}

function uniqueClaimNumber(suffix = ''): string {
  return `TST-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}${suffix}`;
}

function validClaimBody(fk: { payerId: string; patientId: string; providerId: string }, overrides: Record<string, any> = {}) {
  return {
    claimNumber: uniqueClaimNumber(),
    patientId: fk.patientId,
    insuranceContactId: fk.payerId,
    providerId: fk.providerId,
    amount: 12500, // cents
    dateOfService: '2026-01-15',
    cptCodes: ['99213'],
    diagnosisCodes: ['Z00.00'],
    status: 'pending',
    priority: 'medium',
    agingBucket: '0-30',
    ...overrides,
  };
}

test.describe('Cadence /v1/claim-cases — independent (parallel) checks', () => {
  test.describe.configure({ mode: 'parallel' });
  test.beforeEach(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
  });

  test('TC-API-CLM-001 — POST /v1/claim-cases with valid body → 201 + id', async ({ request }) => {
    const fk = await getFkIds(request);
    const res = await request.post(`${API_BASE}/v1/claim-cases`, {
      headers: auth(),
      data: validClaimBody(fk),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
  });

  test('TC-API-CLM-002 — POST with missing required field → 400 + error envelope', async ({ request }) => {
    const fk = await getFkIds(request);
    const bad = validClaimBody(fk);
    delete (bad as any).patientId; // required
    const res = await request.post(`${API_BASE}/v1/claim-cases`, {
      headers: auth(),
      data: bad,
    });
    // Convex throws ArgumentValidationError → http.ts wraps as 400 bad_request.
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.error?.code).toBeDefined();
  });

  test('TC-API-CLM-003 — POST with invalid amount (string instead of number) → 400', async ({ request }) => {
    const fk = await getFkIds(request);
    const res = await request.post(`${API_BASE}/v1/claim-cases`, {
      headers: auth(),
      data: validClaimBody(fk, { amount: 'not-a-number' }),
    });
    expect([400, 422]).toContain(res.status());
  });

  test('TC-API-CLM-004 — GET /v1/claim-cases?limit=10 → 200 + array length ≤ 10', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/claim-cases?limit=10`, { headers: auth() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.claims)).toBe(true);
    expect(body.claims.length).toBeLessThanOrEqual(10);
    expect(typeof body.total).toBe('number');
  });

  test('TC-API-CLM-010 — POST without claimNumber → 400 (claimNumber is required, no auto-fill)', async ({ request }) => {
    const fk = await getFkIds(request);
    const bad = validClaimBody(fk);
    delete (bad as any).claimNumber;
    const res = await request.post(`${API_BASE}/v1/claim-cases`, {
      headers: auth(),
      data: bad,
    });
    // Documents current behavior: backend requires claimNumber (vs dental cases which auto-fill).
    expect([400, 422]).toContain(res.status());
  });
});

// Tests that share a created record must run in order.
test.describe.serial('Cadence /v1/claim-cases — lifecycle (create → get → patch → delete)', () => {
  test.beforeAll(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
  });

  let createdId: string | null = null;
  let fk: { payerId: string; patientId: string; providerId: string } | null = null;

  test('TC-API-CLM-005 — create then GET /v1/claim-cases/{id} returns matching fields', async ({ request }) => {
    fk = await getFkIds(request);
    const body = validClaimBody(fk);
    const createRes = await request.post(`${API_BASE}/v1/claim-cases`, { headers: auth(), data: body });
    expect(createRes.status()).toBe(201);
    createdId = (await createRes.json()).id;
    expect(createdId).toBeTruthy();

    const getRes = await request.get(`${API_BASE}/v1/claim-cases/${createdId}`, { headers: auth() });
    expect(getRes.status()).toBe(200);
    const got = await getRes.json();
    expect(got._id).toBe(createdId);
    expect(got.claimNumber).toBe(body.claimNumber);
    expect(got.amount).toBe(body.amount);
    expect(got.dateOfService).toBe(body.dateOfService);
  });

  test('TC-API-CLM-006 — PATCH /v1/claim-cases/{id} status → 200', async ({ request }) => {
    expect(createdId, 'previous test must have created a record').toBeTruthy();
    const patchRes = await request.patch(`${API_BASE}/v1/claim-cases/${createdId}`, {
      headers: auth(),
      data: { status: 'in_progress' },
    });
    expect(patchRes.status()).toBe(200);
    const body = await patchRes.json();
    expect(body.success).toBe(true);

    const re = await request.get(`${API_BASE}/v1/claim-cases/${createdId}`, { headers: auth() });
    expect(re.status()).toBe(200);
    expect((await re.json()).status).toBe('in_progress');
  });

  test('TC-API-CLM-007 — PATCH with non-allowlisted status string is currently accepted (documents behavior)', async ({ request }) => {
    expect(createdId).toBeTruthy();
    // Backend claims.update has no enum constraint on status — string is accepted.
    // We assert that the API does not 5xx on weird inputs and returns a deterministic result.
    const res = await request.patch(`${API_BASE}/v1/claim-cases/${createdId}`, {
      headers: auth(),
      data: { status: 'banana_state' },
    });
    expect([200, 400, 422]).toContain(res.status());
    if (res.status() === 200) {
      // No transition validation today — flag for future tightening.
      const re = await request.get(`${API_BASE}/v1/claim-cases/${createdId}`, { headers: auth() });
      expect(re.status()).toBe(200);
    }
  });

  test('TC-API-CLM-008 — DELETE /v1/claim-cases/{id} → 200 success envelope', async ({ request }) => {
    expect(createdId).toBeTruthy();
    const res = await request.delete(`${API_BASE}/v1/claim-cases/${createdId}`, { headers: auth() });
    // http.ts returns jsonResponse({ success: true }) which is 200, not 204.
    expect([200, 204]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test('TC-API-CLM-009 — GET /v1/claim-cases/{deleted-id} → 404', async ({ request }) => {
    expect(createdId).toBeTruthy();
    const res = await request.get(`${API_BASE}/v1/claim-cases/${createdId}`, { headers: auth() });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error?.code).toBe('not_found');
  });
});
