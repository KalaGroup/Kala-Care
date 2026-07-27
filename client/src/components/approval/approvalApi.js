// Thin API layer for the Approval Application page. Every call sends the
// logged-in user's id in the `user-id` header (same auth pattern as the rest
// of the app).
import axios from 'axios';

// VITE_BACKEND_URL already ends with /api (see client/.env), so only the
// router prefix is appended here — same pattern as MOM_API in MOMTracking.
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const BASE = `${API_BASE_URL}/approval`;

const authHeaders = () => {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    return { 'user-id': user.user_id };
};

// FastAPI error detail can be a string OR (on 422) an array of objects
// ({type, loc, msg, input}). Always reduce it to a plain string — passing an
// object into toast/React crashes the whole page.
export const errText = (err, fallback) => {
    const d = err?.response?.data?.detail;
    if (typeof d === 'string' && d) return d;
    if (Array.isArray(d)) {
        const msg = d.map(x => `${(x?.loc || []).slice(-1)[0] ?? ''}: ${x?.msg ?? ''}`.trim()).filter(Boolean).join('; ');
        if (msg) return msg;
    }
    return fallback;
};

export const getAccess = () =>
    axios.get(`${BASE}/access`, { headers: authHeaders() }).then(r => r.data);

// HO creators: L4 choices filtered for ONE record — only HO HODs whose limit
// for the record's type is higher than the caller's own.
export const getL4Choices = (branch, requestType) =>
    axios.get(`${BASE}/l4-choices`, {
        headers: authHeaders(), params: { branch, request_type: requestType },
    }).then(r => r.data);

// Warm-up cache: the page fires prefetchApplications() in PARALLEL with the
// access call, and the view's first plain getApplications() consumes the
// in-flight request instead of starting a second one (no waterfall). The
// cache is used ONCE and only for the no-params call — refreshes and
// filtered calls always hit the network.
let _appsPrefetch = null;
export const prefetchApplications = () => {
    _appsPrefetch = axios.get(`${BASE}/applications`, { headers: authHeaders() })
        .then(r => r.data)
        .catch(() => null);   // consumed below — falls back to a fresh call
};

export const getApplications = (params = {}) => {
    if (_appsPrefetch && Object.keys(params).length === 0) {
        const p = _appsPrefetch;
        _appsPrefetch = null;
        return p.then(d => d ?? axios.get(`${BASE}/applications`, { headers: authHeaders() }).then(r => r.data));
    }
    return axios.get(`${BASE}/applications`, { headers: authHeaders(), params }).then(r => r.data);
};

export const getSummary = () =>
    axios.get(`${BASE}/summary`, { headers: authHeaders() }).then(r => r.data);

export const createApplication = (formData) =>
    axios.post(`${BASE}/applications`, formData, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);

export const updateApplication = (id, formData) =>
    axios.put(`${BASE}/applications/${id}`, formData, {
        headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);

export const approveApplication = (id, remark) =>
    axios.put(`${BASE}/applications/${id}/approve`, { remark }, { headers: authHeaders() }).then(r => r.data);

export const rejectApplication = (id, remark) =>
    axios.put(`${BASE}/applications/${id}/reject`, { remark }, { headers: authHeaders() }).then(r => r.data);

export const deleteApplication = (id) =>
    axios.delete(`${BASE}/applications/${id}`, { headers: authHeaders() }).then(r => r.data);

export const sendResultEmail = (id, emails, toEmails) =>
    axios.post(`${BASE}/applications/${id}/send-email`, { emails, to_emails: toEmails }, { headers: authHeaders() }).then(r => r.data);

export const getRights = () =>
    axios.get(`${BASE}/rights`, { headers: authHeaders() }).then(r => r.data);

export const getAssignableUsers = () =>
    axios.get(`${BASE}/rights/users`, { headers: authHeaders() }).then(r => r.data);

export const setRight = (userId, level) =>
    axios.post(`${BASE}/rights`, { user_id: userId, level }, { headers: authHeaders() }).then(r => r.data);

export const removeRight = (userId) =>
    axios.delete(`${BASE}/rights/${userId}`, { headers: authHeaders() }).then(r => r.data);

export const getExpenseTypes = () =>
    axios.get(`${BASE}/expense-types`, { headers: authHeaders() }).then(r => r.data);

export const addExpenseType = (name) =>
    axios.post(`${BASE}/expense-types`, { name }, { headers: authHeaders() }).then(r => r.data);

export const removeExpenseType = (id) =>
    axios.delete(`${BASE}/expense-types/${id}`, { headers: authHeaders() }).then(r => r.data);

export const renameExpenseType = (id, name) =>
    axios.put(`${BASE}/expense-types/${id}`, { name }, { headers: authHeaders() }).then(r => r.data);

export const getMatrix = () =>
    axios.get(`${BASE}/matrix`, { headers: authHeaders() }).then(r => r.data);

export const setAuthority = (payload) =>
    axios.post(`${BASE}/matrix/authority`, payload, { headers: authHeaders() }).then(r => r.data);

export const setEmployeeRule = (payload) =>
    axios.post(`${BASE}/matrix/employee-rule`, payload, { headers: authHeaders() }).then(r => r.data);

export const setApproverExclusion = (payload) =>
    axios.post(`${BASE}/matrix/exclusion`, payload, { headers: authHeaders() }).then(r => r.data);

export const setExpenseTypeLimit = (payload) =>
    axios.post(`${BASE}/matrix/expense-type-limit`, payload, { headers: authHeaders() }).then(r => r.data);

export const setHodCategory = (branch, category, userIds) =>
    axios.post(`${BASE}/matrix/hod-category`, { branch, category, user_ids: userIds }, { headers: authHeaders() }).then(r => r.data);

export const setLevelConfig = (payload) =>
    axios.post(`${BASE}/matrix/level-config`, payload, { headers: authHeaders() }).then(r => r.data);

export const removeEmployeeRights = (userId) =>
    axios.post(`${BASE}/matrix/remove-employee`, { user_id: userId }, { headers: authHeaders() }).then(r => r.data);

export const setStageApprovers = (branch, stage, userIds) =>
    axios.post(`${BASE}/matrix/stage-approvers`, { branch, stage, user_ids: userIds }, { headers: authHeaders() }).then(r => r.data);

export const approvalPdfUrl = (id) => `${BASE}/applications/${id}/pdf`;

export const attachmentViewUrl = (id) => `${BASE}/attachments/${id}/view`;
export const attachmentDownloadUrl = (id) => `${BASE}/attachments/${id}/download`;
