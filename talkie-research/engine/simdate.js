// The first day of a run (START=YYYY-MM-DD, default Friday 2 January 1931) and the decade's weather by date.
'use strict';
const START = process.env.START || '1931-01-02';
const T0 = Date.parse(START + 'T00:00:00Z');
const iso = d => new Date(T0 + d * 864e5).toISOString().slice(0, 10);
let DW = null; const decadeWeather = () => (DW = DW || Object.fromEntries(require('./decade/weather.json').map(x => [x.date, x])));
const weatherOn = d => decadeWeather()[iso(d)] || null;
module.exports = { START, T0, iso, weatherOn };
