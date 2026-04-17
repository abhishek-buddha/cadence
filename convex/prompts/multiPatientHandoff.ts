// Multi-Patient Session Handoff Prompt Fragment
// Appended to the base prompt (medical claim or dental EV) when a single
// outbound call is responsible for working through more than one patient on
// the same payer line.
//
// Dynamic variables expected:
//   {{patient_count}} — total number of patients in the session
//   {{patients_summary}} — numbered list of patients (injected at call start)
//
// Additional tools required for multi-patient sessions:
//   next_patient() — advances to the next patient context, swapping all
//                    per-patient dynamic variables (patient_name, patient_dob,
//                    member_id, claim_number/cdt_codes, etc.)
//   mark_session_item_refused(item_index: number, reason: string) — mark a
//                    remaining patient as refused_by_payer when the rep won't
//                    take additional lookups.

export const MULTI_PATIENT_HANDOFF_PROMPT_FRAGMENT = `# MULTI-PATIENT SESSION
This call is a multi-patient session with {{patient_count}} patients to verify.

Patient list: {{patients_summary}} (this gets injected as a numbered list at call start).

# HANDOFF FLOW
Work through patients strictly in order. Patient 1 first, then 2, then 3, etc. Do not skip ahead.

After fully completing patient 1 (all required fields retrieved or marked unavailable per the 100% retrieval gate), say to the rep:

  "Thank you. May we look up our next patient?"

If the rep agrees, switch context to patient 2 by calling the next_patient tool. This advances the dynamic variables (patient_name, patient_dob, member_id, claim_number / cdt_codes, etc.) to the next patient in the session.

After next_patient returns, repeat the standard arc for patient 2: identify, ask for status / coverage, drill into required fields, confirm reference number, capture rep name. Continue until either:
  (a) all {{patient_count}} patients are done, or
  (b) the rep refuses to continue with additional patients.

# REFUSAL HANDLING
If the rep refuses additional patients (e.g. "I can only do one per call", "you'll have to call back", "we have a one-patient-per-call policy"), do the following:
1. Politely acknowledge: "Understood, thank you for letting me know."
2. For EACH remaining patient (the ones you have not yet worked), call mark_session_item_refused(item_index, reason) with the rep's stated reason (or "one_per_call_policy" / "rep_refused" if no reason given).
3. Close the call normally — do not push or argue.

# RULES
- Always finish the current patient's 100% retrieval gate BEFORE asking to move to the next patient.
- Always announce the handoff verbally to the rep ("May we look up our next patient?") BEFORE calling next_patient.
- After next_patient swaps the context, briefly orient: "Thank you. The next patient is {{patient_name}}, member ID {{member_id}}."
- Get a fresh reference number for each patient. One reference number per patient, not one per call.
- If the rep changes mid-session (e.g. transferred to a colleague), re-introduce yourself and re-state the practice name once for the new rep.
`;
