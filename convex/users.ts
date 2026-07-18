import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';

const VALID_ROLES = ['admin', 'operator'];
const VALID_STATUSES = ['active', 'disabled'];
const VALID_SPECIALIZATIONS = ['claim_status', 'denial_claim', 'claim_eligibility_check'];

function validateSpecializations(specializations?: string[]) {
  for (const s of specializations ?? []) {
    if (!VALID_SPECIALIZATIONS.includes(s)) {
      throw new Error(`Invalid specialization: ${s}`);
    }
  }
}

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query('users').collect();
  },
});

function routingDisplayName(user: any, index: number): string {
  return user.name || user.email || `Agent ${index + 1}`;
}

const STALE_LIVE_MS = 2 * 60 * 60 * 1000;

function isStaleLiveCall(call: any): boolean {
  if (!call.startedAt) return false;
  return Date.now() - new Date(call.startedAt).getTime() > STALE_LIVE_MS;
}

function isRoutingCallActive(call: any): boolean {
  if (call.status === 'completed' || call.status === 'failed') return false;
  if (isStaleLiveCall(call)) return false;
  const liveStatuses = new Set(['initiating', 'in_progress']);
  const liveHandoffStates = new Set(['awaiting_human', 'accepting', 'connected']);
  return liveStatuses.has(call.status) || liveHandoffStates.has(call.handoffState);
}

async function enrichRoutingCall(ctx: any, call: any) {
  let claimNumber: string | null = null;
  let dentalCaseNumber: string | null = null;
  let insuranceCompany: string | null = null;
  let patientName: string | null = null;
  let patientDob: string | null = null;
  let memberId: string | null = null;
  let providerName: string | null = null;
  let providerNpi: string | null = null;
  let claimAmount: number | null = null;
  let dateOfService: string | null = null;
  let cptCodes: string[] | null = null;
  let diagnosisCodes: string[] | null = null;
  let claimStatus: string | null = null;
  let claimPriority: string | null = null;
  let humanAgentNumber: string | null = null;

  if (call.claimId) {
    const claim = await ctx.db.get(call.claimId);
    if (claim) {
      claimNumber = claim.claimNumber;
      claimAmount = claim.amount ?? null;
      dateOfService = claim.dateOfService ?? null;
      cptCodes = claim.cptCodes ?? null;
      diagnosisCodes = claim.diagnosisCodes ?? null;
      claimStatus = claim.status ?? null;
      claimPriority = claim.priority ?? null;
      const insurance = await ctx.db.get(claim.insuranceContactId);
      insuranceCompany = insurance?.name ?? null;
      humanAgentNumber = insurance?.humanAgentNumber ?? null;
      const patient = await ctx.db.get(claim.patientId);
      if (patient) {
        patientName = `${patient.firstName} ${patient.lastName}`;
        patientDob = patient.dateOfBirth ?? null;
        memberId = patient.memberId ?? null;
      }
      const provider = await ctx.db.get(claim.providerId);
      if (provider) {
        providerName = provider.practiceName ?? null;
        providerNpi = provider.npi ?? null;
      }
    }
  } else if (call.dentalCaseId) {
    const dentalCase = await ctx.db.get(call.dentalCaseId);
    if (dentalCase) {
      dentalCaseNumber = dentalCase.caseNumber;
      dateOfService = dentalCase.proposedDateOfService ?? null;
      cptCodes = dentalCase.cdtCodes ?? null;
      claimStatus = dentalCase.status ?? null;
      claimPriority = dentalCase.priority ?? null;
      const insurance = await ctx.db.get(dentalCase.insuranceContactId);
      insuranceCompany = insurance?.name ?? null;
      humanAgentNumber = insurance?.humanAgentNumber ?? null;
      const patient = await ctx.db.get(dentalCase.patientId);
      if (patient) {
        patientName = `${patient.firstName} ${patient.lastName}`;
        patientDob = patient.dateOfBirth ?? null;
        memberId = patient.memberId ?? null;
      }
      const provider = await ctx.db.get(dentalCase.providerId);
      if (provider) {
        providerName = provider.practiceName ?? null;
        providerNpi = provider.npi ?? null;
      }
    }
  } else {
    const insurance = await ctx.db.get(call.insuranceContactId);
    insuranceCompany = insurance?.name ?? null;
    humanAgentNumber = insurance?.humanAgentNumber ?? null;
  }

  return {
    ...call,
    claimNumber,
    dentalCaseNumber,
    insuranceCompany,
    patientName,
    patientDob,
    memberId,
    providerName,
    providerNpi,
    claimAmount,
    dateOfService,
    cptCodes,
    diagnosisCodes,
    claimStatus,
    claimPriority,
    humanAgentNumber,
  };
}

export const listRoutingAgents = query({
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const activeUsers = users
      .filter((user) => user.status !== 'disabled' && user.role === 'operator')
      .sort((a, b) => a._creationTime - b._creationTime);

    return await Promise.all(
      activeUsers.map(async (user, index) => {
        const assignedCalls = await ctx.db
          .query('calls')
          .withIndex('by_assignedAgentUserId', (q) =>
            q.eq('assignedAgentUserId', user._id)
          )
          .order('desc')
          .collect();

        const activeCall = assignedCalls.find(isRoutingCallActive) || null;
        const enrichedActiveCall = activeCall
          ? await enrichRoutingCall(ctx, activeCall)
          : null;
        const availability =
          activeCall?.handoffState === 'awaiting_human'
            ? 'assigned'
            : activeCall
              ? 'in_call'
              : 'available';

        return {
          ...user,
          routingName: routingDisplayName(user, index),
          availability,
          activeCall: enrichedActiveCall,
        };
      })
    );
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
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    specializations: v.optional(v.array(v.string())),
    teamLeadName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!VALID_ROLES.includes(args.role)) {
      throw new Error(`Invalid role: ${args.role}`);
    }
    const status = args.status ?? 'active';
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    validateSpecializations(args.specializations);
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
      insuranceContactIds: args.insuranceContactIds,
      specializations: args.specializations,
      teamLeadName: args.teamLeadName,
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


export const updateRoutingProfile = mutation({
  args: {
    id: v.id('users'),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    insuranceContactIds: v.optional(v.array(v.id('insuranceContacts'))),
    specializations: v.optional(v.array(v.string())),
    teamLeadName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    if (patch.role !== undefined && !VALID_ROLES.includes(patch.role)) {
      throw new Error(`Invalid role: ${patch.role}`);
    }
    validateSpecializations(patch.specializations);
    const filtered = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const recordLogin = internalMutation({
  args: { id: v.id('users') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastLoginAt: new Date().toISOString() });
  },
});
