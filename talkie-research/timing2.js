const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage();
  await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle' });
  const t0 = Date.now(); const ev = [];
  p.on('request', r => ev.push(['REQ', r.method(), r.url().replace('https://', ''), Date.now() - t0]));
  p.on('requestfinished', r => ev.push(['FIN', r.url().replace('https://', ''), Date.now() - t0]));
  for (const q of ['Write three sentences about the Thames.', 'And what of the Severn?']) {
    const box = p.locator('textarea:visible').first();
    await box.fill(q); await box.press('Enter');
    await sleep(6000);
  }
  for (const e of ev) console.log(e.join(' '));
  const t = await p.innerText('body'); console.log(t.slice(t.indexOf('USER')).slice(0, 800));
  const resp = await p.evaluate(() => performance.getEntriesByType('resource').filter(e => /api/.test(e.name)).map(e => [e.name, Math.round(e.duration)]));
  console.log(JSON.stringify(resp));
  await b.close();
})();
