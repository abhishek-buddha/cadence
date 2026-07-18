import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const HUMAN_HANDOFF_UPDATE = 'Spoke to insurance human rep and clarified details.';

function connectedHumanHandoff(call: any): boolean {
  return (
    !!call.claimId &&
    (call.handoffState === 'connected' ||
      call.handoffState === 'handoff_ended' ||
      !!call.humanTranscript)
  );
}

function humanHandoffResult(call: any) {
  return {
    callId: call._id,
    claimId: call.claimId,
    claimStatus: 'Human follow-up completed',
    nextSteps: HUMAN_HANDOFF_UPDATE,
    rawExtraction: HUMAN_HANDOFF_UPDATE,
    confidence: 1,
    userId: call.userId,
    createdAt: call.completedAt || call.handoffAcceptedAt || call.startedAt || call._creationTime,
  };
}

export const create = mutation({
  args: {
    callId: v.id('calls'),
    claimId: v.id('claims'),
    claimStatus: v.optional(v.string()),
    paidAmount: v.optional(v.number()),
    paidDate: v.optional(v.string()),
    checkOrEftNumber: v.optional(v.string()),
    denialCode: v.optional(v.string()),
    remarkCode: v.optional(v.string()),
    denialReason: v.optional(v.string()),
    appealDeadline: v.optional(v.string()),
    missingDocuments: v.optional(v.string()),
    expectedDecisionDate: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    repName: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    rawExtraction: v.string(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db.insert('callResults', {
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
      .query('callResults')
      .withIndex('by_callId', (q) => q.eq('callId', args.callId))
      .first();
  },
});

export const getByClaim = query({
  args: { claimId: v.id('claims') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('callResults')
      .withIndex('by_claimId', (q) => q.eq('claimId', args.claimId))
      .order('desc')
      .collect();
  },
});

export const listLatestByUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const all = await ctx.db
      .query('callResults')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();
    const map: Record<string, any> = {};
    for (const r of all) {
      if (!map[r.claimId]) map[r.claimId] = r;
    }

    const recentCalls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .take(200);

    for (const call of recentCalls) {
      if (!connectedHumanHandoff(call)) continue;
      const summary = humanHandoffResult(call);
      const existing = map[call.claimId];
      const existingTime = existing ? new Date(existing.createdAt || 0).getTime() : 0;
      const summaryTime = new Date(summary.createdAt || 0).getTime();
      if (!existing || summaryTime >= existingTime) {
        map[call.claimId] = summary;
      }
    }
    return map;
  },
});
