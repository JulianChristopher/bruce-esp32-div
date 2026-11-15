// The 1930s as a stream of days: everything the engine can know about any date from 1 January 1931 to 31 December
// 1940, from records (see README-decade.md for sources). One call per day: chronos.day('1936-01-20').
'use strict';
const fs = require('fs'), path = require('path');
const D = __dirname, J = f => { try { return JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')); } catch (e) { return null; } };
const WEATHER = Object.fromEntries((J('weather.json') || []).map(x => [x.date, x]));
const FOOT = J('football.json') || [], HANS = J('hansard.json') || {}, EVENTS = J('events_wikipedia.json') || [], INST = J('institutions1930s.json') || { changes: [], summer_time: {} };
const PRICES = (J('prices1930s.json') || { points: [] }).points, LOCALU = J('unemployment_local.json') || {};
const NEWS = {}; const newsYear = y => (NEWS[y] = NEWS[y] || J(`news/${y}.json`) || {});
const iso = x => (typeof x === 'string' ? x : x.toISOString().slice(0, 10));
const dateOf = s => new Date(s + 'T12:00:00Z');
const add = (s, n) => iso(new Date(dateOf(s).getTime() + n * 864e5));
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ---- sun and moon over London (NOAA equations; mean lunation) ----
function sun(s) {
  const x = dateOf(s), N = Math.round((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5) + 1, RAD = Math.PI / 180, LAT = 51.507, LON = -0.128;
  const g = 2 * Math.PI / 365 * (N - 1 + 0.5);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(LAT * RAD) * Math.cos(decl)) - Math.tan(LAT * RAD) * Math.tan(decl)) / RAD;
  const bst = summerTime(s) ? 60 : 0;   // clock time
  const rise = Math.round(720 - 4 * (LON + ha) - eqt) + bst, set = Math.round(720 - 4 * (LON - ha) - eqt) + bst;
  return { rise, set, lightUp: set + 30, lampsOut: rise - 30 };
}
function moon(s) {
  const SYN = 29.530588853, age = (((dateOf(s) - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYN + SYN) % SYN;
  return { age: +age.toFixed(1), name: age < 1.8 || age > 27.7 ? 'new moon' : age < 9.2 ? 'first quarter' : age < 13 ? 'waxing moon' : age < 16.6 ? 'full moon' : age < 24 ? 'last quarter' : 'old moon' };
}
function summerTime(s) { const p = INST.summer_time[s.slice(0, 4)]; return !!p && s >= p[0] && (!p[1] || s < p[1]); }

// ---- the calendar: bank holidays by the Bank Holidays Act (Easter by the Gregorian computus), and the extra ones ----
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`; }
function holiday(s) {
  const y = +s.slice(0, 4), E = easter(y), firstMonAug = (() => { let d = `${y}-08-01`; while (dateOf(d).getUTCDay() !== 1) d = add(d, 1); return d; })();
  const H = { [add(E, -2)]: 'Good Friday', [add(E, 1)]: 'Easter Monday', [add(E, 50)]: 'Whit Monday', [firstMonAug]: 'August Bank Holiday', [`${y}-12-25`]: 'Christmas Day', [`${y}-12-26`]: 'Boxing Day', '1935-05-06': 'the Silver Jubilee', '1937-05-12': 'Coronation Day' };
  if (y >= 1939 && (s === firstMonAug)) return y === 1940 ? null : H[s];   // August Bank Holiday 1940 was cancelled (war)
  return H[s] || null;
}
// ---- the rules in force on a day: fold the dated changes ----
function rules(s) {
  const r = { dole_man: 204, dole_man_wife: 360, means_test: false, war: false, blackout: false, evacuation: false, callup: false, ration: null, blitz: false };
  for (const c of INST.changes) if (c.set && c.date <= s) Object.assign(r, c.set);
  return r;
}
// ---- fog from the weather (dry, cold, small range between day and night) ----
function fog(s) { const w = WEATHER[s]; if (!w || w.rain >= 0.5 || w.tmean >= 6 || w.tmax - w.tmin >= 5) return null; return w.tmean < 3 && w.tmax - w.tmin < 4 ? 'thick' : 'mist'; }

// ---- prices: the cost-of-living index (per cent above July 1914), interpolated between the official figures; the
//      factor turns a 1931 price into the price of the day (index 152 in March 1931) ----
function costOfLiving(s) {
  const t = dateOf(s).getTime(), P = PRICES.map(p => [dateOf(p.date).getTime(), p.pct]);
  if (!P.length) return null; if (t <= P[0][0]) return P[0][1]; if (t >= P[P.length - 1][0]) return P[P.length - 1][1];
  for (let i = 1; i < P.length; i++) if (t <= P[i][0]) { const [t0, v0] = P[i - 1], [t1, v1] = P[i]; return +(v0 + (v1 - v0) * (t - t0) / (t1 - t0)).toFixed(1); }
}
const priceFactor = s => (100 + costOfLiving(s)) / 152;
// ---- local unemployment: per cent of the insured out of work in Bermondsey and Islington, by quarter (to July 1939) ----
function unemployment(s, place = 'Bermondsey') {
  const tab = LOCALU[`${place}:LUI_UNEM_PERCENT`]; if (!tab) return null;
  let last = null; for (const r of tab.rows) { const d = new Date(r[0] + ' 12:00 UTC'); if (d <= dateOf(s)) last = { asOf: r[0], men: +r[1] || null, women: +r[2] || null, all: +r[4] || null }; }
  return last;
}
// ---- one day ----
function day(s) {
  s = iso(s); const y = s.slice(0, 4);
  return {
    date: s, weekday: WD[dateOf(s).getUTCDay()], weather: WEATHER[s] || null, fog: fog(s), sun: sun(s), moon: moon(s), summerTime: summerTime(s), holiday: holiday(s),
    news: (newsYear(y)[s] || []).slice(0, 8),                                    // wire stories of the day, as printed (NewsWire)
    football: FOOT.filter(m => m.date === s),                                    // London clubs and the Cup
    parliament: HANS[s] || null,                                                 // the House's main business that day
    happened: EVENTS.filter(e => e.date === s || e.date === s.slice(0, 7)),     // engine only: written with hindsight
    changes: INST.changes.filter(c => c.date === s || c.date === s.slice(0, 7)), // a rule changes today
    rules: rules(s), costOfLiving: costOfLiving(s), priceFactor: +priceFactor(s).toFixed(3), unemployment: { bermondsey: unemployment(s, 'Bermondsey'), islington: unemployment(s, 'Islington') }
  };
}
module.exports = { costOfLiving, priceFactor, unemployment, day, sun, moon, summerTime, holiday, rules, fog, easter, iso, add };
