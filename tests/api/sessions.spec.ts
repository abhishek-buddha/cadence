import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://rapid-pheasant-510.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';
const auth = () => ({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

// Fetch payer + a list of claim IDs that share that payer (for medical_claim sessions).
async function getMedicalSessionFixtures(request: any): Promise<{
  payerId: string;
  itemRefs: string[];
  otherPayerId: string | null;
} | null> {
  const claimsRes = await request.get(`${API_BASE}/v1/claim-cases?limit=50`, { headers: auth() });
  if (claimsRes.status() !== 200) return null;
  const claims = (await claimsRes.json()).claims as any[];
  if (claims.length === 0) return null;
  const payerId = claims[0].insuranceContactId;
  const sameP = claims.filter((c) => c.insuranceContactId === payerId).map((c) => c._id);
  const otherP = claims.find((c) => c.insuranceContactId !== payerId)?.insuranceContactId ?? null;
  return { payerId, itemRefs: sameP.slice(0, 3), otherPayerId: otherP };
}

test.describe('Cadence /v1/sessions', () => {
  test.beforeEach(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
  });

  test('TC-API-SES-001 — POST /v1/sessions with valid body → 201 + id', async ({ request }) => {
    const fx = await getMedicalSessionFixtures(request);
    test.skip(!fx || fx.itemRefs.length === 0, 'No seeded claims to assemble a session');
    const res = await request.post(`${API_BASE}/v1/sessions`, {
      headers: auth(),
      data: {
        insuranceContactId: fx!.payerId,
        useCase: 'medical_claim',
        itemRefs: fx!.itemRefs,
        notes: 'playwright test session',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
  });

  test('TC-API-SES-002 — GET /v1/sessions → 200 + sessions array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/sessions`, { headers: auth() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  test('TC-API-SES-003 — GET /v1/sessions/{id} for a freshly created session → 200', async ({ request }) => {
    const fx = await getMedicalSessionFixtures(request);
    test.skip(!fx || fx.itemRefs.length === 0, 'No seeded claims to assemble a session');
    const create = await request.post(`${API_BASE}/v1/sessions`, {
      headers: auth(),
      data: {
        insuranceContactId: fx!.payerId,
        useCase: 'medical_claim',
        itemRefs: fx!.itemRefs.slice(0, 1),
      },
    });
    expect(create.status()).toBe(201);
    const id = (await create.json()).id;
    const get = await request.get(`${API_BASE}/v1/sessions/${id}`, { headers: auth() });
    expect(get.status()).toBe(200);
    const body = await get.json();
    expect(body._id).toBe(id);
    expect(body.useCase).toBe('medical_claim');
    expect(body.status).toBe('queued');
  });

  test('TC-API-SES-004 — POST with mismatched payer items → 400', async ({ request }) => {
    const fx = await getMedicalSessionFixtures(request);
    test.skip(!fx || !fx.otherPayerId, 'Need two payers with seeded claims to test mismatch');
    const res = await request.post(`${API_BASE}/v1/sessions`, {
      headers: auth(),
      data: {
        insuranceContactId: fx!.otherPayerId, // different from items' actual payer
        useCase: 'medical_claim',
        itemRefs: fx!.itemRefs,
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.error?.message || '').toMatch(/insuranceContactId|payer|share/i);
  });

  test('TC-API-SES-005 — POST with > 5 itemRefs → 400', async ({ request }) => {
    const fx = await getMedicalSessionFixtures(request);
    test.skip(!fx || fx.itemRefs.length === 0, 'No seeded claims');
    // Pad the array to 6 entries by repeating a valid id (the backend's MAX_ITEMS=5 check fires first).
    const padded = [
      fx!.itemRefs[0],
      fx!.itemRefs[0],
      fx!.itemRefs[0],
      fx!.itemRefs[0],
      fx!.itemRefs[0],
      fx!.itemRefs[0],
    ];
    const res = await request.post(`${API_BASE}/v1/sessions`, {
      headers: auth(),
      data: {
        insuranceContactId: fx!.payerId,
        useCase: 'medical_claim',
        itemRefs: padded,
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.error?.message || '').toMatch(/max|5/i);
  });
});
