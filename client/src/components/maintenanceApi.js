// ============================================================================
// Maintenance Check Schedule — API client + shared helpers
// ----------------------------------------------------------------------------
// All data now comes from the FastAPI backend (server/app/routes/maintenance_routes.py).
// Endpoints (mounted under VITE_BACKEND_URL, which already ends in /api):
//   GET    /maintenance/app-codes            -> { success, items:[app] }
//   POST   /maintenance/app-codes            -> { success, item }            (master_admin)
//   PUT    /maintenance/app-codes/{code}     -> { success, item }            (master_admin)
//   DELETE /maintenance/app-codes/{code}     -> { success }                  (master_admin)
//   POST   /maintenance/app-codes/import     -> { success, added, replaced } (master_admin)
//   GET    /maintenance/services             -> { success, items:[service] }
//   PUT    /maintenance/services/{key}       -> { success, item }            (master_admin)
//   GET    /maintenance/activity?limit=      -> { success, items:[activity] }
//   POST   /maintenance/activity             -> { success, item }            (any signed-in user)
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// -- Kala Care theme (matches Knowledge Bank / Quotation Info Sheet) ----------
export const themeColor = '#2f3192';
export const themeDark = '#23255f';
export const themeSoft = 'rgba(47, 49, 146, 0.10)';

export const ACTION = { R: 'Replace', C: 'Check', T: 'Top-up' };

// MASTER_DATA export column order. The kit columns (Kit Number / Kit Description /
// Qty / Action) are stored on the same part line as altPartNo / altDesc / altQty /
// altAction — same order the new master file uses.
export const ORIG_HEADERS = [
    'Segment', 'App Code', 'System App Code', 'Engine Model', 'KVA', 'Emmission ',
    'Part Number', 'Part Description', 'Qty', 'Action', 'Kit Number', 'Kit Description',
    'Qty', 'Action', 'Service Hours', 'Service schedules ',
];

// Columns the Import Data parser looks for, in file order — shown as the expected
// format on the Import tab. Qty / Action appear twice in the file (once for the
// part, once for the kit), so they are labelled here to tell the pairs apart.
// 'App Code' is the only one an import cannot proceed without.
export const IMPORT_COLUMNS = [
    'Segment', 'App Code', 'System App Code', 'Engine Model', 'KVA', 'Emmission',
    'Part Number', 'Part Description', 'Qty (part)', 'Action (part)',
    'Kit Number', 'Kit Description', 'Qty (kit)', 'Action (kit)',
    'Service Hours', 'Service schedules',
];
export const IMPORT_REQUIRED_COLUMN = 'App Code';

// -- Current user (from sessionStorage, like the rest of the app) -------------
function getUser() {
    try { return JSON.parse(sessionStorage.getItem('user')) || {}; } catch { return {}; }
}
export const getRole = () => getUser().role || '';
export const getUserName = () => {
    const u = getUser();
    return u.name || u.full_name || u.user_id || 'User';
};

function headers(json = false) {
    const u = getUser();
    const h = { 'user-id': u.user_id || '', 'user-role': u.role || '' };
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

async function jget(path) {
    const res = await fetch(`${API_BASE_URL}${path}`, { headers: headers(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.detail || 'Request failed');
    return data;
}
async function jsend(method, path, body) {
    const opts = { method, headers: headers(body !== undefined) };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE_URL}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.detail || 'Request failed');
    return data;
}

// -- Application codes (master data) -----------------------------------------
export const getAppCodes = () => jget('/maintenance/app-codes').then((d) => d.items || []);
export const createAppCode = (rec) => jsend('POST', '/maintenance/app-codes', rec).then((d) => d.item);
export const updateAppCode = (code, rec) => jsend('PUT', `/maintenance/app-codes/${encodeURIComponent(code)}`, rec).then((d) => d.item);
export const deleteAppCode = (code) => jsend('DELETE', `/maintenance/app-codes/${encodeURIComponent(code)}`);
export const importAppCodes = (items) =>
    jsend('POST', '/maintenance/app-codes/import', { items }).then((d) => ({ added: d.added || [], replaced: d.replaced || [] }));

// -- Services -----------------------------------------------------------------
export const getServices = () => jget('/maintenance/services').then((d) => d.items || []);
export const renameService = (key, name) => jsend('PUT', `/maintenance/services/${encodeURIComponent(key)}`, { name }).then((d) => d.item);

// -- Search activity ----------------------------------------------------------
export const getActivity = (limit = 1000) => jget(`/maintenance/activity?limit=${limit}`).then((d) => d.items || []);

// App Mapping — Asset Detailed app codes vs the Part Detail master (master_admin).
// -> { uniqueAssetCodes, uploadedCount, remainingCount, remaining:[{appCode, engineModel, segment, kva, assets}], masterTotal }
export const getAppMapping = () => jget('/maintenance/app-mapping');
// Fire-and-forget: a look-up should never block or error the UI.
export const logActivity = (appCode) => {
    try {
        fetch(`${API_BASE_URL}/maintenance/activity`, {
            method: 'POST', headers: headers(true), body: JSON.stringify({ appCode }),
        }).catch(() => { });
    } catch { /* ignore */ }
};

// -- Pure helpers (operate on data passed in from component state) ------------
export function serviceForHours(services, hours) {
    const h = String(hours ?? '').trim() || '500';
    return services.find((s) => s.hours === h) ||
        { id: 'sv' + h, name: h + ' Hrs', short: h + ' Hr', hours: h, note: '' };
}
export const partService = (services, p) => serviceForHours(services, p.serviceHours);
export const servicesForApp = (services, app) => {
    const ids = new Set(app.parts.map((p) => partService(services, p).id));
    return services.filter((s) => ids.has(s.id));
};
export const findApp = (list, code) => list.find((a) => a.appCode === code);

export const prettyDate = (iso) => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (ts) => {
    if (!ts) return '\u2014';
    const d = new Date(ts);
    // Render the stored wall-clock as-is. The server saves India local time, so we
    // must NOT convert again to the viewer's timezone (that double-counted +5:30).
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) +
        ' \u00b7 ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
};