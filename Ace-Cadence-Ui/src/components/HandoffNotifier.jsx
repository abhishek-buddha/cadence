// HandoffNotifier — broadcast toast for an incoming AI→human handoff.
//
// NOT YET MIGRATED: the original subscribed to Convex's reactive
// `handoff.listAwaitingHandoff` query for instant toast-on-handoff. The new
// backend has the equivalent data (call-handling-svc
// `GET /calls?handoff_state=awaiting_human`) but this component hasn't been
// rewired to poll/subscribe to it yet — see architecture plan's live-call
// WebSocket work. Renders nothing for now rather than crashing or lying
// about live state; mounted in both layouts so it's ready to fill in.

export default function HandoffNotifier() {
  return null;
}
