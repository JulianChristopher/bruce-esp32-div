// Time by events, weekly plans, and background people who come to matter (DESIGN-dynamic.md 3.3, 3.5, 3.6).
//
// Salience and zoom: the period model is asked what a person does only when something is at stake for that person
// (a pressing need, money in question, illness in the house, an arrangement due, a plan for the day, a visitor, a
// troubled mind); otherwise the day runs on habit, and the clock passes over it. The measure is computed from the
// state of the world, not from a list of occasions.
//
// Weekly plans: on Sunday evening (and at the start) each person says, in the period model's own words, what he or
// she means to do in the coming week; the engine keeps the plan, offers each item on its day at a free hour, and at
// the end of the week notes what was done and what was not. The plan is the person's will; the engine only finds
// out what is possible.
//
// Promotion: a background person who has had much to do with the main persons lately (requests, talk, visits,
// help) comes to matter: from then on he or she remembers what passed, and the memory goes into his or her own
// decisions and talk; when the dealings stop, the person is let go again and keeps one line of it.
'use strict';
const DAYNAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DOWS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// ---------------------------------------------------------------------------------------------------------------
// salience: 0..100+, from the state of the world for person k (s: a small view the driver fills in)
//   s = { urg (0-100), stress (0-100), rentToday, rentOwing, illHome, arranged (events due in 3 hours), planDue,
//         visitor, newPresent (main persons present not yet met today), free (a free hour) }
function salience(s) {
  let z = 0; const why = [];
  const add = (v, w) => { if (v > 0) { z += v; why.push(w); } };
  add(Math.max(0, (s.urg || 0) - 50), 'need');                 // a need over 50 begins to count
  add(s.stress > 60 ? (s.stress - 60) : 0, 'mind');
  add(s.rentToday ? 45 : 0, 'rent'); add(s.rentOwing ? 15 : 0, 'arrears');
  add(s.illHome ? 40 : 0, 'illness'); add(s.arranged ? 35 : 0, 'arranged');
  add(s.planDue ? 45 : 0, 'plan'); add(s.visitor ? 60 : 0, 'visitor');
  add(s.newPresent ? 20 : 0, 'company'); add(s.free ? 10 : 0, 'free');
  return { z, why };
}
// ---------------------------------------------------------------------------------------------------------------
// weekly plans: parse the period model's answer ("On Monday she goes ... On Saturday she buys ...")
const PRESENT = { would: '', will: '', 'shall': '' };
function presentOf(verbPhrase) {   // "would buy coal" / "will buy coal" / "buys coal" -> "buys coal"
  let v = verbPhrase.trim().replace(/^(would|will|shall|meant to|means to|intended to|intends to|was to|is to|must|should|hoped to|hopes to)\s+/i, (m) => { PRESENT.x = 1; return ''; });
  if (PRESENT.x) { PRESENT.x = 0; const [w0, ...rest] = v.split(/\s+/); const w = w0.toLowerCase();
    const irr = { go: 'goes', do: 'does', have: 'has', be: 'is', try: 'tries', carry: 'carries', pay: 'pays', buy: 'buys', say: 'says', fetch: 'fetches', wash: 'washes', mend: 'mends', watch: 'watches', catch: 'catches', reach: 'reaches', teach: 'teaches', see: 'sees' };
    const third = irr[w] || (/(s|sh|ch|x|z|o)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
    v = [third, ...rest].join(' '); }
  // "... and collect premiums": a second verb joined by 'and' agrees too
  v = v.replace(/\b(and|then)\s+(go|do|buy|pay|get|take|collect|lie|sit|see|fetch|walk|come|make|bring|write|read|visit|call|look|mend|wash|clean|cook|ask|tell|stay|keep|put|give|send|spend|sell|try)\b(?!s)/gi, (x, c, w) => `${c} ${presentOf('would ' + w)}`);
  return v;
}
// days: the absolute day indices of the coming week (from `from`, the next 7 days), with their weekday names
function parsePlan(text, from, dowOf, k, max = 5) {
  const out = []; const seen = new Set();
  const re = /\b(?:on|next|this|by)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+(?:morning|afternoon|evening|night))?,?\s+(?:she|he|they|i|we)\s+([^.;\n]{4,140})/gi;
  let m;
  while ((m = re.exec(String(text || ''))) && out.length < max) {
    const dn = m[1].toLowerCase(), dow = DOWS[DAYNAMES.indexOf(dn)];
    let day = null; for (let d = from; d < from + 7; d++) if (dowOf(d) === dow) { day = d; break; }
    if (day === null) continue;
    let deed = presentOf(m[2]).replace(/\s+(and|but)\s*$/i, '').replace(/\b(and|then)\s+(would|will|shall)\s+(\w+)/gi, (x, c, mod, v) => `${c} ${presentOf('would ' + v)}`).trim();
    // "thought of clearing the arrears", "resolved to pay them off": the deed after the thought, or nothing
    const mind = deed.match(/^(?:thought|thinks|resolved|resolves|decided|decides|meant|means|intended|intends|hoped|hopes|wanted|wants|planned|plans)\s+(?:to|that she would|that he would)\s+(.+)$/i);
    if (mind) deed = presentOf('would ' + mind[1]);
    if (!deed || /^(is|was|has|had|feels|felt|thinks|thought|hopes|hoped|wonders|wondered|may|might|could|would|should|must)\b/i.test(deed)) continue;   // not a deed
    const key = day + ':' + deed.toLowerCase().slice(0, 30); if (seen.has(key)) continue; seen.add(key);
    out.push({ who: k, day, dow, text: `${/^(she|he)\b/i.test(deed) ? '' : (k && k.f === false ? 'He ' : '')}${deed}`, status: 'due', tries: 0 });
  }
  return out;
}
// ---------------------------------------------------------------------------------------------------------------
// promotion of background people: a measure of how much they have had to do with the main persons
class Promotion {
  constructor(state) { this.s = state; this.s.nsal = this.s.nsal || {}; this.s.prom = this.s.prom || {}; this.s.former = this.s.former || {}; }
  bump(id, v = 1, line = null, day = 0) {
    if (!id) return; this.s.nsal[id] = (this.s.nsal[id] || 0) + v;
    const p = this.s.prom[id]; if (p) { p.last = day; if (line) { p.mem.push({ day, text: line }); if (p.mem.length > 24) p.mem.shift(); } }
    else if (line) { (this.s.pre = this.s.pre || {}); (this.s.pre[id] = this.s.pre[id] || []).push({ day, text: line }); if (this.s.pre[id].length > 6) this.s.pre[id].shift(); }
  }
  // once a day: the measure fades; who has come to matter is promoted, who has not been seen for a fortnight let go
  daily(day, nameOf) {
    const changes = [];
    for (const id of Object.keys(this.s.nsal)) {
      this.s.nsal[id] *= 0.85;
      if (!this.s.prom[id] && this.s.nsal[id] >= 3) { this.s.prom[id] = { since: day, last: day, mem: (this.s.pre && this.s.pre[id]) || [] }; changes.push({ id, up: true }); }
      else if (this.s.prom[id] && this.s.nsal[id] < 0.5 && day - this.s.prom[id].last >= 14) {
        const p = this.s.prom[id]; this.s.former[id] = `${p.mem.length} dealings with the main persons, ${p.since}-${p.last}`; delete this.s.prom[id]; changes.push({ id, up: false }); }
      if (this.s.nsal[id] < 0.05 && !this.s.prom[id]) delete this.s.nsal[id];
    }
    return changes;
  }
  promoted(id) { return !!this.s.prom[id]; }
  memory(id, n = 4) { const p = this.s.prom[id]; return p ? p.mem.slice(-n).map(x => x.text) : []; }
  list() { return Object.keys(this.s.prom); }
}
// "buys coal at Barker's" -> "buy coal at Barker's" (for "had meant to ...")
function baseOf(phrase) {
  const [w0, ...rest] = String(phrase || '').trim().split(/\s+/); const w = (w0 || '').toLowerCase();
  const irr = { goes: 'go', does: 'do', has: 'have', is: 'be', says: 'say', pays: 'pay', buys: 'buy', sees: 'see' };
  const b = irr[w] || (/ies$/.test(w) ? w.slice(0, -3) + 'y' : /(ches|shes|sses|xes|zes|oes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
  return [b, ...rest].join(' ');
}
module.exports = { salience, parsePlan, presentOf, baseOf, Promotion, DOWS, DAYNAMES };
