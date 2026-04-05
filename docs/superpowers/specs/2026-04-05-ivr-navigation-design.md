# IVR Navigation + Hold Detection + Agent Handoff

**Date**: 2026-04-05
**Status**: Approved
**Approach**: Custom Twilio Call + WebSocket Bridge Server (Approach A)

## Problem

Insurance companies route calls through IVR (Interactive Voice Response) menus before reaching a human agent. Cadence's current flow dials the insurance number and immediately connects the ElevenLabs AI agent — which can't navigate DTMF-based IVR menus and wastes expensive ElevenLabs minutes sitting on hold.

## Solution

Three-phase call architecture:
1. **Twilio navigates IVR** with native DTMF (`sendDigits`) — 100% reliable
2. **Twilio holds the line cheaply** (~$0.013/min) with speech detection loop
3. **Bridge to ElevenLabs** only when human detected — AI agent converses

Plus a **live call monitor** so users can hear the entire call in real-time from the browser.

## Architecture

```
User clicks "Call"
  → Convex action → Twilio REST API creates call (with sendDigits for IVR)
  → TwiML starts <Start><Stream> for browser monitoring
  → TwiML <Gather input="speech"> loop waits on hold (up to 30 min)
  → Human voice detected → TwiML <Connect><Stream> to bridge server
  → Bridge server relays audio ↔ ElevenLabs WebSocket
  → Agent converses with insurance rep
  → Call ends → existing webhook + transcript analysis flow
```

### Infrastructure

| Component | Purpose | Hosting |
|-----------|---------|---------|
| Convex HTTP endpoints | Serve TwiML, handle Twilio callbacks | Convex (existing) |
| WebSocket Bridge Server | Relay audio: Twilio ↔ ElevenLabs + browser monitor | New Render service (~$7/mo) |
| ElevenLabs Agent | AI conversation with insurance rep | ElevenLabs (existing) |
| Twilio | Telephony, DTMF, hold | Twilio (existing) |

## Data Model Changes

### insuranceContacts table — add fields:
```
ivrEnabled: v.optional(v.boolean())           // default false
ivrSequence: v.optional(v.string())           // e.g., "wwww1ww2ww3"
ivrSteps: v.optional(v.array(v.object({
  waitSeconds: v.number(),                    // pause before digit
  digit: v.string(),                          // DTMF digit to send
  label: v.optional(v.string()),              // e.g., "Claims department"
})))
```

### calls table — add fields:
```
callPhase: v.optional(v.string())             // "ivr" | "hold" | "connecting" | "conversation"
holdStartedAt: v.optional(v.string())         // ISO timestamp
holdDuration: v.optional(v.number())          // seconds
humanDetectedAt: v.optional(v.string())       // ISO timestamp
ivrSequenceUsed: v.optional(v.string())       // what DTMF was sent
```

## Call Flow — Detailed

### Phase 1: IVR Navigation

1. User clicks "Call Insurance" on ClaimDetailPage
2. Frontend calls `api.callActions.initiateCallWithIvr({ claimId })`
3. Convex action:
   a. Fetches claim + patient + insurance + provider (existing)
   b. Checks `insuranceContact.ivrEnabled` — if false, uses existing ElevenLabs native flow
   c. Creates call record with `status: "initiating"`, `callPhase: "ivr"`
   d. Calls Twilio REST API:
      ```
      POST /2010-04-01/Accounts/{AccountSid}/Calls
      To: insuranceContact.phone
      From: TWILIO_PHONE_NUMBER
      SendDigits: insuranceContact.ivrSequence
      Url: https://{convex-site}/twiml-hold-loop?callId=xxx&claimId=xxx
      StatusCallback: https://{convex-site}/twilio-status
      StatusCallbackEvent: initiated,ringing,answered,completed
      ```
   e. Updates call record with Twilio callSid, `callPhase: "ivr"`
4. Twilio dials insurance number, IVR answers, DTMF digits navigate menu

### Phase 2: Hold Detection

5. After `sendDigits` complete, Twilio requests TwiML from `/twiml-hold-loop`
6. TwiML response:
   ```xml
   <Response>
     <Start>
       <Stream url="wss://cadence-bridge.onrender.com/monitor" track="both_tracks">
         <Parameter name="callId" value="{callId}"/>
       </Stream>
     </Start>
     <Gather input="speech" timeout="60" action="/twiml-connect-agent?callId={callId}&claimId={claimId}">
       <Pause length="60"/>
     </Gather>
     <Redirect>/twiml-hold-loop?callId={callId}&claimId={claimId}&attempt=2</Redirect>
   </Response>
   ```
7. Convex updates call: `callPhase: "hold"`, `holdStartedAt: now()`
8. Loop continues: each iteration = 60s Gather timeout + redirect
9. Max 30 attempts (30 minutes). After 30: return `<Response><Hangup/></Response>`
10. Convex updates call: `status: "failed"`, error: "hold_timeout"

### Phase 3: Human Detected → Agent Bridge

11. `<Gather>` detects speech → POST to `/twiml-connect-agent`
12. Convex updates call: `callPhase: "connecting"`, `humanDetectedAt: now()`, `holdDuration: calculated`
13. TwiML response:
    ```xml
    <Response>
      <Connect>
        <Stream url="wss://cadence-bridge.onrender.com/media-stream">
          <Parameter name="callId" value="{callId}"/>
          <Parameter name="claimId" value="{claimId}"/>
        </Stream>
      </Connect>
    </Response>
    ```
14. Bridge server receives Twilio media stream connection
15. Bridge server fetches call metadata (claim/patient/provider data) from Convex
16. Bridge server connects to ElevenLabs WebSocket:
    ```
    wss://api.elevenlabs.io/v1/convai/conversation?agent_id={AGENT_ID}
    ```
    With signed URL or API key auth + dynamic variables (same as current flow)
17. Bidirectional audio relay established: Twilio ↔ Bridge ↔ ElevenLabs
18. Convex updates call: `callPhase: "conversation"`, `status: "in_progress"`

### Phase 4: Conversation + Completion

19. ElevenLabs agent begins: "Hey there, this is Thomas over at {practice}..."
20. Agent converses with insurance rep (existing behavior)
21. Call ends → Bridge server closes both WebSocket connections
22. ElevenLabs webhook fires to `/elevenlabs-webhook` (existing)
23. Transcript stored, `analyzeTranscript` triggered (existing)
24. Claim status auto-updated based on extraction (existing)

## WebSocket Bridge Server

### Location
New directory: `cadence-bridge/` (separate Render service)

### Stack
- Node.js + `ws` library + Express
- No database — fully stateless
- Environment vars: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `CONVEX_URL`

### Endpoints

#### `wss://cadence-bridge.onrender.com/media-stream`
- Bidirectional WebSocket for Twilio ↔ ElevenLabs relay
- Receives Twilio media stream (mulaw 8kHz audio)
- Connects to ElevenLabs conversation WebSocket
- Converts audio format if needed (Twilio mulaw → ElevenLabs PCM16)
- Passes dynamic variables from stream parameters to ElevenLabs
- On close: disconnects both sides gracefully

#### `wss://cadence-bridge.onrender.com/monitor`
- Unidirectional WebSocket from Twilio (both_tracks)
- Stores connected browser clients per callId
- Forwards audio chunks to all subscribed browser clients

#### `GET /health`
- Health check for Render

#### `wss://cadence-bridge.onrender.com/listen/{callId}`
- Browser connects here to receive live audio for a specific call
- Receives forwarded audio from the monitor stream
- Multiple browsers can listen to the same call

### Audio Format Handling
- Twilio sends: mulaw 8kHz, base64-encoded chunks
- ElevenLabs expects: PCM16 16kHz (varies by config)
- Bridge handles conversion using built-in Node.js Buffer operations
- Browser receives: PCM16 or mulaw decoded via Web Audio API

## Convex HTTP Endpoints (TwiML)

All registered in `convex/http.ts`:

### `POST /twiml-hold-loop`
- Query params: `callId`, `claimId`, `attempt` (default 1)
- Returns TwiML with `<Start><Stream>` (monitor) + `<Gather>` (speech detect) + `<Redirect>` (loop)
- At attempt > 30: returns `<Hangup/>` and updates call as timed out

### `POST /twiml-connect-agent`
- Query params: `callId`, `claimId`
- Returns TwiML with `<Connect><Stream>` pointing to bridge server
- Updates call phase to "connecting"

### `POST /twilio-status`
- Receives Twilio status callbacks (ringing, answered, completed, failed)
- Updates call record accordingly

## Frontend Changes

### Insurance Directory — IVR Configuration
Add to Add/Edit modal:
- Toggle: "This number has an IVR menu" (`ivrEnabled`)
- When enabled, IVR Step Builder appears:
  - Each step: wait time (seconds dropdown: 1-10) + digit (0-9, #, *) + label (optional text)
  - Add/remove step buttons
  - Preview showing final sequence string
  - Help text: "Configure the key sequence to reach a human agent"

### ClaimDetailPage — Live Call Monitor
New `LiveCallMonitor` component (replaces simple call button during active call):
- Phase tracker: IVR → Hold → Connecting → Conversation (with checkmarks/spinners)
- Hold timer (live countdown showing elapsed hold time)
- Audio player: connects to `wss://cadence-bridge.onrender.com/listen/{callId}`
  - Mute/unmute toggle
  - Volume control
  - Visual audio waveform (optional)
- Live transcript feed (scrolling text of what's being said)
- Call info: insurance name, phone number, IVR sequence used

### CallHistory — Enhanced Metadata
Expanded rows show:
- IVR sequence used
- Hold duration
- Phase timeline (IVR: 4s → Hold: 3:42 → Conversation: 8:15)

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| IVR navigation fails | Call reaches unexpected menu | Mark call failed, user adjusts sequence |
| Hold timeout (30 min) | Attempt counter exceeds 30 | Hang up, mark `hold_timeout` |
| Bridge server down | Twilio can't connect WebSocket | TwiML fallback: `<Say>` error + `<Hangup/>` |
| ElevenLabs WebSocket fails | Bridge can't connect | Close Twilio stream, mark call failed |
| Twilio call drops | Status callback: `completed` unexpectedly | Update call record, notify frontend |
| Browser monitor disconnects | WebSocket close event | Frontend shows "Monitor disconnected", auto-reconnect |

## Backward Compatibility

- `ivrEnabled === false` or not set → existing ElevenLabs native outbound call flow (zero change)
- Existing `initiateCall` action remains untouched
- New `initiateCallWithIvr` action handles IVR flow
- Frontend checks `insuranceContact.ivrEnabled` to decide which flow to use

## Cost Analysis

| Scenario | Current (ElevenLabs native) | New (IVR + Hold + Bridge) |
|----------|---------------------------|--------------------------|
| IVR navigation (30s) | N/A (no IVR support) | $0.007 (Twilio only) |
| Hold time (15 min avg) | $1.50 (ElevenLabs) | $0.20 (Twilio only) |
| Conversation (8 min avg) | $0.80 (ElevenLabs) | $0.80 (ElevenLabs) |
| **Total per call** | **N/A** | **~$1.01** |
| **50 calls/day** | **N/A** | **~$50/day** |

## Testing Plan

1. Unit test bridge server WebSocket relay locally
2. Test TwiML endpoints with Twilio's TwiML Bin simulator
3. Test IVR with a real insurance number that has known IVR path
4. Test hold detection with a conference line that has hold music
5. Test full end-to-end: IVR → hold → human → agent conversation
6. Test live monitor in browser during all phases
7. Test backward compatibility: non-IVR calls still work via native flow
8. Test 30-min timeout behavior
9. Load test bridge server with concurrent calls
