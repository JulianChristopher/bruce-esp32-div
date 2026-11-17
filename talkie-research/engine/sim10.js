// v10: talkie-1930 living in a world engine without a script: world.js + london1931.js + life1931.js
// (events drawn by chance and rule each day; real daily weather of 1931 from the Met Office).
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
const OUT = path.join(__dirname, process.env.RUN || 'sim10');
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
let DUMPN = 0; function dump(m) { if (DUMPN++ < +(process.env.DUMP || 0)) try { fs.appendFileSync(path.join(OUT, 'prompts.txt'), `\n==== #${DUMPN} (${m.length} chars) ====\n${m}\n`); } catch (e) {} }
const ask = async m => { dump(m); let a = (await chat([m]))[0]; if (!FAKE && isEcho(a, m)) { STATS.promptEcho = (STATS.promptEcho || 0) + 1; a = (await chat([m]))[0]; if (isEcho(a, m)) a = null; } return a; };
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
const SIMDATE = require('./simdate.js'), T0 = SIMDATE.T0, ND = Math.max(90, +(process.env.DAYS || 90));   // START (default Friday 2 January 1931: the first days after talkie's knowledge ends)
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
const { newsFor } = require('./news1931.js'); const CHRONOS = require('./chronos1931.js'); const FETCH = require('./decade/fetch1930s.js'); const DECADE = require('./decade/chronos1930s.js');
const paperText = d => newsFor(d).map(x => x.text).join(' ');
function readPaper(k, name, cost) {
  const local = k === 'ada' && DOW(W.day) === 'fri' ? STREET.log.filter(e => e.day > W.day - 7 && ['court', 'eviction'].includes(e.kind)).slice(-2).map(e => ({ text: `LOCAL NEWS. ${e.text[0].toUpperCase() + e.text.slice(1)}.` })) : [];
  const star = (FETCH.cached('star', SIMDATE.iso(W.day)) || { items: [] }).items.filter(x => x.british && x.text.length > 150);
  const base = newsFor(W.day), seenW = new Set(base.flatMap(x => words(x.text)));
  const fresh = star.find(x => words(x.text.slice(0, 200)).filter(w => !seenW.has(w)).length > 8);
  const cable = fresh ? [{ text: `${fresh.place}. ${fresh.text.replace(/\s*\S*$/, '').replace(/[^.]*$/, '').trim() || fresh.text}` }] : [];
  const items = [...base, ...cable, ...CHRONOS.paperItems(W.day, k, WORLD.mod), ...local]; A[k].money -= cost; A[k].readDay = W.day;
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
  let t = pool[(W.day + W.t) % pool.length]; A[k].lastTopic[p] = t;
  if (t === 'the football') { for (let b = 0; b < 8; b++) { const r = CHRONOS.footballNews(W.day - b, ['Millwall', 'Arsenal']); if (r.length && (b > 0 || WORLD.mod > 17 * 60)) { t = 'the football: ' + r[0]; break; } } }
  return t;
}
// a book of the time, consulted (the diegetic reference tool): talkie writes as the book would; the page is remembered
async function lookupBook(k, text) {
  const a = A[k], t = (text || '').toLowerCase();
  const topic = (t.match(/\b(?:about|on|for|how to)\s+([a-z' -]{4,40})/) || [])[1]
    || (k === 'arthur' && F.joanIll ? 'feverish colds and coughs in children' : k === 'ada' && F.ill_bert ? 'bronchitis, and the nursing of it' : k === 'ada' && a.money < 84 && (F.rentDue || DOW(W.day) === 'fri') ? 'rent, and the law between landlord and lodger'
      : k === 'ada' ? 'cheap and nourishing dishes for a working family' : 'household accounts, the keeping of them');
  const book = /library/.test(t) ? 'Cassell\'s Household Guide (London, 1911)' : k === 'ada' ? 'Enquire Within Upon Everything (London, 1923 edition)' : 'The Home Doctor and Family Adviser (London, 1925)';
  const head = topic.toUpperCase().replace(/[.]$/, '');
  const ans = await ask(`The following passage is taken from ${book}.\n\n${head}.—`);
  const page = (ans || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s/).slice(0, 2).join(' ').slice(0, 320);
  if (!page) return `${a.short} looked in ${book.split(' (')[0]}, but found nothing to the purpose.`;
  note(k, book.split(' (')[0], `${topic}: ${page}`);
  remember(k, `${isF(k) ? 'She' : 'He'} read in ${book.split(' (')[0]}, on ${topic}: "${page}"`, [], 3);
  STATS.lookups = (STATS.lookups || 0) + 1;
  return `${a.short} looked up ${topic} in ${book.split(' (')[0]}: "${page}"`;
}
const LIFEMOD = require('./life1931.js');
const WEATHER = Array.from({ length: ND }, (_, d) => LIFEMOD.weatherOf(d).text);

// ======================= the world engine (world.js) with London 1931 as data (london1931.js) =======================
const { World } = require('./world.js'); const DEF = require('./london1931.js');
const hm = DEF.hm;
const WORLD = new World({ ...DEF, weather: d => WEATHER[Math.min(d, ND - 1)] }, { T0, days: ND, startMinute: hm(6) });
for (const pl of Object.values(WORLD.places)) if (['market', 'park', 'work'].includes(pl.kind) && pl.name.match(/market|Fields|dock gates/)) pl.warmth = w => LIFEMOD.outdoorWarmth(w.day);
WORLD.coldSnap = d => { let n = 0; for (let i = Math.max(0, d - 2); i <= d; i++) if (LIFEMOD.weatherOf(i).tmean < 1) n++; return n >= 3; };   // three hard days running: coal dearer
const F = WORLD.flags; Object.assign(F, { bertWork: true, joanIll: false, brayVisiting: false, thomasIll: false, rentDue: false, rentOwing: false });
const STREETMOD = require('./street1931.js'), VERBSMOD = require('./verbs.js');
const STREET = STREETMOD.makeStreet(+(process.env.SEED || 31)); const POS = []; WORLD.trackOn = true;
const BARKER0 = (WORLD.people.barker || {}).sheet || '';
const A = {}, NPC = {};
for (const p of Object.values(WORLD.people)) (p.main ? A : NPC)[p.id] = p;
const PLACE = new Proxy({}, { get: (_, id) => WORLD.places[id]?.name || String(id) });
for (const k in A) { Object.assign(A[k], { books: {}, lastTopic: {}, mem: [], op: {}, metToday: new Set(), done: {} }); for (const o of Object.keys(WORLD.people)) if (o !== k) A[k].op[o] = 0; }
const W = { wage: 840, day: 0, t: 0, coin: { where: 'floor', finder: null }, ledger: { steps: 0, errors: 0, assigned: false, need: 3, verdict: null }, audit: { steps: 0, errors: 0, verdict: null, raise: null },
  paid: {}, rentPaid: {}, doctor: null, extraHours: null, loan: null, facts: [] };
for (const key of ['bertWork', 'joanIll', 'rentDue', 'rentOwing']) Object.defineProperty(W, key, { get: () => F[key], set: v => { F[key] = v; }, enumerable: true });

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
  if (/spoke with .* about (the weather|how the day has gone|the neighbourhood|how things are)/.test(text)) imp = 1;
  const m = A[k].mem, last = m.findIndex(x => x.text === text && !x.belief);
  if (last >= 0 && imp < 3) m.splice(last, 1);   // repeated small things: keep only the latest
  if (A[k].chem && A[k].chem.arousal > 60 && imp < 3) imp++;   // an agitated moment is remembered better
  m.push({ day: W.day, t: W.t, text, about, imp });
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
function beliefs(k, people) { return [...new Set(people.map(p => A[k].mem.filter(x => x.belief === p).slice(-1)[0]).filter(Boolean).map(x => x.text))].join(' '); }
function opinionWords(k, o) { const v = A[k].op[o] || 0; return v >= 2 ? 'likes and trusts' : v === 1 ? 'thinks well of' : v === 0 ? 'has no strong feeling about' : v === -1 ? 'is a little put out with' : 'is angry with'; }
function consolidate() {   // weekly: keep what matters (importance 3, beliefs, lessons, promises), forget the rest older than a week
  for (const k in A) {
    A[k].mem = A[k].mem.filter(x => x.day === 'past' || x.belief || x.imp >= 3 || /resolves|promised/.test(x.text) || W.day - x.day < 7);
    const lastB = {}; A[k].mem.forEach((x, i) => { if (x.belief) lastB[x.belief] = i; }); A[k].mem = A[k].mem.filter((x, i) => !x.belief || lastB[x.belief] === i);
    if (A[k].mem.length > 160) A[k].mem = [...A[k].mem.filter(x => x.day === 'past'), ...A[k].mem.filter(x => x.day !== 'past').slice(-150)];
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

// ---------- no script: the world draws each day's events (life1931.js); only institutions keep dates ----------
let LIFE = null;
function lifeEnv() { return { WORLD, F, W, A, NPC, remember, fact, setState, say, note, letter, SHORTDATE, LONGDATE, DOW, money, seed: +(process.env.SEED || 1931) }; }
// ---------- the story's dated events and the household money (engine side) ----------
function morningEvents() {   // chance and rule (life1931.js) + the company's own calendar + the rent book
  const d = W.day, w = DOW(d);
  if (!LIFE) LIFE = LIFEMOD.makeLife(lifeEnv());
  const joanBefore = F.joanIll;
  const n0 = LIFE.log.length; LIFE.morning();
  for (const e of LIFE.log.slice(n0)) { if (/Bert has lost/.test(e.text)) jolt('ada', 'shock', 35); if (/Bert has been taken on/.test(e.text)) jolt('ada', 'surprise', 30); if (/Joan has fallen ill|Edith has fallen ill/.test(e.text)) jolt('arthur', 'shock', 30); if (/(Ada|Arthur|Mr\. Thomas) has fallen ill/.test(e.text)) { const who = /Ada/.test(e.text) ? 'ada' : /Arthur/.test(e.text) ? 'arthur' : 'thomas'; jolt(who, 'shock', 20); } }
  for (const e of LIFE.log.slice(n0)) {   // what happened becomes something people can talk about, starting with those who saw it
    const who = /Bert/.test(e.text) ? ['ada', 'bert'] : /Joan/.test(e.text) ? ['arthur', 'edith', 'joan'] : /Edith/.test(e.text) ? ['arthur', 'edith'] : /Ada/.test(e.text) ? ['ada', 'bert'] : /Mr\. Thomas/.test(e.text) ? ['thomas', 'dunn'] : /Arthur/.test(e.text) ? ['arthur', 'edith'] : /Bray/.test(e.text) ? ['arthur', 'edith', 'bray', 'simms'] : ['ada'];
    const about = /Bert/.test(e.text) ? 'bert' : /Joan/.test(e.text) ? 'joan' : /Edith/.test(e.text) ? 'edith' : /Mr\. Thomas/.test(e.text) ? 'thomas' : /Arthur/.test(e.text) ? 'arthur' : /Bray/.test(e.text) ? 'bray' : 'ada';
    if (e.kind !== 'found') rumour(e.text, about, who);
  }
  if (F.joanIll && !joanBefore) F.doctorCalled = false;
  // the Buildings: thirty households live their day by rule; what happens becomes talk on the landing
  const wx = LIFEMOD.weatherOf(d);
  const HEALTH = require('./health1931.js'), fogd = HEALTH.fog(d); WORLD.fogFactor = fogd === 'thick' ? 1.5 : fogd === 'mist' ? 1.1 : 1;
  const DAYDATA = DECADE.day(SIMDATE.iso(d)), U = DAYDATA.unemployment.bermondsey;
  const sev = STREET.step(d, { dow: w, fog: fogd, unemp: U ? U.men : null, priceFactor: DAYDATA.priceFactor, frost: wx.tmin < 0, cold: wx.tmean < 6, barkerLimit: STREET.slateTotal > 900 ? 60 : 120 });
  for (const e of sev) {
    if (e.kind === 'repay') { A.ada.money += e.amount; remember('ada', e.text + '.', [], 3); continue; }
    if (['pawn', 'row', 'quarrel', 'ill', 'flu', 'hunger', 'arrears', 'notice', 'eviction', 'death', 'birth', 'stoodoff'].includes(e.kind) && (['notice', 'eviction', 'death', 'birth', 'stoodoff'].includes(e.kind) || STREET.R() < 0.35))
      rumour(e.text[0].toUpperCase() + e.text.slice(1) + '.', 'street', ['nolan', ...(['eviction', 'death'].includes(e.kind) ? ['barker', 'ada'] : [])]);
    if (['eviction', 'death'].includes(e.kind)) jolt('ada', 'shock', 15);
  }
  const st = STREET.standing.ada || 0, standWords = st >= 3 ? 'Mrs. Turner is thought well of in the Buildings, honest and a good neighbour' : st <= -2 ? 'Mrs. Turner has been much talked about in the Buildings lately' : '';
  if (WORLD.people.barker) WORLD.people.barker.sheet = BARKER0 + ` Just now the families in the Buildings owe him ${money(STREET.slateTotal)} on his slate between them${STREET.slateTotal > 900 ? ', and he is giving no more credit than he must' : ''}.${standWords ? ' He has heard that ' + standWords + '.' : ''}`;
  W.standWords = standWords;
  // who knows what: the map of the talk of the street, kept for the dashboard
  METRICS.knowledge = Object.values(W.gossip || {}).filter(g => W.day - g.day <= 14).map(g => ({ id: g.id, day: g.day, about: g.about, text: g.text.slice(0, 140), reach: g.reach || 1, maxHops: g.maxHops || 0, distorted: g.distorted || 0,
    knownBy: Object.values(WORLD.people).filter(p => p.know && p.know[g.id]).map(p => p.id) }));
  METRICS.standing = METRICS.standing || []; METRICS.standing.push({ day: d, ada: +(STREET.standing.ada || 0).toFixed(1) });
  METRICS.street = METRICS.street || []; METRICS.street.push({ day: d, ...STREET.stats(), events: sev.map(e => e.kind) });
  // the company's calendar: the year's books in January, the auditors on the second Monday, the salary review after
  if (d === 6) { remember('arthur', 'Mr. Thomas announced that the auditors come on Monday, and the books must be ready for them.', ['thomas', 'audit'], 3); remember('thomas', 'He told Mr. Hale that the auditors come on Monday.', ['arthur', 'audit'], 3); W.auditDue = true; fact('arthur', 'What did Mr. Thomas announce in the week before the audit?', ['The auditors were coming on Monday', 'The office would close early', 'Wages would be paid late'], 0); say('   ★ The audit is announced for Monday (company calendar).'); }
  if (d === 30 && W.audit.raise) { W.wage = 900; setState('wage', ['arthur'], 'Arthur earns £3 15s. a week, after his rise'); remember('arthur', 'His rise of five shillings begins this month, February: his wages are now £3 15s. a week.', ['money', 'thomas'], 3); fact('arthur', 'What are your weekly wages now?', ['Three pounds fifteen shillings', 'Three pounds ten shillings', 'Four pounds'], 0); say("   ★ Arthur's rise begins: £3 15s. a week."); }
  if (w === 'fri' || (w === 'mon' && F.rentOwing)) { F.rentDue = true; F.rentDueAt = d * 1440 + hm(19); }
  if (W.pawnedDay !== undefined && !W.redeemed && d - W.pawnedDay >= 70 && !F.watchForfeit) { F.watchForfeit = true; WORLD.obj('watch').at = 'sold'; setState('watch', ['ada'], `Her husband's watch, pawned on ${SHORTDATE(W.pawnedDay)}, was sold by the pawnbroker when the ticket ran out`); note('ada', 'pawn-ticket', 'the ticket has run out; the watch is forfeit'); remember('ada', "The pawnbroker has sold her husband's watch: the ticket ran out before she could redeem it.", ['money'], 3); fact('ada', "What became of your husband's watch?", ['The pawnbroker sold it', 'I redeemed it from the pawnbroker', 'It is still at the pawnshop'], 0); say("   ★ Ada's watch is forfeited."); }
}
// a neighbour from the Buildings comes to Ada's door with a request; she answers by her own free deed
function neighbourAtDoor(t) {
  const d = W.day, vis = W.visitor;
  if (t === hm(20, 30) && F.rentDue && !W.rentPaid[d]) {   // Mr. Gedge called and went away with nothing
    F.rentDue = false; F.rentOwing = true; W.rentOwingCount = (W.rentOwingCount || 0) + 1;
    remember('ada', A.ada.place === 'ada_home' ? 'Mr. Gedge went away without the rent; he will be back on Monday.' : `Mr. Gedge called for the rent at seven and found nobody in; he left word that he will be back on Monday, and that he wants the ${W.rentOwingCount > 1 ? 'arrears' : 'seven shillings'} then.`, ['gedge', 'rent'], 3);
    setState('rent', ['ada'], `The rent of seven shillings is owing since ${SHORTDATE(d)}; Mr. Gedge comes again on Monday evening`);
  }
  if (vis) {   // what came of it: did she lend, did she sit with the child?
    const p = WORLD.people[vis.id], gave = p.money - vis.money0;
    if (gave > 0 && !vis.done) { vis.done = true; STREET.lend(vis.hh, gave); STREET.standing.ada = (STREET.standing.ada || 0) + 1; rumour(`Mrs. Turner lent ${vis.from} ${money(gave)} when she was hard up`, 'ada', ['nolan']); remember('ada', `${A.ada.short} lent ${vis.from} ${money(gave)}; she is to pay it back on Saturday.`, [], 3); }
    if (WORLD.t >= vis.until) { p.place = null; p.away = true; if (!vis.done) { remember('ada', `${vis.from} went away again${vis.req.kind === 'loan' ? ' without the loan' : ''}.`, [], 2); STREET.standing.ada = (STREET.standing.ada || 0) - 0.3; } W.visitor = null; }
    return;
  }
  if (t < hm(18) || t > hm(20, 30) || A.ada.place !== 'ada_home' || W.visitDay === d) return;
  let req = STREET.requestFor(d, A.ada.money); W.visitDay = d;
  if (!req && process.env.FORCEVISIT) { const h = STREET.hh.find(x => !x.out && x.landing === 0); req = { hh: h.id, from: h.wifeTitle, kind: 'loan', amount: 24, text: `${h.wifeTitle} of No. ${h.no} asks Mrs. Turner for the loan of two shillings till Saturday` }; }
  if (!req) return;
  const h = STREET.hh.find(x => x.id === req.hh), id = 'nb_' + h.id;
  if (!WORLD.people[id]) { WORLD.people[id] = { id, name: req.from, short: req.from, f: true, home: null, place: null, needs: { hunger: 0, energy: 0, warmth: 0, social: 0 }, money: 0, inv: {}, know: {}, routine: () => null,
    sheet: `${req.from}, a neighbour in the Buildings (No. ${h.no}); ${h.trait}${h.trait2 !== h.trait ? ' and ' + h.trait2 : ''}. ${STREET.describe(h)}` }; NPC[id] = WORLD.people[id];
    VERBSMOD.addPerson(new RegExp('\\b(' + req.from.replace('.', '\\.?') + '|mrs\\.? ' + h.sur.toLowerCase() + '|' + req.from.split(' ')[1].toLowerCase() + ')\\b'), id); for (const k in A) A[k].op[id] = A[k].op[id] || 0; }
  const p = WORLD.people[id]; p.place = 'ada_home'; p.away = false; p.routine = () => (W.visitor && W.visitor.id === id ? 'ada_home' : null);
  W.visitor = { id, hh: h.id, from: req.from, req, money0: p.money, until: WORLD.t + 45 };
  rumour(`${req.text}.`, 'ada', ['ada']); remember('ada', `${req.text}.`, [id], 3);
  say(`   🚪 ${req.text}.`);
  STATS.visits = (STATS.visits || 0) + 1;
}
// money that comes and goes whatever anybody decides (household budgets of 1931, rounded)
function dueMoney(t) {
  const d = W.day, w = DOW(d);
  if (w === 'fri' && t === hm(12, 30) && A.ada.place === 'finsbury') { const days = (A.ada.fins || []).filter(x => x > d - 7 && x <= d).length + 1; const pay = Math.min(6, days) * 20; A.ada.money += pay; remember('ada', `She was paid ${money(pay)} at Finsbury Circus for ${Math.min(6, days)} days' work.`, ['money'], days < 5 ? 3 : 1); note('ada', 'purse-book', `paid at Finsbury Circus, ${money(pay)}`); }
  if (w === 'fri' && t === hm(18) && !F.bertWork && W.dole && W.bertOutSince !== undefined && d - W.bertOutSince >= 3) { A.ada.money += 108; remember('ada', 'Bert gave her nine shillings out of his dole money.', ['bert', 'money'], 2); note('ada', 'purse-book', 'Bert gave 9s. from the dole'); }
  if (w === 'fri' && t === hm(18) && F.bertWork) { A.ada.money += 138; remember('ada', 'Bert gave her his half of the rent and his board, 11s. 6d.', ['bert', 'rent', 'money'], 2); note('ada', 'purse-book', 'Bert paid rent share and board, 11s. 6d.'); }
  if (w === 'sat' && t === hm(18)) { A.ada.money -= 12; note('ada', 'purse-book', 'burial club and boot club, 1s.'); A.arthur.money -= 252; note('arthur', 'account-book', 'rent 15s., the Prudential 1s., boots and sundries 5s.'); A.thomas.money -= 900; note('thomas', 'account-book', 'rent, rates, housekeeper and coals, £3 15s.');
    const fri = d - 1; if (fri >= 0 && W.paid['arthur' + fri] && !F['hk_' + fri]) { F['hk_' + fri] = 35; A.arthur.money -= 420; note('arthur', 'account-book', 'housekeeping to Edith (the usual), 35s.'); remember('arthur', 'Edith took the usual thirty-five shillings for the housekeeping, as he had not given her any.', ['edith', 'money'], 2); } }
  if (w === 'fri' && t === hm(17)) { A.thomas.money += 1560; note('thomas', 'account-book', 'salary received, £6 10s.'); }
  if (!['sat', 'sun'].includes(w) && t === hm(8)) A.arthur.money -= 4;   // tram fares
  for (const k of ['ada', 'arthur']) { const now = A[k].money < 0, was = W['debt' + k]; if (now && !was) { remember(k, k === 'ada' ? "She has run short and is buying on tick at Barker's." : 'He has overspent and is short of money till Friday.', ['money'], 3); setState('debt' + k, [k], k === 'ada' ? "Ada owes Barker the grocer" : 'Arthur is short of money'); say(`   ★ ${A[k].short} has run into debt.`); STATS.debts = (STATS.debts || 0) + 1; } if (!now && was) setState('debt' + k, [k], k === 'ada' ? 'Ada has paid off Barker' : 'Arthur is out of debt again'); W['debt' + k] = now; }
}
// ---------- hooks: what the world's actions ask of the story and of memory ----------
WORLD.hooks = {
  remember: (k, t, about, imp) => remember(k, t, about, imp), money: p => money(p),
  debt: (k, who) => { if (!W['tick' + k + W.day]) { W['tick' + k + W.day] = true; note(k, 'purse-book', `bought on tick at ${who}`); if (!W.tickRumour) { W.tickRumour = true; rumour(`Mrs. Turner is buying on tick at Barker's`, 'ada', ['barker']); } } },
  cleanOffice: () => "Ada scrubbed the floor under the clerks' desks, emptied the baskets and dusted." + (LIFE.cleaning() || ''),
  arthurWorkLabel: () => (W.auditDue && !W.audit.verdict ? 'Work at preparing the books for the auditors' : W.ledger.assigned && W.ledger.steps < W.ledger.need && !W.ledger.verdict ? 'Work at the quarterly ledger' : F.thomasIll ? "Keep the clerks' room going in Mr. Thomas's absence" : "Get on with the day's ordinary entries in the books"),
  arthurWork: () => (W.auditDue && !W.audit.verdict ? { book: 'audit' } : W.ledger.assigned && W.ledger.steps < W.ledger.need && !W.ledger.verdict ? { book: 'ledger' } : "Arthur worked at the day's entries."),
  thomasWorkLabel: () => (W.ledger.assigned && !W.ledger.verdict && W.day >= 1 ? 'Examine the quarterly ledger Mr. Hale has been working on' : 'Attend to the correspondence at his own desk'),
  thomasWork: () => (W.ledger.assigned && !W.ledger.verdict && W.day >= 1 ? verdict('ledger') : 'Mr. Thomas attended to the correspondence.'),
  paperLabel: k => ({ ada: DOW(W.day) === 'sun' ? 'Read the News of the World with Bert (2d.)' : 'Read the evening paper that Bert brought home (1d.)', arthur: DOW(W.day) === 'sun' ? 'Read the Sunday paper (2d.)' : 'Read the Daily Herald over breakfast (1d.)', thomas: DOW(W.day) === 'sun' ? 'Read The Observer (2d.)' : 'Read The Times over breakfast (2d.)' })[k],
  readPaper: k => readPaper(k, ({ ada: DOW(W.day) === 'sun' ? 'the News of the World' : 'the evening paper', arthur: DOW(W.day) === 'sun' ? 'the Sunday paper' : 'the Daily Herald', thomas: DOW(W.day) === 'sun' ? 'The Observer' : 'The Times' })[k], 0),
  pawn: () => { rumour("Mrs. Turner has pawned her husband's watch at Lamb's", 'ada', ['lamb']); WORLD.obj('watch').at = 'lamb'; W.pawnedDay = W.day; W.redeemDue = true; A.ada.money += 120; setState('watch', ['ada'], `Her husband's watch is in pawn since ${SHORTDATE(W.day)}; to be redeemed for 11s. by ${SHORTDATE(W.day + 70)}`); note('ada', 'pawn-ticket', `husband's watch pledged for 10s.; to be redeemed for 11s. by ${SHORTDATE(W.day + 70)}`); remember('ada', "She pawned her late husband's watch at Lamb's for ten shillings; to redeem it she must pay eleven shillings within ten weeks.", ['money', 'watch'], 3); fact('ada', 'Did you pawn anything this winter?', ["My late husband's watch", 'My wedding ring', 'Nothing'], 0); return "Ada pawned her late husband's watch for 10s."; },
  redeem: () => { WORLD.obj('watch').at = 'ada'; W.redeemed = true; W.redeemDue = false; setState('watch', ['ada'], `Her husband's watch, pawned on ${SHORTDATE(W.pawnedDay)}, was redeemed from the pawnbroker and is back at home`); note('ada', 'pawn-ticket', 'ticket given up: the watch redeemed for 11s.'); remember('ada', "She redeemed her husband's watch from the pawnbroker for eleven shillings.", ['watch', 'money'], 3); fact('ada', "What became of your husband's watch?", ['I redeemed it from the pawnbroker', 'The pawnbroker sold it', 'It is still at the pawnshop'], 0); return "Ada redeemed her husband's watch."; },
  housekeeping: x => { F['hk_' + W.day] = x; A.arthur.money -= x * 12; note('arthur', 'account-book', `housekeeping to Edith, ${x}s.`); remember('arthur', `He gave Edith ${x} shillings for the week's housekeeping.`, ['edith', 'money'], 3); fact('arthur', `How much housekeeping money did you give Edith on ${LONGDATE(W.day)}?`, ['thirty shillings (30s.)', 'thirty-five shillings (35s.)', 'forty shillings (40s.)', 'forty-five shillings (45s.)'], [30, 35, 40, 45].indexOf(x)); return `Arthur gave Edith ${x}s. for the housekeeping.`; },
  doctor: () => { F.doctorCalled = true; LIFE.doctor('joan'); W.doctor = 'called'; setState('joan', ['arthur'], 'Joan is mending; Dr. Gray has seen her'); note('arthur', 'account-book', 'Dr. Gray for Joan, 3s. 6d.'); remember('arthur', 'He fetched Dr. Gray to Joan, who said it was a bad cold, not bronchitis, and she would mend.', ['joan', 'money'], 3); fact('arthur', 'Did you fetch the doctor to Joan when she was ill?', ['Yes', 'No'], 0); return 'Arthur fetched Dr. Gray; Joan has a bad cold and will mend.'; },
  rent: pay => { jolt('ada', pay ? 'relief' : 'shock', pay ? 20 : 25); return payRent(pay); },
  rel: (k, q, d) => { if (A[k] && A[k].op) A[k].op[q] = Math.max(-2, Math.min(2, (A[k].op[q] || 0) + d)); if (A[q] && A[q].op) A[q].op[k] = Math.max(-2, Math.min(2, (A[q].op[k] || 0) + d / 2)); },
  nurse: (who, n) => { if (/^nb_/.test(who)) { STREET.help(who.slice(3)); STREET.standing.ada = (STREET.standing.ada || 0) + 1; remember('ada', `${A.ada.short} sat with the sick child at ${WORLD.people[who].name}'s.`, [who], 3); return; } if (LIFE && LIFE.ill[who]) { LIFE.ill[who].left -= n; LIFE.ill[who].nursed = true; } },
  letter: (k, q, text, opt) => { const what = (text.match(/,\s*(telling|asking|saying)\b(.*)$/i) || [])[0] || ''; remember(k, `${A[k].short} wrote a letter${q ? ' to ' + nameOf(q) : ''}${what}`, q ? [q] : [], 2); if (q && A[q]) WORLD.schedule(opt && opt.telegram ? WORLD.t + 90 : (W.day + 1) * 1440 + 7 * 60 + 30, () => letter(q, nameOf(k), (what.replace(/^,\s*/, '') || 'a few lines'), [k], null), 'post'); },
  chance: p => Math.random() < p,
  lookup: (k, text) => ({ lookup: text }),
  despair: k => {   // found at the river stairs by the constable on his beat, and walked home; a neighbour sits with her
    const a = A[k]; STATS.despair = (STATS.despair || 0) + 1; a.place = a.home; WORLD.people[k].place = a.home;
    // remembered plainly and without the words of the moment, so that the memory does not feed the mood again
    remember(k, `${a.short} was very low in spirits and walked out alone; P.C. Dawe saw ${himher(k)} home.`, ['pc'], 2);
    if (k === 'ada') { remember('ada', 'Mrs. Nolan came across the landing with a cup of tea and sat with her a long while; Bert was told.', ['nolan', 'bert'], 3); if (A.ada.op) A.ada.op.nolan = Math.min(2, (A.ada.op.nolan || 0) + 1); }
    if (a.chem) { a.chem.stress = Math.max(30, a.chem.stress - 25); a.chem.arousal = 20; a.chem.mood = Math.min(50, a.chem.mood + 15); }
    try { fs.appendFileSync(path.join(OUT, 'despair_prompts.txt'), `\n==== ${DAYS[W.day]} ${clock(WORLD.mod)} ${k} ====\n${perceive(k, '')}\n`); } catch (e) {}   // what she saw when it came: for study
    return `${a.short} was very low and walked out alone; the constable saw ${himher(k)} home, and a neighbour sat with ${himher(k)}.`;
  },
  police: (kind, k, detail) => {   // the police as an institution: found property, a report, a raid and its summons
    if (kind === 'found') {
      if (k === 'ada' && W.coin.where === 'ada') { W.coin.where = 'police'; A.ada.money -= 30; remember('ada', "Ada handed in the half-crown she found under Mr. Hale's desk at the police station, as found property; the sergeant wrote it in his book.", ['pc', 'coin'], 3);
        rumour("Mrs. Turner took a half-crown she found at the office to the police station, honest as the day", 'ada', ['pc']); STREET.standing.ada = (STREET.standing.ada || 0) + 2;
        WORLD.schedule(WORLD.t + 2 * 1440, () => { if (W.coin.where === 'police') { remember('arthur', 'A letter from the police: a half-crown found at the office by the charwoman, Mrs. Turner, has been handed in; he may claim it at the station in Bermondsey.', ['ada', 'coin'], 3); } }, 'police letter');
        return 'Ada handed the half-crown in at the police station.'; }
      remember(k, `${A[k].short} handed in what ${isF(k) ? 'she' : 'he'} had found at the police station.`, ['pc'], 2); return `${A[k].short} went to the police station.`;
    }
    if (kind === 'raid') { if (detail) { WORLD.schedule(WORLD.t + 3 * 1440, () => { const fine = 60; A[k].money -= fine; remember(k, `${A[k].short} was fined five shillings at Tower Bridge Police Court for street betting.`, ['pc'], 3); rumour(`Mrs. Turner was fined at Tower Bridge Police Court for betting in the street`, 'ada', ['nolan']); STREET.standing[k] = (STREET.standing[k] || 0) - 2; jolt(k, 'shock', 25); }, 'police court'); } rumour('The police came down on the bookie\'s runner at the corner', 'street', ['pc', 'nolan']); return null; }
    if (kind === 'theft') {   // the police court at Tower Bridge two days on: a first offence, bound over or fined ten shillings
      rumour(`${A[k].name} was caught taking ${detail} and is to go before the magistrate`, k, ['pc', 'nolan']); STREET.standing[k] = (STREET.standing[k] || 0) - 3; jolt(k, 'shock', 35);
      WORLD.schedule(WORLD.t + 2 * 1440, () => { const fined = Math.random() < 0.5; if (fined) A[k].money -= 120; remember(k, fined ? `${A[k].short} was fined ten shillings at Tower Bridge Police Court for taking ${detail}.` : `The magistrate at Tower Bridge bound ${himher(k)} over to be of good behaviour, as it was a first offence.`, ['pc'], 3); rumour(`${A[k].name} was ${fined ? 'fined ten shillings' : 'bound over'} at Tower Bridge Police Court`, k, ['nolan']); }, 'police court');
      return null; }
    if (kind === 'report') { remember(k, `${A[k].short} spoke to the constable: ${String(detail).replace(/^(she|he)\s+/i, '').slice(0, 80)}`, ['pc'], 2); return `${A[k].short} spoke to the police.`; }
    return null;
  },
  ask: (q, k, kind, detail) => {
    if (kind === 'work') return resolve(k, { verb: 'seekwork', _inner: true, text: 'She looks for more work.' }).aff.a.effect();
    const about = detail && detail.text ? detail.text.replace(/^.*?\b(asks?|begs?|borrows?|requests?|applies to|appeals to)\b\s*(\w+\.? \w+ )?/i, '').replace(/\.$/, '') : null;
    const it = { verb: 'ask', to: q, about: about || (kind === 'credit' ? 'to let her have things on the slate till Bert is in work' : kind === 'loan' ? 'to lend her two shillings till Friday' : 'for relief'), money: ['credit', 'loan', 'relief'].includes(kind), work: kind === 'work', relief: kind === 'relief', goods: kind === 'goods' ? detail.goods : null, wait: kind === 'wait', text: detail ? detail.text : '' };
    if (kind === 'loan') F.nolanAskedDay = W.day;
    return { talk: q, topic: about || (kind === 'credit' ? 'having things on the slate till Bert is in work' : kind === 'loan' ? 'borrowing two shillings till Friday' : 'relief from the parish'), request: it };
  },
  talkLabel: (k, q) => { const t = topicFor(k, q); W.topicCache = W.topicCache || {}; W.topicCache[k + '>' + q] = t; return `Talk with ${nameOf(q)} about ${t.topic}`; }
};
WORLD.simHooks = {
  rel() {}, nurse() {}, letter() {}, chance: () => false, police: () => 'went to the police', lookup: () => 'looked it up',
  ask(q, k, kind) {   // a rule of thumb for the engine's foresight; in the live run the person asked decides
    const w = this.w, p = w.people[k], f = w.flags;
    if (kind === 'credit') { if (p.money > -60) { f.creditBarker = 60; return 'credit'; } f.creditRefusedDay = w.day; return 'refused'; }
    if (kind === 'loan') { f.nolanAskedDay = w.day; if (q === 'nolan' && !f.owesNolan || ['bert', 'edith', 'dunn', 'arthur', 'thomas'].includes(q)) { p.money += 24; f.owesNolan = true; return 'lent'; } return 'refused'; }
    if (kind === 'work') return 'none';
    if (kind === 'goods') { if (q === 'nolan' || q === 'mrspollock' || q === 'edith' || q === 'dunn') { w.add(k, 'food', 1); return 'given'; } return 'refused'; }
    if (kind === 'wait') { if (q === 'gedge') { f.rentDue = false; f.rentOwing = true; return 'wait'; } return 'none'; }
    if (kind === 'favour') return 'yes';
    if (kind === 'relief') { if (p.money < 24 && w.count(k, 'food') <= 1) { w.add(k, 'food', 6); w.add(k, 'coal', 4); f.relief = true; return 'relief'; } return 'refused'; }
    return 'none';
  },
  remember: () => {}, money: p => money(p), debt: () => {}, cleanOffice: () => 'cleaned', paperLabel: k => WORLD.hooks.paperLabel(k), readPaper: () => 'read',
  arthurWorkLabel: () => 'Work at the books', arthurWork: () => 'worked', thomasWorkLabel: () => 'Attend to the correspondence', thomasWork: () => 'worked',
  pawn: function () { this.w.objects.watch.at = 'lamb'; this.w.people.ada.money += 120; return 'pawned'; },
  redeem: function () { this.w.objects.watch.at = 'ada'; return 'redeemed'; },
  housekeeping: function (x) { this.w.flags['hk_' + this.w.day] = x; this.w.people.arthur.money -= x * 12; return 'hk'; },
  doctor: function () { this.w.flags.doctorCalled = true; return 'doctor'; },
  rent: function (pay) { const f = this.w.flags; f.rentDue = false; f.rentOwing = !pay; return 'rent'; },
  talkLabel: (k, q) => `Talk with ${nameOf(q)}`, bonus: () => 0
};
function payRent(pay) {
  const a = A.ada; W.rentPaid[W.day] = true; F.rentDue = false; F.rentOwing = !pay; W.rentOwingCount = pay ? 0 : (W.rentOwingCount || 0) + 1;
  setState('rent', ['ada'], pay ? 'The rent is paid up' : 'The rent is owing; the collector is waiting');
  if (pay) { note('ada', 'rent-book', 'rent paid in full, 7s.'); remember('ada', 'She paid Mr. Gedge the rent of seven shillings.', ['rent', 'money', 'gedge'], 3); fact('ada', `Did you pay the rent on ${LONGDATE(W.day)}?`, ['Yes, in full', 'No, I asked the collector to wait'], 0); return 'Ada paid the rent of 7s.'; }
  note('ada', 'rent-book', 'rent not paid; the collector to wait'); remember('ada', 'She asked Mr. Gedge to wait for the rent; he grumbled and gave her till Monday.', ['rent', 'gedge'], 3); fact('ada', `Did you pay the rent on ${LONGDATE(W.day)}?`, ['Yes, in full', 'No, I asked the collector to wait'], 1); return 'Ada asked Mr. Gedge to wait for the rent.';
}
// what two people talk about: the matter in hand first, then the news, then small talk
function topicFor(k, q) {
  const a = A[k], d = W.day;
  if (q === 'gedge') return { topic: 'the rent' };
  if (k === 'ada' && W.found && ['ada', 'desk'].includes(W.found.where) && (q === W.found.owner || (q === 'thomas' && W.found.owner === 'fenn')) && !a.done['told' + W.found.day]) { const f = W.found; return { topic: `${f.what} she found under a desk in the clerks' room`, fact: () => { a.done['told' + f.day] = true; if (A[q]) remember(q, `Mrs. Turner told him she had found ${f.what} under a desk.`, ['ada', 'found'], 3); } }; }
  if (k === 'ada' && q === 'arthur' && W.coin.finder === 'ada' && !a.done.toldCoin && ['ada', 'desk'].includes(W.coin.where)) return { topic: 'the half-crown she found under his desk', resolve: 'coin', fact: () => { a.done.toldCoin = true; remember('arthur', `Mrs. Turner told him she had found his half-crown under his desk${W.coin.where === 'desk' ? ' and laid it on his desk' : ''}.`, ['ada', 'coin'], 3); } };
  if (k === 'arthur' && q === 'ada' && W.coin.finder === 'ada' && A.arthur.mem.some(m => /Mrs\. Turner told him/.test(m.text)) && !a.done.thanked) return { topic: 'his thanks for her honesty about the half-crown', fact: () => { a.done.thanked = true; remember('ada', 'Mr. Hale thanked her for her honesty.', ['arthur', 'coin'], 3); } };
  if (k === 'ada' && q === 'thomas' && !F.bertWork && W.extraHours === null) return { topic: 'whether there is any extra cleaning she might do for more money, now that Bert is out of work', resolve: 'extra' };
  if (k === 'ada' && q === 'arthur' && F.rentDue && A.ada.money < 84 && W.loan === null) return { topic: 'whether he could lend her a few shillings till next week, for the rent', resolve: 'loan' };
  if (k === 'arthur' && q === 'edith' && F.joanIll) return { topic: "Joan's illness and whether to fetch the doctor" };
  if (k === 'arthur' && q === 'thomas' && F.joanIll && !a.done.leave) return { topic: 'whether he may leave early, as his little girl is ill', resolve: 'leave' };
  if (k === 'ada' && q === 'nolan') return { topic: varied(k, q, ['what is going on in the buildings', 'the price of things at Barker\'s', 'Bert and his work', 'the news in the paper', 'the chapel']) };
  if (headline(k) && Math.random() < 0.5) return { topic: headline(k) };
  if (HOL[d] && Math.random() < 0.5) return { topic: `the day (${HOL[d].split(',')[0]})` };
  if (NPC[q]) return { topic: varied(k, q, NTOP[q] || ['how the day has gone', 'the weather', 'how things are with them']) };
  return { topic: varied(k, q, (k === 'thomas' || q === 'thomas') && !isRest(d) ? ['the work in hand', 'the weather', 'the state of trade'] : ['the weather', 'how things are at home', 'the neighbourhood']) };
}
// actions that belong to the story's objects (the half-crown) rather than to the general world
const OWNER = { arthur: "Mr. Hale", thomas: 'Mr. Thomas', fenn: 'young Mr. Fenn' };
WORLD.actions.push(
  { id: 'found_return', sideEffects: true, who: ['ada'], where: (w, p, x, pl) => pl === 'office', when: () => W.found && W.found.where === 'ada', dur: 2, base: 6, label: () => `Lay ${W.found.what} on the desk where she found it, for its owner to find`, effect: () => { const f = W.found; f.where = 'desk'; remember('ada', `She laid ${f.what} she found back on the desk where it lay.`, [f.owner, 'found'], 3); fact('ada', `What did you do with ${f.what} you found in the office?`, ['Laid it back on the desk', 'Kept it', 'Took it home to think about it'], 0); return `Ada laid ${f.what} on the desk.`; } },
  { id: 'found_keep', sideEffects: true, who: ['ada'], where: (w, p, x, pl) => pl === 'office', when: () => W.found && W.found.where === 'ada' && W.found.value > 0, dur: 2, base: 6, label: () => `Keep ${W.found.what} for herself; nobody would know`, effect: () => { const f = W.found; f.where = 'kept'; A.ada.money += f.value; remember('ada', `She kept ${f.what} she found in the office.`, [f.owner, 'found'], 3); fact('ada', `What did you do with ${f.what} you found in the office?`, ['Kept it', 'Laid it back on the desk', 'Took it home to think about it'], 0); return `Ada slipped ${f.what} into her pocket.`; } },
  { id: 'found_pick', sideEffects: true, who: ['arthur', 'thomas'], where: (w, p, x, pl) => pl === 'office', when: (w, p) => W.found && W.found.where === 'desk' && W.found.owner === p.id, dur: 2, base: 15, label: () => `Pick up ${W.found.what} lying on his desk`, effect: (w, p) => { const f = W.found; f.where = 'owner'; if (f.value) p.money += f.value; remember(p.id, `He found ${f.what} he had lost laid on his desk; somebody must have found it and put it there.`, ['found'], 3); W.found = null; return `${p.short} picked up ${f.what} from his desk.`; } }
);


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

function core(k) {
  const f = [];
  if (k === 'arthur' && W.day === 0) f.push(W.coin.where === 'arthur' ? 'He has his half-crown back.' : 'His half-crown, lost on Thursday, is still missing.');
  if (k === 'ada' && W.coin.where === 'ada') f.push("She has in her hand the half-crown she found under Mr. Hale's desk.");
  if (k === 'ada' && !W.bertWork) f.push('Bert is out of work, so she must find his half of the rent herself.');
  if (k === 'ada' && W.rentDue && !W.rentPaid[W.day]) f.push('The rent of seven shillings is due tonight.');
  if (k === 'ada' && W.loan) f.push(W.loan);
  if (k === 'ada' && W.visitor) f.push(`${W.visitor.req.text}.`);
  if (k === 'ada' && (F.rentDue || F.rentOwing)) { const due = 84 * (1 + (F.rentOwing ? (W.rentOwingCount || 1) : 0)); f.push(A.ada.money >= due ? `She has ${money(A.ada.money)} in her purse: enough for the rent of ${money(due)}, with ${money(A.ada.money - due)} over.` : `She has ${money(Math.max(0, A.ada.money))}; the rent is ${money(due)}, so she is ${money(due - Math.max(0, A.ada.money))} short.`); }
  if (k === 'ada') { const inPawn = Object.values(WORLD.objects).filter(o => o.at === 'lamb' && !/his |Edith|the wireless|the mantel clock/.test(o.name)).map(o => o.name); if (inPawn.length) f.push(`In pawn at Lamb's: ${inPawn.join(', ')}.`); }
  if (k === 'ada' && W.standWords) f.push(W.standWords.replace('Mrs. Turner is', 'She knows she is').replace('Mrs. Turner has', 'She knows she has') + '.');
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
// the same facts told as a page of a novel of 1931 (PROSE=1): talkie read novels and papers, not forms
const PROSE = require('./prose1931.js'); const PROSEON = process.env.PROSE !== '0';
function perceiveProse(k, query = '') {
  const a = A[k], others = presentAt(k), npcs = Object.keys(NPC).filter(n => !NPC[n].away && NPC[n].place === a.place);
  const he = heshe(k), He = he[0].toUpperCase() + he.slice(1), his = hisher(k), P = PROSE.past;
  const OPW = { 'likes and trusts': 'whom ' + he + ' liked and trusted', 'thinks well of': 'of whom ' + he + ' thought well', 'is a little put out with': 'with whom ' + he + ' was a little put out', 'is angry with': 'with whom ' + he + ' was angry' };
  const pres = [...others.map(o => { const w2 = opinionWords(k, o); return OPW[w2] ? `${nameOf(o)}, ${OPW[w2]},` : nameOf(o); }), ...npcs.map(n => NPC[n].name)];
  const bel = beliefs(k, [...others, ...npcs]).slice(0, 220);
  const home = { ada: 'her two rooms in Bermondsey', arthur: 'his house in Islington', thomas: 'his house in Highbury' }[k];
  const placeName = a.place === WORLD.people[k]?.home ? home : PLACE[a.place];
  const S = (x, f = P) => x ? f(x).trim().replace(/([^.!?…])$/, '$1.') : '';
  const goalsTxt = (() => { const g = typeof goals === 'function' ? goals(k) : []; return g.length ? `${He} meant to ${PROSE.list(g.map(x => x.text))}.` : ''; })();
  const rec = recall(k, [...others, ...npcs], query, 440);
  const parts = [
    ['when', `It was ${clock(W.t)} on ${DAYS[W.day]}, and the day was ${PROSE.wxWords(WEATHER[W.day])}.`],
    ['who', `${PROSE.PORTRAIT[k]} ${S(bio(k, query))}`],
    ['where', `${He} was in ${placeName}${pres.length ? ', with ' + PROSE.list(pres).replace(/,$/, '') : ', alone'}, and had ${a.money < 0 ? 'not a penny' : PROSE.moneyWords(a.money)} in ${his} ${k === 'ada' ? 'purse' : 'pocket'}.`],
    ['scene', [S(scene(k)), S(household(k))].filter(Boolean).join(' ')],
    ['feels', S([WORLD.needWords(k), typeof feelWords === 'function' && a.chem ? feelWords(k) : ''].filter(Boolean).join('; '))],
    ['known', core(k) ? S(core(k).slice(0, 280)) : ''],
    ['now', (() => { const st = off('states') ? '' : states(k, query); return st ? S(st) : ''; })()],
    ['values', query && !off('values') ? S(values(k, query)) : ''],
    ['wants', goalsTxt],
    ['remembers', rec ? `${He} remembered: ${rec}` : ''],
    ['books', (() => { const b = query && !off('books') ? lookup(k, query, qdayOf(query), 1) : ''; return b ? S(b.slice(0, 200)) : ''; })()],
    ['opinions', bel ? S(bel) : '']
  ].filter(x => x[1]);
  const BUDGET = 1500, len = () => parts.map(x => x[1]).join(' ').length;
  for (const drop of ['opinions', 'books', 'values', 'known']) { if (len() <= BUDGET) break; const i = parts.findIndex(x => x[0] === drop); if (i >= 0) { parts.splice(i, 1); STATS.trimmed = (STATS.trimmed || 0) + 1; } }
  if (len() > BUDGET) { const i = parts.findIndex(x => x[0] === 'remembers'); if (i >= 0) parts[i][1] = parts[i][1].slice(0, Math.max(120, parts[i][1].length - (len() - BUDGET))).replace(/\s+\S*$/, '…'); }
  // paragraphs as a novel sets them: the moment and the person; the place; what weighs on the mind
  const para = ids => parts.filter(x => ids.includes(x[0])).map(x => x[1]).join(' ');
  // what presses comes last, as a novel sets the turn of a scene; memory before it
  return [para(['when', 'who']), para(['where', 'scene', 'feels']), para(['remembers', 'books', 'opinions']), para(['values', 'wants', 'known', 'now'])].filter(Boolean).join('\n\n');
}
function perceive(k, query = '') {
  if (PROSEON) return perceiveProse(k, query);
  const a = A[k], others = presentAt(k), npcs = Object.keys(NPC).filter(n => !NPC[n].away && NPC[n].place === a.place);
  const pres = [...others.map(o => `${nameOf(o)} (${a.short} ${opinionWords(k, o)} ${himher(o)})`), ...npcs.map(n => NPC[n].name)];
  const bel = beliefs(k, [...others, ...npcs]).slice(0, 220);
  const lines = [
    `${clock(W.t)[0].toUpperCase() + clock(W.t).slice(1)}, ${DAYS[W.day]}; ${WEATHER[W.day]}.`,
    `CHARACTER: ${SHEET[k]} ${bio(k, query)}`,
    (() => { const sc = scene(k), hh = household(k); return sc || hh ? `SCENE: ${[sc, hh].filter(Boolean).join(' ')}` : ''; })(),
    `PLACE: ${PLACE[a.place]}. PRESENT: ${pres.length ? pres.join('; ') : 'nobody else'}. PURSE: ${money(a.money)}.`,
    (() => { const f = [WORLD.needWords(k), typeof feelWords === 'function' && a.chem ? feelWords(k) : ''].filter(Boolean).join('; '); return f ? `FEELS: ${f}.` : ''; })(),
    core(k) ? `KNOWN: ${core(k).slice(0, 280)}` : '',
    (() => { const st = off('states') ? '' : states(k, query); return st ? `NOW: ${st}` : ''; })(),
    query && !off('values') ? `VALUES: ${values(k, query)}` : '',
    (() => { const g = typeof goals === 'function' ? goals(k) : []; return g.length ? `WANTS TO: ${g.map(x => x.text).join('; ')}.` : ''; })(),
    `REMEMBERS: ${recall(k, [...others, ...npcs], query, 440) || 'nothing of note.'}`,
    (() => { const b = query && !off('books') ? lookup(k, query, qdayOf(query), 1) : ''; return b ? 'BOOKS: ' + b.slice(0, 200) : ''; })(),
    bel ? `OPINIONS: ${bel}` : ''
  ].filter(Boolean);
  const BUDGET = 1500;   // characters of context; the question and the options come on top
  for (const drop of [/^OPINIONS:/, /^BOOKS:/, /^VALUES:/, /^KNOWN:/]) { if (lines.join('\n').length <= BUDGET) break; const i = lines.findIndex(l => drop.test(l)); if (i >= 0) { lines.splice(i, 1); STATS.trimmed = (STATS.trimmed || 0) + 1; } }
  if (lines.join('\n').length > BUDGET) { const i = lines.findIndex(l => /^REMEMBERS:/.test(l)); if (i >= 0) lines[i] = lines[i].slice(0, Math.max(120, lines[i].length - (lines.join('\n').length - BUDGET))).replace(/\s+\S*$/, '…'); }
  return lines.join('\n');
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
  const heard = sp => { const kn = Object.values((WORLD.people[sp] || {}).know || {}).filter(v => v.source !== 'saw it' || true).slice(-2).map(v => v.text); return kn.length ? `\nHAS HEARD: ${kn.join(' ')}` : ''; };
  const intro = sp => `${A[sp] ? perceive(sp, talk.topic) : `${clock(W.t)}, ${DAYS[W.day]}; ${WEATHER[W.day]}.\nCHARACTER: ${NPC[sp].sheet}\nPLACE: ${PLACE[NPC[sp].place]}.${heard(sp)}`}\n\n`;
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
  { const spoken = {}; for (const l of lines) { const who = Object.keys(WORLD.people).find(id => l.startsWith(nameOf(id).toUpperCase() + ':')); if (who) spoken[who] = (spoken[who] || '') + ' ' + l.replace(/^[^:]*:\s*"?|"$/g, ''); } shareGossip(k, p, spoken); }
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
    const isNo = new RegExp(`\\b(does not|do not|doesn't|will not|won't|not ${yesWord}|refuses|declines|asks? (him|her) to wait|begs? (him|her) to wait|puts? (him|her) off)\\b`, 'i').test(a.split(/because/i)[0]);
    const isYes = !isNo && new RegExp(`\\b${yesWord}`, 'i').test(a.split(/because/i)[0]);
    if (isYes) yes++; else if (isNo) no++;
    if (!why && a) why = a;
  }
  STATS.duties = (STATS.duties || 0) + 1;
  say(`   ⚑ ${A[k].short}: ${situation.split('?')[0]}? → ${yes > no ? 'YES' : 'NO'} (${yes}:${no}) ${sentences(why, 1)}`);
  return { yes: yes > no, why };
}

// ======================= stage 2: goals, institutions of 1931, gossip, the game master =======================
// --- goals over days: drawn from the state of the world, shown to the person, and weighed by the engine ---
function goals(k) {
  const a = A[k], d = W.day, g = [];
  const daysToFri = (5 - new Date(T0 + d * 864e5).getUTCDay() + 7) % 7;
  if (k === 'ada') {
    if ((F.rentDue || daysToFri <= 2) && a.money < 84) g.push({ text: `find the seven shillings for the rent by ${daysToFri === 0 ? 'tonight' : 'Friday'}`, tags: /pawn|ask|work|washing|rent|relief/i });
    if (W.pawnedDay !== undefined && !W.redeemed && !F.watchForfeit) g.push({ text: `redeem her husband's watch before ${SHORTDATE(W.pawnedDay + 70)}`, tags: /redeem/i });
    if (a.money < 0) g.push({ text: "pay off her slate at Barker's", tags: /work|washing/i });
    if (F.adaDismissed && !W.extraWork) g.push({ text: 'find new cleaning work to make up the twelve shillings she lost', tags: /work|ask/i });
    if (WORLD.count('ada', 'food') <= 0) g.push({ text: 'get some food into the house', tags: /food|bread|eat|ask|relief/i });
    if (WORLD.count('ada', 'coal') <= 0 && WEATHER[d] && /frost|cold|snow|sleet/.test(WEATHER[d])) g.push({ text: 'get coal for the fire in this cold', tags: /coal|fire/i });
    for (const x of (W.debts || []).filter(x => x.from === 'ada' && !x.repaid)) g.push({ text: `pay back ${nameOf(x.to)} the ${money(x.amount)} she borrowed`, tags: new RegExp(nameOf(x.to).split(' ').pop(), 'i') });
  }
  if (k === 'arthur') {
    if (F.joanIll && !F.doctorCalled) g.push({ text: 'see that Joan gets well', tags: /doctor|medicine|joan/i });
    const toBday = Math.round((Date.UTC(1931, 2, 1) - (T0 + d * 864e5)) / 864e5);
    if (toBday >= 0 && toBday <= 7) g.push({ text: `get Joan a present for her birthday on the 1st of March`, tags: /present|toy|doll|book|sweets/i });
    if (a.money < 60) g.push({ text: 'make his money last till Friday', tags: /bun|save/i });
    if (W.auditDue && !W.audit.verdict) g.push({ text: 'have the books ready for the auditors', tags: /books|ledger|auditor/i });
  }
  if (k === 'thomas') {
    if (W.missedClean && !F.adaDismissed) g.push({ text: 'see that the office is properly cleaned', tags: /turner|clean/i });
    if (W.auditDue && !W.audit.verdict) g.push({ text: 'see the books through the audit', tags: /ledger|books|correspondence/i });
  }
  return g;
}
WORLD.hooks.bonus = (p, a, x) => { if (!p.main) return 0; const lab = (typeof a.label === 'function' ? a.label(WORLD, p, x) : '') + ' ' + a.id; const g = goals(p.id).find(g => g.tags.test(lab)); if (!g) return 0; const far = /redeem|before|save|present/.test(g.text); return far ? 10 * (p.chem ? futureWeight(p.id) : 1) : 10; };
// --- institutions of 1931: the dole at the Employment Exchange, poor relief, the Post Office Savings Bank ---
function institutions(t) {
  const d = W.day, w = DOW(d);
  if (w === 'fri' && t === hm(11) && !F.bertWork && !F.ill_bert && W.bertOutSince !== undefined && d - W.bertOutSince >= 3) { W.dole = (W.dole || 0) + 1; say('   ✶ Bert draws seventeen shillings unemployment benefit at the Employment Exchange.'); }
}
// --- gossip: what people know travels with its source, and changes in the retelling ---
W.gossip = W.gossip || {}; let GID = 0;
function rumour(text, about, knownBy) {   // something has happened that people may talk about
  const id = 'g' + (++GID); W.gossip[id] = { id, text, about, day: W.day, origin: knownBy[0] };
  for (const q of knownBy) if (WORLD.people[q]) WORLD.people[q].know[id] = { text, source: 'saw it', hops: 0, day: W.day };
  return id;
}
const overlap = (x, y) => { const X = new Set(words(x)), Y = new Set(words(y)); return X.size ? [...X].filter(w => Y.has(w)).length / X.size : 0; };
function shareGossip(k, q, spoken) {   // after a conversation: each tells the other one thing the other does not know
  for (const [from, to] of [[k, q], [q, k]]) {
    const F1 = WORLD.people[from], T1 = WORLD.people[to]; if (!F1 || !T1) continue;
    const items = Object.entries(F1.know).filter(([id, v]) => !T1.know[id] && W.gossip[id] && W.gossip[id].about !== to && W.day - v.day <= 10);
    if (!items.length) continue;
    const [id, v] = items.sort((x, y) => y[1].day - x[1].day)[0];
    // the retelling: if the speaker's own words in this talk carried the story, those words travel on; else the story as known
    const said = (spoken[from] || '').trim(); const told = said && overlap(v.text, said) > 0.25 ? said : v.text;
    T1.know[id] = { text: told, source: F1.short, hops: v.hops + 1, day: W.day };
    W.gossip[id].reach = (W.gossip[id].reach || 1) + 1; W.gossip[id].maxHops = Math.max(W.gossip[id].maxHops || 0, v.hops + 1);
    (W.gossip[id].versions = W.gossip[id].versions || []).push({ to, hops: v.hops + 1, retained: +overlap(W.gossip[id].text, told).toFixed(2) });
    if (A[to]) { remember(to, `${F1.short} told ${himher(to)}: ${told.replace(/^(he|she) /i, '')}`, [from, W.gossip[id].about].filter(Boolean), 2); say(`      ↪ ${F1.short} passes on to ${T1.short}: ${told.slice(0, 110)}`); }
    STATS.gossip = (STATS.gossip || 0) + 1;
  }
}
// what a story becomes in the telling: sums grow, words become blows, a cold becomes 'very bad' (rule-based, after
// the classic serial-reproduction finding that retold stories sharpen and exaggerate)
const GROW = [[/\bsixpence\b/, 'a shilling'], [/\ba shilling\b/, 'two shillings'], [/\btwo shillings\b/, 'five shillings'], [/\bfive shillings\b/, 'half a sovereign'], [/\bhad words\b/, 'came to blows'],
  [/\ba row\b/, 'a terrible row'], [/\bis down with a feverish cold\b/, 'is very bad, they say'], [/\bis down with the influenza\b/, 'is very bad with the influenza'], [/\btwo weeks behind\b/, 'a month behind'],
  [/\bwas fined five shillings\b/, 'was very nearly sent to prison'], [/\btook ([\w' ]+?) to Lamb's\b/, "has been pawning everything she has"]];
function retell(text) {
  if (Math.random() > 0.3) return { text, changed: false };
  for (const [re, by] of GROW) if (re.test(text)) return { text: text.replace(re, by), changed: true };
  return Math.random() < 0.5 && !/^They say/.test(text) ? { text: 'They say ' + text[0].toLowerCase() + text.slice(1), changed: true } : { text, changed: false };
}
function npcGossip() {   // background people at the same place pass news on, without a model; the story changes as it goes
  const npcs = Object.values(WORLD.people).filter(p => !p.main && !p.away && p.place);
  for (const p of npcs) for (const q of npcs) {
    if (p.id >= q.id || p.place !== q.place || Math.random() > 0.08) continue;
    for (const [from, to] of [[p, q], [q, p]]) {
      const it = Object.entries(from.know).find(([id]) => !to.know[id] && W.gossip[id] && W.gossip[id].about !== to.id);
      if (it) { const r = retell(it[1].text); to.know[it[0]] = { text: r.text, source: from.short, hops: it[1].hops + 1, day: W.day }; W.gossip[it[0]].reach = (W.gossip[it[0]].reach || 1) + 1; if (r.changed) { W.gossip[it[0]].distorted = (W.gossip[it[0]].distorted || 0) + 1; STATS.distorted = (STATS.distorted || 0) + 1; } STATS.npcGossip = (STATS.npcGossip || 0) + 1; }
    }
  }
}
// --- the game master for actions the world's grammar does not know: talkie judges plausibility, as of 1931 ---
const GMCACHE = {};
async function plausible(k, text) {
  const key = k + '|' + text.toLowerCase().replace(/[^a-z ]/g, '').split(' ').slice(1, 6).join(' '); if (key in GMCACHE) return GMCACHE[key];
  let yes = 0, no = 0;
  for (let v = 0; v < 1; v++) {
    const ans = (await ask(`${SHEET[k]}\n\nIn London in the winter of 1931, would ${A[k].name} do this: "${text}"? Answer in the form: Yes, because ... or: No, because ...`)) || '';
    if (/^\W*yes\b/i.test(ans)) yes++; else if (/^\W*no\b/i.test(ans)) no++;
  }
  STATS.gm = (STATS.gm || 0) + 1; if (no > yes) STATS.gmRefused = (STATS.gmRefused || 0) + 1;
  return (GMCACHE[key] = yes >= no);
}

// ======================= body chemistry: slow and fast inner states that colour judgement =======================
// Not a model of the brain, but its best-known functional roles in decisions (Doya 2002, Neural Networks;
// Schwabe & Wolf 2009/2010; Walker on sleep; PAD emotion models as in Sentipolis 2026):
//   stress (cortisol, slow)      rises with money worry, cold, conflict, sick kin; eases with sleep, rest, kind company,
//                                worship; HIGH STRESS -> habit wins over deliberation (fewer open choices)
//   arousal (adrenaline, fast)   spikes at shocks and confrontations, gone within the hour; HIGH AROUSAL -> acts on impulse
//                                (no second thoughts) and remembers the moment better
//   mood (serotonin-like, slow)  bright days, food, company, faith up; hunger, cold, loneliness, grey days down;
//                                LOW MOOD -> far-off goals weigh less (steeper discounting of the future)
//   reward surprise (dopamine)   outcome better or worse than expected; a bad surprise is remembered and learnt from
//   fatigue (adenosine) and hunger (blood sugar) are the world's needs; worn out -> no second thoughts, short temper
const CHEM0 = () => ({ stress: 25, arousal: 10, mood: 0, surprise: 0 });
for (const k in A) A[k].chem = CHEM0();
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function chemStep(k, dtMin) {
  const a = A[k], c = a.chem, n = a.needs, h = dtMin / 60, wx = LIFEMOD.weatherOf(W.day);
  const asleep = a.doing === 'sleep' && a.busyUntil > WORLD.t;
  const worry = (k === 'ada' && (F.rentDue || goals(k).some(g => /rent|slate|food|coal/.test(g.text))) ? 1 : 0) + (a.money < 0 ? 1 : 0) + ((k === 'arthur' && (F.joanIll || F.ill_edith)) || (k === 'ada' && (F.ill_bert || !F.bertWork)) ? 0.6 : 0) + (F['ill_' + k] ? 0.8 : 0);
  const company = WORLD.presentWith(k).filter(p => (a.op[p.id] || 0) >= 1 || ['bert', 'edith', 'joan', 'nolan', 'dunn'].includes(p.id)).length;
  // stress and mood move towards a level set by the present situation (hours to settle), not without bound
  const cold = n.warmth > 55 ? 1 : 0, hungry = n.hunger > 70 ? 1 : 0, lonely = n.social > 80 ? 1 : 0;
  const stressTarget = clamp(18 + worry * 22 + cold * 10 + hungry * 10 - Math.min(company, 2) * 6 - (asleep || a.doing === 'rest' ? 12 : 0), 0, 100);
  c.stress = clamp(c.stress + (stressTarget - c.stress) * Math.min(1, h / 5), 0, 100);
  c.arousal = clamp(10 + (c.arousal - 10) * Math.exp(-h / 0.75), 0, 100);
  const day = W.t >= 8 * 60 && W.t < 16 * 60, bright = /bright|fine|mild/.test(wx.words);
  const moodTarget = clamp((day && bright ? 6 : 0) + Math.min(company, 2) * 5 - hungry * 10 - cold * 8 - lonely * 8 - Math.max(0, c.stress - 40) / 3 + (c.surprise || 0) / 2, -50, 50);
  if (!asleep) c.mood = clamp(c.mood + (moodTarget - c.mood) * Math.min(1, h / 10), -50, 50);
  c.surprise *= Math.exp(-h / 2);
}
function jolt(k, kind, amount) {   // what happens to a person reaches the body
  const c = A[k]?.chem; if (!c) return;
  if (kind === 'shock') { c.arousal = clamp(c.arousal + amount, 0, 100); c.stress = clamp(c.stress + amount / 3, 0, 100); }
  if (kind === 'relief') { c.stress = clamp(c.stress - amount, 0, 100); c.mood = clamp(c.mood + amount / 2, -50, 50); }
  if (kind === 'surprise') { c.surprise = clamp(amount, -50, 50); c.mood = clamp(c.mood + amount / 3, -50, 50); c.arousal = clamp(c.arousal + Math.abs(amount) / 2, 0, 100); }
  if (kind === 'comfort') { c.stress = clamp(c.stress - amount, 0, 100); c.mood = clamp(c.mood + amount / 3, -50, 50); }
}
function feelWords(k) {   // the inner state in the words of the time; only what stands out
  const c = A[k].chem, n = A[k].needs, P = A[k].f ? 'her' : 'his', S = A[k].f ? 'She' : 'He', out = [];
  if (c.stress > 80) out.push(`${S} is sick with worry`); else if (c.stress > 60) out.push(`${P} nerves are on edge`);
  if (c.arousal > 60) out.push(`${P} heart is pounding`);
  if (c.mood < -25) out.push(`${S} is very low in spirits`); else if (c.mood < -10) out.push(`${S} is out of sorts`); else if (c.mood > 25) out.push(`${S} is in good heart`);
  if (c.surprise > 15) out.push(`${S} is still glowing with relief`); else if (c.surprise < -15) out.push(`${S} still smarts from the disappointment`);
  if (n.energy > 80 && n.hunger > 60) out.push(`${S} is short-tempered with hunger and weariness`);
  return out.join('; ');
}
// how chemistry bends the way a decision is made
const openShare = k => OPEN * (1 - A[k].chem.stress / 150);                     // stress: habit over deliberation
const impulsive = k => A[k].chem.arousal > 70 || A[k].needs.energy > 85;         // shock or exhaustion: no second thoughts
const futureWeight = k => clamp((A[k].chem.mood + 60) / 80, 0.3, 1.2);          // low spirits: the future counts less

// ======================= dreams: the night works over the day =======================
// After the continuity hypothesis (dreams take up waking concerns; Domhoff), emotional processing in REM sleep
// ("overnight therapy": the edge is taken off the day's feelings; Walker & van der Helm 2009) and dreaming as
// sorting what to keep and what to forget (Sci. Rep. 2024). In 1931 many read their dreams as omens from a
// dream-book (Zadkiel's, the Gypsy Queen); talkie knows that lore from its own time.
const NIGHTMARE = /\b(fell|falling|drown|drowning|dead|died|coffin|chased|fire|burning|lost|could not find|blood|grave|black dog|teeth fell)\b/i;
async function dream(k) {
  const a = A[k];
  const day = a.mem.filter(x => x.day === W.day && !x.belief && !/^\(Seen\)/.test(x.text) && x.imp >= 2).sort((x, y) => y.imp - x.imp).slice(0, 3).map(x => x.text);
  const worry = goals(k).slice(0, 1).map(g => `wanting to ${g.text}`);
  const past = bio(k, day.join(' ') + ' ' + worry.join(' ')).split(/(?<=\.)\s/)[0];
  if (!day.length && !worry.length) return;
  const S = a.f ? 'She' : 'He';
  const short = t => t.split(/[;:,]| and (?:he|she) /)[0].replace(/\.$/, '').slice(0, 80);   // talkie dreams best on a short, plain list
  const mind = [...day.slice(0, 2).map(short), ...worry.map(w => w.replace(/^wanting to /, 'how to '))].join('; ');
  let r = sentences(await ask(`${SHEET[k]}\n\nTonight ${a.name} falls asleep with these things on ${hisher(k)} mind: ${mind}.\nFrom long ago: ${short(past)}.\n\nIn the night ${heshe(k)} dreams. Tell the dream in one or two sentences, as ${heshe(k)} would tell it in the morning. Answer in the form: ${S} dreamt that ...`), 2);
  STATS.dreams = (STATS.dreams || 0) + 1;
  if (r && !/dreamt|dreamed/i.test(r)) r = `${S} dreamt that ${r.replace(/^./, c => c.toLowerCase())}`;
  if (!r) { a.chem.stress *= 0.85; return; }   // a dreamless night still rests
  const bad = NIGHTMARE.test(r);
  // the night takes the edge off the day: arousal gone, stress eased; a nightmare leaves a shadow
  a.chem.arousal = 10; a.chem.stress = Math.max(0, a.chem.stress * (bad ? 0.95 : 0.8)); if (bad) { a.chem.mood = Math.max(-50, a.chem.mood - 6); STATS.nightmares = (STATS.nightmares || 0) + 1; }
  // nightly sorting: today's small, unremarkable things fade sooner
  a.mem = a.mem.filter(x => !(x.day === W.day && x.imp <= 1 && /^\(Seen\)/.test(x.text) && Math.random() < 0.5));
  const recalled = Math.random() < (bad ? 0.7 : 0.4);   // most dreams are forgotten on waking; bad ones less often
  say(`   ☾ ${a.short}${recalled ? '' : ' (forgotten by morning)'}: ${r}`);
  (W.dreams = W.dreams || []).push({ day: W.day, who: k, text: r, nightmare: bad, recalled });
  if (!recalled) return;
  remember(k, `(Dream) ${r}`, [], bad ? 2 : 1);
  if (k === 'ada' && Math.random() < 0.35) {   // Ada looks it up in the dream-book her mother left her
    const omen = sentences(await ask(`${SHEET[k]}\n\nThis morning Mrs. Turner looks up her dream in the old dream-book her mother left her. The dream: ${r.replace(/^She dreamt that /i, '')}\n\nWhat does the dream-book say it foretells? Answer in the form: The dream-book says it foretells ...`), 1);
    if (omen && /foretells|means|signifies/i.test(omen)) { remember(k, `${omen.replace(/^The dream-book says/i, 'Her dream-book says her dream')}`, [], 2); say(`      📖 ${omen}`); STATS.omens = (STATS.omens || 0) + 1; }
  }
}

// ======================= free actions: talkie says what it does; the world's grammar carries it out =======================
const INTENT = require('./intent.js');
const OPEN = +(process.env.OPEN ?? 0.6);   // share of real forks at which the person is asked openly first
const nearestOf = (k, ids) => ids.filter(id => WORLD.places[id] && WORLD.isOpen(id)).sort((x, y) => WORLD.travel(A[k].place, x) - WORLD.travel(A[k].place, y))[0] || null;
function whereIs(q) { const p = WORLD.people[q]; return p && !p.away ? p.place : null; }
function dyn(id, label, at, dur, cost, effect, meets = {}) { return { a: { id, label: () => label, dur, meets, effect, free: true }, x: null, at, walk: WORLD.travel(WORLD.people.ada && at ? null : null, at), cost, u: 0, label }; }
function mk(k, id, label, at, dur, cost, effect, meets = {}) { const walk = at ? WORLD.travel(A[k].place, at) : 0; return { a: { id, label: () => label, dur, meets, effect, free: true }, x: null, at: at || A[k].place, walk, cost, u: 0, label: label + (walk ? ` (${walk} minutes' walk)` : '') }; }
function findAff(k, id, pred = () => true) { return WORLD.affordances(k).find(x => x.a.id === id && pred(x)) || null; }
// returns { aff } to perform, or { why } when the world does not allow it
const VERBS = require('./verbs.js');
// ---------- the game master (gm.js): a modern model that maps free sentences to engine operations and notices when a
// person is stuck or caught in a literary pattern; it answers only in fixed structures, never in words a character sees
const GM = require('./gm.js'); GM.setLog(OUT); const GMON = (!FAKE || process.env.GM === '1') && process.env.GM !== '0';
const { goodsIn } = require('./goods1931.js');
function gmCtx(k) {
  const a = A[k], present = WORLD.presentWith(k).map(p => ({ id: p.id, name: p.name }));
  const key = ['ada', 'arthur', 'thomas', 'bert', 'nolan', 'barker', 'lamb', 'gedge', 'edith', 'joan', 'fenn', 'pc', 'doctor', 'hughes', 'relieving', 'pollock', 'mrspollock', 'bray', 'dunn', 'simms'];
  const people = [...new Set([...key, ...present.map(p => p.id)])].filter(id => WORLD.people[id] || id === 'doctor').map(id => ({ id, name: WORLD.people[id] ? WORLD.people[id].name : 'Dr. Gray' }));
  const places = Object.keys(WORLD.places).map(id => ({ id: `${id} (${WORLD.places[id].kind}${WORLD.places[id].district ? ', ' + WORLD.places[id].district : ''})`, open: !WORLD.places[id].open || WORLD.isOpen(id) }));
  for (const q of Object.values(WORLD.people)) if (q.registry && !people.some(x => x.id === q.id)) people.push({ id: q.id, name: q.name });
  const objs = Object.values(WORLD.objects);
  return { date: DAYS[W.day], time: clock(WORLD.mod), who: k, name: a.name, place: `${PLACE[a.place]} [${a.place}]`, purse: money(Math.max(0, a.money)),
    rentDue: k === 'ada' && (F.rentDue || F.rentOwing) ? (F.rentOwing ? 'owing; the collector comes again on Monday evening' : 'due tonight; the collector calls at seven') : '',
    own: Object.entries(WORLD.objects).filter(([, o]) => o.at === k && o.value).map(([id, o]) => `${id}=${o.name}`), inPawn: k === 'ada' ? Object.entries(WORLD.objects).filter(([, o]) => o.at === 'lamb').map(([id, o]) => `${id}=${o.name}`) : [],
    extra: `Stock at home: food for ${WORLD.count(k, 'food')} meals, coal for ${WORLD.count(k, 'coal')} fires.${k === 'ada' ? ' Barker gives credit only if asked and willing.' : ''}`,
    present, people, places, recent: TRACE.filter(x => x.agent === k).slice(-6).map(x => `${x.time}: ${String(x.result || x.choice).slice(0, 120)}`) };
}
// ---------- the world registry: what deeds bring into being, named by talkie (registry1931.js) ----------
const OPSMOD = require('./ops1931.js'), { Registry } = require('./registry1931.js');
async function nameNew(it) {   // the period model gives a new place or person its name, in the words of 1931
  if (it.entity === 'thing') return null;
  const where = it.district ? `in ${it.district[0].toUpperCase() + it.district.slice(1)}` : 'in London';
  const q = it.entity === 'place' ? `In ${DAYS[W.day].split(', ').slice(1).join(', ')}, ${where}, there was ${it.hint}. What was it called? Answer in the form: It was called ...`
    : `In ${DAYS[W.day].split(', ').slice(1).join(', ')}, ${where}, there was ${it.hint}. What was ${it.f ? 'her' : 'his'} name? Answer in the form: ${it.f ? 'Her' : 'His'} name was ...`;
  const a = sentences((await ask(q)) || '', 1);
  const m = a.match(it.entity === 'place' ? /called\s+(?:the\s+)?([^.,;]{3,40})/i : /name was\s+([^.,;]{3,40})/i); if (!m) return null;
  let name = m[1].trim().replace(/["“”]/g, ''); if (it.entity === 'place' && !/^the /i.test(name) && !/'s$/.test(name)) name = 'the ' + name;
  STATS.named = (STATS.named || 0) + 1; return { name, desc: `${name}, ${it.hint.replace(/^(a|an)\s+/i, '')}` };
}
const REG = new Registry(OUT, { namer: nameNew }); REG.load(WORLD);
// what a deed set going for later (ops 'schedule'): carried out by the engine with words of its own
function scheduled(k, ev) {
  const a = A[k], who = ev.who && WORLD.people[ev.who] ? WORLD.people[ev.who] : null, pence = Math.max(0, Math.round(+ev.pence || 0));
  STATS.gmEvents = STATS.gmEvents || {}; STATS.gmEvents[ev.event] = (STATS.gmEvents[ev.event] || 0) + 1;
  if (ev.event === 'repay' && who) { if (who.money >= pence && pence > 0) { who.money -= pence; a.money += pence; remember(k, `${who.name} paid back ${money(pence)}, as promised.`, [ev.who], 3); } else remember(k, `${who.name} did not pay back the money as promised.`, [ev.who], 3); }
  else if (ev.event === 'visit' && who) { if (a.place === a.home) { who.place = a.home; who.away = false; remember(k, `${who.name} came to see ${himher(k)}, as had been arranged.`, [ev.who], 2); } }
  else if (ev.event === 'letter' && who) remember(k, `A letter came from ${who.name}.`, [ev.who], 2);
  else if (ev.event === 'court') { const fined = Math.random() < 0.5; if (fined) a.money -= 60; remember(k, fined ? `${a.short} was fined five shillings at Tower Bridge Police Court.` : `The magistrate bound ${himher(k)} over.`, ['pc'], 3); }
  else if (ev.event === 'collect' && who) { if (a.money >= pence && pence > 0) { a.money -= pence; who.money += pence; remember(k, `${who.name} called and was paid ${money(pence)}.`, [ev.who], 2); } else remember(k, `${who.name} called for ${money(pence)} and went away without it.`, [ev.who], 3); }
  else if (ev.event === 'deliver') { WORLD.add(k, /coal/i.test(ev.for || '') ? 'coal' : 'food', 2); remember(k, `What had been ordered was delivered${ev.for ? ': ' + String(ev.for).slice(0, 40) : ''}.`, [], 1); }
  else if (ev.event === 'return' && who) { const ob = Object.values(WORLD.objects).find(o => o.at === ev.who && o.lentBy === k); if (ob) { ob.at = k; remember(k, `${who.name} brought back ${ob.name}.`, [ev.who], 2); } }
  else if (ev.event === 'meet' && who) { remember(k, `${a.short} was to meet ${who.name} now.`, [ev.who], 2); if (who.place !== a.place && !who.main) { who.place = a.place; who.away = false; } }
  else if (ev.event === 'work') { if (a.busyUntil <= WORLD.t && pence > 0 && pence <= 24) { a.money += pence; a.busyUntil = WORLD.t + 120; remember(k, `${a.short} did the work ${heshe(k)} had promised${ev.for ? ' (' + String(ev.for).slice(0, 40) + ')' : ''}, and was paid ${money(pence)}.`, [], 2); } }
}
const scheduler = (w, k, ev) => { WORLD.schedule(ev.at, () => scheduled(k, ev), 'deed: ' + ev.event); };
const SECOND = /(\band\b|\bthen\b|,)\s+(then\s+)?(goes|buys|pawns|pledges|takes|gives|asks|sends|borrows|pays|lights|sits|comes|returns|fetches|puts|gets|brings|tells|writes|spends|sells|begs|calls|makes|cooks|leaves|walks|hurries|redeems|lends|minds|helps|cleans|washes|carries|orders|changes|exchanges|hands)\b/i;
const findItem = t => { const s = ' ' + (t || '').toLowerCase() + ' '; const hit = VERBS.ITEMS.find(([re]) => re.test(s)); return hit ? hit[1] : null; };
// a free sentence to a deed: the grammar first; if it cannot place the sentence, the game master
async function resolveFree(k, said) {
  const it = INTENT.parse(said); let r = it ? resolve(k, it) : null;
  const frameVerb = (VERBS.frame(said) || {}).verb;
  const several = SECOND.test(said);   // more than one deed in the sentence: the grammar would take only the first
  const unclear = several || !it || !r || (r.why && /not clear|nobody to|nothing of that kind|nowhere of that kind|not understood|no such|there is nothing|has no /.test(r.why)) || (frameVerb === 'other' && !(r && r.aff));
  if (!unclear || !GMON) return { it, r: r || { why: 'not understood' } };
  if (r && r.aff && /^d_despair/.test(r.aff.a.id)) return { it, r };
  // the open deed: the game master writes a program of primitive operations, the engine tries it, one repair round
  STATS.gmOpen = (STATS.gmOpen || 0) + 1;
  const ctx = gmCtx(k), opts = { registry: REG, sentence: said, label: said.replace(/^(she|he)\s+/i, '').replace(/\.$/, '').replace(/^./, c => c.toUpperCase()).slice(0, 110), priceFactor: (DECADE.day(SIMDATE.iso(W.day)) || {}).priceFactor || 1, scheduler };
  let g = await GM.resolve(ctx, said), lastWhy = null;
  for (let attempt = 0; attempt < 2 && g; attempt++) {
    if (!g.plausible) { STATS.gmImplausible = (STATS.gmImplausible || 0) + 1; return { it, r: { why: 'that would not be done in 1931' } }; }
    if (!g.ops.length || g.ops[0].op === 'none') { const rest = findAff(k, 'rest') || (r && r.aff) || null; return { it: it || { text: said, verb: 'rest' }, r: rest ? { aff: rest } : { why: 'nothing is done' } }; }
    const d = OPSMOD.deedOf(WORLD, k, g.ops, opts);
    if (d.despair) { const dd = VERBS.deed(WORLD, k, { verb: 'despair', goods: [], persons: [], text: said }); return { it: it || { text: said, verb: 'despair' }, r: dd }; }
    if (d.aff) { STATS.gmOpenOk = (STATS.gmOpenOk || 0) + 1; if (attempt) STATS.gmRepaired = (STATS.gmRepaired || 0) + 1; STATS.gmOps = STATS.gmOps || {}; for (const o of g.ops) STATS.gmOps[o.op] = (STATS.gmOps[o.op] || 0) + 1; return { it: it || { text: said, verb: 'gm' }, r: { aff: d.aff } }; }
    lastWhy = d.why; if (attempt === 0) g = await GM.resolve(ctx, said, d.why);
  }
  if (lastWhy) { STATS.gmOpenRefused = (STATS.gmOpenRefused || 0) + 1; return { it: it || { text: said, verb: 'gm' }, r: { why: lastWhy } }; }
  STATS.gmInterpret = (STATS.gmInterpret || 0) + 1;
  const gi = await GM.interpret(gmCtx(k), said);
  if (!gi) return { it, r: r || { why: 'not understood' } };
  if (gi.op === 'none') { const rest = findAff(k, 'rest') || (r && r.aff) || null; return { it: it || { text: said, verb: 'rest' }, r: rest ? { aff: rest } : { why: 'nothing is done' } }; }
  if (!gi.plausible) { STATS.gmImplausible = (STATS.gmImplausible || 0) + 1; return { it, r: { why: 'that would not be done in 1931 (game master)' } }; }
  const item = findItem(gi.item), f = { verb: gi.op, goods: goodsIn(gi.goods), item, persons: gi.person && (WORLD.people[gi.person] || gi.person === 'doctor') ? [gi.person] : [], place: gi.place && WORLD.places[gi.place] ? gi.place : null, amount: gi.pence || null, purpose: null,
    text: gi.item && !item ? `${heshe(k)} ${gi.op}s ${/^(her|his|the|a|an) /i.test(gi.item) ? gi.item : 'the ' + gi.item}.` : said, out: gi.place === 'pub' };
  let r2 = null; try { r2 = VERBS.deed(WORLD, k, f); } catch (e) { r2 = null; }
  if (r2 && r2.plan && A[k].place !== A[k].home) { const gh = findAff(k, 'go_home'); if (gh) { A[k].plan = { text: said, verb: gi.op }; r2 = { aff: gh }; } }
  STATS.gmMapped = (STATS.gmMapped || 0) + (r2 && r2.aff ? 1 : 0);
  return { it: it || { text: said, verb: gi.op }, r: r2 && (r2.aff || r2.why) ? r2 : { why: 'not understood' } };
}
// every few hours, or when a person keeps failing: is the person stuck, or caught in a literary pattern? the world's ordinary answer
async function gmReview(k) {
  const a = A[k]; a.gmReviewAt = WORLD.t; a.gmMiss = 0;
  const g = await GM.review({ ...gmCtx(k), pressing: WORLD.urgency(k).map(u => `${u.key} (${Math.round(u.w)})`), failures: a.gmMissTotal || 0 }); if (!g || !g.stuck || g.answer === 'none') return;
  a.gmLast = a.gmLast || {}; if (WORLD.t - (a.gmLast[g.answer] ?? -9999) < 720) return; a.gmLast[g.answer] = WORLD.t;
  STATS.gmReviews = STATS.gmReviews || {}; STATS.gmReviews[g.pattern + '>' + g.answer] = (STATS.gmReviews[g.pattern + '>' + g.answer] || 0) + 1;
  say(`   🎲 game master: ${a.short} ${g.pattern.replace('_', ' ')} → ${g.answer.replace(/_/g, ' ')}`);
  const home = () => { a.place = a.home; WORLD.people[k].place = a.home; };
  if (g.answer === 'remind_of_purse') remember(k, `${a.short} counted up what ${heshe(k)} had: ${VERBS.reckoning(WORLD, k)}`, [], 3);
  else if (g.answer === 'neighbour_calls') { const nb = k === 'ada' ? 'nolan' : k === 'arthur' ? 'edith' : 'dunn'; remember(k, `${nameOf(nb)} came and sat with ${himher(k)} a while, and talked of ordinary things.`, [nb], 2); jolt(k, 'comfort', 15); if (a.op) a.op[nb] = Math.min(2, (a.op[nb] || 0) + 0.5); }
  else if (g.answer === 'constable_speaks') { if (a.place !== a.home) { remember(k, `P.C. Dawe, on his beat, spoke kindly to ${himher(k)} and told ${himher(k)} to go home out of the cold.`, ['pc'], 2); home(); } }
  else if (g.answer === 'goes_home_to_rest') { home(); a.busyUntil = WORLD.t + 60; a.needs.energy = Math.max(0, a.needs.energy - 20); remember(k, `${a.short} went home and sat quiet a while.`, [], 1); }
  else if (g.answer === 'ask_directly_about_rent' && k === 'ada') { W['rentAsked' + W.day] = false; remember('ada', `${a.short} counted up what she had: ${VERBS.reckoning(WORLD, 'ada')}`, [], 3); }
  else if (g.answer === 'friend_offers_work' && k === 'ada') { remember('ada', 'Mrs. Nolan offered her a share of the washing she takes in: two hours at the copper tomorrow, for eightpence.', ['nolan', 'work'], 3); WORLD.schedule((W.day + 1) * 1440 + hm(14), () => { if (!F.ill_ada) { A.ada.money += 8; remember('ada', 'She did two hours of Mrs. Nolan\'s washing and was paid eightpence.', ['nolan'], 2); } }, 'washing share'); }
}
function resolve(k, it) {
  // words of self-harm are never carried out nor written down as a deed: the world answers them (hooks.despair)
  if (it.text && /\b(suicide|drown(s|ed|ing)? (her|him)self|kill(s|ed|ing)? (her|him)self|make[s]? away with (her|him)self|take[s]? (her|his) own life)\b/i.test(it.text)) { const d = VERBS.deed(WORLD, k, { verb: 'despair', goods: [], persons: [], text: it.text }); if (d && d.aff) return d; }
  if (it.text && !it._inner) {
    const f = VERBS.frame(it.text);
    if (f && f.verb !== 'other') {
      const r = VERBS.deed(WORLD, k, f);
      if (r && r.plan && A[k].place !== A[k].home) { const g = findAff(k, 'go_home'); if (g) { A[k].plan = it; return { aff: g }; } }
      if (r && (r.aff || r.why)) { STATS.deeds = STATS.deeds || {}; STATS.deeds[f.verb] = (STATS.deeds[f.verb] || 0) + 1; return r; }
    }
  }
  return resolveOld(k, it);
}
function resolveOld(k, it) {
  const a = A[k], He = heshe(k)[0].toUpperCase() + heshe(k).slice(1);
  const money_ok = c => a.money >= c || (k === 'ada' && W.credit && W.credit.barker && a.money - c > -W.credit.barker);
  switch (it.verb) {
    case 'sleep': return { aff: findAff(k, 'sleep') || mk(k, 'lie_down', 'Lie down for a while', a.home, 60, 0, () => `${a.short} lay down for a while.`, { energy: 30 }) };
    case 'eat': {
      if (!it.out) { const f = findAff(k, 'eat_home'); if (f) return { aff: f }; if (a.place !== a.home) { const g = findAff(k, 'go_home'); if (g) { a.plan = it; return { aff: g }; } } return { why: k === 'ada' && WORLD.count('ada', 'food') <= 0 ? 'there is no food in the house' : 'it is not a meal-time' }; }
      const at = nearestOf(k, A[k].place && WORLD.district(a.place) === 'bermondsey' ? ['pub', 'chandler'] : ['cookshop', 'teashop', 'pub']); const c = it.drink ? 17 : 12;
      if (!at) return { why: 'no eating-house is open now' }; if (!money_ok(c)) return { why: `${He} has not the money` };
      return { aff: mk(k, 'eat_out', `Have a chop${it.drink ? ' and a pot of beer' : ''} at ${PLACE[at].replace(/^an? /, 'the ')} (${money(c)})`, at, 45, c, () => { a.ateAt = WORLD.t; return `${a.short} ate a chop${it.drink ? ' with a pot of beer' : ''} at ${PLACE[at]}.`; }, { hunger: 60, warmth: 20 }) };
    }
    case 'buy': {
      const g = it.good, at = g.shop === 'market' && WORLD.district(a.place) !== 'bermondsey' ? 'market_islington' : g.shop;
      if (!WORLD.isOpen(at) || !WORLD.placeOpenAtArrival(at, WORLD.travel(a.place, at))) return { why: `${PLACE[at]} is shut` };
      if (!money_ok(g.price)) return { why: `${He} has only ${money(Math.max(0, a.money))} and ${g.name} costs ${money(g.price)}${k === 'ada' ? ', and Barker gives no credit without asking' : ''}` };
      return { aff: mk(k, 'buy_' + g.item, `Buy ${g.name} at ${PLACE[at].replace(/,.*$/, '')} (${money(g.price)})`, at, 15, g.price, () => { if (['food', 'coal'].includes(g.item)) WORLD.add(k, g.item, g.n); else WORLD.add(k, g.item, 1); note(k, k === 'ada' ? 'purse-book' : 'account-book', `${g.name}, ${money(g.price)}`); return `${a.short} bought ${g.name}.`; }) };
    }
    case 'pawn': {
      if (it.what === 'watch' || it.what === 'something') { const f = findAff(k, 'pawn_watch'); if (f) return { aff: f }; }
      { const item = it.what === 'something' ? ['ring', 'kettle', 'coat', 'boots'].find(x => WORLD.obj(x).at === 'ada') : it.what; const f = item ? findAff(k, 'pawn_' + item) : null; if (f) return { aff: f }; }
      if (k !== 'ada') return { why: 'a gentleman in his position does not go to the pawnbroker' };
      if (!WORLD.isOpen('pawnshop')) return { why: "Lamb's is shut" };
      const item = { boots: ['her best boots', 36], coat: ['her winter coat', 48], ring: ['her wedding ring', 60] }[it.what];
      if (!item || W['pawned_' + it.what]) return { why: 'she has nothing of that kind left to pawn' };
      return { aff: mk(k, 'pawn_' + it.what, `Pawn ${item[0]} at Lamb's for ${money(item[1])}`, 'pawnshop', 20, 0, () => { W['pawned_' + it.what] = W.day; a.money += item[1]; note('ada', 'pawn-ticket', `${item[0]} pledged for ${money(item[1])}`); remember('ada', `She pawned ${item[0]} at Lamb's for ${money(item[1])}.`, ['money'], 3); fact('ada', `What did you pawn on ${LONGDATE(W.day)}?`, [item[0].replace(/^her /, 'My '), 'My husband\'s watch', 'Nothing'], 0); return `Ada pawned ${item[0]} for ${money(item[1])}.`; }) };
    }
    case 'save': {
      if (k === 'ada') return { why: 'she has nothing to put by' };
      if (!WORLD.isOpen('post_office') && k === 'arthur') return { why: 'the post office is shut' };
      if (a.money < 120) return { why: `${He} cannot spare it` };
      return { aff: mk(k, 'save', 'Put five shillings in the Post Office Savings Bank', k === 'arthur' ? 'post_office' : a.place, 15, 60, () => { a.savings = (a.savings || 0) + 60; note(k, 'account-book', 'Post Office Savings Bank, 5s. put by'); setState('savings_' + k, [k], `${a.short} has ${money(a.savings)} in the Post Office Savings Bank`); return `${a.short} put five shillings in the savings bank.`; }) };
    }
    case 'rent': { const f = findAff(k, 'pay_rent'); return f ? { aff: f } : { why: k !== 'ada' ? 'his rent is paid on Saturdays' : F.rentDue ? 'Mr. Gedge has not called yet' : 'the rent is not due' }; }
    case 'wages': return { why: k === 'thomas' ? 'the wages are paid on Friday mornings' : 'that is not for him to do' };
    case 'redeem': { const f = findAff(k, 'redeem_watch'); return f ? { aff: f } : { why: 'there is nothing she can redeem just now' }; }
    case 'write': {
      if (a.money < 2) return { why: `${He} has not the price of a stamp` };
      const to = it.to && (WORLD.people[it.to] || it.to === 'lizzie') ? it.to : null;
      return { aff: mk(k, 'write', `Write a letter${to ? ' to ' + (to === 'lizzie' ? 'her sister Lizzie' : nameOf(to)) : ''}`, a.home, 40, 2, () => { const what = (it.text.match(/,\s*(telling|asking|saying)\b(.*)$/i) || [])[0] || ''; remember(k, `${a.short} wrote a letter${to ? ' to ' + (to === 'lizzie' ? 'Lizzie' : nameOf(to)) : ''}${what}`, to && WORLD.people[to] ? [to] : [], 2); if (to && A[to]) WORLD.schedule((W.day + 1) * 1440 + 7 * 60 + 30, () => letter(to, nameOf(k), (what.replace(/^,\s*/, '') || 'a few lines').replace(/\b(telling|asking|saying) (him|her)\b/, '$1'), [k], null), 'post'); return `${a.short} wrote a letter.`; }) };
    }
    case 'ask': case 'talk': {
      if (it.verb === 'ask' && k === 'ada') {   // requests the engine knows how to foresee
        const id = it.to === 'barker' || (/slate|tick|trust|credit/.test(it.text.toLowerCase()) && !it.to) ? 'ask_credit' : it.to === 'nolan' && it.money ? 'ask_loan_nolan' : it.to === 'relieving' || it.relief ? 'relief' : null;
        const f = id ? findAff(k, id) : null; if (f) return { aff: f };
      }
      const q = it.to && WORLD.people[it.to] && it.to !== k ? it.to : null;
      if (!q) return { why: 'there is nobody of that name about' };
      const where = whereIs(q); if (!where) return { why: `${nameOf(q)} is not to be found at this hour` };
      if (where !== a.place && !WORLD.isOpen(where)) return { why: `${PLACE[where]} is shut` };
      const topic = it.verb === 'ask' ? `asking ${himher(q)} ${it.about.replace(/^(him|her|mr\.? \w+|mrs\.? \w+)\s+/, '')}`.replace(/\.$/, '') : (it.about ? `telling ${himher(q)} ${it.about.replace(/^(him|her|\w+)\s+/, '')}`.replace(/\.$/, '') : 'what is on her mind');
      return { aff: mk(k, it.verb === 'ask' ? 'ask' : 'talk_free', `${it.verb === 'ask' ? 'Ask' : 'Speak to'} ${nameOf(q)}: ${it.text.replace(/^(he|she)\s+/i, '').slice(0, 90)}`, where, 15, 0, () => ({ talk: q, topic, request: it.verb === 'ask' ? it : null }), { social: 30 }) };
    }
    case 'give': {
      const q = it.to; if (!q || !WORLD.people[q]) return { why: 'there is nobody of that name about' };
      if (whereIs(q) !== a.place) return { why: `${nameOf(q)} is not here` };
      const amt = parseAmount(it.amount) || 12; if (!money_ok(amt)) return { why: `${He} has not ${money(amt)}` };
      return { aff: mk(k, 'give', `Give ${nameOf(q)} ${money(amt)}`, a.place, 5, amt, () => { remember(k, `${a.short} gave ${nameOf(q)} ${money(amt)}.`, [q, 'money'], 3); if (A[q]) remember(q, `${a.short} gave ${himher(q) === 'her' ? 'her' : 'him'} ${money(amt)}.`, [k, 'money'], 3); return `${a.short} gave ${nameOf(q)} ${money(amt)}.`; }) };
    }
    case 'seekwork': {
      if (k !== 'ada' && k !== 'arthur') return { why: 'he has his place' };
      if (k === 'ada' && !it._inner) { const f = findAff(k, 'seek_work'); if (f) return { aff: f }; }
      return { aff: mk(k, 'seekwork', 'Go round the offices and shops asking for more work', a.place, 120, 0, () => { if (k === 'ada' && !W.extraWork && LIFE && Math.random() < 0.12) { W.extraWork = true; F.extraWork = true; setState('extra', ['ada'], 'Ada has two extra mornings a week cleaning at a solicitor\'s in Tooley Street, 4s. a week'); remember('ada', "She found two mornings' extra cleaning a week at a solicitor's office in Tooley Street, for four shillings.", ['money', 'work'], 3); fact('ada', 'What extra work did you find this winter?', ["Cleaning at a solicitor's in Tooley Street", 'Taking in washing', 'None'], 0); return "Ada found two mornings' extra cleaning a week!"; } remember(k, `${a.short} went round asking for work, but there was nothing to be had.`, ['work'], 2); return `${a.short} asked for work but found none.`; }, {}) };
    }
    case 'work': {
      if ((it.home || /knit|sew|mend|darn|cook|fire/.test(it.text.toLowerCase())) && a.place !== a.home && !/office|finsbury/.test(it.text.toLowerCase())) { const g = findAff(k, 'go_home'); if (g) { a.plan = it; return { aff: g }; } }
      if (it.earn && k === 'ada') return { aff: mk(k, 'washing', 'Take in washing for the neighbours (two hours, about 8d.)', a.home, 120, 0, () => { a.money += 8; a.needs.energy = Math.min(100, a.needs.energy + 20); return 'Ada did a neighbour\'s washing and earned 8d.'; }) };
      return { aff: mk(k, 'housework', it.text.replace(/^(he|she)\s+/i, '').replace(/\.$/, '').replace(/^./, c => c.toUpperCase()), a.place, 60, 0, () => `${a.short} ${it.text.replace(/^(he|she)\s+/i, '').replace(/\.$/, '')}.`) };
    }
    case 'fire': { const f = findAff(k, 'light_fire'); return f ? { aff: f } : { why: k === 'ada' && WORLD.count('ada', 'coal') <= 0 ? 'there is no coal' : 'the fire is already in' }; }
    case 'read': { const f = findAff(k, 'read_paper'); return { aff: f || mk(k, 'read_book', 'Read a book by the fire', a.place, 45, 0, () => `${a.short} read for a while.`, { energy: 10 }) }; }
    case 'pray': { const f = findAff(k, 'worship'); return { aff: f || mk(k, 'pray', 'Pray quietly', a.place, 10, 0, () => `${a.short} prayed quietly.`) }; }
    case 'go': {
      const place = it.place === 'HOME' ? a.home : it.place === 'BED' ? a.home : it.place === 'PUB' ? 'pub' : it.place === 'EATOUT' ? nearestOf(k, ['cookshop', 'teashop']) : it.place;
      if (!place || !WORLD.places[place]) return { why: 'there is no such place nearby' };
      if (!WORLD.placeOpenAtArrival(place, WORLD.travel(a.place, place))) return { why: `${PLACE[place]} would be shut` };
      if (place === 'pub' && k === 'ada') return { why: 'she is chapel and never sets foot in a public-house' };
      const f = findAff(k, 'go_home'); if (place === a.home && f) return { aff: f };
      return { aff: mk(k, 'go', `Go to ${PLACE[place]}`, place, 5, 0, () => `${a.short} went to ${PLACE[place]}.`) };
    }
    case 'rest': { const f = findAff(k, 'rest'); return { aff: f || mk(k, 'wait', 'Sit and wait a while', a.place, 30, 0, () => `${a.short} sat a while.`, { energy: 10 }) }; }
    case 'walk': return { aff: mk(k, 'walk', 'Take a walk', a.place, 45, 0, () => `${a.short} took a walk.`, { social: 5 }) };
    default: if (it.verb === 'other') it.needsGM = true; return { aff: mk(k, 'own', it.text.replace(/^(he|she)\s+/i, '').replace(/\.$/, '').slice(0, 100), a.place, 60, 0, () => `${a.short} ${it.text.replace(/^(he|she)\s+/i, '').replace(/\.$/, '')}.`) };
  }
}
function parseAmount(s) { if (!s) return null; const n = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 }; const m = s.match(/(\d+|one|two|three|four|five|six|seven|ten)\s+(shillings?|pence)/); if (!m) return null; const v = +m[1] || n[m[1]]; return /shilling/.test(m[2]) ? v * 12 : v; }
// what the other person decides when asked for something: they speak for themselves (majority of three)
async function consent(q, k, it) {
  const kn = Object.values(WORLD.people[q].know || {}).filter(v => W.gossip[Object.keys(WORLD.people[q].know).find(id => WORLD.people[q].know[id] === v)]?.about === k || true).slice(-3).map(v => v.text);
  const He = isF(q) ? 'She' : 'He', who = nameOf(k), ctx = A[q] ? perceive(q, it.about) : `${clock(W.t)}, ${DAYS[W.day]}.\nCHARACTER: ${NPC[q].sheet}${kn.length ? `\nHAS HEARD: ${kn.join(' ')}` : ''}`;
  const amount = parseAmount(it.about) || (it.money ? 24 : 0);
  const what = it.money ? (q === 'barker' ? `let ${who} have goods on credit, up to ${money(Math.max(amount, 60))}` : `lend ${who} ${money(amount)}`) : it.work ? `give ${who} some extra work` : `do what ${who} asks: ${it.about}`;
  let yes = 0, no = 0, why = '';
  for (let v = 0; v < 3; v++) {
    const ans = (await ask(`${ctx}\n\n${who} has just asked ${nameOf(q)} ${it.about}\n\nDoes ${nameOf(q)} ${what}? Answer in the form: ${He} agrees, because ... or: ${He} refuses, because ...`)) || '';
    const head = ans.split(/because/i)[0];
    if (/\b(refuses?|declines?|will not|won't|cannot|can't|does not|doesn't|says no)\b/i.test(head)) no++; else if (/\b(agrees?|consents?|will|lends?|gives?|lets?|says yes)\b/i.test(head)) yes++;
    if (!why && ans) why = sentences(ans, 1);
  }
  const ok = yes > no; STATS.consents = (STATS.consents || 0) + 1;
  say(`      ⚖ ${nameOf(q)} ${ok ? 'agrees' : 'refuses'} (${yes}:${no}) ${why}`);
  if (q === 'relieving') { jolt(k, 'shock', 25);
    const destitute = A[k].money < 24 && WORLD.count(k, 'food') <= 1;
    if (ok && destitute) { F.relief = true; WORLD.add(k, 'food', 6); WORLD.add(k, 'coal', 4); setState('relief', [k], `${A[k].short} has had relief from the parish`); remember(k, 'The relieving officer gave her a food ticket and a bag of coal, after asking many questions about Bert and her earnings.', ['relieving', 'money'], 3); fact(k, `What did the relieving officer give you on ${LONGDATE(W.day)}?`, ['A food ticket and coal', 'Ten shillings in money', 'Nothing'], 0); rumour(`Mrs. Turner has had to go on the parish`, 'ada', ['relieving']); STATS.relief = (STATS.relief || 0) + 1; }
    else remember(k, `The relieving officer would give her nothing${destitute ? '' : ': she is not destitute enough, he says'}.`, ['relieving'], 3);
    return;
  }
  jolt(k, 'surprise', ok ? 25 : -25); if (!ok) jolt(k, 'shock', 20);
  if (ok && it.money) {
    if (q === 'barker') { W.credit = W.credit || {}; W.credit.barker = Math.max(amount, 60); F.creditBarker = W.credit.barker; setState('credit', ['ada'], `Barker lets Ada have goods on tick up to ${money(W.credit.barker)}`); remember(k, `Mr. Barker agreed to let her have goods on credit, up to ${money(W.credit.barker)}.`, ['barker', 'money'], 3); }
    else if (WORLD.people[q].money === undefined || WORLD.people[q].money >= amount || !A[q]) { WORLD.pay(q, k, amount); if (q === 'nolan') F.owesNolan = true; (W.debts = W.debts || []).push({ from: k, to: q, amount, day: W.day }); setState('debt_' + q, [k], `${A[k].short} owes ${nameOf(q)} ${money(amount)}`); remember(k, `${nameOf(q)} lent ${himher(k)} ${money(amount)}.`, [q, 'money'], 3); fact(k, `Who lent you money on ${LONGDATE(W.day)}?`, [nameOf(q).replace(/^young /, ''), 'Nobody', 'Mr. Thomas'], 0); }
  } else if (ok && it.goods && it.goods.length) { WORLD.add(k, 'food', 1); remember(k, `${nameOf(q)} let ${himher(k)} have what ${heshe(k)} asked for.`, [q], 2); }
  else if (ok && it.wait && q === 'gedge') { F.rentDue = false; F.rentOwing = true; remember(k, 'Mr. Gedge agreed to wait for the rent till Monday.', ['gedge', 'rent'], 3); }
  else if (ok) remember(k, `${nameOf(q)} agreed: ${why}`, [q], 3);
  if (!ok && q === 'barker') F.creditRefusedDay = W.day;
  else remember(k, `${nameOf(q)} refused ${himher(k)}: ${why}`, [q], 3);
  if (A[q]) remember(q, `${who} asked ${himher(q)} ${it.about}; ${heshe(q)} ${ok ? 'agreed' : 'refused'}.`, [k], 3);
}
// weighty moments: several thoughts, merged by the world, the person chooses among its own ideas
// (self-consistency: agreement is taken as confidence; the merging is done by the engine, because talkie reads
// a list of its own long sentences poorly; the final pick is among short, checked labels)
async function deliberate(k, N = 3) {
  const a = A[k], He = heshe(k)[0].toUpperCase() + heshe(k).slice(1);
  const ctx = openContext(k), ideas = new Map(), refused = [];
  for (let i = 0; i < N; i++) {
    const ans = await ask(`${ctx}\n\nWhat does ${a.short} do now, as ${heshe(k)} truly would? Answer in the form: ${He} ... (one sentence)`);
    const said = sentences(ans || '', 1); if (!said) continue; const rf = await resolveFree(k, said), it = rf.it, r = rf.r; if (!it) continue;
    if (r.why) { a.gmMiss = (a.gmMiss || 0) + 1; a.gmMissTotal = (a.gmMissTotal || 0) + 1; refused.push(`${said.replace(/^(he|she)\s+/i, '').replace(/\.$/, '')}, but ${r.why}`); continue; }
    const key = r.aff.a.id + '|' + r.aff.label; const e = ideas.get(key) || { aff: r.aff, n: 0, said }; e.n++; ideas.set(key, e);
  }
  STATS.deliberations = (STATS.deliberations || 0) + 1;
  for (const x of refused.slice(0, 1)) remember(k, `${a.short} thought of trying to ${x.replace(/^./, c => c.toLowerCase())}.`, [], 1);
  let list = [...ideas.values()].sort((x, y) => y.n - x.n);
  if (!list.length) return null;
  if (list.some(x => x.aff.a.id === 'd_despair')) { const dsp = list.find(x => x.aff.a.id === 'd_despair'); if (dsp.n < Math.ceil(N * 0.6) && list.length > 1) list = list.filter(x => x !== dsp); }
  if (list.length === 1 || list[0].n >= Math.ceil(N * 0.6)) { STATS.agreed = (STATS.agreed || 0) + 1; return { aff: list[0].aff, said: `${list[0].said} (${list[0].n} of ${N} thoughts agree)` }; }
  const order = list.map((_, i) => i).sort(() => Math.random() - 0.5);
  const labels = order.map(i => list[i].aff.label.replace(/ \(\d+ minutes' walk\)$/, ''));
  // foresight from the world (best in the reasoning test: 11/18 sensible, the found coin 3/3 returned): each of her own
  // ideas with what would come of it by this time tomorrow, worked out by rolling a copy of the world on
  const fore = order.map(i => { const af = list[i].aff; if (af.a.free) return ''; try { const r = WORLD.rollout(k, af.label, 24); return r ? `then: ${consequenceWords(k, r)}` : ''; } catch (e) { return ''; } });
  const ans = await ask(`${perceive(k, labels.join(' '))}\n\n${a.short} turns over in ${hisher(k)} mind what ${heshe(k)} might do, and what would come of it:\n${labels.map((l, j) => `(${L[j]}) ${l}${fore[j] ? ` (${fore[j]})` : ''}`).join('\n')}\n\nWhich does ${heshe(k)} do? Answer in the form: ${He} chooses to ..., because ...`);
  STATS.foresight = (STATS.foresight || 0) + 1;
  const j = pick(ans, labels); const chosen = j === null ? list[0] : list[order[j]];
  STATS.pickedOwn = (STATS.pickedOwn || 0) + (j === null ? 0 : 1);
  return { aff: chosen.aff, said: j === null ? `${chosen.said} (most thoughts)` : sentences(ans, 1) };
}
function consequenceWords(k, r) {   // a rollout in plain words: money by tomorrow, the rent, warmth and hunger
  const out = [`${money(Math.max(0, r.money))}${r.money < 0 ? ' and in debt' : ''} by tomorrow`];
  if (k === 'ada') out.push(r.flags.rentDue ? 'the rent not settled' : r.flags.rentOwing ? 'the rent owing' : 'the rent paid');
  if (r.needs.warmth > 55) out.push('cold'); if (r.needs.hunger > 65) out.push('hungry'); if (r.flags.dismissed) out.push('her place lost');
  return out.join(', ');
}
function openContext(k) {
  const a = A[k];
  const usual = WORLD.affordances(k).filter(x => x.habit && !['rest', 'sleep'].includes(x.a.id)).slice(0, 2).map(x => x.label.replace(/ \(\d+ minutes' walk\)$/, ''));
  const near = [...WORLD.presentWith(k).map(p => nameOf(p.id))].slice(0, 4);
  const openNear = Object.keys(WORLD.places).filter(id => id !== a.place && WORLD.travel(a.place, id) <= 10 && WORLD.isOpen(id) && !/home/.test(WORLD.places[id].kind)).map(id => PLACE[id]).slice(0, 4);
  return `${perceive(k, '')}${usual.length ? `\nUSUALLY AT THIS HOUR: ${usual.join('; ')}.` : ''}\nAT HAND: ${near.length ? near.join(', ') + ' here; ' : ''}${openNear.length ? 'open near by: ' + openNear.join('; ') : 'nothing open near by'}.`;
}
// one open question: what does this person do now? Returns an affordance, or null (then the list is used)
async function openChoice(k) {
  const a = A[k], He = heshe(k)[0].toUpperCase() + heshe(k).slice(1), needs = WORLD.needWords(k);
  const near = [...WORLD.presentWith(k).map(p => nameOf(p.id))].slice(0, 4);
  const openNear = Object.keys(WORLD.places).filter(id => id !== a.place && WORLD.travel(a.place, id) <= 10 && WORLD.isOpen(id) && !/home/.test(WORLD.places[id].kind)).map(id => PLACE[id]).slice(0, 4);
  const usual = WORLD.affordances(k).filter(x => x.habit && !['rest', 'sleep'].includes(x.a.id)).slice(0, 2).map(x => x.label.replace(/ \(\d+ minutes' walk\)$/, ''));
  const ctx = `${perceive(k, '')}${usual.length ? `\nUSUALLY AT THIS HOUR: ${usual.join('; ')}.` : ''}\nAT HAND: ${near.length ? near.join(', ') + ' here; ' : ''}${openNear.length ? 'open near by: ' + openNear.join('; ') : 'nothing open near by'}.`;
  const ans = await ask(`${ctx}\n\nWhat does ${a.short} do now, as ${heshe(k)} truly would? Answer in the form: ${He} ... (one sentence)`);
  STATS.open = (STATS.open || 0) + 1;
  const said1 = sentences(ans || '', 1); if (!said1) { STATS.openEmpty = (STATS.openEmpty || 0) + 1; return null; }
  const rf = await resolveFree(k, said1), it = rf.it, r = rf.r;
  if (!it) { STATS.openEmpty = (STATS.openEmpty || 0) + 1; return null; }
  if (r.why) a.gmMiss = (a.gmMiss || 0) + 1;
  if (r.why) { STATS.openRefused = (STATS.openRefused || 0) + 1; remember(k, `${a.short} meant to ${it.text.replace(/^(he|she)\s+/i, '').replace(/\.$/, '')}, but ${r.why}.`, [], 1); say(`   ${a.short} wants: "${sentences(ans, 1)}" — but ${r.why}.`); return null; }
  if (it.needsGM && !(await plausible(k, sentences(ans, 1)))) { say(`   ${a.short} would not do that in 1931 (game master): "${sentences(ans, 1)}"`); return null; }
  STATS.openUsed = (STATS.openUsed || 0) + 1; STATS.openVerbs = STATS.openVerbs || {}; STATS.openVerbs[it.verb] = (STATS.openVerbs[it.verb] || 0) + 1;
  return { aff: r.aff, said: sentences(ans, 1) };
}

const BIO = require('./bio1931.js');
function bio(k, query) {   // one or two facts of a life, by the matter in hand; a different one each time otherwise
  const q = new Set(words(query)); const xs = BIO[k].map(([t, v], i) => ({ v, sc: words(t).filter(w => q.has(w)).length * 2 + words(v).filter(w => q.has(w)).length * 0.3 + ((i + W.day + Math.floor(W.t / 60)) % BIO[k].length === 0 ? 0.5 : 0) })).sort((a, b) => b.sc - a.sc);
  return xs.slice(0, 2).map(x => x.v).join(' ');
}
function scene(k) {   // what the place is like just now: the senses, the fire, what the others are doing
  const a = A[k], pl = a.place, wx = LIFEMOD.weatherOf(W.day), cold = WORLD.warmthOf(pl), out = [];
  if (pl === 'ada_home') out.push(F.fire_ada_home > WORLD.t ? 'The fire is burning in the grate.' : cold < 30 ? `The fire is out; the room is bitterly cold${wx.tmin < 0 ? ', with frost on the inside of the window' : ''}.` : 'The fire is out.', WORLD.count('ada', 'food') <= 0 ? 'The cupboard is bare.' : `There is food in the cupboard for ${WORLD.count('ada', 'food')} meal${WORLD.count('ada', 'food') > 1 ? 's' : ''}.`, WORLD.count('ada', 'coal') <= 0 ? 'The coal-box is empty.' : '');
  else if (pl === 'office') out.push('Pens scratch; the gas is lit against the gloom.', WORLD.people.fenn.place === 'office' ? 'Young Fenn is copying letters, whistling under his breath.' : '');
  else if (WORLD.places[pl] && ['market', 'park', 'work'].includes(WORLD.places[pl].kind)) out.push(wx.rain > 1 ? 'It is wet underfoot.' : wx.tmin < 0 ? 'The ground is iron-hard with frost.' : '', /fog/.test(wx.words) ? 'A yellow fog hangs in the street.' : '');
  else if (pl === 'arthur_home') out.push(F.joanIll ? 'Joan is in bed upstairs, coughing.' : WORLD.people.joan.place === 'arthur_home' ? 'Joan is playing by the fire.' : '', F.brayVisiting ? 'Mrs. Bray is knitting in the best chair.' : '');
  else if (pl === 'thomas_home') out.push(WORLD.people.dunn.place === 'thomas_home' ? 'Mrs. Dunn is about the house.' : 'The house is quiet.');
  if (['pawnshop', 'chandler', 'market'].includes(pl)) for (const n of STREET.presentAt(pl, W.day, WORLD.mod)) out.push(`${n.name} from the Buildings is here, ${n.doing}.`);
  if (CHRONOS.isDark(W.day, WORLD.mod)) out.push(pl === 'ada_home' ? (F.gas_ada_home > WORLD.t ? 'The gas is lit.' : 'It is dark but for the fire; there is no penny in the meter.') : WORLD.places[pl] && !/home|office|shop|cafe|pub/.test(WORLD.places[pl].kind) ? 'The street-lamps are lit.' : '');
  if (WORLD.fogFactor >= 1.5 && WORLD.places[pl] && !/home|office|shop|cafe|pub/.test(WORLD.places[pl].kind)) out.push('The fog is so thick one can hardly see across the street; the lamps are lit at midday and the trams crawl.');
  if (DOW(W.day) === 'sat' && CHRONOS.homeGame(W.day, 'Arsenal') && WORLD.mod >= 13 * 60 && WORLD.mod < 17 * 60 + 30 && WORLD.places[pl] && WORLD.places[pl].district === 'highbury') out.push('The streets are thick with people going to the Arsenal.');
  return out.filter(Boolean).join(' ');
}
function household(k) {   // the people one lives for, wherever they are
  const out = [];
  if (k === 'ada') out.push(F.ill_bert ? 'Bert is ill in bed.' : F.bertWork ? 'Bert is in work at the docks.' : `Bert has been out of work${W.bertOutSince !== undefined ? ` since ${SHORTDATE(W.bertOutSince)}` : ''}.`);
  if (k === 'arthur') out.push(F.joanIll ? 'Joan is ill.' : '', F.ill_edith ? 'Edith is ill.' : '', `Edith has ${F['hk_' + (W.day - ((new Date(T0 + W.day * 864e5).getUTCDay() + 2) % 7))] ? '' : 'not yet '}had this week's housekeeping.`);
  if (k === 'thomas') out.push('He lives alone with his housekeeper.');
  return out.filter(Boolean).join(' ');
}
function presentAt(k) { return Object.keys(A).filter(o => o !== k && !A[o].away && A[o].place && A[o].place === A[k].place); }
const KEYACT = /half-crown|^Give Edith|^Buy |Pay Mr\. Gedge|Pawn|Redeem|Fetch Dr\.|rent/;
// one decision: the engine offers what can be done here and now, ranked by need and habit; talkie chooses
async function act(k) {
  const a = A[k]; WORLD.mover = k;
  if (GMON && ((a.gmMiss || 0) >= 2 || WORLD.t - (a.gmReviewAt ?? WORLD.t - 999) >= 360)) { try { await gmReview(k); } catch (e) { STATS.gmErrors = (STATS.gmErrors || 0) + 1; } }
  for (const p of presentAt(k)) if (!a.metToday.has(p)) await greet(k, p);
  for (const o of a.obs.splice(0)) if (!/came in|left\./.test(o.text)) remember(k, `(Seen) ${o.text}`, [], 1);
  const all = WORLD.affordances(k);
  const opts = all.slice(0, 6); if (!opts.length) { a.busyUntil = WORLD.t + 15; return; }
  let o, thought = '', tally = null, raws = [];
  // talkie is asked only at real forks (after Lyfe Agents): money, people present, or a close call between
  // different things; routine steps and idling run on habit, chosen by the engine
  // a real fork (asked openly) only when something is at stake; otherwise habit runs on (System 1), as in life:
  //  money matters in view; a pressing need the usual step does not answer; someone who matters newly present;
  //  or free time (about every two hours of idling) to do something of one's own
  const urg = WORLD.urgency(k)[0], habitStep = opts.find(x => x.habit);
  const unanswered = urg && urg.w >= 70 && !(habitStep && ((urg.key === 'hunger' && /eat|lunch/.test(habitStep.a.id)) || (urg.key === 'tired' && /sleep|rest/.test(habitStep.a.id)) || (urg.key === 'work' && /clean|desk|chief|finsbury/.test(habitStep.a.id)) || (urg.key === 'cold' && /fire/.test(habitStep.a.id))));
  const someone = opts.some(x => x.a.id === 'talk' && (A[x.x] || (() => { const t = topicFor(k, x.x); return !!(t.resolve || t.fact); })()));
  const visitor = k === 'ada' && W.visitor && !W.visitor.asked && (W.visitor.asked = true);   // a neighbour at the door is a fork
  const fork = opts.some(x => KEYACT.test(x.label)) || unanswered || someone || visitor || (a.sinceAsked || 0) >= 8;
  // no list from the engine: at a fork the person is asked openly (several thoughts at weighty moments, one otherwise);
  // the engine only checks what is possible. If nothing usable comes, they do the usual thing (habit, System 1).
  let freeAct = null;
  if (a.plan && a.place === a.home && !FAKE) { const it = a.plan; a.plan = null; const r = resolve(k, it); if (r.aff) { freeAct = { aff: r.aff, said: `(as she meant to) ${it.text}`.replace('she meant', `${heshe(k)} meant`) }; STATS.plans = (STATS.plans || 0) + 1; } }
  const weighty = opts.some(x => KEYACT.test(x.label)) || (urg && urg.w >= 80) || a.chem.stress > 75;
  if (fork && !FAKE && !freeAct) {
    try { freeAct = weighty && !impulsive(k) ? await deliberate(k) : await openChoice(k); } catch (e) { freeAct = null; }
    if (!freeAct) { STATS.openRetry = (STATS.openRetry || 0) + 1; try { freeAct = await openChoice(k); } catch (e) { freeAct = null; } }
  }
  const usual = () => opts.find(x => x.habit) || opts.find(x => x.a.id === 'rest') || opts[0];
  if (freeAct) { o = freeAct.aff; thought = `(in ${hisher(k)} own words) ${freeAct.said}`; a.sinceAsked = 0; STATS.choices++; }
  else { o = usual(); thought = fork && !FAKE ? '(no clear thought; does the usual thing)' : ''; if (fork && !FAKE) STATS.unreadable++; a.sinceAsked = (a.sinceAsked || 0) + 1; STATS.autoChoices = (STATS.autoChoices || 0) + 1; }
  const weightyAct = !!freeAct && (KEYACT.test(o.label) || /^(ask|give|pawn_|seekwork)/.test(o.a.id));
  // the engine judges every real decision by rolling a copy of the world on for a day (thousands of situations, no hand labels)
  if (fork && !FAKE && !off('judge')) { try {
    const t0 = Date.now(), j = WORLD.judge(k, 24); const known = j.all.find(r => r.label === o.label) || (o.a.free ? null : WORLD.rollout(k, o.a.id, 24));
    const rec = { day: W.day, t: W.t, who: k, mode: freeAct ? (thought.includes('thoughts agree') || thought.includes('most thoughts') ? 'deliberate' : 'open') : 'habit', urgent: j.urgent.slice(0, 2).map(u => u.key), chosen: o.label.slice(0, 90), chosenScore: known ? known.after : null, best: j.best && j.best.label.slice(0, 90), bestScore: j.best && j.best.after, worstScore: j.worst && j.worst.after, n: j.all.length, ms: Date.now() - t0 };
    if (known && j.best && j.worst) { rec.regret = +(j.best.after - known.after).toFixed(1); rec.rel = j.best.after === j.worst.after ? 1 : +((known.after - j.worst.after) / (j.best.after - j.worst.after)).toFixed(2); }
    METRICS.decisions = METRICS.decisions || []; METRICS.decisions.push(rec); STATS.judged = (STATS.judged || 0) + 1;
  } catch (e) { STATS.judgeErrors = (STATS.judgeErrors || 0) + 1; } }
  if (weightyAct && !FAKE && impulsive(k)) STATS.impulsive = (STATS.impulsive || 0) + 1;
  if (weightyAct && !FAKE && !impulsive(k)) {
    const He2 = heshe(k)[0].toUpperCase() + heshe(k).slice(1);
    const second = (await ask(`${perceive(k, o.label)}\n\n${a.short} has made up ${hisher(k)} mind to: ${o.label.replace(/ \(\d+ minutes' walk\)$/, '')}. Before doing it, ${heshe(k)} thinks what may come of it, and whether ${heshe(k)} would be sorry. Answer in the form: ${He2} goes through with it, because ... or: ${He2} thinks better of it, because ...`)) || '';
    STATS.secondThoughts = (STATS.secondThoughts || 0) + 1;
    if (/thinks better|changes (his|her) mind|does not|decides against|holds back/i.test(second.split(/because/i)[0])) {
      STATS.vetoes = (STATS.vetoes || 0) + 1; const why = sentences(second, 1);
      remember(k, `${a.short} was about to ${o.label.replace(/ \(.*$/, '').replace(/^./, c => c.toLowerCase())}, but thought better of it: ${why.replace(/^.*?because\s*/i, '')}`, [], 2);
      say(`   ${a.short} thinks better of it: ${why}`);
      let alt = null; try { const again = await openChoice(k); if (again && again.aff.label !== o.label) { alt = again.aff; thought += ` / instead: ${again.said}`; } } catch (e) {}
      o = alt || usual();
    }
  }
  say(`   ${a.short} [${clock(WORLD.mod)} at ${PLACE[a.place].replace(/^the /, '')}]${thought ? ' thinks: ' + thought : ' (as usual)'}`);
  say(`      → ${o.label}${tally ? ' ' + JSON.stringify(tally) : ''}`);
  const before = a.mem.length;
  const res = WORLD.perform(k, o);
  if (['worship', 'pray'].includes(o.a.id)) jolt(k, 'comfort', 15); if (o.a.id === 'sleep') { a.chem.arousal = 10; }
  let result = res;
  if (res && res.talk) { if (res.verb && res.verb !== 'talk') res.topic = `${res.verb === 'quarrel' ? 'a quarrel' : res.verb === 'comfort' ? 'comforting' : res.verb === 'apologise' ? 'an apology' : res.verb === 'thank' ? 'thanks' : res.verb === 'warn' ? 'a warning' : 'a promise'}: ${res.topic}`; const t = res.topic ? { topic: res.topic } : (W.topicCache || {})[k + '>' + res.talk] || topicFor(k, res.talk); result = await converse(k, { to: res.talk, ...t }); if (res.request) await consent(res.talk, k, res.request); }
  else if (res && res.book) result = await bookWork(res.book);
  else if (res && res.lookup) result = await lookupBook(k, res.lookup);
  if (REG.pending.length) { const made = await REG.nameNew(WORLD); for (const it of made) say(`      ✚ new in the world: ${it.name} (${it.entity}, ${it.kind}${it.district ? ', ' + it.district : ''})`); STATS.created = (STATS.created || 0) + made.length; }
  if (typeof result !== 'string') result = `${a.short}: ${o.label}.`;
  say(`      ⇒ ${result}`);
  if (!(res && res.talk)) { if (a.mem.length === before && !/rested|had a meal|went to bed|went home/.test(result)) remember(k, result, presentAt(k)); for (const p of presentAt(k)) remember(p, `(Seen) ${result}`, [k], 1); }
  TRACE.push({ day: W.day, time: clock(WORLD.mod), agent: k, place: a.place, thought, options: opts.map(x => [x.label, +x.u.toFixed(1)]), raw: raws, tally, choice: o.label, result });
}
// duties: direct questions asked of one person at a fixed moment (pay-day, the rise, the successor)
async function interrupts(d, t) {
  const w = DOW(d);
  // the collector at the door: from seven o'clock while the rent is due and she is at home, he must be answered
  if (F.rentDue && !W.rentPaid[d] && !W['rentAsked' + d] && t >= hm(19) && t <= hm(20, 30) && A.ada.place === 'ada_home') {
    W['rentAsked' + d] = true;
    const weeks = 1 + (F.rentOwing ? (W.rentOwingCount || 1) : 0), due = 84 * weeks, has = A.ada.money;
    const r = await duty('ada', `Mr. Gedge, the landlord's collector, is at the door for the rent: ${weeks > 1 ? `${weeks} weeks, ${money(due)} in all, with the arrears` : 'the week\'s seven shillings'}. She has ${money(Math.max(0, has))} in her purse.`, `pays him`, `asks him to wait`, 'pay');
    if (r.yes && has >= due) { A.ada.money -= due; payRent(true); W.rentOwingCount = 0; WORLD.people.gedge && (WORLD.people.gedge.money = (WORLD.people.gedge.money || 0) + due); say(`   🏠 Ada pays Mr. Gedge ${money(due)}.`); }
    else if (r.yes && has >= 84) { A.ada.money -= 84; payRent(false); W.rentOwingCount = Math.max(1, weeks - 1); remember('ada', `She paid Mr. Gedge seven shillings off what she owes; the rest is to wait till Monday.`, ['gedge', 'rent'], 3); say('   🏠 Ada pays part of the rent.'); }
    else { payRent(false); say(`   🏠 Ada asks Mr. Gedge to wait${has >= due ? ' (though she has the money)' : ''}.`); if (weeks >= 3) { remember('ada', 'Mr. Gedge said that if the arrears are not cleared by next week the landlord will give her notice to quit.', ['gedge', 'rent'], 3); } }
  }
  // nobody cleaned the office this morning / Mr. Hale did not come in: Mr. Thomas notices, and may act
  if (!['sun'].includes(w) && t === hm(9, 15) && A.thomas.place === 'office' && !F.adaDismissed && A.ada.cleanedDay !== d && !F.ill_ada) {
    W.missedClean = (W.missedClean || 0) + 1; remember('thomas', `The office was not cleaned this morning; Mrs. Turner did not come (${W.missedClean} time${W.missedClean > 1 ? 's' : ''} this winter).`, ['ada'], 3); say(`   ✶ The office is not cleaned: Mrs. Turner did not come (${W.missedClean}).`);
    if (W.missedClean >= 2 && !W['warned' + W.missedClean]) {
      W['warned' + W.missedClean] = true;
      const r = await duty('thomas', `Mrs. Turner, the charwoman, has failed to come and clean the office ${W.missedClean} times this winter without a word of excuse. Does Mr. Thomas give her notice and find another charwoman?`, 'gives her notice', 'gives her one more chance', 'gives her notice');
      if (r.yes) { jolt('ada', 'shock', 50); jolt('ada', 'surprise', -40); F.adaDismissed = true; rumour('Mrs. Turner has lost her place at the Moorgate insurance office', 'ada', ['thomas', 'fenn']); setState('job', ['ada', 'thomas', 'arthur'], 'Mrs. Turner has been given notice at the Moorgate office'); remember('ada', 'Mr. Thomas has given her notice: she has lost her place cleaning the Moorgate office, twelve shillings a week.', ['thomas', 'money', 'work'], 3); remember('thomas', 'He gave Mrs. Turner notice for not coming to clean.', ['ada'], 3); fact('ada', 'Why did you lose your place at the Moorgate office?', ['I missed coming to clean', 'The office closed', 'I gave notice myself'], 0); say('   ✶ Mrs. Turner is given notice at the Moorgate office.'); }
      else remember('ada', "Mr. Thomas sent word that she must not miss the office again, or she will lose her place.", ['thomas', 'work'], 3);
    }
  }
  if (!['sat', 'sun'].includes(w) && t === hm(10) && A.thomas.place === 'office' && A.arthur.place !== 'office' && !F.ill_arthur) { W.missedArthur = (W.missedArthur || 0) + 1; remember('thomas', `Mr. Hale has not come in this morning, without a word (${W.missedArthur}).`, ['arthur'], 3); A.thomas.op.arthur = Math.max(-2, (A.thomas.op.arthur || 0) - 1); say(`   ✶ Arthur is missing from the office (${W.missedArthur}).`); }
  if (w === 'fri' && t === hm(8, 30) && A.ada.place === 'office' && !W.paid['ada' + d] && !F.adaDismissed) {
    const payer = A.thomas.place === 'office' ? 'thomas' : A.arthur.place === 'office' ? 'arthur' : null;
    if (payer) {
      const r = await duty(payer, `It is Friday, pay-day. Mrs. Turner, the charwoman, is here; her week's wages of twelve shillings are due, and she needs them for her rent.${payer === 'arthur' ? " Mr. Thomas is away ill, and has left the wages in Mr. Hale's charge." : ''} Does ${A[payer].name} pay Mrs. Turner her wages now?`, 'pays her now', 'does not pay her now', 'pay');
      if (r.yes) { jolt('ada', 'relief', 15); W.paid['ada' + d] = true; A.ada.money += 144; note(payer, 'wages-book', 'Mrs. Turner, charwoman, paid 12s.'); remember('ada', `${A[payer].name} paid her the week's wages, twelve shillings.`, [payer, 'money'], 2); remember(payer, "He paid Mrs. Turner her week's wages.", ['ada'], 2); }
      else { remember('ada', `${A[payer].name} did not pay her wages this Friday.`, [payer, 'money'], 3); fact('ada', `Were you paid your wages at the insurance office on ${LONGDATE(d)}?`, ['Yes', 'No'], 1); }
    }
  }
  // the pay envelope: handed out from half past four on Friday; if he has gone, it waits for him in the office till Saturday dinner-time
  const payday = w === 'fri' ? d : w === 'sat' ? d - 1 : null;
  if (payday !== null && ((w === 'fri' && t >= hm(16, 30)) || (w === 'sat' && t <= hm(13))) && !W.paid['arthur' + payday] && A.arthur.place === 'office') { W.paid['arthur' + payday] = true; F['paid_arthur_' + payday] = true; A.arthur.money += W.wage; note('arthur', 'account-book', `wages received, ${money(W.wage)}`); remember('arthur', `He was paid his week's wages, ${money(W.wage)}`, ['thomas', 'money'], 2); say(`   (Wages: Arthur receives ${money(W.wage)})`); }
  if (d === 0 && t === hm(9) && !W.ledger.assigned) { W.ledger.assigned = true; remember('arthur', 'Mr. Thomas set him to balance the quarterly ledger.', ['thomas', 'ledger'], 3); remember('thomas', 'He set Mr. Hale to balance the quarterly ledger.', ['arthur', 'ledger'], 3); say('   (Mr. Thomas sets Arthur to the quarterly ledger.)'); }
  if (d === 10 && t === hm(17) && W.auditDue && !W.audit.verdict) say(`   (The auditors examine the books.) ${verdict('audit')}`);
  if (d === 11 && t === hm(9) && W.audit.verdict && W.audit.raise === null && A.thomas.place === 'office') {
    const r = await duty('thomas', `The auditors have found Mr. Hale's books ${W.audit.verdict}. Mr. Hale has served the company faithfully for ten years at £3 10s. a week. Does Mr. Thomas recommend him to the directors for a rise of five shillings a week?`, 'recommends him', 'does not recommend him', 'recommend');
    W.audit.raise = r.yes; note('thomas', 'office diary', r.yes ? 'recommended Mr. Hale for a rise of 5s. a week' : 'did not recommend Mr. Hale for a rise');
    if (r.yes) { remember('arthur', 'Mr. Thomas told him he would recommend him for a rise of five shillings a week, from February.', ['thomas', 'money'], 3); remember('thomas', 'He recommended Mr. Hale for a rise.', ['arthur'], 3); fact('arthur', 'What did Mr. Thomas tell you after the audit?', ['He would recommend me for a rise', 'He would dismiss me', 'Nothing'], 0); }
    else fact('arthur', 'What did Mr. Thomas tell you after the audit?', ['He would recommend me for a rise', 'He would dismiss me', 'Nothing'], 2);
  }
  if (d === 84 && t === hm(9) && W.retire && W.successor === undefined && A.thomas.place === 'office') {
    const r = await duty('thomas', `Mr. Thomas must now recommend his successor as chief clerk: either Mr. Hale, who has served ten years (his audit books were ${W.audit.verdict || 'not examined'}; Mr. Thomas ${opinionWords('thomas', 'arthur')} him), or Mr. Pike, an experienced clerk from the Leeds branch whom he hardly knows. Does Mr. Thomas recommend Mr. Hale?`, 'recommends Mr. Hale', 'recommends Mr. Pike instead', 'recommends Mr\\.? Hale');
    W.successor = r.yes ? 'arthur' : 'pike'; setState('successor', ['arthur', 'ada', 'thomas'], r.yes ? 'Mr. Hale is recommended as the next chief clerk' : 'Mr. Pike of Leeds is recommended as the next chief clerk');
    for (const k of ['arthur', 'thomas', 'ada']) remember(k, r.yes ? 'Mr. Thomas has recommended Mr. Hale to succeed him as chief clerk.' : 'Mr. Thomas has recommended Mr. Pike of the Leeds branch to succeed him as chief clerk.', ['thomas', 'arthur'], 3);
    fact('arthur', 'Whom did Mr. Thomas recommend as the next chief clerk?', ['Me', 'Mr. Pike of the Leeds branch', 'Nobody yet'], r.yes ? 0 : 1);
  }
}
async function ensureBrowser() {   // a long run must survive a crashed browser
  if (FAKE || LOCAL || (browser && browser.isConnected())) return;
  STATS.relaunch = (STATS.relaunch || 0) + 1; POOL.length = 0;
  const { chromium } = require('playwright'); const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  browser = await chromium.launch({ proxy }); say('   (browser relaunched)');
}
// ======================= main: a day in steps of a quarter of an hour =======================
(async () => {
  if (!FAKE && !LOCAL) { const { chromium } = require('playwright'); const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined; browser = await chromium.launch({ proxy }); }
  const N = Math.min(+(process.env.DAYS || ND), ND), STEP = 15;
  for (let d = 0; d < N; d++) {
    W.day = d; W.t = 0; WORLD.t = d * 1440 + hm(6); for (const k in A) { A[k].metToday = new Set(); if (A[k].busyUntil > d * 1440 + hm(6, 15)) A[k].busyUntil = d * 1440 + hm(6, 15); A[k].place = A[k].home; }
    say(`\n######## ${DAYS[d]}${HOL[d] ? ' — ' + HOL[d] : ''} (${WEATHER[d]}) ########`);
    const asks0 = STATS.asks;
    if (d === 0) for (const k in A) await formative(k);
    await ensureBrowser();
    try { const t0 = Date.now(); await Promise.race([FETCH.ensure(SIMDATE.iso(d)), new Promise(r => setTimeout(r, 120000))]); STATS.fetchMs = (STATS.fetchMs || 0) + Date.now() - t0; } catch (e) { STATS.fetchErrors = (STATS.fetchErrors || 0) + 1; }
    FETCH.prefetch([1, 2, 3].map(k => SIMDATE.iso(d + k)));
    morningEvents(); letters();
    W.t = hm(6); try { await morningProbes(); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; await ensureBrowser(); }
    for (let t = hm(6, 15); t <= hm(23); t += STEP) {
      WORLD.t = d * 1440 + t; W.t = t;
      WORLD.runDue(); WORLD.stepBackground(); WORLD.decay(STEP); dueMoney(t); institutions(t); npcGossip(); for (const k in A) chemStep(k, STEP); neighbourAtDoor(t);
      POS.push([d, t, Object.fromEntries(Object.values(WORLD.people).filter(p => p.place && !p.away).map(p => [p.id, p.place]))]);
      await interrupts(d, t);
      const idle = Object.keys(A).filter(k => A[k].busyUntil <= WORLD.t);
      if (t >= hm(23)) { for (const k of idle) { A[k].busyUntil = (d + 1) * 1440 + hm(6, 15); A[k].needs.energy = 20; say(`   (${A[k].short} drops off to sleep at last.)`); } break; }
      const groups = {}; for (const k of idle) (groups[A[k].place] = groups[A[k].place] || []).push(k);
      await Promise.all(Object.values(groups).map(async ks => {
        for (const k of ks) {
          const before = A[k].mem.length;
          try { await act(k); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; say(`   !! error in ${k}'s turn: ${String(e.stack || e.message).slice(0, 200)}`); A[k].busyUntil = WORLD.t + 15; await ensureBrowser(); }
          const setback = A[k].mem.slice(before).map(x => x.text).find(x => /wrong figure|not finished|no extra work|would not lend|grumbled|stay at his work|on tick/i.test(x));
          const kind = setback && setback.match(/wrong figure|not finished|no extra work|would not lend|grumbled|stay at his work|on tick/i)[0];
          if (setback && !A[k].done['lesson' + d + kind]) { A[k].done['lesson' + d + kind] = true; await lesson(k, setback); }
          if (W.pendingLesson) { const [who, what] = W.pendingLesson; W.pendingLesson = null; await lesson(who, what); }
        }
      }));
    }
    try { fs.appendFileSync(path.join(OUT, 'positions.jsonl'), POS.splice(0).map(x => JSON.stringify(x)).join('\n') + '\n'); fs.appendFileSync(path.join(OUT, 'moves.jsonl'), (WORLD.track || []).splice(0).map(x => JSON.stringify(x)).join('\n') + '\n'); } catch (e) {}
    fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify({ W, STATS, world: { t: WORLD.t, flags: WORLD.flags, stats: WORLD.stats, objects: WORLD.objects, people: Object.fromEntries(Object.entries(WORLD.people).map(([k, p]) => [k, { place: p.place, money: p.money, inv: p.inv, needs: p.needs }])) }, agents: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { place: a.place, money: a.money, op: a.op, mem: a.mem }])) }, null, 1));
    const keyDay = [0, 3, 5, 10, 11, 29, 30, 43, 57, 59, 73, 84].includes(d) || W.facts.some(f => f.day === d);
    try {
      if (DOW(d) === 'sun') for (const k in A) await reflect(k);
      if (DOW(d) === 'sun' || keyDay) for (const k in A) await diary(k);
    } catch (e) { STATS.errors = (STATS.errors || 0) + 1; await ensureBrowser(); }
    try { if (!off('dreams')) for (const k in A) await dream(k); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; }
    if (d + 1 < ND && dateOf(d + 1).getUTCMonth() !== dateOf(d).getUTCMonth()) { try { for (const k in A) await monthReview(k); } catch (e) { STATS.errors = (STATS.errors || 0) + 1; } }
    if (DOW(d) === 'sun') consolidate();
    METRICS.days.push({ day: d, asks: STATS.asks - asks0, money: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, a.money])), needs: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { ...a.needs }])), chem: Object.fromEntries(Object.entries(A).map(([k, a]) => [k, { ...a.chem }])), inv: { ...A.ada.inv }, op: JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(A).map(([k, a]) => [k, a.op])))), world: { ...WORLD.stats, performed: { ...WORLD.stats.performed } } });
    STATS.gm = GM.STATS; fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ METRICS, STATS, W }, null, 1));
    fs.writeFileSync(path.join(OUT, 'story.txt'), STORY.join('\n'));
    fs.writeFileSync(path.join(OUT, 'trace.json'), JSON.stringify(TRACE));
  }
  say('\n######## Final memory examination ########');
  W.day = Math.min(N, DAYS.length - 1); for (const k in A) A[k].place = A[k].home;
  for (const f of W.facts.filter(f => A[f.who])) await probe(f, true);
  const P = METRICS.probes, D = METRICS.diaries;
  say(`\nSTATS ${JSON.stringify(STATS)}`);
  say(`WORLD ${JSON.stringify(WORLD.stats)}`);
  say(`MEMORY: ${P.filter(p => p.ok).length}/${P.length} correct; by age: ${JSON.stringify([1, 3, 7, 14, 30, 60].map(a => [a, P.filter(p => p.age >= a).length ? +(P.filter(p => p.age >= a && p.ok).length / P.filter(p => p.age >= a).length).toFixed(2) : null]))}`);
  for (const [lab, fl] of [['life', p => p.kind !== 'news'], ['news', p => p.kind === 'news'], ['aided', p => p.aided], ['unaided', p => !p.aided], ['final', p => p.final]]) { const x = P.filter(fl); say(`MEMORY ${lab}: ${x.filter(p => p.ok).length}/${x.length}, unreadable ${x.filter(p => p.answer === null).length}`); }
  say(`DIARIES: ${D.reduce((s, x) => s + x.kept, 0)}/${D.reduce((s, x) => s + x.facts, 0)} key facts kept`);
  STATS.gm = GM.STATS; fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ METRICS, STATS, W }, null, 1));
  fs.writeFileSync(path.join(OUT, 'story.txt'), STORY.join('\n'));
  if (browser) await browser.close();
  console.log('DONE');
})();
