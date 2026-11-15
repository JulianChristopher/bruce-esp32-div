const { chromium } = require('playwright');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  const p = await b.newPage();
  p.on('request', r => console.log('REQ', r.method(), r.url()));
  p.on('requestfailed', r => console.log('FAIL', r.url(), r.failure()?.errorText));
  p.on('response', r => console.log('RES', r.status(), r.url()));
  p.on('websocket', ws => { console.log('WS', ws.url()); ws.on('socketerror', e=>console.log('WSERR', e)); ws.on('close', ()=>console.log('WSCLOSE')); });
  p.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0,300)));
  await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle' });
  const box = p.locator('textarea, input[type=text]').first();
  await box.fill('Hello, how are you?'); await box.press('Enter');
  await p.waitForTimeout(20000);
  await b.close();
})();
