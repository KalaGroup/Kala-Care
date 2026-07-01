import React, { useState, useMemo, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
    DocumentChartBarIcon, ChartBarIcon, ClockIcon, UsersIcon,
    ArrowDownTrayIcon, ArrowPathIcon, Squares2X2Icon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
    getAppCodes, getServices, getActivity, partService, findApp,
    themeColor, themeDark, themeSoft, fmtDateTime,
} from '../components/maintenanceApi';

/*
  Part Detail Info — Reports — kept on its own page (route: /maintenance-reports).
  Two reports as in-page tabs:
    • Service Coverage  — which services each application code carries (tick / cross)
    • Search Activity   — look-up counts + who & when (employee + date/time)
  Data is fetched live from the backend.
*/

const sortByHours = (svcs) => svcs.slice().sort((a, b) => (parseFloat(a.hours) || 0) - (parseFloat(b.hours) || 0));

const MaintenanceReports = () => {
    const [tab, setTab] = useState('coverage');
    const [master, setMaster] = useState([]);
    const [services, setServices] = useState([]);
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try {
            const [m, s, a] = await Promise.all([getAppCodes(), getServices(), getActivity()]);
            setMaster(m); setServices(s); setActivity(a);
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

            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10">
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
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Part Detail Info — Reports</h1>
                                <p className="text-[11px] text-white/70 leading-tight">Service coverage and application-code look-up activity</p>
                            </div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                            App codes: <b className="font-bold">{master.length}</b>
                        </span>
                    </div>
                </div>

                {/* ===== Tabs ===== */}
                <div className="flex items-center gap-1.5 mb-4 border-b border-gray-200">
                    {[
                        { id: 'coverage', label: 'Service Applicability', Icon: Squares2X2Icon },
                        { id: 'activity', label: 'Search Activity Count', Icon: ClockIcon },
                    ].map(({ id, label, Icon }) => (
                        <button key={id} onClick={() => setTab(id)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${tab === id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            style={tab === id ? { color: themeColor } : undefined}>
                            <Icon className="h-4 w-4" /> {label}
                        </button>
                    ))}
                    <button onClick={load} title="Refresh"
                        className="ml-auto mb-1 rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition">
                        <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {err ? (
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
                    ? <CoverageReport master={master} services={services} />
                    : <ActivityReport master={master} activity={activity} />}
            </div>
        </div>
    );
};

/* ----------------------------- Service Coverage ----------------------------- */
const CoverageReport = ({ master, services }) => {
    const cols = useMemo(() => sortByHours(services), [services]);

    const exportXlsx = () => {
        const aoa = [['Model', 'App Code', 'Segment', ...cols.map((c) => c.short)]];
        master.forEach((a) => {
            const ids = new Set(a.parts.map((p) => partService(services, p).id));
            aoa.push([a.engineModel, a.appCode, a.segment, ...cols.map((c) => (ids.has(c.id) ? 'Yes' : 'No'))]);
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Coverage');
        XLSX.writeFile(wb, 'Service_Coverage_Report.xlsx');
    };

    if (master.length === 0) return <Empty label="No application codes yet." />;

    return (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                <ChartBarIcon className="h-4 w-4" style={{ color: themeColor }} />
                <p className="text-[13px] font-semibold text-gray-800">Service Coverage Matrix</p>
                <span className="text-[11px] text-gray-400 hidden sm:inline">{master.length} codes × {cols.length} services · ✓ has parts · ✗ none</span>
                <button onClick={exportXlsx}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90"
                    style={{ backgroundColor: themeColor }}>
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export Excel
                </button>
            </div>
            <div className="overflow-x-auto r-scroll">
                <table className="min-w-[760px] w-full border-collapse text-[12px]">
                    <thead>
                        <tr className="bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                            <th className="px-3 py-2 text-left border border-gray-200">Model</th>
                            <th className="px-3 py-2 text-left border border-gray-200">App Code</th>
                            <th className="px-3 py-2 text-center border border-gray-200">Segment</th>
                            {cols.map((c) => (
                                <th key={c.id} title={c.name} className="px-3 py-2 text-center border border-gray-200 whitespace-nowrap">{c.short}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {master.map((a) => {
                            const ids = new Set(a.parts.map((p) => partService(services, p).id));
                            return (
                                <tr key={a.appCode} className="hover:bg-indigo-50/40 transition">
                                    <td className="px-3 py-2 border border-gray-200 font-mono text-gray-700">{a.engineModel || '—'}</td>
                                    <td className="px-3 py-2 border border-gray-200 font-mono font-semibold text-gray-800">{a.appCode}</td>
                                    <td className="px-3 py-2 border border-gray-200 text-center text-gray-600">{a.segment || '—'}</td>
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
                    </tbody>
                </table>
            </div>
        </div>
    );
};

/* ----------------------------- Search Activity ----------------------------- */
const ActivityReport = ({ master, activity }) => {
    // Date-range filter (drives the whole tab: stats, ranking, log, export).
    // Dates compared as plain YYYYMMDD numbers in UTC — the same frame the rows
    // are displayed in (timeZone:'UTC') — so there are no off-by-one timezone bugs.
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [employee, setEmployee] = useState('');

    // All employees that appear in the activity log (for the filter dropdown).
    const employees = useMemo(
        () => [...new Set(activity.map((e) => e.employee).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [activity]
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

    const fmtDate = (dk) => (dk
        ? new Date(dk + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : '\u2014');

    const exportXlsx = () => {
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
                    {/* Header: title + date range + employee filter + export (beside the title) */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                        <div className="flex items-center gap-2">
                            <ClockIcon className="h-4 w-4" style={{ color: themeColor }} />
                            <p className="text-[13px] font-semibold text-gray-800 whitespace-nowrap">Activity Log — who &amp; when</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1">
                                <span className="text-[11px] font-semibold text-gray-500">From</span>
                                <input type="date" value={fromDate} max={toDate || undefined}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition" />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[11px] font-semibold text-gray-500">To</span>
                                <input type="date" value={toDate} min={fromDate || undefined}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition" />
                            </div>
                            <select value={employee} onChange={(e) => setEmployee(e.target.value)}
                                className="max-w-[200px] rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-black outline-none focus:border-gray-300 focus:ring-2 focus:ring-indigo-100 transition">
                                <option value="">All employees</option>
                                {employees.map((emp) => <option key={emp} value={emp}>{emp}</option>)}
                            </select>
                            {(fromDate || toDate || employee) && (
                                <button onClick={() => { setFromDate(''); setToDate(''); setEmployee(''); }}
                                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition">
                                    Clear
                                </button>
                            )}
                        </div>

                        <button onClick={exportXlsx} disabled={data.groups.length === 0}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                            style={{ backgroundColor: themeColor }}>
                            <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export Excel
                        </button>
                    </div>

                    {/* Count line */}
                    <div className="px-4 py-1.5 border-b border-gray-200 bg-white text-[11px] text-gray-400">
                        {data.filtering
                            ? `Showing ${data.shownTotal} of ${data.allTotal} look-ups · ${data.groups.length} rows`
                            : `${data.allTotal} look-ups total · ${data.groups.length} rows`}
                    </div>

                    {data.groups.length === 0 ? (
                        <div className="py-14 text-center text-gray-400 text-[13px]">No look-ups match the selected filters.</div>
                    ) : (
                        <div className="overflow-x-auto r-scroll">
                            <table className="min-w-[720px] w-full border-collapse text-[12px]">
                                <thead>
                                    <tr className="bg-gray-50 text-[10px] sm:text-[11px] font-semibold text-black uppercase tracking-wider">
                                        <th className="px-3 py-2 text-left border border-gray-200 w-40">Date</th>
                                        <th className="px-3 py-2 text-left border border-gray-200">Employee</th>
                                        <th className="px-3 py-2 text-left border border-gray-200">App Code</th>
                                        <th className="px-3 py-2 text-left border border-gray-200">Engine Model</th>
                                        <th className="px-3 py-2 text-center border border-gray-200">Segment</th>
                                        <th className="px-3 py-2 text-center border border-gray-200 w-20">Visits</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.groups.map((g, i) => (
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
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const Empty = ({ label }) => (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400 text-[13px]">{label}</div>
);

export default MaintenanceReports;