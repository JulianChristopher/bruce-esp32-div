// Goods of a London working-class and clerical household, winter 1931: price in pence (rounded to the penny),
// where sold, and what the thing does in the world. Prices are approximate, after period price lists and the
// New Survey of London Life and Labour (1929-31); a halfpenny is rounded up.
//   meals: meals' worth of food for two  fuel: fires' worth  warm: helps against cold when worn
//   cure: helps the sick  gift: pleases the one who gets it  drink: alcohol  smoke: tobacco  light/clean/mend: household
'use strict';
const SHOPS = {
  grocer: ['chandler', 'islington_shop'], coal: ['chandler'], market: ['market', 'market_islington'], baker: ['baker', 'islington_shop'],
  butcher: ['market', 'market_islington'], chemist: ['chemist', 'chemist_islington'], draper: ['market', 'market_islington'], news: ['newsagent', 'islington_shop', 'post_office'],
  pub: ['pub'], eating: ['cookshop', 'teashop', 'fishshop'], post: ['post_office'], pawn: ['pawnshop'], toy: ['market', 'market_islington'], flowers: ['market', 'market_islington']
};
const G = [
  // food
  ['loaf', 'a quartern loaf', 9, 'baker', { meals: 1 }], ['bread', 'a loaf of bread', 5, 'grocer', { meals: 1 }], ['margarine', 'half a pound of margarine', 3, 'grocer', { meals: 0.5 }],
  ['tea', 'a quarter of tea', 6, 'grocer', { meals: 0.3 }], ['sugar', 'a pound of sugar', 3, 'grocer', { meals: 0.2 }], ['milk', 'a pint of milk', 3, 'grocer', { meals: 0.3 }],
  ['condensed', 'a tin of condensed milk', 5, 'grocer', { meals: 0.5 }], ['bacon', 'a quarter of bacon', 4, 'grocer', { meals: 0.7 }], ['cheese', 'a quarter of cheese', 3, 'grocer', { meals: 0.5 }],
  ['eggs', 'two eggs', 3, 'grocer', { meals: 0.5 }], ['jam', 'a pound pot of jam', 6, 'grocer', { meals: 0.5 }], ['dripping', 'a basin of dripping', 2, 'grocer', { meals: 0.5 }],
  ['herrings', 'two herrings', 2, 'market', { meals: 1 }], ['sausages', 'half a pound of sausages', 4, 'butcher', { meals: 1 }], ['mutton', 'a scrag of mutton', 8, 'butcher', { meals: 2 }],
  ['potatoes', 'three pounds of potatoes', 2, 'market', { meals: 1 }], ['cabbage', 'a cabbage', 1, 'market', { meals: 0.5 }], ['onions', 'a pound of onions', 1, 'market', { meals: 0.3 }],
  ['oranges', 'two oranges', 2, 'market', { meals: 0.2, cure: 1 }], ['groceries', 'bread, margarine, tea and a bit of bacon', 27, 'grocer', { meals: 3 }],
  ['fishchips', 'fish and chips', 3, 'eating', { meals: 0.5, eatNow: 1 }], ['pie', 'a hot meat pie', 2, 'eating', { meals: 0.5, eatNow: 1 }], ['chop', 'a chop and potatoes', 12, 'eating', { meals: 1, eatNow: 1 }],
  ['cuptea', 'a cup of tea', 1, 'eating', { warm: 1, eatNow: 1 }], ['bun', 'a bun', 1, 'eating', { meals: 0.2, eatNow: 1 }],
  // drink and tobacco
  ['beer', 'a pint of beer', 6, 'pub', { drink: 1, eatNow: 1 }], ['stout', 'a glass of stout', 4, 'pub', { drink: 1, eatNow: 1 }], ['gin', 'a nip of gin', 4, 'pub', { drink: 2, eatNow: 1 }],
  ['woodbines', 'a packet of five Woodbines', 2, 'news', { smoke: 5 }], ['tobacco', 'half an ounce of shag tobacco', 5, 'news', { smoke: 5 }],
  // fuel, light, household
  ['coal', 'a hundredweight of coal', 12, 'coal', { fuel: 4 }], ['coalsmall', 'fourteen pounds of coal', 2, 'coal', { fuel: 1 }], ['firewood', 'a bundle of firewood', 1, 'coal', { fuel: 0.5 }],
  ['paraffin', 'a pint of paraffin', 2, 'grocer', { light: 1 }], ['candles', 'two candles', 2, 'grocer', { light: 1 }], ['matches', 'a box of matches', 1, 'grocer', { light: 0.2 }],
  ['soap', 'a bar of soap', 2, 'grocer', { clean: 1 }], ['soda', 'a pound of washing soda', 1, 'grocer', { clean: 1 }],
  ['thread', 'a reel of cotton and a needle', 2, 'draper', { mend: 1 }], ['wool', 'two ounces of knitting wool', 4, 'draper', { mend: 2 }], ['laces', 'a pair of boot-laces', 1, 'draper', { mend: 0.5 }],
  // clothing (second-hand on the market)
  ['shawl', 'a second-hand woollen shawl', 24, 'draper', { warm: 3 }], ['boots', 'a pair of second-hand boots', 36, 'draper', { warm: 2 }], ['vest', 'a woollen vest', 15, 'draper', { warm: 2 }],
  ['gloves', 'a pair of woollen gloves', 9, 'draper', { warm: 1 }],
  // medicine
  ['aspirin', 'a packet of aspirin', 3, 'chemist', { cure: 1 }], ['cough', 'a bottle of cough mixture', 9, 'chemist', { cure: 2 }], ['beechams', "a box of Beecham's pills", 15, 'chemist', { cure: 1 }],
  ['camphor', 'camphorated oil for a chest', 6, 'chemist', { cure: 2 }], ['bandage', 'a bandage', 3, 'chemist', { cure: 1 }],
  // paper, post, small pleasures, gifts
  ['paper', 'an evening paper', 1, 'news', { read: 1 }], ['stamp', 'a stamp', 2, 'post', { post: 1 }], ['postcard', 'a picture postcard', 1, 'news', { post: 1, gift: 1 }],
  ['notepaper', 'notepaper and an envelope', 1, 'news', { post: 1 }], ['storybook', 'a story-book for a child', 6, 'news', { gift: 3, read: 1 }], ['doll', 'a doll with a china face', 30, 'toy', { gift: 5 }],
  ['sweets', 'a quarter of sweets', 2, 'news', { gift: 2, meals: 0.1 }], ['toffee', 'a bar of toffee', 1, 'news', { gift: 1 }], ['flowers', 'a bunch of violets', 2, 'flowers', { gift: 2 }],
  ['ribbon', 'a hair-ribbon', 1, 'draper', { gift: 1 }], ['pencils', 'a box of coloured pencils', 4, 'news', { gift: 2 }]
];
const GOODS = Object.fromEntries(G.map(([id, name, price, shop, props]) => [id, { id, name, price, shop, shops: SHOPS[shop], ...props }]));
// words by which people name the goods (also generic words: "food", "something to eat", "medicine", "a present")
const WORDS = [
  [/\bquartern loaf\b/, 'loaf'], [/\b(loaf|bread)\b/, 'bread'], [/\bmargarine\b/, 'margarine'], [/\btea\b(?! ?-?shop)/, 'tea'], [/\bsugar\b/, 'sugar'], [/\bcondensed milk\b/, 'condensed'], [/\bmilk\b/, 'milk'],
  [/\bbacon\b/, 'bacon'], [/\bcheese\b/, 'cheese'], [/\beggs?\b/, 'eggs'], [/\bjam\b/, 'jam'], [/\bdripping\b/, 'dripping'], [/\bherrings?|kippers?|bloaters?\b/, 'herrings'], [/\bsausages?\b/, 'sausages'],
  [/\b(mutton|beef|meat|stew)\b/, 'mutton'], [/\bpotato(es)?\b/, 'potatoes'], [/\bcabbage|greens\b/, 'cabbage'], [/\bonions?\b/, 'onions'], [/\boranges?\b/, 'oranges'],
  [/\bfish and chips|fried fish\b/, 'fishchips'], [/\bpies?\b/, 'pie'], [/\bchop\b/, 'chop'], [/\bcup of tea\b/, 'cuptea'], [/\bbuns?\b/, 'bun'],
  [/\b(beer|ale|porter|pint)\b/, 'beer'], [/\bstout\b/, 'stout'], [/\b(gin|spirits?|whisk(e)?y|rum)\b/, 'gin'], [/\b(woodbines?|cigarettes?|fags?)\b/, 'woodbines'], [/\b(tobacco|baccy|pipe)\b/, 'tobacco'],
  [/\b(hundredweight|cwt)\b/, 'coal'], [/\bcoals?\b/, 'coal'], [/\b(firewood|kindling|sticks)\b/, 'firewood'], [/\bparaffin|lamp-oil\b/, 'paraffin'], [/\bcandles?\b/, 'candles'], [/\bmatches\b/, 'matches'],
  [/\bsoap\b/, 'soap'], [/\bsoda\b/, 'soda'], [/\b(thread|cotton|needle)\b/, 'thread'], [/\b(wool|worsted)\b/, 'wool'], [/\blaces\b/, 'laces'],
  [/\bshawl\b/, 'shawl'], [/\bboots?\b/, 'boots'], [/\bvest\b/, 'vest'], [/\bgloves|mittens\b/, 'gloves'],
  [/\baspirin\b/, 'aspirin'], [/\b(cough mixture|linctus|syrup)\b/, 'cough'], [/\bbeecham'?s\b|\bpills\b/, 'beechams'], [/\bcamphor/, 'camphor'], [/\bbandage\b/, 'bandage'], [/\b(medicine|physic|something for (her|his|the) (cough|cold|chest))\b/, 'cough'],
  [/\b(newspaper|evening paper|the paper)\b/, 'paper'], [/\bstamps?\b/, 'stamp'], [/\bpostcard\b/, 'postcard'], [/\b(notepaper|envelope)\b/, 'notepaper'], [/\b(story-?book|picture-book|book for joan)\b/, 'storybook'],
  [/\bdoll\b/, 'doll'], [/\bsweets?|bull'?s-eyes|humbugs\b/, 'sweets'], [/\btoffee\b/, 'toffee'], [/\b(flowers|violets|snowdrops)\b/, 'flowers'], [/\bribbon\b/, 'ribbon'], [/\bpencils\b/, 'pencils'],
  [/\b(food|groceries|provisions|something to eat|a bit of supper|her shopping|the shopping)\b/, 'groceries'], [/\b(present|a little something)\b/, 'sweets']
];
function goodsIn(text) { const t = ' ' + (text || '').toLowerCase() + ' '; const out = []; for (const [re, id] of WORDS) if (re.test(t) && !out.includes(id)) out.push(id); return out.map(id => GOODS[id]); }
module.exports = { GOODS, SHOPS, goodsIn };
