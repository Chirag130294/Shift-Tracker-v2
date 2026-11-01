// Settings: a short menu with one topic per screen (v1.6 views-settings.js).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Download, Flag, Globe, Library, Monitor, Plus, Repeat, Share2, Shield, Trash2, UserRound, Users, Wallet, X } from 'lucide-react';
import { Empty, Field, MenuGroup, MenuRow, Note, Page, Section, SelectField, Seg, TextField, Toggle, ask } from '../components/ui';
import { useToast } from '../components/Toast';
import { describeError, useData } from '../state/DataContext';
import { useSocial } from '../state/SocialContext';
import { holidayList, lieuInfo, lvOf } from '../state/derive';
import { defaultRegion } from '../state/profile';
import { PAY_FREQ_LABEL } from '../state/options';
import { StorageKey, StorageService, type ExportPrefs, type ExportRange } from '../services/StorageService';
import * as E from '../utils/engine';
import { BUILT_IN, REGIONS, REGION_TITLE, cachedList, ensureList, regionLabel, regionsOf } from '../utils/holidays';
import { COUNTRIES, countryName } from '../utils/countries';
import { DOWL, MON, fmtD, fmtDY, fmtMD, shortT } from '../utils/format';
import { buildIcs, collectEvents, diffExport } from '../utils/ics';
import { cn } from '../utils/cn';
import type { Profile } from '../types';

export const VERSION = '2.0';
const WEEKSTART = DOWL.map((d, i) => [i, d] as const);
const placeText = (p: Profile): string => {
  if (!p.country) return 'None';
  const reg = (REGIONS[p.country] ?? []).find(r => r.id === p.region);
  const r = reg ? reg.name : p.region ? regionLabel(p.region) : '';
  return r && p.region !== 'US' ? `${countryName(p.country)} · ${r}` : countryName(p.country);
};

interface InstallEvent extends Event { prompt: () => Promise<void> }
const isInstallEvent = (e: Event): e is InstallEvent => 'prompt' in e;

export function SettingsHub() {
  const { profile, user } = useData();
  const { viewers, following, unread } = useSocial();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const on = (e: Event): void => { e.preventDefault(); if (isInstallEvent(e)) setInstall(e); };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  if (!profile || !user) return null;
  const nv = Object.values(viewers), nf = Object.keys(following).length;
  const cur = E.patternFor(E.todayIso(), profile.patterns) || profile.patterns[profile.patterns.length - 1];
  const rot = cur ? (cur.mode === 'week' ? `${cur.days.length / 7}-week rotation` : `${cur.days.length}-day cycle`) : 'Not set up yet';
  const L = profile.holidayLieu;
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return (
    <Page title="Settings">
      <MenuGroup><MenuRow to="/settings/profile" icon={UserRound} title={profile.name || user.email} sub={`Signed in as ${user.email}`} testId="set-profile" /></MenuGroup>
      {!standalone && <Note>{install ? <button type="button" className="btn btn-primary" onClick={() => { void install.prompt(); setInstall(null); }}>Install on this phone</button> : <>To install: in Chrome open the menu, then <b>Install app</b> or <b>Add to Home screen</b>.</>}</Note>}
      <MenuGroup>
        <MenuRow to="/notifications" icon={Bell} title="Notifications" sub={unread ? `${unread} unread` : 'Swap requests and new colleagues'} badge={unread} testId="set-notices" />
        <MenuRow to="/settings/sharing" icon={Share2} title="Share my calendar" sub={nv.length ? `${nv.filter(v => v.active).length} of ${nv.length} colleague${nv.length === 1 ? '' : 's'} can see it` : 'Nobody yet'} testId="set-sharing" />
        <MenuRow to="/settings/following" icon={Users} title="Calendars shared with me" sub={nf ? `${nf} colleague${nf === 1 ? '' : 's'}` : 'None yet'} testId="set-following" />
      </MenuGroup>
      <MenuGroup>
        <MenuRow to="/settings/rotation" icon={Repeat} title="Rotation" sub={`${rot}${cur ? ` · starts ${fmtMD(cur.anchor)}` : ''}`} testId="set-rotation" />
        <MenuRow to="/settings/shifts" icon={Library} title="Shift library" sub={profile.shifts.map(s => s.code).join(', ')} testId="set-shifts" />
        <MenuRow to="/leave" icon={Wallet} title="Leave banks" sub={profile.banks.map(b => b.name).join(', ')} />
      </MenuGroup>
      <MenuGroup>
        <MenuRow to="/settings/holidays" icon={Flag} title="Holidays and lieu" sub={profile.showHolidays === false ? 'Hidden on the calendar' : L.on ? 'Lieu day earned automatically' : 'Add your own, set up lieu'} testId="set-holidays" />
        <MenuRow to="/settings/country" icon={Globe} title="Country and region" sub={placeText(profile)} testId="set-country" />
      </MenuGroup>
      <MenuGroup>
        <MenuRow to="/settings/pay" icon={Wallet} title="Pay" sub={`${profile.pay.rate > 0 ? 'Gross pay on · ' : 'Rate, premiums, sick pay · '}${PAY_FREQ_LABEL[profile.payFreq || 'biweekly']}`} testId="set-pay" />
        <MenuRow to="/settings/display" icon={Monitor} title="Calendar and display" sub={`Week starts ${DOWL[profile.weekStart]}`} testId="set-display" />
        <MenuRow to="/settings/export" icon={Download} title="Export shifts" sub="Send to Google Calendar or your phone" testId="set-export" />
      </MenuGroup>
      <MenuGroup><MenuRow to="/settings/data" icon={Shield} title="Your data" sub="Saved to your account and on this phone" testId="set-data" /></MenuGroup>
      <p className="text-center text-xs text-fg-muted">Shift Calendar · version {VERSION}</p>
    </Page>
  );
}

export function ProfilePage() {
  const { profile, user, saveProfile } = useData();
  const [name, setName] = useState(profile?.name ?? '');
  if (!profile || !user) return null;
  return (
    <Page title="Profile" backTo="">
      <div className="card space-y-2 p-3">
        <TextField label="Your name" value={name} maxLength={60} autoComplete="name" data-testid="profile-name" onChange={setName}
          onBlur={() => { if (name.trim() !== profile.name) void saveProfile({ name: name.trim() }); }} />
        <p className="text-xs text-fg-muted">Signed in as {user.email}. Colleagues you share with see this name.</p>
      </div>
    </Page>
  );
}

export function DisplayPage() {
  const { profile, saveProfile } = useData();
  if (!profile) return null;
  return (
    <Page title="Calendar and display" backTo="">
      <div className="card space-y-3 p-3">
        <SelectField label="Week starts on" value={profile.weekStart} options={WEEKSTART} onChange={weekStart => { void saveProfile({ weekStart }); }} />
        <div><div className="label mb-1">Calendar layout</div><Seg label="Calendar layout" value={profile.layout || 'auto'} options={[['auto', 'Automatic'], ['compact', 'One screen'], ['roomy', 'Scrolling']]} onChange={layout => { void saveProfile({ layout }); }} /></div>
      </div>
      <p className="text-xs text-fg-muted">Automatic fits the calendar on one screen on tall phones and scrolls on small ones. On a tablet or unfolded phone the day details open beside the calendar.</p>
    </Page>
  );
}

export function DataPage() {
  const { backend, user } = useData();
  const toast = useToast();
  if (!backend || !user) return null;
  const wipe = async (): Promise<void> => {
    if (!ask('Delete all your schedule data? This cannot be undone. Your login stays.')) return;
    try { await backend.social.wipe(user.uid); toast.show('Data deleted'); } catch (e) { toast.show(describeError(e)); }
  };
  const del = async (): Promise<void> => {
    if (!ask('Delete your account and all your data? This cannot be undone.')) return;
    try { await backend.social.wipe(user.uid); await backend.deleteAccount(); } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code.includes('requires-recent-login')) window.alert('Your data is deleted. For security, log out, log in again, then choose Delete my account once more to remove your login.');
      else toast.show(describeError(e));
    }
  };
  return (
    <Page title="Your data" backTo="">
      <div className="card p-3"><p className="text-fg-muted">Your schedule is saved to your account, and also kept on this phone so the app works offline.</p></div>
      <button type="button" className="btn btn-danger w-full" data-testid="wipe" onClick={() => { void wipe(); }}><Trash2 size={14} aria-hidden="true" /> Delete all my data</button>
      <button type="button" className="btn btn-danger w-full" data-testid="delete-account" onClick={() => { void del(); }}>Delete my account</button>
    </Page>
  );
}

// ---------- country and region ----------
export function CountryPage() {
  const { profile, saveProfile } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  if (!profile) return null;
  const cur = profile.country, query = q.trim().toLowerCase();
  const list = COUNTRIES.filter(([c, n]) => !query || n.toLowerCase().includes(query) || c.toLowerCase() === query);
  const pick = async (c: string): Promise<void> => {
    if (await saveProfile({ country: c, region: defaultRegion(c) })) nav(REGIONS[c] && REGIONS[c].length > 1 ? '/settings/region' : '/settings/holidays', { replace: true });
  };
  return (
    <Page title="Country" backTo="">
      <input type="search" className="field" placeholder={`Search ${COUNTRIES.length} countries`} aria-label="Search countries" data-testid="country-search" value={q} onChange={e => setQ(e.target.value)} />
      <div className="card divide-y divide-line" role="radiogroup" aria-label="Countries">
        {!query && <button type="button" role="radio" aria-checked={!cur} className="flex min-h-11 w-full items-center gap-3 px-3 text-left" onClick={() => { void pick(''); }}><span className="w-8 text-xs text-fg-muted">--</span><span className="flex-1">None (no holidays)</span>{!cur && <Check size={16} aria-hidden="true" />}</button>}
        {list.map(([c, n]) => (
          <button key={c} type="button" role="radio" aria-checked={c === cur} data-testid={`country-${c}`} className={cn('flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-canvas-subtle', c === cur && 'bg-accent-subtle')} onClick={() => { void pick(c); }}>
            <span className="w-8 text-xs font-semibold text-fg-muted">{c}</span><span className="flex-1">{n}</span>{c === cur && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
        {!list.length && <p className="p-4 text-center text-fg-muted">No match. Try another spelling.</p>}
      </div>
      <p className="text-xs text-fg-muted"><b>Holidays:</b> Canada and the United States are built in. Most other countries load from a free public holiday list the first time you pick them, then stay saved on your phone.</p>
    </Page>
  );
}

export function RegionPage() {
  const { profile, saveProfile } = useData();
  const nav = useNavigate();
  const y = E.parts(E.todayIso()).y;
  const country = profile?.country ?? '';
  useEffect(() => { if (country && !BUILT_IN.includes(country)) ensureList(country, y); }, [country, y]);
  if (!profile) return null;
  const list = regionsOf(country, y), ext = !BUILT_IN.includes(country);
  const opts = ext ? [{ id: '', name: `All of ${countryName(country)} (national holidays)` }, ...list] : list;
  return (
    <Page title={REGION_TITLE[country] || 'Region'} backTo="">
      <Section>{countryName(country)}</Section>
      {ext && !list.length ? (
        <div className="card p-3"><p className="text-fg-muted">{cachedList(country, y) ? 'This country has one list for everyone. Nothing to choose here.' : 'Loading the holiday list. This needs an internet connection the first time.'}</p></div>
      ) : (
        <div className="card divide-y divide-line" role="radiogroup" aria-label="Region">
          {opts.map(r => (
            <button key={r.id} type="button" role="radio" aria-checked={r.id === profile.region} data-testid={`region-${r.id || 'all'}`} className={cn('flex min-h-11 w-full items-center px-3 text-left hover:bg-canvas-subtle', r.id === profile.region && 'bg-accent-subtle')}
              onClick={() => { void saveProfile({ region: r.id }).then(ok => { if (ok) nav('/settings/holidays', { replace: true }); }); }}><span className="flex-1">{r.name}</span>{r.id === profile.region && <Check size={16} aria-hidden="true" />}</button>
          ))}
        </div>
      )}
      <p className="text-xs text-fg-muted">The region decides which regional holidays are marked. Pick the national or federal option if yours is not listed, then add any extra holidays by hand.</p>
    </Page>
  );
}

// ---------- holidays and lieu ----------
export function HolidaysPage() {
  const { profile, ctx, saveProfile, holiday } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const today = E.todayIso();
  const [y, setY] = useState(E.parts(today).y);
  const [add, setAdd] = useState<{ date: string; name: string; lieu: boolean } | null>(null);
  const country = profile?.country ?? '';
  useEffect(() => { if (country && !BUILT_IN.includes(country)) ensureList(country, y); }, [country, y]);
  const rows = useMemo(() => {
    if (!profile) return [];
    const map: Record<string, { d: string; name: string; custom: boolean; lieu: boolean }> = {};
    for (const [d, n] of Object.entries(holidayList(profile, y))) map[d] = { d, name: n, custom: false, lieu: true };
    for (const h of profile.customHolidays.filter(x => E.parts(x.date).y === y)) map[h.date] = { d: h.date, name: h.name, custom: true, lieu: h.lieu !== false };
    return Object.values(map).sort((a, b) => (a.d < b.d ? -1 : 1));
    // `holiday` changes when a downloaded list arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, y, holiday]);
  if (!profile || !ctx) return null;
  const L = profile.holidayLieu;
  const bank = profile.banks.find(b => b.id === (L.bank || 'lieu')) ?? profile.banks[0];
  const ext = !BUILT_IN.includes(country);
  const onShift = rows.filter(h => E.dayInfo(h.d, ctx).isWorking).length;
  const lieuTag = (h: (typeof rows)[number]): string => {
    const i = E.dayInfo(h.d, ctx), li = lieuInfo(profile, ctx, h.d);
    if (h.custom && !h.lieu) return 'No lieu';
    if (li) return `${li.text} lieu`;
    return i.isWorking ? 'Working' : 'Off';
  };
  const sub = (h: (typeof rows)[number]): string => {
    const i = E.dayInfo(h.d, ctx), sh = ctx.shifts[i.work];
    if (h.custom) return h.lieu ? 'My own holiday' : 'My own holiday · lieu turned off';
    if (!ctx.patterns.length) return 'Set up your rotation to see if you work it';
    return sh ? `You ${h.d < today ? 'worked' : 'work'} ${sh.code} ${shortT(sh.start)} to ${shortT(sh.end)}` : `You ${h.d < today ? 'were' : 'are'} off`;
  };
  const saveLieu = (patch: Partial<Profile['holidayLieu']>): void => { void saveProfile({ holidayLieu: { ...L, ...patch } }); };
  const regs = regionsOf(country, y);
  const saveAdd = async (): Promise<void> => {
    if (!add || !add.date || !add.name.trim()) { toast.show('Enter a date and a name'); return; }
    const list = profile.customHolidays.filter(h => h.date !== add.date);
    const customHolidays = [...list, { date: add.date, name: add.name.trim().slice(0, 40), lieu: add.lieu }].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (await saveProfile({ customHolidays })) { setY(E.parts(add.date).y); setAdd(null); toast.show('Holiday added'); }
  };
  const remove = (h: (typeof rows)[number]): void => {
    const before = profile.customHolidays;
    void saveProfile({ customHolidays: before.filter(x => x.date !== h.d) });
    toast.show(`Removed ${h.name}`, () => { void saveProfile({ customHolidays: before }); });
  };
  return (
    <Page title="Holidays and lieu" backTo="">
      <div className="flex gap-2">
        <button type="button" className="btn flex-1 justify-start" data-testid="open-country" onClick={() => nav('/settings/country')}><Globe size={14} aria-hidden="true" /> {placeText(profile)}</button>
        <Seg label="Year" value={y} options={[[y - 1, String(y - 1)], [y, String(y)], [y + 1, String(y + 1)]]} onChange={setY} />
      </div>
      {regs.length > 1 && <button type="button" className="btn w-full justify-start" onClick={() => nav('/settings/region')}>{REGION_TITLE[country] || 'Region'}: {profile.region ? regionLabel(profile.region) : 'All'}</button>}
      <div className="card p-3"><Toggle label="Show holidays on the calendar" on={profile.showHolidays !== false} testId="hol-show" onChange={on => { void saveProfile({ showHolidays: on }); }} /></div>
      <div className="card space-y-3 p-3">
        <Toggle label="Earn a lieu day when I work a holiday" hint="Added by itself each time a holiday lands on one of your shifts" on={L.on} testId="hol-lieu" onChange={on => saveLieu({ on })} />
        {L.on && (
          <>
            <div><div className="label mb-1">Earn</div><Seg label="Lieu amount" value={L.earn} options={[['day', '1 day'], ['hours', 'Hours I worked'], ['x15', 'Hours x 1.5']]} onChange={earn => saveLieu({ earn })} /></div>
            {profile.banks.length > 1 && <SelectField label="Goes into" value={bank.id} options={profile.banks.map(b => [b.id, b.name] as const)} onChange={b => saveLieu({ bank: b })} />}
          </>
        )}
      </div>
      {ext && !cachedList(country, y) && <Note tone="warn">Loading the holiday list. This needs an internet connection the first time. <button type="button" className="underline" onClick={() => { ensureList(country, y); toast.show('Trying again'); }}>Try again</button></Note>}
      <Section>{y} · {rows.length} holiday{rows.length === 1 ? '' : 's'} · {onShift} on your shifts</Section>
      {rows.length ? (
        <div className="card divide-y divide-line" data-testid="holiday-list">
          {rows.map(h => {
            const d = E.parts(h.d);
            return (
              <div key={h.d} className="flex items-center gap-3 p-3">
                <span className="w-10 text-center text-xs font-semibold text-fg-muted">{MON[d.m - 1].toUpperCase()}<b className="block text-lg text-fg">{d.d}</b></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{h.name}</span><span className="text-xs text-fg-muted">{sub(h)}</span></span>
                <span className="rounded-full bg-canvas-inset px-2 text-xs">{lieuTag(h)}</span>
                {h.custom && <button type="button" className="btn btn-invisible btn-icon" aria-label={`Remove ${h.name}`} onClick={() => remove(h)}><X size={14} aria-hidden="true" /></button>}
              </div>
            );
          })}
        </div>
      ) : <Empty title="No holidays listed">{profile.showHolidays === false ? 'Holidays are hidden. Turn them on above.' : 'Add your own below.'}</Empty>}
      {add ? (
        <div className="card space-y-3 p-3">
          <h2 className="font-semibold">Add my own holiday</h2>
          <Field label="Date">{id => <input id={id} type="date" className="field" data-testid="hol-date" value={add.date} onChange={e => setAdd({ ...add, date: e.target.value })} />}</Field>
          <TextField label="Name" value={add.name} maxLength={40} placeholder="Holiday name" data-testid="hol-name" onChange={name => setAdd({ ...add, name })} />
          <Toggle label="Earns a lieu day" hint="Counts for automatic lieu when you work it" on={add.lieu} onChange={lieu => setAdd({ ...add, lieu })} />
          <div className="grid grid-cols-2 gap-2"><button type="button" className="btn" onClick={() => setAdd(null)}>Cancel</button><button type="button" className="btn btn-primary" data-testid="hol-add-save" onClick={() => { void saveAdd(); }}>Add</button></div>
        </div>
      ) : <button type="button" className="btn w-full border-dashed" data-testid="hol-add" onClick={() => setAdd({ date: '', name: '', lieu: true })}><Plus size={16} aria-hidden="true" /> Add my own holiday</button>}
      <p className="text-xs text-fg-muted">Holiday lists are calculated or loaded for you. Check them against your employer's list and add anything missing.</p>
    </Page>
  );
}

// ---------- export ----------
const REMS: readonly (readonly [number, string])[] = [[15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [720, '12 hours'], [1440, '1 day']];
const RANGES: readonly (readonly [ExportRange, string])[] = [['3', 'Next 3 months'], ['6', 'Next 6 months'], ['12', 'Next 12 months'], ['custom', 'Choose dates']];

export function ExportPage() {
  const { profile, ctx, user, holiday } = useData();
  const toast = useToast();
  const today = E.todayIso();
  const saved = StorageService.get(StorageKey.USER_PREFS)?.exportPrefs;
  const [x, setX] = useState<ExportPrefs>(() => saved ?? { range: '6', rems: profile && profile.reminderMin > 0 ? [profile.reminderMin] : [60], leave: true, hol: true, pay: false });
  const [custom, setCustom] = useState({ from: today, to: E.addDays(today, 180) });
  const [rev, setRev] = useState(0);
  const range = x.range === 'custom'
    ? { from: custom.from || today, to: custom.to && custom.to >= (custom.from || today) ? custom.to : E.addDays(custom.from || today, 30) }
    : { from: today, to: E.addDays(today, Number(x.range) * 30 + (Number(x.range) >= 12 ? 5 : 0)) };
  const last = user ? StorageService.get(StorageKey.EXPORT_LAST)?.[user.uid] : undefined;
  const ev = useMemo(() => {
    if (!profile || !ctx) return {};
    return collectEvents({
      today, ...range, leave: x.leave, hol: x.hol, pay: x.pay,
      info: d => E.dayInfo(d, ctx), shift: id => ctx.shifts[id], holiday,
      leaveName: d => lvOf(profile.banks, ctx.days[d]).name, payDays: E.payDates(profile, range.from, range.to)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, ctx, x, range.from, range.to, holiday]);
  if (!profile || !user) return null;
  const n = Object.keys(ev).length, diff = diffExport(ev, last, range, today);
  void rev;
  const set = (patch: Partial<ExportPrefs>): void => setX(p => ({ ...p, ...patch }));
  const go = (): void => {
    if (!n) { toast.show('Nothing to export in this range'); return; }
    const { text, seq } = buildIcs(ev, diff, last, x.rems, user.uid, new Date());
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'my-shifts.ics'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    StorageService.update(StorageKey.USER_PREFS, cur => ({ ...(cur ?? {}), exportPrefs: x }));
    StorageService.update(StorageKey.EXPORT_LAST, cur => ({ ...(cur ?? {}), [user.uid]: { at: Date.now(), seq, ev: Object.fromEntries(Object.entries(ev).map(([k, e]) => [k, e.sig])) } }));
    toast.show(`Downloaded ${n} events`);
    setRev(r => r + 1);
  };
  const tot = diff ? diff.added.length + diff.changed.length + diff.removed.length : 0;
  return (
    <Page title="Export shifts" backTo="" footer={<button type="button" className="btn btn-primary w-full" disabled={!n} data-testid="export-go" onClick={go}><Download size={16} aria-hidden="true" /> Download {n} event{n === 1 ? '' : 's'}</button>}>
      <p className="text-fg-muted">Creates a calendar file called <b>My shifts</b>. Import it into Google Calendar or your phone's calendar. Each shift keeps the same id, so importing again updates it instead of adding a copy.</p>
      <div><div className="label mb-1">What to include</div><Seg label="Date range" value={x.range} options={RANGES} onChange={range => set({ range })} /></div>
      {x.range === 'custom'
        ? <div className="card grid grid-cols-2 gap-3 p-3"><Field label="From">{id => <input id={id} type="date" className="field" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />}</Field><Field label="To">{id => <input id={id} type="date" className="field" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />}</Field></div>
        : <p className="text-xs text-fg-muted">{fmtDY(range.from)} to {fmtDY(range.to)}</p>}
      <div className="card space-y-2 p-3"><b>Reminders (you can pick several)</b>
        <div className="flex flex-wrap gap-1.5">{REMS.map(([m, l]) => <button key={m} type="button" aria-pressed={x.rems.includes(m)} className={cn('btn btn-sm', x.rems.includes(m) && 'ring-2 ring-accent-emphasis')} onClick={() => set({ rems: x.rems.includes(m) ? x.rems.filter(v => v !== m) : [...x.rems, m] })}>{l}</button>)}</div></div>
      <div className="card space-y-3 p-3">
        <Toggle label="Time off" hint="Vacation, sick and other leave as all-day events" on={x.leave} onChange={leave => set({ leave })} />
        <Toggle label="Stat holidays" hint="From your holiday list" on={x.hol} onChange={hol => set({ hol })} />
        <Toggle label="Pay days" hint="All-day markers" on={x.pay} onChange={pay => set({ pay })} />
      </div>
      {!diff ? <Note>First export. Next time this screen shows what changed since then.</Note> : (
        <div className="card space-y-2 p-3" data-testid="export-changes">
          <div className="flex justify-between"><b>Changes since {new Date(diff.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</b><span className="text-xs text-fg-muted">{tot ? `${tot} change${tot === 1 ? '' : 's'}` : 'No changes'}</span></div>
          {[...diff.added.slice(0, 20).map(e => [e.d, e.summary, 'New'] as const), ...diff.changed.slice(0, 20).map(e => [e.d, e.summary, 'Changed'] as const), ...diff.removed.slice(0, 20).map(r => [r.d, r.sig, 'Removed'] as const)]
            .map(([d, s, tag]) => <div key={`${tag}${d}${s}`} className="flex items-center gap-2 text-sm"><span className="font-medium">{fmtD(d)}</span><span className="flex-1 truncate text-fg-muted">{s}</span><span className="rounded-full bg-canvas-inset px-2 text-xs">{tag}</span></div>)}
        </div>
      )}
      <Note>Reminders come from your calendar app, so they work with no signal. Google Calendar: on a computer open calendar.google.com, Settings, Import, and choose a new calendar named for these shifts.</Note>
    </Page>
  );
}
