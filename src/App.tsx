import { BrowserRouter as Router, Routes, Route } from "react-router";
import { Suspense, lazy } from "react";
import PWAUpdateNotification from "./components/common/PWAUpdateNotification";
import { AuthProvider } from "./context/AuthContext";
import AppLayout from "./layout/AppLayout";
import PWAPrompt from 'react-ios-pwa-prompt';
import PrivateRoute from "./components/auth/PrivateRoute";
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/common/ErrorBoundary';
import { SkeletonPage } from './components/ui/skeleton/SkeletonLoader';

// Lazy load all page components for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const LeaguesPage = lazy(() => import("./pages/LeaguesPage"));
const LeagueDetail = lazy(() => import("./pages/LeagueDetail"));
const LineupPage = lazy(() => import('./pages/LineupPage'));
const TipsPage = lazy(() => import('./pages/TipsPage'));
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
        <Router>
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
            <Route path="/admin" element={
              <Suspense fallback={<PageLoadingFallback />}>
                <AdminPage />
              </Suspense>
            } />
          </Route>
          {/* public */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          </Routes>
        </Router>
        <PWAUpdateNotification />
        <Toaster />
        <PWAPrompt />
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
