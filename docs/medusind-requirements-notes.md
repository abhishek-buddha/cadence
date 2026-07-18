# Medusind Requirements Notes

Source files reviewed:
- `C:\Users\Admin\Downloads\Medusind — Conversational AI Voic Feature List.xlsx`
- `C:\Users\Admin\Downloads\rcm_wireframes.pptx`

Last reviewed: 2026-07-18

## Excel Workbook

Sheets:
- `General`
- `Original RFP Features`
- `Latest RFP features`
- `Sheet2` - empty

## General Sheet Themes

Major capability groups:
- Core conversational capability: natural low-latency speech, IVR navigation, multi-turn reasoning, human escalation.
- Domain knowledge: payer-specific rules, real-time fact checking, eligibility, prior auth, claim status, EOB, denials, appeals, billing, collections, scheduling.
- Integrations: EHR/PM bidirectional writeback, clearinghouse/payer APIs, FHIR exchange.
- Accuracy and trust: hallucination control, confidence scoring, full transcripts, audit trails.
- Operations: outbound/inbound calling, concurrency, reporting, configurable workflows.
- Patient experience: warm plain-language tone, distress/complexity routing, multilingual support.

## Original RFP Feature Groups

Important feature groups and current fit:

- IVR navigation and call handling:
  - Multi-level IVR navigation, DTMF, speech prompts, payer-specific IVR adaptation, timeout retry, hold/wait management, transfer detection, outbound call initiation, multi-patient batch, recording/transcription.
  - Current app covers much of IVR, DTMF/speech, payer IVR scripts, hold handling, outbound click-to-call, recording/transcript, and live handoff.
  - Remaining depth: stronger retry policies, >60 minute holds, multi-patient per single call, and cleaner payer/client routing.

- Conversational AI and NLU:
  - NLU, TTS, barge-in, clarification, contextual memory, live transfer orchestration, multilingual/accent support, dead-air detection, confidence scoring, payer vocabulary.
  - Current app depends heavily on ElevenLabs and prompt structure for these.
  - Remaining depth: field-level confidence, dead-air retry/escalation, multilingual support, and richer domain extraction.

- Dental eligibility verification:
  - EV query, coverage status, subscriber/dependent handling, frequency limits, deductible/max, co-insurance/copay, plan category navigation, remaining benefit calculation, limitations, structured EV output.
  - Current app has EV screens and inputs, but complete structured EV extraction is not fully proven from the repo review.

- Medical claims and denial follow-up:
  - Claim lookup, status retrieval, payment details, denial reasons, appeal deadlines/instructions, resubmission guidance, multi-claim inquiry, partial payment detection, COB, structured claims output.
  - Current app covers claim lookup/status workflow basics and call result display.
  - Remaining depth: payment fields, denial/appeal fields, structured schema, underpayment/COB calculations.

- Accuracy:
  - 100% retrieval SLA, field validation, confidence scores, zero hallucination, transcript-to-output traceability.
  - Current app has transcript/audit concepts.
  - Remaining depth: field-level validation, confidence, trace links from extracted fields to transcript timestamps.

- Outcome classification:
  - Success, partial success, failure, auto-retry.
  - Current app has statuses.
  - Remaining depth: explicit partial-success classification and configurable auto-retry.

- Data ingestion:
  - Patient demographics, member/subscriber ID, provider NPI/Tax ID, claim number/DOS, payer directory, batch ingestion, real-time API.
  - Current app covers core manual inputs and payer directory.
  - Remaining depth: real-time API, idempotency, broader batch/API formats.

- Security/compliance:
  - HIPAA architecture, tenant isolation, encryption, RBAC, secure recording storage, SOC2, pentest, breach notification, PII masking.
  - Current app has RBAC/audit/recording surfaces.
  - Remaining depth: policy/document proof, retention controls, masking/redaction enforcement.

- Integration/telephony:
  - REST APIs, OAuth/API auth, JSON/CSV/HL7/SFTP/S3, configurable output schema, webhooks, idempotency, SIP/VoIP, concurrency, voicemail detection, number rotation.
  - Current app has some API key/webhook code and Twilio integration.
  - Remaining depth: public API docs, idempotency, voicemail detection, number rotation, SIP/VoIP, configurable output schema.

- Reporting:
  - Real-time dashboard, success reporting, completeness, payer scorecards, SLA/KPI, alerts, audit exports, transcript search/export, forecasting, QA sampling.
  - Current app has dashboard/reports/audit pages.
  - Remaining depth: hold metrics, transfer rate, IVR traversal rate, productivity, ROI, transcript search/export polish.

## Latest RFP Sheet

Current user-marked lower priority:
- Outbound dialing:
  - High-volume scheduled queues.
  - Automatic retry after failed/no-answer calls.
  - Configurable retry windows and concurrency limits.
- Hold management:
  - >60 minute holds. Current Convex loop is around 30 minutes.
  - Better hold-time metrics/reporting.
- Human escalation and transfer:
  - Client/payer-specific routing is only partial.
  - Context handoff exists as timeline/transcript, but not as a clean context card.
  - Warm/blind transfer semantics need product-level clarification.

Easier remaining items to implement first:
- Hold metrics in Reports:
  - Use existing `holdStartedAt` / `holdDuration` fields.
  - Add average hold time, long-hold count, and payer-level hold summary.
  - Low risk because it is mostly reporting/UI.

- Handoff context card:
  - Add a compact card in the live handoff UI with claim, patient, payer, provider, reason, latest transcript, and key identifiers.
  - Low risk because the data is mostly already available and it improves the operator experience.

- Claim Routing polish:
  - Add visible client/payer/provider/claim-type assignment fields for operators.
  - Make unavailable/busy operators visible but not assignable.
  - Medium risk if assignment starts affecting routing logic; low risk if done as read-only/admin-edit metadata first.

- IVR traversal / transfer rate reporting:
  - Add report widgets using existing call phases/status/handoff state.
  - Low to medium risk depending on current data completeness.

- Auto-retry settings:
  - Add retry count/window fields and retry status display first.
  - Actual scheduled retry execution is higher risk and should come after settings are visible.

## PPTX Wireframes

Slides and current fit:

- Slide 1: Overview only.
- Slide 2: Dashboard.
  - Current app has dashboard-style operational metrics.
  - Remaining polish: align exact cards/charts if needed.

- Slide 3: Claim Management list.
  - Current app has claims list and call action flow.
  - Remaining polish: exact columns/search/status labels.

- Slide 4: Claim detail.
  - Current app has claim detail, call insurance, latest result/next steps, history/transcript concepts.
  - Remaining polish: exact field grouping and drill-down transcript layout.

- Slide 5: Claim User Routing.
  - Current app has claim routing and operator availability.
  - Recently fixed to show operator/call-taking users and exclude admin/manager/viewer.
  - Remaining depth: payer/provider/claim-type routing rules and manager visibility into busy users.

- Slide 6: Call Audit history.
  - Current app has call audit/history route.
  - Remaining polish: exact outcome/duration/status columns and row drill-down behavior.

- Slide 7: Call detail.
  - Current app has transcript/recording details.
  - Remaining depth: extracted fields such as reference number, denial code, callback requested, sentiment.

- Slide 8: Call Audit live sessions.
  - Current app has live sessions/handoff page.
  - Remaining polish: exact session columns and no-case-view behavior.

- Slide 9: Reports.
  - Current app has reports tabs.
  - Remaining depth: operational/business/executive grouping, ROI, productivity, hold/transfer/IVR traversal metrics.

- Slide 10: User Management.
  - Current app has User Management and invite/edit role flow.
  - Remaining polish: payer/provider/team lead fields and copy/delete actions if needed.

- Slide 11: Master Data overview.
  - Current deployed page appears acceptable per user; no immediate changes requested.

- Slide 12: Master Data insurance records.
  - Current deployed page appears acceptable per user; no immediate changes requested.

## Suggested Implementation Order

Ask the user before implementing. Recommended order:

1. Handoff context card in live calls.
   - Fastest visible improvement.
   - Helps Medusind operators understand why they are taking the call.

2. Hold metrics in Reports.
   - Uses existing call fields.
   - Demonstrates one of the explicit RFP reporting gaps.

3. Routing metadata polish.
   - Add payer/provider/claim-type/team lead columns and edit support for operators.
   - Do metadata first; connect it to routing assignment logic only after UI is validated.

4. Call audit detail extracted fields.
   - Add reference number, denial code, callback requested, sentiment placeholders or extracted fields.
   - Useful for matching PPTX slide 7.

5. Retry settings UI.
   - Add visible retry config fields.
   - Implement actual automatic retry scheduler later.

