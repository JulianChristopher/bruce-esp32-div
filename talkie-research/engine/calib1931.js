// Calibration (DESIGN-dynamic.md 3.7): the Buildings (thirty households, run by rule, no model) are run for whole
// years with many seeds on the real day data of the 1930s (weather, fog, local unemployment, prices), and what
// emerges is measured against the records we hold: the Medical Officer of Health's birth and death rates for
// Bermondsey, and the Ministry of Labour's share of insured men out of work in Bermondsey. Patterns for which we hold
// no record (pawning, arrears, evictions, arrests) are reported with their spread, to be judged, not tuned.
// usage: node calib1931.js [seeds=200] [years=1] [startYear=1931]
'use strict';
const fs = require('fs'), path = require('path');
const { makeStreet, tune } = require('./street1931.js'), DECADE = require('./decade/chronos1930s.js');
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'decade/health_yearly_raw.json'), 'utf8'));
const SEEDS = +(process.argv[2] || 200), YEARS = +(process.argv[3] || 1), Y0 = +(process.argv[4] || 1931);
const DOWS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const rate = a => (a || []).map(Number).find(x => x > 5 && x < 40) || null;   // the first figure that can be a rate per 1000
const iso = d => d.toISOString().slice(0, 10);
const days = []; for (let t = Date.UTC(Y0, 0, 1); t < Date.UTC(Y0 + YEARS, 0, 1); t += 864e5) { const dt = new Date(t), x = DECADE.day(iso(dt)) || {}; const wx = x.weather || {};
  days.push({ iso: iso(dt), year: dt.getUTCFullYear(), dow: DOWS[dt.getUTCDay()], fog: x.fog || null, unemp: x.unemployment && x.unemployment.bermondsey ? x.unemployment.bermondsey.men : null, priceFactor: x.priceFactor || 1, frost: wx.tmin != null && wx.tmin < 0, cold: wx.tmean != null && wx.tmean < 6 }); }
const per = {};   // per year: sums over seeds
const ensure = y => (per[y] = per[y] || { popDays: 0, births: 0, deaths: 0, infantDeaths: 0, flu: 0, evictions: 0, notices: 0, arrests: 0, pawns: 0, hunger: 0, stoodoff: 0, menOutDays: 0, menDays: 0, arrearsMon: 0, mondays: 0, seeds: 0, perSeed: [] });
if (process.env.TUNE) tune(JSON.parse(process.env.TUNE));
const t0 = Date.now();
for (let s = 1; s <= SEEDS; s++) {
  const S = makeStreet(1000 + s); let lastYear = null, mine = null;
  days.forEach((x, d) => {
    if (x.year !== lastYear) { if (mine) ensure(lastYear).perSeed.push(mine); lastYear = x.year; mine = { births: 0, deaths: 0, evictions: 0, pop: 0, n: 0 }; ensure(x.year).seeds++; }
    const P = ensure(x.year);
    const ev = S.step(d, { dow: x.dow, fog: x.fog, unemp: x.unemp, priceFactor: x.priceFactor, frost: x.frost, cold: x.cold, barkerLimit: S.slateTotal > 900 ? 60 : 120, year: x.year, newYear: d > 0 && x.iso.endsWith('-01-01') });
    const live = S.hh.filter(h => !h.out), people = live.reduce((n, h) => n + h.members.length, 0);
    P.popDays += people; mine.pop += people; mine.n++;
    if (x.dow !== 'sun') for (const h of live) for (const m of h.members) if (m.m && m.age >= 18 && m.age < 65 && m.job && m.job !== 'pension') { P.menDays++; if (m.unemployedUntil > d || m.idle === d) P.menOutDays++; }
    if (x.dow === 'mon') { P.mondays++; P.arrearsMon += live.filter(h => h.arrears > 0).length / Math.max(1, live.length); }
    for (const e of ev) {
      if (e.kind === 'birth') { P.births++; mine.births++; }
      else if (e.kind === 'death') { P.deaths++; mine.deaths++; if (e.born != null && d - e.born < 365) P.infantDeaths++; }
      else if (e.kind === 'flu' && /died/.test(e.text)) { P.deaths++; mine.deaths++; P.flu++; }
      else if (e.kind === 'eviction') { P.evictions++; mine.evictions++; } else if (e.kind === 'notice') P.notices++; else if (e.kind === 'arrest') P.arrests++;
      else if (e.kind === 'pawn') P.pawns++; else if (e.kind === 'hunger') P.hunger++; else if (e.kind === 'stoodoff') P.stoodoff++;
    }
  });
  if (mine) ensure(lastYear).perSeed.push(mine);
}
const out = [];
for (const [y, P] of Object.entries(per)) {
  const popYears = P.popDays / 365, rec = H['Bermondsey:' + y] || {};
  const sd = (vals) => { const m = vals.reduce((a, b) => a + b, 0) / vals.length; return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1)); };
  const dr = P.perSeed.map(r => 1000 * r.deaths / (r.pop / r.n)), br = P.perSeed.map(r => 1000 * r.births / (r.pop / r.n));
  const uRec = days.filter(x => x.year === +y && x.unemp != null).map(x => x.unemp); const uMean = uRec.length ? uRec.reduce((a, b) => a + b, 0) / uRec.length : null;
  out.push({ year: +y, seeds: P.seeds, people: Math.round(popYears / P.seeds),
    deathRate: { sim: +(1000 * P.deaths / popYears).toFixed(1), sdPerStreet: +sd(dr).toFixed(1), record: rate(rec.death_rate) },
    birthRate: { sim: +(1000 * P.births / popYears).toFixed(1), sdPerStreet: +sd(br).toFixed(1), record: rate(rec.birth_rate) },
    infantMortality: { sim: P.births ? Math.round(1000 * P.infantDeaths / P.births) : null, record: y === '1931' ? 57 : null, note: 'per 1000 births; the record parse is noisy (57 for 1931 is the MOH figure)' },
    menOutOfWork: { sim: +(100 * P.menOutDays / Math.max(1, P.menDays)).toFixed(1), record: uMean != null ? +uMean.toFixed(1) : null, note: 'per cent of men in work or seeking it; record: insured men, Bermondsey' },
    perStreetAndYear: { evictions: +(P.evictions / P.seeds).toFixed(2), noticesToQuit: +(P.notices / P.seeds).toFixed(2), arrests: +(P.arrests / P.seeds).toFixed(2), pledgesTold: +(P.pawns / P.seeds).toFixed(1), hungerWeeks: +(P.hunger / P.seeds).toFixed(2), stoodOff: +(P.stoodoff / P.seeds).toFixed(2), shareInArrearsOnMonday: +(P.arrearsMon / Math.max(1, P.mondays)).toFixed(3) } });
}
const res = { made: new Date().toISOString(), seeds: SEEDS, years: YEARS, from: Y0, ms: Date.now() - t0, years_: out };
console.log(JSON.stringify(res, null, 1));
if (process.env.OUTFILE) fs.writeFileSync(process.env.OUTFILE, JSON.stringify(res, null, 1));
