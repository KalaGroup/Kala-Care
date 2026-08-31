/* Per-user page visibility for Part Detail Info and MOM Tracking.

   Master Admin grants/revokes these flags from Profile → Edit Employee;
   they arrive in the login payload (sessionStorage 'user') as
   can_access_part_detail / can_access_mom.

   Sessions created BEFORE the permission columns existed have no flag at
   all — those fall back to the old behaviour (master admin sees the page,
   everyone else doesn't) until the user logs in again. */

const readUser = (user) => {
    if (user) return user;
    try { return JSON.parse(sessionStorage.getItem('user')) || null; } catch { return null; }
};

const allowed = (u, flag) => {
    if (!u) return false;
    if (u[flag] === undefined || u[flag] === null) return u.role === 'master_admin'; // pre-migration session
    return u[flag] === true;
};

export const canAccessPartDetail = (user) => allowed(readUser(user), 'can_access_part_detail');
export const canAccessMom = (user) => allowed(readUser(user), 'can_access_mom');
export const canAccessApproval = (user) => allowed(readUser(user), 'can_access_approval');

/* Open Quotation Tracker — the branch-wise service quotation vs invoicing summary.
   Master Admin always has it; everyone else needs the flag Master Admin grants
   from Profile. Not `allowed()`: that falls back to the ROLE while the flag is
   missing, which is right for the older pages (their column has been on every
   session for months) but wrong here — a session created before this page
   existed carries no flag at all, and a branch admin must not inherit it. */
export const canAccessQuotationTracker = (user) => {
    const u = readUser(user);
    if (!u) return false;
    return u.role === 'master_admin' || u.can_access_quotation_tracker === true;
};

/* ---- PMS module -------------------------------------------------------
   PMS Access (all PMS pages) is one flag, granted by Master Admin from
   Profile. The AOP & Master page inside it has its own three levels —
   'none' | 'view' | 'edit' — because target setting is sensitive; only the
   ids in VITE_PMS_AOP_ADMIN_IDS may grant that, and they always hold 'edit'
   themselves (the server enforces the same list). */

export const AOP_ADMIN_IDS = (import.meta.env.VITE_PMS_AOP_ADMIN_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

export const isAopRightsAdmin = (user) => {
    const u = readUser(user);
    return !!u && AOP_ADMIN_IDS.includes(String(u.user_id || ''));
};

/* The Master Admin always has PMS; everyone else needs the granted flag.
   (Not `allowed()` — that only falls back to the role while the flag is
   missing, and the server sends can_access_pms=false for master admins.) */
export const canAccessPms = (user) => {
    const u = readUser(user);
    if (!u) return false;
    if (isAopRightsAdmin(u)) return true;            // the rights admins always hold PMS
    return u.role === 'master_admin' || u.can_access_pms === true;
};

/** The REPORT pages inside PMS, in menu order. PMS Access opens the module and
    this list says which reports the user actually sees. AOP & Master is
    deliberately NOT here — it has its own view/edit rights and its own per-tab
    map below. Keep this in step with PMS_PAGE_KEYS in
    server/app/controllers/user_controller.py and with the page= each endpoint
    passes to _require_pms_page in server/app/routes/pms_routes.py. */
export const PMS_PAGES = [
    { key: 'sales_labour', name: 'Sales & Labour Report', path: '/sales-labour-report' },
    { key: 'employee_productivity', name: 'Employee Productivity', path: '/employee-productivity' },
    { key: 'sr_allocation', name: 'SR Allocation Report', path: '/sr-allocation' },
    { key: 'se_performance', name: 'SE Performance', path: '/se-performance' },
    { key: 'training', name: 'Training Report', path: '/training-report' },
    { key: 'annual', name: 'Annual Reports', path: '/annual-reports' },
];

export const PMS_PAGE_KEYS = PMS_PAGES.map((p) => p.key);

/** The stored per-page list, or NULL when the user has no per-page restriction
    at all — then PMS Access opens every report page, which is how it worked
    before per-page rights existed. An EMPTY array is the opposite: no report
    page was ticked. */
export const pmsPagesList = (user) => {
    const u = readUser(user);
    if (!u) return null;
    if (isAopRightsAdmin(u)) return null;            // rights admins = every page
    let raw = u.pms_pages;
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return null; }
    }
    if (!Array.isArray(raw)) return null;
    return PMS_PAGE_KEYS.filter((k) => raw.includes(k));      // menu order, deduped
};

/** May this user open one PMS report page? Takes a page key or its route path. */
export const canAccessPmsPage = (keyOrPath, user) => {
    const u = readUser(user);
    if (!canAccessPms(u)) return false;
    const entry = PMS_PAGES.find((p) => p.key === keyOrPath || p.path === keyOrPath);
    const pages = pmsPagesList(u);
    if (pages !== null && !(entry && pages.includes(entry.key))) return false;
    // Annual Reports is four sheets behind one menu item — see ANNUAL_TABS
    // below. With every sheet taken away there is nothing behind it, so the
    // page itself is closed (menu item, route guard and all).
    if (entry && entry.key === 'annual' && !annualSheetsOpen(u)) return false;
    return true;
};

/** The report pages this user may open, in menu order. */
export const visiblePmsPages = (user) => {
    const u = readUser(user);
    if (!canAccessPms(u)) return [];
    const pages = pmsPagesList(u);
    const list = pages === null ? PMS_PAGES : PMS_PAGES.filter((p) => pages.includes(p.key));
    // Annual Reports is four sheets behind one menu item: with every sheet
    // taken away there is nothing behind it, so the item goes too.
    return list.filter((p) => p.key !== 'annual' || annualSheetsOpen(u));
};

/** The report SHEETS of the Annual Reports page, in the order its picker lists
    them. That page is one PMS page holding four yearly reports, so the rights
    go one level deeper: the 'annual' page opens the page, this list says which
    of its reports the user actually sees. The sheets only READ (what they print
    is typed in AOP & Master), so a sheet is shown or it is not — there is no
    view/edit level here. Keep it in step with ANNUAL_TAB_KEYS in
    server/app/controllers/user_controller.py and with the tab= each endpoint
    passes to _require_annual_tab in server/app/routes/pms_routes.py. */
export const ANNUAL_TABS = [
    { key: 'service_penetration', name: 'Service Penetration' },
    { key: 'amc_bandhan', name: 'AMC & Bandhan Projection' },
    { key: 'cdi', name: 'Customer Delight Index (CDI)' },
    { key: 'service_load', name: 'Service Load and Response' },
];

export const ANNUAL_TAB_KEYS = ANNUAL_TABS.map((t) => t.key);

/** The stored per-sheet list, or NULL when the user was never scoped — then the
    Annual Reports page shows every sheet, which is how it worked before
    per-sheet rights existed. An EMPTY array is the opposite: no sheet ticked. */
export const annualTabsList = (user) => {
    const u = readUser(user);
    if (!u) return null;
    if (isAopRightsAdmin(u)) return null;            // rights admins = every sheet
    let raw = u.annual_tabs;
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return null; }
    }
    if (!Array.isArray(raw)) return null;
    return ANNUAL_TAB_KEYS.filter((k) => raw.includes(k));   // page order, deduped
};

/** Is ANY sheet left on the Annual Reports page? Read straight off the stored
    list (never through canAccessPmsPage, which asks this in turn). */
const annualSheetsOpen = (user) => {
    const tabs = annualTabsList(user);
    return tabs === null || tabs.length > 0;
};

/** May this user open one sheet of the Annual Reports page? */
export const canViewAnnualTab = (tabKey, user) => {
    const u = readUser(user);
    if (!canAccessPmsPage('annual', u)) return false;
    const tabs = annualTabsList(u);
    return tabs === null ? true : tabs.includes(tabKey);
};

/** The sheets this user may open, in page order ([] = the page itself is
    hidden, so the menu drops Annual Reports altogether). */
export const visibleAnnualTabs = (user) => {
    const u = readUser(user);
    if (!canAccessPmsPage('annual', u)) return [];
    const tabs = annualTabsList(u);
    return tabs === null ? ANNUAL_TABS : ANNUAL_TABS.filter((t) => tabs.includes(t.key));
};

/** The tabs of the AOP & Master page, in the order they appear there. Rights are
    per tab, so this list is the registry Profile grants from and AOPMaster
    renders from. Keep it in step with AOP_TAB_KEYS in
    server/app/controllers/user_controller.py and with the tab= each endpoint
    passes to _require_aop in server/app/routes/pms_routes.py. */
export const AOP_TABS = [
    { key: 'targets', name: 'Target Master' },
    { key: 'srtypes', name: 'SR Type Master (Sales and Labour)' },
    { key: 'mxtypes', name: 'SR Type Master (MaxTTR)' },
    { key: 'eftypes', name: 'SR Type Master (EFSR)' },
    { key: 'leadcats', name: 'Lead Category Master' },
    { key: 'cditargets', name: 'CDI Target Master' },
    { key: 'amctargets', name: 'AMC & Bandhan AOP' },
    { key: 'sltypes', name: 'SR Type Master (Service Load)' },
    { key: 'sltargets', name: 'Service Load AOP' },
];

export const AOP_TAB_KEYS = AOP_TABS.map((t) => t.key);

const AOP_RANK = { none: 0, view: 1, edit: 2 };

/** 'none' | 'view' | 'edit' for the AOP & Master page AS A WHOLE — the overall
    right granted from Profile, before the per-tab map narrows it. */
export const aopAccessLevel = (user) => {
    const u = readUser(user);
    if (!u) return 'none';
    if (isAopRightsAdmin(u)) return 'edit';          // the rights admins always have it
    if (!canAccessPms(u)) return 'none';             // AOP lives inside PMS
    if (u.aop_access === undefined || u.aop_access === null) {
        return u.role === 'master_admin' ? 'edit' : 'none';   // pre-migration session
    }
    return ['view', 'edit'].includes(u.aop_access) ? u.aop_access : 'none';
};

/** The stored per-tab map as { tab: 'view'|'edit' }, or NULL when the user has
    no per-tab restriction at all — then every tab runs at aopAccessLevel(),
    which is how the page worked before per-tab rights existed. An EMPTY object
    is the opposite: no tab was ticked, so nothing is visible. */
export const aopTabsMap = (user) => {
    const u = readUser(user);
    if (!u) return null;
    let raw = u.aop_tabs;
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return null; }
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    AOP_TAB_KEYS.forEach((k) => {
        const v = String(raw[k] || '').toLowerCase();
        if (v === 'view' || v === 'edit') out[k] = v;
    });
    return out;
};

/** 'none' | 'view' | 'edit' for ONE tab — the per-tab grant, capped by the
    overall right (a tab can never outrank it). */
export const aopTabLevel = (tabKey, user) => {
    const u = readUser(user);
    if (!u) return 'none';
    if (isAopRightsAdmin(u)) return 'edit';
    const base = aopAccessLevel(u);
    if (base === 'none') return 'none';
    const tabs = aopTabsMap(u);
    if (tabs === null) return base;                  // no per-tab map = whole page at base
    const level = tabs[tabKey] || 'none';
    return AOP_RANK[level] <= AOP_RANK[base] ? level : base;
};

/** The tabs this user may open, in page order ([] = the page itself is hidden). */
export const visibleAopTabs = (user) =>
    AOP_TABS.filter((t) => aopTabLevel(t.key, user) !== 'none');

export const canViewAopTab = (tabKey, user) => aopTabLevel(tabKey, user) !== 'none';
export const canEditAopTab = (tabKey, user) => aopTabLevel(tabKey, user) === 'edit';

/* Page-level checks (nav item, route guard): the page opens when ANY tab does. */
export const canViewAop = (user) => visibleAopTabs(user).length > 0;
export const canEditAop = (user) => visibleAopTabs(user)
    .some((t) => aopTabLevel(t.key, user) === 'edit');
