// Small shared building blocks for the form-style screens. Everything is a plain element with Primer classes.
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn';
import { inkFor } from '../utils/color';

/** A screen with a title and a back button. `footer` is a sticky action bar. */
export function Page({ title, children, footer, right, backTo }: { title: string; children: ReactNode; footer?: ReactNode; right?: ReactNode; backTo?: string }) {
  const nav = useNavigate();
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="page">
      <div className="flex items-center gap-2">
        {backTo !== undefined && (
          <button type="button" className="btn btn-invisible btn-icon" aria-label="Back" onClick={() => (backTo ? nav(backTo) : nav(-1))} data-testid="back"><ArrowLeft size={18} aria-hidden="true" /></button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
        {right}
      </div>
      {children}
      {footer && <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 rounded-lg border border-line bg-canvas p-2 shadow-overlay md:bottom-4">{footer}</div>}
    </div>
  );
}

export const Section = ({ children }: { children: ReactNode }) => <h2 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{children}</h2>;

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'error' }) {
  const cls = tone === 'error' ? 'border-danger/40 bg-danger-subtle text-danger' : tone === 'warn' ? 'border-attention/40 bg-attention-subtle text-attention' : 'border-line bg-canvas-subtle text-fg-muted';
  return <div className={cn('rounded-md border p-3 text-sm', cls)} role={tone === 'error' ? 'alert' : undefined}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="label block">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>;
export function TextField({ label, value, onChange, hint, ...rest }: { label: string; value: string; onChange: (v: string) => void; hint?: string } & InputProps) {
  return <Field label={label} hint={hint}>{id => <input id={id} className="field" value={value} onChange={e => onChange(e.target.value)} {...rest} />}</Field>;
}
/** A number box that keeps what you type until you leave it, then reports a clean number. */
export function NumberField({ label, value, onChange, hint, step = '0.01', min = 0, ...rest }: { label: string; value: number | ''; onChange: (v: number | '') => void; hint?: string; step?: string; min?: number } & InputProps) {
  return (
    <Field label={label} hint={hint}>
      {id => <input id={id} type="number" inputMode="decimal" className="field" step={step} min={min} defaultValue={value === '' ? '' : +value} key={String(value)}
        onBlur={e => { const raw = e.currentTarget.value; onChange(raw === '' ? '' : Math.max(min, Number(raw) || 0)); }} {...rest} />}
    </Field>
  );
}
export function SelectField<T extends string | number>({ label, value, options, onChange, hint }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {id => (
        <select id={id} className="field" value={String(value)} onChange={e => { const o = options.find(x => String(x[0]) === e.target.value); if (o) onChange(o[0]); }}>
          {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
        </select>
      )}
    </Field>
  );
}

/** One choice out of a few, as a row of buttons. */
export function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap overflow-hidden rounded-md border border-line">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value}
          className={cn('min-h-[32px] border-r border-line px-3 text-sm last:border-r-0', v === value ? 'bg-accent-emphasis font-medium text-white' : 'bg-canvas text-fg hover:bg-canvas-subtle')}
          onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Toggle({ label, on, onChange, hint, testId }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string; testId?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-fg-muted">{hint}</div>}</div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} data-testid={testId}
        className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors', on ? 'border-success-emphasis bg-success-emphasis' : 'border-line bg-canvas-inset')}
        onClick={() => onChange(!on)}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

export function MenuRow({ to, icon: Icon, title, sub, badge, testId }: { to: string; icon: LucideIcon; title: string; sub?: string; badge?: number; testId?: string }) {
  return (
    <Link to={to} data-testid={testId} className="flex min-h-[52px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-canvas-subtle">
      <Icon size={18} className="shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span>{sub && <span className="block truncate text-xs text-fg-muted">{sub}</span>}</span>
      {!!badge && <span className="rounded-full bg-danger-emphasis px-1.5 text-xs font-semibold text-white">{badge}</span>}
      <ChevronRight size={16} className="text-fg-subtle" aria-hidden="true" />
    </Link>
  );
}
export const MenuGroup = ({ children }: { children: ReactNode }) => <div className="card overflow-hidden">{children}</div>;

/** The coloured code chip for a shift. */
export function ShiftBadge({ code, color, big }: { code: string; color: string; big?: boolean }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-md font-bold', big ? 'h-11 w-14 text-base' : 'h-6 min-w-8 px-1.5 text-xs')} style={{ background: color, color: inkFor(color) }}>{code}</span>
  );
}
export const OffBadge = ({ big }: { big?: boolean }) => <span className={cn('inline-flex shrink-0 items-center justify-center rounded-md bg-canvas-inset font-semibold text-fg-muted', big ? 'h-11 w-14 text-sm' : 'h-6 min-w-8 px-1.5 text-xs')}>Off</span>;

export const Avatar = ({ text }: { text: string }) => <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent" aria-hidden="true">{text}</span>;

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="card-subtle p-6 text-center"><p className="font-semibold">{title}</p>{children && <p className="mt-1 text-sm text-fg-muted">{children}</p>}{action && <div className="mt-3">{action}</div>}</div>;
}

export const ask = (message: string): boolean => window.confirm(message);
