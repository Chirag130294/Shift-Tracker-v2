import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion, type PanInfo } from 'framer-motion';
import gsap from 'gsap';
import { ArrowLeftRight, ChevronLeft, ChevronRight, DollarSign, Moon, Star } from 'lucide-react';
import { useData } from '../state/DataContext';
import { buildMonth, type Cell } from '../state/calendarModel';
import * as E from '../utils/engine';
import { MONTHS } from '../utils/format';
import { cn } from '../utils/cn';
import type { DateStr } from '../types';

interface CalendarGridProps {
  selected: DateStr | null;
  onSelect: (date: DateStr) => void;
}

interface Month {
  y: number;
  m: number;
}

const monthOf = (date: DateStr): Month => {
  const { y, m } = E.parts(date);
  return { y, m };
};

/** Same day-of-month one month away, clamped (Jan 31 -> Feb 28). */
function shiftMonth(date: DateStr, delta: number): DateStr {
  const { y, m, d } = E.parts(date);
  const k = y * 12 + (m - 1) + delta;
  const ny = Math.floor(k / 12), nm = (k % 12) + 1;
  return E.ymd(ny, nm, Math.min(d, E.daysInMonth(ny, nm)));
}

interface DayCellProps {
  cell: Cell;
  selected: boolean;
  tabStop: boolean;
  onPick: (date: DateStr) => void;
  onKey: (e: KeyboardEvent<HTMLButtonElement>, date: DateStr) => void;
}

const DayCell = memo(function DayCell({ cell, selected, tabStop, onPick, onKey }: DayCellProps) {
  const { badge } = cell;
  return (
    <div role="gridcell" aria-selected={selected} className="min-w-0">
      <button
        type="button"
        tabIndex={tabStop ? 0 : -1}
        aria-current={cell.isToday ? 'date' : undefined}
        aria-label={cell.aria}
        data-testid="day-cell"
        data-date={cell.date}
        data-today={cell.isToday || undefined}
        onClick={() => onPick(cell.date)}
        onKeyDown={e => onKey(e, cell.date)}
        className={cn(
          'relative flex h-[66px] w-full min-w-0 flex-col items-stretch gap-0.5 overflow-hidden rounded-md border px-1 pb-1 pt-1 text-left transition-colors duration-100 sm:h-[88px] sm:px-1.5',
          selected ? 'border-accent-emphasis bg-accent-subtle' : 'border-line-muted bg-canvas hover:bg-canvas-subtle',
          cell.isToday && !selected && 'border-accent-emphasis'
        )}
      >
        {cell.continuation && (
          <i className="absolute inset-x-0 top-0 h-[3px]" style={{ background: cell.continuation }} aria-hidden="true" />
        )}
        <span className="flex items-center justify-between gap-0.5">
          <span
            className={cn(
              'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold leading-none',
              cell.isToday ? 'bg-accent-emphasis text-white' : 'text-fg'
            )}
          >
            {cell.day}
          </span>
          <span className="flex items-center gap-0.5 text-fg-muted" aria-hidden="true">
            {cell.nightShift && <Moon size={10} className="text-done" fill="currentColor" />}
            {cell.holiday && <Star size={10} className="text-severe" fill="currentColor" />}
            {cell.isPayDay && <DollarSign size={11} strokeWidth={2.6} className="text-success" />}
            {cell.swapMarker && <ArrowLeftRight size={10} />}
            {cell.overtime && <span className="text-[9px] font-bold leading-none text-attention">OT</span>}
          </span>
        </span>
        {badge ? (
          <span
            className={cn(
              'block truncate rounded-sm px-0.5 text-center text-xs font-bold leading-[18px]',
              badge.dashed && 'outline-dashed outline-1 -outline-offset-2 outline-current',
              badge.faded && 'opacity-55'
            )}
            style={{ background: badge.bg, color: badge.fg }}
            aria-hidden="true"
          >
            {badge.label}
          </span>
        ) : (
          <span className="h-[18px]" aria-hidden="true" />
        )}
        <span className="hidden truncate text-center text-[10px] leading-3 text-fg-muted sm:block" aria-hidden="true">{cell.caption}</span>
      </button>
    </div>
  );
});

export function CalendarGrid({ selected, onSelect }: CalendarGridProps) {
  const { profile, ctx, holiday } = useData();
  const reduce = useReducedMotion();
  const today = E.todayIso();
  const [month, setMonth] = useState<Month>(() => monthOf(selected ?? today));
  const [cursor, setCursor] = useState<DateStr>(selected ?? today);
  const monthRef = useRef(month);
  monthRef.current = month;
  const direction = useRef<-1 | 0 | 1>(0);
  const flip = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef<DateStr | null>(null);

  const model = useMemo(
    () => (profile && ctx ? buildMonth(profile, ctx, holiday, month.y, month.m, today) : null),
    [profile, ctx, holiday, month.y, month.m, today]
  );

  /** Shows another month and remembers which way we moved, so the flip comes from the right edge. */
  const showMonth = useCallback((next: Month) => {
    const cur = monthRef.current;
    const diff = next.y * 12 + next.m - (cur.y * 12 + cur.m);
    if (diff === 0) return;
    direction.current = diff > 0 ? 1 : -1;
    setMonth(next);
  }, []);

  const goMonth = useCallback((delta: number) => {
    const cur = monthRef.current;
    const k = cur.y * 12 + (cur.m - 1) + delta;
    showMonth({ y: Math.floor(k / 12), m: (k % 12) + 1 });
  }, [showMonth]);

  const goToday = useCallback(() => {
    showMonth(monthOf(today));
    setCursor(today);
  }, [today, showMonth]);

  // Month flip: the grid tilts in from the edge it came from, then the days settle in a quick ripple.
  useLayoutEffect(() => {
    const el = flip.current;
    if (!el || reduce) return;
    const dir = direction.current;
    direction.current = 0;
    const scope = gsap.context(() => {
      const cells = el.querySelectorAll('[data-testid="day-cell"]');
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo(el,
        { opacity: 0, rotateX: dir * -16, y: dir * 12, transformOrigin: dir > 0 ? '50% 0%' : '50% 100%' },
        { opacity: 1, rotateX: 0, y: 0, duration: dir === 0 ? 0.2 : 0.36, clearProps: 'transform,opacity' }
      );
      if (dir !== 0) {
        tl.fromTo(cells, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.22, stagger: { each: 0.007, from: 'start' }, clearProps: 'transform,opacity' }, 0.05);
      }
    }, el);
    return () => scope.revert();
  }, [month.y, month.m, reduce]);

  // After a keyboard move that crosses into another month, put focus on the new cell once it exists.
  useEffect(() => {
    const target = focusAfterRender.current;
    if (!target) return;
    focusAfterRender.current = null;
    flip.current?.querySelector<HTMLElement>(`[data-date="${target}"]`)?.focus();
  }, [month.y, month.m, cursor]);

  const moveFocus = useCallback((target: DateStr) => {
    showMonth(monthOf(target));
    focusAfterRender.current = target;
    setCursor(target);
  }, [showMonth]);

  const onKey = useCallback((e: KeyboardEvent<HTMLButtonElement>, date: DateStr) => {
    const ws = profile?.weekStart ?? 0;
    let target: DateStr | null = null;
    switch (e.key) {
      case 'ArrowLeft': target = E.addDays(date, -1); break;
      case 'ArrowRight': target = E.addDays(date, 1); break;
      case 'ArrowUp': target = E.addDays(date, -7); break;
      case 'ArrowDown': target = E.addDays(date, 7); break;
      case 'Home': target = E.addDays(date, -E.weekOffset(date, ws)); break;
      case 'End': target = E.addDays(date, 6 - E.weekOffset(date, ws)); break;
      case 'PageUp': target = shiftMonth(date, -1); break;
      case 'PageDown': target = shiftMonth(date, 1); break;
      default: return;
    }
    e.preventDefault();
    moveFocus(target);
  }, [profile?.weekStart, moveFocus]);

  const pick = useCallback((date: DateStr) => {
    setCursor(date);
    onSelect(date);
  }, [onSelect]);

  const onPanEnd = (_: unknown, info: PanInfo): void => {
    const { x, y } = info.offset;
    if (Math.abs(x) > 60 && Math.abs(x) > Math.abs(y) * 1.5) goMonth(x < 0 ? 1 : -1);
  };

  if (!model) return null;
  const title = `${MONTHS[month.m - 1]} ${month.y}`;
  const inMonth = (d: DateStr): boolean => E.parts(d).y === month.y && E.parts(d).m === month.m;
  const tabStop = inMonth(cursor) ? cursor : E.ymd(month.y, month.m, 1);

  return (
    <section aria-label="Calendar" data-testid="calendar-grid">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold leading-8" aria-live="polite" data-testid="month-title">
          {MONTHS[month.m - 1]} <span className="font-normal text-fg-muted">{month.y}</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-sm" onClick={goToday} data-testid="today-button">Today</button>
          <button type="button" className="btn btn-icon" aria-label="Previous month" onClick={() => goMonth(-1)} data-testid="prev-month">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-icon" aria-label="Next month" onClick={() => goMonth(1)} data-testid="next-month">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <motion.div onPanEnd={onPanEnd} style={{ touchAction: 'pan-y' }}>
        <div role="grid" aria-label={title} className="[perspective:900px]">
          <div role="row" className="mb-1 grid grid-cols-7 gap-1">
            {model.weekdayLabels.map(name => (
              <div key={name} role="columnheader" aria-label={name} className="py-1 text-center text-xs font-semibold text-fg-muted">
                <span aria-hidden="true">{name.slice(0, 2)}</span>
              </div>
            ))}
          </div>
          <div ref={flip}>
            {model.weeks.map((week, wi) => (
              <div key={wi} role="row" className="mb-1 grid grid-cols-7 gap-1">
                {week.map((cell, ci) =>
                  cell ? (
                    <DayCell
                      key={cell.date}
                      cell={cell}
                      selected={cell.date === selected}
                      tabStop={cell.date === tabStop}
                      onPick={pick}
                      onKey={onKey}
                    />
                  ) : (
                    <div key={`blank-${wi}-${ci}`} role="gridcell" aria-hidden="true" />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
