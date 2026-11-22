// Calibration (DESIGN-dynamic.md 3.7): the Buildings (thirty households, run by rule, no model) are run for whole
// years with many seeds on the real day data of the 1930s (weather, fog, local unemployment, prices), and what
// emerges is measured against the records we hold: the Medical Officer of Health's birth and death rates for
// Bermondsey, and the Ministry of Labour's share of insured men out of work in Bermondsey. Patterns for which we hold
// no record (pawning, arrears, evictions, arrests) are reported with their spread, to be judged, not tuned.
// usage: node calib1931.js [seeds=200] [years=1] [startYear=1931]
'use strict';
const fs = require('fs'), path = require('path');
const { makeStreet, tune, JOBS } = require('./street1931.js'), DECADE = require('./decade/chronos1930s.js');
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
// determinism check (RESEARCH-behaviour-genetics.md): how far do a household's traits and its economic position at the
// start predict its hardship over the years it stays? Lives that can be read off their traits are a scripted street.
const TRAITS = ['generous', 'close', 'proud', 'a drinker', 'a great talker', 'chapel', 'Catholic', 'quarrelsome', 'steady', 'hard-pressed'];
const FATE = [];
for (let s = 1; s <= SEEDS; s++) {
  const S = makeStreet(1000 + s); let lastYear = null, mine = null;
  const init = new Map(S.hh.map(h => { const earners = h.members.filter(x => x.job && !JOBS[x.job].pension); const pay = earners.reduce((t, x) => t + (JOBS[x.job].week || JOBS[x.job].day * 5 * JOBS[x.job].p), 0);
    return [h.id, { traits: [h.trait, h.trait2], earners: earners.length, casual: earners.filter(x => JOBS[x.job].casual).length, size: h.members.length, rentShare: pay ? h.rent / pay : 1, pay, hunger: 0, notices: 0, evicted: 0, arrests: 0, days: 0 }]; }));
  days.forEach((x, d) => {
    if (x.year !== lastYear) { if (mine) ensure(lastYear).perSeed.push(mine); lastYear = x.year; mine = { births: 0, deaths: 0, evictions: 0, pop: 0, n: 0 }; ensure(x.year).seeds++; }
    const P = ensure(x.year);
    const ev = S.step(d, { dow: x.dow, fog: x.fog, unemp: x.unemp, priceFactor: x.priceFactor, frost: x.frost, cold: x.cold, barkerLimit: S.slateTotal > 900 ? 60 : 120, year: x.year, newYear: d > 0 && x.iso.endsWith('-01-01') });
    const live = S.hh.filter(h => !h.out), people = live.reduce((n, h) => n + h.members.length, 0);
    P.popDays += people; mine.pop += people; mine.n++;
    if (x.dow !== 'sun') for (const h of live) for (const m of h.members) if (m.m && m.age >= 18 && m.age < 65 && m.job && m.job !== 'pension') { P.menDays++; if (m.unemployedUntil > d || m.idle === d) P.menOutDays++; }
    if (x.dow === 'mon') { P.mondays++; P.arrearsMon += live.filter(h => h.arrears > 0).length / Math.max(1, live.length); }
    for (const h of live) { const f = init.get(h.id); if (f) f.days++; }
    for (const e of ev) { const f = init.get(e.hh); if (f) { if (e.kind === 'hunger') f.hunger++; else if (e.kind === 'notice') f.notices++; else if (e.kind === 'eviction') f.evicted++; else if (e.kind === 'arrest') f.arrests++; } }
    for (const e of ev) {
      if (e.kind === 'birth') { P.births++; mine.births++; }
      else if (e.kind === 'death') { P.deaths++; mine.deaths++; if (e.born != null && d - e.born < 365) P.infantDeaths++; }
      else if (e.kind === 'flu' && /died/.test(e.text)) { P.deaths++; mine.deaths++; P.flu++; }
      else if (e.kind === 'eviction') { P.evictions++; mine.evictions++; } else if (e.kind === 'notice') P.notices++; else if (e.kind === 'arrest') P.arrests++;
      else if (e.kind === 'pawn') P.pawns++; else if (e.kind === 'hunger') P.hunger++; else if (e.kind === 'stoodoff') P.stoodoff++;
    }
  });
  if (mine) ensure(lastYear).perSeed.push(mine);
  for (const f of init.values()) if (f.days > 60) FATE.push(f);
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
// least squares with a little ridge; R-squared of hardship a year on traits, on the economy, on both
function r2(X, y) { const n = y.length, k = X[0].length; const XtX = Array.from({ length: k }, () => Array(k).fill(0)), Xty = Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  for (let a = 0; a < k; a++) XtX[a][a] += 1e-6 * n;
  const M = XtX.map((r, i) => [...r, Xty[i]]); for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; } }
  const beta = M.map((r, i) => r[k] / r[i]); const mean = y.reduce((s, v) => s + v, 0) / n; let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) { const yh = X[i].reduce((s, v, a) => s + v * beta[a], 0); ssr += (y[i] - yh) ** 2; sst += (y[i] - mean) ** 2; } return +(1 - ssr / sst).toFixed(3); }
const hardship = FATE.map(f => (f.hunger + 2 * f.notices + 6 * f.evicted) / (f.days / 365));
const XT = FATE.map(f => [1, ...TRAITS.map(t => (f.traits.includes(t) ? 1 : 0))]), XE = FATE.map(f => [1, f.earners, f.casual, f.size, f.rentShare, f.pay / 100]);
const byTrait = Object.fromEntries(TRAITS.map(t => { const g = FATE.filter(f => f.traits.includes(t)); return [t, { n: g.length, evictedShare: +(g.filter(f => f.evicted).length / Math.max(1, g.length)).toFixed(3), hardshipPerYear: +(g.reduce((s, f, i) => s + (f.hunger + 2 * f.notices + 6 * f.evicted) / (f.days / 365), 0) / Math.max(1, g.length)).toFixed(2) }]; }));
const determinism = FATE.length > 50 ? { households: FATE.length, r2Traits: r2(XT, hardship), r2Economy: r2(XE, hardship), r2Both: r2(XT.map((r, i) => [...r, ...XE[i].slice(1)]), hardship), evictedShare: +(FATE.filter(f => f.evicted).length / FATE.length).toFixed(3), byTrait } : null;
const res = { made: new Date().toISOString(), seeds: SEEDS, years: YEARS, from: Y0, ms: Date.now() - t0, years_: out, determinism };
console.log(JSON.stringify(res, null, 1));
if (process.env.OUTFILE) fs.writeFileSync(process.env.OUTFILE, JSON.stringify(res, null, 1));
