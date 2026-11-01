// Calendar export (.ics) without any screen code. Ported from v1.6 views-settings.js.
// Each event keeps a stable id, so importing the file again updates events instead of duplicating them.
import * as E from './engine';
import { fmtH } from './format';
import type { ExportRecord } from '../services/StorageService';
import type { DateStr, DayInfo, Shift } from '../types';

export interface ExportEvent {
  d: DateStr;
  kind: 'shift' | 'leave' | 'hol' | 'pay';
  summary: string;
  desc: string;
  start?: string;
  end?: string;
  endDate?: DateStr;
  /** changes whenever anything the person would notice changes */
  sig: string;
}
export interface ExportSource {
  today: DateStr;
  from: DateStr;
  to: DateStr;
  leave: boolean;
  hol: boolean;
  pay: boolean;
  info: (d: DateStr) => DayInfo;
  shift: (id: string) => Shift | undefined;
  leaveName: (d: DateStr) => string;
  holiday: (d: DateStr) => string | null;
  payDays: readonly DateStr[];
}

const LEAVE_TYPES: readonly string[] = ['VAC', 'SICK', 'LIEU', 'LEAVE'];

export function collectEvents(s: ExportSource): Record<string, ExportEvent> {
  const out: Record<string, ExportEvent> = {};
  const pays = new Set(s.pay ? s.payDays : []);
  const limit = Math.min(E.dayNum(s.to), E.dayNum(s.from) + 366);
  for (let n = E.dayNum(s.from); n <= limit; n++) {
    const d = E.fromDayNum(n), i = s.info(d), sh = i.isWorking ? s.shift(i.work) : undefined;
    if (sh) {
      out[`${d}-shift`] = {
        d, kind: 'shift', summary: `${sh.code} shift`, desc: `${sh.name}, ${fmtH(i.hours)} paid`, start: sh.start, end: sh.end,
        endDate: E.crossesMidnight(sh) ? E.addDays(d, 1) : d, sig: `${sh.code}|${sh.start}|${sh.end}|${i.hours}`
      };
    } else if (s.leave && LEAVE_TYPES.includes(i.type)) {
      const name = s.leaveName(d);
      out[`${d}-leave`] = { d, kind: 'leave', summary: name, desc: '', sig: name };
    }
    if (s.hol) { const hn = s.holiday(d); if (hn) out[`${d}-hol`] = { d, kind: 'hol', summary: hn, desc: 'Statutory holiday', sig: hn }; }
    if (pays.has(d)) out[`${d}-pay`] = { d, kind: 'pay', summary: 'Pay day', desc: '', sig: 'pay' };
  }
  return out;
}

export interface ExportDiff { added: ExportEvent[]; changed: ExportEvent[]; removed: { key: string; d: DateStr; sig: string }[]; at: number }

export function diffExport(ev: Record<string, ExportEvent>, last: ExportRecord | null | undefined, range: { from: DateStr; to: DateStr }, today: DateStr): ExportDiff | null {
  if (!last) return null;
  const added: ExportEvent[] = [], changed: ExportEvent[] = [], removed: ExportDiff['removed'] = [];
  for (const [k, e] of Object.entries(ev)) { if (last.ev[k] === undefined) added.push(e); else if (last.ev[k] !== e.sig) changed.push(e); }
  // only count a removed event when it falls inside today's range (older ones simply scrolled out)
  for (const [k, sig] of Object.entries(last.ev)) {
    if (ev[k]) continue;
    const d = k.slice(0, 10);
    if (d >= range.from && d <= range.to && d >= today) removed.push({ key: k, d, sig });
  }
  return { added, changed, removed, at: last.at };
}

const esc2 = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function buildIcs(ev: Record<string, ExportEvent>, diff: ExportDiff | null, last: ExportRecord | null | undefined, reminders: readonly number[], uid: string, now: Date): { text: string; seq: number } {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const seq = (last?.seq ?? 0) + 1, who = uid.slice(0, 8);
  const ds = (d: string): string => d.replace(/-/g, ''), tm = (t: string): string => `${t.replace(':', '')}00`;
  const rems = [...reminders].sort((a, b) => a - b);
  const changedKeys = new Set(diff ? diff.changed.map(e => `${e.d}-${e.kind}`) : []);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shift Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:My shifts'];
  for (const [k, e] of Object.entries(ev)) {
    const keep = last && last.ev[k] === e.sig ? last.seq : seq;
    L.push('BEGIN:VEVENT', `UID:${k}@shiftcal-${who}`, `DTSTAMP:${stamp}`, `SEQUENCE:${changedKeys.has(k) ? seq : keep}`);
    if (e.kind === 'shift' && e.start && e.end && e.endDate) {
      L.push(`DTSTART:${ds(e.d)}T${tm(e.start)}`, `DTEND:${ds(e.endDate)}T${tm(e.end)}`, `SUMMARY:${esc2(e.summary)}`, `DESCRIPTION:${esc2(e.desc)}`);
      for (const m of rems) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc2(e.summary)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
    } else {
      L.push(`DTSTART;VALUE=DATE:${ds(e.d)}`, `DTEND;VALUE=DATE:${ds(E.addDays(e.d, 1))}`, `SUMMARY:${esc2(e.summary)}`, 'TRANSP:TRANSPARENT');
      if (e.desc) L.push(`DESCRIPTION:${esc2(e.desc)}`);
    }
    L.push('END:VEVENT');
  }
  // events removed since last time: a cancelled copy with the same id lets most calendar apps delete them
  if (diff) for (const r of diff.removed) {
    L.push('BEGIN:VEVENT', `UID:${r.key}@shiftcal-${who}`, `DTSTAMP:${stamp}`, `SEQUENCE:${seq}`, 'STATUS:CANCELLED', `DTSTART;VALUE=DATE:${ds(r.d)}`, `DTEND;VALUE=DATE:${ds(E.addDays(r.d, 1))}`, 'SUMMARY:Removed', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return { text: L.join('\r\n'), seq };
}
