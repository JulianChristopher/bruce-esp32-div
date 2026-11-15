const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function parseSSE(body) { let text = ''; for (const b of body.split(/\n\n/)) { const ev = (b.match(/^event: (\w+)/m) || [])[1], d = (b.match(/^data: (.*)$/m) || [])[1]; if (ev === 'token') try { text += JSON.parse(d); } catch (e) {} } return text.trim(); }
const P = `Half past eight in the morning, Friday, the 14th of March, 1930; fine and cold.
CHARACTER: Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor.
PLACE: the clerks' room of the Moorgate Fire and Life Assurance Company. PRESENT: Mr. Arthur Hale (Ada has no strong feeling about him). PURSE: 3s. 9d.
KNOWN: She has in her hand the half-crown she found under Mr. Hale's desk. The rent of seven shillings is due tonight.
REMEMBERS: She found a half-crown under Mr. Hale's desk while scrubbing. Ada emptied the baskets and dusted the desks.`;
const greet = `\n\nMr. Arthur Hale has just come in. What does Mrs. Ada Turner say to greet him?`;
const choose = `\n\nAda may now:\n(A) Lay the half-crown on Mr. Hale's desk, where he will find it.\n(B) Keep the half-crown for herself; nobody would know.\n(C) Tell Mr. Hale that she found a half-crown under his desk.\n\nWhich ONE does Ada do next?`;
const V = {
  'greet: current': P + greet + ' Write only the very words spoken, as in a play, in one short sentence of her own.',
  'greet: + MRS. ADA TURNER: "': P + greet + ' Write only her words.\n\nMRS. ADA TURNER: "',
  'greet: + Answer:': P + greet + ' Write only her words.\n\nAnswer:',
  'greet: plain question': P + greet,
  'choose: letter only': P + choose + ' Answer with the letter only, for example: (B)',
  'choose: + Answer: (': P + choose + ' Answer with the letter only.\n\nAnswer: (',
  'choose: plain': P + choose,
  'choose: She chooses': P + choose + '\n\nAnswer in the form: She chooses (letter), because ...'
};
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const p = await b.newPage(); await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle' });
  for (const [name, msg] of Object.entries(V)) {
    let empty = 0; const out = [];
    for (let i = 0; i < 6; i++) {
      const isS = r => /api\/chat\/stream/.test(r.url());
      const done = p.waitForEvent('requestfinished', { predicate: isS, timeout: 30000 }).catch(() => null);
      const box = p.locator('textarea:visible').first(); await box.fill(msg); await box.press('Enter');
      const req = await done; let t = ''; if (req) { const r = await req.response(); t = parseSSE(r ? await r.text() : ''); }
      if (!t) empty++; out.push(t.slice(0, 30) || '∅');
      await sleep(400); await p.getByRole('button', { name: /new chat/i }).click().catch(() => {}); await sleep(300);
    }
    console.log(`${name.padEnd(30)} empty ${empty}/6  ${JSON.stringify(out)}`);
  }
  await b.close();
})();
