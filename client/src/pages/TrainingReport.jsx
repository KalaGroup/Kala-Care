import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  AcademicCapIcon, ArrowUpTrayIcon, ArrowPathIcon, MagnifyingGlassIcon,
  XMarkIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon,
  UserIcon, SparklesIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import { SortTh, useSort, useSortedRows } from '../components/TableSort';
import { TopScrollbar } from '../components/reportChrome';

// ============================================================================
// PMS → Training Report
// The service engineers' skill / training master, from the "Training Report"
// Excel export.
//   ① Upload the file (accumulates; a re-upload updates in place)
//   ② Read it two ways — the whole point of the page. Both are TABLES; the row
//      is the summary and CLICKING it opens the full record:
//        By Employee  one row per person → click for all their SKILLS first,
//                     then every other detail the file carries
//        By Skill     one row per skill  → click for everyone who holds it
// Nine columns are fixed (UID NO, EMPLOYEE TICKET NUMBER, FULL NAME,
// OCCUPATION, SKILL, BRANCH NAME, BRANCH ID, HIRE DATE, CURRENT STATUS); every
// other column of the file is DYNAMIC — the server splits them into the ones
// that describe the PERSON and the ones that describe the TRAINING, and this
// page renders whatever it is handed. Adding a column to the export needs no
// code change.
// CURRENT STATUS says who has LEFT: an Inactive engineer keeps every training
// row they ever earned, so the history survives the exit and the status is what
// separates the two — a column, a filter and its own counts.
// Backend: GET /pms/training/report, POST /pms/training/upload
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as the other PMS pages) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

// ---- formatting helpers ----------------------------------------------------
const num = (v) => Number(v || 0).toLocaleString('en-IN');
// '2024-10-13' → '13 Oct 2024'. Values already come date-only from the server.
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// The search compares on the squashed form, so "nilesh salunke", "NILESHSALUNKE"
// and "Nilesh  Salunke" all match the same person — the same trick the SE UID
// master uses to stop one engineer becoming two.
const squash = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Wrap every case-insensitive occurrence of `query` in a yellow <mark>.
const mark = (text, query) => {
  if (text == null || text === '') return '-';
  const s = String(text);
  const q = (query || '').trim();
  if (!q) return s;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = s.split(new RegExp(`(${esc})`, 'ig'));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-yellow-300 rounded-[2px] px-0">{p}</mark>
      : p);
};

// A dynamic cell: date columns print as '13 Oct 2024', everything else raw.
const cellText = (value, col, dateCols) =>
  (value == null || value === '' ? '-' : (dateCols.has(col) ? fmtDate(value) : String(value)));

// The nine fixed columns, in the order the business listed them — the upload
// box's format hint reads this.
const FIXED_COLUMNS = ['UID NO', 'EMPLOYEE TICKET NUMBER', 'FULL NAME', 'OCCUPATION',
  'SKILL', 'BRANCH NAME', 'BRANCH ID', 'HIRE DATE', 'CURRENT STATUS'];

// The status filter. 'unset' is a real answer, not a bug: a file uploaded before
// the CURRENT STATUS column existed leaves it empty, and those employees have to
// stay findable.
const TRAINED_FILTERS = [
  { key: 'all', label: 'Trained & untrained' },
  { key: 'yes', label: 'Trained only' },
  { key: 'no', label: 'No training yet' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Active & Inactive' },
  { key: 'Active', label: 'Active only' },
  { key: 'Inactive', label: 'Inactive (left) only' },
  { key: 'unset', label: 'Status not set' },
];

// The two ways the business reads this file — the page is really one dataset
// with two entry points, so the switch is the first control on the toolbar.
const VIEWS = [
  { key: 'employee', label: 'By Employee', icon: <UserIcon className="h-3.5 w-3.5" /> },
  { key: 'skill', label: 'By Skill', icon: <SparklesIcon className="h-3.5 w-3.5" /> },
];

// ---- shared table chrome ---------------------------------------------------
// Every cell carries its own border and the tables are border-collapse, so the
// screen reads as a real GRID — the same ruled look the exported sheet has.
const TH = 'px-2.5 py-2 border border-gray-300 bg-gray-100 text-gray-700 text-[11px] font-semibold uppercase tracking-wide';
const TD = 'px-2.5 py-2 border border-gray-300 text-gray-700 align-top break-words';
const TABLE = 'w-full text-[11.5px] border-collapse border border-gray-300';

// Column plans for the two list tables (table-fixed, so these are exact).
// Percentages, not pixels: the tables carry a min-width and the box scrolls,
// so the shares hold at every screen size.
// Column plans for the two list tables (table-fixed, so these are exact).
// The numeric / identity columns are sized in PIXELS to fit their longest real
// value — a 12-digit ticket number, '420435_14', '24 Feb 2026' — so none of
// them ever breaks in the middle of a number. '' means AUTO: those columns
// (Occupation, Skill Names, Branch Name) split whatever width is left, which
// is where the prose actually needs it.
//        Sr.    Name     UID    Ticket   Occup. Status  Sk     Trn    SkillNm Branch Bid    Hire
const EMP_COLS = ['52px', '150px', '92px', '106px', '', '84px', '64px', '84px', '', '', '86px', '96px'];
const EMP_MIN = 'min-w-[1360px]';
// The skill list is one row per SKILL, and its people count is the ONLY count on
// it: 'Training Records' was dropped because a repeat training of the same skill
// made that number disagree with the employee count for no reader's benefit.
//          Sr.    Skill    Emp    Branches Names
const SKILL_COLS = ['52px', '190px', '92px', '88px', ''];
const SKILL_MIN = 'min-w-[900px]';

// Summary tile. Module scope on purpose: declared inside the page it would be a
// NEW component type on every keystroke, so React would tear down and rebuild
// them all while the user types in the search.
const Tile = ({ label, value, tone = 'default' }) => (
  <div className={`rounded-lg border px-3 py-2 ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
    <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
    <p className="text-base font-bold text-gray-900 leading-tight">{value}</p>
  </div>
);

// Active / Inactive / not-set as one pill. Module scope for the same reason
// Tile is: declared inside the page it would be a NEW component type on every
// keystroke.
// A ✎ marks a status somebody TYPED, so a reader can always tell the file's
// answer from a person's.
const StatusBadge = ({ value, manual }) => {
  const tone = value === 'Active' ? 'bg-green-100 text-green-800'
    : value === 'Inactive' ? 'bg-red-100 text-red-800'
      : 'bg-gray-100 text-gray-500';
  const title = manual
    ? 'Set by hand — this overrides whatever the uploaded file says'
    : value === 'Inactive'
      ? 'This employee has left — their training history is kept'
      : undefined;
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone} ${manual ? 'ring-1 ring-gray-400' : ''}`}
      title={title}>
      {value || 'Not set'}{manual ? ' ✎' : ''}
    </span>
  );
};

/* ==========================================================================
   Hover-open dropdowns.

   Every list on this toolbar opens when the pointer arrives and closes when it
   leaves — the filters are read far more often than they are clicked. BOTH
   edges are delayed on purpose: with no open delay, sweeping the mouse across
   the toolbar on the way to the table flashes every list open in turn, and with
   no close delay the 4px gap between a button and its own panel would count as
   leaving it. Clicking still works exactly as before, which is what keeps this
   usable on a touch screen, where no mouse event ever fires.
   ========================================================================== */
const HOVER_OPEN_MS = 130;
const HOVER_CLOSE_MS = 200;

const useHoverOpen = (setOpen, holdOpen) => {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const arm = (want) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Never yank the list away from someone typing into it.
      if (!want && holdOpen?.current) return;
      setOpen(want);
    }, want ? HOVER_OPEN_MS : HOVER_CLOSE_MS);
  };
  return { onMouseEnter: () => arm(true), onMouseLeave: () => arm(false) };
};

/* ==========================================================================
   Single-choice filter — one pick, same button as the multi-select.

   A native <select> would be less code, but no browser will open one on hover
   (showPicker() needs a real click), and one filter behaving differently from
   the three beside it is worse than the extra markup. So branch, status and
   trained all use this, and the whole toolbar answers to the pointer alike.
   ========================================================================== */
const PickOne = ({ value, onChange, options, title }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const hover = useHoverOpen(setOpen);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const picked = options.find((o) => o.key === value) || options[0];
  // The first entry is the "everything" option, so anything else is a filter.
  const filtering = picked && options[0] && picked.key !== options[0].key;

  return (
    <div ref={wrapRef} className="relative" {...hover}>
      <button type="button" onClick={() => setOpen((v) => !v)} title={title}
        className={`inline-flex max-w-[230px] items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-[12px] outline-none ${filtering ? 'border-gray-400 font-semibold text-gray-900' : 'border-gray-300 text-gray-700'}`}>
        <span className="truncate">{picked?.label}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 min-w-full w-max max-w-[300px] rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {options.map((o) => (
              <button key={o.key} type="button"
                onClick={() => { onChange(o.key); setOpen(false); }}
                className={`block w-full text-left px-3 py-1.5 border-b border-gray-100 last:border-b-0 text-[12px] ${o.key === value ? 'bg-blue-50 font-semibold text-gray-900' : 'text-gray-800 hover:bg-gray-50'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Multi-select filter — a checkbox list behind one button.

   A plain <select> can only ask about ONE occupation at a time, and the business
   reads this page by groups of them ("the technicians and the engineers
   together"). Nothing ticked means NO filter, which is what keeps the button
   honest: it reads "All occupations" until the first box is ticked.
   ========================================================================== */
const MultiSelect = ({ values, onChange, options, allLabel, noun }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const hover = useHoverOpen(setOpen);

  // a click anywhere else closes the list
  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const toggle = (o) => onChange(values.includes(o)
    ? values.filter((v) => v !== o)
    : [...values, o]);

  // One pick reads as itself; several read as a count, because the names are
  // long enough that two of them would not fit on the toolbar.
  const label = values.length === 0 ? allLabel
    : values.length === 1 ? values[0]
      : `${values.length} ${noun}s`;

  return (
    <div ref={wrapRef} className="relative" {...hover}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        title={values.length ? values.join(', ') : `Filter by ${noun}`}
        className={`inline-flex max-w-[230px] items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-[12px] outline-none ${values.length ? 'border-gray-400 font-semibold text-gray-900' : 'border-gray-300 text-gray-700'}`}>
        <span className="truncate">{label}</span>
        <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-[270px] rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50">
            <button type="button" onClick={() => onChange([...options])}
              className="text-[10px] font-semibold text-gray-600 hover:text-gray-900">Select all</button>
            <span className="text-gray-300">|</span>
            <button type="button" onClick={() => onChange([])}
              className="text-[10px] font-semibold text-gray-600 hover:text-gray-900">Clear</button>
            <span className="ml-auto text-[10px] text-gray-500">
              {values.length
                ? `${values.length} of ${options.length} selected`
                : `${options.length} ${noun}${options.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-gray-500">Nothing to filter on yet</p>
            ) : options.map((o) => (
              <label key={o}
                className="flex cursor-pointer items-start gap-2 px-3 py-1.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)}
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded border-gray-300" />
                <span className="text-[12px] text-gray-800 break-words">{o}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Search box with a dropdown of what is actually in the data.

   The caller hands it the ALREADY-FILTERED list — the very rows the table is
   about to show — so the dropdown can never offer something the table would
   not find, and it costs nothing extra to build. Picking an entry simply puts
   its exact text in the box; the table below narrows to it and the row is
   still what opens the full record.
   ========================================================================== */
const SearchSelect = ({ value, onChange, options, placeholder, label }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  // Hover closes the list — unless the caret is in the box, because moving the
  // mouse aside mid-search must not take the suggestions away.
  const focusedRef = useRef(false);
  const hover = useHoverOpen(setOpen, focusedRef);

  // a click anywhere else closes the list
  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // the highlighted entry has to stay visible while arrowing down a long list
  useEffect(() => {
    if (open) listRef.current?.children?.[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // A long list is capped: past ~60 entries the dropdown stops being a picker
  // and the search box is the faster way in — the footer says so.
  const shown = options.slice(0, 60);
  const pick = (opt) => { onChange(opt.label); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-[240px]" {...hover}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input value={value}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => { focusedRef.current = true; setOpen(true); }}
        onBlur={() => { focusedRef.current = false; }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-14 py-1.5 text-[12px] text-gray-800 outline-none focus:border-gray-400" />
      {value && (
        <button type="button" onClick={() => { onChange(''); setActive(0); }} title="Clear search"
          className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
      <button type="button" onClick={() => { setOpen((v) => !v); setActive(0); }}
        title={open ? 'Hide the list' : `Show all ${label}s`}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
          {shown.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-gray-500">No {label} matches “{value}”</p>
          ) : (
            <>
              <div ref={listRef} className="max-h-64 overflow-y-auto">
                {shown.map((o, i) => (
                  <button key={o.key} type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={`block w-full text-left px-3 py-1.5 border-b border-gray-100 last:border-b-0 ${i === active ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}>
                    <span className="block text-[12px] font-semibold text-gray-900 truncate">{o.label}</span>
                    <span className="block text-[10px] text-gray-500 truncate">{o.sub}</span>
                  </button>
                ))}
              </div>
              <p className="px-3 py-1 border-t border-gray-200 bg-gray-50 text-[10px] text-gray-500">
                {options.length > shown.length
                  ? `Showing ${shown.length} of ${options.length} — keep typing to narrow it down`
                  : `${options.length} ${label}${options.length === 1 ? '' : 's'}`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Upload box — validate on choose, then upload with a real progress bar.
   Same two-step flow as the Sales & Labour page: the file is ALWAYS validated
   before a byte of it is imported, and the server's row-by-row progress is
   polled from the shared /pms/upload/progress endpoint.
   ========================================================================== */
const UploadBox = ({ onUploaded }) => {
  const [file, setFile] = useState(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);   // null = idle
  const [stage, setStage] = useState('');
  const [checkResult, setCheckResult] = useState(null);
  const inputRef = useRef(null);

  const post = async (fileArg, validate) => {
    const fd = new FormData();
    fd.append('file', fileArg);
    fd.append('validate_only', validate ? 'true' : 'false');
    const res = await fetch(`${API}/pms/training/upload`, {
      method: 'POST', headers: authHeaders(), body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
    return data;
  };

  // The real upload goes through XHR so the transfer itself can be shown
  // (fetch cannot report upload progress).
  const postWithProgress = (fileArg, token) => new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', fileArg);
    fd.append('validate_only', 'false');
    fd.append('progress_token', token);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/pms/training/upload`);
    Object.entries(authHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(100, Math.round(e.loaded / e.total * 100));
      // The transfer is the first 5% of the bar; the import takes it from there.
      setProgress(Math.min(5, Math.round(pct / 20)));
      setStage(pct < 100 ? `Uploading file… ${pct}%` : 'File sent — starting import…');
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

  const send = async (validateOnly, fileArg = file) => {
    if (!fileArg) { toast.error('Choose a file first'); return; }
    validateOnly ? setChecking(true) : setUploading(true);
    try {
      if (validateOnly) {
        const data = await post(fileArg, true);
        setCheckResult(data);
        data.success
          ? toast.success(`Format OK — ${num(data.rows)} rows × ${data.columns} columns`)
          : toast.error(data.message);
        return;
      }
      // An invalid file is never uploaded.
      const check = await post(fileArg, true);
      setCheckResult(check);
      if (!check.success) {
        toast.error(`File not uploaded — ${check.message}`);
        return;
      }
      setProgress(0);
      setStage('Uploading file…');
      const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
        data = await postWithProgress(fileArg, token);
      } finally {
        clearInterval(poll);
      }
      if (!data.success) throw new Error(data.message);
      setProgress(100);
      setStage('Done');
      toast.success(`${num(data.inserted)} new, ${num(data.updated)} updated, ${num(data.duplicates)} duplicates skipped`);
      setCheckResult(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      validateOnly ? setChecking(false) : setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex-1 min-w-[280px] border border-dashed border-gray-300 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-800">Training Report file</p>
      <p className="mt-0.5 text-[10px] text-gray-500 leading-snug">
        Fixed columns: {FIXED_COLUMNS.join(', ')}. Every other column of the file is
        kept as-is and shown on the report.
      </p>
      {/* The picker gets a row to ITSELF and the two actions sit on the next one:
          a long file name used to squeeze both buttons against the right edge. */}
      <div className="mt-2">
        <input ref={inputRef} type="file" accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            setCheckResult(null);
            if (f) send(true, f);     // validate immediately on choose
          }}
          className="w-full text-[11px] text-gray-600 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:text-[11px] file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button onClick={() => send(true)} disabled={checking || uploading || !file}
          className="whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {checking ? 'Checking…' : 'Check format'}
        </button>
        <button onClick={() => send(false)} disabled={uploading || checking || !file}
          className="whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: themeColor }}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      {progress != null && (
        <div className="mt-2">
          <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-200"
              style={{ width: `${progress}%`, backgroundColor: themeColor }} />
          </div>
          <p className="mt-1 text-[10px] text-gray-500">{stage} {progress}%</p>
        </div>
      )}

      {checkResult && (
        <div className={`mt-2 rounded-md px-2 py-1.5 text-[10px] leading-snug ${checkResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <p className="font-semibold">{checkResult.message}</p>
          {checkResult.success && (
            <p className="mt-0.5 opacity-80">
              {num(checkResult.rows)} rows · {checkResult.columns} columns ·{' '}
              {checkResult.dynamic_columns?.length || 0} dynamic column(s)
            </p>
          )}
          {(checkResult.warnings || []).map((w, i) => (
            <p key={i} className="mt-0.5 text-amber-700">⚠ {w}</p>
          ))}
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Employment status — the one thing on this page that is TYPED, not imported.

   The Excel file is only as fresh as its last export: HR knows an engineer has
   left days before KOEL's file says so, and some files carry no status column
   at all. So the status can be set here, and what is typed WINS over the file
   until somebody hands it back ("Use the file's status").

   The file's own answer is always printed next to it — the point is never to
   hide what was imported, only to be right about who is still with us.
   ========================================================================== */
const StatusEditor = ({ emp, onSave, onClear, busy }) => {
  // null = just showing the status; an object = the little form is open
  const [form, setForm] = useState(null);
  const manual = emp.status_source === 'manual';

  const open = (status) => setForm({
    status,
    left_on: status === 'Inactive' ? (emp.left_on || '') : '',
    reason: emp.status_reason || '',
  });

  const save = async () => {
    const ok = await onSave({
      status: form.status,
      // '' would fail the date parse on the way in — absent means "not known".
      left_on: form.status === 'Inactive' && form.left_on ? form.left_on : null,
      reason: form.reason.trim() || null,
    });
    if (ok) setForm(null);
  };

  const BTN = 'whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold disabled:opacity-50';

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Employment status</p>
        <StatusBadge value={emp.current_status} manual={manual} />
        <span className="text-[10.5px] text-gray-500">
          {manual ? (
            <>Set by hand{emp.status_by ? ` by ${emp.status_by}` : ''}
              {emp.status_at ? ` on ${fmtStamp(emp.status_at)}` : ''} · the file says{' '}
              <b className="text-gray-700">{emp.file_status || 'nothing'}</b></>
          ) : emp.file_status ? 'From the uploaded file' : 'The file carries no status for this employee'}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {emp.current_status !== 'Inactive' && (
            <button onClick={() => open('Inactive')} disabled={busy}
              title="Record that this employee has left — their training history stays"
              className={`${BTN} border border-red-300 bg-white text-red-700 hover:bg-red-50`}>
              Mark as left
            </button>
          )}
          {emp.current_status !== 'Active' && (
            <button onClick={() => open('Active')} disabled={busy}
              title="Record that this employee is still with us"
              className={`${BTN} border border-green-300 bg-white text-green-700 hover:bg-green-50`}>
              Mark as Active
            </button>
          )}
          {manual && (
            <button onClick={onClear} disabled={busy}
              title="Drop the typed status and go back to whatever the uploaded file says"
              className={`${BTN} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}>
              Use the file's status
            </button>
          )}
        </div>
      </div>

      {/* what was typed last time, when there is anything to show */}
      {manual && (emp.left_on || emp.status_reason) && !form && (
        <p className="mt-1 text-[11px] text-gray-600">
          {emp.left_on && <>Last working day: <b>{fmtDate(emp.left_on)}</b></>}
          {emp.left_on && emp.status_reason ? ' · ' : ''}
          {emp.status_reason && <>“{emp.status_reason}”</>}
        </p>
      )}

      {form && (
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-gray-200 pt-2">
          {form.status === 'Inactive' && (
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-gray-500">Last working day (optional)</span>
              <input type="date" value={form.left_on}
                onChange={(e) => setForm((f) => ({ ...f, left_on: e.target.value }))}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[12px] text-gray-800 outline-none" />
            </label>
          )}
          <label className="flex min-w-[180px] flex-1 flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Reason / note (optional)</span>
            <input type="text" value={form.reason} maxLength={300}
              placeholder={form.status === 'Inactive' ? 'e.g. Resigned — HR mail 21 Aug' : 'e.g. Rejoined'}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[12px] text-gray-800 outline-none" />
          </label>
          <button onClick={save} disabled={busy}
            className={`${BTN} text-white`} style={{ backgroundColor: themeColor }}>
            {busy ? 'Saving…' : form.status === 'Inactive' ? 'Save as left' : 'Save as Active'}
          </button>
          <button onClick={() => setForm(null)} disabled={busy}
            className={`${BTN} border border-gray-300 bg-white text-gray-700 hover:bg-gray-100`}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   Detail sheet — what a clicked ROW opens.

   It keeps a small STACK rather than one target, because the two views lead
   into each other: an employee's skill opens that skill, a name inside a skill
   opens that person. Back walks the trail instead of dumping the user out.
   ========================================================================== */
const DetailModal = ({ stack, onPush, onPop, onClose, employees, skillIndex,
  empCols, trnCols, dateCols, onSetStatus, onClearStatus, savingStatus }) => {
  // The sheet's own tables carry the dynamic training columns, so they run wider
  // than the panel: each gets a synced scrollbar ABOVE the head as well as the
  // native one below, because the bottom of a 29-row table is off-screen and the
  // reader would never find the bar down there.
  const skillsBoxRef = useRef(null);   // an employee's skills
  const peopleBoxRef = useRef(null);   // a skill's employees

  // Esc closes, and the page behind must not scroll while the sheet is open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const top = stack[stack.length - 1];
  if (!top) return null;
  const emp = top.type === 'employee'
    ? employees.find((e) => e.uid_no === top.key) : null;
  const sk = top.type === 'skill'
    ? skillIndex.find((s) => s.skill === top.key) : null;
  if (!emp && !sk) return null;

  // "All details" as TWO label/value pairs per row. One pair per row left most
  // of the sheet's width empty down the right-hand side — the values here are
  // short (a branch code, a zipcode, a bank name), so two columns of pairs fill
  // the box and halve the scrolling.
  const pairs = emp ? [
    ['UID NO', emp.uid_no],
    ['EMPLOYEE TICKET NUMBER', emp.employee_ticket_number],
    ['FULL NAME', emp.full_name],
    ['OCCUPATION', emp.occupation],
    ['BRANCH NAME', emp.branch_name],
    ['BRANCH ID', emp.branch_id],
    ['HIRE DATE', fmtDate(emp.hire_date)],
    ['CURRENT STATUS', (emp.current_status || 'Not set')
      + (emp.status_source === 'manual' ? ' (set by hand)' : '')],
    // every remaining column of the file, exactly as it came
    ...empCols.map((c) => [c, cellText(emp.details?.[c], c, dateCols)]),
  ] : [];
  const half = Math.ceil(pairs.length / 2);
  const leftPairs = pairs.slice(0, half);
  const rightPairs = pairs.slice(half);

  return (
    // Centred both ways. The panel is capped at 92vh and scrolls inside, so
    // centring can never push its head off the top of the screen.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/40"
      onClick={onClose}>
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* ---- header ---- */}
        <div className="px-4 py-3 text-white flex items-center gap-2.5 flex-shrink-0"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          {stack.length > 1 && (
            <button onClick={onPop} title="Back"
              className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          )}
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/15 flex-shrink-0">
            {emp ? <UserIcon className="h-4 w-4" /> : <SparklesIcon className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate">{emp ? emp.full_name : sk.skill}</p>
            <p className="text-[11px] text-white/70 leading-tight truncate">
              {emp
                ? `UID ${emp.uid_no} · Ticket ${emp.employee_ticket_number || '-'} · ${emp.branch_name || emp.branch_id || '-'}`
                : `${num(sk.people)} employee(s) · ${num(sk.branches)} branch(es)`}
            </p>
          </div>
          <button onClick={onClose} title="Close"
            className="ml-auto rounded-lg bg-white/15 p-1.5 hover:bg-white/25 flex-shrink-0">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* ---- body ---- */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-4">
          {emp ? (
            <>
              {/* The status sits ABOVE the skills: it is the one thing here that
                  can be changed, and a leaver has to be obvious on sight.
                  key=uid so switching employee resets the little form. */}
              <StatusEditor key={emp.uid_no} emp={emp} busy={savingStatus}
                onSave={(body) => onSetStatus(emp.uid_no, body)}
                onClear={() => onClearStatus(emp.uid_no)} />

              {/* SKILLS FIRST — the answer the row was clicked for */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Skills ({emp.skill_names.length})
                </p>
                {emp.skills.length === 0 ? (
                  <p className="text-[12px] text-gray-500 italic">No training recorded for this employee yet.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {emp.skill_names.map((s) => (
                        <button key={s} onClick={() => onPush({ type: 'skill', key: s })}
                          title={`Show everyone trained on ${s}`}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90"
                          style={{ backgroundColor: themeColor }}>
                          {s}
                        </button>
                      ))}
                    </div>
                    <TopScrollbar scrollRef={skillsBoxRef}
                      watch={`${emp.uid_no}:${emp.skills.length}:${trnCols.length}`} />
                    <div ref={skillsBoxRef} className="overflow-x-auto">
                      <table className={TABLE}>
                        <thead>
                          <tr>
                            <th className={`${TH} w-14 text-center`}>Sr. No.</th>
                            <th className={`${TH} text-left`}>Skill</th>
                            {trnCols.map((c) => <th key={c} className={`${TH} text-left whitespace-nowrap`}>{c}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {emp.skills.map((s, i) => (
                            <tr key={s.id} className="odd:bg-white even:bg-gray-50/60 hover:bg-blue-50/40">
                              <td className={`${TD} text-center text-gray-400`}>{i + 1}</td>
                              <td className={`${TD} font-semibold text-gray-900 whitespace-nowrap`}>
                                <button onClick={() => onPush({ type: 'skill', key: s.skill })}
                                  title="Show everyone trained on this skill"
                                  className="hover:underline">{s.skill}</button>
                              </td>
                              {trnCols.map((c) => (
                                <td key={c} className={`${TD} whitespace-nowrap`}>
                                  {cellText(s.values?.[c], c, dateCols)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* THEN every other detail the file carries */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">All details</p>
                <div className="overflow-x-auto">
                  <table className={TABLE}>
                    <tbody>
                      {leftPairs.map(([label, value], i) => {
                        const pair = rightPairs[i];
                        return (
                          <tr key={label} className="odd:bg-white even:bg-gray-50/60">
                            <th className={`${TH} text-left w-[200px]`}>{label}</th>
                            <td className={`${TD} text-gray-900 break-words w-[calc(50%-200px)]`}>{value || '-'}</td>
                            {/* an odd number of details leaves the last pair blank */}
                            <th className={`${TH} text-left w-[200px]`}>{pair ? pair[0] : ''}</th>
                            <td className={`${TD} text-gray-900 break-words`}>{pair ? (pair[1] || '-') : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* SKILL → everyone who holds it */
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                Employees trained on “{sk.skill}” ({num(sk.people)})
              </p>
              <TopScrollbar scrollRef={peopleBoxRef}
                watch={`${sk.skill}:${sk.rows.length}:${trnCols.length}`} />
              <div ref={peopleBoxRef} className="overflow-x-auto">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={`${TH} w-14 text-center`}>Sr. No.</th>
                      <th className={`${TH} text-left`}>Full Name</th>
                      <th className={`${TH} text-left`}>UID No</th>
                      <th className={`${TH} text-left whitespace-nowrap`}>Employee Ticket Number</th>
                      <th className={`${TH} text-left`}>Occupation</th>
                      <th className={`${TH} text-center whitespace-nowrap`}>Current Status</th>
                      <th className={`${TH} text-left`}>Branch Name</th>
                      <th className={`${TH} text-left`}>Branch Id</th>
                      <th className={`${TH} text-left whitespace-nowrap`}>Hire Date</th>
                      {trnCols.map((c) => <th key={c} className={`${TH} text-left whitespace-nowrap`}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sk.rows.map((r, i) => (
                      <tr key={r.rowId} className="odd:bg-white even:bg-gray-50/60 hover:bg-blue-50/40">
                        <td className={`${TD} text-center text-gray-400`}>{i + 1}</td>
                        <td className={`${TD} font-semibold text-gray-900 whitespace-nowrap`}>
                          <button onClick={() => onPush({ type: 'employee', key: r.uid_no })}
                            title="Open this employee's full record" className="hover:underline">
                            {r.full_name}
                          </button>
                          {/* One row per person — a re-take of the same skill is
                              folded in, and this says how many there were so the
                              hidden repeats are never a surprise. */}
                          {r.repeats > 1 && (
                            <span title={`${r.repeats} trainings on this skill — the latest is shown`}
                              className="ml-1 rounded bg-gray-100 px-1 text-[9px] font-bold text-gray-500">
                              ×{r.repeats}
                            </span>
                          )}
                        </td>
                        <td className={TD}>{r.uid_no}</td>
                        <td className={TD}>{r.employee_ticket_number || '-'}</td>
                        <td className={TD}>{r.occupation || '-'}</td>
                        <td className={`${TD} text-center`}>
                          <StatusBadge value={r.current_status} manual={r.status_source === 'manual'} />
                        </td>
                        <td className={TD}>{r.branch_name || '-'}</td>
                        <td className={TD}>{r.branch_id || '-'}</td>
                        <td className={`${TD} whitespace-nowrap`}>{fmtDate(r.hire_date) || '-'}</td>
                        {trnCols.map((c) => (
                          <td key={c} className={`${TD} whitespace-nowrap`}>
                            {cellText(r.training?.[c], c, dateCols)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   Page
   ========================================================================== */
const TrainingReport = () => {
  const user = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; }
  }, []);
  const canExport = canExportExcel(user);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // How many times the file has been uploaded and when the last one landed —
  // the whole of the upload history the page reports.
  const [uploadInfo, setUploadInfo] = useState({ uploads: 0, last_uploaded_at: null });
  // Open by default: the stored-data counts live inside this panel now, so
  // collapsing it by default would hide the page's headline numbers.
  const [setupOpen, setSetupOpen] = useState(true);

  // ---- search / filters ----
  const [mode, setMode] = useState('employee');       // 'employee' | 'skill'
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('');           // branch_id
  // MULTI-select: [] means every occupation, otherwise the ticked ones.
  const [occupations, setOccupations] = useState([]);
  // Starts on ACTIVE: the everyday question this page answers is "who is with
  // us now and what can they do". Inactive is one pick away.
  const [status, setStatus] = useState('Active');     // 'all' | 'Active' | 'Inactive' | 'unset'
  const statusPicked = useRef(false);                 // has the USER touched it?
  const [trained, setTrained] = useState('all');      // 'all' | 'yes' | 'no'
  const [stack, setStack] = useState([]);             // the open detail trail
  const [exporting, setExporting] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const empSort = useSort(null);
  const skillSort = useSort(null);
  const gridRef = useRef(null);        // the table's scroll box (top bar syncs to it)

  const load = useCallback(async (quiet = false) => {
    setRefreshing(true);
    setError('');
    try {
      const res = await fetch(`${API}/pms/training/report`, { headers: authHeaders() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
      setData(d);
      if (!quiet) toast.success('Training Report loaded');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadUploads = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pms/training/summary`, { headers: authHeaders() });
      const d = await res.json();
      if (d.success) setUploadInfo(d.summary || { uploads: 0, last_uploaded_at: null });
    } catch { /* the upload line is optional */ }
  }, []);

  useEffect(() => { load(true); loadUploads(); }, [load, loadUploads]);

  // The Active default would show an EMPTY table on a file uploaded before the
  // CURRENT STATUS column existed — nobody is marked Active there, and empty
  // reads as broken data. So while the user has not touched the filter, a
  // master with no Active employee at all relaxes it to show everyone.
  useEffect(() => {
    if (!data || statusPicked.current) return;
    if (!(data.meta?.active > 0)) setStatus('all');
  }, [data]);

  // ---- manual employment status: type it, or hand it back to the file -------
  // Both reload the report, because the status feeds the filter, the tiles and
  // the badge on every row — not just the sheet that happens to be open.
  const postStatus = async (body, okMessage) => {
    setSavingStatus(true);
    try {
      const res = await fetch(`${API}/pms/training/status`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.detail || d.message || 'Could not save the status');
      toast.success(d.message || okMessage);
      await load(true);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    } finally {
      setSavingStatus(false);
    }
  };

  const setEmployeeStatus = (uid, { status: wanted, left_on, reason }) =>
    postStatus({ uid_no: uid, status: wanted, left_on, reason }, 'Status saved');
  // A null status tells the server to DELETE the override, not to blank it out.
  const clearEmployeeStatus = (uid) =>
    postStatus({ uid_no: uid, status: null }, 'Manual status removed');

  const onUploaded = () => { setStack([]); load(); loadUploads(); };

  // Stable references: every memo below keys off these, so a fresh [] on each
  // render would rebuild the whole skill pivot for nothing.
  const employees = useMemo(() => data?.employees || [], [data]);
  const empCols = useMemo(() => data?.employee_columns || [], [data]);
  const trnCols = useMemo(() => data?.training_columns || [], [data]);
  const dateCols = useMemo(() => new Set(data?.date_columns || []), [data]);
  const meta = data?.meta || {};

  // The branch picker's own list: "All branches" first, so PickOne can treat
  // the first entry as the unfiltered one.
  const branchOptions = useMemo(() => [
    { key: '', label: 'All branches' },
    ...(meta.branches || []).map((b) => ({
      key: b.branch_id, label: b.branch_name || b.branch_id,
    })),
  ], [meta.branches]);

  // ---- branch / occupation / status filter, applied before either view -----
  // An employee with no occupation matches only the unfiltered case: they are
  // not "one of the technicians", so ticking any occupation must exclude them.
  const inScope = useCallback((e) => (
    (!branch || e.branch_id === branch)
    && (!occupations.length || occupations.includes(e.occupation))
    && (status === 'all'
      || (status === 'unset' ? !e.current_status : e.current_status === status))
  ), [branch, occupations, status]);

  const q = query.trim();
  const qs = squash(q);

  // ---- EMPLOYEE view: one row per person ----------------------------------
  const empRows = useMemo(() => {
    if (mode !== 'employee') return [];
    return employees.filter((e) => {
      if (!inScope(e)) return false;
      if (trained === 'yes' && !e.skills.length) return false;
      if (trained === 'no' && e.skills.length) return false;
      if (!qs) return true;
      return squash(e.full_name).includes(qs)
        || squash(e.uid_no).includes(qs)
        || squash(e.employee_ticket_number).includes(qs);
    });
  }, [mode, employees, inScope, trained, qs]);

  // ---- SKILL view: the same data pivoted the other way round --------------
  // Built here rather than on the server: the payload already carries every
  // training row, so the pivot is free and switching views never refetches.
  //
  // ONE ROW PER PERSON. The source file records the same skill again for every
  // repeat training (a re-take under another CATEGORY), which used to put one
  // engineer on the skill's list three times and made the row count disagree
  // with the employee count. The rows are keyed by UID instead: the server
  // hands each employee's skills NEWEST FIRST, so the first one seen is their
  // latest training on that skill and the older repeats only raise `repeats`.
  // rows.length === people, always.
  const skillIndex = useMemo(() => {
    const by = new Map();
    employees.forEach((e) => {
      if (!inScope(e)) return;
      e.skills.forEach((s) => {
        if (!s.skill) return;
        if (!by.has(s.skill)) by.set(s.skill, new Map());
        const people = by.get(s.skill);
        const already = people.get(e.uid_no);
        if (already) { already.repeats += 1; return; }
        people.set(e.uid_no, { ...e, training: s.values, rowId: s.id, repeats: 1 });
      });
    });
    return [...by.entries()]
      .map(([skill, people]) => {
        const rows = [...people.values()]
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        return {
          skill,
          rows,
          people: rows.length,
          branches: new Set(rows.map((r) => r.branch_id || r.branch_name)).size,
        };
      })
      .sort((a, b) => a.skill.localeCompare(b.skill));
  }, [employees, inScope]);

  const skillRows = useMemo(() => {
    if (mode !== 'skill') return [];
    if (!qs) return skillIndex;
    // A skill search first; if the text is nobody's skill but IS somebody's
    // name, fall back to that person's skills — typing a name in this view
    // then answers "what is he trained on" instead of showing nothing.
    const hit = skillIndex.filter((s) => squash(s.skill).includes(qs));
    if (hit.length) return hit;
    return skillIndex
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => squash(r.full_name).includes(qs)
          || squash(r.uid_no).includes(qs)
          || squash(r.employee_ticket_number).includes(qs)),
      }))
      .filter((s) => s.rows.length)
      .map((s) => ({
        ...s,
        people: s.rows.length,   // already one row per person
        branches: new Set(s.rows.map((r) => r.branch_id || r.branch_name)).size,
      }));
  }, [mode, skillIndex, qs]);

  // ---- what the search dropdown offers ------------------------------------
  // Straight off the filtered rows, so the list can never suggest something
  // the table would then fail to find.
  const searchOptions = useMemo(() => (
    mode === 'employee'
      ? empRows.map((e) => ({
        key: e.uid_no,
        label: e.full_name,
        sub: `UID ${e.uid_no}`
          + (e.employee_ticket_number ? ` · Ticket ${e.employee_ticket_number}` : '')
          + ` · ${e.branch_name || e.branch_id || '-'}`
          + ` · ${e.skill_names.length} skill(s)`,
      }))
      : skillRows.map((s) => ({
        key: s.skill,
        label: s.skill,
        sub: `${num(s.people)} employee(s) · ${num(s.branches)} branch(es)`,
      }))
  ), [mode, empRows, skillRows]);

  // ---- column sorting (click a header: A–Z, Z–A, then natural order) ------
  const sortedEmp = useSortedRows(empRows, empSort.sort, {
    name: (e) => e.full_name,
    uid: (e) => e.uid_no,
    ticket: (e) => e.employee_ticket_number,
    occupation: (e) => e.occupation,
    status: (e) => e.current_status || '',
    skills: (e) => e.skill_names.length,
    trainings: (e) => e.skills.length,
    branch: (e) => e.branch_name || e.branch_id,
    branchId: (e) => e.branch_id,
    hire: (e) => e.hire_date,
  });
  const sortedSkill = useSortedRows(skillRows, skillSort.sort, {
    skill: (s) => s.skill,
    people: (s) => s.people,
    branches: (s) => s.branches,
  });

  const results = mode === 'employee' ? sortedEmp : sortedSkill;

  // A name typed into the skill view (or a skill typed into the employee view)
  // is a common mix-up — offer the one-click switch instead of "no results".
  const crossHint = useMemo(() => {
    if (!qs) return null;
    if (mode === 'employee' && !empRows.length) {
      const s = skillIndex.find((x) => squash(x.skill).includes(qs));
      return s ? { to: 'skill', label: s.skill } : null;
    }
    if (mode === 'skill' && !skillRows.length) {
      const e = employees.find((x) => squash(x.full_name).includes(qs));
      return e ? { to: 'employee', label: e.full_name } : null;
    }
    return null;
  }, [qs, mode, empRows, skillRows, skillIndex, employees]);

  // A row opens its full record; the sheet itself can push further targets.
  const openDetail = (target) => setStack([target]);
  const pushDetail = (target) => setStack((s) => [...s, target]);
  const popDetail = () => setStack((s) => s.slice(0, -1));

  // ---- Excel export: the flat training rows + the skill-wise pivot ---------
  const exportExcel = async () => {
    if (!results.length) { toast.error('Nothing to export'); return; }
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const { dateOnly, finishDateColumns } = await import('../utils/excelDateColumns');
      const d = (v) => dateOnly(v);        // real Excel dates keep the date filter working

      // Sheet 1 — one row per TRAINING, employee columns repeated (the shape
      // the source file has, with the filters of this screen applied).
      const flat = [];
      (mode === 'employee'
        ? sortedEmp
        : sortedSkill.flatMap((s) => s.rows.map((r) => ({ ...r, only: s.skill })))
      ).forEach((e) => {
        const base = {
          'UID NO': e.uid_no, 'EMPLOYEE TICKET NUMBER': e.employee_ticket_number || '',
          'FULL NAME': e.full_name, 'OCCUPATION': e.occupation || '',
          'BRANCH NAME': e.branch_name || '', 'BRANCH ID': e.branch_id || '',
          'HIRE DATE': d(e.hire_date),
          'CURRENT STATUS': e.current_status || '',
          'STATUS SET BY': e.status_source === 'manual' ? 'Manually' : (e.file_status ? 'File' : ''),
          'LEFT ON': d(e.left_on),
          'STATUS REMARK': e.status_reason || '',
        };
        const details = Object.fromEntries(empCols.map((c) => [c, e.details?.[c] ?? '']));
        const rows = mode === 'employee' ? e.skills : [{ skill: e.only, values: e.training }];
        if (!rows.length) {
          flat.push({ ...base, SKILL: '', ...Object.fromEntries(trnCols.map((c) => [c, ''])), ...details });
          return;
        }
        rows.forEach((s) => flat.push({
          ...base,
          SKILL: s.skill || '',
          ...Object.fromEntries(trnCols.map((c) => [c, dateCols.has(c) ? d(s.values?.[c]) : (s.values?.[c] ?? '')])),
          ...details,
        }));
      });

      // Sheet 2 — skill-wise: every skill with the people who hold it, ONE ROW
      // PER PERSON (repeat trainings of the same skill are folded into the
      // latest one, so the sheet's row count equals the employee count).
      const bySkill = [];
      (mode === 'skill' ? sortedSkill : skillIndex).forEach((s) => {
        s.rows.forEach((r) => bySkill.push({
          SKILL: s.skill,
          'FULL NAME': r.full_name, 'UID NO': r.uid_no,
          'EMPLOYEE TICKET NUMBER': r.employee_ticket_number || '',
          'OCCUPATION': r.occupation || '',
          'CURRENT STATUS': r.current_status || '',
          'STATUS SET BY': r.status_source === 'manual' ? 'Manually' : (r.file_status ? 'File' : ''),
          'LEFT ON': d(r.left_on),
          'BRANCH NAME': r.branch_name || '', 'BRANCH ID': r.branch_id || '',
          'HIRE DATE': d(r.hire_date),
          'TRAININGS ON THIS SKILL': r.repeats || 1,
          ...Object.fromEntries(trnCols.map((c) => [c, dateCols.has(c) ? d(r.training?.[c]) : (r.training?.[c] ?? '')])),
        }));
      });

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(flat, { cellDates: true });
      finishDateColumns(ws1);
      XLSX.utils.book_append_sheet(wb, ws1, 'Employee wise');
      const ws2 = XLSX.utils.json_to_sheet(bySkill, { cellDates: true });
      finishDateColumns(ws2);
      XLSX.utils.book_append_sheet(wb, ws2, 'Skill wise');
      XLSX.writeFile(wb, `training_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Exported');
    } catch (e) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen font-sans">
        <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 max-md:px-2 animate-pulse space-y-3">
          <div className="h-16 rounded-2xl bg-gray-200" />
          <div className="h-24 rounded-2xl bg-gray-100" />
          <div className="h-72 rounded-2xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 max-md:px-2">

      {/* ===== Hero header (same style as the other PMS pages) ===== */}
      <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
        <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
              <AcademicCapIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-tight">Training Report</h1>
              <p className="text-[11px] text-white/70 leading-tight">
                Service engineer skills &amp; training history — click any row for the full record
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canExport && (
              <button onClick={exportExcel} disabled={exporting || !results.length}
                title="Download what is on screen — employee-wise and skill-wise sheets"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/25 disabled:opacity-50">
                <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                {exporting ? 'Exporting…' : 'Export'}
              </button>
            )}
            <button onClick={() => load()} disabled={refreshing}
              title="Reload the stored training data"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold transition hover:bg-white/90 disabled:opacity-60"
              style={{ color: themeColor }}>
              <ArrowPathIcon className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* ============ ① Upload & stored data ============ */}
      <div className="bg-white rounded-2xl border border-gray-200 mb-3">
        <button onClick={() => setSetupOpen((v) => !v)}
          className="w-full px-4 py-2.5 flex flex-wrap items-center gap-2 text-left">
          <ArrowUpTrayIcon className="h-4 w-4" style={{ color: themeColor }} />
          <h2 className="text-sm font-semibold text-gray-900">Upload Training Report</h2>
          <span className="text-[11px] text-gray-500">
            {meta.rows
              ? `${num(meta.rows)} rows · ${num(meta.employees)} employees · ${num(meta.skills)} skills`
              : 'No file uploaded yet'}
          </span>
          <ChevronRightIcon className={`ml-auto h-4 w-4 text-gray-400 transition-transform ${setupOpen ? 'rotate-90' : ''}`} />
        </button>
        {setupOpen && (
          <div className="border-t border-gray-100 p-3 flex flex-wrap gap-3">
            <UploadBox onUploaded={onUploaded} />
            {/* Stored data — the page's headline counts, beside the upload box.
                The upload history is one line: WHEN the last file landed and
                HOW MANY uploads there have been. */}
            <div className="flex-[1.4] min-w-[320px] border border-dashed border-gray-300 rounded-lg p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-xs font-semibold text-gray-800">Stored data</p>
                <p className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                  <ClockIcon className="h-3 w-3 text-gray-400" />
                  {uploadInfo.last_uploaded_at
                    ? <>Last uploaded on <b className="text-gray-700">{fmtStamp(uploadInfo.last_uploaded_at)}</b>
                      {' · '}<b className="text-gray-700">{num(uploadInfo.uploads)}</b> upload{uploadInfo.uploads === 1 ? '' : 's'} so far</>
                    : 'Nothing uploaded yet.'}
                </p>
                {!!meta.status_manual && (
                  <p className="text-[10px] text-gray-500">
                    · <b className="text-gray-700">{num(meta.status_manual)}</b>{' '}
                    status{meta.status_manual === 1 ? '' : 'es'} set by hand (✎)
                  </p>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                <Tile label="Employees" value={num(meta.employees)} />
                <Tile label="Active" value={num(meta.active)} />
                {/* Inactive = the ones who have LEFT. Their rows stay, so the
                    number is a real part of the master, not a leftover. */}
                <Tile label="Inactive (left)" value={num(meta.inactive)} tone={meta.inactive ? 'warn' : 'default'} />
                {!!meta.status_unset && (
                  <Tile label="Status not set" value={num(meta.status_unset)} tone="warn" />
                )}
                <Tile label="Trained" value={num(meta.trained)} />
                <Tile label="No training" value={num(meta.untrained)} tone={meta.untrained ? 'warn' : 'default'} />
                <Tile label="Skills" value={num(meta.skills)} />
                <Tile label="Training records" value={num(meta.rows)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
      )}

      {/* ============ ② Search ============ */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* view switch — the two ways the business reads this file */}
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setMode(v.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${mode === v.key ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                style={mode === v.key ? { backgroundColor: themeColor } : {}}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          {/* search box — type to filter, or open the arrow and pick one */}
          <SearchSelect
            value={query}
            onChange={setQuery}
            options={searchOptions}
            label={mode === 'employee' ? 'employee' : 'skill'}
            placeholder={mode === 'employee'
              ? 'Search or pick an employee — name, UID no or ticket number…'
              : 'Search or pick a skill — e.g. CPCB4+, BS V, PM…'} />

          {/* filters — every one of them opens on hover, see useHoverOpen */}
          <PickOne value={branch} onChange={setBranch} options={branchOptions}
            title="Filter by branch" />
          {/* occupations: tick as many as you like */}
          <MultiSelect values={occupations} onChange={setOccupations}
            options={meta.occupations || []} allLabel="All occupations" noun="occupation" />
          <PickOne value={status} options={STATUS_FILTERS}
            onChange={(k) => { statusPicked.current = true; setStatus(k); }}
            title="Active / Inactive comes from the file's CURRENT STATUS column" />
          {mode === 'employee' && (
            <PickOne value={trained} onChange={setTrained} options={TRAINED_FILTERS}
              title="Filter by whether the employee has any training yet" />
          )}
        </div>

      </div>

      {/* ============ ③ The table ============ */}
      {!meta.rows ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <AcademicCapIcon className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-semibold text-gray-700">No training data yet</p>
          <p className="mt-1 text-[12px] text-gray-500">
            Open “Upload Training Report” above and upload the Training Report Excel file.
          </p>
        </div>
      ) : !results.length ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <MagnifyingGlassIcon className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-semibold text-gray-700">
            {q ? <>Nothing matches “{query}”</> : 'Nothing to show with these filters'}
          </p>
          {/* The Active default is the usual reason a search finds nothing —
              say so, and offer the one click that undoes it. */}
          {status !== 'all' && (
            <button onClick={() => { statusPicked.current = true; setStatus('all'); }}
              className="mt-2 block mx-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50">
              The “{STATUS_FILTERS.find((f) => f.key === status)?.label}” filter is on — show everyone
            </button>
          )}
          {crossHint ? (
            <button onClick={() => { setMode(crossHint.to); setQuery(crossHint.label); }}
              className="mt-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white"
              style={{ backgroundColor: themeColor }}>
              {crossHint.to === 'skill'
                ? `“${crossHint.label}” is a skill — show everyone who has it`
                : `“${crossHint.label}” is an employee — show their skills`}
            </button>
          ) : q ? (
            <p className="mt-1 text-[12px] text-gray-500">Try a different name, UID, ticket number or skill.</p>
          ) : (
            <p className="mt-1 text-[12px] text-gray-500">Widen the branch, occupation or status filter above.</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span>Click any row to open its full record · click a column heading to sort</span>
            <span className="ml-auto font-semibold text-gray-700">
              {mode === 'employee'
                ? `${num(results.length)} employee(s)`
                : `${num(results.length)} skill(s)`}
            </span>
          </div>
          {/* Horizontal scrollbar ABOVE the head as well as the native one below:
              on a table this wide the bottom bar can be a whole screen away. */}
          <div className="pt-1">
            <TopScrollbar scrollRef={gridRef} watch={`${mode}:${results.length}`} />
          </div>
          <div ref={gridRef} className="overflow-x-auto">
            {mode === 'employee' ? (
              /* ---------- EMPLOYEE TABLE — one row per person ---------- */
              <table className={`${TABLE} table-fixed ${EMP_MIN}`}>
                {/* The identity columns (name, UID, ticket, dates) hold short,
                    predictable values, so they are kept narrow and the width
                    they used to waste goes to the three that actually need to
                    breathe: Occupation, Skill Names and Branch Name. */}
                <colgroup>
                  {EMP_COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={`${TH} text-center`}>Sr. No.</th>
                    <SortTh label="Full Name" sortKey="name" sort={empSort.sort} onSort={empSort.toggle} align="left" wrap className={`${TH} text-left`} />
                    <SortTh label="UID No" sortKey="uid" sort={empSort.sort} onSort={empSort.toggle} align="left" wrap className={`${TH} text-left`} />
                    <SortTh label="Employee Ticket Number" sortKey="ticket" sort={empSort.sort} onSort={empSort.toggle} align="left" wrap className={`${TH} text-left`} />
                    <SortTh label="Occupation" sortKey="occupation" sort={empSort.sort} onSort={empSort.toggle} align="left" wrap className={`${TH} text-left`} />
                    <SortTh label="Current Status" sortKey="status" sort={empSort.sort} onSort={empSort.toggle} wrap className={`${TH} text-center`} />
                    <SortTh label="Skills" sortKey="skills" sort={empSort.sort} onSort={empSort.toggle} wrap className={`${TH} text-center`} />
                    <SortTh label="Trainings" sortKey="trainings" sort={empSort.sort} onSort={empSort.toggle} wrap className={`${TH} text-center`} />
                    <th className={`${TH} text-left`}>Skill Names</th>
                    <SortTh label="Branch Name" sortKey="branch" sort={empSort.sort} onSort={empSort.toggle} align="left" wrap className={`${TH} text-left`} />
                    <SortTh label="Branch Id" sortKey="branchId" sort={empSort.sort} onSort={empSort.toggle} align="left" wrap className={`${TH} text-left`} />
                    <SortTh label="Hire Date" sortKey="hire" sort={empSort.sort} onSort={empSort.toggle} align="left" wrap className={`${TH} text-left`} />
                  </tr>
                </thead>
                <tbody>
                  {sortedEmp.map((e, i) => (
                    <tr key={e.uid_no} onClick={() => openDetail({ type: 'employee', key: e.uid_no })}
                      title="Open the full record"
                      className="cursor-pointer odd:bg-white even:bg-gray-50/60 hover:bg-blue-50">
                      <td className={`${TD} text-center text-gray-400`}>{i + 1}</td>
                      <td className={`${TD} font-semibold text-gray-900`}>{mark(e.full_name, q)}</td>
                      <td className={`${TD} whitespace-nowrap`}>{mark(e.uid_no, q)}</td>
                      <td className={`${TD} whitespace-nowrap`}>{mark(e.employee_ticket_number, q)}</td>
                      <td className={TD}>{e.occupation || '-'}</td>
                      <td className={`${TD} text-center`}>
                        <StatusBadge value={e.current_status} manual={e.status_source === 'manual'} />
                      </td>
                      <td className={`${TD} text-center`}>
                        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${e.skill_names.length ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                          {e.skill_names.length}
                        </span>
                      </td>
                      <td className={`${TD} text-center text-gray-600`}>{e.skills.length || '-'}</td>
                      <td className={TD}>
                        {e.skill_names.length
                          ? <span className="line-clamp-3 text-gray-600" title={e.skill_names.join(', ')}>{e.skill_names.join(', ')}</span>
                          : <span className="text-amber-700 italic">No training yet</span>}
                      </td>
                      <td className={TD}>{e.branch_name || '-'}</td>
                      <td className={`${TD} whitespace-nowrap`}>{e.branch_id || '-'}</td>
                      <td className={`${TD} whitespace-nowrap`}>{fmtDate(e.hire_date) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              /* ---------- SKILL TABLE — one row per skill ---------- */
              <table className={`${TABLE} table-fixed ${SKILL_MIN}`}>
                <colgroup>
                  {SKILL_COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={`${TH} text-center`}>Sr. No.</th>
                    <SortTh label="Skill" sortKey="skill" sort={skillSort.sort} onSort={skillSort.toggle} align="left" wrap className={`${TH} text-left`} />
                    <SortTh label="Employees" sortKey="people" sort={skillSort.sort} onSort={skillSort.toggle} wrap className={`${TH} text-center`} />
                    <SortTh label="Branches" sortKey="branches" sort={skillSort.sort} onSort={skillSort.toggle} wrap className={`${TH} text-center`} />
                    <th className={`${TH} text-left`}>Employee Names</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSkill.map((s, i) => {
                    const names = [...new Set(s.rows.map((r) => r.full_name))];
                    return (
                      <tr key={s.skill} onClick={() => openDetail({ type: 'skill', key: s.skill })}
                        title="Show everyone trained on this skill"
                        className="cursor-pointer odd:bg-white even:bg-gray-50/60 hover:bg-blue-50">
                        <td className={`${TD} text-center text-gray-400`}>{i + 1}</td>
                        <td className={`${TD} font-semibold text-gray-900`}>{mark(s.skill, q)}</td>
                        <td className={`${TD} text-center`}>
                          <span className="inline-block rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                            {num(s.people)}
                          </span>
                        </td>
                        <td className={`${TD} text-center text-gray-600`}>{num(s.branches)}</td>
                        <td className={TD}>
                          <span className="line-clamp-3 text-gray-600" title={names.join(', ')}>{names.join(', ')}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {stack.length > 0 && (
        <DetailModal stack={stack} onPush={pushDetail} onPop={popDetail}
          onClose={() => setStack([])}
          employees={employees} skillIndex={skillIndex}
          empCols={empCols} trnCols={trnCols} dateCols={dateCols}
          onSetStatus={setEmployeeStatus} onClearStatus={clearEmployeeStatus}
          savingStatus={savingStatus} />
      )}
      </div>
    </div>
  );
};

export default TrainingReport;
