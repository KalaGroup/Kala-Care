import React, { useState, useMemo } from 'react';
import {
  ClipboardList, Building2, Plus, Trash2, CheckCircle2, Clock,
  AlertTriangle, CalendarDays, Users, X, CornerUpRight, Flag,
  BarChart3, Check, User, ListChecks, Zap, Pencil, ChevronRight, ChevronLeft,
  FileText,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

/* ============================================================
   THEME — Kala Care brand (matches KnowledgeBook)
   ============================================================ */
const BRAND = '#2f3192';
const BRAND_DARK = '#23255f';
const BRAND_SOFT = 'rgba(47,49,146,0.10)';

const STATUS = {
  open: { label: 'Open', color: '#64748b', soft: 'rgba(100,116,139,0.12)' },
  in_progress: { label: 'In progress', color: '#d97706', soft: 'rgba(217,119,6,0.12)' },
  done: { label: 'Done', color: '#059669', soft: 'rgba(5,150,105,0.12)' },
  overdue: { label: 'Overdue', color: '#dc2626', soft: 'rgba(220,38,38,0.12)' },
};
const PRIORITY = {
  high: { label: 'High', color: '#dc2626' },
  medium: { label: 'Medium', color: '#d97706' },
  low: { label: 'Low', color: '#2563eb' },
};
const DEFAULT_CATEGORIES = {
  Sales: '#2f3192', Service: '#0d9488', Finance: '#059669',
  People: '#7c3aed', Marketing: '#d97706', Other: '#64748b',
};
const NEW_CAT_COLORS = ['#0ea5e9', '#e11d48', '#16a34a', '#9333ea', '#f59e0b', '#475569', '#db2777', '#0d9488'];

/* ============================================================
   SEED DATA  (hardcoded for now)
   ============================================================ */
const BRANCHES = [
  { code: 'HO', name: 'Pune Office', region: 'Head Office' },
  { code: 'B1', name: 'Ch.Sambhaji Nagar', region: 'Maharashtra' },
  { code: 'B2', name: 'Ahilyanagar', region: 'Maharashtra' },
  { code: 'B3', name: 'Beed', region: 'Maharashtra' },
  { code: 'B4', name: 'Nanded', region: 'Maharashtra' },
  { code: 'B5', name: 'Babhaleshwar', region: 'Maharashtra' },
  { code: 'B6', name: 'Latur', region: 'Maharashtra' },
  { code: 'B7', name: 'Parbhani', region: 'Maharashtra' },
  { code: 'B8', name: 'Hubli', region: 'Karnataka' },
  { code: 'B9', name: 'Belagavi', region: 'Karnataka' },
  { code: 'B10', name: 'Hospet', region: 'Karnataka' },
  { code: 'B11', name: 'Ballari', region: 'Karnataka' },
  { code: 'B12', name: 'Bagalkot', region: 'Karnataka' },
  { code: 'B13', name: 'Gulbarga', region: 'Karnataka' },
  { code: 'B14', name: 'Bijapur', region: 'Karnataka' },
];
const REGION_COLOR = { 'Head Office': '#2f3192', Maharashtra: '#0d9488', Karnataka: '#d97706' };

const STAFF = ['Rahul Deshmukh', 'Sneha Patil', 'Amit Kulkarni', 'Pooja Joshi',
  'Vikram Shetty', 'Anjali Rao', 'Suresh Naik', 'Kiran More'];

const DEFAULT_MASTER = [
  { id: 'm1', title: 'Sales target vs achievement (MTD)', category: 'Sales' },
  { id: 'm2', title: 'Outstanding payments & collections', category: 'Finance' },
  { id: 'm3', title: 'AMC renewals due this month', category: 'Service' },
  { id: 'm4', title: 'Pending service calls / installations', category: 'Service' },
  { id: 'm5', title: 'Customer complaints & escalations', category: 'Service' },
  { id: 'm6', title: 'Active campaign progress & follow-ups', category: 'Marketing' },
  { id: 'm7', title: 'Spare parts / inventory status', category: 'Service' },
  { id: 'm8', title: 'Staff attendance & performance', category: 'People' },
  { id: 'm9', title: 'Expense vouchers pending approval', category: 'Finance' },
  { id: 'm10', title: 'Local marketing / lead generation', category: 'Marketing' },
  { id: 'm11', title: 'Training & skill development', category: 'People' },
  { id: 'm12', title: 'Any other business (AOB)', category: 'Other' },
];

const MEETING_TYPES = ['Monthly Branch Review', 'Weekly Sync', 'Special / Ad-hoc'];
const ACTIONS_POOL = [
  { t: 'Close the MTD sales gap', cat: 'Sales', ctx: 'MTD achievement at 72% \u2014 owner to push priority leads.' },
  { t: 'Recover top overdue payments', cat: 'Finance', ctx: '3 accounts > 60 days; \u20b92.4L outstanding.' },
  { t: 'Finish AMC renewal calls', cat: 'Service', ctx: '14 contracts expiring this month, 5 still un-contacted.' },
  { t: 'Clear installation backlog', cat: 'Service', ctx: '8 pending installs from last fortnight.' },
  { t: 'Resolve escalated complaint', cat: 'Service', ctx: 'Customer escalation pending second visit.' },
  { t: 'Push campaign follow-ups', cat: 'Marketing', ctx: 'Monsoon offer leads not yet called back.' },
  { t: 'Reorder fast-moving spares', cat: 'Service', ctx: 'Compressor & filter stock below reorder level.' },
  { t: 'Fix field-team attendance', cat: 'People', ctx: 'Two technicians with repeated late check-ins.' },
  { t: 'Submit pending vouchers', cat: 'Finance', ctx: 'TADA & OE vouchers awaiting branch approval.' },
];

/* deterministic prng so demo data is stable */
const seeded = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const iso = (d) => d.toISOString().slice(0, 10);
const pick = (r, a) => a[Math.floor(r() * a.length)];

function buildHistory() {
  const map = {};
  BRANCHES.forEach((b, bi) => {
    const r = seeded(bi * 7919 + 13);
    const mgr = STAFF[bi % STAFF.length];
    const meetings = [7, 38, 70].map((ago, mi) => {
      const date = addDays(new Date(), -ago);
      const nPts = 6 + Math.floor(r() * 4);
      const points = DEFAULT_MASTER.slice(0, nPts).map((p) => ({ ...p, note: r() > 0.5 ? 'Reviewed' : '' }));
      const nAct = mi === 0 ? 5 + Math.floor(r() * 3) : 3 + Math.floor(r() * 3);
      const actions = Array.from({ length: nAct }).map((_, i) => {
        const rr = r();
        const status = mi === 0 ? (rr < 0.25 ? 'done' : rr < 0.6 ? 'in_progress' : 'open')
          : mi === 1 ? (rr < 0.65 ? 'done' : 'in_progress') : 'done';
        const a = pick(r, ACTIONS_POOL);
        return {
          id: `a${bi}-${mi}-${i}`, title: a.t, category: a.cat, ctx: a.ctx, owner: pick(r, STAFF),
          priority: rr < 0.3 ? 'high' : rr < 0.7 ? 'medium' : 'low', status,
          due: iso(addDays(date, 4 + Math.floor(r() * 16))),
        };
      });
      return {
        id: `mt${bi}-${mi}`, date: iso(date), type: 'Monthly Branch Review',
        conductedBy: mgr, present: STAFF.slice(0, 3 + (mi % 2)),
        points, actions,
      };
    });
    map[b.code] = meetings.sort((x, y) => y.date.localeCompare(x.date));
  });
  return map;
}

/* ============================================================
   HELPERS
   ============================================================ */
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const fmt = (s) => s ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';
const isOverdue = (a) => a.status !== 'done' && new Date(a.due) < today0();
const effStatus = (a) => a.status === 'done' ? 'done' : isOverdue(a) ? 'overdue' : a.status;
const progress = (m) => m.actions.length ? Math.round(m.actions.filter((a) => a.status === 'done').length / m.actions.length * 100) : 100;
const daysFromDue = (due) => Math.round((today0() - new Date(due)) / 86400000); // +ve = overdue

/* ============================================================
   SMALL UI PIECES  (KnowledgeBook scale)
   ============================================================ */
const Pill = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 fs-12 font-medium text-white" style={{ background: 'rgba(255,255,255,0.16)' }}>{children}</span>
);
const StatusBadge = ({ a }) => {
  const s = STATUS[effStatus(a)];
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: s.soft, color: s.color }}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />{s.label}</span>;
};
const PriTag = ({ p }) => (
  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 fs-10 font-semibold" style={{ background: `${PRIORITY[p].color}1a`, color: PRIORITY[p].color }}>
    <Flag size={10} />{PRIORITY[p].label}</span>
);
const CatDot = ({ color, title }) => <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color || '#94a3b8' }} title={title} />;
const Bar2 = ({ v }) => (
  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#eef0f3' }}>
    <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? '#059669' : v >= 40 ? '#d97706' : '#dc2626', transition: 'width .3s' }} />
  </div>
);

/* fs-* utilities injected once so 9-13px text renders everywhere */
const FontScale = () => <style>{`@keyframes livedot{0%,100%{opacity:1}50%{opacity:.35}} .fs-9{font-size:9px;line-height:1.3} .fs-10{font-size:10px;line-height:1.35} .fs-11{font-size:11px;line-height:1.4} .fs-12{font-size:12px;line-height:1.45} .fs-13{font-size:13px;line-height:1.45}`}</style>;

/* ============================================================
   MAIN
   ============================================================ */
export default function MOMTracking() {
  const [master, setMaster] = useState(DEFAULT_MASTER);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [history, setHistory] = useState(buildHistory);
  const [view, setView] = useState('new');          // new | history | reports
  const [masterOpen, setMasterOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [viewMtg, setViewMtg] = useState(null);

  // wizard
  const [step, setStep] = useState(1);              // 1 branch · 2 points · 3 meeting
  const [branch, setBranch] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [mDate, setMDate] = useState(iso(new Date()));
  const [mType, setMType] = useState(MEETING_TYPES[0]);
  const [live, setLive] = useState([]);
  const [carry, setCarry] = useState([]);
  const [attendees, setAttendees] = useState([]);
  const [newPt, setNewPt] = useState('');

  const ping = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2200); };
  const catColor = (n) => categories[n] || '#94a3b8';

  const stats = useMemo(() => {
    let total = 0, open = 0, overdue = 0;
    BRANCHES.forEach((b) => (history[b.code] || []).forEach((m) => { total++; m.actions.forEach((a) => { if (a.status !== 'done') { open++; if (isOverdue(a)) overdue++; } }); }));
    return { total, open, overdue };
  }, [history]);

  const branchMeta = (code) => {
    const ms = history[code] || [];
    let open = 0; ms.forEach((m) => m.actions.forEach((a) => { if (a.status !== 'done') open++; }));
    return { last: ms[0]?.date, open, count: ms.length };
  };

  /* ---- wizard navigation ---- */
  const chooseBranch = (b) => { setBranch(b); setPicked(new Set(master.map((p) => p.id))); };
  const goPoints = () => { if (!branch) return ping('Pick a branch first', 'err'); setStep(2); };

  const startMeeting = () => {
    if (picked.size === 0) return ping('Select at least one point', 'err');
    setLive(master.filter((p) => picked.has(p.id)).map((p) => ({ ...p, source: 'master', covered: true, note: '', action: null })));
    const lm = (history[branch.code] || [])[0];
    setCarry(lm ? lm.actions.filter((a) => a.status !== 'done').map((a) => ({ ...a, fromDate: lm.date })) : []);
    setAttendees(STAFF.slice(0, 4).map((n, i) => ({ name: n, present: i < 3 })));
    setStep(3);
  };

  const resetWizard = () => { setStep(1); setBranch(null); setPicked(new Set()); setLive([]); setCarry([]); setMDate(iso(new Date())); setMType(MEETING_TYPES[0]); };

  /* ---- live-meeting mutations ---- */
  const setCovered = (id) => setLive((p) => p.map((x) => x.id === id ? { ...x, covered: !x.covered } : x));
  const setNote = (id, v) => setLive((p) => p.map((x) => x.id === id ? { ...x, note: v } : x));
  const toggleAct = (id) => setLive((p) => p.map((x) => x.id === id ? { ...x, action: x.action ? null : { owner: STAFF[0], due: iso(addDays(new Date(), 7)), priority: 'medium' } } : x));
  const editAct = (id, f, v) => setLive((p) => p.map((x) => x.id === id && x.action ? { ...x, action: { ...x.action, [f]: v } } : x));
  const addLivePoint = () => { const t = newPt.trim(); if (!t) return; setLive((p) => [...p, { id: `c${Date.now()}`, title: t, category: 'Other', source: 'custom', covered: true, note: '', action: null }]); setNewPt(''); ping('Point added'); };
  const removeLive = (id) => setLive((p) => p.filter((x) => x.id !== id));
  const setCarryStatus = (id, status) => setCarry((p) => p.map((c) => c.id === id ? { ...c, status } : c));

  const coveredCount = live.filter((x) => x.covered).length;
  const actionCount = live.filter((x) => x.action).length + carry.filter((c) => c.status !== 'done').length;

  const finalize = () => {
    setConfirm({
      title: 'Finalize minutes?',
      body: `${branch.name} \u00b7 ${fmt(mDate)} \u2014 ${coveredCount} points covered, ${actionCount} action items.`,
      onYes: () => {
        const actions = [
          ...carry.filter((c) => c.status !== 'done').map((c) => ({ id: `na${c.id}`, title: c.title, category: c.category, ctx: c.ctx, owner: c.owner, priority: c.priority, status: c.status, due: c.due, carried: true })),
          ...live.filter((x) => x.action).map((x) => ({ id: `na${x.id}`, title: x.title, category: x.category, ctx: x.note || undefined, owner: x.action.owner, priority: x.action.priority, status: 'open', due: x.action.due })),
        ];
        const mtg = { id: `mt${Date.now()}`, date: mDate, type: mType, conductedBy: 'Master Admin', present: attendees.filter((a) => a.present).map((a) => a.name), points: live.filter((x) => x.covered).map(({ id, title, category, note }) => ({ id, title, category, note })), actions };
        setHistory((h) => ({ ...h, [branch.code]: [mtg, ...(h[branch.code] || [])] }));
        setConfirm(null); ping('Minutes saved'); resetWizard(); setView('history');
      },
    });
  };

  /* ---- stepper top navigation (Back / Next live inside the stepper box) ---- */
  const stepperNext = () => {
    if (step === 1) goPoints();
    else if (step === 2) startMeeting();
    else if (step === 3) finalize();
  };
  const stepperBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  /* ========================================================
     RENDER
     ======================================================== */
  return (
    <div className="font-sans">
      <FontScale />
      <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-2">

        {/* ===== HERO ===== */}
        <div className="rounded-2xl mt-0 mb-4 px-3 sm:px-5 py-3 text-white relative overflow-hidden" style={{ background: `linear-gradient(120deg, ${BRAND} 0%, ${BRAND_DARK} 100%)` }}>
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold leading-tight">MOM Tracking</h1>
                <p className="fs-11 text-white/70 leading-tight">Minutes of Meeting · branch reviews &amp; action items</p>
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <Pill><CalendarDays size={12} /> {stats.total} meetings</Pill>
              <Pill><Clock size={12} /> {stats.open} open</Pill>
              <Pill><AlertTriangle size={12} /> {stats.overdue} overdue</Pill>
              <button onClick={() => setMasterOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 fs-12 font-semibold transition hover:bg-white/90" style={{ color: BRAND }}>
                <ListChecks className="h-3.5 w-3.5" /> Master setup
              </button>
            </div>
          </div>
        </div>

        {/* ===== VIEW SWITCH + STEPPER (one row) ===== */}
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm w-fit">
            {[{ k: 'new', label: 'New meeting', icon: Zap }, { k: 'history', label: 'History', icon: FileText }, { k: 'reports', label: 'Reports', icon: BarChart3 }].map((t) => (
              <button key={t.k} onClick={() => setView(t.k)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 fs-12 font-semibold transition" style={view === t.k ? { background: BRAND, color: '#fff' } : { color: '#6b7280' }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          {view === 'new' && (
            <Stepper
              step={step}
              branch={branch}
              pickedCount={picked.size}
              onBack={stepperBack}
              onNext={stepperNext}
              nextDisabled={step === 1 && !branch}
            />
          )}
        </div>

        {/* ===== NEW MEETING WIZARD ===== */}
        {view === 'new' && (
          <div>
            {/* STEP 1 — BRANCH */}
            {step === 1 && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={16} style={{ color: BRAND }} />
                  <h2 className="text-sm font-bold text-gray-800">Select a branch</h2>
                  <span className="fs-12 text-gray-400">— which branch is this meeting for?</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {BRANCHES.map((b) => {
                    const meta = branchMeta(b.code);
                    const sel = branch?.code === b.code;
                    return (
                      <button key={b.code} onClick={() => chooseBranch(b)} className="text-left rounded-xl border p-3 transition relative" style={sel ? { borderColor: BRAND, background: BRAND_SOFT, boxShadow: `0 0 0 1px ${BRAND}` } : { borderColor: '#e5e7eb', background: '#fff' }}>
                        {sel && <span className="absolute top-2 right-2 h-4 w-4 rounded-full flex items-center justify-center" style={{ background: BRAND }}><Check size={11} color="#fff" /></span>}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: REGION_COLOR[b.region] }} />
                          <span className="fs-12 font-bold text-gray-800 truncate">{b.name}</span>
                        </div>
                        <div className="fs-10 text-gray-400">{b.region}</div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="fs-10 text-gray-400">last {fmt(meta.last)}</span>
                          {meta.open > 0 && <span className="rounded-full px-1.5 py-0.5 fs-10 font-bold" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>{meta.open} open</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={goPoints} disabled={!branch} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 fs-12 font-semibold text-white transition disabled:opacity-40" style={{ background: BRAND }}>
                    Next: choose points <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2 — POINTS */}
            {step === 2 && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ListChecks size={16} style={{ color: BRAND }} />
                    <h2 className="text-sm font-bold text-gray-800">Points to discuss</h2>
                    <span className="fs-12 text-gray-400">at {branch?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPicked(new Set(master.map((p) => p.id)))} className="fs-11 font-semibold rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50">Select all</button>
                    <button onClick={() => setPicked(new Set())} className="fs-11 font-semibold rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50">Clear</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
                  <label className="block">
                    <span className="fs-11 font-semibold text-gray-500">Meeting date</span>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5">
                      <CalendarDays size={14} className="text-gray-400" />
                      <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className="w-full fs-12 text-gray-700 outline-none bg-transparent" />
                    </div>
                  </label>
                  <label className="block">
                    <span className="fs-11 font-semibold text-gray-500">Meeting type</span>
                    <select value={mType} onChange={(e) => setMType(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 fs-12 text-gray-700 outline-none bg-white">
                      {MEETING_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </label>
                </div>

                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {master.map((p) => {
                    const on = picked.has(p.id);
                    return (
                      <button key={p.id} onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition hover:bg-gray-50">
                        <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                          {on && <Check size={11} color="#fff" />}
                        </span>
                        <CatDot color={catColor(p.category)} title={p.category} />
                        <span className={`fs-12 flex-1 ${on ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{p.title}</span>
                        <span className="fs-10 font-medium px-1.5 py-0.5 rounded" style={{ color: catColor(p.category), background: `${catColor(p.category)}14` }}>{p.category}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
                  <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 fs-12 font-semibold text-gray-600 hover:bg-gray-50">
                    <ChevronLeft size={15} /> Back
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="fs-12 text-gray-500"><b className="text-gray-800">{picked.size}</b> of {master.length} selected</span>
                    <button onClick={startMeeting} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 fs-12 font-bold text-white transition hover:opacity-90" style={{ background: BRAND }}>
                      <Zap size={15} /> Start meeting
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3 — LIVE MEETING */}
            {step === 3 && (
              <div className="space-y-3">
                {/* live header */}
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 fs-10 font-bold" style={{ background: 'rgba(5,150,105,0.12)', color: '#059669' }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: '#059669', animation: 'livedot 1.4s infinite' }} /> LIVE
                    </span>
                    <div>
                      <div className="text-sm font-bold text-gray-800">{branch?.name}</div>
                      <div className="fs-10 text-gray-400">{fmt(mDate)} · {mType}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 fs-12 text-gray-500">
                    <Users size={14} />
                    {attendees.map((a, i) => (
                      <button key={a.name} onClick={() => setAttendees((p) => p.map((x, j) => j === i ? { ...x, present: !x.present } : x))} className="inline-flex items-center gap-1 rounded-full px-2 py-1 fs-10 font-medium border transition" style={a.present ? { background: BRAND_SOFT, color: BRAND, borderColor: 'transparent' } : { color: '#9ca3af', borderColor: '#e5e7eb' }}>
                        {a.present ? <Check size={10} /> : <X size={10} />} {a.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* carry forward */}
                {carry.length > 0 && (
                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(217,119,6,0.35)' }}>
                    <div className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap" style={{ background: 'rgba(217,119,6,0.08)' }}>
                      <div className="flex items-center gap-2">
                        <CornerUpRight size={14} style={{ color: '#d97706' }} />
                        <span className="fs-12 font-bold" style={{ color: '#b45309' }}>Pending from last meeting</span>
                        <span className="rounded-full px-2 py-0.5 fs-10 font-bold" style={{ background: '#fff', color: '#b45309' }}>{carry.length}</span>
                      </div>
                      <span className="fs-10 font-medium" style={{ color: '#b45309' }}>review each item &amp; update its status</span>
                    </div>
                    <div className="bg-white divide-y divide-gray-100">
                      {carry.map((c) => {
                        const od = daysFromDue(c.due);
                        const isOd = c.status !== 'done' && od > 0;
                        return (
                          <div key={c.id} className={`px-3 py-2.5 ${c.status === 'done' ? 'opacity-60' : ''}`} style={{ borderLeft: `3px solid ${isOd ? STATUS.overdue.color : catColor(c.category)}` }}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CatDot color={catColor(c.category)} title={c.category} />
                                  <span className={`fs-12 font-semibold text-gray-800 ${c.status === 'done' ? 'line-through' : ''}`}>{c.title}</span>
                                  <PriTag p={c.priority} />
                                  {isOd && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: STATUS.overdue.soft, color: STATUS.overdue.color }}><AlertTriangle size={10} /> {od}d overdue</span>}
                                </div>
                                {c.ctx && <div className="fs-11 text-gray-500 mt-1">{c.ctx}</div>}
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 fs-10 text-gray-400">
                                  <span className="inline-flex items-center gap-1"><User size={11} /> {c.owner}</span>
                                  <span className="inline-flex items-center gap-1"><CornerUpRight size={10} /> raised {fmt(c.fromDate)}</span>
                                  <span className="inline-flex items-center gap-1"><CalendarDays size={10} /> due {fmt(c.due)}</span>
                                  {!isOd && c.status !== 'done' && <span style={{ color: '#059669' }}>{od === 0 ? 'due today' : `${-od}d left`}</span>}
                                </div>
                              </div>
                              <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                                {[['open', 'Open'], ['in_progress', 'In prog'], ['done', 'Done']].map(([k, lbl]) => (
                                  <button key={k} onClick={() => setCarryStatus(c.id, k)} className="px-2 py-1 fs-10 font-semibold transition" style={c.status === k ? { background: STATUS[k].color, color: '#fff' } : { color: '#9ca3af', background: '#fff' }}>{lbl}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* agenda items */}
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} style={{ color: BRAND }} />
                      <span className="fs-12 font-bold text-gray-800">Discussion points</span>
                    </div>
                    <span className="fs-10 text-gray-400">{coveredCount}/{live.length} covered</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {live.map((p) => (
                      <div key={p.id} className="px-3 py-2.5">
                        <div className="flex items-start gap-2.5">
                          <button onClick={() => setCovered(p.id)} className="mt-0.5 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={p.covered ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                            {p.covered && <Check size={11} color="#fff" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <CatDot color={catColor(p.category)} title={p.category} />
                              <span className={`fs-12 ${p.covered ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{p.title}</span>
                              {p.source === 'custom' && <span className="fs-10 text-gray-400 italic">added live</span>}
                            </div>
                            {p.covered && (
                              <div className="mt-2 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Pencil size={12} className="text-gray-300 flex-shrink-0" />
                                  <input value={p.note} onChange={(e) => setNote(p.id, e.target.value)} placeholder="Discussion note…" className="w-full fs-12 text-gray-700 border-b border-gray-100 outline-none py-0.5" />
                                </div>
                                {!p.action ? (
                                  <button onClick={() => toggleAct(p.id)} className="inline-flex items-center gap-1 fs-11 font-semibold" style={{ color: BRAND }}><Plus size={12} /> Assign action item</button>
                                ) : (
                                  <div className="rounded-lg border border-gray-100 p-2.5" style={{ background: '#fafafc' }}>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="fs-10 font-bold text-gray-600 inline-flex items-center gap-1"><Zap size={12} style={{ color: BRAND }} /> Action</span>
                                      <button onClick={() => toggleAct(p.id)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                      <select value={p.action.owner} onChange={(e) => editAct(p.id, 'owner', e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 fs-10 bg-white outline-none">{STAFF.map((s) => <option key={s}>{s}</option>)}</select>
                                      <input type="date" value={p.action.due} onChange={(e) => editAct(p.id, 'due', e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 fs-10 bg-white outline-none" />
                                      <select value={p.action.priority} onChange={(e) => editAct(p.id, 'priority', e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 fs-10 bg-white outline-none">
                                        <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                                      </select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {p.source === 'custom' && <button onClick={() => removeLive(p.id)} className="mt-0.5 text-gray-300 hover:text-red-500 flex-shrink-0"><Trash2 size={14} /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100" style={{ background: '#fafafc' }}>
                    <Plus size={14} className="text-gray-400" />
                    <input value={newPt} onChange={(e) => setNewPt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLivePoint()} placeholder="Add a point raised during the meeting…" className="flex-1 fs-12 bg-transparent outline-none text-gray-700" />
                    <button onClick={addLivePoint} className="rounded-lg px-3 py-1.5 fs-10 font-semibold text-white" style={{ background: BRAND }}>Add</button>
                  </div>
                </div>

                {/* finalize */}
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white shadow-sm px-3 py-2.5 flex-wrap">
                  <button onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 fs-12 font-semibold text-gray-600 hover:bg-gray-50"><ChevronLeft size={15} /> Back to points</button>
                  <div className="flex items-center gap-3">
                    <span className="fs-12 text-gray-500"><b className="text-gray-800">{coveredCount}</b> covered · <b className="text-gray-800">{actionCount}</b> actions</span>
                    <button onClick={finalize} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 fs-12 font-bold text-white transition hover:opacity-90" style={{ background: BRAND }}><CheckCircle2 size={15} /> Finalize & save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== HISTORY ===== */}
        {view === 'history' && <HistoryView history={history} onView={setViewMtg} />}

        {/* ===== REPORTS ===== */}
        {view === 'reports' && <ReportsView history={history} />}
      </div>

      {/* ===== MASTER SETUP MODAL ===== */}
      {masterOpen && <MasterModal master={master} setMaster={setMaster} categories={categories} setCategories={setCategories} onClose={() => setMasterOpen(false)} ping={ping} />}

      {/* ===== VIEW MEETING MODAL ===== */}
      {viewMtg && <MeetingModal data={viewMtg} categories={categories} onClose={() => setViewMtg(null)} />}

      {/* ===== CONFIRM ===== */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-800">{confirm.title}</h3>
            <p className="fs-12 text-gray-500 mt-1.5">{confirm.body}</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 fs-12 font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={confirm.onYes} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Yes, finalize</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-3 py-2.5 shadow-lg fs-12 font-medium text-white" style={{ background: toast.type === 'err' ? '#dc2626' : '#111827' }}>
          {toast.type === 'err' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />} {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   STEPPER (compact, sits beside the tabs)
   — now carries Back / Next navigation inside the same box
   ============================================================ */
function Stepper({ step, branch, pickedCount, onBack, onNext, nextDisabled }) {
  const steps = [
    { n: 1, label: 'Branch', sub: branch ? branch.name : 'choose one' },
    { n: 2, label: 'Points', sub: step >= 2 ? `${pickedCount} selected` : 'pick agenda' },
    { n: 3, label: 'Meeting', sub: step === 3 ? 'live' : 'discuss & save' },
  ];
  const isLast = step === 3;
  const nextLabel = isLast ? 'Finalize' : 'Next';
  const NextIcon = isLast ? CheckCircle2 : ChevronRight;

  return (
    <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
      {/* Back */}
      <button
        onClick={onBack}
        disabled={step === 1}
        title="Previous step"
        className="inline-flex items-center gap-0.5 rounded-md px-2 py-1.5 fs-11 font-semibold transition hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        style={{ color: step === 1 ? '#9ca3af' : '#4b5563' }}
      >
        <ChevronLeft size={15} /><span className="hidden sm:inline">Back</span>
      </button>

      <span className="h-6 w-px bg-gray-200 mx-0.5 flex-shrink-0" />

      {/* Steps */}
      {steps.map((s, i) => {
        const done = step > s.n, active = step === s.n;
        return (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-2 rounded-md px-2 py-1" style={active ? { background: BRAND_SOFT } : {}}>
              <span className="h-6 w-6 rounded-full flex items-center justify-center fs-11 font-bold flex-shrink-0" style={done ? { background: '#059669', color: '#fff' } : active ? { background: BRAND, color: '#fff' } : { background: '#f1f1f6', color: '#9ca3af' }}>
                {done ? <Check size={12} /> : s.n}
              </span>
              <div className="leading-tight pr-1">
                <div className="fs-11 font-bold" style={{ color: active || done ? '#1f2937' : '#9ca3af' }}>{s.label}</div>
                <div className="fs-9 hidden md:block" style={{ color: '#9ca3af' }}>{s.sub}</div>
              </div>
            </div>
            {i < steps.length - 1 && <ChevronRight size={14} className="flex-shrink-0" style={{ color: step > s.n ? '#059669' : '#d1d5db' }} />}
          </React.Fragment>
        );
      })}

      <span className="h-6 w-px bg-gray-200 mx-0.5 flex-shrink-0" />

      {/* Next / Finalize */}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        title={isLast ? 'Finalize & save' : 'Next step'}
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 fs-11 font-semibold text-white transition hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ background: BRAND }}
      >
        <span className="hidden sm:inline">{nextLabel}</span><NextIcon size={15} />
      </button>
    </div>
  );
}

/* ============================================================
   MASTER SETUP MODAL  (Points + Categories tabs)
   ============================================================ */
function MasterModal({ master, setMaster, categories, setCategories, onClose, ping }) {
  const catKeys = Object.keys(categories);
  const [tab, setTab] = useState('points');
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState(catKeys[0] || 'Other');
  const [newCat, setNewCat] = useState('');
  const [newColor, setNewColor] = useState(NEW_CAT_COLORS[0]);

  const add = () => { const t = title.trim(); if (!t) return; setMaster((m) => [...m, { id: `m${Date.now()}`, title: t, category: cat }]); setTitle(''); ping('Point added'); };
  const remove = (id) => setMaster((m) => m.filter((p) => p.id !== id));
  const rename = (id, v) => setMaster((m) => m.map((p) => p.id === id ? { ...p, title: v } : p));
  const recat = (id, v) => setMaster((m) => m.map((p) => p.id === id ? { ...p, category: v } : p));

  const addCat = () => {
    const n = newCat.trim(); if (!n) return;
    if (categories[n]) return ping('Category already exists', 'err');
    setCategories((c) => ({ ...c, [n]: newColor }));
    setNewCat(''); setNewColor(NEW_CAT_COLORS[(catKeys.length + 1) % NEW_CAT_COLORS.length]); ping('Category added');
  };
  const setCatColor = (name, color) => setCategories((c) => ({ ...c, [name]: color }));
  const removeCat = (name) => {
    if (catKeys.length <= 1) return ping('Keep at least one category', 'err');
    const fallback = catKeys.find((k) => k !== name);
    setCategories((c) => { const n = { ...c }; delete n[name]; return n; });
    setMaster((m) => m.map((p) => p.category === name ? { ...p, category: fallback } : p));
    ping('Category removed');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 text-white flex items-center justify-between" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>
          <div className="flex items-center gap-2.5">
            <ListChecks className="h-5 w-5" />
            <div>
              <div className="text-sm font-bold">Master setup</div>
              <div className="fs-11 text-white/70">Key points &amp; categories used in every meeting</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/15"><X className="h-4 w-4" /></button>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-1 px-4 pt-2 border-b border-gray-100">
          {[['points', `Points (${master.length})`], ['cats', `Categories (${catKeys.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="rounded-t-md px-3 py-2 fs-12 font-semibold transition" style={tab === k ? { color: BRAND, borderBottom: `2px solid ${BRAND}` } : { color: '#9ca3af' }}>{l}</button>
          ))}
        </div>

        {tab === 'points' ? (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2" style={{ background: '#fafafc' }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a new key point…" className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 fs-12 outline-none" />
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 fs-12 bg-white outline-none">{catKeys.map((c) => <option key={c}>{c}</option>)}</select>
              <button onClick={add} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white inline-flex items-center gap-1" style={{ background: BRAND }}><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {master.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                  <CatDot color={categories[p.category]} title={p.category} />
                  <input value={p.title} onChange={(e) => rename(p.id, e.target.value)} className="flex-1 fs-12 text-gray-800 bg-transparent outline-none border-b border-transparent focus:border-gray-200 py-0.5" />
                  <select value={p.category} onChange={(e) => recat(p.id, e.target.value)} className="rounded-md border border-gray-200 px-1.5 py-1 fs-10 bg-white outline-none">{catKeys.map((c) => <option key={c}>{c}</option>)}</select>
                  <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
              <span className="fs-10 text-gray-400">{master.length} points · changes apply to new meetings</span>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2" style={{ background: '#fafafc' }}>
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-8 w-9 rounded cursor-pointer border border-gray-200 p-0.5" title="Pick a colour" />
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCat()} placeholder="Add a new category…" className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 fs-12 outline-none" />
              <button onClick={addCat} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white inline-flex items-center gap-1" style={{ background: BRAND }}><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {catKeys.map((name) => {
                const used = master.filter((p) => p.category === name).length;
                return (
                  <div key={name} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                    <input type="color" value={categories[name]} onChange={(e) => setCatColor(name, e.target.value)} className="h-6 w-8 rounded cursor-pointer border border-gray-200 p-0.5" title="Change colour" />
                    <span className="flex-1 fs-12 font-medium text-gray-800">{name}</span>
                    <span className="fs-10 text-gray-400">{used} point{used === 1 ? '' : 's'}</span>
                    <button onClick={() => removeCat(name)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
              <span className="fs-10 text-gray-400">Deleting a category moves its points to another one</span>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   HISTORY VIEW
   ============================================================ */
function HistoryView({ history, onView }) {
  const [code, setCode] = useState(BRANCHES[0].code);
  const meetings = history[code] || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
      <aside className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-fit">
        <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700 flex items-center gap-2"><Building2 size={14} style={{ color: BRAND }} /> Branches</div>
        <div className="overflow-y-auto" style={{ maxHeight: '22rem' }}>
          {BRANCHES.map((b) => (
            <button key={b.code} onClick={() => setCode(b.code)} className="w-full text-left px-3 py-2 border-b border-gray-50 transition" style={code === b.code ? { background: BRAND_SOFT } : {}}>
              <div className="fs-12 font-medium" style={code === b.code ? { color: BRAND } : { color: '#374151' }}>{b.name}</div>
              <div className="fs-10 text-gray-400">{(history[b.code] || []).length} meetings</div>
            </button>
          ))}
        </div>
      </aside>
      <div className="lg:col-span-3 space-y-2.5">
        {meetings.map((m) => {
          const pr = progress(m), open = m.actions.filter((a) => a.status !== 'done').length;
          return (
            <div key={m.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3 flex items-center gap-3 flex-wrap">
              <div className="h-11 w-11 rounded-lg flex flex-col items-center justify-center text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DARK})` }}>
                <span className="text-sm font-bold leading-none">{new Date(m.date).getDate()}</span>
                <span className="fs-9 leading-none mt-0.5">{new Date(m.date).toLocaleDateString(undefined, { month: 'short' })}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="fs-12 font-bold text-gray-800">{m.type}</div>
                <div className="fs-10 text-gray-400">{fmt(m.date)} · by {m.conductedBy} · {m.present.length} present</div>
              </div>
              <div className="text-center"><div className="text-sm font-bold text-gray-800">{m.points.length}</div><div className="fs-9 text-gray-400">points</div></div>
              <div className="text-center"><div className="text-sm font-bold text-gray-800">{m.actions.length}</div><div className="fs-9 text-gray-400">actions</div></div>
              <div className="w-24">
                <div className="flex justify-between fs-9 mb-1"><span className="text-gray-400">{pr}% closed</span>{open > 0 && <span className="font-semibold text-red-500">{open} open</span>}</div>
                <Bar2 v={pr} />
              </div>
              <button onClick={() => onView({ ...m, branchName: BRANCHES.find((b) => b.code === code)?.name })} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>View</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   MEETING MODAL (read-only minutes)
   ============================================================ */
function MeetingModal({ data, categories, onClose }) {
  const catColor = (n) => (categories && categories[n]) || '#94a3b8';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 text-white flex items-start justify-between" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>
          <div>
            <div className="fs-9 uppercase tracking-wide text-white/70">Minutes of Meeting</div>
            <div className="text-base font-bold">{data.branchName}</div>
            <div className="fs-10 mt-0.5 text-white/80">{fmt(data.date)} · {data.type} · by {data.conductedBy}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/15"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="fs-12 text-gray-500"><Users size={13} className="inline mr-1" />Present: <span className="text-gray-800 font-medium">{data.present.join(', ')}</span></div>
          <div>
            <div className="fs-12 font-bold text-gray-700 mb-2 flex items-center gap-1.5"><CheckCircle2 size={15} style={{ color: BRAND }} /> Points discussed</div>
            <div className="space-y-1.5">
              {data.points.map((p) => (
                <div key={p.id} className="flex items-start gap-2 fs-12"><Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#059669' }} /><CatDot color={catColor(p.category)} title={p.category} /><span className="text-gray-800">{p.title}{p.note && <span className="text-gray-400 italic"> — {p.note}</span>}</span></div>
              ))}
            </div>
          </div>
          <div>
            <div className="fs-12 font-bold text-gray-700 mb-2 flex items-center gap-1.5"><Zap size={15} style={{ color: BRAND }} /> Action items ({data.actions.length})</div>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {data.actions.map((a, i) => (
                <div key={a.id} className="px-3 py-2 flex items-start gap-3" style={i ? { borderTop: '1px solid #f3f4f6' } : {}}>
                  <div className="flex-1 min-w-0">
                    <div className="fs-12 text-gray-800 flex items-center gap-2 flex-wrap"><CatDot color={catColor(a.category)} title={a.category} />{a.title}{a.carried && <span className="fs-9 font-bold rounded px-1 py-0.5" style={{ background: 'rgba(217,119,6,0.12)', color: '#b45309' }}>CARRIED</span>}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 fs-10 text-gray-400"><span className="inline-flex items-center gap-1"><User size={11} /> {a.owner}</span><span>· due {fmt(a.due)}</span><PriTag p={a.priority} /></div>
                  </div>
                  <StatusBadge a={a} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   REPORTS VIEW
   ============================================================ */
function ReportsView({ history }) {
  const d = useMemo(() => {
    let done = 0, inProgress = 0, open = 0, overdue = 0, total = 0, meetings = 0;
    const perBranch = BRANCHES.map((b) => {
      const ms = history[b.code] || []; let bDone = 0, bTot = 0, bOpen = 0, bOver = 0;
      ms.forEach((m) => { meetings++; m.actions.forEach((a) => { total++; bTot++; if (a.status === 'done') { done++; bDone++; } else if (isOverdue(a)) { overdue++; bOver++; bOpen++; } else if (a.status === 'in_progress') { inProgress++; bOpen++; } else { open++; bOpen++; } }); });
      return { name: b.name, last: ms[0]?.date, meetings: ms.length, open: bOpen, overdue: bOver, completion: bTot ? Math.round(bDone / bTot * 100) : 0 };
    });
    return {
      perBranch, meetings,
      completion: total ? Math.round(done / total * 100) : 0, overdue,
      avg: meetings ? (total / meetings).toFixed(1) : 0,
      pie: [{ name: 'Done', value: done, color: '#059669' }, { name: 'In progress', value: inProgress, color: '#d97706' }, { name: 'Open', value: open, color: '#64748b' }, { name: 'Overdue', value: overdue, color: '#dc2626' }],
      compBar: perBranch.map((b) => ({ name: b.name, completion: b.completion })),
    };
  }, [history]);

  const KPI = ({ icon: Icon, label, value, color }) => (
    <div className="flex items-center gap-2.5 rounded-2xl border border-gray-200 bg-white shadow-sm px-3 py-2.5">
      <span className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}><Icon size={18} style={{ color }} /></span>
      <div><div className="text-base font-bold text-gray-800">{value}</div><div className="fs-10 text-gray-500">{label}</div></div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KPI icon={CalendarDays} label="Total meetings" value={d.meetings} color={BRAND} />
        <KPI icon={CheckCircle2} label="Completion rate" value={`${d.completion}%`} color="#059669" />
        <KPI icon={AlertTriangle} label="Overdue actions" value={d.overdue} color="#dc2626" />
        <KPI icon={Zap} label="Avg actions / meeting" value={d.avg} color="#d97706" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Action items by status</div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart><Pie data={d.pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>{d.pie.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie><Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Completion % by branch</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.compBar} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => `${v}%`} /><Bar dataKey="completion" radius={[0, 4, 4, 0]} fill={BRAND} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700">Branch-wise summary</div>
        <div className="overflow-x-auto">
          <table className="w-full fs-12">
            <thead><tr className="text-left text-gray-500" style={{ background: BRAND_SOFT }}>
              <th className="px-3 py-1.5 font-semibold">Branch</th><th className="px-3 py-1.5 font-semibold">Last meeting</th>
              <th className="px-3 py-1.5 font-semibold text-center">Meetings</th><th className="px-3 py-1.5 font-semibold text-center">Open</th>
              <th className="px-3 py-1.5 font-semibold text-center">Overdue</th><th className="px-3 py-1.5 font-semibold" style={{ width: '8rem' }}>Completion</th>
            </tr></thead>
            <tbody>
              {d.perBranch.map((b) => (
                <tr key={b.name} style={{ borderTop: '1px solid #f6f6f9' }}>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{b.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{fmt(b.last)}</td>
                  <td className="px-3 py-1.5 text-center text-gray-700">{b.meetings}</td>
                  <td className="px-3 py-1.5 text-center text-gray-700">{b.open}</td>
                  <td className="px-3 py-1.5 text-center">{b.overdue > 0 ? <span className="font-semibold text-red-500">{b.overdue}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-1.5"><div className="flex items-center gap-2"><div className="flex-1"><Bar2 v={b.completion} /></div><span className="fs-10 text-gray-500" style={{ width: '2rem', textAlign: 'right' }}>{b.completion}%</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}