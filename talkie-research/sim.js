// Prototype: one day in the life of a London clerk, Friday 14 March 1930.
// The script keeps the clock, the money ledger, the news and a short memory;
// talkie writes the diary and then reads its own entry to report what was spent.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.join(__dirname, 'sim');
fs.mkdirSync(OUT, { recursive: true });

// ---------- money: everything in pence ----------
const fmt = d => { const L = Math.floor(d / 240), s = Math.floor((d % 240) / 12), p = d % 12; return `£${L} ${s}s. ${p}d.`; };
const WORD_SUM = [
  [/half a crown|half-a-crown/gi, 30], [/\ba crown\b/gi, 60], [/\ba florin\b/gi, 24], [/\ba shilling\b/gi, 12],
  [/\bsixpence\b/gi, 6], [/\bfourpence\b/gi, 4], [/\bthreepence\b|\bthruppence\b/gi, 3], [/\btwopence\b|\btuppence\b/gi, 2],
  [/\bfivepence\b/gi, 5], [/\bsevenpence\b/gi, 7], [/\beightpence\b/gi, 8], [/\bninepence\b/gi, 9], [/\btenpence\b/gi, 10], [/\belevenpence\b/gi, 11],
  [/\ba penny\b|\bone penny\b/gi, 1], [/\ba halfpenny\b|\bha'penny\b/gi, 0.5]
];
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40 };
function parseMoney(text) {
  let t = ' ' + text.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty)\b/g, m => NUM[m]) + ' ';
  let total = 0;
  // £3 10s. 6d. / £3 10s / 3s. 6d. / 1s 3d / 4d.
  t = t.replace(/£\s*(\d+)(?:\s*(\d+)\s*s\.?)?(?:\s*(\d+)\s*d\.?)?/g, (_, L, s, d) => { total += (+L) * 240 + (+s || 0) * 12 + (+d || 0); return ' '; });
  t = t.replace(/(\d+)\s*(?:pounds?)\b/g, (_, L) => { total += L * 240; return ' '; });
  t = t.replace(/(\d+)\s*(?:s\.|s\b|shillings?)\s*(?:and\s*)?(?:(\d+)\s*(?:d\.|d\b|pence))?/g, (_, s, d) => { total += s * 12 + (+d || 0); return ' '; });
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:d\.|d\b|pence|pennies)/g, (_, d) => { total += +d; return ' '; });
  for (const [re, v] of WORD_SUM) t = t.replace(re, () => { total += v; return ' '; });
  return Math.round(total);
}

// ---------- the world ----------
const PERSONA = "Arthur Hale, aged thirty-four, is a ledger clerk in the office of the Moorgate Fire and Life Assurance Company, in the City of London. He lives in a rented house in Islington with his wife Edith and their daughter Joan, aged seven. He is paid three pounds ten shillings a week, every Friday. He is careful with money, fond of his garden, and reads the newspaper on the Underground.";
const NEWS = [
  "THE TIMES, Friday, 14 March 1930. — A NEW PLANET. The Lowell Observatory at Flagstaff, Arizona, announces the discovery of a ninth planet, beyond the orbit of Neptune, found upon photographs taken by Mr. Clyde Tombaugh.",
  "THE TIMES, Friday, 14 March 1930. — INDIA. Mr. Gandhi, with a band of followers, is marching from Ahmedabad to the sea at Dandi, there to make salt in defiance of the Salt Laws.",
  "THE TIMES, Friday, 14 March 1930. — UNEMPLOYMENT. The number of persons registered as unemployed in Great Britain stands at about one million and a half."
];
const PRICES = "Prices in London in 1930: a daily newspaper 1d.; a fare on the Underground from the Angel to Moorgate about 2d.; a lunch of soup, meat and two vegetables at a Lyons tea-shop about 1s.; a cup of tea 2d.; ten cigarettes 6d.; a pint of beer 7d.; a seat at the picture-palace 6d. to 1s.";
const SCENES = [
  { time: "seven o'clock in the morning", task: "Arthur has his breakfast at home and glances at the morning paper.", news: [0, 1] },
  { time: "half past eight in the morning", task: "Arthur travels to the office by the Underground.", news: [] },
  { time: "half past twelve", task: "Arthur takes his luncheon in the City.", news: [2] },
  { time: "five o'clock in the afternoon", task: "It is pay-day. The cashier hands Arthur his weekly wage-packet of three pounds ten shillings, and he leaves the office for home.", pay: 840, news: [] },
  { time: "seven o'clock in the evening", task: "Arthur is at home with Edith and Joan. He gives Edith the housekeeping money for the coming week, and they talk over the day's news.", news: [0] },
  { time: "half past ten at night", task: "Before going to bed, Arthur sits down to write his diary and reflect upon the week.", news: [] }
];
let money = 4 * 12 + 6;   // 4s. 6d. left in his pocket on the morning of pay-day
const memory = [];
const ledger = [];

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
const firstSentences = (t, n) => (t.match(/[^.!?]+[.!?]+/g) || [t]).slice(0, n).join(' ').trim();

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  const log = [];
  for (const [i, sc] of SCENES.entries()) {
    if (sc.pay) { money += sc.pay; ledger.push({ time: sc.time, item: 'Wage-packet received', amount: +sc.pay, balance: money }); }
    const prompt = [
      `The date is Friday, the 14th of March, 1930. The time is ${sc.time}.`,
      `CHARACTER: ${PERSONA}`,
      memory.length ? `EARLIER TODAY: ${memory.join(' ')}` : '',
      sc.news.length ? `IN THE NEWSPAPER: ${sc.news.map(n => NEWS[n]).join(' ')}` : '',
      PRICES,
      `MONEY IN ARTHUR'S POCKET: ${fmt(money)}`,
      `SCENE: ${sc.task}`,
      "Write Arthur's diary entry for this part of the day, in the first person, in about one hundred and fifty words. Mention any money he spends or gives away, with the amount."
    ].filter(Boolean).join('\n\n');
    const entry = await ask(b, prompt);
    // second pass: talkie reads its own entry and reports the spending
    const spentAns = entry ? await ask(b, `Read the following diary entry, and answer the question from it.\n\nENTRY: ${entry}\n\nQUESTION: How much money in all did the writer spend or give away in this entry? If none, say "Nothing".`) : null;
    let spent = /nothing|none|no money/i.test(spentAns || '') ? 0 : parseMoney(spentAns || '');
    if (spent > money) spent = 0;   // reject impossible figures; logged for review
    if (spent) { money -= spent; ledger.push({ time: sc.time, item: firstSentences(spentAns, 1).slice(0, 80), amount: -spent, balance: money }); }
    memory.push(`At ${sc.time}: ${firstSentences(entry || '', 1)}`);
    log.push({ scene: sc.time, prompt, entry, spentAns, spentPence: spent, balance: money });
    console.log(`[${sc.time}] spent ${spent}d -> ${fmt(money)} | ${(entry || '').slice(0, 90).replace(/\n/g, ' ')}`);
    fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ log, ledger }, null, 1));
  }
  await b.close();
  // human-readable diary
  const md = ['# Diary of Arthur Hale — Friday, 14 March 1930', '', '_Simulated with talkie-1930-13b-it; clock, money, news and memory kept by the script._', ''];
  for (const l of log) md.push(`## ${l.scene[0].toUpperCase() + l.scene.slice(1)}`, '', l.entry || '_(no entry)_', '', `> Spending as read back by talkie: ${l.spentAns || '—'} → ledger: −${l.spentPence}d., pocket now ${fmt(l.balance)}`, '');
  md.push('## Ledger', '', '| Time | Item | Amount | Balance |', '|---|---|---|---|');
  for (const e of ledger) md.push(`| ${e.time} | ${e.item.replace(/\|/g, '/')} | ${e.amount > 0 ? '+' : '−'}${fmt(Math.abs(e.amount))} | ${fmt(e.balance)} |`);
  fs.writeFileSync(path.join(OUT, 'diary.md'), md.join('\n'));
  console.log('DONE');
})();
