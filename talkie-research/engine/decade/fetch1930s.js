// Sources asked day by day, with a cache: what is fetched once is kept (decade/cache/<source>/<date>.json), so every
// run can be repeated with the same inputs and a run goes on when a source is down. While the simulation lives one
// day, the next days are fetched in the background.
//   star     the Washington Evening Star, front pages 1-3 (Chronicling America, Library of Congress): the cables of the
//            day from London and abroad, as printed (ALTO text of the page scans)
//   hansard  the Commons sitting of the day: titles of the business and the opening words of the main debates
'use strict';
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const CACHE = path.join(__dirname, 'cache');
const UA = 'talkie-sim-research/0.1 (historical simulation; research script)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const curl = url => new Promise(res => execFile('curl', ['-s', '-m', '60', '-A', UA, '-w', '\n%{http_code}', url], { maxBuffer: 64 << 20 }, (e, out) => {
  if (e && !out) return res({ code: 0, body: '' }); const i = out.lastIndexOf('\n'); res({ code: +out.slice(i + 1), body: out.slice(0, i) }); }));
async function get(url, json = true) {
  for (let i = 0; i < 4; i++) {
    const r = await curl(url);
    if (r.code === 429 || r.code >= 500 || r.code === 0) { await sleep(4000 * (i + 1)); continue; }
    if (r.code !== 200) return null;
    try { return json ? JSON.parse(r.body) : r.body; } catch (e) { return null; }
  }
  return null;
}
const clean = t => t.replace(/\s+/g, ' ').trim();
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.|Feb\\.|Mar\\.|Apr\\.|Aug\\.|Sept?\\.|Oct\\.|Nov\\.|Dec\\.';
const FOREIGN = /^(LONDON|PARIS|BERLIN|ROME|GENEVA|BOMBAY|DELHI|NEW DELHI|CALCUTTA|MOSCOW|VIENNA|MADRID|DUBLIN|OTTAWA|SYDNEY|MELBOURNE|TOKIO|TOKYO|SHANGHAI|NANKING|PEIPING|CAIRO|JERUSALEM|ADDIS ABABA|WARSAW|PRAGUE|BUDAPEST|ATHENS|LISBON|BRUSSELS|AMSTERDAM|THE HAGUE|COPENHAGEN|OSLO|STOCKHOLM|HELSINKI|BERNE|MUNICH|HAMBURG|LIVERPOOL|MANCHESTER|GLASGOW|EDINBURGH|CARDIFF|BELFAST|SOUTHAMPTON|PLYMOUTH|DOVER|PORTSMOUTH|CROYDON|WINDSOR|SANDRINGHAM|BIRMINGHAM|NEWCASTLE|SHEFFIELD|LEEDS|BRISTOL)$/;
const BRITISH = /^(LONDON|LIVERPOOL|MANCHESTER|GLASGOW|EDINBURGH|CARDIFF|BELFAST|SOUTHAMPTON|PLYMOUTH|DOVER|PORTSMOUTH|CROYDON|WINDSOR|SANDRINGHAM|BIRMINGHAM|NEWCASTLE|SHEFFIELD|LEEDS|BRISTOL|DUBLIN)$/;

async function pageText(resUrl) {
  const j = await get(resUrl + '&fo=json'); if (!j) return null;
  const xml = (JSON.stringify(j).match(/https:\/\/tile\.loc\.gov\/storage-services\/service\/ndnp\/[^"]+?\/\d{4}\.xml/) || [])[0]; if (!xml) return null;
  const x = await get(xml, false); if (!x) return null;
  return clean((x.match(/CONTENT="([^"]+)"/g) || []).map(w => w.slice(9, -1)).join(' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}
const PROVIDERS = {
  async star(date) {   // the paper of `date` carries the cables dated the day before and the same day
    const items = [], seen = new Set();
    for (const sp of [1, 2, 3]) {
      const resUrl = `https://www.loc.gov/resource/sn83045462/${date}/ed-1/?sp=${sp}`;
      const t = await pageText(resUrl); await sleep(600); if (!t) continue;
      const re = new RegExp(`\\b([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?),(?: [A-Z][a-z]+,)? ?(?:${MONTHS}) ?\\d{1,2}\\b\\.?\\s*(?:\\(\\s*[A-Z][\\w. ]{0,6}\\)|—|-)?`, 'g'); let m;
      while ((m = re.exec(t))) {
        const place = m[1].toUpperCase(); if (!FOREIGN.test(place)) continue;
        const body = t.slice(m.index + m[0].length).split(' ').slice(0, 110).join(' ');
        const key = body.slice(0, 60); if (seen.has(key) || body.length < 80) continue; seen.add(key);
        items.push({ paper: 'Evening Star (Washington, D.C.)', page: sp, url: resUrl, place, british: BRITISH.test(place), text: body });
      }
    }
    items.sort((a, b) => (b.british - a.british) || (a.page - b.page));
    return { date, n: items.length, items };
  },
  async hansard(date) {
    const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], [y, mo, d] = date.split('-');
    const s = await get(`https://api.parliament.uk/historic-hansard/sittings/${y}/${MON[+mo - 1]}/${d}`, false);
    if (!s || !/Commons Sitting of/.test(s)) return { date, sitting: false, items: [] };
    const c = s.split('Commons Sitting of')[1].split('Written Answers')[0];
    const items = []; const re = /href="(\/historic-hansard\/commons\/[^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]{0,300}?([\d,]+) words/g; let m;
    while ((m = re.exec(c))) items.push({ title: m[2].replace(/&#x27;|&#39;/g, "'").trim(), words: +m[3].replace(/,/g, ''), url: 'https://api.parliament.uk' + m[1] });
    items.sort((a, b) => b.words - a.words);
    const top = items.filter(x => !/^(Preamble|Private Business|Orders|Business|Clause|New Clause|Class|Schedule)/i.test(x.title)).slice(0, 3);
    for (const x of top) {   // the opening words of the debate, as the papers would report them
      const p = await get(x.url, false); await sleep(400);
      if (!p) continue;
      const text = clean(p.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&[a-z]+;/g, ' '));
      x.opening = text.replace(/^.*?(HC Deb [^ ]+ [^ ]+ [^ ]+ vol \d+ cc?[\d-]+W?)/, '').slice(0, 700);
      // how the House decided, in the words of the record: the last question put and the last division on it
      const qs = [...text.matchAll(/Question put,?\s+(That [^§]{10,400}?\.)(?=\s|$)/g)], dv = [...text.matchAll(/The House divided:\s*Ayes,\s*([\d,]+);\s*Noes,\s*([\d,]+)/g)];
      if (qs.length) x.question = qs[qs.length - 1][1].replace(/\s+\d{3,4}\s+/g, ' ').trim();
      if (dv.length) x.division = { ayes: +dv[dv.length - 1][1].replace(/,/g, ''), noes: +dv[dv.length - 1][2].replace(/,/g, '') };
    }
    return { date, sitting: true, items: top, v: 2 };
  }
};
const file = (src, date) => path.join(CACHE, src, date + '.json');
function cached(src, date) { try { return JSON.parse(fs.readFileSync(file(src, date), 'utf8')); } catch (e) { return null; } }
const inflight = {};
async function ensure(date, sources = Object.keys(PROVIDERS)) {
  const out = {};
  for (const src of sources) {
    let v = cached(src, date); if (src === 'hansard' && v && v.sitting && !v.v) v = null;   // fetched before the divisions were read: again
    if (!v) {
      const key = src + date;
      inflight[key] = inflight[key] || PROVIDERS[src](date).then(r => { if (r) { fs.mkdirSync(path.join(CACHE, src), { recursive: true }); fs.writeFileSync(file(src, date), JSON.stringify(r)); } delete inflight[key]; return r; }).catch(() => { delete inflight[key]; return null; });
      v = await inflight[key];
    }
    out[src] = v;
  }
  return out;
}
// fetch the coming days without waiting (errors are kept quiet; the day will try again when it comes)
let queue = Promise.resolve();
function prefetch(dates) { for (const d of dates) queue = queue.then(() => ensure(d)).catch(() => null); return queue; }
const get1 = (src, date) => cached(src, date);   // synchronous read for the simulation's inner loop
module.exports = { ensure, prefetch, cached: get1, PROVIDERS };
