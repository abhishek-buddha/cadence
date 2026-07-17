// scripts/setup-elevenlabs-agents.mjs
//
// Programmatically create or update the ElevenLabs Convai agents that Cadence
// uses for outbound calls. Two agents are managed by this script:
//
//   1. Medical Claim Agent  — composePrompt({ useCase: 'medical_claim' })
//   2. Dental EV Agent      — composePrompt({ useCase: 'dental_ev' })
//
// Both agents share the same voice (default Sarah, `EXAVITQu4vr4xnSDxMaL`,
// overridable via env `ELEVENLABS_DEFAULT_VOICE_ID`) and the same tool set:
//
//   - mark_field_unavailable(field_name, reason)
//   - transfer_to_human(reason)
//   - hold_check()
//   - play_keypad_touch_tone(digits)
//   - transfer_to_number(phone_number) — live call handoff to a payer's
//     human-agent line (insuranceContacts.humanAgentNumber), independent of
//     transfer_to_human which escalates to a Cadence operator.
//
// Usage:
//   # Create new agents (default mode):
//   ELEVENLABS_API_KEY=sk_... node scripts/setup-elevenlabs-agents.mjs
//
//   # Update existing agents in place (PATCH):
//   ELEVENLABS_API_KEY=sk_... \
//   ELEVENLABS_MEDICAL_AGENT_ID=agent_... \
//   ELEVENLABS_DENTAL_AGENT_ID=agent_...  \
//   node scripts/setup-elevenlabs-agents.mjs --update-only
//
// On create the script prints the two agent IDs to stdout; capture them into
// your env vars (Convex dashboard for prod, .env for local dev) so that
// callActions.ts can route outbound calls to the right agent per use case.
//
// Requires Node 20+ (uses native fetch).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Inline copies of the prompt fragments + composePrompt logic.
//
// We do not import from convex/prompts/index.ts because that file is TypeScript
// and this script runs as plain Node ESM. Keeping a small inline mirror here
// avoids adding a build step (tsx/ts-node) just to run a one-shot setup script.
// If you change a prompt file, also update the corresponding read below.
// ---------------------------------------------------------------------------

function readPrompt(relPath) {
  const full = join(REPO_ROOT, relPath);
  const src = readFileSync(full, 'utf8');
  // Extract the template literal between the first pair of backticks.
  const match = src.match(/=\s*`([\s\S]*?)`\s*;/);
  if (!match) {
    throw new Error(`Could not parse template literal from ${relPath}`);
  }
  return match[1];
}

const MEDICAL_CLAIM_AGENT_PROMPT = readPrompt('convex/prompts/medicalClaim.ts');
const DENTAL_EV_AGENT_PROMPT = readPrompt('convex/prompts/dentalEv.ts');
const MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT = readPrompt('convex/prompts/multiPatientHandoff.ts');
const VOICE_IVR_NAVIGATION_GUIDANCE = readPrompt('convex/prompts/voiceIvrNavigation.ts');
const IVR_ONLY_MODE_GUIDANCE = readPrompt('convex/prompts/ivrOnlyMode.ts');
const TRANSFER_TRIGGER_GUIDANCE = readPrompt('convex/prompts/transferTrigger.ts');

function composePrompt({ useCase, isMultiPatient = false, hasVoiceIvr = false, endAtHumanHandoff = false }) {
  let base;
  switch (useCase) {
    case 'medical_claim':
      base = MEDICAL_CLAIM_AGENT_PROMPT;
      break;
    case 'dental_ev':
      base = DENTAL_EV_AGENT_PROMPT;
      break;
    default:
      throw new Error(`Unknown useCase: ${useCase}`);
  }

  const sections = [];
  if (endAtHumanHandoff) sections.push(IVR_ONLY_MODE_GUIDANCE);
  sections.push(base);
  if (isMultiPatient) sections.push(MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT);
  if (hasVoiceIvr) sections.push(VOICE_IVR_NAVIGATION_GUIDANCE);
  sections.push(TRANSFER_TRIGGER_GUIDANCE);
  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Tool definitions (shared by both agents).
// ElevenLabs Convai tool schema: each tool needs name, description, and a
// JSON-schema parameters block. These are configured on the agent itself —
// the agent calls them by name during the conversation; the bridge server +
// Convex functions handle the actual side effects on the backend.
// ---------------------------------------------------------------------------

const SHARED_TOOLS = [
  {
    type: 'webhook',
    name: 'mark_field_unavailable',
    description:
      'Mark a required field as unavailable when the representative cannot or will not provide it. Required for the 100% retrieval gate — every missing required field must be explicitly marked with a reason before ending the call.',
    parameters: {
      type: 'object',
      properties: {
        field_name: {
          type: 'string',
          description:
            'The exact name of the required field (e.g., "paid_amount", "denial_code", "annual_maximum_remaining").',
        },
        reason: {
          type: 'string',
          description:
            "The rep's stated reason for not providing the field (or 'rep_refused' / 'system_unavailable' if no reason given).",
        },
      },
      required: ['field_name', 'reason'],
    },
  },
  {
    type: 'webhook',
    name: 'transfer_to_human',
    description:
      'Escalate the call to a human Cadence operator. Always announce the transfer to the rep verbally before calling this tool. See transfer guidance for trigger conditions.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'Concise reason code (e.g., "rep_requested_supervisor", "ivr_navigation_failed", "field_confidence_low_paid_amount").',
        },
      },
      required: ['reason'],
    },
  },
  {
    type: 'webhook',
    name: 'hold_check',
    description:
      'Update the call status when hold time exceeds 8 minutes. Stay silent during hold music — this tool just notifies the backend to refresh the on-hold timer.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'system',
    name: 'play_keypad_touch_tone',
    description:
      'Send DTMF tones during IVR navigation or when the rep prompts for digit entry (NPI, member ID, claim number, etc.).',
    parameters: {
      type: 'object',
      properties: {
        digits: {
          type: 'string',
          description: 'Digits to press, e.g., "1234567890" or "0".',
        },
      },
      required: ['digits'],
    },
  },
  // transfer_to_number intentionally NOT defined here. ElevenLabs "system"
  // tools are fixed built-in types with their own specific `params` shape
  // (confirmed by inspecting the live agent's play_keypad_touch_tone tool —
  // it's `params: { system_tool_type: '...', ...tool-specific fields }`, not
  // an open JSON-schema function like webhook tools use). Guessing that shape
  // via trial and error against a live agent is unsafe. Add "Transfer to
  // Number" through the ElevenLabs dashboard UI instead — it has a proper
  // form for this tool and will get the schema right automatically.
  {
    type: 'webhook',
    name: 'next_patient',
    description:
      'Advance to the next patient in a multi-patient session. Call ONLY after every required field for the current patient has been retrieved or explicitly marked unavailable. The backend swaps dynamic variables (patient_name, patient_dob, member_id, claim_number/cdt_codes, etc.) to the next patient before your next utterance.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'webhook',
    name: 'mark_session_item_refused',
    description:
      'Mark remaining patients in a multi-patient session as refused by the payer when the rep declines to verify additional patients in the same call.',
    parameters: {
      type: 'object',
      properties: {
        item_index: {
          type: 'number',
          description:
            'Zero-based index of the first refused item; everything at or after this index is marked refused.',
        },
        reason: {
          type: 'string',
          description:
            "The rep's stated reason (e.g., 'one patient per call policy', 'system limitation').",
        },
      },
      required: ['item_index', 'reason'],
    },
  },
  {
    type: 'webhook',
    name: 'report_confidence',
    description:
      'Report your extraction confidence (0.0–1.0) for a specific field. Call this whenever your confidence is below 0.7 so the backend can flag the call for human review.',
    parameters: {
      type: 'object',
      properties: {
        field_name: { type: 'string', description: 'The field name you are reporting on.' },
        confidence: {
          type: 'number',
          description: 'Confidence score between 0.0 and 1.0.',
        },
        note: {
          type: 'string',
          description: 'Optional free-text reason for the low confidence.',
        },
      },
      required: ['field_name', 'confidence'],
    },
  },
];

// ---------------------------------------------------------------------------
// Config constants.
// ---------------------------------------------------------------------------

const DEFAULT_VOICE_ID = process.env.ELEVENLABS_DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Sarah
const DEFAULT_LLM = process.env.ELEVENLABS_LLM || 'gpt-4o';
const DEFAULT_TEMPERATURE = 0.7;

const AGENT_DEFINITIONS = [
  {
    key: 'medical',
    name: 'Cadence — Medical Claim Follow-Up',
    prompt: composePrompt({ useCase: 'medical_claim', hasVoiceIvr: true, endAtHumanHandoff: true }),
    envIdVar: 'ELEVENLABS_MEDICAL_AGENT_ID',
  },
  {
    key: 'dental',
    name: 'Cadence — Dental Eligibility Verification',
    prompt: composePrompt({ useCase: 'dental_ev' }),
    envIdVar: 'ELEVENLABS_DENTAL_AGENT_ID',
  },
];

// ---------------------------------------------------------------------------
// Agent body builder (shared between create + update).
// ---------------------------------------------------------------------------

function buildAgentBody({ name, prompt }) {
  return {
    name,
    conversation_config: {
      agent: {
        first_message: '',
        prompt: {
          prompt,
          llm: DEFAULT_LLM,
          temperature: DEFAULT_TEMPERATURE,
          tools: SHARED_TOOLS,
        },
      },
      tts: {
        voice_id: DEFAULT_VOICE_ID,
      },
      turn: {
        turn_timeout: 10,
        silence_end_call_timeout: -1,
        turn_eagerness: 'normal',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// API helpers.
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.elevenlabs.io/v1';

async function createAgent(apiKey, def) {
  const res = await fetch(`${API_BASE}/convai/agents/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(buildAgentBody(def)),
  });
  if (!res.ok) {
    throw new Error(
      `Create failed for ${def.key} (${res.status}): ${await res.text()}`
    );
  }
  const json = await res.json();
  return json.agent_id || json.id;
}

async function getAgent(apiKey, agentId) {
  const res = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed for agent ${agentId} (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// updateAgent is deliberately surgical: it fetches the agent's CURRENT config
// and ONLY changes prompt.prompt — the tools array is left completely
// untouched. Round-tripping tools through GET→PATCH failed validation (even
// for an already-working tool), which means ElevenLabs' write schema differs
// from its read schema in ways this script doesn't know precisely. Rather
// than guess and risk corrupting a working tool config, tool changes
// (including adding transfer_to_number) should be done via the ElevenLabs
// dashboard UI directly.
async function updateAgent(apiKey, agentId, def) {
  const existing = await getAgent(apiKey, agentId);

  const body = {
    conversation_config: {
      ...existing.conversation_config,
      agent: {
        ...existing.conversation_config.agent,
        prompt: {
          ...existing.conversation_config.agent.prompt,
          prompt: def.prompt,
        },
      },
    },
  };
  delete body.conversation_config.agent.prompt.tools;

  const res = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `Update failed for ${def.key} (${res.status}): ${await res.text()}`
    );
  }
  const json = await res.json();
  return json.agent_id || agentId;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY is not set in the environment.');
    process.exit(1);
  }

  const updateOnly = process.argv.includes('--update-only');
  const results = {};

  for (const def of AGENT_DEFINITIONS) {
    if (updateOnly) {
      const existingId = process.env[def.envIdVar];
      if (!existingId) {
        console.error(
          `--update-only requires ${def.envIdVar} to be set in the environment.`
        );
        process.exit(1);
      }
      console.log(`Updating ${def.key} agent (${existingId})...`);
      const id = await updateAgent(apiKey, existingId, def);
      console.log(`  ${def.key} updated: ${id}`);
      results[def.key] = id;
    } else {
      console.log(`Creating ${def.key} agent: "${def.name}"...`);
      const id = await createAgent(apiKey, def);
      console.log(`  ${def.key} created: ${id}`);
      results[def.key] = id;
    }
  }

  console.log('\n=== AGENT IDs ===');
  console.log(`ELEVENLABS_MEDICAL_AGENT_ID=${results.medical}`);
  console.log(`ELEVENLABS_DENTAL_AGENT_ID=${results.dental}`);
  console.log(
    '\nNext: paste these into the Convex dashboard env vars so callActions.ts can route per use case.'
  );
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
