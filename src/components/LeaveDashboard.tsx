import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { CountUp } from './CountUp';
import { useToast } from './Toast';
import { useData } from '../state/DataContext';
import { leaveGroups, usedThisYear } from '../state/derive';
import { LEDGER_FILTERS, StorageKey, StorageService, type LedgerFilter } from '../services/StorageService';
import * as B from '../utils/banks';
import * as E from '../utils/engine';
import { DOWS, MON, fmtDY, fmtH, fmtMD, range } from '../utils/format';
import { cn } from '../utils/cn';
import type { Bank, LedgerRow } from '../types';

const FILTER_LABEL: Record<LedgerFilter, string> = { all: 'All', earn: 'Earned', used: 'Used', booked: 'Booked' };

const rowSub = (b: Bank): string => {
  const bits = [b.unit === 'd' ? 'Days' : 'Hours'];
  if (b.earn.rule !== 'none' && b.earn.amount > 0) bits.push(`+${B.fmtAmt(b, b.earn.amount)} ${b.earn.rule === 'pay' ? 'each pay day' : 'each month'}`);
  if (b.grant.on && b.grant.amount > 0) bits.push(`+${B.fmtAmt(b, b.grant.amount)} on ${MON[+b.grant.date.slice(0, 2) - 1]} ${+b.grant.date.slice(3)}`);
  return bits.join(' · ');
};

function BankBar({ availablePct, label }: { availablePct: number; label: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="my-3 flex h-2 overflow-hidden rounded-full bg-canvas-inset" role="img" aria-label={label}>
      <motion.i
        className="block h-full"
        style={{ background: 'var(--bank-color)' }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${availablePct}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
      <i className="block h-full flex-1 opacity-35" style={{ background: 'var(--bank-color)' }} />
    </div>
  );
}

/** The use-it-or-lose-it warning for the first bank (vacation), from the carry-over limit and deadline. */
function CarryWarning({ hero }: { hero: Bank }) {
  const { profile, days, stat } = useData();
  if (!profile || hero.id !== 'vac' || !profile.deadline || profile.carryLimit === '') return null;
  const today = E.todayIso();
  let deadline = `${E.parts(today).y}-${profile.deadline.slice(5)}`;
  if (deadline < today) deadline = `${E.parts(today).y + 1}-${profile.deadline.slice(5)}`;
  let booked = 0;
  for (const [d, o] of Object.entries(days)) {
    if (d > today && d <= deadline) for (const sp of B.daySplits(o)) if (sp.bank === 'vac') booked += B.toUnit(hero, sp.h);
  }
  let earn = 0;
  if (hero.earn.rule === 'pay' && hero.earn.amount > 0) earn = hero.earn.amount * E.payDates(profile, E.addDays(today, 1), deadline).length;
  const excess = stat(hero.id).left + earn - booked - Number(profile.carryLimit || 0);
  if (excess <= 0.01) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-attention/40 bg-attention-subtle p-3 text-sm text-attention" role="alert" data-testid="carry-warning">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        <b>Use {B.fmtAmt(hero, excess)} by {fmtDY(deadline)}</b> or it does not carry over (limit {B.fmtAmt(hero, Number(profile.carryLimit))}).
      </span>
    </div>
  );
}

export function LeaveDashboard() {
  const { profile, days, stat } = useData();
  if (!profile) return null;
  const today = E.todayIso();
  const [hero, ...others] = profile.banks;
  const hs = stat(hero.id);
  const fmtHero = (n: number): string => B.fmtAmt(hero, n);
  const pct = hs.left > 0 ? Math.max(0, Math.min(100, (hs.after / hs.left) * 100)) : 0;
  const nextPay = hero.earn.rule === 'pay' && hero.earn.amount > 0 ? E.payDates(profile, today, E.addDays(today, 45))[0] : null;
  const groups = leaveGroups(profile, days).sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 14);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4" data-testid="leave-dashboard">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">Leave and banks</h1>
        <Link to="/leave/book" className="btn btn-primary btn-sm" data-testid="book-time-off">Book time off</Link>
        <Link to="/leave/edit/new" className="btn btn-sm" data-testid="add-bank">Add a bank</Link>
      </div>

      <section
        className="card p-4"
        style={{ ['--bank-color' as string]: hero.color, borderTop: `4px solid ${hero.color}` }}
        aria-labelledby="hero-bank-name"
        data-testid="hero-bank"
      >
        <div className="flex items-center justify-between">
          <h2 id="hero-bank-name" className="font-semibold">{hero.name}</h2>
          <span className="rounded-full bg-canvas-inset px-2 py-0.5 text-xs text-fg-muted">{hero.unit === 'd' ? 'days' : 'hours'}</span>
        </div>
        <p className="label mt-3">Available to book</p>
        <CountUp value={hs.after} format={fmtHero} className="block text-3xl font-semibold" testId="hero-available" />
        <p className="text-xs text-fg-muted">
          Balance today {fmtHero(hs.left)}{hs.booked ? `, minus ${fmtHero(hs.booked)} already booked` : ''}
        </p>
        <BankBar availablePct={pct} label={`${fmtHero(hs.after)} available, ${fmtHero(hs.booked)} booked`} />
        {profile.vacYearly > 0 && hero.id === 'vac' && <p className="text-xs text-fg-muted">of {fmtHero(profile.vacYearly)} this year</p>}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="card-subtle p-2">
            <span className="block text-fg-muted">{nextPay ? `Next pay day, ${fmtMD(nextPay)}` : 'Earning'}</span>
            <b className="text-sm">{nextPay ? `+${fmtHero(hero.earn.amount)}` : rowSub(hero).split(' · ').slice(1).join(' · ') || 'Manual'}</b>
          </div>
          <div className="card-subtle p-2">
            <span className="block text-fg-muted">Used so far this year</span>
            <b className="text-sm">{fmtHero(usedThisYear(hero, days))}</b>
          </div>
        </div>
        <Link to={`/leave/${encodeURIComponent(hero.id)}`} className="btn btn-primary mt-3 w-full" data-testid="open-ledger-hero">See ledger</Link>
      </section>

      <CarryWarning hero={hero} />

      <ul className="flex flex-col gap-2" aria-label="Other banks">
        {others.map(b => {
          const s = stat(b.id);
          return (
            <li key={b.id}>
              <Link
                to={`/leave/${encodeURIComponent(b.id)}`}
                className="card flex items-center gap-3 p-3 transition-colors hover:bg-canvas-subtle"
                aria-label={`${b.name}, ${B.fmtAmt(b, s.after)} available`}
                data-testid={`bank-row-${b.id}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: B.softColor(b.color) }} aria-hidden="true">
                  <i className="h-3 w-3 rounded-full" style={{ background: b.color }} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{b.name}</b>
                  <span className="block truncate text-xs text-fg-muted">{rowSub(b)}</span>
                </span>
                <span className="text-right">
                  <b className="block text-xl font-semibold leading-6">{B.fmtAmt(b, s.after)}</b>
                  <span className="block text-xs text-fg-muted">{s.booked ? `${B.fmtAmt(b, s.left)} today` : 'none booked'}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="time-off-heading">
        <h2 id="time-off-heading" className="mb-2 font-semibold">Time off</h2>
        {groups.length ? (
          <ul className="card divide-y divide-line-muted" data-testid="time-off-list">
            {groups.map(g => (
              <li key={`${g.start}-${g.key}`} className="flex items-center gap-3 p-3">
                <span className="flex h-7 min-w-11 items-center justify-center rounded-sm px-1.5 text-xs font-bold" style={{ background: g.lv.bg, color: '#14302B' }}>{g.lv.l}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{g.start === g.end ? fmtDY(g.start) : range(g.start, g.end)}</span>
                  <span className="block text-xs text-fg-muted">{g.lv.name} · {g.end > today ? 'booked' : 'taken'} · {g.n} shift{g.n === 1 ? '' : 's'}</span>
                </span>
                <b className="text-sm">-{fmtH(g.hours)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card-subtle p-6 text-center text-sm">
            <b>No time off yet</b>
            <p className="text-fg-muted">Pick a day on the calendar and take it from a bank.</p>
            <Link to="/" className="btn mt-3">Open calendar</Link>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- one bank's ledger ----------

const keepRow = (r: LedgerRow, flt: LedgerFilter): boolean =>
  flt === 'all' ||
  (flt === 'earn' && (r.kind === 'earn' || r.kind === 'credit')) ||
  (flt === 'used' && r.kind === 'use' && !r.future) ||
  (flt === 'booked' && r.kind === 'use' && r.future);

function Row({ bank, r }: { bank: Bank; r: LedgerRow }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={cn('flex items-center gap-3 p-3', r.future && 'bg-canvas-subtle')}
      data-testid="ledger-row"
      data-kind={r.kind}
    >
      <div className="w-12 shrink-0 text-xs">
        <b className="block text-sm">{fmtMD(r.date)}</b>
        <span className="text-fg-muted">{DOWS[E.weekday(r.date)]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.title}{r.future && r.kind === 'earn' ? ' (projected)' : ''}</p>
        <p className="truncate text-xs text-fg-muted">{r.sub}</p>
      </div>
      <div className="text-right">
        <b className={cn('block text-sm', r.amt > 0 && 'text-success', r.amt < 0 && 'text-danger')}>{r.amt > 0 ? '+' : ''}{B.fmtAmt(bank, r.amt)}</b>
        <span className="block text-xs text-fg-muted">bal {B.fmtAmt(bank, r.run)}</span>
      </div>
    </motion.li>
  );
}

export function BankLedger() {
  const { bankId = '' } = useParams();
  const navigate = useNavigate();
  const { profile, stat, saveBanks } = useData();
  const toast = useToast();
  const [filter, setFilter] = useState<LedgerFilter>(() => StorageService.get(StorageKey.USER_PREFS)?.ledgerFilter ?? 'all');
  const [adjusting, setAdjusting] = useState(false);
  const [draft, setDraft] = useState('');

  const chooseFilter = useCallback((f: LedgerFilter) => {
    setFilter(f);
    StorageService.update(StorageKey.USER_PREFS, cur => ({ ...(cur ?? {}), ledgerFilter: f }));
  }, []);

  if (!profile) return null;
  const st = stat(bankId);
  const bank = st.bank;
  if (!bank) {
    return (
      <div className="mx-auto max-w-2xl" data-testid="ledger-missing">
        <p className="card-subtle p-4 text-sm">This bank was removed. <Link to="/leave" className="font-semibold text-accent hover:underline">Back to leave</Link></p>
      </div>
    );
  }

  const today = E.todayIso();
  const rows = st.rows.filter(r => keepRow(r, filter)).slice().reverse();
  // "Today" marker sits between past and future rows when showing everything.
  const firstPast = rows.findIndex(r => !r.future);
  const markerAt = filter === 'all' ? (firstPast === -1 ? rows.length : firstPast) : -1;

  const startAdjust = (): void => { setDraft(String(+st.left.toFixed(2))); setAdjusting(true); };
  const saveAdjust = (): void => {
    const v = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(v)) { toast.show('Type a number'); return; }
    saveBanks(profile.banks.map(b => (b.id === bank.id ? { ...b, balance: v, asOf: today } : b)));
    setAdjusting(false);
    toast.show('Balance updated');
  };

  const marker = (
    <li key="today-marker" className="flex items-center gap-3 border-y border-accent-emphasis/40 bg-accent-subtle p-3" data-testid="ledger-today">
      <div className="w-12 shrink-0 text-xs"><b className="block text-sm">{fmtMD(today)}</b><span className="text-fg-muted">Today</span></div>
      <p className="flex-1 text-sm font-medium">Today's balance</p>
      <b className="text-sm">{B.fmtAmt(bank, st.left)}</b>
    </li>
  );
  const items = rows.map(r => <Row key={`${r.date}-${r.kind}-${r.title}-${r.amt}`} bank={bank} r={r} />);
  if (markerAt >= 0) items.splice(markerAt, 0, marker);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4" data-testid="bank-ledger" style={{ ['--bank-color' as string]: bank.color }}>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-icon" aria-label="Back to leave" onClick={() => navigate('/leave')}>
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <h1 className="truncate text-2xl font-semibold">{bank.name} ledger</h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="card p-3" style={{ borderColor: bank.color, borderWidth: 2 }}>
          <p className="label">Available to book</p>
          <CountUp value={st.after} format={n => B.fmtAmt(bank, n)} className="block text-xl font-semibold" testId="ledger-available" />
        </div>
        <div className="card p-3">
          <p className="label">Balance today</p>
          <b className="block text-xl font-semibold" data-testid="ledger-today-balance">{B.fmtAmt(bank, st.left)}</b>
        </div>
      </div>

      <div role="group" aria-label="Filter ledger rows" className="flex gap-1.5">
        {LEDGER_FILTERS.map(f => (
          <button
            key={f}
            type="button"
            className={cn('btn btn-sm', filter === f && 'border-accent-emphasis bg-accent-subtle text-accent')}
            aria-pressed={filter === f}
            onClick={() => chooseFilter(f)}
            data-testid={`filter-${f}`}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>

      <ul className="card divide-y divide-line-muted overflow-hidden" data-testid="ledger-list">
        <AnimatePresence initial={false}>{items}</AnimatePresence>
        <li className="flex items-center gap-3 p-3">
          <div className="w-12 shrink-0 text-xs"><b className="block text-sm">{st.asOf ? fmtMD(st.asOf) : ''}</b><span className="text-fg-muted">Start</span></div>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">Opening balance</p><p className="text-xs text-fg-muted">You entered this</p></div>
          <b className="text-sm">{B.fmtAmt(bank, st.opening)}</b>
        </li>
      </ul>

      {adjusting ? (
        <form className="card flex flex-col gap-2 p-4" onSubmit={e => { e.preventDefault(); saveAdjust(); }} data-testid="adjust-form">
          <h2 className="font-semibold">Correct the balance</h2>
          <p className="text-xs text-fg-muted">Type what the bank holds today, for example from your pay stub. Time you booked for later days still comes off.</p>
          <label htmlFor="adjust-balance" className="label">Balance today ({bank.unit === 'd' ? 'days' : 'hours'})</label>
          <input id="adjust-balance" className="field" type="number" inputMode="decimal" step="0.25" value={draft} onChange={e => setDraft(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn" onClick={() => setAdjusting(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={startAdjust} data-testid="adjust-balance">Adjust balance (correct a number)</button>
      )}
      <Link to={`/leave/edit/${encodeURIComponent(bank.id)}`} className="btn" data-testid="edit-bank">Edit this bank</Link>
    </div>
  );
}
