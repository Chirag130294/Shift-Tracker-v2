// The two DocStore implementations: Firestore, and an in-memory copy for the `?demo=1` preview.
import type { Firestore } from 'firebase/firestore';
import type { DocStore, OnErr, Order, Unsub } from './social';

type Fs = typeof import('firebase/firestore');
type Docs = Record<string, unknown>;

export function firestoreStore(fs: Fs, db: Firestore): DocStore {
  const ref = (path: string) => { const [c, ...rest] = path.split('/'); return fs.doc(db, c, ...rest); };
  const col = (path: string) => { const [c, ...rest] = path.split('/'); return fs.collection(db, c, ...rest); };
  const toMap = (snap: import('firebase/firestore').QuerySnapshot): Docs => {
    const m: Docs = {};
    snap.forEach(d => { m[d.id] = d.data(); });
    return m;
  };
  return {
    async get(path) { const s = await fs.getDoc(ref(path)); return s.exists() ? s.data() : null; },
    set: (path, data, merge) => (merge ? fs.setDoc(ref(path), data, { merge: true }) : fs.setDoc(ref(path), data)),
    del: path => fs.deleteDoc(ref(path)),
    watchDoc: (path, cb, onErr) => fs.onSnapshot(ref(path), s => cb(s.exists() ? s.data() : null), onErr),
    watchCol(path, cb, onErr, order) {
      const q = order
        ? fs.query(col(path), fs.orderBy(order.by, order.desc ? 'desc' : 'asc'), ...(order.limit ? [fs.limit(order.limit)] : []))
        : col(path);
      return fs.onSnapshot(q, s => cb(toMap(s)), onErr);
    },
    watchWhere: (path, field, op, value, cb, onErr) => fs.onSnapshot(fs.query(col(path), fs.where(field, op, value)), s => cb(toMap(s)), onErr),
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = fs.writeBatch(db);
        for (const o of ops.slice(i, i + 400)) {
          if (o.op === 'del') b.delete(ref(o.path));
          else if (o.merge) b.set(ref(o.path), o.data, { merge: true });
          else b.set(ref(o.path), o.data);
        }
        await b.commit();
      }
    },
    async list(path) { const s = await fs.getDocs(col(path)); return s.docs.map(d => d.id); },
    async listWhere(path, field, value) { const s = await fs.getDocs(fs.query(col(path), fs.where(field, '==', value))); return s.docs.map(d => d.id); }
  };
}

const isRecord = (v: unknown): v is Docs => typeof v === 'object' && v !== null && !Array.isArray(v);
const mergeDeep = (a: unknown, b: Docs): Docs => {
  const out: Docs = { ...(isRecord(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) out[k] = isRecord(v) && isRecord(out[k]) ? mergeDeep(out[k], v) : v;
  return out;
};
const clone = <T,>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));
const isChild = (col: string, p: string): boolean => p.startsWith(`${col}/`) && !p.slice(col.length + 1).includes('/');

type Watcher =
  | { t: 'doc'; path: string; cb: (d: unknown) => void; onErr: OnErr; last?: string }
  | { t: 'col'; path: string; cb: (d: Docs) => void; onErr: OnErr; order?: Order; field?: string; op?: string; value?: string; last?: string };

const STORAGE_KEY = 'shiftcal_v2_demo_db';

/**
 * One pretend database. With `persist` (named demo users) it lives in localStorage so two tabs
 * (`?demo=1&as=alice` and `?demo=1&as=sam`) can share and swap with each other.
 * It enforces the rule the real database enforces for shared copies: only an active viewer may read one.
 */
export function memoryStore(uid: string, persist: boolean, backing: Record<string, unknown> = {}): DocStore {
  // `backing` lets tests give two people one pretend database
  let docs: Record<string, unknown> = backing;
  const load = (): void => {
    if (!persist) return;
    try { const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'); docs = isRecord(raw) ? raw : {}; } catch { docs = {}; }
  };
  const save = (): void => { if (persist) { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(docs)); } catch { /* quota or blocked */ } } };
  load();
  const watchers = new Set<Watcher>();
  const denied = (path: string): boolean => {
    if (!path.startsWith('shared/') || path === `shared/${uid}`) return false;
    const v = docs[`users/${path.slice(7)}/viewers/${uid}`];
    return !(isRecord(v) && v.active === true);
  };
  const run = (w: Watcher): void => {
    if (w.t === 'doc') {
      if (denied(w.path)) { if (w.last !== 'DENIED') { w.last = 'DENIED'; setTimeout(() => w.onErr({ code: 'permission-denied' }), 0); } return; }
      const out = docs[w.path] === undefined ? null : docs[w.path];
      const s = JSON.stringify(out);
      if (s !== w.last) { w.last = s; setTimeout(() => w.cb(clone(out)), 0); }
      return;
    }
    let ids = Object.keys(docs).filter(p => isChild(w.path, p));
    const { field, value, op } = w;
    if (field) ids = ids.filter(p => { const d = docs[p]; const f = isRecord(d) ? d[field] : undefined; return op === 'array-contains' ? Array.isArray(f) && f.includes(value) : f === value; });
    let entries = ids.map(p => [p.slice(w.path.length + 1), docs[p]] as const);
    if (w.order) {
      const { by, desc, limit } = w.order;
      const key = (e: readonly [string, unknown]): number => { const d = e[1]; const v = isRecord(d) ? d[by] : 0; return typeof v === 'number' ? v : 0; };
      entries.sort((a, b) => key(a) - key(b));
      if (desc) entries.reverse();
      if (limit) entries = entries.slice(0, limit);
    }
    const out: Docs = Object.fromEntries(entries);
    const s = JSON.stringify(out);
    if (s !== w.last) { w.last = s; setTimeout(() => w.cb(clone(out)), 0); }
  };
  const runAll = (): void => watchers.forEach(run);
  if (persist) window.addEventListener('storage', e => { if (e.key === STORAGE_KEY) { load(); runAll(); } });
  const add = (w: Watcher): Unsub => { watchers.add(w); run(w); return () => { watchers.delete(w); }; };

  return {
    async get(path) { load(); return docs[path] === undefined ? null : clone(docs[path]); },
    async set(path, data, merge) { load(); docs[path] = merge ? mergeDeep(docs[path], clone(data)) : clone(data); save(); runAll(); },
    async del(path) { load(); delete docs[path]; save(); runAll(); },
    watchDoc: (path, cb, onErr) => add({ t: 'doc', path, cb, onErr }),
    watchCol: (path, cb, onErr, order) => add({ t: 'col', path, cb, onErr, order }),
    watchWhere: (path, field, op, value, cb, onErr) => add({ t: 'col', path, cb, onErr, field, op, value }),
    async batch(ops) {
      load();
      for (const o of ops) {
        if (o.op === 'del') delete docs[o.path];
        else docs[o.path] = o.merge ? mergeDeep(docs[o.path], clone(o.data)) : clone(o.data);
      }
      save(); runAll();
    },
    async list(path) { load(); return Object.keys(docs).filter(p => isChild(path, p)).map(p => p.slice(path.length + 1)); },
    async listWhere(path, field, value) {
      load();
      return Object.keys(docs).filter(p => { const d = docs[p]; return isChild(path, p) && isRecord(d) && d[field] === value; }).map(p => p.slice(path.length + 1));
    }
  };
}
