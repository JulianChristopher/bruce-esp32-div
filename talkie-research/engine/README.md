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
