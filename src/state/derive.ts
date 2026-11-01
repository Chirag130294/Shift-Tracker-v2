// Derived, read-only views of a profile and its days. Ported from v1.6 core.js, with the global state
// object replaced by explicit arguments so every function here is pure and testable.
import * as B from '../utils/banks';
import * as E from '../utils/engine';
import { BUILT_IN, ensureList, holidaysAny, holidaysFor, type HolidayMap } from '../utils/holidays';
import type { Bank, DateStr, DayDoc, DayMap, LedgerRow, Profile, ScheduleCtx } from '../types';

export interface Leave {
  /** short label drawn in the calendar cell */
  l: string;
  name: string;
  /** soft background colour */
  bg: string;
  bankId?: string;
}

export const LV: Record<'VAC' | 'SICK' | 'LIEU' | 'OFF', Leave> = {
  VAC: { l: 'VAC', name: 'Vacation', bg: '#CFE0F5' },
  SICK: { l: 'SICK', name: 'Sick day', bg: '#F6D9D4' },
  LIEU: { l: 'LIEU', name: 'Lieu day', bg: '#E3D5F5' },
  OFF: { l: 'OFF', name: 'Day off (requested)', bg: '#E3ECE9' }
};

export const isLvType = (t: string | undefined): boolean => t === 'VAC' || t === 'SICK' || t === 'LIEU' || t === 'LEAVE' || t === 'OFF';

export const buildCtx = (profile: Profile, days: DayMap): ScheduleCtx => ({
  shifts: Object.fromEntries(profile.shifts.map(s => [s.id, s])),
  patterns: profile.patterns,
  days
});

// ---------- holidays ----------
const holidayCache: Record<string, HolidayMap> = {};

/** All holidays of one year for the chosen country and region: { 'YYYY-MM-DD': name } */
export function holidayList(profile: Profile, y: number): HolidayMap {
  const { country, region } = profile;
  if (!country) return {};
  if (BUILT_IN.includes(country)) {
    const k = `${y}|${country}|${region}`;
    return holidayCache[k] || (holidayCache[k] = holidaysFor(y, country, region));
  }
  ensureList(country, y);
  return holidaysAny(y, country, region);
}

export function holidayOn(profile: Profile, date: DateStr): string | null {
  const custom = profile.customHolidays.find(x => x.date === date);
  if (custom) return custom.name;
  if (profile.showHolidays === false || !profile.country) return null;
  return holidayList(profile, E.parts(date).y)[date] || null;
}

export interface LieuInfo {
  bank: string;
  hours: number;
  name: string;
  sub: string;
  text: string;
}

/** Lieu time earned by working a holiday (when the switch in Holidays is on) */
export function lieuInfo(profile: Profile, ctx: ScheduleCtx, date: DateStr): LieuInfo | null {
  const L = profile.holidayLieu;
  if (!L || !L.on) return null;
  const name = holidayOn(profile, date);
  if (!name) return null;
  const custom = profile.customHolidays.find(x => x.date === date);
  if (custom && custom.lieu === false) return null;
  const i = E.dayInfo(date, ctx), o: DayDoc = ctx.days[date] || {};
  if (!i.isWorking || o.noLieu || o.lieu) return null;
  const bank = B.bankById(profile.banks, L.bank || 'lieu');
  if (!bank) return null;
  const worked = Number(i.hours) || 0;
  const hours = L.earn === 'hours' ? worked : L.earn === 'x15' ? worked * 1.5 : bank.dayHours;
  const u = B.toUnit(bank, hours);
  return {
    bank: bank.id, hours, name, sub: `${name} worked`,
    text: bank.unit === 'd' ? `+${+u.toFixed(2)} day${Math.abs(u - 1) < 0.005 ? '' : 's'}` : `+${B.fmtAmt(bank, hours)}`
  };
}

export function lieuCredits(profile: Profile, ctx: ScheduleCtx, from: DateStr, to: DateStr): { bank: string; date: DateStr; hours: number; sub: string }[] {
  const L = profile.holidayLieu;
  if (!L || !L.on) return [];
  const dates = new Set<DateStr>();
  for (let y = E.parts(from).y; y <= E.parts(to).y; y++) Object.keys(holidayList(profile, y)).forEach(d => dates.add(d));
  profile.customHolidays.forEach(h => dates.add(h.date));
  const out: { bank: string; date: DateStr; hours: number; sub: string }[] = [];
  for (const d of Array.from(dates).sort()) {
    if (d < from || d > to) continue;
    const li = lieuInfo(profile, ctx, d);
    if (li) out.push({ bank: li.bank, date: d, hours: li.hours, sub: li.sub });
  }
  return out;
}

// ---------- banks ----------
export interface BankStat {
  bank: Bank | null;
  /** what the bank holds today */
  left: number;
  /** time already booked for later days */
  booked: number;
  /** left minus booked: the number to plan holidays with */
  after: number;
  rows: LedgerRow[];
  opening: number;
  asOf: DateStr;
}

/** What a bank holds: today, booked, available to book, and the ledger rows. */
export function bankStat(profile: Profile, days: DayMap, id: string, skipDate?: DateStr | null): BankStat {
  const bank = B.bankById(profile.banks, id);
  if (!bank) return { bank: null, left: 0, booked: 0, after: 0, rows: [], opening: 0, asOf: '' };
  let useDays = days;
  if (skipDate && useDays[skipDate]) { useDays = { ...useDays }; delete useDays[skipDate]; }
  const today = E.todayIso(), L0 = profile.holidayLieu;
  const ctx = buildCtx(profile, useDays);
  const autoCredits = L0 && L0.on && (L0.bank || 'lieu') === bank.id
    ? lieuCredits(profile, ctx, bank.asOf || today, E.addDays(today, 120)).filter(c => c.date !== skipDate)
    : [];
  const L = B.ledger(bank, { profile, days: useDays, autoCredits }, today);
  return { bank, left: L.today, booked: L.booked, after: L.available, rows: L.rows, opening: L.opening, asOf: L.asOf };
}

export function lvOf(banks: readonly Bank[], o: DayDoc | null | undefined): Leave {
  if (!o || o.type === 'OFF') return LV.OFF;
  const s = B.daySplits(o)[0], b = s && B.bankById(banks, s.bank);
  if (b) return { l: b.short, name: b.name, bg: B.softColor(b.color), bankId: b.id };
  if (o.type === 'SICK') return LV.SICK;
  if (o.type === 'LIEU') return LV.LIEU;
  return LV.VAC;
}

/** "Taken from Vacation: 11.5 h" */
export function leaveText(banks: readonly Bank[], o: DayDoc): string {
  const parts = B.daySplits(o).map(sp => {
    const b = B.bankById(banks, sp.bank);
    return b ? `${b.name} ${B.fmtAmt(b, sp.legacyDay ? (b.unit === 'd' ? 1 : b.dayHours) : B.toUnit(b, sp.h))}` : '';
  }).filter(Boolean);
  return parts.length ? `Taken from ${parts.join(' + ')}` : '';
}

export interface LeaveGroup {
  key: string;
  lv: Leave;
  start: DateStr;
  end: DateStr;
  n: number;
  hours: number;
}

/** Runs of leave from the same bank, joined when you have no shifts between them. */
export function leaveGroups(profile: Profile, days: DayMap): LeaveGroup[] {
  const ds = Object.keys(days).filter(d => isLvType(days[d].type) && days[d].type !== 'OFF').sort();
  const out: LeaveGroup[] = [];
  const offBetween = (a: DateStr, b: DateStr): boolean => {
    for (let n = E.dayNum(a) + 1; n < E.dayNum(b); n++) if (E.baseShiftId(E.fromDayNum(n), profile.patterns)) return false;
    return true;
  };
  for (const d of ds) {
    const o = days[d], lv = lvOf(profile.banks, o), h = Number(o.hours) || 0, last = out[out.length - 1];
    if (last && last.key === lv.l && offBetween(last.end, d)) { last.end = d; last.n++; last.hours += h; }
    else out.push({ key: lv.l, lv, start: d, end: d, n: 1, hours: h });
  }
  return out;
}

/** Hours taken from a bank so far this calendar year (up to and including today). */
export function usedThisYear(bank: Bank, days: DayMap): number {
  const today = E.todayIso(), y = String(E.parts(today).y);
  let h = 0;
  for (const [d, o] of Object.entries(days)) {
    if (!d.startsWith(y) || d > today) continue;
    for (const sp of B.daySplits(o)) if (sp.bank === bank.id) h += sp.legacyDay ? (bank.unit === 'd' ? 1 : bank.dayHours) : B.toUnit(bank, sp.h);
  }
  return h;
}
