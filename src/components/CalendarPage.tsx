import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, DollarSign, Moon, Star } from 'lucide-react';
import { CalendarGrid } from './CalendarGrid';
import { DaySheet } from './DaySheet';
import { BottomSheet } from './BottomSheet';
import { useData } from '../state/DataContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { isLvType, lvOf } from '../state/derive';
import * as B from '../utils/banks';
import * as E from '../utils/engine';
import { fmtD, fmtH, fmtMD, shortT } from '../utils/format';
import { inkFor } from '../utils/color';
import { cn } from '../utils/cn';
import type { DateStr } from '../types';

function TodayCard({ onOpen }: { onOpen: (date: DateStr) => void }) {
  const { profile, ctx } = useData();
  if (!profile || !ctx) return null;
  const today = E.todayIso();
  if (!ctx.patterns.length) {
    return (
      <div className="card-subtle p-3 text-sm" data-testid="today-card">
        <p className="font-semibold">No rotation on this account yet</p>
        <Link to="/settings/rotation" className="text-xs font-semibold text-accent hover:underline" data-testid="setup-rotation-link">Set up your rotation</Link>
      </div>
    );
  }
  const info = E.dayInfo(today, ctx);
  const shift = ctx.shifts[info.work];
  const leave = isLvType(info.type) ? lvOf(profile.banks, info.override) : null;
  const pos = E.rotationPosition(today, ctx.patterns);
  const nextPay = E.payDates(profile, today, E.addDays(today, 70))[0];
  return (
    <button
      type="button"
      onClick={() => onOpen(today)}
      className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-canvas-subtle"
      data-testid="today-card"
      aria-label={`Today, ${fmtD(today)}. Open details`}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sm font-bold"
        style={{ background: shift?.color ?? leave?.bg ?? 'rgb(var(--c-canvas-inset))', color: shift ? inkFor(shift.color) : leave ? '#14302B' : 'rgb(var(--c-fg-muted))' }}
        aria-hidden="true"
      >
        {shift?.code ?? leave?.l ?? 'OFF'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg-muted">Today · {fmtD(today)}</span>
        <span className="block truncate font-semibold">{shift ? `${shift.name} · ${shift.start} to ${shift.end}` : leave ? leave.name : 'Day off'}</span>
        <span className="block truncate text-xs text-fg-muted">
          {shift ? `${fmtH(info.hours)} paid${pos ? ` · Week ${pos.week} of ${pos.weeks}` : ''}` : leave ? `Instead of ${ctx.shifts[info.base]?.code ?? 'a shift'}` : 'Enjoy it'}
        </span>
      </span>
      {nextPay && (
        <span className="shrink-0 text-right">
          <span className="block text-xs text-fg-muted">Next pay day</span>
          <span className="block font-semibold">{fmtMD(nextPay)}</span>
        </span>
      )}
    </button>
  );
}

function BankChips() {
  const { profile, stat } = useData();
  if (!profile) return null;
  return (
    <ul className="grid grid-cols-2 gap-2" aria-label="Leave banks" data-testid="bank-chips">
      {profile.banks.map(b => {
        const s = stat(b.id);
        const main = B.fmtAmt(b, s.after);
        return (
          <li key={b.id}>
            <Link
              to={`/leave/${encodeURIComponent(b.id)}`}
              className="card block overflow-hidden p-2.5 transition-colors hover:bg-canvas-subtle"
              style={{ borderLeft: `4px solid ${b.color}` }}
              aria-label={`${b.name}: ${main} available to book, ${B.fmtAmt(b, s.left)} today`}
            >
              <span className="block truncate text-xs text-fg-muted">{b.name}</span>
              <span className="block text-base font-semibold">{main}</span>
              <span className="block text-[11px] text-fg-muted">{s.booked ? `${B.fmtAmt(b, s.left)} today` : 'to book'}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Legend() {
  const { profile } = useData();
  if (!profile) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 text-xs text-fg-muted" data-testid="legend">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {profile.shifts.map(s => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className="rounded-sm px-1.5 text-xs font-bold leading-[18px]" style={{ background: s.color, color: inkFor(s.color) }}>{s.code}</span>
            {shortT(s.start)} to {shortT(s.end)}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        <li className="flex items-center gap-1"><Star size={11} className="text-severe" fill="currentColor" aria-hidden="true" /> Stat holiday</li>
        <li className="flex items-center gap-1"><DollarSign size={12} strokeWidth={2.6} className="text-success" aria-hidden="true" /> Pay day</li>
        <li className="flex items-center gap-1"><Moon size={11} className="text-done" fill="currentColor" aria-hidden="true" /> Night shift</li>
        <li className="flex items-center gap-1"><ArrowLeftRight size={11} aria-hidden="true" /> Swap or extra</li>
        <li>Bar on top = last night's shift ends</li>
      </ul>
    </div>
  );
}

export function CalendarPage() {
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<DateStr | null>(() => { const d = params.get('d'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; });
  const wide = useMediaQuery('(min-width: 768px)');
  const close = useCallback(() => setSelected(null), []);
  const today = E.todayIso();
  const detailDate = selected ?? today;

  return (
    <div className={cn('grid gap-4', 'md:grid-cols-[minmax(0,1fr)_320px] md:items-start')} data-testid="calendar-page">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-3 md:hidden">
          <TodayCard onOpen={setSelected} />
          <BankChips />
        </div>
        <CalendarGrid selected={selected} onSelect={setSelected} />
        <Legend />
      </div>

      <aside className="hidden flex-col gap-3 md:sticky md:top-20 md:flex" aria-label="Day details">
        <div className="card p-4"><DaySheet date={detailDate} /></div>
        <h2 className="label mt-1">Banks</h2>
        <BankChips />
        <TodayCard onOpen={setSelected} />
      </aside>

      <BottomSheet open={!wide && selected !== null} onClose={close} label={selected ? fmtD(selected) : 'Day details'}>
        {selected && <DaySheet date={selected} />}
        <button type="button" className="btn mt-3 w-full" onClick={close} data-testid="sheet-close">Close</button>
      </BottomSheet>
    </div>
  );
}
