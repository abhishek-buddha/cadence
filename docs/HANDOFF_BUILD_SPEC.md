# Build Spec — Live AI→Human Handoff (Phase 1)

Branch: `cadence_pro_ivr`. NO commits. NO deploy. Match existing code style exactly.
Reference the locked architecture in `docs/PLAN.md` (the "REVISED ARCHITECTURE" block).

## Context (already done)
- `convex/schema.ts` `calls` table already has the new optional fields: `handoffState`, `handoffRequestedAt`, `handoffReason`, `handoffAcceptedByUserId`, `handoffAcceptedByEmail`, `handoffAcceptedAt`, `conferenceName`, `aiParticipantCallSid`, `humanParticipantCallSid`, plus index `by_handoffState`. Do NOT re-add.

## Environment (already in Convex env; reference via process.env only, never hardcode)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (our bridge number, E.164)
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_DENTAL_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID`
- `BRIDGE_SERVER_URL`

## Correlation key (critical)
When the AI transfers via ElevenLabs Conference `transfer_to_number` to our bridge number, that inbound call must map back to the original verification `callId`. Use **post_dial_digits** carrying a short numeric handoff token: on the call record store a numeric `handoffToken` (derive from callId or a counter) and set the transfer tool's `post_dial_digits` to a dynamic variable `{{handoff_token}}` = e.g. `ww<token>#`. The inbound TwiML `<Gather>`s those digits to resolve the call. Simpler fallback for demo: a single active handoff at a time resolved by most-recent `awaiting_human` call for the payer. IMPLEMENT the token path; keep the fallback commented.

## Backend files to create/edit

### NEW `convex/handoff.ts`
- `query listAwaitingHandoff()` — calls with `handoffState == "awaiting_human"` via `by_handoffState` index, enriched with claim/case + patient + insurance names (mirror `calls.listRecent` enrichment). Scope to userId like other queries.
- `query listLive()` — calls with status `in_progress`/`initiating` OR handoffState in (awaiting_human, accepting, connected); enriched; newest first.
- `query getHandoff({ callId })` — one call + enrichment + its callEvents timeline.
- `mutation requestHandoff({ callId, reason })` [internal] — set handoffState=awaiting_human, handoffRequestedAt=now, handoffReason, conferenceName=`cadence-<callId>`. Add a callEvents row type="handoff_requested".
- `mutation acceptHandoff({ callId })` — ATOMIC compare-and-set: read call; if handoffState !== "awaiting_human" return {ok:false, reason:"already_taken"}; else patch handoffState="accepting", handoffAcceptedByUserId/Email (from ctx.auth identity; fallback 'operator'), handoffAcceptedAt=now. callEvents type="handoff_accepted". Return {ok:true}.
- `mutation declineHandoff({ callId })` — broadcast model: just add callEvents type="handoff_declined" with the user. Do NOT change state (stays available to others).
- `mutation markHandoffConnected({ callId, humanParticipantCallSid })` [internal] — handoffState="connected"; store sid; callEvents "handoff_connected".
- `mutation markHandoffFailed({ callId, reason })` [internal] — handoffState="handoff_failed"; callEvents "handoff_failed".
- `action connectHumanToConference({ callId, agentPhoneNumber })` — Twilio REST: create a call to `agentPhoneNumber` with TwiML that `<Dial><Conference>cadence-<callId></Conference></Dial>`; on success runMutation markHandoffConnected. On any error markHandoffFailed. Phase 1 agentPhoneNumber comes from the mutation caller (a per-user ops number or a single configured number — accept as arg; UI passes it).

Twilio REST call: `POST https://api.twilio.com/2010-04-01/Accounts/<SID>/Calls.json` with Basic auth (base64 `SID:AUTH_TOKEN`), form-encoded body `To`, `From=TWILIO_PHONE_NUMBER`, `Url=<CONVEX_SITE>/twiml-agent-join?callId=...`, `StatusCallback=<CONVEX_SITE>/twilio-status`. Use the incoming request origin or process.env for CONVEX site URL — mirror how existing code builds siteUrl (`url.origin` in http actions; for actions use `process.env.CONVEX_SITE_URL`).

### EDIT `convex/http.ts` — add routes (match twimlResponse/httpAction style)
- `POST/GET /twiml-bridge-inbound` — the entry TwiML for the AI's Conference transfer landing on our bridge number. Response: `<Gather numDigits=... action="/twiml-bridge-parked?...">` to read post_dial_digits token; then `<Redirect>` to parked. If token disabled, resolve most-recent awaiting call. Once resolved, run `internal.handoff.requestHandoff` if not already, then place rep into `<Dial><Conference startConferenceOnEnter=true endConferenceOnExit=false waitUrl=<hold audio>>cadence-<callId></Conference></Dial>`. IMPORTANT: the rep must NOT drop when the AI/holding side changes — set endConferenceOnExit=false for the parking leg.
- `POST /twiml-bridge-parked` — resolves token→callId, marks awaiting_human (idempotent), returns the `<Dial><Conference>` join TwiML with a pleasant hold (waitUrl or `<Say>`+`<Play>` loop).
- `POST/GET /twiml-agent-join?callId=...` — returns `<Dial><Conference startConferenceOnEnter=true endConferenceOnExit=true>cadence-<callId></Conference></Dial>` for our agent's leg. When agent (last real participant) leaves, conference ends.
- Extend existing `/twilio-status`: when a call with handoffState=="connected" completes, set handoffState="handoff_ended" + status completed (keep existing behavior for non-handoff calls).

### EDIT `convex/prompts/ivrOnlyMode.ts`
Change guidance: instead of `end_call` with reason `ivr_human_handoff_detected`, instruct the agent to call `transfer_to_number` (Conference) to `{{bridge_number}}` the moment a human handoff is detected, with `client_message` (brief, to rep) and `agent_message` (context). Keep it OVERRIDE-priority. Keep the old end_call fallback documented for payers without live-transfer. Add a short note that the destination + condition are configured on the agent via API.

### EDIT `scripts/setup-elevenlabs-agents.mjs`
Add `transfer_to_number` system tool to both agents' config with transfer_type "conference", destination = a dynamic var `{{bridge_number}}` (or the static TWILIO_PHONE_NUMBER), condition = natural language "the payer IVR is handing off to a live human representative", post_dial_digits dynamic `{{handoff_token}}`. Read the existing script first and match its structure/how it PATCHes agents.

### EDIT `convex/callActions.ts` + `convex/dentalCallActions.ts`
Add dynamic vars `bridge_number` (=process.env.TWILIO_PHONE_NUMBER) and `handoff_token` (numeric token stored on the call) to the outbound dynamic_variables so the transfer tool + post-dial digits resolve. Store the token on the call record at create time. Do NOT change any existing behavior/prompts otherwise. This is additive.

## Frontend files

### NEW `src/pages/LiveCallsPage.jsx` (route `/live`)
- useQuery `api.handoff.listAwaitingHandoff` and `api.handoff.listLive`.
- Section "Incoming Handoffs": card per awaiting call — payer name, patient/claim/case #, handoffReason, elapsed since handoffRequestedAt (live ticking), **Accept** + **Decline** buttons. Accept → useMutation `acceptHandoff`; on {ok:true} → call `connectHumanToConference` action with the agent's number (Phase 1: prompt from a simple input or a configured constant — use a small "Your callback number" field persisted in localStorage). On {ok:false} show "Already taken".
- Section "Active Calls": list live calls with handoffState badge + embedded transfer timeline (below). Reuse `LiveCallMonitor` where a call is in_progress.
- Match the visual style of existing pages (Tailwind, lucide-react icons, cards). Look at SessionsPage.jsx + CallHistory.jsx for the house style.

### NEW `src/components/HandoffTimeline.jsx`
Visual state machine for one call: AI navigating IVR → insurance human detected → awaiting our agent → [name] accepted → connected. Derive steps from handoffState + callEvents + timestamps. Pure presentational.

### NEW `src/components/HandoffNotifier.jsx` (mount in `Layout.jsx`)
Subscribes to `api.handoff.listAwaitingHandoff`; renders a fixed toast/banner when ≥1 awaiting; "Insurance rep on the line — Accept?" with a button navigating to `/live`. Auto-clears reactively when list empties.

### EDIT `src/App.jsx` — add `<Route path="live" element={<LiveCallsPage />} />`.
### EDIT `src/components/Sidebar.jsx` — add "Live Calls" nav item (lucide `PhoneCall` or `Radio` icon) near Call History. Not role-gated.
### EDIT `src/components/Layout.jsx` — mount `<HandoffNotifier />` once.

## Constraints
- No mocks/fakes/setTimeout-fake-delays (see CLAUDE.md testing policy).
- All new Convex fns follow existing auth pattern (`ctx.auth.getUserIdentity()?.subject ?? 'default'`).
- Don't break existing calls: everything additive; existing initiateCall/initiateEvCall behavior preserved.
- Frontend must `npm run build` cleanly.
- Do NOT run convex deploy or push. Report what you changed.
