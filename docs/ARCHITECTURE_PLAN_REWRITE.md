# Cadence Rewrite — Architecture Plan (Python/FastAPI + MySQL + Docker, EC2)

## Context

Cadence — an AI voice-agent platform that calls insurance payers to check medical claim status or verify dental eligibility, escalating live to a human operator when needed — was built on Convex (serverless reactive backend) + React, deployed across Render/EC2. On the new `Ace_Cadence` branch, the app is being rebuilt as a self-hosted, containerized system on the user's own EC2 instance: Python/FastAPI backend microservices, MySQL installed directly on the EC2 host, and a React frontend — replacing Convex and Render entirely. This plan is the product of an iterative design session covering tech stack, service boundaries, and schema, refined step by step with the user rather than decided up front. It reflects the final, agreed shape of all three.

Full domain knowledge backing this plan came from direct reading of the current app's `convex/schema.ts`, `handoff.ts`, `outcomeClassifier.ts`, `webhooks.ts`, `apiKeys.ts`, `claimFollowups.ts`, `transferDestinations.ts`, all 8 `convex/prompts/*.ts` files, `docs/PLAN.md` (the locked live-handoff topology, verified against source), and a full inventory of every other `convex/*.ts` file and every `src/pages/*` component. **The `cadence-bridge` Node.js repo (Twilio↔ElevenLabs audio relay) is available locally** at `c:\Users\Admin\Documents\GitHub\cadence-bridge` and has already been read in full — the Python bridge rewrite can port from working source, not just documentation.

## Foundational decisions

1. **Backend framework:** FastAPI, for every Python service.
2. **Real-time:** WebSockets, backed by Redis pub/sub for cross-process fan-out.
3. **Database:** one shared MySQL database; each service owns and writes only its own tables.
4. **Auth:** stays demo-grade (PIN gate + pick-a-user, no JWT/server-side RBAC) — matches current single-tenant (`user_id='default'`) behavior.
5. **Telephony bridge:** rewritten in Python (no Node.js anywhere in the new stack).
6. **Async tasks:** Celery + Redis where background work is needed.
7. **Call recordings:** local disk on the EC2 instance.
8. **MySQL hosting:** installed directly on the EC2 host, **not containerized** — backend containers connect to it via the host's Docker-bridge address.
9. **Orchestration:** Docker Compose (single EC2 host — no Kubernetes).
10. **Webhooks / public partner API:** out of scope for v1 — both exist in the current app but are unrouted/hidden in its UI today, so nothing is being built for them now.

---

## 1. UI Design

**Tech stack:**
- **Build tool:** Vite
- **Framework:** React 19
- **Styling:** TailwindCSS 3 (+ `@tailwindcss/forms`)
- **Routing:** React Router 7 (client-side only, matches today)
- **Data fetching:** native `fetch` wrapped in small typed API-client modules (one per backend service, e.g. `apiClaims.ts`, `apiMasterData.ts`) — no heavyweight client library needed since the "live query" behavior is custom-built (see below), not React Query/SWR, though either could slot in later without much disruption
- **Real-time client:** native `WebSocket` API, wrapped in two small hooks — `useLiveQuery` (invalidate+refetch for lists/dashboards via `/ws/updates`) and `useCallStream` (live audio/transcript via `/ws/calls/{id}`)
- **Charts:** keep the existing hand-rolled SVG `BarChart`/`PieChart` components — no new charting library needed
- **Package manager:** npm (matches current repo)
- **Deploy target:** static build (`dist/`), served by nginx on the EC2 instance — no Node.js server needed at runtime for the frontend itself

No SSR/Next.js — this is an internal admin/operator tool, not a public site needing SEO. Built artifacts are served by nginx, same "build → copy to nginx" deploy pattern already used on the EC2 instance today.

**Structure:** the current frontend's page/component structure is sound and gets reused, not redesigned:
- Two role-based layouts (`Layout` for admin, `OperatorLayout` for operator), sharing most components but different nav/route trees.
- ~20 real, backend-wired pages: Dashboard, Claims (list/detail), Master Data (providers/payers/patients tabs), Call Audit (history + live), Sessions, Reports (8 tabs), Audit log, Users (+ groups), Operator Queue, Operator Dashboard.
- ~15 static placeholder pages (appointment scheduling, benefit verification, prior auth, patient balance reminders, inbound billing) stay exactly as they are today — static mock data, zero backend wiring, out of scope for this rewrite.
- Auth flow unchanged: PIN gate → pick-a-user screen (matches Decision 4 — demo-grade auth stays).

**What changes — the data layer only:**
- Every Convex `useQuery`/`useMutation`/`useAction` call is replaced with a plain REST call (fetch) against the new services, reached through nginx path routing (`/api/claims/...`, `/api/master-data/...`, `/api/users/...`, etc.).
- Convex's automatic reactivity is replaced by a small custom hook (e.g. `useLiveQuery`) that fetches via REST and additionally subscribes to `ui-data-loading-svc`'s `/ws/updates` socket for its entity type; on receiving an invalidation event for that entity, it refetches. Simpler than replicating Convex's per-query reactivity, at the cost of one extra round-trip per update — acceptable at this app's call volume.
- Live call audio/transcript uses a dedicated hook pointed at `call-handling-svc`'s `/ws/calls/{id}` (replaces the old bridge's `/listen/:callId` + Convex polling combo).
- Handoff broadcast (operators seeing an incoming call to accept/decline) uses a hook pointed at `call-handling-svc`'s `/ws/handoff`.

**Open decision:** whether to fork the current `src/` frontend as a literal starting point (swap only the data layer, keep everything else) or start the frontend fresh on `Ace_Cadence`. Given how much of the existing structure is directly reusable, forking is the practical default — flag if you want it built fresh instead.

---

## 2. Backend Design — Services

**Tech stack:**
- **Language/runtime:** Python 3.11 (pinned, not 3.13+ — `telephony-bridge-svc`'s DTMF synthesis needs the stdlib `audioop` module, removed in 3.13; easier to pin the whole backend to one version than special-case one service)
- **Web framework:** FastAPI (async, native WebSocket support, automatic OpenAPI docs for every service)
- **ASGI server:** Uvicorn
- **ORM / DB access:** SQLAlchemy 2.x (async engine) + `asyncmy` (or `aiomysql`) as the MySQL driver, wrapped by the shared DB library every service imports
- **Schema migrations:** Alembic
- **Validation/schemas:** Pydantic v2 (request/response models, settings management via `pydantic-settings`)
- **Async task queue:** Celery, with Redis as both broker and result backend
- **Real-time fan-out:** Redis pub/sub (separate DB index from Celery's, e.g. `/0` for Celery, `/1` for pub/sub)
- **HTTP client (service-to-service calls):** `httpx` (async-native, used wherever one service calls another's REST API)
- **Containerization:** Docker, one image per service, orchestrated with Docker Compose (single EC2 host — no Kubernetes)
- **Reverse proxy:** nginx (also serves the static frontend build and terminates TLS, reusing the cert setup already on the EC2 instance)
- **External integrations (unchanged from today):** Twilio (Voice REST API, Media Streams, Voice SDK), ElevenLabs Conversational AI, OpenAI (GPT for transcript extraction + Excel-import mapping)

Consolidated from an initial 13-service draft down to **8 services**, after review — several early service boundaries (claims/eligibility/orchestration/extraction) turned out to be one workflow, not four separate concerns.

| # | Service | Responsibility |
|---|---|---|
| 1 | **login-svc** | Authentication only — PIN gate today, kept as its own service specifically so future auth methods (SSO/OAuth/JWT) can be added without touching user-management logic. |
| 2 | **user-management-svc** | Users, user groups, routing profiles (which payers/providers/specializations an operator handles). |
| 3 | **master-data-svc** | Pure reference data: payers (incl. IVR playbooks, `call_connection_type`, transfer numbers), providers, patients. Nothing transactional lives here. |
| 4 | **call-handling-svc** | The core of the app: claims + dental EV cases (unified), follow-up tracking, call placement, transcript extraction, outcome classification, the live AI→human handoff state machine, batched call sessions. Also runs its own async/background work in-process (transcript analysis, follow-up-triggered calls, handoff timeouts) — no separate worker service. |
| 5 | **scheduler-svc** | Watches for due follow-ups, scheduled session starts, and retry-worthy calls, and triggers new calls via `call-handling-svc`'s API at the right time. Built with an explicit dedup/idempotency table — the current app had a similar cron job that caused a real incident (2026-07-20, re-triggered follow-up calls for old calls) and was deliberately disabled; this service's schema is designed specifically to prevent that failure mode from recurring. |
| 6 | **ui-data-loading-svc** | Aggregates/shapes data for screens that need a join across services (e.g. a claim detail page needs claim + patient + payer + provider + calls in one response), and runs the `/ws/updates` live-invalidation fan-out for lists/dashboards. |
| 7 | **reports-dashboards-svc** | The 8 report tabs, admin dashboard, operator stats — read-only aggregation across services. |
| 8 | **telephony-bridge-svc** | Python port of the Node bridge: Twilio↔ElevenLabs audio relay, DTMF (G.711 µ-law) tone synthesis, all `/twiml-*` TwiML endpoints. Stateless relay — does not own any data, reports call-state changes to `call-handling-svc` via REST. |
| — | **shared DB library** (not a container) | One connection/session class every service imports (pooling/config owned in one place), plus a `write_audit_event()` helper writing to the shared `audit_events` table — this is how audit logging works; there's no separate audit service. |
| — | **nginx** | Reverse proxy: serves the static frontend build, path-routes `/api/*` and `/ws/*` (with upgrade headers) to the services above, and routes Twilio's direct hits (`/twiml-*`, `/twilio-*`, `/media-stream`) straight to `telephony-bridge-svc`. |

**Read-only cross-service exception:** `ui-data-loading-svc`, `reports-dashboards-svc`, and `scheduler-svc` all read other services' tables directly (no REST hop) rather than making N+1 calls across services for aggregation/scanning purposes. This is the one deliberate break from "services only touch their own tables," and it's read-only in all three cases — writes always go through the owning service.

---

## 3. Database Design — Tables and Purpose

**Tech stack:**
- **Engine:** MySQL 8.0, installed natively on the EC2 host (not containerized) — every backend container connects over the Docker-bridge address, not `localhost`
- **Storage engine:** InnoDB (default, required for the FK/trigger/CHECK-constraint usage throughout this schema)
- **Access pattern:** one shared database, logically partitioned by owning service (not physically separate databases) — see Foundational Decision 3
- **Schema management:** Alembic migrations, one migration chain shared across all services (since it's one physical database)
- **Connection pooling:** owned centrally by the shared DB library (SQLAlchemy async engine, one pool per service process) rather than each service configuring its own
- **Business-rule enforcement:** MySQL 8's native `CHECK` constraints (e.g. session item-count limits) and `BEFORE UPDATE` triggers (status-transition graphs) as defense-in-depth alongside application-layer validation — not relied on as the sole enforcement mechanism

One shared MySQL database (installed on the EC2 host, not containerized), logically partitioned by owning service. Every table has `user_id VARCHAR(64) NOT NULL DEFAULT 'default'` (matches current single-tenant behavior) and `created_at`/`updated_at DATETIME(3)`, omitted below for brevity. BIGINT auto-increment PKs throughout (Convex's string IDs were a platform artifact, not carried forward).

### master-data-svc — pure reference data

| Table | Purpose |
|---|---|
| `providers` | The practices/organizations Cadence places calls on behalf of (NPI, tax ID, address). |
| `insurance_contacts` | The payer directory — one row per insurance company, including its IVR navigation playbook (`ivr_instructions`, `ivr_steps`, `voice_ivr_phrases`), which of the three call-routing modes it uses (`call_connection_type`), and its direct/warm transfer numbers. This is the single most-referenced table in the schema. |
| `patients` | Patient/subscriber records (name, DOB, member ID) that claims and calls are made about. |

### user-management-svc

| Table | Purpose |
|---|---|
| `users` | Operator/admin accounts — role, status, which payers/providers/specializations they're routed to handle. |
| `user_groups` | Reusable bundles of payer/provider/specialization assignments, applied to multiple users at once instead of configuring each individually. |

### call-handling-svc — the transactional core

| Table | Purpose |
|---|---|
| `claims` | The unified work-item table — one row per medical claim *or* dental EV case (`use_case` discriminator), holding the core facts: patient/payer/provider, service date, codes, status, priority, aging. Medical-only and dental-only columns are simply NULL on rows of the other type. |
| `claim_followups` | One row per claim (keyed by `claim_id`), holding the current follow-up state: last called, next follow-up date, disposition, comment, who/when. Split out from `claims` because this data changes on every call attempt while the core claim facts don't. |
| `call_sessions` | A batch of up to 5 same-payer claims/cases queued to be called in one session (multi-patient calling). |
| `calls` | One row per actual phone call placed — links to the claim, tracks Twilio/ElevenLabs IDs, transcript, recording paths, and the full live AI→human handoff state machine (who it's assigned to, conference name, accept/connect timestamps). The largest, highest-write-volume table in the schema. |
| `call_results` | The structured data GPT extracted from a call's transcript — one row per call, unified medical + dental fields (again via `use_case`, with the non-applicable set left NULL). Linked to both `call_id` and `claim_id`. |
| `call_events` | An append-only timeline of events/transcript turns for a call, read by the live call-monitor UI while a call is in progress. |
| `call_settings` | A small generic key-value scratch store used to pass state between call-placement steps mid-call (e.g. session progress). |

### scheduler-svc

| Table | Purpose |
|---|---|
| `scheduled_call_jobs` | Tracks every due-but-not-yet-triggered follow-up/scheduled call, with a `UNIQUE(job_type, ref_id, scheduled_for)` constraint that makes it structurally impossible to double-fire the same follow-up — the direct fix for the failure mode that caused the current app's cron job to be disabled after a real incident. |

### Shared (written via the shared DB library, not owned by a service's own API)

| Table | Purpose |
|---|---|
| `audit_events` | HIPAA-style log of who did what to which resource and when — written synchronously from any service via a shared helper function, not through a dedicated audit service. |

**JSON columns used throughout:** `ivr_steps`, `voice_ivr_phrases` (insurance_contacts); `cpt_codes`, `diagnosis_codes`, `cdt_codes` (claims); `item_refs` (call_sessions); `required_fields_retrieved`, `missing_fields`, `linked_claim_ids` (calls); `frequency_limits`, `waiting_periods` (call_results); `insurance_contact_ids`, `provider_ids`, `specializations` (users, user_groups); `raw_extraction` (call_results).

**Status-field note:** `claims.status` is `VARCHAR(30)`, not a MySQL `ENUM`, because the unification means valid values depend on `use_case` (medical: `pending/in_progress/paid/denied/appealing/write_off`; dental: `awaiting_verification/verifying/verified/failed/requires_human`) — validity and the transition graph are both enforced by a `BEFORE UPDATE` trigger that branches on `NEW.use_case`, ported from the exact transition tables in the current app's `convex/claims.ts` and `convex/dentalCases.ts`.

---

## Verification approach (once implementation begins)

Matches the project's existing "test against deployed, not local mocks" philosophy: each phase gets verified against the actual EC2 deployment, not unit tests that mock Twilio/ElevenLabs/OpenAI. The one existing test double worth keeping is the test-IVR simulated payer (`/test-ivr`) for verifying the telephony bridge before it ever touches a real payer.
