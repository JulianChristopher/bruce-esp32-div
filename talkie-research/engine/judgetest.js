// The engine judges a decision by rolling the world on: Ada on a Friday evening, rent due, collector at the door.
const { World } = require('./world.js'); const DEF = require('./london1931.js'); const { outdoorWarmth } = require('./life1931.js');
const T0 = Date.UTC(1931, 0, 2);
const w = new World({ ...DEF, weather: () => 'bitterly cold' }, { T0, days: 90, startMinute: 7 * 1440 + 19 * 60 + 5 });   // day 7 = Friday 9 Jan
const money = d => `${Math.floor(d / 12)}s. ${d % 12}d.`;
w.simHooks = require('./situations.js').simHooks;
w.hooks = Object.assign(Object.create(w.simHooks), { w });
w.flags.rentDue = true; w.flags.rentDueAt = w.t - 5; w.flags.bertWork = false;
for (const [label, purse, coal, food] of [['has the rent', 112, 0, 1], ['short of the rent', 25, 0, 1]]) {
  w.people.ada.money = purse; w.people.ada.inv = { coal, food }; w.people.ada.needs = { hunger: 55, energy: 50, warmth: 70, social: 40 };
  w.stepBackground();
  const j = w.judge('ada', 24);
  console.log(`\n== Ada ${label} (${money(purse)}), urgent: ${j.urgent.map(u => u.key + ' ' + Math.round(u.w)).join(', ')}`);
  for (const r of j.all) console.log(`   ${r.after.toFixed(1).padStart(6)}  ${r.label.slice(0, 95)}  -> money ${money(r.money)}, rent ${r.flags.rentDue ? 'still due' : r.flags.rentOwing ? 'owing' : 'paid'}`);
}
