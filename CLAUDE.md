# Cadence - Project Guidelines

## Testing Policy
- NO local tests - no unit tests, no local test runners, no test frameworks
- Testing happens ONLY in production environment after deploying to Render
- Use Playwright browser (MCP) to test the deployed app directly on the Render URL
- Verify functionality by navigating the live app in the browser

## Deployment
- Frontend: Render (static site)
- Backend: Convex Cloud (`groovy-wren-932`)
- Deploy Convex: `CONVEX_DEPLOY_KEY="dev:groovy-wren-932|..." npx convex deploy --cmd 'npm run build'`

## Stack
- React 19 + Vite 7 + TailwindCSS 3
- Convex (real-time backend)
- ElevenLabs Conversational AI (voice agent)
- OpenAI GPT-4o (transcript analysis)
- Twilio (telephony)
- No React StrictMode (causes double-mount issues)
