import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
  args: {
    practiceName: v.string(),
    npi: v.string(),
    taxId: v.string(),
    address: v.string(),
    phone: v.string(),
    specialty: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const now = new Date().toISOString();
    return await ctx.db.insert('providers', {
      ...args,
      userId: identity.subject,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query('providers')
      .withIndex('by_userId', (q) => q.eq('userId', identity.subject))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('providers') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id('providers'),
    practiceName: v.optional(v.string()),
    npi: v.optional(v.string()),
    taxId: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    specialty: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, { ...filtered, updatedAt: new Date().toISOString() });
  },
});

export const remove = mutation({
  args: { id: v.id('providers') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
