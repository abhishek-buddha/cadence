// scripts/duplicate-elevenlabs-agent.mjs
//
// Duplicate an existing ElevenLabs Convai agent into a brand-new agent, copying
// its full configuration (system prompt, voice, tools, turn settings, AND the
// security/overrides config) so the clone behaves identically to the source.
//
// This is used to isolate the `cadence_pro_ivr` branch onto its own agent
// ("Cadence Pro") without touching the working production agent
// ("Cadence AR Follow-up").
//
// The clone deliberately preserves `platform_settings` from the source, which
// is where ElevenLabs stores the "enable overrides" flags. Cadence sends a
// per-call system-prompt override (conversation_config_override.agent.prompt),
// and if the agent does not allow that override the conversation is rejected at
// media-stream start (Twilio error 31921, 0-second call). Copying
// platform_settings verbatim keeps whatever the source agent already permits.
//
// Usage (PowerShell):
//   $env:ELEVENLABS_API_KEY="sk_..."; `
//   $env:SOURCE_AGENT_ID="agent_4201khe51edkerfsyg6kfg8x75h6"; `
//   $env:NEW_AGENT_NAME="Cadence Pro"; `
//   node scripts/duplicate-elevenlabs-agent.mjs
//
// Usage (bash):
//   ELEVENLABS_API_KEY=sk_... \
//   SOURCE_AGENT_ID=agent_4201khe51edkerfsyg6kfg8x75h6 \
//   NEW_AGENT_NAME="Cadence Pro" \
//   node scripts/duplicate-elevenlabs-agent.mjs
//
// On success it prints the new agent_id. Paste that into the cadence_pro_ivr
// Convex deployment as ELEVENLABS_AGENT_ID:
//   npx convex env set ELEVENLABS_AGENT_ID "agent_...<new>"
//
// Requires Node 20+ (native fetch).

const API_BASE = 'https://api.elevenlabs.io/v1';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const SOURCE_AGENT_ID = process.env.SOURCE_AGENT_ID;
const NEW_AGENT_NAME = process.env.NEW_AGENT_NAME || 'Cadence Pro';

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!API_KEY) die('ELEVENLABS_API_KEY is not set.');
if (!SOURCE_AGENT_ID) die('SOURCE_AGENT_ID is not set.');

async function getAgent(agentId) {
  const res = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': API_KEY },
  });
  if (!res.ok) {
    die(`Failed to fetch source agent ${agentId} (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function createAgent(body) {
  const res = await fetch(`${API_BASE}/convai/agents/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    die(`Create failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log(`Fetching source agent ${SOURCE_AGENT_ID}...`);
  const src = await getAgent(SOURCE_AGENT_ID);
  console.log(`  Source name: "${src.name}"`);

  // Build a create body from the source's copyable config. We only forward the
  // fields the create endpoint accepts; agent_id / metadata / access_info are
  // read-only and must not be sent.
  const body = {
    name: NEW_AGENT_NAME,
    conversation_config: src.conversation_config,
  };
  if (src.platform_settings) body.platform_settings = src.platform_settings;
  if (src.tags) body.tags = src.tags;

  const overridesPresent = !!(
    src.platform_settings &&
    (src.platform_settings.overrides || src.platform_settings.conversation_initiation_client_data_webhook)
  );
  console.log(
    `  platform_settings copied: ${!!src.platform_settings}` +
      (overridesPresent ? ' (includes overrides config)' : '')
  );

  console.log(`Creating clone "${NEW_AGENT_NAME}"...`);
  const created = await createAgent(body);
  const newId = created.agent_id || created.id;

  console.log('\n=== DONE ===');
  console.log(`New agent created: ${newId}`);
  console.log('\nNext steps:');
  console.log(`  1. Set it on the cadence_pro_ivr Convex deployment:`);
  console.log(`       npx convex env set ELEVENLABS_AGENT_ID "${newId}"`);
  console.log(`  2. In the ElevenLabs dashboard, open "${NEW_AGENT_NAME}", adjust settings as needed,`);
  console.log(`     confirm Security > overrides for "System prompt" is ENABLED, then Publish.`);
  console.log(`  3. Retest a call from the Claims page.`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
