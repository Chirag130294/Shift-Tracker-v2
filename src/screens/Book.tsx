// Book a range of days off, taken from one bank or split across two (v1.6 VIEWS.book / bkSave).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field, Note, NumberField, Page, SelectField, Toggle } from '../components/ui';
import { useToast } from '../components/Toast';
import { describeError, useData } from '../state/DataContext';
import { StorageKey, StorageService } from '../services/StorageService';
import * as B from '../utils/banks';
import * as E from '../utils/engine';
import { fmtD, fmtH } from '../utils/format';
import type { DateStr, DayDoc } from '../types';

interface BookDay { d: DateStr; h: number; code: string }
const CLEAR: (keyof DayDoc)[] = ['type', 'shiftId', 'hours', 'person', 'bank', 'splits', 'toBank'];

export function BookPage() {
  const { profile, ctx, days, stat, backend, user } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const today = E.todayIso();
  const last = StorageService.get(StorageKey.USER_PREFS)?.lastBank;
  const [bankId, setBank] = useState(() => (profile && last && B.bankById(profile.banks, last) ? last : 'vac'));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [split, setSplit] = useState(false);
  const [bank2Id, setBank2] = useState('');
  const [hA, setHA] = useState<number | ''>('');
  const list = useMemo<BookDay[]>(() => {
    if (!ctx || !from || !to || to < from) return [];
    const out: BookDay[] = [];
    for (let n = E.dayNum(from); n <= E.dayNum(to) && out.length < 60; n++) {
      const d = E.fromDayNum(n), i = E.dayInfo(d, ctx);
      if (i.base) out.push({ d, h: i.baseHours, code: ctx.shifts[i.base]?.code ?? '?' });
    }
    return out;
  }, [ctx, from, to]);
  if (!profile || !backend || !user) return null;
  const bank = B.bankById(profile.banks, bankId) ?? profile.banks[0];
  const bank2 = split ? B.bankById(profile.banks, bank2Id) : null;
  const total = list.reduce((a, x) => a + x.h, 0);
  const sA = split ? Math.max(0, Math.min(total, Number(hA) || 0)) : total, sB = total - sA;
  const st = stat(bank.id);
  let msg: { text: string; warn: boolean };
  if (to < from) msg = { text: 'The last day must be on or after the first day.', warn: true };
  else if (!list.length) msg = { text: 'You are off on every day in this range, so there is nothing to book.', warn: true };
  else {
    const after = st.after - B.toUnit(bank, sA);
    let t = `${list.length} working shift${list.length === 1 ? '' : 's'} in this range, ${fmtH(total)} needed. Days you are already off are skipped. ${bank.name} available to book goes from ${B.fmtAmt(bank, st.after)} to ${B.fmtAmt(bank, after)}.`;
    if (bank2) { const s2 = stat(bank2.id); t += ` ${bank2.name} goes from ${B.fmtAmt(bank2, s2.after)} to ${B.fmtAmt(bank2, s2.after - B.toUnit(bank2, sB))}.`; }
    msg = { text: t, warn: false };
  }
  const save = async (): Promise<void> => {
    if (!list.length) return;
    let second = bank2;
    if (split) {
      if (!second) { toast.show('Choose the second bank'); return; }
      if (sA <= 0) { toast.show('Enter how many hours come from the first bank'); return; }
      if (sA >= total) second = null;
    }
    const entries: Record<DateStr, DayDoc> = {};
    for (const x of list) {
      const o: DayDoc = { ...(days[x.d] ?? {}) };
      for (const k of CLEAR) delete o[k];
      const type = B.typeForBank(bank);
      const doc: DayDoc = { ...o, type, hours: x.h };
      if (type === 'LEAVE') doc.bank = bank.id;
      if (second) {
        const a = Math.round(x.h * (sA / total) * 100) / 100;
        doc.splits = [{ bank: bank.id, h: a }, { bank: second.id, h: Math.round((x.h - a) * 100) / 100 }];
      }
      entries[x.d] = doc;
    }
    try { await backend.setDays(user.uid, entries); toast.show(`${list.length} day${list.length === 1 ? '' : 's'} booked`); nav(-1); } catch (e) { toast.show(describeError(e)); }
  };
  const pick = (id: string): void => {
    setBank(id);
    StorageService.update(StorageKey.USER_PREFS, c => ({ ...(c ?? {}), lastBank: id }));
    if (bank2Id === id) setBank2('');
  };
  const banks = profile.banks.map(b => [b.id, b.name] as const);
  return (
    <Page title="Book time off" backTo="" footer={<button type="button" className="btn btn-primary w-full" disabled={!list.length} data-testid="book-save" onClick={() => { void save(); }}>Book {list.length || ''} day{list.length === 1 ? '' : 's'}</button>}>
      <div className="card grid grid-cols-2 gap-3 p-3">
        <Field label="First day">{id => <input id={id} type="date" className="field" data-testid="book-from" value={from} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />}</Field>
        <Field label="Last day">{id => <input id={id} type="date" className="field" data-testid="book-to" value={to} onChange={e => setTo(e.target.value)} />}</Field>
      </div>
      {list.length > 0 && (
        <div className="card space-y-2 p-3" data-testid="book-tiles">
          <div className="flex justify-between"><b>Your shifts in this range</b><span className="text-xs text-fg-muted">{list.length} shift{list.length === 1 ? '' : 's'}</span></div>
          <div className="flex flex-wrap gap-2">{list.slice(0, 7).map(x => <div key={x.d} className="rounded-md border border-line px-2 py-1 text-center text-xs"><span className="block text-fg-muted">{fmtD(x.d).slice(0, 8)}</span><b>{x.code}</b> <small>{+x.h} h</small></div>)}</div>
          {list.length > 7 && <p className="text-xs text-fg-muted">and {list.length - 7} more</p>}
        </div>
      )}
      <div className="card space-y-3 p-3">
        <SelectField label="Take it from" value={bank.id} options={banks} onChange={pick} />
        <Toggle label="Split across two banks" hint="For example vacation plus overtime" on={split} testId="book-split" onChange={on => { setSplit(on); if (on && !bank2Id) setBank2(profile.banks.find(b => b.id !== bank.id)?.id ?? ''); }} />
        {split && (
          <>
            <NumberField label={`Hours from ${bank.name}`} value={hA} step="0.25" data-testid="book-ha" onChange={setHA} />
            <SelectField label="Rest comes from" value={bank2Id} options={[['', 'Choose a bank'] as const, ...banks.filter(b => b[0] !== bank.id)]} onChange={setBank2} />
          </>
        )}
      </div>
      <Note tone={msg.warn ? 'warn' : 'info'}>{msg.text}</Note>
    </Page>
  );
}
