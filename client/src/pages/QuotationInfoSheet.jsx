import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    DocumentTextIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, EyeIcon,
    MagnifyingGlassIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';
import QuotationInfoSheetMaster from '../components/QuotationInfoSheetMaster';

// -- Theme (matches Knowledge Bank) -------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47, 49, 146, 0.10)';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const prettyDate = (iso) => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

// ---- Read-only view (what a normal visit to the page shows) ----
const QuotationInfoSheetView = ({ isMaster, currentUser }) => {
    const authHeaders = useMemo(() => ({
        'user-id': currentUser?.user_id || '',
        'user-role': currentUser?.role || '',
    }), [currentUser]);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/quotation-info/`, { headers: authHeaders });
            const data = await res.json().catch(() => ({}));
            setItems(Array.isArray(data) ? data : (data.items || []));
        } catch {
            setItems([]);
        } finally { setLoading(false); }
    }, [authHeaders]);

    useEffect(() => { load(); }, [load]);

    // Master upload panel opens in its OWN tab via ?master=1.
    const openMaster = () => window.open('/quotation-info-sheet?master=1', '_blank');

    const viewFile = (row) => window.open(`${API_BASE_URL}/quotation-info/${row.id}/view`, '_blank');
    const downloadFile = (row) => window.open(`${API_BASE_URL}/quotation-info/${row.id}/download`, '_blank');

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter((x) =>
            (x.title || '').toLowerCase().includes(q) ||
            (x.product || '').toLowerCase().includes(q) ||
            (x.party || '').toLowerCase().includes(q));
    }, [items, query]);

    const actBase = 'rounded-md p-1 bg-gray-50 border border-gray-200 hover:bg-white transition';

    return (
        <div className="min-h-screen font-sans">
            <style>{`
                .q-scroll { scrollbar-width: thin; scrollbar-color: #c7c9e0 transparent; }
                .q-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
                .q-scroll::-webkit-scrollbar-thumb { background: #c7c9e0; border-radius: 9999px; }
            `}</style>

            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10">
                {/* ===== Intro box ===== */}
                <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                    <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                                <DocumentTextIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Quotation Info Sheet</h1>
                                <p className="text-[11px] text-white/70 leading-tight">Reference quotation information by product and party</p>
                            </div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                                Entries: <b className="font-bold">{shown.length}</b>
                            </span>
                            {isMaster && (
                                <button onClick={openMaster}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90"
                                    style={{ color: themeColor }}>
                                    <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Upload
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ===== Toolbar ===== */}
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search quotations"
                            className="w-48 sm:w-64 rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-[13px] outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 text-black transition" />
                    </div>
                    <button onClick={load} title="Refresh"
                        className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
                        <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {/* ===== Body ===== */}
                {loading ? (
                    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 animate-pulse">
                                <div className="h-9 w-9 rounded-lg bg-gray-100 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="h-3 w-1/3 rounded bg-gray-100" />
                                    <div className="mt-1.5 h-2.5 w-1/5 rounded bg-gray-100" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : shown.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
                        <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: themeSoft }}>
                            <DocumentTextIcon className="h-7 w-7" style={{ color: themeColor }} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-gray-700">{query ? 'Nothing matches your search' : 'No quotation info yet'}</p>
                        <p className="mt-1 text-[12px] text-gray-400">
                            {query ? 'Try a different title or product.' : (isMaster ? 'Use Upload to add the first entry.' : 'Nothing has been added here yet.')}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto q-scroll shadow-sm">
                        <div className="min-w-[820px] divide-y divide-gray-200">
                            <div className="grid grid-cols-12 divide-x divide-gray-200 bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                                <div className="col-span-1 px-3 py-1.5 text-center">Sr.</div>
                                <div className="col-span-3 px-3 py-1.5 text-center">Title</div>
                                <div className="col-span-2 px-3 py-1.5 text-center">Product</div>
                                <div className="col-span-2 px-3 py-1.5 text-center">Party</div>
                                <div className="col-span-2 px-3 py-1.5 text-center">Date</div>
                                <div className="col-span-2 px-3 py-1.5 text-center">Actions</div>
                            </div>
                            {shown.map((row, i) => (
                                <div key={row.id ?? i} className="grid grid-cols-12 divide-x divide-gray-200 text-[11px] sm:text-xs items-stretch hover:bg-indigo-50/40 transition">
                                    <div className="col-span-1 px-3 py-2 flex items-center justify-center text-gray-500">{i + 1}</div>
                                    <div className="col-span-3 px-3 py-2 flex items-center min-w-0">
                                        <span className="font-semibold truncate text-gray-800" title={row.title}>{row.title || '—'}</span>
                                    </div>
                                    <div className="col-span-2 px-3 py-2 flex items-center justify-center text-gray-600 truncate" title={row.product || ''}>{row.product || '—'}</div>
                                    <div className="col-span-2 px-3 py-2 flex items-center justify-center text-gray-600 truncate" title={row.party || ''}>{row.party || '—'}</div>
                                    <div className="col-span-2 px-3 py-2 flex items-center justify-center text-gray-500 whitespace-nowrap">{prettyDate(row.quote_date || row.created_at)}</div>
                                    <div className="col-span-2 px-3 py-2 flex items-center justify-center gap-1 flex-wrap">
                                        <button onClick={() => viewFile(row)} className={`${actBase} text-blue-600 hover:bg-blue-50`} title="View"><EyeIcon className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => downloadFile(row)} className={`${actBase} text-emerald-600 hover:bg-emerald-50`} title="Download"><ArrowDownTrayIcon className="h-3.5 w-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ---- Page wrapper: switches to the master panel when ?master=1 ----
const QuotationInfoSheet = () => {
    const [searchParams] = useSearchParams();
    const isMasterView = searchParams.get('master') === '1';

    const currentUser = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('user')) || {}; } catch { return {}; }
    }, []);
    const isMaster = currentUser?.role === 'master_admin';

    if (isMasterView && isMaster) {
        return <QuotationInfoSheetMaster />;
    }

    return <QuotationInfoSheetView isMaster={isMaster} currentUser={currentUser} />;
};

export default QuotationInfoSheet;