# ElevenLabs `transfer_to_number` — Live AI→Human Handoff Setup

This configures the ElevenLabs agents so that, when the AI navigating a payer
IVR reaches a human handoff, it **Conference-transfers the live call into our
Twilio bridge number** and drops itself — the core of the live AI→human handoff
(see `docs/PLAN.md`).

> ⚠️ **Why the dashboard, not the setup script:** `scripts/setup-elevenlabs-agents.mjs`
> deliberately does NOT write `transfer_to_number` (see its comments ~L164 and
> ~L313). ElevenLabs' system-tool *write* schema differs from its *read* schema,
> and round-tripping tools through PATCH corrupted a working config. Configure
> this tool via the **ElevenLabs dashboard UI**, which gets the schema right.

## Dashboard steps (do this for BOTH agents)

Agents to configure:
- Medical: `ELEVENLABS_AGENT_ID` (`agent_...`)
- Dental: `ELEVENLABS_DENTAL_AGENT_ID` (`agent_...`)

1. Open the agent in the ElevenLabs dashboard → **Tools** → **Add tool** →
   **Transfer to number** (system tool).
2. Add a transfer rule:
   - **Transfer type:** `Conference` (default). This is what conferences the
     destination in and removes the AI — exactly our requirement.
   - **Number type:** `Phone`.
   - **Destination phone number:** our bridge number — the value of
     `TWILIO_PHONE_NUMBER` (currently `+13187589839`).
   - **Condition (natural language):**
     > "Transfer when the payer's automated phone system (IVR) is handing the
     > call off to a live human representative — e.g. it says it is connecting
     > you to a representative, asks you to hold for an agent, or a person is
     > about to join. Do not transfer if the IVR is merely giving information or
     > ending the call for non-handoff reasons (closed hours, invalid input)."
   - **Post-dial digits (if available):** set to the dynamic variable
     `{{handoff_token}}` (format `ww{{handoff_token}}#` if a literal wrapper is
     required). This relays the DTMF token that ties the bridged leg back to the
     originating call. If the dashboard doesn't expose post-dial digits, leave
     blank — the backend falls back to most-recent-active-call correlation
     (`convex/handoff.ts` `resolveByToken`).
3. Save the agent.

## What the agent already knows

The prompt fragment `convex/prompts/ivrOnlyMode.ts` (`IVR_ONLY_MODE_GUIDANCE`)
already instructs the agent to call `transfer_to_number` to `{{bridge_number}}`
with the Conference type and reason `ivr_human_handoff_detected` at the handoff
moment. `{{bridge_number}}` and `{{handoff_token}}` are passed as dynamic
variables on every outbound call (see `callActions.ts` / `dentalCallActions.ts`).

- Dental agent: `IVR_ONLY_MODE_GUIDANCE` is injected automatically via
  `composePrompt({ endAtHumanHandoff: true })` when a bridge number (or legacy
  human-agent number) is configured.
- Medical agent: its system prompt is fixed in the dashboard (not composed at
  call time). **Add the same handoff guidance to the medical agent's dashboard
  prompt** — copy the `IVR_ONLY_MODE_GUIDANCE` text so its behavior matches.

## Verify

Place a test call against the payer simulator with a branch that says
"connecting you to a representative". Confirm the agent fires
`transfer_to_number` (visible in the ElevenLabs conversation tool-call log and
in the Cadence call transcript), the rep leg lands on `/twiml-bridge-inbound`,
and the call flips to `handoffState = "awaiting_human"` on the Live Calls page.
