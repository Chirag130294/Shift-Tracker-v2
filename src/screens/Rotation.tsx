import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { Field, Note, Page, Section, SelectField, Seg, ShiftBadge, ask } from '../components/ui';
import { useToast } from '../components/Toast';
import { useData } from '../state/DataContext';
import {
  SWATCH, alignedAnchor, applyTemplate, blankDraft, blankShift, commitRotation, deleteShift, draftFrom, initDraft, resizeDays, saveShift, setMode,
  type RotDraft, type RotTemplate, type ShiftDraft
} from '../state/rotation';
import * as E from '../utils/engine';
import { DOWL, DOWS, fmtDY, fmtH, fmtMD } from '../utils/format';
import { cn } from '../utils/cn';
import { inkFor } from '../utils/color';
import type { Pattern, Shift } from '../types';

const WEEKS = Array.from({ length: 52 }, (_, k) => [k + 1, `${k + 1} week${k ? 's' : ''}`] as const);
const DAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Paint a repeating schedule. Used by first-time setup and by the Rotation screen. */
export function RotationEditor({ draft, setDraft, shifts }: { draft: RotDraft; setDraft: Dispatch<SetStateAction<RotDraft>>; shifts: readonly Shift[] }) {
  const byId = useMemo(() => Object.fromEntries(shifts.map(s => [s.id, s])), [shifts]);
  const nW = Math.ceil(draft.days.length / 7);
  const anchor = alignedAnchor(draft);
  const tmp = anchor ? [{ id: 'tmp', anchor, effectiveFrom: '1900-01-01', mode: draft.mode, days: draft.days }] satisfies Pattern[] : null;
  const pos = tmp ? E.rotationPosition(E.todayIso(), tmp) : null;
  const dayName = (k: number): string => DOWS[(draft.ws + k) % 7];
  const patch = (p: Partial<RotDraft>): void => setDraft(d => ({ ...d, ...p, err: '' }));
  const tpl = (k: RotTemplate): void => setDraft(d => applyTemplate(d, k, shifts[0]?.id ?? '').draft);
  const tools: [RotTemplate, string][] = [];
  if (draft.mode === 'week' && nW > 1) tools.push(['copy', 'Copy Week 1 to all'], ['above', 'Copy week above'], ['clearWeek', 'Clear week']);
  tools.push(['pitman', '2-2-3'], ['4on4off', '4 on 4 off'], ['clear', 'Clear all']);

  const previewStart = E.alignToWeekStart(E.todayIso(), draft.ws);
  return (
    <div className="space-y-4" data-testid="rotation-editor">
      <Seg label="Rotation type" value={draft.mode} options={[['week', 'Weekly rotation'], ['cycle', 'Day cycle']]} onChange={m => setDraft(d => setMode(d, m))} />

      {draft.mode === 'week' ? (
        <div className="card space-y-3 p-3">
          <SelectField label="Repeats every" value={nW} options={WEEKS} onChange={n => setDraft(d => ({ ...resizeDays({ ...d, mode: 'week' }, n * 7) }))} />
          <div>
            <div className="label mb-1">Week starts on</div>
            <div role="radiogroup" aria-label="Week starts on" className="flex gap-1">
              {DAY_INITIAL.map((l, v) => (
                <button key={v} type="button" role="radio" aria-checked={draft.ws === v} aria-label={DOWL[v]} data-testid={`rot-ws-${v}`}
                  className={cn('h-9 w-9 rounded-full border text-sm font-medium', draft.ws === v ? 'border-accent-emphasis bg-accent-emphasis text-white' : 'border-line')}
                  onClick={() => patch({ ws: v })}>{l}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-fg-muted">Your rotation week runs {DOWL[draft.ws]} to {DOWL[(draft.ws + 6) % 7]}.</p>
            {pos && <p className="mt-1 text-xs font-semibold text-accent">Today is in Week {pos.week} of {pos.weeks}</p>}
          </div>
        </div>
      ) : (
        <div className="card flex items-center gap-2 p-3">
          <span className="label flex-1">Days in the cycle</span>
          <button type="button" className="btn btn-icon" aria-label="One day shorter" onClick={() => setDraft(d => resizeDays(d, Math.max(2, d.days.length - 1)))}><Minus size={16} aria-hidden="true" /></button>
          <b className="min-w-8 text-center" data-testid="cycle-len">{draft.days.length}</b>
          <button type="button" className="btn btn-icon" aria-label="One day longer" onClick={() => setDraft(d => resizeDays(d, Math.min(28, d.days.length + 1)))}><Plus size={16} aria-hidden="true" /></button>
        </div>
      )}

      <div role="group" aria-label="Shift brush" className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!draft.brush} data-testid="brush-off" className={cn('btn btn-sm', !draft.brush && 'ring-2 ring-accent-emphasis')} onClick={() => patch({ brush: '' })}>Off</button>
        {shifts.map(s => (
          <button key={s.id} type="button" aria-pressed={draft.brush === s.id} data-testid={`brush-${s.code}`} aria-label={`Paint ${s.name}`}
            className={cn('rounded-md', draft.brush === s.id && 'ring-2 ring-accent-emphasis ring-offset-2 ring-offset-canvas')} onClick={() => patch({ brush: s.id })}><ShiftBadge code={s.code} color={s.color} big /></button>
        ))}
      </div>

      <div className="card max-h-[22rem] overflow-auto p-2" role="group" aria-label="All weeks">
        <div className="mb-1 grid grid-cols-[3.5rem_repeat(7,1fr)] gap-1 text-center text-xs font-semibold text-fg-muted">
          <span />{[0, 1, 2, 3, 4, 5, 6].map(k => <span key={k}>{draft.mode === 'week' ? dayName(k).slice(0, 2) : k + 1}</span>)}
        </div>
        {Array.from({ length: nW }, (_, w) => (
          <div key={w} className={cn('mb-1 grid grid-cols-[3.5rem_repeat(7,1fr)] gap-1 rounded-md', w === draft.page && 'bg-accent-subtle')}>
            <button type="button" className={cn('text-xs font-semibold', pos && draft.mode === 'week' && pos.week === w + 1 ? 'text-accent' : 'text-fg-muted')} aria-label={`Select row ${w + 1}`} onClick={() => patch({ page: w })}>
              {draft.mode === 'week' ? `Wk ${w + 1}` : `Day ${w * 7 + 1}`}
            </button>
            {Array.from({ length: 7 }, (_, k) => {
              const i = w * 7 + k;
              if (i >= draft.days.length) return <span key={k} />;
              const sh = byId[draft.days[i]];
              return (
                <button key={k} type="button" data-testid={`rot-cell-${i}`}
                  aria-label={`${draft.mode === 'week' ? `Week ${w + 1} ${DOWL[(draft.ws + k) % 7]}` : `Day ${i + 1}`}, ${sh ? sh.name : 'off'}`}
                  className="h-10 rounded-md border border-line text-xs font-semibold" style={sh ? { background: sh.color, color: inkFor(sh.color), borderColor: 'transparent' } : undefined}
                  onClick={() => setDraft(d => ({ ...d, days: d.days.map((v, j) => (j === i ? d.brush : v)), page: w, err: '' }))}>{sh ? sh.code : 'Off'}</button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">{tools.map(([k, l]) => <button key={k} type="button" className="btn btn-sm" data-testid={`tpl-${k}`} onClick={() => tpl(k)}>{l}</button>)}</div>

      <div className="card space-y-1 p-3">
        <Field label={draft.mode === 'week' ? 'Week 1 starts' : 'Day 1 of the cycle is'} hint={draft.mode === 'week' ? (anchor ? `${fmtDY(anchor)} (a ${DOWL[draft.ws]})` : 'Pick any date inside your Week 1') : 'The date your first cycle day fell on'}>
          {id => <input id={id} type="date" className="field" data-testid="rot-anchor" value={draft.anchorInput} onChange={e => patch({ anchorInput: e.target.value })} />}
        </Field>
      </div>
      {pos && draft.mode !== 'week' && <p className="text-xs"><b>Today is in Day {pos.index + 1} of {draft.days.length}.</b></p>}
      {draft.isNew && anchor && <p className="text-xs text-fg-muted">The new schedule starts on {fmtDY(anchor)}. Earlier dates keep your old schedule.</p>}
      {draft.err && <Note tone="error">{draft.err}</Note>}

      {tmp ? (
        <div className="space-y-1">
          <Section>Preview, next 4 weeks</Section>
          <div className="space-y-1" data-testid="rot-preview">
            {[0, 1, 2, 3].map(w => {
              const d0 = E.addDays(previewStart, w * 7);
              return (
                <div key={w} className="grid grid-cols-[3.5rem_repeat(7,1fr)] items-center gap-1 text-center text-xs">
                  <span className="text-left text-fg-muted">{fmtMD(d0)}</span>
                  {[0, 1, 2, 3, 4, 5, 6].map(k => { const sh = byId[E.baseShiftId(E.addDays(d0, k), tmp)]; return <span key={k} className="rounded-sm py-1 font-semibold" style={sh ? { background: sh.color, color: inkFor(sh.color) } : undefined}>{sh ? sh.code : ''}</span>; })}
                </div>
              );
            })}
          </div>
        </div>
      ) : <p className="text-xs text-fg-muted">Choose the start date to see a preview.</p>}
    </div>
  );
}

export function RotationPage() {
  const { profile, saveProfile } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [draft, setDraft] = useState<RotDraft>(() => (profile ? initDraft(profile.patterns, profile.weekStart, profile.shifts[0].id) : blankDraft(0, '')));
  if (!profile) return null;
  const list = profile.patterns;
  const save = async (): Promise<void> => {
    const r = commitRotation(draft, list, Date.now());
    if ('error' in r) { setDraft(d => ({ ...d, err: r.error })); return; }
    if (await saveProfile({ patterns: r.patterns })) { toast.show('Rotation saved'); nav(-1); }
  };
  const remove = async (id: string): Promise<void> => {
    if (!ask('Delete this schedule? Dates it covered will use the schedule before it.')) return;
    const patterns = list.filter(p => p.id !== id);
    if (await saveProfile({ patterns })) setDraft(initDraft(patterns, profile.weekStart, profile.shifts[0].id));
  };
  return (
    <Page title="Rotation" backTo="" footer={<button type="button" className="btn btn-primary w-full" data-testid="rot-save" onClick={() => { void save(); }}>Save rotation</button>}>
      <p className="text-fg-muted">Paint your repeating schedule. We work out every future day from it.</p>
      {list.length > 1 && (
        <div className="space-y-1">
          <Section>Your schedules</Section>
          <div className="card divide-y divide-line">
            {list.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-3">
                <span className="flex-1 text-sm font-medium">{p.effectiveFrom < '1901' ? 'First schedule' : `From ${fmtDY(p.effectiveFrom)}`}{draft.id === p.id ? ' (editing)' : ''}</span>
                <button type="button" className="btn btn-sm" onClick={() => setDraft(draftFrom(p, profile.weekStart, profile.shifts[0].id))}>Edit</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => { void remove(p.id); }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <RotationEditor draft={draft} setDraft={setDraft} shifts={profile.shifts} />
      <button type="button" className="btn w-full" data-testid="rot-new" onClick={() => { setDraft({ ...blankDraft(profile.weekStart, profile.shifts[0].id), isNew: true }); toast.show('Paint the new schedule and choose when it starts'); }}>My employer gave me a new schedule</button>
    </Page>
  );
}

export function ShiftsPage() {
  const { profile } = useData();
  const nav = useNavigate();
  if (!profile) return null;
  return (
    <Page title="Shift library" backTo="">
      <p className="text-fg-muted">These are the shifts you can paint into your rotation. Codes can be up to 3 characters and must be different from each other.</p>
      <div className="space-y-2">
        {profile.shifts.map(s => (
          <button key={s.id} type="button" className="card flex w-full items-center gap-3 p-3 text-left hover:bg-canvas-subtle" data-testid={`shift-${s.code}`} onClick={() => nav(`/settings/shifts/${s.id}`)}>
            <ShiftBadge code={s.code} color={s.color} big />
            <span className="min-w-0 flex-1"><b className="block">{s.name}</b><span className="text-xs text-fg-muted">{s.start} to {s.end} · {fmtH(E.paidHours(s))} paid</span></span>
          </button>
        ))}
      </div>
      <button type="button" className="btn w-full border-dashed" data-testid="shift-add" onClick={() => nav('/settings/shifts/new')}><Plus size={16} aria-hidden="true" /> Add a shift</button>
      <Note>A night shift belongs to the day it starts. A PM on Monday shows on Monday and ends Tuesday at 07:00. Changing a code updates every day that uses it.</Note>
    </Page>
  );
}

export function ShiftEditPage() {
  const { shiftId = 'new' } = useParams();
  const { profile, saveProfile } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const existing = profile?.shifts.find(s => s.id === shiftId);
  const [d, setD] = useState<ShiftDraft>(() => (existing ? { ...existing } : blankShift()));
  const [err, setErr] = useState('');
  if (!profile) return null;
  if (shiftId !== 'new' && !existing) return <Page title="Shift" backTo=""><Note>This shift no longer exists.</Note></Page>;
  const set = <K extends keyof ShiftDraft>(k: K, v: ShiftDraft[K]): void => { setD(x => ({ ...x, [k]: v })); setErr(''); };
  const paid = E.paidHours({ start: d.start || '00:00', end: d.end || '00:00', brk: Number(d.brk) || 0 });
  const save = async (): Promise<void> => {
    const r = saveShift(d, profile.shifts, Date.now());
    if ('error' in r) { setErr(r.error); return; }
    if (await saveProfile({ shifts: r.shifts })) { toast.show('Shift saved'); nav(-1); }
  };
  const remove = async (): Promise<void> => {
    const r = deleteShift(d.id, profile.shifts, profile.patterns);
    if ('error' in r) { setErr(r.error); return; }
    if (!ask('Delete this shift?')) return;
    if (await saveProfile({ shifts: r.shifts })) nav(-1);
  };
  return (
    <Page title={d.id ? 'Edit shift' : 'New shift'} backTo="" footer={<button type="button" className="btn btn-primary w-full" data-testid="shift-save" onClick={() => { void save(); }}>Save shift</button>}>
      <div className="card space-y-3 p-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">{id => <input id={id} className="field" maxLength={40} value={d.name} data-testid="shift-name" onChange={e => set('name', e.target.value)} />}</Field>
          <Field label="Code (up to 3)">{id => <input id={id} className="field" maxLength={3} autoCapitalize="characters" value={d.code} data-testid="shift-code" onChange={e => set('code', e.target.value)} />}</Field>
          <Field label="Starts">{id => <input id={id} type="time" className="field" value={d.start} onChange={e => set('start', e.target.value)} />}</Field>
          <Field label="Ends">{id => <input id={id} type="time" className="field" value={d.end} onChange={e => set('end', e.target.value)} />}</Field>
        </div>
        <Field label="Unpaid break (minutes)">{id => <input id={id} type="number" inputMode="numeric" min={0} max={240} className="field" value={d.brk} onChange={e => set('brk', e.target.value === '' ? '' : Number(e.target.value))} />}</Field>
        <div>
          <div className="label mb-1">Colour</div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
            {SWATCH.map(c => <button key={c} type="button" role="radio" aria-checked={c.toLowerCase() === d.color.toLowerCase()} aria-label={`Colour ${c}`} className={cn('h-8 w-8 rounded-full border-2', c.toLowerCase() === d.color.toLowerCase() ? 'border-fg' : 'border-transparent')} style={{ background: c }} onClick={() => set('color', c)} />)}
            <input type="color" aria-label="Pick another colour" value={d.color} onChange={e => set('color', e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-line bg-canvas" />
          </div>
        </div>
        <Note>{fmtH(paid)} paid{E.crossesMidnight({ start: d.start || '00:00', end: d.end || '00:00' }) ? ' · ends the next day' : ''}</Note>
      </div>
      {err && <Note tone="error">{err}</Note>}
      {d.id && <button type="button" className="btn btn-danger w-full" data-testid="shift-delete" onClick={() => { void remove(); }}>Delete this shift</button>}
    </Page>
  );
}
