/* Shared UI for the Approval Application page: constants, status badges,
   per-type applications table, application detail modal (with the approve /
   reject actions) and the create-application form modal. All four role views
   are thin compositions of these pieces.

   Form logic:
   - Discounting / Credit: Purpose of Approval (full width) + type ask
     (Discounting % or Credit Period days) + Customer Details + Documents +
     Quotation No. / Amount.
   - Expense: Purpose of Approval + SR Number + Expense Amount / Type /
     Payment Mode (no customer details, no documents). */
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import {
    X, Paperclip, Download, Eye, FileText, CheckCircle2, XCircle,
    Building2, User, IndianRupee, Trash2, Clock3, UserCog, Info, Mail,
} from 'lucide-react';
import {
    createApplication, updateApplication, approveApplication, rejectApplication,
    deleteApplication, sendResultEmail, attachmentViewUrl, attachmentDownloadUrl,
    attachmentsZipUrl, approvalPdfUrl, getExpenseTypes, getAccess, getChainPreview,
    updateChosenApprovers, errText,
} from './approvalApi';
import RichTextBox from './RichTextBox';
import { isRichEmpty, richToDisplayHtml, richToLine } from './richText';

export const BRAND = '#2f3192';

export const CATEGORY_OPTIONS = [
    { value: 'spares', label: 'Spares' },
    { value: 'services', label: 'Services' },
    { value: 'spares_services', label: 'Spares & Services' },
];

export const TYPE_OPTIONS = [
    { value: 'discounting', label: 'Discounting' },
    { value: 'credit', label: 'Credit' },
    { value: 'discounting_credit', label: 'Discounting & Credit' },
    { value: 'expense', label: 'Expense' },
    /* "Other" — no discount / credit / expense value, so no authority limit
       applies. It runs a fixed L4 (HOD) -> L5 (COO) chain; L2/L3 never act. */
    { value: 'other', label: 'Other' },
];

/* Expense settlement dropdowns. The reimbursement mode decides what the payee
   has to do next, so each one carries its own instruction. */
export const PAID_BY_MODES = ['UPI', 'Cash', 'Card', 'Net banking', 'Other'];
export const REIMBURSE_MODES = ['UPI', 'Cash', 'Bank transfer'];
export const REIMBURSE_NOTES = {
    UPI: 'Share your UPI ID / QR code through WhatsApp to the respected person.',
    Cash: 'Please contact the respected person to collect the cash.',
    'Bank transfer': 'Enter your full bank details below.',
};

export const STATUS_META = {
    draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    pending_l2: { label: 'Pending @ L2', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    pending_l3: { label: 'Pending @ L3', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    pending_l4: { label: 'Pending @ L4 - HOD', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    pending_l5: { label: 'Pending @ L5 - COO', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected: { label: 'Rejected', cls: 'bg-amber-200 text-amber-900 border-amber-300' },
};

// L1..L5 hierarchy names. The COO can RENAME the levels from the Authority
// Limit tab — setLevelNames() is fed from /access and /matrix responses so the
// custom names show everywhere in the Approval Application. Defaults below.
const LEVEL_NAMES = {
    l1: 'Employee',
    l2: 'Approver',
    l3: 'Approver',
    l4: 'HOD',
    l5: 'COO',
};
export const setLevelNames = (names) => {
    if (names && typeof names === 'object') Object.assign(LEVEL_NAMES, names);
};
export const levelName = (lvl) => LEVEL_NAMES[lvl] || lvl || '';
export const levelLabel = (lvl) =>
    LEVEL_NAMES[lvl] ? `${lvl.toUpperCase()} – ${LEVEL_NAMES[lvl]}` : (lvl || '');

// Status label with the (possibly renamed) level name baked in
export const statusLabel = (status) => {
    const m = /^pending_(l[2-5])$/.exec(status || '');
    if (m) return `Pending @ ${levelLabel(m[1])}`;
    return STATUS_META[status]?.label || status;
};

export const catLabel = (v) => CATEGORY_OPTIONS.find(o => o.value === v)?.label || v;
export const typeLabel = (v) => TYPE_OPTIONS.find(o => o.value === v)?.label || v;

/* An NFA is the creator's to change only while NOBODY has approved it yet —
   once a level acts, the figures behind that approval must stay put. Chains
   vary per employee, so "no action recorded" is the real test, not the status.
   Any creator from L1 to L4 gets these rights on their own record. */
export const isUntouched = (app) => !!app &&
    !app.l2_action_by && !app.l3_action_by && !app.l4_action_by && !app.l5_action_by;

export const canCreatorEdit = (app, userId) => !!app && app.created_by === userId &&
    (app.status === 'draft' || app.status === 'rejected'
        || (String(app.status).startsWith('pending') && isUntouched(app)));

export const canCreatorDelete = (app, userId) => !!app && app.created_by === userId &&
    (app.status === 'draft'
        || (String(app.status).startsWith('pending') && isUntouched(app)));

export const fmtAmount = (v) =>
    (v === null || v === undefined || v === '') ? '—'
        : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export function StatusBadge({ status }) {
    const meta = STATUS_META[status] || { cls: 'bg-gray-100 text-gray-700 border-gray-200' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${meta.cls}`}>
            {statusLabel(status)}
        </span>
    );
}

/* The same four boxes mean different things per level, so each card carries a
   tiny scope tag under its number: an L1 sees only their own records, an L2/L3
   their own plus their stage queue, an L4/L5 (and any Head Office member) the
   whole company. `scope` arrives from the server with the list, so the tag can
   never drift from the query that produced the counts. */
const SCOPE_TAG = {
    own: 'My NFAs only',
    stage: 'Mine + my queue',
    all: 'All branches',
};
const SCOPE_HELP = {
    own: 'Your own NFAs only — plus any where you are a chosen approver',
    stage: 'Your own NFAs + everything waiting at your level for your branches',
    all: 'Every NFA of every branch — company-wide, not only yours',
};

export function SummaryCards({ apps, onCardClick = null, scope = null, myPending = null }) {
    const counts = useMemo(() => ({
        total: apps.length,
        pending: apps.filter(a => a.status.startsWith('pending')).length,
        approved: apps.filter(a => a.status === 'approved').length,
        rejected: apps.filter(a => a.status === 'rejected').length,
    }), [apps]);
    // White cards with a soft tinted icon tile — light, and every class here has
    // an html.dark override in index.css so the cards adapt to dark mode too.
    // Clickable: opens that slice of records in a popup with filters.
    const card = (key, label, value, Icon, tileCls, valueCls, hint = null, hintTitle = null) => (
        <button type="button" onClick={() => onCardClick?.(key, label)}
            className={`rounded-xl border border-gray-200 bg-white shadow-sm p-3 flex items-center gap-3 text-left transition ${onCardClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow' : 'cursor-default'}`}
            title={[onCardClick ? `View ${label.toLowerCase()} records` : null, hintTitle].filter(Boolean).join(' — ') || undefined}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tileCls}`}>
                <Icon size={17} />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-500 truncate">{label}</p>
                <p className={`text-xl font-bold leading-tight ${valueCls}`}>{value}</p>
                {hint && <p className="text-[9px] leading-tight text-gray-400 truncate">{hint}</p>}
            </div>
        </button>
    );
    // Scope tag on every card; the Pending card gives up its tag when records
    // are actually sitting on this user — "Pending" is routinely misread as
    // "waiting on me", so the real number is the one worth the space.
    const tag = scope ? SCOPE_TAG[scope] : null;
    const help = scope ? SCOPE_HELP[scope] : null;
    const pendHint = myPending
        ? `${myPending} need${myPending === 1 ? 's' : ''} my approval`
        : tag;
    const pendHelp = myPending
        ? `${myPending} of these are waiting on your approval; the rest sit at other levels`
        : help && `${help}. Pending = open at any level, not only yours to sign`;
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {card('all', 'Total Applications', counts.total, FileText, 'bg-indigo-50 text-indigo-600', 'text-gray-800', tag, help)}
            {card('pending', 'Pending', counts.pending, Clock3, 'bg-amber-50 text-amber-600', 'text-amber-600', pendHint, pendHelp)}
            {card('approved', 'Approved', counts.approved, CheckCircle2, 'bg-emerald-50 text-emerald-600', 'text-emerald-600', tag, help)}
            {card('rejected', 'Rejected', counts.rejected, XCircle, 'bg-amber-50 text-amber-600', 'text-amber-600', tag, help)}
        </div>
    );
}

/* ---------------- Type tab buttons (Discounting default) ---------------- */

/* onDark: the bar sits INSIDE the brand-blue header (Reports box). There a
   brand-blue "selected" fill is the same colour as the background behind it, so
   the open tab disappears — it uses dark grey instead. On the ordinary white
   toolbars the selected tab keeps the brand blue. */
export function TypeTabs({ value, onChange, counts = null, onDark = false }) {
    // One button per type, each labelled "Discounting - 29" with its record
    // count. Wraps onto a second line rather than stretching the toolbar, so
    // it fits the same slot the dropdown used to occupy on every view.
    const activeStyle = onDark
        ? { background: '#4b5563', borderColor: '#6b7280', color: '#ffffff' }
        : { background: BRAND, borderColor: BRAND, color: '#ffffff' };
    return (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Application type">
            {TYPE_OPTIONS.map(o => {
                const active = value === o.value;
                return (
                    <button key={o.value} type="button" role="tab" aria-selected={active}
                        onClick={() => onChange(o.value)}
                        title={o.label}
                        className={`px-3 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap transition
                            focus:outline-none focus:ring-2 focus:ring-indigo-300
                            ${active ? 'shadow-sm' : 'bg-white hover:bg-indigo-50'}`}
                        style={active ? activeStyle : { color: BRAND, borderColor: '#c7d2fe' }}>
                        {o.label}{counts != null ? ` - ${counts[o.value] ?? 0}` : ''}
                    </button>
                );
            })}
        </div>
    );
}

/* ---------------- Applications table (per type) ---------------- */

// Rows rendered per lazy chunk — keeps first paint fast on big lists
const ROW_CHUNK = 100;

export function ApplicationsTable({ apps, type = 'discounting', onOpen, emptyText = 'No applications found' }) {
    // Lazy row rendering: only the first chunk mounts; "Show more" reveals
    // the rest. Resets whenever the data set or tab changes.
    const [rowLimit, setRowLimit] = useState(ROW_CHUNK);
    useEffect(() => { setRowLimit(ROW_CHUNK); }, [apps, type]);
    const visibleApps = rowLimit < apps.length ? apps.slice(0, rowLimit) : apps;

    // Mirrored horizontal scrollbars above AND below the table (same pattern
    // as the Profile employees table) so wide tables scroll from either edge.
    const topScrollRef = useRef(null);
    const tableScrollRef = useRef(null);
    const [tableW, setTableW] = useState(0);
    useEffect(() => {
        const el = tableScrollRef.current;
        if (!el) return;
        const measure = () => setTableW(el.scrollWidth);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => ro.disconnect();
    });
    const mirror = (from, to) => () => {
        if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft)
            to.current.scrollLeft = from.current.scrollLeft;
    };

    // Drive-style data table: light grey header, subtle grid borders
    const th = 'px-3 py-2 border border-gray-200 bg-gray-50 text-gray-600 font-semibold text-center align-middle whitespace-nowrap';
    const td = 'px-3 py-2 border border-gray-200 text-center align-middle';
    // Status column stays PINNED on the right while the table scrolls.
    // Collapsed borders don't stick with the cell in Chrome, so the LEFT
    // border line is drawn as an inset shadow (sticks with the cell),
    // layered with the soft separator shadow; opaque bg hides the rows
    // sliding underneath.
    const stickyShadow = 'shadow-[inset_1px_0_0_#e5e7eb,-4px_0_6px_-4px_rgba(0,0,0,0.15)]';
    const thSticky = `${th} sticky right-0 z-20 ${stickyShadow}`;
    const tdSticky = `${td} sticky right-0 z-10 bg-white group-hover:bg-indigo-50 ${stickyShadow}`;

    const isExpense = type === 'expense';
    // "Other": same customer / document / quotation columns minus SR No. and
    // minus the discount-credit column (an Other NFA has no such value).
    const isOther = type === 'other';

    const commonLeft = (app, index) => (
        <>
            <td className={`${td} text-gray-500 whitespace-nowrap`}>{index + 1}</td>
            <td className={`${td} font-semibold text-indigo-700 whitespace-nowrap`}>{app.app_no || 'Draft'}</td>
            <td className={`${td} whitespace-nowrap text-gray-600`}>{fmtDate(app.created_at)}</td>
            <td className={`${td} whitespace-nowrap`}>{catLabel(app.category)}</td>
            <td className={`${td} whitespace-nowrap`}>{app.branch}{app.branch_name ? ` — ${app.branch_name}` : ''}</td>
        </>
    );
    const commonRight = (app) => {
        // a pasted table is flattened to one readable line for this column
        const purpose = richToLine(app.description);
        return (
        <>
            <td className={`${td} max-w-[220px]`}>
                <span className="block truncate" title={purpose}>{purpose || '—'}</span>
            </td>
            <td className={`${td} whitespace-nowrap`}>{app.created_by_name || app.created_by}</td>
            <td className={`${td} whitespace-nowrap`}>
                {app.attachments?.length
                    ? <span className="inline-flex items-center gap-1 text-indigo-700"><Paperclip size={12} />{app.attachments.length}</span>
                    : '—'}
            </td>
            <td className={tdSticky}><StatusBadge status={app.status} /></td>
        </>
        );
    };

    // true when the table itself is the bottom of the card (no "Show more"
    // bar and no empty state underneath it)
    const closesCard = apps.length > 0 && apps.length <= rowLimit;

    return (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* top scrollbar */}
            <div ref={topScrollRef} onScroll={mirror(topScrollRef, tableScrollRef)}
                className="overflow-x-auto apv-scroll">
                <div style={{ width: tableW, height: 1 }} />
            </div>
            {/* table — scrolls horizontally, but its own scrollbar is hidden;
                the single scrollbar on top drives (and mirrors) the scroll */}
            <style>{'.apv-noscroll::-webkit-scrollbar{display:none}'}</style>
            {/* When the table is the LAST thing in the card it has to close the
                box cleanly:
                - rounded-b-xl on the SCROLL box (not just the outer wrapper),
                  because the sticky Status column paints its own opaque
                  background and Chrome does not clip a sticky child to an
                  ancestor's border radius — it squared off the corners;
                - apv-table-open-bottom drops the last row's straight bottom
                  border, so the card's OWN rounded border draws that edge and
                  it curves into both corners instead of being cut short.
                The "Show more" bar and the empty state close the box
                themselves, so neither applies then. */}
            <div ref={tableScrollRef} onScroll={mirror(tableScrollRef, topScrollRef)}
                className={`overflow-x-auto apv-noscroll ${closesCard ? 'rounded-b-xl' : ''}`}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <table className={`min-w-full text-xs border-collapse ${closesCard ? 'apv-table-open-bottom' : ''}`}>
                    {isExpense ? (
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wide">
                                <th className={th}>Sr. No.</th>
                                <th className={th}>Approval No.</th>
                                <th className={th}>Date</th>
                                <th className={th}>Category</th>
                                <th className={th}>Branch</th>
                                <th className={th}>SR No.</th>
                                <th className={th}>Expense Amount</th>
                                <th className={th}>Expense Type</th>
                                <th className={th}>Quotation No.</th>
                                <th className={th}>Quotation Amount</th>
                                <th className={th}>Purpose</th>
                                <th className={th}>Created By</th>
                                <th className={th}>Files</th>
                                <th className={thSticky}>Status</th>
                            </tr>
                        </thead>
                    ) : (
                        <thead>
                            {/* Two-row grouped header */}
                            <tr className="text-[11px] uppercase tracking-wide">
                                <th rowSpan={2} className={th}>Sr. No.</th>
                                <th rowSpan={2} className={th}>Approval No.</th>
                                <th rowSpan={2} className={th}>Date</th>
                                <th rowSpan={2} className={th}>Category</th>
                                <th rowSpan={2} className={th}>Branch</th>
                                <th colSpan={isOther ? 2 : 3} className={th}>Customer Details</th>
                                <th colSpan={2} className={th}>Documents</th>
                                <th colSpan={2} className={th}>Quotation</th>
                                {!isOther && (
                                    <th rowSpan={2} className={th}>
                                        {type === 'discounting' ? 'Discounting %'
                                            : type === 'credit' ? 'Credit Period - Days'
                                                : 'Discounting % / Credit Days'}
                                    </th>
                                )}
                                <th rowSpan={2} className={th}>Purpose</th>
                                <th rowSpan={2} className={th}>Created By</th>
                                <th rowSpan={2} className={th}>Files</th>
                                <th rowSpan={2} className={thSticky}>Status</th>
                            </tr>
                            <tr className="text-[11px] uppercase tracking-wide">
                                <th className={th}>Name</th>
                                <th className={th}>Instance ID</th>
                                {!isOther && <th className={th}>SR No.</th>}
                                <th className={th}>Invoice</th>
                                <th className={th}>Delivery Challan</th>
                                <th className={th}>Number</th>
                                <th className={th}>Amount</th>
                            </tr>
                        </thead>
                    )}
                    <tbody className="bg-white">
                        {visibleApps.map((app, index) => (
                            <tr key={app.id} className="group hover:bg-indigo-50/40 cursor-pointer" onClick={() => onOpen(app)}>
                                {commonLeft(app, index)}
                                {isExpense ? (
                                    <>
                                        <td className={`${td} whitespace-nowrap`}>{app.sr_no || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{fmtAmount(app.expense_amount)}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.expense_type || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.quotation_no || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{fmtAmount(app.quotation_amount)}</td>
                                    </>
                                ) : (
                                    <>
                                        <td className={`${td} max-w-[160px] truncate`} title={app.customer_name}>{app.customer_name || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.instance_id || '—'}</td>
                                        {!isOther && <td className={`${td} whitespace-nowrap`}>{app.sr_no || '—'}</td>}
                                        <td className={`${td} whitespace-nowrap`}>{app.invoice_no || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.delivery_challan || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.quotation_no || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{fmtAmount(app.quotation_amount)}</td>
                                        {!isOther && (
                                            <td className={`${td} whitespace-nowrap`}>
                                                {type === 'discounting'
                                                    ? (app.discount_percent != null ? `${app.discount_percent}%` : '—')
                                                    : type === 'credit'
                                                        ? (app.credit_days != null ? `${app.credit_days} days` : '—')
                                                        : `${app.discount_percent != null ? `${app.discount_percent}%` : '—'} / ${app.credit_days != null ? `${app.credit_days} days` : '—'}`}
                                            </td>
                                        )}
                                    </>
                                )}
                                {commonRight(app)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {/* Lazy loading: reveal the next chunk on demand */}
            {apps.length > rowLimit && (
                <div className="flex justify-center py-2 bg-white border-t border-gray-100">
                    <button onClick={() => setRowLimit(l => l + ROW_CHUNK)}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
                        Show more ({apps.length - rowLimit} remaining)
                    </button>
                </div>
            )}
            {/* Tall centered empty state below the header when there is no data */}
            {apps.length === 0 && (
                <div className="min-h-[300px] flex flex-col items-center justify-center gap-2 bg-white">
                    <FileText size={30} className="text-gray-300" />
                    <p className="text-sm text-gray-400">{emptyText}</p>
                </div>
            )}
        </div>
    );
}

/* ---------------- Result email (after approve / reject / auto-approve) ---------------- */

// Who finalized the record and at which stage — self/auto approve included
export const finalActionText = (app) => {
    if (app.status === 'rejected')
        return `Rejected at ${levelLabel(app.rejected_at_level)} by ${app.rejected_by_name || app.rejected_by}`;
    if (app.auto_approved)
        return `Self approved by ${app.created_by_name || app.created_by} - within own authority limit`;
    for (const lvl of ['l5', 'l4', 'l3', 'l2']) {
        const by = app[`${lvl}_action_by_name`] || app[`${lvl}_action_by`];
        if (by) return `Final approval at ${levelLabel(lvl)} by ${by}`;
    }
    return 'Approved';
};

/* ---- email chip-group helpers (add ONE at a time, validated, removable) ---- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---- remembered addresses (browser cache) ----------------------------------
   Every address typed into ANY of these boxes (create-NFA CC, and the To / CC
   boxes of the approve & reject result mail) is kept in localStorage and
   offered back as a dropdown the next time. A native <datalist> is used on
   purpose: the browser paints it, so it can never be clipped by the
   SweetAlert box's own scrolling container. */
const EMAIL_HISTORY_KEY = 'apv_email_history';
const EMAIL_HISTORY_MAX = 40;

const loadEmailHistory = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(EMAIL_HISTORY_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter(e => typeof e === 'string' && EMAIL_RE.test(e)) : [];
    } catch { return []; }   /* corrupt / unavailable storage — just no suggestions */
};

const rememberEmail = (addr) => {
    try {
        const next = [addr, ...loadEmailHistory().filter(e => e.toLowerCase() !== addr.toLowerCase())]
            .slice(0, EMAIL_HISTORY_MAX);   // most recently used first
        localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(next));
    } catch { /* private mode / quota — suggestions are a convenience, never block the add */ }
};

const emailGroupHtml = (prefix, labelText) => `
    <p style="margin:10px 0 4px;font-size:12px;color:var(--apv-muted)">${labelText}</p>
    <div style="display:flex;gap:6px">
        <input id="${prefix}-in" type="email" placeholder="name@email.com"
            list="${prefix}-dl" autocomplete="off"
            style="flex:1;min-width:0;border:1px solid var(--apv-field-border);border-radius:8px;padding:7px 10px;font-size:13px;outline:none;background:var(--apv-field-bg);color:var(--apv-field-text)">
        <datalist id="${prefix}-dl"></datalist>
        <button type="button" id="${prefix}-add"
            style="background:${BRAND};color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">+ Add</button>
    </div>
    <p id="${prefix}-err" style="color:#d97706;font-size:11px;margin:4px 0 0;display:none"></p>
    <p id="${prefix}-hint" style="font-size:10px;color:var(--apv-dim);margin:4px 0 0;display:none">
        Previously used emails appear in the dropdown —
        <span id="${prefix}-clear" style="cursor:pointer;text-decoration:underline">clear saved</span>
    </p>
    <div id="${prefix}-list" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div>`;

/* `locked` addresses are shown as fixed chips with no × — used for the
   creator's own address in the submit box's To list, which always receives the
   result mail and so must not be removable. They are NOT part of `added`, so
   they never get submitted or double-counted. */
const wireEmailGroup = (prefix, added, locked = []) => {
    const input = document.getElementById(`${prefix}-in`);
    const err = document.getElementById(`${prefix}-err`);
    const list = document.getElementById(`${prefix}-list`);
    const dl = document.getElementById(`${prefix}-dl`);
    const hint = document.getElementById(`${prefix}-hint`);
    const taken = () => [...locked, ...added].map(e => e.toLowerCase());
    // dropdown = remembered addresses minus the ones already on this record
    const renderSuggestions = () => {
        const pool = loadEmailHistory().filter(e => !taken().includes(e.toLowerCase()));
        if (dl) dl.innerHTML = pool.map(e => `<option value="${escHtml(e)}"></option>`).join('');
        if (hint) hint.style.display = pool.length ? 'block' : 'none';
    };
    const chip = (text, tail) =>
        `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--apv-chip-bg);color:var(--apv-chip-text);border:1px solid var(--apv-chip-border);border-radius:999px;padding:3px 10px;font-size:12px">${escHtml(text)}${tail}</span>`;
    const render = () => {
        list.innerHTML =
            locked.map(e => chip(e, '<span title="Always included — cannot be removed" style="font-size:10px;opacity:.7">🔒</span>')).join('')
            + added.map((e, i) =>
                chip(e, `<b data-i="${i}" title="Remove" style="cursor:pointer;color:var(--apv-dim);font-size:13px;line-height:1">×</b>`)).join('');
        list.querySelectorAll('b[data-i]').forEach(b =>
            b.addEventListener('click', () => { added.splice(Number(b.dataset.i), 1); render(); }));
        renderSuggestions();   // a removed address becomes selectable again
    };
    const add = () => {
        const v = (input.value || '').trim();
        if (!v) return;
        if (!EMAIL_RE.test(v)) {
            err.textContent = `'${v}' is not a valid email address`;
            err.style.display = 'block';
            return;
        }
        if (taken().includes(v.toLowerCase())) {
            err.textContent = 'This email is already added';
            err.style.display = 'block';
            return;
        }
        added.push(v);
        rememberEmail(v);      // keep it for the next NFA / result mail
        input.value = '';
        err.style.display = 'none';
        render();
        input.focus();
    };
    document.getElementById(`${prefix}-add`).addEventListener('click', add);
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); add(); }
    });
    // picking a suggestion from the dropdown adds it straight away — a pick
    // arrives as a replacement, so plain typing never triggers this
    input.addEventListener('input', (ev) => {
        const picked = !ev.inputType || ev.inputType === 'insertReplacementText';
        if (picked && loadEmailHistory().some(e => e === input.value)) add();
    });
    document.getElementById(`${prefix}-clear`)?.addEventListener('click', () => {
        try { localStorage.removeItem(EMAIL_HISTORY_KEY); } catch { /* ignore */ }
        renderSuggestions();
    });
    render();
};

// typed-but-not-added address must be valid (or cleared); it is auto-added
const flushEmailGroup = (prefix, added, locked = []) => {
    const input = document.getElementById(`${prefix}-in`);
    const v = (input?.value || '').trim();
    if (v) {
        if (!EMAIL_RE.test(v)) {
            Swal.showValidationMessage(`'${v}' is not a valid email address — press + Add or clear it`);
            return false;
        }
        const taken = [...locked, ...added].map(e => e.toLowerCase());
        if (!taken.includes(v.toLowerCase())) added.push(v);
        rememberEmail(v);
    }
    return true;
};

// Submit-time CC box for the CREATOR: the addresses attach to the record and
// are automatically CC'd on the result email later. Always resolves (optional).
export async function promptCcEmails(initial = []) {
    const added = [...initial];
    await Swal.fire({
        title: 'CC emails for the result mail',
        html: `<div style="text-align:left;font-size:13px">
                   <p style="margin:0 0 2px;font-size:12px;color:var(--apv-muted)">
                       When this NFA is approved / rejected the result email goes
                       <b>To: you - creator</b> with the <b>approvers in CC automatically</b>.
                   </p>
                   ${emailGroupHtml('apv-ccsub', 'Add more CC emails - optional:')}
               </div>`,
        showCancelButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'OK — Continue',
        confirmButtonColor: BRAND,
        didOpen: () => wireEmailGroup('apv-ccsub', added),
        preConfirm: () => flushEmailGroup('apv-ccsub', added),
    });
    return added;
}

// Dialog before the outcome email goes out: To = creator, Cc = the approvers
// + the creator-attached CC; extra To AND CC addresses can be added — OK sends.
export async function promptResultEmail(app) {
    if (!app || (app.status !== 'approved' && app.status !== 'rejected')) return;
    const ccNames = [...new Set([
        app.l2_action_by_name, app.l3_action_by_name,
        app.l4_action_by_name, app.l5_action_by_name,
        app.status === 'rejected' ? (app.rejected_by_name || app.rejected_by) : null,
        ...String(app.cc_emails || '').split(',').map(s => s.trim()).filter(Boolean),
    ].filter(n => n && n !== (app.created_by_name || app.created_by)))];
    // extra recipients the CREATOR attached in the submit box — already stored
    // on the record, shown here so the sender sees the full To line
    const storedTo = String(app.to_emails || '').split(',').map(s => s.trim()).filter(Boolean);
    const addedTo = [];
    const addedCc = [];
    await Swal.fire({
        title: 'Send result email',
        html: `<div style="text-align:left;font-size:13px">
                   <p style="margin:0 0 6px"><b>${escHtml(app.app_no || '')}</b> — ${escHtml(finalActionText(app))}</p>
                   <p style="margin:2px 0"><b>To:</b> ${escHtml(app.created_by_name || app.created_by)} - creator${storedTo.length ? ', ' + escHtml(storedTo.join(', ')) : ''}</p>
                   <p style="margin:2px 0"><b>Cc:</b> ${ccNames.length ? escHtml(ccNames.join(', ')) : '—'}</p>
                   ${emailGroupHtml('apv-to', 'Add To emails - optional:')}
                   ${emailGroupHtml('apv-cc', 'Add CC emails - optional:')}
               </div>`,
        showCancelButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
        confirmButtonText: 'OK — Send Email',
        confirmButtonColor: BRAND,
        didOpen: () => {
            wireEmailGroup('apv-to', addedTo);
            wireEmailGroup('apv-cc', addedCc);
        },
        preConfirm: () =>
            flushEmailGroup('apv-to', addedTo) && flushEmailGroup('apv-cc', addedCc),
    });
    try {
        await sendResultEmail(app.id, addedCc, addedTo);
        toast.success('Email sent');
    } catch (err) {
        toast.error(errText(err, 'Failed to send the email'));
    }
}

/* ---------------- Detail modal (with approve / reject) ---------------- */

function Step({ label, byName, at, remark, state, pendingNames = null, chosenName = null }) {
    const dot = state === 'done' ? 'bg-emerald-500' : state === 'rejected' ? 'bg-amber-500'
        : state === 'current' ? 'bg-amber-400 animate-pulse' : 'bg-gray-300';
    return (
        <div className={`flex items-start gap-2 ${state === 'skipped' ? 'opacity-80' : ''}`}>
            <div className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800">{label}</p>
                {byName
                    ? (
                        <>
                            <p className="text-[11px] text-gray-700">{byName} · {fmtDate(at)}</p>
                            {remark && (
                                /* remark gets its own box on a new line — long text wraps cleanly */
                                <p className="mt-1 text-[11px] text-gray-700 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 break-words">
                                    <b>Remark:</b> {remark}
                                </p>
                            )}
                        </>
                    )
                    : <>
                        <p className="text-[11px] text-gray-600">
                            {state === 'current'
                                ? `Awaiting action${pendingNames?.length ? ` — ${pendingNames.join(', ')}` : ''}`
                                /* auto-skip reasons (e.g. no approver defined) come in `remark` */
                                : state === 'skipped' ? (remark || 'Skipped — not required or covered by an earlier approval')
                                    : 'Pending'}
                        </p>
                        {/* the person the CREATOR picked for this level (submit box) */}
                        {chosenName && state !== 'skipped' && (
                            <p className="text-[10px] text-indigo-700">Creator chose: <b>{chosenName}</b></p>
                        )}
                    </>}
            </div>
        </div>
    );
}

export function ApplicationDetailModal({ app, canAct, canDelete, onClose, onChanged, onEditResubmit = null }) {
    const [busy, setBusy] = useState(false);
    const [action, setAction] = useState(null);   // 'approve' | 'reject' — drives the button loading label
    const me = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (!app) return null;

    const isExpense = app.request_type === 'expense';
    // the creator may correct a rejected record OR a pending one nobody has
    // approved yet; the button says which it is
    const canResubmit = !!onEditResubmit && canCreatorEdit(app, me.user_id) && app.status !== 'draft';
    const editLabel = app.status === 'rejected' ? 'Edit & Resubmit' : 'Edit NFA';

    // Result-mail recipients as ADDRESSES — the server builds these with the
    // same rules send_result_email uses, so the box shows what will really be
    // mailed. Older payloads without them fall back to the attached lists.
    const csv = (v) => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
    const mailTo = app.mail_to?.length ? app.mail_to : csv(app.to_emails);
    const mailCc = app.mail_cc?.length ? app.mail_cc : csv(app.cc_emails);

    // Chains vary per employee (Authority Matrix): a step only counts as done
    // when someone actually acted at it; passed-over steps show as skipped.
    const stepState = (level) => {
        const acted = app[`${level}_action_by`];
        if (app.status === 'rejected' && app.rejected_at_level === level) return 'rejected';
        if (acted) return 'done';
        const pendingOf = `pending_${level}`;
        if (app.status === pendingOf) return 'current';
        if (app.status === 'approved' || app.status === 'rejected') return 'skipped';
        const order = ['pending_l2', 'pending_l3', 'pending_l4', 'pending_l5'];
        return order.indexOf(app.status) > order.indexOf(pendingOf) ? 'skipped' : 'idle';
    };

    const doApprove = async () => {
        const { value: remark, isConfirmed } = await Swal.fire({
            title: 'Approve application?',
            text: `${app.app_no} — ${typeLabel(app.request_type)}`,
            input: 'textarea',
            inputPlaceholder: 'Approval remark - required',
            inputAttributes: { rows: 4, style: 'min-height:110px;font-size:13px' },
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Approve',
            confirmButtonColor: '#059669',
            inputValidator: (v) => (!v || !v.trim()) ? 'Please enter an approval remark' : undefined,
        });
        if (!isConfirmed) return;
        setBusy(true);
        setAction('approve');
        try {
            const res = await approveApplication(app.id, remark || '');
            const st = res?.application?.status;
            // An Other NFA carries no value, so no limit is involved — L4
            // always forwards it and only the COO gives the final approval.
            const isOtherApp = app.request_type === 'other';
            if (st === 'approved') toast.success(isOtherApp ? 'Approved — final' : 'Approved — final - within your authorized limit');
            else if (isOtherApp) toast.success('Approved — forwarded to L5 COO for final approval');
            else if (st === 'pending_l3') toast.success('Approved — forwarded to L3 - beyond your authorized limit');
            else if (st === 'pending_l4') toast.success('Approved — forwarded to L4 HOD - beyond your authorized limit');
            else if (st === 'pending_l5') toast.success('Approved — forwarded to L5 COO - beyond your authorized limit');
            else toast.success('Application approved');
            if (st === 'approved') await promptResultEmail(res.application);
            onChanged();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to approve'));
        } finally { setBusy(false); setAction(null); }
    };

    const doReject = async () => {
        const { value: remark, isConfirmed } = await Swal.fire({
            title: 'Reject application?',
            text: `${app.app_no} — a remark is required`,
            input: 'textarea',
            inputPlaceholder: 'Reason for rejection',
            inputAttributes: { rows: 4, style: 'min-height:110px;font-size:13px' },
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Reject',
            confirmButtonColor: '#d97706',
            inputValidator: (v) => (!v || !v.trim()) ? 'Please give a rejection reason' : undefined,
        });
        if (!isConfirmed) return;
        setBusy(true);
        setAction('reject');
        try {
            const res = await rejectApplication(app.id, remark);
            toast.success('Application rejected');
            await promptResultEmail(res?.application);
            onChanged();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to reject'));
        } finally { setBusy(false); setAction(null); }
    };

    const doDelete = async () => {
        const res = await Swal.fire({
            title: 'Delete this application?',
            text: `${app.app_no} will be permanently removed`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#d97706',
        });
        if (!res.isConfirmed) return;
        setBusy(true);
        try {
            await deleteApplication(app.id);
            toast.success('Application deleted');
            onChanged();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to delete'));
        } finally { setBusy(false); }
    };

    // Creator of a PENDING record may change the level-wise chosen approvers
    // (the chosen person is on leave / busy). Only the current and future
    // levels are editable; the server re-routes the record after saving.
    const canEditApprovers = app.created_by === me.user_id && app.status.startsWith('pending');

    const doEditApprovers = async () => {
        setBusy(true);
        let preview = null;
        try {
            preview = await getChainPreview(app.branch, app.category, app.request_type);
        } catch { /* preview stays null — handled below */ }
        setBusy(false);
        const levels = preview?.levels;
        if (!levels) return toast.error('Could not load the approval flow — try again');
        const isHO = preview.is_ho === true;

        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const LVL_ORDER = { l2: 2, l3: 3, l4: 4, l5: 5 };
        const curOrder = LVL_ORDER[app.status.replace('pending_', '')] || 0;

        const pickerLevels = [];
        const rowsHtml = levels
            .filter(l => (LVL_ORDER[l.level] || 0) >= curOrder)
            .map(l => {
                const tag = `${l.level.toUpperCase()} – ${esc(levelName(l.level))}`;
                const row = (body) => `<div style="margin:6px 0"><b style="font-size:11px">${tag}</b>${body}</div>`;
                if (l.skipped)
                    return row(`<div style="font-size:11px;color:var(--apv-dim)">${esc(l.skipped)}</div>`);
                const cands = l.candidates || [];
                const hoL4 = isHO && l.level === 'l4';
                if (cands.length <= 1 && !hoL4)
                    return row(`<div style="font-size:11px;color:var(--apv-strong)">${esc(cands.map(c => c.name).join(', ') || '—')}</div>`);
                pickerLevels.push(l.level);
                const preset = String(app[`${l.level}_approver_id`] || '').split(',').map(s => s.trim()).filter(Boolean);
                const hint = hoL4
                    ? 'None ticked — skips this level, goes directly to COO - L5'
                    : 'None ticked — all approvers, anyone may act';
                const boxes = cands.map(c =>
                    `<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin:2px 0;cursor:pointer;color:var(--apv-field-text)">
                         <input type="checkbox" class="apvedit_${l.level}" value="${esc(c.user_id)}" ${preset.includes(c.user_id) ? 'checked' : ''} style="accent-color:#2f3192;flex-shrink:0">
                         <span>${esc(c.name)}</span>
                     </label>`).join('');
                return row(`<div style="border:1px solid var(--apv-field-border);border-radius:8px;padding:5px 8px;margin-top:2px;background:var(--apv-field-bg);max-height:110px;overflow-y:auto">${boxes}</div>
                    <div style="font-size:10px;color:var(--apv-dim);margin-top:2px">${hint}</div>`);
            }).join('');

        const res = await Swal.fire({
            title: 'Edit Approvers',
            width: 460,
            html: `<div style="text-align:left;font-size:13px">
                       <p style="margin:0 0 6px;font-size:11px;color:var(--apv-muted)">
                           Change who approves <b>${esc(app.app_no || '')}</b> from its current level onward
                           (e.g. the chosen approver is on leave). Levels already acted on are not affected.
                       </p>
                       ${rowsHtml || '<p style="font-size:11px;color:var(--apv-dim)">Nothing editable at this stage</p>'}
                   </div>`,
            showCancelButton: true,
            confirmButtonText: 'Save Approvers',
            confirmButtonColor: BRAND,
            preConfirm: () => {
                const picks = {};
                pickerLevels.forEach(lvl => {
                    const ticked = document.querySelectorAll(`.apvedit_${lvl}:checked`);
                    picks[`${lvl}_approver_id`] = [...ticked].map(el => el.value).join(',');
                });
                return picks;
            },
        });
        if (!res.isConfirmed) return;
        setBusy(true);
        try {
            const out = await updateChosenApprovers(app.id, res.value || {});
            const st = out?.application?.status;
            toast.success(st && st !== app.status
                ? `Approvers updated — application moved to ${statusLabel(st)}`
                : 'Approvers updated');
            onChanged();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to update approvers'));
        } finally { setBusy(false); }
    };

    // Bordered grid cell — the details render as a proper lined grid
    const Row = ({ label, value }) => (
        <div className="min-w-0 px-3 py-2 bg-white border-b border-r border-gray-100">
            <p className="text-[10px] uppercase tracking-wide text-black font-bold">{label}</p>
            <p className="text-xs text-gray-800 break-words">{value ?? '—'}</p>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 max-md:p-2" onClick={onClose}>
            <div
                className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-5 max-sm:px-3 py-3 rounded-t-2xl text-white" style={{ background: BRAND }}>
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <FileText size={16} />
                        <span className="font-semibold text-sm">{app.app_no}</span>
                        <StatusBadge status={app.status} />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {app.status === 'approved' && (
                            /* full record + trail + attachments as one PDF */
                            <a href={approvalPdfUrl(app.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90"
                                style={{ color: BRAND }}>
                                <Download size={13} /> Download PDF
                            </a>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-lg bg-white hover:bg-white/90 transition flex-shrink-0" style={{ color: '#2f3192' }}><X size={15} /></button>
                    </div>
                </div>

                <div className="p-5 max-sm:p-3 space-y-5">
                    {/* Purpose of approval — the headline of the application */}
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-black font-bold">Purpose of Approval</p>
                        {/* pasted Excel tables render as tables; legacy plain text
                            is escaped and keeps its line breaks */}
                        {app.description
                            ? <div className="apv-rich text-xs text-gray-800 break-words overflow-x-auto"
                                dangerouslySetInnerHTML={{ __html: richToDisplayHtml(app.description) }} />
                            : <p className="text-xs text-gray-800">—</p>}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 rounded-xl border border-gray-200 overflow-hidden">
                        <Row label="Type" value={typeLabel(app.request_type)} />
                        <Row label="Category" value={catLabel(app.category)} />
                        <Row label="Branch" value={`${app.branch}${app.branch_name ? ` — ${app.branch_name}` : ''}`} />
                        {!isExpense && <Row label="Customer Name" value={app.customer_name} />}
                        {!isExpense && <Row label="Instance ID" value={app.instance_id} />}
                        {/* Other records carry no SR No. */}
                        {app.request_type !== 'other' && <Row label="SR No." value={app.sr_no} />}
                        {!isExpense && <Row label="Invoice" value={app.invoice_no} />}
                        {!isExpense && <Row label="Delivery Challan" value={app.delivery_challan} />}
                        <Row label="Quotation Number" value={app.quotation_no} />
                        <Row label="Quotation Amount" value={fmtAmount(app.quotation_amount)} />
                        {['discounting', 'discounting_credit'].includes(app.request_type) && (
                            <Row label="Discounting %" value={app.discount_percent != null ? `${app.discount_percent}%` : '—'} />
                        )}
                        {['credit', 'discounting_credit'].includes(app.request_type) && (
                            <Row label="Credit Period" value={app.credit_days != null ? `${app.credit_days} days` : '—'} />
                        )}
                        {isExpense && <Row label="Expense Amount" value={fmtAmount(app.expense_amount)} />}
                        {isExpense && <Row label="Expense Type" value={app.expense_type} />}
                        {isExpense && (app.paid_by_name || app.paid_by_mode) && (
                            <Row label="Paid By" value={[app.paid_by_name, app.paid_by_mode].filter(Boolean).join(' - ')} />
                        )}
                        {isExpense && (app.reimburse_to || app.reimburse_mode) && (
                            <Row label="Reimburse To" value={[app.reimburse_to, app.reimburse_mode].filter(Boolean).join(' - ')} />
                        )}
                        <Row label="Created By" value={`${app.created_by_name || app.created_by} · ${fmtDate(app.created_at)}`} />
                    </div>

                    {app.remark && (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <Row label="Remark" value={app.remark} />
                        </div>
                    )}

                    {isExpense && app.reimburse_bank_details && (
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <Row label="Bank Details" value={app.reimburse_bank_details} />
                        </div>
                    )}

                    {/* Who this NFA's result email goes to — the To / CC lists the
                        creator attached at submit, plus the approvers who are in
                        CC automatically. Shown on every NFA box, Reports included. */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-black font-bold">
                            <Mail size={12} /> Email Recipients
                        </p>
                        <p className="mt-1.5 text-[11px] text-gray-700 break-words">
                            <b>To:</b> {mailTo.length ? mailTo.join(', ') : '—'}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-700 break-words">
                            <b>Cc:</b> {mailCc.length ? mailCc.join(', ') : '—'}
                        </p>
                        <p className="mt-1.5 text-[10px] text-gray-500">
                            First To address is the creator. Approvers are added to Cc automatically, and
                            anything added while sending the result mail stays on this list.
                        </p>
                    </div>

                    {/* Attachments */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] uppercase tracking-wide text-black font-bold">Attachments</p>
                            {app.attachments?.length > 0 && (
                                <a href={attachmentsZipUrl(app.id)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                                    title="Download all attachments as ZIP">
                                    <Download size={12} /> Download All (ZIP)
                                </a>
                            )}
                        </div>
                        {app.attachments?.length ? (
                            <div className="flex flex-wrap gap-2">
                                {app.attachments.map(f => (
                                    <div key={f.id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 text-xs">
                                        <Paperclip size={12} className="text-indigo-600 flex-shrink-0" />
                                        <span className="max-w-[160px] truncate" title={f.original_name}>{f.original_name}</span>
                                        <a href={attachmentViewUrl(f.id)} target="_blank" rel="noreferrer"
                                            className="text-indigo-600 hover:text-indigo-800" title="View"><Eye size={13} /></a>
                                        <a href={attachmentDownloadUrl(f.id)}
                                            className="text-indigo-600 hover:text-indigo-800" title="Download"><Download size={13} /></a>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-xs text-gray-400">No files attached</p>}
                    </div>

                    {/* Approval trail */}
                    <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50/60">
                        <p className="text-[10px] uppercase tracking-wide text-black font-bold flex items-center gap-1">
                            <Clock3 size={11} /> Approval Flow (L2 → L3 → L4 {levelName('l4')} → L5 {levelName('l5')})
                        </p>
                        {app.auto_approved ? (
                            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                                <b>Auto approved</b> — the value was within {app.created_by_name || app.created_by}'s
                                own authority limit, so no approver action was needed.
                            </div>
                        ) : (
                            <>
                                <Step label={`${levelLabel('l2')} Approval`} state={stepState('l2')} pendingNames={app.status === 'pending_l2' ? app.pending_approver_names : null}
                                    chosenName={app.l2_approver_name}
                                    byName={app.l2_action_by_name} at={app.l2_action_at} remark={app.l2_action_remark} />
                                <Step label={`${levelLabel('l3')} Approval`} state={stepState('l3')} pendingNames={app.status === 'pending_l3' ? app.pending_approver_names : null}
                                    chosenName={app.l3_approver_name}
                                    byName={app.l3_action_by_name} at={app.l3_action_at} remark={app.l3_action_remark} />
                                <Step label={`${levelLabel('l4')} Approval`} state={stepState('l4')} pendingNames={app.status === 'pending_l4' ? app.pending_approver_names : null}
                                    chosenName={app.l4_approver_name}
                                    byName={app.l4_action_by_name} at={app.l4_action_at} remark={app.l4_action_remark} />
                                <Step label={`${levelLabel('l5')} Approval (Final)`} state={stepState('l5')} pendingNames={app.status === 'pending_l5' ? app.pending_approver_names : null}
                                    chosenName={app.l5_approver_name}
                                    byName={app.l5_action_by_name} at={app.l5_action_at} remark={app.l5_action_remark} />
                            </>
                        )}
                        {app.status === 'rejected' && (
                            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                Rejected by <b>{app.rejected_by_name}</b> ({app.rejected_at_level?.toUpperCase()}) on {fmtDate(app.rejected_at)}
                                {app.rejected_remark ? <> — "{app.rejected_remark}"</> : null}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        {canResubmit && (
                            <button onClick={() => onEditResubmit(app)} disabled={busy}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                style={{ background: BRAND }}>
                                <FileText size={13} /> {editLabel}
                            </button>
                        )}
                        {canEditApprovers && (
                            <button onClick={doEditApprovers} disabled={busy}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                style={{ background: BRAND }}
                                title="Change who approves this NFA from its current level onward">
                                <UserCog size={13} /> Edit Approvers
                            </button>
                        )}
                        {canDelete && (
                            <button onClick={doDelete} disabled={busy}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 disabled:opacity-50">
                                <Trash2 size={13} /> Delete
                            </button>
                        )}
                        {canAct && (
                            <>
                                <button onClick={doReject} disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60">
                                    <XCircle size={13} className={busy && action === 'reject' ? 'animate-spin' : ''} />
                                    {busy && action === 'reject' ? 'Rejecting…' : 'Reject'}
                                </button>
                                <button onClick={doApprove} disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                                    <CheckCircle2 size={13} className={busy && action === 'approve' ? 'animate-spin' : ''} />
                                    {busy && action === 'approve' ? 'Approving…' : 'Approve'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------------- Create application modal ---------------- */

export function CreateApplicationModal({ onClose, onCreated, lockedType = null, title = 'Create NFA', draft = null }) {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');

    // Approval access decides the branch list (HO members see EVERY branch)
    // and whether the creator picks their own L4 / L5 approvers (HO only).
    const [access, setAccess] = useState(null);
    useEffect(() => {
        getAccess()
            .then(d => { setAccess(d.access); setLevelNames(d.access?.level_names); })
            .catch(() => { /* fall back to the session branches */ });
    }, []);

    const sessionBranches = user.branches?.length
        ? user.branches
        : [{ branch: user.branch, branch_name: user.branch_name }];
    const branches = access?.branch_options?.length ? access.branch_options : sessionBranches;
    const isHO = access?.is_ho === true;

    const [form, setForm] = useState(() => ({
        l4_approver_id: draft?.l4_approver_id || '',
        l5_approver_id: draft?.l5_approver_id || '',
        category: draft?.category || '',
        request_type: draft?.request_type || lockedType || 'discounting',
        branch: draft?.branch || (branches.length === 1 ? branches[0].branch : (user.branch || '')),
        customer_name: draft?.customer_name || '',
        instance_id: draft?.instance_id || '',
        sr_no: draft?.sr_no || '',
        invoice_no: draft?.invoice_no || '',
        delivery_challan: draft?.delivery_challan || '',
        quotation_no: draft?.quotation_no || '',
        quotation_amount: draft?.quotation_amount ?? '',
        discount_percent: draft?.discount_percent ?? '',
        credit_days: draft?.credit_days ?? '',
        expense_amount: draft?.expense_amount ?? '',
        expense_type: draft?.expense_type || '',
        // Expense settlement block — who paid and how, who is reimbursed and how
        paid_by_name: draft?.paid_by_name || '',
        paid_by_mode: draft?.paid_by_mode || '',
        reimburse_to: draft?.reimburse_to || '',
        reimburse_mode: draft?.reimburse_mode || '',
        reimburse_bank_details: draft?.reimburse_bank_details || '',
        /* a draft saved before rich purpose holds plain text — escape it so
           a stray '<' or '&' survives the round-trip through the editor */
        description: richToDisplayHtml(draft?.description),
        remark: draft?.remark || '',
    }));
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef(null);

    // Expense: MULTIPLE types picked from ONE dropdown, with ONE amount for
    // all of them together (matching the single expense limit). Stored as
    // "Food, Travel" + the amount. Legacy "Food: 500; ..." drafts parse too.
    const parseExpTypes = (d) =>
        d?.request_type === 'expense' && d.expense_type
            ? String(d.expense_type).split(/[;,]/).map(p => p.split(':')[0].trim()).filter(Boolean)
            : [];
    const [expTypes, setExpTypes] = useState(() => parseExpTypes(draft));
    const [expOpen, setExpOpen] = useState(false);
    const toggleExpType = (n) =>
        setExpTypes(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

    // Expense type dropdown values from the COO-managed master
    const [expenseTypes, setExpenseTypes] = useState([]);
    useEffect(() => {
        getExpenseTypes()
            .then(d => setExpenseTypes(d.expense_types || []))
            .catch(() => { /* dropdown just stays empty */ });
    }, []);

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
    const isExpense = form.request_type === 'expense';
    const isDnC = form.request_type === 'discounting_credit';
    const isDiscounting = form.request_type === 'discounting' || isDnC;
    const isCredit = form.request_type === 'credit' || isDnC;
    // "Other": customer block WITHOUT SR No., no value field, no limit — the
    // record always runs L4 (HOD) -> L5 (COO).
    const isOther = form.request_type === 'other';

    const buildFormData = () => {
        const fd = new FormData();
        const branchObj = branches.find(b => b.branch === form.branch);
        Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
        fd.append('branch_name', branchObj?.branch_name || '');
        if (isExpense) fd.set('expense_type', expTypes.join(', '));
        files.forEach(f => fd.append('files', f));
        return fd;
    };

    // Anything typed at all? Used to decide whether closing should auto-draft.
    const hasData = () => draft != null || files.length > 0 || expTypes.length > 0 || [
        'description', 'customer_name', 'instance_id', 'sr_no', 'invoice_no',
        'delivery_challan', 'quotation_no', 'quotation_amount', 'discount_percent',
        'credit_days', 'expense_amount', 'expense_type', 'remark',
        'paid_by_name', 'paid_by_mode', 'reimburse_to', 'reimburse_mode',
        'reimburse_bank_details',
    ].some(k => String(form[k] ?? '').trim() !== '');

    const saveDraft = async () => {
        if (draft) {
            await updateApplication(draft.id, buildFormData());   // no submit flag -> stays draft
        } else {
            const fd = buildFormData();
            fd.append('save_as_draft', 'true');
            await createApplication(fd);
        }
    };

    // Outside click / X: never lose the data — auto-save it as a draft.
    const handleClose = async () => {
        if (saving) return;
        if (hasData()) {
            setSaving(true);
            try {
                await saveDraft();
                toast.success('Saved to drafts');
                onCreated();
            } catch (err) {
                toast.error(errText(err, 'Could not save draft'));
            } finally { setSaving(false); }
        }
        onClose();
    };

    const handleSaveDraft = async () => {
        setSaving(true);
        try {
            await saveDraft();
            toast.success('Saved to drafts — submit it anytime from your list');
            onCreated();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Could not save draft'));
        } finally { setSaving(false); }
    };

    const handleDeleteDraft = async () => {
        const res = await Swal.fire({
            title: 'Delete this draft?',
            text: 'The draft and its attachments will be permanently removed',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#d97706',
        });
        if (!res.isConfirmed) return;
        setSaving(true);
        try {
            await deleteApplication(draft.id);
            toast.success('Draft deleted');
            onCreated();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Could not delete draft'));
        } finally { setSaving(false); }
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!form.category) return toast.error('Please select Spares / Services');
        if (!form.request_type) return toast.error('Please select Discounting / Credit / Expense');
        if (!form.branch) return toast.error('Please select a branch');
        if (isRichEmpty(form.description)) return toast.error('Purpose of approval is required');
        if (isDnC) {
            // combined type: either one may be blank, but never BOTH
            if (!form.discount_percent && !form.credit_days)
                return toast.error('Enter Discounting % or Credit Period - days — at least one');
        } else {
            if (isDiscounting && !form.discount_percent) return toast.error('Discounting % is required');
            if (isCredit && !form.credit_days) return toast.error('Credit period - days is required');
        }
        // Discounting / Credit: Customer Name & Quotation Amount mandatory;
        // Instance ID / SR No. / Invoice / Delivery Challan are optional.
        // Other: only Customer Name (with Purpose & Remark) is mandatory.
        if (!isExpense) {
            if (!form.customer_name.trim()) return toast.error('Customer name is required');
            if (!isOther && !form.quotation_amount) return toast.error('Quotation amount is required');
        }
        // Expense: at least one type + the single combined amount
        if (isExpense) {
            if (!expTypes.length) return toast.error('Select at least one expense type');
            if (!form.expense_amount) return toast.error('Expense amount is required');
            // a bank transfer is useless without the account details
            if (form.reimburse_mode === 'Bank transfer' && !form.reimburse_bank_details.trim())
                return toast.error('Enter the bank details for the reimbursement');
        }
        if (!form.remark.trim()) return toast.error('Remark is required');

        const branchObj = branches.find(b => b.branch === form.branch);

        // Confirmation with everything the user entered, as bullet points
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const li = (label, value) => (value === null || value === undefined || String(value).trim() === '')
            ? '' : `<li style="margin:3px 0"><b>${label}:</b> ${esc(value)}</li>`;
        // Purpose may hold a pasted table — show it as one, not as escaped tags
        const liRich = (label, value) => isRichEmpty(value) ? ''
            : `<li style="margin:3px 0"><b>${label}:</b><div class="apv-rich" style="margin-top:3px;overflow-x:auto">${richToDisplayHtml(value)}</div></li>`;
        const bullets = [
            li('Category', catLabel(form.category)),
            li('Type', typeLabel(form.request_type)),
            li('Branch', `${form.branch}${branchObj?.branch_name ? ' — ' + branchObj.branch_name : ''}`),
            liRich('Purpose of Approval', form.description),
            !isExpense ? li('Customer Name', form.customer_name) : '',
            !isExpense ? li('Instance ID', form.instance_id) : '',
            li('SR No.', form.sr_no),
            !isExpense ? li('Invoice', form.invoice_no) : '',
            !isExpense ? li('Delivery Challan', form.delivery_challan) : '',
            li('Quotation Number', form.quotation_no),
            li('Quotation Amount', form.quotation_amount && `₹${Number(form.quotation_amount).toLocaleString('en-IN')}`),
            isDiscounting && form.discount_percent ? li('Discounting %', `${form.discount_percent}%`) : '',
            isCredit && form.credit_days ? li('Credit Period', `${form.credit_days} days`) : '',
            isExpense ? li('Expense Types', expTypes.join(', ')) : '',
            isExpense && form.expense_amount ? li('Expense Amount', `₹${Number(form.expense_amount).toLocaleString('en-IN')}`) : '',
            isExpense ? li('Paid By', [form.paid_by_name, form.paid_by_mode].filter(Boolean).join(' - ')) : '',
            isExpense ? li('Reimburse To', [form.reimburse_to, form.reimburse_mode].filter(Boolean).join(' - ')) : '',
            isExpense && form.reimburse_mode === 'Bank transfer' ? li('Bank Details', form.reimburse_bank_details) : '',
            li('Remark', form.remark),
            li('Attachments', files.length ? files.map(f => f.name).join(', ') : ''),
        ].join('');

        // The approval path this record will follow — fetched live so the CC
        // box's right panel shows the hierarchy and offers a per-level
        // approver pick where SEVERAL people hold a level. No pick = every
        // assigned approver may act (the panel just hides on fetch error).
        // Kicked off BEFORE the confirmation box so it loads while the user
        // reads it — by the time they press Yes it is usually already here.
        let chainReady = false;
        const chainPromise = getChainPreview(form.branch, form.category, form.request_type)
            .then(d => d.levels || null)
            .catch(() => null)   /* submit still works without the flow panel */
            .finally(() => { chainReady = true; });

        const res = await Swal.fire({
            title: 'Are you sure to submit for approval?',
            // wider popup: a purpose pasted from Excel needs the room
            width: 760,
            html: `<div style="text-align:left;max-height:45vh;overflow:auto;font-size:13px">
                       <ul style="padding-left:18px;margin:0;list-style:disc">${bullets}</ul>
                   </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Submit',
            cancelButtonText: 'Cancel',
            confirmButtonColor: BRAND,
        });
        if (!res.isConfirmed) return;

        // Loader ONLY when the fetch is still in flight — showing it when the
        // data is already here races its didOpen/showLoading onto the CC box
        // (the spinner would replace the OK button).
        if (!chainReady) {
            Swal.fire({
                title: 'Preparing approval flow…',
                html: 'Please wait',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading(),
            });
        }
        const chainLevels = await chainPromise;

        const pickerLevels = [];
        // An L2/L3/L4 creator's record only travels UPWARD — levels at or
        // below their own stage never act on it, so hide those rows (same
        // trim as the My Approval Limits popup).
        const LVL_ORDER = { l2: 2, l3: 3, l4: 4, l5: 5 };
        const myOrder = { l2: 2, l3: 3, l4: 4 }[access?.level] || 0;
        const flowRows = (chainLevels || [])
            .filter(l => (LVL_ORDER[l.level] || 0) > myOrder)
            .map(l => {
            const tag = `${l.level.toUpperCase()} – ${esc(levelName(l.level))}`;
            const row = (body) => `<div style="margin:6px 0"><b style="font-size:11px">${tag}</b>${body}</div>`;
            if (l.skipped)
                return row(`<div style="font-size:11px;color:var(--apv-dim)">${esc(l.skipped)}</div>`);
            const cands = l.candidates || [];
            const hoL4 = isHO && l.level === 'l4';
            if (cands.length <= 1 && !hoL4)
                return row(`<div style="font-size:11px;color:var(--apv-strong)">${esc(cands.map(c => c.name).join(', ') || '—')}</div>`);
            pickerLevels.push(l.level);
            // MULTI-SELECT (2026-08-11): tick one or several approvers — ANY of
            // the ticked may act on the record. None ticked = all approvers
            // may act (HO L4: none ticked = skip straight to COO/L5).
            const preset = l.level === 'l4'
                ? String(form.l4_approver_id || '').split(',').map(s => s.trim()).filter(Boolean)
                : [];
            const hint = hoL4
                ? 'None ticked — skips this level, goes directly to COO - L5'
                : 'None ticked — all approvers, anyone may act';
            const boxes = cands.map(c =>
                `<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin:2px 0;cursor:pointer;color:var(--apv-field-text)">
                     <input type="checkbox" class="chainpick_${l.level}" value="${esc(c.user_id)}" ${preset.includes(c.user_id) ? 'checked' : ''} style="accent-color:#2f3192;flex-shrink:0">
                     <span>${esc(c.name)}</span>
                 </label>`).join('');
            return row(`<div style="border:1px solid var(--apv-field-border);border-radius:8px;padding:5px 8px;margin-top:2px;background:var(--apv-field-bg);max-height:110px;overflow-y:auto">${boxes}</div>
                <div style="font-size:10px;color:var(--apv-dim);margin-top:2px">${hint}</div>`);
        }).join('');

        // Creator attaches CC addresses for the future result email (left)
        // and picks the record's approvers per level (right) — ONE box.
        const ccAdded = String(draft?.cc_emails || '').split(',').map(s => s.trim()).filter(Boolean);
        const toAdded = String(draft?.to_emails || '').split(',').map(s => s.trim()).filter(Boolean);
        // The creator's own address always receives the result mail, so it is
        // shown as a LOCKED chip in the To list — visible, never removable, and
        // never submitted (the server resolves it from the profile).
        const myEmail = (access?.email || '').trim();
        const toLocked = myEmail ? [myEmail] : [];
        const ccRes = await Swal.fire({
            title: 'To / CC emails & approval flow',
            width: 720,
            html: `<div style="display:flex;gap:14px;text-align:left;font-size:13px;flex-wrap:wrap">
                       <div style="flex:1;min-width:230px">
                           <p style="margin:0 0 2px;font-size:12px;color:var(--apv-muted)">
                               When this NFA is approved / rejected the result email goes
                               <b>To: you - creator</b> with the <b>approvers in CC automatically</b>.
                           </p>
                           ${emailGroupHtml('apv-tosub', 'Add more To emails - optional:')}
                           ${emailGroupHtml('apv-ccsub', 'Add more CC emails - optional:')}
                       </div>
                       <div style="flex:1;min-width:230px;border-left:1px solid var(--apv-divider);padding-left:14px">
                           <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:var(--apv-strong)">
                               APPROVAL FLOW — tick who approves where several people hold a level - any ticked may act
                           </p>
                           ${flowRows || '<p style="font-size:11px;color:var(--apv-dim)">Flow preview unavailable — default approvers apply</p>'}
                       </div>
                   </div>`,
            showCancelButton: true,
            allowOutsideClick: false,
            allowEscapeKey: false,
            confirmButtonText: 'OK — Continue',
            cancelButtonText: 'Cancel',
            confirmButtonColor: BRAND,
            didOpen: () => {
                Swal.hideLoading();   // if the transient loader's spinner landed here, put the OK button back
                wireEmailGroup('apv-tosub', toAdded, toLocked);
                wireEmailGroup('apv-ccsub', ccAdded);
            },
            preConfirm: () => {
                if (!flushEmailGroup('apv-tosub', toAdded, toLocked)) return false;
                if (!flushEmailGroup('apv-ccsub', ccAdded)) return false;
                const picks = {};
                pickerLevels.forEach(lvl => {
                    const ticked = document.querySelectorAll(`.chainpick_${lvl}:checked`);
                    picks[lvl] = [...ticked].map(el => el.value).join(',');
                });
                // No ticks = all approvers may act (HO L4: straight to COO/L5)
                return picks;
            },
        });
        // Cancel here aborts the whole submit — the form stays open with every
        // field intact so the creator can edit and submit again.
        if (!ccRes.isConfirmed) return;
        const approverPicks = (ccRes.value && typeof ccRes.value === 'object') ? ccRes.value : {};
        const ccList = ccAdded;

        setSaving(true);
        // attachments upload here — keep a blocking loader on screen so the
        // user sees the submit is in progress (closed on success / failure)
        Swal.fire({
            title: 'Submitting application…',
            html: 'Please wait',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading(),
        });
        try {
            let res;
            const fd = buildFormData();
            fd.set('cc_emails', ccList.join(', '));
            fd.set('to_emails', toAdded.join(', '));
            // chosen approvers from the CC box's flow panel (empty = default)
            ['l2', 'l3', 'l4', 'l5'].forEach(lvl => {
                if (lvl in approverPicks) fd.set(`${lvl}_approver_id`, approverPicks[lvl] || '');
            });
            if (draft) {
                fd.append('submit', 'true');    // draft becomes a numbered, pending application
                res = await updateApplication(draft.id, fd);
            } else {
                res = await createApplication(fd);
            }
            if (res?.application?.status === 'approved') {
                toast.success('Submitted — auto approved - within your own authority limit');
                await promptResultEmail(res.application);
            } else {
                toast.success('Application submitted');
            }
            onCreated();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to submit application'));
        } finally {
            Swal.close();   // drop the loader on success and failure alike
            setSaving(false);
        }
    };

    const input = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-gray-900';
    const label = 'block text-[11px] font-bold text-black mb-1';

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 max-md:p-2" onClick={handleClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-5 max-sm:px-3 py-3 rounded-t-2xl text-white" style={{ background: BRAND }}>
                    <span className="font-semibold text-sm flex items-center gap-2 min-w-0">
                        <FileText size={16} /> {draft
                            ? (draft.status === 'rejected' ? `Edit & Resubmit — ${draft.app_no || ''}`
                                : draft.status === 'draft' ? 'Edit Draft Application'
                                    : `Edit NFA — ${draft.app_no || ''}`)
                            : title}
                    </span>
                    <button onClick={handleClose} className="p-1.5 rounded-lg bg-white hover:bg-white/90 transition flex-shrink-0" style={{ color: '#2f3192' }}><X size={15} /></button>
                </div>

                <form onSubmit={submit} className="p-4 space-y-3">
                    {/* HO members pick their L4 (HOD) approver in the submit-time
                        "CC emails & approval flow" box — no form field needed */}

                    {/* ONE lined grid (like the detail view) — Purpose & Remark
                        span the full width, every other field is one cell */}
                    {(() => {
                        const cell = 'min-w-0 px-3 py-2 bg-white border-b border-r border-gray-100';
                        const full = `${cell} col-span-2 sm:col-span-3`;
                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 rounded-xl border border-gray-200">
                                <div className={cell}>
                                    <span className={label}>Spares / Services *</span>
                                    <select className={input} value={form.category} onChange={set('category')}>
                                        <option value="">Select…</option>
                                        {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div className={cell}>
                                    <span className={label}>Application Type *</span>
                                    <select className={input} value={form.request_type} onChange={set('request_type')} disabled={!!lockedType}>
                                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div className={cell}>
                                    <span className={label}><Building2 size={11} className="inline mr-1" />Branch *</span>
                                    <select className={input} value={form.branch} onChange={set('branch')}>
                                        <option value="">Select…</option>
                                        {branches.map(b => (
                                            <option key={b.branch} value={b.branch}>{b.branch} — {b.branch_name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Purpose — full width */}
                                <div className={full}>
                                    <span className={label}>Purpose of Approval *</span>
                                    <RichTextBox
                                        className={input}
                                        value={form.description}
                                        onChange={(html) => setForm(f => ({ ...f, description: html }))}
                                        placeholder="Explain why this approval is needed" />
                                </div>

                                {!isExpense && (
                                    <>
                                        <div className={cell}>
                                            <span className={label}>Customer Name *</span>
                                            <input className={input} value={form.customer_name} onChange={set('customer_name')} placeholder="Customer name" />
                                        </div>
                                        <div className={cell}>
                                            <span className={label}>Instance ID</span>
                                            <input className={input} value={form.instance_id} onChange={set('instance_id')} placeholder="Instance ID" />
                                        </div>
                                        {/* Other carries no SR No. */}
                                        {!isOther && (
                                            <div className={cell}>
                                                <span className={label}>SR No.</span>
                                                <input className={input} value={form.sr_no} onChange={set('sr_no')} placeholder="SR number" />
                                            </div>
                                        )}
                                        <div className={cell}>
                                            <span className={label}>Invoice</span>
                                            <input className={input} value={form.invoice_no} onChange={set('invoice_no')} placeholder="Invoice no." />
                                        </div>
                                        <div className={cell}>
                                            <span className={label}>Delivery Challan</span>
                                            <input className={input} value={form.delivery_challan} onChange={set('delivery_challan')} placeholder="Challan no." />
                                        </div>
                                        <div className={cell}>
                                            <span className={label}>Quotation Number</span>
                                            <input className={input} value={form.quotation_no} onChange={set('quotation_no')} placeholder="Quotation no." />
                                        </div>
                                        <div className={cell}>
                                            <span className={label}>Quotation Amount {isOther ? '' : '*'}</span>
                                            <input className={input} type="number" step="0.01" min="0" value={form.quotation_amount}
                                                onChange={set('quotation_amount')} placeholder="0.00" />
                                        </div>
                                    </>
                                )}
                                {isOther && (
                                    <div className={`${full} !py-1.5`}>
                                        <p className="text-[10px] text-gray-500">
                                            No approval limit applies to an Other NFA — it goes to L4 - HOD and then
                                            to the COO - L5 for final approval.
                                        </p>
                                    </div>
                                )}

                                {isExpense && (
                                    <>
                                        <div className={cell}>
                                            <span className={label}>SR Number</span>
                                            <input className={input} value={form.sr_no} onChange={set('sr_no')} placeholder="SR number" />
                                        </div>
                                        {/* MULTI-SELECT dropdown — one amount covers all picked types */}
                                        <div className={`${cell} relative`}>
                                            <span className={label}>Expense Types *</span>
                                            <button type="button" onClick={() => setExpOpen(o => !o)}
                                                className={`${input} text-left flex items-center justify-between gap-1`}>
                                                <span className={`truncate ${expTypes.length ? 'text-gray-900' : 'text-gray-400'}`}
                                                    title={expTypes.join(', ')}>
                                                    {expTypes.length ? expTypes.join(', ') : 'Select…'}
                                                </span>
                                                <span className="text-gray-500 flex-shrink-0">▾</span>
                                            </button>
                                            {expOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-10" onClick={() => setExpOpen(false)} />
                                                    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white shadow-xl p-1.5 max-h-44 overflow-y-auto apv-scroll">
                                                        {expenseTypes.map(t => (
                                                            <label key={t.id}
                                                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-[11px] text-gray-800">
                                                                <input type="checkbox" className="accent-indigo-600"
                                                                    checked={expTypes.includes(t.name)}
                                                                    onChange={() => toggleExpType(t.name)} />
                                                                <span className="truncate" title={t.name}>{t.name}</span>
                                                            </label>
                                                        ))}
                                                        {expenseTypes.length === 0 && (
                                                            <p className="px-2 py-1.5 text-[10px] text-gray-400">No expense types yet — COO adds them from the Expense Type Master</p>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div className={cell}>
                                            <span className={label}>Expense Amount *</span>
                                            <input className={input} type="number" step="0.01" min="0" value={form.expense_amount}
                                                onChange={set('expense_amount')} placeholder="0.00" />
                                        </div>
                                        <div className={cell}>
                                            <span className={label}>Quotation Number</span>
                                            <input className={input} value={form.quotation_no} onChange={set('quotation_no')} placeholder="Quotation no." />
                                        </div>
                                        <div className={cell}>
                                            <span className={label}>Quotation Amount</span>
                                            <input className={input} type="number" step="0.01" min="0" value={form.quotation_amount}
                                                onChange={set('quotation_amount')} placeholder="0.00" />
                                        </div>
                                    </>
                                )}

                                {isDiscounting && (
                                    <div className={cell}>
                                        <span className={label}>Discounting % {isDnC ? '' : '*'}</span>
                                        <input className={input} type="number" step="0.01" min="0" max="100"
                                            value={form.discount_percent} onChange={set('discount_percent')} placeholder="e.g. 10" />
                                    </div>
                                )}
                                {isCredit && (
                                    <div className={cell}>
                                        <span className={label}>Credit Period - Days {isDnC ? '' : '*'}</span>
                                        <input className={input} type="number" step="1" min="1"
                                            value={form.credit_days} onChange={set('credit_days')} placeholder="e.g. 30" />
                                    </div>
                                )}
                                {isDnC && (
                                    <div className={`${full} !py-1.5`}>
                                        <p className="text-[10px] text-gray-500">
                                            Fill Discounting % or Credit Period — at least one (both allowed).
                                        </p>
                                    </div>
                                )}

                                {/* Remark — full width */}
                                <div className={full}>
                                    <span className={label}>Remark *</span>
                                    {/* input-height by default; grows automatically with the text */}
                                    <textarea className={`${input} resize-none overflow-hidden`} rows={1}
                                        value={form.remark} onChange={set('remark')}
                                        onInput={e => {
                                            e.target.style.height = 'auto';
                                            e.target.style.height = `${e.target.scrollHeight}px`;
                                        }}
                                        placeholder="Any remark for the approvers" />
                                </div>

                                {/* Expense settlement — who actually paid, and who
                                    has to be reimbursed. The reimbursement mode
                                    decides what the payee has to do next, so the
                                    instruction for it shows right here. */}
                                {isExpense && (
                                    <>
                                        <div className={cell}>
                                            <span className={label}>Paid By Name</span>
                                            <input className={input} value={form.paid_by_name}
                                                onChange={set('paid_by_name')} placeholder="Who paid" />
                                        </div>
                                        <div className={`${cell} col-span-1 sm:col-span-2`}>
                                            <span className={label}>Mode of Payment</span>
                                            <select className={input} value={form.paid_by_mode} onChange={set('paid_by_mode')}>
                                                <option value="">Select…</option>
                                                {PAID_BY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>

                                        <div className={cell}>
                                            <span className={label}>Reimburse To</span>
                                            <input className={input} value={form.reimburse_to}
                                                onChange={set('reimburse_to')} placeholder="Who gets reimbursed" />
                                        </div>
                                        <div className={`${cell} col-span-1 sm:col-span-2`}>
                                            <span className={label}>Mode of Payment</span>
                                            <select className={input} value={form.reimburse_mode} onChange={set('reimburse_mode')}>
                                                <option value="">Select…</option>
                                                {REIMBURSE_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>

                                        {form.reimburse_mode === 'Bank transfer' && (
                                            <div className={full}>
                                                <span className={label}>Bank Details *</span>
                                                <textarea className={`${input} resize-y`} rows={3}
                                                    value={form.reimburse_bank_details}
                                                    onChange={set('reimburse_bank_details')}
                                                    placeholder={'Account holder name\nBank name & branch\nAccount number\nIFSC code'} />
                                            </div>
                                        )}
                                        {form.reimburse_mode && form.reimburse_mode !== 'Bank transfer' && (
                                            <div className={`${full} !py-2`}>
                                                <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                                                    <Info size={13} className="flex-shrink-0 mt-px" />
                                                    <span>{REIMBURSE_NOTES[form.reimburse_mode]}</span>
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })()}

                    <div>
                        <span className={label}><Paperclip size={11} className="inline mr-1" />Attachments</span>
                        {draft?.attachments?.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {draft.attachments.map(f => (
                                    <span key={f.id} className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 text-[11px] text-indigo-700">
                                        <Paperclip size={11} />
                                        <span className="max-w-[140px] truncate" title={f.original_name}>{f.original_name}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                        <input ref={fileInputRef} type="file" multiple className="hidden"
                            onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-2 rounded-lg border border-dashed border-indigo-300 text-indigo-700 text-xs font-medium hover:bg-indigo-50 w-full">
                            + Add files (invoice, challan, quotation…)
                        </button>
                        {files.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {files.map((f, i) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-[11px]">
                                        <Paperclip size={11} className="text-indigo-600" />
                                        <span className="max-w-[140px] truncate">{f.name}</span>
                                        <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}
                                            className="text-gray-400 hover:text-amber-600"><X size={11} /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        {draft && draft.status !== 'rejected' && (
                            <button type="button" onClick={handleDeleteDraft} disabled={saving}
                                className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 disabled:opacity-50">
                                <Trash2 size={13} /> {draft.status === 'draft' ? 'Delete Draft' : 'Delete NFA'}
                            </button>
                        )}
                        {/* An already-filed NFA cannot go back to being a draft,
                            so the option only shows for new records and drafts. */}
                        {(!draft || draft.status === 'draft') && (
                            <button type="button" onClick={handleSaveDraft} disabled={saving}
                                className="px-4 py-2 rounded-lg text-xs font-semibold border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                                {saving ? 'Saving…' : 'Save as Draft'}
                            </button>
                        )}
                        <button type="submit" disabled={saving}
                            className="px-5 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: BRAND }}>
                            {saving ? 'Submitting…' : draft?.status === 'rejected' ? 'Resubmit Application' : 'Submit Application'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
