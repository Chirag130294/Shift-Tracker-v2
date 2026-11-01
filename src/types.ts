// Shared domain types. Day and profile shapes mirror what firestore.rules accepts, so a value
// that type-checks here is a value the database will take.

/** Calendar date as "YYYY-MM-DD". Plain strings, never Date objects, so DST cannot move a shift. */
export type DateStr = string;

export interface Shift {
  id: string;
  code: string;
  name: string;
  /** "HH:MM", 24-hour */
  start: string;
  end: string;
  /** unpaid break, minutes */
  brk: number;
  color: string;
}

export interface Pattern {
  id: string;
  mode: 'week' | 'cycle';
  anchor: DateStr;
  effectiveFrom: DateStr;
  /** shift id per day, '' for a day off. days[0] falls on `anchor`. */
  days: string[];
}

export type LeaveType = 'VAC' | 'SICK' | 'LIEU' | 'LEAVE';
export type DayType = LeaveType | 'OFF' | 'SWAP_OUT' | 'SWAP_IN' | 'EXTRA' | 'OT';

export interface BankSplit {
  bank: string;
  h: number;
}

/**
 * users/{uid}/days/{date}. The key list is exactly the `hasOnly` list in firestore.rules.
 * Anything not listed here is rejected by the database, so it is not representable here either.
 */
export interface DayDoc {
  type?: DayType;
  shiftId?: string;
  hours?: number;
  person?: string;
  note?: string;
  lieu?: boolean;
  noLieu?: boolean;
  bank?: string;
  splits?: BankSplit[];
  toBank?: string;
}
export const DAY_KEYS = ['type', 'shiftId', 'hours', 'person', 'note', 'lieu', 'noLieu', 'bank', 'splits', 'toBank'] as const satisfies readonly (keyof DayDoc)[];
export const DAY_TYPES: readonly DayType[] = ['VAC', 'SICK', 'LIEU', 'LEAVE', 'OFF', 'SWAP_OUT', 'SWAP_IN', 'EXTRA', 'OT'];

export type DayMap = Record<DateStr, DayDoc>;

export interface ScheduleCtx {
  shifts: Record<string, Shift>;
  patterns: Pattern[];
  days: DayMap;
}

export interface DayInfo {
  date: DateStr;
  base: string;
  type: DayType | '';
  work: string;
  hours: number;
  baseHours: number;
  override: DayDoc | null;
  isWorking: boolean;
}

export type PayFreq = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type PayWeekend = 'before' | 'after' | 'none';

/** The slice of a profile the schedule and ledger maths read. */
export interface PayScheduleProfile {
  payFreq?: PayFreq | '';
  payAnchor?: DateStr;
  payWeekend?: PayWeekend;
  pay?: { mDay?: unknown; semi?: unknown } | null;
}

export type BankUnit = 'h' | 'd';
export type EarnRule = 'none' | 'pay' | 'month';

export interface Bank {
  id: string;
  name: string;
  short: string;
  kind: string;
  unit: BankUnit;
  dayHours: number;
  color: string;
  balance: number;
  asOf: DateStr;
  earn: { rule: EarnRule; amount: number };
  grant: { on: boolean; amount: number; date: string };
  reset: boolean;
}

/** A bank as it can arrive from storage: any field may be missing or a string. */
export interface RawBank {
  id: string;
  name?: string;
  short?: string;
  kind?: string;
  unit?: string;
  dayHours?: number | string;
  color?: string;
  balance?: number | string;
  asOf?: string;
  earn?: { rule?: string; amount?: number | string };
  grant?: { on?: boolean; amount?: number | string; date?: string };
  reset?: boolean;
}

export interface LegacyBankFields {
  banks?: RawBank[];
  vacHours?: number | string;
  vacAsOf?: string;
  accrual?: number | string;
  sickHours?: number | string;
  sickAsOf?: string;
}

export interface DaySplit {
  bank: string;
  h: number;
  legacyDay?: boolean;
}

export type LedgerKind = 'reset' | 'earn' | 'credit' | 'use';

export interface LedgerRow {
  date: DateStr;
  kind: LedgerKind;
  amt: number;
  title: string;
  sub: string;
  type?: DayType;
  run: number;
  future: boolean;
}

export interface AutoCredit {
  bank: string;
  date: DateStr;
  hours: number;
  sub?: string;
}

export interface LedgerInput {
  profile: PayScheduleProfile;
  days: DayMap;
  autoCredits?: AutoCredit[];
}

export interface LedgerResult {
  rows: LedgerRow[];
  opening: number;
  asOf: DateStr;
  today: number;
  booked: number;
  available: number;
}

export interface CustomHoliday {
  date: DateStr;
  name: string;
  lieu?: boolean;
}

export interface HolidayLieu {
  on: boolean;
  earn: 'day' | 'hours' | 'x15';
  bank: string;
}

export type PayMode = '$' | '%';
export type DayRule = 'start' | 'end' | 'split' | 'most';
export type LineCat = 'base' | 'prem' | 'wk' | 'hol' | 'ot' | 'leave';

export interface PayPeriodDef {
  id: string;
  name: string;
  start: string;
  end: string;
  prem: number;
}

export interface UnpaidRule {
  /** shift length, hours */
  len: number;
  /** unpaid break, hours */
  u: number;
}

/** profile.pay. Every field is normalised by normPay, so readers can trust the shape. */
export interface PaySettings {
  rate: number;
  cur: string;
  sym: string;
  mode: PayMode;
  periods: PayPeriodDef[];
  wk: number;
  holMult: number;
  otMult: number;
  unpaid: UnpaidRule[];
  leavePay: Record<string, number>;
  dayRule: DayRule;
  lag: number | null;
  semi: number[];
  mDay: number;
  mStart: number;
}

/**
 * users/{uid}. Only the fields this build reads are typed. Profile writes are always partial merges
 * (see Backend.saveProfile), so fields owned by other devices or older versions are never overwritten.
 */
export interface Profile extends PayScheduleProfile, LegacyBankFields {
  name: string;
  country: string;
  region: string;
  showHolidays: boolean;
  customHolidays: CustomHoliday[];
  holidayLieu: HolidayLieu;
  shifts: Shift[];
  patterns: Pattern[];
  weekStart: number;
  layout: string;
  banks: Bank[];
  pay: PaySettings;
  vacYearly: number;
  carryLimit: number | '';
  deadline: string;
  reminderMin: number;
  onboarded: boolean;
}

export interface AuthUser {
  uid: string;
  email: string;
  name: string;
}
