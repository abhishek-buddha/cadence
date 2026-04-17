# Cadence — Project Guidelines

## Stack
- React 19 + Vite 7 + TailwindCSS 3 (frontend)
- Convex 1.31+ (real-time backend, deployment `colorless-cardinal-959` / production)
- ElevenLabs Conversational AI (voice agents)
- OpenAI GPT-4o family (transcript analysis & extraction)
- Twilio Voice (telephony, outbound calls)
- Auth: PIN gate (`AccessCodePage`, default PIN `472394`), AuthContext (demo-grade RBAC)
- No React StrictMode (causes double-mount with persistent voice/WS state)

## Deployment
- **Frontend**: Render web service `cadence-new` (Docker, auto-deploys from `main`). Live at https://cadence-new.onrender.com
- **Backend**: Convex Cloud — production deployment `colorless-cardinal-959`
  - Cloud URL: https://colorless-cardinal-959.convex.cloud
  - HTTP Actions URL: https://colorless-cardinal-959.convex.site
- **Bridge**: Render web service `cadence-bridge` (WebSocket relay for live transcript / audio)
- **Payer simulator** (test infra): repo `abhishek-buddha/cadence-payer-simulator`, deployable to any Node host (Render Free, Vercel, Fly.io, Cloudflare Workers, or local + ngrok)
- **Deploy commands**:
  ```bash
  # Convex prod (requires CONVEX_DEPLOY_KEY env or cached login)
  CONVEX_DEPLOY_KEY="prod:colorless-cardinal-959|..." npx convex deploy --cmd 'npm run build'

  # Frontend: push to main → Render auto-deploys
  git push origin main

  # Seed demo data (idempotent)
  CONVEX_DEPLOY_KEY="..." npx convex run devSeed:seedDemoData
  ```

## Testing Policy

**Two layers, both targeting deployed environments — no localhost mocking of features:**

### Layer 1 — Playwright MCP Browser (interactive / exploratory)
- Use the Playwright MCP browser tools (`mcp__plugin_playwright_playwright__browser_*`) for ad-hoc verification, screenshot capture, and live driving of the deployed app.
- Good for: smoke checks after a deploy, manual reproduction of a reported bug, demo recording.
- Always navigates against `https://cadence-new.onrender.com` (or staging once we add one).

### Layer 2 — `@playwright/test` framework (automated, repeatable)
- **Allowed and expected.** Lives in `tests/` at the repo root. Runs against the deployed app.
- Stack: `@playwright/test` (UI + API), `@axe-core/playwright` (accessibility), Allure reporter (cross-run trends).
- Run locally: `npx playwright test`
- Run a single suite: `npx playwright test tests/e2e/eligibility`
- Run a single test by ID: `npx playwright test -g "TC-DENTAL-UI-009"`
- Update visual baselines: `npx playwright test --update-snapshots`
- HTML report: opens automatically, or `npx playwright show-report`
- CI: GitHub Actions `.github/workflows/test.yml` runs the suite per push and nightly against prod.

### What's still forbidden
- **No unit tests** that mock production dependencies (Convex client, ElevenLabs SDK, Twilio SDK). If you can't test a function without mocking real services, the function is wrong.
- **No mock features in shipping code** — no demo-mode toggles, no `mock|dummy|fake|stub` filenames in `src/` or `convex/`, no hardcoded fake data in production paths. Real Convex queries with real (or seeded synthetic) data only.
- **No simulated delays** (`setTimeout` to fake "AI is thinking…").
- **No `// TODO: real API later` placeholders** in shipping code.

### What's allowed (the distinction)
- **Test infrastructure** — separate, real running services that simulate external systems (payer simulator, mock IdP, mock webhook receiver). These are real Express/Cloudflare-Worker services, source-controlled, deployed to their own URL. Cadence calls them in test mode the same way it calls real systems. They're not mocks of *features*; they're test doubles of *external dependencies*.
- **Synthetic test data** — generated via `convex/devSeed.ts`, seeded into the same prod Convex deployment (or a separate test tenant once we add one). Synthetic = realistic-looking, not real PHI.
- **Playwright Test** runs against the deployed app, not against a local dev server — no localhost mocking.
- **Test fixtures** under `tests/fixtures/` (golden transcripts, sample data, mock-payer profiles).

## Test Directory Conventions
```
tests/
├── playwright.config.ts          # configures projects (chromium/firefox/webkit), reporters
├── fixtures/
│   ├── auth.ts                   # PIN login helper
│   ├── seedData.ts               # synthetic data factories (Faker.js)
│   ├── transcripts/              # golden transcript JSON for extraction tests
│   └── api.ts                    # APIRequestContext wrappers + API-key fixture
├── helpers/
│   ├── convex.ts                 # `convex run` wrappers via CLI
│   └── waitForDeploy.ts          # poll /v1/health until ready
├── smoke/                        # TC-SMK-*
├── health/                       # TC-HLTH-*
├── e2e/
│   ├── dental-ev/                # TC-DENTAL-UI-*
│   ├── outcome/                  # TC-OUT-UI-*
│   ├── sessions/                 # TC-SESS-UI-*
│   ├── reports/                  # TC-RPT-*
│   ├── audit/                    # TC-SSO-AUD-*
│   ├── users/                    # TC-SSO-RBA-*
│   ├── webhooks/                 # TC-API-WH-* (UI parts)
│   └── api-keys/
├── api/                          # TC-API-CLM-*, TC-API-CAL-*, TC-API-EV-*, TC-API-AUTH-*
├── outcome-classifier/           # TC-OUT-CLS-* (calls convex action analyzeTranscript with golden fixtures)
├── visual/                       # TC-VIS-* (Playwright snapshot diff)
└── a11y/                         # TC-A11Y-* (axe-core)
```

## Allowed Dependencies (test-only)
Add via `npm i -D` — these don't ship to prod:
- `@playwright/test`
- `@axe-core/playwright`
- `allure-playwright`
- `@faker-js/faker`
- `dotenv` (for local test runs reading `.env.test`)

## Forbidden Production Dependencies
- Anything that introduces a fake/stub/mock layer in shipping code
- Service-mesh sidecars or proxies for "easier testing"
- Feature-flag systems used to disable real integrations

## Test-Infrastructure Service Hosting

When deploying mock payer / mock webhook receiver / mock IdP, prefer **in this order** (whichever is reachable without payment friction):

1. **Existing Render workspace** — if a service already running has spare capacity, mount as a sub-route. Otherwise free tier requires card on file (Render policy 2024+).
2. **Vercel** — generous free tier, no card for hobby projects, supports Express via `@vercel/node`. Best fit for the payer simulator (just HTTP routes returning TwiML).
3. **Cloudflare Workers** — free, no card, fast cold-start; HTTP routes only (no persistent WebSocket — fine for TwiML responder, not fine for the bridge).
4. **Fly.io** — has a free tier but requires card for verification.
5. **Local + Cloudflare Tunnel (`cloudflared`)** — for one-off tests. Run service locally, tunnel exposes a public URL Twilio can webhook to. Free, no card. Tunnel URL changes per session.
6. **ngrok** — same as #5; free tier with random URLs, paid for static URLs.

Document the chosen host + URL in the service's `README.md` and reference it in `cadence/.env.test`.

## Auth & RBAC (current, demo-grade)
- PIN gate: 6-digit PIN at `AccessCodePage` (default `472394`, override via Convex env `CADENCE_ACCESS_CODE`)
- AuthContext (`src/context/AuthContext.jsx`) hardcoded to `role: 'admin'` for demo
- Convex multi-tenancy: `userId` from `ctx.auth.getUserIdentity()?.subject ?? 'default'`
- Real SSO/SAML, real RBAC enforcement on backend, multi-tenant deploy: all deferred until the Medusind pilot signs

## Common Commands
```bash
# Deploy + seed
CONVEX_DEPLOY_KEY="..." npx convex deploy --cmd 'npm run build'
CONVEX_DEPLOY_KEY="..." npx convex run devSeed:seedDemoData

# Test commands (after running `npm i`)
npx playwright test                          # full suite
npx playwright test tests/smoke              # one folder
npx playwright test -g "TC-DENTAL-UI-009"    # one test
npx playwright test --update-snapshots       # refresh visual baselines
npx playwright show-report                   # open last HTML report

# Convex dev iteration (uses cached login or CONVEX_DEPLOYMENT from .env.local)
npx convex dev

# Generate demo bulk-import data
node scripts/generate-demo-data.mjs

# Set up ElevenLabs agents programmatically (needs ELEVENLABS_API_KEY in env)
ELEVENLABS_API_KEY="..." node scripts/setup-elevenlabs-agents.mjs
```

## When in doubt
- Prefer "test against deployed" over "test locally with mocks"
- Prefer "real test infrastructure that simulates external systems" over "mock the SDK"
- Prefer "seed synthetic data via devSeed" over "stub return values"
- A test that requires mocking Convex/ElevenLabs/Twilio at the SDK level means the abstraction is leaky — refactor instead
