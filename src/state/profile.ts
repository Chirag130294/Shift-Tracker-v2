// Profile defaults and normalisation (from v1.6 core.js newProfile / normalize).
import * as B from '../utils/banks';
import * as E from '../utils/engine';
import { defaultPay, normPay } from '../utils/pay';
import type { HolidayLieu, Profile, Shift } from '../types';

export const newProfile = (): Profile => ({
  name: '', country: 'CA', region: 'ON', showHolidays: true, customHolidays: [], holidayLieu: { on: false, earn: 'day', bank: 'lieu' },
  shifts: E.DEFAULT_SHIFTS(), patterns: [], weekStart: 0, layout: 'auto',
  payFreq: 'biweekly', payAnchor: '', payWeekend: 'before', pay: defaultPay(),
  banks: B.DEFAULT_BANKS().map(b => ({ ...b, asOf: E.todayIso() })),
  vacYearly: 0, carryLimit: '', deadline: '', reminderMin: 120, onboarded: false
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function normalizeProfile(raw: unknown): Profile {
  const p = isRecord(raw) ? raw : {};
  const n: Profile = { ...newProfile(), ...(p as Partial<Profile>) };
  const shifts: Shift[] = Array.isArray(n.shifts) ? n.shifts : [];
  n.shifts = shifts.length ? shifts : E.DEFAULT_SHIFTS();
  n.patterns = Array.isArray(n.patterns) ? n.patterns : [];
  n.customHolidays = Array.isArray(n.customHolidays) ? n.customHolidays : [];
  n.banks = B.migrateBanks(n);
  const w = Number(n.weekStart);
  n.weekStart = Number.isInteger(w) && w >= 0 && w <= 6 ? w : 0;
  const lieu = isRecord(p.holidayLieu) ? (p.holidayLieu as Partial<HolidayLieu>) : {};
  n.holidayLieu = { on: false, earn: 'day', bank: 'lieu', ...lieu };
  n.pay = normPay(p.pay as Parameters<typeof normPay>[0]);
  return n;
}

/** The region a country starts on when you pick it. */
export const defaultRegion = (cc: string): string => (cc === 'CA' ? 'ON' : cc === 'US' ? 'US' : '');
