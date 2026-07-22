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
    Building2, User, IndianRupee, Trash2, Clock3,
} from 'lucide-react';
import {
    createApplication, updateApplication, approveApplication, rejectApplication,
    deleteApplication, attachmentViewUrl, attachmentDownloadUrl,
    approvalPdfUrl, getExpenseTypes, errText,
} from './approvalApi';

export const BRAND = '#2f3192';

export const CATEGORY_OPTIONS = [
    { value: 'spares', label: 'Spares' },
    { value: 'services', label: 'Services' },
    { value: 'spares_services', label: 'Spares & Services' },
];

export const TYPE_OPTIONS = [
    { value: 'discounting', label: 'Discounting' },
    { value: 'credit', label: 'Credit' },
    { value: 'expense', label: 'Expense' },
];

export const STATUS_META = {
    draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    pending_branch: { label: 'Pending @ Branch Admin', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    pending_hod: { label: 'Pending @ HOD', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    pending_coo: { label: 'Pending @ COO', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700 border-red-200' },
};

export const catLabel = (v) => CATEGORY_OPTIONS.find(o => o.value === v)?.label || v;
export const typeLabel = (v) => TYPE_OPTIONS.find(o => o.value === v)?.label || v;

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
    const meta = STATUS_META[status] || { label: status, cls: 'bg-gray-100 text-gray-700 border-gray-200' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${meta.cls}`}>
            {meta.label}
        </span>
    );
}

export function SummaryCards({ apps, onCardClick = null }) {
    const counts = useMemo(() => ({
        total: apps.length,
        pending: apps.filter(a => a.status.startsWith('pending')).length,
        approved: apps.filter(a => a.status === 'approved').length,
        rejected: apps.filter(a => a.status === 'rejected').length,
    }), [apps]);
    // White cards with a soft tinted icon tile — light, and every class here has
    // an html.dark override in index.css so the cards adapt to dark mode too.
    // Clickable: opens that slice of records in a popup with filters.
    const card = (key, label, value, Icon, tileCls, valueCls) => (
        <button type="button" onClick={() => onCardClick?.(key, label)}
            className={`rounded-xl border border-gray-200 bg-white shadow-sm p-3 flex items-center gap-3 text-left transition ${onCardClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow' : 'cursor-default'}`}
            title={onCardClick ? `View ${label.toLowerCase()} records` : undefined}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tileCls}`}>
                <Icon size={17} />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-500 truncate">{label}</p>
                <p className={`text-xl font-bold leading-tight ${valueCls}`}>{value}</p>
            </div>
        </button>
    );
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {card('all', 'Total Applications', counts.total, FileText, 'bg-indigo-50 text-indigo-600', 'text-gray-800')}
            {card('pending', 'Pending', counts.pending, Clock3, 'bg-amber-50 text-amber-600', 'text-amber-600')}
            {card('approved', 'Approved', counts.approved, CheckCircle2, 'bg-emerald-50 text-emerald-600', 'text-emerald-600')}
            {card('rejected', 'Rejected', counts.rejected, XCircle, 'bg-red-50 text-red-500', 'text-red-500')}
        </div>
    );
}

/* ---------------- Type tab bar (Discounting default) ---------------- */

export function TypeTabs({ value, onChange }) {
    return (
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
            {TYPE_OPTIONS.map(o => (
                <button key={o.value} onClick={() => onChange(o.value)}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${value === o.value
                        ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                    style={value === o.value ? { background: BRAND } : undefined}>
                    {o.label}
                </button>
            ))}
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

    const isExpense = type === 'expense';

    const commonLeft = (app, index) => (
        <>
            <td className={`${td} text-gray-500 whitespace-nowrap`}>{index + 1}</td>
            <td className={`${td} font-semibold text-indigo-900 whitespace-nowrap`}>{app.app_no || 'Draft'}</td>
            <td className={`${td} whitespace-nowrap text-gray-600`}>{fmtDate(app.created_at)}</td>
            <td className={`${td} whitespace-nowrap`}>{catLabel(app.category)}</td>
            <td className={`${td} whitespace-nowrap`}>{app.branch}{app.branch_name ? ` — ${app.branch_name}` : ''}</td>
        </>
    );
    const commonRight = (app) => (
        <>
            <td className={`${td} max-w-[220px]`}>
                <span className="block truncate" title={app.description}>{app.description || '—'}</span>
            </td>
            <td className={`${td} whitespace-nowrap`}>{app.created_by_name || app.created_by}</td>
            <td className={`${td} whitespace-nowrap`}>
                {app.attachments?.length
                    ? <span className="inline-flex items-center gap-1 text-indigo-700"><Paperclip size={12} />{app.attachments.length}</span>
                    : '—'}
            </td>
            <td className={td}><StatusBadge status={app.status} /></td>
        </>
    );

    return (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* top scrollbar */}
            <div ref={topScrollRef} onScroll={mirror(topScrollRef, tableScrollRef)}
                className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
                <div style={{ width: tableW, height: 1 }} />
            </div>
            {/* table — scrolls horizontally, but its own scrollbar is hidden;
                the single scrollbar on top drives (and mirrors) the scroll */}
            <style>{'.apv-noscroll::-webkit-scrollbar{display:none}'}</style>
            <div ref={tableScrollRef} onScroll={mirror(tableScrollRef, topScrollRef)}
                className="overflow-x-auto apv-noscroll"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <table className="min-w-full text-xs border-collapse">
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
                                <th className={th}>Status</th>
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
                                <th colSpan={3} className={th}>Customer Details</th>
                                <th colSpan={2} className={th}>Documents</th>
                                <th colSpan={2} className={th}>Quotation</th>
                                <th rowSpan={2} className={th}>
                                    {type === 'discounting' ? 'Discounting %' : 'Credit Period (Days)'}
                                </th>
                                <th rowSpan={2} className={th}>Purpose</th>
                                <th rowSpan={2} className={th}>Created By</th>
                                <th rowSpan={2} className={th}>Files</th>
                                <th rowSpan={2} className={th}>Status</th>
                            </tr>
                            <tr className="text-[11px] uppercase tracking-wide">
                                <th className={th}>Name</th>
                                <th className={th}>Instance ID</th>
                                <th className={th}>SR No.</th>
                                <th className={th}>Invoice</th>
                                <th className={th}>Delivery Challan</th>
                                <th className={th}>Number</th>
                                <th className={th}>Amount</th>
                            </tr>
                        </thead>
                    )}
                    <tbody className="bg-white">
                        {visibleApps.map((app, index) => (
                            <tr key={app.id} className="hover:bg-indigo-50/40 cursor-pointer" onClick={() => onOpen(app)}>
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
                                        <td className={`${td} whitespace-nowrap`}>{app.sr_no || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.invoice_no || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.delivery_challan || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{app.quotation_no || '—'}</td>
                                        <td className={`${td} whitespace-nowrap`}>{fmtAmount(app.quotation_amount)}</td>
                                        <td className={`${td} whitespace-nowrap`}>
                                            {type === 'discounting'
                                                ? (app.discount_percent != null ? `${app.discount_percent}%` : '—')
                                                : (app.credit_days != null ? `${app.credit_days} days` : '—')}
                                        </td>
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

/* ---------------- Detail modal (with approve / reject) ---------------- */

function Step({ label, byName, at, remark, state }) {
    const dot = state === 'done' ? 'bg-emerald-500' : state === 'rejected' ? 'bg-red-500'
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
                    : <p className="text-[11px] text-gray-600">
                        {state === 'current' ? 'Awaiting action'
                            /* auto-skip reasons (e.g. no approver defined) come in `remark` */
                            : state === 'skipped' ? (remark || 'Skipped — not required or covered by an earlier approval')
                                : 'Pending'}
                    </p>}
            </div>
        </div>
    );
}

export function ApplicationDetailModal({ app, canAct, canDelete, onClose, onChanged }) {
    const [busy, setBusy] = useState(false);
    if (!app) return null;

    const isExpense = app.request_type === 'expense';

    // Chains vary per employee (Authority Matrix): a step only counts as done
    // when someone actually acted at it; passed-over steps show as skipped.
    const stepState = (level) => {
        const acted = { branch: app.branch_action_by, hod: app.hod_action_by, coo: app.coo_action_by }[level];
        if (app.status === 'rejected' && app.rejected_at_level === level) return 'rejected';
        if (acted) return 'done';
        const pendingOf = { branch: 'pending_branch', hod: 'pending_hod', coo: 'pending_coo' }[level];
        if (app.status === pendingOf) return 'current';
        if (app.status === 'approved' || app.status === 'rejected') return 'skipped';
        const order = ['pending_branch', 'pending_hod', 'pending_coo'];
        return order.indexOf(app.status) > order.indexOf(pendingOf) ? 'skipped' : 'idle';
    };

    const doApprove = async () => {
        const { value: remark, isConfirmed } = await Swal.fire({
            title: 'Approve application?',
            text: `${app.app_no} — ${typeLabel(app.request_type)}`,
            input: 'textarea',
            inputPlaceholder: 'Approval remark (required)',
            inputAttributes: { rows: 4, style: 'min-height:110px;font-size:13px' },
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Approve',
            confirmButtonColor: '#059669',
            inputValidator: (v) => (!v || !v.trim()) ? 'Please enter an approval remark' : undefined,
        });
        if (!isConfirmed) return;
        setBusy(true);
        try {
            const res = await approveApplication(app.id, remark || '');
            const st = res?.application?.status;
            if (st === 'approved') toast.success('Approved — final (within your authorized limit)');
            else if (st === 'pending_hod') toast.success('Approved — forwarded to HOD (beyond your authorized limit)');
            else if (st === 'pending_coo') toast.success('Approved — forwarded to COO (beyond your authorized limit)');
            else toast.success('Application approved');
            onChanged();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to approve'));
        } finally { setBusy(false); }
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
            confirmButtonColor: '#dc2626',
            inputValidator: (v) => (!v || !v.trim()) ? 'Please give a rejection reason' : undefined,
        });
        if (!isConfirmed) return;
        setBusy(true);
        try {
            await rejectApplication(app.id, remark);
            toast.success('Application rejected');
            onChanged();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to reject'));
        } finally { setBusy(false); }
    };

    const doDelete = async () => {
        const res = await Swal.fire({
            title: 'Delete this application?',
            text: `${app.app_no} will be permanently removed`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#dc2626',
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

    const Row = ({ label, value }) => (
        <div>
            <p className="text-[10px] uppercase tracking-wide text-black font-bold">{label}</p>
            <p className="text-xs text-gray-800 break-words">{value ?? '—'}</p>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
            <div
                className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 rounded-t-2xl text-white" style={{ background: BRAND }}>
                    <div className="flex items-center gap-2">
                        <FileText size={16} />
                        <span className="font-semibold text-sm">{app.app_no}</span>
                        <StatusBadge status={app.status} />
                    </div>
                    <div className="flex items-center gap-2">
                        {app.status === 'approved' && (
                            /* full record + trail + attachments as one PDF */
                            <a href={approvalPdfUrl(app.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90"
                                style={{ color: BRAND }}>
                                <Download size={13} /> Download PDF
                            </a>
                        )}
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/15"><X size={16} /></button>
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    {/* Purpose of approval — the headline of the application */}
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-black font-bold">Purpose of Approval</p>
                        <p className="text-xs text-gray-800 break-words">{app.description || '—'}</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <Row label="Type" value={typeLabel(app.request_type)} />
                        <Row label="Category" value={catLabel(app.category)} />
                        <Row label="Branch" value={`${app.branch}${app.branch_name ? ` — ${app.branch_name}` : ''}`} />
                        {!isExpense && <Row label="Customer Name" value={app.customer_name} />}
                        {!isExpense && <Row label="Instance ID" value={app.instance_id} />}
                        <Row label="SR No." value={app.sr_no} />
                        {!isExpense && <Row label="Invoice" value={app.invoice_no} />}
                        {!isExpense && <Row label="Delivery Challan" value={app.delivery_challan} />}
                        <Row label="Quotation Number" value={app.quotation_no} />
                        <Row label="Quotation Amount" value={fmtAmount(app.quotation_amount)} />
                        {app.request_type === 'discounting' && (
                            <Row label="Discounting %" value={app.discount_percent != null ? `${app.discount_percent}%` : '—'} />
                        )}
                        {app.request_type === 'credit' && (
                            <Row label="Credit Period" value={app.credit_days != null ? `${app.credit_days} days` : '—'} />
                        )}
                        {isExpense && <Row label="Expense Amount" value={fmtAmount(app.expense_amount)} />}
                        {isExpense && <Row label="Expense Type" value={app.expense_type} />}
                        <Row label="Created By" value={`${app.created_by_name || app.created_by} · ${fmtDate(app.created_at)}`} />
                    </div>

                    {app.remark && (
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Row label="Remark" value={app.remark} />
                        </div>
                    )}

                    {/* Attachments */}
                    <div>
                        <p className="text-[10px] uppercase tracking-wide text-black font-bold mb-1.5">Attachments</p>
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
                            <Clock3 size={11} /> Approval Flow
                        </p>
                        <Step label="Branch Admin Approval" state={stepState('branch')}
                            byName={app.branch_action_by_name} at={app.branch_action_at} remark={app.branch_action_remark} />
                        <Step label="HOD Approval" state={stepState('hod')}
                            byName={app.hod_action_by_name} at={app.hod_action_at} remark={app.hod_action_remark} />
                        <Step label="COO Approval (Final)" state={stepState('coo')}
                            byName={app.coo_action_by_name} at={app.coo_action_at} remark={app.coo_action_remark} />
                        {app.status === 'rejected' && (
                            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">
                                Rejected by <b>{app.rejected_by_name}</b> ({app.rejected_at_level?.toUpperCase()}) on {fmtDate(app.rejected_at)}
                                {app.rejected_remark ? <> — "{app.rejected_remark}"</> : null}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        {canDelete && (
                            <button onClick={doDelete} disabled={busy}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50">
                                <Trash2 size={13} /> Delete
                            </button>
                        )}
                        {canAct && (
                            <>
                                <button onClick={doReject} disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                                    <XCircle size={13} /> Reject
                                </button>
                                <button onClick={doApprove} disabled={busy}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                                    <CheckCircle2 size={13} /> Approve
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

export function CreateApplicationModal({ onClose, onCreated, lockedType = null, title = 'Create Approval Application', draft = null }) {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const branches = user.branches?.length
        ? user.branches
        : [{ branch: user.branch, branch_name: user.branch_name }];

    const [form, setForm] = useState(() => ({
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
        description: draft?.description || '',
        remark: draft?.remark || '',
    }));
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef(null);

    // Expense type dropdown values from the COO-managed master
    const [expenseTypes, setExpenseTypes] = useState([]);
    useEffect(() => {
        getExpenseTypes()
            .then(d => setExpenseTypes(d.expense_types || []))
            .catch(() => { /* dropdown just stays empty */ });
    }, []);

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
    const isExpense = form.request_type === 'expense';
    const isDiscounting = form.request_type === 'discounting';
    const isCredit = form.request_type === 'credit';

    const buildFormData = () => {
        const fd = new FormData();
        const branchObj = branches.find(b => b.branch === form.branch);
        Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
        fd.append('branch_name', branchObj?.branch_name || '');
        files.forEach(f => fd.append('files', f));
        return fd;
    };

    // Anything typed at all? Used to decide whether closing should auto-draft.
    const hasData = () => draft != null || files.length > 0 || [
        'description', 'customer_name', 'instance_id', 'sr_no', 'invoice_no',
        'delivery_challan', 'quotation_no', 'quotation_amount', 'discount_percent',
        'credit_days', 'expense_amount', 'expense_type', 'remark',
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
            confirmButtonColor: '#dc2626',
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
        if (!form.description.trim()) return toast.error('Purpose of approval is required');
        if (isDiscounting && !form.discount_percent) return toast.error('Discounting % is required');
        if (isCredit && !form.credit_days) return toast.error('Credit period (days) is required');
        // Discounting / Credit: Customer Name & Quotation Amount mandatory;
        // Instance ID / SR No. / Invoice / Delivery Challan are optional
        if (!isExpense) {
            if (!form.customer_name.trim()) return toast.error('Customer name is required');
            if (!form.quotation_amount) return toast.error('Quotation amount is required');
        }
        // Expense: type & amount mandatory; SR Number optional
        if (isExpense) {
            if (!form.expense_type) return toast.error('Expense type is required');
            if (!form.expense_amount) return toast.error('Expense amount is required');
        }
        if (!form.remark.trim()) return toast.error('Remark is required');

        const branchObj = branches.find(b => b.branch === form.branch);

        // Confirmation with everything the user entered, as bullet points
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const li = (label, value) => (value === null || value === undefined || String(value).trim() === '')
            ? '' : `<li style="margin:3px 0"><b>${label}:</b> ${esc(value)}</li>`;
        const bullets = [
            li('Category', catLabel(form.category)),
            li('Type', typeLabel(form.request_type)),
            li('Branch', `${form.branch}${branchObj?.branch_name ? ' — ' + branchObj.branch_name : ''}`),
            li('Purpose of Approval', form.description),
            !isExpense ? li('Customer Name', form.customer_name) : '',
            !isExpense ? li('Instance ID', form.instance_id) : '',
            li('SR No.', form.sr_no),
            !isExpense ? li('Invoice', form.invoice_no) : '',
            !isExpense ? li('Delivery Challan', form.delivery_challan) : '',
            li('Quotation Number', form.quotation_no),
            li('Quotation Amount', form.quotation_amount && `₹${Number(form.quotation_amount).toLocaleString('en-IN')}`),
            isDiscounting ? li('Discounting %', `${form.discount_percent}%`) : '',
            isCredit ? li('Credit Period', `${form.credit_days} days`) : '',
            isExpense ? li('Expense Amount', `₹${Number(form.expense_amount).toLocaleString('en-IN')}`) : '',
            isExpense ? li('Expense Type', form.expense_type) : '',
            li('Remark', form.remark),
            li('Attachments', files.length ? files.map(f => f.name).join(', ') : ''),
        ].join('');

        const res = await Swal.fire({
            title: 'Are you sure to submit for approval?',
            html: `<div style="text-align:left;max-height:45vh;overflow-y:auto;font-size:13px">
                       <ul style="padding-left:18px;margin:0;list-style:disc">${bullets}</ul>
                   </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Submit',
            cancelButtonText: 'Cancel',
            confirmButtonColor: BRAND,
        });
        if (!res.isConfirmed) return;

        setSaving(true);
        try {
            if (draft) {
                const fd = buildFormData();
                fd.append('submit', 'true');    // draft becomes a numbered, pending application
                await updateApplication(draft.id, fd);
            } else {
                await createApplication(buildFormData());
            }
            toast.success('Application submitted');
            onCreated();
            onClose();
        } catch (err) {
            toast.error(errText(err, 'Failed to submit application'));
        } finally { setSaving(false); }
    };

    const input = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-gray-900';
    const label = 'block text-[11px] font-bold text-black mb-1';

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3" onClick={handleClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 rounded-t-2xl text-white" style={{ background: BRAND }}>
                    <span className="font-semibold text-sm flex items-center gap-2">
                        <FileText size={16} /> {draft ? 'Edit Draft Application' : title}
                    </span>
                    <button onClick={handleClose} className="p-1 rounded-lg hover:bg-white/15"><X size={16} /></button>
                </div>

                <form onSubmit={submit} className="p-5 space-y-4">
                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <span className={label}>Spares / Services *</span>
                            <select className={input} value={form.category} onChange={set('category')}>
                                <option value="">Select…</option>
                                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <span className={label}>Application Type *</span>
                            <select className={input} value={form.request_type} onChange={set('request_type')} disabled={!!lockedType}>
                                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <span className={label}><Building2 size={11} className="inline mr-1" />Branch *</span>
                            <select className={input} value={form.branch} onChange={set('branch')}>
                                <option value="">Select…</option>
                                {branches.map(b => (
                                    <option key={b.branch} value={b.branch}>{b.branch} — {b.branch_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Purpose of approval — full-width, always on top */}
                    <div>
                        <span className={label}>Purpose of Approval *</span>
                        <textarea className={input} rows={3} value={form.description} onChange={set('description')}
                            placeholder="Explain why this approval is needed" />
                    </div>

                    {!isExpense && (
                        <>
                            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                                <p className="text-[11px] uppercase tracking-wide text-gray-700 font-bold mb-2 flex items-center justify-center gap-1">
                                    <User size={11} /> Customer Details
                                </p>
                                <div className="grid sm:grid-cols-3 gap-3">
                                    <div>
                                        <span className={label}>Customer Name *</span>
                                        <input className={input} value={form.customer_name} onChange={set('customer_name')} placeholder="Customer name" />
                                    </div>
                                    <div>
                                        <span className={label}>Instance ID</span>
                                        <input className={input} value={form.instance_id} onChange={set('instance_id')} placeholder="Instance ID" />
                                    </div>
                                    <div>
                                        <span className={label}>SR No.</span>
                                        <input className={input} value={form.sr_no} onChange={set('sr_no')} placeholder="SR number" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                                <p className="text-[11px] uppercase tracking-wide text-gray-700 font-bold mb-2 text-center">Documents</p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className={label}>Invoice</span>
                                        <input className={input} value={form.invoice_no} onChange={set('invoice_no')} placeholder="Invoice no." />
                                    </div>
                                    <div>
                                        <span className={label}>Delivery Challan</span>
                                        <input className={input} value={form.delivery_challan} onChange={set('delivery_challan')} placeholder="Challan no." />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                                <p className="text-[11px] uppercase tracking-wide text-gray-700 font-bold mb-2 flex items-center justify-center gap-1">
                                    <IndianRupee size={11} /> Amount
                                </p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className={label}>Quotation Number</span>
                                        <input className={input} value={form.quotation_no} onChange={set('quotation_no')} placeholder="Quotation no." />
                                    </div>
                                    <div>
                                        <span className={label}>Quotation Amount *</span>
                                        <input className={input} type="number" step="0.01" min="0" value={form.quotation_amount}
                                            onChange={set('quotation_amount')} placeholder="0.00" />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {isExpense && (
                        <>
                            <div className="rounded-xl border border-amber-200 p-3 bg-amber-50/60">
                                <p className="text-[11px] uppercase tracking-wide text-gray-700 font-bold mb-2 text-center">Expense Details</p>
                                <div className="grid sm:grid-cols-3 gap-3">
                                    <div>
                                        <span className={label}>SR Number</span>
                                        <input className={input} value={form.sr_no} onChange={set('sr_no')} placeholder="SR number" />
                                    </div>
                                    <div>
                                        <span className={label}>Expense Type *</span>
                                        <select className={input} value={form.expense_type} onChange={set('expense_type')}>
                                            <option value="">Select…</option>
                                            {expenseTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                        </select>
                                        {expenseTypes.length === 0 && (
                                            <p className="text-[10px] text-gray-400 mt-1">No expense types yet — COO adds them from the Expense Type Master</p>
                                        )}
                                    </div>
                                    <div>
                                        <span className={label}>Expense Amount *</span>
                                        <input className={input} type="number" step="0.01" min="0" value={form.expense_amount}
                                            onChange={set('expense_amount')} placeholder="0.00" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                                <p className="text-[11px] uppercase tracking-wide text-gray-700 font-bold mb-2 flex items-center justify-center gap-1">
                                    <IndianRupee size={11} /> Amount
                                </p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className={label}>Quotation Number</span>
                                        <input className={input} value={form.quotation_no} onChange={set('quotation_no')} placeholder="Quotation no." />
                                    </div>
                                    <div>
                                        <span className={label}>Quotation Amount</span>
                                        <input className={input} type="number" step="0.01" min="0" value={form.quotation_amount}
                                            onChange={set('quotation_amount')} placeholder="0.00" />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Last row: type-specific ask (Discounting % / Credit Period) + Remark */}
                    <div className="grid sm:grid-cols-3 gap-3">
                        {isDiscounting && (
                            <div>
                                <span className={label}>Discounting % *</span>
                                <input className={input} type="number" step="0.01" min="0" max="100"
                                    value={form.discount_percent} onChange={set('discount_percent')} placeholder="e.g. 10" />
                            </div>
                        )}
                        {isCredit && (
                            <div>
                                <span className={label}>Credit Period (Days) *</span>
                                <input className={input} type="number" step="1" min="1"
                                    value={form.credit_days} onChange={set('credit_days')} placeholder="e.g. 30" />
                            </div>
                        )}
                        <div className={isExpense ? 'sm:col-span-3' : 'sm:col-span-2'}>
                            <span className={label}>Remark *</span>
                            <textarea className={input} rows={2} value={form.remark} onChange={set('remark')}
                                placeholder="Any remark for the approvers" />
                        </div>
                    </div>

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
                                            className="text-gray-400 hover:text-red-500"><X size={11} /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        {draft && (
                            <button type="button" onClick={handleDeleteDraft} disabled={saving}
                                className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50">
                                <Trash2 size={13} /> Delete Draft
                            </button>
                        )}
                        <button type="button" onClick={handleSaveDraft} disabled={saving}
                            className="px-4 py-2 rounded-lg text-xs font-semibold border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save as Draft'}
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-5 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: BRAND }}>
                            {saving ? 'Submitting…' : 'Submit Application'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
