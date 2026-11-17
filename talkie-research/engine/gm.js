// The game master: a modern Claude model (through the headless `claude -p` of this session) that orchestrates the
// world engine. It never writes words a character reads or speaks: it answers only in fixed structures (operations
// of the engine, names from fixed lists), which the engine checks and carries out or refuses. talkie stays the voice
// and the will of every person; the records stay the only source of news.
//   interpret(ctx, sentence) -> an engine operation for a free sentence the grammar could not place
//   review(ctx)              -> is a person stuck, or caught in a literary pattern (despair, a pawning spiral, melodrama),
//                               and which of the world's ordinary answers fits (a neighbour, the constable, rest, a direct question)
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const MODEL = process.env.GM_MODEL || 'claude-haiku-5-5';
const OFF = process.env.GM === '0';
const STATS = { calls: 0, ms: 0, cost: 0, errors: 0 };
let LOG = null;
const SYSTEM = `You are the game master of a historical simulation of working-class and clerical London, January 1931 onwards.
The characters are played by a separate language model of the period; you never speak for them and never invent news.
Your only job is to map what a character says it does onto the operations of the world engine, or to judge whether a
person's recent course is stuck or caught in a literary pattern, and to choose the ordinary answer the world of 1931
would give. Use only the lists you are given. Think as a sober social historian of 1931 London: what would really happen,
at this hour, in this place, with this money. Never use knowledge of anything after the date you are given.
Never choose an operation that harms a person: if a character speaks of killing or drowning themselves, choose "despair".`;
const OPS = ['buy', 'send', 'pawn', 'sell', 'redeem', 'give', 'lend', 'repay', 'borrow', 'ask', 'rent', 'eat', 'drink', 'cook', 'fire', 'gas', 'smoke', 'mend', 'knit', 'wash',
  'seekwork', 'fetch', 'nurse', 'comfort', 'thank', 'apologise', 'quarrel', 'warn', 'promise', 'talk', 'write', 'post', 'telegram', 'bet', 'save', 'hide', 'pray', 'read', 'sing',
  'play', 'sleep', 'rest', 'walk', 'work', 'go', 'match', 'pictures', 'library', 'mission', 'police', 'reckon', 'lookup', 'steal', 'despair', 'none'];
function call(user, schema) {
  if (OFF) return Promise.resolve(null);
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn('claude', ['-p', '--model', MODEL, '--tools', '', '--no-session-persistence', '--system-prompt', SYSTEM, '--output-format', 'json', '--json-schema', JSON.stringify(schema)], { cwd: '/tmp' });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', () => {});
    const kill = setTimeout(() => p.kill('SIGKILL'), 90000);
    p.on('close', () => {
      clearTimeout(kill); STATS.calls++; STATS.ms += Date.now() - t0;
      try { const j = JSON.parse(out); STATS.cost += j.total_cost_usd || 0; const r = j.structured_output || null; if (LOG) fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), user: user.slice(0, 1500), out: r, ms: Date.now() - t0 }) + '\n'); res(r); }
      catch (e) { STATS.errors++; res(null); }
    });
    p.stdin.end(user);
  });
}
// ctx: { date, time, who, name, place, purse, rentDue, inPawn[], own[], present[{id,name}], people[{id,name}], places[{id,name,open}], recent[] }
function describe(ctx) {
  return [`Date: ${ctx.date}, ${ctx.time}. Person: ${ctx.name} (${ctx.who}). Place: ${ctx.place}. Purse: ${ctx.purse}.`,
    ctx.rentDue ? `Rent: ${ctx.rentDue}.` : '', ctx.own && ctx.own.length ? `Owns (can pawn or sell): ${ctx.own.join('; ')}.` : '', ctx.inPawn && ctx.inPawn.length ? `In pawn at Lamb's: ${ctx.inPawn.join('; ')}.` : '',
    ctx.present && ctx.present.length ? `Here: ${ctx.present.map(p => `${p.name} [${p.id}]`).join('; ')}.` : 'Nobody else here.',
    `People who can be named (id): ${ctx.people.map(p => `${p.id}=${p.name}`).join(', ')}.`,
    `Places (id, open now?): ${ctx.places.map(p => `${p.id}${p.open ? '' : ' (shut)'}`).join(', ')}.`,
    ctx.pressing ? `Pressing now (engine's measure, 0-100): ${ctx.pressing.length ? ctx.pressing.join(', ') : 'nothing'}.` : '', ctx.failures ? `Attempts the world refused or did not understand today: ${ctx.failures}.` : '',
    ctx.recent && ctx.recent.length ? `Recently:\n- ${ctx.recent.join('\n- ')}` : ''].filter(Boolean).join('\n');
}
const S_INTERPRET = { type: 'object', additionalProperties: false, required: ['op', 'item', 'goods', 'person', 'place', 'pence', 'plausible'], properties: {
  op: { type: 'string', enum: OPS }, item: { type: 'string', description: 'the thing pawned, sold, redeemed or stolen, in plain words, or ""' },
  goods: { type: 'string', description: 'what is bought, given or sent for, in plain words, or ""' }, person: { type: 'string', description: 'id of the person addressed or concerned, or ""' },
  place: { type: 'string', description: 'id of the place where it is done, or ""' }, pence: { type: 'integer', description: 'sum of money in pence, or 0' },
  plausible: { type: 'boolean', description: 'could such a person really do this, here and now, in 1931?' } } };
async function interpret(ctx, sentence) {
  const r = await call(`${describe(ctx)}\n\nThe character says: "${sentence}"\n\nWhich single operation of the engine is meant (the first deed, if several)? Choose "none" if nothing is done.`, S_INTERPRET);
  return r;
}
const S_REVIEW = { type: 'object', additionalProperties: false, required: ['stuck', 'pattern', 'answer'], properties: {
  stuck: { type: 'boolean' }, pattern: { type: 'string', enum: ['none', 'despair', 'pawning_spiral', 'melodrama', 'repetition', 'forgetting_facts'] },
  answer: { type: 'string', enum: ['none', 'neighbour_calls', 'constable_speaks', 'goes_home_to_rest', 'ask_directly_about_rent', 'remind_of_purse', 'friend_offers_work'] } } };
// ---------- open deeds: the game master writes a short program of primitive operations (see ops1931.js) ----------
const PRIMS = ['go', 'wait', 'buy', 'pay', 'earn', 'give', 'use', 'pledge', 'sell', 'redeem', 'need', 'relate', 'request', 'talk', 'create', 'schedule', 'despair', 'none'];
const S_RESOLVE = { type: 'object', additionalProperties: false, required: ['plausible', 'ops'], properties: {
  plausible: { type: 'boolean', description: 'could such a person really do this, here and now, in 1931?' },
  ops: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['op'], properties: {
    op: { type: 'string', enum: PRIMS },
    to: { type: 'string', description: 'place id (go) or person id (pay, give)' }, at: { type: 'string', description: 'place id where something is bought, sold, or where a new person is found' },
    with: { type: 'string', description: 'person id (talk, relate)' }, of: { type: 'string', description: 'person id who is asked (request)' }, who: { type: 'string', description: 'person id (schedule)' },
    thing: { type: 'string', description: 'object id, or food / coal, or an inventory word' }, what: { type: 'string', description: 'goods in plain words (buy, request goods)' },
    qty: { type: 'integer' }, pence: { type: 'integer' }, minutes: { type: 'integer' }, delta: { type: 'number' }, in_hours: { type: 'number' },
    need: { type: 'string', enum: ['hunger', 'warmth', 'energy', 'social'] }, kind: { type: 'string', description: 'request kind, or kind of a new entity' },
    entity: { type: 'string', enum: ['place', 'person', 'thing'] }, hint: { type: 'string', description: 'for create: a short plain noun phrase of 1931, e.g. "a coffee-stall by London Bridge"' },
    district: { type: 'string' }, opens: { type: 'number', description: 'hour' }, closes: { type: 'number', description: 'hour' }, value: { type: 'integer', description: 'pawn value in pence' },
    event: { type: 'string', enum: ['repay', 'visit', 'letter', 'court', 'collect', 'return', 'deliver', 'meet', 'work'] }, for: { type: 'string', description: 'a few plain words' }, topic: { type: 'string' } } } } } };
const OPS_GUIDE = `Operations you may use (in order, at most 8):
go{to:place id} | wait{minutes, for} | buy{what, qty, at:place id, pence (only if not ordinary groceries)} | pay{to:person id or "rent"/"fare"/"collection"/"doctor"/"club", pence, for}
earn{pence, minutes, for} (casual work: about 4-8d. an hour) | give{thing, qty, to:person id} | use{thing: food|coal|item} | pledge{thing:object id} | sell{thing, at} | redeem{thing}
need{need, delta -40..30} | relate{with, delta -2..2} | request{of:person id, kind: loan|credit|goods|work|wait|favour|help|relief, pence, what} (the other person decides; never decide it yourself)
talk{with:person id, topic} | create{entity: place|person|thing, kind, hint, district, opens, closes, value} (only if the deed needs something not in the lists; refer to it afterwards as "$new")
schedule{in_hours, event: repay|visit|letter|court|collect|return|deliver|meet|work, who, pence, for} | despair{} (for any words of self-harm) | none{}.
Use ids exactly as listed. Money in pence (1s = 12d, £1 = 240d). Do not decide another person's will: ask with request.
People own ordinary things that are not in the lists (a tea-caddy, a razor, a pair of sheets): to pawn, sell or give one, first create{entity:"thing", kind, hint, value} and then use "$new".
A place or person the deed needs that is not listed (a coffee-stall, a moneylender, the rag-and-bone man) is created first with create, and then referred to as "$new" ("$new1" for the second one created).
"plausible" is false only if such a person could not do this in 1931 at all; a deed that merely needs a new place, person or thing is plausible.`;
async function resolve(ctx, sentence, failure) {
  return call(`${describe(ctx)}\n${ctx.extra || ''}\n\n${OPS_GUIDE}\n\nThe character says: "${sentence}"${failure ? `\n\nYour last program could not be carried out: ${failure}. Write a corrected program that keeps to what the character said, or {op:"none"} if it cannot be done.` : ''}\n\nWrite the program of operations for what the character does now.`, S_RESOLVE);
}
async function review(ctx) { return call(`${describe(ctx)}\n\nLook at the person's recent course. Ordinary routine repeated (work at the office, meals, sleep, housework, the daily round) is normal life and NOT stuck. Answer stuck=true only if (a) something pressing is going unanswered while the person does unrelated or failing things, or (b) the same failing attempt is repeated, or (c) the person's words show despair or melodrama out of proportion to the facts (money in hand, food, rent). If not clearly so, answer stuck=false, pattern none, answer none. Which ordinary answer of the world fits best?`, S_REVIEW); }
function setLog(dir) { LOG = path.join(dir, 'gm_log.jsonl'); }
module.exports = { interpret, resolve, review, describe, STATS, OPS, setLog, MODEL };
