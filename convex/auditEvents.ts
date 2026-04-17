import { internalMutation, query, action } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

// Internal mutation: called from other modules to append to the audit log.
export const logEvent = internalMutation({
  args: {
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    phiAccessed: v.optional(v.boolean()),
    payloadSummary: v.optional(v.string()),
    userId: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userRole: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('auditEvents', {
      ...args,
      timestamp: new Date().toISOString(),
    });
  },
});

// Paginated admin query with optional filters (action/resourceType/userId/dateRange).
export const list = query({
  args: {
    action: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    userId: v.optional(v.string()),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let results;
    if (args.userId) {
      results = await ctx.db
        .query('auditEvents')
        .withIndex('by_userId', (q) => q.eq('userId', args.userId))
        .order('desc')
        .collect();
    } else if (args.action) {
      results = await ctx.db
        .query('auditEvents')
        .withIndex('by_action', (q) => q.eq('action', args.action!))
        .order('desc')
        .collect();
    } else if (args.resourceType) {
      results = await ctx.db
        .query('auditEvents')
        .withIndex('by_resourceType', (q) => q.eq('resourceType', args.resourceType!))
        .order('desc')
        .collect();
    } else {
      results = await ctx.db.query('auditEvents').withIndex('by_timestamp').order('desc').collect();
    }

    const filtered = results.filter((e) => {
      if (args.action && e.action !== args.action) return false;
      if (args.resourceType && e.resourceType !== args.resourceType) return false;
      if (args.userId && e.userId !== args.userId) return false;
      if (args.fromDate && e.timestamp < args.fromDate) return false;
      if (args.toDate && e.timestamp > args.toDate) return false;
      return true;
    });

    const start = args.cursor ? parseInt(args.cursor, 10) : 0;
    const page = filtered.slice(start, start + limit);
    const cursor = start + limit < filtered.length ? String(start + limit) : null;

    return { events: page, cursor, total: filtered.length };
  },
});

// CSV export of audit events for compliance/reporting (HIPAA requirement).
export const exportCsv = action({
  args: {
    filters: v.optional(v.object({
      action: v.optional(v.string()),
      resourceType: v.optional(v.string()),
      userId: v.optional(v.string()),
      fromDate: v.optional(v.string()),
      toDate: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<string> => {
    const f = args.filters ?? {};
    // Pull a large page (10k cap to bound output)
    const result = await ctx.runQuery(api.auditEvents.list, {
      action: f.action,
      resourceType: f.resourceType,
      userId: f.userId,
      fromDate: f.fromDate,
      toDate: f.toDate,
      limit: 10000,
    });

    const headers = [
      'timestamp', 'action', 'resourceType', 'resourceId',
      'userId', 'userEmail', 'userRole', 'phiAccessed',
      'payloadSummary', 'ipAddress', 'userAgent',
    ];
    const escape = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [headers.join(',')];
    for (const e of result.events) {
      lines.push([
        e.timestamp, e.action, e.resourceType, e.resourceId,
        e.userId, e.userEmail, e.userRole, e.phiAccessed,
        e.payloadSummary, e.ipAddress, e.userAgent,
      ].map(escape).join(','));
    }
    return lines.join('\n');
  },
});
