import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { VALID_SPECIALIZATIONS } from './lib/specializations';

function validateSpecializations(specializations?: string[]) {
  for (const s of specializations ?? []) {
    if (!VALID_SPECIALIZATIONS.includes(s)) {
      throw new Error(`Invalid specialization: ${s}`);
    }
  }
}

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query('userGroups').collect();
  },
});

export const getById = query({
  args: { id: v.id('userGroups') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listMembers = query({
  args: { groupId: v.id('userGroups') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_userGroupId', (q) => q.eq('userGroupId', args.groupId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    providerIds: v.optional(v.array(v.id('providers'))),
    specializations: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    validateSpecializations(args.specializations);
    const now = new Date().toISOString();
    return await ctx.db.insert('userGroups', {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('userGroups'),
    name: v.optional(v.string()),
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    providerIds: v.optional(v.array(v.id('providers'))),
    specializations: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    validateSpecializations(patch.specializations);
    const filtered = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    await ctx.db.patch(id, { ...filtered, updatedAt: new Date().toISOString() });
  },
});

export const remove = mutation({
  args: { id: v.id('userGroups') },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query('users')
      .withIndex('by_userGroupId', (q) => q.eq('userGroupId', args.id))
      .collect();
    for (const member of members) {
      await ctx.db.patch(member._id, { userGroupId: undefined });
    }
    await ctx.db.delete(args.id);
  },
});

export const addMember = mutation({
  args: { groupId: v.id('userGroups'), userId: v.id('users') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { userGroupId: args.groupId });
  },
});

export const removeMember = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { userGroupId: undefined });
  },
});
