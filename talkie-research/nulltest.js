const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
const prompts = [
  `Mrs. Ada Turner, aged forty-one, a charwoman.\n\nThis conversation has just taken place:\nMRS. ADA TURNER: "Well, Mr. Thomas, I see the King has gone abroad."\nMR. WALTER THOMAS: "Yes; His Majesty has gone abroad."\n\nAfter it, does Mrs. Ada Turner think better or worse of Mr. Walter Thomas than before?\n(A) better\n(B) worse\n\nAnswer with the letter only.`,
  `Mr. Walter Thomas has just come in. What does Mrs. Ada Turner say to greet him? Write only the very words spoken, as in a play, in one short sentence of her own.`
];
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage(); await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle' });
  for (const pr of prompts) for (let i = 0; i < 4; i++) {
    const resp = p.waitForEvent('response', { predicate: r => /api\/chat\/stream/.test(r.url()), timeout: 30000 });
    const box = p.locator('textarea:visible').first(); await box.fill(pr); await box.press('Enter');
    const r = await resp; let body = ''; try { body = await r.text(); } catch (e) { body = 'ERR ' + e.message; }
    await sleep(800);
    const shown = replies(await p.innerText('body'))[0];
    console.log(`#${i} status ${r.status()} raw=${JSON.stringify(body.slice(0, 260))} | shown=${JSON.stringify(shown)}`);
    await p.getByRole('button', { name: /new chat/i }).click(); await sleep(200);
  }
  await b.close();
})();
