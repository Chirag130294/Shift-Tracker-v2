// Shift Calendar: leave banks (vacation, sick, banked overtime, lieu, your own).
// Pure logic. No screen code and no Firebase in this file.
//
// A bank: { id, name, short, kind, unit: 'h'|'d', dayHours, color, balance, asOf,
//           earn:  { rule: 'none'|'pay'|'month', amount }       added a little at a time
//           grant: { on, amount, date: 'MM-DD' }                 the whole year added at once (switch on or off)
//           reset }
//   balance  = what you had on the date asOf (the day you typed it in)
//   dayHours = how many hours one day counts as (used when a bank counts in days)
//   reset    = on the grant date, unused time is lost before the new amount is added
//
// A leave day (users/{uid}/days/{date}) uses a bank in hours:
//   { type: 'VAC'|'SICK'|'LIEU'|'LEAVE', bank?, hours, splits?: [{bank, h}] }
// VAC, SICK and LIEU are the original types and always mean the banks with ids vac, sick, lieu.
//
// Ported from v1.6 banks.js. The arithmetic is unchanged; only types were added.
import * as E from './engine';
import type {
  Bank, DateStr, DayDoc, DaySplit, DayType, EarnRule, LedgerInput, LedgerResult, LedgerRow, LegacyBankFields, PayScheduleProfile, RawBank
} from '../types';

export const BANK_COLORS: readonly string[] = ['#1E6FD9', '#D9534F', '#B7791F', '#7A4FB5', '#0E7490', '#17785A', '#BE185D', '#475569'];

export function softColor(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#E3ECE9';
  const n = parseInt(m[1], 16);
  const mix = (c: number): number => Math.round(c + (255 - c) * 0.82);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export const DEFAULT_BANKS = (): Bank[] => [
  { id: 'vac', name: 'Vacation', short: 'VAC', kind: 'vac', unit: 'h', dayHours: 7.5, color: '#1E6FD9', balance: 0, asOf: '', earn: { rule: 'pay', amount: 0 }, grant: { on: false, amount: 0, date: '01-01' }, reset: false },
  { id: 'sick', name: 'Sick', short: 'SICK', kind: 'sick', unit: 'h', dayHours: 7.5, color: '#D9534F', balance: 0, asOf: '', earn: { rule: 'none', amount: 0 }, grant: { on: false, amount: 0, date: '01-01' }, reset: false },
  { id: 'bank', name: 'Banked overtime', short: 'BANK', kind: 'bank', unit: 'h', dayHours: 7.5, color: '#B7791F', balance: 0, asOf: '', earn: { rule: 'none', amount: 0 }, grant: { on: false, amount: 0, date: '01-01' }, reset: false },
  { id: 'lieu', name: 'Lieu', short: 'LIEU', kind: 'lieu', unit: 'd', dayHours: 7.5, color: '#7A4FB5', balance: 0, asOf: '', earn: { rule: 'none', amount: 0 }, grant: { on: false, amount: 0, date: '01-01' }, reset: false }
];

export function normBank(b: RawBank): Bank {
  const rule = b.earn?.rule;
  return {
    id: b.id, name: b.name || 'Bank', short: (b.short || b.name || 'BANK').slice(0, 4).toUpperCase(), kind: b.kind || 'custom',
    unit: b.unit === 'd' ? 'd' : 'h', dayHours: Number(b.dayHours) > 0 ? Number(b.dayHours) : 7.5,
    color: b.color || '#0E7490', balance: Number(b.balance) || 0, asOf: b.asOf || '',
    earn: { rule: (rule === 'pay' || rule === 'month' ? rule : 'none') satisfies EarnRule, amount: Number(b.earn?.amount) || 0 },
    grant: { on: !!b.grant?.on, amount: Number(b.grant?.amount) || 0, date: /^\d{2}-\d{2}$/.test(b.grant?.date ?? '') ? (b.grant?.date as string) : '01-01' },
    reset: !!b.reset
  };
}

/** Older profiles (v1.0) keep vacation and sick as plain numbers. Turn them into banks. */
export function migrateBanks(p: LegacyBankFields | null | undefined): Bank[] {
  if (p && Array.isArray(p.banks) && p.banks.length) return p.banks.map(normBank);
  const b = DEFAULT_BANKS();
  b[0].balance = Number(p?.vacHours) || 0;
  b[0].asOf = p?.vacAsOf || '';
  b[0].earn = { rule: 'pay', amount: Number(p?.accrual) || 0 };
  b[1].balance = Number(p?.sickHours) || 0;
  b[1].asOf = p?.sickAsOf || '';
  b[2].asOf = b[3].asOf = p?.vacAsOf || '';
  return b;
}

export const bankById = (banks: readonly Bank[], id: string): Bank | null => banks.find(b => b.id === id) || null;

// hours -> the bank's own unit
export const toUnit = (bank: Pick<Bank, 'unit' | 'dayHours'>, hours: number): number => (bank.unit === 'd' ? hours / (bank.dayHours || 7.5) : hours);
export const fromUnit = (bank: Pick<Bank, 'unit' | 'dayHours'>, amt: number): number => (bank.unit === 'd' ? amt * (bank.dayHours || 7.5) : amt);
export const unitLabel = (bank: Pick<Bank, 'unit'>): string => (bank.unit === 'd' ? 'd' : 'h');
export function fmtAmt(bank: Pick<Bank, 'unit'>, n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${+v.toFixed(2)} ${unitLabel(bank)}`;
}

/** Which bank(s) a day of leave takes time from. */
export function daySplits(o: DayDoc | null | undefined): DaySplit[] {
  if (!o) return [];
  if (Array.isArray(o.splits) && o.splits.length) return o.splits.map(s => ({ bank: s.bank, h: Number(s.h) || 0 }));
  const bank = o.type === 'VAC' ? 'vac' : o.type === 'SICK' ? 'sick' : o.type === 'LIEU' ? 'lieu' : o.type === 'LEAVE' ? o.bank : null;
  if (!bank) return [];
  const h = Number(o.hours) || 0;
  return [{ bank, h, legacyDay: o.type === 'LIEU' && !(h > 0) }];
}
export const isLeaveDay = (o: DayDoc | null | undefined): boolean => !!o && (o.type === 'VAC' || o.type === 'SICK' || o.type === 'LIEU' || o.type === 'LEAVE');

/** Which day type to save for a booking from this bank */
export const typeForBank = (bank: Pick<Bank, 'id'>): 'VAC' | 'SICK' | 'LIEU' | 'LEAVE' =>
  bank.id === 'vac' ? 'VAC' : bank.id === 'sick' ? 'SICK' : bank.id === 'lieu' ? 'LIEU' : 'LEAVE';

/** The label that shows on the calendar for a leave day */
export function leaveLabel(o: DayDoc, banks: readonly Bank[]): string {
  const s = daySplits(o)[0];
  const b = s && bankById(banks, s.bank);
  return b ? b.short : o.type === 'SICK' ? 'SICK' : o.type === 'LIEU' ? 'LIEU' : 'VAC';
}

function earnDates(bank: Bank, profile: PayScheduleProfile, from: DateStr, to: DateStr): DateStr[] {
  if (from > to) return [];
  const r = bank.earn.rule;
  if (r === 'pay') return E.payDates(profile, from, to);
  const out: DateStr[] = [];
  const a = E.parts(from), b = E.parts(to);
  if (r === 'month') {
    for (let k = a.y * 12 + a.m - 1; k <= b.y * 12 + b.m - 1; k++) {
      const d = E.ymd(Math.floor(k / 12), (k % 12) + 1, 1);
      if (d >= from && d <= to) out.push(d);
    }
  }
  return out;
}
/** The day each year when the whole year's time is added (Feb 29 becomes Feb 28 in other years) */
function grantDates(bank: Bank, from: DateStr, to: DateStr): DateStr[] {
  const [mm, dd] = bank.grant.date.split('-').map(Number), out: DateStr[] = [];
  for (let y = E.parts(from).y; y <= E.parts(to).y; y++) {
    const d = E.ymd(y, mm, Math.min(dd, E.daysInMonth(y, mm)));
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}

const ORDER: Record<LedgerRow['kind'], number> = { reset: 0, earn: 1, credit: 2, use: 3 };

/**
 * Everything that changes one bank, oldest first, with a running balance.
 *   S = { profile, days }.   Returns { rows, opening, today, booked, available }
 *   today     = what you have right now
 *   booked    = time already booked for dates after today
 *   available = today minus booked (the number to plan holidays with)
 */
export function ledger(bank: Bank, S: LedgerInput, todayIso: DateStr, horizonDays = 120): LedgerResult {
  const asOf = bank.asOf || todayIso;
  const end = E.addDays(todayIso, horizonDays);
  const ev: LedgerRow[] = [];
  const push = (e: Omit<LedgerRow, 'run' | 'future'>): void => { ev.push({ ...e, run: 0, future: false }); };
  if (bank.earn.rule !== 'none' && bank.earn.amount > 0) {
    const dates = earnDates(bank, S.profile, E.addDays(asOf, 1), end);
    let futureSeen = 0;
    for (const d of dates) {
      if (d > todayIso) { if (futureSeen >= 1) continue; futureSeen++; }
      push({ date: d, kind: 'earn', amt: bank.earn.amount, title: bank.earn.rule === 'pay' ? 'Pay day' : 'New month', sub: 'Earned' });
    }
  }
  if (bank.grant.on && bank.grant.amount > 0) {
    let nextSeen = 0;
    for (const d of grantDates(bank, E.addDays(asOf, 1), end)) {
      if (d > todayIso) { if (nextSeen >= 1) continue; nextSeen++; }
      if (bank.reset) push({ date: d, kind: 'reset', amt: 0, title: 'Year-end reset', sub: 'Unused time is lost' });
      push({ date: d, kind: 'earn', amt: bank.grant.amount, title: 'Yearly amount added', sub: 'Whole year added at once' });
    }
  }
  for (const [d, o] of Object.entries(S.days || {})) {
    if (d <= asOf) continue;
    for (const sp of daySplits(o)) {
      if (sp.bank !== bank.id) continue;
      const amt = sp.legacyDay ? (bank.unit === 'd' ? 1 : bank.dayHours) : toUnit(bank, sp.h);
      const type: DayType | undefined = o.type;
      push({ date: d, kind: 'use', amt: -amt, title: d > todayIso ? 'Booked' : 'Taken', sub: (o.type === 'SICK' ? 'Sick day' : o.type === 'LIEU' ? 'Lieu day' : 'Time off'), type });
    }
    if (o.toBank === bank.id && Number(o.hours) > 0) push({ date: d, kind: 'credit', amt: toUnit(bank, Number(o.hours)), title: 'Overtime banked', sub: 'Added to this bank' });
    if (bank.kind === 'lieu' && o.lieu) push({ date: d, kind: 'credit', amt: bank.unit === 'd' ? 1 : bank.dayHours, title: 'Lieu day earned', sub: 'Stat holiday worked' });
  }
  // lieu time earned by itself for holiday shifts: [{ bank, date, hours, sub }] worked out by the app
  for (const c of S.autoCredits || []) if (c.bank === bank.id && c.date > asOf && c.date <= end && c.hours > 0) push({ date: c.date, kind: 'credit', amt: toUnit(bank, c.hours), title: 'Lieu day earned', sub: c.sub || 'Holiday worked' });
  ev.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : ORDER[x.kind] - ORDER[y.kind]));
  let run = bank.balance, todayBal = bank.balance, booked = 0;
  const rows: LedgerRow[] = [];
  for (const e of ev) {
    if (e.kind === 'reset') { e.amt = -Math.max(0, run); }
    run += e.amt;
    e.run = run; e.future = e.date > todayIso;
    if (!e.future) todayBal = run;
    if (e.kind === 'use' && e.future) booked += -e.amt;
    rows.push(e);
  }
  return { rows, opening: bank.balance, asOf, today: todayBal, booked, available: todayBal - booked };
}

/** Hours needed from a day of leave (the shift you would have worked) */
export const hoursOff = (info: { baseHours?: number }): number => Number(info.baseHours) || 0;

/** Split a total number of hours across banks. parts = [{bank, h}]. Returns problems, if any. */
export function checkSplit(parts: readonly { bank: string; h: number | string }[], totalHours: number): string {
  const sum = parts.reduce((a, p) => a + (Number(p.h) || 0), 0);
  return Math.abs(sum - totalHours) < 0.01 ? '' : `The parts add up to ${+sum.toFixed(2)} h but ${+totalHours.toFixed(2)} h are needed.`;
}
