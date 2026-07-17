import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const VALID_ROLES = ['agent', 'supervisor'];
const VALID_STATUSES = ['active', 'inactive'];
const VALID_SPECIALIZATIONS = ['claim_manager', 'denial_handling', 'followup'];
const VALID_AVAILABILITY = ['available', 'busy', 'offline'];

function validate(args) {
  if (!VALID_ROLES.includes(args.role)) {
    throw new Error(`Invalid role: ${args.role}`);
  }
  if (args.status !== undefined && !VALID_STATUSES.includes(args.status)) {
    throw new Error(`Invalid status: ${args.status}`);
  }
  if (args.availability !== undefined && !VALID_AVAILABILITY.includes(args.availability)) {
    throw new Error(`Invalid availability: ${args.availability}`);
  }
  for (const s of args.specializations ?? []) {
    if (!VALID_SPECIALIZATIONS.includes(s)) {
      throw new Error(`Invalid specialization: ${s}`);
    }
  }
}

export const create = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    role: v.string(),
    status: v.optional(v.string()),
    specializations: v.array(v.string()),
    insuranceContactIds: v.array(v.id('insuranceContacts')),
    availability: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validate(args);
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';
    const now = new Date().toISOString();
    return await ctx.db.insert('callAgents', {
      name: args.name,
      username: args.username,
      role: args.role,
      status: args.status ?? 'active',
      specializations: args.specializations,
      insuranceContactIds: args.insuranceContactIds,
      availability: args.availability ?? 'available',
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
      .query('callAgents')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id('callAgents') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const update = mutation({
  args: {
    id: v.id('callAgents'),
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    role: v.optional(v.string()),
    status: v.optional(v.string()),
    specializations: v.optional(v.array(v.string())),
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    availability: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    validate({ role: updates.role ?? 'agent', ...updates });
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await ctx.db.patch(id, { ...filtered, updatedAt: new Date().toISOString() });
  },
});

export const setAvailability = mutation({
  args: {
    id: v.id('callAgents'),
    availability: v.string(),
  },
  handler: async (ctx, args) => {
    if (!VALID_AVAILABILITY.includes(args.availability)) {
      throw new Error(`Invalid availability: ${args.availability}`);
    }
    await ctx.db.patch(args.id, { availability: args.availability, updatedAt: new Date().toISOString() });
  },
});

export const remove = mutation({
  args: { id: v.id('callAgents') },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
