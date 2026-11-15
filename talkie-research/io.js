const fs=require('fs'),path=require('path');const OUT=path.join(__dirname,process.env.RUN||'iotest');fs.mkdirSync(OUT,{recursive:true});const sleep=ms=>new Promise(r=>setTimeout(r,ms));const STATS={asks:0};
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
async function launch(){const{chromium}=require('playwright');const proxy=process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined;browser=await chromium.launch({proxy});}
async function ask(m){STATS.asks++;let p=null;try{p=await getPage();let a=await sendAndWait(p,m,0);if(!a){await p.getByRole('button',{name:/new chat/i}).click({timeout:3000}).catch(()=>{});await p.locator('#emptyChatInput').waitFor({state:'visible',timeout:5000}).catch(()=>{});await sleep(400);a=await sendAndWait(p,m,0);}return a;}catch(e){return null;}finally{if(p)putPage(p);}}
module.exports={launch,ask,STATS,close:()=>browser.close()};
