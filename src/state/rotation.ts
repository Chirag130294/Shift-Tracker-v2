// The rotation draft and shift-library rules (v1.6 views-rot.js), kept free of screen code so they can be tested.
import * as E from '../utils/engine';
import type { DateStr, Pattern, Shift } from '../types';

export type RotMode = 'week' | 'cycle';
export interface RotDraft {
  mode: RotMode;
  /** shift id per day, '' for off */
  days: string[];
  anchorInput: DateStr;
  /** shift id used by the paint brush, '' paints "off" */
  brush: string;
  id: string;
  isNew: boolean;
  err: string;
  /** the selected row, used by "copy week above" and "clear week" */
  page: number;
  /** the weekday the first column stands for (0 Sunday ... 6 Saturday) */
  ws: number;
}
export type RotTemplate = 'pitman' | '4on4off' | 'copy' | 'above' | 'clearWeek' | 'clear';

export const blankDraft = (ws: number, brush: string): RotDraft =>
  ({ mode: 'week', days: Array<string>(14).fill(''), anchorInput: '', brush, id: '', isNew: false, err: '', page: 0, ws });

export const draftFrom = (p: Pattern, defaultWs: number, brush: string): RotDraft => ({
  mode: p.mode, days: [...p.days], anchorInput: p.anchor, brush, id: p.id, isNew: false, err: '', page: 0,
  ws: p.mode === 'week' ? E.weekday(p.anchor) : defaultWs
});

/** The schedule in force today, or a blank one. */
export function initDraft(patterns: readonly Pattern[], defaultWs: number, brush: string): RotDraft {
  const cur = E.patternFor(E.todayIso(), patterns) || patterns[patterns.length - 1];
  return cur ? draftFrom(cur, defaultWs, brush) : blankDraft(defaultWs, brush);
}

export const alignedAnchor = (r: Pick<RotDraft, 'anchorInput' | 'mode' | 'ws'>): DateStr =>
  (!r.anchorInput ? '' : r.mode === 'week' ? E.alignToWeekStart(r.anchorInput, r.ws) : r.anchorInput);

export function resizeDays(r: RotDraft, n: number): RotDraft {
  const days = r.days.slice(0, n);
  while (days.length < n) days.push('');
  return { ...r, days, page: Math.min(r.page, Math.max(0, Math.ceil(n / 7) - 1)) };
}

export function setMode(r: RotDraft, mode: RotMode): RotDraft {
  if (mode === r.mode) return r;
  const next = mode === 'cycle' ? resizeDays({ ...r, mode }, Math.min(28, r.days.length)) : resizeDays({ ...r, mode }, Math.max(7, Math.ceil(r.days.length / 7) * 7));
  return { ...next, page: 0 };
}

/** Returns the new draft, or `hint` when nothing could be done. */
export function applyTemplate(r: RotDraft, k: RotTemplate, firstShiftId: string): { draft: RotDraft; hint?: string } {
  const on = r.brush || firstShiftId, w = r.page;
  const paint = (flags: number[]): string[] => flags.map(x => (x ? on : ''));
  let days = [...r.days];
  let next: RotDraft = r;
  if (k === 'pitman') next = { ...r, mode: 'cycle', days: paint([1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]), page: 0 };
  else if (k === '4on4off') next = { ...r, mode: 'cycle', days: paint([1, 1, 1, 1, 0, 0, 0, 0]), page: 0 };
  else if (k === 'copy') { const src = days.slice(0, 7); days = days.map((_, i) => src[i % 7]); next = { ...r, days }; }
  else if (k === 'above') {
    if (w <= 0) return { draft: r, hint: 'Tap a week below Week 1 first' };
    for (let i = 0; i < 7; i++) days[w * 7 + i] = days[(w - 1) * 7 + i] ?? '';
    next = { ...r, days };
  } else if (k === 'clearWeek') { for (let i = 0; i < 7; i++) if (w * 7 + i < days.length) days[w * 7 + i] = ''; next = { ...r, days }; }
  else next = { ...r, days: days.map(() => '') };
  return { draft: { ...next, err: '' } };
}

export const validateRot = (r: RotDraft): string =>
  !r.anchorInput ? 'Choose the date your rotation starts.' : !r.days.some(Boolean) ? 'Paint at least one working day.' : '';

/** Folds the draft into the list of schedules. A new schedule starts on its own date; older dates keep the old one. */
export function commitRotation(r: RotDraft, patterns: readonly Pattern[], now: number): { patterns: Pattern[]; id: string } | { error: string } {
  const error = validateRot(r);
  if (error) return { error };
  const anchor = alignedAnchor(r);
  const list = [...patterns];
  const idx = r.id ? list.findIndex(p => p.id === r.id) : -1;
  const pat: Pattern = {
    id: r.id || 'p' + now.toString(36), mode: r.mode, anchor, days: [...r.days],
    effectiveFrom: idx >= 0 ? list[idx].effectiveFrom : (list.length ? anchor : '1900-01-01')
  };
  if (idx >= 0) list[idx] = pat; else list.push(pat);
  list.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  return { patterns: list, id: pat.id };
}

// ---------- shift library ----------
export const SWATCH: readonly string[] = ['#F2B705', '#25327A', '#17785A', '#E0782B', '#6B44A8', '#C0392B', '#0E7490', '#BE185D', '#4D7C0F', '#475569'];
export interface ShiftDraft { id: string; name: string; code: string; start: string; end: string; brk: number | ''; color: string }
export const blankShift = (): ShiftDraft => ({ id: '', name: '', code: '', start: '07:00', end: '15:00', brk: 30, color: '#0E7490' });

export function saveShift(d: ShiftDraft, shifts: readonly Shift[], now: number): { shifts: Shift[] } | { error: string } {
  const code = d.code.trim().toUpperCase();
  if (!d.name.trim()) return { error: 'Give the shift a name.' };
  if (!code) return { error: 'Give the shift a code of 1 to 3 characters.' };
  if (shifts.some(x => x.id !== d.id && x.code.toUpperCase() === code)) return { error: `The code ${code} is already used by another shift.` };
  if (!d.start || !d.end) return { error: 'Choose a start and end time.' };
  const rec: Shift = { id: d.id || 's' + now.toString(36), name: d.name.trim(), code, start: d.start, end: d.end, brk: Math.max(0, Number(d.brk) || 0), color: d.color };
  return { shifts: d.id ? shifts.map(x => (x.id === d.id ? rec : x)) : [...shifts, rec] };
}
export function deleteShift(id: string, shifts: readonly Shift[], patterns: readonly Pattern[]): { shifts: Shift[] } | { error: string } {
  if (patterns.some(p => p.days.includes(id))) return { error: 'This shift is used in your rotation. Remove it from the rotation first.' };
  return { shifts: shifts.filter(x => x.id !== id) };
}
