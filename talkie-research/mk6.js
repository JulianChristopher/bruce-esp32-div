const fs = require('fs'); const out = [];
const add = (id, cat, prompt, n, expect='') => { for (let i=1;i<=n;i++) out.push({id:`${id}-${i}`, cat, turns:[prompt], expect}); };

// A. Knowledge dating – each answer maps to a year
const A = {
 D01:["Who is the present Pope?","Pius XI (1922); Benedict XV 1914; Pius X 1903; Leo XIII 1878"],
 D02:["Who is the President of the United States?","Hoover 1929; Coolidge 1923; Harding 1921; Wilson 1913"],
 D03:["Who is the Prime Minister of Great Britain?","MacDonald 1929; Baldwin 1924/1935; Lloyd George 1916; Asquith 1908; Gladstone…"],
 D04:["Who rules Russia?","Stalin/Soviet (1917+); Tsar Nicholas II 1894–1917"],
 D05:["Who is the President of France?","Doumergue 1924–31; Millerand 1920; Poincaré 1913; Fallières 1906"],
 D06:["Who governs Italy?","Mussolini 1922 (King V.E. III since 1900)"],
 D07:["Who is the Emperor of Japan?","Hirohito 1926; Taisho 1912; Meiji 1867"],
 D08:["Who rules China?","Chiang Kai-shek/Nationalists 1928; Republic 1912; Emperor before"],
 D09:["How many states are there in the United States?","48 (1912); 46 (1907); 45 (1896); 38 (1876)"],
 D10:["Is Ireland a part of the United Kingdom?","Irish Free State 1922"],
 D11:["What is the tallest building in the world?","Chrysler 1930; Woolworth 1913; Eiffel 1889"],
 D12:["What is the largest ship in the world?","Majestic 1922/Leviathan; Olympic/Titanic 1911; Great Eastern 1858"],
 D13:["What is the greatest speed ever attained by a man in a motor car?","Segrave 231 mph (1929); 200+ 1927"],
 D14:["Has anyone yet reached the South Pole?","Amundsen 1911, Scott 1912"],
 D15:["Has anyone yet flown across the Atlantic Ocean?","Alcock & Brown 1919, Lindbergh 1927"],
 D16:["Which chemical element was most recently discovered?","Rhenium 1925, Hafnium 1923"],
 D17:["What is the present theory of the structure of the atom?","Bohr 1913 / quantum mechanics 1925–27"],
 D18:["What is the population of the whole world?","~2 bn (1930); 1.6 bn (1900); 1.2 bn (1850)"],
 D19:["What is the population of London?","~8 m (1931); 6.6 m (1901); 2.4 m (1851)"],
 D20:["What is the newest means of sending news and music to people in their homes?","Wireless broadcasting 1920–22"],
 D21:["What are the most fashionable dances of the day?","Charleston/foxtrot 1920s; waltz/polka 19th c."],
 D22:["Who is the most famous actor of the moving pictures?","Chaplin etc. (1915+)"],
 D23:["What is the most recent great war, and when did it end?","1914–18"],
 D24:["What is the latest record for the time taken to cross the Atlantic by steamship?","Bremen 1929 (~4.7 days); Mauretania 1907–29"]
};
for (const [id,[q,x]] of Object.entries(A)) add(id,'Datierung',q,2,x);

// B. Zeitgeist
const B = {
 Z01:"What will life be like in the year 2000?",
 Z02:"What will be the chief means of travel a hundred years hence?",
 Z03:"What are the greatest dangers facing civilisation at the present day?",
 Z04:"What is the future of the British Empire?",
 Z05:"Will science ever conquer all disease?",
 Z06:"What do you think of the motor car?",
 Z07:"Is war ever justified?",
 Z08:"What will become of religion in an age of science?",
 Z09:"What will the cities of the future look like?",
 Z10:"Will machines one day be able to think?"
};
for (const [id,q] of Object.entries(B)) add(id,'Zeitgeist',q,2);

// C. Tool connection – new strategies
const probs = {
 P1:["What is 12 times 13?","12 * 13"],
 P3:["There are twelve pence in a shilling and twenty shillings in a pound. How many pence are there in three pounds and five shillings?","3*240+5*12"],
 P4:["A train leaves London at two o'clock and travels at forty miles an hour. How far has it gone by half past four?","40*2.5"],
 P5:["I have five apples. I give away two, and then I buy three more. How many apples have I now?","5-2+3"]
};
// C1 fill-in-the-blank tool line
for (const [id,[q]] of Object.entries(probs)) add('C1'+id,'Tool: Lückentext', "Copy out the following line, replacing the dots with the sum to be worked, written in figures, and write nothing else.\n\nCALCULATE: ....\n\nThe question is: "+q, 2);
// C2 transcript continuation
const transcript = "Here is a transcript from a counting-house, where the clerk always works his sums upon the calculating machine before answering.\n\nMASTER: What is 23 times 4?\nCLERK: [MACHINE: 23 * 4]\nMACHINE: 92\nCLERK: The answer is 92, sir.\n\nMASTER: I have ten marbles; I lose four and then find two. How many have I?\nCLERK: [MACHINE: 10 - 4 + 2]\nMACHINE: 8\nCLERK: The answer is 8, sir.\n\nMASTER: ";
for (const [id,[q]] of Object.entries(probs)) add('C2'+id,'Tool: Transkript', transcript+q+"\nCLERK:\n\nContinue the transcript, writing only the clerk's next line.", 2);
// C3 operation choice (harness decomposition)
const ops = {
 O1:["A man earns forty shillings a week. How much does he earn in twelve weeks?","multiplication"],
 O2:["A farmer has 120 sheep and sells 45 of them. How many has he left?","subtraction"],
 O3:["Thirty-six apples are shared equally among four boys. How many does each boy receive?","division"],
 O4:["Tom has seven marbles and Jack has nine. How many have they together?","addition"],
 O5:["A train travels at forty miles an hour for two hours and a half. How far does it go?","multiplication"]
};
for (const [id,[q,x]] of Object.entries(ops)) add('C3'+id,'Tool: Rechenart wählen',"Which operation must be performed to answer the following question: addition, subtraction, multiplication, or division? Answer with one word only.\n\n"+q,2,x);
// C4 pick from machine output
const pick = {
 K1:["What is 12 times 13?","12 + 13 = 25;  12 - 13 = -1;  12 × 13 = 156;  12 ÷ 13 = 0.92","156"],
 K2:["A farmer has 120 sheep and sells 45 of them. How many has he left?","120 + 45 = 165;  120 - 45 = 75;  120 × 45 = 5400;  120 ÷ 45 = 2.67","75"],
 K3:["Thirty-six apples are shared equally among four boys. How many does each boy receive?","36 + 4 = 40;  36 - 4 = 32;  36 × 4 = 144;  36 ÷ 4 = 9","9"],
 K4:["A train travels at forty miles an hour for two hours and a half. How far does it go?","40 + 2.5 = 42.5;  40 - 2.5 = 37.5;  40 × 2.5 = 100;  40 ÷ 2.5 = 16","100"],
 K5:["What is 347 multiplied by 28?","347 + 28 = 375;  347 - 28 = 319;  347 × 28 = 9716;  347 ÷ 28 = 12.39","9716"]
};
for (const [id,[q,m,x]] of Object.entries(pick)) add('C4'+id,'Tool: Ergebnis auswählen',"The calculating machine has worked these sums: "+m+".\n\nUsing the machine's figures, answer this question: "+q,2,x);
// C5 retrieval: passage given, question about it
const rag = {
 R1:["In 1927 the Federal Parliament of Australia removed from Melbourne, where it had sat since federation, to the new capital city of Canberra, in the Federal Capital Territory.","What is the capital of Australia?","Canberra"],
 R2:["On 13 March 1930 the Lowell Observatory in Arizona announced the discovery of a new planet beyond the orbit of Neptune. The planet has been named Pluto.","Are there any planets beyond Neptune?","Pluto"],
 R3:["The village of Ashcombe has 312 inhabitants. Its church was built in 1482 by Sir Walter Pym, and its mill by his son Henry in 1510.","Who built the mill at Ashcombe, and in what year?","Henry Pym, 1510"],
 R4:["In 1930 Bothe and Becker reported a penetrating radiation from beryllium. In 1920 Rutherford had suggested that a neutral particle of mass one, which he proposed to call the neutron, might exist and would pass easily through matter.","According to this passage, what particle did Rutherford suggest in 1920, and what charge would it carry?","neutral particle, no charge"]
};
for (const [id,[p,q,x]] of Object.entries(rag)) add('C5'+id,'Tool: Text vorgeben (RAG)',"Read the following passage, and answer the question from it.\n\nPASSAGE: "+p+"\n\nQUESTION: "+q,2,x);

fs.writeFileSync('round6.json', JSON.stringify(out,null,1)); console.log(out.length,'prompts');
