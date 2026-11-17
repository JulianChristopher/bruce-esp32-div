// Compare runs: model calls, decisions and their judged quality, the household's course, plans, promotion, cost.
// usage: node runcmp.js live7b tempo7 [...]
'use strict';
const fs = require('fs'), path = require('path');
const rows = [];
for (const run of process.argv.slice(2)) {
  let m; try { m = JSON.parse(fs.readFileSync(path.join(__dirname, run, 'metrics.json'), 'utf8')); } catch (e) { console.log(run, 'no metrics'); continue; }
  const S = m.STATS || {}, M = m.METRICS || {}, W = m.W || {};
  const days = (M.days || []).length, dec = M.decisions || [];
  const rel = dec.filter(d => d.rel != null), relMean = rel.length ? rel.reduce((s, d) => s + d.rel, 0) / rel.length : null;
  const byWho = {}; for (const d of dec) (byWho[d.who] = byWho[d.who] || []).push(d);
  const last = (M.days || [])[days - 1] || {};
  let log = ''; try { log = fs.readFileSync(path.join(__dirname, run + '.log'), 'utf8'); } catch (e) {}
  const count = re => (log.match(re) || []).length;
  rows.push({ run, days,
    asksPerDay: days ? +(S.asks / days).toFixed(1) : null, openDecisionsPerDay: days ? +(count(/ thinks: \(in (her|his) own words\)/g) / days).toFixed(1) : null,
    habitTurnsPerDay: days ? +(count(/\(as usual\)/g) / days).toFixed(1) : null, judged: rel.length, decisionScore: relMean != null ? +relMean.toFixed(2) : null,
    zoom: S.zoom || null, rentPaidDays: Object.keys(W.rentPaid || {}).length, rentOwing: !!(W.rentOwingCount), despair: S.despair || 0,
    pawned: count(/pawned /g), plans: { items: S.planItems || 0, done: S.planDone || 0, failed: S.planFailed || 0, missed: S.planMissed || 0, unread: S.planUnread || 0 },
    promoted: S.promoted || 0, conversations: S.convs || 0, consents: S.consents || 0, visits: S.visits || 0,
    gm: S.gm ? { calls: S.gm.calls, cost: +(S.gm.cost || 0).toFixed(3) } : null, openDeeds: S.gmOpen || 0, rulesUsed: S.ruleUsed || 0,
    melodrama: (() => { const th = log.split('\n').filter(l => / thinks: \(in (her|his) own words\)/.test(l)); const dark = th.filter(l => /\b(die|dies|dying|death|dead|starv\w*|ruin\w*|despair\w*|drown\w*|beg|begs|begging|steal\w*|workhouse|suicide|grave|hopeless|wretched|misery)\b/i.test(l)); return { thoughts: th.length, dark: dark.length, share: th.length ? +(dark.length / th.length).toFixed(2) : null }; })(),
    chorus: S.chorus || null,
    endMoney: last.money || null, probesOk: (M.probes || []).filter(p => p.final).length ? `${(M.probes || []).filter(p => p.final && p.ok).length}/${(M.probes || []).filter(p => p.final).length}` : null });
}
console.log(JSON.stringify(rows, null, 1));
