// Shared "is this call still occupying the assigned operator" check, used by
// both the routing-agent picker (handoff.ts) and the admin routing table
// (users.ts) — previously duplicated in both files as a check that went stale
// the instant `call.status` flipped to "completed".
//
// Bug this fixes: callActions.endCall sets `status: "completed"` as soon as
// the operator hangs up, BEFORE they've finished reviewing/dispositioning the
// call. The old check treated "completed" as "not active" unconditionally, so
// the call vanished from the operator's queue (and they became routable for a
// new call) before ever seeing the wrap-up screen. Now: once a call has gone
// through a human handoff and ended, it stays "active" — visible in the
// operator's queue, and blocking new routing — until the operator explicitly
// clicks "Complete Call" (sets `wrapUpCompletedAt`, see handoff.completeWrapUp).

// After this long with no resolution (live call OR un-wrapped-up call), stop
// treating it as active — safety net so a forgotten tab can't permanently
// block an operator from getting new calls.
const STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isStaleLiveCall(call: any): boolean {
  if (!call.startedAt) return false;
  return Date.now() - new Date(call.startedAt).getTime() > STALE_MS;
}

function isStaleWrapUp(call: any): boolean {
  const endedAt = call.completedAt || call.startedAt;
  if (!endedAt) return false;
  return Date.now() - new Date(endedAt).getTime() > STALE_MS;
}

const LIVE_STATUSES = new Set(['initiating', 'in_progress']);
const LIVE_HANDOFF_STATES = new Set(['awaiting_human', 'accepting', 'connected']);
const ENDED_HANDOFF_STATES = new Set(['handoff_ended', 'handoff_failed']);

export function isRoutingCallActive(call: any): boolean {
  if (call.status !== 'completed' && call.status !== 'failed') {
    if (isStaleLiveCall(call)) return false;
    return LIVE_STATUSES.has(call.status) || LIVE_HANDOFF_STATES.has(call.handoffState);
  }

  // Call itself has ended. Still "active" (wrap-up) only if it went through a
  // human handoff and the operator hasn't clicked "Complete Call" yet.
  if (!ENDED_HANDOFF_STATES.has(call.handoffState)) return false;
  if (call.wrapUpCompletedAt) return false;
  if (isStaleWrapUp(call)) return false;
  return true;
}

export function findFirstActiveCall(calls: any[]): any | null {
  return calls.find(isRoutingCallActive) || null;
}

export function anyCallActive(calls: any[]): boolean {
  return calls.some(isRoutingCallActive);
}
