import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  EnvelopeIcon, ChartBarIcon, ListBulletIcon, PaperAirplaneIcon,
  ClockIcon, UsersIcon, BuildingOffice2Icon, XMarkIcon, PencilSquareIcon,
  TrashIcon, ArrowDownTrayIcon, DocumentTextIcon, PaperClipIcon,
  ChevronDownIcon, EyeIcon, CheckIcon, PlusIcon, PrinterIcon,
  ExclamationTriangleIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { SortTh, useSort, useSortedRows } from '../components/TableSort';
import ModelWiseAttachments from '../components/ModelWiseAttachments';
import LetterParaEditor from '../components/LetterParaEditor';
import { renderLetterParaHtml, isParaHtml } from '../utils/letterRichText';
import { buildAttachmentPagesHtml } from '../utils/printAttachments';

/* ============================================================
   Welcome Letter — Open SR (Sub Type CC) commissioning customers.
   List → letter preview (master text + the master attachment
   library, where the sender ticks the files this customer gets)
   → send by email (address from the customers table) → user-wise /
   branch-wise report. Master Setup is Master Admin only (letter
   text, default attachments).
   ============================================================ */

const API = import.meta.env.VITE_BACKEND_URL;
const WL = `${API}/welcome-letter`;

const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47,49,146,0.10)';

const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

const fmtDate = (s) => {
  if (!s) return null;
  const [d] = String(s).split(' ');
  const [y, m, dd] = d.split('-');
  return `${dd}-${m}-${y}`;
};

/* shared classes */
const inputCls = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-indigo-200';
/* Every table on this page shares one look: dark-grey grid lines and
   black column titles. */
const thCls = 'px-3 py-2 text-center text-[10.5px] font-bold uppercase tracking-wide text-black bg-gray-50 border-b border-r border-gray-400 whitespace-nowrap last:border-r-0';
const tdCls = 'px-3 py-1 text-[12px] border-b border-r border-gray-400 whitespace-nowrap align-middle max-w-[260px] overflow-hidden text-ellipsis last:border-r-0';

/* Pending Letters grid: headers WRAP onto several lines so each column stays
   narrow; cells stay one line and long values (name, address) ellipsize with
   the full text on hover. */
/* whitespace-nowrap still honours the explicit <br>, so every header is
   exactly the one or two lines authored below — never a third. */
const thWrapCls = 'px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-tight leading-[1.2] text-black bg-gray-50 border-b border-r border-gray-400 align-middle whitespace-nowrap last:border-r-0';
/* Every column is wide enough for its longest real value, so nothing is cut.
   px-3 keeps equal breathing room on BOTH sides of every cell. */
const tdSmCls = 'px-3 py-1 text-[11.5px] border-b border-r border-gray-400 whitespace-nowrap align-middle last:border-r-0';
/* …except the free-text columns (Account, Installation Site Address, Sent By),
   which ellipsize and carry the full value in their title tooltip. */
const tdTruncCls = `${tdSmCls} overflow-hidden text-ellipsis`;
/* Sortable version of thWrapCls. The chevron pair sits inside the cell, so the
   side padding is tighter and every sortable column is ~14px wider than it was;
   wrapping is controlled by the label span, not by the cell. */
const thSortCls = 'px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-tight leading-[1.2] text-black bg-gray-50 border-b border-r border-gray-400 align-middle last:border-r-0';
const pillCls = 'inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-bold';

/* Thin top scrollbar kept in sync with the table's own scroller
   (same pattern as the Dashboard TopScrollbar). */
function TopScrollbar({ scrollRef, deps }) {
  const topRef = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setW(el.scrollWidth);
    measure();
    const top = topRef.current;
    let lock = false;
    const onTop = () => { if (!lock) { lock = true; el.scrollLeft = top.scrollLeft; lock = false; } };
    const onEl = () => { if (!lock) { lock = true; top.scrollLeft = el.scrollLeft; lock = false; } };
    top?.addEventListener('scroll', onTop);
    el.addEventListener('scroll', onEl);
    window.addEventListener('resize', measure);
    return () => {
      top?.removeEventListener('scroll', onTop);
      el.removeEventListener('scroll', onEl);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <div ref={topRef} className="overflow-x-auto border-b border-gray-100"
      style={{ scrollbarWidth: 'thin' }} aria-hidden="true">
      <div style={{ width: w, height: 1 }} />
    </div>
  );
}

/* Renders the master letter text exactly the way the emailed letter does:
   bullet lines become a real list, **text** becomes bold, and a short standalone
   line ending in "!" is the welcome heading. Keep in sync with
   _render_letter_body() in welcome_letter_controller.py. */
const BULLET_RE = /^[•●\-*]\s+/;

function inlineBold(s, key) {
  return String(s).split(/(\*\*.+?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>);
}

function LetterBody({ text }) {
  /* The master text is HTML once it has been through the WYSIWYG box. It is
     sanitised by renderLetterParaHtml (the same allow-list the editor uses on
     save), and the styles it carries are the ones the emailed letter carries,
     so the preview really is what the customer receives. A master text saved
     before that box existed is plain, and keeps the marker rules below. */
  if (isParaHtml(text)) {
    return (
      <div className="letter-rich text-[13.5px] leading-[1.6] text-gray-800"
        dangerouslySetInnerHTML={{ __html: renderLetterParaHtml(text) }} />
    );
  }

  const nodes = [];
  let para = [];
  let items = [];
  let n = 0;
  const flushPara = () => {
    if (!para.length) return;
    const lines = para;
    para = [];
    nodes.push(
      <p key={`p${n++}`} className="mb-2 text-justify text-[13.5px] leading-[1.6] text-gray-800">
        {lines.map((ln, j) => (
          <React.Fragment key={j}>{j > 0 && <br />}{inlineBold(ln, `${n}-${j}`)}</React.Fragment>
        ))}
      </p>);
  };
  const flushItems = () => {
    if (!items.length) return;
    const list = items;
    items = [];
    nodes.push(
      <ul key={`u${n++}`} className="mb-2 list-disc pl-6 text-justify text-[13.5px] leading-[1.55] text-gray-800">
        {list.map((it, j) => <li key={j} className="mb-1">{inlineBold(it, `${n}-${j}`)}</li>)}
      </ul>);
  };

  String(text || '').trim().split(/\n{2,}/).forEach((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    lines.forEach((ln) => {
      if (BULLET_RE.test(ln)) {
        flushPara();
        items.push(ln.replace(BULLET_RE, ''));
      } else if (lines.length === 1 && ln.endsWith('!') && ln.length < 60) {
        flushItems();
        nodes.push(
          <p key={`h${n++}`} className="wl-head mb-2 text-[15px] font-bold" style={{ color: themeColor }}>
            {inlineBold(ln, `h${n}`)}
          </p>);
      } else {
        flushItems();
        para.push(ln);
      }
    });
    flushPara();
    flushItems();
  });
  // drop the last block's bottom margin — it would double the gap above the
  // footer band (the emailed letter does the same)
  const last = nodes[nodes.length - 1];
  if (last) {
    nodes[nodes.length - 1] = React.cloneElement(last, {
      style: { ...(last.props.style || {}), marginBottom: 0 },
    });
  }
  return <>{nodes}</>;
}

/* Every column of the Pending Letters grid is sortable. Dates are kept in the
   server's 'YYYY-MM-DD HH:MM' shape, which sorts chronologically as a string. */
const SORT_ACCESSORS = {
  instance_id: (r) => r.instance_id,
  account: (r) => r.account,
  customer_mobile_no: (r) => r.customer_mobile_no,
  email_status: (r) => (r.email ? 'Available' : 'Not Available'),
  branch_name: (r) => r.branch_name,
  installation_site_address: (r) => r.installation_site_address,
  segment: (r) => r.segment,
  engine_app_code: (r) => r.engine_app_code,
  engine_serial_no: (r) => r.engine_serial_no,
  engine_series: (r) => r.engine_series,
  engine_model: (r) => r.engine_model,
  kva_rating: (r) => r.kva_rating,
  commissioning_date: (r) => r.commissioning_date,
  service_request_no: (r) => r.service_request_no,
  sr_created_date: (r) => r.sr_created_date,
  sr_type: (r) => r.sr_type,
  sr_sub_type: (r) => r.sr_sub_type,
  sr_status: (r) => r.sr_status,
  letter_status: (r) => r.letter_status,
  sent_by_name: (r) => r.sent_by_name,
};

/* Branch multi-select dropdown — checkbox list, empty selection = all branches. */
function BranchMultiSelect({ branches, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const label = selected.length === 0
    ? 'All Branches'
    : selected.length === 1
      ? (branches.find((b) => b.branch_id === selected[0])?.branch_name || '1 branch')
      : `${selected.length} branches`;
  return (
    <div className="relative" ref={boxRef}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex min-w-[160px] items-center justify-between gap-1.5`}>
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 flex-none text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-60 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
          style={{ scrollbarWidth: 'thin' }}>
          <button type="button" onClick={() => onChange([])}
            className={`w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold hover:bg-gray-50 ${selected.length === 0 ? 'text-indigo-700' : ''}`}>
            All Branches
          </button>
          {branches.map((b) => (
            <label key={b.branch_id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] hover:bg-gray-50">
              <input type="checkbox" className="accent-indigo-700"
                checked={selected.includes(b.branch_id)} onChange={() => toggle(b.branch_id)} />
              {b.branch_name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   "Which customers appear here" — the rules box behind the hero's
   small "i". Master Admin only: it describes how the list is
   assembled, which is a setup question, not a per-branch one.

   Keep in step with welcome_letter_controller.sync_from_open_sr()
   (what gets added) and _eligible() (what gets retired).
   ============================================================ */
const RULE_TONES = {
  add:  { dot: '#2f3192', bg: 'rgba(47,49,146,0.07)' },
  drop: { dot: '#b45309', bg: 'rgba(180,83,9,0.08)' },
  keep: { dot: '#059669', bg: 'rgba(5,150,105,0.08)' },
};

const InfoSection = ({ title, children }) => (
  <div className="mb-2.5 last:mb-0">
    <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{title}</h3>
    <div className="space-y-1">{children}</div>
  </div>
);

const InfoRule = ({ tone = 'add', label, children }) => {
  const t = RULE_TONES[tone] || RULE_TONES.add;
  return (
    <div className="flex gap-2.5 rounded-lg px-2.5 py-1.5" style={{ background: t.bg }}>
      <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full" style={{ background: t.dot }} />
      <p className="text-[12px] leading-snug text-gray-700">
        <b className="text-gray-900">{label}</b>
        {children ? <> &mdash; {children}</> : null}
      </p>
    </div>
  );
};

export default function WelcomeLetter() {
  const user = useMemo(() => JSON.parse(sessionStorage.getItem('user') || '{}'), []);
  const isMasterAdmin = user?.role === 'master_admin';

  const [tab, setTab] = useState('pending');           // pending | reports | master

  /* ---------------- entries ---------------- */
  const [entries, setEntries] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, sent: 0 });
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fBranches, setFBranches] = useState([]);
  const [fStatus, setFStatus] = useState('PENDING');
  const [fSearch, setFSearch] = useState('');
  // The retirement rules box behind the hero's "i" — Master Admin only, since
  // it explains how the whole list is assembled rather than what is in it.
  const [infoOpen, setInfoOpen] = useState(false);
  const [staleInfo, setStaleInfo] = useState({ before: null, months: 3 });
  const tblRef = useRef(null);

  /* The two frozen left columns must butt against each other with no gap:
     the table stretches to fill wide screens, so column 1 rarely renders at
     exactly its authored 102px. Measure it and pin Account at that width. */
  const col1Ref = useRef(null);
  const [col1W, setCol1W] = useState(102);
  useEffect(() => {
    const el = col1Ref.current;
    if (!el) return;
    const measure = () => setCol1W(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WL}/entries`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load welcome letter customers');
      setEntries(data.items || []);
      setCounts({ total: data.total || 0, pending: data.pending || 0, sent: data.sent || 0 });
      setBranches(data.branches || []);
      setStaleInfo({ before: data.stale_before || null, months: data.max_age_months || 3 });
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const filtered = useMemo(() => {
    const s = fSearch.trim().toLowerCase();
    return entries.filter((r) =>
      (fBranches.length === 0 || fBranches.includes(r.branch_id)) &&
      (!fStatus || r.letter_status === fStatus) &&
      (!s || ['account', 'instance_id', 'service_request_no', 'engine_model',
        'engine_serial_no', 'engine_app_code', 'customer_mobile_no', 'email']
        .some((f) => String(r[f] || '').toLowerCase().includes(s)))
    );
  }, [entries, fBranches, fStatus, fSearch]);

  /* Click a header to sort A–Z, again for Z–A, a third time back to the
     server's own order (newest SR first). */
  const { sort, toggle: toggleSort } = useSort();
  const rows = useSortedRows(filtered, sort, SORT_ACCESSORS);

  const goStatus = (st) => { setFStatus(st); setTab('pending'); };

  /* Letter text + default attachments are the same for every customer, so they
     are fetched once on load and reused — a preview then opens with no wait. */
  const masterCache = useRef(null);
  const refreshMasterCache = useCallback(() => fetch(`${WL}/master`, { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) masterCache.current = d; })
    .catch(() => { }), []);
  useEffect(() => { refreshMasterCache(); }, [refreshMasterCache]);

  /* ---------------- letter preview / send ---------------- */
  const [preview, setPreview] = useState(null);        // payload of /letter/{id}
  const [sending, setSending] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState(null); // { name, url } — shown in place of letter text
  const [customEmail, setCustomEmail] = useState('');   // to-email; pre-filled from customer record, editable
  /* Attachments are NOT chosen here. The server works out what this letter
     carries — every Master Setup default plus the file mapped to the
     customer's engine model — and the preview just shows the result. */
  const openRowRef = useRef(null);                      // row whose preview is open
  const [ccList, setCcList] = useState([]);             // optional cc addresses, one chip each
  const [ccInput, setCcInput] = useState('');           // text still being typed in the cc box
  const [editingEmail, setEditingEmail] = useState(false); // true when the To-email input is shown

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  /* Accept every separator a pasted address list realistically uses. */
  const splitEmails = (v) => String(v || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

  /* Turn whatever is in the cc box into chips; anything that is not a valid
     address stays behind in the input so the user can correct it. */
  const commitCc = (raw) => {
    const parts = splitEmails(raw);
    const good = parts.filter(isValidEmail);
    const bad = parts.filter((p) => !isValidEmail(p));
    if (good.length) {
      setCcList((cur) => {
        const seen = new Set(cur.map((e) => e.toLowerCase()));
        const add = [];
        good.forEach((e) => {
          if (seen.has(e.toLowerCase())) return;
          seen.add(e.toLowerCase());
          add.push(e);
        });
        return add.length ? [...cur, ...add] : cur;
      });
    }
    setCcInput(bad.join(', '));
  };

  const removeCc = (email) => setCcList((cur) => cur.filter((e) => e !== email));

  /* Chips + any still-valid leftover text, de-duplicated. */
  const collectCc = () => {
    const seen = new Set();
    return [...ccList, ...splitEmails(ccInput).filter(isValidEmail)].filter((e) => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const ccPendingInvalid = ccInput.trim() !== '' && splitEmails(ccInput).some((p) => !isValidEmail(p));

  /* What this letter carries, straight from the server. */
  const autoAtt = preview?.attachments || [];
  const fileExt = (n) => String(n || '').split('.').pop().toUpperCase().slice(0, 4);

  /* The modal opens IMMEDIATELY from the row already in the table (and the
     master letter text/attachments already prefetched), then the server
     response fills in the exact ref no + the live attachment list. */
  const openPreview = async (row) => {
    /* The defaults are already known from the cached /master call, so they show
       instantly; the engine-model file can only come from the server, so it
       arrives a moment later. */
    const seed = {
      loading: true,
      entry: row,
      letter_text: masterCache.current?.letter_text || '',
      ref_no: row.ref_no || `WL/${row.branch_id || 'HO'}/${row.service_request_no || row.instance_id}`,
      attachments: (masterCache.current?.default_attachments || [])
        .map((a) => ({ ...a, source: 'default' })),
    };
    setViewingAttachment(null);
    setCustomEmail(row.email || '');
    setCcList([]);
    setCcInput('');
    setEditingEmail(!row.email);
    setPreview(seed);
    openRowRef.current = row.id;
    try {
      const res = await fetch(`${WL}/letter/${row.id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load the letter');
      if (openRowRef.current !== row.id) return;    // another row opened meanwhile
      setPreview({ ...data, loading: false });
      setCustomEmail((cur) => cur || data.entry.email || '');
    } catch (e) {
      toast.error(e.message);
      if (openRowRef.current === row.id) setPreview(null);
    }
  };

  const closePreview = () => {
    // the object URL belongs to fileCache and is reused by the next letter —
    // it is revoked when the page unmounts, never here
    openRowRef.current = null;
    setPreview(null);
    setViewingAttachment(null);
    setCustomEmail('');
    setCcList([]);
    setCcInput('');
    setEditingEmail(false);
  };

  /* Browsers can only render PDFs and images in a frame; Word/Excel files are
     offered as a download instead of a blank viewer. */
  const inlineKind = (name) => {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    return null;
  };

  /* Attachment bytes are fetched at most ONCE per session and kept as an object
     URL. Opening the same maintenance chart on letter after letter used to pull
     the whole blob out of SQL Server every time — that is what made "View" slow.
     (The server now also answers with an ETag, so even a page reload revalidates
     instead of re-downloading.) */
  const fileCache = useRef(new Map());        // id -> { url, name }
  useEffect(() => {
    const cache = fileCache.current;
    return () => { cache.forEach((v) => URL.revokeObjectURL(v.url)); cache.clear(); };
  }, []);

  const fetchFile = useCallback(async (id, name) => {
    const hit = fileCache.current.get(id);
    if (hit) return hit;
    const res = await fetch(`${WL}/master/files/${id}`, { headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'File not available');
    }
    const raw = await res.blob();
    // A blob typed application/octet-stream makes the browser download the file
    // rather than display it. slice() re-types it without copying the bytes.
    const ext = String(name || '').split('.').pop().toLowerCase();
    const blob = ext === 'pdf' && raw.type !== 'application/pdf'
      ? raw.slice(0, raw.size, 'application/pdf')
      : raw;
    const entry = { url: URL.createObjectURL(blob), name };
    fileCache.current.set(id, entry);
    return entry;
  }, []);

  /* Warm the cache in the background — hovering a file name is enough notice to
     have it ready by the time it is clicked. */
  const prefetchFile = useCallback((id, name) => {
    if (!fileCache.current.has(id)) fetchFile(id, name).catch(() => { });
  }, [fetchFile]);

  const openAttachment = async (id, name) => {
    const shown = inlineKind(name);
    const withUrl = (url) => setViewingAttachment({
      name, kind: shown, loading: false, raw: url,
      // toolbar on, thumbnail panel off
      url: shown === 'pdf' ? `${url}#toolbar=1&navpanes=0&scrollbar=1` : url,
    });
    const hit = fileCache.current.get(id);
    if (hit) { withUrl(hit.url); return; }        // already here — opens instantly
    setViewingAttachment({ name, kind: shown, loading: true, url: null, raw: null });
    try {
      withUrl((await fetchFile(id, name)).url);
    } catch (e) {
      toast.error(e.message);
      setViewingAttachment(null);
    }
  };

  const downloadViewed = () => {
    if (!viewingAttachment?.raw) return;
    const a = document.createElement('a');
    a.href = viewingAttachment.raw;
    a.download = viewingAttachment.name || 'attachment';
    a.click();
  };

  /* ---- print the letter on A4 ----
     The sheet is lifted into its own window rather than printed through a
     @media print rule: the letter lives inside a scrolling modal, and every
     browser clips or re-flows that differently. A copy of the app's own
     stylesheets plus a <base> tag makes the clone render (and find the
     letterhead PNGs) exactly as it does on screen. */
  const letterRef = useRef(null);

  const printLetter = async () => {
    const node = letterRef.current;
    if (!node) return;
    // The window must open synchronously (pop-up blockers), so it starts on a
    // placeholder while the attachment pages are prepared.
    const win = window.open('', '_blank', 'width=880,height=1000');
    if (!win) { toast.error('Allow pop-ups for this site to print the letter'); return; }
    win.document.write('<html><head><title>Welcome Letter</title></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;"><div style="padding:24px;color:#555;">Preparing print… please wait.</div></body></html>');
    win.document.close();

    /* The attachments print in the SAME job: each image on its own sheet,
       centred and shrunk to fit; each PDF page on its own sheet. Files come
       through the same fileCache the View buttons use, and the rendered pages
       are memoised in the util — a re-print costs nothing. The usable height
       under this window's 10mm/8mm paper margins is ~277mm, so pages are cut
       at 275mm. A file that fails to load prints as its name, never blocking
       the letter itself. */
    let attHtml = '';
    try {
      const files = [];
      for (const a of autoAtt) {
        try {
          const f = await fetchFile(a.id, a.file_name);
          files.push({ name: a.file_name, url: f.url });
        } catch (e) { files.push({ name: a.file_name }); }
      }
      attHtml = await buildAttachmentPagesHtml(files, { pageHeightMm: 275 });
    } catch (e) { attHtml = ''; }
    if (win.closed) return;

    const styles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML).join('');
    win.document.open();
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<base href="${window.location.origin}/">
<title>Welcome Letter ${preview?.ref_no || ''}</title>
${styles}
<style>
  /* 10mm of paper margin all round, so the letterhead bands are never eaten by
     the printer's non-printable edge, and the sheet's own side padding sits
     inside that. */
  @page { size: A4; margin: 10mm 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .wl-print-sheet { width: 100%; max-width: 194mm; margin: 0 auto; background: #fff;
                    border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
  .wl-print-sheet img { display: block; width: 100%; height: auto; }
  /* keep a paragraph from being split across two sheets mid-sentence */
  .wl-print-sheet p, .wl-print-sheet li { break-inside: avoid; }
</style></head>
<body><div class="wl-print-sheet">${node.innerHTML}</div>${attHtml}</body></html>`);
    win.document.close();
    // the letterhead bands must finish decoding first, or Chrome prints gaps
    win.onafterprint = () => win.close();       // also fires when the dialog is cancelled
    const go = () => { win.focus(); win.print(); };
    const imgs = Array.from(win.document.images);
    const ready = () => imgs.every((im) => im.complete);
    let waited = 0;
    const tick = () => {
      if (ready() || waited > 6000) { setTimeout(go, 120); return; }
      waited += 120;
      setTimeout(tick, 120);
    };
    tick();
  };

  /* ---- an email typed here is kept on the customer record ----
     Saved as soon as the sender confirms it, not only when the letter goes
     out: the address is just as useful to the customers table if they close
     the box without sending. */
  const [savingEmail, setSavingEmail] = useState(false);

  const confirmEmail = async () => {
    const email = customEmail.trim();
    if (!isValidEmail(email)) return;
    setEditingEmail(false);
    if (!preview || email.toLowerCase() === String(preview.entry.email || '').trim().toLowerCase()) return;
    setSavingEmail(true);
    try {
      const res = await fetch(`${WL}/customer-email/${preview.entry.id}`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not save the email');
      if (data.changed) toast.success(data.message || 'Saved to the customer record');
      // keep the open modal and the table row in step with the database
      setPreview((p) => (p ? { ...p, entry: { ...p.entry, email } } : p));
      setEntries((cur) => cur.map((r) => (r.id === preview.entry.id ? { ...r, email } : r)));
    } catch (e) { toast.error(e.message); }
    finally { setSavingEmail(false); }
  };

  const doSend = async () => {
    if (!preview || sending) return;
    const emailToUse = customEmail.trim();
    if (!emailToUse) return;
    if (!isValidEmail(emailToUse)) { toast.error('Enter a valid To email address'); return; }
    if (ccPendingInvalid) { toast.error('Enter valid CC email address(es)'); return; }
    const ccAll = collectCc();
    setSending(true);
    try {
      const params = new URLSearchParams();
      if (emailToUse !== (preview.entry.email || '')) params.set('email', emailToUse);
      if (ccAll.length) params.set('cc', ccAll.join(','));
      // the attachment list is not sent: the server works it out from the
      // Master Setup defaults + this customer's engine model
      const qs = params.toString();
      const url = `${WL}/send/${preview.entry.id}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not send the letter');
      toast.success(data.message || 'Welcome letter sent');
      closePreview();
      loadEntries();
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  /* ---------------- reports ---------------- */
  const [rep, setRep] = useState(null);
  const [rBranches, setRBranches] = useState([]);
  const [rUser, setRUser] = useState('');
  const [repMode, setRepMode] = useState('SENT');      // bottom table: SENT | PENDING
  const [repPopup, setRepPopup] = useState(null);      // 'users' | 'branch' | null

  const loadReport = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (rBranches.length) p.set('branch', rBranches.join(','));
      if (rUser) p.set('user', rUser);
      const res = await fetch(`${WL}/report?${p}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load the report');
      setRep(data);
    } catch (e) { toast.error(e.message); }
  }, [rBranches, rUser]);

  useEffect(() => { if (tab === 'reports') loadReport(); }, [tab, loadReport]);

  const repPending = useMemo(
    () => entries.filter((r) => r.letter_status === 'PENDING' && (rBranches.length === 0 || rBranches.includes(r.branch_id))),
    [entries, rBranches]);

  /* ---------------- master setup ---------------- */
  const [master, setMaster] = useState(null);
  const [msub, setMsub] = useState('text');            // text | attachments
  const [tplText, setTplText] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const defFileRef = useRef(null);

  const loadMaster = useCallback(async () => {
    try {
      const res = await fetch(`${WL}/master`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load master setup');
      setMaster(data);
      setTplText(data.letter_text || '');
    } catch (e) { toast.error(e.message); }
  }, []);

  useEffect(() => { if (tab === 'master') loadMaster(); }, [tab, loadMaster]);

  const saveTpl = async () => {
    setSavingTpl(true);
    try {
      const res = await fetch(`${WL}/master/letter-text`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ letter_text: tplText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not save the letter text');
      toast.success('Letter text saved');
    } catch (e) { toast.error(e.message); }
    finally { setSavingTpl(false); }
  };

  const [uploadingDefault, setUploadingDefault] = useState(false);
  const uploadDefaults = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    setUploadingDefault(true);
    try {
      const res = await fetch(`${WL}/master/attachments`, {
        method: 'POST', headers: authHeaders(), body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Upload failed');
      toast.success(data.message || `${files.length} attachment(s) added`);
      loadMaster();
      refreshMasterCache();
    } catch (e) { toast.error(e.message); }
    finally { setUploadingDefault(false); }
  };

  /* Nothing in Master Setup is deleted on a single click — every file here is
     already going out on live letters, and there is no undo. */
  const [confirmBox, setConfirmBox] = useState(null);   // { title, lines[], label, onYes }
  const [confirmBusy, setConfirmBusy] = useState(false);

  const runConfirm = async () => {
    if (!confirmBox || confirmBusy) return;
    setConfirmBusy(true);
    try { await confirmBox.onYes(); setConfirmBox(null); }
    finally { setConfirmBusy(false); }
  };

  const deleteDefault = async (id) => {
    try {
      const res = await fetch(`${WL}/master/attachments/${id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Delete failed');
      toast.success('Attachment deleted');
      loadMaster();
      refreshMasterCache();
    } catch (e) { toast.error(e.message); }
  };

  const askDeleteDefault = (a) => setConfirmBox({
    title: 'Delete this attachment?',
    lines: [
      <><b>{a.file_name}</b> will be removed from Master Setup.</>,
      'It goes out with EVERY welcome letter, so from now on letters will be sent without it.',
      'Letters already sent are not affected. This cannot be undone.',
    ],
    label: 'Delete attachment',
    onYes: () => deleteDefault(a.id),
  });

  const viewFile = async (id, name) => {
    try { window.open((await fetchFile(id, name)).url, '_blank', 'noopener'); }
    catch (e) { toast.error(e.message); }
  };

  const downloadFile = async (id, name) => {
    try {
      const a = document.createElement('a');
      a.href = (await fetchFile(id, name)).url;
      a.download = name || 'attachment';
      a.click();
      // no revoke: the URL stays in fileCache for the rest of the session
    } catch (e) { toast.error(e.message); }
  };

  /* ---- rename a master attachment ---- */
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [savingName, setSavingName] = useState(false);

  const startRename = (a) => { setRenameId(a.id); setRenameVal(a.file_name || ''); };

  const saveRename = async () => {
    const name = renameVal.trim();
    if (!name) { toast.error('Enter a file name'); return; }
    setSavingName(true);
    try {
      const res = await fetch(`${WL}/master/attachments/${renameId}`, {
        method: 'PATCH', headers: jsonHeaders(),
        body: JSON.stringify({ file_name: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not rename the file');
      toast.success(data.message || 'File name updated');
      setRenameId(null);
      loadMaster();
      refreshMasterCache();      // the preview picker shows the old name otherwise
    } catch (e) { toast.error(e.message); }
    finally { setSavingName(false); }
  };

  /* ============================================================ RENDER */
  const tabs = [
    { k: 'pending', label: 'Pending Letters', icon: EnvelopeIcon, badge: counts.pending },
    { k: 'reports', label: 'Reports', icon: ChartBarIcon },
    ...(isMasterAdmin ? [{ k: 'master', label: 'Master Setup', icon: ListBulletIcon }] : []),
  ];

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-10 max-md:px-2">

        {/* ===== HERO (tabs + status pills on its right) ===== */}
        <div className="rounded-2xl px-4 sm:px-5 py-3 mb-3.5 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="relative flex flex-wrap items-center gap-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15">
              <PaperAirplaneIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-tight">Welcome Letter</h1>
              <p className="text-[11px] text-white/70 leading-tight">
                Welcome letter dispatch &amp; tracking
              </p>
            </div>
            <div className="flex-1" />
            <button onClick={() => goStatus('')}
              className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1 text-[11px] font-medium transition">
              Customers: <b className="font-bold">{counts.total}</b>
            </button>
            <button onClick={() => goStatus('PENDING')}
              className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1 text-[11px] font-medium transition">
              Pending: <b className="font-bold">{counts.pending}</b>
            </button>
            <button onClick={() => goStatus('SENT')}
              className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1 text-[11px] font-medium transition">
              Sent: <b className="font-bold">{counts.sent}</b>
            </button>
            {isMasterAdmin && (
              <button onClick={() => setInfoOpen(true)} title="How this list is built"
                aria-label="How this list is built"
                className="grid h-[26px] w-[26px] place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 transition hover:bg-white/35">
                <InformationCircleIcon className="h-[17px] w-[17px]" />
              </button>
            )}
            <div className="flex gap-0.5 rounded-lg bg-white/15 p-0.5">
              {tabs.map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition"
                  style={tab === t.k ? { background: '#fff', color: themeColor } : { color: 'rgba(255,255,255,0.8)' }}>
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                  {t.badge > 0 && (
                    <span className="rounded-full px-1.5 text-[10px] font-bold"
                      style={tab === t.k ? { background: 'rgba(217,119,6,0.15)', color: '#b45309' } : { background: 'rgba(255,255,255,0.25)', color: '#fff' }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ================= TAB: PENDING LETTERS ================= */}
        {tab === 'pending' && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 border-b border-gray-200">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
                Branch
                <BranchMultiSelect branches={branches} selected={fBranches} onChange={setFBranches} />
              </span>
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
                Status
                <select className={inputCls} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="SENT">Sent</option>
                </select>
              </label>
              <input type="search" className={`${inputCls} min-w-[230px]`} placeholder="Search customer / instance / SR / engine…"
                value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
              <div className="flex-1" />
              <span className="text-[11.5px] text-gray-500"
                title={'A pending letter drops off once the Asset Detailed commissioning date is more than 3 months old, '
                  + 'or once the Open SR data holds no CC row for that instance any more. '
                  + 'A commissioning date that is simply missing keeps the record. Sent letters always stay.'}>
                {loading ? 'Loading…' : `${rows.length} of ${entries.length} records`}
              </span>
            </div>

            <TopScrollbar scrollRef={tblRef} deps={[rows.length, loading]} />
            <div ref={tblRef} className="overflow-x-auto rounded-b-xl" style={{ scrollbarWidth: 'thin' }}>
              {/* table-fixed honours the per-column widths below, so long
                  values ellipsize instead of stretching their column */}
              {/* border-separate (not collapse): collapsed borders belong to the
                  table, so the grid lines of the frozen columns would vanish
                  once they pin. Separated borders travel with the cell. */}
              <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]" style={{ minWidth: 2458 }}>
                <thead>
                  <tr>
                    {/* Open SR file columns — personal/customer info first, then engine & SR info.
                        Every one of them sorts: click A–Z, again Z–A, again back to
                        the server's newest-SR-first order. */}
                    {/* Instance Id + Account freeze on the left (Action freezes on the right)
                        so the row stays identifiable while scrolling sideways */}
                    <SortTh thRef={col1Ref} label={<>Instance Id<br />[Asset #]</>} labelText="Instance Id" sortKey="instance_id" sort={sort} onSort={toggleSort} wrap
                      className={`${thSortCls} sticky left-0 z-20`} style={{ width: 116 }} />
                    <SortTh label="Account" sortKey="account" sort={sort} onSort={toggleSort} wrap
                      className={`${thSortCls} sticky z-20 shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)] border-r`} style={{ width: 172, left: col1W }} />
                    <SortTh label={<>Customer<br />Mobile #</>} labelText="Customer Mobile #" sortKey="customer_mobile_no" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 106 }} />
                    <SortTh label="Branch" sortKey="branch_name" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 156 }} />
                    <SortTh label={<>Installation<br />Site Address</>} labelText="Installation Site Address" sortKey="installation_site_address" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 192 }} />
                    <SortTh label="Segment" sortKey="segment" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 90 }} />
                    <SortTh label={<>Engine<br />App Code</>} labelText="Engine App Code" sortKey="engine_app_code" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 126 }} />
                    <SortTh label={<>Engine<br />Serial#</>} labelText="Engine Serial#" sortKey="engine_serial_no" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 100 }} />
                    <SortTh label={<>Engine<br />Series</>} labelText="Engine Series" sortKey="engine_series" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 92 }} />
                    <SortTh label={<>Engine<br />Model</>} labelText="Engine Model" sortKey="engine_model" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 126 }} />
                    {/* from asset_detailed, linked on Instance ID — drives the
                        maintenance-chart match */}
                    <SortTh label={<>KVA<br />Rating</>} labelText="KVA Rating" sortKey="kva_rating" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 92 }} />
                    {/* also from asset_detailed — the date the 3-month staleness
                        rule is measured against */}
                    <SortTh label={<>Commissioning<br />Date</>} labelText="Commissioning Date" sortKey="commissioning_date" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 116 }} />
                    <SortTh label={<>Service<br />Request #</>} labelText="Service Request #" sortKey="service_request_no" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 104 }} />
                    <SortTh label={<>SR Created<br />Date</>} labelText="SR Created Date" sortKey="sr_created_date" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 110 }} />
                    <SortTh label="SR Type" sortKey="sr_type" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 92 }} />
                    <SortTh label={<>SR<br />Sub-Type</>} labelText="SR Sub-Type" sortKey="sr_sub_type" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 96 }} />
                    <SortTh label="Status" sortKey="sr_status" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 84 }} />
                    <SortTh label={<>Letter<br />Status</>} labelText="Letter Status" sortKey="letter_status" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 96 }} />
                    {/* Whether the customers table already holds an email for this
                        Instance ID — without one the letter cannot be sent, so it
                        is worth seeing before opening the preview. Sort this column
                        to bring every missing address together. */}
                    <SortTh label={<>Email<br />Status</>} labelText="Email Status" sortKey="email_status" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 118 }} />
                    <SortTh label={<>Sent By</>} labelText="Sent By" sortKey="sent_by_name" sort={sort} onSort={toggleSort} wrap
                      className={thSortCls} style={{ width: 132 }} />
                    <th className={`${thWrapCls} sticky right-0 shadow-[-6px_0_8px_-6px_rgba(16,24,40,0.18)] border-l`} style={{ width: 142 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={21} className="p-0">
                      <div className="flex min-h-[180px] items-center justify-center text-[12.5px] text-gray-400">
                        {loading ? 'Loading…' : 'No records match the current filters.'}
                      </div>
                    </td></tr>
                  )}
                  {rows.map((r) => (
                    /* the whole row opens the letter — the Action button is kept
                       for anyone who looks for a button */
                    <tr key={r.id} onClick={() => openPreview(r)}
                      title={r.letter_status === 'SENT' ? 'Open the sent letter' : 'Open the preview & send box'}
                      className="cursor-pointer hover:bg-indigo-50/40 group">
                      <td className={`${tdSmCls} tabular-nums text-center sticky left-0 z-10 bg-white group-hover:bg-indigo-50`}>{r.instance_id}</td>
                      <td className={`${tdTruncCls} font-medium sticky z-10 bg-white group-hover:bg-indigo-50 shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)] border-r`}
                        style={{ left: col1W }} title={r.account || ''}>{r.account || '—'}</td>
                      <td className={`${tdSmCls} tabular-nums text-center`}>{r.customer_mobile_no || '—'}</td>
                      <td className={tdSmCls} title={r.branch_name || ''}>
                        {r.branch_name || <span className="text-gray-400">—</span>}
                      </td>
                      <td className={tdTruncCls} title={r.installation_site_address || ''}>
                        {r.installation_site_address || <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${tdSmCls} text-center`}>{r.segment || '—'}</td>
                      <td className={`${tdSmCls} tabular-nums`} title={r.engine_app_code || ''}>{r.engine_app_code || '—'}</td>
                      <td className={`${tdSmCls} tabular-nums text-center`}>{r.engine_serial_no || '—'}</td>
                      <td className={`${tdSmCls} text-center`} title={r.engine_series || ''}>{r.engine_series || '—'}</td>
                      <td className={tdSmCls} title={r.engine_model || ''}>{r.engine_model || '—'}</td>
                      <td className={`${tdSmCls} tabular-nums text-center`}
                        title={r.kva_rating ? 'From the Asset Detailed Report (matched on Instance ID)' : 'No asset record for this Instance ID'}>
                        {r.kva_rating ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${tdSmCls} tabular-nums text-center`}
                        title={r.commissioning_date
                          ? 'From the Asset Detailed Report (matched on Instance ID)'
                          : 'No commissioning date on the Asset Detailed Report — the 3-month rule cannot retire this letter'}>
                        {fmtDate(r.commissioning_date) || <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${tdSmCls} tabular-nums text-center`}>{r.service_request_no || '—'}</td>
                      <td className={`${tdSmCls} tabular-nums text-center`}>{fmtDate(r.sr_created_date) || <span className="text-gray-400">—</span>}</td>
                      <td className={`${tdSmCls} text-center`} title={r.sr_type || ''}>{r.sr_type || '—'}</td>
                      <td className={`${tdSmCls} text-center`}>
                        <span className={pillCls} style={{ background: themeSoft, color: themeColor }}>{r.sr_sub_type || 'CC'}</span>
                      </td>
                      <td className={`${tdSmCls} text-center`} title={r.sr_status || ''}>{r.sr_status || '—'}</td>
                      <td className={`${tdSmCls} text-center`}>
                        {r.letter_status === 'SENT'
                          ? <span className={`${pillCls} bg-emerald-50 text-emerald-700`} title={`Sent by ${r.sent_by_name || ''} on ${r.sent_at || ''}`}>Sent ✓</span>
                          : <span className={`${pillCls} bg-amber-50 text-amber-700`}>Pending</span>}
                      </td>
                      <td className={`${tdSmCls} text-center`}
                        title={r.email || 'No email on the customer record — type one in the preview and it is saved back to the customer'}>
                        {r.email
                          ? <span className={`${pillCls} bg-emerald-50 text-emerald-700`}>Available ✓</span>
                          : <span className={`${pillCls} bg-red-50 text-red-700`}>Not Available</span>}
                      </td>
                      <td className={`${tdTruncCls} text-center`} title={r.letter_status === 'SENT' ? `${r.sent_by_name || ''} · sent ${r.sent_at || ''}` : ''}>
                        {r.letter_status === 'SENT'
                          ? r.sent_by_name
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${tdSmCls} sticky right-0 bg-white group-hover:bg-indigo-50 text-center shadow-[-6px_0_8px_-6px_rgba(16,24,40,0.18)] border-l`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openPreview(r); }}
                          className="rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-white transition"
                          style={{ background: r.letter_status === 'SENT' ? '#6b7280' : themeColor }}>
                          {r.letter_status === 'SENT' ? 'View' : 'Preview & Send'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB: REPORTS ================= */}
        {tab === 'reports' && (
          <>
            <div className="grid gap-2.5 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
              <button onClick={() => setRepMode('SENT')}
                className="flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 shadow-sm text-left transition hover:shadow"
                style={{ borderColor: repMode === 'SENT' ? '#059669' : '#e5e7eb' }}>
                <span className="h-9 w-9 rounded-lg grid place-items-center bg-emerald-50 text-emerald-600"><PaperAirplaneIcon className="h-5 w-5" /></span>
                <span><span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Letters Sent</span>
                  <span className="block text-[21px] font-bold leading-tight">{rep?.sent?.length ?? 0}</span></span>
              </button>
              <button onClick={() => setRepMode('PENDING')}
                className="flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 shadow-sm text-left transition hover:shadow"
                style={{ borderColor: repMode === 'PENDING' ? '#d97706' : '#e5e7eb' }}>
                <span className="h-9 w-9 rounded-lg grid place-items-center bg-amber-50 text-amber-600"><ClockIcon className="h-5 w-5" /></span>
                <span><span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Pending</span>
                  <span className="block text-[21px] font-bold leading-tight">{repPending.length}</span></span>
              </button>
              <button onClick={() => setRepPopup('users')}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm text-left transition hover:shadow hover:border-indigo-300">
                <span className="h-9 w-9 rounded-lg grid place-items-center" style={{ background: themeSoft, color: themeColor }}><UsersIcon className="h-5 w-5" /></span>
                <span><span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Active Users</span>
                  <span className="block text-[21px] font-bold leading-tight">{rep?.user_wise?.length ?? 0}</span></span>
              </button>
              <button onClick={() => setRepPopup('branch')}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm text-left transition hover:shadow hover:border-indigo-300">
                <span className="h-9 w-9 rounded-lg grid place-items-center" style={{ background: themeSoft, color: themeColor }}><BuildingOffice2Icon className="h-5 w-5" /></span>
                <span><span className="block text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Branches Covered</span>
                  <span className="block text-[21px] font-bold leading-tight">{rep?.branch_wise?.filter((b) => b.sent > 0).length ?? 0}</span></span>
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-3 px-3.5 py-2.5 flex flex-wrap items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
                Branch
                <BranchMultiSelect branches={branches} selected={rBranches} onChange={setRBranches} />
              </span>
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
                User
                <select className={inputCls} value={rUser} onChange={(e) => setRUser(e.target.value)}>
                  <option value="">All Users</option>
                  {(rep?.users || []).map((u) => (
                    <option key={u.user_id} value={u.user_id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex-1" />
              <span className="text-[11.5px] text-gray-500">
                {rep ? `${rep.sent.length} sent · ${repPending.length} pending` : 'Loading…'}
              </span>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-200 text-[12.5px] font-bold">
                <DocumentTextIcon className="h-4 w-4" style={{ color: themeColor }} />
                {repMode === 'SENT' ? 'Sent Letter Details' : 'Pending Letter Details'}
                <span className="ml-auto text-[11.5px] font-medium text-gray-500">
                  {repMode === 'SENT' ? 'newest first' : 'welcome letter not sent yet'}
                </span>
              </div>
              <div className="overflow-x-auto rounded-b-xl" style={{ scrollbarWidth: 'thin' }}>
                {repMode === 'SENT' ? (
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead><tr>
                      <th className={thCls}>Ref No</th><th className={thCls}>Sent Date &amp; Time</th>
                      <th className={thCls}>Sent By</th><th className={thCls}>Customer</th>
                      <th className={thCls}>Instance ID</th><th className={thCls}>Branch</th>
                      <th className={thCls}>KVA</th><th className={thCls}>Attachments</th>
                      <th className={thCls}>Sent To (Email)</th>
                    </tr></thead>
                    <tbody>
                      {(!rep || rep.sent.length === 0) && (
                        <tr><td colSpan={9} className="p-0">
                          <div className="flex min-h-[180px] items-center justify-center text-[12.5px] text-gray-400">No sent letters match the current filters.</div>
                        </td></tr>
                      )}
                      {rep?.sent.map((r) => (
                        <tr key={r.id} className="hover:bg-indigo-50/40">
                          <td className={`${tdCls} font-semibold tabular-nums`}>{r.ref_no}</td>
                          <td className={`${tdCls} tabular-nums`}>{r.sent_at}</td>
                          <td className={`${tdCls} font-semibold`}>{r.sent_by_name}</td>
                          <td className={tdCls} title={r.account || ''}>{r.account || '—'}</td>
                          <td className={`${tdCls} tabular-nums`}>{r.instance_id}</td>
                          <td className={tdCls}>{r.branch_name || '—'}</td>
                          <td className={`${tdCls} tabular-nums`}>{r.kva_rating ?? '—'}</td>
                          <td className={`${tdCls} tabular-nums`}>{r.attachments} files</td>
                          <td className={tdCls}>{r.sent_to_email || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead><tr>
                      <th className={thCls}>SR No</th><th className={thCls}>Instance ID</th>
                      <th className={thCls}>Customer</th><th className={thCls}>Branch</th>
                      <th className={thCls}>KVA</th><th className={thCls}>Segment</th>
                      <th className={thCls}>Email</th><th className={thCls}>Mobile No</th>
                    </tr></thead>
                    <tbody>
                      {repPending.length === 0 && (
                        <tr><td colSpan={8} className="p-0">
                          <div className="flex min-h-[180px] items-center justify-center text-[12.5px] text-gray-400">No pending letters match the current filters.</div>
                        </td></tr>
                      )}
                      {repPending.map((r) => (
                        <tr key={r.id} className="hover:bg-indigo-50/40">
                          <td className={`${tdCls} tabular-nums`}>{r.service_request_no || '—'}</td>
                          <td className={`${tdCls} tabular-nums`}>{r.instance_id}</td>
                          <td className={tdCls} title={r.account || ''}>{r.account || '—'}</td>
                          <td className={tdCls}>{r.branch_name || '—'}</td>
                          <td className={`${tdCls} tabular-nums`}>{r.kva_rating ?? '—'}</td>
                          <td className={tdCls}>{r.segment || '—'}</td>
                          <td className={tdCls}>{r.email || <span className="text-gray-400">—</span>}</td>
                          <td className={`${tdCls} tabular-nums`}>{r.customer_mobile_no || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* ================= TAB: MASTER SETUP ================= */}
        {tab === 'master' && isMasterAdmin && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-gray-200 text-[12.5px] font-bold">
              <ListBulletIcon className="h-4 w-4" style={{ color: themeColor }} />
              Master Setup
              <div className="ml-auto flex flex-wrap gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                {[['text', 'Letter Text'], ['attachments', 'Default Attachments'],
                  ['models', 'Model-wise Attachments']].map(([k, l]) => (
                  <button key={k} onClick={() => setMsub(k)}
                    className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition whitespace-nowrap"
                    style={msub === k
                      ? { background: '#e5e7eb', color: themeColor, boxShadow: '0 1px 2px rgba(16,24,40,0.08)' }
                      : { color: '#6b7280' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {msub === 'text' && (
              <div className="p-4">
                {/* Same box as the drive Letter Master's paragraphs: bullets,
                    numbering, bold/italic/underline and per-line text size. */}
                <LetterParaEditor value={tplText} onChange={setTplText}
                  placeholder="Write the welcome letter text here…"
                  className={`${inputCls} w-full min-h-[480px] leading-relaxed`} />
                <button onClick={saveTpl} disabled={savingTpl}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition disabled:opacity-50"
                  style={{ background: themeColor }}>
                  {savingTpl ? 'Saving…' : 'Save Letter Text'}
                </button>
              </div>
            )}

            {msub === 'attachments' && (
              <div>
                {(master?.default_attachments || []).map((a) => (
                  <div key={a.id}
                    onMouseEnter={() => prefetchFile(a.id, a.file_name)}
                    className="flex items-center gap-2.5 px-3.5 py-2 border-b border-gray-100 text-[12.5px]">
                    <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-[9px] font-extrabold"
                      style={{ background: themeSoft, color: themeColor }}>{fileExt(a.file_name)}</span>
                    {renameId === a.id ? (
                      <>
                        {/* the extension is kept by the server whatever is typed —
                            it is what tells the customer's mail client how to open
                            the file */}
                        <input value={renameVal} autoFocus
                          onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename();
                            if (e.key === 'Escape') setRenameId(null);
                          }}
                          className={`${inputCls} min-w-0 flex-1`} />
                        <button onClick={saveRename} disabled={savingName || !renameVal.trim()}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition disabled:opacity-40"
                          style={{ background: themeColor }}>
                          <CheckIcon className="h-3.5 w-3.5" /> {savingName ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setRenameId(null)}
                          className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[11.5px] font-semibold text-gray-600">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="truncate" title={a.file_name}>{a.file_name}</span>
                        <button onClick={() => startRename(a)} title="Rename file"
                          className="ml-auto shrink-0 rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => viewFile(a.id, a.file_name)} title="View"
                          className="shrink-0 rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => downloadFile(a.id, a.file_name)} title="Download"
                          className="shrink-0 rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                          <ArrowDownTrayIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => askDeleteDefault(a)} title="Remove"
                          className="shrink-0 rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {(master?.default_attachments || []).length === 0 && (
                  <div className="flex min-h-[220px] items-center justify-center px-3 text-center text-[12.5px] text-gray-400">
                    No attachments yet — files added here are offered on every letter preview.
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                  <label className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white ${uploadingDefault ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    style={{ background: themeColor }}>
                    <PaperClipIcon className="h-3.5 w-3.5" />
                    {uploadingDefault ? 'Uploading…' : 'Choose Files'}
                    <input ref={defFileRef} type="file" multiple disabled={uploadingDefault}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                      className="sr-only"
                      onChange={(e) => { uploadDefaults(e.target.files); e.target.value = ''; }} />
                  </label>
                  <span className="text-[11.5px] text-gray-500">
                    Select one or more files (Ctrl/Shift-click) — they upload immediately and are stored in the database.
                    <b> Every file listed here is attached to EVERY welcome letter automatically</b> — the sender
                    cannot add or remove them. Use the pencil to rename a file; the customer sees that name on the mail.
                  </span>
                </div>
              </div>
            )}

            {msub === 'models' && (
              /* The very same master the drive Letter Master edits — one
                 component, one set of endpoints, one pair of tables. */
              <ModelWiseAttachments onChanged={refreshMasterCache} />
            )}
          </div>
        )}

        {/* ================= LETTER PREVIEW MODAL ================= */}
        {preview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-gray-900/50 p-5"
            onClick={(e) => { if (e.target === e.currentTarget) closePreview(); }}>
            {/* Card never grows past the viewport — header and footer stay put,
                only the letter body scrolls. */}
            <div className="flex max-h-[calc(100dvh-2.5rem)] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-gray-200 px-4 py-3">
                <h2 className="text-[15px] font-bold">Welcome Letter Preview</h2>
                <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                  {/* Filled in the page's own hero gradient so it reads as an
                      action next to the grey information pills, not as one of them */}
                  <button onClick={printLetter} disabled={!!viewingAttachment}
                    title={viewingAttachment ? 'Go back to the letter to print it' : 'Print the letter on A4'}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11.5px] font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
                    <PrinterIcon className="h-3.5 w-3.5" /> Print
                  </button>
                  {/* Sender aid — which chart to attach depends on these two */}
                  <span className={`${pillCls} bg-gray-100 text-gray-700`}>
                    KVA <b className="tabular-nums">{preview.entry.kva_rating ?? '—'}</b>
                  </span>
                  <span className={`${pillCls} max-w-[220px] truncate bg-gray-100 text-gray-700`}
                    title={preview.entry.engine_model || ''}>
                    Engine Model <b>{preview.entry.engine_model || '—'}</b>
                  </span>
                  <span className={pillCls} style={{ background: themeSoft, color: themeColor }}>
                    {preview.ref_no} · {preview.entry.instance_id}
                  </span>
                  <button onClick={closePreview} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Everything below the title bar scrolls together — letter,
                  attachments and the To/Cc + action rows. */}
              <div className="flex min-h-[140px] flex-1 flex-col overflow-y-auto overscroll-contain bg-gray-50"
                style={{ scrollbarWidth: 'thin' }}>
              <div className="grid auto-rows-max gap-3.5 p-4">
                {/* The bands are served to the browser from /public but are read
                    off the SERVER's disk for the email. When the server cannot
                    find them the preview still looks right while the customer
                    gets a letter with no logo — so say so, loudly. */}
                {preview.letterhead_ok === false && (
                  <div className="mx-auto w-full max-w-[720px] rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-[12px] font-semibold text-amber-800">
                    The letterhead image is missing on the server — this letter would be emailed
                    without the logo. Restore <b>letter-header-band.png</b> / <b>letter-footer-band.png</b>
                    under <b>server/assets</b> and restart the backend before sending.
                  </div>
                )}
                {/* letter sheet — same letterhead the customer receives */}
                <div ref={letterRef}
                  className="wl-sheet mx-auto w-full max-w-[720px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  {!viewingAttachment && (
                    <img src="/letter-header-band.png" alt="KALA Care · Kirloskar care"
                      className="block w-full" />
                  )}
                  {/* px-12 mirrors the emailed letter's 48px side padding */}
                  <div className="px-12 pb-0.5 pt-0.5">
                  <div className="mb-2 text-left text-[13px] leading-[1.55] text-gray-800">
                    Ref No: {preview.ref_no}<br />
                    Date: {preview.entry.sent_at ? fmtDate(preview.entry.sent_at) : fmtDate(new Date().toISOString().slice(0, 10))}
                  </div>
                  {viewingAttachment ? (
                    <div>
                      <button onClick={() => setViewingAttachment(null)}
                        className="mb-3 text-[12px] font-semibold" style={{ color: themeColor }}>
                        ← Back to letter
                      </button>
                      <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-gray-700">
                        {viewingAttachment.name}
                        {!viewingAttachment.loading && (
                          <button onClick={downloadViewed}
                            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 hover:bg-gray-50">
                            <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download
                          </button>
                        )}
                      </div>
                      {viewingAttachment.loading ? (
                        <div className="flex h-[420px] w-full animate-pulse items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-[12.5px] text-gray-400">
                          Loading preview…
                        </div>
                      ) : viewingAttachment.kind === 'pdf' ? (
                        <object data={viewingAttachment.url} type="application/pdf"
                          className="h-[420px] w-full rounded-lg border border-gray-200">
                          <div className="flex h-full items-center justify-center text-[12.5px] text-gray-500">
                            This browser can't display the PDF — use Download above.
                          </div>
                        </object>
                      ) : viewingAttachment.kind === 'image' ? (
                        <img src={viewingAttachment.url} alt={viewingAttachment.name}
                          className="max-h-[420px] w-full rounded-lg border border-gray-200 object-contain" />
                      ) : (
                        <div className="flex h-[420px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-6 text-center">
                          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white text-[10px] font-extrabold text-gray-500 shadow-sm">
                            {String(viewingAttachment.name || '').split('.').pop().toUpperCase().slice(0, 4)}
                          </span>
                          <div className="text-[12.5px] font-semibold text-gray-700">{viewingAttachment.name}</div>
                          <div className="max-w-[46ch] text-[12px] text-gray-500">
                            Word and Excel files can't be shown inside the browser. Download it to open in Office —
                            the customer still receives it attached to the letter.
                          </div>
                          <button onClick={downloadViewed}
                            className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white"
                            style={{ background: themeColor }}>
                            <ArrowDownTrayIcon className="h-4 w-4" /> Download file
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <LetterBody text={preview.letter_text} />
                  )}
                  </div>
                  {!viewingAttachment && (
                    <img src="/letter-footer-band.png" alt="KALA Care Global LLP"
                      className="block w-full" />
                  )}
                </div>

                {/* Attachments — worked out by the server, not by the sender:
                    every Master Setup default plus the file mapped to this
                    customer's engine model. Read only, so what the customer
                    receives is whatever the Master Admin set up. */}
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-500">
                    Attachments
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: themeSoft, color: themeColor }}>
                      {autoAtt.length} file{autoAtt.length === 1 ? '' : 's'}
                    </span>
                    <span className="ml-auto text-[10px] font-semibold normal-case text-gray-400">
                      attached automatically
                    </span>
                  </div>

                  {autoAtt.map((a) => (
                    <div key={a.id}
                      className="flex w-full items-center gap-2.5 border-b border-gray-100 px-3.5 py-2 text-[12.5px] last:border-b-0 hover:bg-indigo-50/40">
                      <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-[9px] font-extrabold"
                        style={{ background: themeSoft, color: themeColor }}>
                        {fileExt(a.file_name)}
                      </span>
                      <button type="button" onClick={() => openAttachment(a.id, a.file_name)}
                        onMouseEnter={() => prefetchFile(a.id, a.file_name)}
                        title={`View ${a.file_name}`}
                        className="truncate text-left text-indigo-600 underline decoration-transparent underline-offset-2 transition hover:decoration-indigo-600">
                        {a.file_name}
                      </button>
                      {/* why this file is here */}
                      <span className={`${pillCls} ml-auto shrink-0`}
                        style={a.source === 'model'
                          ? { background: 'rgba(5,150,105,0.10)', color: '#047857' }
                          : { background: '#f3f4f6', color: '#4b5563' }}
                        title={a.source === 'model'
                          ? `Mapped to engine model ${a.engine_model || preview.entry.engine_model || ''}`
                          : 'Sent with every welcome letter'}>
                        {a.source === 'model' ? `Model · ${a.engine_model || preview.entry.engine_model || ''}` : 'Default'}
                      </span>
                    </div>
                  ))}

                  {autoAtt.length === 0 && (
                    <div className="px-3.5 py-3 text-[12.5px] text-gray-400">
                      {preview.loading
                        ? 'Loading attachments…'
                        : preview.entry.letter_status === 'SENT'
                          ? `${preview.entry.attachments_sent ?? 0} file(s) were attached when this letter was sent.`
                          : 'No attachment set up — add files under Master Setup → Default Attachments, or map this engine model under Model-wise Attachments.'}
                    </div>
                  )}

                  {/* the engine model has no chart of its own — worth knowing
                      before the letter goes out */}
                  {!preview.loading && preview.entry.letter_status !== 'SENT'
                    && !autoAtt.some((a) => a.source === 'model') && (
                    <div className="border-t border-gray-100 bg-amber-50/60 px-3.5 py-2 text-[11.5px] text-amber-800">
                      No model-wise file for engine model <b>{preview.entry.engine_model || '—'}</b> —
                      map one under Master Setup → Model-wise Attachments if this customer needs it.
                    </div>
                  )}
                </div>
              </div>

              {/* Footer — recipients on one row, actions on the row below. */}
              <div className="mt-auto border-t border-gray-200 bg-white px-4 py-3">
                {preview.entry.letter_status === 'SENT' ? (
                  <span className="text-[12px] text-gray-500">
                    Sent to <b>{preview.entry.sent_to_email}</b> by <b>{preview.entry.sent_by_name}</b> on {preview.entry.sent_at}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
                    <span className={`font-semibold ${isValidEmail(customEmail) ? 'text-gray-500' : 'text-red-600'}`}>
                      To —
                    </span>
                    {editingEmail ? (
                      <>
                        <input type="email" placeholder="Enter email to send to" value={customEmail}
                          onChange={(e) => setCustomEmail(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && isValidEmail(customEmail)) confirmEmail(); }}
                          autoFocus
                          className={`${inputCls} w-56 ${customEmail && !isValidEmail(customEmail) ? 'border-red-400 focus:ring-red-200' : ''}`} />
                        <button type="button" onClick={confirmEmail}
                          disabled={!isValidEmail(customEmail) || savingEmail}
                          title="Save this address on the customer record"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: themeColor }}>
                          <CheckIcon className="h-3.5 w-3.5" /> {savingEmail ? 'Saving…' : 'Done'}
                        </button>
                        {!preview.entry.email && (
                          <span className="text-[11px] text-gray-500">
                            no email on the customer record — this one will be saved to it
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <b>{customEmail}</b>
                        <button type="button" onClick={() => setEditingEmail(true)} title="Edit email"
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-600">
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {customEmail && !isValidEmail(customEmail) && (
                      <span className="text-[11px] font-medium text-red-600">Invalid email</span>
                    )}
                    {/* Cc — type an address and click Add (Enter / comma / paste
                        work too); every added address becomes a chip below. */}
                    <span className="font-semibold text-gray-500">Cc —</span>
                    <input type="text" value={ccInput}
                      placeholder="Enter email to CC"
                      onChange={(ev) => setCcInput(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (['Enter', ',', ';'].includes(ev.key)) {
                          if (!ccInput.trim()) return;
                          ev.preventDefault();
                          commitCc(ccInput);
                        } else if (ev.key === 'Backspace' && !ccInput && ccList.length) {
                          ev.preventDefault();
                          setCcList((cur) => cur.slice(0, -1));
                        }
                      }}
                      onPaste={(ev) => {
                        const text = ev.clipboardData.getData('text');
                        if (!text) return;
                        ev.preventDefault();
                        commitCc(`${ccInput} ${text}`);
                      }}
                      className={`${inputCls} w-56 ${ccPendingInvalid ? 'border-red-400 focus:ring-red-200' : ''}`} />
                    <button type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => commitCc(ccInput)}
                      disabled={!ccInput.trim() || ccPendingInvalid}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: themeColor }}>
                      <PlusIcon className="h-3.5 w-3.5" /> Add
                    </button>
                    {ccPendingInvalid && (
                      <span className="text-[11px] font-medium text-red-600">Invalid CC email</span>
                    )}
                  </div>
                )}

                {/* Added CC addresses */}
                {preview.entry.letter_status !== 'SENT' && ccList.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Cc ({ccList.length})
                    </span>
                    {ccList.map((e) => (
                      <span key={e}
                        className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-medium"
                        style={{ background: themeSoft, color: themeColor }}>
                        <span className="truncate" title={e}>{e}</span>
                        <button type="button" onClick={() => removeCc(e)} title="Remove"
                          className="rounded-full p-0.5 hover:bg-white/70">
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions — always their own row, right aligned */}
                {/* Print lives up in the title bar, next to KVA */}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button onClick={closePreview}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-semibold">Cancel</button>
                  {preview.entry.letter_status !== 'SENT' && (
                    <button onClick={doSend}
                      disabled={sending || !isValidEmail(customEmail) || ccPendingInvalid || editingEmail}
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition disabled:opacity-50"
                      style={{ background: '#059669' }}>
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {sending ? 'Sending…' : 'Send Welcome Letter'}
                    </button>
                  )}
                </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= DELETE CONFIRMATION ================= */}
        {/* z-[60]: this can be raised from behind the letter preview (z-50) */}
        {confirmBox && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !confirmBusy) setConfirmBox(null); }}>
            <div className="w-full max-w-[460px] overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start gap-3 px-5 pt-5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-gray-900">{confirmBox.title}</h2>
                  <div className="mt-1.5 space-y-1.5 text-[12.5px] leading-[1.5] text-gray-600">
                    {confirmBox.lines.map((ln, i) => <p key={i}>{ln}</p>)}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
                <button onClick={() => setConfirmBox(null)} disabled={confirmBusy}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-gray-700 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={runConfirm} disabled={confirmBusy} autoFocus
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                  <TrashIcon className="h-4 w-4" />
                  {confirmBusy ? 'Working…' : confirmBox.label}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= REPORT POPUP (user-wise / branch-wise) ================= */}
        {repPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setRepPopup(null); }}>
            <div className="w-full max-w-[640px] overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-3">
                <h2 className="text-[15px] font-bold">
                  {repPopup === 'users' ? 'User-wise Letters Sent' : 'Branch-wise Summary'}
                </h2>
                <button onClick={() => setRepPopup(null)} className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {repPopup === 'users' ? (
                  (rep?.user_wise || []).length === 0
                    ? <div className="px-3 py-9 text-center text-[12.5px] text-gray-400">No letters sent for this filter yet.</div>
                    : (rep.user_wise.map((u, i, arr) => (
                      <div key={u.user} className="grid items-center gap-x-2.5 border-b border-gray-100 px-4 py-2.5 last:border-b-0"
                        style={{ gridTemplateColumns: '1fr auto' }}>
                        <div>
                          <b className="text-[13px]">{u.user}</b>
                          <div className="text-[11px] text-gray-500">{u.branch_name || ''} · last sent {u.last_sent || '—'}</div>
                          <div className="mt-1.5 h-[7px] overflow-hidden rounded bg-gray-100">
                            <div className="h-full rounded" style={{ width: `${Math.round((u.count / (arr[0]?.count || 1)) * 100)}%`, background: themeColor }} />
                          </div>
                        </div>
                        <div className="text-[18px] font-bold tabular-nums" style={{ color: themeColor }}>{u.count}</div>
                      </div>
                    )))
                ) : (
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead><tr>
                      <th className={thCls}>Branch</th><th className={thCls}>Total</th>
                      <th className={thCls}>Sent</th><th className={thCls}>Pending</th><th className={thCls}>Completion</th>
                    </tr></thead>
                    <tbody>
                      {(rep?.branch_wise || []).length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-8 text-center text-[12.5px] text-gray-400">No CC customers in this branch.</td></tr>
                      )}
                      {(rep?.branch_wise || []).map((b) => (
                        <tr key={b.branch_id} className="hover:bg-indigo-50/40">
                          <td className={`${tdCls} font-semibold`}>{b.branch_name}</td>
                          <td className={`${tdCls} tabular-nums text-center`}>{b.total}</td>
                          <td className={`${tdCls} tabular-nums text-center font-bold text-emerald-600`}>{b.sent}</td>
                          <td className={`${tdCls} tabular-nums text-center font-bold text-amber-600`}>{b.pending}</td>
                          <td className={tdCls} style={{ minWidth: 130 }}>
                            <div className="h-[7px] overflow-hidden rounded bg-gray-100">
                              <div className="h-full rounded" style={{ width: `${b.pct}%`, background: b.pct === 100 ? '#059669' : themeColor }} />
                            </div>
                            <span className="text-[11px] text-gray-500 tabular-nums">{b.pct}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== HOW THIS LIST IS BUILT (Master Admin only) ===== */}
        {infoOpen && isMasterAdmin && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setInfoOpen(false); }}>
            <div className="w-full max-w-[500px] overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-2.5">
                <InformationCircleIcon className="h-5 w-5 flex-none" style={{ color: themeColor }} />
                <h2 className="text-[14px] font-bold">How this list is built</h2>
                <button onClick={() => setInfoOpen(false)}
                  className="ml-auto rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="px-4 py-3">
                <InfoSection title="Added">
                  <InfoRule label="Open SR Load Report, SR Sub-Type = CC" />
                  <InfoRule label="One row per Instance ID">newest CC SR wins</InfoRule>
                  <InfoRule label="Re-import only tops up">rows are never deleted</InfoRule>
                </InfoSection>

                <InfoSection title="Dropped from pending">
                  <InfoRule tone="drop" label={`Commissioned over ${staleInfo.months} months ago`}>
                    {staleInfo.before
                      ? <>before <b className="tabular-nums">{fmtDate(staleInfo.before)}</b>, from Asset Detailed</>
                      : 'from Asset Detailed'}
                  </InfoRule>
                  <InfoRule tone="drop" label="No CC row left in the Open SR data">
                    e.g. that SR re-typed to &ldquo;A Check&rdquo;
                  </InfoRule>
                </InfoSection>

                <InfoSection title="Always kept">
                  <InfoRule tone="keep" label="No commissioning date">shown as it is</InfoRule>
                  <InfoRule tone="keep" label="Letter already sent">stays for the report</InfoRule>
                </InfoSection>

                <p className="mt-2.5 text-[11px] text-gray-500">
                  Dropped rows are hidden, not deleted &mdash; a corrected file brings them back.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
