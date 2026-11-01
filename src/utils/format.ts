// Display formatting helpers (from v1.6 core.js). Pure string functions over "YYYY-MM-DD" dates.
import * as E from './engine';
import type { DateStr, Shift } from '../types';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const fmtMD = (s: DateStr): string => `${MON[E.parts(s).m - 1]} ${E.parts(s).d}`;
export const fmtD = (s: DateStr): string => `${DOWS[E.weekday(s)]}, ${fmtMD(s)}`;
export const fmtDY = (s: DateStr): string => `${fmtD(s)}, ${E.parts(s).y}`;
export const fmtH = (h: number): string => `${+(Number(h) || 0).toFixed(2)} h`;
export const shortT = (t: string): string => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}${m ? ':' + E.pad(m) : ''}${h >= 12 ? 'p' : 'a'}`;
};
export const timeRange = (sh: Pick<Shift, 'start' | 'end'>): string => `${shortT(sh.start)}-${shortT(sh.end)}`;
export const range = (a: DateStr, b: DateStr): string =>
  (E.parts(a).m === E.parts(b).m ? `${fmtMD(a)} to ${E.parts(b).d}` : `${fmtMD(a)} to ${fmtMD(b)}`);
export const dowFrom = (ws: number, k: number): string => DOWS[(ws + k) % 7];

export function shiftTimes(sh: Pick<Shift, 'start' | 'end'>, date: DateStr): string {
  if (!E.crossesMidnight(sh)) return `${sh.start} to ${sh.end}`;
  return `${DOWS[E.weekday(date)]} ${sh.start} to ${DOWS[(E.weekday(date) + 1) % 7]} ${sh.end}`;
}
