// scripts/patch-agent-payer-termination.mjs
//
// Surgical, idempotent patch for a live ElevenLabs Convai agent. Applies the two
// fixes for the failure seen in conv_2901ky4jbmtbfs0ry9knwdb1k1pj — the payer's
// IVR said "our office is now closed", the agent replied with a
// representative-voice sign-off and passed that text to end_call as a spoken
// message, and the IVR's next loop aborted the tool:
//   end_call -> "Tool execution was abandoned due to user input"  (is_error: true)
//
//   1. PROMPT — inserts PAYER_TERMINATION_GUIDANCE (convex/prompts/payerTermination.ts)
//      immediately before the "# IDENTITY" section, leaving every other section of
//      the live prompt byte-for-byte untouched. The live prompt has drifted from
//      the repo's composePrompt() output (its IVR-only section was hand-edited in
//      the dashboard), so a full re-push would clobber those edits.
//
//   2. end_call TOOL CONFIG — a prompt rule alone cannot stop a looping IVR from
//      aborting the hang-up mid-execution, so this is the structural fix:
//        interruption_mode: 'allow' -> 'disable_during_tool_and_turn'
//        pre_tool_speech:   'auto'  -> 'off'
//      and appends a no-spoken-message line to the tool description.
//
// Both steps are idempotent — re-running is a no-op once applied.
//
// Usage:
//   ELEVENLABS_API_KEY=sk_... node scripts/patch-agent-payer-termination.mjs --dry-run
//   ELEVENLABS_API_KEY=sk_... node scripts/patch-agent-payer-termination.mjs
//
//   # target a different agent (defaults to Cadence Plus V):
//   ELEVENLABS_AGENT_ID=agent_... node scripts/patch-agent-payer-termination.mjs
//
// A full backup of the agent config is written next to the script before any
// PATCH, so the previous state can always be restored.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const API_BASE = 'https://api.elevenlabs.io/v1';
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_5801kxx4zjhxfzcv5mz9c9nn26z4';
const DRY_RUN = process.argv.includes('--dry-run');

// Marker used for idempotency — the first line of PAYER_TERMINATION_GUIDANCE.
const SECTION_MARKER = '# WHEN THE PAYER ENDS THE CALL';
// The live prompt's first base-prompt section; the new guidance goes right above
// it so it outranks the base prompt's closing rules, matching the section order
// composePrompt() produces in convex/prompts/index.ts.
const ANCHOR = '# IDENTITY';

// Targeted clause rewrites — the live prompt licensed the agent to speak when
// nothing had been asked of it, which is what let it improvise the rep-voice
// sign-off in the failed call. Each entry is applied only if `from` is present;
// if `from` is missing but `to` is already there, it has been applied before.
// Keep these in sync with convex/prompts/medicalClaim.ts and voiceIvrNavigation.ts.
const REPLACEMENTS = [
  {
    label: 'listening-trigger (speak only when asked)',
    from: '- Only speak again once the IVR or rep has clearly said something new to respond to.',
    to:
      '- Speak ONLY when the IVR or rep has asked you a direct question or requested a specific input. ' +
      'A statement, announcement, notice, confirmation, or recitation of hours is NOT a question — it requires ' +
      'no response from you, only silence.\n' +
      '- If you cannot point to the exact question you are answering, do not speak.',
  },
  {
    label: 'silence-filler escape hatch (removed)',
    from:
      'If you genuinely must fill a silence, you may say ONE short line strictly from your own caller POV — ' +
      'for example: "One moment while I pull that up." or "Give me a second to get that." — and nothing more.',
    to:
      'Never fill a silence. There is no situation in an automated menu where an unprompted sentence helps you: ' +
      'the machine is not waiting on you, it is processing. Filler ("one moment", "let me get that", "okay", ' +
      '"sure") is heard as a menu response and can send you down the wrong branch. If nothing has been asked ' +
      'of you, your entire turn is silence.',
  },
  {
    label: 'voice-IVR answer-only-what-is-asked',
    from: '- After speaking your response, wait silently for the next menu or hold music.',
    to:
      '- After speaking your response, wait silently for the next menu or hold music.\n' +
      '- Answer only what is actually asked. If the IVR makes a statement rather than asking a question or ' +
      'requesting an input, say nothing at all.',
  },
];

// The live end_call description forbade hanging up on exactly the audio we now
// hang up on ("please hold… ringing, silence, hold music"), so it fought the
// prompt. Replaced outright rather than appended.
const END_CALL_DESCRIPTION =
  'End the call. On an IVR-navigation leg this is the NORMAL, EXPECTED ending: ' +
  'call it as soon as the payer places you in the representative queue — "please hold", ' +
  '"transferring you now", ringing, hold music, silence after a menu selection, wait-time ' +
  'or call-recording announcements. Do not wait to hear who picks up. Also call it when the ' +
  'payer itself ends the call (closed office, voicemail-only, credentials rejected, dead-end menu). ' +
  'Always call this tool with a reason only — never provide a spoken message ' +
  '(system__message_to_speak). Speaking before the hang-up lets a looping IVR ' +
  'announcement abort the tool call, so the call never actually ends.';

// Turn-taking. An IVR greeting is one long uninterrupted sentence with natural
// pauses in it, which the default settings read as "the caller has finished
// speaking". In conv_8201ky508ypseswbwftknq8dpq78 the agent pressed 5 at 3s
// against a transcript still cut off mid-word ("…Dean Health Plan by Med") and
// landed in the Spanish branch before the options had been read.
//
//   speculative_turn: true generates a response DURING silence, before full
//     turn confidence is reached. It trades correctness for latency — the wrong
//     trade when the other party is a recorded menu that never gets impatient.
//     ElevenLabs defaults this to false; it was on here.
//   turn_eagerness: 'patient' holds out for a higher turn probability.
//
// Agent-level, so this applies to every payer at once.
const TURN_OVERRIDES = { speculative_turn: false, turn_eagerness: 'patient' };

const DTMF_DESCRIPTION =
  'Presses a key on the phone keypad to navigate automated phone menus. Use digits 0-9, star, or pound. ' +
  'Pressing a key is your ENTIRE turn — say nothing before or after it. Never announce the option you ' +
  'are selecting and never read the menu back to the payer.';

// ---------------------------------------------------------------------------
// Read the guidance out of the TypeScript source (same trick as
// setup-elevenlabs-agents.mjs — avoids a build step for a one-shot script).
// ---------------------------------------------------------------------------

function readPrompt(relPath) {
  const src = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  const match = src.match(/=\s*`([\s\S]*?)`\s*;/);
  if (!match) throw new Error(`Could not parse template literal from ${relPath}`);
  // The fragment is a TS template literal, so escaped backticks and \${ need
  // unescaping to recover the runtime string.
  return match[1].replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
}

async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set.');
    process.exit(1);
  }

  const guidance = readPrompt('convex/prompts/payerTermination.ts');
  const agent = await api(`/convai/agents/${AGENT_ID}`);
  console.log(`Agent: ${agent.name} (${AGENT_ID})`);

  const backupPath = join(__dirname, `agent-backup-${AGENT_ID}.json`);
  writeFileSync(backupPath, JSON.stringify(agent, null, 2));
  console.log(`Backup written: ${backupPath}`);

  const promptCfg = agent.conversation_config.agent.prompt;
  const livePrompt = promptCfg.prompt;

  // --- 1. Prompt insert -----------------------------------------------------
  let newPrompt = livePrompt;
  if (livePrompt.includes(SECTION_MARKER)) {
    console.log('  prompt: already contains the payer-termination section — skipping insert.');
  } else if (livePrompt.includes(ANCHOR)) {
    newPrompt = livePrompt.replace(ANCHOR, `${guidance}\n\n${ANCHOR}`);
    console.log(`  prompt: inserting ${guidance.length} chars before "${ANCHOR}" ` +
                `(${livePrompt.length} -> ${newPrompt.length} chars).`);
  } else {
    // Never silently drop the fix — if the anchor moved, say so and append.
    newPrompt = `${livePrompt}\n\n${guidance}`;
    console.warn(`  prompt: WARNING anchor "${ANCHOR}" not found — appending at the end instead. ` +
                 'Check the section order on the agent afterwards.');
  }

  // --- 2. Clause rewrites: speak only when actually asked -------------------
  for (const { label, from, to } of REPLACEMENTS) {
    // `to` is checked FIRST: one replacement's `to` embeds its own `from`
    // (it appends a line rather than replacing one), so testing `from` first
    // would re-apply on every run and duplicate the line.
    if (newPrompt.includes(to)) {
      console.log(`  rewrite: already applied — ${label}`);
    } else if (newPrompt.includes(from)) {
      newPrompt = newPrompt.replace(from, to);
      console.log(`  rewrite: applied — ${label}`);
    } else {
      // Loud, not silent: the live prompt is hand-edited, so a missing anchor
      // means it drifted again and this fix would otherwise vanish unnoticed.
      throw new Error(
        `Clause not found and replacement not present — "${label}". The live prompt has drifted; ` +
        're-check the wording before re-running. Nothing was sent.'
      );
    }
  }

  // --- 3. Operating-mode section: replace the drifted hand-edited head ------
  // The live head told the agent to wait through queue audio and branched on
  // {{bridge_number}} — a variable that exists nowhere in the codebase and is
  // never sent, so the unsubstituted placeholder read as "configured" and hit
  // the "stay silent, do NOT call end_call" path. That is why the call in
  // conv_6201ky4xqj78fm4t4tvmggxa7wd3 rang through to a live rep.
  const ivrOnly = readPrompt('convex/prompts/ivrOnlyMode.ts').trim();
  const markerAt = newPrompt.indexOf(SECTION_MARKER);
  if (markerAt === -1) throw new Error('Payer-termination marker missing — cannot locate the head safely.');
  const liveHead = newPrompt.slice(0, markerAt).trim();
  if (liveHead === ivrOnly) {
    console.log('  operating-mode: already matches convex/prompts/ivrOnlyMode.ts — skipping.');
  } else {
    if (liveHead.includes('{{bridge_number}}')) {
      console.log('  operating-mode: removing phantom {{bridge_number}} branch (var is never sent).');
    }
    newPrompt = `${ivrOnly}\n\n${newPrompt.slice(markerAt)}`;
    console.log(`  operating-mode: replaced head with repo version (${liveHead.length} -> ${ivrOnly.length} chars).`);
  }

  // --- 4. Tool config -------------------------------------------------------
  const seen = [];
  const tools = (promptCfg.tools || []).map((tool) => {
    if (tool.name === 'end_call') {
      seen.push('end_call');
      return {
        ...tool,
        interruption_mode: 'disable_during_tool_and_turn',
        pre_tool_speech: 'off',
        description: END_CALL_DESCRIPTION,
      };
    }
    if (tool.name === 'play_keypad_touch_tone') {
      seen.push('play_keypad_touch_tone');
      // suppress_turn_after_dtmf:false handed the agent a speaking turn after
      // every keypress. With the payer's own quoted menu text sitting in its
      // prompt, it filled that turn by reading the menu back. No prompt wording
      // can suppress a turn the platform grants — this is the structural fix.
      return {
        ...tool,
        interruption_mode: 'disable_during_tool_and_turn',
        pre_tool_speech: 'off',
        description: DTMF_DESCRIPTION,
        params: { ...tool.params, suppress_turn_after_dtmf: true },
      };
    }
    return tool;
  });

  for (const required of ['end_call', 'play_keypad_touch_tone']) {
    if (!seen.includes(required)) {
      throw new Error(`No ${required} tool on this agent — aborting rather than guessing.`);
    }
  }
  console.log('  tools: end_call + play_keypad_touch_tone -> pre_tool_speech off, ' +
              'interruption_mode disable_during_tool_and_turn, suppress_turn_after_dtmf true.');

  // --- 5. Turn-taking: wait for the IVR to actually finish ------------------
  const liveTurn = agent.conversation_config.turn || {};
  const turnDrift = Object.entries(TURN_OVERRIDES).filter(([k, want]) => liveTurn[k] !== want);
  if (turnDrift.length) {
    console.log('  turn: ' + turnDrift.map(([k, want]) => `${k} ${JSON.stringify(liveTurn[k])} -> ${JSON.stringify(want)}`).join(', ') + '.');
  } else {
    console.log('  turn: already patient / non-speculative — skipping.');
  }

  const body = {
    conversation_config: {
      ...agent.conversation_config,
      agent: {
        ...agent.conversation_config.agent,
        prompt: { ...promptCfg, prompt: newPrompt, tools },
      },
      turn: { ...liveTurn, ...TURN_OVERRIDES },
    },
  };

  if (DRY_RUN) {
    const outPath = join(__dirname, `agent-patch-preview-${AGENT_ID}.json`);
    writeFileSync(outPath, JSON.stringify(body, null, 2));
    console.log(`\nDRY RUN — no changes sent. Preview written: ${outPath}`);
    return;
  }

  await api(`/convai/agents/${AGENT_ID}`, { method: 'PATCH', body: JSON.stringify(body) });

  // Verify against a fresh read rather than trusting the PATCH response.
  const after = await api(`/convai/agents/${AGENT_ID}`);
  const afterPrompt = after.conversation_config.agent.prompt;
  const endCall = (afterPrompt.tools || []).find((t) => t.name === 'end_call');
  console.log('\nVerified after PATCH:');
  console.log(`  payer-termination section present: ${afterPrompt.prompt.includes(SECTION_MARKER)}`);
  console.log(`  prompt length: ${afterPrompt.prompt.length}`);
  console.log(`  end_call.interruption_mode: ${endCall?.interruption_mode}`);
  console.log(`  end_call.pre_tool_speech: ${endCall?.pre_tool_speech}`);
  console.log(`  tools: ${(afterPrompt.tools || []).map((t) => t.name).join(', ')}`);
  const afterTurn = after.conversation_config.turn || {};
  console.log(`  turn.speculative_turn: ${afterTurn.speculative_turn}`);
  console.log(`  turn.turn_eagerness: ${afterTurn.turn_eagerness}`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
