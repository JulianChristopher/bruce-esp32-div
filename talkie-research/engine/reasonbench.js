// A small test of everyday reasoning: situations from the simulation with sensible and unwise courses, and
// four ways of letting talkie think. Answers are read by the same grammar the simulation uses (intent.js).
//  V0 ask       : the open question as used now
//  V1 story     : the situation as a passage of a novel; talkie continues "She stood a moment, thinking. Then she"
//  V2 steps     : what troubles her most? -> what does she do about it? (two short questions)
//  V3 foresee   : three free ideas; the world tells what would come of each (money left, who is open); then she chooses
const io = require('./io.js'); const { parse } = require('./intent.js');
const AT = 'AT HAND:';
const S = [
  { id: 'rent-can-pay', who: 'Ada', f: true, ctx: `Twenty past seven in the evening, Friday, the 9th of January, 1931; bitterly cold.
CHARACTER: Mrs. Ada Turner, 41, charwoman; war-widow in Bermondsey with her son Bert. Honest, chapel-going, proud; very poor.
PLACE: her two rooms in Bermondsey. PRESENT: nobody else. PURSE: 9s. 4d.
NOW: The rent of seven shillings is due tonight; Mr. Gedge, the collector, calls at half past seven.
${AT} her purse; the rent-book on the shelf.`, good: ['rent', 'ask:gedge', 'talk:gedge', 'give:gedge', 'rest', 'go:HOME'], bad: ['sleep', 'go:pub', 'buy', 'eat'] },
  { id: 'rent-short', who: 'Ada', f: true, ctx: `Six o'clock in the evening, Friday, the 9th of January, 1931; bitterly cold.
CHARACTER: Mrs. Ada Turner, 41, charwoman; war-widow in Bermondsey with her son Bert. Honest, chapel-going, proud; very poor.
PLACE: her two rooms in Bermondsey. PRESENT: nobody else. PURSE: 2s. 1d.
NOW: The rent of seven shillings is due tonight at half past seven. Bert is out of work.
${AT} her late husband's silver watch on the mantelpiece; Lamb's the pawnbroker, open till seven; Mrs. Nolan across the landing.`, good: ['pawn', 'ask:nolan', 'ask:gedge', 'talk:nolan', 'go:pawnshop', 'go:nolan_rooms', 'seekwork', 'work'], bad: ['sleep', 'buy', 'eat', 'read'] },
  { id: 'joan-ill', who: 'Arthur', f: false, ctx: `Half past twelve in the afternoon, Tuesday, the 13th of January, 1931; raw and grey.
CHARACTER: Mr. Arthur Hale, 34, ledger clerk in Moorgate; wife Edith, daughter Joan (7). Conscientious, careful with money, timid with his chief.
PLACE: the clerks' room of the insurance office. PRESENT: Mr. Thomas, his chief. PURSE: 6s. 4d.
NOW: Joan has been ill in bed since Sunday with a bad cough and fever; the doctor has not been called. The doctor's fee is 3s. 6d.
${AT} Mr. Thomas at his desk; the Lyons tea-shop over the road; Dr. Gray's surgery in Islington, open from five.`, good: ['ask:thomas', 'talk:thomas', 'go:doctor', 'go:HOME', 'write', 'eat'], bad: ['buy', 'sleep', 'pray', 'read'] },
  { id: 'off-to-work', who: 'Ada', f: true, ctx: `Ten past seven in the morning, Wednesday, the 7th of January, 1931; frosty.
CHARACTER: Mrs. Ada Turner, 41, charwoman; she cleans the Moorgate insurance office from half past seven till nine, then the Finsbury Circus offices.
PLACE: her two rooms in Bermondsey. PRESENT: Bert. PURSE: 1s. 3d.
NOW: Mr. Thomas has warned her that if she misses the office again she will lose her place.
${AT} the office in Moorgate, thirty-five minutes' walk.`, good: ['go:office', 'work', 'go'], bad: ['sleep', 'rest', 'read', 'go:market', 'buy'] },
  { id: 'cold-no-coal', who: 'Ada', f: true, ctx: `Seven o'clock in the evening, Monday, the 5th of January, 1931; hard frost, -4°C.
CHARACTER: Mrs. Ada Turner, 41, charwoman; war-widow in Bermondsey with her son Bert. Proud; very poor.
PLACE: her two rooms in Bermondsey. PRESENT: Bert. PURSE: 1s. 2d.
NOW: The fire is out and the coal-box is empty; there is frost on the inside of the window. A hundredweight of coal costs a shilling at Barker's.
${AT} Barker's, the grocer and coal-dealer, open till eight, five minutes away.`, good: ['buy', 'go:chandler', 'ask:barker', 'ask:nolan', 'fire', 'talk:bert'], bad: ['go:pub', 'read', 'pray'] },
  { id: 'found-coin', who: 'Ada', f: true, ctx: `A quarter to eight in the morning, Thursday, the 8th of January, 1931; grey.
CHARACTER: Mrs. Ada Turner, 41, charwoman. Honest, chapel-going, proud; very poor.
PLACE: the empty clerks' room of the insurance office, where she is scrubbing. PRESENT: nobody else. PURSE: 4d.
NOW: Under Mr. Hale's desk she has just found a half-crown wedged in a crack of the boards.
${AT} Mr. Hale's desk; Mr. Thomas comes in at half past eight.`, good: ['own:desk', 'give', 'talk', 'ask', 'work', 'other'], bad: ['buy', 'go:pub'], keepIsBad: true }
];
const L = 'ABCDEF';
function classify(text, sc) {
  const it = parse((text || '').split(/(?<=[.!?])\s/)[0]); if (!it) return { tag: 'empty', ok: null };
  const t = (text || '').toLowerCase();
  if (sc.keepIsBad && /\b(keeps?|pockets?|puts it in her purse|slips it)\b/.test(t) && !/back|desk|mr\.? hale|returns?|gives?/.test(t)) return { tag: 'keep', ok: false };
  if (sc.id === 'found-coin' && /\b(desk|mr\.? hale|returns?|gives? it|lays? it|puts it (on|back))\b/.test(t)) return { tag: 'return', ok: true };
  const tag = it.verb + (it.to ? ':' + it.to : it.place ? ':' + it.place : '');
  const ok = sc.good.some(g => tag === g || tag.startsWith(g + ':') || g === it.verb) ? true : sc.bad.some(b => tag === b || tag.startsWith(b + ':') || b === it.verb) ? false : null;
  return { tag, ok };
}
const He = sc => (sc.f ? 'She' : 'He');
const V = {
  async ask(sc) { return io.ask(`${sc.ctx}\n\nWhat does ${sc.who} do now, as ${He(sc).toLowerCase()} truly would? Answer in the form: ${He(sc)} ... (one sentence)`); },
  async story(sc) { const a = await io.ask(`Continue this passage from a novel of 1931 by one sentence.\n\n${sc.ctx.replace(/^[A-Z]+:\s*/gm, '')}\n\n${sc.who} stood a moment, thinking. Then ${He(sc).toLowerCase()}`); return a ? `${He(sc)} ${a.replace(/^(she|he)\s+/i, '')}` : a; },
  async steps(sc) {
    const t = await io.ask(`${sc.ctx}\n\nWhat troubles ${sc.who} most just now? Answer in the form: What troubles ${sc.f ? 'her' : 'him'} most is ...`);
    if (!t) return null;
    return io.ask(`${sc.ctx}\n\n${t.split(/(?<=[.!?])\s/)[0]}\n\nWhat does ${sc.who} do about it now? Answer in the form: ${He(sc)} ... (one sentence)`);
  },
  async foresee(sc) {
    const ideas = []; for (let i = 0; i < 3; i++) { const a = await V.ask(sc); if (a && parse(a.split(/(?<=[.!?])\s/)[0])) ideas.push(a.split(/(?<=[.!?])\s/)[0]); }
    const uniq = [...new Set(ideas)]; if (uniq.length <= 1) return uniq[0] || null;
    // the world's foresight, written as plain consequences (as the engine would compute them)
    const purse = +(sc.ctx.match(/PURSE: (\d+)s\. (\d+)d\./) || [0, 0, 0]).slice(1).reduce((s2, x, i) => s2 + (i ? +x : 12 * x), 0);
    const fore = idea => { const it = parse(idea), t = idea.toLowerCase();
      if (it.verb === 'sleep') return 'nothing is done about what is pressing';
      if (it.verb === 'rent' || /rent/.test(t)) return purse >= 84 ? `the rent is paid; ${Math.floor((purse - 84) / 12)}s. ${(purse - 84) % 12}d. left` : 'she has not the seven shillings';
      if (it.verb === 'pawn') return 'ten shillings in hand, enough for the rent; the watch to be redeemed for eleven within ten weeks';
      if (it.verb === 'ask') return `it depends on whether ${it.to ? it.to.replace(/^\w/, c => c.toUpperCase()) : 'they'} will`;
      if (it.verb === 'buy') return /coal/.test(t) ? 'a fire tonight; a shilling gone' : 'some money spent';
      if (it.verb === 'go' && it.place === 'office') return 'she keeps her place';
      return 'no great difference either way'; };
    const order = uniq.map((_, i) => i).sort(() => Math.random() - 0.5);
    const a = await io.ask(`${sc.ctx}\n\n${sc.who} thinks of what ${He(sc).toLowerCase()} might do, and what would come of each:\n${order.map((oi, j) => `(${L[j]}) ${uniq[oi].replace(/^(She|He)\s+/, '')} (then: ${fore(uniq[oi])})`).join('\n')}\n\nWhich does ${He(sc).toLowerCase()} do? Answer in the form: ${He(sc)} chooses to ..., because ...`);
    const j = a ? (a.match(/\(([A-F])\)/) || [])[1] : null;
    if (j && L.indexOf(j) < order.length) return uniq[order[L.indexOf(j)]];
    const words = s2 => new Set((s2 || '').toLowerCase().match(/[a-z]{4,}/g) || []);
    const best = uniq.map(u => [u, [...words(u)].filter(w => words(a).has(w)).length]).sort((x, y) => y[1] - x[1])[0];
    return a && best[1] >= 2 ? best[0] : uniq[0];
  }
};
(async () => {
  await io.launch(); const R = {}; const reps = +(process.env.REPS || 3);
  for (const sc of S) for (const [name, fn] of Object.entries(V)) for (let r = 0; r < reps; r++) {
    let a = null; try { a = await fn(sc); } catch (e) {}
    const c = classify(a, sc); R[name] = R[name] || { good: 0, bad: 0, neutral: 0, empty: 0, n: 0 };
    R[name].n++; if (c.tag === 'empty') R[name].empty++; else if (c.ok === true) R[name].good++; else if (c.ok === false) R[name].bad++; else R[name].neutral++;
    console.log(sc.id.padEnd(13), name.padEnd(8), (c.ok === true ? 'GOOD' : c.ok === false ? 'BAD ' : c.tag === 'empty' ? 'EMPTY' : 'meh ').padEnd(5), c.tag.padEnd(16), (a || '').replace(/\n/g, ' ').slice(0, 110));
  }
  for (const [n, r] of Object.entries(R)) console.log('SUM', n.padEnd(8), `good ${r.good}/${r.n}  bad ${r.bad}  neutral ${r.neutral}  empty ${r.empty}`);
  await io.close();
})();
