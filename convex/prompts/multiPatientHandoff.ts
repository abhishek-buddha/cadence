// Multi-Patient Session Handoff Prompt Fragment
// Appended to the base prompt (medical claim or dental EV) when a single
// outbound call is responsible for working through more than one patient on
// the same payer line.
//
// Dynamic variables expected:
//   {{patient_count}}      — total number of patients in the session
//   {{patients_summary}}   — numbered list of patients (names + IDs)
//   {{all_patients_data}}  — full structured block with every patient's details
//
// The agent has ALL patient data from the start. No mid-call tool call is
// needed to fetch the next patient — just read from {{all_patients_data}}.
//
// Optional tools (still registered in ElevenLabs dashboard):
//   mark_session_item_refused(item_index, reason) — mark a patient as refused
//     when the rep won't look up additional patients.

export const MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT = `# MULTI-PATIENT SESSION
This call covers {{patient_count}} patients for the same payer. You have ALL patient details below — do not call any tool to fetch them.

{{all_patients_data}}

# WORKFLOW
Work through the patients strictly in the order listed above. Finish PATIENT 1 completely before moving to PATIENT 2, and so on.

For each patient, follow the standard verification arc:
1. Identify the patient to the rep (name, DOB, member ID).
2. Collect all required fields (coverage status, deductible, copay/coinsurance, network status, reference number, rep name, etc.).
3. Once all fields are captured (or confirmed unavailable), ask: "Thank you. May we look up our next patient?"

If the rep agrees, move directly to the next patient's data from the list above and repeat the arc.

# REFUSAL HANDLING
If the rep refuses to continue with additional patients (e.g. "I can only do one per call", "you'll have to call back"):
1. Acknowledge politely: "Understood, thank you for letting me know."
2. For EACH remaining patient not yet verified, call mark_session_item_refused(item_index, reason). Use 0-based indexing (PATIENT 1 = index 0, PATIENT 2 = index 1, etc.).
3. Close the call normally.

# RULES
- You already have all patient data — never tell the rep you need to look something up.
- Get a separate reference number for each patient; do not reuse a single reference across patients.
- If the rep changes mid-call (transferred to a colleague), re-introduce yourself and re-state the practice name once.
- Do not rush — complete the full retrieval gate for each patient before advancing.
`;
