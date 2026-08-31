import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  PresentationChartLineIcon, CalendarDaysIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';
import ServicePenetrationReport from '../components/ServicePenetrationReport';
import AmcBandhanProjectionReport from '../components/AmcBandhanProjectionReport';
import AmcMonthlyReport from '../components/AmcMonthlyReport';
import CustomerDelightIndexReport from '../components/CustomerDelightIndexReport';
import ServiceLoadResponseReport from '../components/ServiceLoadResponseReport';
import { visibleAnnualTabs } from '../utils/pagePermission';

// ============================================================================
// PMS → Annual Reports
// One page, many yearly views: the report picker chooses which sheet is shown,
// the period picker (the same control the Employee Productivity page uses) owns
// the reporting period for all of them.
//   Service Penetration      asset population by segment, from the Asset
//                            Detailed master on COMMISSIONING DATE
//   AMC & Bandhan Projection D/BAMC (Dealer + Bandhan) agreements per branch,
//                            from the AMC Population Report on AGREEMENT START
//                            DATE, against the AOP master's projection.
//                            TWO TABS on one report: 'Projection' (per branch)
//                            and 'AMC' (per agreement category, month by month
//                            with the running month opened up by week) - the
//                            same file read two ways, so one fetch each and no
//                            second entry in the report picker. The strip is
//                            rendered INSIDE the sheet's own header row, so the
//                            report keeps one bar rather than two.
//   Customer Delight Index   Promotor/Passive/Detractor feedback per branch,
//                            from the CDI Detail Report on ACTIVITY END DATE
//   Service Load & Response  SR load by type, productivity and the response /
//                            MaxTTR compliance per branch, from the Response
//                            Time & MaxTTR Details file on SR CLOSE DATE
// Each report has its OWN source file, so each brings its own date range: the
// period picker re-defaults to the financial year of whichever report is open.
// Backend: GET /pms/report/annual/service-penetration, .../annual/cdi,
//          .../annual/amc-bandhan, .../annual/amc-monthly, .../annual/service-load
//          (PMS access). The AMC tab's AOP is set in AOP Master -> AMC & Bandhan
//          AOP, and arrives in that payload.
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
    sub: 'Dealer + Bandhan AMC vs AOP' },
  { key: 'cdi', name: 'Customer Delight Index (CDI)',
    sub: 'Feedback score per branch' },
  { key: 'service_load', name: 'Service Load and Response',
    sub: 'SR load, productivity, response %' },
];

// Which payload each report reads. Service Penetration is fetched with the page;
// the CDI and AMC sheets read files of their own and are fetched the first time
// they are opened, then kept.
const CDI_REPORT = 'cdi';
const AMC_REPORT = 'amc_bandhan';
const SVC_REPORT = 'service_load';

// The AMC report is TWO sheets off one file, so they are TABS of that report
// rather than two entries in the picker: 'which AMC sheet' is a smaller question
// than 'which annual report', and both read the AMC Population Report.
const AMC_TABS = [
  { key: 'projection', name: 'Projection', sub: 'per branch, vs AOP' },
  { key: 'monthly', name: 'AMC', sub: 'per category, month by month' },
];

// The financial years a payload's own file actually covers, newest first — no
// empty years to pick. Both FY-picking sheets (CDI, Service Load) use it.
// min_start / max_start where a payload has them: the AMC monthly sheet counts
// expiries on the AGREEMENT END date, which runs years ahead of anything sold, so
// its full span would offer financial years in which nothing was ever sold.
const fyChoicesOf = (payload) => {
  const lo = payload?.meta?.min_start || payload?.meta?.min_date;
  const hi = payload?.meta?.max_start || payload?.meta?.max_date;
  if (!lo || !hi) return [];
  const out = [];
  for (let y = fyOfIso(lo); y <= fyOfIso(hi); y += 1) out.push(y);
  return out.reverse();
};

// Which file each report reads, for the 'no data yet' line in the hero.
const SOURCE_FILE = {
  [CDI_REPORT]: 'CDI Detail Report',
  [AMC_REPORT]: 'AMC Population Report',
  [SVC_REPORT]: 'Response Time & MaxTTR Details',
  service_penetration: 'Asset Detailed',
};

const AnnualReports = () => {
  const [data, setData] = useState(null);
  const [cdi, setCdi] = useState(null);          // fetched the first time CDI is opened
  const [amc, setAmc] = useState(null);          // ditto, AMC & Bandhan Projection
  const [amc2, setAmc2] = useState(null);        // ditto, the AMC report's AMC tab
  const [svc, setSvc] = useState(null);          // ditto, Service Load and Response
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // WHICH of the four sheets this user holds — granted per sheet in Profile
  // (Annual Reports — Sheets), because one person is often given only their own
  // report. The picker lists these and the page opens on the first of them, so
  // a sheet the user does not hold is never even fetched (the server refuses it
  // too). A user with no sheet at all never reaches this page: its menu item and
  // route guard are already closed.
  const myReports = useMemo(() => {
    const keys = visibleAnnualTabs().map((t) => t.key);
    return REPORTS.filter((r) => keys.includes(r.key));
  }, []);
  const [report, setReport] = useState((myReports[0] || REPORTS[0]).key);
  const [reportOpen, setReportOpen] = useState(false);
  // A period change costs no fetch, only a re-aggregation — but the user still
  // asked to SEE that the sheet is being rebuilt, so it runs behind the spinner.
  const [recalc, setRecalc] = useState(false);
  const rangeTimer = useRef(0);

  // ---- CDI and Service Load: one financial year, picked directly -----------
  const [cdiFy, setCdiFy] = useState(null);
  const [svcFy, setSvcFy] = useState(null);
  const [fyPickOpen, setFyPickOpen] = useState(false);

  // ---- AMC & Bandhan: only how far into the year to read ------------------
  // The sheet is 'this year against its AOP', so the year is not a choice - the
  // backend reports the one the agreements run to (meta.fy) and the page picks
  // the month its YTD stops at. Nothing else here is a filter: a from/to range
  // could only ever have moved that one month.
  const [amcUpto, setAmcUpto] = useState('');        // 'YYYY-MM'
  const [amcMonOpen, setAmcMonOpen] = useState(false);
  const amcFy = amc?.meta?.fy ?? null;

  // ---- which of the AMC report's two sheets is open ----------------------
  // The AMC tab is a FULL financial year with the running month by week, so it
  // picks a YEAR like the CDI sheet - not the Projection tab's 'how far in'
  // month, which would say nothing about a sheet that already prints every
  // month of the year as a column of its own.
  const [amcTab, setAmcTab] = useState(AMC_TABS[0].key);
  const [amc2Fy, setAmc2Fy] = useState(null);
  const amcMonthly = report === AMC_REPORT && amcTab === 'monthly';

  // The 12 'YYYY-MM' of a financial year, April first.
  const fyMonths = (y) => Array.from({ length: 12 }, (_v, i) => {
    const m = 4 + i;
    return m <= 12 ? `${y}-${String(m).padStart(2, '0')}`
      : `${y + 1}-${String(m - 12).padStart(2, '0')}`;
  });
  const monLabel = (m) => (m
    ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    : '');

  // Open on the last month the agreements actually reach, inside that year.
  useEffect(() => {
    // the last month that actually HAS payments - the month column reads the
    // quote files, so defaulting to a later agreement month would open the
    // sheet on a month with nothing in it
    const hi = amc?.meta?.pay_max_month || amc?.meta?.max_month;
    if (!hi || amcFy === null || amcUpto) return;
    const ms = fyMonths(amcFy);
    setAmcUpto(hi < ms[0] ? ms[0] : (hi > ms[11] ? ms[11] : hi));
  }, [amc, amcFy, amcUpto]);

  // ---- the FY picker, shared by the two sheets that are ONE year wide ----
  // Each keeps its own year: their files cover different spans, and switching
  // report must not drag the other sheet onto a year its file never reached.
  const FY_PICK = {
    [CDI_REPORT]: { payload: cdi, fy: cdiFy, set: setCdiFy },
    [SVC_REPORT]: { payload: svc, fy: svcFy, set: setSvcFy },
  };
  // The AMC report's AMC tab joins them - keyed on the TAB, not the report, so
  // switching back to Projection hands the month picker straight back.
  const fyPick = amcMonthly
    ? { payload: amc2, fy: amc2Fy, set: setAmc2Fy }
    : (FY_PICK[report] || null);
  const fyPickChoices = fyChoicesOf(fyPick?.payload);

  // Default to the year the file ends in, the moment the payload lands.
  useEffect(() => {
    if (cdi?.meta?.max_date && cdiFy === null) setCdiFy(fyOfIso(cdi.meta.max_date));
  }, [cdi, cdiFy]);
  useEffect(() => {
    if (svc?.meta?.max_date && svcFy === null) setSvcFy(fyOfIso(svc.meta.max_date));
  }, [svc, svcFy]);
  // The AMC tab opens on the RUNNING year, not the year the data ends in: the
  // sheet is 'this year against its AOP', and its expiries already carry dates
  // years ahead. meta.fy is that running year, read off today by the backend.
  useEffect(() => {
    if (amc2 && amc2.meta && amc2.meta.fy !== undefined && amc2.meta.fy !== null
      && amc2Fy === null) setAmc2Fy(amc2.meta.fy);
  }, [amc2, amc2Fy]);

  // A year change costs no fetch, only a re-aggregation — but on a full year
  // that is real work, so it is applied one tick late: the spinner gets a frame
  // to paint and the sheet is rebuilt exactly once.
  const applyPickedFy = (y) => {
    if (!fyPick) return;
    setRecalc(true);
    clearTimeout(rangeTimer.current);
    rangeTimer.current = setTimeout(() => {
      fyPick.set(y);
      setRecalc(false);
    }, 160);
  };

  // Reporting period. Service Penetration is the only sheet on this page that
  // reads a from/to range at all — the other three each pick a financial year of
  // their own — and it reads exactly ONE YEAR of it. So the control is a single
  // date: the year ENDS on the day picked and starts the day after the same date
  // a year earlier. Pick 31 Aug 26 and the sheet reads 1 Sep 25 → 31 Aug 26.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);

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

  // Service Penetration is the sheet this page-load fetch belongs to, so it only
  // runs for a user who holds it — otherwise the request would 403 and paint the
  // whole page with its error.
  const hasSvcPen = myReports.some((r) => r.key === 'service_penetration');
  useEffect(() => {
    if (hasSvcPen) load(true);
    else setLoading(false);
  }, [load, hasSvcPen]);

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

  // The AMC & Bandhan sheet reads the AMC Population Report, so it too is
  // fetched on first open and then kept.
  const loadAmc = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/annual/amc-bandhan`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setAmc(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (report === AMC_REPORT && !amc) loadAmc();
  }, [report, amc, loadAmc]);

  // The AMC tab reads the same file through a different endpoint (per agreement
  // category rather than per branch), so it is fetched the first time that TAB is
  // opened and then kept - opening the report itself does not pay for it.
  const loadAmc2 = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/annual/amc-monthly`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setAmc2(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (amcMonthly && !amc2) loadAmc2();
  }, [amcMonthly, amc2, loadAmc2]);

  // The Service Load sheet reads the Response Time & MaxTTR file — its own
  // source, so it too is fetched on first open and then kept.
  const loadSvc = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/report/annual/service-load`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setSvc(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (report === SVC_REPORT && !svc) loadSvc();
  }, [report, svc, loadSvc]);

  const PAYLOAD = { [CDI_REPORT]: cdi, [AMC_REPORT]: amc, [SVC_REPORT]: svc };
  const active = amcMonthly ? amc2 : (report in PAYLOAD ? PAYLOAD[report] : data);
  // min_start / max_start where the payload has them - see fyChoicesOf above.
  const dataRange = {
    min: active?.meta?.min_start || active?.meta?.min_date || null,
    max: active?.meta?.max_start || active?.meta?.max_date || null,
  };

  const clampToData = (from, to) => {
    let f = from, t = to;
    if (dataRange.min && f < dataRange.min) f = dataRange.min;
    if (dataRange.max && t > dataRange.max) t = dataRange.max;
    if (f > t) f = t;
    return [f, t];
  };

  // The twelve months ENDING on a given day: the day after the same date a year
  // before, through that day. 31 Aug 26 → 1 Sep 25 … 31 Aug 26, which is 365
  // days, not 366 — a year of service is the year up TO the date, and counting
  // 1 Sep both years would put one day in two consecutive reports.
  const yearEnding = (isoEnd) => {
    const d = new Date(isoEnd + 'T00:00:00');
    // +1 day BEFORE -1 year, not after: on 29 Feb the other order lands on
    // 2 Mar (JS rolls a non-existent 29 Feb over) and the window comes out a
    // day short of a year. This way round every window is a full 365 — 366 when
    // it holds a 29 Feb.
    d.setDate(d.getDate() + 1);
    d.setFullYear(d.getFullYear() - 1);
    return isoOf(d);
  };

  // The default is the year ending on the LAST DAY THE DATA REACHES — the newest
  // full year the file can actually answer for. Re-applied whenever the range
  // changes, which is exactly when a report with its own source file is opened.
  useEffect(() => {
    if (!dataRange.max) return;
    const [f, t] = clampToData(yearEnding(dataRange.max), dataRange.max);
    setFromDate(f);
    setToDate(t);
  }, [dataRange.min, dataRange.max]);   // eslint-disable-line react-hooks/exhaustive-deps

  // EVERY period control lands here. The reports re-aggregate their raw payload
  // on the spot — no refetch — but on a full financial year that is real work,
  // so the new range is applied one tick LATE: the spinner gets a frame to paint
  // first, and the table is rebuilt exactly once, with the new dates.
  const applyRange = (f, t) => {
    setRecalc(true);
    setShowRangePicker(false);
    clearTimeout(rangeTimer.current);      // a newer pick always wins
    rangeTimer.current = setTimeout(() => {
      setFromDate(f);
      setToDate(t);
      setRecalc(false);
    }, 160);
  };

  // One click on the calendar IS the period — there is nothing left to confirm
  // once the end date is known, so there is no Apply button to press.
  const applyYearEnd = (d) => {
    if (!d) return;
    const end = isoOf(d);
    const [f, t] = clampToData(yearEnding(end), end);
    applyRange(f, t);
  };

  const cur = REPORTS.find((r) => r.key === report) || myReports[0] || REPORTS[0];

  // The AMC report's two sheets, as a segmented control. It is handed DOWN into
  // whichever sheet is open and rendered inside that sheet's own header row -
  // a strip of its own above the sheet gave the one report two header bars. A
  // segment rather than an underlined tab for the same reason: on a shared row
  // it has to read as a control, not as the row's heading.
  const amcTabStrip = report !== AMC_REPORT ? null : (
    <div className="pms-seg flex items-center p-0.5 rounded-lg bg-gray-200/70">
      {AMC_TABS.map((t) => (
        <button key={t.key} type="button" onClick={() => setAmcTab(t.key)}
          title={t.sub}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
            t.key === amcTab ? 'pms-seg-on bg-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          style={t.key === amcTab ? { color: themeColor } : {}}>
          {t.name}
        </button>
      ))}
    </div>
  );

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
                    ? <>{cur.name} · {SOURCE_FILE[report] || 'source'} data
                      {' '}{fmtDayYr(dataRange.min)} → {fmtDayYr(dataRange.max)}</>
                    : ((loading || !active) ? 'Loading…'
                      : `No data yet — upload the ${SOURCE_FILE[report] || 'source'}`
                        + ' file on the Data Upload page')}
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
                      {myReports.map((r) => (
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
                   FY is this?" to be inferred from the dates. The AMC sheet is
                   the same animal plus one thing - how far into that year its
                   YTD runs - so it picks a YEAR and a MONTH. ---- */}
              {report === AMC_REPORT && !amcMonthly ? (
                /* One control: how far into the year to read. The year itself is
                   not a choice — the sheet is this year against its AOP. */
                <div className="relative w-[220px] max-w-full"
                  onMouseEnter={() => setAmcMonOpen(true)}
                  onMouseLeave={() => setAmcMonOpen(false)}>
                  <button onClick={() => setAmcMonOpen(!amcMonOpen)} disabled={!amc}
                    className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 disabled:opacity-50 transition-all"
                    style={{ color: themeColor }}>
                    <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">YTD to {monLabel(amcUpto) || '—'}</span>
                    <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${amcMonOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {amcMonOpen && amcFy !== null && (
                    <div className="absolute z-50 left-0 right-0 top-full pt-2">
                      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-1 max-h-72 overflow-y-auto">
                        <p className="px-2.5 py-1 text-[10px] text-gray-400">
                          FY {amcFy}–{String(amcFy + 1).slice(2)} · F{String(amcFy + 1).slice(-2)}
                        </p>
                        {fyMonths(amcFy).map((m, i) => (
                          <button key={m} type="button"
                            onClick={() => { setAmcMonOpen(false); setAmcUpto(m); }}
                            className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                              m === amcUpto ? 'text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                            style={m === amcUpto ? { backgroundColor: themeColor } : {}}>
                            <span className="font-semibold">{monLabel(m)}</span>
                            <span className={`block text-[10px] ${m === amcUpto ? 'text-white/70' : 'text-gray-400'}`}>
                              {i === 11 ? 'the full year' : `Apr–${monLabel(m).slice(0, 3)} · ${i + 1} month${i ? 's' : ''}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : fyPick ? (
                /* CDI and Service Load are ONE FINANCIAL YEAR wide, so they
                   pick a year rather than a from/to range: a range picker would
                   leave "which FY is this?" to be inferred from the dates. */
                <div className="relative w-[190px] max-w-full"
                  onMouseEnter={() => setFyPickOpen(true)}
                  onMouseLeave={() => setFyPickOpen(false)}>
                  <button onClick={() => setFyPickOpen(!fyPickOpen)} disabled={!fyPick.payload}
                    className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 disabled:opacity-50 transition-all"
                    style={{ color: themeColor }}>
                    <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {fyPick.fy === null ? 'Financial year'
                        : `FY ${fyPick.fy}–${String(fyPick.fy + 1).slice(2)}`}
                    </span>
                    <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${fyPickOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {fyPickOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full pt-2">
                      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-1 max-h-60 overflow-y-auto">
                        {fyPickChoices.map((y) => (
                          <button key={y} type="button"
                            onClick={() => { setFyPickOpen(false); applyPickedFy(y); }}
                            className={`block w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                              y === fyPick.fy ? 'text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                            style={y === fyPick.fy ? { backgroundColor: themeColor } : {}}>
                            <span className="font-semibold">FY {y}–{String(y + 1).slice(2)}</span>
                            <span className={`block text-[10px] ${y === fyPick.fy ? 'text-white/70' : 'text-gray-400'}`}>
                              Apr {y} – Mar {y + 1}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ONE date, and the year ends on it. The preset list this
                   replaced offered Today / Last Week / Last Quarter on a sheet
                   that is only meaningful over a full year — every one of them
                   printed a penetration figure nobody could act on. */
                <div className="relative w-[250px] max-w-full"
                  onMouseEnter={() => dataRange.max && setShowRangePicker(true)}
                  onMouseLeave={() => setShowRangePicker(false)}>
                  <button onClick={() => setShowRangePicker(!showRangePicker)} disabled={!dataRange.max}
                    className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white shadow-md hover:bg-white/90 disabled:opacity-50 transition-all"
                    style={{ color: themeColor }}>
                    <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {toDate ? `Year to ${fmtDayYr(toDate)}` : 'Select year end'}
                    </span>
                    <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showRangePicker ? 'rotate-180' : ''}`} />
                  </button>

                  {showRangePicker && (
                    <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2">
                      <div className="sm:w-[300px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200 text-gray-800 p-3">
                        <h3 className="text-xs font-semibold text-gray-800 text-center">
                          Last day of the year
                        </h3>
                        {/* what the pick MEANS, before it is made — the whole
                            point of the control is the year it derives. */}
                        <p className="mt-0.5 mb-2 text-[10.5px] text-center text-gray-500">
                          {fromDate && toDate ? (
                            <>reading <b className="text-gray-800">{fmtDayYr(fromDate)} → {fmtDayYr(toDate)}</b></>
                          ) : 'the twelve months ending on the day you pick'}
                        </p>
                        {/* dropdownMode is 'scroll', not 'select': a native
                            <select> renders its list outside the page and no CSS
                            can bound it, so on the asset master — whose
                            commissioning dates reach back years — the year list
                            ran off the popover. react-datepicker's own dropdown
                            is a plain div the stylesheet can cap (see
                            .custom-calendar in index.css). */}
                        <div className="border border-gray-200 rounded-lg p-1 bg-gray-50/50 flex justify-center">
                          <DatePicker
                            selected={toDate ? new Date(toDate + 'T00:00:00') : null}
                            onChange={applyYearEnd}
                            inline
                            showMonthDropdown
                            showYearDropdown
                            scrollableYearDropdown
                            yearDropdownItemNumber={8}
                            dropdownMode="scroll"
                            minDate={dataRange.min ? new Date(dataRange.min + 'T00:00:00') : undefined}
                            maxDate={dataRange.max ? new Date(dataRange.max + 'T00:00:00') : undefined}
                            calendarClassName="custom-calendar"
                            dateFormat="dd/MM/yyyy"
                          />
                        </div>
                        <p className="mt-2 text-[10px] text-center text-gray-400">
                          Data runs {fmtDayYr(dataRange.min)} → {fmtDayYr(dataRange.max)}
                        </p>
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
          ) : report === SVC_REPORT ? (
            <ServiceLoadResponseReport data={svc} fy={svcFy} />
          ) : amcMonthly ? (
            <AmcMonthlyReport data={amc2} fy={amc2Fy} tabs={amcTabStrip} />
          ) : report === AMC_REPORT ? (
            <AmcBandhanProjectionReport data={amc} upto={amcUpto} tabs={amcTabStrip} />
          ) : (
            <ServicePenetrationReport data={data} periodFrom={fromDate} periodTo={toDate} />
          )}
        </div>

      </div>
    </div>
  );
};

export default AnnualReports;
