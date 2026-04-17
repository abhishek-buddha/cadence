# Cadence — Integration & Data Requirements

**Document:** Integration and Data Requirements
**Version:** 1.0
**Date:** 2026-04-17
**Prepared for:** Medusind LLC
**Prepared by:** Cadence (Algonox)
**Classification:** Confidential — RFP Response Artifact

---

## 1. Integration Overview

Cadence exposes three interoperability surfaces, designed to fit existing Medusind workflows without forcing system replacement:

1. **REST API (synchronous)** — primary integration surface for case submission, status retrieval, transcript and recording access, and administrative operations. Documented in machine-readable form via OpenAPI 3.1 (`openapi.yaml`).
2. **Webhooks (asynchronous)** — event-driven push of call lifecycle and outcome events to subscriber endpoints, signed with HMAC-SHA-256 and delivered with exponential-backoff retry.
3. **Bulk import (batch)** — Excel and CSV file ingestion for high-volume case loading, with AI-assisted column mapping for source files that do not match the canonical schema.

All three surfaces share the same underlying data model, authorization rules, audit logging, and outcome classification. A case submitted by API is indistinguishable downstream from a case loaded by bulk import.

---

## 2. Authentication

### 2.1 API Key Authentication (Default)

Every request to the Cadence REST API must carry an `Authorization` header bearing an opaque API key:

```
Authorization: Bearer ck_live_<32-char base32 secret>
```

API keys are issued per tenant from the Cadence Admin console. Each key is scoped (read, write, admin), rate-limited per minute, optionally IP-restricted, and tracked with a `lastUsedAt` timestamp for audit and revocation review.

Keys are stored at rest as a `bcrypt` hash; the plaintext value is shown to the user exactly once at creation. Rotation is supported by issuing a new key, deploying it to consumers, then revoking the old key — both keys remain valid during the overlap window.

### 2.2 OAuth 2.0 Client Credentials (Future)

For machine-to-machine integrations that prefer short-lived bearer tokens, Cadence exposes the OAuth 2.0 client_credentials grant at `/oauth/token`. A client exchanges its `client_id` and `client_secret` for a JWT access token with a 15-minute TTL and the same scope semantics as API keys.

This grant is part of the Phase 3 Enterprise Integration deliverable (target: pilot week 6) and is documented for forward compatibility; pilot integrations may use API keys.

### 2.3 Single Sign-On for Human Users

Human users access the Cadence web console through SAML 2.0 single sign-on. Two providers are supported out of the box:

- Microsoft Entra ID (Azure AD)
- Okta

Identity-provider–initiated and service-provider–initiated flows are both supported. Just-in-time user provisioning is enabled by default; SCIM 2.0 user lifecycle synchronization is available on request.

---

## 3. Authorization (RBAC)

Cadence enforces role-based access control across both the REST API and the web console. Four built-in roles ship by default; custom roles can be defined per tenant.

| Role | Read Cases | Write Cases | Initiate Calls | View Transcripts | View Recordings | Manage API Keys | Manage Users | View Audit Logs |
|---|---|---|---|---|---|---|---|---|
| Admin | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Manager | Yes | Yes | Yes | Yes | Yes | No | No | No |
| Operator | Yes | Yes (own) | Yes (own) | Yes | Yes | No | No | No |
| Viewer | Yes | No | No | Yes | No | No | No | No |

Permissions are enforced server-side on every endpoint. Forbidden operations return HTTP 403 with the `forbidden` error code; insufficient scope on an API key returns 403 with `insufficient_scope`. Every authorization decision is recorded to the audit log with the user identifier, requested resource, decision, and reason.

---

## 4. Required Input Data Per Use Case

### 4.1 Medical Claim Status Follow-Up

| Field | Type | Required | Notes |
|---|---|---|---|
| `patient.firstName` | string | Yes | Encrypted at field level |
| `patient.lastName` | string | Yes | Encrypted at field level |
| `patient.dateOfBirth` | date (ISO 8601) | Yes | Encrypted at field level |
| `patient.memberId` | string | Yes | Encrypted at field level |
| `patient.gender` | enum (M, F, X, U) | No | Required by some payers |
| `provider.name` | string | Yes | |
| `provider.npi` | string (10 digits) | Yes | |
| `provider.tin` | string (9 digits) | Yes | Encrypted at field level |
| `payer.id` | string | Yes | Cadence payer directory ID |
| `claim.claimNumber` | string | Yes | Payer-issued claim ID |
| `claim.dateOfService` | date | Yes | |
| `claim.billedAmount` | decimal | Yes | |
| `claim.cptCodes[]` | string[] | No | Improves rep search efficiency |
| `claim.icdCodes[]` | string[] | No | Improves rep search efficiency |
| `claim.placeOfService` | string | No | |
| `notes` | string | No | Free-form context for the agent |

### 4.2 Dental Eligibility Verification

| Field | Type | Required | Notes |
|---|---|---|---|
| `patient.firstName` | string | Yes | Encrypted at field level |
| `patient.lastName` | string | Yes | Encrypted at field level |
| `patient.dateOfBirth` | date | Yes | Encrypted at field level |
| `patient.memberId` | string | Yes | Encrypted at field level |
| `subscriber.firstName` | string | If subscriber ≠ patient | |
| `subscriber.lastName` | string | If subscriber ≠ patient | |
| `subscriber.dateOfBirth` | date | If subscriber ≠ patient | |
| `provider.name` | string | Yes | |
| `provider.npi` | string | Yes | |
| `provider.tin` | string | Yes | Encrypted at field level |
| `payer.id` | string | Yes | Cadence dental payer directory ID |
| `plan.planId` | string | Yes (most payers) | Plan or group identifier |
| `plan.groupNumber` | string | No | Required by some payers (Delta Dental) |
| `procedureCodes[]` | string[] (CDT) | Yes | E.g., `["D0150", "D1110", "D2330"]` |
| `proposedDateOfService` | date | Yes | |
| `notes` | string | No | Free-form context for the agent |

---

## 5. Output Data Shape Per Call

### 5.1 Envelope

Every call produces a uniform JSON envelope retrievable via `GET /v1/calls/{id}/result`:

```json
{
  "callId": "call_01HZX9...",
  "tenantId": "tnt_01HZ...",
  "useCase": "medical_claim_status",
  "caseId": "claim_01HZ...",
  "outcome": "successful",
  "outcomeReason": "all_required_fields_retrieved",
  "requiredFieldsRetrieved": ["claimStatus", "paidAmount", "denialCode", "appealStatus"],
  "missingFields": [],
  "startedAt": "2026-04-17T14:02:11Z",
  "endedAt": "2026-04-17T14:09:48Z",
  "durationSeconds": 457,
  "queuedAt": "2026-04-17T14:01:53Z",
  "connectedAt": "2026-04-17T14:02:34Z",
  "payer": { "id": "pay_aetna", "name": "Aetna", "phone": "+1-800-..." },
  "twilioCallSid": "CA...",
  "recordingUrl": "https://api.cadence.../v1/calls/call_01HZX9.../recording",
  "transcriptUrl": "https://api.cadence.../v1/calls/call_01HZX9.../transcript",
  "extractedData": {
    "claimStatus": "paid",
    "paidAmount": 1240.55,
    "paidDate": "2026-03-28",
    "checkOrEftNumber": "EFT778899",
    "denialCode": null,
    "denialReason": null,
    "appealStatus": null,
    "nextSteps": null
  },
  "repName": "Janet",
  "referenceNumber": "REF20260417-9921",
  "confidence": 0.94
}
```

### 5.2 Dental EV Output

The dental EV envelope substitutes `extractedData` with dental-specific fields:

```json
{
  "extractedData": {
    "isActive": true,
    "effectiveDate": "2026-01-01",
    "deductibleAnnual": 50.00,
    "deductibleMet": 0.00,
    "annualMaximum": 1500.00,
    "annualMaxRemaining": 1500.00,
    "coinsurancePctPreventive": 100,
    "coinsurancePctBasic": 80,
    "coinsurancePctMajor": 50,
    "copayAmount": 0,
    "networkStatus": "in_network",
    "waitingPeriods": [
      { "category": "major", "monthsRemaining": 0 }
    ],
    "frequencyLimits": [
      { "code": "D0150", "limit": "1 per 36 months", "lastDate": "2024-04-12" },
      { "code": "D1110", "limit": "2 per calendar year", "lastDate": "2025-10-04" }
    ],
    "missingTeethClause": false,
    "preAuthRequired": false
  }
}
```

---

## 6. Webhook Events

Cadence dispatches the following events to subscribed webhook endpoints. Payloads follow the same envelope shape as the corresponding REST resource.

| Event | Trigger | Payload Reference |
|---|---|---|
| `case.created` | New eligibility or claim case is created | `EligibilityCase` or `ClaimCase` |
| `case.updated` | Existing case is modified | `EligibilityCase` or `ClaimCase` |
| `case.deleted` | Case is soft-deleted | `{ id, deletedAt }` |
| `call.queued` | Call placed in outbound queue | `Call` |
| `call.initiated` | Twilio dial begun | `Call` |
| `call.connected` | Payer answered | `Call` |
| `call.transferred_to_human` | Bot initiated human transfer | `Call` + `transferReason` |
| `call.completed` | Call ended (any reason) | `Call` |
| `call.outcome_classified` | Outcome engine has classified the call | Full result envelope (Section 5) |
| `call.failed` | Call failed before reaching outcome classification | `Call` + `failureReason` |
| `recording.available` | Recording uploaded to storage | `{ callId, recordingUrl, durationSeconds }` |
| `webhook.test` | Manual test fire from console | `{ subscriptionId, timestamp }` |

### 6.1 Delivery Semantics

- POST to subscriber URL with `Content-Type: application/json`
- HMAC-SHA-256 signature in `X-Cadence-Signature` header (computed over raw body using subscription secret)
- Delivery considered successful on HTTP 2xx response within 30 seconds
- Retry policy: 8 attempts at 1m, 5m, 30m, 2h, 8h, 24h, 48h, 96h intervals
- After final attempt, event is moved to dead-letter queue and surfaced in the console for manual replay
- Subscribers must be idempotent — Cadence may send the same `eventId` more than once after recovery from network partitions

### 6.2 Subscription Management

Webhook subscriptions are managed through the REST API (`/v1/webhooks`) or web console. Each subscription declares the URL, the secret used for signing, the event types of interest, and the active status. Test fires are available via `POST /v1/webhooks/{id}/test`.

---

## 7. Bulk Import Format

### 7.1 Supported File Types

- Microsoft Excel `.xlsx` (preferred)
- Microsoft Excel `.xls` (legacy)
- Comma-separated values `.csv` (UTF-8 with BOM)
- Tab-separated values `.tsv`

Maximum file size: 25 MB per upload (approximately 100,000 rows). Larger files should be split or submitted via the streaming bulk endpoint.

### 7.2 Canonical Column Mapping

The bulk import accepts files with arbitrary column ordering and naming. An AI-assisted column mapper inspects the header row and the first 20 data rows to suggest mappings to the canonical schema; the operator reviews and confirms before ingestion proceeds.

Canonical columns for medical claim cases:

```
patient_first_name, patient_last_name, patient_dob, patient_member_id,
provider_npi, provider_tin, payer_name, claim_number,
date_of_service, billed_amount, cpt_codes, icd_codes, notes
```

Canonical columns for dental EV cases:

```
patient_first_name, patient_last_name, patient_dob, patient_member_id,
subscriber_first_name, subscriber_last_name, subscriber_dob,
provider_npi, provider_tin, payer_name, plan_id, group_number,
procedure_codes, proposed_date_of_service, notes
```

Validation errors are reported per row with the original row number, the offending column, and a human-readable reason. The import is transactional per file: either all valid rows commit, or none do (operator's choice at confirmation time).

---

## 8. Real-Time vs Batch Processing

Both modes are first-class. The choice depends on the upstream workflow:

- **Real-time (synchronous API)** is appropriate when an upstream system creates one case at a time, expects an immediate `case.created` confirmation, and subscribes to webhooks for outcome notification. Typical latency: case-creation → call-completion ~ 5–10 minutes for medical, 4–8 minutes for dental EV.
- **Batch (bulk import)** is appropriate when an upstream system produces a daily file of pending cases (e.g., a clearinghouse export of unresolved claims). Cadence ingests the file, places cases in the outbound queue at a controlled rate (respecting payer concurrency limits), and emits webhooks as outcomes are classified.

Both modes share the same outcome semantics, the same audit trail, and the same billing meter. There is no functional difference downstream — only an upstream ergonomic difference.

---

## 9. Error Envelope Specification

Every 4xx and 5xx response from the Cadence API uses a uniform error envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "patient.dateOfBirth is required",
    "field": "patient.dateOfBirth",
    "requestId": "req_01HZX9...",
    "documentation": "https://docs.cadence.com/errors/validation_error"
  }
}
```

Standard error codes:

| HTTP | Code | When |
|---|---|---|
| 400 | `validation_error` | Request body or query parameters did not pass schema validation |
| 401 | `unauthenticated` | Missing or invalid `Authorization` header |
| 403 | `forbidden` | Authenticated but lacks permission |
| 403 | `insufficient_scope` | API key does not have the required scope |
| 404 | `not_found` | Resource does not exist or is outside the tenant scope |
| 409 | `conflict` | Concurrency conflict (e.g., status transition not allowed) |
| 422 | `unprocessable_entity` | Semantically invalid (e.g., past date of service for EV) |
| 429 | `rate_limited` | Tenant or API key rate limit exceeded |
| 500 | `internal_error` | Unexpected server fault — `requestId` retained for incident analysis |
| 503 | `service_unavailable` | Dependent subprocessor (Twilio, ElevenLabs, Azure OpenAI) returning errors; safe to retry |

---

## 10. Rate Limits

Default limits per tenant:

| Surface | Limit | Burst |
|---|---|---|
| REST API (read) | 1000 requests / minute | 100 |
| REST API (write) | 200 requests / minute | 30 |
| Bulk import | 5 uploads / minute | 1 |
| Webhook subscription test | 30 fires / minute | 5 |

All limits are configurable per contract. When a limit is exceeded, the response carries `Retry-After` (seconds) and `X-RateLimit-Remaining: 0`.

---

## 11. Idempotency

For all `POST` and `PATCH` operations, the client may include an `Idempotency-Key` header containing a UUID. Cadence stores the request hash and response in Redis for 24 hours; a subsequent request with the same key returns the original response without side effects.

This guarantees that retried submissions (network blip, client crash mid-request) do not create duplicate cases or place duplicate calls.

---

## 12. Reference: OpenAPI 3.1 Specification

The complete machine-readable API specification is provided alongside this document at `openapi.yaml`. The spec covers every endpoint, request and response schema, error envelope, security scheme, and example payload. Generated client libraries (TypeScript, Python, C#) and a Postman collection are derived from this spec.

[Medusind to confirm] preferred SDK languages and any additional endpoints required for integration with specific PMS or clearinghouse systems.

---

**End of Integration & Data Requirements.**
