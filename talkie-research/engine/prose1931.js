// Period prose for the prompts: the same facts the engine knows, told as a page of a novel of 1931 would tell them
// (past tense, words not figures, shillings and pence as people said them). talkie read such pages, not forms.
'use strict';
const NUM = ['nought', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const num = n => n < 20 ? NUM[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + NUM[n % 10] : '') : String(n);
const PENCE = ['', 'a penny', 'twopence', 'threepence', 'fourpence', 'fivepence', 'sixpence', 'sevenpence', 'eightpence', 'ninepence', 'tenpence', 'elevenpence'];
function moneyWords(d) {   // 141 -> "eleven and ninepence"; 12 -> "a shilling"; 30 -> "half a crown"; 4 -> "fourpence"
  d = Math.round(d); if (d < 0) return 'less than nothing';
  const P = Math.floor(d / 240), s = Math.floor((d % 240) / 12), p = d % 12;
  if (P) return `${P === 1 ? 'a pound' : num(P) + ' pounds'}${s ? ' ' + num(s) : ''}${p ? (s ? ' and ' : ' and ') + PENCE[p] : ''}`;
  if (!d) return 'not a penny';
  if (d === 30) return 'half a crown';
  if (!s) return PENCE[p];
  if (!p) return s === 1 ? 'a shilling' : `${num(s)} shillings`;
  return s === 1 ? `one and ${PENCE[p]}` : `${num(s)} shillings and ${PENCE[p]}`;
}
function clockWords(m) {   // minutes of the day -> "a quarter to seven in the evening"
  const h = Math.floor(m / 60), mi = m % 60, H = ((h + 11) % 12) + 1, N = ((H % 12) + 1);
  const part = h < 12 ? 'in the morning' : h < 18 ? 'in the afternoon' : 'in the evening';
  if (mi === 0) return h === 12 ? 'noon' : `${num(H)} o'clock ${part}`;
  if (mi === 15) return `a quarter past ${num(H)} ${part}`;
  if (mi === 30) return `half past ${num(H)} ${part}`;
  if (mi === 45) return `a quarter to ${num(N)} ${part}`;
  return mi < 30 ? `${num(mi)} minute${mi > 1 ? 's' : ''} past ${num(H)} ${part}` : `${num(60 - mi)} minute${60 - mi > 1 ? 's' : ''} to ${num(N)} ${part}`;
}
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORD = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
// present tense facts -> past ("she keeps" -> "she kept"); only what the bios and scene lines use
const PASTV = { is: 'was', are: 'were', has: 'had', have: 'had', keeps: 'kept', calls: 'called', goes: 'went', owes: 'owed', lives: 'lived', works: 'worked', pays: 'paid', comes: 'came', knows: 'knew', thinks: 'thought',
  says: 'said', likes: 'liked', loves: 'loved', hates: 'hated', fears: 'feared', hopes: 'hoped', wants: 'wanted', gets: 'got', gives: 'gave', takes: 'took', reads: 'read', sends: 'sent', sings: 'sang', walks: 'walked',
  "doesn't": "didn't", "don't": "didn't", 'does': 'did', 'will': 'would', "won't": "wouldn't", 'can': 'could', "can't": "couldn't", 'cannot': 'could not', 'stands': 'stood', 'lies': 'lay', 'sits': 'sat', 'burns': 'burned', 'opens': 'opened', 'shuts': 'shut' };
Object.assign(PASTV, { believes: 'believed', depends: 'depended', holds: 'held', scratch: 'scratched', means: 'meant', needs: 'needed', owns: 'owned', feels: 'felt', looks: 'looked', seems: 'seemed', hangs: 'hung',
  plays: 'played', coughs: 'coughed', knits: 'knitted', remains: 'remained', expects: 'expected', lets: 'let', makes: 'made', leaves: 'left', sleeps: 'slept', waits: 'waited', tells: 'told', hears: 'heard', sees: 'saw',
  speaks: 'spoke', runs: 'ran', smells: 'smelt', ticks: 'ticked', rattles: 'rattled', drips: 'dripped', shines: 'shone', blows: 'blew', falls: 'fell', grows: 'grew', begins: 'began', keep: 'kept', owe: 'owed', need: 'needed' });
const PASTRE = new RegExp('\\b(' + Object.keys(PASTV).map(x => x.replace(/'/g, "'")).join('|') + ')\\b', 'g');
const past = s => (s || '').replace(PASTRE, v => PASTV[v] || v);
const PORTRAIT = {
  ada: 'Mrs. Ada Turner was a charwoman of forty-one, a war-widow who lived in two rooms in Bermondsey with her son Bert, a docker. She was honest and chapel-going, proud and sharp-tongued, but kind, and very poor.',
  arthur: 'Mr. Arthur Hale was a ledger clerk of thirty-four at an insurance office in Moorgate, at three pounds ten a week, with a wife, Edith, and a little daughter, Joan, of seven. He was conscientious and careful with money, and timid with his superiors.',
  thomas: 'Mr. Walter Thomas, fifty-six, was chief clerk of the Moorgate Fire and Life Assurance Company and paid the wages on Fridays. He was a widower and lived in Highbury; stern, exact and dutiful, fair, and kinder than he let anyone see.'
};
const SHORT = { ada: 'Mrs. Turner', arthur: 'Mr. Hale', thomas: 'Mr. Thomas' };
const list = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// weather text from life1931 ("frosty and bright (-1° to 16°C)") -> "frosty and bright"
const wxWords = t => (t || '').replace(/\s*\([^)]*\)/, '').trim();
// The page: when and where, who, what is round her, what presses, what is near. f: { date, wx, place, present[], purse, bio, scene[], feels[], now[], near[], extra[] }
function page(k, f) {
  const he = k === 'ada' ? 'she' : 'he', his = k === 'ada' ? 'her' : 'his';
  const out = [];
  out.push(`It was ${clockWords(f.mod)} on ${/^[aeiou]/.test(wxWords(f.wx)) ? 'an' : 'a'} ${wxWords(f.wx)} ${WD[f.date.getUTCDay()]}, the ${ORD(f.date.getUTCDate())} of ${MON[f.date.getUTCMonth()]}, 1931.`);
  out.push(PORTRAIT[k]); if (f.bio) out.push(cap(past(f.bio)));
  out.push(`${cap(he)} was in ${f.place}${f.present.length ? ', with ' + list(f.present) : ', alone'}, and had ${moneyWords(f.purse)} in ${his} ${k === 'ada' ? 'purse' : 'pocket'}.`);
  for (const x of [...(f.scene || []), ...(f.feels || [])]) if (x) out.push(cap(past(x.replace(/\.$/, ''))) + '.');
  if (f.near && f.near.length) out.push(`Near by ${f.near.length > 1 ? 'there were still open ' + (f.near.some(n => n.includes(',')) ? f.near.slice(0, -1).join('; ') + '; and ' + f.near[f.near.length - 1] : list(f.near)) : f.near[0] + ' was still open'}.`);
  // what presses comes last, in a paragraph of its own, as a novel sets the turn of a scene
  const press = [...(f.pressing || []), ...(f.now || []), ...(f.extra || [])].filter(Boolean).map(x => cap(past(x.replace(/\.$/, ''))) + '.');
  return (out.join(' ') + (press.length ? '\n\n' + press.join(' ') : '')).replace(/\.\./g, '.');
}
// the question that goes with the page, and its answer form (past tense: the novel's voice)
const question = (k, what = 'do then') => `What did ${SHORT[k]} ${what}? Answer in the form: ${k === 'ada' ? 'She' : 'He'} ...`;
// past tense answers back to the present, for the deed parser
const PRES = { paid: 'pays', went: 'goes', took: 'takes', gave: 'gives', sent: 'sends', bought: 'buys', sold: 'sells', lent: 'lends', begged: 'begs', lit: 'lights', made: 'makes', kept: 'keeps', laid: 'lays', ran: 'runs',
  got: 'gets', wrote: 'writes', sat: 'sits', told: 'tells', said: 'says', spoke: 'speaks', left: 'leaves', slept: 'sleeps', ate: 'eats', drank: 'drinks', sought: 'seeks', found: 'finds', fed: 'feeds', put: 'puts',
  hid: 'hides', sang: 'sings', thought: 'thinks', brought: 'brings', fetched: 'fetches', taught: 'teaches', knit: 'knits', swept: 'sweeps', stood: 'stands', came: 'comes', did: 'does', had: 'has', was: 'is', were: 'are', lay: 'lies', read: 'reads', set: 'sets', let: 'lets', shut: 'shuts', cut: 'cuts' };
function present(text) {
  if (!text) return text;
  return text.replace(/\b([A-Za-z]+)\b/g, (w, v, i) => {
    const l = v.toLowerCase(); if (PRES[l]) return PRES[l];
    // regular -ed verbs: only where a verb stands (after she/he/and/then/to have, or sentence start)
    if (/ed$/.test(l) && l.length > 4 && /(^|\b(she|he|and|then|but|or)\s+|,\s*)$/i.test(text.slice(Math.max(0, i - 6), i))) {
      if (/ied$/.test(l)) return l.replace(/ied$/, 'ies');
      if (/(ss|sh|ch|x|zz)ed$/.test(l)) return l.replace(/ed$/, 'es');
      if (/([bdfgklmnprtz])\1ed$/.test(l) && !/(ll|ss)ed$/.test(l)) return l.replace(/.ed$/, 's');
      if (/[sczgvu]ed$/.test(l) || (/[^aeiou][aeiou][^aeiouwyx]ed$/.test(l) && !/(it|er|en|on|el|ol|in|om|or|ar|ow|ot|et|ad|ul)ed$/.test(l))) return l.replace(/d$/, 's');
      return l.replace(/ed$/, 's');
    }
    return v;
  });
}
module.exports = { moneyWords, clockWords, past, present, page, question, PORTRAIT, SHORT, num, list, wxWords };
