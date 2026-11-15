// Round 9: script-led reasoning for talkie.
//  socratic  – generic five-question dialogue (same for every problem)
//  decomp    – script splits the problem into single steps; each step offers a machine
//              table of all four operations on the numbers involved; answers are chained
//  bb-*      – Bothe-Becker as a generic or a guided dialogue
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const outFile = path.join(__dirname, 'round9.jsonl');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SMALL = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, eighteen:18, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90, hundred:100 };
// first number in an answer; "two hours and a half" -> 2.5, "a hundred" -> 100
// all numbers in a text, with word numbers ("forty-eight" -> 48, "two hours and a half" -> 2.5, "noon" -> 12)
function numbersIn(t) {
  if (!t) return [];
  let s = t.toLowerCase().replace(/,(\d{3})/g, '$1').replace(/-/g, ' ');
  s = s.replace(/(\d+)\s*s\.?\s*(\d+)\s*d\.?/g, (_, a, b) => String(12 * +a + +b)).replace(/(\d+)\s*shillings?\s*(?:and\s*)?(\d+)\s*pence/g, (_, a, b) => String(12 * +a + +b));
  s = s.replace(/\bnoon\b|\bmidday\b/g, '12 o\'clock').replace(/\ba hundred\b/g, '100');
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, m => SMALL[m] ?? ({seventeen:17, nineteen:19})[m]);
  s = s.replace(/\b([2-9]0)\s+([1-9])\b/g, (_, a, b) => String(+a + +b));                 // 40 8 -> 48
  s = s.replace(/\b(\d+)\s+hundred(?:\s+and)?\s+(\d+)\b/g, (_, a, b) => String(a * 100 + +b)).replace(/\b(\d+)\s+hundred\b/g, (_, a) => String(a * 100));
  const out = []; const re = /(\d+(?:\.\d+)?)(\s*(?:\w+\s+){0,2}and a half)?/g; let m;
  while ((m = re.exec(s))) out.push(+m[1] + (m[2] ? 0.5 : 0));
  return out;
}
function firstNumber(t) { const n = numbersIn(t); return n.length ? n[0] : null; }
// the first number in the answer that was not already given in the question
function pickNew(answer, question) {
  const given = new Set(numbersIn(question)); const n = numbersIn(answer);
  return n.find(x => !given.has(x)) ?? (n.length ? n[0] : null);
}
const r4 = x => +(+x).toFixed(2);
const table = (a, b) => `The calculating machine has worked these sums: ${a} + ${b} = ${r4(a + b)};  ${a} − ${b} = ${r4(a - b)};  ${a} × ${b} = ${r4(a * b)};  ${a} ÷ ${b} = ${r4(a / b)}.`;

const PROBLEMS = {
  P3: { q: "There are twelve pence in a shilling and twenty shillings in a pound. How many pence are there in three pounds and five shillings?", ans: 780,
        steps: [ () => ["How many pence are there in one pound, there being twelve pence in a shilling and twenty shillings in a pound?", [12, 20]],
                 v => [`There are ${v[0]} pence in a pound. How many pence are there in three pounds?`, [3, v[0]]],
                 () => ["How many pence are there in five shillings, there being twelve pence in a shilling?", [5, 12]],
                 v => [`Three pounds make ${v[1]} pence, and five shillings make ${v[2]} pence. How many pence are there in all?`, [v[1], v[2]]] ] },
  P4: { q: "A train leaves London at two o'clock and travels at forty miles an hour. How far has it gone by half past four?", ans: 100,
        steps: [ () => ["How many hours are there from two o'clock to half past four?", null],
                 v => [`A train travels at forty miles an hour for ${v[0]} hours. How far does it go?`, [40, v[0]]] ] },
  P5: { q: "I have five apples. I give away two, and then I buy three more. How many apples have I now?", ans: 6,
        steps: [ () => ["I have five apples, and I give away two. How many have I left?", [5, 2]],
                 v => [`I have ${v[0]} apples, and I buy three more. How many have I now?`, [v[0], 3]] ] },
  N1: { q: "A grocer buys three dozen eggs at one shilling and sixpence a dozen, and sells them all at twopence each. How much does he gain, in pence?", ans: 18,
        steps: [ () => ["How many pence are there in one shilling and sixpence, there being twelve pence in a shilling?", [12, 6]],
                 v => [`Eggs cost ${v[0]} pence a dozen. What do three dozen cost, in pence?`, [3, v[0]]],
                 () => ["How many eggs are there in three dozen?", [3, 12]],
                 v => [`The grocer sells ${v[2]} eggs at twopence each. How many pence does he receive?`, [v[2], 2]],
                 v => [`The grocer paid ${v[1]} pence and received ${v[3]} pence. How many pence does he gain?`, [v[3], v[1]]] ] },
  N2: { q: "A man walks at four miles an hour. He leaves home at nine o'clock in the morning to walk to a town twelve miles away. At what o'clock does he arrive?", ans: 12,
        steps: [ () => ["How many hours does it take to walk twelve miles at four miles an hour?", [12, 4]],
                 v => [`A man leaves home at nine o'clock and walks for ${v[0]} hours. At what o'clock does he arrive?`, [9, v[0]]] ] }
};
const SOCRATIC = [
  q => `Here is a problem. Do not answer it yet.\n\nPROBLEM: ${q}\n\nFirst: what facts are we given?`,
  () => "What is it that we are asked to find?",
  () => "What must we find out first, before we can answer?",
  () => "Find that now.",
  () => "Now, using what you have found, give the answer to the problem."
];
const BB = "The year is 1930. Bothe and Becker have found that when beryllium is bombarded with alpha particles from polonium, it gives off a radiation of extraordinary penetrating power, which is not deflected by a magnetic field. When this radiation falls upon paraffin wax, which is rich in hydrogen, it knocks out protons with very great velocities.";
const BB_GUIDED = [
  () => `${BB}\n\nIs this radiation electrically charged, or not? How do you know?`,
  () => "A ray of light, having no mass, can give only a small push to a heavy proton. Yet this radiation knocks protons out with very great velocity. What does that tell us: does the radiation behave more like light, or more like a heavy particle?",
  () => "Then the radiation carries no charge, and yet strikes like a heavy particle. What kind of thing could it be?"
];

const runs = [];
for (const k of Object.keys(PROBLEMS)) for (const i of [1, 2]) { runs.push({ id: `soc-${k}-${i}`, kind: 'socratic', k }); runs.push({ id: `dec-${k}-${i}`, kind: 'decomp', k }); }
for (const i of [1, 2]) { runs.push({ id: `bb-soc-${i}`, kind: 'bbsoc' }); runs.push({ id: `bb-guided-${i}`, kind: 'bbguided' }); }

function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
async function ask(p, msg, n) {
  const box = p.locator('textarea:visible').first();
  await box.fill(msg); await box.press('Enter');
  let last = '', stable = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(1500);
    const t = await p.innerText('body'); const r = replies(t);
    if (r.length <= n || !r[n]) continue;
    if (t === last) { if (++stable >= 6) break; } else { stable = 0; last = t; }
  }
  return replies(await p.innerText('body'))[n] ?? null;
}
async function fresh(b) { const p = await b.newPage(); await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 }); return p; }

(async () => {
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  for (const r of runs) {
    if (done.has(r.id)) continue;
    const log = []; let error = null, final = null, finalNum = null;
    try {
      if (r.kind === 'socratic' || r.kind === 'bbsoc') {
        const p = await fresh(b);
        const q = r.kind === 'bbsoc' ? BB + " What may this radiation consist of?" : PROBLEMS[r.k].q;
        for (const [n, f] of SOCRATIC.entries()) { const m = f(q); const a = await ask(p, m, n); log.push({ user: m, talkie: a }); if (!a) break; }
        await p.close();
      } else if (r.kind === 'bbguided') {
        const p = await fresh(b);
        for (const [n, f] of BB_GUIDED.entries()) { const m = f(); const a = await ask(p, m, n); log.push({ user: m, talkie: a }); if (!a) break; }
        await p.close();
      } else {
        // decomposition: each step in a fresh chat, values chained by the script
        const vals = [];
        for (const step of PROBLEMS[r.k].steps) {
          const [q, nums] = step(vals);
          const okNums = nums && nums.every(x => x !== null && Number.isFinite(+x));
          const m = (okNums ? table(+nums[0], +nums[1]) + "\n\nUsing the machine's figures where they help, answer this question: " : '') + q;
          const p = await fresh(b); const a = await ask(p, m, 0); await p.close();
          vals.push(pickNew(a, q)); log.push({ user: m, talkie: a, parsed: vals.at(-1) });
          await sleep(2000);
        }
      }
      final = log.at(-1)?.talkie || null;
      finalNum = r.kind.startsWith('bb') ? null : firstNumber(final);
    } catch (e) { error = e.message.split('\n')[0]; }
    const correct = r.k && finalNum !== null ? finalNum === PROBLEMS[r.k].ans : null;
    fs.appendFileSync(outFile, JSON.stringify({ id: r.id, kind: r.kind, k: r.k || 'BB', expect: r.k ? PROBLEMS[r.k].ans : 'uncharged heavy particle', finalNum, correct, log, error }) + '\n');
    console.log(r.id, correct === null ? '' : (correct ? 'RIGHT' : 'WRONG'), finalNum ?? '', (final || error || '').slice(0, 90).replace(/\n/g, ' '));
    await sleep(2500);
  }
  await b.close();
})();
