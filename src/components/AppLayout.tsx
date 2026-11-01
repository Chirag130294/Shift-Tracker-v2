import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bell, CalendarDays, CalendarRange, DollarSign, LogOut, Settings, Wallet, type LucideIcon } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useSocial } from '../state/SocialContext';
import { cn } from '../utils/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
  testId: string;
}

/** The one list both navigation bars are drawn from, so they can never disagree. */
const NAV: readonly NavItem[] = [
  { to: '/', label: 'Calendar', icon: CalendarDays, end: true, testId: 'nav-calendar' },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarRange, end: false, testId: 'nav-upcoming' },
  { to: '/pay', label: 'Pay', icon: DollarSign, end: false, testId: 'nav-pay' },
  { to: '/leave', label: 'Leave', icon: Wallet, end: false, testId: 'nav-leave' },
  { to: '/settings', label: 'Settings', icon: Settings, end: false, testId: 'nav-settings' }
];

/** Top bar on wide screens, bottom tab bar on phones. Wraps every signed-in screen. */
export function AppLayout({ children }: { children: ReactNode }) {
  const { demo, user, signOut } = useData();
  const { unread, waiting } = useSocial();
  const bell = unread + waiting;

  return (
    <div className="min-h-dvh bg-canvas-subtle">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-emphasis text-white" aria-hidden="true"><CalendarDays size={16} /></span>
            Shift Calendar
            {demo && <span className="rounded-full border border-line px-2 py-0.5 text-xs font-normal text-fg-muted" data-testid="demo-badge">Preview</span>}
          </span>
          <nav aria-label="Main" className="ml-4 hidden gap-1 md:flex">
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={`top-${item.testId}`}
                className={({ isActive }) => cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', isActive ? 'bg-canvas-inset text-fg' : 'text-fg-muted hover:bg-canvas-subtle hover:text-fg')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/notifications" className="btn btn-invisible btn-icon relative" aria-label={bell ? `Notifications, ${bell} new` : 'Notifications'} data-testid="bell">
              <Bell size={16} aria-hidden="true" />
              {bell > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger-emphasis px-1 text-[10px] font-semibold leading-4 text-white" data-testid="bell-count">{bell}</span>}
            </Link>
            <span className="hidden max-w-[16rem] truncate text-xs text-fg-muted sm:block">{user?.email}</span>
            <button type="button" className="btn btn-invisible btn-sm" onClick={signOut} data-testid="sign-out">
              <LogOut size={14} aria-hidden="true" /> Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 md:pb-10">{children}</main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(item => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                data-testid={item.testId}
                className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors', isActive ? 'text-accent' : 'text-fg-muted')}
              >
                <item.icon size={20} aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
