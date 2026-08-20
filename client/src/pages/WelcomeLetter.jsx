import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  EnvelopeIcon, ChartBarIcon, ListBulletIcon, PaperAirplaneIcon,
  ClockIcon, UsersIcon, BuildingOffice2Icon, XMarkIcon, PencilSquareIcon,
  TrashIcon, ArrowDownTrayIcon, DocumentTextIcon, PaperClipIcon,
  ChevronDownIcon, EyeIcon, CheckIcon, PlusIcon,
} from '@heroicons/react/24/outline';

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
  const nodes = [];
  let para = [];
  let items = [];
  let n = 0;
  const flushPara = () => {
    if (!para.length) return;
    const lines = para;
    para = [];
    nodes.push(
      <p key={`p${n++}`} className="mb-2 text-[13.5px] leading-[1.6] text-gray-800">
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
      <ul key={`u${n++}`} className="mb-2 list-disc pl-6 text-[13.5px] leading-[1.55] text-gray-800">
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

  const goStatus = (st) => { setFStatus(st); setTab('pending'); };

  /* Letter text + default attachments are the same for every customer, so they
     are fetched once on load and reused — a preview then opens with no wait. */
  const masterCache = useRef(null);
  useEffect(() => {
    let alive = true;
    fetch(`${WL}/master`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) masterCache.current = d; })
      .catch(() => { });
    return () => { alive = false; };
  }, []);

  /* ---------------- letter preview / send ---------------- */
  const [preview, setPreview] = useState(null);        // payload of /letter/{id}
  const [sending, setSending] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState(null); // { name, url } — shown in place of letter text
  const [customEmail, setCustomEmail] = useState('');   // to-email; pre-filled from customer record, editable
  /* Which master attachments go out with THIS letter. Nothing is attached by
     default — the sender adds files from the Master Setup library. */
  const [pickedAtt, setPickedAtt] = useState([]);       // attachment ids, in the order added
  const [attPicker, setAttPicker] = useState(false);    // library picker open?
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

  /* An already-sent letter is read-only — no add / remove buttons. */
  const isSent = preview?.entry?.letter_status === 'SENT';
  const attCount = (preview?.default_attachments || []).length;
  /* Files added to THIS letter (in the order they were added) vs the ones still
     available in the Master Setup library. */
  const addedAtt = pickedAtt
    .map((id) => (preview?.default_attachments || []).find((a) => a.id === id))
    .filter(Boolean);
  const availableAtt = (preview?.default_attachments || []).filter((a) => !pickedAtt.includes(a.id));
  const fileExt = (n) => String(n || '').split('.').pop().toUpperCase().slice(0, 4);

  /* The modal opens IMMEDIATELY from the row already in the table (and the
     master letter text/attachments already prefetched), then the server
     response fills in the exact ref no + the live attachment list. */
  const openPreview = async (row) => {
    const cached = masterCache.current?.default_attachments || [];
    const seed = {
      loading: true,
      entry: row,
      letter_text: masterCache.current?.letter_text || '',
      ref_no: row.ref_no || `WL/${row.branch_id || 'HO'}/${row.service_request_no || row.instance_id}`,
      default_attachments: cached,
    };
    setViewingAttachment(null);
    setCustomEmail(row.email || '');
    setCcList([]);
    setCcInput('');
    setEditingEmail(!row.email);
    setPickedAtt([]);          // nothing attached until the sender adds it
    setAttPicker(false);
    setPreview(seed);
    openRowRef.current = row.id;
    try {
      const res = await fetch(`${WL}/letter/${row.id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load the letter');
      if (openRowRef.current !== row.id) return;    // another row opened meanwhile
      setPreview({ ...data, loading: false });
      // the server list is authoritative — drop anything already added that has
      // since been deleted from Master Setup
      const live = new Set((data.default_attachments || []).map((a) => a.id));
      setPickedAtt((cur) => cur.filter((id) => live.has(id)));
      setCustomEmail((cur) => cur || data.entry.email || '');
    } catch (e) {
      toast.error(e.message);
      if (openRowRef.current === row.id) setPreview(null);
    }
  };

  const toggleAtt = (id) => setPickedAtt((cur) =>
    (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const closePreview = () => {
    if (viewingAttachment?.raw) URL.revokeObjectURL(viewingAttachment.raw);
    openRowRef.current = null;
    setPickedAtt([]);
    setAttPicker(false);
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

  const openAttachment = async (id, name) => {
    if (viewingAttachment?.raw) URL.revokeObjectURL(viewingAttachment.raw);
    const shown = inlineKind(name);
    setViewingAttachment({ name, kind: shown, loading: true, url: null, raw: null });
    try {
      const res = await fetch(`${WL}/master/files/${id}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'File not available');
      }
      const raw = await res.blob();
      // Force the right MIME type: a blob typed application/octet-stream makes
      // the browser download the file rather than display it.
      const typed = shown === 'pdf' && raw.type !== 'application/pdf'
        ? new Blob([await raw.arrayBuffer()], { type: 'application/pdf' })
        : raw;
      const objUrl = URL.createObjectURL(typed);
      setViewingAttachment({
        name, kind: shown, loading: false, raw: objUrl,
        // toolbar on, thumbnail panel off
        url: shown === 'pdf' ? `${objUrl}#toolbar=1&navpanes=0&scrollbar=1` : objUrl,
      });
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
      // always sent (even empty) so the server attaches exactly what is ticked
      params.set('attachments', pickedAtt.join(','));
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
    } catch (e) { toast.error(e.message); }
    finally { setUploadingDefault(false); }
  };

  const deleteDefault = async (id) => {
    try {
      const res = await fetch(`${WL}/master/attachments/${id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Delete failed');
      loadMaster();
    } catch (e) { toast.error(e.message); }
  };

  const viewFile = async (id) => {
    try {
      const res = await fetch(`${WL}/master/files/${id}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'File not available');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch (e) { toast.error(e.message); }
  };

  const downloadFile = async (id, name) => {
    try {
      const res = await fetch(`${WL}/master/files/${id}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'File not available');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name || 'attachment';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.message); }
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
              <span className="text-[11.5px] text-gray-500">
                {loading ? 'Loading…' : `${filtered.length} of ${entries.length} records`}
              </span>
            </div>

            <TopScrollbar scrollRef={tblRef} deps={[filtered.length, loading]} />
            <div ref={tblRef} className="overflow-x-auto rounded-b-xl" style={{ scrollbarWidth: 'thin' }}>
              {/* table-fixed honours the per-column widths below, so long
                  values ellipsize instead of stretching their column */}
              {/* border-separate (not collapse): collapsed borders belong to the
                  table, so the grid lines of the frozen columns would vanish
                  once they pin. Separated borders travel with the cell. */}
              <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]" style={{ minWidth: 1972 }}>
                <thead>
                  <tr>
                    {/* Open SR file columns — personal/customer info first, then engine & SR info */}
                    {/* Instance Id + Account freeze on the left (Action freezes on the right)
                        so the row stays identifiable while scrolling sideways */}
                    <th ref={col1Ref} className={`${thWrapCls} sticky left-0 z-20`} style={{ width: 102 }}>Instance Id<br />[Asset #]</th>
                    <th className={`${thWrapCls} sticky z-20 shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)] border-r`} style={{ width: 158, left: col1W }}>Account</th>
                    <th className={thWrapCls} style={{ width: 92 }}>Customer<br />Mobile #</th>
                    <th className={thWrapCls} style={{ width: 142 }}>Branch</th>
                    <th className={thWrapCls} style={{ width: 178 }}>Installation<br />Site Address</th>
                    <th className={thWrapCls} style={{ width: 76 }}>Segment</th>
                    <th className={thWrapCls} style={{ width: 112 }}>Engine<br />App Code</th>
                    <th className={thWrapCls} style={{ width: 86 }}>Engine<br />Serial#</th>
                    <th className={thWrapCls} style={{ width: 78 }}>Engine<br />Series</th>
                    <th className={thWrapCls} style={{ width: 112 }}>Engine<br />Model</th>
                    {/* from asset_detailed, linked on Instance ID — drives the
                        maintenance-chart match */}
                    <th className={thWrapCls} style={{ width: 78 }}>KVA<br />Rating</th>
                    <th className={thWrapCls} style={{ width: 90 }}>Service<br />Request #</th>
                    <th className={thWrapCls} style={{ width: 96 }}>SR Created<br />Date</th>
                    <th className={thWrapCls} style={{ width: 78 }}>SR Type</th>
                    <th className={thWrapCls} style={{ width: 82 }}>SR<br />Sub-Type</th>
                    <th className={thWrapCls} style={{ width: 70 }}>Status</th>
                    <th className={thWrapCls} style={{ width: 82 }}>Letter<br />Status</th>
                    <th className={thWrapCls} style={{ width: 118 }}>Sent By</th>
                    <th className={`${thWrapCls} sticky right-0 shadow-[-6px_0_8px_-6px_rgba(16,24,40,0.18)] border-l`} style={{ width: 142 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={19} className="p-0">
                      <div className="flex min-h-[180px] items-center justify-center text-[12.5px] text-gray-400">
                        {loading ? 'Loading…' : 'No records match the current filters.'}
                      </div>
                    </td></tr>
                  )}
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-indigo-50/40 group">
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
                      <td className={`${tdTruncCls} text-center`} title={r.letter_status === 'SENT' ? `${r.sent_by_name || ''} · sent ${r.sent_at || ''}` : ''}>
                        {r.letter_status === 'SENT'
                          ? r.sent_by_name
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`${tdSmCls} sticky right-0 bg-white group-hover:bg-indigo-50 text-center shadow-[-6px_0_8px_-6px_rgba(16,24,40,0.18)] border-l`}>
                        <button
                          onClick={() => openPreview(r)}
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
                {[['text', 'Letter Text'], ['attachments', 'Default Attachments']].map(([k, l]) => (
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
                <textarea value={tplText} onChange={(e) => setTplText(e.target.value)}
                  className={`${inputCls} w-full min-h-[480px] leading-relaxed`} placeholder="Write the welcome letter text here…" />
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
                  <div key={a.id} className="flex items-center gap-2.5 px-3.5 py-2 border-b border-gray-100 text-[12.5px]">
                    <span className="h-8 w-8 rounded-lg grid place-items-center text-[9px] font-extrabold"
                      style={{ background: themeSoft, color: themeColor }}>PDF</span>
                    {a.file_name}
                    <button onClick={() => viewFile(a.id)} title="View"
                      className="ml-auto rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                      <EyeIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => downloadFile(a.id, a.file_name)} title="Download"
                      className="rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                      <ArrowDownTrayIcon className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteDefault(a.id)} title="Remove"
                      className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <TrashIcon className="h-4 w-4" />
                    </button>
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
                    Every file listed here appears on the letter preview, where the sender ticks the ones to attach.
                  </span>
                </div>
              </div>
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
                {/* letter sheet — same letterhead the customer receives */}
                <div className="wl-sheet mx-auto w-full max-w-[720px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  {!viewingAttachment && (
                    <img src="/letter-header-band.png" alt="KALA Care · Kirloskar care"
                      className="block w-full" />
                  )}
                  <div className="px-9 pb-0.5 pt-0.5">
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

                {/* Attachments — nothing is attached until the sender adds it
                    from the Master Setup library. */}
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-500">
                    Attachments
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: themeSoft, color: themeColor }}>
                      {pickedAtt.length} added
                    </span>
                    {!isSent && (
                      <button type="button" onClick={() => setAttPicker((v) => !v)}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold normal-case text-white"
                        style={{ background: themeColor }}>
                        <PlusIcon className="h-3.5 w-3.5" /> Add Attachment
                      </button>
                    )}
                  </div>

                  {/* picker — the files the Master Admin uploaded, minus the
                      ones already added to this letter */}
                  {attPicker && !isSent && (
                    <div className="border-b border-gray-200 bg-indigo-50/40">
                      <div className="flex items-center gap-2 px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-500">
                        Master Setup attachments
                        <button type="button" onClick={() => setAttPicker(false)}
                          className="ml-auto rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700">
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="max-h-[190px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        {availableAtt.map((a) => (
                          <button key={a.id} type="button"
                            onClick={() => { toggleAtt(a.id); setAttPicker(false); }}
                            className="flex w-full items-center gap-2.5 border-t border-white/70 px-3.5 py-2 text-left text-[12.5px] hover:bg-white">
                            <span className="h-7 w-7 shrink-0 rounded-lg grid place-items-center text-[8.5px] font-extrabold"
                              style={{ background: themeSoft, color: themeColor }}>
                              {fileExt(a.file_name)}
                            </span>
                            <span className="truncate">{a.file_name}</span>
                            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold"
                              style={{ color: themeColor }}>
                              <PlusIcon className="h-3.5 w-3.5" /> Add
                            </span>
                          </button>
                        ))}
                        {availableAtt.length === 0 && (
                          <div className="border-t border-white/70 px-3.5 py-3 text-[12px] text-gray-500">
                            {attCount === 0
                              ? 'No files in Master Setup yet — upload them under Master Setup → Default Attachments.'
                              : 'Every Master Setup attachment is already added to this letter.'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {addedAtt.map((a) => (
                    <div key={a.id}
                      className="flex w-full items-center gap-2.5 border-b border-gray-100 px-3.5 py-2 text-[12.5px] last:border-b-0 hover:bg-indigo-50/40">
                      <span className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-[9px] font-extrabold"
                        style={{ background: themeSoft, color: themeColor }}>
                        {fileExt(a.file_name)}
                      </span>
                      <button type="button" onClick={() => openAttachment(a.id, a.file_name)}
                        className="truncate text-left text-indigo-600 underline decoration-transparent underline-offset-2 transition hover:decoration-indigo-600">
                        {a.file_name}
                      </button>
                      {!isSent && (
                        <button type="button" onClick={() => toggleAtt(a.id)} title="Remove from this letter"
                          className="ml-auto shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {addedAtt.length === 0 && (
                    <div className="px-3.5 py-3 text-[12.5px] text-gray-400">
                      {preview.loading
                        ? 'Loading attachments…'
                        : isSent
                          ? `${preview.entry.attachments_sent ?? 0} file(s) were attached when this letter was sent.`
                          : 'No attachment added — use “Add Attachment” to pick a file from Master Setup.'}
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
                          onKeyDown={(e) => { if (e.key === 'Enter' && isValidEmail(customEmail)) setEditingEmail(false); }}
                          autoFocus
                          className={`${inputCls} w-56 ${customEmail && !isValidEmail(customEmail) ? 'border-red-400 focus:ring-red-200' : ''}`} />
                        <button type="button" onClick={() => setEditingEmail(false)}
                          disabled={!isValidEmail(customEmail)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: themeColor }}>
                          <CheckIcon className="h-3.5 w-3.5" /> Done
                        </button>
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
      </div>
    </div>
  );
}
