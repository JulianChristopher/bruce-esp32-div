// v3 simulation engine for talkie-1930 (web demo).
// Principle: the ENGINE is the world and the planner (clock, places, money, duties, objects,
// memory, arithmetic); TALKIE is the voice and the chooser (deliberates, picks among concrete
// options whose consequences are spelled out, speaks short lines, judges people).
// Usage: node sim2.js [segment ...]   segments: fri-am fri-pm sat   (default: all)
//        FAKE=1 node sim2.js           offline dry run with a random chooser
const fs = require('fs');
const path = require('path');
const FAKE = !!process.env.FAKE;
const OUT = path.join(__dirname, process.env.RUN || 'sim3');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, FAKE ? 0 : ms));
const STORY = []; const TRACE = []; const STATS = { asks: 0, choices: 0, unreadable: 0, votes: 0, ledgerRight: 0, ledgerWrong: 0, convs: 0, lines: 0, emptyLines: 0, diaryFallback: 0, probes: [] };
const say = s => { console.log(s); STORY.push(s); };

// ======================= talkie I/O =======================
let browser = null;
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
// --- fast I/O: a pool of reusable tabs; an answer is complete when the stream request finishes ---
const POOL = [];
async function getPage() {
  const p = POOL.pop();
  if (p) { try { await p.getByRole('button', { name: /new chat/i }).click({ timeout: 3000 }); await sleep(150); return p; } catch (e) { try { await p.close(); } catch (_) {} } }
  const np = await browser.newPage(); await np.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 }); return np;
}
function putPage(p) { if (POOL.length < 6) POOL.push(p); else p.close().catch(() => {}); }
async function sendAndWait(p, msg, n) {
  const isStream = r => /api\/chat\/stream/.test(r.url());
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    const started = p.waitForEvent('request', { predicate: isStream, timeout: 8000 }).catch(() => null);
    const done = Promise.race([
      p.waitForEvent('requestfinished', { predicate: isStream, timeout: 30000 }),
      p.waitForEvent('requestfailed', { predicate: isStream, timeout: 30000 })
    ]).catch(() => { STATS.slow = (STATS.slow || 0) + 1; });
    const box = p.locator('textarea:visible').first();
    await box.fill(msg); await box.press('Enter');
    if (!(await started)) { STATS.resends = (STATS.resends || 0) + 1; await sleep(1000); continue; }   // the page was busy: send again
    await done;
    let prev = null;                         // read only once the rendered text has settled
    for (let i = 0; i < 50; i++) {
      await sleep(200);
      const a = replies(await p.innerText('body'))[n] ?? null;
      if (a && a === prev) { STATS.ms = (STATS.ms || 0) + (Date.now() - t0); STATS.timed = (STATS.timed || 0) + 1; return /flagged as potentially inappropriate/i.test(a) ? null : a; }
      prev = a;
    }
    if (!prev) { STATS.nullReplies = (STATS.nullReplies || 0) + 1; if (STATS.nullReplies <= 8) { try { fs.appendFileSync(path.join(OUT, 'null_debug.txt'), `\n==== null reply #${STATS.nullReplies} n=${n}\nMSG: ${msg.slice(-200)}\nPAGE: ${(await p.innerText('body')).slice(-1500)}\n`); } catch (e) {} } }
    return prev && !/flagged as potentially inappropriate/i.test(prev) ? prev : null;
  }
  return null;
}
async function chat(msgs) {           // several turns in one chat window
  STATS.asks += msgs.length;
  if (FAKE) return msgs.map(m => { const L = msgs.join('\n').match(/^\(([A-L])\)/gm); return /letter only/.test(m) && L ? L[Math.floor(Math.random() * L.length)].slice(1, 2) + '.' : 'Good morning to you; it is a fine day, and I must be about my work.'; });
  const out = []; let p = null;
  try {
    p = await getPage();
    for (const [n, msg] of msgs.entries()) {
      let a = await sendAndWait(p, msg, n);
      if (!a && n === 0) { STATS.retries = (STATS.retries || 0) + 1; await p.getByRole('button', { name: /new chat/i }).click({ timeout: 3000 }).catch(() => {}); await sleep(200); a = await sendAndWait(p, msg, 0); }
      out.push(a); if (!a) break;
    }
  } catch (e) { out.push(null); }
  finally { if (p) putPage(p); }
  return out;
}
const ask = async m => (await chat([m]))[0];
class Session {                     // a chat window that stays open: talkie sees the whole exchange
  constructor() { this.n = 0; this.page = null; }
  async send(msg) {
    STATS.asks++;
    if (FAKE) { this.hist = (this.hist || []).concat(msg); const Lx = this.hist.join('\n').match(/^\(([A-L])\)/gm); return /letter/.test(msg) && Lx ? Lx[Math.floor(Math.random() * Lx.length)].slice(1, 2) + '.' : 'Good morning; I am glad to see you, and I hope you are well.'; }
    try {
      if (!this.page) this.page = await getPage();
      let a = await sendAndWait(this.page, msg, this.n++);
      if (!a) { STATS.retries = (STATS.retries || 0) + 1; a = await sendAndWait(this.page, 'Please answer the question above, briefly.', this.n++); }
      return a;
    } catch (e) { return null; }
  }
  async close() { if (this.page) { putPage(this.page); this.page = null; } }
}

// ======================= parsing helpers =======================
const L = 'ABCDEFGHIJKL';
function pick(ans, opts) {
  if (!ans) return null;
  const m = ans.match(/^\W*\(?([A-L])\)?(?:[\s.,):]|$)/) || ans.match(/\(([A-L])\)/) || ans.match(/\b(?:chooses?|choose|answer is|letter)\s*\(?([A-L])\b/i);
  if (m && L.indexOf(m[1]) < opts.length) return L.indexOf(m[1]);
  const hitsIn = (txt, o) => (o.match(/[a-z]{4,}/gi) || []).map(w => w.toLowerCase().replace(/(es|s|ed|ing)$/, '')).filter(w => new RegExp('\\b' + w).test(txt)).length;
  for (const txt of [ans.toLowerCase().split(/,|;| and then | then /)[0], ans.toLowerCase()]) {
    const hs = opts.map(o => hitsIn(txt, o)); const max = Math.max(...hs);
    if (max >= 2 || (max === 1 && hs.filter(h => h === 1).length === 1)) return hs.indexOf(max);
  }
  return null;
}
async function choose(prompt, opts, votes = 1) {   // majority vote over independent asks
  const tally = new Array(opts.length).fill(0); const raw = [];
  for (let v = 0; v < votes; v++) { const a = await ask(prompt); raw.push(a); const i = pick(a, opts); if (i !== null) tally[i]++; }
  STATS.choices++; if (votes > 1) STATS.votes++;
  const max = Math.max(...tally);
  if (max === 0) { STATS.unreadable++; return { i: null, raw }; }
  return { i: tally.indexOf(max), raw, tally };
}
const sentences = (t, n) => { const x = (t || '').replace(/\s+/g, ' ').replace(/\b(Mrs|Mr|Dr|St|Messrs)\./g, '$1§'); return ((x.match(/[^.!?]+[.!?]+["”']?/g) || [x]).slice(0, n).join(' ').trim()).replace(/§/g, '.'); };
function cleanSpeech(t) {
  let s = (t || '').replace(/^[^"“]*?\b(?:says?|said|replies|replied|answers|answered|remarks)\b[,:]?\s*/i, '');
  s = s.replace(/^\s*[A-Z][A-Za-z. ]{0,30}:\s*/, '').replace(/^["“'‘]+/, '');
  const close = s.search(/["”]/); if (close > 0) s = s.slice(0, close);          // the speech ends at the closing quote
  s = sentences(s, 2);
  s = s.split(/(?<=[.!?])\s+(?=(?:He|She|Mr\.|Mrs\.|Ada|Arthur)\s+[a-z]+s\b)/)[0];    // drop narration such as "He looks at his watch."
  return s.replace(/["”'’]+$/g, '').trim();
}
const money = d => { d = Math.round(d); const P = Math.floor(d / 240), s = Math.floor((d % 240) / 12), p = d % 12; return (P ? `£${P} ` : '') + (s || P ? `${s}s. ` : '') + `${p}d.`; };
function clock(min) {
  const h = Math.floor(min / 60), m = min % 60, H = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][h % 12], N = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][(h + 1) % 12];
  const part = h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening';
  return (m === 0 ? `${H} o'clock` : m === 30 ? `half past ${H}` : m === 15 ? `a quarter past ${H}` : `a quarter to ${N}`) + ` ${part}`;
}

// ======================= two-week world (sim3) =======================
// Schedule decides WHERE people are; agents decide WHAT they do there. A 14-day event plan creates
// consequences that span days (lost work, rent, illness, audit, raise). Memory probes ask about facts
// of known age every morning; metrics are written to metrics.json.
const DAYS = ['Friday, the 14th of March, 1930', 'Saturday, the 15th of March, 1930', 'Sunday, the 16th of March, 1930', 'Monday, the 17th of March, 1930', 'Tuesday, the 18th of March, 1930', 'Wednesday, the 19th of March, 1930', 'Thursday, the 20th of March, 1930', 'Friday, the 21st of March, 1930', 'Saturday, the 22nd of March, 1930', 'Sunday, the 23rd of March, 1930', 'Monday, the 24th of March, 1930', 'Tuesday, the 25th of March, 1930', 'Wednesday, the 26th of March, 1930', 'Thursday, the 27th of March, 1930'];
const DOW = d => ['fri', 'sat', 'sun', 'mon', 'tue', 'wed', 'thu'][d % 7];
const DAYNAME = d => DAYS[d].split(',')[0];
const NEWS = {
  0: "A NEW PLANET: the Lowell Observatory in Arizona announces the discovery of a ninth planet beyond Neptune. INDIA: Mr. Gandhi is marching to the sea to make salt in defiance of the Salt Laws.",
  1: "THE NEW PLANET: astronomers hope to obtain better photographs of it. INDIA: Mr. Gandhi's march continues, followed by great crowds.",
  3: "THE NAVAL CONFERENCE in London: the delegates of the Powers continue their talks on the limitation of fleets.",
  4: "UNEMPLOYMENT: the number of persons out of work in Great Britain stands at well over a million and a half.",
  6: "INDIA: Mr. Gandhi's march to the sea continues through the villages of Gujarat.",
  7: "THE NAVAL CONFERENCE: the talks drag on, and agreement among all five Powers seems doubtful.",
  10: "THE NEW PLANET: astronomers debate what name the planet shall bear.",
  12: "UNEMPLOYMENT: more men stood off at the docks this week.",
  13: "GERMANY: the Government of Herr Müller has resigned over the question of unemployment insurance."
};
const WEATHER = ['fine and cold', 'grey', 'fine', 'grey and damp', 'pouring with rain', 'cold and windy', 'mild', 'fine', 'showery', 'fine and mild', 'grey', 'raining', 'fine', 'mild and grey'];
const PLACE = {
  ada_home: "Mrs. Turner's two rooms in Bermondsey", arthur_home: "the Hales' house in Islington", thomas_home: "Mr. Thomas's house in Highbury",
  office: "the clerks' room of the Moorgate Fire and Life Assurance Company", teashop: "a Lyons tea-shop in Moorgate", finsbury: "the offices in Finsbury Circus",
  market: "the street-market in Bermondsey", chapel: "the Bermondsey Methodist chapel", church: "St. Mary's Church, Islington", park: "Highbury Fields, a public park"
};
const A = {
  ada: { name: 'Mrs. Ada Turner', short: 'Ada', f: true, money: 3 * 12 + 9,
    sheet: "Mrs. Ada Turner, aged forty-one, a charwoman. She cleans the Moorgate insurance office from half past seven till nine, and then the offices in Finsbury Circus. A war-widow; her son Bert, aged twenty, a docker, lives with her and pays half the rent of seven shillings a week. Honest, chapel-going, proud, sharp-tongued, kind." },
  arthur: { name: 'Mr. Arthur Hale', short: 'Arthur', f: false, money: 4 * 12 + 6,
    sheet: "Mr. Arthur Hale, aged thirty-four, a ledger clerk at the Moorgate Fire and Life Assurance Company, earning £3 10s. a week; married to Edith, with a daughter Joan, aged seven. Conscientious, careful with money, a little timid with his superiors, fond of his garden and the newspaper." },
  thomas: { name: 'Mr. Walter Thomas', short: 'Mr. Thomas', f: false, money: 40 * 12,
    sheet: "Mr. Walter Thomas, aged fifty-six, chief clerk of the Moorgate Fire and Life Assurance Company. Stern, exact, a stickler for duty, but fair and secretly kind. He pays the clerks' wages and the charwoman's on Fridays. A widower in Highbury; a churchgoer who walks in Highbury Fields on Sundays." }
};
const NPC = {
  edith: { name: 'Mrs. Edith Hale', place: 'arthur_home', f: true, sheet: "Mrs. Edith Hale, Arthur's wife, aged thirty-two; a careful housekeeper who must feed the family on what Arthur gives her each Friday. Warm but practical." },
  joan: { name: 'Joan Hale', place: 'arthur_home', f: true, sheet: "Joan Hale, aged seven, Arthur's daughter; lively, curious, full of questions." },
  bert: { name: 'Bert Turner', place: 'ada_home', f: false, sheet: "Bert Turner, aged twenty, Ada's son, a docker; good-humoured, devoted to his mother, ashamed when out of work." }
};
for (const k in A) { A[k].mem = []; A[k].op = {}; A[k].metToday = new Set(); A[k].done = {}; for (const o of [...Object.keys(A), ...Object.keys(NPC)]) if (o !== k) A[k].op[o] = 0; }
const W = { day: 0, t: 0, coin: { where: 'floor', finder: null }, ledger: { steps: 0, errors: 0, assigned: false, need: 3, verdict: null }, audit: { steps: 0, errors: 0, verdict: null, raise: null },
  paid: {}, bertWork: true, rentDue: false, rentPaid: {}, joanIll: false, doctor: null, extraHours: null, loan: null, facts: [] };
const nameOf = k => A[k] ? A[k].name : NPC[k].name;
const isF = k => A[k] ? A[k].f : NPC[k].f;
const hisher = k => isF(k) ? 'her' : 'his';
const heshe = k => isF(k) ? 'she' : 'he';
const himher = k => isF(k) ? 'her' : 'him';

// ---------- facts of known date: used by the memory probes ----------
function fact(who, q, opts, truth) { W.facts.push({ day: W.day, who, q, opts, truth }); }

// ---------- memory ----------
function remember(k, text, about = [], imp = null) {
  if (imp === null) imp = /half-crown|wages|ledger|audit|warned|thanked|honesty|promised|housekeeping|late|rent|doctor|ill|lost his work|loan|lend|raise|extra hours/i.test(text) ? 3 : /spoke with/.test(text) ? 2 : 1;
  A[k].mem.push({ day: W.day, t: W.t, text, about, imp });
}
const ago = d => d === 'past' ? '(Long ago) ' : W.day - d === 0 ? '' : W.day - d === 1 ? '(Yesterday) ' : `(${DAYNAME(d)}) `;
function recall(k, focus = []) {
  const m = A[k].mem.filter(x => !x.belief); const recent = m.slice(-3);
  const rest = m.slice(0, -3).map((x, i, arr) => ({ x, score: x.imp * 2 + (x.about.some(a => focus.includes(a)) ? 3 : 0) + i / Math.max(1, arr.length) - (x.day === 'past' ? 0 : (W.day - x.day) * 0.3) }))
    .sort((a, b) => b.score - a.score).slice(0, 4).map(y => y.x).sort((a, b) => m.indexOf(a) - m.indexOf(b));
  const cut = t => t.length > 200 ? t.slice(0, 197).replace(/\s+\S*$/, '') + '…' : t;
  return [...rest, ...recent].map(x => ago(x.day) + cut(x.text)).join(' ').slice(0, 900);
}
function beliefs(k, people) { return people.map(p => A[k].mem.filter(x => x.belief === p).slice(-1)[0]).filter(Boolean).map(x => x.text).join(' '); }
function opinionWords(k, o) { const v = A[k].op[o] || 0; return v >= 2 ? 'likes and trusts' : v === 1 ? 'thinks well of' : v === 0 ? 'has no strong feeling about' : v === -1 ? 'is a little put out with' : 'is angry with'; }
function consolidate() {   // nightly: keep what matters, forget trivia older than two days
  for (const k in A) A[k].mem = A[k].mem.filter(x => x.day === 'past' || x.belief || x.imp >= 2 || W.day - x.day < 2);
}

// ---------- the schedule: where everybody is at each tick ----------
function ticks(d) { const w = DOW(d); return w === 'sun' ? [10 * 60 + 30, 13 * 60, 16 * 60, 19 * 60] : w === 'sat' ? [7 * 60 + 30, 8 * 60 + 30, 12 * 60 + 30, 15 * 60, 19 * 60] : [7 * 60 + 30, 8 * 60 + 30, 9 * 60 + 30, 12 * 60 + 30, 17 * 60, 19 * 60]; }
function placeFor(k, d, t) {
  const w = DOW(d), sun = w === 'sun', sat = w === 'sat';
  if (k === 'ada') {
    if (sun) return t < 12 * 60 ? 'chapel' : 'ada_home';
    if (t < 9 * 60) return 'office';
    if (t < 12 * 60) return 'finsbury';
    if ((sat && t === 15 * 60) || (!sat && t === 17 * 60)) return 'market';
    return 'ada_home';
  }
  if (k === 'arthur') {
    if (sun) return t < 12 * 60 ? 'church' : t === 16 * 60 ? 'park' : 'arthur_home';
    if (t < 8 * 60) return 'arthur_home';
    if (t === 12 * 60 + 30 && !sat) return 'teashop';
    if (t < (sat ? 13 * 60 : 17 * 60 + 30) && t <= 17 * 60) return 'office';
    return sat && t === 15 * 60 ? 'arthur_home' : 'arthur_home';
  }
  if (k === 'thomas') {
    if (sun) return t < 12 * 60 ? 'church' : t === 16 * 60 ? 'park' : null;
    if (t < 8 * 60 + 30) return null;
    if (t === 12 * 60 + 30 && !sat) return 'teashop';
    if (t <= (sat ? 12 * 60 + 30 : 17 * 60)) return 'office';
    return null;
  }
}

// ---------- tools on the engine side ----------
const SUMS = [[1245, 3870], [2316, 989], [4402, 1758], [3075, 2640], [1980, 3415], [2750, 1125], [3310, 2468], [1604, 2937]];
const EXAMPLE = "EXAMPLE from the office manual: Two premiums, £200 and £150, are to be added. The machine shows (A) 200 + 150 = 350, (B) 200 − 150 = 50, (C) 200 × 150 = 30000, (D) 200 ÷ 150 = 1.33. Adding means the sum, so the clerk enters (A) 350.\n\n";
async function bookWork(which) {   // adding-machine tool + worked example + cross-check with one retry
  const B = which === 'audit' ? W.audit : W.ledger;
  const [a, b] = SUMS[(B.steps + B.errors + (which === 'audit' ? 4 : 0)) % SUMS.length];
  const rows = [`${a} + ${b} = ${a + b}`, `${a} − ${b} = ${a - b}`, `${a} × ${b} = ${a * b}`, `${a} ÷ ${b} = ${(a / b).toFixed(2)}`];
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  const q = `The premiums received, £${a} and £${b}, must be added together for the ${which === 'audit' ? 'books to be audited' : 'quarterly ledger'}.\n\nThe office adding-machine shows:\n${order.map((oi, j) => `(${L[j]}) ${rows[oi]}`).join('\n')}\n\nWhich figure must Arthur enter as the total? Answer with the letter only.`;
  let c = await choose(`${perceive('arthur')}\n\n${EXAMPLE}${q}`, order.map(oi => rows[oi]));
  let right = c.i !== null && order[c.i] === 0;
  if (!right) {
    STATS.bookRetry = (STATS.bookRetry || 0) + 1;
    c = await choose(`${perceive('arthur')}\n\n${EXAMPLE}${q}\n\nThe cross-check shows that figure is wrong: premiums received are ADDED together. Which figure is right? Answer with the letter only.`, order.map(oi => rows[oi]));
    right = c.i !== null && order[c.i] === 0; if (right) STATS.bookFixed = (STATS.bookFixed || 0) + 1;
  }
  if (right) { B.steps++; STATS.bookRight = (STATS.bookRight || 0) + 1; return `Arthur entered the correct total in the ${which === 'audit' ? 'audit books' : 'ledger'} (${a + b}).`; }
  B.errors++; STATS.bookWrong = (STATS.bookWrong || 0) + 1; return `Arthur entered a wrong figure in the ${which === 'audit' ? 'audit books' : 'ledger'}.`;
}
const MARKET = [
  { text: 'scrag-end of mutton, potatoes and a cabbage', cost: 16 }, { text: 'a pound of sausages, bread and margarine', cost: 13 },
  { text: 'bread, dripping and a few potatoes', cost: 6 }, { text: 'a rabbit, onions and a loaf, for a stew', cost: 21 }
];

// ---------- the daily plan of events (engine side) ----------
function morningEvents() {
  const d = W.day, w = DOW(d);
  if (d === 3) { W.bertWork = false; remember('ada', 'Bert came home to say he has been stood off at the docks; there is no work for him, and the rent of seven shillings is due on Friday.', ['bert', 'rent'], 3); fact('ada', 'What happened to Bert at the docks this week?', ['He was stood off and lost his work', 'He was made a foreman', 'Nothing; he worked as usual'], 0); say('   ★ Bert has lost his work at the docks.'); }
  if (d === 5) { W.joanIll = true; remember('arthur', 'Joan woke feverish and coughing; Edith fears it may be bronchitis.', ['joan', 'edith'], 3); fact('arthur', 'Who in your family fell ill this week?', ['Joan', 'Edith', 'Nobody'], 0); say('   ★ Joan has fallen ill.'); }
  if (d === 6) { remember('arthur', 'Mr. Thomas announced that the auditors come on Monday, and the books must be ready for them.', ['thomas', 'audit'], 3); remember('thomas', 'He told Mr. Hale that the auditors come on Monday.', ['arthur', 'audit'], 3); W.auditDue = true; fact('arthur', 'What did Mr. Thomas announce on Thursday?', ['The auditors come on Monday', 'The office will close early', 'Wages will be paid late'], 0); say('   ★ The audit is announced for Monday.'); }
  if (d === 12 && !W.bertWork) { W.bertWork = true; remember('ada', 'Bert has found work again, carting at the gasworks.', ['bert'], 3); say('   ★ Bert has found work again.'); }
  if (w === 'fri') W.rentDue = true;
}
function eveningEvents() {
  const d = W.day, w = DOW(d);
  if (w === 'fri') {   // Ada is paid at Finsbury Circus; Bert pays his share if in work
    A.ada.money += 120; remember('ada', 'She was paid ten shillings at Finsbury Circus.', ['money'], 1);
    if (W.bertWork) { A.ada.money += 42; remember('ada', 'Bert gave her his half of the rent, 3s. 6d.', ['bert', 'rent'], 2); }
  }
  if (d === 5 && W.doctor === null) { W.doctor = 'not called'; remember('arthur', 'Joan is no better tonight; the doctor has not been called.', ['joan'], 3); }
}

// ---------- options: what the agent may do here and now ----------
function optionsFor(k) {
  const a = A[k], here = a.place, o = [], d = W.day, t = W.t, w = DOW(d), others = presentAt(k);
  if (k === 'ada') {
    if (here === 'office') {
      if (!a.done[d + 'scrub']) o.push({ text: "Scrub the floor under the clerks' desks.", run: () => { a.done[d + 'scrub'] = true; let r = "Ada scrubbed the floor under the clerks' desks."; if (W.coin.where === 'floor' && d === 0) { W.coin.where = 'ada'; W.coin.finder = 'ada'; r += " Under Mr. Hale's desk she found a half-crown (2s. 6d.) wedged in a crack of the boards."; remember('ada', "She found a half-crown under Mr. Hale's desk while scrubbing.", ['arthur', 'coin'], 3); } return r; } });
      if (!a.done[d + 'dust']) o.push({ text: 'Empty the waste-paper baskets and dust the desks.', run: () => { a.done[d + 'dust'] = true; return 'Ada emptied the baskets and dusted the desks.'; } });
      if (t >= 8 * 60 + 30) o.push({ text: 'Put away her pail and go on to Finsbury Circus, so as to be there by nine.', run: () => { a.place = 'finsbury'; return 'Ada went on to Finsbury Circus.'; } });
      if (W.coin.where === 'ada') {
        o.push({ text: "Lay the half-crown on Mr. Hale's desk, where he will find it.", run: () => { W.coin.where = 'desk'; remember('ada', "She laid the half-crown she found on Mr. Hale's desk.", ['arthur', 'coin'], 3); fact('ada', "What did you do with the half-crown you found under Mr. Hale's desk?", ['Laid it on his desk', 'Kept it', 'Gave it to Mr. Thomas'], 0); return "Ada laid the half-crown on Mr. Hale's desk."; } });
        o.push({ text: 'Keep the half-crown for herself; nobody would know.', run: () => { W.coin.where = 'kept'; a.money += 30; remember('ada', "She kept the half-crown she found under Mr. Hale's desk.", ['arthur', 'coin'], 3); fact('ada', "What did you do with the half-crown you found under Mr. Hale's desk?", ['Laid it on his desk', 'Kept it', 'Gave it to Mr. Thomas'], 1); return 'Ada slipped the half-crown into her purse.'; } });
      }
      if (!W.bertWork && W.extraHours === null && others.includes('thomas')) o.push({ talk: { to: 'thomas', topic: 'whether there is any extra cleaning she might do for more money, now that Bert is out of work', resolve: 'extra' }, text: 'Ask Mr. Thomas whether there is any extra cleaning she might do for more money.' });
      if (W.rentDue && !W.rentPaid[d] && A.ada.money < 84 && W.loan === null && others.includes('arthur')) o.push({ talk: { to: 'arthur', topic: 'whether he could lend her a few shillings till next week, for the rent', resolve: 'loan' }, text: 'Ask Mr. Hale whether he could lend her a few shillings for the rent.' });
    }
    if (here === 'market') {
      for (const it of MARKET) if (it.cost <= a.money) o.push({ text: `Buy ${it.text} (${money(it.cost)}); she would have ${money(a.money - it.cost)} left.`, run: () => { a.money -= it.cost; remember('ada', `She bought ${it.text} for ${money(it.cost)}.`, ['money'], 1); return `Ada bought ${it.text} for ${money(it.cost)}`; } });
      o.push({ text: 'Buy nothing today, to save her money for the rent.', run: () => { remember('ada', 'She bought nothing at the market, to save for the rent.', ['rent'], 2); return 'Ada bought nothing, to save for the rent.'; } });
    }
    if (here === 'ada_home') {
      if (W.rentDue && !W.rentPaid[d] && t >= 19 * 60) {
        if (a.money >= 84) o.push({ text: `Pay the landlord the week's rent of seven shillings; she would have ${money(a.money - 84)} left.`, run: () => payRent(true) });
        o.push({ text: 'Ask the landlord to wait for the rent till next week.', run: () => payRent(false) });
        if (!a.done.pawned) o.push({ text: "Pawn her late husband's watch for ten shillings, to pay the rent.", run: () => { a.done.pawned = true; a.money += 120; remember('ada', "She pawned her late husband's watch for ten shillings.", ['money'], 3); fact('ada', "Did you pawn anything this fortnight?", ["My late husband's watch", 'My wedding ring', 'Nothing'], 0); return "Ada pawned her late husband's watch for 10s."; } });
      }
      o.push({ text: 'Cook the supper and mend Bert\'s working jacket.', run: () => 'Ada cooked the supper and mended.' });
    }
    if (here === 'chapel') {
      for (const c of [1, 3, 6]) if (c <= a.money) o.push({ text: `Put ${money(c)} in the collection.`, run: () => { a.money -= c; return `Ada put ${money(c)} in the collection.`; } });
      o.push({ text: 'Pray quietly for Bert to find work.', run: () => { remember('ada', 'She prayed at chapel for Bert to find work.', ['bert'], 2); return 'Ada prayed for Bert.'; } });
    }
  }
  if (k === 'arthur') {
    if (here === 'office') {
      if (W.auditDue && !W.audit.verdict) o.push({ text: 'Work at preparing the books for the auditors.', book: 'audit' });
      else if (W.ledger.assigned && W.ledger.steps < W.ledger.need && !W.ledger.verdict) o.push({ text: 'Work at the quarterly ledger.', book: 'ledger' });
      else o.push({ text: "Get on with the day's ordinary entries in the books.", run: () => "Arthur worked at the day's entries." });
      if (d === 0 && !a.done.searched && W.coin.where !== 'arthur') o.push({ text: 'Look about the floor for the half-crown he lost yesterday.', run: () => { a.done.searched = true; if (W.coin.where === 'floor') { W.coin.where = 'arthur'; W.coin.finder = 'arthur'; a.money += 30; remember('arthur', 'He found his lost half-crown himself, under his desk.', ['coin'], 3); return 'Arthur found his half-crown under his desk!'; } return 'Arthur searched, but the half-crown was not on the floor.'; } });
      if (W.coin.where === 'desk') o.push({ text: 'Pick up the half-crown lying on his desk.', run: () => { W.coin.where = 'arthur'; a.money += 30; remember('arthur', 'He found his lost half-crown laid on his desk; somebody must have found it and put it there.', ['coin'], 3); return 'Arthur picked up his half-crown from the desk.'; } });
      if (W.joanIll && W.doctor !== 'called' && !a.done.leave && others.includes('thomas')) o.push({ talk: { to: 'thomas', topic: 'whether he may leave early, as his little girl is ill', resolve: 'leave' }, text: 'Ask Mr. Thomas whether he may leave early, as Joan is ill.' });
    }
    if (here === 'teashop') {
      o.push({ text: 'Have soup and a chop (1s. 2d.).', run: () => { a.money -= 14; return 'Arthur had soup and a chop for 1s. 2d.'; } });
      o.push({ text: 'Have only a cup of tea and a bun (3d.), to save money.', run: () => { a.money -= 3; return 'Arthur had tea and a bun for 3d.'; } });
    }
    if (here === 'arthur_home') {
      if (w === 'fri' && W.paid['arthur' + d] && !a.done['hk' + d]) for (const s of [30, 35, 40]) o.push({ text: `Give Edith ${s} shillings for the week's housekeeping; he would keep ${money(a.money - s * 12)}.`, run: () => { a.money -= s * 12; a.done['hk' + d] = s; remember('arthur', `He gave Edith ${s} shillings for the week's housekeeping.`, ['edith', 'money'], 3); fact('arthur', 'How much housekeeping money did you give Edith on Friday?', ['30 shillings', '35 shillings', '40 shillings'], [30, 35, 40].indexOf(s)); return `Arthur gave Edith ${s}s. for the housekeeping.`; } });
      if (W.joanIll && W.doctor !== 'called' && a.money >= 42) o.push({ text: `Send for the doctor for Joan (3s. 6d.); he would have ${money(a.money - 42)} left.`, run: () => { a.money -= 42; W.doctor = 'called'; W.joanIll = false; remember('arthur', 'He sent for the doctor for Joan, who said it was a bad cold, not bronchitis, and she would mend.', ['joan', 'money'], 3); fact('arthur', "Did you send for the doctor for Joan?", ['Yes', 'No'], 0); return 'Arthur sent for the doctor (3s. 6d.); Joan has a bad cold and will mend.'; } });
      if (W.joanIll && W.doctor !== 'called') o.push({ text: 'Wait and see whether Joan mends by herself, to save the doctor\'s fee.', run: () => { remember('arthur', 'He decided to wait and see whether Joan mends, to save the fee.', ['joan'], 2); return 'Arthur decided to wait and see about the doctor.'; } });
      if (w !== 'sun' && t <= 8 * 60) o.push({ text: 'Read the morning paper over breakfast.', run: () => { a.money -= 1; const n = NEWS[d] || 'Nothing of great note.'; remember('arthur', `He read in the paper: ${n}`, ['news'], 1); return `Arthur read the paper: ${n}`; } });
      if (t >= 15 * 60 && w !== 'sun') o.push({ text: 'Work in the garden at his seedlings.', run: () => 'Arthur worked in the garden.' });
    }
    if (here === 'church') {
      for (const c of [3, 6, 12]) if (c <= a.money) o.push({ text: `Put ${money(c)} in the collection.`, run: () => { a.money -= c; return `Arthur put ${money(c)} in the collection.`; } });
    }
    if (here === 'park') o.push({ text: 'Walk with Joan and point out the birds and the spring crocuses.', run: () => 'Arthur walked with Joan in the park.' });
  }
  if (k === 'thomas') {
    if (here === 'office') {
      if (d === 0 && !W.ledger.assigned && others.includes('arthur')) o.push({ text: 'Give Mr. Hale the quarterly ledger to balance.', run: () => { W.ledger.assigned = true; remember('arthur', 'Mr. Thomas set him to balance the quarterly ledger.', ['thomas', 'ledger'], 3); return 'Mr. Thomas set Arthur to the quarterly ledger.'; } });
      if (W.ledger.assigned && !W.ledger.verdict && (d >= 1)) o.push({ text: "Examine the quarterly ledger Mr. Hale has been working on.", run: () => verdict('ledger') });
      if (d === 10 && W.auditDue && !W.audit.verdict && t >= 12 * 60) o.push({ text: 'Go through the books with the auditors.', run: () => verdict('audit') });
      if (W.audit.verdict && W.audit.raise === null && others.includes('arthur') && d >= 11) {
        o.push({ text: "Recommend Mr. Hale to the directors for a rise of five shillings a week.", run: () => { W.audit.raise = true; remember('arthur', 'Mr. Thomas told him he would recommend him for a rise of five shillings a week.', ['thomas', 'money'], 3); remember('thomas', 'He recommended Mr. Hale for a rise.', ['arthur'], 3); fact('arthur', 'What did Mr. Thomas tell you after the audit?', ['He would recommend me for a rise', 'He would dismiss me', 'Nothing'], 0); return 'Mr. Thomas recommended Arthur for a rise of 5s. a week.'; } });
        o.push({ text: 'Say nothing of a rise to Mr. Hale this year.', run: () => { W.audit.raise = false; fact('arthur', 'What did Mr. Thomas tell you after the audit?', ['He would recommend me for a rise', 'He would dismiss me', 'Nothing'], 2); return 'Mr. Thomas said nothing of a rise.'; } });
      }
      if (w === 'fri' && !W.paid['ada' + d] && others.includes('ada')) o.push({ text: "Pay Mrs. Turner her week's wages, twelve shillings.", run: () => { W.paid['ada' + d] = true; A.ada.money += 144; remember('ada', "Mr. Thomas paid her the week's wages, twelve shillings.", ['thomas', 'money'], 2); return 'Mr. Thomas paid Ada her 12s.'; } });
      o.push({ text: 'Attend to the correspondence at his own desk.', run: () => 'Mr. Thomas attended to the correspondence.' });
    }
    if (here === 'teashop') o.push({ text: 'Take his usual chop and a glass of water.', run: () => { a.money -= 14; return 'Mr. Thomas lunched.'; } });
    if (here === 'church') o.push({ text: 'Put a shilling in the collection.', run: () => { a.money -= 12; return 'Mr. Thomas put a shilling in the collection.'; } });
    if (here === 'park') o.push({ text: 'Walk briskly round the Fields.', run: () => 'Mr. Thomas walked round the Fields.' });
  }
  // social options: concrete content
  for (const p of others) {
    if (k === 'ada' && p === 'arthur' && W.coin.finder === 'ada' && !a.done.toldCoin) o.push({ talk: { to: p, topic: 'the half-crown she found under his desk', resolve: 'coin', fact: () => { a.done.toldCoin = true; remember('arthur', `Mrs. Turner told him she had found his half-crown under his desk${['desk', 'arthur'].includes(W.coin.where) ? ' and laid it on his desk' : ''}.`, ['ada', 'coin'], 3); } }, text: "Tell Mr. Hale that she found a half-crown under his desk." });
    if (k === 'arthur' && p === 'ada' && W.coin.finder === 'ada' && A.arthur.mem.some(m => /Mrs\. Turner told him|laid on his desk/.test(m.text)) && !a.done.thanked) o.push({ talk: { to: p, topic: 'his thanks for her honesty about the half-crown', fact: () => { a.done.thanked = true; remember('ada', 'Mr. Hale thanked her for her honesty.', ['arthur', 'coin'], 3); } }, text: 'Thank Mrs. Turner for her honesty about the half-crown.' });
    const news = NEWS[d] ? 'the news in the paper' : null;
    if (!a.done['chat' + p + d]) o.push({ talk: { to: p, topic: news && Math.random() < 0.5 ? news : (k === 'thomas' || p === 'thomas') && w !== 'sun' ? 'the work in hand' : 'the weather and how things are at home', fact: () => { a.done['chat' + p + d] = true; } }, text: `Pass the time of day with ${nameOf(p)}.` });
  }
  for (const p of Object.keys(NPC)) if (NPC[p].place === here && !a.done['npc' + p + d + (t >= 17 * 60 ? 'e' : 'm')]) {
    const topic = p === 'edith' ? (W.joanIll ? "Joan's illness and whether to send for the doctor" : W.paid['arthur' + d] && !a.done['hk' + d] ? "the week's housekeeping money" : 'how the day has gone') : p === 'joan' ? 'what she did today' : (!W.bertWork ? 'how Bert is getting on with looking for work' : 'how the day went at the docks');
    o.push({ talk: { to: p, topic, fact: () => { a.done['npc' + p + d + (t >= 17 * 60 ? 'e' : 'm')] = true; } }, text: `Talk with ${NPC[p].name} about ${topic}.` });
  }
  if (!o.length) o.push({ text: 'Rest quietly for a while.', run: () => `${a.short} rested.` });
  return o.slice(0, 12);
}
function payRent(pay) {
  const a = A.ada; W.rentPaid[W.day] = true; W.rentDue = false;
  W.rentOwing = !pay;
  if (pay) { a.money -= 84; remember('ada', 'She paid the landlord the rent of seven shillings.', ['rent', 'money'], 3); fact('ada', 'Did you pay the rent on Friday?', ['Yes, in full', 'No, I asked the landlord to wait'], 0); return 'Ada paid the rent of 7s.'; }
  remember('ada', 'She asked the landlord to wait for the rent; he grumbled and gave her till Monday.', ['rent'], 3); fact('ada', 'Did you pay the rent on Friday?', ['Yes, in full', 'No, I asked the landlord to wait'], 1); return 'Ada asked the landlord to wait for the rent.';
}
function verdict(which) {
  const B = which === 'audit' ? W.audit : W.ledger;
  const need = which === 'audit' ? 3 : 3;
  const v = B.steps >= need && B.errors === 0 ? 'in perfect order' : B.steps >= need ? `complete, but with ${B.errors} mistake${B.errors > 1 ? 's' : ''}` : `not finished (${B.steps} of ${need} totals done)`;
  B.verdict = v;
  const what = which === 'audit' ? 'the books for the audit' : 'the quarterly ledger';
  remember('thomas', `He examined ${what} kept by Mr. Hale and found them ${v}.`, ['arthur', which], 3);
  remember('arthur', `Mr. Thomas examined ${what} and found them ${v}.`, ['thomas', which], 3);
  fact('arthur', `In what state did Mr. Thomas find ${what}?`, ['In perfect order', 'Complete but with mistakes', 'Not finished'], /perfect/.test(v) ? 0 : /complete/.test(v) ? 1 : 2);
  if (!/perfect/.test(v)) W.pendingLesson = ['arthur', `Mr. Thomas found ${what} ${v}.`];
  return `Mr. Thomas examined ${what}: ${v}.`;
}
function presentAt(k) { return Object.keys(A).filter(o => o !== k && A[o].place && A[o].place === A[k].place); }
function core(k) {
  const f = [];
  if (k === 'arthur' && W.day === 0) f.push(W.coin.where === 'arthur' ? 'He has his half-crown back.' : 'His half-crown, lost on Thursday, is still missing.');
  if (k === 'ada' && W.coin.where === 'ada') f.push("She has in her hand the half-crown she found under Mr. Hale's desk.");
  if (k === 'ada' && !W.bertWork) f.push('Bert is out of work, so she must find his half of the rent herself.');
  if (k === 'ada' && W.rentDue && !W.rentPaid[W.day]) f.push('The rent of seven shillings is due tonight.');
  if (k === 'ada' && W.loan) f.push(W.loan);
  if (k === 'arthur' && W.loan) f.push(W.loan.replace('She owes Mr. Hale', 'Mrs. Turner owes him'));
  if (k === 'arthur' && W.joanIll) f.push('Joan is ill in bed' + (W.doctor === 'not called' ? ', and the doctor has not been called.' : '.'));
  if (k === 'arthur' && W.auditDue && !W.audit.verdict) f.push('The auditors come on Monday; the books must be ready.');
  if (k === 'thomas' && W.auditDue && !W.audit.verdict) f.push('The auditors come on Monday.');
  for (const x of A[k].mem.filter(x => /resolves|promised/.test(x.text)).slice(-2)) f.push(x.text);
  return f.join(' ');
}
function perceive(k) {
  const a = A[k], others = presentAt(k), npcs = Object.keys(NPC).filter(n => NPC[n].place === a.place);
  const pres = [...others.map(o => `${nameOf(o)} (${a.short} ${opinionWords(k, o)} ${himher(o)})`), ...npcs.map(n => NPC[n].name)];
  return [
    `It is ${clock(W.t)}, ${DAYS[W.day]}. The weather is ${WEATHER[W.day]}.`,
    `CHARACTER: ${a.sheet}`,
    `PLACE: ${a.name} is at ${PLACE[a.place]}. PRESENT: ${pres.length ? pres.join('; ') : 'nobody else'}.`,
    `PURSE: ${money(a.money)}.`,
    core(k) ? `KNOWN FOR CERTAIN: ${core(k)}` : '',
    `${a.short.toUpperCase()} REMEMBERS: ${recall(k, [...others, ...npcs, 'coin', 'ledger', 'audit', 'rent', 'joan', 'bert']) || 'nothing of note.'}`,
    beliefs(k, [...others, ...npcs]) ? `${a.short.toUpperCase()}'S OPINIONS: ${beliefs(k, [...others, ...npcs])}` : ''
  ].filter(Boolean).join('\n');
}
// game-master resolution of conversations about open questions (majority of three)
async function resolveTalk(kind, lines, k, p) {
  const T = lines.join('\n');
  const R = {
    coin: { q: 'What was settled about the half-crown?', opts: ['Mrs. Turner is to keep it', 'Mr. Hale takes it back', 'nothing was settled'], apply: i => {
      if (i === 0 && W.coin.where !== 'kept') { if (W.coin.where === 'arthur') A.arthur.money -= 30; W.coin.where = 'kept'; A.ada.money += 30; remember('ada', 'Mr. Hale told her to keep the half-crown, as a reward for her honesty.', ['arthur', 'coin'], 3); remember('arthur', 'He told Mrs. Turner to keep the half-crown, as a reward for her honesty.', ['ada', 'coin'], 3); return 'Ada keeps the half-crown as a reward.'; }
      if (i === 1 && !['arthur'].includes(W.coin.where)) { W.coin.where = 'arthur'; A.arthur.money += 30; remember('arthur', 'He took his half-crown back.', ['ada', 'coin'], 3); return 'Arthur takes the half-crown back.'; } return null; } },
    extra: { q: 'What did Mr. Thomas decide about extra work for Mrs. Turner?', opts: ['He gave her extra cleaning for three shillings a week more', 'He said there was none to be had', 'nothing was decided'], apply: i => {
      if (i === 0) { W.extraHours = true; A.ada.money += 36; remember('ada', 'Mr. Thomas gave her extra cleaning on Saturdays, for three shillings a week more, paid in advance this week.', ['thomas', 'money'], 3); remember('thomas', 'He gave Mrs. Turner extra cleaning for 3s. a week.', ['ada'], 3); fact('ada', 'What did Mr. Thomas say when you asked for extra work?', ['He gave me extra cleaning', 'He said there was none', 'I never asked'], 0); return 'Ada gets extra cleaning, 3s. a week.'; }
      if (i === 1) { W.extraHours = false; remember('ada', 'Mr. Thomas told her there was no extra work to be had.', ['thomas'], 3); fact('ada', 'What did Mr. Thomas say when you asked for extra work?', ['He gave me extra cleaning', 'He said there was none', 'I never asked'], 1); return 'No extra work for Ada.'; } return null; } },
    loan: { q: 'What did Mr. Hale decide about lending Mrs. Turner money?', opts: ['He lent her five shillings', 'He refused', 'nothing was decided'], apply: i => {
      if (i === 0 && A.arthur.money >= 60) { W.loan = 'She owes Mr. Hale five shillings, lent for the rent.'; A.arthur.money -= 60; A.ada.money += 60; remember('ada', 'Mr. Hale lent her five shillings for the rent.', ['arthur', 'loan'], 3); remember('arthur', 'He lent Mrs. Turner five shillings for her rent.', ['ada', 'loan'], 3); fact('ada', 'Who lent you money for the rent?', ['Mr. Hale', 'Mr. Thomas', 'Nobody'], 0); fact('arthur', 'Did you lend anybody money this fortnight?', ['Yes, Mrs. Turner, five shillings', 'Yes, Mr. Thomas', 'No'], 0); return 'Arthur lends Ada 5s.'; }
      if (i === 1) { W.loan = false; remember('ada', 'Mr. Hale would not lend her money.', ['arthur'], 3); return 'Arthur refuses the loan.'; } return null; } },
    leave: { q: 'What did Mr. Thomas decide about Mr. Hale leaving early?', opts: ['He let him go home early to his child', 'He told him to stay at his work', 'nothing was decided'], apply: i => {
      A.arthur.done.leave = true;
      if (i === 0) { remember('arthur', 'Mr. Thomas let him go home early to Joan.', ['thomas', 'joan'], 3); remember('thomas', 'He let Mr. Hale go home early to his sick child.', ['arthur'], 3); A.arthur.place = 'arthur_home'; A.arthur.leftEarly = W.day; return 'Arthur may go home early.'; }
      if (i === 1) { remember('arthur', 'Mr. Thomas told him to stay at his work.', ['thomas'], 3); return 'Arthur must stay.'; } return null; } }
  }[kind];
  const c = await choose(`This conversation has just taken place:\n${T}\n\n${R.q}\n${R.opts.map((o, i) => `(${L[i]}) ${o}`).join('\n')}\n\nAnswer with the letter only.`, R.opts, 3);
  const r = c.i === null ? null : R.apply(c.i);
  say(`      ⚖ ${r || 'Nothing settled.'}`);
  STATS.resolutions = (STATS.resolutions || 0) + 1;
}

// ======================= agents: talk, learn, act =======================
async function converse(k, talk) {
  const p = talk.to; STATS.convs++;
  const lines = [], S = { [k]: new Session(), [p]: new Session() };
  const intro = sp => `${A[sp] ? perceive(sp) : `It is ${clock(W.t)}, ${DAYS[W.day]}.\nCHARACTER: ${NPC[sp].sheet}`}\n\n`;
  try {
    let last = null;
    const turns = talk.resolve || /half-crown|thanks|rent|doctor|ill|work for|lend/.test(talk.topic) ? 4 : 2;
    for (let turn = 0; turn < turns; turn++) {
      const sp = turn % 2 === 0 ? k : p, other = sp === k ? p : k;
      const msg = turn === 0
        ? `${intro(sp)}You are ${nameOf(sp)}. You now speak to ${nameOf(other)} about ${talk.topic}. Write your exact words only: one or two sentences, in your own manner of speech.`
        : turn === 1
          ? `${intro(sp)}You are ${nameOf(sp)}. ${nameOf(other)} says to you, about ${talk.topic}: "${last}"\n\nWrite your exact words in answer only: one or two sentences, in your own manner of speech.`
          : `${nameOf(other)} answers: "${last}"\n\nWhat do you say now? Your exact words only, one or two sentences.`;
      let r = cleanSpeech(await S[sp].send(msg + ' Write only the words spoken aloud, in direct speech as in a play, in your own manner — not the other person\'s words, and without he says or she says.')); STATS.lines++;
      if (r && /^(?:I (?:said|told|spoke|replied|answered|asked|thanked|mentioned)|to (?:Mr|Mrs)|that )/i.test(r)) { STATS.reported = (STATS.reported || 0) + 1; r = cleanSpeech(await S[sp].send('Those are not your words as spoken. Write only the very words you say aloud, as in a play.')); }
      if (!r) { STATS.emptyLines++; break; }
      last = r; lines.push(`${nameOf(sp).toUpperCase()}: "${r}"`); say(`      ${nameOf(sp)}: "${r}"`);
    }
  } finally { await S[k].close(); await S[p].close(); }
  if (talk.fact) talk.fact();
  if (talk.resolve && lines.length) await resolveTalk(talk.resolve, lines, k, p);
  const gist = lines.map(l => l.replace(/^[A-Z. ]+: /, '')).join(' ').slice(0, 160);
  // opinions: closed question, no way out
  for (const [x, y] of [[k, p], [p, k]]) {
    if (!A[x] || !lines.length) continue;
    const c = await choose(`${A[x].sheet}\n\nThis conversation has just taken place:\n${lines.join('\n')}\n\nAfter it, does ${A[x].name} think better or worse of ${nameOf(y)} than before?\n(A) better\n(B) worse\n\nAnswer with the letter only.`, ['better', 'worse']);
    if (c.i !== null) { A[x].op[y] = Math.max(-2, Math.min(2, (A[x].op[y] || 0) + (c.i === 0 ? 1 : -1))); say(`      → ${A[x].short} now ${opinionWords(x, y)} ${nameOf(y)}.`); }
  }
  // commitments (coherence between talk and later action)
  for (const x of (talk.resolve || /half-crown|rent|lend|work for/.test(talk.topic)) ? [k, p] : []) {
    if (!A[x] || !lines.length) continue;
    const c = sentences(await ask(`This conversation has just taken place:\n${lines.join('\n')}\n\nDid ${nameOf(x)} promise or agree to do anything? Answer in one short sentence beginning "${A[x].short} promised" or "${A[x].short} promised nothing".`), 1);
    if (c && !/promised nothing|nothing\.?$/i.test(c) && /promis|agree/i.test(c)) { remember(x, c, [x === k ? p : k], 3); say(`      ✎ ${c}`); }
  }
  remember(k, `${A[k].short} spoke with ${nameOf(p)} about ${talk.topic}: ${gist}`, [p]);
  if (A[p]) remember(p, `${A[p].short} spoke with ${nameOf(k)} about ${talk.topic}: ${gist}`, [k]);
  return `${A[k].short} spoke with ${nameOf(p)} about ${talk.topic}.`;
}
async function lesson(k, setback) {
  const r = sentences(await ask(`${A[k].sheet}\n\nWhat has just happened: ${setback}\n\nWhat lesson does ${A[k].name} draw from this for the future? One sentence, in the third person, beginning "${A[k].short} resolves".`), 1);
  if (r && /resolves/i.test(r)) { remember(k, r, [], 3); say(`      ✦ ${r}`); STATS.lessons = (STATS.lessons || 0) + 1; }
}
// end-of-day reflection: what each agent now believes about each person met (stored as belief)
async function reflect(k) {
  const people = [...new Set(A[k].mem.filter(m => m.day === W.day && m.imp >= 2).flatMap(m => m.about))].filter(x => A[x] || NPC[x]).slice(0, 2);
  for (const y of people) {
    const facts = A[k].mem.filter(m => m.about.includes(y)).slice(-5).map(m => m.text).join(' ');
    const r = sentences(await ask(`${A[k].sheet}\n\nWhat ${A[k].name} knows of ${nameOf(y)}: ${facts}\n\nIn one sentence, in the third person, what does ${A[k].name} now think of ${nameOf(y)}?`), 1);
    if (r) { A[k].mem.push({ day: W.day, t: W.t, text: r, about: [y], imp: 3, belief: y }); say(`   ◇ ${A[k].short} reflects: ${r}`); }
  }
}
// formative memories (Concordia style): one past memory per agent that shapes conduct
async function formative(k) {
  const r = sentences(await ask(`${A[k].sheet}\n\nRecall one memory from ${A[k].name}'s past which still shapes how ${heshe(k)} behaves at work and with money. One sentence, in the third person.`), 1);
  if (r) { A[k].mem.push({ day: 'past', t: 0, text: r, about: [], imp: 2 }); say(`   ◆ ${A[k].short}'s past: ${r}`); }
}
async function greet(k, p) {   // social custom of the time: first meeting of the day is greeted
  A[k].metToday.add(p); A[p].metToday.add(k);
  const r = cleanSpeech(await ask(`${perceive(k)}\n\n${nameOf(p)} has just come in. What does ${nameOf(k)} say to greet ${himher(p)}? Write only the very words spoken, as in a play, in one short sentence of ${hisher(k)} own.`));
  const r2 = r ? cleanSpeech(await ask(`${perceive(p)}\n\n${nameOf(k)} greets ${himher(p)}: "${r}"\nWhat does ${nameOf(p)} answer? Write only the very words spoken, as in a play, in one short sentence of ${hisher(p)} own.`)) : '';
  if (r) say(`      ${nameOf(k)}: "${r}"`); if (r2) say(`      ${nameOf(p)}: "${r2}"`);
  STATS.lines += 2; if (!r) STATS.emptyLines++; if (!r2) STATS.emptyLines++;
}
async function act(k) {
  const a = A[k];
  for (const p of presentAt(k)) if (!a.metToday.has(p)) await greet(k, p);
  const opts = optionsFor(k);
  const key = opts.some(o => /Keep the half-crown|^Give Edith|^Buy |Pay the landlord|Pawn|Send for the doctor|Recommend Mr\. Hale/.test(o.text));
  // reasoning: deliberate with the options in view, then choose, in one chat; options shuffled each time
  const tally = new Array(opts.length).fill(0), raws = []; let thought = '';
  for (let v = 0; v < (key ? 3 : 1); v++) {
    const order = opts.map((_, i) => i).sort(() => Math.random() - 0.5);
    const list = order.map((oi, j) => `(${L[j]}) ${opts[oi].text}`).join('\n');
    const S = new Session(); let th, ans;
    try {
      th = await S.send(`${perceive(k)}\n\nWhat matters most to ${a.name} (${heshe(k)}) at this moment, and why? Answer in one sentence about ${a.short} (${heshe(k)}), in the third person.`);
      ans = await S.send(`Bearing that in mind, ${a.name} may now:\n${list}\n\nWhich ONE of these does ${a.name} do next, as ${heshe(k)} truly would? Answer with the letter only, for example: (B)`);
      if (pick(ans, order.map(oi => opts[oi].text)) === null) { STATS.reasks = (STATS.reasks || 0) + 1; ans = await S.send(`Please answer with a single letter only, from A to ${L[opts.length - 1]}.`); }
    } finally { await S.close(); }
    if (!thought) thought = sentences(th, 1);
    raws.push(ans);
    const j = pick(ans, order.map(oi => opts[oi].text));
    if (j !== null) tally[order[j]]++;
  }
  STATS.choices++; if (key) STATS.votes++;
  const best = Math.max(...tally);
  const c = { i: best ? tally.indexOf(best) : null, raw: raws, tally };
  if (c.i === null) STATS.unreadable++;
  const o = c.i === null ? { text: 'Wait (choice unreadable).', run: () => `${a.short} waited.` } : opts[c.i];
  say(`   ${a.short} thinks: ${thought}`);
  say(`   ${a.short} [${c.raw.map(r => (r || '—').slice(0, 25).replace(/\n/g, ' ')).join(' | ')}${c.i === null ? ' → unreadable, waits' : ''}${key ? ' votes ' + JSON.stringify(tally) : ''}] → ${o.text}`);
  let result;
  const before = a.mem.length;
  if (o.talk) result = await converse(k, o.talk);
  else if (o.book) result = await bookWork(o.book);
  else result = o.run();
  say(`   ⇒ ${result}`);
  if (!o.talk && !/waited/.test(result)) { if (a.mem.length === before) remember(k, result, presentAt(k)); for (const p of presentAt(k)) remember(p, `(Seen) ${result}`, [k]); }
  TRACE.push({ day: W.day, time: clock(W.t), agent: k, thought, options: opts.map(x => x.text), raw: c.raw, tally: c.tally, choice: o.text, result });
}

// ======================= diaries, probes, metrics =======================
const METRICS = { probes: [], diaries: [], days: [] };
async function diary(k) {
  const facts = A[k].mem.filter(m => m.day === W.day && !m.belief && m.imp >= 2).map(m => m.text).slice(-5);
  if (!facts.length) return;
  const d = await ask(`${A[k].sheet}\n\nThe facts of ${A[k].name}'s day, ${DAYS[W.day]}:\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nWrite ${A[k].name}'s diary entry for this day, in the first person, keeping to these facts and adding only ${hisher(k)} feelings about them. About eighty words.`);
  const key = f => (f.match(/half-crown|ledger|audit|wages|rent|doctor|Joan|Bert|loan|lent|pawn|rise|extra|housekeeping|Finsbury|market|chapel|church/i) || [null])[0];
  const keyed = facts.filter(key), kept = keyed.filter(f => new RegExp(key(f), 'i').test(d || ''));
  METRICS.diaries.push({ day: W.day, who: k, facts: keyed.length, kept: kept.length });
  say(`\n--- ${A[k].name}'s diary, ${DAYS[W.day]} (${kept.length}/${keyed.length} key facts kept) ---\n${d}`);
}
async function probe(f) {
  const order = f.opts.map((_, i) => i).sort(() => Math.random() - 0.5);
  const c = await choose(`${perceive(f.who)}\n\nQUESTION to ${A[f.who].name}: ${f.q}\n${order.map((oi, j) => `(${L[j]}) ${f.opts[oi]}`).join('\n')}\n\nAnswer with the letter only.`, order.map(oi => f.opts[oi]));
  const ans = c.i === null ? null : order[c.i], ok = ans === f.truth, age = W.day - f.day;
  METRICS.probes.push({ day: W.day, age, who: f.who, q: f.q, ok, answer: ans === null ? null : f.opts[ans], truth: f.opts[f.truth] });
  say(`   [memory, ${age} day${age === 1 ? '' : 's'} old] ${A[f.who].short}: ${f.q} → ${ans === null ? '?' : f.opts[ans]} ${ok ? '✓' : `✗ (truth: ${f.opts[f.truth]})`}`);
}
async function morningProbes() {   // two facts of different ages each morning
  const old = W.facts.filter(f => W.day - f.day >= 1 && A[f.who]);
  if (!old.length) return;
  const byAge = [...old].sort((a, b) => (W.day - b.day) - (W.day - a.day));
  const pickd = [byAge[0], old[(W.day * 7) % old.length]].filter((x, i, arr) => x && arr.indexOf(x) === i);
  for (const f of pickd) await probe(f);
}

// ======================= main =======================
(async () => {
  if (!FAKE) { const { chromium } = require('playwright'); const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined; browser = await chromium.launch({ proxy }); }
  const N = +(process.env.DAYS || 14);
  for (let d = 0; d < N; d++) {
    W.day = d; W.t = 0; for (const k in A) A[k].metToday = new Set();
    say(`\n######## ${DAYS[d]} (${WEATHER[d]}) ########`);
    const asks0 = STATS.asks;
    if (d === 0) for (const k in A) await formative(k);
    if (DOW(d) === 'mon' && W.rentOwing) W.rentDue = true;
    if (d === 8 && W.joanIll) { W.joanIll = false; remember('arthur', 'Joan has mended at last, though she was ill for three days without the doctor.', ['joan'], 3); }
    morningEvents();
    await morningProbes();
    for (const t of ticks(d)) {
      W.t = t; say(`\n=== ${clock(t)} ===`);
      for (const k in A) { let p = placeFor(k, d, t); if (k === 'arthur' && A.arthur.leftEarly === d && t > 12 * 60 + 30) p = 'arthur_home'; A[k].place = p; }
      if (d === 10 && t === 17 * 60 && W.auditDue && !W.audit.verdict) say(`   (The auditors examine the books.) ${verdict('audit')}`);
      if (DOW(d) === 'fri' && t === 17 * 60 && !W.paid['arthur' + d] && A.arthur.place === 'office') { W.paid['arthur' + d] = true; A.arthur.money += 840; remember('arthur', "Mr. Thomas paid him his week's wages, £3 10s.", ['thomas', 'money'], 2); say("   (Wages: Arthur receives £3 10s.)"); }
      const groups = {};
      for (const k in A) if (A[k].place && A[k].place !== 'finsbury') (groups[A[k].place] = groups[A[k].place] || []).push(k);
      await Promise.all(Object.values(groups).map(async ks => {
        for (const k of ks) {
          const before = A[k].mem.length;
          await act(k);
          const setback = A[k].mem.slice(before).map(x => x.text).find(x => /wrong figure|not finished|no extra work|would not lend|grumbled|stay at his work/i.test(x));
          const kind = setback && setback.match(/wrong figure|not finished|no extra work|would not lend|grumbled|stay at his work/i)[0];
          if (setback && !A[k].done['lesson' + d + kind]) { A[k].done['lesson' + d + kind] = true; await lesson(k, setback); }
          if (W.pendingLesson) { const [who, what] = W.pendingLesson; W.pendingLesson = null; await lesson(who, what); }
        }
      }));
      fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify({ W, STATS, agents: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { place: a.place, money: a.money, op: a.op, mem: a.mem }])) }, null, 1));
    }
    eveningEvents();
    for (const k in A) { await reflect(k); await diary(k); }
    consolidate();
    METRICS.days.push({ day: d, asks: STATS.asks - asks0, money: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, a.money])), op: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(A).map(([k, a]) => [k, a.op])))) });
    fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ METRICS, STATS, W }, null, 1));
    fs.writeFileSync(path.join(OUT, 'story.txt'), STORY.join('\n'));
  }
  say('\n######## Final memory examination ########');
  W.day = Math.min(N, DAYS.length - 1); for (const k in A) A[k].place = A[k].place || (k === 'ada' ? 'ada_home' : k === 'arthur' ? 'arthur_home' : 'church');
  for (const f of W.facts.filter(f => A[f.who])) await probe(f);
  const P = METRICS.probes, D = METRICS.diaries;
  say(`\nSTATS ${JSON.stringify(STATS)}`);
  say(`MEMORY: ${P.filter(p => p.ok).length}/${P.length} correct; by age: ${JSON.stringify([1, 2, 3, 4, 5, 7, 10, 13].map(a => [a, P.filter(p => p.age >= a).length ? +(P.filter(p => p.age >= a && p.ok).length / P.filter(p => p.age >= a).length).toFixed(2) : null]))}`);
  say(`DIARIES: ${D.reduce((s, x) => s + x.kept, 0)}/${D.reduce((s, x) => s + x.facts, 0)} key facts kept`);
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ METRICS, STATS, W }, null, 1));
  fs.writeFileSync(path.join(OUT, 'story.txt'), STORY.join('\n'));
  if (browser) await browser.close();
  console.log('DONE');
})();
