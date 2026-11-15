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

## v4: 90-Tage-Lauf (14. März – 11. Juni 1930) und v5

**v4** (`sim4.js`, Ergebnisse in `sim4_90/`): 90 simulierte Tage, 3 993 Anfragen, 0 Fehler, 1 % leere Antworten.
Gedächtnis 34/127 richtig (27 %), Tagebücher behalten 74 % der Schlüsselfakten.
Diagnose (`probetest*.js`): Die Suche fand die richtige Erinnerung meist, aber talkie liest schlecht:
vorgelegte Antwortmöglichkeiten verleiten zu erfundenen Antworten, Gleichstände wurden zugunsten der Wahrheit gewertet (Messfehler),
Fragen wie „am Freitag“ waren mehrdeutig.

**v5** (`sim5.js`):
- Gedächtnissuche mit seltenen Wörtern (idf), logarithmischer Alterung und Datumsbezug; jede Prüffrage nennt ein Datum.
- Prüffragen zuerst offen gestellt, Antwortmöglichkeiten nur als Rückfall; Gleichstand = keine Antwort; Prompt-Echos werden erkannt.
- Bücher der Zeit als Gedächtnisstütze, von der Engine geführt: Mietbuch, Pfandschein, Haushaltsbuch, Büro-Tagebuch, Lohnbuch.
- Tägliche Zeitung für alle drei Figuren (Daily Herald, The Times/Observer, Abendzeitung/News of the World), Radio bei Mr. Thomas
  (Karfreitag 1930: „There is no news to-night“). Quellen: `news1930.js` (24 Hauptmeldungen, Daten mit NewsWire abgeglichen),
  `newswire_spring1930.json` (Auszug aus NewsWire, Dell Research Harvard, CC-BY 4.0: AP-Meldungen aus Großbritannien, Empire, Europa),
  `news_loc/` (Titelseiten des Washington Evening Star, Chronicling America / Library of Congress, `fetchnews.js`).
- Gesprächsthemen wechseln; Feiertage und Zeitung als Themen; Gesprächsverlauf aus Sicht des Sprechers (nach SPASM, Egocentric Context Projection).
- 7-Tage-Validierung (`sim5_val3/`): Gedächtnis 13/16 (81 %), Zeitungsfragen 4/5.

`dashdata.js` erzeugt die Daten des Dashboards (`dash/`), die Seite liegt in `dashboard/index.html`.
