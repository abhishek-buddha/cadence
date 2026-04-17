# Cadence — Pilot Execution Plan

**Document:** Pilot Execution Plan
**Version:** 1.0
**Date:** 2026-04-17
**Prepared for:** Medusind LLC
**Prepared by:** Cadence (Algonox)
**Classification:** Confidential — RFP Response Artifact

---

## 1. Pilot Objectives

The pilot is designed to validate Cadence's fitness for Medusind's production environment across four dimensions:

1. **Accuracy** — that retrieved data matches what a human caller would record, validated through structured QA sampling.
2. **IVR navigation reliability** — that Cadence's voice and DTMF IVR navigation succeeds at or above target rate across the in-scope payer set.
3. **Throughput and unit economics** — that Cadence sustains the call volume Medusind projects for production at acceptable per-call cost.
4. **Operational fit** — that the integration surface (REST API, webhooks, console, reports) meets the workflow needs of Medusind's RCM operations team.

A successful pilot exit is the trigger to graduate to a production contract at the agreed Tier rate (see Pricing Model §8).

---

## 2. Pilot Duration

**Eight weeks** from the date the production-equivalent environment is provisioned and the first six payers are configured. The duration breaks down as:

- Weeks 1–2 — Setup and sandbox testing (no production calls)
- Weeks 3–4 — Soft launch (low volume, intensive monitoring)
- Weeks 5–6 — Scale up (full pilot volume)
- Weeks 7–8 — Optimization, decision gate

[Medusind to confirm] preferred pilot start date and any constraints on go-live timing (e.g., end-of-quarter freezes).

---

## 3. Pilot Scope

### 3.1 Use Cases

Both Cadence use cases are included in the pilot:

- **Medical Claim Status & Denial Follow-Up** — outbound calls to medical payers
- **Dental Eligibility Verification** — outbound calls to dental payers

### 3.2 Payers (Initial Six)

The pilot starts with three medical payers and three dental payers, jointly selected with Medusind based on Medusind's actual volume distribution. Indicative selection:

**Medical (suggested, [Medusind to confirm]):**
- Aetna
- UnitedHealthcare
- Anthem Blue Cross Blue Shield

**Dental (suggested, [Medusind to confirm]):**
- Delta Dental
- MetLife Dental
- Cigna Dental

These six are chosen for IVR familiarity, geographic coverage, and typical wait-time patterns. Additional payers can be added in week 5+ if pilot pace permits.

### 3.3 Volume

Indicative pilot volume bands (subject to confirmation against Medusind's actual distribution):

| Phase | Weekly Calls | Approx. Daily Calls |
|---|---|---|
| Weeks 1–2 | 0 (setup) | 0 |
| Weeks 3–4 (soft launch) | 100–250 | 20–50 |
| Weeks 5–6 (scale up) | 500–1,000 | 100–200 |
| Weeks 7–8 (optimization) | 750–1,250 | 150–250 |

Pilot total: approximately 3,000–5,000 calls, evenly split between medical and dental.

---

## 4. Phased Execution

### 4.1 Weeks 1–2 — Setup

| Day | Cadence | Medusind |
|---|---|---|
| Day 1 | Provision Medusind tenant; issue API keys; deliver SSO metadata | Designate pilot lead, ops team contact, integration engineer |
| Day 2 | Onboard Cadence ops team; deliver runbooks | Provide payer credentials, provider TIN/NPI list, sample case data (de-identified for sandbox) |
| Day 3–5 | Configure six pilot payers (IVR sequences, voice profiles, prompts) | Confirm Medusind contact records, ops queue phone for transfers |
| Day 6–8 | Sandbox call testing against mock payer; verify webhooks; verify reports | Validate API integration with sample dataset |
| Day 9–10 | Joint review; sign-off to enter soft launch | Identify any blockers before week 3 |

Exit gate for week 2 → 3: every sandbox happy-path test passes, every webhook event delivers to Medusind subscriber, all six payer configurations validated against published IVR sequences.

### 4.2 Weeks 3–4 — Soft Launch

Live calls placed at low volume against real payers with real Medusind cases:

- Conservative concurrency caps (max 3 concurrent per payer)
- Cadence ops team in real-time monitor for every call
- Daily 30-minute standup with Medusind ops team to review outcomes
- Every "Failed" call manually triaged within four hours
- Every "Partial" call manually reviewed for missing-field cause categorization
- Weekly retrospective on Friday with both ops teams and Cadence engineering

Exit gate for week 4 → 5: success rate ≥ 70%, no P0 incidents, Cadence ops triage of every Failed call within four hours met across the period.

### 4.3 Weeks 5–6 — Scale Up

- Concurrency caps raised to projected production levels
- Cadence ops monitoring shifts to exception-based (alerts on failure clusters, not call-by-call)
- Twice-weekly standup
- Weekly accuracy QA sample expanded (target: 5% sample of Successful calls re-reviewed)
- Pilot dashboard exported weekly to Medusind exec sponsor

Exit gate for week 6 → 7: success rate ≥ 80%, accuracy ≥ 0.85, average call time ≤ 8 minutes.

### 4.4 Weeks 7–8 — Optimization and Decision Gate

- Iterative prompt and IVR tuning based on per-payer outcome trends
- A/B test of any Cadence-proposed agent prompt revisions
- Pilot exit-criteria report generated (auto-generated PDF from pilot dashboard)
- Joint Cadence × Medusind decision review meeting in week 8
- Production contract negotiation finalized in parallel

Exit gate for week 8 → production: all success criteria met (Section 5); Medusind operational sign-off; commercial terms locked.

---

## 5. Success Criteria

The pilot is judged against five quantitative and three qualitative criteria.

### 5.1 Quantitative

| Criterion | Target | Measurement |
|---|---|---|
| Successful outcome rate | ≥ 80% | (Successful calls / total calls) over rolling 7 days at end of week 6+ |
| Data accuracy | ≥ 0.85 agreement with human reviewer | 5% sample of Successful calls re-reviewed weekly by Medusind QA |
| Average call time | ≤ 8 minutes | Median across all completed calls in weeks 5–8 |
| Successful call cost (per Cadence-managed Twilio Tier 1 pricing) | At or below modeled production cost | Pilot invoice reconciled against Medusind cost model |
| User-reported issues | ≤ 5 per week | Tracked in joint Jira / shared issue tracker |

### 5.2 Qualitative

- Medusind ops team rates Cadence console usability ≥ 4/5 in week-8 survey
- Medusind integration engineer confirms REST API and webhook integration require no further changes for production
- Medusind compliance team confirms audit log, access controls, and incident response process meet internal requirements

---

## 6. Iteration Cadence

| Cadence | Participants | Purpose |
|---|---|---|
| Daily standup (weeks 3–4) | Medusind ops + Cadence ops | Triage every Failed call, identify same-day fixes |
| Twice-weekly standup (weeks 5–8) | Medusind ops + Cadence ops | Review outcome trends, incident updates |
| Weekly retrospective (Fridays) | Both ops teams + Cadence engineering | Continuous improvement, prompt tuning approval, payer config changes |
| Weekly executive readout (Mondays) | Medusind exec sponsor + Cadence CSM | Pilot metrics dashboard, risk register, decisions needed |
| Bi-weekly steering (week 2, 4, 6, 8) | Both leadership teams | Scope adjustments, commitment direction, exit decision |

---

## 7. Reporting

### 7.1 Pilot Dashboard

Live in the Cadence web console; exported weekly as a PDF for distribution.

Panels:

- Daily call volume with outcome breakdown (stacked bar)
- Success / partial / failed rate trend (line, 7-day rolling)
- Accuracy from QA sampling (line, weekly)
- Per-payer success rate table
- Per-use-case success rate
- Average call time distribution (histogram)
- Cost per successful call trend
- Open exceptions count (gauge)

### 7.2 Weekly Pilot Report (PDF)

Auto-generated every Sunday for Monday distribution. Includes the dashboard snapshot, weekly delta vs targets, list of Failed calls with root cause, list of agent prompt or IVR changes made that week, and the next-week plan.

### 7.3 Monthly Executive Readout

End of week 4 and end of week 8. Slides covering pilot status vs targets, key wins, key risks, decisions required, and (in week 8) the production-graduate recommendation with supporting evidence.

---

## 8. Risk Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pilot payer changes IVR mid-pilot | Medium | Cadence IVR-trace recorder detects deviation within 1 call; tuned configuration deployed within 24 hours |
| Cadence agent fails on a non-English payer rep | Low | Pilot scope is English-only payers; if encountered, fall back to manual handoff and exclude from outcome stats |
| Hostile or uncooperative payer rep | Low–Medium | Cold-transfer to Medusind ops queue; outcome marked `transferred_to_human`; not penalized in success rate denominator |
| Twilio outage | Low | Queue-and-retry; Status Page integration alerts on partner outage; pilot timeline absorbs up to 1 day cumulative outage |
| ElevenLabs Enterprise endpoint degradation | Low | Cadence holds backup credentials in alternate region; switchover via runbook |
| Azure OpenAI rate limit during peak | Low | Per-tenant TPM allocation reserved; auto-fallback to secondary deployment |
| Medusind ops team capacity constraint mid-pilot | Medium | Daily standup detects early; Cadence absorbs more triage temporarily |
| Critical-error-on-real-claim risk during scale-up | Medium | Per-payer allowlist start (no call placed without payer in allowlist); fallback to manual on any P0 within first 50 calls per payer |

---

## 9. Pilot Exit Criteria → Graduate to Production

The pilot graduates when:

- All five quantitative success criteria are met (Section 5.1) for at least the final two weeks of the pilot
- All three qualitative success criteria are met (Section 5.2)
- No P0 incidents in the final two weeks
- Joint Cadence × Medusind sign-off in the week-8 decision review meeting
- Commercial terms locked (production contract executed)
- Operational handoff completed (Medusind ops team trained; runbook ownership transferred to Medusind for tier-1 issue triage)

If any criterion is not met, options include:

- **Extend the pilot** by two to four weeks to address specific gaps
- **Reduce scope** (drop a problematic payer; defer dental or medical to a later phase)
- **Conditional graduation** with documented action plan and 30-day re-review
- **Decline to proceed** — Cadence absorbs pilot cost per Pilot Option 2 if applicable

---

**End of Pilot Execution Plan.**
