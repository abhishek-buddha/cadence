import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Dental EV state machine transitions
const VALID_STATUSES = ['awaiting_verification', 'verifying', 'verified', 'failed', 'requires_human'];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  awaiting_verification: ['verifying', 'failed'],
  verifying: ['verified', 'failed', 'requires_human'],
  verified: ['awaiting_verification', 'verifying'],
  failed: ['awaiting_verification', 'verifying', 'requires_human'],
  requires_human: ['awaiting_verification', 'verifying', 'verified', 'failed'],
};

function generateCaseNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
  return `EV-${ymd}-${rand}`;
}

export const create = mutation({
  args: {
    caseNumber: v.optional(v.string()),
    patientId: v.id('patients'),
    planId: v.optional(v.id('dentalPlans')),
    insuranceContactId: v.id('insuranceContacts'),
    providerId: v.id('providers'),
    proposedDateOfService: v.string(),
    cdtCodes: v.array(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();
    return await ctx.db.insert('dentalCases', {
      caseNumber: args.caseNumber ?? generateCaseNumber(),
      patientId: args.patientId,
      planId: args.planId,
      insuranceContactId: args.insuranceContactId,
      providerId: args.providerId,
      proposedDateOfService: args.proposedDateOfService,
      cdtCodes: args.cdtCodes,
      status: args.status ?? 'awaiting_verification',
      priority: args.priority ?? 'medium',
      notes: args.notes,
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
      .query('dentalCases')
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
      .query('dentalCases')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
    return all.filter((c) => c.status === args.status);
  },
});

export const getById = query({
  args: { id: v.id('dentalCases') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getWithDetails = query({
  args: { id: v.id('dentalCases') },
  handler: async (ctx, args) => {
    const dentalCase = await ctx.db.get(args.id);
    if (!dentalCase) return null;

    const patient = await ctx.db.get(dentalCase.patientId);
    const plan = dentalCase.planId ? await ctx.db.get(dentalCase.planId) : null;
    const insurance = await ctx.db.get(dentalCase.insuranceContactId);
    const provider = await ctx.db.get(dentalCase.providerId);

    const calls = await ctx.db
      .query('calls')
      .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', args.id))
      .order('desc')
      .collect();

    const evResults = await ctx.db
      .query('evResults')
      .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', args.id))
      .order('desc')
      .collect();

    const latestResult = evResults[0] || null;

    return { case: dentalCase, patient, plan, insurance, provider, calls, evResults, latestResult };
  },
});

export const update = mutation({
  args: {
    id: v.id('dentalCases'),
    caseNumber: v.optional(v.string()),
    planId: v.optional(v.id('dentalPlans')),
    proposedDateOfService: v.optional(v.string()),
    cdtCodes: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    notes: v.optional(v.string()),
    lastCalledAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(id, { ...filtered, updatedAt: new Date().toISOString() });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id('dentalCases'),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, status, notes } = args;

    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const dentalCase = await ctx.db.get(id);
    if (!dentalCase) throw new Error('Dental case not found');

    const allowed = ALLOWED_TRANSITIONS[dentalCase.status] || VALID_STATUSES;
    if (dentalCase.status !== status && !allowed.includes(status)) {
      throw new Error(`Cannot transition from "${dentalCase.status}" to "${status}"`);
    }

    const patch: Record<string, unknown> = { status, updatedAt: new Date().toISOString() };
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id('dentalCases') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const bulkRemove = mutation({
  args: { ids: v.array(v.id('dentalCases')) },
  handler: async (ctx, args) => {
    let deleted = 0;
    for (const id of args.ids) {
      await ctx.db.delete(id);
      deleted++;
    }
    return { deleted };
  },
});
