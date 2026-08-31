import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  ClipboardDocumentCheckIcon, CalendarDaysIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import SEPerformanceReport from '../components/SEPerformanceReport';

// ============================================================================
// PMS → SE Performance
//
// The Annexure I "Service Engineer Performance Commitment & Accountability
// Matrix", per engineer: the twelve commitments he signed, what he actually
// did against them over the selected period, what the shortfall is worth, and
// the printable signed form.
//
// This page owns the REPORTING PERIOD; the branch board, the engineer report
// and the three panels live in components/SEPerformanceReport.
//
// Backend: GET /pms/report/se-performance — the ROSTER only (real branches,
// real engineers from the SE UID Master, real trainings from the Training
// Report). Every commitment FIGURE is generated in the browser for now; the
// counting rules are not agreed yet. See utils/sePerformanceModel.js.
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
const fmtDayYr = (iso) => (iso
  ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
  : '');

const SEPerformance = () => {
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reporting period — the same picker every PMS report uses. Unlike the other
  // reports there is no matched data range to clamp to yet, so the period is
  // free and defaults to last month.
  const today = new Date();
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const [fromDate, setFromDate] = useState(isoOf(lastMonthStart));
  const [toDate, setToDate] = useState(isoOf(lastMonthEnd));
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [activePeriod, setActivePeriod] = useState('last_month');
  const [pickStart, setPickStart] = useState(lastMonthStart);
  const [pickEnd, setPickEnd] = useState(lastMonthEnd);
  const fyNow = (() => { const d = new Date(); return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; })();
  const [quickFy, setQuickFy] = useState(fyNow);
  const [fyOpen, setFyOpen] = useState(false);
  const fyChoices = [];
  for (let y = fyNow - 5; y <= fyNow + 10; y++) fyChoices.push(y);

  const load = useCallback(async (quiet = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/se-performance`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setRoster(d);
      if (!quiet) toast.success('SE Performance loaded');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  const QUICK_OPTIONS = [
    { key: 'fy', label: 'Financial Year' },
    { key: 'current_month', label: 'Current Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'last_quarter', label: 'Last Quarter' },
    { key: 'last_6m', label: 'Last 6 Months' },
    { key: 'last_year', label: 'Last 12 Months' },
  ];

  const applyRange = (f, t, key) => {
    setFromDate(f); setToDate(t);
    setPickStart(new Date(`${f}T00:00:00`)); setPickEnd(new Date(`${t}T00:00:00`));
    setActivePeriod(key); setShowRangePicker(false);
  };

  const applyQuick = (key) => {
    const d = new Date();
    if (key === 'current_month') {
      applyRange(isoOf(new Date(d.getFullYear(), d.getMonth(), 1)),
        isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)), key);
    } else if (key === 'last_month') {
      applyRange(isoOf(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        isoOf(new Date(d.getFullYear(), d.getMonth(), 0)), key);
    } else if (key === 'last_quarter') {
      const q = Math.floor(d.getMonth() / 3) * 3;
      applyRange(isoOf(new Date(d.getFullYear(), q - 3, 1)), isoOf(new Date(d.getFullYear(), q, 0)), key);
    } else if (key === 'last_6m') {
      applyRange(isoOf(new Date(d.getFullYear(), d.getMonth() - 6, 1)),
        isoOf(new Date(d.getFullYear(), d.getMonth(), 0)), key);
    } else if (key === 'last_year') {
      applyRange(isoOf(new Date(d.getFullYear(), d.getMonth() - 12, 1)),
        isoOf(new Date(d.getFullYear(), d.getMonth(), 0)), key);
    }
  };

  // Financial Year preset (Apr..Mar) — the year this business plans in, and the
  // year the report's quarterly and yearly views fold to.
  const applyFy = (y) => {
    setQuickFy(y);
    applyRange(`${y}-04-01`, `${y + 1}-03-31`, 'fy');
  };

  const applyCustomRange = () => {
    if (!pickStart || !pickEnd) return;
    applyRange(isoOf(pickStart), isoOf(pickEnd), 'custom');
  };

  const engineers = roster?.engineers?.length || 0;
  const branches = roster?.branches?.length || 0;

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 max-md:px-2">

        {/* ===== Hero header — the reporting-period picker lives on its RIGHT ===== */}
        <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative sep-hide-print"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
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
                <h1 className="text-lg sm:text-xl font-bold leading-tight">SE Performance</h1>
                <p className="text-[11px] text-white/70 leading-tight">
                  {loading ? 'Loading…'
                    : error ? 'Could not load the roster'
                      : <>Annexure&nbsp;I commitment &amp; accountability matrix · {engineers} engineers across {branches} branches</>}
                </p>
              </div>
            </div>

            {/* Period picker — opens on hover, click still toggles. */}
            <div className="relative w-[280px] max-w-full"
              onMouseEnter={() => setShowRangePicker(true)}
              onMouseLeave={() => { if (!fyOpen) setShowRangePicker(false); }}>
              <button onClick={() => { setFyOpen(false); setShowRangePicker(!showRangePicker); }}
                className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 transition-all"
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
                  <div className="sm:w-[440px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800">
                    <div className="p-3 max-h-[75vh] overflow-y-auto">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="sm:w-[34%]">
                          <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">Quick Select</h3>
                          <div className="space-y-1.5">
                            {QUICK_OPTIONS.map((o) => (o.key === 'fy' ? (
                              <div key={o.key} className="relative">
                                <button type="button" onClick={() => setFyOpen((v) => !v)}
                                  className={`w-full relative pl-2 pr-6 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${activePeriod === 'fy'
                                    ? 'text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                                  style={activePeriod === 'fy' ? { backgroundColor: themeColor } : {}}>
                                  FY {quickFy}–{String(quickFy + 1).slice(2)}
                                  <ChevronDownIcon className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 transition-transform ${fyOpen ? 'rotate-180' : ''} ${activePeriod === 'fy' ? 'text-white' : 'text-gray-500'}`} />
                                </button>
                                {fyOpen && (
                                  <div className="mt-1 max-h-36 overflow-y-auto bg-white border border-gray-200 rounded-lg">
                                    {fyChoices.map((y) => (
                                      <button key={y} type="button"
                                        ref={y === quickFy ? (el) => {
                                          if (el && el.parentElement) {
                                            el.parentElement.scrollTop = Math.max(0, el.offsetTop - el.parentElement.clientHeight / 2);
                                          }
                                        } : undefined}
                                        onClick={() => { setFyOpen(false); applyFy(y); }}
                                        className={`block w-full px-2 py-1.5 text-xs text-center hover:bg-gray-100 ${y === quickFy ? 'font-semibold text-white' : 'text-gray-700'}`}
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
                                  ? 'text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                                style={activePeriod === o.key ? { backgroundColor: themeColor } : {}}>
                                {o.label}
                              </button>
                            )))}
                          </div>
                        </div>

                        <div className="sm:w-[66%]">
                          <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">Custom Range</h3>
                          <div className="flex gap-2 mb-2">
                            <div className="flex-1">
                              <label className="block text-[11px] text-gray-500 mb-0.5 text-center">Start Date</label>
                              <div className={`px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate ${pickStart ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                                {pickStart ? pickStart.toLocaleDateString('en-GB') : 'Not selected'}
                              </div>
                            </div>
                            <div className="flex-1">
                              <label className="block text-[11px] text-gray-500 mb-0.5 text-center">End Date</label>
                              <div className={`px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate ${pickEnd ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                                {pickEnd ? pickEnd.toLocaleDateString('en-GB') : 'Not selected'}
                              </div>
                            </div>
                          </div>
                          <div className="border border-gray-200 rounded-lg p-1 bg-gray-50/50 flex justify-center">
                            <DatePicker
                              selected={pickStart}
                              onChange={(dates) => { const [s, e] = dates; setPickStart(s); setPickEnd(e); }}
                              startDate={pickStart} endDate={pickEnd}
                              selectsRange inline calendarClassName="custom-calendar" dateFormat="dd/MM/yyyy" />
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
        {loading && !roster ? (
          <div className="flex justify-center py-12">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
              style={{ borderTopColor: themeColor }} />
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center text-sm text-red-600">{error}</div>
        ) : !roster?.engineers?.length ? (
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-gray-800">No engineers on the roster yet</p>
            <p className="text-xs text-gray-500 mt-1">
              This report reads the <b>SE UID Master</b> (Profile → PMS). Add engineers there and pin
              each one to a branch — a row with no branch cannot appear on a branch report.
            </p>
          </div>
        ) : (
          <SEPerformanceReport roster={roster} periodFrom={fromDate} periodTo={toDate} />
        )}

      </div>
    </div>
  );
};

export default SEPerformance;
