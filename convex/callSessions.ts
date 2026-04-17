import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const MAX_ITEMS_PER_SESSION = 5;
const VALID_STATUSES = ['queued', 'in_progress', 'completed', 'paused', 'failed'];

export const create = mutation({
  args: {
    insuranceContactId: v.id('insuranceContacts'),
    useCase: v.string(),
    itemRefs: v.array(v.union(v.id('claims'), v.id('dentalCases'))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';

    if (args.itemRefs.length === 0) throw new Error('Session must have at least 1 item');
    if (args.itemRefs.length > MAX_ITEMS_PER_SESSION) {
      throw new Error(`Max ${MAX_ITEMS_PER_SESSION} items per session`);
    }
    if (!['medical_claim', 'dental_ev'].includes(args.useCase)) {
      throw new Error(`Invalid useCase: ${args.useCase}`);
    }

    // Validate every item belongs to same payer + matches useCase
    for (const ref of args.itemRefs) {
      const item: any = await ctx.db.get(ref);
      if (!item) throw new Error(`Item not found: ${ref}`);
      if (item.insuranceContactId !== args.insuranceContactId) {
        throw new Error('All items must share the same insuranceContactId');
      }
      const isClaim = 'claimNumber' in item;
      const isCase = 'caseNumber' in item;
      if (args.useCase === 'medical_claim' && !isClaim) throw new Error('Item is not a medical claim');
      if (args.useCase === 'dental_ev' && !isCase) throw new Error('Item is not a dental case');
    }

    return await ctx.db.insert('callSessions', {
      insuranceContactId: args.insuranceContactId,
      useCase: args.useCase,
      itemRefs: args.itemRefs,
      status: 'queued',
      notes: args.notes,
      userId,
      createdAt: new Date().toISOString(),
    });
  },
});

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    return await ctx.db
      .query('callSessions')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getWithItems = query({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) return null;

    const insurance = await ctx.db.get(session.insuranceContactId);

    // Per-item: fetch the claim/case + latest result + last call (for inline status display)
    const items = await Promise.all(
      session.itemRefs.map(async (ref) => {
        const entity: any = await ctx.db.get(ref);
        if (!entity) return { ref, entity: null, result: null, lastCall: null };

        let result: any = null;
        let lastCall: any = null;

        if (session.useCase === 'medical_claim') {
          result = await ctx.db
            .query('callResults')
            .withIndex('by_claimId', (q) => q.eq('claimId', ref as any))
            .order('desc')
            .first();
          lastCall = await ctx.db
            .query('calls')
            .withIndex('by_claimId', (q) => q.eq('claimId', ref as any))
            .order('desc')
            .first();
        } else {
          result = await ctx.db
            .query('evResults')
            .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', ref as any))
            .order('desc')
            .first();
          lastCall = await ctx.db
            .query('calls')
            .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', ref as any))
            .order('desc')
            .first();
        }

        return { ref, entity, result, lastCall };
      })
    );

    return { session, insurance, items };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id('callSessions'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    if (!VALID_STATUSES.includes(args.status)) {
      throw new Error(`Invalid status: ${args.status}`);
    }
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error('Session not found');

    const patch: Record<string, unknown> = { status: args.status };
    // Auto-stamp lifecycle timestamps based on status transitions
    if (args.status === 'in_progress' && !session.startedAt) {
      patch.startedAt = new Date().toISOString();
    }
    if ((args.status === 'completed' || args.status === 'failed') && !session.completedAt) {
      patch.completedAt = new Date().toISOString();
    }
    await ctx.db.patch(args.id, patch);
  },
});

export const setAggregateOutcome = mutation({
  args: {
    id: v.id('callSessions'),
    aggregateOutcome: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { aggregateOutcome: args.aggregateOutcome });
  },
});

export const pause = mutation({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'in_progress' && session.status !== 'queued') {
      throw new Error(`Cannot pause session in status "${session.status}"`);
    }
    await ctx.db.patch(args.id, { status: 'paused' });
  },
});

export const resume = mutation({
  args: { id: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.id);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'paused') {
      throw new Error(`Cannot resume session in status "${session.status}"`);
    }
    const patch: Record<string, unknown> = { status: 'in_progress' };
    if (!session.startedAt) patch.startedAt = new Date().toISOString();
    await ctx.db.patch(args.id, patch);
  },
});

// Returns items for a session with display labels and per-item outcome state.
// Used by SessionDetailPanel to render the items list.
export const listItems = query({
  args: { sessionId: v.id('callSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return [];

    const items = await Promise.all(
      (session.itemRefs ?? []).map(async (ref) => {
        const entity: any = await ctx.db.get(ref);
        if (!entity) {
          return { _id: ref, label: 'Unknown', detail: '', outcome: null, missingFields: [] };
        }

        const isClaim = 'claimNumber' in entity;
        const label = isClaim ? entity.claimNumber : entity.caseNumber;
        const amountStr = entity.amount != null
          ? `$${Number(entity.amount).toFixed(2)}`
          : '$0.00';
        const detail = isClaim
          ? `${amountStr} · DOS ${entity.dateOfService ?? '--'}`
          : `CDT: ${(entity.cdtCodes ?? []).join(', ') || '--'} · DOS ${entity.proposedDateOfService ?? '--'}`;

        const lastCall: any = isClaim
          ? await ctx.db
              .query('calls')
              .withIndex('by_claimId', (q) => q.eq('claimId', ref as any))
              .order('desc')
              .first()
          : await ctx.db
              .query('calls')
              .withIndex('by_dentalCaseId', (q) => q.eq('dentalCaseId', ref as any))
              .order('desc')
              .first();

        return {
          _id: ref,
          label,
          detail,
          outcome: lastCall?.outcome ?? null,
          missingFields: lastCall?.missingFields ?? [],
        };
      })
    );

    return items;
  },
});

// Returns the currently active call for a session (initiating / ringing / in_progress).
// Used by SessionDetailPanel to show the live call monitor.
export const getActiveCall = query({
  args: { sessionId: v.id('callSessions') },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', args.sessionId))
      .order('desc')
      .collect();

    return (
      calls.find((c) =>
        ['initiating', 'ringing', 'in_progress'].includes(c.status)
      ) ?? null
    );
  },
});
