# talkie-1930 research

Experiments with [talkie-1930-13b-it](https://talkie-lm.com) (a 13B language model trained only on pre-1931 text), driven through the public web demo with Playwright.

## Contents
- `bench.js`, `questions.json`, `results*.jsonl` – capability benchmark (knowledge, arithmetic, logic, instructions, languages, hallucination, memory).
- `discovery.json(l)`, `round3`–`round9*` – discovery tests (neutron, atomic energy, Bothe–Becker), leakage tests, prompt styles, tool-use strategies, dating of knowledge, zeitgeist, reasoning scaffolds.
- `tools.js`, `tools2.js`, `reason.js` – tool-use and reasoning harnesses (calculator, library, period-style tools, Socratic dialogue, script decomposition).
- `sim.js`, `timetravel.js` – one-day diary simulation (1930) and time travel to 2026 with three characters.
- `agents.js`, `sim2.js` – autonomous agents in Moorgate (morning / two days).
- `sim3.js` – two-week engine (schedule-driven places, agent-chosen actions, game-master resolution of conversations, BM25-style memory retrieval, reflection, lessons, memory probes, metrics). Runs: `sim3_14*` (v3.0), `sim31_14` (v3.1), `sim33_14` (v3.3).
- `lentest.js`, `endtest*.js`, `nulltest.js`, `timing*.js` – diagnostics (prompt length limit, answer-form prompts, stream timing).

## Key findings
- talkie answers reliably only below ~600 prompt tokens; above ~800 tokens it returns empty or degenerate text.
- "Answer with the letter only" often makes talkie return nothing; sentence answer forms ("She chooses to …, because …", "She answers that …") work.
- talkie does not call tools itself; tools must be run by the engine beforehand and their results placed in the prompt (tables, passages).
- Its default "present" is c. 1890; "The year is 1930." or a retrieved 1930 passage moves it to 1930.
- v3.3 two-week run: ledger tool use 82 % correct, memory probes 49 % (61 % of answered), no decay with age up to 13 days.

## v4: 90-day run (14 March – 11 June 1930) and v5

**v4** (`sim4.js`, results in `sim4_90/`): 90 simulated days, 3,993 asks, 0 errors, 1 % empty replies.
Memory 34/127 correct (27 %); diaries kept 74 % of the key facts.
Diagnosis (`probetest*.js`): retrieval usually found the right memory, but talkie reads it poorly. Listed answer options
prime invented answers, ties were scored in favour of the truth (a measurement bug), and questions such as "on Friday" were ambiguous.

**v5** (`sim5.js`):
- Memory retrieval weights rare words (idf), ages memories logarithmically and boosts the date a question names; every probe names a date.
- Probes are asked open first, with the options only as a fallback; a tie counts as no answer; prompt echoes are detected.
- Period books as memory aids, kept by the engine: rent-book, pawn-ticket, account-book, office diary, wages-book.
- A daily paper for all three characters (Daily Herald, The Times/Observer, evening paper/News of the World) and the wireless for
  Mr. Thomas (Good Friday 1930: "There is no news to-night"). Sources: `news1930.js` (24 headline items, dates checked against NewsWire),
  `newswire_spring1930.json` (extract of NewsWire, Dell Research Harvard, CC-BY 4.0: AP stories from Britain, the Empire and Europe),
  `news_loc/` (front pages of the Washington Evening Star, Chronicling America / Library of Congress, via `fetchnews.js`).
- Conversation topics rotate; holidays and the paper become topics; the dialogue history is shown from the speaker's own point of view
  (after SPASM's Egocentric Context Projection).
- 7-day validation (`sim5_val3/`): memory 13/16 (81 %), newspaper questions 4/5.

`dashdata.js` builds the dashboard's data (`dash/`); the page itself is `dashboard/index.html`.
