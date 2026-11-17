// Learned rules, tried with the live game master: two sentences of a kind are resolved by the game master and learned;
// the third is resolved by the rule alone, and the game master's own program for it is the audit.
const S = require('./situations.js'), OPS = require('./ops1931.js'), GM = require('./gm.js'), R = require('./rules1931.js'), { Registry } = require('./registry1931.js');
const fs = require('fs'); const all = fs.readFileSync(__dirname + '/situations.jsonl', 'utf8').trim().split('\n').slice(0, 400).map(JSON.parse);
const reg = new Registry(null);
function ctxOf(w, k) {
  const p = w.people[k], objs = Object.entries(w.objects).filter(([, o]) => o.at === k && o.value).map(([id, o]) => `${id}=${o.name}`);
  const present = w.presentWith(k).map(q => ({ id: q.id, name: q.name }));
  const people = Object.values(w.people).filter(q => q.id !== k).slice(0, 40).map(q => ({ id: q.id, name: q.name }));
  const places = Object.keys(w.places).map(id => ({ id, name: `${w.places[id].name} (${w.places[id].kind}${w.places[id].district ? ', ' + w.places[id].district : ''})`, open: !w.places[id].open || w.isOpen(id) }));
  return { date: `day ${w.day}`, time: `${Math.floor(w.mod / 60)}:${String(w.mod % 60).padStart(2, '0')}`, who: k, name: p.name, place: `${w.places[p.place].name} [${p.place}]`, purse: OPS.money(Math.max(0, p.money)),
    own: objs, inPawn: Object.entries(w.objects).filter(([, o]) => o.at === 'lamb').map(([id, o]) => `${id}=${o.name}`), present, people, places,
    extra: `Stock at home: food for ${p.inv.food || 0} meals, coal for ${p.inv.coal || 0} fires.` };
}
const GROUPS = [
  ['ada', ["She goes to Barker's for a hundredweight of coal, and borrows a few lumps from Mrs. Nolan.", "She goes to Barker's for a loaf, and borrows a little tea from Mrs. Nolan.", "She goes to Barker's for a quarter of sugar, and borrows a little milk from Mrs. Nolan.", "She goes to Barker's for some soap, and borrows a candle from Mrs. Pollock."]],
  ['ada', ["She pawns her shawl, and buys bread with the money.", "She pawns her best boots, and buys coal with the money.", "She pawns her flat-irons, and buys tea with the money.", "She pawns her husband's watch, and buys a loaf with the money."]],
  ['ada', ["She goes across to Mrs. Nolan and asks her for the loan of a shilling.", "She goes down to Mrs. Pollock and asks her for the loan of sixpence.", "She goes across to Mrs. Nolan and asks her for the loan of ninepence.", "She goes across to Mrs. Nolan and asks her for the loan of two shillings."]],
  ['ada', ["She buys a pennyworth of milk at Barker's, then goes home.", "She buys a quarter of tea at Barker's, then goes home.", "She buys a pound of sugar at Barker's, then goes home.", "She buys a box of matches at Barker's, then goes home."]],
  ['arthur', ["He goes to the chemist's for a bottle of cough mixture for Joan, then goes home.", "He goes to the chemist's for some camphorated oil for Joan, then goes home.", "He goes to the chemist's for a box of cough lozenges for Joan, then goes home.", "He goes to the chemist's for a tin of ointment for Joan, then goes home."]]
];
(async () => {
  const rules = new R.Rules(null, { auditEvery: 1 }); let applied = 0, agreed = 0, groups = 0;
  for (const [k, sentences] of GROUPS) {
    groups++;
    const s = all.find(x => x.who === k) || all[0]; const w = S.makeWorld(s.snapshot.t).restore(s.snapshot);
    w.t = Math.floor(w.t / 1440) * 1440 + 10 * 60 + (w.dow() === 'sun' ? 1440 : 0); w.people[k].place = w.people[k].home; w.people[k].money = Math.max(w.people[k].money, 120);
    for (const q of ['nolan', 'mrspollock']) if (w.people[q]) { w.people[q].place = w.people[q].home; w.people[q].away = false; }
    w.hooks = Object.assign({}, w.hooks, { ask: () => null });
    for (let i = 0; i < sentences.length; i++) {
      const said = sentences[i], ctx = ctxOf(w, k);
      const last = i === sentences.length - 1, ru = last ? rules.apply(said, w, k) : null;
      let g = await GM.resolve(ctx, said), d = null;
      for (let a = 0; a < 2 && g; a++) { if (!g.plausible) break; d = OPS.deedOf(w, k, g.ops, { registry: reg, sentence: said }); if (d.aff || d.despair) break; g = await GM.resolve(ctx, said, d.why); }
      const okGM = d && d.aff;
      if (!last) { const r = okGM ? rules.learn(said, g.ops, w, k) : null; console.log(`\n[${k}] ${said}\n  gm: ${JSON.stringify(g && g.ops)}\n  ${okGM ? 'accepted' : 'refused: ' + (d && d.why)}${r ? '  → RULE ' + r.sig : ''}`); }
      else {
        console.log(`\n[${k}] ${said}\n  rule: ${ru ? JSON.stringify(ru.ops) : '(none)'}\n  gm:   ${JSON.stringify(g && g.ops)}`);
        if (ru) { applied++; const dr = OPS.deedOf(w, k, ru.ops, { registry: reg, sentence: said }); console.log('  rule deed:', dr.aff ? dr.preview.join('; ') : 'refused: ' + dr.why);
          rules.audit(ru.rule, ru.ops, g && g.ops, w.people[k].home); const ag = R.same(ru.ops, (g && g.ops) || [], w.people[k].home); if (ag) agreed++; console.log('  audit:', ag ? 'AGREES' : 'differs'); }
      }
    }
  }
  console.log(`\n${groups} kinds; rules learned ${rules.stats.learned}; applied ${applied}; agreed with the game master ${agreed}`, '\nstats', JSON.stringify(rules.stats), '\nprov', JSON.stringify(OPS.PROV), '\ngm', JSON.stringify(GM.STATS));
  fs.writeFileSync(__dirname + '/rulestest.json', JSON.stringify({ rules: rules.rules, cases: rules.cases, stats: rules.stats }, null, 1));
})();
