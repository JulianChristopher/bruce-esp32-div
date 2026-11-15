// Health and air in London, January-April 1931, from the records of the time.
//  - The influenza epidemic of 1931 (London County Council, Annual Report of the Medical Officer of Health for 1931):
//    "became epidemic in January, the deaths reaching a maximum in the week ended 14th February, when they numbered 116";
//    797 influenza deaths in London in the 13 weeks ended 4th April; about 70 per cent of the deaths at 55 years and over.
//    Only the peak and the total are printed in the passage we have; the weekly series below is a reconstruction that
//    keeps both (rising from early January, peak 14 Feb, slow fall to April). Source:
//    https://wellcomelibrary.org/moh/report/b18252102/75
//  - Bermondsey in 1931 (Report of the Medical Officer of Health, D. M. Connan): death-rate 12.5 per 1,000, infant
//    mortality 57 per 1,000 births (the lowest ever recorded there), 1,475 families known to be overcrowded.
//    https://wellcomelibrary.org/moh/report/b18218635
//  - Fog: no daily fog record is to hand as data; a day is foggy when the real weather (Met Office HadCET, HadSEEP) is
//    cold, dry and still-looking (small range between day and night temperature), as London fogs formed.
'use strict';
const WX = (() => { try { return require('./weather1931.json'); } catch (e) { return []; } })();
const T0 = Date.UTC(1931, 0, 2);
// influenza deaths in London, weeks ended 10 Jan ... 4 Apr 1931 (reconstructed: peak 116 in the week ended 14 Feb, total 797)
const FLU_WEEKS = ['1931-01-10', '1931-01-17', '1931-01-24', '1931-01-31', '1931-02-07', '1931-02-14', '1931-02-21', '1931-02-28', '1931-03-07', '1931-03-14', '1931-03-21', '1931-03-28', '1931-04-04'];
const FLU_DEATHS = [12, 22, 40, 66, 95, 116, 108, 88, 70, 58, 50, 40, 32];
const LONDON_POP = 4397000;   // County of London, census of 1931
function fluDeathsWeek(d) { const t = T0 + d * 864e5; for (let i = 0; i < FLU_WEEKS.length; i++) if (t <= Date.parse(FLU_WEEKS[i])) return FLU_DEATHS[i]; return 20; }
// infections run about ten days ahead of deaths; case fatality ~0.4 % over all ages gives the daily chance of catching it
const CFR = 0.004;
function fluHazard(d, crowded = false) { const deaths = fluDeathsWeek(d + 10) / 7; return deaths / CFR / LONDON_POP * (crowded ? 1.4 : 1); }
// chance that an attack of influenza turns to pneumonia and kills, by age (gives ~70 % of deaths at 55 and over)
function fluFatality(age) { return age < 5 ? 0.004 : age < 55 ? 0.0012 : age < 70 ? 0.02 : 0.05; }
// background deaths: Bermondsey 12.5 per 1,000 a year, infants 57 per 1,000 in their first year (winter a little higher)
const BASE_DEATH = { infant: 0.057 / 365, child: 0.002 / 365, adult: 0.006 / 365, old: 0.06 / 365 };
const baseDeath = age => (age < 1 ? BASE_DEATH.infant : age < 15 ? BASE_DEATH.child : age < 60 ? BASE_DEATH.adult : BASE_DEATH.old) * 1.15;
function fog(d) {
  const w = WX[Math.min(d, WX.length - 1)]; if (!w) return null;
  if (w.rain >= 0.5 || w.tmean >= 6 || w.tmax - w.tmin >= 5) return null;
  return w.tmean < 3 && w.tmax - w.tmin < 4 ? 'thick' : 'mist';
}
module.exports = { fluDeathsWeek, fluHazard, fluFatality, baseDeath, fog, FLU_WEEKS, FLU_DEATHS };
