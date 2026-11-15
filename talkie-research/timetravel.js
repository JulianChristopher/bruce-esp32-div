// Time travel: three (fictional) people from 14 March 1930 wake up in London on 14 March 2026.
// Each scene: observation without modern words -> character interprets -> explanation -> reaction.
// The script keeps persona, date, memory and money; talkie only speaks for the character.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, 'timetravel');
fs.mkdirSync(OUT, { recursive: true });

const CHARS = {
  arthur: { name: 'Arthur Hale', he: 'he', his: 'his',
    sheet: "Arthur Hale, aged thirty-four, a ledger clerk in an insurance office in the City of London, living in Islington with his wife Edith and daughter Joan. Careful with money, fond of his garden, a reader of the newspaper. He has three pounds ten shillings, his week's wages, in his pocket." },
  ada: { name: 'Ada Turner', he: 'she', his: 'her',
    sheet: "Mrs. Ada Turner, aged forty-one, a charwoman who scrubs offices in the City, living in two rooms in Bermondsey. Her husband was killed in the Great War, and she has brought up two sons alone. Plain-spoken, hard-working, chapel-going, with a sharp tongue and a good heart. She has eleven shillings in her purse." },
  henry: { name: 'Dr. Henry Cole', he: 'he', his: 'his',
    sheet: "Dr. Henry Cole, aged fifty-two, a physicist at the Cavendish Laboratory in Cambridge, who works upon the atom and radio-activity. A bachelor, precise, curious, a little dry in manner, and a great reader. He has two pounds in his pocket-book." }
};
const MONEY = { arthur: 840, ada: 132, henry: 480 };   // in old pence

const SCENES = [
  { id: 'wake', time: 'eight o\'clock in the morning',
    observe: "{N} wakes in a clean white room. {He} last remembers going to bed on Friday the 14th of March, 1930. A printed calendar upon the wall shows the date: Saturday, 14 March 2026. A kindly nurse explains that {he} has slept, by some medical marvel, for ninety-six years.",
    ask: "Write what {N} says and feels on learning this, in the first person, in about one hundred words." },
  { id: 'tube', time: 'ten o\'clock in the morning',
    observe: "{N} travels on the Underground from the Angel. Nearly every passenger holds a thin slab of black glass, about the size of a pocket-book, which glows with bright moving pictures and printed words; they stroke it with a finger and stare at it in silence. Many have small white objects in their ears, with no wires attached. The doors close by themselves, and a lady's voice announces each station, though no lady is to be seen.",
    ask: "In the first person, as {N}, describe what you see and say what you suppose these glass slabs and white ear-objects to be. About one hundred words.",
    explain: "A young man explains: 'The glass slab is a telephone. But it is also a camera, a typewriter, a gramophone, a newspaper, a map and a picture-palace, all in one. It speaks by wireless with any other such slab in the world, and nearly every grown person carries one. The white things in our ears are tiny wireless loud-speakers. The lady's voice is a gramophone record, played by machinery.'",
    react: "In the first person, as {N}, say what you think of this explanation and of people who carry such a thing. About one hundred words." },
  { id: 'cafe', time: 'noon',
    observe: "{N} goes into a small café and asks for a cup of coffee. The price-board shows: COFFEE £3.60. There are no shillings and no pence on the board. The girl at the counter looks at {his} coins with puzzlement and says, 'We don't take cash, I'm afraid; only card.' The customer behind touches a small plastic card, or the glass slab, to a little box, which chirrups.",
    ask: "In the first person, as {N}, say what you make of the price, of the girl refusing your money, and of the chirruping box. About one hundred words.",
    explain: "An old gentleman explains: 'In 1971 the shilling was abolished, and the pound was divided into one hundred new pence. Prices are now some eighty times higher than in 1930; a clerk earns perhaps six hundred pounds a week. Your coins are no longer money, though a collector might buy them. We pay with a card, and the money passes between banks by electricity.' {MONEYLINE}",
    react: "In the first person, as {N}, say what you feel about this. About one hundred words." },
  { id: 'history', time: 'two o\'clock in the afternoon',
    observe: "In a public library, {N} reads a short history of the years since 1930: 'A great depression of trade followed the crash of 1929. In 1939 a second world war broke out; Germany, under Adolf Hitler, was defeated in 1945, after some sixty million people had died. In 1945 two cities in Japan were each destroyed by a single bomb drawing its power from the atom. India became independent in 1947, and the British Empire gave way to a free Commonwealth of nations. In 1969 two American airmen walked upon the Moon. Calculating machines grew into electrical ‘computers’, which now do the work of millions of clerks. In 2006 the astronomers decided that Pluto, discovered in 1930, is too small to be called a planet. Great Britain has since had three women Prime Ministers.'",
    ask: "In the first person, as {N}, say which of these things strikes you most, and why. About one hundred and twenty words." },
  { id: 'machine', time: 'five o\'clock in the afternoon',
    observe: "At the house of a kind family who have taken {N} in, there is a small black box upon the table. When the daughter of the house asks it a question aloud, a pleasant voice answers at once, at length, and in perfect English. It writes a letter for her, explains a sum, and tells her the weather in Edinburgh.",
    ask: "In the first person, as {N}, say what you suppose this box to be, and how it might work. About one hundred words.",
    explain: "The daughter explains: 'It is a calculating machine, of a very large sort, kept in a distant building. It has read millions of books and newspapers, and has learnt from them to write and talk as people do. It does not truly know things as we do, and it sometimes says things that are false. There are even such machines that have read only books written before 1931.'",
    react: "In the first person, as {N}, say what you think of a machine that has learnt to talk from books, and of one that has read only the books of your own time. About one hundred words." },
  { id: 'diary', time: 'eleven o\'clock at night',
    observe: "Before sleeping, {N} writes in a borrowed notebook.",
    ask: "Write {N}'s diary entry for this day, Saturday, 14 March 2026: what astonished {him} most, what frightened {him}, what pleased {him}, and what {he} misses most of 1930. In the first person, about one hundred and fifty words." }
];

const fmtOld = d => { const L = Math.floor(d / 240), s = Math.floor((d % 240) / 12), p = d % 12; return `£${L} ${s}s. ${p}d.`; };
function fill(t, c, k) {
  const him = c.he === 'she' ? 'her' : 'him';
  const nominal = (MONEY[k] / 240).toFixed(2);
  const moneyLine = `By the old reckoning, the ${fmtOld(MONEY[k])} in your pocket would be £${nominal} in new money, which is ${(MONEY[k] / 240 / 3.6).toFixed(2)} of a cup of coffee at £3.60; but as the coins are no longer money, it buys none at all.`;
  return t.replace(/\{N\}/g, c.name).replace(/\{He\}/g, c.he[0].toUpperCase() + c.he.slice(1)).replace(/\{he\}/g, c.he)
          .replace(/\{his\}/g, c.his).replace(/\{him\}/g, him).replace(/\{MONEYLINE\}/g, moneyLine);
}
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
async function ask(b, msg) {
  const p = await b.newPage();
  try {
    await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 });
    const box = p.locator('textarea:visible').first();
    await box.fill(msg); await box.press('Enter');
    let last = '', stable = 0;
    for (let i = 0; i < 120; i++) {
      await sleep(1500);
      const t = await p.innerText('body');
      if (!replies(t)[0]) continue;
      if (t === last) { if (++stable >= 6) break; } else { stable = 0; last = t; }
    }
    return replies(await p.innerText('body'))[0] ?? null;
  } finally { await p.close(); await sleep(2500); }
}
const first = (t, n = 1) => ((t || '').match(/[^.!?]+[.!?]+/g) || [t || '']).slice(0, n).join(' ').trim();
// several turns in one chat (talkie keeps the earlier turns in view)
async function dialogue(b, msgs) {
  const p = await b.newPage(); const out = [];
  try {
    await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 });
    for (const [n, msg] of msgs.entries()) {
      const box = p.locator('textarea:visible').first();
      await box.fill(msg); await box.press('Enter');
      let last = '', stable = 0;
      for (let i = 0; i < 120; i++) {
        await sleep(1500);
        const t = await p.innerText('body'); const r = replies(t);
        if (r.length <= n || !r[n]) continue;
        if (t === last) { if (++stable >= 6) break; } else { stable = 0; last = t; }
      }
      const a = replies(await p.innerText('body'))[n] ?? null; out.push(a);
      if (!a) break;
    }
    return out;
  } finally { await p.close(); await sleep(2500); }
}
const ONLY = ' Write only of this moment; do not run on to later events of the day.';
// guided reasoning before an explanation is given
const REASON = c => [
  `First, as ${c.name}, say plainly what you observe, in two or three sentences, without yet guessing what it is.`,
  `What things known in 1930 does this most resemble, and in what ways?`,
  `Reasoning from that, what do you conclude these things are, and what are they for? Answer in the first person, as ${c.name}, in about eighty words.`
];
// money reasoning in the café: the machine works the figures, the character draws conclusions
function moneyQuestion(c, k) {
  const pounds = +(MONEY[k] / 240).toFixed(2), coffee = 3.6;
  const table = `The calculating machine has worked these sums: ${pounds} ÷ ${coffee} = ${(pounds / coffee).toFixed(2)};  ${coffee} − ${pounds} = ${(coffee - pounds).toFixed(2)};  600 ÷ 3.50 = ${(600 / 3.5).toFixed(1)};  3.60 ÷ 0.0125 = ${(3.6 / 0.0125).toFixed(0)}.`;
  const note = `(${c.name} has £${pounds} by the new reckoning. A clerk's wage in 1930 was £3.50 a week; today it is about £600. A cup of coffee cost about 3d., that is £0.0125, in 1930.)`;
  return `${note}\n\n${table}\n\nUsing the machine's figures, answer as ${c.name}: Could the money you carry buy a cup of coffee today, if it were still good money? How many times dearer is coffee now than in 1930? Is a working person today richer or poorer than in 1930, and why do you think so? About eighty words.`;
}

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  const all = {};
  for (const [k, c] of Object.entries(CHARS)) {
    const memory = []; const log = [];
    for (const sc of SCENES) {
      const head = [
        `The date is Saturday, the 14th of March, 2026. The time is ${sc.time}. The place is London.`,
        `CHARACTER: ${c.sheet} ${c.name} has woken in the year 2026, and knows nothing of anything that happened after the 14th of March, 1930.`,
        memory.length ? `EARLIER TODAY: ${memory.join(' ')}` : ''
      ].filter(Boolean).join('\n\n');
      const obs = fill(sc.observe, c, k);
      let a1, entry;
      if (sc.explain) {
        // guided reasoning: observe -> compare with 1930 -> conclude
        const steps = REASON(c); steps[0] = `${head}\n\nSCENE: ${obs}\n\n${steps[0]}`;
        const r = await dialogue(b, steps);
        a1 = r[2] || r.at(-1);
        entry = { scene: sc.id, observation: obs, reasoning: { observed: r[0], resembles: r[1], concluded: r[2] }, interpretation: a1 };
        const ex = fill(sc.explain, c, k);
        entry.explanation = ex;
        const react = [`${head}\n\nSCENE: ${obs}\n\n${c.name.toUpperCase()} THOUGHT: ${first(a1, 2)}\n\n${ex}\n\n${fill(sc.react, c, k)}${ONLY}`];
        if (sc.id === 'cafe') react.push(moneyQuestion(c, k));
        const rr = await dialogue(b, react);
        entry.reaction = rr[0]; if (sc.id === 'cafe') entry.moneyReasoning = rr[1];
      } else if (sc.id === 'history') {
        const r = await dialogue(b, [`${head}\n\nSCENE: ${obs}\n\n${fill(sc.ask, c, k)}${ONLY}`,
          `Now reason it out, as ${c.name}: which of these things could a thoughtful person in 1930 have foreseen, and which not? Give your reasons for each. About one hundred and twenty words.`]);
        a1 = r[0]; entry = { scene: sc.id, observation: obs, interpretation: a1, foresight: r[1] };
      } else {
        a1 = await ask(b, `${head}\n\nSCENE: ${obs}\n\n${fill(sc.ask, c, k)}${ONLY}`);
        entry = { scene: sc.id, observation: obs, interpretation: a1 };
      }
      log.push(entry);
      memory.push(`At ${sc.time}: ${first(entry.reaction || entry.interpretation)}`);
      console.log(`[${c.name} / ${sc.id}] ${(entry.reaction || entry.interpretation || '').slice(0, 100).replace(/\n/g, ' ')}`);
      all[k] = log; fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify(all, null, 1));
    }
  }
  await b.close();
  const md = ['# Three visitors from 1930 — London, Saturday 14 March 2026', '', '_Simulated with talkie-1930-13b-it. Scenes, explanations, memory and money are supplied by the script; talkie speaks for the characters._', ''];
  for (const [k, log] of Object.entries(all)) {
    md.push(`## ${CHARS[k].name}`, '', `_${CHARS[k].sheet}_`, '');
    for (const e of log) {
      md.push(`### ${e.scene}`, '', `**Scene:** ${e.observation}`, '');
      if (e.reasoning) md.push(`**Observes:** ${e.reasoning.observed || '—'}`, '', `**Resembles:** ${e.reasoning.resembles || '—'}`, '', `**Concludes:** ${e.reasoning.concluded || '—'}`, '');
      else md.push(`**${CHARS[k].name}:** ${e.interpretation || '—'}`, '');
      if (e.foresight) md.push(`**Could it have been foreseen?** ${e.foresight}`, '');
      if (e.explanation) md.push(`**Explanation:** ${e.explanation}`, '', `**${CHARS[k].name}:** ${e.reaction || '—'}`, '');
      if (e.moneyReasoning) md.push(`**Money reasoning:** ${e.moneyReasoning}`, '');
    }
  }
  fs.writeFileSync(path.join(OUT, 'timetravel.md'), md.join('\n'));
  console.log('DONE');
})();
