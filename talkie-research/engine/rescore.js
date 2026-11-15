// re-judge the saved answers of the bank runs with the current grammar and engine (no new questions to talkie)
const fs = require('fs'); const SIT = require('./situations.js'), VERBS = require('./verbs.js');
const all = {}; for (const l of fs.readFileSync(__dirname + '/situations.jsonl', 'utf8').trim().split('\n')) { const s = JSON.parse(l); all[s.id] = s; }
const first = t => ((t || '').replace(/\b(Mrs|Mr|Dr|St)\./g, '$1§').split(/(?<=[.!?])\s/)[0] || '').replace(/§/g, '.');
const src = fs.readFileSync(__dirname + '/bankrun.js', 'utf8'); eval(src.slice(src.indexOf('function scoreDeed'), src.indexOf('function score(')));
for (const m of (process.argv[2] || 'open,prose,hybrid').split(',')) {
  const f = `bank_${m}.jsonl`; if (!fs.existsSync(f)) continue;
  const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  for (const r of rows) if (r.answer) { const ans = r.answer.replace(/^(She|He) (Mrs\.|Mr\.) \w+ /, '$1 '); try { r.deed = scoreDeed(all[r.id], ans); } catch (e) { r.deed = { deed: 'error', why: String(e).slice(0, 80) }; } }
  fs.writeFileSync(`bank_${m}.rescored.jsonl`, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}
