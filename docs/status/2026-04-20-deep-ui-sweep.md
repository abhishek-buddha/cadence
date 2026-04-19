# Deep UI Sweep — Cadence prod — 2026-04-20

**Summary:** 45 PASS / 0 FAIL / 0 SKIPPED across 16 sections.

URL: https://cadence-new.onrender.com
Harness: `scripts/overnight/deep-ui-sweep.mjs`

## Dashboard /

| Check | Status | Detail |
|---|---|---|
| Outcome distribution categories present | PASS | 4 outcome keywords found |
| Aging buckets visible | PASS | aging ranges seen |
| Recent calls ≥5 entries | PASS | CLMrefs=5 |
| All 6 KPI card labels present | PASS | kpis=6/6 |

## Claims /claims

| Check | Status | Detail |
|---|---|---|
| Claims rows present | PASS | rows=40 |
| Headers include claim/status/amount | PASS | \|claim #\|cpt code\|insurance\|amount\|status\|latest update |
| Status filter dropdown narrows list | PASS | changed to Denied |
| Row click navigates to detail | PASS | url=https://cadence-new.onrender.com/claims/jd73968gbqmp9fd2f8697rzbcs851d3k |
| Detail shows Call Insurance button | PASS |  |
| Add Claim modal opens | PASS | opened |
| Upload Claims UI opens | PASS | opened |

## Patients /patients

| Check | Status | Detail |
|---|---|---|
| Page loads | PASS |  |
| Patient rows present | PASS | rows=9 |

## Insurance /insurance

| Check | Status | Detail |
|---|---|---|
| ≥4 payers visible | PASS | found=aetna,bcbs,acme |

## Providers /providers

| Check | Status | Detail |
|---|---|---|
| Provider list renders | PASS | rows=5 |

## Call History /calls

| Check | Status | Detail |
|---|---|---|
| Page loads with outcome column | PASS |  |
| Call rows present | PASS | claimRefs=50 showing=50 |
| Outcome filter options visible | PASS |  |

## Eligibility /eligibility

| Check | Status | Detail |
|---|---|---|
| Page loads | PASS |  |
| Add Case modal opens | PASS |  |
| Import Cases UI opens | PASS |  |

## Sessions /sessions

| Check | Status | Detail |
|---|---|---|
| New Session wizard opens | PASS |  |

## Reports /reports

| Check | Status | Detail |
|---|---|---|
| 5 report tabs present | PASS | found=success rate\|data accuracy\|turnaround\|exception\|volume |
| Tab clickable: Data Accuracy | PASS |  |
| Tab clickable: Turnaround | PASS |  |
| Tab clickable: Exception | PASS |  |
| Tab clickable: Volume | PASS |  |
| SVG charts render | PASS | svgs=28 |
| Export CSV control present | PASS |  |

## Transfers /transfers

| Check | Status | Detail |
|---|---|---|
| Seeded destinations visible | PASS | seen |
| Add Destination form opens | PASS |  |

## Audit /audit

| Check | Status | Detail |
|---|---|---|
| Audit rows present | PASS | rows=50 |
| Export CSV control present | PASS |  |

## Users /users

| Check | Status | Detail |
|---|---|---|
| 3 roles present | PASS | found=admin,manager,viewer |
| Invite User control present | PASS |  |

## API Keys /api-keys

| Check | Status | Detail |
|---|---|---|
| Page loads | PASS |  |
| Issue New Key flow shows full key once | PASS | prefix cad_4fa58f... |

## Webhooks /webhooks

| Check | Status | Detail |
|---|---|---|
| Page loads | PASS |  |
| Add Subscription form opens | PASS |  |

## Settings /settings

| Check | Status | Detail |
|---|---|---|
| Page loads without crash | PASS | len=999 |

## Cross-cutting

| Check | Status | Detail |
|---|---|---|
| Zero failed same-origin requests on Dashboard | PASS | failed=0 |
| Mobile 375px no horizontal scroll | PASS | ok |
| Refresh on sub-route stays on sub-route | PASS | url=https://cadence-new.onrender.com/eligibility |
| Browser back works | PASS | url=https://cadence-new.onrender.com/claims |
| Console errors across run | PASS | errors=0 |

