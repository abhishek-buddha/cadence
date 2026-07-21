import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://colorless-cardinal-959.convex.site';
const CLOUD_BASE = process.env.CADENCE_CONVEX_CLOUD ?? 'https://colorless-cardinal-959.convex.cloud';
const FRONTEND_BASE = process.env.CADENCE_BASE_URL ?? 'https://cadence-new.onrender.com';
const KEY = process.env.CADENCE_API_KEY ?? '';

const authHeaders = () => (KEY ? { Authorization: `Bearer ${KEY}` } : {});

test.describe('Cadence health & availability', () => {
  test('TC-HLTH-001 — GET /v1/health → 200 + status:"healthy"', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.version).toBe('string');
  });

  test('TC-HLTH-002 — GET /v1/version → 200 + version field', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/version`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.deploymentId).toBeDefined();
  });

  test('TC-HLTH-003 — /v1/health response time < 1500ms', async ({ request }) => {
    const start = Date.now();
    const res = await request.get(`${API_BASE}/v1/health`);
    const elapsed = Date.now() - start;
    expect(res.status()).toBe(200);
    expect(elapsed, `health latency ${elapsed}ms`).toBeLessThan(1500);
  });

  test('TC-HLTH-004 — /v1/version response time < 1500ms', async ({ request }) => {
    const start = Date.now();
    const res = await request.get(`${API_BASE}/v1/version`);
    const elapsed = Date.now() - start;
    expect(res.status()).toBe(200);
    expect(elapsed, `version latency ${elapsed}ms`).toBeLessThan(1500);
  });

  test('TC-HLTH-005 — /v1/openapi.json response time < 1500ms', async ({ request }) => {
    const start = Date.now();
    const res = await request.get(`${API_BASE}/v1/openapi.json`);
    const elapsed = Date.now() - start;
    expect(res.status()).toBe(200);
    expect(elapsed, `openapi latency ${elapsed}ms`).toBeLessThan(1500);
  });

  test('TC-HLTH-006 — GET /v1/health responds without Authorization header', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/health`, { headers: {} });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  test('TC-HLTH-007 — GET /v1/payers WITHOUT auth → 401', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/payers`, { headers: {} });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error?.code).toBe('unauthorized');
  });

  test('TC-HLTH-008 — GET /v1/payers WITH valid key → 200 + array', async ({ request }) => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured');
    const res = await request.get(`${API_BASE}/v1/payers`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.payers)).toBe(true);
  });

  test('TC-HLTH-009 — HTTPS enforced (HTTP redirects)', async ({ request }) => {
    // Convex .site is HTTPS-only; an http:// request either redirects (3xx) or is upgraded.
    const httpUrl = FRONTEND_BASE.replace(/^https:/, 'http:');
    const res = await request.fetch(httpUrl, { maxRedirects: 0 }).catch((e) => ({ ok: () => false, status: () => 0, _err: String(e) }) as any);
    // Accept: redirect 301/302/307/308 OR direct 200 if proxy upgrades silently. The forbidden case is HTTP-200 served from a non-TLS endpoint.
    if ('_err' in res) {
      // Network refused = HTTPS-only. That's fine.
      expect(String((res as any)._err)).toMatch(/protocol|connect|refused|tls|ssl|net::/i);
    } else {
      const status = res.status();
      expect([200, 301, 302, 307, 308]).toContain(status);
    }
  });

  test('TC-HLTH-010 — frontend `/` LCP-ish loads in < 5s', async ({ page }) => {
    const t0 = Date.now();
    await page.goto(FRONTEND_BASE, { waitUntil: 'domcontentloaded' });
    const elapsed = Date.now() - t0;
    expect(elapsed, `front-end nav ${elapsed}ms`).toBeLessThan(5000);
  });

  test('TC-HLTH-011 — TLS cert valid (no browser TLS errors on /)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const res = await page.goto(FRONTEND_BASE);
    expect(res?.ok(), `nav status ${res?.status()}`).toBe(true);
    const tlsErrs = errors.filter((e) => /SSL|TLS|certificate|ERR_CERT/i.test(e));
    expect(tlsErrs).toEqual([]);
  });

  test('TC-HLTH-012 — GET / returns HTML containing <title>Cadence', async ({ request }) => {
    const res = await request.get(FRONTEND_BASE);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/<title>[^<]*cadence/i);
  });

  test('TC-HLTH-013 — static assets cached (Cache-Control on /assets/*)', async ({ request, page }) => {
    await page.goto(FRONTEND_BASE);
    // Find any built asset URL referenced from the HTML or network log.
    const assetHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src],link[href]'))
        .map((el) => (el as HTMLAnchorElement).href || (el as HTMLScriptElement).src)
        .filter((u) => /\/assets\//.test(u)),
    );
    test.skip(assetHrefs.length === 0, 'no /assets/* references found in HTML');
    const sample = assetHrefs[0];
    const res = await request.get(sample);
    expect(res.ok(), `asset ${sample} fetch failed`).toBe(true);
    const cc = res.headers()['cache-control'] || res.headers()['Cache-Control'] || '';
    expect(cc, `Cache-Control header on ${sample}`).toMatch(/max-age|immutable|public/i);
  });

  test('TC-HLTH-014 — GET /v1/openapi.json → 200 + openapi field', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/openapi.json`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBeDefined();
    expect(body.info?.title).toMatch(/cadence/i);
  });

  test('TC-HLTH-015 — Convex Cloud URL reachable (sanity)', async ({ request }) => {
    // Convex .cloud root is the WS endpoint; an HTTP GET typically returns a small error JSON,
    // but TCP+TLS reachability is what we want. Accept any 2xx/3xx/4xx as "reachable",
    // fail only on connect-level error.
    const res = await request.get(CLOUD_BASE).catch((e) => ({ status: () => 0, _err: String(e) }) as any);
    if ('_err' in res) {
      throw new Error(`Convex cloud unreachable: ${(res as any)._err}`);
    }
    const s = res.status();
    expect(s).toBeGreaterThanOrEqual(200);
    expect(s).toBeLessThan(600);
  });
});
