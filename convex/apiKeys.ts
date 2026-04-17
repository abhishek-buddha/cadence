import { mutation, query, action, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

const VALID_SCOPES = ['claims:read', 'claims:write', 'cases:read', 'cases:write', 'calls:read', 'calls:write', 'admin'];

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(buf));
}

function constantTimeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const issue = mutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    for (const scope of args.scopes) {
      if (!VALID_SCOPES.includes(scope)) throw new Error(`Invalid scope: ${scope}`);
    }

    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    const raw = bytesToHex(buf);
    const key = `cad_${raw}`;
    const prefix = key.slice(0, 12);
    const hashedKey = await sha256Hex(key);

    const id = await ctx.db.insert('apiKeys', {
      name: args.name,
      hashedKey,
      prefix,
      scopes: args.scopes,
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    return { id, fullKey: key };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db.query('apiKeys').collect();
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      status: k.status,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
    }));
  },
});

export const revoke = mutation({
  args: { id: v.id('apiKeys') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
    });
  },
});

export const _lookupByPrefix = internalQuery({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('apiKeys')
      .withIndex('by_prefix', (q) => q.eq('prefix', args.prefix))
      .collect();
  },
});

export const _touchLastUsed = internalMutation({
  args: { id: v.id('apiKeys') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastUsedAt: new Date().toISOString() });
  },
});

export const verify = action({
  args: { key: v.string() },
  handler: async (ctx, args): Promise<{ valid: boolean; scopes?: string[]; keyId?: string }> => {
    if (!args.key.startsWith('cad_')) return { valid: false };
    const prefix = args.key.slice(0, 12);
    const candidates = await ctx.runQuery(internal.apiKeys._lookupByPrefix, { prefix });
    if (candidates.length === 0) return { valid: false };

    const presentedHash = await sha256Hex(args.key);
    for (const c of candidates) {
      if (c.status !== 'active') continue;
      if (constantTimeEqHex(c.hashedKey, presentedHash)) {
        await ctx.runMutation(internal.apiKeys._touchLastUsed, { id: c._id });
        return { valid: true, scopes: c.scopes, keyId: c._id };
      }
    }
    return { valid: false };
  },
});
