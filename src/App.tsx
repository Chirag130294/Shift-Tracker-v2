import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AppLayout } from './components/AppLayout';
import { BootSkeleton, ConfigScreen, FatalScreen, LoginScreen } from './components/AuthScreens';
import { CalendarPage } from './components/CalendarPage';
import { BankLedger, LeaveDashboard } from './components/LeaveDashboard';
import { ToastProvider } from './components/Toast';
import { DataProvider, useData } from './state/DataContext';
import { SocialProvider } from './state/SocialContext';
import { takeJoinCode } from './state/joinLink';
import { BankEditPage } from './screens/BankEdit';
import { BookPage } from './screens/Book';
import { PayBreaksPage, PayDatesPage, PayDayRulePage, PayHub, PayLeavePage, PayPage, PayPremiumsPage, PayRatePage } from './screens/Pay';
import { RotationPage, ShiftEditPage, ShiftsPage } from './screens/Rotation';
import { CountryPage, DataPage, DisplayPage, ExportPage, HolidaysPage, ProfilePage, RegionPage, SettingsHub } from './screens/Settings';
import { SetupWizard } from './screens/Setup';
import { ColleaguePage, FollowPage, JoinPage, NoticesPage, SharingPage, SwapCounterPage, SwapNewPage, SwapViewPage, WhoCanPage } from './screens/Social';
import { SwapLogPage } from './screens/SwapLog';
import { UpcomingPage } from './screens/Upcoming';
import { useEffect } from 'react';

/** Fades and lifts each screen in; the old one leaves first so two screens are never on top of each other. */
function AnimatedRoutes() {
  const location = useLocation();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        <Routes location={location}>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/leave" element={<LeaveDashboard />} />
          <Route path="/leave/book" element={<BookPage />} />
          <Route path="/leave/edit/:bankId" element={<BankEditPage />} />
          <Route path="/leave/:bankId" element={<BankLedger />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          <Route path="/pay" element={<PayPage />} />
          <Route path="/settings" element={<SettingsHub />} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/settings/display" element={<DisplayPage />} />
          <Route path="/settings/data" element={<DataPage />} />
          <Route path="/settings/country" element={<CountryPage />} />
          <Route path="/settings/region" element={<RegionPage />} />
          <Route path="/settings/holidays" element={<HolidaysPage />} />
          <Route path="/settings/export" element={<ExportPage />} />
          <Route path="/settings/rotation" element={<RotationPage />} />
          <Route path="/settings/shifts" element={<ShiftsPage />} />
          <Route path="/settings/shifts/:shiftId" element={<ShiftEditPage />} />
          <Route path="/settings/pay" element={<PayHub />} />
          <Route path="/settings/pay/rate" element={<PayRatePage />} />
          <Route path="/settings/pay/premiums" element={<PayPremiumsPage />} />
          <Route path="/settings/pay/breaks" element={<PayBreaksPage />} />
          <Route path="/settings/pay/leave" element={<PayLeavePage />} />
          <Route path="/settings/pay/dates" element={<PayDatesPage />} />
          <Route path="/settings/pay/day" element={<PayDayRulePage />} />
          <Route path="/settings/sharing" element={<SharingPage />} />
          <Route path="/settings/following" element={<FollowPage />} />
          <Route path="/notifications" element={<NoticesPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/colleague/:owner" element={<ColleaguePage />} />
          <Route path="/swap/new/:owner" element={<SwapNewPage />} />
          <Route path="/swap/:id" element={<SwapViewPage />} />
          <Route path="/swap/:id/counter" element={<SwapCounterPage />} />
          <Route path="/who/:date" element={<WhoCanPage />} />
          <Route path="/swap-log/:date/:mode" element={<SwapLogPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

/** Chooses what to show for each stage of start-up: loading, sign-in, or the app itself. */
/** An invite link opened while signed in goes straight to the Accept screen. */
function JoinRedirect() {
  const nav = useNavigate();
  useEffect(() => { const c = takeJoinCode(); if (c) nav(`/join/${c}`, { replace: true }); }, [nav]);
  return null;
}

function Gate() {
  const { phase } = useData();
  switch (phase) {
    case 'booting':
    case 'loading': return <BootSkeleton />;
    case 'config': return <ConfigScreen />;
    case 'fatal': return <FatalScreen />;
    case 'login': return <LoginScreen />;
    case 'onboarding': return <SetupWizard />;
    case 'ready':
      return (
        <SocialProvider>
          <JoinRedirect />
          <AppLayout>
            <AnimatedRoutes />
          </AppLayout>
        </SocialProvider>
      );
  }
}

export default function App() {
  return (
    <ToastProvider>
      <DataProvider>
        {/* HashRouter keeps working on static hosts such as GitHub Pages, which cannot rewrite deep links. */}
        <HashRouter>
          <Gate />
        </HashRouter>
      </DataProvider>
    </ToastProvider>
  );
}
