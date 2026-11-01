// New in v2 (complete build): rotation drafts, shift library, calendar export, sharing and swaps over the typed store.
import assert from 'node:assert/strict';
import { createSocial, asShared, asSwap } from '../src/services/social';
import { memoryStore } from '../src/services/stores';
import { applyTemplate, blankDraft, commitRotation, deleteShift, resizeDays, saveShift, setMode, blankShift } from '../src/state/rotation';
import { buildIcs, collectEvents, diffExport } from '../src/utils/ics';
import { buildSharedView, newCode, newNotice, newSwap, planApproved, answerPatch, counterPatch } from '../src/utils/share';
import * as E from '../src/utils/engine';
import { newProfile } from '../src/state/profile';
import type { Pattern } from '../src/types';

let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>): Promise<void> => { await fn(); passed++; console.log('ok  ' + name); };
const profile = newProfile();
const [am, pm] = profile.shifts;

await t('rotation: needs a start date and at least one painted day', () => {
  const r = { ...blankDraft(0, am.id) };
  assert.ok('error' in commitRotation(r, [], 1));
  assert.ok('error' in commitRotation({ ...r, anchorInput: '2026-10-11' }, [], 1));
  const ok = commitRotation({ ...r, anchorInput: '2026-10-14', days: r.days.map((_, i) => (i === 1 ? am.id : '')) }, [], 5);
  assert.ok('patterns' in ok);
  if ('patterns' in ok) { assert.equal(ok.patterns[0].anchor, '2026-10-11'); assert.equal(ok.patterns[0].effectiveFrom, '1900-01-01'); }
});
await t('rotation: a second schedule starts on its own date and keeps the old one before it', () => {
  const old: Pattern = { id: 'p1', mode: 'week', anchor: '2026-01-04', effectiveFrom: '1900-01-01', days: [am.id, '', '', '', '', '', ''] };
  const r = { ...blankDraft(0, am.id), anchorInput: '2026-11-01', days: [pm.id, '', '', '', '', '', ''], isNew: true };
  const res = commitRotation(r, [old], 9);
  assert.ok('patterns' in res);
  if ('patterns' in res) { assert.equal(res.patterns.length, 2); assert.equal(res.patterns[1].effectiveFrom, '2026-11-01'); assert.equal(E.baseShiftId('2026-10-04', res.patterns), am.id); assert.equal(E.baseShiftId('2026-11-01', res.patterns), pm.id); }
});
await t('rotation: templates and resizing', () => {
  const r = blankDraft(0, am.id);
  assert.equal(applyTemplate(r, '4on4off', am.id).draft.days.length, 8);
  assert.equal(applyTemplate(r, 'pitman', am.id).draft.mode, 'cycle');
  assert.ok(applyTemplate(r, 'above', am.id).hint);
  assert.equal(resizeDays(r, 21).days.length, 21);
  assert.equal(setMode({ ...r, days: Array(21).fill('') }, 'cycle').days.length, 21);
  assert.equal(setMode({ ...r, mode: 'cycle', days: Array(10).fill('') }, 'week').days.length, 14);
});
await t('shift library: codes are unique and in-use shifts cannot be deleted', () => {
  const dup = saveShift({ ...blankShift(), name: 'X', code: 'am' }, profile.shifts, 1);
  assert.ok('error' in dup);
  const added = saveShift({ ...blankShift(), name: 'Mid', code: 'md' }, profile.shifts, 1);
  assert.ok('shifts' in added && added.shifts.length === profile.shifts.length + 1 && added.shifts.at(-1)?.code === 'MD');
  const used: Pattern = { id: 'p', mode: 'week', anchor: '2026-01-04', effectiveFrom: '1900-01-01', days: [am.id, '', '', '', '', '', ''] };
  assert.ok('error' in deleteShift(am.id, profile.shifts, [used]));
  assert.ok('shifts' in deleteShift(am.id, profile.shifts, []));
});

const pat: Pattern = { id: 'p1', mode: 'week', anchor: '2026-10-11', effectiveFrom: '1900-01-01', days: [am.id, am.id, '', '', pm.id, pm.id, '', '', am.id, '', '', '', '', ''] };
const ctx = { shifts: Object.fromEntries(profile.shifts.map(s => [s.id, s])), patterns: [pat], days: {} };
const exportSrc = (leave: boolean) => ({ today: '2026-10-12', from: '2026-10-12', to: '2026-10-31', leave, hol: true, pay: true, info: (d: string) => E.dayInfo(d, ctx), shift: (id: string) => ctx.shifts[id], leaveName: () => 'Vacation', holiday: (d: string) => (d === '2026-10-31' ? 'Test Day' : null), payDays: ['2026-10-23'] });
await t('export: events, stable ids, changes since last time', () => {
  const ev = collectEvents(exportSrc(true));
  assert.ok(ev['2026-10-12-shift'] && ev['2026-10-31-hol'] && ev['2026-10-23-pay']);
  const ics = buildIcs(ev, null, null, [60, 15], 'abcdefghij', new Date('2026-10-12T12:00:00Z'));
  assert.match(ics.text, /BEGIN:VCALENDAR/); assert.match(ics.text, /UID:2026-10-12-shift@shiftcal-abcdefgh/); assert.match(ics.text, /TRIGGER:-PT15M/); assert.equal(ics.seq, 1);
  const last = { at: 1, seq: 1, ev: Object.fromEntries(Object.entries(ev).map(([k, e]) => [k, e.sig])) };
  const ev2 = { ...ev }; delete ev2['2026-10-31-hol']; ev2['2026-10-12-shift'] = { ...ev2['2026-10-12-shift'], sig: 'changed' };
  const diff = diffExport(ev2, last, { from: '2026-10-12', to: '2026-10-31' }, '2026-10-12');
  assert.equal(diff?.changed.length, 1); assert.equal(diff?.removed.length, 1);
  assert.match(buildIcs(ev2, diff, last, [], 'abcdefghij', new Date()).text, /STATUS:CANCELLED/);
  assert.equal(diffExport(ev, null, { from: '', to: '' }, ''), null);
});

const world: Record<string, unknown> = {};
const alice = createSocial(memoryStore('alice', false, world));
const sam = createSocial(memoryStore('sam', false, world));
const once = <T,>(sub: (cb: (v: T) => void, err: (e: unknown) => void) => () => void): Promise<{ v?: T; err?: unknown }> =>
  new Promise(res => { const stop = sub(v => { res({ v }); setTimeout(stop, 0); }, e => { res({ err: e }); }); });

await t('sharing: invite, join, access rules, switch off', async () => {
  const code = newCode();
  const inv = await alice.createInvite({ uid: 'alice', name: 'Alice' }, code, Date.now());
  assert.equal((await sam.getInvite(code))?.owner, 'alice');
  assert.equal(await sam.getInvite('not a code!'), null);
  await assert.rejects(() => sam.join({ uid: 'alice', name: 'A', email: 'a@x' }, inv, code, Date.now()), /own invite/);
  await assert.rejects(() => sam.join({ uid: 'sam', name: 'Sam', email: 's@x' }, { ...inv, expires: 1 }, code, Date.now()), /expired/);
  const view = buildSharedView({ ...profile, name: 'Alice', patterns: [pat] }, { '2026-10-12': { type: 'VAC', hours: 7.5 } }, '2026-10-12');
  await alice.publish('alice', view);
  assert.ok((await once((cb, err) => sam.watchShared('alice', cb, err))).err !== undefined, 'denied before joining');
  await sam.join({ uid: 'sam', name: 'Sam', email: 's@x' }, inv, code, Date.now());
  const seen = await once<ReturnType<typeof asShared>>((cb, err) => sam.watchShared('alice', cb, err));
  assert.ok(seen.v && !seen.err); assert.equal(seen.v?.name, 'Alice');
  assert.equal(seen.v?.days['2026-10-12'], undefined, 'a vacation day is not shared');
  assert.ok(Object.keys(seen.v?.days ?? {}).length > 0);
  assert.deepEqual(Object.keys((await once(cb => alice.watchViewers('alice', cb, () => undefined))).v ?? {}), ['sam']);
  assert.equal((await once(cb => sam.watchFollowing('sam', cb, () => undefined))).v?.alice.name, 'Alice');
  await alice.setViewer('alice', 'sam', { active: false });
  assert.ok((await once((cb, err) => sam.watchShared('alice', cb, err))).err !== undefined, 'denied once switched off');
});
await t('swaps: ask, counter, approve, apply to both calendars', async () => {
  await alice.setViewer('alice', 'sam', { active: true, swap: true });
  const a = { uid: 'alice', name: 'Alice' }, b = { uid: 'sam', name: 'Sam' };
  const swap = newSwap({ a, b, aDate: '2026-10-12', aShift: am, bDate: '2026-10-16', bShift: pm, note: 'please', now: 100 });
  await alice.createSwap('sw1', swap);
  await assert.rejects(() => alice.createSwap('sw2', { ...swap, turn: 'alice' }), /not a new request/);
  await assert.rejects(() => alice.createSwap('sw3', { ...swap, bUid: 'alice', members: ['alice', 'alice'] }), /yourself/);
  await assert.rejects(() => alice.createSwap('bad id', swap), /Bad swap id/);
  const list = (await once(cb => sam.watchSwaps('sam', cb, () => undefined))).v ?? [];
  assert.equal(list.length, 1); assert.equal(list[0].turn, 'sam');
  await sam.patchSwap('sw1', counterPatch(list[0], 'sam', '2026-10-17', pm, 200));
  const mid = ((await once(cb => alice.watchSwaps('alice', cb, () => undefined))).v ?? [])[0];
  assert.equal(mid.status, 'countered'); assert.equal(mid.turn, 'alice'); assert.equal(mid.bDate, '2026-10-17');
  await alice.patchSwap('sw1', answerPatch(mid, 'alice', 'approved', 300));
  const done = ((await once(cb => alice.watchSwaps('alice', cb, () => undefined))).v ?? [])[0];
  assert.equal(done.status, 'approved');
  const planA = planApproved(done, 'alice', ctx);
  assert.equal(planA.error, ''); assert.equal(planA.writes['2026-10-12'].type, 'SWAP_OUT'); assert.equal(planA.writes['2026-10-17'].type, 'SWAP_IN');
  await alice.markApplied('sw1', 'alice');
  const after = ((await once(cb => sam.watchSwaps('sam', cb, () => undefined))).v ?? [])[0];
  assert.equal(after.applied.alice, true); assert.equal(after.status, 'approved', 'merge keeps the rest');
  await alice.deleteSwap('sw1');
  assert.equal(((await once(cb => alice.watchSwaps('alice', cb, () => undefined))).v ?? []).length, 0);
});
await t('notifications: send, read, clear; text limits mirror the rules', async () => {
  await sam.notify('alice', 'n1', newNotice({ type: 'swap', from: 'sam', fromName: 'Sam', text: 'hi', now: 5 }));
  await assert.rejects(() => sam.notify('alice', 'n2', { type: 't', from: 'sam', fromName: '', text: 'x'.repeat(300), ref: '', at: 1, read: false }), /too long/);
  let n = (await once(cb => alice.watchNotices('alice', cb, () => undefined))).v ?? [];
  assert.equal(n.length, 1); assert.equal(n[0].read, false);
  await alice.markRead('alice', ['n1']);
  n = (await once(cb => alice.watchNotices('alice', cb, () => undefined))).v ?? [];
  assert.equal(n[0].read, true); assert.equal(n[0].text, 'hi', 'marking read keeps the rest');
  await alice.deleteNotices('alice', ['n1']);
  assert.equal(((await once(cb => alice.watchNotices('alice', cb, () => undefined))).v ?? []).length, 0);
});
await t('wipe: removes my data, invites and shared copy', async () => {
  await alice.createInvite({ uid: 'alice', name: 'Alice' }, newCode(), Date.now());
  await alice.wipe('alice');
  assert.ok(!Object.keys(world).some(k => k.startsWith('users/alice') || k === 'shared/alice'));
  assert.equal(Object.values(world).filter(v => (v as { owner?: string }).owner === 'alice').length, 0);
});
await t('reading shared and swap documents never trusts them', () => {
  const sv = asShared({ name: 5, shifts: [{ id: 1 }, 'x'], days: { '2026-01-01': 'am', bad: 'x', '2026-01-02': 4 } });
  assert.deepEqual(sv?.days, { '2026-01-01': 'am' }); assert.equal(sv?.shifts.length, 1); assert.equal(asShared('nope'), null);
  assert.equal(asSwap({ members: ['a'] }), null);
  assert.equal(asSwap({ members: ['a', 'b'], status: 'weird' })?.status, 'pending');
});
console.log(`\n${passed} complete-build test groups passed`);
