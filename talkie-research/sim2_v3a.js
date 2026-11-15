// v3 simulation engine for talkie-1930 (web demo).
// Principle: the ENGINE is the world and the planner (clock, places, money, duties, objects,
// memory, arithmetic); TALKIE is the voice and the chooser (deliberates, picks among concrete
// options whose consequences are spelled out, speaks short lines, judges people).
// Usage: node sim2.js [segment ...]   segments: fri-am fri-pm sat   (default: all)
//        FAKE=1 node sim2.js           offline dry run with a random chooser
const fs = require('fs');
const path = require('path');
const FAKE = !!process.env.FAKE;
const OUT = path.join(__dirname, process.env.RUN || 'sim2');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, FAKE ? 0 : ms));
const STORY = []; const TRACE = []; const STATS = { asks: 0, choices: 0, unreadable: 0, votes: 0, ledgerRight: 0, ledgerWrong: 0, convs: 0, lines: 0, emptyLines: 0, diaryFallback: 0, probes: [] };
const say = s => { console.log(s); STORY.push(s); };

// ======================= talkie I/O =======================
let browser = null;
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
async function chat(msgs) {           // several turns in one chat window
  STATS.asks += msgs.length;
  if (FAKE) return msgs.map(m => { const L = msgs.join('\n').match(/^\(([A-L])\)/gm); return /letter only/.test(m) && L ? L[Math.floor(Math.random() * L.length)].slice(1, 2) + '.' : 'Good morning to you; it is a fine day, and I must be about my work.'; });
  const p = await browser.newPage(); const out = [];
  try {
    await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 });
    for (const [n, msg] of msgs.entries()) {
      const box = p.locator('textarea:visible').first();
      await box.fill(msg); await box.press('Enter');
      let last = '', stable = 0;
      for (let i = 0; i < 120; i++) {
        await sleep(1500);
        const t = await p.innerText('body'); const r = replies(t);
        if (r.length <= n || !r[n]) continue;
        if (t === last) { if (++stable >= 5) break; } else { stable = 0; last = t; }
      }
      let a = replies(await p.innerText('body'))[n] ?? null;
      if (a && /flagged as potentially inappropriate/i.test(a)) a = null;
      out.push(a); if (!a) break;
    }
  } catch (e) { out.push(null); } finally { await p.close(); await sleep(1500); }
  return out;
}
const ask = async m => (await chat([m]))[0];

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
const sentences = (t, n) => ((t || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["”']?/g) || [t || '']).slice(0, n).join(' ').trim();
function cleanSpeech(t) {
  let s = (t || '').replace(/^[^"“]*?\b(?:says?|said|replies|replied|answers|answered|remarks)\b[,:]?\s*/i, '');
  s = s.replace(/^\s*[A-Z][A-Za-z. ]{0,30}:\s*/, '');
  s = sentences(s, 2).replace(/^["“'‘]+|["”'’]+$/g, '').trim();
  return s;
}
const money = d => { d = Math.round(d); const P = Math.floor(d / 240), s = Math.floor((d % 240) / 12), p = d % 12; return (P ? `£${P} ` : '') + (s || P ? `${s}s. ` : '') + `${p}d.`; };
function clock(min) {
  const h = Math.floor(min / 60), m = min % 60, H = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][h % 12], N = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][(h + 1) % 12];
  const part = h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening';
  return (m === 0 ? `${H} o'clock` : m === 30 ? `half past ${H}` : m === 15 ? `a quarter past ${H}` : `a quarter to ${N}`) + ` ${part}`;
}

// ======================= the world =======================
const PLACE = {
  ada_home: "Mrs. Turner's two rooms in Bermondsey", arthur_home: "the Hales' house in Islington", thomas_home: "Mr. Thomas's house in Highbury",
  station: "the news-stand at Moorgate station", office: "the clerks' room of the Moorgate Fire and Life Assurance Company",
  teashop: "a Lyons tea-shop in Moorgate", finsbury: "the offices in Finsbury Circus which Mrs. Turner cleans", market: "the street-market in Bermondsey", park: "Highbury Fields, a public park"
};
const SHORTP = { ada_home: 'home', arthur_home: 'home', thomas_home: 'home', station: 'the news-stand', office: 'the office', teashop: 'the tea-shop', finsbury: 'Finsbury Circus', market: 'the market', park: 'Highbury Fields' };
const NEWS = {
  fri: "A NEW PLANET: the Lowell Observatory in Arizona announces the discovery of a ninth planet beyond Neptune. INDIA: Mr. Gandhi is marching to the sea to make salt in defiance of the Salt Laws. UNEMPLOYMENT stands at about one million and a half.",
  sat: "THE NEW PLANET: astronomers at Greenwich hope to photograph it within the week. INDIA: Mr. Gandhi's march continues, followed by great crowds."
};
const DAYS = { fri: 'Friday, the 14th of March, 1930', sat: 'Saturday, the 15th of March, 1930' };

const A = {
  ada: { name: 'Mrs. Ada Turner', short: 'Ada', f: true, home: 'ada_home', money: 4 * 12 + 3,
    sheet: "Mrs. Ada Turner, aged forty-one, a charwoman. She cleans the Moorgate insurance office from half past seven till nine, and then the offices in Finsbury Circus, where she must arrive by nine or lose the place. A war-widow with two grown sons, Bert and Fred, who work at the docks. Honest, chapel-going, proud, sharp-tongued, kind." },
  arthur: { name: 'Mr. Arthur Hale', short: 'Arthur', f: false, home: 'arthur_home', money: 4 * 12 + 6,
    sheet: "Mr. Arthur Hale, aged thirty-four, a ledger clerk at the Moorgate Fire and Life Assurance Company, married to Edith, with a daughter Joan, aged seven. Conscientious, careful with money, a little timid with his superiors, fond of his garden and the newspaper. Hours: a quarter to nine till half past five; Saturdays till one." },
  thomas: { name: 'Mr. Walter Thomas', short: 'Mr. Thomas', f: false, home: 'thomas_home', money: 40 * 12,
    sheet: "Mr. Walter Thomas, aged fifty-six, chief clerk of the Moorgate Fire and Life Assurance Company. Stern, exact, a stickler for duty, but fair and secretly kind. On Fridays he pays the clerks' wages and the charwoman's. A widower who lives in Highbury and walks in Highbury Fields on Saturday afternoons." }
};
const NPC = {
  edith: { name: 'Mrs. Edith Hale', place: 'arthur_home', sheet: "Mrs. Edith Hale, Arthur's wife, aged thirty-two; a careful housekeeper who must feed the family on what Arthur gives her each Friday. Warm but practical." },
  joan: { name: 'Joan Hale', place: 'arthur_home', sheet: "Joan Hale, aged seven, Arthur's daughter; lively, curious, full of questions." },
  bert: { name: 'Bert Turner', place: 'ada_home', sheet: "Bert Turner, aged twenty, Ada's elder son, a docker; good-humoured, often out of work, devoted to his mother." }
};
for (const k in A) { A[k].mem = []; A[k].op = {}; A[k].metToday = new Set(); A[k].done = {}; for (const o of [...Object.keys(A), ...Object.keys(NPC)]) if (o !== k) A[k].op[o] = 0; }
const W = { day: 'fri', t: 0, coin: { where: 'floor', holder: null, finder: null }, ledger: { steps: 0, errors: 0, assigned: false, need: 3 }, paid: { ada: false, arthur: false } };
const nameOf = k => A[k] ? A[k].name : NPC[k].name;
const sheetOf = k => A[k] ? A[k].sheet : NPC[k].sheet;
const hisher = k => (A[k] ? A[k].f : ['edith', 'joan'].includes(k)) ? 'her' : 'his';
const heshe = k => (A[k] ? A[k].f : ['edith', 'joan'].includes(k)) ? 'she' : 'he';

// ---------- memory: engine-written facts, retrieved by recency + relevance ----------
function remember(k, text, about = []) { A[k].mem.push({ day: W.day, t: W.t, text, about }); }
function recall(k, focus = []) {
  const m = A[k].mem; const recent = m.slice(-3);
  const rel = m.slice(0, -3).filter(x => x.about.some(a => focus.includes(a))).slice(-3);
  return [...rel, ...recent].map(x => (x.day !== W.day ? '(Yesterday) ' : '') + x.text).join(' ');
}
function opinionWords(k, o) { const v = A[k].op[o] || 0; return v >= 2 ? 'likes and trusts' : v === 1 ? 'thinks well of' : v === 0 ? 'has no strong feeling about' : v === -1 ? 'is a little put out with' : 'is angry with'; }

// ======================= tools (engine side) =======================
const LEDGER_SUMS = [[1245, 3870], [2316, 989], [4402, 1758], [3075, 2640], [1980, 3415]];
function ledgerQuestion() {
  const [a, b] = LEDGER_SUMS[(W.ledger.steps + W.ledger.errors) % LEDGER_SUMS.length];
  const rows = [`${a} + ${b} = ${a + b}`, `${a} − ${b} = ${a - b}`, `${a} × ${b} = ${a * b}`, `${a} ÷ ${b} = ${(a / b).toFixed(2)}`];
  return { text: `The premiums received this week, £${a} and £${b}, must be added together for the quarterly ledger.\n\nThe office adding-machine shows:\n${rows.map((r, i) => `(${L[i]}) ${r}`).join('\n')}\n\nWhich figure must ${'Arthur'} enter as the total of the two premiums? Answer with the letter only.`, opts: rows, right: 0 };
}
const MARKET = [
  { text: 'a scrag-end of mutton, potatoes and a cabbage (1s. 4d.)', cost: 16 },
  { text: 'a pound of sausages, bread and margarine (1s. 1d.)', cost: 13 },
  { text: 'a rabbit, onions and a loaf, for a Sunday stew (1s. 9d.)', cost: 21 },
  { text: 'nothing; she will make do with what is in the cupboard (0d.)', cost: 0 }
];

// ======================= options =======================
function optionsFor(k) {
  const a = A[k], here = a.place, o = [], d = W.day, t = W.t, others = presentAt(k);
  const go = (to, why, cost = '') => o.push({ text: `Go to ${SHORTP[to]} ${why}${cost}.`, run: () => { a.prev = here; a.place = to; return `${a.short} went to ${PLACE[to]}.`; } });
  const wait = (cost = '') => o.push({ text: `Wait and do nothing for the present${cost}.`, run: () => `${a.short} waited.` });
  // ---------------- Ada ----------------
  if (k === 'ada') {
    if (here === 'office') {
      if (!a.done[d + 'scrub']) o.push({ text: "Scrub the floor under the clerks' desks.", run: () => { a.done[d + 'scrub'] = true; let r = "Ada scrubbed the floor under the clerks' desks."; if (W.coin.where === 'floor') { W.coin.where = 'ada'; W.coin.finder = 'ada'; r += " Under Mr. Hale's desk she found a half-crown (2s. 6d.) wedged in a crack of the boards."; remember('ada', "She found a half-crown under Mr. Hale's desk while scrubbing.", ['arthur', 'coin']); } return r; } });
      if (!a.done[d + 'baskets']) o.push({ text: 'Empty the waste-paper baskets and dust the desks.', run: () => { a.done[d + 'baskets'] = true; return 'Ada emptied the baskets and dusted the desks.'; } });
      const late = t >= 9 * 60;
      o.push({ text: late ? 'Leave at once for Finsbury Circus, though she is already late there.' : 'Leave for Finsbury Circus, so as to be there by nine.', run: () => { a.prev = here; a.place = 'finsbury'; if (late) { a.lateFins = true; remember('ada', 'She arrived late at Finsbury Circus and was sharply warned by the housekeeper that next time she would lose the place.', ['work']); } return `Ada went to Finsbury Circus${late ? ', late' : ''}.`; } });
    }
    if (here === 'ada_home') {
      if (t >= 14 * 60 && t < 17 * 60) go('market', 'to buy food for the week-end');
      if (d === 'sat' && t <= 8 * 60) go('office', "to clean the office as on every morning", t > 7 * 60 + 30 ? ' (she is late already)' : '');
      if (d === 'fri' && t < 8 * 60) go('office', "to clean the office as on every morning");
    }
    if (here === 'market' && !a.done[d + 'market']) {
      for (const it of MARKET) if (it.cost <= a.money) o.push({ text: `Buy ${it.text}. She would have ${money(a.money - it.cost)} left.`, run: () => { a.money -= it.cost; a.done[d + 'market'] = true; remember('ada', `She bought ${it.text.replace(/ \(.*/, '')} at the market.`, ['money']); return `Ada bought ${it.text}.`; } });
    }
    if (here === 'market' && a.done[d + 'market']) go('ada_home', 'to cook the supper');
    if (W.coin.where === 'ada' && A.ada.place === 'office') {
      o.push({ text: "Lay the half-crown on Mr. Hale's desk, where he will find it.", run: () => { W.coin.where = 'desk'; remember('ada', "She laid the half-crown she found on Mr. Hale's desk.", ['arthur', 'coin']); return "Ada laid the half-crown on Mr. Hale's desk."; } });
      o.push({ text: 'Keep the half-crown for herself; nobody would know.', run: () => { W.coin.where = 'kept'; a.money += 30; remember('ada', 'She kept the half-crown she found under Mr. Hale\'s desk.', ['arthur', 'coin']); return 'Ada slipped the half-crown into her purse.'; } });
    }
  }
  // ---------------- Arthur ----------------
  if (k === 'arthur') {
    const workTime = (d === 'fri' && t >= 8 * 60 + 45 && t < 17 * 60 + 30) || (d === 'sat' && t >= 9 * 60 && t < 13 * 60);
    if (here === 'station') {
      if (!a.done[d + 'paper']) o.push({ text: 'Buy a morning newspaper for 1d. and glance at it.', run: () => { a.money -= 1; a.done[d + 'paper'] = true; remember('arthur', `He read in the paper: ${NEWS[d]}`, ['news']); return `Arthur bought a paper for 1d. and read: ${NEWS[d]}`; } });
      go('office', 'to be at his desk in good time');
    }
    if (here === 'office') {
      if (W.ledger.assigned && W.ledger.steps < W.ledger.need) o.push({ text: 'Work at the quarterly ledger (it is wanted by half past twelve).', ledger: true });
      else if (workTime) o.push({ text: 'Get on with the day\'s ordinary entries in the books.', run: () => 'Arthur worked at the day\'s entries.' });
      if (!a.done['searched'] && W.coin.where !== 'arthur') o.push({ text: 'Look about the floor for the half-crown he lost yesterday.', run: () => { a.done['searched'] = true; if (W.coin.where === 'floor') { W.coin.where = 'arthur'; W.coin.finder = 'arthur'; a.money += 30; remember('arthur', 'He found his lost half-crown himself, in a crack under his desk.', ['coin']); return 'Arthur searched and found his half-crown in a crack under his desk!'; } return 'Arthur searched the floor, but his half-crown was not there.'; } });
      if (d === 'fri' && t >= 12 * 60 + 30 && t < 14 * 60 && !a.done[d + 'lunch']) go('teashop', 'for his luncheon (his dinner-hour)');
      if ((d === 'fri' && t >= 17 * 60 + 30) || (d === 'sat' && t >= 13 * 60)) go('arthur_home', 'now that the office has closed');
      else if (workTime && !(t >= 12 * 60 + 30 && t < 14 * 60)) go('teashop', 'for a cup of tea', ' (leaving his work in office hours, which Mr. Thomas would not like)');
    }
    if (here === 'teashop') {
      if (!a.done[d + 'lunch']) o.push({ text: 'Have soup and a chop for 1s. 2d.', run: () => { a.money -= 14; a.done[d + 'lunch'] = true; remember('arthur', 'He had his luncheon at the tea-shop for 1s. 2d.', ['money']); return 'Arthur had soup and a chop for 1s. 2d.'; } });
      go('office', 'to return to work');
    }
    if (here === 'arthur_home') {
      if (d === 'fri' && W.paid.arthur && !a.done.housekeeping) for (const s of [30, 35, 40]) o.push({ text: `Give Edith ${s} shillings for the week's housekeeping. He would keep ${money(a.money - s * 12)}.`, run: () => { a.money -= s * 12; a.done.housekeeping = s; remember('arthur', `He gave Edith ${s} shillings for the week's housekeeping.`, ['edith', 'money']); return `Arthur gave Edith ${s}s. for the housekeeping.`; } });
      if (!a.done[d + 'garden'] && (d === 'sat' || t < 19 * 60)) o.push({ text: 'Go out into the garden to see to his seedlings.', run: () => { a.done[d + 'garden'] = true; remember('arthur', 'He worked in his garden.', []); return 'Arthur pottered in the garden.'; } });
      if (d === 'sat' && t >= 14 * 60) go('park', 'with Joan for a walk');
      if (d === 'sat' && t < 9 * 60) go('office', 'for the Saturday morning\'s work');
      if (d === 'fri' && t < 8 * 60 + 30) go('station', 'on his way to the office');
    }
    if (here === 'office' && W.coin.where === 'desk') o.push({ text: 'Pick up the half-crown lying on his desk.', run: () => { W.coin.where = 'arthur'; a.money += 30; remember('arthur', 'He found his lost half-crown laid on his desk; somebody must have found it and put it there.', ['coin']); return 'Arthur found his half-crown on his desk and pocketed it.'; } });
    if (here === 'park') go('arthur_home', 'for tea');
  }
  // ---------------- Mr. Thomas ----------------
  if (k === 'thomas') {
    if (here === 'office') {
      if (!W.ledger.assigned && presentAt(k).includes('arthur')) o.push({ text: "Give Mr. Hale the quarterly ledger to balance by half past twelve.", run: () => { W.ledger.assigned = true; remember('arthur', 'Mr. Thomas set him to balance the quarterly ledger by half past twelve.', ['thomas', 'ledger']); remember('thomas', 'He set Mr. Hale to balance the quarterly ledger by half past twelve.', ['arthur', 'ledger']); return "Mr. Thomas set Arthur to the quarterly ledger, wanted by half past twelve."; } });
      if (d === 'fri' && !W.paid.ada && presentAt(k).includes('ada')) o.push({ text: "Pay Mrs. Turner her week's wages, twelve shillings.", run: () => payAda() });
      if (W.ledger.assigned && !a.done[d + 'inspect'] && (t >= 12 * 60 + 30 || d === 'sat')) o.push({ text: "Examine the quarterly ledger Mr. Hale has been working on.", run: () => inspectLedger() });
      o.push({ text: 'Attend to the correspondence at his own desk.', run: () => 'Mr. Thomas attended to the correspondence.' });
      if (d === 'fri' && t >= 18 * 60 || d === 'sat' && t >= 13 * 60) go('thomas_home', 'now that the day\'s business is done');
    }
    if (here === 'thomas_home' && d === 'sat' && t >= 14 * 60) go('park', 'for his Saturday walk');
    if (here === 'thomas_home' && t < 9 * 60) go('office', 'to open the office');
    if (here === 'park') go('thomas_home', 'for his tea');
  }
  // ---------------- social: concrete, with content ----------------
  for (const p of others) {
    if (k === 'ada' && p === 'arthur' && W.coin.finder === 'ada' && !a.done.toldCoin) o.push({ text: `Tell Mr. Hale that she found a half-crown under his desk${W.coin.where === 'kept' ? '' : W.coin.where === 'desk' ? ' and laid it on his desk' : ''}.`, talk: { to: p, topic: 'the half-crown she found under his desk', fact: () => { a.done.toldCoin = true; remember('arthur', `Mrs. Turner told him she had found his half-crown under his desk${W.coin.where === 'desk' || W.coin.where === 'arthur' ? ' and laid it on his desk' : ''}.`, ['ada', 'coin']); } } });
    if (k === 'arthur' && p === 'ada' && !a.done.askedAda && W.coin.where !== 'arthur') o.push({ text: 'Ask Mrs. Turner whether she has seen a half-crown he lost yesterday.', talk: { to: p, topic: 'the half-crown he lost', fact: () => { a.done.askedAda = true; } } });
    if (k === 'arthur' && p === 'ada' && W.coin.where === 'arthur' && W.coin.finder === 'ada' && A.arthur.mem.some(m => /Mrs\. Turner told him|laid on his desk/.test(m.text)) && !a.done.thanked) o.push({ text: 'Thank Mrs. Turner for her honesty about the half-crown.', talk: { to: p, topic: 'his thanks for her honesty', fact: () => { a.done.thanked = true; remember('ada', 'Mr. Hale thanked her for her honesty about the half-crown.', ['arthur', 'coin']); } } });
    if (p !== 'ada' || k !== 'arthur') if (!a.done['chat' + p + d]) o.push({ text: `Pass the time of day with ${nameOf(p)} and speak of ${d === 'fri' && a.mem.some(m => /new planet/i.test(m.text)) ? 'the news of the new planet' : 'the weather'}.`, talk: { to: p, topic: d === 'fri' && a.mem.some(m => /new planet/i.test(m.text)) ? 'the news of the new planet' : 'the weather and the day', fact: () => { a.done['chat' + p + d] = true; } } });
  }
  for (const p of Object.keys(NPC)) if (NPC[p].place === here && !a.done['npc' + p + d + (t >= 17 * 60 ? 'e' : 'm')]) {
    const topic = p === 'edith' ? (W.paid.arthur && !a.done.housekeeping ? 'the week\'s housekeeping money' : 'how the day has gone') : p === 'joan' ? 'what she did at school' : 'whether there is work at the docks';
    o.push({ text: `Talk with ${NPC[p].name} about ${topic}.`, talk: { to: p, topic, fact: () => { a.done['npc' + p + d + (t >= 17 * 60 ? 'e' : 'm')] = true; } } });
  }
  if (o.length < 3) wait(k === 'ada' && here === 'office' && t >= 8 * 60 + 45 ? ' (and be late at Finsbury Circus, and perhaps lose the place)' : k === 'arthur' && W.ledger.assigned && W.ledger.steps < W.ledger.need ? ' (with the ledger still unfinished)' : '');
  return o.slice(0, 12);
}
function payAda() { W.paid.ada = true; A.ada.money += 144; remember('ada', 'Mr. Thomas paid her the week\'s wages, twelve shillings.', ['thomas', 'money']); remember('thomas', 'He paid Mrs. Turner her twelve shillings.', ['ada']); return 'Mr. Thomas paid Ada her 12s.'; }
function inspectLedger() {
  A.thomas.done[W.day + 'inspect'] = true;
  const ok = W.ledger.steps >= W.ledger.need && W.ledger.errors === 0, part = W.ledger.steps >= W.ledger.need;
  const verdict = ok ? 'balanced and correct' : part ? `finished, but with ${W.ledger.errors} wrong figure${W.ledger.errors > 1 ? 's' : ''} which had to be corrected` : `not finished (${W.ledger.steps} of ${W.ledger.need} totals entered${W.ledger.errors ? `, ${W.ledger.errors} wrong` : ''})`;
  remember('thomas', `He examined Mr. Hale's quarterly ledger and found it ${verdict}.`, ['arthur', 'ledger']);
  remember('arthur', `Mr. Thomas examined his quarterly ledger and found it ${verdict}.`, ['thomas', 'ledger']);
  W.ledger.verdict = verdict;
  return `Mr. Thomas examined the ledger: ${verdict}.`;
}
function presentAt(k) { return Object.keys(A).filter(o => o !== k && A[o].place && A[o].place === A[k].place); }

// ======================= perception =======================
function perceive(k) {
  const a = A[k], others = presentAt(k), npcs = Object.keys(NPC).filter(n => NPC[n].place === a.place);
  const pres = [...others.map(o => `${nameOf(o)} (${a.short} ${opinionWords(k, o)} ${o === 'ada' ? 'her' : 'him'})`), ...npcs.map(n => NPC[n].name)];
  const urgent = [];
  if (k === 'ada' && a.place === 'office' && W.t >= 8 * 60 + 45) urgent.push('She must leave for Finsbury Circus now, or be late and lose the place.');
  if (k === 'arthur' && W.ledger.assigned && W.ledger.steps < W.ledger.need) urgent.push(`The quarterly ledger is wanted by half past twelve; ${W.ledger.need - W.ledger.steps} totals remain.`);
  if (k === 'arthur' && a.place === 'office' && W.coin.where === 'desk') urgent.push('A half-crown is lying on his desk, very like the one he lost yesterday.');
  return [
    `It is ${clock(W.t)}, ${DAYS[W.day]}. ${W.day === 'fri' ? 'A working day.' : 'Saturday: the office works till one o\'clock.'}`,
    `CHARACTER: ${a.sheet}`,
    `PLACE: ${a.name} is at ${PLACE[a.place]}. PRESENT: ${pres.length ? pres.join('; ') : 'nobody else'}.`,
    `PURSE: ${money(a.money)}.${urgent.length ? ' ' + urgent.join(' ') : ''}`,
    `${a.short.toUpperCase()} REMEMBERS: ${recall(k, [...others, ...npcs, 'coin', 'ledger']) || 'nothing of note yet today.'}`
  ].join('\n');
}

// ======================= conversations =======================
async function converse(k, talk) {
  const p = talk.to; STATS.convs++;
  const lines = [];
  const facts = `${nameOf(k)} wishes to speak about ${talk.topic}.`;
  for (let turn = 0; turn < 4; turn++) {
    const sp = turn % 2 === 0 ? k : p, other = sp === k ? p : k;
    const mem = A[sp] ? recall(sp, [other, 'coin', 'ledger']) : '';
    const prompt = `${A[sp] ? perceive(sp) : `It is ${clock(W.t)}, ${DAYS[W.day]}.\nCHARACTER: ${NPC[sp].sheet}`}\n\nCONVERSATION between ${nameOf(k)} and ${nameOf(p)}. ${facts}\n${lines.length ? lines.join('\n') : `(${nameOf(k)} begins.)`}\n\nWrite the exact words that ${nameOf(sp)} now speaks to ${nameOf(other)}: one or two sentences, in ${hisher(sp)} own manner of speech. Do not write "he says" or "she says".\n\n${nameOf(sp).toUpperCase()}: "`;
    const r = cleanSpeech(await ask(prompt)); STATS.lines++;
    if (!r) { STATS.emptyLines++; break; }
    lines.push(`${nameOf(sp).toUpperCase()}: "${r}"`); say(`      ${nameOf(sp)}: "${r}"`);
  }
  if (talk.fact) talk.fact();
  // opinions: closed question, no way out
  for (const [x, y] of [[k, p], [p, k]]) {
    if (!A[x]) continue;
    const q = `${A[x].sheet}\n\nThis conversation has just taken place:\n${lines.join('\n')}\n\nAfter it, does ${A[x].name} think better or worse of ${nameOf(y)} than before?\n(A) better\n(B) worse\n\nAnswer with the letter only.`;
    const c = await choose(q, ['better', 'worse']);
    if (c.i !== null) { A[x].op[y] = Math.max(-2, Math.min(2, (A[x].op[y] || 0) + (c.i === 0 ? 1 : -1))); say(`      → ${A[x].short} now ${opinionWords(x, y)} ${nameOf(y)}.`); }
  }
  const gist = lines.map(l => l.replace(/^[A-Z. ]+: /, '')).join(' ').slice(0, 160);
  remember(k, `${A[k].short} spoke with ${nameOf(p)} about ${talk.topic}: ${gist}`, [p]);
  if (A[p]) remember(p, `${A[p].short} spoke with ${nameOf(k)} about ${talk.topic}: ${gist}`, [k]);
  return `${A[k].short} spoke with ${nameOf(p)} about ${talk.topic}.`;
}
async function greet(k, p) {   // social custom of the time: first meeting of the day is greeted
  A[k].metToday.add(p); A[p].metToday.add(k);
  const r = cleanSpeech(await ask(`${perceive(k)}\n\n${nameOf(p)} has just come in. What does ${nameOf(k)} say to greet ${p === 'ada' ? 'her' : 'him'}? One short sentence, the exact words only.\n\n${nameOf(k).toUpperCase()}: "`));
  const r2 = cleanSpeech(await ask(`${perceive(p)}\n\n${nameOf(k)} greets ${p === 'ada' ? 'her' : 'him'}: "${r}"\nWhat does ${nameOf(p)} answer? One short sentence, the exact words only.\n\n${nameOf(p).toUpperCase()}: "`));
  say(`      ${nameOf(k)}: "${r}"`); say(`      ${nameOf(p)}: "${r2}"`);
  STATS.lines += 2; if (!r) STATS.emptyLines++; if (!r2) STATS.emptyLines++;
}

// ======================= one decision =======================
async function act(k) {
  const a = A[k];
  for (const p of presentAt(k)) if (!a.metToday.has(p)) await greet(k, p);
  const opts = optionsFor(k);
  const key = opts.some(o => /Keep the half-crown|^Give Edith|^Buy /.test(o.text));
  // reasoning: deliberate with the options in view, then choose, in one chat; options shuffled each time
  const tally = new Array(opts.length).fill(0), raws = []; let thought = '';
  for (let v = 0; v < (key ? 3 : 1); v++) {
    const order = opts.map((_, i) => i).sort(() => Math.random() - 0.5);
    const list = order.map((oi, j) => `(${L[j]}) ${opts[oi].text}`).join('\n');
    const [th, ans] = await chat([
      `${perceive(k)}\n\n${a.name} may now:\n${list}\n\nBefore choosing: what matters most to ${a.name} at this moment, and which of these things does that call for? Answer in one sentence, in the third person.`,
      `Then which ONE of these does ${a.name} do next? Answer with the letter only.`
    ]);
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
  else if (o.ledger) result = await ledgerWork();
  else result = o.run();
  say(`   ⇒ ${result}`);
  if (!o.talk && !/waited/.test(result)) { if (a.mem.length === before) remember(k, result, presentAt(k)); for (const p of presentAt(k)) remember(p, `(Seen) ${result}`, [k]); }
  TRACE.push({ day: W.day, time: clock(W.t), agent: k, thought, options: opts.map(x => x.text), raw: c.raw, tally: c.tally, choice: o.text, result });
}
async function ledgerWork() {   // tool use: the adding-machine works the sums, Arthur must pick the right figure
  const q = ledgerQuestion();
  const c = await choose(`${perceive('arthur')}\n\n${q.text}`, q.opts);
  if (c.i === q.right) { W.ledger.steps++; STATS.ledgerRight++; return `Arthur entered the correct total (${q.opts[0].split(' = ')[1]}); ${W.ledger.steps} of ${W.ledger.need} done.`; }
  W.ledger.errors++; STATS.ledgerWrong++;
  return `Arthur entered a wrong figure (${c.i === null ? 'illegible' : q.opts[c.i].split(' = ')[1]}) in the ledger.`;
}

// ======================= off-stage routines =======================
function offstage(k) {   // returns true if the agent is busy with a routine and makes no decision
  const a = A[k], d = W.day, t = W.t;
  if (k === 'ada' && a.place === 'finsbury') { if (t >= 12 * 60) { a.place = 'ada_home'; remember('ada', 'She finished at Finsbury Circus and went home to Bermondsey.', []); say(`   (Ada finishes at Finsbury Circus and goes home.)`); return false; } return true; }
  if (k === 'arthur' && a.place === 'arthur_home' && d === 'fri' && t < 7 * 60 + 45) return true;
  if (k === 'thomas' && a.place === 'thomas_home' && !(d === 'sat' && t >= 14 * 60)) return true;
  return false;
}

// ======================= schedule =======================
const SEG = {
  'fri-am': { day: 'fri', times: [7 * 60 + 30, 7 * 60 + 45, 8 * 60, 8 * 60 + 15, 8 * 60 + 30, 8 * 60 + 45, 9 * 60, 9 * 60 + 30, 10 * 60 + 30, 11 * 60 + 30] },
  'fri-pm': { day: 'fri', times: [12 * 60 + 30, 13 * 60, 14 * 60 + 30, 15 * 60 + 30, 17 * 60, 17 * 60 + 30, 18 * 60 + 30, 19 * 60 + 30, 20 * 60 + 30] },
  'sat': { day: 'sat', times: [7 * 60 + 30, 8 * 60, 8 * 60 + 30, 9 * 60, 10 * 60, 11 * 60 + 30, 12 * 60 + 30, 13 * 60, 14 * 30 * 1 + 14 * 60 - 14 * 30, 15 * 60, 16 * 60] }
};
SEG.sat.times[8] = 14 * 60 + 30;
const START = { fri: { ada: 'office', arthur: 'arthur_home', thomas: 'thomas_home' }, sat: { ada: 'ada_home', arthur: 'arthur_home', thomas: 'thomas_home' } };
const ARRIVE = { arthur: { fri: [8 * 60, 'station'] }, thomas: { fri: [8 * 60 + 30, 'office'], sat: [8 * 60 + 30, 'office'] } };

// ======================= diaries & memory probes =======================
async function diary(k) {
  const facts = A[k].mem.filter(m => m.day === W.day).map(m => m.text).filter(x => !/waited/.test(x)).slice(-6);
  const base = `${A[k].sheet}\n\nThe facts of ${A[k].name}'s day, ${DAYS[W.day]}:\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\n`;
  let d = await ask(`${base}Write ${A[k].name}'s diary entry for this day, in the first person, keeping to these facts in this order and adding only ${hisher(k)} feelings about them. About one hundred and twenty words.`);
  // faithfulness check: each fact must leave a trace (a distinctive word) in the diary
  const key = f => (f.match(/half-crown|ledger|wages|Finsbury|market|housekeeping|planet|garden|park|luncheon|tea-shop|thanked|honesty/i) || [null])[0];
  const missing = facts.filter(f => key(f) && !new RegExp(key(f), 'i').test(d || ''));
  if (!d || missing.length > 1) {
    STATS.diaryFallback++;
    const parts = [];
    for (const f of facts) { const feel = sentences(await ask(`${A[k].sheet}\n\nToday ${f.replace(/^(He|She|Ada|Arthur|Mr\. Thomas) /, m => m)}\n\nIn one sentence, in the first person, how does ${A[k].name} feel about this?`), 1); parts.push(`${f} ${feel}`); }
    d = parts.join(' ');
  }
  say(`\n--- ${A[k].name}'s diary, ${DAYS[W.day]} ---\n${d}`);
  return d;
}
async function probes() {   // does the memory pipeline carry yesterday's truth into today's decisions?
  const truthFinder = W.coin.finder === 'ada' ? 0 : W.coin.finder === 'arthur' ? 2 : 3;
  const qs = [
    { k: 'arthur', q: 'Who found the half-crown you lost on Thursday?', opts: ['Mrs. Turner, the charwoman', 'Mr. Thomas', 'I found it myself', 'Nobody; it is still lost'],
      truth: A.arthur.mem.some(m => /Mrs\. Turner told him/.test(m.text)) ? 0 : W.coin.finder === 'arthur' ? 2 : W.coin.where === 'arthur' ? null : 3 },
    { k: 'ada', q: 'Did Mr. Thomas pay you your wages yesterday?', opts: ['Yes, twelve shillings', 'No, he did not'], truth: W.paid.ada ? 0 : 1 },
    { k: 'arthur', q: 'How much did you give Edith for the housekeeping yesterday?', opts: ['30 shillings', '35 shillings', '40 shillings', 'Nothing'], truth: { 30: 0, 35: 1, 40: 2 }[A.arthur.done.housekeeping] ?? 3 },
    { k: 'thomas', q: "In what state did you find Mr. Hale's quarterly ledger?", opts: ['Balanced and correct', 'Finished, but with mistakes', 'Not finished', 'I have not yet examined it'], truth: !W.ledger.verdict ? 3 : /balanced and correct/.test(W.ledger.verdict) ? 0 : /finished, but/.test(W.ledger.verdict) ? 1 : 2 }
  ];
  for (const p of qs) {
    const c = await choose(`${perceive(p.k)}\n\nQUESTION to ${A[p.k].name}: ${p.q}\n${p.opts.map((o, i) => `(${L[i]}) ${o}`).join('\n')}\n\nAnswer with the letter only.`, p.opts);
    const ok = p.truth === null ? null : c.i === p.truth;
    STATS.probes.push({ who: p.k, q: p.q, answer: c.i === null ? null : p.opts[c.i], truth: p.truth === null ? null : p.opts[p.truth], ok });
    say(`   [memory probe] ${A[p.k].short}: ${p.q} → ${c.i === null ? '?' : p.opts[c.i]} ${ok === null ? '' : ok ? '✓' : `✗ (truth: ${p.opts[p.truth]})`}`);
  }
}

// ======================= main =======================
(async () => {
  if (!FAKE) { const { chromium } = require('playwright'); const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined; browser = await chromium.launch({ proxy }); }
  const segs = process.argv.slice(2).length ? process.argv.slice(2) : ['fri-am', 'fri-pm', 'sat'];
  for (const sg of segs) {
    const S = SEG[sg];
    if (S.day !== W.day || sg === segs[0]) {
      if (S.day !== W.day) { for (const k in A) await diary(k); W.day = S.day; }
      for (const k in A) { A[k].place = START[S.day][k]; A[k].metToday = new Set(); }
      if (S.day === 'sat') { NPC.edith.place = 'arthur_home'; NPC.joan.place = 'arthur_home'; say(`\n######## ${DAYS.sat} ########`); await probes(); }
      else say(`######## ${DAYS.fri} ########`);
    }
    for (const t of S.times) {
      W.t = t; say(`\n=== ${clock(t)} ===`);
      if (!W.paid.arthur && A.arthur.place === 'office' && A.thomas.place === 'office' && ((W.day === 'fri' && t >= 17 * 60) || W.day === 'sat')) {
        W.paid.arthur = true; A.arthur.money += 840; remember('arthur', "Mr. Thomas paid him his week's wages, £3 10s.", ['thomas', 'money']); remember('thomas', "He paid the clerks' wages; Mr. Hale received £3 10s.", ['arthur']); say('   (Mr. Thomas pays the clerks\' wages: Arthur receives £3 10s.)');
      }
      for (const k of Object.keys(A)) {
        const arr = (ARRIVE[k] || {})[W.day];
        if (arr && t >= arr[0] && A[k].place === A[k].home && !A[k].done[W.day + 'arrived']) { A[k].done[W.day + 'arrived'] = true; A[k].place = arr[1]; say(`${A[k].short} arrives at ${PLACE[arr[1]]}.`); }
        if (offstage(k)) continue;
        await act(k);
        fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify({ W, STATS, agents: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { place: a.place, money: a.money, op: a.op, mem: a.mem }])) }, null, 1));
      }
    }
  }
  for (const k in A) await diary(k);
  await probes();
  say(`\nSTATS ${JSON.stringify({ ...STATS, probes: undefined })}`);
  say(`MEMORY PROBES: ${STATS.probes.filter(p => p.ok).length}/${STATS.probes.filter(p => p.ok !== null).length} correct`);
  fs.writeFileSync(path.join(OUT, 'story.txt'), STORY.join('\n'));
  fs.writeFileSync(path.join(OUT, 'trace.json'), JSON.stringify({ TRACE, STATS, W }, null, 1));
  if (browser) await browser.close();
  console.log('DONE');
})();
