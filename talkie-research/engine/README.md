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
