// Voice IVR Navigation Guidance Fragment
// Appended to the base prompt when the target payer is configured with
// voiceIvrEnabled=true on the insuranceContacts record. Provides explicit
// guidance for navigating speech-driven IVRs (in addition to or instead of
// DTMF-only menus).
//
// Dynamic variables expected:
//   {{voice_ivr_phrases}} — JSON-encoded array of {promptContains, responseText}
//                           pairs configured for this payer. Example:
//   [
//     { "promptContains": "main menu", "responseText": "claims" },
//     { "promptContains": "what would you like to do", "responseText": "claim status" },
//     { "promptContains": "how can I help", "responseText": "representative" }
//   ]

export const VOICE_IVR_NAVIGATION_GUIDANCE = `# VOICE IVR NAVIGATION
This payer's IVR uses voice prompts in addition to or instead of DTMF. Listen carefully to menu options.

Configured voice phrases for this payer: {{voice_ivr_phrases}}.

# HOW TO USE THE PHRASE TABLE
When you hear a prompt that contains the listed promptContains text (case-insensitive substring match), speak the corresponding responseText clearly and crisply. Speak only the responseText word(s) — no filler, no "uh", no "yes please".

Example: if the IVR says "Main menu — please tell me what you'd like to do", and the table contains { "promptContains": "main menu", "responseText": "claims" }, you should say: "claims".

# DTMF VS VOICE — PREFERENCE ORDER
If a prompt offers BOTH DTMF and voice ("press 1 or say claims"), prefer DTMF via play_keypad_touch_tone. DTMF is more reliable than speech recognition. Only use the spoken responseText when DTMF is not offered.

# LISTENING DISCIPLINE
- Stay silent until the IVR finishes listing all options. Do not interrupt the menu.
- After speaking your response, wait silently for the next menu or hold music.
- Do not say "hello", "I'm here", or "are you still there?" during IVR or hold.
- If you hear hold music or "please hold", stay completely silent until a human greets you.

# FALLBACK
If a prompt does not match any phrase in the table, default behavior:
1. If the prompt asks about claims status or follow-up → say "claims" or "claim status".
2. If the prompt asks for a representative → say "representative" or "agent".
3. If the prompt asks for digits (NPI, member ID, claim number) → use play_keypad_touch_tone with the requested digits.

# FAILURE ESCALATION
If you cannot navigate the IVR after 3 attempts (3 wrong menu paths, 3 unrecognized inputs, or 3 loops back to the main menu), use transfer_to_human with reason "IVR_navigation_failed". Do not keep grinding through the IVR indefinitely.
`;
