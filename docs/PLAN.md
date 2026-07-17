# PLAN — Live AI→Human Call Handoff (cadence_pro_ivr)

**Status:** APPROVED architecture (Option 1 — "Cadence owns the call"). Building on branch `cadence_pro_ivr`. No commits until user says so.
**Date:** 2026-07-17 (rev 3 — supersedes the `transfer_to_number` design)
**Feature:** When the AI agent navigates a payer IVR and the *insurance human agent* picks up, hand the live call off from the AI to one of *our* human agents (a queue/pool broadcast; browser softphone), so a real human↔human conversation continues on the **same call**, recorded + transcribed. Plus a **Live Calls / Handoff** view showing in-progress calls and the AI→human transfer in real time.

---

## ⭐ LOCKED ARCHITECTURE — Option 1: Cadence owns the call

User chose Option 1 over the ElevenLabs-`transfer_to_number` approach. Cadence's Twilio owns the call from the first second, the AI is a *droppable conference participant*, and handoff = hang up the AI's leg (one Twilio API call). No DTMF correlation. No dependency on ElevenLabs' transfer tool.

### Key enabling discovery
`cadence-bridge/server.js` already has a **complete bidirectional** Twilio↔ElevenLabs relay at **`/media-stream`** (Twilio media → `user_audio_chunk` → ElevenLabs; ElevenLabs `audio` → `event:"media"` → Twilio). It is fully built but **currently unused** — the live app only uses the passive listen-only `/monitor` path. So Option 1 = *activating an existing bridge path*, not writing a streaming engine. (See memory `cadence-bridge-media-stream-dormant`.)

### The topology — VERIFIED (spike done 2026-07-17, against Twilio docs)

**The naive "AI is a conference participant" is IMPOSSIBLE on Twilio, and here's why (proven, not assumed):**
- `<Connect><Stream>` (bidirectional, how the AI talks/listens via the bridge) is a **terminal** verb — it takes over the whole leg and blocks all other TwiML. A `<Connect><Stream>` leg **cannot also be a `<Dial><Conference>` participant**. Only one bidirectional stream per call.
- `<Start><Stream>` runs in parallel with `<Conference>` but is **listen-only** — it can extract conference audio but **cannot inject the AI's speech back in.** So the AI could hear the conference but never talk into it.
- ⇒ There is no way to make the AI a speaking member of a Twilio conference. Both earlier candidate approaches are dead.

**The WORKING topology — redirect the payer leg (this is the standard warm-transfer pattern):**

```
BEFORE handoff:                          AT handoff (redirect payer leg):
┌──────────────────────────┐            ┌───────────────────────────────────┐
│ Payer call (Cadence-owned)│            │ Conference: cadence-<callId>        │
│ TwiML = <Connect><Stream> │            │                                     │
│         → bridge/media-   │  redirect  │  Payer  ← redirected here via       │
│           stream          │ ─────────► │         POST /Calls/<payerSid> Url= │
│                           │            │         /twiml-payer-conference     │
│ ElevenLabs AI talks to    │            │  (the <Connect><Stream> is          │
│ payer directly. NO        │            │   abandoned → bridge WS closes →    │
│ conference yet.           │            │   AI DROPPED automatically)         │
└──────────────────────────┘            │                                     │
                                         │  Browser agent joins same conf on   │
                                         │  Accept (Voice JS SDK) → payer↔human│
                                         └───────────────────────────────────┘
```

1. **Before handoff:** the AI *is* the payer call. Cadence dials the payer, payer leg TwiML = `<Connect><Stream url=bridge/media-stream>`. Payer↔AI talk directly through the bridge. **No conference exists yet.** (Uses the bridge's already-built `/media-stream` — likely NO bridge change needed.)
2. **Drop the AI = redirect the payer leg.** On handoff, `POST /Calls/<payerSid>.json Url=/twiml-payer-conference`. Twilio abandons the `<Connect><Stream>` (closing the bridge WS → **AI dropped, no extra hangup call**) and runs the new TwiML = `<Dial><Conference record="record-from-start" …>cadence-<callId></Conference></Dial>`. Payer is now parked in the conference.
3. **Human joins:** browser agent (softphone) joins the same `cadence-<callId>` conference on Accept → payer↔human, same call.

**Correlation key = conference name `cadence-<callId>`.** No DTMF, no separate AI leg, no participant-removal API. Dropping the AI is a byproduct of the redirect. Cleaner than the other agent's "remove a participant" — we don't even need a participant to remove.

> **Remaining validation (build step 2, small):** confirm the ElevenLabs agent behaves identically over `/media-stream` as it did on native outbound (IVR navigation + dynamic vars land via the bridge's `conversation_initiation_client_data` init). The bridge already implements the documented ElevenLabs media-stream pattern, so this is expected to just work — verify with one call. Bridge change likely unnecessary; if the redirect needs a graceful stream-close signal, that's a tiny additive tweak.

---

## 1. Confirmed requirements (from user)
- **Trigger:** the AI (on the line, IVR-only mode) detects the insurance-human handoff and signals it (the only reliable detector).
- **On detection:** broadcast an "incoming handoff" to **all active users**; any can **Accept** / **Decline**; first Accept wins.
- **Swap style:** **Blind** — AI leg drops; our human is bridged into the same call.
- **Agents connect via the Web UI only** (browser softphone, Twilio Voice JS SDK) — not dialed phones.
- **Real telephony, "not too complex."** Cadence owns the Twilio call → real re-bridge.
- **Record + transcribe** the human↔human portion automatically (no consent prompt); Twilio built-in transcription.
- **Production-hardened** for concurrent calls.

## 2. What changes vs. what stays the same
- **Changes:** the *dialer*. `initiateCall` stops using ElevenLabs native `/v1/convai/twilio/outbound-call` (ElevenLabs-owned leg, no CallSid) and instead Cadence dials the payer via Twilio REST into a conference, and the AI reaches ElevenLabs through the bridge `/media-stream`. Cadence now holds the payer CallSid + the AI-leg CallSid → real control.
- **Stays the same:** the ElevenLabs **agent** (same agent IDs, same fixed prompt, same dynamic variables, same IVR navigation, same transcript/analysis). Only *how the call is placed* changes.
- **Kept behind a per-payer opt-in flag** so existing medical/dental/session calls do NOT regress until the new path is verified. Legacy `initiateHumanAgentCall` (Handoff A separate-call) stays as fallback.

## 3. Data model (`convex/schema.ts`) — ALREADY DONE in rev 1, reused
`calls` optional fields (additive, non-breaking): `handoffState`, `handoffRequestedAt`, `handoffReason`, `handoffAcceptedByUserId`, `handoffAcceptedByEmail`, `handoffAcceptedAt`, `conferenceName`, `aiParticipantCallSid`, `humanParticipantCallSid`, `handoffToken`, `humanTranscript`, plus `recordingUrl`. Index `by_handoffState`. `handoffState` values: `awaiting_human | accepting | connected | handoff_failed | handoff_ended`.
- **Reuse:** `twilioCallSid` = payer (Leg A). `aiParticipantCallSid` = Leg B (the one we hang up). `humanParticipantCallSid` = Leg C (browser agent).
- **`handoffToken` is now vestigial** (no DTMF correlation in Option 1) — keep the column, stop relying on it for correlation. Conference name `cadence-<callId>` is the sole correlation key.

## 4. Backend (Convex)
### 4.1 Place the Cadence-owned call — NEW action `convex/twilioCallActions.ts`
- `initiateIvrCallViaTwilio({ claimId })` (+ dental variant later): Twilio REST `POST /Calls.json`, `To=payer.phone`, `From=TWILIO_PHONE_NUMBER`, `Url=/twiml-payer-conference?callId=…`, `StatusCallback=/twilio-status`. Store returned SID as `twilioCallSid` (Leg A).
- Immediately place the **AI leg (Leg B)**: Twilio REST `POST /Calls.json` (or add as conference participant), `Url=/twiml-ai-stream?callId=…` whose TwiML is `<Connect><Stream url="wss://…bridge…/media-stream"><Parameter name="callId" .../></Stream></Connect>`. Store SID as `aiParticipantCallSid`. Kick `/start-monitor` for the live transcript feed as today.
- Resolve A-vs-B topology per the spike (§⭐ validation).

### 4.2 TwiML handlers (`convex/http.ts`)
- `/twiml-payer-conference` → `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" record="record-from-start" recordingStatusCallback="/twilio-recording-status?callId=…" waitUrl=…>cadence-<callId></Conference></Dial>`.
- `/twiml-ai-stream` → `<Connect><Stream url=bridge/media-stream>` (Leg B) — OR the conference-stream variant from the spike.
- Keep existing `/twiml-softphone-outgoing` (Leg C join), `/twilio-recording-status`, `/twilio-transcription`, `/twilio-voice-token` — already built in rev 1.

### 4.3 Detect handoff
- Agent, in IVR-only mode, fires the existing signal on human pickup → HTTP `/twilio-request-handoff?callId=…` (or via the bridge event stream): sets `handoffState="awaiting_human"`, `handoffRequestedAt`, `handoffReason`. Schedules `checkHandoffTimeout` (3 min) — already built.
- **Blind-drop gap mitigation:** do NOT drop Leg B at detection; keep the AI on a brief holding line ("one moment, connecting you to a specialist") until a human accepts, so the rep isn't in silence.

### 4.4 Accept / Decline — ALREADY BUILT in `convex/handoff.ts`, adjust connect step
- `acceptHandoff` (atomic first-wins), `declineHandoff` (broadcast; stays available), `checkHandoffTimeout` → `handoff_failed`. Reuse.
- **Connect (revised for Option 1):** on Accept, browser softphone (Leg C) joins `cadence-<callId>`; once Leg C is answered, **hang up Leg B** (`POST /Calls/<aiParticipantCallSid>.json Status=completed`, or remove the participant). Set `handoffState="connected"`. This replaces the old dialed-number interim entirely (user chose "skip interim, go straight to softphone").

### 4.5 Cleanup / concurrency
- `/twilio-status` closes `handoffState="handoff_ended"` + ends conference on terminal payer state — extend existing.
- Concurrency: conference name `cadence-<callId>` is unique per call; all mutations are per-doc serializable; first-accept wins atomically. Orphaned-conference sweep on timeout.

## 5. Frontend — ALREADY BUILT in rev 1 (reuse, minor tweaks)
- `pages/LiveCallsPage.jsx` (`/live`), `components/HandoffTimeline.jsx`, `components/HandoffNotifier.jsx` (in Layout), `hooks/useSoftphone.js` (`@twilio/voice-sdk`, lazy, degrades to "unconfigured"). Route + Sidebar nav done.
- Recording link + collapsible transcript surfaced in `ActiveCallRow` — done.
- Tweak: timeline copy to reflect Leg-B-drop semantics (no functional change).

## 6. Env / config
- Existing (Convex env, prod `rapid-pheasant-510`): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `BRIDGE_SERVER_URL`, `CONVEX_SITE_URL`, ElevenLabs vars, `OPENAI_API_KEY`.
- Softphone (Leg C) needs: `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID` (TwiML App Voice URL → `…convex.site/twiml-softphone-outgoing`). User to create (walkthrough pending).
- **Number-role note:** Option 1 needs only ONE Twilio number (`+13187589839`) as the outbound caller ID; the "conference" is named, not a phone number, so no bridge/second number is required. For a *test* payer, use the payer simulator or an external number (since `+13187589839` is the caller, not the callee).
- **SECURITY:** secrets pasted in chat → rotate ElevenLabs / OpenAI / Twilio / Convex-deploy-key / GitHub-PAT.

## 7. Testing (real, deployed, no SDK mocks — per CLAUDE.md)
- Playwright: drive `/live`; flip a seeded call to `awaiting_human` via a test endpoint; assert broadcast card; Accept → `connected`.
- Real smoke: payer simulator with a "transferring you to an agent" branch → exercises detection + conference join + Leg-B drop + recording/transcription.
- Ask user before writing tests.

## 8. Risks / open items
1. **Conference↔`<Connect><Stream>` topology (highest):** resolve A vs B by a spike (build step 2). May need a small additive `cadence-bridge` change (conference-targeted stream endpoint). Bridge repo now cloned at `c:\GitHub\cadence-bridge`.
2. **Regression:** new dialer must not break existing calls → per-payer opt-in flag; legacy paths retained.
3. **Blind-drop silence gap:** keep AI holding line until human answers, then drop Leg B.
4. **Softphone** blocked on the 3 Twilio API creds.
5. **ElevenLabs media-stream vs native parity:** confirm the agent behaves identically over `/media-stream` (it's the documented ElevenLabs pattern the bridge already implements) as it did on native outbound — verify IVR navigation + dynamic vars land via the bridge's `conversation_initiation_client_data` init.

## 9. Build order
1. Schema (done) + confirm indexes.
2. **Spike:** resolve conference↔stream topology (A vs B); minimal bridge change if needed. ← do FIRST, it gates everything.
3. `twilioCallActions.initiateIvrCallViaTwilio` + `/twiml-payer-conference` + `/twiml-ai-stream`; verify AI navigates IVR unchanged over the bridge.
4. `/twilio-request-handoff` + IVR-only holding-line prompt tweak.
5. Adjust `handoff.acceptHandoff`/connect to Leg-C-join-then-drop-Leg-B; wire softphone.
6. Recording/transcription already wired — verify end-to-end.
7. Live Calls page verify (built).
8. End-to-end against payer simulator; then softphone creds + real test.
