import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { canExportExcel } from '../utils/exportPermission';
import {
  ChartBarSquareIcon, ArrowUpTrayIcon, DocumentMagnifyingGlassIcon,
  XMarkIcon,
  DocumentCheckIcon, TableCellsIcon, ArrowPathIcon, CalendarDaysIcon,
  ChevronDownIcon, MagnifyingGlassIcon,
  ChevronDoubleUpIcon, ChevronDoubleDownIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// PMS → Sales and Labour Report  (Performance Management System)
// Spare & Labour Sale — regional performance vs monthly targets.
//   ① Upload files (Part Sale + Labour Revenue Excel; dedupe on re-upload)
//   ② Preview stored data   ③ Generate report / Print
// Backend: server/app/routes/pms_routes.py (master admin only)
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as Knowledge Bank) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

// ---- formatting helpers ----------------------------------------------------
const inr = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
// Report tables read cleaner when an empty value is a dash rather than a 0 —
// inrT is the table-cell counterpart of inr (the raw data preview keeps its
// real values, a 0 there is what the uploaded file actually contains).
const inrT = (v) => (Number(v) ? inr(v) : '-');
// Lakh display for the summary tiles. ALWAYS Lakh — a tile that switched to
// Cr (or to plain rupees for a small run-rate) could not be compared with the
// one beside it at a glance.
const lakh = (v) => (v == null ? '-' : (Number(v) / 100000).toFixed(2) + ' L');
// For tables whose BOX TITLE already says "Lakh ₹": a bare lakh number — no
// ' L' repeated on every cell and no Cr switch on the total row (1.66 Cr is
// shown as 166.24, so the total stays comparable with the rows above it).
const lakhN = (v) => (Number(v) ? (Number(v) / 100000).toFixed(2) : '-');
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
  if (text == null) return '-';
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
  'px-2 py-1.5 text-center text-[11px] font-semibold text-black uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-400';
const tdCls = 'px-2 py-1.5 whitespace-nowrap border border-gray-400';

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
        <span className="truncate">
          {current ? current.label : value}
          {/* hint = a short note about the option (e.g. "no date filter") */}
          {current?.hint && (
            <span className="ml-1.5 text-[10px] text-gray-500">· {current.hint}</span>
          )}
        </span>
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
                className={`w-full text-left px-2 py-1 text-xs rounded whitespace-nowrap ${o.value === value ? 'text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                style={o.value === value ? { backgroundColor: themeColor } : {}}>
                {o.label}
                {o.hint && (
                  <span className={`ml-1.5 text-[10px] ${o.value === value ? 'text-white/75' : 'text-gray-500'}`}>
                    · {o.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Only the columns a formula USES carry a letter, and it sits in their own
// title — "Spare Target (A)", "Spare Sale (B)" — so the % column can spell the
// sum out as "(B / A × 100)" without a separate row of letters to decode.
const colTag = (title, tag) => (
  <>
    {title} <span className="text-[9px] font-bold text-gray-500">({tag})</span>
  </>
);
// "Spare %" with its formula on a second, quieter line.
const pctHead = (title, formula) => (
  <>
    {title}
    <span className="block text-[9px] font-normal text-gray-500 normal-case">{formula}</span>
  </>
);

const REPORT_TYPES = [
  { key: 'all', name: 'All (Spare + Labour)' },
  { key: 'branch_wise', name: 'Branch-wise Report' },
  // ONE entry holding all three whole-year reports (FY, Quarterly, Month) —
  // each opens and closes inside it. They ignore the period picker, and the
  // hint says so right in the dropdown.
  { key: 'fy', name: 'Spares and Labour (FY / Quarterly / Month)' },
];
const FY_TYPES = ['fy'];

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
            {/* The file passes, but a missing column changes HOW its rows are
              identified — say so before the upload, not after the totals look
              odd. */}
            {(checkResult.warnings || []).map((w) => (
              <div key={w} className="mt-1 rounded bg-amber-100 text-amber-900 px-1.5 py-1">
                <b>Note:</b> {w}
              </div>
            ))}
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
  // Report period — applied range (ISO strings) + the month-picker popover.
  // The period is chosen MONTH-WISE only (no free date ranges / presets): the
  // picked month runs 1st → last day, clamped to the uploaded data range.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);
  // 'full' only until the data range is known — the page then defaults to the
  // uploaded data's CURRENT MONTH (see the auto-generate effect below).
  const [activePeriod, setActivePeriod] = useState('full');
  const [pickMonth, setPickMonth] = useState(null);   // Date = 1st of the picked month
  // Day range being picked INSIDE that month ([start, end]); [null, null] = the
  // whole month. The calendar on the right of the period box drives this.
  const [dayRange, setDayRange] = useState([null, null]);
  // Financial Year (Apr..Mar) shown in the month grid + its year dropdown.
  // null = follow the latest uploaded data date.
  const [quickFy, setQuickFy] = useState(null);
  const [fyOpen, setFyOpen] = useState(false);
  // ---- FY reports (FY / Quarterly / Month-wise) -------------------------
  // Picked from the report-type dropdown. They ALWAYS cover the current
  // financial year and ignore the period picker, so they come from their own
  // endpoint and are kept here for the whole visit.
  const [fySum, setFySum] = useState(null);
  const [fySumLoading, setFySumLoading] = useState(false);
  // The three panels inside that one report — FY open, the two wide ones
  // closed, so the page does not open on three full-year tables at once.
  const [fyOpen3, setFyOpen3] = useState({ fy: true, quarter: false, month: false });
  // The year these three cover is the FY shown in the period box (shownFy,
  // computed further down); changing it there reloads them.
  const toggleFy3 = (k) => setFyOpen3((o) => ({ ...o, [k]: !o[k] }));
  // Default = All: Spare + Labour side by side in one compact frame
  const [reportType, setReportType] = useState('all');
  // Keep branchMode in sync with the dropdown — selecting "Branch-wise
  // Report" must switch to the Branch Analysis view; picking any other
  // report type must switch back to the normal per-type table.
  useEffect(() => {
    setBranchMode(reportType === 'branch_wise');
  }, [reportType]);

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

  // Default period once data arrives: the CURRENT MONTH of the uploaded data
  // (the month its latest date falls in, 1st → that date), auto-generated once
  // so the page opens on this month's report. Any other month is one click away
  // in the period box, and "Back to Data" still shows the file preview.
  const autoGenRef = useRef(false);
  useEffect(() => {
    if (!dataRange.max) return;
    const [f, t] = clampToData(dataRange.max.slice(0, 8) + '01', dataRange.max);
    setFromDate((cur) => cur || f);
    setToDate((cur) => cur || t);
    setPickMonth((cur) => cur || new Date(`${f.slice(0, 7)}-01T00:00:00`));
    setActivePeriod((cur) => (cur === 'full' ? 'month' : cur));
    if (!autoGenRef.current) {
      autoGenRef.current = true;
      // Each file is measured as on ITS OWN last data date (spares and labour
      // extracts usually end on different days) — but only when that date is
      // inside this month; otherwise the file has nothing here and both sides
      // share the period end.
      const own = (d) => (d && d >= f && d <= t ? d : undefined);
      generate(f, t, {
        quiet: true,
        partAsOn: summary?.part?.rows > 0 ? own(summary.part.to_date) : undefined,
        labourAsOn: summary?.labour?.rows > 0 ? own(summary.labour.to_date) : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataRange.min, dataRange.max]);

  // Month-wise period: picking a month applies its 1st → last day, clamped to
  // the uploaded data range (so the newest month ends on the last data date).
  // The box STAYS open so the right-hand calendar shows that month's dates.
  const applyMonth = (d) => {
    if (!d || !dataRange.max) return;
    const y = d.getFullYear(), m = d.getMonth();
    const [f, t] = clampToData(isoOf(new Date(y, m, 1)), isoOf(new Date(y, m + 1, 0)));
    setPickMonth(new Date(y, m, 1));
    setDayRange([null, null]);        // a fresh month starts as the WHOLE month
    setFromDate(f);
    setToDate(t);
    setActivePeriod('month');
    setFyOpen(false);
  };

  // A narrower period INSIDE the picked month: click a start date, then an end
  // date on the right-hand calendar. The month stays selected on the left, so
  // one more click on it goes back to the whole month.
  const applyDayRange = (dates) => {
    const [s, e] = dates || [];
    setDayRange([s || null, e || null]);
    if (!s) return;
    if (!e) {                          // first click — show it, wait for the end
      const [f, t] = clampToData(isoOf(s), isoOf(s));
      setFromDate(f);
      setToDate(t);
      setActivePeriod('range');
      return;
    }
    const [a, b] = s <= e ? [s, e] : [e, s];
    const [f, t] = clampToData(isoOf(a), isoOf(b));
    setFromDate(f);
    setToDate(t);
    setActivePeriod('range');
    setShowRangePicker(false);         // range complete — close the box
  };

  // ---- Financial Year (Apr..Mar) + the 12 month buttons under it ----------
  const fyOf = (iso) => (+iso.slice(5, 7) >= 4 ? +iso.slice(0, 4) : +iso.slice(0, 4) - 1);
  // FY currently shown in the grid: the user's pick, else the FY of the picked
  // month, else the FY of the latest uploaded data date.
  const shownFy = quickFy != null
    ? quickFy
    : pickMonth
      ? (pickMonth.getMonth() + 1 >= 4 ? pickMonth.getFullYear() : pickMonth.getFullYear() - 1)
      : dataRange.max ? fyOf(dataRange.max) : new Date().getFullYear();
  // Year list = last 2 and next 2 FYs around the latest uploaded data's FY
  // (today's FY when nothing is uploaded yet) — 5 entries in all.
  const fyBase = dataRange.max
    ? fyOf(dataRange.max)
    : (() => { const d = new Date(); return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; })();
  const fyChoices = [fyBase - 2, fyBase - 1, fyBase, fyBase + 1, fyBase + 2];
  // Apr → Mar of the shown FY; months with no uploaded data are disabled.
  const fyMonths = Array.from({ length: 12 }, (_, i) => {
    const mi = (3 + i) % 12;                       // 3 = April
    const y = shownFy + (mi < 3 ? 1 : 0);
    const start = isoOf(new Date(y, mi, 1)), end = isoOf(new Date(y, mi + 1, 0));
    return {
      y, mi, start, end,
      label: new Date(y, mi, 1).toLocaleDateString('en-GB', { month: 'short' }),
      inData: !dataRange.min || (end >= dataRange.min && start <= dataRange.max),
      selected: !!pickMonth && pickMonth.getFullYear() === y && pickMonth.getMonth() === mi,
    };
  });
  // The three whole-year reports: one fetch per financial year, the first time
  // the report is opened. It lives HERE, below shownFy, because a dependency
  // array is evaluated during render — reading shownFy above its own const
  // threw "Cannot access 'shownFy' before initialization".
  // The "already fetching" guard is a REF, not state: as state it re-ran this
  // effect the moment it flipped, and the re-run's cleanup marked the request
  // in flight as stale — the answer was thrown away and the panels sat on
  // "Loading…" for ever. Nothing cancels here; the fetch happens once.
  const fyReqRef = useRef(false);
  useEffect(() => {
    if (!FY_TYPES.includes(reportType) || fySum || fyReqRef.current) return;
    fyReqRef.current = true;
    setFySumLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API}/pms/report/fy-summary?fy=${shownFy}`,
          { headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.success) setFySum(data);
        else toast.error(data.detail || data.message || 'Could not load the FY report');
      } catch (e) {
        toast.error(e.message || 'Could not load the FY report');
      } finally {
        setFySumLoading(false);
        fyReqRef.current = false;      // a failed load retries on the next pick
      }
    })();
  }, [reportType, fySum, shownFy]);

  // A different FY in the period box means the three reports must reload.
  const fyShownRef = useRef(null);
  useEffect(() => {
    if (fyShownRef.current !== null && fyShownRef.current !== shownFy) setFySum(null);
    fyShownRef.current = shownFy;
  }, [shownFy]);

  // Month shown in the right-hand day calendar (picked month, else latest data)
  const calMonth = pickMonth || (dataRange.max ? new Date(dataRange.max + 'T00:00:00') : null);
  // A day range can only be picked inside THAT month and inside the uploaded
  // data — days outside either are greyed out in the calendar.
  const calBounds = (() => {
    if (!calMonth) return { min: undefined, max: undefined };
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const lo = new Date(y, m, 1), hi = new Date(y, m + 1, 0);
    const dLo = dataRange.min ? new Date(dataRange.min + 'T00:00:00') : null;
    const dHi = dataRange.max ? new Date(dataRange.max + 'T00:00:00') : null;
    return {
      min: dLo && dLo > lo ? dLo : lo,
      max: dHi && dHi < hi ? dHi : hi,
    };
  })();

  // Label on the period button: the month name for a whole month, the dates
  // themselves for a range picked inside it.
  const periodLabel = () => {
    if (activePeriod === 'month' && pickMonth)
      return pickMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (fromDate && toDate) return `${fmtDayYr(fromDate)} → ${fmtDayYr(toDate)}`;
    return 'Select month';
  };

  const onUploaded = () => { loadSummary(); loadBatches(); loadPreview(previewType); };

  // Hero "Refresh": re-pull the stored data (summary, upload batches, preview)
  // and re-run the report that is on screen with the same period, so a fresh
  // upload or a cancelled row shows up without leaving the page.
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadSummary(), loadBatches(), loadPreview(previewType)]);
      if (report) await generate(fromDate, toDate, { quiet: true });
      toast.success('Refreshed');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

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

  // ---- report table data with the branch filter ----
  const typeRows = report
    ? (reportType === 'labour' ? report.labour_rows : report.spare_rows)
    : [];
  const branchOptions = typeRows.map((r) => ({ id: r.branch_id, name: r.branch_name }));
  // Selected branches present in the current rows; [] = all.
  // Used ONLY by the Branch-wise Report view — the standalone report types
  // (Spare Part Sales / Labour Sales) always show EVERY branch.
  const selBranches = branchSel.filter((id) => typeRows.some((r) => r.branch_id === id));

  // Branch-wise Report opens with EVERY branch pre-selected — same result as
  // clicking "Select All Branches" — instead of the empty "pick branches"
  // placeholder. Fires once per entry into branch mode; ref resets on exit
  // so it doesn't fight a later manual "All Branches (no filter)" click.
  const branchDefaultRef = useRef(false);
  useEffect(() => {
    if (!branchMode) { branchDefaultRef.current = false; return; }
    if (!branchDefaultRef.current && branchOptions.length) {
      setBranchSel(branchOptions.map((b) => b.id));
      branchDefaultRef.current = true;
    }
  }, [branchMode, branchOptions.length]);
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
  const thT = 'px-1.5 py-1 text-center text-[11px] font-semibold text-black leading-tight bg-gray-50 border border-gray-400';
  const tdT = 'px-1.5 py-1 whitespace-nowrap border border-gray-400';
  // % Achieved cells — Excel-style block fill: 100 %+ green · 80–99 % yellow ·
  // below 80 % amber. CSS classes (not inline colors) so the dark theme can
  // restyle them — the class definitions live in the injected <style> below.
  // No value (null or 0 — both render as a dash) stays neutral, so a dash is
  // never painted red as if it were a real miss.
  const pctCellCls = (p) => (!p ? '' : p >= 100 ? 'pms-pct-good' : p >= 80 ? 'pms-pct-mid' : 'pms-pct-low');

  // Spare + Labour side-by-side pair with MERGED region bands: ONE full-width
  // "Maharashtra (MH)" / "Karnataka (KA)" bar spans BOTH tables, with each
  // side's block for that region under it. Every small table shares the same
  // fixed column grid, so rows and columns stay aligned across regions and
  // between the two sides. Used by the All view AND the Branch-wise view.
  const renderMergedPair = (spareAll, labourAll) => {
    const dlS = fmtDay(report?.as_on_part || report?.as_on);
    const dlL = fmtDay(report?.as_on_labour || report?.as_on);
    const lk = (v) => (Number(v) ? (Number(v) / 100000).toFixed(2) : '-');
    // Every region is always shown — each one gets its own merged band below.
    const spareRows = spareAll || [];
    const labourRows = labourAll || [];
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
    // Header cells wrap to two lines so proper titles fit narrow columns;
    // break-words keeps a long title (e.g. "Achieved Till Date %") inside its
    // cell instead of spilling over the column line.
    const thA = 'px-1 py-1 text-center text-[11px] font-semibold text-black leading-tight bg-gray-50 border border-gray-400 break-words';
    const tdA = 'px-1 py-0.5 whitespace-nowrap border border-gray-400 text-right';
    // Invoice COUNT is a count, not money — centred under its title
    const tdAC = 'px-1 py-0.5 whitespace-nowrap border border-gray-400 text-center';
    // Bare numbers everywhere, totals included — the column title carries
    // the "%" so it is never repeated in a cell.
    // `total` = a Sub Total / grand Total row. Achi. Till is the headline
    // number, so on a branch row it is a shade heavier than its neighbours —
    // but on a total row that font-medium was LIGHTER than the row's own bold,
    // leaving one column looking un-totalled. There it simply inherits.
    const metricCells = (s, total = false) => {
      const pct = s.target_till ? +(s.achieved_till / s.target_till * 100).toFixed(1) : null;
      return (
        <>
          <td className={tdA}>{lk(s.monthly_target)}</td>
          <td className={tdA}>{lk(s.daily_target)}</td>
          <td className={tdA}>{lk(s.achieved_on)}</td>
          <td className={tdA}>{lk(s.target_till)}</td>
          <td className={`${tdA} ${total ? '' : 'font-medium'}`}>{lk(s.achieved_till)}</td>
          <td className={tdAC}>{inrT(s.invoice_count_till)}</td>
          <td className={`${tdA} font-semibold ${pctCellCls(pct)}`}>
            {!pct ? '-' : pct}
          </td>
          <td className={tdA}>{lk(s.short_fall_till)}</td>
          <td className={tdA}>{lk(s.balance_month)}</td>
        </>
      );
    };
    // one shared fixed column grid for every small table below. Column 7 of
    // the nine metrics is "Achieved Till Date %" — "Achieved" is the longest
    // single word in the header row, so that column gets extra width and the
    // others share what is left.
    const sideCols = (
      <colgroup>
        <col style={{ width: '12%' }} />
        <col style={{ width: '10%' }} />
        {Array.from({ length: 9 }, (_, ci) => (
          <col key={ci} style={{ width: ci === 6 ? '11.5%' : `${66.5 / 8}%` }} />
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
          <th className={thA}>Achieved Till Date %</th>
          <th className={thA}>Short-Fall Till Date</th>
          <th className={thA}>Balance For Month</th>
        </tr>
        {rs.length === 0 ? (
          <tr><td colSpan={11} className="text-center py-2 text-gray-500 border border-gray-400">No rows</td></tr>
        ) : rs.map((r) => (
          <tr key={r.branch_id} className="hover:bg-gray-50/60">
            <td className="px-1 py-1 border border-gray-400 text-left whitespace-nowrap overflow-hidden text-ellipsis"
              title={r.responsible_person || ''}>
              {shortName(r.responsible_person) || '-'}
            </td>
            <td className="px-1 py-1 border border-gray-400 text-left whitespace-nowrap overflow-hidden text-ellipsis font-medium"
              title={r.branch_name || r.branch_id}>
              {r.branch_name}
            </td>
            {metricCells(r)}
          </tr>
        ))}
        {rs.length > 0 && (
          <tr className="font-semibold pms-subtotal-row">
            <td className={tdAC} colSpan={2}>
              {reg === 'MH' ? 'Maharashtra Total' : reg === 'KA' ? 'Karnataka Total' : `${reg} Total`}
            </td>
            {metricCells(sum(rs), true)}
          </tr>
        )}
      </>,
      grp
    );
    const totalBlock = (rows, grp) => sideTable(
      <tr className="font-bold pms-grand-total">
        <td className={tdAC} colSpan={2}>Total</td>
        {metricCells(sum(rows), true)}
      </tr>,
      grp
    );
    // SPARE / LABOUR title bars — repeated under EVERY region band (right
    // above that region's two tables), so the side a table belongs to is
    // always visible however far down you scroll. The grand Total block does
    // NOT get its own pair of bars.
    const titleBars = (
      <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-2">
        {[['SPARE', dlS], ['LABOUR', dlL]].map(([t, dl]) => (
          <div key={t} className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2 rounded"
            style={{ backgroundColor: themeColor }}>
            <span>{t}</span>
            <span className="font-medium text-white/80">As on {dl} · Lakh ₹</span>
          </div>
        ))}
      </div>
    );
    return (
      <div className="space-y-1.5">
        {regionKeys.map((reg, ri) => (
          <React.Fragment key={reg}>
            {/* one-row gap between region blocks (MH ↔ KA) */}
            {ri > 0 && <div className="h-1.5" />}
            {/* ONE merged region band across BOTH tables */}
            <div className="px-1 py-1 text-center text-[11px] font-bold border border-gray-400 rounded pms-region-band">
              {reg === 'MH' ? 'Maharashtra (MH)' : reg === 'KA' ? 'Karnataka (KA)' : reg}
            </div>
            {titleBars}
            <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-2">
              {regionBlock(bySp[reg] || [], dlS, reg, 'sp')}
              {regionBlock(byLb[reg] || [], dlL, reg, 'lb')}
            </div>
          </React.Fragment>
        ))}
        {regionKeys.length === 0 && (
          <p className="text-center py-3 text-xs text-gray-500">No rows</p>
        )}
        {regionKeys.length > 0 && (
          <>
            <div className="h-1.5" />
            <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-2">
              {totalBlock(spareRows, 'sp')}
              {totalBlock(labourRows, 'lb')}
            </div>
          </>
        )}
      </div>
    );
  };

  // One of the three whole-FY reports is on screen: the period picker, the
  // Generate button and the period-based export all step aside for it.
  const fyReport = FY_TYPES.includes(reportType);
  // The Spare and Labour files can end on different dates — the header says so.
  const splitAsOn = report?.as_on_part && report?.as_on_labour
    && report.as_on_part !== report.as_on_labour;
  const canExport = canExportExcel();

  // ---- Excel export — a styled mirror of the report on screen -------------
  // Written with exceljs (loaded on demand, same as the AOP Master export) so
  // the workbook carries the page's own colours: brand title/section bands,
  // grey grid + header row, indigo region band / subtotal + grand-total rows
  // of the branch tables, the grey total row of the four
  // breakdown boxes and the green/amber/orange % achieved cells. Zeros export
  // blank, matching the dash shown on screen. Every sheet starts with ONE
  // title band — no stacked info block — and Spare + Labour share a sheet.
  const exportReport = async () => {
    if (!report) return;
    try {
      const _ex = await import('exceljs');
      const ExcelJS = _ex.default || _ex;

      // -- palette (same values the page paints with) --
      const BRAND = '2F3192', HEAD = 'F3F4F6', HEADTX = '4B5563',
        GRID = '9CA3AF', REGCELL = 'F5F5FA', SUBTOT = 'EAEBF5',
        GRAND = SUBTOT, TOTGREY = 'D1D5DB',   // grand total = same fill as a Sub Total row
        REGGREY = 'E5E7EB',                  // FY reports' region totals (MH / KA)
        PCT_GOOD = '86EFAC', PCT_MID = 'FDE047', PCT_LOW = 'FDBA74';
      const A = (hex) => ({ argb: `FF${hex}` });
      const thin = { style: 'thin', color: A(GRID) };
      const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
      const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: A(hex) });
      const CENTER = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const RIGHT = { horizontal: 'right', vertical: 'middle' };
      const LEFT = { horizontal: 'left', vertical: 'middle' };
      // number formats — amounts in Lakh, counts, % (bare) and % on total rows
      const F_AMT = '0.00', F_CNT = '#,##0', F_PCT = '0.0', F_PCT_T = '0.0" %"';

      // Money in Lakh; a 0 exports blank so the sheet reads like the screen's dash
      const L = (v) => (Number(v) ? +(Number(v) / 100000).toFixed(2) : '');
      const N = (v) => (Number(v) ? Number(v) : '');
      const P = (v, t) => (t && Number(v) ? +(Number(v) / t * 100).toFixed(1) : '');
      // % cell colour — same thresholds as pctCellCls on screen
      const pctFill = (p) => (!p ? null : p >= 100 ? PCT_GOOD : p >= 80 ? PCT_MID : PCT_LOW);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'KALA Care Global LLP';

      const put = (ws, r, c, v, o = {}) => {
        const cl = ws.getCell(r, c);
        cl.value = v === null || v === undefined ? '' : v;
        cl.border = BORDER;
        cl.font = { size: 10, ...(o.font || {}) };
        if (o.fill) cl.fill = fill(o.fill);
        cl.alignment = o.align || { vertical: 'middle' };
        if (o.fmt) cl.numFmt = o.fmt;
        return cl;
      };
      // Full-width coloured band (the page's brand title bars)
      const band = (ws, r, lastCol, text, right = '') => {
        for (let c = 1; c <= lastCol; c++) put(ws, r, c, '', { fill: BRAND });
        const cl = ws.getCell(r, 1);
        cl.value = right ? `${text}          ${right}` : text;
        cl.font = { size: 11, bold: true, color: A('FFFFFF') };
        cl.alignment = LEFT;
        ws.mergeCells(r, 1, r, lastCol);
        ws.getRow(r).height = 18;
        return r + 1;
      };
      // The ONE title line every sheet opens with
      const titleBand = (ws, lastCol, what) => band(ws, 1, lastCol,
        `Performance Management System — ${what}`,
        `As on ${fmtFull(report.as_on)}  ·  Period ${fmtFull(report.from_date)} → ${fmtFull(report.as_on)}  ·  Lakh ₹`);
      const headerRow = (ws, r, hdr) => {
        hdr.forEach((h, i) => put(ws, r, i + 1, h,
          { font: { bold: true, color: A(HEADTX) }, fill: HEAD, align: CENTER }));
        ws.getRow(r).height = 26;
        return r + 1;
      };

      // ---- Spare & Labour on ONE sheet, SIDE BY SIDE, region by region:
      //   "Spare & Labour Sale As On 28-July-2026 (Maharashtra)"  band
      //   SPARE band (cols A..K)  ▏gap▕  LABOUR band (cols M..V)
      //   header row | one row per branch | Sub Total row
      //   … next region … then the grand Total row across both. ----
      // Column L is a narrow, unpainted spacer that keeps the two blocks apart.
      const SP_C0 = 1, SP_END = 11, GAP_C = 12, LB_C0 = 13, LAST_C = 22;
      const REG_NAME = (x) => (x === 'MH' ? 'Maharashtra' : x === 'KA' ? 'Karnataka' : x);
      const asOnLong = fmtFull(report.as_on).replace(/ /g, '-');   // 28-July-2026
      const SP_HDR = (dl) => ['Responsible Person', 'Branch', 'Monthly Target', 'Daily Target',
        `Achi. On ${dl}`, `Target Till ${dl}`, `Achi. Till ${dl}`, 'Invoice Count',
        'Achieved Till Date %', 'Short-Fall Till', 'Balance For Month'];
      const LB_HDR = (dl) => ['Branch', 'Monthly Target', 'Daily Target',
        `Achi. On ${dl}`, `Target Till ${dl}`, `Achi. Till ${dl}`, 'Invoice Count',
        'Achieved Till Date %', 'Short-Fall Till', 'Balance For Month'];
      const sumR = (rs) => (rs || []).reduce((a, x) => ({
        mt: a.mt + (x?.monthly_target || 0), dt: a.dt + (x?.daily_target || 0),
        ao: a.ao + (x?.achieved_on || 0), tt: a.tt + (x?.target_till || 0),
        at: a.at + (x?.achieved_till || 0), ic: a.ic + (x?.invoice_count_till || 0),
        sf: a.sf + (x?.short_fall_till || 0), bm: a.bm + (x?.balance_month || 0),
      }), { mt: 0, dt: 0, ao: 0, tt: 0, at: 0, ic: 0, sf: 0, bm: 0 });

      const branchSheet = (spareRows, labourRows, dlS, dlL) => {
        const ws = wb.addWorksheet('Spare & Labour', {
          pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
          // Excel's own grid is what showed as faint lines in the empty gutter
          // and around the blocks — the sheet draws its own borders instead.
          views: [{ showGridLines: false }],
        });
        // Narrow metric columns (the long titles wrap in the header row) so
        // both blocks fit one landscape page without shrinking to nothing.
        // Responsible Person is wide enough for a full name, which wraps onto
        // a second line rather than being cut off mid-word.
        ws.columns = [{ width: 20 }, { width: 15 }, ...Array(9).fill({ width: 8 }),
          { width: 2.5 }, { width: 15 }, ...Array(9).fill({ width: 8 })];
        ws.getColumn(GAP_C).width = 2.5;   // the SPARE ▏ LABOUR gutter
        ws.pageSetup.margins = {
          left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1,
        };
        const SP = spareRows || [], LB = labourRows || [];
        // The gutter between the two blocks is EMPTY — no fill, no border, no
        // grid — so the sheet reads as two separate tables with clear air
        // between them.
        const clearGap = (row) => {
          const cl = ws.getCell(row, GAP_C);
          cl.border = {};
          cl.fill = fill('FFFFFF');       // solid white: no border, no gridline
        };
        // …and each block is closed with a black frame, the way the report
        // reads on screen. Inner grid lines keep their grey.
        const BLACK = { style: 'thin', color: A('000000') };
        const frame = (r1, c1, r2, c2) => {
          for (let c = c1; c <= c2; c++) {
            const top = ws.getCell(r1, c);
            top.border = { ...(top.border || {}), top: BLACK };
            const bot = ws.getCell(r2, c);
            bot.border = { ...(bot.border || {}), bottom: BLACK };
          }
          for (let r0 = r1; r0 <= r2; r0++) {
            const lf = ws.getCell(r0, c1);
            lf.border = { ...(lf.border || {}), left: BLACK };
            const rt = ws.getCell(r0, c2);
            rt.border = { ...(rt.border || {}), right: BLACK };
          }
        };

        // the nine metric cells of one side; c0 = column of "Monthly Target"
        const metrics = (row, c0, x, o = {}) => {
          const pctv = o.pct !== undefined ? o.pct : N(x?.pct_achieved);
          const v = [x?.monthly_target, x?.daily_target, x?.achieved_on, x?.target_till, x?.achieved_till];
          v.forEach((m, i) => put(ws, row, c0 + i, L(m), {
            ...o, align: RIGHT, fmt: F_AMT,
            font: { ...(o.font || {}), bold: i === 4 || !!o.font?.bold },
          }));
          put(ws, row, c0 + 5, N(x?.invoice_count_till), { ...o, align: RIGHT, fmt: F_CNT });
          // The % cell always keeps its own good/mid/low colour — on branch
          // rows, on Sub Total rows AND on the grand Total row (same as screen).
          put(ws, row, c0 + 6, pctv === '' ? '' : pctv, {
            ...o, align: RIGHT, fmt: o.total ? F_PCT_T : F_PCT,
            fill: pctFill(pctv) || o.fill,
            font: { ...(o.font || {}), bold: true },
          });
          put(ws, row, c0 + 7, L(x?.short_fall_till), { ...o, align: RIGHT, fmt: F_AMT });
          put(ws, row, c0 + 8, L(x?.balance_month), { ...o, align: RIGHT, fmt: F_AMT });
        };
        // a side's total cells built from a summed object
        const totMetrics = (row, c0, t, o) =>
          metrics(row, c0, {
            monthly_target: t.mt, daily_target: t.dt, achieved_on: t.ao, target_till: t.tt,
            achieved_till: t.at, invoice_count_till: t.ic, short_fall_till: t.sf, balance_month: t.bm,
          }, { ...o, pct: P(t.at, t.tt), total: true });

        let r = titleBand(ws, LAST_C, 'Spare & Labour Sale');
        clearGap(r);                      // the blank row under the title
        r += 1;

        const regions = ['MH', 'KA']
          .filter((k) => SP.some((x) => x.region === k) || LB.some((x) => x.region === k))
          .concat([...new Set([...SP, ...LB].map((x) => x.region))]
            .filter((k) => k && k !== 'MH' && k !== 'KA'));

        regions.forEach((reg) => {
          const sp = SP.filter((x) => x.region === reg);
          const lb = LB.filter((x) => x.region === reg);
          // one row per branch — the same branch on both sides, like the report
          const ids = [...sp.map((x) => x.branch_id),
            ...lb.map((x) => x.branch_id).filter((id) => !sp.some((y) => y.branch_id === id))];

          // region title across both tables
          r = band(ws, r, LAST_C, `Spare & Labour Sale As On ${asOnLong} (${REG_NAME(reg)})`);
          ws.getCell(r - 1, 1).alignment = CENTER;
          const blockTop = r;              // the SPARE / LABOUR caption row
          // SPARE / LABOUR caption bands — the gap column stays unpainted
          const cap = { font: { bold: true, size: 11, color: A('FFFFFF') }, fill: BRAND, align: CENTER };
          for (let c = SP_C0; c <= SP_END; c++) put(ws, r, c, '', cap);
          for (let c = LB_C0; c <= LAST_C; c++) put(ws, r, c, '', cap);
          ws.getCell(r, SP_C0).value = 'SPARE';
          ws.getCell(r, LB_C0).value = 'LABOUR';
          ws.mergeCells(r, SP_C0, r, SP_END);
          ws.mergeCells(r, LB_C0, r, LAST_C);
          clearGap(r);
          r += 1;
          // header row — each side keeps its own as-on date
          const H = { font: { bold: true, color: A(HEADTX) }, fill: HEAD, align: CENTER };
          SP_HDR(dlS).forEach((h, i) => put(ws, r, SP_C0 + i, h, H));
          LB_HDR(dlL).forEach((h, i) => put(ws, r, LB_C0 + i, h, H));
          ws.getRow(r).height = 40;   // room for the wrapped column titles
          clearGap(r);
          r += 1;

          ids.forEach((id) => {
            const s = sp.find((x) => x.branch_id === id);
            const l = lb.find((x) => x.branch_id === id);
            const base = s || l;
            put(ws, r, 1, base?.responsible_person || '',
              { align: { horizontal: 'left', vertical: 'middle', wrapText: true } });
            put(ws, r, 2, base?.branch_name || id, { align: LEFT, font: { bold: true } });
            metrics(r, 3, s);
            put(ws, r, LB_C0, base?.branch_name || id, { align: LEFT, font: { bold: true } });
            metrics(r, LB_C0 + 1, l);
            ws.getRow(r).height = 24;   // room for a two-line name
            clearGap(r);
            r += 1;
          });

          // Sub Total row for this region
          const sub = { fill: SUBTOT, font: { bold: true } };
          put(ws, r, 1, 'Sub Total', { ...sub, align: LEFT });
          put(ws, r, 2, '', sub);
          ws.mergeCells(r, 1, r, 2);
          totMetrics(r, 3, sumR(sp), sub);
          put(ws, r, LB_C0, 'Sub Total', { ...sub, align: LEFT });
          totMetrics(r, LB_C0 + 1, sumR(lb), sub);
          clearGap(r);
          frame(blockTop, SP_C0, r, SP_END);     // black frame round SPARE
          frame(blockTop, LB_C0, r, LAST_C);     // …and round LABOUR
          r += 1;
          clearGap(r);                    // the blank row between regions
          r += 1;
        });

        // grand total across every region — same fill as the Sub Total rows
        const go = { fill: GRAND, font: { bold: true } };
        put(ws, r, 1, 'Total', { ...go, align: LEFT });
        put(ws, r, 2, '', go);
        ws.mergeCells(r, 1, r, 2);
        totMetrics(r, 3, sumR(SP), go);
        put(ws, r, LB_C0, 'Total', { ...go, align: LEFT });
        totMetrics(r, LB_C0 + 1, sumR(LB), go);
        clearGap(r);
        frame(r, SP_C0, r, SP_END);
        frame(r, LB_C0, r, LAST_C);
      };

      // ---- Breakdown box (Region / Segment / Service Head) — grey total row ----
      // withTarget (Region-wise only) puts that region's AOP target in FRONT of
      // each metric — targets exist per branch, and every branch sits in exactly
      // one region, so Segment / Service Head sheets stay sales-only.
      const breakSheet = (name, label, rws, title, withTarget = false) => {
        const ws = wb.addWorksheet(name);
        const hdr = [label,
          ...(withTarget ? ['Spare Target'] : []), 'Spare Sale', 'Spare %',
          ...(withTarget ? ['Labour Target'] : []), 'Labour Sale', 'Labour %',
          ...(withTarget ? ['Total Target'] : []), 'Total Sale', 'Total %',
          'Invoice Count', 'Invoice Count %'];
        ws.columns = [{ width: 26 }, ...Array(hdr.length - 1).fill({ width: 12 })];
        const LAST = hdr.length;
        let r = titleBand(ws, LAST, withTarget ? `${title}  ·  % vs AOP target`
          : `${title}  ·  % of total`);
        r = headerRow(ws, r, hdr);
        const tot = (rws || []).reduce((a, x) => ({
          part: a.part + (x.part || 0), labour: a.labour + (x.labour || 0),
          total: a.total + (x.total || 0), invoices: a.invoices + (x.invoices || 0),
          spare_target: a.spare_target + (x.spare_target || 0),
          labour_target: a.labour_target + (x.labour_target || 0),
          total_target: a.total_target + (x.total_target || 0),
        }), { part: 0, labour: 0, total: 0, invoices: 0,
          spare_target: 0, labour_target: 0, total_target: 0 });
        // Region-wise compares a row's SALE with its own AOP TARGET; Segment
        // and Service Head have no target, so their % stays a share of the
        // column total — the same rule the screen uses.
        const den = (x, kind) => {
          if (withTarget) {                    // a region has its own AOP target
            return kind === 'part' ? (x.spare_target || 0)
              : kind === 'labour' ? (x.labour_target || 0) : (x.total_target || 0);
          }
          return kind === 'part' ? tot.part    // the others: share of the total
            : kind === 'labour' ? tot.labour : tot.total;
        };
        // one row's value cells (column 1 holds the name) as [value, numFmt]
        const line = (x, share) => {
          const c = [];
          if (withTarget) c.push([L(x.spare_target), F_AMT]);
          c.push([L(x.part), F_AMT], [share(x.part, den(x, 'part')), F_PCT]);
          if (withTarget) c.push([L(x.labour_target), F_AMT]);
          c.push([L(x.labour), F_AMT], [share(x.labour, den(x, 'labour')), F_PCT]);
          if (withTarget) c.push([L(x.total_target), F_AMT]);
          c.push([L(x.total), F_AMT], [share(x.total, den(x, 'total')), F_PCT]);
          c.push([N(x.invoices), F_CNT], [share(x.invoices, tot.invoices), F_PCT]);
          return c;
        };
        (rws || []).forEach((x) => {
          put(ws, r, 1, x.name, { align: LEFT, font: { bold: true } });
          line(x, P).forEach(([v, fmt], i) => put(ws, r, i + 2, v, { align: RIGHT, fmt }));
          r += 1;
        });
        const to = { fill: TOTGREY, font: { bold: true } };
        put(ws, r, 1, 'Total', { ...to, align: LEFT });
        // the total row: achievement for a region, otherwise a flat 100 %
        line(tot, (v, t) => (withTarget ? P(v, t) : (t ? 100 : ''))).forEach(([v, fmt], i) =>
          put(ws, r, i + 2, v, { ...to, align: RIGHT, fmt: fmt === F_PCT ? F_PCT_T : fmt }));
      };

      // ---- Category box (Spare only) — grey total row ----
      const categorySheet = (name, rws) => {
        const ws = wb.addWorksheet(name);
        ws.columns = [{ width: 26 }, ...Array(7).fill({ width: 11 })];
        const hdr = ['Category', 'Spare Sale', 'Spare %', 'Quantity', 'Line Items',
          'Invoice Count', 'Invoice Count %', 'Avg / Invoice'];
        const LAST = hdr.length;
        let r = titleBand(ws, LAST, 'Category-wise Sales (Spare)  ·  % of total');
        r = headerRow(ws, r, hdr);
        const tot = (rws || []).reduce((a, x) => ({
          part: a.part + (x.part || 0), invoices: a.invoices + (x.invoices || 0),
          qty: a.qty + (x.qty || 0), lines: a.lines + (x.lines || 0),
        }), { part: 0, invoices: 0, qty: 0, lines: 0 });
        (rws || []).forEach((x) => {
          put(ws, r, 1, x.name, { align: LEFT, font: { bold: true } });
          put(ws, r, 2, L(x.part), { align: RIGHT, fmt: F_AMT, font: { bold: true } });
          put(ws, r, 3, P(x.part, tot.part), { align: RIGHT, fmt: F_PCT });
          put(ws, r, 4, N(Math.round(x.qty || 0)), { align: RIGHT, fmt: F_CNT });
          put(ws, r, 5, N(x.lines), { align: RIGHT, fmt: F_CNT });
          put(ws, r, 6, N(x.invoices), { align: RIGHT, fmt: F_CNT });
          put(ws, r, 7, P(x.invoices, tot.invoices), { align: RIGHT, fmt: F_PCT });
          put(ws, r, 8, x.invoices ? L(x.part / x.invoices) : '', { align: RIGHT, fmt: F_AMT });
          r += 1;
        });
        const to = { fill: TOTGREY, font: { bold: true } };
        put(ws, r, 1, 'Total', { ...to, align: LEFT });
        put(ws, r, 2, L(tot.part), { ...to, align: RIGHT, fmt: F_AMT });
        put(ws, r, 3, tot.part ? 100 : '', { ...to, align: RIGHT, fmt: F_PCT_T });
        put(ws, r, 4, N(Math.round(tot.qty)), { ...to, align: RIGHT, fmt: F_CNT });
        put(ws, r, 5, N(tot.lines), { ...to, align: RIGHT, fmt: F_CNT });
        put(ws, r, 6, N(tot.invoices), { ...to, align: RIGHT, fmt: F_CNT });
        put(ws, r, 7, tot.invoices ? 100 : '', { ...to, align: RIGHT, fmt: F_PCT_T });
        put(ws, r, 8, tot.invoices ? L(tot.part / tot.invoices) : '', { ...to, align: RIGHT, fmt: F_AMT });
      };

      // ---- simple sheet used by the branch-wise detail sections ----
      const simpleSheet = (name, title, hdr, data, fmts) => {
        const ws = wb.addWorksheet(name);
        ws.columns = [{ width: 24 }, ...Array(hdr.length - 1).fill({ width: 12 })];
        let r = titleBand(ws, hdr.length, `${title}  ·  selected branches only`);
        r = headerRow(ws, r, hdr);
        data.forEach((row) => {
          row.forEach((v, i) => put(ws, r, i + 1, v, {
            align: i === 0 ? LEFT : RIGHT,
            font: i === 0 ? { bold: true } : {},
            fmt: i === 0 ? undefined : fmts?.[i],
          }));
          r += 1;
        });
      };

      const save = async (fname) => {
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        a.click();
        URL.revokeObjectURL(url);
      };

      const dlS = fmtDay(report.as_on_part || report.as_on);
      const dlL = fmtDay(report.as_on_labour || report.as_on);

      // ============ FY / Quarterly / Month-wise (whole financial year) ============
      // These three ignore the period entirely, so their sheets carry the FY in
      // the title band instead of an as-on date. Same colours as the screen —
      // the % cells keep the good / mid / low fills.
      if (fyReport) {
        if (!fySum) { toast.error('The FY report is still loading — try again in a moment'); return; }
        const fyRows = fySum.rows || [], fyMonthKeys = fySum.months || [];
        const fyName = `FY ${fySum.fy}-${String(fySum.fy + 1).slice(2)}`;
        const mLbl = (m) => new Date(`${m}-01T00:00:00`)
          .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
        const sumOf = (row, f, ms) => ms.reduce((a, m) => a + (row[f]?.[m] || 0), 0);
        const colOf = (f, ms, rs = fyRows) => rs.reduce((a, row) => a + sumOf(row, f, ms), 0);
        // Same region blocks as the screen: Maharashtra, Karnataka, then the
        // rest, each closing with its own subtotal before the grand total.
        const REG_NAME = { MH: 'Maharashtra', KA: 'Karnataka' };
        const regionGroups = (() => {
          const by = {};
          fyRows.forEach((row) => {
            const k = (row.region || 'OTHER').toUpperCase();
            (by[k] = by[k] || []).push(row);
          });
          return ['MH', 'KA'].filter((k) => by[k])
            .concat(Object.keys(by).filter((k) => k !== 'MH' && k !== 'KA').sort())
            .map((k) => ({
              label: `${REG_NAME[k] || (k === 'OTHER' ? 'Other' : k)} Total`,
              rows: by[k],
            }));
        })();
        const SIDES = [['spare', 'SPARE'], ['labour', 'LABOUR']];
        const fieldsOf = (side) => (side === 'spare'
          ? ['spare_target', 'spare_sale'] : ['labour_target', 'labour_sale']);
        const fyBand = (ws, lastCol, what) => band(ws, 1, lastCol,
          `Performance Management System — ${what}`,
          `${fyName}  ·  Whole financial year  ·  Lakh ₹`);

        {                                   // ---- sheet 1: the FY table ----
          // ELEVEN columns, exactly what the screen shows: Target · Achi. · %
          // and the two run-rates for each side. The rates repeat the page's
          // working-day maths — the AOP Master's days per month and region,
          // split at the last sales date.
          // Same holiday-aware split the screen uses — worked out server-side
          const wdSplit = (region) => (fySum.wd_split?.[
            (region || '').toUpperCase() === 'KA' ? 'KA' : 'MH']
            || { total: 0, elapsed: 0, left: 0 });
          const rrRow = (row, side) => {
            const [tf, sf] = fieldsOf(side);
            const { elapsed, left } = wdSplit(row.region);
            const t = sumOf(row, tf, fyMonthKeys), a = sumOf(row, sf, fyMonthKeys);
            return { cur: elapsed > 0 ? a / elapsed : 0,
              req: left > 0 ? Math.max(0, t - a) / left : 0 };
          };
          const rrRows = (rs, side) => rs.reduce((acc, row) => {
            const x = rrRow(row, side);
            return { cur: acc.cur + x.cur, req: acc.req + x.req };
          }, { cur: 0, req: 0 });

          const ws = wb.addWorksheet('FY');
          ws.columns = [{ width: 26 }, ...Array(10).fill({ width: 13 })];
          let r = fyBand(ws, 11, 'Spares and Labour (FY)');
          // SPARE / LABOUR bands over their five columns each, like the screen
          const cap = { font: { bold: true, size: 11, color: A('FFFFFF') },
            fill: BRAND, align: CENTER };
          put(ws, r, 1, '', { fill: HEAD });
          for (let c = 2; c <= 11; c++) put(ws, r, c, '', cap);
          ws.getCell(r, 2).value = 'SPARE';
          ws.getCell(r, 7).value = 'LABOUR';
          ws.mergeCells(r, 2, r, 6);
          ws.mergeCells(r, 7, r, 11);
          r += 1;
          r = headerRow(ws, r, ['Branch',
            'Spare Target', 'Spare Achi.', 'Spare %',
            'Spare Current Run-Rate /day', 'Spare Required Run-Rate /day',
            'Labour Target', 'Labour Achi.', 'Labour %',
            'Labour Current Run-Rate /day', 'Labour Required Run-Rate /day']);
          const line = (label, get, rr, o = {}) => {
            put(ws, r, 1, label, { ...o, align: LEFT, font: { bold: true, ...(o.font || {}) } });
            SIDES.forEach(([side], i) => {
              const [tf, sf] = fieldsOf(side);
              const t = get(tf), a = get(sf), p = P(a, t);
              const c0 = 2 + i * 5, rate = rr(side);
              put(ws, r, c0, L(t), { ...o, align: RIGHT, fmt: F_AMT });
              put(ws, r, c0 + 1, L(a), { ...o, align: RIGHT, fmt: F_AMT });
              put(ws, r, c0 + 2, p, {
                ...o, align: RIGHT, fmt: F_PCT,
                fill: pctFill(p) || o.fill, font: { bold: true },
              });
              put(ws, r, c0 + 3, L(rate.cur), { ...o, align: RIGHT, fmt: F_AMT });
              put(ws, r, c0 + 4, L(rate.req), { ...o, align: RIGHT, fmt: F_AMT });
            });
            r += 1;
          };
          regionGroups.forEach((rg) => {
            rg.rows.forEach((row) => line(row.branch_name,
              (f) => sumOf(row, f, fyMonthKeys), (side) => rrRow(row, side)));
            line(rg.label, (f) => colOf(f, fyMonthKeys, rg.rows),
              (side) => rrRows(rg.rows, side), { fill: REGGREY, font: { bold: true } });
          });
          line('Grand Total', (f) => colOf(f, fyMonthKeys),
            (side) => rrRows(fyRows, side), { fill: TOTGREY, font: { bold: true } });
        }

        // ---- sheets 2 & 3: Quarterly and Month-wise. SPARE then LABOUR across
        // the sheet, each side split into its groups, each group
        // Target · Achi. · % (same as the screen). ----
        for (const quarterly of [true, false]) {
        const groups = quarterly
          ? (fySum.quarters || [])
          : fyMonthKeys.map((m) => ({ label: mLbl(m), months: [m] }));
        const ws = wb.addWorksheet(quarterly ? 'Quarterly' : 'Month-wise');
        const lastCol = 1 + SIDES.length * groups.length * 3;
        ws.columns = [{ width: 26 }, ...Array(lastCol - 1).fill({ width: 10 })];
        let r = fyBand(ws, lastCol, quarterly
          ? 'Spares and Labour (Quarterly)' : 'Spares and Labour (Month)');

        // three header rows: side band → group → Target/Achi./%
        put(ws, r, 1, 'Branch', { fill: HEAD, font: { bold: true, color: A(HEADTX) }, align: CENTER });
        put(ws, r + 1, 1, '', { fill: HEAD });
        put(ws, r + 2, 1, '', { fill: HEAD });
        ws.mergeCells(r, 1, r + 2, 1);
        let c = 2;
        SIDES.forEach(([, label]) => {
          const span = groups.length * 3;
          for (let i = 0; i < span; i++) put(ws, r, c + i, '', { fill: BRAND });
          const cell = ws.getCell(r, c);
          cell.value = label;
          cell.font = { size: 11, bold: true, color: A('FFFFFF') };
          cell.alignment = CENTER;
          ws.mergeCells(r, c, r, c + span - 1);
          groups.forEach((g, gi) => {
            const gc = c + gi * 3;
            for (let i = 0; i < 3; i++) {
              put(ws, r + 1, gc + i, '', { fill: HEAD });
              put(ws, r + 2, gc + i, ['Target', 'Achi.', '%'][i],
                { fill: HEAD, font: { bold: true, color: A(HEADTX) }, align: CENTER });
            }
            const gcell = ws.getCell(r + 1, gc);
            gcell.value = g.label;
            gcell.font = { bold: true, color: A(HEADTX) };
            gcell.alignment = CENTER;
            ws.mergeCells(r + 1, gc, r + 1, gc + 2);
          });
          c += span;
        });
        r += 3;

        const line = (label, get, o = {}) => {
          put(ws, r, 1, label, { ...o, align: LEFT, font: { bold: true, ...(o.font || {}) } });
          let cc = 2;
          SIDES.forEach(([side]) => {
            const [tf, sf] = fieldsOf(side);
            groups.forEach((g) => {
              const t = get(tf, g.months), a = get(sf, g.months), p = P(a, t);
              put(ws, r, cc, L(t), { ...o, align: RIGHT, fmt: F_AMT });
              put(ws, r, cc + 1, L(a), { ...o, align: RIGHT, fmt: F_AMT });
              put(ws, r, cc + 2, p, {
                ...o, align: RIGHT, fmt: F_PCT,
                fill: pctFill(p) || o.fill, font: { bold: true },
              });
              cc += 3;
            });
          });
          r += 1;
        };
        regionGroups.forEach((rg) => {
          rg.rows.forEach((row) => line(row.branch_name, (f, ms) => sumOf(row, f, ms)));
          line(rg.label, (f, ms) => colOf(f, ms, rg.rows), { fill: REGGREY, font: { bold: true } });
        });
        line('Grand Total', (f, ms) => colOf(f, ms), { fill: TOTGREY, font: { bold: true } });
        }

        await save(`PMS_FY_${fySum.fy}.xlsx`);
        toast.success('FY report exported — FY, Quarterly and Month-wise sheets');
        return;
      }

      // ================= Branch-wise Report =================
      if (reportType === 'branch_wise') {
        if (!selBranches.length) { toast.error('Branch-wise Report — select branches first'); return; }
        const allIds = [...new Set([...(report.spare_rows || []), ...(report.labour_rows || [])]
          .map((x) => x.branch_id))];
        const totalOf = (id) =>
          ((report.spare_rows || []).find((x) => x.branch_id === id)?.achieved_till || 0) +
          ((report.labour_rows || []).find((x) => x.branch_id === id)?.achieved_till || 0);
        const ranked = allIds.map((id) => ({ id, t: totalOf(id) })).sort((a, b) => b.t - a.t);
        const rrOf = (x) => {
          if (!x || !x.daily_target || !x.monthly_target) return null;
          const totalWd = x.monthly_target / x.daily_target;
          const elapsedWd = Math.min(totalWd, (x.target_till || 0) / x.daily_target);
          const remWd = Math.max(0, totalWd - elapsedWd);
          return {
            req: remWd > 0 ? Math.max(0, x.monthly_target - (x.achieved_till || 0)) / remWd : 0,
            cur: elapsedWd > 0 ? (x.achieved_till || 0) / elapsedWd : 0,
          };
        };
        // Branch Analysis — two merged SPARE / LABOUR header groups
        const ws = wb.addWorksheet('Branch Analysis', {
          pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        });
        const LAST = 14;
        ws.columns = [{ width: 22 }, { width: 10 }, ...Array(12).fill({ width: 9.5 })];
        let r = titleBand(ws, LAST, 'Branch Analysis — selected branches');
        const H = { font: { bold: true, color: A(HEADTX) }, fill: HEAD, align: CENTER };
        put(ws, r, 1, 'Branch', H); put(ws, r, 2, 'Rank', H);
        put(ws, r, 3, 'SPARE', { ...H, font: { bold: true, color: A(BRAND) } });
        put(ws, r, 9, 'LABOUR', { ...H, font: { bold: true, color: A(BRAND) } });
        for (let c = 4; c <= 8; c++) put(ws, r, c, '', H);
        for (let c = 10; c <= LAST; c++) put(ws, r, c, '', H);
        ws.mergeCells(r, 3, r, 8); ws.mergeCells(r, 9, r, LAST);
        const sub = ['Target', 'Total Sale', 'vs AOP Target %', 'Invoice Count',
          'Current Run-Rate (L/day)', 'Required Run-Rate (L/day)'];
        [...sub, ...sub].forEach((h, i) => put(ws, r + 1, i + 3, h, H));
        put(ws, r + 1, 1, '', H); put(ws, r + 1, 2, '', H);
        ws.mergeCells(r, 1, r + 1, 1); ws.mergeCells(r, 2, r + 1, 2);
        ws.getRow(r + 1).height = 26;
        r += 2;
        selBranches.forEach((id) => {
          const sp = (report.spare_rows || []).find((x) => x.branch_id === id);
          const lb = (report.labour_rows || []).find((x) => x.branch_id === id);
          const base = sp || lb;
          if (!base) return;
          put(ws, r, 1, `${base.branch_name} (${base.region})`, { align: LEFT, font: { bold: true } });
          put(ws, r, 2, `#${1 + ranked.findIndex((x) => x.id === id)} of ${ranked.length}`,
            { align: CENTER, font: { bold: true, color: A(BRAND) } });
          [sp, lb].forEach((x, side) => {
            const c0 = 3 + side * 6;
            const rr = rrOf(x);
            const tgt = x?.monthly_target || 0, sale = x?.achieved_till || 0;
            const pv = P(sale, tgt);
            put(ws, r, c0, L(tgt), { align: RIGHT, fmt: F_AMT });
            put(ws, r, c0 + 1, L(sale), { align: RIGHT, fmt: F_AMT });
            put(ws, r, c0 + 2, pv, { align: RIGHT, fmt: F_PCT, fill: pctFill(pv), font: { bold: true } });
            put(ws, r, c0 + 3, N(x?.invoice_count_till), { align: RIGHT, fmt: F_CNT });
            put(ws, r, c0 + 4, rr ? L(rr.cur) : '', { align: RIGHT, fmt: F_AMT });
            put(ws, r, c0 + 5, rr ? L(rr.req) : '', { align: RIGHT, fmt: F_AMT });
          });
          r += 1;
        });

        // Every ticked "Show for selected branches" section becomes a sheet —
        // Spare + Labour share one sheet here too.
        if (detailSecs.records) {
          branchSheet(
            (report.spare_rows || []).filter((x) => selBranches.includes(x.branch_id)),
            (report.labour_rows || []).filter((x) => selBranches.includes(x.branch_id)),
            dlS, dlL);
        }
        if (branchDetail) {
          const AMT4 = [undefined, F_AMT, F_AMT, F_AMT, F_CNT];
          if (detailSecs.weeks) {
            simpleSheet('Week-wise', 'Week-wise Sales',
              ['Week', 'From', 'To', 'Spare Sale', 'Labour Sale', 'Total Sale', 'Invoice Count'],
              (branchDetail.weeks || []).map((w) => [`Week ${w.week}`, w.start, w.end,
                L(w.part), L(w.labour), L(w.total), N(w.invoices)]),
              [undefined, undefined, undefined, F_AMT, F_AMT, F_AMT, F_CNT]);
          }
          if (detailSecs.months) {
            simpleSheet('Month-wise', 'Month-wise Sales',
              ['Month', 'Spare Sale', 'Labour Sale', 'Total Sale', 'Invoice Count'],
              (branchDetail.months || []).map((m) => [m.month,
                L(m.part), L(m.labour), L(m.total), N(m.invoices)]), AMT4);
          }
          if (detailSecs.segment) {
            simpleSheet('Segment', 'Segment-wise Sales',
              ['Segment', 'Spare Sale', 'Labour Sale', 'Total Sale', 'Invoice Count'],
              (branchDetail.segment || []).map((x) => [x.name,
                L(x.part), L(x.labour), L(x.total), N(x.invoices)]), AMT4);
          }
          if (detailSecs.service_head) {
            simpleSheet('Service Head', 'Service Report Type-wise Sales',
              ['Service Head', 'Spare Sale', 'Labour Sale', 'Total Sale', 'Invoice Count'],
              (branchDetail.service_head || []).map((x) => [x.name,
                L(x.part), L(x.labour), L(x.total), N(x.invoices)]), AMT4);
          }
          if (detailSecs.category) {
            simpleSheet('Category', 'Category-wise Sales (Spare)',
              ['Category', 'Spare Sale', 'Quantity', 'Line Items', 'Invoice Count'],
              (branchDetail.category || []).map((x) => [x.name,
                L(x.part), N(Math.round(x.qty || 0)), N(x.lines), N(x.invoices)]),
              [undefined, F_AMT, F_CNT, F_CNT, F_CNT]);
          }
        }
        await save(`PMS_Branch_Analysis_${report.as_on}.xlsx`);
        toast.success('Branch-wise report exported');
        return;
      }

      // ================= All (Spare + Labour) =================
      branchSheet(report.spare_rows, report.labour_rows, dlS, dlL);
      breakSheet('Regional', 'Region', report.regional, 'Region-wise Sales', true);
      breakSheet('Segment', 'Segment', report.segment, 'Segment-wise Sales');
      breakSheet('Service Head', 'Service Head', report.service_head, 'Service Report Type-wise Sales');
      categorySheet('Category', report.category);
      await save(`PMS_All_${report.as_on}.xlsx`);
      toast.success('Report exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-0 max-md:px-2">
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
      /* Region totals of the FY reports (Maharashtra / Karnataka) — plain grey,
         a shade lighter than the grand total so the two read apart. The -cell
         class is for the frozen label column, whose own background would
         otherwise sit on top of the row's. */
      .pms-region-total,
      .pms-region-total-cell { background-color: #e5e7eb; }
      /* Total row of the four breakdown boxes at the bottom of the All view
         (Region / Segment / Service Report Type / Category) — light grey */
      .pms-total-row td { background-color: #d1d5db !important; color: #111827 !important; }
      /* .pms-pct-good / -mid / -low now live in index.css: the Annual
         Reports' Service Penetration sheet paints the same fills. */
      .pms-behind { color: #92400e; }
      .pms-ahead { color: #15803d; }
      .pms-mid { color: #a16207; }
      /* Report accent colors — dark theme: muted fills, bright readable text */
      html.dark .pms-accent { color: #38bdf8; }
      html.dark .pms-region-band { background-color: rgba(56,189,248,0.14); color: #7dd3fc; }
      html.dark .pms-region-cell { background-color: rgba(56,189,248,0.07); color: #7dd3fc; }
      html.dark .pms-subtotal-row { background-color: rgba(56,189,248,0.10); }
      html.dark .pms-region-total,
      html.dark .pms-region-total-cell { background-color: rgba(148,163,184,0.26); }
      html.dark .pms-total-row td { background-color: rgba(148,163,184,0.38) !important; color: #e6e9ef !important; }
      html.dark .pms-behind { color: #fbbf24; }
      html.dark .pms-ahead { color: #4ade80; }
      html.dark .pms-mid { color: #facc15; }
      /* Grand-total row of the SPARE / LABOUR tables — SAME fill as the region
         "Karnataka Total" subtotal rows. Painted on the ROW (not the cells) so
         the "Achieved Till Date %" cell keeps its own good/mid/low colour here
         exactly like it does on every other row. */
      .pms-grand-total { background-color: rgba(47,49,146,0.08); }
      html.dark .pms-grand-total { background-color: rgba(56,189,248,0.10); }
      `}</style>

        {/* ===== Hero header (same style as Knowledge Bank) ===== */}
        <div className="pms-no-print rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="relative flex items-center gap-3">
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
            <div className="ml-auto flex items-center gap-2">
              <button onClick={refreshAll} disabled={refreshing || generating}
                title="Reload the stored data and re-run the report on screen"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90 disabled:opacity-60 pms-accent">
                <ArrowPathIcon className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
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
              Upload files → Preview data → Generate report
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
                  {/* Period picker + Generate — one row. The period is MONTH-WISE
                only (no presets / free date ranges). The picker opens on hover
                and closes when the mouse leaves (click still toggles). */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1 min-w-0"
                      onMouseEnter={() => dataRange.max && setShowRangePicker(true)}
                      onMouseLeave={() => { if (!fyOpen) setShowRangePicker(false); }}>
                      {/* The three FY reports cover the whole financial year, so
                        the period box is switched off while one is on screen. */}
                      <button onClick={() => { setFyOpen(false); setShowRangePicker(!showRangePicker); }}
                        disabled={!dataRange.max}
                        title={fyReport ? 'The FY button inside picks the year these reports show' : undefined}
                        className="w-full flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                        style={{ backgroundColor: themeColor }}>
                        <CalendarDaysIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{periodLabel()}</span>
                        <ChevronDownIcon className={`h-3 w-3 flex-shrink-0 transition-transform ${showRangePicker ? 'rotate-180' : ''}`} />
                      </button>

                      {showRangePicker && (
                        /* pt-2 (not a margin) keeps the hover unbroken across the gap */
                        <div className="absolute z-50 left-0 right-0 sm:left-auto sm:right-0 top-full pt-2">
                          <div className="sm:w-[460px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-gray-200">
                            <div className="p-3 max-h-[75vh] overflow-y-auto">
                              <div className="flex flex-col sm:flex-row gap-4">
                                {/* LEFT: Financial Year on top, then its 12 months
                                    (Apr → Mar). Clicking a month applies it as the
                                    period; months with no uploaded data are disabled. */}
                                <div className="sm:w-[44%]">
                                  <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">Select Month</h3>
                                  <div className="relative mb-2">
                                    {/* The year list opens ABOVE the button and in FLOW, not
                                        absolutely positioned: the panel is its own scroll box,
                                        so a floating list gets clipped by it. */}
                                    {fyOpen && (
                                      <div className="mb-1 max-h-36 overflow-y-auto bg-white border border-gray-200 rounded-lg">
                                        {fyChoices.map((y) => (
                                          <button key={y} type="button"
                                            onClick={() => { setFyOpen(false); setQuickFy(y); }}
                                            className={`block w-full px-2 py-1.5 text-xs text-center hover:bg-gray-100 ${y === shownFy ? 'font-semibold text-white' : 'text-gray-700'}`}
                                            style={y === shownFy ? { backgroundColor: themeColor } : {}}>
                                            FY {y}–{String(y + 1).slice(2)}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <button type="button" onClick={() => setFyOpen((v) => !v)}
                                      className="w-full relative pl-2 pr-6 py-1.5 rounded-lg text-xs font-semibold text-white text-center transition-all hover:opacity-90"
                                      style={{ backgroundColor: themeColor }}>
                                      FY {shownFy}–{String(shownFy + 1).slice(2)}
                                      <ChevronDownIcon className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white transition-transform ${fyOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {fyMonths.map((m) => (
                                      <button key={m.start} type="button" disabled={!m.inData}
                                        onClick={() => applyMonth(new Date(m.y, m.mi, 1))}
                                        title={`${m.label} ${m.y}`}
                                        className={`px-1 py-1.5 rounded-lg text-xs font-medium transition-all text-center ${m.selected
                                          ? 'text-white'
                                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50'}`}
                                        style={m.selected ? { backgroundColor: themeColor } : {}}>
                                        {m.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* RIGHT: the picked month's dates. Clicking a month on the
                                    left takes the WHOLE month; clicking two dates here
                                    narrows the period to a range inside that month. */}
                                <div className="sm:w-[56%]">
                                  <h3 className="text-xs font-semibold text-gray-800 mb-2 text-center">
                                    {calMonth ? calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Dates'}
                                  </h3>
                                  <div className="border border-gray-200 rounded-lg p-1 bg-gray-50/50 flex justify-center">
                                    <DatePicker
                                      /* remount on month change so the grid jumps to it */
                                      key={calMonth ? `${calMonth.getFullYear()}-${calMonth.getMonth()}` : 'none'}
                                      openToDate={calMonth || undefined}
                                      selected={dayRange[0]}
                                      startDate={dayRange[0] || (fromDate ? new Date(fromDate + 'T00:00:00') : null)}
                                      endDate={dayRange[1] || (dayRange[0] ? null : (toDate ? new Date(toDate + 'T00:00:00') : null))}
                                      selectsRange
                                      onChange={applyDayRange}
                                      inline
                                      disabledKeyboardNavigation
                                      minDate={calBounds.min}
                                      maxDate={calBounds.max}
                                      calendarClassName="custom-calendar"
                                      dateFormat="dd/MM/yyyy"
                                    />
                                  </div>
                                  <div className="mt-2 flex items-center justify-center gap-2">
                                    <p className="text-[11px] text-gray-600">
                                      Period:{' '}
                                      <b>{fromDate && toDate ? `${fmtDayYr(fromDate)} → ${fmtDayYr(toDate)}` : '—'}</b>
                                    </p>
                                    {activePeriod === 'range' && calMonth && (
                                      <button type="button"
                                        onClick={() => applyMonth(calMonth)}
                                        className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                                        Whole month
                                      </button>
                                    )}
                                  </div>
                                  <p className="mt-1 text-[10px] text-gray-400 text-center">
                                    Click two dates for a range inside this month
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <button onClick={() => generate()} disabled={generating || !dataRange.max || fyReport}
                      title={fyReport ? 'This report always covers the current financial year' : undefined}
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
                            <td className={tdCls}>{inrT(b.total_rows)}</td>
                            <td className={`${tdCls} text-green-700 font-medium`}>{inrT(b.inserted_rows)}</td>
                            <td className={`${tdCls} text-blue-700 font-medium`}>{inrT(b.updated_rows)}</td>
                            <td className={tdCls}>{inrT(b.duplicate_rows)}</td>
                            <td className={tdCls}>{inrT(b.skipped_rows)}</td>
                            <td className={tdCls}>{b.uploaded_at ? new Date(b.uploaded_at).toLocaleString('en-GB') : '-'}</td>
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
                                {c.extra ? (v ?? '-')
                                  : c.key === 'net_taxable_amount' ? inr(v)
                                    : c.key === 'claim_invoice_no' ? highlightMatch(v, previewQuery)
                                      : (v ?? '-')}
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
                        <tr><td colSpan={previewCols.length + 1} className="text-center py-2 text-[11px] text-gray-400 border border-gray-400">
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
              {canExport && (
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
                      [`Current ${nm} Run-Rate`, rr ? '₹ ' + lakh(rr.cur) + ' /day' : '-', null],
                      [`Required ${nm} Run-Rate`, rr ? '₹ ' + lakh(rr.req) + ' /day' : '-', null],
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

            {/* Report type */}
            <div className="px-3 pb-2 flex flex-wrap items-end gap-2">
              <div className="flex flex-col">
                <label className="text-[10px] font-medium text-gray-500 mb-0.5">Select report type</label>
                <HoverSelect value={reportType} onChange={setReportType}
                  options={REPORT_TYPES.map((t) => ({ value: t.key, label: t.name, hint: t.hint }))} />
              </div>
              {/* These three cover a WHOLE financial year — the one already
                chosen in the period box above (its FY button), so there is no
                second year picker here. The month inside it does not apply. */}
              {fyReport && (
                <span className="text-[11px] text-gray-500 pb-1">
                  Whole FY {shownFy}–{String(shownFy + 1).slice(2)} — change it with the
                  <b> FY</b> button in the period box above
                </span>
              )}
              {reportType === 'branch_wise' && (
                <div className="relative flex flex-col ml-auto"
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
                    <div className="absolute left-0 top-full z-50 pt-1 w-60 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl p-1.5">
                      <button onClick={() => setBranchSel([])}
                        className={`w-full text-left px-2 py-1 text-xs font-semibold rounded hover:bg-gray-100 ${branchSel.length === 0 ? 'text-white' : 'text-gray-700'}`}
                        style={branchSel.length === 0 ? { backgroundColor: themeColor } : {}}>
                        Unselect All Branches
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
                  )}
                </div>
              )}
            </div>

            {/* ===== FY / Quarterly / Month-wise reports =====
              Target vs achievement for the CURRENT financial year, straight
              from the AOP Master — deliberately independent of the period
              picker. One of them fills the page when picked in the dropdown. */}
            {FY_TYPES.includes(reportType) && (() => {
              const rows2 = fySum?.rows || [];
              const months = fySum?.months || [];
              const quarters = fySum?.quarters || [];
              const fyName = fySum ? `FY ${fySum.fy}–${String(fySum.fy + 1).slice(2)}` : '';
              const mLbl = (m) => new Date(`${m}-01T00:00:00`)
                .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
              // one branch's target / sale summed over a set of months
              const sumOf = (r, field, ms) => ms.reduce((a, m) => a + (r[field]?.[m] || 0), 0);
              // …and the same summed down a set of branches (a region, or all)
              const colOf = (field, ms, rs = rows2) =>
                rs.reduce((a, r) => a + sumOf(r, field, ms), 0);
              const pctOf = (a, t) => (t ? +((a / t) * 100).toFixed(1) : null);

              const SIDES = [['spare', 'SPARE'], ['labour', 'LABOUR']];
              const fieldsOf = (side) => (side === 'spare'
                ? ['spare_target', 'spare_sale'] : ['labour_target', 'labour_sale']);

              // ---- run-rate maths -------------------------------------------
              // The FY's working days come from the AOP Master (MH and KA can
              // differ) and split at the last sales date: what has been sold per
              // working day so far, and what the rest of the year now needs.
              // The split comes from the server, which owns the calendar:
              // Sundays and the AOP Master's ticked holidays are already out of
              // these counts, per region.
              const wdSplit = (region) => (fySum?.wd_split?.[
                (region || '').toUpperCase() === 'KA' ? 'KA' : 'MH']
                || { total: 0, elapsed: 0, left: 0 });
              // one branch's pair of run-rates for a side
              const rrOfRow = (r, tf, sf) => {
                const { elapsed, left } = wdSplit(r.region);
                const target = sumOf(r, tf, months), sale = sumOf(r, sf, months);
                return {
                  cur: elapsed > 0 ? sale / elapsed : 0,
                  req: left > 0 ? Math.max(0, target - sale) / left : 0,
                };
              };
              // a group's run-rate is its branches' rates added up
              const rrOfRows = (rs, tf, sf) => rs.reduce((a, r) => {
                const x = rrOfRow(r, tf, sf);
                return { cur: a.cur + x.cur, req: a.req + x.req };
              }, { cur: 0, req: 0 });

              // Branches grouped by region — Maharashtra first, then Karnataka,
              // then anything else — so each region can close with its own
              // subtotal before the grand total, like the main report does.
              const REG_NAME = { MH: 'Maharashtra', KA: 'Karnataka' };
              const regionGroups = (() => {
                const by = {};
                rows2.forEach((r) => {
                  const k = (r.region || 'OTHER').toUpperCase();
                  (by[k] = by[k] || []).push(r);
                });
                const order = ['MH', 'KA'].filter((k) => by[k])
                  .concat(Object.keys(by).filter((k) => k !== 'MH' && k !== 'KA').sort());
                return order.map((k) => ({
                  key: k,
                  label: `${REG_NAME[k] || (k === 'OTHER' ? 'Other' : k)} Total`,
                  rows: by[k],
                }));
              })();

              // Compact cells — the tables fill the page width, and only scroll
              // sideways once their own minimum (below) no longer fits.
              const thF = 'px-1 py-0.5 text-center text-[10px] font-semibold text-black leading-tight bg-gray-50 border border-gray-400 whitespace-nowrap';
              // The frozen Branch column is fixed and narrow — long names
              // truncate with the full text on hover, so the quarters and months
              // get the width instead.
              const BR_W = 'w-[104px] min-w-[104px] max-w-[104px]';
              const thS = `${thF} sticky left-0 z-20 ${BR_W}`;
              const tdF = 'px-1 py-0.5 border border-gray-400 text-right whitespace-nowrap text-[10px]';
              const tdS = `px-1 py-0.5 border border-gray-400 text-left text-[10px] font-medium sticky left-0 z-10 bg-white ${BR_W} overflow-hidden text-ellipsis whitespace-nowrap`;
              const tdST = `${tdS} bg-gray-50`;
              // Region-total label cell: the frozen column paints its own
              // background, so it carries the row's grey instead of bg-white.
              const tdSR = `${tdS.replace('bg-white', 'pms-region-total-cell')} font-semibold`;
              // Same label cell WITHOUT the sticky/frozen treatment — used by the
              // FY table, which fits on screen and needs no frozen column.
              const tdPlain = 'px-1.5 py-1 border border-gray-400 text-left text-[10px] font-medium whitespace-nowrap';
              // The Branch column is frozen while the months scroll under it, so
              // it closes with a DARK rule plus a soft shadow. A plain 1px grey
              // border on a sticky cell is exactly what browsers drop at
              // fractional zoom, which left the column looking open on the right;
              // the inset shadow paints the same line as part of the cell's box.
              const edgeS = {
                borderRight: '1px solid #6b7280',
                boxShadow: 'inset -1px 0 0 0 #6b7280, 2px 0 5px -2px rgba(20,32,28,.22)',
              };
              // % cells reuse the report's own good / mid / low fills
              const pctTd = (p) => `${tdF} font-semibold ${pctCellCls(p)}`;
              const dashP = (p) => (p == null || !p ? '-' : p);

              // three value cells (Target · Achieved · %) for one month set
              const trio = (r, tf, sf, ms, k) => {
                const t = sumOf(r, tf, ms), a = sumOf(r, sf, ms), p = pctOf(a, t);
                return (
                  <React.Fragment key={k}>
                    <td className={tdF}>{lakhN(t)}</td>
                    <td className={`${tdF} font-medium`}>{lakhN(a)}</td>
                    <td className={pctTd(p)}>{dashP(p)}</td>
                  </React.Fragment>
                );
              };
              // rs = the branches this total covers (one region, or every row)
              const trioTot = (tf, sf, ms, k, rs = rows2) => {
                const t = colOf(tf, ms, rs), a = colOf(sf, ms, rs), p = pctOf(a, t);
                return (
                  <React.Fragment key={k}>
                    <td className={tdF}>{lakhN(t)}</td>
                    <td className={`${tdF} font-bold`}>{lakhN(a)}</td>
                    <td className={pctTd(p)}>{dashP(p)}</td>
                  </React.Fragment>
                );
              };

              // Report 1 — one row per branch, Spare then Labour for the whole FY.
              // Nothing scrolls here (seven columns in a 65 % box), so the Branch
              // column is a NORMAL column: no frozen edge, no shadow — just the
              // same grid line as the rest of the table.
              const fyTable = () => (
                <HScrollBox watch={`fysum-${rows2.length}`}>
                  <table className="w-full text-[10px] border-collapse min-w-[860px]">
                    <thead>
                      {/* SPARE / LABOUR bands over their five columns each, the
                        same grouping the Quarterly table uses */}
                      <tr>
                        <th className={thF} />
                        {SIDES.map(([side, label]) => (
                          <th key={side} className={thF} colSpan={5}
                            style={{ backgroundColor: themeColor, color: '#fff' }}>{label}</th>
                        ))}
                      </tr>
                      <tr>
                        <th className={thF}>Branch</th>
                        <th className={thF}>{colTag('Spare Target', 'A')}</th>
                        <th className={thF}>{colTag('Spare Achi.', 'B')}</th>
                        <th className={thF}>{pctHead('Spare %', 'B / A × 100')}</th>
                        <th className={thF}>{pctHead('Spare Current', 'Run-Rate /day')}</th>
                        <th className={thF}>{pctHead('Spare Required', 'Run-Rate /day')}</th>
                        <th className={thF}>{colTag('Labour Target', 'C')}</th>
                        <th className={thF}>{colTag('Labour Achi.', 'D')}</th>
                        <th className={thF}>{pctHead('Labour %', 'D / C × 100')}</th>
                        <th className={thF}>{pctHead('Labour Current', 'Run-Rate /day')}</th>
                        <th className={thF}>{pctHead('Labour Required', 'Run-Rate /day')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionGroups.map((g) => (
                        <React.Fragment key={g.key}>
                          {g.rows.map((r) => {
                            const rrS = rrOfRow(r, 'spare_target', 'spare_sale');
                            const rrL = rrOfRow(r, 'labour_target', 'labour_sale');
                            return (
                              <tr key={r.branch_id} className="hover:bg-gray-50/60">
                                <td className={tdPlain} title={r.branch_name}>{r.branch_name}</td>
                                {trio(r, 'spare_target', 'spare_sale', months, 's')}
                                <td className={tdF}>{lakhN(rrS.cur)}</td>
                                <td className={tdF}>{lakhN(rrS.req)}</td>
                                {trio(r, 'labour_target', 'labour_sale', months, 'l')}
                                <td className={tdF}>{lakhN(rrL.cur)}</td>
                                <td className={tdF}>{lakhN(rrL.req)}</td>
                              </tr>
                            );
                          })}
                          {/* the region's own subtotal, before the next region */}
                          {(() => {
                            const rrS = rrOfRows(g.rows, 'spare_target', 'spare_sale');
                            const rrL = rrOfRows(g.rows, 'labour_target', 'labour_sale');
                            return (
                              <tr className="pms-region-total font-semibold">
                                <td className={tdPlain}>{g.label}</td>
                                {trioTot('spare_target', 'spare_sale', months, 's', g.rows)}
                                <td className={tdF}>{lakhN(rrS.cur)}</td>
                                <td className={tdF}>{lakhN(rrS.req)}</td>
                                {trioTot('labour_target', 'labour_sale', months, 'l', g.rows)}
                                <td className={tdF}>{lakhN(rrL.cur)}</td>
                                <td className={tdF}>{lakhN(rrL.req)}</td>
                              </tr>
                            );
                          })()}
                        </React.Fragment>
                      ))}
                      {(() => {
                        const rrS = rrOfRows(rows2, 'spare_target', 'spare_sale');
                        const rrL = rrOfRows(rows2, 'labour_target', 'labour_sale');
                        return (
                          <tr className="pms-total-row font-bold">
                            <td className={tdPlain}>Grand Total</td>
                            {trioTot('spare_target', 'spare_sale', months, 's')}
                            <td className={tdF}>{lakhN(rrS.cur)}</td>
                            <td className={tdF}>{lakhN(rrS.req)}</td>
                            {trioTot('labour_target', 'labour_sale', months, 'l')}
                            <td className={tdF}>{lakhN(rrL.cur)}</td>
                            <td className={tdF}>{lakhN(rrL.req)}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </HScrollBox>
              );

              // Report 2 — ONE table holding both sides: SPARE then LABOUR, each
              // split into its groups (Q1..Q4), each group Target · Achi. · %.
              const combinedTable = (groups, key) => (
                <HScrollBox watch={`${key}-${rows2.length}-${groups.length}`}>
                  <table className="w-full text-[10px] border-collapse"
                    style={{ minWidth: 104 + groups.length * 2 * 3 * 46 }}>
                    <thead>
                      <tr>
                        <th className={thS} rowSpan={3} style={edgeS}>Branch</th>
                        {SIDES.map(([side, label]) => (
                          <th key={side} className={thF} colSpan={groups.length * 3}
                            style={{ backgroundColor: themeColor, color: '#fff' }}>{label}</th>
                        ))}
                      </tr>
                      <tr>
                        {SIDES.map(([side]) => groups.map((g) => (
                          <th key={`${side}-${g.label}`} className={thF} colSpan={3}>{g.label}</th>
                        )))}
                      </tr>
                      <tr>
                        {/* every group is Target (A) · Achi. (B) · % = B / A */}
                        {SIDES.map(([side]) => groups.map((g) => (
                          <React.Fragment key={`${side}-${g.label}-h`}>
                            <th className={thF}>{colTag('Target', 'A')}</th>
                            <th className={thF}>{colTag('Achi.', 'B')}</th>
                            <th className={thF}>{pctHead('%', 'B / A × 100')}</th>
                          </React.Fragment>
                        )))}
                      </tr>
                    </thead>
                    <tbody>
                      {regionGroups.map((rg) => (
                        <React.Fragment key={rg.key}>
                          {rg.rows.map((r) => (
                            <tr key={r.branch_id} className="hover:bg-gray-50/60">
                              <td className={tdS} style={edgeS} title={r.branch_name}>{r.branch_name}</td>
                              {SIDES.map(([side]) => {
                                const [tf, sf] = fieldsOf(side);
                                return groups.map((g) => trio(r, tf, sf, g.months, `${side}-${g.label}`));
                              })}
                            </tr>
                          ))}
                          <tr className="pms-region-total font-semibold">
                            <td className={tdSR} style={edgeS}>{rg.label}</td>
                            {SIDES.map(([side]) => {
                              const [tf, sf] = fieldsOf(side);
                              return groups.map((g) =>
                                trioTot(tf, sf, g.months, `${side}-${g.label}`, rg.rows));
                            })}
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr className="pms-total-row font-bold">
                        <td className={tdST} style={edgeS}>Grand Total</td>
                        {SIDES.map(([side]) => {
                          const [tf, sf] = fieldsOf(side);
                          return groups.map((g) => trioTot(tf, sf, g.months, `${side}-${g.label}`));
                        })}
                      </tr>
                    </tbody>
                  </table>
                </HScrollBox>
              );

              // Report 3 — one table per side (12 months are too many to sit
              // side by side), same compact columns; the branch column stays put
              // while the months scroll.
              const groupTable = (side, groups, key) => {
                const [tf, sf] = fieldsOf(side);
                return (
                  <div key={side}>
                    <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                      style={{ backgroundColor: themeColor }}>
                      <span>{side === 'spare' ? 'SPARE' : 'LABOUR'}</span>
                      <span className="font-medium text-white/80">{fyName} · Lakh ₹</span>
                    </div>
                    <HScrollBox watch={`${key}-${side}-${rows2.length}-${groups.length}`}>
                      <table className="w-full text-[10px] border-collapse"
                        style={{ minWidth: 104 + groups.length * 3 * 46 }}>
                        <thead>
                          <tr>
                            <th className={thS} rowSpan={2} style={edgeS}>Branch</th>
                            {groups.map((g) => (
                              <th key={g.label} className={thF} colSpan={3}>{g.label}</th>
                            ))}
                          </tr>
                          <tr>
                            {groups.map((g) => (
                              <React.Fragment key={g.label}>
                                <th className={thF}>{colTag('Target', 'A')}</th>
                                <th className={thF}>{colTag('Achi.', 'B')}</th>
                                <th className={thF}>{pctHead('%', 'B / A × 100')}</th>
                              </React.Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {regionGroups.map((rg) => (
                            <React.Fragment key={rg.key}>
                              {rg.rows.map((r) => (
                                <tr key={r.branch_id} className="hover:bg-gray-50/60">
                                  <td className={tdS} style={edgeS} title={r.branch_name}>{r.branch_name}</td>
                                  {groups.map((g) => trio(r, tf, sf, g.months, g.label))}
                                </tr>
                              ))}
                              <tr className="pms-region-total font-semibold">
                                <td className={tdSR} style={edgeS}>{rg.label}</td>
                                {groups.map((g) => trioTot(tf, sf, g.months, g.label, rg.rows))}
                              </tr>
                            </React.Fragment>
                          ))}
                          <tr className="pms-total-row font-bold">
                            <td className={tdST} style={edgeS}>Grand Total</td>
                            {groups.map((g) => trioTot(tf, sf, g.months, g.label))}
                          </tr>
                        </tbody>
                      </table>
                    </HScrollBox>
                  </div>
                );
              };

              // Each of the three sits in its own panel: the title bar is the
              // toggle, so a click opens or closes that report and the other two
              // stay where they are.
              const panel = (key, title, sub, body) => (
                <div className="mx-3 mb-3 border border-gray-200 rounded-lg overflow-hidden">
                  <button type="button" onClick={() => toggleFy3(key)}
                    className="w-full px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-4 hover:opacity-95"
                    style={{ backgroundColor: themeDark }}>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2 text-[10px]">{fyOpen3[key] ? '▾' : '▸'}</span>
                      {title}
                    </span>
                    <span className="font-medium text-white/80 whitespace-nowrap">{sub}</span>
                  </button>
                  {fyOpen3[key] && (!fySum
                    ? <div className="p-4 text-center text-xs text-gray-500">
                        {fySumLoading ? 'Loading the FY report…' : 'No data'}
                      </div>
                    : body)}
                </div>
              );

              return (
                <>
                  {panel('fy', `Spares and Labour (FY) — ${fyName}`,
                    'Whole financial year · Lakh ₹ · Run-Rate per working day',
                    fyTable())}
                  {panel('quarter', `Spares and Labour (Quarterly) — ${fyName}`,
                    'Q1 Apr–Jun · Q2 Jul–Sep · Q3 Oct–Dec · Q4 Jan–Mar · Lakh ₹',
                    combinedTable(quarters, 'qtr'))}
                  {panel('month', `Spares and Labour (Month) — ${fyName}`,
                    'Apr → Mar · Lakh ₹',
                    <div className="space-y-2 p-2">
                      {['spare', 'labour'].map((s) => groupTable(s,
                        months.map((m) => ({ label: mLbl(m), months: [m] })), 'mon'))}
                    </div>)}
                </>
              );
            })()}

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
              // Compact header / cell padding for the wide 14-column table
              const thBA = `${thT} px-1 break-words`;
              const tdBA = `${tdT} px-1`;
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
                    ['service_head', 'Service Report Type-wise'], ['category', 'Category-wise (Spare)']].map(([k, n]) => (
                      <label key={k} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer select-none">
                        <input type="checkbox" checked={detailSecs[k]}
                          onChange={() => setDetailSecs((p) => ({ ...p, [k]: !p[k] }))}
                          className="h-3 w-3 cursor-pointer" style={{ accentColor: themeColor }} />
                        {n}
                      </label>
                    ))}
                    {branchDetailLoading && <span className="text-[11px] text-gray-400">Loading…</span>}
                  </div>
                  {/* Narrow columns: fixed layout + break-words, so a long
                    title wraps onto extra header lines ("vs AOP / Target %")
                    instead of stretching its column. */}
                  <HScrollBox watch={`analysis-${rowsB.length}`}>
                    <table className="w-full text-[11px] border-collapse min-w-[820px]"
                      style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '6%' }} />
                        {Array.from({ length: 12 }, (_, ci) => (
                          <col key={ci} style={{ width: `${84 / 12}%` }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          <th className={`${thBA} text-left`} rowSpan={2}>Branch</th>
                          <th className={thBA} rowSpan={2}>Rank</th>
                          <th className={thBA} colSpan={6}>SPARE</th>
                          <th className={thBA} colSpan={6}>LABOUR</th>
                        </tr>
                        <tr>
                          {[['Target', null, 'A'], ['Total Sale', null, 'B'],
                            ['vs AOP Target %', 'B / A × 100'],
                            ['Invoice Count'], ['Current Run-Rate /day'], ['Required Run-Rate /day'],
                            ['Target', null, 'C'], ['Total Sale', null, 'D'],
                            ['vs AOP Target %', 'D / C × 100'],
                            ['Invoice Count'], ['Current Run-Rate /day'], ['Required Run-Rate /day']]
                            .map(([h, f, tag], i) => (
                              <th key={i} className={thBA}>
                                {f ? pctHead(h, f) : tag ? colTag(h, tag) : h}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rowsB.map((b) => {
                          const half = (tgt, sale, pct, inv, rr) => (
                            <>
                              {/* box title says "Values in Lakh ₹" — bare
                                numbers, the unit is not repeated per cell */}
                              <td className={`${tdBA} text-right`}>{lakhN(tgt)}</td>
                              <td className={`${tdBA} text-right`}>{lakhN(sale)}</td>
                              <td className={`${tdBA} text-right font-semibold ${pctCellCls(pct)}`}>
                                {!pct ? '-' : pct.toFixed(1)}
                              </td>
                              <td className={`${tdBA} text-center`}>{inrT(inv)}</td>
                              <td className={`${tdBA} text-right`}>{lakhN(rr?.cur)}</td>
                              <td className={`${tdBA} text-right`}>{lakhN(rr?.req)}</td>
                            </>
                          );
                          return (
                            <tr key={b.id} className="hover:bg-gray-50/60">
                              <td className={`${tdBA} font-medium`} style={{ whiteSpace: 'normal' }}
                                title={b.person || ''}>
                                <div className="leading-tight break-words">
                                  {b.name} <span className="text-gray-400">({b.region})</span>
                                </div>
                              </td>
                              <td className={`${tdBA} text-center font-bold pms-accent`}>
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
                    // % = sale against the SELECTED branches' AOP target (bare
                    // number; the column title carries the %). Only the months
                    // report has a per-row target — everywhere else a row is
                    // measured against the period's whole target, so the column
                    // adds up to the overall achievement.
                    const dP = (v, t) => (t && Number(v) ? ((v / t) * 100).toFixed(1) : '-');
                    const fmtD = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                    const wk = branchDetail.weeks || [];
                    const wTot = wk.reduce((a, w) => ({
                      part: a.part + (w.part || 0), labour: a.labour + (w.labour || 0),
                      total: a.total + (w.total || 0), invoices: a.invoices + (w.invoices || 0),
                      st: a.st + (w.spare_target || 0), lt: a.lt + (w.labour_target || 0),
                    }), { part: 0, labour: 0, total: 0, invoices: 0, st: 0, lt: 0 });
                    // a week's own slice of the AOP target (spread over working days)
                    const wT = (w) => ((w.spare_target || 0) + (w.labour_target || 0));
                    const secHead = (title) => (
                      <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                        style={{ backgroundColor: themeColor }}>
                        <span>{title}</span>
                        <span className="font-medium text-white/80">Selected branches only · Lakh ₹ · % vs AOP target</span>
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
                            <table className="w-full text-[11px] border-collapse min-w-[420px]">
                              <thead>
                                <tr>
                                  <th className={`${thT} whitespace-nowrap`}>Name</th>
                                  <th className={`${thT} whitespace-nowrap`}>{colTag('Spare Sale', 'A')}</th>
                                  <th className={`${thT} whitespace-nowrap`}>{pctHead('Spare %', 'A / A Total × 100')}</th>
                                  <th className={`${thT} whitespace-nowrap`}>{colTag('Labour Sale', 'B')}</th>
                                  <th className={`${thT} whitespace-nowrap`}>{pctHead('Labour %', 'B / B Total × 100')}</th>
                                  <th className={`${thT} whitespace-nowrap`}>{colTag('Total Sale', 'C')}</th>
                                  <th className={`${thT} whitespace-nowrap`}>{pctHead('Total %', 'C / C Total × 100')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(rows3 || []).length === 0 ? (
                                  <tr><td colSpan={7} className="text-center py-3 text-gray-500 border border-gray-400">No data</td></tr>
                                ) : (
                                  <>
                                    {rows3.map((r, i) => (
                                      <tr key={i} className="hover:bg-gray-50/60">
                                        <td className={`${tdT} font-medium text-center`}>{r.name}</td>
                                        <td className={`${tdT} text-right`}>{lakhN(r.part)}</td>
                                        <td className={`${tdT} text-right`}>{dP(r.part, t3.part)}</td>
                                        <td className={`${tdT} text-right`}>{lakhN(r.labour)}</td>
                                        <td className={`${tdT} text-right`}>{dP(r.labour, t3.labour)}</td>
                                        <td className={`${tdT} text-right font-semibold`}>{lakhN(r.total)}</td>
                                        <td className={`${tdT} text-right`}>{dP(r.total, t3.total)}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-gray-50 font-bold">
                                      <td className={`${tdT} text-center`}>Total Sale</td>
                                      <td className={`${tdT} text-right`}>{lakhN(t3.part)}</td>
                                      <td className={`${tdT} text-right`}>{t3.part ? 100 : '-'}</td>
                                      <td className={`${tdT} text-right`}>{lakhN(t3.labour)}</td>
                                      <td className={`${tdT} text-right`}>{t3.labour ? 100 : '-'}</td>
                                      <td className={`${tdT} text-right`}>{lakhN(t3.total)}</td>
                                      <td className={`${tdT} text-right`}>{t3.total ? 100 : '-'}</td>
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
                      /* ONE two-column grid for EVERY breakdown box (Week,
                         Month, Segment, Service Report Type, Category). They
                         flow 1|2 / 3|4 / 5 with no gap left behind when a
                         section is switched off. */
                      <div className="p-2 border-t border-gray-200 grid grid-cols-2 max-xl:grid-cols-1 gap-2 items-start">
                        {/* -------- Week-wise (both Spares + Labour) -------- */}
                        {detailSecs.weeks && (() => {
                          // TRANSPOSED: the weeks run ACROSS as columns (Week +
                          // its Period are the two header rows) and the metrics
                          // run DOWN as rows. More weeks simply make the table
                          // wider — HScrollBox scrolls it left ↔ right — and the
                          // metric-name column is sticky so it stays in view.
                          // Tight columns: a week only ever holds a Lakh figure
                          // or a count, so 62 px is plenty and more weeks fit
                          // before the table has to scroll.
                          const thWk = 'px-1 py-0.5 text-center text-[10px] font-semibold text-black leading-tight bg-gray-50 border border-gray-400 whitespace-nowrap min-w-[62px]';
                          const tdWk = 'px-1 py-0.5 border border-gray-400 whitespace-nowrap text-[10px]';
                          // The metric-name column is frozen while the weeks
                          // scroll under it. Its right-hand rule is drawn as an
                          // inset shadow as well as a border — on a sticky cell
                          // the plain 1px border is dropped at fractional zoom,
                          // which is why that line kept disappearing.
                          const edgeW = {
                            borderRight: '1px solid #6b7280',
                            boxShadow: 'inset -1px 0 0 0 #6b7280, 2px 0 5px -2px rgba(20,32,28,.18)',
                          };
                          // The metrics run DOWN here, so the A · B · C keys get
                          // their own narrow column in front of the names rather
                          // than being squeezed into them. Both columns are frozen;
                          // only the second one carries the closing rule.
                          const thLbl = `${thWk} sticky left-0 z-20 min-w-[132px]`;
                          const tdLbl = `${tdWk} sticky left-0 z-10 bg-gray-50 font-semibold text-left`;
                          const mRow = (label, cell, total, opts = {}) => (
                            <tr key={label} className="hover:bg-gray-50/60">
                              <td className={tdLbl} style={edgeW}>{label}</td>
                              {wk.map((w) => (
                                <td key={w.week}
                                  className={`${tdWk} ${opts.center ? 'text-center' : 'text-right'} ${opts.cls || ''}`}>
                                  {cell(w)}
                                </td>
                              ))}
                              <td className={`${tdWk} ${opts.center ? 'text-center' : 'text-right'} bg-gray-50 font-bold`}>
                                {total}
                              </td>
                            </tr>
                          );
                          return (
                            /* Half-width box like the others; when the weeks no
                               longer fit, the columns keep their min width and
                               HScrollBox scrolls the table left ↔ right. */
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                              {secHead(`Week-wise Sales — ${wk.length} week${wk.length > 1 ? 's' : ''} in period`)}
                              <HScrollBox watch={`weeks-${wk.length}`}>
                                <table className="w-full text-[10px] border-collapse">
                                  <thead>
                                    <tr>
                                      <th className={thLbl} style={edgeW}>Week</th>
                                      {wk.map((w) => (
                                        <th key={w.week} className={thWk}>Week {w.week}</th>
                                      ))}
                                      <th className={thWk}>Total Sale</th>
                                    </tr>
                                    <tr>
                                      <th className={thLbl} style={edgeW}>Period</th>
                                      {wk.map((w) => (
                                        <th key={w.week} className={`${thWk} font-medium`}>
                                          {fmtD(w.start)} – {fmtD(w.end)}
                                        </th>
                                      ))}
                                      <th className={`${thWk} font-medium`}>
                                        {wk.length ? `${fmtD(wk[0].start)} – ${fmtD(wk[wk.length - 1].end)}` : '-'}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {wk.length === 0 ? (
                                      <tr><td colSpan={3} className="text-center py-3 text-gray-500 border border-gray-400">No data</td></tr>
                                    ) : (
                                      <>
                                        {mRow('Spare Target (A)', (w) => lakhN(w.spare_target), lakhN(wTot.st))}
                                        {mRow('Spare Sale (B)', (w) => lakhN(w.part), lakhN(wTot.part))}
                                        {mRow('Spare %  (B / A × 100)', (w) => dP(w.part, w.spare_target), dP(wTot.part, wTot.st))}
                                        {mRow('Labour Target (C)', (w) => lakhN(w.labour_target), lakhN(wTot.lt))}
                                        {mRow('Labour Sale (D)', (w) => lakhN(w.labour), lakhN(wTot.labour))}
                                        {mRow('Labour %  (D / C × 100)', (w) => dP(w.labour, w.labour_target), dP(wTot.labour, wTot.lt))}
                                        {mRow('Total Target (E)', (w) => lakhN(wT(w)), lakhN(wTot.st + wTot.lt))}
                                        {mRow('Total Sale (F)', (w) => lakhN(w.total), lakhN(wTot.total), { cls: 'font-semibold' })}
                                        {mRow('Total %  (F / E × 100)', (w) => dP(w.total, wT(w)), dP(wTot.total, wTot.st + wTot.lt))}
                                        {mRow('Invoice Count', (w) => inrT(w.invoices), inrT(wTot.invoices), { center: true })}
                                      </>
                                    )}
                                  </tbody>
                                </table>
                              </HScrollBox>
                            </div>
                          );
                        })()}
                        {/* Month-wise + Segment-wise are ONE grid cell, stacked:
                          both are short tables, so together they fill the column
                          next to the tall Week-wise box instead of leaving a
                          hole under a single short one. */}
                        {(detailSecs.months || detailSecs.segment) && (
                        <div className="space-y-2">
                        {/* -------- Month-wise (both Spares + Labour) -------- */}
                        {detailSecs.months && (() => {
                          const mo = branchDetail.months || [];
                          const mTot = mo.reduce((a, m) => ({
                            part: a.part + (m.part || 0), labour: a.labour + (m.labour || 0),
                            total: a.total + (m.total || 0), invoices: a.invoices + (m.invoices || 0),
                            st: a.st + (m.spare_target || 0), lt: a.lt + (m.labour_target || 0),
                          }), { part: 0, labour: 0, total: 0, invoices: 0, st: 0, lt: 0 });
                          // this month's own AOP target for the selected branches
                          const mT = (m) => ((m.spare_target || 0) + (m.labour_target || 0));
                          const mLabel = (m) => new Date(`${m}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                          // Half-width box: narrow columns with the title
                          // wrapping onto two lines ("Spare / Sale") so the
                          // whole table fits without sideways scrolling.
                          // narrow cells: headers wrap onto two lines ("Spare /
                          // Target"), values never wrap
                          const thM = 'px-1 py-0.5 text-center text-[10px] font-semibold text-black leading-tight bg-gray-50 border border-gray-400 break-words';
                          const tdM = 'px-1 py-0.5 border border-gray-400 whitespace-nowrap text-[10px]';
                          return (
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                              {secHead(`Month-wise Sales — ${mo.length} month${mo.length > 1 ? 's' : ''} in period`)}
                              <HScrollBox watch={`months-${mo.length}`}>
                                {/* Auto layout, no colgroup: every column is only as
                                  wide as its own text (the two-line headers keep
                                  them narrow), and HScrollBox scrolls the table
                                  when the box cannot hold all eleven. */}
                                <table className="w-auto text-[10px] border-collapse">
                                  {/* Target first, then what was achieved against it */}
                                  <thead>
                                    <tr>
                                      <th className={thM}>Month</th>
                                      <th className={thM}>{colTag('Spare Target', 'A')}</th>
                                      <th className={thM}>{colTag('Spare Sale', 'B')}</th>
                                      <th className={thM}>{pctHead('Spare %', 'B / A × 100')}</th>
                                      <th className={thM}>{colTag('Labour Target', 'C')}</th>
                                      <th className={thM}>{colTag('Labour Sale', 'D')}</th>
                                      <th className={thM}>{pctHead('Labour %', 'D / C × 100')}</th>
                                      <th className={thM}>{colTag('Total Target', 'E')}</th>
                                      <th className={thM}>{colTag('Total Sale', 'F')}</th>
                                      <th className={thM}>{pctHead('Total %', 'F / E × 100')}</th>
                                      <th className={thM}>Invoice Count</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {mo.length === 0 ? (
                                      <tr><td colSpan={11} className="text-center py-3 text-gray-500 border border-gray-400">No data</td></tr>
                                    ) : (
                                      <>
                                        {mo.map((m) => (
                                          <tr key={m.month} className="hover:bg-gray-50/60">
                                            <td className={`${tdM} font-medium text-center`}>{mLabel(m.month)}</td>
                                            <td className={`${tdM} text-right`}>{lakhN(m.spare_target)}</td>
                                            <td className={`${tdM} text-right`}>{lakhN(m.part)}</td>
                                            <td className={`${tdM} text-right`}>{dP(m.part, m.spare_target)}</td>
                                            <td className={`${tdM} text-right`}>{lakhN(m.labour_target)}</td>
                                            <td className={`${tdM} text-right`}>{lakhN(m.labour)}</td>
                                            <td className={`${tdM} text-right`}>{dP(m.labour, m.labour_target)}</td>
                                            <td className={`${tdM} text-right`}>{lakhN(mT(m))}</td>
                                            <td className={`${tdM} text-right font-semibold`}>{lakhN(m.total)}</td>
                                            <td className={`${tdM} text-right`}>{dP(m.total, mT(m))}</td>
                                            <td className={`${tdM} text-center`}>{inrT(m.invoices)}</td>
                                          </tr>
                                        ))}
                                        <tr className="bg-gray-50 font-bold">
                                          <td className={`${tdM} text-center`}>Total Sale</td>
                                          <td className={`${tdM} text-right`}>{lakhN(mTot.st)}</td>
                                          <td className={`${tdM} text-right`}>{lakhN(mTot.part)}</td>
                                          <td className={`${tdM} text-right`}>{dP(mTot.part, mTot.st)}</td>
                                          <td className={`${tdM} text-right`}>{lakhN(mTot.lt)}</td>
                                          <td className={`${tdM} text-right`}>{lakhN(mTot.labour)}</td>
                                          <td className={`${tdM} text-right`}>{dP(mTot.labour, mTot.lt)}</td>
                                          <td className={`${tdM} text-right`}>{lakhN(mTot.st + mTot.lt)}</td>
                                          <td className={`${tdM} text-right`}>{lakhN(mTot.total)}</td>
                                          <td className={`${tdM} text-right`}>{dP(mTot.total, mTot.st + mTot.lt)}</td>
                                          <td className={`${tdM} text-center`}>{inrT(mTot.invoices)}</td>
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
                        </div>
                        )}
                        {detailSecs.service_head && bdTable('Service Report Type-wise Sales', branchDetail.service_head)}
                            {detailSecs.category && (
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                {secHead('Category-wise Sales (Spare)')}
                                <HScrollBox watch={`bd-category-${cRows.length}`}>
                                  <table className="w-full text-[11px] border-collapse min-w-[280px]">
                                    <thead>
                                      <tr>
                                        <th className={thT}>Category</th>
                                        <th className={thT}>{colTag('Spare Sale', 'A')}</th>
                                        <th className={thT}>{pctHead('Spare %', 'A / A Total × 100')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {cRows.length === 0 ? (
                                        <tr><td colSpan={3} className="text-center py-3 text-gray-500 border border-gray-400">No data</td></tr>
                                      ) : (
                                        <>
                                          {cRows.map((r, i) => (
                                            <tr key={i} className="hover:bg-gray-50/60">
                                              <td className={`${tdT} font-medium text-center`}>{r.name}</td>
                                              <td className={`${tdT} text-right`}>{lakhN(r.part)}</td>
                                              <td className={`${tdT} text-right`}>{dP(r.part, cTot.part)}</td>
                                            </tr>
                                          ))}
                                          <tr className="bg-gray-50 font-bold">
                                            <td className={`${tdT} text-center`}>Total Sale</td>
                                            <td className={`${tdT} text-right`}>{lakhN(cTot.part)}</td>
                                            <td className={`${tdT} text-right`}>{cTot.part ? 100 : '-'}</td>
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

                </div>
              );
            })()}

            {/* "All" — every report in one frame: Spare + Labour side by side,
              then the three breakdown tables below */}
            {reportType === 'all' && (() => {
              // One shared column grid for the stacked breakdown tables
              // (Regional / Segment / Service Head) so their vertical column
              // lines sit at the same position in every table. Category keeps
              // its own natural layout (different column set).
              const breakColgroup = (
                <colgroup>
                  <col style={{ width: '16%' }} />
                  {Array.from({ length: 6 }, (_, ci) => (
                    <col key={ci} style={{ width: '14%' }} />
                  ))}
                </colgroup>
              );
              // Region-wise carries a Target column before each metric, so it
              // needs its own (narrower) grid of nine value columns.
              const breakColgroupT = (
                <colgroup>
                  <col style={{ width: '13%' }} />
                  {Array.from({ length: 9 }, (_, ci) => (
                    <col key={ci} style={{ width: `${87 / 9}%` }} />
                  ))}
                </colgroup>
              );
              // Full-width breakdown table; after each metric a "% of total"
              // share column (row ÷ column total). withTarget (Region-wise only)
              // puts the AOP target of that region IN FRONT of each metric —
              // Target first, then what was achieved against it.
              const renderAllBreakdown = (label, rowsIn, withTarget = false) => {
                // Regions read Maharashtra first, then Karnataka, then the rest
                // — never by whichever sold more. (The server sends them in this
                // order too; this keeps it right on an older server as well.)
                const REG_ORDER = { MH: 0, KA: 1 };
                const rows2 = withTarget
                  ? [...(rowsIn || [])].sort((a, b) =>
                    (REG_ORDER[a.name] ?? 2) - (REG_ORDER[b.name] ?? 2)
                    || String(a.name).localeCompare(String(b.name)))
                  : (rowsIn || []);
                const tot = (rows2 || []).reduce((a, r) => ({
                  part: a.part + (r.part || 0), labour: a.labour + (r.labour || 0),
                  total: a.total + (r.total || 0), invoices: a.invoices + (r.invoices || 0),
                  spare_target: a.spare_target + (r.spare_target || 0),
                  labour_target: a.labour_target + (r.labour_target || 0),
                  total_target: a.total_target + (r.total_target || 0),
                }), { part: 0, labour: 0, total: 0, invoices: 0,
                  spare_target: 0, labour_target: 0, total_target: 0 });
                // % is ACHIEVEMENT AGAINST THE AOP TARGET, not a share of the
                // column total. A region carries its own target; Segment,
                // Service Report Type and Category are not targeted in the AOP
                // Master, so each is measured against the period's WHOLE target
                // — their percentages then add up to the overall achievement.
                // Region-wise is measured against its own AOP target; Segment
                // and Service Report Type have no target of their own, so they
                // keep the plain share of the column total.
                const tgt = (r, kind) => (kind === 'part' ? (r.spare_target || 0)
                  : kind === 'labour' ? (r.labour_target || 0) : (r.total_target || 0));
                const den = (r, kind, totals) => (withTarget ? tgt(r, kind)
                  : kind === 'part' ? totals.part : kind === 'labour' ? totals.labour : totals.total);
                const pct = (v, t) => (t && Number(v) ? (v / t * 100).toFixed(1) : '-');
                const thB = 'px-1 py-1 text-center text-[10px] font-semibold text-black leading-tight bg-gray-50 border border-gray-400';
                // numbers right-aligned (headers stay centered)
                const tdB = 'px-1 py-1 border border-gray-400 text-right whitespace-nowrap text-[10px]';
                const tdP = tdB;   // % share cells — same black text as the rest
                // The letters ALWAYS RESTART AT A in every table. With the AOP
                // targets shown the pairs run A·B, C·D, E·F; WITHOUT them the
                // target columns are not on the table, so the three Sale columns
                // are A, B, C — never B, D, F with A, C and E nowhere to be found.
                const L = withTarget
                  ? { st: 'A', ss: 'B', lt: 'C', ls: 'D', tt: 'E', ts: 'F' }
                  : { ss: 'A', ls: 'B', ts: 'C' };
                // "B / A × 100" against a target, "A / A Total × 100" as a share.
                const pctOf = (sale, tgtL) => (withTarget
                  ? `${sale} / ${tgtL} × 100` : `${sale} / ${sale} Total × 100`);
                return (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                      style={{ backgroundColor: themeColor }}>
                      <span>{label}</span>
                      <span className="font-medium text-white/80">
                        {withTarget ? 'AOP target · Lakh ₹ · % vs target' : 'Lakh ₹ · % of total'}
                      </span>
                    </div>
                    <HScrollBox watch={`${label}-${(rows2 || []).length}`}>
                      <table className={`w-full text-[11px] border-collapse ${withTarget ? 'min-w-[520px]' : 'min-w-[380px]'}`}
                        style={{ tableLayout: 'fixed' }}>
                        {withTarget ? breakColgroupT : breakColgroup}
                        <thead>
                          <tr>
                            <th className={thB}>Name</th>
                            {withTarget && <th className={thB}>{colTag('Spare Target', L.st)}</th>}
                            <th className={thB}>{colTag('Spare Sale', L.ss)}</th>
                            <th className={thB}>{pctHead('Spare %', pctOf(L.ss, L.st))}</th>
                            {withTarget && <th className={thB}>{colTag('Labour Target', L.lt)}</th>}
                            <th className={thB}>{colTag('Labour Sale', L.ls)}</th>
                            <th className={thB}>{pctHead('Labour %', pctOf(L.ls, L.lt))}</th>
                            {withTarget && <th className={thB}>{colTag('Total Target', L.tt)}</th>}
                            <th className={thB}>{colTag('Total Sale', L.ts)}</th>
                            <th className={thB}>{pctHead('Total %', pctOf(L.ts, L.tt))}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(rows2 || []).length === 0 ? (
                            <tr><td colSpan={withTarget ? 10 : 7} className="text-center py-3 text-gray-500 border border-gray-400">No data</td></tr>
                          ) : (
                            <>
                              {rows2.map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50/60">
                                  <td className="px-1.5 py-1 border border-gray-400 font-medium whitespace-nowrap text-center" title={r.name}>{r.name}</td>
                                  {withTarget && <td className={tdB}>{lakhN(r.spare_target)}</td>}
                                  <td className={tdB}>{lakhN(r.part)}</td>
                                  <td className={tdP}>{pct(r.part, den(r, 'part', tot))}</td>
                                  {withTarget && <td className={tdB}>{lakhN(r.labour_target)}</td>}
                                  <td className={tdB}>{lakhN(r.labour)}</td>
                                  <td className={tdP}>{pct(r.labour, den(r, 'labour', tot))}</td>
                                  {withTarget && <td className={`${tdB} font-medium`}>{lakhN(r.total_target)}</td>}
                                  <td className={`${tdB} font-semibold`}>{lakhN(r.total)}</td>
                                  <td className={tdP}>{pct(r.total, den(r, 'total', tot))}</td>
                                </tr>
                              ))}
                              <tr className="pms-total-row font-bold">
                                <td className="px-1.5 py-1 border border-gray-400 text-center">Total Sale</td>
                                {withTarget && <td className={tdB}>{lakhN(tot.spare_target)}</td>}
                                <td className={tdB}>{lakhN(tot.part)}</td>
                                <td className={tdB}>{withTarget ? pct(tot.part, tot.spare_target) : (tot.part ? 100 : '-')}</td>
                                {withTarget && <td className={tdB}>{lakhN(tot.labour_target)}</td>}
                                <td className={tdB}>{lakhN(tot.labour)}</td>
                                <td className={tdB}>{withTarget ? pct(tot.labour, tot.labour_target) : (tot.labour ? 100 : '-')}</td>
                                {withTarget && <td className={tdB}>{lakhN(tot.total_target)}</td>}
                                <td className={tdB}>{lakhN(tot.total)}</td>
                                <td className={tdB}>
                                  {withTarget ? pct(tot.total, tot.total_target) : (tot.total ? 100 : '-')}
                                </td>
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
                // Categories carry no AOP target — the % is the category's share
                // of the spare sale of the period.
                const pct = (v, t) => (t && Number(v) ? (v / t * 100).toFixed(1) : '-');
                const thB = 'px-1 py-1 text-center text-[10px] font-semibold text-black leading-tight bg-gray-50 border border-gray-400';
                // numbers right-aligned (headers stay centered)
                const tdB = 'px-1 py-1 border border-gray-400 text-right whitespace-nowrap text-[10px]';
                const tdName = 'px-1 py-1 border border-gray-400 text-center whitespace-nowrap text-[10px]';
                return (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-2 py-1 text-[11px] font-bold text-white flex items-center justify-between gap-2"
                      style={{ backgroundColor: themeColor }}>
                      <span>Category-wise Sales (Spare)</span>
                      <span className="font-medium text-white/80">Spare only · Lakh ₹ · % of total</span>
                    </div>
                    <HScrollBox watch={`category-${rows2.length}`}>
                      <table className="w-full text-[11px] border-collapse min-w-[280px]">
                        <thead>
                          <tr>
                            <th className={thB}>Category</th>
                            <th className={thB}>{colTag('Spare Sale', 'A')}</th>
                            <th className={thB}>{pctHead('Spare %', 'A / A Total × 100')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows2.length === 0 ? (
                            <tr><td colSpan={3} className="text-center py-3 text-gray-500 border border-gray-400">No data</td></tr>
                          ) : (
                            <>
                              {rows2.map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50/60">
                                  <td className={`${tdName} font-medium`} title={r.name}>{r.name}</td>
                                  <td className={`${tdB} font-medium`}>{lakhN(r.part)}</td>
                                  <td className={tdB}>{pct(r.part, tot.part)}</td>
                                </tr>
                              ))}
                              <tr className="pms-total-row font-bold">
                                <td className={tdName}>Total Sale</td>
                                <td className={tdB}>{lakhN(tot.part)}</td>
                                <td className={tdB}>{tot.part ? 100 : '-'}</td>
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
                <div className="px-3 pb-3 space-y-4">
                  {renderMergedPair(report.spare_rows, report.labour_rows)}
                  {/* The four breakdown boxes sit in a plain two-column grid in
                    fixed reading order — Region, Segment, Service Report Type,
                    Category. Boxes keep their own height (items-start), they
                    are never re-ordered by how tall they are. */}
                  <div className="grid grid-cols-2 max-xl:grid-cols-1 gap-4 items-start">
                    {renderAllBreakdown('Region-wise Sales', report.regional, true)}
                    {renderAllBreakdown('Segment-wise Sales', report.segment)}
                    {renderAllBreakdown('Service Report Type-wise Sales', report.service_head)}
                    {renderAllCategory()}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesLabourReport;
