import { chromium } from 'playwright';
const URL='https://cadence-new.onrender.com', PIN='472394';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', m => console.log('[console:'+m.type()+']', m.text().slice(0,400)));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(URL);
await page.waitForSelector('input',{timeout:15000});
await page.evaluate((pin)=>{ const inputs=document.querySelectorAll('input'); const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; inputs.forEach((el,i)=>{if(i<pin.length){setter.call(el,pin[i]);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}); }, PIN);
await page.waitForTimeout(2500);
await page.goto(URL+'/api-keys');
await page.waitForTimeout(2000);
// Click Issue New Key button
await page.evaluate(()=>{ const btn=Array.from(document.querySelectorAll('button')).find(b=>/issue.*key|new key|add key/i.test(b.textContent||'')); if(btn) btn.click(); });
await page.waitForTimeout(1000);
// Fill name
await page.fill('input[type="text"]', 'overnight-debug-'+Date.now());
// Check the first scope checkbox only (claims:read), avoid admin
await page.evaluate(()=>{
  const boxes=Array.from(document.querySelectorAll('input[type=checkbox]'));
  if(boxes[0] && !boxes[0].checked) boxes[0].click();
});
await page.waitForTimeout(500);
// Submit
await page.evaluate(()=>{ const b=document.querySelector('button[type=submit]'); if(b) b.click(); });
await page.waitForTimeout(4000);
const modalText = await page.evaluate(()=>{
  const m=document.querySelector('[role=dialog]');
  return m ? m.innerText.slice(0,1500) : document.body.innerText.slice(0,1500);
});
console.log('MODAL_TEXT:', modalText);
await browser.close();
