import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  PresentationChartLineIcon, PlusIcon, ArrowPathIcon,
  ArrowUpTrayIcon, BuildingOffice2Icon, XMarkIcon,
  TagIcon, CheckIcon, CalendarDaysIcon, WrenchScrewdriverIcon, MapPinIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// PMS → AOP Master
//   Tab 1: Target Master   — financial-year grid (Apr..Mar) of branch-wise
//                            Spare / Labour targets + monthly working days
//   Tab 2: SR Type Master  — Service Report Type → Head mapping
// Backend: server/app/routes/pms_routes.py (master admin only)
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as Knowledge Bank) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';

// Headers every PMS call sends — backend enforces master admin.
const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

// ---- Financial year helpers (Apr..Mar) ----
const currentFy = () => {
  const d = new Date();
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
};
const fyMonths = (fy) => {
  const out = [];
  for (let m = 4; m <= 12; m++) out.push(`${fy}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 3; m++) out.push(`${fy + 1}-${String(m).padStart(2, '0')}`);
  return out;
};
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${MONTH_SHORT[parseInt(m, 10) - 1]}-${y.slice(2)}`;
};
const fyLabel = (fy) => `${fy}–${String(fy + 1).slice(2)}`;

// Targets are ENTERED and DISPLAYED in Lakh (23 = ₹23,00,000) but stored in
// rupees in the DB, which is what the report math uses.
const LAKH = 100000;
const rupeesToLakh = (v) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '';
  return n === 0 ? 0 : parseFloat((n / LAKH).toFixed(4));
};
const lakhToRupees = (v) => (parseFloat(v) || 0) * LAKH;
const mapVals = (obj, fn) =>
  Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, fn(v)]));

// Server working_days → state: {'YYYY-MM': {mh: 'str', ka: 'str'}}.
// Accepts the new {mh, ka} shape and the legacy single number.
const wdToState = (wd) => mapVals(wd, (v) => (
  v !== null && typeof v === 'object'
    ? { mh: String(v.mh ?? ''), ka: String(v.ka ?? '') }
    : { mh: String(v ?? ''), ka: String(v ?? '') }
));

const inputCls =
  'w-full border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-1';
// Grid-style tables — every cell bordered.
const thCls =
  'px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-200';
const tdCls = 'px-2 py-1 border border-gray-200';

// Compact variants for the 15-column FY target grid.
const thC =
  'px-1 py-1.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-200';
const tdC = 'px-1 py-0.5 border border-gray-200';
const cellInput =
  'w-full border border-gray-300 rounded px-1 py-0.5 text-xs text-black bg-white focus:outline-none focus:ring-1';

// Quarter group header + active-month (current month) green tint variants.
const thQ =
  'px-1 py-1 text-center text-[10px] font-bold text-gray-700 uppercase tracking-wide whitespace-nowrap bg-gray-100 border border-gray-200';
const thCAct =
  'px-1 py-1.5 text-center text-[10px] font-semibold text-green-800 uppercase tracking-wide whitespace-nowrap bg-green-100 border border-green-200';
const tdCAct = 'px-1 py-0.5 border border-green-200 bg-green-50';
const cellInputAct =
  'w-full border border-green-300 rounded px-1 py-0.5 text-xs text-black bg-green-50 focus:outline-none focus:ring-1';

// Current month as 'YYYY-MM' — the active column gets the green tint.
const nowMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Always-visible top scrollbar for the wide FY table — a REAL native
// horizontal scrollbar (empty scroll area whose spacer matches the table's
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
      className={`overflow-x-auto overflow-y-hidden ${spacerWidth ? 'hidden sm:block' : 'hidden'}`}>
      <div style={{ width: spacerWidth ? `${spacerWidth}px` : '100%', height: '1px' }} />
    </div>
  );
};

// ---------------------------------------------------------------------------

const AOPMaster = () => {
  const [tab, setTab] = useState('targets'); // 'targets' | 'srtypes'

  // ---- Target Master state (whole financial year) ----
  const [fy, setFy] = useState(currentFy());
  const [subTab, setSubTab] = useState('spare'); // 'spare' | 'labour'
  const [rows, setRows] = useState([]);          // [{branch_id, region, ..., spare:{m:lakh}, labour:{m:lakh}}]
  const [workingDays, setWorkingDays] = useState({});   // {'YYYY-MM': {mh: 'v', ka: 'v'}}
  const [defaultWd, setDefaultWd] = useState({});       // {'YYYY-MM': int}
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [showWdModal, setShowWdModal] = useState(false);
  const [showRegionModal, setShowRegionModal] = useState(false);
  const targetTableRef = useRef(null);

  const months = fyMonths(fy);

  // ---- SR Type Master state ----
  const [srItems, setSrItems] = useState([]);
  const [headChoices, setHeadChoices] = useState(['Warranty', 'Post Warranty', 'AMC', 'KOEL AMC', 'OTC Order']);
  const [heads, setHeads] = useState([]);          // Head master rows [{id, name}]
  const [newHead, setNewHead] = useState('');
  const [showHeadModal, setShowHeadModal] = useState(false);
  const [loadingSr, setLoadingSr] = useState(false);
  const [savingSr, setSavingSr] = useState(false);

  // ---------------- Target Master ----------------

  const loadTargets = useCallback(async (year) => {
    setLoadingTargets(true);
    try {
      const res = await fetch(`${API}/pms/targets/year?fy=${year}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load targets');
      // Rupees → Lakh for display, per month cell. A region already saved in
      // the DB is FIXED (label in the Region modal); only new branches
      // without one get the MH/KA dropdown.
      setRows((data.items || []).map((r) => ({
        ...r,
        region: r.region || 'MH',   // default region — never blank
        _regionFixed: !!r.region,
        spare: mapVals(r.spare, rupeesToLakh),
        labour: mapVals(r.labour, rupeesToLakh),
        _dirty: false,
      })));
      setWorkingDays(wdToState(data.working_days));
      setDefaultWd(data.default_working_days || {});
    } catch (e) {
      toast.error(e.message);
      setRows([]);
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  useEffect(() => { loadTargets(fy); }, [fy, loadTargets]);

  const setCell = (idx, metric, month, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx
      ? { ...r, [metric]: { ...r[metric], [month]: value }, _dirty: true } : r)));
  };

  const setRowField = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value, _dirty: true } : r)));
  };

  const saveTargets = async () => {
    const valid = rows.filter((r) => String(r.branch_id || '').trim());
    if (!valid.length) { toast.error('Nothing to save — no branch rows'); return; }
    setSavingTargets(true);
    try {
      // Region-wise working days: {'YYYY-MM': {mh: n, ka: n}}
      const wd = {};
      months.forEach((m) => {
        const entry = {};
        const mh = parseInt(workingDays[m]?.mh, 10);
        const ka = parseInt(workingDays[m]?.ka, 10);
        if (Number.isFinite(mh)) entry.mh = mh;
        if (Number.isFinite(ka)) entry.ka = ka;
        if (Object.keys(entry).length) wd[m] = entry;
      });
      const res = await fetch(`${API}/pms/targets/year/bulk`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          fy,
          // Entered in Lakh → stored in rupees
          rows: valid.map((r) => ({
            branch_id: r.branch_id, region: r.region,
            branch_name: r.branch_name, responsible_person: r.responsible_person,
            spare: mapVals(r.spare, lakhToRupees),
            labour: mapVals(r.labour, lakhToRupees),
          })),
          working_days: wd,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      toast.success(`Saved ${data.saved} branch row(s) for FY ${fyLabel(fy)}`);
      setRows((data.items || []).map((r) => ({
        ...r,
        region: r.region || 'MH',
        _regionFixed: !!r.region,
        spare: mapVals(r.spare, rupeesToLakh),
        labour: mapVals(r.labour, rupeesToLakh),
        _dirty: false,
      })));
      setWorkingDays(wdToState(data.working_days));
      setDefaultWd(data.default_working_days || {});
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingTargets(false);
    }
  };

  // Excel export mirroring the on-screen grid: merged Q1..Q4 header row,
  // month row below it, per-quarter Total columns and the footer totals row.
  const exportTargets = async () => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    try {
      const XLSX = await import('xlsx');
      const metric = subTab;
      const qs = [0, 1, 2, 3].map((i) => ({ label: `Q${i + 1}`, keys: months.slice(i * 3, i * 3 + 3) }));
      const val = (r, m) => parseFloat(r[metric]?.[m]) || 0;
      const rTot = (r) => parseFloat(months.reduce((s, m) => s + val(r, m), 0).toFixed(2));
      const qTot = (r, q) => parseFloat(q.keys.reduce((s, m) => s + val(r, m), 0).toFixed(2));
      const cTot = (m) => parseFloat(rows.reduce((s, r) => s + val(r, m), 0).toFixed(2));

      const head1 = ['Branch', 'Responsible Person',
        ...qs.flatMap((q) => [q.label, '', '', '']),
        `Total FY-${String(fy + 1).slice(2)}`];
      const head2 = ['', '',
        ...qs.flatMap((q) => [...q.keys.map(monthLabel), 'Total']), ''];
      const data = rows.map((r) => [
        r.branch_name || r.branch_id, r.responsible_person || '',
        ...qs.flatMap((q) => [...q.keys.map((m) => val(r, m)), qTot(r, q)]),
        rTot(r),
      ]);
      const foot = ['Total (Lakh)', '',
        ...qs.flatMap((q) => [...q.keys.map(cTot),
          parseFloat(q.keys.reduce((s, m) => s + cTot(m), 0).toFixed(2))]),
        parseFloat(rows.reduce((s, r) => s + rTot(r), 0).toFixed(2))];

      const ws = XLSX.utils.aoa_to_sheet([head1, head2, ...data, foot]);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },     // Branch
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },     // Responsible Person
        ...qs.map((_, i) => ({ s: { r: 0, c: 2 + i * 4 }, e: { r: 0, c: 5 + i * 4 } })),
        { s: { r: 0, c: 18 }, e: { r: 1, c: 18 } },   // Total FY
      ];
      ws['!cols'] = [{ wch: 20 }, { wch: 20 }, ...Array(16).fill({ wch: 8 }), { wch: 11 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, metric === 'spare' ? 'Spare Targets' : 'Labour Targets');
      XLSX.writeFile(wb, `AOP_${metric === 'spare' ? 'Spare' : 'Labour'}_Targets_FY${fy}-${String(fy + 1).slice(2)}.xlsx`);
      toast.success('Exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  // ---------------- SR Type Master ----------------

  const loadSrTypes = useCallback(async () => {
    setLoadingSr(true);
    try {
      const res = await fetch(`${API}/pms/sr-types`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load SR types');
      setSrItems(data.items || []);
      if (data.head_choices?.length) setHeadChoices(data.head_choices);
      setHeads(data.heads || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingSr(false);
    }
  }, []);

  useEffect(() => { if (tab === 'srtypes') loadSrTypes(); }, [tab, loadSrTypes]);

  const setSrItem = (idx, field, value) => {
    setSrItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  // ---- Head master (feeds the Head dropdown) ----
  const addHead = async () => {
    const name = newHead.trim();
    if (!name) { toast.error('Enter a head name'); return; }
    try {
      const res = await fetch(`${API}/pms/heads`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Add failed');
      setHeads(data.items || []);
      setHeadChoices((data.items || []).map((h) => h.name));
      setNewHead('');
      toast.success(`Head “${name}” added`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteHead = async (h) => {
    try {
      const res = await fetch(`${API}/pms/heads/${h.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Delete failed');
      setHeads(data.items || []);
      setHeadChoices((data.items || []).map((x) => x.name));
      toast.success(`Head “${h.name}” removed`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const srAction = async (path, okMsg) => {
    try {
      const res = await fetch(`${API}/pms/sr-types/${path}`, { method: 'POST', headers: jsonHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Action failed');
      setSrItems(data.items || []);
      toast.success(okMsg(data));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const saveSrTypes = async () => {
    setSavingSr(true);
    try {
      const res = await fetch(`${API}/pms/sr-types`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ items: srItems.filter((i) => String(i.sr_type || '').trim()) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      setSrItems(data.items || []);
      toast.success('SR Type mapping saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingSr(false);
    }
  };

  const dirtyCount = rows.filter((r) => r._dirty).length;

  // Column totals of the active metric (Lakh) + grand totals of both.
  const colTotal = (m) =>
    parseFloat(rows.reduce((s, r) => s + (parseFloat(r[subTab]?.[m]) || 0), 0).toFixed(2));
  const rowTotal = (r, metric = subTab) =>
    parseFloat(months.reduce((s, m) => s + (parseFloat(r[metric]?.[m]) || 0), 0).toFixed(2));
  const grandTotal = (metric) =>
    parseFloat(rows.reduce((s, r) => s + rowTotal(r, metric), 0).toFixed(2));

  // Quarters of the FY grid: Q1 = Apr-Jun … Q4 = Jan-Mar, each with its own Total column.
  const quarters = [0, 1, 2, 3].map((i) => ({
    label: `Q${i + 1}`, keys: months.slice(i * 3, i * 3 + 3),
  }));
  const activeMonth = nowMonthKey();  // highlighted only when the selected FY contains it
  const qRowTotal = (r, q) =>
    parseFloat(q.keys.reduce((s, m) => s + (parseFloat(r[subTab]?.[m]) || 0), 0).toFixed(2));
  const qColTotal = (q) =>
    parseFloat(q.keys.reduce((s, m) => s + colTotal(m), 0).toFixed(2));

  // FY choices: last 5 and next 10 financial years.
  const fyChoices = [];
  for (let y = currentFy() - 5; y <= currentFy() + 10; y++) fyChoices.push(y);
  if (!fyChoices.includes(fy)) fyChoices.push(fy);

  const stickyTh = `${thC} sticky left-0 z-10`;
  const stickyTd = `${tdC} sticky left-0 z-10 bg-white`;

  // ---------------- render ----------------

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-10 max-md:px-2">

        {/* ===== Hero header (same style as Knowledge Bank) ===== */}
        <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                <PresentationChartLineIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold leading-tight">AOP Master</h1>
                <p className="text-[11px] text-white/70 leading-tight">
                  Branch-wise yearly targets, working days &amp; SR Type mapping for the PMS report
                </p>
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                <CalendarDaysIcon className="h-4 w-4" />
                Financial Year: <b className="font-bold">{fyLabel(fy)}</b> (Apr {fy} – Mar {fy + 1})
              </span>
            </div>
          </div>
        </div>

        {/* ===== Tab bar (KB style) ===== */}
        <div className="flex items-center gap-1.5 mb-3">
          {[
            { key: 'targets', name: 'Target Master', icon: BuildingOffice2Icon },
            { key: 'srtypes', name: 'SR Type Master', icon: TagIcon },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold flex-shrink-0 transition ${
                tab === t.key ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
              style={tab === t.key ? { backgroundColor: themeColor } : {}}>
              <t.icon className="h-4 w-4" />
              {t.name}
            </button>
          ))}
        </div>

      {/* ================= TARGET MASTER ================= */}
      {tab === 'targets' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* -- One header row: FY + sub-tabs + actions -- */}
          <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap items-center gap-1.5">
            <select value={fy} onChange={(e) => setFy(parseInt(e.target.value, 10))}
              title="Financial Year (Apr–Mar)"
              className={inputCls} style={{ '--tw-ring-color': themeColor, width: 170 }}>
              {fyChoices.sort((a, b) => a - b).map((y) => (
                <option key={y} value={y}>FY {fyLabel(y)} (Apr–Mar)</option>
              ))}
            </select>
            {[
              { key: 'spare', name: 'Spare Target (Lakh ₹)', icon: TagIcon },
              { key: 'labour', name: 'Labour Target (Lakh ₹)', icon: WrenchScrewdriverIcon },
            ].map((t) => (
              <button key={t.key} onClick={() => setSubTab(t.key)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                  subTab === t.key ? 'text-white' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                style={subTab === t.key ? { backgroundColor: themeColor } : {}}>
                <t.icon className="h-3.5 w-3.5" />
                {t.name}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={() => setShowRegionModal(true)} disabled={loadingTargets}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
              <MapPinIcon className="h-3.5 w-3.5" /> Region
            </button>
            <button onClick={() => setShowWdModal(true)} disabled={loadingTargets}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
              <CalendarDaysIcon className="h-3.5 w-3.5" /> Working Days
            </button>
            <button onClick={exportTargets}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={saveTargets} disabled={savingTargets || loadingTargets}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: themeColor }}>
              <CheckIcon className="h-3.5 w-3.5" />
              {savingTargets ? 'Saving…' : `Save All${dirtyCount ? ` (${dirtyCount})` : ''}`}
            </button>
          </div>

          <TopScrollbar scrollRef={targetTableRef} watch={`${subTab}-${fy}-${rows.length}`} />
          <div className="overflow-x-auto" ref={targetTableRef}>
            <table className="w-full text-xs border-collapse min-w-[1020px]">
              <thead>
                <tr>
                  <th className={stickyTh} style={{ width: 90, minWidth: 90, maxWidth: 90 }} rowSpan={2}>Branch</th>
                  <th className={thC} rowSpan={2}
                    style={{ width: 90, minWidth: 90, maxWidth: 90, whiteSpace: 'normal' }}>
                    Responsible Person
                  </th>
                  {quarters.map((q) => (
                    <th key={q.label} colSpan={4}
                      className={q.keys.includes(activeMonth) ? thCAct : thQ}>
                      {q.label}
                    </th>
                  ))}
                  <th className={thC} style={{ minWidth: 62 }} rowSpan={2}>Total FY-{String(fy + 1).slice(2)}</th>
                </tr>
                <tr>
                  {quarters.map((q) => (
                    <React.Fragment key={q.label}>
                      {q.keys.map((m) => (
                        <th key={m} className={m === activeMonth ? thCAct : thC} style={{ minWidth: 46 }}>
                          {monthLabel(m)}
                        </th>
                      ))}
                      <th className={`${thQ} font-semibold`} style={{ minWidth: 46 }}>Total</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingTargets ? (
                  <tr><td colSpan={19} className="border border-gray-200">
                    <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <ArrowPathIcon className="h-7 w-7 animate-spin" />
                      <p className="text-sm">Loading FY {fyLabel(fy)} targets…</p>
                    </div>
                  </td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={19} className="border border-gray-200">
                    <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <BuildingOffice2Icon className="h-8 w-8" />
                      <p className="text-sm text-center px-4">
                        No branches found for FY {fyLabel(fy)}.
                      </p>
                    </div>
                  </td></tr>
                ) : rows.map((r, idx) => (
                  <tr key={r.branch_id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                    {/* Fixed branch cell — stays visible while scrolling months;
                        name wraps to two lines, code only on hover */}
                    <td className={stickyTd} style={{ maxWidth: 90 }}
                      title={`${r.branch_name || ''}${r.branch_id ? ` (${r.branch_id})` : ''}`}>
                      <div className="font-semibold text-gray-800 truncate">{r.branch_name || '—'}</div>
                    </td>
                    <td className={`${tdC} text-gray-700`} style={{ maxWidth: 90 }}
                      title={r.responsible_person || ''}>
                      <div className="truncate">{r.responsible_person || '—'}</div>
                    </td>
                    {quarters.map((q) => (
                      <React.Fragment key={q.label}>
                        {q.keys.map((m) => (
                          <td key={m} className={m === activeMonth ? tdCAct : tdC}>
                            <input type="number" min="0" step="0.01" value={r[subTab]?.[m] ?? ''}
                              onChange={(e) => setCell(idx, subTab, m, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              title={`${monthLabel(m)} — enter in Lakh`}
                              className={`${m === activeMonth ? cellInputAct : cellInput} text-right`}
                              style={{ '--tw-ring-color': themeColor }} />
                          </td>
                        ))}
                        <td className={`${tdC} text-center font-semibold text-gray-700 bg-gray-100/70`}>
                          {qRowTotal(r, q)}
                        </td>
                      </React.Fragment>
                    ))}
                    <td className={`${tdC} text-center font-semibold text-gray-800 bg-gray-50/60`}>
                      {rowTotal(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && !loadingTargets && (
                <tfoot>
                  <tr>
                    <td className={`${stickyTd} font-semibold text-gray-700 bg-gray-50`} colSpan={1}>Total (Lakh)</td>
                    <td className={`${tdC} bg-gray-50`} colSpan={1} />
                    {quarters.map((q) => (
                      <React.Fragment key={q.label}>
                        {q.keys.map((m) => (
                          <td key={m}
                            className={`${m === activeMonth ? tdCAct : `${tdC} bg-gray-50`} text-center font-semibold text-gray-800`}>
                            {colTotal(m)}
                          </td>
                        ))}
                        <td className={`${tdC} text-center font-bold text-gray-800 bg-gray-100`}>
                          {qColTotal(q)}
                        </td>
                      </React.Fragment>
                    ))}
                    <td className={`${tdC} text-center font-bold bg-gray-100 text-[#2f3192]`}>
                      {grandTotal(subTab)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {rows.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-4 text-[11px] text-gray-600">
              <span>Branches: <b>{rows.length}</b></span>
              <span>FY Spare Target: <b>{grandTotal('spare')} Lakh</b> (₹ {(grandTotal('spare') * LAKH).toLocaleString('en-IN')})</span>
              <span>FY Labour Target: <b>{grandTotal('labour')} Lakh</b> (₹ {(grandTotal('labour') * LAKH).toLocaleString('en-IN')})</span>
              <span className="ml-auto text-gray-400">Enter in Lakh — 23 means ₹23,00,000</span>
            </div>
          )}
        </div>
      )}

      {/* ================= SR TYPE MASTER ================= */}
      {tab === 'srtypes' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500 flex-1 min-w-[220px]">
              SR Types are added <b>automatically on file upload</b> — map each one to a Head.
            </p>
            <button onClick={() => srAction('sync', (d) => `Synced — ${d.added} new SR type(s) from data`)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowPathIcon className="h-3.5 w-3.5" /> Sync from data
            </button>
            <button onClick={() => srAction('reset', () => 'Default mapping restored')}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowPathIcon className="h-3.5 w-3.5" /> Reset defaults
            </button>
            <button onClick={() => setShowHeadModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <TagIcon className="h-3.5 w-3.5" /> Head Master
            </button>
            <button onClick={saveSrTypes} disabled={savingSr}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: themeColor }}>
              <CheckIcon className="h-3.5 w-3.5" /> {savingSr ? 'Saving…' : 'Save'}
            </button>
          </div>

          {loadingSr ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ArrowPathIcon className="h-7 w-7 animate-spin" />
              <p className="text-sm">Loading SR types…</p>
            </div>
          ) : srItems.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <TagIcon className="h-8 w-8" />
              <p className="text-sm">No SR types yet.</p>
            </div>
          ) : (
            /* Two half-tables side by side — rows split left/right */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 p-3">
              {[srItems.slice(0, Math.ceil(srItems.length / 2)),
                srItems.slice(Math.ceil(srItems.length / 2))].map((half, hIdx) => {
                const offset = hIdx === 0 ? 0 : Math.ceil(srItems.length / 2);
                return (
                  <div key={hIdx} className="overflow-x-auto self-start">
                    <table className="w-full text-xs border-collapse min-w-[380px]">
                      <thead>
                        <tr>
                          <th className={thCls} style={{ width: 55 }}>Sr. No.</th>
                          <th className={thCls}>SR Type (from Excel)</th>
                          <th className={thCls} style={{ width: 160 }}>Head</th>
                        </tr>
                      </thead>
                      <tbody>
                        {half.map((it, i) => {
                          const idx = offset + i;
                          return (
                            <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                              <td className={`${tdCls} text-center text-gray-500`}>{idx + 1}</td>
                              {/* SR Type comes from the Excel data — plain text, not editable */}
                              <td className={`${tdCls} text-gray-700`}>{it.sr_type || '—'}</td>
                              <td className={tdCls}>
                                <select value={it.head || ''} onChange={(e) => setSrItem(idx, 'head', e.target.value)}
                                  className={inputCls} style={{ '--tw-ring-color': themeColor }}>
                                  <option value="">— select head —</option>
                                  {headChoices.map((h) => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= REGION MODAL ================= */}
      {showRegionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <MapPinIcon className="h-4 w-4 text-[#2f3192]" />
                Branch Region — MH / KA
              </h2>
              <button onClick={() => setShowRegionModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                One region per branch — applies to <b>both Spare and Labour</b> targets.
                The report spreads each branch's targets over its region's (MH/KA)
                working days. A saved region is <b>fixed</b>; only new branches
                without one get the dropdown. Saved with <b>Save All</b>.
              </p>
              <div className="space-y-1.5">
                {rows.map((r, idx) => (
                  <div key={r.branch_id ?? `new-${idx}`}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/60">
                    <span className="text-xs font-medium text-gray-800 truncate" title={r.branch_id}>
                      {r.branch_name || '—'}
                    </span>
                    {r._regionFixed ? (
                      <span className="flex-shrink-0 text-center text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 rounded px-2 py-1"
                        style={{ width: 70 }} title="Region already saved — fixed">
                        {r.region}
                      </span>
                    ) : (
                      <select value={r.region || 'MH'} onChange={(e) => setRowField(idx, 'region', e.target.value)}
                        className={`${inputCls} flex-shrink-0`} style={{ '--tw-ring-color': themeColor, width: 70 }}>
                        <option value="MH">MH</option>
                        <option value="KA">KA</option>
                      </select>
                    )}
                  </div>
                ))}
                {rows.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No branches loaded.</p>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end">
              <button onClick={() => setShowRegionModal(false)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90"
                style={{ backgroundColor: themeColor }}>
                <CheckIcon className="h-3.5 w-3.5" /> Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= WORKING DAYS MODAL ================= */}
      {showWdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <CalendarDaysIcon className="h-4 w-4 text-[#2f3192]" />
                Monthly Working Days — all financial years
              </h2>
              <button onClick={() => setShowWdModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                One master for <b>every financial year</b> — no year attached; set each
                month once and it applies to all FYs. Set <b>per region</b> — MH and KA
                have different holidays; the report spreads each region's targets
                over its own working days. Default = all days except Sundays.
                Saved with <b>Save All</b>.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {months.map((m) => (
                  <div key={m} className="flex flex-col items-center rounded-lg border border-gray-200 bg-gray-50/60 px-1.5 py-1.5">
                    <span className="text-[10px] font-semibold text-black mb-0.5">{monthLabel(m).replace(/[-\s]?\d+$/, '')}</span>
                    {['mh', 'ka'].map((reg) => (
                      <div key={reg} className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-black w-5 text-right">{reg.toUpperCase()}</span>
                        <input type="number" min="1" max="31" value={workingDays[m]?.[reg] ?? ''}
                          onChange={(e) => setWorkingDays((prev) => ({
                            ...prev, [m]: { ...(prev[m] || {}), [reg]: e.target.value },
                          }))}
                          onFocus={(e) => e.target.select()}
                          title={`${reg.toUpperCase()} working days — default ${defaultWd[m] ?? '—'} (Sundays excluded)`}
                          className="w-14 border border-gray-300 rounded px-1 py-0.5 text-xs text-black bg-white text-center focus:outline-none focus:ring-1"
                          style={{ '--tw-ring-color': themeColor }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
              <button onClick={() => setWorkingDays(mapVals(defaultWd, (v) => ({ mh: String(v ?? ''), ka: String(v ?? '') })))}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Reset defaults
              </button>
              <div className="flex-1" />
              <button onClick={() => setShowWdModal(false)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90"
                style={{ backgroundColor: themeColor }}>
                <CheckIcon className="h-3.5 w-3.5" /> Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= HEAD MASTER MODAL ================= */}
      {showHeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <TagIcon className="h-4 w-4" style={{ color: themeColor }} /> Head Master
              </h2>
              <button onClick={() => setShowHeadModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                These heads appear in the Head dropdown of the SR Type mapping. A head
                that is in use by SR types cannot be removed.
              </p>
              <div className="space-y-1.5">
                {heads.map((h) => (
                  <div key={h.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/60">
                    <span className="text-xs font-medium text-gray-800">{h.name}</span>
                    <button onClick={() => deleteHead(h)} title={`Remove “${h.name}”`}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {heads.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No heads yet.</p>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
              <input value={newHead} onChange={(e) => setNewHead(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addHead(); }}
                placeholder="New head name…"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs text-black focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': themeColor }} />
              <button onClick={addHead}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90"
                style={{ backgroundColor: themeColor }}>
                <PlusIcon className="h-3.5 w-3.5" /> Add Head
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default AOPMaster;
