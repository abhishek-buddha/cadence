import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';

/**
 * Webhook delivery — TC-API-WH-006..015.
 *
 * Receiver: https://webhook.site (free, no auth needed).
 *   - POST https://webhook.site/token  → { uuid, url } (token + receiver URL)
 *   - GET  https://webhook.site/token/<uuid>/requests?sorting=newest → received deliveries
 *   - DELETE https://webhook.site/token/<uuid>  → cleanup
 *
 * Each test:
 *   1. Mints a fresh webhook.site token (or reuses CADENCE_WEBHOOK_SITE_TOKEN if set).
 *   2. Subscribes that URL via POST /v1/webhooks.
 *   3. Triggers delivery (testFire or otherwise).
 *   4. Polls webhook.site until ≥1 request matches, or 30s timeout.
 *   5. Asserts headers / payload shape.
 *   6. Best-effort revokes the subscription.
 *
 * Tests requiring webhook.site Pro features (configurable status codes for retry/dead-letter)
 * are skipped with a documented reason.
 */

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://colorless-cardinal-959.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';
const WEBHOOK_SITE = 'https://webhook.site';

const authHeaders = () => (KEY ? { Authorization: `Bearer ${KEY}` } : {});

async function newWebhookSiteToken(api: APIRequestContext): Promise<{ uuid: string; url: string }> {
  const res = await api.post(`${WEBHOOK_SITE}/token`);
  if (!res.ok()) throw new Error(`webhook.site /token failed ${res.status()}`);
  const body = await res.json();
  const uuid = body.uuid;
  return { uuid, url: `${WEBHOOK_SITE}/${uuid}` };
}

async function deleteWebhookSiteToken(api: APIRequestContext, uuid: string): Promise<void> {
  try {
    await api.delete(`${WEBHOOK_SITE}/token/${uuid}`);
  } catch {
    /* best-effort */
  }
}

interface ReceivedRequest {
  uuid: string;
  method: string;
  content: string;
  headers: Record<string, string[] | string>;
  created_at: string;
}

async function pollForDelivery(
  api: APIRequestContext,
  uuid: string,
  predicate: (r: ReceivedRequest) => boolean,
  timeoutMs = 30_000,
): Promise<ReceivedRequest> {
  const deadline = Date.now() + timeoutMs;
  let lastSeen: ReceivedRequest[] = [];
  while (Date.now() < deadline) {
    const res = await api.get(`${WEBHOOK_SITE}/token/${uuid}/requests?sorting=newest&per_page=20`);
    if (res.ok()) {
      const body = await res.json();
      const data: ReceivedRequest[] = body.data ?? [];
      lastSeen = data;
      const hit = data.find(predicate);
      if (hit) return hit;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for matching webhook delivery. Last ${lastSeen.length} requests: ${JSON.stringify(lastSeen.map((r) => ({ method: r.method, contentLen: r.content?.length ?? 0 })))}`,
  );
}

async function subscribe(api: APIRequestContext, url: string, events: string[]): Promise<string> {
  const res = await api.post(`${API_BASE}/v1/webhooks`, {
    headers: authHeaders(),
    data: { url, events },
  });
  if (!res.ok()) throw new Error(`subscribe failed ${res.status()}: ${await res.text()}`);
  const body = await res.json();
  return body.id;
}

async function revoke(api: APIRequestContext, id: string): Promise<void> {
  try {
    await api.delete(`${API_BASE}/v1/webhooks/${id}`, { headers: authHeaders() });
  } catch {
    /* best-effort */
  }
}

async function testFire(api: APIRequestContext, id: string): Promise<{ deliveryId: string }> {
  const res = await api.post(`${API_BASE}/v1/webhooks/${id}/test`, { headers: authHeaders() });
  if (!res.ok()) throw new Error(`testFire failed ${res.status()}: ${await res.text()}`);
  return await res.json();
}

function headerVal(h: Record<string, string[] | string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === lower) return Array.isArray(v) ? v[0] : v;
  }
  return undefined;
}

test.describe.configure({ mode: 'serial' });

test.describe('TC-API-WH — webhook delivery (receiver: webhook.site)', () => {
  test.beforeEach(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
  });

  test('TC-API-WH-006 — testFire delivered to subscriber within 30s', async () => {
    const api = await pwRequest.newContext();
    const tok = await newWebhookSiteToken(api);
    const subId = await subscribe(api, tok.url, ['call.completed', 'test']);
    try {
      await testFire(api, subId);
      const hit = await pollForDelivery(api, tok.uuid, (r) => r.method === 'POST');
      expect(hit.method).toBe('POST');
    } finally {
      await revoke(api, subId);
      await deleteWebhookSiteToken(api, tok.uuid);
      await api.dispose();
    }
  });

  test('TC-API-WH-007 — X-Cadence-Signature header present on delivered request', async () => {
    const api = await pwRequest.newContext();
    const tok = await newWebhookSiteToken(api);
    const subId = await subscribe(api, tok.url, ['test']);
    try {
      await testFire(api, subId);
      const hit = await pollForDelivery(api, tok.uuid, (r) => r.method === 'POST');
      const sig = headerVal(hit.headers, 'X-Cadence-Signature');
      expect(sig, 'X-Cadence-Signature header missing').toBeDefined();
      expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    } finally {
      await revoke(api, subId);
      await deleteWebhookSiteToken(api, tok.uuid);
      await api.dispose();
    }
  });

  test('TC-API-WH-008 — X-Cadence-Event header matches the event type ("test")', async () => {
    const api = await pwRequest.newContext();
    const tok = await newWebhookSiteToken(api);
    const subId = await subscribe(api, tok.url, ['test']);
    try {
      await testFire(api, subId);
      const hit = await pollForDelivery(api, tok.uuid, (r) => r.method === 'POST');
      const evt = headerVal(hit.headers, 'X-Cadence-Event');
      expect(evt).toBe('test');
      // Bonus: timestamp + delivery-id headers should also be present.
      expect(headerVal(hit.headers, 'X-Cadence-Timestamp')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(headerVal(hit.headers, 'X-Cadence-Delivery-Id')).toBeDefined();
      expect(headerVal(hit.headers, 'X-Cadence-Attempt')).toBe('1');
    } finally {
      await revoke(api, subId);
      await deleteWebhookSiteToken(api, tok.uuid);
      await api.dispose();
    }
  });

  test('TC-API-WH-009 — payload is valid JSON with event/timestamp/payload fields', async () => {
    const api = await pwRequest.newContext();
    const tok = await newWebhookSiteToken(api);
    const subId = await subscribe(api, tok.url, ['test']);
    try {
      await testFire(api, subId);
      const hit = await pollForDelivery(api, tok.uuid, (r) => r.method === 'POST');
      let parsed: any;
      expect(() => {
        parsed = JSON.parse(hit.content);
      }).not.toThrow();
      expect(parsed.event).toBe('test');
      expect(typeof parsed.timestamp).toBe('string');
      expect(parsed.payload).toBeDefined();
      expect(parsed.payload.message).toBe('hello');
    } finally {
      await revoke(api, subId);
      await deleteWebhookSiteToken(api, tok.uuid);
      await api.dispose();
    }
  });

  test('TC-API-WH-010 — multiple sequential testFires each deliver as separate requests', async () => {
    const api = await pwRequest.newContext();
    const tok = await newWebhookSiteToken(api);
    const subId = await subscribe(api, tok.url, ['test']);
    try {
      await testFire(api, subId);
      await testFire(api, subId);
      await testFire(api, subId);
      // Wait until at least 3 deliveries have arrived.
      const deadline = Date.now() + 45_000;
      let count = 0;
      while (Date.now() < deadline) {
        const r = await api.get(`${WEBHOOK_SITE}/token/${tok.uuid}/requests?per_page=20`);
        if (r.ok()) {
          const body = await r.json();
          count = (body.data ?? []).filter((req: any) => req.method === 'POST').length;
          if (count >= 3) break;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }
      expect(count, `expected ≥3 POSTs, saw ${count}`).toBeGreaterThanOrEqual(3);
    } finally {
      await revoke(api, subId);
      await deleteWebhookSiteToken(api, tok.uuid);
      await api.dispose();
    }
  });

  test('TC-API-WH-011 — non-https URL rejected at subscription time (400)', async ({ request }) => {
    const res = await request.post(`${API_BASE}/v1/webhooks`, {
      headers: authHeaders(),
      data: { url: 'http://example.com/insecure', events: ['test'] },
    });
    // Convex `subscribe` mutation throws "Webhook URL must use https://".
    // The HTTP wrapper translates that to 400 bad_request.
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe('bad_request');
    expect(body.error?.message?.toLowerCase()).toMatch(/https/);
  });

  test('TC-API-WH-012 — paused subscription does not deliver', async () => {
    const api = await pwRequest.newContext();
    const tok = await newWebhookSiteToken(api);
    const subId = await subscribe(api, tok.url, ['test']);
    try {
      // The /v1 surface only exposes POST/DELETE for webhooks; pause() is a Convex mutation.
      // Try the CLI path; if it isn't supported, skip with documentation.
      const { execSync } = require('node:child_process');
      let pausedOk = false;
      try {
        execSync(`npx convex run webhooks:pause '{"id":"${subId}"}'`, {
          env: { ...process.env, CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY ?? '' },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30_000,
        });
        pausedOk = true;
      } catch {
        pausedOk = false;
      }
      test.skip(!pausedOk, 'pause not callable via CLI in current deployment');

      await testFire(api, subId);
      // Wait briefly; no delivery should arrive because the subscription is paused.
      await new Promise((r) => setTimeout(r, 8_000));
      const r = await api.get(`${WEBHOOK_SITE}/token/${tok.uuid}/requests?per_page=20`);
      const body = await r.json();
      const posts = (body.data ?? []).filter((req: any) => req.method === 'POST');
      expect(posts.length, 'paused subscription must NOT deliver').toBe(0);
    } finally {
      await revoke(api, subId);
      await deleteWebhookSiteToken(api, tok.uuid);
      await api.dispose();
    }
  });

  test('TC-API-WH-013 — DELETE subscription stops further deliveries', async () => {
    const api = await pwRequest.newContext();
    const tok = await newWebhookSiteToken(api);
    const subId = await subscribe(api, tok.url, ['test']);

    try {
      // First fire — should deliver.
      await testFire(api, subId);
      const first = await pollForDelivery(api, tok.uuid, (r) => r.method === 'POST');
      expect(first).toBeDefined();
      const baselineCount = (
        await (await api.get(`${WEBHOOK_SITE}/token/${tok.uuid}/requests?per_page=20`)).json()
      ).data.filter((r: any) => r.method === 'POST').length;

      // Revoke the subscription.
      await revoke(api, subId);

      // testFire on a revoked sub should either fail or not deliver. Either way, no new POST.
      try {
        await testFire(api, subId);
      } catch {
        /* expected: revoked subs may reject testFire */
      }
      await new Promise((r) => setTimeout(r, 8_000));
      const after = (
        await (await api.get(`${WEBHOOK_SITE}/token/${tok.uuid}/requests?per_page=20`)).json()
      ).data.filter((r: any) => r.method === 'POST').length;
      expect(after, 'revoked subscription should not produce new deliveries').toBeLessThanOrEqual(baselineCount);
    } finally {
      await deleteWebhookSiteToken(api, tok.uuid);
      await api.dispose();
    }
  });

  test('TC-API-WH-014 — retry on 5xx (requires receiver to reply 500) [skipped — webhook.site free tier returns 200 by default]', async () => {
    test.skip(true, 'webhook.site free tier always replies 200; configurable status codes require Pro. See deliverNext() in convex/webhooks.ts: 5xx triggers RETRY_BACKOFF_SECONDS schedule.');
  });

  test('TC-API-WH-015 — dead-letter after 9 attempts (RETRY_BACKOFF_SECONDS exhausted) [skipped — backoff exceeds CI budget (24h+ between attempts 4 and 5)]', async () => {
    test.skip(true, 'RETRY_BACKOFF_SECONDS = [60, 300, 1800, 7200, 28800, 86400, 172800, 345600] — dead-letter after attempt 9 takes ~7 days, far beyond test cycle. Verified in unit tests of webhook.ts:deliverNext if/when backoff is overridable for tests.');
  });
});
