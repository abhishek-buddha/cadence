# Appointment confirmation calls

This optional module creates and edits SQL appointments, calls the patient's mobile,
confirms attendance, reschedules or cancels after patient confirmation, and
transfers the same call to a Cadence operator for other assistance when needed.

## Using it

1. In **Master Data → Patients**, edit the patient and enter **Mobile number (with
   country code)**, for example `+14155550123`. The field is optional for existing
   patients and follows the table's existing PII masking.
2. In **Appointments → Scheduling**, create an appointment using an existing patient and provider.
   The patient's saved mobile prefills the form. Confirm the local appointment
   date/time, IANA clinic timezone, location, and patient instructions.
3. Open the patient from the appointments list. **Edit appointment** can change
   its phone number; changing Master Data does not rewrite existing appointments.
4. Open **Reminder** (or **Open reminder & call** from Scheduling) and click
   **Call patient** explicitly. Loading or refreshing a page never dials.
   The detail page shows live audio/transcript, call history, and recordings.
5. Operators prepare the existing browser phone on **My Queue** or **Live Sessions**.
   Only ready phones with a recent appointment heartbeat receive automatic offers.
   A monitoring operator can also click **Take over call** on the appointment.

Before disclosure, the agent asks the patient to state their date of birth. A
server tool compares it to SQL; the stored DOB and internal notes are not sent to
the model. After verification the agent can use the stored appointment, provider
phone, patient instructions, and patient insurance identifiers. Missing information,
clinical questions, and requests for a person go to an operator. Rescheduling and
cancellation are handled directly by the agent; they do not request an operator.
No available operator means offering a callback and recording it only after consent.
The callback request appears on the appointment until marked complete.

Scheduling and Reminder retain their existing tab, table and detail-card patterns.
Both show the same SQL appointments, including cancelled records. Scheduling owns
creation/editing; Reminder owns dialing. Existing transcript cards now display real
appointment history and audio players. Unrecorded insurance-plan names, time
preferences and no-show risk are shown honestly as unavailable, without demo data.

**Booking tags:** Scheduled, Rescheduled, Cancelled. Attendance confirmation is
stored separately and never overwrites Rescheduled. **Call tags:** Not Called,
Initiating/In Progress, No Answer, Completed, Failed. No Answer comes from Twilio's
terminal result, including reconciliation; its special mapping is conditional on
`use_case='appointment'`, so claims keep their existing failed-call semantics.
Booking and call status columns sit immediately after the patient name. The two
tag filters beside search combine with each other and the search text; Clear
filters restores the full list. Appointment and call dates use `YYYY-MM-DD h:mm AM/PM`.
Call timestamps are displayed in the appointment's clinic timezone; the timezone
is shown separately in details and on hover in the list.

The agent resolves requested dates in the appointment's existing IANA clinic
timezone and clarifies missing dates or AM/PM. Booking changes use two steps:
the first tool call stores a pending change and returns a random confirmation ID;
the second must echo that ID after a later patient turn with explicit confirmation.
The bridge supplies the turn count, never the model. Same-turn commits, unverified
patients, past/invalid/DST-ambiguous times and actions after takeover are rejected.
The original slot/timezone and each successful voice change are retained. Detail
pages refresh via invalidation with a three-second polling fallback; lists poll
every five seconds. No provider availability/calendar integration is present:
rescheduling updates the Cadence booking to the patient's confirmed requested slot.
The agent must not promise that an external calendar has reserved that slot.

## Call wiring and isolation

```text
Appointment detail → appointment API → Twilio outbound Calls.json
  → /appointment-voice/start → /appointment-media-stream
  → dedicated ElevenLabs agent + client tools
  → existing browser monitor

Agent requests human OR monitoring operator requests takeover
  → reserve available operator → browser joins existing Twilio conference
  → redirect original patient leg into that conference
  → AI stream closes; patient stays on the same phone call
  → Twilio completion callback closes the call and releases the operator
```

- The Node bridge adds `appointments.js` and its own WebSocket path. Claims keep
  `/media-stream`, their IVR detection, agents, and outbound dialing modes.
- Appointment routes and tools live in `app/routers/appointments.py`. The new
  recording callback/transcription path lives in `app/appointment_recordings.py`.
- `calls.use_case='appointment'` identifies these calls. Existing `/calls` lists
  exclude them, preserving claims reports. Appointment history has its own endpoint.
- The existing handoff machinery joins the browser before redirecting the patient.
  Appointment context and retry handling are conditional on that use case.
- Ending an ElevenLabs conversation or media stream never closes an appointment
  phone call. Signed Twilio status callbacks correlate using call ID and a random
  call token, including when the initial dial response is lost. Existing Twilio
  reconciliation remains the fallback once a call SID is known.
- The bridge authenticates internal tool/artifact requests with a shared secret
  and the individual call token. Appointment CRUD/history require a valid staff
  session. Existing shared telephony/recording routes retain their current access
  model; this change is not an application-wide authentication overhaul.

## SQL migration

Production MySQL 8.0.46 was inspected before authoring the migration. It had no
appointment tables or patient phone column; `calls.insurance_contact_id` was
non-nullable. `db/migrations/001_appointments.sql` makes these changes:

| Change | Purpose |
|---|---|
| `appointments` | Patient/provider references, phone snapshot, slot/timezone, original slot/timezone, attendance confirmation timestamp, instructions, notes, status, callback request |
| `appointment_calls` | Links existing call artifacts to the appointment; stores identity verification, pending booking confirmation and transcription errors |
| Nullable `calls.insurance_contact_id` | A direct patient call has no payer contact; existing values are retained |
| Nullable `patients.phone VARCHAR(20)` | Optional editable master-data mobile number |

The runner uses a MySQL named lock, checks existing column types, and skips
already-applied alterations. Repeated execution was tested on a separate MySQL
database. `db/schema.sql` also includes the schema for fresh installations.
The migration is still unreleased. It also upgrades the earlier review schema
idempotently, converting the old `confirmed` booking status to `scheduled` while
preserving its attendance confirmation timestamp. No production records have
been converted.
DDL can acquire table locks and autocommits in MySQL: take the normal database
backup and deploy during an appropriate maintenance window. Do not assume a
multi-statement transaction can undo a partially applied migration.

## Configuration and deployment

The implementation targets `Ace_Cadence` in the app repository and
`ace-cadence-bridge` in the bridge repository. Synthetic review records are never
seeded by deployment. Existing Twilio number settings do not need changes.

App environment (`Ace-Cadence/.env`):

```dotenv
APPOINTMENTS_ENABLED=true
APPOINTMENT_AGENT_ID=agent_1101m8bhz3gnf7sbsdwdd2wh9cdy
APPOINTMENT_BRIDGE_SECRET=<new-random-secret>
```

Bridge environment: set the same `APPOINTMENT_BRIDGE_SECRET`. Existing Twilio
credentials/caller ID/TwiML App and ElevenLabs credentials are reused. Existing
`PUBLIC_BASE_URL`, `BRIDGE_SERVER_URL`, and `CADENCE_API_BASE_URL` must continue to
point to this AWS installation. No inbound Twilio number URL changes are needed.

The dedicated agent is **Cadence Appointment Confirmation**. Its voice and English
language were copied from the existing claims agent; that agent was not edited.
`scripts/setup_appointment_agent.py --source <claims-agent-id>` prints configuration;
`--create` creates only if the named appointment agent does not exist. Use
`--update <appointment-agent-id>` to update its prompt/tools; it refuses the source
agent and agents with a different name. The appointment agent now has dedicated
reschedule/cancel tools; claims voice, prompt and tools are unchanged.

Deployment order, after approval:

1. Finish active calls before restarting telephony containers.
2. Back up SQL and save the current app/bridge commit IDs for code rollback.
3. Configure the new bridge secret and deploy the bridge change first. Its existing
   workflow now watches `appointments.js`, and its Docker image copies that file.
4. Configure the app flag, agent ID, and same secret. Deploy the app change.
   `deploy.sh` builds containers, runs the opt-in migration **before** starting
   the new containers, then restarts nginx to resolve updated service addresses.
   Master Data receives the same feature flag.
   The GitHub workflow fetches and runs the target branch's deploy script from a
   temporary file, so the first rollout uses the new migration logic while the
   script can still compare the old checkout with the new commit.
5. The app workflow already includes all changed app/UI/deployment paths. Pushes
   to `Ace_Cadence` and `ace-cadence-bridge` trigger real production deployments;
   feature branch work alone does not deploy. Do not manually pull first: use the
   existing deployment script's change detection, or its `--force` option.
6. Verify the feature with a consenting test recipient and an operator using the
   browser microphone before calling patients. Test unknown-question transfer,
   manual takeover, unavailable operator/callback, hangup from both ends, recording,
   and a claims regression call through each configured mode.

Operator recording transcription uses ElevenLabs `scribe_v2`. The user enabled
`speech_to_text` permission on 2026-11-26, and a real API request returned HTTP 200.
A second test processed a synthetic two-speaker appointment conversation through
the production transcription/save function: speaker separation, SQL persistence,
error clearing, agent transcript preservation, history API, and browser display
all passed. The test supplied local synthetic audio directly to that function;
it did not place a phone call or create a Twilio conference recording.

Recordings are retained if transcription fails, with a manual retry in the
appointment. Speaker labels use diarization IDs without guessing which person is
the operator. The voice agent remains disconnected during the human conversation;
transcription runs after the recording is ready. No automatic provider fallback
is configured. Twilio Batch Transcription was considered but its setup returned
403 / 46009 pending acceptance of account AI/ML terms. No Twilio configuration was
created, and the user subsequently chose ElevenLabs.

## Disable or remove

Set `APPOINTMENTS_ENABLED=false` and recreate the app services during a quiet
window. New appointment operations and patient mobile editing are disabled, the
former appointment UI returns, and the migration runner skips its work. Leave
schema and stored call history in place; no data deletion is needed. Existing
in-flight status/recording callbacks can still settle records.

For source removal, the feature is grouped under `src/features/appointments`, the
new Python files, the migration, and bridge `appointments.js`. Revert their small
imports/routes and conditional handoff hooks together. Do not restore
`insurance_contact_id NOT NULL` while appointment call rows contain NULL. Old
claims code remains compatible with the added tables/nullable column.

Disabling the flag does not undo shared code changes. If a shared regression
requires full code rollback, drain active calls first and restore both app and
bridge versions. After appointment calls have been stored, the original `/calls`
endpoint would include those rows in generic call lists/reports again. Preserve
the small appointment-exclusion filter when removing the feature, or plan a
backed-up archival migration; do not delete call history merely to roll back.

## Local UI review

The current preview is at `http://127.0.0.1:5173/appointments`. Use PIN `111111`,
then **Admin > Review Admin** (or **Operator > Review Operator**). This is the
normal login flow with synthetic accounts. The frontend runs locally in Vite;
its API proxy points to `http://127.0.0.1:18080`, an SSH tunnel to a separate
review backend/database on EC2. It never points to the production database.
No real dialing credentials are supplied, so Call patient returns a configuration
error without placing a call. No public test port is opened on EC2.

You can review master-data mobile editing, appointment creation/editing, details,
tag filters and call history. The current list has ten realistic synthetic patients,
clinics and December 2026 appointments. Its call histories are illustrative fixtures,
labelled in internal notes; no phone calls or recordings were created for these rows.
The previous integration/real-agent test appointments and their evidence were
archived before refreshing the list; original call artifacts remain in SQL.
The local archive is `C:\Users\Admin\tmp\appointments-before-ui-preview-20261126.json`,
with a second copy in the isolated EC2 review directory. It includes the earlier
real Scribe transcript (call 4); it is no longer linked to the curated UI examples.
Other app modules are not fully provisioned in this reduced review stack.

`tests/appointment_preview_data.py` refuses any database except `cadence_review`
and any environment with Twilio dialing credentials. Use `--archive <new-file>`
first, copy that archive outside the container, then `--replace-from <same-file>`.
It checks the snapshot is unchanged before replacing appointment rows/links in a
transaction. `tests/appointment_list_review.cjs` checks the curated list, filters,
date format and responsive layout; `tests/appointment_format.mjs` checks formatting
edges. The older integration/UI suites use their own fixtures and should run before
refreshing the curated list, not while the user is reviewing these examples.

From `Ace-Cadence-Ui`, the local frontend command is:

```powershell
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:18080'
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The review backend and SSH tunnel must also be running. Local process IDs and
logs are under `C:\Users\Admin\tmp\cadence-preview-*` and `cadence-ui-preview*`.
Do not start a second copy while the provided preview is active. Review sessions
expire; use the normal login again rather than reusing the automated test token.

A fully local backend is possible with Docker running Linux containers: build
the shared base image and five service images (including live updates), run isolated MySQL/Redis, use
`tests/appointment_review_compose.yml`, and initialize only `cadence_review` via
`tests/appointment_integration.py`. Docker was not found on this device, so it
was not installed as part of this change. The current review Compose file reuses
service image tags already available on EC2; those images must be built locally
before using it on a new machine.

Actual phone-call tests additionally need Twilio/ElevenLabs credentials and a
public HTTPS/WSS tunnel for callbacks/media streams, plus a consenting recipient
and operator microphone. A localhost-only UI cannot receive provider callbacks.

## Verification performed

- Frontend production build and scoped ESLint; Python validation/timezone/DOB tests.
- Real disposable MySQL and FastAPI services: migration reruns, CRUD, staff auth,
  patient phone validation/update/clear, identity gate, attendance confirmation,
  two-step rescheduling/cancellation (including declined and same-turn commits),
  original slot/history persistence, No Answer and unchanged claims semantics, callback,
  operator presence, concurrent operator reservation, handoff retry, AI-close lifecycle, signed status correlation,
  and exclusion from claims call lists.
- Playwright with Chrome against that real review stack: master-data mobile edit
  and persistence, appointment phone prefill, tab-specific layouts,
  live reschedule/cancel updates, cancelled-record visibility, create/edit/details/history, desktop
  and narrow-screen rendering, navigation, and no React page errors.
- Real dedicated ElevenLabs text conversation: verification, confirmation,
  unknown-question escalation, unavailable operator, agreed callback. The new
  text-only booking test verified rescheduling, declined cancellation and later
  confirmed cancellation with no operator request.
- Real ElevenLabs audio through the new bridge using locally generated synthetic
  speech and the Twilio WebSocket protocol: both audio tracks, live transcript,
  verification and rescheduling tools, real ASR patient-turn confirmation gating,
  artifact persistence, and stream-close behavior. A split/repeated spoken
  confirmation was tested and did not request a human operator.
- Real ElevenLabs two-speaker STT through `save_transcription`, isolated SQL,
  history API, and Chrome UI; failures preserve the recording, and completed
  transcripts skip duplicate processing. Review script: `tests/appointment_transcription.py`.
- Bridge JavaScript syntax and scoped UI design checks; nginx configuration test,
  Compose configuration validation, deploy script syntax, and disabled migration skip.

Tests use synthetic records and an isolated `cadence_review` database. They did
not place a PSTN call. End-to-end mobile dialing, human audio takeover, conference
recording delivery, and transcription of an actual phone recording still require
the consenting test call. Existing dependency audit findings were not
changed by adding packages; this feature adds no runtime dependency.

For repeatable agent tests, run `tests/appointment_voice_fixture.py` inside the
review API container to obtain synthetic appointment/call IDs (it refuses a
production database or dialing credentials). `tests/appointment_agent_conversation.cjs`
takes the call ID and appointment ID, with the ElevenLabs key on stdin. It uses
ElevenLabs text-only mode, not phone dialing. The bridge's
`appointment-live-review.mjs` accepts those IDs and three generated 8 kHz mu-law
WAV files via its `REVIEW_*` environment variables. Finish its synthetic call with
`appointment_voice_fixture.py --finish`; keep the review UI running for inspection.
