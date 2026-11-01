import { useNavigate } from 'react-router-dom';
import { Empty, Note, Page } from '../components/ui';
import { useData } from '../state/DataContext';
import { leaveGroups } from '../state/derive';
import { nextShift, timeOffIdeas } from '../state/ideas';
import { PAY_FREQ_LABEL } from '../state/options';
import * as E from '../utils/engine';
import * as P from '../utils/pay';
import { MON, fmtD, fmtH, range } from '../utils/format';

interface Item { d: string; t: string; s: string; tag: string }

export function UpcomingPage() {
  const { profile, ctx, days, holiday } = useData();
  const nav = useNavigate();
  if (!profile || !ctx) return null;
  const today = E.todayIso();
  const ns = nextShift(ctx), pays = E.payDates(profile, today, E.addDays(today, 70));
  const { lw, tips } = timeOffIdeas(ctx, holiday, today);
  const gross = (d: string): number | null => {
    const per = P.periodForPayDay(profile, d);
    return per && P.payOf(profile).rate > 0 ? P.computePeriod(profile, per, ctx, x => !!holiday(x)).totals.total : null;
  };
  const ev: Item[] = [];
  for (let n = 0; n < 60; n++) {
    const d = E.addDays(today, n), hn = holiday(d), i = E.dayInfo(d, ctx);
    if (hn) ev.push({ d, t: hn, s: i.isWorking ? `You work: ${ctx.shifts[i.work]?.code ?? ''}${ctx.shifts[i.work] ? ' · premium pay may apply' : ''}` : 'Day off', tag: 'HOL' });
    if (pays.includes(d)) {
      const g = gross(d);
      ev.push({ d, t: 'Pay day', s: `${PAY_FREQ_LABEL[profile.payFreq || 'biweekly']}${g !== null ? ` · ${P.money(profile, g)} gross` : ''}`, tag: '$' });
    }
  }
  for (const g of leaveGroups(profile, days)) if (g.end >= today && g.start <= E.addDays(today, 60)) ev.push({ d: g.start < today ? today : g.start, t: `${g.lv.name}, ${g.n} shift${g.n === 1 ? '' : 's'}`, s: `${range(g.start, g.end)} · ${fmtH(g.hours)}`, tag: g.lv.l });
  ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const dp = pays[0] ? E.diffDays(today, pays[0]) : 0;
  return (
    <Page title="Upcoming">
      {lw ? (
        <div className="rounded-lg bg-success-emphasis p-4 text-white" data-testid="long-weekend">
          <div className="text-sm font-semibold opacity-90">Next long weekend</div>
          <div className="text-xl font-semibold">{range(lw.start, lw.end)} · {lw.len} days off</div>
          <div className="mt-1 text-sm opacity-90">{lw.names.length ? `Includes ${lw.names.join(' and ')}. ` : ''}{lw.booked ? `Includes ${lw.booked} day${lw.booked === 1 ? '' : 's'} of time off you have already booked.` : 'You do not work any of these days, so no vacation hours are needed.'}</div>
        </div>
      ) : <Empty title="No long weekend found">{ctx.patterns.length ? 'Nothing of 3 or more days off in the next 8 months.' : 'Set up your rotation to find long weekends.'}</Empty>}
      {tips.map(t => <Note key={t.start}><b>Make it longer:</b> take {t.gap} shift{t.gap > 1 ? 's' : ''} off ({fmtH(t.hours)}) to get <b>{t.len} days off in a row</b>, {range(t.start, t.end)}.</Note>)}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3"><span className="text-xs font-semibold text-fg-muted">Next shift</span><div className="text-lg font-semibold" data-testid="next-shift">{ns ? `${ns.date === today ? 'Today' : fmtD(ns.date)} · ${ns.sh.code}` : 'None'}</div><div className="text-xs text-fg-muted">{ns ? `${ns.sh.start} to ${ns.sh.end}` : 'Set up your rotation'}</div></div>
        <div className="card p-3"><span className="text-xs font-semibold text-fg-muted">Next pay day</span><div className="text-lg font-semibold">{pays[0] ? fmtD(pays[0]) : 'Not set'}</div><div className="text-xs text-fg-muted">{pays[0] ? (dp === 0 ? 'Today' : `In ${dp} days`) : 'Add it in Settings'}</div></div>
      </div>
      <h2 className="font-semibold">Coming up</h2>
      {ev.length ? (
        <div className="card divide-y divide-line" data-testid="coming-up">
          {ev.slice(0, 10).map(e => (
            <button key={`${e.d}${e.t}`} type="button" className="flex w-full items-center gap-3 p-3 text-left hover:bg-canvas-subtle" onClick={() => nav(`/?d=${e.d}`)}>
              <span className="w-11 text-center text-xs font-semibold text-fg-muted">{MON[E.parts(e.d).m - 1].toUpperCase()}<b className="block text-xl leading-tight text-fg">{E.parts(e.d).d}</b></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{e.t}</span><span className="text-xs text-fg-muted">{e.s}</span></span>
              <span className="rounded-full bg-canvas-inset px-2 text-xs font-semibold">{e.tag}</span>
            </button>
          ))}
        </div>
      ) : <Empty title="Nothing coming up">{ctx.patterns.length ? 'No holidays, pay days or time off in the next 60 days.' : 'Set up your rotation to see what is coming.'}</Empty>}
    </Page>
  );
}
