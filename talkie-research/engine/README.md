# World engine (v9–v10)

talkie-1930 as the mind of three Londoners in the winter of 1931 (2 January – 1 April), inside a world engine.

- `world.js` – the engine, no language model: time and events, places with walking times and opening hours, things,
  needs, actions as data (where, when, cost, duration, needs met, effect), practices, background routines,
  perception by place, facts with a source; snapshots, forks and rollouts; urgency; wellbeing; `judge()` rolls a copy
  of the world on for a day under every course open to a person.
- `london1931.js` – London as data: 37 places (with the free library, the wash-house, the picture palaces, the Salvation Army hall), 18 people, 36 actions, 22 things that can be pawned or sold.
- `life1931.js` – no script: casual dock work, illness (household contagion, cold, hunger), post and visits, finds;
  real daily weather (Met Office HadCET temperatures, HadSEEP rainfall) for 2 Jan – 1 Apr 1931.
- `intent.js` – the grammar that turns talkie's free sentences into world operations.
- `bio1931.js` – life stories of the three main characters (retrieved two facts at a time).
- `news1931.js` + `newswire_winter1931.json` – the daily paper: 14 headline items checked against NewsWire 1931
  (Dell Research Harvard, CC-BY 4.0) and the real AP stories of the day before.
- `sim10.js` – the driver: free actions (no list from the engine), deliberation with several thoughts and the world's
  foresight, second thoughts (veto), body chemistry (stress, arousal, mood, surprise), dreams, goals, institutions of
  1931 (dole, relief, savings), gossip with retelling, talkie as game master for plausibility; every real decision is
  judged by the engine (`METRICS.decisions`).
- `situations.js` – the situation bank: 5 000 situations from 14 kinds, judged by the engine (1 674 decisive).
  `bankrun.js` puts talkie to them. `reasonbench.js` / `reasonbench.log`: four ways of reasoning compared on 6 situations
  (open question 10/18 sensible, story 2/18, steps 4/18, foresight 11/18).

## Free deeds from parts (v10.1)

No list of options: talkie says what a person does, in its own words, and the engine builds the deed from parts.

- `goods1931.js` – 63 goods of a London household in 1931 with prices in pence, the shops that sell them and what they
  do in the world (meals, fuel, warmth, cure, gift, drink, tobacco, light, mending). Unknown goods ('a pennyworth of
  treacle', 'an ounce of quinine') become a sundry at about threepence.
- `verbs.js` – `frame(text)` reads a sentence as verb + goods/thing + amount + persons + place + purpose (the novel's
  past tense is read as well); `deed(world, who, frame)` turns the frame into an engine deed or the reason it cannot be
  done ('the shop is shut', 'she has only 4d.', 'the watch is in pawn already'). About 47 verb schemas, including
  stealing (a quarter chance of being caught: the police court and the loss of her places), the pictures, the free
  library, the wash-house and the Salvation Army.
- `combos.js` – counts: the grammar spans 47 verbs × 82 goods and things × 20 persons × 32 places × 12 amounts ≈ 30
  million single deeds; in 28 real situations the engine accepts about 970 different written deeds each (47 % of those
  tried). Eight own deeds a day give ~10^23 paths; a week of three households ~10^500.
- `rescore.js` / `bankcmp.js` – judge saved answers again with the current grammar; paired comparison of prompt styles.

## Period language (prose1931.js)

The same facts as a page of a novel of 1931: past tense, the time and money in words ('a quarter to seven in the
evening', 'eleven shillings and ninepence'), the people by the names their own people use; what presses comes last,
in a paragraph of its own. `PROSE=0` turns it off in `sim10.js`.

Bank test, 140 decisive situations, every free answer judged by the engine (rel = 0 worst listed course, 1 best;
paired over the 71 situations judged in all three):

| prompt | mean | notes |
|---|---|---|
| labelled lines (CHARACTER:, PLACE:, NOW: …) | 0.69 | |
| novel page, asked in the present ("What does Mrs. Turner do now?") | 0.63 | better for rent and hunger; worse when the illness was mid-paragraph |
| novel page, asked in the past ("What did Mrs. Turner do then?") | 0.59 | invites drama: 'She stole a loaf', 'She robbed Barker' |

Second version of the novel page, with what presses last, in a paragraph of its own (`hybrid2`), re-judged with the
current engine (`node rescore.js`; paired over 75 situations judged in all three):

| prompt | paired mean | all answers | poor (<0.3) | better than every listed course |
|---|---|---|---|---|
| labelled lines | 0.63 | 0.57 | 36 | 12 |
| novel page v1 | 0.61 | 0.60 | 35 | 12 |
| novel page v2, what presses last | **0.67** | **0.67** | **28** | **20** |

The prose wins for rent, hunger, cold and the morning walk to work; the labelled lines still win when a child is ill
(0.60 against 0.37). `sim10.js` uses the v2 page by default.

## Chronos: the outside world played in from records (chronos1931.js)

- sun and moon over London computed (sunrise, sunset, lighting-up time under the Road Transport Lighting Act 1927,
  phase of the moon); Ada's light is a penny-in-the-slot gas meter (a penny for about four hours).
- every League and Cup match of the London clubs, 1 Jan – 6 Apr 1931 (`football1931.json`, from engsoccerdata):
  in the Saturday-night and Monday papers, in small talk ("Millwall beat Burnley by two goals to one"), and as a deed
  (Bert at the Den when Millwall are at home; a shilling on the terraces).
- the main Commons debates of each sitting (`hansard1931.json`, from Historic Hansard, crawled by `hansard.py`).
- public-house hours by the Licensing Act 1921 for London (11.30–3, 5.30–11; Sundays 12.30–2.30, 7–10).

## Period tools (as deeds, no JSON)

telegram (a shilling for twelve words, delivered within the hour or two), reckoning up (the engine does the sums,
the person reads them in words: purse, slate, loans, pledges and their redemption price, rent, food and coal),
looking it up (talkie writes as *Enquire Within Upon Everything* or a home doctor-book of the 1920s would; the page
goes into the person's books).

## The Buildings (street1931.js)

Thirty households (about 110 people) in Ada's block, drawn from the figures of the New Survey of London Life and
Labour, the Ministry of Labour Gazette and the 1931 insurance rates: casual dock work by the day (less in frost),
weekly wages, the dole, the pension; rent day on Monday; the weekly pledge (in on Monday, out on Saturday), the slate
at Barker's, going short, illness (cold, hunger, contagion), being stood off, notice to quit and eviction, rows on
pay-night, births and deaths. What happens there becomes gossip through Mrs. Nolan; Barker's willingness to give
credit follows the street's slate; in the evening a neighbour may come to Ada's door to ask for a loan or for help
with a sick child, and Ada answers by her own free deed. `node streettest.js` runs the street alone for 90 days.

## Health, fog, police, gossip, geography (v10.2)

- `health1931.js` – the influenza epidemic of 1931 in London (LCC Medical Officer of Health, report for 1931: epidemic
  from January, peak in the week ended 14 February with 116 deaths, 797 deaths in the 13 weeks to 4 April, about 70 %
  aged 55 and over; weekly series reconstructed around those two figures); infections run ahead of deaths; fatality by
  age; crowded rooms and a sick household raise the chance. Background deaths at Bermondsey's 1931 rates (12.5 a
  thousand, infants 57 a thousand; Report of the MOH for Bermondsey, 1931). The Wednesday paper reports the epidemic
  (the figure 116 only where it is on record, otherwise in words). Fog days from the real weather (dry, cold, small
  day-night range): 14 in the quarter, two of them thick; then the ships are not worked, the ways are half as long
  again, the lamps burn at midday and chests suffer.
- Police: P.C. Dawe walks the Bermondsey beat; street betting with the bookie's runner can end in a raid and a summons
  (Street Betting Act 1906; a fine at Tower Bridge Police Court); a drunk on pay-night may be taken in (five shillings
  or five days); found property can be handed in at the station (the half-crown storyline); the constable can be
  fetched. Court cases of the Buildings appear in Ada's Friday paper as local news.
- Gossip: stories change as they are passed on without a model (sums grow, words become blows, 'They say…'); each
  person has a standing in the Buildings (lending, sitting with a sick child, honesty raise it; refusing, court lower it);
  Barker hears of it; Ada knows how she stands. `METRICS.knowledge` keeps who knows what.
- `geo1931.js` – every place has a position; ways are timed from real distances (walking ~4.5 km/h, streets a third
  longer than the straight line; the clerks take the tram for a penny or twopence, Ada walks). Ada's walk to Moorgate:
  44 minutes; Arthur by tram: 26. Every quarter hour the place of every named person is written to `positions.jsonl`,
  every move with its time to `moves.jsonl`.

## Open world (v11): open deeds, learned rules, time by salience, calibration

Design and order of work: `../DESIGN-dynamic.md`. The engine codes only grounded variables; everything else is
composed, checked and remembered.

- **Open deeds** (`ops1931.js`, `gm.js`, `registry1931.js`). When the grammar cannot place a sentence of talkie's
  (several deeds in one sentence, unknown things or places), the game master (a modern Claude model through the
  headless `claude -p`, answering only in typed fields) writes a short program of primitive operations: go, wait,
  buy, pay, earn, give, use, pledge, sell, redeem, need, relate, request, talk, create, schedule, away, despair. The
  engine tries the program on a fork of the world, checks every step (money, ownership, opening hours, distance,
  price bands of 1931, casual pay rates), and either offers it as the deed or sends the reason back for one repair.
  Other people's will is never decided by the program: `request` asks them (talkie speaks for them). `create`
  adds a place, person or thing the deed needs (generate once, persist; talkie names it); places out of London are
  refused, a journey out of London is `away`.
- **Provenance of words.** Text a character reads comes only from the character's own sentence, the world's names
  or the engine's vocabulary. The game master's free text (for, topic, what, hint) is kept only if every content
  word has such a source; otherwise it is replaced by the character's own clause or dropped. Refusals reach the
  character in engine words ("it could not be done"), never in the words of the frame.
- **Learned rules** (`rules1931.js`). A program the game master wrote becomes a template whose arguments point to
  slots of the sentence (the person, the place, the goods in the character's words, the sum, the thing owned, the
  shop that sells the goods). Two agreeing cases make a rule; the cases are its tests (each must be re-created from
  its own slots). Rules are applied without a model call and audited against the game master now and then; a rule
  that disagrees more often than it agrees is retired. Rules persist (`RULES`, `RULES_SEED`).
- **Time by salience, weekly plans, promotion** (`tempo1931.js`). talkie is asked only when something is at stake
  for a person (needs, the mind, rent, illness, arrangements, a plan for the day, a visitor, company); otherwise
  habit runs on (`TEMPO=fine` restores the old behaviour, `ZMIN` sets the threshold). On Sunday evening (and at the
  start) each person says what he or she means to see to in the coming week; each item is tried on its day as an
  open deed, and the week's end notes what was done. Background people with much to do with the main persons are
  promoted (they remember the dealings, and the memory goes into their decisions and talk) and let go after a
  fortnight without dealings.
- **Calibration** (`calib1931.js`). The Buildings (30 households by rule) run for whole years with many seeds on
  the real day data; births, deaths, infant deaths and men out of work are measured against the Medical Officer of
  Health's figures for Bermondsey and the Ministry of Labour's local unemployment. Priors live in one place in
  `street1931.js` (`tune()`); `runs/calib_decade.json` holds the decade check (mean absolute error 1931-1940: 1.5 a
  thousand for death and birth rates, 1.4 points for men out of work).
- **The course of the family lives** (`lifecourse1931.js`). Bert walks out, may part, is engaged and marries by the
  rates of the 1931 census (single men: 86 % at 20-24, 47 % at 25-29, 22 % at 30-34; within the decade he marries
  about two times in three, at about twenty-five). talkie names the girl; the banns are read at St. James's; Ada
  decides whether the young couple live with her or take rooms of their own near by (then his money goes with him
  and she is alone). Joan sits the scholarship examination at eleven (May 1934: a secondary-school scholarship 5 %,
  a central-school place 16 %); Arthur decides whether she may take it; she leaves school at fourteen (Easter 1937),
  fifteen or sixteen, Arthur chooses her first place, and her board goes into the household. Mr. Thomas retires
  (the succession: Arthur or a stranger as chief clerk).
- **A late start** (`START=1936-03-02`): everybody is older by the years since January 1931, and the persons first
  read what the papers said in the years before (the editor's choice of a day a month for the last year, two days
  a year before that), kept as the past. Before the first plans the family's past is settled: Mr. Thomas's
  retirement, Joan's examination and leaving (Arthur is asked as in play), Bert's walking out and marriage by the
  same weekly chances (talkie names the girl, Ada decides where the young couple live). The street's own past
  (deaths, births, removals) is not reconstructed. Test hooks: `JOANOFFER=central|secondary`,
  `BERTPAST=courting|engaged|married`, `LIFETEST=bert` (courting, engagement and wedding on the first three days).
- **The site's moderation** refuses a few questions (0-2 % of calls; a question about a girl's name and courting
  among them): the girl's name is then asked in a second form, and failing that drawn from the names of the time
  (girls' names common among births of 1904-1914, ONS; common surnames and the Irish names of Bermondsey).
- Tests: `opstest.js` (open deeds in real situations), `rulestest.js` (rules learned and audited with the live game
  master), `prosetest.js`, `streettest.js`.

## Running the decade

```
cd talkie-research/engine
FAST=1 SAMPLE=4 DAYS=3652 RUN=decade RULES_SEED=runs/open4_rules.json node sim10.js > decade.log 2>&1
# after any interruption (the same RUN or OUTDIR):
FAST=1 SAMPLE=4 DAYS=3652 RUN=decade RESUME=1 node sim10.js >> decade.log 2>&1
```

| Play | talkie calls a day | wall time a day | 3,652 days | game master |
|---|---|---|---|---|
| default (time by salience) | 60 | 5.7 min | about 15 days | about 51,000 calls, $55-60 |
| `FAST=1 SAMPLE=4` (one week in four in full) | 14 | 1.6 min | about 4 days | about 15,000 calls, about $16 |
| `FAST=1 SAMPLE=8` | about 9 (estimate) | about 1.1 min (estimate) | about 3 days | about $11 |

Measured on 7-day runs (s4_1931) and four sampled weeks (dec28); game-master calls cost about $0.001 each. A run
writes a checkpoint every evening; scheduled letters and court days are lost on resume. A cloud container can be
replaced: keep `OUTDIR` where it survives, or push the run directory now and then. The monthly leakage probes
(`leak1931.js`) and the yearly New Year (ages, memory) run by themselves; `MORTAL=1` lets the main persons die by
the rates too.
