import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect, lazy, Suspense } from 'react';

import Navbar from './components/Navbar';
// Login is eager: it is the first screen an unauthenticated user sees, so we
// don't want a lazy-chunk round-trip before it can render.
import Login from './pages/Login';

// Route-level code-splitting: each page (and its heavy chart/xlsx/plotly libs)
// is bundled into its own chunk that loads only when that route is visited.
// This keeps the initial bundle small so the app paints fast instead of
// waiting for every page's code to download up front.
//
// The importer functions live in routePrefetch.js so the same references are
// shared by React.lazy, the idle prefetcher below AND the navbar's hover
// prefetch. import() dedupes, so prefetching just warms the module cache — the
// real navigation then resolves instantly instead of waiting on a chunk download.
import { routeImporters } from './routePrefetch';

const Customer = lazy(routeImporters['/customers']);
const Import = lazy(routeImporters['/import']);
const Campaign = lazy(routeImporters['/campaigns']);
const CustomerEng = lazy(routeImporters['/customer-engagement']);
const Profile = lazy(routeImporters['/profile']);
const Dashboard = lazy(routeImporters['/dashboard']);
const CustomerEng2 = lazy(routeImporters['/customer-engagement-2']);
const Expense = lazy(routeImporters['/expense']);
const ExDashboard = lazy(routeImporters['/expense-dashboard']);
const MOMTracking = lazy(routeImporters['/mom-tracking']);
const SalseANDFinance = lazy(routeImporters['/sales-finance']);
const KnowledgeBook = lazy(routeImporters['/knowledge-book']);
//added by nik
const MaintenanceSchedule = lazy(routeImporters['/maintenance-schedule']);
const MaintenanceReports = lazy(routeImporters['/maintenance-reports']);

// Route chunks to warm during idle time, most-visited first, so a later navbar
// click finds the chunk already cached. Order roughly by how often pages are hit.
const ROUTE_PREFETCHERS = [
  routeImporters['/dashboard'],
  routeImporters['/customer-engagement'],
  routeImporters['/customer-engagement-2'],
  routeImporters['/profile'],
  routeImporters['/customers'],
  routeImporters['/campaigns'],
  routeImporters['/knowledge-book'],
  routeImporters['/expense'],
  routeImporters['/expense-dashboard'],
  routeImporters['/maintenance-schedule'],
  routeImporters['/maintenance-reports'],
  routeImporters['/mom-tracking'],
  routeImporters['/sales-finance'],
  routeImporters['/import'],
];

// Prefetch route chunks one at a time during browser idle periods, yielding
// between chunks. The timeout matters: on first load the dashboard keeps the
// main thread busy (fetches + chart renders), and without it requestIdleCallback
// can be postponed for seconds — exactly when the user clicks another page.
function prefetchRouteChunks() {
  const idle = window.requestIdleCallback
    ? (cb) => window.requestIdleCallback(cb, { timeout: 700 })
    : (cb) => window.setTimeout(cb, 200);
  let i = 0;
  const step = () => {
    if (i >= ROUTE_PREFETCHERS.length) return;
    const load = ROUTE_PREFETCHERS[i++];
    // Swallow errors — a failed prefetch just means the real navigation fetches it.
    Promise.resolve().then(load).catch(() => {});
    idle(step);
  };
  idle(step);
}

// Lightweight fallback shown while a route chunk is being fetched.
function RouteFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        width: '100%',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '4px solid #e5e7eb',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'kc-route-spin 0.8s linear infinite',
        }}
      />
      <style>{'@keyframes kc-route-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

// Helper function to check if user is any type of admin
const isAdmin = (role) => {
  return role === 'master_admin' || role === 'it_admin' || role === 'branch_admin';
};

// Helper function to check if user can access import (only master_admin and it_admin)
const canAccessImport = (role) => {
  return role === 'master_admin' || role === 'it_admin';
};

// Helper function to check if user can access all pages (only master_admin and it_admin)
const canAccessAllPages = (role) => {
  return role === 'master_admin' || role === 'it_admin';
};

// Helper function to check if user can access Expense pages.
// Master Admin and IT Admin always have access.
// Branch Admin and Employee need explicit permission (can_access_expense)
// granted from the Profile page edit modal.
const canAccessExpensePages = (user) => {
  if (!user) return false;

  if (user.role === 'master_admin' || user.role === 'it_admin') {
    return true;
  }

  if (user.role === 'branch_admin' || user.role === 'employee') {
    return user.can_access_expense === true;
  }

  return false;
};

// MODIFIED: ProtectedRoute with custom condition support
const ProtectedRoute = ({ children, allowedRoles, customCheck = null }) => {
  const user = JSON.parse(sessionStorage.getItem('user'));
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check custom condition (like branch-specific access)
  if (customCheck && !customCheck(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Change PublicRoute component
const PublicRoute = ({ children }) => {
  const user = sessionStorage.getItem('user');
  const location = useLocation();

  if (user && location.pathname === '/login') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function Layout() {
  const location = useLocation();
  const user = JSON.parse(sessionStorage.getItem('user'));

  const hideNavbar = location.pathname === "/login";

  // Warm the other route chunks in the background so navbar clicks open
  // instantly instead of waiting on a fresh chunk download each time.
  useEffect(() => {
    if (!user) return; // only prefetch for logged-in users (routes are gated)
    prefetchRouteChunks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh user from server once per app load so permission changes
  // (like can_access_expense) reflect without requiring re-login.
  useEffect(() => {
    if (!user) return;
    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
    fetch(`${API_BASE_URL}/users/profile`, {
      headers: { 'user-id': user.user_id }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.user) {
          const stored = JSON.parse(sessionStorage.getItem('user') || '{}');
          const merged = {
            ...data.user,
            branches: stored.branches || [],
            branch: stored.branch || data.user.branch,
            branch_name: stored.branch_name || data.user.branch_name,
            primary_branch: stored.primary_branch,
            primary_branch_name: stored.primary_branch_name
          };
          sessionStorage.setItem('user', JSON.stringify(merged));
        }
      })
      .catch(() => { /* ignore */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // key={location.pathname}: React Router runs navigations inside
  // startTransition, so when the target page's chunk isn't loaded yet React
  // would keep showing the OLD page (URL changes, screen doesn't) until the
  // download finishes. Remounting the boundary per path makes the fallback
  // spinner appear immediately on click instead.
  const routes = (
    <Suspense key={location.pathname} fallback={<RouteFallback />}>
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />

      {/* Profile Page - All authenticated users can access */}
      <Route path="/profile" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}>
          <Profile />
        </ProtectedRoute>
      } />

      {/* Dashboard Page - All authenticated users can access */}
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}>
          <Dashboard />
        </ProtectedRoute>
      } />

      {/* Customer Engagement Pages - All authenticated users can access */}
      <Route path="/customer-engagement" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}>
          <CustomerEng />
        </ProtectedRoute>
      } />

      <Route path="/customer-engagement-2" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}>
          <CustomerEng2 />
        </ProtectedRoute>
      } />

      {/* Sales and Finance Page - All authenticated users can access */}
      <Route path="/sales-finance" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin']}>
          <SalseANDFinance />
        </ProtectedRoute>
      } />

      {/* MOM Tracking Page - All authenticated users can access */}
      <Route path="/mom-tracking" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin']}>
          <MOMTracking />
        </ProtectedRoute>
      } />

      {/* Knowledge Book Page */}
      <Route path="/knowledge-book" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}
        >
          <KnowledgeBook />
        </ProtectedRoute>
      } />

      {/* MODIFIED: Expense Page - With branch check for employees */}
      <Route path="/expense" element={
        <ProtectedRoute
          allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}
          customCheck={canAccessExpensePages}
        >
          <Expense />
        </ProtectedRoute>
      } />

      {/* MODIFIED: Expense Dashboard Page - With branch check for employees */}
      <Route path="/expense-dashboard" element={
        <ProtectedRoute
          allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}
          customCheck={canAccessExpensePages}
        >
          <ExDashboard />
        </ProtectedRoute>
      } />

      {/* Customers Page - ONLY master_admin and it_admin can access */}
      <Route path="/customers" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin']}>
          <Customer />
        </ProtectedRoute>
      } />

      {/* Import Page - ONLY master_admin and it_admin can access */}
      <Route path="/import" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin']}>
          <Import />
        </ProtectedRoute>
      } />

      {/* Campaigns Page - ONLY master_admin and it_admin can access */}
      <Route path="/campaigns" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin']}>
          <Campaign />
        </ProtectedRoute>
      } />

      {/* Maintenance Check Schedule */}
      <Route path="/maintenance-schedule" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin', 'branch_admin', 'employee']}>
          <MaintenanceSchedule />
        </ProtectedRoute>
      } />

      {/* Maintenance Reports — separate page */}
      <Route path="/maintenance-reports" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin']}>
          <MaintenanceReports />
        </ProtectedRoute>
      } />

      {/* Default redirect - ALWAYS go to dashboard for any logged in user */}
      <Route path="/" element={
        user ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <Navigate to="/login" replace />
        )
      } />

      {/* Catch all other routes - redirect to dashboard for logged in users */}
      <Route path="*" element={
        user ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <Navigate to="/login" replace />
        )
      } />
    </Routes>
    </Suspense>
  );

  return hideNavbar ? routes : <Navbar>{routes}</Navbar>;
}

function App() {
  return (
    <div className="App">
      <Layout />
      <Toaster
        position="top-right"
        containerClassName="react-hot-toast-container"
        toastOptions={{
          className: 'react-hot-toast',
          duration: 2000,
        }}
        gutter={8}
        reverseOrder={false}
        limit={1}
      />
    </div>
  );
}

export default App;