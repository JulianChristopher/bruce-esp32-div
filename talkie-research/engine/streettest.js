const { makeStreet } = require('./street1931.js'); const LIFE = require('./life1931.js');
const S = makeStreet(31); const DW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
console.log(S.hh.slice(0, 4).map(S.describe).join('\n'));
const kinds = {};
for (let d = 0; d < 90; d++) { const wx = LIFE.weatherOf(d), dow = DW[new Date(Date.UTC(1931, 0, 2 + d)).getUTCDay()];
  const ev = S.step(d, { dow, frost: wx.tmin < 0, cold: wx.tmean < 6, barkerLimit: S.slateTotal > 900 ? 60 : 120 });
  for (const e of ev) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  if (d % 15 === 0) console.log(d, dow, JSON.stringify(S.stats()));
  if (d < 12) for (const e of ev) console.log('   ', d, e.text); }
console.log(kinds, JSON.stringify(S.stats()));
let r = 0; for (let d = 0; d < 90; d++) if (S.requestFor(d, 40)) r++; console.log('requests in 90 days', r);
