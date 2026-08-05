import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
  args: {
    planName: v.string(),
    payerName: v.string(),
    insuranceContactId: v.optional(v.id('insuranceContacts')),
    planType: v.optional(v.string()),
    groupNumber: v.optional(v.string()),
    annualMaximumCents: v.optional(v.number()),
    deductibleCents: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();
    return await ctx.db.insert('dentalPlans', {
      ...args,
      userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db
      .query('dentalPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('dentalPlans') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id('dentalPlans'),
    planName: v.optional(v.string()),
    payerName: v.optional(v.string()),
    insuranceContactId: v.optional(v.id('insuranceContacts')),
    planType: v.optional(v.string()),
    groupNumber: v.optional(v.string()),
    annualMaximumCents: v.optional(v.number()),
    deductibleCents: v.optional(v.number()),
    notes: v.optional(v.string()),
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
  args: { id: v.id('dentalPlans') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
