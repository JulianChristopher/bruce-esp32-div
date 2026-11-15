// Same situations, told two ways: modern labelled lines vs. plain prose of 1931. Which makes talkie decide better?
const io = require('./io.js'); const fs = require('fs');
const src = fs.readFileSync(__dirname + '/reasonbench.js', 'utf8');
var { parse } = require('./intent.js');
var AT = 'AT HAND:';
const S = eval(src.slice(src.indexOf('const S = ['), src.indexOf('];', src.indexOf('const S = [')) + 1).replace('const S = ', '(') + ')');
eval(src.slice(src.indexOf('function classify'), src.indexOf('const He = sc')));
const PROSE = {
  'rent-can-pay': `It was twenty past seven on a bitter Friday evening in January, 1931. Mrs. Ada Turner, a charwoman of forty-one and a war-widow, sat in her two rooms in Bermondsey with nine shillings and fourpence in her purse. She was honest and chapel-going, proud and very poor. The rent of seven shillings was due that night, and Mr. Gedge the collector would knock at half past seven; the rent-book lay on the shelf.`,
  'rent-short': `It was six o'clock on a bitter Friday evening in January, 1931. Mrs. Ada Turner, a charwoman of forty-one and a war-widow, stood in her two rooms in Bermondsey with two shillings and a penny in her purse, and Bert out of work. She was honest and chapel-going, proud and very poor. The rent of seven shillings was due at half past seven. On the mantelpiece lay her late husband's silver watch; Lamb's the pawnbroker kept open till seven, and Mrs. Nolan lived across the landing.`,
  'joan-ill': `It was half past twelve on a raw grey Tuesday in January, 1931. Mr. Arthur Hale, a ledger clerk of thirty-four, sat in the clerks' room of the insurance office in Moorgate, with Mr. Thomas, his chief, at his desk across the room, and six shillings and fourpence in his pocket. He was conscientious, careful with money and timid with his chief. At home his little daughter Joan, aged seven, had lain since Sunday with a bad cough and a fever, and the doctor, whose fee was three and sixpence, had not been called. Dr. Gray's surgery in Islington opened at five.`,
  'off-to-work': `It was ten minutes past seven on a frosty Wednesday morning in January, 1931. Mrs. Ada Turner, who cleaned the Moorgate insurance office from half past seven till nine and then the offices in Finsbury Circus, was still in her two rooms in Bermondsey with Bert, and one and threepence in her purse. Only last week Mr. Thomas had warned her that if she missed the office again she would lose her place; it was thirty-five minutes' walk.`,
  'cold-no-coal': `It was seven o'clock on a Monday evening in January, 1931, with a hard frost and four degrees below freezing. In her two rooms in Bermondsey the fire was out, the coal-box was empty, and there was frost on the inside of the window. Mrs. Ada Turner, a proud and very poor charwoman of forty-one, sat with her son Bert and one and twopence in her purse. A hundredweight of coal cost a shilling at Barker's, the grocer and coal-dealer, five minutes away and open till eight.`,
  'found-coin': `It was a quarter to eight on a grey Thursday morning in January, 1931. Mrs. Ada Turner, an honest, chapel-going charwoman of forty-one with fourpence in her purse, was scrubbing the floor of the empty clerks' room of the insurance office when she found, wedged in a crack of the boards under Mr. Hale's desk, a half-crown. Mr. Thomas would come in at half past eight.`
};
const PAST = { paid: 'pays', went: 'goes', took: 'takes', gave: 'gives', sent: 'sends', bought: 'buys', sold: 'sells', asked: 'asks', begged: 'begs', borrowed: 'borrows', pawned: 'pawns', lit: 'lights', made: 'makes', kept: 'keeps', put: 'puts', laid: 'lays', returned: 'returns', ran: 'runs', hurried: 'hurries', set: 'sets', got: 'gets', fetched: 'fetches', called: 'calls', wrote: 'writes', sat: 'sits', stayed: 'stays', waited: 'waits', told: 'tells', said: 'says', spoke: 'speaks', knocked: 'knocks', left: 'leaves', slept: 'sleeps', prayed: 'prays', read: 'reads', ate: 'eats', drank: 'drinks', handed: 'hands', pocketed: 'pockets', decided: 'decides', resolved: 'resolves', determined: 'determines', walked: 'walks', looked: 'looks', sought: 'seeks', found: 'finds', worked: 'works', started: 'starts', set_: 'sets', dressed: 'dresses', counted: 'counts', opened: 'opens', locked: 'locks' };
const present = a => a && a.replace(/\b(She|He) ([a-z]+)\b/, (m, w, v) => `${w} ${PAST[v] || v}`).replace(/\b(and|then) ([a-z]+ed|went|took|gave|sent|bought|paid)\b/g, (m, c2, v) => `${c2} ${PAST[v] || v}`);
(async () => {
  await io.launch(); const R = { labels: [0, 0, 0, 0], prose: [0, 0, 0, 0] };   // good, bad, neutral, empty
  for (const sc of S) for (const style of ['labels', 'prose']) for (let r = 0; r < 4; r++) {
    const He = sc.f ? 'She' : 'He';
    const q = style === 'labels' ? `${sc.ctx}\n\nWhat does ${sc.who} do now, as ${He.toLowerCase()} truly would? Answer in the form: ${He} ... (one sentence)`
      : `${PROSE[sc.id]}\n\nWhat did ${sc.who === 'Ada' ? 'Mrs. Turner' : 'Mr. Hale'} do then? Answer in the form: ${He} ...`;
    const a = await io.ask(q); const c = classify(present(a), sc);
    const i = c.tag === 'empty' ? 3 : c.ok === true ? 0 : c.ok === false ? 1 : 2; R[style][i]++;
    console.log(sc.id.padEnd(13), style.padEnd(7), ['GOOD', 'BAD ', 'meh ', 'EMPTY'][i], (a || '').replace(/\n/g, ' ').slice(0, 110));
  }
  for (const [k, v] of Object.entries(R)) console.log('SUM', k, `good ${v[0]}/24 bad ${v[1]} neutral ${v[2]} empty ${v[3]}`);
  await io.close();
})();
