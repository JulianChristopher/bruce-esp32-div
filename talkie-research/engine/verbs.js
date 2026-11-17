// Composable deeds: a sentence becomes a frame (verb, things, person, place, amount, purpose), and a verb schema
// turns the frame into an engine action with general rules - so that deeds are combined, not listed.
// Every effect works only on the world it is given (w, p): the engine can therefore also try deeds out in its
// rollouts. Requests to others go through w.hooks.ask (the person asked answers in the live run; a rule of thumb
// in a rollout). Thousands of verb x thing x person x place x amount combinations come from ~40 schemas.
'use strict';
const { GOODS, goodsIn } = require('./goods1931.js'); const PROSE = require('./prose1931.js');
const PEOPLE = [
  [/\b(relieving officer|the parish|public assistance|mr\.? cobb)\b/, 'relieving'], [/\b(the minister|mr\.? hughes|the reverend)\b/, 'hughes'], [/\b(mrs\.? pollock|annie)\b/, 'mrspollock'],
  [/\b(mr\.? pollock|jim pollock)\b/, 'pollock'], [/\b(mrs\.? simms)\b/, 'simms'], [/\b(mrs\.? dunn|his housekeeper)\b/, 'dunn'], [/\b(mrs\.? nolan|kate nolan|her neighbour|the neighbour)\b/, 'nolan'],
  [/\b(bert|her son|the boy)\b/, 'bert'], [/\b(mr\.? barker|barker'?s?|the grocer|the chandler)\b/, 'barker'], [/\b(mr\.? lamb|the pawnbroker)\b/, 'lamb'], [/\b(mr\.? gedge|the collector|the landlord|the rent-collector)\b/, 'gedge'],
  [/\b(edith|his wife|mrs\.? hale)\b/, 'edith'], [/\b(joan|his daughter|the child|the little girl)\b/, 'joan'], [/\b(fenn|the junior|the office-boy)\b/, 'fenn'], [/\b(mrs\.? bray|his mother-in-law)\b/, 'bray'],
  [/\b(p\.? ?c\.? dawe|dawe|the constable|a constable|the policeman|a policeman|the copper|the police)\b/, 'pc'], [/\b(mr\.? hale|arthur)\b/, 'arthur'], [/\b(mr\.? thomas|the chief clerk|his chief)\b/, 'thomas'], [/\b(mrs\.? turner|ada|the charwoman)\b/, 'ada'], [/\b(dr\.? gray|the doctor)\b/, 'doctor']
];
const PLACES = [
  [/\b(home|his house|her rooms|her room|indoors)\b/, 'HOME'], [/\b(office|clerks' room|his desk|the city)\b/, 'office'], [/\bfinsbury\b/, 'finsbury'], [/\bmarket\b/, 'MARKET'],
  [/\b(barker'?s?|grocer'?s?|chandler'?s?|corner shop)\b/, 'SHOP'], [/\b(pawn ?shop|pawnbroker'?s?|lamb'?s|uncle'?s)\b/, 'pawnshop'], [/\bchapel\b/, 'chapel'], [/\bchurch\b/, 'church'],
  [/\b(pub|public-house|public house|tavern|lord nelson|inn)\b/, 'pub'], [/\b(cookshop|eating-house|lyons|tea-shop|teashop|caf[eé]|coffee-stall|fried fish shop|chip shop)\b/, 'EAT'],
  [/\b(docks?|dock gates)\b/, 'docks'], [/\b(doctor'?s?|surgery)\b/, 'doctor'], [/\b(post office)\b/, 'post_office'], [/\b(park|fields|heath)\b/, 'park'], [/\b(chemist'?s?|druggist)\b/, 'CHEMIST'],
  [/\b(baker'?s?)\b/, 'baker'], [/\b(newsagent'?s?|paper-shop|tobacconist'?s?)\b/, 'newsagent'], [/\b(labour exchange|employment exchange)\b/, 'labour_exchange'], [/\b(relieving office)\b/, 'relieving_office'],
  [/\b(mrs\.? nolan'?s?|across the landing)\b/, 'nolan_rooms'], [/\b(the pollocks'?|pollocks' rooms)\b/, 'pollock_rooms'], [/\b(street corner|bookie|bookmaker'?s? runner)\b/, 'street_corner'], [/\b(police[- ]station|the police)\b/, 'police_station'], [/\b(free library|public library|the library|reading-room)\b/, 'LIBRARY'], [/\b(wash-?house|public baths|the baths)\b/, 'washhouse'],
  [/\b(pictures|picture palace|picture house|cinema|kinema|blue hall)\b/, 'PICTURES'], [/\b(salvation army|the army hall|mission hall|the mission|soup kitchen)\b/, 'mission']
];
const ITEMS = [[/\bwatch\b/, 'watch'], [/\b(wedding[- ]ring|ring)\b/, 'ring'], [/\bkettle\b/, 'kettle'], [/\b(winter coat|coat|overcoat|greatcoat|top-?coat)\b/, 'coat'], [/\b(sunday boots|bert's boots|(a pair of |his |her |the )?boots)\b/, 'boots'], [/\b(medals?)\b/, 'medals'], [/\b(clock)\b/, 'clock'], [/\b(blankets?)\b/, 'blanket'],
  [/\b(sunday suit|bert'?s suit|his suit|the suit)\b/, 'suit'], [/\b(sheets?)\b/, 'sheets'], [/\b(flat-?irons?|irons)\b/, 'irons'], [/\b(bible)\b/, 'bible'], [/\b(sunday dress|black dress|best dress|her dress)\b/, 'dress'],
  [/\b(paisley shawl|her shawl|best shawl)\b/, 'shawl'], [/\b(wireless|radio)\b/, 'wireless'], [/\b(umbrella|brolly)\b/, 'umbrella'], [/\b(watch-?chain|chain)\b/, 'chain'], [/\b(dickens|his books|the books)\b/, 'books'],
  [/\b(brooch|cameo)\b/, 'brooch'], [/\b(sewing-?machine)\b/, 'machine']];
const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, 'thirty-five': 35, forty: 40, 'forty-five': 45, fifty: 50, half: 0.5 };
function moneyIn(t) {   // "two shillings", "half a crown", "sixpence", "five bob", "3s. 6d."
  let m = t.match(/(\d+)s\.?\s*(\d+)d/); if (m) return 12 * +m[1] + +m[2];
  if (/half[- ]a[- ]crown|half-crown/.test(t)) return 30; if (/\bsixpence\b/.test(t)) return 6; if (/\bthreepence\b/.test(t)) return 3; if (/\ba florin\b/.test(t)) return 24; if (/\ba (pound|sovereign|quid)\b/.test(t)) return 240;
  m = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|thirty-five|forty|forty-five|fifty)\s+(shillings?|bob|pence|pennies|coppers)\b/); if (m) { const n = +m[1] || WORDNUM[m[1]]; return /pence|penn|copper/.test(m[2]) ? n : n * 12; }
  m = t.match(/\b(\d+|a|one|two|three|four|five|ten)\s+pounds?\b(?! of)/); if (m) return (+m[1] || WORDNUM[m[1]]) * 240;
  return null;
}
const has = (t, re) => re.test(t), find = (list, t) => { for (const [re, v] of list) if (re.test(t)) return v; return null; }, findAll = (list, t) => list.filter(([re]) => re.test(t)).map(([, v]) => v);

// ---------------- the frame: who, what, to whom, where, how much, what for ----------------
function frame(text) {
  text = PROSE.present(text);   // the novel's past tense ('She pawned the watch') read as a deed
  const t = ' ' + (text || '').toLowerCase().replace(/[“”]/g, '"') + ' ';
  if (!text || t.trim().length < 4) return null;
  const persons = PEOPLE.map(([re, v]) => [v, (t.match(re) || { index: -1 }).index]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([v]) => v), place = find(PLACES, t), goods = goodsIn(t), item = find(ITEMS, t), amount = moneyIn(t);
  const purpose = (t.match(/\b(?:to|so as to|in order to|for)\s+(pay the rent|pay (?:the |her )?(?:debt|slate)|buy|keep warm|get coal|get food|bert|joan|the rent|supper|her (?:cough|cold|chest))\b[^.,;]*/) || [])[0] || null;
  const V = [
    ['despair', /\b(l(ies|ays?|ying) down to die|wants? to die|longs? (for death|to die)|waits? (for death|to die)|prays? to die|drown(s|ed|ing)? (her|him)self|commits? suicide|commit(ting)? suicide|suicide|thr(ows?|owing|ew) (her|him)self (in|into|off|from|under)|do(es)? away with (her|him)self|takes? (her|his) own life|kills? (her|him)self|makes? away with (her|him)self|puts? (her|his) head in the gas|gass(es|ed) (her|him)self|poisons? (her|him)self|ends? it all|(her|his) life is not worth)\b/],
    ['police', /\b(hands? (it|them|the [\w-]+) (in )?(at|to) the police|takes? (it|them|the [\w-]+) to the police|goes? to the police|reports? (it|this|the \w+)? ?to the police|tells? (a |the )?(policeman|constable|police)|fetch(es)? (a |the )?(policeman|constable|copper)|calls? (a |the )?(policeman|constable))\b/],
    ['match', /\b(goes to (see )?(the )?(match|football|millwall|the arsenal|arsenal|the den|highbury)|watch(es)? (the )?(match|football|millwall|the arsenal)|to the den\b|stands? on the terraces?)/],
    // going to, asking or consulting the doctor is calling the doctor in (before 'ask' and 'go' can take it)
    ['fetch', /\b(goes|hurries|runs|walks|calls|asks|consults|sees|visits|takes \w+|sends|fetches|fetch|goes for|calls in|sends for|summons|brings)\b[^.;]{0,30}?\b(the doctor|a doctor|dr\.? gray|the surgery|doctor's|medical (aid|man|advice)|the parish doctor)/],
    ['bet', /\b(puts? .{0,15}on a horse|backs? a horse|has a bet|bets?|a flutter)\b/], ['pawn', /\b(pawns?|pledges?|takes .{0,30} to (the )?(pawn|uncle|lamb))/], ['redeem', /\b(redeems?|gets? .{0,20} out of pawn)\b/],
    ['sell', /\b(sells?)\b/], ['borrow', /\b(borrows?|asks? .{0,30}\bto lend\b|asks? .{0,30}\bfor the loan of)\b/], ['lend', /\b(lends?)\b/], ['repay', /\b(pays? (him|her|mrs\.? \w+|mr\.? \w+) back|repays?)\b/], ['rent', /\bpays? (the |her |his )?(week'?s? )?rent\b/],
    ['borrow', /\b(borrows?|asks? .{0,30}\bto lend\b|asks? .{0,30}\bfor the loan of)\b/], ['ask', /\b(asks?|begs?|beseeches|entreats|requests?|applies to|appeals to|applies for)\b/],
    ['give', /\b(gives?|hands?|presents?|slips?|treats)\b/], ['send', /\bsends? (bert|joan|fenn|the boy|for)\b/], ['fetch', /\b(fetches|fetch|goes for|calls in|sends for) (the )?(doctor|dr\.? gray)\b/],
    ['nurse', /\b(nurses?|sits? (up )?(with|by|beside) .{0,20}(bed|joan|bert|edith)|looks? after|tends?)\b/], ['comfort', /\b(comforts?|soothes?|consoles?|cheers?)\b/],
    ['quarrel', /\b(quarrels?|scolds?|rows? with|has words with|reproaches|rebukes)\b/], ['apologise', /\b(apologi[sz]es?|begs .{0,10} pardon|says (she|he) is sorry)\b/], ['thank', /\b(thanks?)\b/],
    ['warn', /\b(warns?)\b/], ['promise', /\b(promises?)\b/], ['write', /\b(writes?|pens?) (a )?(letter|note|line|card)|\bwrites to\b/], ['post', /\b(posts?)\b/],
    ['buy', /\b(buys?|purchases?|gets? (himself|herself|a|some|in)|orders?|fetches|lays? in|stocks? up)\b/], ['eat', /\b(eats?|dines?|has (his|her) (dinner|tea|supper|breakfast|lunch)|takes (his|her) (dinner|tea|supper|lunch)|goes out to (dinner|lunch)|a meal|sups)\b/],
    ['drink', /\b(drinks?|has a (glass|pint|nip)|a drop of)\b/], ['smoke', /\b(smokes?|lights? (his|her) pipe|has a woodbine)\b/], ['cook', /\b(cooks?|boils?|fries?|makes (the )?(tea|supper|dinner|stew|broth))\b/],
    ['fire', /\b(lights? the fire|makes up the fire|puts coal on|builds? a fire|lights? a fire)\b/], ['mend', /\b(mends?|darns?|patches?|sews?|stitches)\b/], ['knit', /\b(knits?)\b/],
    ['wash', /\b(washes|washing|scrubs?|cleans?|sweeps?|dusts?|tidies|blacks the grate|whitens the step)\b/], ['seekwork', /\b(looks? for|seeks?|tries to find|goes after|asks? for) (more )?(work|a job|a place|employment|charing|cleaning|a situation)\b/],
    ['pray', /\b(prays?|goes to (church|chapel)|attends (service|church|chapel)|reads (her|his) bible)\b/], ['sing', /\b(sings?|hums?)\b/], ['play', /\b(plays?)\b/], ['read', /\b(reads?|looks at the paper)\b/],
    ['save', /\b(saves?|puts? .{0,20} by|puts? .{0,20}(in|into) the (post office|savings|tin|teapot))\b/], ['hide', /\b(hides?)\b/],
    ['steal', /\b(steals?|stole|stolen|pinch(es)?|nicks?|filch(es)?|pockets? .{0,20}(from|off) the|shop-?lifts?|robs?|helps? (herself|himself) to .{0,30}(from|off) the)\b/],
    ['gas', /\b(penny in the (gas[- ])?(meter|slot)|feeds? the meter|puts? .{0,10}in the meter|lights? the gas)\b/],
    ['telegram', /\b(telegraphs?|telegrams?|sends? a wire|wires (to )?\w+)\b/],
    ['reckon', /\b(reckons? up|counts? (up )?(her|his|the) (money|coppers|pence|savings)|goes? over (her|his|the) (accounts|books|money|account-book)|does (her|his) sums|adds? up (what|her|his))\b/],
    ['lookup', /\b(looks? (it |this |that )?up|consults? (a |the |her |his )?(book|encyclopaedia|enquire within|medical book|almanac|dictionary|library)|enquire within|looks? in (a |the |her |his )?(book|encyclopaedia|medical book|almanac|cookery-book|enquire within))/],
    ['pictures', /\b(goes to the pictures|to the pictures|takes .{0,20} to the pictures|picture palace|picture house|cinema|the films?|a film)\b/],
    ['library', /\b(free library|public library|the library|reading-room|changes? (her|his) (library )?book)\b/],
    ['mission', /\b(salvation army|army hall|mission hall|soup kitchen|the mission)\b/],
    ['talk', /\b(talks?|speaks?|tells?|chats?|confides|consults?|visits?|calls on|sees|goes (across|round|down) to (see )?)\b/],
    ['sleep', /\b(goes to bed|to bed|lies down|sleeps?|turns in|retires for the night)\b/], ['walk', /\b(walks?|strolls?|goes for a walk|takes (joan|the child) for a walk)\b/],
    ['go', /\b(goes|walks?|hurries|runs?|sets? out|makes (his|her) way|takes the tram|returns?|comes home)\b/], ['work', /\b(works?|gets on with|sets (himself|herself) to|copies|enters|balances?)\b/],
    ['rest', /\b(sits?|rests?|warms (himself|herself)|dozes?|waits?|thinks?|broods?|weeps?|cries)\b/]
  ];
  for (const [verb, re] of V) if (re.test(t)) {
    const vi = t.search(re); const after = persons.filter(q => { const m = PEOPLE.find(([, v]) => v === q); return t.slice(vi).match(m[0]); }); if (after.length) persons.splice(0, persons.length, ...after, ...persons.filter(q => !after.includes(q)));
    // a deed that is about a thing named after the verb: "goes to Barker's for coal" is buying coal
    if (verb === 'go' && goods.length && (place === 'SHOP' || place === 'MARKET' || place === 'CHEMIST' || place === 'baker' || place === 'newsagent' || /\bfor (some |a )?\w+/.test(t))) return { verb: 'buy', goods, amount, persons, place, purpose, text };
    if ((verb === 'go' || verb === 'talk') && place === 'EAT') return { verb: 'eat', out: true, goods, persons, place, text };
    return { verb, goods, item, amount, persons, place, purpose, text, out: place === 'EAT' || place === 'pub' };
  }
  return { verb: 'other', goods, item, amount, persons, place, purpose, text };
}
// neighbours from the street join the people the grammar knows by name
function addPerson(re, id) { if (!PEOPLE.some(([, v]) => v === id)) PEOPLE.unshift([re, id]); }
module.exports = { frame, moneyIn, PEOPLE, PLACES, ITEMS, addPerson };

// ---------------- schemas: from a frame to an engine deed (or the reason it cannot be done) ----------------
const KIND_PLACES = { LIBRARY: ['library', 'library_islington'], PICTURES: ['pictures', 'pictures_islington'], SHOP: ['chandler', 'islington_shop'], MARKET: ['market', 'market_islington'], EAT: ['cookshop', 'teashop', 'fishshop'], CHEMIST: ['chemist', 'chemist_islington'] };
const money = d => { d = Math.round(d); const P = Math.floor(Math.abs(d) / 240), s2 = Math.floor((Math.abs(d) % 240) / 12), p = Math.abs(d) % 12; return (d < 0 ? 'minus ' : '') + (P ? `£${P} ${s2}s. ${p}d.` : `${s2}s. ${p}d.`); };
function nearestOpen(w, p, ids) { return ids.filter(id => w.places[id] && w.placeOpenAtArrival(id, w.travel(p.place, id))).sort((a, b) => w.travel(p.place, a) - w.travel(p.place, b))[0] || null; }
function placeOf(w, p, f, fallback) {
  const pl = f.place; if (!pl) return fallback || p.place;
  if (pl === 'HOME') return p.home; if (KIND_PLACES[pl]) return nearestOpen(w, p, KIND_PLACES[pl]); return w.places[pl] ? pl : fallback || p.place;
}
const PN = (w, q) => (w.people[q] ? w.people[q].name : q);
const SHE = p => (p.f ? 'she' : 'he'), HER = p => (p.f ? 'her' : 'his');
function mk(w, p, id, label, at, dur, cost, effect, meets = {}) { const walk = at ? w.travel(p.place, at) : 0; return { a: { id: 'd_' + id, label: () => label, dur, meets, effect, free: false, deed: true }, x: null, at: at || p.place, walk, cost, u: 0, label: label + (walk ? ` (${walk} minutes' walk)` : '') }; }
function personHere(w, p, q) { const o = w.people[q]; if (!o || o.away) return { why: `${PN(w, q)} is not to be found just now` }; return { at: o.place }; }
// the effect of goods coming into a household: food and fuel into the larder, the rest kept as things
function stock(w, who, g, n = 1) { if (g.meals && !g.eatNow) w.add(who, 'food', Math.max(1, Math.round(g.meals * n))); else if (g.fuel) w.add(who, 'coal', Math.max(1, Math.round(g.fuel * n))); else w.add(who, g.id, n); }
function consume(w, p, g) { const n = p.needs; if (g.meals) n.hunger = Math.max(0, n.hunger - 60 * Math.min(1, g.meals)); if (g.warm) n.warmth = Math.max(0, n.warmth - 15 * g.warm); if (g.drink) n.social = Math.max(0, n.social - 15); }
function deed(w, k, f) {
  w.mover = k; const p = w.people[k], H = w.hooks;
  let q = f.persons && f.persons.find(x => x !== k && x !== 'doctor') || null;
  if (['ask', 'borrow'].includes(f.verb) && f.place === 'SHOP' && /trust|slate|tick|credit/.test(f.text.toLowerCase())) q = 'barker';   // asking for trust at Barker's is asking Barker
  const purse = c => p.money >= c || (w.flags.creditBarker && p.money - c >= -w.flags.creditBarker);
  switch (f.verb) {
    case 'buy': case 'send': {
      let gs = f.goods.length ? f.goods : [];
      if (!gs.length) { const m = f.text.match(/\b(?:buys?|purchases?|gets?|orders?|for)\s+(?:an ounce of |a pennyworth of |a halfpennyworth of |a quarter of |a pound of |a packet of |a bottle of |a |an |some |two )?([a-z][a-z' -]{2,30}?)(?=[.,;]| and | for | at | to | from |$)/i);
        if (!m || /\b(the|her|his|him|them|it|some|work|job|place|rent|money)\b/.test(m[1])) return { why: 'it is not clear what is to be bought' };
        const chem = /quinine|liniment|ointment|iodine|lint|syrup|tonic|powders?|lozenges?|salts/.test(m[1]);
        gs = [{ id: 'sundry', name: m[1].trim(), price: 3, shops: chem ? ['chemist', 'chemist_islington'] : ['chandler', 'islington_shop'], ...(chem ? { cure: 1 } : {}) }]; }
      const g = gs[0], at = f.verb === 'send' ? p.place : (f.place && !KIND_PLACES[f.place] && w.places[f.place] && g.shops.includes(f.place) ? f.place : nearestOpen(w, p, g.shops));
      if (!at) return { why: `nowhere that sells ${g.name} is open` };
      const cost = gs.reduce((s2, x) => s2 + x.price, 0); if (!purse(cost)) return { why: `${SHE(p)} has only ${money(Math.max(0, p.money))} and ${gs.map(x => x.name).join(' and ')} cost${gs.length > 1 ? '' : 's'} ${money(cost)}` };
      if (f.verb === 'send' && (!q || w.people[q].place !== p.place)) return { why: 'there is nobody here to send' };
      const forWhom = f.verb !== 'send' ? (f.persons || []).find(x => new RegExp(`\\bfor (?:${x}|${(w.people[x] ? w.people[x].short : x).toLowerCase()})`, 'i').test(f.text.toLowerCase()) || (x === 'joan' && /for (his daughter|the child)/i.test(f.text))) || null : null;
      return { aff: mk(w, p, f.verb, `${f.verb === 'send' ? `Send ${PN(w, q)} for` : 'Buy'} ${gs.map(x => x.name).join(' and ')}${forWhom ? ' for ' + PN(w, forWhom) : ''} (${money(cost)})`, at, f.verb === 'send' ? 5 : 15, cost, (w2, p2) => {
        for (const x of gs) { if (x.eatNow && !forWhom) consume(w2, p2, x); else if (forWhom && x.gift) { w2.hooks.rel && w2.hooks.rel(p2.id, forWhom, Math.min(2, x.gift / 2)); } else if (x.cure && forWhom) { w2.flags['medicine_' + forWhom] = w2.day; w2.hooks.nurse && w2.hooks.nurse(forWhom, 1); } else stock(w2, p2.id, x); }
        if (p2.money < 0 && w2.hooks.debt) w2.hooks.debt(p2.id, 'Barker');
        return `${p2.short} ${f.verb === 'send' ? 'sent ' + PN(w2, q) + ' for' : 'bought'} ${gs.map(x => x.name).join(' and ')}${forWhom ? ' for ' + PN(w2, forWhom) : ''}.`; }) };
    }
    case 'pawn': case 'sell': {
      // the thing named, as a kind ('watch', 'coat'), resolved to what this person actually has
      const own = o => w.objects[o].at === k && w.objects[o].value;
      let id = f.item ? (own(f.item) ? f.item : Object.keys(w.objects).find(o => own(o) && w.objects[o].kind === f.item) || f.item) : Object.keys(w.objects).find(own);
      // a thing the world has not listed ('the family spoons', 'her warm cloak'): every household had a few small things Lamb would take
      if (!f.item) { const m = f.text.match(/\b(?:pawns?|pledges?|sells?|takes)\s+((?:her|his|the|a|an|their|some)\s+[a-z' -]{3,30}?)(?=[.,;]| to | for | at | and |$)/i);
        if (m && /\b(letters?|note|paper|bread|food|loaf|coal)\b/.test(m[1])) return { why: `Lamb would not lend on ${m[1].trim().replace(/^(her|his|their)\s+/i, 'the ')}` };
        if (m && !/\b(watch|ring|money|shilling|things?|something|anything|bits|letters?|note|paper|ticket|bread|food|loaf)\b/.test(m[1])) {   // a thing the world has not listed: each its own small pledge
          // one thing is one thing: 'the other/second/third silver pencil' is the same pencil; the head noun decides
          const nm = m[1].trim().replace(/^(her|his|their|the|a|an|some)\s+/i, '').replace(/\b(other|another|second|third|fourth|fifth|last|remaining|old|best|little|own)\s+/gi, '').trim();
          const head = (nm.match(/([a-z]+)\s*$/i) || [])[1] || nm, same = Object.keys(w.objects).find(o => w.objects[o].kind === 'oddments' && new RegExp('\\b' + head + 's?\\b', 'i').test(w.objects[o].name));
          const mine = Object.keys(w.objects).filter(o => w.objects[o].kind === 'oddments' && w.objects[o].firstOwner === k).length;
          if (same) id = same;
          else if (mine >= 4) return { why: `${SHE(p)} has nothing more that Lamb would lend on` };   // a household's few small things are soon gone
          else { const oid = 'odd_' + nm.toLowerCase().replace(/[^a-z]+/g, '_'); w.objects[oid] = { kind: 'oddments', name: 'the ' + nm, at: k, value: 9, firstOwner: k }; id = oid; } } }
      const o = id && w.objects[id]; if (o && o.at === 'lamb') return { why: `${o.name} is in pawn at Lamb's already` }; if (!o || o.at !== k) return { why: `${SHE(p)} has nothing of that kind to ${f.verb}` };
      const at = f.verb === 'pawn' ? 'pawnshop' : placeOf(w, p, f, 'pawnshop'); if (!at || !w.placeOpenAtArrival(at, w.travel(p.place, at))) return { why: "the shop is shut" };
      const pay = f.verb === 'pawn' ? o.value : Math.round(o.value * 1.2);
      return { aff: mk(w, p, f.verb + '_' + id, `${f.verb === 'pawn' ? 'Pawn' : 'Sell'} ${o.name} for ${money(pay)}`, at, 20, 0, (w2, p2) => { const o2 = w2.objects[id]; o2.at = f.verb === 'pawn' ? 'lamb' : 'sold'; p2.money += pay; w2.hooks.remember(p2.id, `${p2.short} ${f.verb === 'pawn' ? 'pawned' : 'sold'} ${o2.name} for ${money(pay)}.`, ['money'], 3); return `${p2.short} ${f.verb === 'pawn' ? 'pawned' : 'sold'} ${o2.name}.`; }) };
    }
    case 'redeem': {
      const inPawn = o => w.objects[o].at === 'lamb'; const id = f.item ? (inPawn(f.item) ? f.item : Object.keys(w.objects).find(o => inPawn(o) && w.objects[o].kind === f.item) || f.item) : Object.keys(w.objects).find(inPawn); const o = id && w.objects[id];
      if (!o || o.at !== 'lamb') return { why: 'there is nothing in pawn to redeem' }; const c = Math.round(o.value * 1.1); if (p.money < c) return { why: `it costs ${money(c)} to redeem` };
      return { aff: mk(w, p, 'redeem_' + id, `Redeem ${o.name} for ${money(c)}`, 'pawnshop', 20, c, (w2, p2) => { w2.objects[id].at = p2.id; return `${p2.short} redeemed ${w2.objects[id].name}.`; }) };
    }
    case 'give': case 'lend': case 'repay': {
      if (!q) return { why: 'there is nobody to give it to' }; const o = personHere(w, p, q); if (o.why) return o;
      const amt = f.amount || (f.goods.length ? 0 : f.verb === 'repay' ? 24 : 12), g = f.goods[0];
      if (g && !(p.inv[g.id] > 0) && !(g.meals && p.inv.food > 0) && !(g.fuel && p.inv.coal > 0)) return { why: `${SHE(p)} has no ${g.name} to give` };
      if (amt && !purse(amt)) return { why: `${SHE(p)} has not ${money(amt)}` };
      return { aff: mk(w, p, f.verb, `${f.verb === 'lend' ? 'Lend' : f.verb === 'repay' ? 'Pay back' : 'Give'} ${PN(w, q)} ${g ? g.name : money(amt)}`, o.at, 5, amt, (w2, p2) => {
        if (amt) w2.people[q].money += amt; if (g) { if (g.meals) w2.add(p2.id, 'food', -1); else if (g.fuel) w2.add(p2.id, 'coal', -1); else w2.add(p2.id, g.id, -1); }
        if (f.verb === 'repay' && q === 'nolan') w2.flags.owesNolan = false; if (f.verb === 'lend') w2.flags['owes_' + q] = amt;
        w2.hooks.rel && w2.hooks.rel(p2.id, q, f.verb === 'repay' ? 1 : 1.5); return `${p2.short} ${f.verb === 'lend' ? 'lent' : f.verb === 'repay' ? 'paid back' : 'gave'} ${PN(w2, q)} ${g ? g.name : money(amt)}.`; }) };
    }
    case 'borrow': case 'ask': {
      if (!q) return { why: 'there is nobody to ask' }; const o = personHere(w, p, q); if (o.why) return o;
      const t = f.text.toLowerCase(), kind = q === 'relieving' || /relief|parish/.test(t) ? 'relief' : q === 'barker' && /slate|tick|trust|credit|owe/.test(t) ? 'credit' : /work|job|place|charing|cleaning/.test(t) ? 'work' : f.goods.length && !f.amount ? 'goods' : f.amount || /lend|loan|money|shilling|borrow/.test(t) ? 'loan' : /wait|time|till/.test(t) ? 'wait' : 'favour';
      if (kind === 'relief' && !w.isOpen('relieving_office')) return { why: 'the relieving office is shut' };
      return { aff: mk(w, p, 'ask_' + kind, `Ask ${PN(w, q)} ${f.text.replace(/^.*?\b(asks?|begs?|borrows?|requests?|applies to|appeals to|applies for)\b\s*(\w+\.? \w+ )?/i, '').replace(/\.$/, '').slice(0, 70)}`, kind === 'relief' ? 'relieving_office' : o.at, 15, 0, (w2, p2) => w2.hooks.ask(q, p2.id, kind, { amount: f.amount || 24, goods: f.goods.map(x => x.id), text: f.text }), { social: 20 }) };
    }
    case 'rent': { const a = w.affordances(k).find(x => x.a.id === 'pay_rent'); return a ? { aff: a } : { why: k !== 'ada' ? 'his rent is paid on Saturdays' : w.flags.rentDue ? 'the collector has not called yet' : 'the rent is not due' }; }
    case 'eat': case 'drink': {
      if (!f.out && f.verb === 'eat') { const a = w.affordances(k).find(x => x.a.id === 'eat_home'); if (a) return { aff: a }; if (p.place !== p.home) return { plan: true }; return { why: (p.inv.food || 0) <= 0 ? 'there is nothing in the house to eat' : 'it is not a meal-time' }; }
      const at = f.verb === 'drink' || f.place === 'pub' ? 'pub' : nearestOpen(w, p, ['cookshop', 'teashop', 'fishshop']); if (!at || !w.placeOpenAtArrival(at, w.travel(p.place, at))) return { why: 'nowhere is open' };
      const g = f.goods.find(x => x.eatNow) || (at === 'pub' ? require('./goods1931.js').GOODS.beer : p.money >= 12 ? require('./goods1931.js').GOODS.chop : require('./goods1931.js').GOODS.fishchips);
      if (!purse(g.price)) return { why: `${SHE(p)} has not ${money(g.price)}` };
      return { aff: mk(w, p, f.verb + '_out', `${f.verb === 'drink' ? 'Have' : 'Eat'} ${g.name} at ${w.places[at].name.replace(/^an? /, 'the ')} (${money(g.price)})`, at, 40, g.price, (w2, p2) => { consume(w2, p2, g); p2.ateAt = w2.t; return `${p2.short} had ${g.name} at ${w2.places[at].name}.`; }) };
    }
    case 'cook': { const a = w.affordances(k).find(x => x.a.id === 'eat_home'); if (a) return { aff: a }; if (p.place !== p.home) return { plan: true }; return { why: 'there is nothing in the house to cook' }; }
    case 'fire': { const a = w.affordances(k).find(x => x.a.id === 'light_fire'); return a ? { aff: a } : { why: k === 'ada' && (p.inv.coal || 0) <= 0 ? 'there is no coal' : 'the fire is in already' }; }
    case 'smoke': return (p.inv.woodbines || p.inv.tobacco) ? { aff: mk(w, p, 'smoke', 'Smoke a pipe', p.place, 15, 0, (w2, p2) => { w2.add(p2.id, p2.inv.woodbines ? 'woodbines' : 'tobacco', -1); p2.needs.social = Math.max(0, p2.needs.social - 5); return `${p2.short} smoked.`; }) } : { why: 'there is no tobacco' };
    case 'mend': case 'knit': {
      if (w.lit && !w.lit(k) && p.place === p.home) return { why: `it is too dark to see; there is no penny in the gas meter` };
      const need = f.verb === 'knit' ? 'wool' : 'thread'; if (!(p.inv[need] > 0) && !(f.verb === 'mend')) return { why: `${SHE(p)} has no ${need}` };
      if (p.place !== p.home) return { plan: true };
      return { aff: mk(w, p, f.verb, f.text.replace(/^(she|he)\s+/i, '').replace(/\.$/, '').replace(/^./, c => c.toUpperCase()).slice(0, 80), p.home, f.verb === 'knit' ? 120 : 60, 0, (w2, p2) => { if (f.verb === 'knit') { w2.add(p2.id, 'wool', -1); w2.add(p2.id, 'socks', 1); } if (q) w2.hooks.rel && w2.hooks.rel(p2.id, q, 0.5); return `${p2.short} ${f.verb === 'knit' ? 'knitted' : 'mended'} for a while.`; }) };
    }
    case 'wash': {
      if (f.place === 'washhouse' || /wash-?house|public baths/.test(f.text.toLowerCase())) { if (!w.placeOpenAtArrival('washhouse', w.travel(p.place, 'washhouse'))) return { why: 'the wash-house is shut' }; if (!purse(3)) return { why: 'not the threepence for the wash-house' };
        return { aff: mk(w, p, 'washhouse', 'Do the family wash at the public wash-house (3d.)', 'washhouse', 120, 3, (w2, p2) => { w2.flags['washed_' + p2.id] = w2.day; return `${p2.short} did the wash at the wash-house.`; }, { warmth: 30 }) }; }
      const earn = /washing for|takes in washing|char(es|ing) for|for money|to earn/.test(f.text.toLowerCase()) || (q && !['bert', 'joan', 'edith'].includes(q));
      if (p.place !== p.home && !earn && !/office|finsbury/.test(f.text.toLowerCase())) return { plan: true };
      return { aff: mk(w, p, earn ? 'washing' : 'clean', earn ? `Take in washing${q ? ' for ' + PN(w, q) : ''} (two hours, about 8d.)` : 'Clean and tidy the rooms', earn ? p.home : p.place, earn ? 120 : 45, 0, (w2, p2) => { if (earn) { p2.money += 8; p2.needs.energy = Math.min(100, p2.needs.energy + 20); } return earn ? `${p2.short} did a neighbour's washing for 8d.` : `${p2.short} cleaned the rooms.`; }) };
    }
    case 'seekwork': return { aff: mk(w, p, 'seekwork', 'Go round asking for more cleaning work', w.isOpen('labour_exchange') ? 'labour_exchange' : p.place, 120, 0, (w2, p2) => w2.hooks.ask('market', p2.id, 'work', { text: f.text })) };
    case 'fetch': { if (!w.flags.joanIll && !w.flags.ill_bert && !w.flags.ill_edith) return { why: 'nobody is ill' }; const at = 'doctor', night = !w.placeOpenAtArrival(at, w.travel(p.place, at)), fee = night ? 60 : 42;   // out of hours the doctor comes to the house, for five shillings
      if (!purse(fee)) return { why: `the doctor's fee is ${money(fee)}` };
      return { aff: mk(w, p, 'fetch_doctor', `Fetch Dr. Gray${night ? ' to the house' : ''} (${money(fee)})`, at, night ? 60 : 40, fee, (w2, p2) => { w2.flags.doctorCalled = true; w2.hooks.nurse && w2.hooks.nurse('joan', 2); return `${p2.short} fetched Dr. Gray.`; }) }; }
    case 'nurse': { const who = q || (k === 'ada' ? 'bert' : 'joan'); if (w.people[who] && w.people[who].place !== p.place && p.place !== p.home) return { plan: true };
      return { aff: mk(w, p, 'nurse', `Sit with ${PN(w, who)} and nurse ${who === 'bert' ? 'him' : 'her'}`, p.home, 60, 0, (w2, p2) => { w2.hooks.nurse && w2.hooks.nurse(who, 1); w2.flags['nursed_' + who] = w2.day; w2.hooks.rel && w2.hooks.rel(p2.id, who, 1); return `${p2.short} nursed ${PN(w2, who)}.`; }, { social: 30 }) }; }
    case 'comfort': case 'thank': case 'apologise': case 'quarrel': case 'warn': case 'promise': case 'talk': {
      if (!q) return f.verb === 'talk' ? { why: 'there is nobody to talk to' } : { aff: mk(w, p, 'muse', f.text.replace(/^(she|he)\s+/i, '').replace(/\.$/, '').slice(0, 80), p.place, 20, 0, (w2, p2) => `${p2.short} ${f.text.replace(/^(she|he)\s+/i, '').replace(/\.$/, '')}.`) };
      const o = personHere(w, p, q); if (o.why) return o;
      const d = { comfort: 1, thank: 1, apologise: 1.5, quarrel: -1.5, warn: -0.5, promise: 0.5, talk: 0 }[f.verb];
      return { aff: mk(w, p, f.verb, `${f.verb === 'talk' ? 'Speak to' : f.verb[0].toUpperCase() + f.verb.slice(1)} ${PN(w, q)}: ${f.text.replace(/^(he|she)\s+/i, '').slice(0, 70)}`, o.at, 15, 0, (w2, p2) => { w2.hooks.rel && w2.hooks.rel(p2.id, q, d); return { talk: q, topic: f.text.replace(/^(he|she)\s+\w+\s+/i, '').replace(/\.$/, '').slice(0, 100), verb: f.verb }; }, { social: 30 }) };
    }
    case 'write': case 'post': { if (!purse(2)) return { why: 'not the price of a stamp' }; return { aff: mk(w, p, 'write', `Write a letter${q ? ' to ' + PN(w, q) : ''}`, p.home, 40, 2, (w2, p2) => { w2.hooks.letter && w2.hooks.letter(p2.id, q, f.text); return `${p2.short} wrote a letter.`; }) }; }
    case 'bet': { const stake = f.amount || 6; if (!purse(stake)) return { why: 'not the money for a bet' };
      // street betting was against the law (Street Betting Act 1906): the runner kept watch for the constable; now and then a raid
      return { aff: mk(w, p, 'bet', `Put ${money(stake)} on a horse with the bookie's runner`, 'street_corner', 10, stake, (w2, p2) => {
        const pcThere = w2.people.pc && w2.people.pc.place === 'street_corner', raid = w2.hooks.chance ? w2.hooks.chance(pcThere ? 0.5 : 0.04) : false;
        if (raid) { const summoned = w2.hooks.chance ? w2.hooks.chance(0.3) : false; w2.flags['summons_' + p2.id] = summoned ? w2.day : w2.flags['summons_' + p2.id]; w2.hooks.remember && w2.hooks.remember(p2.id, `The police came down on the bookie's runner just as ${p2.short} was putting ${money(stake)} on a horse${summoned ? '; the constable took her name' : ''}.`, ['pc'], 3); w2.hooks.police && w2.hooks.police('raid', p2.id, summoned); return `${p2.short} was caught in a raid on the bookie's runner${summoned ? ' and summoned' : ''}.`; }
        const win = w2.hooks.chance ? w2.hooks.chance(1 / 6) : false; if (win) p2.money += stake * 6; return `${p2.short} put ${money(stake)} on a horse${win ? ' and won!' : ', and lost it'}.`; }) }; }
    case 'save': case 'hide': { const amt = f.amount || 12; if (p.money < amt) return { why: `${SHE(p)} has not ${money(amt)} to put by` }; return { aff: mk(w, p, 'save', `Put ${money(amt)} by${f.verb === 'hide' ? ' where nobody will find it' : ''}`, p.place, 5, amt, (w2, p2) => { w2.add(p2.id, 'savings', amt); return `${p2.short} put ${money(amt)} by.`; }) }; }
    case 'pray': { const a = w.affordances(k).find(x => x.a.id === 'worship'); return { aff: a || mk(w, p, 'pray', 'Pray quietly', p.place, 15, 0, (w2, p2) => `${p2.short} prayed.`) }; }
    case 'read': { if (w.lit && !w.lit(k) && p.place === p.home && !f.place) return { why: 'it is too dark to read; there is no penny in the gas meter' }; const a = w.affordances(k).find(x => x.a.id === 'read_paper'); return { aff: a || mk(w, p, 'read', 'Read for a while', p.place, 40, 0, (w2, p2) => `${p2.short} read for a while.`, { energy: 10 }) }; }
    case 'sing': case 'play': return { aff: mk(w, p, f.verb, f.text.replace(/^(she|he)\s+/i, '').replace(/\.$/, '').slice(0, 80), p.place, 30, 0, (w2, p2) => { if (q) w2.hooks.rel && w2.hooks.rel(p2.id, q, 0.5); return `${p2.short} ${f.verb === 'sing' ? 'sang' : 'played'} a while.`; }, { social: 20 }) };
    case 'sleep': { const a = w.affordances(k).find(x => x.a.id === 'sleep'); return { aff: a || mk(w, p, 'lie_down', 'Lie down for a while', p.home, 60, 0, (w2, p2) => `${p2.short} lay down.`, { energy: 30 }) }; }
    case 'rest': { const a = w.affordances(k).find(x => x.a.id === 'rest'); return { aff: a || mk(w, p, 'wait', 'Sit and think a while', p.place, 30, 0, (w2, p2) => `${p2.short} sat a while.`, { energy: 10 }) }; }
    case 'walk': return { aff: mk(w, p, 'walk', 'Take a walk', placeOf(w, p, f, p.place), 45, 0, (w2, p2) => `${p2.short} took a walk.`, { social: 5 }) };
    case 'work': { const a = w.affordances(k).find(x => ['desk_work', 'chief_work', 'clean_office', 'finsbury'].includes(x.a.id)); return a ? { aff: a } : { aff: mk(w, p, 'busy', f.text.replace(/^(she|he)\s+/i, '').replace(/\.$/, '').slice(0, 80), p.place, 60, 0, (w2, p2) => `${p2.short} was busy.`) }; }
    case 'go': {
      const pl = placeOf(w, p, f, null); if (!pl) return { why: 'there is nowhere of that kind open' };
      if (!w.placeOpenAtArrival(pl, w.travel(p.place, pl))) return { why: `${w.places[pl].name} would be shut` };
      return { aff: mk(w, p, 'go', `Go to ${w.places[pl].name}`, pl, 5, 0, (w2, p2) => `${p2.short} went to ${w2.places[pl].name}.`) };
    }
    case 'despair': {   // the world does not carry this out: she goes out in despair, and somebody finds her (see hooks.despair)
      return { aff: mk(w, p, 'despair', 'Go out in despair, towards the river', 'river', 45, 0, (w2, p2) => { w2.flags['despair_' + p2.id] = w2.day; return w2.hooks.despair ? w2.hooks.despair(p2.id) : `${p2.short} walked by the river a long while, and came home.`; }) };
    }
    case 'pictures': {   // the pictures: 4d. in the afternoon, 6d. in the evening, each; warm and dark for two hours and a half
      const at = nearestOpen(w, p, ['pictures', 'pictures_islington']); if (!at) return { why: 'the pictures are not open yet' };
      const with_ = q && w.people[q] && w.people[q].place === p.place ? q : null, each = w.mod < 17 * 60 ? 4 : 6, cost = each * (with_ ? 2 : 1);
      if (!purse(cost)) return { why: `${SHE(p)} has not ${money(cost)} for the pictures` };
      return { aff: mk(w, p, 'pictures', `Go to the pictures${with_ ? ' with ' + PN(w, with_) : ''} (${money(cost)})`, at, 150, cost, (w2, p2) => { p2.needs.warmth = Math.max(0, p2.needs.warmth - 30); if (with_ && w2.hooks.rel) w2.hooks.rel(p2.id, with_, 1.5); return `${p2.short} went to the pictures${with_ ? ' with ' + PN(w2, with_) : ''}.`; }, { social: 40 }) };
    }
    case 'library': {   // free, warm, the papers and the situations-vacant columns
      const at = nearestOpen(w, p, ['library', 'library_islington']); if (!at) return { why: 'the library is shut' };
      const vac = /situations|work|job|advertisements|vacant/.test(f.text.toLowerCase());
      return { aff: mk(w, p, 'library', vac ? 'Read the situations vacant in the free library' : 'Sit and read in the free library, out of the cold', at, 90, 0, (w2, p2) => { p2.needs.warmth = Math.max(0, p2.needs.warmth - 25); if (vac && w2.hooks.ask) return w2.hooks.ask('market', p2.id, 'work', { text: f.text }); return `${p2.short} sat in the library and read.`; }, { energy: 10 }) };
    }
    case 'mission': {   // the Salvation Army: a bowl of soup and a hymn, free, in the evening
      if (!w.isOpen('mission') && !w.placeOpenAtArrival('mission', w.travel(p.place, 'mission'))) return { why: 'the hall is not open' };
      return { aff: mk(w, p, 'mission', 'Go to the Salvation Army hall for soup and a hymn', 'mission', 60, 0, (w2, p2) => { p2.needs.hunger = Math.max(0, p2.needs.hunger - 35); p2.needs.warmth = Math.max(0, p2.needs.warmth - 20); w2.flags['charity_' + p2.id] = (w2.flags['charity_' + p2.id] || 0) + 1; return `${p2.short} had soup at the Salvation Army hall.`; }, { social: 15 }) };
    }
    case 'steal': {   // nothing in the world forbids it; the world answers it
      const g = f.goods[0], amt = !g ? (f.amount || 12) : 0, at = g ? (nearestOpen(w, p, g.shops) || p.place) : p.place;
      return { aff: mk(w, p, 'steal', `Steal ${g ? g.name : money(amt)}${at !== p.place ? ' from ' + w.places[at].name : ''}`, at, 10, 0, (w2, p2) => {
        const caught = w2.hooks.chance ? w2.hooks.chance(0.25) : false;
        w2.flags['theft_' + p2.id] = caught ? 'caught' : 'risk';
        if (!caught) { if (g) stock(w2, p2.id, g); else p2.money += amt; }
        // caught: the shopkeeper sends for the constable; the police court decides (a first offence of a woman with a
        // character was often bound over or fined); her employers hear of it only if the talk reaches them
        if (caught) { w2.flags['summons_' + p2.id] = w2.day; w2.hooks.police && w2.hooks.police('theft', p2.id, g ? g.name : money(amt)); }
        w2.hooks.remember && w2.hooks.remember(p2.id, caught ? `${p2.short} was caught taking ${g ? g.name : 'money'}; the constable took ${p2.f ? 'her' : 'his'} name, and ${p2.f ? 'she' : 'he'} must go before the magistrate at Tower Bridge.` : `${p2.short} took ${g ? g.name : money(amt)}, and nobody saw.`, [], 3);
        return caught ? `${p2.short} was caught stealing.` : `${p2.short} stole ${g ? g.name : money(amt)}.`; }) };
    }
    case 'match': {   // a home match today, at three o'clock; a shilling on the terraces (sixpence for boys)
      const CH = require('./chronos1931.js'), t = f.text.toLowerCase();
      const club = /arsenal|highbury/.test(t) ? 'Arsenal' : /millwall|the den/.test(t) ? 'Millwall' : (CH.homeGame(w.day, 'Millwall') ? 'Millwall' : 'Arsenal');
      const m = CH.homeGame(w.day, club); if (!m) return { why: `${club === 'Arsenal' ? 'the Arsenal are' : 'Millwall are'} not at home today` };
      const at = club === 'Arsenal' ? 'highbury_ground' : 'den'; if (!w.placeOpenAtArrival(at, w.travel(p.place, at))) return { why: 'the match is over, or not yet begun' };
      const with_ = q && w.people[q] && w.people[q].place === p.place ? q : null, cost = 12 * (with_ ? 2 : 1); if (!purse(cost)) return { why: `${SHE(p)} has not the shilling for the gate` };
      return { aff: mk(w, p, 'match', `Go to see ${CH.CLUB[club]} play ${CH.CLUB[m.away] || m.away}${with_ ? ' with ' + PN(w, with_) : ''} (${money(cost)})`, at, 150, cost, (w2, p2) => {
        const r = CH.resultWords(m); w2.hooks.remember && w2.hooks.remember(p2.id, `${p2.short} saw ${CH.CLUB[club]} play ${CH.CLUB[m.away] || m.away}: ${r}.`, with_ ? [with_] : [], 2);
        if (with_ && w2.hooks.rel) w2.hooks.rel(p2.id, with_, 1); return `${p2.short} went to the match: ${r}.`; }, { social: 35 }) };
    }
    case 'gas': { if (k !== 'ada') return { why: 'the gas is paid by the quarter' }; if (p.place !== p.home) return { plan: true }; if (!purse(1)) return { why: 'not a penny for the meter' };
      return { aff: mk(w, p, 'gas_penny', 'Put a penny in the gas meter for light', p.home, 2, 1, (w2) => { w2.flags.gas_ada_home = w2.t + 240; return 'Ada put a penny in the gas meter.'; }) }; }
    case 'telegram': {   // inland telegrams 1931: a shilling for twelve words, a penny a word beyond; delivered within the hour or two
      if (!q) return { why: 'there is nobody named to send it to' }; const at = nearestOpen(w, p, ['post_office', 'post_office_bermondsey']) || null; if (!at) return { why: 'the post office is shut' };
      if (!purse(12)) return { why: 'a telegram costs a shilling' };
      return { aff: mk(w, p, 'telegram', `Send a telegram to ${PN(w, q)} (1s. 0d.)`, at, 20, 12, (w2, p2) => { w2.hooks.letter && w2.hooks.letter(p2.id, q, f.text, { telegram: true }); return `${p2.short} sent a telegram to ${PN(w2, q)}.`; }) };
    }
    case 'reckon': {   // the account-book and the pencil: the engine does the sums, the person reads them in words
      return { aff: mk(w, p, 'reckon', 'Reckon up the money and what is owing', p.place, 15, 0, (w2, p2) => { const t = reckoning(w2, p2.id); w2.hooks.remember && w2.hooks.remember(p2.id, `${p2.short} reckoned up: ${t}`, [], 3); return `${p2.short} reckoned up: ${t}`; }) };
    }
    case 'lookup': {   // a book of the time answers (talkie, as the book); in a rollout it only costs the time
      const at = /library/.test(f.text.toLowerCase()) ? (nearestOpen(w, p, ['library', 'library_islington']) || p.place) : p.place;
      return { aff: mk(w, p, 'lookup', `Look it up in ${/library/.test(f.text.toLowerCase()) ? 'the free library' : k === 'ada' ? 'the old copy of Enquire Within' : 'the household encyclopaedia'}`, at, 30, 0, (w2, p2) => (w2.hooks.lookup ? w2.hooks.lookup(p2.id, f.text) : `${p2.short} looked it up.`) ) };
    }
    case 'police': {   // to the police: a thing found handed in, a row or a theft reported, the constable fetched
      const t = f.text.toLowerCase(), found = /hands?|takes?|found|half-crown|coin|purse|money/.test(t) && /(it|them|half-crown|coin|purse|money)/.test(t);
      const pcNear = w.people.pc && w.people.pc.place && w.travel(p.place, w.people.pc.place) <= 10, at = /fetch|call|tell/.test(t) && pcNear ? w.people.pc.place : 'police_station';
      return { aff: mk(w, p, 'police', found ? 'Hand it in at the police station as found property' : /fetch|call/.test(t) ? 'Fetch the constable' : /tell|speak/.test(t) && pcNear ? 'Speak to the constable on the beat' : 'Go to the police', at, found ? 30 : 20, 0, (w2, p2) => (w2.hooks.police ? w2.hooks.police(found ? 'found' : 'report', p2.id, f.text) : `${p2.short} went to the police.`)) };
    }
    default: return null;
  }
}
// the reckoning in words, from the engine's books: purse, slate, loans, pledges and when they fall due, the rent
function reckoning(w, k) {
  const p = w.people[k], f = w.flags, out = [`${money(Math.max(0, p.money))} in hand`];
  if (p.money < 0) out.push(`${money(-p.money)} owing on Barker's slate`);
  if (k === 'ada' && f.owesNolan) out.push('a loan owing to Mrs. Nolan');
  if (k === 'ada') out.push(f.rentOwing ? 'the rent of seven shillings owing' : f.rentDue ? 'the rent of seven shillings due tonight' : 'the rent of seven shillings due on Friday');
  for (const [id, o] of Object.entries(w.objects)) if (o.at === 'lamb' && (o.owner || 'ada') && (k === 'ada' ? !['overcoat', 'wireless', 'umbrella', 'chain', 'dickens', 'brooch', 'machine', 'goldwatch', 'clock'].includes(id) : ['overcoat', 'wireless', 'umbrella', 'chain', 'dickens', 'brooch', 'machine', 'clock'].includes(id))) out.push(`${o.name} in pawn, to be had back for ${money(Math.round(o.value * 1.1))}`);
  if (p.inv && p.inv.savings) out.push(`${money(p.inv.savings)} put by`);
  if (k === 'ada') out.push(`food for ${p.inv.food || 0} meals and coal for ${p.inv.coal || 0} fires`);
  return out.join('; ') + '.';
}
module.exports.deed = deed; module.exports.reckoning = reckoning;
module.exports.placeOf = placeOf;
