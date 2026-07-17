# PLAN — Live AI→Human Call Handoff (cadence_pro_ivr)

**Status:** APPROVED — building on branch `cadence_pro_ivr`. No commits until user says so.
**Date:** 2026-07-17
**Feature:** When the AI agent navigates a payer IVR and the *insurance human agent* picks up, hand the live call off from the AI to one of *our* human agents (a queue/pool), so a real human↔human conversation continues on the **same call**. Plus a new **Live Calls / Handoff** view showing in-progress calls and the AI→human transfer in real time.

---

## ⭐ REVISED ARCHITECTURE (after bridge + ElevenLabs investigation) — this supersedes §2–§3 below

**Key discovery:** ElevenLabs Conversational AI has a native `transfer_to_number` system tool with a **Conference** method that "calls the destination, adds it to a conference, then removes the AI agent so only the caller and transferred participant remain." This is exactly the AI-drop we need — so we do NOT switch off ElevenLabs-native outbound and do NOT touch the bridge repo (kills the original §9.1 risk).

**Locked flow:**
1. AI runs on the existing ElevenLabs-native outbound call, navigates payer IVR — UNCHANGED.
2. On insurance-human handoff, AI fires `transfer_to_number` (Conference) to a SINGLE Cadence bridge number (our Twilio `+13187589839`). ElevenLabs conferences that leg in with the rep and drops itself.
3. The bridge number's inbound TwiML (Convex `http.ts`) parks the rep in a Twilio conference `cadence-<callId>` with hold audio, and sets `call.handoffState="awaiting_human"` → reactive broadcast to ALL active users.
4. An agent clicks Accept → Phase 1: Cadence dials the agent's number into the conference; Phase 2: browser softphone joins. `handoffState="connected"`. Human↔human. Decline/timeout → stays available; all-declined → `handoff_failed`.

**Why low-risk:** existing calls unaffected (new path is additive + per-payer opt-in); bridge untouched; only new telephony Cadence owns is one inbound leg + conference (standard TwiML); Accept/Decline/Live-view is pure Convex reactive state. `transfer_to_number` is configured per-agent via the ElevenLabs API (existing `scripts/setup-elevenlabs-agents.mjs`), not hardcoded.

**How the rep reaches our bridge number:** the AI transfers to it via ElevenLabs Conference transfer (an outbound-from-ElevenLabs call into our number). We map that inbound call back to the original `callId` via the transfer's post-dial digits or a lookup on the parked call (resolved during build).

---

---

## 1. Confirmed requirements (from user)

- **Trigger:** The AI (already on the line, in IVR-only mode) detects the insurance human handoff and signals it. This is the only reliable detector in this architecture.
- **On detection:** App broadcasts an "incoming handoff" notification to **all active users**. Any user can **Accept** or **Decline**. First to accept wins.
- **Swap style:** **Blind** — AI leg drops immediately; our human is bridged in.
- **Our agents connect via the Web UI only** (browser softphone), NOT dialed phones. → Twilio Voice JS SDK (WebRTC).
- **Real telephony**, "but not too complex." Cadence must own the Twilio call leg to re-bridge for real.
- **Sequencing:** Phase 1 = full state machine + Live Calls view + Accept/Decline broadcast + real Twilio conference + AI-drop transfer (agent joins via a **dialed number interim**). Phase 2 = swap the interim dial for the **in-browser softphone**.

## 2. Why the telephony path must change (and what stays the same)

- **Today:** ElevenLabs' native `/v1/convai/twilio/outbound-call` dials the payer. **ElevenLabs owns the Twilio leg → Cadence has no CallSid → cannot re-bridge.**
- **Change:** Cadence places the call via the **Twilio REST API** itself and streams audio into the **same ElevenLabs agent** over the existing bridge (WebSocket media stream). The legacy `/twiml-call-start` → bridge `/media-stream` path already proves this works.
- **ElevenLabs agent is UNCHANGED:** same agent IDs, same `composePrompt`, same dynamic variables, same IVR navigation, same transcript/analysis. Only the dialer changes. Cadence gains the CallSid → real call control.
- The call is placed **into a Twilio `<Conference>`** so participants can be swapped live (AI leg drops, human leg joins the same conference).

## 3. Telephony architecture (Phase 1)

```
Cadence (Twilio REST create call, holds CallSid)
   │  to=payer.phone,  TwiML → <Dial><Conference>cadence-<callId></Conference>
   ▼
Payer line joins Conference "cadence-<callId>"
   │
   ├─ AI media leg: bridge /media-stream ↔ ElevenLabs agent (navigates IVR)
   │
   ▼ AI detects insurance human pickup
   │  → transfer_to_human(reason) tool → webhook /twilio-request-handoff
   ▼
Call.handoffState = "awaiting_human"  → broadcast to all active users (Convex reactive query)
   │
   ▼ A user clicks Accept  → mutation acceptHandoff → action connectHumanToConference
   │  Phase 1: Twilio REST create call to agent's number, TwiML joins same Conference
   │  Phase 2: browser softphone (Twilio Client) joins same Conference
   ▼
Drop AI leg (Twilio REST update AI participant → hangup, or remove from conference)
   ▼
Insurance human ↔ our human, same conference. handoffState = "connected"
```

Conference name = deterministic `cadence-<callId>` so every leg (payer, AI, human) can find it without extra lookups.

## 4. Data model changes (`convex/schema.ts`)

**`calls` table — add fields:**
- `handoffState?: string` — `"none" | "awaiting_human" | "accepting" | "connected" | "declined" | "handoff_failed" | "handoff_ended"`
- `handoffRequestedAt?: string`
- `handoffAcceptedByUserId?: string`, `handoffAcceptedByEmail?: string`, `handoffAcceptedAt?: string`
- `conferenceName?: string`
- `aiParticipantCallSid?: string` — the leg to drop
- `humanParticipantCallSid?: string` — our agent's leg (Phase 1 dialed / Phase 2 client)
- `handoffReason?: string` — reason string the AI passed
- Reuse existing `twilioCallSid` for the payer leg.

**New index:** `calls.by_handoffState` on `['handoffState']` — powers the Live Calls broadcast query cheaply.

*(No breaking changes — all new fields optional; existing calls unaffected.)*

## 5. Backend work (Convex)

### 5.1 Placing the Cadence-controlled call
- New action `convex/twilioCallActions.ts : initiateIvrCallViaTwilio({ claimId | dentalCaseId })` (or extend existing `initiateCall`/`initiateEvCall` behind a flag). Uses `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` (already in env) to `POST` Twilio `/Calls.json` with `Url → /twiml-ivr-conference?callId=...`.
- New TwiML handler `/twiml-ivr-conference` in `http.ts`: returns `<Dial><Conference startConferenceOnEnter=true endConferenceOnExit=false>cadence-<callId></Conference></Dial>` and starts the `<Stream>` to the bridge (so ElevenLabs agent hears + speaks) exactly like `/twiml-call-start`.
- **Note / bridge dependency:** the AI must be a *participant* in the conference, not just a passive stream. Two options, chosen in build: (a) the ElevenLabs agent is dialed into the conference as its own leg via the bridge, or (b) we keep the media-stream model and, on handoff, `<Dial>` the human into the conference while redirecting the payer leg. Will validate which the bridge supports first (may need a small bridge tweak — flagged as a risk, see §9).

### 5.2 Detecting the handoff
- Repurpose the existing `transfer_to_human` tool + `ivrOnlyMode.ts` detection. Update `IVR_ONLY_MODE_GUIDANCE` / `TRANSFER_TRIGGER_GUIDANCE` so that in IVR-only mode the agent, on human pickup, calls `transfer_to_human(reason="ivr_human_handoff_detected")` instead of `end_call`.
- New HTTP action `/twilio-request-handoff` (webhook the tool hits, or wire via existing `/v1/transfers/{callId}`): sets `handoffState="awaiting_human"`, `handoffRequestedAt`, `handoffReason`; records `aiParticipantCallSid`. Does NOT drop AI yet (blind drop happens on Accept so the rep isn't in silence indefinitely — a short AI holding line covers the gap).

### 5.3 Accept / Decline (broadcast queue)
- `mutation acceptHandoff({ callId })`: atomic compare-and-set — only succeeds if `handoffState === "awaiting_human"`; sets `accepting` + accepting user info. First writer wins; others get a benign "already taken".
- `mutation declineHandoff({ callId })`: audit only (broadcast model — one decline doesn't cancel; call stays available to others). If ALL decline / timeout → `handoff_failed`.
- `action connectHumanToConference({ callId })`:
  - **Phase 1:** Twilio REST create call `to = accepting agent's phone` (from a new per-user field or a single configured ops number), TwiML → join `cadence-<callId>` conference. Store `humanParticipantCallSid`.
  - Drop AI: Twilio REST `POST Conferences/<name>/Participants/<aiParticipantCallSid>` update → or hang up the AI leg. Set `handoffState="connected"`, `handoffAcceptedAt`.
- Reactive Convex queries (no polling needed) drive the UI: `calls.listAwaitingHandoff` and `calls.listLive`.

### 5.4 Cleanup / edge cases
- Twilio status callbacks (`/twilio-status`) already flip terminal state; extend to also close out `handoffState` → `handoff_ended` and end the conference.
- Guard: a call with `parentCallId` can't request handoff (mirrors existing follow-up guard).
- The legacy `initiateHumanAgentCall` separate-call path stays as-is for payers WITHOUT the new live-transfer (backward compatible / fallback).

## 6. Frontend work (React)

### 6.1 New page: **Live Calls** — route `/live` (`src/pages/LiveCallsPage.jsx`)
- Reactive queries: `api.calls.listLive` (in-progress calls) + `api.calls.listAwaitingHandoff`.
- Sections: **Incoming handoffs** (cards with payer, patient/claim, reason, elapsed since request, **Accept** / **Decline** buttons) and **Active calls** (each with phase/handoffState, embedded `LiveCallMonitor`, and a visible AI→human transfer timeline).
- Add to `Sidebar.jsx` nav + `App.jsx` route.

### 6.2 Handoff notification (app-wide broadcast)
- A small `HandoffNotifier` mounted in `Layout.jsx`: subscribes to `listAwaitingHandoff`; when a new one appears, shows a toast/banner ("Insurance rep on the line for claim X — Accept?") with Accept → `acceptHandoff` then navigate to `/live`. Broadcast = every active user sees it; reactive query auto-clears it when someone accepts.

### 6.3 Transfer visualization
- In `LiveCallMonitor.jsx` (or a new `HandoffTimeline` component): render the state machine visibly — `AI navigating IVR → insurance human detected → awaiting our agent → [name] accepted → connected (human↔human)`, with timestamps. This is the "show how a call is being transferred" view the user asked for.

### 6.4 Phase 2 (softphone, later)
- Add `@twilio/voice-sdk`; new Convex HTTP action `/twilio-voice-token` minting a browser access token (needs **Twilio API Key+Secret + TwiML App SID** — not yet provided). Replace the Phase-1 dialed-number leg with the browser `Device` joining the conference. Accept button then also connects local mic/speaker.

## 7. Env / config
- Phase 1 uses existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `BRIDGE_SERVER_URL`, ElevenLabs vars — **all already in Convex env**. Referenced only via `process.env.*`; never hardcoded.
- Phase 2 needs new: `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID`.
- **SECURITY:** secrets were pasted in chat → recommend rotating ElevenLabs / OpenAI / Twilio credentials.

## 8. Testing (per CLAUDE.md — real, deployed, no SDK mocks)
- Playwright: drive `/live`, simulate a handoff via a test endpoint that flips a seeded call to `awaiting_human`, assert the broadcast card appears, Accept transitions to `connected`.
- Real call smoke test against the payer simulator (`cadence-payer-simulator`) with a scripted "transferring you to an agent now" branch to exercise real detection + conference join.
- Ask user before writing tests (per global instructions).

## 9. Risks / open items
1. **Bridge / conference compatibility (highest risk):** the existing bridge streams media for a passive/connected agent. Making the ElevenLabs agent a *droppable conference participant* may need a bridge-side change (repo `cadence-bridge`). Must validate first; may adjust approach in §5.1.
2. **Blind-drop gap:** between AI drop and human join, the insurance rep hears silence. Mitigation: drop AI only *after* human leg is answered, or play brief hold audio.
3. **ElevenLabs native → Twilio-direct switch** must not regress existing medical/dental/session calls. Keep the old path available behind a per-payer/opt-in flag until the new path is verified.
4. Phase-2 softphone blocked on Twilio API Key/Secret + TwiML App SID.

## 10. Proposed build order
1. Schema fields + indexes (§4).
2. Cadence-controlled Twilio conference call + `/twiml-ivr-conference`; verify ElevenLabs agent still navigates IVR unchanged (§5.1). **Validate bridge/conference (risk #1) here.**
3. Handoff detection webhook + prompt tweak (§5.2).
4. Accept/Decline mutations + connect action, dialed-number interim (§5.3).
5. Live Calls page + notifier + transfer timeline (§6.1–6.3).
6. End-to-end verify against payer simulator.
7. (Phase 2) Browser softphone (§6.4) once API Key/Secret provided.
```
