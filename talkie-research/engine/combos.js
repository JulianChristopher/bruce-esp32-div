// How many distinct deeds can the grammar express, and how many does the engine accept in real situations?
const fs = require('fs'); const SIT = require('./situations.js'), VERBS = require('./verbs.js'); const { GOODS } = require('./goods1931.js');
const all = fs.readFileSync(__dirname + '/situations.jsonl', 'utf8').trim().split('\n').map(l => JSON.parse(l));
const pick = []; const seen = {}; for (const s of all) if ((seen[s.template] = (seen[s.template] || 0) + 1) <= 2) pick.push(s);
const P = { bert: 'Bert', nolan: 'Mrs. Nolan', barker: 'Mr. Barker', lamb: 'Mr. Lamb', gedge: 'Mr. Gedge', edith: 'Edith', joan: 'Joan', thomas: 'Mr. Thomas', arthur: 'Mr. Hale', ada: 'Mrs. Turner', fenn: 'Fenn', hughes: 'Mr. Hughes', pollock: 'Mr. Pollock', mrspollock: 'Mrs. Pollock', simms: 'Mrs. Simms', dunn: 'Mrs. Dunn', bray: 'Mrs. Bray', relieving: 'the relieving officer' };
const ITEMS = ['watch', 'ring', 'kettle', 'coat', 'boots', 'medals', 'clock', 'blanket', 'sheets', 'flat-irons', 'family Bible', 'Sunday dress', 'Paisley shawl', 'Sunday suit', 'wireless', 'umbrella', 'watch-chain', 'brooch', 'sewing-machine'];
const AMT = ['sixpence', 'a shilling', 'two shillings', 'half a crown', 'five shillings', 'seven shillings'];
const S = [];
for (const g of Object.values(GOODS)) { const n = g.name.replace(/^(a|an|two|three|half a|a pair of|a box of) /, ''); S.push(`buys ${g.name}`); for (const q of ['bert', 'joan', 'nolan', 'edith', 'fenn']) S.push(`buys ${g.name} for ${P[q]}`), S.push(`gives ${P[q]} ${g.name}`), S.push(`sends ${P[q]} for ${g.name}`); S.push(`asks Mr. Barker to let her have ${g.name} on the slate`); S.push(`asks Mrs. Nolan for the loan of ${g.name}`); }
for (const i of ITEMS) for (const a of ['pawns the', 'sells the', 'redeems the', 'hides the', 'mends the']) S.push(`${a} ${i}`);
for (const q of Object.keys(P)) { for (const v of ['asks', 'talks to', 'thanks', 'apologises to', 'quarrels with', 'warns', 'comforts', 'writes a letter to', 'visits', 'promises']) S.push(`${v} ${P[q]}`);
  for (const a of AMT) S.push(`lends ${P[q]} ${a}`), S.push(`borrows ${a} from ${P[q]}`), S.push(`gives ${P[q]} ${a}`), S.push(`pays ${P[q]} back ${a}`), S.push(`asks ${P[q]} for work`), S.push(`asks ${P[q]} to wait`); S.push(`nurses ${P[q]}`); }
for (const x of ['pays the rent', 'lights the fire', 'cooks the supper', 'goes to bed', 'reads the paper', 'prays', 'sings a hymn', 'takes in washing', 'looks for work at the docks', 'goes to the labour exchange', 'goes to the relieving office', 'puts a shilling on a horse', 'saves sixpence in the Post Office', 'fetches the doctor', 'goes for a walk in the park', 'knits a vest', 'goes to chapel', 'goes to the pub', 'has a pint of beer', 'smokes a woodbine', 'rests by the fire', 'goes to the pictures', 'takes Joan to the pictures', 'sits in the free library', 'reads the situations vacant in the public library', 'goes to the Salvation Army hall for soup', 'does the washing at the wash-house', 'takes in washing for Mrs. Pollock']) S.push(x);
let acc = 0, tot = 0; const labels = new Set();
for (const s of pick) { const pr = s.who === 'ada' ? 'She' : 'He';
  for (const t of S) { tot++; const f = VERBS.frame(`${pr} ${t.replace(/\bher\b/, s.who === 'ada' ? 'her' : 'him')}.`); if (!f || f.verb === 'other') continue;
    const w = SIT.makeWorld(s.snapshot.t).restore(s.snapshot); let d = null; try { d = VERBS.deed(w, s.who, f); } catch (e) { continue; }
    if (d && !d.why) { acc++; labels.add(d.aff ? d.aff.label : JSON.stringify(d.plan || d).slice(0, 80)); } } }
const verbs = new Set(); for (const t of S) { const f = VERBS.frame('She ' + t + '.'); if (f) verbs.add(f.verb); }
const nV = 47, nG = Object.keys(GOODS).length + VERBS.ITEMS.length + 1, nP = Object.keys(P).length + 2, nPl = VERBS.PLACES.length + 6, nA = 12;
const one = nV * nG * nP * nPl * nA;
console.log(`sentences tried ${tot} in ${pick.length} situations; accepted by the engine ${acc} (${(100 * acc / tot).toFixed(0)}%); distinct deeds ${labels.size}; verbs reached ${verbs.size}`);
console.log(`grammar space for one deed: ${nV} verbs x ${nG} goods and things x ${nP} persons x ${nPl} places x ${nA} amounts = ${one.toLocaleString('en')}`);
console.log(`accepted deeds per situation ~${Math.round(acc / pick.length)}; a day of 8 own deeds: ${(Math.pow(acc / pick.length, 8)).toExponential(1)} paths; a week of 3 households: 10^${Math.round(8 * 7 * 3 * Math.log10(acc / pick.length))}`);
