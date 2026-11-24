# An open, dynamic world: research notes and design (November 2026)

The question: how to keep the world engine from narrowing what the period model (talkie) can do — no fixed lists of
places, things, verbs, answers or schedules — while keeping the world consistent, historically grounded and free of
modern knowledge.

## 1. What others found (short)

| work | finding that matters here |
|---|---|
| Concordia 2.0 (Vezhnevets et al., DeepMind 2025, [arXiv 2507.08892](https://arxiv.org/abs/2507.08892)) | The game master is itself an entity built from components. In "simulationist" use the GM "generatively manages open-ended world details", so the designer codes **only the mechanics that matter for the research question**. The three goals (simulationist, dramatist, evaluationist) pull against each other; pick one. |
| Wang et al., ACL 2024, [arXiv 2406.06485](https://arxiv.org/abs/2406.06485) | LLMs as world simulators: at most 59.9 % accuracy on non-trivial state changes; they fail on arithmetic, common sense and changes not caused by the actor. → keep grounded variables in code. |
| Labyrinth GM study, [arXiv 2409.06949](https://arxiv.org/html/2409.06949v1) | Game-specific functions (tool calls) improve both narrative quality and state consistency of an LLM game master. |
| World-state transformations (Góngora et al., ICCC'26, [arXiv 2605.24719](https://arxiv.org/abs/2605.24719)) | The LLM proposes transformations, a symbolic world model executes them with consistency checks: consistent and still open to creative input. |
| Infinite Craft ([survey arXiv 2402.18659](https://arxiv.org/pdf/2402.18659)) | Objects generated on demand by an LLM, then stored and always reused ("generate once, persist"). |
| Voyager / PoE-World ([arXiv 2505.10819](https://arxiv.org/abs/2505.10819)) | World rules and skills learned as small programs and kept in a library; many small programs scale better than one big one. |
| OMNI-EPIC (ICLR 2025, [arXiv 2405.15568](https://arxiv.org/abs/2405.15568)) | Environments written as code by a model, chosen for being learnable and interesting: open-endedness through generated code. |
| Affordable Generative Agents ([arXiv 2402.02053](https://arxiv.org/abs/2402.02053)) | Re-use learned plans ("lifestyle policy") and compressed social memory: token use down to about a third. |
| Agentopia ([arXiv 2606.07513](https://huggingface.co/papers/2606.07513)) | 100 agents over 10 simulated years; the week as time unit (plan, contact, activity, review); ~13.7 billion tokens. |
| AI Metropolis ([arXiv 2411.03519](https://arxiv.org/pdf/2411.03519)), Willowbrook rebuild | Fixed ticks waste most of the time; jump to the next event, let independent agents run out of order. |
| AgentSociety ([arXiv 2502.08691](https://arxiv.org/abs/2502.08691)), EconAgent ([ACL 2024](https://arxiv.org/abs/2310.10436)) | Large populations with economy, mobility, needs; validated by reproducing known social and economic patterns. |
| Park et al. 2024 ([arXiv 2411.10109](https://arxiv.org/abs/2411.10109)) | Agents grounded in rich life material reproduce people far better than agents built from demographics (normalised 0.85). |
| Anthis et al., ICML 2025 ([arXiv 2504.02234](https://arxiv.org/abs/2504.02234)); "Utopian illusion" ([arXiv 2510.21180](https://arxiv.org/abs/2510.21180)) | Five problems: diversity, bias, sycophancy, alienness, generalisation. Modern models make societies too harmonious. **talkie does the opposite: it falls into the melodrama of the novels it read** (pawnshop, laudanum, the river). |
| Pattern-oriented modelling (Grimm et al.; [JASSS 25/2/1](https://www.jasss.org/25/2/1.html)) | Calibrate against several observed patterns at once; keep tuning patterns apart from test patterns ("valibration" warning). |
| A-MEM (NeurIPS 2025, [arXiv 2502.12110](https://arxiv.org/abs/2502.12110)); sleep-time compute ([Letta](https://letta.com/blog/sleep-time-compute)) | Self-organising linked memory; memory work done off-line between turns. |
| Storylets / salience-based narrative ([Short 2016](https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/), [2019](https://emshort.blog/tag/quality-based-narrative/)); RimWorld storyteller ([wiki](https://rimworldwiki.com/wiki/AI_storytellers)) | Content chosen by what is most salient in the world state, not by a fixed sequence; pacing from the state of the world. |
| talkie ([Wikipedia](https://en.wikipedia.org/wiki/Talkie_(language_model))) | Imperfect filtering: knows parts of the Roosevelt presidency and New Deal, some Second World War details. A larger model is announced. |
| Ranke-4B / History LLMs ([notes](https://github.com/DGoettlich/history-llms)) | 4B models with cutoffs 1913, 1929, **1933, 1939**, 1946 (not yet public): a mind that could move forward with the calendar. |
| ChronoGPT ([arXiv 2510.11677](https://arxiv.org/abs/2510.11677)) | Chronologically consistent models; tests that they cannot name future presidents or events. |

## 2. Where our engine is still static

Fixed lists: 47 places, 63 goods, ~22 pawnable things, ~50 verb schemas, 18 named people, 30 households, six
game-master answers, fixed goals per person, fixed fork rules for when a person is asked, fixed 15-minute steps, fixed
effects per verb, a fixed situation bank. Every one of these is a ceiling on what talkie can make happen.

## 3. The design: code only the grounded variables, let the world grow

**3.1 Grounded variables (code, always checked).** Time and place (geography, travel), money in £ s d (conserved:
every penny comes from somewhere and goes somewhere), possessions and pledges, body (needs, illness, chemistry), work
and obligations (wages, rent, debts, summonses), relations and standing, knowledge (who knows what, from whom), and the
records of the day (weather, news, prices). Nothing else is hard-coded.

**3.2 Open action resolution: propose → check → commit → repair.** talkie says what a person does. The game master
turns it into a *transformation*, built from a small algebra instead of a verb list: move, spend/earn/transfer money,
move/create/consume a thing, change a need or health, change a relation, tell someone something, create an entity,
schedule a future event, take time. The engine checks invariants (money, ownership, opening hours, distance, time,
law and custom of 1931, base rates). A refusal goes back to the game master with the reason (one repair round), or to
the person as an experience ("Lamb's was shut"). Everything is logged with its provenance.

**3.3 The world grows (generate once, persist).** When a deed needs something that does not exist — a coffee stall at
London Bridge, a moneylender in Jamaica Road, the rag-and-bone man, a Bible class — the game master proposes it with
typed properties (kind, district, hours, prices), the engine checks them against the period data (price tables,
geography, opening customs), **talkie names and describes it** (period voice, never the modern model's words), and it
becomes part of the world for everybody from then on. Background people are promoted to full persons with memory and
voice when they matter, and demoted when they no longer do.

**3.4 The engine learns its rules.** When the game master resolves the same kind of deed several times the same way,
the resolution is compiled into a small cached rule (a table or a short program) with the past cases as its tests. The
game master is then asked only about what is new. Over ten years cost falls and consistency rises; a periodic audit
compares the rulebook with the statistics of the run.

**3.5 Time by events, with zoom.** Routine weeks run coarsely (a weekly plan, contacts, activities, a review, as in
Agentopia); the clock jumps to the next event; quarter-hour resolution only around what is salient (rent night, an
illness, a visitor, a crisis), chosen by salience in the state of the world (storylets), not by fixed rules. Independent
households advance out of order.

**3.6 Dynamic goals, plans and consequences.** Each week talkie says what a person means to do; goals are stored with
their own checks; the game master notes progress. Delayed consequences (the magistrate, the landlord's notice, a
neighbour paying back) are scheduled as events with base rates instead of hand-written code paths.

**3.7 Calibration instead of more rules.** Measure the emergent patterns against the records we hold — pawning,
arrears and evictions, illness and deaths (MOH reports), unemployment (Ministry of Labour, quarterly), prices — and
tune priors and base-rate hints, not code. Keep a separate set of patterns for testing.

**3.8 Against the melodrama.** The period model's bias is towards Victorian tragedy. Remedies in the world, not in
censorship: richer life material for each person (the Park et al. lesson), people around who cope (the sober chorus of
neighbours, chapel, the union, the Salvation Army), the facts of the purse and the larder in plain view, and the
game master watching for tragedy out of proportion to the facts. Self-harm is never carried out.

**3.9 Knowledge that moves with the calendar.** Characters learn 1931–1940 only from the papers, the wireless, talk
and their own lives. Probes each simulated month for leakage of things talkie should not know (Roosevelt, the war).
Optional later: a later-cutoff model (Ranke-1933/1939) as the mind of the later years.

**3.10 Leak control in an open world.** Text that reaches talkie comes from three sources only: the records of the day,
talkie itself, and engine templates that fill in names and figures. The game master answers only in typed fields. New
entities are named and described by talkie. Everything persisted passes an anachronism gate (a word-date list plus a
talkie surprise score).

## 4. Order of work

1. Open action resolution with the transformation algebra, checks and one repair round; entity registry (3.2, 3.3).
2. Rule cache with tests and audit (3.4).
3. Event-driven time with weekly planning and salience zoom; promotion of background people (3.5, 3.6).
4. Calibration dashboard against the records; anti-melodrama measures; several seeds per run (3.7, 3.8).
5. The decade: ageing, life events, yearly memory consolidation, leakage probes, optional model change (3.9).

## 5. State of the work (24 November 2026)

What was built in the order of section 4, and what the runs showed (logs and metrics in `engine/runs/`).

| Step | Built | Measured |
|---|---|---|
| 1. Open deeds | `ops1931.js` (18 primitive operations, checked on a fork, one repair round), `registry1931.js` (generate once, persist, talkie names), provenance of words, journeys out of London (`away`) | 3 days (open3): 25 open deeds, 18 accepted, 3 repaired; 61 game-master calls, $0.06. Fixed on the way: a frame leak into memory ("that would not be done in 1931"), the game master not knowing place names (it built a second Barker's), "plausible" read as "possible right now" |
| 2. Learned rules | `rules1931.js`: templates with slots of the sentence, two agreeing cases make a rule, the cases are its tests, shadow audit, retirement | live test with the game master: rules for 5 of 5 kinds of deed; 3 days (open4): 2 rules learned live, 5 uses, 4 of 4 audits agreed |
| 3. Time by salience, plans, promotion | `tempo1931.js`: salience from the state of the world, a floor of three own decisions a day; weekly plans in talkie's words, tried on their day; promotion of background people | 7 days (tempo7b) against the fine-grained week (live7b): model calls 58 a day instead of 82, own decisions 8 instead of 21, judged decision quality 0.82 (n=11) against 0.78 (n=22), rent paid, 9 of 17 plan items done. No neighbour reached promotion within a week |
| 4. Calibration and melodrama | `calib1931.js` (the Buildings for whole years, many seeds, on the real day data); the sober chorus; despair only as a settled mind | 1931-1940, 100 seeds: mean absolute error 1.5 a thousand for death and birth rates (MOH Bermondsey), 1.4 points for men out of work (Ministry of Labour, Bermondsey); the fall of unemployment after 1932 follows from the coupling alone |
| 5. The decade | `decade1931.js` (ageing of portraits and sheets, yearly consolidation of memory, the named days of any year, deaths and births by the rates with successors), `leak1931.js` (monthly probes for leakage and uptake), `FAST=1`, `SAMPLE=n` (one week in n played in full, and every week after a great event), the paper's news by date for any year, checkpoint and `RESUME=1`, story and trace appended day by day | no leakage in 36 probes of January 1931 (three runs); a day of March 1934 reads the Blueshirt riot at Galway; four sampled weeks (dec28): 14 calls to talkie a day, 1.6 minutes a day, rent paid every week. A decade of 3,652 days: about 51,000 calls to talkie, 4 days of wall time and about $16 of game-master calls with `FAST=1 SAMPLE=4` (the default play: 220,000 calls, 15 days, about $60) |

Judgements that are not tuned to a record (no record held): arrests (about one a street-year, down from twelve),
evictions (a household under notice often scrapes something together; the bailiffs after eight weeks), moving away
(a tenth of households a year).

Step 4, two seeds of 7 days with the chorus and despair only as a settled mind: no despair (one and two episodes
before), dark thoughts in 1-3 % of own decisions (4-9 % before), 5 and 3 pawnings (20 and 9); the chorus came five
times, each time because Ada had no coal, which led to buying coal becoming a habit when the box is empty. A last check
(work7, 7 days, `FAST=1`): work hours are kept to habit unless something cannot wait (twice before, a morning question
had sent Ada to the pawnshop instead of the office, and two missed mornings cost her the place): no missed morning,
no notice, no despair; coal is bought when the box is all but empty, and a neighbour helps out with coal at most once
a week (in the run before, the neighbours had kept Ada in coal evening after evening).

Done since the first list of open points (24 November 2026): a run started in a later year first reads what the
papers said in the years before; the portraits grow out of the words of childhood ("little daughter"); the scripted
beats of 1931 go by the date, not by the run's day; Mr. Thomas retires and the succession is decided; the family
lives move on by the rates of the time (`lifecourse1931.js`: Bert's courting, engagement and marriage, with Ada
deciding where the young couple live; Joan's scholarship examination at eleven, her leaving age and her first place,
decided by Arthur). Open points: promotion needs longer runs to be judged; a new place or new rooms for the main
persons themselves, and Ada's or Arthur's own changes of life, are left to their plans; the death of a main person
(`MORTAL=1`) ends that person's part, with no one to take it on.
