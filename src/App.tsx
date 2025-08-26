import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Suspense, lazy } from "react";
import PWAUpdateNotification from "./components/common/PWAUpdateNotification";
import { AuthProvider } from "./context/AuthContext";
import { LeagueProvider } from "./context/LeagueContext";
import { HeaderProvider } from "./context/HeaderContext";
import AppLayout from "./layout/AppLayout";
import PWAPrompt from 'react-ios-pwa-prompt';
import PrivateRoute from "./components/auth/PrivateRoute";
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/common/ErrorBoundary';
import { SkeletonPage } from './components/ui/skeleton/SkeletonLoader';

// Lazy load all page components for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const AdminIndex = lazy(() => import('./pages/Admin/AdminIndex'));
const StandingsTools = lazy(() => import('./pages/Admin/StandingsTools'));
const HealthTools = lazy(() => import('./pages/Admin/HealthTools'));
const DataTools = lazy(() => import('./pages/Admin/DataTools'));
const TipsTools = lazy(() => import('./pages/Admin/TipsTools'));
const NotificationsTools = lazy(() => import('./pages/Admin/NotificationsTools'));
const RolesTools = lazy(() => import('./pages/Admin/RolesTools'));
const MockTools = lazy(() => import('./pages/Admin/MockTools'));
const LeaguesPage = lazy(() => import("./pages/LeaguesPage"));
const LeagueDetail = lazy(() => import("./pages/LeagueDetail"));

const LineupPage = lazy(() => import('./pages/LineupPage'));
const TipsPage = lazy(() => import('./pages/TipsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));

// Authentication pages (keep these non-lazy for faster auth flow)
import SignIn from "./pages/Authentication/SignIn";
import SignUp from "./pages/Authentication/SignUp";
import ResetPassword from "./pages/Authentication/ResetPassword";

// Loading fallback component
const PageLoadingFallback = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
    <SkeletonPage type="dashboard" />
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <LeagueProvider>
          <HeaderProvider>
            <BrowserRouter>
            <Routes>
            {/* private */}
            <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
              <Route path="/" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <HomePage />
                </Suspense>
              } />
              <Route path="/tips" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <TipsPage />
                </Suspense>
              } />
              <Route path="/leagues" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <LeaguesPage />
                </Suspense>
              } />
              <Route path="/leagues/:id" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <LeagueDetail />
                </Suspense>
              } />

              <Route path="/lineup" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <LineupPage />
                </Suspense>
              } />
              <Route path="/leagues/:leagueId/lineup/:week" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <LineupPage />
                </Suspense>
              } />
              <Route path="/profile" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <UserProfilePage />
                </Suspense>
              } />
              <Route path="/notifications" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <NotificationsPage />
                </Suspense>
              } />
              <Route path="/admin" element={
                <Suspense fallback={<PageLoadingFallback />}>
                  <AdminIndex />
                </Suspense>
              }>
                <Route index element={<Navigate to="/admin/standings" replace />} />
                <Route path="standings" element={<Suspense fallback={<PageLoadingFallback />}><StandingsTools /></Suspense>} />
                <Route path="health" element={<Suspense fallback={<PageLoadingFallback />}><HealthTools /></Suspense>} />
                <Route path="data" element={<Suspense fallback={<PageLoadingFallback />}><DataTools /></Suspense>} />
                <Route path="mock" element={<Suspense fallback={<PageLoadingFallback />}><MockTools /></Suspense>} />
                <Route path="tips" element={<Suspense fallback={<PageLoadingFallback />}><TipsTools /></Suspense>} />
                <Route path="notifications" element={<Suspense fallback={<PageLoadingFallback />}><NotificationsTools /></Suspense>} />
                <Route path="roles" element={<Suspense fallback={<PageLoadingFallback />}><RolesTools /></Suspense>} />
              </Route>
            </Route>
            {/* public */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            </Routes>
            </BrowserRouter>
            <PWAUpdateNotification />
            <Toaster />
            <PWAPrompt />
          </HeaderProvider>
        </LeagueProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
