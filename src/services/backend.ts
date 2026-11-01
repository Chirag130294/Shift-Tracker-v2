// Talks to Firebase (sign-in and saving). Screens only see the small, typed interface below:
// there is no raw "write this path" method, so the only things that can reach Firestore are
// whole days (validated by parseDayDoc), partial profile patches, and sign-in calls.
//
//   users/{uid}                 profile           Backend.watchProfile / saveProfile
//   users/{uid}/days/{date}     one per date      Backend.watchDays / setDay / delDay / setDays
//
//   social                      viewers, following, notifications, shared, shareInvites, swaps (see social.ts)
import type { Unsubscribe } from 'firebase/firestore';
import { firebaseConfig, isConfigured } from './firebase-config';
import { assertDate, readDayDoc, toDayPayload } from './dayDoc';
import { createSocial, type Social } from './social';
import { firestoreStore } from './stores';
import type { AuthUser, DateStr, DayDoc, DayMap, Profile } from '../types';

export type ProfilePatch = Partial<Profile>;
export type DayEntries = Record<DateStr, DayDoc | null>;
export type { Unsubscribe };

export interface Backend {
  readonly kind: 'firebase' | 'demo';
  onAuth(cb: (user: AuthUser | null) => void): Unsubscribe;
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  google(): Promise<void>;
  reset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** cb gets the raw stored profile (or null). Run it through normalizeProfile before use. */
  watchProfile(uid: string, cb: (raw: unknown) => void, onErr: (e: unknown) => void): Unsubscribe;
  saveProfile(uid: string, patch: ProfilePatch): Promise<void>;
  watchDays(uid: string, cb: (days: DayMap) => void, onErr: (e: unknown) => void): Unsubscribe;
  /** Replaces the whole day. Throws DayValidationError before sending anything malformed. */
  setDay(uid: string, date: DateStr, day: DayDoc): Promise<void>;
  delDay(uid: string, date: DateStr): Promise<void>;
  /** null deletes that date. Everything is validated first, so a bad entry stops the whole batch. */
  setDays(uid: string, entries: DayEntries): Promise<void>;
  readonly social: Social;
  /** Deletes the signed-in login. Call social.wipe first. */
  deleteAccount(): Promise<void>;
}

export async function createBackend(demo: boolean): Promise<Backend | null> {
  if (demo) {
    const { createDemoBackend } = await import('./demoBackend');
    return createDemoBackend();
  }
  if (!isConfigured()) return null;
  return createFirebaseBackend();
}

const profilePath = (uid: string): string[] => ['users', uid];
const dayPath = (uid: string, d: DateStr): string[] => ['users', uid, 'days', d];

async function createFirebaseBackend(): Promise<Backend> {
  const [appM, authM, fsM] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore')
  ]);
  const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(firebaseConfig);
  const auth = authM.getAuth(app);
  let db: ReturnType<typeof fsM.getFirestore>;
  try {
    // Keeps your data on the device so the app opens and edits offline, and syncs later.
    db = fsM.initializeFirestore(app, {
      localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true
    });
  } catch (e) {
    // Already initialised (hot reload) or the browser has no IndexedDB: use whatever instance exists.
    console.warn('Using the default Firestore instance', e);
    db = fsM.getFirestore(app);
  }
  const { doc, setDoc, deleteDoc, onSnapshot, collection, writeBatch } = fsM;
  const ref = (path: string[]) => doc(db, path[0], ...path.slice(1));
  const toUser = (u: import('firebase/auth').User | null): AuthUser | null =>
    u ? { uid: u.uid, email: u.email || '', name: u.displayName || '' } : null;

  const backend: Backend = {
    kind: 'firebase',
    onAuth: cb => authM.onAuthStateChanged(auth, u => cb(toUser(u))),
    signUp: async (e, p) => { await authM.createUserWithEmailAndPassword(auth, e, p); },
    signIn: async (e, p) => { await authM.signInWithEmailAndPassword(auth, e, p); },
    google: async () => { await authM.signInWithPopup(auth, new authM.GoogleAuthProvider()); },
    reset: e => authM.sendPasswordResetEmail(auth, e),
    signOut: () => authM.signOut(auth),

    watchProfile(uid, cb, onErr) {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const stop = onSnapshot(ref(profilePath(uid)), { includeMetadataChanges: true }, snap => {
        if (!snap.exists() && snap.metadata.fromCache) {
          // On a new phone the first answer can come from an empty cache. Wait for the server a few seconds.
          if (!timer && !settled) timer = setTimeout(() => { settled = true; cb(null); }, 6000);
          return;
        }
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        cb(snap.exists() ? snap.data() : null);
      }, onErr);
      return () => { if (timer) clearTimeout(timer); stop(); };
    },
    saveProfile: (uid, patch) => setDoc(ref(profilePath(uid)), { ...patch, updatedAt: Date.now() }, { merge: true }),

    watchDays(uid, cb, onErr) {
      return onSnapshot(collection(db, 'users', uid, 'days'), snap => {
        const days: DayMap = {};
        snap.forEach(d => { days[d.id] = readDayDoc(d.data()); });
        cb(days);
      }, onErr);
    },
    setDay: (uid, date, day) => setDoc(ref(dayPath(uid, date)), toDayPayload(date, day)),
    delDay: (uid, date) => { assertDate(date); return deleteDoc(ref(dayPath(uid, date))); },
    social: createSocial(firestoreStore(fsM, db)),
    deleteAccount: async () => { if (auth.currentUser) await authM.deleteUser(auth.currentUser); },
    async setDays(uid, entries) {
      const ops = Object.entries(entries).map(([date, day]) => {
        assertDate(date);
        return { date, payload: day ? toDayPayload(date, day) : null };
      });
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        for (const { date, payload } of ops.slice(i, i + 400)) {
          if (payload) batch.set(ref(dayPath(uid, date)), payload); else batch.delete(ref(dayPath(uid, date)));
        }
        await batch.commit();
      }
    }
  };
  return backend;
}
