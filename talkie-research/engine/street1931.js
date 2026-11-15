// The Buildings: the block of tenements in Bermondsey where Ada lives, as some thirty households drawn from the
// distributions of the time (no script, no language model). Level of detail: the three main characters think with
// talkie; the neighbours live by rule here, and talkie speaks for one of them only when a main character meets them.
//
// Figures (rounded) after the New Survey of London Life and Labour (1929-31), the Ministry of Labour Gazette and the
// Unemployment Insurance rates of 1931: casual dock labour about 11s. a day when taken on, three days a week in a
// fair week and less in frost; a carman 55s. a week; a tannery hand 50s.; a girl at the biscuit or jam factory 25-28s.;
// a charwoman 12-15s.; sack-making at home 8s.; the dole 17s. a man, 9s. a wife, 2s. a child; the old-age pension 10s.;
// rent for one room about 5s., two rooms 7-8s., three rooms 10-11s.; food about 4s. a week for a grown person and half
// that for a child; a hundredweight of coal 1s. 2d. in winter. The weekly pledge (Monday in, Saturday out) and the
// grocer's slate carried most families from one pay-day to the next.
'use strict';
const HEALTH = require('./health1931.js');
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SURN = ['Doyle', 'Murphy', 'Collins', 'Hayes', 'Driscoll', 'Mahoney', 'Smith', 'Clark', 'Ward', 'Bennett', 'Price', 'Dawson', 'Lane', 'Gibbs', 'Mason', 'Rolfe', 'Peck', 'Atkins', 'Burrows', 'Hollis',
  'Fenton', 'Cripps', 'Saunders', 'Wicks', 'Tull', 'Penfold', 'Gurney', 'Booth', 'Knight', 'Shaw', 'Riley', 'Moss', 'Cotter', 'Dunne'];
const MEN = ['Alf', 'Bill', 'Charlie', 'Fred', 'George', 'Harry', 'Jack', 'Jim', 'Joe', 'Ted', 'Tom', 'Walter', 'Sid', 'Ernie', 'Patrick', 'Michael', 'Dan', 'Albert'];
const WOMEN = ['Annie', 'Lil', 'Florrie', 'Nellie', 'Rose', 'Kate', 'Maggie', 'Edie', 'Ivy', 'Gladys', 'Ethel', 'Mary', 'Bridget', 'Elsie', 'Dot', 'Win', 'Hilda', 'Lizzie'];
const KIDS = ['Ronnie', 'Doris', 'Stan', 'Vi', 'Len', 'Joan', 'Ken', 'Peggy', 'Reg', 'Betty', 'Arthur', 'Dolly', 'Eddie', 'Queenie', 'Sonny', 'Molly'];
// jobs: pay in pence (per day for casual work, per week otherwise), chance of work on a given day, frost hurts?
const JOBS = {
  docker: { name: 'a docker', day: 132, p: 0.55, frost: 0.25, casual: true },
  carman: { name: 'a carman', week: 660, p: 0.97 },
  tanner: { name: 'a hand at the tannery', week: 600, p: 0.93 },
  labourer: { name: 'a builder\'s labourer', day: 100, p: 0.75, frost: 0.6, casual: true },
  coster: { name: 'a costermonger', day: 60, p: 0.85, frost: 0.3, casual: true },
  factorygirl: { name: 'at the biscuit factory', week: 324, p: 0.95, f: true },
  jamgirl: { name: 'at the jam factory', week: 300, p: 0.9, f: true },
  char: { name: 'a charwoman', week: 168, p: 0.95, f: true },
  sacks: { name: 'sack-making at home', week: 96, p: 1, f: true, home: true },
  pension: { name: 'on the old-age pension', week: 120, p: 1, pension: true }
};
const TRAITS = ['generous', 'close', 'proud', 'a drinker', 'a great talker', 'chapel', 'Catholic', 'quarrelsome', 'steady', 'hard-pressed'];
const money = d => { d = Math.round(d); const s = Math.floor(Math.abs(d) / 12), p = Math.abs(d) % 12; return `${d < 0 ? 'minus ' : ''}${s}s. ${p}d.`; };

function makeStreet(seed = 31) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
  const used = new Set(), hh = [];
  for (let i = 0; i < 30; i++) {
    let sur; do { sur = pick(SURN); } while (used.has(sur)); used.add(sur);
    const type = R(), members = [];
    const man = { first: pick(MEN), age: 25 + Math.floor(R() * 35), m: true }, wife = { first: pick(WOMEN), age: 22 + Math.floor(R() * 33), m: false };
    if (type < 0.12) {   // an old couple or a widow on the pension
      const w = { first: pick(WOMEN), age: 68 + Math.floor(R() * 14), m: false, job: 'pension' }; members.push(w);
      if (R() < 0.5) members.push({ first: pick(MEN), age: 70 + Math.floor(R() * 10), m: true, job: 'pension' });
    } else if (type < 0.22) {   // a widow with children
      wife.age = 30 + Math.floor(R() * 20); wife.job = R() < 0.6 ? 'char' : 'sacks'; members.push(wife);
    } else { man.job = pick(['docker', 'docker', 'docker', 'carman', 'tanner', 'labourer', 'labourer', 'coster']); members.push(man, wife); if (R() < 0.25) wife.job = pick(['char', 'sacks', 'jamgirl']); }
    const nk = type < 0.12 ? 0 : Math.floor(R() * 5);
    for (let c = 0; c < nk; c++) { const age = Math.floor(R() * 17); const kid = { first: pick(KIDS), age, m: R() < 0.5 }; if (age >= 14) kid.job = kid.m ? pick(['docker', 'labourer', 'coster']) : pick(['factorygirl', 'jamgirl']); members.push(kid); }
    const rooms = members.length <= 2 ? 1 : members.length <= 4 ? 2 : 3;
    const head = members[0];
    hh.push({ id: 'h' + (i + 1), no: i + 1, sur, members, rooms, rent: [0, 60, 90, 126][rooms], cash: Math.round(R() * 60), slate: 0, arrears: 0, pledged: [], stock: ['the Sunday suit', 'the wedding ring', 'a pair of sheets', 'the clock', 'a blanket', 'the boots'].filter(() => R() < 0.7),
      trait: pick(TRAITS), trait2: pick(TRAITS), weekly: R() < 0.3, owesAda: 0, ill: {}, notice: false, out: false, landing: Math.floor(i / 6),
      title: head.m ? `Mr. ${head.first} ${sur}` : `Mrs. ${head.first} ${sur}`, wifeTitle: `Mrs. ${(head.m ? members[1] : head).first} ${sur}`, unemployed: {} });
  }
  const S = { hh, day: -1, slateTotal: 0, events: [], log: [], R, standing: {} };
  const people = h => h.members.filter(x => !h.out);
  const nameOf = (h, x) => (x.m ? (x.age < 18 ? `young ${x.first} ${h.sur}` : `${x.first} ${h.sur}`) : (x.age < 18 ? `${x.first} ${h.sur}` : `Mrs. ${x.first} ${h.sur}`));
  // one day of the Buildings; ctx: { dow: 'mon'..'sun', tmin (°C), frost, cold, wages (true on Friday/Saturday), barkerLimit (pence) }
  S.step = function (d, ctx) {
    S.day = d; const ev = [];
    const say = (h, text, kind, extra = {}) => ev.push({ hh: h.id, no: h.no, text, kind, ...extra });
    for (const h of hh) {
      if (h.out) continue;
      // earnings
      for (const x of people(h)) {
        if (!x.job || h.ill[x.first]) continue; const J = JOBS[x.job];
        if (J.casual) { if (ctx.dow === 'sun' || x.unemployedUntil > d) continue; const fogStop = ctx.fog === 'thick' && x.job === 'docker'; if (R() < (fogStop ? 0.1 : ctx.frost && J.frost ? J.frost : J.p)) h.cash += J.day; }
        else if (ctx.dow === (J.pension ? 'fri' : 'sat')) { if (x.unemployedUntil > d) h.cash += x.age >= 18 ? (x.m ? 204 : 108) : 0; else h.cash += J.week; }
      }
      // the dole for the man out of steady work (signing at the Exchange; paid Fridays)
      if (ctx.dow === 'fri') for (const x of people(h)) if (x.unemployedUntil > d && x.m && x.age >= 18) h.cash += 24 * (people(h).filter(y => y.age < 14).length) + (people(h).some(y => !y.m && y.age >= 18) ? 108 : 0);
      // spending: food and, in winter, coal
      const need = people(h).reduce((s, x) => s + (x.age >= 14 ? 7 : 4), 0) + (ctx.cold ? 2 * h.rooms : h.rooms);
      if (h.cash >= need) h.cash -= need;
      else {
        let short = need - h.cash; h.cash = 0;
        // Monday morning at Lamb's (or any day, at a pinch): the pledge
        if ((ctx.dow === 'mon' || short > 30) && h.stock.length) { const it = h.stock.shift(); const v = 36 + Math.floor(R() * 36); h.pledged.push({ it, v, day: d }); h.cash += v; say(h, `${h.wifeTitle} of No. ${h.no} took ${it} to Lamb's`, 'pawn', { place: 'pawnshop' }); const c = Math.min(short, h.cash); h.cash -= c; short -= c; }
        // then the slate at Barker's, while Barker allows
        if (short > 0 && h.slate + short <= (ctx.barkerLimit || 120) && h.trait !== 'proud') { h.slate += short; S.slateTotal += short; short = 0; }
        // then they go short; hunger brings illness nearer
        if (short > 0) { h.hungry = (h.hungry || 0) + 1; if (h.hungry === 2) say(h, `the ${h.sur}s at No. ${h.no} have had no proper meal for two days`, 'hunger', { need: short }); }
        else h.hungry = 0;
      }
      // the weekly pledge: some families put the Sunday suit in every Monday and take it out on Saturday, short or not
      if (ctx.dow === 'mon' && h.weekly && h.stock.includes('the Sunday suit')) { h.stock = h.stock.filter(x => x !== 'the Sunday suit'); h.pledged.push({ it: 'the Sunday suit', v: 48, day: d }); h.cash += 48; if (R() < 0.3) say(h, `${h.wifeTitle} of No. ${h.no} took the Sunday suit to Lamb's, as she does every Monday`, 'pawn', { place: 'pawnshop' }); }
      // rent day (Monday in the Buildings): the collector
      if (ctx.dow === 'mon') {
        if (h.cash >= h.rent) { h.cash -= h.rent; h.arrears = 0; h.notice = false; }
        else { h.arrears++; if (h.arrears === 2) say(h, `the ${h.sur}s at No. ${h.no} are two weeks behind with the rent`, 'arrears'); if (h.arrears === 4 && !h.notice) { h.notice = true; say(h, `Mr. Gedge has served notice to quit on the ${h.sur}s at No. ${h.no}`, 'notice'); } if (h.arrears >= 6) { h.out = true; say(h, `the bailiffs put the ${h.sur}s of No. ${h.no} into the street, with their bits of furniture`, 'eviction'); } }
      }
      // Saturday: pay off a bit of the slate, then the pledges out
      if (ctx.dow === 'sat' && h.cash > 0) {
        const pay = Math.min(h.slate, Math.floor(h.cash / 2)); h.slate -= pay; S.slateTotal -= pay; h.cash -= pay;
        while (h.pledged.length && h.cash >= Math.round(h.pledged[0].v * 1.1)) { const p = h.pledged.shift(); h.cash -= Math.round(p.v * 1.1); h.stock.push(p.it); }
      }
      // pledges unredeemed for a year and a week are forfeit; here: a long run of bad weeks
      // illness: winter, cold rooms, hunger, and catching it from the family
      for (const x of people(h)) {
        if (h.ill[x.first]) { const ill = h.ill[x.first]; if (--ill.left <= 0) { delete h.ill[x.first]; } else if ((ill.flu && R() < HEALTH.fluFatality(x.age) / 6) || (ill.bad && R() < (x.age < 3 || x.age > 70 ? 0.004 : 0.0012))) { h.members = h.members.filter(y => y !== x); delete h.ill[x.first]; say(h, `${nameOf(h, x)} of No. ${h.no} died in the night${x.age < 5 ? ', a little thing of ' + x.age : ''}`, 'death'); } continue; }
        // background deaths at Bermondsey's rate (12.5 a thousand; infants 57 a thousand)
        if (R() < HEALTH.baseDeath(x.age)) { h.members = h.members.filter(y => y !== x); say(h, `${nameOf(h, x)} of No. ${h.no} died${x.age < 1 ? ', a baby of a few months' : x.age > 65 ? ', at a great age for the Buildings' : ''}`, 'death'); continue; }
        // the influenza of 1931, caught in the street or from the family
        const fluIn = Object.values(h.ill).some(v => v.flu);
        if (R() < HEALTH.fluHazard(d, h.members.length / h.rooms > 2) * (fluIn ? 10 : 1)) { h.ill[x.first] = { left: 6 + Math.floor(R() * 6), flu: true }; if (x.age >= 55 || x.age < 5 || R() < 0.4) say(h, `${nameOf(h, x)} of No. ${h.no} is down with the influenza`, 'flu', { who: x.first }); continue; }
        const p = 0.0015 + (ctx.cold ? 0.0015 : 0) + (ctx.fog ? 0.001 : 0) + (h.hungry ? 0.004 : 0) + (Object.keys(h.ill).length ? 0.012 : 0) + (x.age < 5 || x.age > 65 ? 0.002 : 0);
        if (R() < p) { const bad = R() < 0.12; h.ill[x.first] = { left: bad ? 10 + Math.floor(R() * 10) : 3 + Math.floor(R() * 5), bad }; if (bad || x.age < 5) say(h, `${nameOf(h, x)} of No. ${h.no} is down with ${bad ? (x.age < 10 ? 'the measles' : 'bronchitis') : 'a feverish cold'}`, 'ill', { who: x.first }); }
      }
      // work lost and found
      for (const x of people(h)) if (x.job && !JOBS[x.job].casual && !JOBS[x.job].pension && !(x.unemployedUntil > d) && R() < 0.002) { x.unemployedUntil = d + 14 + Math.floor(R() * 60); say(h, `${nameOf(h, x)} of No. ${h.no} has been stood off ${/^at /.test(JOBS[x.job].name) ? JOBS[x.job].name : 'from ' + (x.m ? 'his' : 'her') + ' place as ' + JOBS[x.job].name}`, 'stoodoff'); }
      // the drinker on pay-night; the quarrelsome on the landing
      if (ctx.dow === 'sat' && (h.trait === 'a drinker' || h.trait2 === 'a drinker') && R() < 0.35 && people(h).some(x => x.m && x.age >= 18)) { h.cash = Math.max(0, h.cash - 30); say(h, `${h.title} of No. ${h.no} came home from the Nelson the worse for drink, and there was a row`, 'row');
        // drunk and disorderly: the constable takes him in; Monday at Tower Bridge, five shillings or five days
        if (R() < 0.15) { h.court = { day: d + 2, text: `${h.title} of No. ${h.no} was fined five shillings at Tower Bridge Police Court for being drunk and disorderly`, fine: 60 }; say(h, `P.C. Dawe took ${h.title} of No. ${h.no} to the station for being drunk and disorderly`, 'arrest'); } }
      if (h.court && h.court.day === d) { if (h.cash >= h.court.fine) { h.cash -= h.court.fine; say(h, h.court.text, 'court'); } else { say(h, h.court.text.replace('was fined five shillings', 'went to prison for five days, not having the five shillings fine,'), 'court'); } h.court = null; h.standing = (h.standing || 0) - 1; }
      if ((h.trait === 'quarrelsome') && R() < 0.03) { const o = pick(hh.filter(g => g !== h && !g.out && g.landing === h.landing)); if (o) say(h, `${h.wifeTitle} and ${o.wifeTitle} had words on the landing over the copper in the wash-house`, 'quarrel', { other: o.id }); }
      // births: about eighteen in a thousand a year
      if (people(h).some(x => !x.m && x.age >= 20 && x.age <= 40) && R() < 0.065 / 365) { h.members.push({ first: pick(KIDS), age: 0, m: R() < 0.5 }); say(h, `${h.wifeTitle} of No. ${h.no} has had a baby`, 'birth'); }
      // repaying Ada, if they owe her and have it (the steady and the proud pay first)
      if (h.owesAda > 0 && h.cash > h.owesAda + 12 && (ctx.dow === 'sat' || ctx.dow === 'fri') && R() < (['steady', 'proud', 'chapel'].includes(h.trait) ? 0.9 : 0.5)) { h.cash -= h.owesAda; ev.push({ hh: h.id, no: h.no, kind: 'repay', amount: h.owesAda, text: `${h.wifeTitle} of No. ${h.no} paid back the ${money(h.owesAda)} she owed Mrs. Turner` }); h.owesAda = 0; }
    }
    S.events = ev; S.log.push(...ev.map(e => ({ day: d, ...e }))); return ev;
  };
  // who of the Buildings is to be met at a place today, and what they are about (for perception and conversation)
  S.presentAt = function (place, d, mod, dow) {
    const out = [];
    for (const e of S.events) if (e.place === place) { const h = hh.find(x => x.id === e.hh); out.push({ hh: h.id, name: h.wifeTitle, doing: e.text.replace(/^Mrs\. \w+ \w+ of No\. \d+ /, '') }); }
    if (place === 'chandler' || place === 'market') { const busy = hh.filter(h => !h.out && (h.no * 7 + d) % 9 === mod % 9).slice(0, 1); for (const h of busy) if (!out.some(o => o.hh === h.id)) out.push({ hh: h.id, name: h.wifeTitle, doing: h.slate > 60 ? 'asking Mr. Barker to put it on the slate' : 'doing her bit of shopping' }); }
    return out.slice(0, 2);
  };
  // a neighbour at Ada's door with a request: the hard-pressed and the generous-to-each-other come first
  S.requestFor = function (d, adaMoney) {
    const cand = hh.filter(h => !h.out && h.landing <= 1 && (h.hungry || h.arrears >= 1 || Object.keys(h.ill).length) && h.owesAda === 0);
    if (!cand.length || S.R() > 0.3) return null;
    const h = cand[Math.floor(S.R() * cand.length)];
    if (Object.keys(h.ill).length && S.R() < 0.5) { const who = Object.keys(h.ill)[0]; return { hh: h.id, from: h.wifeTitle, kind: 'mind', text: `${h.wifeTitle} of No. ${h.no} asks if Mrs. Turner will sit with ${who} an hour while she goes to the chemist's` }; }
    const amt = h.arrears ? 24 : 6;
    return { hh: h.id, from: h.wifeTitle, kind: 'loan', amount: amt, text: `${h.wifeTitle} of No. ${h.no} asks Mrs. Turner for the loan of ${amt === 6 ? 'sixpence' : 'two shillings'} till Saturday` };
  };
  S.lend = function (hid, amount) { const h = hh.find(x => x.id === hid); if (!h) return; h.cash += amount; h.owesAda += amount; h.hungry = 0; };
  S.help = function (hid) { const h = hh.find(x => x.id === hid); if (!h) return; for (const k of Object.keys(h.ill)) h.ill[k].left = Math.max(1, h.ill[k].left - 1); };
  S.stats = function () {
    const live = hh.filter(h => !h.out);
    return { households: live.length, people: live.reduce((s, h) => s + h.members.length, 0), slateAtBarkers: money(S.slateTotal), pledgedAtLambs: live.reduce((s, h) => s + h.pledged.length, 0),
      inArrears: live.filter(h => h.arrears > 0).length, noticeToQuit: live.filter(h => h.notice).length, evicted: hh.filter(h => h.out).length, hungry: live.filter(h => h.hungry).length,
      ill: live.reduce((s, h) => s + Object.keys(h.ill).length, 0), flu: live.reduce((s, h) => s + Object.values(h.ill).filter(v => v.flu).length, 0), outOfSteadyWork: live.reduce((s, h) => s + h.members.filter(x => x.unemployedUntil > S.day).length, 0) };
  };
  S.describe = h => `${h.title} and family, No. ${h.no}: ${h.members.map(x => `${x.first} (${x.age}${x.job ? ', ' + JOBS[x.job].name : ''})`).join(', ')}; ${h.rooms} room${h.rooms > 1 ? 's' : ''} at ${money(h.rent)}; ${h.trait}.`;
  return S;
}
module.exports = { makeStreet, JOBS };
