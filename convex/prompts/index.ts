// ElevenLabs Convai Agent Prompts — Composition Layer
// Re-exports the source-controlled prompt fragments and provides a single
// composePrompt() function that assembles the right base + fragments based on
// the use case and call-time flags.
//
// Use case base prompts:
//   medical_claim → MEDICAL_CLAIM_AGENT_PROMPT
//   dental_ev     → DENTAL_EV_AGENT_PROMPT
//
// Optional appended fragments:
//   isMultiPatient: true → MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT
//   hasVoiceIvr:    true → VOICE_IVR_NAVIGATION_GUIDANCE
//   (TRANSFER_TRIGGER_GUIDANCE is always appended — universal)
//
// Consumers:
//   - scripts/setup-elevenlabs-agents.mjs (programmatic agent create/update)
//   - convex/callActions.ts (future: per-call prompt override via dynamic
//     conversation_config_override on the ElevenLabs outbound-call API)

export { MEDICAL_CLAIM_AGENT_PROMPT } from './medicalClaim';
export { DENTAL_EV_AGENT_PROMPT } from './dentalEv';
export { MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT } from './multiPatientHandoff';
export { VOICE_IVR_NAVIGATION_GUIDANCE } from './voiceIvrNavigation';
export { TRANSFER_TRIGGER_GUIDANCE } from './transferTrigger';
export { IVR_ONLY_MODE_GUIDANCE } from './ivrOnlyMode';
export { buildIvrContextSection, buildIvrInstructionsVar } from './ivrContext';
export type { IvrStep } from './ivrContext';

import { MEDICAL_CLAIM_AGENT_PROMPT } from './medicalClaim';
import { DENTAL_EV_AGENT_PROMPT } from './dentalEv';
import { MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT } from './multiPatientHandoff';
import { VOICE_IVR_NAVIGATION_GUIDANCE } from './voiceIvrNavigation';
import { TRANSFER_TRIGGER_GUIDANCE } from './transferTrigger';
import { IVR_ONLY_MODE_GUIDANCE } from './ivrOnlyMode';

export type UseCase = 'medical_claim' | 'dental_ev';

export interface ComposePromptOptions {
  useCase: UseCase;
  isMultiPatient?: boolean;
  hasVoiceIvr?: boolean;
  /** Pre-rendered payer IVR context section (free-text instructions +/or
   *  structured DTMF steps) from buildIvrContextSection(). Included whenever
   *  non-empty, independent of hasVoiceIvr — that flag only gates the
   *  phrase-table fragment below. */
  ivrContext?: string;
  /** When true, the payer has a dedicated human-agent number configured, so the
   *  agent should navigate the IVR only and end the call at the human handoff
   *  point instead of speaking with a live representative. Prepends
   *  IVR_ONLY_MODE_GUIDANCE as the highest-priority section. */
  endAtHumanHandoff?: boolean;
  /** Runtime values to substitute for {{placeholders}} in the composed prompt.
   *  When provided and isMultiPatient=true, a concrete session context block
   *  is prepended before the base prompt so the LLM reads the patient list
   *  before anything else — preventing the base prompt's single-patient
   *  closing behavior from winning. */
  vars?: Record<string, string>;
}

/**
 * Compose the full system prompt for an ElevenLabs Convai agent by stitching
 * together the use-case base prompt, optional fragments, and the universal
 * transfer-trigger guidance.
 *
 * When vars are provided for a multi-patient call, a concrete session context
 * block (patient count + full patient list, already substituted) is prepended
 * as the very first section. This ensures the multi-patient constraint outweighs
 * the base prompt's default single-patient closing behavior.
 */
export function composePrompt(options: ComposePromptOptions): string {
  const { useCase, isMultiPatient = false, hasVoiceIvr = false, ivrContext = '', endAtHumanHandoff = false, vars = {} } = options;

  let base: string;
  switch (useCase) {
    case 'medical_claim':
      base = MEDICAL_CLAIM_AGENT_PROMPT;
      break;
    case 'dental_ev':
      base = DENTAL_EV_AGENT_PROMPT;
      break;
    default: {
      const exhaustive: never = useCase;
      throw new Error(`Unknown useCase: ${exhaustive}`);
    }
  }

  const sections: string[] = [];

  // Highest priority: when the payer has a dedicated human-agent number, the
  // agent navigates the IVR only and ends at the human handoff. Prepended first
  // and worded to override the retrieval gate + transfer guidance below.
  if (endAtHumanHandoff) {
    sections.push(IVR_ONLY_MODE_GUIDANCE);
  }

  // For runtime multi-patient calls (vars provided): inject a concrete context
  // block FIRST so patient count and names are at the top of the LLM context.
  // Not injected for setup-script calls (no vars) — those get {{placeholders}}.
  if (isMultiPatient && vars.patient_count && vars.all_patients_data) {
    sections.push(
      `# SESSION CONTEXT — MULTIPLE PATIENTS\n` +
      `You have ${vars.patient_count} patients/claims to verify in this single call. ` +
      `You MUST check ALL ${vars.patient_count} before ending the call.\n` +
      `Do NOT say "that's all" or use end_call after only the first patient.\n\n` +
      vars.all_patients_data
    );
  }

  sections.push(base);

  if (ivrContext) {
    sections.push(ivrContext);
  }

  if (isMultiPatient) {
    sections.push(MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT);
  }

  if (hasVoiceIvr) {
    sections.push(VOICE_IVR_NAVIGATION_GUIDANCE);
  }

  // Transfer guidance is universal — applies to every agent, every use case.
  sections.push(TRANSFER_TRIGGER_GUIDANCE);

  let prompt = sections.join('\n\n');

  // Substitute all {{placeholders}} with runtime values when provided.
  // Using split/join instead of replaceAll to safely handle $ in dollar amounts.
  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.split(`{{${key}}}`).join(value);
  }

  return prompt;
}
