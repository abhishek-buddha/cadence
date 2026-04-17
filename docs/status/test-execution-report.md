# Test Execution Report — 2026-04-17

**Total cases:** 254
**Passed:** 232
**Failed:** 0
**Skipped:** 22
**Timed-out:** 0
**Interrupted:** 0

**Pass rate:** 91.3%

---

## By file

| File | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
| api\audit.spec.ts | 5 | 4 | 0 | 1 |
| api\auth.spec.ts | 10 | 10 | 0 | 0 |
| api\calls.spec.ts | 10 | 3 | 0 | 7 |
| api\cases.spec.ts | 10 | 10 | 0 | 0 |
| api\claims.spec.ts | 10 | 10 | 0 | 0 |
| api\payers.spec.ts | 5 | 5 | 0 | 0 |
| api\reports.spec.ts | 10 | 8 | 0 | 2 |
| api\sessions.spec.ts | 5 | 5 | 0 | 0 |
| api\webhooks.spec.ts | 5 | 5 | 0 | 0 |
| e2e\admin-pages\admin-render.spec.ts | 10 | 10 | 0 | 0 |
| e2e\api-keys\issue-revoke.spec.ts | 10 | 10 | 0 | 0 |
| e2e\audit\audit-log.spec.ts | 14 | 13 | 0 | 1 |
| e2e\claims\page-render.spec.ts | 10 | 10 | 0 | 0 |
| e2e\dashboard\dashboard.spec.ts | 10 | 10 | 0 | 0 |
| e2e\dental-ev\page-render.spec.ts | 25 | 25 | 0 | 0 |
| e2e\reports\page-render.spec.ts | 10 | 10 | 0 | 0 |
| e2e\sessions\page-render.spec.ts | 10 | 10 | 0 | 0 |
| e2e\users\rbac-matrix.spec.ts | 24 | 16 | 0 | 8 |
| e2e\webhooks\delivery.spec.ts | 10 | 7 | 0 | 3 |
| health\api-health.spec.ts | 15 | 15 | 0 | 0 |
| outcome-classifier\dental-classification.spec.ts | 10 | 10 | 0 | 0 |
| outcome-classifier\medical-classification.spec.ts | 15 | 15 | 0 | 0 |
| smoke\example.spec.ts | 1 | 1 | 0 | 0 |
| smoke\homepage.spec.ts | 10 | 10 | 0 | 0 |

## Failures (with error excerpt)

_None._

## Skipped (with rationale if available in title)

- **TC-API-AUD-005** (api\audit.spec.ts)
- **TC-API-CAL-001** (api\calls.spec.ts)
- **TC-API-CAL-002** (api\calls.spec.ts)
- **TC-API-CAL-003** (api\calls.spec.ts)
- **TC-API-CAL-005** (api\calls.spec.ts)
- **TC-API-CAL-006** (api\calls.spec.ts)
- **TC-API-CAL-007** (api\calls.spec.ts)
- **TC-API-CAL-010** (api\calls.spec.ts)
- **TC-API-RPT-007** (api\reports.spec.ts)
- **TC-API-RPT-008** (api\reports.spec.ts)
- **TC-SSO-AUD-006** (e2e\audit\audit-log.spec.ts)
- **TC-SSO-RBA-004** (e2e\users\rbac-matrix.spec.ts)
- **TC-SSO-RBA-006** (e2e\users\rbac-matrix.spec.ts)
- **TC-SSO-RBA-007** (e2e\users\rbac-matrix.spec.ts)
- **TC-SSO-RBA-010** (e2e\users\rbac-matrix.spec.ts)
- **TC-SSO-RBA-012** (e2e\users\rbac-matrix.spec.ts)
- **TC-SSO-RBA-013** (e2e\users\rbac-matrix.spec.ts)
- **TC-SSO-RBA-015** (e2e\users\rbac-matrix.spec.ts)
- **TC-SSO-RBA-017** (e2e\users\rbac-matrix.spec.ts)
- **TC-API-WH-012** (e2e\webhooks\delivery.spec.ts)
- **TC-API-WH-014** (e2e\webhooks\delivery.spec.ts)
- **TC-API-WH-015** (e2e\webhooks\delivery.spec.ts)

## Full results (TC-id ordered)

| TC ID | Title | Status | Duration ms |
|---|---|---|---|
| TC-ADM-001 | TC-ADM-001 — /audit loads & "Audit Log" heading visible | passed | 4475 |
| TC-ADM-002 | TC-ADM-002 — sidebar Audit Log entry present (admin role) | passed | 4203 |
| TC-ADM-003 | TC-ADM-003 — /users loads & "Users" heading visible | passed | 4495 |
| TC-ADM-004 | TC-ADM-004 — sidebar Users entry present (admin role) | passed | 4073 |
| TC-ADM-005 | TC-ADM-005 — /api-keys loads & references API keys | passed | 3265 |
| TC-ADM-006 | TC-ADM-006 — sidebar API Keys entry present (admin role) | passed | 2879 |
| TC-ADM-007 | TC-ADM-007 — /webhooks loads & "Webhooks" heading visible | passed | 3165 |
| TC-ADM-008 | TC-ADM-008 — sidebar Webhooks entry present (admin/manager role) | passed | 3723 |
| TC-ADM-009 | TC-ADM-009 — /transfers loads & references transfer destinations | passed | 3987 |
| TC-ADM-010 | TC-ADM-010 — sidebar Transfers entry present | passed | 2963 |
| TC-API-AUD-001 | TC-API-AUD-001 — GET /v1/audit-events with admin key → 200 + events array | passed | 608 |
| TC-API-AUD-002 | TC-API-AUD-002 — GET /v1/audit-events?action=create → filtered list, all events  | passed | 480 |
| TC-API-AUD-003 | TC-API-AUD-003 — pagination params (limit) honoured | passed | 594 |
| TC-API-AUD-004 | TC-API-AUD-004 — resourceType filter narrows results | passed | 706 |
| TC-API-AUD-005 | TC-API-AUD-005 — non-admin key → 403 with forbidden envelope | skipped | 5 |
| TC-API-AUTH-001 | TC-API-AUTH-001 — valid key → 200 | passed | 335 |
| TC-API-AUTH-002 | TC-API-AUTH-002 — missing Authorization header → 401 | passed | 243 |
| TC-API-AUTH-003 | TC-API-AUTH-003 — malformed Authorization "foo" → 401 | passed | 252 |
| TC-API-AUTH-004 | TC-API-AUTH-004 — wrong-prefix key → 401 | passed | 284 |
| TC-API-AUTH-005 | TC-API-AUTH-005 — empty bearer token → 401 | passed | 249 |
| TC-API-AUTH-006 | TC-API-AUTH-006 — SQL-injection-style key → 401, no crash | passed | 266 |
| TC-API-AUTH-007 | TC-API-AUTH-007 — non-admin key against /v1/audit-events → 401 or 403 | passed | 479 |
| TC-API-AUTH-008 | TC-API-AUTH-008 — large header value (10KB) → 401, not 500 | passed | 286 |
| TC-API-AUTH-009 | TC-API-AUTH-009 — unicode in key → 401 OR client rejects | passed | 16 |
| TC-API-AUTH-010 | TC-API-AUTH-010 — valid-key response body is valid JSON with expected shape | passed | 308 |
| TC-API-CAL-001 | TC-API-CAL-001 — GET /v1/calls/{id} for an existing call → 200 + transcript fiel | skipped | 643 |
| TC-API-CAL-002 | TC-API-CAL-002 — GET /v1/calls/{id}/transcript → 200 + correct shape | skipped | 652 |
| TC-API-CAL-003 | TC-API-CAL-003 — GET /v1/calls/{id}/result → 200 + result envelope | skipped | 670 |
| TC-API-CAL-004 | TC-API-CAL-004 — GET /v1/calls/{nonexistent-id} → 4xx or 500 | passed | 283 |
| TC-API-CAL-005 | TC-API-CAL-005 — Tenant isolation (single-tenant demo — placeholder skip) | skipped | 10 |
| TC-API-CAL-006 | TC-API-CAL-006 — POST /v1/calls/{id}/end is idempotent on a completed call (or 4 | skipped | 809 |
| TC-API-CAL-007 | TC-API-CAL-007 — GET /v1/calls/{id}/recording → 200 + signedUrl key | skipped | 638 |
| TC-API-CAL-008 | TC-API-CAL-008 — Unauthenticated /v1/calls/{anything} → 401 | passed | 261 |
| TC-API-CAL-009 | TC-API-CAL-009 — Transcript endpoint for nonexistent call → 4xx or 500 (backend  | passed | 300 |
| TC-API-CAL-010 | TC-API-CAL-010 — WS subscription for live transcript (not exercised here) | skipped | 1 |
| TC-API-CLM-001 | TC-API-CLM-001 — POST /v1/claim-cases with valid body → 201 + id | passed | 1018 |
| TC-API-CLM-002 | TC-API-CLM-002 — POST with missing required field → 400 + error envelope | passed | 958 |
| TC-API-CLM-003 | TC-API-CLM-003 — POST with invalid amount (string instead of number) → 400 | passed | 960 |
| TC-API-CLM-004 | TC-API-CLM-004 — GET /v1/claim-cases?limit=10 → 200 + array length ≤ 10 | passed | 321 |
| TC-API-CLM-005 | TC-API-CLM-005 — create then GET /v1/claim-cases/{id} returns matching fields | passed | 1262 |
| TC-API-CLM-006 | TC-API-CLM-006 — PATCH /v1/claim-cases/{id} status → 200 | passed | 814 |
| TC-API-CLM-007 | TC-API-CLM-007 — PATCH with non-allowlisted status string is currently accepted  | passed | 673 |
| TC-API-CLM-008 | TC-API-CLM-008 — DELETE /v1/claim-cases/{id} → 200 success envelope | passed | 461 |
| TC-API-CLM-009 | TC-API-CLM-009 — GET /v1/claim-cases/{deleted-id} → 404 | passed | 308 |
| TC-API-CLM-010 | TC-API-CLM-010 — POST without claimNumber → 400 (claimNumber is required, no aut | passed | 1014 |
| TC-API-EV-001 | TC-API-EV-001 — POST /v1/eligibility-cases with valid body → 201 + id | passed | 988 |
| TC-API-EV-002 | TC-API-EV-002 — GET /v1/eligibility-cases → 200 + cases array | passed | 335 |
| TC-API-EV-003 | TC-API-EV-003 — create + GET /v1/eligibility-cases/{id} returns matching fields | passed | 1251 |
| TC-API-EV-004 | TC-API-EV-004 — PATCH /v1/eligibility-cases/{id} → 200 | passed | 337 |
| TC-API-EV-005 | TC-API-EV-005 — PATCH with invalid transition (state-machine enforcement deferre | passed | 358 |
| TC-API-EV-006 | TC-API-EV-006 — DELETE /v1/eligibility-cases/{id} → 200 success | passed | 355 |
| TC-API-EV-007 | TC-API-EV-007 — GET /v1/eligibility-cases/{deleted-id} → 404 | passed | 299 |
| TC-API-EV-008 | TC-API-EV-008 — POST without cdtCodes → 400 | passed | 950 |
| TC-API-EV-009 | TC-API-EV-009 — POST with empty cdtCodes array — currently allowed by backend (d | passed | 1066 |
| TC-API-EV-010 | TC-API-EV-010 — POST without proposedDateOfService → 400 | passed | 940 |
| TC-API-KEY-001 | TC-API-KEY-001 — issue returns prefix + fullKey | passed | 6310 |
| TC-API-KEY-002 | TC-API-KEY-002 — fullKey prefix is exactly 12 chars starting with "cad_" | passed | 6362 |
| TC-API-KEY-003 | TC-API-KEY-003 — list includes the newly issued key (by id + prefix) | passed | 9651 |
| TC-API-KEY-004 | TC-API-KEY-004 — list does NOT expose the hashed key or full key | passed | 9897 |
| TC-API-KEY-005 | TC-API-KEY-005 — newly issued key authenticates a real request (200 on /v1/payer | passed | 8041 |
| TC-API-KEY-006 | TC-API-KEY-006 — revoke sets status=revoked + revokedAt timestamp | passed | 11361 |
| TC-API-KEY-007 | TC-API-KEY-007 — revoked key returns 401 on subsequent requests | passed | 8468 |
| TC-API-KEY-008 | TC-API-KEY-008 — invalid scope name rejected at issuance | passed | 4064 |
| TC-API-KEY-009 | TC-API-KEY-009 — lastUsedAt updates after a successful authenticated request | passed | 16439 |
| TC-API-KEY-010 | TC-API-KEY-010 — fullKey is not re-revealed by any read endpoint | passed | 16097 |
| TC-API-PAY-001 | TC-API-PAY-001 — list payers, count > 0 | passed | 326 |
| TC-API-PAY-002 | TC-API-PAY-002 — payer object has expected fields | passed | 310 |
| TC-API-PAY-003 | TC-API-PAY-003 — bogus payerId path returns 404 from generic router OR a defined | passed | 255 |
| TC-API-PAY-004 | TC-API-PAY-004 — array shape stable (pagination not implemented for v1; returns  | passed | 645 |
| TC-API-PAY-005 | TC-API-PAY-005 — Content-Type: application/json | passed | 354 |
| TC-API-RPT-001 | TC-API-RPT-001 — GET /v1/reports/success-rate → 200 + numeric fields | passed | 318 |
| TC-API-RPT-002 | TC-API-RPT-002 — fromDate/toDate filter accepted (range that excludes everything | passed | 311 |
| TC-API-RPT-003 | TC-API-RPT-003 — payerId filter accepted (returns subset of all) | passed | 960 |
| TC-API-RPT-004 | TC-API-RPT-004 — useCase=medical_claim filter narrows results | passed | 633 |
| TC-API-RPT-005 | TC-API-RPT-005 — /v1/reports/turnaround-time → 200 + percentile fields | passed | 296 |
| TC-API-RPT-006 | TC-API-RPT-006 — /v1/reports/exceptions → 200 + array or object | passed | 340 |
| TC-API-RPT-007 | TC-API-RPT-007 — /v1/reports/success-rate-by-payer (if exposed) → 200 + array | skipped | 258 |
| TC-API-RPT-008 | TC-API-RPT-008 — /v1/reports/success-rate-by-week (if exposed) → 200 | skipped | 241 |
| TC-API-RPT-009 | TC-API-RPT-009 — non-existent report path → 404 | passed | 259 |
| TC-API-RPT-010 | TC-API-RPT-010 — success-rate response shape stable across calls | passed | 763 |
| TC-API-SES-001 | TC-API-SES-001 — POST /v1/sessions with valid body → 201 + id | passed | 724 |
| TC-API-SES-002 | TC-API-SES-002 — GET /v1/sessions → 200 + sessions array | passed | 342 |
| TC-API-SES-003 | TC-API-SES-003 — GET /v1/sessions/{id} for a freshly created session → 200 | passed | 971 |
| TC-API-SES-004 | TC-API-SES-004 — POST with mismatched payer items → 400 | passed | 634 |
| TC-API-SES-005 | TC-API-SES-005 — POST with > 5 itemRefs → 400 | passed | 683 |
| TC-API-WH-001 | TC-API-WH-001 — POST /v1/webhooks {url, events} → 201 + id | passed | 393 |
| TC-API-WH-002 | TC-API-WH-002 — GET /v1/webhooks → array contains the new subscription | passed | 568 |
| TC-API-WH-003 | TC-API-WH-003 — POST /v1/webhooks/{id}/test returns within 5s | passed | 496 |
| TC-API-WH-004 | TC-API-WH-004 — DELETE /v1/webhooks/{id} → 200 success envelope | passed | 350 |
| TC-API-WH-005 | TC-API-WH-005 — POST /v1/webhooks with non-https URL → 400 | passed | 303 |
| TC-API-WH-006 | TC-API-WH-006 — testFire delivered to subscriber within 30s | passed | 2499 |
| TC-API-WH-007 | TC-API-WH-007 — X-Cadence-Signature header present on delivered request | passed | 1873 |
| TC-API-WH-008 | TC-API-WH-008 — X-Cadence-Event header matches the event type ("test") | passed | 1954 |
| TC-API-WH-009 | TC-API-WH-009 — payload is valid JSON with event/timestamp/payload fields | passed | 1870 |
| TC-API-WH-010 | TC-API-WH-010 — multiple sequential testFires each deliver as separate requests | passed | 2970 |
| TC-API-WH-011 | TC-API-WH-011 — non-https URL rejected at subscription time (400) | passed | 298 |
| TC-API-WH-012 | TC-API-WH-012 — paused subscription does not deliver | skipped | 4125 |
| TC-API-WH-013 | TC-API-WH-013 — DELETE subscription stops further deliveries | passed | 11506 |
| TC-API-WH-014 | TC-API-WH-014 — retry on 5xx (requires receiver to reply 500) [skipped — webhook | skipped | 0 |
| TC-API-WH-015 | TC-API-WH-015 — dead-letter after 9 attempts (RETRY_BACKOFF_SECONDS exhausted) [ | skipped | 0 |
| TC-CLM-UI-001 | TC-CLM-UI-001 — sidebar Claims link navigates to /claims | passed | 3021 |
| TC-CLM-UI-002 | TC-CLM-UI-002 — page heading "Claims" visible | passed | 3675 |
| TC-CLM-UI-003 | TC-CLM-UI-003 — table headers Claim #, CPT Code, Insurance, Amount, Status, Late | passed | 4278 |
| TC-CLM-UI-004 | TC-CLM-UI-004 — empty-state OR rows render based on claim count | passed | 3731 |
| TC-CLM-UI-005 | TC-CLM-UI-005 — status filter dropdown visible (contains "All Statuses") | passed | 3768 |
| TC-CLM-UI-006 | TC-CLM-UI-006 — search input visible with claims placeholder | passed | 3100 |
| TC-CLM-UI-007 | TC-CLM-UI-007 — "Add Claim" button visible | passed | 3181 |
| TC-CLM-UI-008 | TC-CLM-UI-008 — "Upload Claims" button visible | passed | 3117 |
| TC-CLM-UI-009 | TC-CLM-UI-009 — clicking a row navigates to /claims/:id (if any rows exist) | passed | 4199 |
| TC-CLM-UI-010 | TC-CLM-UI-010 — zero console errors on /claims load | passed | 3539 |
| TC-DASH-001 | TC-DASH-001 — / loads & "Dashboard" heading visible | passed | 3546 |
| TC-DASH-002 | TC-DASH-002 — Total Claims KPI shows numeric value (>= 0) | passed | 3974 |
| TC-DASH-003 | TC-DASH-003 — Pending Follow-up KPI visible | passed | 4748 |
| TC-DASH-004 | TC-DASH-004 — Calls Today KPI visible | passed | 5306 |
| TC-DASH-005 | TC-DASH-005 — Success Rate KPI visible | passed | 6392 |
| TC-DASH-006 | TC-DASH-006 — Total Billed KPI visible | passed | 4527 |
| TC-DASH-007 | TC-DASH-007 — Recovered KPI visible | passed | 4640 |
| TC-DASH-008 | TC-DASH-008 — Aging Buckets section visible | passed | 5327 |
| TC-DASH-009 | TC-DASH-009 — Outcome Distribution widget visible (NEW) | passed | 3576 |
| TC-DASH-010 | TC-DASH-010 — zero console errors on dashboard load | passed | 3985 |
| TC-DENTAL-UI-001 | TC-DENTAL-UI-001 — sidebar shows Eligibility link | passed | 2830 |
| TC-DENTAL-UI-002 | TC-DENTAL-UI-002 — clicking sidebar Eligibility navigates to /eligibility | passed | 2936 |
| TC-DENTAL-UI-003 | TC-DENTAL-UI-003 — page heading "Dental Eligibility" visible | passed | 3893 |
| TC-DENTAL-UI-004 | TC-DENTAL-UI-004 — "Add Case" button visible | passed | 4146 |
| TC-DENTAL-UI-005 | TC-DENTAL-UI-005 — "Import Cases" button visible | passed | 3487 |
| TC-DENTAL-UI-006 | TC-DENTAL-UI-006 — status filter dropdown visible (contains "All Statuses") | passed | 3289 |
| TC-DENTAL-UI-007 | TC-DENTAL-UI-007 — payer filter dropdown visible (contains "All Payers") | passed | 4077 |
| TC-DENTAL-UI-008 | TC-DENTAL-UI-008 — DOS date range filter (2 date inputs) visible | passed | 4030 |
| TC-DENTAL-UI-009 | TC-DENTAL-UI-009 — search input visible with placeholder | passed | 3308 |
| TC-DENTAL-UI-010 | TC-DENTAL-UI-010 — table headers Case#, Patient, Payer, Plan, CDT Codes, DOS, St | passed | 3359 |
| TC-DENTAL-UI-011 | TC-DENTAL-UI-011 — empty-state OR table rows render based on case count | passed | 4349 |
| TC-DENTAL-UI-012 | TC-DENTAL-UI-012 — clicking "Add Case" opens modal | passed | 4502 |
| TC-DENTAL-UI-013 | TC-DENTAL-UI-013 — Add Case modal exposes form fields (patient, plan, insurance, | passed | 4361 |
| TC-DENTAL-UI-014 | TC-DENTAL-UI-014 — Add Case modal closes via Escape key | passed | 3899 |
| TC-DENTAL-UI-015 | TC-DENTAL-UI-015 — Add Case modal validates required fields on submit | passed | 4365 |
| TC-DENTAL-UI-016 | TC-DENTAL-UI-016 — clicking "Import Cases" opens import modal | passed | 4687 |
| TC-DENTAL-UI-017 | TC-DENTAL-UI-017 — import modal accepts a file via dropzone or file input | passed | 4472 |
| TC-DENTAL-UI-018 | TC-DENTAL-UI-018 — selecting a status filter does not crash & filter sticks | passed | 3504 |
| TC-DENTAL-UI-019 | TC-DENTAL-UI-019 — selecting a payer filter does not crash & filter sticks | passed | 3527 |
| TC-DENTAL-UI-020 | TC-DENTAL-UI-020 — search box accepts text without crashing | passed | 3501 |
| TC-DENTAL-UI-021 | TC-DENTAL-UI-021 — zero console errors on initial /eligibility load | passed | 3634 |
| TC-DENTAL-UI-022 | TC-DENTAL-UI-022 — browser back/forward navigation between / and /eligibility wo | passed | 4586 |
| TC-DENTAL-UI-023 | TC-DENTAL-UI-023 — page survives refresh (PIN auth persists in session, still on | passed | 4507 |
| TC-DENTAL-UI-024 | TC-DENTAL-UI-024 — sidebar Eligibility entry has active style on this page | passed | 4125 |
| TC-DENTAL-UI-025 | TC-DENTAL-UI-025 — footer/version v0.1.0 still visible from sidebar | passed | 3154 |
| TC-HLTH-001 | TC-HLTH-001 — GET /v1/health → 200 + status:"healthy" | passed | 288 |
| TC-HLTH-002 | TC-HLTH-002 — GET /v1/version → 200 + version field | passed | 235 |
| TC-HLTH-003 | TC-HLTH-003 — /v1/health response time < 1500ms | passed | 264 |
| TC-HLTH-004 | TC-HLTH-004 — /v1/version response time < 1500ms | passed | 245 |
| TC-HLTH-005 | TC-HLTH-005 — /v1/openapi.json response time < 1500ms | passed | 260 |
| TC-HLTH-006 | TC-HLTH-006 — GET /v1/health responds without Authorization header | passed | 268 |
| TC-HLTH-007 | TC-HLTH-007 — GET /v1/payers WITHOUT auth → 401 | passed | 257 |
| TC-HLTH-008 | TC-HLTH-008 — GET /v1/payers WITH valid key → 200 + array | passed | 332 |
| TC-HLTH-009 | TC-HLTH-009 — HTTPS enforced (HTTP redirects) | passed | 502 |
| TC-HLTH-010 | TC-HLTH-010 — frontend `/` LCP-ish loads in < 5s | passed | 1363 |
| TC-HLTH-011 | TC-HLTH-011 — TLS cert valid (no browser TLS errors on /) | passed | 1863 |
| TC-HLTH-012 | TC-HLTH-012 — GET / returns HTML containing <title>Cadence | passed | 292 |
| TC-HLTH-013 | TC-HLTH-013 — static assets cached (Cache-Control on /assets/*) | passed | 2295 |
| TC-HLTH-014 | TC-HLTH-014 — GET /v1/openapi.json → 200 + openapi field | passed | 250 |
| TC-HLTH-015 | TC-HLTH-015 — Convex Cloud URL reachable (sanity) | passed | 272 |
| TC-OUT-CLS-001 | TC-OUT-CLS-001 — medical-paid-full fixture → successful, all 6 fields retrieved | passed | 2 |
| TC-OUT-CLS-002 | TC-OUT-CLS-002 — medical-denied-co45 fixture → successful, all denied fields | passed | 2 |
| TC-OUT-CLS-003 | TC-OUT-CLS-003 — medical-pending fixture → successful, all pending fields | passed | 1 |
| TC-OUT-CLS-004 | TC-OUT-CLS-004 — medical-partial fixture (paid status, missing payment fields) → | passed | 2 |
| TC-OUT-CLS-005 | TC-OUT-CLS-005 — medical-voicemail fixture → failed (call status short-circuit) | passed | 2 |
| TC-OUT-CLS-006 | TC-OUT-CLS-006 — paid call missing checkOrEftNumber → partial | passed | 1 |
| TC-OUT-CLS-007 | TC-OUT-CLS-007 — paid call missing paidDate → partial | passed | 1 |
| TC-OUT-CLS-008 | TC-OUT-CLS-008 — denied call missing appealDeadline → partial | passed | 1 |
| TC-OUT-CLS-009 | TC-OUT-CLS-009 — status="voicemail" with fully populated callResult → failed (sh | passed | 1 |
| TC-OUT-CLS-010 | TC-OUT-CLS-010 — status="no_answer" → failed (short-circuit, no required-field e | passed | 1 |
| TC-OUT-CLS-011 | TC-OUT-CLS-011 — status="ivr_only" → failed (call never reached a rep) | passed | 1 |
| TC-OUT-CLS-012 | TC-OUT-CLS-012 — status="error" → failed | passed | 1 |
| TC-OUT-CLS-013 | TC-OUT-CLS-013 — status="busy" → failed | passed | 1 |
| TC-OUT-CLS-014 | TC-OUT-CLS-014 — unknown claimStatus value → graceful partial classification, no | passed | 1 |
| TC-OUT-CLS-015 | TC-OUT-CLS-015 — null callResult (no body returned) → failed gracefully, no cras | passed | 2 |
| TC-OUT-CLS-D-001 | TC-OUT-CLS-D-001 — dental-active fixture → successful, all base + ifActive field | passed | 3 |
| TC-OUT-CLS-D-002 | TC-OUT-CLS-D-002 — dental-inactive fixture → successful (only 3 base fields requ | passed | 2 |
| TC-OUT-CLS-D-003 | TC-OUT-CLS-D-003 — dental-partial fixture (isActive but missing several coverage | passed | 1 |
| TC-OUT-CLS-D-004 | TC-OUT-CLS-D-004 — active EV missing deductibleAnnualCents → partial | passed | 1 |
| TC-OUT-CLS-D-005 | TC-OUT-CLS-D-005 — active EV missing deductibleMetCents → partial | passed | 1 |
| TC-OUT-CLS-D-006 | TC-OUT-CLS-D-006 — active EV missing annualMaximumCents → partial | passed | 1 |
| TC-OUT-CLS-D-007 | TC-OUT-CLS-D-007 — active EV missing annualMaxRemainingCents → partial | passed | 1 |
| TC-OUT-CLS-D-008 | TC-OUT-CLS-D-008 — active EV missing networkStatus → partial | passed | 1 |
| TC-OUT-CLS-D-009 | TC-OUT-CLS-D-009 — active EV missing coinsurancePct → partial | passed | 1 |
| TC-OUT-CLS-D-010 | TC-OUT-CLS-D-010 — call short-circuit (voicemail) on a dental EV → failed | passed | 1 |
| TC-RPT-UI-001 | TC-RPT-UI-001 — sidebar Reports link navigates to /reports | passed | 3535 |
| TC-RPT-UI-002 | TC-RPT-UI-002 — five tabs visible (Success Rate, Data Accuracy, Turnaround Time, | passed | 3319 |
| TC-RPT-UI-003 | TC-RPT-UI-003 — clicking Data Accuracy tab updates content | passed | 4493 |
| TC-RPT-UI-004 | TC-RPT-UI-004 — clicking Turnaround Time tab updates content | passed | 5164 |
| TC-RPT-UI-005 | TC-RPT-UI-005 — clicking Exception Report tab updates content | passed | 4617 |
| TC-RPT-UI-006 | TC-RPT-UI-006 — clicking Volume by Tier tab updates content | passed | 4468 |
| TC-RPT-UI-007 | TC-RPT-UI-007 — clicking back to Success Rate tab restores content | passed | 5183 |
| TC-RPT-UI-008 | TC-RPT-UI-008 — filter bar visible (date range, payer select, useCase select) | passed | 3240 |
| TC-RPT-UI-009 | TC-RPT-UI-009 — at least one "Export CSV" button visible (per active tab) | passed | 4197 |
| TC-RPT-UI-010 | TC-RPT-UI-010 — zero console errors on /reports load | passed | 3477 |
| TC-SESS-UI-001 | TC-SESS-UI-001 — sidebar Sessions link visible & clicking navigates to /sessions | passed | 3078 |
| TC-SESS-UI-002 | TC-SESS-UI-002 — page heading "Sessions" visible | passed | 3176 |
| TC-SESS-UI-003 | TC-SESS-UI-003 — "New Session" button visible | passed | 3438 |
| TC-SESS-UI-004 | TC-SESS-UI-004 — table headers Session #, Payer, Use Case, Items, Status, Aggreg | passed | 4519 |
| TC-SESS-UI-005 | TC-SESS-UI-005 — empty-state OR rows render based on session count | passed | 3831 |
| TC-SESS-UI-006 | TC-SESS-UI-006 — clicking "New Session" opens wizard modal | passed | 4625 |
| TC-SESS-UI-007 | TC-SESS-UI-007 — wizard modal shows step indicator (Payer/Items/Confirm) | passed | 4008 |
| TC-SESS-UI-008 | TC-SESS-UI-008 — wizard exposes use-case choices (Claim Follow-up, Dental EV) | passed | 3977 |
| TC-SESS-UI-009 | TC-SESS-UI-009 — page survives refresh & remains on /sessions | passed | 3671 |
| TC-SESS-UI-010 | TC-SESS-UI-010 — zero console errors on /sessions load | passed | 3554 |
| TC-SMK-001 | TC-SMK-001 — home `/` loads, title contains "Cadence", no console errors | passed | 1841 |
| TC-SMK-002 | TC-SMK-002 — PIN page reachable, 6 inputs visible, Continue button initially dis | passed | 1778 |
| TC-SMK-003 | TC-SMK-003 — successful PIN login routes to dashboard URL | passed | 2507 |
| TC-SMK-004 | TC-SMK-004 — sidebar shows existing nav AND new entries (Eligibility, Sessions) | passed | 2903 |
| TC-SMK-005 | TC-SMK-005 — dashboard renders KPI cards (Total Claims, Pending, Calls Today) | passed | 2831 |
| TC-SMK-006 | TC-SMK-006 — /claims loads, table renders ≥1 row | passed | 3391 |
| TC-SMK-007 | TC-SMK-007 — /eligibility loads, "Dental Eligibility" heading present | passed | 3072 |
| TC-SMK-008 | TC-SMK-008 — /sessions loads | passed | 2908 |
| TC-SMK-009 | TC-SMK-009 — /settings loads, API status displayed | passed | 3118 |
| TC-SMK-010 | TC-SMK-010 — PIN cleared on hard reload (session-only auth) | passed | 2926 |
| TC-SMK-EXAMPLE | TC-SMK-EXAMPLE — homepage reachable | passed | 1361 |
| TC-SSO-AUD-001 | TC-SSO-AUD-001 — query audit log returns events array | passed | 461 |
| TC-SSO-AUD-002 | TC-SSO-AUD-002 — every audit event has timestamp, action, resourceType | passed | 561 |
| TC-SSO-AUD-003 | TC-SSO-AUD-003 — filter by action=create returns only create events | passed | 382 |
| TC-SSO-AUD-004 | TC-SSO-AUD-004 — filter by resourceType="claim" returns only claim events | passed | 383 |
| TC-SSO-AUD-005 | TC-SSO-AUD-005 — filter by date range (last 24h) narrows results | passed | 3113 |
| TC-SSO-AUD-006 | TC-SSO-AUD-006 — phiAccessed flag captured on patient-data reads (where set) | skipped | 3087 |
| TC-SSO-AUD-007 | TC-SSO-AUD-007 — phiAccessed flag is false/undefined on health-check reads | passed | 3136 |
| TC-SSO-AUD-008 | TC-SSO-AUD-008 — audit log query is reachable and does not error | passed | 502 |
| TC-SSO-AUD-009 | TC-SSO-AUD-009 — audit count > 0 (system has been seeded + used) | passed | 462 |
| TC-SSO-AUD-010 | TC-SSO-AUD-010 — latest audit event timestamp within last hour (system actively  | passed | 795 |
| TC-SSO-AUD-011 | TC-SSO-AUD-011 — userId/userEmail/userRole captured when set by caller | passed | 3517 |
| TC-SSO-AUD-012 | TC-SSO-AUD-012 — resourceId stored on resource-scoped events | passed | 3243 |
| TC-SSO-AUD-013 | TC-SSO-AUD-013 — audit log is append-only (no public update mutation exists) | passed | 4021 |
| TC-SSO-AUD-014 | TC-SSO-AUD-014 — exportCsv action returns CSV string with header row | passed | 3514 |
| TC-SSO-RBA-001 | TC-SSO-RBA-001 — admin scope → GET /v1/audit-events 200 | passed | 6905 |
| TC-SSO-RBA-002 | TC-SSO-RBA-002 — claims:read (non-admin) → GET /v1/audit-events 403 | passed | 6455 |
| TC-SSO-RBA-003 | TC-SSO-RBA-003 — claims:read scope → GET /v1/claim-cases 200 | passed | 7586 |
| TC-SSO-RBA-004 | TC-SSO-RBA-004 — claims:read scope → POST /v1/claim-cases 403 [scope enforcement | skipped | 6 |
| TC-SSO-RBA-005 | TC-SSO-RBA-005 — claims:write scope → POST /v1/claim-cases 201 (or 400 on valida | passed | 5796 |
| TC-SSO-RBA-006 | TC-SSO-RBA-006 — claims:write scope → DELETE /v1/claim-cases/{id} 200/404 [scope | skipped | 3 |
| TC-SSO-RBA-007 | TC-SSO-RBA-007 — calls:read scope → POST /v1/claim-cases 403 [scope enforcement  | skipped | 2 |
| TC-SSO-RBA-008 | TC-SSO-RBA-008 — no scope (empty array) → GET /v1/claim-cases 200 (auth-only che | passed | 5661 |
| TC-SSO-RBA-009 | TC-SSO-RBA-009 — cases:read scope → GET /v1/eligibility-cases 200 | passed | 5609 |
| TC-SSO-RBA-010 | TC-SSO-RBA-010 — cases:read scope → POST /v1/eligibility-cases 403 [scope enforc | skipped | 4 |
| TC-SSO-RBA-011 | TC-SSO-RBA-011 — cases:write scope → POST /v1/eligibility-cases 201 (or 400 vali | passed | 5613 |
| TC-SSO-RBA-012 | TC-SSO-RBA-012 — cases:write scope → DELETE /v1/eligibility-cases/{id} [scope en | skipped | 5 |
| TC-SSO-RBA-013 | TC-SSO-RBA-013 — claims:read → GET /v1/eligibility-cases 403 (cross-resource) [s | skipped | 3 |
| TC-SSO-RBA-014 | TC-SSO-RBA-014 — calls:read scope → GET /v1/calls/{id} returns 200/404 (auth ok) | passed | 5687 |
| TC-SSO-RBA-015 | TC-SSO-RBA-015 — claims:read → GET /v1/calls/{id}/transcript 403 (cross-resource | skipped | 5 |
| TC-SSO-RBA-016 | TC-SSO-RBA-016 — calls:read scope → GET /v1/calls/{id}/result 200/4xx/500 | passed | 5574 |
| TC-SSO-RBA-017 | TC-SSO-RBA-017 — calls:read scope → POST /v1/calls/{id}/end 403 [scope enforceme | skipped | 5 |
| TC-SSO-RBA-018 | TC-SSO-RBA-018 — calls:write scope → POST /v1/calls/{id}/end 200/400/404 (auth o | passed | 5542 |
| TC-SSO-RBA-019 | TC-SSO-RBA-019 — admin scope → GET /v1/claim-cases 200 (admin == superset) | passed | 5787 |
| TC-SSO-RBA-020 | TC-SSO-RBA-020 — admin scope → POST /v1/eligibility-cases (or 400) | passed | 5529 |
| TC-SSO-RBA-021 | TC-SSO-RBA-021 — multi-scope key (claims:read + cases:read) → both endpoints 200 | passed | 5851 |
| TC-SSO-RBA-022 | TC-SSO-RBA-022 — invalid scope name rejected at issue time | passed | 2689 |
| TC-SSO-RBA-023 | TC-SSO-RBA-023 — revoked key returns 401 regardless of original scope | passed | 5500 |
| TC-SSO-RBA-024 | TC-SSO-RBA-024 — no Authorization header → 401 on every protected endpoint | passed | 1000 |
