const { chromium } = require('playwright');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 45000 });
  const box = p.locator('textarea, input[type=text], [contenteditable=true]').first();
  await box.fill(process.argv[2]);
  await box.press('Enter');
  let last = '', stable = 0;
  for (let i = 0; i < 90; i++) {
    await p.waitForTimeout(2000);
    const t = await p.innerText('body');
    if (t === last) { if (i > 15 && ++stable >= 4) break; } else stable = 0;
    last = t;
  }
  console.log(last);
  await p.screenshot({ path: 'answer.png', fullPage: true });
  await b.close();
})();
