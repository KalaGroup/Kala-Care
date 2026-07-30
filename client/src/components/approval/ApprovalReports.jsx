/* Reports box for the HOD / COO views.

   Branch-wise view of all three application types (Discounting / Credit /
   Expense) with per-tab filters:
   - all tabs: branch, status, date range, search, quotation amount range
   - discounting: discount % range
   - credit: credit period (days) range
   - expense: expense amount range
   Excel export is permission-gated (master admin or users granted can_export). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { X, BarChart3, RotateCcw, Search, FileSpreadsheet } from 'lucide-react';
import { getApplications, errText } from './approvalApi';
import {
    ApplicationsTable, ApplicationDetailModal, TypeTabs,
    STATUS_META, statusLabel, BRAND, typeLabel, catLabel, fmtDate,
} from './ApprovalShared';

// text-gray-900 is explicit: inputs inside the blue header would otherwise
// inherit its white text and render invisible on their white background
const input = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300';

const EMPTY_FILTERS = {
    branch: '', status: '', dateFrom: '', dateTo: '', search: '',
    qMin: '', qMax: '',      // quotation amount
    dMin: '', dMax: '',      // discount %
    cMin: '', cMax: '',      // credit days
    eMin: '', eMax: '',      // expense amount
};

const inRange = (value, min, max) => {
    if (min === '' && max === '') return true;
    if (value === null || value === undefined) return false;
    const v = Number(value);
    if (min !== '' && v < Number(min)) return false;
    if (max !== '' && v > Number(max)) return false;
    return true;
};

export default function ApprovalReports({ onClose, initialStatus = '', title = 'Approval Reports' }) {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const canExport = user.role === 'master_admin' || user.can_export === true;

    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('discounting');
    const [f, setF] = useState({ ...EMPTY_FILTERS, status: initialStatus });
    const [selected, setSelected] = useState(null);
    const [exporting, setExporting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getApplications();
            setApps((data.applications || []).filter(a => a.status !== 'draft'));
        } catch (err) {
            toast.error(errText(err, 'Failed to load report data'));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

    const branches = useMemo(() => {
        const seen = {};
        apps.forEach(a => { if (a.branch && !seen[a.branch]) seen[a.branch] = a.branch_name || ''; });
        return Object.entries(seen).sort().map(([branch, branch_name]) => ({ branch, branch_name }));
    }, [apps]);

    // Filters shared by every type tab (branch / status / dates / search /
    // quotation range) — the per-type counts on the tabs use exactly these.
    const commonOk = (a) => {
        if (f.branch && a.branch !== f.branch) return false;
        // 'pending' groups every pending_* status (used by the Pending card)
        if (f.status === 'pending' ? !a.status.startsWith('pending') : (f.status && a.status !== f.status)) return false;
        if (f.dateFrom && (!a.created_at || a.created_at.slice(0, 10) < f.dateFrom)) return false;
        if (f.dateTo && (!a.created_at || a.created_at.slice(0, 10) > f.dateTo)) return false;
        if (f.search && ![a.app_no, a.customer_name, a.invoice_no, a.sr_no, a.created_by_name].some(
            v => (v || '').toLowerCase().includes(f.search.toLowerCase()))) return false;
        if (!inRange(a.quotation_amount, f.qMin, f.qMax)) return false;
        return true;
    };

    const filtered = useMemo(() => apps.filter(a => {
        if (a.request_type !== tab) return false;
        if (!commonOk(a)) return false;
        if (tab === 'discounting' && !inRange(a.discount_percent, f.dMin, f.dMax)) return false;
        if (tab === 'credit' && !inRange(a.credit_days, f.cMin, f.cMax)) return false;
        if (tab === 'discounting_credit'
            && !inRange(a.discount_percent, f.dMin, f.dMax)
            && !inRange(a.credit_days, f.cMin, f.cMax)) return false;
        if (tab === 'expense' && !inRange(a.expense_amount, f.eMin, f.eMax)) return false;
        return true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [apps, tab, f]);

    const typeCounts = useMemo(() => {
        const c = { discounting: 0, credit: 0, discounting_credit: 0, expense: 0 };
        apps.forEach(a => { if (commonOk(a)) c[a.request_type] = (c[a.request_type] || 0) + 1; });
        return c;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apps, f]);

    const exportExcel = async () => {
        if (!filtered.length) return toast.error('No records to export');
        setExporting(true);
        try {
            const XLSX = await import('xlsx-js-style');
            const isExpense = tab === 'expense';
            const headers = [
                'Sr. No.', 'Approval No.', 'Date', 'Category', 'Branch',
                ...(isExpense ? ['SR No.', 'Expense Amount', 'Expense Type']
                    : ['Customer Name', 'Instance ID', 'SR No.', 'Invoice', 'Delivery Challan']),
                'Quotation No.', 'Quotation Amount',
                ...(tab === 'discounting' ? ['Discounting %']
                    : tab === 'credit' ? ['Credit Period (Days)']
                        : tab === 'discounting_credit' ? ['Discounting %', 'Credit Period (Days)'] : []),
                'Purpose', 'Remark', 'Created By', 'Status',
                'L2 Approved By', 'L2 Approved At',
                'L3 Approved By', 'L3 Approved At',
                'L4 (HOD) Approved By', 'L4 Approved At',
                'L5 (COO) Approved By', 'L5 Approved At',
                'Rejected By', 'Rejection Remark',
            ];
            const rows = filtered.map((a, i) => [
                i + 1, a.app_no || 'Draft', fmtDate(a.created_at), catLabel(a.category),
                `${a.branch}${a.branch_name ? ' — ' + a.branch_name : ''}`,
                ...(isExpense ? [a.sr_no || '', a.expense_amount ?? '', a.expense_type || '']
                    : [a.customer_name || '', a.instance_id || '', a.sr_no || '', a.invoice_no || '', a.delivery_challan || '']),
                a.quotation_no || '', a.quotation_amount ?? '',
                ...(tab === 'discounting' ? [a.discount_percent ?? '']
                    : tab === 'credit' ? [a.credit_days ?? '']
                        : tab === 'discounting_credit' ? [a.discount_percent ?? '', a.credit_days ?? ''] : []),
                a.description || '', a.remark || '', a.created_by_name || a.created_by,
                statusLabel(a.status),
                a.l2_action_by_name || '', a.l2_action_at ? fmtDate(a.l2_action_at) : '',
                a.l3_action_by_name || '', a.l3_action_at ? fmtDate(a.l3_action_at) : '',
                a.l4_action_by_name || '', a.l4_action_at ? fmtDate(a.l4_action_at) : '',
                a.l5_action_by_name || '', a.l5_action_at ? fmtDate(a.l5_action_at) : '',
                a.rejected_by_name || '', a.rejected_remark || '',
            ]);

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            // Brand-styled header row + sensible column widths
            headers.forEach((_, c) => {
                const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
                if (cell) cell.s = {
                    font: { bold: true, color: { rgb: 'FFFFFF' } },
                    fill: { fgColor: { rgb: '2F3192' } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                };
            });
            ws['!cols'] = headers.map((h, c) => ({
                wch: Math.min(40, Math.max(h.length + 2,
                    ...rows.map(r => String(r[c] ?? '').length + 2))),
            }));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, `${typeLabel(tab)} Report`);
            const stamp = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `Approval_${typeLabel(tab)}_Report_${stamp}.xlsx`);
            toast.success('Report exported');
        } catch (err) {
            console.error(err);
            toast.error('Failed to export report');
        } finally { setExporting(false); }
    };

    const rangePair = (label, minKey, maxKey, unit) => (
        <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-gray-800 whitespace-nowrap">{label}</span>
            <input className={`${input} w-20`} type="number" placeholder={`Min${unit}`}
                value={f[minKey]} onChange={set(minKey)} />
            <span className="text-gray-600 text-[10px]">to</span>
            <input className={`${input} w-20`} type="number" placeholder={`Max${unit}`}
                value={f[maxKey]} onChange={set(maxKey)} />
        </div>
    );

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 max-md:p-2" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] h-[94vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Blue bar: title + search + branch + type tabs + export + close */}
                <div className="flex flex-wrap md:flex-nowrap items-center gap-2 px-3 sm:px-5 py-2.5 rounded-t-2xl text-white md:overflow-x-auto"
                    style={{ background: BRAND, scrollbarWidth: 'thin' }}>
                    <span className="font-semibold text-sm flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                        <BarChart3 size={16} /> {title}
                    </span>
                    <div className="ml-auto flex flex-wrap md:flex-nowrap items-center gap-2 md:flex-shrink-0 min-w-0 max-md:order-last max-md:w-full max-md:ml-0">
                        <div className="relative max-sm:w-full">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
                            <input className={`${input} pl-8 w-44 max-sm:w-full`} placeholder="Search…"
                                value={f.search} onChange={set('search')} />
                        </div>
                        <select className={`${input} max-w-[170px]`} value={f.branch} onChange={set('branch')}>
                            <option value="">All Branches</option>
                            {branches.map(b => (
                                <option key={b.branch} value={b.branch}>{b.branch}{b.branch_name ? ` — ${b.branch_name}` : ''}</option>
                            ))}
                        </select>
                        <TypeTabs value={tab} onChange={setTab} counts={typeCounts} />
                        {canExport && (
                            <button onClick={exportExcel} disabled={exporting || loading}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
                                <FileSpreadsheet size={14} /> {exporting ? 'Exporting…' : 'Export Excel'}
                            </button>
                        )}
                        <button onClick={load} disabled={loading} title="Refresh"
                            className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition disabled:opacity-50 flex-shrink-0">
                            <RotateCcw size={14} />
                        </button>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg bg-white hover:bg-white/90 transition flex-shrink-0 max-md:ml-auto" style={{ color: '#2f3192' }}><X size={15} /></button>
                </div>

                <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        <select className={input} value={f.status} onChange={set('status')}>
                            <option value="">All Statuses</option>
                            <option value="pending">All Pending</option>
                            {Object.keys(STATUS_META).filter(v => v !== 'draft')
                                .map(v => <option key={v} value={v}>{statusLabel(v)}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-gray-800">From</span>
                            <input className={input} type="date" value={f.dateFrom} onChange={set('dateFrom')} />
                            <span className="text-[10px] font-bold text-gray-800">To</span>
                            <input className={input} type="date" value={f.dateTo} onChange={set('dateTo')} />
                        </div>

                        {rangePair('Quotation Amt', 'qMin', 'qMax', ' ₹')}
                        {(tab === 'discounting' || tab === 'discounting_credit') && rangePair('Discount %', 'dMin', 'dMax', ' %')}
                        {(tab === 'credit' || tab === 'discounting_credit') && rangePair('Credit Days', 'cMin', 'cMax', '')}
                        {tab === 'expense' && rangePair('Expense Amt', 'eMin', 'eMax', ' ₹')}

                        <span className="ml-auto text-[11px] font-semibold text-gray-800">
                            {filtered.length} record{filtered.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    {/* Data */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {loading
                            ? <div className="py-16 text-center text-sm text-gray-600">Loading report…</div>
                            : <ApplicationsTable apps={filtered} type={tab} onOpen={setSelected}
                                emptyText="No records match the selected filters" />}
                    </div>
                </div>

                {selected && (
                    <ApplicationDetailModal
                        app={selected} canAct={false} canDelete={false}
                        onClose={() => setSelected(null)} onChanged={load}
                    />
                )}
            </div>
        </div>
    );
}
