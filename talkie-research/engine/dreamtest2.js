const io = require('./io.js');
const base = `Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor.`;
const V = [
  `${base}\n\nTonight Mrs. Ada Turner falls asleep with these things on her mind: Bert has lost his work at the docks. The rent is owing.\nFrom long ago: Her husband Fred was killed at Passchendaele in 1917.\n\nIn the night she dreams. Tell the dream in one or two sentences, as she would tell it in the morning. Answer in the form: She dreamt that ...`,
  `${base}\n\nTonight Mrs. Ada Turner falls asleep with these things on her mind: Bert has lost his work at the docks. The rent is owing.\n\nIn the night she dreams. What does she dream? Answer in the form: She dreamt that ...`,
  `${base}\n\nOn her mind tonight: Bert has lost his work; the rent is owing; she thinks of her husband Fred, killed in the war.\n\nWhat did Mrs. Turner dream that night? Answer in the form: She dreamt that ...`
];
(async () => { await io.launch(); for (const [i, p] of V.entries()) for (let r = 0; r < 3; r++) console.log(i, '>>', (await io.ask(p) || '(empty)').replace(/\n/g, ' ').slice(0, 220)); await io.close(); })();
