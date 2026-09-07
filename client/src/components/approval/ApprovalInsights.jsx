/* NFA Insights — opened by the header "Reports" button (L4 HOD / L5 COO only).

   The four summary cards on the main views keep opening the plain record-list
   popup (ApprovalReports); THIS box is the analytical view of the same data.
   Tabs live in the blue title bar; each tab shows clean tables and ONE graph
   (line or bar, chart.js — same library as the Dashboard) at the bottom:
   - Overview: KPI tiles, amount awaiting per level, type-wise summary,
     monthly table + monthly trend LINE chart
   - Branch / Employee / Category: aggregate table + stacked status BAR chart
   - Pending Ageing: ageing buckets + oldest-pending list + amount BAR chart
   - Approver-wise: actions per approver + stacked BAR chart
   Aggregate rows drill down into the record-list popup (or the record itself),
   and the active tab exports to Excel (master admin / can_export). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    X, BarChart3, RotateCcw, FileSpreadsheet, FileText, Clock3, CheckCircle2,
    XCircle, Timer, Percent, Search,
} from 'lucide-react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
    LineElement, Tooltip as ChartTooltip, Legend as ChartLegend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { getApplications, errText } from './approvalApi';
import {
    BRAND, TYPE_OPTIONS, CATEGORY_OPTIONS, typeLabel, catLabel, levelLabel,
    statusLabel, fmtAmount, fmtDate, ApplicationDetailModal, StatusBadge,
} from './ApprovalShared';
import ApprovalReports from './ApprovalReports';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ChartTooltip, ChartLegend);

const input = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300';
/* cells draw only the INNER grid lines (bottom + right, last column excluded);
   the rounded wrapper draws the perimeter — otherwise the two doubled up into
   a heavy 2px frame with notched corners. Black grid per the user's ask; the
   .apvi-tbl-frame style below swaps it to grey in dark mode (black vanishes
   on the dark surface). */
/* No whitespace-nowrap: titles and long values WRAP (two lines if needed) so
   every table fits the popup width without a horizontal scrollbar */
const th = 'px-2 py-2 border-b border-r last:border-r-0 border-black bg-gray-50 text-gray-600 font-semibold text-center align-middle leading-tight';
const td = 'px-2 py-2 border-b border-r last:border-r-0 border-black text-center align-middle leading-snug';
// amount cells read right-aligned, like a ledger
const tdR = td.replace('text-center', 'text-right');

// zeros clutter the grid — show a quiet dash instead
const num = (v) => (v ? v : '—');
const money = (v) => (v ? fmtCompact(v) : '—');

const DAY = 86400000;

/* The money an NFA carries: the expense total for Expense records, the
   quotation amount for everything else. */
const appValue = (a) => Number(a.request_type === 'expense' ? a.expense_amount : a.quotation_amount) || 0;

const toMs = (iso) => (iso ? new Date(iso).getTime() : null);

// When the record reached its final state — the rejection stamp, or the
// latest approval action. Legacy auto-approved rows without actions give null.
const decidedAtMs = (a) => {
    const times = [toMs(a.rejected_at), toMs(a.l2_action_at), toMs(a.l3_action_at),
        toMs(a.l4_action_at), toMs(a.l5_action_at)].filter(Boolean);
    return times.length ? Math.max(...times) : null;
};

const tatDays = (a) => {
    const start = toMs(a.created_at); const end = decidedAtMs(a);
    return (start && end && end >= start) ? (end - start) / DAY : null;
};

// Indian business units WITHOUT the ₹ sign — the column title carries "(₹)"
// once instead of every cell; the full ₹ figure stays in the hover tooltip
const fmtCompact = (v) => {
    const n = Number(v) || 0; const abs = Math.abs(n);
    if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
    return n.toLocaleString('en-IN');
};

const fmtDays = (d) => {
    if (d === null || d === undefined) return '—';
    if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
    return `${d.toFixed(1)} d`;
};

const fmtRate = (r) => (r === null || r === undefined ? '—' : `${r.toFixed(1)}%`);

/* ---- theme-aware chart colors (status palette validated for both modes) ---- */

// charts are canvas, so the html.dark CSS remap can't touch them — watch the
// class and re-render with that mode's own validated color steps
const useIsDark = () => {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const el = document.documentElement;
        const ob = new MutationObserver(() => setDark(el.classList.contains('dark')));
        ob.observe(el, { attributes: true, attributeFilter: ['class'] });
        return () => ob.disconnect();
    }, []);
    return dark;
};

const chartColors = (dark) => ({
    approved: dark ? '#059669' : '#10b981',
    pending: dark ? '#d97706' : '#f59e0b',
    // rejected = DARK amber (module convention avoids red); the lightness gap
    // to the pending amber keeps the two apart — pairs validated in both modes
    rejected: dark ? '#9c4a10' : '#92400e',
    mag: dark ? '#818cf8' : '#6366f1',      // single-hue magnitude / "filed" series
    tick: dark ? '#9ca3af' : '#374151',
    grid: dark ? 'rgba(255,255,255,0.07)' : '#f0f0f0',
    surface: dark ? '#171a20' : '#ffffff',   // 2px gap between stacked segments
});

const chartOpts = (C, { money = false, stacked = false, legend = true } = {}) => ({
    responsive: true,
    maintainAspectRatio: false,
    // hovering anywhere on a bar/point shows EVERY series' count for that
    // column in one tooltip box (no numbers printed on the bars themselves)
    interaction: { mode: 'index', intersect: false },
    plugins: {
        // the Dashboard registers chartjs-plugin-datalabels GLOBALLY — without
        // this off-switch every bar segment gets a number stamped on it
        datalabels: { display: false },
        legend: legend
            ? { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 }, color: C.tick } }
            : { display: false },
        tooltip: money
            ? { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtAmount(ctx.parsed.y)}` } }
            : {},
    },
    scales: {
        x: {
            stacked,
            grid: { display: false },
            ticks: { font: { size: 10, weight: '600' }, color: C.tick, maxRotation: 45, autoSkip: true },
        },
        y: {
            stacked,
            beginAtZero: true,
            grid: { color: C.grid },
            ticks: {
                font: { size: 10 }, color: C.tick,
                ...(money ? { callback: (v) => fmtCompact(v) } : { precision: 0 }),
            },
        },
    },
});

// Approved / Pending / Rejected stacked-bar datasets for a set of rows
const statusBarData = (labels, rows, C) => {
    const seg = (label, key, color) => ({
        label, data: rows.map(r => r[key]), backgroundColor: color,
        borderColor: C.surface, borderWidth: 1, maxBarThickness: 34,
    });
    return {
        labels,
        datasets: [
            seg('Approved', 'approved', C.approved),
            seg('Pending', 'pending', C.pending),
            seg('Rejected', 'rejected', C.rejected),
        ],
    };
};

function ChartCard({ title, children }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700 mb-2">{title}</p>
            <div className="h-72">{children}</div>
        </div>
    );
}

// KPI stat tile — same look as the main views' summary cards
function Tile({ icon: Icon, label, value, hint, tileCls, valCls = 'text-gray-800', onClick = null, title = null }) {
    return (
        <button type="button" onClick={onClick || undefined} title={title || undefined}
            className={`rounded-xl border border-gray-200 bg-white shadow-sm p-3 flex items-center gap-3 text-left transition ${onClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow' : 'cursor-default'}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tileCls}`}>
                <Icon size={17} />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-medium text-gray-500 truncate">{label}</p>
                <p className={`text-lg font-bold leading-tight ${valCls}`}>{value}</p>
                {hint && <p className="text-[9.5px] leading-tight text-gray-400 truncate">{hint}</p>}
            </div>
        </button>
    );
}

/* ---- aggregation ---- */

const newStats = () => ({
    total: 0, approved: 0, pending: 0, rejected: 0,
    totalVal: 0, apprVal: 0, pendVal: 0, rejVal: 0, tatSum: 0, tatN: 0,
});
const addStats = (s, a) => {
    const v = appValue(a);
    s.total++; s.totalVal += v;
    if (a.status === 'approved') {
        s.approved++; s.apprVal += v;
        const t = tatDays(a);
        if (t !== null) { s.tatSum += t; s.tatN++; }
    } else if (a.status === 'rejected') { s.rejected++; s.rejVal += v; }
    else { s.pending++; s.pendVal += v; }
};
const doneStats = (s) => ({
    ...s,
    rate: (s.approved + s.rejected) ? (s.approved / (s.approved + s.rejected)) * 100 : null,
    avgTat: s.tatN ? s.tatSum / s.tatN : null,
});

const AGE_BUCKETS = [
    { label: '0 – 3 days', max: 3 },
    { label: '4 – 7 days', max: 7 },
    { label: '8 – 15 days', max: 15 },
    { label: '16 – 30 days', max: 30 },
    { label: 'Over 30 days', max: Infinity },
];

const INSIGHT_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'branch', label: 'Branch-wise' },
    { key: 'employee', label: 'Employee-wise' },
    { key: 'category', label: 'Category-wise' },
    { key: 'ageing', label: 'Pending Ageing' },
    { key: 'approver', label: 'Approver-wise' },
];

export default function ApprovalInsights({ onClose }) {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const canExport = user.role === 'master_admin' || user.can_export === true;
    const isDark = useIsDark();
    const C = chartColors(isDark);

    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview');
    const [f, setF] = useState({ type: '', branch: '', category: '', dateFrom: '', dateTo: '' });
    const [empSearch, setEmpSearch] = useState('');
    const [drill, setDrill] = useState(null);      // { title, filters } → record-list popup
    const [selected, setSelected] = useState(null); // one NFA → detail modal
    const [exporting, setExporting] = useState(false);
    // sort state per aggregate table: { key, dir }
    const [sort, setSort] = useState({ branch: { key: 'total', dir: 'desc' }, employee: { key: 'total', dir: 'desc' }, approver: { key: 'actions', dir: 'desc' } });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getApplications();
            setApps((data.applications || []).filter(a => a.status !== 'draft'));
        } catch (err) {
            toast.error(errText(err, 'Failed to load insights data'));
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

    const branches = useMemo(() => {
        const seen = {};
        apps.forEach(a => { if (a.branch && !seen[a.branch]) seen[a.branch] = a.branch_name || ''; });
        return Object.entries(seen).sort().map(([branch, branch_name]) => ({ branch, branch_name }));
    }, [apps]);

    // ONE filter row scopes every tab — all aggregates below read this slice
    const filtered = useMemo(() => apps.filter(a => {
        if (f.type && a.request_type !== f.type) return false;
        if (f.branch && a.branch !== f.branch) return false;
        if (f.category && a.category !== f.category) return false;
        if (f.dateFrom && (!a.created_at || a.created_at.slice(0, 10) < f.dateFrom)) return false;
        if (f.dateTo && (!a.created_at || a.created_at.slice(0, 10) > f.dateTo)) return false;
        return true;
    }), [apps, f]);

    /* Every aggregate the six tabs need, computed in one pass. */
    const S = useMemo(() => {
        const now = Date.now();
        const overall = newStats();
        const byBranch = new Map(); const byEmp = new Map(); const byCat = new Map();
        const byType = new Map(); const byMonth = new Map();
        const byLevel = { l2: { count: 0, val: 0 }, l3: { count: 0, val: 0 }, l4: { count: 0, val: 0 }, l5: { count: 0, val: 0 } };
        const matrix = {};                 // category → type → count
        const approvers = new Map();
        const buckets = AGE_BUCKETS.map(b => ({ ...b, count: 0, val: 0 }));
        const pendingRows = [];

        const grp = (map, key, label, sub = '') => {
            if (!map.has(key)) map.set(key, { key, label, sub, stats: newStats(), branches: new Set() });
            return map.get(key);
        };

        filtered.forEach(a => {
            addStats(overall, a);

            const bKey = a.branch || '—';
            const gB = grp(byBranch, bKey, `${bKey}${a.branch_name ? ' — ' + a.branch_name : ''}`);
            addStats(gB.stats, a);

            const eKey = a.created_by || '—';
            const gE = grp(byEmp, eKey, a.created_by_name || a.created_by || '—');
            addStats(gE.stats, a); if (a.branch) gE.branches.add(a.branch);

            const gC = grp(byCat, a.category || '—', catLabel(a.category) || '—');
            addStats(gC.stats, a);

            const gT = grp(byType, a.request_type || '—', typeLabel(a.request_type) || '—');
            addStats(gT.stats, a);

            const mKey = a.created_at ? a.created_at.slice(0, 7) : '—';
            const mLabel = a.created_at
                ? new Date(a.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
            addStats(grp(byMonth, mKey, mLabel).stats, a);

            matrix[a.category || '—'] = matrix[a.category || '—'] || {};
            matrix[a.category || '—'][a.request_type || '—'] = (matrix[a.category || '—'][a.request_type || '—'] || 0) + 1;

            if (String(a.status).startsWith('pending')) {
                const lvl = a.status.replace('pending_', '');
                if (byLevel[lvl]) { byLevel[lvl].count++; byLevel[lvl].val += appValue(a); }
                const created = toMs(a.created_at);
                const age = created ? (now - created) / DAY : null;
                if (age !== null) {
                    const bkt = buckets.find(b => age <= b.max);
                    if (bkt) { bkt.count++; bkt.val += appValue(a); }
                    pendingRows.push({ app: a, age });
                }
                // who the record is waiting on right now
                (a.pending_approver_names || []).forEach(n => {
                    if (!approvers.has(n)) approvers.set(n, { name: n, levels: new Set(), approved: 0, rejected: 0, respSum: 0, respN: 0, waiting: 0 });
                    const r = approvers.get(n); r.waiting++; r.levels.add(lvl);
                });
            }

            // approver actions in time order → per-person response time at their stage
            const acts = [];
            ['l2', 'l3', 'l4', 'l5'].forEach(l => {
                const at = toMs(a[`${l}_action_at`]);
                const by = a[`${l}_action_by_name`] || a[`${l}_action_by`];
                if (at && by) acts.push({ by, at, lvl: l, kind: 'approved' });
            });
            const rejAt = toMs(a.rejected_at);
            const rejBy = a.rejected_by_name || a.rejected_by;
            if (a.status === 'rejected' && rejAt && rejBy)
                acts.push({ by: rejBy, at: rejAt, lvl: a.rejected_at_level || '', kind: 'rejected' });
            acts.sort((x, y) => x.at - y.at);
            let prev = toMs(a.created_at);
            acts.forEach(ac => {
                if (!approvers.has(ac.by)) approvers.set(ac.by, { name: ac.by, levels: new Set(), approved: 0, rejected: 0, respSum: 0, respN: 0, waiting: 0 });
                const r = approvers.get(ac.by);
                if (ac.lvl) r.levels.add(ac.lvl);
                r[ac.kind === 'approved' ? 'approved' : 'rejected']++;
                if (prev !== null && ac.at >= prev) { r.respSum += (ac.at - prev) / DAY; r.respN++; }
                prev = ac.at;
            });
        });

        const finish = (map) => [...map.values()].map(g => ({
            key: g.key, label: g.label, sub: g.sub, branches: [...g.branches], ...doneStats(g.stats),
        }));
        // months: newest 12 with data, displayed oldest → newest
        const months = finish(byMonth).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 12).reverse();

        pendingRows.sort((a, b) => b.age - a.age);

        const approverRows = [...approvers.values()].map(r => ({
            name: r.name,
            levels: ['l2', 'l3', 'l4', 'l5'].filter(l => r.levels.has(l)).map(l => levelLabel(l)).join(', '),
            approved: r.approved, rejected: r.rejected, actions: r.approved + r.rejected,
            avgResp: r.respN ? r.respSum / r.respN : null, waiting: r.waiting,
        }));

        return {
            overall: doneStats(overall),
            branchRows: finish(byBranch),
            empRows: finish(byEmp),
            catRows: finish(byCat),
            typeRows: TYPE_OPTIONS.map(o => finish(byType).find(r => r.key === o.value)).filter(Boolean),
            months, byLevel, matrix, buckets, pendingRows, approverRows,
        };
    }, [filtered]);

    /* ---- sorting for the big aggregate tables ---- */
    const onSort = (tbl) => (key) => setSort(prev => ({
        ...prev,
        [tbl]: prev[tbl].key === key
            ? { key, dir: prev[tbl].dir === 'desc' ? 'asc' : 'desc' }
            : { key, dir: 'desc' },
    }));
    const sortRows = (rows, s) => [...rows].sort((a, b) => {
        const va = a[s.key]; const vb = b[s.key];
        if (typeof va === 'string' || typeof vb === 'string')
            return s.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        const na = va ?? -Infinity; const nb = vb ?? -Infinity;
        return s.dir === 'asc' ? na - nb : nb - na;
    });
    const SortTh = ({ tbl, k, children }) => (
        <th className={`${th} cursor-pointer select-none hover:bg-gray-100`} onClick={() => onSort(tbl)(k)}
            title="Click to sort">
            {children}{sort[tbl].key === k ? (sort[tbl].dir === 'desc' ? ' ▼' : ' ▲') : ''}
        </th>
    );

    // drill-down keeps the box's own scope (branch + dates travel along);
    // tabKey lands the record popup on that type tab
    const openDrill = (title, filters = {}, tabKey = null) => setDrill({
        title, tab: tabKey,
        filters: { branch: f.branch, dateFrom: f.dateFrom, dateTo: f.dateTo, ...filters },
    });

    const STATUS_WORD = { '': 'All', approved: 'Approved', pending: 'Pending', rejected: 'Rejected' };
    // first/last day of a 'YYYY-MM' month key, for the monthly count links
    const monthRange = (key) => {
        const [y, mo] = key.split('-').map(Number);
        const last = new Date(y, mo, 0).getDate();
        return { dateFrom: `${key}-01`, dateTo: `${key}-${String(last).padStart(2, '0')}` };
    };

    /* ---- Excel export of the ACTIVE tab ---- */
    const exportExcel = async () => {
        if (!filtered.length) return toast.error('No records to export');
        setExporting(true);
        try {
            const XLSX = await import('xlsx-js-style');
            const o = S.overall;
            const statusHeads = ['Total', 'Approved', 'Pending', 'Rejected', 'Approval %', 'Avg Approval Time (days)', 'Initiated Amount (₹)', 'Approved Amount (₹)', 'Pending Amount (₹)', 'Rejected Amount (₹)'];
            const statusCells = (r) => [r.total, r.approved, r.pending, r.rejected,
                r.rate === null ? '' : +r.rate.toFixed(1), r.avgTat === null ? '' : +r.avgTat.toFixed(1),
                r.totalVal, r.apprVal, r.pendVal, r.rejVal];
            const sections = [];
            if (tab === 'overview') {
                sections.push({
                    title: 'Overall Summary',
                    headers: ['Metric', 'Count', 'Amount (₹)'],
                    rows: [
                        ['Total NFAs', o.total, o.totalVal],
                        ['Approved', o.approved, o.apprVal],
                        ['Pending', o.pending, o.pendVal],
                        ['Rejected', o.rejected, o.rejVal],
                        ['Approval Rate %', o.rate === null ? '' : +o.rate.toFixed(1), ''],
                        ['Avg Approval Time (days)', o.avgTat === null ? '' : +o.avgTat.toFixed(1), ''],
                    ],
                });
                sections.push({
                    title: 'Amount Awaiting Approval — by Level',
                    headers: ['Level', 'Pending NFAs', 'Amount Awaiting (₹)'],
                    rows: ['l2', 'l3', 'l4', 'l5'].map(l => [levelLabel(l), S.byLevel[l].count, S.byLevel[l].val]),
                });
                sections.push({
                    title: 'Type-wise Summary',
                    headers: ['Type', ...statusHeads],
                    rows: S.typeRows.map(r => [r.label, ...statusCells(r)]),
                });
                sections.push({
                    title: 'Monthly Trend',
                    headers: ['Month', 'Filed', 'Approved', 'Rejected', 'Initiated Amount (₹)'],
                    rows: S.months.map(m => [m.label, m.total, m.approved, m.rejected, m.totalVal]),
                });
            } else if (tab === 'branch') {
                sections.push({
                    title: 'Branch-wise NFA Report',
                    headers: ['Branch', ...statusHeads],
                    rows: sortRows(S.branchRows, sort.branch).map(r => [r.label, ...statusCells(r)]),
                });
            } else if (tab === 'employee') {
                sections.push({
                    title: 'Employee-wise NFA Report',
                    headers: ['Employee', 'Branches', ...statusHeads],
                    rows: sortRows(S.empRows, sort.employee).map(r => [r.label, r.branches.join(', '), ...statusCells(r)]),
                });
            } else if (tab === 'category') {
                sections.push({
                    title: 'Category-wise NFA Report',
                    headers: ['Category', ...statusHeads],
                    rows: S.catRows.map(r => [r.label, ...statusCells(r)]),
                });
                sections.push({
                    title: 'Category × Type — record counts',
                    headers: ['Category', ...TYPE_OPTIONS.map(t => t.label)],
                    rows: CATEGORY_OPTIONS.map(c => [c.label,
                        ...TYPE_OPTIONS.map(t => S.matrix[c.value]?.[t.value] || 0)]),
                });
            } else if (tab === 'ageing') {
                sections.push({
                    title: 'Pending NFAs — Ageing Buckets',
                    headers: ['Waiting For', 'Pending NFAs', 'Amount Awaiting (₹)'],
                    rows: S.buckets.map(b => [b.label, b.count, b.val]),
                });
                sections.push({
                    title: 'Pending NFAs — Oldest First',
                    headers: ['Days Pending', 'Approval No.', 'Stuck At', 'Waiting On', 'Branch', 'Type', 'Category', 'Amount (₹)', 'Created By', 'Created'],
                    rows: S.pendingRows.map(({ app: a, age }) => [
                        +age.toFixed(1), a.app_no || '', statusLabel(a.status),
                        (a.pending_approver_names || []).join(', '),
                        `${a.branch}${a.branch_name ? ' — ' + a.branch_name : ''}`,
                        typeLabel(a.request_type), catLabel(a.category), appValue(a),
                        a.created_by_name || a.created_by, fmtDate(a.created_at),
                    ]),
                });
            } else if (tab === 'approver') {
                sections.push({
                    title: 'Approver-wise Actions',
                    headers: ['Approver', 'Levels', 'Approved', 'Rejected', 'Total Actions', 'Avg Response (days)', 'Waiting On Them Now'],
                    rows: sortRows(S.approverRows, sort.approver).map(r => [
                        r.name, r.levels, r.approved, r.rejected, r.actions,
                        r.avgResp === null ? '' : +r.avgResp.toFixed(1), r.waiting,
                    ]),
                });
            }

            const aoa = []; const titleRows = []; const headerRows = [];
            sections.forEach(s => {
                if (aoa.length) aoa.push([]);
                titleRows.push(aoa.length); aoa.push([s.title]);
                headerRows.push(aoa.length); aoa.push(s.headers);
                s.rows.forEach(r => aoa.push(r));
            });
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            titleRows.forEach(r => {
                const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
                if (cell) cell.s = { font: { bold: true, sz: 12 } };
            });
            headerRows.forEach(r => {
                aoa[r].forEach((_, c) => {
                    const cell = ws[XLSX.utils.encode_cell({ r, c })];
                    if (cell) cell.s = {
                        font: { bold: true, color: { rgb: 'FFFFFF' } },
                        fill: { fgColor: { rgb: '2F3192' } },
                        alignment: { horizontal: 'center', vertical: 'center' },
                    };
                });
            });
            const nCols = Math.max(...aoa.map(r => r.length));
            ws['!cols'] = Array.from({ length: nCols }, (_, c) => ({
                wch: Math.min(40, Math.max(10, ...aoa.map(r => String(r[c] ?? '').length + 2))),
            }));
            const wb = XLSX.utils.book_new();
            const tabLabel = INSIGHT_TABS.find(t => t.key === tab)?.label || 'Insights';
            XLSX.utils.book_append_sheet(wb, ws, tabLabel.slice(0, 31));
            XLSX.writeFile(wb, `NFA_Insights_${tabLabel.replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast.success('Insights exported');
        } catch (err) {
            console.error(err);
            toast.error('Failed to export');
        } finally { setExporting(false); }
    };

    /* ---- shared table pieces ---- */

    // the status/amount columns every aggregate table repeats — clean numbers only
    const statHeads = (tbl = null) => {
        const T = ({ k, children }) => tbl
            ? <SortTh tbl={tbl} k={k}>{children}</SortTh>
            : <th className={th}>{children}</th>;
        return (
            <>
                <T k="total">Total</T>
                <T k="approved">Approved</T>
                <T k="pending">Pending</T>
                <T k="rejected">Rejected</T>
                <T k="rate">Approval %</T>
                <T k="avgTat">Avg Approval Time</T>
                <T k="totalVal">Initiated Amt (₹)</T>
                <T k="apprVal">Approved Amt (₹)</T>
                <T k="pendVal">Pending Amt (₹)</T>
            </>
        );
    };
    /* drillFor(status) — when given, the count becomes a hyperlink that opens
       exactly that slice of records in the popup */
    const statCells = (r, drillFor = null) => {
        const cnt = (val, activeCls, status) => (
            <td className={`${td} ${val ? activeCls : 'text-gray-300'}`}>
                {drillFor && val ? (
                    <span className="apvi-link" title="View these records"
                        onClick={(e) => { e.stopPropagation(); drillFor(status); }}>{val}</span>
                ) : num(val)}
            </td>
        );
        return (
            <>
                {cnt(r.total, 'font-bold text-gray-800', '')}
                {cnt(r.approved, 'text-emerald-700 font-semibold', 'approved')}
                {cnt(r.pending, 'text-amber-700 font-semibold', 'pending')}
                {cnt(r.rejected, 'text-amber-900 font-semibold', 'rejected')}
                <td className={td}>{fmtRate(r.rate)}</td>
                <td className={td}>{fmtDays(r.avgTat)}</td>
                <td className={`${tdR} font-semibold`} title={r.totalVal ? fmtAmount(r.totalVal) : undefined}>{money(r.totalVal)}</td>
                <td className={tdR} title={r.apprVal ? fmtAmount(r.apprVal) : undefined}>{money(r.apprVal)}</td>
                <td className={tdR} title={r.pendVal ? fmtAmount(r.pendVal) : undefined}>{money(r.pendVal)}</td>
            </>
        );
    };

    const tableShell = (children) => (
        <div className="apvi-tbl-frame rounded-xl border border-black bg-white overflow-hidden">
            <div className="overflow-x-auto">
                {/* the last row keeps no bottom border — the wrapper's rounded
                    border closes the box cleanly */}
                <table className="min-w-full text-xs border-collapse [&_tbody>tr:last-child>td]:border-b-0">{children}</table>
            </div>
        </div>
    );

    const sectionHead = (text, extra = null) => (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700">{text}</p>
            {extra}
        </div>
    );

    const emptyState = (
        <div className="min-h-[240px] flex flex-col items-center justify-center gap-2">
            <FileText size={30} className="text-gray-300" />
            <p className="text-sm text-gray-400">No records match the selected filters</p>
        </div>
    );

    /* ---- one graph per tab (rendered at the bottom of each tab) ---- */

    const overviewChart = (
        <ChartCard title="Monthly Trend — NFAs Filed / Approved / Rejected">
            <Line
                data={{
                    labels: S.months.map(m => m.label),
                    datasets: [
                        { label: 'Filed', data: S.months.map(m => m.total), borderColor: C.mag, backgroundColor: C.mag, borderWidth: 2, pointRadius: 3, tension: 0.3 },
                        { label: 'Approved', data: S.months.map(m => m.approved), borderColor: C.approved, backgroundColor: C.approved, borderWidth: 2, pointRadius: 3, tension: 0.3 },
                        { label: 'Rejected', data: S.months.map(m => m.rejected), borderColor: C.rejected, backgroundColor: C.rejected, borderWidth: 2, pointRadius: 3, tension: 0.3 },
                    ],
                }}
                options={chartOpts(C)}
            />
        </ChartCard>
    );

    const branchChartRows = [...S.branchRows].sort((a, b) => b.total - a.total);
    const branchChart = (
        <ChartCard title="Branch-wise NFAs — status split">
            <Bar data={statusBarData(branchChartRows.map(r => r.key), branchChartRows, C)}
                options={chartOpts(C, { stacked: true })} />
        </ChartCard>
    );

    const empChartRows = [...S.empRows].sort((a, b) => b.total - a.total).slice(0, 15);
    const employeeChart = (
        <ChartCard title={`Employee-wise NFAs — status split${S.empRows.length > 15 ? ' (top 15 by volume)' : ''}`}>
            <Bar data={statusBarData(empChartRows.map(r => r.label), empChartRows, C)}
                options={chartOpts(C, { stacked: true })} />
        </ChartCard>
    );

    const categoryChart = (
        <ChartCard title="Category-wise NFAs — status split">
            <Bar data={statusBarData(S.catRows.map(r => r.label), S.catRows, C)}
                options={chartOpts(C, { stacked: true })} />
        </ChartCard>
    );

    const ageingChart = (
        <ChartCard title="Amount Awaiting Approval (₹) — by waiting time">
            <Bar
                data={{
                    labels: S.buckets.map(b => b.label),
                    datasets: [{
                        label: 'Amount awaiting', data: S.buckets.map(b => b.val),
                        backgroundColor: C.mag, borderRadius: 4, maxBarThickness: 48,
                    }],
                }}
                options={{
                    ...chartOpts(C, { money: true, legend: false }),
                    plugins: {
                        datalabels: { display: false },
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${fmtAmount(ctx.parsed.y)} across ${S.buckets[ctx.dataIndex].count} NFA${S.buckets[ctx.dataIndex].count === 1 ? '' : 's'}`,
                            },
                        },
                    },
                }}
            />
        </ChartCard>
    );

    const apprChartRows = [...S.approverRows].sort((a, b) => b.actions - a.actions).slice(0, 15);
    const approverChart = (
        <ChartCard title={`Approver-wise Actions${S.approverRows.length > 15 ? ' (top 15 by volume)' : ''}`}>
            <Bar
                data={{
                    labels: apprChartRows.map(r => r.name),
                    datasets: [
                        { label: 'Approved', data: apprChartRows.map(r => r.approved), backgroundColor: C.approved, borderColor: C.surface, borderWidth: 1, maxBarThickness: 34 },
                        { label: 'Rejected', data: apprChartRows.map(r => r.rejected), backgroundColor: C.rejected, borderColor: C.surface, borderWidth: 1, maxBarThickness: 34 },
                    ],
                }}
                options={chartOpts(C, { stacked: true })}
            />
        </ChartCard>
    );

    /* ---- tab bodies ---- */

    const o = S.overall;
    const overviewTab = (
        <div className="space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                <Tile icon={FileText} label="Total NFAs" value={o.total}
                    hint={`₹${fmtCompact(o.totalVal)} initiated`} title={fmtAmount(o.totalVal)}
                    tileCls="bg-indigo-50 text-indigo-600"
                    onClick={() => openDrill('All Records')} />
                <Tile icon={CheckCircle2} label="Approved" value={o.approved}
                    hint={`₹${fmtCompact(o.apprVal)} approved`} title={fmtAmount(o.apprVal)}
                    tileCls="bg-emerald-50 text-emerald-600" valCls="text-emerald-600"
                    onClick={() => openDrill('Approved Records', { status: 'approved' })} />
                <Tile icon={Clock3} label="Pending" value={o.pending}
                    hint={`₹${fmtCompact(o.pendVal)} still awaiting`} title={fmtAmount(o.pendVal)}
                    tileCls="bg-amber-50 text-amber-600" valCls="text-amber-600"
                    onClick={() => openDrill('Pending Records', { status: 'pending' })} />
                <Tile icon={XCircle} label="Rejected" value={o.rejected}
                    hint={`₹${fmtCompact(o.rejVal)} rejected`} title={fmtAmount(o.rejVal)}
                    tileCls="bg-amber-50 text-amber-800" valCls="text-amber-800"
                    onClick={() => openDrill('Rejected Records', { status: 'rejected' })} />
                <Tile icon={Percent} label="Approval Rate" value={fmtRate(o.rate)}
                    hint="of decided NFAs" tileCls="bg-indigo-50 text-indigo-600" />
                <Tile icon={Timer} label="Avg Approval Time" value={fmtDays(o.avgTat)}
                    hint="filed → final approval" tileCls="bg-indigo-50 text-indigo-600" />
            </div>

            {/* Amount stuck per level + monthly trend */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-2">
                    {sectionHead('Amount Awaiting Approval — by Level')}
                    {tableShell(
                        <>
                            <thead><tr className="text-[11px] uppercase tracking-wide">
                                <th className={th}>Stuck At</th>
                                <th className={th}>Pending NFAs</th>
                                <th className={th}>Amount Awaiting (₹)</th>
                            </tr></thead>
                            <tbody className="bg-white">
                                {['l2', 'l3', 'l4', 'l5'].map(l => (
                                    <tr key={l} className="hover:bg-indigo-50/40 cursor-pointer"
                                        onClick={() => openDrill(`${statusLabel(`pending_${l}`)} Records`, { status: `pending_${l}` })}
                                        title="View these records">
                                        <td className={`${td} font-semibold text-gray-800`}>
                                            <span className="apvi-link">{levelLabel(l)}</span>
                                        </td>
                                        <td className={`${td} ${S.byLevel[l].count ? 'text-amber-700 font-semibold' : 'text-gray-300'}`}>
                                            {S.byLevel[l].count ? <span className="apvi-link">{S.byLevel[l].count}</span> : '—'}
                                        </td>
                                        <td className={tdR} title={S.byLevel[l].val ? fmtAmount(S.byLevel[l].val) : undefined}>{money(S.byLevel[l].val)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </>
                    )}
                </div>
                <div className="space-y-2">
                    {sectionHead('Monthly Trend — last 12 months with records')}
                    {tableShell(
                        <>
                            <thead><tr className="text-[11px] uppercase tracking-wide">
                                <th className={th}>Month</th>
                                <th className={th}>Filed</th>
                                <th className={th}>Approved</th>
                                <th className={th}>Rejected</th>
                                <th className={th}>Initiated Amt (₹)</th>
                            </tr></thead>
                            <tbody className="bg-white">
                                {S.months.map(m => {
                                    // month count → those records, scoped to that month's dates
                                    const mLink = (val, status) => {
                                        if (!val || m.key === '—') return num(val);
                                        return (
                                            <span className="apvi-link" title="View these records"
                                                onClick={() => openDrill(`${m.label} — ${STATUS_WORD[status]} Records`, { ...monthRange(m.key), status })}>
                                                {val}
                                            </span>
                                        );
                                    };
                                    return (
                                        <tr key={m.key}>
                                            <td className={`${td} font-semibold text-gray-800`}>{m.label}</td>
                                            <td className={`${td} font-bold`}>{mLink(m.total, '')}</td>
                                            <td className={`${td} ${m.approved ? 'text-emerald-700' : 'text-gray-300'}`}>{mLink(m.approved, 'approved')}</td>
                                            <td className={`${td} ${m.rejected ? 'text-amber-900' : 'text-gray-300'}`}>{mLink(m.rejected, 'rejected')}</td>
                                            <td className={tdR} title={m.totalVal ? fmtAmount(m.totalVal) : undefined}>{money(m.totalVal)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </>
                    )}
                </div>
            </div>

            {/* Type-wise summary */}
            <div className="space-y-2">
                {sectionHead('Type-wise Summary')}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <th className={th}>Type</th>{statHeads()}
                        </tr></thead>
                        <tbody className="bg-white">
                            {S.typeRows.map(r => (
                                <tr key={r.key}>
                                    <td className={`${td} font-semibold text-gray-800`}>
                                        <span className="apvi-link" title="View these records"
                                            onClick={() => openDrill(`${r.label} — All Records`, {}, r.key)}>{r.label}</span>
                                    </td>
                                    {statCells(r, (st) => openDrill(`${r.label} — ${STATUS_WORD[st]} Records`, { status: st }, r.key))}
                                </tr>
                            ))}
                        </tbody>
                    </>
                )}
            </div>

            {overviewChart}
        </div>
    );

    const branchTab = (
        <div className="space-y-4">
            <div className="space-y-2">
                {sectionHead(`Branch-wise NFA Report — ${S.branchRows.length} branch${S.branchRows.length === 1 ? '' : 'es'} (click a row for its records)`)}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <SortTh tbl="branch" k="label">Branch</SortTh>{statHeads('branch')}
                        </tr></thead>
                        <tbody className="bg-white">
                            {sortRows(S.branchRows, sort.branch).map(r => (
                                <tr key={r.key} className="hover:bg-indigo-50/40 cursor-pointer"
                                    onClick={() => openDrill(`${r.label} — Records`, { branch: r.key })}
                                    title="View this branch's records">
                                    <td className={`${td} font-semibold text-gray-800 text-left`}>
                                        <span className="apvi-link">{r.label}</span>
                                    </td>
                                    {statCells(r, (st) => openDrill(`${r.label} — ${STATUS_WORD[st]} Records`, { branch: r.key, status: st }))}
                                </tr>
                            ))}
                        </tbody>
                    </>
                )}
            </div>
            {branchChart}
        </div>
    );

    const empRowsShown = S.empRows.filter(r =>
        !empSearch || r.label.toLowerCase().includes(empSearch.toLowerCase()));
    const employeeTab = (
        <div className="space-y-4">
            <div className="space-y-2">
                {sectionHead(`Employee-wise NFA Report — ${empRowsShown.length} employee${empRowsShown.length === 1 ? '' : 's'} (click a row for their records)`,
                    <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input className={`${input} pl-7 w-44`} placeholder="Filter employees…"
                            value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
                    </div>)}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <SortTh tbl="employee" k="label">Employee</SortTh>
                            <th className={th}>Branch</th>
                            {statHeads('employee')}
                        </tr></thead>
                        <tbody className="bg-white">
                            {sortRows(empRowsShown, sort.employee).map(r => (
                                <tr key={r.key} className="hover:bg-indigo-50/40 cursor-pointer"
                                    onClick={() => openDrill(`${r.label} — NFA Records`, { search: r.label })}
                                    title="View this employee's records">
                                    <td className={`${td} font-semibold text-gray-800 text-left`}>
                                        <span className="apvi-link">{r.label}</span>
                                    </td>
                                    <td className={td}>{r.branches.slice(0, 2).join(', ')}{r.branches.length > 2 ? ` +${r.branches.length - 2}` : ''}</td>
                                    {statCells(r, (st) => openDrill(`${r.label} — ${STATUS_WORD[st]} Records`, { search: r.label, status: st }))}
                                </tr>
                            ))}
                        </tbody>
                    </>
                )}
            </div>
            {employeeChart}
        </div>
    );

    const categoryTab = (
        <div className="space-y-4">
            <div className="space-y-2">
                {sectionHead('Category-wise NFA Report')}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <th className={th}>Category</th>{statHeads()}
                        </tr></thead>
                        <tbody className="bg-white">
                            {S.catRows.map(r => (
                                <tr key={r.key}>
                                    <td className={`${td} font-semibold text-gray-800`}>{r.label}</td>
                                    {statCells(r)}
                                </tr>
                            ))}
                        </tbody>
                    </>
                )}
            </div>
            <div className="space-y-2">
                {sectionHead('Category × Type — record counts')}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <th className={th}>Category</th>
                            {TYPE_OPTIONS.map(t => <th key={t.value} className={th}>{t.label}</th>)}
                            <th className={th}>Total</th>
                        </tr></thead>
                        <tbody className="bg-white">
                            {CATEGORY_OPTIONS.map(c => {
                                const row = S.matrix[c.value] || {};
                                const total = TYPE_OPTIONS.reduce((n, t) => n + (row[t.value] || 0), 0);
                                return (
                                    <tr key={c.value}>
                                        <td className={`${td} font-semibold text-gray-800`}>{c.label}</td>
                                        {TYPE_OPTIONS.map(t => (
                                            <td key={t.value} className={`${td} ${row[t.value] ? '' : 'text-gray-300'}`}>{num(row[t.value] || 0)}</td>
                                        ))}
                                        <td className={`${td} font-bold`}>{num(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </>
                )}
            </div>
            {categoryChart}
        </div>
    );

    const ageingTab = (
        <div className="space-y-4">
            <div className="space-y-2">
                {sectionHead(`Pending NFAs by Waiting Time — ${o.pending} open, ₹${fmtCompact(o.pendVal)} awaiting approval`)}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <th className={th}>Waiting For</th>
                            <th className={th}>Pending NFAs</th>
                            <th className={th}>Amount Awaiting</th>
                        </tr></thead>
                        <tbody className="bg-white">
                            {S.buckets.map(b => (
                                <tr key={b.label}>
                                    <td className={`${td} font-semibold text-gray-800`}>{b.label}</td>
                                    <td className={`${td} ${b.count ? `font-bold ${b.max === Infinity ? 'text-amber-900' : ''}` : 'text-gray-300'}`}>{num(b.count)}</td>
                                    <td className={tdR} title={b.val ? fmtAmount(b.val) : undefined}>{money(b.val)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </>
                )}
            </div>
            <div className="space-y-2">
                {sectionHead(`Oldest Pending NFAs${S.pendingRows.length > 25 ? ' — top 25 shown, export for all' : ''} (click a row to open it)`)}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <th className={th}>Days</th>
                            <th className={th}>Approval No.</th>
                            <th className={th}>Stuck At</th>
                            <th className={th}>Waiting On</th>
                            <th className={th}>Branch</th>
                            <th className={th}>Type</th>
                            <th className={th}>Amount (₹)</th>
                            <th className={th}>Created By</th>
                            <th className={th}>Created</th>
                        </tr></thead>
                        <tbody className="bg-white">
                            {S.pendingRows.slice(0, 25).map(({ app: a, age }) => (
                                <tr key={a.id} className="hover:bg-indigo-50/40 cursor-pointer" onClick={() => setSelected(a)}>
                                    <td className={`${td} font-bold ${age > 15 ? 'text-amber-900' : age > 7 ? 'text-amber-700' : 'text-gray-800'}`}>{age.toFixed(1)}</td>
                                    <td className={`${td} font-semibold text-indigo-700`}>
                                        <span className="apvi-link">{a.app_no || '—'}</span>
                                    </td>
                                    <td className={td}><StatusBadge status={a.status} /></td>
                                    <td className={`${td} max-w-[180px] truncate`} title={(a.pending_approver_names || []).join(', ')}>
                                        {(a.pending_approver_names || []).join(', ') || '—'}
                                    </td>
                                    <td className={td}>{a.branch}{a.branch_name ? ` — ${a.branch_name}` : ''}</td>
                                    <td className={td}>{typeLabel(a.request_type)}</td>
                                    <td className={tdR} title={appValue(a) ? fmtAmount(appValue(a)) : undefined}>{money(appValue(a))}</td>
                                    <td className={td}>{a.created_by_name || a.created_by}</td>
                                    <td className={`${td} text-gray-600`}>{fmtDate(a.created_at)}</td>
                                </tr>
                            ))}
                            {!S.pendingRows.length && (
                                <tr><td colSpan={9} className={`${td} py-8 text-gray-400`}>Nothing is pending — all clear</td></tr>
                            )}
                        </tbody>
                    </>
                )}
            </div>
            {ageingChart}
        </div>
    );

    const approverTab = (
        <div className="space-y-4">
            <div className="space-y-2">
                {sectionHead(`Approver-wise Actions — ${S.approverRows.length} approver${S.approverRows.length === 1 ? '' : 's'}`)}
                {tableShell(
                    <>
                        <thead><tr className="text-[11px] uppercase tracking-wide">
                            <SortTh tbl="approver" k="name">Approver</SortTh>
                            <th className={th}>Levels</th>
                            <SortTh tbl="approver" k="approved">Approved</SortTh>
                            <SortTh tbl="approver" k="rejected">Rejected</SortTh>
                            <SortTh tbl="approver" k="actions">Total Actions</SortTh>
                            <SortTh tbl="approver" k="avgResp">Avg Response Time</SortTh>
                            <SortTh tbl="approver" k="waiting">Waiting On Them Now</SortTh>
                        </tr></thead>
                        <tbody className="bg-white">
                            {sortRows(S.approverRows, sort.approver).map(r => (
                                <tr key={r.name}>
                                    <td className={`${td} font-semibold text-gray-800 text-left`}>{r.name}</td>
                                    <td className={td}>{r.levels || '—'}</td>
                                    <td className={`${td} ${r.approved ? 'text-emerald-700 font-semibold' : 'text-gray-300'}`}>{num(r.approved)}</td>
                                    <td className={`${td} ${r.rejected ? 'text-amber-900 font-semibold' : 'text-gray-300'}`}>{num(r.rejected)}</td>
                                    <td className={`${td} font-bold`}>{num(r.actions)}</td>
                                    <td className={td}>{fmtDays(r.avgResp)}</td>
                                    <td className={`${td} ${r.waiting ? 'text-amber-700 font-bold' : 'text-gray-300'}`}>{num(r.waiting)}</td>
                                </tr>
                            ))}
                            {!S.approverRows.length && (
                                <tr><td colSpan={7} className={`${td} py-8 text-gray-400`}>No approver actions in this slice</td></tr>
                            )}
                        </tbody>
                    </>
                )}
                <p className="text-[10px] text-gray-400">
                    Avg response = time from when a record reached the approver (previous action, or filing) until they acted.
                </p>
            </div>
            {approverChart}
        </div>
    );

    const bodies = {
        overview: overviewTab, branch: branchTab, employee: employeeTab,
        category: categoryTab, ageing: ageingTab, approver: approverTab,
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 max-md:p-2" onClick={onClose}>
            {/* black table grid is invisible on the dark surface — swap to grey
                there; .apvi-link = clickable names/counts that light up in the
                ERP theme blue on hover (a lighter indigo in dark mode) */}
            <style>{`
                html.dark .apvi-tbl-frame, html.dark .apvi-tbl-frame th, html.dark .apvi-tbl-frame td { border-color: #4b5563 !important; }
                .apvi-link { cursor: pointer; }
                .apvi-link:hover { color: #2f3192; text-decoration: underline; }
                html.dark .apvi-link:hover { color: #a5b4fc; }
            `}</style>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] h-[94vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}>
                {/* Blue bar: title + insight tabs + export + refresh + close.
                    Active tab uses dark grey — brand blue would vanish into
                    this bar (same trick as TypeTabs onDark). */}
                <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2.5 rounded-t-2xl text-white"
                    style={{ background: BRAND }}>
                    <span className="font-semibold text-sm flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                        <BarChart3 size={16} /> NFA Insights
                    </span>
                    {/* tabs + actions travel as ONE right-aligned cluster, and
                        wrapped lines inside it stay right-aligned too */}
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <div className="flex flex-wrap items-center justify-end gap-1.5" role="tablist" aria-label="Insight view">
                        {INSIGHT_TABS.map(t => {
                            const active = tab === t.key;
                            return (
                                <button key={t.key} type="button" role="tab" aria-selected={active}
                                    onClick={() => setTab(t.key)}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition focus:outline-none focus:ring-2 focus:ring-indigo-300 ${active ? 'shadow-sm' : 'bg-white hover:bg-indigo-50'}`}
                                    style={active
                                        ? { background: '#4b5563', borderColor: '#6b7280', color: '#ffffff' }
                                        : { color: BRAND, borderColor: '#c7d2fe' }}>
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {canExport && (
                            <button onClick={exportExcel} disabled={exporting || loading}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">
                                <FileSpreadsheet size={14} /> {exporting ? 'Exporting…' : 'Export This Tab'}
                            </button>
                        )}
                        <button onClick={load} disabled={loading} title="Refresh"
                            className="p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition disabled:opacity-50">
                            <RotateCcw size={14} />
                        </button>
                        <button onClick={onClose} className="p-1.5 rounded-lg bg-white hover:bg-white/90 transition" style={{ color: '#2f3192' }}>
                            <X size={15} />
                        </button>
                    </div>
                    </div>
                </div>

                <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
                    {/* ONE filter row — scopes every tab below it */}
                    <div className="flex flex-wrap items-center gap-2">
                        <select className={input} value={f.type} onChange={set('type')}>
                            <option value="">All Types</option>
                            {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select className={`${input} max-w-[170px]`} value={f.branch} onChange={set('branch')}>
                            <option value="">All Branches</option>
                            {branches.map(b => (
                                <option key={b.branch} value={b.branch}>{b.branch}{b.branch_name ? ` — ${b.branch_name}` : ''}</option>
                            ))}
                        </select>
                        <select className={input} value={f.category} onChange={set('category')}>
                            <option value="">All Categories</option>
                            {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-gray-800">From</span>
                            <input className={input} type="date" value={f.dateFrom} onChange={set('dateFrom')} />
                            <span className="text-[10px] font-bold text-gray-800">To</span>
                            <input className={input} type="date" value={f.dateTo} onChange={set('dateTo')} />
                        </div>
                        {(f.type || f.branch || f.category || f.dateFrom || f.dateTo) && (
                            <button onClick={() => setF({ type: '', branch: '', category: '', dateFrom: '', dateTo: '' })}
                                className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline">
                                Clear filters
                            </button>
                        )}
                        <span className="ml-auto text-[11px] font-semibold text-gray-800">
                            {filtered.length} record{filtered.length === 1 ? '' : 's'} in scope
                        </span>
                    </div>

                    {/* body */}
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                        {loading
                            ? <div className="py-16 text-center text-sm text-gray-600">Loading insights…</div>
                            : filtered.length ? bodies[tab] : emptyState}
                    </div>
                </div>

                {/* drill-down: the familiar record-list popup, scoped to the clicked slice */}
                {drill && (
                    <ApprovalReports title={drill.title} records={apps}
                        initialStatus={drill.filters.status || ''} initialFilters={drill.filters}
                        initialTab={drill.tab || 'discounting'}
                        onClose={() => setDrill(null)} />
                )}
                {/* a single pending NFA opened from the ageing list — read only */}
                {selected && (
                    <ApplicationDetailModal app={selected} canAct={false} canDelete={false}
                        onClose={() => setSelected(null)} onChanged={load} />
                )}
            </div>
        </div>
    );
}
