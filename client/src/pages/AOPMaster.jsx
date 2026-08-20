import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { canEditAop } from '../utils/pagePermission';
import {
  PresentationChartLineIcon, PlusIcon, ArrowPathIcon,
  ArrowUpTrayIcon, BuildingOffice2Icon, XMarkIcon,
  TagIcon, CheckIcon, CalendarDaysIcon, WrenchScrewdriverIcon, MapPinIcon,
  FaceSmileIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// PMS → AOP Master
//   Tab 1: Target Master   — financial-year grid (Apr..Mar) of branch-wise
//                            Spare / Labour targets + monthly working days
//   Tab 2: SR Type Master (Sales and Labour) — SR Type → Head mapping,
//          synced from the Sales & Labour files
//   Last tab: CDI Target Master — the AOP column of the Annual Reports'
//          Customer Delight Index sheet, one % per FY per report row
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
// Zero targets come back as '' so the grid shows an empty cell (dash in the
// totals), not a wall of 0s.
const rupeesToLakh = (v) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return parseFloat((n / LAKH).toFixed(4));
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
// Grid-style tables — every cell bordered (dark grey grid lines).
const thCls =
  'px-2 py-1.5 text-center text-[11px] font-semibold text-black uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-400';
const tdCls = 'px-2 py-1 border border-gray-400';

// Compact variants for the 15-column FY target grid.
const thC =
  'px-1 py-1.5 text-center text-[10px] font-semibold text-black uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-400';
const tdC = 'px-1 py-0.5 border border-gray-400';
const cellInput =
  'w-full border border-gray-300 rounded px-1 py-0.5 text-xs text-black bg-white focus:outline-none focus:ring-1';

// Quarter group header + active-month (current month) green tint variants.
const thQ =
  'px-1 py-1 text-center text-[10px] font-bold text-black uppercase tracking-wide whitespace-nowrap bg-gray-100 border border-gray-400';
const thCAct =
  'px-1 py-1.5 text-center text-[10px] font-semibold text-black uppercase tracking-wide whitespace-nowrap bg-green-100 border border-gray-400';
const tdCAct = 'px-1 py-0.5 border border-gray-400 bg-green-50';
const cellInputAct =
  'w-full border border-green-300 rounded px-1 py-0.5 text-xs text-black bg-green-50 focus:outline-none focus:ring-1';

// ---- unsaved-change counters ----------------------------------------------
// Every tab's Save button says how many rows are waiting. A row counts as
// changed when it differs from the copy the SERVER last handed over, so the
// baseline is re-stamped on load AND on save / sync / reset — anything that
// came back from the server is, by definition, saved.
const snapshot = (items, keyField, valField) =>
  new Map((items || []).map((it) => [String(it[keyField] ?? ''), String(it[valField] ?? '')]));

const countChanged = (items, base, keyField, valField) => {
  if (!base) return 0;          // nothing loaded yet — nothing can be dirty
  return (items || []).reduce((n, it) => {
    const was = base.get(String(it[keyField] ?? '')) ?? '';
    return n + (String(it[valField] ?? '') !== was ? 1 : 0);
  }, 0);
};

// The badge on a Save button: '' while everything is saved.
const dirtyBadge = (n) => (n ? ` (${n})` : '');

// "Show only" users get this badge instead of the save / master buttons.
const roBadge =
  'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200';

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
  // "Show only" users open every tab but cannot change anything: the save /
  // sync / reset / master buttons are hidden and every cell is read-only.
  // (The server enforces the same rule — see _require_aop in pms_routes.py.)
  const readOnly = !canEditAop();
  const [tab, setTab] = useState('targets'); // 'targets' | 'srtypes'

  // ---- Target Master state (whole financial year) ----
  const [fy, setFy] = useState(currentFy());
  const [rows, setRows] = useState([]);          // [{branch_id, region, ..., spare:{m:lakh}, labour:{m:lakh}}]
  const [workingDays, setWorkingDays] = useState({});   // {'YYYY-MM': {mh: 'v', ka: 'v'}}
  // Holiday calendar: {'YYYY-MM-DD': {regions: ['MH','KA'], name}} — the dates
  // that carry no target. Working days of ANY range are then exact: days in it
  // minus Sundays minus these, so a part-month period is no longer a guess.
  const [holidays, setHolidays] = useState({});
  const [wdMonth, setWdMonth] = useState(null);   // month open in the calendar
  const [holScope, setHolScope] = useState('BOTH');   // 'BOTH' | 'MH' | 'KA'
  // What a month's TICKED CALENDAR works out to for a region: days in the
  // month, minus Sundays, minus that region's holidays. Null when the month
  // has nothing ticked — then the typed number below still rules, and the
  // report agrees with it.
  const calWd = (m, reg) => {
    const [yy, mm] = m.split('-').map(Number);
    const days = new Date(yy, mm, 0).getDate();
    let ticked = 0, n = 0;
    for (let d = 1; d <= days; d += 1) {
      const iso = `${m}-${String(d).padStart(2, '0')}`;
      const regs = holidays[iso]?.regions || [];
      if (regs.length) ticked += 1;
      if (new Date(yy, mm - 1, d).getDay() !== 0 && !regs.includes(reg.toUpperCase())) n += 1;
    }
    return ticked ? n : null;
  };
  const [holSaving, setHolSaving] = useState(false);
  const [defaultWd, setDefaultWd] = useState({});       // {'YYYY-MM': int}
  // {branch: [{user_id, name, role}]} — who may be a branch's Responsible
  // Person. A user with several branches appears under each of them.
  const [branchUsers, setBranchUsers] = useState({});
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [showWdModal, setShowWdModal] = useState(false);
  const [showRegionModal, setShowRegionModal] = useState(false);
  // One scroll container per target box (Spare / Labour grids)
  const spareGridRef = useRef(null);
  const labourGridRef = useRef(null);

  const months = fyMonths(fy);

  // ---- SR Type Master state ----
  const [srItems, setSrItems] = useState([]);
  const srBase = useRef(null);      // the server's copy — what 'saved' means
  const setSrFromServer = (list) => {
    srBase.current = snapshot(list, 'sr_type', 'head');
    setSrItems(list);
  };
  const [headChoices, setHeadChoices] = useState(['Warranty', 'Post Warranty', 'AMC', 'KOEL AMC', 'OTC Order']);
  const [heads, setHeads] = useState([]);          // Head master rows [{id, name}]
  const [newHead, setNewHead] = useState('');
  const [showHeadModal, setShowHeadModal] = useState(false);
  const [loadingSr, setLoadingSr] = useState(false);
  const [savingSr, setSavingSr] = useState(false);

  // ---- SR Type Master (EFSR) state — drives the report's Allocate SR ----
  const [efItems, setEfItems] = useState([]);
  const efBase = useRef(null);      // the server's copy — what 'saved' means
  const setEfFromServer = (list) => {
    efBase.current = snapshot(list, 'sr_type', 'head');
    setEfItems(list);
  };
  const [efHeadChoices, setEfHeadChoices] = useState([]);
  const [efHeads, setEfHeads] = useState([]);
  const [newEfHead, setNewEfHead] = useState('');
  const [showEfHeadModal, setShowEfHeadModal] = useState(false);
  const [loadingEf, setLoadingEf] = useState(false);
  const [savingEf, setSavingEf] = useState(false);

  // ---- SR Type Master (MaxTTR) state — drives Employee Productivity ----
  const [mxItems, setMxItems] = useState([]);
  const mxBase = useRef(null);      // the server's copy — what 'saved' means
  const setMxFromServer = (list) => {
    mxBase.current = snapshot(list, 'sr_type', 'head');
    setMxItems(list);
  };
  const [mxHeadChoices, setMxHeadChoices] = useState([]);
  const [mxHeads, setMxHeads] = useState([]);
  const [newMxHead, setNewMxHead] = useState('');
  const [showMxHeadModal, setShowMxHeadModal] = useState(false);
  const [loadingMx, setLoadingMx] = useState(false);
  const [savingMx, setSavingMx] = useState(false);

  // ---- Lead Category Master state (LMS 'Lead Raised For' -> category) ----
  const [leadItems, setLeadItems] = useState([]);
  const leadBase = useRef(null);      // the server's copy — what 'saved' means
  const setLeadFromServer = (list) => {
    leadBase.current = snapshot(list, 'lead_raised_for', 'category');
    setLeadItems(list);
  };
  const [catChoices, setCatChoices] = useState([]);
  const [cats, setCats] = useState([]);            // category master [{id, name}]
  const [newCat, setNewCat] = useState('');
  const [showCatModal, setShowCatModal] = useState(false);
  const [loadingLead, setLoadingLead] = useState(false);
  const [savingLead, setSavingLead] = useState(false);

  // ---- CDI Target Master state — the AOP column of the Customer Delight
  //      Index report (Annual Reports). One % per FY per report row.
  const [cdiRows, setCdiRows] = useState([]);      // [{scope,key,name,region,target_pct}]
  const [cdiRegions, setCdiRegions] = useState([]); // [{scope:'region',key:'MH',target_pct}]
  const [cdiOverall, setCdiOverall] = useState({ scope: 'overall', key: 'ALL', target_pct: null });
  const cdiBase = useRef(null);
  const setCdiFromServer = (d) => {
    const items = d.items || [];
    const regions = d.regions || [];
    const overall = d.overall || { scope: 'overall', key: 'ALL', target_pct: null };
    const m = new Map();
    items.forEach((r) => m.set(`branch|${r.key}`, String(r.target_pct ?? '')));
    regions.forEach((r) => m.set(`region|${r.key}`, String(r.target_pct ?? '')));
    m.set('overall|ALL', String(overall.target_pct ?? ''));
    cdiBase.current = m;
    setCdiRows(items);
    setCdiRegions(regions);
    setCdiOverall(overall);
  };
  const [loadingCdi, setLoadingCdi] = useState(false);
  const [savingCdi, setSavingCdi] = useState(false);

  // ---------------- Target Master ----------------

  const loadHolidays = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pms/holidays?fy=${fy}`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) setHolidays(data.holidays || {});
    } catch { /* the calendar just stays as it is */ }
  }, [fy]);

  // Ticking a day writes straight through — the calendar is its own master, so
  // it does not wait for "Save All" on the target grid.
  const saveHolidays = async (next) => {
    setHolidays(next);                       // optimistic: the tick shows at once
    setHolSaving(true);
    try {
      const res = await fetch(`${API}/pms/holidays`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ fy, holidays: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not save the holiday');
      setHolidays(data.holidays || {});
    } catch (e) {
      toast.error(e.message);
      loadHolidays();                        // put back what the server has
    } finally {
      setHolSaving(false);
    }
  };

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
      setBranchUsers(data.branch_users || {});
      setBranchUsers(data.branch_users || {});
    } catch (e) {
      toast.error(e.message);
      setRows([]);
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  useEffect(() => { loadTargets(fy); }, [fy, loadTargets]);
  useEffect(() => { loadHolidays(); }, [loadHolidays]);

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
  // Styled export via exceljs (loaded on demand) — colored title band,
  // header rows, zebra data rows and tinted total columns/rows, matching the
  // on-screen grid. One sheet per metric (Spare + Labour in one workbook).
  const exportTargets = async () => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    try {
      const _ex = await import('exceljs');
      const ExcelJS = _ex.default || _ex;
      // Light palette — only the title band carries the brand color; headers
      // and totals are light indigo fills with dark text.
      const BRAND = '2F3192',
        HEAD = 'E8EAF6', HEAD2 = 'DCDFF2',
        SOFT = 'F6F7FC', QCOL = 'EEF0F9', FOOT = 'E4E6F5';
      const A = (hex) => ({ argb: `FF${hex}` });
      const thin = { style: 'thin', color: A('D3D8E6') };
      const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
      const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: A(hex) });
      const wb = new ExcelJS.Workbook();
      const lastCol = 19;   // Branch + Person + 4×(3 months + Total) + FY Total

      ['spare', 'labour'].forEach((metric) => {
        const ws = wb.addWorksheet(metric === 'spare' ? 'Spare Targets' : 'Labour Targets', {
          pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        });
        ws.columns = [{ width: 22 }, { width: 20 }, ...Array(16).fill({ width: 9 }), { width: 12 }];
        const put = (r, c, v, opts = {}) => {
          const cl = ws.getCell(r, c);
          cl.value = v;
          cl.border = BORDER;
          cl.font = { size: 10, ...(opts.font || {}) };
          if (opts.fill) cl.fill = fill(opts.fill);
          cl.alignment = { vertical: 'middle', ...(opts.align || {}) };
          return cl;
        };
        const center = { horizontal: 'center' };
        const right = { horizontal: 'right' };

        // Title band
        put(1, 1, `AOP ${metric === 'spare' ? 'Spare' : 'Labour'} Target — FY ${fyLabel(fy)} (Lakh ₹)`,
          { font: { bold: true, size: 13, color: A('FFFFFF') }, fill: BRAND, align: center });
        for (let c = 2; c <= lastCol; c++) put(1, c, '', { fill: BRAND });
        ws.mergeCells(1, 1, 1, lastCol);
        ws.getRow(1).height = 24;

        // Header rows: Q1..Q4 groups on top, month names below — light fills
        const H = { font: { bold: true, size: 10, color: A(BRAND) }, fill: HEAD, align: { ...center, wrapText: true } };
        put(2, 1, 'Branch', H); ws.mergeCells(2, 1, 3, 1);
        put(2, 2, 'Responsible Person', H); ws.mergeCells(2, 2, 3, 2);
        quarters.forEach((q, i) => {
          const c0 = 3 + i * 4;
          put(2, c0, q.label, H);
          for (let c = c0 + 1; c <= c0 + 3; c++) put(2, c, '', H);
          ws.mergeCells(2, c0, 2, c0 + 3);
          q.keys.forEach((m, k) => put(3, c0 + k, monthLabel(m), H));
          put(3, c0 + 3, 'Total', { ...H, fill: HEAD2 });
        });
        put(2, lastCol, `Total FY-${String(fy + 1).slice(2)}`, H); ws.mergeCells(2, lastCol, 3, lastCol);

        // Data rows — zebra striping; 0 exported as blank (dash look)
        const val = (r, m) => parseFloat(r[metric]?.[m]) || 0;
        const num = (v) => (v ? parseFloat(v.toFixed(2)) : '');
        rows.forEach((r, i) => {
          const rr = 4 + i;
          const zebra = i % 2 === 1 ? SOFT : null;
          put(rr, 1, r.branch_name || r.branch_id, { font: { bold: true }, fill: zebra });
          put(rr, 2, r.responsible_person || '', { fill: zebra });
          quarters.forEach((q, qi) => {
            const c0 = 3 + qi * 4;
            q.keys.forEach((m, k) => put(rr, c0 + k, num(val(r, m)), { fill: zebra, align: right }));
            put(rr, c0 + 3, num(qRowTotal(r, metric, q)), { font: { bold: true }, fill: QCOL, align: right });
          });
          put(rr, lastCol, num(rowTotal(r, metric)), { font: { bold: true }, fill: QCOL, align: right });
        });

        // Footer totals row
        const fr = 4 + rows.length;
        put(fr, 1, 'Total (Lakh)', { font: { bold: true }, fill: FOOT });
        put(fr, 2, '', { fill: FOOT });
        quarters.forEach((q, qi) => {
          const c0 = 3 + qi * 4;
          q.keys.forEach((m, k) => put(fr, c0 + k, num(colTotal(metric, m)), { font: { bold: true }, fill: FOOT, align: right }));
          put(fr, c0 + 3, num(qColTotal(metric, q)), { font: { bold: true }, fill: FOOT, align: right });
        });
        put(fr, lastCol, num(grandTotal(metric)), { font: { bold: true, color: A(BRAND) }, fill: FOOT, align: right });
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AOP_Targets_FY${fy}-${String(fy + 1).slice(2)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
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
      setSrFromServer(data.items || []);
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
      setSrFromServer(data.items || []);
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
      setSrFromServer(data.items || []);
      toast.success('SR Type mapping saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingSr(false);
    }
  };

  // ---------------- SR Type Master (EFSR) ----------------
  // The Employee Productivity report's ALLOCATE SR column counts SRs assigned
  // in the EFSR Report, and groups them by THIS master.

  const loadEfTypes = useCallback(async () => {
    setLoadingEf(true);
    try {
      const res = await fetch(`${API}/pms/efsr-sr-types`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load EFSR SR types');
      setEfFromServer(data.items || []);
      setEfHeadChoices(data.head_choices || []);
      setEfHeads(data.heads || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingEf(false);
    }
  }, []);

  useEffect(() => { if (tab === 'eftypes') loadEfTypes(); }, [tab, loadEfTypes]);

  const setEfItem = (idx, value) => {
    setEfItems((prev) => prev.map((it, i) => (i === idx ? { ...it, head: value } : it)));
  };

  const addEfHead = async () => {
    const name = newEfHead.trim();
    if (!name) { toast.error('Enter a head name'); return; }
    try {
      const res = await fetch(`${API}/pms/efsr-heads`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Add failed');
      setEfHeads(data.items || []);
      setEfHeadChoices((data.items || []).map((h) => h.name));
      setNewEfHead('');
      toast.success(`Head @LQ@${name}@RQ@ added`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteEfHead = async (h) => {
    try {
      const res = await fetch(`${API}/pms/efsr-heads/${h.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Delete failed');
      setEfHeads(data.items || []);
      setEfHeadChoices((data.items || []).map((x) => x.name));
      toast.success(`Head @LQ@${h.name}@RQ@ removed`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const efAction = async (path, okMsg) => {
    try {
      const res = await fetch(`${API}/pms/efsr-sr-types/${path}`, { method: 'POST', headers: jsonHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Action failed');
      setEfFromServer(data.items || []);
      toast.success(okMsg(data));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const saveEfTypes = async () => {
    setSavingEf(true);
    try {
      const res = await fetch(`${API}/pms/efsr-sr-types`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ items: efItems.filter((i) => String(i.sr_type || '').trim()) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      setEfFromServer(data.items || []);
      toast.success('EFSR SR Type mapping saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingEf(false);
    }
  };

  // ---------------- SR Type Master (MaxTTR) ----------------
  // The Employee Productivity report counts SRs straight from the MaxTTR file,
  // so it groups them by THIS master — not the Sales/Labour one above.

  const loadMxTypes = useCallback(async () => {
    setLoadingMx(true);
    try {
      const res = await fetch(`${API}/pms/maxttr-sr-types`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load MaxTTR SR types');
      setMxFromServer(data.items || []);
      setMxHeadChoices(data.head_choices || []);
      setMxHeads(data.heads || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingMx(false);
    }
  }, []);

  useEffect(() => { if (tab === 'mxtypes') loadMxTypes(); }, [tab, loadMxTypes]);

  const setMxItem = (idx, value) => {
    setMxItems((prev) => prev.map((it, i) => (i === idx ? { ...it, head: value } : it)));
  };

  const addMxHead = async () => {
    const name = newMxHead.trim();
    if (!name) { toast.error('Enter a head name'); return; }
    try {
      const res = await fetch(`${API}/pms/maxttr-heads`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Add failed');
      setMxHeads(data.items || []);
      setMxHeadChoices((data.items || []).map((h) => h.name));
      setNewMxHead('');
      toast.success(`Head @LQ@${name}@RQ@ added`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteMxHead = async (h) => {
    try {
      const res = await fetch(`${API}/pms/maxttr-heads/${h.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Delete failed');
      setMxHeads(data.items || []);
      setMxHeadChoices((data.items || []).map((x) => x.name));
      toast.success(`Head @LQ@${h.name}@RQ@ removed`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const mxAction = async (path, okMsg) => {
    try {
      const res = await fetch(`${API}/pms/maxttr-sr-types/${path}`, { method: 'POST', headers: jsonHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Action failed');
      setMxFromServer(data.items || []);
      toast.success(okMsg(data));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const saveMxTypes = async () => {
    setSavingMx(true);
    try {
      const res = await fetch(`${API}/pms/maxttr-sr-types`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ items: mxItems.filter((i) => String(i.sr_type || '').trim()) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      setMxFromServer(data.items || []);
      toast.success('MaxTTR SR Type mapping saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingMx(false);
    }
  };

  // ---------------- Lead Category Master ----------------
  // Same shape as the SR Type Master: values are synced out of the uploaded
  // LMS file and mapped to one of the report's Product Wise Lead Count columns.

  const loadLeadCats = useCallback(async () => {
    setLoadingLead(true);
    try {
      const res = await fetch(`${API}/pms/lead-categories`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load lead categories');
      setLeadFromServer(data.items || []);
      setCatChoices(data.category_choices || []);
      setCats(data.categories || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingLead(false);
    }
  }, []);

  useEffect(() => { if (tab === 'leadcats') loadLeadCats(); }, [tab, loadLeadCats]);

  const setLeadItem = (idx, value) => {
    setLeadItems((prev) => prev.map((it, i) => (i === idx ? { ...it, category: value } : it)));
  };

  const addCat = async () => {
    const name = newCat.trim();
    if (!name) { toast.error('Enter a category name'); return; }
    try {
      const res = await fetch(`${API}/pms/lead-cats`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Add failed');
      setCats(data.items || []);
      setCatChoices((data.items || []).map((c) => c.name));
      setNewCat('');
      toast.success(`Category “${name}” added`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteCat = async (c) => {
    try {
      const res = await fetch(`${API}/pms/lead-cats/${c.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Delete failed');
      setCats(data.items || []);
      setCatChoices((data.items || []).map((x) => x.name));
      toast.success(`Category “${c.name}” removed`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const leadAction = async (path, okMsg) => {
    try {
      const res = await fetch(`${API}/pms/lead-categories/${path}`, { method: 'POST', headers: jsonHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Action failed');
      setLeadFromServer(data.items || []);
      toast.success(okMsg(data));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const saveLeadCats = async () => {
    setSavingLead(true);
    try {
      const res = await fetch(`${API}/pms/lead-categories`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ items: leadItems.filter((i) => String(i.lead_raised_for || '').trim()) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      setLeadFromServer(data.items || []);
      toast.success('Lead Category mapping saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingLead(false);
    }
  };


  // ---------------- CDI Target Master ----------------
  // The AOP column of the Customer Delight Index report. Every row of that
  // report can carry its own target for the financial year: each branch, the
  // MH / KA region totals and the overall row. A cell left EMPTY means "no
  // target" — the report shows nothing there rather than 0%.

  const loadCdiTargets = useCallback(async () => {
    setLoadingCdi(true);
    try {
      const res = await fetch(`${API}/pms/cdi-targets?fy=${fy}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Failed to load CDI targets');
      setCdiFromServer(data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingCdi(false);
    }
  }, [fy]);

  useEffect(() => { if (tab === 'cditargets') loadCdiTargets(); }, [tab, loadCdiTargets]);

  // 0–100 with up to two decimals, or '' — anything else is simply not typed.
  const cdiPctInput = (v) => {
    const s = String(v ?? '').trim();
    if (s === '') return '';
    if (!/^\d{0,3}(\.\d{0,2})?$/.test(s)) return null;
    return parseFloat(s) > 100 ? null : s;
  };

  const setCdiBranch = (idx, value) => {
    const v = cdiPctInput(value);
    if (v === null) return;
    setCdiRows((prev) => prev.map((r, i) => (i === idx ? { ...r, target_pct: v } : r)));
  };
  const setCdiRegion = (rg, value) => {
    const v = cdiPctInput(value);
    if (v === null) return;
    setCdiRegions((prev) => prev.map((r) => (r.key === rg ? { ...r, target_pct: v } : r)));
  };
  const setCdiAll = (value) => {
    const v = cdiPctInput(value);
    if (v === null) return;
    setCdiOverall((prev) => ({ ...prev, target_pct: v }));
  };

  const saveCdiTargets = async () => {
    setSavingCdi(true);
    try {
      const items = [
        ...cdiRows.map((r) => ({ scope: 'branch', key: r.key, target_pct: r.target_pct })),
        ...cdiRegions.map((r) => ({ scope: 'region', key: r.key, target_pct: r.target_pct })),
        { scope: 'overall', key: 'ALL', target_pct: cdiOverall.target_pct },
      ];
      const res = await fetch(`${API}/pms/cdi-targets`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ fy, items }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      setCdiFromServer(data);
      toast.success(`CDI targets saved for FY ${fyLabel(fy)}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingCdi(false);
    }
  };

  // Copy the overall target into every empty cell — the usual case is one
  // number for the whole company, typed once.
  const fillCdiTargets = () => {
    const v = cdiOverall.target_pct;
    if (v === null || v === undefined || String(v).trim() === '') {
      toast.error('Enter the overall target first');
      return;
    }
    setCdiRows((prev) => prev.map((r) => ({ ...r, target_pct: v })));
    setCdiRegions((prev) => prev.map((r) => ({ ...r, target_pct: v })));
    toast.success(`${v}% applied to every row — press Save to keep it`);
  };

  const dirtyCount = rows.filter((r) => r._dirty).length;
  const srDirty = countChanged(srItems, srBase.current, 'sr_type', 'head');
  const efDirty = countChanged(efItems, efBase.current, 'sr_type', 'head');
  const mxDirty = countChanged(mxItems, mxBase.current, 'sr_type', 'head');
  const leadDirty = countChanged(leadItems, leadBase.current, 'lead_raised_for', 'category');
  // CDI keeps its rows in three pieces of state, so it counts them itself.
  const cdiDirty = (() => {
    const b = cdiBase.current;
    if (!b) return 0;
    const diff = (k, v) => (String(v ?? '') !== (b.get(k) ?? '') ? 1 : 0);
    return cdiRows.reduce((n, r) => n + diff(`branch|${r.key}`, r.target_pct), 0)
      + cdiRegions.reduce((n, r) => n + diff(`region|${r.key}`, r.target_pct), 0)
      + diff('overall|ALL', cdiOverall.target_pct);
  })();

  // Column totals of a metric (Lakh) + grand totals of both.
  const colTotal = (metric, m) =>
    parseFloat(rows.reduce((s, r) => s + (parseFloat(r[metric]?.[m]) || 0), 0).toFixed(2));
  const rowTotal = (r, metric) =>
    parseFloat(months.reduce((s, m) => s + (parseFloat(r[metric]?.[m]) || 0), 0).toFixed(2));
  const grandTotal = (metric) =>
    parseFloat(rows.reduce((s, r) => s + rowTotal(r, metric), 0).toFixed(2));
  // Every total cell shows a dash instead of 0
  const dash = (v) => (v ? v : '-');

  // Quarters of the FY grid: Q1 = Apr-Jun … Q4 = Jan-Mar, each with its own Total column.
  const quarters = [0, 1, 2, 3].map((i) => ({
    label: `Q${i + 1}`, keys: months.slice(i * 3, i * 3 + 3),
  }));
  const activeMonth = nowMonthKey();  // highlighted only when the selected FY contains it
  const qRowTotal = (r, metric, q) =>
    parseFloat(q.keys.reduce((s, m) => s + (parseFloat(r[metric]?.[m]) || 0), 0).toFixed(2));
  const qColTotal = (metric, q) =>
    parseFloat(q.keys.reduce((s, m) => s + colTotal(metric, m), 0).toFixed(2));

  // FY choices: last 2 and next 2 financial years only.
  const fyChoices = [];
  for (let y = currentFy() - 2; y <= currentFy() + 2; y++) fyChoices.push(y);
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
                <h1 className="text-lg sm:text-xl font-bold leading-tight">AOP &amp; Master</h1>
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
        {/* flex-wrap: the five tab names no longer fit one row on a narrow
            window, and the buttons are flex-shrink-0 so they would overflow */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {[
            { key: 'targets', name: 'Target Master', icon: BuildingOffice2Icon },
            { key: 'srtypes', name: 'SR Type Master (Sales and Labour)', icon: TagIcon },
            { key: 'mxtypes', name: 'SR Type Master (MaxTTR)', icon: TagIcon },
            { key: 'eftypes', name: 'SR Type Master (EFSR)', icon: TagIcon },
            { key: 'leadcats', name: 'Lead Category Master', icon: TagIcon },
            { key: 'cditargets', name: 'CDI Target Master', icon: FaceSmileIcon },
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
            <div className="flex-1" />
            {readOnly && <span className={roBadge}>View only</span>}
            {!readOnly && (
              <>
                <button onClick={() => setShowRegionModal(true)} disabled={loadingTargets}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                  <MapPinIcon className="h-3.5 w-3.5" /> Region
                </button>
                <button onClick={() => setShowWdModal(true)} disabled={loadingTargets}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                  <CalendarDaysIcon className="h-3.5 w-3.5" /> Working Days
                </button>
              </>
            )}
            <button onClick={exportTargets}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
            {!readOnly && (
              <button onClick={saveTargets} disabled={savingTargets || loadingTargets}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                <CheckIcon className="h-3.5 w-3.5" />
                {savingTargets ? 'Saving…' : `Save All${dirtyBadge(dirtyCount)}`}
              </button>
            )}
          </div>

          {loadingTargets ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ArrowPathIcon className="h-7 w-7 animate-spin" />
              <p className="text-sm">Loading FY {fyLabel(fy)} targets…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <BuildingOffice2Icon className="h-8 w-8" />
              <p className="text-sm text-center px-4">
                No branches found for FY {fyLabel(fy)}.
              </p>
            </div>
          ) : (
            /* Spare and Labour grids as two stacked boxes — both always visible */
            <div className="p-3 space-y-3">
              {[
                { metric: 'spare', name: 'Spare Target (Lakh ₹)', icon: TagIcon, gridRef: spareGridRef },
                { metric: 'labour', name: 'Labour Target (Lakh ₹)', icon: WrenchScrewdriverIcon, gridRef: labourGridRef },
              ].map(({ metric, name, icon: Icon, gridRef }) => (
                <div key={metric} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-2.5 py-1.5 text-[12px] font-bold text-white flex items-center gap-1.5"
                    style={{ backgroundColor: themeColor }}>
                    <Icon className="h-3.5 w-3.5" /> {name}
                  </div>
                  <TopScrollbar scrollRef={gridRef} watch={`${metric}-${fy}-${rows.length}`} />
                  <div className="overflow-x-auto" ref={gridRef}>
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
                        {rows.map((r, idx) => (
                          <tr key={r.branch_id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                            {/* Fixed branch cell — stays visible while scrolling months;
                                name wraps to two lines, code only on hover */}
                            <td className={stickyTd} style={{ maxWidth: 90 }}
                              title={`${r.branch_name || ''}${r.branch_id ? ` (${r.branch_id})` : ''}`}>
                              <div className="font-semibold text-gray-800 truncate">{r.branch_name || '-'}</div>
                            </td>
                            {/* Responsible Person — picked from the users this
                                branch has in Profile (their primary branch or a
                                branch granted to them). Saved with Save All and
                                read by the Sales & Labour report. A name held
                                from before that is no longer in the list stays
                                selectable, so nothing is lost silently. */}
                            <td className={`${tdC} text-gray-700`} style={{ maxWidth: 110 }}
                              title={r.responsible_person || ''}>
                              {readOnly ? (
                                <div className="truncate">{r.responsible_person || '-'}</div>
                              ) : (() => {
                                const opts = branchUsers[r.branch_id] || [];
                                const cur = r.responsible_person || '';
                                const missing = cur && !opts.some((u) => u.name === cur);
                                return (
                                  <select value={cur}
                                    onChange={(e) => setRowField(idx, 'responsible_person', e.target.value)}
                                    title={opts.length ? undefined
                                      : 'No user has this branch in Profile yet'}
                                    className={`${cellInput} w-full`}
                                    style={{ '--tw-ring-color': themeColor }}>
                                    <option value="">— none —</option>
                                    {missing && <option value={cur}>{cur} (not in this branch)</option>}
                                    {opts.map((u) => (
                                      <option key={u.user_id} value={u.name}>{u.name}</option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </td>
                            {quarters.map((q) => (
                              <React.Fragment key={q.label}>
                                {q.keys.map((m) => (
                                  <td key={m} className={m === activeMonth ? tdCAct : tdC}>
                                    <input type="number" min="0" step="0.01" value={r[metric]?.[m] ?? ''}
                                      disabled={readOnly}
                                      onChange={(e) => setCell(idx, metric, m, e.target.value)}
                                      onFocus={(e) => e.target.select()}
                                      title={`${monthLabel(m)} — enter in Lakh`}
                                      className={`${m === activeMonth ? cellInputAct : cellInput} text-right`}
                                      style={{ '--tw-ring-color': themeColor }} />
                                  </td>
                                ))}
                                <td className={`${tdC} text-center font-semibold text-gray-700 bg-gray-100/70`}>
                                  {dash(qRowTotal(r, metric, q))}
                                </td>
                              </React.Fragment>
                            ))}
                            <td className={`${tdC} text-center font-semibold text-gray-800 bg-gray-50/60`}>
                              {dash(rowTotal(r, metric))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className={`${stickyTd} font-semibold text-gray-700 bg-gray-50`} colSpan={1}>Total (Lakh)</td>
                          <td className={`${tdC} bg-gray-50`} colSpan={1} />
                          {quarters.map((q) => (
                            <React.Fragment key={q.label}>
                              {q.keys.map((m) => (
                                <td key={m}
                                  className={`${m === activeMonth ? tdCAct : `${tdC} bg-gray-50`} text-center font-semibold text-gray-800`}>
                                  {dash(colTotal(metric, m))}
                                </td>
                              ))}
                              <td className={`${tdC} text-center font-bold text-gray-800 bg-gray-100`}>
                                {dash(qColTotal(metric, q))}
                              </td>
                            </React.Fragment>
                          ))}
                          <td className={`${tdC} text-center font-bold bg-gray-100 text-[#2f3192]`}>
                            {dash(grandTotal(metric))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

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
            {readOnly ? <span className={roBadge}>View only</span> : (
              <>
              <button onClick={() => srAction('sync', (d) => `Synced — ${d.added} new SR type(s) from data`)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Sync from data
              </button>
              <button onClick={() => setShowHeadModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <TagIcon className="h-3.5 w-3.5" /> Head Master
              </button>
              <button onClick={saveSrTypes} disabled={savingSr}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                <CheckIcon className="h-3.5 w-3.5" /> {savingSr ? 'Saving…' : `Save${dirtyBadge(srDirty)}`}
              </button>
              </>
            )}
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
                              <td className={`${tdCls} text-gray-700`}>{it.sr_type || '-'}</td>
                              <td className={tdCls}>
                                <select value={it.head || ''} onChange={(e) => setSrItem(idx, 'head', e.target.value)} disabled={readOnly}
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



      {/* ================= SR TYPE MASTER (EFSR) ================= */}
      {tab === 'eftypes' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500 flex-1 min-w-[220px]">
              SR Types from the <b>EFSR Report</b> — map each one to a Head.
              The <b>Employee Productivity</b> report groups its <b>Allocate SR</b> columns by these heads.
            </p>
            {readOnly ? <span className={roBadge}>View only</span> : (
              <>
              <button onClick={() => efAction('sync', (d) => `Synced — ${d.added} new SR type(s) from EFSR`)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Sync from data
              </button>
              <button onClick={() => efAction('reset', () => 'Default mapping restored')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Reset defaults
              </button>
              <button onClick={() => setShowEfHeadModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <TagIcon className="h-3.5 w-3.5" /> Head Master
              </button>
              <button onClick={saveEfTypes} disabled={savingEf}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                <CheckIcon className="h-3.5 w-3.5" /> {savingEf ? 'Saving…' : `Save${dirtyBadge(efDirty)}`}
              </button>
              </>
            )}
          </div>

          {loadingEf ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ArrowPathIcon className="h-7 w-7 animate-spin" />
              <p className="text-sm">Loading SR types…</p>
            </div>
          ) : efItems.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <TagIcon className="h-8 w-8" />
              <p className="text-sm">No SR types yet — upload the EFSR Report, then Sync from data.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 p-3">
              {[efItems.slice(0, Math.ceil(efItems.length / 2)),
                efItems.slice(Math.ceil(efItems.length / 2))].map((half, hIdx) => {
                const offset = hIdx === 0 ? 0 : Math.ceil(efItems.length / 2);
                return (
                  <div key={hIdx} className="overflow-x-auto self-start">
                    <table className="w-full text-xs border-collapse min-w-[380px]">
                      <thead>
                        <tr>
                          <th className={thCls} style={{ width: 55 }}>Sr. No.</th>
                          <th className={thCls}>SR Type (from EFSR)</th>
                          <th className={thCls} style={{ width: 160 }}>Head</th>
                        </tr>
                      </thead>
                      <tbody>
                        {half.map((it, i) => {
                          const idx = offset + i;
                          return (
                            <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                              <td className={`${tdCls} text-center text-gray-500`}>{idx + 1}</td>
                              <td className={`${tdCls} text-gray-700`}>{it.sr_type || '-'}</td>
                              <td className={tdCls}>
                                <select value={it.head || ''} onChange={(e) => setEfItem(idx, e.target.value)} disabled={readOnly}
                                  className={inputCls} style={{ '--tw-ring-color': themeColor }}>
                                  <option value="">— select head —</option>
                                  {efHeadChoices.map((h) => <option key={h} value={h}>{h}</option>)}
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

          {efItems.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-4 text-[11px] text-gray-600">
              <span>SR types: <b>{efItems.length}</b></span>
              <span>Heads: <b>{efHeadChoices.length}</b></span>
              {efItems.some((i) => !i.head) && (
                <span className="text-amber-700">
                  <b>{efItems.filter((i) => !i.head).length}</b> unmapped — those SRs land in an
                  “Unmapped” Allocate column
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= SR TYPE MASTER (MAXTTR) ================= */}
      {tab === 'mxtypes' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500 flex-1 min-w-[220px]">
              SR Types from the <b>Response Time &amp; MaxTTR</b> file — map each one to a Head.
              The <b>Employee Productivity</b> report groups its SR Type columns by these heads.
            </p>
            {readOnly ? <span className={roBadge}>View only</span> : (
              <>
              <button onClick={() => mxAction('sync', (d) => `Synced — ${d.added} new SR type(s) from MaxTTR`)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Sync from data
              </button>
              <button onClick={() => mxAction('reset', () => 'Default mapping restored')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Reset defaults
              </button>
              <button onClick={() => setShowMxHeadModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <TagIcon className="h-3.5 w-3.5" /> Head Master
              </button>
              <button onClick={saveMxTypes} disabled={savingMx}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                <CheckIcon className="h-3.5 w-3.5" /> {savingMx ? 'Saving…' : `Save${dirtyBadge(mxDirty)}`}
              </button>
              </>
            )}
          </div>

          {loadingMx ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ArrowPathIcon className="h-7 w-7 animate-spin" />
              <p className="text-sm">Loading SR types…</p>
            </div>
          ) : mxItems.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <TagIcon className="h-8 w-8" />
              <p className="text-sm">No SR types yet — upload the MaxTTR file, then Sync from data.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 p-3">
              {[mxItems.slice(0, Math.ceil(mxItems.length / 2)),
                mxItems.slice(Math.ceil(mxItems.length / 2))].map((half, hIdx) => {
                const offset = hIdx === 0 ? 0 : Math.ceil(mxItems.length / 2);
                return (
                  <div key={hIdx} className="overflow-x-auto self-start">
                    <table className="w-full text-xs border-collapse min-w-[380px]">
                      <thead>
                        <tr>
                          <th className={thCls} style={{ width: 55 }}>Sr. No.</th>
                          <th className={thCls}>SR Type (from MaxTTR)</th>
                          <th className={thCls} style={{ width: 160 }}>Head</th>
                        </tr>
                      </thead>
                      <tbody>
                        {half.map((it, i) => {
                          const idx = offset + i;
                          return (
                            <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                              <td className={`${tdCls} text-center text-gray-500`}>{idx + 1}</td>
                              <td className={`${tdCls} text-gray-700`}>{it.sr_type || '-'}</td>
                              <td className={tdCls}>
                                <select value={it.head || ''} onChange={(e) => setMxItem(idx, e.target.value)} disabled={readOnly}
                                  className={inputCls} style={{ '--tw-ring-color': themeColor }}>
                                  <option value="">— select head —</option>
                                  {mxHeadChoices.map((h) => <option key={h} value={h}>{h}</option>)}
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

          {mxItems.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-4 text-[11px] text-gray-600">
              <span>SR types: <b>{mxItems.length}</b></span>
              <span>Heads: <b>{mxHeadChoices.length}</b></span>
              {mxItems.some((i) => !i.head) && (
                <span className="text-amber-700">
                  <b>{mxItems.filter((i) => !i.head).length}</b> unmapped — those SRs land in an
                  “Unmapped” column of the report
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= LEAD CATEGORY MASTER ================= */}
      {tab === 'leadcats' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500 flex-1 min-w-[220px]">
              LMS <b>Lead Raised For</b> values — map each one to the product category the
              Employee Productivity report counts it under.
            </p>
            {readOnly ? <span className={roBadge}>View only</span> : (
              <>
              <button onClick={() => leadAction('sync', (d) => `Synced — ${d.added} new lead type(s) from LMS`)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Sync from data
              </button>
              <button onClick={() => leadAction('reset', () => 'Default mapping restored')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <ArrowPathIcon className="h-3.5 w-3.5" /> Reset defaults
              </button>
              <button onClick={() => setShowCatModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
                <TagIcon className="h-3.5 w-3.5" /> Category Master
              </button>
              <button onClick={saveLeadCats} disabled={savingLead}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: themeColor }}>
                <CheckIcon className="h-3.5 w-3.5" /> {savingLead ? 'Saving…' : `Save${dirtyBadge(leadDirty)}`}
              </button>
              </>
            )}
          </div>

          {loadingLead ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ArrowPathIcon className="h-7 w-7 animate-spin" />
              <p className="text-sm">Loading lead types…</p>
            </div>
          ) : leadItems.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <TagIcon className="h-8 w-8" />
              <p className="text-sm">No lead types yet — upload the LMS file, then Sync from data.</p>
            </div>
          ) : (
            /* Two half-tables side by side — rows split left/right */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 p-3">
              {[leadItems.slice(0, Math.ceil(leadItems.length / 2)),
                leadItems.slice(Math.ceil(leadItems.length / 2))].map((half, hIdx) => {
                const offset = hIdx === 0 ? 0 : Math.ceil(leadItems.length / 2);
                return (
                  <div key={hIdx} className="overflow-x-auto self-start">
                    <table className="w-full text-xs border-collapse min-w-[380px]">
                      <thead>
                        <tr>
                          <th className={thCls} style={{ width: 55 }}>Sr. No.</th>
                          <th className={thCls}>Lead Raised For (from LMS)</th>
                          <th className={thCls} style={{ width: 160 }}>Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {half.map((it, i) => {
                          const idx = offset + i;
                          return (
                            <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                              <td className={`${tdCls} text-center text-gray-500`}>{idx + 1}</td>
                              {/* the raw value comes from the LMS file — not editable */}
                              <td className={`${tdCls} text-gray-700`}>{it.lead_raised_for || '-'}</td>
                              <td className={tdCls}>
                                <select value={it.category || ''} onChange={(e) => setLeadItem(idx, e.target.value)} disabled={readOnly}
                                  className={inputCls} style={{ '--tw-ring-color': themeColor }}>
                                  <option value="">— select category —</option>
                                  {catChoices.map((c) => <option key={c} value={c}>{c}</option>)}
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

          {leadItems.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-4 text-[11px] text-gray-600">
              <span>Lead types: <b>{leadItems.length}</b></span>
              <span>Categories: <b>{catChoices.length}</b></span>
              {leadItems.some((i) => !i.category) && (
                <span className="text-amber-700">
                  <b>{leadItems.filter((i) => !i.category).length}</b> unmapped — those leads land in an
                  “Unmapped” column of the report
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= CDI TARGET MASTER ================= */}
      {tab === 'cditargets' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap items-center gap-1.5">
            <select value={fy} onChange={(e) => setFy(parseInt(e.target.value, 10))}
              title="Financial Year (Apr–Mar)"
              className={inputCls} style={{ '--tw-ring-color': themeColor, width: 170 }}>
              {fyChoices.sort((a, b) => a - b).map((y) => (
                <option key={y} value={y}>FY {fyLabel(y)} (Apr–Mar)</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 flex-1 min-w-[240px] px-1">
              The <b>AOP</b> column of the Annual Reports → <b>Customer Delight Index</b> sheet.
              One target per financial year; an empty cell means no target.
            </p>
            {readOnly ? <span className={roBadge}>View only</span> : (
              <>
                <button onClick={fillCdiTargets} disabled={loadingCdi}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
                  <ArrowPathIcon className="h-3.5 w-3.5" /> Apply overall to all
                </button>
                <button onClick={saveCdiTargets} disabled={savingCdi || loadingCdi}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: themeColor }}>
                  <CheckIcon className="h-3.5 w-3.5" /> {savingCdi ? 'Saving…' : `Save${dirtyBadge(cdiDirty)}`}
                </button>
              </>
            )}
          </div>

          {loadingCdi ? (
            <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ArrowPathIcon className="h-7 w-7 animate-spin" />
              <p className="text-sm">Loading CDI targets…</p>
            </div>
          ) : (
            <div className="p-3">
              {/* MH left, KA right — the two regions are independent lists, so
                  side by side halves the scrolling and lets the two be compared
                  at a glance. Each table carries its own region row on top. */}
              {/* The company row HEADS the master, the way it heads the report:
                  the CDI, then the two regions that break it down. This ONE
                  target serves both company rows on the report — the CDI row at
                  the top and the (OVERALL) row at the bottom are the same
                  figure, so they take the same target. */}
              <div className="mb-3 overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[330px]">
                  <thead>
                    <tr>
                      <th className={thCls} style={{ width: 55 }}>Sr. No.</th>
                      <th className={thCls}>Contents</th>
                      <th className={thCls} style={{ width: 120 }}>AOP Target %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#EEF0FA' }}>
                      <td className={`${tdCls} text-center text-gray-500`}>—</td>
                      <td className={`${tdCls} font-bold text-gray-900`}>
                        CUSTOMER DELIGHT INDEX (CDI)
                      </td>
                      <td className={tdCls}>
                        <input type="text" inputMode="decimal" value={cdiOverall.target_pct ?? ''}
                          onChange={(e) => setCdiAll(e.target.value)}
                          disabled={readOnly} placeholder="—"
                          className={`${cellInput} text-center font-semibold`}
                          style={{ '--tw-ring-color': themeColor }} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {['MH', 'KA'].map((rg) => {
                  const list = cdiRows.filter((r) => (r.region || 'MH') === rg);
                  if (!list.length) return null;
                  const reg = cdiRegions.find((r) => r.key === rg) || {};
                  return (
                    <div key={rg} className="overflow-x-auto self-start">
                      <table className="w-full text-xs border-collapse min-w-[330px]">
                        <thead>
                          <tr>
                            <th className={thCls} style={{ width: 55 }}>Sr. No.</th>
                            <th className={thCls}>Contents ({rg})</th>
                            <th className={thCls} style={{ width: 120 }}>AOP Target %</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-gray-100">
                            <td className={`${tdCls} text-center text-gray-500`}>—</td>
                            <td className={`${tdCls} font-bold text-gray-900`}>
                              CUSTOMER DELIGHT INDEX (CDI) ({rg})
                            </td>
                            <td className={tdCls}>
                              <input type="text" inputMode="decimal" value={reg.target_pct ?? ''}
                                onChange={(e) => setCdiRegion(rg, e.target.value)}
                                disabled={readOnly} placeholder="—"
                                className={`${cellInput} text-center font-semibold`}
                                style={{ '--tw-ring-color': themeColor }} />
                            </td>
                          </tr>
                          {list.map((r, i) => {
                            // The setter needs the row's place in cdiRows; the
                            // Sr. No. counts within this region's own table.
                            const idx = cdiRows.indexOf(r);
                            return (
                              <tr key={r.key} className="border-b border-gray-100 hover:bg-gray-50/60">
                                <td className={`${tdCls} text-center text-gray-500`}>{i + 1}</td>
                                <td className={`${tdCls} text-gray-700`}>{r.key}_{r.name}</td>
                                <td className={tdCls}>
                                  <input type="text" inputMode="decimal" value={r.target_pct ?? ''}
                                    onChange={(e) => setCdiBranch(idx, e.target.value)}
                                    disabled={readOnly} placeholder="—"
                                    className={`${cellInput} text-center`}
                                    style={{ '--tw-ring-color': themeColor }} />
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

              <p className="mt-2 text-[11px] text-gray-500">
                The report scores every row from its <b>own</b> feedback —
                (Promotor − Detractor) ÷ all feedback — so a region target is not the
                average of its branches. Targets are read by the financial year
                picked on the report.
              </p>
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
                      {r.branch_name || '-'}
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
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[88vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <CalendarDaysIcon className="h-4 w-4 text-[#2f3192]" />
                Working Days &amp; Holidays — FY {fyLabel(fy)}
              </h2>
              <button onClick={() => setShowWdModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                Working days of <b>FY {fyLabel(fy)}</b> only — pick another financial
                year at the top to set its own days; the report uses each FY's own
                values. Set <b>per region</b> — MH and KA have different holidays;
                the report spreads each region's targets over its own working days.
                Default = all days except Sundays. Saved with <b>Save All</b>.
              </p>
              {/* Click a month to open ITS calendar below — the typed counts stay
                editable, so a click on a number does not switch months. */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {months.map((m) => {
                  const hn = Object.entries(holidays)
                    .filter(([d, v]) => d.slice(0, 7) === m && (v.regions || []).length).length;
                  const open = (wdMonth || months[0]) === m;
                  return (
                  <div key={m} onClick={() => setWdMonth(m)} role="button" tabIndex={-1}
                    title="Open this month's holiday calendar"
                    className={`flex flex-col items-center rounded-lg border px-1.5 py-1.5 cursor-pointer transition ${open
                      ? 'border-transparent ring-2 bg-white'
                      : 'border-gray-200 bg-gray-50/60 hover:bg-gray-100'}`}
                    style={open ? { '--tw-ring-color': themeColor } : {}}>
                    <span className="text-[10px] font-semibold text-black mb-0.5 flex items-center gap-1">
                      {monthLabel(m).replace(/[-\s]?\d+$/, '')}
                      {hn > 0 && (
                        <span className="px-1 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                          {hn}
                        </span>
                      )}
                    </span>
                    {['mh', 'ka'].map((reg) => (
                      <div key={reg} className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-black w-5 text-right">{reg.toUpperCase()}</span>
                        {(() => {
                          const fromCal = calWd(m, reg);
                          return (
                            <input type="number" min="1" max="31"
                              value={fromCal ?? (workingDays[m]?.[reg] ?? '')}
                              readOnly={fromCal !== null}
                              onChange={(e) => setWorkingDays((prev) => ({
                                ...prev, [m]: { ...(prev[m] || {}), [reg]: e.target.value },
                              }))}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => e.target.select()}
                              title={fromCal !== null
                                ? `${reg.toUpperCase()}: counted from this month's holiday calendar — untick its dates to type a number again`
                                : `${reg.toUpperCase()} working days — default ${defaultWd[m] ?? '-'} (Sundays excluded)`}
                              className={`w-14 border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 ${fromCal !== null
                                ? 'border-amber-300 bg-amber-50 text-amber-900 cursor-default'
                                : 'border-gray-300 bg-white text-black'}`}
                              style={{ '--tw-ring-color': themeColor }} />
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                  );
                })}
              </div>

              {/* ---- holiday calendar ------------------------------------
                Ticking the actual dates is what makes a PART period exact: the
                report counts the working days inside 01-17 Aug instead of
                taking a share of the month. A month with any date ticked is
                driven by this calendar; the typed count above still applies to
                the months left untouched. */}
              <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-gray-800">
                    Holidays — {monthLabel(wdMonth || months[0])}
                  </h3>
                  {/* which region a click marks off */}
                  <div className="flex items-center gap-1">
                    {[['BOTH', 'MH + KA'], ['MH', 'MH only'], ['KA', 'KA only']].map(([k, lbl]) => (
                      <button key={k} type="button" onClick={() => setHolScope(k)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition ${holScope === k
                          ? 'text-white border-transparent'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                        style={holScope === k ? { backgroundColor: themeColor } : {}}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-gray-500">click a date to mark it off · click it again to clear</span>
                  {holSaving && <span className="text-[11px] text-gray-400">saving…</span>}
                </div>
                {(() => {
                  const m = wdMonth || months[0];
                  const [yy, mm] = m.split('-').map(Number);
                  const days = new Date(yy, mm, 0).getDate();
                  const pad = new Date(yy, mm - 1, 1).getDay();      // 0 = Sunday
                  const iso = (d) => `${m}-${String(d).padStart(2, '0')}`;
                  const regsOf = (d) => (holidays[iso(d)]?.regions || []);
                  // A click marks the date off for the chosen scope; clicking a
                  // date that already matches that scope clears it.
                  const want = holScope === 'BOTH' ? ['MH', 'KA'] : [holScope];
                  const cycle = (d) => {
                    const cur = regsOf(d).slice().sort().join(',');
                    const next = cur === want.slice().sort().join(',') ? [] : want;
                    const out = { ...holidays };
                    if (next.length) out[iso(d)] = { regions: next, name: holidays[iso(d)]?.name || null };
                    else delete out[iso(d)];
                    saveHolidays(out);
                  };
                  const wdOf = (reg) => {
                    let n = 0;
                    for (let d = 1; d <= days; d += 1) {
                      if (new Date(yy, mm - 1, d).getDay() !== 0 && !regsOf(d).includes(reg)) n += 1;
                    }
                    return n;
                  };
                  return (
                    <div className="rounded-lg border border-gray-200 p-2">
                      <div className="grid grid-cols-7 gap-1 mb-1">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                          <div key={d} className="text-center text-[10px] font-semibold text-gray-500">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: pad }, (_, i) => <div key={`p${i}`} />)}
                        {Array.from({ length: days }, (_, i) => {
                          const d = i + 1;
                          const sun = new Date(yy, mm - 1, d).getDay() === 0;
                          const regs = regsOf(d);
                          const both = regs.length === 2;
                          return (
                            <button key={d} type="button" disabled={sun || readOnly}
                              onClick={() => cycle(d)}
                              title={sun ? 'Sunday — never a working day'
                                : regs.length ? `Holiday: ${regs.join(' + ')}` : 'Working day'}
                              className={`h-9 rounded-md border text-[11px] font-medium flex flex-col items-center justify-center transition ${sun
                                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                : both ? 'bg-rose-100 text-rose-900 border-rose-300'
                                  : regs.length ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                              {d}
                              {!sun && regs.length > 0 && (
                                <span className="text-[8px] leading-none">{both ? 'MH+KA' : regs[0]}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[11px] text-gray-600">
                        Working days this month — <b>MH {wdOf('MH')}</b> · <b>KA {wdOf('KA')}</b>
                        <span className="text-gray-400"> (Sundays and the marked holidays removed)</span>
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
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

      {/* ================= LEAD CATEGORY MASTER MODAL ================= */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <TagIcon className="h-4 w-4" style={{ color: themeColor }} /> Lead Category Master
              </h2>
              <button onClick={() => setShowCatModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                These categories are the <b>Product Wise Lead Count</b> columns of the Employee
                Productivity report, in this order. A category already mapped to a lead type
                cannot be removed.
              </p>
              <div className="space-y-1.5">
                {cats.map((c) => (
                  <div key={c.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/60">
                    <span className="text-xs font-medium text-gray-800">{c.name}</span>
                    <button onClick={() => deleteCat(c)} title={`Remove “${c.name}”`}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {cats.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No categories yet.</p>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCat(); }}
                placeholder="New category name…"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs text-black focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': themeColor }} />
              <button onClick={addCat}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90"
                style={{ backgroundColor: themeColor }}>
                <PlusIcon className="h-3.5 w-3.5" /> Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MAXTTR HEAD MASTER MODAL ================= */}
      {showMxHeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <TagIcon className="h-4 w-4" style={{ color: themeColor }} /> Head Master (MaxTTR)
              </h2>
              <button onClick={() => setShowMxHeadModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                These heads are the <b>SR Type</b> columns of the Employee Productivity report,
                in this order. A head already mapped to an SR type cannot be removed.
              </p>
              <div className="space-y-1.5">
                {mxHeads.map((h) => (
                  <div key={h.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/60">
                    <span className="text-xs font-medium text-gray-800">{h.name}</span>
                    <button onClick={() => deleteMxHead(h)} title={`Remove “${h.name}”`}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {mxHeads.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No heads yet.</p>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
              <input value={newMxHead} onChange={(e) => setNewMxHead(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addMxHead(); }}
                placeholder="New head name…"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs text-black focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': themeColor }} />
              <button onClick={addMxHead}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90"
                style={{ backgroundColor: themeColor }}>
                <PlusIcon className="h-3.5 w-3.5" /> Add Head
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ================= EFSR HEAD MASTER MODAL ================= */}
      {showEfHeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <TagIcon className="h-4 w-4" style={{ color: themeColor }} /> Head Master (EFSR)
              </h2>
              <button onClick={() => setShowEfHeadModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                These heads are the <b>Allocate SR Type</b> columns of the Employee Productivity report,
                in this order. A head already mapped to an SR type cannot be removed.
              </p>
              <div className="space-y-1.5">
                {efHeads.map((h) => (
                  <div key={h.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/60">
                    <span className="text-xs font-medium text-gray-800">{h.name}</span>
                    <button onClick={() => deleteEfHead(h)} title={`Remove “${h.name}”`}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {efHeads.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No heads yet.</p>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
              <input value={newEfHead} onChange={(e) => setNewEfHead(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addEfHead(); }}
                placeholder="New head name…"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs text-black focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': themeColor }} />
              <button onClick={addEfHead}
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
