// The decade (DESIGN-dynamic.md 3.9, order of work 5): what changes with the years for the main persons and those
// around them. Ages in the portraits and sheets move on each New Year (in the words of the sheets); memory is
// consolidated each year (the month lines, beliefs and the past are kept, the detail of more than a year ago goes).
// Life events beyond ageing (a marriage, a death in the family, a new place) come from base rates and from the
// persons' own plans; they are not scripted here.
'use strict';
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const words = n => n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + NUM[n % 10] : '') : String(n);
function value(w) {
  const t = String(w || '').toLowerCase(); if (/^\d+$/.test(t)) return +t;
  const i = NUM.indexOf(t); if (i >= 0) return i;
  const [a, b] = t.split('-'); const ti = TENS.indexOf(a); if (ti >= 2) { if (!b) return ti * 10; const u = NUM.indexOf(b); if (u > 0 && u < 10) return ti * 10 + u; }
  return null;
}
const NW = '(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:-(?:one|two|three|four|five|six|seven|eight|nine))?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|\\d{1,2}';
// "aged forty-one", "a charwoman of forty-one,", "Joan, of seven.", "Mr. Walter Thomas, fifty-six, was", "seven years old"
const AGE_RE = new RegExp(`\\b(aged |of )(${NW})(?=[,.;)]| at\\b| years\\b| and\\b|$)|(, )(${NW})(, was\\b)|\\b(${NW})( years old)\\b`, 'gi');
function ageText(text, years = 1) {
  if (!text || !years) return text;
  return String(text).replace(AGE_RE, (m, p1, n1, p2, n2, s2, n3, s3) => {
    const n = n1 || n2 || n3, v = value(n); if (v === null || v > 110) return m;
    const nw = /^\d+$/.test(n) ? String(v + years) : words(v + years); const cased = /^[A-Z]/.test(n) ? nw[0].toUpperCase() + nw.slice(1) : nw;
    return n1 ? `${p1}${cased}` : n2 ? `${p2}${cased}${s2}` : `${cased}${s3}`;
  });
}
// once a year: keep the past, beliefs, the month lines and the last twelve months; the rest has been lived through
function yearlyConsolidate(mem, day) {
  return (mem || []).filter(x => x.day === 'past' || x.belief || x.month || x.year || (typeof x.day === 'number' && day - x.day < 365));
}
// the days of the year that people named, for any year: Easter by the Gregorian reckoning, the movable feasts from it,
// the quarter-days, the Bank Holidays of England (Easter Monday, Whit Monday, the first Monday in August, Boxing Day)
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
  i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return Date.UTC(y, mo - 1, da); }
function holidayOf(t) {   // t: ms (UTC midnight) -> name of the day, or null
  const x = new Date(t), y = x.getUTCFullYear(), md = `${x.getUTCMonth() + 1}-${x.getUTCDate()}`, E = easter(y), dd = Math.round((t - E) / 864e5);
  const mov = { '-47': 'Shrove Tuesday', '-46': 'Ash Wednesday', '-21': 'Mothering Sunday', '-7': 'Palm Sunday', '-2': 'Good Friday', '0': 'Easter Sunday', '1': 'Easter Monday, a Bank Holiday', '49': 'Whit Sunday', '50': 'Whit Monday, a Bank Holiday' };
  if (mov[String(dd)]) return mov[String(dd)];
  const fixed = { '1-1': "New Year's Day", '1-2': "the day after New Year's Day", '3-25': 'Lady Day, the quarter-day', '6-24': 'Midsummer Day, the quarter-day', '9-29': 'Michaelmas, the quarter-day', '11-5': 'Guy Fawkes Day', '11-11': 'Armistice Day', '12-24': 'Christmas Eve', '12-25': 'Christmas Day', '12-26': 'Boxing Day, a Bank Holiday', '12-31': "New Year's Eve" };
  if (fixed[md]) return fixed[md];
  if (x.getUTCMonth() === 7 && x.getUTCDay() === 1 && x.getUTCDate() <= 7) return 'August Bank Holiday';
  return null;
}
// life events of the people around the main persons, by the base rates of the time (no script): a death by the
// Bermondsey rates for the person's age (health1931.js), a birth to a married woman of twenty to forty (the borough's
// birth rate). The main persons themselves only with MORTAL=1. Ages come from the sheets and move on each New Year.
const AGED = new RegExp(`\\baged (${NW})\\b`, 'i');
function ageOf(p) { if (p.age != null) return p.age; const m = String(p.sheet || '').match(AGED); p.age = m ? value(m[1]) : null; return p.age; }
function lifeEvents(w, day, R, opts = {}) {
  const H = require('./health1931.js'), out = [];
  for (const p of Object.values(w.people)) {
    if (p.dead || (p.main && !opts.mortal) || p.registry || /^nb_/.test(p.id) || p.id === 'doctor') continue;
    const age = ageOf(p); if (age == null) continue;
    if (R() < H.baseDeath(age) * (opts.scale || 1)) { p.dead = true; p.away = true; p.place = null; out.push({ kind: 'death', id: p.id, age }); continue; }
    if (p.f && age >= 20 && age <= 40 && /\b(wife|married)\b/i.test(p.sheet || '') && !(p.lastBirth != null && day - p.lastBirth < 640) && R() < (opts.birthP || 0.09) * (opts.scale || 1) / 365) { p.lastBirth = day; out.push({ kind: 'birth', id: p.id, age }); }
  }
  return out;
}
module.exports = { ageText, yearlyConsolidate, value, words, easter, holidayOf, ageOf, lifeEvents };
