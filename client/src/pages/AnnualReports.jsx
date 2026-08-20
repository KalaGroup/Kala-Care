import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  PresentationChartLineIcon, CalendarDaysIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import ServicePenetrationReport from '../components/ServicePenetrationReport';
import AmcBandhanProjectionReport from '../components/AmcBandhanProjectionReport';
import CustomerDelightIndexReport from '../components/CustomerDelightIndexReport';

// ============================================================================
// PMS → Annual Reports
// One page, many yearly views: the report picker chooses which sheet is shown,
// the period picker (the same control the Employee Productivity page uses) owns
// the reporting period for all of them.
//   Service Penetration      asset population by segment, from the Asset
//                            Detailed master on COMMISSIONING DATE
//   AMC & Bandhan Projection layout only for now — no figures wired up
//   Customer Delight Index   Promotor/Passive/Detractor feedback per branch,
//                            from the CDI Detail Report on ACTIVITY END DATE
// Each report has its OWN source file, so each brings its own date range: the
// period picker re-defaults to the financial year of whichever report is open.
// Backend: GET /pms/report/annual/service-penetration, .../annual/cdi
//          (PMS access)
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

const themeColor = '#2f3192';
const themeDark = '#23255f';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDayYr = (iso) => (iso ? new Date(iso + 'T00:00:00')
  .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '');
// The financial year (Apr–Mar) an ISO date falls in.
const fyOfIso = (d) => (Number(d.slice(5, 7)) >= 4 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);

// The dropdown. Adding the next annual sheet means one entry here plus its
// component — nothing else on the page changes.
const REPORTS = [
  { key: 'service_penetration', name: 'Service Penetration',
    sub: 'Asset population by segment' },
  { key: 'amc_bandhan', name: 'AMC & Bandhan Projection',
    sub: 'Layout only — figures pending' },
  { key: 'cdi', name: 'Customer Delight Index (CDI)',
    sub: 'Feedback score per branch' },
];

// Which payload each report reads. Only the CDI sheet has a source of its own;
// the other two share the Service Penetration fetch.
const CDI_REPORT = 'cdi';

const AnnualReports = () => {
  const [data, setData] = useState(null);
  const [cdi, setCdi] = useState(null);          // fetched the first time CDI is opened
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState(REPORTS[0].key);
  const [reportOpen, setReportOpen] = useState(false);
  // A period change costs no fetch, only a re-aggregation — but the user still
  // asked to SEE that the sheet is being rebuilt, so it runs behind the spinner.
  const [recalc, setRecalc] = useState(false);
  const rangeTimer = useRef(0);

  // ---- CDI: one financial year, picked directly ----------------------------
  const [cdiFy, setCdiFy] = useState(null);
  const [cdiFyOpen, setCdiFyOpen] = useState(false);

  // Only the years the feedback file actually covers — no empty years to pick.
  const cdiFyChoices = (() => {
    const lo = cdi?.meta?.min_date, hi = cdi?.meta?.max_date;
    if (!lo || !hi) return [];
    const out = [];
    for (let y = fyOfIso(lo); y <= fyOfIso(hi); y += 1) out.push(y);
    return out.reverse();                 // newest first — the usual pick
  })();

  // Default to the year the feedback ends in, the moment the payload lands.
  useEffect(() => {
    if (cdi?.meta?.max_date && cdiFy === null) setCdiFy(fyOfIso(cdi.meta.max_date));
  }, [cdi, cdiFy]);

  const applyCdiFy = (y) => {
    setRecalc(true);
    clearTimeout(rangeTimer.current);
    rangeTimer.current = setTimeout(() => {
      setCdiFy(y);
      setRecalc(false);
    }, 160);
  };

  // Reporting period — applied range (ISO) + the range-picker popover, the same
  // control the Employee Productivity page uses.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [activePeriod, setActivePeriod] = useState('fy');
  const [pickStart, setPickStart] = useState(null);
  const [pickEnd, setPickEnd] = useState(null);
  const fyNow = (() => { const d = new Date(); return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; })();
  const [quickFy, setQuickFy] = useState(fyNow);
  const [fyOpen, setFyOpen] = useState(false);
  const fyChoices = [];
  for (let y = fyNow - 5; y <= fyNow + 10; y++) fyChoices.push(y);

  // The page fetches once and hands the payload to the report, so switching
  // report or period never refetches.
  const load = useCallback(async (quiet = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/annual/service-penetration`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setData(d);
      if (!quiet) toast.success('Annual reports loaded');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  // The CDI sheet reads its own file, so it is fetched the first time it is
  // opened and then kept — switching reports never refetches either payload.
  const loadCdi = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/annual/cdi`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setCdi(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (report === CDI_REPORT && !cdi) loadCdi();
  }, [report, cdi, loadCdi]);

  const active = report === CDI_REPORT ? cdi : data;
  const dataRange = {
    min: active?.meta?.min_date || null,
    max: active?.meta?.max_date || null,
  };

  const clampToData = (from, to) => {
    let f = from, t = to;
    if (dataRange.min && f < dataRange.min) f = dataRange.min;
    if (dataRange.max && t > dataRange.max) t = dataRange.max;
    if (f > t) f = t;
    return [f, t];
  };

  // These are ANNUAL sheets, so the default period is the FINANCIAL YEAR the
  // data ends in — not last month, which would read as an almost empty page.
  // Re-applied whenever the range changes, which is exactly when a report with
  // its OWN source file is opened: an asset commissioned in 1998 must not leave
  // the CDI sheet sitting on a period its feedback file has never covered.
  useEffect(() => {
    if (!dataRange.max) return;
    const d = new Date(dataRange.max + 'T00:00:00');
    const fy = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
    const [f, t] = clampToData(`${fy}-04-01`, `${fy + 1}-03-31`);
    setQuickFy(fy);
    setFromDate(f);
    setToDate(t);
    setPickStart(new Date(f + 'T00:00:00'));
    setPickEnd(new Date(t + 'T00:00:00'));
    setActivePeriod('fy');
  }, [dataRange.min, dataRange.max]);   // eslint-disable-line react-hooks/exhaustive-deps

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

  // EVERY period control lands here. The reports re-aggregate their raw payload
  // on the spot — no refetch — but on a full financial year that is real work,
  // so the new range is applied one tick LATE: the spinner gets a frame to paint
  // first, and the table is rebuilt exactly once, with the new dates.
  const applyRange = (f, t, key) => {
    setRecalc(true);
    setActivePeriod(key);
    setShowRangePicker(false);
    clearTimeout(rangeTimer.current);      // a newer pick always wins
    rangeTimer.current = setTimeout(() => {
      setFromDate(f);
      setToDate(t);
      setPickStart(new Date(f + 'T00:00:00'));
      setPickEnd(new Date(t + 'T00:00:00'));
      setRecalc(false);
    }, 160);
  };

  const applyQuick = (key) => {
    if (!dataRange.max) return;
    if (key === 'fy') { applyFy(quickFy); return; }
    const max = dataRange.max;
    const d = new Date(max + 'T00:00:00');
    let from = max.slice(0, 8) + '01', to = max;
    if (key === 'today' || key === 'yesterday' || key === 'last_week') {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (key === 'today') {
        from = to = isoOf(now);
      } else if (key === 'yesterday') {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        from = to = isoOf(y);
      } else {
        const mon = new Date(now);
        mon.setDate(mon.getDate() - ((now.getDay() + 6) % 7));
        const lastMon = new Date(mon); lastMon.setDate(lastMon.getDate() - 7);
        const lastSun = new Date(mon); lastSun.setDate(lastSun.getDate() - 1);
        from = isoOf(lastMon); to = isoOf(lastSun);
      }
    } else if (key === 'last_month') {
      from = isoOf(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      to = isoOf(new Date(d.getFullYear(), d.getMonth(), 0));
    } else if (key === 'last_quarter') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1));
    else if (key === 'last_6m') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 6, d.getDate() + 1));
    else if (key === 'full') from = dataRange.min || max;
    const [f, t] = clampToData(from, to);
    applyRange(f, t, key);
  };

  const applyFy = (y) => {
    if (!dataRange.max) return;
    setQuickFy(y);
    const [f, t] = clampToData(`${y}-04-01`, `${y + 1}-03-31`);
    applyRange(f, t, 'fy');
  };

  const applyCustomRange = () => {
    if (!pickStart || !pickEnd) return;
    const [f, t] = clampToData(isoOf(pickStart), isoOf(pickEnd));
    applyRange(f, t, 'custom');
  };

  const cur = REPORTS.find((r) => r.key === report) || REPORTS[0];

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-10 max-md:px-2">

        {/* ===== Hero — report picker + reporting period on the RIGHT ===== */}
        <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                <PresentationChartLineIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold leading-tight">Annual Reports</h1>
                <p className="text-[11px] text-white/70 leading-tight">
                  {dataRange.max
                    ? <>{cur.name} · {report === CDI_REPORT ? 'feedback' : 'asset'} data
                      {' '}{fmtDayYr(dataRange.min)} → {fmtDayYr(dataRange.max)}</>
                    : ((loading || !active) ? 'Loading…'
                      : `No data yet — upload the ${report === CDI_REPORT
                        ? 'CDI Detail Report' : 'Asset Detailed'} file on the Data Upload page`)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* ---- which report ---- */}
              <div className="relative w-[230px] max-w-full"
                onMouseEnter={() => setReportOpen(true)}
                onMouseLeave={() => setReportOpen(false)}>
                <button onClick={() => setReportOpen(!reportOpen)}
                  className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 transition-all"
                  style={{ color: themeColor }}>
                  <span className="truncate">{cur.name}</span>
                  <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${reportOpen ? 'rotate-180' : ''}`} />
                </button>
                {reportOpen && (
                  <div className="absolute z-50 left-0 right-0 top-full pt-2">
                    <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-1">
                      {REPORTS.map((r) => (
                        <button key={r.key} type="button"
                          onClick={() => { setReport(r.key); setReportOpen(false); }}
                          className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                            r.key === report ? 'text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                          style={r.key === report ? { backgroundColor: themeColor } : {}}>
                          <span className="font-semibold">{r.name}</span>
                          <span className={`block text-[10px] ${r.key === report ? 'text-white/70' : 'text-gray-400'}`}>
                            {r.sub}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ---- the CDI sheet is ONE FINANCIAL YEAR wide, so it picks a
                   year, not a from/to range: a range picker would leave "which
                   FY is this?" to be inferred from the dates. ---- */}
              {report === CDI_REPORT ? (
                <div className="relative w-[190px] max-w-full"
                  onMouseEnter={() => setCdiFyOpen(true)}
                  onMouseLeave={() => setCdiFyOpen(false)}>
                  <button onClick={() => setCdiFyOpen(!cdiFyOpen)} disabled={!cdi}
                    className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 disabled:opacity-50 transition-all"
                    style={{ color: themeColor }}>
                    <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">FY {cdiFy}–{String(cdiFy + 1).slice(2)}</span>
                    <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${cdiFyOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {cdiFyOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full pt-2">
                      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-1 max-h-60 overflow-y-auto">
                        {cdiFyChoices.map((y) => (
                          <button key={y} type="button"
                            onClick={() => { setCdiFyOpen(false); applyCdiFy(y); }}
                            className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                              y === cdiFy ? 'text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                            style={y === cdiFy ? { backgroundColor: themeColor } : {}}>
                            <span className="font-semibold">FY {y}–{String(y + 1).slice(2)}</span>
                            <span className={`block text-[10px] ${y === cdiFy ? 'text-white/70' : 'text-gray-400'}`}>
                              Apr {y} – Mar {y + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
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
                  <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2">
                    <div className="sm:w-[440px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800">
                      <div className="p-3 max-h-[75vh] overflow-y-auto">
                        <div className="flex flex-col sm:flex-row gap-4">
                          <div className="sm:w-[34%]">
                            <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">Quick Select</h3>
                            <div className="space-y-1.5 w-full">
                              {QUICK_OPTIONS.map((o) => (o.key === 'fy' ? (
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
                                showMonthDropdown
                                showYearDropdown
                                dropdownMode="select"
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
              )}
            </div>
          </div>
        </div>

        {/* ============ The picked report ============ */}
        <div className="bg-white rounded-2xl border border-gray-200 p-2">
          {/* The spinner covers BOTH waits: "this report has no payload yet"
              (a report with a source of its own is only fetched when it is
              opened, so the frame before its effect fires would otherwise flash
              an empty panel) and "a new period is being applied". */}
          {error ? (
            <div className="px-3 py-6 text-center text-sm text-red-600">{error}</div>
          ) : (!active || recalc) ? (
            <div className="flex justify-center py-12">
              <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
                style={{ borderTopColor: themeColor }} />
            </div>
          ) : report === CDI_REPORT ? (
            <CustomerDelightIndexReport data={cdi} fy={cdiFy} />
          ) : report === 'amc_bandhan' ? (
            <AmcBandhanProjectionReport data={data} periodTo={toDate} />
          ) : (
            <ServicePenetrationReport data={data} periodFrom={fromDate} periodTo={toDate} />
          )}
        </div>

      </div>
    </div>
  );
};

export default AnnualReports;
