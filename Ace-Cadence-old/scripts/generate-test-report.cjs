#!/usr/bin/env node
// Reads playwright's JSON report (test-results.json) and prints a per-TC PASS/FAIL/SKIP
// summary plus aggregates. Used by the overnight runner to produce a human-readable
// status file alongside the standard HTML report.

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || 'test-results.json';
const OUTPUT = process.argv[3] || 'docs/status/test-execution-report.md';

if (!fs.existsSync(INPUT)) {
  console.error(`Missing ${INPUT}. Run \`npx playwright test\` first.`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

const cases = [];
function walk(suite, prefix = '') {
  const path = prefix ? `${prefix} > ${suite.title}` : suite.title;
  for (const t of suite.specs ?? []) {
    for (const r of t.tests ?? []) {
      const lastResult = (r.results ?? []).slice(-1)[0];
      cases.push({
        file: t.file,
        path,
        title: t.title,
        tcid: (t.title.match(/TC-[A-Z0-9]+-[A-Z0-9-]+/) ?? [''])[0],
        status: lastResult?.status ?? 'unknown',
        durationMs: lastResult?.duration ?? 0,
        error: lastResult?.error?.message?.slice(0, 200) ?? '',
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, path);
}
for (const s of report.suites ?? []) walk(s);

const tally = { passed: 0, failed: 0, skipped: 0, timedOut: 0, interrupted: 0, unknown: 0 };
for (const c of cases) tally[c.status] = (tally[c.status] ?? 0) + 1;

const groupBy = (arr, keyFn) => arr.reduce((m, x) => {
  const k = keyFn(x);
  (m[k] ??= []).push(x);
  return m;
}, {});

const byFile = groupBy(cases, c => c.file);

let md = `# Test Execution Report — ${new Date().toISOString().slice(0, 10)}

**Total cases:** ${cases.length}
**Passed:** ${tally.passed}
**Failed:** ${tally.failed}
**Skipped:** ${tally.skipped}
**Timed-out:** ${tally.timedOut}
**Interrupted:** ${tally.interrupted}

**Pass rate:** ${cases.length ? ((tally.passed / cases.length) * 100).toFixed(1) : 0}%

---

## By file

| File | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
`;

for (const [file, fileCases] of Object.entries(byFile).sort()) {
  const pass = fileCases.filter(c => c.status === 'passed').length;
  const fail = fileCases.filter(c => c.status === 'failed').length;
  const skip = fileCases.filter(c => c.status === 'skipped').length;
  md += `| ${path.relative('.', file)} | ${fileCases.length} | ${pass} | ${fail} | ${skip} |\n`;
}

md += `\n## Failures (with error excerpt)\n\n`;
const fails = cases.filter(c => c.status === 'failed' || c.status === 'timedOut');
if (fails.length === 0) md += `_None._\n`;
else {
  for (const c of fails) {
    md += `- **${c.tcid || c.title}** (${path.relative('.', c.file)})\n  - ${c.error.replace(/\n/g, ' ')}\n`;
  }
}

md += `\n## Skipped (with rationale if available in title)\n\n`;
const skips = cases.filter(c => c.status === 'skipped');
if (skips.length === 0) md += `_None._\n`;
else {
  for (const c of skips) {
    md += `- **${c.tcid || c.title}** (${path.relative('.', c.file)})\n`;
  }
}

md += `\n## Full results (TC-id ordered)\n\n`;
md += `| TC ID | Title | Status | Duration ms |\n|---|---|---|---|\n`;
for (const c of cases.sort((a, b) => (a.tcid || '').localeCompare(b.tcid || ''))) {
  md += `| ${c.tcid || '—'} | ${c.title.replace(/\|/g, '\\|').slice(0, 80)} | ${c.status} | ${c.durationMs} |\n`;
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, md);
console.log(`Wrote ${OUTPUT} (${cases.length} cases, ${tally.passed} passed, ${tally.failed} failed, ${tally.skipped} skipped)`);
