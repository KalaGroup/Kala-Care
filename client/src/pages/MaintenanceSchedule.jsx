import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    ClipboardDocumentCheckIcon, Cog6ToothIcon, PrinterIcon,
    ArrowDownTrayIcon, CheckIcon, XMarkIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';
import MaintenanceScheduleMaster from '../components/MaintenanceScheduleMaster';
import {
    getAppCodes, getServices, logActivity, getRole,
    servicesForApp, partService, findApp, ACTION, themeColor, themeDark,
} from '../components/maintenanceApi';

/*
  Part Detail Info — read-only Service Selection for all allowed users.
  Master / IT admins get a "Manage Master" button that swaps the read-only view
  for the Master panel (manage data / services / import) IN THE SAME TAB (a Back
  button returns to the view). Reports live on a separate route
  (/maintenance-reports). Data is fetched live; each look-up is logged server-side.
*/

const chipCls = { R: 'bg-blue-50 text-blue-700', C: 'bg-amber-50 text-amber-700', T: 'bg-emerald-50 text-emerald-700' };
const Chip = ({ a }) => {
    const k = (a || '').trim().toUpperCase();
    if (!ACTION[k]) return null;
    return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono ${chipCls[k]}`}>{k}</span>;
};

/* ----------------------------- Watermarked print sheet ----------------------------- */
const PrintSheet = ({ app, services, parts, onClose }) => {
    const svcLabel = services.map((s) => s.name).join(', ') || '—';
    const svcHours = [...new Set(services.map((s) => s.hours))].join(' / ') || '—';
    const [logoError, setLogoError] = useState(false);
    const th = 'bg-[#13181d] text-white text-[9.5px] font-semibold px-2 py-1.5 border border-gray-400';
    const td = 'px-2 py-1 border border-gray-300 text-[11px]';

    return (
        <div className="fixed inset-0 z-[200] flex flex-col mx-print-stage" style={{ background: '#525659' }}>
            <style>{`
                @media print {
                    @page { size: A4; margin: 12mm; }
                    body * { visibility: hidden !important; }
                    .mx-sheet, .mx-sheet * { visibility: visible !important; }
                    .mx-print-bar { display: none !important; }
                    .mx-print-stage { position: absolute !important; background: #fff !important; }
                    .mx-print-scroll { overflow: visible !important; padding: 0 !important; display: block !important; }
                    .mx-sheet { box-shadow: none !important; width: auto !important; margin: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .mx-sheet table, .mx-sheet th, .mx-sheet td { border-color: #9ca3af !important; }
                }
            `}</style>
            <div className="mx-print-bar flex items-center gap-3 px-5 py-2.5 text-white max-md:flex-wrap max-md:gap-2 max-md:px-2" style={{ background: themeDark }}>
                <span className="text-[13px] font-semibold">PDF Preview · <span className="text-amber-300 font-bold">FOR INTERNAL USE ONLY</span></span>
                <div className="flex-1" />
                <button onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold transition hover:opacity-90" style={{ color: themeColor }}>
                    <PrinterIcon className="h-4 w-4" /> Print / Save as PDF
                </button>
                <button onClick={onClose}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1.5 text-[12px] font-medium transition">
                    <XMarkIcon className="h-4 w-4" /> Close
                </button>
            </div>
            <div className="mx-print-scroll flex-1 overflow-auto p-7 flex justify-center max-md:p-2">
                <div className="mx-sheet relative bg-white shadow-2xl" style={{ width: 880, maxWidth: '100%', minHeight: 1100, padding: '48px 52px', color: '#13181d', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
                        <div style={{ transform: 'rotate(-30deg)', fontSize: 64, fontWeight: 800, letterSpacing: '0.04em', whiteSpace: 'nowrap', color: 'rgba(191,55,46,0.07)' }}>FOR INTERNAL USE ONLY</div>
                    </div>
                    <div className="relative">
                        <div className="flex items-center gap-3.5 border-b-[2.5px] border-[#13181d] pb-3.5 mb-1.5">
                            {logoError ? (
                                <div className="h-14 w-14 flex-shrink-0 rounded-xl flex items-center justify-center text-white font-extrabold text-xl shadow-md" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>K</div>
                            ) : (
                                <img src="/logo.png" alt="KALA Care Logo" className="h-14 w-14 flex-shrink-0 object-contain" onError={() => setLogoError(true)} />
                            )}
                            <div>
                                <div className="text-[21px] font-extrabold tracking-tight">KALA CARE GLOBAL LLP</div>
                                <div className="text-[9.5px] tracking-[0.26em] font-bold mt-1" style={{ color: '#c46a12' }}>CPCB IV+ SERVICE DOCUMENTATION</div>
                            </div>
                        </div>
                        <div className="text-center text-[15px] font-extrabold tracking-wide my-4 uppercase">B-Check Service Template — CPCB IV+</div>
                        <table className="w-full border-collapse mb-5" style={{ tableLayout: 'fixed' }}>
                            <tbody>
                                {[
                                    [['Application Code', app.appCode], ['Type of Service', svcLabel]],
                                    [['Engine Model', app.engineModel || '—'], ['Selection (Hrs)', svcHours]],
                                    [['Segment', app.segment || '—'], ['KVA Rating', `${app.kva || '—'} KVA`]],
                                ].map((pair, r) => (
                                    <tr key={r}>
                                        {pair.map(([k, v], c) => (
                                            <React.Fragment key={c}>
                                                <td className="w-[16%] bg-gray-50 border border-gray-400 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-700 align-middle whitespace-nowrap">{k}</td>
                                                <td className="w-[34%] border border-gray-400 px-3 py-2 text-[12.5px] font-semibold font-mono align-middle break-words">{v}</td>
                                            </React.Fragment>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className={`${th} text-center`}>Sr.</th><th className={`${th} text-left`}>Part Number</th><th className={`${th} text-left`}>Description</th>
                                    <th className={`${th} text-center`}>Qty</th><th className={`${th} text-center`}>Action</th><th className={`${th} text-left`}>Part No</th>
                                    <th className={`${th} text-left`}>Description</th><th className={`${th} text-center`}>Qty</th><th className={`${th} text-center`}>Action</th>
                                    <th className={`${th} text-center`}>Svc Hrs</th><th className={`${th} text-center`}>Consumable</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parts.length === 0 ? (
                                    <tr><td colSpan={11} className="text-center py-5 text-gray-400 text-[11px]">No parts selected.</td></tr>
                                ) : parts.map((p, i) => (
                                    <tr key={i} className="even:bg-gray-50">
                                        <td className={`${td} text-center`}>{i + 1}</td>
                                        <td className={`${td} font-mono`}>{p.partNumber || '—'}</td>
                                        <td className={td}>{p.partDesc || '—'}</td>
                                        <td className={`${td} text-center`}>{p.qty}</td>
                                        <td className={`${td} text-center`}>{p.action}</td>
                                        <td className={`${td} font-mono`}>{p.altPartNo || '—'}</td>
                                        <td className={td}>{p.altDesc || '—'}</td>
                                        <td className={`${td} text-center`}>{p.altQty}</td>
                                        <td className={`${td} text-center`}>{p.altAction}</td>
                                        <td className={`${td} text-center font-mono`}>{p.serviceHours}</td>
                                        <td className={`${td} text-center`}>{p.consumable}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="flex justify-between items-center mt-6 pt-3 border-t border-gray-300 text-[10.5px] text-gray-500">
                            <span className="font-bold tracking-wide" style={{ color: '#bf372e' }}>Strictly For Internal Training &amp; Reference Purpose</span>
                            <span>Version 1 (Jan-26) · Generated {new Date().toLocaleDateString('en-GB')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ----------------------------- Service Selection view ----------------------------- */
const MaintenanceScheduleView = ({ isMaster, onManage }) => {
    const [master, setMaster] = useState([]);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    const [appCode, setAppCode] = useState('');
    const [selSvc, setSelSvc] = useState(null); // null = all (default); Set = explicit selection
    const [showPrint, setShowPrint] = useState(false);

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const [m, s] = await Promise.all([getAppCodes(), getServices()]);
            setMaster(m); setServices(s);
            setAppCode((prev) => (prev && m.some((a) => a.appCode === prev)) ? prev : (m[0]?.appCode || ''));
        } catch (e) {
            setErr(e.message || 'Could not load schedule');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const app = findApp(master, appCode);
    const avail = useMemo(() => (app ? servicesForApp(services, app) : []), [app, services]);
    const availIds = useMemo(() => new Set(avail.map((s) => s.id)), [avail]);

    const effective = useMemo(() => {
        if (selSvc === null) return new Set(availIds);
        return new Set([...selSvc].filter((id) => availIds.has(id)));
    }, [selSvc, availIds]);

    const parts = useMemo(() => (app ? app.parts.filter((p) => effective.has(partService(services, p).id)) : []), [app, services, effective]);
    const chosen = avail.filter((s) => effective.has(s.id));

    const changeApp = useCallback((code) => {
        setAppCode(code);
        setSelSvc(null);
        logActivity(code); // server records the signed-in user as the employee
    }, []);

    const toggleSvc = (id) => {
        setSelSvc((prev) => {
            const base = prev === null ? new Set(availIds) : new Set(prev);
            base.has(id) ? base.delete(id) : base.add(id);
            return base;
        });
    };

    const specCard = (k, v, hl) => (
        <div className={`px-2.5 py-1.5 border-r border-b border-gray-200 min-w-0 ${hl ? 'bg-indigo-50/50' : ''}`}>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-0.5 truncate">{k}</div>
            <div className={`text-[12.5px] font-semibold truncate ${hl ? 'text-[#2f3192]' : 'text-gray-800'}`} title={v}>{v}</div>
        </div>
    );

    return (
        <div className="min-h-screen">
            <style>{`.q-scroll{scrollbar-width:thin;scrollbar-color:#c7c9e0 transparent}.q-scroll::-webkit-scrollbar{height:6px;width:6px}.q-scroll::-webkit-scrollbar-thumb{background:#c7c9e0;border-radius:9999px}`}</style>

            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">
                {/* Intro */}
                <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                    <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                                <ClipboardDocumentCheckIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Part Detail Info</h1>
                                {/* <p className="text-[11px] text-white/70 leading-tight">Generate the B-Check service schedule for an application code</p> */}
                            </div>
                        </div>
                        {isMaster && (
                            <button onClick={onManage}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90" style={{ color: themeColor }}>
                                <Cog6ToothIcon className="h-3.5 w-3.5" /> Manage Master
                            </button>
                        )}
                    </div>
                </div>

                {err ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 py-12 text-center">
                        <p className="text-sm font-semibold text-red-700">{err}</p>
                        <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ backgroundColor: themeColor }}>
                            <ArrowPathIcon className="h-3.5 w-3.5" /> Try again
                        </button>
                    </div>
                ) : loading ? (
                    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm animate-pulse space-y-3">
                        <div className="h-10 rounded bg-gray-100" />
                        <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 rounded bg-gray-50" />)}</div>
                        <div className="h-40 rounded bg-gray-50" />
                    </div>
                ) : !app ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400 text-[13px]">
                        No application codes yet.{isMaster ? ' Use “Manage Master” to add or import them.' : ''}
                    </div>
                ) : (
                    <>
                        {/* Controls */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-3 shadow-sm">
                            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_auto] gap-3 items-end">
                                <div>
                                    <label className="block text-[12px] font-semibold text-gray-700 mb-1">Application Code</label>
                                    <select value={appCode} onChange={(e) => changeApp(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-mono text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition">
                                        {master.map((a) => <option key={a.appCode} value={a.appCode}>{a.appCode} — {a.engineModel || ''}</option>)}
                                    </select>
                                </div>
                                <button onClick={() => setShowPrint(true)}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-semibold text-white transition hover:opacity-90" style={{ backgroundColor: themeColor }}>
                                    <PrinterIcon className="h-4 w-4" /> Export PDF
                                </button>
                            </div>

                            {/* Service multi-select */}
                            <div className="mt-4 pt-3 border-t border-gray-100">
                                <div className="flex items-center gap-2 mb-2 max-sm:flex-wrap">
                                    <span className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Type of Service · multiple selection</span>
                                    <div className="ml-auto text-[11px]">
                                        <button onClick={() => setSelSvc(new Set(availIds))} className="font-semibold" style={{ color: themeColor }}>All</button>
                                        <span className="text-gray-300 mx-1">·</span>
                                        <button onClick={() => setSelSvc(new Set())} className="font-semibold text-gray-500">None</button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {avail.length === 0 && <span className="text-[12px] text-gray-400">No service types found for this code.</span>}
                                    {avail.map((s) => {
                                        const on = effective.has(s.id);
                                        return (
                                            <button key={s.id} onClick={() => toggleSvc(s.id)}
                                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${on ? 'border-[#2f3192] bg-indigo-50 text-[#2f3192]' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'}`}>
                                                <span className={`h-3.5 w-3.5 rounded flex items-center justify-center border ${on ? 'bg-[#2f3192] border-[#2f3192]' : 'border-gray-300'}`}>
                                                    {on && <CheckIcon className="h-2.5 w-2.5 text-white" />}
                                                </span>
                                                {s.name} <span className="font-mono opacity-70">· {s.hours}h</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Spec strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 border-t border-l border-gray-200 rounded-2xl overflow-hidden bg-white mb-3 shadow-sm">
                            {specCard('Engine Model', app.engineModel || '—')}
                            {specCard('Segment', app.segment || '—')}
                            {specCard('KVA Rating', `${app.kva || '—'} KVA`, true)}
                            {specCard('Emission Norm', app.emission || 'CPCB IV+')}
                            {specCard('System App Code', app.systemAppCode || app.appCode)}
                            {specCard('Services Selected', chosen.map((s) => s.short).join(', ') || '—')}
                            {specCard('Intervals', String(chosen.length))}
                            {specCard('Part Lines', String(parts.length))}
                        </div>

                        {/* Parts table */}
                        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 max-sm:flex-wrap max-md:px-2">
                                <p className="text-[13px] font-semibold text-gray-800">Service Parts &amp; Consumables</p>
                                <span className="text-[11px] text-gray-400 font-mono">{parts.length} lines · {chosen.length} service{chosen.length === 1 ? '' : 's'}</span>
                            </div>
                            <div className="overflow-x-auto q-scroll">
                                <table className="min-w-[900px] w-full border-collapse text-[12px]">
                                    <thead>
                                        <tr className="bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                                            {['Sr.', 'Part Number', 'Description', 'Qty', 'Act', 'Alt Part No', 'Alt Description', 'Qty', 'Act', 'Svc Hrs', 'Consumable'].map((h, i) => (
                                                <th key={i} className={`px-3 py-2 border border-gray-200 ${[1, 2, 3, 4, 7, 8, 9, 10].includes(i) ? 'text-center' : 'text-left'}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parts.length === 0 ? (
                                            <tr><td colSpan={11} className="text-center py-10 text-gray-400">Select at least one service type above to list its parts.</td></tr>
                                        ) : parts.map((p, i) => (
                                            <tr key={i} className="hover:bg-indigo-50/40 transition">
                                                <td className="px-3 py-2 border border-gray-200 font-mono text-gray-400">{i + 1}</td>
                                                <td className="px-3 py-2 border border-gray-200 font-mono text-gray-800 whitespace-nowrap">{p.partNumber || '—'}</td>
                                                <td className="px-3 py-2 border border-gray-200 text-gray-700 min-w-[200px]">{p.partDesc || '—'}</td>
                                                <td className="px-3 py-2 border border-gray-200 text-center">{p.qty}</td>
                                                <td className="px-3 py-2 border border-gray-200 text-center"><Chip a={p.action} /></td>
                                                <td className="px-3 py-2 border border-gray-200 font-mono text-gray-400 whitespace-nowrap">{p.altPartNo || '—'}</td>
                                                <td className="px-3 py-2 border border-gray-200 text-gray-400">{p.altDesc || '—'}</td>
                                                <td className="px-3 py-2 border border-gray-200 text-center text-gray-400">{p.altQty}</td>
                                                <td className="px-3 py-2 border border-gray-200 text-center"><Chip a={p.altAction} /></td>
                                                <td className="px-3 py-2 border border-gray-200 text-center font-mono">{p.serviceHours}</td>
                                                <td className="px-3 py-2 border border-gray-200 text-center">{p.consumable}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {showPrint && app && <PrintSheet app={app} services={chosen} parts={parts} onClose={() => setShowPrint(false)} />}
        </div>
    );
};

/* ----------------------------- Page wrapper ----------------------------- */
const MaintenanceSchedule = () => {
    const role = getRole();
    const isManager = role === 'master_admin' || role === 'it_admin';
    const [showMaster, setShowMaster] = useState(false);

    // Master / IT admin can flip into the Master panel in the SAME tab.
    if (showMaster && isManager) {
        return <MaintenanceScheduleMaster onBack={() => setShowMaster(false)} />;
    }
    return <MaintenanceScheduleView isMaster={isManager} onManage={() => setShowMaster(true)} />;
};

export default MaintenanceSchedule;