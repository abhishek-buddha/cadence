import { query, internalMutation } from './_generated/server';
import { v } from 'convex/values';

export const create = internalMutation({
  args: {
    callId: v.id('calls'),
    dentalCaseId: v.id('dentalCases'),
    isActive: v.optional(v.boolean()),
    coverageEffectiveDate: v.optional(v.string()),
    coverageTerminationDate: v.optional(v.string()),
    deductibleAnnualCents: v.optional(v.number()),
    deductibleMetCents: v.optional(v.number()),
    coinsurancePct: v.optional(v.number()),
    copayCents: v.optional(v.number()),
    annualMaximumCents: v.optional(v.number()),
    annualMaxRemainingCents: v.optional(v.number()),
    networkStatus: v.optional(v.string()),
    frequencyLimits: v.optional(v.array(v.object({
      cdtCode: v.string(),
      limitDescription: v.string(),
      remainingThisYear: v.optional(v.number()),
    }))),
    waitingPeriods: v.optional(v.array(v.object({
      cdtCode: v.string(),
      endsOn: v.optional(v.string()),
      satisfied: v.boolean(),
    }))),
    repName: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    rawExtraction: v.string(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db.insert('evResults', {
      ...args,
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

export const getByCall = query({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('evResults')
      .withIndex('by_callId', (q) => q.eq('callId', args.callId))
      .first();
  },
});

export const getByCase = query({
  args: { dentalCaseId: v.id('dentalCases') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('evResults')
      .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', args.dentalCaseId))
      .order('desc')
      .collect();
  },
});

export const listLatestByUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const all = await ctx.db
      .query('evResults')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();
    // Reduce to most recent EV result per case (descending order means first wins)
    const map: Record<string, typeof all[0]> = {};
    for (const r of all) {
      if (!map[r.dentalCaseId]) map[r.dentalCaseId] = r;
    }
    return map;
  },
});

// Patch outcome fields on the call row (calls.updateStatus doesn't expose them).
// Used by analyzeEvTranscript after classification.
export const patchCallOutcome = internalMutation({
  args: {
    callId: v.id('calls'),
    outcome: v.string(),
    outcomeReason: v.optional(v.string()),
    requiredFieldsRetrieved: v.optional(v.array(v.string())),
    missingFields: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { callId, ...patch } = args;
    const filtered = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(callId, filtered);
  },
});
