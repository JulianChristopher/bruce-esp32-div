const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
const filler = "Mrs. Ada Turner, aged forty-one, is a charwoman who cleans the Moorgate insurance office every morning before the clerks arrive, and then the offices in Finsbury Circus. ";
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage(); await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle' });
  for (const chars of [800, 1600, 2400, 3200, 4000, 5600]) {
    let ok = 0, res = [];
    for (let i = 0; i < 3; i++) {
      const body = filler.repeat(Math.ceil(chars / filler.length)).slice(0, chars);
      const msg = `${body}\n\nQUESTION: What is the capital of France? Answer in one word.`;
      const isS = r => /api\/chat\/stream/.test(r.url());
      const done = p.waitForEvent('requestfinished', { predicate: isS, timeout: 30000 }).catch(() => null);
      const box = p.locator('textarea:visible').first(); await box.fill(msg); await box.press('Enter'); await done;
      let prev = null; for (let k = 0; k < 25; k++) { await sleep(200); const a = replies(await p.innerText('body'))[0] ?? null; if (a && a === prev) break; prev = a; }
      if (prev) ok++; res.push((prev || '∅').slice(0, 20));
      await p.getByRole('button', { name: /new chat/i }).click(); await sleep(200);
    }
    console.log(`${chars} chars (~${Math.round(chars / 4)} tokens): ${ok}/3 answered`, JSON.stringify(res));
  }
  await b.close();
})();
