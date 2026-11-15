const fs = require('fs'); const src = fs.readFileSync(__dirname + '/bankrun.js', 'utf8');
const SIT = require('./situations.js'), VERBS = require('./verbs.js');
eval(src.slice(src.indexOf('const first ='), src.indexOf('\n', src.indexOf('const first ='))) + ';' + src.slice(src.indexOf('function scoreDeed'), src.indexOf('function score(s, key)')) + ';globalThis.sd=scoreDeed;');
const all = fs.readFileSync(__dirname + '/situations.jsonl', 'utf8').trim().split('\n').slice(0, 600).map(l => JSON.parse(l)).filter(s => s.spread > 10);
const tests = [['rent-evening', "She goes to Barker's and begs for trust till Bert gets work again."], ['rent-evening', 'She takes the watch to the pawnbroker.'], ['rent-evening', 'She asks Mr. Gedge to wait till Monday.'],
  ['cold-evening', 'She sends Bert for a hundredweight of coal.'], ['cold-evening', 'She goes to the fried fish shop for a pennyworth of chips.'], ['cold-evening', 'She pawns the spare blanket.'],
  ['joan-ill-home', 'He goes to the chemist and gets a bottle of cough mixture for Joan.'], ['joan-ill-home', 'He fetches the doctor.'], ['joan-ill-home', 'He sits with Joan and reads to her.'],
  ['hungry-no-food', 'She asks Mrs. Nolan for the loan of a loaf.'], ['in-debt', 'She puts sixpence on a horse.'], ['in-debt', 'She takes in washing for the Pollocks.']];
for (const [tpl, txt] of tests) { const s = all.find(x => x.template === tpl); if (!s) { console.log('no situation', tpl); continue; } const r = sd(s, txt); console.log(tpl.padEnd(15), (r.deed + (r.rel !== undefined ? ' ' + r.rel : '')).padEnd(14), (r.label || r.why || '').slice(0, 70), '|', txt.slice(0, 50)); }
