const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage();
  let t0 = Date.now();
  await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle' });
  console.log('page load ms', Date.now() - t0);
  // what does the DOM look like while streaming / when done?
  const net = [];
  p.on('requestfinished', r => { if (/chat\/stream/.test(r.url())) net.push(['finished', Date.now() - t0]); });
  p.on('request', r => { if (/chat\/stream/.test(r.url())) net.push(['start', Date.now() - t0]); });
  t0 = Date.now();
  const box = p.locator('textarea:visible').first();
  await box.fill('What is the capital of France? Answer in one word.'); await box.press('Enter');
  let firstText = null;
  for (let i = 0; i < 200; i++) {
    await sleep(250);
    const t = await p.innerText('body');
    if (!firstText && /TALKIE-1930\n\S/.test(t)) firstText = Date.now() - t0;
    if (net.some(x => x[0] === 'finished')) break;
  }
  console.log('first text ms', firstText, 'stream events', JSON.stringify(net));
  const btns = await p.locator('button').allInnerTexts(); console.log('buttons', JSON.stringify(btns));
  t0 = Date.now();
  await p.getByRole('button', { name: /new chat/i }).click().catch(e => console.log('no new chat', e.message));
  await sleep(300);
  console.log('after new chat: replies visible?', /TALKIE-1930/.test(await p.innerText('body')), 'ms', Date.now() - t0);
  await b.close();
})();
