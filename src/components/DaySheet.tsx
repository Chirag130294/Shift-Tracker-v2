import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useToast } from './Toast';
import { isLvType, leaveText, lieuInfo, lvOf } from '../state/derive';
import { withoutTypeKeys } from '../services/dayDoc';
import * as B from '../utils/banks';
import * as E from '../utils/engine';
import { DOWL, fmtD, fmtDY, fmtH, fmtMD, shiftTimes } from '../utils/format';
import { inkFor } from '../utils/color';
import { cn } from '../utils/cn';
import type { DateStr, Shift } from '../types';

function ShiftBadge({ shift, label, bg, fg }: { shift?: Shift; label?: string; bg?: string; fg?: string }) {
  const background = bg ?? shift?.color ?? 'transparent';
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-line-muted text-base font-bold"
      style={{ background, color: fg ?? inkFor(shift?.color) }}
      aria-hidden="true"
    >
      {label ?? shift?.code ?? 'OFF'}
    </span>
  );
}

/** Everything about one day: what you work, what it did to your banks, and what you can change. */
export function DaySheet({ date }: { date: DateStr }) {
  const { profile, ctx, holiday, stat, commitDay } = useData();
  const toast = useToast();
  const [ot, setOt] = useState<{ hours: string; bank: string } | null>(null);
  if (!profile || !ctx) return null;

  const info = E.dayInfo(date, ctx);
  const saved = info.override ?? {};
  const work = ctx.shifts[info.work];
  const base = ctx.shifts[info.base];
  const shown = work ?? (info.type === 'SWAP_OUT' ? base : undefined);
  const leave = isLvType(info.type) ? lvOf(profile.banks, saved) : null;
  const pos = E.rotationPosition(date, ctx.patterns);
  const hn = holiday(date);
  const lieu = hn ? lieuInfo(profile, ctx, date) : null;
  const prev = E.dayInfo(E.addDays(date, -1), ctx);
  const prevShift = prev.isWorking ? ctx.shifts[prev.work] : undefined;
  const takeable = info.baseHours > 0;
  const currentBank = leave && info.type !== 'OFF' ? B.daySplits(saved)[0]?.bank : undefined;
  const bank = currentBank ? B.bankById(profile.banks, currentBank) : null;

  const book = (id: string): void => {
    const target = B.bankById(profile.banks, id);
    if (!target) return;
    const type = B.typeForBank(target);
    commitDay(date, d => ({ ...withoutTypeKeys(d), type, hours: info.baseHours, ...(type === 'LEAVE' ? { bank: target.id } : {}) }), `${target.name} booked`);
  };
  const requestOff = (): void => commitDay(date, d => ({ ...withoutTypeKeys(d), type: 'OFF' }), 'Marked as a day off');
  const markLieu = (): void => commitDay(date, d => ({ ...withoutTypeKeys(d), type: 'LIEU', hours: info.baseHours }), 'Marked as a lieu day');
  const saveOt = (): void => {
    if (!ot) return;
    const hours = Math.max(0, Number(ot.hours) || 0);
    commitDay(date, d => ({ ...withoutTypeKeys(d), type: 'OT', hours, ...(ot.bank ? { toBank: ot.bank } : {}) }), 'Overtime saved');
    setOt(null);
  };
  const clear = (): void => commitDay(date, d => withoutTypeKeys(d), 'Cleared');

  const saveNote = (value: string): void => {
    const note = value.trim().slice(0, 500);
    if (note === (saved.note ?? '')) return;
    commitDay(date, d => ({ ...d, note }));
    toast.show('Note saved');
  };

  const heading = fmtDY(date) + (pos && info.base ? ` · Week ${pos.week}` : '');

  return (
    <div className="flex flex-col gap-3" data-testid="day-details" data-date={date}>
      <div className="flex items-center gap-3">
        {shown ? <ShiftBadge shift={shown} /> : leave ? <ShiftBadge label={leave.l} bg={leave.bg} fg="#14302B" /> : <ShiftBadge bg="rgb(var(--c-canvas-inset))" fg="rgb(var(--c-fg-muted))" />}
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold" data-testid="day-heading">{heading}</h3>
          <p className="truncate text-sm" data-testid="day-title">
            {shown
              ? `${shown.name}${info.type === 'SWAP_OUT' ? ' (given away)' : ''}`
              : leave
                ? `${leave.name}${date > E.todayIso() && info.type !== 'OFF' ? ' (booked)' : ''}`
                : 'Day off'}
          </p>
          <p className="truncate text-xs text-fg-muted">
            {shown
              ? `${shiftTimes(shown, date)} · ${fmtH(info.type === 'SWAP_OUT' ? info.baseHours : info.hours)} paid`
              : leave && base
                ? `Normally ${base.code} ${base.start} to ${base.end}`
                : ctx.patterns.length ? 'No shift is scheduled' : 'No rotation is set up on this account'}
          </p>
        </div>
      </div>

      {hn && (
        <p className="rounded-md border border-severe/30 bg-severe-subtle px-3 py-2 text-xs text-severe" data-testid="holiday-note">
          <strong>{hn}</strong> · stat holiday{lieu ? <> · <strong>{lieu.text} lieu earned</strong></> : null}
        </p>
      )}

      {prevShift && E.crossesMidnight(prevShift) && (
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          <Moon size={12} aria-hidden="true" className="text-done" />
          Your {prevShift.code} shift from {fmtD(E.addDays(date, -1))} ends this morning at {prevShift.end}.
        </p>
      )}

      {shown && E.crossesMidnight(shown) && (
        <p className="text-xs text-fg-muted">
          This shift belongs to {fmtMD(date)}, the date it starts. It ends {fmtMD(E.addDays(date, 1))} at {shown.end}.
        </p>
      )}

      {leave && bank && info.type !== 'OFF' && (
        <div className="card-subtle p-3 text-xs" style={{ borderLeft: `4px solid ${bank.color}` }} data-testid="leave-box">
          <p className="mb-1.5 text-sm font-semibold">{leaveText(profile.banks, saved)}</p>
          <p className="flex justify-between"><span className="text-fg-muted">Available to book before</span><b>{B.fmtAmt(bank, stat(bank.id, date).after)}</b></p>
          <p className="flex justify-between"><span className="text-fg-muted">Available to book after</span><b>{B.fmtAmt(bank, stat(bank.id).after)}</b></p>
          <Link to={`/leave/${encodeURIComponent(bank.id)}`} className="mt-2 inline-block font-semibold text-accent hover:underline">See {bank.name} ledger</Link>
        </div>
      )}

      <div role="group" aria-label="Take this day from a bank">
        <p className="label mb-1.5">{takeable ? `Take ${fmtH(info.baseHours)} from` : 'Nothing to take off: no shift on this day'}</p>
        <div className="flex flex-wrap gap-1.5">
          {profile.banks.map(b => (
            <button
              key={b.id}
              type="button"
              className={cn('btn btn-sm', currentBank === b.id && 'border-accent-emphasis bg-accent-subtle')}
              aria-pressed={currentBank === b.id}
              disabled={!takeable}
              onClick={() => book(b.id)}
              data-testid={`book-${b.id}`}
            >
              <i className="h-2 w-2 rounded-full" style={{ background: b.color }} aria-hidden="true" />
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {(lieu || saved.noLieu || hn || saved.lieu) && (
        <div className="card-subtle flex items-center gap-3 p-3 text-sm" data-testid="lieu-card">
          <div className="min-w-0 flex-1">
            <b>{lieu ? `Lieu earned automatically: ${lieu.text}` : saved.noLieu ? 'Lieu not counted for this day' : 'Track a lieu day'}</b>
            {!lieu && !saved.noLieu && <p className="text-xs text-fg-muted">Adds 1 lieu day to your Lieu bank{profile.holidayLieu.on ? '' : '. Turn on automatic lieu in Settings, Holidays.'}</p>}
          </div>
          {lieu || saved.noLieu
            ? <button type="button" className="btn btn-sm" data-testid="no-lieu" onClick={() => commitDay(date, d => ({ ...d, noLieu: !d.noLieu }))}>{saved.noLieu ? 'Count it' : 'Not this time'}</button>
            : <button type="button" className="btn btn-sm" aria-pressed={!!saved.lieu} data-testid="track-lieu" onClick={() => commitDay(date, d => ({ ...d, lieu: !d.lieu }))}>{saved.lieu ? 'On' : 'Track'}</button>}
        </div>
      )}

      {ot ? (
        <form className="card-subtle space-y-2 p-3" data-testid="ot-form" onSubmit={e => { e.preventDefault(); saveOt(); }}>
          <label className="label block" htmlFor={`ot-h-${date}`}>Overtime hours</label>
          <input id={`ot-h-${date}`} className="field" type="number" inputMode="decimal" min={0} step="0.25" value={ot.hours} data-testid="ot-hours" onChange={e => setOt({ ...ot, hours: e.target.value })} />
          <label className="label block" htmlFor={`ot-b-${date}`}>Add these hours to a bank (optional)</label>
          <select id={`ot-b-${date}`} className="field" value={ot.bank} data-testid="ot-bank" onChange={e => setOt({ ...ot, bank: e.target.value })}>
            <option value="">No bank</option>{profile.banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2"><button type="button" className="btn" onClick={() => setOt(null)}>Cancel</button><button type="submit" className="btn btn-primary" data-testid="ot-save">Save</button></div>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-sm" disabled={!takeable} onClick={markLieu} data-testid="mark-lieu">Lieu day</button>
        <button type="button" className="btn btn-sm" data-testid="add-ot" onClick={() => setOt({ hours: String(saved.type === 'OT' ? saved.hours ?? 1 : 1), bank: saved.toBank ?? '' })}>Overtime</button>
        <Link to={`/swap-log/${date}/${info.base ? 'gave' : 'took'}`} className="btn btn-sm" data-testid="swap-log">Swap shift</Link>
        <Link to={`/swap-log/${date}/extra`} className="btn btn-sm" data-testid="extra-shift">Extra shift</Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-sm" disabled={!info.base} onClick={requestOff} data-testid="request-off">Request off</button>
        {shown && info.type !== 'SWAP_OUT' && <Link to={`/who/${date}`} className="btn btn-sm" data-testid="who-can">Who can take my shift?</Link>}
        <Link to="/leave/book" className="btn btn-sm" data-testid="book-range">Book several days</Link>
        <button type="button" className="btn btn-sm btn-danger" disabled={!saved.type} onClick={clear} data-testid="clear-day">
          {leave ? `Remove ${leave.l.toLowerCase()}` : 'Clear'}
        </button>
      </div>

      <div>
        <label htmlFor={`note-${date}`} className="label mb-1 block">Note for {DOWL[E.weekday(date)]}</label>
        <textarea
          key={date}
          id={`note-${date}`}
          className="field min-h-[64px] resize-y"
          maxLength={500}
          placeholder="Add a note"
          defaultValue={saved.note ?? ''}
          onBlur={e => saveNote(e.target.value)}
          data-testid="day-note"
        />
      </div>
    </div>
  );
}
