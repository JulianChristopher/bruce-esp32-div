// The world registry: places, people and things that did not exist until a deed needed them. Generate once, check,
// persist; from then on they belong to the world for everybody. The game master only proposes a kind and a short hint;
// the engine checks the kind, the district, the hours and the price against the period data; the period model (talkie)
// gives the new thing its name and its one-line description afterwards, so no modern words reach the characters.
'use strict';
const fs = require('fs'), path = require('path');
const OPS = require('./ops1931.js'), GEO = require('./geo1931.js');
const DISTRICTS = { bermondsey: [51.4972, -0.0730], moorgate: [51.5178, -0.0880], islington: [51.5395, -0.1050], highbury: [51.5500, -0.1000], southwark: [51.5030, -0.0920], 'london bridge': [51.5055, -0.0860], rotherhithe: [51.4990, -0.0520], 'old kent road': [51.4880, -0.0720] };
const LONDON = new Set(['bermondsey', 'southwark', 'rotherhithe', 'deptford', 'walworth', 'lambeth', 'camberwell', 'islington', 'highbury', 'holloway', 'finsbury', 'city', 'the city', 'moorgate', 'shoreditch', 'hackney', 'bethnal green', 'stepney', 'whitechapel', 'poplar', 'westminster', 'soho', 'holborn', 'clerkenwell', 'kensington', 'chelsea', 'battersea', 'london bridge', 'old kent road', 'new cross', 'peckham', 'kennington', 'st pancras', 'camden town', 'kentish town', 'stoke newington', 'limehouse', 'wapping', 'tower hill', 'aldgate', 'bow', 'mile end', 'canning town', 'greenwich', 'lewisham', 'brixton', 'vauxhall', 'marylebone', 'paddington', 'hampstead', 'fulham', 'hammersmith', 'strand', 'covent garden', 'bloomsbury', 'fleet street', 'charing cross', 'london', 'jamaica road', 'tower bridge road', 'dockhead', 'borough']);
const DISTRICT_OF = { southwark: 'bermondsey', 'london bridge': 'bermondsey', rotherhithe: 'bermondsey', 'old kent road': 'bermondsey' };
const HOURS = { shop: [8 * 60, 20 * 60], stall: [6 * 60, 20 * 60], market: [8 * 60, 19 * 60], cafe: [6 * 60, 22 * 60], pub: null, church: [8 * 60, 21 * 60], chapel: [8 * 60, 21 * 60], hall: [9 * 60, 21 * 60], office: [9 * 60, 17 * 60], works: [7 * 60, 18 * 60], school: [9 * 60, 16 * 60], hospital: null, park: [7 * 60, 19 * 60] };
// kinds as people name them, mapped to the kinds the engine knows (so the game master is not held to a word list)
const PLACE_MAP = [[/stall|barrow|pitch/, 'stall'], [/caf[eé]|coffee|cocoa|cook|eating|dining|fish|chip|tea-?room|tea ?shop|refreshment/, 'cafe'], [/pub|inn|tavern|beer|public-?house/, 'pub'],
  [/chapel|mission/, 'chapel'], [/church/, 'church'], [/hall|club|institute|union|lodge|settlement/, 'hall'], [/works|factory|wharf|dock|yard|warehouse|mill|tannery/, 'works'],
  [/market/, 'market'], [/school/, 'school'], [/hospital|infirmary|dispensary|clinic|surgery/, 'hospital'], [/park|fields|common|gardens?/, 'park'], [/lodging|doss|hostel|rowton/, 'lodging'],
  [/office|bureau|agency|lender|money|loan|bank|exchange/, 'office'], [/street|corner|bridge|stairs|pier|embankment|arch/, 'street'], [/home|house|rooms?|flat|tenement|buildings/, 'home'],
  [/shop|dealer|grocer|baker|butcher|chemist|draper|cobbler|tailor|ironmonger|oil|newsagent|tobacconist|dairy|greengrocer|pawn|store|emporium/, 'shop']];
const PERSON_MAP = [[/shop|grocer|baker|butcher|chemist|draper|publican|landlord of|proprietor/, 'shopkeeper'], [/stall|coster|hawker|barrow/, 'stall-keeper'], [/lender|money|tally|tallyman|bookie|collector|agent/, 'tradesman'],
  [/cobbler|tailor|tinker|sweep|carter|carman|plumber|joiner|mender|dealer|rag/, 'tradesman'], [/docker|labourer|porter|workman|navvy/, 'workman'], [/officer|inspector|clerk|policeman|constable|relieving|visitor/, 'official'],
  [/vicar|curate|priest|minister|parson|captain of the salvation|missioner/, 'clergyman'], [/nurse|midwife|district nurse/, 'nurse'], [/child|boy|girl|lad|kid/, 'child'],
  [/sister|brother|aunt|uncle|cousin|mother|father|niece|nephew/, 'relative'], [/friend|old pal|chum/, 'friend'], [/neighbour|woman next|lodger/, 'neighbour'], [/stranger|man|woman/, 'stranger']];
const THING_MAP = [[/coat|shawl|dress|boots?|shoes?|suit|hat|cap|apron|shirt|vest|gloves?|stockings?|petticoat|collar/, 'clothing'], [/clock|vase|ornament|picture|frame|china|figure|statuette|brass|candlestick/, 'ornament'],
  [/razor|hammer|saw|tool|plane|chisel|scissors|shears|iron/, 'tool'], [/ring|locket|brooch|medal|keepsake|lock of hair|photograph|bible|prayer-?book/, 'keepsake'], [/book|volume|dickens/, 'book'], [/doll|toy|top|ball/, 'toy'],
  [/chair|table|chest|bed|mattress|bedstead|stool|dresser/, 'furniture'], [/caddy|kettle|pot|pan|sheet|blanket|cloth|crockery|cup|plate|spoon|fork|knife|tray|lamp|mangle/, 'household']];
const mapKind = (list, s) => { const t = String(s || '').toLowerCase(); for (const [re, k] of list) if (re.test(t)) return k; return null; };
const slug = s => String(s || '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
class Registry {
  constructor(dir, opts = {}) { this.file = dir ? path.join(dir, 'registry.json') : null; this.items = []; this.today = {}; this.namer = opts.namer || null; this.pending = []; this.persist = opts.persist !== false; }
  load(w) { if (!this.file || !fs.existsSync(this.file)) return; try { this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')); for (const it of this.items) this.install(w, it); } catch (e) {} }
  save() { if (this.file && this.persist) try { fs.writeFileSync(this.file, JSON.stringify(this.items, null, 1)); } catch (e) {} }
  // a copy that checks and installs into a fork only (for trying a deed), never persisting, never naming
  trial() { const r = new Registry(null, { persist: false }); r.items = this.items; r.today = { ...this.today }; r.isTrial = true; return r; }
  install(w, it) {
    if (it.entity === 'place') {
      const [o, c] = it.hours || [null, null], sunday = it.kind === 'church' || it.kind === 'chapel' || it.kind === 'cafe' || it.kind === 'stall';
      w.places[it.id] = { name: it.name, kind: it.kind, district: it.district, warmth: ['street', 'stall', 'market', 'park', 'yard'].includes(it.kind) ? 15 : 50, registry: true,
        open: o === null || o === undefined ? undefined : (w2 => (sunday || w2.dow() !== 'sun') && w2.mod >= o && w2.mod < c) };
      if (it.coords) GEO.C[it.id] = it.coords;
    } else if (it.entity === 'person') {
      if (!w.people[it.id]) w.people[it.id] = { id: it.id, name: it.name, short: it.name, f: !!it.f, home: it.place || null, place: it.place || null, money: 60, inv: {}, rel: {}, know: {}, obs: [], busyUntil: 0, needs: { hunger: 20, energy: 10, warmth: 10, social: 20 },
        sheet: it.sheet || `${it.name}, ${it.kind} in ${it.district || 'the neighbourhood'}.`, routine: it.place ? (w2 => (w2.places[it.place] && (!w2.places[it.place].open || w2.places[it.place].open(w2)) ? it.place : null)) : (() => null), registry: true };
    } else if (it.entity === 'thing') {
      if (!w.objects[it.id]) w.objects[it.id] = { kind: it.kind, name: it.name, at: it.owner, value: it.value || 9, registry: true };
    }
  }
  // check a proposal ({entity, kind, hint, district, opens, closes, price, value}) and create it in world w
  propose(w, k, o) {
    const hint = String(o.hint || '').trim();
    if (!hint || hint.split(/\s+/).length > 14) return { ok: false, why: 'that is too vague a thing to find' };
    if (!OPS.periodOK(hint)) return { ok: false, why: 'there was no such thing in 1931' };
    const day = w.day; this.today[day] = (this.today[day] || 0) + 1; if (this.today[day] > 4) return { ok: false, why: 'the world has grown enough for one day' };
    const ent = o.entity, raw = String(o.kind || '').toLowerCase() + ' ' + hint.toLowerCase();
    const kind = ent === 'place' ? (OPS.PLACE_KINDS.includes(String(o.kind).toLowerCase()) ? String(o.kind).toLowerCase() : mapKind(PLACE_MAP, raw)) : ent === 'person' ? (OPS.PERSON_KINDS.includes(String(o.kind).toLowerCase()) ? String(o.kind).toLowerCase() : mapKind(PERSON_MAP, raw)) : (OPS.THING_KINDS.includes(String(o.kind).toLowerCase()) ? String(o.kind).toLowerCase() : mapKind(THING_MAP, raw));
    const p = w.people[k];
    // what the characters will see: the hint only if it is in the character's own words (ops: own), else the engine's kind
    const shownOf = (district) => (o.shown === undefined ? hint : o.shown) || `a ${kind}${district ? ' in ' + district[0].toUpperCase() + district.slice(1) : ''}`;
    // the same thing proposed again is the same thing: look for it first
    const same = this.items.find(it => it.entity === ent && it.kind === kind && ((it.raw || it.hint) === hint || (it.district === (o.district || '').toLowerCase() && slug(it.raw || it.hint) === slug(hint))));
    if (same) { if (!w.places[same.id] && !w.people[same.id] && !w.objects[same.id]) this.install(w, same); return { ok: true, id: same.id, text: '' }; }
    let it;
    if (ent === 'place') {
      if (!kind) return { ok: false, why: 'there was no such kind of place' };
      const dkey = String(o.district || '').toLowerCase().trim();
      if (dkey && !LONDON.has(dkey) && !DISTRICTS[dkey] && !DISTRICT_OF[dkey]) return { ok: false, why: 'that is out of London: a journey (away), not a walk' }; const district = DISTRICT_OF[dkey] || (DISTRICTS[dkey] ? dkey : (w.places[p.place] ? w.places[p.place].district : 'bermondsey'));
      const base = DISTRICTS[dkey] || DISTRICTS[district] || GEO.C[p.place] || DISTRICTS.bermondsey;
      const coords = [base[0] + (Math.random() - 0.5) * 0.004, base[1] + (Math.random() - 0.5) * 0.006];
      let hours = HOURS[kind] === undefined ? [8 * 60, 20 * 60] : HOURS[kind];
      if (hours && o.opens != null && o.closes != null) { const a = Math.round(+o.opens * 60), b = Math.round(+o.closes * 60); if (a >= 4 * 60 && b <= 24 * 60 && b - a >= 60) hours = [a, b]; }
      const shown = shownOf(district); it = { entity: 'place', id: 'reg_' + slug(hint), kind, hint: shown, raw: hint, district, coords, hours, name: shown.replace(/^(a|an)\s+/i, 'the '), day, by: k };
    } else if (ent === 'person') {
      if (!kind) return { ok: false, why: 'there was no such kind of person' };
      const place = o.at && w.places[o.at] ? o.at : null;
      const district = place ? w.places[place].district : (w.places[p.place] || {}).district, shown = shownOf(district);
      it = { entity: 'person', id: 'reg_' + slug(hint), kind, hint: shown, raw: hint, district, place, f: /\b(woman|wife|widow|girl|mrs|miss|landlady|mother|aunt|sister)\b/i.test(hint), name: shown.replace(/^(a|an)\s+/i, 'the '), day, by: k };
    } else if (ent === 'thing') {
      if (!kind) return { ok: false, why: 'there was no such kind of thing' };
      const mine = this.items.filter(x => x.entity === 'thing' && x.owner === k).length; if (mine >= 6) return { ok: false, why: `${p.f ? 'she' : 'he'} has nothing more of that kind` };
      const value = Math.max(3, Math.min(60, Math.round(+o.value || 9)));
      const shown = shownOf(null); it = { entity: 'thing', id: 'reg_' + slug(hint), kind, hint: shown, raw: hint, owner: k, value, name: shown.replace(/^(a|an|her|his)\s+/i, 'the '), day, by: k };
    } else return { ok: false, why: 'the world cannot grow that way' };
    if (w.places[it.id] || w.people[it.id] || w.objects[it.id]) it.id += '_' + day;
    this.install(w, it);
    if (!this.isTrial) { this.items.push(it); this.save(); if (this.namer) this.pending.push(it); }
    return { ok: true, id: it.id, text: '' };
  }
  // after the deed: the period model names and describes what was made (async; until then it keeps its plain hint)
  async nameNew(w) {
    const todo = this.pending.splice(0); for (const it of todo) { try { const r = await this.namer(it); if (r && r.name && OPS.periodOK(r.name)) { it.name = r.name; it.desc = r.desc || it.desc; this.install(w, it);
      if (w.places[it.id]) w.places[it.id].name = r.name; if (w.people[it.id]) { w.people[it.id].name = r.name; w.people[it.id].short = r.name; if (r.desc) w.people[it.id].sheet = r.desc; } if (w.objects[it.id]) w.objects[it.id].name = r.name; } } catch (e) {} }
    if (todo.length) this.save(); return todo;
  }
}
module.exports = { Registry, DISTRICTS };
