import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const setCallSetting = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('callSettings').withIndex('by_key', q => q.eq('key', args.key)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert('callSettings', { key: args.key, value: args.value });
    }
  },
});

export const getCallSetting = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.query('callSettings').withIndex('by_key', q => q.eq('key', args.key)).first();
    return doc?.value || null;
  },
});

export const create = mutation({
  args: {
    claimId: v.optional(v.id('claims')),
    dentalCaseId: v.optional(v.id('dentalCases')),
    sessionId: v.optional(v.id('callSessions')),
    useCase: v.optional(v.string()),
    insuranceContactId: v.id('insuranceContacts'),
    status: v.string(),
    startedAt: v.string(),
    parentCallId: v.optional(v.id('calls')),
    attemptNumber: v.optional(v.number()),
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
    status: v.optional(v.string()),
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
    outcome: v.optional(v.string()),
    outcomeReason: v.optional(v.string()),
    requiredFieldsRetrieved: v.optional(v.array(v.string())),
    missingFields: v.optional(v.array(v.string())),
    transferredAt: v.optional(v.string()),
    transferType: v.optional(v.string()),
    transferDestination: v.optional(v.string()),
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

export const listByDentalCase = query({
  args: { dentalCaseId: v.id('dentalCases') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('calls')
      .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', args.dentalCaseId))
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
    const calls = (await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect())
      .sort((a, b) => {
        const aTime = new Date(a.startedAt || a.completedAt || a._creationTime).getTime();
        const bTime = new Date(b.startedAt || b.completedAt || b._creationTime).getTime();
        return bTime - aTime;
      })
      .slice(0, limit);

    const enriched = await Promise.all(
      calls.map(async (call) => {
        let claimNumber: string | null = null;
        let dentalCaseNumber: string | null = null;
        let insuranceCompany: string | null = null;
        if (call.claimId) {
          const claim = await ctx.db.get(call.claimId);
          if (claim) {
            claimNumber = claim.claimNumber;
            const insurance = await ctx.db.get(claim.insuranceContactId);
            insuranceCompany = insurance?.name ?? null;
          }
        } else if (call.dentalCaseId) {
          const dCase = await ctx.db.get(call.dentalCaseId);
          if (dCase) {
            dentalCaseNumber = dCase.caseNumber;
            const insurance = await ctx.db.get(dCase.insuranceContactId);
            insuranceCompany = insurance?.name ?? null;
          }
        } else {
          const insurance = await ctx.db.get(call.insuranceContactId);
          insuranceCompany = insurance?.name ?? null;
        }
        return {
          ...call,
          claimNumber,
          dentalCaseNumber,
          insuranceCompany,
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

    if (call.claimId) {
      const claim = await ctx.db.get(call.claimId);
      if (!claim) return null;
      const patient = await ctx.db.get(claim.patientId);
      const insurance = await ctx.db.get(claim.insuranceContactId);
      const provider = await ctx.db.get(claim.providerId);
      return { call, useCase: 'medical_claim' as const, claim, patient, insurance, provider };
    }
    if (call.dentalCaseId) {
      const dCase = await ctx.db.get(call.dentalCaseId);
      if (!dCase) return null;
      const patient = await ctx.db.get(dCase.patientId);
      const insurance = await ctx.db.get(dCase.insuranceContactId);
      const provider = await ctx.db.get(dCase.providerId);
      const plan = dCase.planId ? await ctx.db.get(dCase.planId) : null;
      return { call, useCase: 'dental_ev' as const, dentalCase: dCase, plan, patient, insurance, provider };
    }
    return { call };
  },
});

export const getByTwilioSid = query({
  args: { twilioCallSid: v.string() },
  handler: async (ctx, args) => {
    const calls = await ctx.db.query('calls').collect();
    return calls.find((c) => c.twilioCallSid === args.twilioCallSid) || null;
  },
});

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
