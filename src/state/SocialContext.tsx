// Everything about sharing that outlives a screen: who can see me, who I follow, the bell, swap requests,
// publishing my safe copy, and writing approved swaps into my own calendar.
// Ported from v1.6 views-social.js (publishSoon / syncFollow / applySwaps / notify).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../components/Toast';
import type { Following, Invite, NoticeWithId, Viewer } from '../services/social';
import * as E from '../utils/engine';
import { buildSharedView, newNotice, otherName, planApproved, type SharedView, type SwapWithId } from '../utils/share';
import { describeError, useData } from './DataContext';

interface SocialValue {
  viewers: Record<string, Viewer>;
  following: Record<string, Following>;
  invites: Record<string, Invite>;
  notices: NoticeWithId[];
  swaps: SwapWithId[];
  unread: number;
  /** Open requests waiting for my answer. */
  waiting: number;
  /** owner uid -> their safe copy; `denied` when the database refused the read; undefined while loading */
  shared: Record<string, SharedView | null | undefined>;
  /** owner uid -> my access record under them */
  perm: Record<string, Viewer | null | undefined>;
  myName: string;
  notify: (toUid: string, type: string, text: string, ref?: string) => Promise<void>;
}

const Ctx = createContext<SocialValue | null>(null);
export function useSocial(): SocialValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSocial must be used inside <SocialProvider>');
  return v;
}

export const nowMs = (): number => Date.now();
export const rid = (prefix: string): string => prefix + nowMs().toString(36) + Math.random().toString(36).slice(2, 6);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { backend, user, profile, days, ctx, saveProfile } = useData();
  const toast = useToast();
  const [viewers, setViewers] = useState<Record<string, Viewer>>({});
  const [following, setFollowing] = useState<Record<string, Following>>({});
  const [invites, setInvites] = useState<Record<string, Invite>>({});
  const [notices, setNotices] = useState<NoticeWithId[]>([]);
  const [swaps, setSwaps] = useState<SwapWithId[]>([]);
  const [shared, setShared] = useState<SocialValue['shared']>({});
  const [perm, setPerm] = useState<SocialValue['perm']>({});
  const uid = user?.uid ?? '';
  const myName = (profile?.name || user?.name || (user?.email || 'Someone').split('@')[0]).slice(0, 60);

  // Listen to my own sharing data.
  useEffect(() => {
    if (!backend || !uid) return;
    const s = backend.social;
    const quiet = (e: unknown): void => { console.warn('sharing data unavailable', e); };
    const stops = [
      s.watchViewers(uid, setViewers, quiet), s.watchFollowing(uid, setFollowing, quiet), s.watchInvites(uid, setInvites, quiet),
      s.watchNotices(uid, setNotices, quiet), s.watchSwaps(uid, setSwaps, quiet)
    ];
    return () => { stops.forEach(f => f()); setViewers({}); setFollowing({}); setInvites({}); setNotices([]); setSwaps([]); };
  }, [backend, uid]);

  // Follow each colleague: their safe copy and my access record under them.
  const owners = Object.keys(following).sort().join(',');
  useEffect(() => {
    if (!backend || !uid || !owners) return;
    const s = backend.social;
    const stops = owners.split(',').flatMap(o => [
      s.watchShared(o, v => setShared(m => ({ ...m, [o]: v })), () => setShared(m => ({ ...m, [o]: { name: '', weekStart: 0, shifts: [], from: '', to: '', days: {}, hash: '', denied: true } }))),
      s.watchViewerDoc(o, uid, v => setPerm(m => ({ ...m, [o]: v })), () => setPerm(m => ({ ...m, [o]: null })))
    ]);
    return () => { stops.forEach(f => f()); setShared({}); setPerm({}); };
  }, [backend, uid, owners]);

  // Publish my safe copy shortly after something changes. No viewers: remove it.
  const lastPub = useRef('');
  const hasViewers = Object.keys(viewers).length > 0;
  useEffect(() => {
    if (!backend || !uid || !profile) return;
    const t = setTimeout(() => {
      const run = async (): Promise<void> => {
        if (!hasViewers) { if (lastPub.current !== 'none') { await backend.social.publish(uid, null); lastPub.current = 'none'; } return; }
        const today = E.todayIso();
        const view = buildSharedView(profile, days, today);
        const key = `${view.hash}|${today}`;
        if (key === lastPub.current) return;
        await backend.social.publish(uid, view);
        lastPub.current = key;
      };
      run().catch((e: unknown) => { console.warn('could not publish', e); });
    }, 1500);
    return () => clearTimeout(t);
  }, [backend, uid, profile, days, hasViewers]);

  // Write approved swaps into my own calendar, once each.
  const applying = useRef(new Set<string>());
  useEffect(() => {
    if (!backend || !uid || !profile || !ctx) return;
    for (const s of swaps) {
      if (s.status !== 'approved' || s.applied[uid] || applying.current.has(s.id)) continue;
      applying.current.add(s.id);
      (async () => {
        const plan = planApproved(s, uid, ctx);
        if (plan.error) toast.show(plan.error);
        else {
          if (plan.newShift) await saveProfile({ shifts: [...profile.shifts, { ...plan.newShift }] });
          await backend.setDays(uid, plan.writes);
          toast.show(`Swap with ${otherName(s, uid)} added to your calendar`);
        }
        await backend.social.markApplied(s.id, uid);
      })().catch((e: unknown) => { console.warn('could not apply swap', e); applying.current.delete(s.id); toast.show(describeError(e)); });
    }
  }, [backend, uid, profile, ctx, swaps, saveProfile, toast]);

  const notify = useCallback<SocialValue['notify']>(async (toUid, type, text, ref) => {
    if (!backend || !uid) return;
    try {
      await backend.social.notify(toUid, rid('n'), newNotice({ type, from: uid, fromName: myName, text, ref, now: nowMs() }));
    } catch (e) { console.warn('notice not sent', e); }
  }, [backend, uid, myName]);

  const unread = notices.filter(n => !n.read).length;
  const waiting = swaps.filter(s => s.turn === uid && (s.status === 'pending' || s.status === 'countered')).length;
  const value = useMemo<SocialValue>(
    () => ({ viewers, following, invites, notices, swaps, unread, waiting, shared, perm, myName, notify }),
    [viewers, following, invites, notices, swaps, unread, waiting, shared, perm, myName, notify]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
