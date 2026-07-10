// Per-call IVR Context Builder
// Renders a payer's free-text IVR instructions and/or structured DTMF step
// list (insuranceContacts.ivrInstructions / ivrSteps) into a single prompt
// section. Always included when either is present — independent of
// voiceIvrEnabled, which only gates the phrase-table fragment.

export interface IvrStep {
  waitSeconds: number;
  digit: string;
  label?: string;
}

function renderIvrParts(
  ivrInstructions: string | undefined,
  ivrSteps: IvrStep[] | undefined
): string[] {
  const parts: string[] = [];

  if (ivrInstructions && ivrInstructions.trim()) {
    parts.push(ivrInstructions.trim());
  }

  if (ivrSteps && ivrSteps.length) {
    const rendered = ivrSteps
      .map((s, i) => {
        const label = s.label ? ` (${s.label})` : '';
        return `${i + 1}. Wait ${s.waitSeconds}s, then press "${s.digit}"${label}`;
      })
      .join('\n');
    parts.push(
      `Known keypad sequence for this payer's IVR. Follow these presses in order via play_keypad_touch_tone when the menu matches this payer:\n${rendered}`
    );
  }

  return parts;
}

export function buildIvrContextSection(
  ivrInstructions: string | undefined,
  ivrSteps: IvrStep[] | undefined
): string {
  const parts = renderIvrParts(ivrInstructions, ivrSteps);
  if (!parts.length) return '';
  return `# PAYER IVR CONTEXT\n${parts.join('\n\n')}`;
}

// Same content as buildIvrContextSection but without the section header —
// for use as a dynamic-variable VALUE substituted into a static prompt
// section that already has its own header (e.g. {{ivr_instructions}} in
// medicalClaim.ts). No prompt override involved; this is plain data.
export function buildIvrInstructionsVar(
  ivrInstructions: string | undefined,
  ivrSteps: IvrStep[] | undefined
): string {
  const parts = renderIvrParts(ivrInstructions, ivrSteps);
  if (!parts.length) return 'No specific IVR playbook configured for this payer — use your best judgment to navigate.';
  return parts.join('\n\n');
}
