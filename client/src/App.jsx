import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useState, useEffect } from 'react';

import Navbar from './components/Navbar';
import Customer from './pages/Customer';
import Import from './pages/Import';
import Campaign from './pages/Campaign';
import CustomerEng from './pages/CustomerEng';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import CustomerEng2 from './pages/CustomerEng2';
import Expense from './pages/Expense';
import ExDashboard from './pages/ExDashboard';
import MOMTracking from './pages/MOMTracking';
import SalseANDFinance from './pages/SalseANDFinance';
import KnowledgeBank from './pages/KnowledgeBank';

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

  const routes = (
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

      {/* Knowledge Bank Page - ONLY master_admin and it_admin can access */}
      <Route path="/knowledge-bank" element={
        <ProtectedRoute allowedRoles={['master_admin', 'it_admin']}>
          <KnowledgeBank />
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