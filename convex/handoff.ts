// Live AI→Human Handoff (cadence_pro_ivr) — Option 1: Cadence owns the call
// ---------------------------------------------------------------------------
// State machine + queries powering the live transfer where the AI navigates a
// payer IVR, then — when the insurance human is about to pick up — the call is
// handed to one of OUR human agents (a broadcast pool) who takes it over in the
// browser, all on the SAME call. See docs/PLAN.md ("LOCKED ARCHITECTURE —
// Option 1") and the memory note handoff-b-option1-cadence-owns-call.
//
// The AI is NOT a conference participant (Twilio makes that impossible — a
// <Connect><Stream> leg cannot also be in a <Conference>). Instead:
//   1. Cadence dials the payer; the payer leg runs <Connect><Stream> to the
//      bridge → ElevenLabs (initiateCallViaTwilio). Payer↔AI talk directly.
//   2. On human handoff, /twilio-request-handoff flips the call to
//      handoffState="awaiting_human" and broadcasts to the pool.
//   3. On Accept, redirectPayerToConference() does POST /Calls/<payerSid> with
//      Url=/twiml-payer-conference — Twilio abandons the <Connect><Stream>
//      (closing the bridge socket = AI DROPPED) and parks the payer in the
//      conference `cadence-<callId>`.
//   4. The browser agent joins that same conference via the Voice SDK.
// Dropping the AI is thus a byproduct of the redirect — no participant removal,
// no separate AI leg, no DTMF correlation.
//
// handoffState values (also documented on the schema):
//   awaiting_human | accepting | connected | declined | handoff_failed | handoff_ended
// ---------------------------------------------------------------------------

import { mutation, query, action, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';

// ---------------------------------------------------------------------------
// Enrichment helper — mirrors calls.listRecent so the UI gets human-readable
// labels (payer, claim/case number, patient name) without extra round-trips.
// ---------------------------------------------------------------------------
const STALE_LIVE_MS = 2 * 60 * 60 * 1000;

function isStaleLiveCall(call: any): boolean {
  if (!call.startedAt) return false;
  return Date.now() - new Date(call.startedAt).getTime() > STALE_LIVE_MS;
}

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

function routingDisplayName(user: any, index: number): string {
  return user.name || user.email || `Agent ${index + 1}`;
}

function isRoutingCallActive(call: any): boolean {
  if (call.status === 'completed' || call.status === 'failed') return false;
  if (isStaleLiveCall(call)) return false;
  const liveStatuses = new Set(['initiating', 'in_progress']);
  const liveHandoffStates = new Set(['awaiting_human', 'accepting', 'connected']);
  return liveStatuses.has(call.status) || liveHandoffStates.has(call.handoffState);
}

async function findAvailableRoutingAgent(ctx: any) {
  const users = await ctx.db.query('users').collect();
  const activeUsers = users
    .filter((user: any) => user.status !== 'disabled' && user.role === 'operator')
    .sort((a: any, b: any) => a._creationTime - b._creationTime);

  for (let i = 0; i < activeUsers.length; i++) {
    const user = activeUsers[i];
    const assignedCalls = await ctx.db
      .query('calls')
      .withIndex('by_assignedAgentUserId', (q: any) => q.eq('assignedAgentUserId', user._id))
      .collect();
    const busy = assignedCalls.some(isRoutingCallActive);
    if (!busy) {
      return {
        user,
        displayName: routingDisplayName(user, i),
      };
    }
  }

  return null;
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
    return Promise.all(
      calls
        .filter((c) => c.status !== 'completed' && c.status !== 'failed')
        .map((c) => enrichCall(ctx, c))
    );
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
        c.status !== 'completed' &&
        c.status !== 'failed' &&
        !isStaleLiveCall(c) &&
        (LIVE_STATUSES.has(c.status) ||
          (c.handoffState && LIVE_HANDOFF.has(c.handoffState)))
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

// Exported wrapper so actions (which have no ctx.db) can append a timeline event.
export const logHandoffEvent = internalMutation({
  args: { callId: v.id('calls'), type: v.string(), message: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await logEvent(ctx, args.callId, args.type, args.message);
  },
});

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

    const assignedAgent = await findAvailableRoutingAgent(ctx);

    const handoffPatch: any = {
      handoffState: 'awaiting_human',
      handoffRequestedAt: new Date().toISOString(),
      handoffReason: args.reason,
      conferenceName: `cadence-${args.callId}`,
    };
    if (assignedAgent) {
      handoffPatch.assignedAgentUserId = assignedAgent.user._id;
      handoffPatch.assignedAgentEmail = assignedAgent.user.email;
      handoffPatch.assignedAgentName = assignedAgent.displayName;
    }
    await ctx.db.patch(args.callId, handoffPatch);
    await logEvent(
      ctx,
      args.callId,
      'handoff_requested',
      assignedAgent
        ? `${args.reason || 'handoff_requested'}; assigned to ${assignedAgent.displayName}`
        : `${args.reason || 'handoff_requested'}; no available agent`
    );

    // Safety net: if no agent accepts within the window, mark the handoff failed
    // so the Live Calls view doesn't show a stuck "awaiting" card forever.
    await ctx.scheduler.runAfter(
      HANDOFF_TIMEOUT_MS,
      internal.handoff.checkHandoffTimeout,
      { callId: args.callId }
    );
    return { ok: true };
  },
});

// How long an incoming handoff stays offered to the pool before we give up.
const HANDOFF_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// Scheduled after requestHandoff. If the call is STILL awaiting_human (no agent
// accepted), mark it failed. If it advanced (accepting/connected/ended), no-op.
export const checkHandoffTimeout = internalMutation({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return;
    if (call.handoffState === 'awaiting_human') {
      await ctx.db.patch(args.callId, { handoffState: 'handoff_failed' });
      await logEvent(ctx, args.callId, 'handoff_failed', 'no_agent_accepted_timeout');
    }
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

// Stamp the deterministic conference name at call-initiation time. The name
// `cadence-<callId>` is the sole correlation key for the whole handoff — the
// payer leg is redirected into it, and the browser agent joins it by name.
export const setConferenceName = internalMutation({
  args: { callId: v.id('calls'), conferenceName: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, { conferenceName: args.conferenceName });
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

// Save the conference recording URL/duration (from Twilio recordingStatusCallback).
export const saveRecording = internalMutation({
  args: {
    callId: v.id('calls'),
    recordingUrl: v.string(),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: any = {
      recordingUrl: args.recordingUrl,
    };
    if (args.duration !== undefined) patch.duration = args.duration;
    await ctx.db.patch(args.callId, patch);
    await logEvent(ctx, args.callId, 'recording_ready', args.recordingUrl);
  },
});

export const getRecordingForPlayback = internalQuery({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call?.recordingUrl) return null;
    return { recordingUrl: call.recordingUrl };
  },
});

// Append the human-portion transcript (from Twilio transcribeCallback). Kept in
// a dedicated field so it doesn't collide with the AI/IVR transcript on the call.
export const saveHumanTranscript = internalMutation({
  args: { callId: v.id('calls'), transcript: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, { humanTranscript: args.transcript });
    await logEvent(ctx, args.callId, 'human_transcript_ready');
  },
});

// ---------------------------------------------------------------------------
// Public mutations — the Accept / Decline actions our agents take in the UI.
// ---------------------------------------------------------------------------

// Atomic compare-and-set: only the FIRST agent to accept wins. Convex runs
// mutations serializably, so the read-then-patch below cannot interleave — a
// second concurrent accept sees state !== "awaiting_human" and is rejected.
export const acceptHandoff = mutation({
  args: {
    callId: v.id('calls'),
    agentUserId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { ok: false, reason: 'not_found' };
    if (call.handoffState !== 'awaiting_human') {
      return { ok: false, reason: 'already_taken' };
    }
    const identity = await ctx.auth.getUserIdentity();
    const requestedAgentId = args.agentUserId || (identity?.subject as any);
    if (
      call.assignedAgentUserId &&
      requestedAgentId &&
      requestedAgentId !== call.assignedAgentUserId
    ) {
      return { ok: false, reason: 'not_assigned_to_agent' };
    }

    const assignedAgent = call.assignedAgentUserId
      ? await ctx.db.get(call.assignedAgentUserId)
      : null;
    const acceptedBy =
      args.agentUserId ||
      call.assignedAgentUserId ||
      identity?.subject ||
      'operator';
    const acceptedEmail = assignedAgent?.email || identity?.email || undefined;
    const acceptedName = call.assignedAgentName || assignedAgent?.name || acceptedEmail || acceptedBy;

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
      acceptedName
    );
    return { ok: true, conferenceName: `cadence-${args.callId}` };
  },
});

// Called by the browser once its softphone has joined the conference AND the
// payer leg has been redirected in — flips the call to "connected". Public
// (client-invoked) wrapper around the internal state transition.
export const markConnectedFromClient = mutation({
  args: { callId: v.id('calls') },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { ok: false, reason: 'not_found' };
    // Only advance from accepting → connected (guards against stale clicks).
    if (call.handoffState !== 'accepting' && call.handoffState !== 'connected') {
      return { ok: false, reason: `unexpected_state:${call.handoffState}` };
    }
    await ctx.db.patch(args.callId, { handoffState: 'connected' });
    await logEvent(ctx, args.callId, 'handoff_connected', 'browser softphone bridged');
    return { ok: true };
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

// ---------------------------------------------------------------------------
// Action — THE AI DROP. Redirect the live payer leg out of its <Connect><Stream>
// (to the bridge → ElevenLabs) and into the conference. Twilio abandons the
// current TwiML, which closes the bridge WebSocket → the AI is dropped. The
// payer is then parked in `cadence-<callId>` waiting for our human agent.
//
// Called on Accept (by the frontend, right after acceptHandoff succeeds, once
// the softphone has joined — or just before, since the payer holds in the
// conference with waitUrl audio). Idempotent-ish: safe to call once per accept.
// ---------------------------------------------------------------------------
export const redirectPayerToConference = action({
  args: { callId: v.id('calls') },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string; terminal?: boolean }> => {
    const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const SITE = process.env.CONVEX_SITE_URL;

    if (!ACCOUNT_SID || !AUTH_TOKEN || !SITE) {
      await ctx.runMutation(internal.handoff.markHandoffFailed, {
        callId: args.callId,
        reason: 'twilio_not_configured',
      });
      return { ok: false, error: 'Twilio not configured' };
    }

    const call = await ctx.runQuery(api.calls.getById, { id: args.callId });
    if (!call) return { ok: false, error: 'call_not_found' };
    const payerSid = call.twilioCallSid;
    if (!payerSid) {
      // No Cadence-owned payer leg (e.g. call placed via the legacy ElevenLabs
      // dialer). Option-1 redirect is impossible; fail loudly so the UI shows it.
      await ctx.runMutation(internal.handoff.markHandoffFailed, {
        callId: args.callId,
        reason: 'no_payer_call_sid (legacy dialer? live handoff needs the Twilio dialer)',
      });
      return { ok: false, error: 'no_payer_call_sid' };
    }

    // New TwiML for the payer leg → park in the conference. Redirecting to this
    // URL replaces the running <Connect><Stream>, severing the AI.
    const conferenceTwimlUrl = `${SITE}/twiml-payer-conference?callId=${args.callId}`;
    const body = new URLSearchParams({ Url: conferenceTwimlUrl, Method: 'POST' });

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${payerSid}.json`,
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
        throw new Error(`Twilio redirect ${res.status}: ${text}`);
      }
      await ctx.runMutation(internal.handoff.logHandoffEvent, {
        callId: args.callId,
        type: 'ai_dropped',
        message: 'payer leg redirected into conference; AI stream closed',
      });
      return { ok: true };
    } catch (error: any) {
      if (/21220|not in-progress|cannot redirect/i.test(error.message || '')) {
        await ctx.runMutation(internal.handoff.logHandoffEvent, {
          callId: args.callId,
          type: 'handoff_ended',
          message: `payer leg already ended before redirect: ${error.message}`,
        });
        return { ok: false, error: error.message, terminal: true };
      }
      await ctx.runMutation(internal.handoff.markHandoffFailed, {
        callId: args.callId,
        reason: error.message,
      });
      return { ok: false, error: error.message };
    }
  },
});
