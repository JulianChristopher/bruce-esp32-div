// London, 2 January – 1 April 1931, as data for world.js.
// Places, people (three main characters and their neighbourhood), what can be done where and when,
// recurring social practices, and the dated events of the story. Prices after the New Survey of London
// Life and Labour (1929-31), rounded. Effects that touch memory call the driver's hooks (w.hooks).
'use strict';
const H = w => w.hooks;
const hm = (h, m = 0) => h * 60 + m;
const weekday = w => !['sat', 'sun'].includes(w.dow());
const sat = w => w.dow() === 'sat', sun = w => w.dow() === 'sun', fri = w => w.dow() === 'fri';
const s = n => n * 12;   // shillings -> pence

// ---------- places: a tree of buildings in districts ----------
const outdoor = w => ({ 'bitterly cold': 5, foggy: 20, 'raw and grey': 20, 'frosty and bright': 15, sleeting: 10, 'thick fog': 15, 'cold and wet': 15, frosty: 12, grey: 25, 'snowing a little': 8, 'raw and windy': 15, 'mild for February': 35, 'fine and cold': 25, 'cold and windy': 18, raining: 20, mild: 40 })[w.weather(w.day)] ?? 25;
const places = {
  ada_home: { name: "Mrs. Turner's two rooms in Bermondsey", kind: 'home', district: 'bermondsey', warmth: w => (w.flags.fire_ada_home > w.t ? 62 : 22) },
  nolan_rooms: { name: "Mrs. Nolan's rooms across the landing", kind: 'home', district: 'bermondsey', warmth: 50 },
  chandler: { name: "Barker's, the grocer and chandler in Bermondsey", kind: 'shop', district: 'bermondsey', warmth: 45, open: w => !sun(w) && w.between(hm(7, 30), hm(20)) },
  market: { name: 'the street-market in Bermondsey', kind: 'market', district: 'bermondsey', warmth: outdoor, open: w => !sun(w) && w.between(hm(8), hm(19)) },
  pawnshop: { name: "Lamb's, the pawnbroker in Bermondsey", kind: 'shop', district: 'bermondsey', warmth: 45, open: w => !sun(w) && w.between(hm(9), hm(19)) },
  chapel: { name: 'the Bermondsey Methodist chapel', kind: 'chapel', district: 'bermondsey', warmth: 40, open: w => sun(w) && w.between(hm(10), hm(12, 30)) },
  pub: { name: 'the Lord Nelson public-house', kind: 'pub', district: 'bermondsey', warmth: 65, open: w => w.between(hm(11), hm(15)) || w.between(hm(17, 30), hm(22)) },
  docks: { name: 'the dock gates at Surrey Commercial Docks', kind: 'work', district: 'bermondsey', warmth: outdoor },
  office: { name: "the clerks' room of the Moorgate Fire and Life Assurance Company", kind: 'work', district: 'moorgate', warmth: 64, open: w => !sun(w) && w.between(hm(7, 30), sat(w) ? hm(13) : hm(18, 30)) },
  finsbury: { name: 'the offices in Finsbury Circus', kind: 'work', district: 'moorgate', warmth: 55, open: w => !sun(w) && w.between(hm(8, 30), hm(13)) },
  teashop: { name: 'a Lyons tea-shop in Moorgate', kind: 'cafe', district: 'moorgate', warmth: 70, open: w => !sun(w) && w.between(hm(8), hm(19)) },
  arthur_home: { name: "the Hales' house in Islington", kind: 'home', district: 'islington', warmth: 58 },
  school: { name: 'the Board school in Islington', kind: 'school', district: 'islington', warmth: 50 },
  church: { name: "St. Mary's Church, Islington", kind: 'church', district: 'islington', warmth: 38, open: w => sun(w) && w.between(hm(10, 30), hm(12, 30)) },
  doctor: { name: "Dr. Gray's surgery in Islington", kind: 'surgery', district: 'islington', warmth: 55, open: w => !sun(w) && (w.between(hm(9), hm(11)) || w.between(hm(17), hm(19))) },
  thomas_home: { name: "Mr. Thomas's house in Highbury", kind: 'home', district: 'highbury', warmth: 62 },
  park: { name: 'Highbury Fields, a public park', kind: 'park', district: 'highbury', warmth: outdoor },
  post_office: { name: 'the post office in Islington', kind: 'shop', district: 'islington', warmth: 45, open: w => !sun(w) && w.between(hm(8), hm(19)) }
};
// minutes between districts, on foot or by tram (London Bridge to Moorgate on foot; Islington and Highbury by tram)
const routes = { bermondsey: { moorgate: 35, islington: 55, highbury: 60 }, moorgate: { islington: 25, highbury: 25 }, islington: { highbury: 15 } };

// ---------- people ----------
const people = [
  { id: 'ada', main: true, name: 'Mrs. Ada Turner', short: 'Ada', f: true, home: 'ada_home', money: 45, inv: { food: 2, coal: 3 },
    sheet: "Mrs. Ada Turner, aged forty-one, a charwoman. She cleans the Moorgate insurance office from half past seven till nine, and then the offices in Finsbury Circus. A war-widow; her son Bert, aged twenty, a docker, lives with her. Honest, chapel-going, proud, sharp-tongued, kind." },
  { id: 'arthur', main: true, name: 'Mr. Arthur Hale', short: 'Arthur', f: false, home: 'arthur_home', money: 54, inv: {},
    sheet: "Mr. Arthur Hale, aged thirty-four, a ledger clerk at the Moorgate Fire and Life Assurance Company, earning £3 10s. a week; married to Edith, with a daughter Joan, aged seven. Conscientious, careful with money, a little timid with his superiors, fond of his garden and the newspaper." },
  { id: 'thomas', main: true, name: 'Mr. Walter Thomas', short: 'Mr. Thomas', f: false, home: 'thomas_home', money: s(800), inv: {},
    sheet: "Mr. Walter Thomas, aged fifty-six, chief clerk of the Moorgate Fire and Life Assurance Company. Stern, exact, a stickler for duty, but fair and secretly kind. He pays the clerks' wages and the charwoman's on Fridays. A widower in Highbury; a churchgoer who walks in Highbury Fields on Sundays." },
  // the neighbourhood: routines only; talkie speaks for them in conversation with a main character
  { id: 'edith', name: 'Mrs. Edith Hale', short: 'Edith', f: true, home: 'arthur_home', sheet: "Mrs. Edith Hale, Arthur's wife, aged thirty-two; a careful housekeeper who must feed the family on what Arthur gives her each Friday. Warm but practical.",
    routine: (w) => (!sun(w) && w.between(hm(10), hm(11, 30)) ? 'market_islington' : 'arthur_home') },
  { id: 'joan', name: 'Joan Hale', short: 'Joan', f: true, home: 'arthur_home', sheet: "Joan Hale, aged seven, Arthur's daughter; lively, curious, full of questions.",
    routine: (w) => (w.flags.joanIll ? 'arthur_home' : weekday(w) && w.between(hm(8, 45), hm(16)) ? 'school' : sun(w) && w.between(hm(10, 30), hm(12, 30)) ? 'church' : 'arthur_home') },
  { id: 'bert', name: 'Bert Turner', short: 'Bert', f: false, home: 'ada_home', sheet: "Bert Turner, aged twenty, Ada's son, a docker; good-humoured, devoted to his mother, ashamed when out of work.",
    routine: (w) => (sun(w) ? (w.between(hm(12), hm(14)) ? 'pub' : 'ada_home') : w.flags.bertWork ? (w.between(hm(6, 30), hm(17, 30)) ? 'docks' : w.between(hm(19, 30), hm(21, 30)) && fri(w) ? 'pub' : 'ada_home') : (w.between(hm(6, 30), hm(9)) ? 'docks' : w.between(hm(14), hm(16)) ? 'pub' : 'ada_home')) },
  { id: 'nolan', name: 'Mrs. Kate Nolan', short: 'Mrs. Nolan', f: true, home: 'nolan_rooms', sheet: "Mrs. Kate Nolan, Ada's neighbour across the landing, aged fifty, an Irish widow who takes in washing; a great talker who knows everybody's business.",
    routine: (w) => (sun(w) && w.between(hm(10), hm(12, 30)) ? 'chapel' : sat(w) && w.between(hm(10), hm(12)) ? 'market' : w.between(hm(16), hm(17)) && !sun(w) ? 'chandler' : 'nolan_rooms') },
  { id: 'barker', name: 'Mr. Barker', short: 'Mr. Barker', f: false, home: 'chandler', sheet: "Mr. Barker, the grocer and chandler, aged sixty; gives credit to old customers but keeps a sharp slate.",
    routine: (w) => (!sun(w) && w.between(hm(7, 30), hm(20)) ? 'chandler' : null) },
  { id: 'lamb', name: 'Mr. Lamb', short: 'Mr. Lamb', f: false, home: 'pawnshop', sheet: "Mr. Lamb, the pawnbroker, aged sixty-five; dry, exact, not unkind, has seen every trouble in Bermondsey.",
    routine: (w) => (!sun(w) && w.between(hm(9), hm(19)) ? 'pawnshop' : null) },
  { id: 'gedge', name: 'Mr. Gedge', short: 'Mr. Gedge', f: false, home: null, sheet: "Mr. Gedge, the landlord's collector, aged forty-five; brisk and hard, but takes a story if it is told him straight.",
    routine: () => null },
  { id: 'fenn', name: 'young Mr. Fenn', short: 'Fenn', f: false, home: null, sheet: "Mr. Leonard Fenn, aged nineteen, the junior clerk; cheerful, careless, mad about football and the pictures.",
    routine: (w) => (!sun(w) && w.between(hm(9), sat(w) ? hm(13) : hm(17, 30)) ? (w.between(hm(12, 30), hm(13, 30)) && !sat(w) ? 'teashop' : 'office') : null) },
  { id: 'dunn', name: 'Mrs. Dunn', short: 'Mrs. Dunn', f: true, home: 'thomas_home', sheet: "Mrs. Dunn, Mr. Thomas's daily housekeeper, aged sixty; Scottish, thrifty, devoted to him, hears all the news of Highbury.",
    routine: (w) => (!sun(w) && w.between(hm(7), hm(19)) ? 'thomas_home' : null) },
  { id: 'pollock', name: 'Mr. Jim Pollock', short: 'Mr. Pollock', f: false, home: 'pollock_rooms', sheet: "Jim Pollock, aged forty-five, a coal-heaver who lives downstairs with his wife and four children; rough-spoken, generous when in drink, often out of work.",
    routine: (w) => (!sun(w) && w.between(hm(6), hm(16)) ? 'docks' : w.between(hm(18), hm(21, 30)) && w.dow() !== 'sun' ? 'pub' : 'pollock_rooms') },
  { id: 'mrspollock', name: 'Mrs. Annie Pollock', short: 'Mrs. Pollock', f: true, home: 'pollock_rooms', sheet: "Annie Pollock, aged forty, worn out with four children and a husband who drinks; borrows a cup of sugar more often than she lends one.",
    routine: (w) => (!sun(w) && w.between(hm(9, 30), hm(10, 30)) ? 'chandler' : sat(w) && w.between(hm(14), hm(16)) ? 'market' : 'pollock_rooms') },
  { id: 'hughes', name: 'the Reverend Mr. Hughes', short: 'Mr. Hughes', f: false, home: null, sheet: "The Reverend David Hughes, the Methodist minister in Bermondsey, aged fifty; Welsh, earnest, runs a coal and boot club for the poor of the chapel.",
    routine: (w) => (sun(w) && w.between(hm(10), hm(12, 30)) ? 'chapel' : w.dow() === 'wed' && w.between(hm(18), hm(20)) ? 'chapel' : null) },
  { id: 'simms', name: 'Mrs. Simms', short: 'Mrs. Simms', f: true, home: 'simms_house', sheet: "Mrs. Simms, the Hales' next-door neighbour, a retired publican's widow of sixty-eight; nosy, kind to Joan, quarrelsome over the garden fence.",
    routine: (w) => (!sun(w) && w.between(hm(10), hm(11)) ? 'market_islington' : sun(w) && w.between(hm(10, 30), hm(12, 30)) ? 'church' : 'simms_house') },
  { id: 'relieving', name: 'Mr. Cobb, the relieving officer', short: 'Mr. Cobb', f: false, home: null, sheet: "Mr. Cobb, relieving officer of the Public Assistance Committee in Bermondsey, aged fifty; asks searching questions, gives relief in kind rather than money.",
    routine: (w) => (w.isOpen('relieving_office') ? 'relieving_office' : null) },
  { id: 'bray', name: "Mrs. Bray, Edith's mother", short: 'Mrs. Bray', f: true, home: null, sheet: "Mrs. Bray, Edith's widowed mother, aged sixty-five, come from Colchester to stay for a fortnight; sharp-eyed, kindly, fond of Joan.",
    routine: (w) => (w.flags.brayVisiting ? 'arthur_home' : null) }
];
places.cookshop = { name: 'an eating-house near Moorgate', kind: 'cafe', district: 'moorgate', warmth: 68, open: w => !sun(w) && w.between(hm(11, 30), hm(20)) };
places.labour_exchange = { name: 'the Employment Exchange in Bermondsey', kind: 'office', district: 'bermondsey', warmth: 40, open: w => !sat(w) && !sun(w) && w.between(hm(9), hm(16)) };
places.relieving_office = { name: 'the Public Assistance relieving office in Bermondsey', kind: 'office', district: 'bermondsey', warmth: 35, open: w => !sat(w) && !sun(w) && w.between(hm(9), hm(12, 30)) };
places.pollock_rooms = { name: "the Pollocks' rooms downstairs", kind: 'home', district: 'bermondsey', warmth: 40 };
places.simms_house = { name: "Mrs. Simms's house next door to the Hales", kind: 'home', district: 'islington', warmth: 55 };
places.baker = { name: "the baker's in Bermondsey", kind: 'shop', district: 'bermondsey', warmth: 60, open: w => !sun(w) && w.between(hm(7), hm(19)) };
places.chemist = { name: "the chemist's in Bermondsey", kind: 'shop', district: 'bermondsey', warmth: 50, open: w => !sun(w) && w.between(hm(9), hm(20)) };
places.newsagent = { name: "the newsagent and tobacconist's in Bermondsey", kind: 'shop', district: 'bermondsey', warmth: 45, open: w => w.between(hm(6), hm(20)) };
places.fishshop = { name: 'the fried-fish shop in Bermondsey', kind: 'cafe', district: 'bermondsey', warmth: 65, open: w => !sun(w) && (w.between(hm(11, 30), hm(14)) || w.between(hm(17), hm(23))) };
places.street_corner = { name: "the street corner where the bookie's runner stands", kind: 'street', district: 'bermondsey', warmth: w => 20, open: w => !sun(w) && w.between(hm(10), hm(15)) };
places.islington_shop = { name: 'the corner shop in Islington', kind: 'shop', district: 'islington', warmth: 50, open: w => w.between(hm(7), hm(21)) };
places.chemist_islington = { name: "the chemist's in Upper Street, Islington", kind: 'shop', district: 'islington', warmth: 50, open: w => !sun(w) && w.between(hm(9), hm(20)) };
places.library = { name: 'the free public library in Bermondsey', kind: 'library', district: 'bermondsey', warmth: 60, open: w => !sun(w) && w.between(hm(10), hm(21)) };
places.washhouse = { name: 'the public baths and wash-house in Grange Road', kind: 'washhouse', district: 'bermondsey', warmth: 70, open: w => !sun(w) && w.between(hm(8), hm(20)) };
places.pictures = { name: 'the picture palace in the Old Kent Road', kind: 'pictures', district: 'bermondsey', warmth: 60, open: w => w.between(hm(13, 30), hm(23)) && (!sun(w) || w.mod >= hm(17)) };
places.mission = { name: 'the Salvation Army hall in Bermondsey', kind: 'mission', district: 'bermondsey', warmth: 55, open: w => w.between(hm(18), hm(21)) || sun(w) && w.between(hm(10), hm(12)) };
places.library_islington = { name: 'the public library in Islington', kind: 'library', district: 'islington', warmth: 60, open: w => !sun(w) && w.between(hm(10), hm(21)) };
places.pictures_islington = { name: 'the Blue Hall picture house in Upper Street', kind: 'pictures', district: 'islington', warmth: 60, open: w => w.between(hm(13, 30), hm(23)) && (!sun(w) || w.mod >= hm(17)) };
places.market_islington = { name: 'Chapel Market in Islington', kind: 'market', district: 'islington', warmth: outdoor, open: w => !sun(w) && w.between(hm(8), hm(19)) };

// ---------- what can be done ----------
// habit(): the usual thing at the usual time; meets: needs met (0-100); cost in pence; dur in minutes
const at = (...ids) => (w, p, x, place) => ids.includes(place);
const athome = (w, p, x, place) => place === p.home;
const ME = { ada: 'ada', arthur: 'arthur', thomas: 'thomas' };
const actions = [
  // --- going about ---
  { id: 'go_home', who: ['ada', 'arthur', 'thomas'], at: (w, p) => p.home, where: (w, p) => p.place !== p.home, dur: 0, base: 4,
    label: () => 'Go home', habit: (w, p) => w.mod >= (p.id === 'ada' ? hm(17) : hm(17, 30)) || sun(w) && w.mod > hm(12, 30), effect: (w, p) => `${p.short} went home.` },
  { id: 'sleep', who: ['ada', 'arthur', 'thomas'], where: athome, when: w => w.mod >= hm(21, 30), dur: w => 24 * 60 + hm(6, 15) - w.mod, meets: { energy: 100 }, base: 8,
    label: () => 'Go to bed for the night', habit: () => true, effect: (w, p) => `${p.short} went to bed.` },
  { id: 'rest', who: ['ada', 'arthur', 'thomas'], where: athome, when: w => w.mod < hm(21, 30), dur: 60, meets: { energy: 25 }, base: 0,
    label: (w, p) => `Sit by the fire and rest${p.id === 'ada' ? ' her feet' : ''}`, effect: (w, p) => `${p.short} rested.` },
  // --- food and warmth (Ada keeps house; the Hales' and Mr. Thomas's meals are provided by Edith and the housekeeper) ---
  { id: 'eat_home', who: ['ada', 'arthur', 'thomas'], where: athome, when: (w, p) => (w.between(hm(6, 30), hm(8, 30)) || w.between(hm(12), hm(14)) || w.between(hm(17, 30), hm(20))) && (p.id !== 'ada' || w.count('ada', 'food') > 0) && !(p.ateAt > w.t - 150),
    dur: 25, meets: { hunger: 65 }, base: 6, habit: () => true,
    label: (w, p) => p.id === 'ada' ? `Cook a meal and eat it${w.peopleAt('ada_home', 'ada').some(q => q.id === 'bert') ? ' with Bert' : ''} (uses one of her ${w.count('ada', 'food')} meals' worth of food)` : w.mod < hm(10) ? 'Have breakfast' : w.mod < hm(15) ? 'Have dinner at home' : 'Have tea with the family',
    effect: (w, p) => { p.ateAt = w.t; if (p.id === 'ada') w.add('ada', 'food', -1); return `${p.short} had a meal.`; } },
  { id: 'buy_food', who: ['ada'], at: () => 'chandler', where: () => true, when: w => w.count('ada', 'food') < 4, cost: 27, payee: () => 'barker', onCredit: true, dur: 20, base: w => (w.count('ada', 'food') === 0 ? 30 : 8),
    label: (w) => `Buy bread, margarine, tea and a bit of bacon at Barker's: three meals for two (2s. 3d.); ${w.count('ada', 'food')} meals' worth left at home`,
    effect: (w, p) => { w.add('ada', 'food', 3); if (p.money < 0) H(w).debt('ada', 'Barker'); return 'Ada bought food at Barker\'s.'; } },
  { id: 'buy_coal', who: ['ada'], at: () => 'chandler', where: () => true, when: w => w.count('ada', 'coal') < 3, cost: w => (w.coldSnap && w.coldSnap(w.day) ? 15 : 12), payee: () => 'barker', onCredit: true, dur: 15, base: w => (w.count('ada', 'coal') === 0 ? 22 : 5),
    label: (w) => `Buy a hundredweight of coal at Barker's (${w.coldSnap && w.coldSnap(w.day) ? '1s. 3d., dearer in the frost' : '1s.'}); ${w.count('ada', 'coal')} fires' worth left`,
    effect: (w, p) => { w.add('ada', 'coal', 4); if (p.money < 0) H(w).debt('ada', 'Barker'); return 'Ada bought coal.'; } },
  { id: 'light_fire', who: ['ada'], where: athome, when: w => w.count('ada', 'coal') > 0 && !(w.flags.fire_ada_home > w.t) && w.mod >= hm(6) && w.mod < hm(21, 30), dur: 10, meets: { warmth: 30 }, base: 5, habit: (w, p) => p.needs.warmth > 40,
    label: (w) => `Light the fire (${w.count('ada', 'coal')} fires' worth of coal left)`, effect: (w) => { w.add('ada', 'coal', -1); w.flags.fire_ada_home = w.t + 240; return 'Ada lit the fire.'; } },
  { id: 'market', who: ['ada'], at: () => 'market', where: () => true, when: (w, p) => !(p.marketDay === w.day), dur: 40, cost: 0, base: w => (sat(w) ? 14 : 2), meets: { social: 15 },
    label: () => 'Go round the street-market for cheap vegetables and a bit of company', habit: w => sat(w) && w.between(hm(14), hm(17)),
    effect: (w, p) => { p.marketDay = w.day; if (p.money >= 4) { w.pay('ada', null, 4); w.add('ada', 'food', 1); return 'Ada bought cheap vegetables at the market (4d.).'; } return 'Ada walked round the market.'; } },
  // --- work ---
  { id: 'clean_office', who: ['ada'], at: () => 'office', where: () => true, when: (w, p) => !sun(w) && !w.flags.adaDismissed && w.between(hm(7), hm(8, 30)) && p.cleanedDay !== w.day, dur: w => hm(9) - w.mod - 5, base: 10, meets: {},
    label: () => 'Clean the Moorgate office: scrub the floor under the clerks\' desks, empty the baskets and dust', habit: () => true,
    effect: (w, p) => { p.cleanedDay = w.day; return H(w).cleanOffice(); } },
  { id: 'finsbury', who: ['ada'], at: () => 'finsbury', where: () => true, when: (w, p) => !sun(w) && w.between(hm(8, 45), hm(10)) && p.finsburyDay !== w.day, dur: w => hm(12, 30) - w.mod, base: 10,
    label: () => 'Go on to clean the offices in Finsbury Circus till half past twelve', habit: () => true, effect: (w, p) => { p.finsburyDay = w.day; (p.fins = p.fins || []).push(w.day); return 'Ada cleaned the offices in Finsbury Circus.'; } },
  { id: 'desk_work', who: ['arthur'], at: () => 'office', where: () => true, when: w => !sun(w) && w.mod >= hm(8, 15) && (sat(w) ? w.mod < hm(12, 30) : w.mod < hm(17, 15) && !w.between(hm(12, 30), hm(13, 30))),
    dur: w => Math.min(120, (sat(w) ? hm(13) : w.mod < hm(12, 30) ? hm(12, 30) : hm(17, 30)) - w.mod), base: 12, habit: () => true,
    label: w => H(w).arthurWorkLabel(), effect: (w) => H(w).arthurWork() },
  { id: 'chief_work', who: ['thomas'], at: () => 'office', where: () => true, when: w => !sun(w) && !w.flags.thomasIll && w.mod >= hm(8) && w.mod < (sat(w) ? hm(12, 30) : hm(17, 15)) && !w.between(hm(12, 30), hm(13, 30)),
    dur: w => Math.min(120, (sat(w) ? hm(13) : w.mod < hm(12, 30) ? hm(12, 30) : hm(17, 30)) - w.mod), base: 12, habit: () => true,
    label: w => H(w).thomasWorkLabel(), effect: (w) => H(w).thomasWork() },
  { id: 'lunch_chop', who: ['arthur', 'thomas'], at: () => 'teashop', where: () => true, when: (w, p) => weekday(w) && w.between(hm(12, 30), hm(13, 30)) && !(p.ateAt > w.t - 150), cost: 14, payee: () => null, dur: 45, meets: { hunger: 60, warmth: 20 }, base: 4,
    label: () => 'Lunch at the Lyons tea-shop: soup and a chop (1s. 2d.)', habit: (w, p) => p.id === 'thomas', effect: (w, p) => { p.ateAt = w.t; return `${p.short} lunched at Lyons.`; } },
  { id: 'lunch_bun', who: ['arthur'], at: () => 'teashop', where: () => true, when: (w, p) => weekday(w) && w.between(hm(12, 30), hm(13, 30)) && !(p.ateAt > w.t - 150), cost: 3, dur: 25, meets: { hunger: 30, warmth: 15 }, base: 4,
    label: () => 'Lunch at the Lyons tea-shop: only a cup of tea and a bun (3d.), to save money', habit: (w, p) => p.money < 120, effect: (w, p) => { p.ateAt = w.t; return 'Arthur had tea and a bun.'; } },
  // --- church, chapel, papers, leisure ---
  { id: 'worship', who: ['ada', 'arthur', 'thomas'], at: (w, p) => (p.id === 'ada' ? 'chapel' : 'church'), where: () => true, when: (w, p) => sun(w) && w.between(hm(9, 45), hm(11)) && p.worshipDay !== w.day, dur: w => hm(12, 15) - w.mod, base: 10, meets: { social: 30 },
    label: (w, p) => (p.id === 'ada' ? 'Go to morning service at the chapel' : 'Go to morning service at St. Mary\'s'), habit: () => true,
    effect: (w, p) => { p.worshipDay = w.day; const c = p.id === 'ada' ? Math.min(3, Math.max(0, p.money)) : 12; w.pay(p.id, null, c); return `${p.short} went to the service and put ${c}d. in the collection.`; } },
  { id: 'read_paper', who: ['ada', 'arthur', 'thomas'], where: athome, when: (w, p) => p.readDay !== w.day && (p.id === 'ada' ? w.mod >= hm(17) : w.mod < hm(9) || sun(w)), cost: (w, p) => (p.id === 'thomas' ? 2 : sun(w) ? 2 : 1), dur: 25, base: 5, meets: { social: 5 },
    label: (w, p) => H(w).paperLabel(p.id), habit: () => true, effect: (w, p) => { p.readDay = w.day; return H(w).readPaper(p.id); } },
  { id: 'walk_park', who: ['arthur', 'thomas'], at: () => 'park', where: () => true, when: (w, p) => (sun(w) || sat(w)) && w.between(hm(14), hm(16, 30)) && p.walkDay !== w.day, dur: 60, base: 4, meets: { social: 10 },
    label: (w, p) => (p.id === 'arthur' ? 'Take Joan for a walk in Highbury Fields' : 'Take his Sunday walk round Highbury Fields'), habit: (w, p) => p.id === 'thomas' && sun(w),
    effect: (w, p) => { p.walkDay = w.day; return `${p.short} walked in Highbury Fields.`; } },
  { id: 'wireless', who: ['thomas'], where: athome, when: w => w.mod >= hm(19) && w.mod < hm(21, 30), dur: 60, base: 3, meets: { social: 10 }, label: () => 'Listen to the wireless by the fire', effect: () => 'Mr. Thomas listened to the wireless.' },
  { id: 'garden', who: ['arthur'], where: athome, when: w => (sat(w) && w.mod >= hm(14)) || (sun(w) && w.between(hm(14), hm(16))), dur: 60, base: 3, label: () => 'Potter in the shed and plan the spring seedlings', effect: () => 'Arthur pottered in the shed.' },
  // --- money matters ---
  { id: 'pawn_watch', who: ['ada'], at: () => 'pawnshop', where: () => true, when: w => w.obj('watch').at === 'ada' && w.isOpen('pawnshop'), dur: 20, base: (w, p) => (p.money < 84 && (fri(w) || w.flags.rentOwing) ? 18 : -20),
    label: () => "Pawn her late husband's watch at Lamb's for ten shillings", effect: (w) => H(w).pawn() },
  { id: 'redeem_watch', who: ['ada'], at: () => 'pawnshop', where: () => true, when: (w, p) => w.obj('watch').at === 'lamb' && !w.flags.watchForfeit && p.money >= 132, dur: 20, base: (w, p) => (p.money > 200 ? 10 : 0), cost: 132, payee: () => 'lamb',
    label: (w, p) => `Redeem her husband's watch at Lamb's for eleven shillings; she would have ${H(w).money(p.money - 132)} left`, effect: (w) => H(w).redeem() },
  { id: 'housekeeping', who: ['arthur'], args: () => [30, 35, 40, 45], where: athome, when: (w, p, x) => fri(w) && w.mod >= hm(17) && w.flags['paid_arthur_' + w.day] && !w.flags['hk_' + w.day], dur: 5, base: (w, p, x) => 14 - Math.abs(x - 40) / 5,
    label: (w, p, x) => `Give Edith ${x} shillings for the week's housekeeping; he would keep ${H(w).money(p.money - s(x))}`, effect: (w, p, x) => H(w).housekeeping(x) },
  { id: 'doctor', who: ['arthur'], at: () => 'doctor', where: () => true, when: w => w.flags.joanIll && !w.flags.doctorCalled && w.isOpen('doctor'), cost: 42, payee: () => null, dur: 30, base: 10,
    label: (w, p) => `Fetch Dr. Gray to Joan (3s. 6d.); he would have ${H(w).money(p.money - 42)} left`, effect: (w) => H(w).doctor() },
  { id: 'reply_letter', who: ['ada', 'arthur', 'thomas'], args: (w, p) => (p.letters || []).filter(l => !l.answered).slice(0, 1), where: athome, when: w => w.mod >= hm(17) && w.mod < hm(21, 30), cost: 2, dur: 40, base: 4,
    label: (w, p, L) => `Write a reply to ${L.from.split(',')[0]} (stamp and paper, 2d.)`, effect: (w, p, L) => { L.answered = true; H(w).remember(p.id, `${p.short} wrote back to ${L.from.split(',')[0]}.`, [], 2); return `${p.short} wrote a letter.`; } },
  // --- people: talk with whoever is here (main characters or the neighbourhood) ---
  { id: 'talk', who: ['ada', 'arthur', 'thomas'], args: (w, p) => w.presentWith(p.id).filter(q => q.id !== 'gedge' || w.practiceActive('rent')).map(q => q.id), where: () => true,
    when: (w, p, q) => !(p.talked || {})[q + w.day + (w.people[q].main ? (w.mod < hm(14) ? 'a' : 'b') : '')], dur: 15, base: (w, p, q) => (w.people[q].main ? 6 : 0), meets: { social: 35 },
    label: (w, p, q) => H(w).talkLabel(p.id, q), effect: (w, p, q) => { (p.talked = p.talked || {})[q + w.day + (w.people[q].main ? (w.mod < hm(14) ? 'a' : 'b') : '')] = true; return { talk: q }; } },
  { id: 'visit_nolan', who: ['ada'], at: () => 'nolan_rooms', where: () => true, when: (w, p) => w.mod >= hm(17) && w.mod < hm(21) && p.visitDay !== w.day, dur: 10, base: 3, meets: { social: 10 },
    label: () => 'Step across the landing to Mrs. Nolan for a cup of tea and the news of the buildings', effect: (w, p) => { p.visitDay = w.day; return { talk: 'nolan' }; } }
];

// ---------- practices: recurring social situations that bring the cast together ----------
const practices = [
  { id: 'rent', active: w => w.flags.rentDue && w.between(hm(19), hm(20, 30)), place: () => 'ada_home', cast: { collector: 'gedge' } },
  { id: 'school', active: w => weekday(w) && w.between(hm(8, 45), hm(16)), cast: {} },
  { id: 'chapel', active: w => sun(w) && w.between(hm(10), hm(12, 15)), place: () => 'chapel', cast: { neighbour: 'nolan' } },
  { id: 'church', active: w => sun(w) && w.between(hm(10, 30), hm(12, 15)), place: () => 'church', cast: { wife: 'edith' } }
];
const rentActions = [
  { id: 'pay_rent', who: ['ada'], where: athome, when: w => w.practiceActive('rent') && w.people.ada.money >= 84, cost: 84, payee: () => 'gedge', dur: 10, base: 25, habit: () => true,
    label: (w, p) => `Pay Mr. Gedge the week's rent of seven shillings; she would have ${H(w).money(p.money - 84)} left`, effect: w => H(w).rent(true) },
  { id: 'rent_wait', who: ['ada'], where: athome, when: w => w.practiceActive('rent'), dur: 10, base: 5,
    label: () => 'Ask Mr. Gedge to wait for the rent till next week', effect: w => H(w).rent(false) }
];
actions.push(...rentActions);
// free deeds the grammar recognises, as engine actions, so that the engine can also foresee them in its rollouts.
// Requests to other people go through w.hooks.ask: in the live run the person asked answers (talkie, majority of
// three); in a rollout a rule of thumb stands in for them (h.ask in simHooks).
for (const item of ['ring', 'kettle', 'coat', 'boots']) actions.push({ id: 'pawn_' + item, who: ['ada'], at: () => 'pawnshop', where: () => true,
  when: w => w.obj(item).at === 'ada' && w.isOpen('pawnshop'), dur: 20, base: (w, p) => (p.money < 30 ? 6 : -20),
  label: w => `Pawn ${w.obj(item).name} at Lamb's for ${H(w).money(w.obj(item).value)}`, effect: (w, p) => { w.obj(item).at = 'lamb'; p.money += w.obj(item).value; H(w).remember('ada', `She pawned ${w.obj(item).name} at Lamb's for ${H(w).money(w.obj(item).value)}.`, ['money'], 3); return `Ada pawned ${w.obj(item).name}.`; } });
actions.push(
  { id: 'ask_credit', who: ['ada'], at: () => 'chandler', where: () => true, when: w => w.isOpen('chandler') && !w.flags.creditBarker && !(w.flags.creditRefusedDay === w.day), dur: 10, base: (w, p) => (p.money < 30 ? 8 : -20),
    label: () => "Ask Mr. Barker to let her have things on the slate till Bert is in work", effect: (w, p) => H(w).ask('barker', 'ada', 'credit') },
  { id: 'ask_loan_nolan', who: ['ada'], at: () => 'nolan_rooms', where: () => true, when: w => w.mod >= hm(8) && w.mod < hm(21, 30) && !(w.flags.nolanAskedDay === w.day) && !w.flags.owesNolan, dur: 15, base: (w, p) => (p.money < 84 && w.flags.rentDue ? 8 : -20),
    label: () => 'Ask Mrs. Nolan to lend her two shillings till Friday', effect: (w, p) => H(w).ask('nolan', 'ada', 'loan') },
  { id: 'seek_work', who: ['ada'], at: () => 'labour_exchange', where: () => true, when: w => w.isOpen('labour_exchange') && !w.flags.extraWork, dur: 120, base: (w, p) => (w.flags.adaDismissed ? 12 : -10),
    label: () => 'Go round asking for more cleaning work', effect: (w, p) => H(w).ask('market', 'ada', 'work') },
  { id: 'relief', who: ['ada'], at: () => 'relieving_office', where: () => true, when: w => w.isOpen('relieving_office'), dur: 90, base: (w, p) => (p.money < 0 && w.count('ada', 'food') <= 0 ? 6 : -30),
    label: () => 'Go to the relieving office and apply for relief', effect: (w, p) => H(w).ask('relieving', 'ada', 'relief') }
);


const objects = {
  watch: { kind: 'watch', name: "her late husband's silver watch", at: 'ada', value: 120 },
  ring: { kind: 'ring', name: 'her wedding ring', at: 'ada', value: 60 },
  kettle: { kind: 'kettle', name: 'her copper kettle', at: 'ada', value: 30 },
  coat: { kind: 'coat', name: 'her winter coat', at: 'ada', value: 48 },
  boots: { kind: 'boots', name: "Bert's Sunday boots", at: 'ada', value: 36 },
  medals: { kind: 'medals', name: "Fred's war medals", at: 'ada', value: 24 },
  clock: { kind: 'clock', name: 'the mantel clock', at: 'arthur', value: 36 },
  blanket: { kind: 'blanket', name: 'the spare blanket', at: 'ada', value: 18 },
  coin: { kind: 'coin', name: 'a half-crown', at: 'office_floor', value: 30 },
  // what else a household had that Lamb would lend on (pledges commonly taken in, after the New Survey and pawnbrokers' ledgers)
  suit: { kind: 'suit', name: "Bert's Sunday suit", at: 'ada', value: 60 }, sheets: { kind: 'sheets', name: 'her best pair of sheets', at: 'ada', value: 24 },
  irons: { kind: 'irons', name: 'her flat-irons', at: 'ada', value: 12 }, bible: { kind: 'bible', name: 'the family Bible', at: 'ada', value: 12 },
  dress: { kind: 'dress', name: 'her black Sunday dress', at: 'ada', value: 36 }, shawl: { kind: 'shawl', name: 'her Paisley shawl', at: 'ada', value: 18 },
  overcoat: { kind: 'coat', name: 'his overcoat', at: 'arthur', value: 72 }, wireless: { kind: 'wireless', name: 'the wireless set', at: 'arthur', value: 60 },
  umbrella: { kind: 'umbrella', name: 'his umbrella', at: 'arthur', value: 12 }, chain: { kind: 'chain', name: 'his silver watch-chain', at: 'arthur', value: 30 },
  dickens: { kind: 'books', name: 'his set of Dickens', at: 'arthur', value: 24 }, brooch: { kind: 'brooch', name: "Edith's cameo brooch", at: 'arthur', value: 30 },
  machine: { kind: 'machine', name: "Edith's sewing-machine", at: 'arthur', value: 96 }, goldwatch: { kind: 'watch', name: 'his gold hunter watch', at: 'thomas', value: 240 }
};
module.exports = { places, routes, people, actions, practices, objects, hm, s };
