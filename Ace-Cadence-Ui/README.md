# Ace-Cadence-Ui

React frontend for the Ace-Cadence rewrite — forked from the pre-rewrite
Convex-backed app (`Ace-Cadence-old/src`) per the architecture plan's own
recommendation ("forking is the practical default"), with the data layer
swapped from Convex reactive queries to REST + WebSocket calls against the
new [Ace-Cadence](../Ace-Cadence) backend. UI structure, styling, and
component tree are otherwise unchanged.

## Stack

Vite + React 19 + TailwindCSS 3 + React Router 7 (unchanged from before).
Native `fetch`/`WebSocket` replace the Convex client — see `src/api/*.js`
(one typed module per backend service) and `src/hooks/useLiveQuery.js` /
`useCallStream.js`.

## Running it

```bash
npm install
npm run dev      # proxies /api and /ws to http://localhost:80 (nginx) —
                  # override with VITE_API_PROXY_TARGET if nginx/services
                  # are running elsewhere
npm run build     # production build -> dist/, served by nginx per
                  # Ace-Cadence/nginx/nginx.conf
```

## Conversion status

**Converted — wired to the new backend:**
- Auth flow: `AccessCodePage` (login-svc `/auth/verify-pin`), `LoginSelectPage`
  (user-management-svc `/users`), real session creation in `App.jsx`
  (login-svc `/auth/session`).
- Master Data: `ProvidersPage`, `InsuranceDirectory` (payers, incl. IVR
  playbook + verification staleness), `PatientsPage`, `MasterDataPage`
  (tab wrapper) — all master-data-svc.
- `ProviderFilterContext` (providers list, used app-wide for the provider
  filter).

**Stubbed — renders a safe placeholder instead of crashing:**
- `HandoffNotifier` (live-handoff toast) — data exists on the backend
  (call-handling-svc `GET /calls?handoff_state=awaiting_human`) but the
  live-refresh wiring isn't built.
- `ClaimUserRoutingDrawer` (agent-availability panel) — needs an
  aggregation pass across `calls` + `users` that hasn't been ported.
- `BulkImportInsuranceModal` (Excel payer bulk-import) — no bulk-import
  endpoint on master-data-svc yet.
- `InsuranceDirectory`'s "Generate playbook from transcript" — no
  OpenAI-backed endpoint on call-handling-svc yet; shows an inline message
  instead of failing silently.

**Not yet migrated — routed to `NotYetMigrated` placeholder, original
source untouched in `Ace-Cadence-old/src` for reference:** Dashboard,
Claims (list + detail), Call Audit (history + live), Sessions, Reports,
Audit Log, Users (+ groups), Transfer Destinations, Settings, Operator
Queue, Operator Dashboard. These all depend on backend features beyond
plain CRUD (dashboard aggregates, AI Excel import, live call
audio/transcript streaming, outcome/report computation) that haven't been
built yet in call-handling-svc / reports-dashboards-svc.

**Static — unchanged, no backend wiring in the pre-rewrite app either:**
Appointments, Benefit Verification, Eligibility Verification, Prior
Authorization, Patient Balance Reminder, Inbound Billing (list + detail
pages each).

## Field naming note

The new backend returns plain dicts with `id` (integer) and snake_case
column names (`practice_name`, `date_of_birth`, ...) instead of Convex's
`_id` (string) and camelCase fields. Every converted page/component reads
the new shape directly — don't copy patterns from an unconverted page
without checking which convention it's still on.
