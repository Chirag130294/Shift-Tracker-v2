// An invite link looks like https://host/path/?join=CODE. Read it once at start-up and take it out of the address bar.
const read = (): string => {
  try {
    const u = new URL(window.location.href);
    const c = u.searchParams.get('join');
    if (!c) return '';
    u.searchParams.delete('join');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    return c.replace(/[^a-z0-9]/gi, '').slice(0, 40);
  } catch { return ''; }
};
let pending = read();
/** The code from the address bar, once. */
export function takeJoinCode(): string { const c = pending; pending = ''; return c; }
export const inviteLink = (code: string): string => `${window.location.origin}${window.location.pathname}?join=${code}`;
