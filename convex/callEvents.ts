import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const addEvent = mutation({
  args: {
    callId: v.id('calls'),
    type: v.string(),
    message: v.optional(v.string()),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('callEvents', args);
  },
});

export const listByCall = query({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('callEvents')
      .withIndex('by_callId', (q) => q.eq('callId', args.callId))
      .order('asc')
      .collect();
  },
});
