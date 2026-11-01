// Run with: node tests/v14.test.mjs   (banks, week start, shared view, swaps)
import assert from 'node:assert/strict';
import * as E from '../src/utils/engine';
import * as B from '../src/utils/banks';
import * as SH from '../src/utils/share';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };
const shifts = Object.fromEntries(E.DEFAULT_SHIFTS().map(s => [s.id, s]));
const pattern = { id: 'p1', mode: 'week', anchor: '2026-10-11', effectiveFrom: '1900-01-01', days: ['am', 'am', '', '', 'pm', 'pm', '', '', 'd', 'e', 'n', '', '', 'am'] };
const profile = (extra = {}) => ({ name: 'Vik', shifts: Object.values(shifts), patterns: [pattern], payFreq: 'biweekly', payAnchor: '2026-10-08', ...extra });

t('week start helpers', () => {
  assert.equal(E.weekOffset('2026-10-25', 0), 0);   // Sunday
  assert.equal(E.weekOffset('2026-10-25', 1), 6);   // Sunday is the last day of a Monday week
  assert.equal(E.alignToWeekStart('2026-10-28', 1), '2026-10-26');
  assert.equal(E.alignToWeekStart('2026-10-28', 6), '2026-10-24');
  assert.equal(E.alignToWeekStart('2026-10-24', 6), '2026-10-24');
});

t('LEAVE counts as time off in the engine', () => {
  const c = { shifts, patterns: [pattern], days: { '2026-10-11': { type: 'LEAVE', bank: 'x', hours: 11.5 } } };
  assert.equal(E.dayInfo('2026-10-11', c).isWorking, false);
});

const banksFor = p => B.migrateBanks(p);
t('v1.0 profile becomes banks', () => {
  const b = banksFor({ vacHours: 84, vacAsOf: '2026-10-01', sickHours: 36, sickAsOf: '2026-10-01', accrual: 3.7 });
  assert.equal(b.length, 4);
  assert.equal(b[0].balance, 84); assert.equal(b[0].earn.amount, 3.7); assert.equal(b[1].balance, 36); assert.equal(b[3].unit, 'd');
});

t('available to book subtracts future booked days; today does not', () => {
  const bank = B.normBank({ id: 'vac', name: 'Vacation', unit: 'h', balance: 165.8, asOf: '2026-09-28', earn: { rule: 'pay', amount: 3.7 } });
  const days = {
    '2026-10-15': { type: 'VAC', hours: 11.5 },
    '2026-10-26': { type: 'VAC', hours: 11.5 }, '2026-10-27': { type: 'VAC', hours: 11.5 }, '2026-10-30': { type: 'VAC', hours: 11.5 }
  };
  const L = B.ledger(bank, { profile: profile(), days }, '2026-10-25');
  // pay days Oct 8 and Oct 22: +3.7 each; Oct 15 used 11.5
  assert.equal(+L.today.toFixed(2), +(165.8 + 3.7 + 3.7 - 11.5).toFixed(2));
  assert.equal(+L.booked.toFixed(2), 34.5);
  assert.equal(+L.available.toFixed(2), +(L.today - 34.5).toFixed(2));
  assert.equal(+L.available.toFixed(2), 127.2);
  assert.ok(L.rows.some(r => r.future && r.kind === 'earn'), 'next pay day is shown as projected');
});

t('days bank converts hours (12 h shift = 1.5 days at 7.5 h)', () => {
  const bank = B.normBank({ id: 'lieu', name: 'Lieu', unit: 'd', dayHours: 7.5, balance: 3, asOf: '2026-10-01', kind: 'lieu' });
  const L = B.ledger(bank, { profile: profile(), days: { '2026-10-14': { type: 'LIEU', hours: 11.25 } } }, '2026-10-25');
  assert.equal(+L.today.toFixed(2), 1.5);
  assert.equal(B.fmtAmt(bank, L.today), '1.5 d');
});

t('old lieu day with no hours counts as one day', () => {
  const bank = B.normBank({ id: 'lieu', unit: 'd', balance: 2, asOf: '2026-10-01', kind: 'lieu' });
  const L = B.ledger(bank, { profile: profile(), days: { '2026-10-14': { type: 'LIEU' } } }, '2026-10-25');
  assert.equal(L.today, 1);
});

t('overtime can be banked and lieu earned on a stat holiday', () => {
  const bank = B.normBank({ id: 'bank', unit: 'h', balance: 5, asOf: '2026-10-01', kind: 'bank' });
  const L = B.ledger(bank, { profile: profile(), days: { '2026-10-14': { type: 'OT', hours: 2.5, toBank: 'bank' } } }, '2026-10-25');
  assert.equal(L.today, 7.5);
  const lieu = B.normBank({ id: 'lieu', unit: 'd', balance: 0, asOf: '2026-10-01', kind: 'lieu' });
  const L2 = B.ledger(lieu, { profile: profile(), days: { '2026-10-12': { lieu: true } } }, '2026-10-25');
  assert.equal(L2.today, 1);
});

t('split booking draws from two banks', () => {
  const o = { type: 'VAC', hours: 11.5, splits: [{ bank: 'vac', h: 4 }, { bank: 'bank', h: 7.5 }] };
  assert.deepEqual(B.daySplits(o).map(s => s.bank), ['vac', 'bank']);
  const bank = B.normBank({ id: 'bank', unit: 'h', balance: 12.5, asOf: '2026-10-01' });
  const L = B.ledger(bank, { profile: profile(), days: { '2026-10-20': o } }, '2026-10-25');
  assert.equal(L.today, 5);
  assert.equal(B.checkSplit(o.splits, 11.5), '');
  assert.match(B.checkSplit(o.splits, 12), /add up/);
});

t('yearly bank with reset loses unused time on Jan 1', () => {
  const bank = B.normBank({ id: 'p', unit: 'd', dayHours: 7.5, balance: 2, asOf: '2026-10-25', grant: { on: true, amount: 2, date: '01-01' }, reset: true });
  const L = B.ledger(bank, { profile: profile(), days: {} }, '2027-01-02');
  assert.equal(L.today, 2);          // 2 left, reset to 0, +2 new
  const L2 = B.ledger({ ...bank, reset: false }, { profile: profile(), days: {} }, '2027-01-02');
  assert.equal(L2.today, 4);
});

t('whole year added at once (switch on) instead of per pay day (switch off)', () => {
  const base = { id: 'vac', unit: 'h', balance: 10, asOf: '2026-12-20' };
  const upfront = B.normBank({ ...base, earn: { rule: 'none', amount: 0 }, grant: { on: true, amount: 120, date: '01-01' } });
  const perPay = B.normBank({ ...base, earn: { rule: 'pay', amount: 4.6 }, grant: { on: false, amount: 120, date: '01-01' } });
  const P = profile({ payAnchor: '2026-12-31' });
  const a = B.ledger(upfront, { profile: P, days: {} }, '2027-01-05');
  const b = B.ledger(perPay, { profile: P, days: {} }, '2027-01-05');
  assert.equal(a.today, 130);                       // 10 + 120 on Jan 1
  assert.ok(b.today < 20, 'per pay adds only a little: ' + b.today);
  // a different date works too (work anniversary on Apr 15)
  const ann = B.normBank({ ...base, grant: { on: true, amount: 100, date: '04-15' } });
  assert.equal(B.ledger(ann, { profile: P, days: {} }, '2027-04-14').today, 10);
  assert.equal(B.ledger(ann, { profile: P, days: {} }, '2027-04-15').today, 110);
  // both on: grant plus per pay
  const both = B.normBank({ ...base, earn: { rule: 'pay', amount: 1 }, grant: { on: true, amount: 50, date: '01-01' } });
  assert.ok(B.ledger(both, { profile: P, days: {} }, '2027-01-05').today >= 61);
});

t('shared view lists only working shifts: vacation and sick look like days off', () => {
  const days = {
    '2026-10-12': { type: 'VAC', hours: 11.5, note: 'secret trip' },
    '2026-10-13': { type: 'SICK', hours: 11.5 },
    '2026-10-14': { type: 'LEAVE', bank: 'x', hours: 11.5 },
    '2026-10-19': { type: 'SWAP_IN', shiftId: 'd', hours: 7.5, person: 'Sam' },
    '2026-10-15': { type: 'SWAP_OUT', shiftId: 'pm', hours: 11.5 }
  };
  const v = SH.buildSharedView(profile(), days, '2026-10-20');
  const dump = JSON.stringify(v);
  assert.ok(!/VAC|SICK|LEAVE|secret|note|hours|person|Sam|balance/i.test(Object.keys(v).join(',') + JSON.stringify(v.days)));
  assert.equal(v.days['2026-10-12'], undefined);
  assert.equal(v.days['2026-10-13'], undefined);
  assert.equal(v.days['2026-10-14'], undefined);
  assert.equal(v.days['2026-10-15'], undefined);        // given away: not working
  assert.equal(v.days['2026-10-19'], 'd');              // picked up
  assert.ok(!dump.includes('secret trip'));
  assert.ok(Object.keys(v).sort().join() === ['days', 'from', 'hash', 'name', 'shifts', 'to', 'weekStart'].join());
  assert.ok(Object.keys(v.days).every(d => d >= '2026-10-06' && d <= '2027-06-17'));
  const v2 = SH.buildSharedView(profile(), days, '2026-10-21');
  assert.equal(v.hash === v2.hash, false);              // window moved, days differ
  const v3 = SH.buildSharedView(profile(), days, '2026-10-20');
  assert.equal(v.hash, v3.hash);
});

t('rest check warns about quick turnarounds', () => {
  const ctx = { shifts, patterns: [pattern], days: {} };
  // Oct 15 is PM (19:00 to 07:00 on the 16th). A day shift on the 16th starts at 07:00: 0 h rest
  const w = SH.restWarnings(ctx, '2026-10-16', shifts.d);
  assert.ok(w.length >= 1);
  // a free day with nothing around it is fine
  assert.deepEqual(SH.restWarnings(ctx, '2026-10-13', shifts.d), []);
});

t('swap flow: ask, counter, approve plan', () => {
  const a = { uid: 'A', name: 'Alex' }, b = { uid: 'B', name: 'Sam' };
  const now = 1000;
  let s = SH.newSwap({ a, b, aDate: '2026-11-03', aShift: shifts.e, bDate: '2026-11-05', bShift: shifts.d, note: 'thanks', now });
  assert.equal(s.turn, 'B'); assert.equal(s.status, 'pending');
  const c = SH.counterPatch(s, 'B', '2026-11-12', shifts.n, 2000);
  assert.equal(c.status, 'countered'); assert.equal(c.turn, 'A'); assert.equal(c.bDate, '2026-11-12'); assert.equal(c.bShift.code, 'N');
  s = { ...s, ...c };
  const ap = SH.answerPatch(s, 'A', 'approved', 3000);
  assert.equal(ap.status, 'approved');
  s = { ...s, ...ap };
  // A's calendar: gives E on Nov 3 (A works E that day), takes N on Nov 12
  const ctxA = { shifts, patterns: [{ ...pattern, days: pattern.days }], days: { '2026-11-03': { type: 'EXTRA', shiftId: 'e', hours: 7.5 } } };
  const plan = SH.planApproved(s, 'A', ctxA);
  assert.equal(plan.error, '');
  assert.equal(plan.writes['2026-11-03'].type, 'SWAP_OUT');
  assert.equal(plan.writes['2026-11-03'].person, 'Sam');
  assert.equal(plan.writes['2026-11-12'].type, 'SWAP_IN');
  assert.equal(plan.writes['2026-11-12'].shiftId, 'n');
  assert.equal(plan.newShift, null);
  // B has a library without that shift code: a new shift is created from the other person's definition
  const ctxB = { shifts: { d: shifts.d }, patterns: [], days: { '2026-11-12': { type: 'EXTRA', shiftId: 'd', hours: 7.5 } } };
  const planB = SH.planApproved(s, 'B', ctxB);
  assert.equal(planB.writes['2026-11-03'].type, 'SWAP_IN');
  assert.ok(planB.newShift && planB.newShift.code === 'E');
  assert.equal(planB.writes['2026-11-03'].shiftId, planB.newShift.id);
});

t('invite codes look random and notices are trimmed', () => {
  const a = SH.newCode(), b = SH.newCode();
  assert.equal(a.length, 15); assert.notEqual(a, b);
  assert.equal(SH.newNotice({ type: 'x', from: 'u', fromName: 'N', text: 'y'.repeat(400), now: 1 }).text.length, 200);
  assert.equal(SH.initials('Sam Lee'), 'SL');
});

console.log(`\n${passed} test groups passed`);
