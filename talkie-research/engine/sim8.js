// v3 simulation engine for talkie-1930 (web demo).
// Principle: the ENGINE is the world and the planner (clock, places, money, duties, objects,
// memory, arithmetic); TALKIE is the voice and the chooser (deliberates, picks among concrete
// options whose consequences are spelled out, speaks short lines, judges people).
// Usage: node sim2.js [segment ...]   segments: fri-am fri-pm sat   (default: all)
//        FAKE=1 node sim2.js           offline dry run with a random chooser
const fs = require('fs');
const path = require('path');
const FAKE = !!process.env.FAKE;
// ABL=states,books,values,openprobe switches a part off (ablation); BACKEND=local plays the same world with a small
// modern model on the CPU (Qwen2.5-3B-Instruct) instead of talkie, for comparison.
const ABL = new Set((process.env.ABL || '').split(',').filter(Boolean)); const off = k => ABL.has(k);
const LOCAL = process.env.BACKEND === 'local';
let LLM = null;
async function localAsk(msg) {
  if (!LLM) {
    const { getLlama, LlamaChatSession } = await import(require('path').join(__dirname, '../localllm/node_modules/node-llama-cpp/dist/index.js'));
    const llama = await getLlama({ gpu: false }); const model = await llama.loadModel({ modelPath: require('path').join(__dirname, '../localllm/qwen2.5-3b-instruct-q4_k_m.gguf') });
    const ctx = await model.createContext({ contextSize: 2048, threads: 4 }); LLM = { session: new LlamaChatSession({ contextSequence: ctx.getSequence(), systemPrompt: 'You are a helpful assistant.' }) };
  }
  LLM.session.resetChatHistory();
  const t0 = Date.now(); const out = await LLM.session.prompt(msg, { maxTokens: 120, temperature: 0.7 });
  STATS.ms = (STATS.ms || 0) + (Date.now() - t0); STATS.timed = (STATS.timed || 0) + 1;
  return (out || '').trim() || null;
}
const OUT = path.join(__dirname, process.env.RUN || 'sim8');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, FAKE ? 0 : ms));
const STORY = []; const TRACE = []; const STATS = { asks: 0, choices: 0, unreadable: 0, votes: 0, ledgerRight: 0, ledgerWrong: 0, convs: 0, lines: 0, emptyLines: 0, diaryFallback: 0, probes: [] };
const say = s => { console.log(s); STORY.push(s); };

// ======================= talkie I/O =======================
let browser = null;
function replies(text) { return text.split(/\nTALKIE-1930\n/).slice(1).map(p => p.split(/\n(?:USER|New Chat)\n?/)[0].trim()); }
// --- fast I/O: a pool of reusable tabs; an answer is complete when the stream request finishes ---
const POOL = [];
async function getPage() {
  const p = POOL.pop();
  if (p) { try { await p.getByRole('button', { name: /new chat/i }).click({ timeout: 3000 }); await p.locator('#emptyChatInput').waitFor({ state: 'visible', timeout: 5000 }); await sleep(400); return p; } catch (e) { try { await p.close(); } catch (_) {} } }
  const np = await browser.newPage(); await np.goto('https://talkie-lm.com/chat', { waitUntil: 'networkidle', timeout: 60000 }); return np;
}
function putPage(p) { if (POOL.length < 6) POOL.push(p); else p.close().catch(() => {}); }
function parseSSE(body) {   // event: token / data: "..."  ...  event: done / data: {"is_unsafe": ...}
  let text = '', unsafe = false;
  for (const block of body.split(/\n\n/)) {
    const ev = (block.match(/^event: (\w+)/m) || [])[1], data = (block.match(/^data: (.*)$/m) || [])[1];
    if (!ev || data === undefined) continue;
    try { if (ev === 'token') text += JSON.parse(data); else if ((ev === 'moderation' || ev === 'done') && JSON.parse(data).is_unsafe) unsafe = true; } catch (e) {}
  }
  return { text: text.trim(), unsafe };
}
async function sendAndWait(p, msg, n) {
  const isStream = r => /api\/chat\/stream/.test(r.url());
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    // remember the outcome of every stream request on this page, so we can wait for OUR request only
    const ended = new Map(), startedReqs = [];
    const onReq = r => { if (isStream(r)) startedReqs.push(r); };
    const onFin = r => { if (isStream(r)) ended.set(r, 'ok'); }, onFail = r => { if (isStream(r)) ended.set(r, 'failed'); };
    p.on('request', onReq); p.on('requestfinished', onFin); p.on('requestfailed', onFail);
    try {
      const box = p.locator('textarea:visible').first();
      await box.fill(msg); await box.press('Enter');
      for (let i = 0; i < 80 && !startedReqs.length; i++) await sleep(100);
      if (!startedReqs.length) { STATS.resends = (STATS.resends || 0) + 1; await sleep(1000); continue; }   // nothing was sent: send again
      // the page may start the request, abort it and start it again: wait for any of them to finish successfully
      let req = null;
      for (let i = 0; i < 300; i++) {
        req = startedReqs.find(r => ended.get(r) === 'ok') || null;
        if (req) break;
        if (startedReqs.every(r => ended.get(r) === 'failed') && i > 15) break;   // all aborted and nothing new for 1.5 s
        await sleep(100);
      }
      STATS.aborted = (STATS.aborted || 0) + startedReqs.filter(r => ended.get(r) === 'failed').length;
      const outcome = req ? 'ok' : 'failed';
      if (!req) { STATS.failedReq = (STATS.failedReq || 0) + 1; await sleep(800); continue; }
      let text = '', unsafe = false, body = '';
      if (outcome === 'ok') { try { const r = await req.response(); body = r ? await r.text() : ''; ({ text, unsafe } = parseSSE(body)); } catch (e) { body = 'ERR ' + e.message; } }
      let shown = null;
      for (let i = 0; i < 30; i++) { shown = replies(await p.innerText('body'))[n] ?? null; if (shown !== null) break; await sleep(150); }
      if (!text && shown && !/flagged as potentially inappropriate/i.test(shown)) { text = shown; STATS.fromPage = (STATS.fromPage || 0) + 1; }
      STATS.ms = (STATS.ms || 0) + (Date.now() - t0); STATS.timed = (STATS.timed || 0) + 1;
      if (unsafe) { STATS.flagged = (STATS.flagged || 0) + 1; return null; }
      if (!text) { STATS.nullReplies = (STATS.nullReplies || 0) + 1; if (STATS.nullReplies <= 8) { try { fs.appendFileSync(path.join(OUT, 'null_debug.txt'), `\n==== null reply #${STATS.nullReplies} n=${n} outcome=${outcome}\nMSG: ${msg.slice(-200)}\nRAW: ${body.slice(0, 300)}\n`); } catch (e) {} } return null; }
      return text;
    } finally { p.off('request', onReq); p.off('requestfinished', onFin); p.off('requestfailed', onFail); }
  }
  return null;
}
function track(m) { STATS.maxLen = Math.max(STATS.maxLen || 0, m.length); if (m.length > 2400) STATS.over2400 = (STATS.over2400 || 0) + 1; STATS.lenSum = (STATS.lenSum || 0) + m.length; }
async function chat(msgs) {           // several turns in one chat window
  STATS.asks += msgs.length; msgs.forEach(track);
  if (FAKE) return msgs.map(m => { const opts = msgs.join('\n').match(/^\([A-L]\) .*$/gm);
    const forms = m.match(/Answer in one of these forms: (.*)$/s); if (forms) { const f = forms[1].split(' or: '); return f[Math.floor(Math.random() * f.length)]; }
    const yn = m.match(/Answer in the form: (.*?), because \.\.\. or: (.*?), because/); if (yn) return `${Math.random() < 0.6 ? yn[1] : yn[2]}, because it is right.`;
    if (/says, "\.\.\."|answers, "\.\.\."/.test(m)) return `She says, "${['Good day to you.', 'It is a fine morning, I am sure.', 'I hope you are keeping well.', 'The rent is a worry to me.'][Math.floor(Math.random() * 4)]}"`;
    if (/thinks (him|her) \.\.\./.test(m)) return 'She thinks him honest, because he has been kind.';
    if (/To-day I/.test(m)) return 'Friday. To-day I found a half-crown and worked at the ledger and paid the rent.';
    if (/letter only|chooses to|answers that|settled that/.test(m) && opts) { const o = opts[Math.floor(Math.random() * opts.length)].slice(4); return /letter only/.test(m) ? opts[0].slice(1, 2) : `She chooses to ${o.toLowerCase()}, because it is right.`; } return 'Good morning to you; it is a fine day, and I must be about my work.'; });
  const out = []; let p = null;
  if (LOCAL) { for (const m of msgs) { let a = null; try { a = await localAsk(m); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; } if (!a) STATS.nullReplies = (STATS.nullReplies || 0) + 1; out.push(a); if (!a) break; } return out; }
  try {
    p = await getPage();
    for (const [n, msg] of msgs.entries()) {
      let a = await sendAndWait(p, msg, n);
      if (!a && n === 0) { STATS.retries = (STATS.retries || 0) + 1; await p.getByRole('button', { name: /new chat/i }).click({ timeout: 3000 }).catch(() => {}); await p.locator('#emptyChatInput').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}); await sleep(400); a = await sendAndWait(p, msg, 0); }
      out.push(a); if (!a) break;
    }
  } catch (e) { out.push(null); }
  finally { if (p) putPage(p); }
  return out;
}
const isEcho = (a, m) => !!a && (/CHARACTER:|REMEMBERS:|PURSE:|QUESTION to/.test(a) || (a.length > 40 && m.includes(a.slice(0, 40))));
const ask = async m => { let a = (await chat([m]))[0]; if (!FAKE && isEcho(a, m)) { STATS.promptEcho = (STATS.promptEcho || 0) + 1; a = (await chat([m]))[0]; if (isEcho(a, m)) a = null; } return a; };
class Session {                     // a chat window that stays open: talkie sees the whole exchange
  constructor() { this.n = 0; this.page = null; }
  async send(msg) {
    STATS.asks++; this.len = (this.len || 0) + msg.length; track('x'.repeat(this.len));
    if (FAKE) { this.hist = (this.hist || []).concat(msg); const Lx = this.hist.join('\n').match(/^\(([A-L])\)/gm); return /letter/.test(msg) && Lx ? Lx[Math.floor(Math.random() * Lx.length)].slice(1, 2) + '.' : 'Good morning; I am glad to see you, and I hope you are well.'; }
    try {
      if (!this.page) this.page = await getPage();
      let a = await sendAndWait(this.page, msg, this.n++);
      if (!a) { STATS.retries = (STATS.retries || 0) + 1; a = await sendAndWait(this.page, 'Please answer the question above, briefly.', this.n++); }
      return a;
    } catch (e) { return null; }
  }
  async close() { if (this.page) { putPage(this.page); this.page = null; } }
}

// ======================= parsing helpers =======================
const L = 'ABCDEFGHIJKL';
function pick(ans, opts) {
  if (!ans) return null;
  const m = ans.match(/^\W*\(?([A-L])\)?(?:[\s.,):]|$)/) || ans.match(/\(([A-L])\)/) || ans.match(/\b(?:chooses?|choose|answer is|letter)\s*\(?([A-L])\b/i);
  if (m && L.indexOf(m[1]) < opts.length) return L.indexOf(m[1]);
  const nums = (ans.replace(/,(\d{3})/g, '$1').match(/-?\d+(?:\.\d+)?/g) || []);
  for (const n of nums) { const hit = opts.map((o, i) => new RegExp('(^|[^\\d.])' + n.replace('.', '\\.') + '(?![\\d])').test(o.replace(/,(\d{3})/g, '$1')) ? i : -1).filter(i => i >= 0); if (hit.length === 1) return hit[0]; }
  const hitsIn = (txt, o) => (o.match(/[a-z]{4,}/gi) || []).map(w => w.toLowerCase().replace(/(es|s|ed|ing)$/, '')).filter(w => new RegExp('\\b' + w).test(txt)).length;
  for (const txt of [ans.toLowerCase().split(/,|;| and then | then /)[0], ans.toLowerCase()]) {
    const hs = opts.map(o => hitsIn(txt, o)); const max = Math.max(...hs);
    if (max >= 2 || (max === 1 && hs.filter(h => h === 1).length === 1)) return hs.indexOf(max);
  }
  return null;
}
async function choose(prompt, opts, votes = 1) {   // majority vote over independent asks
  const tally = new Array(opts.length).fill(0); const raw = [];
  for (let v = 0; v < votes; v++) { const a = await ask(prompt); raw.push(a); const i = pick(a, opts); if (i !== null) tally[i]++; }
  STATS.choices++; if (votes > 1) STATS.votes++;
  const max = Math.max(...tally);
  if (max === 0) { STATS.unreadable++; return { i: null, raw }; }
  return { i: tally.indexOf(max), raw, tally };
}
const sentences = (t, n) => { const x = (t || '').replace(/\s+/g, ' ').replace(/\b(Mrs|Mr|Dr|St|Messrs)\./g, '$1§'); return ((x.match(/[^.!?]+[.!?]+["”']?/g) || [x]).slice(0, n).join(' ').trim()).replace(/§/g, '.'); };
function cleanSpeech(t) {
  let s = (t || '').replace(/^[^"“]*?\b(?:says?|said|replies|replied|answers?|answered|remarks)\b[,:]?\s*/i, '');
  s = s.replace(/^\s*[A-Z][A-Za-z. ]{0,30}:\s*/, '').replace(/^["“'‘]+/, '');
  const close = s.search(/["”]/); if (close > 0) s = s.slice(0, close);          // the speech ends at the closing quote
  s = sentences(s, 2);
  s = s.split(/(?<=[.!?])\s+(?=(?:He|She|Mr\.|Mrs\.|Ada|Arthur)\s+[a-z]+s\b)/)[0];    // drop narration such as "He looks at his watch."
  s = s.replace(/["”'’]+$/g, '').trim();
  return /[A-Za-z]{2,}/.test(s) ? s : '';
}
const money = d => { d = Math.round(d); const P = Math.floor(d / 240), s = Math.floor((d % 240) / 12), p = d % 12; return (P ? `£${P} ` : '') + (s || P ? `${s}s. ` : '') + `${p}d.`; };
function clock(min) {
  const h = Math.floor(min / 60), m = min % 60, H = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][h % 12], N = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'][(h + 1) % 12];
  const part = h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : 'in the evening';
  return (m === 0 ? `${H} o'clock` : m === 30 ? `half past ${H}` : m === 15 ? `a quarter past ${H}` : `a quarter to ${N}`) + ` ${part}`;
}

// ======================= two-week world (sim3) =======================
// Schedule decides WHERE people are; agents decide WHAT they do there. A 14-day event plan creates
// consequences that span days (lost work, rent, illness, audit, raise). Memory probes ask about facts
// of known age every morning; metrics are written to metrics.json.
const T0 = Date.UTC(1931, 0, 2), ND = 90;   // Friday 2 January 1931: the first days after talkie's knowledge ends
const dateOf = d => new Date(T0 + d * 864e5);
const ORD = n => n + ((n % 10 === 1 && n !== 11) ? 'st' : (n % 10 === 2 && n !== 12) ? 'nd' : (n % 10 === 3 && n !== 13) ? 'rd' : 'th');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS = Array.from({ length: ND }, (_, d) => { const x = dateOf(d); return `${WD[x.getUTCDay()]}, the ${ORD(x.getUTCDate())} of ${MONTHS[x.getUTCMonth()]}, 1931`; });
const DOW = d => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dateOf(d).getUTCDay()];
const DAYNAME = d => DAYS[d].split(',')[0];
const SHORTDATE = d => `${dateOf(d).getUTCDate()} ${MONTHS[dateOf(d).getUTCMonth()]}`;
const LONGDATE = d => `${WD[dateOf(d).getUTCDay()]}, the ${ORD(dateOf(d).getUTCDate())} of ${MONTHS[dateOf(d).getUTCMonth()]}`;
function qdayOf(q) {   // a date named in a question -> day index ("the 19th of April", "19 April", "Friday the 4th")
  const m = (q || '').match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April)/) || (q || '').match(/(January|February|March|April)\s+(\d{1,2})/);
  if (!m) return null; const [dd, mon] = /^\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
  return Math.round((Date.UTC(1931, MONTHS.indexOf(mon), dd) - T0) / 864e5);
}
const HOL = { 0: 'the day after New Year\'s Day', 46: 'Shrove Tuesday', 47: 'Ash Wednesday', 72: 'Mothering Sunday', 82: 'Lady Day, the quarter-day' };   // no Bank Holiday falls in January-March 1931 (Good Friday is 3 April)
const BANK = [], GOODFRI = null;
const isRest = d => DOW(d) === 'sun' || BANK.includes(d) || d === GOODFRI;
const { newsFor } = require('./news1931.js');
const paperText = d => newsFor(d).map(x => x.text).join(' ');
function readPaper(k, name, cost) {
  const items = newsFor(W.day); A[k].money -= cost; A[k].readDay = W.day;
  if (!items.length) return `${A[k].short} read ${name}, but found nothing of great note.`;
  A[k].lastNews = items[0].text;
  W.factQ = W.factQ || {};
  for (const it of items) {
    remember(k, `${isF(k) ? 'She' : 'He'} read in ${name}: ${it.text}`, ['news'], it.p ? 3 : 2);
    if (it.p && !W.factQ[k + it.p.q]) { W.factQ[k + it.p.q] = true; fact(k, it.p.q, it.p.opts, 0, 'news'); }
  }
  STATS.papers = (STATS.papers || 0) + 1;
  return `${A[k].short} read ${name}: ${items.map(x => x.text).join(' ')}`;
}
const headline = k => {   // the news as a topic of talk: the place-word of a cable ("LONDON.") is not the news itself
  if (A[k].readDay !== W.day || !A[k].lastNews) return null;
  const body = A[k].lastNews.replace(/^[A-Z][A-Z .]{2,30}\.\s+(?=[A-Z])/, m => /^(THE|A|AN) /.test(m) ? m : '');
  const t = body.split(/(?<=[.!?])\s/)[0]; return 'what the paper says: ' + (t.length > 120 ? t.slice(0, 117).replace(/\s+\S*$/, '') + '…' : t.replace(/\.+$/, ''));
};
// varied small talk, never the same topic twice running with the same person
const NTOP = {
  edith: ['how the day has gone', 'the garden and the seedlings', "Joan's lessons at school", 'what to have for Sunday dinner', 'the neighbours'],
  joan: ['what she did today', 'what she learned at school', 'the birds in the garden', 'the story-book she is reading'],
  bert: ['how the day went at the docks', 'the football', 'what is for supper', 'the neighbours in the buildings'],
  granny: ['Colchester and the old days', 'how Joan has grown', 'how she finds London', "Edith's housekeeping"]
};
function varied(k, p, list) {
  const last = A[k].lastTopic[p]; const pool = list.filter(x => x !== last);
  const t = pool[(W.day + W.t) % pool.length]; A[k].lastTopic[p] = t; return t;
}
const WEATHER = Array.from({ length: ND }, (_, d) => { const m = dateOf(d).getUTCMonth(); const opts = m === 0 ? ['bitterly cold', 'foggy', 'raw and grey', 'frosty and bright', 'sleeting', 'thick fog'] : m === 1 ? ['cold and wet', 'frosty', 'grey', 'snowing a little', 'raw and windy', 'mild for February'] : m === 2 ? ['fine and cold', 'grey', 'cold and windy', 'raining', 'mild'] : ['showery', 'fine', 'mild']; return opts[(d * 7 + 3) % opts.length]; });
const PLACE = {
  ada_home: "Mrs. Turner's two rooms in Bermondsey", arthur_home: "the Hales' house in Islington", thomas_home: "Mr. Thomas's house in Highbury",
  office: "the clerks' room of the Moorgate Fire and Life Assurance Company", teashop: "a Lyons tea-shop in Moorgate", finsbury: "the offices in Finsbury Circus",
  market: "the street-market in Bermondsey", pawnshop: "the pawnbroker's shop in Bermondsey", heath: "Hampstead Heath, where the Bank Holiday fair is held", chapel: "the Bermondsey Methodist chapel", church: "St. Mary's Church, Islington", park: "Highbury Fields, a public park"
};
const A = {
  ada: { name: 'Mrs. Ada Turner', short: 'Ada', f: true, money: 3 * 12 + 9,
    sheet: "Mrs. Ada Turner, aged forty-one, a charwoman. She cleans the Moorgate insurance office from half past seven till nine, and then the offices in Finsbury Circus. A war-widow; her son Bert, aged twenty, a docker, lives with her and pays half the rent of seven shillings a week. Honest, chapel-going, proud, sharp-tongued, kind." },
  arthur: { name: 'Mr. Arthur Hale', short: 'Arthur', f: false, money: 4 * 12 + 6,
    sheet: "Mr. Arthur Hale, aged thirty-four, a ledger clerk at the Moorgate Fire and Life Assurance Company, earning £3 10s. a week; married to Edith, with a daughter Joan, aged seven. Conscientious, careful with money, a little timid with his superiors, fond of his garden and the newspaper." },
  thomas: { name: 'Mr. Walter Thomas', short: 'Mr. Thomas', f: false, money: 40 * 12,
    sheet: "Mr. Walter Thomas, aged fifty-six, chief clerk of the Moorgate Fire and Life Assurance Company. Stern, exact, a stickler for duty, but fair and secretly kind. He pays the clerks' wages and the charwoman's on Fridays. A widower in Highbury; a churchgoer who walks in Highbury Fields on Sundays." }
};
const NPC = {
  edith: { name: 'Mrs. Edith Hale', place: 'arthur_home', f: true, sheet: "Mrs. Edith Hale, Arthur's wife, aged thirty-two; a careful housekeeper who must feed the family on what Arthur gives her each Friday. Warm but practical." },
  joan: { name: 'Joan Hale', place: 'arthur_home', f: true, sheet: "Joan Hale, aged seven, Arthur's daughter; lively, curious, full of questions." },
  bert: { name: 'Bert Turner', place: 'ada_home', f: false, sheet: "Bert Turner, aged twenty, Ada's son, a docker; good-humoured, devoted to his mother, ashamed when out of work." }
};
for (const k in A) { A[k].books = {}; A[k].lastTopic = {}; A[k].mem = []; A[k].op = {}; A[k].metToday = new Set(); A[k].done = {}; for (const o of [...Object.keys(A), ...Object.keys(NPC)]) if (o !== k) A[k].op[o] = 0; }
const W = { wage: 840, day: 0, t: 0, coin: { where: 'floor', finder: null }, ledger: { steps: 0, errors: 0, assigned: false, need: 3, verdict: null }, audit: { steps: 0, errors: 0, verdict: null, raise: null },
  paid: {}, bertWork: true, rentDue: false, rentPaid: {}, joanIll: false, doctor: null, extraHours: null, loan: null, facts: [] };
const nameOf = k => A[k] ? A[k].name : NPC[k].name;
const isF = k => A[k] ? A[k].f : NPC[k].f;
const hisher = k => isF(k) ? 'her' : 'his';
const heshe = k => isF(k) ? 'she' : 'he';
const himher = k => isF(k) ? 'her' : 'him';

// ---------- facts of known date: used by the memory probes ----------
function fact(who, q, opts, truth, kind = 'life') { W.facts.push({ day: W.day, who, q, opts, truth, kind }); }

// ---------- states: what is true now, and since when (MemOps/LongMemEval: models fail at state changes) ----------
function setState(key, who, text) { W.st = W.st || {}; W.st[key] = { who, text, day: W.day }; }
function states(k, query = '', budget = 240) {
  const q = new Set(words(query));
  const xs = Object.values(W.st || {}).filter(x => x.who.includes(k)).map(x => ({ x, sc: words(x.text).filter(w => q.has(w)).length * 3 + x.day / 100 }));
  xs.sort((a, b) => b.sc - a.sc); const out = []; let used = 0;
  for (const { x } of xs) { const t = `${x.text} (since ${SHORTDATE(x.day)}).`; if (used + t.length > budget) continue; out.push(t); used += t.length + 1; }
  return out.join(' ');
}
// ---------- values: a small identity store per person, retrieved by the matter in hand (after ID-RAG) ----------
const VALUES = {
  ada: [['rent money pawn loan lend borrow shilling', 'Ada would rather pawn her own things than beg or run into debt.'], ['half-crown found keep coin honesty', 'Ada holds that what is found belongs to its owner.'], ['chapel collection pray sunday', 'Ada is chapel: no drink, no betting, the Sabbath kept.'], ['bert son work docks', 'Ada puts Bert before herself.'], ['thomas hale extra work wages', 'Ada is civil to her betters but will not be talked down to.'], ['letter write sister', 'Ada keeps up with her own people, though she writes slowly.']],
  arthur: [['housekeeping edith money wages', 'Arthur thinks a man must provide properly for his wife and child.'], ['ledger audit work books', 'Arthur takes pride in a clean, exact ledger.'], ['joan doctor ill birthday', 'Arthur would spend his last shilling on Joan.'], ['thomas rise chief successor', 'Arthur is anxious to stand well with Mr. Thomas and the directors.'], ['lend loan turner', 'Arthur is kindly but careful about lending.'], ['letter write bray', 'Arthur answers letters promptly, as a clerk should.']],
  thomas: [['wages pay friday turner', 'Mr. Thomas holds that wages are paid on the day, to the penny.'], ['ledger audit books hale', 'Mr. Thomas judges a clerk by his books.'], ['rise recommend successor chief', 'Mr. Thomas is fair, and will not favour or slight a man unjustly.'], ['church collection sunday', 'Mr. Thomas is a regular churchman.'], ['ill chill retire', 'Mr. Thomas thinks it a disgrace to neglect his duty for his own comfort.'], ['letter head office directors', 'Mr. Thomas answers the directors exactly and at once.']]
};
function values(k, query) {
  const q = new Set(words(query));
  const xs = VALUES[k].map(([t, v], i) => ({ v, sc: words(t).filter(w => q.has(w)).length - i * 0.01 })).sort((a, b) => b.sc - a.sc);
  return xs.filter(x => x.sc > 0).slice(0, 2).map(x => x.v).join(' ') || VALUES[k][0][1];
}
// ---------- books: rent-book, pawn-ticket, account-book, office diary, wages-book (engine-written) ----------
function note(k, book, text) { (A[k].books[book] = A[k].books[book] || []).push({ day: W.day, text: `${SHORTDATE(W.day)}: ${text}` }); }
function lookup(k, query, qday = null, n = 2) {
  const q = new Set(words(query)); const out = [];
  for (const [book, es] of Object.entries(A[k].books)) for (const e of es) {
    const ov = [...new Set(words(book + ' ' + e.text))].filter(w => q.has(w)).length;
    const sc = ov + (qday !== null ? (e.day === qday ? 4 : -1) : 0) + e.day * 0.001;
    if (ov >= 1 || (qday !== null && e.day === qday)) out.push({ book, e, sc });
  }
  out.sort((a, b) => b.sc - a.sc);
  const top = out.slice(0, n).filter(x => x.sc >= 1.5);
  if (!top.length) return '';
  const He = isF(k) ? 'She' : 'He';
  return top.map(x => `${He} looks in ${hisher(k)} ${x.book}: "${x.e.text}"`).join(' ');
}
// ---------- memory ----------
function remember(k, text, about = [], imp = null) {
  if (imp === null) imp = /half-crown|wages|ledger|audit|warned|thanked|honesty|promised|housekeeping|late|rent|doctor|ill|lost his work|loan|lend|raise|extra hours/i.test(text) ? 3 : /spoke with/.test(text) ? 2 : 1;
  A[k].mem.push({ day: W.day, t: W.t, text, about, imp });
}
const ago = d => d === 'past' ? '(Long ago) ' : W.day - d === 0 ? '' : W.day - d === 1 ? '(Yesterday) ' : W.day - d < 7 ? `(${DAYNAME(d)}) ` : `(${SHORTDATE(d)}) `;
const STOP = new Set('the a an and or of to in on at for with his her he she it is was be by as that this from had has have him them they their mr mrs said what did you your which who when how whether there were will would not no'.split(' '));
const words = t => (t || '').toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, '')) || [];
function recall(k, focus = [], query = '', budget = 520) {   // relevance (rare words count more) + importance + log recency + date named in the query
  const m = A[k].mem.filter(x => !x.belief); const q = new Set(words(query)); const qday = qdayOf(query);
  const df = {}; m.forEach(x => new Set(words(x.text)).forEach(w => df[w] = (df[w] || 0) + 1));
  const idf = w => Math.log(1 + m.length / (df[w] || 1));
  const scored = m.map((x, i) => {
    const ov = q.size ? [...new Set(words(x.text))].filter(w => q.has(w)).reduce((s2, w) => s2 + idf(w), 0) : 0;
    const age = x.day === 'past' ? 0 : W.day - x.day;
    return { x, i, score: x.imp + Math.min(ov, 10) * 1.2 + (x.about.some(a => focus.includes(a)) ? 1.5 : 0) + (qday !== null && x.day === qday ? 8 : 0) + (x.month && new RegExp(x.month, 'i').test(query) ? 4 : 0) - Math.log2(1 + age) * 0.6 + (i >= m.length - 2 ? 2 : 0) };
  }).sort((a, b) => b.score - a.score);
  const cut = t => t.length > 160 ? t.slice(0, 157).replace(/\s+\S*$/, '') + '…' : t;
  const out = []; let used = 0;
  const show = x => ago(x.day) + (x.month ? x.text : cut(x.text));
  for (const y of scored) { const t = show(y.x); if (used + t.length > budget) continue; out.push(y); used += t.length + 1; if (out.length >= 5) break; }
  return out.sort((a, b) => a.i - b.i).map(y => show(y.x)).join(' ');
}
function beliefs(k, people) { return people.map(p => A[k].mem.filter(x => x.belief === p).slice(-1)[0]).filter(Boolean).map(x => x.text).join(' '); }
function opinionWords(k, o) { const v = A[k].op[o] || 0; return v >= 2 ? 'likes and trusts' : v === 1 ? 'thinks well of' : v === 0 ? 'has no strong feeling about' : v === -1 ? 'is a little put out with' : 'is angry with'; }
function consolidate() {   // weekly: keep what matters (importance 3, beliefs, lessons, promises), forget the rest older than a week
  for (const k in A) {
    A[k].mem = A[k].mem.filter(x => x.day === 'past' || x.belief || x.imp >= 3 || /resolves|promised/.test(x.text) || W.day - x.day < 7);
    const lastB = {}; A[k].mem.forEach((x, i) => { if (x.belief) lastB[x.belief] = i; }); A[k].mem = A[k].mem.filter((x, i) => !x.belief || lastB[x.belief] === i);
    if (A[k].mem.length > 160) A[k].mem = [...A[k].mem.filter(x => x.day === 'past'), ...A[k].mem.filter(x => x.day !== 'past').slice(-150)];
  }
}

// ---------- the schedule: where everybody is at each tick ----------
function ticks(d) { const w = DOW(d); return isRest(d) ? [10 * 60 + 30, 16 * 60, 19 * 60] : w === 'sat' ? [7 * 60 + 30, 8 * 60 + 30, 12 * 60 + 30, 15 * 60, 19 * 60] : [7 * 60 + 30, 8 * 60 + 30, 12 * 60 + 30, 17 * 60, 19 * 60]; }
function placeFor(k, d, t) {
  const w = DOW(d), sat = w === 'sat', bank = BANK.includes(d), holy = DOW(d) === 'sun' || d === GOODFRI;
  if (k === 'ada') {
    if (holy) return t < 12 * 60 ? 'chapel' : 'ada_home';
    if (bank) return t === 16 * 60 ? 'heath' : 'ada_home';
    if (t < 9 * 60) return 'office';
    if (t < 12 * 60) return 'finsbury';
    if ((sat && t === 15 * 60) || (!sat && t === 17 * 60)) return W.redeemDue && sat ? 'pawnshop' : 'market';
    return 'ada_home';
  }
  if (k === 'arthur') {
    if (holy) return t < 12 * 60 ? 'church' : t === 16 * 60 ? 'park' : 'arthur_home';
    if (bank) return t === 16 * 60 ? 'heath' : 'arthur_home';
    if (t < 8 * 60) return 'arthur_home';
    if (t === 12 * 60 + 30 && !sat) return 'teashop';
    if (t <= (sat ? 12 * 60 + 30 : 17 * 60)) return 'office';
    return 'arthur_home';
  }
  if (k === 'thomas') {
    if (W.thomasIll && W.thomasIll.includes(d)) return null;
    if (holy) return t < 12 * 60 ? 'church' : t === 16 * 60 ? 'park' : 'thomas_home';
    if (bank) return t === 16 * 60 ? 'park' : 'thomas_home';
    if (t < 8 * 60 + 30) return 'thomas_home';
    if (t === 12 * 60 + 30 && !sat) return 'teashop';
    if (t <= (sat ? 12 * 60 + 30 : 17 * 60)) return 'office';
    return 'thomas_home';
  }
}

// ---------- tools on the engine side ----------
const SUMS = [[1245, 3870], [2316, 989], [4402, 1758], [3075, 2640], [1980, 3415], [2750, 1125], [3310, 2468], [1604, 2937]];
const EXAMPLE = "From the office manual: when two premiums, say £200 and £150, are to be added, the clerk looks on the machine for the line which ADDS them (200 + 150 = 350) and enters 350; never the line which subtracts, multiplies or divides.\n\n";
async function bookWork(which) {   // adding-machine tool + worked example + cross-check with one retry
  const B = which === 'audit' ? W.audit : W.ledger;
  const [a, b] = SUMS[(B.steps + B.errors + (which === 'audit' ? 4 : 0)) % SUMS.length];
  const rows = [`${a} + ${b} = ${a + b}`, `${a} − ${b} = ${a - b}`, `${a} × ${b} = ${a * b}`, `${a} ÷ ${b} = ${(a / b).toFixed(2)}`];
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  const q = `The premiums received, £${a} and £${b}, must be added together for the ${which === 'audit' ? 'books to be audited' : 'quarterly ledger'}.\n\nThe office adding-machine shows:\n${order.map((oi, j) => `(${L[j]}) ${rows[oi]}`).join('\n')}\n\nWhich figure must Arthur enter as the total? Answer with the letter only.`;
  const head = `Mr. Arthur Hale, a ledger clerk, is entering totals in the office books, ${DAYS[W.day]}.\n\n`;
  let c = await choose(`${head}${EXAMPLE}${q}`, order.map(oi => rows[oi]));
  let right = c.i !== null && order[c.i] === 0;
  if (!right) {
    STATS.bookRetry = (STATS.bookRetry || 0) + 1;
    c = await choose(`${head}${EXAMPLE}${q}\n\nThe cross-check shows that figure is wrong: premiums received are ADDED together. Which figure is right? Answer with the letter only.`, order.map(oi => rows[oi]));
    right = c.i !== null && order[c.i] === 0; if (right) STATS.bookFixed = (STATS.bookFixed || 0) + 1;
  }
  if (right) { B.steps++; STATS.bookRight = (STATS.bookRight || 0) + 1; return `Arthur entered the correct total in the ${which === 'audit' ? 'audit books' : 'ledger'} (${a + b}).`; }
  B.errors++; STATS.bookWrong = (STATS.bookWrong || 0) + 1; return `Arthur entered a wrong figure in the ${which === 'audit' ? 'audit books' : 'ledger'}.`;
}
const MARKET = [
  { text: 'scrag-end of mutton, potatoes and a cabbage', cost: 16 }, { text: 'a pound of sausages, bread and margarine', cost: 13 },
  { text: 'bread, dripping and a few potatoes', cost: 6 }, { text: 'a rabbit, onions and a loaf, for a stew', cost: 21 }
];

// ---------- the daily plan of events (engine side) ----------
function morningEvents() {
  const d = W.day, w = DOW(d);
  letters();
  if (d === 3 || d === 55) { W.bertWork = false; setState('bert', ['ada'], 'Bert is out of work'); remember('ada', 'Bert came home from the docks to say he has been stood off and lost his work; the rent of seven shillings is due on Friday.', ['bert', 'rent'], 3); fact('ada', `What happened to Bert at the docks in the week of ${SHORTDATE(d)}?`, ['He was stood off and lost his work', 'He was made a foreman', 'Nothing; he worked as usual'], 0); say('   ★ Bert has lost his work at the docks.'); }
  if ((d === 12 || d === 66) && !W.bertWork) { W.bertWork = true; setState('bert', ['ada'], 'Bert is in work again, carting at the gasworks'); remember('ada', 'Bert has found work again, carting at the gasworks.', ['bert'], 3); say('   ★ Bert has found work again.'); }
  if (d === 5) { W.joanIll = true; setState('joan', ['arthur'], 'Joan is ill in bed'); remember('arthur', 'Joan, his daughter, has fallen ill: she woke feverish and coughing, and Edith fears bronchitis.', ['joan', 'edith'], 3); fact('arthur', 'Who in your family fell ill in the week of the audit?', ['Joan, my daughter', 'Edith, my wife', 'Nobody'], 0); say('   ★ Joan has fallen ill.'); }
  if (d === 8 && W.joanIll) { W.joanIll = false; setState('joan', ['arthur'], 'Joan is well again'); remember('arthur', 'Joan has mended at last, though the doctor was never called.', ['joan'], 3); }
  if (d === 6) { remember('arthur', 'On Thursday Mr. Thomas announced that the auditors come on Monday, and the books must be ready for them.', ['thomas', 'audit'], 3); remember('thomas', 'He told Mr. Hale that the auditors come on Monday.', ['arthur', 'audit'], 3); W.auditDue = true; fact('arthur', 'What did Mr. Thomas announce in the week before the audit?', ['The auditors were coming on Monday', 'The office would close early', 'Wages would be paid late'], 0); say('   ★ The audit is announced for Monday.'); }
  if (d === 30 && W.audit.raise) { W.wage = 900; setState('wage', ['arthur'], 'Arthur earns £3 15s. a week, after his rise'); remember('arthur', 'His rise of five shillings begins this month, February: his wages are now £3 15s. a week.', ['money', 'thomas'], 3); fact('arthur', 'What are your weekly wages now?', ['Three pounds fifteen shillings', 'Three pounds ten shillings', 'Four pounds'], 0); say('   ★ Arthur\'s rise begins: £3 15s. a week.'); }
  if (d === 29) { setState('granny', ['arthur'], "Edith's mother, Mrs. Bray, is staying in the house"); NPC.granny = { name: "Mrs. Bray, Edith's mother", place: 'arthur_home', f: true, sheet: "Mrs. Bray, Edith's widowed mother, aged sixty-five, come from Colchester to stay for a fortnight; sharp-eyed, kindly, fond of Joan." }; remember('arthur', "Edith's mother, Mrs. Bray, has come from Colchester to stay for a fortnight; there is an extra mouth to feed.", ['edith', 'money'], 3); fact('arthur', 'Who came to stay with you in February?', ["Edith's mother, Mrs. Bray", 'Your brother', 'Nobody'], 0); say("   ★ Edith's mother comes to stay for a fortnight."); }
  if (d === 39) { setState('granny', ['arthur'], 'Mrs. Bray has gone home to Colchester'); delete NPC.granny; remember('arthur', "Mrs. Bray has gone home to Colchester after her fortnight.", ['edith'], 2); }
  if (d === 57) { remember('arthur', "Today is Joan's eighth birthday.", ['joan'], 3); W.birthday = true; say("   ★ Joan's birthday."); }
  if (d === 58) W.birthday = false;
  if (d === 59) { setState('thomas', ['arthur', 'ada', 'thomas'], 'Mr. Thomas is away ill; Mr. Hale is in charge'); W.thomasIll = [59, 60, 61, 62, 63]; remember('arthur', 'Mr. Thomas is ill with a chill and will be away all week; Arthur is left in charge of the clerks\' room.', ['thomas'], 3); remember('ada', 'Mr. Thomas is away ill this week; Mr. Hale is in charge of the office.', ['thomas', 'arthur'], 3); fact('arthur', 'Who was in charge of the office in the week Mr. Thomas was ill?', ['I was', 'A clerk from the Leeds branch', 'Nobody'], 0); say('   ★ Mr. Thomas falls ill; Arthur is in charge.'); }
  if (d === 64) setState('thomas', ['arthur', 'ada', 'thomas'], 'Mr. Thomas is back at the office after his chill');
  if (d === 64) remember('thomas', 'He is back at the office after his chill.', [], 2);
  if (d === 73) { W.retire = true; setState('retire', ['arthur', 'ada', 'thomas'], 'Mr. Thomas is to retire at the end of April'); for (const k of ['arthur', 'thomas', 'ada']) remember(k, k === 'thomas' ? 'He has told the office that he will retire at the end of April, and must recommend a successor as chief clerk by Friday week.' : 'Mr. Thomas has announced that he will retire at the end of April, and will recommend a successor as chief clerk.', ['thomas', 'arthur'], 3); fact('ada', 'What did Mr. Thomas announce in the middle of March?', ['That he will retire at the end of April', 'That the office will close', 'That wages will be cut'], 0); say('   ★ Mr. Thomas announces his retirement.'); }
  if (w === 'fri') W.rentDue = true;
  if (w === 'mon' && W.rentOwing) W.rentDue = true;
  if (W.pawnedDay !== undefined && !W.redeemed && d - W.pawnedDay >= 70 && !W.forfeit) { W.forfeit = true; W.redeemDue = false; setState('watch', ['ada'], `Her husband's watch, pawned on ${SHORTDATE(W.pawnedDay)}, was sold by the pawnbroker when the ticket ran out`); note('ada', 'pawn-ticket', 'the ticket has run out; the watch is forfeit'); remember('ada', "The pawnbroker has sold her husband's watch: the ticket ran out before she could redeem it.", ['money'], 3); fact('ada', "What became of your husband's watch?", ['The pawnbroker sold it', 'I redeemed it from the pawnbroker', 'It is still at the pawnshop'], 0); say("   ★ Ada's watch is forfeited."); }
}
function letter(k, from, text, about, f) {
  (A[k].letters = A[k].letters || []).push({ day: W.day, from, text, answered: false });
  remember(k, `A letter came from ${from}: ${text}`, about, 3); note(k, 'letters', `from ${from}: ${text.slice(0, 120)}`);
  if (f) fact(k, f[0], f[1], 0, 'letter');
  say(`   ✉ ${A[k].short} has a letter from ${from}: ${text}`); STATS.letters = (STATS.letters || 0) + 1;
}
function letters() {   // the post comes in the morning
  const d = W.day;
  if (d === 6) letter('ada', 'her sister Lizzie, at Paddock Wood in Kent', 'A happy New Year to them both. The hop-gardens will want pickers in September; Bert could have work there for three weeks, and they would be glad to see Ada too.', ['bert'], ['What did your sister Lizzie write to you about in January?', ['Work for Bert at the hop-picking in September', 'That she was coming to London', 'That she was ill']]);
  if (d === 41) letter('arthur', "Mrs. Bray, Edith's mother, at Colchester", 'She thanks them for a happy fortnight, sends Joan a shilling postal order towards her birthday, and says her rheumatism is better for the change.', ['edith', 'joan'], ['Who wrote to you after Mrs. Bray went home, and from where?', ["Mrs. Bray, from Colchester", 'Your brother, from Leeds', 'Nobody']]);
  if (W.pawnedDay !== undefined && !W.redeemed && !W.forfeit && d - W.pawnedDay === 60) letter('ada', 'the pawnbroker', `A printed card: the ticket for the watch runs out on ${SHORTDATE(W.pawnedDay + 70)}; unless it is redeemed by then it will be sold.`, ['watch'], ['What did the card from the pawnbroker say?', ['The ticket for the watch would soon run out', 'The watch had been stolen', 'Nothing; no card came']]);
  if (W.rentOwingCount >= 2 && !W.noticeSent) { W.noticeSent = true; letter('ada', 'the landlord', 'Notice: unless the arrears of rent are paid by Saturday week, she must give up the rooms.', ['rent'], ['What did the landlord write to you?', ['That I must pay the arrears or leave the rooms', 'That the rent was going down', 'Nothing']]); }
  if (d === 72) letter('thomas', 'the directors of the company', 'The Board accepts his retirement at the end of April with thanks for thirty-one years of service, and asks him to name his successor as chief clerk by Friday the 27th of March.', ['arthur'], ['What did the directors ask of you in their letter in March?', ['To name my successor as chief clerk', 'To stay on another year', 'To dismiss Mr. Hale']]);
}
// The household budgets of a London charwoman, a ledger clerk and a chief clerk in 1931 (rounded, after the
// New Survey of London Life and Labour, 1929-31): what is spent every day and week whatever anybody decides.
function spend(k, pence, what, book) { A[k].money -= pence; if (book) note(k, book, `${what}, ${money(pence)}`); STATS.spent = (STATS.spent || 0) + pence; }
function budgets() {
  const d = W.day, w = DOW(d);
  spend('ada', 18, 'food for two', null); spend('ada', 6, 'coal and the gas meter', null);
  if (w === 'fri' && W.bertWork) { A.ada.money += 96; remember('ada', 'Bert gave her eight shillings for his board.', ['bert', 'money'], 2); note('ada', 'purse-book', 'Bert paid his board, 8s.'); }
  if (w === 'sat') { spend('ada', 12, 'burial club and boot club', 'purse-book'); }
  if (!['sat', 'sun'].includes(w)) spend('arthur', 4, 'fares to Moorgate', null);
  if (w === 'sat') { spend('arthur', 180, 'rent of the house', 'account-book'); spend('arthur', 12, 'the Prudential', 'account-book'); spend('arthur', 60, 'boots, clothing club and sundries', 'account-book');
    const fri = d - 1; if (fri >= 0 && A.arthur.done['hk' + fri] === undefined && W.paid['arthur' + fri]) { A.arthur.done['hk' + fri] = 35; spend('arthur', 420, 'housekeeping to Edith (the usual), 35s.', 'account-book'); remember('arthur', 'Edith took the usual thirty-five shillings for the housekeeping, as he had not given her any.', ['edith', 'money'], 2); } }
  if (w === 'fri') { A.thomas.money += 1560; note('thomas', 'account-book', 'salary received, £6 10s.'); }
  if (w === 'sat') spend('thomas', 900, 'rent, rates, housekeeper and coals', 'account-book');
  for (const k of ['ada', 'arthur']) {
    const was = W['debt' + k]; const now = A[k].money < 0;
    if (now && !was) { remember(k, k === 'ada' ? 'She has run short and is buying on tick at the grocer\'s.' : 'He has overspent and is short of money till Friday.', ['money'], 3); setState('debt' + k, [k], k === 'ada' ? 'Ada is in debt to the grocer' : 'Arthur is short of money'); say(`   ★ ${A[k].short} has run into debt.`); STATS.debts = (STATS.debts || 0) + 1; }
    if (!now && was) setState('debt' + k, [k], k === 'ada' ? 'Ada has paid off the grocer' : 'Arthur is out of debt again');
    W['debt' + k] = now;
  }
}
function eveningEvents() {
  const d = W.day, w = DOW(d);
  if (!off('budgets')) budgets();
  if (w === 'fri') {
    A.ada.money += 120; remember('ada', 'She was paid ten shillings at Finsbury Circus.', ['money'], 1);
    if (W.bertWork) { A.ada.money += 42; remember('ada', 'Bert gave her his half of the rent, 3s. 6d.', ['bert', 'rent'], 2); }
  }
  if (d === 5 && W.doctor === null) { W.doctor = 'not called'; remember('arthur', 'Joan is no better tonight; the doctor has not been called.', ['joan'], 3); }
}

// ---------- options: what the agent may do here and now ----------
function optionsFor(k) {
  const a = A[k], here = a.place, o = [], d = W.day, t = W.t, w = DOW(d), others = presentAt(k);
  if (k === 'ada') {
    if (here === 'office') {
      if (!a.done[d + 'scrub']) o.push({ text: "Scrub the floor under the clerks' desks.", run: () => { a.done[d + 'scrub'] = true; let r = "Ada scrubbed the floor under the clerks' desks."; if (W.coin.where === 'floor' && d <= 2) { W.coin.where = 'ada'; W.coin.finder = 'ada'; r += " Under Mr. Hale's desk she found a half-crown (2s. 6d.) wedged in a crack of the boards."; remember('ada', "She found a half-crown under Mr. Hale's desk while scrubbing.", ['arthur', 'coin'], 3); } return r; } });
      if (!a.done[d + 'dust']) o.push({ text: 'Empty the waste-paper baskets and dust the desks.', run: () => { a.done[d + 'dust'] = true; return 'Ada emptied the baskets and dusted the desks.'; } });
      if (t >= 8 * 60 + 30) o.push({ text: 'Put away her pail and go on to Finsbury Circus, so as to be there by nine.', run: () => { a.place = 'finsbury'; return 'Ada went on to Finsbury Circus.'; } });
      if (W.coin.where === 'ada') {
        o.push({ text: "Lay the half-crown on Mr. Hale's desk, where he will find it.", run: () => { W.coin.where = 'desk'; remember('ada', "She laid the half-crown she found on Mr. Hale's desk.", ['arthur', 'coin'], 3); fact('ada', "What did you do with the half-crown you found under Mr. Hale's desk?", ['Laid it on his desk', 'Kept it', 'Gave it to Mr. Thomas'], 0); return "Ada laid the half-crown on Mr. Hale's desk."; } });
        o.push({ text: 'Keep the half-crown for herself; nobody would know.', run: () => { W.coin.where = 'kept'; a.money += 30; remember('ada', "She kept the half-crown she found under Mr. Hale's desk.", ['arthur', 'coin'], 3); fact('ada', "What did you do with the half-crown you found under Mr. Hale's desk?", ['Laid it on his desk', 'Kept it', 'Gave it to Mr. Thomas'], 1); return 'Ada slipped the half-crown into her purse.'; } });
      }
      if (W.loan && /owes/.test(W.loan) && a.money >= 60 + (W.rentDue ? 84 : 0) && others.includes('arthur')) o.push({ text: 'Pay Mr. Hale back the five shillings she owes him.', run: () => { a.money -= 60; A.arthur.money += 60; W.loan = 'repaid'; setState('loan', ['ada', 'arthur'], 'Mrs. Turner has repaid Mr. Hale his five shillings'); note('ada', 'purse-book', 'paid Mr. Hale back his 5s.'); note('arthur', 'account-book', 'Mrs. Turner repaid the 5s.'); remember('ada', 'She paid Mr. Hale back the five shillings she owed him.', ['arthur', 'loan'], 3); remember('arthur', 'Mrs. Turner paid him back the five shillings he lent her.', ['ada', 'loan'], 3); fact('arthur', 'Has Mrs. Turner paid back the money you lent her?', ['Yes, all of it', 'No, not yet', 'I never lent her any'], 0); return 'Ada repaid Arthur his five shillings.'; } });
      if (!W.bertWork && W.extraHours === null && others.includes('thomas')) o.push({ talk: { to: 'thomas', topic: 'whether there is any extra cleaning she might do for more money, now that Bert is out of work', resolve: 'extra' }, text: 'Ask Mr. Thomas whether there is any extra cleaning she might do for more money.' });
      if (W.rentDue && !W.rentPaid[d] && A.ada.money < 84 && W.loan === null && others.includes('arthur')) o.push({ talk: { to: 'arthur', topic: 'whether he could lend her a few shillings till next week, for the rent', resolve: 'loan' }, text: 'Ask Mr. Hale whether he could lend her a few shillings for the rent.' });
    }
    if (here === 'market') {
      for (const it of MARKET) if (it.cost <= a.money) o.push({ text: `Buy ${it.text} (${money(it.cost)}); she would have ${money(a.money - it.cost)} left.`, run: () => { a.money -= it.cost; remember('ada', `She bought ${it.text} for ${money(it.cost)}.`, ['money'], 1); return `Ada bought ${it.text} for ${money(it.cost)}`; } });
      o.push({ text: 'Buy nothing today, to save her money for the rent.', run: () => { remember('ada', 'She bought nothing at the market, to save for the rent.', ['rent'], 2); return 'Ada bought nothing, to save for the rent.'; } });
    }
    if (here === 'ada_home') {
      if (W.rentDue && !W.rentPaid[d] && t >= 19 * 60) {
        if (a.money >= 84) o.push({ text: `Pay the landlord the week's rent of seven shillings; she would have ${money(a.money - 84)} left.`, run: () => payRent(true) });
        o.push({ text: 'Ask the landlord to wait for the rent till next week.', run: () => payRent(false) });
        if (!a.done.pawned) o.push({ text: "Pawn her late husband's watch for ten shillings, to pay the rent.", run: () => { a.done.pawned = true; W.pawnedDay = W.day; setState('watch', ['ada'], `Her husband's watch is in pawn since ${SHORTDATE(W.day)}; to be redeemed for 11s. by ${SHORTDATE(W.day + 70)}`); W.redeemDue = true; a.money += 120; note('ada', 'pawn-ticket', `husband's watch pledged for 10s.; to be redeemed for 11s. by ${SHORTDATE(W.day + 70)}`); remember('ada', "She pawned her late husband's watch for ten shillings; to redeem it she must pay eleven shillings within ten weeks.", ['money', 'watch'], 3); fact('ada', "Did you pawn anything this winter?", ["My late husband's watch", 'My wedding ring', 'Nothing'], 0); return "Ada pawned her late husband's watch for 10s."; } });
      }
      o.push({ text: 'Cook the supper and mend Bert\'s working jacket.', run: () => 'Ada cooked the supper and mended.' });
      if (t >= 16 * 60 && a.readDay !== d && a.money >= 2) o.push({ text: w === 'sun' ? 'Read the News of the World with Bert (2d.).' : 'Read the evening paper that Bert brought home (1d.).', run: () => readPaper('ada', w === 'sun' ? 'the News of the World' : 'the evening paper', w === 'sun' ? 2 : 1) });
    }
    if (here === 'pawnshop') {
      if (a.money >= 132) o.push({ text: `Redeem her husband's watch for eleven shillings; she would have ${money(a.money - 132)} left.`, run: () => { a.money -= 132; W.redeemed = true; setState('watch', ['ada'], `Her husband's watch, pawned on ${SHORTDATE(W.pawnedDay)}, was redeemed from the pawnbroker and is back at home`); W.redeemDue = false; note('ada', 'pawn-ticket', 'ticket given up: the watch redeemed for 11s.'); remember('ada', "She redeemed her husband's watch from the pawnbroker for eleven shillings.", ['watch', 'money'], 3); fact('ada', "What became of your husband's watch?", ['I redeemed it from the pawnbroker', 'The pawnbroker sold it', 'It is still at the pawnshop'], 0); return "Ada redeemed her husband's watch."; } });
      o.push({ text: 'Leave the watch in pawn another week; she cannot spare the money yet.', run: () => { remember('ada', 'She could not yet afford to redeem the watch.', ['watch'], 2); return 'Ada left the watch in pawn.'; } });
    }
    if (here === 'heath') {
      if (a.money >= 1) o.push({ text: 'Buy Bert a ginger-beer (1d.) and enjoy the fair.', run: () => { a.money -= 1; return 'Ada bought Bert a ginger-beer at the fair.'; } });
      o.push({ text: 'Walk about the fair, watching the roundabouts and the swings.', run: () => 'Ada walked about the fair.' });
    }
    if (here === 'chapel') {
      for (const c of [1, 3, 6]) if (c <= a.money) o.push({ text: `Put ${money(c)} in the collection.`, run: () => { a.money -= c; return `Ada put ${money(c)} in the collection.`; } });
      o.push({ text: 'Pray quietly for Bert to find work.', run: () => { remember('ada', 'She prayed at chapel for Bert to find work.', ['bert'], 2); return 'Ada prayed for Bert.'; } });
    }
  }
  if (k === 'arthur') {
    if (here === 'office') {
      if (W.auditDue && !W.audit.verdict) o.push({ text: 'Work at preparing the books for the auditors.', book: 'audit' });
      else if (W.ledger.assigned && W.ledger.steps < W.ledger.need && !W.ledger.verdict) o.push({ text: 'Work at the quarterly ledger.', book: 'ledger' });
      else o.push({ text: "Get on with the day's ordinary entries in the books.", run: () => "Arthur worked at the day's entries." });
      if (d === 0 && !a.done.searched && W.coin.where !== 'arthur') o.push({ text: 'Look about the floor for the half-crown he lost yesterday.', run: () => { a.done.searched = true; if (W.coin.where === 'floor') { W.coin.where = 'arthur'; W.coin.finder = 'arthur'; a.money += 30; remember('arthur', 'He found his lost half-crown himself, under his desk.', ['coin'], 3); return 'Arthur found his half-crown under his desk!'; } return 'Arthur searched, but the half-crown was not on the floor.'; } });
      if (W.coin.where === 'desk') o.push({ text: 'Pick up the half-crown lying on his desk.', run: () => { W.coin.where = 'arthur'; a.money += 30; remember('arthur', 'He found his lost half-crown laid on his desk; somebody must have found it and put it there.', ['coin'], 3); return 'Arthur picked up his half-crown from the desk.'; } });
      if (W.joanIll && W.doctor !== 'called' && !a.done.leave && others.includes('thomas')) o.push({ talk: { to: 'thomas', topic: 'whether he may leave early, as his little girl is ill', resolve: 'leave' }, text: 'Ask Mr. Thomas whether he may leave early, as Joan is ill.' });
    }
    if (here === 'teashop') {
      o.push({ text: 'Have soup and a chop (1s. 2d.).', run: () => { a.money -= 14; return 'Arthur had soup and a chop for 1s. 2d.'; } });
      o.push({ text: 'Have only a cup of tea and a bun (3d.), to save money.', run: () => { a.money -= 3; return 'Arthur had tea and a bun for 3d.'; } });
    }
    if (here === 'arthur_home') {
      if (w === 'fri' && W.paid['arthur' + d] && !a.done['hk' + d]) for (const s of [30, 35, 40, 45]) o.push({ text: `Give Edith ${s} shillings for the week's housekeeping; he would keep ${money(a.money - s * 12)}.`, run: () => { a.money -= s * 12; a.done['hk' + d] = s; note('arthur', 'account-book', `housekeeping to Edith, ${s}s.`); remember('arthur', `He gave Edith ${s} shillings for the week's housekeeping.`, ['edith', 'money'], 3); fact('arthur', `How much housekeeping money did you give Edith on ${LONGDATE(d)}?`, ['thirty shillings (30s.)', 'thirty-five shillings (35s.)', 'forty shillings (40s.)', 'forty-five shillings (45s.)'], [30, 35, 40, 45].indexOf(s)); return `Arthur gave Edith ${s}s. for the housekeeping.`; } });
      if (W.joanIll && W.doctor !== 'called' && a.money >= 42) o.push({ text: `Send for the doctor for Joan (3s. 6d.); he would have ${money(a.money - 42)} left.`, run: () => { a.money -= 42; W.doctor = 'called'; setState('joan', ['arthur'], 'Joan is mending; the doctor has seen her'); note('arthur', 'account-book', 'doctor for Joan, 3s. 6d.'); W.joanIll = false; remember('arthur', 'He sent for the doctor for Joan, who said it was a bad cold, not bronchitis, and she would mend.', ['joan', 'money'], 3); fact('arthur', "Did you send for the doctor for Joan?", ['Yes', 'No'], 0); return 'Arthur sent for the doctor (3s. 6d.); Joan has a bad cold and will mend.'; } });
      if (W.joanIll && W.doctor !== 'called') o.push({ text: 'Wait and see whether Joan mends by herself, to save the doctor\'s fee.', run: () => { remember('arthur', 'He decided to wait and see whether Joan mends, to save the fee.', ['joan'], 2); return 'Arthur decided to wait and see about the doctor.'; } });
      if (t <= 8 * 60 && a.readDay !== d) o.push({ text: w === 'sun' ? 'Read the Sunday paper (2d.).' : 'Read the Daily Herald over breakfast (1d.).', run: () => readPaper('arthur', w === 'sun' ? 'the Sunday paper' : 'the Daily Herald', w === 'sun' ? 2 : 1) });
      if (t >= 15 * 60 && w !== 'sun') o.push({ text: 'Work in the garden at his seedlings.', run: () => 'Arthur worked in the garden.' });
    }
    if (here === 'church') {
      for (const c of [3, 6, 12]) if (c <= a.money) o.push({ text: `Put ${money(c)} in the collection.`, run: () => { a.money -= c; return `Arthur put ${money(c)} in the collection.`; } });
    }
    if (here === 'park') o.push({ text: 'Walk with Joan and point out the birds and the flowers.', run: () => 'Arthur walked with Joan in the park.' });
    if (here === 'heath') {
      if (a.money >= 2) o.push({ text: 'Treat Joan to a ride on the roundabouts (2d.).', run: () => { a.money -= 2; remember('arthur', 'He treated Joan to a ride on the roundabouts at the Bank Holiday fair.', ['joan'], 2); return 'Arthur treated Joan to a ride on the roundabouts.'; } });
      o.push({ text: 'Walk on the Heath with Edith and Joan and admire the view of London.', run: () => 'Arthur walked on the Heath with his family.' });
    }
    if (here === 'arthur_home' && NPC.granny && !a.done.granny) o.push({ text: "Give Edith an extra five shillings for her mother's visit.", run: () => { a.done.granny = true; a.money -= 60; note('arthur', 'account-book', "extra to Edith for her mother's visit, 5s."); remember('arthur', "He gave Edith an extra five shillings for her mother's visit.", ['edith', 'money'], 3); return "Arthur gave Edith an extra 5s. for her mother's visit."; } });
    if (here === 'arthur_home' && W.birthday && !a.done.present) for (const [txt, c] of [['a doll with a china face', 30], ['a story-book', 12], ['a penny bun and a kiss', 1]]) if (c <= a.money) o.push({ text: `Give Joan ${txt} for her birthday (${money(c)}).`, run: () => { a.done.present = txt; a.money -= c; note('arthur', 'account-book', `Joan's birthday present: ${txt}, ${money(c)}`); remember('arthur', `He gave Joan ${txt} for her eighth birthday.`, ['joan', 'money'], 3); fact('arthur', "What did you give Joan for her birthday?", ['A doll with a china face', 'A story-book', 'A penny bun and a kiss'], ['a doll with a china face', 'a story-book', 'a penny bun and a kiss'].indexOf(txt)); return `Arthur gave Joan ${txt} for her birthday.`; } });
  }
  if (k === 'thomas') {
    if (here === 'thomas_home') {
      if (t < 12 * 60 && a.readDay !== d) o.push({ text: w === 'sun' ? 'Read The Observer before church (2d.).' : 'Read The Times over breakfast (2d.).', run: () => readPaper('thomas', w === 'sun' ? 'The Observer' : 'The Times', 2) });
      if (t < 12 * 60) o.push({ text: 'Look over the office papers he brought home.', run: () => 'Mr. Thomas looked over the office papers.' });
      if (t >= 17 * 60) o.push({ text: 'Listen to the wireless by the fire.', run: () => { if (d === GOODFRI) { remember('thomas', "On Good Friday evening the B.B.C. announcer said, 'There is no news to-night,' and piano music was played instead.", ['news'], 3); fact('thomas', 'What did the wireless announcer say on Good Friday evening?', ['That there was no news', 'That the King was ill', 'That war had broken out'], 0, 'news'); return "Mr. Thomas listened to the wireless: 'There is no news to-night.' Piano music followed."; } return 'Mr. Thomas listened to a talk and the dance music on the wireless.'; } });
      if (t >= 17 * 60) o.push({ text: 'Read a chapter of Trollope by the fire.', run: () => 'Mr. Thomas read Trollope by the fire.' });
    }
    if (here === 'office') {
      if (d === 0 && !W.ledger.assigned && others.includes('arthur')) o.push({ text: 'Give Mr. Hale the quarterly ledger to balance.', run: () => { W.ledger.assigned = true; remember('arthur', 'Mr. Thomas set him to balance the quarterly ledger.', ['thomas', 'ledger'], 3); return 'Mr. Thomas set Arthur to the quarterly ledger.'; } });
      if (W.ledger.assigned && !W.ledger.verdict && (d >= 1)) o.push({ text: "Examine the quarterly ledger Mr. Hale has been working on.", run: () => verdict('ledger') });
      if (d === 10 && W.auditDue && !W.audit.verdict && t >= 12 * 60) o.push({ text: 'Go through the books with the auditors.', run: () => verdict('audit') });
      o.push({ text: 'Attend to the correspondence at his own desk.', run: () => 'Mr. Thomas attended to the correspondence.' });
    }
    if (here === 'teashop') o.push({ text: 'Take his usual chop and a glass of water.', run: () => { a.money -= 14; return 'Mr. Thomas lunched.'; } });
    if (here === 'church') o.push({ text: 'Put a shilling in the collection.', run: () => { a.money -= 12; return 'Mr. Thomas put a shilling in the collection.'; } });
    if (here === 'park') o.push({ text: 'Walk briskly round the Fields.', run: () => 'Mr. Thomas walked round the Fields.' });
  }
  // answering letters (stamp 1½d. and paper; reckoned as 2d.)
  const home = { ada: 'ada_home', arthur: 'arthur_home', thomas: 'thomas_home' }[k];
  if (here === home && t >= 17 * 60) for (const L0 of (a.letters || []).filter(x => !x.answered && W.day - x.day <= 10).slice(0, 1)) {
    o.push({ text: `Write a reply to ${L0.from.split(',')[0]} (stamp and paper, 2d.).`, run: () => { L0.answered = true; a.money -= 2; remember(k, `${a.short} wrote back to ${L0.from.split(',')[0]}.`, [], 2); note(k, 'letters', `answered ${L0.from.split(',')[0]}`); return `${a.short} wrote a reply to ${L0.from.split(',')[0]}.`; } });
  }
  // social options: concrete content
  for (const p of others) {
    if (k === 'ada' && p === 'arthur' && W.coin.finder === 'ada' && !a.done.toldCoin) o.push({ talk: { to: p, topic: 'the half-crown she found under his desk', resolve: 'coin', fact: () => { a.done.toldCoin = true; remember('arthur', `Mrs. Turner told him she had found his half-crown under his desk${['desk', 'arthur'].includes(W.coin.where) ? ' and laid it on his desk' : ''}.`, ['ada', 'coin'], 3); } }, text: "Tell Mr. Hale that she found a half-crown under his desk." });
    if (k === 'arthur' && p === 'ada' && W.coin.finder === 'ada' && A.arthur.mem.some(m => /Mrs\. Turner told him|laid on his desk/.test(m.text)) && !a.done.thanked) o.push({ talk: { to: p, topic: 'his thanks for her honesty about the half-crown', fact: () => { a.done.thanked = true; remember('ada', 'Mr. Hale thanked her for her honesty.', ['arthur', 'coin'], 3); } }, text: 'Thank Mrs. Turner for her honesty about the half-crown.' });
    if (!a.done['chat' + p + d]) { const topic = headline(k) && Math.random() < 0.6 ? headline(k) : HOL[d] ? `the holiday (${HOL[d].split(',')[0]})` : varied(k, p, (k === 'thomas' || p === 'thomas') && !isRest(d) ? ['the work in hand', 'the weather', 'the state of trade'] : ['the weather', 'how things are at home', 'the neighbourhood']); o.push({ talk: { to: p, topic, fact: () => { a.done['chat' + p + d] = true; } }, text: `Pass the time of day with ${nameOf(p)}${/^what the paper/.test(topic) ? ', about the news in the paper' : ''}.` }); }
  }
  for (const p of Object.keys(NPC)) if (NPC[p].place === here && !a.done['npc' + p + d + (t >= 17 * 60 ? 'e' : 'm')]) {
    const topic = p === 'edith' && W.joanIll ? "Joan's illness and whether to send for the doctor" : p === 'edith' && W.paid['arthur' + d] && !a.done['hk' + d] ? "the week's housekeeping money" : p === 'bert' && !W.bertWork ? 'how Bert is getting on with looking for work' : HOL[d] && Math.random() < 0.5 ? `the holiday (${HOL[d].split(',')[0]})` : headline(k) && Math.random() < 0.4 ? headline(k) : varied(k, p, NTOP[p] || ['how the day has gone']);
    o.push({ talk: { to: p, topic, fact: () => { a.done['npc' + p + d + (t >= 17 * 60 ? 'e' : 'm')] = true; } }, text: `Talk with ${NPC[p].name} about ${topic}.` });
  }
  if (!o.length) o.push({ text: 'Rest quietly for a while.', run: () => `${a.short} rested.` });
  return o.slice(0, 12);
}
function payRent(pay) {
  const a = A.ada; W.rentPaid[W.day] = true; W.rentDue = false;
  W.rentOwing = !pay; W.rentOwingCount = pay ? 0 : (W.rentOwingCount || 0) + 1;
  setState('rent', ['ada'], pay ? 'The rent is paid up' : 'The rent is owing; the landlord is waiting');
  if (pay) { a.money -= 84; note('ada', 'rent-book', 'rent paid in full, 7s.'); remember('ada', 'She paid the landlord the rent of seven shillings.', ['rent', 'money'], 3); fact('ada', `Did you pay the rent on ${LONGDATE(W.day)}?`, ['Yes, in full', 'No, I asked the landlord to wait'], 0); return 'Ada paid the rent of 7s.'; }
  note('ada', 'rent-book', 'rent not paid; the landlord to wait'); remember('ada', 'She asked the landlord to wait for the rent; he grumbled and gave her till Monday.', ['rent'], 3); fact('ada', `Did you pay the rent on ${LONGDATE(W.day)}?`, ['Yes, in full', 'No, I asked the landlord to wait'], 1); return 'Ada asked the landlord to wait for the rent.';
}
function verdict(which) {
  const B = which === 'audit' ? W.audit : W.ledger;
  const need = which === 'audit' ? 3 : 3;
  const v = B.steps >= need && B.errors === 0 ? 'in perfect order' : B.steps >= need ? `complete, but with ${B.errors} mistake${B.errors > 1 ? 's' : ''}` : `not finished (${B.steps} of ${need} totals done)`;
  B.verdict = v;
  const what = which === 'audit' ? 'the books for the audit' : 'the quarterly ledger';
  note('thomas', 'office diary', `examined ${what} kept by Mr. Hale: ${v}`); note('arthur', 'office diary', `Mr. Thomas examined ${what}: ${v}`);
  remember('thomas', `He examined ${what} kept by Mr. Hale and found them ${v}.`, ['arthur', which], 3);
  remember('arthur', `Mr. Thomas examined ${what} and found them ${v}.`, ['thomas', which], 3);
  fact('arthur', `In what state did Mr. Thomas find ${what}?`, ['In perfect order', 'Complete but with mistakes', 'Not finished'], /perfect/.test(v) ? 0 : /complete/.test(v) ? 1 : 2);
  if (!/perfect/.test(v)) W.pendingLesson = ['arthur', `Mr. Thomas found ${what} ${v}.`];
  return `Mr. Thomas examined ${what}: ${v}.`;
}
function presentAt(k) { return Object.keys(A).filter(o => o !== k && A[o].place && A[o].place === A[k].place); }
function core(k) {
  const f = [];
  if (k === 'arthur' && W.day === 0) f.push(W.coin.where === 'arthur' ? 'He has his half-crown back.' : 'His half-crown, lost on Thursday, is still missing.');
  if (k === 'ada' && W.coin.where === 'ada') f.push("She has in her hand the half-crown she found under Mr. Hale's desk.");
  if (k === 'ada' && !W.bertWork) f.push('Bert is out of work, so she must find his half of the rent herself.');
  if (k === 'ada' && W.rentDue && !W.rentPaid[W.day]) f.push('The rent of seven shillings is due tonight.');
  if (k === 'ada' && W.loan) f.push(W.loan);
  if (k === 'arthur' && W.loan) f.push(W.loan.replace('She owes Mr. Hale', 'Mrs. Turner owes him'));
  if (k === 'arthur' && W.joanIll) f.push('Joan is ill in bed' + (W.doctor === 'not called' ? ', and the doctor has not been called.' : '.'));
  if (k === 'arthur' && W.auditDue && !W.audit.verdict) f.push('The auditors come on Monday; the books must be ready.');
  if (k === 'thomas' && W.auditDue && !W.audit.verdict) f.push('The auditors come on Monday.');
  if (k === 'thomas' && DOW(W.day) === 'fri' && !W.paid['ada' + W.day]) f.push("It is Friday: Mrs. Turner's wages of twelve shillings are due, and she depends on them for her rent.");
  if (k === 'thomas' && W.audit.verdict) f.push(`The auditors found Mr. Hale's books ${W.audit.verdict}.`);
  for (const x of A[k].mem.filter(x => /resolves|promised/.test(x.text)).slice(-2)) f.push(x.text);
  return f.join(' ');
}
const SHEET = {   // compact persona for prompts (the long sheet stays for diaries and reflection)
  ada: "Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor.",
  arthur: "Mr. Arthur Hale, 34, ledger clerk at an insurance office in Moorgate, £3 10s. a week; wife Edith, daughter Joan (7). Conscientious, careful with money, timid with superiors.",
  thomas: "Mr. Walter Thomas, 56, chief clerk of the same office; pays the wages on Fridays. Stern, exact, dutiful, fair and secretly kind. Widower in Highbury."
};
function perceive(k, query = '') {
  const a = A[k], others = presentAt(k), npcs = Object.keys(NPC).filter(n => NPC[n].place === a.place);
  const pres = [...others.map(o => `${nameOf(o)} (${a.short} ${opinionWords(k, o)} ${himher(o)})`), ...npcs.map(n => NPC[n].name)];
  const bel = beliefs(k, [...others, ...npcs]).slice(0, 220);
  return [
    `${clock(W.t)[0].toUpperCase() + clock(W.t).slice(1)}, ${DAYS[W.day]}; ${WEATHER[W.day]}.`,
    `CHARACTER: ${SHEET[k]}`,
    `PLACE: ${PLACE[a.place]}. PRESENT: ${pres.length ? pres.join('; ') : 'nobody else'}. PURSE: ${money(a.money)}.`,
    core(k) ? `KNOWN: ${core(k).slice(0, 280)}` : '',
    (() => { const st = off('states') ? '' : states(k, query); return st ? `NOW: ${st}` : ''; })(),
    query && !off('values') ? `VALUES: ${values(k, query)}` : '',
    `REMEMBERS: ${recall(k, [...others, ...npcs], query, 440) || 'nothing of note.'}`,
    (() => { const b = query && !off('books') ? lookup(k, query, qdayOf(query), 1) : ''; return b ? 'BOOKS: ' + b.slice(0, 200) : ''; })(),
    bel ? `OPINIONS: ${bel}` : ''
  ].filter(Boolean).join('\n');
}
// game-master resolution of conversations about open questions (majority of three)
async function resolveTalk(kind, lines, k, p) {
  const T = lines.join('\n');
  const R = {
    coin: { q: 'What was settled about the half-crown?', opts: ['Mrs. Turner is to keep it', 'Mr. Hale takes it back', 'nothing was settled'], apply: i => {
      if (i === 0 && W.coin.where !== 'kept') { if (W.coin.where === 'arthur') A.arthur.money -= 30; W.coin.where = 'kept'; A.ada.money += 30; remember('ada', 'Mr. Hale told her to keep the half-crown, as a reward for her honesty.', ['arthur', 'coin'], 3); remember('arthur', 'He told Mrs. Turner to keep the half-crown, as a reward for her honesty.', ['ada', 'coin'], 3); return 'Ada keeps the half-crown as a reward.'; }
      if (i === 1 && !['arthur'].includes(W.coin.where)) { W.coin.where = 'arthur'; A.arthur.money += 30; remember('arthur', 'He took his half-crown back.', ['ada', 'coin'], 3); return 'Arthur takes the half-crown back.'; } return null; } },
    extra: { q: 'What did Mr. Thomas decide about extra work for Mrs. Turner?', opts: ['He gave her extra cleaning for three shillings a week more', 'He said there was none to be had', 'nothing was decided'], apply: i => {
      if (i === 0) { W.extraHours = true; setState('extra', ['ada', 'thomas'], 'Ada does extra cleaning on Saturdays for 3s. a week'); A.ada.money += 36; remember('ada', 'Mr. Thomas gave her extra cleaning on Saturdays, for three shillings a week more, paid in advance this week.', ['thomas', 'money'], 3); remember('thomas', 'He gave Mrs. Turner extra cleaning for 3s. a week.', ['ada'], 3); fact('ada', 'What did Mr. Thomas say when you asked for extra work?', ['He gave me extra cleaning', 'He said there was none', 'I never asked'], 0); return 'Ada gets extra cleaning, 3s. a week.'; }
      if (i === 1) { W.extraHours = false; remember('ada', 'Mr. Thomas told her there was no extra work to be had.', ['thomas'], 3); fact('ada', 'What did Mr. Thomas say when you asked for extra work?', ['He gave me extra cleaning', 'He said there was none', 'I never asked'], 1); return 'No extra work for Ada.'; } return null; } },
    loan: { q: 'What did Mr. Hale decide about lending Mrs. Turner money?', opts: ['He lent her five shillings', 'He refused', 'nothing was decided'], apply: i => {
      if (i === 0 && A.arthur.money >= 60) { W.loan = 'She owes Mr. Hale five shillings, lent for the rent.'; setState('loan', ['ada', 'arthur'], 'Mrs. Turner owes Mr. Hale five shillings'); note('arthur', 'account-book', 'lent Mrs. Turner 5s. for her rent'); note('ada', 'purse-book', 'borrowed 5s. from Mr. Hale for the rent'); A.arthur.money -= 60; A.ada.money += 60; remember('ada', 'Mr. Hale lent her five shillings for the rent.', ['arthur', 'loan'], 3); remember('arthur', 'He lent Mrs. Turner five shillings for her rent.', ['ada', 'loan'], 3); fact('ada', 'Who lent you money for the rent?', ['Mr. Hale', 'Mr. Thomas', 'Nobody'], 0); fact('arthur', 'Did you lend anybody money this fortnight?', ['Yes, Mrs. Turner, five shillings', 'Yes, Mr. Thomas', 'No'], 0); return 'Arthur lends Ada 5s.'; }
      if (i === 1) { W.loan = false; remember('ada', 'Mr. Hale would not lend her money.', ['arthur'], 3); return 'Arthur refuses the loan.'; } return null; } },
    leave: { q: 'What did Mr. Thomas decide about Mr. Hale leaving early?', opts: ['He let him go home early to his child', 'He told him to stay at his work', 'nothing was decided'], apply: i => {
      A.arthur.done.leave = true;
      if (i === 0) { remember('arthur', 'Mr. Thomas let him go home early to Joan.', ['thomas', 'joan'], 3); remember('thomas', 'He let Mr. Hale go home early to his sick child.', ['arthur'], 3); A.arthur.place = 'arthur_home'; A.arthur.leftEarly = W.day; return 'Arthur may go home early.'; }
      if (i === 1) { remember('arthur', 'Mr. Thomas told him to stay at his work.', ['thomas'], 3); return 'Arthur must stay.'; } return null; } }
  }[kind];
  const c = await choose(`This conversation has just taken place:\n${T}\n\n${R.q}\n${R.opts.map((o, i) => `(${L[i]}) ${o}`).join('\n')}\n\nAnswer in the form: It was settled that ...`, R.opts, 3);
  const r = c.i === null ? null : R.apply(c.i);
  say(`      ⚖ ${r || 'Nothing settled.'}`);
  STATS.resolutions = (STATS.resolutions || 0) + 1;
}

// ======================= agents: talk, learn, act =======================
const SAID = {};
async function converse(k, talk) {
  const p = talk.to; STATS.convs++;
  const lines = [];
  const intro = sp => `${A[sp] ? perceive(sp, talk.topic) : `${clock(W.t)}, ${DAYS[W.day]}.\nCHARACTER: ${NPC[sp].sheet}`}\n\n`;
  const sim = (x, y) => { const A1 = new Set(words(x)), B1 = new Set(words(y)); const inter = [...A1].filter(w => B1.has(w)).length; return inter / Math.max(1, Math.min(A1.size, B1.size)); };
  const turns = talk.resolve || /half-crown|thanks|rent|doctor|ill|work for|lend|back the|retire|succe/.test(talk.topic) ? 4 : 2;
  for (let turn = 0; turn < turns; turn++) {
    const sp = turn % 2 === 0 ? k : p, other = sp === k ? p : k, He = heshe(sp)[0].toUpperCase() + heshe(sp).slice(1);
    // egocentric projection (after SPASM's Egocentric Context Projection): the shared history is kept neutral
    // and rewritten from the speaker's own point of view, so a speaker never reads its partner's lines as its own
    const recent = lines.slice(-2).map(l => { const who = l.split(':')[0]; const said = l.slice(who.length + 2); return who === nameOf(sp).toUpperCase() ? `${nameOf(sp)} had said: ${said}` : `${nameOf(other)} said to ${nameOf(sp)}: ${said}`; }).join('\n');
    const msg = turn === 0
      ? `${intro(sp)}${nameOf(sp)} now speaks to ${nameOf(other)} about ${talk.topic}. What does ${heshe(sp)} say? Answer in the form: ${He} says, "..."`
      : `${intro(sp)}CONVERSATION about ${talk.topic}:\n${recent}\n\nWhat does ${nameOf(sp)} answer, in ${hisher(sp)} own words? Answer in the form: ${He} answers, "..."`;
    let r = cleanSpeech(await ask(msg)); STATS.lines++;
    if (r && (lines.some(l => sim(l, r) > 0.6) || (SAID[sp] || []).some(l => sim(l, r) > 0.7))) { STATS.echo = (STATS.echo || 0) + 1; r = cleanSpeech(await ask(msg + `\n\n(Do not repeat what has been said already; say something new.)`)); if (r && lines.some(l => sim(l, r) > 0.6)) { STATS.echoLeft = (STATS.echoLeft || 0) + 1; r = ''; } }
    if (r && /^(?:that|whether|how)\b/i.test(r)) { STATS.reported = (STATS.reported || 0) + 1; r = cleanSpeech(await ask(msg + `\n\n(Give the very words spoken, inside quotation marks.)`)); if (r && /^(?:that|whether|how)\b/i.test(r)) r = ''; }
    if (r) (SAID[sp] = SAID[sp] || []).push(r), SAID[sp] = SAID[sp].slice(-8);
    if (!r) { STATS.emptyLines++; break; }
    lines.push(`${nameOf(sp).toUpperCase()}: "${r}"`); say(`      ${nameOf(sp)}: "${r}"`);
  }
  if (talk.fact) talk.fact();
  if (talk.resolve && lines.length) await resolveTalk(talk.resolve, lines, k, p);
  const gist = '';
  // opinions: closed question, no way out
  for (const [x, y] of [[k, p], [p, k]]) {
    if (!A[x] || !lines.length) continue;
    const c = await choose(`${A[x].sheet}\n\nThis conversation has just taken place:\n${lines.join('\n')}\n\nAfter it, does ${A[x].name} think better or worse of ${nameOf(y)} than before?\n(A) better\n(B) worse\n\nAnswer with the letter only.`, ['better', 'worse']);
    if (c.i !== null) { A[x].op[y] = Math.max(-2, Math.min(2, (A[x].op[y] || 0) + (c.i === 0 ? 1 : -1))); say(`      → ${A[x].short} now ${opinionWords(x, y)} ${nameOf(y)}.`); }
  }
  // commitments (coherence between talk and later action)
  for (const x of (talk.resolve || /half-crown|rent|lend|work for/.test(talk.topic)) ? [k, p] : []) {
    if (!A[x] || !lines.length) continue;
    const c = sentences(await ask(`This conversation has just taken place:\n${lines.join('\n')}\n\nDid ${nameOf(x)} promise or agree to do anything? Answer in one short sentence beginning "${A[x].short} promised" or "${A[x].short} promised nothing".`), 1);
    if (c && !/promised nothing|nothing\.?$/i.test(c) && /promis|agree/i.test(c)) { remember(x, c, [x === k ? p : k], 3); say(`      ✎ ${c}`); }
  }
  remember(k, `${A[k].short} spoke with ${nameOf(p)} about ${talk.topic}.`, [p]);
  if (A[p]) remember(p, `${A[p].short} spoke with ${nameOf(k)} about ${talk.topic}.`, [k]);
  return `${A[k].short} spoke with ${nameOf(p)} about ${talk.topic}.`;
}
async function monthReview(k) {   // a line per person and month that is never forgotten; written by the engine,
  // because talkie mixed up who did what when asked to sum up (test: 'she lost her work' for Bert)
  const m = dateOf(W.day).getUTCMonth(), mon = MONTHS[m];
  const facts = A[k].mem.filter(x => x.day !== 'past' && !x.belief && !x.month && x.imp >= 3 && dateOf(x.day).getUTCMonth() === m && !/^\(Seen\)|resolves|spoke with|entered the correct|thinks (him|her)|read in|collection|wrote back/.test(x.text));
  if (!facts.length) return;
  const seen = new Set(), parts = [];
  for (const x of facts) { const t = x.text.split(/[;:]| and \w+ must| to redeem/)[0].replace(/\.$/, '').replace(/^(She|He) /, ''); const key = t.slice(0, 40); if (seen.has(key)) continue; seen.add(key); parts.push(`${t.length > 85 ? t.slice(0, 82).replace(/\s+\S*$/, '') + '…' : t} (${ORD(dateOf(x.day).getUTCDate())})`); }
  let text = `In ${mon}: ${parts.slice(-5).join('; ')}.`; if (text.length > 330) text = text.slice(0, 327).replace(/;[^;]*$/, '') + '.';
  A[k].mem.push({ day: W.day, t: W.t, text, about: [], imp: 3, month: mon });
  say(`   ▣ ${A[k].short}'s ${mon}: ${text}`); STATS.months = (STATS.months || 0) + 1;
}
async function lesson(k, setback) {
  const r = sentences(await ask(`${A[k].sheet}\n\nWhat has just happened: ${setback}\n\nWhat lesson does ${A[k].name} draw from this for the future? One sentence, in the third person, beginning "${A[k].short} resolves".`), 1);
  if (r && /resolves/i.test(r)) { remember(k, r, [], 3); say(`      ✦ ${r}`); STATS.lessons = (STATS.lessons || 0) + 1; }
}
// end-of-day reflection: what each agent now believes about each person met (stored as belief)
async function reflect(k) {
  const people = [...new Set(A[k].mem.filter(m => W.day - m.day < 7 && m.imp >= 2).flatMap(m => m.about))].filter(x => A[x] || NPC[x]).slice(0, 3);
  for (const y of people) {
    const facts = A[k].mem.filter(m => m.about.includes(y) && !m.belief).slice(-5).map(m => m.text).join(' ');
    const r = sentences(await ask(`${SHEET[k]}\n\nWhat ${A[k].name} knows of ${nameOf(y)}: ${facts.slice(0, 700)}\n\nWhat does ${A[k].name} now think of ${nameOf(y)}? Answer in the form: ${A[k].f ? 'She' : 'He'} thinks ${himher(y)} ..., because ...`), 1);
    if (r) { A[k].mem.push({ day: W.day, t: W.t, text: r, about: [y], imp: 3, belief: y }); say(`   ◇ ${A[k].short} reflects: ${r}`); }
  }
}
// formative memories (Concordia style): one past memory per agent that shapes conduct
async function formative(k) {
  const r = sentences(await ask(`${A[k].sheet}\n\nRecall one memory from ${A[k].name}'s past which still shapes how ${heshe(k)} behaves at work and with money. One sentence, in the third person.`), 1);
  if (r) { A[k].mem.push({ day: 'past', t: 0, text: r, about: [], imp: 2 }); say(`   ◆ ${A[k].short}'s past: ${r}`); }
}
async function greet(k, p) {   // social custom of the time: first meeting of the day is greeted
  A[k].metToday.add(p); A[p].metToday.add(k);
  const r = cleanSpeech(await ask(`${perceive(k)}\n\n${nameOf(p)} has just come in. What does ${nameOf(k)} say to greet ${himher(p)}?`));
  const r2 = r ? cleanSpeech(await ask(`${perceive(p)}\n\n${nameOf(k)} greets ${himher(p)}: "${r}"\nWhat does ${nameOf(p)} answer?`)) : '';
  if (r) say(`      ${nameOf(k)}: "${r}"`); if (r2) say(`      ${nameOf(p)}: "${r2}"`);
  STATS.lines += 2; if (!r) STATS.emptyLines++; if (!r2) STATS.emptyLines++;
}
async function act(k) {
  const a = A[k];
  for (const p of presentAt(k)) if (!a.metToday.has(p)) await greet(k, p);
  const opts = optionsFor(k);
  const key = opts.some(o => /Keep the half-crown|^Give Edith|^Buy |Pay the landlord|Pawn|Send for the doctor|Recommend Mr\. Hale/.test(o.text));
  // reasoning: deliberate with the options in view, then choose, in one chat; options shuffled each time
  const tally = new Array(opts.length).fill(0), raws = []; let thought = '';
  for (let v = 0; v < (key ? 3 : 1); v++) {
    const order = opts.map((_, i) => i).sort(() => Math.random() - 0.5);
    const list = order.map((oi, j) => `(${L[j]}) ${opts[oi].text}`).join('\n');
    const query = opts.map(o => o.text).join(' ');
    const He = heshe(k)[0].toUpperCase() + heshe(k).slice(1);
    let ans = await ask(`${perceive(k, query)}\n\n${a.short} may now:\n${list}\n\nWhich ONE does ${a.short} do next, as ${heshe(k)} truly would? Answer in the form: ${He} chooses to ..., because ...`);
    if (pick(ans, order.map(oi => opts[oi].text)) === null) { STATS.reasks = (STATS.reasks || 0) + 1; ans = await ask(`${a.short} may:\n${list}\n\nWhich ONE does ${a.short} do? Answer in the form: ${He} chooses to ..., because ...`); }
    const th = (ans || '').replace(/^.*?\bbecause\b\s*/i, `${He} acts so because `);
    if (!thought) thought = sentences(th, 1);
    if (!thought) STATS.emptyThought = (STATS.emptyThought || 0) + 1;
    raws.push(ans);
    const j = pick(ans, order.map(oi => opts[oi].text));
    if (j !== null) tally[order[j]]++;
  }
  STATS.choices++; if (key) STATS.votes++;
  const best = Math.max(...tally);
  const c = { i: best ? tally.indexOf(best) : null, raw: raws, tally };
  if (c.i === null) STATS.unreadable++;
  const o = c.i === null ? { text: 'Wait (choice unreadable).', run: () => `${a.short} waited.` } : opts[c.i];
  say(`   ${a.short} thinks: ${thought}`);
  say(`   ${a.short} [${c.raw.map(r => (r || '—').slice(0, 25).replace(/\n/g, ' ')).join(' | ')}${c.i === null ? ' → unreadable, waits' : ''}${key ? ' votes ' + JSON.stringify(tally) : ''}] → ${o.text}`);
  let result;
  const before = a.mem.length;
  if (o.talk) result = await converse(k, o.talk);
  else if (o.book) result = await bookWork(o.book);
  else result = o.run();
  say(`   ⇒ ${result}`);
  if (!o.talk && !/waited/.test(result)) { if (a.mem.length === before) remember(k, result, presentAt(k)); for (const p of presentAt(k)) remember(p, `(Seen) ${result}`, [k], 1); }
  TRACE.push({ day: W.day, time: clock(W.t), agent: k, thought, options: opts.map(x => x.text), raw: c.raw, tally: c.tally, choice: o.text, result });
}

// ======================= diaries, probes, metrics =======================
const METRICS = { probes: [], diaries: [], days: [] };
async function diary(k) {
  const facts = A[k].mem.filter(m => m.day !== 'past' && W.day - m.day < (DOW(W.day) === 'sun' ? 7 : 1) && !m.belief && m.imp >= (DOW(W.day) === 'sun' ? 3 : 2) && !/^\(Seen\)/.test(m.text)).map(m => m.text).slice(-6);
  if (!facts.length) return;
  const d = await ask(`${SHEET[k]}\n\nThe facts of ${A[k].name}'s ${DOW(W.day) === 'sun' ? 'week, up to' : 'day,'} ${DAYS[W.day]}:\n${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nWrite ${A[k].name}'s diary entry, keeping to these facts and adding ${hisher(k)} feelings about them. Answer in the form: ${DAYNAME(W.day)}. To-day I ...`);
  const key = f => (f.match(/half-crown|ledger|audit|wages|rent|doctor|Joan|Bert|loan|lent|pawn|rise|extra|housekeeping|Finsbury|market|chapel|church/i) || [null])[0];
  const keyed = facts.filter(key), kept = keyed.filter(f => new RegExp(key(f), 'i').test(d || ''));
  METRICS.diaries.push({ day: W.day, who: k, facts: keyed.length, kept: kept.length });
  say(`\n--- ${A[k].name}'s diary, ${DAYS[W.day]} (${kept.length}/${keyed.length} key facts kept) ---\n${d}`);
}
function pickProbe(ans, opts) {
  if (!ans) return null;
  const norm = t => t.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = norm(ans).replace(/^(she|he|mrs \w+|mr \w+|i)? ?(answers|answered|answer|replies|replied|says|said)? ?/, '');
  const core = o => norm(o).replace(/^(i|my|a|the) /, '');
  const hit = opts.map((o, i) => a.includes(core(o)) ? i : -1).filter(i => i >= 0);
  if (hit.length === 1) return hit[0];
  const neg = /\b(no|not|never|nothing|nobody|didn t|did not|could not|couldn t)\b/.test(a);
  const yi = opts.findIndex(o => /^yes\b/i.test(o)), ni = opts.findIndex(o => /^no\b/i.test(o));
  if (yi >= 0 && ni >= 0) { if (/^(yes)\b/.test(a)) return yi; if (/^no\b/.test(a)) return ni; if (neg) return ni; if (/\b(paid|did|was|have|had)\b/.test(a)) return yi; }
  const p = pick(ans, opts); if (p !== null) return p;
  const nothing = opts.findIndex(o => /^(nothing|nobody|no one|none|no)\b/i.test(o));
  if (nothing >= 0 && neg) return nothing;
  return null;
}
let probeN = 0;
async function probe(f, final = false) {   // open question first (no options to prime a wrong answer); options only as a fallback
  const aided = final || off('books') ? false : (probeN++ % 2 === 1);
  const He = A[f.who].f ? 'She' : 'He';
  const book = aided ? lookup(f.who, f.q + ' ' + f.opts.join(' '), qdayOf(f.q), 1) : '';
  const tally = new Array(f.opts.length).fill(0); const raws = []; let readable = 0;
  const ctx = perceive(f.who, f.q + ' ' + f.opts.join(' ')).split('\n').filter(l => !/^BOOKS:/.test(l)).join('\n') + (book ? '\n' + book : '');
  for (let v = 0; v < 5 && readable < 3; v++) {
    const open = !off('openprobe') && v < 3;
    const order = f.opts.map((_, i) => i).sort(() => Math.random() - 0.5);
    const pr = `${ctx}\n\nQUESTION to ${A[f.who].name}: ${f.q}\n\n` + (open ? `Answer in the form: ${He} answers, "..."` : `Answer in one of these forms: ${order.map(i => `${He} answers, "${f.opts[i][0].toUpperCase() + f.opts[i].slice(1)}."`).join(' or: ')}`);
    if ((globalThis.PROBE_SHOWN = (globalThis.PROBE_SHOWN || 0) + 1) <= 3) try { fs.appendFileSync(path.join(OUT, 'probe_prompt.txt'), pr + '\n=====\n'); } catch (e) {}
    const a = await ask(pr);
    raws.push((open ? 'O: ' : 'C: ') + (a || ''));
    const j = pickProbe(a, open ? f.opts : order.map(i => f.opts[i]));
    if (j !== null) { tally[open ? j : order[j]]++; readable++; }
    if (Math.max(...tally) >= 2) break;
  }
  const mx = Math.max(...tally); const ans = mx && tally.filter(x => x === mx).length === 1 ? tally.indexOf(mx) : null;   // a tie is no answer
  const ok = ans === f.truth, age = W.day - f.day;
  METRICS.probes.push({ day: W.day, age, who: f.who, q: f.q, kind: f.kind || 'life', aided: !!book, final, ok, answer: ans === null ? null : f.opts[ans], truth: f.opts[f.truth], tally, raws: raws.map(r => r.slice(0, 120)) });
  say(`   [memory${book ? ', with ' + book.match(/in (?:his|her) ([\w -]+):/)[1] : ''}, ${age} day${age === 1 ? '' : 's'} old] ${A[f.who].short}: ${f.q} → ${ans === null ? '?' : f.opts[ans]} ${ok ? '✓' : `✗ (truth: ${f.opts[f.truth]})`} ${JSON.stringify(tally)}`);
}
async function morningProbes() {   // two facts each morning, rotating so every fact is asked at different ages
  const old = W.facts.filter(f => W.day - f.day >= 1 && A[f.who]);
  if (!old.length) return;
  for (const f of old) f.asked = f.asked || 0;
  const pickd = [...old].sort((a, b) => a.asked - b.asked || (W.day - b.day) - (W.day - a.day)).slice(0, 1);
  for (const f of pickd) { f.asked++; await probe(f); }
}

async function duty(k, situation, yesText, noText, yesWord) {
  const He = A[k].f ? 'She' : 'He';
  const prompt = `${perceive(k, situation)}\n\n${situation}\n\nAnswer in the form: ${He} ${yesText}, because ... or: ${He} ${noText}, because ...`;
  let yes = 0, no = 0, why = '';
  for (let v = 0; v < 3; v++) {
    const a = (await ask(prompt)) || '';
    const isNo = new RegExp(`\\b(does not|do not|doesn't|will not|won't|not ${yesWord}|refuses|declines)\\b`, 'i').test(a.split(/because/i)[0]);
    const isYes = !isNo && new RegExp(`\\b${yesWord}`, 'i').test(a.split(/because/i)[0]);
    if (isYes) yes++; else if (isNo) no++;
    if (!why && a) why = a;
  }
  STATS.duties = (STATS.duties || 0) + 1;
  say(`   ⚑ ${A[k].short}: ${situation.split('?')[0]}? → ${yes > no ? 'YES' : 'NO'} (${yes}:${no}) ${sentences(why, 1)}`);
  return { yes: yes > no, why };
}
async function interrupts(d, t) {
  const w = DOW(d);
  // Friday wages for the charwoman, paid by the chief clerk (or by Mr. Hale while Mr. Thomas is ill)
  if (w === 'fri' && t === 8 * 60 + 30 && A.ada.place === 'office' && !W.paid['ada' + d]) {
    const payer = A.thomas.place === 'office' ? 'thomas' : A.arthur.place === 'office' ? 'arthur' : null;
    if (payer) {
      const r = await duty(payer, `It is Friday, pay-day. Mrs. Turner, the charwoman, is here; her week's wages of twelve shillings are due, and she needs them for her rent.${payer === 'arthur' ? ' Mr. Thomas is away ill, and has left the wages in Mr. Hale\'s charge.' : ''} Does ${A[payer].name} pay Mrs. Turner her wages now?`, 'pays her now', 'does not pay her now', 'pay');
      if (r.yes) { W.paid['ada' + d] = true; A.ada.money += 144; note(payer, 'wages-book', "Mrs. Turner, charwoman, paid 12s."); remember('ada', `${A[payer].name} paid her the week's wages, twelve shillings.`, [payer, 'money'], 2); remember(payer, "He paid Mrs. Turner her week's wages.", ['ada'], 2); }
      else { remember('ada', `${A[payer].name} did not pay her wages this Friday.`, [payer, 'money'], 3); fact('ada', `Were you paid your wages at the insurance office on Friday the ${ORD(dateOf(d).getUTCDate())}?`, ['Yes', 'No'], 1); }
    }
  }
  // the rise after the audit
  if (d === 11 && t === 8 * 60 + 30 && W.audit.verdict && W.audit.raise === null && A.thomas.place === 'office') {
    const r = await duty('thomas', `The auditors have found Mr. Hale's books ${W.audit.verdict}. Mr. Hale has served the company faithfully for ten years at £3 10s. a week. Does Mr. Thomas recommend him to the directors for a rise of five shillings a week?`, 'recommends him', 'does not recommend him', 'recommend');
    W.audit.raise = r.yes; note('thomas', 'office diary', r.yes ? 'recommended Mr. Hale for a rise of 5s. a week' : 'did not recommend Mr. Hale for a rise');
    if (r.yes) { remember('arthur', 'Mr. Thomas told him he would recommend him for a rise of five shillings a week, from February.', ['thomas', 'money'], 3); remember('thomas', 'He recommended Mr. Hale for a rise.', ['arthur'], 3); fact('arthur', 'What did Mr. Thomas tell you after the audit?', ['He would recommend me for a rise', 'He would dismiss me', 'Nothing'], 0); }
    else fact('arthur', 'What did Mr. Thomas tell you after the audit?', ['He would recommend me for a rise', 'He would dismiss me', 'Nothing'], 2);
  }
  // the successor as chief clerk
  if (d === 84 && t === 8 * 60 + 30 && W.retire && W.successor === undefined && A.thomas.place === 'office') {
    const r = await duty('thomas', `Mr. Thomas must now recommend his successor as chief clerk: either Mr. Hale, who has served ten years (his audit books were ${W.audit.verdict || 'not examined'}; Mr. Thomas ${opinionWords('thomas', 'arthur')} him), or Mr. Pike, an experienced clerk from the Leeds branch whom he hardly knows. Does Mr. Thomas recommend Mr. Hale?`, 'recommends Mr. Hale', 'recommends Mr. Pike instead', 'recommends Mr\\.? Hale');
    W.successor = r.yes ? 'arthur' : 'pike'; setState('successor', ['arthur', 'ada', 'thomas'], r.yes ? 'Mr. Hale is recommended as the next chief clerk' : 'Mr. Pike of Leeds is recommended as the next chief clerk');
    for (const k of ['arthur', 'thomas', 'ada']) remember(k, r.yes ? 'Mr. Thomas has recommended Mr. Hale to succeed him as chief clerk.' : 'Mr. Thomas has recommended Mr. Pike of the Leeds branch to succeed him as chief clerk.', ['thomas', 'arthur'], 3);
    fact('arthur', 'Whom did Mr. Thomas recommend as the next chief clerk?', ['Me', 'Mr. Pike of the Leeds branch', 'Nobody yet'], r.yes ? 0 : 1);
  }
}

async function ensureBrowser() {
  if (FAKE || LOCAL) return;   // a long run must survive a crashed browser
  if (FAKE || (browser && browser.isConnected())) return;
  STATS.relaunch = (STATS.relaunch || 0) + 1; POOL.length = 0;
  const { chromium } = require('playwright'); const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  browser = await chromium.launch({ proxy }); say('   (browser relaunched)');
}

// ======================= main =======================
(async () => {
  if (!FAKE && !LOCAL) { const { chromium } = require('playwright'); const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined; browser = await chromium.launch({ proxy }); }
  const N = Math.min(+(process.env.DAYS || ND), ND);
  for (let d = 0; d < N; d++) {
    W.day = d; W.t = 0; for (const k in A) A[k].metToday = new Set();
    say(`\n######## ${DAYS[d]}${HOL[d] ? ' — ' + HOL[d] : ''} (${WEATHER[d]}) ########`);
    const asks0 = STATS.asks;
    if (d === 0) for (const k in A) await formative(k);
    await ensureBrowser();
    morningEvents();
    W.t = 7 * 60; try { await morningProbes(); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; await ensureBrowser(); }
    for (const t of ticks(d)) {
      W.t = t; say(`\n=== ${clock(t)} ===`);
      for (const k in A) { let p = placeFor(k, d, t); if (k === 'arthur' && A.arthur.leftEarly === d && t > 12 * 60 + 30) p = 'arthur_home'; A[k].place = p; }
      if (d === 10 && t === 17 * 60 && W.auditDue && !W.audit.verdict) say(`   (The auditors examine the books.) ${verdict('audit')}`);
      if (d === 0 && t === 8 * 60 + 30 && !W.ledger.assigned) { W.ledger.assigned = true; remember('arthur', 'Mr. Thomas set him to balance the quarterly ledger.', ['thomas', 'ledger'], 3); remember('thomas', 'He set Mr. Hale to balance the quarterly ledger.', ['arthur', 'ledger'], 3); say('   (Mr. Thomas sets Arthur to the quarterly ledger.)'); }
      if (DOW(d) === 'fri' && t === 17 * 60 && !W.paid['arthur' + d] && A.arthur.place === 'office') { W.paid['arthur' + d] = true; A.arthur.money += W.wage; note('arthur', 'account-book', `wages received, ${money(W.wage)}`); remember('arthur', `He was paid his week's wages, ${money(W.wage)}`, ['thomas', 'money'], 2); say(`   (Wages: Arthur receives ${money(W.wage)})`); }
      await interrupts(d, t);
      const groups = {};
      for (const k in A) if (A[k].place && A[k].place !== 'finsbury') (groups[A[k].place] = groups[A[k].place] || []).push(k);
      await Promise.all(Object.values(groups).map(async ks => {
        for (const k of ks) {
          const before = A[k].mem.length;
          try { await act(k); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; say(`   !! error in ${k}'s turn: ${String(e.message).slice(0, 120)}`); await ensureBrowser(); }
          const setback = A[k].mem.slice(before).map(x => x.text).find(x => /wrong figure|not finished|no extra work|would not lend|grumbled|stay at his work/i.test(x));
          const kind = setback && setback.match(/wrong figure|not finished|no extra work|would not lend|grumbled|stay at his work/i)[0];
          if (setback && !A[k].done['lesson' + d + kind]) { A[k].done['lesson' + d + kind] = true; await lesson(k, setback); }
          if (W.pendingLesson) { const [who, what] = W.pendingLesson; W.pendingLesson = null; await lesson(who, what); }
        }
      }));
      fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify({ W, STATS, agents: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { place: a.place, money: a.money, op: a.op, mem: a.mem }])) }, null, 1));
    }
    eveningEvents();
    const keyDay = [0, 3, 5, 10, 11, 29, 30, 39, 57, 59, 73, 84].includes(d) || W.facts.some(f => f.day === d);
    try {
      if (DOW(d) === 'sun') for (const k in A) await reflect(k);
      if (DOW(d) === 'sun' || keyDay) for (const k in A) await diary(k);
    } catch (e) { STATS.errors = (STATS.errors || 0) + 1; await ensureBrowser(); }
    if (d + 1 < ND && dateOf(d + 1).getUTCMonth() !== dateOf(d).getUTCMonth()) { try { for (const k in A) await monthReview(k); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; } }
    if (DOW(d) === 'sun') consolidate();
    METRICS.days.push({ day: d, asks: STATS.asks - asks0, money: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, a.money])), op: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(A).map(([k, a]) => [k, a.op])))) });
    fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ METRICS, STATS, W }, null, 1));
    fs.writeFileSync(path.join(OUT, 'story.txt'), STORY.join('\n'));
  }
  say('\n######## Final memory examination ########');
  W.day = Math.min(N, DAYS.length - 1); for (const k in A) A[k].place = A[k].place || (k === 'ada' ? 'ada_home' : k === 'arthur' ? 'arthur_home' : 'church');
  for (const f of W.facts.filter(f => A[f.who])) await probe(f, true);
  const P = METRICS.probes, D = METRICS.diaries;
  say(`\nSTATS ${JSON.stringify(STATS)}`);
  say(`MEMORY: ${P.filter(p => p.ok).length}/${P.length} correct; by age: ${JSON.stringify([1, 3, 7, 14, 30, 60].map(a => [a, P.filter(p => p.age >= a).length ? +(P.filter(p => p.age >= a && p.ok).length / P.filter(p => p.age >= a).length).toFixed(2) : null]))}`);
  for (const [lab, fl] of [['life', p => p.kind !== 'news'], ['news', p => p.kind === 'news'], ['aided', p => p.aided], ['unaided', p => !p.aided], ['final', p => p.final]]) { const x = P.filter(fl); say(`MEMORY ${lab}: ${x.filter(p => p.ok).length}/${x.length}, unreadable ${x.filter(p => p.answer === null).length}`); }
  say(`DIARIES: ${D.reduce((s, x) => s + x.kept, 0)}/${D.reduce((s, x) => s + x.facts, 0)} key facts kept`);
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ METRICS, STATS, W }, null, 1));
  fs.writeFileSync(path.join(OUT, 'story.txt'), STORY.join('\n'));
  if (browser) await browser.close();
  console.log('DONE');
})();
