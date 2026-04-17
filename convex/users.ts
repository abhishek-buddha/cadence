import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';

const VALID_ROLES = ['admin', 'manager', 'operator', 'viewer'];
const VALID_STATUSES = ['active', 'disabled'];

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query('users').collect();
  },
});

export const getById = query({
  args: { id: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first();
  },
});

export const create = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    role: v.string(),
    status: v.optional(v.string()),
    ssoProvider: v.optional(v.string()),
    ssoSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!VALID_ROLES.includes(args.role)) {
      throw new Error(`Invalid role: ${args.role}`);
    }
    const status = args.status ?? 'active';
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first();
    if (existing) throw new Error(`User with email ${args.email} already exists`);

    return await ctx.db.insert('users', {
      email: args.email,
      name: args.name,
      role: args.role,
      status,
      ssoProvider: args.ssoProvider,
      ssoSubject: args.ssoSubject,
      createdAt: new Date().toISOString(),
    });
  },
});

export const updateRole = mutation({
  args: {
    id: v.id('users'),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    if (!VALID_ROLES.includes(args.role)) {
      throw new Error(`Invalid role: ${args.role}`);
    }
    await ctx.db.patch(args.id, { role: args.role });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id('users'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    if (!VALID_STATUSES.includes(args.status)) {
      throw new Error(`Invalid status: ${args.status}`);
    }
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const recordLogin = internalMutation({
  args: { id: v.id('users') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastLoginAt: new Date().toISOString() });
  },
});
