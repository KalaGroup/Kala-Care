import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { canExportExcel } from '../utils/exportPermission';
import {
  ChartBarSquareIcon, ArrowUpTrayIcon, DocumentMagnifyingGlassIcon,
  ClockIcon, BookmarkSquareIcon, XMarkIcon, TrashIcon, ArrowDownTrayIcon,
  DocumentCheckIcon, TableCellsIcon, ArrowPathIcon, CalendarDaysIcon,
  ChevronDownIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// PMS → Sales and Labour Report  (Performance Management System)
// Spare & Labour Sale — regional performance vs monthly targets.
//   ① Upload files (Part Sale + Labour Revenue Excel; dedupe on re-upload)
//   ② Preview stored data   ③ Generate report   ④ Save to History / Print
// Backend: server/app/routes/pms_routes.py (master admin only)
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as Knowledge Bank) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47, 49, 146, 0.10)';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

// ---- formatting helpers ----------------------------------------------------
const inr = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
// Lakh display for the summary tiles (mockup shows "30.93 L")
const lakh = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 10000000) return (n / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(n) >= 100000) return (n / 100000).toFixed(2) + ' L';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};
const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const fmtFull = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};
// Wrap every case-insensitive occurrence of `query` inside `text` in a yellow
// <mark> — used by the preview's Claim Invoice No search.
const highlightMatch = (text, query) => {
  if (text == null) return '—';
  const s = String(text);
  const q = (query || '').trim();
  if (!q) return s;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = s.split(new RegExp(`(${esc})`, 'ig'));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-yellow-300 rounded-[2px] px-0">{p}</mark>
      : p
  );
};

// Grid-style tables — every cell bordered.
const thCls =
  'px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-200';
const tdCls = 'px-2 py-1.5 whitespace-nowrap border border-gray-200';

// Expected file format (shown by "Check file format") — same idea as the
// Import page's format panel. Critical columns are marked with *.
const EXPECTED_FORMAT = {
  critical: ['BRANCH ID', 'CLAIM INVOICE DATE', 'NET TAXABLE AMOUNT'],
  columns: [
    'ZONE NAME', 'SOID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME',
    'CLAIM INVOICE NO', 'CLAIM INVOICE DATE', 'PRODUCT SEGMENT',
    'SEGMENT', 'SERVICE REPORT TYPE', 'NET TAXABLE AMOUNT',
  ],
};

const REPORT_TYPES = [
  { key: 'spare', name: 'Spare Part Sales' },
  { key: 'labour', name: 'Labour Sales' },
  { key: 'regional', name: 'Regional-wise Sales' },
  { key: 'segment', name: 'Segment-wise Sales' },
  { key: 'service_head', name: 'Service Report Type-wise Sales' },
];

const PREVIEW_COLS = [
  ['zone_name', 'Zone'], ['soid', 'SOID'], ['sd_name', 'SD Name'],
  ['branch_id', 'Branch ID'], ['branch_name', 'Branch Name'],
  ['claim_invoice_no', 'Claim Invoice No'], ['claim_invoice_date', 'Claim Invoice Date'],
  ['product_segment', 'Product Segment'], ['segment', 'Segment'],
  ['sr_type', 'Service Report Type'], ['net_taxable_amount', 'Net Taxable Amount'],
];

// ---- one upload box (Part Sale / Labour Revenue) ---------------------------
const UploadBox = ({ label, recordType, onUploaded, onCheckFormat }) => {
  const [file, setFile] = useState(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const inputRef = useRef(null);

  const send = async (validateOnly, fileArg = file) => {
    if (!fileArg) { toast.error('Choose a file first'); return; }
    const post = async (validate) => {
      const fd = new FormData();
      fd.append('file', fileArg);
      fd.append('record_type', recordType);
      fd.append('validate_only', validate ? 'true' : 'false');
      const res = await fetch(`${API}/pms/upload`, { method: 'POST', headers: authHeaders(), body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
      return data;
    };

    validateOnly ? setChecking(true) : setUploading(true);
    try {
      if (validateOnly) {
        const data = await post(true);
        setCheckResult(data);
        data.success ? toast.success(`${label}: format OK (${data.rows} rows × ${data.columns} cols)`)
          : toast.error(data.message);
      } else {
        // The format is ALWAYS validated first — an invalid file is never uploaded.
        const check = await post(true);
        setCheckResult(check);
        if (!check.success) {
          toast.error(`${label}: file not uploaded — ${check.message}`);
          return;
        }
        const data = await post(false);
        if (!data.success) throw new Error(data.message);
        toast.success(`${label}: ${data.inserted} new, ${data.updated ?? 0} updated, ${data.duplicates} duplicates skipped`);
        setCheckResult(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        onUploaded?.();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      validateOnly ? setChecking(false) : setUploading(false);
    }
  };

  return (
    <div className="flex-1 min-w-[260px] border border-dashed border-gray-300 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-800">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <input ref={inputRef} type="file" accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            setCheckResult(null);
            if (f) send(true, f);   // validate immediately on choose
          }}
          className="text-[11px] text-gray-600 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:text-[11px] file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 w-full" />
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => { onCheckFormat?.(label); if (file) send(true); }}
          disabled={checking}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
          <DocumentCheckIcon className="h-3 w-3" /> {checking ? 'Checking…' : 'Check file format'}
        </button>
        <button onClick={() => send(false)}
          disabled={uploading || !file || (checkResult && !checkResult.success)}
          title={checkResult && !checkResult.success ? 'Fix the file format first' : undefined}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white rounded hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: themeColor }}>
          <ArrowUpTrayIcon className="h-3 w-3" /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {checkResult && (
        <div className={`mt-2 text-[11px] rounded p-1.5 ${checkResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {checkResult.message}
          {checkResult.success && (
            <span className="text-gray-500"> — {checkResult.rows} rows × {checkResult.columns} columns</span>
          )}
          {/* Expected columns the file does NOT have — those show as “—” after upload */}
          {checkResult.mapped && (() => {
            const FIELD_LABEL = {
              zone_name: 'ZONE NAME', soid: 'SOID', sd_name: 'SD NAME',
              branch_id: 'BRANCH ID', branch_name: 'BRANCH NAME',
              claim_invoice_no: 'CLAIM INVOICE NO', claim_invoice_date: 'CLAIM INVOICE DATE',
              product_segment: 'PRODUCT SEGMENT', segment: 'SEGMENT',
              sr_type: 'SERVICE REPORT TYPE', net_taxable_amount: 'NET TAXABLE AMOUNT',
            };
            const notFound = Object.keys(FIELD_LABEL).filter((f) => !checkResult.mapped[f]);
            return notFound.length > 0 && checkResult.success ? (
              <div className="mt-1 text-amber-700">
                Not found in this file (will show as “—”): {notFound.map((f) => FIELD_LABEL[f]).join(', ')}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const SalesLabourReport = () => {
  // stored-data summary + preview
  const [summary, setSummary] = useState(null);
  const [previewType, setPreviewType] = useState('part');
  const [previewRows, setPreviewRows] = useState([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewBusyRef = useRef(false);   // guards concurrent lazy-load pages
  // Claim Invoice No search — `previewSearch` follows the input, `previewQuery`
  // is the debounced value actually sent to the server (search runs over the
  // WHOLE stored dataset, not just loaded rows).
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewQuery, setPreviewQuery] = useState('');
  const previewReqRef = useRef(0);        // drops stale out-of-order responses
  const [batches, setBatches] = useState([]);
  const [showBatches, setShowBatches] = useState(false);

  // report
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [branchFilter, setBranchFilter] = useState('All');   // branch_id | 'All'
  // 'data' shows the Uploaded File Preview box; 'report' replaces it with the
  // generated report (Back to Data returns).
  const [view, setView] = useState('data');
  // Which file's expected-format panel is open (label string or null)
  const [formatFor, setFormatFor] = useState(null);
  // Report period — applied range (ISO strings) + the range-picker popover
  // (Quick Select presets or a custom calendar range, like the Dashboard's).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);
  // Default = As On Date (month-to-date ending at the latest data date)
  const [activePeriod, setActivePeriod] = useState('as_on');
  const [pickStart, setPickStart] = useState(null);   // calendar Date objects
  const [pickEnd, setPickEnd] = useState(null);
  // Whether the CURRENT report has been saved to history (drives step ④)
  const [savedHist, setSavedHist] = useState(false);
  const [reportType, setReportType] = useState('spare');
  
  const [savingReport, setSavingReport] = useState(false);

  // history
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Saved report opened INSIDE the modal: {id, title, as_on_date, payload}
  const [historyDetail, setHistoryDetail] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pms/data/summary`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setSummary(data.summary);
    } catch { /* non-fatal */ }
  }, []);

  // Debounce the search box (350 ms) so we hit the server once per pause,
  // not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setPreviewQuery(previewSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [previewSearch]);

  const previewUrl = useCallback((rt, offset) =>
    `${API}/pms/data/preview?record_type=${rt}&limit=200&offset=${offset}` +
    (previewQuery ? `&search=${encodeURIComponent(previewQuery)}` : ''),
  [previewQuery]);

  // First page (reset) — 200 rows; further pages appended by onPreviewScroll.
  const loadPreview = useCallback(async (rt) => {
    const reqId = ++previewReqRef.current;
    previewBusyRef.current = true;
    setPreviewLoading(true);
    try {
      const res = await fetch(previewUrl(rt, 0), { headers: authHeaders() });
      const data = await res.json();
      if (reqId !== previewReqRef.current) return;   // a newer request superseded this one
      if (res.ok && data.success) {
        setPreviewRows(data.items || []);
        setPreviewTotal(data.total || 0);
      }
    } catch {
      if (reqId === previewReqRef.current) { setPreviewRows([]); setPreviewTotal(0); }
    }
    finally {
      if (reqId === previewReqRef.current) { setPreviewLoading(false); previewBusyRef.current = false; }
    }
  }, [previewUrl]);

  // Lazy-load the next page when the preview table is scrolled near its end.
  const onPreviewScroll = useCallback(async (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 300) return;
    if (previewBusyRef.current) return;
    if (previewRows.length >= previewTotal) return;   // everything loaded
    previewBusyRef.current = true;
    const reqId = previewReqRef.current;
    try {
      const res = await fetch(previewUrl(previewType, previewRows.length), { headers: authHeaders() });
      const data = await res.json();
      if (reqId !== previewReqRef.current) return;   // search/type changed mid-flight
      if (res.ok && data.success) {
        setPreviewRows((prev) => [...prev, ...(data.items || [])]);
        setPreviewTotal(data.total || 0);
      }
    } catch { /* next scroll retries */ }
    finally { if (reqId === previewReqRef.current) previewBusyRef.current = false; }
  }, [previewRows.length, previewTotal, previewType, previewUrl]);

  const loadBatches = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pms/uploads`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setBatches(data.items || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadSummary(); loadBatches(); }, [loadSummary, loadBatches]);
  useEffect(() => { loadPreview(previewType); }, [previewType, loadPreview]);

  // The uploaded data's overall date range — presets and pickers stay inside it.
  const dataRange = (() => {
    if (!summary) return { min: null, max: null };
    const froms = [summary.part?.from_date, summary.labour?.from_date].filter(Boolean).sort();
    const tos = [summary.part?.to_date, summary.labour?.to_date].filter(Boolean).sort();
    return { min: froms[0] || null, max: tos[tos.length - 1] || null };
  })();

  const isoOf = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const clampToData = (from, to) => {
    let f = from, t = to;
    if (dataRange.min && f < dataRange.min) f = dataRange.min;
    if (dataRange.max && t > dataRange.max) t = dataRange.max;
    if (f > t) f = t;
    return [f, t];
  };

  // Default period once data arrives: As On the latest data date (month-to-date).
  useEffect(() => {
    if (!dataRange.max) return;
    let f = dataRange.max.slice(0, 8) + '01';
    if (dataRange.min && f < dataRange.min) f = dataRange.min;
    setFromDate((cur) => cur || f);
    setToDate((cur) => cur || dataRange.max);
    // pre-select the as-on date in the calendar so Apply works immediately
    setPickStart((cur) => cur || new Date(dataRange.max + 'T00:00:00'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRange.min, dataRange.max]);

  // Quick Select presets — computed from the latest uploaded data date and
  // clamped inside the uploaded range.
  const QUICK_OPTIONS = [
    { key: 'as_on', label: 'As On Date' },
    { key: 'current_month', label: 'Current Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'last_quarter', label: 'Last Quarter' },
    { key: 'last_6m', label: 'Last 6 Months' },
    { key: 'last_year', label: 'Last 1 Year' },
    { key: 'full', label: 'Full Data' },
  ];
  const applyQuick = (key) => {
    if (!dataRange.max) return;
    if (key === 'as_on') {
      // Switch the calendar to single-date "As On" mode — the user picks the
      // as-on date and Apply runs month-start → that date.
      setActivePeriod('as_on');
      setPickStart(null);
      setPickEnd(null);
      return;
    }
    const max = dataRange.max;
    const d = new Date(max + 'T00:00:00');
    let from = max.slice(0, 8) + '01', to = max;
    if (key === 'last_month') {
      const s = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      from = isoOf(s);
      to = isoOf(new Date(d.getFullYear(), d.getMonth(), 0)); // last day of prev month
    } else if (key === 'last_quarter') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1));
    else if (key === 'last_6m') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 6, d.getDate() + 1));
    else if (key === 'last_year') from = isoOf(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate() + 1));
    else if (key === 'full') from = dataRange.min || max;
    const [f, t] = clampToData(from, to);
    setFromDate(f);
    setToDate(t);
    setActivePeriod(key);
    setShowRangePicker(false);
  };

  const asOnMode = activePeriod === 'as_on';

  const applyCustomRange = () => {
    if (asOnMode) {
      // As On: month-to-date ending on the picked day
      if (!pickStart) return;
      const asOnIso = isoOf(pickStart);
      const [f, t] = clampToData(asOnIso.slice(0, 8) + '01', asOnIso);
      setFromDate(f);
      setToDate(t);
      setShowRangePicker(false);
      return;
    }
    if (!pickStart || !pickEnd) return;
    const [f, t] = clampToData(isoOf(pickStart), isoOf(pickEnd));
    setFromDate(f);
    setToDate(t);
    setActivePeriod('custom');
    setShowRangePicker(false);
  };

  const onUploaded = () => { loadSummary(); loadBatches(); loadPreview(previewType); };

  const generate = async () => {
    if (!dataRange.max) { toast.error('Upload data first'); return; }
    const to = toDate || dataRange.max;
    const from = fromDate || to.slice(0, 8) + '01';
    setGenerating(true);
    try {
      const res = await fetch(`${API}/pms/report?as_on=${to}&from_date=${from}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Report failed');
      setReport(data);
      setView('report');
      setSavedHist(false);
      setBranchFilter('All');
      if (!data.spare_rows.length && !data.labour_rows.length) {
        toast('No data / targets found for ' + data.month, { icon: 'ℹ️' });
      } else {
        toast.success('Report generated');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const saveToHistory = async () => {
    if (!report) return;
    setSavingReport(true);
    try {
      const res = await fetch(`${API}/pms/report/save`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          as_on: report.as_on,
          title: `PMS Report as on ${fmtFull(report.as_on)}`,
          payload: report,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      setSavedHist(true);
      toast.success('Report saved to history');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingReport(false);
    }
  };

  const openHistory = async () => {
    setShowHistory(true);
    setHistoryDetail(null);
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/pms/report/history`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setHistory(data.items || []);
    } catch { /* non-fatal */ }
    finally { setHistoryLoading(false); }
  };

  // Open a saved report INSIDE the history modal (detail view).
  const openHistoryItem = async (id) => {
    try {
      const res = await fetch(`${API}/pms/report/history/${id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Could not open report');
      setHistoryDetail(data);
    } catch (e) {
      toast.error(e.message);
    }
  };

  // Push the saved report into the main report view (for filters/export).
  const loadHistoryToPage = () => {
    if (!historyDetail) return;
    setReport(historyDetail.payload);
    setView('report');
    setSavedHist(true);   // it came from history, so it is already saved
    setShowHistory(false);
    setHistoryDetail(null);
  };

  const deleteHistoryItem = async (id) => {
    try {
      const res = await fetch(`${API}/pms/report/history/${id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Delete failed');
      setHistory((prev) => prev.filter((h) => h.id !== id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message);
    }
  };

  // ---- report table data with region + branch filters ----
  const typeRows = report
    ? (reportType === 'labour' ? report.labour_rows : report.spare_rows)
    : [];
  const regionRows = typeRows;
  const branchOptions = regionRows.map((r) => ({ id: r.branch_id, name: r.branch_name }));
  // Guard: a branch hidden by the region filter falls back to All
  const activeBranch = branchFilter !== 'All' && regionRows.some((r) => r.branch_id === branchFilter)
    ? branchFilter : 'All';
  const branchRows = activeBranch === 'All'
    ? regionRows
    : regionRows.filter((r) => r.branch_id === activeBranch);
  const totals = branchRows.reduce((a, r) => ({
    monthly_target: a.monthly_target + (r.monthly_target || 0),
    daily_target: a.daily_target + (r.daily_target || 0),
    achieved_on: a.achieved_on + (r.achieved_on || 0),
    target_till: a.target_till + (r.target_till || 0),
    achieved_till: a.achieved_till + (r.achieved_till || 0),
    invoice_count_till: a.invoice_count_till + (r.invoice_count_till || 0),
    short_fall_till: a.short_fall_till + (r.short_fall_till || 0),
    balance_month: a.balance_month + (r.balance_month || 0),
  }), { monthly_target: 0, daily_target: 0, achieved_on: 0, target_till: 0, achieved_till: 0, invoice_count_till: 0, short_fall_till: 0, balance_month: 0 });

  const breakdownRows = report && ['regional', 'segment', 'service_head'].includes(reportType)
    ? report[reportType] : null;

  const dayLabel = report ? fmtDay(report.as_on) : '';
  const canExport = canExportExcel();

  // Export ONLY the table currently on screen, with the report info stacked
  // in the top rows. Permission-gated (master admin / can_export flag).
  const exportReport = async () => {
    if (!report) return;
    try {
      const XLSX = await import('xlsx');
      const typeName = REPORT_TYPES.find((t) => t.key === reportType)?.name || 'Report';
      const s = report.summary;
      const info = [
        ['Performance Management System — Spare & Labour Sale'],
        [`Generated Report : As on ${fmtFull(report.as_on)}`],
        ['Period', `${fmtFull(report.from_date)} → ${fmtFull(report.as_on)}`],
        ['Report Type', typeName],
        ['Total Spare Sale (₹)', s.total_spare_sale],
        ['Total Labour Sale (₹)', s.total_labour_sale],
        ['Overall % Achieved', s.overall_pct_achieved != null ? s.overall_pct_achieved + ' %' : '—'],
        ['Total Invoices', s.total_invoices],
        [],
      ];

      let header, rows;
      if (breakdownRows) {
        const label = reportType === 'regional' ? 'Region'
          : reportType === 'segment' ? 'Segment' : 'Service Head';
        header = [label, 'Spare Sale', 'Labour Sale', 'Total', 'Invoices'];
        rows = breakdownRows.map((r) => [r.name, r.part, r.labour, r.total, r.invoices]);
        rows.push(['Total',
          breakdownRows.reduce((x, r) => x + r.part, 0),
          breakdownRows.reduce((x, r) => x + r.labour, 0),
          breakdownRows.reduce((x, r) => x + r.total, 0),
          breakdownRows.reduce((x, r) => x + r.invoices, 0)]);
      } else {
        header = ['Region', 'Branch', 'Responsible Person', 'Monthly Target', 'Daily Target',
          `Achi. On ${dayLabel}`, `Target Till ${dayLabel}`, `Achi. Till ${dayLabel}`,
          `Invoice Count Till ${dayLabel}`, '% Achieved Till Date',
          'Short-Fall Till Date', 'Balance For Month'];
        // pivot layout: MH block, MH Total, KA block, KA Total, grand total
        const byRegion = {};
        branchRows.forEach((r) => { (byRegion[r.region] = byRegion[r.region] || []).push(r); });
        const regionKeys = ['MH', 'KA'].filter((k) => byRegion[k])
          .concat(Object.keys(byRegion).filter((k) => k !== 'MH' && k !== 'KA'));
        rows = [];
        regionKeys.forEach((reg) => {
          byRegion[reg].forEach((r, i) => rows.push([
            i === 0 ? reg : '', r.branch_name, r.responsible_person,
            r.monthly_target, r.daily_target, r.achieved_on, r.target_till,
            r.achieved_till, r.invoice_count_till, r.pct_achieved,
            r.short_fall_till, r.balance_month,
          ]));
          const s = byRegion[reg].reduce((a, r) => ({
            mt: a.mt + (r.monthly_target || 0), dt: a.dt + (r.daily_target || 0),
            ao: a.ao + (r.achieved_on || 0), tt: a.tt + (r.target_till || 0),
            at: a.at + (r.achieved_till || 0), ic: a.ic + (r.invoice_count_till || 0),
            sf: a.sf + (r.short_fall_till || 0), bm: a.bm + (r.balance_month || 0),
          }), { mt: 0, dt: 0, ao: 0, tt: 0, at: 0, ic: 0, sf: 0, bm: 0 });
          rows.push([`${reg} Total`, '', '', s.mt, s.dt, s.ao, s.tt, s.at, s.ic,
            s.tt ? +(s.at / s.tt * 100).toFixed(1) : '—', s.sf, s.bm]);
        });
        rows.push([`Total (All)`, '', '', totals.monthly_target, totals.daily_target,
          totals.achieved_on, totals.target_till, totals.achieved_till, totals.invoice_count_till,
          totals.target_till ? +(totals.achieved_till / totals.target_till * 100).toFixed(1) : '—',
          totals.short_fall_till, totals.balance_month]);
      }

      const ws = XLSX.utils.aoa_to_sheet([...info, header, ...rows]);
      ws['!cols'] = header.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PMS Report');
      XLSX.writeFile(wb, `PMS_${typeName.replace(/[^\w]+/g, '_')}_${report.as_on}.xlsx`);
      toast.success('Report exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">
      {/* Print: only the generated report section prints */}
      <style>{`@media print {
        .pms-no-print { display: none !important; }
        .pms-print-area { box-shadow: none !important; border: none !important; }
      }
      /* Compact range calendar — same look as the Dashboard's picker */
      .custom-calendar { border: none !important; font-size: 0.7rem !important; background: transparent !important; }
      .custom-calendar .react-datepicker__header { background-color: white; border-bottom: 1px solid #e5e7eb; font-size: 0.7rem; padding-top: 0.3rem; }
      .custom-calendar .react-datepicker__current-month { font-size: 0.7rem; font-weight: 500; }
      .custom-calendar .react-datepicker__day-name,
      .custom-calendar .react-datepicker__day { font-size: 0.65rem; width: 1.7rem; line-height: 1.7rem; margin: 0.08rem; }
      .custom-calendar .react-datepicker__day--selected,
      .custom-calendar .react-datepicker__day--range-start,
      .custom-calendar .react-datepicker__day--range-end { background-color: ${themeColor} !important; color: white !important; }
      .custom-calendar .react-datepicker__day--in-range,
      .custom-calendar .react-datepicker__day--in-selecting-range { background-color: rgba(47,49,146,0.15); color: #1f2937; }
      `}</style>

      {/* ===== Hero header (same style as Knowledge Bank) ===== */}
      <div className="pms-no-print rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
              <ChartBarSquareIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-tight">Performance Management System</h1>
              <p className="text-[11px] text-white/70 leading-tight">
                Spare &amp; Labour Sale — regional performance vs monthly targets
              </p>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <button onClick={openHistory}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90"
              style={{ color: themeColor }}>
              <ClockIcon className="h-3.5 w-3.5" /> History
            </button>
          </div>
        </div>
      </div>

      {/* ============ ① Report Setup ============ */}
      <div className="pms-no-print bg-white rounded-2xl border border-gray-200 mb-3">
        <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <ArrowUpTrayIcon className="h-4 w-4" style={{ color: themeColor }} />
          <h2 className="text-sm font-semibold text-gray-900">Report Setup</h2>
          {/* Steps — plain text only */}
          <span className="ml-auto text-right text-[11px] font-bold text-gray-700">
            ① Upload files → ② Preview data → ③ Generate report → ④ Save
          </span>
        </div>
        <div className="p-3 flex flex-wrap gap-3">
          <UploadBox label="Part Sale file" recordType="part" onUploaded={onUploaded}
            onCheckFormat={(l) => setFormatFor((cur) => (cur === l ? null : l))} />
          <UploadBox label="Labour Revenue file" recordType="labour" onUploaded={onUploaded}
            onCheckFormat={(l) => setFormatFor((cur) => (cur === l ? null : l))} />
          {/* Generate */}
          <div className="flex-1 min-w-[220px] border border-dashed border-gray-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-800">Generate report</p>
            {/* Only the uploaded data range is shown — the report runs as on
                the latest uploaded invoice date automatically. */}
            <div className="mt-2 text-[11px] text-gray-500 space-y-0.5">
              {summary?.part?.rows > 0 && (
                <div>Part sale data: <b>{inr(summary.part.rows)}</b> rows
                  ({fmtDay(summary.part.from_date)} → {fmtDay(summary.part.to_date)})</div>
              )}
              {summary?.labour?.rows > 0 && (
                <div>Labour data: <b>{inr(summary.labour.rows)}</b> rows
                  ({fmtDay(summary.labour.from_date)} → {fmtDay(summary.labour.to_date)})</div>
              )}
              {summary && !dataRange.max && <div>No data uploaded yet — upload a file first.</div>}
            </div>
            {/* Period picker + Generate — one row */}
            <div className="mt-2 relative flex items-center gap-2">
              <button onClick={() => setShowRangePicker(!showRangePicker)} disabled={!dataRange.max}
                className="flex-1 min-w-0 flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                style={{ backgroundColor: themeColor }}>
                <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {fromDate && toDate ? `${fmtDay(fromDate)} → ${fmtDay(toDate)}` : 'Select period'}
                </span>
                <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showRangePicker ? 'rotate-180' : ''}`} />
              </button>
              <button onClick={generate} disabled={generating || !dataRange.max}
                className="flex-shrink-0 flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white rounded-full shadow-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                {generating ? 'Generating…' : 'Generate →'}
              </button>

              {showRangePicker && (
                <>
                  {/* click-outside closes */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowRangePicker(false)} />
                  <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 mt-2 sm:w-[440px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200">
                    <div className="p-3 max-h-[75vh] overflow-y-auto">
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Quick Select */}
                        <div className="sm:w-[34%]">
                          <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">Quick Select</h3>
                          <div className="space-y-1.5 w-full">
                            {QUICK_OPTIONS.map((o) => (
                              <button key={o.key} onClick={() => applyQuick(o.key)}
                                className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                                  activePeriod === o.key
                                    ? 'text-white'
                                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                                style={activePeriod === o.key ? { backgroundColor: themeColor } : {}}>
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Custom Range / As On calendar */}
                        <div className="sm:w-[66%]">
                          <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">
                            {asOnMode ? 'As On Date' : 'Custom Range'}
                          </h3>
                          {asOnMode ? (
                            <div className="mb-2">
                              <label className="block text-[11px] text-gray-500 mb-0.5 text-center">
                                Report runs from month start to the picked date
                              </label>
                              <div className="px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate">
                                {pickStart
                                  ? `${pickStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(' ', ' ')} — as on ${pickStart.toLocaleDateString('en-GB')}`
                                  : 'Not selected'}
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 mb-2">
                              <div className="flex-1">
                                <label className="block text-[11px] text-gray-500 mb-0.5 text-center">Start Date</label>
                                <div className="px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate">
                                  {pickStart ? pickStart.toLocaleDateString('en-GB') : 'Not selected'}
                                </div>
                              </div>
                              <div className="flex-1">
                                <label className="block text-[11px] text-gray-500 mb-0.5 text-center">End Date</label>
                                <div className="px-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center truncate">
                                  {pickEnd ? pickEnd.toLocaleDateString('en-GB') : 'Not selected'}
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="border border-gray-200 rounded-lg p-1 bg-gray-50/50 flex justify-center">
                            {asOnMode ? (
                              <DatePicker
                                selected={pickStart}
                                onChange={(d) => { setPickStart(d); setPickEnd(null); }}
                                inline
                                minDate={dataRange.min ? new Date(dataRange.min + 'T00:00:00') : undefined}
                                maxDate={dataRange.max ? new Date(dataRange.max + 'T00:00:00') : undefined}
                                calendarClassName="custom-calendar"
                                dateFormat="dd/MM/yyyy"
                              />
                            ) : (
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
                            )}
                          </div>
                          <div className="flex gap-2 mt-2.5">
                            <button onClick={() => setShowRangePicker(false)}
                              className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium">
                              Cancel
                            </button>
                            <button onClick={applyCustomRange}
                              disabled={asOnMode ? !pickStart : (!pickStart || !pickEnd)}
                              className="flex-1 px-2 py-1.5 text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                              style={{ backgroundColor: themeColor }}>
                              Apply
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ===== Expected File Format (opens from "Check file format") ===== */}
        {formatFor && (
          <div className="px-3 pb-3">
            <div className="rounded-lg border border-sky-200 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-sky-50 border-b border-sky-200">
                <div className="flex items-center gap-2">
                  <DocumentCheckIcon className="h-4 w-4 text-sky-700" />
                  <span className="text-xs font-bold text-sky-900">
                    Expected File Format for: {formatFor}
                  </span>
                </div>
                <button onClick={() => setFormatFor(null)} className="p-0.5 rounded hover:bg-sky-100">
                  <XMarkIcon className="h-3.5 w-3.5 text-sky-700" />
                </button>
              </div>
              <div className="p-3 bg-white">
                <p className="text-xs font-bold text-gray-800 mb-2">
                  Important columns in this file: {EXPECTED_FORMAT.columns.length}
                </p>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 p-2">
                  {EXPECTED_FORMAT.columns.map((c) => {
                    const critical = EXPECTED_FORMAT.critical.includes(c);
                    return (
                      <span key={c}
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-mono font-semibold tracking-wide border ${
                          critical
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-rose-50/60 border-rose-200 text-gray-800'}`}>
                        {c}{critical && ' *'}
                      </span>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-sky-800">
                  Column names can be spelled in any case, spacing or punctuation
                  (e.g. “branch id.” is accepted). Columns marked <b>*</b> are mandatory —
                  the file is rejected without them. Every other column in the file is
                  imported automatically as a dynamic column.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recent uploads */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setShowBatches(!showBatches)}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-800">
              {showBatches ? '▾' : '▸'} Recent uploads ({batches.length})
            </button>
            {dataRange.max && (
              <button
                onClick={async () => {
                  if (!window.confirm('Delete ALL uploaded Part Sale and Labour data? Targets, SR mapping and saved reports are kept. You can re-upload the files after.')) return;
                  try {
                    const res = await fetch(`${API}/pms/data`, { method: 'DELETE', headers: authHeaders() });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Clear failed');
                    toast.success(`Cleared ${inr(data.deleted_rows)} rows`);
                    setReport(null); setView('data');
                    onUploaded();
                  } catch (e) { toast.error(e.message); }
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700">
                <TrashIcon className="h-3 w-3" /> Clear all data
              </button>
            )}
          </div>
          {showBatches && batches.length > 0 && (
            <div className="mt-1.5 overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-[11px] border-collapse min-w-[640px]">
                <thead><tr>
                  <th className={thCls}>File</th><th className={thCls}>Type</th>
                  <th className={thCls}>Total</th><th className={thCls}>New</th>
                  <th className={thCls}>Updated</th>
                  <th className={thCls}>Duplicates</th><th className={thCls}>Skipped</th>
                  <th className={thCls}>Uploaded</th>
                </tr></thead>
                <tbody>
                  {batches.slice(0, 10).map((b) => (
                    <tr key={b.id} className="border-b border-gray-100">
                      <td className={tdCls}>{b.file_name}</td>
                      <td className={tdCls}>{b.record_type === 'part' ? 'Part Sale' : 'Labour'}</td>
                      <td className={tdCls}>{inr(b.total_rows)}</td>
                      <td className={`${tdCls} text-green-700 font-medium`}>{inr(b.inserted_rows)}</td>
                      <td className={`${tdCls} text-blue-700 font-medium`}>{inr(b.updated_rows)}</td>
                      <td className={tdCls}>{inr(b.duplicate_rows)}</td>
                      <td className={tdCls}>{inr(b.skipped_rows)}</td>
                      <td className={tdCls}>{b.uploaded_at ? new Date(b.uploaded_at).toLocaleString('en-GB') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ============ ② Uploaded data preview (hidden while viewing report) ============ */}
      {view === 'data' && (
      <div className="pms-no-print bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <TableCellsIcon className="h-4 w-4" style={{ color: themeColor }} />
          <h2 className="text-sm font-semibold text-gray-900">Uploaded File Preview</h2>
          <span className="text-[11px] text-gray-400">
            {previewTotal > 0 ? `${inr(previewRows.length)} of ${inr(previewTotal)} rows` : 'newest first'}
          </span>
          <div className="flex-1" />
          <div className="relative">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text" value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              placeholder="Search Claim Invoice No…"
              className="pl-7 pr-6 py-1 w-52 text-[11px] border border-gray-300 rounded-md outline-none focus:ring-1"
              style={{ '--tw-ring-color': themeColor }}
            />
            {previewSearch && (
              <button onClick={() => setPreviewSearch('')} title="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {[['part', 'Part Sale'], ['labour', 'Labour']].map(([k, n]) => (
            <button key={k} onClick={() => setPreviewType(k)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border ${previewType === k
                ? 'text-white border-transparent' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              style={previewType === k ? { backgroundColor: themeColor } : {}}>
              {n}
            </button>
          ))}
          <button onClick={() => loadPreview(previewType)} title="Refresh"
            className="p-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">
            <ArrowPathIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        {previewLoading ? (
          <div className="h-72 flex items-center justify-center text-sm text-gray-400">Loading…</div>
        ) : previewRows.length === 0 ? (
          /* Empty state — tall box with the message centered */
          <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
            <TableCellsIcon className="h-8 w-8" />
            <p className="text-sm">
              {previewQuery
                ? <>No invoice matching “{previewQuery}” in {previewType === 'part' ? 'Part Sale' : 'Labour'} data</>
                : <>No {previewType === 'part' ? 'Part Sale' : 'Labour'} data added yet</>}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto" onScroll={onPreviewScroll}>
            <table className="w-full text-[11px] border-collapse min-w-[1050px]">
              <thead className="sticky top-0"><tr>
                {PREVIEW_COLS.map(([k, label]) => <th key={k} className={thCls}>{label}</th>)}
              </tr></thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/60">
                    {PREVIEW_COLS.map(([k]) => (
                      <td key={k} className={`${tdCls} ${k === 'net_taxable_amount' ? 'text-right font-medium' : ''}`}>
                        {k === 'net_taxable_amount' ? inr(r[k])
                          : k === 'claim_invoice_no' ? highlightMatch(r[k], previewQuery)
                          : (r[k] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
                {previewRows.length < previewTotal && (
                  <tr><td colSpan={PREVIEW_COLS.length} className="text-center py-2 text-[11px] text-gray-400 border border-gray-200">
                    Scroll for more… ({inr(previewTotal - previewRows.length)} remaining)
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ============ ③ Generated Report (replaces the preview box) ============ */}
      {view === 'report' && report && (
        <div className="pms-print-area bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <button onClick={() => setView('data')}
              className="pms-no-print flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              ← Back to Data
            </button>
            <DocumentMagnifyingGlassIcon className="h-4 w-4 pms-no-print" style={{ color: themeColor }} />
            <h2 className="text-sm font-semibold text-gray-900">
              Generated Report : As on {fmtFull(report.as_on)}
              {report.from_date && (
                <span className="ml-2 text-[11px] font-medium text-gray-500">
                  (Period: {fmtDay(report.from_date)} → {fmtDay(report.as_on)})
                </span>
              )}
            </h2>
            <div className="flex-1" />
            <button onClick={saveToHistory} disabled={savingReport}
              className="pms-no-print flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
              <BookmarkSquareIcon className="h-3.5 w-3.5" /> {savingReport ? 'Saving…' : 'Save to History'}
            </button>
            {canExport && (
              <button onClick={exportReport}
                className="pms-no-print flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export
              </button>
            )}
          </div>

          {/* Summary tiles */}
          <div className="p-3 grid grid-cols-4 max-md:grid-cols-2 gap-2">
            {[
              ['Total Spare Sale', '₹ ' + lakh(report.summary.total_spare_sale)],
              ['Total Labour Sale', '₹ ' + lakh(report.summary.total_labour_sale)],
              ['Overall % Achieved', report.summary.overall_pct_achieved != null
                ? report.summary.overall_pct_achieved + ' %' : '— (no targets)'],
              ['Total Invoices', inr(report.summary.total_invoices)],
            ].map(([label, value]) => (
              <div key={label} className="border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[11px] text-gray-500">{label}</p>
                <p className="text-lg font-bold" style={{ color: themeColor }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Report type + region filter */}
          <div className="px-3 pb-2 flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-gray-500 mb-0.5">Select report type</label>
              <select value={reportType} onChange={(e) => setReportType(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': themeColor }}>
                {REPORT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </div>
            {!breakdownRows && (
              <div className="flex flex-col ml-auto">
                <label className="text-[10px] font-medium text-gray-500 mb-0.5">Branch</label>
                <select value={activeBranch} onChange={(e) => setBranchFilter(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-1 min-w-[160px]"
                  style={{ '--tw-ring-color': themeColor }}>
                  <option value="All">All Branches</option>
                  {branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* ===== Branch Analysis (one branch selected) ===== */}
          {!breakdownRows && activeBranch !== 'All' && branchRows.length === 1 && (() => {
            const b = branchRows[0];
            const totalWd = report.days_in_month || 0;
            const elapsedWd = b.daily_target > 0 ? Math.round(b.target_till / b.daily_target) : null;
            const remainingWd = elapsedWd != null ? Math.max(0, totalWd - elapsedWd) : null;
            const avgPerDay = elapsedWd ? b.achieved_till / elapsedWd : null;
            const requiredPerDay = (b.balance_month > 0 && remainingWd > 0) ? b.balance_month / remainingWd : 0;
            const totalAchieved = typeRows.reduce((s, r) => s + (r.achieved_till || 0), 0);
            const contribution = totalAchieved ? (b.achieved_till / totalAchieved * 100) : null;
            const rank = 1 + typeRows.filter((r) => (r.achieved_till || 0) > (b.achieved_till || 0)).length;
            const otherRows = reportType === 'labour' ? report.spare_rows : report.labour_rows;
            const o = (otherRows || []).find((r) => r.branch_id === b.branch_id);
            const otherName = reportType === 'labour' ? 'Spare' : 'Labour';
            const progress = b.monthly_target ? Math.min(100, b.achieved_till / b.monthly_target * 100) : null;
            const tile = (label, value, color) => (
              <div key={label} className="border border-gray-200 rounded-lg px-3 py-2 bg-white">
                <p className="text-[10px] text-gray-500">{label}</p>
                <p className="text-sm font-bold" style={{ color: color || themeColor }}>{value}</p>
              </div>
            );
            return (
              <div className="mx-3 mb-2 rounded-xl border p-3"
                style={{ borderColor: 'rgba(47,49,146,0.25)', backgroundColor: 'rgba(47,49,146,0.04)' }}>
                <div className="flex flex-wrap items-start gap-2 mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-gray-900">
                      Branch Analysis — {b.branch_name} ({b.region})
                      <span className="ml-2 text-[11px] font-normal text-gray-500">· {b.responsible_person}</span>
                    </h3>
                    <p className="text-[11px] font-semibold mt-0.5" style={{ color: themeColor }}>
                      Rank #{rank} of {typeRows.length} (by Achi. Till)
                    </p>
                  </div>
                  {/* compact month-progress bar — top-right corner */}
                  {progress != null && (
                    <div className="ml-auto w-44 max-sm:w-full">
                      <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                        <span>Month progress</span>
                        <span className="font-semibold">{progress.toFixed(1)} %</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden"
                        title={`₹${inr(b.achieved_till)} of ₹${inr(b.monthly_target)}`}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? '#15803d' : progress >= 70 ? '#ca8a04' : themeColor }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-5 max-lg:grid-cols-3 max-sm:grid-cols-2 gap-2">
                  {tile('% Achieved Till Date', b.pct_achieved != null ? b.pct_achieved + ' %' : '—',
                    b.pct_achieved == null ? undefined : b.pct_achieved >= 100 ? '#15803d' : b.pct_achieved >= 70 ? '#ca8a04' : '#92400e')}
                  {tile('Short-Fall Till Date', '₹ ' + inr(b.short_fall_till),
                    b.short_fall_till > 0 ? '#92400e' : '#15803d')}
                  {tile('Balance For Month', '₹ ' + inr(b.balance_month),
                    b.balance_month <= 0 ? '#15803d' : undefined)}
                  {tile('Avg / Working Day', avgPerDay != null ? '₹ ' + inr(avgPerDay) : '—')}
                  {tile(`Required / Day (${remainingWd ?? '—'} days left)`,
                    b.balance_month <= 0 ? 'Target met ✓' : '₹ ' + inr(requiredPerDay),
                    b.balance_month <= 0 ? '#15803d' : requiredPerDay > (b.daily_target || 0) ? '#92400e' : undefined)}
                  {tile('Invoices Till Date', inr(b.invoice_count_till))}
                  {tile('Avg Value / Invoice', b.invoice_count_till ? '₹ ' + inr(b.achieved_till / b.invoice_count_till) : '—')}
                  {tile(`Contribution (of all ${reportType === 'labour' ? 'Labour' : 'Spare'})`,
                    contribution != null ? contribution.toFixed(1) + ' %' : '—')}
                  {tile(`${otherName} — Achi. Till`, o ? '₹ ' + inr(o.achieved_till) : '—')}
                  {tile(`${otherName} — % Achieved`, o && o.pct_achieved != null ? o.pct_achieved + ' %' : '—',
                    !o || o.pct_achieved == null ? undefined : o.pct_achieved >= 100 ? '#15803d' : o.pct_achieved >= 70 ? '#ca8a04' : '#92400e')}
                </div>
              </div>
            );
          })()}

          {/* Branch table (Spare / Labour) — pivot layout: Region first with a
              merged cell per region (MH then KA), each region followed by its
              own subtotal row, then the grand total. */}
          {!breakdownRows && (
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="w-full text-[11px] border-collapse min-w-[980px]">
                <thead><tr>
                  <th className={thCls}>Region</th>
                  <th className={thCls}>Branch</th>
                  <th className={thCls}>Responsible Person</th>
                  <th className={thCls}>Monthly Target</th>
                  <th className={thCls}>Daily Target</th>
                  <th className={thCls}>Achi. on {dayLabel}</th>
                  <th className={thCls}>Target Till {dayLabel}</th>
                  <th className={thCls}>Achi. Till {dayLabel}</th>
                  <th className={thCls}>Invoice Count Till {dayLabel}</th>
                  <th className={thCls}>% Achieved Till Date</th>
                  <th className={thCls}>Short-Fall Till Date</th>
                  <th className={thCls}>Balance For Month</th>
                </tr></thead>
                <tbody>
                  {branchRows.length === 0 ? (
                    <tr><td colSpan={12} className="text-center py-6 text-gray-500">
                      No rows — upload data and set AOP targets for {report.month}.
                    </td></tr>
                  ) : (() => {
                    // group by region, MH first then KA then anything else
                    const byRegion = {};
                    branchRows.forEach((r) => { (byRegion[r.region] = byRegion[r.region] || []).push(r); });
                    const regionKeys = ['MH', 'KA'].filter((k) => byRegion[k])
                      .concat(Object.keys(byRegion).filter((k) => k !== 'MH' && k !== 'KA'));
                    const sumRows = (rows) => rows.reduce((a, r) => ({
                      monthly_target: a.monthly_target + (r.monthly_target || 0),
                      daily_target: a.daily_target + (r.daily_target || 0),
                      achieved_on: a.achieved_on + (r.achieved_on || 0),
                      target_till: a.target_till + (r.target_till || 0),
                      achieved_till: a.achieved_till + (r.achieved_till || 0),
                      invoice_count_till: a.invoice_count_till + (r.invoice_count_till || 0),
                      short_fall_till: a.short_fall_till + (r.short_fall_till || 0),
                      balance_month: a.balance_month + (r.balance_month || 0),
                    }), { monthly_target: 0, daily_target: 0, achieved_on: 0, target_till: 0, achieved_till: 0, invoice_count_till: 0, short_fall_till: 0, balance_month: 0 });
                    const metricCells = (s) => (
                      <>
                        <td className={`${tdCls} text-right`}>{inr(s.monthly_target)}</td>
                        <td className={`${tdCls} text-right`}>{inr(s.daily_target)}</td>
                        <td className={`${tdCls} text-right`}>{inr(s.achieved_on)}</td>
                        <td className={`${tdCls} text-right`}>{inr(s.target_till)}</td>
                        <td className={`${tdCls} text-right`}>{inr(s.achieved_till)}</td>
                        <td className={`${tdCls} text-right`}>{inr(s.invoice_count_till)}</td>
                        <td className={`${tdCls} text-right`}>
                          {s.target_till ? (s.achieved_till / s.target_till * 100).toFixed(1) + ' %' : '—'}
                        </td>
                        <td className={`${tdCls} text-right`}
                          style={{ color: s.short_fall_till > 0 ? '#92400e' : '#15803d' }}>
                          {inr(s.short_fall_till)}
                        </td>
                        <td className={`${tdCls} text-right`}>{inr(s.balance_month)}</td>
                      </>
                    );
                    return (
                      <>
                        {regionKeys.map((reg) => {
                          const rows = byRegion[reg];
                          const sub = sumRows(rows);
                          return (
                            <React.Fragment key={reg}>
                              {rows.map((r, i) => (
                                <tr key={r.branch_id} className="hover:bg-gray-50/60">
                                  {i === 0 && (
                                    <td rowSpan={rows.length}
                                      className={`${tdCls} text-center font-bold align-middle`}
                                      style={{ color: themeColor, backgroundColor: 'rgba(47,49,146,0.04)' }}>
                                      {reg}
                                    </td>
                                  )}
                                  <td className={tdCls}>{r.branch_name}</td>
                                  <td className={tdCls}>{r.responsible_person}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.monthly_target)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.daily_target)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.achieved_on)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.target_till)}</td>
                                  <td className={`${tdCls} text-right font-medium`}>{inr(r.achieved_till)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.invoice_count_till)}</td>
                                  <td className={`${tdCls} text-right font-semibold`}
                                    style={{ color: r.pct_achieved == null ? undefined : r.pct_achieved >= 100 ? '#15803d' : r.pct_achieved >= 70 ? '#a16207' : '#92400e' }}>
                                    {r.pct_achieved == null ? '—' : r.pct_achieved + ' %'}
                                  </td>
                                  <td className={`${tdCls} text-right`}
                                    style={{ color: r.short_fall_till == null ? undefined : r.short_fall_till > 0 ? '#92400e' : '#15803d' }}>
                                    {inr(r.short_fall_till)}
                                  </td>
                                  <td className={`${tdCls} text-right`}
                                    style={{ color: r.balance_month == null ? undefined : r.balance_month > 0 ? undefined : '#15803d' }}>
                                    {inr(r.balance_month)}
                                  </td>
                                </tr>
                              ))}
                              {/* region subtotal (like the pivot's "MH Total") */}
                              <tr className="font-semibold" style={{ backgroundColor: 'rgba(47,49,146,0.08)' }}>
                                <td className={tdCls} colSpan={3}>{reg} Total</td>
                                {metricCells(sub)}
                              </tr>
                            </React.Fragment>
                          );
                        })}
                        {/* grand total */}
                        <tr className="bg-gray-50 font-bold">
                          <td className={tdCls} colSpan={3}>Total (All)</td>
                          {metricCells(totals)}
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* Breakdown tables (Regional / Segment / Service head) */}
          {breakdownRows && (
            <div className="px-3 pb-3 overflow-x-auto">
              <table className="w-full text-[11px] border-collapse min-w-[560px]">
                <thead><tr>
                  <th className={thCls}>
                    {reportType === 'regional' ? 'Region' : reportType === 'segment' ? 'Segment' : 'Service Head'}
                  </th>
                  <th className={thCls}>Spare Sale</th>
                  <th className={thCls}>Labour Sale</th>
                  <th className={thCls}>Total</th>
                  <th className={thCls}>Invoices</th>
                </tr></thead>
                <tbody>
                  {breakdownRows.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-gray-500">No data for {report.month}.</td></tr>
                  ) : breakdownRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60">
                      <td className={`${tdCls} font-medium`}>{r.name}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.part)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.labour)}</td>
                      <td className={`${tdCls} text-right font-semibold`}>{inr(r.total)}</td>
                      <td className={`${tdCls} text-right`}>{inr(r.invoices)}</td>
                    </tr>
                  ))}
                  {breakdownRows.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td className={tdCls}>Total</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.part, 0))}</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.labour, 0))}</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.total, 0))}</td>
                      <td className={`${tdCls} text-right`}>{inr(breakdownRows.reduce((s, r) => s + r.invoices, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============ History modal (list → in-modal report viewer) ============ */}
      {showHistory && (
        <div className="pms-no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
              {historyDetail && (
                <button onClick={() => setHistoryDetail(null)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
                  ← Back to list
                </button>
              )}
              <h2 className="text-sm font-semibold text-gray-900 flex-1 truncate">
                {historyDetail ? historyDetail.title : 'Report History'}
              </h2>
              {historyDetail && (
                <button onClick={loadHistoryToPage}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90"
                  style={{ backgroundColor: themeColor }}>
                  Open in Report View
                </button>
              )}
              <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {!historyDetail ? (
                /* ---------- LIST ---------- */
                historyLoading ? (
                  <p className="text-center py-6 text-xs text-gray-500">Loading…</p>
                ) : history.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-2 text-gray-400">
                    <ClockIcon className="h-8 w-8" />
                    <p className="text-sm">No saved reports yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead><tr>
                      <th className={thCls}>Title</th>
                      <th className={thCls}>As on</th>
                      <th className={thCls}>Generated By</th>
                      <th className={thCls}>Saved</th>
                      <th className={thCls} style={{ width: 90 }}>Action</th>
                    </tr></thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                          <td className={tdCls}>
                            <button onClick={() => openHistoryItem(h.id)}
                              className="font-medium hover:underline" style={{ color: themeColor }}>
                              {h.title}
                            </button>
                          </td>
                          <td className={tdCls}>{fmtFull(h.as_on_date)}</td>
                          <td className={tdCls}>{h.created_by_name || h.created_by || '—'}</td>
                          <td className={tdCls}>{h.created_at ? new Date(h.created_at).toLocaleString('en-GB') : '—'}</td>
                          <td className={`${tdCls} text-center`}>
                            <button onClick={() => deleteHistoryItem(h.id)} title="Delete"
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                /* ---------- IN-MODAL REPORT VIEWER ---------- */
                (() => {
                  const p = historyDetail.payload;
                  const d = fmtDay(p.as_on);
                  const branchTable = (rows, title) => (
                    <div className="mt-3">
                      <h3 className="text-xs font-bold text-gray-800 mb-1.5">{title}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse min-w-[1000px]">
                          <thead><tr>
                            <th className={thCls}>Responsible Person</th>
                            <th className={thCls}>Branch</th>
                            <th className={thCls}>Region</th>
                            <th className={thCls}>Monthly Target</th>
                            <th className={thCls}>Daily Target</th>
                            <th className={thCls}>Achi. on {d}</th>
                            <th className={thCls}>Target Till {d}</th>
                            <th className={thCls}>Achi. Till {d}</th>
                            <th className={thCls}>Invoices</th>
                            <th className={thCls}>% Achieved</th>
                            <th className={thCls}>Short-Fall</th>
                            <th className={thCls}>Balance</th>
                          </tr></thead>
                          <tbody>
                            {(rows || []).map((r, i) => (
                              <tr key={i} className="hover:bg-gray-50/60">
                                <td className={tdCls}>{r.responsible_person}</td>
                                <td className={tdCls}>{r.branch_name}</td>
                                <td className={`${tdCls} text-center`}>{r.region}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.monthly_target)}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.daily_target)}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.achieved_on)}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.target_till)}</td>
                                <td className={`${tdCls} text-right font-medium`}>{inr(r.achieved_till)}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.invoice_count_till)}</td>
                                <td className={`${tdCls} text-right font-semibold`}
                                  style={{ color: r.pct_achieved == null ? undefined : r.pct_achieved >= 100 ? '#15803d' : r.pct_achieved >= 70 ? '#a16207' : '#92400e' }}>
                                  {r.pct_achieved == null ? '—' : r.pct_achieved + ' %'}
                                </td>
                                <td className={`${tdCls} text-right`}
                                  style={{ color: r.short_fall_till == null ? undefined : r.short_fall_till > 0 ? '#92400e' : '#15803d' }}>
                                  {inr(r.short_fall_till)}
                                </td>
                                <td className={`${tdCls} text-right`}>{inr(r.balance_month)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                  const breakdownTable = (rows, title, label) => (
                    <div className="mt-3">
                      <h3 className="text-xs font-bold text-gray-800 mb-1.5">{title}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse min-w-[480px]">
                          <thead><tr>
                            <th className={thCls}>{label}</th>
                            <th className={thCls}>Spare Sale</th>
                            <th className={thCls}>Labour Sale</th>
                            <th className={thCls}>Total</th>
                            <th className={thCls}>Invoices</th>
                          </tr></thead>
                          <tbody>
                            {(rows || []).map((r, i) => (
                              <tr key={i} className="hover:bg-gray-50/60">
                                <td className={`${tdCls} font-medium`}>{r.name}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.part)}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.labour)}</td>
                                <td className={`${tdCls} text-right font-semibold`}>{inr(r.total)}</td>
                                <td className={`${tdCls} text-right`}>{inr(r.invoices)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                  return (
                    <div>
                      <p className="text-[11px] text-gray-500">
                        As on <b>{fmtFull(p.as_on)}</b>
                        {p.from_date && <> · Period: {fmtDay(p.from_date)} → {fmtDay(p.as_on)}</>}
                        {historyDetail.created_by_name && <> · Generated by <b>{historyDetail.created_by_name}</b></>}
                        {historyDetail.created_at && <> on {new Date(historyDetail.created_at).toLocaleString('en-GB')}</>}
                      </p>
                      {/* Summary tiles */}
                      <div className="mt-2 grid grid-cols-4 max-md:grid-cols-2 gap-2">
                        {[
                          ['Total Spare Sale', '₹ ' + lakh(p.summary?.total_spare_sale)],
                          ['Total Labour Sale', '₹ ' + lakh(p.summary?.total_labour_sale)],
                          ['Overall % Achieved', p.summary?.overall_pct_achieved != null
                            ? p.summary.overall_pct_achieved + ' %' : '—'],
                          ['Total Invoices', inr(p.summary?.total_invoices)],
                        ].map(([label, value]) => (
                          <div key={label} className="border border-gray-200 rounded-lg px-3 py-2">
                            <p className="text-[11px] text-gray-500">{label}</p>
                            <p className="text-base font-bold" style={{ color: themeColor }}>{value}</p>
                          </div>
                        ))}
                      </div>
                      {branchTable(p.spare_rows, 'Spare Part Sales')}
                      {branchTable(p.labour_rows, 'Labour Sales')}
                      {breakdownTable(p.regional, 'Regional-wise Sales', 'Region')}
                      {breakdownTable(p.segment, 'Segment-wise Sales', 'Segment')}
                      {breakdownTable(p.service_head, 'Service Report Type-wise Sales', 'Service Head')}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default SalesLabourReport;
