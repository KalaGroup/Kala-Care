// Central registry of route-chunk importers, keyed by route path.
//
// React.lazy in App.jsx and the navbar's hover/touch prefetch both use these
// same function references. Dynamic import() dedupes by module, so a prefetch
// simply warms the module cache — when the user then clicks the link, the
// route resolves instantly instead of waiting on a fresh chunk download.
export const routeImporters = {
  '/dashboard': () => import('./pages/Dashboard'),
  '/customer-engagement': () => import('./pages/CustomerEng'),
  '/customer-engagement-2': () => import('./pages/CustomerEng2'),
  '/profile': () => import('./pages/Profile'),
  '/customers': () => import('./pages/Customer'),
  '/campaigns': () => import('./pages/Campaign'),
  '/knowledge-book': () => import('./pages/KnowledgeBook'),
  '/expense': () => import('./pages/Expense'),
  '/expense-dashboard': () => import('./pages/ExDashboard'),
  '/maintenance-schedule': () => import('./pages/MaintenanceSchedule'),
  '/maintenance-reports': () => import('./pages/MaintenanceReports'),
  '/mom-tracking': () => import('./pages/MOMTracking'),
  '/approval-application': () => import('./pages/ApprovalApplication'),
  '/sales-finance': () => import('./pages/SalseANDFinance'),
  '/aop-master': () => import('./pages/AOPMaster'),
  '/sales-labour-report': () => import('./pages/SalesLabourReport'),
  '/import': () => import('./pages/Import'),
};

// Warm a route's chunk. Safe to call repeatedly (import() dedupes) and a
// failed prefetch is ignored — the real navigation will fetch it instead.
export function prefetchRoute(path) {
  const load = routeImporters[path];
  if (load) Promise.resolve().then(load).catch(() => { });
}
