# The 1930s as data (1 January 1931 – 31 December 1940)

`chronos1930s.js` gives, for any day of the decade, everything the engine can know from records:
`require('./chronos1930s.js').day('1937-05-12')`.

| file | what | source | coverage |
|---|---|---|---|
| `weather.json` | daily mean/max/min temperature, rainfall | Met Office HadCET (Parker et al.) and HadSEEP (Alexander & Jones 2001) | 3,653 days, complete |
| `news/YYYY.json` | up to 8 wire stories a day as printed at the time; British datelines first, then Europe and the Empire, then the largest world stories | NewsWire, Dell Research Harvard (CC-BY 4.0), AP and other wires in US papers | every day 1931–1940 |
| `football.json` | every League and FA Cup match of the London clubs, and the Cup semi-finals and finals | engsoccerdata (J. Curley) | to May 1939 (the 1939–40 League was abandoned on the outbreak of war; wartime leagues are not in the data) |
| `hansard.json` | the main Commons business of each sitting (titles, ranked by length of debate) | UK Parliament, Historic Hansard | 1,496 sittings |
| `events_wikipedia.json` | dated events of each year | Wikipedia, "YYYY in the United Kingdom" (CC BY-SA) | ~400 events; **written with hindsight: engine only, never in a prompt** |
| `institutions1930s.json` | rules that change daily life: benefit cut 1931 and restoration 1934, means test, holidays, war, blackout, evacuation, call-up, rationing, the Blitz; Summer Time dates | Hansard, Wikipedia, polyomino.org.uk (each entry has its source and a 'sure'/'check' mark) | 28 changes |
| `moh_1931_1940.json` | 27 annual reports of the Medical Officers of Health (Bermondsey 1931–39, Islington 1931–40, London County Council): the OCR text of the pages on death-rate, infant mortality, influenza, epidemics, overcrowding, evacuation, air raids, and 383 of their tables as CSV | Wellcome Collection, London's Pulse (CC-BY) | 1931–1940 |
| `health_yearly_raw.json` | birth-rate and death-rate by year read from those pages by pattern (Bermondsey birth-rate 17.4 in 1931 to 13.4 in 1939; death-rate 11–13 a thousand) | as above | **raw: to be checked against the tables before use** |
| `prices1930s.json` | the official cost-of-living index (per cent above July 1914) at twelve dates, as ministers gave it: 57 (Apr 1930), 52 (Mar 1931), 45 (Sep 1931), 36 (May–Jun 1933, the lowest), 45 (Oct 1935), 55 (Jul 1937 – Jun 1939), 65 (30 Sep 1939); the day stream interpolates and gives a factor to turn 1931 prices into the prices of the day | Historic Hansard | 1930–1941 |
| `unemployment_local.json` | per cent of insured workers unemployed, quarterly, men/women/juveniles: Bermondsey 1927–1939 (e.g. men 19 % Oct 1930, 24 % Apr 1933, 9 % Jul 1939), Islington 1929–1939, and the counts for Bermondsey, Islington, Southwark | Ministry of Labour Local Unemployment Index, via A Vision of Britain through Time | to July 1939 |
| `figures_*.json` | other answers in the House with figures of unemployment | Historic Hansard | scattered |

The paper of a day takes two of these stories by an editor's score (`sim10.js`, `newsPicks`); a story whose
dateline lies two days or more after its day is a misdated record (3.7 % of the dated ones: 727 of 19,494) and is
left out, so that no one reads news before it happened.

Computed for every day: sunrise and sunset in clock time (with Summer Time), lighting-up time, the moon,
bank holidays (Good Friday, Easter Monday, Whit Monday, August Bank Holiday, Christmas, Boxing Day, the Silver Jubilee
1935 and the Coronation 1937; no August Bank Holiday in 1940), fog days from the weather.

Not found as open data: daily radio programmes (BBC Genome refuses this machine), a monthly national series of prices
and unemployment (FRED did not answer; NBER has no British series for the 1930s; the Ministry of Labour Gazette is in
print only), police records (archive files and annual reports in print), tram routes and fares of the time, football
after May 1939 (the League stopped at the outbreak of war; wartime regional leagues are not in the data), local
unemployment after July 1939.

Scripts: `newswire_decade.py`, `hansard_decade.py`, `hansard_figures.py`, `events_decade.py`, `moh_decade.py`,
`moh_text.py` rebuild the files from the sources.
