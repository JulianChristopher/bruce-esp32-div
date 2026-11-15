const { chromium } = require('playwright');
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const reqs = [];
  p.on('request', r => { if (!/\.(png|jpg|svg|woff2?|css)$/.test(r.url())) reqs.push(r.method()+' '+r.url()); });
  await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 45000 }).catch(e=>console.log('goto:', e.message));
  await p.waitForTimeout(3000);
  console.log('TITLE:', await p.title());
  console.log('TEXT:\n', (await p.innerText('body')).slice(0, 4000));
  console.log('REQS:\n', [...new Set(reqs)].slice(0,40).join('\n'));
  await p.screenshot({ path: 'chat.png' });
  await b.close();
})();
