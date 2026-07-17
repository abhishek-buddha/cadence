import { test as base, request, APIRequestContext, expect } from '@playwright/test';

const API_BASE = process.env.CADENCE_API_BASE ?? 'https://rapid-pheasant-510.convex.site';
const API_KEY = process.env.CADENCE_API_KEY ?? '';

export type ApiKeyScope =
  | 'claims:read'
  | 'claims:write'
  | 'calls:read'
  | 'calls:write'
  | 'eligibility:read'
  | 'eligibility:write'
  | 'webhooks:write'
  | '*';

export interface IssuedApiKey {
  key: string;
  scopes: ApiKeyScope[];
  createdAt: number;
}

/**
 * Build a fresh APIRequestContext targeting the Convex HTTP /v1 router.
 * Authorization header is auto-applied if CADENCE_API_KEY is set.
 */
export async function buildApiContext(extraHeaders: Record<string, string> = {}): Promise<APIRequestContext> {
  return await request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      'content-type': 'application/json',
      'x-cadence-test-run': '1',
      ...extraHeaders,
    },
    timeout: 30_000,
  });
}

/**
 * Mint an API key with the requested scopes.
 *
 * For now this is a thin wrapper that returns the env-provided CADENCE_API_KEY (must be issued
 * out-of-band via Convex dashboard or `npx convex run apiKeys:issue`). When the
 * /v1/admin/api-keys endpoint ships with a bootstrap secret, swap in the live mint flow.
 */
export async function issueApiKey(scopes: ApiKeyScope[]): Promise<IssuedApiKey> {
  if (!API_KEY) {
    throw new Error(
      'CADENCE_API_KEY not set. Either set it in tests/.env.test or extend issueApiKey() to call /v1/admin/api-keys with a bootstrap secret.'
    );
  }
  return { key: API_KEY, scopes, createdAt: Date.now() };
}

type ApiFixtures = {
  apiContext: APIRequestContext;
};

export const test = base.extend<ApiFixtures>({
  apiContext: async ({}, use) => {
    const ctx = await buildApiContext();
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect, API_BASE };
