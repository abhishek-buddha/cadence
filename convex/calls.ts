import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Get the most recent initiating/in-progress call's insurance contact forwarding number
export const getActiveCallForwardNumber = query({
  args: {},
  handler: async (ctx) => {
    // Find the most recent call (any status) — the one just created for the current call
    const call = await ctx.db.query('calls').order('desc').first();
    if (!call) return null;
    const insurance = await ctx.db.get(call.insuranceContactId);
    return insurance?.humanAgentNumber || null;
  },
});

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
    callPhase: v.optional(v.string()),
    holdStartedAt: v.optional(v.string()),
    holdDuration: v.optional(v.number()),
    humanDetectedAt: v.optional(v.string()),
    ivrSequenceUsed: v.optional(v.string()),
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
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .take(limit);

    // Join claim and insurance data for dashboard display
    const enriched = await Promise.all(
      calls.map(async (call) => {
        const claim = await ctx.db.get(call.claimId);
        const insurance = claim ? await ctx.db.get(claim.insuranceContactId) : null;
        return {
          ...call,
          claimNumber: claim?.claimNumber ?? null,
          insuranceCompany: insurance?.name ?? null,
        };
      })
    );
    return enriched;
  },
});

export const getById = query({
  args: { id: v.id('calls') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getCallMetadata = query({
  args: { id: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.id);
    if (!call) return null;

    const claim = await ctx.db.get(call.claimId);
    if (!claim) return null;

    const patient = await ctx.db.get(claim.patientId);
    const insurance = await ctx.db.get(claim.insuranceContactId);
    const provider = await ctx.db.get(claim.providerId);

    return { call, claim, patient, insurance, provider };
  },
});

export const getByTwilioSid = query({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    const calls = await ctx.db.query('calls').collect();
    return calls.find((c) => c.twilioCallSid === args.twilioCallSid) || null;
  },
});

// Used by test IVR to dynamically look up the forwarding number
export const getMostRecent = query({
  args: {},
  handler: async (ctx) => {
    const calls = await ctx.db.query('calls').order('desc').take(1);
    return calls[0] || null;
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
