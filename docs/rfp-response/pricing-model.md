# Cadence — Pricing Model

**Document:** Pricing Model
**Version:** 1.0
**Date:** 2026-04-17
**Prepared for:** Medusind LLC
**Prepared by:** Cadence (Algonox)
**Classification:** Confidential — RFP Response Artifact

---

## 1. Pricing Philosophy

Cadence prices on outcomes, not on minutes, attempts, or seats. Medusind pays for calls that actually retrieve the data Medusind needs. Calls that fail to reach a payer representative or are unable to retrieve any required data are not billed. Calls that retrieve some but not all required data are billed at a discounted rate.

This structure aligns Cadence's revenue with Medusind's success and removes the incentive to inflate call volume with unproductive attempts. Cadence absorbs the cost of underperforming attempts as the price of skin in the game.

Volume discounts apply automatically as monthly call volume crosses tier thresholds; tier discounts are applied retroactively across the full month, not just the marginal calls above the threshold.

---

## 2. Definition of "Successful Call"

A call is classified as **Successful** only if 100% of the required data elements for the use case were retrieved during the call, per the Medusind RFP standard:

> "Calls not meeting full data retrieval are not 'successful'." — Medusind RFP v1.1, line 35

Required data elements are defined per use case and per procedure-code group (for dental EV) and are configurable per payer to accommodate payers that systematically cannot provide certain fields.

| Use Case | Required Data Elements (default) |
|---|---|
| Medical Claim Status | Claim status (paid / pending / denied / processing / no-info), payment amount, paid date, check or EFT number, denial code, denial reason, appeal status, next steps |
| Medical Denial Follow-Up | Denial code, denial reason, remark code, appeal deadline, appeal address, supporting documentation requirements |
| Dental EV (Preventive D0/D1) | Coverage active flag, effective date, network status, deductible (annual + met), annual maximum (total + remaining), co-insurance for preventive, frequency limits for D0150 / D1110 / D1120 / D1206 |
| Dental EV (Restorative D2) | All preventive fields plus co-insurance for basic, waiting period for basic, frequency limits for D2330 / D2740 / D2750 |
| Dental EV (Major D3-D9) | All restorative fields plus co-insurance for major, waiting period for major, missing-tooth clause, pre-authorization requirements |

Outcomes:

- **Successful:** all required fields retrieved
- **Partial:** call connected, agent reached, some required fields retrieved (and the rest determined unavailable with reason)
- **Failed:** call did not connect to a representative or terminated before any usable data was retrieved

---

## 3. Volume Tiers (Cadence-Managed Telephony)

Pricing applies per tenant per calendar month; volume thresholds reset monthly. All prices in USD.

| Tier | Monthly Successful Calls | Price per Successful Call | Price per Partial Call | Price per Failed Call |
|---|---|---|---|---|
| Tier 1 — Pilot | 0 – 1,000 | $X.00 | $X.00 (50% of successful) | $0 |
| Tier 2 — Growth | 1,001 – 5,000 | $X.00 (10% off Tier 1) | $X.00 | $0 |
| Tier 3 — Scale | 5,001 – 20,000 | $X.00 (20% off Tier 1) | $X.00 | $0 |
| Tier 4 — Enterprise | 20,001 + | $X.00 (custom; typically 30%+ off Tier 1) | $X.00 | $0 |

Tier discounts apply retroactively to the full month: a tenant that processes 6,000 successful calls in a month is billed at the Tier 3 rate for all 6,000 calls, not at Tier 1 for the first 1,000 and Tier 2 for the next 4,000.

[Medusind to confirm] expected monthly volume for medical and dental use cases (RFP §"Volume", lines 109–110, marked TBD).

---

## 4. Telephony Pricing Options

The RFP requires that pricing differentiate between Cadence-provided telephony and Medusind-provided telephony (RFP line 66). Cadence offers both.

### 4.1 Option A — Cadence-Managed Twilio (Recommended)

Cadence operates the Twilio HIPAA-eligible workspace and absorbs telephony cost into the per-call price. Medusind has no telephony infrastructure to procure or operate. The per-call prices in Section 3 reflect this option.

Includes:

- Twilio outbound voice (US destinations)
- Twilio recording storage (90 days hot)
- Twilio Voice Insights for call quality monitoring
- Twilio HIPAA workspace BAA

### 4.2 Option B — Medusind-Provided SIP Trunk

Medusind operates the telephony layer (existing SIP trunk, Genesys, Five9, NICE, or other contact center) and Cadence integrates via SIP/RTP. Per-call pricing is reduced because Cadence does not bear telephony cost.

| Tier | Price per Successful Call (Option B) | Reduction vs Option A |
|---|---|---|
| Tier 1 — Pilot | $X.00 | $X.XX lower |
| Tier 2 — Growth | $X.00 | $X.XX lower |
| Tier 3 — Scale | $X.00 | $X.XX lower |
| Tier 4 — Enterprise | $X.00 | Custom |

Includes:

- Cadence engineering for SIP integration setup (one-time, see §9)
- Joint conformance testing prior to go-live
- Cadence remains responsible for call orchestration; Medusind responsible for trunk capacity and rep dial-in availability

[Medusind to confirm] preferred telephony option and existing infrastructure if Option B is selected.

---

## 5. What's Included in the Per-Call Price

- Compute and storage for case management, call orchestration, transcript, and outcome
- Conversational AI inference (ElevenLabs Enterprise) for the entirety of the call
- Post-call structured extraction (Azure OpenAI GPT-4o)
- Recording storage for 90 days (signed-URL retrieval)
- Transcript retention for the contracted retention period (default 6 years)
- Webhook delivery to Medusind subscribers
- Live call monitoring in the Cadence web console
- Standard reporting and analytics dashboards
- Tier 2 support (P1 < 1 hour business hours; see Rollout Plan §5)

---

## 6. What's Billed Separately

| Item | Pricing |
|---|---|
| Long-term recording archival (beyond 90 days hot) | $X per GB per month (S3 Glacier) |
| Long-term transcript retention beyond 6 years | $X per million records per year |
| Custom payer onboarding (beyond initial 20 payers) | $X per payer (one-time) |
| Custom integrations (PMS, EHR, clearinghouse) | $X per integration (one-time) plus T&M for ongoing maintenance |
| White-glove implementation (dedicated CSM, weekly reviews) | $X per month |
| 24/7 P0/P1 support upgrade (default is business-hours P1) | $X per month |
| Dedicated test environment beyond the standard staging | $X per month |
| Bring-your-own LLM (private Llama 3 deployment integration) | One-time $X plus monthly $X |

---

## 7. Volume Commitment Options

| Option | Description | Discount |
|---|---|---|
| Pay-as-you-go | No commitment; pay actual usage at Tier 1 rate | None |
| Monthly minimum | Minimum N successful calls per month; below threshold billed at minimum | 5% off applicable tier rate |
| Annual contract — flat | 12-month commitment at fixed monthly rate | 10% off applicable tier rate |
| Annual contract — declining | 12-month commitment with stepped-down rate as cumulative volume grows | 15% off applicable tier rate |
| Multi-year (24/36 months) | Locked rate plus mid-term review | 20% off applicable tier rate |

[Medusind to confirm] preferred commitment structure aligned with budget cycle.

---

## 8. Pilot Pricing

The 8-week pilot (see Pilot Execution Plan) is offered at:

| Pilot Option | Per Successful Call | Notes |
|---|---|---|
| Pilot Option 1 — Flat fee | $X / successful call | Same definition as production; partial calls 50% off; failed calls $0 |
| Pilot Option 2 — Outcome-conditioned | $0 during pilot | Cadence absorbs cost in exchange for written case study rights and reference quote on successful pilot exit |
| Pilot Option 3 — Hybrid | $X / call (reduced) | Smaller fee to cover variable cost; case study rights included |

Pilot per-call price is decoupled from production tiers (does not count toward production tier thresholds). Pilot success criteria (success rate ≥ 80%, accuracy ≥ 0.85, avg call time ≤ 8 min) are documented in the Pilot Execution Plan; pilot exit at or above criteria graduates to production at the contracted Tier rate.

---

## 9. Implementation Fees

| Item | One-Time Fee |
|---|---|
| Standard pilot setup (tenant provisioning, top 6 payer configuration, ops team training) | $X |
| Per-payer onboarding beyond initial 6 (research, IVR scripting, voice tuning, validation) | $X per payer |
| SSO/SAML integration (Microsoft Entra ID or Okta) | $X |
| Webhook subscriber endpoint validation and certification | Included |
| Bulk import schema mapping for Medusind canonical format | $X |
| In-tenant deployment (Helm chart customization, network integration, smoke testing) | $X |
| Custom report development | $X per report |
| Custom integration to PMS / EHR / clearinghouse | Quoted per system |

---

## 10. Pricing Effective Date and Review Cadence

- **Effective date:** the contract effective date or pilot start date, whichever is later
- **Review cadence:** annually on the contract anniversary; either party may propose adjustments with 90-day notice
- **Volume reconciliation:** monthly invoice with itemized breakdown by use case, payer, outcome, and tier
- **Audit rights:** Medusind may audit Cadence's billing meter once per contract year with 30-day notice; reasonable audit cost borne by Medusind unless material discrepancy (>2%) is found, in which case Cadence reimburses

All `$X` placeholders in this document are commercial values to be confirmed by Cadence Sales prior to RFP submission. Pricing is subject to change based on confirmed Medusind volume forecast (RFP §"Volume" lines 109–110), telephony option selection (Option A vs B), commitment level, and SLA tier.

[Medusind to confirm] currency (USD assumed), billing terms (Net 30 assumed), and payment method preference (ACH preferred).

---

**End of Pricing Model.**
