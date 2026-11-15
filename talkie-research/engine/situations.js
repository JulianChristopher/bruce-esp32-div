// The situation bank: thousands of everyday situations made by the world engine itself, each judged by rolling
// a copy of the world on for a day under every course open to the person. No hand labels, no modern model.
// Usage: node situations.js [N=2000] [seed]  -> situations.jsonl  (one situation per line: context, judgement)
'use strict';
const fs = require('fs'), path = require('path');
const { World } = require('./world.js'); const DEF = require('./london1931.js');
const LIFE = require('./life1931.js'); const BIO = require('./bio1931.js');
const T0 = Date.UTC(1931, 0, 2), hm = DEF.hm;
const money = d => { d = Math.round(d); const neg = d < 0; d = Math.abs(d); const P = Math.floor(d / 240), s2 = Math.floor((d % 240) / 12), p = d % 12; return (neg ? 'minus ' : '') + (P ? `£${P} ${s2}s. ${p}d.` : `${s2}s. ${p}d.`); };
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MON = ['January', 'February', 'March', 'April'];
const ORD = n => n + ((n % 10 === 1 && n !== 11) ? 'st' : (n % 10 === 2 && n !== 12) ? 'nd' : (n % 10 === 3 && n !== 13) ? 'rd' : 'th');
const dateOf = d => new Date(T0 + d * 864e5), dow = d => dateOf(d).getUTCDay();
const clock = m => { const h = Math.floor(m / 60), mi = m % 60, H = ((h + 11) % 12) + 1; return `${mi === 0 ? '' : mi === 15 ? 'a quarter past ' : mi === 30 ? 'half past ' : mi === 45 ? 'a quarter to ' : mi + ' minutes past '}${mi === 45 ? ((H % 12) + 1) : H}${mi === 0 ? " o'clock" : ''} in the ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}`; };
const SHEET = {
  ada: 'Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor.',
  arthur: 'Mr. Arthur Hale, 34, ledger clerk at an insurance office in Moorgate, £3 10s. a week; wife Edith, daughter Joan (7). Conscientious, careful with money, timid with superiors.',
  thomas: 'Mr. Walter Thomas, 56, chief clerk of the same office; pays the wages on Fridays. Stern, exact, dutiful, fair and secretly kind. Widower in Highbury.'
};
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// state-only consequences for the engine's rollouts (same as the simulation's simHooks)
const simHooks = {
  rel() {}, nurse() {}, letter() {}, chance: () => false,
  ask(q, k, kind) {   // a rule of thumb for the engine's foresight; in the live run the person asked decides
    const w = this.w, p = w.people[k], f = w.flags;
    if (kind === 'credit') { if (p.money > -60) { f.creditBarker = 60; return 'credit'; } f.creditRefusedDay = w.day; return 'refused'; }
    if (kind === 'loan') { f.nolanAskedDay = w.day; if (q === 'nolan' && !f.owesNolan || ['bert', 'edith', 'dunn', 'arthur', 'thomas'].includes(q)) { p.money += 24; f.owesNolan = true; return 'lent'; } return 'refused'; }
    if (kind === 'work') return 'none';
    if (kind === 'goods') { if (q === 'nolan' || q === 'mrspollock' || q === 'edith' || q === 'dunn') { w.add(k, 'food', 1); return 'given'; } return 'refused'; }
    if (kind === 'wait') { if (q === 'gedge') { f.rentDue = false; f.rentOwing = true; return 'wait'; } return 'none'; }
    if (kind === 'favour') return 'yes';
    if (kind === 'relief') { if (p.money < 24 && w.count(k, 'food') <= 1) { w.add(k, 'food', 6); w.add(k, 'coal', 4); f.relief = true; return 'relief'; } return 'refused'; }
    return 'none';
  },
  remember() {}, money, debt() {}, cleanOffice: () => 'c', paperLabel: () => 'Read the paper', readPaper: () => 'r', arthurWorkLabel: () => "Get on with the day's entries in the books", arthurWork: () => 'w', thomasWorkLabel: () => 'Attend to the correspondence', thomasWork: () => 'w',
  pawn() { this.w.objects.watch.at = 'lamb'; this.w.people.ada.money += 120; return 'p'; }, redeem() { this.w.objects.watch.at = 'ada'; return 'r'; },
  housekeeping(x) { this.w.flags['hk_' + this.w.day] = x; this.w.people.arthur.money -= x * 12; return 'h'; }, doctor() { this.w.flags.doctorCalled = true; return 'd'; },
  rent(pay) { this.w.flags.rentDue = false; this.w.flags.rentOwing = !pay; return 'rent'; }, talkLabel: (k, q) => `Talk with ${q}`, bonus: () => 0 };
const makeWorld = t => { const w = new World({ ...DEF, weather: d => LIFE.weatherOf(d).words }, { T0, days: 90, startMinute: t }); w.simHooks = simHooks; w.hooks = Object.assign(Object.create(simHooks), { w });
  for (const pl of Object.values(w.places)) if (['market', 'park', 'work'].includes(pl.kind) && /market|Fields|dock gates/.test(pl.name)) pl.warmth = ww => LIFE.outdoorWarmth(ww.day);
  w.coldSnap = d => [0, 1, 2].filter(i => d - i >= 0 && LIFE.weatherOf(d - i).tmean < 1).length >= 3; return w; };

// the kinds of situation, each with the ranges it varies over
const TEMPLATES = [
  { id: 'rent-evening', who: 'ada', days: [4, 0], at: [hm(18), hm(20)], money: [10, 200], set: (w, R) => { w.flags.rentDue = true; w.flags.rentDueAt = w.t - 30; } },
  { id: 'rent-monday', who: 'ada', days: [0], at: [hm(18), hm(20)], money: [10, 200], set: w => { w.flags.rentDue = true; w.flags.rentOwing = true; w.flags.rentDueAt = w.t - 60; } },
  { id: 'cold-evening', who: 'ada', days: [0, 1, 2, 3, 4, 5, 6], at: [hm(17), hm(21)], money: [0, 120], coal: [0, 1], set: (w, R) => { w.people.ada.needs.warmth = 50 + R() * 40; } },
  { id: 'hungry-no-food', who: 'ada', days: [0, 1, 2, 3, 4, 5], at: [hm(12), hm(19)], money: [0, 100], food: [0, 0], set: (w, R) => { w.people.ada.needs.hunger = 60 + R() * 35; } },
  { id: 'morning-work', who: 'ada', days: [0, 1, 2, 3, 4, 5], at: [hm(6, 45), hm(7, 30)], money: [0, 150], set: (w, R) => { w.people.ada.needs.energy = 20 + R() * 60; } },
  { id: 'in-debt', who: 'ada', days: [0, 1, 2, 3, 4, 5], at: [hm(9), hm(18)], money: [-80, -5], set: () => {} },
  { id: 'sunday-morning', who: 'ada', days: [6], at: [hm(8), hm(10, 30)], money: [0, 150], set: () => {} },
  { id: 'watch-in-pawn', who: 'ada', days: [0, 1, 2, 3, 4, 5], at: [hm(10), hm(18)], money: [60, 260], set: w => { w.objects.watch.at = 'lamb'; } },
  { id: 'joan-ill-office', who: 'arthur', days: [0, 1, 2, 3, 4], at: [hm(9), hm(16)], money: [20, 200], set: w => { w.flags.joanIll = true; w.flags.doctorCalled = false; } },
  { id: 'joan-ill-home', who: 'arthur', days: [0, 1, 2, 3, 4, 5, 6], at: [hm(17, 30), hm(20)], money: [20, 200], set: w => { w.flags.joanIll = true; w.flags.doctorCalled = false; } },
  { id: 'payday-home', who: 'arthur', days: [4], at: [hm(17, 45), hm(21)], money: [700, 1000], set: w => { w.flags['paid_arthur_' + w.day] = true; } },
  { id: 'lunch-short', who: 'arthur', days: [0, 1, 2, 3, 4], at: [hm(12, 30), hm(13)], money: [5, 80], set: (w, R) => { w.people.arthur.needs.hunger = 50 + R() * 40; } },
  { id: 'arthur-morning', who: 'arthur', days: [0, 1, 2, 3, 4, 5], at: [hm(7), hm(8, 45)], money: [20, 200], set: () => {} },
  { id: 'thomas-evening', who: 'thomas', days: [0, 1, 2, 3, 4, 5, 6], at: [hm(18), hm(21, 30)], money: [2000, 10000], set: () => {} }
];
const dayAs = (R, dows) => { const want = dows[Math.floor(R() * dows.length)]; const cands = []; for (let d = 0; d < 88; d++) if ((dow(d) + 6) % 7 === want) cands.push(d); return cands[Math.floor(R() * cands.length)]; };   // 0 = Monday

function context(w, k) {   // the prompt context the simulation would give (shorter: no memory of a life lived)
  const p = w.people[k], d = w.day, wx = LIFE.weatherOf(d), x = dateOf(d);
  const bio = BIO[k][(d + Math.floor(w.mod / 60)) % BIO[k].length][1];
  const pres = w.presentWith(k).map(q => q.name);
  const scene = [];
  if (p.place === 'ada_home') scene.push(w.flags.fire_ada_home > w.t ? 'The fire is burning.' : `The fire is out; the room is ${w.warmthOf('ada_home') < 30 ? 'bitterly cold' : 'cold'}.`, (p.inv.food || 0) <= 0 ? 'The cupboard is bare.' : `There is food for ${p.inv.food} meal${p.inv.food > 1 ? 's' : ''}.`, (p.inv.coal || 0) <= 0 ? 'The coal-box is empty.' : '');
  if (k === 'arthur' && w.flags.joanIll) scene.push('Joan is ill in bed with a fever and a bad cough; the doctor has not been called.');
  if (k === 'ada') scene.push(w.flags.bertWork ? 'Bert is in work at the docks.' : 'Bert is out of work.');
  const feels = w.needWords(k);
  const now = [];
  if (k === 'ada' && w.flags.rentDue) now.push(`The rent of seven shillings is ${w.flags.rentOwing ? 'owing since Friday' : 'due tonight'}; Mr. Gedge the collector calls at seven.`);
  if (k === 'ada' && w.objects.watch.at === 'lamb') now.push("Her husband's watch is in pawn at Lamb's; it is redeemed for eleven shillings.");
  if (p.money < 0) now.push(`She owes Barker ${money(-p.money)} on the slate.`);
  if (k === 'arthur' && w.flags['paid_arthur_' + d] && !w.flags['hk_' + d]) now.push("He has his week's wages; Edith has not yet had the housekeeping.");
  const near = Object.keys(w.places).filter(id => id !== p.place && w.travel(p.place, id) <= 10 && w.isOpen(id) && !/home/.test(w.places[id].kind)).map(id => w.places[id].name).slice(0, 4);
  return [`${clock(w.mod)[0].toUpperCase() + clock(w.mod).slice(1)}, ${WD[x.getUTCDay()]}, the ${ORD(x.getUTCDate())} of ${MON[x.getUTCMonth()]}, 1931; ${wx.text}.`,
    `CHARACTER: ${SHEET[k]} ${bio}`, scene.filter(Boolean).length ? `SCENE: ${scene.filter(Boolean).join(' ')}` : '',
    `PLACE: ${w.places[p.place].name}. PRESENT: ${pres.length ? pres.join('; ') : 'nobody else'}. PURSE: ${money(p.money)}.`,
    feels ? `FEELS: ${feels}.` : '', now.length ? `NOW: ${now.join(' ')}` : '', `AT HAND: ${near.length ? 'open near by: ' + near.join('; ') : 'nothing open near by'}.`].filter(Boolean).join('\n');
}
// the same facts as a page of a novel of 1931 (see prose1931.js)
const PROSE = require('./prose1931.js');
function proseContext(w, k) {
  const p = w.people[k], d = w.day, wx = LIFE.weatherOf(d), x = dateOf(d);
  const bio = BIO[k][(d + Math.floor(w.mod / 60)) % BIO[k].length][1];
  const he = p.f ? 'she' : 'he', He = p.f ? 'She' : 'He', his = p.f ? 'her' : 'his';
  const scene = [];
  if (p.place === 'ada_home') {
    scene.push(w.flags.fire_ada_home > w.t ? 'A fire was burning in the grate' : `The fire was out, and the room was ${w.warmthOf('ada_home') < 30 ? 'bitterly cold' : 'cold'}`);
    const food = p.inv.food || 0, coal = p.inv.coal || 0;
    scene.push(food <= 0 ? 'There was nothing in the cupboard' : food === 1 ? 'There was food in the cupboard for one meal' : `There was food in the cupboard for ${PROSE.num(food)} meals`);
    scene.push(coal <= 0 ? 'The coal-box was empty' : coal === 1 ? 'There was coal for one fire' : `There was coal for ${PROSE.num(coal)} fires`);
  }
  const pressing = [];
  if (k === 'arthur' && w.flags.joanIll) pressing.push((p.place === p.home ? 'Upstairs' : 'At home') + ' Joan lay ill in bed with a fever and a bad cough, and the doctor had not been called');
  if (k === 'ada') scene.push(w.flags.bertWork ? 'Bert had work at the docks' : 'Bert was out of work');
  const feels = (w.needWords(k) || '').split('; ').filter(Boolean).map(s => PROSE.past(s));
  const now = [];
  if (k === 'ada' && w.flags.rentDue) now.push(w.flags.rentOwing ? 'The rent of seven shillings had been owing since Friday' : "The rent of seven shillings was due that night, and Mr. Gedge the collector would call at seven o'clock");
  if (k === 'ada' && w.objects.watch.at === 'lamb') now.push("Her husband's watch was in pawn at Lamb's, to be redeemed for eleven shillings");
  if (p.money < 0) now.push(`${He} owed Barker ${PROSE.moneyWords(-p.money)} on the slate`);
  if (k === 'arthur' && w.flags['paid_arthur_' + d] && !w.flags['hk_' + d]) now.push("He had his week's wages in his pocket, and Edith had not yet had the housekeeping");
  const near = Object.keys(w.places).filter(id => id !== p.place && w.travel(p.place, id) <= 10 && w.isOpen(id) && !/home/.test(w.places[id].kind)).map(id => w.places[id].name.replace(/ (in|of) (Bermondsey|Islington|Moorgate|Highbury|the City)$/, '')).slice(0, 4);
  const SHORTN = { bert: 'Bert', joan: 'Joan', edith: k === 'arthur' ? 'Edith' : 'Mrs. Hale', ada: 'Mrs. Turner', arthur: 'Mr. Hale', thomas: 'Mr. Thomas' };
  const placeName = p.place === p.home ? (k === 'ada' ? 'her two rooms in Bermondsey' : k === 'arthur' ? 'his house in Islington' : 'his house in Highbury') : w.places[p.place].name;
  return PROSE.page(k, { mod: w.mod, date: x, wx: wx.text, place: placeName, present: w.presentWith(k).map(q => SHORTN[q.id] || q.name), purse: Math.max(0, p.money), bio, scene, feels, now, near, pressing });
}
function make(N, seed) {
  const R = rng(seed), out = [];
  for (let i = 0; i < N; i++) {
    const T = TEMPLATES[i % TEMPLATES.length];
    const d = dayAs(R, T.days), m = T.at[0] + Math.floor(R() * ((T.at[1] - T.at[0]) / 15 + 1)) * 15;
    const w = makeWorld(d * 1440 + m);
    w.flags.bertWork = R() < 0.6; const k = T.who, p = w.people[k];
    p.money = Math.round(T.money[0] + R() * (T.money[1] - T.money[0]));
    if (k === 'ada') p.inv = { food: T.food ? T.food[0] : Math.floor(R() * 4), coal: T.coal ? T.coal[Math.floor(R() * T.coal.length)] : Math.floor(R() * 4) };
    p.needs = { hunger: 20 + R() * 60, energy: 10 + R() * 60, warmth: 10 + R() * 50, social: 20 + R() * 60 };
    for (const q of Object.values(w.people)) if (q.main && q.id !== k) q.busyUntil = w.t + 24 * 60;   // the others go about their day
    T.set(w, R);
    w.stepBackground(); if (!T.keepPlace) p.place = T.id === 'joan-ill-office' || T.id === 'lunch-short' ? (T.id === 'lunch-short' ? 'teashop' : 'office') : p.home;
    w.stepBackground();
    let j; try { j = w.judge(k, 24); } catch (e) { continue; }
    if (!j.all.length) continue;
    out.push({ id: `${T.id}-${i}`, template: T.id, who: k, day: d, t: m, params: { money: p.money, food: p.inv.food, coal: p.inv.coal, needs: Object.fromEntries(Object.entries(p.needs).map(([a, b]) => [a, Math.round(b)])), bertWork: w.flags.bertWork },
      urgent: j.urgent.map(u => [u.key, Math.round(u.w)]), context: context(w, k), prose: proseContext(w, k), options: j.all.map(r => ({ label: r.label, score: +r.after.toFixed(1) })), best: j.best.label, spread: +(j.best.after - j.worst.after).toFixed(1), snapshot: w.snapshot() });
  }
  return out;
}
module.exports = { proseContext, make, makeWorld, simHooks, TEMPLATES, context };
if (require.main === module) {
  const N = +(process.argv[2] || 2000), seed = +(process.argv[3] || 1931), t0 = Date.now();
  const S = make(N, seed);
  fs.writeFileSync(path.join(__dirname, 'situations.jsonl'), S.map(x => JSON.stringify(x)).join('\n') + '\n');
  const by = {}; for (const x of S) by[x.template] = (by[x.template] || 0) + 1;
  console.log(`${S.length} situations in ${((Date.now() - t0) / 1000).toFixed(0)} s;`, JSON.stringify(by));
  console.log('decisive (spread > 10):', S.filter(x => x.spread > 10).length);
  console.log(S[0].context, '\n', S[0].options.slice(0, 4));
}
