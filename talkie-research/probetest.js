// Probe-format and retrieval test on the real memories of the 90-day run (state at ~day 51).
const io = require('./io.js'); const fs = require('fs');
const S = require('./sim4_90/state.json'); const NOW = S.W.day;
const T0 = Date.UTC(1930, 2, 14); const MON = ['January','February','March','April','May','June'];
const dt = d => new Date(T0 + d * 864e5); const SHORT = d => `${dt(d).getUTCDate()} ${MON[dt(d).getUTCMonth()]}`;
const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const LONG = d => `${WD[dt(d).getUTCDay()]} the ${dt(d).getUTCDate()}${[,'st','nd','rd'][dt(d).getUTCDate() % 10 * (Math.floor(dt(d).getUTCDate() / 10) !== 1)] || 'th'} of ${MON[dt(d).getUTCMonth()]}`;
const SHEET = {
  ada: "Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor.",
  arthur: "Mr. Arthur Hale, 34, ledger clerk at an insurance office in Moorgate; wife Edith, daughter Joan (7). Conscientious, careful with money, timid with superiors."
};
const STOP = new Set('the a an and or of to in on at for with his her he she it is was be by as that this from had has have him them they their mr mrs said what did you your which who when how whether there were will would not no'.split(' '));
const words = t => (t || '').toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, '')) || [];
const ago = d => d === 'past' ? '(Long ago) ' : NOW - d === 0 ? '' : NOW - d === 1 ? '(Yesterday) ' : `(${SHORT(d)}) `;
const cut = t => t.length > 160 ? t.slice(0, 157).replace(/\s+\S*$/, '') + '…' : t;
// R0: the sim4 recall (linear recency penalty)
function recall0(k, query, budget = 520) {
  const m = S.agents[k].mem.filter(x => !x.belief); const q = new Set(words(query));
  const sc = m.map((x, i) => ({ x, i, s: x.imp * 1.5 + Math.min(words(x.text).filter(w => q.has(w)).length, 4) * 1.5 + (x.day === 'past' ? 0 : -(NOW - x.day) * 0.25) + (i >= m.length - 2 ? 2 : 0) })).sort((a, b) => b.s - a.s);
  return pack(sc, budget);
}
// R1: relevance first, logarithmic recency, date match, rare-word weighting (idf)
function recall1(k, query, qday = null, budget = 520) {
  const m = S.agents[k].mem.filter(x => !x.belief); const q = new Set(words(query));
  const df = {}; m.forEach(x => new Set(words(x.text)).forEach(w => df[w] = (df[w] || 0) + 1));
  const idf = w => Math.log(1 + m.length / (df[w] || 1));
  const sc = m.map((x, i) => {
    const ov = [...new Set(words(x.text))].filter(w => q.has(w)).reduce((s, w) => s + idf(w), 0);
    const age = x.day === 'past' ? 0 : NOW - x.day;
    return { x, i, s: x.imp + ov * 1.2 + (qday !== null && x.day === qday ? 8 : 0) - Math.log2(1 + age) * 0.6 };
  }).sort((a, b) => b.s - a.s);
  return pack(sc, budget);
}
function pack(sc, budget) { const out = []; let used = 0; for (const y of sc) { const t = ago(y.x.day) + cut(y.x.text); if (used + t.length > budget) continue; out.push(y); used += t.length + 1; if (out.length >= 5) break; } return out.sort((a, b) => a.i - b.i).map(y => ago(y.x.day) + cut(y.x.text)).join(' '); }

const FACTS = [
  { k: 'ada', q: 'Did you pawn anything this spring?', opts: ["my late husband's watch", 'nothing at all', 'my wedding ring'], kw: [/watch/, /nothing|never|not pawn/, /ring/], truth: 0 },
  { k: 'ada', q: "What became of your husband's watch, which you pawned?", opts: ['I redeemed it from the pawnbroker', 'It is still at the pawnshop', 'The pawnbroker sold it'], kw: [/redeem|got it back|fetched it|have it back|bought it back/, /still (at|in|with)|pawnshop|pawnbroker'?s? (has|keeps)/, /sold/], truth: 0 },
  { k: 'ada', q: `Did you pay the rent on ${LONG(36)}?`, qday: 36, opts: ['yes, in full', 'no, I asked the landlord to wait'], kw: [/\b(paid|yes)\b/, /wait|could not|no\b|didn't|did not/], truth: 1 },
  { k: 'ada', q: `Did you pay the rent on ${LONG(15)}?`, qday: 15, opts: ['yes, in full', 'no, I asked the landlord to wait'], kw: [/\b(paid|yes)\b/, /wait|could not|no\b|didn't|did not/], truth: 0 },
  { k: 'arthur', q: `How much did you give Edith for the housekeeping on ${LONG(0)}?`, qday: 0, opts: ['thirty shillings', 'thirty-five shillings', 'forty shillings', 'forty-five shillings'], kw: [/thirty(?!-)|\b30\b/, /thirty-five|\b35\b/, /forty(?!-)|\b40\b/, /forty-five|\b45\b/], truth: 2 },
  { k: 'arthur', q: 'In what state did Mr. Thomas find the quarterly ledger, the first time he examined it?', opts: ['in perfect order', 'complete, but with mistakes', 'not finished'], kw: [/perfect/, /mistake/, /not finished|unfinished|incomplete|not complete/], truth: 2 },
];
const L = 'ABCD';
function prompt(f, fmt, rec) {
  const He = f.k === 'ada' ? 'She' : 'He', he = He.toLowerCase();
  const ctx = `Evening, ${LONG(NOW)}, 1930.\nCHARACTER: ${SHEET[f.k]}\nREMEMBERS: ${rec}\n\nQUESTION to ${f.k === 'ada' ? 'Mrs. Turner' : 'Mr. Hale'}: ${f.q}`;
  if (fmt === 'F0') return `${ctx}\n${f.opts.map((o, j) => `(${L[j]}) ${o}`).join('\n')}\n\nAnswer in the form: ${He} answers that ...`;
  if (fmt === 'F1') return `${ctx}\n\nAnswer in one of these forms: ${f.opts.map(o => `${He} answers, "${o[0].toUpperCase() + o.slice(1)}."`).join(' or: ')}`;
  return `${ctx}\n\nAnswer in the form: ${He} answers, "..."`;
}
function classify(ans, f) { if (!ans) return null; const a = ans.toLowerCase(); const hits = f.kw.map((r, i) => r.test(a) ? i : -1).filter(i => i >= 0); if (hits.length === 1) return hits[0]; const L2 = a.match(/\(([a-d])\)/); if (L2) return 'abcd'.indexOf(L2[1]); return hits.length ? 'multi' : null; }

(async () => {
  await io.launch(); const res = []; const out = fs.createWriteStream(__dirname + '/probetest.jsonl');
  for (const rv of ['R0', 'R1']) for (const fmt of ['F0', 'F1', 'F2']) for (const f of FACTS) {
    const rec = rv === 'R0' ? recall0(f.k, f.q + ' ' + f.opts.join(' ')) : recall1(f.k, f.q + (fmt === 'F2' ? '' : ' ' + f.opts.join(' ')), f.qday ?? null);
    const hasTruth = /pawn|redeem|rent|landlord|housekeeping|ledger/.test(rec);
    for (let r = 0; r < 3; r++) {
      const a = await io.ask(prompt(f, fmt, rec)); const c = classify(a, f);
      const row = { rv, fmt, q: f.q, c, ok: c === f.truth, a: (a || '').slice(0, 160), rec: r === 0 ? rec : undefined };
      res.push(row); out.write(JSON.stringify(row) + '\n');
      console.log(rv, fmt, f.q.slice(0, 40).padEnd(40), c === f.truth ? 'OK ' : c === null ? 'NUL' : 'BAD', (a || '').slice(0, 90).replace(/\n/g, ' '));
    }
  }
  for (const rv of ['R0', 'R1']) for (const fmt of ['F0', 'F1', 'F2']) { const x = res.filter(r => r.rv === rv && r.fmt === fmt); console.log('SUM', rv, fmt, 'ok', x.filter(r => r.ok).length + '/' + x.length, 'unreadable', x.filter(r => r.c === null || r.c === 'multi').length); }
  await io.close();
})();
