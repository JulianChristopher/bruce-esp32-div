// Runs questions.json against the talkie web demo, one fresh chat per item, sequentially.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const qs = JSON.parse(fs.readFileSync(process.env.QFILE || path.join(dir, 'questions.json'), 'utf8'));
const outFile = process.env.OFILE || path.join(dir, 'results.jsonl');
const done = new Set(fs.existsSync(outFile)
  ? fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function talkieReplies(text) {
  const parts = text.split(/\nTALKIE-1930\n/).slice(1);
  return parts.map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim());
}

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  for (const q of qs) {
    if (done.has(q.id)) continue;
    const p = await b.newPage();
    const t0 = Date.now();
    const answers = [];
    let error = null;
    try {
      await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 });
      for (const [n, turn] of q.turns.entries()) {
        const box = p.locator('textarea:visible').first();
        await box.fill(turn);
        await box.press('Enter');
        // wait for reply n+1 to appear, then for it to stop changing
        let last = '', stable = 0;
        for (let i = 0; i < 120; i++) {
          await sleep(1500);
          const t = await p.innerText('body');
          const reps = talkieReplies(t);
          if (reps.length <= n || !reps[n]) continue;
          if (t === last) { if (++stable >= 6) break; } else { stable = 0; last = t; }
        }
        const reps = talkieReplies(await p.innerText('body'));
        answers.push(reps[n] ?? null);
      }
    } catch (e) { error = e.message; }
    const rec = { id: q.id, cat: q.cat, turns: q.turns, expect: q.expect, answers, error, secs: Math.round((Date.now() - t0) / 1000) };
    fs.appendFileSync(outFile, JSON.stringify(rec) + '\n');
    console.log(q.id, rec.secs + 's', (answers.at(-1) || error || '').slice(0, 100).replace(/\n/g, ' '));
    await p.close();
    await sleep(2500); // be gentle with the public demo
  }
  await b.close();
})();
