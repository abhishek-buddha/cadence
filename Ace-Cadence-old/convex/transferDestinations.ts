import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const VALID_KINDS = ['warm', 'cold', 'either'];

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    kind: v.string(),
    businessHours: v.optional(v.string()),
    payerKind: v.optional(v.string()),
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!VALID_KINDS.includes(args.kind)) throw new Error(`Invalid kind: ${args.kind}`);
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db.insert('transferDestinations', {
      ...args,
      enabled: args.enabled ?? true,
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db
      .query('transferDestinations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('transferDestinations') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id('transferDestinations'),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    kind: v.optional(v.string()),
    businessHours: v.optional(v.string()),
    payerKind: v.optional(v.string()),
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.kind && !VALID_KINDS.includes(args.kind)) {
      throw new Error(`Invalid kind: ${args.kind}`);
    }
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id('transferDestinations') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Find best transfer destination for a given payer + transfer kind.
// Priority: payer-specific > payerKind match > general fallback. All must be enabled.
export const findForPayer = query({
  args: {
    insuranceContactId: v.id('insuranceContacts'),
    kind: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const insurance = await ctx.db.get(args.insuranceContactId);
    if (!insurance) return null;

    const all = await ctx.db
      .query('transferDestinations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();

    const enabled = all.filter((d) => d.enabled);

    const kindMatch = (d: typeof enabled[0]) =>
      !args.kind || d.kind === 'either' || d.kind === args.kind;

    // Priority 1: explicitly bound to this insurance contact
    const explicit = enabled.find(
      (d) => d.insuranceContactIds?.includes(args.insuranceContactId) && kindMatch(d)
    );
    if (explicit) return explicit;

    // Priority 2: matches payerKind (medical/dental)
    if (insurance.payerKind) {
      const byKind = enabled.find((d) => d.payerKind === insurance.payerKind && kindMatch(d));
      if (byKind) return byKind;
    }

    // Priority 3: a general-purpose destination with no payerKind restriction
    return enabled.find((d) => !d.payerKind && !d.insuranceContactIds?.length && kindMatch(d)) ?? null;
  },
});
