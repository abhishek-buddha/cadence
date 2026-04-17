import { mutation, query, action, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import crypto from 'node:crypto';

const VALID_SCOPES = ['claims:read', 'claims:write', 'cases:read', 'cases:write', 'calls:read', 'calls:write', 'admin'];

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Issue: generate 32 random bytes, return full key ONCE. Store only hash + prefix.
export const issue = mutation({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    for (const scope of args.scopes) {
      if (!VALID_SCOPES.includes(scope)) throw new Error(`Invalid scope: ${scope}`);
    }

    const raw = crypto.randomBytes(32).toString('hex');
    const key = `cad_${raw}`;
    const prefix = key.slice(0, 12); // "cad_" + 8 hex chars for display
    const hashedKey = hashKey(key);

    const id = await ctx.db.insert('apiKeys', {
      name: args.name,
      hashedKey,
      prefix,
      scopes: args.scopes,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    // key returned ONCE — caller must persist it themselves, not retrievable later
    return { id, key, prefix };
  },
});

// List: returns prefix only (never the hash or raw key)
export const list = query({
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

// Internal helpers used by the verify action
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

// Verify: called by HTTP API middleware. Takes presented key, hashes, looks up.
export const verify = action({
  args: { key: v.string() },
  handler: async (ctx, args): Promise<{ valid: boolean; scopes?: string[]; keyId?: string }> => {
    if (!args.key.startsWith('cad_')) return { valid: false };
    const prefix = args.key.slice(0, 12);
    const candidates = await ctx.runQuery(internal.apiKeys._lookupByPrefix, { prefix });
    if (candidates.length === 0) return { valid: false };

    const presentedHash = hashKey(args.key);
    const presentedBuf = Buffer.from(presentedHash, 'hex');
    for (const c of candidates) {
      if (c.status !== 'active') continue;
      const storedBuf = Buffer.from(c.hashedKey, 'hex');
      if (storedBuf.length !== presentedBuf.length) continue;
      if (crypto.timingSafeEqual(storedBuf, presentedBuf)) {
        await ctx.runMutation(internal.apiKeys._touchLastUsed, { id: c._id });
        return { valid: true, scopes: c.scopes, keyId: c._id };
      }
    }
    return { valid: false };
  },
});
