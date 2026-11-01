// Run with: node tests/v15.test.mjs   (holidays by region, countries, lieu credits, who can take my shift)
import assert from 'node:assert/strict';
import * as E from '../src/utils/engine';
import * as B from '../src/utils/banks';
import * as SH from '../src/utils/share';
import { holidaysFor, holidaysAny, REGIONS, regionsOf, externalHolidays } from '../src/utils/holidays';
import { COUNTRIES, countryName } from '../src/utils/countries';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

t('countries: about 195, sorted, lookup works', () => {
  assert.ok(COUNTRIES.length >= 190 && COUNTRIES.length <= 205);
  assert.equal(countryName('CA'), 'Canada');
  assert.equal(countryName('JP'), 'Japan');
  const names = COUNTRIES.map(c => c[1]);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(COUNTRIES.map(c => c[0])).size, COUNTRIES.length);
});
t('Canada: every province has a list and the usual ones are right', () => {
  assert.equal(REGIONS.CA.length, 14);
  for (const r of REGIONS.CA) { const h = Object.values(holidaysFor(2026, 'CA', r.id)); assert.ok(h.includes("New Year's Day") && h.includes('Christmas Day'), r.id); }
  const on = holidaysFor(2026, 'CA', 'ON');
  assert.equal(on['2026-02-16'], 'Family Day');
  assert.equal(on['2026-10-12'], 'Thanksgiving');
  assert.equal(on['2026-12-26'], 'Boxing Day');
  assert.equal(on['2026-04-03'], 'Good Friday');
  assert.equal(on['2026-05-18'], 'Victoria Day');
  assert.equal(holidaysFor(2026, 'CA', 'QC')['2026-06-24'], 'National Holiday (Saint-Jean-Baptiste)');
  assert.equal(holidaysFor(2026, 'CA', 'MB')['2026-02-16'], 'Louis Riel Day');
  assert.equal(holidaysFor(2026, 'CA', 'BC')['2026-08-03'], 'BC Day');
  assert.ok(!Object.values(holidaysFor(2026, 'CA', 'ON')).includes('Remembrance Day'));
});
t('other countries: nothing until loaded, never throws', () => {
  assert.deepEqual(holidaysAny(2026, 'GB', 'GB-ENG'), {});
  assert.deepEqual(regionsOf('GB', 2026), []);
  assert.deepEqual(externalHolidays(2026, 'JP', ''), {});
});
const shifts = Object.fromEntries(E.DEFAULT_SHIFTS().map(s => [s.id, s]));
t('ledger: automatic lieu credits add to the bank', () => {
  const lieu = B.normBank({ id: 'lieu', name: 'Lieu', kind: 'lieu', unit: 'd', dayHours: 7.5, balance: 1, asOf: '2026-10-01' });
  const L = B.ledger(lieu, { profile: { payFreq: 'weekly', payAnchor: '2026-10-02' }, days: {}, autoCredits: [{ bank: 'lieu', date: '2026-10-12', hours: 7.5, sub: 'Thanksgiving worked' }, { bank: 'other', date: '2026-10-13', hours: 9 }] }, '2026-10-29');
  assert.equal(L.today, 2);
  assert.equal(L.rows.filter(r => r.title === 'Lieu day earned').length, 1);
  const hrs = B.normBank({ id: 'lieu', name: 'Lieu', kind: 'lieu', unit: 'h', balance: 0, asOf: '2026-10-01' });
  assert.equal(B.ledger(hrs, { profile: {}, days: {}, autoCredits: [{ bank: 'lieu', date: '2026-10-12', hours: 18 }] }, '2026-10-29').today, 18);
});
t('who can take my shift', () => {
  const def = Object.values(shifts), am = def.find(s => s.code === 'AM'), pm = def.find(s => s.code === 'PM');
  const sv = { from: '2026-10-15', to: '2027-06-01', shifts: def.map(s => ({ id: s.id, code: s.code, name: s.name, start: s.start, end: s.end, brk: s.brk, color: s.color })), days: { '2026-11-03': pm.id, '2026-11-04': am.id } };
  assert.equal(SH.availability(sv, '2026-11-10', am).state, 'free');
  assert.equal(SH.availability(sv, '2026-11-04', pm).state, 'working');
  assert.equal(SH.availability(sv, '2026-11-04', pm).shift.code, 'AM');
  assert.equal(SH.availability(sv, '2026-11-04', am).state, 'working');
  const tight = SH.availability(sv, '2026-11-04', def.find(s => s.code === 'D') || am);
  assert.equal(tight.state, 'working');
  const tightFree = SH.availability({ ...sv, days: { '2026-11-03': pm.id } }, '2026-11-04', am);
  assert.equal(tightFree.state, 'tight');
  assert.match(tightFree.warns[0], /their/);
  assert.equal(SH.availability(sv, '2030-01-01', am).state, 'unknown');
  assert.equal(SH.availability({ denied: true }, '2026-11-10', am).state, 'none');
  const th = SH.theirShifts(sv, '2026-11-01', '2026-11-10', 4);
  assert.deepEqual(th.map(x => x.d), ['2026-11-03', '2026-11-04']);
});
t('rotation can start on any weekday', () => {
  for (let ws = 0; ws < 7; ws++) { const a = E.alignToWeekStart('2026-10-28', ws); assert.equal(E.weekday(a), ws); assert.ok(E.diffDays('2026-10-28', a) <= 0 && E.diffDays('2026-10-28', a) > -7); }
});
console.log(`\n${passed} groups passed`);
