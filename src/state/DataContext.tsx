import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createBackend, type Backend, type ProfilePatch } from '../services/backend';
import { DayValidationError, toDayPayload } from '../services/dayDoc';
import { useToast } from '../components/Toast';
import { setOnLoaded } from '../utils/holidays';
import { normalizeProfile } from './profile';
import { bankStat, buildCtx, holidayOn, type BankStat } from './derive';
import type { AuthUser, Bank, DateStr, DayDoc, DayMap, Profile, ScheduleCtx } from '../types';

export type Phase = 'booting' | 'config' | 'fatal' | 'login' | 'loading' | 'onboarding' | 'ready';

interface DataValue {
  phase: Phase;
  error: string;
  demo: boolean;
  backend: Backend | null;
  user: AuthUser | null;
  profile: Profile | null;
  days: DayMap;
  /** Present once the profile has loaded. */
  ctx: ScheduleCtx | null;
  holiday: (date: DateStr) => string | null;
  stat: (bankId: string, skipDate?: DateStr | null) => BankStat;
  /**
   * Edits one day. `edit` receives a copy of what is saved (or {}) and returns the new day.
   * An empty result deletes the day. With `message`, the toast offers Undo.
   */
  commitDay: (date: DateStr, edit: (prev: DayDoc) => DayDoc, message?: string) => void;
  saveBanks: (banks: Bank[]) => void;
  /** Merges a partial change into the profile. Resolves false (after a toast) when the save failed. */
  saveProfile: (patch: ProfilePatch) => Promise<boolean>;
  signOut: () => void;
}

const DataContext = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}

/** A person-readable reason for a failed save. */
export function describeError(e: unknown): string {
  if (e instanceof DayValidationError) return `Not saved: ${e.message}`;
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code.includes('permission')) return 'Not saved: the database refused this change. Check that the latest firestore.rules are published.';
  if (code.includes('unavailable') || code.includes('network')) return 'Not saved yet: you are offline. It will sync when you are back online.';
  return e instanceof Error && e.message ? `Not saved: ${e.message}` : 'Not saved: something went wrong.';
}

export function DataProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const demo = useMemo(() => new URLSearchParams(window.location.search).has('demo'), []);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [phase, setPhase] = useState<Phase>('booting');
  const [error, setError] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [days, setDays] = useState<DayMap>({});
  const [holidayTick, setHolidayTick] = useState(0);

  // Holiday lists for other countries arrive after first paint: redraw when one lands.
  useEffect(() => {
    setOnLoaded(() => setHolidayTick(t => t + 1));
    return () => setOnLoaded(() => {});
  }, []);

  // 1. Create the backend and listen for sign-in changes.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    createBackend(demo)
      .then(be => {
        if (cancelled) return;
        if (!be) { setPhase('config'); return; }
        setBackend(be);
        stop = be.onAuth(u => { setUser(u); if (!u) { setProfile(null); setDays({}); setPhase('login'); } });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'The app could not load Firebase.');
        setPhase('fatal');
      });
    return () => { cancelled = true; stop?.(); };
  }, [demo]);

  // 2. While signed in, watch the profile and the days.
  useEffect(() => {
    if (!backend || !user) return;
    setPhase('loading');
    setError('');
    const fail = (e: unknown): void => { setError(describeError(e).replace('Not saved: ', 'Cannot load your data: ')); };
    const stopProfile = backend.watchProfile(user.uid, raw => {
      const p = raw && typeof raw === 'object' && 'onboarded' in raw && (raw as { onboarded: unknown }).onboarded ? normalizeProfile(raw) : null;
      setProfile(p);
      setPhase(p ? 'ready' : 'onboarding');
    }, fail);
    const stopDays = backend.watchDays(user.uid, setDays, fail);
    return () => { stopProfile(); stopDays(); };
  }, [backend, user]);

  const ctx = useMemo(() => (profile ? buildCtx(profile, days) : null), [profile, days]);

  const holiday = useCallback(
    (date: DateStr) => (profile ? holidayOn(profile, date) : null),
    // holidayTick makes the lookup refresh when a downloaded list arrives
    [profile, holidayTick]
  );

  const stat = useCallback(
    (bankId: string, skipDate?: DateStr | null) => {
      if (!profile) return { bank: null, left: 0, booked: 0, after: 0, rows: [], opening: 0, asOf: '' };
      return bankStat(profile, days, bankId, skipDate);
    },
    [profile, days, holidayTick]
  );

  const commitDay = useCallback<DataValue['commitDay']>((date, edit, message) => {
    if (!backend || !user) return;
    const prev = days[date] ?? null;
    let next: DayDoc;
    try {
      next = toDayPayload(date, edit({ ...(prev ?? {}) }));
    } catch (e) {
      toast.show(describeError(e));
      return;
    }
    const restore = (): Promise<void> => (prev ? backend.setDay(user.uid, date, prev) : backend.delDay(user.uid, date));
    const write = Object.keys(next).length ? backend.setDay(user.uid, date, next) : backend.delDay(user.uid, date);
    write.catch((e: unknown) => toast.show(describeError(e)));
    if (message) toast.show(message, () => { restore().catch((e: unknown) => toast.show(describeError(e))); });
  }, [backend, user, days, toast]);

  const saveBanks = useCallback((banks: Bank[]) => {
    if (!backend || !user) return;
    backend.saveProfile(user.uid, { banks }).catch((e: unknown) => toast.show(describeError(e)));
  }, [backend, user, toast]);

  const saveProfile = useCallback<DataValue['saveProfile']>(async patch => {
    if (!backend || !user) return false;
    try { await backend.saveProfile(user.uid, patch); return true; } catch (e) { toast.show(describeError(e)); return false; }
  }, [backend, user, toast]);

  const signOut = useCallback(() => { backend?.signOut().catch((e: unknown) => toast.show(describeError(e))); }, [backend, toast]);

  const value = useMemo<DataValue>(
    () => ({ phase, error, demo, backend, user, profile, days, ctx, holiday, stat, commitDay, saveBanks, saveProfile, signOut }),
    [phase, error, demo, backend, user, profile, days, ctx, holiday, stat, commitDay, saveBanks, saveProfile, signOut]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
