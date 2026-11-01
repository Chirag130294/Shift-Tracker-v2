// In-memory backend for `?demo=1`: one sample person, nothing leaves the browser and nothing is kept.
// It implements the same Backend interface as Firestore and runs writes through the same validation,
// so the preview rejects exactly what the real database would.
import type { Backend, DayEntries, ProfilePatch, Unsubscribe } from './backend';
import { assertDate, readDayDoc, toDayPayload } from './dayDoc';
import { createSocial } from './social';
import { memoryStore } from './stores';
import * as E from '../utils/engine';
import { newProfile } from '../state/profile';
import type { AuthUser, DateStr, DayDoc, DayMap, Pattern, Profile, ScheduleCtx } from '../types';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function seed(today: DateStr, name: string): { profile: Profile; days: DayMap } {
  const pattern: Pattern = {
    id: 'p1', mode: 'week', anchor: '2026-10-11', effectiveFrom: '1900-01-01',
    days: ['am', 'am', '', '', 'pm', 'pm', '', '', 'd', 'e', 'n', '', '', 'am']
  };
  const base = newProfile();
  const profile: Profile = {
    ...base, name, patterns: [pattern], payFreq: 'biweekly', payAnchor: '2026-10-29',
    vacYearly: 120, carryLimit: 20, deadline: '2026-12-31', onboarded: true,
    banks: base.banks.map(b => {
      if (b.id === 'vac') return { ...b, balance: 84, asOf: today, earn: { rule: 'pay', amount: 3.7 } };
      if (b.id === 'sick') return { ...b, balance: 36, asOf: today };
      if (b.id === 'bank') return { ...b, balance: 12, asOf: today };
      return { ...b, asOf: today };
    })
  };
  const ctx: ScheduleCtx = { shifts: Object.fromEntries(profile.shifts.map(s => [s.id, s])), patterns: [pattern], days: {} };
  const days: DayMap = {};
  for (let n = 3; n < 40 && Object.keys(days).length < 2; n++) {
    const d = E.addDays(today, n), i = E.dayInfo(d, ctx);
    if (i.base) days[d] = { type: 'VAC', hours: i.baseHours };
  }
  return { profile, days };
}

/**
 * `?demo=1` is one sample person. `?demo=1&as=alice` is a named person kept in this browser, so a second tab
 * (`&as=sam`) can join alice's invite and trade shifts. `&fresh=1` starts with no data to try the setup flow.
 */
export function createDemoBackend(): Backend {
  const params = new URLSearchParams(window.location.search);
  const as = (params.get('as') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 20);
  const uid = as || 'demo';
  const user: AuthUser = { uid, email: `${uid}@example.com`, name: as ? cap(as) : 'Demo' };
  const store = memoryStore(uid, !!as);
  const profilePath = `users/${uid}`;
  const dayCol = `users/${uid}/days`;
  let signedIn = true;
  const authWatchers = new Set<(u: AuthUser | null) => void>();
  const emitAuth = (): void => authWatchers.forEach(f => f(signedIn ? user : null));

  const ready = (async (): Promise<void> => {
    if (params.has('fresh') || (await store.get(profilePath)) !== null) return;
    const data = seed(E.todayIso(), user.name);
    await store.set(profilePath, { ...data.profile });
    for (const [d, day] of Object.entries(data.days)) await store.set(`${dayCol}/${d}`, { ...toDayPayload(d, day) });
  })();

  return {
    kind: 'demo',
    onAuth(cb): Unsubscribe {
      authWatchers.add(cb);
      void ready.then(() => cb(signedIn ? user : null));
      return () => { authWatchers.delete(cb); };
    },
    signUp: async () => { signedIn = true; emitAuth(); },
    signIn: async () => { signedIn = true; emitAuth(); },
    google: async () => { signedIn = true; emitAuth(); },
    reset: async () => {},
    signOut: async () => { signedIn = false; emitAuth(); },

    watchProfile: (_uid, cb, onErr): Unsubscribe => store.watchDoc(profilePath, cb, onErr),
    saveProfile: async (_uid, patch: ProfilePatch) => { await store.set(profilePath, { ...patch }, true); },

    watchDays: (_uid, cb, onErr): Unsubscribe => store.watchCol(dayCol, docs => {
      const days: DayMap = {};
      for (const [d, raw] of Object.entries(docs)) days[d] = readDayDoc(raw);
      cb(days);
    }, onErr),
    setDay: async (_uid, date, day: DayDoc) => { await store.set(`${dayCol}/${date}`, { ...toDayPayload(date, day) }); },
    delDay: async (_uid, date) => { assertDate(date); await store.del(`${dayCol}/${date}`); },
    setDays: async (_uid, entries: DayEntries) => {
      const ops = Object.entries(entries).map(([date, day]) => (day
        ? { op: 'set' as const, path: `${dayCol}/${date}`, data: { ...toDayPayload(date, day) } }
        : (assertDate(date), { op: 'del' as const, path: `${dayCol}/${date}` })));
      await store.batch(ops);
    },
    social: createSocial(store),
    deleteAccount: async () => { signedIn = false; emitAuth(); }
  };
}
