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

// Prepended to the RCM-uploaded playbook before it reaches the agent. The
// playbook is documentation of how the payer's phone tree behaves, written for
// humans — it is not a script, and roughly half of it describes a conversation
// that happens after this call's job is done.
const IVR_PLAYBOOK_FRAMING = `REFERENCE MATERIAL — DO NOT READ ANY OF THIS ALOUD.
The following is a written description of how this payer's phone system behaves,
recorded by our RCM team. It is documentation, not a script. Read these rules
before using it:

- Text in quotes following "IVR:" is what the PAYER'S RECORDING says to YOU. It
  is never something you say. Never speak these lines, never repeat a menu back,
  never announce the option you are about to choose. If you catch yourself about
  to say a sentence that appears in this playbook, stay silent instead.
- Menu options listed here (e.g. "Eligibility & Benefits (2)") tell you WHICH KEY
  TO PRESS. Send the key with play_keypad_touch_tone. Do not say the option name
  and do not describe what you are doing.
- Steps describing a conversation with a live representative — greeting the rep,
  subscriber lookup, capturing benefits, reading information back, closing — are
  OUT OF SCOPE on this call. Your leg ends at the handoff (see OPERATING MODE).
  Ignore those steps entirely; do not perform them and do not speak their lines.
- The playbook may not match what you actually hear. Trust the live audio over
  this document, and use it only to decide which key to press.`;

function renderIvrParts(
  ivrInstructions: string | undefined,
  ivrSteps: IvrStep[] | undefined
): string[] {
  const parts: string[] = [];

  if (ivrInstructions && ivrInstructions.trim()) {
    // The uploaded playbook quotes the payer's own recorded prompts verbatim
    // (e.g. `IVR: "Please enter your NPI number."`). Dumped in raw, the model
    // treated those quotes as lines to deliver and read the menu back at the
    // payer — see conv_6201ky4xqj78fm4t4tvmggxa7wd3. It also describes the
    // post-handoff human conversation (subscriber lookup, benefit capture,
    // read-back), which is out of scope on an IVR-navigation leg. Both need
    // framing, so the playbook is never handed over as bare text.
    parts.push(`${IVR_PLAYBOOK_FRAMING}\n\n${ivrInstructions.trim()}`);
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
