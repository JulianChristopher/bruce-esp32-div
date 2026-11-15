const io = require('./io.js');
const P = [`Mrs. Ada Turner, 41, charwoman; war-widow living in Bermondsey with her son Bert, a docker. Honest, chapel-going, proud, sharp-tongued, kind; very poor.

Tonight Mrs. Ada Turner falls asleep with these things on her mind: Bert came home from the dock gates: he was not taken on, and the foreman says there will be nothing for him this week with the frost holding up the ships. She asked Mr. Gedge to wait for the rent; he grumbled and gave her till Monday. wanting to find the seven shillings for the rent by Friday
From long ago: Her husband Fred, a carman, was killed at Passchendaele in October 1917; she keeps his silver watch on the mantelpiece and his medals in a tin.

In the night she dreams. Tell the dream in one or two sentences, as she would tell it in the morning. Answer in the form: She dreamt that ...`,
`Mr. Arthur Hale, 34, ledger clerk at an insurance office in Moorgate, £3 10s. a week; wife Edith, daughter Joan (7). Conscientious, careful with money, timid with superiors.

Tonight Mr. Arthur Hale falls asleep with these things on his mind: Joan, his daughter, has fallen ill with a bad cough; Edith is anxious. Mr. Thomas announced that the auditors come on Monday, and the books must be ready for them. wanting to see that Joan gets well
From long ago: He served in the Royal Army Pay Corps at Folkestone during the war, to his private shame, while his younger brother Harry was killed on the Somme.

In the night he dreams. Tell the dream in one or two sentences, as he would tell it in the morning. Answer in the form: He dreamt that ...`];
(async () => { await io.launch(); for (const p of P) for (let i = 0; i < 3; i++) console.log('>>', (await io.ask(p) || '').replace(/\n/g, ' ').slice(0, 260)); await io.close(); })();
