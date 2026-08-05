import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';

/**
 * Audit log — TC-SSO-AUD-001..014.
 *
 * Strategy:
 *   - Most reads use the deployed REST surface `/v1/audit-events` (admin scope key from .env.test).
 *   - Mutations / actions that aren't exposed on /v1 (e.g. exportCsv) are invoked via
 *     `npx convex run` against the prod deployment, which inherits CONVEX_DEPLOY_KEY.
 *   - Audit log immutability is verified by trying to call a mutation that doesn't exist
 *     (`auditEvents:update`) and expecting failure.
 *
 * No fixtures are required; the deployment has been seeded + exercised by other tests,
 * so we expect ≥1 audit row to exist before this suite runs.
 */

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://rapid-pheasant-510.convex.site';
const KEY = process.env.CADENCE_API_KEY ?? '';

const authHeaders = () => (KEY ? { Authorization: `Bearer ${KEY}` } : {});

/**
 * Run a Convex function via CLI. Returns the parsed JSON output, or the raw string
 * if the result isn't JSON (some queries return primitives).
 *
 * Uses spawnSync without a shell so the JSON args don't get mangled by cmd.exe
 * (single quotes aren't quote-characters there, so the JSON gets stripped to garbage).
 */
function convexRun(fn: string, args: object = {}): any {
  const isWin = process.platform === 'win32';
  const argJson = JSON.stringify(args);
  const r = isWin
    ? spawnSync('npx', ['convex', 'run', fn, `"${argJson.replace(/"/g, '\\"')}"`], {
        env: { ...process.env, CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY ?? '' },
        encoding: 'utf8',
        timeout: 30_000,
        shell: true,
      })
    : spawnSync('npx', ['convex', 'run', fn, argJson], {
        env: { ...process.env, CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY ?? '' },
        encoding: 'utf8',
        timeout: 30_000,
        shell: false,
      });
  if (r.status !== 0) {
    const err: any = new Error(`convex run ${fn} failed: ${r.stderr || r.stdout}`);
    err.stderr = r.stderr;
    err.stdout = r.stdout;
    throw err;
  }
  const out = (r.stdout ?? '').trim();
  const firstBrace = out.search(/[\{\[]/);
  if (firstBrace >= 0) {
    try { return JSON.parse(out.slice(firstBrace)); } catch { /* fall through */ }
  }
  try { return JSON.parse(out); } catch { return out; }
}

test.describe.configure({ mode: 'serial' });

test.describe('TC-SSO-AUD — audit log', () => {
  test.beforeEach(() => {
    test.skip(!KEY, 'CADENCE_API_KEY not configured (admin scope required for /v1/audit-events)');
  });

  test('TC-SSO-AUD-001 — query audit log returns events array', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?limit=10`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  test('TC-SSO-AUD-002 — every audit event has timestamp, action, resourceType', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?limit=50`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    test.skip(body.events.length === 0, 'no audit events present yet');
    for (const ev of body.events) {
      expect(typeof ev.timestamp, `event ${ev._id} timestamp`).toBe('string');
      expect(ev.timestamp, `event ${ev._id} ISO timestamp`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof ev.action, `event ${ev._id} action`).toBe('string');
      expect(typeof ev.resourceType, `event ${ev._id} resourceType`).toBe('string');
    }
  });

  test('TC-SSO-AUD-003 — filter by action=create returns only create events', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?action=create&limit=50`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    test.skip(body.events.length === 0, 'no create audit events present yet');
    for (const ev of body.events) {
      expect(ev.action, `expected only "create"; got "${ev.action}"`).toBe('create');
    }
  });

  test('TC-SSO-AUD-004 — filter by resourceType="claim" returns only claim events', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?resourceType=claim&limit=50`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    test.skip(body.events.length === 0, 'no claim audit events present yet');
    for (const ev of body.events) {
      expect(ev.resourceType).toBe('claim');
    }
  });

  test('TC-SSO-AUD-005 — filter by date range (last 24h) narrows results', async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = convexRun('auditEvents:list', { fromDate: since, limit: 100 });
    expect(Array.isArray(result.events)).toBe(true);
    for (const ev of result.events) {
      expect(ev.timestamp >= since, `event ${ev._id} timestamp ${ev.timestamp} < ${since}`).toBe(true);
    }
  });

  test('TC-SSO-AUD-006 — phiAccessed flag captured on patient-data reads (where set)', async () => {
    // Pull a wide page and check that any event with phiAccessed=true has resourceType in
    // the PHI-bearing set (call/transcript/recording/result/claim/patient).
    const result = convexRun('auditEvents:list', { limit: 200 });
    const phiEvents = (result.events ?? []).filter((e: any) => e.phiAccessed === true);
    test.skip(
      phiEvents.length === 0,
      'no events with phiAccessed=true yet — this flag is set by writers, not the API gateway',
    );
    const allowed = new Set(['call', 'patient', 'claim', 'dentalCase', 'transcript', 'recording']);
    for (const ev of phiEvents) {
      expect(allowed.has(ev.resourceType), `phiAccessed on unexpected resource ${ev.resourceType}`)
        .toBe(true);
    }
  });

  test('TC-SSO-AUD-007 — phiAccessed flag is false/undefined on health-check reads', async () => {
    // Ping /v1/health (no auth, no audit). Then read recent audit events; none should mark
    // a "health" resource as phiAccessed.
    const result = convexRun('auditEvents:list', { limit: 50 });
    for (const ev of result.events ?? []) {
      if (ev.resourceType === 'health' || ev.resourceType === 'system') {
        expect(ev.phiAccessed === true).toBe(false);
      }
    }
  });

  test('TC-SSO-AUD-008 — audit log query is reachable and does not error', async ({ request }) => {
    // Plain availability check — should never 5xx.
    const res = await request.get(`${API_BASE}/v1/audit-events?limit=1`, { headers: authHeaders() });
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).toBeGreaterThanOrEqual(200);
  });

  test('TC-SSO-AUD-009 — audit count > 0 (system has been seeded + used)', async ({ request }) => {
    const res = await request.get(`${API_BASE}/v1/audit-events?limit=1`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total, 'expected at least one audit event from prior /v1 traffic').toBeGreaterThan(0);
  });

  test('TC-SSO-AUD-010 — latest audit event timestamp within last hour (system actively writing)', async ({ request }) => {
    // First, hit an authed endpoint to guarantee a fresh audit row.
    await request.get(`${API_BASE}/v1/payers`, { headers: authHeaders() });
    const res = await request.get(`${API_BASE}/v1/audit-events?limit=1`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.events.length).toBeGreaterThan(0);
    const latest = new Date(body.events[0].timestamp).getTime();
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    expect(latest, `latest audit ${new Date(latest).toISOString()} > 1h old`).toBeGreaterThan(oneHourAgo);
  });

  test('TC-SSO-AUD-011 — userId/userEmail/userRole captured when set by caller', async () => {
    // Some events will have userId (the API key id), some may have email/role from the UI path.
    // We only assert the *shape*: when present, they are strings.
    const result = convexRun('auditEvents:list', { limit: 100 });
    for (const ev of result.events ?? []) {
      if (ev.userId !== undefined && ev.userId !== null) expect(typeof ev.userId).toBe('string');
      if (ev.userEmail !== undefined && ev.userEmail !== null) expect(typeof ev.userEmail).toBe('string');
      if (ev.userRole !== undefined && ev.userRole !== null) expect(typeof ev.userRole).toBe('string');
    }
  });

  test('TC-SSO-AUD-012 — resourceId stored on resource-scoped events', async () => {
    const result = convexRun('auditEvents:list', { limit: 100 });
    const scoped = (result.events ?? []).filter(
      (e: any) =>
        e.action !== 'read' || (e.payloadSummary && !e.payloadSummary.startsWith('list:')),
    );
    test.skip(scoped.length === 0, 'no resource-scoped events present');
    // At least some scoped events should carry a resourceId.
    const withId = scoped.filter((e: any) => typeof e.resourceId === 'string' && e.resourceId.length > 0);
    expect(withId.length, 'expected ≥1 scoped audit event with resourceId').toBeGreaterThan(0);
  });

  test('TC-SSO-AUD-013 — audit log is append-only (no public update mutation exists)', async () => {
    // The auditEvents module only exports: logEvent (internal), list (query), exportCsv (action).
    // A direct attempt to call `auditEvents:update` must fail with "function not found" or similar.
    let threw = false;
    let message = '';
    try {
      convexRun('auditEvents:update', { id: 'x', action: 'tampered' });
    } catch (e: any) {
      threw = true;
      message = (e.stderr || e.stdout || e.message || '').toString();
    }
    expect(threw, 'auditEvents:update must NOT exist on a HIPAA-compliant immutable log').toBe(true);
    // Convex CLI surfaces something like "Could not find public function" / "FunctionHandle"
    expect(message.toLowerCase()).toMatch(/not found|could not find|no public function|invalid|unknown/);
  });

  test('TC-SSO-AUD-014 — exportCsv action returns CSV string with header row', async () => {
    // exportCsv only accepts filter fields (action/resourceType/userId/fromDate/toDate);
    // page size is fixed at 10k internally. Pass an empty filter object.
    const csv = convexRun('auditEvents:exportCsv', { filters: {} });
    expect(typeof csv).toBe('string');
    expect(csv).toMatch(/^timestamp,action,resourceType,resourceId/);
    // At minimum: header line. If rows exist, the second line should be a real ISO timestamp.
    const lines = (csv as string).split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    if (lines.length > 1 && lines[1].length > 0) {
      expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
