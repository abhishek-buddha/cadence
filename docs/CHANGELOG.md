# Changelog

## 2026-07-17 — Handoff rearchitected to Option 1 (Cadence owns the call) [cadence_pro_ivr]

Replaces the ElevenLabs `transfer_to_number` design. Verified against Twilio docs
that a `<Connect><Stream>` leg cannot also be a `<Conference>` participant, so the
AI can never be a droppable conference member. New working topology:

- **New default dialer** `callActions.initiateCallViaTwilio`: Cadence places the
  outbound call to the payer via Twilio REST and OWNS the CallSid. Payer leg TwiML
  = existing `/twiml-call-start` (`<Connect><Stream>` → bridge `/media-stream` →
  the SAME ElevenLabs agent, unchanged). `initiateCall` now switches on
  `USE_LEGACY_DIALER` env (default = new dialer; `='true'` → original
  ElevenLabs-native path, kept verbatim as `initiateCallLegacyElevenLabs`).
- **Shared** `buildMedicalDynamicVars()` — single source of truth for the agent's
  dynamic variables, used by both dialers AND by `/call-metadata` (which the
  bridge fetches to init ElevenLabs), so the agent navigates the IVR identically
  over either transport.
- **AI drop = redirect, not participant-removal:** `handoff.redirectPayerToConference`
  POSTs the live payer call to `/twiml-payer-conference`, which abandons the
  `<Connect><Stream>` (closing the bridge socket → AI dropped) and parks the payer
  in conference `cadence-<callId>`. New `/twilio-request-handoff` sets
  `awaiting_human`. New `markConnectedFromClient` + `setConferenceName` +
  `logHandoffEvent`.
- **Frontend** Accept flow rewired: claim → softphone joins conference → redirect
  payer (drops AI) → mark connected.
- **Infra:** bought 2nd Twilio number `+17744486457` = caller (`TWILIO_PHONE_NUMBER`);
  `+13187589839` stays the payer IVR, webhook repointed to `rapid-pheasant-510`.
  No cadence-bridge changes required. Deployed to `rapid-pheasant-510` (typecheck OK).
- **Pending:** checkpoint test call (AI navigates IVR over the bridge?) before the
  handoff path is exercised end-to-end.

## 2026-07-17 — Handoff hardening: recording, transcription, timeout [cadence_pro_ivr]

- **Conference recording:** the handoff conference now records automatically
  (`record-from-start`, no consent prompt per requirement). New
  `/twilio-recording-status` handler saves `recordingUrl` onto the call and
  requests Twilio transcription of the recording.
- **Transcription:** `/twilio-transcription` handler saves the human↔human
  transcript to a new `calls.humanTranscript` field (Twilio built-in
  transcription — easiest path). Surfaced in the Live Calls active-call card
  (recording link + collapsible transcript).
- **Edge cases:** `requestHandoff` now schedules `checkHandoffTimeout` (3 min);
  an unclaimed handoff auto-transitions to `handoff_failed` instead of sticking.
- `handoff.ts` new internals: `saveRecording`, `saveHumanTranscript`,
  `checkHandoffTimeout`. Deployed to rapid-pheasant-510 (typecheck + schema OK).

**Still pending:** ElevenLabs `transfer_to_number` tool config (unblocks live
test) → then a real call to observe DTMF correlation and finalize concurrent-
call hardening.

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
