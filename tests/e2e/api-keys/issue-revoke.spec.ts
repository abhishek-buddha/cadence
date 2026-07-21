import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';

/**
 * API key issue / revoke / verify lifecycle — TC-API-KEY-001..010.
 *
 * Surface under test (convex/apiKeys.ts):
 *   - issue({ name, scopes }) → { id, fullKey }      — full key returned ONCE on creation
 *   - list()                  → metadata only (no hash, no fullKey)
 *   - revoke({ id })          → marks status=revoked, sets revokedAt
 *   - verify({ key })         → { valid, scopes?, keyId? }
 *
 * Format: cad_<64 hex chars>; prefix is the first 12 chars (`cad_` + 8 hex).
 */

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://colorless-cardinal-959.convex.site';

interface IssuedKey {
  id: string;
  fullKey: string;
}

function convexRun(fn: string, args: object = {}): any {
  // Cross-platform: on Windows, npx is a .cmd shim → need shell:true + cmd.exe-compatible
  // double-quoted JSON. On posix, shell:false with raw JSON works fine.
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
  // `convex run` prints the function's return value as pretty-printed multi-line JSON.
  // Find the first `{`, `[`, or primitive marker, then accumulate to the end and parse.
  // (Bottom-up line-by-line parsing fails for multi-line objects.)
  const out = (r.stdout ?? '').trim();
  const firstBrace = out.search(/[\{\[]/);
  if (firstBrace >= 0) {
    try {
      return JSON.parse(out.slice(firstBrace));
    } catch {
      /* fall through */
    }
  }
  // Try whole-output parse as a fallback.
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function mintKey(name: string, scopes: string[] = ['claims:read']): IssuedKey {
  const result = convexRun('apiKeys:issue', { name, scopes });
  if (!result?.fullKey) throw new Error(`apiKeys:issue did not return fullKey: ${JSON.stringify(result)}`);
  return { id: result.id, fullKey: result.fullKey };
}

function revokeKey(id: string): void {
  try {
    convexRun('apiKeys:revoke', { id });
  } catch {
    /* best-effort */
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('TC-API-KEY — API key lifecycle', () => {
  test.beforeEach(() => {
    test.skip(!process.env.CONVEX_DEPLOY_KEY, 'CONVEX_DEPLOY_KEY required to mint API keys');
  });

  test('TC-API-KEY-001 — issue returns prefix + fullKey', async () => {
    const result = convexRun('apiKeys:issue', {
      name: 'apikey-001',
      scopes: ['claims:read'],
    });
    try {
      expect(result.id).toBeTruthy();
      expect(typeof result.fullKey).toBe('string');
      expect(result.fullKey).toMatch(/^cad_[0-9a-f]+$/);
    } finally {
      if (result?.id) revokeKey(result.id);
    }
  });

  test('TC-API-KEY-002 — fullKey prefix is exactly 12 chars starting with "cad_"', async () => {
    const k = mintKey('apikey-002');
    try {
      const prefix = k.fullKey.slice(0, 12);
      expect(prefix.length).toBe(12);
      expect(prefix.startsWith('cad_')).toBe(true);
      // After "cad_" the next 8 chars must be hex.
      expect(prefix.slice(4)).toMatch(/^[0-9a-f]{8}$/);
      // Total key is cad_ + 64 hex chars.
      expect(k.fullKey).toMatch(/^cad_[0-9a-f]{64}$/);
    } finally {
      revokeKey(k.id);
    }
  });

  test('TC-API-KEY-003 — list includes the newly issued key (by id + prefix)', async () => {
    const k = mintKey('apikey-003');
    try {
      const all: any[] = convexRun('apiKeys:list', {});
      expect(Array.isArray(all)).toBe(true);
      const found = all.find((x: any) => x._id === k.id);
      expect(found, `key ${k.id} not in list`).toBeDefined();
      expect(found.prefix).toBe(k.fullKey.slice(0, 12));
      expect(found.status).toBe('active');
    } finally {
      revokeKey(k.id);
    }
  });

  test('TC-API-KEY-004 — list does NOT expose the hashed key or full key', async () => {
    const k = mintKey('apikey-004');
    try {
      const all: any[] = convexRun('apiKeys:list', {});
      const found = all.find((x: any) => x._id === k.id);
      expect(found).toBeDefined();
      expect(found).not.toHaveProperty('hashedKey');
      expect(found).not.toHaveProperty('fullKey');
      expect(found).not.toHaveProperty('key');
      // Whatever fields ARE returned must not contain the full secret.
      const json = JSON.stringify(found);
      expect(json).not.toContain(k.fullKey);
      expect(json).not.toContain(k.fullKey.slice(12)); // post-prefix secret half
    } finally {
      revokeKey(k.id);
    }
  });

  test('TC-API-KEY-005 — newly issued key authenticates a real request (200 on /v1/payers)', async ({ request }) => {
    const k = mintKey('apikey-005', ['claims:read']);
    try {
      const res = await request.get(`${API_BASE}/v1/payers`, {
        headers: { Authorization: `Bearer ${k.fullKey}` },
      });
      expect(res.status()).toBe(200);
    } finally {
      revokeKey(k.id);
    }
  });

  test('TC-API-KEY-006 — revoke sets status=revoked + revokedAt timestamp', async () => {
    const k = mintKey('apikey-006');
    convexRun('apiKeys:revoke', { id: k.id });
    const all: any[] = convexRun('apiKeys:list', {});
    const found = all.find((x: any) => x._id === k.id);
    expect(found).toBeDefined();
    expect(found.status).toBe('revoked');
    expect(typeof found.revokedAt).toBe('string');
    expect(found.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('TC-API-KEY-007 — revoked key returns 401 on subsequent requests', async ({ request }) => {
    const k = mintKey('apikey-007');
    revokeKey(k.id);
    const res = await request.get(`${API_BASE}/v1/payers`, {
      headers: { Authorization: `Bearer ${k.fullKey}` },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error?.code).toBe('unauthorized');
  });

  test('TC-API-KEY-008 — invalid scope name rejected at issuance', async () => {
    let threw = false;
    let message = '';
    try {
      convexRun('apiKeys:issue', { name: 'apikey-008', scopes: ['nonexistent:scope'] });
    } catch (e: any) {
      threw = true;
      message = (e.stderr || e.stdout || e.message || '').toString();
    }
    expect(threw, 'expected apiKeys:issue to throw on unknown scope').toBe(true);
    expect(message.toLowerCase()).toMatch(/invalid scope/);
  });

  test('TC-API-KEY-009 — lastUsedAt updates after a successful authenticated request', async ({ request }) => {
    const k = mintKey('apikey-009');
    try {
      // Snapshot lastUsedAt before any usage (should be null/undefined immediately after issue).
      const beforeList: any[] = convexRun('apiKeys:list', {});
      const before = beforeList.find((x: any) => x._id === k.id);
      expect(before).toBeDefined();

      // Make an authenticated call.
      const res = await request.get(`${API_BASE}/v1/payers`, {
        headers: { Authorization: `Bearer ${k.fullKey}` },
      });
      expect(res.status()).toBe(200);

      // Allow the touch mutation a beat to flush.
      await new Promise((r) => setTimeout(r, 1500));

      const afterList: any[] = convexRun('apiKeys:list', {});
      const after = afterList.find((x: any) => x._id === k.id);
      expect(after).toBeDefined();
      expect(typeof after.lastUsedAt).toBe('string');
      expect(after.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // If `before.lastUsedAt` was set (rare on a fresh key), the new one must be later.
      if (before.lastUsedAt) {
        expect(new Date(after.lastUsedAt).getTime())
          .toBeGreaterThanOrEqual(new Date(before.lastUsedAt).getTime());
      }
    } finally {
      revokeKey(k.id);
    }
  });

  test('TC-API-KEY-010 — fullKey is not re-revealed by any read endpoint', async () => {
    const k = mintKey('apikey-010');
    try {
      // 1. The list query must not return fullKey/hashedKey.
      const all: any[] = convexRun('apiKeys:list', {});
      const found = all.find((x: any) => x._id === k.id);
      expect(found).toBeDefined();
      expect(found.fullKey).toBeUndefined();
      expect(found.hashedKey).toBeUndefined();

      // 2. There is no `apiKeys:get` or `apiKeys:reveal` public function. Probe by name; expect failure.
      let revealAttemptThrew = false;
      try {
        const probe = spawnSync(
          'npx',
          ['convex', 'run', 'apiKeys:reveal', JSON.stringify({ id: k.id })],
          {
            env: { ...process.env, CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY ?? '' },
            encoding: 'utf8',
            timeout: 30_000,
            shell: false,
          },
        );
        if (probe.status !== 0) revealAttemptThrew = true;
      } catch {
        revealAttemptThrew = true;
      }
      expect(revealAttemptThrew, 'apiKeys:reveal must not exist').toBe(true);

      // 3. `verify` returns auth metadata only; never the key itself.
      const verifyResult = convexRun('apiKeys:verify', { key: k.fullKey });
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult).not.toHaveProperty('hashedKey');
      expect(verifyResult).not.toHaveProperty('fullKey');
      expect(verifyResult).not.toHaveProperty('key');
    } finally {
      revokeKey(k.id);
    }
  });
});
