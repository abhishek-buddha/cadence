// Claim follow-up grouping + disposition (operator side)
// ---------------------------------------------------------------------------
// Powers the operator's post-call workspace: when a payer call is handed to a
// human agent for one claim, we surface the OTHER still-open claims for the
// SAME payer so the operator can process them in the same session, and we let
// the operator record a per-claim disposition (complete / retry / reschedule /
// denied) plus a free-text comment.
//
// "Needs processing" = same payer, status not terminal (paid/write_off), and
// not already dispositioned complete/denied by a human. The disposition is
// stored on the claim (followUp* fields) separately from `status` — which has
// guarded transitions in claims.updateStatus — so saving here never throws.
// ---------------------------------------------------------------------------

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const DISPOSITIONS = ['complete', 'retry', 'reschedule', 'denied'] as const;
// Dispositions that take a claim OFF the "to process" list.
const TERMINAL_DISPOSITIONS = new Set(['complete', 'denied']);
// Claim statuses that are already resolved and never need a follow-up call.
const TERMINAL_STATUSES = new Set(['paid', 'write_off']);

// Join a claim to its patient / payer / provider, mirroring handoff.enrichCall
// so the UI can render a sibling claim exactly like the handed-off one.
async function enrichClaim(ctx: any, claim: any) {
  const [patient, insurance, provider] = await Promise.all([
    ctx.db.get(claim.patientId),
    ctx.db.get(claim.insuranceContactId),
    ctx.db.get(claim.providerId),
  ]);
  return {
    _id: claim._id,
    claimNumber: claim.claimNumber,
    amount: claim.amount ?? null,
    dateOfService: claim.dateOfService ?? null,
    dateSubmitted: claim.dateSubmitted ?? null,
    cptCodes: claim.cptCodes ?? null,
    diagnosisCodes: claim.diagnosisCodes ?? null,
    status: claim.status ?? null,
    priority: claim.priority ?? null,
    agingBucket: claim.agingBucket ?? null,
    denialCode: claim.denialCode ?? null,
    denialReason: claim.denialReason ?? null,
    appealDeadline: claim.appealDeadline ?? null,
    referenceNumber: claim.referenceNumber ?? null,
    nextFollowUpDate: claim.nextFollowUpDate ?? null,
    notes: claim.notes ?? null,
    followUpDisposition: claim.followUpDisposition ?? null,
    followUpComment: claim.followUpComment ?? null,
    followUpBy: claim.followUpBy ?? null,
    followUpAt: claim.followUpAt ?? null,
    insuranceContactId: claim.insuranceContactId,
    insuranceCompany: insurance?.name ?? null,
    humanAgentNumber: insurance?.humanAgentNumber ?? null,
    patientName: patient ? `${patient.firstName} ${patient.lastName}` : null,
    patientDob: patient?.dateOfBirth ?? null,
    memberId: patient?.memberId ?? null,
    providerName: provider?.practiceName ?? null,
    providerNpi: provider?.npi ?? null,
  };
}

function needsProcessing(claim: any): boolean {
  if (TERMINAL_STATUSES.has(claim.status)) return false;
  if (claim.followUpDisposition && TERMINAL_DISPOSITIONS.has(claim.followUpDisposition)) return false;
  return true;
}

// For a given handoff call, return the current claim + the sibling claims of
// the same payer that still need processing. Reactive — as soon as an operator
// marks one complete/denied it drops out of `relatedClaims`.
export const listRelatedForCall = query({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || !call.claimId) {
      return { currentClaim: null, relatedClaims: [], payerName: null, processedCount: 0 };
    }

    const currentClaimDoc = await ctx.db.get(call.claimId);
    if (!currentClaimDoc) {
      return { currentClaim: null, relatedClaims: [], payerName: null, processedCount: 0 };
    }

    const siblings = await ctx.db
      .query('claims')
      .withIndex('by_insuranceContactId', (q) =>
        q.eq('insuranceContactId', currentClaimDoc.insuranceContactId)
      )
      .collect();

    // Same payer + same tenant, excluding the handed-off claim itself.
    const scoped = siblings.filter(
      (c) => c._id !== currentClaimDoc._id && c.userId === currentClaimDoc.userId
    );
    const pending = scoped.filter(needsProcessing);
    const processedCount = scoped.length - pending.length;

    // Highest-priority, oldest-service first so the operator works the most
    // urgent siblings while the payer rep is still on the line.
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    pending.sort((a, b) => {
      const pa = priorityRank[a.priority] ?? 3;
      const pb = priorityRank[b.priority] ?? 3;
      if (pa !== pb) return pa - pb;
      return (a.dateOfService || '').localeCompare(b.dateOfService || '');
    });

    const [currentClaim, relatedClaims] = await Promise.all([
      enrichClaim(ctx, currentClaimDoc),
      Promise.all(pending.map((c) => enrichClaim(ctx, c))),
    ]);

    return {
      currentClaim,
      relatedClaims,
      payerName: currentClaim.insuranceCompany,
      processedCount,
    };
  },
});

// Record a human operator's disposition for a single claim. Idempotent — the
// operator can revise it (e.g. retry → complete) any number of times.
//
// `callId` is the live handoff call the operator is working from. When the
// claim being dispositioned is a same-payer SIBLING of that call's own claim
// (not the claim the call was originally handed off for), this also links the
// call onto the sibling claim (calls.linkedClaimIds) so the sibling's own Call
// History timeline picks up this call too — see claims.getWithDetails.
export const setDisposition = mutation({
  args: {
    claimId: v.id('claims'),
    disposition: v.string(),
    comment: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.string()),
    operatorName: v.optional(v.string()),
    callId: v.optional(v.id('calls')),
  },
  handler: async (ctx, args) => {
    if (!DISPOSITIONS.includes(args.disposition as any)) {
      throw new Error(`Invalid disposition: ${args.disposition}`);
    }
    const claim = await ctx.db.get(args.claimId);
    if (!claim) return { ok: false, reason: 'not_found' };

    const now = new Date().toISOString();
    // Build the patch with only defined keys — avoids relying on how Convex
    // treats explicit `undefined` values.
    const patch: any = {
      followUpDisposition: args.disposition,
      followUpAt: now,
      updatedAt: now,
    };
    if (args.comment !== undefined) patch.followUpComment = args.comment;
    if (args.operatorName !== undefined) patch.followUpBy = args.operatorName;
    // retry / reschedule imply another attempt — carry the chosen date onto the
    // claim's existing nextFollowUpDate field so admin views stay in sync.
    if (args.nextFollowUpDate !== undefined) patch.nextFollowUpDate = args.nextFollowUpDate;
    await ctx.db.patch(args.claimId, patch);

    if (args.callId) {
      const call = await ctx.db.get(args.callId);
      if (call && call.claimId !== args.claimId) {
        const existing: any[] = call.linkedClaimIds ?? [];
        if (!existing.includes(args.claimId)) {
          await ctx.db.patch(args.callId, { linkedClaimIds: [...existing, args.claimId] });
        }
      }
    }

    return { ok: true, disposition: args.disposition };
  },
});
