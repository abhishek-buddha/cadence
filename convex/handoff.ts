// Live AI→Human Handoff (cadence_pro_ivr)
// ---------------------------------------------------------------------------
// State machine + queries powering the live transfer where the AI navigates a
// payer IVR, then — when the insurance human is about to pick up — the call is
// handed to one of OUR human agents (a broadcast pool) who takes it over in the
// browser. See docs/PLAN.md ("REVISED ARCHITECTURE") and
// docs/HANDOFF_BUILD_SPEC.md.
//
// The AI itself does the drop via ElevenLabs' native transfer_to_number
// (Conference) tool, which conferences our bridge number in with the insurance
// rep and removes the AI. Our bridge-number TwiML (convex/http.ts) parks the
// rep in a Twilio conference `cadence-<callId>` and flips the call to
// handoffState="awaiting_human". This module owns everything after that point.
//
// handoffState values (also documented on the schema):
//   awaiting_human | accepting | connected | declined | handoff_failed | handoff_ended
// ---------------------------------------------------------------------------

import { mutation, query, action, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';

// ---------------------------------------------------------------------------
// Enrichment helper — mirrors calls.listRecent so the UI gets human-readable
// labels (payer, claim/case number, patient name) without extra round-trips.
// ---------------------------------------------------------------------------
async function enrichCall(ctx: any, call: any) {
  let claimNumber: string | null = null;
  let dentalCaseNumber: string | null = null;
  let insuranceCompany: string | null = null;
  let patientName: string | null = null;
  let humanAgentNumber: string | null = null;

  if (call.claimId) {
    const claim = await ctx.db.get(call.claimId);
    if (claim) {
      claimNumber = claim.claimNumber;
      const insurance = await ctx.db.get(claim.insuranceContactId);
      insuranceCompany = insurance?.name ?? null;
      humanAgentNumber = insurance?.humanAgentNumber ?? null;
      const patient = await ctx.db.get(claim.patientId);
      if (patient) patientName = `${patient.firstName} ${patient.lastName}`;
    }
  } else if (call.dentalCaseId) {
    const dCase = await ctx.db.get(call.dentalCaseId);
    if (dCase) {
      dentalCaseNumber = dCase.caseNumber;
      const insurance = await ctx.db.get(dCase.insuranceContactId);
      insuranceCompany = insurance?.name ?? null;
      humanAgentNumber = insurance?.humanAgentNumber ?? null;
      const patient = await ctx.db.get(dCase.patientId);
      if (patient) patientName = `${patient.firstName} ${patient.lastName}`;
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
    humanAgentNumber,
  };
}

// ---------------------------------------------------------------------------
// Queries (reactive — these power the broadcast + Live Calls view; no polling)
// ---------------------------------------------------------------------------

// Every call currently waiting for one of our agents to accept. Broadcast to
// all active users via the reactive subscription.
export const listAwaitingHandoff = query({
  args: {},
  handler: async (ctx) => {
    const calls = await ctx.db
      .query('calls')
      .withIndex('by_handoffState', (q) => q.eq('handoffState', 'awaiting_human'))
      .order('desc')
      .collect();
    return Promise.all(calls.map((c) => enrichCall(ctx, c)));
  },
});

// Calls that are live in any sense: an in-flight verification call, or one that
// is somewhere in the handoff lifecycle. Used by the Live Calls page.
export const listLive = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject || 'default';

    // Recent calls for this user, then filter to "live-ish" in memory. The set
    // is small (active calls only) so this stays cheap.
    const recent = await ctx.db
      .query('calls')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .take(50);

    const LIVE_STATUSES = new Set(['initiating', 'in_progress']);
    const LIVE_HANDOFF = new Set(['awaiting_human', 'accepting', 'connected']);

    const live = recent.filter(
      (c) =>
        LIVE_STATUSES.has(c.status) ||
        (c.handoffState && LIVE_HANDOFF.has(c.handoffState))
    );
    return Promise.all(live.map((c) => enrichCall(ctx, c)));
  },
});

// One call + its event timeline, for the detail/timeline view.
export const getHandoff = query({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const enriched = await enrichCall(ctx, call);
    const events = await ctx.db
      .query('callEvents')
      .withIndex('by_callId', (q) => q.eq('callId', args.callId))
      .order('asc')
      .collect();
    return { call: enriched, events };
  },
});

// Resolve a parked call from the numeric handoff token carried in the
// transfer's post-dial digits. Falls back to the most-recent awaiting call when
// no token is supplied (single-active-handoff demo fallback — see spec).
export const resolveByToken = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.token && args.token.trim()) {
      const match = await ctx.db
        .query('calls')
        .filter((q) => q.eq(q.field('handoffToken'), args.token))
        .first();
      if (match) return match;
    }
    // Fallback: most recent in-progress call (the one the AI is on right now).
    const recent = await ctx.db.query('calls').order('desc').take(20);
    return (
      recent.find(
        (c) => c.status === 'in_progress' || c.handoffState === 'awaiting_human'
      ) || null
    );
  },
});

// ---------------------------------------------------------------------------
// Internal mutations — state transitions driven by TwiML/webhook handlers.
// ---------------------------------------------------------------------------

async function logEvent(ctx: any, callId: any, type: string, message?: string) {
  await ctx.db.insert('callEvents', {
    callId,
    type,
    message,
    timestamp: new Date().toISOString(),
  });
}

// Insurance human detected → park the rep, broadcast to our pool. Idempotent:
// re-invoking while already awaiting/accepting/connected is a no-op.
export const requestHandoff = internalMutation({
  args: { callId: v.id('calls'), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { ok: false, reason: 'not_found' };
    if (
      call.handoffState &&
      ['awaiting_human', 'accepting', 'connected', 'handoff_ended'].includes(
        call.handoffState
      )
    ) {
      return { ok: true, alreadySet: true };
    }
    await ctx.db.patch(args.callId, {
      handoffState: 'awaiting_human',
      handoffRequestedAt: new Date().toISOString(),
      handoffReason: args.reason,
      conferenceName: `cadence-${args.callId}`,
    });
    await logEvent(ctx, args.callId, 'handoff_requested', args.reason);
    return { ok: true };
  },
});

// Set the correlation token at call-initiation time (calls.create has a narrow
// arg set, so this is patched separately — mirrors patchCallUseCase).
export const setHandoffToken = internalMutation({
  args: { callId: v.id('calls'), token: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, { handoffToken: args.token });
  },
});

export const markHandoffConnected = internalMutation({
  args: { callId: v.id('calls'), humanParticipantCallSid: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      handoffState: 'connected',
      humanParticipantCallSid: args.humanParticipantCallSid,
    });
    await logEvent(ctx, args.callId, 'handoff_connected');
  },
});

export const markHandoffFailed = internalMutation({
  args: { callId: v.id('calls'), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, { handoffState: 'handoff_failed' });
    await logEvent(ctx, args.callId, 'handoff_failed', args.reason);
  },
});

export const markHandoffEnded = internalMutation({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, { handoffState: 'handoff_ended' });
    await logEvent(ctx, args.callId, 'handoff_ended');
  },
});

// ---------------------------------------------------------------------------
// Public mutations — the Accept / Decline actions our agents take in the UI.
// ---------------------------------------------------------------------------

// Atomic compare-and-set: only the FIRST agent to accept wins. Convex runs
// mutations serializably, so the read-then-patch below cannot interleave — a
// second concurrent accept sees state !== "awaiting_human" and is rejected.
export const acceptHandoff = mutation({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { ok: false, reason: 'not_found' };
    if (call.handoffState !== 'awaiting_human') {
      return { ok: false, reason: 'already_taken' };
    }
    const identity = await ctx.auth.getUserIdentity();
    const acceptedBy = identity?.subject || 'operator';
    const acceptedEmail = identity?.email || undefined;

    await ctx.db.patch(args.callId, {
      handoffState: 'accepting',
      handoffAcceptedByUserId: acceptedBy,
      handoffAcceptedByEmail: acceptedEmail,
      handoffAcceptedAt: new Date().toISOString(),
    });
    await logEvent(
      ctx,
      args.callId,
      'handoff_accepted',
      acceptedEmail || acceptedBy
    );
    return { ok: true, conferenceName: `cadence-${args.callId}` };
  },
});

// Broadcast model: a decline does NOT release/cancel the call — it just records
// that this agent passed, and the call stays available to everyone else.
export const declineHandoff = mutation({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { ok: false, reason: 'not_found' };
    const identity = await ctx.auth.getUserIdentity();
    const who = identity?.email || identity?.subject || 'operator';
    await logEvent(ctx, args.callId, 'handoff_declined', who);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Action — dial an external phone into the conference. NOT used by the browser
// softphone (that joins the conference client-side via the Voice SDK), but kept
// for a dialed-number fallback / server-initiated bridge. Uses only the
// Account SID + Auth Token we already have.
// ---------------------------------------------------------------------------
export const connectHumanToConference = action({
  args: { callId: v.id('calls'), agentPhoneNumber: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; callSid?: string; error?: string }> => {
    const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const FROM = process.env.TWILIO_PHONE_NUMBER;
    const SITE = process.env.CONVEX_SITE_URL;

    if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM) {
      await ctx.runMutation(internal.handoff.markHandoffFailed, {
        callId: args.callId,
        reason: 'twilio_not_configured',
      });
      return { ok: false, error: 'Twilio not configured' };
    }

    const joinUrl = `${SITE}/twiml-agent-join?callId=${args.callId}`;
    const statusUrl = `${SITE}/twilio-status`;

    const body = new URLSearchParams({
      To: args.agentPhoneNumber,
      From: FROM,
      Url: joinUrl,
      StatusCallback: statusUrl,
    });

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Twilio ${res.status}: ${text}`);
      }
      const result = await res.json();
      const callSid = result.sid;
      await ctx.runMutation(internal.handoff.markHandoffConnected, {
        callId: args.callId,
        humanParticipantCallSid: callSid,
      });
      return { ok: true, callSid };
    } catch (error: any) {
      await ctx.runMutation(internal.handoff.markHandoffFailed, {
        callId: args.callId,
        reason: error.message,
      });
      return { ok: false, error: error.message };
    }
  },
});
