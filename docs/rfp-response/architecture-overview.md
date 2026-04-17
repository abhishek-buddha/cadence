# Cadence — Technical Architecture Overview

**Document:** Architecture Overview
**Version:** 1.0
**Date:** 2026-04-17
**Prepared for:** Medusind LLC
**Prepared by:** Cadence (Algonox)
**Classification:** Confidential — RFP Response Artifact

---

## 1. Executive Summary

Cadence is a Conversational AI Voice Bot platform purpose-built for healthcare Revenue Cycle Management (RCM). The platform automates outbound voice interactions with payer organizations to retrieve claim status, denial details, eligibility benefits, and authorization information. Cadence combines a real-time telephony layer (Twilio Programmable Voice), a conversational AI layer (ElevenLabs Conversational AI plus Azure OpenAI GPT-4o for transcript reasoning), and a structured data layer (PostgreSQL with field-level encryption for Protected Health Information) into a single deployable system.

For the Medusind engagement, Cadence supports two primary use cases:

1. **Medical Claim Status & Denial Follow-Up** — outbound calls to medical payers to retrieve claim adjudication status, payment details, denial reason and remark codes, and appeal status.
2. **Dental Eligibility Verification (EV)** — outbound calls to dental payers to retrieve coverage status, deductibles, co-pays, co-insurance, annual maximums, frequency limitations, and waiting periods for a defined set of CDT procedure codes.

Cadence offers two deployment models:

- **Cadence-managed multi-tenant SaaS** — Cadence operates the production environment in its own AWS account; Medusind connects via authenticated REST API and SSO. Suitable for accelerated pilots where boundary exceptions are accepted.
- **In-tenant deployment inside Medusind's controlled environment** — Cadence ships a Helm-packaged Kubernetes distribution that Medusind runs inside its own AWS, Azure, or on-premises Kubernetes cluster. PHI never leaves Medusind's network boundary. This is the recommended production model for Medusind.

This document describes the system architecture, call lifecycles, data model, deployment topology, scaling strategy, observability stack, and disaster recovery posture that underpin both deployment models.

---

## 2. System Architecture

### 2.1 High-Level Component Map

Cadence is composed of seven logical tiers, each independently scalable and observable.

```
+-----------------------------------------------------------+
|                    1. Frontend (React 19)                 |
|  - Vite build, served from nginx                          |
|  - shadcn/ui + Tailwind, dark "command center" theme      |
|  - WebSocket client for live call monitoring              |
+-------------------------------+---------------------------+
                                |
                                | HTTPS (TLS 1.3) + WSS
                                v
+-----------------------------------------------------------+
|              2. API Gateway / Edge (nginx + Cloudflare)   |
|  - TLS termination, rate limiting, WAF, GeoIP block       |
|  - Authenticated reverse proxy to Backend API             |
+-------------------------------+---------------------------+
                                |
        +-----------------------+-------------------------+
        |                                                 |
        v                                                 v
+-------------------+                    +-------------------------+
| 3. Backend API    |                    | 4. Telephony Bridge     |
| (Node 20 + Fastify) <-- Redis pub/sub --> (Node 20 + Socket.IO)  |
| - REST endpoints  |                    | - Twilio media stream   |
| - OpenAPI 3.1     |                    |   bridge                |
| - RBAC, audit log |                    | - mu-law audio decode   |
| - Webhook signer  |                    | - Live transcript fanout|
+--------+----------+                    +-------------+-----------+
         |                                             |
         | SQL                                         | WebSocket
         v                                             v
+-------------------+                    +-------------------------+
| 5. PostgreSQL 16  |                    | 6. Worker Tier          |
| (RDS Multi-AZ)    |                    | (Node 20 + BullMQ)      |
| - pgcrypto field  |                    | - Outbound call queue   |
|   encryption      |                    | - Webhook delivery      |
| - PITR enabled    |                    | - Outcome classifier    |
| - 7-day binlogs   |                    | - Auto-retry orchestr.  |
+-------------------+                    +-------------+-----------+
                                                       |
                                                       v
                            +--------------------------------------+
                            |         7. External Subprocessors    |
                            |  - Twilio Voice (HIPAA workspace)    |
                            |  - ElevenLabs Conv AI (Enterprise)   |
                            |  - Azure OpenAI (HIPAA-eligible)     |
                            |  - AWS S3 (recordings, KMS-encrypted)|
                            +--------------------------------------+
```

### 2.2 Frontend

The frontend is a React 19 single-page application built with Vite. It uses Tailwind CSS for styling, shadcn/ui plus Radix primitives for accessible component composition, and TanStack Query for server-state caching. Real-time call monitoring is delivered through a Socket.IO WebSocket connection to the Telephony Bridge tier, which streams transcript fragments and audio frames as they are produced.

The frontend is delivered as a static asset bundle (gzip + brotli pre-compressed, hashed filenames, content-addressable cache headers) served from nginx behind Cloudflare. The same bundle is used for the multi-tenant SaaS and in-tenant deployments; tenant-specific configuration is delivered at runtime via a `/v1/config` endpoint.

### 2.3 Backend API

The Backend API is a Node 20 Fastify service that exposes the public REST API documented in `openapi.yaml`. Key responsibilities:

- Authentication (API key + OAuth 2.0 client credentials + SSO/SAML for human users via Auth.js v5)
- Authorization (role-based access control with Admin / Manager / Operator / Viewer roles)
- Tenant scoping (every query filtered by `tenantId` derived from the authenticated principal)
- Audit logging (every PHI access and mutation written to an immutable append-only event log)
- Idempotency enforcement (`Idempotency-Key` header + Redis SETNX with 24-hour TTL)
- Rate limiting (default 1000 requests per minute per tenant, configurable)
- Webhook subscription management and signed delivery dispatch

### 2.4 Telephony Bridge

The Telephony Bridge is a stateless Node 20 service that brokers media frames between Twilio's Programmable Voice WebSocket stream and the ElevenLabs Conversational AI WebSocket. It performs:

- mu-law to PCM decoding for inbound audio
- PCM to mu-law encoding for outbound TTS audio frames
- Live transcript fanout to subscribed monitoring clients via Socket.IO rooms keyed by `callId`
- Bridge-level metrics emission (frame loss, jitter, latency)

Multiple Bridge replicas run behind a sticky-session load balancer; Redis pub/sub is used for cross-replica monitoring fanout when a viewer's WebSocket is on a different replica than the active call.

### 2.5 LLM and Voice Tiers

Conversational AI is delegated to ElevenLabs Conversational AI agents, configured per use case (one agent for medical claims, a separate agent for dental EV). Each agent is parameterized at call-initiation time with dynamic variables (patient demographics, claim or case identifiers, payer-specific instructions, IVR navigation hints).

Post-call transcript reasoning — extracting structured data, classifying outcomes, validating completeness — is delegated to Azure OpenAI GPT-4o running in the HIPAA-eligible commercial Azure region, accessed via private endpoint. The OpenAI SDK abstraction is preserved; an alternate private LLM (Llama 3 70B or Mistral) can be substituted for environments where Azure OpenAI is not available.

### 2.6 Worker Tier and Queues

Background work is processed by BullMQ workers running on Node 20 with Redis as the broker. Queue families:

- `calls.outbound` — outbound call initiation, including IVR navigation hints and dynamic variable assembly
- `calls.retry` — auto-retry for partial outcomes after configurable cool-down
- `transcripts.analyze` — post-call structured extraction
- `outcomes.classify` — required-field validation and outcome classification
- `webhooks.deliver` — signed webhook POST with exponential-backoff retry and dead-letter queue
- `recordings.archive` — long-term archival movement from hot S3 to S3 Glacier

Per-payer concurrency limits are enforced at queue level to avoid triggering payer rate limits.

### 2.7 Data Tier

PostgreSQL 16 is the system of record. Field-level encryption is applied to PHI columns (member ID, date of birth, SSN where applicable) using `pgcrypto` with a tenant-scoped data encryption key wrapped by an AWS KMS customer master key. Recordings, transcripts, and large blobs are stored in S3 with KMS encryption at rest and signed-URL retrieval (15-minute TTL).

---

## 3. Call Lifecycle — Medical Claim Status

### 3.1 Sequence

```
User                Cadence UI         Backend API        Worker Tier         Twilio              ElevenLabs         Payer
 |                      |                  |                  |                  |                    |                |
 |--Click "Call"------->|                  |                  |                  |                    |                |
 |                      |--POST /v1/claim-cases/{id}/calls--->|                  |                    |                |
 |                      |                  |--Enqueue call--->|                  |                    |                |
 |                      |<--202 + callId---|                  |                  |                    |                |
 |                      |                  |                  |--Twilio API: outbound call------------>|                |
 |                      |                  |                  |                  |--Dial payer-------->|                |
 |                      |                  |                  |                  |<--Ringing-----------|                |
 |                      |                  |                  |                  |<--Connected---------|                |
 |                      |                  |                  |                  |--TwiML <Stream>---->|                |
 |                      |                  |                  |--Bridge to ElevenLabs Conv AI agent---->|              |
 |                      |                  |                  |                  |--Audio frames------>|--Audio------->|
 |                      |<--WS subscribe (callId)             |                  |                    |                |
 |                      |<--Live transcript & audio (every ~200 ms)              |                    |                |
 |                      |                  |                  |                  |                    |--IVR navigate->|
 |                      |                  |                  |                  |                    |--Reach rep---->|
 |                      |                  |                  |                  |                    |--Conversation->|
 |                      |                  |                  |                  |                    |<--Claim data---|
 |                      |                  |                  |                  |--Hangup------------>|                |
 |                      |                  |<--Transcript---<|--Analyze action-->|                    |                |
 |                      |                  |--Classify outcome (successful / partial / failed)         |                |
 |                      |                  |--Persist result + fire webhook                            |                |
 |                      |<--Realtime UI update (final result card)                                     |                |
```

### 3.2 Stages in Detail

1. **Initiation** — User selects a claim and clicks "Call" in the UI, or an upstream system POSTs to `/v1/claim-cases/{id}/calls`. The Backend API validates RBAC, writes a `calls` row in `status=queued`, and enqueues a `calls.outbound` job.
2. **Queueing** — The Worker tier picks up the job, looks up the payer phone number and IVR sequence from `payers`, assembles dynamic variables for the ElevenLabs agent, and instructs Twilio to dial the payer. The `calls` row transitions to `status=initiating`.
3. **Connection** — Twilio dials the payer. Once connected, Twilio opens a media stream to the Telephony Bridge. The Bridge connects to the ElevenLabs Conversational AI WebSocket, passing the agent ID and dynamic variables. The `calls` row transitions to `status=connected`.
4. **IVR navigation** — The agent uses configured IVR hints to send DTMF digits via Twilio's `<Send>` verb at the right prompts, and uses voice responses for spoken prompts. IVR transitions are recorded into the `ivrTraces` table for adaptive learning.
5. **Conversation** — Once a human rep is reached, the agent introduces itself, identifies the caller (provider TIN, NPI), authenticates the call, and walks through a structured retrieval script for claim status, payment, denial reasons, and appeal status. The agent is instructed to keep asking until every required field is retrieved or explicitly determined unavailable.
6. **Termination** — Either party hangs up. Twilio fires the hangup webhook. The `calls` row transitions to `status=completed_pending_analysis`.
7. **Analysis** — A `transcripts.analyze` worker runs the full transcript through Azure OpenAI GPT-4o in JSON mode using a deterministic schema. The extracted structured data is written to `callResults`.
8. **Outcome classification** — The required-field validator compares retrieved fields against the per-use-case `requiredFieldSet`. If all required fields are present, outcome is `successful`. If some are present, `partial`. If the call ended without reaching a rep or the agent could not authenticate, `failed`.
9. **Persistence and notification** — Result is persisted, the `calls` row transitions to its terminal state, an audit event is written, and a `call.outcome_classified` webhook is dispatched to subscribers.

---

## 4. Call Lifecycle — Dental Eligibility Verification

The dental EV lifecycle mirrors the medical lifecycle with two material differences:

1. **Different ElevenLabs agent and prompt** — the dental agent's objective is benefits retrieval, not claim adjudication. The script asks for active coverage, deductible (annual + met-to-date), co-insurance percentage by service category, co-pay amounts, annual maximum (total + remaining), waiting periods by procedure category, frequency limitations for each requested CDT code, and network status of the provider.
2. **Required-field validation is procedure-code-aware** — the `requiredFieldSet` is parameterized by the CDT code groups on the case. A preventive-only case (D0/D1 codes) requires fewer fields than a restorative case (D2 codes), which in turn requires fewer than a major-services case (D3-D9 codes). This avoids penalizing the bot for fields the rep cannot or will not provide for irrelevant categories.

```
User                Cadence UI         Backend API        Worker Tier         Twilio              ElevenLabs         Dental Payer
 |--POST /v1/eligibility-cases/{id}/calls---------------->|                  |                    |                |
 |                      |                  |--Enqueue with dental agent ID-->|                    |                |
 |                      |                  |                  |--Dial dental payer---------------->|              |
 |                      |                  |                  |                  |--Voice + DTMF IVR navigation------>|
 |                      |                  |                  |                  |--Reach benefits dept---------------->|
 |                      |                  |                  |                  |--Verify provider TIN/NPI----------->|
 |                      |                  |                  |                  |--Provide member ID, DOB, plan ID--->|
 |                      |                  |                  |                  |<--Coverage active, eff date---------|
 |                      |                  |                  |                  |<--Deductible $X (Y met)-------------|
 |                      |                  |                  |                  |<--Annual max $X (Y remaining)-------|
 |                      |                  |                  |                  |<--Co-ins %, co-pay $----------------|
 |                      |                  |                  |                  |<--Waiting periods, frequencies------|
 |                      |                  |                  |--Hangup, transcript--->|         |                |
 |                      |                  |--Analyze (dental EV schema), classify, persist        |                |
 |<--EV results card (coverage active, deductible meter, annual max meter, frequency table)         |                |
```

---

## 5. Multi-Patient Session Lifecycle

Many payer reps will, when asked, pull benefits or claim status for several patients in a single call to save time on both sides. Cadence models this through a `callSessions` table with one-to-many `callItems` (each linked to either a `claim` or an `eligibilityCase`).

```
                                                Session start
                                                      |
                                                      v
                                  +--------------------------------------+
                                  | callSessions (1)                     |
                                  +--------------------------------------+
                                                      |
                              +-----------------------+-----------------------+
                              v                       v                       v
                     +---------------+       +---------------+       +---------------+
                     | callItem #1   |       | callItem #2   |       | callItem #3   |
                     | claimId=...   |       | caseId=...    |       | claimId=...   |
                     | outcome=succ  |       | outcome=part  |       | outcome=succ  |
                     +---------------+       +---------------+       +---------------+
```

During the call the agent works through items sequentially. After fully resolving item N it asks "May we look up our next patient?" and starts item N+1 with refreshed dynamic variables. Each item gets its own outcome; the session has an aggregate outcome (`all_successful`, `mixed`, `none_successful`).

The user interface allows operators to select multiple cases for the same payer and plan, confirm a single-call session, and monitor each item's progress in a live tabbed view. Each item produces its own `callResults` row; the parent `callSession` rolls up aggregate metrics.

---

## 6. Human Transfer Lifecycle

Cadence supports both warm transfers (the bot stays on the line, dials the human, conferences both parties, then drops) and cold transfers (the bot drops the call onto the human via SIP REFER).

### 6.1 Warm Transfer

```
Bot --(in conversation with rep)--> Payer Rep
 |
 |--Tool call: transfer_to_human(reason="auth code required")
 v
Backend issues TwiML <Conference> + <Dial> to configured human ops queue
 |
Bot, Rep, and Human Ops are all on the conference bridge
 |
Bot announces: "I am bringing in our specialist to assist with this case"
 |
Bot drops by sending <Hangup>; conference continues with Rep + Human Ops
```

### 6.2 Cold Transfer

```
Bot --(in conversation with rep)--> Payer Rep
 |
 |--Tool call: transfer_to_human(reason="hostile rep, escalation")
 v
Backend issues SIP REFER on the active call leg
 |
Twilio replaces the bot leg with a new leg to the configured ops number
 |
Bot is dropped; Rep is now talking to Human Ops
```

The transfer destination, trigger conditions, and warm-vs-cold preference are configurable per tenant and per payer. Every transfer is recorded as a `callEvents` row with `eventType=transfer_initiated` and the resulting outcome is `transferred_to_human` (which is billable as a partial-success outcome by default; configurable per contract).

---

## 7. Data Model

### 7.1 Core Entities

| Table | Purpose | Key Columns |
|---|---|---|
| `tenants` | Top-level customer organization | `id`, `name`, `status`, `createdAt` |
| `users` | Human users with login credentials | `id`, `tenantId`, `email`, `role`, `ssoProvider`, `ssoSubject` |
| `apiKeys` | Machine credentials | `id`, `tenantId`, `hashedKey`, `scopes[]`, `revokedAt` |
| `payers` | Payer directory (medical + dental) | `id`, `name`, `domain` (medical/dental), `phone`, `ivrSequence`, `ivrSteps[]`, `agentPromptOverride` |
| `patients` | Patient demographics | `id`, `tenantId`, `firstName`, `lastName`, `dob` (encrypted), `memberId` (encrypted) |
| `providers` | Provider entities | `id`, `tenantId`, `name`, `npi`, `tin` (encrypted) |
| `claims` | Medical claim cases | `id`, `tenantId`, `patientId`, `providerId`, `payerId`, `claimNumber`, `dateOfService`, `billedAmount`, `status` |
| `eligibilityCases` (a.k.a. `dentalCases`) | Dental EV cases | `id`, `tenantId`, `patientId`, `providerId`, `payerId`, `planId`, `procedureCodes[]` (CDT), `proposedDateOfService`, `status` |
| `callSessions` | A single payer call possibly covering multiple items | `id`, `tenantId`, `payerId`, `status`, `aggregateOutcome` |
| `callItems` | One item within a session | `id`, `sessionId`, `claimId` (nullable), `caseId` (nullable), `outcome` |
| `calls` | A single Twilio call leg | `id`, `tenantId`, `sessionId`, `twilioCallSid`, `status`, `startedAt`, `endedAt`, `recordingS3Key` |
| `callEvents` | Lifecycle events (queued, initiated, connected, transferred, completed) | `id`, `callId`, `eventType`, `payload`, `timestamp` |
| `callResults` | Structured extraction for medical claim calls | `id`, `callId`, `claimStatus`, `paidAmount`, `denialCode`, `appealStatus`, `requiredFieldsRetrieved[]`, `missingFields[]`, `outcome` |
| `evResults` | Structured extraction for dental EV calls | `id`, `callId`, `caseId`, `isActive`, `deductibleAnnual`, `deductibleMet`, `annualMaximum`, `annualMaxRemaining`, `frequencyLimits[]`, `outcome` |
| `ivrTraces` | Recorded IVR navigation steps for adaptive learning | `id`, `callId`, `payerId`, `steps[]` |
| `webhookSubscriptions` | Outbound webhook destinations | `id`, `tenantId`, `url`, `secret`, `events[]`, `status` |
| `webhookDeliveries` | One delivery attempt | `id`, `subscriptionId`, `eventId`, `attempts`, `lastStatus`, `nextAttemptAt` |
| `auditEvents` | Immutable PHI access and mutation log | `id`, `tenantId`, `userId`, `action`, `resourceType`, `resourceId`, `ipAddress`, `userAgent`, `payloadHash`, `timestamp` |
| `usageEvents` | Per-call billable event for invoice meter | `id`, `tenantId`, `callId`, `outcome`, `useCase`, `timestamp` |

All PHI columns are encrypted at the field level using `pgcrypto` with a tenant-scoped DEK wrapped by an AWS KMS CMK. Rotation cadence: annual for KMS CMKs, quarterly for tenant DEKs.

---

## 8. Subprocessors

Every service that touches PHI is enumerated and BAA-covered before it enters the production data path.

| Subprocessor | Purpose | PHI Touchpoint | BAA Status |
|---|---|---|---|
| Twilio (Programmable Voice, Recordings) | Outbound calling, audio media stream, recording storage | Voice audio, recording files | Twilio HIPAA-eligible workspace with executed BAA |
| ElevenLabs (Conversational AI, Enterprise tier) | Conversational agent, real-time STT and TTS | Live transcript, synthesized voice | Enterprise tier with executed BAA |
| Azure OpenAI (HIPAA-eligible commercial region) | Post-call transcript analysis, structured extraction | Transcript text | Microsoft BAA covers Azure OpenAI in eligible regions; private endpoint enforced |
| AWS (RDS, S3, KMS, EKS) | Compute, database, object storage, key management | Database content, recordings, transcripts | AWS BAA executed at account level |
| Cloudflare (CDN + WAF in front of frontend assets only) | Static asset delivery, edge WAF | None — PHI never traverses Cloudflare | Cloudflare BAA available; not strictly required since no PHI traverses |
| Auth providers (Microsoft Entra ID, Okta) | SSO/SAML | Identity assertions only, no clinical PHI | Customer-side IdP; no BAA required for assertion exchange |
| Sentry / OpenTelemetry collector | Application error and trace collection | Configured to scrub PHI from payloads via processor allowlist; no PHI in production telemetry | N/A under scrubbing; BAA available if required |

In the in-tenant deployment model, AWS is replaced by Medusind's choice of cloud (AWS, Azure, or on-premises Kubernetes) and the BAA shifts to Medusind's existing cloud agreement.

---

## 9. Deployment Options

### 9.1 Cadence-Managed Multi-Tenant SaaS

```
[ Internet ]
     |
     v
[ Cloudflare WAF + CDN ]
     |
     v
[ AWS us-east-1 — Cadence Production VPC ]
   |
   +-- ALB --> Frontend (nginx, ECS Fargate, autoscaled 2-20)
   |
   +-- ALB --> Backend API (Fastify, ECS Fargate, autoscaled 4-50)
   |
   +-- NLB --> Telephony Bridge (Node, ECS Fargate, autoscaled 2-30, sticky)
   |
   +--------> RDS PostgreSQL 16 Multi-AZ (db.r6g.xlarge baseline, autoscale to 4xlarge)
   |
   +--------> ElastiCache Redis Multi-AZ (cache.m6g.large baseline)
   |
   +--------> S3 buckets (recordings, exports, audit log archive)
   |
   +--------> Worker fleet (Fargate, autoscaled by queue depth)

[ AWS us-west-2 — Warm Standby ]
   |
   +--------> Read replica + cross-region S3 replication
   +--------> Failover via Route53 health checks
```

Tenant isolation is enforced at the application layer: every query is filtered by `tenantId` derived from the authenticated principal's JWT claims. Database-level row-level security policies provide a second line of defense.

### 9.2 In-Tenant Deployment Inside Medusind

```
[ Medusind Network Boundary ]
   |
   +-- Medusind Kubernetes Cluster (EKS / AKS / OpenShift)
   |     |
   |     +-- Helm release: cadence (chart provided by Cadence)
   |     |     - frontend (Deployment, 2+ replicas)
   |     |     - backend-api (Deployment, 4+ replicas, HPA on CPU + queue depth)
   |     |     - telephony-bridge (Deployment, 2+ replicas, HPA on connections)
   |     |     - workers (Deployment, autoscaled by queue depth)
   |     |
   |     +-- Postgres (Medusind-managed RDS / Cloud SQL / on-prem)
   |     +-- Redis (Medusind-managed ElastiCache / on-prem)
   |     +-- Object storage (Medusind S3 / Azure Blob / MinIO)
   |
   +-- Egress to subprocessors via Medusind's NAT or PrivateLink
         - Twilio (HIPAA workspace)
         - ElevenLabs (Enterprise endpoint)
         - Azure OpenAI (private endpoint)
```

In this model, PHI never leaves Medusind's network. Cadence ships container images, the Helm chart, configuration templates, runbooks, and version updates. Cadence support staff access the deployment only via Medusind-controlled bastion (typically time-limited break-glass with audit recording).

---

## 10. Scaling Strategy

### 10.1 Horizontal Autoscaling

- **Frontend:** Cloudflare absorbs static asset load; origin replicas scale only for `/v1/config` and asset-revalidation traffic.
- **Backend API:** Autoscale on CPU and request queue depth. Default 4–50 replicas; tested headroom to 200 replicas for multi-tenant SaaS.
- **Telephony Bridge:** Autoscale on active WebSocket connections. Each replica handles up to 200 concurrent calls (limited by media-frame CPU).
- **Workers:** Autoscale on queue depth. Per-queue concurrency limits prevent stampeding payer phone numbers.

### 10.2 Per-Payer Concurrency Limits

A configurable concurrency cap per payer (default: 10 concurrent calls per payer phone number) prevents Cadence from triggering payer rate limits or appearing as a denial-of-service source. The cap is enforced by a Redis-backed semaphore in the `calls.outbound` worker.

### 10.3 Regional Deployment

For Medusind, the recommended production region is AWS us-east-1 (or equivalent Azure / on-prem region). A warm-standby in us-west-2 maintains a cross-region read replica and S3 cross-region replication. Failover is automated via Route53 health checks with a documented runbook for promotion to primary.

---

## 11. Observability

### 11.1 Metrics (Prometheus)

Every Cadence service exposes a `/metrics` endpoint scraped by Prometheus. Core metric families:

- `cadence_http_requests_total{route, status}` — request counters
- `cadence_http_request_duration_seconds{route}` — latency histograms (p50/p90/p95/p99)
- `cadence_calls_total{outcome, useCase, payerId}` — call counters by outcome
- `cadence_call_duration_seconds{useCase, payerId}` — call duration histograms
- `cadence_queue_depth{queueName}` — backlog gauges
- `cadence_webhook_delivery_attempts_total{status}` — webhook delivery counters
- `cadence_webhook_delivery_lag_seconds` — lag from event to first delivery attempt
- `cadence_extraction_required_fields_retrieved_ratio{useCase, payerId}` — completeness gauges
- `cadence_audit_events_written_total` — audit log throughput

### 11.2 Dashboards (Grafana)

- **Operations** — system health, traffic, error rate, latency
- **Calls** — call volume, outcome mix, duration distribution by payer
- **Quality** — required-field completeness, outcome trend, accuracy from QA sampling
- **Webhooks** — delivery rate, retry queue depth, dead-letter count
- **Cost** — cost per call by outcome, by use case, by payer
- **Per-Tenant** — same panels filtered by `tenantId`

### 11.3 Alerts (Alertmanager → PagerDuty + Slack)

P0 (page on call):
- API error rate > 1% for 5 minutes
- p95 latency > 2 seconds for 10 minutes
- Database connection pool saturated
- Queue depth > 1000 for any queue for 10 minutes
- Health endpoint returning non-200 from any region

P1 (Slack within business hours):
- Webhook delivery failure rate > 5%
- Per-payer success rate dropped > 20% week over week
- Recording archival lag > 24 hours

### 11.4 Service Level Objectives

| SLO | Target | Window |
|---|---|---|
| API availability | 99.9% | 30 days |
| API p95 latency | < 500 ms | 30 days |
| Call outcome success rate (per use case) | ≥ 80% | rolling 7 days |
| Webhook delivery within 5 min | ≥ 99% | 30 days |
| Live call monitor reconnect within 5 s | ≥ 99% | 30 days |

### 11.5 Tracing and Logging

OpenTelemetry instrumentation across Backend API, Telephony Bridge, and Workers exports traces to Tempo (or Jaeger). Structured JSON logs are shipped to Loki via promtail and correlated with traces by trace ID. Logs are scrubbed of PHI at the source via an allowlist serializer; no clinical PHI ever enters telemetry.

---

## 12. Disaster Recovery

### 12.1 Targets

- **Recovery Point Objective (RPO):** ≤ 15 minutes
- **Recovery Time Objective (RTO):** ≤ 1 hour

### 12.2 Backup Strategy

- **Database:** RDS automated backups with 35-day retention plus cross-region replicated snapshots. Point-in-time recovery enabled with 7 days of WAL retention.
- **Recordings and transcripts:** S3 cross-region replication to a second region; lifecycle policy transitions cold objects to S3 Glacier after 90 days.
- **Audit log archive:** Daily export to a write-once S3 bucket with Object Lock (governance mode, 6-year retention) — meets HIPAA audit retention requirements.
- **Configuration and secrets:** AWS Secrets Manager replicated cross-region; Helm values backed up to a private Git repository.

### 12.3 Failover Procedure

1. Monitor detects region-wide failure (Route53 health checks fail in primary).
2. On-call engineer is paged.
3. Promote read replica in standby region to primary.
4. Update Route53 weighted records to send 100% of traffic to standby.
5. Workers in the standby region begin draining queues.
6. Verify health and call placement with synthetic call test against mock payer.
7. Communicate status to Medusind operations contacts.

The full failover runbook is rehearsed quarterly via game-day exercises, with documented results provided to Medusind compliance.

### 12.4 Data Integrity Verification

After failover, integrity is verified via:
- Foreign key constraint validation across all tenant tables
- Audit log continuity check (no gaps in monotonic event sequence)
- Recording inventory reconciliation between database and S3
- Synthetic call placement against mock payer to verify end-to-end function

---

## Appendix A — Reference Network Diagram

```
                         +-----------------------------+
                         |        Internet             |
                         +--------------+--------------+
                                        |
                                        v
                   +-------------------------------------+
                   | Cloudflare (TLS 1.3, WAF, GeoIP)    |
                   +--------------+----------------------+
                                  |
                                  v
+---------------------------------+----------------------------------+
| AWS VPC (10.0.0.0/16) — multi-AZ                                   |
|                                                                    |
|  Public subnets (10.0.0.0/24, 10.0.1.0/24)                         |
|    - ALB (frontend, backend, bridge)                               |
|    - NAT gateways                                                  |
|                                                                    |
|  Private subnets (10.0.10.0/24, 10.0.11.0/24)                      |
|    - ECS Fargate tasks (frontend, backend, bridge, workers)        |
|    - RDS PostgreSQL Multi-AZ                                       |
|    - ElastiCache Redis                                             |
|                                                                    |
|  Egress via NAT to subprocessors:                                  |
|    - Twilio (TLS 1.3 + HIPAA workspace)                            |
|    - ElevenLabs (TLS 1.3 + Enterprise endpoint)                    |
|    - Azure OpenAI (PrivateLink → Azure VNet peering)               |
|    - S3 (VPC gateway endpoint, private)                            |
|    - KMS (VPC interface endpoint, private)                         |
+--------------------------------------------------------------------+
```

---

**End of Architecture Overview.**
