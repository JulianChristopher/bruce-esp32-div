// Several open "what does she do?" samples, merged by the grammar, then talkie chooses among its own ideas.
const io = require('./io.js'); const { parse } = require('./intent.js');
const SIT = {
  Ada: `Seven o'clock in the evening, Friday, the 9th of January, 1931; bitterly cold, with a hard frost (-4° to 1°C).
CHARACTER: Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor. She would rather go hungry than go on the parish.
SCENE: The fire is out; the room is bitterly cold, with frost on the inside of the window. The coal-box is empty. Bert has been out of work since Monday.
PLACE: Mrs. Turner's two rooms in Bermondsey. PRESENT: nobody else. PURSE: 2s. 1d.
FEELS: She is cold; her nerves are on edge.
WANTS TO: find the seven shillings for the rent by tonight.
AT HAND: Mr. Gedge the collector calls at half past seven; Mrs. Nolan is across the landing; Barker's (grocer, gives credit) is open till eight; her late husband's silver watch is on the mantelpiece.`,
  Arthur: `Half past twelve in the afternoon, Tuesday, the 13th of January, 1931; raw and grey.
CHARACTER: Mr. Arthur Hale, 34, ledger clerk at an insurance office in Moorgate, £3 10s. a week; wife Edith, daughter Joan (7). Conscientious, careful with money, timid with superiors. Joan is their only child.
SCENE: Pens scratch; the gas is lit against the gloom. Joan is ill in bed at home with a bad cough; the doctor has not been called.
PLACE: the clerks' room of the Moorgate Fire and Life Assurance Company. PRESENT: Mr. Walter Thomas; young Mr. Fenn. PURSE: 6s. 4d.
FEELS: He is hungry; his nerves are on edge.
WANTS TO: see that Joan gets well.`
};
(async () => {
  await io.launch();
  for (const [who, ctx] of Object.entries(SIT)) {
    const S = who === 'Ada' ? 'She' : 'He';
    const samples = [];
    for (let i = 0; i < 5; i++) samples.push(await io.ask(`${ctx}\n\nWhat does ${who === 'Ada' ? 'Ada' : 'Arthur'} do now, as ${S.toLowerCase()} truly would? Answer in the form: ${S} ... (one sentence)`));
    const ideas = []; const seen = new Set();
    for (const a of samples) { const t = (a || '').split(/(?<=[.!?])\s/)[0]; const it = parse(t); if (!it) continue; const key = it.verb + ':' + (it.to || it.place || (it.good && it.good.item) || it.what || ''); if (seen.has(key)) continue; seen.add(key); ideas.push(t.replace(/^(She|He)\s+/, '')); }
    console.log(`\n== ${who}: ${samples.filter(Boolean).length}/5 answered; ${ideas.length} distinct ideas`); samples.forEach(x => console.log('   sample:', (x || '(empty)').slice(0, 130)));
    if (ideas.length < 2) continue;
    const L = 'ABCDE';
    for (let r = 0; r < 3; r++) {
      const order = ideas.map((_, i) => i).sort(() => Math.random() - 0.5);
      const ans = await io.ask(`${ctx}\n\n${who === 'Ada' ? 'Ada' : 'Arthur'} turns over in ${who === 'Ada' ? 'her' : 'his'} mind what ${S.toLowerCase()} might do:\n${order.map((oi, j) => `(${L[j]}) ${ideas[oi]}`).join('\n')}\n\nWhich does ${S.toLowerCase()} do, as ${S.toLowerCase()} truly would? Answer in the form: ${S} chooses to ..., because ...`);
      console.log('   final:', (ans || '(empty)').slice(0, 170));
    }
  }
  await io.close();
})();
