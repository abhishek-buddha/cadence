# ElevenLabs Convai Agent Prompts

Source-controlled system prompts for the ElevenLabs Convai agents that Cadence uses to make outbound calls to insurance payers.

The prompts live in `convex/prompts/*.ts` and are pushed to ElevenLabs via `scripts/setup-elevenlabs-agents.mjs`. Treat the dashboard as a read-only mirror — edits made in the ElevenLabs dashboard will be overwritten the next time the setup script runs.

## File map

| File | Export | Purpose |
| --- | --- | --- |
| `convex/prompts/medicalClaim.ts` | `MEDICAL_CLAIM_AGENT_PROMPT` | Base prompt for the medical-claim follow-up agent. Refined for the 100%-retrieval gate. |
| `convex/prompts/dentalEv.ts` | `DENTAL_EV_AGENT_PROMPT` | Base prompt for the dental eligibility-verification agent. |
| `convex/prompts/multiPatientHandoff.ts` | `MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT` | Fragment appended when a session covers more than one patient. |
| `convex/prompts/voiceIvrNavigation.ts` | `VOICE_IVR_NAVIGATION_GUIDANCE` | Fragment appended when the payer has `voiceIvrEnabled=true`. |
| `convex/prompts/transferTrigger.ts` | `TRANSFER_TRIGGER_GUIDANCE` | Universal fragment, appended to every prompt. |
| `convex/prompts/index.ts` | `composePrompt(...)` | Composition helper. |
| `scripts/setup-elevenlabs-agents.mjs` | — | Programmatic create / update of the two managed agents. |

## Composition

```ts
import { composePrompt } from './convex/prompts';

const prompt = composePrompt({
  useCase: 'medical_claim',  // 'medical_claim' | 'dental_ev'
  isMultiPatient: false,     // append multi-patient handoff fragment
  hasVoiceIvr: true,         // append voice-IVR navigation fragment
});
// Transfer-trigger guidance is always appended (universal).
```

Order of assembly: base prompt → multi-patient (if set) → voice-IVR (if set) → transfer guidance.

## Prompt summaries

### Medical Claim Follow-Up Agent
- **Identity**: AI billing specialist for `{{practice_name}}` calling `{{insurance_name}}` about a specific medical claim.
- **Objective**: 100%-retrieval gate on these fields — claim status, paid amount, paid date, check/EFT number, denial code, denial reason, appeal deadline, expected decision date, reference number, representative name. Status-conditional fields (paid amount, denial code, etc.) are required only for that status.
- **Conversation arc**: greet → state purpose → provide identifying info as requested → ask status → drill status-specific fields → ask "anything else?" → confirm reference number → close.
- **Hard rule**: do not end the call until every required field is either retrieved OR explicitly marked unavailable via `mark_field_unavailable` with a reason.

### Dental EV Agent
- **Identity**: AI dental insurance specialist for `{{practice_name}}` verifying benefits for `{{patient_name}}` with `{{insurance_name}}`.
- **Objective**: 100%-retrieval gate — coverage active status, plan effective date, deductible (annual + met), coinsurance %, copay, annual max + remaining, in-network status, per-CDT-code frequency limits and waiting periods (for every code in `{{cdt_codes}}`), reference number, representative name.
- **Conversation arc**: greet → state purpose ("verify benefits for upcoming procedure") → identify patient → ask active status → drill financial structure → drill per-CDT frequency + waiting period → confirm reference number → close.

### Multi-Patient Handoff (fragment)
- Appended when the session has more than one patient.
- Instructs the agent to fully complete the current patient's 100%-retrieval gate, then ask "May we look up our next patient?" and call `next_patient` to swap dynamic variables.
- On rep refusal, mark each remaining patient with `mark_session_item_refused(item_index, reason)`.

### Voice-IVR Navigation (fragment)
- Appended when the payer has `voiceIvrEnabled=true`.
- Reads `{{voice_ivr_phrases}}` (a JSON array of `{ promptContains, responseText }`) and uses substring matching to choose what to say.
- Prefers DTMF when both modalities are offered.
- Escalates via `transfer_to_human(reason="IVR_navigation_failed")` after 3 failed navigation attempts.

### Transfer Trigger (universal)
- Defines the five conditions that should trigger a `transfer_to_human` call (rep request, repeated refusals, low confidence on a critical field, escalation, payer-specific exception).
- Mandates the announcement pattern ("I'm going to bring in a colleague to assist further") before invoking the tool.

## Dynamic variables — full table

| Variable | Used by | Source |
| --- | --- | --- |
| `practice_name` | medical, dental | `providers.practiceName` |
| `npi` | medical | `providers.npi` |
| `tax_id` | medical | `providers.taxId` |
| `callback_number` | medical | `providers.phone` |
| `patient_name` | medical, dental | `patients.firstName + lastName` |
| `patient_dob` | medical, dental | `patients.dateOfBirth` |
| `member_id` | medical, dental | `patients.memberId` |
| `group_number` | medical, dental | `patients.groupNumber` |
| `claim_number` | medical | `claims.claimNumber` |
| `date_of_service` | medical | `claims.dateOfService` |
| `amount` | medical | `claims.amount` (cents → dollars) |
| `cpt_codes` | medical | `claims.cptCodes` (joined) |
| `plan_name` | dental | `dentalPlans.planName` |
| `proposed_dos` | dental | `dentalCases.proposedDos` |
| `cdt_codes` | dental | `dentalCases.cdtCodes` (joined) |
| `insurance_name` | medical, dental | `insuranceContacts.name` |
| `insurance_phone` | medical, dental | `insuranceContacts.phone` |
| `patient_count` | multi-patient | `callSessions.patientCount` |
| `patients_summary` | multi-patient | numbered list rendered at session start |
| `voice_ivr_phrases` | voice-IVR | `insuranceContacts.voiceIvrPhrases` (JSON) |

## Tools

All four tools are configured on both agents (medical + dental):

| Tool | Signature | Purpose |
| --- | --- | --- |
| `mark_field_unavailable` | `(field_name: string, reason: string)` | Backbone of the 100%-retrieval gate. Every required field that the rep cannot/will not provide must be explicitly marked. |
| `transfer_to_human` | `(reason: string)` | Escalates to a human Cadence operator. See transfer guidance for trigger conditions. |
| `hold_check` | `()` | Notifies the backend that hold time exceeded 8 minutes. Agent stays silent during hold; this is a status-only ping. |
| `play_keypad_touch_tone` | `(digits: string)` | DTMF for IVR navigation and rep-prompted digit entry. |

Multi-patient sessions additionally require:

| Tool | Signature | Purpose |
| --- | --- | --- |
| `next_patient` | `()` | Advances to the next patient context, swapping all per-patient dynamic variables. |
| `mark_session_item_refused` | `(item_index: number, reason: string)` | Marks remaining patients as refused when the rep won't continue. |

## Operational notes

- **Test prompts in ElevenLabs Studio before pushing to prod.** The Studio simulator is the cheapest way to catch wording problems, tool-call placement issues, and 100%-retrieval-gate violations before a real outbound call burns minutes and irritates a payer rep.
- **Voice ID**: defaults to Sarah (`EXAVITQu4vr4xnSDxMaL`). Override with env `ELEVENLABS_DEFAULT_VOICE_ID`.
- **LLM**: defaults to `gpt-4o`. Override with env `ELEVENLABS_LLM`.
- **Temperature**: 0.7 (matches the existing dashboard config).
- **Turn timeout**: 10s. Silence end-call timeout: -1 (disabled — Cadence ends calls explicitly).
- **First message**: empty. The agent waits silently for the human / IVR to speak first.
- **Edits are overwritten by the script.** If you tweak something in the ElevenLabs dashboard for testing, port the change back into the relevant `convex/prompts/*.ts` file before re-running the setup script.

## Running the setup script

Create both agents from scratch (one-time, captures the IDs):

```bash
ELEVENLABS_API_KEY=sk_... node scripts/setup-elevenlabs-agents.mjs
```

The script prints two lines at the end:

```
ELEVENLABS_MEDICAL_AGENT_ID=agent_xxx
ELEVENLABS_DENTAL_AGENT_ID=agent_yyy
```

Paste those into the Convex dashboard environment variables so `callActions.ts` can route outbound calls to the right agent per use case.

Update both agents in place (after editing any prompt file):

```bash
ELEVENLABS_API_KEY=sk_... \
ELEVENLABS_MEDICAL_AGENT_ID=agent_xxx \
ELEVENLABS_DENTAL_AGENT_ID=agent_yyy \
node scripts/setup-elevenlabs-agents.mjs --update-only
```

The script PATCHes the existing agents — same prompt composition, same tools, same voice — without changing the agent IDs.
