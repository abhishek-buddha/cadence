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

import { MEDICAL_CLAIM_AGENT_PROMPT } from './medicalClaim';
import { DENTAL_EV_AGENT_PROMPT } from './dentalEv';
import { MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT } from './multiPatientHandoff';
import { VOICE_IVR_NAVIGATION_GUIDANCE } from './voiceIvrNavigation';
import { TRANSFER_TRIGGER_GUIDANCE } from './transferTrigger';

export type UseCase = 'medical_claim' | 'dental_ev';

export interface ComposePromptOptions {
  useCase: UseCase;
  isMultiPatient?: boolean;
  hasVoiceIvr?: boolean;
}

/**
 * Compose the full system prompt for an ElevenLabs Convai agent by stitching
 * together the use-case base prompt, optional fragments, and the universal
 * transfer-trigger guidance.
 *
 * Order matters: base first (sets identity + objective), then optional
 * behavioral fragments (multi-patient, IVR), then universal transfer rules.
 */
export function composePrompt(options: ComposePromptOptions): string {
  const { useCase, isMultiPatient = false, hasVoiceIvr = false } = options;

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

  const sections: string[] = [base];

  if (isMultiPatient) {
    sections.push(MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT);
  }

  if (hasVoiceIvr) {
    sections.push(VOICE_IVR_NAVIGATION_GUIDANCE);
  }

  // Transfer guidance is universal — applies to every agent, every use case.
  sections.push(TRANSFER_TRIGGER_GUIDANCE);

  return sections.join('\n\n');
}
