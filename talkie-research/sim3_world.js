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
const money = d => { d = Math.round(d); const P = Math.floor(d / 240), s = Math.floor((d % 240) / 12), p = d % 12; return (P ? `£${P} ` : '') + (s || P ? `${s}s. ` : '') + `${p}d.`; };

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
  return [...rest, ...recent].map(x => ago(x.day) + x.text).join(' ');
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
      for (const it of MARKET) if (it.cost <= a.money) o.push({ text: `Buy ${it.text} (${money(it.cost)}); she would have ${money(a.money - it.cost)} left.`, run: () => { a.money -= it.cost; remember('ada', `She bought ${it.text} for ${money(it.cost)}.`, ['money'], 1); return `Ada bought ${it.text} for ${money(it.cost)}.`; } });
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
