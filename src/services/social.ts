// Sharing, invites, notifications and swaps. Typed operations over a small document store, so the same
// code runs on Firestore and on the in-memory demo. Every write is checked here against the limits in
// firestore.rules (key lists, sizes, who may write what), so a bad payload fails before the network.
//
//   users/{uid}/viewers/{viewerUid}      colleagues who can see my shifts
//   users/{uid}/following/{ownerUid}     calendars shared with me
//   users/{uid}/notifications/{id}       the bell
//   shared/{uid}                         the safe copy of my shifts
//   shareInvites/{code}                  invite links
//   swaps/{id}                           a swap between two people
import type { DateStr } from '../types';
import type { Notice, SharedView, Swap, SwapPatch, SwapWithId } from '../utils/share';

export type Unsub = () => void;
export type OnErr = (e: unknown) => void;

export interface Viewer { code: string; name: string; email: string; since: number; active: boolean; swap: boolean }
export interface Following { name: string; since: number }
export interface Invite { owner: string; ownerName: string; created: number; expires: number }
export type NoticeWithId = Notice & { id: string };
export interface Person { uid: string; name: string }

export type Order = { by: string; desc?: boolean; limit?: number };

/** The only thing that differs between Firestore and the demo. Internal: screens never see it. */
export interface DocStore {
  get(path: string): Promise<unknown>;
  set(path: string, data: Record<string, unknown>, merge?: boolean): Promise<void>;
  del(path: string): Promise<void>;
  watchDoc(path: string, cb: (data: unknown) => void, onErr: OnErr): Unsub;
  watchCol(path: string, cb: (docs: Record<string, unknown>) => void, onErr: OnErr, order?: Order): Unsub;
  watchWhere(path: string, field: string, op: 'array-contains' | '==', value: string, cb: (docs: Record<string, unknown>) => void, onErr: OnErr): Unsub;
  batch(ops: readonly ({ op: 'set'; path: string; data: Record<string, unknown>; merge?: boolean } | { op: 'del'; path: string })[]): Promise<void>;
  list(path: string): Promise<string[]>;
  listWhere(path: string, field: string, value: string): Promise<string[]>;
}

export interface Social {
  watchViewers(uid: string, cb: (m: Record<string, Viewer>) => void, onErr: OnErr): Unsub;
  watchFollowing(uid: string, cb: (m: Record<string, Following>) => void, onErr: OnErr): Unsub;
  watchNotices(uid: string, cb: (l: NoticeWithId[]) => void, onErr: OnErr): Unsub;
  watchSwaps(uid: string, cb: (l: SwapWithId[]) => void, onErr: OnErr): Unsub;
  /** null when nothing is shared. A permission error means access was switched off. */
  /** Invite links I created. */
  watchInvites(uid: string, cb: (m: Record<string, Invite>) => void, onErr: OnErr): Unsub;
  watchShared(owner: string, cb: (v: SharedView | null) => void, onErr: OnErr): Unsub;
  watchViewerDoc(owner: string, me: string, cb: (v: Viewer | null) => void, onErr: OnErr): Unsub;
  deleteInvite(code: string): Promise<void>;
  getInvite(code: string): Promise<Invite | null>;
  createInvite(owner: Person, code: string, now: number): Promise<Invite>;
  /** Writes my viewer doc first (the rules read the invite), then the following doc. */
  join(me: { uid: string; name: string; email: string }, invite: Invite, code: string, now: number): Promise<void>;
  setViewer(owner: string, viewerUid: string, patch: Partial<Pick<Viewer, 'active' | 'swap'>>): Promise<void>;
  removeViewer(owner: string, viewerUid: string): Promise<void>;
  unfollow(me: string, owner: string): Promise<void>;
  publish(uid: string, view: SharedView | null): Promise<void>;
  notify(toUid: string, id: string, n: Notice): Promise<void>;
  markRead(uid: string, ids: readonly string[]): Promise<void>;
  deleteNotices(uid: string, ids: readonly string[]): Promise<void>;
  createSwap(id: string, swap: Swap): Promise<void>;
  patchSwap(id: string, patch: SwapPatch): Promise<void>;
  markApplied(id: string, uid: string): Promise<void>;
  deleteSwap(id: string): Promise<void>;
  /** Removes everything of mine except the login. */
  wipe(uid: string): Promise<void>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[a-z0-9]{6,40}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const WEEK_MS = 8 * 24 * 3600 * 1000;
const fail = (m: string): never => { throw new Error(m); };

export const asViewer = (v: unknown): Viewer | null =>
  isRecord(v) ? { code: str(v.code), name: str(v.name), email: str(v.email), since: num(v.since), active: v.active === true, swap: v.swap === true } : null;
const asFollowing = (v: unknown): Following | null => (isRecord(v) ? { name: str(v.name), since: num(v.since) } : null);
const asInvite = (v: unknown): Invite | null =>
  isRecord(v) && typeof v.owner === 'string' ? { owner: v.owner, ownerName: str(v.ownerName), created: num(v.created), expires: num(v.expires) } : null;
const asNotice = (v: unknown): Notice | null =>
  isRecord(v) ? { type: str(v.type), from: str(v.from), fromName: str(v.fromName), text: str(v.text), ref: str(v.ref), at: num(v.at), read: v.read === true } : null;

/** Shared copy: the reader trusts nothing and fills defaults, so a half-written doc cannot crash the screen. */
export function asShared(v: unknown): SharedView | null {
  if (!isRecord(v)) return null;
  const shifts = Array.isArray(v.shifts) ? v.shifts.filter(isRecord).map(s => ({
    id: str(s.id), code: str(s.code), name: str(s.name), start: str(s.start, '00:00'), end: str(s.end, '00:00'), brk: num(s.brk), color: str(s.color, '#888888')
  })) : [];
  const days: Record<DateStr, string> = {};
  if (isRecord(v.days)) for (const [d, id] of Object.entries(v.days)) if (DATE_RE.test(d) && typeof id === 'string') days[d] = id;
  return { name: str(v.name), weekStart: num(v.weekStart), shifts, from: str(v.from), to: str(v.to), days, hash: str(v.hash) };
}

export function asSwap(v: unknown): Swap | null {
  if (!isRecord(v) || !Array.isArray(v.members) || v.members.length !== 2) return null;
  const def = (x: unknown): Swap['aShift'] => {
    const o = isRecord(x) ? x : {};
    return { code: str(o.code), name: str(o.name), start: str(o.start, '00:00'), end: str(o.end, '00:00'), brk: num(o.brk), color: str(o.color, '#888888') };
  };
  const status = ['pending', 'countered', 'approved', 'declined', 'cancelled'].includes(str(v.status)) ? (str(v.status) as Swap['status']) : 'pending';
  const applied: Record<string, boolean> = {};
  if (isRecord(v.applied)) for (const [k, x] of Object.entries(v.applied)) applied[k] = x === true;
  const log = Array.isArray(v.log) ? v.log.filter(isRecord).map(l => ({ at: num(l.at), by: str(l.by), act: str(l.act), ...(typeof l.date === 'string' ? { date: l.date } : {}) })) : [];
  return {
    aUid: str(v.aUid), aName: str(v.aName), aDate: str(v.aDate), aShift: def(v.aShift),
    bUid: str(v.bUid), bName: str(v.bName), bDate: str(v.bDate), bShift: def(v.bShift),
    status, turn: str(v.turn), note: str(v.note), created: num(v.created), updated: num(v.updated), applied,
    members: [str(v.members[0]), str(v.members[1])], log
  };
}

function mapOf<T>(docs: Record<string, unknown>, parse: (v: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, raw] of Object.entries(docs)) { const v = parse(raw); if (v) out[id] = v; }
  return out;
}

const SUBS = ['days', 'notifications', 'viewers', 'following'] as const;

export function createSocial(store: DocStore): Social {
  const vPath = (owner: string, viewer: string): string => `users/${owner}/viewers/${viewer}`;
  return {
    watchViewers: (uid, cb, onErr) => store.watchCol(`users/${uid}/viewers`, d => cb(mapOf(d, asViewer)), onErr),
    watchFollowing: (uid, cb, onErr) => store.watchCol(`users/${uid}/following`, d => cb(mapOf(d, asFollowing)), onErr),
    watchNotices: (uid, cb, onErr) => store.watchCol(`users/${uid}/notifications`, d => {
      const m = mapOf(d, asNotice);
      cb(Object.entries(m).map(([id, n]) => ({ ...n, id })).sort((a, b) => b.at - a.at).slice(0, 50));
    }, onErr, { by: 'at', desc: true, limit: 50 }),
    watchSwaps: (uid, cb, onErr) => store.watchWhere('swaps', 'members', 'array-contains', uid, d => {
      cb(Object.entries(mapOf(d, asSwap)).map(([id, s]) => ({ ...s, id })).sort((a, b) => b.updated - a.updated));
    }, onErr),
    watchInvites: (uid, cb, onErr) => store.watchWhere('shareInvites', 'owner', '==', uid, d => cb(mapOf(d, asInvite)), onErr),
    deleteInvite: code => store.del(`shareInvites/${code}`),
    watchShared: (owner, cb, onErr) => store.watchDoc(`shared/${owner}`, d => cb(asShared(d)), onErr),
    watchViewerDoc: (owner, me, cb, onErr) => store.watchDoc(vPath(owner, me), d => cb(asViewer(d)), onErr),

    async getInvite(code) {
      if (!CODE_RE.test(code)) return null;
      return asInvite(await store.get(`shareInvites/${code}`));
    },
    async createInvite(owner, code, now) {
      if (!CODE_RE.test(code)) fail('Invite code is not valid.');
      const invite: Invite = { owner: owner.uid, ownerName: owner.name.slice(0, 60), created: now, expires: now + WEEK_MS - 60_000 };
      if (invite.expires > now + 691_200_000) fail('Invite expires too late.');
      await store.set(`shareInvites/${code}`, { ...invite });
      return invite;
    },
    async join(me, invite, code, now) {
      if (!CODE_RE.test(code)) fail('Invite code is not valid.');
      if (invite.expires <= now) fail('This invite has expired. Ask for a new link.');
      if (invite.owner === me.uid) fail('This is your own invite link.');
      const viewer: Viewer = { code, name: (me.name || me.email.split('@')[0] || 'Colleague').slice(0, 60), email: me.email, since: now, active: true, swap: false };
      await store.set(vPath(invite.owner, me.uid), { ...viewer });
      await store.set(`users/${me.uid}/following/${invite.owner}`, { name: invite.ownerName.slice(0, 60), since: now });
    },
    setViewer: (owner, viewerUid, patch) => store.set(vPath(owner, viewerUid), { ...patch }, true),
    removeViewer: (owner, viewerUid) => store.del(vPath(owner, viewerUid)),
    unfollow: (me, owner) => store.del(`users/${me}/following/${owner}`),
    async publish(uid, view) {
      if (!view) { await store.del(`shared/${uid}`); return; }
      if (Object.keys(view.days).length > 400) fail('Shared range is too long.');
      if (view.shifts.length > 30) fail('Too many shift types to share.');
      const { denied: _d, ...body } = view;
      await store.set(`shared/${uid}`, { ...body });
    },
    async notify(toUid, id, n) {
      if (!ID_RE.test(id)) fail('Bad notification id.');
      if (n.text.length > 200 || n.fromName.length > 60) fail('Notification too long.');
      await store.set(`users/${toUid}/notifications/${id}`, { ...n, read: false });
    },
    markRead: (uid, ids) => store.batch(ids.map(id => ({ op: 'set' as const, path: `users/${uid}/notifications/${id}`, data: { read: true }, merge: true }))),
    deleteNotices: (uid, ids) => store.batch(ids.map(id => ({ op: 'del' as const, path: `users/${uid}/notifications/${id}` }))),
    async createSwap(id, s) {
      if (!ID_RE.test(id)) fail('Bad swap id.');
      if (s.aUid === s.bUid) fail('You cannot swap with yourself.');
      if (!DATE_RE.test(s.aDate) || !DATE_RE.test(s.bDate)) fail('Swap dates are not valid.');
      if (s.status !== 'pending' || s.turn !== s.bUid || s.members[0] !== s.aUid || s.members[1] !== s.bUid) fail('Swap is not a new request.');
      await store.set(`swaps/${id}`, { ...s });
    },
    patchSwap: (id, patch) => store.set(`swaps/${id}`, { ...patch }, true),
    markApplied: (id, uid) => store.set(`swaps/${id}`, { applied: { [uid]: true } }, true),
    deleteSwap: id => store.del(`swaps/${id}`),
    async wipe(uid) {
      const ops: { op: 'del'; path: string }[] = [];
      for (const sub of SUBS) for (const id of await store.list(`users/${uid}/${sub}`)) ops.push({ op: 'del', path: `users/${uid}/${sub}/${id}` });
      try { for (const id of await store.listWhere('shareInvites', 'owner', uid)) ops.push({ op: 'del', path: `shareInvites/${id}` }); } catch { /* the rules only list your own invites; ignore */ }
      ops.push({ op: 'del', path: `shared/${uid}` }, { op: 'del', path: `users/${uid}` });
      await store.batch(ops);
    }
  };
}
