import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

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

export const getWithDetails = query({
  args: { id: v.id('claims') },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.id);
    if (!claim) return null;

    const patient = await ctx.db.get(claim.patientId);
    const insurance = await ctx.db.get(claim.insuranceContactId);
    const provider = await ctx.db.get(claim.providerId);

    const calls = await ctx.db
      .query('calls')
      .withIndex('by_claimId', (q) => q.eq('claimId', args.id))
      .order('desc')
      .collect();

    // Get the most recent call result for this claim (not just the latest call)
    const latestResult = await ctx.db
      .query('callResults')
      .withIndex('by_claimId', (q) => q.eq('claimId', args.id))
      .order('desc')
      .first();

    return { claim, patient, insurance, provider, calls, latestResult };
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
