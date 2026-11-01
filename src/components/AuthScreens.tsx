import { useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { useData } from '../state/DataContext';
import { missingConfigKeys } from '../services/firebase-config';

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/email-already-in-use': 'An account with this email already exists. Log in instead.',
  'auth/weak-password': 'Use a password of at least 8 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before sign-in finished.',
  'auth/cancelled-popup-request': '',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/unauthorized-domain': 'Add this site in Firebase > Authentication > Settings > Authorized domains.',
  'auth/operation-not-allowed': 'This sign-in method is not turned on in Firebase > Authentication > Sign-in method.'
};

function authMessage(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code in AUTH_MESSAGES) return AUTH_MESSAGES[code];
  return e instanceof Error && e.message ? e.message : 'Something went wrong.';
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">{children}</main>;
}

export function BootSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6" aria-busy="true" aria-label="Loading" data-testid="boot-skeleton">
      <div className="mb-4 h-8 w-1/2 animate-pulse rounded-md bg-canvas-inset" />
      <div className="mb-3 h-16 animate-pulse rounded-md bg-canvas-inset" />
      <div className="h-80 animate-pulse rounded-md bg-canvas-inset" />
    </main>
  );
}

export function ConfigScreen() {
  const missing = missingConfigKeys();
  return (
    <Centered>
      <h1 className="text-2xl font-semibold">Almost there</h1>
      <p className="text-fg-muted">Firebase is not configured yet. Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env.local</code>, fill in your web app settings, then restart the dev server.</p>
      <ul className="card-subtle p-3 font-mono text-xs" data-testid="missing-config">
        {missing.map(k => <li key={k}>{k}</li>)}
      </ul>
      <a className="btn" href="?demo=1">Preview with sample data</a>
    </Centered>
  );
}

export function FatalScreen() {
  const { error } = useData();
  return (
    <Centered>
      <h1 className="text-2xl font-semibold">Could not start</h1>
      <p className="rounded-md border border-danger/40 bg-danger-subtle p-3 text-sm text-danger" role="alert">{error}</p>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
    </Centered>
  );
}

export function LoginScreen() {
  const { backend, demo } = useData();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean }>({ text: '', ok: false });
  const [busy, setBusy] = useState(false);

  if (!backend) return null;

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setMessage({ text: '', ok: false });
    try { await action(); } catch (e) { setMessage({ text: authMessage(e), ok: false }); }
    setBusy(false);
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!email.trim() || password.length < 8) {
      setMessage({ text: 'Enter your email and a password of at least 8 characters.', ok: false });
      return;
    }
    void run(() => (signup ? backend.signUp(email.trim(), password) : backend.signIn(email.trim(), password)));
  };

  const reset = (): void => {
    if (!email.trim()) { setMessage({ text: 'Type your email above first.', ok: false }); return; }
    void run(async () => {
      await backend.reset(email.trim());
      setMessage({ text: 'Password reset email sent. Check your inbox and spam folder.', ok: true });
    });
  };

  return (
    <Centered>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-emphasis text-white" aria-hidden="true"><CalendarDays size={26} /></span>
        <div>
          <h1 className="text-2xl font-semibold">Shift Calendar</h1>
          <p className="text-sm text-fg-muted">Your rotation, holidays, leave and pay days in one calendar.</p>
        </div>
      </div>
      <div className="card flex flex-col gap-3 p-4">
        <h2 className="text-xl font-semibold">{signup ? 'Create account' : 'Log in'}</h2>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => backend.google())} data-testid="google-sign-in">Continue with Google</button>
        <div className="flex items-center gap-2 text-xs text-fg-muted"><span className="h-px flex-1 bg-line" />or use email<span className="h-px flex-1 bg-line" /></div>
        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <div>
            <label htmlFor="email" className="label mb-1 block">Email</label>
            <input id="email" className="field" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="password" className="label mb-1 block">Password</label>
            <input id="password" className="field" type="password" autoComplete={signup ? 'new-password' : 'current-password'} placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <p role="alert" className={message.ok ? 'text-xs text-success' : 'text-xs text-danger'} data-testid="auth-message">{message.text}</p>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="auth-submit">{signup ? 'Create account' : 'Log in'}</button>
        </form>
        {!signup && <button type="button" className="text-left text-sm font-semibold text-accent hover:underline" onClick={reset}>Forgot password?</button>}
        <p className="text-center text-sm text-fg-muted">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setSignup(s => !s)}>{signup ? 'Log in' : 'Create an account'}</button>
        </p>
        {demo && <p className="text-center text-xs text-fg-muted">Preview mode: any email and password signs you in.</p>}
      </div>
    </Centered>
  );
}
