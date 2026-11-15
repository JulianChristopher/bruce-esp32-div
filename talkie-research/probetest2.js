// Follow-up: position bias (shuffle + 3 votes) and period artefacts as memory aids (rent-book, account-book, pawn-ticket)
const io = require('./io.js'); const fs = require('fs');
const base = fs.readFileSync(__dirname + '/probetest.js', 'utf8').split('\n(async')[0].replace("const io = require('./io.js'); const fs = require('fs');", '');
eval(base.replace(/(^|; )const /gm, '$1var '));
const ART = [
  "She looks at the pawn-ticket and her purse-book. The entries read: '14 March: pawned husband's watch, 10s.' '15 March: redeemed the watch, paid 11s.'",
  "She looks at the pawn-ticket and her purse-book. The entries read: '14 March: pawned husband's watch, 10s.' '15 March: redeemed the watch, paid 11s.'",
  "She looks in her rent-book. The entry for 19 April reads: 'Rent not paid. Landlord to wait till Monday.'",
  "She looks in her rent-book. The entry for 29 March reads: 'Rent paid in full, 7s.'",
  "He looks in his account-book. The entry for 14 March reads: 'Housekeeping to Edith, 40s.'",
  "He looks in his office diary. The entry for 15 March reads: 'Mr. Thomas examined the quarterly ledger: not finished, 2 of 3 totals done.'"
];
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
function promptS(f, order, extra) {
  const He = f.k === 'ada' ? 'She' : 'He';
  const rec = recall1(f.k, f.q + ' ' + f.opts.join(' '), f.qday ?? null);
  return `Evening, ${LONG(NOW)}, 1930.\nCHARACTER: ${SHEET[f.k]}\nREMEMBERS: ${rec}${extra ? '\n' + extra : ''}\n\nQUESTION to ${f.k === 'ada' ? 'Mrs. Turner' : 'Mr. Hale'}: ${f.q}\n\nAnswer in one of these forms: ${order.map(i => `${He} answers, "${f.opts[i][0].toUpperCase() + f.opts[i].slice(1)}."`).join(' or: ')}`;
}
(async () => {
  await io.launch(); const sum = {};
  for (const mode of ['shuffle3', 'artefact', 'artefact3']) for (const [fi, f] of FACTS.entries()) for (let r = 0; r < 2; r++) {
    const votes = mode === 'artefact' ? 1 : 3; const tally = new Array(f.opts.length).fill(0); const raws = [];
    for (let v = 0; v < votes; v++) { const order = shuffle(f.opts.map((_, i) => i)); const a = await io.ask(promptS(f, order, mode.startsWith('artefact') ? ART[fi] : '')); raws.push(a); const c = classify(a, f); if (Number.isInteger(c)) tally[c]++; }
    const mx = Math.max(...tally); const c = mx ? tally.indexOf(mx) : null; const ok = c === f.truth;
    sum[mode] = sum[mode] || [0, 0, 0]; sum[mode][0]++; if (ok) sum[mode][1]++; if (c === null) sum[mode][2]++;
    console.log(mode.padEnd(9), f.q.slice(0, 38).padEnd(38), ok ? 'OK ' : c === null ? 'NUL' : 'BAD', JSON.stringify(tally), (raws[0] || '').slice(0, 70).replace(/\n/g, ' '));
  }
  for (const m in sum) console.log('SUM', m, 'ok', sum[m][1] + '/' + sum[m][0], 'unreadable', sum[m][2]);
  await io.close();
})();
