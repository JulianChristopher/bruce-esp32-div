// Learned rules: the engine remembers how the game master resolved a kind of deed, and resolves the next deed of the
// same kind by itself (after Voyager's skill library and PoE-World's many small programs: cheaper, and the same
// kind of deed is always treated the same way).
//
// A sentence is cut into clauses; the grammar (verbs.js) reads each clause into a verb and its slots, resolved to the
// world: the person addressed, the place, the goods (in the character's own words), the sum, the thing owned. The
// signature of a sentence is its sequence of verbs. When the game master writes a program for a sentence, every
// argument that came from a slot is replaced by a placeholder ({c1.person}, {home:c1.person}, {c0.place}, {c0.goods},
// {c0.amount}, {home:self}): that is a template. Fixed ids (the pawnshop, the post office) stay as they are; free
// text the game master wrote is never kept (only the character's own words, through the slots).
// A template that two cases of the same signature share becomes a rule; the cases are its tests: the rule must
// re-create the program of every case it covers from that case's own slots. A rule in use is checked against the game
// master now and then (shadow audit); if it disagrees too often it is retired. Rules persist across runs.
'use strict';
const fs = require('fs');
const VERBS = require('./verbs.js'), G = require('./goods1931.js');
const SPLIT = /(?:,\s*(?:and\s+)?(?:then\s+)?|\s+and\s+(?:then\s+)?|;\s*|\s+then\s+)(?=(?:she|he)?\s*[a-z]+s\b)/i;
const TEXT_KEYS = ['what', 'for', 'topic', 'hint', 'note'], NUM_KEYS = ['qty', 'pence', 'minutes', 'in_hours', 'delta', 'value', 'opens', 'closes'];
const ID_KEYS = ['to', 'at', 'with', 'of', 'who', 'thing'];
const GOODS_RE = /\b(?:for|buys?|borrows?|gets?|fetch(?:es)?|orders?|begs?|asks? (?:\w+ )?for|lends?|gives?)\s+((?:a |an |some |two |three |a few |a little |a cup of |a pennyworth of |half a |a quarter of |a pound of |a bag of |a sack of |a hundredweight of |a bucket of |a jug of )?[a-z][a-z' -]{1,30}?)(?=$| from | for | at | to | and | with |,|\.)/i;
const words = s => new Set((String(s || '').toLowerCase().match(/[a-z]{3,}/g) || []));
const overlap = (a, b) => { const B = words(b); let n = 0; for (const x of words(a)) if (B.has(x)) n++; return n; };
// the clauses of a sentence, read by the grammar, with the slots resolved in world w for person `self`
function clauses(sentence, w, self) {
  const p = w && w.people[self];
  const s = String(sentence || '').replace(/^(she|he)\s+/i, '').replace(/\.$/, '');
  return s.split(SPLIT).map(c => c.trim()).filter(Boolean).slice(0, 5).map(c => {
    const f = VERBS.frame('She ' + c + '.') || { verb: 'other', persons: [], goods: [] };
    let place = null; try { place = f.place && p ? VERBS.placeOf(w, p, f, null) : null; } catch (e) { place = null; }
    if (place === p?.place && f.place !== 'HOME') place = place || null;
    const person = (f.persons || []).find(q => q !== 'doctor' && q !== self && w.people[q]) || null;
    const gm = c.match(GOODS_RE); const goods = gm ? gm[1].trim() : null;
    let item = null; if (f.item && w) item = Object.keys(w.objects).find(o => w.objects[o].at === self && (o === f.item || w.objects[o].kind === f.item)) || null;
    return { text: c, verb: f.verb || 'other', person, place, goods, amount: f.amount || null, item };
  });
}
const signature = cs => cs.map(c => c.verb).join('|');
// the shops that sell the goods a clause names (goods1931), for '{shop:cN.goods}'
const shopsFor = c => { if (!c || !c.goods) return []; const g = G.goodsIn(c.goods)[0]; return g && g.shops ? g.shops : []; };
// the same program written a little differently is the same program: talk before a request to the same person is part
// of the request; a last walk home is left to the engine
function canon(ops) {
  const out = []; for (let i = 0; i < ops.length; i++) { const o = ops[i], nx = ops[i + 1]; if (o.op === 'talk' && nx && nx.op === 'request' && nx.of === o.with) continue; out.push(o); }
  return out; }
const dropHome = (ops, home) => (ops.length > 1 && ops[ops.length - 1].op === 'go' && (ops[ops.length - 1].to === home || ops[ops.length - 1].to === '{home:self}') ? ops.slice(0, -1) : ops);
// a program with its slot values replaced by placeholders
function templateOf(cs, ops, w, self) {
  const selfHome = w.people[self] && w.people[self].home;
  const idOf = v => {
    if (typeof v !== 'string') return v;
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (c.person && w.people[c.person] && w.people[c.person].home === v && c.person !== self) return `{home:c${i}.person}`; }
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (c.person === v) return `{c${i}.person}`; if (c.item === v) return `{c${i}.item}`; }
    for (let i = 0; i < cs.length; i++) if (cs[i].place === v && v !== selfHome) return `{c${i}.place}`;
    for (let i = 0; i < cs.length; i++) if (shopsFor(cs[i]).includes(v)) return `{shop:c${i}.goods}`;
    if (v === selfHome) return '{home:self}';
    if (/^(\$new|reg_)/.test(v)) return null;   // made by a deed: not part of a rule
    return v; };
  const textOf = (key, v) => {
    if (!v) return undefined; let best = -1, bs = 0;
    for (let i = 0; i < cs.length; i++) { const n = overlap(v, key === 'what' && cs[i].goods ? cs[i].goods : cs[i].text); if (n > bs) { bs = n; best = i; } }
    if (best < 0) return undefined; return key === 'what' && cs[best].goods ? `{c${best}.goods}` : `{c${best}.text}`; };
  const tpl = [];
  for (const o of canon(ops)) {
    if (o.op === 'create' || o.op === 'despair') return null;
    const n = { op: o.op };
    for (const [k, v] of Object.entries(o)) {
      if (k === 'op' || v === '' || v === null || v === undefined) continue;
      if (ID_KEYS.includes(k)) { const x = idOf(v); if (x === null) return null; n[k] = x; }
      else if (TEXT_KEYS.includes(k)) { const x = textOf(k, v); if (x) n[k] = x; }
      else if (k === 'pence') { const i = cs.findIndex(c => c.amount && Math.abs(c.amount - v) <= 1); n[k] = i >= 0 ? `{c${i}.amount}` : v; }
      else n[k] = v;
    }
    tpl.push(n);
  }
  return tpl;
}
// the same template, apart from the plain numbers (a quantity, minutes) which may differ from case to case
const keyOf = tpl => JSON.stringify(dropHome(tpl, null).map(o => { const n = {}; for (const [k, v] of Object.entries(o)) if (!(NUM_KEYS.includes(k) && typeof v === 'number') && !['for', 'topic', 'note'].includes(k)) n[k] = v; return n; }));
const shape = ops => (ops || []).map(o => o.op + (o.kind ? ':' + o.kind : '') + (o.event ? ':' + o.event : '')).join('>');
function instantiate(tpl, cs, w, self) {
  let ok = true;
  const val = ph => {
    if (ph === '{home:self}') return w.people[self] ? w.people[self].home : (ok = false, ph);
    const sm = ph.match(/^\{shop:c(\d)\.goods\}$/);
    if (sm) { const shops = shopsFor(cs[+sm[1]]), p = w.people[self]; const open = shops.filter(id => w.places[id] && (!w.placeOpenAtArrival || w.placeOpenAtArrival(id, w.travel(p.place, id))));
      const best = open.sort((a, b) => w.travel(p.place, a) - w.travel(p.place, b))[0]; if (!best) { ok = false; return ph; } return best; }
    const m = ph.match(/^\{(home:)?c(\d)\.(person|place|goods|item|amount|text)\}$/); if (!m) return ph;
    const c = cs[+m[2]]; if (!c) { ok = false; return ph; } const v = c[m[3]]; if (!v) { ok = false; return ph; }
    if (m[1]) { const p = w.people[v]; if (!p || !p.home) { ok = false; return ph; } return p.home; }
    return v; };
  const ops = tpl.map(o => { const n = {}; for (const [k, v] of Object.entries(o)) n[k] = typeof v === 'string' && v.startsWith('{') ? val(v) : v; return n; });
  return ok ? ops : null;
}
// the ids and the order of operations agree (the free words and the plain numbers may differ)
const same = (a0, b0, home) => { const a = dropHome(canon(a0), home), b = dropHome(canon(b0), home); return shape(a) === shape(b) && a.every((o, i) => ID_KEYS.every(k => (o[k] || null) === (b[i][k] || null))); };
class Rules {
  constructor(file, opts = {}) {
    this.file = file; this.cases = {}; this.rules = {}; this.stats = { learned: 0, used: 0, shadow: 0, agree: 0, disagree: 0, retired: 0, tested: 0, failedTests: 0 };
    this.auditEvery = opts.auditEvery || 4;
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); this.cases = j.cases || {}; this.rules = j.rules || {}; } catch (e) {}
  }
  save() { if (!this.file) return; try { fs.writeFileSync(this.file, JSON.stringify({ cases: this.cases, rules: this.rules, stats: this.stats }, null, 1)); } catch (e) {} }
  // a program the game master wrote and the engine accepted: kept as a case; a rule when another case agrees
  learn(sentence, ops, w, self) {
    const cs = clauses(sentence, w, self); if (cs.every(c => c.verb === 'other')) return null;
    const sig = signature(cs), tpl = templateOf(cs, ops, w, self); if (!tpl) return null;
    const list = (this.cases[sig] = this.cases[sig] || []); list.push({ sentence, self, cs, ops, key: keyOf(tpl), at: new Date().toISOString() }); if (list.length > 16) list.shift();
    const rs = (this.rules[sig] = this.rules[sig] || []), key = keyOf(tpl);
    if (rs.some(r => r.key === key && !r.retired)) { const r = rs.find(x => x.key === key); r.cases++; this.save(); return null; }
    const agreeing = list.filter(c => c.key === key);
    if (agreeing.length >= 2) {
      // the tests: the template must re-create every agreeing case's program from that case's own slots
      this.stats.tested++;
      const pass = agreeing.every(c => { const r = instantiate(tpl, c.cs, w, c.self); return r && same(r, c.ops, w.people[c.self] && w.people[c.self].home); });
      if (!pass) { this.stats.failedTests++; this.save(); return null; }
      const rule = { sig, key, tpl, cases: agreeing.length, uses: 0, agree: 0, disagree: 0, born: new Date().toISOString() };
      rs.push(rule); this.stats.learned++; this.save(); return rule;
    }
    this.save(); return null;
  }
  // a program for a new sentence from a rule (the best supported one that fits), or null
  apply(sentence, w, self) {
    const cs = clauses(sentence, w, self), rs = (this.rules[signature(cs)] || []).filter(r => !r.retired).sort((a, b) => b.cases - a.cases);
    for (const r of rs) { const ops = instantiate(r.tpl, cs, w, self); if (ops) { r.uses++; this.stats.used++; return { ops, rule: r, audit: r.uses <= 2 || r.uses % this.auditEvery === 0 }; } }
    return null;
  }
  // shadow audit: the game master's own program for the same sentence
  audit(rule, mine, gmOps, home) {   // mine: the rule's program for the sentence, made when it was used
    this.stats.shadow++; if (!gmOps || !gmOps.length) return;
    if (mine && same(mine, gmOps, home)) { rule.agree++; this.stats.agree++; }
    else { rule.disagree++; this.stats.disagree++; if (rule.disagree >= 2 && rule.disagree > rule.agree) { rule.retired = new Date().toISOString(); this.stats.retired++; } }
    this.save();
  }
  list() { return Object.values(this.rules).flat(); }
}
module.exports = { Rules, clauses, signature, templateOf, instantiate, keyOf, shape, same, canon };
