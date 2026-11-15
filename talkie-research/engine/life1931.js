// Life without a script: what the world generates each day, by chance and by rule, instead of dated story events.
// Rates are rough figures for London in the winter of 1931 (casual dock labour, winter illness, post); the weather
// is real: Met Office HadCET daily temperatures (Central England) and HadSEEP daily rainfall (South-East England).
'use strict';
const WEATHER = require('./weather1931.json');

function rng(seed) {   // mulberry32: the same seed gives the same life
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function weatherOf(d) {
  const x = WEATHER[Math.min(d, WEATHER.length - 1)];
  const { tmean: m, tmax: hi, tmin: lo, rain: r } = x;
  let words;
  if (r >= 4) words = m < 1.5 ? 'snowing' : 'pouring with rain';
  else if (r >= 0.8) words = m < 1.5 ? 'sleeting' : hi < 7 ? 'cold and wet' : 'raining';
  else if (hi - lo < 3 && m < 6) words = 'foggy and raw';
  else if (lo < -1) words = hi > 3 ? 'frosty and bright' : 'bitterly cold, with a hard frost';
  else if (m >= 8) words = 'mild';
  else words = hi >= 7 ? 'grey and chilly' : 'raw and grey';
  return { words, tmean: m, tmax: hi, tmin: lo, rain: r, text: `${words} (${Math.round(lo)}° to ${Math.round(hi)}°C)` };
}
const outdoorWarmth = d => Math.max(0, Math.min(60, 12 + weatherOf(d).tmean * 4));

// people who can fall ill, and how illness keeps them
const ILL = { ada: 'Ada', arthur: 'Arthur', thomas: 'Mr. Thomas', joan: 'Joan', edith: 'Edith', bert: 'Bert' };
const FOUND = [['a sixpence', 6], ['a shilling', 12], ['a half-crown', 30], ['a silver pencil', 24], ['a fountain-pen', 60], ['a sealed letter addressed to the Manager', 0]];

function makeLife(env) {   // env: { WORLD, F, W, A, NPC, remember, fact, setState, say, note, letter, SHORTDATE, LONGDATE, DOW, money, seed }
  const R = rng(env.seed || 1931), { WORLD, F, W, A } = env;
  const chance = p => R() < p;
  const pickOne = xs => xs[Math.floor(R() * xs.length)];
  const L = { log: [], ill: {} };
  const ev = (kind, text) => { L.log.push({ day: W.day, kind, text }); env.say(`   ✶ ${text}`); };

  // ----- the morning's draws -----
  function morning() {
    const d = W.day, w = env.DOW(d), wx = weatherOf(d), weekday = !['sat', 'sun'].includes(w);
    // casual dock labour: taken on or not at the call-on; hard frost and snow stop the ships being worked
    if (weekday && !L.ill.bert) {
      const bad = wx.tmin < -2 || wx.words === 'snowing';
      if (F.bertWork && chance(0.035 + (bad ? 0.08 : 0))) {
        F.bertWork = false; W.bertOutSince = d;
        env.setState('bert', ['ada'], 'Bert is out of work');
        env.remember('ada', `Bert came home from the dock gates: he was not taken on, and the foreman says there will be nothing for him this week${bad ? ' with the frost holding up the ships' : ''}.`, ['bert', 'money'], 3);
        if (!W.bertFactDone) { W.bertFactDone = true; env.fact('ada', `What happened to Bert at the docks in the week of ${env.SHORTDATE(d)}?`, ['He was stood off and lost his work', 'He was made a foreman', 'Nothing; he worked as usual'], 0); }
        ev('work', `Bert has lost his work at the docks${bad ? ' (frost)' : ''}.`);
      } else if (!F.bertWork && chance(bad ? 0.04 : 0.13)) {
        F.bertWork = true; env.setState('bert', ['ada'], 'Bert is in work again at the docks');
        env.remember('ada', `Bert was taken on again at the docks after ${d - (W.bertOutSince ?? d)} days without work.`, ['bert', 'money'], 3);
        ev('work', 'Bert has been taken on again at the docks.');
      }
    }
    // illness: winter, cold rooms and an empty stomach make it likelier; it lasts some days
    for (const [id, name] of Object.entries(ILL)) {
      if (L.ill[id]) {
        const s = L.ill[id]; s.left--;
        if (s.doctor && s.left > 1) s.left--;
        if (s.left <= 0) { delete L.ill[id]; F['ill_' + id] = false; recovered(id, name); }
        continue;
      }
      const p = WORLD.people[id], cold = p.main ? p.needs.warmth > 50 : WORLD.warmthOf(p.home) < 35, hungry = p.main && p.needs.hunger > 70;
      const HOME = { ada: 'ada_home', bert: 'ada_home', arthur: 'arthur_home', edith: 'arthur_home', joan: 'arthur_home', thomas: 'thomas_home' };
      const sickAtHome = Object.keys(L.ill).some(o => o !== id && HOME[o] === HOME[id]);   // colds and influenza go round a household
      const pr = 0.004 + (d < 59 ? 0.004 : 0.002) + (cold ? 0.008 : 0) + (hungry ? 0.006 : 0) + (wx.tmean < 1 ? 0.003 : 0) + (sickAtHome ? 0.05 : 0);
      if (chance(pr)) fallIll(id, name, 3 + Math.floor(R() * 6));
    }
    // the post: letters from relations come when they come; one may announce a visit
    if (w !== 'sun') {
      if (chance(1 / 14)) {
        const visit = !W.brayVisited && !W.brayComing && chance(0.35);
        if (visit) { W.brayComing = d + 5; }
        env.letter('arthur', "Mrs. Bray, Edith's mother, at Colchester", `${visit ? `She writes that she would like to come and stay for a fortnight, arriving on ${env.LONGDATE(d + 5)}.` : 'She sends her love, asks after Joan, and says the winter is hard in Colchester.'}${L.log.some(x => x.kind === 'ill' && /Joan/.test(x.text)) ? ' She hopes Joan is over her cough.' : ''}`, ['edith', 'joan'], visit ? ['What did Mrs. Bray write to say in her last letter?', [`That she would come to stay`, 'That she was ill', 'That she was moving to London'], 0] : null);
      }
      if (chance(1 / 25)) env.letter('ada', 'her sister Lizzie, at Paddock Wood in Kent', pickOne(['The hop-gardens will want pickers in September; Bert could have three weeks\' work there.', 'Times are hard in the village; she sends a few eggs by the carrier.', 'Her husband has had his wages cut; she asks how Ada is managing.']), ['bert'], null);
    }
    if (W.brayComing === d) { W.brayComing = null; W.brayVisited = true; F.brayVisiting = true; W.brayUntil = d + 10 + Math.floor(R() * 5); env.setState('granny', ['arthur'], "Edith's mother, Mrs. Bray, is staying in the house"); env.remember('arthur', "Edith's mother, Mrs. Bray, has come from Colchester to stay; there is an extra mouth to feed.", ['edith', 'money'], 3); env.fact('arthur', `Who came to stay with you in ${['January', 'February', 'March', 'April'][new Date(Date.UTC(1931, 0, 2 + d)).getUTCMonth()]}?`, ["Edith's mother, Mrs. Bray", 'Your brother', 'Nobody'], 0); ev('visit', "Mrs. Bray arrives from Colchester."); }
    if (F.brayVisiting && W.brayUntil === d) { F.brayVisiting = false; env.setState('granny', ['arthur'], 'Mrs. Bray has gone home to Colchester'); env.remember('arthur', 'Mrs. Bray has gone home to Colchester.', ['edith'], 2); ev('visit', 'Mrs. Bray goes home.'); }
    // the calendar: Joan's birthday is the 1st of March
    W.birthday = env.SHORTDATE(d) === '1 March';
    if (W.birthday) env.remember('arthur', "Today is Joan's eighth birthday.", ['joan'], 3);
    // Mr. Thomas in bed: busy all day
    if (L.ill.thomas) A.thomas.busyUntil = Math.max(A.thomas.busyUntil, (d + 1) * 1440 + 6 * 60 + 15);
    if (L.ill.ada) A.ada.busyUntil = Math.max(A.ada.busyUntil, (d + 1) * 1440 + 6 * 60 + 15);
    if (L.ill.arthur) A.arthur.busyUntil = Math.max(A.arthur.busyUntil, (d + 1) * 1440 + 6 * 60 + 15);
    F.joanIll = !!L.ill.joan; F.thomasIll = !!L.ill.thomas;
  }
  function fallIll(id, name, days) {
    const d = W.day; L.ill[id] = { left: days, since: d, doctor: false }; F['ill_' + id] = true;
    const what = pickOne(['a feverish chill', 'a bad cough', 'influenza', 'a heavy cold on the chest']);
    ev('ill', `${name} has fallen ill with ${what}.`);
    if (id === 'joan') { env.setState('joan', ['arthur'], `Joan is ill in bed with ${what}`); env.remember('arthur', `Joan, his daughter, has fallen ill with ${what}; Edith is anxious.`, ['joan', 'edith'], 3); env.fact('arthur', `Who in your family fell ill in the week of ${env.SHORTDATE(d)}?`, ['Joan, my daughter', 'Edith, my wife', 'Nobody'], 0); }
    else if (id === 'edith') { env.setState('edith', ['arthur'], `Edith is ill with ${what}`); env.remember('arthur', `Edith has fallen ill with ${what}; he must manage the house and Joan.`, ['edith'], 3); env.fact('arthur', `Who in your family fell ill in the week of ${env.SHORTDATE(d)}?`, ['Edith, my wife', 'Joan, my daughter', 'Nobody'], 0); }
    else if (id === 'bert') { env.setState('bertill', ['ada'], `Bert is ill with ${what}`); env.remember('ada', `Bert is ill with ${what} and cannot go to the docks.`, ['bert'], 3); F.bertWorkSaved = F.bertWork; F.bertWork = false; }
    else { env.setState('ill_' + id, ['ada', 'arthur', 'thomas'], `${name} is ill in bed with ${what}`); for (const k of Object.keys(A)) env.remember(k, k === id ? `${A[k].short} is ill in bed with ${what}.` : `${name} is ill with ${what} and has stayed at home.`, [id], 3); if (id !== 'ada') env.fact(id === 'thomas' ? 'arthur' : 'ada', `Who was away ill from the office in the week of ${env.SHORTDATE(d)}?`, [id === 'thomas' ? 'Mr. Thomas' : 'Mr. Hale', id === 'thomas' ? 'Mr. Hale' : 'Mr. Thomas', 'Nobody'], 0); }
  }
  function recovered(id, name) {
    ev('ill', `${name} is well again.`);
    if (id === 'joan') { env.setState('joan', ['arthur'], 'Joan is well again'); env.remember('arthur', 'Joan is well again.', ['joan'], 2); }
    else if (id === 'edith') env.setState('edith', ['arthur'], 'Edith is well again');
    else if (id === 'bert') { env.setState('bertill', ['ada'], 'Bert is well again'); F.bertWork = !!F.bertWorkSaved; }
    else { env.setState('ill_' + id, ['ada', 'arthur', 'thomas'], `${name} is back at work after being ill`); W['illDays_' + id] = (W['illDays_' + id] || 0) + 1; }
  }
  // ----- things found while cleaning: whose they are is known to the world, not to Ada -----
  function cleaning() {
    if (W.found || !chance(0.05)) return null;
    const [what, value] = pickOne(FOUND), owner = pickOne(['arthur', 'thomas', 'fenn']);
    W.found = { what, value, owner, day: W.day, where: 'ada' };
    env.remember('ada', `While cleaning she found ${what} under a desk in the clerks' room.`, ['office'], 3);
    ev('found', `Ada finds ${what} under ${owner === 'thomas' ? "Mr. Thomas's" : owner === 'arthur' ? "Mr. Hale's" : "young Mr. Fenn's"} desk.`);
    return ` Under a desk she found ${what}.`;
  }
  function doctor(id) { if (L.ill[id]) L.ill[id].doctor = true; }
  return { morning, cleaning, doctor, ill: L.ill, log: L.log, weatherOf, outdoorWarmth };
}
module.exports = { makeLife, weatherOf, outdoorWarmth, rng };
