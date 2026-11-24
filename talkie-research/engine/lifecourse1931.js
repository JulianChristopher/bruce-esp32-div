// The course of the family lives over the decade, by the rates of the time; the decisions in it belong to the
// persons (asked of the period model), the timing and the chances to the records.
//
// Marriage. Single men in England and Wales, 1931 census (General Report, Table 46): 86 % of men aged 20-24, 47 % of
// 25-29, 22 % of 30-34, 12.5 % of 35-44. Read as a synthetic cohort this gives a yearly chance of first marriage of
// about 5 % at 20-21, 11 % at 22-26, 14 % at 27-31 and 7 % at 32-39: a man of twenty in 1931 marries within the
// decade about two times in three. Walking out comes first (here: some months to two years), and it can end.
//
// School. In London the leaving age was fourteen (at the end of the term after the birthday). At eleven the Junior
// County Scholarship decided who went on: in 1938, 11.1 % of the London cohort was admitted to grant-aided secondary
// schools (not all on scholarships; HC Deb 3 April 1939), and the eighty-odd selective central schools held about
// 30,000 pupils, roughly one child in six, who stayed till fifteen. Here: a scholarship to the secondary school
// 5 %, a central-school place 16 %.
'use strict';
const MARRY = age => (age < 20 ? 0.01 : age < 22 ? 0.05 : age < 27 ? 0.114 : age < 32 ? 0.143 : age < 40 ? 0.072 : 0.03);   // a year
const BREAK_UP = 0.15;          // a year, while walking out
const ENGAGED_AFTER = 39;       // weeks of walking out before a wedding may be fixed; then about one chance in 52 a week
const GIRLS_WORK = ['the jam factory', "Peek Frean's biscuit factory", 'the tin-box works in Southwark', 'a laundry in the Old Kent Road'];
const SCHOOL = { secondary: 0.05, central: 0.16 };
// the end of the term in which a child reaches the leaving age (school terms of the London elementary schools, rounded)
function leavingDate(born, school) {
  const by = new Date(born).getUTCFullYear(), age = school === 'secondary' ? 16 : school === 'central' ? 15 : 14;
  const bday = Date.UTC(by + age, new Date(born).getUTCMonth(), new Date(born).getUTCDate()), y = by + age;
  // the elementary school let a child go at the end of the term after the birthday; the central and secondary schools
  // kept their pupils to the end of the school year (the summer term) in which they reached the age
  const terms = school === 'elementary' ? [Date.UTC(y, 2, 24), Date.UTC(y, 6, 29), Date.UTC(y, 11, 21), Date.UTC(y + 1, 2, 24)] : [Date.UTC(y, 6, 29), Date.UTC(y + 1, 6, 29)];
  const end = terms.find(t => t >= bday); return new Date(end).toISOString().slice(0, 10);
}
// the first places a girl could take, by her schooling, with the week's wage in pence (rounded, 1930s London)
const FIRST_PLACES = {
  elementary: [['a junior in an office in the City', 120], ["a shop girl at a draper's in Upper Street", 120], ['an apprentice to a dressmaker', 60], ['to stay at home and help her mother', 0]],
  central: [['a junior clerk in an office in the City', 150], ["a shop girl at a draper's in Upper Street", 120], ['an apprentice to a dressmaker', 60], ['to stay at home and help her mother', 0]],
  secondary: [['a typist in an office in the City', 216], ['a pupil-teacher at an elementary school', 180], ['a clerk at the Post Office', 192], ['to stay at home and help her mother', 0]]
};
// one week of a young man's courting: returns what happens ('court', 'break', 'engaged') or null
function courtingWeek(state, age, R) {
  if (!state || state.stage === 'married') return null;
  if (state.stage === 'single') return R() < 1.3 * MARRY(age + 1.5) / 52 ? 'court' : null;   // walking out begins a year or two before marrying (more courtships than marriages)
  if (state.stage === 'courting') { if (R() < BREAK_UP / 52) return 'break'; if (state.weeks >= ENGAGED_AFTER && R() < 1.5 / 52) return 'engaged'; }
  return null;
}
module.exports = { MARRY, BREAK_UP, ENGAGED_AFTER, GIRLS_WORK, SCHOOL, leavingDate, FIRST_PLACES, courtingWeek };
