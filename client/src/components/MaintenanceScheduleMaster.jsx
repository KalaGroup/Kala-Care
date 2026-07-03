import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import {
    Cog6ToothIcon, ArrowLeftIcon, MagnifyingGlassIcon, PlusIcon,
    PencilSquareIcon, TrashIcon, ArrowDownTrayIcon, ChevronRightIcon, ChevronDownIcon, ArrowPathIcon,
    CircleStackIcon, WrenchScrewdriverIcon, ArrowUpTrayIcon, CheckIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import {
    getAppCodes, createAppCode, updateAppCode, deleteAppCode, importAppCodes,
    getServices, renameService, partService, ACTION, ORIG_HEADERS,
    themeColor, themeDark, themeSoft,
} from './maintenanceApi';
import { warmKey, readWarmCache, writeWarmCache } from '../utils/warmCache';

const chipCls = { R: 'bg-blue-50 text-blue-700', C: 'bg-amber-50 text-amber-700', T: 'bg-emerald-50 text-emerald-700' };
const Chip = React.memo(({ a }) => {
    const k = (a || '').trim().toUpperCase();
    if (!ACTION[k]) return null;
    return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${chipCls[k]}`}>{k}</span>;
});
const numSort = (arr) => arr.slice().sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));

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
const MaintenanceScheduleMaster = ({ onBack }) => {
    const [tab, setTab] = useState('master');
    const tabs = [
        { id: 'master', label: 'Master Data', Icon: CircleStackIcon },
        { id: 'service', label: 'Master of Service', Icon: WrenchScrewdriverIcon },
        { id: 'import', label: 'Import Data', Icon: ArrowUpTrayIcon },
    ];

    return (
        <div className="min-h-screen">
            <style>{`.qm-scroll{scrollbar-width:thin;scrollbar-color:#c7c9e0 transparent}.qm-scroll::-webkit-scrollbar{height:6px;width:6px}.qm-scroll::-webkit-scrollbar-thumb{background:#c7c9e0;border-radius:9999px}`}</style>
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
                <div className="flex items-center gap-1.5 mb-4 border-b border-gray-200 max-sm:flex-wrap">
                    {tabs.map(({ id, label, Icon }) => (
                        <button key={id} onClick={() => setTab(id)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${tab === id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            style={tab === id ? { color: themeColor } : undefined}>
                            <Icon className="h-4 w-4" /> {label}
                        </button>
                    ))}
                </div>

                {tab === 'master' && <MasterData />}
                {tab === 'service' && <MasterOfService />}
                {tab === 'import' && <ImportData />}
            </div>
        </div>
    );
};

/* ----------------------------- Master Data ----------------------------- */
const MasterData = () => {
    const [rows, setRows] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState({});
    const [sel, setSel] = useState({});
    const [editing, setEditing] = useState(undefined); // undefined=closed, null=add, obj=edit
    const [refreshing, setRefreshing] = useState(false);

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
            hrsOpts: numSort([...new Set([...distinctP((p) => p.serviceHours), ...services.map((s) => s.hours)])]),
        };
    }, [rows, services]);
    const existingCodes = useMemo(() => new Set(rows.map((a) => a.appCode)), [rows]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((a) =>
            a.appCode.toLowerCase().includes(q) || (a.engineModel || '').toLowerCase().includes(q) ||
            (a.kva || '').toLowerCase().includes(q) ||
            a.parts.some((p) => (p.partNumber || '').toLowerCase().includes(q) || (p.partDesc || '').toLowerCase().includes(q)));
    }, [query, rows]);

    const selCodes = Object.keys(sel).filter((k) => sel[k]);

    const exportXlsx = (codes) => {
        const list = codes ? rows.filter((a) => codes.includes(a.appCode)) : rows;
        const aoa = [ORIG_HEADERS];
        list.forEach((a) => a.parts.forEach((p) => aoa.push([
            a.segment, a.appCode, a.systemAppCode, a.engineModel, a.kva, a.emission,
            p.partNumber, p.partDesc, p.qty, p.action, p.altPartNo, p.altDesc, p.altQty, p.altAction, p.serviceHours, p.consumable, p.schedule,
        ])));
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = ORIG_HEADERS.map((h, i) => ({ wch: [8, 12, 14, 16, 6, 9, 16, 40, 5, 7, 12, 14, 5, 7, 12, 11, 16][i] || 12 }));
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
        } catch (e) { toast.error(e.message || 'Could not delete'); }
    };

    // Returns on success, throws on failure (so the modal can stay open).
    const saveApp = async (isEdit, code, rec) => {
        if (isEdit) await updateAppCode(code, rec);
        else await createAppCode(rec);
        toast.success(isEdit ? 'Updated' : 'Added');
        await load();
    };

    if (loading) return <Loading />;
    if (err) return <ErrorBox msg={err} onRetry={() => load(true)} />;

    return (
        <div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">

                {/* Left side - Search */}
                <div className="relative max-sm:w-full">
                    <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search code, engine, KVA or part"
                        className="w-56 sm:w-72 rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-[13px] outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 text-black transition max-sm:w-full"
                    />
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
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition"
                            >
                                Clear
                            </button>

                            <button
                                onClick={() => exportXlsx(selCodes)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-[12px] font-semibold text-white transition"
                            >
                                <ArrowDownTrayIcon className="h-4 w-4" /> Export selected
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => exportXlsx(null)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-[12px] font-semibold text-white transition"
                    >
                        <ArrowDownTrayIcon className="h-4 w-4" /> Export all
                    </button>

                    <button
                        onClick={doRefresh}
                        disabled={refreshing}
                        title="Refresh"
                        className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 transition disabled:opacity-50"
                    >
                        <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                        onClick={() => setEditing(null)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition hover:opacity-90"
                        style={{ backgroundColor: themeColor }}
                    >
                        <PlusIcon className="h-4 w-4" /> Add Application Code
                    </button>
                </div>
            </div>

            {/* List — grid table */}
            {shown.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400 text-[13px]">{rows.length === 0 ? 'No records yet — add one or import a file.' : 'No records match.'}</div>
            ) : (
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm overflow-x-auto qm-scroll">
                    <div className="overflow-x-auto qm-scroll">
                    <table className="min-w-[820px] w-full border-collapse text-[12px]">
                        <thead>
                            <tr className="bg-gray-50 text-[10px] font-semibold text-black uppercase tracking-wider">
                                <th className="px-3 py-2 border border-gray-200 w-10 text-center">
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
                                <th className="px-3 py-2 border border-gray-200 text-center">App Code</th>
                                <th className="px-3 py-2 border border-gray-200 text-center">Engine Model</th>
                                <th className="px-3 py-2 border border-gray-200 text-center">KVA</th>
                                <th className="px-3 py-2 border border-gray-200 text-center">Segment</th>
                                <th className="px-3 py-2 border border-gray-200 text-center">Parts</th>
                                <th className="px-3 py-2 border border-gray-200 text-center w-28">Actions</th>
                                <th className="px-3 py-2 border border-gray-200 w-10 text-center" />
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((a) => {
                                const isOpen = open[a.appCode], on = !!sel[a.appCode];
                                return (
                                    <React.Fragment key={a.appCode}>
                                        <tr className={`transition ${on ? 'bg-indigo-50/50' : 'hover:bg-indigo-50/30'}`}>
                                            <td className="px-3 py-2 border border-gray-200 text-center">
                                                <span onClick={() => setSel((s) => ({ ...s, [a.appCode]: !s[a.appCode] }))}
                                                    className={`inline-flex h-[16px] w-[16px] cursor-pointer items-center justify-center rounded border align-middle ${on ? 'bg-[#2f3192] border-[#2f3192]' : 'border-gray-300 bg-white'}`}>
                                                    {on && <CheckIcon className="h-3 w-3 text-white" />}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 border border-gray-200">
                                                <span className="inline-flex min-w-[112px] items-center justify-center font-mono font-bold text-[12px] bg-[#1b2026] text-white px-2 py-1 rounded-md whitespace-nowrap">{a.appCode}</span>
                                            </td>
                                            <td className="px-3 py-2 border border-gray-200 font-mono text-gray-700 whitespace-nowrap">{a.engineModel || '—'}</td>
                                            <td className="px-3 py-2 border border-gray-200 text-center text-gray-600 whitespace-nowrap">{a.kva || '—'} KVA</td>
                                            <td className="px-3 py-2 border border-gray-200 text-center text-gray-600">{a.segment || '—'}</td>
                                            <td className="px-3 py-2 border border-gray-200 text-center font-mono text-gray-600">{a.parts.length}</td>
                                            <td className="px-3 py-2 border border-gray-200">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button onClick={() => setEditing(a)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50">
                                                        <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
                                                    </button>
                                                    <button onClick={() => onDelete(a)} className="rounded-lg border border-red-100 text-red-600 bg-white p-1.5 hover:bg-red-50">
                                                        <TrashIcon className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 border border-gray-200 text-center cursor-pointer hover:bg-gray-50"
                                                onClick={() => setOpen((o) => ({ ...o, [a.appCode]: !o[a.appCode] }))}
                                                title={isOpen ? 'Hide parts' : 'Show parts'}>
                                                <ChevronRightIcon className={`h-4 w-4 text-gray-400 transition inline ${isOpen ? 'rotate-90' : ''}`} />
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr>
                                                <td colSpan={8} className="border border-gray-200 bg-gray-50/40 p-0">
                                                    <div className="overflow-x-auto qm-scroll">
                                                        <table className="min-w-[640px] w-full border-collapse text-[12px]">
                                                            <thead>
                                                                <tr className="bg-gray-100/70 text-[10px] font-semibold text-black uppercase tracking-wider">
                                                                    {['Sr.', 'Part Number', 'Description', 'Qty', 'Act', 'Svc Hrs', 'Service Type', 'Consumable'].map((h, i) => (
                                                                        <th key={i} className={`px-3 py-1.5 border border-gray-200 ${[1, 2, 3, 4, 5, 7].includes(i) ? 'text-center' : 'text-left'}`}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {a.parts.map((p, i) => (
                                                                    <tr key={i} className="bg-white">
                                                                        <td className="px-3 py-1.5 border border-gray-200 font-mono text-gray-400">{i + 1}</td>
                                                                        <td className="px-3 py-1.5 border border-gray-200 font-mono text-gray-800">{p.partNumber || '—'}</td>
                                                                        <td className="px-3 py-1.5 border border-gray-200 text-gray-700">{p.partDesc || '—'}</td>
                                                                        <td className="px-3 py-1.5 border border-gray-200 text-center">{p.qty}</td>
                                                                        <td className="px-3 py-1.5 border border-gray-200 text-center"><Chip a={p.action} /></td>
                                                                        <td className="px-3 py-1.5 border border-gray-200 text-center font-mono">{p.serviceHours}</td>
                                                                        <td className="px-3 py-1.5 border border-gray-200 text-[11px] text-gray-500">{partService(services, p).short}</td>
                                                                        <td className="px-3 py-1.5 border border-gray-200 text-center">{p.consumable}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            {editing !== undefined && (
                <AppFormModal initial={editing} opts={opts} existing={existingCodes}
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
const Combo = ({ value, onChange, options, placeholder, mono, fieldCls }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const wrapRef = useRef(null);
    const inputRef = useRef(null);

    const measure = () => {
        const el = inputRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const maxH = 184;
        const spaceBelow = window.innerHeight - r.bottom;
        const up = spaceBelow < maxH + 8 && r.top > spaceBelow;
        setPos({ left: r.left, width: r.width, up, top: r.bottom + 4, bottom: window.innerHeight - r.top + 4 });
    };
    const openNow = () => { measure(); setOpen(true); };

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

    return (
        <div className="relative" ref={wrapRef}>
            <input
                ref={inputRef}
                className={`${fieldCls} ${mono ? 'font-mono' : ''}`}
                style={{ paddingRight: 26 }}
                value={value}
                placeholder={placeholder}
                onChange={(e) => { onChange(e.target.value); open ? measure() : openNow(); }}
                onFocus={openNow}
            />
            <button type="button" tabIndex={-1} onClick={() => (open ? setOpen(false) : openNow())}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                <ChevronDownIcon className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
            </button>
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

/* ------------- Add / Edit modal with parts editor (dropdowns from data) ------------- */
const blankPart = () => ({ partNumber: '', partDesc: '', qty: '1', action: 'R', serviceHours: '500', consumable: '', altPartNo: '', altDesc: '', altQty: '', altAction: '', schedule: '' });

const AppFormModal = ({ initial, opts, existing, onClose, onSave }) => {
    const isEdit = !!initial;

    // ---- Local draft (Option 1): auto-save the in-progress form to the browser
    // so an interruption (refresh, crash, session timeout, accidental Cancel)
    // never wipes it. This is a DRAFT only — it never touches the database and
    // the full mandatory validation still runs before anything is committed.
    const makeInitialHdr = () => ({
        appCode: initial?.appCode || '', segment: initial?.segment || 'PG', kva: initial?.kva || (opts.kvaOpts[0] || ''),
        engineModel: initial?.engineModel || '', systemAppCode: initial?.systemAppCode || '', emission: initial?.emission || 'CPCB IV+',
    });
    const makeInitialParts = () => (initial ? JSON.parse(JSON.stringify(initial.parts)) : [blankPart()]);
    // Add drafts share one slot; edit drafts are keyed per app code.
    const draftKey = isEdit ? `msm:appDraft:edit:${initial.appCode}` : 'msm:appDraft:new';
    // Snapshot of the pristine form — we only persist (and only prompt) when the
    // current form actually differs from this, so blank/no-op drafts never linger.
    const baseRef = useRef(JSON.stringify({ hdr: makeInitialHdr(), parts: makeInitialParts() }));

    const [hdr, setHdr] = useState(makeInitialHdr);
    const [parts, setParts] = useState(makeInitialParts);
    const [saving, setSaving] = useState(false);
    const [pendingDraft, setPendingDraft] = useState(null); // a found draft awaiting Restore/Discard

    // On open, offer to restore a saved draft (only if it differs from the default form).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const saved = JSON.parse(raw);
            const same = JSON.stringify({ hdr: saved.hdr, parts: saved.parts }) === baseRef.current;
            if (same) localStorage.removeItem(draftKey); // stale no-op draft
            else setPendingDraft(saved);
        } catch { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-save as the user types (debounced). Only writes when the form differs
    // from the pristine baseline, so it never clobbers a pending draft on mount
    // and never stores an empty/unchanged form.
    useEffect(() => {
        const cur = JSON.stringify({ hdr, parts });
        if (cur === baseRef.current) return;
        const t = setTimeout(() => {
            try { localStorage.setItem(draftKey, JSON.stringify({ hdr, parts, savedAt: Date.now() })); } catch { /* quota/full — ignore */ }
        }, 400);
        return () => clearTimeout(t);
    }, [hdr, parts, draftKey]);

    const restoreDraft = () => {
        const d = pendingDraft;
        if (d?.hdr) setHdr((h) => ({ ...h, ...d.hdr }));
        if (Array.isArray(d?.parts) && d.parts.length) setParts(d.parts.map((p) => ({ ...blankPart(), ...p })));
        setPendingDraft(null);
    };
    const discardDraft = () => {
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
        setPendingDraft(null);
    };

    const setPart = (i, k, v) => setParts((arr) => arr.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
    const sel = 'w-full rounded-md border border-gray-200 px-1.5 py-1 text-[12px] bg-white outline-none focus:ring-1 focus:ring-indigo-200';
    const inp = 'w-full rounded-md border border-gray-200 px-1.5 py-1 text-[12px] bg-white outline-none focus:ring-1 focus:ring-indigo-200';
    const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition';
    const label = 'block text-[12px] font-semibold text-gray-700 mb-1';

    // Everything is mandatory. A part line is "complete" only when all six fields
    // are filled; a new line can't be added (and nothing saved) until then.
    const partComplete = (p) =>
        p.partNumber.trim() && p.partDesc.trim() && String(p.qty).trim() &&
        p.action.trim() && String(p.serviceHours).trim() && p.consumable.trim();
    const allPartsComplete = parts.length > 0 && parts.every(partComplete);
    const hdrComplete =
        hdr.appCode.trim() && hdr.segment.trim() && String(hdr.kva).trim() &&
        hdr.engineModel.trim() && hdr.systemAppCode.trim() && hdr.emission.trim();
    const canSave = hdrComplete && allPartsComplete;

    const save = async () => {
        const code = hdr.appCode.trim();
        if (!hdrComplete) { toast.error('Please fill every application-code field.'); return; }
        if (!isEdit && existing.has(code)) { toast.error(`${code} already exists — use Edit`); return; }
        if (parts.length === 0) { toast.error('Add at least one part line.'); return; }
        if (!allPartsComplete) { toast.error('Please fill every field in all part lines.'); return; }
        const rec = {
            appCode: code, segment: hdr.segment.trim(), kva: String(hdr.kva).trim(), engineModel: hdr.engineModel.trim(),
            systemAppCode: hdr.systemAppCode.trim(), emission: hdr.emission.trim(),
            parts,
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
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 max-md:p-2" style={{ background: 'rgba(20,26,32,.55)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 max-lg:max-w-[95vw] max-md:my-3">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-200 max-md:px-3">
                    <h3 className="text-[16px] font-bold text-gray-800">{isEdit ? 'Edit' : 'Add'} Application Code</h3>
                    <button onClick={onClose} disabled={saving} className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-50"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                <div className="px-5 py-4 max-h-[64vh] overflow-y-auto max-md:px-3">
                    {pendingDraft && (
                        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <span className="flex-1 text-[12px] font-medium text-amber-900">
                                You have an unsaved draft{pendingDraft.savedAt ? ` from ${new Date(pendingDraft.savedAt).toLocaleString()}` : ''}. Restore it?
                            </span>
                            <button type="button" onClick={restoreDraft}
                                className="rounded-md bg-amber-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-amber-700 transition">
                                Restore
                            </button>
                            <button type="button" onClick={discardDraft}
                                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-medium text-amber-800 hover:bg-amber-100 transition">
                                Discard
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div><label className={label}>App Code <span className="text-red-500">*</span></label>
                            <input className={`${field} font-mono ${isEdit ? 'opacity-60' : ''}`} value={hdr.appCode} disabled={isEdit}
                                onChange={(e) => setHdr((h) => ({ ...h, appCode: e.target.value }))} placeholder="e.g. 6H.8439" /></div>
                        <div><label className={label}>Segment <span className="text-red-500">*</span></label>
                            <select className={field} value={hdr.segment} onChange={(e) => setHdr((h) => ({ ...h, segment: e.target.value }))}>
                                <option value="PG">PG</option>
                                <option value="Industrial">Industrial</option>
                            </select></div>
                        <div><label className={label}>KVA Rating <span className="text-red-500">*</span></label>
                            <Combo value={hdr.kva} onChange={(v) => setHdr((h) => ({ ...h, kva: v }))} options={opts.kvaOpts} placeholder="e.g. 30 (or type new)" mono fieldCls={field} /></div>
                        <div><label className={label}>Engine Model <span className="text-red-500">*</span></label>
                            <input className={`${field} font-mono`} value={hdr.engineModel} onChange={(e) => setHdr((h) => ({ ...h, engineModel: e.target.value }))} placeholder="e.g. 6K1080ETA 4G1" /></div>
                        <div><label className={label}>System App Code <span className="text-red-500">*</span></label>
                            <input className={`${field} font-mono`} value={hdr.systemAppCode} onChange={(e) => setHdr((h) => ({ ...h, systemAppCode: e.target.value }))} placeholder="e.g. 3H.8902" /></div>
                        <div><label className={label}>Emission Norm <span className="text-red-500">*</span></label>
                            <Combo value={hdr.emission} onChange={(v) => setHdr((h) => ({ ...h, emission: v }))} options={opts.emiOpts} placeholder="e.g. CPCB IV+ (or type new)" fieldCls={field} /></div>
                    </div>

                    <div className="flex items-center justify-between mt-5 mb-2 max-md:flex-wrap max-md:gap-2">
                        <span className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Service Parts <span className="text-red-500">*</span></span>
                        <button onClick={() => setParts((a) => [...a, blankPart()])} disabled={!allPartsComplete}
                            title={allPartsComplete ? 'Add another part line' : 'Fill every field in the current part line(s) first'}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                            <PlusIcon className="h-3.5 w-3.5" /> Add part line
                        </button>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-x-auto qm-scroll">
                        <table className="min-w-[660px] w-full border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-[9.5px] font-semibold text-gray-500 uppercase tracking-wide">
                                    <th className="px-2 py-1.5 text-left">Part Number</th><th className="px-2 py-1.5 text-left">Description</th>
                                    <th className="px-2 py-1.5 text-left w-14">Qty</th><th className="px-2 py-1.5 text-left w-16">Action</th>
                                    <th className="px-2 py-1.5 text-left w-20">Svc Hrs</th><th className="px-2 py-1.5 text-left w-24">Consumable</th><th className="w-9" />
                                </tr>
                            </thead>
                            <tbody>
                                {parts.map((p, i) => (
                                    <tr key={i} className="border-t border-gray-100">
                                        <td className="px-1.5 py-1"><input className={`${inp} font-mono`} value={p.partNumber} onChange={(e) => setPart(i, 'partNumber', e.target.value)} /></td>
                                        <td className="px-1.5 py-1"><input className={inp} value={p.partDesc} onChange={(e) => setPart(i, 'partDesc', e.target.value)} /></td>
                                        <td className="px-1.5 py-1"><input className={`${inp} font-mono`} value={p.qty} onChange={(e) => setPart(i, 'qty', e.target.value)} /></td>
                                        <td className="px-1.5 py-1"><Combo value={p.action} onChange={(v) => setPart(i, 'action', v)} options={opts.actOpts} mono fieldCls={inp} /></td>
                                        <td className="px-1.5 py-1"><Combo value={p.serviceHours} onChange={(v) => setPart(i, 'serviceHours', v)} options={opts.hrsOpts} mono fieldCls={inp} /></td>
                                        <td className="px-1.5 py-1"><input className={`${inp} font-mono`} value={p.consumable} onChange={(e) => setPart(i, 'consumable', e.target.value)} /></td>
                                        <td className="px-1.5 py-1 text-center">
                                            <button onClick={() => setParts((a) => a.filter((_, j) => j !== i))} className="rounded-md border border-gray-200 p-1 text-gray-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50">
                                                <TrashIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {parts.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-3 text-[12px]">No parts yet — add a line.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    {/* <p className="text-[11px] text-gray-400 mt-2">Service Hours sets which service type the part belongs to. A new interval automatically creates a matching service type on the server.</p> */}
                    {!canSave && (
                        <p className="text-[11px] font-medium text-red-500 mt-1">All fields are required — fill every application-code field and every column in each part line.</p>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-200 max-md:px-3 max-md:flex-wrap">
                    <button onClick={onClose} disabled={saving} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                    <button onClick={save} disabled={saving || !canSave} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed" style={{ backgroundColor: themeColor }}>
                        {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add to master')}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ----------------------------- Master of Service ----------------------------- */
const MasterOfService = () => {
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
const ImportData = () => {
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
                const sheet = wb.SheetNames.find((n) => /master/i.test(n)) || wb.SheetNames[0];
                const rowsAoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: '' });
                parseRows(rowsAoa, file.name, sheet);
            } catch (e) { toast.error('Could not read file: ' + e.message); }
        };
        r.readAsArrayBuffer(file);
    };

    const parseRows = (rowsAoa, fname, sheet) => {
        let hi = rowsAoa.findIndex((r) => r.some((c) => norm(c).includes('appcode')));
        if (hi < 0) hi = 0;
        const hdr = rowsAoa[hi].map(norm), col = (n) => hdr.findIndex((h) => h === n || h.includes(n));
        const C = {
            seg: col('segment'), app: col('appcode'), sys: col('systemappcode'), eng: col('enginemodel'), kva: col('kva'),
            emi: col('emmission') >= 0 ? col('emmission') : col('emission'), pn: col('partnumber'), pd: col('partdescription'),
            qty: col('qty'), act: col('action'), hrs: col('servicehours'), cons: col('consumable'), sch: col('serviceschedules'),
        };
        if (C.app < 0) { toast.error('No "App Code" column found in ' + sheet); return; }
        const g = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
        const groups = {}, order = [];
        for (let i = hi + 1; i < rowsAoa.length; i++) {
            const r = rowsAoa[i], code = g(r, C.app); if (!code) continue;
            if (!groups[code]) { groups[code] = { appCode: code, segment: g(r, C.seg), systemAppCode: g(r, C.sys), engineModel: g(r, C.eng), kva: g(r, C.kva), emission: g(r, C.emi), parts: [] }; order.push(code); }
            if (g(r, C.pn) || g(r, C.pd)) groups[code].parts.push({ partNumber: g(r, C.pn), partDesc: g(r, C.pd), qty: g(r, C.qty), action: g(r, C.act), serviceHours: g(r, C.hrs), consumable: g(r, C.cons), schedule: g(r, C.sch), altPartNo: '', altDesc: '', altQty: '', altAction: '' });
        }
        const items = order.map((c) => ({ code: c, rec: groups[c], exists: existing.has(c), parts: groups[c].parts.length }));
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
        try {
            const res = await importAppCodes(items.map((i) => i.rec));
            toast.success(`Added ${res.added.length}, replaced ${res.replaced.length}`, { id: t });
            setPreview(null);
            setOpenRows({});
            if (fileRef.current) fileRef.current.value = '';
            await loadExisting();
        } catch (e) {
            toast.error(e.message || 'Upload failed', { id: t });
        } finally { setBusy(false); }
    };

    return (
        <div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 mb-4 text-[12px] text-amber-900/80 leading-relaxed">
                <b>Re-uploads overwrite by app code.</b> Any code already present is deleted and re-inserted from the new file. You'll see exactly which codes are added and which are replaced, with a final confirmation before anything changes.
            </div>

            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <div onClick={() => fileRef.current?.click()}
                className="rounded-2xl border-2 border-dashed border-gray-300 bg-white py-10 text-center cursor-pointer hover:border-[#2f3192] hover:bg-indigo-50/40 transition"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
                <ArrowUpTrayIcon className="h-9 w-9 mx-auto mb-2" style={{ color: themeColor }} />
                <p className="text-[15px] font-semibold text-gray-800">Drop a file here or click to browse</p>
                <p className="text-[12px] text-gray-400 mt-1">Expects columns like Segment · App Code · Engine Model · KVA · Part Number · Qty · Action · Service Hours</p>
            </div>

            {preview && (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm mt-5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 max-sm:flex-wrap max-md:px-2">
                        <p className="text-[13px] font-semibold text-gray-800">Preview · {preview.fname}</p>
                        <span className="ml-auto text-[11px] text-gray-400 font-mono">sheet: {preview.sheet}</span>
                    </div>
                    <div className="p-4">
                        <div className="grid grid-cols-3 gap-3 mb-4 max-sm:grid-cols-1 max-sm:gap-2">
                            {[['APP Codes in file', preview.items.length, 'text-gray-800'], ['New will add', preview.news.length, 'text-emerald-600'], ['Existing will replace', preview.reps.length, 'text-red-600']].map(([l, n, c], i) => (
                                <div key={i} className="rounded-xl border border-gray-200 p-3 text-center">
                                    <div className={`text-2xl font-bold font-mono ${c}`}>{n}</div>
                                    <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mt-1">{l}</div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-400 mb-2">Tap any row to expand and review its part lines before uploading.</p>
                        <div className="border border-gray-200 rounded-lg overflow-x-auto qm-scroll">
                            <table className="min-w-[560px] w-full border-collapse text-[12px]">
                                <thead><tr className="bg-gray-50 text-[10px] font-semibold text-black uppercase tracking-wider">
                                    <th className="px-2 py-2 w-8 border-b border-gray-200" />
                                    <th className="px-3 py-2 text-left border-b border-gray-200">App Code</th><th className="px-3 py-2 text-left border-b border-gray-200">Engine Model</th>
                                    <th className="px-3 py-2 text-center border-b border-gray-200">KVA</th><th className="px-3 py-2 text-center border-b border-gray-200">Parts</th><th className="px-3 py-2 text-center border-b border-gray-200">Action</th>
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
                                                    <td className="px-3 py-2 border-b border-gray-100 text-center">
                                                        {i.exists
                                                            ? <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-red-50 text-red-600">Replace</span>
                                                            : <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600">Add · new</span>}
                                                    </td>
                                                </tr>
                                                {isOpen && (
                                                    <tr>
                                                        <td colSpan={6} className="border-b border-gray-100 bg-gray-50/60 p-0">
                                                            {i.rec.parts.length === 0 ? (
                                                                <div className="px-4 py-3 text-[11px] text-gray-400">No part lines found in the file for this code.</div>
                                                            ) : (
                                                                <div className="overflow-x-auto qm-scroll px-3 py-2">
                                                                    <table className="min-w-[520px] w-full border-collapse text-[11.5px]">
                                                                        <thead>
                                                                            <tr className="text-[9.5px] font-semibold text-gray-500 uppercase tracking-wide">
                                                                                <th className="px-2 py-1 text-left">Sr.</th>
                                                                                <th className="px-2 py-1 text-left">Part Number</th>
                                                                                <th className="px-2 py-1 text-left">Description</th>
                                                                                <th className="px-2 py-1 text-center">Qty</th>
                                                                                <th className="px-2 py-1 text-center">Act</th>
                                                                                <th className="px-2 py-1 text-center">Svc Hrs</th>
                                                                                <th className="px-2 py-1 text-center">Consumable</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {i.rec.parts.map((p, j) => (
                                                                                <tr key={j} className="border-t border-gray-200/70">
                                                                                    <td className="px-2 py-1 font-mono text-gray-400">{j + 1}</td>
                                                                                    <td className="px-2 py-1 font-mono text-gray-700">{p.partNumber || '—'}</td>
                                                                                    <td className="px-2 py-1 text-gray-600">{p.partDesc || '—'}</td>
                                                                                    <td className="px-2 py-1 text-center">{p.qty || '—'}</td>
                                                                                    <td className="px-2 py-1 text-center"><Chip a={p.action} /></td>
                                                                                    <td className="px-2 py-1 text-center font-mono">{p.serviceHours || '—'}</td>
                                                                                    <td className="px-2 py-1 text-center">{p.consumable || '—'}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
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