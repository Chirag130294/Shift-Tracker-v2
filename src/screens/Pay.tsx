// The Pay tab (gross pay for a pay period) and the pay settings screens. The maths lives in utils/pay.ts;
// this file draws screens and saves settings (v1.6 views-pay.js).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Settings, X } from 'lucide-react';
import { CountUp } from '../components/CountUp';
import { useToast } from '../components/Toast';
import { Empty, Field, MenuGroup, MenuRow, Note, NumberField, Page, Section, SelectField, Seg, Toggle } from '../components/ui';
import { useData } from '../state/DataContext';
import { PAY_FREQ_LABEL, PAY_FREQ_OPTIONS } from '../state/options';
import * as E from '../utils/engine';
import * as P from '../utils/pay';
import { MON } from '../utils/format';
import { cn } from '../utils/cn';
import type { PaySettings, PayWeekend, Profile } from '../types';

const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const md = (d: string): string => `${MON[E.parts(d).m - 1]} ${E.parts(d).d}`;
const dow = (d: string): string => DOW3[E.weekday(d)];
const hh = (n: number): string => String(+Number(n).toFixed(2));
const t12 = (t: string): string => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h >= 12 ? 'p' : 'a'}`; };
const PCOL = ['#C98A0A', '#D9622B', '#4B4FB5', '#8A3FA8', '#17785A'];
const CAT: readonly (readonly [keyof P.PeriodTotals, string, string])[] = [
  ['base', 'Base pay', '#1f6feb'], ['prem', 'Shift premiums', '#C98A0A'], ['wk', 'Weekend premium', '#4B4FB5'], ['hol', 'Stat holiday', '#D9622B'], ['ot', 'Overtime', '#8A3FA8'], ['leave', 'Paid leave', '#17785A']
];

/** Saves a change to profile.pay: copy, edit, normalise, merge. */
function usePaySave(): { pay: PaySettings; profile: Profile | null; edit: (fn: (x: PaySettings) => void) => void } {
  const { profile, saveProfile } = useData();
  const pay = P.payOf(profile);
  return { pay, profile, edit: fn => { const x = structuredClone(pay); fn(x); void saveProfile({ pay: P.normPay(x) }); } };
}

// ---------- the Pay tab ----------
export function PayPage() {
  const { profile, ctx, holiday } = useData();
  const nav = useNavigate();
  const [start, setStart] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!profile || !ctx) return null;
  const x = P.payOf(profile), today = E.todayIso();
  const per = (start && P.periodFor(profile, start)) || P.periodFor(profile, today);
  const money = (n: number): string => P.money(profile, n);
  const settingsBtn = <button type="button" className="btn btn-invisible btn-icon" aria-label="Pay settings" data-testid="pay-settings" onClick={() => nav('/settings/pay')}><Settings size={18} aria-hidden="true" /></button>;
  if (!per) {
    return <Page title="Pay" right={settingsBtn}><Empty title="Set your pay dates" action={<button type="button" className="btn btn-primary" onClick={() => nav('/settings/pay/dates')}>Set pay dates</button>}>Choose how often you are paid and a pay date you know. Gross pay for each pay period shows up here.</Empty></Page>;
  }
  const prev = P.periodFor(profile, E.addDays(per.start, -1)), next = P.periodFor(profile, E.addDays(per.end, 1));
  const arrows = (
    <span className="flex gap-1">
      <button type="button" className="btn btn-icon" aria-label="Previous pay period" disabled={!prev} data-testid="pay-prev" onClick={() => prev && setStart(prev.start)}><ChevronLeft size={16} aria-hidden="true" /></button>
      <button type="button" className="btn btn-icon" aria-label="Next pay period" disabled={!next} data-testid="pay-next" onClick={() => next && setStart(next.start)}><ChevronRight size={16} aria-hidden="true" /></button>
    </span>
  );
  if (!(x.rate > 0)) {
    return (
      <Page title="Pay" right={arrows}>
        <Empty title="Add your hourly rate" action={<button type="button" className="btn btn-primary" data-testid="pay-add-rate" onClick={() => nav('/settings/pay/rate')}>Add rate</button>}>Gross pay is worked out from your hourly rate, shift premiums, unpaid breaks and leave pay. Set these once and every pay period is calculated.</Empty>
        <Note>Pay period {md(per.start)} to {md(per.end)} · pay day {dow(per.pay)}, {md(per.pay)}</Note>
      </Page>
    );
  }
  const r = P.computePeriod(profile, per, ctx, d => !!holiday(d)), t = r.totals;
  const inPer = today >= per.start && today <= per.end, past = per.end < today;
  const days = E.diffDays(today, per.pay);
  const payTxt = days === 0 ? 'Pay day is today' : days > 0 ? `Pay day in ${days} day${days === 1 ? '' : 's'}` : `Paid ${-days} day${days === -1 ? '' : 's'} ago`;
  const span = E.diffDays(per.start, per.end) + 1, done = inPer ? E.diffDays(per.start, today) + 1 : past ? span : 0, pct = Math.round((done / span) * 100);
  const parts = CAT.map(([k, l, c]) => [l, t[k], c, k] as const).filter(a => a[1] > 0);
  const tot = parts.reduce((a, b) => a + b[1], 0) || 1;
  const premNames = x.periods.filter(q => q.prem > 0).map(q => q.name);
  return (
    <Page title="Pay" right={<span className="flex items-center gap-1">{arrows}{settingsBtn}</span>}>
      <section className="rounded-lg border border-line bg-canvas p-4" aria-label="Gross pay" data-testid="pay-hero">
        <div className="flex items-center justify-between text-sm text-fg-muted"><span>{md(per.start)} to {md(per.end)}</span><span className="rounded-full border border-line px-2 text-xs">{payTxt}</span></div>
        <CountUp value={t.total} format={money} className="my-1 block text-3xl font-semibold tabular-nums" testId="pay-total" />
        <div className="text-sm text-fg-muted">Expected gross pay · {hh(t.hours)} paid hours · {dow(per.pay)}, {md(per.pay)}</div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas-inset" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><b className="block h-full bg-success-emphasis" style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 flex justify-between text-xs text-fg-muted"><span>{inPer || past ? `Earned so far ${money(t.earned)}` : 'Period has not started'}</span><span>{inPer ? `Day ${done} of ${span}` : ''}</span></div>
      </section>
      <div className="card space-y-2 p-3">
        <div className="flex items-baseline justify-between"><h2 className="font-semibold">Where it comes from</h2><span className="text-xs text-fg-muted">Before tax</span></div>
        <div className="flex h-2 overflow-hidden rounded-full" aria-hidden="true">{parts.map(a => <b key={a[3]} style={{ flex: a[1] / tot, background: a[2] }} />)}</div>
        {parts.map(a => (
          <div key={a[3]} className="flex items-center gap-2 text-sm"><i className="h-2.5 w-2.5 rounded-full" style={{ background: a[2] }} /><span className="flex-1">{a[0]}{a[3] === 'prem' && premNames.length ? <span className="text-xs text-fg-muted"> · {premNames.join(', ')}</span> : null}</span><b className="tabular-nums">{money(a[1])}</b></div>
        ))}
      </div>
      {r.items.length > 0 && (
        <>
          <Section>Shifts and leave · tap one for the math</Section>
          <div className="space-y-1.5" data-testid="pay-items">
            {r.items.map((it, n) => {
              const key = `${per.start}|${n}|${it.kind}|${it.date}`;
              const sub = it.kind === 'shift' ? `${t12(it.start ?? '00:00')} to ${t12(it.end ?? '00:00')} · ${hh(it.paid)} h paid${it.part ? ' · part of a night shift' : ''}`
                : it.kind === 'ot' ? (it.banked ? `${hh(it.hoursShown ?? 0)} h added to a bank` : `${hh(it.paid)} h × ${hh(x.otMult)}`) : `${hh(it.paid)} h${it.pct !== undefined ? ` · ${hh(it.pct)}% pay` : ''}`;
              return (
                <div key={key} className={cn('card', it.date > today && 'opacity-80')}>
                  <button type="button" className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={!!open[key]} onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))}>
                    <span className="w-9 text-center text-xs text-fg-muted"><b className="block text-base text-fg">{E.parts(it.date).d}</b>{dow(it.date)}</span>
                    <span className="inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1 text-xs font-bold text-white" style={{ background: it.color }}>{it.code}</span>
                    <span className="min-w-0 flex-1"><b className="block truncate text-sm">{it.title}</b><span className="text-xs text-fg-muted">{sub}</span></span>
                    <b className="tabular-nums">{it.banked ? 'Banked' : money(it.total)}</b>
                    <ChevronDown size={14} className={cn('transition-transform', open[key] && 'rotate-180')} aria-hidden="true" />
                  </button>
                  {open[key] && (
                    <div className="space-y-1 border-t border-line p-3 text-sm">
                      {it.kind === 'shift' && <p className="text-xs text-fg-muted">{hh(it.len ?? 0)} h at work, {hh(it.unpaid ?? 0)} h unpaid, {hh(it.paid)} h paid</p>}
                      {it.lines.map((l, k) => <div key={k} className="flex justify-between"><span>{l.label}<span className="block text-xs text-fg-muted">{hh(l.h)} h × {money(l.r)}</span></span><b className="tabular-nums">{money(l.amt)}</b></div>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-xs text-fg-muted">An estimate from your pay settings, before tax and deductions. Your pay stub is the final word.</p>
    </Page>
  );
}

// ---------- settings: hub ----------
export function PayHub() {
  const { pay: x, profile } = usePaySave();
  const { ctx } = useData();
  if (!profile || !ctx) return null;
  const per = P.periodFor(profile, E.todayIso());
  const rule = P.DAY_RULES.find(r => r[0] === x.dayRule)?.[1] ?? '';
  const unp = x.unpaid.length ? x.unpaid.map(u => `${hh(u.len)} h: ${hh(u.u)}`).join(', ') : "Uses each shift's own break";
  return (
    <Page title="Pay" backTo="">
      {x.rate > 0 && per && <MenuGroup><MenuRow to="/pay" icon={Settings} title={`This pay period: ${P.money(profile, P.computePeriod(profile, per, ctx).totals.total)}`} sub="Open the Pay tab" /></MenuGroup>}
      <MenuGroup>
        <MenuRow to="/settings/pay/rate" icon={Settings} title="Rate and currency" sub={`${x.rate > 0 ? `${P.money(profile, x.rate)} an hour` : 'Not set'} · ${x.cur === 'custom' ? x.sym : x.cur} · overtime ${hh(x.otMult)} ×`} testId="pay-rate-row" />
        <MenuRow to="/settings/pay/premiums" icon={Settings} title="Shift premiums" sub={`${x.periods.map(q => q.name).join(', ')}${x.wk > 0 ? ', weekends' : ''}`} testId="pay-prem-row" />
        <MenuRow to="/settings/pay/breaks" icon={Settings} title="Unpaid breaks" sub={unp} testId="pay-breaks-row" />
        <MenuRow to="/settings/pay/leave" icon={Settings} title="Sick and leave pay" sub={`Sick pays ${hh(x.leavePay.sick ?? 100)}% of base`} testId="pay-leave-row" />
      </MenuGroup>
      <MenuGroup>
        <MenuRow to="/settings/pay/dates" icon={Settings} title="Pay period and pay days" sub={`${PAY_FREQ_LABEL[profile.payFreq || 'biweekly']}${per ? ` · next pay day ${md(per.pay)}` : ''}`} testId="pay-dates-row" />
        <MenuRow to="/settings/pay/day" icon={Settings} title="How a shift counts by day" sub={rule} testId="pay-day-row" />
      </MenuGroup>
      <p className="text-xs text-fg-muted">Vacation, sick and other banks are in Leave banks. This page is about what you earn.</p>
    </Page>
  );
}

export function PayRatePage() {
  const { pay: x, profile, edit } = usePaySave();
  if (!profile) return null;
  const m = (n: number): string => P.money(profile, n);
  return (
    <Page title="Rate and currency" backTo="">
      <div className="card space-y-3 p-3">
        <SelectField label="Currency" value={x.cur} options={P.CURRENCIES.map(c => [c[0], c[0] === 'custom' ? 'Another symbol' : `${c[1]}  ${c[0]} · ${c[2]}`] as const)} onChange={cur => edit(p => { p.cur = cur; })} />
        {x.cur === 'custom' && <Field label="Your symbol (up to 4 characters)">{id => <input id={id} className="field" maxLength={4} defaultValue={x.sym} placeholder="Rs" onBlur={e => edit(p => { p.sym = e.target.value.trim().slice(0, 4); })} />}</Field>}
        <NumberField label="Hourly rate (base pay)" value={x.rate || ''} data-testid="pay-rate" onChange={v => edit(p => { p.rate = Number(v) || 0; })} hint={x.rate > 0 ? `${m(x.rate * 40)} for 40 hours.` : 'The rate on your pay stub, before any premiums.'} />
      </div>
      <div className="card space-y-3 p-3">
        <h2 className="font-semibold">Overtime</h2>
        <Seg label="Overtime pays" value={x.otMult} options={[[1.25, '1.25 ×'], [1.5, '1.5 ×'], [2, '2 ×']]} onChange={v => edit(p => { p.otMult = v; })} />
        <NumberField label="Or type your own multiplier" value={x.otMult} step="0.05" onChange={v => edit(p => { p.otMult = Number(v) || 1; })} hint={`Overtime you log pays ${m(x.rate * x.otMult)} an hour. Hours you bank are not paid until you take them as time off.`} />
      </div>
      <div className="card space-y-3 p-3">
        <Toggle label="Extra pay on stat holidays" hint="For hours worked on a holiday from your holiday list" on={x.holMult > 1} testId="pay-hol-tog" onChange={on => edit(p => { p.holMult = on ? 1.5 : 1; })} />
        {x.holMult > 1 && <NumberField label="Holiday hours pay this many times base" value={x.holMult} step="0.05" onChange={v => edit(p => { p.holMult = Number(v) || 1; })} hint={`Adds ${m(x.rate * (x.holMult - 1))} an hour on top of base pay.`} />}
      </div>
    </Page>
  );
}

export function PayLeavePage() {
  const { pay: x, profile, edit } = usePaySave();
  if (!profile) return null;
  const sh = profile.shifts[0], h = sh ? E.paidHours(sh) : 8;
  return (
    <Page title="Sick and leave pay" backTo="">
      <p className="text-fg-muted">When you take a paid day off, how much of your base pay do you get? For example, some workplaces pay 70% for a sick day.</p>
      {profile.banks.map(b => {
        const v = x.leavePay[b.id] ?? 100;
        return (
          <div key={b.id} className="card space-y-2 p-3">
            <b className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.name}</b>
            <Seg label={`${b.name} pay`} value={v} options={[[100, '100%'], [80, '80%'], [70, '70%'], [60, '60%'], [50, '50%'], [0, 'Unpaid']]} onChange={n => edit(p => { p.leavePay[b.id] = n; })} />
            <NumberField label="Other percent" value={v} step="1" data-testid={`leave-pct-${b.id}`} onChange={n => edit(p => { p.leavePay[b.id] = Math.min(100, Number(n) || 0); })} />
            {x.rate > 0 && <p className="text-xs text-fg-muted">A {hh(h)} hour day pays {P.money(profile, (h * x.rate * v) / 100)}.</p>}
          </div>
        );
      })}
      <p className="text-xs text-fg-muted">These amounts appear in the Pay tab for any day you book as leave.</p>
    </Page>
  );
}

export function PayPremiumsPage() {
  const { pay: x, profile, edit } = usePaySave();
  const toast = useToast();
  const [tpl, setTpl] = useState('');
  if (!profile) return null;
  const u = x.mode === '$' ? '$ per hour' : '% of base';
  const applyTpl = (k: keyof typeof P.PAY_TEMPLATES): void => {
    const T = P.PAY_TEMPLATES[k];
    setTpl(k);
    edit(p => {
      p.mode = T.mode; p.wk = T.wk;
      p.periods = T.periods.map((q, i) => ({ id: `p${Date.now().toString(36)}${i}`, name: q[0], start: q[1], end: q[2], prem: q[3] }));
      p.unpaid = T.unpaid.map(q => ({ len: q[0], u: q[1] }));
    });
    toast.show('Template applied. Change anything to fit your contract.');
  };
  const sh = profile.shifts[0];
  const tue = (() => { const t = E.todayIso(); return E.addDays(t, (9 - E.weekday(t)) % 7 || 7); })();
  const check = sh ? P.calcShift(sh, tue, profile, () => false) : null;
  return (
    <Page title="Shift premiums" backTo="">
      <Section>Start from a template</Section>
      <div className="card space-y-2 p-3">
        <Seg label="Templates" value={tpl} options={Object.entries(P.PAY_TEMPLATES).map(([k, v]) => [k, v.name] as const)} onChange={k => applyTpl(k as keyof typeof P.PAY_TEMPLATES)} />
        {tpl && <p className="text-xs text-fg-muted">{P.PAY_TEMPLATES[tpl as keyof typeof P.PAY_TEMPLATES].note}</p>}
      </div>
      <Section>When each part of the day counts</Section>
      <div className="card space-y-3 p-3">
        <p className="text-xs text-fg-muted">Each hour is paid at the part of the day it falls in. A 7 am to 7 pm shift gets the morning rate for the hours before 3 pm, and so on.</p>
        <div><div className="label mb-1">Premiums are</div><Seg label="Premium type" value={x.mode} options={[['$', '$ per hour'], ['%', '% of base']]} onChange={mode => edit(p => { p.mode = mode; })} /></div>
        {x.periods.map((q, i) => (
          <div key={q.id} className="space-y-2 border-t border-line pt-3" data-testid={`period-${i}`}>
            <div className="flex items-center gap-2">
              <i className="h-3 w-3 rounded-full" style={{ background: PCOL[i % 5] }} />
              <input className="field flex-1" aria-label="Period name" defaultValue={q.name} maxLength={20} onBlur={e => edit(p => { if (e.target.value.trim()) p.periods[i].name = e.target.value.trim(); })} />
              {x.periods.length > 1 && <button type="button" className="btn btn-invisible btn-icon" aria-label={`Remove ${q.name}`} onClick={() => edit(p => { p.periods.splice(i, 1); })}><X size={14} aria-hidden="true" /></button>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Starts">{id => <input id={id} type="time" className="field" defaultValue={q.start} onBlur={e => { if (e.target.value) edit(p => { p.periods[i].start = e.target.value; }); }} />}</Field>
              <Field label="Ends">{id => <input id={id} type="time" className="field" defaultValue={q.end} onBlur={e => { if (e.target.value) edit(p => { p.periods[i].end = e.target.value; }); }} />}</Field>
              <NumberField label={`Extra (${x.mode === '$' ? 'per hour' : '%'})`} value={q.prem} step="0.25" onChange={v => edit(p => { p.periods[i].prem = Number(v) || 0; })} />
            </div>
          </div>
        ))}
        {x.periods.length < 5 && <button type="button" className="btn w-full" data-testid="period-add" onClick={() => edit(p => { p.periods.push(P.newPeriod()); })}><Plus size={14} aria-hidden="true" /> Add a period</button>}
      </div>
      <div className="card p-3"><NumberField label={`Weekend extra (${u})`} value={x.wk} step="0.25" onChange={v => edit(p => { p.wk = Number(v) || 0; })} hint="Added for every paid hour that counts on a Saturday or Sunday. 0 means none." /></div>
      {sh && check && (
        <>
          <Section>Check a shift (a weekday)</Section>
          <div className="card space-y-1 p-3 text-sm" data-testid="pay-check">
            <b>{sh.name}</b>
            <p className="text-xs text-fg-muted">{hh(check.len)} h at work − {hh(check.unpaid)} h unpaid = {hh(check.paid)} h paid</p>
            {x.rate > 0 ? check.lines.map((l, k) => <div key={k} className="flex justify-between"><span>{l.label}</span><b>{P.money(profile, l.amt)}</b></div>) : <p className="text-xs text-fg-muted">Add your hourly rate to see the pay for this shift.</p>}
          </div>
        </>
      )}
    </Page>
  );
}

export function PayBreaksPage() {
  const { pay: x, profile, edit } = usePaySave();
  if (!profile) return null;
  return (
    <Page title="Unpaid breaks" backTo="">
      <p className="text-fg-muted">Set an unpaid break for each shift length. For example 0.5 hours in an 8 hour shift, or 0.75 in a 12 hour shift. The break comes off the paid hours.</p>
      <div className="card space-y-3 p-3">
        {x.unpaid.length ? x.unpaid.map((u, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1"><NumberField label="Shift length (hours)" value={u.len} step="0.25" onChange={v => edit(p => { p.unpaid[i].len = Number(v) || 0; })} /></div>
            <div className="flex-1"><NumberField label="Unpaid break (hours)" value={u.u} step="0.25" onChange={v => edit(p => { p.unpaid[i].u = Number(v) || 0; })} /></div>
            <button type="button" className="btn btn-invisible btn-icon" aria-label="Remove this rule" onClick={() => edit(p => { p.unpaid.splice(i, 1); })}><X size={14} aria-hidden="true" /></button>
          </div>
        )) : <p className="text-xs text-fg-muted">No rules yet. Each shift then uses the break saved in your shift library.</p>}
        <button type="button" className="btn w-full" data-testid="unpaid-add" onClick={() => edit(p => { p.unpaid.push({ len: 10, u: 0.5 }); })}><Plus size={14} aria-hidden="true" /> Add a shift length</button>
      </div>
      <Section>What this gives your shifts</Section>
      <div className="card divide-y divide-line">
        {profile.shifts.map(s => {
          const len = E.shiftMinutes(s) / 60, br = P.breakMinutes(s, x) / 60, ruled = x.unpaid.some(q => Math.abs(q.len - len) < 0.01);
          return <div key={s.id} className="flex items-center justify-between p-3 text-sm"><span>{s.name} · {hh(len)} h</span><span className="text-fg-muted">{hh(br)} h unpaid{ruled ? '' : ' (from the shift)'}</span></div>;
        })}
      </div>
    </Page>
  );
}

const dayOpts = (max: number, last: boolean): (readonly [number, string])[] => Array.from({ length: max }, (_, k) => k + 1).map(d => [d, d === 31 && last ? 'Last day' : String(d)] as const);
export function PayDatesPage() {
  const { pay: x, profile, edit } = usePaySave();
  const { saveProfile } = useData();
  if (!profile) return null;
  const f = profile.payFreq, today = E.todayIso(), L = P.lagOf(profile);
  const weekend = <div><div className="label mb-1">If pay day is on a weekend</div><Seg label="If pay day is on a weekend" value={profile.payWeekend || 'before'} options={[['before', 'Friday before'], ['after', 'Monday after'], ['none', 'Keep the date']] satisfies readonly (readonly [PayWeekend, string])[]} onChange={payWeekend => { void saveProfile({ payWeekend }); }} /></div>;
  const lag = <NumberField label="Period ends this many days before pay day" value={x.lag === null ? L : x.lag} step="1" data-testid="pay-lag" onChange={v => edit(p => { p.lag = v === '' ? null : Number(v); })} />;
  const next = E.payDates(profile, today, E.addDays(today, 130)).slice(0, 3).map(d => ({ d, per: P.periodForPayDay(profile, d) }));
  return (
    <Page title="Pay period and pay days" backTo="">
      <div className="card space-y-3 p-3">
        <SelectField label="How often you are paid" value={f || 'biweekly'} options={PAY_FREQ_OPTIONS} onChange={payFreq => { void saveProfile({ payFreq }); }} />
        {(f === 'weekly' || f === 'biweekly') && <><Field label="A pay date you know" hint="Every pay day is counted from this date. Look at an old pay stub.">{id => <input id={id} type="date" className="field" data-testid="pay-anchor" value={profile.payAnchor ?? ''} onChange={e => { void saveProfile({ payAnchor: e.target.value }); }} />}</Field>{lag}</>}
        {f === 'semimonthly' && <><div className="grid grid-cols-2 gap-3"><SelectField label="First pay day" value={x.semi[0]} options={dayOpts(31, true)} onChange={v => edit(p => { p.semi[0] = v; })} /><SelectField label="Second pay day" value={x.semi[1]} options={dayOpts(31, true)} onChange={v => edit(p => { p.semi[1] = v; })} /></div>{lag}{weekend}</>}
        {f === 'monthly' && <><div className="grid grid-cols-2 gap-3"><SelectField label="Pay day of the month" value={E.monthlyPayDay(profile)} options={dayOpts(31, true)} onChange={v => edit(p => { p.mDay = v; })} /><SelectField label="Pay period starts on day" value={x.mStart} options={dayOpts(28, false)} onChange={v => edit(p => { p.mStart = v; })} /></div><p className="text-xs text-fg-muted">Start day 1 means the calendar month. Start day 16 means the 16th to the 15th of next month.</p>{weekend}</>}
      </div>
      <Section>Your next pay days</Section>
      <div className="card divide-y divide-line">
        {next.length ? next.map(n => <div key={n.d} className="p-3 text-sm"><b>{dow(n.d)}, {md(n.d)}</b>{n.per && <span className="block text-xs text-fg-muted">Pays for {md(n.per.start)} to {md(n.per.end)}</span>}</div>) : <p className="p-3 text-fg-muted">Choose a pay date to see your next pay days.</p>}
      </div>
      <p className="text-xs text-fg-muted">Pay days show as $ on the calendar. Tap one to see your gross pay for that period.</p>
    </Page>
  );
}

export function PayDayRulePage() {
  const { pay: x, edit } = usePaySave();
  const ex: Record<string, string> = { start: 'counts as Friday.', end: 'counts as Saturday.', split: 'the hours before midnight count on Friday and the rest on Saturday.', most: 'counts on the day that holds most of its paid hours.' };
  return (
    <Page title="How a shift counts by day" backTo="">
      <p className="text-fg-muted">This decides which day, and so which pay period and weekend rate, a shift that runs past midnight belongs to.</p>
      <div className="space-y-2" role="radiogroup" aria-label="Day rule">
        {P.DAY_RULES.map(([k, l, d]) => (
          <button key={k} type="button" role="radio" aria-checked={x.dayRule === k} data-testid={`dayrule-${k}`} className={cn('card block w-full p-3 text-left', x.dayRule === k && 'border-accent-emphasis bg-accent-subtle')} onClick={() => edit(p => { p.dayRule = k; })}>
            <b className="block">{l}</b><span className="text-xs text-fg-muted">{d}</span>
          </button>
        ))}
      </div>
      <Note><b>A night shift from Friday 11 pm to Saturday 7 am:</b> {ex[x.dayRule]}</Note>
    </Page>
  );
}
