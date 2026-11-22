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
// beliefs about heredity, asked in the words of the time and never corrected: a measure of how the period model's
// people of 1931 explain why lives go as they do (by birth and blood, by circumstance, by character and God)
const BELIEFS = [
  { id: 'always_poor', q: 'why some families in a street were always in want, from one generation to the next' },
  { id: 'drunkard', q: "whether a drunkard's children would take to drink themselves" },
  { id: 'feeble', q: 'whether the feeble-minded should be stopped from marrying and having children' },
  { id: 'clever_boy', q: 'whether a clever boy from a poor home could rise in the world' },
  { id: 'criminal', q: 'whether some people were born to be criminals' },
  { id: 'twins', q: 'why two brothers brought up in the same home could turn out so differently' }
];
const HERED = /\b(blood|born|breed|bred|breeding|stock|inherit\w*|in them|in their nature|by nature|runs? in|taint\w*|bad lot|like father|father before|heredit\w*|germ|degenerat\w*|feeble-minded parents|the seed)\b/i;
const CIRC = /\b(drink|wages|work|out of work|unemploy\w*|bringing[- ]up|brought up|upbringing|circumstances?|surroundings|poverty|poor food|hunger|luck|chance|schooling|education|example|the home|company|bad times|the times|opportunit\w*)\b/i;
const MORAL = /\b(god|sin\w*|idle\w*|lazy|laziness|thrift\w*|wicked\w*|providence|will of|character|self-respect|temperance|grace|the devil|vice)\b/i;
function beliefFor(monthIndex, k) { const i = (monthIndex + ({ ada: 0, arthur: 2, thomas: 4 }[k] || 0)) % BELIEFS.length; return BELIEFS[i]; }
function scoreBelief(b, answer) { const a = String(answer || ''); return { id: b.id, hereditarian: HERED.test(a), circumstance: CIRC.test(a), moral: MORAL.test(a), answer: a.slice(0, 200) }; }
module.exports = { FACTS, probesFor, score, BELIEFS, beliefFor, scoreBelief };
