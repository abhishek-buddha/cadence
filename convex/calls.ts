import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
  args: {
    claimId: v.id('claims'),
    insuranceContactId: v.id('insuranceContacts'),
    status: v.string(),
    startedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db.insert('calls', {
      ...args,
      userId,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id('calls'),
    status: v.string(),
    elevenLabsConversationId: v.optional(v.string()),
    twilioCallSid: v.optional(v.string()),
    duration: v.optional(v.number()),
    transcript: v.optional(v.string()),
    recordingUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const listByClaim = query({
  args: { claimId: v.id('claims') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('calls')
      .withIndex('by_claimId', (q) => q.eq('claimId', args.claimId))
      .order('desc')
      .collect();
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const limit = args.limit ?? 20;
    return await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .take(limit);
  },
});

export const getById = query({
  args: { id: v.id('calls') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByConversationId = query({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('calls')
      .withIndex('by_elevenLabsConversationId', (q) =>
        q.eq('elevenLabsConversationId', args.conversationId)
      )
      .first();
  },
});
