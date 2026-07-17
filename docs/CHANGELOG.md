# Changelog

## 2026-07-17 — Live AI→Human Call Handoff (Phase 1) [branch: cadence_pro_ivr]

Feature: when the AI navigating a payer IVR reaches the insurance human, hand the
live call to one of our human agents (browser softphone) — human↔human on the
same call — with an Accept/Decline broadcast and a Live Calls view. Architecture
& rationale in `docs/PLAN.md`; build contract in `docs/HANDOFF_BUILD_SPEC.md`.

**Backend (Convex)**
- `schema.ts` — added optional handoff fields to `calls` (`handoffState`,
  `handoffRequestedAt/Reason`, `handoffAcceptedBy*`, `conferenceName`,
  `aiParticipantCallSid`, `humanParticipantCallSid`, `handoffToken`) + index
  `by_handoffState`. All additive; existing calls unaffected.
- `handoff.ts` (new) — reactive queries `listAwaitingHandoff` / `listLive` /
  `getHandoff` / `resolveByToken`; mutations `acceptHandoff` (atomic first-wins),
  `declineHandoff`; internal `requestHandoff` / `setHandoffToken` /
  `markHandoffConnected|Failed|Ended`; action `connectHumanToConference`
  (dialed-number fallback, uses Account SID + Auth Token only).
- `http.ts` — new TwiML routes: `/twiml-bridge-inbound`, `/twiml-bridge-parked`,
  `/twiml-conference-hold`, `/twiml-agent-join`, `/twiml-softphone-outgoing`;
  `/twilio-voice-token` (mints Twilio Voice access-token JWT via Web Crypto);
  extended `/twilio-status` to close out handoff calls.
- `prompts/ivrOnlyMode.ts` — agent now fires `transfer_to_number` (Conference)
  to `{{bridge_number}}` on human handoff (falls back to legacy `end_call` when
  no bridge number). `callActions.ts` + `dentalCallActions.ts` pass new
  `bridge_number` / `handoff_token` dynamic vars; dental sets
  `endAtHumanHandoff` so IVR-only guidance is injected.

**Frontend (React)**
- `pages/LiveCallsPage.jsx` (route `/live`), `components/HandoffTimeline.jsx`,
  `components/HandoffNotifier.jsx` (mounted in `Layout.jsx`),
  `hooks/useSoftphone.js` (@twilio/voice-sdk, lazy-loaded, degrades to
  "unconfigured" when creds missing). Route added in `App.jsx`; "Live Calls"
  nav added in `Sidebar.jsx`.

**Repo**
- Corrected Convex deployment id `colorless-cardinal-959` → `rapid-pheasant-510`
  across 23 files (Dockerfile, CLAUDE.md, tests, docs, scripts).

**Validated:** frontend `npm run build` passes; new files lint clean; backend
cross-references (`internal.handoff.*`, `api.handoff.*`) all resolve; backend
uses only Web-standard APIs (no Node-only calls) safe for the Convex runtime.

**NOT yet done (requires user):**
1. `npx convex deploy` to `rapid-pheasant-510` (regenerates `_generated`, runs
   the real Convex typecheck, publishes the new functions/routes). No commits or
   deploys were made by Claude.
2. ElevenLabs dashboard: add the `transfer_to_number` (Conference) tool to both
   agents + copy the handoff guidance into the medical agent's fixed prompt —
   see `docs/elevenlabs/transfer-to-number-setup.md`.
3. Twilio: create an API Key (`SK…`) + secret and a TwiML App (`AP…`, Voice URL
   → `https://rapid-pheasant-510.convex.site/twiml-softphone-outgoing`); add
   `TWILIO_API_KEY` / `TWILIO_API_SECRET` / `TWILIO_TWIML_APP_SID` to Convex env.
4. End-to-end verify against the payer simulator.

**Phase 2 note:** the browser softphone code is complete but inert for in-browser
audio until the 3 Twilio creds above exist (token endpoint returns 503, UI shows
a clear "not configured" banner — nothing breaks).
