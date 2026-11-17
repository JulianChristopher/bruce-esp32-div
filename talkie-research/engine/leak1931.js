// Knowledge that moves with the calendar (DESIGN-dynamic.md 3.9): monthly probes of what a person knows of the
// world's great facts. talkie's own reading ends in 1930, but it knows a little of later years (Roosevelt, the war);
// a person of 1931 must not. Each probe asks a plain question of the time; the answer is scored for LEAKAGE (a fact
// named before it happened) and for UPTAKE (a fact of the past months named after it happened, learnt from the
// papers and talk). The questions carry no answer; the answers are not remembered by the person.
'use strict';
// the facts, with the day they became known; `now` is a pattern for the fact itself, `before` for the state before it
const FACTS = [
  { id: 'us_president', q: 'who was President of the United States', from: '1933-03-04', now: /\broosevelt\b/i, before: /\bhoover\b/i, always: true },
  { id: 'us_president_elected', q: 'who had been elected President of the United States', from: '1932-11-08', now: /\broosevelt\b/i, before: /\bhoover\b/i },
  { id: 'german_chancellor', q: 'who governed Germany', from: '1933-01-30', now: /\bhitler\b/i, before: /\b(hindenburg|br[uü]ning|papen|schleicher)\b/i },
  { id: 'king', q: 'who was King of England', from: '1936-01-20', now: /\bedward\b/i, before: /\bgeorge\b/i, until: '1936-12-11' },
  { id: 'king2', q: 'who was King of England', from: '1936-12-11', now: /\bgeorge (the )?(vi|sixth)\b|\bduke of york\b|\balbert\b/i, before: /\bedward\b|\bgeorge (the )?(v|fifth)\b/i },
  { id: 'prime_minister', q: 'who was Prime Minister', from: '1935-06-07', now: /\bbaldwin\b/i, before: /\bmacdonald\b/i, until: '1937-05-28' },
  { id: 'prime_minister2', q: 'who was Prime Minister', from: '1937-05-28', now: /\bchamberlain\b/i, before: /\b(baldwin|macdonald)\b/i, until: '1940-05-10' },
  // 'the war' and 'war with Germany' meant 1914-18 to every speaker of the time: only names of the next war count as leakage
  { id: 'war', q: 'whether England was at war', from: '1939-09-03', now: /\b(yes|we are at war|is at war|at war with germany)\b/i, before: /\b(no|peace|not at war)\b/i, negated: /\b(not at war|no,|is not|are not|isn't|aren't)\b/i, futureRe: /\b(hitler|nazi|the war of 1939|second (great|world) war|blitz|dunkirk|chamberlain)\b/i, always: true },
  { id: 'gold', q: 'whether the pound was still on gold', from: '1931-09-21', now: /\b(off (the )?gold|no longer|gone off|abandoned)\b/i, before: /\b(on (the )?gold|still)\b/i },
  { id: 'national_govt', q: 'what sort of government the country had', from: '1931-08-24', now: /\bnational (government|coalition)\b/i, before: /\blabour\b/i }
];
// the probes for a date: the facts whose change lies within a few years either side (asked of the person as plain talk)
function probesFor(iso, max = 4) {
  const t = Date.parse(iso), yr = 365 * 864e5;
  const near = FACTS.filter(f => !f.always && (!f.until || t < Date.parse(f.until) + 2 * yr) && Math.abs(Date.parse(f.from) - t) < 4 * yr);
  return [...FACTS.filter(f => f.always), ...near].slice(0, max);
}
// leak: the fact (or a later name) given before it happened; uptake: the fact given after it happened
function score(f, iso, answer) {
  const t = Date.parse(iso), after = t >= Date.parse(f.from), a = String(answer || '');
  const saysNow = f.now.test(a) && !(f.negated && f.negated.test(a)), saysBefore = f.before.test(a), future = f.futureRe ? f.futureRe.test(a) : false;
  return { id: f.id, after, leak: !after && (f.futureRe ? future : saysNow), uptake: after ? saysNow : null, stale: after && !saysNow && saysBefore, answer: a.slice(0, 160) };
}
module.exports = { FACTS, probesFor, score };
