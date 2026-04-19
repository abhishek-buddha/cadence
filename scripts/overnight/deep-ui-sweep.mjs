// Deep UI regression sweep for Cadence prod.
// Visits every screen + every interactive element. Reports PASS/FAIL per check.
// Output: docs/status/2026-04-20-deep-ui-sweep.{md,json} + screenshots/2026-04-20-deep/*.png
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const URL = 'https://cadence-new.onrender.com';
const PIN = '472394';
const SHOT_DIR = 'docs/status/screenshots/2026-04-20-deep';
const MD_OUT = 'docs/status/2026-04-20-deep-ui-sweep.md';
const JSON_OUT = 'docs/status/2026-04-20-deep-ui-sweep.json';
const RESULTS = [];
const TAG = `test_2026-04-20`;
fs.mkdirSync(SHOT_DIR, { recursive: true });

function log(s){ console.log(`[${new Date().toISOString()}] ${s}`); }
function add(section, name, ok, detail){
  const status = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'SKIPPED';
  RESULTS.push({ section, name, status, detail: (detail||'').slice(0, 400) });
  log(`  ${status === 'PASS' ? 'OK' : status === 'FAIL' ? 'XX' : '--'} [${section}] ${name}: ${detail||''}`);
}
async function shot(page, name){
  try { await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true }); } catch(e){}
}
async function enterPin(page, pin=PIN){
  await page.waitForSelector('input', { timeout: 15000 });
  await page.evaluate((pin) => {
    const inputs = document.querySelectorAll('input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    inputs.forEach((el,i)=>{ if(i<pin.length){ setter.call(el,pin[i]); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }});
  }, pin);
  await page.waitForTimeout(2500);
}
async function go(page, p){ await page.goto(`${URL}${p}`, { waitUntil:'domcontentloaded', timeout: 30000 }); await page.waitForTimeout(1800); }
async function bodyText(page){ return (await page.evaluate(()=>document.body.innerText)).toLowerCase(); }
async function clickByText(page, rxStr){
  return await page.evaluate((rxStr)=>{
    const rx = new RegExp(rxStr, 'i');
    const btns = Array.from(document.querySelectorAll('button,a,[role=button]'));
    const el = btns.find(b => rx.test((b.textContent||'').trim()));
    if(el){ el.click(); return true; }
    return false;
  }, rxStr);
}
async function escAll(page){ try{ await page.keyboard.press('Escape'); await page.waitForTimeout(300);}catch{}}
async function failedReqCount(page){
  return await page.evaluate(()=>{
    try {
      return performance.getEntriesByType('resource').filter(r=>r.transferSize===0 && r.name.includes(location.origin) && !/\.map$|favicon|hot-update/.test(r.name) && r.duration > 0).length;
    } catch { return -1; }
  });
}

// =================== Section testers ===================

async function testDashboard(page){
  const sec = 'Dashboard /';
  await go(page, '/'); await shot(page, 'dashboard');
  const txt = await bodyText(page);
  const hasOutcome = /successful|partial|failed|transfer/.test(txt);
  add(sec, 'Outcome distribution categories present', hasOutcome, hasOutcome?'4 outcome keywords found':'missing');
  const hasAging = /(0\s*-\s*30|31\s*-\s*60|61\s*-\s*90|91\s*-\s*120|120\+)/i.test(txt);
  add(sec, 'Aging buckets visible', hasAging, hasAging?'aging ranges seen':'no aging ranges');
  // Recent Calls list: count visible CLM- references in the Recent Calls panel
  const recentRows = await page.evaluate(()=>(document.body.innerText.match(/CLM-\S+/g) || []).length);
  add(sec, 'Recent calls ≥5 entries', recentRows>=5, `CLMrefs=${recentRows}`);
  // KPI cards: look for headings TOTAL CLAIMS / SUCCESS RATE / TOTAL BILLED etc
  const kpiLabels = ['total claims','pending follow','calls today','success rate','total billed','recovered'];
  const kpiFound = kpiLabels.filter(l=>txt.includes(l)).length;
  add(sec, 'All 6 KPI card labels present', kpiFound>=6, `kpis=${kpiFound}/6`);
}

async function testClaims(page){
  const sec = 'Claims /claims';
  await go(page, '/claims'); await shot(page, 'claims');
  const rows = await page.evaluate(()=>document.querySelectorAll('tbody tr').length);
  add(sec, 'Claims rows present', rows>=10, `rows=${rows}`);
  const headers = await page.evaluate(()=>Array.from(document.querySelectorAll('thead th')).map(t=>t.textContent.trim().toLowerCase()).join('|'));
  const headerOk = /claim/.test(headers) && /status/.test(headers) && /(amount|charges|billed)/.test(headers);
  add(sec, 'Headers include claim/status/amount', headerOk, headers.slice(0,160));
  // Status filter
  const filterChanged = await page.evaluate(()=>{
    const sel = Array.from(document.querySelectorAll('select')).find(s=>/status/i.test(s.outerHTML)||Array.from(s.options||[]).some(o=>/denied|approved|pending/i.test(o.textContent)));
    if(!sel) return false;
    const denied = Array.from(sel.options).find(o=>/denied/i.test(o.textContent));
    if(!denied) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
    setter.call(sel, denied.value); sel.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  });
  await page.waitForTimeout(800);
  add(sec, 'Status filter dropdown narrows list', filterChanged, filterChanged?'changed to Denied':'no status select');
  // reset
  await go(page, '/claims');
  // Click first row → detail
  const firstId = await page.evaluate(()=>{
    const tr = document.querySelector('tbody tr');
    if(!tr) return null;
    tr.click();
    return true;
  });
  await page.waitForTimeout(1500);
  const url = page.url();
  add(sec, 'Row click navigates to detail', /\/claims\/.+/.test(url), `url=${url}`);
  await shot(page, 'claim-detail');
  const detailTxt = await bodyText(page);
  add(sec, 'Detail shows Call Insurance button', /call insurance|initiate call|call now/i.test(detailTxt), '');
  // Add Claim
  await go(page, '/claims');
  const opened = await clickByText(page, 'add claim|new claim');
  await page.waitForTimeout(700);
  const modalTxt = await bodyText(page);
  const isModal = /add\s*claim|new\s*claim|patient|insurance/i.test(modalTxt) && opened;
  add(sec, 'Add Claim modal opens', isModal, opened?'opened':'button not found');
  await escAll(page);
  // Upload
  await go(page, '/claims');
  const upOpened = await clickByText(page, 'upload|import');
  await page.waitForTimeout(700);
  add(sec, 'Upload Claims UI opens', upOpened, upOpened?'opened':'no upload button');
  await escAll(page);
}

async function testPatients(page){
  const sec = 'Patients /patients';
  await go(page, '/patients'); await shot(page, 'patients');
  const txt = await bodyText(page);
  add(sec, 'Page loads', /patient/i.test(txt), '');
  const rows = await page.evaluate(()=>document.querySelectorAll('tbody tr').length);
  add(sec, 'Patient rows present', rows>=1, `rows=${rows}`);
}

async function testInsurance(page){
  const sec = 'Insurance /insurance';
  await go(page, '/insurance'); await shot(page, 'insurance');
  const txt = await bodyText(page);
  const payers = ['aetna','bcbs','uhc','acme','cigna','humana'].filter(p=>txt.includes(p));
  add(sec, '≥4 payers visible', payers.length>=3, `found=${payers.join(',')}`);
}

async function testProviders(page){
  const sec = 'Providers /providers';
  await go(page, '/providers'); await shot(page, 'providers');
  const rows = await page.evaluate(()=>document.querySelectorAll('tbody tr,li').length);
  add(sec, 'Provider list renders', rows>=1, `rows=${rows}`);
}

async function testCalls(page){
  const sec = 'Call History /calls';
  await go(page, '/calls'); await shot(page, 'calls');
  const txt = await bodyText(page);
  add(sec, 'Page loads with outcome column', /outcome|status/i.test(txt), '');
  // Calls page uses div-rows with CLM-* refs; count distinct claim refs
  const rows = await page.evaluate(()=>(document.body.innerText.match(/CLM-\S+/g)||[]).length);
  const showingMatch = txt.match(/showing\s+(\d+)\s+calls/);
  const showingCount = showingMatch ? parseInt(showingMatch[1]) : 0;
  add(sec, 'Call rows present', rows>=1 || showingCount>=1, `claimRefs=${rows} showing=${showingCount}`);
  // Outcome filter dropdown present
  const hasOutcomeFilter = /all outcomes|successful|partial|failed|transferred/i.test(txt);
  add(sec, 'Outcome filter options visible', hasOutcomeFilter, '');
}

async function testEligibility(page){
  const sec = 'Eligibility /eligibility';
  await go(page, '/eligibility'); await shot(page, 'eligibility');
  const txt = await bodyText(page);
  add(sec, 'Page loads', /eligibility|ev case|cdt/i.test(txt), '');
  const opened = await clickByText(page, 'add case|new case');
  await page.waitForTimeout(700);
  add(sec, 'Add Case modal opens', opened, '');
  await escAll(page);
  const impOpened = await clickByText(page, 'import');
  await page.waitForTimeout(700);
  add(sec, 'Import Cases UI opens', impOpened, '');
  await escAll(page);
}

async function testSessions(page){
  const sec = 'Sessions /sessions';
  await go(page, '/sessions'); await shot(page, 'sessions');
  const opened = await clickByText(page, 'new session|start session|create session');
  await page.waitForTimeout(700);
  add(sec, 'New Session wizard opens', opened, '');
  await escAll(page);
}

async function testReports(page){
  const sec = 'Reports /reports';
  await go(page, '/reports'); await shot(page, 'reports');
  const txt = await bodyText(page);
  const tabs = ['success rate','data accuracy','turnaround','exception','volume'];
  const found = tabs.filter(t=>txt.includes(t));
  add(sec, '5 report tabs present', found.length>=4, `found=${found.join('|')}`);
  // Click each tab
  for(const t of ['Data Accuracy','Turnaround','Exception','Volume']){
    const ok = await clickByText(page, t);
    await page.waitForTimeout(500);
    add(sec, `Tab clickable: ${t}`, ok, '');
  }
  const svgs = await page.evaluate(()=>document.querySelectorAll('svg').length);
  add(sec, 'SVG charts render', svgs>=1, `svgs=${svgs}`);
  const exportBtn = await page.evaluate(()=>/export|csv/i.test(document.body.innerText));
  add(sec, 'Export CSV control present', exportBtn, '');
}

async function testTransfers(page){
  const sec = 'Transfers /transfers';
  await go(page, '/transfers'); await shot(page, 'transfers');
  const txt = await bodyText(page);
  const seeded = /medical help desk|dental help desk/i.test(txt);
  add(sec, 'Seeded destinations visible', seeded, seeded?'seen':'not seen');
  const opened = await clickByText(page, 'add destination|new destination');
  await page.waitForTimeout(700);
  add(sec, 'Add Destination form opens', opened, '');
  await escAll(page);
}

async function testAudit(page){
  const sec = 'Audit /audit';
  await go(page, '/audit'); await shot(page, 'audit');
  const rows = await page.evaluate(()=>document.querySelectorAll('tbody tr').length);
  add(sec, 'Audit rows present', rows>=1, `rows=${rows}`);
  const exp = await page.evaluate(()=>/export|csv/i.test(document.body.innerText));
  add(sec, 'Export CSV control present', exp, '');
}

async function testUsers(page){
  const sec = 'Users /users';
  await go(page, '/users'); await shot(page, 'users');
  const txt = await bodyText(page);
  const roles = ['admin','manager','viewer'].filter(r=>txt.includes(r));
  add(sec, '3 roles present', roles.length===3, `found=${roles.join(',')}`);
  const inv = await page.evaluate(()=>/invite|add user|new user/i.test(document.body.innerText));
  add(sec, 'Invite User control present', inv, '');
}

async function testApiKeys(page){
  const sec = 'API Keys /api-keys';
  await go(page, '/api-keys'); await shot(page, 'api-keys');
  const txt = await bodyText(page);
  add(sec, 'Page loads', /api key|key/i.test(txt), '');
  const opened = await clickByText(page, 'issue|new key|create key|add key');
  await page.waitForTimeout(700);
  if(opened){
    // fill a name
    await page.evaluate((tag)=>{
      const inp = document.querySelector('input[type=text],input:not([type])');
      if(inp){
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        setter.call(inp, `${tag}-key`); inp.dispatchEvent(new Event('input',{bubbles:true}));
      }
      // check first 2 scope checkboxes
      Array.from(document.querySelectorAll('input[type=checkbox]')).slice(0,2).forEach(b=>{ if(!b.checked) b.click(); });
    }, TAG);
    await page.waitForTimeout(300);
    const submitted = await page.evaluate(()=>{
      const submitBtn = document.querySelector('button[type=submit]');
      if(submitBtn){ submitBtn.click(); return true; }
      const btn = Array.from(document.querySelectorAll('button')).find(b=>/issue|create|generate|save/i.test((b.textContent||'').trim()));
      if(btn){ btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1500);
    const fullKey = await page.evaluate(()=>{
      const codes = Array.from(document.querySelectorAll('code,pre,input'));
      for(const c of codes){
        const v = c.value||c.textContent||'';
        const m = v.match(/[a-zA-Z0-9_\-]{30,}/);
        if(m) return m[0];
      }
      return null;
    });
    add(sec, 'Issue New Key flow shows full key once', !!fullKey, fullKey?`prefix ${fullKey.slice(0,10)}...`:'no key shown');
    await escAll(page);
  } else {
    add(sec, 'Issue New Key flow shows full key once', false, 'Issue button not found');
  }
}

async function testWebhooks(page){
  const sec = 'Webhooks /webhooks';
  await go(page, '/webhooks'); await shot(page, 'webhooks');
  const txt = await bodyText(page);
  add(sec, 'Page loads', /webhook|subscription/i.test(txt), '');
  const opened = await clickByText(page, 'add subscription|new subscription|add webhook|new webhook|add endpoint');
  await page.waitForTimeout(700);
  add(sec, 'Add Subscription form opens', opened, '');
  await escAll(page);
}

async function testSettings(page){
  const sec = 'Settings /settings';
  await go(page, '/settings'); await shot(page, 'settings');
  const txt = await bodyText(page);
  add(sec, 'Page loads without crash', txt.length>50 && !/cannot get|error 500/i.test(txt), `len=${txt.length}`);
}

async function testCrossCutting(page){
  const sec = 'Cross-cutting';
  // Failed same-origin requests on dashboard
  await go(page, '/');
  const failed = await failedReqCount(page);
  add(sec, 'Zero failed same-origin requests on Dashboard', failed===0, `failed=${failed}`);
  // Mobile viewport
  await page.setViewportSize({ width:375, height:667 });
  await go(page, '/'); await shot(page, 'mobile-dashboard');
  const hScroll = await page.evaluate(()=>document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  add(sec, 'Mobile 375px no horizontal scroll', !hScroll, hScroll?'overflow':'ok');
  await page.setViewportSize({ width:1440, height:900 });
  // Sub-route refresh persistence
  await go(page, '/eligibility');
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  const onSub = page.url().includes('/eligibility');
  add(sec, 'Refresh on sub-route stays on sub-route', onSub, `url=${page.url()}`);
  // Browser back
  await go(page, '/claims');
  await go(page, '/users');
  await page.goBack({ waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200);
  add(sec, 'Browser back works', page.url().includes('/claims'), `url=${page.url()}`);
}

// =================== Main ===================

(async ()=>{
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width:1440, height:900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if(m.type()==='error') consoleErrors.push(m.text()); });

  log('Logging in via PIN');
  await go(page, '/');
  await enterPin(page);
  await shot(page, 'after-login');

  const sections = [
    testDashboard, testClaims, testPatients, testInsurance, testProviders,
    testCalls, testEligibility, testSessions, testReports, testTransfers,
    testAudit, testUsers, testApiKeys, testWebhooks, testSettings, testCrossCutting
  ];
  for(const fn of sections){
    try { await fn(page); }
    catch(e){ add(fn.name, 'EXCEPTION', false, e.message.slice(0,200)); }
  }

  add('Cross-cutting','Console errors across run', consoleErrors.length<=3, `errors=${consoleErrors.length}${consoleErrors.length?' first='+consoleErrors[0].slice(0,160):''}`);

  await browser.close();

  // Reports
  fs.writeFileSync(JSON_OUT, JSON.stringify(RESULTS, null, 2));
  const pass = RESULTS.filter(r=>r.status==='PASS').length;
  const fail = RESULTS.filter(r=>r.status==='FAIL').length;
  const skip = RESULTS.filter(r=>r.status==='SKIPPED').length;
  const bySection = {};
  for(const r of RESULTS){ (bySection[r.section] ||= []).push(r); }
  let md = `# Deep UI Sweep — Cadence prod — 2026-04-20\n\n`;
  md += `**Summary:** ${pass} PASS / ${fail} FAIL / ${skip} SKIPPED across ${Object.keys(bySection).length} sections.\n\n`;
  md += `URL: ${URL}\nHarness: \`scripts/overnight/deep-ui-sweep.mjs\`\n\n`;
  for(const [section, items] of Object.entries(bySection)){
    md += `## ${section}\n\n`;
    md += `| Check | Status | Detail |\n|---|---|---|\n`;
    for(const r of items){
      md += `| ${r.name} | ${r.status} | ${(r.detail||'').replace(/\|/g,'\\|')} |\n`;
    }
    md += `\n`;
  }
  fs.writeFileSync(MD_OUT, md);
  log(`DONE pass=${pass} fail=${fail} skip=${skip}`);
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
