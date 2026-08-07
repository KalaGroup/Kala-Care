import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { canExportExcel } from '../utils/exportPermission';
import EmployeeProductivityReport, { buildEpSheet } from '../components/EmployeeProductivityReport';
import {
  ChartBarSquareIcon, ArrowUpTrayIcon, DocumentMagnifyingGlassIcon,
  ClockIcon, BookmarkSquareIcon, XMarkIcon, TrashIcon,
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
      const { scrollWidth, clientWidth, offsetWidth } = el;
      // The preview container also scrolls vertically — its v-scrollbar eats
      // ~15px of clientWidth the top bar doesn't lose, so without this the
      // top bar's range ends short of the table's true right edge.
      const vScrollbar = Math.max(0, offsetWidth - clientWidth);
      setSpacerWidth(scrollWidth > clientWidth + 1 ? scrollWidth + vScrollbar : 0);
    };
    // Assigning an identical scrollLeft doesn't refire 'scroll',
    // so the two listeners can't ping-pong. Both handlers re-measure so the
    // bar always covers the table's CURRENT full width (lazy-loaded rows /
    // extra columns can widen it after mount).
    const fromTable = () => { update(); top.scrollLeft = el.scrollLeft; };
    const fromTop = () => { update(); el.scrollLeft = top.scrollLeft; };

    update();
    el.addEventListener('scroll', fromTable);
    top.addEventListener('scroll', fromTop);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const tableEl = el.querySelector('table');
    if (tableEl) ro.observe(tableEl);
    // The table NODE itself can be replaced (loading state → data) — watch
    // for that and re-observe the new node, else the bar stops tracking it.
    const mo = new MutationObserver(() => {
      update();
      const t2 = el.querySelector('table');
      if (t2) ro.observe(t2);
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', fromTable);
      top.removeEventListener('scroll', fromTop);
      ro.disconnect();
      mo.disconnect();
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

// Custom select that OPENS ON HOVER and closes when the mouse leaves
// (native <select> can't do this) — used for every PMS dropdown.
const HoverSelect = ({ value, onChange, options, minW }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <div className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white flex items-center justify-between gap-1.5"
        style={minW ? { minWidth: minW } : undefined}>
        <span className="truncate">{current ? current.label : value}</span>
        <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        /* pt-1 (not a margin) keeps the hover unbroken across the gap */
        <div className="absolute left-0 top-full z-50 pt-1"
          style={{ width: 'max-content', minWidth: '100%' }}>
          <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-1 max-h-64 overflow-y-auto"
            style={{ width: 'max-content', minWidth: '100%', maxWidth: 320 }}>
            {options.map((o) => (
              <button key={String(o.value)} type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-2 py-1 text-xs rounded whitespace-nowrap ${
                  o.value === value ? 'text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                style={o.value === value ? { backgroundColor: themeColor } : {}}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
  // Labour SR numbers matched to the 'Response Time & MaxTTR Details' import
  { key: 'employee_productivity', name: 'Employee Productivity' },
];

// Fixed preview column layouts (business-given) — the Uploaded File Preview
// shows columns in the SAME ORDER as the standard PMS Excel files.
// [header shown, canonical field] — EVERY column is a real DB column now
// (field null only as a legacy fallback to a row's old extra_data JSON).
const FILE_LAYOUTS = {
  labour: [
    ['ZONE NAME', 'zone_name'], ['SD ID', 'soid'], ['SD NAME', 'sd_name'],
    ['BRANCH ID', 'branch_id'], ['BRANCH NAME', 'branch_name'],
    ['CLAIM INVOICE NUMBER', 'claim_invoice_no'],
    ['CLAIM INVOICE DATE', 'claim_invoice_date'],
    ['PRODUCT SEGMENT', 'product_segment'], ['SEGMENT', 'segment'],
    ['SERIES', 'series'], ['SR NUMBER', 'sr_number'], ['SR TYPE', 'sr_type'],
    ['SR SUBTYPE', 'sr_sub_type'], ['NET TAXABLE AMOUNT', 'net_taxable_amount'],
  ],
  part: [
    ['ZONE NAME', 'zone_name'], ['SD ID', 'soid'], ['SD NAME', 'sd_name'],
    ['BRANCH ID', 'branch_id'], ['BRANCH NAME', 'branch_name'],
    ['INSTANCE ID', 'instance_id'], ['SEGMENT', 'segment'],
    ['PRODUCT SEGMENT', 'product_segment'], ['APPLICATION CODE', 'application_code'],
    ['ENGINE SERIAL NO', 'engine_serial_no'], ['CLAIM INVOICE NUMBER', 'claim_invoice_no'],
    ['CLAIM INVOICE DATE', 'claim_invoice_date'],
    ['CLAIM INVOICE SR TYPE', 'sr_type'], ['CLAIM INVOICE SR SUB TYPE', 'sr_sub_type'],
    ['CATEGORY', 'category'], ['PART CATEGORY', 'part_category'], ['PART NUMBER', 'part_number'],
    ['PART DESCTRIPTION', 'part_description'], ['QUANTITY', 'quantity'],
    ['NET TAXABLE AMOUNT', 'net_taxable_amount'],
  ],
};

// "Sr  Number." === "SR NUMBER" — same skeleton matching the import uses
const tightHeader = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

// Responsible Person display: FIRST + LAST name only
// ("Hanumant Nagorao Nelge" -> "Hanumant Nelge"); full name stays in the tooltip.
const shortName = (s) => {
  const parts = String(s || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(' ');
};

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
  // Branch-wise Report tab (right of 'Select report type'): shows ONLY the
  // branch picker + Branch Analysis; picking a report type returns to the
  // normal all-records view.
  const [branchMode, setBranchMode] = useState(false);
  // Week-wise + breakdowns scoped to ONLY the selected branches — each
  // section has its own checkbox; data fetched from /pms/report/branch-detail
  // as soon as any section is ticked.
  const [detailSecs, setDetailSecs] = useState({
    weeks: false, months: false, segment: false, service_head: false, category: false,
    records: false,   // SPARE/LABOUR branch tables of ONLY the selected branches
    employee: false,  // Employee Productivity scoped to the selected branches
  });
  // 'records' renders straight from the report payload — no branch-detail fetch
  const anyDetailSec = detailSecs.weeks || detailSecs.months || detailSecs.segment
    || detailSecs.service_head || detailSecs.category;
  const [branchDetail, setBranchDetail] = useState(null);
  const [branchDetailLoading, setBranchDetailLoading] = useState(false);
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
  // History list filters: as-on date range + generated-by
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histBy, setHistBy] = useState('');

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
    const result = await Swal.fire({
      title: cancel ? 'Cancel this row?' : 'Restore this row?',
      html: cancel
        ? `Only THIS ${typeName} row (<b>${inv}</b>) will be excluded from every report.<br/>` +
          'It stays stored in the database — other rows of the invoice are not affected.'
        : `This ${typeName} row (<b>${inv}</b>) will be counted in reports again.`,
      icon: cancel ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonColor: cancel ? '#f59e0b' : '#2f3192',
      cancelButtonColor: '#6B7280',
      confirmButtonText: cancel ? 'Yes, cancel row' : 'Yes, restore',
      cancelButtonText: 'No',
    });
    if (!result.isConfirmed) return;
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

  // Selected-branch detail: week-wise split + branch-scoped breakdowns.
  // Refetches whenever the toggle is open and the selection / period changes.
  useEffect(() => {
    if (!anyDetailSec || !report || !branchSel.length) { setBranchDetail(null); return; }
    let stale = false;
    (async () => {
      setBranchDetailLoading(true);
      try {
        const url = `${API}/pms/report/branch-detail?as_on=${report.as_on}` +
          (report.from_date ? `&from_date=${report.from_date}` : '') +
          `&branches=${encodeURIComponent(branchSel.join(','))}`;
        const res = await fetch(url, { headers: authHeaders() });
        const data = await res.json();
        if (!stale && res.ok && data.success) setBranchDetail(data);
      } catch { if (!stale) setBranchDetail(null); }
      finally { if (!stale) setBranchDetailLoading(false); }
    })();
    return () => { stale = true; };
  }, [anyDetailSec, report, branchSel]);
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
    const layout = FILE_LAYOUTS[previewType] || [];
    // Headers already shown as REAL columns — legacy extra_data copies of
    // these (rows imported before the column split) must NOT repeat at the
    // end of the table.
    const layoutTights = new Set(layout.map(([h]) => tightHeader(h)));
    layoutTights.add('PARTDESCRIPTION');   // correct spelling of the file's typo

    const extraKeys = [];          // truly unknown columns, first-seen order
    const seenTight = new Set();
    previewRows.forEach((r) => {
      Object.keys(r.extra || {}).forEach((k) => {
        const t = tightHeader(k);
        if (layoutTights.has(t) || seenTight.has(t)) return;
        seenTight.add(t);
        extraKeys.push(k);
      });
    });

    const cols = layout.map(([header, field]) => ({ key: field, label: header, extra: false }));
    extraKeys.forEach((k) => cols.push({ key: k, label: k, extra: true }));
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
      // Snapshot the Employee Productivity source data too, so the saved
      // report replays it without depending on later uploads (non-fatal).
      let empProd = null;
      try {
        const r2 = await fetch(`${API}/pms/report/employee-productivity`, { headers: authHeaders() });
        const d2 = await r2.json();
        if (r2.ok && d2.success) empProd = d2;
      } catch { /* saved without the productivity section */ }
      // Branch-wise view saved AS-IS: the selection, the ticked sections and
      // their loaded detail data — so history replays exactly what's on screen.
      const payload = empProd ? { ...report, emp_productivity: empProd } : { ...report };
      if (branchMode && selBranches.length) {
        payload.branch_view = {
          branches: selBranches,
          names: selBranches.map((id) => branchOptions.find((b) => b.id === id)?.name || ''),
          secs: detailSecs,
          detail: branchDetail,
        };
      }
      const res = await fetch(`${API}/pms/report/save`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          as_on: report.as_on,
          title: `PMS ${branchMode && selBranches.length ? 'Branch-wise ' : ''}Report as on ${fmtFull(report.as_on)}`,
          payload,
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

  const deleteHistoryItem = async (id) => {
    const result = await Swal.fire({
      title: 'Delete this saved report?',
      text: 'The saved report will be permanently removed from history. This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;
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
  // Selected branches present in the current rows; [] = all.
  // Used ONLY by the Branch-wise Report view — the standalone report types
  // (Spare Part Sales / Labour Sales) always show EVERY branch.
  const selBranches = branchSel.filter((id) => regionRows.some((r) => r.branch_id === id));
  const branchRows = regionRows;
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
  // Employee Productivity — self-contained view (own data fetch + period);
  // every generated-report section below is hidden while it is selected.
  const isEmpProd = reportType === 'employee_productivity';

  // Required daily run-rate (summary tile): per type, the remaining balance
  // for the period ÷ remaining working days (working days derived from the
  // AOP daily targets: total = target/daily, elapsed = target_till/daily),
  // summed over spares + labour. Current run-rate shown alongside.
  // Kept separately per type — the tiles show a Spare row and a Labour row.
  const runRateBy = report ? (() => {
    const calc = (rows) => {
      const mt = (rows || []).reduce((s, r) => s + (r.monthly_target || 0), 0);
      const dt = (rows || []).reduce((s, r) => s + (r.daily_target || 0), 0);
      const tt = (rows || []).reduce((s, r) => s + (r.target_till || 0), 0);
      const at = (rows || []).reduce((s, r) => s + (r.achieved_till || 0), 0);
      if (!dt || !mt) return null;
      const totalWd = mt / dt;
      const elapsedWd = Math.min(totalWd, tt / dt);
      const remainingWd = Math.max(0, totalWd - elapsedWd);
      return {
        req: remainingWd > 0 ? Math.max(0, mt - at) / remainingWd : 0,
        cur: elapsedWd > 0 ? at / elapsedWd : 0,
      };
    };
    return { spare: calc(report.spare_rows), labour: calc(report.labour_rows) };
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

  // Spare + Labour side-by-side pair with MERGED region bands: ONE full-width
  // "Maharashtra (MH)" / "Karnataka (KA)" bar spans BOTH tables, with each
  // side's block for that region under it. Every small table shares the same
  // fixed column grid, so rows and columns stay aligned across regions and
  // between the two sides. Used by the All view AND the Branch-wise view.
  const renderMergedPair = (spareAll, labourAll) => {
    const dlS = fmtDay(report?.as_on_part || report?.as_on);
    const dlL = fmtDay(report?.as_on_labour || report?.as_on);
    const lk = (v) => (v == null ? '—' : (Number(v) / 100000).toFixed(2));
    // Region dropdown: show MH / KA separately (no long scroll) or everything
    const pick = (allRows) => (allRegion === 'All' ? (allRows || [])
      : (allRows || []).filter((r) => r.region === allRegion));
    const spareRows = pick(spareAll);
    const labourRows = pick(labourAll);
    const groupBy = (rows) => {
      const by = {};
      rows.forEach((r) => { (by[r.region] = by[r.region] || []).push(r); });
      return by;
    };
    const bySp = groupBy(spareRows);
    const byLb = groupBy(labourRows);
    const allRegs = { ...bySp, ...byLb };
    const regionKeys = ['MH', 'KA'].filter((k) => allRegs[k])
      .concat(Object.keys(allRegs).filter((k) => k !== 'MH' && k !== 'KA'));
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
          <td className={tdA}>{lk(s.short_fall_till)}</td>
          <td className={tdA}>{lk(s.balance_month)}</td>
        </>
      );
    };
    // one shared fixed column grid for every small table below
    const sideCols = (
      <colgroup>
        <col style={{ width: '12%' }} />
        <col style={{ width: '10%' }} />
        {Array.from({ length: 9 }, (_, ci) => (
          <col key={ci} style={{ width: `${78 / 9}%` }} />
        ))}
      </colgroup>
    );
    // Synced horizontal scroll per column (SPARE / LABOUR): scrolling any
    // block (MH, KA or Total) auto-scrolls the others of the same side.
    const syncScroll = (grp) => (e) => {
      const left = e.currentTarget.scrollLeft;
      document.querySelectorAll(`[data-sync-scroll="${grp}"]`).forEach((el) => {
        if (el !== e.currentTarget && Math.abs(el.scrollLeft - left) > 1) el.scrollLeft = left;
      });
    };
    const sideTable = (children, grp) => (
      <div className="border border-gray-200 rounded overflow-x-auto"
        data-sync-scroll={grp} onScroll={grp ? syncScroll(grp) : undefined}>
        <table className="w-full text-[11px] border-collapse min-w-[600px]" style={{ tableLayout: 'fixed' }}>
          {sideCols}
          <tbody>{children}</tbody>
        </table>
      </div>
    );
    const regionBlock = (rs, dl, reg, grp) => sideTable(
      <>
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
        {rs.length === 0 ? (
          <tr><td colSpan={11} className="text-center py-2 text-gray-500 border border-gray-200">No rows</td></tr>
        ) : rs.map((r) => (
          <tr key={r.branch_id} className="hover:bg-gray-50/60">
            <td className="px-1 py-1 border border-gray-200 text-left whitespace-nowrap overflow-hidden text-ellipsis"
              title={r.responsible_person || ''}>
              {shortName(r.responsible_person) || '—'}
            </td>
            <td className="px-1 py-1 border border-gray-200 text-left whitespace-nowrap overflow-hidden text-ellipsis font-medium"
              title={r.branch_name || r.branch_id}>
              {r.branch_name}
            </td>
            {metricCells(r)}
          </tr>
        ))}
        {rs.length > 0 && (
          <tr className="font-semibold pms-subtotal-row">
            <td className={`${tdA} text-left`} colSpan={2}>
              {reg === 'MH' ? 'Maharashtra Total' : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`}
            </td>
            {metricCells(sum(rs))}
          </tr>
        )}
      </>,
      grp
    );
    const totalBlock = (rows, grp) => sideTable(
      <tr className="font-bold pms-grand-total">
        <td className={`${tdA} text-left`} colSpan={2}>Total</td>
        {metricCells(sum(rows))}
      </tr>,
      grp
    );
    return (
      <div className="space-y-1.5">
        {/* SPARE / LABOUR title bars */}
        <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-2">
          {[['SPARE', dlS], ['LABOUR', dlL]].map(([t, dl]) => (
            <div key={t} className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2 rounded"
              style={{ backgroundColor: themeColor }}>
              <span>{t}</span>
              <span className="font-medium text-white/80">As on {dl} · Lakh ₹</span>
            </div>
          ))}
        </div>
        {regionKeys.map((reg, ri) => (
          <React.Fragment key={reg}>
            {/* one-row gap between region blocks (MH ↔ KA) */}
            {ri > 0 && <div className="h-1.5" />}
            {/* ONE merged region band across BOTH tables */}
            <div className="px-1 py-1 text-center text-[11px] font-bold border border-gray-200 rounded pms-region-band">
              {reg === 'MH' ? 'Maharashtra (MH)' : reg === 'KA' ? 'Karnataka (KA)' : reg}
            </div>
            <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-2">
              {regionBlock(bySp[reg] || [], dlS, reg, 'sp')}
              {regionBlock(byLb[reg] || [], dlL, reg, 'lb')}
            </div>
          </React.Fragment>
        ))}
        {regionKeys.length === 0 && (
          <p className="text-center py-3 text-xs text-gray-500">No rows</p>
        )}
        {allRegion === 'All' && regionKeys.length > 0 && (
          <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-2">
            {totalBlock(spareRows, 'sp')}
            {totalBlock(labourRows, 'lb')}
          </div>
        )}
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
      // Money exported in Lakh — same as every on-screen table (23 = ₹23,00,000)
      const L = (v) => (v == null ? null : +(Number(v) / 100000).toFixed(2));
      // Header block mirrors the two summary tile rows (Spare then Labour)
      const invOf = (rows) => (rows || []).reduce((a, r) => a + (r.invoice_count_till || 0), 0);
      const tileRows = (nm, sale, target, rows, rr) => [
        [`${nm} Target (Lakh ₹)`, target ? L(target) : '—'],
        [`Total ${nm} Sale (Lakh ₹)`, L(sale)],
        [`${nm} % vs AOP Target`, target ? +(sale / target * 100).toFixed(1) + ' %' : '—'],
        [`${nm} Invoices`, invOf(rows)],
        [`Current ${nm} Run-Rate (Lakh ₹/day)`, rr ? L(rr.cur) : '—'],
        [`Required ${nm} Run-Rate (Lakh ₹/day)`, rr ? L(rr.req) : '—'],
      ];
      const info = [
        ['Performance Management System — Spare & Labour Sale'],
        [`Generated Report : As on ${fmtFull(report.as_on)}`],
        ['Period', `${fmtFull(report.from_date)} → ${fmtFull(report.as_on)}`],
        ['Report Type', branchMode
          ? `Branch-wise Report (${selBranches.length} branch${selBranches.length > 1 ? 'es' : ''})`
          : typeName],
        ...tileRows('Spare', s.total_spare_sale, s.total_spare_target, report.spare_rows, runRateBy?.spare),
        ...tileRows('Labour', s.total_labour_sale, s.total_labour_target, report.labour_rows, runRateBy?.labour),
        ['Values in Lakh ₹ — 23 means ₹23,00,000'],
        [],
      ];

      // Same pivot as the on-screen table: region blocks (MH then KA), a
      // subtotal row per region, then the grand total — money in Lakh.
      // Shared by the "All" workbook and the Branch-wise records sheets.
        const mkSheet = (rws, dl) => {
          const hdr = ['Region', 'Branch', 'Responsible Person', 'Monthly Target', 'Daily Target',
            `Achi. On ${dl}`, `Target Till ${dl}`, `Achi. Till ${dl}`, `Invoice Count Till ${dl}`,
            '% Achieved Till Date', 'Short-Fall Till Date', 'Balance For Month'];
          const byRegion = {};
          (rws || []).forEach((r) => { (byRegion[r.region] = byRegion[r.region] || []).push(r); });
          const regionKeys = ['MH', 'KA'].filter((k) => byRegion[k])
            .concat(Object.keys(byRegion).filter((k) => k !== 'MH' && k !== 'KA'));
          const sumR = (rs) => rs.reduce((a, r) => ({
            mt: a.mt + (r.monthly_target || 0), dt: a.dt + (r.daily_target || 0),
            ao: a.ao + (r.achieved_on || 0), tt: a.tt + (r.target_till || 0),
            at: a.at + (r.achieved_till || 0), ic: a.ic + (r.invoice_count_till || 0),
            sf: a.sf + (r.short_fall_till || 0), bm: a.bm + (r.balance_month || 0),
          }), { mt: 0, dt: 0, ao: 0, tt: 0, at: 0, ic: 0, sf: 0, bm: 0 });
          const totRow = (label, t) => [label, '', '', L(t.mt), L(t.dt), L(t.ao), L(t.tt), L(t.at),
            t.ic, t.tt ? +(t.at / t.tt * 100).toFixed(1) : null, L(t.sf), L(t.bm)];
          const data = [];
          regionKeys.forEach((reg) => {
            byRegion[reg].forEach((r, i) => data.push([
              i === 0 ? reg : '', r.branch_name, r.responsible_person,
              L(r.monthly_target), L(r.daily_target), L(r.achieved_on), L(r.target_till),
              L(r.achieved_till), r.invoice_count_till, r.pct_achieved,
              L(r.short_fall_till), L(r.balance_month)]));
            data.push(totRow(reg === 'MH' ? 'Maharashtra Total'
              : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`, sumR(byRegion[reg])));
          });
          data.push(totRow('Total', sumR(rws || [])));
          const ws = XLSX.utils.aoa_to_sheet([...info, hdr, ...data]);
          ws['!cols'] = hdr.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
          return ws;
        };

      // ---- Branch-wise Report mode: export the Branch Analysis view ----
      if (branchMode) {
        if (!selBranches.length) { toast.error('Branch-wise Report — select branches first'); return; }
        const wb = XLSX.utils.book_new();
        const allIds = [...new Set([...(report.spare_rows || []), ...(report.labour_rows || [])]
          .map((r) => r.branch_id))];
        const totalOf = (id) =>
          ((report.spare_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0) +
          ((report.labour_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0);
        const ranked = allIds.map((id) => ({ id, t: totalOf(id) })).sort((a, b) => b.t - a.t);
        const rrOf = (r) => {
          if (!r || !r.daily_target || !r.monthly_target) return null;
          const totalWd = r.monthly_target / r.daily_target;
          const elapsedWd = Math.min(totalWd, (r.target_till || 0) / r.daily_target);
          const remWd = Math.max(0, totalWd - elapsedWd);
          return {
            req: remWd > 0 ? Math.max(0, r.monthly_target - (r.achieved_till || 0)) / remWd : 0,
            cur: elapsedWd > 0 ? (r.achieved_till || 0) / elapsedWd : 0,
          };
        };
        const hdr1 = ['Branch', 'Rank', 'SPARE', '', '', '', '', '', 'LABOUR', '', '', '', '', ''];
        const hdr2 = ['', '',
          'Target', 'Total Sale', '% vs AOP Target', 'Invoices', 'Current Run-Rate (L/day)', 'Required Run-Rate (L/day)',
          'Target', 'Total Sale', '% vs AOP Target', 'Invoices', 'Current Run-Rate (L/day)', 'Required Run-Rate (L/day)'];
        const rowsA = selBranches.map((id) => {
          const sp = (report.spare_rows || []).find((r) => r.branch_id === id);
          const lb = (report.labour_rows || []).find((r) => r.branch_id === id);
          const base = sp || lb;
          if (!base) return null;
          const half = (r) => {
            const rr = rrOf(r);
            const tgt = r?.monthly_target || 0, sale = r?.achieved_till || 0;
            return [L(tgt), L(sale), tgt ? +(sale / tgt * 100).toFixed(1) : null,
              r?.invoice_count_till || 0, rr ? L(rr.cur) : null, rr ? L(rr.req) : null];
          };
          return [`${base.branch_name} (${base.region})`,
            `#${1 + ranked.findIndex((x) => x.id === id)} of ${ranked.length}`,
            ...half(sp), ...half(lb)];
        }).filter(Boolean);
        const ws = XLSX.utils.aoa_to_sheet([...info, hdr1, hdr2, ...rowsA]);
        const r0 = info.length;
        ws['!merges'] = [
          { s: { r: r0, c: 0 }, e: { r: r0 + 1, c: 0 } },
          { s: { r: r0, c: 1 }, e: { r: r0 + 1, c: 1 } },
          { s: { r: r0, c: 2 }, e: { r: r0, c: 7 } },
          { s: { r: r0, c: 8 }, e: { r: r0, c: 13 } },
        ];
        ws['!cols'] = [{ wch: 26 }, { wch: 10 }, ...Array(12).fill({ wch: 14 })];
        XLSX.utils.book_append_sheet(wb, ws, 'Branch Analysis');

        // Every ticked "Show for selected branches" section becomes a sheet
        if (detailSecs.records) {
          XLSX.utils.book_append_sheet(wb, mkSheet(
            (report.spare_rows || []).filter((r) => selBranches.includes(r.branch_id)),
            fmtDay(report.as_on_part || report.as_on)), 'Spare');
          XLSX.utils.book_append_sheet(wb, mkSheet(
            (report.labour_rows || []).filter((r) => selBranches.includes(r.branch_id)),
            fmtDay(report.as_on_labour || report.as_on)), 'Labour');
        }
        if (branchDetail) {
          const simpleSheet = (name, hdr, data) => {
            const ws2 = XLSX.utils.aoa_to_sheet([...info, hdr, ...data]);
            ws2['!cols'] = hdr.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
            XLSX.utils.book_append_sheet(wb, ws2, name);
          };
          if (detailSecs.weeks) {
            simpleSheet('Week-wise',
              ['Week', 'From', 'To', 'Spare Sale', 'Labour Sale', 'Total', 'Invoices'],
              (branchDetail.weeks || []).map((w) => [
                `Week ${w.week}`, w.start, w.end, L(w.part), L(w.labour), L(w.total), w.invoices]));
          }
          if (detailSecs.months) {
            simpleSheet('Month-wise',
              ['Month', 'Spare Sale', 'Labour Sale', 'Total', 'Invoices'],
              (branchDetail.months || []).map((m) => [
                m.month, L(m.part), L(m.labour), L(m.total), m.invoices]));
          }
          if (detailSecs.segment) {
            simpleSheet('Segment',
              ['Segment', 'Spare Sale', 'Labour Sale', 'Total', 'Invoices'],
              (branchDetail.segment || []).map((r) => [
                r.name, L(r.part), L(r.labour), L(r.total), r.invoices]));
          }
          if (detailSecs.service_head) {
            simpleSheet('Service Head',
              ['Service Head', 'Spare Sale', 'Labour Sale', 'Total', 'Invoices'],
              (branchDetail.service_head || []).map((r) => [
                r.name, L(r.part), L(r.labour), L(r.total), r.invoices]));
          }
          if (detailSecs.category) {
            simpleSheet('Category',
              ['Category', 'Spare Sale', 'Quantity', 'Line Items', 'Invoices'],
              (branchDetail.category || []).map((r) => [
                r.name, L(r.part), Math.round(r.qty || 0), r.lines, r.invoices]));
          }
        }
        // Employee Productivity scoped to the selected branches
        if (detailSecs.employee) {
          try {
            const epRes = await fetch(`${API}/pms/report/employee-productivity`, { headers: authHeaders() });
            const epData = await epRes.json();
            if (epRes.ok && epData.success) {
              const names = selBranches.map((id) => branchOptions.find((b) => b.id === id)?.name || '');
              const epWs = buildEpSheet(XLSX, epData, report.from_date || '', report.as_on || '', names);
              if (epWs) XLSX.utils.book_append_sheet(wb, epWs, 'Employee Productivity');
            }
          } catch { /* best-effort — the rest of the workbook still exports */ }
        }
        XLSX.writeFile(wb, `PMS_Branch_Analysis_${report.as_on}.xlsx`);
        toast.success('Branch-wise report exported');
        return;
      }

      // "All" view — one workbook, Spare + Labour as separate sheets
      if (reportType === 'all') {
        const wb = XLSX.utils.book_new();
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
            L(r.part), pc(r.part, tot.part), L(r.labour), pc(r.labour, tot.labour),
            L(r.total), pc(r.total, tot.total), r.invoices, pc(r.invoices, tot.invoices)]);
          data.push(['Total', L(tot.part), 100, L(tot.labour), 100, L(tot.total), 100, tot.invoices, 100]);
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
          const data = cr.map((r) => [r.name, L(r.part), pc(r.part, ct.part),
            Math.round(r.qty || 0), r.lines, r.invoices, pc(r.invoices, ct.invoices),
            r.invoices ? L(r.part / r.invoices) : null]);
          data.push(['Total', L(ct.part), 100, Math.round(ct.qty), ct.lines, ct.invoices, 100,
            ct.invoices ? L(ct.part / ct.invoices) : null]);
          const ws = XLSX.utils.aoa_to_sheet([...info, hdr, ...data]);
          ws['!cols'] = hdr.map((h) => ({ wch: Math.max(14, String(h).length + 2) }));
          XLSX.utils.book_append_sheet(wb, ws, 'Category');
        }
        // Employee Productivity — same section the All view shows below the
        // tables (its data comes from its own endpoint, so fetch it here)
        try {
          const epRes = await fetch(`${API}/pms/report/employee-productivity`, { headers: authHeaders() });
          const epData = await epRes.json();
          if (epRes.ok && epData.success) {
            const epWs = buildEpSheet(XLSX, epData, report.from_date || '', report.as_on || '');
            if (epWs) XLSX.utils.book_append_sheet(wb, epWs, 'Employee Productivity');
          }
        } catch { /* EP sheet is best-effort — the rest of the workbook still exports */ }
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
        rows = categoryRows.map((r) => [r.name, L(r.part), pc(r.part, ct.part),
          Math.round(r.qty || 0), r.lines, r.invoices, pc(r.invoices, ct.invoices),
          r.invoices ? L(r.part / r.invoices) : null]);
        rows.push(['Total', L(ct.part), 100, Math.round(ct.qty), ct.lines, ct.invoices, 100,
          ct.invoices ? L(ct.part / ct.invoices) : null]);
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
          L(r.part), pc(r.part, bt.part), L(r.labour), pc(r.labour, bt.labour),
          L(r.total), pc(r.total, bt.total), r.invoices, pc(r.invoices, bt.invoices)]);
        rows.push(['Total', L(bt.part), 100, L(bt.labour), 100, L(bt.total), 100, bt.invoices, 100]);
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
            L(r.monthly_target), L(r.daily_target), L(r.achieved_on), L(r.target_till),
            L(r.achieved_till), r.invoice_count_till, r.pct_achieved,
            L(r.short_fall_till), L(r.balance_month),
          ]));
          const s = byRegion[reg].reduce((a, r) => ({
            mt: a.mt + (r.monthly_target || 0), dt: a.dt + (r.daily_target || 0),
            ao: a.ao + (r.achieved_on || 0), tt: a.tt + (r.target_till || 0),
            at: a.at + (r.achieved_till || 0), ic: a.ic + (r.invoice_count_till || 0),
            sf: a.sf + (r.short_fall_till || 0), bm: a.bm + (r.balance_month || 0),
          }), { mt: 0, dt: 0, ao: 0, tt: 0, at: 0, ic: 0, sf: 0, bm: 0 });
          rows.push([
            reg === 'MH' ? 'Maharashtra Total' : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`,
            '', '', L(s.mt), L(s.dt), L(s.ao), L(s.tt), L(s.at), s.ic,
            s.tt ? +(s.at / s.tt * 100).toFixed(1) : '—', L(s.sf), L(s.bm)]);
        });
        rows.push([`Total (All)`, '', '', L(totals.monthly_target), L(totals.daily_target),
          L(totals.achieved_on), L(totals.target_till), L(totals.achieved_till), totals.invoice_count_till,
          totals.target_till ? +(totals.achieved_till / totals.target_till * 100).toFixed(1) : '—',
          L(totals.short_fall_till), L(totals.balance_month)]);
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
      /* Grand-total row of the SPARE / LABOUR tables — green bg, black text
         (region subtotals keep their normal style) */
      .pms-grand-total td { background-color: #86efac !important; color: #111827 !important; }
      /* Dark theme — muted green fill with bright readable text, same
         treatment as the other dark-mode accent fills */
      html.dark .pms-grand-total td { background-color: rgba(34,197,94,0.30) !important; color: #e6e9ef !important; }
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
          {/* Steps — plain text only; hidden on phones where it crowds the row */}
          <span className="ml-auto text-right text-[11px] font-bold text-gray-700 max-md:hidden">
            Upload files → Preview data → Generate report → Save
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
            {/* Period picker + Generate — one row. The picker opens on hover
                and closes when the mouse leaves (click still toggles). */}
            <div className="mt-2 flex items-center gap-2">
              <div className="relative flex-1 min-w-0"
                onMouseEnter={() => dataRange.max && setShowRangePicker(true)}
                onMouseLeave={() => setShowRangePicker(false)}>
              <button onClick={() => setShowRangePicker(!showRangePicker)} disabled={!dataRange.max}
                className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                style={{ backgroundColor: themeColor }}>
                <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {fromDate && toDate ? `${fmtDayYr(fromDate)} → ${fmtDayYr(toDate)}` : 'Select period'}
                </span>
                <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showRangePicker ? 'rotate-180' : ''}`} />
              </button>

              {showRangePicker && (
                /* pt-2 (not a margin) keeps the hover unbroken across the gap */
                <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2">
                  <div className="sm:w-[440px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200">
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
                </div>
              )}
              </div>
              <button onClick={() => generate()} disabled={generating || !dataRange.max}
                className="flex-shrink-0 flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white rounded-full shadow-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                {generating ? 'Generating…' : 'Generate →'}
              </button>
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
          <div className="relative max-md:w-full">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text" value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              placeholder="Search Claim Invoice No…"
              className="pl-7 pr-6 py-1 w-52 max-md:w-full text-[11px] bg-white text-gray-800 border border-gray-300 rounded-md outline-none focus:ring-1"
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
                ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
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
                  : (k === 'cancelled' && cancelledTotal ? 'bg-white text-amber-700 hover:bg-amber-50' : 'bg-white text-gray-600 hover:bg-gray-50')}`}
                style={previewCancelFilter === k && k !== 'cancelled' ? { backgroundColor: themeColor } : {}}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={() => loadPreview(previewType)} title="Refresh"
            className="p-1 rounded bg-white border border-gray-300 text-gray-500 hover:bg-gray-50">
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
                        <button onClick={() => toggleRowCancel(r)}
                          disabled={cancelBusy === r.id}
                          title={`Cancelled${r.cancelled_by ? ` by ${r.cancelled_by}` : ''}${r.cancelled_at ? ` on ${r.cancelled_at.slice(0, 10)}` : ''} — not counted in reports. Click to restore.`}
                          className="text-[10px] font-medium text-sky-700 border border-sky-300 bg-sky-50 rounded px-1.5 py-0.5 hover:bg-sky-100 disabled:opacity-40">
                          Restore
                        </button>
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
        <div className="pms-print-area bg-white rounded-2xl border border-gray-200 mb-3 overflow-visible">
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
            {!isEmpProd && (
              <button onClick={saveToHistory} disabled={savingReport}
                className="pms-no-print flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                <BookmarkSquareIcon className="h-3.5 w-3.5" /> {savingReport ? 'Saving…' : 'Save to History'}
              </button>
            )}
            {canExport && !isEmpProd && (
              <button onClick={exportReport}
                className="pms-no-print flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
              </button>
            )}
          </div>

          {/* Summary tiles — Spare / Labour % vs the AOP Master target get
              their own boxes */}
          <div className="p-2 space-y-1.5">
            {['spare', 'labour'].map((ty) => {
              const sm = report.summary;
              const isSp = ty === 'spare';
              const nm = isSp ? 'Spare' : 'Labour';
              const sale = isSp ? sm.total_spare_sale : sm.total_labour_sale;
              const target = isSp ? sm.total_spare_target : sm.total_labour_target;
              const inv = ((isSp ? report.spare_rows : report.labour_rows) || [])
                .reduce((a, r) => a + (r.invoice_count_till || 0), 0);
              const rr = runRateBy?.[ty];
              return (
                <div key={ty} className="grid grid-cols-6 max-xl:grid-cols-3 max-md:grid-cols-2 gap-1.5">
                  {[
                    [`${nm} Target`, target ? '₹ ' + lakh(target) : '— (no target)', null],
                    [`Total ${nm} Sale`, '₹ ' + lakh(sale), null],
                    [`${nm} % vs AOP Target`, target
                      ? (sale / target * 100).toFixed(1) + ' %' : '— (no target)', null],
                    [`${nm} Invoices`, inr(inv), null],
                    [`Current ${nm} Run-Rate`, rr ? '₹ ' + lakh(rr.cur) + ' /day' : '—', null],
                    [`Required ${nm} Run-Rate`, rr ? '₹ ' + lakh(rr.req) + ' /day' : '—', null],
                  ].map(([label, value, sub]) => (
                    <div key={label} className="border border-gray-200 rounded-lg px-2 py-2 min-w-0">
                      <p className="text-[11px] text-gray-500 leading-tight whitespace-nowrap overflow-hidden text-ellipsis" title={label}>{label}</p>
                      <p className="text-lg font-bold leading-snug pms-accent whitespace-nowrap overflow-hidden text-ellipsis" title={String(value)}>{value}</p>
                      {sub && <p className="text-[10px] text-gray-500 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{sub}</p>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Report type + region filter */}
          <div className="px-3 pb-2 flex flex-wrap items-end gap-2">
            {!branchMode && (
              <div className="flex flex-col">
                <label className="text-[10px] font-medium text-gray-500 mb-0.5">Select report type</label>
                <HoverSelect value={reportType} onChange={setReportType}
                  options={REPORT_TYPES.map((t) => ({ value: t.key, label: t.name }))} />
              </div>
            )}
            {reportType === 'all' && !branchMode && (
              <div className="flex flex-col ml-auto">
                <label className="text-[10px] font-medium text-gray-500 mb-0.5">Region</label>
                <HoverSelect value={allRegion} onChange={setAllRegion}
                  options={[
                    { value: 'All', label: 'All Regions' },
                    { value: 'MH', label: 'MH' },
                    { value: 'KA', label: 'KA' },
                  ]} />
              </div>
            )}
            {/* Branch-wise Report tab — its own view: pick branches, see ONLY
                their analysis. While active the report-type dropdown is hidden
                and this button becomes the way back to all records. */}
            <button onClick={() => setBranchMode(!branchMode)}
              className={`${branchMode || reportType === 'all' ? '' : 'ml-auto'} px-2.5 py-1.5 rounded-md text-[11px] font-semibold border ${branchMode
                ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              style={branchMode ? { backgroundColor: themeColor } : {}}>
              {branchMode ? '← All Records' : 'Branch-wise Report'}
            </button>
            {branchMode && (
              // Opens on hover, closes when the mouse leaves (click still toggles)
              <div className="flex flex-col relative"
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
                    <div className="absolute left-0 top-full z-50 pt-1 w-60 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl p-1.5">
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
          {branchMode && selBranches.length === 0 && (
            <div className="mx-3 mb-3 border border-gray-200 rounded-lg p-6 text-center text-xs text-gray-500">
              Branch-wise Report — pick one or more branches from the
              <b> Branch (multi-select)</b> dropdown above to see their records.
            </div>
          )}
          {branchMode && selBranches.length >= 1 && (() => {
            // Rank by combined Spare + Labour Achi. Till among ALL branches
            const allIds = [...new Set([...(report.spare_rows || []), ...(report.labour_rows || [])]
              .map((r) => r.branch_id))];
            const totalOf = (id) =>
              ((report.spare_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0) +
              ((report.labour_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0);
            const ranked = allIds.map((id) => ({ id, t: totalOf(id) })).sort((a, b) => b.t - a.t);
            const rankOf = (id) => 1 + ranked.findIndex((r) => r.id === id);
            // Per-type run-rate of one branch row (same formula as the tiles)
            const rrOf = (r) => {
              if (!r || !r.daily_target || !r.monthly_target) return null;
              const totalWd = r.monthly_target / r.daily_target;
              const elapsedWd = Math.min(totalWd, (r.target_till || 0) / r.daily_target);
              const remWd = Math.max(0, totalWd - elapsedWd);
              return {
                req: remWd > 0 ? Math.max(0, r.monthly_target - (r.achieved_till || 0)) / remWd : 0,
                cur: elapsedWd > 0 ? (r.achieved_till || 0) / elapsedWd : 0,
              };
            };
            const rowsB = selBranches.map((id) => {
              const sp = (report.spare_rows || []).find((r) => r.branch_id === id);
              const lb = (report.labour_rows || []).find((r) => r.branch_id === id);
              const base = sp || lb;
              if (!base) return null;
              const spSale = sp?.achieved_till || 0, spTgt = sp?.monthly_target || 0;
              const lbSale = lb?.achieved_till || 0, lbTgt = lb?.monthly_target || 0;
              return {
                id, rank: rankOf(id), rankOutOf: ranked.length,
                name: base.branch_name, region: base.region, person: base.responsible_person,
                spSale, spTgt, spPct: spTgt ? spSale / spTgt * 100 : null,
                lbSale, lbTgt, lbPct: lbTgt ? lbSale / lbTgt * 100 : null,
                spInv: sp?.invoice_count_till || 0, lbInv: lb?.invoice_count_till || 0,
                spRR: rrOf(sp), lbRR: rrOf(lb),
              };
            }).filter(Boolean);
            return (
              <div className="mx-3 mb-2 rounded-xl border overflow-hidden"
                style={{ borderColor: 'rgba(47,49,146,0.25)' }}>
                <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                  style={{ backgroundColor: themeColor }}>
                  <span>Branch Analysis — {rowsB.length} branch{rowsB.length > 1 ? 'es' : ''} selected</span>
                  <span className="font-medium text-white/80">Values in Lakh ₹</span>
                </div>
                {/* Per-section checkboxes — each report of THIS selection can
                    be shown/hidden independently */}
                <div className="px-2 py-1.5 border-b border-gray-200 bg-gray-50/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-[11px] font-semibold text-gray-700">Show for selected branches:</span>
                  {[['records', 'Spare & Labour records'],
                    ['weeks', 'Week-wise'], ['months', 'Month-wise'], ['segment', 'Segment-wise'],
                    ['service_head', 'Service Report Type-wise'], ['category', 'Category-wise (Spare)'],
                    ['employee', 'Employee Productivity']].map(([k, n]) => (
                    <label key={k} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer select-none">
                      <input type="checkbox" checked={detailSecs[k]}
                        onChange={() => setDetailSecs((p) => ({ ...p, [k]: !p[k] }))}
                        className="h-3 w-3 cursor-pointer" style={{ accentColor: themeColor }} />
                      {n}
                    </label>
                  ))}
                  {branchDetailLoading && <span className="text-[11px] text-gray-400">Loading…</span>}
                </div>
                <HScrollBox watch={`analysis-${rowsB.length}`}>
                  <table className="w-full text-[11px] border-collapse min-w-[1160px]">
                    <thead>
                      <tr>
                        <th className={`${thT} text-left`} rowSpan={2} style={{ width: 100, maxWidth: 100 }}>Branch</th>
                        <th className={thT} rowSpan={2}>Rank</th>
                        <th className={thT} colSpan={6}>SPARE</th>
                        <th className={thT} colSpan={6}>LABOUR</th>
                      </tr>
                      <tr>
                        {['Target', 'Total Sale', '% vs AOP Target', 'Invoices', 'Current Run-Rate', 'Required Run-Rate',
                          'Target', 'Total Sale', '% vs AOP Target', 'Invoices', 'Current Run-Rate', 'Required Run-Rate']
                          .map((h, i) => <th key={i} className={thT}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rowsB.map((b) => {
                        const half = (tgt, sale, pct, inv, rr) => (
                          <>
                            <td className={`${tdT} text-right`}>{tgt ? `${lkh(tgt)} L` : '—'}</td>
                            <td className={`${tdT} text-right`}>{lkh(sale)} L</td>
                            <td className={`${tdT} text-right font-semibold ${pctCellCls(pct)}`}>
                              {pct == null ? '—' : pct.toFixed(1) + ' %'}
                            </td>
                            <td className={`${tdT} text-right`}>{inr(inv)}</td>
                            <td className={`${tdT} text-right`}>{rr ? `${lkh(rr.cur)} L /day` : '—'}</td>
                            <td className={`${tdT} text-right`}>{rr ? `${lkh(rr.req)} L /day` : '—'}</td>
                          </>
                        );
                        return (
                          <tr key={b.id} className="hover:bg-gray-50/60">
                            <td className={`${tdT} font-medium`} style={{ maxWidth: 100, whiteSpace: 'normal' }}
                              title={b.person || ''}>
                              <div className="leading-tight break-words">
                                {b.name} <span className="text-gray-400">({b.region})</span>
                              </div>
                            </td>
                            <td className={`${tdT} text-center font-bold pms-accent`}>
                              #{b.rank} <span className="font-normal text-gray-400">of {b.rankOutOf}</span>
                            </td>
                            {half(b.spTgt, b.spSale, b.spPct, b.spInv, b.spRR)}
                            {half(b.lbTgt, b.lbSale, b.lbPct, b.lbInv, b.lbRR)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </HScrollBox>

                {/* SPARE / LABOUR branch tables scoped to ONLY the selected
                    branches — same layout as the All view's side-by-side pair */}
                {detailSecs.records && (
                  <div className="p-2">
                    {renderMergedPair(
                      (report.spare_rows || []).filter((r) => selBranches.includes(r.branch_id)),
                      (report.labour_rows || []).filter((r) => selBranches.includes(r.branch_id)))}
                  </div>
                )}

                {/* ===== Selected-branch detail: week-wise + BOTH spares &
                    labour + the three breakdowns, ONLY this selection ===== */}
                {anyDetailSec && branchDetail && (() => {
                  const dL = (v) => ((Number(v) || 0) / 100000).toFixed(2) + ' L';
                  const dP = (v, t) => (t ? ((v / t) * 100).toFixed(1) + ' %' : '—');
                  const fmtD = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                  const wk = branchDetail.weeks || [];
                  const wTot = wk.reduce((a, w) => ({
                    part: a.part + (w.part || 0), labour: a.labour + (w.labour || 0),
                    total: a.total + (w.total || 0), invoices: a.invoices + (w.invoices || 0),
                  }), { part: 0, labour: 0, total: 0, invoices: 0 });
                  const secHead = (title) => (
                    <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                      style={{ backgroundColor: themeColor }}>
                      <span>{title}</span>
                      <span className="font-medium text-white/80">Selected branches only · Lakh ₹</span>
                    </div>
                  );
                  // Segment / Service-head table (both spares + labour)
                  const bdTable = (title, rows3) => {
                    const t3 = (rows3 || []).reduce((a, r) => ({
                      part: a.part + (r.part || 0), labour: a.labour + (r.labour || 0),
                      total: a.total + (r.total || 0), invoices: a.invoices + (r.invoices || 0),
                    }), { part: 0, labour: 0, total: 0, invoices: 0 });
                    return (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        {secHead(title)}
                        <HScrollBox watch={`${title}-${(rows3 || []).length}`}>
                          <table className="w-full text-[11px] border-collapse min-w-[680px]">
                            <thead><tr>
                              {['Name', 'Spare Sale', '% Spare', 'Labour Sale', '% Labour',
                                'Total', '% Total', 'Invoices'].map((h) => (
                                <th key={h} className={`${thT} whitespace-nowrap`}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {(rows3 || []).length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-3 text-gray-500 border border-gray-200">No data</td></tr>
                              ) : (
                                <>
                                  {rows3.map((r, i) => (
                                    <tr key={i} className="hover:bg-gray-50/60">
                                      <td className={`${tdT} font-medium text-center`}>{r.name}</td>
                                      <td className={`${tdT} text-right`}>{dL(r.part)}</td>
                                      <td className={`${tdT} text-right`}>{dP(r.part, t3.part)}</td>
                                      <td className={`${tdT} text-right`}>{dL(r.labour)}</td>
                                      <td className={`${tdT} text-right`}>{dP(r.labour, t3.labour)}</td>
                                      <td className={`${tdT} text-right font-semibold`}>{dL(r.total)}</td>
                                      <td className={`${tdT} text-right`}>{dP(r.total, t3.total)}</td>
                                      <td className={`${tdT} text-right`}>{inr(r.invoices)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-gray-50 font-bold">
                                    <td className={`${tdT} text-center`}>Total</td>
                                    <td className={`${tdT} text-right`}>{dL(t3.part)}</td>
                                    <td className={`${tdT} text-right`}>100 %</td>
                                    <td className={`${tdT} text-right`}>{dL(t3.labour)}</td>
                                    <td className={`${tdT} text-right`}>100 %</td>
                                    <td className={`${tdT} text-right`}>{dL(t3.total)}</td>
                                    <td className={`${tdT} text-right`}>100 %</td>
                                    <td className={`${tdT} text-right`}>{inr(t3.invoices)}</td>
                                  </tr>
                                </>
                              )}
                            </tbody>
                          </table>
                        </HScrollBox>
                      </div>
                    );
                  };
                  const cRows = branchDetail.category || [];
                  const cTot = cRows.reduce((a, r) => ({
                    part: a.part + (r.part || 0), qty: a.qty + (r.qty || 0),
                    lines: a.lines + (r.lines || 0), invoices: a.invoices + (r.invoices || 0),
                  }), { part: 0, qty: 0, lines: 0, invoices: 0 });
                  return (
                    <div className="p-2 space-y-2 border-t border-gray-200">
                      {/* -------- Week-wise (both Spares + Labour) -------- */}
                      {detailSecs.weeks && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        {secHead(`Week-wise Sales — ${wk.length} week${wk.length > 1 ? 's' : ''} in period`)}
                        <HScrollBox watch={`weeks-${wk.length}`}>
                          <table className="w-full text-[11px] border-collapse min-w-[720px]">
                            <thead><tr>
                              <th className={thT}>Week</th>
                              <th className={thT}>Period</th>
                              <th className={thT}>Spare Sale</th>
                              <th className={thT}>% Spare</th>
                              <th className={thT}>Labour Sale</th>
                              <th className={thT}>% Labour</th>
                              <th className={thT}>Total</th>
                              <th className={thT}>% Total</th>
                              <th className={thT}>Invoices</th>
                            </tr></thead>
                            <tbody>
                              {wk.map((w) => (
                                <tr key={w.week} className="hover:bg-gray-50/60">
                                  <td className={`${tdT} font-medium text-center`}>Week {w.week}</td>
                                  <td className={`${tdT} text-center`}>{fmtD(w.start)} – {fmtD(w.end)}</td>
                                  <td className={`${tdT} text-right`}>{dL(w.part)}</td>
                                  <td className={`${tdT} text-right`}>{dP(w.part, wTot.part)}</td>
                                  <td className={`${tdT} text-right`}>{dL(w.labour)}</td>
                                  <td className={`${tdT} text-right`}>{dP(w.labour, wTot.labour)}</td>
                                  <td className={`${tdT} text-right font-semibold`}>{dL(w.total)}</td>
                                  <td className={`${tdT} text-right`}>{dP(w.total, wTot.total)}</td>
                                  <td className={`${tdT} text-right`}>{inr(w.invoices)}</td>
                                </tr>
                              ))}
                              <tr className="bg-gray-50 font-bold">
                                <td className={`${tdT} text-center`} colSpan={2}>Total</td>
                                <td className={`${tdT} text-right`}>{dL(wTot.part)}</td>
                                <td className={`${tdT} text-right`}>100 %</td>
                                <td className={`${tdT} text-right`}>{dL(wTot.labour)}</td>
                                <td className={`${tdT} text-right`}>100 %</td>
                                <td className={`${tdT} text-right`}>{dL(wTot.total)}</td>
                                <td className={`${tdT} text-right`}>100 %</td>
                                <td className={`${tdT} text-right`}>{inr(wTot.invoices)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </HScrollBox>
                      </div>
                      )}
                      {/* -------- Month-wise (both Spares + Labour) -------- */}
                      {detailSecs.months && (() => {
                        const mo = branchDetail.months || [];
                        const mTot = mo.reduce((a, m) => ({
                          part: a.part + (m.part || 0), labour: a.labour + (m.labour || 0),
                          total: a.total + (m.total || 0), invoices: a.invoices + (m.invoices || 0),
                        }), { part: 0, labour: 0, total: 0, invoices: 0 });
                        const mLabel = (m) => new Date(`${m}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                        return (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            {secHead(`Month-wise Sales — ${mo.length} month${mo.length > 1 ? 's' : ''} in period`)}
                            <HScrollBox watch={`months-${mo.length}`}>
                              <table className="w-full text-[11px] border-collapse min-w-[680px]">
                                <thead><tr>
                                  <th className={thT}>Month</th>
                                  <th className={thT}>Spare Sale</th>
                                  <th className={thT}>% Spare</th>
                                  <th className={thT}>Labour Sale</th>
                                  <th className={thT}>% Labour</th>
                                  <th className={thT}>Total</th>
                                  <th className={thT}>% Total</th>
                                  <th className={thT}>Invoices</th>
                                </tr></thead>
                                <tbody>
                                  {mo.length === 0 ? (
                                    <tr><td colSpan={8} className="text-center py-3 text-gray-500 border border-gray-200">No data</td></tr>
                                  ) : (
                                    <>
                                      {mo.map((m) => (
                                        <tr key={m.month} className="hover:bg-gray-50/60">
                                          <td className={`${tdT} font-medium text-center`}>{mLabel(m.month)}</td>
                                          <td className={`${tdT} text-right`}>{dL(m.part)}</td>
                                          <td className={`${tdT} text-right`}>{dP(m.part, mTot.part)}</td>
                                          <td className={`${tdT} text-right`}>{dL(m.labour)}</td>
                                          <td className={`${tdT} text-right`}>{dP(m.labour, mTot.labour)}</td>
                                          <td className={`${tdT} text-right font-semibold`}>{dL(m.total)}</td>
                                          <td className={`${tdT} text-right`}>{dP(m.total, mTot.total)}</td>
                                          <td className={`${tdT} text-right`}>{inr(m.invoices)}</td>
                                        </tr>
                                      ))}
                                      <tr className="bg-gray-50 font-bold">
                                        <td className={`${tdT} text-center`}>Total</td>
                                        <td className={`${tdT} text-right`}>{dL(mTot.part)}</td>
                                        <td className={`${tdT} text-right`}>100 %</td>
                                        <td className={`${tdT} text-right`}>{dL(mTot.labour)}</td>
                                        <td className={`${tdT} text-right`}>100 %</td>
                                        <td className={`${tdT} text-right`}>{dL(mTot.total)}</td>
                                        <td className={`${tdT} text-right`}>100 %</td>
                                        <td className={`${tdT} text-right`}>{inr(mTot.invoices)}</td>
                                      </tr>
                                    </>
                                  )}
                                </tbody>
                              </table>
                            </HScrollBox>
                          </div>
                        );
                      })()}
                      {/* -------- Breakdowns scoped to the selection -------- */}
                      {detailSecs.segment && bdTable('Segment-wise Sales', branchDetail.segment)}
                      {detailSecs.service_head && bdTable('Service Report Type-wise Sales', branchDetail.service_head)}
                      {detailSecs.category && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        {secHead('Category-wise Sales (Spare)')}
                        <HScrollBox watch={`bd-category-${cRows.length}`}>
                          <table className="w-full text-[11px] border-collapse min-w-[560px]">
                            <thead><tr>
                              <th className={thT}>Category</th>
                              <th className={thT}>Spare Sale</th>
                              <th className={thT}>% Spare</th>
                              <th className={thT}>Quantity</th>
                              <th className={thT}>Line Items</th>
                              <th className={thT}>Invoices</th>
                            </tr></thead>
                            <tbody>
                              {cRows.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-3 text-gray-500 border border-gray-200">No data</td></tr>
                              ) : (
                                <>
                                  {cRows.map((r, i) => (
                                    <tr key={i} className="hover:bg-gray-50/60">
                                      <td className={`${tdT} font-medium text-center`}>{r.name}</td>
                                      <td className={`${tdT} text-right`}>{dL(r.part)}</td>
                                      <td className={`${tdT} text-right`}>{dP(r.part, cTot.part)}</td>
                                      <td className={`${tdT} text-right`}>{inr(Math.round(r.qty || 0))}</td>
                                      <td className={`${tdT} text-right`}>{inr(r.lines)}</td>
                                      <td className={`${tdT} text-right`}>{inr(r.invoices)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-gray-50 font-bold">
                                    <td className={`${tdT} text-center`}>Total</td>
                                    <td className={`${tdT} text-right`}>{dL(cTot.part)}</td>
                                    <td className={`${tdT} text-right`}>100 %</td>
                                    <td className={`${tdT} text-right`}>{inr(Math.round(cTot.qty))}</td>
                                    <td className={`${tdT} text-right`}>{inr(cTot.lines)}</td>
                                    <td className={`${tdT} text-right`}>{inr(cTot.invoices)}</td>
                                  </tr>
                                </>
                              )}
                            </tbody>
                          </table>
                        </HScrollBox>
                      </div>
                      )}
                    </div>
                  );
                })()}

                {/* Employee Productivity scoped to ONLY the selected branches
                    — LAST, matching its position in the checkbox row */}
                {detailSecs.employee && (
                  <div className="p-2">
                    <EmployeeProductivityReport
                      periodFrom={report.from_date || ''} periodTo={report.as_on || ''}
                      onlyBranches={selBranches.map((id) => branchOptions.find((b) => b.id === id)?.name || '')} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* "All" — every report in one frame: Spare + Labour side by side,
              then the three breakdown tables below */}
          {!branchMode && reportType === 'all' && (() => {
            // One shared column grid for the stacked breakdown tables
            // (Regional / Segment / Service Head) so their vertical column
            // lines sit at the same position in every table. Category keeps
            // its own natural layout (different column set).
            const breakColgroup = (
              <colgroup>
                <col style={{ width: '16%' }} />
                {Array.from({ length: 8 }, (_, ci) => (
                  <col key={ci} style={{ width: '10.5%' }} />
                ))}
              </colgroup>
            );
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
                    <table className="w-full text-[11px] border-collapse min-w-[640px]" style={{ tableLayout: 'fixed' }}>
                      {breakColgroup}
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
                {renderMergedPair(report.spare_rows, report.labour_rows)}
                {renderAllBreakdown('Regional-wise Sales', report.regional)}
                {renderAllBreakdown('Segment-wise Sales', report.segment)}
                {renderAllBreakdown('Service Report Type-wise Sales', report.service_head)}
                {renderAllCategory()}
                {/* Employee Productivity — SE-wise, same reporting period */}
                <EmployeeProductivityReport
                  periodFrom={report.from_date || ''}
                  periodTo={report.as_on || ''} />
              </div>
            );
          })()}

          {/* Branch table (Spare / Labour) — pivot layout: Region first with a
              merged cell per region (MH then KA), each region followed by its
              own subtotal row, then the grand total. */}
          {/* ===== Employee Productivity (SE-wise) — uses the SAME reporting
              period the report above was generated with (top period picker) ===== */}
          {!branchMode && isEmpProd && (
            <div className="px-3 pb-3">
              <EmployeeProductivityReport
                periodFrom={report.from_date || ''}
                periodTo={report.as_on || ''} />
            </div>
          )}

          {!branchMode && !breakdownRows && !categoryRows && reportType !== 'all' && !isEmpProd && (
            <div className="px-3 pb-3">
              <p className="text-[10px] text-gray-400 text-right mb-1">Values in Lakh ₹ — 23 means ₹23,00,000</p>
              <HScrollBox watch={`${reportType}-${branchRows.length}`}>
              <table className="w-full text-[11px] border-collapse min-w-[900px]">
                <thead><tr>
                  <th className={thT}>Region</th>
                  <th className={thT} style={{ width: 100, maxWidth: 100 }}>Branch</th>
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
                        {regionKeys.map((reg, ri) => {
                          const rows = byRegion[reg];
                          const sub = sumRows(rows);
                          return (
                            <React.Fragment key={reg}>
                              {/* one-row gap between region blocks (MH ↔ KA) */}
                              {ri > 0 && (
                                <tr aria-hidden="true"><td colSpan={12} className="py-1.5" /></tr>
                              )}
                              {rows.map((r, i) => (
                                <tr key={r.branch_id} className="hover:bg-gray-50/60">
                                  {i === 0 && (
                                    <td rowSpan={rows.length}
                                      className={`${tdT} text-center font-bold align-middle pms-region-cell`}>
                                      {reg}
                                    </td>
                                  )}
                                  <td className={tdT} style={{ maxWidth: 100 }} title={r.branch_name || ''}>
                                    <div className="truncate">{r.branch_name}</div>
                                  </td>
                                  <td className={tdT} title={r.responsible_person || ''}>{shortName(r.responsible_person)}</td>
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
                        <tr className="font-bold pms-grand-total">
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
          {!branchMode && breakdownRows && (() => {
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
          {!branchMode && categoryRows && (() => {
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
          <div className="bg-white rounded-lg shadow-2xl max-w-[86rem] w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex flex-wrap items-center gap-2">
              {historyDetail && (
                <button onClick={() => setHistoryDetail(null)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50">
                  ← Back to list
                </button>
              )}
              <h2 className="text-sm font-semibold text-gray-900 flex-1 truncate">
                {historyDetail ? historyDetail.title : 'Report History'}
              </h2>
              {/* List filters — live in the header, right side */}
              {!historyDetail && !historyLoading && history.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className="text-[10px] font-medium text-gray-500">As on</span>
                  <input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)}
                    title="As on — from"
                    className="border border-gray-300 rounded px-1.5 py-1 text-[11px] text-black bg-white focus:outline-none focus:ring-1"
                    style={{ '--tw-ring-color': themeColor }} />
                  <span className="text-[10px] text-gray-400">to</span>
                  <input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)}
                    title="As on — to"
                    className="border border-gray-300 rounded px-1.5 py-1 text-[11px] text-black bg-white focus:outline-none focus:ring-1"
                    style={{ '--tw-ring-color': themeColor }} />
                  <div title="Generated by" className="max-w-[140px]">
                    <HoverSelect value={histBy} onChange={setHistBy}
                      options={[
                        { value: '', label: 'All users' },
                        ...[...new Set(history.map((h) => h.created_by_name || h.created_by).filter(Boolean))]
                          .map((n) => ({ value: n, label: n })),
                      ]} />
                  </div>
                  {(histFrom || histTo || histBy) && (
                    <button onClick={() => { setHistFrom(''); setHistTo(''); setHistBy(''); }}
                      title="Clear filters"
                      className="px-1.5 py-1 text-[11px] font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                      Clear
                    </button>
                  )}
                </div>
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
                ) : (() => {
                  const listRows = history.filter((h) =>
                    (!histFrom || h.as_on_date >= histFrom) &&
                    (!histTo || h.as_on_date <= histTo) &&
                    (!histBy || (h.created_by_name || h.created_by) === histBy));
                  return (
                  <>
                  {listRows.length === 0 ? (
                    <p className="text-center py-6 text-xs text-gray-500">No saved reports match the filters.</p>
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
                      {listRows.map((h) => (
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
                  )}
                  </>
                  );
                })()
              ) : (
                /* ---------- IN-MODAL REPORT VIEWER ---------- */
                (() => {
                  const p = historyDetail.payload;
                  const d = fmtDay(p.as_on);
                  const s = p.summary || {};
                  const hL = (v) => ((Number(v) || 0) / 100000).toFixed(2) + ' L';
                  const hP = (v, t) => (t ? ((v / t) * 100).toFixed(1) + ' %' : '—');
                  // Per-type run-rate — same aggregate formula as the live tiles
                  const rrOfRows = (rows) => {
                    const mt = (rows || []).reduce((a, r) => a + (r.monthly_target || 0), 0);
                    const dt = (rows || []).reduce((a, r) => a + (r.daily_target || 0), 0);
                    const tt = (rows || []).reduce((a, r) => a + (r.target_till || 0), 0);
                    const at = (rows || []).reduce((a, r) => a + (r.achieved_till || 0), 0);
                    if (!dt || !mt) return null;
                    const totalWd = mt / dt;
                    const elapsedWd = Math.min(totalWd, tt / dt);
                    const remWd = Math.max(0, totalWd - elapsedWd);
                    return {
                      req: remWd > 0 ? Math.max(0, mt - at) / remWd : 0,
                      cur: elapsedWd > 0 ? at / elapsedWd : 0,
                    };
                  };
                  // Branch pivot table — same layout as the live report (region
                  // merged cell, region subtotals, grand total, Lakh values)
                  const branchTable = (rows, title) => {
                    const byRegion = {};
                    (rows || []).forEach((r) => { (byRegion[r.region] = byRegion[r.region] || []).push(r); });
                    const regionKeys = ['MH', 'KA'].filter((k) => byRegion[k])
                      .concat(Object.keys(byRegion).filter((k) => k !== 'MH' && k !== 'KA'));
                    const sum = (rs) => rs.reduce((a, r) => ({
                      mt: a.mt + (r.monthly_target || 0), dt: a.dt + (r.daily_target || 0),
                      ao: a.ao + (r.achieved_on || 0), tt: a.tt + (r.target_till || 0),
                      at: a.at + (r.achieved_till || 0), ic: a.ic + (r.invoice_count_till || 0),
                      sf: a.sf + (r.short_fall_till || 0), bm: a.bm + (r.balance_month || 0),
                    }), { mt: 0, dt: 0, ao: 0, tt: 0, at: 0, ic: 0, sf: 0, bm: 0 });
                    // Compact cells (same as the live All view) so the whole
                    // table fits the modal WITHOUT a horizontal scrollbar
                    const hTh = 'px-1 py-1 text-center text-[11px] font-semibold text-gray-600 leading-tight bg-gray-50 border border-gray-200';
                    const hTd = 'px-1 py-0.5 border border-gray-200 text-right whitespace-nowrap';
                    const metric = (x) => (
                      <>
                        <td className={hTd}>{hL(x.mt)}</td>
                        <td className={hTd}>{hL(x.dt)}</td>
                        <td className={hTd}>{hL(x.ao)}</td>
                        <td className={hTd}>{hL(x.tt)}</td>
                        <td className={`${hTd} font-medium`}>{hL(x.at)}</td>
                        <td className={hTd}>{inr(x.ic)}</td>
                        <td className={`${hTd} font-semibold ${pctCellCls(x.tt ? +((x.at / x.tt) * 100).toFixed(1) : null)}`}>
                          {x.tt ? ((x.at / x.tt) * 100).toFixed(1) + ' %' : '—'}
                        </td>
                        <td className={hTd}>{hL(x.sf)}</td>
                        <td className={hTd}>{hL(x.bm)}</td>
                      </>
                    );
                    return (
                      <div className="mt-3">
                        <h3 className="text-xs font-bold text-gray-800 mb-1.5">
                          {title} <span className="font-normal text-gray-400">(Lakh ₹)</span>
                        </h3>
                        {/* fits without a scrollbar on desktop; small screens
                            fall back to horizontal scroll instead of clipping */}
                        <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead><tr>
                            <th className={hTh}>Region</th>
                            <th className={hTh}>Branch</th>
                            <th className={hTh}>Responsible Person</th>
                            <th className={hTh}>Monthly Target</th>
                            <th className={hTh}>Daily Target</th>
                            <th className={hTh}>Achi. on {d}</th>
                            <th className={hTh}>Target Till {d}</th>
                            <th className={hTh}>Achi. Till {d}</th>
                            <th className={hTh}>Invoice Count</th>
                            <th className={hTh}>% Achieved Till Date</th>
                            <th className={hTh}>Short-Fall Till Date</th>
                            <th className={hTh}>Balance For Month</th>
                          </tr></thead>
                          <tbody>
                            {regionKeys.map((reg, ri) => {
                              const rs = byRegion[reg];
                              return (
                                <React.Fragment key={reg}>
                                  {/* one-row gap between region blocks (MH ↔ KA) */}
                                  {ri > 0 && (
                                    <tr aria-hidden="true"><td colSpan={12} className="py-1.5" /></tr>
                                  )}
                                  {rs.map((r, i) => (
                                    <tr key={r.branch_id || i} className="hover:bg-gray-50/60">
                                      {i === 0 && (
                                        <td rowSpan={rs.length}
                                          className="px-1 py-0.5 border border-gray-200 text-center font-bold align-middle pms-region-cell">
                                          {reg}
                                        </td>
                                      )}
                                      <td className="px-1 py-0.5 border border-gray-200 text-left leading-tight break-words max-w-[90px] font-medium">
                                        {r.branch_name}
                                      </td>
                                      <td className="px-1 py-0.5 border border-gray-200 text-left whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]"
                                        title={r.responsible_person || ''}>
                                        {shortName(r.responsible_person)}
                                      </td>
                                      <td className={hTd}>{hL(r.monthly_target)}</td>
                                      <td className={hTd}>{hL(r.daily_target)}</td>
                                      <td className={hTd}>{hL(r.achieved_on)}</td>
                                      <td className={hTd}>{hL(r.target_till)}</td>
                                      <td className={`${hTd} font-medium`}>{hL(r.achieved_till)}</td>
                                      <td className={hTd}>{inr(r.invoice_count_till)}</td>
                                      <td className={`${hTd} font-semibold ${pctCellCls(r.pct_achieved)}`}>
                                        {r.pct_achieved == null ? '—' : r.pct_achieved + ' %'}
                                      </td>
                                      <td className={hTd}>{hL(r.short_fall_till)}</td>
                                      <td className={`${hTd} ${r.balance_month != null && r.balance_month <= 0 ? 'pms-ahead' : ''}`}>
                                        {hL(r.balance_month)}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="font-semibold pms-subtotal-row">
                                    <td className="px-1 py-0.5 border border-gray-200 text-left" colSpan={3}>
                                      {reg === 'MH' ? 'Maharashtra Total' : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`}
                                    </td>
                                    {metric(sum(rs))}
                                  </tr>
                                </React.Fragment>
                              );
                            })}
                            <tr className="font-bold pms-grand-total">
                              <td className="px-1 py-0.5 border border-gray-200 text-left" colSpan={3}>Total (All)</td>
                              {metric(sum(rows || []))}
                            </tr>
                          </tbody>
                        </table>
                        </div>
                      </div>
                    );
                  };
                  // Shared column grid — same vertical column lines in the
                  // stacked breakdown tables (Category keeps its own layout)
                  const histColgroup = (
                    <colgroup>
                      <col style={{ width: '16%' }} />
                      {Array.from({ length: 8 }, (_, ci) => (
                        <col key={ci} style={{ width: '10.5%' }} />
                      ))}
                    </colgroup>
                  );
                  // Breakdown table — full columns with % shares + Total row
                  const breakdownTable = (rows, title, label) => {
                    const t = (rows || []).reduce((a, r) => ({
                      part: a.part + (r.part || 0), labour: a.labour + (r.labour || 0),
                      total: a.total + (r.total || 0), invoices: a.invoices + (r.invoices || 0),
                    }), { part: 0, labour: 0, total: 0, invoices: 0 });
                    return (
                      <div className="mt-3">
                        <h3 className="text-xs font-bold text-gray-800 mb-1.5">
                          {title} <span className="font-normal text-gray-400">(Lakh ₹ · % of total)</span>
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] border-collapse min-w-[640px]" style={{ tableLayout: 'fixed' }}>
                            {histColgroup}
                            <thead><tr>
                              <th className={thCls}>{label}</th>
                              <th className={thCls}>Spare Sale</th>
                              <th className={thCls}>% Spare</th>
                              <th className={thCls}>Labour Sale</th>
                              <th className={thCls}>% Labour</th>
                              <th className={thCls}>Total</th>
                              <th className={thCls}>% Total</th>
                              <th className={thCls}>Invoices</th>
                              <th className={thCls}>% Invoices</th>
                            </tr></thead>
                            <tbody>
                              {(rows || []).map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50/60">
                                  <td className={`${tdCls} font-medium text-center`}>{r.name}</td>
                                  <td className={`${tdCls} text-right`}>{hL(r.part)}</td>
                                  <td className={`${tdCls} text-right`}>{hP(r.part, t.part)}</td>
                                  <td className={`${tdCls} text-right`}>{hL(r.labour)}</td>
                                  <td className={`${tdCls} text-right`}>{hP(r.labour, t.labour)}</td>
                                  <td className={`${tdCls} text-right font-semibold`}>{hL(r.total)}</td>
                                  <td className={`${tdCls} text-right`}>{hP(r.total, t.total)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.invoices)}</td>
                                  <td className={`${tdCls} text-right`}>{hP(r.invoices, t.invoices)}</td>
                                </tr>
                              ))}
                              {(rows || []).length > 0 && (
                                <tr className="bg-gray-50 font-bold">
                                  <td className={`${tdCls} text-center`}>Total</td>
                                  <td className={`${tdCls} text-right`}>{hL(t.part)}</td>
                                  <td className={`${tdCls} text-right`}>100 %</td>
                                  <td className={`${tdCls} text-right`}>{hL(t.labour)}</td>
                                  <td className={`${tdCls} text-right`}>100 %</td>
                                  <td className={`${tdCls} text-right`}>{hL(t.total)}</td>
                                  <td className={`${tdCls} text-right`}>100 %</td>
                                  <td className={`${tdCls} text-right`}>{inr(t.invoices)}</td>
                                  <td className={`${tdCls} text-right`}>100 %</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  };
                  // Category table — Spare only, all columns like the live view
                  const categoryTable = (rows) => {
                    const t = (rows || []).reduce((a, r) => ({
                      part: a.part + (r.part || 0), invoices: a.invoices + (r.invoices || 0),
                      qty: a.qty + (r.qty || 0), lines: a.lines + (r.lines || 0),
                    }), { part: 0, invoices: 0, qty: 0, lines: 0 });
                    return (
                      <div className="mt-3">
                        <h3 className="text-xs font-bold text-gray-800 mb-1.5">
                          Category-wise Sales (Spare) <span className="font-normal text-gray-400">(Spare only · Lakh ₹)</span>
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] border-collapse min-w-[640px]">
                            <thead><tr>
                              <th className={thCls}>Category</th>
                              <th className={thCls}>Spare Sale</th>
                              <th className={thCls}>% Spare</th>
                              <th className={thCls}>Quantity</th>
                              <th className={thCls}>Line Items</th>
                              <th className={thCls}>Invoices</th>
                              <th className={thCls}>% Invoices</th>
                              <th className={thCls}>Avg / Invoice</th>
                            </tr></thead>
                            <tbody>
                              {(rows || []).map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50/60">
                                  <td className={`${tdCls} font-medium text-center`}>{r.name}</td>
                                  <td className={`${tdCls} text-right font-medium`}>{hL(r.part)}</td>
                                  <td className={`${tdCls} text-right`}>{hP(r.part, t.part)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(Math.round(r.qty || 0))}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.lines || 0)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(r.invoices)}</td>
                                  <td className={`${tdCls} text-right`}>{hP(r.invoices, t.invoices)}</td>
                                  <td className={`${tdCls} text-right`}>{r.invoices ? hL(r.part / r.invoices) : '—'}</td>
                                </tr>
                              ))}
                              {(rows || []).length > 0 && (
                                <tr className="bg-gray-50 font-bold">
                                  <td className={`${tdCls} text-center`}>Total</td>
                                  <td className={`${tdCls} text-right`}>{hL(t.part)}</td>
                                  <td className={`${tdCls} text-right`}>100 %</td>
                                  <td className={`${tdCls} text-right`}>{inr(Math.round(t.qty))}</td>
                                  <td className={`${tdCls} text-right`}>{inr(t.lines)}</td>
                                  <td className={`${tdCls} text-right`}>{inr(t.invoices)}</td>
                                  <td className={`${tdCls} text-right`}>100 %</td>
                                  <td className={`${tdCls} text-right`}>{t.invoices ? hL(t.part / t.invoices) : '—'}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  };
                  return (
                    <div>
                      <p className="text-[11px] text-gray-500">
                        As on <b>{fmtFull(p.as_on)}</b>
                        {p.from_date && <> · Period: {fmtDay(p.from_date)} → {fmtDay(p.as_on)}</>}
                        {historyDetail.created_by_name && <> · Generated by <b>{historyDetail.created_by_name}</b></>}
                        {historyDetail.created_at && <> on {new Date(historyDetail.created_at).toLocaleString('en-GB')}</>}
                      </p>
                      {/* Summary tiles — same two-row (Spare / Labour) layout
                          as the live report */}
                      {['spare', 'labour'].map((ty) => {
                        const isSp = ty === 'spare';
                        const nm = isSp ? 'Spare' : 'Labour';
                        const rows = isSp ? p.spare_rows : p.labour_rows;
                        const sale = isSp ? s.total_spare_sale : s.total_labour_sale;
                        const target = isSp ? s.total_spare_target : s.total_labour_target;
                        const inv = (rows || []).reduce((a, r) => a + (r.invoice_count_till || 0), 0);
                        const rr = rrOfRows(rows);
                        return (
                          <div key={ty} className="mt-2 grid grid-cols-6 max-xl:grid-cols-3 max-md:grid-cols-2 gap-2">
                            {[
                              [`${nm} Target`, target ? '₹ ' + lakh(target) : '—'],
                              [`Total ${nm} Sale`, '₹ ' + lakh(sale)],
                              [`${nm} % vs AOP Target`, target
                                ? (sale / target * 100).toFixed(1) + ' %' : '—'],
                              [`${nm} Invoices`, inr(inv)],
                              [`Current ${nm} Run-Rate`, rr ? '₹ ' + lakh(rr.cur) + ' /day' : '—'],
                              [`Required ${nm} Run-Rate`, rr ? '₹ ' + lakh(rr.req) + ' /day' : '—'],
                            ].map(([label, value]) => (
                              <div key={label} className="border border-gray-200 rounded-lg px-2 py-2">
                                <p className="text-[11px] text-gray-500 leading-tight whitespace-nowrap overflow-hidden text-ellipsis" title={label}>{label}</p>
                                <p className="text-base font-bold pms-accent whitespace-nowrap">{value}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                      {branchTable(p.spare_rows, 'Spare Part Sales')}
                      {branchTable(p.labour_rows, 'Labour Sales')}
                      {breakdownTable(p.regional, 'Regional-wise Sales', 'Region')}
                      {breakdownTable(p.segment, 'Segment-wise Sales', 'Segment')}
                      {breakdownTable(p.service_head, 'Service Report Type-wise Sales', 'Service Head')}
                      {categoryTable(p.category)}
                      {/* ---- Branch-wise view saved with the report (as-is) ---- */}
                      {p.branch_view && (() => {
                        const bv = p.branch_view;
                        const ids = bv.branches || [];
                        const secs = bv.secs || {};
                        const det = bv.detail || null;
                        const spSel = (p.spare_rows || []).filter((r) => ids.includes(r.branch_id));
                        const lbSel = (p.labour_rows || []).filter((r) => ids.includes(r.branch_id));
                        const allIds = [...new Set([...(p.spare_rows || []), ...(p.labour_rows || [])]
                          .map((r) => r.branch_id))];
                        const totOf = (id) =>
                          ((p.spare_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0) +
                          ((p.labour_rows || []).find((r) => r.branch_id === id)?.achieved_till || 0);
                        const ranked = allIds.map((id) => ({ id, t: totOf(id) })).sort((a, b) => b.t - a.t);
                        const rrOne = (r) => {
                          if (!r || !r.daily_target || !r.monthly_target) return null;
                          const totalWd = r.monthly_target / r.daily_target;
                          const elapsedWd = Math.min(totalWd, (r.target_till || 0) / r.daily_target);
                          const remWd = Math.max(0, totalWd - elapsedWd);
                          return {
                            req: remWd > 0 ? Math.max(0, r.monthly_target - (r.achieved_till || 0)) / remWd : 0,
                            cur: elapsedWd > 0 ? (r.achieved_till || 0) / elapsedWd : 0,
                          };
                        };
                        const hTd2 = 'px-1 py-0.5 border border-gray-200 text-right whitespace-nowrap';
                        const hLn = (v) => ((Number(v) || 0) / 100000).toFixed(2);
                        const half = (r) => {
                          const rr = rrOne(r);
                          const tgt = r?.monthly_target || 0, sale = r?.achieved_till || 0;
                          const pct = tgt ? +(sale / tgt * 100).toFixed(1) : null;
                          return (
                            <>
                              <td className={hTd2}>{hLn(tgt)} L</td>
                              <td className={hTd2}>{hLn(sale)} L</td>
                              <td className={`${hTd2} font-semibold ${pctCellCls(pct)}`}>
                                {pct == null ? '—' : pct + ' %'}
                              </td>
                              <td className={hTd2}>{inr(r?.invoice_count_till || 0)}</td>
                              <td className={hTd2}>{rr ? `${hLn(rr.cur)} L /day` : '—'}</td>
                              <td className={hTd2}>{rr ? `${hLn(rr.req)} L /day` : '—'}</td>
                            </>
                          );
                        };
                        const miniTable = (title, hdrs, rows2) => (
                          <div className="mt-3">
                            <h3 className="text-xs font-bold text-gray-800 mb-1.5">
                              {title} <span className="font-normal text-gray-400">(Lakh ₹ · selected branches)</span>
                            </h3>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[11px] border-collapse min-w-[520px]">
                                <thead><tr>{hdrs.map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                                <tbody>
                                  {rows2.map((cells, i) => (
                                    <tr key={i} className="hover:bg-gray-50/60">
                                      {cells.map((c, j) => (
                                        <td key={j} className={`${tdCls} ${j === 0 ? 'text-center font-medium' : 'text-right'}`}>{c}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                        return (
                          <div className="mt-4 pt-3 border-t-2 border-gray-200">
                            <h3 className="text-xs font-bold text-gray-800 mb-1.5">
                              Branch Analysis — {ids.length} branch{ids.length > 1 ? 'es' : ''} saved{' '}
                              <span className="font-normal text-gray-400">(Values in Lakh ₹)</span>
                            </h3>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[11px] border-collapse min-w-[1100px]">
                                <thead>
                                  <tr>
                                    <th className={`${thCls} text-left`} rowSpan={2}
                                      style={{ width: 130, minWidth: 130 }}>Branch</th>
                                    <th className={thCls} rowSpan={2} style={{ width: 80, minWidth: 80 }}>Rank</th>
                                    <th className={thCls} colSpan={6}>SPARE</th>
                                    <th className={thCls} colSpan={6}>LABOUR</th>
                                  </tr>
                                  <tr>
                                    {['Target', 'Total Sale', '% vs AOP Target', 'Invoices', 'Current Run-Rate', 'Required Run-Rate',
                                      'Target', 'Total Sale', '% vs AOP Target', 'Invoices', 'Current Run-Rate', 'Required Run-Rate']
                                      .map((h, i) => <th key={i} className={thCls}>{h}</th>)}
                                  </tr>
                                </thead>
                                <tbody>
                                  {ids.map((id) => {
                                    const sp = (p.spare_rows || []).find((r) => r.branch_id === id);
                                    const lb = (p.labour_rows || []).find((r) => r.branch_id === id);
                                    const base = sp || lb;
                                    if (!base) return null;
                                    return (
                                      <tr key={id} className="hover:bg-gray-50/60">
                                        <td className={`${tdCls} font-medium`} style={{ maxWidth: 130 }}
                                          title={`${base.branch_name} (${base.region})`}>
                                          <div className="truncate leading-tight">
                                            {base.branch_name} <span className="text-gray-400">({base.region})</span>
                                          </div>
                                        </td>
                                        <td className={`${tdCls} text-center font-bold pms-accent whitespace-nowrap`}>
                                          #{1 + ranked.findIndex((x) => x.id === id)}{' '}
                                          <span className="font-normal text-gray-400">of {ranked.length}</span>
                                        </td>
                                        {half(sp)}
                                        {half(lb)}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {secs.records && branchTable(spSel, 'Spare — selected branches')}
                            {secs.records && branchTable(lbSel, 'Labour — selected branches')}
                            {det && secs.weeks && miniTable('Week-wise Sales',
                              ['Week', 'Period', 'Spare Sale', 'Labour Sale', 'Total', 'Invoices'],
                              (det.weeks || []).map((w) => [
                                `Week ${w.week}`, `${w.start} → ${w.end}`,
                                hLn(w.part), hLn(w.labour), hLn(w.total), inr(w.invoices)]))}
                            {det && secs.months && miniTable('Month-wise Sales',
                              ['Month', 'Spare Sale', 'Labour Sale', 'Total', 'Invoices'],
                              (det.months || []).map((m) => [
                                m.month, hLn(m.part), hLn(m.labour), hLn(m.total), inr(m.invoices)]))}
                            {det && secs.segment && breakdownTable(det.segment, 'Segment-wise Sales — selected branches', 'Segment')}
                            {det && secs.service_head && breakdownTable(det.service_head, 'Service Report Type-wise Sales — selected branches', 'Service Head')}
                            {det && secs.category && categoryTable(det.category)}
                            {secs.employee && p.emp_productivity && (
                              <div className="mt-3">
                                <EmployeeProductivityReport
                                  preloaded={p.emp_productivity}
                                  periodFrom={p.from_date || ''}
                                  periodTo={p.as_on || ''}
                                  onlyBranches={bv.names || []} />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* Employee Productivity — from the snapshot saved with the report */}
                      {p.emp_productivity && !(p.branch_view?.secs?.employee) && (
                        <div className="mt-3">
                          <EmployeeProductivityReport
                            preloaded={p.emp_productivity}
                            periodFrom={p.from_date || ''}
                            periodTo={p.as_on || ''} />
                        </div>
                      )}
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
