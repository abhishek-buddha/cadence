# Cadence — High-Level Rollout Plan

**Document:** Rollout Plan
**Version:** 1.0
**Date:** 2026-04-17
**Prepared for:** Medusind LLC
**Prepared by:** Cadence (Algonox)
**Classification:** Confidential — RFP Response Artifact

---

## 1. Implementation Timeline

The rollout spans a 24-week horizon: an 8-week pilot phase followed by a 12-week scale phase, plus a 4-week steady-state stabilization period. The timeline below assumes a contract execution date of `[Medusind to confirm]` and a pilot start of [Contract + 2 weeks].

| Week | Phase | Cadence Workstream | Medusind Workstream | Milestone |
|---|---|---|---|---|
| W-2 | Pre-pilot | Tenant provisioning, BAA execution, SSO config | Designate pilot lead and integration engineer | Tenant ready |
| W-1 | Pre-pilot | Configure 6 pilot payers; deliver runbooks | Provide payer credentials, sample data | Configurations validated |
| W1 | Pilot setup | Sandbox testing; webhook validation | API integration to sandbox | Sandbox sign-off |
| W2 | Pilot setup | Final go-live readiness | Final pre-launch sign-off | Pilot launch authorized |
| W3 | Pilot soft-launch | Live calls 100–250/week, hands-on monitoring | Daily standup, validate outcomes | First 100 live calls clean |
| W4 | Pilot soft-launch | Continue soft launch, weekly retro | Daily standup, accuracy QA sample | Soft-launch exit gate |
| W5 | Pilot scale | Volume 500–1000/week, raise concurrency | Twice-weekly standup, expanded QA | 80% success rate sustained |
| W6 | Pilot scale | Pilot dashboard exported to Medusind weekly | Weekly executive readout | All quantitative criteria met |
| W7 | Pilot optimize | Iterative prompt/IVR tuning | A/B test review | Tuning frozen for decision gate |
| W8 | Pilot decision | Auto-generated exit-criteria report | Decision review meeting | Production contract executed |
| W9 | Production ramp | Add payers 7–10; medical denial follow-up enabled | Validate production data flow | Payer count = 10 |
| W10 | Production ramp | Add payers 11–14; bulk import enabled | Switch upstream PMS/clearinghouse to Cadence intake | Bulk import in production |
| W11 | Production ramp | Add payers 15–18; multi-patient sessions enabled | Validate multi-patient outcomes per item | Multi-patient session in production |
| W12 | Production ramp | Add payers 19–20 | First full-month production billing reconciliation | Tier transition validated |
| W13 | Production scale | Throughput ramp to 50% projected steady-state | Operational ownership transition | Tier-1 triage owned by Medusind ops |
| W14 | Production scale | SSO production cutover (replace pilot Auth.js) | IdP conditional access policies applied | SSO live |
| W15 | Production scale | RBAC role expansion (Manager, Operator, Viewer) | Add additional Medusind users with appropriate roles | RBAC live |
| W16 | Production scale | Throughput ramp to 100% projected steady-state | Steady-state validation | Steady-state achieved |
| W17 | Production scale | Custom integration #1 (PMS or clearinghouse) | Joint conformance testing | Integration #1 live |
| W18 | Production scale | Custom integration #2 (if applicable) | Joint conformance testing | Integration #2 live |
| W19 | Production scale | Quarterly DR game-day rehearsal | Observer; report shared | DR rehearsal complete |
| W20 | Production scale | Performance and cost optimization review | Joint review | Cost-per-call within target |
| W21 | Stabilization | First quarterly review with Medusind exec | Assess KPI vs targets | Quarterly review complete |
| W22 | Stabilization | Audit log export pipeline to Medusind SIEM | Validate ingestion | SIEM integration live |
| W23 | Stabilization | First quarterly access review | Joint attestation | Access review complete |
| W24 | Stabilization | Steady-state operations; quarterly cadence established | Transition to BAU support cadence | Implementation closeout |

---

## 2. Phased Payer Onboarding

The onboarding sequence is designed to front-load the highest-volume payers and the payers with most predictable IVR systems, while reserving complex payers for week 8+ when Cadence ops have local context for the Medusind environment.

| Week | Cumulative Payers | New Payers (suggested, [Medusind to confirm] based on actual volume) |
|---|---|---|
| W-1 | 6 | Aetna (med), UnitedHealthcare (med), Anthem BCBS (med), Delta Dental (dent), MetLife Dental (dent), Cigna Dental (dent) |
| W9 | 10 | Humana (med), Cigna Healthcare (med), Aetna Dental (dent), United Concordia (dent) |
| W10 | 14 | Centene (med), Molina (med), Guardian Dental (dent), Humana Dental (dent) |
| W11 | 18 | Kaiser Permanente (med), Tricare (med), Lincoln Financial (dent), Principal Dental (dent) |
| W12 | 20 | Wellpoint (med), Anthem Dental (dent) |
| W13+ | 20+ | Per-payer onboarding rate of 2–4 per week, prioritized by Medusind volume |

Per-payer onboarding workstream (one Cadence engineer-week per payer):

1. Phone number and IVR sequence research (1 day)
2. Voice prompt manual call-and-record (1 day)
3. Prompt and tool override drafting (1 day)
4. Sandbox validation against simulated payer (1 day)
5. Pilot call validation (5–10 real calls with Cadence ops monitoring)
6. Promotion to general availability for that payer

---

## 3. Scaling Strategy

### 3.1 Throughput Ramp

| Week | Daily Successful Calls (target) | Concurrent Calls (max) |
|---|---|---|
| W3 (soft launch) | 25 | 6 (3 per payer × 2 payers active) |
| W4 | 50 | 12 |
| W5 | 100 | 30 |
| W6 | 200 | 50 |
| W7–W8 | 250 | 60 |
| W9–W12 (production ramp) | 500–1500 (linear ramp) | 100–200 |
| W13 (50% steady state) | 2500 | 250 |
| W16 (100% steady state) | 5000 | 500 |

Steady-state targets are placeholders; final values depend on Medusind volume confirmation (RFP §"Volume", lines 109–110).

### 3.2 Concurrency Controls

- Per-payer concurrency cap (default 10 concurrent per payer phone number) prevents triggering payer rate limits
- Per-tenant absolute concurrency cap (default 500 concurrent for production tier) prevents runaway cost from a misconfigured upstream system
- Auto-throttle on observed payer error rate (if a payer returns >20% errors over 15 minutes, concurrency for that payer is automatically reduced to 1 until manual review)

### 3.3 Capacity Planning

Cadence's stack is autoscaled (see Architecture Overview §10) and validated to 5× projected production volume in load tests before each ramp threshold. Ahead of each weekly ramp, Cadence engineering runs a load-and-soak test against the staging environment at the next-week target volume to validate headroom.

---

## 4. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Production scale uncovers IVR variations not seen in pilot | Medium | Medium | IVR-trace recorder logs every variation; nightly diff alerts Cadence ops; configurations updated within 24 hours of detection |
| Payer changes phone number or main IVR | Low | High | Cadence payer directory monitoring; weekly automated test call to every active payer's main number; alert on connectivity loss |
| Twilio regional outage | Low | High | Multi-region Twilio configuration; auto-fallback to secondary region documented in runbook; pilot SLA absorbs ≤4h cumulative |
| Azure OpenAI service degradation | Low | Medium | Multi-region failover; secondary deployment in different region pre-configured |
| Medusind ops team capacity is below planned during ramp | Medium | Medium | Cadence ops temporarily absorbs additional triage; flagged in weekly executive readout for decision |
| Cost per call exceeds modeled steady-state | Medium | Medium | Monthly cost-per-call review starting week 4; tuning options include prompt compression, reduced ElevenLabs voice quality on non-critical paths, switch to Option B telephony |
| Compliance certification timeline slips (HITRUST i1 in 2027-Q2) | Medium | Low–Medium | Cadence shares quarterly progress; Medusind compliance reviews; alternative attestations (SOC 2 Type II) available earlier |
| Personnel turnover at Cadence on the Medusind account | Low | Medium | Named CSM with named backup; weekly account-state document maintained; runbooks owned by team, not individuals |
| Personnel turnover at Medusind on the integration | Low | Low | Cadence onboarding documentation kept current; access review every quarter detects orphaned accounts |
| Regulatory change (HIPAA update, state law) | Low | Low–Medium | Compliance team monitors federal register and state legislation; impact analyzed within 30 days of effective date |
| Subprocessor BAA termination | Very Low | High | Cadence holds alternative subprocessor relationships for each role; switchover plan documented |

---

## 5. Support Model

### 5.1 Severity and Response

Standard support tier (included in per-call pricing):

| Severity | Definition | Response | Resolution Target | Hours |
|---|---|---|---|---|
| P0 | Production outage, confirmed PHI breach, total service unavailability | < 1 hour | < 4 hours mitigation | 24/7 (always) |
| P1 | Major degradation, single-tenant outage, security event without confirmed exposure | < 1 hour | < 8 hours mitigation | Business hours (after-hours: < 4 hours initial response) |
| P2 | Minor degradation, isolated user-facing bug | < 4 hours | < 3 business days | Business hours |
| P3 | Cosmetic, low-impact, feature request | Next business day | Per release cycle | Business hours |

24/7 P0/P1 response is included in the standard tier. After-hours P2 response is available as an upgrade (see Pricing Model §6).

### 5.2 Support Channels

- Email: `support@cadence.com` (P2/P3 default)
- Phone: dedicated number issued at contract execution (P0/P1)
- Customer slack / Teams shared channel (P1/P2 collaboration)
- Status page: `status.cadence.com` (auto-updated from monitoring)
- Incident webhook: customer can subscribe to Cadence-side incident events via webhook

### 5.3 Communication During Incidents

- P0 incidents: Cadence Customer Success Manager opens a war-room call within 15 minutes; updates published every 30 minutes until resolution
- P1 incidents: status page update within 30 minutes; updates every 2 hours
- P2/P3: standard ticket cadence

Post-incident reports for P0 published within 5 business days; for P1 within 10 business days.

---

## 6. Training Plan

### 6.1 Cadence Operations Team

Internal Cadence-side training is completed before pilot launch. Topics:

- Medusind tenant configuration baseline and constraints
- Top 6 pilot payers — IVR map, common rep responses, escalation triggers
- Medusind ops team contact tree and escalation cadence
- Compliance constraints specific to Medusind contract
- Custom prompts and overrides per payer

### 6.2 Medusind Operations Team

Cadence-led training delivered in two sessions during pilot setup (week 1):

- Session 1 (2 hours) — Console overview, case management, live monitoring, transcript review, recording playback
- Session 2 (2 hours) — Outcome interpretation, reports and dashboards, exception triage workflow, ticket submission

Recorded for re-watching; followed by office-hours availability through pilot end.

### 6.3 Medusind Integration Engineer

Cadence-led technical session (2 hours) during pilot setup:

- REST API tour with live examples
- Webhook subscription and signature verification
- SSO integration walkthrough
- Bulk import format and validation
- Postman collection delivery

### 6.4 End-User Training Materials

Provided as part of pilot setup and updated as features evolve:

- Quick-start guide (PDF, 8 pages)
- Detailed user manual (PDF, ~40 pages, role-segmented)
- Short video tutorials (5–7 videos, 3–5 minutes each)
- In-app help with tooltips and progressive disclosure

---

## 7. Change Management

### 7.1 Release Cadence

| Release Type | Frequency | Notice |
|---|---|---|
| Hotfix | As needed | None required for P0 fixes; post-deploy notification within 24 hours |
| Patch | Weekly (minor bug fixes, no schema/API changes) | 24 hours notice via release notes |
| Minor | Monthly (new features, backward-compatible) | 1 week notice; release notes; optional preview environment |
| Major | Quarterly (potentially breaking; opt-in transition window) | 30 days notice; documented migration guide; 60-day overlap on deprecated APIs |

### 7.2 Change Advisory Process

For changes affecting Medusind:

1. Cadence drafts change proposal (description, rationale, impact, rollback)
2. Reviewed in monthly joint Change Advisory Board (Cadence Engineering Lead, Medusind Integration Lead, Medusind Compliance representative)
3. Approval (or deferral) decision documented
4. Approved changes scheduled into the appropriate release cadence

Emergency changes (security fix, regulatory compliance) follow an expedited path with post-implementation review.

---

## 8. Communication Cadence

| Cadence | Participants | Format | Purpose |
|---|---|---|---|
| Daily standup (pilot weeks 3–4) | Both ops teams | 30 min Zoom | Triage active issues, plan day |
| Twice-weekly standup (pilot weeks 5–8) | Both ops teams | 30 min Zoom | Same |
| Weekly status (production W9+) | CSM + Medusind ops lead | 30 min Zoom + email summary | KPI review, open items |
| Weekly executive readout (Mondays) | Medusind exec sponsor + Cadence CSM | Email + dashboard PDF | Pilot/production status, risks |
| Monthly Change Advisory Board | Engineering leads + Compliance | 60 min Zoom | Change approvals |
| Quarterly business review | Medusind exec + Cadence leadership | 90 min onsite or Zoom | Strategy, satisfaction, roadmap |
| Quarterly DR game-day report | Engineering leads | Async report | DR readiness attestation |
| Quarterly access review | Compliance leads | Async + 30 min sync | Joint attestation |

---

## 9. Decision Gates

The rollout has explicit decision gates between phases. At each gate, both parties review the documented criteria and authorize the next phase, defer, or de-scope.

| Gate | Timing | Decision | Authorization |
|---|---|---|---|
| Sandbox sign-off | End of W1 | Proceed to live pilot | Medusind integration engineer + Cadence engineering lead |
| Soft-launch exit | End of W4 | Proceed to scale-up | Medusind ops lead + Cadence ops lead |
| Pilot decision | End of W8 | Graduate to production | Medusind exec sponsor + Cadence CEO |
| Production go-live | End of W9 | First production payer added | Medusind ops + integration leads |
| 50% throughput | End of W13 | Proceed to 100% throughput | Medusind ops lead + Cadence engineering lead |
| Steady-state | End of W16 | Transition to BAU support cadence | Medusind exec sponsor |
| Implementation closeout | End of W24 | Formal closure of project; ongoing operations | Both party leadership |

A "no-go" at any gate triggers a documented remediation plan and a deferred re-review at a target date.

---

**End of Rollout Plan.**
