// Does talkie already know the 1930 news from its training? Ask the news probes cold, with no memory at all.
const io = require('./io.js'); const { ITEMS } = require('./news1930.js');
const src = require('fs').readFileSync(__dirname + '/sim6.js', 'utf8'); const L = 'ABCDEFGHIJKL';
eval(src.slice(src.indexOf('function pick(ans, opts)'), src.indexOf('async function choose')) + src.slice(src.indexOf('function pickProbe'), src.indexOf('let probeN')) + ';globalThis.pp=pickProbe;');
(async () => {
  await io.launch(); let ok = 0, n = 0, unread = 0;
  for (const [d, , p] of ITEMS) { if (!p) continue;
    for (let r = 0; r < 2; r++) {
      const a = await io.ask(`The year is 1930. A London clerk is asked: ${p.q.replace(/did the papers report in March\?/, 'was reported in the papers this spring?')}\n\nAnswer in the form: He answers, "..."`);
      const j = pp(a, p.opts); n++; if (j === 0) ok++; if (j === null) unread++;
      console.log(j === 0 ? 'KNOWS' : j === null ? '  ?  ' : 'WRONG', p.q.slice(0, 55).padEnd(55), (a || '').slice(0, 80).replace(/\n/g, ' '));
    } }
  console.log(`cold, no memory: ${ok}/${n} right, ${unread} unreadable`); await io.close();
})();
