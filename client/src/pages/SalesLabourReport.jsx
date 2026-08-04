import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { canExportExcel } from '../utils/exportPermission';
import {
  ChartBarSquareIcon, ArrowUpTrayIcon, DocumentMagnifyingGlassIcon,
  ClockIcon, BookmarkSquareIcon, XMarkIcon, TrashIcon, ArrowDownTrayIcon,
  DocumentCheckIcon, TableCellsIcon, ArrowPathIcon, CalendarDaysIcon,
  ChevronDownIcon, MagnifyingGlassIcon,
  ChevronDoubleUpIcon, ChevronDoubleDownIcon,
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
// Day + month + 2-digit year — for the period-picker button ("01 Apr 26")
const fmtDayYr = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
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

// Always-visible top scrollbar for wide tables — a REAL native horizontal
// scrollbar (an empty scroll area whose inner spacer matches the table's
// scrollWidth, kept in sync both ways). Same pattern as Dashboard.jsx.
const TopScrollbar = ({ scrollRef, watch }) => {
  const topRef = useRef(null);
  const [spacerWidth, setSpacerWidth] = useState(0); // 0 = table fits, bar hidden

  useEffect(() => {
    const el = scrollRef.current;
    const top = topRef.current;
    if (!el || !top) return;

    const update = () => {
      const { scrollWidth, clientWidth } = el;
      setSpacerWidth(scrollWidth > clientWidth + 1 ? scrollWidth : 0);
    };
    // Assigning an identical scrollLeft doesn't refire 'scroll',
    // so the two listeners can't ping-pong.
    const fromTable = () => { top.scrollLeft = el.scrollLeft; };
    const fromTop = () => { el.scrollLeft = top.scrollLeft; };

    update();
    el.addEventListener('scroll', fromTable);
    top.addEventListener('scroll', fromTop);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const tableEl = el.querySelector('table');
    if (tableEl) ro.observe(tableEl);
    return () => {
      el.removeEventListener('scroll', fromTable);
      top.removeEventListener('scroll', fromTop);
      ro.disconnect();
    };
  }, [scrollRef, watch]);

  return (
    <div ref={topRef}
      className={`overflow-x-auto overflow-y-hidden ${spacerWidth ? 'block' : 'hidden'}`}>
      <div style={{ width: spacerWidth ? `${spacerWidth}px` : '100%', height: '1px' }} />
    </div>
  );
};

// Wide-table wrapper with synced top + bottom horizontal scrollbars.
const HScrollBox = ({ watch, children }) => {
  const ref = useRef(null);
  return (
    <>
      <TopScrollbar scrollRef={ref} watch={watch} />
      <div className="overflow-x-auto" ref={ref}>{children}</div>
    </>
  );
};

const REPORT_TYPES = [
  { key: 'all', name: 'All (Spare + Labour)' },
  { key: 'spare', name: 'Spare Part Sales' },
  { key: 'labour', name: 'Labour Sales' },
  { key: 'regional', name: 'Regional-wise Sales' },
  { key: 'segment', name: 'Segment-wise Sales' },
  { key: 'service_head', name: 'Service Report Type-wise Sales' },
  // CATEGORY column exists only in the Part Sale file — spare-only report
  { key: 'category', name: 'Category-wise Sales (Spare)' },
];

// Fixed preview column layouts (business-given) — the Uploaded File Preview
// shows columns in the SAME ORDER as the standard PMS Excel files.
// [header shown, canonical field] — field null => value comes from the row's
// extra_data (unmapped file columns), matched case/punctuation-insensitively.
const FILE_LAYOUTS = {
  labour: [
    ['ZONE NAME', 'zone_name'], ['SD ID', 'soid'], ['SD NAME', 'sd_name'],
    ['BRANCH ID', 'branch_id'], ['BRANCH NAME', 'branch_name'],
    ['CLAIM INVOICE NUMBER', 'claim_invoice_no'],
    ['CLAIM INVOICE DATE', 'claim_invoice_date'],
    ['PRODUCT SEGMENT', 'product_segment'], ['SEGMENT', 'segment'],
    ['SERIES', null], ['SR NUMBER', null], ['SR TYPE', 'sr_type'],
    ['SR SUBTYPE', null], ['NET TAXABLE AMOUNT', 'net_taxable_amount'],
  ],
  part: [
    ['ZONE NAME', 'zone_name'], ['SD ID', 'soid'], ['SD NAME', 'sd_name'],
    ['BRANCH ID', 'branch_id'], ['BRANCH NAME', 'branch_name'],
    ['INSTANCE ID', null], ['SEGMENT', 'segment'],
    ['PRODUCT SEGMENT', 'product_segment'], ['APPLICATION CODE', null],
    ['ENGINE SERIAL NO', null], ['CLAIM INVOICE NUMBER', 'claim_invoice_no'],
    ['CLAIM INVOICE DATE', 'claim_invoice_date'],
    ['CLAIM INVOICE SR TYPE', 'sr_type'], ['CLAIM INVOICE SR SUB TYPE', null],
    ['CATEGORY', null], ['PART CATEGORY', null], ['PART NUMBER', null],
    ['PART DESCTRIPTION', null], ['QUANTITY', null],
    ['NET TAXABLE AMOUNT', 'net_taxable_amount'],
  ],
};

// "Sr  Number." === "SR NUMBER" — same skeleton matching the import uses
const tightHeader = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

// Expected file format (shown by "Check file format") — the FULL standard
// column list of each PMS file, straight from FILE_LAYOUTS so panel and
// preview always agree. Critical columns are marked with *; every listed
// column is stored on import (canonical fields + dynamic extra columns).
const EXPECTED_FORMAT = {
  critical: ['BRANCH ID', 'CLAIM INVOICE DATE', 'NET TAXABLE AMOUNT'],
  columns: {
    labour: FILE_LAYOUTS.labour.map(([h]) => h),
    part: FILE_LAYOUTS.part.map(([h]) => h),
  },
};

// ---- frontend-only strict file-format gate ---------------------------------
// The Part Sale and Labour Revenue files have DIFFERENT standard column sets.
// EVERY column of the chosen file type (FILE_LAYOUTS) must be present in the
// Excel's header row — matched on the tight skeleton, so case/spacing/
// punctuation don't matter. The header row is read locally in the browser;
// a wrong or non-standard file is rejected before anything reaches the server.
const FILE_TYPE_NAMES = { part: 'Part Sale (Spares)', labour: 'Labour Revenue' };

// Columns that exist in only ONE of the two files — used to recognise that
// the user picked the other file, so the error says so instead of dumping a
// missing-column list.
const FILE_SIGNATURES = {
  part: ['PARTNUMBER', 'PARTCATEGORY', 'CLAIMINVOICESRTYPE', 'INSTANCEID'],
  labour: ['SRNUMBER', 'SRTYPE', 'SRSUBTYPE', 'SERIES'],
};

// The standard Part Sale file itself carries the "PART DESCTRIPTION" typo —
// accept the correctly-spelled header too.
const HEADER_ALTS = { PARTDESCTRIPTION: ['PARTDESCRIPTION'] };

const readHeaderRow = async (file) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 1 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  return (rows[0] || []).filter((h) => h != null).map((h) => tightHeader(h));
};

const checkFileFormat = async (file, recordType) => {
  let tights;
  try {
    tights = new Set(await readHeaderRow(file));
  } catch {
    return { success: false, message: 'Could not read the Excel file — is it a valid .xlsx / .xls?' };
  }

  const has = (t) => tights.has(t) || (HEADER_ALTS[t] || []).some((a) => tights.has(a));
  const missing = FILE_LAYOUTS[recordType].map(([h]) => h)
    .filter((h) => !has(tightHeader(h)));
  if (!missing.length) return { success: true, message: 'File format OK' };

  const other = recordType === 'part' ? 'labour' : 'part';
  const otherHits = FILE_SIGNATURES[other].filter((s) => tights.has(s)).length;
  const ownHits = FILE_SIGNATURES[recordType].filter((s) => tights.has(s)).length;
  if (otherHits >= 2 && ownHits === 0) {
    return {
      success: false,
      message: `Wrong file: this looks like the ${FILE_TYPE_NAMES[other]} file. Please upload it in the ${FILE_TYPE_NAMES[other]} box.`,
    };
  }
  return {
    success: false,
    message: `Not the standard ${FILE_TYPE_NAMES[recordType]} file — missing columns: ${missing.join(', ')}`,
  };
};

// ---- one upload box (Part Sale / Labour Revenue) ---------------------------
const UploadBox = ({ label, recordType, onUploaded, onCheckFormat }) => {
  const [file, setFile] = useState(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Upload progress %: null = idle; transfer % first, then the server's real
  // import progress (polled from /pms/upload/progress)
  const [progress, setProgress] = useState(null);
  const [stage, setStage] = useState('');
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
    // Real upload goes via XHR so we can show transfer progress (fetch can't);
    // once the file is on the server, /pms/upload/progress is polled for the
    // import's REAL row-by-row progress.
    const postWithProgress = (token) => new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', fileArg);
      fd.append('record_type', recordType);
      fd.append('validate_only', 'false');
      fd.append('progress_token', token);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}/pms/upload`);
      Object.entries(authHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.min(100, Math.round(e.loaded / e.total * 100));
          // Transfer counts as the first 5% of the bar; the import (the real
          // work) takes it from there via polling.
          setProgress(Math.min(5, Math.round(pct / 20)));
          setStage(pct < 100 ? `Uploading file… ${pct}%` : 'File sent — starting import…');
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(data.detail || data.message || 'Request failed'));
          } else resolve(data);
        } catch { reject(new Error('Invalid server response')); }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fd);
    });

    validateOnly ? setChecking(true) : setUploading(true);
    try {
      // Strict format gate — runs fully in the BROWSER: the header row is
      // read locally and every standard column of this file type must be
      // present, so the wrong file (or a non-standard export) is rejected
      // before a single byte is sent to the server.
      const fmt = await checkFileFormat(fileArg, recordType);
      if (!fmt.success) {
        setCheckResult(fmt);
        toast.error(`${label}: ${fmt.message}`);
        return;
      }
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
        setProgress(0);
        setStage('Uploading file…');
        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        // Poll the server's real import progress (5% → 100% of the bar);
        // runs alongside the XHR and stops when the request finishes.
        const poll = setInterval(async () => {
          try {
            const res = await fetch(`${API}/pms/upload/progress?token=${token}`);
            const d = await res.json();
            if (typeof d.pct === 'number' && d.pct > 0) {
              setProgress(Math.max(5, d.pct));
              setStage(d.stage || 'Processing…');
            }
          } catch { /* next tick retries */ }
        }, 400);
        let data;
        try {
          data = await postWithProgress(token);
        } finally {
          clearInterval(poll);
        }
        if (!data.success) throw new Error(data.message);
        setProgress(100);
        setStage('Done');
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
      setProgress(null);
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
          onClick={() => { onCheckFormat?.(recordType); if (file) send(true); }}
          disabled={checking}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
          <DocumentCheckIcon className="h-3 w-3" /> {checking ? 'Checking…' : 'Check file format'}
        </button>
        <button onClick={() => send(false)}
          disabled={uploading || !file || (checkResult && !checkResult.success)}
          title={checkResult && !checkResult.success ? 'Fix the file format first' : undefined}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white rounded hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: themeColor }}>
          <ArrowUpTrayIcon className="h-3 w-3" />
          {uploading ? `${progress ?? 0}%` : 'Upload'}
        </button>
      </div>
      {/* live progress bar — transfer first, then the import's real
          row-by-row progress polled from the server */}
      {uploading && progress != null && (
        <div className="mt-2">
          <div className="flex justify-between gap-2 text-[10px] text-gray-500 mb-0.5">
            <span className="truncate">{stage || 'Working…'}</span>
            <span className="font-semibold flex-shrink-0">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: themeColor }} />
          </div>
        </div>
      )}
      {checkResult && (
        <div className={`mt-2 text-[11px] rounded p-1.5 flex items-start gap-1.5 ${checkResult.success ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          <div className="flex-1">
          {checkResult.message}
          {checkResult.success && (
            <span className="text-gray-500"> — {checkResult.rows} rows × {checkResult.columns} columns</span>
          )}
          {/* Expected columns the file does NOT have — those show as “—” after upload */}
          {checkResult.mapped && (() => {
            const FIELD_LABEL = {
              zone_name: 'ZONE NAME', soid: 'SD ID', sd_name: 'SD NAME',
              branch_id: 'BRANCH ID', branch_name: 'BRANCH NAME',
              claim_invoice_no: 'CLAIM INVOICE NUMBER', claim_invoice_date: 'CLAIM INVOICE DATE',
              product_segment: 'PRODUCT SEGMENT', segment: 'SEGMENT',
              sr_type: recordType === 'part' ? 'CLAIM INVOICE SR TYPE' : 'SR TYPE',
              net_taxable_amount: 'NET TAXABLE AMOUNT',
            };
            const notFound = Object.keys(FIELD_LABEL).filter((f) => !checkResult.mapped[f]);
            return notFound.length > 0 && checkResult.success ? (
              <div className="mt-1 text-amber-700">
                Not found in this file (will show as “—”): {notFound.map((f) => FIELD_LABEL[f]).join(', ')}
              </div>
            ) : null;
          })()}
          </div>
          <button onClick={() => setCheckResult(null)} title="Dismiss"
            className={`p-0.5 rounded flex-shrink-0 ${checkResult.success ? 'hover:bg-green-100' : 'hover:bg-amber-100'}`}>
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
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
  // Cancelled-invoice filter: 'all' | 'active' | 'cancelled' (server-side, so
  // it covers the whole stored dataset, not just loaded rows)
  const [previewCancelFilter, setPreviewCancelFilter] = useState('all');
  const [cancelledTotal, setCancelledTotal] = useState(0);
  const [cancelBusy, setCancelBusy] = useState(null);   // invoice no being toggled
  const previewReqRef = useRef(0);        // drops stale out-of-order responses
  const previewScrollRef = useRef(null);  // preview table scroll container (top scrollbar sync)
  const [batches, setBatches] = useState([]);
  const [showBatches, setShowBatches] = useState(false);

  // report
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  // Multi-select branch filter: [] = all branches
  const [branchSel, setBranchSel] = useState([]);
  const [showBranchPick, setShowBranchPick] = useState(false);
  // 'data' shows the Uploaded File Preview box; 'report' replaces it with the
  // generated report (Back to Data returns).
  const [view, setView] = useState('data');
  // Which file's expected-format panel is open ('part' | 'labour' | null)
  const [formatFor, setFormatFor] = useState(null);
  // Report Setup box collapse (bottom-edge arrow, like the sidebar's).
  // `setupSettled` turns true only after the expand animation finishes so the
  // body keeps overflow-hidden while animating (clean slide) but goes
  // overflow-visible once open (the period-picker popover must not be clipped).
  const [setupOpen, setSetupOpen] = useState(true);
  const [setupSettled, setSetupSettled] = useState(true);
  const toggleSetup = () => { setSetupSettled(false); setSetupOpen((o) => !o); };
  // Report period — applied range (ISO strings) + the range-picker popover
  // (Quick Select presets or a custom calendar range, like the Dashboard's).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);
  // Default = Full Data (the whole uploaded range — auto-generated on load)
  const [activePeriod, setActivePeriod] = useState('full');
  const [pickStart, setPickStart] = useState(null);   // calendar Date objects
  const [pickEnd, setPickEnd] = useState(null);
  // Whether the CURRENT report has been saved to history (drives step ④)
  const [savedHist, setSavedHist] = useState(false);
  // Default = All: Spare + Labour side by side in one compact frame
  const [reportType, setReportType] = useState('all');
  // Region filter for the All view — MH / KA separately, or everything
  const [allRegion, setAllRegion] = useState('All');
  // Financial Year quick-select (Apr..Mar): current FY start year + choices
  const fyNow = (() => { const d = new Date(); return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; })();
  const [quickFy, setQuickFy] = useState(fyNow);
  const fyChoices = [];
  for (let y = fyNow - 5; y <= fyNow + 10; y++) fyChoices.push(y);
  
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
    (previewQuery ? `&search=${encodeURIComponent(previewQuery)}` : '') +
    (previewCancelFilter !== 'all' ? `&cancelled=${previewCancelFilter}` : ''),
  [previewQuery, previewCancelFilter]);

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
        setCancelledTotal(data.cancelled_total || 0);
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

  // Cancel / restore ONE row (not the whole invoice — a Part Sale invoice's
  // other part lines are untouched). The row STAYS in the database, marked
  // Cancelled, and reports simply skip it. Scoped to the current file type,
  // so cancelling in Part Sale never affects Labour data and vice versa.
  const toggleRowCancel = async (row) => {
    const cancel = !row.is_cancelled;
    const typeName = previewType === 'part' ? 'Part Sale' : 'Labour';
    const inv = row.claim_invoice_no ? `invoice ${row.claim_invoice_no}` : 'this row';
    if (!window.confirm(cancel
      ? `Cancel this ${typeName} row (${inv})? Only THIS row stays stored but will NOT be counted in any report — other rows of the invoice are not affected.`
      : `Restore this ${typeName} row (${inv})? It will be counted in reports again.`)) return;
    setCancelBusy(row.id);
    try {
      const res = await fetch(`${API}/pms/data/cancel-row`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ record_type: previewType, row_id: row.id, cancelled: cancel }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Request failed');
      toast.success(`Row of ${inv} ${cancel ? 'cancelled' : 'restored'}`);
      setReport(null);            // any generated report is stale now
      loadPreview(previewType);   // refresh so marks, filter and counts stay right
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCancelBusy(null);
    }
  };

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

  // Default period once data arrives: the FULL uploaded range, and the report
  // is auto-generated once so the page opens on the all-data report (the
  // Uploaded File Preview stays available via "Back to Data").
  const autoGenRef = useRef(false);
  useEffect(() => {
    if (!dataRange.max) return;
    const f = dataRange.min || dataRange.max;
    setFromDate((cur) => cur || f);
    setToDate((cur) => cur || dataRange.max);
    // pre-select the full range in the calendar so Apply works immediately
    setPickStart((cur) => cur || new Date(f + 'T00:00:00'));
    setPickEnd((cur) => cur || new Date(dataRange.max + 'T00:00:00'));
    if (!autoGenRef.current) {
      autoGenRef.current = true;
      // Each file is measured as on ITS OWN last data date (spares and labour
      // extracts usually end on different days).
      generate(f, dataRange.max, {
        quiet: true,
        partAsOn: summary?.part?.rows > 0 ? summary.part.to_date : undefined,
        labourAsOn: summary?.labour?.rows > 0 ? summary.labour.to_date : undefined,
      });
    }
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
    { key: 'fy', label: 'Financial Year' },
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
    if (key === 'fy') { applyFy(quickFy); return; }
    const max = dataRange.max;
    const d = new Date(max + 'T00:00:00');
    let from = max.slice(0, 8) + '01', to = max;
    if (key === 'last_month') {
      const s = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      from = isoOf(s);
      to = isoOf(new Date(d.getFullYear(), d.getMonth(), 0)); // last day of prev month
    } else if (key === 'last_quarter') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1));
    else if (key === 'last_6m') from = isoOf(new Date(d.getFullYear(), d.getMonth() - 6, d.getDate() + 1));
    else if (key === 'full') from = dataRange.min || max;
    const [f, t] = clampToData(from, to);
    setFromDate(f);
    setToDate(t);
    setActivePeriod(key);
    setShowRangePicker(false);
  };

  // Financial Year preset (Apr..Mar) — the dropdown next to it lists the
  // last 5 and next 10 FYs; picking one applies Apr 1 → Mar 31 (clamped to
  // the uploaded data range).
  const applyFy = (y) => {
    if (!dataRange.max) return;
    setQuickFy(y);
    const [f, t] = clampToData(`${y}-04-01`, `${y + 1}-03-31`);
    setFromDate(f);
    setToDate(t);
    setActivePeriod('fy');
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

  // Preview columns in the standard PMS file order (FILE_LAYOUTS per type).
  // Canonical fields read the stored columns; the rest read extra_data —
  // resolved against the actual keys present in the rows so header spelling
  // differences ("Sr Number" vs "SR NUMBER") still line up. Any extra column
  // in the data that the layout doesn't know is appended at the end so
  // nothing from the file is hidden.
  const previewCols = useMemo(() => {
    const extraKeys = [];          // actual keys, first-seen order
    const byTight = {};            // skeleton -> actual key
    previewRows.forEach((r) => {
      Object.keys(r.extra || {}).forEach((k) => {
        const t = tightHeader(k);
        if (!(t in byTight)) { byTight[t] = k; extraKeys.push(k); }
      });
    });

    const layout = FILE_LAYOUTS[previewType] || [];
    const cols = layout.map(([header, field]) => (
      field
        ? { key: field, label: header, extra: false }
        : { key: byTight[tightHeader(header)] ?? header, label: header, extra: true }
    ));
    const used = new Set(cols.filter((c) => c.extra).map((c) => c.key));
    extraKeys.forEach((k) => {
      if (!used.has(k)) cols.push({ key: k, label: k, extra: true });
    });
    return cols;
  }, [previewRows, previewType]);

  // fromArg/toArg override the state dates (used by the on-load auto-generate,
  // which fires before setFromDate/setToDate have committed); quiet skips the
  // success toast so page load stays silent. partAsOn/labourAsOn give each
  // file its own period end (default all-data report: spares measured as on
  // the spares data's last date, labour as on the labour data's last date);
  // a user-chosen period omits them so both use the same date.
  const generate = async (fromArg, toArg, { quiet = false, partAsOn, labourAsOn } = {}) => {
    if (!dataRange.max) { if (!quiet) toast.error('Upload data first'); return; }
    const to = toArg || toDate || dataRange.max;
    const from = fromArg || fromDate || dataRange.min || to.slice(0, 8) + '01';
    setGenerating(true);
    try {
      let url = `${API}/pms/report?as_on=${to}&from_date=${from}`;
      if (partAsOn) url += `&part_as_on=${partAsOn}`;
      if (labourAsOn) url += `&labour_as_on=${labourAsOn}`;
      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Report failed');
      setReport(data);
      setView('report');
      setSavedHist(false);
      setBranchSel([]);
      if (!data.spare_rows.length && !data.labour_rows.length) {
        toast('No data / targets found for ' + data.month, { icon: 'ℹ️' });
      } else if (!quiet) {
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
  // Selected branches present in the current rows; [] = all
  const selBranches = branchSel.filter((id) => regionRows.some((r) => r.branch_id === id));
  const branchRows = selBranches.length
    ? regionRows.filter((r) => selBranches.includes(r.branch_id))
    : regionRows;
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
  // Category-wise (Spare only — the Labour file has no CATEGORY column)
  const categoryRows = report && reportType === 'category' ? (report.category || []) : null;

  // Required daily run-rate (summary tile): per type, the remaining balance
  // for the period ÷ remaining working days (working days derived from the
  // AOP daily targets: total = target/daily, elapsed = target_till/daily),
  // summed over spares + labour. Current run-rate shown alongside.
  const runRate = report ? (() => {
    let req = 0, cur = 0, any = false;
    [report.spare_rows, report.labour_rows].forEach((rows) => {
      const mt = (rows || []).reduce((s, r) => s + (r.monthly_target || 0), 0);
      const dt = (rows || []).reduce((s, r) => s + (r.daily_target || 0), 0);
      const tt = (rows || []).reduce((s, r) => s + (r.target_till || 0), 0);
      const at = (rows || []).reduce((s, r) => s + (r.achieved_till || 0), 0);
      if (!dt || !mt) return;
      any = true;
      const totalWd = mt / dt;
      const elapsedWd = Math.min(totalWd, tt / dt);
      const remainingWd = Math.max(0, totalWd - elapsedWd);
      if (remainingWd > 0) req += Math.max(0, mt - at) / remainingWd;
      if (elapsedWd > 0) cur += at / elapsedWd;
    });
    return any ? { req, cur } : null;
  })() : null;

  // "All" view — Spare and Labour side by side in one frame, like the
  // business's Excel result sheet. Values in Lakh to stay compact; region
  // blocks (MH, KA) with subtotals + grand total. Person shown on hover.
  // Compact cells for the individual report tables (same feel as the All view)
  const thT = 'px-1.5 py-1 text-center text-[11px] font-semibold text-gray-600 leading-tight bg-gray-50 border border-gray-200';
  const tdT = 'px-1.5 py-1 whitespace-nowrap border border-gray-200';
  // Money in Lakh for the individual Spare/Labour tables (23 = ₹23,00,000)
  const lkh = (v) => (v == null ? '—' : (Number(v) / 100000).toFixed(2));
  // % Achieved cells — Excel-style block fill: 100 %+ green · 80–99 % yellow ·
  // below 80 % amber. CSS classes (not inline colors) so the dark theme can
  // restyle them — the class definitions live in the injected <style> below.
  const pctCellCls = (p) => (p == null ? '' : p >= 100 ? 'pms-pct-good' : p >= 80 ? 'pms-pct-mid' : 'pms-pct-low');

  const renderAllSide = (title, allRows, dl) => {
    const lk = (v) => (v == null ? '—' : (Number(v) / 100000).toFixed(2));
    // Region dropdown: show MH / KA separately (no long scroll) or everything
    const rows = allRegion === 'All' ? (allRows || [])
      : (allRows || []).filter((r) => r.region === allRegion);
    const byRegion = {};
    rows.forEach((r) => { (byRegion[r.region] = byRegion[r.region] || []).push(r); });
    const regionKeys = ['MH', 'KA'].filter((k) => byRegion[k])
      .concat(Object.keys(byRegion).filter((k) => k !== 'MH' && k !== 'KA'));
    const sum = (rs) => rs.reduce((a, r) => ({
      monthly_target: a.monthly_target + (r.monthly_target || 0),
      daily_target: a.daily_target + (r.daily_target || 0),
      achieved_on: a.achieved_on + (r.achieved_on || 0),
      target_till: a.target_till + (r.target_till || 0),
      achieved_till: a.achieved_till + (r.achieved_till || 0),
      invoice_count_till: a.invoice_count_till + (r.invoice_count_till || 0),
      short_fall_till: a.short_fall_till + (r.short_fall_till || 0),
      balance_month: a.balance_month + (r.balance_month || 0),
    }), { monthly_target: 0, daily_target: 0, achieved_on: 0, target_till: 0, achieved_till: 0, invoice_count_till: 0, short_fall_till: 0, balance_month: 0 });
    // Header cells wrap to two lines so proper titles fit narrow columns
    const thA = 'px-1 py-1 text-center text-[11px] font-semibold text-gray-600 leading-tight bg-gray-50 border border-gray-200';
    const tdA = 'px-1 py-0.5 whitespace-nowrap border border-gray-200 text-right';
    const metricCells = (s) => {
      const pct = s.target_till ? +(s.achieved_till / s.target_till * 100).toFixed(1) : null;
      return (
        <>
          <td className={tdA}>{lk(s.monthly_target)}</td>
          <td className={tdA}>{lk(s.daily_target)}</td>
          <td className={tdA}>{lk(s.achieved_on)}</td>
          <td className={tdA}>{lk(s.target_till)}</td>
          <td className={`${tdA} font-medium`}>{lk(s.achieved_till)}</td>
          <td className={tdA}>{inr(s.invoice_count_till)}</td>
          <td className={`${tdA} font-semibold ${pctCellCls(pct)}`}>
            {pct == null ? '—' : pct + ' %'}
          </td>
          <td className={tdA}>
            {lk(s.short_fall_till)}
          </td>
          <td className={tdA}>{lk(s.balance_month)}</td>
        </>
      );
    };
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden self-start">
        <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
          style={{ backgroundColor: themeColor }}>
          <span>{title}</span>
          <span className="font-medium text-white/80">As on {dl} · Lakh ₹</span>
        </div>
        <HScrollBox watch={`${title}-${allRegion}-${rows.length}`}>
          <table className="w-full text-[11px] border-collapse min-w-[600px]">
            <tbody>
              {(rows || []).length === 0 ? (
                <tr><td colSpan={11} className="text-center py-4 text-gray-500 border border-gray-200">No rows</td></tr>
              ) : (
                <>
                  {regionKeys.map((reg) => {
                    const rs = byRegion[reg];
                    const sub = sum(rs);
                    return (
                      <React.Fragment key={reg}>
                        {/* region band first, then that block's column names —
                            like the Excel sheet */}
                        <tr>
                          <td colSpan={11}
                            className="px-1 py-1 text-center font-bold border border-gray-200 pms-region-band">
                            {reg === 'MH' ? 'Maharashtra (MH)' : reg === 'KA' ? 'Karnataka (KA)' : reg}
                          </td>
                        </tr>
                        <tr>
                          <th className={thA}>Responsible Person</th>
                          <th className={thA}>Branch</th>
                          <th className={thA}>Monthly Target</th>
                          <th className={thA}>Daily Target</th>
                          <th className={thA}>Achi. On {dl}</th>
                          <th className={thA}>Target Till {dl}</th>
                          <th className={thA}>Achi. Till {dl}</th>
                          <th className={thA}>Invoice Count</th>
                          <th className={thA}>% Achieved Till Date</th>
                          <th className={thA}>Short-Fall Till Date</th>
                          <th className={thA}>Balance For Month</th>
                        </tr>
                        {rs.map((r) => (
                          <tr key={r.branch_id} className="hover:bg-gray-50/60">
                            <td className="px-1 py-1 border border-gray-200 text-left whitespace-nowrap overflow-hidden text-ellipsis max-w-[70px]"
                              title={r.responsible_person || ''}>
                              {r.responsible_person || '—'}
                            </td>
                            <td className="px-1 py-1 border border-gray-200 text-left leading-tight break-words max-w-[80px] font-medium"
                              title={r.branch_id}>
                              {r.branch_name}
                            </td>
                            {metricCells(r)}
                          </tr>
                        ))}
                        <tr className="font-semibold pms-subtotal-row">
                          <td className={`${tdA} text-left`} colSpan={2}>
                            {reg === 'MH' ? 'Maharashtra Total' : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`}
                          </td>
                          {metricCells(sub)}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {allRegion === 'All' && (
                    <tr className="bg-gray-50 font-bold">
                      <td className={`${tdA} text-left`} colSpan={2}>Total</td>
                      {metricCells(sum(rows || []))}
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </HScrollBox>
      </div>
    );
  };

  // Column labels follow the displayed table's own as-on date: the spare and
  // labour tables can have different period ends in the default all-data
  // report (each file measured as on its own last data date).
  const typeAsOn = !report ? null
    : reportType === 'spare' ? (report.as_on_part || report.as_on)
    : reportType === 'labour' ? (report.as_on_labour || report.as_on)
    : report.as_on;
  const dayLabel = report ? fmtDay(typeAsOn) : '';
  const splitAsOn = report?.as_on_part && report?.as_on_labour
    && report.as_on_part !== report.as_on_labour;
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
        ['Spare % Achieved (vs AOP)', s.total_spare_target
          ? +(s.total_spare_sale / s.total_spare_target * 100).toFixed(1) + ' %' : '—'],
        ['Total Labour Sale (₹)', s.total_labour_sale],
        ['Labour % Achieved (vs AOP)', s.total_labour_target
          ? +(s.total_labour_sale / s.total_labour_target * 100).toFixed(1) + ' %' : '—'],
        ['Overall % Achieved', s.overall_pct_achieved != null ? s.overall_pct_achieved + ' %' : '—'],
        ['Total Invoices', s.total_invoices],
        [],
      ];

      // "All" view — one workbook, Spare + Labour as separate sheets
      if (reportType === 'all') {
        const wb = XLSX.utils.book_new();
        const mkSheet = (rws, dl) => {
          const hdr = ['Region', 'Branch', 'Responsible Person', 'Monthly Target', 'Daily Target',
            `Achi. On ${dl}`, `Target Till ${dl}`, `Achi. Till ${dl}`, `Invoice Count Till ${dl}`,
            '% Achieved Till Date', 'Short-Fall Till Date', 'Balance For Month'];
          const data = (rws || []).map((r) => [r.region, r.branch_name, r.responsible_person,
            r.monthly_target, r.daily_target, r.achieved_on, r.target_till, r.achieved_till,
            r.invoice_count_till, r.pct_achieved, r.short_fall_till, r.balance_month]);
          const ws = XLSX.utils.aoa_to_sheet([...info, hdr, ...data]);
          ws['!cols'] = hdr.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
          return ws;
        };
        XLSX.utils.book_append_sheet(wb, mkSheet(report.spare_rows, fmtDay(report.as_on_part || report.as_on)), 'Spare');
        XLSX.utils.book_append_sheet(wb, mkSheet(report.labour_rows, fmtDay(report.as_on_labour || report.as_on)), 'Labour');
        const mkBreak = (label, rws) => {
          const tot = (rws || []).reduce((a, r) => ({
            part: a.part + (r.part || 0), labour: a.labour + (r.labour || 0),
            total: a.total + (r.total || 0), invoices: a.invoices + (r.invoices || 0),
          }), { part: 0, labour: 0, total: 0, invoices: 0 });
          const pc = (v, t) => (t ? +(v / t * 100).toFixed(1) : null);
          const hdr = [label, 'Spare Sale', '% Spare', 'Labour Sale', '% Labour',
            'Total', '% Total', 'Invoices', '% Invoices'];
          const data = (rws || []).map((r) => [r.name,
            r.part, pc(r.part, tot.part), r.labour, pc(r.labour, tot.labour),
            r.total, pc(r.total, tot.total), r.invoices, pc(r.invoices, tot.invoices)]);
          data.push(['Total', tot.part, 100, tot.labour, 100, tot.total, 100, tot.invoices, 100]);
          const ws = XLSX.utils.aoa_to_sheet([...info, hdr, ...data]);
          ws['!cols'] = hdr.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
          return ws;
        };
        XLSX.utils.book_append_sheet(wb, mkBreak('Region', report.regional), 'Regional');
        XLSX.utils.book_append_sheet(wb, mkBreak('Segment', report.segment), 'Segment');
        XLSX.utils.book_append_sheet(wb, mkBreak('Service Head', report.service_head), 'Service Head');
        {
          // Category — Spare only (the Labour file has no CATEGORY column)
          const cr = report.category || [];
          const ct = cr.reduce((a, r) => ({
            part: a.part + (r.part || 0), invoices: a.invoices + (r.invoices || 0),
            qty: a.qty + (r.qty || 0), lines: a.lines + (r.lines || 0),
          }), { part: 0, invoices: 0, qty: 0, lines: 0 });
          const pc = (v, t) => (t ? +(v / t * 100).toFixed(1) : null);
          const hdr = ['Category', 'Spare Sale', '% Spare', 'Quantity', 'Line Items',
            'Invoices', '% Invoices', 'Avg / Invoice'];
          const data = cr.map((r) => [r.name, r.part, pc(r.part, ct.part),
            Math.round(r.qty || 0), r.lines, r.invoices, pc(r.invoices, ct.invoices),
            r.invoices ? +(r.part / r.invoices).toFixed(2) : null]);
          data.push(['Total', ct.part, 100, Math.round(ct.qty), ct.lines, ct.invoices, 100,
            ct.invoices ? +(ct.part / ct.invoices).toFixed(2) : null]);
          const ws = XLSX.utils.aoa_to_sheet([...info, hdr, ...data]);
          ws['!cols'] = hdr.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
          XLSX.utils.book_append_sheet(wb, ws, 'Category');
        }
        XLSX.writeFile(wb, `PMS_All_${report.as_on}.xlsx`);
        toast.success('Report exported');
        return;
      }

      let header, rows;
      if (categoryRows) {
        // Category-wise — Spare only
        const ct = categoryRows.reduce((a, r) => ({
          part: a.part + (r.part || 0), invoices: a.invoices + (r.invoices || 0),
          qty: a.qty + (r.qty || 0), lines: a.lines + (r.lines || 0),
        }), { part: 0, invoices: 0, qty: 0, lines: 0 });
        const pc = (v, t) => (t ? +(v / t * 100).toFixed(1) : null);
        header = ['Category', 'Spare Sale', '% Spare', 'Quantity', 'Line Items',
          'Invoices', '% Invoices', 'Avg / Invoice'];
        rows = categoryRows.map((r) => [r.name, r.part, pc(r.part, ct.part),
          Math.round(r.qty || 0), r.lines, r.invoices, pc(r.invoices, ct.invoices),
          r.invoices ? +(r.part / r.invoices).toFixed(2) : null]);
        rows.push(['Total', ct.part, 100, Math.round(ct.qty), ct.lines, ct.invoices, 100,
          ct.invoices ? +(ct.part / ct.invoices).toFixed(2) : null]);
      } else if (breakdownRows) {
        const label = reportType === 'regional' ? 'Region'
          : reportType === 'segment' ? 'Segment' : 'Service Head';
        const bt = breakdownRows.reduce((a, r) => ({
          part: a.part + (r.part || 0), labour: a.labour + (r.labour || 0),
          total: a.total + (r.total || 0), invoices: a.invoices + (r.invoices || 0),
        }), { part: 0, labour: 0, total: 0, invoices: 0 });
        const pc = (v, t) => (t ? +(v / t * 100).toFixed(1) : null);
        header = [label, 'Spare Sale', '% Spare', 'Labour Sale', '% Labour',
          'Total', '% Total', 'Invoices', '% Invoices'];
        rows = breakdownRows.map((r) => [r.name,
          r.part, pc(r.part, bt.part), r.labour, pc(r.labour, bt.labour),
          r.total, pc(r.total, bt.total), r.invoices, pc(r.invoices, bt.invoices)]);
        rows.push(['Total', bt.part, 100, bt.labour, 100, bt.total, 100, bt.invoices, 100]);
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
          rows.push([
            reg === 'MH' ? 'Maharashtra Total' : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`,
            '', '', s.mt, s.dt, s.ao, s.tt, s.at, s.ic,
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
      /* Dark theme — the hardcoded light colors above would otherwise win */
      html.dark .custom-calendar .react-datepicker__day--selected,
      html.dark .custom-calendar .react-datepicker__day--range-start,
      html.dark .custom-calendar .react-datepicker__day--range-end { background-color: #0369a1 !important; color: white !important; }
      html.dark .custom-calendar .react-datepicker__day--in-range,
      html.dark .custom-calendar .react-datepicker__day--in-selecting-range { background-color: rgba(56,189,248,0.18); color: #e6e9ef; }
      /* Report accent colors — light theme (Excel look) */
      .pms-accent { color: ${themeColor}; }
      .pms-region-band { background-color: rgba(47,49,146,0.12); color: ${themeColor}; }
      .pms-region-cell { background-color: rgba(47,49,146,0.04); color: ${themeColor}; }
      .pms-subtotal-row { background-color: rgba(47,49,146,0.08); }
      .pms-pct-good { background-color: #86efac; color: #111827; }
      .pms-pct-mid { background-color: #fde047; color: #111827; }
      .pms-pct-low { background-color: #fdba74; color: #111827; }
      .pms-behind { color: #92400e; }
      .pms-ahead { color: #15803d; }
      .pms-mid { color: #a16207; }
      /* Report accent colors — dark theme: muted fills, bright readable text */
      html.dark .pms-accent { color: #38bdf8; }
      html.dark .pms-region-band { background-color: rgba(56,189,248,0.14); color: #7dd3fc; }
      html.dark .pms-region-cell { background-color: rgba(56,189,248,0.07); color: #7dd3fc; }
      html.dark .pms-subtotal-row { background-color: rgba(56,189,248,0.10); }
      html.dark .pms-pct-good { background-color: rgba(34,197,94,0.30); color: #86efac; }
      html.dark .pms-pct-mid { background-color: rgba(234,179,8,0.28); color: #fde047; }
      html.dark .pms-pct-low { background-color: rgba(249,115,22,0.28); color: #fdba74; }
      html.dark .pms-behind { color: #fbbf24; }
      html.dark .pms-ahead { color: #4ade80; }
      html.dark .pms-mid { color: #facc15; }
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90 pms-accent">
              <ClockIcon className="h-3.5 w-3.5" /> History
            </button>
          </div>
        </div>
      </div>

      {/* ============ ① Report Setup ============ */}
      <div className="pms-no-print relative bg-white rounded-2xl border border-gray-200 mb-3">
        <div className={`px-4 py-2.5 flex flex-wrap items-center gap-2 ${setupOpen ? 'border-b border-gray-100' : ''}`}>
          <ArrowUpTrayIcon className="h-4 w-4 pms-accent" />
          <h2 className="text-sm font-semibold text-gray-900">Report Setup</h2>
          {/* Steps — plain text only */}
          <span className="ml-auto text-right text-[11px] font-bold text-gray-700">
            ① Upload files → ② Preview data → ③ Generate report → ④ Save
          </span>
        </div>
        {/* Collapsible body — always mounted; grid-rows animate 1fr↔0fr so
            both opening and closing glide (same trick as the sidebar
            submenus). Overflow goes visible only once fully open so the
            period-picker popover can escape the box. */}
        <div className="grid transition-[grid-template-rows] duration-300 ease-in-out"
          style={{ gridTemplateRows: setupOpen ? '1fr' : '0fr' }}
          onTransitionEnd={() => { if (setupOpen) setSetupSettled(true); }}>
        <div className={`min-h-0 ${setupOpen && setupSettled ? 'overflow-visible' : 'overflow-hidden'}`}>
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
                  {fromDate && toDate ? `${fmtDayYr(fromDate)} → ${fmtDayYr(toDate)}` : 'Select period'}
                </span>
                <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showRangePicker ? 'rotate-180' : ''}`} />
              </button>
              <button onClick={() => generate()} disabled={generating || !dataRange.max}
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
                              <React.Fragment key={o.key}>
                                <button onClick={() => applyQuick(o.key)}
                                  className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${
                                    activePeriod === o.key
                                      ? 'text-white'
                                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'}`}
                                  style={activePeriod === o.key ? { backgroundColor: themeColor } : {}}>
                                  {o.label}
                                </button>
                                {o.key === 'fy' && (
                                  <select value={quickFy}
                                    onChange={(e) => applyFy(parseInt(e.target.value, 10))}
                                    className="w-full px-2 py-1 rounded-lg text-xs text-black bg-white border border-gray-200 focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': themeColor }}>
                                    {fyChoices.map((y) => (
                                      <option key={y} value={y}>FY {y}–{String(y + 1).slice(2)}</option>
                                    ))}
                                  </select>
                                )}
                              </React.Fragment>
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
                    Expected File Format for: {formatFor === 'part' ? 'Part Sale file' : 'Labour Revenue file'}
                  </span>
                </div>
                <button onClick={() => setFormatFor(null)} className="p-0.5 rounded hover:bg-sky-100">
                  <XMarkIcon className="h-3.5 w-3.5 text-sky-700" />
                </button>
              </div>
              <div className="p-3 bg-white">
                <p className="text-xs font-bold text-gray-800 mb-2">
                  Columns in this file: {EXPECTED_FORMAT.columns[formatFor].length}
                </p>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 p-2">
                  {EXPECTED_FORMAT.columns[formatFor].map((c) => (
                    <span key={c}
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-mono font-semibold tracking-wide border bg-amber-50 border-amber-300 text-amber-900">
                      {c}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-sky-800">
                  Column names can be spelled in any case, spacing or punctuation
                  (e.g. “branch id.” is accepted). <b>Every column above is mandatory</b> —
                  the file is checked before upload and rejected if any column is
                  missing, so the Part Sale and Labour files cannot be uploaded in the
                  wrong box. Any extra columns in the file are imported automatically
                  as dynamic columns.
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
        </div>

        {/* Collapse / expand arrow on the bottom edge (same style as the
            sidebar's edge arrow) */}
        <button onClick={toggleSetup}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 p-1 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition-all bg-white shadow-md border border-gray-200 z-30"
          aria-label={setupOpen ? 'Collapse report setup' : 'Expand report setup'}>
          {setupOpen
            ? <ChevronDoubleUpIcon className="h-3 w-3" />
            : <ChevronDoubleDownIcon className="h-3 w-3" />}
        </button>
      </div>

      {/* ============ ② Uploaded data preview (hidden while viewing report) ============ */}
      {view === 'data' && (
      <div className="pms-no-print bg-white rounded-2xl border border-gray-200 mb-3 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <TableCellsIcon className="h-4 w-4 pms-accent" />
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
          {/* Cancelled-invoice filter — server-side over the whole dataset */}
          <div className="flex rounded-md border border-gray-300 overflow-hidden">
            {[['all', 'All'], ['active', 'Active'],
              ['cancelled', `Cancelled${cancelledTotal ? ` (${inr(cancelledTotal)})` : ''}`]].map(([k, n]) => (
              <button key={k} onClick={() => setPreviewCancelFilter(k)}
                className={`px-2 py-1 text-[11px] font-medium ${previewCancelFilter === k
                  ? (k === 'cancelled' ? 'bg-amber-500 text-white' : 'text-white')
                  : (k === 'cancelled' && cancelledTotal ? 'text-amber-700 hover:bg-amber-50' : 'text-gray-600 hover:bg-gray-50')}`}
                style={previewCancelFilter === k && k !== 'cancelled' ? { backgroundColor: themeColor } : {}}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={() => loadPreview(previewType)} title="Refresh"
            className="p-1 rounded border border-gray-300 text-gray-500 hover:bg-gray-50">
            <ArrowPathIcon className="h-3.5 w-3.5" />
          </button>
          {dataRange.max && (
            <button onClick={() => (report ? setView('report') : generate())}
              disabled={generating}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: themeColor }}>
              {generating ? 'Generating…' : 'Go to Report →'}
            </button>
          )}
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
                : previewCancelFilter === 'cancelled'
                ? <>No cancelled invoices in {previewType === 'part' ? 'Part Sale' : 'Labour'} data</>
                : <>No {previewType === 'part' ? 'Part Sale' : 'Labour'} data added yet</>}
            </p>
          </div>
        ) : (
          <>
          <TopScrollbar scrollRef={previewScrollRef}
            watch={`${previewType}-${previewRows.length}-${previewCols.length}`} />
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto" ref={previewScrollRef} onScroll={onPreviewScroll}>
            <table className="w-full text-[11px] border-collapse min-w-[1050px]">
              <thead className="sticky top-0"><tr>
                {previewCols.map((c) => (
                  <th key={`${c.extra ? 'x-' : ''}${c.key}`} className={thCls}>{c.label}</th>
                ))}
                <th className={thCls}>Action</th>
              </tr></thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className={r.is_cancelled ? 'bg-rose-50/50' : 'hover:bg-gray-50/60'}>
                    {previewCols.map((c) => {
                      const v = c.extra ? r.extra?.[c.key] : r[c.key];
                      return (
                        <td key={`${c.extra ? 'x-' : ''}${c.key}`}
                          className={`${tdCls} ${c.key === 'net_taxable_amount' ? 'text-right font-medium' : ''} ${r.is_cancelled ? 'line-through text-gray-400' : ''}`}>
                          {c.extra ? (v ?? '—')
                            : c.key === 'net_taxable_amount' ? inr(v)
                            : c.key === 'claim_invoice_no' ? highlightMatch(v, previewQuery)
                            : (v ?? '—')}
                        </td>
                      );
                    })}
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {r.is_cancelled ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            title={`Cancelled${r.cancelled_by ? ` by ${r.cancelled_by}` : ''}${r.cancelled_at ? ` on ${r.cancelled_at.slice(0, 10)}` : ''} — not counted in reports`}
                            className="inline-flex px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-semibold">
                            Cancelled
                          </span>
                          <button onClick={() => toggleRowCancel(r)}
                            disabled={cancelBusy === r.id}
                            className="text-[10px] font-medium text-sky-700 hover:underline disabled:opacity-40">
                            Restore
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => toggleRowCancel(r)}
                          disabled={cancelBusy === r.id}
                          title="Cancel ONLY this row — kept in the database but excluded from reports"
                          className="text-[10px] font-medium text-amber-800 border border-amber-300 bg-amber-50 rounded px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-40">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {previewRows.length < previewTotal && (
                  <tr><td colSpan={previewCols.length + 1} className="text-center py-2 text-[11px] text-gray-400 border border-gray-200">
                    Scroll for more… ({inr(previewTotal - previewRows.length)} remaining)
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
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
            <DocumentMagnifyingGlassIcon className="h-4 w-4 pms-no-print pms-accent" />
            <h2 className="text-sm font-semibold text-gray-900">
              Generated Report : As on {fmtFull(report.as_on)}
              {report.from_date && (
                <span className="ml-2 text-[11px] font-medium text-gray-500">
                  (Period: {fmtDay(report.from_date)} → {fmtDay(report.as_on)})
                </span>
              )}
              {splitAsOn && (
                <span className="ml-2 text-[11px] font-medium text-gray-500">
                  Spares as on <b>{fmtDay(report.as_on_part)}</b> · Labour as on <b>{fmtDay(report.as_on_labour)}</b>
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

          {/* Summary tiles — Spare / Labour % vs the AOP Master target get
              their own boxes */}
          <div className="p-2 grid grid-cols-7 max-xl:grid-cols-4 max-md:grid-cols-2 gap-1.5">
            {[
              ['Total Spare Sale', '₹ ' + lakh(report.summary.total_spare_sale),
                report.summary.total_spare_target
                  ? `target ₹ ${lakh(report.summary.total_spare_target)}` : null],
              ['Spare % vs AOP Target', report.summary.total_spare_target
                ? (report.summary.total_spare_sale / report.summary.total_spare_target * 100).toFixed(1) + ' %'
                : '— (no target)', null],
              ['Total Labour Sale', '₹ ' + lakh(report.summary.total_labour_sale),
                report.summary.total_labour_target
                  ? `target ₹ ${lakh(report.summary.total_labour_target)}` : null],
              ['Labour % vs AOP Target', report.summary.total_labour_target
                ? (report.summary.total_labour_sale / report.summary.total_labour_target * 100).toFixed(1) + ' %'
                : '— (no target)', null],
              ['Overall % Achieved', report.summary.overall_pct_achieved != null
                ? report.summary.overall_pct_achieved + ' %' : '— (no targets)', null],
              ['Total Invoices', inr(report.summary.total_invoices), null],
              ['Required Daily Run-Rate', runRate ? '₹ ' + lakh(runRate.req) + ' /day' : '—',
                runRate ? `current ₹ ${lakh(runRate.cur)} /day` : null],
            ].map(([label, value, sub]) => (
              <div key={label} className="border border-gray-200 rounded-lg px-2 py-2">
                <p className="text-[11px] text-gray-500 leading-tight whitespace-nowrap">{label}</p>
                <p className="text-lg font-bold leading-snug pms-accent">{value}</p>
                {sub && <p className="text-[10px] text-gray-500 leading-tight">{sub}</p>}
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
            {reportType === 'all' && (
              <div className="flex flex-col ml-auto">
                <label className="text-[10px] font-medium text-gray-500 mb-0.5">Region</label>
                <select value={allRegion} onChange={(e) => setAllRegion(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-1 min-w-[160px]"
                  style={{ '--tw-ring-color': themeColor }}>
                  <option value="All">All Regions</option>
                  <option value="MH">MH — Maharashtra</option>
                  <option value="KA">KA — Karnataka</option>
                </select>
              </div>
            )}
            {!breakdownRows && !categoryRows && reportType !== 'all' && (
              // Opens on hover, closes when the mouse leaves (click still toggles)
              <div className="flex flex-col ml-auto relative"
                onMouseEnter={() => setShowBranchPick(true)}
                onMouseLeave={() => setShowBranchPick(false)}>
                <label className="text-[10px] font-medium text-gray-500 mb-0.5">Branch (multi-select)</label>
                <button onClick={() => setShowBranchPick(!showBranchPick)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none min-w-[180px] flex items-center justify-between gap-1">
                  <span className="truncate">
                    {selBranches.length === 0 ? 'All Branches'
                      : selBranches.length === 1
                        ? (branchOptions.find((b) => b.id === selBranches[0])?.name || '1 branch')
                        : `${selBranches.length} branches selected`}
                  </span>
                  <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showBranchPick ? 'rotate-180' : ''}`} />
                </button>
                {showBranchPick && (
                  <>
                    {/* pt-1 (not a margin) keeps the hover unbroken across the gap */}
                    <div className="absolute right-0 top-full z-50 pt-1 w-60 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl p-1.5">
                      <button onClick={() => setBranchSel([])}
                        className={`w-full text-left px-2 py-1 text-xs font-semibold rounded hover:bg-gray-100 ${branchSel.length === 0 ? 'text-white' : 'text-gray-700'}`}
                        style={branchSel.length === 0 ? { backgroundColor: themeColor } : {}}>
                        All Branches (no filter)
                      </button>
                      <button onClick={() => setBranchSel(branchOptions.map((b) => b.id))}
                        className="w-full text-left px-2 py-1 text-xs font-semibold text-gray-700 rounded hover:bg-gray-100">
                        Select All Branches
                      </button>
                      {branchOptions.map((b) => (
                        <label key={b.id}
                          className="flex items-center gap-2 px-2 py-1 text-xs text-gray-700 rounded hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={branchSel.includes(b.id)}
                            onChange={() => setBranchSel((prev) => prev.includes(b.id)
                              ? prev.filter((x) => x !== b.id) : [...prev, b.id])} />
                          <span className="truncate">{b.name}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ===== Branch Analysis (selected branches) — table format with the
              same metrics as the summary tiles, scoped to each branch ===== */}
          {!breakdownRows && !categoryRows && reportType !== 'all' && selBranches.length >= 1 && (() => {
            // Rank by combined Spare + Labour Achi. Till among ALL branches
            const allIds = [...new Set([...(report.spare_rows || []), ...(report.labour_rows || [])]
              .map((r) => r.branch_id))];
            const totalOf = (id) =>
              ((report.spare_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0) +
              ((report.labour_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0);
            const ranked = allIds.map((id) => ({ id, t: totalOf(id) })).sort((a, b) => b.t - a.t);
            const rankOf = (id) => 1 + ranked.findIndex((r) => r.id === id);
            const rowsB = selBranches.map((id) => {
              const sp = (report.spare_rows || []).find((r) => r.branch_id === id);
              const lb = (report.labour_rows || []).find((r) => r.branch_id === id);
              const base = sp || lb;
              if (!base) return null;
              const spSale = sp?.achieved_till || 0, spTgt = sp?.monthly_target || 0;
              const lbSale = lb?.achieved_till || 0, lbTgt = lb?.monthly_target || 0;
              let req = 0, cur = 0;
              [sp, lb].forEach((r) => {
                if (!r || !r.daily_target || !r.monthly_target) return;
                const totalWd = r.monthly_target / r.daily_target;
                const elapsedWd = Math.min(totalWd, (r.target_till || 0) / r.daily_target);
                const remWd = Math.max(0, totalWd - elapsedWd);
                if (remWd > 0) req += Math.max(0, r.monthly_target - (r.achieved_till || 0)) / remWd;
                if (elapsedWd > 0) cur += (r.achieved_till || 0) / elapsedWd;
              });
              return {
                id, rank: rankOf(id), rankOutOf: ranked.length,
                name: base.branch_name, region: base.region, person: base.responsible_person,
                spSale, spTgt, spPct: spTgt ? spSale / spTgt * 100 : null,
                lbSale, lbTgt, lbPct: lbTgt ? lbSale / lbTgt * 100 : null,
                overall: (spTgt + lbTgt) ? (spSale + lbSale) / (spTgt + lbTgt) * 100 : null,
                invoices: (sp?.invoice_count_till || 0) + (lb?.invoice_count_till || 0),
                req, cur,
              };
            }).filter(Boolean);
            return (
              <div className="mx-3 mb-2 rounded-xl border overflow-hidden"
                style={{ borderColor: 'rgba(47,49,146,0.25)' }}>
                <div className="px-2 py-1 text-[11px] font-bold text-white"
                  style={{ backgroundColor: themeColor }}>
                  Branch Analysis — {rowsB.length} branch{rowsB.length > 1 ? 'es' : ''} selected
                </div>
                <HScrollBox watch={`analysis-${rowsB.length}`}>
                  <table className="w-full text-[11px] border-collapse min-w-[860px]">
                    <thead><tr>
                      <th className={`${thT} text-left`}>Branch</th>
                      <th className={thT}>Rank</th>
                      <th className={thT}>Total Spare Sale</th>
                      <th className={thT}>Spare % vs AOP Target</th>
                      <th className={thT}>Total Labour Sale</th>
                      <th className={thT}>Labour % vs AOP Target</th>
                      <th className={thT}>Overall % Achieved</th>
                      <th className={thT}>Total Invoices</th>
                      <th className={thT}>Required Daily Run-Rate</th>
                    </tr></thead>
                    <tbody>
                      {rowsB.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50/60">
                          <td className={`${tdT} font-medium`} title={b.person || ''}>
                            {b.name} <span className="text-gray-400">({b.region})</span>
                          </td>
                          <td className={`${tdT} text-center font-bold pms-accent`}>
                            #{b.rank} <span className="font-normal text-gray-400">of {b.rankOutOf}</span>
                          </td>
                          <td className={`${tdT} text-right`}>₹ {lakh(b.spSale)}</td>
                          <td className={`${tdT} text-right font-semibold ${pctCellCls(b.spPct)}`}>
                            {b.spPct == null ? '—' : b.spPct.toFixed(1) + ' %'}
                            {b.spTgt ? <div className="text-[9px] font-normal">of ₹ {lakh(b.spTgt)} target</div> : null}
                          </td>
                          <td className={`${tdT} text-right`}>₹ {lakh(b.lbSale)}</td>
                          <td className={`${tdT} text-right font-semibold ${pctCellCls(b.lbPct)}`}>
                            {b.lbPct == null ? '—' : b.lbPct.toFixed(1) + ' %'}
                            {b.lbTgt ? <div className="text-[9px] font-normal">of ₹ {lakh(b.lbTgt)} target</div> : null}
                          </td>
                          <td className={`${tdT} text-right font-semibold ${pctCellCls(b.overall)}`}>
                            {b.overall == null ? '—' : b.overall.toFixed(1) + ' %'}
                          </td>
                          <td className={`${tdT} text-right`}>{inr(b.invoices)}</td>
                          <td className={`${tdT} text-right`}>
                            ₹ {lakh(b.req)} /day
                            <div className="text-[9px] text-gray-500">current ₹ {lakh(b.cur)} /day</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </HScrollBox>
              </div>
            );
          })()}

          {/* "All" — every report in one frame: Spare + Labour side by side,
              then the three breakdown tables below */}
          {reportType === 'all' && (() => {
            // Full-width breakdown table; after each metric a "% of total"
            // share column (row ÷ column total).
            const renderAllBreakdown = (label, rows2) => {
              const tot = (rows2 || []).reduce((a, r) => ({
                part: a.part + (r.part || 0), labour: a.labour + (r.labour || 0),
                total: a.total + (r.total || 0), invoices: a.invoices + (r.invoices || 0),
              }), { part: 0, labour: 0, total: 0, invoices: 0 });
              const pct = (v, t) => (t ? (v / t * 100).toFixed(1) + ' %' : '—');
              const thB = 'px-1.5 py-1 text-center text-[11px] font-semibold text-gray-600 leading-tight bg-gray-50 border border-gray-200';
              // numbers right-aligned (headers stay centered)
              const tdB = 'px-1.5 py-1 border border-gray-200 text-right whitespace-nowrap';
              const tdP = tdB;   // % share cells — same black text as the rest
              return (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                    style={{ backgroundColor: themeColor }}>
                    <span>{label}</span>
                    <span className="font-medium text-white/80">Lakh ₹ · % of total</span>
                  </div>
                  <HScrollBox watch={`${label}-${(rows2 || []).length}`}>
                    <table className="w-full text-[11px] border-collapse min-w-[640px]">
                      <thead><tr>
                        <th className={thB}>Name</th>
                        <th className={thB}>Spare Sale</th>
                        <th className={thB}>% Spare</th>
                        <th className={thB}>Labour Sale</th>
                        <th className={thB}>% Labour</th>
                        <th className={thB}>Total</th>
                        <th className={thB}>% Total</th>
                        <th className={thB}>Invoices</th>
                        <th className={thB}>% Invoices</th>
                      </tr></thead>
                      <tbody>
                        {(rows2 || []).length === 0 ? (
                          <tr><td colSpan={9} className="text-center py-3 text-gray-500 border border-gray-200">No data</td></tr>
                        ) : (
                          <>
                            {rows2.map((r, i) => (
                              <tr key={i} className="hover:bg-gray-50/60">
                                <td className="px-1.5 py-1 border border-gray-200 font-medium whitespace-nowrap text-center" title={r.name}>{r.name}</td>
                                <td className={tdB}>{lakh(r.part)}</td>
                                <td className={tdP}>{pct(r.part, tot.part)}</td>
                                <td className={tdB}>{lakh(r.labour)}</td>
                                <td className={tdP}>{pct(r.labour, tot.labour)}</td>
                                <td className={`${tdB} font-semibold`}>{lakh(r.total)}</td>
                                <td className={tdP}>{pct(r.total, tot.total)}</td>
                                <td className={tdB}>{inr(r.invoices)}</td>
                                <td className={tdP}>{pct(r.invoices, tot.invoices)}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-bold">
                              <td className="px-1.5 py-1 border border-gray-200 text-center">Total</td>
                              <td className={tdB}>{lakh(tot.part)}</td>
                              <td className={tdB}>100 %</td>
                              <td className={tdB}>{lakh(tot.labour)}</td>
                              <td className={tdB}>100 %</td>
                              <td className={tdB}>{lakh(tot.total)}</td>
                              <td className={tdB}>100 %</td>
                              <td className={tdB}>{inr(tot.invoices)}</td>
                              <td className={tdB}>100 %</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </HScrollBox>
                </div>
              );
            };
            // Category-wise — Spare only (the Labour file has no CATEGORY
            // column); same look as the other breakdown tables, placed last.
            const renderAllCategory = () => {
              const rows2 = report.category || [];
              const tot = rows2.reduce((a, r) => ({
                part: a.part + (r.part || 0), invoices: a.invoices + (r.invoices || 0),
                qty: a.qty + (r.qty || 0), lines: a.lines + (r.lines || 0),
              }), { part: 0, invoices: 0, qty: 0, lines: 0 });
              const pct = (v, t) => (t ? (v / t * 100).toFixed(1) + ' %' : '—');
              // EVERY amount in L, even small ones (0.59 L) — no mixed formats
              const fmtL = (v) => ((Number(v) || 0) / 100000).toFixed(2) + ' L';
              const thB = 'px-1.5 py-1 text-center text-[11px] font-semibold text-gray-600 leading-tight bg-gray-50 border border-gray-200';
              // numbers right-aligned (headers stay centered)
              const tdB = 'px-1.5 py-1 border border-gray-200 text-right whitespace-nowrap';
              const tdName = 'px-1.5 py-1 border border-gray-200 text-center whitespace-nowrap';
              return (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                    style={{ backgroundColor: themeColor }}>
                    <span>Category-wise Sales (Spare)</span>
                    <span className="font-medium text-white/80">Spare only · Lakh ₹ · % of total</span>
                  </div>
                  <HScrollBox watch={`category-${rows2.length}`}>
                    <table className="w-full text-[11px] border-collapse min-w-[640px]">
                      <thead><tr>
                        <th className={thB}>Category</th>
                        <th className={thB}>Spare Sale</th>
                        <th className={thB}>% Spare</th>
                        <th className={thB}>Quantity</th>
                        <th className={thB}>Line Items</th>
                        <th className={thB}>Invoices</th>
                        <th className={thB}>% Invoices</th>
                        <th className={thB}>Avg / Invoice</th>
                      </tr></thead>
                      <tbody>
                        {rows2.length === 0 ? (
                          <tr><td colSpan={8} className="text-center py-3 text-gray-500 border border-gray-200">No data</td></tr>
                        ) : (
                          <>
                            {rows2.map((r, i) => (
                              <tr key={i} className="hover:bg-gray-50/60">
                                <td className={`${tdName} font-medium`} title={r.name}>{r.name}</td>
                                <td className={`${tdB} font-medium`}>{fmtL(r.part)}</td>
                                <td className={tdB}>{pct(r.part, tot.part)}</td>
                                <td className={tdB}>{inr(Math.round(r.qty || 0))}</td>
                                <td className={tdB}>{inr(r.lines)}</td>
                                <td className={tdB}>{inr(r.invoices)}</td>
                                <td className={tdB}>{pct(r.invoices, tot.invoices)}</td>
                                <td className={tdB}>{r.invoices ? fmtL(r.part / r.invoices) : '—'}</td>
                              </tr>
                            ))}
                            <tr className="bg-gray-50 font-bold">
                              <td className={tdName}>Total</td>
                              <td className={tdB}>{fmtL(tot.part)}</td>
                              <td className={tdB}>100 %</td>
                              <td className={tdB}>{inr(Math.round(tot.qty))}</td>
                              <td className={tdB}>{inr(tot.lines)}</td>
                              <td className={tdB}>{inr(tot.invoices)}</td>
                              <td className={tdB}>100 %</td>
                              <td className={tdB}>{tot.invoices ? fmtL(tot.part / tot.invoices) : '—'}</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </HScrollBox>
                </div>
              );
            };
            return (
              <div className="px-3 pb-3 space-y-2">
                <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-2">
                  {renderAllSide('SPARE', report.spare_rows, fmtDay(report.as_on_part || report.as_on))}
                  {renderAllSide('LABOUR', report.labour_rows, fmtDay(report.as_on_labour || report.as_on))}
                </div>
                {renderAllBreakdown('Regional-wise Sales', report.regional)}
                {renderAllBreakdown('Segment-wise Sales', report.segment)}
                {renderAllBreakdown('Service Report Type-wise Sales', report.service_head)}
                {renderAllCategory()}
              </div>
            );
          })()}

          {/* Branch table (Spare / Labour) — pivot layout: Region first with a
              merged cell per region (MH then KA), each region followed by its
              own subtotal row, then the grand total. */}
          {!breakdownRows && !categoryRows && reportType !== 'all' && (
            <div className="px-3 pb-3">
              <p className="text-[10px] text-gray-400 text-right mb-1">Values in Lakh ₹ — 23 means ₹23,00,000</p>
              <HScrollBox watch={`${reportType}-${branchRows.length}`}>
              <table className="w-full text-[11px] border-collapse min-w-[900px]">
                <thead><tr>
                  <th className={thT}>Region</th>
                  <th className={thT}>Branch</th>
                  <th className={thT}>Responsible Person</th>
                  <th className={thT}>Monthly Target</th>
                  <th className={thT}>Daily Target</th>
                  <th className={thT}>Achi. on {dayLabel}</th>
                  <th className={thT}>Target Till {dayLabel}</th>
                  <th className={thT}>Achi. Till {dayLabel}</th>
                  <th className={thT}>Invoice Count Till {dayLabel}</th>
                  <th className={thT}>% Achieved Till Date</th>
                  <th className={thT}>Short-Fall Till Date</th>
                  <th className={thT}>Balance For Month</th>
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
                        <td className={`${tdT} text-right`}>{lkh(s.monthly_target)}</td>
                        <td className={`${tdT} text-right`}>{lkh(s.daily_target)}</td>
                        <td className={`${tdT} text-right`}>{lkh(s.achieved_on)}</td>
                        <td className={`${tdT} text-right`}>{lkh(s.target_till)}</td>
                        <td className={`${tdT} text-right`}>{lkh(s.achieved_till)}</td>
                        <td className={`${tdT} text-right`}>{inr(s.invoice_count_till)}</td>
                        <td className={`${tdT} text-right font-semibold ${pctCellCls(s.target_till ? +(s.achieved_till / s.target_till * 100).toFixed(1) : null)}`}>
                          {s.target_till ? (s.achieved_till / s.target_till * 100).toFixed(1) + ' %' : '—'}
                        </td>
                        <td className={`${tdT} text-right`}>
                          {lkh(s.short_fall_till)}
                        </td>
                        <td className={`${tdT} text-right`}>{lkh(s.balance_month)}</td>
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
                                      className={`${tdT} text-center font-bold align-middle pms-region-cell`}>
                                      {reg}
                                    </td>
                                  )}
                                  <td className={tdT}>{r.branch_name}</td>
                                  <td className={tdT}>{r.responsible_person}</td>
                                  <td className={`${tdT} text-right`}>{lkh(r.monthly_target)}</td>
                                  <td className={`${tdT} text-right`}>{lkh(r.daily_target)}</td>
                                  <td className={`${tdT} text-right`}>{lkh(r.achieved_on)}</td>
                                  <td className={`${tdT} text-right`}>{lkh(r.target_till)}</td>
                                  <td className={`${tdT} text-right font-medium`}>{lkh(r.achieved_till)}</td>
                                  <td className={`${tdT} text-right`}>{inr(r.invoice_count_till)}</td>
                                  <td className={`${tdT} text-right font-semibold ${pctCellCls(r.pct_achieved)}`}>
                                    {r.pct_achieved == null ? '—' : r.pct_achieved + ' %'}
                                  </td>
                                  <td className={`${tdT} text-right`}>
                                    {lkh(r.short_fall_till)}
                                  </td>
                                  <td className={`${tdT} text-right ${r.balance_month != null && r.balance_month <= 0 ? 'pms-ahead' : ''}`}>
                                    {lkh(r.balance_month)}
                                  </td>
                                </tr>
                              ))}
                              {/* region subtotal (like the pivot's "MH Total") */}
                              <tr className="font-semibold pms-subtotal-row">
                                <td className={tdT} colSpan={3}>
                                  {reg === 'MH' ? 'Maharashtra Total' : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`}
                                </td>
                                {metricCells(sub)}
                              </tr>
                            </React.Fragment>
                          );
                        })}
                        {/* grand total */}
                        <tr className="bg-gray-50 font-bold">
                          <td className={tdT} colSpan={3}>Total (All)</td>
                          {metricCells(totals)}
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
              </HScrollBox>
            </div>
          )}

          {/* Breakdown tables (Regional / Segment / Service head) — compact,
              with a "% of total" share column after each metric */}
          {breakdownRows && (() => {
            const bTot = breakdownRows.reduce((a, r) => ({
              part: a.part + (r.part || 0), labour: a.labour + (r.labour || 0),
              total: a.total + (r.total || 0), invoices: a.invoices + (r.invoices || 0),
            }), { part: 0, labour: 0, total: 0, invoices: 0 });
            const bPct = (v, t) => (t ? (v / t * 100).toFixed(1) + ' %' : '—');
            // Amounts always in Lakh ("X.XX L") — same as the Category table
            const bL = (v) => ((Number(v) || 0) / 100000).toFixed(2) + ' L';
            const tdP2 = `${tdT} text-right`;   // % cells — black text, numbers right-aligned
            return (
              <div className="px-3 pb-3">
                <HScrollBox watch={`${reportType}-${breakdownRows.length}`}>
                <table className="w-full text-[11px] border-collapse min-w-[720px]">
                  <thead><tr>
                    <th className={thT}>
                      {reportType === 'regional' ? 'Region' : reportType === 'segment' ? 'Segment' : 'Service Head'}
                    </th>
                    <th className={thT}>Spare Sale</th>
                    <th className={thT}>% Spare</th>
                    <th className={thT}>Labour Sale</th>
                    <th className={thT}>% Labour</th>
                    <th className={thT}>Total</th>
                    <th className={thT}>% Total</th>
                    <th className={thT}>Invoices</th>
                    <th className={thT}>% Invoices</th>
                  </tr></thead>
                  <tbody>
                    {breakdownRows.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-6 text-gray-500 border border-gray-200">No data for {report.month}.</td></tr>
                    ) : breakdownRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className={`${tdT} font-medium text-center`}>{r.name}</td>
                        <td className={`${tdT} text-right`}>{bL(r.part)}</td>
                        <td className={tdP2}>{bPct(r.part, bTot.part)}</td>
                        <td className={`${tdT} text-right`}>{bL(r.labour)}</td>
                        <td className={tdP2}>{bPct(r.labour, bTot.labour)}</td>
                        <td className={`${tdT} text-right font-semibold`}>{bL(r.total)}</td>
                        <td className={tdP2}>{bPct(r.total, bTot.total)}</td>
                        <td className={`${tdT} text-right`}>{inr(r.invoices)}</td>
                        <td className={tdP2}>{bPct(r.invoices, bTot.invoices)}</td>
                      </tr>
                    ))}
                    {breakdownRows.length > 0 && (
                      <tr className="bg-gray-50 font-semibold">
                        <td className={`${tdT} text-center`}>Total</td>
                        <td className={`${tdT} text-right`}>{bL(bTot.part)}</td>
                        <td className={`${tdT} text-right`}>100 %</td>
                        <td className={`${tdT} text-right`}>{bL(bTot.labour)}</td>
                        <td className={`${tdT} text-right`}>100 %</td>
                        <td className={`${tdT} text-right`}>{bL(bTot.total)}</td>
                        <td className={`${tdT} text-right`}>100 %</td>
                        <td className={`${tdT} text-right`}>{inr(bTot.invoices)}</td>
                        <td className={`${tdT} text-right`}>100 %</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </HScrollBox>
              </div>
            );
          })()}

          {/* Category-wise (Spare only) — the CATEGORY column of the Part
              Sale file; the Labour file has no such column */}
          {categoryRows && (() => {
            const cTot = categoryRows.reduce((a, r) => ({
              part: a.part + (r.part || 0), invoices: a.invoices + (r.invoices || 0),
              qty: a.qty + (r.qty || 0), lines: a.lines + (r.lines || 0),
            }), { part: 0, invoices: 0, qty: 0, lines: 0 });
            const cPct = (v, t) => (t ? (v / t * 100).toFixed(1) + ' %' : '—');
            // EVERY amount in L, even small ones (0.59 L) — no mixed formats
            const cL = (v) => ((Number(v) || 0) / 100000).toFixed(2) + ' L';
            return (
              <div className="px-3 pb-3">
                <p className="text-[10px] text-gray-500 mb-1">
                  Spare (Part Sale) data only — the Labour file has no CATEGORY column. Amounts in Lakh ₹.
                </p>
                <HScrollBox watch={`${reportType}-${categoryRows.length}`}>
                <table className="w-full text-[11px] border-collapse min-w-[720px]">
                  <thead><tr>
                    <th className={thT}>Category</th>
                    <th className={thT}>Spare Sale</th>
                    <th className={thT}>% Spare</th>
                    <th className={thT}>Quantity</th>
                    <th className={thT}>Line Items</th>
                    <th className={thT}>Invoices</th>
                    <th className={thT}>% Invoices</th>
                    <th className={thT}>Avg / Invoice</th>
                  </tr></thead>
                  <tbody>
                    {categoryRows.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-6 text-gray-500 border border-gray-200">No data for {report.month}.</td></tr>
                    ) : categoryRows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className={`${tdT} font-medium text-center`}>{r.name}</td>
                        <td className={`${tdT} font-medium text-right`}>{cL(r.part)}</td>
                        <td className={`${tdT} text-right`}>{cPct(r.part, cTot.part)}</td>
                        <td className={`${tdT} text-right`}>{inr(Math.round(r.qty || 0))}</td>
                        <td className={`${tdT} text-right`}>{inr(r.lines)}</td>
                        <td className={`${tdT} text-right`}>{inr(r.invoices)}</td>
                        <td className={`${tdT} text-right`}>{cPct(r.invoices, cTot.invoices)}</td>
                        <td className={`${tdT} text-right`}>{r.invoices ? cL(r.part / r.invoices) : '—'}</td>
                      </tr>
                    ))}
                    {categoryRows.length > 0 && (
                      <tr className="bg-gray-50 font-semibold">
                        <td className={`${tdT} text-center`}>Total</td>
                        <td className={`${tdT} text-right`}>{cL(cTot.part)}</td>
                        <td className={`${tdT} text-right`}>100 %</td>
                        <td className={`${tdT} text-right`}>{inr(Math.round(cTot.qty))}</td>
                        <td className={`${tdT} text-right`}>{inr(cTot.lines)}</td>
                        <td className={`${tdT} text-right`}>{inr(cTot.invoices)}</td>
                        <td className={`${tdT} text-right`}>100 %</td>
                        <td className={`${tdT} text-right`}>{cTot.invoices ? cL(cTot.part / cTot.invoices) : '—'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </HScrollBox>
              </div>
            );
          })()}
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
                              className="font-medium hover:underline pms-accent">
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
                                <td className={`${tdCls} text-right font-semibold ${
                                  r.pct_achieved == null ? '' : r.pct_achieved >= 100 ? 'pms-ahead' : r.pct_achieved >= 70 ? 'pms-mid' : 'pms-behind'}`}>
                                  {r.pct_achieved == null ? '—' : r.pct_achieved + ' %'}
                                </td>
                                <td className={`${tdCls} text-right`}>
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
                            <p className="text-base font-bold pms-accent">{value}</p>
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
