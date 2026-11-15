// World engine: the world as data and rules. No language model in here.
//
// Patterns taken from earlier work (see README):
//  - space as a tree of places in districts, with walking/tram times between districts (Smallville, AgentSociety)
//  - actions as data: where, when, cost, duration, needs met, effect (The Sims' advertising objects; STRIPS-like)
//  - needs that decay and drive the ranking of what to do (The Sims, Humanoid Agents)
//  - practices: recurring social situations that bring people together and offer actions to the roles in them (Versu)
//  - intent first, steps by the engine: a chosen action may carry its own walk there (Lyfe Agents' option-action)
//  - background people follow routines without a model; the model only speaks for them in contact (level of detail)
//  - each person perceives only what happens where they are (partial, ageing world views as in Smallville)
//  - facts with a source travel from person to person and can fade (Talk of the Town); stage 2 adds mutation
'use strict';

const NEEDS = ['hunger', 'energy', 'warmth', 'social'];   // 0 = fully met, 100 = desperate

class World {
  constructor(def, opts = {}) {
    this.def = def;
    this.T0 = opts.T0; this.ND = opts.days || 90;
    this.t = (opts.startMinute ?? 6 * 60);          // minutes since midnight of day 0
    this.places = def.places;
    this.routes = def.routes;
    this.weather = def.weather || (() => 'grey');
    this.people = {};
    for (const p of def.people) this.people[p.id] = { place: p.home, money: 0, inv: {}, rel: {}, know: {}, obs: [], busyUntil: 0, doing: null, ...structuredClone(p.state || {}), ...p, needs: { hunger: 20, energy: 10, warmth: 10, social: 30, ...(p.needs || {}) } };
    this.objects = structuredClone(def.objects || {});
    this.actions = def.actions;
    this.practices = def.practices || [];
    this.queue = [];
    this.log = [];
    this.flags = structuredClone(def.flags || {});
    this.stats = { performed: {}, moves: 0, npcMoves: 0, perceived: 0, facts: 0, told: 0 };
    for (const ev of def.events || []) this.schedule(ev.day * 1440 + ev.at, ev.run, ev.label);
  }

  // ---------- time ----------
  get day() { return Math.floor(this.t / 1440); }
  get mod() { return this.t % 1440; }
  dow(d = this.day) { return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(this.T0 + d * 864e5).getUTCDay()]; }
  between(a, b) { return this.mod >= a && this.mod < b; }
  schedule(t, fn, label = '') { this.queue.push({ t, fn, label }); this.queue.sort((x, y) => x.t - y.t); }
  runDue() { const out = []; while (this.queue.length && this.queue[0].t <= this.t) { const e = this.queue.shift(); const r = e.fn(this); if (r) out.push(r); } return out; }

  // ---------- space ----------
  place(id) { return this.places[id]; }
  district(id) { return this.places[id]?.district; }
  travel(a, b, who = this.mover) {   // minutes on foot or by tram: real distances where the places have positions (geo1931.js)
    if (!a || !b || a === b) return 0;
    const g = require('./geo1931.js').minutes(a, b, who);
    if (g !== null) return Math.round(g * (this.fogFactor || 1));
    const da = this.district(a), db = this.district(b);
    const fogF = this.fogFactor || 1;   // in a thick fog everything goes at a crawl
    if (da === db) return Math.round(5 * fogF);
    return Math.round((this.routes[da]?.[db] ?? this.routes[db]?.[da] ?? 40) * fogF);
  }
  isOpen(id) { const pl = this.places[id]; return !pl.open || pl.open(this); }
  peopleAt(place, except = null) { return Object.values(this.people).filter(p => p.place === place && p.id !== except && !p.away); }
  presentWith(id) { const p = this.people[id]; return p.place ? this.peopleAt(p.place, id) : []; }
  move(id, place) { const p = this.people[id]; if (p.place === place) return; const from = p.place; p.place = place; if (this.trackOn) (this.track = this.track || []).push([this.t, id, from, place]); if (p.main) this.stats.moves++; else this.stats.npcMoves++; if (from) this.emit(from, `${p.short} left.`, id, { quiet: true }); this.emit(place, `${p.short} came in.`, id, { quiet: true }); }

  // ---------- things ----------
  obj(id) { return this.objects[id]; }
  holding(pid, kind) { return Object.entries(this.objects).filter(([, o]) => o.at === pid && (!kind || o.kind === kind)).map(([k]) => k); }
  count(pid, item) { return this.people[pid].inv[item] || 0; }
  add(pid, item, n = 1) { const inv = this.people[pid].inv; inv[item] = (inv[item] || 0) + n; if (inv[item] <= 0) delete inv[item]; }
  pay(from, to, pence) { this.people[from].money -= pence; if (to) this.people[to].money += pence; }

  // ---------- needs ----------
  warmthOf(place) { const pl = this.places[place]; if (!pl) return 50; return typeof pl.warmth === 'function' ? pl.warmth(this) : (pl.warmth ?? 50); }
  decay(dt) {   // dt in minutes
    for (const p of Object.values(this.people)) {
      if (!p.main && !p.needsTracked) continue;
      const n = p.needs, h = dt / 60;
      n.hunger = Math.min(100, n.hunger + 4.5 * h);
      n.energy = Math.min(100, n.energy + (this.mod >= 22 * 60 || this.mod < 6 * 60 ? 6 : 3.2) * h);
      const cold = 60 - this.warmthOf(p.place);   // a cold place makes one colder; a warm one warms
      n.warmth = Math.max(0, Math.min(100, n.warmth + (cold > 0 ? cold * 0.25 : cold * 0.5) * h));
      n.social = Math.min(100, n.social + (this.presentWith(p.id).length ? -6 : 3) * h);
      for (const k of NEEDS) n[k] = Math.max(0, n[k]);
    }
  }
  needWords(id) {   // needs in words, for the prompt; only the pressing ones
    const n = this.people[id].needs, f = this.people[id].f, P = f ? 'She' : 'He', out = [];
    if (n.hunger > 75) out.push(`${P} is very hungry`); else if (n.hunger > 50) out.push(`${P} is hungry`);
    if (n.energy > 80) out.push(`${P} is worn out`); else if (n.energy > 60) out.push(`${P} is tired`);
    if (n.warmth > 70) out.push(`${P} is chilled to the bone`); else if (n.warmth > 45) out.push(`${P} is cold`);
    if (n.social > 80) out.push(`${P} is lonely`);
    return out.join('; ');
  }

  // ---------- practices: recurring social situations ----------
  activePractices() { return this.practices.filter(pr => pr.active(this)); }
  practiceActive(id) { const pr = this.practices.find(x => x.id === id); return !!pr && pr.active(this); }

  // ---------- background people: routines, no model ----------
  stepBackground() {
    for (const p of Object.values(this.people)) {
      if (p.main) continue;
      let want = p.routine ? p.routine(this, p) : p.home;
      for (const pr of this.activePractices()) for (const [role, who] of Object.entries(pr.cast || {})) if (who === p.id && pr.place) want = pr.place(this);
      if (want === null) { if (!p.away) { if (p.place) this.emit(p.place, `${p.short} left.`, p.id, { quiet: true }); p.away = true; } continue; }
      if (p.away) { p.away = false; p.place = null; }
      if (want && want !== p.place) this.move(p.id, want);
    }
  }

  // ---------- perception: each person sees only what happens where they are ----------
  emit(place, text, actor = null, opts = {}) {
    this.log.push({ t: this.t, place, actor, text, quiet: !!opts.quiet });
    if (opts.quiet) return;
    for (const p of this.peopleAt(place, actor)) if (p.main) { p.obs.push({ t: this.t, text }); this.stats.perceived++; }
  }

  // ---------- knowledge: facts with a source ----------
  learn(id, factId, text, source, conf = 1) {
    const k = this.people[id].know; if (k[factId]) return false;
    k[factId] = { text, source, day: this.day, conf }; this.stats.facts++; return true;
  }
  tell(from, to, factId) {   // stage 1: passed on unchanged, confidence lowered by one step of hearsay
    const f = this.people[from].know[factId]; if (!f) return false;
    const ok = this.learn(to, factId, f.text, this.people[from].short, Math.max(0.2, f.conf - 0.2)); if (ok) this.stats.told++; return ok;
  }

  // ---------- affordances: what this person could do here and now, ranked by need and habit ----------
  affordances(id) {
    this.mover = id; const p = this.people[id], out = [];
    for (const a of this.actions) {
      if (a.who && !a.who.includes(id)) continue;
      const argsList = a.args ? a.args(this, p) : [null];
      for (const x of argsList) {
        const at = a.at ? a.at(this, p, x) : p.place;           // where the action happens (may need a walk)
        if (a.where && !a.where(this, p, x, at)) continue;
        if (a.when && !a.when(this, p, x)) continue;
        const cost = typeof a.cost === 'function' ? a.cost(this, p, x) : (a.cost || 0);
        if (cost > 0 && p.money < cost && !(a.onCredit && this.flags.creditBarker && p.money - cost >= -this.flags.creditBarker)) continue;   // on the slate only if Barker agreed
        const walk = this.travel(p.place, at);
        if (walk && at && !this.placeOpenAtArrival(at, walk)) continue;
        const u = this.utility(p, a, x, walk, cost), habit = !!(a.habit && a.habit(this, p, x));
        if (walk && u < 3 && !habit) continue;   // somewhere else entirely: only offered when it matters or is the usual thing
        out.push({ a, x, at, walk, cost, u, habit, label: a.label(this, p, x) + (walk ? ` (${walk} minutes' walk)` : '') });
      }
    }
    return out.sort((m, n) => n.u - m.u);
  }
  placeOpenAtArrival(at, walk) { const pl = this.places[at]; if (!pl?.open) return true; const save = this.t; this.t += walk; const ok = pl.open(this); this.t = save; return ok; }
  utility(p, a, x, walk, cost) {
    let u = typeof a.base === 'function' ? a.base(this, p, x) : (a.base || 0);
    const meets = typeof a.meets === 'function' ? a.meets(this, p, x) : (a.meets || {});
    for (const [k, v] of Object.entries(meets)) u += (p.needs[k] / 100) ** 2 * v;   // urgent needs count much more
    if (a.habit && a.habit(this, p, x)) u += 12;                                       // the usual thing at the usual time
    u -= walk * 0.15 + (cost / 12) * (p.money < 240 ? 1.2 : 0.2);                       // shillings weigh more when poor
    if (this.hooks && this.hooks.bonus) u += this.hooks.bonus(p, a, x) || 0;                // what the person is working towards
    return u;
  }

  // ---------- doing: apply cost, effect, needs; the person is busy for the duration ----------
  perform(id, aff) {
    this.mover = id; const p = this.people[id], a = aff.a;
    if (aff.walk) { const fr = require('./geo1931.js').fare(p.place, aff.at, id); if (fr && p.money >= fr) { p.money -= fr; this.stats.fares = (this.stats.fares || 0) + fr; } this.move(id, aff.at); }
    const dur = (typeof a.dur === 'function' ? a.dur(this, p, aff.x) : (a.dur ?? 15)) + aff.walk;
    if (aff.cost) this.pay(id, a.payee ? a.payee(this, p, aff.x) : null, aff.cost);
    const meets = typeof a.meets === 'function' ? a.meets(this, p, aff.x) : (a.meets || {});
    for (const [k, v] of Object.entries(meets)) p.needs[k] = Math.max(0, p.needs[k] - v);
    const result = a.effect ? a.effect(this, p, aff.x) : null;
    p.busyUntil = this.t + dur; p.doing = a.id;
    this.stats.performed[a.id] = (this.stats.performed[a.id] || 0) + 1;
    const seen = (a.seen ? a.seen(this, p, aff.x) : null) || (typeof result === 'string' ? result : null);
    if (seen) this.emit(p.place, seen, id);
    return result;
  }
}

// ======================= the engine as its own judge: snapshots, rollouts, urgency =======================
// A snapshot holds everything that changes (people's state, things, flags, time); the rules stay in `def`.
const DATA_KEYS = ['place', 'money', 'inv', 'needs', 'busyUntil', 'doing', 'away', 'ateAt', 'cleanedDay', 'finsburyDay', 'fins', 'readDay', 'worshipDay', 'walkDay', 'marketDay', 'visitDay', 'talked', 'know', 'savings', 'chem'];
World.prototype.snapshot = function () {
  const people = {};
  for (const [id, p] of Object.entries(this.people)) { people[id] = {}; for (const k of DATA_KEYS) if (p[k] !== undefined) people[id][k] = structuredClone(p[k]); }
  return { t: this.t, people, objects: structuredClone(this.objects), flags: structuredClone(this.flags) };
};
World.prototype.restore = function (snap) {
  this.t = snap.t; this.objects = Object.assign(this.objects || {}, structuredClone(snap.objects));   // things added to the world since the snapshot keep their first state
  this.flags = structuredClone(snap.flags);
  for (const [id, d] of Object.entries(snap.people)) if (this.people[id]) Object.assign(this.people[id], structuredClone(d));
  return this;
};
World.prototype.fork = function () {   // a copy of the world to try things in: same rules, same state, no effect on the original
  const w = new World(this.def, { T0: this.T0, days: this.ND, startMinute: this.t });
  w.queue = []; w.hooks = this.simHooks ? Object.assign(Object.create(this.simHooks), { w }) : this.hooks; w.simHooks = this.simHooks; w.coldSnap = this.coldSnap; w.weather = this.weather;
  for (const pl of Object.keys(this.places)) if (w.places[pl] && this.places[pl].warmth !== w.places[pl].warmth) w.places[pl] = { ...w.places[pl], warmth: this.places[pl].warmth };
  return w.restore(this.snapshot());
};
// what is pressing for a person now, and how bad it is (0-100); used to judge decisions and to make situations
World.prototype.urgency = function (id) {
  const p = this.people[id], n = p.needs, f = this.flags, out = [];
  if (n.hunger > 60) out.push({ key: 'hunger', w: n.hunger });
  if (n.warmth > 50) out.push({ key: 'cold', w: n.warmth });
  if (n.energy > 80) out.push({ key: 'tired', w: n.energy - 20 });
  if (id === 'ada' && f.rentDue) out.push({ key: 'rent', w: this.mod >= 18 * 60 ? 90 : 60 });
  if (p.money < 0) out.push({ key: 'debt', w: Math.min(80, 30 - p.money / 6) });
  if (id === 'ada' && !f.adaDismissed && this.dow() !== 'sun' && this.between(6 * 60 + 45, 8 * 60 + 30) && p.cleanedDay !== this.day) out.push({ key: 'work', w: 85 });
  if (id === 'arthur' && this.dow() !== 'sun' && this.between(8 * 60 + 15, 17 * 60) && p.place !== 'office' && !f.ill_arthur) out.push({ key: 'work', w: 60 });
  if (id === 'arthur' && f.joanIll && !f.doctorCalled) out.push({ key: 'child', w: 70 });
  return out.sort((a, b) => b.w - a.w);
};
// a person's lot as one number: money, needs met, duties kept, debts and arrears (higher is better)
World.prototype.lit = function (id) {   // can one see to sew or read here and now?
  const p = this.people[id]; const C = require('./chronos1931.js');
  if (!C.isDark(this.day, this.mod)) return true;
  if (p.place === 'ada_home') return this.flags.gas_ada_home > this.t || (this.count && this.count('ada', 'candles') > 0);
  return true;   // the Hales and Mr. Thomas pay for their gas by the quarter; shops and offices are lit
};
World.prototype.wellbeing = function (id) {
  const p = this.people[id], n = p.needs, f = this.flags;
  let v = Math.min(p.money, 480) / 12 - (n.hunger + n.warmth + n.energy) / 6 - (p.money < 0 ? 15 : 0);
  const unpaid = f.rentDue && this.t - (f.rentDueAt ?? this.t) > 3 * 60;   // due for hours and not settled: the collector went away with nothing
  if (id === 'ada') v -= (unpaid ? 35 : f.rentOwing ? 25 : 0) + (f.adaDismissed ? 60 : 0) + (this.objects.watch && this.objects.watch.at === 'sold' ? 20 : 0);
  if (id === 'arthur') v -= (f.joanIll && !f.doctorCalled ? (f.medicine_joan !== undefined || f.nursed_joan >= this.day - 1 ? 8 : 15) : 0);
  if (id === 'ada') v -= (f.ill_bert && !(f.medicine_bert !== undefined || f.nursed_bert >= this.day - 1) ? 6 : 0);
  if (id === 'ada') v += (f.extraWork ? 8 : 0) - (f.owesNolan ? 3 : 0) - (f.relief ? 6 : 0) - ['ring', 'kettle', 'coat', 'boots'].filter(x => this.objects[x] && this.objects[x].at === 'lamb').length * 3;
  // a theft: found out, it means the police court and the end of a character (and of a charwoman's places); not found out, the fear and the conscience
  const th = f['theft_' + id]; if (th) v -= th === 'caught' ? 60 : 20;
  if (f['summons_' + id] !== undefined) v -= 8;
  if (f['despair_' + id] !== undefined && this.day - f['despair_' + id] < 3) v -= 10;   // a summons for street betting: the fine and the shame
  return v;
};
// roll the world on from a fork: the person does `aff` (an affordance found in the fork) and then lives by habit
World.prototype.rollout = function (id, label, hours = 24) {
  const w = this.fork();
  const aff = label ? w.affordances(id).find(x => x.label === label || x.a.id === label) : null;
  if (label && !aff) return null;
  const before = w.wellbeing(id);
  if (aff && !aff.a.sideEffects) w.perform(id, aff); else if (aff) w.people[id].busyUntil = w.t + 15;
  const end = w.t + hours * 60;
  while (w.t < end) {
    w.t += 15; w.stepBackground(); w.decay(15);
    for (const p of Object.values(w.people)) if (p.main && p.busyUntil <= w.t) { const all = w.affordances(p.id), h = all.find(x => x.habit && !x.a.sideEffects) || all.find(x => ['rest', 'sleep', 'go_home'].includes(x.a.id)); if (h) w.perform(p.id, h); else p.busyUntil = w.t + 15; }   // afterwards: only habit, rest, home, sleep
  }
  return { label, after: w.wellbeing(id), gain: +(w.wellbeing(id) - before).toFixed(1), money: w.people[id].money, needs: { ...w.people[id].needs }, flags: { rentDue: w.flags.rentDue, rentOwing: w.flags.rentOwing, dismissed: w.flags.adaDismissed } };
};
// roll on after a deed built in the fork itself (free deeds from verbs.js): the engine judges any sentence it can place
World.prototype.rolloutDeed = function (id, build, hours = 24) {
  const w = this.fork(); const before = w.wellbeing(id); const r = build(w); if (!r || !r.aff) return null;
  w.perform(id, r.aff); const end = w.t + hours * 60;
  while (w.t < end) { w.t += 15; w.stepBackground(); w.decay(15); for (const p of Object.values(w.people)) if (p.main && p.busyUntil <= w.t) { const all = w.affordances(p.id), h = all.find(x => x.habit && !x.a.sideEffects) || all.find(x => ['rest', 'sleep', 'go_home'].includes(x.a.id)); if (h) w.perform(p.id, h); else p.busyUntil = w.t + 15; } }
  return { label: r.aff.label, after: w.wellbeing(id), gain: +(w.wellbeing(id) - before).toFixed(1), money: w.people[id].money, needs: { ...w.people[id].needs }, flags: { rentDue: w.flags.rentDue, rentOwing: w.flags.rentOwing, dismissed: w.flags.adaDismissed } };
};
// every course open to the person here and now, judged by rolling the world on: the engine's view of a decision
World.prototype.judge = function (id, hours = 24) {
  const opts = this.affordances(id).slice(0, 12);
  const res = opts.map(o => this.rollout(id, o.label, hours)).filter(Boolean).sort((a, b) => b.after - a.after);
  return { best: res[0], worst: res[res.length - 1], all: res, urgent: this.urgency(id) };
};
module.exports = { World, NEEDS };
