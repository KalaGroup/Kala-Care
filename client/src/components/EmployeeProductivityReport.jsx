import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';

/* ----------------------------------------------------------------------------
   Employee Productivity (Service Engineer Productivity) — PMS report.

   Source: labour-file SR NUMBERs matched against the 'Response Time & MaxTTR
   Details' import; each matched SR counts once for its SE NAME on its SR
   CLOSE DATE. The backend sends the raw per-day records once
   (GET /pms/report/employee-productivity); the reporting period comes from
   the PAGE's top period picker (props periodFrom/periodTo — the same range
   the generated report used). View/columns/cells/sort/search re-aggregate
   client-side, like prototypes/Productivity_Report_Prototype_3.html.
---------------------------------------------------------------------------- */

const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

const TEAL = '#0E7C6B';

// ---- date helpers (ISO strings, local time) --------------------------------
const MS = 86400000;
const pd = (s) => new Date(s + 'T00:00:00');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / MS);
const inclDays = (a, b) => diffDays(a, b) + 1;
const fmt = (s) => pd(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const shortBranch = (b) => String(b || '').replace(/^KALA\s*Care\s*Global\s*LLP\s*[-–]\s*/i, '');
const num2 = (v) => v.toFixed(2);

// 7-day windows from the start date; the last one is clamped to the end.
const buildWeeks = (start, end) => {
  const w = []; let cur = start, i = 1;
  while (pd(cur) <= pd(end)) {
    let we = addDays(cur, 6); if (pd(we) > pd(end)) we = end;
    w.push({ i, start: cur, end: we, days: inclDays(cur, we), label: 'Wk' + i });
    cur = addDays(cur, 7); i++;
  }
  return w;
};

// Calendar months clipped to the selected period.
const buildMonths = (start, end) => {
  const out = []; const E = pd(end); let i = 1;
  let d = pd(start); d = new Date(d.getFullYear(), d.getMonth(), 1);
  while (d <= E) {
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const s2 = d < pd(start) ? start : iso(d);
    const e2 = mEnd > E ? end : iso(mEnd);
    out.push({ i, start: s2, end: e2, days: inclDays(s2, e2),
      label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1); i++;
  }
  return out;
};

// Fixed widths for the pinned columns (name left; Period SRs + Per-day right —
// the right offset of Period SRs must equal Per-day's rendered width).
const NAME_W = 220;
const SUM_W = 96;
const RATE_W = 88;

// Synced TOP scrollbar for the wide table (same pattern as SalesLabourReport /
// Dashboard TopScrollbar — the global thin-scrollbar CSS hides native bars).
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
    const fromTable = () => { update(); top.scrollLeft = el.scrollLeft; };
    const fromTop = () => { update(); el.scrollLeft = top.scrollLeft; };
    update();
    el.addEventListener('scroll', fromTable);
    top.addEventListener('scroll', fromTop);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const tableEl = el.querySelector('table');
    if (tableEl) ro.observe(tableEl);
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

// Segmented control (View / Columns / Cells show) — caption OUTSIDE the box,
// above it, like the page's other filter labels.
const Seg = ({ cap, options, value, onChange }) => (
  <div className="flex flex-col">
    <label className="text-[10px] font-medium text-gray-500 mb-0.5">{cap}</label>
    <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5 self-start">
      {options.map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)}
          className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
            value === key ? 'bg-white text-gray-900 shadow border border-gray-200' : 'text-gray-500 hover:text-gray-800'}`}>
          {label}
        </button>
      ))}
    </div>
  </div>
);

// ---- Branch-name matching (AOP names vs Response Time file names) ----------
// The two sources spell branches differently ("Ch.Sambhaji Nagar" vs
// "Chh. Sambhaji Nagar", old city names like Aurangabad/Ahmednagar), so match
// on tokens + rename aliases + small edit distance.
const ALIAS = {   // renamed cities → one canonical form
  aurangabad: 'chsambhajinagar', chhatrapatisambhajinagar: 'chsambhajinagar',
  chhsambhajinagar: 'chsambhajinagar', sambhajinagar: 'chsambhajinagar',
  ahmednagar: 'ahilyanagar', osmanabad: 'dharashiv',
  belgaum: 'belagavi', hubballi: 'hubli', kalaburagi: 'gulbarga',
  vijayapura: 'bijapur', bellary: 'ballari', mysore: 'mysuru',
};
const tokensOf = (s) => shortBranch(s).toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const canonOf = (s) => { const c = tokensOf(s).join(''); return ALIAS[c] || c; };
// Small edit distance — catches spelling drift like Babhaleshwar/Babhleshwar
const editDist = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]; dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return dp[a.length];
};
export const branchNameMatch = (a, b) => {
  const ca = canonOf(a), cb = canonOf(b);
  if (!ca || !cb) return false;
  if (ca === cb || ca.includes(cb) || cb.includes(ca)) return true;
  // every token of the shorter name prefix-matches a token of the other
  // ("ch sambhaji nagar" ↔ "chh sambhaji nagar")
  const ta = tokensOf(a), tb = tokensOf(b);
  const [shortT, longT] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shortT.length > 0 &&
    shortT.every((t) => longT.some((u) => u.startsWith(t) || t.startsWith(u)))) return true;
  // near-identical spellings (a dropped/extra letter or two)
  return editDist(ca, cb) <= (Math.min(ca.length, cb.length) >= 6 ? 2 : 1);
};

// Worksheet for the "All (Spare + Labour)" workbook export — default view:
// branch groups with engineers indented, weekly SR counts, Period SRs +
// Per-day columns. data = the /pms/report/employee-productivity payload.
// onlyBranches (optional): AOP branch names — scopes the sheet to them.
export const buildEpSheet = (XLSX, data, periodFrom, periodTo, onlyBranches) => {
  const start = periodFrom || data?.meta?.min_date || '';
  const end = periodTo || data?.meta?.max_date || '';
  if (!data || !start || !end || start > end) return null;
  const { branches, employees, records } = data;
  const weeks = buildWeeks(start, end);
  const totalDays = inclDays(start, end);
  const emp = employees.map(() => ({ total: 0, wk: new Array(weeks.length).fill(0) }));
  for (const r of records) {
    const [ei, ds, c] = r;
    if (ds < start || ds > end) continue;
    const wi = Math.floor(diffDays(start, ds) / 7);
    if (wi < 0 || wi >= weeks.length) continue;
    emp[ei].total += c; emp[ei].wk[wi] += c;
  }
  const br = branches.map(() => ({ total: 0, wk: new Array(weeks.length).fill(0), emps: [] }));
  employees.forEach((e, ei) => {
    br[e.b].emps.push(ei); br[e.b].total += emp[ei].total;
    for (let k = 0; k < weeks.length; k++) br[e.b].wk[k] += emp[ei].wk[k];
  });
  const allowed = onlyBranches && onlyBranches.length
    ? new Set(branches.map((_, bi) => bi)
        .filter((bi) => onlyBranches.some((n) => branchNameMatch(branches[bi], n))))
    : null;
  const rowOf = (name, node) => [name, ...weeks.map((_, k) => node.wk[k]),
    node.total, +((node.total / totalDays).toFixed(2))];
  const out = [];
  const visB = branches.map((_, bi) => bi)
    .filter((bi) => br[bi].total > 0 && (!allowed || allowed.has(bi)))
    .sort((a, b) => br[b].total - br[a].total);
  visB.forEach((bi) => {
    out.push(rowOf(shortBranch(branches[bi]), br[bi]));
    br[bi].emps.filter((ei) => emp[ei].total > 0)
      .sort((a, b) => emp[b].total - emp[a].total)
      .forEach((ei) => out.push(rowOf(`    ${employees[ei].n}`, emp[ei])));
  });
  // totals follow the branch scope when one is applied
  const totSrc = allowed ? visB.map((bi) => br[bi]) : emp;
  const weekTotals = weeks.map((_, k) => totSrc.reduce((s, e) => s + e.wk[k], 0));
  out.push(rowOf('All branches', { total: totSrc.reduce((s, e) => s + e.total, 0), wk: weekTotals }));
  const hdr = ['Branch / Engineer',
    ...weeks.map((w) => `${w.label} (${fmt(w.start)}–${fmt(w.end)})`), 'Period SRs', 'Per-day'];
  const info = [
    ['Employee Productivity — SRs by close date (weekly SR counts)'],
    ['Period', `${fmt(start)} → ${fmt(end)} (${totalDays} days)`],
    ...(allowed ? [['Branches', onlyBranches.filter(Boolean).join(', ')]] : []),
    [],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...info, hdr, ...out]);
  ws['!cols'] = [{ wch: 34 }, ...weeks.map(() => ({ wch: 15 })), { wch: 11 }, { wch: 9 }];
  return ws;
};

// periodFrom / periodTo: the page's applied report period (ISO strings);
// periodFrom may be empty (Full Data) — the data's own range fills the gaps.
// preloaded: a saved {meta, branches, employees, records} payload (report
// history snapshot) — when given, no fetch happens and that data is shown.
// onlyBranches: optional list of branch NAMES (from the report's AOP rows) —
// when given, only those branches (matched fuzzily against the Response Time
// file's branch names) and their engineers are shown/exported.
const EmployeeProductivityReport = ({ periodFrom, periodTo, preloaded, onlyBranches }) => {
  const [data, setData] = useState(preloaded || null);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState('');

  // controls (mirror the prototype's state object)
  const [view, setView] = useState('branch');       // branch | employee
  const [group, setGroup] = useState('week');       // week | month
  const [metric, setMetric] = useState('perday');   // perday | count
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'period', dir: -1 });

  useEffect(() => {
    if (preloaded) { setData(preloaded); setLoading(false); return undefined; }
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`${API}/pms/report/employee-productivity`, { headers: authHeaders() });
        const d = await res.json();
        if (!alive) return;
        if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
        setData(d);
      } catch (e) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [preloaded]);

  const setGroupSafe = (g) => {
    setGroup(g);
    // a wk-column sort key is meaningless after the windows change
    setSort((s) => (s.key.startsWith('wk') ? { key: 'period', dir: -1 } : s));
  };

  // Reporting period = the page's top period selection (fall back to the
  // matched data's own range when a bound is missing).
  const start = periodFrom || data?.meta?.min_date || '';
  const end = periodTo || data?.meta?.max_date || '';

  // ---- aggregate the raw records into the selected windows -----------------
  const agg = useMemo(() => {
    if (!data || !start || !end || start > end) return null;
    const { branches, employees, records } = data;
    const weeks = group === 'month' ? buildMonths(start, end) : buildWeeks(start, end);
    const totalDays = inclDays(start, end);
    let idxOf;
    if (group === 'month') {
      const p0 = pd(weeks[0].start); const base = p0.getFullYear() * 12 + p0.getMonth();
      idxOf = (ds) => { const dd = pd(ds); return dd.getFullYear() * 12 + dd.getMonth() - base; };
    } else {
      idxOf = (ds) => Math.floor(diffDays(start, ds) / 7);
    }
    const emp = employees.map(() => ({ total: 0, wk: new Array(weeks.length).fill(0) }));
    for (const r of records) {
      const [ei, ds, c] = r;
      if (ds < start || ds > end) continue;
      const wi = idxOf(ds);
      if (wi < 0 || wi >= weeks.length) continue;
      emp[ei].total += c; emp[ei].wk[wi] += c;
    }
    const br = branches.map(() => ({ total: 0, wk: new Array(weeks.length).fill(0), emps: [] }));
    employees.forEach((e, ei) => {
      br[e.b].emps.push(ei); br[e.b].total += emp[ei].total;
      for (let k = 0; k < weeks.length; k++) br[e.b].wk[k] += emp[ei].wk[k];
    });
    const weekTotals = weeks.map((_, k) => emp.reduce((s, e) => s + e.wk[k], 0));
    return { weeks, totalDays, emp, br, weekTotals };
  }, [data, start, end, group]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
          style={{ borderTopColor: TEAL }} />
      </div>
    );
  }
  if (error) {
    return <div className="px-3 pb-4 pt-2 text-sm text-red-600">Employee Productivity: {error}</div>;
  }
  if (!data || !data.meta.min_date) {
    return (
      <div className="px-3 pb-4 pt-2">
        <div className="border border-gray-200 rounded-lg p-4 text-center text-xs text-gray-500">
          No matched data yet — upload the <b>Labour Revenue</b> file (PMS) and the
          <b> 'Response Time &amp; MaxTTR Details'</b> file (Data Upload page). SR numbers
          from the labour file are matched against that file's SR NUMBER column.
        </div>
      </div>
    );
  }
  if (!agg) {
    return <div className="px-3 pb-4 pt-2 text-sm text-gray-500">No valid reporting period.</div>;
  }

  const { meta, branches, employees } = data;
  const { weeks, totalDays, emp, br, weekTotals } = agg;
  const q = query.trim().toLowerCase();

  // Branch scope (Branch Analysis) — names come from the AOP/report rows, the
  // EP data's names from the Response Time file; branchNameMatch (module
  // scope, shared with buildEpSheet) bridges the spelling differences.
  const allowedB = onlyBranches && onlyBranches.length
    ? new Set(branches.map((_, bi) => bi)
        .filter((bi) => onlyBranches.some((n) => branchNameMatch(branches[bi], n))))
    : null;

  const totalSR = emp.reduce((s, e) => s + e.total, 0);
  const activeEng = emp.filter((e) => e.total > 0).length;
  const activeBr = br.filter((b) => b.total > 0).length;

  // display value of a window cell
  const wkVal = (node, k) => (metric === 'perday' ? node.wk[k] / weeks[k].days : node.wk[k]);
  const shade = (v, max) => {
    if (v <= 0 || max <= 0) return undefined;
    const a = 0.10 + 0.60 * Math.min(v / max, 1);
    return { background: `rgba(14,124,107,${a.toFixed(3)})` };
  };
  const sortVal = (node) => {
    const k = sort.key;
    if (k === 'period') return node.total;
    if (k === 'perday') return node.total / totalDays;
    if (k.startsWith('wk')) { const i = +k.slice(2); return i >= weeks.length ? node.total : wkVal(node, i); }
    return node.total;
  };
  const onSort = (key) => setSort((s) => (s.key === key ? { ...s, dir: -s.dir } : { key, dir: -1 }));

  let empMax = 0, brMax = 0;
  emp.forEach((e) => { for (let k = 0; k < weeks.length; k++) { const v = wkVal(e, k); if (v > empMax) empMax = v; } });
  br.forEach((b) => { for (let k = 0; k < weeks.length; k++) { const v = wkVal(b, k); if (v > brMax) brMax = v; } });

  // Faint grey grid: every cell carries its own right + bottom border
  // (border-separate on the table so the borders travel WITH sticky cells).
  const thBase = 'px-3 py-2 text-[10.5px] font-semibold text-gray-500 border-b border-r border-gray-200 whitespace-nowrap cursor-pointer select-none bg-gray-50';
  // right: null = normal scrolling column; a number = pinned to that offset
  const Th = ({ k, label, sub, left, right }) => {
    const on = sort.key === k;
    const style = {};
    if (left) { style.width = NAME_W; style.minWidth = NAME_W; style.maxWidth = NAME_W; }
    if (right != null) {
      style.right = right;
      const w = right === 0 ? RATE_W : SUM_W;
      style.width = w; style.minWidth = w; style.maxWidth = w;
    }
    return (
      <th onClick={() => onSort(k)} style={style}
        className={`${thBase} text-center ${left ? 'sticky left-0 z-20' : ''} ${right != null ? 'sticky z-20' : ''} ${on ? 'text-gray-900' : ''}`}>
        {label}
        {/* sort arrow RIGHT of the label (the sub-line goes below on its own) */}
        <span className={`ml-1 text-[8px] align-middle ${on ? '' : 'opacity-0'}`} style={on ? { color: TEAL } : {}}>
          {sort.dir < 0 ? '▼' : '▲'}
        </span>
        {sub && <span className="block font-normal text-[9px] text-gray-400 tracking-tight mt-0.5">{sub}</span>}
      </th>
    );
  };

  // one row's window cells + the two PINNED right columns (Period SRs, Per-day).
  // bg = opaque background for the pinned cells; extra = extra classes on every
  // cell (used for the total row's heavy top border — border-separate means a
  // border on <tr> would not render).
  const cells = (node, max, { bg = 'bg-white', extra = '' } = {}) => (
    <>
      {weeks.map((w, k) => {
        const raw = node.wk[k]; const v = wkVal(node, k);
        return (
          <td key={k} style={shade(v, max)}
            className={`px-3 py-1.5 text-right text-[11.5px] text-gray-800 border-b border-r border-gray-100 ${extra}`}>
            {raw === 0 ? <span className="text-gray-300">·</span> : (metric === 'perday' ? num2(v) : raw)}
          </td>
        );
      })}
      <td style={{ right: RATE_W, width: SUM_W, minWidth: SUM_W, maxWidth: SUM_W }}
        className={`px-3 py-1.5 text-right text-[11.5px] font-semibold text-gray-900 border-b border-r border-gray-100 sticky z-10 ${bg} ${extra}`}>
        {node.total}
      </td>
      <td style={{ right: 0, width: RATE_W, minWidth: RATE_W, maxWidth: RATE_W, color: TEAL }}
        className={`px-3 py-1.5 text-right text-[11.5px] font-semibold border-b border-gray-100 sticky z-10 ${bg} ${extra}`}>
        {num2(node.total / totalDays)}
      </td>
    </>
  );

  // ---- rows ----------------------------------------------------------------
  const rows = [];
  if (view === 'employee') {
    let idx = employees.map((_, ei) => ei)
      .filter((ei) => emp[ei].total > 0 && (!allowedB || allowedB.has(employees[ei].b)));
    if (q) idx = idx.filter((ei) => employees[ei].n.toLowerCase().includes(q)
      || shortBranch(branches[employees[ei].b]).toLowerCase().includes(q));
    idx.sort((a, b) => (sortVal(emp[a]) - sortVal(emp[b])) * sort.dir);
    idx.forEach((ei) => {
      const e = employees[ei];
      rows.push(
        <tr key={`e${ei}`} className="hover:bg-gray-50">
          <td style={{ width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W }}
            className="px-3 py-1.5 text-left text-xs text-gray-800 border-b border-r border-gray-100 sticky left-0 z-10 bg-white">
            <div className="truncate" title={`${e.n} — ${branches[e.b]}`}>
              {e.n} <span className="ml-1.5 text-[10px] text-gray-400">{shortBranch(branches[e.b])}</span>
            </div>
          </td>
          {cells(emp[ei], empMax)}
        </tr>
      );
    });
  } else {
    let bidx = branches.map((_, bi) => bi)
      .filter((bi) => br[bi].total > 0 && (!allowedB || allowedB.has(bi)));
    if (q) bidx = bidx.filter((bi) => shortBranch(branches[bi]).toLowerCase().includes(q)
      || br[bi].emps.some((ei) => employees[ei].n.toLowerCase().includes(q) && emp[ei].total > 0));
    bidx.sort((a, b) => (sortVal(br[a]) - sortVal(br[b])) * sort.dir);
    bidx.forEach((bi) => {
      const open = expanded.has(bi);
      const memb = br[bi].emps.filter((ei) => emp[ei].total > 0).length;
      rows.push(
        <tr key={`b${bi}`} className="cursor-pointer group"
          onClick={() => setExpanded((prev) => {
            const n = new Set(prev); n.has(bi) ? n.delete(bi) : n.add(bi); return n;
          })}>
          <td style={{ width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W }}
            className="px-3 py-2 text-left text-xs font-semibold text-gray-900 border-b border-r border-gray-200 sticky left-0 z-10 bg-white group-hover:text-teal-700">
            <div className="truncate" title={`${branches[bi]} — ${memb} engineers`}>
              <span className={`inline-block w-3.5 text-[9px] text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                style={open ? { color: TEAL } : {}}>▶</span>
              {shortBranch(branches[bi])}
              <span className="ml-1.5 text-[10px] font-normal text-gray-400">{memb} eng</span>
            </div>
          </td>
          {cells(br[bi], brMax)}
        </tr>
      );
      if (open) {
        let es = br[bi].emps.filter((ei) => emp[ei].total > 0);
        if (q && !shortBranch(branches[bi]).toLowerCase().includes(q)) {
          es = es.filter((ei) => employees[ei].n.toLowerCase().includes(q));
        }
        es.sort((a, b) => (sortVal(emp[a]) - sortVal(emp[b])) * sort.dir);
        es.forEach((ei) => {
          rows.push(
            <tr key={`b${bi}e${ei}`} className="bg-gray-50/50 hover:bg-gray-100">
              <td style={{ width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W }}
                className="pl-9 pr-3 py-1.5 text-left text-xs text-gray-600 border-b border-r border-gray-100 sticky left-0 z-10 bg-gray-50">
                <div className="truncate" title={employees[ei].n}>{employees[ei].n}</div>
              </td>
              {cells(emp[ei], empMax, { bg: 'bg-gray-50' })}
            </tr>
          );
        });
      }
    });
  }

  // Totals row follows the branch scope when one is applied
  const totNode = allowedB
    ? {
        total: [...allowedB].reduce((s, bi) => s + br[bi].total, 0),
        wk: weeks.map((_, k) => [...allowedB].reduce((s, bi) => s + br[bi].wk[k], 0)),
      }
    : { total: totalSR, wk: weekTotals };

  // Export EXACTLY the data on screen — same view, week/month columns, cell
  // metric, search filter and sort order. Branch view exports every branch
  // fully expanded (engineers indented under their branch).
  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const cellVal = (node, k) =>
        (metric === 'perday' ? +((node.wk[k] / weeks[k].days).toFixed(2)) : node.wk[k]);
      const rowOf = (name, node) => [name,
        ...weeks.map((_, k) => cellVal(node, k)),
        node.total, +((node.total / totalDays).toFixed(2))];
      const out = [];
      if (view === 'employee') {
        let idx = employees.map((_, ei) => ei)
          .filter((ei) => emp[ei].total > 0 && (!allowedB || allowedB.has(employees[ei].b)));
        if (q) idx = idx.filter((ei) => employees[ei].n.toLowerCase().includes(q)
          || shortBranch(branches[employees[ei].b]).toLowerCase().includes(q));
        idx.sort((a, b) => (sortVal(emp[a]) - sortVal(emp[b])) * sort.dir);
        idx.forEach((ei) => out.push(
          rowOf(`${employees[ei].n} — ${shortBranch(branches[employees[ei].b])}`, emp[ei])));
      } else {
        let bidx = branches.map((_, bi) => bi)
          .filter((bi) => br[bi].total > 0 && (!allowedB || allowedB.has(bi)));
        if (q) bidx = bidx.filter((bi) => shortBranch(branches[bi]).toLowerCase().includes(q)
          || br[bi].emps.some((ei) => employees[ei].n.toLowerCase().includes(q) && emp[ei].total > 0));
        bidx.sort((a, b) => (sortVal(br[a]) - sortVal(br[b])) * sort.dir);
        bidx.forEach((bi) => {
          out.push(rowOf(shortBranch(branches[bi]), br[bi]));
          let es = br[bi].emps.filter((ei) => emp[ei].total > 0);
          if (q && !shortBranch(branches[bi]).toLowerCase().includes(q)) {
            es = es.filter((ei) => employees[ei].n.toLowerCase().includes(q));
          }
          es.sort((a, b) => (sortVal(emp[a]) - sortVal(emp[b])) * sort.dir);
          es.forEach((ei) => out.push(rowOf(`    ${employees[ei].n}`, emp[ei])));
        });
      }
      out.push(rowOf(view === 'branch' ? 'All branches' : 'All engineers', totNode));
      const hdr = [view === 'branch' ? 'Branch / Engineer' : 'Engineer',
        ...weeks.map((w) => `${w.label} (${fmt(w.start)}–${fmt(w.end)})`),
        'Period SRs', 'Per-day'];
      const info = [
        ['Employee Productivity — SRs by close date'],
        ['Period', `${fmt(start)} → ${fmt(end)} (${totalDays} days)`],
        ['View', view === 'branch' ? 'Branch (engineers listed under each branch)' : 'Employee'],
        ['Columns', group === 'month' ? 'Month' : 'Week'],
        ['Cells show', metric === 'perday' ? 'Per-day (SRs ÷ window days)' : 'SR count'],
        ['Filter', q || '—'],
        [],
      ];
      const ws = XLSX.utils.aoa_to_sheet([...info, hdr, ...out]);
      ws['!cols'] = [{ wch: 34 }, ...weeks.map(() => ({ wch: 15 })), { wch: 11 }, { wch: 9 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Employee Productivity');
      XLSX.writeFile(wb, `PMS_Employee_Productivity_${start}_to_${end}.xlsx`);
      toast.success('Employee Productivity exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* ---- box title bar: title LEFT, the filters on the RIGHT ---- */}
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="self-center py-0.5">
          <p className="text-xs font-bold text-gray-800">Employee Productivity</p>
          <p className="text-[10px] text-gray-400">by SR close date · {fmt(start)} → {fmt(end)}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Seg cap="View" value={view} onChange={setView}
            options={[['branch', 'Branch'], ['employee', 'Employee']]} />
          <Seg cap="Columns" value={group} onChange={setGroupSafe}
            options={[['week', 'Week'], ['month', 'Month']]} />
          <Seg cap="Cells show" value={metric} onChange={setMetric}
            options={[['perday', 'Per-day'], ['count', 'SR count']]} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter engineer or branch"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs bg-white text-gray-800 w-44 focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': TEAL }} />
          {canExportExcel() && (
            <button onClick={exportExcel}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
          )}
        </div>
      </div>
      <div className="p-2">

      {/* ---- table: name pinned left, Period SRs + Per-day pinned right,
           only the week/month columns scroll; synced top + bottom bars ---- */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <HScrollBox watch={`${view}-${group}-${weeks.length}-${rows.length}`}>
          <table className="w-full border-separate [border-spacing:0] min-w-[720px]">
            <thead>
              <tr>
                <Th k="period" left label={view === 'branch' ? 'Branch' : 'Engineer'} />
                {weeks.map((w, k) => (
                  <Th key={k} k={`wk${k}`} label={w.label}
                    sub={group === 'month'
                      ? `${fmt(w.start)}–${fmt(w.end)} (${w.days}d)`
                      : `${fmt(w.start)}–${fmt(w.end)}${w.days < 7 ? ` (${w.days}d)` : ''}`} />
                ))}
                <Th k="period" label="Period SRs" sub="total" />
                <Th k="perday" label="Per-day" sub="SR/day" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={weeks.length + 3} className="text-center py-6 text-xs text-gray-500 border-b border-gray-100">
                  {allowedB && allowedB.size === 0
                    ? 'No productivity data matched the selected branch name(s) — the Response Time file spells these branches differently.'
                    : <>No SRs in this period{q ? ' matching the filter' : ''}.</>}
                </td></tr>
              ) : rows}
              <tr>
                <td style={{ width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W }}
                  className="px-3 py-2 text-left text-xs font-bold text-gray-900 border-t border-t-gray-800 border-r border-r-gray-100 sticky left-0 z-10 bg-gray-50 whitespace-nowrap">
                  All {view === 'branch' ? 'branches' : 'engineers'}
                </td>
                {cells(totNode, view === 'branch' ? brMax : empMax,
                  { bg: 'bg-gray-50', extra: 'border-t border-t-gray-800' })}
              </tr>
            </tbody>
          </table>
        </HScrollBox>
      </div>

      {/* ---- short formula note ---- */}
      <p className="mt-2 text-[10.5px] text-gray-500 leading-relaxed">
        <b className="text-gray-700">Per-day</b> = SRs closed ÷ days in period ·{' '}
        <b className="text-gray-700">Window rate</b> = SRs in that window ÷ its days —
        labour-file SRs matched by SR NUMBER to the Response Time &amp; MaxTTR file, counted on SR close date under the SE name.
        <span className="ml-1 text-gray-400">
          This period: {totalDays} days · {totalSR.toLocaleString('en-IN')} SRs · {activeBr} branches · {activeEng} engineers
          {meta.labour_sr_total > 0 && ` · matched ${meta.total_sr.toLocaleString('en-IN')} of ${meta.labour_sr_total.toLocaleString('en-IN')} labour SRs overall`}
          {meta.labour_row_total > meta.labour_sr_total &&
            ` (${(meta.labour_row_total - meta.labour_sr_total).toLocaleString('en-IN')} duplicate in labour file)`}.
        </span>
      </p>

      </div>
    </div>
  );
};

export default EmployeeProductivityReport;
