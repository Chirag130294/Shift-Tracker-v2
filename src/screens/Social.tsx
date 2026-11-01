// Sharing, joining, following, colleague calendars, swap requests and the bell (v1.6 views-social.js).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Link2, Users } from 'lucide-react';
import { Avatar, Empty, Field, Note, OffBadge, Page, Section, ShiftBadge, Toggle, ask } from '../components/ui';
import { useToast } from '../components/Toast';
import { describeError, useData } from '../state/DataContext';
import { inviteLink } from '../state/joinLink';
import { nowMs, rid, useSocial } from '../state/SocialContext';
import type { Invite } from '../services/social';
import * as E from '../utils/engine';
import { DOWL, MONTHS, dowFrom, fmtD, fmtDY, fmtMD, shiftTimes } from '../utils/format';
import * as S from '../utils/share';
import { newCode } from '../utils/share';
import { cn } from '../utils/cn';
import type { DateStr, ScheduleCtx, Shift } from '../types';

const first = (n: string): string => n.split(' ')[0] || n;
const perm = (e: unknown): boolean => typeof e === 'object' && e !== null && 'code' in e && String((e as { code: unknown }).code).includes('permission');

function myUpcoming(ctx: ScheduleCtx, n = 60): { d: DateStr; sh: Shift }[] {
  const out: { d: DateStr; sh: Shift }[] = [], t = E.todayIso();
  for (let k = 0; k < n; k++) { const d = E.addDays(t, k), i = E.dayInfo(d, ctx), sh = i.isWorking ? ctx.shifts[i.work] : undefined; if (sh) out.push({ d, sh }); }
  return out;
}
function colleagueCtx(sv: S.SharedView | null | undefined): ScheduleCtx | null {
  if (!sv || sv.denied) return null;
  return { shifts: Object.fromEntries(sv.shifts.map(s => [s.id, s])), patterns: [], days: Object.fromEntries(Object.entries(sv.days).map(([d, id]) => [d, { type: 'EXTRA' as const, shiftId: id }])) };
}
const Person = ({ name, sub, extra }: { name: string; sub?: string; extra?: ReactNode }) => (
  <><Avatar text={S.initials(name)} /><span className="min-w-0 flex-1"><b className="block text-sm">{name}</b>{sub && <span className="text-xs text-fg-muted">{sub}</span>}{extra}</span></>
);

// ---------- sharing (I am the owner) ----------
export function SharingPage() {
  const { backend, user } = useData();
  const { viewers, invites, myName } = useSocial();
  const toast = useToast();
  const [code, setCode] = useState('');
  if (!backend || !user) return null;
  const now = nowMs();
  const active = Object.entries(invites).filter(([, v]) => v.expires > now);
  const link = code ? inviteLink(code) : '';
  const run = async (fn: () => Promise<void>): Promise<void> => { try { await fn(); } catch (e) { toast.show(describeError(e)); } };
  const share = async (): Promise<void> => {
    if (navigator.share) { try { await navigator.share({ title: 'Shift Calendar', text: `${myName} shared a shift calendar with you. Open this link to view my shifts:`, url: link }); return; } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; } }
    await copy();
  };
  const copy = async (): Promise<void> => { try { await navigator.clipboard.writeText(link); toast.show('Link copied'); } catch { toast.show('Press and hold the link to copy'); } };
  const sorted = Object.entries(viewers).sort((a, b) => a[1].since - b[1].since);
  return (
    <Page title="Share my calendar" backTo="">
      <Note><b>Colleagues see only the shifts you work.</b> Vacation, sick days, lieu days, notes, balances and pay are never shared. Any day you are off, for any reason, just shows as <b>Off</b>.</Note>
      <div className="card space-y-3 p-3">
        <h2 className="font-semibold">Invite a colleague</h2>
        <p className="text-xs text-fg-muted">Send them a link. They sign in, tap Accept, and can view your shifts. A link works for 7 days and you can cancel it any time.</p>
        {link ? (
          <>
            <input className="field" readOnly aria-label="Invite link" value={link} data-testid="invite-link" onFocus={e => e.currentTarget.select()} />
            <div className="grid grid-cols-2 gap-2"><button type="button" className="btn btn-primary" onClick={() => { void share(); }}><Link2 size={14} aria-hidden="true" /> Send link</button><button type="button" className="btn" onClick={() => { void copy(); }}>Copy link</button></div>
            <a className="block text-center text-sm text-accent" href={`mailto:?subject=${encodeURIComponent(`${myName} shared a shift calendar with you`)}&body=${encodeURIComponent(`Open this link to view my shifts:\n${link}`)}`}>Send by email instead</a>
          </>
        ) : <button type="button" className="btn btn-primary w-full" data-testid="invite-new" onClick={() => { void run(async () => { const c = newCode(); await backend.social.createInvite({ uid: user.uid, name: myName }, c, nowMs()); setCode(c); }); }}>Create an invite link</button>}
      </div>
      {active.length > 0 && (
        <><Section>Active invite links</Section>
          <div className="card divide-y divide-line">{active.map(([c, v]: [string, Invite]) => (
            <div key={c} className="flex items-center gap-2 p-3"><span className="flex-1 text-sm">Link ending {c.slice(-4)}<span className="block text-xs text-fg-muted">Expires {fmtMD(new Date(v.expires).toISOString().slice(0, 10))}</span></span>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => { void run(async () => { await backend.social.deleteInvite(c); if (code === c) setCode(''); toast.show('Link cancelled'); }); }}>Cancel</button></div>
          ))}</div></>
      )}
      <Section>Shared with</Section>
      {sorted.length ? sorted.map(([id, v]) => (
        <div key={id} className="card space-y-3 p-3" data-testid={`viewer-${id}`}>
          <div className="flex items-center gap-3"><Person name={v.name || 'Colleague'} sub={v.active ? 'Can see your shifts' : 'Paused. Cannot see your shifts'} /></div>
          <Toggle label="Can view" on={v.active} onChange={on => { void run(async () => { await backend.social.setViewer(user.uid, id, { active: on }); toast.show(on ? 'Access is back on' : 'Paused. They can no longer see your shifts'); }); }} />
          <Toggle label="Can send swap requests" on={v.swap} testId={`viewer-swap-${id}`} onChange={on => { void run(async () => { await backend.social.setViewer(user.uid, id, { swap: on }); toast.show(on ? 'They can send swap requests' : 'Swap requests turned off'); }); }} />
          <button type="button" className="text-sm text-danger" onClick={() => { if (ask(`Remove ${v.name || 'this person'}? They will no longer see your calendar.`)) void run(async () => { await backend.social.removeViewer(user.uid, id); toast.show('Removed'); }); }}>Remove {first(v.name || 'this person')}</button>
        </div>
      )) : <div className="card p-3"><p className="text-fg-muted">Nobody yet. Create an invite link above.</p></div>}
    </Page>
  );
}

// ---------- joining ----------
type JoinState = 'wait' | 'bad' | 'own' | 'expired' | 'already' | 'ok';
export function JoinPage() {
  const { code = '' } = useParams();
  const { backend, user } = useData();
  const { following, myName, notify } = useSocial();
  const nav = useNavigate();
  const [st, setSt] = useState<JoinState>('wait');
  const [inv, setInv] = useState<Invite | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!backend || !user) return;
    let live = true;
    backend.social.getInvite(code).then(i => {
      if (!live) return;
      setInv(i);
      setSt(!i ? 'bad' : i.owner === user.uid ? 'own' : i.expires < nowMs() ? 'expired' : following[i.owner] ? 'already' : 'ok');
    }).catch(() => { if (live) setSt('bad'); });
    return () => { live = false; };
  }, [backend, user, code, following]);
  if (!backend || !user) return null;
  const msg: Record<JoinState, [string, string]> = {
    wait: ['Checking the link...', ''], bad: ['This link does not work', 'It may have been cancelled. Ask your colleague for a new one.'],
    own: ['This is your own link', 'Send it to a colleague instead of opening it yourself.'], expired: ['This link has expired', 'Ask your colleague to send a new one.'],
    already: [`You already follow ${inv?.ownerName ?? ''}`, ''], ok: [`${inv?.ownerName ?? ''} wants to share a calendar with you`, 'You will see only the shifts they work. Anything else shows as Off. You can stop following any time.']
  };
  const accept = async (): Promise<void> => {
    if (!inv) return;
    try {
      await backend.social.join({ uid: user.uid, name: myName, email: user.email }, inv, code, nowMs());
      await notify(inv.owner, 'joined', `${myName} can now view your calendar.`);
      nav(`/colleague/${inv.owner}`, { replace: true });
    } catch (e) { setErr(perm(e) ? 'The link could not be used. It may have expired or been cancelled.' : describeError(e)); }
  };
  return (
    <Page title="Shared calendar">
      <div className="card space-y-2 p-6 text-center" data-testid="join-card"><Users size={28} className="mx-auto text-accent" aria-hidden="true" /><h2 className="text-xl font-semibold">{msg[st][0]}</h2><p className="text-fg-muted">{msg[st][1]}</p></div>
      {err && <Note tone="error">{err}</Note>}
      {st === 'ok' && <><button type="button" className="btn btn-primary w-full" data-testid="join-accept" onClick={() => { void accept(); }}>Accept and view calendar</button><button type="button" className="btn w-full" onClick={() => nav('/', { replace: true })}>Not now</button></>}
      {st === 'already' && inv && <Link className="btn btn-primary w-full" to={`/colleague/${inv.owner}`}>View calendar</Link>}
      {st !== 'ok' && st !== 'already' && st !== 'wait' && <button type="button" className="btn w-full" onClick={() => nav('/', { replace: true })}>Back to my calendar</button>}
    </Page>
  );
}

// ---------- following ----------
export function FollowPage() {
  const { backend, user } = useData();
  const { following, shared, perm: perms } = useSocial();
  const toast = useToast();
  if (!backend || !user) return null;
  const list = Object.entries(following);
  const stop = async (o: string, name: string): Promise<void> => {
    if (!ask(`Stop following ${name || 'this colleague'}?`)) return;
    try { await backend.social.removeViewer(o, user.uid); } catch { /* the owner may have removed me already */ }
    try { await backend.social.unfollow(user.uid, o); toast.show('Stopped following'); } catch (e) { toast.show(describeError(e)); }
  };
  return (
    <Page title="Calendars shared with me" backTo="">
      {list.length ? list.map(([o, f]) => {
        const p = perms[o], sv = shared[o];
        return (
          <div key={o} className="card flex items-center gap-3 p-3" data-testid={`follow-${o}`}>
            <Person name={f.name || 'Colleague'} sub={sv?.denied ? 'Access paused' : p?.swap ? 'You can send swap requests' : 'View only'} />
            <Link to={`/colleague/${o}`} className="btn btn-sm">Open</Link>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => { void stop(o, f.name); }}>Stop</button>
          </div>
        );
      }) : <Empty title="No shared calendars yet">When a colleague sends you an invite link, open it and tap Accept. Then you can see their shifts and find who can take yours.</Empty>}
      <Note>You only ever see the shifts a colleague works. Whether they are off, on vacation or sick is not shown.</Note>
    </Page>
  );
}

// ---------- a colleague's calendar ----------
export function ColleaguePage() {
  const { owner = '' } = useParams();
  const { ctx } = useData();
  const { following, shared, perm: perms } = useSocial();
  const nav = useNavigate();
  const t = E.parts(E.todayIso());
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [sel, setSel] = useState<DateStr | null>(null);
  const { profile } = useData();
  if (!ctx || !profile) return null;
  const f = following[owner], sv = shared[owner], p = perms[owner];
  const name = f?.name || sv?.name || 'Colleague';
  if (sv?.denied) return <Page title={`${name}'s shifts`} backTo=""><Note tone="warn"><b>{name} paused your access.</b> Ask them to turn it back on in their Share my calendar screen.</Note></Page>;
  if (!sv) return <Page title={`${name}'s shifts`} backTo=""><div className="card p-3"><p className="text-fg-muted">{sv === null ? `${name} has not published their calendar yet. It appears a few moments after they open the app.` : 'Loading...'}</p></div></Page>;
  const W = profile.weekStart, { y, m } = ym, firstD = E.ymd(y, m, 1), dim = E.daysInMonth(y, m), lead = E.weekOffset(firstD, W), today = E.todayIso();
  const defs = Object.fromEntries(sv.shifts.map(s => [s.id, s]));
  const move = (n: number): void => { setSel(null); setYm(({ y: yy, m: mm }) => { const k = mm - 1 + n; return { y: yy + Math.floor(k / 12), m: ((k % 12) + 12) % 12 + 1 }; }); };
  const detail = (() => {
    if (!sel) return null;
    const def = defs[sv.days[sel]], mi = E.dayInfo(sel, ctx), msh = mi.isWorking ? ctx.shifts[mi.work] : undefined;
    const canSwap = !!(def && p?.active && p.swap);
    return (
      <div className="card space-y-3 p-3" data-testid="colleague-detail">
        <b>{fmtDY(sel)}</b>
        <div className="flex items-center gap-3">{def ? <ShiftBadge code={def.code} color={def.color} big /> : <OffBadge big />}<span className="flex-1"><b>{name}</b><span className="block text-xs text-fg-muted">{def ? `${def.name} · ${def.start} to ${def.end}${E.crossesMidnight(def) ? ' (ends next day)' : ''}` : 'Off'}</span></span></div>
        <div className="flex items-center gap-3">{msh ? <ShiftBadge code={msh.code} color={msh.color} big /> : <OffBadge big />}<span className="flex-1"><b>You</b><span className="block text-xs text-fg-muted">{msh ? `${msh.name} · ${msh.start} to ${msh.end}` : 'Off'}</span></span></div>
        {canSwap ? <button type="button" className="btn btn-primary w-full" data-testid="swap-ask" onClick={() => nav(`/swap/new/${owner}?theirDate=${sel}`)}><ArrowLeftRight size={16} aria-hidden="true" /> Ask {first(name)} to swap shifts</button>
          : def ? <Note>{name} has not turned on swap requests for you.</Note> : null}
      </div>
    );
  })();
  return (
    <Page title={`${name}'s shifts`} backTo="">
      <div className="flex items-center justify-between"><span className="text-2xl font-semibold">{MONTHS[m - 1]} <span className="text-fg-muted">{y}</span></span>
        <span className="flex gap-1"><button type="button" className="btn btn-icon" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={16} aria-hidden="true" /></button><button type="button" className="btn btn-icon" aria-label="Next month" onClick={() => move(1)}><ChevronRight size={16} aria-hidden="true" /></button></span></div>
      <div className="grid grid-cols-7 gap-1" data-testid="colleague-grid">
        {Array.from({ length: 7 }, (_, k) => <div key={k} className="text-center text-xs font-semibold text-fg-muted">{dowFrom(W, k).slice(0, 2)}</div>)}
        {Array.from({ length: lead }, (_, k) => <span key={`b${k}`} />)}
        {Array.from({ length: dim }, (_, k) => {
          const d = k + 1, date = E.ymd(y, m, d), def = defs[sv.days[date]], mi = E.dayInfo(date, ctx), msh = mi.isWorking ? ctx.shifts[mi.work] : undefined, inWin = date >= sv.from && date <= sv.to;
          return (
            <button key={date} type="button" data-testid={`ccell-${date}`} aria-label={`${DOWL[E.weekday(date)]} ${MONTHS[m - 1]} ${d}, ${def ? `${name} works ${def.name}` : inWin ? `${name} is off` : 'not shared'}`}
              className={cn('flex min-h-14 flex-col items-center gap-0.5 rounded-md border p-1', date === today ? 'border-accent-emphasis' : 'border-line', sel === date && 'bg-accent-subtle')} onClick={() => setSel(s => (s === date ? null : date))}>
              <span className="text-xs">{d}</span>{def ? <ShiftBadge code={def.code} color={def.color} /> : <span className="text-[10px] text-fg-subtle">{inWin ? 'Off' : ''}</span>}
              {msh && <span className="text-[10px] font-semibold text-accent">{msh.code}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-fg-muted">Small code = your own shift.</p>
      {detail}
    </Page>
  );
}

// ---------- swap: new request ----------
export function SwapNewPage() {
  const { owner = '' } = useParams();
  const [q] = useSearchParams();
  const theirDate = q.get('theirDate') ?? '';
  const { ctx, days, backend, user } = useData();
  const { following, shared, myName, notify } = useSocial();
  const toast = useToast();
  const nav = useNavigate();
  const mine = useMemo(() => (ctx ? myUpcoming(ctx) : []), [ctx]);
  const [myDate, setMyDate] = useState(q.get('myDate') ?? '');
  const [note, setNote] = useState('');
  if (!ctx || !backend || !user) return null;
  const sv = shared[owner], f = following[owner], name = f?.name || sv?.name || 'Colleague';
  if (!sv || sv.denied) return <Page title="Ask for a swap" backTo=""><Note tone="warn">This calendar is not available right now.</Note></Page>;
  const theirDef = sv.shifts.find(s => s.id === sv.days[theirDate]);
  if (!theirDef) return <Page title="Ask for a swap" backTo=""><Note tone="warn">{name} is not working on {theirDate ? fmtD(theirDate) : 'that day'}.</Note></Page>;
  const give = mine.find(x => x.d === myDate) ?? mine.find(x => x.d !== theirDate) ?? mine[0];
  const warns: string[] = [];
  if (give) {
    S.restWarnings({ shifts: ctx.shifts, patterns: ctx.patterns, days: { ...days, [give.d]: { type: 'OFF' } } }, theirDate, theirDef).forEach(w => warns.push(`You: ${w}`));
    const cc = colleagueCtx(sv);
    if (cc) { const dd = { ...cc.days }; delete dd[theirDate]; S.restWarnings({ ...cc, days: dd }, give.d, give.sh).forEach(w => warns.push(`${first(name)}: ${w}`)); }
    if (E.dayInfo(theirDate, ctx).isWorking && theirDate !== give.d) warns.push(`You already work on ${fmtD(theirDate)}.`);
  }
  const send = async (): Promise<void> => {
    if (!give) { toast.show('Choose the shifts first'); return; }
    const id = rid('sw');
    const swap = S.newSwap({ a: { uid: user.uid, name: myName }, b: { uid: owner, name }, aDate: give.d, aShift: give.sh, bDate: theirDate, bShift: theirDef, note, now: nowMs() });
    try {
      await backend.social.createSwap(id, swap);
      await notify(owner, 'swap', `${myName} asks to swap: your ${theirDef.code} on ${fmtMD(theirDate)} for their ${give.sh.code} on ${fmtMD(give.d)}.`, id);
      toast.show('Request sent');
      nav(`/swap/${id}`, { replace: true });
    } catch (e) { toast.show(perm(e) ? 'Not allowed. Your colleague may have turned swap requests off.' : describeError(e)); }
  };
  return (
    <Page title="Ask for a swap" backTo="" footer={<button type="button" className="btn btn-primary w-full" disabled={!give} data-testid="swap-send" onClick={() => { void send(); }}>Send request</button>}>
      <div className="card space-y-2 p-3"><div className="text-xs font-semibold text-fg-muted">You would take</div>
        <div className="flex items-center gap-3"><ShiftBadge code={theirDef.code} color={theirDef.color} big /><span><b>{name}'s {theirDef.name}</b><span className="block text-xs text-fg-muted">{fmtDY(theirDate)} · {theirDef.start} to {theirDef.end}</span></span></div></div>
      <div className="card space-y-2 p-3"><div className="text-xs font-semibold text-fg-muted">In exchange you give one of your shifts</div>
        {mine.length ? <select className="field" aria-label="Your shift to give" data-testid="swap-mine" value={give?.d ?? ''} onChange={e => setMyDate(e.target.value)}>{mine.map(x => <option key={x.d} value={x.d}>{fmtD(x.d)} · {x.sh.code} {x.sh.start}-{x.sh.end}</option>)}</select> : <p className="text-fg-muted">You have no upcoming shifts to offer.</p>}
        <p className="text-xs text-fg-muted">You can offer a different date than theirs; your colleague can also suggest another date.</p></div>
      {warns.length > 0 && <Note tone="warn"><b>Heads up on rest time</b>{warns.map(w => <span key={w} className="block">{w}</span>)}</Note>}
      <Field label="Message (optional)">{id => <textarea id={id} className="field min-h-20" maxLength={200} placeholder="I have an appointment that day" value={note} onChange={e => setNote(e.target.value)} />}</Field>
    </Page>
  );
}

// ---------- who can take my shift ----------
export function WhoCanPage() {
  const { date = '' } = useParams();
  const { ctx } = useData();
  const { following, shared, perm: perms } = useSocial();
  const nav = useNavigate();
  if (!ctx) return null;
  const i = E.dayInfo(date, ctx), sh = ctx.shifts[i.work];
  if (!sh || i.type === 'SWAP_OUT') return <Page title="Who can take my shift?" backTo=""><Empty title="You are not working that day">Pick one of your shifts on the calendar, then ask again.</Empty></Page>;
  const ids = Object.keys(following);
  const mine = <div className="card flex items-center gap-3 p-3"><ShiftBadge code={sh.code} color={sh.color} big /><span><b>{sh.name}</b><span className="block text-xs text-fg-muted">{fmtDY(date)} · {shiftTimes(sh, date)}</span></span></div>;
  if (!ids.length) return <Page title="Who can take my shift?" backTo="">{mine}<Empty title="No colleagues yet" action={<Link className="btn" to="/settings/following">Calendars shared with me</Link>}>When a colleague shares their calendar with you, this screen shows who is free to take your shift.</Empty></Page>;
  const rank: Record<S.AvailabilityState, number> = { free: 0, tight: 1, working: 2, unknown: 3, none: 4 };
  const people = ids.map(o => { const sv = shared[o]; return { o, name: following[o]?.name || sv?.name || 'Colleague', p: perms[o], sv, a: S.availability(sv, date, sh) }; })
    .sort((x, y) => rank[x.a.state] - rank[y.a.state] || x.name.localeCompare(y.name));
  const free = people.filter(p => p.a.state === 'free').length;
  const TAG: Record<S.AvailabilityState, string> = { free: 'Off, good rest', tight: 'Off, short rest', working: 'Working', unknown: 'Not shared yet', none: 'Access paused' };
  return (
    <Page title="Who can take my shift?" backTo="">
      {mine}
      <Note tone={free ? 'info' : 'warn'}>{free ? <><b>{free} colleague{free === 1 ? ' is' : 's are'} free</b> on {fmtD(date)}.</> : 'Nobody who shares with you is clearly free that day.'} Only the shifts people work are shared, so a colleague on vacation looks the same as one who is off.</Note>
      {people.map(({ o, name, p, sv, a }) => {
        const canSwap = !!(p?.active && p.swap);
        const line = a.state === 'free' ? `${first(name)} is off on ${fmtD(date)} and has enough rest around your ${sh.code} shift.` : a.state === 'tight' ? a.warns.join(' ')
          : a.state === 'working' ? `${first(name)} works ${a.shift ? `${a.shift.code} ${a.shift.start} to ${a.shift.end}` : 'that day'}. You could trade shifts instead.`
            : a.state === 'unknown' ? 'This date is outside the part of their calendar they share.' : 'They paused your access.';
        const opts = a.state === 'working' ? (a.shift ? [{ d: date, def: a.shift }] : []) : S.theirShifts(sv, E.addDays(date, -3) > E.todayIso() ? E.addDays(date, -3) : E.todayIso(), E.addDays(date, 10), 4).filter(x => x.d !== date);
        return (
          <div key={o} className="card space-y-2 p-3" data-testid={`who-${o}`}>
            <div className="flex items-center gap-3"><Person name={name} extra={<span className="ml-2 rounded-full bg-canvas-inset px-2 text-xs">{TAG[a.state]}</span>} /></div>
            <p className="text-sm">{line}</p>
            {(a.state === 'free' || a.state === 'tight' || a.state === 'working') && (!canSwap ? <p className="text-xs text-fg-muted">View only. Ask {first(name)} to turn on swap requests for you.</p>
              : opts.length ? <div className="space-y-1"><div className="text-xs font-semibold text-fg-muted">{a.state === 'working' ? 'Trade with' : 'Offer to take one of their shifts in exchange'}</div>
                <div className="flex flex-wrap gap-1.5">{opts.map(x => <button key={x.d} type="button" className="btn btn-sm" onClick={() => nav(`/swap/new/${o}?theirDate=${x.d}&myDate=${date}`)}>{fmtD(x.d)} · {x.def.code}</button>)}</div></div>
                : <><p className="text-xs text-fg-muted">They have no other shifts in the next 10 days to offer in exchange.</p><Link className="btn btn-sm" to={`/colleague/${o}`}>Open {first(name)}'s calendar</Link></>)}
          </div>
        );
      })}
    </Page>
  );
}

// ---------- one swap request ----------
const ACT_TEXT: Record<string, string> = { asked: 'asked', approved: 'approved', declined: 'declined', cancelled: 'cancelled' };
export function SwapViewPage() {
  const { id = '' } = useParams();
  const { ctx, days, backend, user } = useData();
  const { swaps, myName, notify } = useSocial();
  const toast = useToast();
  const nav = useNavigate();
  if (!ctx || !backend || !user) return null;
  const s = swaps.find(x => x.id === id), me = user.uid;
  if (!s) return <Page title="Swap request" backTo=""><div className="card p-3"><p className="text-fg-muted">Loading, or this request was removed.</p></div></Page>;
  const my = S.myPart(s, me), their = S.theirPart(s, me), other = S.otherName(s, me), mineTurn = s.turn === me && S.isOpen(s), asker = s.aUid === me;
  const warns = S.isOpen(s) ? S.restWarnings({ shifts: ctx.shifts, patterns: ctx.patterns, days: { ...days, [my.date]: { type: 'OFF' } } }, their.date, their.shift) : [];
  const status: Record<S.SwapStatus, string> = { pending: asker ? `Waiting for ${other}` : 'Waiting for you', countered: mineTurn ? `${other} suggested a new date` : `Waiting for ${other} to answer your new date`, approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };
  const patch = async (p: S.SwapPatch, text: string, done: string): Promise<boolean> => {
    try { await backend.social.patchSwap(s.id, p); await notify(S.otherUid(s, me), 'swap', text, s.id); toast.show(done); return true; }
    catch (e) { toast.show(perm(e) ? 'Could not save. It may have changed. Try again.' : describeError(e)); return false; }
  };
  const row = (label: string, part: typeof my, who: string): ReactNode => (
    <div className="flex items-center gap-3"><ShiftBadge code={part.shift.code} color={part.shift.color} big /><span><span className="block text-xs font-semibold text-fg-muted">{label}</span><b>{fmtDY(part.date)}</b><span className="block text-xs text-fg-muted">{who} · {part.shift.start} to {part.shift.end}</span></span></div>
  );
  const now = nowMs();
  return (
    <Page title={`Swap with ${other}`} backTo=""
      footer={mineTurn ? (
        <div className="space-y-2"><div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-danger" data-testid="swap-decline" onClick={() => { void patch(S.answerPatch(s, me, 'declined', now), `${myName} declined the swap.`, 'Declined'); }}>Decline</button>
          <button type="button" className="btn btn-primary" data-testid="swap-approve" onClick={() => { void patch(S.answerPatch(s, me, 'approved', now), `${myName} approved the swap: ${their.shift.code} on ${fmtMD(their.date)} for ${my.shift.code} on ${fmtMD(my.date)}.`, 'Approved. Your calendar will update'); }}>Approve</button></div>
          <button type="button" className="btn w-full" data-testid="swap-counter" onClick={() => nav(`/swap/${s.id}/counter`)}>Suggest a different date</button></div>
      ) : S.isOpen(s) && asker ? <button type="button" className="btn btn-danger w-full" data-testid="swap-cancel" onClick={() => { void patch({ status: 'cancelled', updated: now, log: [...s.log, { at: now, by: me, act: 'cancelled' }].slice(-12) }, `${myName} cancelled the swap request.`, 'Cancelled'); }}>Cancel my request</button>
        : !S.isOpen(s) ? <button type="button" className="btn w-full" data-testid="swap-delete" onClick={() => { void backend.social.deleteSwap(s.id).then(() => { toast.show('Removed'); nav(-1); }).catch((e: unknown) => toast.show(describeError(e))); }}>Remove from my list</button> : undefined}>
      <div className="card space-y-3 p-3">
        <div className="flex items-center justify-between"><b data-testid="swap-status">{status[s.status]}</b><span className="rounded-full bg-canvas-inset px-2 text-xs">{S.SWAP_STATUS[s.status]}</span></div>
        {row('You give', my, 'You')}{row('You take', their, other)}
        {s.note && <Note><b>{asker ? 'Your' : `${s.aName}'s`} message:</b> {s.note}</Note>}
      </div>
      {warns.length > 0 && <Note tone="warn"><b>Heads up on rest time</b>{warns.map(w => <span key={w} className="block">{w}</span>)}</Note>}
      {s.status === 'approved' && <Note>{s.applied[me] ? 'Your calendar is updated.' : 'Updating your calendar...'}{s.applied[S.otherUid(s, me)] ? '' : ` ${other}'s calendar updates when they next open the app.`}</Note>}
      {s.log.length > 0 && <div className="card space-y-1 p-3"><b className="text-sm">History</b>{[...s.log].reverse().map((l, k) => <div key={k} className="text-xs text-fg-muted">{l.by === me ? 'You' : other} {l.act === 'countered' ? `suggested ${l.date ? fmtMD(l.date) : 'a new date'}` : (ACT_TEXT[l.act] ?? l.act)} · {new Date(l.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>)}</div>}
    </Page>
  );
}

export function SwapCounterPage() {
  const { id = '' } = useParams();
  const { ctx, days, backend, user } = useData();
  const { swaps, myName, notify } = useSocial();
  const toast = useToast();
  const nav = useNavigate();
  const [pickDate, setPick] = useState('');
  const mine = useMemo(() => (ctx ? myUpcoming(ctx, 90) : []), [ctx]);
  if (!ctx || !backend || !user) return null;
  const s = swaps.find(x => x.id === id), me = user.uid;
  if (!s) return <Page title="New date" backTo=""><div className="card p-3"><p className="text-fg-muted">This request is no longer available.</p></div></Page>;
  const their = S.theirPart(s, me), cur = S.myPart(s, me);
  const pick = mine.find(x => x.d === pickDate) ?? mine.find(x => x.d === cur.date) ?? mine[0];
  const warns = pick ? S.restWarnings({ shifts: ctx.shifts, patterns: ctx.patterns, days: { ...days, [cur.date]: { type: 'OFF' } } }, their.date, their.shift) : [];
  const send = async (): Promise<void> => {
    if (!pick) return;
    try {
      await backend.social.patchSwap(s.id, S.counterPatch(s, me, pick.d, pick.sh, nowMs()));
      await notify(S.otherUid(s, me), 'swap', `${myName} suggests ${fmtD(pick.d)} (${pick.sh.code}) instead.`, s.id);
      toast.show('Suggestion sent'); nav(-1);
    } catch (e) { toast.show(perm(e) ? 'Could not save. It may have changed. Try again.' : describeError(e)); }
  };
  return (
    <Page title="Suggest a different date" backTo="" footer={<button type="button" className="btn btn-primary w-full" disabled={!pick} data-testid="counter-send" onClick={() => { void send(); }}>Send my suggestion</button>}>
      <Note>{S.otherName(s, me)} wants to give <b>{their.shift.code}</b> on {fmtDY(their.date)}. Choose which of <b>your</b> shifts you would give instead.</Note>
      <div className="card p-3">{mine.length ? <select className="field" aria-label="Your shift to give" data-testid="counter-mine" value={pick?.d ?? ''} onChange={e => setPick(e.target.value)}>{mine.map(x => <option key={x.d} value={x.d}>{fmtD(x.d)} · {x.sh.code} {x.sh.start}-{x.sh.end}</option>)}</select> : <p className="text-fg-muted">You have no upcoming shifts to offer.</p>}</div>
      {warns.length > 0 && <Note tone="warn"><b>Heads up on rest time</b>{warns.map(w => <span key={w} className="block">{w}</span>)}</Note>}
    </Page>
  );
}

// ---------- the bell ----------
export function NoticesPage() {
  const { backend, user } = useData();
  const { notices, swaps, unread } = useSocial();
  const toast = useToast();
  const nav = useNavigate();
  if (!backend || !user) return null;
  const me = user.uid;
  const waiting = swaps.filter(s => s.turn === me && S.isOpen(s)), open = swaps.filter(s => S.isOpen(s) && s.turn !== me);
  const swapRow = (s: (typeof swaps)[number], tag: string): ReactNode => (
    <button key={s.id} type="button" className="flex w-full items-center gap-3 p-3 text-left hover:bg-canvas-subtle" data-testid={`notice-swap-${s.id}`} onClick={() => nav(`/swap/${s.id}`)}>
      <Avatar text={S.initials(S.otherName(s, me))} /><span className="min-w-0 flex-1"><b className="block text-sm">Swap with {S.otherName(s, me)}</b><span className="text-xs text-fg-muted">{S.myPart(s, me).shift.code} {fmtMD(S.myPart(s, me).date)} for {S.theirPart(s, me).shift.code} {fmtMD(S.theirPart(s, me).date)}</span></span><span className="rounded-full bg-canvas-inset px-2 text-xs">{tag}</span>
    </button>
  );
  const fail = (e: unknown): void => { toast.show(describeError(e)); };
  const read = notices.filter(n => n.read).map(n => n.id);
  return (
    <Page title="Notifications" backTo="" right={<span className="flex gap-1">
      {unread > 0 && <button type="button" className="btn btn-sm" data-testid="read-all" onClick={() => { backend.social.markRead(me, notices.filter(n => !n.read).map(n => n.id)).catch(fail); }}>Mark all read</button>}
      {read.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { backend.social.deleteNotices(me, read).then(() => toast.show('Cleared')).catch(fail); }}>Clear read</button>}</span>}>
      {waiting.length > 0 && <><Section>Waiting for your answer</Section><div className="card divide-y divide-line">{waiting.map(s => swapRow(s, 'Answer'))}</div></>}
      {open.length > 0 && <><Section>Your open requests</Section><div className="card divide-y divide-line">{open.map(s => swapRow(s, 'Waiting'))}</div></>}
      <Section>Recent</Section>
      {notices.length ? (
        <div className="card divide-y divide-line" data-testid="notice-list">
          {notices.slice(0, 40).map(n => (
            <button key={n.id} type="button" className={cn('flex w-full items-center gap-3 p-3 text-left hover:bg-canvas-subtle', !n.read && 'bg-accent-subtle')}
              onClick={() => {
                if (!n.read) backend.social.markRead(me, [n.id]).catch(() => undefined);
                if (n.type === 'swap' && n.ref && swaps.some(s => s.id === n.ref)) nav(`/swap/${n.ref}`);
                else if (n.type === 'joined') nav('/settings/sharing');
                else toast.show('That request is no longer open');
              }}>
              <Avatar text={S.initials(n.fromName)} /><span className="min-w-0 flex-1"><span className="block text-sm">{n.text}</span><span className="text-xs text-fg-muted">{new Date(n.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
            </button>
          ))}
        </div>
      ) : <div className="card p-3"><p className="text-fg-muted">Nothing yet. Swap requests and new colleagues show up here the next time you open the app.</p></div>}
    </Page>
  );
}
