import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
    ArrowUpTrayIcon, CalendarDaysIcon, ChevronDownIcon, CurrencyRupeeIcon,
    ExclamationTriangleIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline';

import { canExportExcel } from '../utils/exportPermission';
import {
    XL, A, CENTER, LEFT, F_CNT, loadExcelJS, newSheet, saveBook,
} from '../utils/pmsExport';
import { GRID, HScrollBox } from '../components/reportChrome';

/* ----------------------------------------------------------------------------
   OPEN QUOTATION TRACKER — the branch-wise service quotation and invoicing summary.

   For a period, per branch: how much service business was QUOTED and how much
   was actually INVOICED, labour and parts kept apart. The gap between them is
   open quotation value — business already asked for that has not converted.

   Read from GET /api/quotation-tracker/report, which reads two uploads:

     'Pulse Quotation - Service Only'   the QUOTE half
        Creation Date  the period · Service Dealer  the branch
        Labor Amount   a row above zero is one labour quotation; SUM is its value
        Parts Amount   a row above zero is one part quotation;   SUM is its value

     'All Invoice Detailed Report'      the INVOICE half
        INVOICE DATE     the period
        INVOICE STATUS   'Cancelled' lines dropped
        INVOICE SEGMENT  'Service' only — OTC and Agreement are not service work
        BRANCH ID        the branch, and the join key to the quote half
        INVOICE TYPE     'Labor' -> labour columns, 'Parts' -> part columns
        INVOICE AMOUNT   SUM is the invoiced value

   THE ONE THING THAT MUST NOT BE MISREAD: the invoice report carries no
   quotation reference, so the two halves are read SIDE BY SIDE for the same
   period — they are not the same transactions matched up, and quote ÷ invoice is
   therefore not a conversion rate. The note under the table says so on the page,
   and the exported workbook carries the same sentence.

   The page chrome follows Knowledge Bank (gradient hero, pill counters, one
   toolbar row) and the table follows the PMS grids, so the figures read like
   every other report in the ERP.
---------------------------------------------------------------------------- */

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same three tokens Knowledge Bank uses) ------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';

const pillBase = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium';

// ---- numbers ------------------------------------------------------------
// Counts and money both group the Indian way (1,20,450), and a zero prints as a
// dash: on this sheet a real zero and "nothing happened here" are the same
// thing, and a column of 0s hides the rows that DID move.
const nf = (v) => (v ? Number(v).toLocaleString('en-IN') : '-');
const money = (v) => (v ? Math.round(Number(v)).toLocaleString('en-IN') : '-');

// ---- dates --------------------------------------------------------------
const iso = (d) => {
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
// 01-04-2026 — the way the exported sheet's header writes a date.
const dmy = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('-') : '');
const stamp = (s) => (s
    ? new Date(s).toLocaleString('en-GB',
        { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—');

// The Indian financial year (1 April) the given day falls in.
const fyStart = (d) => new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);

// 01 Apr 26 — the way the period button writes a date.
const fmtDayYr = (s) => (s
    ? new Date(String(s).slice(0, 10) + 'T00:00:00')
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    : '');

// Quick Select — the same list, in the same order, the SR Allocation Report's
// period box offers. Financial Year sits FIRST and opens its year list in
// place; every other key is worked out against the wall clock in applyQuick().
const QUICK_OPTIONS = [
    { key: 'fy', label: 'Financial Year' },
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'current_month', label: 'Current Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'last_quarter', label: 'Last Quarter' },
    { key: 'last_6m', label: 'Last 6 Months' },
    { key: 'full', label: 'Full Data' },
];

// The nine figures of a row, in the order the sheet prints them.
const COLUMNS = [
    { key: 'labour_quote', head: 'Labour Quote', kind: 'count' },
    { key: 'labour_quote_amount', head: 'Labour Quote Amount', kind: 'money' },
    { key: 'labour_invoice', head: 'Labour Invoice', kind: 'count' },
    { key: 'labour_invoice_amount', head: 'Labour Invoice Amount', kind: 'money' },
    { key: 'part_quote', head: 'Part Quote', kind: 'count' },
    { key: 'part_quote_amount', head: 'Part Quote Amount', kind: 'money' },
    { key: 'part_invoice', head: 'Part Invoice', kind: 'count' },
    { key: 'part_invoice_amount', head: 'Part Invoice Amount', kind: 'money' },
];

const OpenQuotationTracker = () => {
    const fyNow = fyStart(new Date()).getFullYear();
    const initial = [iso(fyStart(new Date())), iso(new Date())];   // this FY to date
    // What the LOADED report covers — the export and the period button
    // read this, not the calendar, so moving the calendar without pressing
    // Apply cannot relabel figures counted over a different period.
    const [applied, setApplied] = useState({ from: initial[0], to: initial[1] });
    // The period box: whether it is open, which quick key is lit, the calendar's
    // own selection, and the FY year list that opens inside it.
    const [showRangePicker, setShowRangePicker] = useState(false);
    const [activePeriod, setActivePeriod] = useState('fy');
    const [pickStart, setPickStart] = useState(new Date(initial[0] + 'T00:00:00'));
    const [pickEnd, setPickEnd] = useState(new Date(initial[1] + 'T00:00:00'));
    const [quickFy, setQuickFy] = useState(fyNow);
    const [fyOpen, setFyOpen] = useState(false);
    const fyChoices = [];
    for (let y = fyNow - 5; y <= fyNow + 10; y++) fyChoices.push(y);
    const [report, setReport] = useState(null);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const userId = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('user') || 'null')?.user_id || ''; }
        catch { return ''; }
    }, []);

    const load = useCallback(async (f, t) => {
        setLoading(true);
        setError('');
        try {
            const [rep, st] = await Promise.all([
                axios.get(`${API_BASE_URL}/quotation-tracker/report`, {
                    params: { from: f, to: t },
                    headers: { 'user-id': userId },
                }),
                axios.get(`${API_BASE_URL}/quotation-tracker/data-status`, {
                    headers: { 'user-id': userId },
                }).catch(() => ({ data: null })),
            ]);
            setReport(rep.data);
            setApplied({ from: rep.data?.period?.from || f, to: rep.data?.period?.to || t });
            if (st.data) setStatus(st.data);
        } catch (e) {
            setError(e.response?.data?.detail || e.message || 'Could not load the report');
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(initial[0], initial[1]); /* first paint */ }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    const rows = report?.rows || [];
    const total = report?.total || null;
    const unmapped = report?.unmapped_dealers || [];

    // Every source day the two uploads carry — what bounds the calendar and what
    // "Full Data" applies. Known only once data-status has answered.
    const dataRange = useMemo(() => {
        const day = (v) => (v ? String(v).slice(0, 10) : '');
        const lo = [day(status?.quotes?.date_from), day(status?.invoices?.date_from)].filter(Boolean).sort();
        const hi = [day(status?.quotes?.date_to), day(status?.invoices?.date_to)].filter(Boolean).sort();
        return { min: lo[0] || null, max: hi[hi.length - 1] || null };
    }, [status]);

    // The calendar stops at today, but it must still reach the newest uploaded
    // day when a file carries a forward-dated row.
    const calMax = useMemo(() => {
        const today = iso(new Date());
        return new Date(((dataRange.max && dataRange.max > today) ? dataRange.max : today) + 'T00:00:00');
    }, [dataRange.max]);

    // ONE way in for every period: light the key, move the calendar with it so
    // the box reopens on what is actually loaded, shut the box, and fetch.
    const apply = (key, f, t) => {
        setActivePeriod(key);
        setPickStart(new Date(f + 'T00:00:00'));
        setPickEnd(new Date(t + 'T00:00:00'));
        setFyOpen(false);
        setShowRangePicker(false);
        load(f, t);
    };

    // Financial Year (1 Apr – 31 Mar), never reaching past today: a year still
    // running is FY-to-date, exactly as the report's own default period is.
    const applyFy = (y) => {
        const today = iso(new Date());
        const end = `${y + 1}-03-31`;
        setQuickFy(y);
        apply('fy', `${y}-04-01`, end > today ? today : end);
    };

    const applyQuick = (key) => {
        if (key === 'fy') { applyFy(quickFy); return; }
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const d = (yr, mo, dy) => iso(new Date(yr, mo, dy));
        // Current Month is the fall-through: the 1st of this month through today.
        let f = d(now.getFullYear(), now.getMonth(), 1);
        let t = iso(now);
        if (key === 'today') { f = t = iso(now); }
        else if (key === 'yesterday') { f = t = d(now.getFullYear(), now.getMonth(), now.getDate() - 1); }
        else if (key === 'last_week') {
            const mon = new Date(now);                       // Monday of this week
            mon.setDate(mon.getDate() - ((now.getDay() + 6) % 7));
            f = d(mon.getFullYear(), mon.getMonth(), mon.getDate() - 7);
            t = d(mon.getFullYear(), mon.getMonth(), mon.getDate() - 1);
        } else if (key === 'last_month') {
            f = d(now.getFullYear(), now.getMonth() - 1, 1);
            t = d(now.getFullYear(), now.getMonth(), 0);      // last day of last month
        } else if (key === 'last_quarter') f = d(now.getFullYear(), now.getMonth() - 3, now.getDate() + 1);
        else if (key === 'last_6m') f = d(now.getFullYear(), now.getMonth() - 6, now.getDate() + 1);
        else if (key === 'full') {
            if (!dataRange.min || !dataRange.max) return;
            f = dataRange.min;
            t = dataRange.max;
        }
        apply(key, f, t);
    };

    const applyCustomRange = () => {
        if (!pickStart || !pickEnd) return;
        apply('custom', iso(pickStart), iso(pickEnd));
    };

    // The exported workbook still carries the period as its header row — the
    // page shows it on the period button instead.
    const title = `Service Quote From ${dmy(applied.from)} To ${dmy(applied.to)}`;

    const exportExcel = async () => {
        if (!total) return;
        try {
            const ExcelJS = await loadExcelJS();
            const { wb, ws, put } = newSheet(ExcelJS, 'Open Quotation Tracker', title, [
                { width: 19 }, { width: 12 },
                ...COLUMNS.map((c) => ({ width: c.kind === 'money' ? 17 : 12 })),
            ]);

            const HD = { font: { bold: true, color: A('111827') }, fill: XL.HEAD, align: CENTER };
            ['Branch', 'Branch Code', ...COLUMNS.map((c) => c.head)]
                .forEach((h, i) => put(2, i + 1, h, HD));
            ws.getRow(2).height = 30;

            let r = 3;
            const line = (row, o = {}) => {
                put(r, 1, row.branch, { ...o, align: LEFT });
                put(r, 2, row.branch_id || '', { ...o, align: CENTER });
                COLUMNS.forEach((c, i) => put(r, 3 + i, row[c.key] || 0,
                    { ...o, align: CENTER, fmt: F_CNT }));
                r += 1;
            };
            rows.forEach((row, i) => line(row, { fill: i % 2 ? XL.ROW_B : XL.ROW_A }));
            line(total, { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } });

            // The workbook carries the same caveat the page prints: without it a
            // reader would take quote / invoice for a conversion rate.
            //
            // The ROW HEIGHT has to be set by hand. Excel does not auto-fit a
            // MERGED cell to its wrapped text — it was written correctly before
            // and simply clipped to the default 15pt, so the note was in the
            // file and invisible. So: work the number of lines out from the text
            // against the sheet's own total width, and size one merged row to fit.
            r += 1;
            const noteText = 'Note: quote and invoice columns cover the same period but are '
                + 'NOT line-matched - the invoice report carries no quotation reference, so '
                + 'an invoice here may answer an earlier quote. Cancelled invoices and OTC '
                + 'business are excluded.';
            const sheetChars = 19 + 12
                + COLUMNS.reduce((n, c) => n + (c.kind === 'money' ? 17 : 12), 0);
            const noteLines = Math.max(1, Math.ceil(noteText.length / (sheetChars - 2)));
            const note = ws.getCell(r, 1);
            note.value = noteText;
            note.font = { size: 9, italic: true, color: A('4B5563') };
            note.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
            ws.mergeCells(r, 1, r, COLUMNS.length + 2);
            ws.getRow(r).height = noteLines * 12 + 4;

            await saveBook(wb, `Open_Quotation_Tracker_${applied.from}_to_${applied.to}.xlsx`);
            toast.success('Open Quotation Tracker exported');
        } catch (e) {
            toast.error(`Export failed: ${e.message}`);
        }
    };

    // ---- grid cell classes, the same ones the PMS grids use ----
    const TH = 'px-1.5 py-1.5 text-[10px] font-semibold text-black text-center border-b border-l border-gray-400 leading-tight';
    const CELL = 'px-1.5 py-1.5 text-center text-[11px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
    const LEFT_C = 'px-1.5 py-1.5 text-left text-[11px] text-black border-b border-l border-gray-400 whitespace-nowrap';
    // Amounts read as a column of figures, so they sit on their right edge; the
    // counts beside them stay centred.
    const MONEY_C = `${CELL} !text-right !pr-2.5`;

    return (
        <div className="min-h-screen font-sans">
            <style>{`
                .qi-scroll { scrollbar-width: thin; scrollbar-color: #c7c9e0 transparent; }
                .qi-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
                .qi-scroll::-webkit-scrollbar-track { background: transparent; }
                .qi-scroll::-webkit-scrollbar-thumb { background: #c7c9e0; border-radius: 9999px; }
                .qi-scroll::-webkit-scrollbar-thumb:hover { background: #a9abce; }
                /* The wrapper's border IS the table's right edge — without this
                   the last column's own inset rule sits a pixel inside it and
                   the edge reads as two hairlines. Bottom rule kept. */
                .qi-grid th:last-child,
                .qi-grid td:last-child { box-shadow: inset 0 -1px 0 0 var(--pms-grid-line); }
            `}</style>

            <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">

                {/* ===== Hero header — the reporting period lives on its RIGHT,
                       in the same picker the SR Allocation Report uses ===== */}
                <div className="rounded-2xl px-3 sm:px-5 py-3 mb-4 text-white relative"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    {/* decorations clipped on their own layer so the picker popover can escape */}
                    <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
                        <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    </div>
                    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                                <CurrencyRupeeIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold leading-tight">Open Quotation Tracker</h1>
                                <p className="text-[11px] text-white/70 leading-tight">
                                    Branch-wise service quotation &amp; invoicing summary &mdash; labour and parts
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center flex-wrap gap-2 lg:justify-end">
                            {total && (
                                <>
                                    <span className={`${pillBase} bg-white/15 text-white`}>
                                        Quotations: <b className="font-bold">
                                            {nf(total.labour_quote + total.part_quote)}
                                        </b>
                                    </span>
                                    <span className={`${pillBase} bg-white/15 text-white`}>
                                        Invoices: <b className="font-bold">
                                            {nf(total.labour_invoice + total.part_invoice)}
                                        </b>
                                    </span>
                                </>
                            )}
                            {/* The Refresh button used to carry the in-flight spinner.
                                Applying a period is now the only way to refetch, so the
                                spinner has to stand on its own. */}
                            {loading && (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            )}

                            {/* Period picker — opens on hover, click still toggles. */}
                            <div className="relative w-[250px] max-w-full"
                                onMouseEnter={() => setShowRangePicker(true)}
                                onMouseLeave={() => { if (!fyOpen) setShowRangePicker(false); }}>
                                <button onClick={() => { setFyOpen(false); setShowRangePicker(!showRangePicker); }}
                                    className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 transition-all"
                                    style={{ color: themeColor }}>
                                    <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span className="truncate">
                                        {applied.from && applied.to
                                            ? `${fmtDayYr(applied.from)} → ${fmtDayYr(applied.to)}`
                                            : 'Select period'}
                                    </span>
                                    <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showRangePicker ? 'rotate-180' : ''}`} />
                                </button>

                                {showRangePicker && (
                                    /* pt-2 (not a margin) keeps the hover unbroken across the gap */
                                    <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2">
                                        {/* text-gray-800: the panel sits inside the white-on-blue
                                            hero, so it must reset the inherited text colour or the
                                            picked dates render white on white. */}
                                        <div className="sm:w-[440px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800">
                                            <div className="p-3 max-h-[75vh] overflow-y-auto">
                                                <div className="flex flex-col sm:flex-row gap-4">
                                                    {/* Quick Select */}
                                                    <div className="sm:w-[34%]">
                                                        <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">Quick Select</h3>
                                                        <div className="space-y-1.5 w-full">
                                                            {QUICK_OPTIONS.map((o) => (o.key === 'fy' ? (
                                                                /* Financial Year is ONE control: the button shows the FY and
                                                                   opens the year list in place. Opening it must NOT apply or
                                                                   close the period box; picking a year does both. */
                                                                <div key={o.key} className="relative">
                                                                    <button type="button" onClick={() => setFyOpen((v) => !v)}
                                                                        className={`w-full relative pl-2 pr-6 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${activePeriod === 'fy'
                                                                            ? 'text-white'
                                                                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                                                                        style={activePeriod === 'fy' ? { backgroundColor: themeColor } : {}}>
                                                                        FY {quickFy}–{String(quickFy + 1).slice(2)}
                                                                        <ChevronDownIcon className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 transition-transform ${fyOpen ? 'rotate-180' : ''} ${activePeriod === 'fy' ? 'text-white' : 'text-gray-500'}`} />
                                                                    </button>
                                                                    {/* In FLOW, not absolutely positioned: the period panel is its
                                                                        own scroll box and would clip a floating list. */}
                                                                    {fyOpen && (
                                                                        <div className="mt-1 max-h-36 overflow-y-auto bg-white border border-gray-200 rounded-lg">
                                                                            {fyChoices.map((y) => (
                                                                                <button key={y} type="button"
                                                                                    ref={y === quickFy ? (el) => {
                                                                                        if (el && el.parentElement) {
                                                                                            el.parentElement.scrollTop = Math.max(0,
                                                                                                el.offsetTop - el.parentElement.clientHeight / 2);
                                                                                        }
                                                                                    } : undefined}
                                                                                    onClick={() => applyFy(y)}
                                                                                    className={`block w-full px-2 py-1.5 text-xs text-center hover:bg-gray-100 ${
                                                                                        y === quickFy ? 'font-semibold text-white' : 'text-gray-700'}`}
                                                                                    style={y === quickFy ? { backgroundColor: themeColor } : {}}>
                                                                                    FY {y}–{String(y + 1).slice(2)}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <button key={o.key} onClick={() => applyQuick(o.key)}
                                                                    disabled={o.key === 'full' && !dataRange.max}
                                                                    className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center disabled:opacity-40 ${activePeriod === o.key
                                                                        ? 'text-white'
                                                                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                                                                    style={activePeriod === o.key ? { backgroundColor: themeColor } : {}}>
                                                                    {o.label}
                                                                </button>
                                                            )))}
                                                        </div>
                                                    </div>

                                                    {/* Custom Range */}
                                                    <div className="sm:w-[66%]">
                                                        <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">Custom Range</h3>
                                                        <div className="flex gap-2 mb-2">
                                                            <div className="flex-1">
                                                                <label className="block text-[11px] text-gray-500 mb-0.5 text-center">Start Date</label>
                                                                <div className={`px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate ${
                                                                    pickStart ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                                                                    {pickStart ? pickStart.toLocaleDateString('en-GB') : 'Not selected'}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="block text-[11px] text-gray-500 mb-0.5 text-center">End Date</label>
                                                                <div className={`px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate ${
                                                                    pickEnd ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                                                                    {pickEnd ? pickEnd.toLocaleDateString('en-GB') : 'Not selected'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="border border-gray-200 rounded-lg p-1 bg-gray-50/50 flex justify-center">
                                                            <DatePicker
                                                                selected={pickStart}
                                                                onChange={(dates) => { const [s, e] = dates; setPickStart(s); setPickEnd(e); }}
                                                                startDate={pickStart}
                                                                endDate={pickEnd}
                                                                selectsRange
                                                                inline
                                                                minDate={dataRange.min ? new Date(dataRange.min + 'T00:00:00') : undefined}
                                                                maxDate={calMax}
                                                                calendarClassName="custom-calendar"
                                                                dateFormat="dd/MM/yyyy"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2 mt-2.5">
                                                            <button onClick={() => setShowRangePicker(false)}
                                                                className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium">
                                                                Cancel
                                                            </button>
                                                            <button onClick={applyCustomRange} disabled={!pickStart || !pickEnd}
                                                                className="flex-1 px-2 py-1.5 text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                                                style={{ backgroundColor: themeColor }}>
                                                                Apply
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {canExportExcel() && (
                                <button onClick={exportExcel} disabled={!total}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ color: themeColor }}>
                                    <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {unmapped.length > 0 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>
                            {unmapped.length} Service Dealer name{unmapped.length > 1 ? 's' : ''} in the
                            quotation file {unmapped.length > 1 ? 'match' : 'matches'} no branch code, so
                            {unmapped.length > 1 ? ' their' : ' its'} quotations sit on{' '}
                            {unmapped.length > 1 ? 'rows' : 'a row'} of{' '}
                            {unmapped.length > 1 ? 'their' : 'its'} own:{' '}
                            {unmapped.map((u) => `${u.dealer} (${nf(u.quotations)})`).join(', ')}.
                        </span>
                    </div>
                )}

                {/* ===== The sheet ===== */}
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    {loading && !total ? (
                        <div className="px-3 py-10 text-center text-[12px] text-gray-500">
                            Loading the report…
                        </div>
                    ) : !total ? (
                        <div className="px-3 py-10 text-center text-[12px] text-gray-500">
                            Nothing to show yet.
                        </div>
                    ) : (
                        <div className="p-2">
                            <div className="border border-gray-400 rounded-xl overflow-hidden">
                                <HScrollBox watch={`${applied.from}|${applied.to}|${rows.length}`}>
                                    <table className="pms-grid qi-grid border-separate [border-spacing:0] w-full"
                                        style={{ minWidth: 930 }}>
                                        <thead>
                                            <tr>
                                                <th rowSpan={2} className={`${TH} !border-l-0`}
                                                    style={{ background: GRID.head, width: 128 }}>
                                                    Branch
                                                </th>
                                                <th rowSpan={2} className={TH}
                                                    style={{ background: GRID.head, width: 78 }}>
                                                    Branch Code
                                                </th>
                                                <th colSpan={4} className={TH} style={{ background: GRID.head }}>
                                                    Labour
                                                    <span className="block font-normal text-[8.5px] text-gray-600">
                                                        Quotation vs Invoice
                                                    </span>
                                                </th>
                                                <th colSpan={4} className={TH}
                                                    style={{ background: GRID.head }}>
                                                    Parts
                                                    <span className="block font-normal text-[8.5px] text-gray-600">
                                                        Quotation vs Invoice
                                                    </span>
                                                </th>
                                            </tr>
                                            <tr>
                                                {COLUMNS.map((c, i) => (
                                                    <th key={c.key}
                                                        className={TH}
                                                        style={{
                                                            background: GRID.head,
                                                            width: c.kind === 'money' ? 104 : 76,
                                                        }}>
                                                        {c.head}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={COLUMNS.length + 2}
                                                        className="px-3 py-8 text-center text-[12px] text-gray-500 border-b border-gray-400">
                                                        No quotation or invoice landed in this period.
                                                    </td>
                                                </tr>
                                            ) : rows.map((row, i) => (
                                                <tr key={row.branch_id || row.branch || i}
                                                    style={{ background: i % 2 ? GRID.rowB : GRID.rowA }}>
                                                    <td className={`${LEFT_C} !border-l-0 font-medium`}>
                                                        {row.branch || '—'}
                                                    </td>
                                                    <td className={CELL}>{row.branch_id || '—'}</td>
                                                    {COLUMNS.map((c, ci) => (
                                                        <td key={c.key}
                                                            className={c.kind === 'money' ? MONEY_C : CELL}>
                                                            {c.kind === 'money' ? money(row[c.key]) : nf(row[c.key])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="font-bold text-white" style={{ background: GRID.grand }}>
                                                <td className={`${LEFT_C} !border-l-0 !text-white font-bold`}>
                                                    Grand Total
                                                </td>
                                                <td className={`${CELL} !text-white`} />
                                                {COLUMNS.map((c, ci) => (
                                                    <td key={c.key}
                                                        className={`${c.kind === 'money' ? MONEY_C : CELL} !text-white`}>
                                                        {c.kind === 'money' ? money(total[c.key]) : nf(total[c.key])}
                                                    </td>
                                                ))}
                                            </tr>
                                        </tfoot>
                                    </table>
                                </HScrollBox>
                            </div>

                            {/* Under the table: the one caveat that keeps the two halves
                                from being read as a conversion rate, and what was
                                actually loaded — so a figure that looks wrong can be
                                checked against the uploads it came from. */}
                            <div className="mt-2 flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 px-1">
                                <div className="flex items-start gap-2 text-[10.5px] text-gray-500 leading-snug flex-1">
                                    <InformationCircleIcon className="h-4 w-4 flex-shrink-0 mt-px" />
                                    <p>
                                        <b>Note:</b> quote and invoice columns cover the same period but are
                                        <b> not line-matched</b> &mdash; the invoice report carries no quotation
                                        reference, so an invoice here may answer an earlier quote. Cancelled
                                        invoices and OTC business are excluded.
                                    </p>
                                </div>
                                {status && (
                                    <div className="text-[10.5px] text-gray-500 leading-snug sm:text-right flex-shrink-0">
                                        <div>
                                            Quotations: {nf(status.quotes?.rows)} rows &middot; last upload {stamp(status.quotes?.last_upload)}
                                        </div>
                                        <div>
                                            Invoices: {nf(status.invoices?.rows)} rows &middot; last upload {stamp(status.invoices?.last_upload)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OpenQuotationTracker;
