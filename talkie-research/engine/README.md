# World engine (v9–v10)

talkie-1930 as the mind of three Londoners in the winter of 1931 (2 January – 1 April), inside a world engine.

- `world.js` – the engine, no language model: time and events, places with walking times and opening hours, things,
  needs, actions as data (where, when, cost, duration, needs met, effect), practices, background routines,
  perception by place, facts with a source; snapshots, forks and rollouts; urgency; wellbeing; `judge()` rolls a copy
  of the world on for a day under every course open to a person.
- `london1931.js` – London as data: 24 places, 18 people, 36 actions, things that can be pawned.
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
