// Open deeds, tried in real situations: the game master writes the program, the engine checks it on a fork.
const S = require('./situations.js'), OPS = require('./ops1931.js'), GM = require('./gm.js'), { Registry } = require('./registry1931.js');
const fs = require('fs'); const all = fs.readFileSync(__dirname + '/situations.jsonl', 'utf8').trim().split('\n').slice(0, 400).map(JSON.parse);
const reg = new Registry(null);
function ctxOf(w, k) {
  const p = w.people[k], objs = Object.entries(w.objects).filter(([, o]) => o.at === k && o.value).map(([id, o]) => `${id}=${o.name}`);
  const present = w.presentWith(k).map(q => ({ id: q.id, name: q.name }));
  const people = Object.values(w.people).filter(q => q.id !== k).slice(0, 40).map(q => ({ id: q.id, name: q.name }));
  const places = Object.keys(w.places).map(id => ({ id: `${id} (${w.places[id].kind})`, open: w.isOpen(id) }));
  return { date: `day ${w.day}`, time: `${Math.floor(w.mod / 60)}:${String(w.mod % 60).padStart(2, '0')}`, who: k, name: p.name, place: `${w.places[p.place].name} [${p.place}]`, purse: OPS.money(Math.max(0, p.money)),
    own: objs, inPawn: Object.entries(w.objects).filter(([, o]) => o.at === 'lamb').map(([id, o]) => `${id}=${o.name}`), present, people, places,
    extra: `Stock at home: food for ${p.inv.food || 0} meals, coal for ${p.inv.coal || 0} fires.` };
}
const TESTS = [
  ['rent-evening', 'She goes to Barker\'s for a hundredweight of coal, and borrows a few lumps from Mrs. Nolan to tide her over.'],
  ['cold-evening', 'She goes across the landing and asks Mrs. Nolan for the loan of a few lumps of coal.'],
  ['hungry-no-food', 'She takes her tea-caddy and her husband\'s old razor to Lamb\'s and buys bread and dripping with the money.'],
  ['joan-ill-home', 'He goes out to the coffee-stall at the corner and buys a cup of cocoa for Joan.'],
  ['hungry-no-food', 'She goes to the cookshop and buys a basin of pease-pudding and a saveloy for Bert.'],
  ['payday-home', 'She minds Mrs. Pollock\'s baby for the afternoon, for fourpence.'],
  ['rent-monday', 'She drowns herself in the river.'],
  ['in-debt', 'She goes to the moneylender in Jamaica Road and borrows ten shillings at a shilling in the pound.']
];
(async () => {
  for (const [tpl, said] of TESTS) {
    const s = all.find(x => x.template === tpl) || all[0]; const w = S.makeWorld(s.snapshot.t).restore(s.snapshot); const k = s.who;
    const ctx = ctxOf(w, k); let g = await GM.resolve(ctx, said), d = null, why = null;
    for (let a = 0; a < 2 && g; a++) { if (!g.plausible) { why = 'implausible'; break; } d = OPS.deedOf(w, k, g.ops, { registry: reg, sentence: said }); if (d.aff || d.despair) break; why = d.why; g = await GM.resolve(ctx, said, why); }
    console.log('\n' + said, '\n  ops:', JSON.stringify(g && g.ops), '\n  →', d && d.aff ? d.aff.label + ` [${d.minutes} min]` : d && d.despair ? 'DESPAIR (world answers)' : 'refused: ' + why);
  }
  console.log('\nregistry:', JSON.stringify(reg.items.map(i => [i.entity, i.kind, i.id, i.hint])), '\ngm', JSON.stringify(GM.STATS));
})();
