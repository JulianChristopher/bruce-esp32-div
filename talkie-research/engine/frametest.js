const { frame } = require('./verbs.js');
const T = ['She goes to Barker\'s and pawns her copper kettle for half-a-crown.', 'She goes to Barker\'s for coal.', 'She sends Bert for a hundredweight of coal.', 'She begs Mr. Barker for trust till Bert gets work again.',
 'She asks Mrs. Nolan to lend her two shillings till Friday.', 'He buys Joan a story-book and a quarter of sweets.', 'He goes to the chemist and gets a bottle of cough mixture for Joan.', 'She sits up with Bert, who is coughing.',
 'He puts sixpence on a horse with the bookie\'s runner.', 'She knits Bert a pair of socks.', 'She takes in washing for the Pollocks.', 'He writes to Mrs. Bray, asking her to come.', 'She sells her medals at the market.',
 'He gives Edith forty shillings for the housekeeping.', 'She scolds Bert for drinking.', 'He treats Fenn to a cup of tea at Lyons.', 'She puts two shillings in the teapot for the rent.', 'He walks to the City.'];
for (const s of T) { const f = frame(s); console.log(f.verb.padEnd(8), (f.goods.map(g => g.id).join('+') || '-').padEnd(18), (f.persons.join('+') || '-').padEnd(10), (f.place || '-').padEnd(10), (f.item || '-').padEnd(7), (f.amount ?? '-'), '|', s.slice(0, 60)); }
