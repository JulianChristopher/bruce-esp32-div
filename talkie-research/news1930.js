// The daily paper, 14 March – 11 June 1930. Curated from the historical record (events as reported the
// morning after); dates checked against standard chronologies where I am sure, phrased in period style.
// `p` = an optional memory probe about the item (truth is always option 0; options are shuffled when asked).
// Days with no dated item carry the running story of the time (Gandhi's march, Miss Johnson's flight,
// unemployment, the Australian cricketers). Day 0 = Friday 14 March 1930.
const day = (m, dd) => ({ 3: dd - 14, 4: 17 + dd, 5: 47 + dd, 6: 78 + dd })[m];
const ITEMS = [
  [day(3, 14), "A NEW PLANET. The Lowell Observatory in Arizona announces the discovery of a ninth planet, far beyond Neptune.", { q: 'What new discovery in the heavens did the papers report in March?', opts: ['A ninth planet beyond Neptune', 'A great comet near the sun', 'A new moon of Jupiter'] }],
  [day(3, 14), "INDIA. Mr. Gandhi and his followers are marching to the sea, to make salt in defiance of the Salt Laws."],
  [day(3, 17), "THE NAVAL CONFERENCE. The delegates of the Powers continue their talks in London on the limitation of fleets."],
  [day(3, 18), "UNEMPLOYMENT. The number of persons out of work in Great Britain stands at more than a million and a half."],
  [day(3, 20), "DEATH OF LORD BALFOUR. The Earl of Balfour, former Prime Minister, died yesterday at the age of eighty-one.", { q: 'Which former Prime Minister died in March?', opts: ['Lord Balfour', 'Mr. Lloyd George', 'Mr. Baldwin'] }],
  [day(3, 28), "GERMANY. The Government of Herr Müller has resigned over the question of unemployment insurance."],
  [day(3, 29), "THE GRAND NATIONAL has been won at Aintree by Shaun Goilin."],
  [day(3, 31), "GERMANY. Dr. Brüning, of the Centre Party, has been appointed Chancellor of the Reich."],
  [day(4, 4), "ABYSSINIA. The Empress Zauditu is dead, and Ras Tafari is proclaimed King of Kings."],
  [day(4, 7), "INDIA. Mr. Gandhi has reached the sea at Dandi, and has made salt from the sea-water in defiance of the law.", { q: 'What did Mr. Gandhi do when he reached the sea in April?', opts: ['He made salt in defiance of the law', 'He sailed for England', 'He was made Viceroy'] }],
  [day(4, 15), "THE BUDGET. Mr. Snowden raises the income tax from four shillings to four shillings and sixpence in the pound.", { q: "What did Mr. Snowden's Budget do to the income tax?", opts: ['Raised it to 4s. 6d. in the pound', 'Lowered it to 3s. 6d. in the pound', 'Left it as it was'] }],
  [day(4, 15), "INDIA. Pandit Jawaharlal Nehru has been arrested for breaking the Salt Laws."],
  [day(4, 23), "THE NAVAL TREATY. Great Britain, the United States and Japan have signed in London a treaty limiting their navies.", { q: 'What was signed in London in April?', opts: ['A treaty limiting the navies of the Powers', 'A treaty of alliance with France', 'Nothing of note'] }],
  [day(4, 24), "INDIA. Grave disturbances at Peshawar; troops were called out."],
  [day(4, 28), "THE CUP FINAL. Arsenal beat Huddersfield Town by two goals to none at Wembley, while the great airship Graf Zeppelin passed over the ground.", { q: 'Who won the Cup Final at Wembley?', opts: ['Arsenal', 'Huddersfield Town', 'Newcastle United'] }],
  [day(5, 2), "THE NEW PLANET is to be called Pluto, after the god of the underworld. CRICKET: young Bradman, of the Australians, makes 236 against Worcestershire.", { q: 'What name was given to the new planet?', opts: ['Pluto', 'Minerva', 'Vulcan'] }],
  [day(5, 6), "INDIA. Mr. Gandhi has been arrested in the night and taken to prison. AVIATION: Miss Amy Johnson, a young Englishwoman, has set out alone from Croydon to fly to Australia.", { q: 'What happened to Mr. Gandhi in May?', opts: ['He was arrested and taken to prison', 'He was received by the King', 'He died'] }],
  [day(5, 12), "MISS AMY JOHNSON has reached Karachi in six days, a record for the flight from England to India."],
  [day(5, 21), "SIR OSWALD MOSLEY has resigned from the Government, his proposals for dealing with unemployment having been rejected by the Cabinet.", { q: 'Who resigned from the Government in May?', opts: ['Sir Oswald Mosley', 'Mr. Snowden', 'Mr. MacDonald'] }],
  [day(5, 23), "INDIA. Volunteers marching on the salt works at Dharasana were beaten down by the police; many were injured."],
  [day(5, 26), "MISS AMY JOHNSON has reached Port Darwin, the first woman to fly alone from England to Australia.", { q: 'What did Miss Amy Johnson do in May?', opts: ['She flew alone from England to Australia', 'She swam the Channel', 'She sailed round the world'] }],
  [day(6, 2), "CRICKET. Bradman has scored a thousand runs before the end of May."],
  [day(6, 5), "THE DERBY has been won by Blenheim, the Aga Khan's horse.", { q: 'Which horse won the Derby?', opts: ['Blenheim', 'Shaun Goilin', 'Felstead'] }],
  [day(6, 11), "INDIA. The first volume of the report of Sir John Simon's Commission is published."]
];
const RUNNING = [
  [day(3, 15), day(4, 6), "INDIA. Mr. Gandhi's march to the sea continues, followed by great crowds."],
  [day(4, 8), day(5, 5), "INDIA. Salt is being made unlawfully in many places; there are many arrests."],
  [day(5, 7), day(5, 25), "MISS AMY JOHNSON is flying on towards Australia, alone in her little Moth aeroplane."],
  [day(4, 25), day(6, 11), "CRICKET. The Australian cricketers are playing the counties before the Test matches."],
  [day(3, 14), day(6, 11), "UNEMPLOYMENT continues to rise; more men are stood off in the docks and the mills."]
];
// Real cables of the same day from the Washington Evening Star (Chronicling America, Library of Congress),
// fetched by fetchnews.js into news_loc/<date>.json. OCR text, lightly cleaned; London and Empire first.
const fs = require('fs'), path = require('path');
const T0 = Date.UTC(1930, 2, 14); const isoOf = d => new Date(T0 + d * 864e5).toISOString().slice(0, 10);
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
  const f = path.join(__dirname, 'news_loc', isoOf(d) + '.json'); if (!fs.existsSync(f)) return [];
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; }
  return j.items.map(c => ({ c, r: RANK(c.place), t: cleanCable(c) })).filter(x => x.t).sort((a, b) => a.r - b.r).slice(0, n).map(x => ({ text: x.t, p: null, cable: true, src: x.c.url }));
}
// Preferred: NewsWire (Dell Research Harvard, CC-BY 4.0): de-duplicated US wire stories of 1930 with
// OCR-cleaned text, wire city and country; `cluster` = how many papers printed the story. A London paper
// of the morning of day d carries the cables dated the day before.
let WIRE = null;
function wireFor(d, n = 2) {
  if (WIRE === null) { try { WIRE = JSON.parse(fs.readFileSync(path.join(__dirname, 'newswire_spring1930.json'), 'utf8')); } catch (e) { WIRE = {}; } }
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
