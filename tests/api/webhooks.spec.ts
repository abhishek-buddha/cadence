import { test, expect } from '@playwright/test';

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://rapid-pheasant-510.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';
const auth = () => ({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

// We use a webhook.site receiver if WEBHOOK_TEST_URL is set; otherwise we fall back to a
// well-known HTTPS URL that returns 200 (httpbin) so backend mutations succeed without
// requiring out-of-band setup.
const TEST_HOOK_URL = process.env.WEBHOOK_TEST_URL ?? 'https://httpbin.org/post';

test.describe.serial('Cadence /v1/webhooks — lifecycle', () => {
  test.beforeAll(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
  });

  let createdId: string | null = null;

  test('TC-API-WH-001 — POST /v1/webhooks {url, events} → 201 + id', async ({ request }) => {
    const res = await request.post(`${API_BASE}/v1/webhooks`, {
      headers: auth(),
      data: {
        url: TEST_HOOK_URL,
        events: ['call.completed', 'claim.updated'],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
    createdId = body.id;
  });

  test('TC-API-WH-002 — GET /v1/webhooks → array contains the new subscription', async ({ request }) => {
    expect(createdId).toBeTruthy();
    const res = await request.get(`${API_BASE}/v1/webhooks`, { headers: auth() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.subscriptions)).toBe(true);
    const found = body.subscriptions.find((s: any) => s._id === createdId);
    expect(found, 'newly created webhook should appear in list').toBeTruthy();
    expect(found.url).toBe(TEST_HOOK_URL);
    expect(found.status).toBe('active');
    // Backend issues a secret on subscribe; it must be returned in list.
    expect(typeof found.secret).toBe('string');
    expect(found.secret.length).toBeGreaterThan(0);
  });

  test('TC-API-WH-003 — POST /v1/webhooks/{id}/test returns within 5s', async ({ request }) => {
    expect(createdId).toBeTruthy();
    const t0 = Date.now();
    const res = await request.post(`${API_BASE}/v1/webhooks/${createdId}/test`, {
      headers: auth(),
      data: {},
    });
    const elapsed = Date.now() - t0;
    expect(res.status()).toBe(200);
    expect(elapsed, `test-fire took ${elapsed}ms`).toBeLessThan(5000);
    const body = await res.json();
    expect(body).toHaveProperty('deliveryId');
  });

  test('TC-API-WH-004 — DELETE /v1/webhooks/{id} → 200 success envelope', async ({ request }) => {
    expect(createdId).toBeTruthy();
    const res = await request.delete(`${API_BASE}/v1/webhooks/${createdId}`, { headers: auth() });
    expect([200, 204]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test('TC-API-WH-005 — POST /v1/webhooks with non-https URL → 400', async ({ request }) => {
    const res = await request.post(`${API_BASE}/v1/webhooks`, {
      headers: auth(),
      data: {
        url: 'http://example.com/hook',
        events: ['call.completed'],
      },
    });
    // webhooks.subscribe throws "Webhook URL must use https://" → http.ts returns 400.
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.error?.message || '').toMatch(/https/i);
  });
});
