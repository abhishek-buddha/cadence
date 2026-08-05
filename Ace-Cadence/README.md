# Ace-Cadence — self-hosted Cadence rewrite

Python/FastAPI microservices + MySQL + Docker Compose, replacing the
Convex/Render stack for a self-hosted deploy on a single EC2 instance. Full
design rationale lives in [`docs/ARCHITECTURE_PLAN_REWRITE.md`](../docs/ARCHITECTURE_PLAN_REWRITE.md).

## Layout

```
base-image/          shared Docker base image (common deps + common/ Python package)
services/
  login-svc/          PIN auth, sessions
  user-management-svc/ users, user groups
  master-data-svc/     providers, insurance contacts, patients
  call-handling-svc/   claims, follow-ups, call sessions, calls, results, events
  scheduler-svc/       dedup-safe scheduled follow-up jobs
  ui-data-loading-svc/ cross-service read aggregation + /ws/updates fan-out
  reports-dashboards-svc/ the 8 report tabs
  telephony-bridge-svc/   Twilio<->ElevenLabs audio relay, TwiML
nginx/                reverse proxy config, serves the frontend build
docker-compose.yml
.env.example
```

## Current status

Every service above has REST routes scaffolded and wired into a running
FastAPI app — this is the API surface, not yet the full business logic.
Deliberately **no ORM layer**: routes talk to MySQL with plain SQL
(`sqlalchemy.text(...)`, via the shared async engine in
`base-image/common/db.py`) and take/return plain dicts, not SQLAlchemy
model classes or Pydantic schemas — table structure lives in the database
itself, created separately, not duplicated as Python classes.
`base-image/common/serialize.py` has the row->dict / JSON-column helpers
every service's routers use. Notably still open:

- **No database schema-creation step yet.** Nothing here has run any
  `CREATE TABLE` statements (or `alembic upgrade head`, or any equivalent)
  against a real MySQL database — the column names/types each router
  expects only exist in the SQL each route issues. See "Database setup"
  below before trying to run any service against real data.
- `telephony-bridge-svc`'s `/media-stream` WebSocket route exists but the
  actual Twilio<->ElevenLabs audio relay + DTMF synthesis (`audioop`) hasn't
  been ported from the Node bridge yet — that's the next implementation pass.
- `call-handling-svc`'s actual call-placement logic (dialing Twilio/
  ElevenLabs, transcript extraction, outcome classification) isn't wired up
  yet — only the data layer (`POST /calls` records a call already placed).
- No frontend yet (`frontend/` referenced by docker-compose doesn't exist).

## Local development

1. Build the shared base image (every service's Dockerfile starts `FROM
   ace-cadence-base:latest`, so this must run first, and again whenever
   `base-image/` changes):
   ```
   docker build -t ace-cadence-base:latest ./base-image
   ```
2. Copy `.env.example` to `.env` and fill in real values.
3. `docker-compose up --build`

## Database setup

Not yet decided/built (see "Current status"). Options on the table: Alembic
migrations (matches the architecture plan's tech-stack decision) vs. a raw
SQL bootstrap script vs. `Base.metadata.create_all()` for early dev. Nothing
here creates tables in a live MySQL instance yet.
