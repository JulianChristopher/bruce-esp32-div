const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage(); await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle' });
  const long = "It is half past seven in the morning, Friday, the 14th of March, 1930. The weather is fine and cold.\nCHARACTER: Mrs. Ada Turner, aged forty-one, a charwoman. She cleans the Moorgate insurance office from half past seven till nine, and then the offices in Finsbury Circus. A war-widow; her son Bert, aged twenty, a docker, lives with her and pays half the rent of seven shillings a week. Honest, chapel-going, proud, sharp-tongued, kind.\nPLACE: Mrs. Ada Turner is at the clerks' room. PRESENT: nobody else.\nPURSE: 3s. 9d.\nADA REMEMBERS: (Long ago) Her husband was a good man. She has been scrubbing since seven.\n\nWhat matters most to Mrs. Ada Turner (she) at this moment, and why? Answer in one sentence about Ada (she), in the third person.";
  for (let i = 0; i < 3; i++) {
    const t = {}; const t0 = Date.now();
    const isS = r => /api\/chat\/stream/.test(r.url());
    const started = p.waitForEvent('request', { predicate: isS, timeout: 8000 }).then(() => t.start = Date.now() - t0).catch(() => t.start = 'none');
    const done = p.waitForEvent('requestfinished', { predicate: isS, timeout: 120000 }).then(() => t.fin = Date.now() - t0).catch(() => t.fin = 'timeout');
    const box = p.locator('textarea:visible').first();
    await box.fill(long); t.filled = Date.now() - t0; await box.press('Enter');
    await started; await done;
    let prev = null; for (let k = 0; k < 50; k++) { await sleep(200); const a = replies(await p.innerText('body'))[0] ?? null; if (a && a === prev) break; prev = a; }
    t.read = Date.now() - t0;
    await p.getByRole('button', { name: /new chat/i }).click(); await sleep(150); t.newchat = Date.now() - t0;
    console.log(JSON.stringify(t), (prev || '').slice(0, 80));
  }
  await b.close();
})();
