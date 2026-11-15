// Builds the dashboard's data files from the run folders. Usage: node dashdata.js  -> dash/*.json
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'dash'); fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.UTC(1930, 2, 14); const iso = d => new Date(T0 + d * 864e5).toISOString().slice(0, 10);
const RUNS = [['sim3_14', 'v3.0 (14 Tage)'], ['sim31_14', 'v3.1 (14 Tage)'], ['sim33_14', 'v3.3 (14 Tage)'], ['sim4_90', 'v4 (90 Tage)'], ['sim5_val3', 'v5 (7 Tage, Validierung)'], ['sim5_90', 'v5 (90 Tage)']];
const r2 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;
const runs = [];
for (const [dir, label] of RUNS) {
  const f = path.join(__dirname, dir, 'metrics.json'); if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); const S = j.STATS, M = j.METRICS;
  const P = M.probes || [], D = M.diaries || [];
  const answered = P.filter(p => p.answer != null);
  runs.push({ run: label, folder: dir, days: (M.days || []).length, asks: S.asks, avg_ms: S.timed ? Math.round(S.ms / S.timed) : null,
    empty_rate: r2((S.nullReplies || 0) / S.asks), unreadable_rate: r2(S.unreadable / Math.max(1, S.choices)),
    probes: P.length, memory_correct: P.length ? r2(P.filter(p => p.ok).length / P.length) : null, memory_correct_of_answered: answered.length ? r2(P.filter(p => p.ok).length / answered.length) : null,
    diary_facts_kept: r2(D.reduce((s, x) => s + x.kept, 0) / Math.max(1, D.reduce((s, x) => s + x.facts, 0))), errors: S.errors || 0 });
}
fs.writeFileSync(path.join(OUT, 'runs.json'), JSON.stringify(runs, null, 1));
// detail of the long run (and v5 if present)
for (const [dir, tag] of [['sim4_90', 'v4'], ['sim5_val3', 'v5']]) {
  const f = path.join(__dirname, dir, 'metrics.json'); if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); const M = j.METRICS;
  if (tag === 'v4') {
    const money = []; for (const d of M.days) for (const [who, m] of Object.entries(d.money)) money.push({ date: iso(d.day), day: d.day, who: { ada: 'Ada', arthur: 'Arthur', thomas: 'Mr. Thomas' }[who], pence: m, shillings: r2(m / 12) });
    fs.writeFileSync(path.join(OUT, 'money.json'), JSON.stringify(money));
    const asks = M.days.map(d => ({ date: iso(d.day), day: d.day, asks: d.asks }));
    fs.writeFileSync(path.join(OUT, 'asks.json'), JSON.stringify(asks));
    const last = M.days.at(-1); const ops = [];
    if (last) for (const [k, o] of Object.entries(last.op)) for (const [p, v] of Object.entries(o)) ops.push({ who: k, about: p, value: v });
    fs.writeFileSync(path.join(OUT, 'opinions.json'), JSON.stringify(ops));
  }
  const probes = (M.probes || []).map(p => ({ run: tag, date: iso(Math.min(p.day, 89)), day: p.day, age: p.age, who: p.who, question: p.q, answer: p.answer, truth: p.truth, ok: p.ok ? 1 : 0, answered: p.answer == null ? 0 : 1, kind: p.kind || 'life', aided: p.aided ? 1 : 0, final: p.final ? 1 : 0 }));
  fs.writeFileSync(path.join(OUT, `probes_${tag}.json`), JSON.stringify(probes));
  // story events
  const story = fs.readFileSync(path.join(__dirname, dir, 'story.txt'), 'utf8').split('\n'); let day = -1; const ev = [];
  for (const l of story) {
    if (/^######## /.test(l) && !/Final memory/.test(l)) day++;
    const m = l.match(/^\s*(★|⚑|✦|⚖)\s*(.*)$/); if (!m || day < 0) continue;
    ev.push({ run: tag, date: iso(day), day, kind: { '★': 'Ereignis', '⚑': 'Pflicht', '✦': 'Lehre', '⚖': 'Abmachung' }[m[1]], text: m[2].slice(0, 220) });
  }
  fs.writeFileSync(path.join(OUT, `events_${tag}.json`), JSON.stringify(ev));
}
const { ITEMS, cablesFor } = require('./news1930.js');
const news = ITEMS.map(([d, text, p]) => ({ date: iso(d), day: d, text, has_question: p ? 1 : 0, source: 'zusammengestellt' }));
const { wireFor } = require('./news1930.js');
for (let d = 0; d < 90; d++) for (const c of wireFor(d, 2)) news.push({ date: iso(d), day: d, text: c.text, has_question: 0, source: 'NewsWire (AP-Meldung vom Vortag)' });
news.sort((a, b) => a.day - b.day);
fs.writeFileSync(path.join(OUT, 'news.json'), JSON.stringify(news));
console.log(fs.readdirSync(OUT).map(f => f + ' ' + fs.statSync(path.join(OUT, f)).size).join('\n'));
console.log(JSON.stringify(runs, null, 0));
