// Shift Calendar: sharing and shift swaps. Pure logic. No screen code and no Firebase in this file.
//
// Ported from v1.6 share.js. The logic is unchanged; only types were added.
import * as E from './engine';
import type { DateStr, DayDoc, Pattern, ScheduleCtx, Shift } from '../types';

export const SHARE_PAST = 14;     // days before today that colleagues can see
export const SHARE_FUTURE = 240;  // days after today
export const MIN_REST_HOURS = 8;

const hash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** A shift as colleagues see it: no id of yours, just what is needed to compare times. */
export interface ShiftDef {
  code: string;
  name: string;
  start: string;
  end: string;
  brk: number;
  color: string;
}
export type SharedShift = ShiftDef & { id: string };

/** shared/{uid}: the safe copy of someone's shifts. */
export interface SharedView {
  name: string;
  weekStart: number;
  shifts: SharedShift[];
  from: DateStr;
  to: DateStr;
  /** date -> shift id, only for days that person works */
  days: Record<DateStr, string>;
  hash: string;
  /** set by the app when the database refused the read */
  denied?: boolean;
}

interface SharableProfile {
  name?: string;
  weekStart?: number;
  shifts?: readonly Shift[];
  patterns?: readonly Pattern[];
}

/**
 * The copy of your calendar that colleagues are allowed to read.
 * It holds ONLY the shifts you work and the shift types. Vacation, sick, lieu, notes, hours,
 * balances and pay never go in it: a day you are off for any reason is simply not listed.
 */
export function buildSharedView(profile: SharableProfile, days: Record<DateStr, DayDoc> | null | undefined, today: DateStr): SharedView {
  const shifts: Record<string, Shift> = {};
  (profile.shifts || []).forEach(s => { shifts[s.id] = s; });
  const ctx: ScheduleCtx = { shifts, patterns: [...(profile.patterns || [])], days: days || {} };
  const from = E.addDays(today, -SHARE_PAST), to = E.addDays(today, SHARE_FUTURE);
  const out: Record<DateStr, string> = {};
  for (let n = E.dayNum(from); n <= E.dayNum(to); n++) {
    const d = E.fromDayNum(n), i = E.dayInfo(d, ctx);
    if (i.isWorking && shifts[i.work]) out[d] = i.work;
  }
  const defs: SharedShift[] = (profile.shifts || []).map(s => ({ id: s.id, code: s.code, name: s.name, start: s.start, end: s.end, brk: Number(s.brk) || 0, color: s.color }));
  const body = { name: String(profile.name || '').slice(0, 60), weekStart: Number(profile.weekStart) || 0, shifts: defs, from, to, days: out };
  return { ...body, hash: hash(JSON.stringify({ ...body, from: '', to: '' })) };
}

export const shiftDef = (s: Pick<Shift, 'code' | 'name' | 'start' | 'end' | 'brk' | 'color'>): ShiftDef =>
  ({ code: s.code, name: s.name, start: s.start, end: s.end, brk: Number(s.brk) || 0, color: s.color });
type Timed = Pick<Shift, 'start' | 'end' | 'brk'>;
export const sameTimes = (a: Timed, b: Timed): boolean => a.start === b.start && a.end === b.end && (Number(a.brk) || 0) === (Number(b.brk) || 0);
export function matchShift(shifts: readonly Shift[], def: Timed): Shift | null {
  return shifts.find(s => sameTimes(s, def)) || null;
}

export interface RestGap {
  date: DateStr;
  hours: number;
  code: string;
}
/**
 * Gaps (in hours) between a shift and the shifts on the days around it.
 * ctx = { shifts: {id: shift}, patterns, days }. The shift `sh` is tried on `date`.
 */
export function restGaps(ctx: ScheduleCtx, date: DateStr, sh: Pick<Shift, 'start' | 'end' | 'brk' | 'code' | 'name' | 'color'>): RestGap[] {
  const tmpId = '__try';
  const c2: ScheduleCtx = { shifts: { ...ctx.shifts, [tmpId]: { ...sh, id: tmpId } }, patterns: ctx.patterns, days: { ...ctx.days, [date]: { type: 'EXTRA', shiftId: tmpId } } };
  const startAbs = E.dayNum(date) * 1440 + E.timeMin(sh.start);
  const endAbs = E.dayNum(date) * 1440 + E.timeMin(sh.start) + E.shiftMinutes(sh);
  const out: RestGap[] = [];
  const pd = E.addDays(date, -1), pi = E.dayInfo(pd, c2), psh = pi.isWorking && c2.shifts[pi.work];
  if (psh) {
    const pEnd = E.dayNum(pd) * 1440 + E.timeMin(psh.start) + E.shiftMinutes(psh);
    out.push({ date: pd, hours: (startAbs - pEnd) / 60, code: psh.code });
  }
  const nd = E.addDays(date, 1), ni = E.dayInfo(nd, c2), nsh = ni.isWorking && c2.shifts[ni.work];
  if (nsh) {
    const nStart = E.dayNum(nd) * 1440 + E.timeMin(nsh.start);
    out.push({ date: nd, hours: (nStart - endAbs) / 60, code: nsh.code });
  }
  return out;
}
export function restWarnings(ctx: ScheduleCtx, date: DateStr, sh: Pick<Shift, 'start' | 'end' | 'brk' | 'code' | 'name' | 'color'>): string[] {
  return restGaps(ctx, date, sh).filter(g => g.hours < MIN_REST_HOURS).map(g =>
    g.hours < 0 ? `Overlaps your ${g.code} shift on ${g.date}.` : `Only ${+g.hours.toFixed(1)} h of rest next to your ${g.code} shift on ${g.date}.`);
}

export type AvailabilityState = 'free' | 'tight' | 'working' | 'unknown' | 'none';
export interface Availability {
  state: AvailabilityState;
  warns: string[];
  shift?: SharedShift | null;
}
/** Could this colleague take my shift `sh` on `date`? sv = their shared copy. */
export function availability(sv: SharedView | null | undefined, date: DateStr, sh: Pick<Shift, 'start' | 'end' | 'brk' | 'code' | 'name' | 'color'>): Availability {
  if (!sv || sv.denied) return { state: 'none', warns: [] };
  if (!sv.from || date < sv.from || date > sv.to) return { state: 'unknown', warns: [] };
  const shifts: Record<string, Shift> = Object.fromEntries((sv.shifts || []).map(s => [s.id, s]));
  const days: Record<DateStr, DayDoc> = Object.fromEntries(Object.entries(sv.days || {}).map(([d, id]) => [d, { type: 'EXTRA' as const, shiftId: id }]));
  const worked = sv.days && sv.days[date];
  if (worked) return { state: 'working', warns: [], shift: sv.shifts.find(s => s.id === worked) || null };
  const warns = restWarnings({ shifts, patterns: [], days }, date, sh).map(w => w.replace('your ', 'their '));
  return { state: warns.length ? 'tight' : 'free', warns };
}
/** The shifts a colleague works in a date window, to offer in exchange for mine. */
export function theirShifts(sv: SharedView | null | undefined, from: DateStr, to: DateStr, limit = 4): { d: DateStr; def: SharedShift }[] {
  const shifts = new Map((sv?.shifts || []).map(s => [s.id, s] as const));
  const out: { d: DateStr; def: SharedShift }[] = [];
  for (let n = E.dayNum(from); n <= E.dayNum(to) && out.length < limit; n++) {
    const d = E.fromDayNum(n), id = sv?.days?.[d], def = id ? shifts.get(id) : undefined;
    if (id && def && sv && d >= (sv.from || '') && d <= (sv.to || '9999')) out.push({ d, def });
  }
  return out;
}

// ---------------- swap requests ----------------
// A swap document (swaps/{id}):
//   aUid, aName, aDate, aShift{...}   the person who asked: gives aShift on aDate
//   bUid, bName, bDate, bShift{...}   the person asked: gives bShift on bDate
//   status: pending | countered | approved | declined | cancelled
//   turn: uid who has to answer next
//   note, created, updated, applied: { uid: true }, log: [{at, by, act, date?}]
export type SwapStatus = 'pending' | 'countered' | 'approved' | 'declined' | 'cancelled';
export const SWAP_STATUS: Record<SwapStatus, string> = { pending: 'Waiting', countered: 'New date suggested', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };

export interface SwapLogEntry {
  at: number;
  by: string;
  act: string;
  date?: DateStr;
}
export interface Swap {
  aUid: string;
  aName: string;
  aDate: DateStr;
  aShift: ShiftDef;
  bUid: string;
  bName: string;
  bDate: DateStr;
  bShift: ShiftDef;
  status: SwapStatus;
  turn: string;
  note: string;
  created: number;
  updated: number;
  applied: Record<string, boolean>;
  members: [string, string];
  log: SwapLogEntry[];
}
export type SwapWithId = Swap & { id: string };

interface Person {
  uid: string;
  name: string;
}

export function newSwap({ a, b, aDate, aShift, bDate, bShift, note, now }: {
  a: Person; b: Person; aDate: DateStr; aShift: ShiftDef; bDate: DateStr; bShift: ShiftDef; note?: string; now: number;
}): Swap {
  return {
    aUid: a.uid, aName: a.name, aDate, aShift: shiftDef(aShift),
    bUid: b.uid, bName: b.name, bDate, bShift: shiftDef(bShift),
    status: 'pending', turn: b.uid, note: String(note || '').slice(0, 200), created: now, updated: now,
    applied: {}, members: [a.uid, b.uid], log: [{ at: now, by: a.uid, act: 'asked' }]
  };
}
export const isOpen = (s: Pick<Swap, 'status'>): boolean => s.status === 'pending' || s.status === 'countered';
export const otherUid = (s: Pick<Swap, 'aUid' | 'bUid'>, me: string): string => (s.aUid === me ? s.bUid : s.aUid);
export const otherName = (s: Pick<Swap, 'aUid' | 'aName' | 'bName'>, me: string): string => (s.aUid === me ? s.bName : s.aName);
export const myPart = (s: Swap, me: string): { date: DateStr; shift: ShiftDef } => (s.aUid === me ? { date: s.aDate, shift: s.aShift } : { date: s.bDate, shift: s.bShift });
export const theirPart = (s: Swap, me: string): { date: DateStr; shift: ShiftDef } => (s.aUid === me ? { date: s.bDate, shift: s.bShift } : { date: s.aDate, shift: s.aShift });

export type SwapPatch = Partial<Pick<Swap, 'aDate' | 'aShift' | 'bDate' | 'bShift' | 'status' | 'turn' | 'updated' | 'log'>>;

/** Counter-propose: the person answering suggests a different date for THEIR shift. */
export function counterPatch(s: Swap, me: string, newDate: DateStr, newShift: ShiftDef, now: number): SwapPatch {
  const mine: SwapPatch = s.aUid === me ? { aDate: newDate, aShift: shiftDef(newShift) } : { bDate: newDate, bShift: shiftDef(newShift) };
  return { ...mine, status: 'countered', turn: otherUid(s, me), updated: now, log: [...(s.log || []), { at: now, by: me, act: 'countered', date: newDate }].slice(-12) };
}
export const answerPatch = (s: Swap, me: string, status: SwapStatus, now: number): SwapPatch =>
  ({ status, turn: otherUid(s, me), updated: now, log: [...(s.log || []), { at: now, by: me, act: status }].slice(-12) });

/** What an approved swap changes in MY calendar. Returns { writes: {date: override}, newShift: def|null, error }. */
export function planApproved(s: Swap, me: string, ctx: ScheduleCtx): { writes: Record<DateStr, DayDoc>; newShift: SharedShift | null; error: string } {
  const give = myPart(s, me), take = theirPart(s, me);
  const gi = E.dayInfo(give.date, ctx);
  const writes: Record<DateStr, DayDoc> = {};
  if (!gi.base && !gi.isWorking) return { writes, newShift: null, error: `You are not scheduled on ${give.date} any more.` };
  const person = otherName(s, me);
  writes[give.date] = { type: 'SWAP_OUT', shiftId: gi.base || gi.work, hours: gi.baseHours || gi.hours, person };
  const have = matchShift(Object.values(ctx.shifts), take.shift);
  const shiftId = have ? have.id : 'x' + Math.abs(parseInt(hash(take.shift.start + take.shift.end + take.shift.code), 36)).toString(36).slice(0, 8);
  writes[take.date] = { type: 'SWAP_IN', shiftId, hours: E.paidHours(take.shift), person };
  return { writes, newShift: have ? null : { ...take.shift, id: shiftId }, error: '' };
}

/** users/{uid}/notifications/{id} */
export interface Notice {
  type: string;
  from: string;
  fromName: string;
  text: string;
  ref: string;
  at: number;
  read: boolean;
}
export function newNotice({ type, from, fromName, text, ref, now }: { type: string; from: string; fromName?: string; text: string; ref?: string; now: number }): Notice {
  return { type, from, fromName: String(fromName || '').slice(0, 60), text: String(text).slice(0, 200), ref: ref || '', at: now, read: false };
}

export const newCode = (): string => {
  const a = new Uint8Array(15);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
};

export const initials = (n: string | null | undefined): string =>
  String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || '?';
