# Morning Demo Walkthrough — Cadence × Medusind RFP

**Branch:** `overnight/2026-04-17-rfp-foundation` (pushed to GitHub, NOT merged to main)

This walks you through testing every RFP-required feature by acting as the insurance rep yourself. Cadence calls your phone; you read the matching script from `payer-scripts.md`.

---

## 0. Pre-flight setup (15 min, ONE-TIME)

### 0.1 Authenticate Convex CLI (interactive)
```bash
cd C:/Users/Algonox/cadence
npx convex dev
# Follow login prompts in browser. Press Ctrl+C after "Convex functions ready!"
```
This caches your Convex auth token at `~/.convex/`.

### 0.2 Deploy schema + functions to prod Convex (`colorless-cardinal-959`)
```bash
npx convex deploy --cmd 'npm run build'
```

### 0.3 Seed demo data (idempotent — safe to re-run)
```bash
npx convex run devSeed:seedDemoData
```
Inserts 5 medical payers, 5 dental payers, 3 dental plans, 8 patients, 2 providers, 6 claims, 4 EV cases, 2 transfer destinations, 3 users (admin/manager/viewer).

### 0.4 Merge or deploy frontend
Either merge `overnight/2026-04-17-rfp-foundation` → `main` (auto-deploys via Render):
```bash
git checkout main && git merge overnight/2026-04-17-rfp-foundation && git push
```
Or trigger Render deploy from the branch via the Render dashboard.

### 0.5 (Optional) Setup ElevenLabs dental agent
The dental EV calls need a dedicated ElevenLabs agent. Set `ELEVENLABS_API_KEY` then:
```bash
node scripts/setup-elevenlabs-agents.mjs
# Outputs two agent IDs. Copy them into Convex env vars:
# ELEVENLABS_MEDICAL_AGENT_ID and ELEVENLABS_DENTAL_AGENT_ID
```
If you skip this, dental calls will use the existing medical agent (degraded but functional).

### 0.6 Configure your phone as the test payer

Open Cadence: `https://cadence-new.onrender.com` (or wherever Render deployed)
Login PIN: `472394`

Insurance Directory → edit each test payer (Aetna, Delta Dental):
- Set **Phone** to your real cell number in E.164 format (e.g., `+15551234567`)
- (Optional) clear or simplify IVR steps to skip DTMF and go straight to "rep"
- Save

You now have 5 medical and 5 dental payers all pointing at your phone.

### 0.7 Verify sidebar shows new pages
Should see: Eligibility, Sessions, Reports, Transfers, plus role-gated Admin group (Audit Log, Users, API Keys, Webhooks).

---

## 1. Demo: Medical claim, full extraction (5 min)

**Tests:** R-UC-6/7/8/9 (medical claims), R-ACC-1 (100% retrieval), R-OUT-1 (successful classification), R-CONV-5 (transcript format), R-RPT-1 (call log)

1. Claims → click any pending claim with **Aetna** as insurance
2. Click **Initiate Call**
3. Your phone rings — answer
4. LiveCallMonitor opens, shows call status updating
5. Read **script M1** from `payer-scripts.md` slowly
6. Hang up after rep monologue
7. Wait ~30 seconds — outcome card appears
8. Verify **OutcomeBadge = green "successful"**
9. Verify call result shows: claimStatus=paid, paidAmount=$500, paidDate=2026-04-10, checkOrEftNumber=EFT-2026-04-12345, referenceNumber=AETNA-REF-987654, repName=Sarah
10. Reports → Success Rate tab → counts incremented

---

## 2. Demo: Denied CO-45 (3 min)

1. Initiate call on another Aetna claim
2. Read **script M2**
3. Verify outcome **successful**, denialCode=CO-45, denialReason set, appealDeadline=2026-07-10

---

## 3. Demo: Partial outcome (5 min)

**Tests:** R-OUT-2 (partial classification), R-ACC-2 (sub-100% = not successful)

1. Initiate call on a Cigna claim
2. Read **script M5** (rep gives status only, refuses other fields)
3. Verify outcome = **yellow "partial"**
4. Hover the OutcomeBadge → tooltip shows missing fields chip list
5. Click **Retry** button (visible on partial calls)
6. Phone rings again — answer
7. This time read M1 script fully → outcome flips to successful

---

## 4. Demo: Voicemail (failed) (3 min)

1. Initiate any call
2. Read **script M6** (voicemail greeting, then silence + hang up)
3. Verify outcome = **red "failed"**, callStatus reflects voicemail

---

## 5. Demo: Dental EV — active coverage (5 min)

**Tests:** R-UC-1 through R-UC-5 (entire dental EV vertical), R-CONV-3 (human-like)

1. Sidebar → **Eligibility**
2. Click an awaiting case with **Delta Dental** as insurance
3. Click **Run EV Call**
4. Phone rings — answer
5. Read **script D1**
6. Verify EV Results card populates with:
   - Coverage Active badge (green)
   - In-Network badge
   - Deductible meter showing $50 / $50 (full)
   - Annual Max meter showing $750 used / $1500 total
   - Coinsurance row: 80% in / 50% out
   - Frequency Limits table includes D1110 (1 of 2 used)
7. Verify case status = "verified", outcome = successful

---

## 6. Demo: Dental EV — inactive (3 min)

1. Eligibility → another awaiting case (any dental payer)
2. Run EV Call → answer → read **script D2**
3. Verify isActive=false, no benefits fields, outcome=successful (only base fields required for inactive)

---

## 7. Demo: Multi-patient session (10 min)

**Tests:** R-CONV-6 (multi-patient handling)

1. Sidebar → **Sessions** → **New Session**
2. Step 1: pick payer **Aetna**
3. Step 2: multi-select 3 pending claims (must be Aetna)
4. Step 3: confirm
5. Phone rings — answer
6. Agent introduces session ("I have 3 patients to verify today")
7. Agent reads identifying info for patient 1 — read **MP1** patient-1 response
8. Agent says "may we look up our next patient?" — read MP1 patient-2 response
9. Agent transitions to patient 3 — read MP1 patient-3 response
10. Hang up after all 3
11. Verify session detail page shows 3 items, each with their own outcome badge, aggregate = successful

---

## 8. Demo: Multi-patient — refused (5 min)

1. New Session → Aetna → 3 claims → confirm
2. After patient 1 read **MP2** (rep refuses additional patients)
3. Verify session = **partial**, items = [successful, refused_by_payer, refused_by_payer]

---

## 9. Demo: Human transfer (5 min)

**Tests:** R-CONV-4 (transfer to human)

1. Pre: Sidebar → **Transfers** → Add Destination: name "Demo Help Desk", phone = your second number (or same), kind = warm, enabled
2. Initiate any medical call
3. After answering, read **script T1** ("I need to transfer you to my supervisor")
4. Verify call detail shows `transferredAt`, `transferType=warm`, `transferDestination` populated
5. Audit log → see `transfer` action recorded
6. (If webhook set up — see Demo 11) → webhook received `call.transferred` event

---

## 10. Demo: Public REST API (5 min)

**Tests:** R-INT-1 (define APIs), R-INT-2 (auth), R-INT-3 (data formats)

1. Sidebar → **API Keys** → Issue New Key
   - Name: "demo-test"
   - Scopes: read:claims, read:cases, read:calls, read:reports
2. Copy the displayed full key (shown ONCE)
3. From terminal:
```bash
KEY="paste_your_key_here"
BASE="https://colorless-cardinal-959.convex.site"

# List payers
curl -H "Authorization: Bearer $KEY" $BASE/v1/payers

# Get reports
curl -H "Authorization: Bearer $KEY" "$BASE/v1/reports/success-rate?fromDate=2026-04-01&toDate=2026-04-30"

# Create a new EV case
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"patientId":"<id>","insuranceContactId":"<id>","providerId":"<id>","proposedDateOfService":"2026-05-01","cdtCodes":["D0150","D1110"]}' \
  $BASE/v1/eligibility-cases
```
4. Verify each returns valid JSON
5. Open **Audit Log** → see API requests recorded

OpenAPI spec: `docs/rfp-response/openapi.yaml`.

---

## 11. Demo: Webhooks (5 min)

**Tests:** R-INT-3 (output formats), webhook delivery

1. Open https://webhook.site (free) — copy the unique URL
2. Sidebar → **Webhooks** → Add Subscription
   - URL = your webhook.site URL
   - Events: select `call.completed`, `call.outcome_classified`, `transfer.initiated`
   - Save (auto-generates secret)
3. Click **Test Fire** button → verify webhook.site receives `webhook.test` event
4. Initiate any call (skip to demo 1 script)
5. After call completes, webhook.site receives 2 events: `call.completed` then `call.outcome_classified`
6. Verify each payload has `X-Cadence-Signature: sha256=...` header (HMAC of payload+timestamp)

---

## 12. Demo: RBAC + Audit (5 min)

**Tests:** R-INT-2 (authorization), audit log requirement

1. Sidebar → **Users** → see admin/manager/viewer test users
2. Change "viewer" user role to "operator" → verify dropdown updates and audit log captures
3. Sidebar → **Audit Log** → filter by action=update, resourceType=user → see the role change recorded
4. Filter by `phiAccessed=true` → see all the API calls + page loads that touched PHI

---

## 13. Demo: Reports (5 min)

**Tests:** R-RPT-1 through R-RPT-5

Sidebar → **Reports**:
- Tab "Success Rate" → bar chart of success/partial/failed by week
- Tab "Data Accuracy" → per-payer accuracy score
- Tab "Turnaround Time" → p50/p95/p99 by use case
- Tab "Exception Report" → calls flagged for high hold time / partial spike
- Tab "Volume by Tier" → current month volume classified into tiers

Click "Export CSV" on any tab → downloads a CSV.

---

## 14. Demo: Bulk import (5 min)

1. Claims page → **Import** → drag `test-data/medical-claims-demo-50.xlsx`
2. Preview shows 50 rows with column mapping
3. Click **Import All** → verify 50 new claims appear in list
4. Eligibility → **Import Cases** → drag `test-data/dental-ev-cases-demo-30.xlsx`
5. 30 EV cases imported

---

## 15. Demo: Voice IVR (3 min)

**Tests:** R-IVR-3 (voice-based prompts)

A payer must have `voiceIvrEnabled=true` (set by devSeed for the medical payers).

1. Initiate call on any seeded medical payer
2. When phone rings, read **script V1** (voice menu offering "say claims or press 1")
3. Cadence agent should say "claims" within 5 seconds
4. Continue with M1 script

---

## Cleanup / reset

To wipe all calls/results and re-seed:
```bash
npx convex run devSeed:wipeAndReseed
```

---

## Known limitations (demo scope)

- **No real HIPAA compliance** — demo only, do not call real patients or use real PHI
- **No real SSO/SAML** — RBAC role is hardcoded to "admin" via AuthContext. UsersPage works but doesn't actually swap your session role
- **Webhook signing key** stored plaintext — pilot hardening
- **Recording playback** unavailable — Twilio recording config not enabled in dev
- **Voice-IVR adaptive learning** records traces but no nightly aggregator (would need a Convex cron — see Phase 4c)
- **Auto-retry orchestrator** classifies but doesn't auto-retry on a schedule (manual retry button works)
- **OpenAPI spec** is published in docs but the `/v1/openapi.json` endpoint returns a stub
- **Payer simulator** is committed at `C:/Users/Algonox/cadence-payer-simulator/` but not deployed to Render — for overnight automated tests; not needed for your manual demo

## If something breaks

1. Re-run `npx convex deploy --cmd 'npm run build'` — most likely a stale function
2. Check Convex dashboard logs at https://dashboard.convex.dev/ → deployment colorless-cardinal-959 → Logs
3. `npx convex run devSeed:wipeAndReseed` to reset state
4. The test plan classifies what should pass: `docs/superpowers/plans/2026-04-17-cadence-test-plan.md`
5. The gap plan documents architecture decisions: `docs/superpowers/plans/2026-04-17-cadence-medusind-rfp-gap-plan.md`
