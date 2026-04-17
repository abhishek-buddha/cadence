#!/usr/bin/env node
// Runs Playwright with JSON reporter, strips any dotenv-injected prefix, writes clean JSON.

const { spawn } = require('child_process');
const fs = require('fs');

const args = ['playwright', 'test', '--config=tests/playwright.config.ts', '--workers=4', '--reporter=json'];

const out = [];
const proc = spawn('npx', args, { stdio: ['ignore', 'pipe', 'inherit'], shell: true, env: { ...process.env, FORCE_COLOR: '0' } });
proc.stdout.on('data', (chunk) => out.push(chunk));
proc.on('close', (code) => {
  let text = Buffer.concat(out).toString('utf8');
  // Strip any leading non-JSON noise (dotenv plugin prints to stdout).
  const idx = text.search(/^\s*\{/m);
  if (idx > 0) text = text.slice(idx);
  try {
    const obj = JSON.parse(text);
    fs.writeFileSync('test-results.json', JSON.stringify(obj));
    console.error(`Wrote test-results.json (${text.length} bytes), Playwright exit ${code}`);
    process.exit(0);
  } catch (e) {
    fs.writeFileSync('test-results.raw.txt', text);
    console.error(`JSON parse failed: ${e.message}. Raw saved to test-results.raw.txt`);
    process.exit(2);
  }
});
