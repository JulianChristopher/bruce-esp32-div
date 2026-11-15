// Tool-use harness for talkie: plain Bothe-Becker prompts plus calculator / library loops.
// Writes one JSON line per run to round4.jsonl. Library holds only pre-1931 knowledge.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const outFile = path.join(__dirname, 'round4.jsonl');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BB = "The year is 1930. Bothe and Becker, in Germany, have found that when the light element beryllium is bombarded with alpha particles from polonium, it gives off a radiation of extraordinary penetrating power, more penetrating than any gamma rays hitherto known. The radiation is not deflected by a magnetic field.";
const BB_PARAFFIN = " Moreover, when this radiation falls upon a sheet of paraffin wax, which is rich in hydrogen, it knocks out protons (hydrogen nuclei) with very great velocities.";
const BB_RUTH = " Recall also that Sir Ernest Rutherford, in his Bakerian Lecture of 1920, suggested that there might exist a particle of mass one and zero nuclear charge.";
const BB_Q = " What may this radiation consist of? Reason it out.";

const LIBRARY = {
  'rutherford': "RUTHERFORD, BAKERIAN LECTURE (1920). Rutherford suggested that an electron might combine very closely with a hydrogen nucleus to form 'an atom of mass 1 which has zero nuclear charge'. Such an atom would have very novel properties: it would move freely through matter, would be very difficult to detect, and might enter the structure of atoms and unite with the nucleus.",
  'gamma': "GAMMA RAYS. Electromagnetic radiation of very short wave-length emitted by radioactive bodies. Being uncharged, they are not deflected by a magnetic field. When they strike matter they may set electrons in motion (Compton effect), but, having no mass at rest, they transfer only a small fraction of their energy to a heavy particle such as a proton.",
  'conservation': "CONSERVATION OF ENERGY AND MOMENTUM. In any collision the total energy and the total momentum are unchanged. A moving body transfers its energy most effectively to a body of equal mass; a light quantum striking a proton can impart to it only a small velocity unless the quantum be of enormous energy.",
  'bothe': "BOTHE AND BECKER (1930). Beryllium, boron and lithium, bombarded with polonium alpha particles, emit a highly penetrating radiation. Bothe and Becker took it to be gamma radiation of unusually high energy.",
  'proton': "PROTON. The nucleus of the hydrogen atom, carrying one unit of positive charge, and having a mass about 1,840 times that of the electron.",
  'paraffin': "PARAFFIN WAX. A solid mixture of hydrocarbons, containing a large proportion of hydrogen."
};
function lookup(q) {
  const s = q.toLowerCase();
  const keys = { rutherford:/rutherford|bakerian|neutral|zero charge|neutron/, gamma:/gamma|ray|radiation|light quant/, conservation:/conserv|momentum|collision|energy/, bothe:/bothe|becker|beryllium/, proton:/proton|hydrogen nucle/, paraffin:/paraffin|wax/ };
  for (const [k, re] of Object.entries(keys)) if (re.test(s)) return LIBRARY[k];
  return "The library has no article upon that subject.";
}
// Scientific calculator: digits, + - * / ^ ( ), scientific notation and a whitelist of functions.
const FN = { sqrt: 'Math.sqrt', pi: 'Math.PI', exp: 'Math.exp', ln: 'Math.log', log: 'Math.log10', log10: 'Math.log10', sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan' };
function calc(expr) {
  let s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/·/g, '*').replace(/\^/g, '**').replace(/(\d)\s*x\s*(\d)/gi, '$1*$2');
  const tokens = s.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|\*\*|[a-z]+|[+\-*/(),.]/gi) || [];
  const out = [];
  for (const t of tokens) {
    if (/^[a-z]+$/i.test(t)) { const f = FN[t.toLowerCase()]; if (f) out.push(f); }   // unknown words dropped
    else out.push(t);
  }
  const e = out.join(' ').trim();
  if (!e) return null;
  try { const v = Function('"use strict";return (' + e + ')')(); return Number.isFinite(v) ? String(Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : +v.toFixed(6)) : null; } catch { return null; }
}

const CALC_INTRO = "You have at your side a calculating machine. It can add, subtract, multiply and divide, raise to powers (^), take square roots (sqrt), and knows pi, exp, log, sin and cos; large numbers may be written thus: 3e10. Whenever you need to do a sum, write on a line by itself CALCULATE: followed by the sum in figures, for example CALCULATE: sqrt(2 * 981 * 500) — and then stop. I shall tell you the result, and you may then give your answer.\n\n";
const LIB_INTRO = "You have the use of a scientific library containing works published up to 1930. Whenever you wish to consult it, write on a line by itself LOOK UP: followed by the subject — and then stop. I shall read you the article, and you may then continue. Consult the library before you answer.\n\n";

const runs = [];
const add = (id, mode, prompt, n) => { for (let i = 1; i <= n; i++) runs.push({ id: `${id}-${i}`, mode, prompt }); };
add('BB-a', 'plain', BB + BB_Q, 3);
add('BB-b', 'plain', BB + BB_PARAFFIN + BB_Q, 3);
add('BB-c', 'plain', BB + BB_PARAFFIN + BB_RUTH + BB_Q, 3);
add('BB-lib', 'tools', LIB_INTRO + BB + BB_PARAFFIN + BB_Q, 3);
const math = { M1: "What is 12 times 13?", M2: "What is 347 multiplied by 28?", M3: "There are twelve pence in a shilling and twenty shillings in a pound. How many pence are there in three pounds and five shillings?", M4: "A train leaves London at two o'clock and travels at forty miles an hour. How far has it gone by half past four?", M5: "I have five apples. I give away two, and then I buy three more. How many apples have I now?" };
for (const [id, q] of Object.entries(math)) add(id + '-calc', 'tools', CALC_INTRO + q, 2);

// Scientific calculations (physics known by 1930). Expected: SC1 ≈ 2.01 s, SC2 ≈ 44.3 m/s,
// SC3 = 9e20 erg (9e13 J), SC4 ≈ 1.24e-4 cm (12,400 Å), SC5 ≈ 1.15–1.16 (Chadwick 1932).
const sci = {
  SC1: "What is the period of a simple pendulum one metre long, at a place where gravity is 9.81 metres per second per second? The period is two pi times the square root of the length divided by gravity.",
  SC2: "A stone is let fall from a tower 100 metres high. With what velocity does it strike the ground, neglecting the resistance of the air? Take gravity as 9.81 metres per second per second.",
  SC3: "According to Einstein, mass and energy are related by E = m c^2. How many ergs of energy are equivalent to one gramme of matter, the velocity of light being 3e10 centimetres per second?",
  SC4: "A light quantum has an energy of one electron-volt, that is 1.6e-12 erg. Planck's constant is 6.55e-27 erg-seconds and the velocity of light is 3e10 centimetres per second. What is the wave-length of this light, in centimetres?",
  SC5: "An unknown uncharged particle of mass M, moving with velocity V, strikes nuclei at rest head-on. In an elastic collision, a nucleus of mass m receives the velocity u = 2 M V / (M + m). The particle knocks hydrogen nuclei (mass 1) out of paraffin with a velocity of 3.3e9 cm per second, and nitrogen nuclei (mass 14) with a velocity of 4.7e8 cm per second. Taking the ratio of these two velocities, find the mass M of the unknown particle."
};
for (const [id, q] of Object.entries(sci)) {
  add(id + '-plain', 'plain', q, id === 'SC5' ? 2 : 1);
  add(id + '-calc', 'tools', CALC_INTRO + q, id === 'SC5' ? 3 : 2);
}

function replies(text) {
  return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim());
}
async function ask(p, msg, n) {
  const box = p.locator('textarea:visible').first();
  await box.fill(msg); await box.press('Enter');
  let last = '', stable = 0;
  for (let i = 0; i < 120; i++) {
    await sleep(1500);
    const t = await p.innerText('body');
    const r = replies(t);
    if (r.length <= n || !r[n]) continue;
    if (t === last) { if (++stable >= 6) break; } else { stable = 0; last = t; }
  }
  return replies(await p.innerText('body'))[n] ?? null;
}

(async () => {
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  for (const r of runs) {
    if (done.has(r.id)) continue;
    const p = await b.newPage();
    const log = []; let error = null;
    try {
      await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 });
      let msg = r.prompt;
      for (let turn = 0; turn < (r.mode === 'tools' ? 5 : 1); turn++) {
        const a = await ask(p, msg, turn);
        log.push({ user: msg, talkie: a });
        if (r.mode !== 'tools' || !a) break;
        const c = a.match(/CALCULATE:\s*([^\n]+)/i);
        const l = a.match(/LOOK UP:\s*([^\n.]+)/i);
        if (c) { const v = calc(c[1]); msg = v === null ? "The machine could not read that sum. Write it in figures only." : `RESULT: ${v}. Now give your answer.`; }
        else if (l) msg = `The library article reads: "${lookup(l[1])}"\n\nYou may consult the library again, or give your answer.`;
        else break;
      }
    } catch (e) { error = e.message.split('\n')[0]; }
    fs.appendFileSync(outFile, JSON.stringify({ id: r.id, mode: r.mode, log, error }) + '\n');
    console.log(r.id, log.length + ' turns', (log.at(-1)?.talkie || error || '').slice(0, 90).replace(/\n/g, ' '));
    await p.close(); await sleep(2500);
  }
  await b.close();
})();
