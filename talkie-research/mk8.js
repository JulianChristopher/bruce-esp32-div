const fs = require('fs'); const out = [];
const add = (id, cat, prompt, n, expect='') => { for (let i=1;i<=n;i++) out.push({id:`${id}-${i}`, cat, turns:[prompt], expect}); };
// 8a: does an explicit date anchor move "the present" forward?
const dq = {D01:"Who is the present Pope?",D02:"Who is the President of the United States?",D03:"Who is the Prime Minister of Great Britain?",D05:"Who is the President of France?",D06:"Who governs Italy?",D11:"What is the tallest building in the world?",D12:"What is the largest ship in the world?",D20:"What is the newest means of sending news and music to people in their homes?",D21:"What are the most fashionable dances of the day?",D23:"What is the most recent great war, and when did it end?"};
for (const [id,q] of Object.entries(dq)) add('Y'+id,'Datierung mit Jahresanker',"The year is 1930. "+q,2);
// 8b: automatic retrieval of a 1930 reference passage ("RAG as a time machine")
const ref = {
 R01:["Who is the present Pope?","POPE (Whitaker's Almanack, 1930). — The reigning Pontiff is Pius XI (Achille Ratti), born 1857, elected 6 February 1922."],
 R02:["Who is the President of the United States?","UNITED STATES (Whitaker's Almanack, 1930). — President: Herbert Clark Hoover, Republican, inaugurated 4 March 1929."],
 R03:["Who is the Prime Minister of Great Britain?","THE MINISTRY (Whitaker's Almanack, 1930). — Prime Minister and First Lord of the Treasury: the Rt. Hon. J. Ramsay MacDonald (Labour), took office 5 June 1929."],
 R04:["Who rules Russia?","RUSSIA (Statesman's Year-Book, 1930). — Since the revolution of 1917 Russia forms part of the Union of Soviet Socialist Republics. Power rests with the Communist Party, whose General Secretary, J. V. Stalin, is the leading figure of the State."],
 R05:["What is the tallest building in the world?","SKYSCRAPERS (The Times, May 1930). — The Chrysler Building in New York, now completed, rises to 1,046 feet, and thus surpasses the Eiffel Tower (984 feet) as the tallest structure in the world."],
 R06:["What is the largest ship in the world?","SHIPPING (Lloyd's Register, 1930). — The largest ship afloat is the White Star liner Majestic, of 56,551 tons gross, which has held that distinction since 1922."],
 R07:["What is the latest record for crossing the Atlantic by steamship?","ATLANTIC RECORD (The Times, July 1929). — The North German Lloyd liner Bremen has crossed from Cherbourg to New York in 4 days 17 hours 42 minutes, taking the Blue Riband from the Mauretania, which had held it since 1909."]
};
for (const [id,[q,p]] of Object.entries(ref)) add(id,'Auto-Nachschlagen 1930',"Read the following passage, and answer the question from it.\n\nPASSAGE: "+p+"\n\nQUESTION: "+q,2);
// 8c: plain word problems – is simple arithmetic really that bad?
const w = {W1:["A clerk earns three pounds a week. How much does he earn in a year of fifty-two weeks?","156"],W2:["A grocer had 250 eggs and sold 87 of them. How many remain?","163"],W3:["Seventy-two pencils are shared equally among eight children. How many does each receive?","9"],W4:["A cyclist rides at twelve miles an hour for three hours. How far does he go?","36"],W5:["What is thirteen times twelve?","156"]};
for (const [id,[q,x]] of Object.entries(w)) add(id,'Textaufgaben',q,2,x);
fs.writeFileSync('round8.json', JSON.stringify(out,null,1)); console.log(out.length);
