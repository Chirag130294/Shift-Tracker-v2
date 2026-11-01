// Add or edit a leave bank (v1.6 VIEWS.bankEdit).
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Field, Note, NumberField, Page, Seg, TextField, Toggle, ask } from '../components/ui';
import { useToast } from '../components/Toast';
import { useData } from '../state/DataContext';
import * as B from '../utils/banks';
import * as E from '../utils/engine';
import { MON, fmtMD } from '../utils/format';
import { cn } from '../utils/cn';
import type { Bank } from '../types';

const blank = (): Bank => ({ id: '', name: '', short: '', kind: 'custom', unit: 'd', dayHours: 7.5, color: B.BANK_COLORS[4], balance: 0, asOf: E.todayIso(), earn: { rule: 'none', amount: 0 }, grant: { on: false, amount: 0, date: '01-01' }, reset: false });
const PROTECTED = ['vac', 'sick', 'bank', 'lieu'];

export function BankEditPage() {
  const { bankId = 'new' } = useParams();
  const { profile, days, saveProfile } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const isNew = bankId === 'new';
  const existing = profile?.banks.find(b => b.id === bankId);
  const [b, setB] = useState<Bank>(() => (existing ? { ...existing, earn: { ...existing.earn }, grant: { ...existing.grant } } : blank()));
  const [err, setErr] = useState('');
  const [more, setMore] = useState(false);
  const set = (p: Partial<Bank>): void => { setB(x => ({ ...x, ...p })); setErr(''); };
  const next = useMemo(() => B.normBank({ ...b, id: b.id || 'tmp', name: b.name || 'Bank' }), [b]);
  const preview = useMemo(() => {
    if (!profile) return { avail: 0, chips: [] as string[] };
    const L = B.ledger(next, { profile, days }, E.todayIso());
    const chips: string[] = [];
    for (const r of L.rows) {
      if (!r.future || !(r.kind === 'earn' || r.kind === 'credit')) continue;
      const grant = r.title === 'Yearly amount added';
      chips.push(`${fmtMD(r.date)} · +${B.fmtAmt(next, r.amt)}${grant && next.reset ? ', unused lost' : ''}`);
      if (chips.length >= 2) break;
    }
    return { avail: L.available, chips };
  }, [next, profile, days]);
  if (!profile) return null;
  if (!isNew && !existing) return <Page title="Bank" backTo=""><Note>This bank no longer exists.</Note></Page>;
  const u = b.unit === 'd' ? 'days' : 'hours', earnOn = b.earn.rule !== 'none';
  const gm = +b.grant.date.slice(0, 2), gd = +b.grant.date.slice(3);
  const save = async (): Promise<void> => {
    const name = b.name.trim();
    if (!name) return setErr('Give the bank a name.');
    if (profile.banks.some(x => x.id !== b.id && x.name.trim().toLowerCase() === name.toLowerCase())) return setErr('Another bank already has this name.');
    if (!b.asOf) return setErr('Choose the date your balance is for.');
    const rec = B.normBank({ ...b, id: b.id || `b${Date.now().toString(36)}`, name, short: isNew || !b.short ? name.slice(0, 4).toUpperCase() : b.short });
    const banks = isNew ? [...profile.banks, rec] : profile.banks.map(x => (x.id === b.id ? rec : x));
    if (await saveProfile({ banks })) { toast.show('Bank saved'); nav(-1); }
  };
  const remove = async (): Promise<void> => {
    if (Object.values(days).some(o => B.daySplits(o).some(sp => sp.bank === b.id))) return setErr('Time off is booked from this bank. Remove those days first.');
    if (!ask('Delete this bank?')) return;
    if (await saveProfile({ banks: profile.banks.filter(x => x.id !== b.id) })) nav('/leave', { replace: true });
  };
  return (
    <Page title={isNew ? 'Add a bank' : 'Edit bank'} backTo="" footer={<button type="button" className="btn btn-primary w-full" data-testid="bank-save" onClick={() => { void save(); }}>Save bank</button>}>
      <div className="card p-3" style={{ borderLeft: `4px solid ${b.color}` }} data-testid="bank-preview">
        <div className="text-xs font-semibold text-fg-muted">AVAILABLE TO BOOK</div>
        <div className="text-2xl font-semibold">{B.fmtAmt(next, preview.avail)}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">{preview.chips.map(c => <span key={c} className="rounded-full bg-canvas-inset px-2 text-xs">{c}</span>)}</div>
      </div>
      <div className="card space-y-3 p-3">
        <TextField label="Name" value={b.name} maxLength={30} data-testid="bank-name" onChange={name => set({ name })} />
        <div><div className="label mb-1">Count in</div><Seg label="Count in" value={b.unit} options={[['h', 'Hours'], ['d', 'Days']]} onChange={unit => set({ unit })} /></div>
        <div><div className="label mb-1">Colour</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">{B.BANK_COLORS.map(c => <button key={c} type="button" role="radio" aria-checked={c.toLowerCase() === b.color.toLowerCase()} aria-label={`Colour ${c}`} className={cn('h-8 w-8 rounded-full border-2', c.toLowerCase() === b.color.toLowerCase() ? 'border-fg' : 'border-transparent')} style={{ background: c }} onClick={() => set({ color: c })} />)}</div></div>
        {b.unit === 'd' && <NumberField label="One day counts as (hours)" value={b.dayHours} step="0.25" min={1} onChange={v => set({ dayHours: Number(v) || 7.5 })} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Balance now (${u})`}>{id => <input id={id} type="number" inputMode="decimal" step="0.25" className="field" data-testid="bank-balance" value={b.balance} onChange={e => set({ balance: Number(e.target.value) || 0 })} />}</Field>
          <Field label="As of">{id => <input id={id} type="date" className="field" value={b.asOf} onChange={e => set({ asOf: e.target.value })} />}</Field>
        </div>
      </div>
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">How it fills up · use either or both</h2>
      <div className="card space-y-3 p-3">
        <Toggle label="A little each pay day" hint={b.earn.rule === 'month' ? 'Added on the 1st of each month' : 'Added on every pay day'} on={earnOn} testId="bank-earn" onChange={on => set({ earn: { ...b.earn, rule: on ? 'pay' : 'none' } })} />
        {earnOn && (
          <>
            <NumberField label={`Added each time (${u})`} value={b.earn.amount} onChange={v => set({ earn: { ...b.earn, amount: Number(v) || 0 } })} />
            <Seg label="When" value={b.earn.rule} options={[['pay', 'Each pay day'], ['month', 'Each month']]} onChange={rule => set({ earn: { ...b.earn, rule } })} />
          </>
        )}
      </div>
      <div className="card space-y-3 p-3">
        <Toggle label="Whole year at once" hint="The full year lands on one date" on={b.grant.on} testId="bank-grant" onChange={on => set({ grant: { ...b.grant, on } })} />
        {b.grant.on && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label={`${u} per year`} value={b.grant.amount} step="0.25" onChange={v => set({ grant: { ...b.grant, amount: Number(v) || 0 } })} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Month">{id => <select id={id} className="field" value={gm} onChange={e => set({ grant: { ...b.grant, date: `${E.pad(Number(e.target.value))}-${b.grant.date.slice(3)}` } })}>{MON.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}</select>}</Field>
                <Field label="Day">{id => <select id={id} className="field" value={gd} onChange={e => set({ grant: { ...b.grant, date: `${b.grant.date.slice(0, 2)}-${E.pad(Number(e.target.value))}` } })}>{Array.from({ length: 31 }, (_, k) => k + 1).map(d => <option key={d} value={d}>{d}</option>)}</select>}</Field>
              </div>
            </div>
            <Toggle label="Lose unused time on that date" hint="Leftover is cleared, then the new amount is added" on={b.reset} onChange={reset => set({ reset })} />
          </>
        )}
      </div>
      {b.id === 'vac' && (
        <>
          <button type="button" className="btn w-full" aria-expanded={more} onClick={() => setMore(m => !m)}>Yearly amount and carry-over</button>
          {more && (
            <div className="card space-y-3 p-3">
              <NumberField label="Vacation per year" value={profile.vacYearly} hint="Shows how much of the year is left on the Leave tab." onChange={v => { void saveProfile({ vacYearly: Number(v) || 0 }); }} />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Most you can carry over" value={profile.carryLimit} step="0.5" onChange={v => { void saveProfile({ carryLimit: v }); }} />
                <Field label="Year-end deadline">{id => <input id={id} type="date" className="field" value={profile.deadline} onChange={e => { void saveProfile({ deadline: e.target.value }); }} />}</Field>
              </div>
              <p className="text-xs text-fg-muted">Fill both to get a use-it-or-lose-it warning.</p>
            </div>
          )}
        </>
      )}
      {err && <Note tone="error">{err}</Note>}
      {!isNew && !PROTECTED.includes(b.id) && <button type="button" className="btn btn-danger w-full" data-testid="bank-delete" onClick={() => { void remove(); }}>Delete this bank</button>}
    </Page>
  );
}
