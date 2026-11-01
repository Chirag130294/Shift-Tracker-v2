// Shift Calendar: gross pay. Pure logic. No screen code and no Firebase in this file.
//
// profile.pay = {
//   rate, cur ('CAD'... or 'custom'), sym (custom symbol),
//   mode '$' | '%'          premiums are dollars per hour, or percent of the base rate
//   periods [{id, name, start, end, prem}]   named parts of the day, for example 07:00-15:00 Morning
//   wk                      extra for every paid hour that counts on a Saturday or Sunday
//   holMult                 1 = nothing extra. 1.5 = hours worked on a stat holiday pay 1.5 x base in total
//   otMult                  overtime multiplier
//   unpaid [{len, u}]       unpaid break (hours) for a shift of this length (hours). No rule: the shift's own break is used
//   leavePay { bankId: % }  share of base pay for a leave day from that bank (sick at 70 percent, for example)
//   dayRule 'start' | 'end' | 'split' | 'most'   which day a shift counts on
//   lag                     days between the last day of a pay period and the pay day (weekly, every 2 weeks, twice a month)
//   semi [d1, d2]           pay days of a twice-a-month pay (31 = last day)
//   mDay, mStart            monthly: pay day of the month, and the day of the month a pay period starts on
// }
// Pay frequency, a known pay date and the weekend rule stay in profile.payFreq, payAnchor and payWeekend.
//
// Ported from v1.6 pay.js. The arithmetic is unchanged; only types were added.
import * as E from './engine';
import * as B from './banks';
import type { Bank, DateStr, DayRule, LineCat, PayFreq, PayPeriodDef, PayScheduleProfile, PaySettings, ScheduleCtx, Shift } from '../types';

export type CurrencyRow = readonly [code: string, symbol: string, name: string];
export const CURRENCIES: readonly CurrencyRow[] = [
  ['CAD', '$', 'Canadian dollar'], ['USD', '$', 'US dollar'], ['AUD', '$', 'Australian dollar'], ['NZD', '$', 'New Zealand dollar'],
  ['GBP', '£', 'British pound'], ['EUR', '€', 'Euro'], ['INR', '₹', 'Indian rupee'], ['PKR', '₨', 'Pakistani rupee'], ['LKR', 'Rs', 'Sri Lankan rupee'],
  ['NPR', 'Rs', 'Nepalese rupee'], ['BDT', '৳', 'Bangladeshi taka'], ['PHP', '₱', 'Philippine peso'], ['SGD', '$', 'Singapore dollar'],
  ['AED', 'AED', 'UAE dirham'], ['SAR', 'SAR', 'Saudi riyal'], ['ZAR', 'R', 'South African rand'], ['NGN', '₦', 'Nigerian naira'],
  ['KES', 'KSh', 'Kenyan shilling'], ['MXN', '$', 'Mexican peso'], ['JPY', '¥', 'Japanese yen'], ['CHF', 'CHF', 'Swiss franc'], ['custom', '?', 'Another symbol']
];

export interface PayTemplate {
  name: string;
  note: string;
  mode: '$' | '%';
  periods: readonly (readonly [name: string, start: string, end: string, prem: number])[];
  unpaid: readonly (readonly [len: number, u: number])[];
  wk: number;
}
export const PAY_TEMPLATES: Record<'hospital' | 'office' | 'plant' | 'blank', PayTemplate> = {
  hospital: { name: 'Hospital 8 and 12 hr', note: 'Morning 7-3, evening 3-11, night 11-7. Unpaid 0.5 h in an 8 h shift and 0.75 h in a 12 h shift.', mode: '$',
    periods: [['Morning', '07:00', '15:00', 0], ['Evening', '15:00', '23:00', 2], ['Night', '23:00', '07:00', 3.5]], unpaid: [[8, 0.5], [12, 0.75]], wk: 2.25 },
  office: { name: 'Office 8.5 hr', note: '8.5 h shifts with 0.5 h unpaid. Evening and night pay extra.', mode: '$',
    periods: [['Day', '06:00', '14:00', 0], ['Evening', '14:00', '22:00', 1.5], ['Night', '22:00', '06:00', 2.5]], unpaid: [[8.5, 0.5]], wk: 0 },
  plant: { name: 'Plant 12 hr', note: 'Day and night only. Premiums in percent of base pay.', mode: '%',
    periods: [['Day', '06:00', '18:00', 0], ['Night', '18:00', '06:00', 8]], unpaid: [[12, 0.5]], wk: 10 },
  blank: { name: 'Start blank', note: 'No premiums and no unpaid breaks. Fill in what applies to you.', mode: '$',
    periods: [['Day', '07:00', '19:00', 0], ['Night', '19:00', '07:00', 0]], unpaid: [], wk: 0 }
};

export const DAY_RULES: readonly (readonly [DayRule, string, string])[] = [
  ['start', 'Day it starts', 'A night shift that starts Friday 11 pm is a Friday shift, all of it.'],
  ['end', 'Day it ends', 'The same shift is a Saturday shift, because it finishes on Saturday.'],
  ['split', 'Split at midnight', 'Hours before midnight count on Friday, hours after count on Saturday.'],
  ['most', 'Day with most hours', 'The whole shift counts on the day that holds most of its paid hours.']
];

let pid = 0;
const mkPeriod = (name: string, start: string, end: string, prem: number): PayPeriodDef =>
  ({ id: 'p' + Date.now().toString(36) + (pid++), name, start, end, prem });
export const newPeriod = (): PayPeriodDef => mkPeriod('New period', '00:00', '06:00', 0);

export const defaultPay = (): PaySettings => ({
  rate: 0, cur: 'CAD', sym: '', mode: '$',
  periods: [mkPeriod('Morning', '07:00', '15:00', 0), mkPeriod('Evening', '15:00', '23:00', 0), mkPeriod('Night', '23:00', '07:00', 0)],
  wk: 0, holMult: 1, otMult: 1.5, unpaid: [], leavePay: { vac: 100, sick: 100, bank: 100, lieu: 100 },
  dayRule: 'start', lag: null, semi: [15, 31], mDay: 0, mStart: 1
});

/** Pay settings as they can arrive from storage: anything may be missing or the wrong type. */
export interface RawPay {
  rate?: unknown; cur?: unknown; sym?: unknown; mode?: unknown; wk?: unknown; holMult?: unknown; otMult?: unknown;
  dayRule?: unknown; lag?: unknown; semi?: unknown; mDay?: unknown; mStart?: unknown;
  periods?: unknown; unpaid?: unknown; leavePay?: unknown;
}

const num = (v: unknown, d = 0): number => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

export function normPay(x?: RawPay | null): PaySettings {
  const d = defaultPay(), src = x || {};
  const n: PaySettings = { ...d };
  n.rate = num(src.rate); n.wk = num(src.wk); n.holMult = Math.max(1, num(src.holMult, 1)); n.otMult = Math.max(1, num(src.otMult, 1.5));
  n.mode = src.mode === '%' ? '%' : '$';
  n.cur = CURRENCIES.some(c => c[0] === src.cur) ? (src.cur as string) : 'CAD';
  n.sym = typeof src.sym === 'string' ? src.sym : d.sym;
  n.leavePay = { ...d.leavePay };
  for (const [k, v] of Object.entries({ ...d.leavePay, ...rec(src.leavePay) })) n.leavePay[k] = Math.min(300, num(v, 100));
  n.periods = Array.isArray(src.periods) && src.periods.length
    ? (src.periods as Record<string, unknown>[]).map((q, i) => ({
      id: (q.id as string) || 'p' + i, name: (q.name as string) || 'Period', start: (q.start as string) || '00:00', end: (q.end as string) || '00:00', prem: num(q.prem)
    }))
    : d.periods;
  n.unpaid = Array.isArray(src.unpaid) ? (src.unpaid as Record<string, unknown>[]).map(u => ({ len: num(u.len), u: num(u.u) })).filter(u => u.len > 0) : [];
  n.dayRule = DAY_RULES.some(r => r[0] === src.dayRule) ? (src.dayRule as DayRule) : 'start';
  n.lag = src.lag === null || src.lag === '' || src.lag === undefined ? null : Math.min(60, Math.round(num(src.lag)));
  n.semi = Array.isArray(src.semi) && src.semi.length === 2 ? src.semi.map(v => Math.min(31, Math.max(1, Math.round(num(v, 15))))) : d.semi;
  n.mDay = Math.min(31, Math.round(num(src.mDay))); n.mStart = Math.min(28, Math.max(1, Math.round(num(src.mStart, 1))));
  return n;
}

/** The slice of a profile the pay maths read. */
export interface PayProfile extends PayScheduleProfile {
  pay?: RawPay | PaySettings | null;
  banks?: readonly Bank[];
}

export const payOf = (p: PayProfile | null | undefined): PaySettings => normPay((p && p.pay) as RawPay | null | undefined);
export const hasRate = (p: PayProfile | null | undefined): boolean => payOf(p).rate > 0;

// ---------- money ----------
const nfs: Record<string, Intl.NumberFormat> = {};
export const currencySymbol = (p: PayProfile | null | undefined): string => {
  const x = payOf(p);
  return x.cur === 'custom' ? (x.sym || '¤') : (CURRENCIES.find(c => c[0] === x.cur) || [0, '$'])[1];
};
export function money(p: PayProfile | null | undefined, n: number): string {
  const x = payOf(p), v = Math.round((Number(n) || 0) * 100) / 100;
  if (x.cur === 'custom') return (v < 0 ? '-' : '') + (x.sym || '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  try {
    const nf = nfs[x.cur] || (nfs[x.cur] = new Intl.NumberFormat(x.cur === 'INR' ? 'en-IN' : 'en', { style: 'currency', currency: x.cur, currencyDisplay: 'narrowSymbol' }));
    return nf.format(v);
  } catch {
    return currencySymbol(p) + v.toFixed(2);
  }
}

// ---------- shift pay ----------
export interface PayLine {
  cat: LineCat;
  label: string;
  h: number;
  r: number;
  amt: number;
}
export interface ShiftPart {
  date: DateStr;
  paid: number;
  lines: PayLine[];
  total: number;
}
export interface ShiftPay {
  len: number;
  unpaid: number;
  paid: number;
  parts: ShiftPart[];
  lines: PayLine[];
  total: number;
}
interface Accum {
  paid: number;
  per: Record<string, number>;
  wk: boolean;
}
type ShiftLike = Pick<Shift, 'start' | 'end' | 'brk'>;

const periodAt = (x: PaySettings, m: number): PayPeriodDef | undefined => x.periods.find(q => {
  const s = E.timeMin(q.start), e = E.timeMin(q.end);
  return s === e ? true : s < e ? m >= s && m < e : m >= s || m < e;
});
const rateOf = (x: PaySettings, v: number): number => (x.mode === '%' ? x.rate * v / 100 : v);
export function breakMinutes(sh: ShiftLike, x: PaySettings): number {
  const len = E.shiftMinutes(sh) / 60, r = x.unpaid.find(u => Math.abs(u.len - len) < 0.01);
  return r ? Math.round(r.u * 60) : Math.max(0, Number(sh.brk) || 0);
}
const r2 = (n: number): number => Math.round(n * 100) / 100;
function linesFor(x: PaySettings, a: Accum, holiday: boolean): PayLine[] {
  const h = a.paid / 60, lines: PayLine[] = [{ cat: 'base', label: 'Base pay', h, r: x.rate, amt: h * x.rate }];
  for (const q of x.periods) {
    const m = a.per[q.id] || 0, r = rateOf(x, q.prem);
    if (m && r > 0) lines.push({ cat: 'prem', label: q.name + ' premium', h: m / 60, r, amt: m / 60 * r });
  }
  if (a.wk && x.wk > 0) lines.push({ cat: 'wk', label: 'Weekend premium', h, r: rateOf(x, x.wk), amt: h * rateOf(x, x.wk) });
  if (holiday && x.holMult > 1) lines.push({ cat: 'hol', label: `Stat holiday (${+x.holMult.toFixed(2)} x)`, h, r: (x.holMult - 1) * x.rate, amt: h * (x.holMult - 1) * x.rate });
  return lines;
}
/** One shift worked on `date`. Returns the parts, one for each calendar date the shift counts on. */
export function calcShift(sh: ShiftLike, date: DateStr, p: PayProfile, isHol: (d: DateStr) => boolean = () => false): ShiftPay {
  const x = payOf(p), s = E.timeMin(sh.start), len = E.shiftMinutes(sh), brk = breakMinutes(sh, x), mid = len / 2;
  const lastIdx = Math.floor((s + len - 1) / 1440), rule = x.dayRule;
  const kept = (i: number): boolean => !(brk && i >= mid - brk / 2 && i < mid + brk / 2);
  let fixed = 0;
  if (rule === 'end') fixed = lastIdx;
  else if (rule === 'most') {
    const c: Record<number, number> = {};
    for (let i = 0; i < len; i++) if (kept(i)) { const k = Math.floor((s + i) / 1440); c[k] = (c[k] || 0) + 1; }
    fixed = Object.keys(c).map(Number).sort((a, b) => c[b] - c[a] || a - b)[0] || 0;
  }
  const acc: Record<number, Accum> = {};
  for (let i = 0; i < len; i++) {
    if (!kept(i)) continue;
    const abs = s + i, di = rule === 'split' ? Math.floor(abs / 1440) : fixed;
    const a = acc[di] || (acc[di] = { paid: 0, per: {}, wk: false });
    a.paid++;
    const q = periodAt(x, abs % 1440);
    if (q) a.per[q.id] = (a.per[q.id] || 0) + 1;
  }
  const parts: ShiftPart[] = Object.keys(acc).map(Number).sort((a, b) => a - b).map(di => {
    const d = E.addDays(date, di), w = E.weekday(d), a = acc[di];
    a.wk = w === 0 || w === 6;
    const lines = linesFor(x, a, isHol(d));
    return { date: d, paid: a.paid / 60, lines, total: lines.reduce((t, l) => t + l.amt, 0) };
  });
  const lines: PayLine[] = [];
  for (const pt of parts) for (const l of pt.lines) {
    const f = lines.find(y => y.label === l.label);
    if (f) { f.h += l.h; f.amt += l.amt; } else lines.push({ ...l });
  }
  return { len: len / 60, unpaid: brk / 60, paid: parts.reduce((t, y) => t + y.paid, 0), parts, lines, total: parts.reduce((t, y) => t + y.total, 0) };
}

// ---------- pay periods ----------
export const lagOf = (p: PayProfile): number => {
  const x = payOf(p);
  return x.lag !== null ? x.lag : (p.payFreq === 'weekly' || p.payFreq === 'biweekly' ? 6 : 0);
};
export interface PayPeriod {
  start: DateStr;
  end: DateStr;
  pay: DateStr;
}
const overlaps = (q: { start: DateStr; end: DateStr }, from: DateStr, to: DateStr): boolean => q.start <= to && q.end >= from;
/** Pay periods that touch from..to. */
export function payPeriods(p: PayProfile | null | undefined, from: DateStr, to: DateStr): PayPeriod[] {
  if (!p || !p.payFreq || from > to) return [];
  const f: PayFreq = p.payFreq, x = payOf(p), L = lagOf(p), out: PayPeriod[] = [];
  if (f === 'weekly' || f === 'biweekly') {
    const len = f === 'weekly' ? 7 : 14;
    for (const P of E.payDates(p, E.addDays(from, L), E.addDays(to, L + len))) out.push({ start: E.addDays(P, -L - len + 1), end: E.addDays(P, -L), pay: P });
  } else if (f === 'semimonthly') {
    // Period limits use the calendar date of each pay day. Only the pay day itself moves off a weekend.
    const ds = E.payDates({ ...p, payWeekend: 'none' }, E.addDays(from, -45 + L), E.addDays(to, 45 + L));
    for (let i = 1; i < ds.length; i++) out.push({ start: E.addDays(ds[i - 1], -L + 1), end: E.addDays(ds[i], -L), pay: E.adjustWeekend(ds[i], p.payWeekend || 'before') });
  } else if (f === 'monthly') {
    const a = E.parts(from), b = E.parts(to), S0 = x.mStart, D = E.monthlyPayDay(p), mode = p.payWeekend || 'before';
    if (!p.payAnchor && !x.mDay) return [];
    const startOf = (k: number): DateStr => { const y = Math.floor(k / 12), m = (k % 12) + 1; return E.ymd(y, m, Math.min(S0, E.daysInMonth(y, m))); };
    for (let k = a.y * 12 + (a.m - 1) - 2; k <= b.y * 12 + (b.m - 1) + 1; k++) {
      const start = startOf(k), end = E.addDays(startOf(k + 1), -1);
      let j = E.parts(end).y * 12 + (E.parts(end).m - 1), nominal = '';
      for (let t = 0; t < 3; t++, j++) {
        const y = Math.floor(j / 12), m = (j % 12) + 1;
        nominal = E.ymd(y, m, Math.min(D, E.daysInMonth(y, m)));
        if (nominal >= end) break;
      }
      out.push({ start, end, pay: E.adjustWeekend(nominal, mode) });
    }
  }
  return out.filter(q => overlaps(q, from, to)).sort((m, n) => (m.start < n.start ? -1 : 1));
}
export const periodFor = (p: PayProfile | null | undefined, date: DateStr): PayPeriod | null => payPeriods(p, date, date)[0] || null;
export const periodForPayDay = (p: PayProfile | null | undefined, pay: DateStr): PayPeriod | null =>
  payPeriods(p, E.addDays(pay, -90), E.addDays(pay, 5)).find(q => q.pay === pay) || null;

// ---------- a whole pay period ----------
export interface PeriodItem {
  kind: 'shift' | 'ot' | 'leave';
  date: DateStr;
  src: DateStr;
  code: string;
  color: string;
  title: string;
  paid: number;
  lines: PayLine[];
  total: number;
  start?: string;
  end?: string;
  part?: boolean;
  len?: number;
  unpaid?: number;
  banked?: boolean;
  hoursShown?: number;
  pct?: number;
}
export type PeriodTotals = Record<LineCat | 'total' | 'hours' | 'earned', number>;

/** C = { shifts, patterns, days } like the calendar uses. isHol(date) tells if a date is a stat holiday. */
export function computePeriod(
  p: PayProfile, per: { start: DateStr; end: DateStr }, C: ScheduleCtx, isHol: (d: DateStr) => boolean = () => false, today: DateStr = E.todayIso()
): { items: PeriodItem[]; totals: PeriodTotals } {
  const x = payOf(p), items: PeriodItem[] = [];
  const banks = p.banks || [];
  const inR = (d: DateStr): boolean => d >= per.start && d <= per.end;
  const bankName = (id: string): string => banks.find(b => b.id === id)?.name || 'Leave';
  for (let d = E.addDays(per.start, -1); d <= E.addDays(per.end, 1); d = E.addDays(d, 1)) {
    const i = E.dayInfo(d, C), o = i.override || {};
    if (i.isWorking && C.shifts[i.work]) {
      const sh = C.shifts[i.work], r = calcShift(sh, d, p, isHol);
      for (const pt of r.parts) if (inR(pt.date)) items.push({ kind: 'shift', date: pt.date, src: d, start: sh.start, end: sh.end, code: sh.code, color: sh.color, title: sh.name, paid: pt.paid, lines: pt.lines, total: pt.total, part: r.parts.length > 1, len: r.len, unpaid: r.unpaid });
    }
    if (!inR(d)) continue;
    if (o.type === 'OT' && Number(o.hours) > 0) {
      const h = Number(o.hours), banked = !!(o.toBank && banks.some(b => b.id === o.toBank));
      const amt = banked ? 0 : h * x.rate * x.otMult;
      items.push({ kind: 'ot', date: d, src: d, code: 'OT', color: '#8A3FA8', title: banked ? `Overtime banked in ${bankName(o.toBank as string)}` : 'Overtime', paid: banked ? 0 : h, banked, lines: banked ? [] : [{ cat: 'ot', label: `Overtime ${+x.otMult.toFixed(2)} x`, h, r: x.rate * x.otMult, amt }], total: amt, hoursShown: h });
    }
    if (B.isLeaveDay(o)) {
      for (const sp of B.daySplits(o)) {
        const h = sp.legacyDay ? i.baseHours : sp.h, pct = x.leavePay[sp.bank] !== undefined ? x.leavePay[sp.bank] : 100, amt = h * x.rate * pct / 100;
        const bank = banks.find(b => b.id === sp.bank);
        if (h > 0) items.push({ kind: 'leave', date: d, src: d, code: bank?.short || 'OFF', color: bank?.color || '#475569', title: bankName(sp.bank), paid: h, lines: [{ cat: 'leave', label: `${bankName(sp.bank)} at ${pct}% of base`, h, r: x.rate * pct / 100, amt }], total: amt, pct });
      }
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.src < b.src ? -1 : a.src > b.src ? 1 : 0));
  const t: PeriodTotals = { base: 0, prem: 0, wk: 0, hol: 0, ot: 0, leave: 0, total: 0, hours: 0, earned: 0 };
  for (const it of items) {
    for (const l of it.lines) t[l.cat] += l.amt;
    t.total += it.total; t.hours += it.paid;
    if (it.date <= today) t.earned += it.total;
  }
  for (const k of Object.keys(t) as (keyof PeriodTotals)[]) t[k] = r2(t[k]);
  return { items, totals: t };
}
