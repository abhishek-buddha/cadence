import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    department: v.optional(v.string()),
    payerId: v.optional(v.string()),
    hours: v.optional(v.string()),
    ivrInstructions: v.optional(v.string()),
    verificationRequirements: v.optional(v.string()),
    avgHoldTime: v.optional(v.number()),
    notes: v.optional(v.string()),
    humanAgentNumber: v.optional(v.string()),
    ivrEnabled: v.optional(v.boolean()),
    ivrSequence: v.optional(v.string()),
    ivrSteps: v.optional(v.array(v.object({
      waitSeconds: v.number(),
      digit: v.string(),
      label: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();
    return await ctx.db.insert('insuranceContacts', {
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
      .query('insuranceContacts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('insuranceContacts') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id('insuranceContacts'),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    payerId: v.optional(v.string()),
    hours: v.optional(v.string()),
    ivrInstructions: v.optional(v.string()),
    verificationRequirements: v.optional(v.string()),
    avgHoldTime: v.optional(v.number()),
    notes: v.optional(v.string()),
    humanAgentNumber: v.optional(v.string()),
    ivrEnabled: v.optional(v.boolean()),
    ivrSequence: v.optional(v.string()),
    ivrSteps: v.optional(v.array(v.object({
      waitSeconds: v.number(),
      digit: v.string(),
      label: v.optional(v.string()),
    }))),
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
  args: { id: v.id('insuranceContacts') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
