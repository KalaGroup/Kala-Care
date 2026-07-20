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
