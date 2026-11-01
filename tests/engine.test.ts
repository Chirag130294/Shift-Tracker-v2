// Ported unchanged from v1.6: proves the TypeScript engine and holiday rules give the same answers.
import assert from 'node:assert/strict';
import * as E from '../src/utils/engine';
import { holidaysFor } from '../src/utils/holidays';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };

const shifts = Object.fromEntries(E.DEFAULT_SHIFTS().map(s => [s.id, s]));
// Sample rotation from the plan: Week 1 starts Sunday 2026-10-11
const pattern = {
  id: 'p1', mode: 'week', anchor: '2026-10-11', effectiveFrom: '1900-01-01',
  days: ['am', 'am', '', '', 'pm', 'pm', '', '', 'd', 'e', 'n', '', '', 'am']
};
const ctx = (extra = {}) => ({ shifts, patterns: [pattern], days: {}, ...extra });

t('weekday and day numbers', () => {
  assert.equal(E.weekday('2026-10-24'), 6);          // Saturday
  assert.equal(E.weekday('2026-10-25'), 0);          // Sunday
  assert.equal(E.addDays('2028-02-28', 1), '2028-02-29');   // leap day
  assert.equal(E.addDays('2100-02-28', 1), '2100-03-01');   // 2100 is not a leap year
  assert.equal(E.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(E.diffDays('2026-10-11', '2026-10-25'), 14);
  assert.equal(E.alignToSunday('2026-10-14'), '2026-10-11');
});

t('paid hours and midnight crossing', () => {
  assert.equal(E.paidHours(shifts.am), 11.5);
  assert.equal(E.paidHours(shifts.pm), 11.5);
  assert.equal(E.paidHours(shifts.d), 7.5);
  assert.equal(E.paidHours(shifts.n), 7.5);
  assert.equal(E.crossesMidnight(shifts.pm), true);
  assert.equal(E.crossesMidnight(shifts.n), true);
  assert.equal(E.crossesMidnight(shifts.am), false);
  assert.equal(E.paidHours({ start: '08:00', end: '08:00', brk: 0 }), 24);
});

t('rotation repeats from the anchor, forward and backward', () => {
  const c = ctx();
  assert.equal(E.baseShiftId('2026-10-11', c.patterns), 'am');
  assert.equal(E.baseShiftId('2026-10-13', c.patterns), '');
  assert.equal(E.baseShiftId('2026-10-15', c.patterns), 'pm');
  assert.equal(E.baseShiftId('2026-10-19', c.patterns), 'd');
  assert.equal(E.baseShiftId('2026-10-24', c.patterns), 'am');   // Sat of Week 2 (matches the mockup)
  assert.equal(E.baseShiftId('2026-10-25', c.patterns), 'am');   // repeats to Week 1
  assert.equal(E.baseShiftId('2026-10-10', c.patterns), 'am');   // before the anchor
  assert.equal(E.baseShiftId('2028-02-29', c.patterns), E.baseShiftId(E.addDays('2028-02-29', -14 * 10), c.patterns));
  const pos = E.rotationPosition('2026-10-24', c.patterns);
  assert.deepEqual([pos.week, pos.weeks], [2, 2]);
});

t('a night shift belongs to the day it starts', () => {
  const c = ctx();
  const fri = E.dayInfo('2026-10-16', c);   // Friday PM
  assert.equal(fri.work, 'pm');
  const sat = E.dayInfo('2026-10-17', c);   // the morning it ends: no shift starts here
  assert.equal(sat.isWorking, false);
});

t('overrides: vacation, sick, swaps, extra, overtime', () => {
  const day = '2026-10-15'; // PM
  let i = E.dayInfo(day, ctx({ days: { [day]: { type: 'VAC', hours: 11.5 } } }));
  assert.equal(i.isWorking, false); assert.equal(i.baseHours, 11.5); assert.equal(i.type, 'VAC');
  i = E.dayInfo(day, ctx({ days: { [day]: { type: 'SWAP_OUT', shiftId: 'pm' } } }));
  assert.equal(i.isWorking, false);
  i = E.dayInfo('2026-10-13', ctx({ days: { '2026-10-13': { type: 'SWAP_IN', shiftId: 'e' } } }));
  assert.equal(i.work, 'e'); assert.equal(i.hours, 7.5);
  i = E.dayInfo('2026-10-13', ctx({ days: { '2026-10-13': { type: 'EXTRA', shiftId: 'n' } } }));
  assert.equal(i.work, 'n');
  i = E.dayInfo(day, ctx({ days: { [day]: { type: 'OT', hours: 2 } } }));
  assert.equal(i.work, 'pm'); assert.equal(i.hours, 13.5);
  i = E.dayInfo(day, ctx({ days: { [day]: { note: 'bring snacks' } } }));
  assert.equal(i.work, 'pm');   // note-only record does not change the shift
});

t('a new schedule keeps the old one for past dates', () => {
  const blank = { id: 'p2', mode: 'cycle', anchor: '2026-12-06', effectiveFrom: '2026-12-06', days: ['d', 'd', '', ''] };
  const pats = [pattern, blank];
  assert.equal(E.baseShiftId('2026-12-05', pats), E.baseShiftId('2026-12-05', [pattern]));
  assert.equal(E.baseShiftId('2026-12-06', pats), 'd');
  assert.equal(E.baseShiftId('2026-12-08', pats), '');
  assert.equal(E.baseShiftId('2026-12-10', pats), 'd');
});

t('day-cycle pattern (Pitman 2-2-3)', () => {
  const pitman = { id: 'x', mode: 'cycle', anchor: '2026-01-01', effectiveFrom: '1900-01-01',
    days: ['am', 'am', '', '', 'am', 'am', 'am', '', '', 'am', 'am', '', '', ''] };
  const worked = [];
  for (let n = 0; n < 14; n++) if (E.baseShiftId(E.addDays('2026-01-01', n), [pitman])) worked.push(n);
  assert.deepEqual(worked, [0, 1, 4, 5, 6, 9, 10]);
  assert.equal(E.baseShiftId('2026-01-15', [pitman]), 'am');
});

t('pay days', () => {
  const bi = { payFreq: 'biweekly', payAnchor: '2026-10-29' };
  assert.deepEqual(E.payDates(bi, '2026-10-01', '2026-11-30'), ['2026-10-01', '2026-10-15', '2026-10-29', '2026-11-12', '2026-11-26']);
  const wk = { payFreq: 'weekly', payAnchor: '2026-10-29' };
  assert.deepEqual(E.payDates(wk, '2026-10-29', '2026-11-12'), ['2026-10-29', '2026-11-05', '2026-11-12']);
  const semi = { payFreq: 'semimonthly', payWeekend: 'before' };
  assert.deepEqual(E.payDates(semi, '2026-02-01', '2026-02-28'), ['2026-02-13', '2026-02-27']); // 15th is Sun, 28th is Sat
  assert.deepEqual(E.payDates({ ...semi, payWeekend: 'none' }, '2026-02-01', '2026-02-28'), ['2026-02-15', '2026-02-28']);
  const mo = { payFreq: 'monthly', payAnchor: '2026-01-31', payWeekend: 'none' };
  assert.deepEqual(E.payDates(mo, '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(E.payDates({ payFreq: 'biweekly' }, '2026-01-01', '2026-02-01'), []);
});

t('off-day runs', () => {
  const runs = E.offRuns('2026-10-11', '2026-10-24', ctx());
  assert.deepEqual(runs[0], { start: '2026-10-13', end: '2026-10-14', len: 2 });
  assert.equal(runs.find(r => r.start === '2026-10-17').len, 2);   // Sat Oct 17, Sun Oct 18
});

t('holidays: Ontario 2026', () => {
  const h = holidaysFor(2026, 'CA', 'ON');
  assert.equal(h['2026-01-01'], "New Year's Day");
  assert.equal(h['2026-02-16'], 'Family Day');
  assert.equal(h['2026-04-03'], 'Good Friday');
  assert.equal(h['2026-05-18'], 'Victoria Day');
  assert.equal(h['2026-07-01'], 'Canada Day');
  assert.equal(h['2026-09-07'], 'Labour Day');
  assert.equal(h['2026-10-12'], 'Thanksgiving');
  assert.equal(h['2026-12-25'], 'Christmas Day');
  assert.equal(h['2026-12-26'], 'Boxing Day');
  assert.equal(Object.keys(h).length, 9);
});

t('holidays: Easter, BC, Alberta, US', () => {
  assert.equal(holidaysFor(2024, 'CA', 'ON')['2024-03-29'], 'Good Friday');
  assert.equal(holidaysFor(2027, 'CA', 'ON')['2027-03-26'], 'Good Friday');
  assert.equal(holidaysFor(2026, 'CA', 'BC')['2026-08-03'], 'BC Day');
  assert.equal(holidaysFor(2026, 'CA', 'AB')['2026-11-11'], 'Remembrance Day');
  assert.equal(holidaysFor(2026, 'CA', 'AB')['2026-12-26'], undefined);
  const us = holidaysFor(2026, 'US', 'US');
  assert.equal(us['2026-11-26'], 'Thanksgiving');
  assert.equal(us['2026-05-25'], 'Memorial Day');
  assert.equal(us['2026-01-19'], 'Martin Luther King Jr. Day');
  assert.deepEqual(holidaysFor(2026, '', ''), {});
});

console.log(`\n${passed} test groups passed`);
