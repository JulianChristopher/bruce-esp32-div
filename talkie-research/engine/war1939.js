// The war in the world, September 1939 to the end of 1940: what changed for a household in Bermondsey or Islington,
// by the records where they exist (dates, rations, prices, the death-rates of the raids, shelter use), and by stated
// judgement where they do not (marked JUDGEMENT). The dates of the rules (blackout, evacuation, call-up, rationing, the
// Blitz) come from decade/institutions1930s.json through chronos1930s.js; this module adds what a day needs.
//
// Sources:
//   air-raid deaths 1940: Bermondsey 5.2 a thousand of the population, the highest of the London boroughs (London County
//     Council, report of the County Medical Officer of Health); 376 killed in Bermondsey in the first four months of the
//     night Blitz (Southwark News; The World War II Multimedia Database); Islington: 533 deaths from 'other violent
//     causes, which latter includes deaths due to enemy action' among a civilian population of 224,110 (Islington MOH
//     report 1940; about 90 such deaths in a year of peace) -> about 2.0 a thousand
//   injured: 23,000 civilians killed and 32,000 seriously injured in Britain by the end of 1940 -> 1.4 injured a death
//   raids: London was bombed on 57 nights running from 7 September 1940 (Britannica); quiet nights reported on 3 and 28
//     November and 28 December 1940; heavy raids on 7-8 September, 15 October, 15 November, 8 and 29 December
//   shelter census, November 1940 (central London): 4 % in the Underground, 9 % in public shelters, 27 % in their own
//     (Anderson) shelters, the rest at home (Museum of London; J. D. Clare after Longmate)
//   call-up: men 18-41 liable (National Service (Armed Forces) Act, 3 September 1939); registration by age groups:
//     20-21 on 21 October 1939 (HC Deb 5 October 1939), 23 from January 1940, 28 and 29 on 15 and 22 June 1940 (press,
//     May 1940), four further groups in July 1940 (HC Deb 20 June 1940); men over 35 not yet registered in November 1940
//     (HC Deb 12 November 1940); dock workers of 25 and over reserved (HC Deb 11 June 1940)
//   cost of living (per cent above July 1914): 55 before the war, 79 on 1 March and in April 1940 (HC Deb 11 April
//     1940), 74 on 1 January and 77 on 1 February 1940, 93 on 30 November 1940 (Ministry of Labour, as reported by the
//     press) -- these points are in decade/prices1930s.json
//   rations: bacon 4 oz, butter 4 oz, sugar 12 oz a head a week from 8 January 1940; meat by price from 11 March 1940
//     (1s. 10d. a head a week); tea 2 oz, margarine and cooking fats from July 1940
//   evacuation: of those sent away in September 1939, about six in ten were home again by January 1940 (commonly given)
'use strict';
const D = t => new Date(t).toISOString().slice(0, 10);
// ---- the nights of the raids on London ----
const QUIET = new Set(['1940-11-03', '1940-11-28', '1940-12-24', '1940-12-25', '1940-12-26', '1940-12-28']);   // the Christmas lull: JUDGEMENT after the press
const HEAVY = new Set(['1940-09-07', '1940-09-08', '1940-10-15', '1940-11-15', '1940-12-08', '1940-12-29']);
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
function raidNight(iso) {   // was London raided on the night that begins on this day?
  if (iso < '1940-09-07' || iso > '1941-05-11') return false;
  if (iso <= '1940-11-02') return true;   // 57 nights running
  if (QUIET.has(iso)) return false;
  if (HEAVY.has(iso)) return true;
  return hash('raid' + iso) < 0.7;   // JUDGEMENT: raids on most nights of November and December
}
const heavy = iso => HEAVY.has(iso);
// ---- the chances of a night, by district: killed, injured, a home damaged or made uninhabitable ----
const KILLED_1940 = { bermondsey: 5.2, islington: 2.0, highbury: 2.0, moorgate: 2.0, london: 2.0 };   // a thousand of the population, 1940 ('london': a relation's house elsewhere, JUDGEMENT)
const RAIDWEIGHT = 105;   // the raid nights of 1940 by this calendar (93) with the six heavy ones counted three times
const INJURED_PER_KILLED = 1.4;
const SHELTER_RISK = { home: 1.2, public: 0.9, arches: 0.9, anderson: 0.5, tube: 0.3, relations: 1.0 };   // JUDGEMENT: relative to the mean
// a free answer to "where does she go for the night?" read as a kind of shelter (talkie answers letters by position,
// but in its own words it is steady: a charwoman of 1940 'goes to bed, because she has no place to go to', a clerk
// takes his family to his mother's); a relation's house is in another district
function shelterKind(a) {
  const t = String(a || '').split(/because/i)[0];
  if (/underground|\btube\b|station/i.test(t)) return 'tube';
  if (/\barch/i.test(t)) return 'arches';
  if (/anderson|garden/i.test(t)) return 'anderson';
  if (/\b(mother|father|sister|brother|aunt|uncle|cousin|daughter|son|relations?|friends?)\b|country|out of london|away from london|kent|surrey|sussex|essex|epping|safer|safety/i.test(t)) return 'relations';
  if (/basement|public shelter|shelter|crypt|church|refuge/i.test(t)) return 'public';
  if (/cellar|stairs|cupboard|bed|stays|home|rooms?\b|house|nowhere/i.test(t)) return 'home';
  return null;
}
const DAMAGE_1940 = { bermondsey: { damaged: 0.30, uninhabitable: 0.08 } };   // JUDGEMENT: share of homes, Sept-Dec 1940
function nightRisk(iso, district, shelter = 'home') {
  if (!raidNight(iso)) return { killed: 0, injured: 0, damaged: 0, uninhabitable: 0 };
  const w = (heavy(iso) ? 3 : 1) / RAIDWEIGHT, k = (KILLED_1940[district] || 0) / 1000, r = SHELTER_RISK[shelter] || 1;
  const dm = DAMAGE_1940[district] || { damaged: DAMAGE_1940.bermondsey.damaged * (KILLED_1940[district] || 0) / 5.2, uninhabitable: DAMAGE_1940.bermondsey.uninhabitable * (KILLED_1940[district] || 0) / 5.2 };
  return { killed: k * w * r, injured: k * w * r * INJURED_PER_KILLED, damaged: dm.damaged * w, uninhabitable: dm.uninhabitable * w };
}
// the siren at dusk, the all-clear about dawn (minutes after midnight); JUDGEMENT after the accounts of autumn 1940
const sirenAt = sunsetMin => Math.max(19 * 60 + 30, Math.ceil((sunsetMin + 30) / 15) * 15);
// ---- the call-up: the day a man of a given age registered (age on that day), or null (not in 1939-40) ----
const REGISTER = [[20, '1939-10-21'], [21, '1939-10-21'], [22, '1939-12-09'], [23, '1940-01-27'], [24, '1940-02-17'], [25, '1940-03-09'], [26, '1940-03-09'],
  [27, '1940-04-06'], [28, '1940-06-15'], [29, '1940-06-22'], [30, '1940-07-06'], [31, '1940-07-13'], [32, '1940-07-20'], [33, '1940-07-27'], [34, '1940-09-07'], [35, '1940-10-12']];   // dates between the recorded ones: JUDGEMENT
const RESERVED = [[/\bdocker|dock labourer|dock worker/i, 25], [/\bpolice|constable/i, 18], [/\bminister|clergy/i, 18]];
function registers(age1939, born, sheet) {   // age on 1 September 1939 -> {date, reserved} or null
  for (const [a, date] of REGISTER) { const ageThen = age1939 + Math.floor((Date.parse(date) - Date.parse('1939-09-01')) / (365.25 * 864e5)); if (ageThen === a) {
    const res = RESERVED.find(([re, from]) => re.test(sheet || '') && ageThen >= from); return { date, reserved: !!res }; } }
  return null;
}
const CALLED_AFTER = 42;   // days from registering to joining (medical, papers): JUDGEMENT
const UNFIT = 0.2;         // graded unfit for service: JUDGEMENT
// ---- what everybody knew, in the words of the time, for the page of a person (short) ----
function times(iso, r, mod = 12 * 60) {   // mod: minutes after midnight (the morning of 3 September 1939, the evening of 7 September 1940)
  const out = [];
  if (iso === '1939-09-03') out.push(mod >= 11 * 60 + 15 ? 'At a quarter past eleven this morning Mr. Chamberlain said on the wireless that England is at war with Germany.' : 'Everybody is waiting for the news: Germany has been given till eleven o\'clock this morning to answer.');
  else if (r.war) out.push(iso < '1939-09-10' ? 'England has been at war with Germany since Sunday, the 3rd of September.' : 'England is at war with Germany.');
  else if (iso >= '1939-08-24' && iso < '1939-09-03') out.push('Everybody is talking of war with Germany; the children are to be sent out of London.');
  if (r.blackout) out.push('Under the black-out no light may show after dark, and the street-lamps are out.');
  if (iso >= '1940-01-08') out.push(iso >= '1940-07-22' ? 'Bacon, butter, sugar, meat, tea and margarine are on the ration.' : iso >= '1940-03-11' ? 'Bacon, butter, sugar and meat are on the ration.' : 'Bacon, butter and sugar are on the ration: four ounces of bacon, four of butter and twelve of sugar a head a week.');
  if (r.blitz && iso >= '1940-09-08') out.push(iso === '1940-09-08' ? 'Last night the German aeroplanes bombed London; the docks are still burning.' : 'London has been bombed nearly every night since the 7th of September.');
  return out.join(' ');
}
module.exports = { raidNight, heavy, nightRisk, sirenAt, registers, CALLED_AFTER, UNFIT, times, SHELTER_RISK, shelterKind, KILLED_1940, INJURED_PER_KILLED, QUIET, HEAVY, D };
