// Which question form lets talkie read an answer that is plainly in its context?
const io = require('./io.js');
const CTX = `Seven o'clock in the morning, Saturday, the 15th of March, 1930; fine and cold.
CHARACTER: Mr. Arthur Hale, 34, ledger clerk at an insurance office in Moorgate, £3 10s. a week; wife Edith, daughter Joan (7). Conscientious, careful with money, timid with superiors.
PLACE: the Hales' house in Islington. PRESENT: Mrs. Edith Hale; Joan Hale. PURSE: £3 13s. 3d.`;
const CASES = [
  { mem: "(Yesterday) He read in the Daily Herald: A NEW PLANET. The Lowell Observatory in Arizona announces the discovery of a ninth planet, far beyond Neptune. (Yesterday) He read in the Daily Herald: INDIA. Mr. Gandhi and his followers are marching to the sea. (Yesterday) Mr. Thomas set him to balance the quarterly ledger.",
    q: 'What new discovery in the heavens did the papers report in March?', opts: ['A ninth planet beyond Neptune', 'A great comet near the sun', 'A new moon of Jupiter'], kw: [/planet|neptune/i, /comet/i, /moon|jupiter/i] },
  { mem: "(14 March) He gave Edith 40 shillings for the week's housekeeping. (21 March) He gave Edith 35 shillings for the week's housekeeping. (Yesterday) Mr. Thomas set him to balance the quarterly ledger.",
    q: "How much housekeeping money did you give Edith on Friday, the 14th of March?", opts: ['Forty shillings', 'Thirty shillings', 'Forty-five shillings'], kw: [/forty(?![- ]five)|\b40\b/i, /thirty|\b30\b/i, /forty[- ]five|\b45\b/i] },
  { mem: "(14 March) She paid the landlord the rent of seven shillings. (21 March) She asked the landlord to wait for the rent; he grumbled and gave her till Monday. (Yesterday) She bought a loaf at the market.",
    q: "Did you pay the rent on Friday, the 21st of March?", opts: ['No, I asked the landlord to wait', 'Yes, in full'], kw: [/\bno\b|wait|could not|did not/i, /\byes\b|in full|i paid/i], ada: true }
];
const ADA = `Seven o'clock in the morning, Saturday, the 22nd of March, 1930; fine and cold.
CHARACTER: Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor.
PLACE: Mrs. Turner's two rooms in Bermondsey. PRESENT: Bert Turner. PURSE: 4s. 2d.`;
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const cls = (a, c) => { if (!a) return null; const h = c.kw.map((r, i) => r.test(a) ? i : -1).filter(i => i >= 0); return h.length === 1 ? h[0] : null; };
(async () => {
  await io.launch(); const sum = {};
  for (const c of CASES) {
    const He = c.ada ? 'She' : 'He', name = c.ada ? 'Mrs. Ada Turner' : 'Mr. Arthur Hale', base = c.ada ? ADA : CTX;
    const forms = {
      F1: o => `${base}\nREMEMBERS: ${c.mem}\n\nQUESTION to ${name}: ${c.q}\n\nAnswer in one of these forms: ${o.map(x => `${He} answers, "${x}."`).join(' or: ')}`,
      F2: () => `${base}\nREMEMBERS: ${c.mem}\n\nQUESTION to ${name}: ${c.q}\n\nAnswer in the form: ${He} answers, "..."`,
      F4: o => `${base}\n\nQUESTION to ${name}: ${c.q}\n\n${He} remembers: ${c.mem}\n\nAnswer in one of these forms: ${o.map(x => `${He} answers, "${x}."`).join(' or: ')}`,
      F5: () => `${c.mem.replace(/\(([^)]+)\) /g, '$1: ')}\n\nFrom the notes above: ${c.q.replace(/\byou\b/g, c.ada ? 'she' : 'he').replace(/\byour\b/g, c.ada ? 'her' : 'his')}\nAnswer in the form: The answer is ...`,
    };
    for (const [fk, fn] of Object.entries(forms)) for (let r = 0; r < 4; r++) {
      const a = await io.ask(fn(shuffle(c.opts))); const k = cls(a, c);
      sum[fk] = sum[fk] || [0, 0, 0]; sum[fk][0]++; if (k === 0) sum[fk][1]++; if (k === null) sum[fk][2]++;
      console.log(fk, c.q.slice(0, 30), k === 0 ? 'OK ' : k === null ? 'NUL' : 'BAD', (a || '').slice(0, 100).replace(/\n/g, ' '));
    }
    // F3: yes/no verification of each option, 2 reps
    for (let r = 0; r < 2; r++) {
      const yes = [];
      for (const o of c.opts) { const a = await io.ask(`${base}\nREMEMBERS: ${c.mem}\n\nQUESTION to ${name}: ${c.q} Was it this: "${o}"?\n\nAnswer in the form: ${He} answers, "Yes, ..." or: ${He} answers, "No, ..."`); yes.push(/^\W*(?:(?:she|he|mrs?\.? \w+) (?:answers|answered|replies)[,:]?\s*)?"?\s*yes\b/i.test(a || '') ? 1 : 0); }
      const ok = yes[0] === 1 && yes.slice(1).every(y => y === 0);
      sum.F3 = sum.F3 || [0, 0, 0]; sum.F3[0]++; if (ok) sum.F3[1]++;
      console.log('F3', c.q.slice(0, 30), ok ? 'OK ' : 'BAD', JSON.stringify(yes));
    }
  }
  for (const k in sum) console.log('SUM', k, 'ok', sum[k][1] + '/' + sum[k][0], 'unreadable', sum[k][2]);
  await io.close();
})();
