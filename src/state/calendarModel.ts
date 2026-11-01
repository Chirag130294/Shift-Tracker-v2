// Turns one month of schedule data into plain cell objects. No React in here, so it can be tested alone.
// Mirrors the cell logic of v1.6 views-cal.js.
import * as E from '../utils/engine';
import { DOWL, MONTHS, shortT, timeRange } from '../utils/format';
import { inkFor } from '../utils/color';
import { isLvType, lvOf } from './derive';
import type { DateStr, DayType, Profile, ScheduleCtx } from '../types';

export interface CellBadge {
  label: string;
  /** background, foreground */
  bg: string;
  fg: string;
  /** dashed outline: picked-up, extra or given-away shifts */
  dashed: boolean;
  faded: boolean;
}

export interface Cell {
  date: DateStr;
  day: number;
  isToday: boolean;
  badge: CellBadge | null;
  /** small line under the badge: hours of a shift, "booked", "ends 7a" */
  caption: string;
  holiday: string | null;
  isPayDay: boolean;
  nightShift: boolean;
  swapMarker: boolean;
  overtime: boolean;
  /** colour of the previous night's shift when it ends on this morning */
  continuation: string | null;
  type: DayType | '';
  aria: string;
}

export interface MonthModel {
  /** weeks of 7; null pads the days outside the month */
  weeks: (Cell | null)[][];
  weekdayLabels: string[];
}

export function buildMonth(
  profile: Profile,
  ctx: ScheduleCtx,
  holiday: (date: DateStr) => string | null,
  y: number,
  m: number,
  today: DateStr
): MonthModel {
  const ws = profile.weekStart;
  const first = E.ymd(y, m, 1), dim = E.daysInMonth(y, m), lead = E.weekOffset(first, ws);
  const pays = new Set(E.payDates(profile, first, E.ymd(y, m, dim)));
  const flat: (Cell | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= dim; d++) {
    const date = E.ymd(y, m, d), i = E.dayInfo(date, ctx), t = i.type;
    const prev = E.dayInfo(E.addDays(date, -1), ctx);
    const prevShift = prev.isWorking ? ctx.shifts[prev.work] : undefined;
    const cont = !!prevShift && E.crossesMidnight(prevShift);
    const work = ctx.shifts[i.work];
    let badge: CellBadge | null = null;
    let caption = '';
    let aria = 'day off';
    if (isLvType(t)) {
      const lv = lvOf(profile.banks, i.override);
      badge = { label: lv.l, bg: lv.bg, fg: '#14302B', dashed: false, faded: false };
      aria = lv.name;
      if (t !== 'OFF') caption = date > today ? 'booked' : `-${+(Number(i.override?.hours) || 0)}h`;
    } else if (t === 'SWAP_OUT') {
      const b = ctx.shifts[i.base];
      badge = b ? { label: b.code, bg: b.color, fg: inkFor(b.color), dashed: true, faded: true } : { label: '-', bg: 'transparent', fg: 'inherit', dashed: true, faded: true };
      aria = 'shift given away';
    } else if (work) {
      badge = { label: work.code, bg: work.color, fg: inkFor(work.color), dashed: t === 'SWAP_IN' || t === 'EXTRA', faded: false };
      caption = timeRange(work);
      aria = `${work.name} shift${t === 'SWAP_IN' ? ', picked up' : t === 'EXTRA' ? ', extra shift' : ''}`;
    }
    if (!caption && cont && prevShift) caption = `ends ${shortT(prevShift.end)}`;
    const hn = holiday(date);
    const isPayDay = pays.has(date);
    const weekdayName = DOWL[E.weekday(date)];
    flat.push({
      date, day: d, isToday: date === today, badge, caption, holiday: hn, isPayDay,
      nightShift: !!work && E.crossesMidnight(work),
      swapMarker: t === 'SWAP_OUT' || t === 'SWAP_IN' || t === 'EXTRA',
      overtime: t === 'OT',
      continuation: cont && prevShift ? prevShift.color : null,
      type: t,
      aria: `${weekdayName} ${MONTHS[m - 1]} ${d}, ${aria}${hn ? ', ' + hn : ''}${isPayDay ? ', pay day' : ''}${cont ? ', previous night shift ends this morning' : ''}`
    });
  }
  while (flat.length % 7 !== 0) flat.push(null);
  const weeks: (Cell | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) weeks.push(flat.slice(i, i + 7));
  return { weeks, weekdayLabels: Array.from({ length: 7 }, (_, k) => DOWL[(ws + k) % 7]) };
}
