// The daily paper, 2 January – 1 April 1931: the first months after talkie's knowledge ends (31 Dec 1930).
// Headline items written from the historical record and checked against NewsWire 1931 where the wire carries them;
// `p` = an optional memory probe (truth is option 0). Day 0 = Friday 2 January 1931.
const day = (m, dd) => ({ 1: dd - 2, 2: 29 + dd, 3: 57 + dd, 4: 88 + dd })[m];
const ITEMS = [
  [day(1, 2), "THE NEW YEAR opens gloomily: more than two and a half million are out of work, and the coal and cotton trades are in dispute."],
  [day(1, 5), "DEATH OF THE PRINCESS ROYAL. Princess Louise, the King's eldest sister, died yesterday.", { q: 'Which member of the Royal Family died at the beginning of January?', opts: ["The Princess Royal, the King's sister", 'The Prince of Wales', 'The Duke of York'] }],
  [day(1, 20), "INDIA. The Round Table Conference in London has ended; the Prime Minister promises India responsible government, with safeguards.", { q: 'What conference on India ended in London in January?', opts: ['The Round Table Conference', 'The Imperial Conference', 'The Naval Conference'] }],
  [day(1, 24), "DEATH OF PAVLOVA. Anna Pavlova, the great dancer, died yesterday at The Hague.", { q: 'Which famous dancer died in January?', opts: ['Anna Pavlova', 'Nijinsky', 'Karsavina'] }],
  [day(1, 27), "INDIA. Mr. Gandhi has been released from prison, with the other leaders of the Congress.", { q: 'What happened to Mr. Gandhi at the end of January?', opts: ['He was released from prison', 'He was arrested again', 'He sailed for London'] }],
  [day(2, 6), "A WORLD'S RECORD. Captain Malcolm Campbell has driven his Blue Bird at 245 miles an hour on the sands at Daytona, in America.", { q: 'What record did Captain Malcolm Campbell set in February?', opts: ['The motor-car speed record', 'The record flight to Australia', 'The Channel swimming record'] }],
  [day(2, 13), "THE ECONOMY. Mr. Snowden warns the House of Commons that the national finances are in a grave state, and that sacrifices may be needed."],
  [day(2, 14), "INDIA. The new capital at New Delhi has been formally inaugurated by the Viceroy."],
  [day(2, 16), "SPAIN. General Berenguer's government has resigned amid unrest."],
  [day(2, 20), "MR. CHARLIE CHAPLIN has come home to London, and great crowds greeted him.", { q: 'Which famous film actor came home to London in February?', opts: ['Charlie Chaplin', 'Douglas Fairbanks', 'Harold Lloyd'] }],
  [day(3, 2), "SIR OSWALD MOSLEY has launched a New Party to deal with the national emergency.", { q: 'Who launched a New Party at the beginning of March?', opts: ['Sir Oswald Mosley', 'Mr. Lloyd George', 'Mr. Baldwin'] }],
  [day(3, 6), "INDIA. Mr. Gandhi and the Viceroy, Lord Irwin, have come to an agreement: civil disobedience is to be called off.", { q: 'What agreement was made in India in March?', opts: ['Mr. Gandhi and Lord Irwin agreed to end civil disobedience', 'India was made independent', 'Mr. Gandhi was sent back to prison'] }],
  [day(3, 20), "THE ST. GEORGE'S ELECTION. Mr. Duff Cooper, for Mr. Baldwin, has beaten the candidate of the press lords' Empire Crusade."],
  [day(3, 28), "THE GRAND NATIONAL has been won at Aintree by Grakle.", { q: 'Which horse won the Grand National in March?', opts: ['Grakle', 'Shaun Goilin', 'Easter Hero'] }]
];
const RUNNING = [
  [day(1, 3), day(4, 1), "UNEMPLOYMENT. The numbers out of work are the highest since the war; the Government is pressed to act."],
  [day(1, 28), day(3, 5), "INDIA. Mr. Gandhi and the Viceroy are in talks at Delhi."],
  [day(1, 10), day(2, 5), "MOTORING. Captain Malcolm Campbell is at Daytona with his new Blue Bird, hoping to beat the world's speed record."],
  [day(1, 20), day(4, 1), "SPAIN. There is unrest in Madrid; students demand a republic."]
];
// Real cables of the same day from the Washington Evening Star (Chronicling America, Library of Congress),
// fetched by fetchnews.js into news_loc/<date>.json. OCR text, lightly cleaned; London and Empire first.
const fs = require('fs'), path = require('path');
const T0 = Date.UTC(1931, 0, 2); const isoOf = d => new Date(T0 + d * 864e5).toISOString().slice(0, 10);
const RANK = p => /^LONDON|CROYDON|SOUTHAMPTON|EPSOM|WEMBLEY|AINTREE|MANCHESTER|LIVERPOOL|GLASGOW|PLYMOUTH|WORCESTER|NOTTINGHAM/.test(p) ? 0 : /BOMBAY|DELHI|CALCUTTA|KARACHI|SIMLA|MADRAS|PESHAWAR|SURAT|DANDI|ALLAHABAD|LAHORE|RANGOON|SINGAPORE|DARWIN|SYDNEY|MELBOURNE|OTTAWA|CAIRO|JERUSALEM|DUBLIN|BELFAST/.test(p) ? 1 : 2;
function cleanCable(c) {
  let t = c.text.replace(/^\s*(?:\(?\s*[A-Z&][A-Z.& ]{0,6}\)\s*)?[.,]?\s*[—–\-]*\s*/, '').replace(/^\.?\s*[—–\-]+\s*/, '').replace(/[•»«|\\]/g, '').replace(/\s+/g, ' ');
  if (/\s\?\s|\?\s+[A-Z]/.test(t.slice(0, 200))) return null;
  const sent = (t.match(/[^.!?]+[.!?]/g) || [t]).slice(0, 2).join(' ').trim();
  if (sent.length < 60 || /[^\x20-\x7E\u00C0-\u017F’‘“”—–]/.test(sent)) return null;
  const place = c.place[0] + c.place.slice(1).toLowerCase();
  return `FROM ${c.place}. ${sent.slice(0, 260).replace(/\s+\S*$/, sent.length > 260 ? '…' : '')}`.replace(/FROM ([A-Z ]+)\. /, (_, p) => `${p}. `);
}
function cablesFor(d, n = 2) {
  const f = path.join(__dirname, 'news_loc_1931', isoOf(d) + '.json'); if (!fs.existsSync(f)) return [];
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; }
  return j.items.map(c => ({ c, r: RANK(c.place), t: cleanCable(c) })).filter(x => x.t).sort((a, b) => a.r - b.r).slice(0, n).map(x => ({ text: x.t, p: null, cable: true, src: x.c.url }));
}
// Preferred: NewsWire (Dell Research Harvard, CC-BY 4.0): de-duplicated US wire stories of 1930 with
// OCR-cleaned text, wire city and country; `cluster` = how many papers printed the story. A London paper
// of the morning of day d carries the cables dated the day before.
let WIRE = null;
function wireFor(d, n = 2) {
  if (WIRE === null) { try { WIRE = JSON.parse(fs.readFileSync(path.join(__dirname, 'newswire_winter1931.json'), 'utf8')); } catch (e) { WIRE = {}; } }
  const items = WIRE[isoOf(d - 1)] || []; const out = [], seen = new Set();
  for (const a of items) {
    if (seen.has(a.city) && out.length) continue;
    let t = a.text.replace(/^[^—–-]{0,60}?(?:\d{1,2})?\s*[.,]?\s*(?:\(?[A-Z#&.() ]{0,10}\)?)?\s*[—–-]+\s*(?:\([A-Z#&. ]{0,8}\)\s*[—–-]*)?\s*/, '');
    t = t.replace(/^\(\W*\)\s*[—–~-]*\s*/, '').replace(/^[A-Z][A-Za-z ]+, [A-Z][a-z]+,? (?:Jan|Feb|Mar|Apr|May|Jun)\w*\.? \d{1,2}\.?,?\s*[~—–-]*\s*(?:\([^)]{0,8}\)\s*[—–-]*)?\s*/, '');
    if (/^[^A-Z"']/.test(t)) continue;
    const sent = (t.match(/[^.!?]+[.!?]+/g) || [t]).slice(0, 2).join(' ').trim();
    if (sent.length < 60) continue;
    seen.add(a.city);
    out.push({ text: `${(a.city || a.country).toUpperCase()}. ${sent.length > 300 ? sent.slice(0, 297).replace(/\s+\S*$/, '') + '…' : sent}`, p: null, cable: true, src: 'NewsWire ' + isoOf(d - 1) + ' ' + a.city });
    if (out.length >= n) break;
  }
  return out;
}
function newsFor(d) {
  const dated = ITEMS.filter(x => x[0] === d).map(x => ({ text: x[1], p: x[2] || null }));
  const want = dated.length ? 1 : 2; let cables = wireFor(d, want); if (cables.length < want) cables = cables.concat(cablesFor(d, want - cables.length));
  if (dated.length || cables.length) return [...dated, ...cables];
  const run = RUNNING.filter(r => d >= r[0] && d <= r[1]);
  return run.length ? [{ text: run[d % run.length][2], p: null }] : [];
}
module.exports = { newsFor, ITEMS, cablesFor, wireFor };
