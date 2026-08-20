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
    return u.role === 'master_admin' || u.can_access_pms === true;
};

/** 'none' | 'view' | 'edit' for the AOP & Master page. */
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

export const canViewAop = (user) => aopAccessLevel(user) !== 'none';
export const canEditAop = (user) => aopAccessLevel(user) === 'edit';
