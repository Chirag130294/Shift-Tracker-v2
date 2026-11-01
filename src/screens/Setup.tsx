// First-time setup: where you work, your rotation, pay and leave, then a summary. Ported from v1.6 VIEWS.setup.
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Field, Note, NumberField, SelectField, TextField, Toggle } from '../components/ui';
import { RotationEditor } from './Rotation';
import { useData } from '../state/DataContext';
import { defaultRegion, newProfile } from '../state/profile';
import { blankDraft, commitRotation, type RotDraft } from '../state/rotation';
import * as E from '../utils/engine';
import { BUILT_IN, REGION_TITLE, ensureList, regionsOf } from '../utils/holidays';
import { COUNTRIES, countryName } from '../utils/countries';
import { DOWL, fmtD, fmtDY } from '../utils/format';
import { PAY_FREQ_OPTIONS } from '../state/options';
import { cn } from '../utils/cn';
import type { Bank, Profile } from '../types';

const LABELS = ['Where', 'Rotation', 'Pay and leave', 'Done'] as const;
const WEEKSTART = DOWL.map((d, i) => [i, d] as const);

export function SetupWizard() {
  const { user, saveProfile, signOut } = useData();
  const [step, setStep] = useState(1);
  const [p, setP] = useState<Profile>(() => ({ ...newProfile(), name: user?.name || '' }));
  const [rot, setRot] = useState<RotDraft>(() => blankDraft(0, ''));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const year = E.parts(E.todayIso()).y;

  useEffect(() => { if (!BUILT_IN.includes(p.country)) ensureList(p.country, year); }, [p.country, year]);
  useEffect(() => { if (!rot.brush && p.shifts[0]) setRot(r => ({ ...r, brush: p.shifts[0].id, ws: p.weekStart })); }, [p.shifts, p.weekStart, rot.brush]);

  const bank = (id: string): Bank | undefined => p.banks.find(b => b.id === id);
  const vac = bank('vac') ?? p.banks[0], sick = bank('sick') ?? p.banks[1] ?? p.banks[0];
  const setBank = (id: string, fn: (b: Bank) => Bank): void => setP(x => ({ ...x, banks: x.banks.map(b => (b.id === id ? fn(b) : b)) }));
  const regions = regionsOf(p.country, year);
  const today = E.todayIso();

  const next = async (): Promise<void> => {
    setErr('');
    if (step === 2) {
      const r = commitRotation(rot, p.patterns, Date.now());
      if ('error' in r) { setRot(d => ({ ...d, err: r.error })); return; }
      setP(x => ({ ...x, patterns: r.patterns }));
      setRot(d => ({ ...d, id: r.id, err: '' }));
    }
    if (step === 3) {
      const f = p.payFreq;
      if ((f === 'weekly' || f === 'biweekly' || f === 'monthly') && !p.payAnchor) { setErr('Choose a pay date you know so we can mark your pay days.'); return; }
      if (vac.grant.on && !(vac.grant.amount > 0)) { setErr('Enter how much vacation is added each year, or switch that off.'); return; }
    }
    if (step === 4) {
      setSaving(true);
      await saveProfile({ ...p, onboarded: true, banks: p.banks.map(b => ({ ...b, asOf: b.asOf || today })) });
      setSaving(false);
      return;
    }
    setStep(s => s + 1);
  };

  const ns = (() => {
    const pats = p.patterns, shifts = Object.fromEntries(p.shifts.map(s => [s.id, s]));
    for (let n = 0; n < 60 && pats.length; n++) { const d = E.addDays(today, n), id = E.baseShiftId(d, pats); if (shifts[id]) return { d, code: shifts[id].code }; }
    return null;
  })();

  return (
    <div className="mx-auto min-h-dvh max-w-xl space-y-4 bg-canvas-subtle p-4 pb-28" data-testid="setup">
      <div className="flex items-center gap-2">
        {step > 1 && <button type="button" className="btn btn-invisible btn-icon" aria-label="Back" data-testid="setup-back" onClick={() => { setErr(''); setStep(s => s - 1); }}><ArrowLeft size={18} aria-hidden="true" /></button>}
        <b className="flex-1 text-fg-muted">Step {step} of 4</b>
        <button type="button" className="btn btn-invisible btn-sm" onClick={signOut}>Log out</button>
      </div>
      <div className="grid grid-cols-4 gap-1" aria-hidden="true">{LABELS.map((_, k) => <i key={k} className={cn('h-1 rounded-full', k < step ? 'bg-accent-emphasis' : 'bg-canvas-inset')} />)}</div>
      <div className="flex justify-between text-xs font-medium text-fg-muted">{LABELS.map((l, k) => <span key={l} className={k + 1 === step ? 'font-bold text-accent' : ''}>{l}</span>)}</div>

      {step === 1 && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Where do you work?</h1>
          <p className="text-fg-muted">We use this to show your statutory holidays.</p>
          <div className="card space-y-3 p-3">
            <TextField label="Your name" value={p.name} maxLength={60} autoComplete="name" data-testid="setup-name" onChange={name => setP(x => ({ ...x, name }))} />
            <SelectField label="Country" value={p.country} options={COUNTRIES.map(([c, n]) => [c, n] as const)} onChange={country => setP(x => ({ ...x, country, region: defaultRegion(country) }))} />
            {regions.length > 1 && (
              <SelectField label={REGION_TITLE[p.country] || 'Region'} value={p.region}
                options={[...(BUILT_IN.includes(p.country) ? [] : [['', `All of ${countryName(p.country)}`] as const]), ...regions.map(r => [r.id, r.name] as const)]}
                onChange={region => setP(x => ({ ...x, region }))} />
            )}
            <SelectField label="Week starts on" value={p.weekStart} options={WEEKSTART} onChange={weekStart => { setP(x => ({ ...x, weekStart })); setRot(r => ({ ...r, ws: weekStart })); }} />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Your rotation</h1>
          <p className="text-fg-muted">Paint the shifts you work. It repeats on its own, so you only do this once.</p>
          <RotationEditor draft={rot} setDraft={setRot} shifts={p.shifts} />
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">How do you get paid?</h1>
          <p className="text-fg-muted">We use this to mark pay days and track your leave.</p>
          <div className="card space-y-3 p-3">
            <SelectField label="Pay frequency" value={p.payFreq || 'biweekly'} options={PAY_FREQ_OPTIONS} onChange={payFreq => setP(x => ({ ...x, payFreq }))} />
            {p.payFreq === 'semimonthly'
              ? <p className="text-xs text-fg-muted">Pay days start as the 15th and the last day of each month. Change them later in Settings, Pay.</p>
              : <Field label={p.payFreq === 'monthly' ? 'A pay date (its day repeats each month)' : 'A pay date you know'} hint="Every pay day is counted from this date.">{id => <input id={id} type="date" className="field" data-testid="setup-payanchor" value={p.payAnchor} onChange={e => setP(x => ({ ...x, payAnchor: e.target.value }))} />}</Field>}
          </div>
          <div className="card space-y-3 p-3">
            <h2 className="font-semibold">Leave balances</h2>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={`Vacation left (${vac.unit === 'd' ? 'days' : 'hours'})`} value={vac.balance} data-testid="setup-vac" onChange={v => setBank(vac.id, b => ({ ...b, balance: Number(v) || 0, asOf: today }))} />
              <NumberField label={`Sick left (${sick.unit === 'd' ? 'days' : 'hours'})`} value={sick.balance} data-testid="setup-sick" onChange={v => setBank(sick.id, b => ({ ...b, balance: Number(v) || 0, asOf: today }))} />
            </div>
            <p className="text-xs text-fg-muted">Find these on your latest pay stub. Other banks, such as banked overtime, are under Leave later.</p>
            <Toggle label="Added a little each pay day" hint="Most workplaces" on={vac.earn.rule === 'pay'} testId="setup-earn" onChange={on => setBank(vac.id, b => ({ ...b, earn: { ...b.earn, rule: on ? 'pay' : 'none' } }))} />
            {vac.earn.rule === 'pay' && <NumberField label="Vacation added each pay day" value={vac.earn.amount} step="0.01" onChange={v => setBank(vac.id, b => ({ ...b, earn: { ...b.earn, amount: Number(v) || 0 } }))} />}
            <Toggle label="Whole year added at once" hint="Some workplaces add the full year on one date" on={vac.grant.on} testId="setup-grant" onChange={on => setBank(vac.id, b => ({ ...b, grant: { ...b.grant, on } }))} />
            {vac.grant.on && (
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Vacation per year" value={vac.grant.amount || ''} step="0.5" onChange={v => setBank(vac.id, b => ({ ...b, grant: { ...b.grant, amount: Number(v) || 0 } }))} />
                <Field label="Added on (every year)">{id => <input id={id} type="date" className="field" value={`${year}-${vac.grant.date}`} onChange={e => { if (e.target.value) setBank(vac.id, b => ({ ...b, grant: { ...b.grant, date: e.target.value.slice(5) } })); }} />}</Field>
              </div>
            )}
          </div>
          {err && <Note tone="error">{err}</Note>}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">You are all set</h1>
          <p className="text-fg-muted">Here is what we saved. You can change anything later in Settings.</p>
          <dl className="card divide-y divide-line text-sm" data-testid="setup-summary">
            {([
              ['Rotation', p.patterns.length ? `Starts ${fmtDY(p.patterns[0].anchor)}` : 'Not set'],
              ['Holidays', p.country ? countryName(p.country) : 'None'],
              ['Next shift', ns ? `${fmtD(ns.d)} · ${ns.code}` : 'None yet'],
              ['Vacation', `${+vac.balance} ${vac.unit === 'd' ? 'days' : 'h'}`],
              ['Sick', `${+sick.balance} ${sick.unit === 'd' ? 'days' : 'h'}`]
            ] as const).map(([k, v]) => <div key={k} className="flex justify-between p-3"><dt className="text-fg-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
          <Note>Tip: install this app from your browser menu so it opens like any other app. Export your shifts to Google Calendar from Settings for reminders.</Note>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl"><button type="button" className="btn btn-primary w-full" disabled={saving} data-testid="setup-next" onClick={() => { void next(); }}>{step === 4 ? 'Open my calendar' : 'Continue'}</button></div>
      </div>
    </div>
  );
}
