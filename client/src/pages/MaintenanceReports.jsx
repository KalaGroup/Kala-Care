import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { warmKey, readWarmCache, writeWarmCache } from '../utils/warmCache';
import { canExportExcel } from '../utils/exportPermission';
import {
    DocumentChartBarIcon, ChartBarIcon, ClockIcon, UsersIcon,
    ArrowUpTrayIcon, ArrowPathIcon, Squares2X2Icon, ExclamationTriangleIcon,
    CircleStackIcon, WrenchScrewdriverIcon, ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import {
    getAppCodesSlim, getServices, getActivity, getAssetCommissioning, partService, findApp, getRole,
    themeColor, themeDark, themeSoft, fmtDateTime,
} from '../components/maintenanceApi';
import { SortTh, useSort, useSortedRows } from '../components/TableSort';
import DraggableScrollButtons from '../components/DraggableScrollButtons';

// Floating scroll-to-top / bottom arrows (same widget as the other pages).
// `targetRef` scrolls that container; without one it scrolls the window itself.
const ScrollArrows = ({ storageKey, targetRef }) => {
    const go = (toTop) => {
        const el = targetRef?.current;
        if (el) el.scrollTo({ top: toTop ? 0 : el.scrollHeight, behavior: 'smooth' });
        else window.scrollTo({ top: toTop ? 0 : document.documentElement.scrollHeight, behavior: 'smooth' });
    };
    return (
        <DraggableScrollButtons storageKey={storageKey} initialRight={16}>
            <button onClick={() => go(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: themeColor }} title="Scroll to top">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
            </button>
            <button onClick={() => go(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: themeColor }} title="Scroll to bottom">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
        </DraggableScrollButtons>
    );
};

// LAZY chunks: the master-only management panel (Master Data / Import /
// Mapping / Service tabs) is not downloaded by regular users at all, and the
// xlsx library loads only when an Export button is actually clicked.
const MaintenanceScheduleMaster = lazy(() => import('../components/MaintenanceScheduleMaster'));
const loadXLSX = () => import('xlsx');

const sortByHours = (svcs) => svcs.slice().sort((a, b) => (parseFloat(a.hours) || 0) - (parseFloat(b.hours) || 0));

// Master-only management tabs hosted on this page (moved here from the
// Quotation Template page's old "Manage Master" panel).
const MGMT_TABS = ['master', 'service', 'import', 'mapping'];

const MaintenanceReports = () => {
    const isMaster = getRole() === 'master_admin';
    const [tab, setTab] = useState('coverage');

    // Deep-link support: the ERP Sitemap opens a specific tab via router
    // state — navigate('/maintenance-reports', { state: { openTab: 'activity' } }).
    // Management tabs ('master' | 'service' | 'import' | 'mapping') are only
    // honoured for the Master Admin. The state is consumed immediately so a
    // refresh doesn't re-apply it.
    const routerLocation = useLocation();
    const routerNavigate = useNavigate();
    useEffect(() => {
        const t = routerLocation.state?.openTab;
        if (t) {
            if (!MGMT_TABS.includes(t) || isMaster) setTab(t);
            routerNavigate(routerLocation.pathname, { replace: true, state: null });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routerLocation.state]);
    const [master, setMaster] = useState([]);
    const [services, setServices] = useState([]);
    const [activity, setActivity] = useState([]);
    const [commissioning, setCommissioning] = useState([]); // [{ appCode, commissioning }]
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    // Warm-cache-first paint: on the very first load only, instantly repaint the
    // last dataset this user saw while the normal fetch below runs unchanged and
    // overwrites it. Manual "Refresh" (and any later load) behaves exactly as before.
    const firstLoadRef = useRef(true);

    // silent === true refetches in the background (no skeleton) — used by the
    // embedded Master panel to keep the "App codes" badge live after add /
    // import / delete. The strict check matters: onClick passes a click event.
    const load = useCallback(async (silent) => {
        // Key scoped per user + branch. The fetch itself takes no tab/filter
        // params (tabs only change what is displayed), so none belong in the key.
        const u = (() => { try { return JSON.parse(sessionStorage.getItem('user')) || {}; } catch { return {}; } })();
        const cacheKey = warmKey('maintenance-reports', { userId: u.user_id || '', branch: u.branch || '' });
        let painted = false;
        if (firstLoadRef.current) {
            firstLoadRef.current = false;
            const warm = readWarmCache(cacheKey);
            if (warm && Array.isArray(warm.master) && Array.isArray(warm.services) && Array.isArray(warm.activity)) {
                setMaster((prev) => (prev.length ? prev : warm.master));
                setServices((prev) => (prev.length ? prev : warm.services));
                setActivity((prev) => (prev.length ? prev : warm.activity));
                if (Array.isArray(warm.commissioning)) setCommissioning((prev) => (prev.length ? prev : warm.commissioning));
                setLoading(false);
                painted = true;
            }
        }
        if (!painted && silent !== true) setLoading(true);
        setErr('');
        try {
            // Commissioning is a bonus column — if that one call fails (e.g. no asset
            // data), the rest of the page still loads. .catch keeps Promise.all intact.
            // SLIM app codes: this page only derives service coverage from
            // parts[].serviceHours, so skip the heavy full-parts payload.
            const [m, s, a, c] = await Promise.all([
                getAppCodesSlim(), getServices(), getActivity(),
                getAssetCommissioning().catch(() => []),
            ]);
            setMaster(m); setServices(s); setActivity(a); setCommissioning(c);
            writeWarmCache(cacheKey, { master: m, services: s, activity: a, commissioning: c });
        } catch (e) {
            setErr(e.message || 'Could not load reports');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="min-h-screen">
            <style>{`
                .r-scroll { scrollbar-width: thin; scrollbar-color: #c7c9e0 transparent; }
                .r-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
                .r-scroll::-webkit-scrollbar-thumb { background: #c7c9e0; border-radius: 9999px; }
            `}</style>

            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">
                {/* ===== Intro box ===== */}
                <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                    <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                                <DocumentChartBarIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Part Detail Info — Master Report</h1>
                                <p className="text-[11px] text-white/70 leading-tight">{isMaster ? 'Reports, master data, imports and app mapping' : 'Service coverage and application-code look-up activity'}</p>
                            </div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                            App codes: <b className="font-bold">{master.length}</b>
                        </span>
                    </div>
                </div>

                {/* ===== Tabs ===== */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4 border-b border-gray-200">
                    {[
                        { id: 'coverage', label: 'Service Applicability', Icon: Squares2X2Icon },
                        { id: 'activity', label: 'Search Activity Count', Icon: ClockIcon },
                        ...(isMaster ? [
                            { id: 'master', label: 'Master Data', Icon: CircleStackIcon },
                            { id: 'mapping', label: 'App Mapping', Icon: ArrowsRightLeftIcon },
                            { id: 'service', label: 'Master of Service', Icon: WrenchScrewdriverIcon },
                            { id: 'import', label: 'Import Data', Icon: ArrowUpTrayIcon },
                        ] : []),
                    ].map(({ id, label, Icon }) => (
                        <button key={id} onClick={() => setTab(id)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${tab === id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            style={tab === id ? { color: themeColor } : undefined}>
                            <Icon className="h-4 w-4" /> {label}
                        </button>
                    ))}
                    {!MGMT_TABS.includes(tab) && (
                        <button onClick={load} title="Refresh"
                            className="ml-auto mb-1 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
                            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>

                {MGMT_TABS.includes(tab) && isMaster ? (
                    <Suspense fallback={
                        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                            <div className="animate-pulse space-y-3">
                                <div className="h-4 w-1/3 rounded bg-gray-100" />
                                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-8 rounded bg-gray-50" />)}
                            </div>
                        </div>
                    }>
                        <MaintenanceScheduleMaster embedded initialTab={tab} onMasterChanged={() => load(true)} />
                    </Suspense>
                ) : err ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 py-12 text-center">
                        <ExclamationTriangleIcon className="h-9 w-9 mx-auto text-red-400" />
                        <p className="mt-2 text-sm font-semibold text-red-700">{err}</p>
                        <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ backgroundColor: themeColor }}>
                            <ArrowPathIcon className="h-3.5 w-3.5" /> Try again
                        </button>
                    </div>
                ) : loading ? (
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                        <div className="animate-pulse space-y-3">
                            <div className="h-4 w-1/3 rounded bg-gray-100" />
                            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-8 rounded bg-gray-50" />)}
                        </div>
                    </div>
                ) : tab === 'coverage'
                    ? <CoverageReport master={master} services={services} commissioning={commissioning} />
                    : <ActivityReport master={master} activity={activity} />}
            </div>
        </div>
    );
};

/* ----------------------------- Service Coverage ----------------------------- */
const th = 'px-3 py-2 text-center border border-gray-200 bg-gray-50';

const ROW_CHUNK = 80;

// Commissioning dates arrive as 'YYYY-MM-DD' — render them as '02 Jan 2026'.
const fmtDMY = (iso) => {
    if (!iso) return '';
    const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const CoverageReport = React.memo(({ master, services, commissioning = [] }) => {
    const cols = useMemo(() => sortByHours(services), [services]);
    const [search, setSearch] = useState('');
    const [segment, setSegment] = useState('');
    const [searchField, setSearchField] = useState('appCode');

    // Latest commissioning date per app code (from Asset Detailed).
    const commByCode = useMemo(() => {
        const m = new Map();
        commissioning.forEach((r) => m.set(String(r.appCode || '').trim().toLowerCase(), r.commissioning || ''));
        return m;
    }, [commissioning]);
    const commOf = (a) => commByCode.get(String(a.appCode || '').trim().toLowerCase()) || '';

    // Field-scoped search: default App Code; picking another searches only it.
    const SEARCH_FIELDS = [
        { key: 'appCode', label: 'App Code', get: (a) => a.appCode },
        { key: 'engineModel', label: 'Engine Model', get: (a) => a.engineModel },
        { key: 'kva', label: 'KVA Rating', get: (a) => a.kva },
        { key: 'emission', label: 'Emission Norm', get: (a) => a.emission },
        { key: 'commissioning', label: 'Commissioning Date', get: (a) => fmtDMY(commOf(a)) },
    ];

    // Segment dropdown options — only the segments that actually appear in the table.
    const segments = useMemo(
        () => [...new Set(master.map((a) => (a.segment || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [master]
    );

    // Coverage matrix (one Set of service ids per app code) is O(codes × parts);
    // memoize it so re-renders don't rebuild it. Pure derivation of master + services.
    const coverage = useMemo(
        () => master.map((a) => ({ a, ids: new Set(a.parts.map((p) => partService(services, p).id)) })),
        [master, services]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const getter = (SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).get;
        return coverage.filter(({ a }) => {
            if (segment && (a.segment || '').trim() !== segment) return false;
            if (!q) return true;
            return String(getter(a) || '').toLowerCase().includes(q);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coverage, search, segment, searchField, commByCode]);

    // Sortable on every identity column, plus each service column (has parts first).
    const { sort, toggle } = useSort();
    const accessors = useMemo(() => ({
        appCode: (r) => r.a.appCode,
        engineModel: (r) => r.a.engineModel,
        segment: (r) => r.a.segment,
        kva: (r) => r.a.kva,
        emission: (r) => r.a.emission,
        commissioning: (r) => commOf(r.a),   // ISO 'YYYY-MM-DD' sorts chronologically
        ...Object.fromEntries(cols.map((c) => [`svc:${c.id}`, (r) => (r.ids.has(c.id) ? 0 : 1)])),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [cols, commByCode]);
    const visible = useSortedRows(filtered, sort, accessors);

    // Lazy rendering: paint the first chunk immediately and mount the rest as the
    // sentinel row scrolls into view. Filters, sorting and export still operate on
    // the FULL dataset — only how many rows are in the DOM at once changes.
    const [visibleCount, setVisibleCount] = useState(ROW_CHUNK);
    const loadMoreRef = useRef(null);
    const tableScrollRef = useRef(null);
    useEffect(() => { setVisibleCount(ROW_CHUNK); }, [search, segment, sort, searchField]);
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && visibleCount < visible.length) {
                setVisibleCount((prev) => Math.min(prev + ROW_CHUNK, visible.length));
            }
        }, { threshold: 0.1 });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [visibleCount, visible.length]);
    const shownRows = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount]);

    const exportXlsx = async () => {
        const XLSX = await loadXLSX();   // heavy lib — loaded on click, not at page load
        const aoa = [['Sr.', 'App Code', 'Engine Model', 'Segment', 'KVA Rating', 'Emission Norm', 'Commissioning Date', ...cols.map((c) => c.short)]];
        // Export exactly what is on screen, in the same order.
        visible.forEach(({ a, ids }, i) => {
            aoa.push([i + 1, a.appCode, a.engineModel, a.segment, a.kva, a.emission, commOf(a) ? fmtDMY(commOf(a)) : '', ...cols.map((c) => (ids.has(c.id) ? 'Yes' : 'No'))]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 11 }, { wch: 13 }, { wch: 15 }, ...cols.map(() => ({ wch: 8 }))];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Coverage');
        XLSX.writeFile(wb, 'Service_Coverage_Report.xlsx');
    };

    if (master.length === 0) return <Empty label="No application codes yet." />;

    return (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 max-md:px-2">
                <ChartBarIcon className="h-4 w-4" style={{ color: themeColor }} />
                <p className="text-[13px] font-semibold text-gray-800">Service Coverage Matrix</p>
                <span className="text-[11px] text-gray-400 hidden sm:inline">
                    {(search.trim() || segment) ? `${visible.length} of ${master.length}` : master.length} codes × {cols.length} services · ✓ has parts · ✗ none
                </span>
                <select value={searchField} onChange={(e) => setSearchField(e.target.value)} title="Search field"
                    className="ml-auto max-w-[150px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-700 outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition max-sm:ml-0 max-sm:w-full max-sm:max-w-full">
                    {SEARCH_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${(SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).label.toLowerCase()}`}
                    className="w-44 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition max-sm:w-full max-sm:ml-0" />
                <select value={segment} onChange={(e) => setSegment(e.target.value)}
                    className="max-w-[160px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition max-sm:w-full max-sm:max-w-full">
                    <option value="">All segments</option>
                    {segments.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {(search || segment) && (
                    <button onClick={() => { setSearch(''); setSegment(''); }}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition">
                        Clear
                    </button>
                )}
                {canExportExcel() && (
                    <button onClick={exportXlsx}
                        className="export-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                        style={{ backgroundColor: themeColor }}>
                        <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
                    </button>
                )}
            </div>
            <div ref={tableScrollRef} className="overflow-auto r-scroll max-h-[70vh]">
                <table className="min-w-[900px] w-full border-collapse text-[12px]">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                            <th className={`${th} w-12`}>Sr.</th>
                            <SortTh label="App Code" sortKey="appCode" sort={sort} onSort={toggle} className={th} />
                            <SortTh label="Engine Model" sortKey="engineModel" sort={sort} onSort={toggle} className={th} />
                            <SortTh label="Segment" sortKey="segment" sort={sort} onSort={toggle} className={th} />
                            <SortTh label="KVA Rating" sortKey="kva" sort={sort} onSort={toggle} className={th} />
                            <SortTh label="Emission Norm" sortKey="emission" sort={sort} onSort={toggle} className={th} />
                            <SortTh label="Commissioning Date" sortKey="commissioning" sort={sort} onSort={toggle} wrap className={`${th} w-20`} />
                            {cols.map((c) => (
                                <SortTh key={c.id} label={c.short} sortKey={`svc:${c.id}`} sort={sort} onSort={toggle}
                                    title={c.name} className={`${th} whitespace-nowrap`} />
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.length === 0 && (
                            <tr>
                                <td colSpan={7 + cols.length} className="px-3 py-10 border border-gray-200 text-center text-gray-400">
                                    No codes match the search / segment filter.
                                </td>
                            </tr>
                        )}
                        {shownRows.map(({ a, ids }, i) => {
                            return (
                                <tr key={a.appCode} className="hover:bg-indigo-50/40 transition">
                                    <td className="px-2 py-2 border border-gray-200 text-center font-mono font-semibold text-gray-500">{i + 1}</td>
                                    <td className="px-3 py-2 border border-gray-200 font-mono font-semibold text-gray-800 whitespace-nowrap">{a.appCode}</td>
                                    <td className="px-3 py-2 border border-gray-200 font-mono text-gray-700 whitespace-nowrap">{a.engineModel || '—'}</td>
                                    <td className="px-3 py-2 border border-gray-200 text-center text-gray-600">{a.segment || '—'}</td>
                                    <td className="px-3 py-2 border border-gray-200 text-center text-gray-600 whitespace-nowrap">{a.kva ? `${a.kva} KVA` : '—'}</td>
                                    <td className="px-3 py-2 border border-gray-200 text-center text-gray-600 whitespace-nowrap">{a.emission || '—'}</td>
                                    <td className="px-3 py-2 border border-gray-200 text-center font-mono text-gray-600 whitespace-nowrap">{commOf(a) ? fmtDMY(commOf(a)) : '—'}</td>
                                    {cols.map((c) => (
                                        <td key={c.id} className="px-3 py-2 border border-gray-200 text-center">
                                            {ids.has(c.id)
                                                ? <span className="font-bold text-emerald-600">✓</span>
                                                : <span className="font-semibold text-gray-300">✗</span>}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                        {visibleCount < visible.length && (
                            <tr ref={loadMoreRef}>
                                <td colSpan={7 + cols.length} className="px-3 py-3 border border-gray-200 text-center text-[11px] text-gray-400">
                                    Loading more… ({visibleCount}/{visible.length})
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Floating scroll to top / bottom buttons — draggable horizontally along the bottom */}
            <ScrollArrows storageKey="reportsCoverageScrollBtnsPos" targetRef={tableScrollRef} />
        </div>
    );
});

/* ----------------------------- Search Activity ----------------------------- */
const ActivityReport = React.memo(({ master, activity }) => {
    // Date-range filter (drives the whole tab: stats, ranking, log, export).
    // Dates compared as plain YYYYMMDD numbers in UTC — the same frame the rows
    // are displayed in (timeZone:'UTC') — so there are no off-by-one timezone bugs.
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [employee, setEmployee] = useState('');
    const [search, setSearch] = useState('');
    const [segment, setSegment] = useState('');
    // Field-scoped search: default Employee Name; picking another searches only it.
    const SEARCH_FIELDS = [
        { key: 'employee', label: 'Employee Name', get: (g) => g.employee },
        { key: 'code', label: 'App Code', get: (g) => g.code },
        { key: 'engineModel', label: 'Engine Model', get: (g) => g.engineModel },
    ];
    const [searchField, setSearchField] = useState('employee');

    // All employees that appear in the activity log (for the filter dropdown).
    const employees = useMemo(
        () => [...new Set(activity.map((e) => e.employee).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [activity]
    );

    // Segment dropdown options — only the segments that actually appear in the log.
    const segments = useMemo(
        () => [...new Set(activity
            .map((e) => (e.segment || (findApp(master, e.code)?.segment) || '').trim())
            .filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [activity, master]
    );

    const data = useMemo(() => {
        const toNum = (s) => (s ? parseInt(s.replace(/-/g, ''), 10) : null);
        const fromN = toNum(fromDate), toN = toNum(toDate);
        const dateKey = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');     // YYYY-MM-DD (UTC)
        const dayNum = (ts) => { const k = dateKey(ts); return k ? parseInt(k.replace(/-/g, ''), 10) : null; };

        const filtered = activity.filter((e) => {
            if (employee && e.employee !== employee) return false;
            if (fromN == null && toN == null) return true;
            const d = dayNum(e.ts);
            if (d == null) return false;            // undated entries excluded while a date filter is active
            if (fromN != null && d < fromN) return false;
            if (toN != null && d > toN) return false;
            return true;
        });

        // Frequency: count of visits per (date, employee, app code) — like the
        // dashboard's "activity frequency". One row per employee / code / day.
        const map = new Map();
        filtered.forEach((e) => {
            const dk = dateKey(e.ts);
            const key = dk + '\u0000' + (e.employee || '') + '\u0000' + e.code;
            const cur = map.get(key);
            if (cur) {
                cur.visits += 1;
                if ((e.ts || 0) > cur.lastTs) cur.lastTs = e.ts || 0;
            } else {
                const a = findApp(master, e.code);
                map.set(key, {
                    dateKey: dk,
                    employee: e.employee || '\u2014',
                    code: e.code,
                    engineModel: e.engineModel || (a ? a.engineModel : '') || '\u2014',
                    segment: e.segment || (a ? a.segment : '') || '\u2014',
                    visits: 1,
                    lastTs: e.ts || 0,
                });
            }
        });
        const groups = [...map.values()].sort((x, y) =>
            y.dateKey.localeCompare(x.dateKey) || (y.visits - x.visits) || x.employee.localeCompare(y.employee)
        );
        return {
            groups,
            allTotal: activity.length,
            shownTotal: filtered.length,
            filtering: fromN != null || toN != null || !!employee,
        };
    }, [master, activity, fromDate, toDate, employee]);

    // Search / segment applied AFTER grouping \u2014 visit counts stay intact,
    // only which rows are displayed changes.
    const visibleGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        const getter = (SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).get;
        return data.groups.filter((g) => {
            if (segment && (g.segment || '').trim() !== segment) return false;
            if (!q) return true;
            return String(getter(g) || '').toLowerCase().includes(q);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.groups, search, segment, searchField]);

    // Lazy rendering: mount rows in chunks as the sentinel scrolls into view.
    // Grouping, visit counts and export still use the full dataset.
    const [visibleCount, setVisibleCount] = useState(ROW_CHUNK);
    const loadMoreRef = useRef(null);
    useEffect(() => { setVisibleCount(ROW_CHUNK); }, [fromDate, toDate, employee, search, segment, searchField]);
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && visibleCount < visibleGroups.length) {
                setVisibleCount((prev) => Math.min(prev + ROW_CHUNK, visibleGroups.length));
            }
        }, { threshold: 0.1 });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [visibleCount, visibleGroups.length]);
    const shownGroups = useMemo(() => visibleGroups.slice(0, visibleCount), [visibleGroups, visibleCount]);

    const fmtDate = (dk) => (dk
        ? new Date(dk + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : '\u2014');

    const exportXlsx = async () => {
        const XLSX = await loadXLSX();   // heavy lib — loaded on click, not at page load
        const aoa = [['Date', 'Employee', 'App Code', 'Engine Model', 'Segment', 'Visits']];
        data.groups.forEach((g) => aoa.push([fmtDate(g.dateKey), g.employee, g.code, g.engineModel, g.segment, g.visits]));
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 8 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Activity Frequency');
        XLSX.writeFile(wb, 'Activity_Frequency.xlsx');
    };

    return (
        <div>
            {data.allTotal === 0 ? (
                <Empty label="No look-ups recorded yet." />
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    {/* Header: title + export on top; all filters on their own single row */}
                    <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 max-md:px-2">
                        <div className="flex items-center gap-2 mb-2">
                            <ClockIcon className="h-4 w-4 flex-shrink-0" style={{ color: themeColor }} />
                            <div className="min-w-0 py-0.5">
                                <p className="text-[13px] font-semibold text-gray-800 whitespace-nowrap leading-none">Activity Log</p>
                                <p className="mt-1.5 text-[10.5px] text-gray-400 whitespace-nowrap leading-none">
                                    {(data.filtering || search.trim() || segment)
                                        ? `Showing ${data.shownTotal} of ${data.allTotal} look-ups · ${visibleGroups.length} rows`
                                        : `${data.allTotal} look-ups total · ${visibleGroups.length} rows`}
                                </p>
                            </div>
                            {canExportExcel() && (
                                <button onClick={exportXlsx} disabled={data.groups.length === 0}
                                    className="export-btn ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40 flex-shrink-0"
                                    style={{ backgroundColor: themeColor }}>
                                    <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
                                </button>
                            )}
                        </div>

                        {/* One filter row — right-aligned, stays on a single line, scrolls only on very narrow screens */}
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap overflow-x-auto r-scroll pb-0.5 max-sm:flex-wrap max-sm:overflow-visible max-sm:justify-start">
                            <span className="text-[11px] font-semibold text-gray-500 flex-shrink-0">From</span>
                            <input type="date" value={fromDate} max={toDate || undefined}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="flex-shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition" />
                            <span className="text-[11px] font-semibold text-gray-500 flex-shrink-0">To</span>
                            <input type="date" value={toDate} min={fromDate || undefined}
                                onChange={(e) => setToDate(e.target.value)}
                                className="flex-shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition" />
                            <select value={employee} onChange={(e) => setEmployee(e.target.value)}
                                className="flex-shrink-0 max-w-[150px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition">
                                <option value="">All employees</option>
                                {employees.map((emp) => <option key={emp} value={emp}>{emp}</option>)}
                            </select>
                            <select value={searchField} onChange={(e) => setSearchField(e.target.value)} title="Search field"
                                className="flex-shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-700 outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition">
                                {SEARCH_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                            </select>
                            <input value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder={`Search ${(SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).label.toLowerCase()}`}
                                className="flex-shrink min-w-[130px] w-44 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition" />
                            <select value={segment} onChange={(e) => setSegment(e.target.value)}
                                className="flex-shrink-0 max-w-[130px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition">
                                <option value="">All segments</option>
                                {segments.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {(fromDate || toDate || employee || search || segment) && (
                                <button onClick={() => { setFromDate(''); setToDate(''); setEmployee(''); setSearch(''); setSegment(''); }}
                                    className="flex-shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition">
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {visibleGroups.length === 0 ? (
                        <div className="py-14 text-center text-gray-400 text-[13px]">No look-ups match the selected filters.</div>
                    ) : (
                        <div className="overflow-x-auto r-scroll">
                            <table className="min-w-[720px] w-full border-collapse text-[12px]">
                                <thead>
                                    <tr className="bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                                        <th className="px-3 py-2 text-center border border-gray-200 w-40">Date</th>
                                        <th className="px-3 py-2 text-center border border-gray-200">Employee</th>
                                        <th className="px-3 py-2 text-center border border-gray-200">App Code</th>
                                        <th className="px-3 py-2 text-center border border-gray-200">Engine Model</th>
                                        <th className="px-3 py-2 text-center border border-gray-200">Segment</th>
                                        <th className="px-3 py-2 text-center border border-gray-200 w-20">Visits</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shownGroups.map((g, i) => (
                                        <tr key={i} className="hover:bg-indigo-50/40 transition">
                                            <td className="px-3 py-2 border border-gray-200 font-mono text-gray-500 whitespace-nowrap">{fmtDate(g.dateKey)}</td>
                                            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-800">{g.employee}</td>
                                            <td className="px-3 py-2 border border-gray-200 font-mono font-semibold text-gray-800">{g.code}</td>
                                            <td className="px-3 py-2 border border-gray-200 text-gray-600">{g.engineModel}</td>
                                            <td className="px-3 py-2 border border-gray-200 text-center text-gray-600">{g.segment}</td>
                                            <td className="px-3 py-2 border border-gray-200 text-center">
                                                <span className="inline-block min-w-[30px] rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: themeSoft, color: themeColor }}>{g.visits}</span>
                                            </td>
                                        </tr>
                                    ))}
                                    {visibleCount < visibleGroups.length && (
                                        <tr ref={loadMoreRef}>
                                            <td colSpan={6} className="px-3 py-3 border border-gray-200 text-center text-[11px] text-gray-400">
                                                Loading more… ({visibleCount}/{visibleGroups.length})
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Floating scroll to top / bottom buttons — draggable horizontally along the bottom */}
            <ScrollArrows storageKey="reportsActivityScrollBtnsPos" />
        </div>
    );
});

const Empty = React.memo(({ label }) => (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400 text-[13px]">{label}</div>
));

export default MaintenanceReports;