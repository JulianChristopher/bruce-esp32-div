// Chronos: the world outside the street is not simulated but played in, day by day, from what really happened
// (after the "Chronos" idea of a dated read-only stream). Everything here is either computed (sun, moon) or taken from
// real records of January-April 1931:
//   football1931.json  every League and FA Cup match of the London clubs (engsoccerdata, J. Curley et al., GPL)
//   hansard1931.json   the main debates of each Commons sitting (UK Parliament Historic Hansard)
// and the Licensing Act 1921 hours for London public-houses. GMT throughout: Summer Time began on 19 April 1931.
'use strict';
const path = require('path');
const T0 = Date.UTC(1931, 0, 2);   // day 0 of the simulation: Friday 2 January 1931
const dateOf = d => new Date(T0 + d * 864e5);
const iso = d => dateOf(d).toISOString().slice(0, 10);
let FOOT = [], HANS = {};
try { FOOT = require(path.join(__dirname, 'football1931.json')); } catch (e) {}
try { HANS = require(path.join(__dirname, 'hansard1931.json')); } catch (e) {}

// ---------- sun and moon over London (51.51 N, 0.12 W), NOAA solar equations; minutes after midnight GMT ----------
const RAD = Math.PI / 180, LAT = 51.507, LON = -0.128;
function sun(d) {
  const x = dateOf(d), N = Math.round((x - Date.UTC(1931, 0, 1)) / 864e5) + 1;
  const g = 2 * Math.PI / 365 * (N - 1 + 0.5);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(LAT * RAD) * Math.cos(decl)) - Math.tan(LAT * RAD) * Math.tan(decl)) / RAD;
  const rise = Math.round(720 - 4 * (LON + ha) - eqt), set = Math.round(720 - 4 * (LON - ha) - eqt);
  // Road Transport Lighting Act 1927: lamps from half an hour after sunset to half an hour before sunrise
  return { rise, set, lightUp: set + 30, lampsOut: rise - 30 };
}
function moon(d) {   // mean age in days since the reference new moon of 6 January 2000, 18.14 GMT (good to about half a day)
  const SYN = 29.530588853, age = (((T0 + d * 864e5 + 12 * 3600e3 - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYN + SYN) % SYN;
  const name = age < 1.8 || age > 27.7 ? 'new moon' : age < 5.5 ? 'young moon' : age < 9.2 ? 'first quarter' : age < 13 ? 'waxing moon' : age < 16.6 ? 'full moon' : age < 20.3 ? 'waning moon' : age < 24 ? 'last quarter' : 'old moon';
  return { age: +age.toFixed(1), name, bright: age > 11 && age < 18.5 };
}
const isDark = (d, mod) => { const s = sun(d); return mod < s.rise || mod > s.set; };

// ---------- public-houses, Licensing Act 1921, London: weekdays 11.30-3 and 5.30-11; Sundays 12.30-2.30 and 7-10 ----------
function pubOpen(d, mod) {
  const sunday = dateOf(d).getUTCDay() === 0;
  return sunday ? (mod >= 750 && mod < 870) || (mod >= 1140 && mod < 1320) : (mod >= 690 && mod < 900) || (mod >= 1050 && mod < 1380);
}

// ---------- football ----------
const CLUB = { 'Arsenal': 'the Arsenal', 'Millwall': 'Millwall', 'Chelsea': 'Chelsea', 'Tottenham Hotspur': 'the Spurs', 'West Ham United': 'West Ham', 'Charlton Athletic': 'Charlton', 'Fulham': 'Fulham',
  'Crystal Palace': 'the Palace', 'Queens Park Rangers': "Queen's Park Rangers", 'Brentford': 'Brentford', 'Clapton Orient': 'Clapton Orient', 'Thames': 'Thames' };
const NUMW = ['nil', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const nm = t => CLUB[t] || t;
function matchesOn(d) { return FOOT.filter(m => m.date === iso(d)); }
function resultWords(m) {   // "Millwall beat Burnley two goals to one at the Den"
  const home = nm(m.home), away = nm(m.away), cup = m.comp === 'FA Cup' ? ' in the Cup' : '';
  if (m.hg === null || m.ag === null) return null;
  if (m.hg === m.ag) return `${home} and ${away} drew, ${NUMW[m.hg] || m.hg} all${cup}`;
  const [w, l, a, b] = m.hg > m.ag ? [home, away, m.hg, m.ag] : [away, home, m.ag, m.hg];
  return `${w} beat ${l} by ${NUMW[a] || a} goal${a > 1 ? 's' : ''} to ${NUMW[b] || b}${cup}${m.hg > m.ag ? '' : ' away from home'}`;
}
// the home fixture of a club today (crowds, a deed: going to the match), before the result is known to anyone
function homeGame(d, club) { return matchesOn(d).find(m => m.home === club) || null; }
// what the papers have of the football: the Saturday-night special and Monday's paper carry the results
function footballNews(d, keen = ['Millwall', 'Arsenal']) {
  const wd = dateOf(d).getUTCDay(), back = wd === 1 ? 2 : wd === 0 ? 1 : 0;
  if (!back && wd !== 6) {   // a midweek match reported the next morning
    const prev = FOOT.filter(m => m.date === iso(d - 1) && keen.some(k => k === m.home || k === m.away));
    return prev.map(resultWords).filter(Boolean);
  }
  const day = wd === 6 ? d : d - back;
  return FOOT.filter(m => m.date === iso(day) && keen.some(k => k === m.home || k === m.away)).map(resultWords).filter(Boolean);
}

// ---------- Parliament: what the papers say the House did at its last sitting ----------
const DULL = /^(New Clause|Clause|Class [IVX]+|First Schedule|Second Schedule|Preamble|Supply|Ways And Means|Standing Committee|New Writ|Orders|Business|Statistics|Personnel|Number O[ef])/i;
const tidy = t => t.replace(/- (\w)/g, '$1').replace(/'S\b/g, "'s").replace(/\s*\[(Lords|Money)\]/g, '').replace(/\s+/g, ' ').trim();
function parliamentNews(d) {
  for (let back = 1; back <= 4; back++) {
    const items = (HANS[iso(d - back)] || []).filter(([t]) => !DULL.test(t)).slice(0, 2);
    if (!items.length) continue;
    const when = back === 1 ? 'yesterday' : `on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateOf(d - back).getUTCDay()]}`;
    return `IN PARLIAMENT. The House of Commons ${when} was occupied with ${items.map(([t]) => (/^(Mr\.|India|Unemployment|National|Russia|Palestine|Housing|Police)/.test(tidy(t)) ? '' : 'the ') + tidy(t)).join(', and with ')}.`;
  }
  return null;
}
// influenza in the papers: the one weekly figure we have from the record (116 deaths, week ended 14 February) in
// figures; the other weeks only in words, rising or falling as the epidemic did
function fluNews(d) {
  const H = require('./health1931.js'), wd = dateOf(d).getUTCDay(); if (wd !== 3) return null;   // the Registrar-General's return, in Wednesday's papers
  if (iso(d) === '1931-02-18') return 'INFLUENZA. Deaths from influenza in London in the week ended Saturday numbered 116, the highest figure of the winter; doctors report the epidemic at its height.';
  const now = H.fluDeathsWeek(d - 4), before = H.fluDeathsWeek(d - 11);
  if (now < 20) return null;
  return now > before * 1.1 ? 'INFLUENZA. The influenza is spreading in London; the deaths from it rose again last week, and doctors are busy in every district.'
    : now < before * 0.9 ? 'INFLUENZA. The deaths from influenza in London fell last week, and it is hoped that the epidemic has passed its worst.' : 'INFLUENZA. The influenza still has a hold on London.';
}
// the paper of the day as each household would have it: what they read beyond the cables
function paperItems(d, who, mod = 1200) {
  const out = [];
  if (dateOf(d).getUTCDay() === 6 && mod < 1020) d = d - 1;   // a morning paper on Saturday has not the afternoon's matches
  const keen = who === 'ada' ? ['Millwall'] : who === 'arthur' ? ['Arsenal', 'Millwall'] : ['Arsenal'];
  const f = footballNews(d, keen); if (f.length) out.push({ text: `FOOTBALL. ${f.map(x => x[0].toUpperCase() + x.slice(1)).join('. ')}.`, kind: 'football' });
  const fl = fluNews(d); if (fl) out.push({ text: fl, kind: 'health' });
  if (who !== 'ada') { const p = parliamentNews(d); if (p && dateOf(d).getUTCDay() !== 1) out.push({ text: p, kind: 'parliament' }); }
  return out;
}
module.exports = { fluNews, sun, moon, isDark, pubOpen, matchesOn, homeGame, resultWords, footballNews, parliamentNews, paperItems, CLUB, iso };
