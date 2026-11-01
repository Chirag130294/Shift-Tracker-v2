// New in v2: day-document validation, the calendar month model, the storage service and the ledger.
import assert from 'node:assert/strict';
import { DayValidationError, cleanDay, parseDayDoc, readDayDoc, toDayPayload, withoutTypeKeys } from '../src/services/dayDoc';
import { StorageKey, StorageService } from '../src/services/StorageService';
import { buildMonth } from '../src/state/calendarModel';
import { buildCtx, bankStat, leaveGroups } from '../src/state/derive';
import { normalizeProfile } from '../src/state/profile';
import * as B from '../src/utils/banks';
import * as E from '../src/utils/engine';
import type { Pattern } from '../src/types';

let passed = 0;
const t = (name: string, fn: () => void): void => { fn(); passed++; console.log('ok  ' + name); };
const rejects = (fn: () => unknown, msg: RegExp): void => assert.throws(fn, (e: unknown) => e instanceof DayValidationError && msg.test(e.message));

const pattern: Pattern = { id: 'p1', mode: 'week', anchor: '2026-10-11', effectiveFrom: '1900-01-01', days: ['am', 'am', '', '', 'pm', 'pm', '', '', 'd', 'e', 'n', '', '', 'am'] };
const profile = normalizeProfile({ onboarded: true, patterns: [pattern], payFreq: 'biweekly', payAnchor: '2026-10-29', country: 'CA', region: 'ON' });

t('day payloads: every key the rules allow passes', () => {
  const day = { type: 'LEAVE', shiftId: 'am', hours: 7.5, person: 'Sam', note: 'x', lieu: true, noLieu: true, bank: 'b1', toBank: 'b2', splits: [{ bank: 'vac', h: 4 }, { bank: 'bank', h: 3.5 }] };
  assert.deepEqual(parseDayDoc(day), day);
});
t('day payloads: anything the rules would refuse is refused before sending', () => {
  rejects(() => parseDayDoc({ type: 'VAC', extra: 1 }), /not a field/);
  rejects(() => parseDayDoc({ type: 'HOLIDAY' }), /not a day type/);
  rejects(() => parseDayDoc({ note: 'x'.repeat(501) }), /500/);
  rejects(() => parseDayDoc({ person: 'x'.repeat(101) }), /100/);
  rejects(() => parseDayDoc({ splits: Array.from({ length: 7 }, () => ({ bank: 'vac', h: 1 })) }), /at most 6/);
  rejects(() => parseDayDoc({ hours: -1 }), /hours/);
  rejects(() => parseDayDoc({ hours: Number.NaN }), /hours/);
  rejects(() => parseDayDoc({ hours: '7' }), /hours/);
  rejects(() => parseDayDoc({ lieu: 'yes' }), /true or false/);
  rejects(() => parseDayDoc(null), /object/);
  rejects(() => toDayPayload('2026-02-30', { type: 'VAC' }), /real calendar date/);
  rejects(() => toDayPayload('26-1-1', { type: 'VAC' }), /YYYY-MM-DD/);
});
t('day payloads: unset values are dropped, so nothing undefined reaches Firestore', () => {
  assert.deepEqual(toDayPayload('2026-11-02', { type: 'VAC', hours: 7.5, note: '', lieu: false, person: undefined }), { type: 'VAC', hours: 7.5 });
  assert.deepEqual(cleanDay({ a: null, b: 0, c: 'x' }), { b: 0, c: 'x' });
  assert.deepEqual(withoutTypeKeys({ type: 'VAC', hours: 8, note: 'keep', lieu: true }), { note: 'keep', lieu: true });
});
t('reading is lenient: unknown fields from old data are ignored, not fatal', () => {
  assert.deepEqual(readDayDoc({ type: 'VAC', hours: 7.5, legacy: true, splits: [{ bank: 'vac', h: 2 }, { nope: 1 }] }), { type: 'VAC', hours: 7.5, splits: [{ bank: 'vac', h: 2 }] });
  assert.deepEqual(readDayDoc('garbage'), {});
});

t('storage: keys are prefixed, validated and survive without localStorage', () => {
  StorageService.set(StorageKey.USER_PREFS, { ledgerFilter: 'used' });
  assert.deepEqual(StorageService.get(StorageKey.USER_PREFS), { ledgerFilter: 'used' });
  StorageService.update(StorageKey.CACHE_HOLIDAYS, cur => ({ ...(cur ?? {}), 'DE|2026': [{ date: '2026-01-01', name: 'Neujahr', global: true, counties: [] }] }));
  assert.equal(StorageService.get(StorageKey.CACHE_HOLIDAYS)?.['DE|2026']?.length, 1);
  StorageService.remove(StorageKey.USER_PREFS);
  assert.equal(StorageService.get(StorageKey.USER_PREFS), null);
});

t('month model: leads, night-shift continuation, holidays and pay days', () => {
  const ctx = buildCtx(profile, {});
  const m = buildMonth(profile, ctx, d => (d === '2026-10-12' ? 'Thanksgiving' : null), 2026, 10, '2026-10-30');
  assert.equal(m.weekdayLabels[0], 'Sunday');
  assert.equal(m.weeks.length, 5);
  assert.ok(m.weeks.every(w => w.length === 7));
  const cells = m.weeks.flat().filter((c): c is NonNullable<typeof c> => c !== null);
  assert.equal(cells.length, 31);
  assert.equal(m.weeks[0].filter(c => c === null).length, 4);   // Oct 1 2026 is a Thursday
  const byDate = Object.fromEntries(cells.map(c => [c.date, c]));
  assert.equal(byDate['2026-10-11'].badge?.label, 'AM');
  assert.equal(byDate['2026-10-15'].nightShift, true);          // PM starts Thursday
  assert.equal(byDate['2026-10-17'].continuation, '#25327A');   // Friday's PM ends Saturday morning
  assert.equal(byDate['2026-10-17'].caption, 'ends 7a');
  assert.equal(byDate['2026-10-17'].badge, null);               // nothing starts that day
  assert.equal(byDate['2026-10-12'].holiday, 'Thanksgiving');
  assert.equal(byDate['2026-10-29'].isPayDay, true);
  assert.equal(byDate['2026-10-30'].isToday, true);
});
t('month model: week start follows the profile', () => {
  const mon = { ...profile, weekStart: 1 };
  const m = buildMonth(mon, buildCtx(mon, {}), () => null, 2026, 10, '2026-10-30');
  assert.equal(m.weekdayLabels[0], 'Monday');
  assert.equal(m.weeks[0].filter(c => c === null).length, 3);
});
t('month model: leave, swaps and overtime are labelled', () => {
  const days = { '2026-10-11': { type: 'VAC' as const, hours: 11.5 }, '2026-10-12': { type: 'EXTRA' as const, shiftId: 'd', hours: 7.5 }, '2026-10-19': { type: 'SWAP_OUT' as const, shiftId: 'd', hours: 7.5 }, '2026-10-18': { type: 'OT' as const, hours: 2 } };
  const m = buildMonth(profile, buildCtx(profile, days), () => null, 2026, 10, '2026-10-30');
  const c = Object.fromEntries(m.weeks.flat().filter((x): x is NonNullable<typeof x> => x !== null).map(x => [x.date, x]));
  assert.equal(c['2026-10-11'].badge?.label, 'VAC');
  assert.equal(c['2026-10-11'].caption, '-11.5h');
  assert.equal(c['2026-10-12'].badge?.dashed, true);
  assert.equal(c['2026-10-12'].swapMarker, true);
  assert.equal(c['2026-10-19'].badge?.faded, true);
  assert.equal(c['2026-10-18'].overtime, true);
});

t('ledger: a booked vacation day lowers what is available, not what you have today', () => {
  const today = E.todayIso();
  const banks = B.DEFAULT_BANKS().map(b => (b.id === 'vac' ? { ...b, balance: 84, asOf: today } : { ...b, asOf: today }));
  const p = { ...profile, banks };
  const future = E.addDays(today, 5);
  const s = bankStat(p, { [future]: { type: 'VAC', hours: 11.5 } }, 'vac');
  assert.equal(s.left, 84);
  assert.equal(s.booked, 11.5);
  assert.equal(s.after, 72.5);
  assert.equal(bankStat(p, { [future]: { type: 'VAC', hours: 11.5 } }, 'vac', future).after, 84);
  assert.equal(bankStat(p, {}, 'nope').bank, null);
});
t('leave groups join days with no shift between them', () => {
  const days = { '2026-10-11': { type: 'VAC' as const, hours: 11.5 }, '2026-10-12': { type: 'VAC' as const, hours: 11.5 }, '2026-10-15': { type: 'SICK' as const, hours: 11.5 } };
  const g = leaveGroups(profile, days);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].start, g[0].end, g[0].n], ['2026-10-11', '2026-10-12', 2]);
});

console.log(`\n${passed} v2 test groups passed`);
