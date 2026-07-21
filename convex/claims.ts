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
    claimNumber: v.string(),
    patientId: v.id('patients'),
    insuranceContactId: v.id('insuranceContacts'),
    providerId: v.id('providers'),
    amount: v.number(),
    dateOfService: v.string(),
    dateSubmitted: v.optional(v.string()),
    cptCodes: v.optional(v.array(v.string())),
    diagnosisCodes: v.optional(v.array(v.string())),
    status: v.string(),
    priority: v.string(),
    agingBucket: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();
    return await ctx.db.insert('claims', {
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
      .query('claims')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();
  },
});

export const listByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const all = await ctx.db
      .query('claims')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    return all.filter((c) => c.status === args.status);
  },
});

export const getById = query({
  args: { id: v.id('claims') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// A call is not always ABOUT one claim only — an operator can process a
// same-payer sibling claim during the same live call (see
// claimFollowups.setDisposition), which stamps that sibling's id onto
// calls.linkedClaimIds. Resolve the OTHER claim number(s) a call touched,
// excluding whichever claim we're currently viewing, so the UI can show
// "also discussed: Claim X" on a call that isn't primarily this claim's own.
async function resolveOtherClaimNumbers(ctx: any, call: any, viewingClaimId: any): Promise<string[]> {
  const ids = new Set<string>();
  if (call.claimId && String(call.claimId) !== String(viewingClaimId)) ids.add(call.claimId);
  for (const cid of call.linkedClaimIds ?? []) {
    if (String(cid) !== String(viewingClaimId)) ids.add(cid);
  }
  if (ids.size === 0) return [];
  const linkedClaims = await Promise.all([...ids].map((cid) => ctx.db.get(cid as any)));
  return linkedClaims.filter(Boolean).map((c: any) => c.claimNumber);
}

export const getWithDetails = query({
  args: { id: v.id('claims') },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.id);
    if (!claim) return null;

    const patient = await ctx.db.get(claim.patientId);
    const insurance = await ctx.db.get(claim.insuranceContactId);
    const provider = await ctx.db.get(claim.providerId);

    const ownCalls = await ctx.db
      .query('calls')
      .withIndex('by_claimId', (q) => q.eq('claimId', args.id))
      .order('desc')
      .collect();

    // Calls this claim was linked onto as a SIBLING (processed during someone
    // else's handoff call) — not indexed (linkedClaimIds is an array), so scan
    // this tenant's calls only, which stays cheap at this app's scale.
    const tenantCalls = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', claim.userId))
      .collect();
    const ownCallIds = new Set(ownCalls.map((c) => c._id));
    const linkedCalls = tenantCalls.filter(
      (c) => !ownCallIds.has(c._id) && c.linkedClaimIds?.includes(args.id)
    );

    const calls = [...ownCalls, ...linkedCalls]
      .sort((a, b) => {
        const at = new Date(a.startedAt || a._creationTime).getTime();
        const bt = new Date(b.startedAt || b._creationTime).getTime();
        return bt - at;
      });
    const enrichedCalls = await Promise.all(
      calls.map(async (c) => ({ ...c, otherClaimNumbers: await resolveOtherClaimNumbers(ctx, c, args.id) }))
    );

    // Get the most recent result for this claim. A completed/connected human
    // bridge is a valid user-facing outcome even if no AI extraction row exists.
    const latestExtractedResult = await ctx.db
      .query('callResults')
      .withIndex('by_claimId', (q) => q.eq('claimId', args.id))
      .order('desc')
      .first();
    // Scoped to this claim's OWN calls only — a linked (sibling-claim) call's
    // canned "human follow-up completed" text isn't this claim's own result.
    const latestHumanHandoffCall = ownCalls.find(connectedHumanHandoff);
    let latestResult: any = latestExtractedResult;
    if (latestHumanHandoffCall) {
      const handoffResult = humanHandoffResult(latestHumanHandoffCall);
      const extractedTime = latestExtractedResult
        ? new Date(latestExtractedResult.createdAt || 0).getTime()
        : 0;
      const handoffTime = new Date(handoffResult.createdAt || 0).getTime();
      if (!latestExtractedResult || handoffTime >= extractedTime) {
        latestResult = handoffResult;
      }
    }

    return { claim, patient, insurance, provider, calls: enrichedCalls, latestResult };
  },
});

export const update = mutation({
  args: {
    id: v.id('claims'),
    claimNumber: v.optional(v.string()),
    amount: v.optional(v.number()),
    dateOfService: v.optional(v.string()),
    dateSubmitted: v.optional(v.string()),
    cptCodes: v.optional(v.array(v.string())),
    diagnosisCodes: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    agingBucket: v.optional(v.string()),
    denialCode: v.optional(v.string()),
    denialReason: v.optional(v.string()),
    remarkCode: v.optional(v.string()),
    appealDeadline: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    lastCalledAt: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
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

const VALID_STATUSES = ['pending', 'in_progress', 'paid', 'denied', 'appealing', 'write_off'];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'paid', 'denied', 'write_off'],
  in_progress: ['paid', 'denied', 'appealing', 'pending', 'write_off'],
  paid: ['in_progress', 'appealing'],
  denied: ['appealing', 'in_progress', 'write_off'],
  appealing: ['in_progress', 'paid', 'denied', 'write_off'],
  write_off: ['pending', 'in_progress'],
};

export const updateStatus = mutation({
  args: {
    id: v.id('claims'),
    status: v.string(),
    denialCode: v.optional(v.string()),
    denialReason: v.optional(v.string()),
    remarkCode: v.optional(v.string()),
    appealDeadline: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, status, ...rest } = args;

    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const claim = await ctx.db.get(id);
    if (!claim) throw new Error('Claim not found');

    const allowed = ALLOWED_TRANSITIONS[claim.status] || VALID_STATUSES;
    if (claim.status !== status && !allowed.includes(status)) {
      throw new Error(`Cannot transition from "${claim.status}" to "${status}"`);
    }

    const filtered = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, { ...filtered, status, updatedAt: new Date().toISOString() });
  },
});

export const remove = mutation({
  args: { id: v.id('claims') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const bulkRemove = mutation({
  args: { ids: v.array(v.id('claims')) },
  handler: async (ctx, args) => {
    let deleted = 0;
    for (const id of args.ids) {
      await ctx.db.delete(id);
      deleted++;
    }
    return { deleted };
  },
});
