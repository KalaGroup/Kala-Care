import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import {
    Cog6ToothIcon, ArrowLeftIcon, MagnifyingGlassIcon, PlusIcon,
    PencilSquareIcon, TrashIcon, ChevronRightIcon, ChevronDownIcon, ArrowPathIcon,
    CircleStackIcon, WrenchScrewdriverIcon, ArrowUpTrayIcon, CheckIcon, XMarkIcon, DocumentTextIcon,
    ArrowsRightLeftIcon, Squares2X2Icon, CheckCircleIcon, ExclamationTriangleIcon,
    CubeIcon, FunnelIcon,
} from '@heroicons/react/24/outline';
import {
    getAppCodes, createAppCode, updateAppCode, deleteAppCode, importAppCodes,
    getServices, renameService, getAppMapping, partService, ACTION, ORIG_HEADERS,
    IMPORT_COLUMNS, IMPORT_REQUIRED_COLUMN, themeColor, themeDark, themeSoft,
} from './maintenanceApi';
import { warmKey, readWarmCache, writeWarmCache } from '../utils/warmCache';
import { startUpload, finishUpload } from '../utils/uploadStatus';
import { canExportExcel } from '../utils/exportPermission';
import { SortTh, useSort, useSortedRows } from './TableSort';
import DraggableScrollButtons from './DraggableScrollButtons';

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

const chipCls = { R: 'bg-blue-50 text-blue-700', C: 'bg-amber-50 text-amber-700', T: 'bg-emerald-50 text-emerald-700' };
const Chip = React.memo(({ a }) => {
    const k = (a || '').trim().toUpperCase();
    if (!ACTION[k]) return null;
    return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${chipCls[k]}`}>{k}</span>;
});
const numSort = (arr) => arr.slice().sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));

// Commissioning dates arrive as 'YYYY-MM-DD' — render them as '02 Jan 2026'.
const fmtDMY = (iso) => {
    if (!iso) return '';
    const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Asset KVA can arrive as "30", "30.0" or "30 KVA" — the master stores the bare
// number. Asset rows use "0" to mean "not rated", which is not a real KVA, so it
// is treated as blank rather than prefilled onto a record.
const cleanKva = (v) => String(v || '').replace(/kva/ig, '').trim().replace(/\.0+$/, '');
const assetKva = (v) => { const k = cleanKva(v); return (!k || Number(k) === 0) ? '' : k; };
// Asset Detailed writes the segment as "IND"/"PG"; the master's Segment field only
// offers "PG"/"Industrial", so map it across instead of storing an off-list value.
const assetSegment = (v) => {
    const t = String(v || '').trim().toUpperCase();
    if (t === 'PG') return 'PG';
    if (t === 'IND' || t === 'INDUSTRIAL') return 'Industrial';
    return '';
};

// Closes off one application code's run of part rows in the Master Data sheet.
const BLOCK_END = { borderBottom: '1.5px solid #9ca3af' };

/* ===================== Kits — independent of the part lines =====================
   A kit is its OWN record carrying its OWN copied part lines. Building a kit from
   service parts copies them; it never links back. So:
     · editing a service part does NOT change what the kit holds,
     · a kit's part lines can be edited and extended on their own,
     · the same part may be copied into any number of kits,
     · "loose" parts are simply the service parts no kit contains.
   These helpers read the serialized record ({ parts:[], kits:[{ parts:[] }] }) and
   tolerate records cached before kits existed. */
const kitsOf = (a) => (Array.isArray(a?.kits) ? a.kits : []);
const normPn = (v) => String(v || '').trim().toLowerCase();
// Only a kit's BUILT-IN members take a part off the loose lists. A copy a kit
// holds with loose:true is still a loose part — it keeps its mirrored row in
// the sheet's loose block like every other loose part.
const kitPartNumbers = (a) =>
    new Set(kitsOf(a).flatMap((k) => (k.parts || []).filter((p) => !p.loose).map((p) => normPn(p.partNumber))).filter(Boolean));
const loosePartsOf = (a) => {
    const inKit = kitPartNumbers(a);
    return (a?.parts || []).filter((p) => !inKit.has(normPn(p.partNumber)));
};

// A loose part is copied into the kit columns as-is, exactly the way the master
// file writes it: the part repeats itself as its own kit line.
const looseAsKit = (p) => ({
    kitNumber: p.partNumber || '', kitDesc: p.partDesc || '',
    qty: p.qty || '', action: p.action || '', serviceHours: p.serviceHours || '',
});

// One flat row list for the master sheet. The two column groups are two separate
// lists printed side by side — a kit only ever COPIED its part codes, so nothing
// on the right belongs to the part on its left:
//   PART DETAILS — the code's service parts: the ones some kit copied first, the
//                  loose ones last. Parts that exist only inside a kit never
//                  appear here at all.
//   KIT DETAILS  — all the kits, one row each, then "—" rows, then the loose
//                  parts, each copying itself across the way the master file
//                  writes them (so the loose block lines up at the bottom).
// A kit's own part lines are not printed here — they are information held on the
// kit, shown in the Edit form and the View modal.
const sheetRowsOf = (a) => {
    const inKit = kitPartNumbers(a);
    const parts = a?.parts || [];
    const members = parts.filter((p) => inKit.has(normPn(p.partNumber)));
    const loose = parts.filter((p) => !inKit.has(normPn(p.partNumber)));
    const kits = kitsOf(a);

    // The block above the loose parts is as tall as it needs to be to hold both
    // sides: every kit-copied part on the left, every kit on the right.
    const top = Math.max(members.length, kits.length);
    const rows = [];
    for (let i = 0; i < top; i++) rows.push({ part: members[i] || null, kit: kits[i] || null, loose: false });
    loose.forEach((p) => rows.push({ part: p, kit: looseAsKit(p), loose: true }));

    return rows.length ? rows : [{ part: null, kit: null, loose: false }];
};

const Loading = React.memo(() => (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm animate-pulse space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded bg-gray-50" />)}
    </div>
));
const ErrorBox = ({ msg, onRetry }) => (
    <div className="rounded-2xl border border-red-200 bg-red-50 py-10 text-center">
        <p className="text-sm font-semibold text-red-700">{msg}</p>
        <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ backgroundColor: themeColor }}>
            <ArrowPathIcon className="h-3.5 w-3.5" /> Try again
        </button>
    </div>
);

/* ===================================================================== */
const PanelStyles = () => (
    <style>{`.qm-scroll{scrollbar-width:thin;scrollbar-color:#c7c9e0 transparent}.qm-scroll::-webkit-scrollbar{height:6px;width:6px}.qm-scroll::-webkit-scrollbar-thumb{background:#c7c9e0;border-radius:9999px}
/* One font for the whole page — font-mono falls back to different fonts per machine, making this page look unlike the rest of the app */
.msm-font,.msm-font *{font-family:'Inter','Segoe UI',Arial,sans-serif !important}
.msm-modal input::placeholder{font-size:10.5px;font-style:italic;color:#8f96a3;font-family:inherit}
.kit-wrap{display:grid;grid-template-rows:0fr;transition:grid-template-rows .32s cubic-bezier(.4,0,.2,1)}
.kit-wrap.kit-open{grid-template-rows:1fr}
.kit-inner{overflow:hidden;min-height:0}
.kit-content{opacity:0;transform:translateY(-8px);transition:opacity .26s ease,transform .26s ease}
.kit-open .kit-content{opacity:1;transform:none;transition-delay:.05s}`}</style>
);

const MaintenanceScheduleMaster = ({ onBack, initialTab, initialTabNonce, embedded = false, onMasterChanged }) => {
    const [tab, setTab] = useState(initialTab || 'master');

    // Keep following the requested tab when the panel is already mounted and a
    // sitemap deep-link (or, in embedded mode, the host page's tab bar) asks for
    // one (the nonce bumps per request, so even a repeat of the same tab
    // re-applies after manual tab switches).
    useEffect(() => {
        if (initialTab) setTab(initialTab);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialTab, initialTabNonce]);
    const tabs = [
        { id: 'master', label: 'Master Data', Icon: CircleStackIcon },
        { id: 'mapping', label: 'App Mapping', Icon: ArrowsRightLeftIcon },
        { id: 'service', label: 'Master of Service', Icon: WrenchScrewdriverIcon },
        { id: 'import', label: 'Import Data', Icon: ArrowUpTrayIcon },
    ];

    const body = (
        <>
            {tab === 'master' && <MasterData onMasterChanged={onMasterChanged} />}
            {tab === 'service' && <MasterOfService onMasterChanged={onMasterChanged} />}
            {tab === 'import' && <ImportData onMasterChanged={onMasterChanged} />}
            {tab === 'mapping' && <AppMapping onMasterChanged={onMasterChanged} />}
        </>
    );

    // Embedded mode: the host page (Activity Reports) provides the header and
    // the tab bar — render only the active panel (plus the shared styles the
    // modal / tables depend on).
    if (embedded) return (<div className="msm-font"><PanelStyles />{body}</div>);

    return (
        <div className="msm-font min-h-screen">
            <PanelStyles />
            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">
                {/* Intro */}
                <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                    <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                                <Cog6ToothIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Part Detail Info — Master</h1>
                                <p className="text-[11px] text-white/70 leading-tight">Manage application codes, services and imports</p>
                            </div>
                        </div>
                        <button onClick={onBack}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                            <ArrowLeftIcon className="h-3.5 w-3.5" /> Back
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4 border-b border-gray-200">
                    {tabs.map(({ id, label, Icon }) => (
                        <button key={id} onClick={() => setTab(id)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${tab === id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            style={tab === id ? { color: themeColor } : undefined}>
                            <Icon className="h-4 w-4" /> {label}
                        </button>
                    ))}
                </div>

                {body}
            </div>
        </div>
    );
};

/* ----------------------------- Master Data ----------------------------- */
const MasterData = ({ onMasterChanged }) => {
    const [rows, setRows] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [query, setQuery] = useState('');
    const [sel, setSel] = useState({});
    const [editing, setEditing] = useState(undefined); // undefined=closed, null=add, obj=edit
    const [refreshing, setRefreshing] = useState(false);
    // Codes in Asset Detailed that aren't in the master yet — offered as
    // suggestions in the Add form. Optional: failing to load only costs the hints.
    const [pending, setPending] = useState([]);
    const loadPending = useCallback(() => {
        getAppMapping().then((m) => setPending(m?.remaining || [])).catch(() => { /* suggestions are a bonus */ });
    }, []);
    useEffect(() => { loadPending(); }, [loadPending]);

    const load = useCallback(async (initial = false) => {
        // Warm-cache-first paint (initial load only): instantly repaint the last
        // master-data list this user saw while the normal fetch below runs
        // unchanged and overwrites it. Key is scoped per user + branch + tab.
        const u = (() => { try { return JSON.parse(sessionStorage.getItem('user')) || {}; } catch { return {}; } })();
        const cacheKey = warmKey('maintenance-master-data', { userId: u.user_id || '', branch: u.branch || '', tab: 'master' });
        let painted = false;
        if (initial) {
            const warm = readWarmCache(cacheKey);
            if (warm && Array.isArray(warm.rows) && Array.isArray(warm.services)) {
                setRows((prev) => (prev.length ? prev : warm.rows));
                setServices((prev) => (prev.length ? prev : warm.services));
                setLoading(false);
                painted = true;
            }
        }
        if (initial && !painted) setLoading(true);
        setErr('');
        try {
            const [r, s] = await Promise.all([getAppCodes(), getServices()]);
            setRows(r); setServices(s);
            writeWarmCache(cacheKey, { rows: r, services: s });
        } catch (e) { if (initial) setErr(e.message || 'Could not load'); else toast.error(e.message); }
        finally { if (initial) setLoading(false); }
    }, []);
    useEffect(() => { load(true); }, [load]);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            const [r, s] = await Promise.all([getAppCodes(), getServices()]);
            setRows(r); setServices(s);
            toast.success('Refreshed');
        } catch (e) {
            toast.error(e.message || 'Could not refresh');
        } finally { setRefreshing(false); }
    };

    const opts = useMemo(() => {
        const distinct = (fn) => [...new Set(rows.map(fn).map((v) => String(v ?? '').trim()).filter(Boolean))];
        const distinctP = (fn) => [...new Set(rows.flatMap((a) => a.parts).map(fn).map((v) => String(v ?? '').trim()).filter(Boolean))];
        return {
            segOpts: [...new Set([...distinct((a) => a.segment), 'PG', 'Industrial'])],
            kvaOpts: numSort([...new Set(distinct((a) => a.kva))]),
            emiOpts: [...new Set([...distinct((a) => a.emission), 'CPCB IV+'])],
            actOpts: ['R', 'C', 'T'],
            hrsOpts: numSort([...new Set([
                ...distinctP((p) => p.serviceHours),
                ...rows.flatMap(kitsOf).map((k) => String(k.serviceHours ?? '').trim()).filter(Boolean),
                ...services.map((s) => s.hours),
            ])]),
        };
    }, [rows, services]);
    const existingCodes = useMemo(() => new Set(rows.map((a) => a.appCode)), [rows]);

    // Field-scoped search: default App Code; picking another field searches only
    // it. "Part / Kit" spans the part lines AND the kits (which now carry their
    // own part copies, so those are searched too).
    const SEARCH_FIELDS = [
        { key: 'appCode', label: 'App Code', match: (a, q) => a.appCode.toLowerCase().includes(q) },
        { key: 'engineModel', label: 'Engine Model', match: (a, q) => (a.engineModel || '').toLowerCase().includes(q) },
        { key: 'segment', label: 'Segment', match: (a, q) => (a.segment || '').toLowerCase().includes(q) },
        { key: 'kva', label: 'KVA Rating', match: (a, q) => (a.kva || '').toLowerCase().includes(q) },
        { key: 'emission', label: 'Emission Norm', match: (a, q) => (a.emission || '').toLowerCase().includes(q) },
        {
            key: 'part', label: 'Part / Kit', match: (a, q) =>
                a.parts.some((p) => (p.partNumber || '').toLowerCase().includes(q) || (p.partDesc || '').toLowerCase().includes(q)) ||
                kitsOf(a).some((k) =>
                    (k.kitNumber || '').toLowerCase().includes(q) || (k.kitDesc || '').toLowerCase().includes(q) ||
                    (k.parts || []).some((p) => (p.partNumber || '').toLowerCase().includes(q) || (p.partDesc || '').toLowerCase().includes(q))),
        },
    ];
    const [searchField, setSearchField] = useState('appCode');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        const matcher = (SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).match;
        return rows.filter((a) => matcher(a, q));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, rows, searchField]);

    // Only the application-code columns sort. The part and kit columns can't:
    // the rows are laid out kit-block by kit-block, so reordering them would tear
    // the blocks apart.
    const { sort, toggle } = useSort();
    const shown = useSortedRows(filtered, sort, {
        segment: (a) => a.segment,
        appCode: (a) => a.appCode,
        systemAppCode: (a) => a.systemAppCode,
        engineModel: (a) => a.engineModel,
        kva: (a) => a.kva,
        emission: (a) => a.emission,
    });

    // Flatten to the sheet layout: every kit's own part copies first (kit values
    // on the block's first row only), then the loose parts. Only the application-
    // code columns are still merged, down all of the code's rows.
    const sheet = useMemo(() => shown.map((a) => ({ app: a, rows: sheetRowsOf(a) })), [shown]);

    const selCodes = Object.keys(sel).filter((k) => sel[k]);

    // Second horizontal scrollbar ABOVE the sheet, kept in lockstep with the
    // sheet's own one, so the wide table can be panned without first scrolling
    // to the bottom. The spacer is sized to the sheet's real scroll width.
    const topScrollRef = useRef(null);
    const sheetScrollRef = useRef(null);
    const [sheetW, setSheetW] = useState(0);
    useEffect(() => {
        const el = sheetScrollRef.current;
        if (!el) return;
        const measure = () => setSheetW(el.scrollWidth);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => ro.disconnect();
    }, [sheet]);
    const mirrorScroll = (from, to) => () => {
        if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft)
            to.current.scrollLeft = from.current.scrollLeft;
    };

    // Export keeps the ORIGINAL master-file shape (ORIG_HEADERS) rather than the
    // on-screen layout, so a file exported here can be re-imported unchanged:
    // that file format encodes kit membership by row position, which is the only
    // way Import can tell which parts made up a kit. Each kit therefore writes
    // its own part copies with the kit values on the block's FIRST row and blanks
    // below, and each loose part repeats itself in the kit columns ("no kit").
    const exportXlsx = (codes) => {
        const list = codes ? rows.filter((a) => codes.includes(a.appCode)) : rows;
        const aoa = [ORIG_HEADERS];
        list.forEach((a) => {
            const push = (p, k, first) => aoa.push([
                a.segment, a.appCode, a.systemAppCode, a.engineModel, a.kva, a.emission,
                p.partNumber || '', p.partDesc || '', p.qty || '', p.action || '', p.serviceHours || '',
                k && first ? (k.kitNumber || '') : '', k && first ? (k.kitDesc || '') : '',
                k && first ? (k.qty || '') : '', k && first ? (k.action || '') : '',
                k && first ? (k.serviceHours || '') : '', p.schedule || '',
            ]);
            kitsOf(a).forEach((k) => (k.parts || []).forEach((p, i) => push(p, k, i === 0)));
            loosePartsOf(a).forEach((p) => push(p, looseAsKit(p), true));
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = ORIG_HEADERS.map((h, i) => ({ wch: [8, 12, 14, 16, 6, 9, 16, 40, 5, 7, 9, 14, 30, 5, 7, 9, 16][i] || 12 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'MASTER_DATA');
        XLSX.writeFile(wb, `MASTER_DATA_${codes ? `selected_${codes.length}` : `all_${list.length}`}.xlsx`);
    };

    const onDelete = async (a) => {
        const r = await Swal.fire({
            icon: 'warning', title: `Delete ${a.appCode}?`,
            text: `Removes the record and all ${a.parts.length} part lines.`,
            showCancelButton: true, confirmButtonColor: '#bf372e', cancelButtonColor: '#9ca3af',
            confirmButtonText: 'Delete', cancelButtonText: 'Cancel',
        });
        if (!r.isConfirmed) return;
        try {
            await deleteAppCode(a.appCode);
            toast.success('Deleted');
            await load();
            loadPending(); // the code is pending again now
            onMasterChanged?.(); // host page badge (App codes count) stays live
        } catch (e) { toast.error(e.message || 'Could not delete'); }
    };

    // Returns on success, throws on failure (so the modal can stay open).
    const saveApp = async (isEdit, code, rec) => {
        if (isEdit) await updateAppCode(code, rec);
        else await createAppCode(rec);
        toast.success(isEdit ? 'Updated' : 'Added');
        await load();
        loadPending(); // a newly added code drops off the pending list
        onMasterChanged?.(); // host page badge (App codes count) stays live
    };

    if (loading) return <Loading />;
    if (err) return <ErrorBox msg={err} onRetry={() => load(true)} />;

    return (
        <div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">

                {/* Left side - Search (field-scoped) */}
                <div className="flex items-center gap-2 max-sm:w-full">
                    <select value={searchField} onChange={(e) => setSearchField(e.target.value)} title="Search field"
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] text-gray-700 outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition">
                        {SEARCH_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <div className="relative max-sm:flex-1">
                        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Search ${(SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).label.toLowerCase()}`}
                            className="w-56 sm:w-72 rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-[13px] outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 text-black transition max-sm:w-full"
                        />
                    </div>
                </div>

                {/* Right side - Actions */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-gray-500 font-medium">
                        Selected: <b style={{ color: themeColor }}>{selCodes.length}</b>
                    </span>

                    {selCodes.length > 0 && (
                        <>
                            <button
                                onClick={() => setSel({})}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
                            >
                                Clear
                            </button>

                            {canExportExcel() && (
                                <button
                                    onClick={() => exportXlsx(selCodes)}
                                    title="Excel in the original master-file arrangement (kit blocks, then loose parts) so it can be re-imported as-is"
                                    className="export-btn inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition"
                                >
                                    <ArrowUpTrayIcon className="h-4 w-4" /> Export selected
                                </button>
                            )}
                        </>
                    )}

                    {canExportExcel() && (
                        <button
                            onClick={() => exportXlsx(null)}
                            title="Excel in the original master-file arrangement (kit blocks, then loose parts) so it can be re-imported as-is"
                            className="export-btn inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition"
                        >
                            <ArrowUpTrayIcon className="h-4 w-4" /> Export all
                        </button>
                    )}

                    <button
                        onClick={doRefresh}
                        disabled={refreshing}
                        title="Refresh"
                        className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                        <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                        onClick={() => setEditing(null)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                        style={{ backgroundColor: themeColor }}
                    >
                        <PlusIcon className="h-4 w-4" /> Add Application Code
                    </button>
                </div>
            </div>

            {/* List — one flat sheet, laid out like the master Excel: every part is its
                own row and the application-code columns are merged down across that
                code's part rows (rowSpan), exactly as the file merges A:E. */}
            {shown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400 text-[13px]">{rows.length === 0 ? 'No records yet — add one or import a file.' : 'No records match.'}</div>
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                    {/* Top scrollbar — a spacer as wide as the sheet, mirrored with it */}
                    <div ref={topScrollRef} onScroll={mirrorScroll(topScrollRef, sheetScrollRef)} className="overflow-x-auto overflow-y-hidden qm-scroll border-b border-gray-100">
                        <div style={{ width: sheetW }} className="h-px" />
                    </div>
                    <div ref={sheetScrollRef} onScroll={mirrorScroll(sheetScrollRef, topScrollRef)} className="overflow-auto qm-scroll max-h-[82vh]">
                        <table className="master-sheet-table min-w-[1660px] w-full text-[12px]">
                            <thead className="sticky top-0 z-10">
                                {/* Two-tier header: "Qty" and "Action" appear under both Part
                                    Details and Kit Details, so the group row tells them apart. */}
                                <tr className="bg-gray-100 text-[10px] font-bold text-black uppercase tracking-wider">
                                    <th rowSpan={2} className="px-2 py-1 border border-gray-200 bg-gray-100 w-9 text-center">
                                        <span
                                            onClick={() => {
                                                const allOn = shown.length > 0 && shown.every((a) => sel[a.appCode]);
                                                setSel(allOn ? {} : Object.fromEntries(shown.map((a) => [a.appCode, true])));
                                            }}
                                            className="inline-flex h-[16px] w-[16px] cursor-pointer items-center justify-center rounded border border-gray-300 bg-white align-middle"
                                            title="Select all / none"
                                        >
                                            {shown.length > 0 && shown.every((a) => sel[a.appCode]) && <CheckIcon className="h-3 w-3" style={{ color: themeColor }} />}
                                        </span>
                                    </th>
                                    <th rowSpan={2} className="px-2 py-1 border border-gray-200 bg-gray-100 w-11 text-center">Sr.</th>
                                    <th colSpan={6} className="px-3 py-1 border border-gray-200 bg-gray-100 text-center">Application Code</th>
                                    <th colSpan={5} className="px-3 py-1 border border-gray-200 bg-indigo-100 text-center" style={{ color: themeColor }}>Part Details</th>
                                    <th colSpan={5} className="px-3 py-1 border border-gray-200 bg-amber-100 text-center text-amber-800">Kit Details</th>
                                    <th rowSpan={2} className="px-3 py-1 border border-gray-200 bg-gray-100 w-24 text-center">Actions</th>
                                </tr>
                                <tr className="bg-gray-50 text-[10px] font-semibold text-black uppercase tracking-wider">
                                    <SortTh label="Segment" sortKey="segment" sort={sort} onSort={toggle} className="px-3 py-1 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="App Code" sortKey="appCode" sort={sort} onSort={toggle} className="px-3 py-1 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="System App Code" sortKey="systemAppCode" sort={sort} onSort={toggle} className="px-3 py-1 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="Engine Model" sortKey="engineModel" sort={sort} onSort={toggle} className="px-3 py-1 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="KVA" sortKey="kva" sort={sort} onSort={toggle} className="px-3 py-1 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="Emission" sortKey="emission" sort={sort} onSort={toggle} className="px-3 py-1 border border-gray-200 bg-gray-50 text-center" />
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Part Number</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Part Description</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Qty</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Action</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Svc Hrs</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Kit Number</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Kit Description</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Qty</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Action</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Svc Hrs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sheet.map(({ app: a, rows: srows }, ai) => {
                                    const on = !!sel[a.appCode];
                                    const span = srows.length;
                                    const appTd = `px-3 py-1 border border-gray-200 align-middle ${on ? 'bg-indigo-50/50' : 'bg-white'}`;
                                    return srows.map((r, i) => {
                                        const p = r.part;
                                        // Close the whole application code off with a heavy rule; close
                                        // each kit block with a light dashed one so the blocks stay
                                        // readable now that the kit cells are no longer merged.
                                        const last = i === srows.length - 1;
                                        const rowEnd = last ? BLOCK_END : undefined;
                                        return (
                                            <tr key={`${a.appCode}:${i}`} className={on ? 'bg-indigo-50/30' : 'hover:bg-indigo-50/30 transition'}>
                                                {/* --- Application code block: merged across all its rows --- */}
                                                {i === 0 && (
                                                    <>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center`}>
                                                            <span onClick={() => setSel((s) => ({ ...s, [a.appCode]: !s[a.appCode] }))}
                                                                className={`inline-flex h-[16px] w-[16px] cursor-pointer items-center justify-center rounded border align-middle ${on ? 'bg-[#2f3192] border-[#2f3192]' : 'border-gray-300 bg-white'}`}>
                                                                {on && <CheckIcon className="h-3 w-3 text-white" />}
                                                            </span>
                                                        </td>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center font-mono font-semibold text-gray-500`}>{ai + 1}</td>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center text-gray-600`}>{a.segment || '—'}</td>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center`}>
                                                            <span className="inline-flex min-w-[104px] items-center justify-center font-mono font-bold text-[12px] bg-[#1b2026] text-white px-2 py-0.5 rounded-md whitespace-nowrap">{a.appCode}</span>
                                                        </td>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center font-mono text-gray-600 whitespace-nowrap`}>{a.systemAppCode || '—'}</td>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} font-mono text-gray-700 whitespace-nowrap`}>{a.engineModel || '—'}</td>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center text-gray-600 whitespace-nowrap`}>{a.kva ? `${a.kva} KVA` : '—'}</td>
                                                        <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center text-gray-600 whitespace-nowrap`}>{a.emission || '—'}</td>
                                                    </>
                                                )}

                                                {/* --- Part line: strictly one of the code's service parts. Parts
                                                        that exist only inside a kit never appear here. --- */}
                                                <td style={rowEnd} className="px-3 py-1 border border-gray-200 font-mono text-gray-800 whitespace-nowrap">{p?.partNumber || '—'}</td>
                                                <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-gray-700 min-w-[240px]">{p?.partDesc || '—'}</td>
                                                <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-center">{p?.qty || '—'}</td>
                                                <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-center"><Chip a={p?.action} /></td>
                                                <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-center font-mono" title={p ? partService(services, p).name : ''}>{p?.serviceHours || '—'}</td>

                                                {/* --- Kit columns: its own list — all the kits, then "—" rows,
                                                        then the loose parts copying themselves across. Nothing
                                                        here relates to the part row beside it. --- */}
                                                <td style={rowEnd} className={`px-3 py-1 border border-gray-200 font-mono text-gray-600 whitespace-nowrap bg-amber-50/20`}>
                                                    {r.kit ? (r.kit.kitNumber || '—') : '—'}
                                                </td>
                                                <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-gray-600 min-w-[200px] bg-amber-50/20`}>
                                                    {r.kit ? (r.kit.kitDesc || '—') : '—'}
                                                </td>
                                                <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-center text-gray-600 bg-amber-50/20`}>
                                                    {r.kit ? (r.kit.qty || '—') : '—'}
                                                </td>
                                                <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-center bg-amber-50/20`}>
                                                    {r.kit ? <Chip a={r.kit.action} /> : '—'}
                                                </td>
                                                <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-center font-mono text-gray-600 bg-amber-50/20`}>
                                                    {r.kit ? (r.kit.serviceHours || '—') : '—'}
                                                </td>

                                                {/* --- Row actions: merged, one set per application code --- */}
                                                {i === 0 && (
                                                    <td rowSpan={span} style={BLOCK_END} className={`${appTd}`}>
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <button onClick={() => setEditing(a)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50">
                                                                <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
                                                            </button>
                                                            <button onClick={() => onDelete(a)} className="rounded-lg border border-red-100 text-red-600 bg-white p-1.5 hover:bg-red-50">
                                                                <TrashIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    });
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-1.5 border-t border-gray-200 bg-gray-50 text-[10.5px] text-gray-400">
                        {shown.length} application code{shown.length === 1 ? '' : 's'} · {shown.reduce((n, a) => n + a.parts.length, 0)} part lines · {shown.reduce((n, a) => n + kitsOf(a).length, 0)} kits.
                        Two separate lists side by side. Part Details: the service parts a kit copied, then the loose ones. Kit Details: all the kits, then “—” rows, then the loose parts copied across. A kit only copied the part codes — nothing on the right belongs to the part on its left.
                    </div>

                    {/* Floating scroll to top / bottom buttons — draggable horizontally along the bottom */}
                    <ScrollArrows storageKey="masterDataScrollBtnsPos" targetRef={sheetScrollRef} />
                </div>
            )}

            {editing !== undefined && (
                <AppFormModal initial={editing} opts={opts} existing={existingCodes} remaining={pending}
                    onClose={() => setEditing(undefined)}
                    onSave={(rec) => saveApp(!!editing, editing?.appCode, rec)} />
            )}
        </div>
    );
};

/* ------------- Combobox: shows ALL options, also allows typing a new value -------------
   The menu is rendered fixed-position from the field's screen rect, so it is never
   clipped by a scrolling/overflow parent (e.g. the parts table) and follows the
   field if the modal body scrolls. */
const Combo = ({ value, onChange, options, placeholder, mono, fieldCls, pickOnly, disabled }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const wrapRef = useRef(null);
    const inputRef = useRef(null);
    // Hover open/close: entering the field (or its menu — a DOM child, so it
    // keeps the hover) opens the list; leaving closes it after a short grace
    // period so crossing the small gap to the menu doesn't shut it.
    const hoverT = useRef(null);
    useEffect(() => () => clearTimeout(hoverT.current), []);

    const measure = () => {
        const el = inputRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const maxH = 184;
        const spaceBelow = window.innerHeight - r.bottom;
        const up = spaceBelow < maxH + 8 && r.top > spaceBelow;
        setPos({ left: r.left, width: r.width, up, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4 });
    };
    const openNow = () => { if (disabled) return; measure(); setOpen(true); };

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        const onMove = () => measure();
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
        };
    }, [open]);

    const hoverOpen = () => { if (disabled) return; clearTimeout(hoverT.current); openNow(); };
    const hoverClose = () => { clearTimeout(hoverT.current); hoverT.current = setTimeout(() => setOpen(false), 220); };

    return (
        <div className="relative" ref={wrapRef} onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
            <input
                ref={inputRef}
                className={`${fieldCls} ${mono ? 'font-mono' : ''} ${pickOnly ? 'cursor-pointer' : ''} ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed opacity-80' : ''}`}
                style={{ paddingRight: 26 }}
                value={value}
                placeholder={placeholder}
                readOnly={pickOnly || disabled}
                disabled={disabled}
                onChange={(e) => { if (pickOnly || disabled) return; onChange(e.target.value); open ? measure() : openNow(); }}
                onFocus={openNow}
            />
            {!disabled && (
                <button type="button" tabIndex={-1} onClick={() => (open ? setOpen(false) : openNow())}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <ChevronDownIcon className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
                </button>
            )}
            {open && pos && options.length > 0 && (
                <div className="fixed z-[300] max-h-[184px] overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl py-1"
                    style={{ left: pos.left, width: pos.width, minWidth: 96, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }) }}>
                    {options.map((o) => (
                        <div key={o} onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
                            className={`px-3 py-1.5 text-[13px] cursor-pointer hover:bg-indigo-50 ${mono ? 'font-mono' : ''} ${String(o) === String(value) ? 'bg-indigo-50 text-[#2f3192] font-semibold' : 'text-gray-700'}`}>
                            {o}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ------------- App Code field with suggestions from the not-yet-uploaded codes -------------
   The App Mapping tab lists the application codes that exist in Asset Detailed but
   are not in the master yet. Those are exactly the codes someone adding a record by
   hand is most likely to be typing, so suggest them here and prefill the header
   from the asset data when one is picked. Free text is still allowed. */
const AppCodeSuggest = ({ value, onChange, onPick, remaining, disabled, fieldCls }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const wrapRef = useRef(null);
    const inputRef = useRef(null);
    // Same hover open/close behaviour as Combo.
    const hoverT = useRef(null);
    useEffect(() => () => clearTimeout(hoverT.current), []);

    const measure = () => {
        const el = inputRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const maxH = 240;
        const spaceBelow = window.innerHeight - r.bottom;
        const up = spaceBelow < maxH + 8 && r.top > spaceBelow;
        setPos({ left: r.left, width: r.width, up, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4 });
    };
    const openNow = () => { if (disabled) return; measure(); setOpen(true); };

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        const onMove = () => measure();
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
        };
    }, [open]);

    const list = useMemo(() => {
        const t = String(value || '').trim().toLowerCase();
        const all = remaining || [];
        if (!t) return all.slice(0, 60);
        return all.filter((r) =>
            [r.appCode, r.engineModel, r.kva, r.segment].some((v) => String(v || '').toLowerCase().includes(t))
        ).slice(0, 60);
    }, [remaining, value]);

    const hoverOpen = () => { clearTimeout(hoverT.current); openNow(); };
    const hoverClose = () => { clearTimeout(hoverT.current); hoverT.current = setTimeout(() => setOpen(false), 220); };

    return (
        <div className="relative" ref={wrapRef} onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
            <input
                ref={inputRef}
                className={`${fieldCls} font-mono`}
                value={value}
                disabled={disabled}
                placeholder="e.g. 6H.8439 or select"
                onChange={(e) => { onChange(e.target.value); open ? measure() : openNow(); }}
                onFocus={openNow}
            />
            {!disabled && (remaining || []).length > 0 && (
                <button type="button" tabIndex={-1} onClick={() => (open ? setOpen(false) : openNow())}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <ChevronDownIcon className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
                </button>
            )}
            {open && pos && (
                <div className="fixed z-[300] rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden"
                    style={{ left: pos.left, width: Math.max(pos.width, 340), ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }) }}>
                    <div className="px-2.5 py-1.5 border-b border-gray-100 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Pending codes from App Mapping · {list.length}
                    </div>
                    <div className="max-h-[200px] overflow-auto qm-scroll">
                        {list.length === 0 ? (
                            <div className="px-3 py-4 text-center text-[11.5px] text-gray-400">
                                No pending code matches — keep typing to add a brand-new code.
                            </div>
                        ) : list.map((r) => (
                            <div key={r.appCode} onMouseDown={(e) => { e.preventDefault(); onPick(r); setOpen(false); }}
                                className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-indigo-50/60 border-b border-gray-50 last:border-0">
                                <span className="font-mono text-[12px] font-bold text-gray-800 whitespace-nowrap">{r.appCode}</span>
                                <span className="text-[11px] text-gray-500 truncate">{r.engineModel || '—'}</span>
                                <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-[10.5px] text-gray-400 whitespace-nowrap">{cleanKva(r.kva) || '—'} KVA</span>
                                    <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold" style={{ backgroundColor: themeSoft, color: themeColor }}>{r.assets}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ------------- App Mapping (Asset Detailed codes vs master) ------------- */
const AppMapping = ({ onMasterChanged }) => {
    const [map, setMap] = useState(null);       // { uniqueAssetCodes, uploadedCount, remainingCount, remaining[] }
    const [rows, setRows] = useState([]);       // master rows — for modal dropdown options + duplicate check
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [err, setErr] = useState('');
    const [q, setQ] = useState('');
    const [adding, setAdding] = useState(null); // remaining row being added -> prefills the modal

    const load = useCallback(async (initial = false, silent = false) => {
        if (initial) setLoading(true); else setRefreshing(true);
        setErr('');
        try {
            const [mp, r, s] = await Promise.all([getAppMapping(), getAppCodes(), getServices()]);
            setMap(mp); setRows(r); setServices(s);
            if (!initial && !silent) toast.success('Refreshed');
        } catch (e) {
            setErr(e.message || 'Could not load app mapping');
        } finally { setLoading(false); setRefreshing(false); }
    }, []);
    useEffect(() => { load(true); }, [load]);

    // Same dropdown options the Master Data editor uses.
    const opts = useMemo(() => {
        const distinct = (fn) => [...new Set(rows.map(fn).map((v) => String(v ?? '').trim()).filter(Boolean))];
        const distinctP = (fn) => [...new Set(rows.flatMap((a) => a.parts).map(fn).map((v) => String(v ?? '').trim()).filter(Boolean))];
        return {
            segOpts: [...new Set([...distinct((a) => a.segment), 'PG', 'Industrial'])],
            kvaOpts: numSort([...new Set(distinct((a) => a.kva))]),
            emiOpts: [...new Set([...distinct((a) => a.emission), 'CPCB IV+'])],
            actOpts: ['R', 'C', 'T'],
            hrsOpts: numSort([...new Set([...distinctP((p) => p.serviceHours), ...services.map((s) => s.hours)])]),
        };
    }, [rows, services]);
    const existingCodes = useMemo(() => new Set(rows.map((a) => a.appCode)), [rows]);
    // Full master record (with parts) keyed by normalized code — the Edit button
    // needs the complete record to open the form in edit mode.
    const masterByCode = useMemo(() => {
        const m = new Map();
        rows.forEach((a) => m.set(String(a.appCode || '').trim().toLowerCase(), a));
        return m;
    }, [rows]);
    // { rec, hours } — `hours` seeds the editor's Svc Hrs filter, so the pencil in
    // a coverage column opens the record showing only that service interval.
    const [editing, setEditing] = useState(null);
    const [viewing, setViewing] = useState(null);  // master record being previewed (read-only)
    const openEdit = (r, hours = '') => {
        const rec = masterByCode.get(String(r.appCode || '').trim().toLowerCase());
        if (rec) setEditing({ rec, hours: String(hours || '') });
    };
    const openView = (r) => {
        const rec = masterByCode.get(String(r.appCode || '').trim().toLowerCase());
        if (rec) setViewing(rec);
    };
    // Latest commissioning date + emission norm per asset code (from the mapping
    // payload). Emission now comes from Asset Detailed's EMISSION NORM column.
    const commissioningByCode = useMemo(() => {
        const m = new Map();
        (map?.codes || []).forEach((r) => m.set(String(r.appCode || '').trim().toLowerCase(), r.commissioning || ''));
        return m;
    }, [map]);
    const assetEmissionByCode = useMemo(() => {
        const m = new Map();
        (map?.codes || []).forEach((r) => m.set(String(r.appCode || '').trim().toLowerCase(), r.emission || ''));
        return m;
    }, [map]);
    const commissioningOf = (r) => commissioningByCode.get(String(r.appCode || '').trim().toLowerCase()) || '';
    // Prefer the asset-data emission; fall back to the master record's emission.
    const emissionOf = (r) => {
        const k = String(r.appCode || '').trim().toLowerCase();
        return assetEmissionByCode.get(k) || masterByCode.get(k)?.emission || '';
    };

    // Field-scoped search: default App Code; picking another field searches only it.
    const SEARCH_FIELDS = [
        { key: 'appCode', label: 'App Code', get: (r) => r.appCode },
        { key: 'engineModel', label: 'Engine Model', get: (r) => r.engineModel },
        { key: 'segment', label: 'Segment', get: (r) => r.segment },
        { key: 'kva', label: 'KVA Rating', get: (r) => cleanKva(r.kva) },
        { key: 'emission', label: 'Emission Norm', get: (r) => emissionOf(r) },
        { key: 'commissioning', label: 'Commissioning Date', get: (r) => fmtDMY(commissioningOf(r)) },
    ];
    const [searchField, setSearchField] = useState('appCode');

    // Which stat card is open: 'master' | 'uploaded' | 'notmatched' | 'remaining' | 'all' (default).
    const [view, setView] = useState('all');
    const VIEWS = {
        master: { title: 'Total in Master', empty: 'No records in the master yet.' },
        uploaded: { title: 'Matched in Master (Uploaded)', empty: 'No asset code has been uploaded to the master yet.' },
        notmatched: { title: 'Not Matched — in master but not in asset data', empty: 'Every master code matches an asset application code.' },
        remaining: { title: 'Remaining Application Codes', empty: 'No remaining codes match your search.' },
        all: { title: 'All Application Codes', empty: 'No asset application codes found.' },
    };

    // One list per view. Asset-side views slice the `codes` payload; master-side
    // views ('master' / 'notmatched') are the master records shaped like asset
    // rows so the one table below renders them all the same way. Shared with the
    // Export button, which walks every view (each stat box becomes one sheet).
    const rowsForView = useCallback((v) => {
        const all = map?.codes || [];
        if (v === 'uploaded') return all.filter((r) => r.uploaded);
        if (v === 'remaining') return all.filter((r) => !r.uploaded);
        if (v === 'master' || v === 'notmatched') {
            const assetBy = new Map(all.map((r) => [String(r.appCode || '').trim().toLowerCase(), r]));
            const masterRows = rows.map((a) => {
                const m = assetBy.get(String(a.appCode || '').trim().toLowerCase());
                return {
                    appCode: a.appCode, engineModel: a.engineModel, segment: a.segment,
                    kva: a.kva, assets: m ? m.assets : 0, uploaded: !!m,
                };
            });
            return v === 'notmatched' ? masterRows.filter((r) => !r.uploaded) : masterRows;
        }
        return all;
    }, [map, rows]);
    const source = useMemo(() => rowsForView(view), [rowsForView, view]);

    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t) return source;
        const getter = (SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).get;
        return source.filter((r) => String(getter(r) || '').toLowerCase().includes(t));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [source, q, searchField, commissioningByCode, assetEmissionByCode, masterByCode]);

    // A row is in the master (so editable) when the master-side view built it, or
    // when the asset-side view flagged it as uploaded. Rows not in the master get
    // the Add button instead.
    const rowInMaster = (r) => view === 'master' || view === 'notmatched' || !!r.uploaded;

    // Service-coverage columns (like the Service Coverage Matrix): one column per
    // service hour; a code gets ✓ when its master record has parts for that
    // service, ✗ otherwise (codes not in the master are all ✗).
    const svcCols = useMemo(() => services.slice().sort((a, b) => (parseFloat(a.hours) || 0) - (parseFloat(b.hours) || 0)), [services]);
    const svcCoverage = useMemo(() => {
        const m = new Map();
        rows.forEach((a) => m.set(String(a.appCode || '').trim().toLowerCase(), new Set(a.parts.map((p) => partService(services, p).id))));
        return m;
    }, [rows, services]);

    // Export ALL data of every stat box — one workbook, one sheet per box, with
    // the same columns each box shows on screen (search/sort filters ignored).
    // Gated by canExportExcel() like every other Export button in the app.
    const exportXlsx = () => {
        const wb = XLSX.utils.book_new();
        const EXPORT_VIEWS = [
            ['all', 'All Application Codes'],
            ['remaining', 'Remaining'],
            ['master', 'Total in Master'],
            ['uploaded', 'Match in Master'],
            ['notmatched', 'Not Matched'],
        ];
        EXPORT_VIEWS.forEach(([v, sheetName]) => {
            const withSvc = v !== 'remaining';           // Remaining shows no coverage columns on screen
            const masterSide = v === 'master' || v === 'notmatched';
            // For asset-side boxes the flag means "already in the master"; for
            // master-side boxes it means "matched in the asset data".
            const flagLabel = masterSide ? 'In Asset Data' : 'In Master';
            const aoa = [[
                'Sr.', 'App Code', 'Engine Model', 'Segment', 'KVA Rating', 'Emission Norm',
                'Commissioning Date', 'Assets', flagLabel,
                ...(withSvc ? svcCols.map((c) => c.short) : []),
            ]];
            rowsForView(v).forEach((r, i) => {
                const ids = svcCoverage.get(String(r.appCode || '').trim().toLowerCase());
                aoa.push([
                    i + 1, r.appCode, r.engineModel || '', r.segment || '',
                    assetKva(r.kva) ? `${assetKva(r.kva)} KVA` : '',
                    emissionOf(r) || '',
                    commissioningOf(r) ? fmtDMY(commissioningOf(r)) : '',
                    r.assets ?? 0,
                    r.uploaded ? 'Yes' : 'No',
                    ...(withSvc ? svcCols.map((c) => (ids && ids.has(c.id) ? 'Yes' : 'No')) : []),
                ]);
            });
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [
                { wch: 5 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 11 }, { wch: 13 },
                { wch: 15 }, { wch: 7 }, { wch: 12 },
                ...(withSvc ? svcCols.map(() => ({ wch: 8 })) : []),
            ];
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        XLSX.writeFile(wb, 'App_Mapping.xlsx');
    };

    const { sort, toggle } = useSort();
    const remaining = useSortedRows(filtered, sort, {
        appCode: (r) => r.appCode,
        engineModel: (r) => r.engineModel,
        segment: (r) => r.segment,
        kva: (r) => cleanKva(r.kva),
        emission: (r) => emissionOf(r),
        commissioning: (r) => commissioningOf(r),   // ISO 'YYYY-MM-DD' sorts lexically = chronologically
        assets: (r) => r.assets,
        uploaded: (r) => (r.uploaded ? 0 : 1),
    });

    // Lazy row rendering: only the first chunk mounts (the coverage columns make
    // each row expensive); "Show more" reveals the rest. Resets when the data
    // slice changes. Pure display concern — sorting/filtering logic untouched.
    const ROWS_CHUNK = 100;
    const [rowLimit, setRowLimit] = useState(ROWS_CHUNK);
    useEffect(() => { setRowLimit(ROWS_CHUNK); }, [remaining]);
    const visibleRows = rowLimit < remaining.length ? remaining.slice(0, rowLimit) : remaining;

    // Totals for the pinned footer row — computed over the WHOLE filtered list,
    // not just the chunk currently mounted, so "Show more" never changes them.
    const totals = useMemo(() => ({
        codes: remaining.length,
        assets: remaining.reduce((s, r) => s + (Number(r.assets) || 0), 0),
    }), [remaining]);

    // Second horizontal scrollbar ABOVE the table, kept in lockstep with the
    // table's own one, so the wide table can be panned left-to-right without
    // first scrolling to the bottom. The spacer matches the table's scroll width.
    const topScrollRef = useRef(null);
    const bodyScrollRef = useRef(null);
    const [tableW, setTableW] = useState(0);
    useEffect(() => {
        const el = bodyScrollRef.current;
        if (!el) return;
        const measure = () => setTableW(el.scrollWidth);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => ro.disconnect();
    }, [remaining, view, svcCols]);
    const mirrorScroll = (from, to) => () => {
        if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft)
            to.current.scrollLeft = from.current.scrollLeft;
    };

    if (loading) return <Loading />;
    if (err) return <ErrorBox msg={err} onRetry={() => load(true)} />;

    // Clicking a card opens that slice of the data in the table below.
    const stat = (id, label, value, Icon, color, soft, hint) => {
        const on = view === id;
        return (
            <button type="button" onClick={() => { setView(id); setQ(''); }}
                title={hint || `Show ${label.toLowerCase()}`}
                className={`rounded-xl border bg-white px-3 py-2 shadow-sm flex items-center gap-2.5 text-left transition ${on ? '' : 'border-gray-200 hover:border-gray-300'}`}
                style={on ? { borderColor: themeColor, boxShadow: `0 0 0 2px ${themeColor}`, background: themeSoft } : undefined}>
                <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: on ? '#fff' : soft }}>
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
                <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600 truncate">{label}</div>
                    <div className="text-[17px] font-extrabold leading-tight text-black">{value}</div>
                </div>
            </button>
        );
    };

    return (
        <div>
            {/* Stat cards — each opens its slice of the data in the table below */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-2.5">
                {stat('all', 'All Application Codes', map?.uniqueAssetCodes ?? 0, Squares2X2Icon, '#6d28d9', 'rgba(109,40,217,.10)',
                    'Every unique app code found in Asset Detailed')}
                {stat('remaining', 'Remaining', map?.remainingCount ?? 0, ExclamationTriangleIcon, '#b45309', 'rgba(180,83,9,.10)',
                    'Asset app codes not added to the master yet')}
                {stat('master', 'Total in Master', map?.masterTotal ?? rows.length, CircleStackIcon, themeColor, themeSoft,
                    'Every application code currently stored in the master')}
                {stat('uploaded', 'Match in Master', map?.uploadedCount ?? 0, CheckCircleIcon, '#15803d', 'rgba(21,128,61,.10)',
                    'Master codes that match an app code in Asset Detailed')}
                {stat('notmatched', 'Not Matched', map?.masterOnlyCount ?? 0, XMarkIcon, '#be123c', 'rgba(190,18,60,.10)',
                    'Master codes that match no app code in the asset data')}
            </div>

            {/* The table follows whichever card is open */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 max-md:px-2">
                    <ArrowsRightLeftIcon className="h-4 w-4" style={{ color: themeColor }} />
                    <p className="text-[13px] font-bold text-gray-800">{VIEWS[view].title}</p>
                    <span className="text-[11px] text-gray-400 font-mono">{remaining.length} of {source.length}</span>
                    <div className="ml-auto flex items-center gap-2 max-sm:w-full max-sm:flex-wrap">
                        <select value={searchField} onChange={(e) => setSearchField(e.target.value)} title="Search field"
                            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[12px] text-gray-700 outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition">
                            {SEARCH_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        <div className="relative max-sm:flex-1">
                            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input value={q} onChange={(e) => setQ(e.target.value)}
                                placeholder={`Search ${(SEARCH_FIELDS.find((f) => f.key === searchField) || SEARCH_FIELDS[0]).label.toLowerCase()}`}
                                className="w-56 max-sm:w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2.5 py-1.5 text-[12px] outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition" />
                        </div>
                        {canExportExcel() && (
                            <button onClick={exportXlsx} title="Export every box (all / remaining / master / matched / not matched) into one Excel file"
                                className="export-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                                style={{ backgroundColor: themeColor }}>
                                <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
                            </button>
                        )}
                        <button onClick={() => load(false)} title="Refresh"
                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
                            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {view === 'remaining' && (map?.remainingCount ?? 0) === 0 ? (
                    <div className="py-12 text-center">
                        <CheckCircleIcon className="h-9 w-9 mx-auto text-emerald-500" />
                        <p className="mt-2 text-[13px] font-semibold text-gray-700">All asset application codes are uploaded.</p>
                        <p className="text-[11.5px] text-gray-400">Every unique code from Asset Detailed already exists in the master.</p>
                    </div>
                ) : remaining.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-gray-400">{q.trim() ? 'No codes match your search.' : VIEWS[view].empty}</div>
                ) : (
                    <>
                    {/* Top horizontal scrollbar — spacer as wide as the table, mirrored with it */}
                    <div ref={topScrollRef} onScroll={mirrorScroll(topScrollRef, bodyScrollRef)} className="overflow-x-auto overflow-y-hidden qm-scroll border-b border-gray-100">
                        <div style={{ width: tableW }} className="h-px" />
                    </div>
                    <div ref={bodyScrollRef} onScroll={mirrorScroll(bodyScrollRef, topScrollRef)} className="overflow-auto qm-scroll max-h-[74vh]">
                        <table className="min-w-[980px] w-full border-collapse text-[12px]">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                                    <th className="px-3 py-2 border border-gray-200 bg-gray-50 text-center w-12">Sr.</th>
                                    <SortTh label="App Code" sortKey="appCode" sort={sort} onSort={toggle} className="px-3 py-2 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="Engine Model" sortKey="engineModel" sort={sort} onSort={toggle} className="px-3 py-2 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="Segment" sortKey="segment" sort={sort} onSort={toggle} className="px-3 py-2 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="KVA Rating" sortKey="kva" sort={sort} onSort={toggle} className="px-3 py-2 border border-gray-200 bg-gray-50 text-center" />
                                    <SortTh label="Emission Norm" sortKey="emission" sort={sort} onSort={toggle} className="px-2 py-2 border border-gray-200 bg-gray-50 text-center whitespace-nowrap" />
                                    <SortTh label="Commissioning Date" sortKey="commissioning" sort={sort} onSort={toggle} wrap className="px-2 py-2 border border-gray-200 bg-gray-50 text-center w-20" />
                                    <SortTh label="Assets" sortKey="assets" sort={sort} onSort={toggle} className="px-3 py-2 border border-gray-200 bg-gray-50 text-center" />
                                    {view !== 'remaining' && svcCols.map((c) => (
                                        <th key={c.id} title={c.name} className="px-2 py-2 border border-gray-200 bg-gray-50 text-center whitespace-nowrap">{c.short}</th>
                                    ))}
                                    <th className="px-3 py-2 border border-gray-200 bg-gray-50 text-center w-24">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((r, i) => (
                                    <tr key={r.appCode} className="hover:bg-indigo-50/40 transition">
                                        <td className="px-3 py-2 border border-gray-200 font-mono font-semibold text-gray-500 text-center">{i + 1}</td>
                                        <td className="px-3 py-2 border border-gray-200 font-mono font-semibold text-gray-800 whitespace-nowrap">
                                            {rowInMaster(r) ? (
                                                <button type="button" onClick={() => openView(r)}
                                                    title="View this application code's parts / kits"
                                                    className="font-mono font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80"
                                                    style={{ color: themeColor }}>
                                                    {r.appCode}
                                                </button>
                                            ) : r.appCode}
                                        </td>
                                        <td className="px-3 py-2 border border-gray-200 text-gray-600">{r.engineModel || '—'}</td>
                                        <td className="px-3 py-2 border border-gray-200 text-center text-gray-600">{r.segment || '—'}</td>
                                        <td className="px-3 py-2 border border-gray-200 text-center font-mono text-gray-600">{assetKva(r.kva) ? `${assetKva(r.kva)} KVA` : '—'}</td>
                                        <td className="px-3 py-2 border border-gray-200 text-center text-gray-600 whitespace-nowrap">{emissionOf(r) || '—'}</td>
                                        <td className="px-3 py-2 border border-gray-200 text-center font-mono text-gray-600 whitespace-nowrap">{commissioningOf(r) ? fmtDMY(commissioningOf(r)) : '—'}</td>
                                        <td className="px-3 py-2 border border-gray-200 text-center">
                                            <span className="inline-block min-w-[30px] rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: themeSoft, color: themeColor }}>{r.assets}</span>
                                        </td>
                                        {view !== 'remaining' && svcCols.map((c) => {
                                            const ids = svcCoverage.get(String(r.appCode || '').trim().toLowerCase());
                                            const has = !!(ids && ids.has(c.id));
                                            return (
                                                <td key={c.id} className="px-2 py-2 border border-gray-200 text-center">
                                                    <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
                                                        {has
                                                            ? <span className="font-extrabold text-[15px] text-green-600">✓</span>
                                                            : <span className="font-medium text-gray-300">✗</span>}
                                                        {/* Edit just this service interval — opens the editor with its
                                                            Svc Hrs filter already set to this column. */}
                                                        {has && rowInMaster(r) && (
                                                            <button type="button" onClick={() => openEdit(r, c.hours)}
                                                                title={`Edit only the ${c.hours} Hr parts and kits of ${r.appCode}`}
                                                                className="rounded p-0.5 text-gray-400 hover:bg-indigo-50 transition"
                                                                onMouseEnter={(e) => { e.currentTarget.style.color = themeColor; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}>
                                                                <PencilSquareIcon className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                        <td className="px-3 py-2 border border-gray-200 text-center">
                                            {rowInMaster(r) ? (
                                                <button onClick={() => openEdit(r)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 transition hover:bg-gray-50 hover:border-gray-400">
                                                    <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
                                                </button>
                                            ) : (
                                                <button onClick={() => setAdding(r)}
                                                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-white transition hover:opacity-90"
                                                    style={{ backgroundColor: themeColor }}>
                                                    <PlusIcon className="h-3.5 w-3.5" /> Add
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {/* Pinned totals — stays parked at the bottom of the scroll
                                box while the rows scroll underneath it. */}
                            <tfoot className="sticky bottom-0 z-20">
                                <tr className="text-[11.5px] font-extrabold text-gray-800">
                                    <td colSpan={7} className="px-3 py-2 border border-gray-300 bg-gray-100 sticky bottom-0 text-right uppercase tracking-wider whitespace-nowrap">
                                        Total App Codes
                                        <span className="ml-2 inline-block rounded-md px-2 py-0.5 font-mono text-[12px]"
                                            style={{ backgroundColor: themeColor, color: '#fff' }}>{totals.codes.toLocaleString()}</span>
                                    </td>
                                    <td className="px-3 py-2 border border-gray-300 bg-gray-100 sticky bottom-0 text-center">
                                        <span className="inline-block min-w-[30px] rounded-md px-2 py-0.5 font-mono text-[12px]"
                                            style={{ backgroundColor: themeColor, color: '#fff' }}>{totals.assets.toLocaleString()}</span>
                                    </td>
                                    {view !== 'remaining' && svcCols.map((c) => (
                                        <td key={c.id} className="px-2 py-2 border border-gray-300 bg-gray-100 sticky bottom-0" />
                                    ))}
                                    <td className="px-3 py-2 border border-gray-300 bg-gray-100 sticky bottom-0" />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    {remaining.length > rowLimit && (
                        <div className="flex justify-center py-2 border-t border-gray-100 bg-white">
                            <button onClick={() => setRowLimit((l) => l + ROWS_CHUNK)}
                                className="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition hover:opacity-90"
                                style={{ backgroundColor: themeSoft, color: themeColor }}>
                                Show more ({remaining.length - rowLimit} remaining)
                            </button>
                        </div>
                    )}

                    {/* Floating scroll to top / bottom buttons — draggable horizontally along the bottom */}
                    <ScrollArrows storageKey="appMappingScrollBtnsPos" targetRef={bodyScrollRef} />
                    </>
                )}
                <div className="px-4 py-1.5 border-t border-gray-200 bg-white text-[10.5px] text-gray-400">
                    Codes are compared case-insensitively. Use <b className="font-semibold">Add</b> to bring an asset code into the master (prefilled from the asset data), or <b className="font-semibold">Edit</b> to change a code that is already in the master.
                    The small pencil next to a <b className="font-semibold text-green-600">✓</b> opens that code with the editor already filtered to <b className="font-semibold">that service interval only</b> — the filter can be changed (or cleared) from the dropdown at the top of the editor.
                </div>
            </div>

            {adding && (
                <AppFormModal
                    prefill={{
                        appCode: adding.appCode, engineModel: adding.engineModel || '',
                        segment: assetSegment(adding.segment), kva: assetKva(adding.kva),
                        emission: emissionOf(adding) || '',
                        systemAppCode: adding.appCode ? `${adding.appCode}...` : '',
                    }}
                    opts={opts} existing={existingCodes} remaining={map?.remaining || []}
                    onClose={() => setAdding(null)}
                    onSave={async (rec) => {
                        await createAppCode(rec);
                        toast.success(`${rec.appCode} added to master`);
                        await load(false, true);
                        onMasterChanged?.(); // host page badge (App codes count) stays live
                    }} />
            )}

            {editing && (
                <AppFormModal
                    initial={editing.rec}
                    initialHours={editing.hours}
                    opts={opts} existing={existingCodes} remaining={map?.remaining || []}
                    onClose={() => setEditing(null)}
                    onSave={async (rec) => {
                        await updateAppCode(editing.rec.appCode, rec);
                        toast.success(`${rec.appCode} updated`);
                        await load(false, true);
                        onMasterChanged?.(); // host page badge / coverage stay live
                    }} />
            )}

            {viewing && (
                <AppViewModal
                    record={viewing}
                    services={services}
                    emission={emissionOf(viewing)}
                    commissioning={commissioningByCode.get(String(viewing.appCode || '').trim().toLowerCase()) || ''}
                    onClose={() => setViewing(null)}
                    onEdit={() => { const rec = viewing; setViewing(null); setEditing({ rec, hours: '' }); }} />
            )}
        </div>
    );
};

/* ------------- Add / Edit modal with parts + kits editor ------------- */
// LEGACY (import only): in the uploaded master file the kit columns still sit on
// the part rows — one kit merged down a run of rows, its values on the run's
// first row and blanks below, and a row repeating its own part number in the kit
// columns marking a loose part. That is how the importer still identifies which
// parts formed a kit; once imported the kit is a standalone record.
// NOTE: altServiceHours deliberately does NOT count as "has kit data" — the file
// fills it on every row, including the blank ones a kit merges down across.
const kitHasData = (p) => !!(String(p.altPartNo || '').trim() || String(p.altDesc || '').trim() || String(p.altQty || '').trim() || String(p.altAction || '').trim());
const isLoosePart = (p) => String(p.altPartNo || '').trim() === String(p.partNumber || '').trim();

// File rows (with the legacy per-row kit columns) -> standalone kits, each with
// its OWN copy of the part lines it covered.
const kitsFromFileRows = (fileParts) => {
    const kits = [];
    let cur = null;
    (fileParts || []).forEach((p) => {
        const copy = {
            partNumber: p.partNumber || '', partDesc: p.partDesc || '',
            qty: p.qty || '', action: p.action || '', serviceHours: p.serviceHours || '',
        };
        if (kitHasData(p) && isLoosePart(p)) cur = null;               // loose — ends the run above
        else if (kitHasData(p)) {
            cur = {
                kitNumber: p.altPartNo || '', kitDesc: p.altDesc || '', qty: p.altQty || '',
                action: p.altAction || '', serviceHours: p.altServiceHours || '', parts: [copy],
            };
            kits.push(cur);
        } else if (cur) cur.parts.push(copy);                          // blank row — part of the kit above
    });
    return kits;
};

/* ---------------- Editor model ----------------
   Parts and kits are two independent lists. A kit holds its own part lines
   (copied when it was built), so nothing points from a part to a kit or back.
   __uid / __id are UI identity only and never reach the API. */
const blankPart = (uid) => ({ __uid: uid, partNumber: '', partDesc: '', qty: '1', action: 'R', serviceHours: '500' });
const asLine = (uid, p) => ({
    __uid: uid,
    partNumber: p.partNumber || '', partDesc: p.partDesc || '',
    qty: String(p.qty ?? ''), action: p.action || '', serviceHours: String(p.serviceHours ?? ''),
});

// Stored record -> editor model.
const recordToModel = (rec) => {
    const parts = (rec?.parts?.length ? rec.parts.map((p, i) => asLine(`p${i}`, p)) : [blankPart('p0')]);
    return {
        parts,
        kits: kitsOf(rec).map((k, i) => {
            // `loose` marks a line held by the kit as a loose part; built-in
            // members stay false and are not listed in the edit form.
            const own = (k.parts || []).map((p, j) => ({ ...asLine(`k${i}p${j}`, p), loose: !!p.loose }));
            const held = new Set(own.map((p) => normPn(p.partNumber)).filter(Boolean));
            // Seed the kit's loose list with its OWN copies of every service
            // part it does not hold. The kit's loose parts are snapshots —
            // never linked to the service lines, in either direction.
            const seeded = parts
                .filter((p) => !held.has(normPn(p.partNumber)))
                .map((p, j) => ({ ...p, __uid: `k${i}seed${j}`, loose: true }));
            return {
                __id: `k${i}`,
                number: k.kitNumber || '', desc: k.kitDesc || '',
                qty: String(k.qty ?? ''), action: k.action || '', hours: String(k.serviceHours ?? ''),
                parts: [...own, ...seeded],
            };
        }),
    };
};

// Editor model -> API payload. The part lines no longer carry any kit data.
const modelToPayload = (parts, kits) => ({
    parts: parts.map((p) => ({
        partNumber: p.partNumber.trim(), partDesc: p.partDesc.trim(), qty: String(p.qty).trim(),
        action: p.action.trim(), serviceHours: String(p.serviceHours).trim(), schedule: '',
        altPartNo: '', altDesc: '', altQty: '', altAction: '', altServiceHours: '',
    })),
    kits: kits.map((k) => ({
        kitNumber: k.number.trim(), kitDesc: k.desc.trim(), qty: String(k.qty).trim(),
        action: k.action.trim(), serviceHours: String(k.hours || '').trim(),
        parts: k.parts.map((p) => ({
            partNumber: p.partNumber.trim(), partDesc: p.partDesc.trim(), qty: String(p.qty).trim(),
            action: p.action.trim(), serviceHours: String(p.serviceHours || '').trim(),
            loose: !!p.loose,
        })),
    })),
});

/* ------------- Shared editor styling -------------
   One vocabulary for the whole Add/Edit popup — cards, table chrome, buttons
   and prompts — so the form reads as one surface instead of a stack of
   differently-styled boxes. Used by both AppFormModal and KitBox. */
const INP = 'w-full rounded-md border border-gray-300 px-2 py-1 text-[12px] text-gray-900 bg-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 hover:border-gray-400';
const KIT_INP = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-[12px] text-gray-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 hover:border-gray-400';
const KIT_LBL = 'block text-[9.5px] font-bold uppercase tracking-wider text-gray-500 mb-1';

// Cards
const CARD = 'rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.06)]';
const CARD_HEAD = 'flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 max-md:px-3 max-md:flex-wrap';
const CARD_TITLE = 'text-[11.5px] font-bold uppercase tracking-wider text-gray-900';
const CARD_ICON = 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg';
const PILL = 'rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600';
// Buttons — one height (h-8) everywhere so rows line up.
const BTN_PRIMARY = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_GHOST = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50';
const BTN_DASHED = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-gray-50/70 px-3 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-100 hover:border-gray-400';
const BTN_ICON = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600';
// Tables
const TABLE_WRAP = 'overflow-x-auto qm-scroll rounded-lg border border-gray-200';
const THEAD = 'bg-slate-50/90 text-[9.5px] font-bold uppercase tracking-wider text-gray-500';
const TH = 'px-2.5 py-2 text-left font-bold';
const TR = 'border-t border-gray-100 transition hover:bg-slate-50/70';
const REQ = <span className="text-red-400">*</span>;
// A Yes/No prompt strip.
const PROMPT = 'flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2';

// Everything is mandatory. A part line — a service part or a kit's own copy —
// counts as complete only when all five of its fields are filled.
const partComplete = (p) =>
    p.partNumber.trim() && p.partDesc.trim() && String(p.qty).trim() &&
    p.action.trim() && String(p.serviceHours).trim();
// A kit needs all five of its own fields AND at least one complete part line.
const kitComplete = (k) =>
    k.number.trim() && k.desc.trim() && String(k.qty).trim() && k.action.trim() &&
    String(k.hours || '').trim() &&
    k.parts.length > 0 && k.parts.every(partComplete);

/* ------------- One kit: its details + its OWN part lines -------------
   These part lines are the kit's copies. Editing one, adding a new one or
   deleting one changes only this kit — never the application code's service
   parts, and never another kit that happens to hold the same part number. */
const KitBox = ({ k, index, opts, notAdded = [], onAddLoose, onSet, onSetPart, onDeletePart, onRemove, onDone, doneLabel = 'OK' }) => {
    const ready = kitComplete(k);
    // The kit's built-in members (copied when it was built) are NOT listed —
    // they come with the kit. The loose table lists ONLY the kit's own loose
    // COPIES: fully editable and deletable, and never linked to the service
    // list — editing a service part does not touch them, editing them does not
    // touch the service part. `notAdded` holds the service parts this kit does
    // not hold; the strip below asks whether to add, and Yes opens a checkbox
    // picker to choose which of them to copy in.
    const members = k.parts.filter((p) => !p.loose);
    const looseIn = k.parts.filter((p) => p.loose);
    const [askAdd, setAskAdd] = useState(false);
    const [pick, setPick] = useState({});
    const picked = notAdded.filter((p) => pick[p.__uid]);
    const allPicked = notAdded.length > 0 && notAdded.every((p) => pick[p.__uid]);
    const closePicker = () => { setAskAdd(false); setPick({}); };
    const addPicked = () => {
        if (!picked.length) return;
        onAddLoose(picked.map((p) => p.__uid));
        closePicker();
    };
    return (
        <div className={`${CARD} mb-2.5 overflow-hidden border-l-[3px]`} style={{ borderLeftColor: themeColor }}>
            {/* Kit header — badge, line count, status, remove */}
            <div className={CARD_HEAD}>
                <span className="inline-flex h-6 items-center rounded-lg px-2 text-[10.5px] font-extrabold uppercase tracking-wider text-white"
                    style={{ backgroundColor: themeColor }}>
                    Kit {index + 1}
                </span>
                <span className={PILL}>{members.length} part line{members.length === 1 ? '' : 's'} in kit</span>
                {/* The kit's own loose copies — exactly the rows in the list below. */}
                <span className={PILL}>{looseIn.length} loose</span>
                {ready ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircleIcon className="h-3 w-3" /> Complete
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        <ExclamationTriangleIcon className="h-3 w-3" /> Fill the kit details and every part line
                    </span>
                )}
                {onRemove && (
                    <button type="button" onClick={onRemove} title="Delete this kit — the service parts are untouched"
                        className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 hover:border-red-300">
                        <TrashIcon className="h-3.5 w-3.5" /> Remove kit
                    </button>
                )}
            </div>

            <div className="px-4 py-3 max-md:px-3">
                <div className="grid grid-cols-[1fr_2.2fr_.45fr_.65fr_.65fr] gap-2.5 max-md:grid-cols-2 max-sm:grid-cols-1">
                    <div>
                        <label className={KIT_LBL}>Kit Number {REQ}</label>
                        <input className={`${KIT_INP} font-mono`} value={k.number} onChange={(e) => onSet('number', e.target.value)} placeholder="e.g. 3H.019.11.0.SP" />
                    </div>
                    <div>
                        <label className={KIT_LBL}>Kit Description {REQ}</label>
                        <input className={KIT_INP} value={k.desc} onChange={(e) => onSet('desc', e.target.value)} placeholder="e.g. 50 Hrs - A Check Maintenance Kit" />
                    </div>
                    <div>
                        <label className={KIT_LBL}>Qty {REQ}</label>
                        <input className={`${KIT_INP} font-mono text-center`} value={k.qty} onChange={(e) => onSet('qty', e.target.value)} />
                    </div>
                    <div>
                        <label className={KIT_LBL}>Action {REQ}</label>
                        <Combo value={k.action} onChange={(v) => onSet('action', v)} options={opts.actOpts} mono fieldCls={KIT_INP} />
                    </div>
                    <div>
                        <label className={KIT_LBL}>Svc Hrs {REQ}</label>
                        <Combo value={k.hours || ''} onChange={(v) => onSet('hours', v)} options={opts.hrsOpts} mono fieldCls={KIT_INP} />
                    </div>
                </div>

                {/* ---- Loose parts — the kit's own copies, editable in place ----
                    Independent snapshots: no link to the service list in either
                    direction. Every row has a delete; a deleted part drops to
                    the "not added" strip below, addable again from there. The
                    kit's built-in members are not listed — they come with the
                    kit. */}
                <div className="mt-3 mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">Loose parts</span>
                </div>
                <div className={TABLE_WRAP}>
                    <table className="min-w-[760px] w-full border-collapse text-[12px]">
                        <thead>
                            <tr className={THEAD}>
                                <th className={`${TH} w-44`}>Part Number</th>
                                <th className={TH}>Description</th>
                                <th className={`${TH} w-16 text-center`}>Qty</th>
                                <th className={`${TH} w-20 text-center`}>Action</th>
                                <th className={`${TH} w-24 text-center`}>Svc Hrs</th>
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {looseIn.map((p) => (
                                <tr key={p.__uid} className="border-t border-gray-100">
                                    <td className="px-1.5 py-0.5"><input className={`${INP} font-mono`} value={p.partNumber} onChange={(e) => onSetPart(p.__uid, 'partNumber', e.target.value)} /></td>
                                    <td className="px-1.5 py-0.5"><input className={INP} value={p.partDesc} onChange={(e) => onSetPart(p.__uid, 'partDesc', e.target.value)} /></td>
                                    <td className="px-1.5 py-0.5"><input className={`${INP} font-mono text-center`} value={p.qty} onChange={(e) => onSetPart(p.__uid, 'qty', e.target.value)} /></td>
                                    <td className="px-1.5 py-0.5"><Combo value={p.action} onChange={(v) => onSetPart(p.__uid, 'action', v)} options={opts.actOpts} mono fieldCls={INP} /></td>
                                    <td className="px-1.5 py-0.5"><Combo value={p.serviceHours} onChange={(v) => onSetPart(p.__uid, 'serviceHours', v)} options={opts.hrsOpts} mono fieldCls={INP} /></td>
                                    <td className="px-1.5 py-0.5 text-center">
                                        <button type="button" onClick={() => onDeletePart(p.__uid)} title="Remove this loose part from the kit — you can add it back from the strip below"
                                            className={BTN_ICON}>
                                            <TrashIcon className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {looseIn.length === 0 && (
                                <tr><td colSpan={6} className="text-center text-gray-400 py-4 text-[12px]">
                                    No loose parts in this kit — add them from the strip below.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

            {/* ---- Last: the "not added" question + the kit's Done -----------
                The service parts this kit does not hold. First a Yes/No — Yes
                opens a checkbox picker to choose WHICH of them to copy into the
                kit as loose parts. */}
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    {onAddLoose && notAdded.length > 0 && !askAdd && (
                        <span className={`${PROMPT} w-full`}>
                            <span className="text-[12px] font-semibold text-gray-800">
                                {notAdded.length === 1
                                    ? `1 part is not in this kit's loose parts. Do you want to add it?`
                                    : `${notAdded.length} parts are not in this kit's loose parts. Do you want to add them?`}
                            </span>
                            <span className="rounded-full bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-gray-600">
                                {notAdded.map((p) => p.partNumber).join(', ')}
                            </span>
                            <button type="button" onClick={() => { setPick({}); setAskAdd(true); }}
                                className="inline-flex h-7 items-center justify-center rounded-lg px-3 text-[11.5px] font-semibold text-white shadow-sm transition hover:opacity-90"
                                style={{ backgroundColor: themeColor }}>
                                Yes
                            </button>
                        </span>
                    )}
                    {onAddLoose && notAdded.length > 0 && askAdd && (
                        <div className="w-full rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5">
                            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: themeColor }}>Select the parts to add in this kit's loose parts</span>
                                <span className="text-[10.5px] text-gray-500">they are copied in — the service list above is left alone</span>
                            </div>
                            <div className={`${TABLE_WRAP} mb-2 bg-white`}>
                                <table className="min-w-[680px] w-full border-collapse text-[12px]">
                                    <thead>
                                        <tr className={THEAD}>
                                            <th className="px-2.5 py-1.5 text-center w-9">
                                                <span onClick={() => setPick(allPicked ? {} : Object.fromEntries(notAdded.map((p) => [p.__uid, true])))}
                                                    title="Select all / none"
                                                    className="inline-flex h-[15px] w-[15px] cursor-pointer items-center justify-center rounded border border-gray-300 bg-white align-middle">
                                                    {allPicked && <CheckIcon className="h-2.5 w-2.5" style={{ color: themeColor }} />}
                                                </span>
                                            </th>
                                            <th className={`${TH} w-44`}>Part Number</th>
                                            <th className={TH}>Description</th>
                                            <th className={`${TH} w-14 text-center`}>Qty</th>
                                            <th className={`${TH} w-16 text-center`}>Action</th>
                                            <th className={`${TH} w-20 text-center`}>Svc Hrs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notAdded.map((p) => {
                                            const on = !!pick[p.__uid];
                                            return (
                                                <tr key={p.__uid} onClick={() => setPick((c) => ({ ...c, [p.__uid]: !c[p.__uid] }))}
                                                    className={`border-t border-gray-100 cursor-pointer transition ${on ? 'bg-indigo-50/70' : 'hover:bg-slate-50/70'}`}>
                                                    <td className="px-2.5 py-1 text-center">
                                                        <span className={`inline-flex h-[15px] w-[15px] items-center justify-center rounded border align-middle transition ${on ? 'bg-[#2f3192] border-[#2f3192]' : 'border-gray-300 bg-white'}`}>
                                                            {on && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                                                        </span>
                                                    </td>
                                                    <td className="px-2.5 py-1 font-mono text-gray-800 whitespace-nowrap">{p.partNumber || '—'}</td>
                                                    <td className="px-2.5 py-1 text-gray-600">{p.partDesc || '—'}</td>
                                                    <td className="px-2.5 py-1 text-center text-gray-700">{p.qty || '—'}</td>
                                                    <td className="px-2.5 py-1 text-center"><Chip a={p.action} /></td>
                                                    <td className="px-2.5 py-1 text-center font-mono text-gray-700">{p.serviceHours || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-gray-600">{picked.length} of {notAdded.length} selected</span>
                                <div className="ml-auto flex items-center gap-2">
                                    <button type="button" onClick={closePicker} className={BTN_GHOST}>Cancel</button>
                                    <button type="button" disabled={!picked.length} onClick={addPicked}
                                        title={picked.length ? `Copy the ${picked.length} ticked part${picked.length === 1 ? '' : 's'} into Kit ${index + 1} as loose parts` : 'Tick a part first'}
                                        className={`${BTN_PRIMARY} px-4`} style={{ backgroundColor: themeColor }}>
                                        <PlusIcon className="h-3.5 w-3.5" /> Add parts
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {onDone && (
                        <button type="button" disabled={!ready}
                            title={ready ? 'Done — this kit is complete' : 'Fill Kit Number, Description, Qty, Action and Svc Hrs, and every field of its part lines'}
                            onClick={onDone}
                            className={`${BTN_PRIMARY} ml-auto px-5`} style={{ backgroundColor: themeColor }}>
                            <CheckIcon className="h-3.5 w-3.5" /> {doneLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ------------- Read-only preview of one master app code (from App Mapping) -------------
   Uses the SAME sheet layout as the Master Data tab: each kit lists its own part
   copies (kit details on the block's first row only), then the loose parts. */
const AppViewModal = ({ record, services = [], emission, commissioning, onClose, onEdit }) => {
    const a = record || {};
    const srows = sheetRowsOf(a);
    const span = srows.length;
    const appTd = 'px-3 py-1 border border-gray-200 align-middle bg-white';

    return (
        <div className="fixed inset-0 z-[120] flex justify-center overflow-y-auto p-4 max-md:p-2" style={{ background: 'rgba(20,26,32,.55)' }}>
            <div className="msm-modal bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-auto max-xl:max-w-[95vw] overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 text-white max-md:px-3"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/15 flex-shrink-0">
                        <DocumentTextIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-bold leading-tight">{a.appCode}</h3>
                        <p className="text-[11px] text-white/70 leading-tight">Application code details — view only</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={onEdit}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 text-[12px] font-semibold transition">
                            <PencilSquareIcon className="h-4 w-4" /> Edit
                        </button>
                        <button onClick={onClose} className="rounded-lg p-1 text-white/70 hover:bg-white/15 hover:text-white transition"><XMarkIcon className="h-5 w-5" /></button>
                    </div>
                </div>
                <div className="px-5 py-4 max-h-[72vh] overflow-y-auto bg-gray-50/60 max-md:px-3">
                    {/* Emission / Commissioning summary (not columns in the master sheet) */}
                    <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-gray-600">
                        <span><span className="font-semibold text-gray-500">Emission Norm:</span> {emission || a.emission || '—'}</span>
                        <span><span className="font-semibold text-gray-500">Commissioning Date:</span> {commissioning ? fmtDMY(commissioning) : '—'}</span>
                        <span><span className="font-semibold text-gray-500">Part Lines:</span> {a.parts?.length || 0}</span>
                        <span><span className="font-semibold text-gray-500">Kits:</span> {kitsOf(a).length}</span>
                        <span><span className="font-semibold text-gray-500">Loose Parts:</span> {loosePartsOf(a).length}</span>
                        <span><span className="font-semibold text-gray-500">Added by:</span> {a.createdBy || '—'}</span>
                        <span><span className="font-semibold text-gray-500">Last edited by:</span> {a.updatedBy || '—'}</span>
                    </div>
                    {/* Master-sheet-format table for this single code */}
                    <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto qm-scroll shadow-sm">
                        <table className="master-sheet-table min-w-[1260px] w-full text-[12px]">
                            <thead>
                                <tr className="bg-gray-100 text-[10px] font-bold text-black uppercase tracking-wider">
                                    <th rowSpan={2} className="px-2 py-1 border border-gray-200 bg-gray-100 w-11 text-center">Sr.</th>
                                    <th colSpan={5} className="px-3 py-1 border border-gray-200 bg-gray-100 text-center">Application Code</th>
                                    <th colSpan={5} className="px-3 py-1 border border-gray-200 bg-indigo-100 text-center" style={{ color: themeColor }}>Part Details</th>
                                    <th colSpan={5} className="px-3 py-1 border border-gray-200 bg-amber-100 text-center text-amber-800">Kit Details</th>
                                </tr>
                                <tr className="bg-gray-50 text-[10px] font-semibold text-black uppercase tracking-wider">
                                    <th className="px-3 py-1 border border-gray-200 bg-gray-50 text-center">Segment</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-gray-50 text-center">App Code</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-gray-50 text-center">System App Code</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-gray-50 text-center">Engine Model</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-gray-50 text-center">KVA</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Part Number</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Part Description</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Qty</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Action</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-indigo-50 text-center">Svc Hrs</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Kit Number</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Kit Description</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Qty</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Action</th>
                                    <th className="px-3 py-1 border border-gray-200 bg-amber-50 text-center">Svc Hrs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {srows.map((r, i) => {
                                    const p = r.part;
                                    const last = i === srows.length - 1;
                                    const rowEnd = last ? BLOCK_END : undefined;
                                    return (
                                        <tr key={i} className="hover:bg-indigo-50/30 transition">
                                            {i === 0 && (
                                                <>
                                                    <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center font-mono font-semibold text-gray-500`}>1</td>
                                                    <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center text-gray-600`}>{a.segment || '—'}</td>
                                                    <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center`}>
                                                        <span className="inline-flex min-w-[104px] items-center justify-center font-mono font-bold text-[12px] bg-[#1b2026] text-white px-2 py-0.5 rounded-md whitespace-nowrap">{a.appCode}</span>
                                                    </td>
                                                    <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center font-mono text-gray-600 whitespace-nowrap`}>{a.systemAppCode || '—'}</td>
                                                    <td rowSpan={span} style={BLOCK_END} className={`${appTd} font-mono text-gray-700 whitespace-nowrap`}>{a.engineModel || '—'}</td>
                                                    <td rowSpan={span} style={BLOCK_END} className={`${appTd} text-center text-gray-600 whitespace-nowrap`}>{a.kva ? `${cleanKva(a.kva)} KVA` : '—'}</td>
                                                </>
                                            )}
                                            <td style={rowEnd} className="px-3 py-1 border border-gray-200 font-mono text-gray-800 whitespace-nowrap">{p?.partNumber || '—'}</td>
                                            <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-gray-700 min-w-[240px]">{p?.partDesc || '—'}</td>
                                            <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-center">{p?.qty || '—'}</td>
                                            <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-center"><Chip a={p?.action} /></td>
                                            <td style={rowEnd} className="px-3 py-1 border border-gray-200 text-center font-mono" title={p ? partService(services, p).name : ''}>{p?.serviceHours || '—'}</td>
                                            <td style={rowEnd} className={`px-3 py-1 border border-gray-200 font-mono text-gray-600 whitespace-nowrap bg-amber-50/20`}>{r.kit ? (r.kit.kitNumber || '—') : '—'}</td>
                                            <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-gray-600 min-w-[200px] bg-amber-50/20`}>{r.kit ? (r.kit.kitDesc || '—') : '—'}</td>
                                            <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-center text-gray-600 bg-amber-50/20`}>{r.kit ? (r.kit.qty || '—') : '—'}</td>
                                            <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-center bg-amber-50/20`}>{r.kit ? <Chip a={r.kit.action} /> : '—'}</td>
                                            <td style={rowEnd} className={`px-3 py-1 border border-gray-200 text-center font-mono text-gray-600 bg-amber-50/20`}>{r.kit ? (r.kit.serviceHours || '—') : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-1 pt-1.5 text-[10.5px] text-gray-400">
                        Two separate lists side by side. Part Details: the service parts a kit copied, then the loose ones. Kit Details: all the kits, then “—” rows, then the loose parts copied across. Nothing on the right belongs to the part on its left. Each kit's own part lines are shown below.
                    </div>

                    {/* Each kit's own part lines — information only, which is why they
                        are not part of the sheet above. */}
                    {kitsOf(a).length > 0 && (
                        <div className="mt-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                                Kit contents <span className="font-normal normal-case text-gray-400">— each kit's own part lines, kept separately from the service parts above</span>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                {kitsOf(a).map((k, ki) => (
                                    <div key={ki} className="rounded-xl border border-amber-200 bg-white overflow-hidden shadow-sm">
                                        <div className="flex flex-wrap items-baseline gap-x-2 px-2.5 py-1.5 bg-amber-50/60 border-b border-amber-200">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Kit {ki + 1}</span>
                                            <span className="font-mono text-[12px] font-bold text-gray-800">{k.kitNumber || '—'}</span>
                                            <span className="text-[11px] text-gray-600 truncate">{k.kitDesc || '—'}</span>
                                            <span className="ml-auto text-[10.5px] font-mono text-gray-500 whitespace-nowrap">
                                                Qty {k.qty || '—'} · {k.action || '—'} · {k.serviceHours || '—'} Hr
                                            </span>
                                        </div>
                                        <div className="overflow-x-auto qm-scroll">
                                        <table className="min-w-[420px] w-full text-[11.5px]">
                                            <thead>
                                                <tr className="bg-gray-50 text-[9.5px] font-semibold text-gray-600 uppercase tracking-wider">
                                                    <th className="px-2 py-1 border-b border-gray-200 text-left">Part Number</th>
                                                    <th className="px-2 py-1 border-b border-gray-200 text-left">Description</th>
                                                    <th className="px-2 py-1 border-b border-gray-200 text-center w-12">Qty</th>
                                                    <th className="px-2 py-1 border-b border-gray-200 text-center w-12">Act</th>
                                                    <th className="px-2 py-1 border-b border-gray-200 text-center w-16">Svc Hrs</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(k.parts || []).length === 0 ? (
                                                    <tr><td colSpan={5} className="px-2 py-2 text-center text-gray-400">This kit has no part lines.</td></tr>
                                                ) : k.parts.map((p, pi) => (
                                                    <tr key={pi} className="border-b border-gray-50 last:border-0">
                                                        <td className="px-2 py-1 font-mono text-gray-800 whitespace-nowrap">{p.partNumber || '—'}</td>
                                                        <td className="px-2 py-1 text-gray-600">{p.partDesc || '—'}</td>
                                                        <td className="px-2 py-1 text-center text-gray-600">{p.qty || '—'}</td>
                                                        <td className="px-2 py-1 text-center"><Chip a={p.action} /></td>
                                                        <td className="px-2 py-1 text-center font-mono text-gray-600">{p.serviceHours || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-white max-md:px-3">
                    <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition">Close</button>
                    <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: themeColor }}>
                        <PencilSquareIcon className="h-4 w-4" /> Edit this code
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ------------- Drag-to-resize shell -------------
   The form gets long (many part lines, several kits), so the popup can be
   dragged bigger or smaller from its bottom-right corner and remembers the
   size. Purely presentational — nothing about the record depends on it. */
const MODAL_SIZE_KEY = 'msm:modalSize';
const MIN_MODAL_W = 720;
const MIN_MODAL_H = 340;
// Never let a stored size outgrow the window, and never let the minimum push
// the popup wider than the screen (small laptops / phones).
const clampSize = (s) => {
    if (!s || !s.w || !s.h) return null;
    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 16;
    return {
        w: Math.max(Math.min(MIN_MODAL_W, maxW), Math.min(s.w, maxW)),
        h: Math.max(Math.min(MIN_MODAL_H, maxH), Math.min(s.h, maxH)),
    };
};

const useResizableModal = () => {
    const shellRef = useRef(null);
    const lastRef = useRef(null);
    const [size, setSize] = useState(() => {
        try { return clampSize(JSON.parse(localStorage.getItem(MODAL_SIZE_KEY) || 'null')); }
        catch { return null; }
    });
    // A stored size must stay sensible when the window itself is resized.
    useEffect(() => {
        const onResize = () => setSize((s) => (s ? clampSize(s) : s));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Pointer events, so a mouse, a pen and a touch drag all work.
    const onGripDown = (e) => {
        e.preventDefault();
        const el = shellRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const start = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
        const move = (ev) => {
            const next = clampSize({ w: start.w + (ev.clientX - start.x), h: start.h + (ev.clientY - start.y) });
            lastRef.current = next;
            setSize(next);
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            document.body.style.userSelect = '';
            if (lastRef.current) {
                try { localStorage.setItem(MODAL_SIZE_KEY, JSON.stringify(lastRef.current)); } catch { /* quota — ignore */ }
            }
        };
        document.body.style.userSelect = 'none';   // no text selection while dragging
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };
    const resetSize = () => {
        lastRef.current = null;
        setSize(null);
        try { localStorage.removeItem(MODAL_SIZE_KEY); } catch { /* ignore */ }
    };
    return { shellRef, size, onGripDown, resetSize };
};

// The grip itself — bottom-right corner, drag to resize, double-click to reset.
const ResizeGrip = ({ onGripDown, onReset }) => (
    <div onPointerDown={onGripDown} onDoubleClick={onReset}
        title="Drag to resize · double-click to reset"
        className="absolute bottom-0 right-0 z-20 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-[3px] text-gray-400 hover:text-gray-700 max-md:hidden">
        <svg viewBox="0 0 10 10" className="h-3 w-3" aria-hidden="true">
            <path d="M9.2 2.6 2.6 9.2M9.2 6.4 6.4 9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
    </div>
);

const AppFormModal = ({ initial, prefill, initialHours = '', opts, existing, remaining = [], onClose, onSave }) => {
    const isEdit = !!initial;
    const { shellRef, size, onGripDown, resetSize } = useResizableModal();

    // ---- Local draft (Option 1): auto-save the in-progress form to the browser
    // so an interruption (refresh, crash, session timeout, accidental Cancel)
    // never wipes it. This is a DRAFT only — it never touches the database and
    // the full mandatory validation still runs before anything is committed.
    // prefill (App Mapping "Add") seeds a NEW record's header from asset data;
    // it is ignored in edit mode.
    // System App Code for a NEW record is always the App Code with '...' appended
    // (e.g. 04.1341 -> 04.1341...) — never hand-typed. Edit mode keeps the stored value.
    const sysOf = (code) => (code ? `${code}...` : '');
    const makeInitialHdr = () => ({
        appCode: initial?.appCode || prefill?.appCode || '',
        segment: initial?.segment || prefill?.segment || 'PG',
        kva: initial?.kva || prefill?.kva || (opts.kvaOpts[0] || ''),
        engineModel: initial?.engineModel || prefill?.engineModel || '',
        systemAppCode: initial ? (initial.systemAppCode || '') : sysOf(prefill?.appCode || ''),
        emission: initial?.emission || prefill?.emission || 'CPCB IV+',
    });
    // Rebuild the editing model (parts + independent kits) from the stored record.
    // Pure and deterministic (ids are positional), so calling it twice — once for
    // state, once for the pristine baseline — yields identical snapshots.
    const makeInitialModel = () => recordToModel(initial);
    // Add drafts share one slot; edit drafts are keyed per app code.
    const draftKey = isEdit ? `msm:appDraft:edit:${initial.appCode}` : (prefill?.appCode ? `msm:appDraft:new:${prefill.appCode}` : 'msm:appDraft:new');
    // Snapshot of the pristine form — we only persist (and only prompt) when the
    // current form actually differs from this, so blank/no-op drafts never linger.
    // __uid / __id are stripped (pure UI identity).
    const snap = (h, ps, ks) => JSON.stringify({
        hdr: h,
        parts: (ps || []).map(({ __uid, ...p }) => p),
        kits: (ks || []).map(({ __id, parts: kps, ...k }) => ({ ...k, parts: (kps || []).map(({ __uid, ...p }) => p) })),
    });
    const baseRef = useRef((() => { const m = makeInitialModel(); return snap(makeInitialHdr(), m.parts, m.kits); })());
    const uidRef = useRef(1000); // ids for part / kit-part lines added after mount
    const nextUid = () => `p${++uidRef.current}`;

    const [hdr, setHdr] = useState(makeInitialHdr);
    // When the header was filled from asset data — either the App Mapping "Add"
    // (prefill) or picking a pending code from the dropdown — Segment / KVA /
    // Engine Model / Emission / App Code are locked (read-only). "Change" unlocks.
    const [assetLocked, setAssetLocked] = useState(!isEdit && !!prefill);
    const [model, setModel] = useState(makeInitialModel);
    const { parts, kits } = model;
    const setParts = (fn) => setModel((m) => ({ ...m, parts: typeof fn === 'function' ? fn(m.parts) : fn }));
    const [checked, setChecked] = useState({}); // part __uid -> selected, for "Add kit"
    const [saving, setSaving] = useState(false);
    const [pendingDraft, setPendingDraft] = useState(null); // a found draft awaiting Restore/Discard
    // Guided flow: 'build' (header + parts + kit Q&A) -> 'review' (sheet preview) -> save.
    const [stage, setStage] = useState('build');
    // Kit Q&A step, strictly in order:
    //   'ask'     — "Do you want to add a Kit?" Yes/No
    //   'pick'    — select the part codes that form the kit, then OK
    //   'details' — "Please add kit details" (Kit Number/Description/Qty/Action)
    //   -> back to 'ask' ("Do you want to add another kit?") and so on
    //   'store'   — "Do you want to store in master?" Yes -> review
    //   'idle'    — declined; a small "+ Add a kit" re-opens the flow
    const [kitStep, setKitStep] = useState('ask');
    const [currentKitId, setCurrentKitId] = useState(null); // the kit whose details are being filled

    // On open, offer to restore a saved draft (only if it differs from the default form).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const saved = JSON.parse(raw);
            const same = snap(saved.hdr, saved.parts, saved.kits) === baseRef.current;
            if (same) localStorage.removeItem(draftKey); // stale no-op draft
            else setPendingDraft(saved);
        } catch { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-save as the user types (debounced). Only writes when the form differs
    // from the pristine baseline, so it never clobbers a pending draft on mount
    // and never stores an empty/unchanged form.
    useEffect(() => {
        const cur = snap(hdr, parts, kits);
        if (cur === baseRef.current) return;
        const t = setTimeout(() => {
            try { localStorage.setItem(draftKey, JSON.stringify({ hdr, parts, kits, savedAt: Date.now() })); } catch { /* quota/full — ignore */ }
        }, 400);
        return () => clearTimeout(t);
    }, [hdr, parts, kits, draftKey]);

    const restoreDraft = () => {
        const d = pendingDraft;
        if (d?.hdr) setHdr((h) => ({ ...h, ...d.hdr }));
        if (Array.isArray(d?.parts) && d.parts.length) {
            setModel({
                parts: d.parts.map((p, i) => ({ ...blankPart(p.__uid || `p${i}`), ...p })),
                kits: (Array.isArray(d.kits) ? d.kits : []).map((k, i) => ({
                    __id: k.__id || `k${i}`, number: '', desc: '', qty: '', action: '', hours: '', ...k,
                    parts: (k.parts || []).map((p, j) => ({ ...blankPart(p.__uid || `k${i}p${j}`), ...p })),
                })),
            });
        }
        setPendingDraft(null);
    };
    const discardDraft = () => {
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
        setPendingDraft(null);
    };

    const setPart = (i, k, v) => setParts((arr) => arr.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
    const setKit = (id, k, v) => setModel((m) => ({ ...m, kits: m.kits.map((x) => (x.__id === id ? { ...x, [k]: v } : x)) }));

    // A kit part line is edited entirely inside its kit — it is a copy, so this
    // never reaches back into the service-part list.
    const setKitPart = (kitId, uid, key, v) => setModel((m) => ({
        ...m,
        kits: m.kits.map((k) => (k.__id === kitId
            ? { ...k, parts: k.parts.map((p) => (p.__uid === uid ? { ...p, [key]: v } : p)) }
            : k)),
    }));
    const deleteKitPart = (kitId, uid) => setModel((m) => ({
        ...m,
        kits: m.kits.map((k) => (k.__id === kitId ? { ...k, parts: k.parts.filter((p) => p.__uid !== uid) } : k)),
    }));
    // Copy the picked LOOSE service parts into a kit. Same rule as building a
    // kit: the kit gets its own copies, the service list keeps its originals —
    // they simply stop counting as loose while a kit holds that part number.
    const addLooseToKit = (kitId, uids) => setModel((m) => {
        const take = new Set(uids);
        const copies = m.parts.filter((p) => take.has(p.__uid)).map((p) => ({ ...p, __uid: nextUid(), loose: true }));
        if (!copies.length) return m;
        return { ...m, kits: m.kits.map((k) => (k.__id === kitId ? { ...k, parts: [...k.parts, ...copies] } : k)) };
    });


    // EVERY part can be ticked, not just the ones no kit uses yet: the same part
    // may go into as many kits as needed (1,2,3 can form Kit 1 AND Kit 2).
    const checkedUids = parts.filter((p) => checked[p.__uid]).map((p) => p.__uid);
    // Loose = the service parts no kit holds as a BUILT-IN member (matched by
    // part number). A loose copy added into a kit stays a loose part, matching
    // the sheet's loose block. Display only.
    const kitPartNos = new Set(kits.flatMap((k) => k.parts.filter((p) => !p.loose).map((p) => normPn(p.partNumber))).filter(Boolean));
    const loosePartsList = parts.filter((p) => !kitPartNos.has(normPn(p.partNumber)));

    // Build a new kit by COPYING the ticked part lines into it. The copies are
    // independent from that moment on — editing either side changes only itself.
    // Returns the new kit's id so the flow can open its details form.
    const addKitFromChecked = () => {
        if (!checkedUids.length) return null;
        const take = new Set(checkedUids);
        const id = `k${Date.now().toString(36)}`;
        setModel((m) => {
            const copies = m.parts.filter((p) => take.has(p.__uid)).map((p) => ({ ...p, __uid: nextUid() }));
            // Seed the kit's loose list with its own copies of every part NOT
            // picked — independent snapshots, same as recordToModel does on load.
            const memberNos = new Set(copies.map((p) => normPn(p.partNumber)).filter(Boolean));
            const looseCopies = m.parts
                .filter((p) => !take.has(p.__uid) && !memberNos.has(normPn(p.partNumber)))
                .map((p) => ({ ...p, __uid: nextUid(), loose: true }));
            return {
                parts: m.parts,
                kits: [...m.kits, {
                    __id: id, number: '', desc: '', qty: '1', action: 'R',
                    // Svc Hrs is mandatory — start it on the copied parts' own
                    // interval, which is what a kit for those parts normally is.
                    hours: String(copies[0]?.serviceHours || ''),
                    parts: [...copies, ...looseCopies],
                }],
            };
        });
        setChecked({});
        return id;
    };
    const removeKit = (id) => setModel((m) => ({ ...m, kits: m.kits.filter((k) => k.__id !== id) }));
    // Deleting a service part leaves every kit untouched — a kit holds copies.
    const deletePart = (uid) => setModel((m) => ({ ...m, parts: m.parts.filter((p) => p.__uid !== uid) }));

    const inp = INP;
    const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] text-black outline-none focus:border-gray-400 focus:ring-2 focus:ring-indigo-100 transition';
    const label = 'block text-[12px] font-bold text-gray-800 mb-1';

    // ---- Svc Hrs filter (top bar) ----------------------------------------
    // '' = every interval. Set from the App Mapping coverage-column pencil, so
    // clicking the 500 Hr tick opens this record showing only its 500 Hr work.
    // DISPLAY ONLY — hidden lines stay in the model and are still saved and
    // still validated, so a filtered edit can never drop the other intervals.
    const [hrsFilter, setHrsFilter] = useState(String(initialHours || ''));
    const hrsEq = (v) => String(v ?? '').trim() === hrsFilter;
    // Keep each row's real index — setPart / kits are addressed by position.
    const partRows = parts
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => !hrsFilter || hrsEq(p.serviceHours));
    // A kit belongs to the interval when its own Svc Hrs matches, or when any of
    // its part copies do (kits built from mixed lines still show up).
    const kitRows = kits
        .map((k, ki) => ({ k, ki }))
        .filter(({ k }) => !hrsFilter || hrsEq(k.hours) || k.parts.some((p) => hrsEq(p.serviceHours)));
    const hiddenParts = parts.length - partRows.length;
    const hiddenKits = kits.length - kitRows.length;
    // Warn when something the filter hides is what is blocking the save.
    // Changing the filter drops any pending kit selection — a hidden ticked row
    // must never end up copied into a kit the user cannot see.
    useEffect(() => { setChecked({}); }, [hrsFilter]);
    // Loose is PER KIT — the service parts THIS kit does not hold, matched by
    // part number. Kits are unrelated: with 6 parts, kit 1 holding 1-3 offers
    // 4-6, and kit 2 holding 4-6 offers 1-3, each unaware of the other. Kept in
    // step with the Svc Hrs filter.
    const looseForKit = (k) => {
        const own = new Set((k?.parts || []).map((p) => normPn(p.partNumber)).filter(Boolean));
        return parts.filter((p) => !own.has(normPn(p.partNumber)) && (!hrsFilter || hrsEq(p.serviceHours)));
    };
    // What the kit's "not added" strip offers: every service part the kit does
    // not hold (as member or loose copy). A half-typed line is not offered.
    const notAddedForKit = (k) => looseForKit(k).filter(partComplete);
    const hiddenIncomplete = !!hrsFilter && (
        parts.some((p) => !hrsEq(p.serviceHours) && !partComplete(p)) ||
        kits.some((k) => !(hrsEq(k.hours) || k.parts.some((p) => hrsEq(p.serviceHours))) && !kitComplete(k))
    );

    // A new part line can't be added (and nothing saved) until the current ones
    // are complete. partComplete / kitComplete are shared with KitBox.
    const allPartsComplete = parts.length > 0 && parts.every(partComplete);
    const allKitsComplete = kits.every(kitComplete);
    const hdrComplete =
        hdr.appCode.trim() && hdr.segment.trim() && String(hdr.kva).trim() &&
        hdr.engineModel.trim() && hdr.systemAppCode.trim() && hdr.emission.trim();
    const canSave = hdrComplete && allPartsComplete && allKitsComplete;

    const save = async () => {
        const code = hdr.appCode.trim();
        if (!hdrComplete) { toast.error('Please fill every application-code field.'); return; }
        if (!isEdit && existing.has(code)) { toast.error(`${code} already exists — use Edit`); return; }
        if (parts.length === 0) { toast.error('Add at least one part line.'); return; }
        if (!allPartsComplete) { toast.error('Please fill every field in all part lines.'); return; }
        if (!allKitsComplete) { toast.error('Please fill every kit — its details and all of its part lines.'); return; }
        const rec = {
            appCode: code, segment: hdr.segment.trim(), kva: String(hdr.kva).trim(), engineModel: hdr.engineModel.trim(),
            systemAppCode: hdr.systemAppCode.trim(), emission: hdr.emission.trim(),
            ...modelToPayload(parts, kits),
        };
        setSaving(true);
        try {
            await onSave(rec);
            try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
            onClose();
        } catch (e) {
            toast.error(e.message || 'Could not save');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex justify-center overflow-y-auto p-4 max-md:p-2" style={{ background: 'rgba(20,26,32,.55)' }}>
            <div ref={shellRef}
                className="msm-modal relative flex flex-col bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-auto max-xl:max-w-[95vw] overflow-hidden"
                style={size ? { width: size.w, height: size.h, maxWidth: 'none' } : undefined}>
                <div className="flex items-center gap-3 px-5 py-3 text-white max-md:px-3 flex-shrink-0"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                        {isEdit ? <PencilSquareIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-bold leading-tight tracking-tight">{isEdit ? 'Edit' : 'Add'} Application Code</h3>
                        <p className="text-[11px] leading-tight text-white/65">
                            {isEdit
                                ? <span className="font-mono font-semibold tracking-wide text-white/85">{hdr.appCode}</span>
                                : 'Enter the code, its service parts, and any kits'}
                        </p>
                    </div>
                    {/* Service-interval filter — narrows the service parts AND the kits
                        below to one Svc Hrs. Nothing is removed, only hidden. */}
                    <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                        <span className="text-[9.5px] font-bold uppercase tracking-widest text-white/55 max-sm:hidden">Svc Hrs</span>
                        <select value={hrsFilter} onChange={(e) => setHrsFilter(e.target.value)} disabled={stage !== 'build'}
                            title="Show only the service parts and kits of one service interval"
                            className="h-8 cursor-pointer rounded-lg border border-white/25 bg-white/15 px-2.5 text-[12px] font-semibold text-white outline-none transition hover:bg-white/25 focus:bg-white/25 focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50">
                            <option value="" className="text-gray-800">All service hours</option>
                            {opts.hrsOpts.map((h) => <option key={h} value={String(h)} className="text-gray-800">{h} Hr</option>)}
                        </select>
                        <span className="h-6 w-px bg-white/20 max-sm:hidden" />
                        <button onClick={onClose} disabled={saving} title="Close"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/15 hover:text-white disabled:opacity-50">
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <div className={`px-5 py-4 overflow-y-auto bg-slate-50 max-md:px-3 ${size ? 'flex-1 min-h-0' : 'max-h-[72vh]'}`}>
                    {pendingDraft && (
                        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,.06)]">
                            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-600" />
                            <span className="flex-1 text-[12px] font-medium text-amber-900">
                                You have an unsaved draft{pendingDraft.savedAt ? ` from ${new Date(pendingDraft.savedAt).toLocaleString()}` : ''}. Restore it?
                            </span>
                            <button type="button" onClick={restoreDraft}
                                className="inline-flex h-8 items-center rounded-lg bg-amber-600 px-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-amber-700">
                                Restore
                            </button>
                            <button type="button" onClick={discardDraft}
                                className="inline-flex h-8 items-center rounded-lg border border-amber-300 bg-white px-3 text-[12px] font-semibold text-amber-800 transition hover:bg-amber-100">
                                Discard
                            </button>
                        </div>
                    )}
                    {stage === 'build' && (<>
                    {/* ---- Section: application code ---- */}
                    <div className={CARD}>
                        <div className={CARD_HEAD}>
                            <span className={CARD_ICON} style={{ background: themeSoft }}>
                                <CircleStackIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                            </span>
                            <span className={CARD_TITLE}>Application Code</span>
                            <span className="text-[10.5px] text-gray-400 max-md:w-full">identity of the record — all six fields are required</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-4 py-3.5 max-md:px-3">
                            <div>
                                <label className={`${label} flex items-center gap-1.5`}>
                                    <span>App Code <span className="text-red-500">*</span></span>
                                    {!isEdit && assetLocked && (
                                        <button type="button"
                                            onClick={() => { setAssetLocked(false); setHdr((h) => ({ ...h, appCode: '', systemAppCode: '', engineModel: '', kva: (opts.kvaOpts[0] || ''), segment: 'PG', emission: 'CPCB IV+' })); }}
                                            className="ml-auto font-normal text-[10.5px] text-[#2f3192] hover:underline">Change</button>
                                    )}
                                    {!isEdit && !assetLocked && remaining.length > 0 && (
                                        <span className="ml-auto font-normal text-[10.5px] text-gray-600">{remaining.length} pending</span>
                                    )}
                                </label>
                                <AppCodeSuggest
                                    value={hdr.appCode}
                                    disabled={isEdit || assetLocked}
                                    remaining={remaining}
                                    fieldCls={`${field} ${(isEdit || assetLocked) ? 'bg-gray-100 text-gray-500 opacity-80' : ''}`}
                                    onChange={(v) => setHdr((h) => ({ ...h, appCode: v, systemAppCode: sysOf(v) }))}
                                    onPick={(r) => {
                                        // Pending code picked -> fill everything from asset data and lock it.
                                        setHdr((h) => ({
                                            ...h,
                                            appCode: r.appCode,
                                            engineModel: r.engineModel || '',
                                            segment: assetSegment(r.segment) || h.segment,
                                            kva: assetKva(r.kva) || h.kva,
                                            emission: r.emission || h.emission,
                                            systemAppCode: sysOf(r.appCode),
                                        }));
                                        setAssetLocked(true);
                                    }}
                                />
                            </div>
                            <div><label className={label}>Segment <span className="text-red-500">*</span></label>
                                <Combo pickOnly disabled={assetLocked} value={hdr.segment} onChange={(v) => setHdr((h) => ({ ...h, segment: v }))} options={['PG', 'Industrial']} fieldCls={field} /></div>
                            <div><label className={label}>KVA Rating <span className="text-red-500">*</span></label>
                                <Combo disabled={assetLocked} value={hdr.kva} onChange={(v) => setHdr((h) => ({ ...h, kva: v }))} options={opts.kvaOpts} placeholder="e.g. 30 (or type new)" mono fieldCls={field} /></div>
                            <div><label className={label}>Engine Model <span className="text-red-500">*</span></label>
                                <input className={`${field} font-mono ${assetLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed opacity-80' : ''}`} value={hdr.engineModel} readOnly={assetLocked} onChange={(e) => setHdr((h) => ({ ...h, engineModel: e.target.value }))} placeholder="e.g. 6K1080ETA 4G1" /></div>
                            <div><label className={label}>System App Code <span className="text-red-500">*</span></label>
                                <input className={`${field} font-mono ${!isEdit ? 'bg-gray-100 text-gray-500 cursor-not-allowed opacity-80' : ''}`} value={hdr.systemAppCode} readOnly={!isEdit} title={!isEdit ? 'Auto-set to the App Code with … appended' : undefined} onChange={(e) => setHdr((h) => ({ ...h, systemAppCode: e.target.value }))} placeholder="e.g. 3H.8902" /></div>
                            <div><label className={label}>Emission Norm <span className="text-red-500">*</span></label>
                                <Combo disabled={assetLocked} value={hdr.emission} onChange={(v) => setHdr((h) => ({ ...h, emission: v }))} options={opts.emiOpts} placeholder="e.g. CPCB IV+ (or type new)" fieldCls={field} /></div>
                        </div>
                    </div>

                    {/* ---- Section: service parts ---- */}
                    <div className={`${CARD} mt-3`}>
                        <div className={CARD_HEAD}>
                            <span className={CARD_ICON} style={{ background: themeSoft }}>
                                <WrenchScrewdriverIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                            </span>
                            <span className={CARD_TITLE}>Service Parts {REQ}</span>
                            <span className={PILL}>{hrsFilter ? `${partRows.length} of ${parts.length}` : parts.length}</span>
                            {hrsFilter && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 py-0.5 pl-2 pr-1 text-[10px] font-bold" style={{ color: themeColor }}>
                                    {hrsFilter} Hr only
                                    <button type="button" onClick={() => setHrsFilter('')} title="Show every service interval"
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full leading-none transition hover:bg-indigo-200/70">
                                        <XMarkIcon className="h-2.5 w-2.5" />
                                    </button>
                                </span>
                            )}
                            <span className="ml-auto text-[10.5px] text-gray-400 max-lg:hidden">
                                {hrsFilter
                                    ? `${hiddenParts} line${hiddenParts === 1 ? '' : 's'} of other intervals hidden — still saved`
                                    : 'a kit keeps its own copy, so editing here never changes a kit'}
                            </span>
                        </div>
                        <div className="px-4 py-3 max-md:px-3">
                    <div className={TABLE_WRAP}>
                        <table className="min-w-[860px] w-full border-collapse">
                            <thead>
                                <tr className={THEAD}>
                                    <th className={`${TH} w-44`}>Part Number {REQ}</th>
                                    <th className={TH}>Description {REQ}</th>
                                    <th className={`${TH} w-16 text-center`}>Qty {REQ}</th>
                                    <th className={`${TH} w-20 text-center`}>Action {REQ}</th>
                                    <th className={`${TH} w-24 text-center`}>Svc Hrs {REQ}</th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {partRows.map(({ p, i }) => (
                                    <tr key={p.__uid} className={TR}>
                                        <td className="px-1.5 py-1"><input className={`${inp} font-mono`} value={p.partNumber} onChange={(e) => setPart(i, 'partNumber', e.target.value)} /></td>
                                        <td className="px-1.5 py-1"><input className={inp} value={p.partDesc} onChange={(e) => setPart(i, 'partDesc', e.target.value)} /></td>
                                        <td className="px-1.5 py-1"><input className={`${inp} font-mono text-center`} value={p.qty} onChange={(e) => setPart(i, 'qty', e.target.value)} /></td>
                                        <td className="px-1.5 py-1"><Combo value={p.action} onChange={(v) => setPart(i, 'action', v)} options={opts.actOpts} mono fieldCls={inp} /></td>
                                        <td className="px-1.5 py-1"><Combo value={p.serviceHours} onChange={(v) => setPart(i, 'serviceHours', v)} options={opts.hrsOpts} mono fieldCls={inp} /></td>
                                        <td className="px-1.5 py-1 text-center">
                                            <button onClick={() => deletePart(p.__uid)} title="Delete this part line (kits keep their own copies)" className={BTN_ICON}>
                                                <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {partRows.length === 0 && (
                                    <tr><td colSpan={6} className="text-center text-gray-400 py-4 text-[12px]">
                                        {hrsFilter ? `No ${hrsFilter} Hr part line — add one, or clear the Svc Hrs filter.` : 'No parts yet — add a line.'}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => {
                                if (!allPartsComplete) { toast.error('Please fill every field in the current part line first.'); return; }
                                // With a filter on, a new line starts on that interval so it
                                // does not vanish the moment it is created. Once complete, it
                                // appears in every kit's "not added" strip.
                                setParts((a) => [...a, { ...blankPart(nextUid()), ...(hrsFilter ? { serviceHours: hrsFilter } : {}) }]);
                            }}
                            title={allPartsComplete ? 'Add another part line' : 'Fill every field in the current part line(s) first'}
                            className={`${BTN_GHOST} ${allPartsComplete ? '' : 'cursor-not-allowed opacity-60'}`}>
                            <PlusIcon className="h-3.5 w-3.5" /> Add part line{hrsFilter ? ` (${hrsFilter} Hr)` : ''}
                        </button>
                        {hiddenIncomplete && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold text-amber-700">
                                <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                A line or kit outside the {hrsFilter} Hr filter is incomplete — clear the filter to finish it before saving.
                            </span>
                        )}
                    </div>
                        </div>
                    </div>

                    {/* ---- Guided kit flow + the kits added so far (no standing section box) ---- */}
                    <div className="mt-3">

                    {/* ---- Guided kit flow: ask -> pick parts -> fill kit details -> ask again ----
                        Every part stays selectable however many kits already use it: picking
                        parts COPIES them into the new kit, it does not move them. ---- */}
                    {allPartsComplete && parts.length > 0 && kitStep === 'ask' && (
                        <div className={`${PROMPT} mb-2.5`}>
                            <span className={CARD_ICON} style={{ background: '#fff' }}>
                                <CubeIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                            </span>
                            <span className="text-[13px] font-bold text-gray-900">
                                {kits.length ? 'Do you want to add another kit?' : 'Do you want to add a Kit?'}
                            </span>
                            <span className="text-[10.5px] text-gray-500 max-sm:hidden">the ticked parts are copied into it — the service list above is left alone</span>
                            <div className="ml-auto flex items-center gap-2">
                                <button type="button" onClick={() => { setChecked({}); setKitStep('pick'); }}
                                    className={BTN_PRIMARY} style={{ backgroundColor: themeColor }}>
                                    Yes
                                </button>
                                <button type="button" onClick={() => setKitStep('idle')} className={BTN_GHOST}>
                                    No
                                </button>
                            </div>
                        </div>
                    )}
                    {allPartsComplete && parts.length > 0 && kitStep === 'pick' && (
                        <div className={`${CARD} mb-2.5 p-3 max-md:p-2.5`}>
                            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: themeColor }}>Select the parts that come together in this kit</span>
                                <span className="text-[10.5px] text-gray-500">tick the rows, then press OK — they are copied in, so a part can be used in more than one kit{hrsFilter ? `; only the ${hrsFilter} Hr lines are listed` : ''}</span>
                            </div>
                            <div className={`${TABLE_WRAP} mb-2`}>
                                <table className="min-w-[680px] w-full border-collapse text-[12px]">
                                    <thead>
                                        <tr className={THEAD}>
                                            <th className="px-2.5 py-2 text-center w-9">
                                                {(() => {
                                                    const allOn = partRows.length > 0 && partRows.every(({ p }) => checked[p.__uid]);
                                                    return (
                                                        <span onClick={() => setChecked(allOn ? {} : Object.fromEntries(partRows.map(({ p }) => [p.__uid, true])))}
                                                            title="Select all / none"
                                                            className="inline-flex h-[15px] w-[15px] cursor-pointer items-center justify-center rounded border border-gray-300 bg-white align-middle">
                                                            {allOn && <CheckIcon className="h-2.5 w-2.5" style={{ color: themeColor }} />}
                                                        </span>
                                                    );
                                                })()}
                                            </th>
                                            <th className={`${TH} w-44`}>Part Number</th>
                                            <th className={TH}>Description</th>
                                            <th className={`${TH} w-14 text-center`}>Qty</th>
                                            <th className={`${TH} w-16 text-center`}>Action</th>
                                            <th className={`${TH} w-20 text-center`}>Svc Hrs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {partRows.map(({ p }) => {
                                            const on = !!checked[p.__uid];
                                            return (
                                                <tr key={p.__uid} onClick={() => setChecked((c) => ({ ...c, [p.__uid]: !c[p.__uid] }))}
                                                    className={`border-t border-gray-100 cursor-pointer transition ${on ? 'bg-indigo-50/70' : 'hover:bg-slate-50/70'}`}>
                                                    <td className="px-2.5 py-1.5 text-center">
                                                        <span className={`inline-flex h-[15px] w-[15px] items-center justify-center rounded border align-middle transition ${on ? 'bg-[#2f3192] border-[#2f3192]' : 'border-gray-300 bg-white'}`}>
                                                            {on && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                                                        </span>
                                                    </td>
                                                    <td className="px-2.5 py-1.5 font-mono font-semibold text-gray-800 whitespace-nowrap">{p.partNumber || '—'}</td>
                                                    <td className="px-2.5 py-1.5 text-gray-600">{p.partDesc || '—'}</td>
                                                    <td className="px-2.5 py-1.5 text-center text-gray-700">{p.qty || '—'}</td>
                                                    <td className="px-2.5 py-1.5 text-center"><Chip a={p.action} /></td>
                                                    <td className="px-2.5 py-1.5 text-center font-mono text-gray-700">{p.serviceHours || '—'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-gray-600">{checkedUids.length} part{checkedUids.length === 1 ? '' : 's'} selected</span>
                                <div className="ml-auto flex items-center gap-2">
                                    <button type="button" onClick={() => { setChecked({}); setKitStep('ask'); }} className={BTN_GHOST}>
                                        Cancel
                                    </button>
                                    <button type="button" disabled={!checkedUids.length}
                                        onClick={() => { const id = addKitFromChecked(); if (id) { setCurrentKitId(id); setKitStep('details'); } }}
                                        className={`${BTN_PRIMARY} px-6`} style={{ backgroundColor: themeColor }}>
                                        OK
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {kitStep === 'details' && (() => {
                        const ki = kits.findIndex((x) => x.__id === currentKitId);
                        if (ki < 0) return null;
                        return (
                            <>
                                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="text-[13px] font-bold text-gray-900">Please add kit details</span>
                                    <span className="text-[10.5px] text-gray-500">the ticked parts are stored on the kit — only its loose additions are listed below</span>
                                </div>
                                <KitBox
                                    k={kits[ki]} index={ki} opts={opts}
                                    notAdded={notAddedForKit(kits[ki])}
                                    onAddLoose={(uids) => addLooseToKit(currentKitId, uids)}
                                    onSet={(key, v) => setKit(currentKitId, key, v)}
                                    onSetPart={(uid, key, v) => setKitPart(currentKitId, uid, key, v)}
                                    onDeletePart={(uid) => deleteKitPart(currentKitId, uid)}
                                    onRemove={() => { removeKit(currentKitId); setCurrentKitId(null); setKitStep('ask'); }}
                                    onDone={() => { setCurrentKitId(null); setKitStep('ask'); }}
                                />
                            </>
                        );
                    })()}
                    {allPartsComplete && parts.length > 0 && kitStep === 'idle' && (
                        <button type="button" onClick={() => { setChecked({}); setKitStep('pick'); }}
                            className={`${BTN_DASHED} mb-2.5`}>
                            <PlusIcon className="h-3.5 w-3.5" /> Add a kit
                        </button>
                    )}
                    {hrsFilter && kits.length > 0 && (
                        <div className="mb-2.5 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[11px] text-gray-600">
                            <FunnelIcon className="h-3.5 w-3.5 flex-shrink-0 mt-px" style={{ color: themeColor }} />
                            <span>
                                Showing <b className="text-gray-900">{kitRows.length}</b> of <b className="text-gray-900">{kits.length}</b> kits — a kit is listed when its own Svc Hrs is <b className="font-mono text-gray-900">{hrsFilter}</b> or one of its part lines is.
                                {hiddenKits > 0 ? ` ${hiddenKits} kit${hiddenKits === 1 ? '' : 's'} hidden — still saved.` : ''}
                            </span>
                        </div>
                    )}
                    {kitRows.map(({ k, ki }) => {
                        // The kit currently in the "Please add kit details" step is edited
                        // there — don't show it twice.
                        if (kitStep === 'details' && k.__id === currentKitId) return null;
                        return (
                            <KitBox
                                key={k.__id} k={k} index={ki} opts={opts}
                                notAdded={notAddedForKit(k)}
                                onAddLoose={(uids) => addLooseToKit(k.__id, uids)}
                                onSet={(key, v) => setKit(k.__id, key, v)}
                                onSetPart={(uid, key, v) => setKitPart(k.__id, uid, key, v)}
                                onDeletePart={(uid) => deleteKitPart(k.__id, uid)}
                                onRemove={() => removeKit(k.__id)}
                            />
                        );
                    })}

                    </div>
                    </>)}

                    {/* ---- Stage: review — the record exactly as it will sit in Master Data ---- */}
                    {stage === 'review' && (() => {
                        // Exactly the rows the Master Data sheet will show: each kit's own
                        // part copies first (kit values on its first row), then the parts no
                        // kit contains.
                        const payload = modelToPayload(parts, kits);
                        const srows = sheetRowsOf(payload);
                        const looseCount = loosePartsOf(payload).length;
                        const td = 'px-2.5 py-1 border border-gray-200';
                        return (
                            <div>
                                <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3.5 py-2.5">
                                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0 mt-px" style={{ color: themeColor }} />
                                    <p className="text-[12px] text-gray-600">
                                        <b className="text-gray-900">Please review this:</b> exactly how <b className="font-mono text-gray-900">{hdr.appCode}</b> will appear in Master Data — all the kits, then the “—” rows, then the loose parts.
                                        {hrsFilter ? <> The <b className="text-gray-900">{hrsFilter} Hr</b> view does not apply here: every interval is shown, and every one is saved.</> : null}
                                    </p>
                                </div>
                                <div className={`${CARD} overflow-hidden`}>
                                    <div className="overflow-x-auto qm-scroll">
                                        <table className="min-w-[1460px] w-full text-[11.5px]">
                                            <thead>
                                                <tr className="bg-gray-100 text-[9.5px] font-bold text-black uppercase tracking-wider">
                                                    <th colSpan={6} className="px-2 py-1 border border-gray-200 bg-gray-100 text-center">Application Code</th>
                                                    <th colSpan={5} className="px-2 py-1 border border-gray-200 bg-indigo-100 text-center" style={{ color: themeColor }}>Part Details</th>
                                                    <th colSpan={5} className="px-2 py-1 border border-gray-200 bg-amber-100 text-center text-amber-800">Kit Details</th>
                                                </tr>
                                                <tr className="bg-gray-50 text-[9.5px] font-semibold text-black uppercase tracking-wider">
                                                    {['Segment', 'App Code', 'System App Code', 'Engine Model', 'KVA', 'Emission'].map((h) => (
                                                        <th key={h} className="px-2 py-1 border border-gray-200 bg-gray-50 text-center">{h}</th>
                                                    ))}
                                                    {['Part Number', 'Part Description', 'Qty', 'Action', 'Svc Hrs'].map((h) => (
                                                        <th key={h} className="px-2 py-1 border border-gray-200 bg-indigo-50 text-center">{h}</th>
                                                    ))}
                                                    {['Kit Number', 'Kit Description', 'Qty', 'Action', 'Svc Hrs'].map((h) => (
                                                        <th key={h} className="px-2 py-1 border border-gray-200 bg-amber-50 text-center">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {srows.map((r, i) => {
                                                    const p = r.part;
                                                    return (
                                                        <tr key={i}>
                                                            {i === 0 && (
                                                                <>
                                                                    <td rowSpan={srows.length} className={`${td} text-center text-gray-600 align-middle`}>{hdr.segment}</td>
                                                                    <td rowSpan={srows.length} className={`${td} text-center align-middle`}>
                                                                        <span className="inline-flex items-center justify-center font-mono font-bold text-[11px] bg-[#1b2026] text-white px-2 py-0.5 rounded-md whitespace-nowrap">{hdr.appCode}</span>
                                                                    </td>
                                                                    <td rowSpan={srows.length} className={`${td} text-center font-mono text-gray-600 align-middle whitespace-nowrap`}>{hdr.systemAppCode}</td>
                                                                    <td rowSpan={srows.length} className={`${td} font-mono text-gray-700 align-middle whitespace-nowrap`}>{hdr.engineModel}</td>
                                                                    <td rowSpan={srows.length} className={`${td} text-center text-gray-600 align-middle whitespace-nowrap`}>{hdr.kva ? `${hdr.kva} KVA` : '—'}</td>
                                                                    <td rowSpan={srows.length} className={`${td} text-center text-gray-600 align-middle whitespace-nowrap`}>{hdr.emission}</td>
                                                                </>
                                                            )}
                                                            <td className={`${td} font-mono text-gray-800 whitespace-nowrap`}>{p?.partNumber || '—'}</td>
                                                            <td className={`${td} text-gray-700 min-w-[220px]`}>{p?.partDesc || '—'}</td>
                                                            <td className={`${td} text-center`}>{p?.qty || '—'}</td>
                                                            <td className={`${td} text-center`}><Chip a={p?.action} /></td>
                                                            <td className={`${td} text-center font-mono`}>{p?.serviceHours || '—'}</td>
                                                            <td className={`${td} font-mono text-gray-600 whitespace-nowrap bg-amber-50/20`}>{r.kit ? (r.kit.kitNumber || '—') : '—'}</td>
                                                            <td className={`${td} text-gray-600 min-w-[180px] bg-amber-50/20`}>{r.kit ? (r.kit.kitDesc || '—') : '—'}</td>
                                                            <td className={`${td} text-center text-gray-600 bg-amber-50/20`}>{r.kit ? (r.kit.qty || '—') : '—'}</td>
                                                            <td className={`${td} text-center bg-amber-50/20`}>{r.kit ? <Chip a={r.kit.action} /> : '—'}</td>
                                                            <td className={`${td} text-center font-mono text-gray-600 bg-amber-50/20`}>{r.kit ? (r.kit.serviceHours || '—') : '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="px-3 py-1.5 border-t border-gray-200 bg-gray-50 text-[10.5px] font-medium text-gray-700">
                                        {parts.length} service part line{parts.length === 1 ? '' : 's'} · {kits.length} kit{kits.length === 1 ? '' : 's'} · {looseCount} loose.
                                        Two separate lists side by side. Part Details: the service parts a kit copied, then the loose ones. Kit Details: all the kits, then “—” rows, then the loose parts copied across. A kit's own part lines are not printed here — they stay on the kit.
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
                <div className="flex items-center gap-3 px-5 py-2.5 pr-8 border-t border-gray-200 bg-white max-md:px-3 max-md:flex-wrap flex-shrink-0">
                    {/* Live counts — one pill each, so they read at a glance */}
                    <div className="flex items-center gap-1.5 max-sm:hidden">
                        {[
                            ['Parts', parts.length],
                            ['Kits', kits.length],
                            ['Loose', loosePartsList.length],
                        ].map(([lbl, n]) => (
                            <span key={lbl} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10.5px] font-bold text-gray-500">
                                {lbl}
                                <span className="rounded bg-white px-1.5 py-px font-mono text-[11px] text-gray-800">{n}</span>
                            </span>
                        ))}
                        {hrsFilter && stage === 'build' && (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10.5px] font-bold" style={{ color: themeColor }}>
                                <FunnelIcon className="h-3 w-3" /> {hrsFilter} Hr view — all intervals saved
                            </span>
                        )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        {stage === 'build' ? (
                            <>
                                <span className="text-[12.5px] font-bold text-gray-900 max-sm:hidden">Do you want to store in master?</span>
                                <button
                                    onClick={() => {
                                        if (!canSave) { toast.error('Please fill every required field first.'); return; }
                                        setStage('review');
                                    }}
                                    title={canSave ? 'Review the record before it is saved' : 'Fill every required field first'}
                                    className={`${BTN_PRIMARY} px-5 ${canSave ? '' : 'cursor-not-allowed opacity-60'}`} style={{ backgroundColor: themeColor }}>
                                    Yes <ChevronRightIcon className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={onClose} disabled={saving} className={BTN_GHOST}>Cancel</button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setStage('build')} disabled={saving} className={BTN_GHOST}>
                                    <ChevronRightIcon className="h-3.5 w-3.5 rotate-180" /> Back — edit
                                </button>
                                <button onClick={save} disabled={saving} className={`${BTN_PRIMARY} px-5`} style={{ backgroundColor: themeColor }}>
                                    <CheckCircleIcon className="h-4 w-4" /> {saving ? 'Saving…' : 'Save in Master'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <ResizeGrip onGripDown={onGripDown} onReset={resetSize} />
            </div>
        </div>
    );
};

/* ----------------------------- Master of Service ----------------------------- */
const MasterOfService = ({ onMasterChanged }) => {
    const [services, setServices] = useState([]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    const load = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        setErr('');
        try {
            const [s, r] = await Promise.all([getServices(), getAppCodes()]);
            setServices(s); setRows(r);
        } catch (e) { if (initial) setErr(e.message || 'Could not load'); else toast.error(e.message); }
        finally { if (initial) setLoading(false); }
    }, []);
    useEffect(() => { load(true); }, [load]);

    // Usage stats per service are O(services × rows × parts) — memoize so they
    // are not recomputed on unrelated re-renders. Pure derivation of state.
    const svcStats = useMemo(() => services.map((s) => ({
        s,
        used: rows.reduce((n, a) => n + a.parts.filter((p) => partService(services, p).id === s.id).length, 0),
        codes: rows.filter((a) => a.parts.some((p) => partService(services, p).id === s.id)).length,
    })), [services, rows]);

    const rename = async (s) => {
        const { value } = await Swal.fire({
            title: 'Rename service type', input: 'text', inputValue: s.name,
            inputLabel: `Interval stays ${s.hours} Hrs — the new name applies everywhere it is used.`,
            showCancelButton: true, confirmButtonColor: themeColor, cancelButtonColor: '#9ca3af',
            confirmButtonText: 'Save name', inputValidator: (v) => (!v.trim() ? 'Name is required' : undefined),
        });
        if (!value) return;
        try {
            await renameService(s.id, value.trim()); // s.id is the service key (sv500, ...)
            toast.success('Renamed');
            await load();
            onMasterChanged?.(); // service names feed the host page's coverage tab
        } catch (e) { toast.error(e.message || 'Could not rename'); }
    };

    if (loading) return <Loading />;
    if (err) return <ErrorBox msg={err} onRetry={() => load(true)} />;

    return (
        <div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 mb-4 text-[12px] text-amber-900/80 leading-relaxed">
                Your file's <b>Service schedules</b> column is currently blank, so each part is mapped to a service by its <b>Service Hours</b>.
                These names are the catalogue; renaming one updates every screen. Only the name is editable.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {svcStats.map(({ s, used, codes }) => {
                    return (
                        <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                                <span className="text-[14.5px] font-bold text-gray-800">{s.name}</span>
                                <span className="font-mono text-[11px] font-bold rounded px-2 py-0.5 whitespace-nowrap" style={{ color: '#c46a12', background: 'rgba(221,122,24,.12)' }}>{s.hours} Hrs</span>
                            </div>
                            <p className="text-[12px] text-gray-500">{s.note}</p>
                            <p className="text-[11px] text-gray-400 font-mono">{used} part lines · {codes} app codes</p>
                            <button onClick={() => rename(s)} className="self-start inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50 mt-1">
                                <PencilSquareIcon className="h-3.5 w-3.5" /> Rename
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/* ----------------------------- Import Data (replace + confirm) ----------------------------- */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const ImportData = ({ onMasterChanged }) => {
    const [preview, setPreview] = useState(null); // {items, news, reps, fname, sheet}
    const [openRows, setOpenRows] = useState({}); // which preview app-codes are expanded
    const [existing, setExisting] = useState(new Set());
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);

    const loadExisting = useCallback(async () => {
        try { const rows = await getAppCodes(); setExisting(new Set(rows.map((a) => a.appCode))); }
        catch { /* preview still works; everything will look "new" */ }
    }, []);
    useEffect(() => { loadExisting(); }, [loadExisting]);

    const onFile = (file) => {
        if (!file) return;
        const r = new FileReader();
        r.onload = (ev) => {
            try {
                const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
                // Pick the sheet that actually contains an "App Code" header — master
                // files often carry extra sheets (notes / working copies) before the
                // data sheet, so name alone isn't enough.
                const toAoa = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: '' });
                const hasAppCode = (n) => toAoa(n).some((r) => r.some((c) => norm(c).includes('appcode')));
                const sheet = wb.SheetNames.find((n) => /master|final/i.test(n) && hasAppCode(n))
                    || wb.SheetNames.find(hasAppCode)
                    || wb.SheetNames[0];
                parseRows(toAoa(sheet), file.name, sheet);
            } catch (e) { toast.error('Could not read file: ' + e.message); }
        };
        r.readAsArrayBuffer(file);
    };

    const parseRows = (rowsAoa, fname, sheet) => {
        let hi = rowsAoa.findIndex((r) => r.some((c) => norm(c).includes('appcode')));
        if (hi < 0) hi = 0;
        const hdr = rowsAoa[hi].map(norm), col = (n) => hdr.findIndex((h) => h === n || h.includes(n));
        // All indices matching a header name — the file repeats "Qty" / "Action" for
        // the kit columns, so the first hit is the part's and the next one AFTER the
        // kit-description column belongs to the kit.
        const colAll = (n) => hdr.reduce((acc, h, i) => ((h === n || h.includes(n)) ? [...acc, i] : acc), []);
        const qtyCols = colAll('qty'), actCols = colAll('action'), hrsCols = colAll('servicehours');
        // Kit columns: "Kit Number" / "Kit Description" (new master file). Legacy
        // files used "Part NO " / "Description " for the same pair — fall back to
        // those exact normalized names (distinct from partnumber / partdescription).
        const kitNo = (() => { const k = col('kitnumber'); return k >= 0 ? k : hdr.findIndex((h) => h === 'kitno' || h === 'partno'); })();
        // The master file misspells this header ("Kit Descreption"), so an exact
        // "kitdescription" match misses it and every kit description imports blank.
        // Accept any header starting with "kitdesc" before the legacy fallback.
        const kitDesc = (() => {
            const k = col('kitdescription');
            if (k >= 0) return k;
            const m = hdr.findIndex((h) => h.startsWith('kitdesc'));
            return m >= 0 ? m : hdr.findIndex((h) => h === 'description');
        })();
        const after = (indices, ref) => { const f = indices.find((i) => i > ref); return f === undefined ? -1 : f; };
        const C = {
            seg: col('segment'), app: col('appcode'), sys: col('systemappcode'), eng: col('enginemodel'), kva: col('kva'),
            emi: col('emmission') >= 0 ? col('emmission') : col('emission'), pn: col('partnumber'), pd: col('partdescription'),
            qty: qtyCols[0] ?? -1, act: actCols[0] ?? -1, hrs: hrsCols[0] ?? -1, sch: col('serviceschedules'),
            kitNo, kitDesc,
            kitQty: kitDesc >= 0 ? after(qtyCols, kitDesc) : (qtyCols[1] ?? -1),
            kitAct: kitDesc >= 0 ? after(actCols, kitDesc) : (actCols[1] ?? -1),
            // "Service Hours" can appear twice — after the part's Action AND after
            // the kit's. The first is the part's (it drives service mapping); the
            // one after Kit Description is the kit's own. A file with a single
            // Service Hours column (legacy layout) has no kit hours at all.
            kitHrs: hrsCols.length > 1 ? (kitDesc >= 0 ? after(hrsCols, kitDesc) : hrsCols[1]) : -1,
        };
        if (C.app < 0) { toast.error('No "App Code" column found in ' + sheet); return; }
        const g = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
        // The master file writes 0 in kit cells for parts that have no kit — treat
        // 0 / - as blank so those rows don't become bogus kit lines.
        const kv = (r, i) => { const v = g(r, i); return (v === '0' || v === '-') ? '' : v; };
        const groups = {}, order = [];
        // Excel writes a vertically-merged cell into its FIRST row only; every row
        // under it reads back blank. The master file merges App Code down its part
        // rows, so a row that carries a part line but no App Code belongs to the
        // code above it — without this it is silently dropped. Rows with no part
        // line at all are still skipped.
        let lastCode = '';
        for (let i = hi + 1; i < rowsAoa.length; i++) {
            const r = rowsAoa[i];
            const merged = !g(r, C.app) && (g(r, C.pn) || g(r, C.pd));
            const code = g(r, C.app) || (merged ? lastCode : '');
            if (!code) continue;
            lastCode = code;
            if (!groups[code]) { groups[code] = { appCode: code, segment: g(r, C.seg), systemAppCode: g(r, C.sys), engineModel: g(r, C.eng), kva: g(r, C.kva), emission: g(r, C.emi), parts: [] }; order.push(code); }
            if (g(r, C.pn) || g(r, C.pd)) {
                const kNo = kv(r, C.kitNo), kDe = kv(r, C.kitDesc), kQ = kv(r, C.kitQty), kA = kv(r, C.kitAct);
                // The file repeats the kit's Service Hours on EVERY row — including
                // the blank rows a kit merges down across. Keep it only on rows
                // that actually carry kit data, so merged member rows stay fully
                // blank and the kit block spans them correctly.
                groups[code].parts.push({
                    partNumber: g(r, C.pn), partDesc: g(r, C.pd), qty: g(r, C.qty), action: g(r, C.act),
                    serviceHours: g(r, C.hrs), schedule: g(r, C.sch),
                    altPartNo: kNo, altDesc: kDe, altQty: kQ, altAction: kA,
                    altServiceHours: (kNo || kDe || kQ || kA) ? kv(r, C.kitHrs) : '',
                });
            }
        }
        // The uploaded file still carries the kit columns on the part rows — that
        // is exactly how it tells us which parts made up each kit. Read them once
        // here and turn them into standalone kits (each with its own copies of
        // those part lines); after this the two sides are unrelated.
        order.forEach((c) => { groups[c].kits = kitsFromFileRows(groups[c].parts); });
        const items = order.map((c) => ({
            code: c, rec: groups[c], exists: existing.has(c),
            parts: groups[c].parts.length, kits: groups[c].kits.length,
        }));
        setPreview({ items, news: items.filter((i) => !i.exists), reps: items.filter((i) => i.exists), fname, sheet });
        setOpenRows({});
    };

    const confirmUpload = async () => {
        const { news, reps, items } = preview;
        const repList = reps.length
            ? `<div style="text-align:left;max-height:160px;overflow:auto;margin-top:8px;font-size:13px">${reps.map((i) => `<div style="padding:2px 0"><b>${i.code}</b> — ${i.rec.engineModel || ''} · ${i.parts} parts</div>`).join('')}</div>`
            : '';
        const r = await Swal.fire({
            title: 'Confirm upload', icon: 'question', width: 520,
            html: `<div style="text-align:left;font-size:13.5px">You're about to:<ul style="margin:6px 0 0;padding-left:18px;line-height:1.7">
                <li><b style="color:#2e7d52">Add ${news.length}</b> new application code(s).</li>
                <li><b style="color:#bf372e">Replace ${reps.length}</b> existing code(s) — the current record is deleted and re-inserted from the file.</li></ul>
                ${reps.length ? '<p style="margin:12px 0 0;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Codes that will be replaced</p>' : ''}${repList}</div>`,
            showCancelButton: true, confirmButtonColor: themeColor, cancelButtonColor: '#9ca3af',
            confirmButtonText: `Upload — add ${news.length}, replace ${reps.length}`,
        });
        if (!r.isConfirmed) return;
        setBusy(true);
        const t = toast.loading('Uploading…');
        // Announce the job app-wide: the request below is a fetch that outlives
        // this panel, so leaving the page does NOT cancel it. UploadGuard shows a
        // banner wherever the user goes, warns if they navigate away mid-upload,
        // and blocks a tab close / reload — the one thing that would kill it.
        const job = startUpload(`Part Detail master import (${items.length} app code${items.length === 1 ? '' : 's'})`);
        try {
            // Kits now travel in their own list, so the part lines are sent clean —
            // the file's per-row kit columns are not stored on them any more.
            const res = await importAppCodes(items.map((i) => ({
                ...i.rec,
                parts: i.rec.parts.map(({ altPartNo, altDesc, altQty, altAction, altServiceHours, ...p }) => p),
            })));
            // The Toaster lives at the app root, so this lands even if the user
            // has already moved to another page.
            toast.success(`Added ${res.added.length}, replaced ${res.replaced.length}`, { id: t });
            setPreview(null);
            setOpenRows({});
            if (fileRef.current) fileRef.current.value = '';
            await loadExisting();
            onMasterChanged?.(); // host page badge (App codes count) stays live
        } catch (e) {
            toast.error(e.message || 'Upload failed', { id: t });
        } finally { setBusy(false); finishUpload(job); }
    };

    return (
        <div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 mb-4 text-[12px] text-amber-900/80 leading-relaxed">
                <b>Re-uploads overwrite by app code.</b> Any code already present is deleted and re-inserted from the new file. You'll see exactly which codes are added and which are replaced, with a final confirmation before anything changes.
            </div>

            {/* Expected file format — same shape as the Data Upload page's panel */}
            <div className="bg-blue-50 rounded-lg border border-blue-200 overflow-hidden mb-4">
                <div className="px-3 py-2 border-b border-blue-200 bg-blue-100/50">
                    <h3 className="text-xs font-semibold text-black flex items-center gap-1.5">
                        <DocumentTextIcon className="h-3.5 w-3.5" />
                        Expected File Format for: Part Detail Info — Master Data
                    </h3>
                </div>
                <div className="p-3">
                    <div className="text-xs text-black mb-1 font-medium">Important columns in this file: {IMPORT_COLUMNS.length}</div>
                    <div className="bg-white rounded-lg border border-blue-200 p-2 max-h-28 overflow-y-auto qm-scroll">
                        <div className="flex flex-wrap gap-1.5">
                            {IMPORT_COLUMNS.map((c) => (
                                <span key={c}
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${c === IMPORT_REQUIRED_COLUMN ? 'bg-indigo-50 text-[#2f3192] border-indigo-200 font-bold' : 'bg-gray-100 text-black border-gray-200'}`}>
                                    {c.toUpperCase()}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="text-[11px] text-gray-600 mt-1.5 leading-snug">
                        Column names can be spelled in any case, spacing or punctuation (e.g. "part no." is accepted).
                        <b> {IMPORT_REQUIRED_COLUMN.toUpperCase()}</b> is the only column an import cannot proceed without — every part line is grouped under it.
                        Qty and Action appear twice in the file: the first pair belongs to the part, the pair after Kit Description to the kit.
                        The kit columns are how the file tells us which parts formed each kit — on import each kit becomes its own record holding its own copies of those part lines, after which parts and kits are independent.
                        Any other column in the file is ignored.
                    </div>
                </div>
            </div>

            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <div onClick={() => fileRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-gray-300 bg-white py-10 text-center cursor-pointer hover:border-[#2f3192] hover:bg-indigo-50/40 transition"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
                <ArrowUpTrayIcon className="h-9 w-9 mx-auto mb-2" style={{ color: themeColor }} />
                <p className="text-[15px] font-semibold text-gray-800">Drop a file here or click to browse</p>
                <p className="text-[12px] text-gray-400 mt-1">Supports .xlsx, .xlsm, .csv</p>
            </div>

            {preview && (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm mt-5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 max-sm:flex-wrap max-md:px-2">
                        <p className="text-[13px] font-semibold text-gray-800">Preview · {preview.fname}</p>
                        <span className="ml-auto text-[11px] text-gray-400 font-mono">sheet: {preview.sheet}</span>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-3 gap-2 mb-3 max-sm:grid-cols-1">
                            {[['APP Codes in file', preview.items.length, 'text-gray-800'], ['New will add', preview.news.length, 'text-emerald-600'], ['Existing will replace', preview.reps.length, 'text-red-600']].map(([l, n, c], i) => (
                                <div key={i} className="rounded-lg border border-gray-200 px-2 py-1.5 flex items-center justify-center gap-2">
                                    <span className={`text-[17px] font-bold font-mono leading-none ${c}`}>{n}</span>
                                    <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold leading-tight">{l}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-400 mb-2">Tap any row to expand and review its part lines before uploading.</p>
                        <div className="border border-gray-200 rounded-lg overflow-x-auto qm-scroll">
                            <table className="min-w-[560px] w-full border-collapse text-[12px]">
                                <thead><tr className="bg-gray-50 text-[10px] font-semibold text-black uppercase tracking-wider">
                                    <th className="px-2 py-2 w-8 border-b border-gray-200" />
                                    <th className="px-3 py-2 text-center border-b border-gray-200">App Code</th><th className="px-3 py-2 text-center border-b border-gray-200">Engine Model</th>
                                    <th className="px-3 py-2 text-center border-b border-gray-200">KVA</th><th className="px-3 py-2 text-center border-b border-gray-200">Parts</th><th className="px-3 py-2 text-center border-b border-gray-200">Kits</th><th className="px-3 py-2 text-center border-b border-gray-200">Action</th>
                                </tr></thead>
                                <tbody>
                                    {preview.items.map((i) => {
                                        const isOpen = !!openRows[i.code];
                                        return (
                                            <React.Fragment key={i.code}>
                                                <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setOpenRows((o) => ({ ...o, [i.code]: !o[i.code] }))}>
                                                    <td className="px-2 py-2 border-b border-gray-100 text-center">
                                                        <ChevronRightIcon className={`h-3.5 w-3.5 text-gray-400 transition ${isOpen ? 'rotate-90' : ''}`} />
                                                    </td>
                                                    <td className="px-3 py-2 border-b border-gray-100 font-mono font-semibold text-gray-800">{i.code}</td>
                                                    <td className="px-3 py-2 border-b border-gray-100 text-gray-600">{i.rec.engineModel || '—'}</td>
                                                    <td className="px-3 py-2 border-b border-gray-100 text-center font-mono">{i.rec.kva || '—'}</td>
                                                    <td className="px-3 py-2 border-b border-gray-100 text-center font-mono">{i.parts}</td>
                                                    <td className="px-3 py-2 border-b border-gray-100 text-center font-mono">{i.kits}</td>
                                                    <td className="px-3 py-2 border-b border-gray-100 text-center">
                                                        {i.exists
                                                            ? <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-red-50 text-red-600">Replace</span>
                                                            : <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600">Add · new</span>}
                                                    </td>
                                                </tr>
                                                {isOpen && (
                                                    <tr>
                                                        <td colSpan={7} className="border-b border-gray-100 bg-gray-50/60 p-0">
                                                            {i.rec.parts.length === 0 ? (
                                                                <div className="px-4 py-3 text-[11px] text-gray-400">No part lines found in the file for this code.</div>
                                                            ) : (
                                                                <div className="overflow-x-auto qm-scroll px-3 py-2">
                                                                    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                                                                        <table className="min-w-[920px] w-full text-[11.5px]">
                                                                            <thead>
                                                                                <tr className="bg-gray-100 text-[9.5px] font-bold text-black uppercase tracking-wider">
                                                                                    <th rowSpan={2} className="px-2 py-1 border border-gray-200 bg-gray-100 w-9 text-center">Sr.</th>
                                                                                    <th colSpan={5} className="px-2 py-1 border border-gray-200 bg-indigo-100 text-center" style={{ color: themeColor }}>Part Details</th>
                                                                                    <th colSpan={5} className="px-2 py-1 border border-gray-200 bg-amber-100 text-center text-amber-800">Kit Details</th>
                                                                                </tr>
                                                                                <tr className="bg-gray-50 text-[9.5px] font-semibold text-black uppercase tracking-wider">
                                                                                    {['Part Number', 'Description', 'Qty', 'Action', 'Svc Hrs'].map((h) => (
                                                                                        <th key={h} className="px-2 py-1 border border-gray-200 bg-indigo-50 text-center">{h}</th>
                                                                                    ))}
                                                                                    {['Kit Number', 'Kit Description', 'Qty', 'Action', 'Svc Hrs'].map((h) => (
                                                                                        <th key={h} className="px-2 py-1 border border-gray-200 bg-amber-50 text-center">{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {i.rec.parts.map((p, j) => (
                                                                                    <tr key={j} className="bg-white hover:bg-indigo-50/30 transition">
                                                                                        <td className="px-2 py-1 border border-gray-200 text-center font-mono text-gray-400">{j + 1}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 font-mono text-gray-700 whitespace-nowrap">{p.partNumber || '—'}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-gray-600 min-w-[220px]">{p.partDesc || '—'}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-center">{p.qty || '—'}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-center"><Chip a={p.action} /></td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-center font-mono">{p.serviceHours || '—'}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 font-mono text-gray-500 whitespace-nowrap bg-amber-50/20">{p.altPartNo || '—'}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-gray-500 min-w-[180px] bg-amber-50/20">{p.altDesc || '—'}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-center text-gray-500 bg-amber-50/20">{p.altQty || '—'}</td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-center bg-amber-50/20"><Chip a={p.altAction} /></td>
                                                                                        <td className="px-2 py-1 border border-gray-200 text-center font-mono text-gray-500 bg-amber-50/20">{p.altServiceHours || '—'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {busy && (
                            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                                <span className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
                                <p className="text-[12px] font-medium text-amber-900">
                                    <b>Data is uploading — please wait.</b> You can move to another page if you need to; the upload keeps running in the background and you'll get the result toast wherever you are. Do not close or reload this tab.
                                </p>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 mt-4 max-md:flex-wrap">
                            <button onClick={() => { setPreview(null); setOpenRows({}); if (fileRef.current) fileRef.current.value = ''; }} disabled={busy} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                            <button onClick={confirmUpload} disabled={busy || !preview.items.length} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: themeColor }}>
                                {busy ? 'Uploading…' : 'Review & upload'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MaintenanceScheduleMaster;
