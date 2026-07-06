// Central Excel/CSV export permission check, used by every page that
// renders an "Export" button.
//
// Master Admin can always export; everyone else needs the per-user
// can_export flag from the users table (granted/revoked in the Profile
// page edit modal, saved into the sessionStorage user at login).
export const canExportExcel = (user) => {
  let u = user;
  if (u === undefined) {
    try {
      u = JSON.parse(sessionStorage.getItem('user') || 'null');
    } catch {
      u = null;
    }
  }
  return !!u && (u.role === 'master_admin' || u.can_export === true);
};
