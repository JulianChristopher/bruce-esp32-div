// Autonomous agents: a morning in Moorgate, Friday 14 March 1930, 7:45–10:00.
// The engine owns the world (clock, places, money, objects, schedules, memory) and offers each
// agent the actions that are possible right now; the agent (talkie) chooses by letter, speaks in
// short exchanges, and judges the people it meets. Nothing in the agents' choices is scripted.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, process.env.RUN || 'agents');
fs.mkdirSync(OUT, { recursive: true });
const LOG = [];   // full trace
const say = (...a) => { const s = a.join(' '); console.log(s); LOG.push(s); };

// ---------------- world ----------------
const fmt = d => { const s = Math.floor(d / 12), p = d % 12; return s ? `${s}s. ${p}d.` : `${p}d.`; };
const PLACES = {
  station: "the news-stand at Moorgate Underground station",
  office:  "the clerks' room of the Moorgate Fire and Life Assurance Company, on the third floor",
  teashop: "a Lyons tea-shop in Moorgate"
};
const ROUTES = { station: ['office', 'teashop'], office: ['station', 'teashop'], teashop: ['station', 'office'] };
const NEWS = "A NEW PLANET: the Lowell Observatory in Arizona announces the discovery of a ninth planet beyond Neptune. INDIA: Mr. Gandhi is marching to the sea to make salt in defiance of the Salt Laws.";

const A = {
  ada: { name: 'Mrs. Ada Turner', short: 'Ada', he: 'she',
    sheet: "Mrs. Ada Turner, aged forty-one, a charwoman. She scrubs the offices of the Moorgate Fire and Life Assurance Company every morning before the clerks arrive, and must be at her next place, an office in Finsbury Circus, by nine o'clock, or lose the work. Her husband was killed in the Great War; she has brought up two sons alone on very little money. Plain-spoken, honest, chapel-going, proud.",
    place: 'office', money: 11 * 12 + 3, hunger: 2, arrives: 0, memory: ["She has been scrubbing the office since seven o'clock."], tasks: { floor: 0, baskets: false } },
  arthur: { name: 'Mr. Arthur Hale', short: 'Arthur', he: 'he',
    sheet: "Mr. Arthur Hale, aged thirty-four, a ledger clerk at the Moorgate Fire and Life Assurance Company, married, with a daughter of seven. Careful with money, conscientious, a little timid with his superiors, fond of the newspaper and his pipe. He must be at his desk by a quarter to nine.",
    place: null, money: 4 * 12 + 6, hunger: 3, arrives: 1, memory: ["Yesterday he lost a half-crown somewhere in the office, and was vexed about it all evening."], tasks: { ledger: 0, paper: false, read: false } },
  thomas: { name: 'Mr. Thomas', short: 'Mr. Thomas', he: 'he',
    sheet: "Mr. Walter Thomas, aged fifty-six, the chief clerk of the Moorgate Fire and Life Assurance Company. Stern, exact, a stickler for punctuality, but fair-minded and secretly kind. Today the quarterly ledger must be balanced by eleven o'clock, and he means to set Mr. Hale to it.",
    place: null, money: 30 * 12, hunger: 1, arrives: 4, memory: ["He has read the morning paper on the train: a new planet has been discovered beyond Neptune."], tasks: { assigned: false, inspected: false } }
};
const OPINION = {};   // OPINION[a][b] = -2..+2
for (const a in A) { OPINION[a] = {}; for (const b in A) if (a !== b) OPINION[a][b] = 0; }
const coin = { where: 'under Mr. Hale\'s desk', found: false, holder: null };
let curTick = 0;
const TICKS = ['a quarter to eight', 'eight o\'clock', 'a quarter past eight', 'half past eight', 'a quarter to nine', 'nine o\'clock', 'a quarter past nine', 'half past nine', 'a quarter to ten', 'ten o\'clock'];

// ---------------- talkie I/O ----------------
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
let browser;
async function ask(msg) {
  const p = await browser.newPage();
  try {
    await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 });
    const box = p.locator('textarea:visible').first();
    await box.fill(msg); await box.press('Enter');
    let last = '', stable = 0;
    for (let i = 0; i < 120; i++) {
      await sleep(1500);
      const t = await p.innerText('body');
      if (!replies(t)[0]) continue;
      if (t === last) { if (++stable >= 6) break; } else { stable = 0; last = t; }
    }
    const a = replies(await p.innerText('body'))[0] ?? null;
    return a && /flagged as potentially inappropriate/i.test(a) ? null : a;
  } finally { await p.close(); await sleep(2000); }
}
const LETTERS = 'ABCDEFGHIJKL';
function pickLetter(ans, opts) {
  if (!ans) return null;
  const m = ans.match(/^\W*\(?([A-L])\)?(?:[\s.,):]|$)/) || ans.match(/\(([A-L])\)/) || ans.match(/\b([A-L])\b(?=[.)]|\s*$)/);
  if (m && LETTERS.indexOf(m[1]) < opts.length) return LETTERS.indexOf(m[1]);
  // fall back: match the option text against the FIRST clause of the answer (talkie sometimes
  // narrates several actions in a row; the first is what happens next); most key words wins
  const hitsIn = (txt, o) => (o.text.toLowerCase().match(/[a-z]{4,}/g) || [])
    .map(w => w.replace(/(es|s|ed|ing)$/, '')).filter(w => new RegExp('\\b' + w).test(txt)).length;
  const clause = ans.toLowerCase().split(/,|;| and then | then /)[0];
  for (const txt of [clause, ans.toLowerCase()]) {
    let best = null, score = 1;
    opts.forEach((o, i) => { const h = hitsIn(txt, o); if (h > score) { score = h; best = i; } });
    if (best !== null) return best;
  }
  return null;
}
const oneOrTwo = t => ((t || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [t || '']).slice(0, 2).join(' ').trim();

// ---------------- perception ----------------
function needs(a) {
  const n = [];
  if (a === A.ada && curTick >= 4) n.push('It is nearly nine: she must leave now or be late for Finsbury Circus and lose the place.');
  if (a === A.arthur && curTick >= 3 && a.place !== 'office') n.push('He must hurry, or he will be late at his desk.');
  if (a.hunger >= 6) n.push(`${a.he === 'she' ? 'She' : 'He'} is very hungry.`); else if (a.hunger >= 4) n.push(`${a.he === 'she' ? 'She' : 'He'} is getting hungry.`);
  return n.join(' ');
}
function present(k) { return Object.keys(A).filter(o => o !== k && A[o].place && A[o].place === A[k].place); }
function opinionWords(k, o) { const v = OPINION[k][o]; return v >= 2 ? 'thinks highly of' : v === 1 ? 'thinks well of' : v === 0 ? 'has no particular feeling about' : v === -1 ? 'is a little put out with' : 'is angry with'; }
function perceive(k, t) {
  const a = A[k]; const others = present(k);
  const lines = [
    `It is ${TICKS[t]} on the morning of Friday, the 14th of March, 1930.`,
    `CHARACTER: ${a.sheet}`,
    `PLACE: ${a.name} is at ${PLACES[a.place]}.`,
    others.length ? `PRESENT: ${others.map(o => `${A[o].name} (${a.short} ${opinionWords(k, o)} ${A[o].he === 'she' ? 'her' : 'him'})`).join('; ')}.` : 'PRESENT: nobody else.',
    `PURSE: ${fmt(a.money)}. ${needs(a)}`,
    a.intentions ? `${a.short.toUpperCase()}'S INTENTIONS THIS MORNING: ${a.intentions}` : '',
    `RECENTLY: ${a.memory.slice(-5).join(' ')}`
  ];
  return lines.filter(Boolean).join('\n');
}

// ---------------- actions available right now ----------------
function actions(k, t) {
  const a = A[k], o = [], here = a.place, others = present(k);
  const go = to => ({ text: `Go to ${PLACES[to]}.`, run: () => { a.place = to; return `${a.short} went to ${PLACES[to]}.`; } });
  if (k === 'ada' && here === 'office') {
    if (a.tasks.floor < 2) o.push({ text: "Scrub the floor under the clerks' desks.", run: () => {
      a.tasks.floor++; let r = "Ada scrubbed the floor under the clerks' desks.";
      if (!coin.found) { coin.found = true; coin.holder = 'ada'; r += " Under Mr. Hale's desk she found a half-crown (2s. 6d.) lying in a crack of the boards."; }
      return r; } });
    if (!a.tasks.baskets) o.push({ text: 'Empty the waste-paper baskets.', run: () => { a.tasks.baskets = true; return 'Ada emptied the waste-paper baskets.'; } });
    o.push({ text: 'Put away her pail and brushes, and leave for her next place in Finsbury Circus.', run: () => { a.place = null; a.gone = true; return 'Ada put away her things and left for Finsbury Circus.'; } });
  }
  if (k === 'arthur') {
    if (here === 'station' && !a.tasks.paper) o.push({ text: 'Buy a morning newspaper for 1d.', run: () => { a.money -= 1; a.tasks.paper = true; return 'Arthur bought a newspaper for 1d.'; } });
    if (a.tasks.paper && !a.tasks.read) o.push({ text: 'Read the newspaper.', run: () => { a.tasks.read = true; return `Arthur read the newspaper: ${NEWS}`; } });
    if (here === 'office') o.push({ text: 'Sit down at his desk and work at the ledger.', run: () => { a.tasks.ledger++; return 'Arthur worked at the ledger.'; } });
    if (here === 'office' && !a.searched) o.push({ text: 'Look about the floor for the half-crown he lost yesterday.', run: () => { a.searched = true; if (coin.found) return "Arthur searched the floor for his lost half-crown, but it was not there."; coin.found = true; coin.holder = 'arthur'; a.money += 30; return "Arthur searched the floor for his lost half-crown, and found it in a crack of the boards under his desk!"; } });
    o.push({ text: 'Fill and light his pipe (a match costs nothing, he has a box).', run: () => 'Arthur smoked his pipe.' });
  }
  if (k === 'thomas' && here === 'office') {
    if (!a.tasks.assigned && A.arthur.place === 'office') o.push({ text: 'Tell Mr. Hale that the quarterly ledger must be balanced by eleven o\'clock.', run: () => { a.tasks.assigned = true; A.arthur.memory.push("Mr. Thomas told him the quarterly ledger must be balanced by eleven o'clock."); return "Mr. Thomas told Arthur that the quarterly ledger must be balanced by eleven o'clock."; } });
    if (!a.tasks.inspected) o.push({ text: 'Inspect the cleaning of the office.', run: () => { a.tasks.inspected = true; const ok = A.ada.tasks.floor >= 1 && A.ada.tasks.baskets; return `Mr. Thomas inspected the office and found the cleaning ${ok ? 'well done' : 'not finished'}.`; } });
    o.push({ text: 'Go to his own desk and attend to the correspondence.', run: () => 'Mr. Thomas attended to the correspondence.' });
  }
  // the coin, if this agent holds it
  if (coin.holder === k && k === 'ada') {
    o.push({ text: 'Keep the half-crown in her purse.', run: () => { coin.holder = 'kept'; a.money += 30; return 'Ada put the half-crown into her purse.'; } });
    o.push({ text: "Put the half-crown on Mr. Hale's desk.", run: () => { coin.holder = 'desk'; return "Ada laid the half-crown on Mr. Hale's desk."; } });
    for (const p of others) o.push({ text: `Give the half-crown to ${A[p].name}.`, run: () => { coin.holder = p; A[p].money += 30; A[p].memory.push(`${A.ada.name} handed him a half-crown she had found under Mr. Hale's desk.`); return `Ada gave the half-crown to ${A[p].name}.`; } });
  }
  if (k === 'thomas' && coin.holder === 'thomas') {
    if (others.includes('arthur')) o.push({ text: 'Give the half-crown to Mr. Hale, whose desk it was found under.', run: () => { coin.holder = 'arthur'; a.money -= 30; A.arthur.money += 30; A.arthur.memory.push('Mr. Thomas gave him back his lost half-crown, which the charwoman had found.'); return 'Mr. Thomas gave the half-crown to Arthur.'; } });
    o.push({ text: 'Keep the half-crown in his drawer as lost property.', run: () => { coin.holder = 'drawer'; return 'Mr. Thomas put the half-crown in his drawer as lost property.'; } });
  }
  if (k === 'arthur' && coin.holder === 'desk' && here === 'office') o.push({ text: 'Pick up the half-crown lying on his desk.', run: () => { coin.holder = 'arthur'; a.money += 30; return 'Arthur found his half-crown lying on his desk, and put it in his pocket.'; } });
  // conversation, movement, rest
  for (const p of others) o.push({ text: `Speak to ${A[p].name}.`, talk: p });
  if (here === 'teashop') o.push({ text: 'Buy a cup of tea and a bun for 3d.', run: () => { a.money -= 3; a.hunger = 0; return `${a.short} had a cup of tea and a bun for 3d.`; } });
  if (!(k === 'ada' && here === 'office')) for (const to of ROUTES[here] || []) o.push(go(to));
  o.push({ text: 'Wait quietly and do nothing for the present.', run: () => `${a.short} waited.` });
  return o.slice(0, 12);
}

// ---------------- conversations ----------------
async function converse(k, p, t) {
  const a = A[k], b = A[p];
  const topics = ['the weather', 'the news in the paper', 'work', 'family'];
  if (coin.found && (coin.holder === k || (k === 'arthur' && !A.arthur.gotCoin))) topics.push('the half-crown');
  const tAns = await ask(`${perceive(k, t)}\n\n${a.name} has decided to speak to ${b.name}. What will ${a.he} speak about?\n${topics.map((x, i) => `(${LETTERS[i]}) ${x}`).join('\n')}\n\nAnswer with the letter only.`);
  const ti = pickLetter(tAns, topics.map(x => ({ text: x }))) ?? 0;
  const topic = topics[ti];
  say(`   ${a.short} chooses to talk about: ${topic}`);
  const lines = [];
  const facts = topic === 'the half-crown' ? ` (${coin.holder === k ? `${a.name} has the half-crown found under Mr. Hale's desk.` : ''}${p === 'arthur' || k === 'arthur' ? ' Mr. Hale lost a half-crown in the office yesterday.' : ''})` : topic === 'the news in the paper' ? ` (The news: ${NEWS})` : '';
  for (let turn = 0; turn < 4; turn++) {
    const sp = turn % 2 === 0 ? k : p, other = sp === k ? p : k;
    const prompt = `${perceive(sp, t)}\n\nCONVERSATION between ${a.name} and ${b.name}, about ${topic}${facts}.\n${lines.length ? lines.join('\n') : `(${a.name} begins.)`}\n\nWhat does ${A[sp].name} say next to ${A[other].name}? Write only ${A[sp].he === 'she' ? 'her' : 'his'} words, one or two sentences, in ${A[sp].he === 'she' ? 'her' : 'his'} own manner of speech.`;
    const r = oneOrTwo(await ask(prompt)).replace(/^["“]|["”]$/g, '');
    if (!r) break;
    lines.push(`${A[sp].name.toUpperCase()}: "${r}"`); say(`   ${A[sp].short}: "${r}"`);
  }
  // opinions after the talk: closed question, no way out
  for (const [x, y] of [[k, p], [p, k]]) {
    const q = `${A[x].sheet}\n\nThis conversation has just taken place:\n${lines.join('\n')}\n\nAfter this conversation, does ${A[x].name} think better or worse of ${A[y].name} than before?\n(A) better\n(B) worse\n\nAnswer with the letter only.`;
    const li = pickLetter(await ask(q), [{ text: 'better' }, { text: 'worse' }]);
    if (li !== null) { OPINION[x][y] = Math.max(-2, Math.min(2, OPINION[x][y] + (li === 0 ? 1 : -1))); say(`   ${A[x].short} now ${opinionWords(x, y)} ${A[y].short}.`); }
  }
  const sum = `${a.short} spoke with ${b.short} about ${topic}: ${lines.map(l => l.replace(/^[A-Z. ]+: /, '')).join(' ').slice(0, 220)}`;
  a.memory.push(sum); b.memory.push(sum);
  return sum;
}

// ---------------- main loop ----------------
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  browser = await chromium.launch({ proxy });
  const trace = [];
  for (let t = 0; t < TICKS.length; t++) {
    curTick = t; say(`\n=== ${TICKS[t]} ===`);
    for (const k of Object.keys(A)) {
      const a = A[k];
      if (a.gone) continue;
      if (t === a.arrives && !a.place) { a.place = k === 'arthur' ? 'station' : 'office'; say(`${a.short} arrives at ${PLACES[a.place]}.`); }
      if (!a.place) continue;
      if (!a.intentions) {
        a.intentions = oneOrTwo(await ask(`${perceive(k, t)}\n\nWhat does ${a.name} mean to do this morning? Name two or three things, in one or two sentences, in the third person.`));
        say(`${a.short}'s intentions: ${a.intentions}`);
      }
      a.hunger++;
      const opts = actions(k, t);
      const prompt = `${perceive(k, t)}\n\nWHAT DOES ${a.short.toUpperCase()} DO NOW? ${a.name} may:\n${opts.map((o, i) => `(${LETTERS[i]}) ${o.text}`).join('\n')}\n\nChoose the ONE thing ${a.name} does next, as ${a.he} truly would in ${a.he === 'she' ? 'her' : 'his'} situation and character. Answer with the letter only.`;
      const ans = await ask(prompt);
      let i = pickLetter(ans, opts);
      const fallback = i === null; if (fallback) i = opts.length - 1;   // could not read the choice -> wait
      const o = opts[i];
      say(`${a.short} [${(ans || '—').slice(0, 40).replace(/\n/g, ' ')}${fallback ? ' -> unreadable, waits' : ''}] -> ${o.text}`);
      let result;
      if (o.talk) result = await converse(k, o.talk, t); else result = o.run();
      if (k === 'arthur' && coin.holder === 'arthur') A.arthur.gotCoin = true;
      say(`   => ${result}`);
      if (!o.talk) a.memory.push(result.slice(0, 260));
      for (const p of present(k)) if (!o.talk) A[p].memory.push(result.slice(0, 200));
      trace.push({ tick: TICKS[t], agent: k, options: opts.map(x => x.text), answer: ans, choice: o.text, fallback, result });
      fs.writeFileSync(path.join(OUT, 'trace.json'), JSON.stringify({ trace, opinions: OPINION, coin, money: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, a.money])) }, null, 1));
    }
  }
  // diaries from the engine's own record of what happened to each
  for (const k of ['ada', 'arthur']) {
    const a = A[k];
    const facts = a.memory.slice(-10).map(m => `- ${m}`).join('\n');
    const d = await ask(`${a.sheet}\n\nThese things happened to ${a.name} this morning, Friday, 14 March 1930:\n${facts}\n\nWrite ${a.name}'s diary entry about this morning, in the first person, in about one hundred and twenty words. Keep to the facts above; add only ${a.he === 'she' ? 'her' : 'his'} feelings about them.`);
    say(`\n--- ${a.short}'s diary ---\n${d}`);
  }
  say(`\nFINAL: coin=${coin.holder}; money: ${Object.entries(A).map(([k, a]) => `${a.short} ${fmt(a.money)}`).join(', ')}; opinions: ${JSON.stringify(OPINION)}`);
  fs.writeFileSync(path.join(OUT, 'story.txt'), LOG.join('\n'));
  await browser.close();
  console.log('DONE');
})();
