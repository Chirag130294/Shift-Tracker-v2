// Run with: node tests/v16.test.mjs   (gross pay, premiums, unpaid breaks, day rules, pay periods, currency, sick pay percent)
import assert from 'node:assert/strict';
import * as E from '../src/utils/engine';
import * as B from '../src/utils/banks';
import * as P from '../src/utils/pay';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };
const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 0.005, `${m} ${a} != ${b}`);
const tpl = (id, extra = {}) => {
  const T = P.PAY_TEMPLATES[id], base = P.defaultPay();
  return { ...base, rate: 40, mode: T.mode, wk: T.wk, periods: T.periods.map((q, i) => ({ id: 'p' + i, name: q[0], start: q[1], end: q[2], prem: q[3] })), unpaid: T.unpaid.map(u => ({ len: u[0], u: u[1] })), ...extra };
};
const prof = (pay, extra = {}) => ({ payFreq: 'biweekly', payAnchor: '2026-11-13', payWeekend: 'before', banks: B.DEFAULT_BANKS(), pay, ...extra });
const DAY = { id: 'am', code: 'AM', name: '12-hr Day', start: '07:00', end: '19:00', brk: 30, color: '#f00' };
const NIGHT = { id: 'pm', code: 'PM', name: '12-hr Night', start: '19:00', end: '07:00', brk: 30, color: '#00f' };
const D8 = { id: 'd', code: 'D', name: '8-hr Day', start: '07:00', end: '15:00', brk: 30, color: '#0a0' };
const D85 = { id: 'x', code: 'X', name: '8.5', start: '07:00', end: '15:30', brk: 0, color: '#0a0' };

t('7 to 7 shift: morning 7-3 has no premium, 3-7 pm gets the evening premium, 0.75 h unpaid', () => {
  const r = P.calcShift(DAY, '2026-10-27', prof(tpl('hospital')));   // a Tuesday
  near(r.paid, 11.25); near(r.unpaid, 0.75);
  const ev = r.lines.find(l => l.label === 'Evening premium');
  near(ev.h, 4); near(ev.amt, 8);
  assert.equal(r.lines.find(l => l.label === 'Morning premium'), undefined);
  near(r.total, 11.25 * 40 + 8);
});
t('8 h shift loses 0.5 h and an 8.5 h shift with a 0.5 h rule is paid 8 h', () => {
  near(P.calcShift(D8, '2026-10-27', prof(tpl('hospital'))).paid, 7.5);
  near(P.calcShift(D85, '2026-10-27', prof(tpl('office'))).paid, 8);
});
t('with no unpaid rule for a length, the shift\'s own break is used', () => {
  near(P.calcShift(D8, '2026-10-27', prof(tpl('blank'))).paid, 7.5);
  near(P.calcShift({ ...D8, brk: 0 }, '2026-10-27', prof(tpl('blank'))).paid, 8);
});
t('percent premiums are a share of base', () => {
  const r = P.calcShift(NIGHT, '2026-10-27', prof(tpl('plant', { rate: 30 })));
  const n = r.lines.find(l => l.label === 'Night premium');
  near(n.r, 30 * 0.08); near(n.h, 10.5);   // 7 pm to 6 am is 11 h, less 0.5 h unpaid
});
t('day rule: where a Friday night shift counts (weekend premium shows it)', () => {
  const run = rule => P.calcShift(NIGHT, '2026-10-30', prof(tpl('hospital', { dayRule: rule })));   // Fri 30 Oct
  let r = run('start'); assert.equal(r.parts.length, 1); assert.equal(r.parts[0].date, '2026-10-30'); assert.equal(r.lines.find(l => l.cat === 'wk'), undefined);
  r = run('end'); assert.equal(r.parts[0].date, '2026-10-31'); near(r.lines.find(l => l.cat === 'wk').h, 11.25);
  r = run('split'); assert.equal(r.parts.length, 2); assert.equal(r.parts[0].date, '2026-10-30'); assert.equal(r.parts[1].date, '2026-10-31');
  near(r.parts[0].paid + r.parts[1].paid, 11.25); near(r.lines.find(l => l.cat === 'wk').h, r.parts[1].paid);
  r = run('most'); assert.equal(r.parts.length, 1); assert.equal(r.parts[0].date, '2026-10-31');
});
t('stat holiday multiplier pays the extra on top of base', () => {
  const r = P.calcShift(DAY, '2026-12-25', prof(tpl('blank', { holMult: 1.5 })), d => d === '2026-12-25');
  near(r.lines.find(l => l.cat === 'hol').amt, 11.5 * 40 * 0.5);   // blank template: the shift's own 30 min break
});
t('currency: $, rupee grouping, euro, custom symbol', () => {
  assert.equal(P.money(prof({ cur: 'CAD' }), 1234.5), '$1,234.50');
  assert.equal(P.money(prof({ cur: 'INR' }), 123456.5), '₹1,23,456.50');
  assert.equal(P.money(prof({ cur: 'EUR' }), 1234.5), '€1,234.50');
  assert.equal(P.money(prof({ cur: 'custom', sym: 'Rs ' }), 99), 'Rs 99.00');
  assert.equal(P.currencySymbol(prof({ cur: 'GBP' })), '£');
});
t('biweekly periods: known pay date, period ends 6 days before', () => {
  const q = P.periodFor(prof(tpl('blank')), '2026-10-29');
  assert.deepEqual(q, { start: '2026-10-25', end: '2026-11-07', pay: '2026-11-13' });
  assert.deepEqual(P.periodForPayDay(prof(tpl('blank')), '2026-11-13'), q);
  const q2 = P.periodFor(prof(tpl('blank', { lag: 0 })), '2026-11-02');
  assert.deepEqual(q2, { start: '2026-10-31', end: '2026-11-13', pay: '2026-11-13' });
});
t('weekly periods are 7 days', () => {
  const q = P.periodFor(prof(tpl('blank', { lag: 5 }), { payFreq: 'weekly', payAnchor: '2026-11-06' }), '2026-10-28');
  assert.deepEqual(q, { start: '2026-10-26', end: '2026-11-01', pay: '2026-11-06' });
});
t('twice a month: 15th and last day, and custom days', () => {
  const p = prof(tpl('blank', { lag: 0 }), { payFreq: 'semimonthly', payAnchor: '' });
  assert.deepEqual(P.periodFor(p, '2026-10-20'), { start: '2026-10-16', end: '2026-10-31', pay: '2026-10-30' });  // 31 Oct is a Saturday, paid Friday
  assert.deepEqual(P.periodFor(p, '2026-10-05'), { start: '2026-10-01', end: '2026-10-15', pay: '2026-10-15' });
  const c = prof(tpl('blank', { lag: 5, semi: [5, 20] }), { payFreq: 'semimonthly', payAnchor: '' });
  assert.deepEqual(P.periodFor(c, '2026-10-10'), { start: '2026-10-01', end: '2026-10-15', pay: '2026-10-20' });
});
t('monthly: choose the start day and the pay day', () => {
  const a = prof(tpl('blank', { mStart: 1, mDay: 5 }), { payFreq: 'monthly', payAnchor: '' });
  assert.deepEqual(P.periodFor(a, '2026-10-12'), { start: '2026-10-01', end: '2026-10-31', pay: '2026-11-05' });
  const b = prof(tpl('blank', { mStart: 16, mDay: 15 }), { payFreq: 'monthly', payAnchor: '' });
  assert.deepEqual(P.periodFor(b, '2026-10-20'), { start: '2026-10-16', end: '2026-11-15', pay: '2026-11-13' });  // 15 Nov is a Sunday
  const c = prof(tpl('blank', { mStart: 1, mDay: 31 }), { payFreq: 'monthly', payAnchor: '', payWeekend: 'none' });
  assert.deepEqual(P.periodFor(c, '2026-02-10'), { start: '2026-02-01', end: '2026-02-28', pay: '2026-02-28' });
});
t('pay days still follow the old settings when nothing new is set', () => {
  assert.deepEqual(E.payDates({ payFreq: 'monthly', payAnchor: '2026-01-31', payWeekend: 'none' }, '2026-02-01', '2026-02-28'), ['2026-02-28']);
  assert.deepEqual(E.payDates({ payFreq: 'semimonthly', payWeekend: 'before' }, '2026-10-01', '2026-10-31'), ['2026-10-15', '2026-10-30']);
});
t('whole period: shifts, premiums, overtime, sick at 70 percent, banked overtime is not paid', () => {
  const pat = { id: 'p1', mode: 'week', anchor: '2026-10-25', effectiveFrom: '1900-01-01', days: ['am', 'am', '', '', '', '', '', '', '', '', '', '', '', ''] };
  const p = prof(tpl('hospital', { leavePay: { sick: 70 } }), { patterns: [pat] });
  const days = { '2026-10-26': { type: 'SICK', hours: 11.25 }, '2026-10-25': { type: 'OT', hours: 2 }, '2026-11-01': { type: 'OT', hours: 1, toBank: 'bank' } };
  const C = { shifts: { am: DAY }, patterns: [pat], days };
  const per = P.periodFor(p, '2026-10-29'), r = P.computePeriod(p, per, C, () => false, '2026-10-29');
  // Oct 25 works AM plus 2 h OT, Oct 26 sick, Nov 1 is a day off with 1 h banked OT
  near(r.totals.leave, 11.25 * 40 * 0.7);
  near(r.totals.ot, 2 * 40 * 1.5);
  const shifts = r.items.filter(i => i.kind === 'shift');
  assert.equal(shifts.length, 1);
  assert.equal(r.items.find(i => i.banked).total, 0);
  near(r.totals.total, r.totals.base + r.totals.prem + r.totals.wk + r.totals.hol + r.totals.ot + r.totals.leave);
  near(r.totals.earned, r.items.filter(i => i.date <= '2026-10-29').reduce((a, i) => a + i.total, 0));
});
t('split rule puts the early hours of a shift in the next pay period', () => {
  const pat = { id: 'p1', mode: 'week', anchor: '2026-11-01', effectiveFrom: '1900-01-01', days: ['pm', '', '', '', '', '', '', '', '', '', '', '', '', ''] };
  const mk = rule => prof(tpl('blank', { dayRule: rule }), { patterns: [pat] });
  const C = { shifts: { pm: NIGHT }, patterns: [pat], days: {} };
  const per = { start: '2026-10-25', end: '2026-11-07', pay: '2026-11-13' };
  // Night shift starting Sat 7 Nov 19:00 ends Sun 8 Nov 07:00
  const C2 = { ...C, patterns: [{ ...pat, anchor: '2026-11-07', days: ['pm', ...Array(13).fill('')] }] };
  const total = rule => P.computePeriod(mk(rule), per, C2).totals.hours;
  near(total('start'), 11.5); near(total('end'), 11.5);   // start: the 7 Nov night. end: the 24 Oct night that finishes on 25 Oct
  assert.ok(total('split') > 0 && total('split') <= 11.5);
});
t('currency symbol and defaults survive a bad profile', () => {
  const n = P.normPay({ rate: -5, cur: 'XXX', dayRule: 'nope', periods: [], leavePay: { sick: 'a' } });
  assert.equal(n.rate, 0); assert.equal(n.cur, 'CAD'); assert.equal(n.dayRule, 'start'); assert.equal(n.periods.length, 3); assert.equal(n.leavePay.sick, 100);
});
console.log(`\n${passed} passed`);
