// Put talkie to the situation bank: it answers each situation freely; its words are mapped to one of the courses
// the engine judged, and scored 0 (worst course) .. 1 (best course). Usage:
//   N=300 MODE=open node bankrun.js      (MODE: open = one free answer; foresee = three ideas + the world's foresight)
'use strict';
const fs = require('fs'), path = require('path');
const io = require('./io.js'); const { parse } = require('./intent.js');
const N = +(process.env.N || 100), MODE = process.env.MODE || 'open', SEED = +(process.env.SEED || 7);
const OUTF = path.join(__dirname, `bank_${MODE}.jsonl`);
const all = fs.readFileSync(path.join(__dirname, 'situations.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const done = new Set(fs.existsSync(OUTF) ? fs.readFileSync(OUTF, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
// decisive situations only, the same number from every kind
let a = SEED >>> 0; const R = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
const byT = {}; for (const s of all.filter(x => x.spread > 10)) (byT[s.template] = byT[s.template] || []).push(s);
const pickN = []; const per = Math.ceil(N / Object.keys(byT).length);
for (const xs of Object.values(byT)) { const c = xs.slice().sort(() => R() - 0.5).slice(0, per); pickN.push(...c); }
const SAMPLE = pickN.slice(0, N).filter(s => !done.has(s.id));
// which of the judged courses did the person's words mean?
function keyOfLabel(l) {
  const t = l.toLowerCase();
  if (/^pay mr\. gedge/.test(t)) return 'rent'; if (/^pawn (her wedding ring|her copper kettle|her winter coat|bert's sunday boots)/.test(t)) return 'pawn'; if (/^ask mr\. barker to let her have things on the slate/.test(t)) return 'ask:barker'; if (/^ask mrs\. nolan to lend/.test(t)) return 'ask:nolan'; if (/^go round asking for more cleaning work/.test(t)) return 'seekwork'; if (/^go to the relieving office/.test(t)) return 'relief'; if (/^ask mr\. gedge to wait/.test(t)) return 'ask:gedge'; if (/^light the fire/.test(t)) return 'fire';
  if (/^buy bread/.test(t)) return 'buy:food'; if (/^buy a hundredweight of coal/.test(t)) return 'buy:coal'; if (/^pawn/.test(t)) return 'pawn'; if (/^redeem/.test(t)) return 'redeem';
  if (/^go home/.test(t)) return 'go:HOME'; if (/^go to bed/.test(t)) return 'sleep'; if (/^sit by the fire|^rest/.test(t)) return 'rest';
  if (/^cook a meal|^have (breakfast|dinner|tea)|^lunch at the lyons tea-shop: soup/.test(t)) return 'eat'; if (/tea and a bun/.test(t)) return 'eat:cheap';
  if (/^read/.test(t)) return 'read'; if (/^talk with (.*?) about/.test(t)) return 'talk:' + t.match(/^talk with (?:mrs?\.? |young mr\. )?(\w+)/)[1];
  if (/mrs\. nolan for a cup of tea/.test(t)) return 'talk:nolan'; if (/^clean the moorgate office/.test(t)) return 'go:office'; if (/finsbury/.test(t)) return 'go:finsbury';
  if (/^give edith (\d+)/.test(t)) return 'give:edith'; if (/^fetch dr\. gray/.test(t)) return 'doctor'; if (/morning service/.test(t)) return 'pray';
  if (/street-market/.test(t)) return 'go:market'; if (/walk/.test(t)) return 'walk'; if (/wireless|trollope|potter|shed/.test(t)) return 'leisure'; if (/^write a reply/.test(t)) return 'write';
  if (/^get on with|^work at|^attend to the correspondence|^keep the clerks/.test(t)) return 'work';
  return 'x:' + t.slice(0, 20);
}
function keyOfAnswer(text, s) {
  const it = parse((text || '').split(/(?<=[.!?])\s/)[0]); if (!it) return null;
  const v = it.verb, to = (it.to || '').replace('relieving', 'cobb');
  if (v === 'rent') return 'rent'; if (v === 'pawn') return 'pawn'; if (v === 'redeem') return 'redeem'; if (v === 'fire') return 'fire'; if (v === 'sleep') return 'sleep'; if (v === 'rest') return 'rest';
  if (v === 'read') return 'read'; if (v === 'pray') return 'pray'; if (v === 'walk') return 'walk'; if (v === 'write') return 'write';
  if (v === 'eat') return it.out && s.who === 'arthur' ? 'eat' : 'eat';
  if (v === 'buy') return it.good.item === 'coal' ? 'buy:coal' : 'buy:food';
  if (v === 'ask' && to === 'gedge') return 'ask:gedge'; if (v === 'ask' && (to === 'barker' || /slate|tick|trust|credit/.test((text || '').toLowerCase()))) return 'ask:barker'; if (v === 'ask' && to === 'nolan') return 'ask:nolan'; if (v === 'ask' && (to === 'cobb' || it.relief)) return 'relief'; if (v === 'seekwork') return 'seekwork';
  if (v === 'go' && it.place === 'chandler' && /coal/.test((text || '').toLowerCase())) return 'buy:coal'; if (v === 'go' && it.place === 'chandler' && /food|bread|something to eat|groceries/.test((text || '').toLowerCase())) return 'buy:food'; if ((v === 'ask' || v === 'talk') && to) return 'talk:' + to;
  if (v === 'give' && to === 'edith') return 'give:edith'; if (v === 'go') return it.place === 'office' ? 'go:office' : it.place === 'HOME' ? 'go:HOME' : it.place === 'doctor' ? 'doctor' : it.place === 'market' ? 'go:market' : it.place === 'finsbury' ? 'go:finsbury' : 'go:' + it.place;
  if (v === 'work') return s.who === 'ada' && /office|scrub|clean/.test(text.toLowerCase()) ? 'go:office' : 'work';
  return 'other:' + v;
}
function score(s, key) {
  const best = s.options[0].score, worst = s.options[s.options.length - 1].score;
  const m = s.options.find(o => keyOfLabel(o.label) === key) || (key && key.startsWith('talk:') ? s.options.find(o => keyOfLabel(o.label).startsWith('talk:')) : null);
  if (!m) return { matched: false };
  return { matched: true, label: m.label, rel: best === worst ? 1 : +((m.score - worst) / (best - worst)).toFixed(2), regret: +(best - m.score).toFixed(1), isBest: m.label === s.best };
}
const He = s => (s.who === 'ada' ? 'She' : 'He'), Short = s => ({ ada: 'Ada', arthur: 'Arthur', thomas: 'Mr. Thomas' })[s.who];
async function answer(s) {
  const q = `${s.context}\n\nWhat does ${Short(s)} do now, as ${He(s).toLowerCase()} truly would? Answer in the form: ${He(s)} ... (one sentence)`;
  const echo = t2 => !t2 || /CHARACTER:|PURSE:|AT HAND:/.test(t2) || /^\w+ (o'clock|minutes|past|to) /i.test(t2.trim());
  if (MODE === 'open') { let t2 = await io.ask(q); if (echo(t2)) t2 = await io.ask(q); return echo(t2) ? null : t2; }
  // foresee: three ideas -> the engine's judgement of each, in words -> she chooses
  const ideas = []; for (let i = 0; i < 3; i++) { const t = await io.ask(q); const k = keyOfAnswer(t, s); if (t && k && !ideas.some(x => x.k === k)) ideas.push({ t: t.split(/(?<=[.!?])\s/)[0], k }); }
  if (ideas.length <= 1) return ideas[0] ? ideas[0].t : null;
  const words = k => { const o = s.options.find(o2 => keyOfLabel(o2.label) === k); if (!o) return ''; const rel = (o.score - s.options[s.options.length - 1].score) / Math.max(1, s.options[0].score - s.options[s.options.length - 1].score); return rel > 0.75 ? 'things will be much better for it by tomorrow' : rel > 0.4 ? 'it will help a little' : 'it will not help with what is pressing'; };
  const L = 'ABC'; const ans = await io.ask(`${s.context}\n\n${Short(s)} turns over in ${s.who === 'ada' ? 'her' : 'his'} mind what ${He(s).toLowerCase()} might do, and what would come of it:\n${ideas.map((x, j) => `(${L[j]}) ${x.t.replace(/^(She|He)\s+/, '')}${words(x.k) ? ` (then: ${words(x.k)})` : ''}`).join('\n')}\n\nWhich does ${He(s).toLowerCase()} do? Answer in the form: ${He(s)} chooses to ..., because ...`);
  const j = ans ? (ans.match(/\(([ABC])\)/) || [])[1] : null; if (j && L.indexOf(j) < ideas.length) return ideas[L.indexOf(j)].t;
  const k2 = keyOfAnswer((ans || '').replace(/chooses to /, ''), s); const hit = ideas.find(x => x.k === k2); return hit ? hit.t : ideas[0].t;
}
(async () => {
  await io.launch(); const out = fs.createWriteStream(OUTF, { flags: 'a' });
  for (const s of SAMPLE) {
    let t = null; try { t = await answer(s); } catch (e) {}
    const key = keyOfAnswer(t, s), sc = key ? score(s, key) : { matched: false };
    const row = { id: s.id, template: s.template, who: s.who, mode: MODE, answer: (t || '').slice(0, 200), key, ...sc, urgent: s.urgent.map(u => u[0]) };
    out.write(JSON.stringify(row) + '\n');
    console.log(s.template.padEnd(16), (t ? (sc.matched ? (sc.isBest ? 'BEST' : sc.rel.toFixed(2)) : 'unmatched') : 'EMPTY').padEnd(9), (key || '').padEnd(14), (t || '').replace(/\n/g, ' ').slice(0, 90));
  }
  const rows = fs.readFileSync(OUTF, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const m = rows.filter(r => r.matched); const mean = xs => xs.length ? +(xs.reduce((s2, x) => s2 + x, 0) / xs.length).toFixed(2) : null;
  console.log(`\nMODE ${MODE}: ${rows.length} situations; answered ${rows.filter(r => r.answer).length}; matched ${m.length}; mean score ${mean(m.map(r => r.rel))}; best course ${m.filter(r => r.isBest).length}`);
  const by = {}; for (const r of m) (by[r.template] = by[r.template] || []).push(r.rel);
  for (const [t2, xs] of Object.entries(by)) console.log(`   ${t2.padEnd(16)} n=${xs.length} mean ${mean(xs)}`);
  await io.close();
})();
