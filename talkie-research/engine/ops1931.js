// Open deeds: a deed is a short program of primitive operations on the grounded variables of the world (time, place,
// money, things, the body, relations, knowledge, the calendar). The game master composes the program from a free
// sentence; the engine tries it on a copy of the world, operation by operation, and either commits it or says why not.
// There is no list of verbs here: what can be done is whatever these primitives can express, and the world itself
// (the registry) can grow when a deed needs something that does not exist yet.
//
// Primitives (each an object with `op`):
//   go       {to}                                  walk (or ride) to a place; time from geography
//   wait     {minutes}                             spend time where one is (work at something, sit, talk)
//   buy      {what, qty, at, pence?}               goods from a shop, stall or market that is open; known goods at the
//                                                  price of the day; unknown goods at a checked price
//   pay      {to, pence, for}                      money to a person who is here (or to an institution: rent, fare)
//   earn     {pence, minutes, for}                 casual earnings for time worked (bounded by the rates of 1931)
//   give     {thing, qty, to}                      a thing, food or coal to a person who is here
//   use      {thing, qty}                          eat food, burn coal, use up a thing
//   pledge   {thing}  /  redeem {thing}            at the pawnbroker's, when it is open
//   sell     {thing, at}                           to a dealer or the pawnbroker
//   need     {need, delta}                         hunger, warmth, energy, social (bounded)
//   relate   {with, delta}                         how two people stand (bounded)
//   request  {of, kind, pence?, what?}             ask someone for something; THEY decide (the period model speaks
//                                                  for them): loan, credit, goods, work, wait, favour, help, relief
//   talk     {with, topic}                         a conversation (the period model speaks both parts)
//   create   {entity, kind, hint, district?, opens?, closes?, price?, value?}   something new in the world
//   schedule {in_hours, event, who?, pence?, note?}   something that will happen later
//   away     {days, pence, for}                    a journey out of London (relatives, the hop-gardens, the sea): gone for days
//   despair  {}                                    never carried out; the world answers it
'use strict';
const G = require('./goods1931.js');
const money = d => { d = Math.round(d); const s = Math.floor(Math.abs(d) / 12), p = Math.abs(d) % 12, P = Math.floor(Math.abs(d) / 240); return (d < 0 ? 'minus ' : '') + (P ? `£${P} ${Math.floor((Math.abs(d) % 240) / 12)}s. ${p}d.` : `${s}s. ${p}d.`); };
// words that cannot appear in 1931 (modern things and turns of phrase); anything the game master names passes this gate
const MODERN = /\b(television|telly|tv|teen-?ager|okay|ok|supermarket|fridge|freezer|microwave|computer|internet|e-?mail|mobile|cell ?phone|smartphone|nylon|polyester|t-?shirt|sneakers?|trainers|jeans|jet|jeep|radar|penicillin|antibiotics?|nhs|welfare state|benefits? office|job ?centre|social worker|supermarket|takeaway|take-away|fast food|burger|pizza|coffee shop|latte|cappuccino|vending|credit card|debit|cash ?machine|atm|plastic bag|ballpoint|biro|zip ?code|postcode|motorway|flyover|car park|traffic lights?|bus stop|tube station|council estate|tower block|high-rise|evacuee|blitz|ration book|identity card|gas mask|air-raid|wartime|post-?war|stressed|depression \(illness\)|counsel(l)?ing|therapy|okay)\b/i;
const periodOK = s => !MODERN.test(String(s || '')) && !/[£$]\s?\d+\.\d\d/.test(String(s || ''));
const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const NEEDS = ['hunger', 'warmth', 'energy', 'social'];
const PLACE_KINDS = ['shop', 'stall', 'market', 'cafe', 'pub', 'church', 'chapel', 'hall', 'office', 'works', 'street', 'home', 'school', 'hospital', 'park', 'yard', 'lodging'];
const PERSON_KINDS = ['neighbour', 'shopkeeper', 'stall-keeper', 'tradesman', 'workman', 'official', 'relative', 'friend', 'stranger', 'child', 'clergyman', 'nurse'];
const THING_KINDS = ['clothing', 'household', 'ornament', 'tool', 'keepsake', 'book', 'toy', 'furniture'];
const EVENTS = ['repay', 'visit', 'letter', 'court', 'collect', 'return', 'deliver', 'meet', 'work'];
const REQUESTS = ['loan', 'credit', 'goods', 'work', 'wait', 'favour', 'help', 'relief'];
// ---------------------------------------------------------------------------------------------------------------
// the price of unknown goods: within a band for its kind (pence), else the deed is refused
const BAND = { food: [1, 24], drink: [1, 12], fuel: [1, 30], clothing: [3, 120], household: [1, 60], medicine: [1, 36], paper: [1, 6], toy: [1, 36], tobacco: [1, 12], other: [1, 60] };
function kindOfGoods(what) { const t = (what || '').toLowerCase();
  return /bread|loaf|meat|fish|egg|tea|sugar|milk|cheese|bacon|potato|vegetable|fruit|jam|pie|cake|bun|soup|cocoa|coffee|faggot|pudding|saveloy|whelk|winkle|cocoa/.test(t) ? 'food'
    : /beer|stout|ale|gin|rum|whisk/.test(t) ? 'drink' : /coal|coke|wood|kindling|paraffin|oil|candle|match/.test(t) ? 'fuel' : /shirt|coat|boot|shoe|dress|shawl|sock|stocking|vest|hat|cap|glove|apron|collar/.test(t) ? 'clothing'
    : /pill|powder|mixture|ointment|liniment|lozenge|medicine|tonic|salts/.test(t) ? 'medicine' : /paper|stamp|envelope|postcard/.test(t) ? 'paper' : /tobacco|woodbine|cigarette|snuff/.test(t) ? 'tobacco' : /doll|toy|ball|top/.test(t) ? 'toy' : /soap|soda|brush|pail|cloth|needle|thread|pot|pan|kettle|cup|plate|blacklead|polish/.test(t) ? 'household' : 'other'; }
// ---------------------------------------------------------------------------------------------------------------
// provenance: words the characters will read come only from the character's own sentence, the world's names, or the
// engine's own vocabulary. A text field the game master writes (for, topic, what, hint) is kept only if every content
// word in it has such a source; otherwise it is replaced by the character's own clause (narration) or dropped.
const PROSE = require('./prose1931.js');
const STOP = new Set(('a an the and or but nor of to in on at for from with by as is are was were be been being his her hers their theirs its it he she they him them this that these those ' +
  'one some any no not into over under up down out off about than then so very just only own same other another such what which who whom whose when where while because if till until after before ' +
  'again also there here all both each few more most much many little less can could will would shall should may might must do does did done has have had having get gets got make makes made ' +
  'go goes went take takes took give gives gave say says said tell tells told ask asks asked come comes came put puts back way day now well good bit few lot').split(' '));
const ENGINE_WORDS = ('shop stall market cafe pub church chapel hall office works street home school hospital park yard lodging neighbour shopkeeper stall-keeper tradesman workman official relative friend ' +
  'stranger child clergyman nurse clothing household ornament tool keepsake book toy furniture loan credit goods work wait favour help relief rent fare collection doctor club insurance burial ' +
  'penny pence pennies shilling shillings half-crown florin sovereign pound pounds halfpenny farthing hour hours minute minutes morning afternoon evening night today tomorrow week letter post ' +
  'bermondsey southwark islington highbury moorgate london bridge rotherhithe road food coal wages money');
const stem = x => x.replace(/'s$/, '').replace(/-/g, '').replace(/ies$/, 'y').replace(/(?<=[a-z]{3})(es|s)$/, '').replace(/(?<=[a-z]{3})(ing|ed)$/, '');
const wordsOf = s => (String(s || '').toLowerCase().match(/[a-z][a-z'-]*/g) || []);
const ENGINE = new Set(wordsOf(ENGINE_WORDS).map(stem));
function vocabOf(w) { const v = new Set(); const add = s => { for (const x of wordsOf(s)) v.add(stem(x)); };
  for (const p of Object.values(w.people || {})) add(p.name + ' ' + (p.short || '')); for (const pl of Object.values(w.places || {})) add(pl.name);
  for (const o of Object.values(w.objects || {})) add(o.name); for (const g of (Array.isArray(G.GOODS) ? G.GOODS : Object.values(G.GOODS || {}))) add(g.name); return v; }
const PROV = { kept: 0, replaced: 0, dropped: 0 };
function own(text, sentence, vocab, mode) {   // mode 'narrate': fall back to the character's own clause; else drop
  if (!text) return null; const sent = String(sentence || '');
  const said = new Set(wordsOf(sent).map(stem)); const content = wordsOf(text).filter(x => x.length > 2 && !STOP.has(x));
  if (content.length && content.every(x => { const y = stem(x); return said.has(y) || ENGINE.has(y) || (vocab && vocab.has(y)); }) && periodOK(text)) { PROV.kept++; return String(text).slice(0, 80); }
  if (mode !== 'narrate') { PROV.dropped++; return null; }
  const clauses = sent.replace(/^(she|he)\s+/i, '').replace(/\.$/, '').split(/[,;]|\band then\b|\bthen\b|\band\b/i).map(c => c.trim()).filter(c => c.length > 3);
  let best = null, bs = 0; for (const c of clauses) { const cw = new Set(wordsOf(c).map(stem)); const n = content.filter(x => cw.has(stem(x))).length; if (n > bs) { bs = n; best = c; } }
  if (best) { PROV.replaced++; return PROSE.past(best.charAt(0).toLowerCase() + best.slice(1)).slice(0, 80); } PROV.dropped++; return null;
}
const GOODS_WORDS = { food: 'some food', drink: 'something to drink', fuel: 'some firing', clothing: 'some clothing', household: 'some household things', medicine: 'some medicine', paper: 'some paper', toy: 'a toy', tobacco: 'some tobacco', other: 'a few things' };
// ---------------------------------------------------------------------------------------------------------------
// check and apply one program on a world `w` (a fork when checking); returns { ok, why, minutes, text[] }
function run(w, k, ops, ctx = {}) {
  const p = w.people[k], text = [], H = w.hooks || {}; let minutes = 0, ret = null;
  const here = q => w.people[q] && !w.people[q].away && w.people[q].place === p.place;
  const fail = why => ({ ok: false, why, minutes, text });
  const newIds = []; let VOC = null; const OWN = (t, mode) => own(t, ctx.sentence, VOC || (VOC = vocabOf(w)), mode);
  const ref = x => (x === '$new' || x === '$new0') ? newIds[0] : /^\$new(\d)$/.test(x || '') ? newIds[+x.slice(4)] : x;
  if (!Array.isArray(ops) || !ops.length) return fail('nothing is done');
  if (ops.length > 8) return fail('too much at once');
  let gone = false;
  for (const raw of ops) {
    if (gone) break;
    const o = { ...raw }; for (const key of ['to', 'at', 'with', 'of', 'thing', 'who']) if (o[key]) o[key] = ref(o[key]);
    switch (o.op) {
      case 'despair': return { ok: true, despair: true, minutes, text };
      case 'away': {   // out of London: by train or carrier, for some days; the person leaves the stage and comes back
        const days = clip(Math.round(+o.days || 1), 1, 21), fare = Math.round(+o.pence || 0);
        if (fare < 4 || fare > 480) return fail('that is not the fare for such a journey');
        if (p.money < fare) return fail(`${p.f ? 'she' : 'he'} has not the fare`);
        p.money -= fare; minutes += 45; w.t += 45; const where = OWN(o.for);
        if (ctx.scheduler && H.away) H.away(k, days, where);   // only in the real world: the person is gone till the return
        text.push(`went away${where ? ' (' + where + ')' : ''} for ${days === 1 ? 'the day' : days + ' days'}, the fare ${money(fare)}`); gone = true; break;
      }
      case 'go': {
        if (!o.to || !w.places[o.to]) return fail(`there is no such place as ${o.to || 'that'}`);
        const walk = w.travel(p.place, o.to, k); if (w.places[o.to].open && !w.placeOpenAtArrival(o.to, walk)) return fail(`${w.places[o.to].name} would be shut`);
        w.move(k, o.to); w.t += walk; minutes += walk; text.push(`went to ${w.places[o.to].name}`); break;
      }
      case 'wait': { const m = clip(+o.minutes || 15, 5, 240); w.t += m; minutes += m; const f = OWN(o.for, 'narrate'); if (f) text.push(f.slice(0, 60)); break; }
      case 'buy': {
        const at = o.at && w.places[o.at] ? o.at : p.place; const pl = w.places[at];
        if (at !== p.place) { const walk = w.travel(p.place, at, k); if (pl.open && !w.placeOpenAtArrival(at, walk)) return fail(`${pl.name} would be shut`); w.move(k, at); w.t += walk; minutes += walk; }
        else if (pl.open && !w.isOpen(at)) return fail(`${pl.name} is shut`);
        if (!/shop|market|stall|cafe|pub|chandler|chemist|baker|post|news/.test(pl.kind + ' ' + at)) return fail(`nothing is sold at ${pl.name}`);
        const qty = clip(Math.round(+o.qty || 1), 1, 12), known = G.goodsIn(o.what || '')[0];
        if (!periodOK(o.what)) return fail('no such thing is to be had');
        let price = known ? known.price : Math.round(+o.pence || 0);
        const band = BAND[known ? 'food' : kindOfGoods(o.what)]; if (!known && (price < band[0] || price > band[1])) return fail(`such a thing would not cost ${money(price)}`);
        price = Math.round(price * (ctx.priceFactor || 1)) * qty;
        const credit = w.flags.creditBarker && at === 'chandler' ? w.flags.creditBarker : 0;
        if (p.money - price < -credit) return fail(`${p.f ? 'she' : 'he'} has only ${money(Math.max(0, p.money))}, and that costs ${money(price)}`);
        p.money -= price; minutes += 10; w.t += 10;
        if (known) { if (known.eatNow) { p.needs.hunger = Math.max(0, p.needs.hunger - 50 * Math.min(1, known.meals || 0.3)); } else if (known.meals) w.add(k, 'food', Math.max(1, Math.round(known.meals * qty))); else if (known.fuel) w.add(k, 'coal', Math.max(1, Math.round(known.fuel * qty))); else w.add(k, known.id, qty); }
        const gname = known ? known.name : (OWN(o.what) || GOODS_WORDS[kindOfGoods(o.what)]);
        if (!known) { const kind = kindOfGoods(o.what); if (kind === 'food') w.add(k, 'food', qty); else if (kind === 'fuel') w.add(k, 'coal', qty); else w.add(k, gname.toLowerCase().slice(0, 30), qty); }
        text.push(`bought ${qty > 1 ? qty + ' × ' : ''}${gname} (${money(price)})`); break;
      }
      case 'pay': {
        const pence = Math.round(+o.pence || 0); if (pence <= 0 || pence > 2400) return fail('that sum makes no sense');
        if (p.money < pence) return fail(`${p.f ? 'she' : 'he'} has not ${money(pence)}`);
        if (o.to && w.people[o.to]) { if (!here(o.to)) return fail(`${w.people[o.to].name} is not here`); w.people[o.to].money += pence; }
        else if (!['rent', 'fare', 'collection', 'club', 'doctor', 'insurance', 'burial club'].includes(String(o.to || o.for || '').toLowerCase())) return fail('there is nobody here to pay');
        p.money -= pence; const pf = OWN(o.for); text.push(`paid ${o.to && w.people[o.to] ? w.people[o.to].name + ' ' : ''}${money(pence)}${pf ? ' for ' + pf.slice(0, 40) : ''}`); break;
      }
      case 'earn': {
        const m = clip(+o.minutes || 60, 15, 480), pence = Math.round(+o.pence || 0);
        if (pence <= 0) return fail('nothing is earned');
        if (pence > Math.ceil(m / 60 * 8) + 2) return fail(`nobody would pay ${money(pence)} for ${Math.round(m / 60 * 10) / 10} hours' work`);   // casual work: about 4-8d. an hour in 1931
        if (w.mod + m > 22 * 60) return fail('it is too late in the day for work');
        p.money += pence; w.t += m; minutes += m; p.needs.energy = Math.min(100, p.needs.energy + m / 12);
        const ef = OWN(o.for, 'narrate'); text.push(`earned ${money(pence)}${ef ? ' (' + ef.slice(0, 50) + ')' : ''}`); break;
      }
      case 'give': {
        if (!o.to || !w.people[o.to]) return fail('there is nobody to give it to'); if (!here(o.to)) return fail(`${w.people[o.to].name} is not here`);
        const qty = clip(Math.round(+o.qty || 1), 1, 20), t = String(o.thing || '').toLowerCase();
        const stockKey = /food|bread|meal|loaf|supper|dinner/.test(t) ? 'food' : /coal|fuel|lumps?/.test(t) ? 'coal' : null;
        if (stockKey) { if (w.count(k, stockKey) < Math.min(qty, 1)) return fail(`${p.f ? 'she' : 'he'} has no ${stockKey} to give`); w.add(k, stockKey, -Math.min(qty, w.count(k, stockKey))); w.add(o.to, stockKey, Math.min(qty, 3)); }
        else if (w.objects[o.thing] && w.objects[o.thing].at === k) w.objects[o.thing].at = o.to;
        else if (p.inv[t] > 0) { w.add(k, t, -1); w.add(o.to, t, 1); }
        else return fail(`${p.f ? 'she' : 'he'} has no ${o.thing || 'such thing'} to give`);
        if (H.rel) H.rel(k, o.to, 0.5); text.push(`gave ${w.people[o.to].name} ${stockKey ? (stockKey === 'coal' ? 'some coal' : 'some food') : (w.objects[o.thing] ? w.objects[o.thing].name : o.thing)}`); break;
      }
      case 'use': {
        const t = String(o.thing || '').toLowerCase(), qty = clip(Math.round(+o.qty || 1), 1, 3);
        if (/food|meal|bread|supper|dinner|breakfast|tea/.test(t)) { if (w.count(k, 'food') < 1) return fail('there is nothing to eat'); w.add(k, 'food', -1); p.needs.hunger = Math.max(0, p.needs.hunger - 55); w.t += 25; minutes += 25; text.push('had a meal'); }
        else if (/coal|fire/.test(t)) { if (w.count(k, 'coal') < 1) return fail('there is no coal'); if (p.place !== p.home) return fail('the coal is at home'); w.add(k, 'coal', -1); w.flags['fire_' + p.home] = w.t + 240; p.needs.warmth = Math.max(0, p.needs.warmth - 30); text.push('lit the fire'); }
        else if (p.inv[t] > 0) { w.add(k, t, -qty); text.push(`used the ${t}`); }
        else return fail(`${p.f ? 'she' : 'he'} has no ${o.thing || 'such thing'}`);
        break;
      }
      case 'pledge': case 'sell': case 'redeem': {
        const at = o.op === 'sell' && o.at && w.places[o.at] ? o.at : 'pawnshop'; const walk = w.travel(p.place, at, k);
        if (!w.placeOpenAtArrival(at, walk)) return fail(`${w.places[at].name} would be shut`);
        const id = Object.keys(w.objects).find(x => x === o.thing) || Object.keys(w.objects).find(x => (w.objects[x].name || '').toLowerCase().includes(String(o.thing || '~').toLowerCase()));
        const ob = id && w.objects[id];
        if (o.op === 'redeem') { if (!ob || ob.at !== 'lamb') return fail('there is nothing of that kind in pawn'); const c = Math.round(ob.value * 1.1); if (p.money < c) return fail(`it costs ${money(c)} to redeem`); w.move(k, at); w.t += walk; minutes += walk + 15; p.money -= c; ob.at = k; text.push(`redeemed ${ob.name} (${money(c)})`); break; }
        if (!ob) return fail(`${p.f ? 'she' : 'he'} has nothing of that kind`); if (ob.at === 'lamb') return fail(`${ob.name} is in pawn already`); if (ob.at !== k) return fail(`${ob.name} is not ${p.f ? 'hers' : 'his'} to ${o.op}`);
        w.move(k, at); w.t += walk; minutes += walk + 15; const pay = o.op === 'sell' ? Math.round(ob.value * 1.2) : ob.value; p.money += pay; ob.at = o.op === 'sell' ? 'sold' : 'lamb';
        text.push(`${o.op === 'sell' ? 'sold' : 'pawned'} ${ob.name} (${money(pay)})`); break;
      }
      case 'need': { if (!NEEDS.includes(o.need)) return fail('no such need'); const d = clip(+o.delta || 0, -40, 30); p.needs[o.need] = clip(p.needs[o.need] + d, 0, 100); break; }
      case 'relate': { if (!o.with || !w.people[o.with]) return fail('no such person'); if (H.rel) H.rel(k, o.with, clip(+o.delta || 0, -2, 2)); break; }
      case 'request': {
        if (!o.of || !w.people[o.of]) return fail('there is nobody to ask'); if (!REQUESTS.includes(o.kind)) return fail('that is not a thing one asks for');
        if (!here(o.of) && o.kind !== 'relief') return fail(`${w.people[o.of].name} is not here`);
        const rw = OWN(o.what); if (H.ask) ret = H.ask(o.of, k, o.kind, { text: ctx.sentence || '', amount: o.pence || null, what: rw });
        text.push(`asked ${w.people[o.of].name} for ${o.kind === 'goods' ? (rw || 'a little help') : o.kind}`); w.t += 10; minutes += 10; break;
      }
      case 'talk': { if (!o.with || !w.people[o.with]) return fail('there is nobody to talk to'); if (!here(o.with)) return fail(`${w.people[o.with].name} is not here`); ret = { talk: o.with, topic: OWN(o.topic) }; w.t += 15; minutes += 15; break; }
      case 'create': {
        if (!ctx.registry) return fail('the world cannot grow here');
        const r = ctx.registry.propose(w, k, { ...o, shown: OWN(o.hint) }); if (!r.ok) return fail(r.why); newIds.push(r.id); text.push(r.text || ''); break;
      }
      case 'schedule': {
        if (!EVENTS.includes(o.event)) return fail('no such event'); const hrs = clip(+o.in_hours || 24, 1, 720);
        if (o.who && !w.people[o.who]) return fail('no such person');
        if (ctx.scheduler) ctx.scheduler(w, k, { ...o, for: OWN(o.for), note: null, said: ctx.sentence || '', at: w.t + hrs * 60 });
        text.push(''); break;
      }
      default: return fail(`unknown operation ${o.op}`);
    }
    if (minutes > 480) return fail('that would take the whole day');
  }
  return { ok: true, minutes, text: text.filter(Boolean), ret };
}
// try a program on a fork, then build an affordance that applies it to the real world when chosen
function deedOf(w, k, ops, ctx = {}) {
  const f = w.fork(); f.places = Object.assign({}, f.places);   // what a trial creates stays in the trial
  const trial = run(f, k, ops, { ...ctx, registry: ctx.registry && ctx.registry.trial ? ctx.registry.trial() : ctx.registry, scheduler: null });
  if (!trial.ok) return { why: trial.why };
  if (trial.despair) return { despair: true };
  const p = w.people[k], label = (ctx.label || trial.text.join(', ') || 'Do as she said').slice(0, 120);
  const aff = { a: { id: 'gm_deed', label: () => label, dur: Math.max(5, trial.minutes), meets: {}, deed: true, gm: true,
    effect: (w2, p2) => {   // in the real world: the registry creates for good and events are scheduled; in a fork (the engine's foresight) only trials
      const real = w2 === w; if (!real) w2.places = Object.assign({}, w2.places);
      const t0 = w2.t; const r = run(w2, p2.id, ops, real ? ctx : { ...ctx, registry: ctx.registry && ctx.registry.trial ? ctx.registry.trial() : null, scheduler: null }); w2.t = t0; if (!r.ok) return `${p2.short} meant to ${(ctx.sentence || 'do something').replace(/^(she|he)\s+/i, '').replace(/\.$/, '')}, but ${r.why}.`;
      if (r.ret && r.ret.talk) return r.ret; return `${p2.short} ${r.text.join(', ')}.`; } },
    x: null, at: p.place, walk: 0, cost: 0, u: 0, label };
  return { aff, minutes: trial.minutes, preview: trial.text };
}
module.exports = { own, vocabOf, PROV, run, deedOf, periodOK, PLACE_KINDS, PERSON_KINDS, THING_KINDS, EVENTS, REQUESTS, BAND, kindOfGoods, money };
