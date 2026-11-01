// Record a shift you gave away, picked up, or worked extra (v1.6 VIEWS.swap). This is your own record; asking a
// colleague in the app is under Settings, Calendars shared with me.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Field, Note, Page, Seg, ShiftBadge, TextField } from '../components/ui';
import { useToast } from '../components/Toast';
import { useData } from '../state/DataContext';
import { withoutTypeKeys } from '../services/dayDoc';
import * as E from '../utils/engine';
import { fmtD, fmtH, fmtMD } from '../utils/format';

type Mode = 'gave' | 'took' | 'extra';
const MODES: readonly (readonly [Mode, string])[] = [['gave', 'I gave a shift'], ['took', 'I took a shift'], ['extra', 'Extra shift']];

export function SwapLogPage() {
  const params = useParams();
  const { profile, ctx, days, commitDay } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [date, setDate] = useState(params.date ?? E.todayIso());
  const [mode, setMode] = useState<Mode>(params.mode === 'took' || params.mode === 'extra' ? params.mode : 'gave');
  const [person, setPerson] = useState('');
  const [note, setNote] = useState('');
  const [shiftId, setShiftId] = useState('');
  if (!profile || !ctx) return null;
  const i = E.dayInfo(date, ctx), bsh = ctx.shifts[i.base];
  const pick = ctx.shifts[shiftId] ?? profile.shifts[0];
  const hist = Object.entries(days).filter(([, o]) => o.type === 'SWAP_OUT' || o.type === 'SWAP_IN' || o.type === 'EXTRA').sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 20);
  const save = (): void => {
    if (!date) { toast.show('Choose a date'); return; }
    if (mode === 'gave') {
      if (!i.base) { toast.show('You are not scheduled to work on that date.'); return; }
      commitDay(date, o => ({ ...withoutTypeKeys(o), type: 'SWAP_OUT', shiftId: i.base, hours: i.baseHours, person: person.trim(), note: note.trim() || o.note }));
    } else {
      commitDay(date, o => ({ ...withoutTypeKeys(o), type: mode === 'took' ? 'SWAP_IN' : 'EXTRA', shiftId: pick.id, hours: E.paidHours(pick), person: mode === 'took' ? person.trim() : '', note: note.trim() || o.note }));
    }
    toast.show('Swap saved');
    nav(-1);
  };
  return (
    <Page title="Swap or extra shift" backTo="" footer={<button type="button" className="btn btn-primary w-full" data-testid="swaplog-save" onClick={save}>Save</button>}>
      <Seg label="What happened" value={mode} options={MODES} onChange={setMode} />
      <div className="card space-y-3 p-3">
        <Field label="Date">{id => <input id={id} type="date" className="field" data-testid="swaplog-date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        {mode === 'gave' ? (
          <>
            {bsh ? <div className="flex items-center gap-3"><ShiftBadge code={bsh.code} color={bsh.color} big /><span><b>{fmtD(date)}</b><span className="block text-xs text-fg-muted">{bsh.start} to {bsh.end} · {fmtH(i.baseHours)}</span></span></div>
              : <Note tone="warn">You are not scheduled to work on this date. Pick another date.</Note>}
            <TextField label="Given to" value={person} maxLength={100} onChange={setPerson} />
          </>
        ) : (
          <>
            <div><div className="label mb-1">Shift</div><div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Shift">{profile.shifts.map(s => <button key={s.id} type="button" role="radio" aria-checked={s.id === pick.id} className={s.id === pick.id ? 'rounded-md ring-2 ring-accent-emphasis ring-offset-2 ring-offset-canvas' : ''} onClick={() => setShiftId(s.id)}><ShiftBadge code={s.code} color={s.color} big /></button>)}</div>
              <p className="mt-1 text-xs text-fg-muted">{pick.name} · {pick.start} to {pick.end} · {fmtH(E.paidHours(pick))} paid</p></div>
            {mode === 'took' && <TextField label="Picked up from" value={person} maxLength={100} onChange={setPerson} />}
          </>
        )}
        <TextField label="Note (optional)" value={note} maxLength={200} placeholder="Paying back on Dec 19" onChange={setNote} />
      </div>
      <Note>{mode === 'gave' ? (bsh ? `Hours: -${fmtH(i.baseHours)}. ${fmtMD(date)} will show a swap marker.` : '') : `Hours: +${fmtH(E.paidHours(pick))}.${i.isWorking ? ` You already work a ${ctx.shifts[i.work]?.code ?? ''} shift on this date, this replaces it.` : ''}`}</Note>
      <Link to="/settings/following" className="btn w-full"><Users size={16} aria-hidden="true" /> Ask a colleague to swap with me in the app</Link>
      <h2 className="font-semibold">Swap history</h2>
      <div className="card divide-y divide-line" data-testid="swap-history">
        {hist.length ? hist.map(([d, o]) => { const sh = ctx.shifts[o.shiftId ?? '']; return (
          <Link key={d} to={`/?d=${d}`} className="flex items-center gap-3 p-3 hover:bg-canvas-subtle">{sh ? <ShiftBadge code={sh.code} color={sh.color} /> : <span className="text-xs">?</span>}
            <span className="min-w-0 flex-1"><b className="block text-sm">{fmtD(d)}</b><span className="text-xs text-fg-muted">{o.type === 'SWAP_OUT' ? `Given away${o.person ? ` to ${o.person}` : ''}` : o.type === 'SWAP_IN' ? `Picked up${o.person ? ` from ${o.person}` : ''}` : 'Extra shift'}</span></span></Link>
        ); }) : <p className="p-3 text-fg-muted">No swaps or extra shifts yet.</p>}
      </div>
    </Page>
  );
}
