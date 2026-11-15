// Fetch real 1930 newspaper text (Chronicling America, Library of Congress) for each simulated day:
// London-datelined cables from US front pages. Output: news_loc/<date>.json with cleaned extracts.
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'news_loc'); fs.mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'talkie-sim-research/0.1 (historical simulation; research script)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.UTC(1930, 2, 14); const iso = d => new Date(T0 + d * 864e5).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'March', 'April', 'May', 'June'];
const { execFile } = require('child_process');
const curl = url => new Promise(res => execFile('curl', ['-s', '-m', '60', '-A', UA['User-Agent'], '-w', '\n%{http_code}', url], { maxBuffer: 64 << 20 }, (e, out) => { if (e) return res({ code: 0 }); const i = out.lastIndexOf('\n'); res({ code: +out.slice(i + 1), body: out.slice(0, i) }); }));
async function get(url, json = true) {   // node's fetch ignores the proxy, curl does not
  for (let i = 0; i < 4; i++) {
    const r = await curl(url);
    if (r.code === 429 || r.code >= 500 || r.code === 0) { await sleep(5000 * (i + 1)); continue; }
    if (r.code !== 200) return null;
    try { return json ? JSON.parse(r.body) : r.body; } catch (e) { return null; }
  }
  return null;
}
const clean = t => t.replace(/\b(\w+) (\w+) - (\w+) \2\b/g, '$2').replace(/\s+/g, ' ').trim();
async function pageText(resUrl) {
  const j = await get(resUrl.replace(/&q=[^&]*/, '') + (resUrl.includes('?') ? '&' : '?') + 'fo=json'); if (!j) return null;
  const xml = (JSON.stringify(j).match(/https:\/\/tile\.loc\.gov\/storage-services\/service\/ndnp\/[^"]+?\/\d{4}\.xml/) || [])[0]; if (!xml) return null;
  const x = await get(xml, false); if (!x) return null;
  return clean((x.match(/CONTENT="([^"]+)"/g) || []).map(w => w.slice(9, -1)).join(' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}
(async () => {
  const from = +(process.argv[2] || 0), to = +(process.argv[3] || 89);
  for (let d = from; d <= to; d++) {
    const date = iso(d), f = path.join(OUT, date + '.json'); if (fs.existsSync(f)) continue;
    // the Washington Evening Star (LCCN sn83045462), pages 1-3: its front pages carry the foreign cables of the day
    const items = [], seen = new Set();
    const FOREIGN = /^(LONDON|PARIS|BERLIN|ROME|GENEVA|BOMBAY|DELHI|NEW DELHI|CALCUTTA|KARACHI|SIMLA|MADRAS|PESHAWAR|SURAT|DANDI|TOKIO|TOKYO|MOSCOW|VIENNA|MADRID|DUBLIN|OTTAWA|SYDNEY|MELBOURNE|DARWIN|PORT DARWIN|CROYDON|SOUTHAMPTON|PLYMOUTH|MANCHESTER|LIVERPOOL|GLASGOW|EDINBURGH|BRUSSELS|THE HAGUE|ATHENS|CAIRO|JERUSALEM|SHANGHAI|NANKING|PEIPING|ADDIS ABABA|RANGOON|SINGAPORE|CONSTANTINOPLE|ISTANBUL|BAGHDAD|ALLAHABAD|LAHORE|EPSOM|WEMBLEY|AINTREE|WORCESTER|NOTTINGHAM|BERNE|WARSAW|PRAGUE|BUDAPEST|STOCKHOLM|OSLO|COPENHAGEN|LISBON|BELFAST|CARDIFF)\b/i;
    for (const sp of [1, 2, 3]) {
      const resUrl = `https://www.loc.gov/resource/sn83045462/${date}/ed-1/?sp=${sp}`;
      const t = await pageText(resUrl); await sleep(700); if (!t) continue;
      const re = /\b([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?),(?: [A-Z][a-z]+,)? ?(?:March|April|May|June|Mar\.|Apr\.) ?\d{1,2}\b\.?\s*(?:\(\s*[A-Z][\w. ]{0,6}\)|—|-)?/g; let m;
      while ((m = re.exec(t))) {
        if (!FOREIGN.test(m[1])) continue;
        const body = t.slice(m.index + m[0].length).split(' ').slice(0, 90).join(' ');
        const key = body.slice(0, 60); if (seen.has(key) || body.length < 80) continue; seen.add(key);
        items.push({ paper: 'Evening Star (Washington, D.C.)', page: sp, url: resUrl, dateline: m[0].trim(), place: m[1].toUpperCase(), text: body });
      }
    }
    fs.writeFileSync(f, JSON.stringify({ date, day: d, n: items.length, items }, null, 1));
    console.log(date, 'cables', items.length, items[0] ? items[0].text.slice(0, 90) : '');
    await sleep(1000);
  }
  console.log('DONE');
})();
