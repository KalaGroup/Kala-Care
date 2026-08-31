import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  ClipboardDocumentCheckIcon, CalendarDaysIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import SRAllocationReport from '../components/SRAllocationReport';

// ============================================================================
// PMS → SR Allocation (Service Engineer wise, from the EFSR Report)
// Every EFSR row with a Service Engineer UID counts twice: on its TASK ASSIGNED
// DATE as allocated and on its TASK END DATE as closed. This page owns the
// reporting period; the
// table itself (granularity / date columns / SR Type rows / filters / export)
// lives in components/SRAllocationReport.
// Backend: GET /pms/report/sr-allocation (master admin only)
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as the other PMS pages) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

// ---- date helpers (ISO strings, local time) ----
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDayYr = (iso) => {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00')
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

const SRAllocation = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reporting period — applied range (ISO) + the range-picker popover, the
  // same control the Employee Productivity page uses.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [activePeriod, setActivePeriod] = useState('current_month');   // default period
  const [pickStart, setPickStart] = useState(null);           // calendar Date objects
  const [pickEnd, setPickEnd] = useState(null);
  const fyNow = (() => { const d = new Date(); return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; })();
  const [quickFy, setQuickFy] = useState(fyNow);
  // the FY year list inside the period box (see the picker below)
  const [fyOpen, setFyOpen] = useState(false);
  const fyChoices = [];
  for (let y = fyNow - 5; y <= fyNow + 10; y++) fyChoices.push(y);

  // The page fetches the report data ONCE and hands it to the table as
  // `preloaded`, so the report's date range is known here (it bounds the
  // calendar) and switching periods never refetches.
  const load = useCallback(async (quiet = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/sr-allocation`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setData(d);
      if (!quiet) toast.success('SR Allocation loaded');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  const dataRange = {
    min: data?.meta?.min_date || null,
    max: data?.meta?.max_date || null,
  };

  // Presets are clamped inside the matched data range so an empty period can
  // never be applied.
  const clampToData = (from, to) => {
    let f = from, t = to;
    if (dataRange.min && f < dataRange.min) f = dataRange.min;
    if (dataRange.max && t > dataRange.max) t = dataRange.max;
    if (f > t) f = t;
    return [f, t];
  };

  // CURRENT MONTH is the default period — applied once, as soon as the data
  // arrives (the calendar is pre-selected with it too, so Apply works without
  // picking twice), and it computes the SAME range the preset of that name does:
  // the 1st of the newest month that carries data, through the last data day.
  // Anchored on the DATA and not the wall clock, like every other preset here —
  // otherwise a page whose last upload was a while back would open on a month
  // with nothing in it.
  useEffect(() => {
    if (!dataRange.max) return;
    let f = `${dataRange.max.slice(0, 8)}01`;
    let t = dataRange.max;
    [f, t] = clampToData(f, t);
    setFromDate((cur) => cur || f);
    setToDate((cur) => cur || t);
    setPickStart((cur) => cur || new Date(f + 'T00:00:00'));
    setPickEnd((cur) => cur || new Date(t + 'T00:00:00'));
  }, [dataRange.min, dataRange.max]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Financial Year sits FIRST: its year list opens underneath the control, and
  // at the bottom of the list that ran off the end of the period panel.
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

  const applyQuick = (key) => {
    if (!dataRange.max) return;
    if (key === 'fy') { applyFy(quickFy); return; }
    const max = dataRange.max;
    const d = new Date(max + 'T00:00:00');
    let from = max.slice(0, 8) + '01', to = max;
    // Today / Yesterday / Last Week are real calendar dates (then clamped into
    // the uploaded range); the longer presets are anchored on the last data day.
    if (key === 'today' || key === 'yesterday' || key === 'last_week') {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (key === 'today') {
        from = to = isoOf(now);
      } else if (key === 'yesterday') {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        from = to = isoOf(y);
      } else {
        const mon = new Date(now);                       // Monday of this week
        mon.setDate(mon.getDate() - ((now.getDay() + 6) % 7));
        const lastMon = new Date(mon); lastMon.setDate(lastMon.getDate() - 7);
        const lastSun = new Date(mon); lastSun.setDate(lastSun.getDate() - 1);
        from = isoOf(lastMon); to = isoOf(lastSun);
      }
    } else if (key === 'last_month') {
      from = isoOf(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      to = isoOf(new Date(d.getFullYear(), d.getMonth(), 0));   // last day of prev month
    } else if (key === 'last_quarter') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1));
    else if (key === 'last_6m') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 6, d.getDate() + 1));
    else if (key === 'full') from = dataRange.min || max;
    const [f, t] = clampToData(from, to);
    setFromDate(f);
    setToDate(t);
    setPickStart(new Date(f + 'T00:00:00'));
    setPickEnd(new Date(t + 'T00:00:00'));
    setActivePeriod(key);
    setShowRangePicker(false);
  };

  // Financial Year preset (Apr..Mar), clamped to the matched data range.
  const applyFy = (y) => {
    if (!dataRange.max) return;
    setQuickFy(y);
    const [f, t] = clampToData(`${y}-04-01`, `${y + 1}-03-31`);
    setFromDate(f);
    setToDate(t);
    setPickStart(new Date(f + 'T00:00:00'));
    setPickEnd(new Date(t + 'T00:00:00'));
    setActivePeriod('fy');
    setShowRangePicker(false);
  };

  const applyCustomRange = () => {
    if (!pickStart || !pickEnd) return;
    const [f, t] = clampToData(isoOf(pickStart), isoOf(pickEnd));
    setFromDate(f);
    setToDate(t);
    setActivePeriod('custom');
    setShowRangePicker(false);
  };

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 max-md:px-2">

        {/* ===== Hero header — the reporting-period picker lives on its RIGHT ===== */}
        <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          {/* decorations clipped on their own layer so the picker popover can escape */}
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                <ClipboardDocumentCheckIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold leading-tight">SR Allocation Report</h1>
                <p className="text-[11px] text-white/70 leading-tight">
                  {dataRange.max
                    ? <>Service Engineer wise, EFSR task assigned &amp; end dates · data {fmtDayYr(dataRange.min)} → {fmtDayYr(dataRange.max)}</>
                    : (loading ? 'Loading…'
                      : 'No data yet — upload the EFSR Report file on the Data Upload page')}
                </p>
              </div>
            </div>

            {/* Period picker — opens on hover, click still toggles (same as the
              Employee Productivity picker). */}
            <div className="relative w-[280px] max-w-full"
              onMouseEnter={() => dataRange.max && setShowRangePicker(true)}
              onMouseLeave={() => { if (!fyOpen) setShowRangePicker(false); }}>
              <button onClick={() => { setFyOpen(false); setShowRangePicker(!showRangePicker); }} disabled={!dataRange.max}
                className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 disabled:opacity-50 transition-all"
                style={{ color: themeColor }}>
                <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {fromDate && toDate ? `${fmtDayYr(fromDate)} → ${fmtDayYr(toDate)}` : 'Select period'}
                </span>
                <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showRangePicker ? 'rotate-180' : ''}`} />
              </button>

              {showRangePicker && (
                /* pt-2 (not a margin) keeps the hover unbroken across the gap */
                <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2">
                  {/* text-gray-800: the panel sits inside the white-on-blue hero,
                      so it must reset the inherited text colour or the picked
                      dates render white-on-white. */}
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
                                 close the period box — a native <select> did, so the box
                                 snapped shut the instant the year dropdown appeared. Picking
                                 a year applies it and closes. */
                              <div key={o.key} className="relative">
                                <button type="button"
                                  onClick={() => setFyOpen((v) => !v)}
                                  className={`w-full relative pl-2 pr-6 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${activePeriod === 'fy'
                                    ? 'text-white'
                                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                                  style={activePeriod === 'fy' ? { backgroundColor: themeColor } : {}}>
                                  FY {quickFy}–{String(quickFy + 1).slice(2)}
                                  <ChevronDownIcon className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 transition-transform ${fyOpen ? 'rotate-180' : ''} ${activePeriod === 'fy' ? 'text-white' : 'text-gray-500'}`} />
                                </button>
                                {/* In FLOW, not absolutely positioned: the period panel is its
                                    own scroll box and would clip a floating list. The
                                    control sits at the top of Quick Select so the list
                                    has room to open under it; the current FY is
                                    scrolled into view. */}
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
                                        onClick={() => { setFyOpen(false); applyFy(y); }}
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
                                className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${activePeriod === o.key
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
                              maxDate={dataRange.max ? new Date(dataRange.max + 'T00:00:00') : undefined}
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
          </div>
        </div>

        {/* ============ The report ============ */}
        <div className="bg-white rounded-2xl border border-gray-200 px-2 pt-2 pb-1">
          {loading && !data ? (
            <div className="flex justify-center py-12">
              <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
                style={{ borderTopColor: themeColor }} />
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center text-sm text-red-600">{error}</div>
          ) : data ? (
            <SRAllocationReport
              preloaded={data}
              periodFrom={fromDate}
              periodTo={toDate} />
          ) : null}
        </div>

      </div>
    </div>
  );
};

export default SRAllocation;
