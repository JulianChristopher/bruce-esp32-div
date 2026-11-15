// Free actions: talkie says in its own words what a person does; this grammar of the world turns the sentence into
// world operations (go, eat, buy, ask, give, tell, write, pawn, work, rest, sleep, read, pray, walk) and the engine
// checks and carries them out. Nothing is invented here: places, people, goods and prices come from the world data.
// What the grammar cannot place becomes a private activity of half an hour, remembered in the person's own words.
'use strict';

// goods a person might name, where they are sold, and the price in pence (London, winter 1931, rounded)
const GOODS = [
  { re: /\b(bread|loaf|loaves|margarine|tea|bacon|food|groceries|provisions|something to eat)\b/, item: 'food', name: 'food for three meals', shop: 'chandler', price: 27, n: 3 },
  { re: /\b(coal|coals|fuel|firewood|kindling)\b/, item: 'coal', name: 'a hundredweight of coal', shop: 'chandler', price: 12, n: 4 },
  { re: /\b(candle|candles|matches|soap|paraffin|oil for the lamp)\b/, item: 'sundries', name: 'candles, matches and soap', shop: 'chandler', price: 5, n: 1 },
  { re: /\b(meat|sausages?|chop|mutton|beef|herrings?|fish)\b/, item: 'meat', name: 'a bit of meat', shop: 'market', price: 8, n: 1 },
  { re: /\b(milk|eggs?|butter|cheese)\b/, item: 'food', name: 'milk and eggs', shop: 'chandler', price: 6, n: 1 },
  { re: /\b(medicine|cough mixture|linctus|lozenges|physic)\b/, item: 'medicine', name: 'a bottle of cough mixture', shop: 'chandler', price: 9, n: 1 },
  { re: /\b(stamps?|postal order)\b/, item: 'stamp', name: 'a stamp', shop: 'post_office', price: 2, n: 1 },
  { re: /\b(sweets?|toffee|a doll|a toy|a present|a book for)\b/, item: 'present', name: 'a small present', shop: 'market', price: 12, n: 1 },
  { re: /\b(flowers?|violets)\b/, item: 'present', name: 'a bunch of violets', shop: 'market', price: 2, n: 1 }
];
// words for places; 'nearest' means: whichever of these kinds is closest
const PLACEWORDS = [
  [/\b(home|his house|her rooms|her room|indoors)\b/, 'HOME'], [/\b(bed)\b/, 'BED'],
  [/\b(office|clerks' room|his desk|work)\b/, 'office'], [/\b(finsbury)\b/, 'finsbury'],
  [/\b(market)\b/, 'market'], [/\b(barker'?s?|grocer'?s?|chandler'?s?|the shop)\b/, 'chandler'], [/\b(pawn ?shop|pawnbroker'?s?|lamb'?s|uncle'?s)\b/, 'pawnshop'],
  [/\b(chapel)\b/, 'chapel'], [/\b(church)\b/, 'church'], [/\b(pub|public-house|public house|tavern|lord nelson|inn)\b/, 'PUB'], [/\b(cookshop|eating-house|dining-room|lyons|tea-shop|teashop|caf[eé])\b/, 'EATOUT'],
  [/\b(docks?|dock gates)\b/, 'docks'], [/\b(doctor'?s?|surgery|dr\.? gray)\b/, 'doctor'], [/\b(post office)\b/, 'post_office'], [/\b(park|fields|heath)\b/, 'park'],
  [/\b(relieving office|the parish|public assistance)\b/, 'relieving_office'], [/\b(mrs\.? nolan|across the landing|neighbour'?s?)\b/, 'nolan_rooms'], [/\b(labour exchange|employment exchange)\b/, 'labour_exchange']
];
const PEOPLEWORDS = [
  [/\b(relieving officer|the parish|public assistance|mr\.? cobb|the relief)\b/, 'relieving'], [/\b(the minister|mr\.? hughes|the reverend)\b/, 'hughes'], [/\b(mrs\.? pollock|annie)\b/, 'mrspollock'], [/\b(mrs\.? simms)\b/, 'simms'], [/\b(mrs\.? nolan|kate nolan|her neighbour|the neighbour)\b/, 'nolan'], [/\b(bert|her son|the boy)\b/, 'bert'], [/\b(mr\.? barker|the grocer|the chandler)\b/, 'barker'],
  [/\b(mr\.? lamb|the pawnbroker)\b/, 'lamb'], [/\b(mr\.? gedge|the collector|the landlord|the rent-collector)\b/, 'gedge'], [/\b(edith|his wife|mrs\.? hale)\b/, 'edith'],
  [/\b(joan|his daughter|the child|the little girl)\b/, 'joan'], [/\b(fenn|the junior|the boy clerk)\b/, 'fenn'], [/\b(mrs\.? bray|his mother-in-law)\b/, 'bray'],
  [/\b(mr\.? hale|arthur)\b/, 'arthur'], [/\b(mr\.? thomas|the chief clerk|his chief)\b/, 'thomas'], [/\b(mrs\.? turner|ada|the charwoman)\b/, 'ada'], [/\b(lizzie|her sister)\b/, 'lizzie'], [/\b(dr\.? gray|the doctor)\b/, 'doctor']
];
const find = (list, t) => { for (const [re, v] of list) if (re.test(t)) return v; return null; };
const findAll = (list, t) => list.filter(([re]) => re.test(t)).map(([, v]) => v);

function parse(text) {
  const t = ' ' + (text || '').toLowerCase().replace(/[“”]/g, '"') + ' ';
  if (!text || t.trim().length < 4) return null;
  const person = findAll(PEOPLEWORDS, t), place = find(PLACEWORDS, t), good = GOODS.find(g => g.re.test(t));
  const has = re => re.test(t);
  // order matters: the most specific verbs first
  if (has(/\b(pawns?|pledges?|takes .{0,30} to (the )?(pawn|uncle|lamb))/)) return { verb: 'pawn', what: has(/watch/) ? 'watch' : has(/boots/) ? 'boots' : has(/coat|shawl/) ? 'coat' : has(/ring/) ? 'ring' : 'something', text };
  if (has(/\b(redeems?)\b/)) return { verb: 'redeem', text };
  if ((place === 'EATOUT' || place === 'PUB') && has(/\b(chop|dinner|lunch|meal|eats?|dines?|beer|tea|supper|steak|pie)\b/)) return { verb: 'eat', out: true, drink: has(/\b(beer|stout|porter|ale|glass of)\b/), text };
  if (has(/\b(writes?|pens?) (a )?(letter|note|line|card)|\bwrites to\b/)) return { verb: 'write', to: person[0] || null, text };
  if (has(/\bpays? (the |her |his )?(week'?s? )?rent\b/)) return { verb: 'rent', text };
  if (has(/\bpays? (the |her )?(wages|charwoman)\b/)) return { verb: 'wages', text };
  if (has(/\b(applies for relief|goes on the parish|asks for relief|goes to the relieving)/)) return { verb: 'ask', to: 'relieving', about: 'for relief', money: true, work: false, relief: true, text };
  if (has(/\b(puts? .{0,20}(in|into) the (post office|savings)|saves?|savings bank)\b/)) return { verb: 'save', text };
  if (has(/\b(asks?|begs?|beseeches|entreats|requests?|borrows?|applies to|appeals to)\b/)) return { verb: 'ask', to: person.find(p => p !== 'ada' || true) || null, about: t.replace(/^.*?\b(asks?|begs?|borrows?|requests?|applies to|appeals to)\b/, '').trim().slice(0, 120), money: has(/\b(lend|loan|borrow|shillings?|money|pence|credit|trust her|on tick|wait for)\b/), work: has(/\b(work|job|place|situation|employment|charing|cleaning)\b/), text };
  if (has(/\b(lends?|gives?|hands?|pays?|slips?)\b/) && person.length && !has(/\bgives? (it|her|him) up\b/)) return { verb: 'give', to: person[0], money: has(/\b(shillings?|money|pence|half-crown|sixpence|florin|coins?)\b/) || has(/\bpays?\b/), amount: (t.match(/\b(\d+|one|two|three|four|five|six|seven|ten)\s+(shillings?|pence)\b/) || [])[0] || null, what: good ? good.name : null, text };
  if (has(/\b(buys?|purchases?|gets? (himself|herself|a|some)|orders?|fetches)\b/) && good) return { verb: 'buy', good, text };
  if (has(/\b(goes to bed|to bed|lies down|sleeps?|turns in|retires for the night)\b/)) return { verb: 'sleep', text };
  if (has(/\b(eats?|dines?|has (his|her) (dinner|tea|supper|breakfast|lunch)|takes (his|her) (dinner|tea|supper|lunch)|goes out to (dinner|lunch)|a chop|a meal)\b/)) return { verb: 'eat', out: place === 'EATOUT' || place === 'PUB' || has(/\bgoes out\b|\bcookshop|tavern|lyons\b/), drink: has(/\b(beer|stout|porter|ale|glass of)\b/), text };
  if (has(/\b(talks?|speaks?|tells?|chats?|confides|consults?|goes (across|round) to see|visits?|calls on|sees)\b/) && person.length) return { verb: 'talk', to: person[0], about: t.replace(/^.*?\b(talks?|speaks?|tells?|chats?|confides|consults?|visits?|calls on|sees)\b/, '').trim().slice(0, 120), text };
  if (has(/\b(looks? for|seeks?|tries to find|goes after) (work|a job|a place|employment|more charing|a situation)\b/)) return { verb: 'seekwork', text };
  if (has(/\b(lights? the fire|makes up the fire|puts coal on|builds? a fire)\b/)) return { verb: 'fire', text };
  if (has(/\b(reads?|looks at the paper|the newspaper|the paper)\b/)) return { verb: 'read', text };
  if (has(/\b(prays?|goes to (church|chapel)|attends (service|church|chapel))\b/)) return { verb: 'pray', text };
  if (has(/\b(works?|scrubs?|cleans?|sweeps?|dusts?|sews?|mends?|darns?|washes|irons?|takes in washing|cooks?|tidies)\b/)) return { verb: 'work', home: !has(/\boffice|finsbury\b/), earn: has(/\btakes in washing|for money|to earn\b/), text };
  if (has(/\b(goes|walks?|hurries|runs?|sets? out|makes (his|her) way|takes the tram|returns?)\b/) && place) return { verb: 'go', place, text };
  if (has(/\b(sits?|rests?|warms (himself|herself)|dozes?|waits?)\b/)) return { verb: 'rest', text };
  if (has(/\b(walks?|strolls?|goes for a walk)\b/)) return { verb: 'walk', text };
  return { verb: 'other', text };
}
module.exports = { parse, GOODS, PLACEWORDS, PEOPLEWORDS };
