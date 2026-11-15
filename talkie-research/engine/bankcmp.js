// paired comparison of the bank runs: the same situations, told as a form (open), as a novel asked in the past (prose), as a novel asked in the present (hybrid)
const fs = require('fs'); const M = ['open', 'prose', 'hybrid'];
const R = {}; for (const m of M) { R[m] = {}; if (fs.existsSync(`bank_${m}${process.env.SUF || ""}.jsonl`)) for (const l of fs.readFileSync(`bank_${m}${process.env.SUF || ""}.jsonl`, 'utf8').trim().split('\n')) { const r = JSON.parse(l); R[m][r.id] = r; } }
const mean = xs => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-';
const val = r => r && r.deed && r.deed.deed === 'judged' ? Math.min(1.5, r.deed.rel) : null;
for (const m of M) { const rs = Object.values(R[m]); const j = rs.filter(r => val(r) !== null);
  const labels = new Set(j.map(r => r.deed.label.replace(/\s*\(.*$/, '')));
  console.log(`${m.padEnd(7)} n=${rs.length} answered ${rs.filter(r => r.answer).length} judged ${j.length} refused ${rs.filter(r => r.deed && r.deed.deed === 'refused').length} mean ${mean(j.map(val))} beats-every-listed ${j.filter(r => r.deed.beatsBest).length} distinct deeds ${labels.size} poor(<0.3) ${j.filter(r => val(r) < 0.3).length}`); }
const ids = Object.keys(R.open).filter(id => M.every(m => val(R[m][id]) !== null));
console.log(`\npaired (judged in all three): ${ids.length}`); for (const m of M) console.log(`  ${m.padEnd(7)} ${mean(ids.map(id => val(R[m][id])))}`);
const byT = {}; for (const id of ids) { const t = R.open[id].template; (byT[t] = byT[t] || { open: [], prose: [], hybrid: [] }); for (const m of M) byT[t][m].push(val(R[m][id])); }
console.log('\nby kind (paired):'); for (const [t, x] of Object.entries(byT)) console.log(`  ${t.padEnd(16)} n=${x.open.length}  open ${mean(x.open)}  prose ${mean(x.prose)}  hybrid ${mean(x.hybrid)}`);
// unjudged answers: what the engine could not place
for (const m of M) { const u = Object.values(R[m]).filter(r => r.answer && val(r) === null).map(r => `${r.deed.deed}${r.deed.why ? ' (' + r.deed.why + ')' : ''}: ${r.answer.slice(0, 80)}`); console.log(`\n${m} not judged (${u.length}):\n  ` + u.slice(0, 8).join('\n  ')); }
