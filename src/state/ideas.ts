// "Next shift" and "time off ideas" (long weekends), ported from v1.6 core.js. Pure functions.
import * as E from '../utils/engine';
import type { DateStr, DayInfo, ScheduleCtx, Shift } from '../types';

export interface NextShift { date: DateStr; sh: Shift; info: DayInfo }

/** The next shift that has not finished yet (today's counts until it ends). */
export function nextShift(ctx: ScheduleCtx, now: Date = new Date()): NextShift | null {
  const today = E.todayIso();
  for (let n = 0; n < 120; n++) {
    const d = E.addDays(today, n), i = E.dayInfo(d, ctx);
    const sh = i.isWorking ? ctx.shifts[i.work] : undefined;
    if (!sh) continue;
    if (n === 0) {
      const [eh, em] = sh.end.split(':').map(Number);
      const endAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (E.crossesMidnight(sh) ? 1 : 0), eh, em);
      if (now > endAt) continue;
    }
    return { date: d, sh, info: i };
  }
  return null;
}

export interface LongWeekend { start: DateStr; end: DateStr; len: number; names: string[]; booked: number }
export interface Tip { start: DateStr; end: DateStr; len: number; gap: number; hours: number }

export function timeOffIdeas(ctx: ScheduleCtx, holiday: (d: DateStr) => string | null, today: DateStr = E.todayIso()): { lw: LongWeekend | null; tips: Tip[] } {
  const from = E.addDays(today, 1), to = E.addDays(today, 240);
  const runs = E.offRuns(from, to, ctx);
  if (runs.length && runs[0].start === from && !E.dayInfo(today, ctx).isWorking) runs.shift();
  const names = (r: { start: DateStr; end: DateStr }): string[] => {
    const out: string[] = [];
    for (let n = E.dayNum(r.start); n <= E.dayNum(r.end); n++) { const h = holiday(E.fromDayNum(n)); if (h) out.push(h); }
    return out;
  };
  const booked = (r: { start: DateStr; end: DateStr }): number => {
    let c = 0;
    for (let n = E.dayNum(r.start); n <= E.dayNum(r.end); n++) if (['VAC', 'SICK', 'LIEU', 'LEAVE'].includes(E.dayInfo(E.fromDayNum(n), ctx).type)) c++;
    return c;
  };
  const found = runs.find(r => r.len >= 3 && names(r).length) || runs.find(r => r.len >= 4) || null;
  const tips: Tip[] = [];
  for (let i = 0; i + 1 < runs.length && tips.length < 2; i++) {
    const a = runs[i], b = runs[i + 1], gap = E.diffDays(a.end, b.start) - 1;
    if (gap < 1 || gap > 2 || a.len < 2 || b.len < 2 || a.len + gap + b.len < 6) continue;
    let hours = 0;
    for (let n = 1; n <= gap; n++) hours += E.dayInfo(E.addDays(a.end, n), ctx).baseHours;
    tips.push({ start: a.start, end: b.end, len: a.len + gap + b.len, gap, hours });
  }
  return { lw: found && { ...found, names: names(found), booked: booked(found) }, tips };
}
