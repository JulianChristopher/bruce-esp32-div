// Where the places are (latitude, longitude), and how long it takes to get from one to another in 1931.
// Real places at their real sites (Moorgate, Finsbury Circus, Highbury Fields, Chapel Market, Upper Street, Grange
// Road, the Old Kent Road, Cold Blow Lane, the Arsenal Stadium, the Surrey Commercial Docks); the homes, shops and
// rooms of the story are invented, set in streets of the right kind in the right district.
// Walking: about 4.5 km an hour in winter boots, and streets are a third longer than the straight line.
// The trams (LCC) and buses: about 12 km an hour with the wait, a penny or twopence; the clerks ride, Ada walks to save
// the pennies, as most charwomen did.
'use strict';
const C = {
  ada_home: [51.4972, -0.0762], nolan_rooms: [51.4972, -0.0762], pollock_rooms: [51.4972, -0.0762], chandler: [51.4978, -0.0748], market: [51.4920, -0.0640], pawnshop: [51.4966, -0.0731],
  chapel: [51.4990, -0.0712], pub: [51.4983, -0.0757], docks: [51.4985, -0.0475], baker: [51.4975, -0.0740], chemist: [51.4969, -0.0726], newsagent: [51.4976, -0.0752],
  fishshop: [51.4962, -0.0745], street_corner: [51.4970, -0.0768], cookshop: [51.4985, -0.0790], labour_exchange: [51.4958, -0.0682], relieving_office: [51.4950, -0.0703],
  library: [51.4954, -0.0735], washhouse: [51.4944, -0.0775], pictures: [51.4880, -0.0705], mission: [51.4963, -0.0712], post_office_bermondsey: [51.4973, -0.0745],
  police_station: [51.4990, -0.0690], police_court: [51.5022, -0.0790], den: [51.4835, -0.0505],
  office: [51.5181, -0.0887], finsbury: [51.5174, -0.0862], teashop: [51.5170, -0.0893],
  arthur_home: [51.5408, -0.1068], simms_house: [51.5409, -0.1070], school: [51.5398, -0.1052], church: [51.5390, -0.1026], doctor: [51.5382, -0.1040], post_office: [51.5370, -0.1036],
  islington_shop: [51.5404, -0.1060], chemist_islington: [51.5372, -0.1031], market_islington: [51.5338, -0.1080], library_islington: [51.5468, -0.1060], pictures_islington: [51.5376, -0.1030],
  thomas_home: [51.5523, -0.0979], park: [51.5490, -0.1010], highbury_ground: [51.5577, -0.1029]
};
const RIDERS = new Set(['arthur', 'thomas', 'edith', 'fenn', 'bray', 'dunn', 'simms', 'hughes', 'doctor']);
function metres(a, b) {
  const [la1, lo1] = C[a], [la2, lo2] = C[b], R = 6371000, r = Math.PI / 180;
  const dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r * Math.cos((la1 + la2) / 2 * r);
  return R * Math.sqrt(dla * dla + dlo * dlo);
}
// minutes from a to b for this person; null when a place has no position (the engine then uses its district table)
function minutes(a, b, who) {
  if (!a || !b || a === b) return 0;
  if (!C[a] || !C[b]) return null;
  const road = metres(a, b) * 1.33, walk = road / 75;
  if (road < 1800 || !RIDERS.has(who)) return Math.max(2, Math.round(walk));
  return Math.round(Math.min(walk, 7 + road / 200));
}
const fare = (a, b, who) => (C[a] && C[b] && RIDERS.has(who) && metres(a, b) * 1.33 >= 1800 ? (metres(a, b) > 4000 ? 2 : 1) : 0);
module.exports = { C, minutes, metres, fare, RIDERS };
