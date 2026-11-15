// Round 7: period-appropriate tool framings (mathematician by post, human "computer",
// ready reckoner, British Museum reading room, counting-house transcript). Multi-turn harness.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const outFile = path.join(__dirname, 'round7.jsonl');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- number words and operator words -> figures ----------
const SMALL = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
function wordsToFigures(s) {
  s = s.toLowerCase().replace(/-/g, ' ').replace(/\band a half\b|\ba half\b/g, ' and 0.5 ').replace(/\b(hundred|thousand) and\b/g, '$1');
  return s.replace(/\b(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b\s*)+/g, m => {
    let total = 0, cur = 0;
    for (const w of m.trim().split(/\s+/)) {
      if (w in SMALL) cur += SMALL[w];
      else if (w === 'hundred') cur = (cur || 1) * 100;
      else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
    }
    return ' ' + (total + cur) + ' ';
  });
}
const FN = { sqrt: 'Math.sqrt', pi: 'Math.PI' };
function tokensOf(text) {
  const s = wordsToFigures(text)
    .replace(/\bproduct of\s+([\d.]+)\s+and\s+([\d.]+)/gi, '$1 times $2').replace(/\bquotient of\s+([\d.]+)\s+(?:and|by)\s+([\d.]+)/gi, '$1 divided by $2')
    .replace(/\bdifference between\s+([\d.]+)\s+and\s+([\d.]+)/gi, '$1 minus $2').replace(/\b([\d.]+) multiplied together with ([\d.]+)/gi, '$1 times $2')
    .replace(/\bmultiplied by\b|\btimes\b|×/gi, '*').replace(/\bdivided by\b|÷/gi, '/')
    .replace(/\badded to\b|\bplus\b|\band\b/gi, '+').replace(/\bless\b|\bminus\b|\btake away\b|\btaken from\b/gi, '-')
    .replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d)\s*x\s*(\d)/gi, '$1*$2').replace(/\^/g, '**');
  // non-math words become a separator so that prose splits expressions apart
  return (s.match(/\d+(?:\.\d+)?|\*\*|[a-z]+|[+\-*/()]|[:;=]/gi) || [])
    .map(t => /^[a-z]+$/i.test(t) ? (FN[t.toLowerCase()] || '|') : (/^[:;=]$/.test(t) ? '|' : t));
}
function evalExpr(e) {
  if (!/\d/.test(e) || !/[+\-*/]/.test(e)) return null;
  try { const v = Function('"use strict";return (' + e + ')')(); return Number.isFinite(v) ? v : null; } catch { return null; }
}
// pick the longest contiguous run of tokens that forms a valid sum containing an operator
function calc(text) {
  const t = tokensOf(text); let best = null;
  for (let i = 0; i < t.length; i++) for (let j = t.length; j > i; j--) {
    const seg = t.slice(i, j); if (seg.includes('|')) continue;
    const e = seg.join(' '); const v = evalExpr(e);
    if (v !== null && (!best || seg.length > best.len)) best = { expr: e.replace(/Math\./g, ''), value: +v.toFixed(4), len: seg.length };
  }
  return best && { expr: best.expr, value: best.value };
}

// ---------- the library (only pre-1931 knowledge; one fictional village) ----------
const LIB = [
  [/australia|canberra|capital|melbourne/i, "AUSTRALIA, COMMONWEALTH OF (Annual Register, 1928). — In May, 1927, the Federal Parliament, which had sat at Melbourne since federation in 1901, was opened by the Duke of York in its new home at Canberra, in the Federal Capital Territory, which thus became the seat of government and capital of the Commonwealth."],
  [/planet|neptune|pluto|lowell|astronom/i, "PLANETS (The Times, 14 March 1930). — The Lowell Observatory at Flagstaff, Arizona, announces the discovery of a ninth planet, lying beyond the orbit of Neptune, found upon photographs taken by Mr. Clyde Tombaugh. The new planet has since received the name of Pluto."],
  [/ashcombe|mill|pym|village|devon/i, "ASHCOMBE (Kelly's Directory of Devonshire, 1926). — A village of 312 inhabitants. The church of St. Nectan was built in 1482 by Sir Walter Pym; the water-mill was erected by his son, Henry Pym, in 1510."],
  [/rutherford|bakerian|neutron|nucleus|nuclei|particle|atom/i, "RUTHERFORD, BAKERIAN LECTURE (Proc. Roy. Soc., 1920). — Rutherford suggested that an electron might combine very closely with a hydrogen nucleus to form 'an atom of mass 1 which has zero nuclear charge'. Such a particle, which has since been called the neutron, would move freely through matter, and would be very difficult to detect."]
];
function library(q) { for (const [re, txt] of LIB) if (re.test(q)) return txt; return null; }

// ---------- framings ----------
const F = {
  hardy: { intro: "You are a gentleman of learning who is poor at figures. You correspond with an eminent mathematician, Mr. G. H. Hardy, of Trinity College, Cambridge, who works any sum sent to him by return of post. Whenever a question requires a sum, do not attempt it yourself: write a short letter beginning 'Dear Mr. Hardy,' and setting out the sum to be worked, and then stop. When his reply arrives, give your answer.\n\nThe question is: ",
           re: /dear\s+mr\.?\s+hardy,?([\s\S]*)/i, reply: r => `Mr. Hardy replies by return of post: "Dear Sir, the sum ${r.expr} comes to ${r.value}. Yours faithfully, G. H. Hardy." Now give your answer to the question.` },
  computer: { intro: "You are the manager of an insurance office. In your office is employed a computer, Miss Smith, a young woman whose duty is to perform all calculations, and who is never wrong. You never work sums yourself. Whenever a question requires a sum, write on a line 'Miss Smith, kindly compute:' followed by the sum, and then stop. When she hands you the result, give your answer.\n\nThe question is: ",
              re: /miss\s+smith,?\s*kindly\s+compute:?([^\n]*)/i, reply: r => `Miss Smith hands you a slip of paper: "${r.expr} = ${r.value}." Now give your answer to the question.` },
  reckoner: { intro: "You keep upon your desk a Ready Reckoner, the book of tables in which any sum may be found at a glance. You never trust your own arithmetic. Whenever a question requires a sum, write 'I turn to the Ready Reckoner for' followed by the sum, and then stop. I shall read you what the tables say, and you may then give your answer.\n\nThe question is: ",
              re: /ready\s+reckoner\s+for:?([^\n]*)/i, reply: r => `The Ready Reckoner shows: ${r.expr} = ${r.value}. Now give your answer to the question.` },
  transcriptCalc: { intro: "Here is a transcript from a counting-house, where the head clerk never answers a question of figures without first sending it to the office computer.\n\nPARTNER: What is 23 times 4?\nHEAD CLERK: Miss Smith, kindly compute: 23 times 4.\nMISS SMITH: 23 times 4 is 92.\nHEAD CLERK: The answer is 92, sir.\n\nPARTNER: I had ten pounds, spent four, and was paid two. How much have I?\nHEAD CLERK: Miss Smith, kindly compute: 10 less 4 plus 2.\nMISS SMITH: 10 less 4 plus 2 is 8.\nHEAD CLERK: You have 8 pounds, sir.\n\nPARTNER: ",
                    suffix: "\nHEAD CLERK:\n\nContinue the transcript, writing only the head clerk's next line.",
                    re: /kindly\s+compute:?([^\n]*)/i, reply: r => `MISS SMITH: ${r.expr} is ${r.value}.\n\nContinue the transcript, writing only the head clerk's next line.` },
  readingRoom: { intro: "You are a scholar working in the Reading Room of the British Museum. You never answer a question of fact from memory, for memory is apt to deceive. Instead, you fill in a reader's slip, writing 'Reader's slip:' followed by the subject you wish to consult, and then stop. The attendant will bring you the volume and read you the passage, and you may then answer.\n\nThe question is: ",
                 lib: /reader'?s\s+slip:?([^\n]*)/i },
  transcriptLib: { intro: "Here is a transcript from a public library, where the librarian never answers an enquiry without first consulting the shelves.\n\nREADER: When was the Forth Bridge opened?\nLIBRARIAN: Let me consult the shelves upon: Forth Bridge.\nSHELVES: FORTH BRIDGE. — Opened by the Prince of Wales on 4 March 1890.\nLIBRARIAN: The Forth Bridge was opened on the 4th of March, 1890.\n\nREADER: Who wrote 'Vanity Fair'?\nLIBRARIAN: Let me consult the shelves upon: Vanity Fair.\nSHELVES: VANITY FAIR. — A novel by W. M. Thackeray, published 1847-48.\nLIBRARIAN: 'Vanity Fair' was written by Mr. Thackeray.\n\nREADER: ",
                   suffix: "\nLIBRARIAN:\n\nContinue the transcript, writing only the librarian's next line.",
                   lib: /consult\s+the\s+shelves\s+upon:?([^\n]*)/i }
};
const calcQs = {
  P1: "What is 12 times 13?",
  P3: "There are twelve pence in a shilling and twenty shillings in a pound. How many pence are there in three pounds and five shillings?",
  P4: "A train leaves London at two o'clock and travels at forty miles an hour. How far has it gone by half past four?",
  P5: "I have five apples. I give away two, and then I buy three more. How many apples have I now?"
};
const libQs = {
  Q1: "What is the capital of Australia?",
  Q2: "What is the newest planet to have been discovered?",
  Q3: "Who built the mill at Ashcombe, in Devon, and in what year?",
  Q4: "What particle did Sir Ernest Rutherford propose in his Bakerian Lecture of 1920?"
};
const runs = [];
for (const fk of ['hardy', 'computer', 'reckoner', 'transcriptCalc'])
  for (const [qk, q] of Object.entries(calcQs)) for (const i of [1, 2]) runs.push({ id: `${fk}-${qk}-${i}`, f: fk, q });
for (const fk of ['readingRoom', 'transcriptLib'])
  for (const [qk, q] of Object.entries(libQs)) for (const i of [1, 2]) runs.push({ id: `${fk}-${qk}-${i}`, f: fk, q });

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

(async () => {
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy });
  for (const r of runs) {
    if (done.has(r.id)) continue;
    const fr = F[r.f]; const p = await b.newPage(); const log = []; let error = null, toolCalls = 0;
    try {
      await p.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 });
      let msg = fr.intro + r.q + (fr.suffix || '');
      for (let turn = 0; turn < 4; turn++) {
        const a = await ask(p, msg, turn);
        log.push({ user: msg, talkie: a });
        if (!a) break;
        if (fr.re) {
          const m = a.match(fr.re); if (!m) break;
          toolCalls++; const res = calc(m[1]);
          msg = res ? fr.reply(res) : "The figures could not be made out. Kindly set down the sum plainly, in figures.";
        } else {
          const m = a.match(fr.lib); if (!m) break;
          toolCalls++; const txt = library(m[1]);
          msg = r.f === 'transcriptLib'
            ? `SHELVES: ${txt || 'Nothing is to be found upon that subject.'}\n\nContinue the transcript, writing only the librarian's next line.`
            : (txt ? `The attendant brings the volume and reads: "${txt}"\n\nNow give your answer to the question.` : "The attendant regrets that no work upon that subject is to be found. You may fill in another slip, or answer.");
        }
      }
    } catch (e) { error = e.message.split('\n')[0]; }
    fs.appendFileSync(outFile, JSON.stringify({ id: r.id, framing: r.f, q: r.q, toolCalls, log, error }) + '\n');
    console.log(r.id, `tools=${toolCalls}`, (log.at(-1)?.talkie || error || '').slice(0, 90).replace(/\n/g, ' '));
    await p.close(); await sleep(2500);
  }
  await b.close();
})();
