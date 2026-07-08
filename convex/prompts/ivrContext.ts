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

export function buildIvrContextSection(
  ivrInstructions: string | undefined,
  ivrSteps: IvrStep[] | undefined
): string {
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

  if (!parts.length) return '';

  return `# PAYER IVR CONTEXT\n${parts.join('\n\n')}`;
}
