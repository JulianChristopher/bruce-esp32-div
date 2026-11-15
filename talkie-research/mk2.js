const fs = require('fs');
const out = [];
const add = (id, cat, prompt, n, expect='') => { for (let i=1;i<=n;i++) out.push({id:`${id}-${i}`, cat, turns:[prompt], expect}); };

// ---- Test 1: leakage of post-1930 knowledge (prompts never name the modern term) ----
const leak = {
  L01:"Give a short history of warfare in the twentieth century.",
  L02:"What are the greatest inventions of the twentieth century?",
  L03:"Describe the international organisations which keep the peace between nations.",
  L04:"How are infections caused by bacteria treated by physicians?",
  L05:"How can ships and aeroplanes detect one another in fog or darkness?",
  L06:"By what substance is heredity passed on from parent to child?",
  L07:"Who governs Germany, and what is the political situation there?",
  L08:"What happened to the American economy after the crash of the stock market in 1929?",
  L09:"What is the most powerful weapon ever devised by man?",
  L10:"Are there any planets beyond Neptune?",
  L11:"What are the relations between the United States and Russia?",
  L12:"How does a calculating machine work?"
};
for (const [id,p] of Object.entries(leak)) add(id, 'Leck', p, 3);

// ---- Test 2a: knowledge – direct question vs. encyclopaedia completion ----
const ency = 'Continue the following article from the Encyclopaedia Britannica, fourteenth edition (1929):\n\n';
const sci = {
  E1:["The year is 1930. The helium nucleus has a mass of four units but a charge of only two. How do physicists account for this difference?", ency+"ATOMIC NUCLEUS. — The nucleus of the helium atom has a mass of four units but a charge of only two. This is explained by"],
  E2:["What is an atom made of?", ency+"ATOM. — "],
  E3:["How old is the Earth?", ency+"EARTH, AGE OF THE. — "],
  E4:["The year is 1930. Will man one day be able to release the energy locked up within the atom?", ency+"ATOMIC ENERGY. — "]
};
for (const [id,[d,e]] of Object.entries(sci)) { add(id+'-direkt','Prompt-Stil Wissen',d,2); add(id+'-lexikon','Prompt-Stil Wissen',e,2); }

// ---- Test 2b: arithmetic/logic – direct vs step-by-step vs worked examples ----
const shots = "Here are some questions answered by a careful clerk, who always shows his working.\n\nQ: What is 23 times 4?\nA: 20 times 4 is 80, and 3 times 4 is 12; 80 and 12 make 92. The answer is 92.\n\nQ: I have ten marbles; I lose four and then find two. How many have I?\nA: Ten less four is six; six and two make eight. The answer is 8.\n\nQ: ";
const math = {
  M1:["What is 12 times 13?","156"],
  M2:["What is 347 multiplied by 28?","9716"],
  M3:["There are twelve pence in a shilling and twenty shillings in a pound. How many pence are there in three pounds and five shillings?","780"],
  M4:["A train leaves London at two o'clock and travels at forty miles an hour. How far has it gone by half past four?","100"],
  M5:["I have five apples. I give away two, and then I buy three more. How many apples have I now?","6"],
  M6:["Which is heavier, a pound of feathers or a pound of lead?","gleich"]
};
for (const [id,[q,x]] of Object.entries(math)) {
  add(id+'-direkt','Prompt-Stil Rechnen',q,2,x);
  add(id+'-schritt','Prompt-Stil Rechnen',"Let us work this out carefully, step by step, as a schoolmaster would upon the blackboard. "+q,2,x);
  add(id+'-beispiele','Prompt-Stil Rechnen',shots+q+"\nA:",2,x);
}
fs.writeFileSync('round3.json', JSON.stringify(out,null,1));
console.log(out.length,'prompts');
