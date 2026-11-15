// Counts words and turns of phrase that a Londoner of 1931 would not have used, in the speech and thoughts of a run.
// Usage: node anachron.js <run folder> [...]
const fs = require('fs');
const MODERN = [
  ['okay', /\b(ok|okay)\b/i], ['decimal money', /£\s?\d+\.\d\d|\b\d+p\b/], ['prioritize', /\bprioriti[sz]/i], ['focus on', /\bfocus(ed|ing)? on\b/i],
  ['stress', /\bstress(ed|ful)?\b/i], ['workplace', /\bwork-?place\b/i], ['work-life', /\bwork-life\b/i], ['team', /\bteam(s|work)?\b/i],
  ['feedback', /\bfeedback\b/i], ['reach out', /\breach(ed|ing)? out\b/i], ['mental health', /\bmental health\b/i], ['self-care', /\bself-care\b/i],
  ['guys/kids', /\b(guys|kids)\b/i], ['awesome/cool', /\b(awesome|cool)\b(?! (morning|day|evening|air|weather|breeze))/i], ['schedule', /\bschedul(e|ing)\b/i],
  ['dad/mom', /\b(dad|mom|mommy)\b/i], ['television', /\b(tv|television)\b/i], ['computer/phone', /\b(computer|cell ?phone|smartphone|email|internet)\b/i],
  ['positive/negative', /\b(positive|negative) (attitude|impact|energy|environment)\b/i], ['ensure', /\bensur(e|ing)\b/i], ['maintain', /\bmaintain(ing)?\b/i],
  ['support (verb)', /\bsupport(ing|ive)? (her|him|them|me|you|my|the family)\b/i], ['appreciate', /\bappreciat(e|ion)\b/i], ['quality time', /\bquality time\b/i]
];
for (const dir of process.argv.slice(2)) {
  const story = fs.readFileSync(`${dir}/story.txt`, 'utf8').split('\n');
  const said = story.filter(l => /^\s+(Mrs\.|Mr\.|Bert|Joan|Arthur|Ada).{0,40}: "/.test(l) || /thinks: /.test(l)).map(l => l.replace(/^[^:"]*[:]\s*/, ''));
  const text = said.join(' '); const words = (text.match(/[A-Za-z']+/g) || []).length;
  const hits = MODERN.map(([name, re]) => [name, said.filter(l => re.test(l)).length]).filter(x => x[1]);
  const total = hits.reduce((s, x) => s + x[1], 0);
  console.log(JSON.stringify({ run: dir, lines: said.length, words, avgWordsPerLine: +(words / Math.max(1, said.length)).toFixed(1), anachronisticLines: total, per100lines: +(100 * total / Math.max(1, said.length)).toFixed(1), hits }));
}
