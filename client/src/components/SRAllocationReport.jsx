import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import { THEME, GRID, HScrollBox, MultiSelect, SingleSelect, FilterRow } from './reportChrome';

/* ----------------------------------------------------------------------------
   SR Allocation — PMS report, same layout language as Employee Productivity.

   Source (GET /pms/report/sr-allocation, fetched ONCE by the page):
     THE EFSR REPORT, and only it — carrying BOTH of its dates:
       Allocated Total    every row with a SERVICE ENGINEER UID, counted on its
       Task               TASK ASSIGNED DATE. No closed date required, so an SR
                          still open counts the day it was allocated — the same
                          figure as 'Allocated SR' in Employee Productivity.
       Closed Total Task  the same rows counted on their TASK END DATE — the
                          day the ENGINEER finished the job, not the later
                          back-office SR Closed Date.
       SE UID / SE Name   the SE UID Master (UID -> engineer); a UID the master
                          does not know keeps the file's own SE name
       Branch             the SD BRANCH CODE the engineer closed most SRs in
       Date columns       those dates themselves, bucketed day / week / month
                          across the period picked at the top. The 'Date split'
                          control picks which measure they carry (Allocated /
                          Closed / Both); the two totals are ALWAYS both shown.
       SR Type            the row's SR TYPE through the 'SR Type Master (EFSR)'
                          (AOP Master) — the ▶ on an engineer opens it ROW-WISE

   Allocated and Closed differ by the SRs assigned inside the period but closed
   outside it (or not yet closed) — that gap is the open backlog.

   The payload is raw per-day records, so the period, the granularity, the day /
   week ticks and every filter re-aggregate client-side without a refetch.
---------------------------------------------------------------------------- */

const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

// ---- date helpers (ISO strings, local time) --------------------------------
const MS = 86400000;
const pd = (s) => new Date(s + 'T00:00:00');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / MS);
const inclDays = (a, b) => diffDays(a, b) + 1;
const fmtD = (s) => pd(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const fmtM = (s) => pd(s).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortBranch = (b) => String(b || '').replace(/^KALA\s*Care\s*Global\s*LLP\s*[-–]\s*/i, '');
const nf = (v) => (v || 0).toLocaleString('en-IN');

// Calendar weeks (Mon–Sun) clipped to the period; the first and last may be
// partial — the same split the Employee Productivity report uses.
const buildWeeks = (start, end) => {
  const out = [];
  let cur = start, n = 1;
  while (pd(cur) <= pd(end)) {
    const dowMon = (pd(cur).getDay() + 6) % 7;            // Mon = 0
    let we = addDays(cur, 6 - dowMon);
    if (pd(we) > pd(end)) we = end;
    out.push({ n, label: `W${n}`, start: cur, end: we, days: inclDays(cur, we),
      range: `${fmtD(cur)} – ${fmtD(we)}` });
    cur = addDays(we, 1); n++;
  }
  return out;
};

// A period of a few weeks reads best day by day; a year does not (365 columns).
const autoGran = (days) => (days <= 45 ? 'day' : days <= 210 ? 'week' : 'month');
const GRANS = [{ v: 'day', t: 'Day wise' }, { v: 'week', t: 'Week wise' },
  { v: 'month', t: 'Month wise' }];

// WHICH MEASURE the date columns carry. Both totals are always pinned on the
// left; this only splits the date band — 'both' pairs every bucket into an
// Allocated and a Closed sub-column, which doubles the date columns.
const SPLITS = [{ v: 'alloc', t: 'Allocated' }, { v: 'close', t: 'Closed' },
  { v: 'both', t: 'Both' }];

// WHERE the closure rate (Closed / Allocated x 100) is shown. It needs both
// measures to divide, so it only applies while the split is 'Both'.
//   off    no rate at all
//   total  ONE pinned rate column beside Total Task — the period's own rate
//   all    that, plus a rate column beside every date column
const PCT_MODES = [{ v: 'off', t: 'Off' }, { v: 'total', t: 'Total only' },
  { v: 'all', t: 'Every column' }];

// Pinned-column widths (must match the sticky left offsets below). Branch Name
// and SE Name are deliberately TIGHT — both ellipsize and carry the full text in
// their tooltip, so the room goes to the data columns instead.
const W_GRP = 26, W_BRANCH = 100, W_UID = 72, W_NAME = 120;
const W_OPEN = 50;            // Open SR — branch wise
const W_TOT = 66;

// Table palette — LIGHT BLUE, the shared GRID set (reportChrome) the Employee
// Productivity report also paints with. Adjacent blocks never share a tint, so
// rows stay separable even when the browser drops the 1px rules.
const C_HEAD = GRID.head;                            // every header cell
const C_ROW_A = GRID.rowA, C_ROW_B = GRID.rowB;      // engineer rows
const C_BAND_A = GRID.bandA, C_BAND_B = GRID.bandB;  // collapsed rows / branch
const C_GRP_A = GRID.grpA, C_GRP_B = GRID.grpB;      // group arrow column
const C_SUBTOT = GRID.subTot, C_GRPTOT = GRID.grpTot; // Sub Total rows
const C_REGION = GRID.region;                        // MH / KA total rows
const C_GRAND = GRID.grand;                          // Grand Total (ERP blue)
const C_TYPE = GRID.type;                            // the SR Type block
const C_SEL = GRID.sel;                              // a row picked in the SE filter

// periodFrom / periodTo: the page's applied report period (ISO strings).
// preloaded: an already-fetched payload (the page loads it once so it knows the
// closed-date range) — when given, no fetch happens.
const SRAllocationReport = ({ periodFrom, periodTo, preloaded }) => {
  const [data, setData] = useState(preloaded || null);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState('');

  const [granPick, setGranPick] = useState('');                // '' = automatic
  // Both measures from the start: the report is read as Allocated against
  // Closed, so opening on one of them alone hid half the answer.
  const [split, setSplit] = useState('both');    // date columns: alloc/close/both
  const [pctMode, setPctMode] = useState('off'); // 'Both' only — see PCT_MODES
  const [exporting, setExporting] = useState(false);
  // One tick set per granularity — only the one matching the date columns on
  // screen is reachable (see the filter bar), the others stay empty.
  const [weekSel, setWeekSel] = useState(() => new Set());     // empty = all
  const [daySel, setDaySel] = useState(() => new Set());       // empty = all
  const [monthSel, setMonthSel] = useState(() => new Set());   // 'YYYY-MM'
  const [brSel, setBrSel] = useState(() => new Set());         // branch indices
  const [seSel, setSeSel] = useState(() => new Set());         // employee indices
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [openBranches, setOpenBranches] = useState(() => new Set());
  const [openSE, setOpenSE] = useState(() => new Set());       // row-wise SR Type

  useEffect(() => {
    if (preloaded) { setData(preloaded); setLoading(false); return undefined; }
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`${API}/pms/report/sr-allocation`, { headers: authHeaders() });
        const d = await res.json();
        if (!alive) return;
        if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
        setData(d);
      } catch (e) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [preloaded]);

  const start = periodFrom || data?.meta?.min_date || '';
  const end = periodTo || data?.meta?.max_date || '';
  const nDays = start && end && start <= end ? inclDays(start, end) : 0;
  const gran = granPick || autoGran(nDays || 1);

  // A new period invalidates every tick set (W3 of July is not W3 of August,
  // and last month's dates are not this month's). Switching the COLUMN
  // granularity clears them too: the dropdown of the granularity you left is no
  // longer on screen, and ticks behind a hidden dropdown would filter invisibly.
  useEffect(() => {
    setWeekSel(new Set());
    setDaySel(new Set());
    setMonthSel(new Set());
  }, [start, end, gran]);

  // ANY control in the filter bar re-MINIMIZES the report: every opened group,
  // branch and row-wise SR Type folds back, so a fresh selection is always read
  // from the top (group / branch totals) down instead of landing in the middle of
  // someone's old drill-down. That is EVERY bar control — period, Columns, Date
  // split, the day / week / month ticks, Branch, SE, search.
  useEffect(() => {
    setOpenGroups(new Set());
    setOpenBranches(new Set());
    setOpenSE(new Set());
  }, [start, end, gran, split, pctMode, weekSel, daySel, monthSel, brSel, seSel, query]);

  // ---- aggregate the raw records into the current selection ----------------
  const agg = useMemo(() => {
    if (!data || !start || !end || start > end) return null;
    const { employees = [], branches = [], heads = [],
      alloc_records: alRec = [], close_records: clRec = [],
      open_records: opRec = [] } = data;

    const weeks = buildWeeks(start, end);
    const anchor = addDays(start, -((pd(start).getDay() + 6) % 7));   // Monday
    const weekNo = (ds) => Math.floor(diffDays(anchor, ds) / 7) + 1;

    // ---- the date columns ---------------------------------------------------
    const buckets = [];
    let idxOf;
    if (gran === 'week') {
      weeks.forEach((w) => buckets.push({ label: w.label, sub: w.range, start: w.start, end: w.end }));
      idxOf = (ds) => Math.floor(diffDays(anchor, ds) / 7);
    } else if (gran === 'month') {
      const y0 = pd(start).getFullYear(), m0 = pd(start).getMonth();
      let cur = `${start.slice(0, 7)}-01`;
      while (cur <= end) {
        const d0 = pd(cur);
        const last = iso(new Date(d0.getFullYear(), d0.getMonth() + 1, 0));
        buckets.push({ label: fmtM(cur), sub: '', start: cur < start ? start : cur,
          end: last > end ? end : last });
        cur = iso(new Date(d0.getFullYear(), d0.getMonth() + 1, 1));
      }
      idxOf = (ds) => (pd(ds).getFullYear() - y0) * 12 + (pd(ds).getMonth() - m0);
    } else {
      for (let ds = start; ds <= end; ds = addDays(ds, 1)) {
        buckets.push({ label: fmtD(ds), sub: DOW[pd(ds).getDay()], start: ds, end: ds });
      }
      idxOf = (ds) => diffDays(start, ds);
    }
    const nb = buckets.length;

    // ---- which dates are in the selection (Weeks / Days / Months ticks) ----
    const dayIn = Object.create(null);
    const bucketOn = new Array(nb).fill(false);
    for (let ds = start; ds <= end; ds = addDays(ds, 1)) {
      if (weekSel.size && !weekSel.has(weekNo(ds))) continue;
      if (daySel.size && !daySel.has(ds)) continue;
      if (monthSel.size && !monthSel.has(ds.slice(0, 7))) continue;
      dayIn[ds] = true;
      const bi = idxOf(ds);
      if (bi >= 0 && bi < nb) bucketOn[bi] = true;
    }

    // ---- per-engineer accumulation ------------------------------------------
    // TWO measures, both from the EFSR file and both bucketed on their OWN date:
    //   a / ac[]   ALLOCATED, on the Task Assigned Date (the same figure the
    //              Employee Productivity report calls Allocated SR)
    //   c / cc[]   CLOSED, on the Task End Date
    // An SR assigned in the period but closed after it counts in `a` only, which
    // is exactly the open backlog the old closed-date-only report hid.
    const blank = () => ({ a: 0, c: 0,
      ac: new Array(nb).fill(0), cc: new Array(nb).fill(0),
      heads: new Array(heads.length).fill(null) });
    const emp = employees.map(blank);
    const headSlot = (e, hi) => {
      if (!e.heads[hi]) {
        e.heads[hi] = { a: 0, c: 0,
          ac: new Array(nb).fill(0), cc: new Array(nb).fill(0) };
      }
      return e.heads[hi];
    };
    const take = (recs, tot, col) => recs.forEach(([ei, ds, hi, n]) => {
      if (!dayIn[ds]) return;
      const e = emp[ei];
      if (!e) return;
      const bi = idxOf(ds);
      if (bi < 0 || bi >= nb) return;
      e[tot] += n;
      e[col][bi] += n;
      const h = headSlot(e, hi);
      h[tot] += n;
      h[col][bi] += n;
    });
    take(alRec, 'a', 'ac');
    take(clRec, 'c', 'cc');

    const active = emp.map((e) => e.a > 0 || e.c > 0);
    const byBranch = branches.map(() => []);
    employees.forEach((e, ei) => { if (active[ei]) byBranch[e.b].push(ei); });
    byBranch.forEach((list) => list.sort((a, b) =>
      employees[a].n.localeCompare(employees[b].n)));

    const shownBuckets = buckets
      .map((b, i) => ({ ...b, i }))
      .filter((b) => bucketOn[b.i]);

    // ---- Open SR, BRANCH wise (no engineer dimension) ----------------------
    // [branchIdx, isoCreatedDate, count] from the Open SR Load Report: the
    // customer of the INSTANCE ID gives the branch, SR CREATED DATE the day —
    // so it follows the same period and date ticks as everything else.
    const openBr = branches.map(() => 0);
    opRec.forEach(([bi, ds, n]) => {
      if (dayIn[ds] && openBr[bi] !== undefined) openBr[bi] += n;
    });

    return { weeks, buckets, shownBuckets, nb, emp, byBranch, heads, openBr };
  }, [data, start, end, gran, weekSel, daySel, monthSel]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
          style={{ borderTopColor: THEME }} />
      </div>
    );
  }
  if (error) {
    return <div className="px-3 pb-4 pt-2 text-sm text-red-600">SR Allocation: {error}</div>;
  }
  if (!data || !data.meta.min_date) {
    return (
      <div className="px-3 pb-4 pt-2">
        <div className="border border-gray-200 rounded-lg p-4 text-center text-xs text-gray-500">
          No data yet — upload the <b>&apos;EFSR Report&apos;</b> file on the Data Upload page.
          Every row in it with a Service Engineer UID counts here — on its Task Assigned
          Date as allocated, and on its Task End Date as closed.
        </div>
      </div>
    );
  }
  if (!agg) {
    return <div className="px-3 pb-4 pt-2 text-sm text-gray-500">No valid reporting period.</div>;
  }

  const { meta, branches, employees, groups = [] } = data;
  const { weeks, shownBuckets, nb, emp, byBranch, heads, openBr } = agg;
  const q = query.trim().toLowerCase();

  // ---- filters -------------------------------------------------------------
  const seOf = (bi) => {
    let list = byBranch[bi];
    if (seSel.size) list = list.filter((ei) => seSel.has(ei));
    if (q) {
      const bMatch = shortBranch(branches[bi]).toLowerCase().includes(q);
      if (!bMatch) list = list.filter((ei) =>
        employees[ei].n.toLowerCase().includes(q)
        || String(employees[ei].u || '').toLowerCase().includes(q));
    }
    return list;
  };
  const branchOn = (bi) => (!brSel.size || brSel.has(bi)) && seOf(bi).length > 0;

  // ---- roll-ups ------------------------------------------------------------
  const zero = () => ({ a: 0, c: 0,
    ac: new Array(nb).fill(0), cc: new Array(nb).fill(0) });
  const addSE = (t, ei) => {
    const e = emp[ei];
    t.a += e.a; t.c += e.c;
    e.ac.forEach((v, i) => { t.ac[i] += v; });
    e.cc.forEach((v, i) => { t.cc[i] += v; });
    return t;
  };
  const sumBranch = (bi) => seOf(bi).reduce((t, ei) => addSE(t, ei), zero());
  const sumBranches = (list) => list.reduce((t, bi) =>
    seOf(bi).reduce((x, ei) => addSE(x, ei), t), zero());
  // The SR Types this engineer actually has in the selection — the rows the ▶
  // opens underneath them.
  const headsOf = (ei) => heads
    .map((h, hi) => ({ h, hi, d: emp[ei].heads[hi] }))
    .filter((x) => x.d && (x.d.a > 0 || x.d.c > 0));

  // Engineers the report could place in no KALA branch. Read from the CURRENT
  // selection, not from the file as a whole: the note is about a row of THIS
  // grid, so it must not warn about an SR that the picked period (or a branch /
  // SE filter) leaves out — that row is not on screen to be corrected.
  const unmappedBi = (data.branch_ids || []).indexOf('UNMAPPED');
  const unmappedSEs = unmappedBi >= 0 && branchOn(unmappedBi) ? seOf(unmappedBi) : [];
  const unmappedTot = unmappedSEs.reduce(
    (t, ei) => ({ a: t.a + emp[ei].a, c: t.c + emp[ei].c }), { a: 0, c: 0 });

  // ---- region blocks (MH then KA) -----------------------------------------
  // The branch groups arrive in their master order, but the backend APPENDS every
  // branch that belongs to no group at the END of that list — an unknown branch
  // code (with the default MH region) therefore landed AFTER the KA groups and
  // pushed the MH Total row to the very bottom, below KA Total. Ordering the
  // visible groups by region makes each region's groups CONTIGUOUS, so its total
  // row always closes its own block; `i` keeps the master order inside a region.
  const regions = data.branch_regions || [];
  const regionOf = (bi) => (String(regions[bi] || 'MH').toUpperCase() === 'KA' ? 'KA' : 'MH');
  const REGION_ORDER = { MH: 0, KA: 1 };
  const visibleGroups = groups
    .map((g) => g.filter(branchOn))
    .filter((g) => g.length > 0)
    .map((g, i) => ({ g, i }))
    .sort((x, y) => (REGION_ORDER[regionOf(x.g[0])] - REGION_ORDER[regionOf(y.g[0])])
      || (x.i - y.i))
    .map((x) => x.g);
  const allVisible = visibleGroups.flat();
  const anyOpen = openGroups.size > 0 || openBranches.size > 0 || openSE.size > 0;
  const grand = sumBranches(allVisible);

  // ---- cells ---------------------------------------------------------------
  // A figure of zero is left BLANK — on a 31-column day-wise grid a dash in
  // every empty cell is noise, and the eye finds the numbers faster against
  // white space. (The dash still marks a MISSING label — no UID, no branch —
  // where blank would read as a hole in the row.)
  const Z = <span>-</span>;
  const numCell = (v) => (v ? v.toLocaleString('en-IN') : '');
  const cellCol = { width: gran === 'day' ? 46 : 58, minWidth: gran === 'day' ? 46 : 58 };

  // The measures every entity (engineer, SR Type, any total) is written as.
  // 'both' splits ROW-WISE — an A row (Allocated, Task Assigned Date) and a C
  // row (Closed, Task End Date) — so a date bucket is always ONE column, however
  // many measures are on screen. The label cells and the two totals belong to the
  // ENTITY, not the measure, so they merge down the A / C pair.
  // With BOTH measures on screen a CLOSURE RATE column can be added beside every
  // count column — Closed / Allocated x 100. It belongs to the bucket, not to a
  // measure, so it is ONE cell merged down the A / C pair: the two rows are the
  // numerator and the denominator, and the rate sits across from both.
  const pctOn = split === 'both' && pctMode !== 'off';
  const pctCols = pctOn && pctMode === 'all';   // a rate beside every date column
  const MEAS = split === 'both' ? ['a', 'c'] : [split === 'close' ? 'c' : 'a'];
  const RS = MEAS.length;                     // grid rows per entity
  const COL = { a: 'ac', c: 'cc' };           // which per-bucket array a row reads
  const MARK = { a: 'A', c: 'C' };
  const pctCol = { width: 44, minWidth: 44, maxWidth: 44 };
  // A rate needs something to divide by: no allocation in the bucket -> a dash,
  // never a 0 that reads as 'nothing closed'.
  const pctVal = (closed, alloc) => (alloc > 0 ? (closed / alloc) * 100 : null);
  const pctCell = (closed, alloc) => {
    const v = pctVal(closed, alloc);
    return v === null ? '' : v.toFixed(1);      // nothing to divide by -> blank
  };
  const CELL = 'px-1 py-1 text-center text-[10.5px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';

  // BOTH totals are PINNED with the label columns — they are the figures you
  // read every date column against, so they stay on screen while the dates
  // scroll. They are always shown, whichever measure the date columns carry, so
  // an SR Type row always states its Allocated AND its Closed.
  // ONE Total Task column, no separate A / C column beside it: with both measures
  // shown, an entity is written as two rows and this column carries the ALLOCATED
  // total (Task Assigned Date) on the first and the CLOSED total (Task End Date)
  // on the second. Its header is split in half to name the two, so no letter
  // column is needed. It is the figure every date column of its row is read
  // against, so it stays pinned and closes the frozen block.
  const totalCell = (t, m, key, bg) => (
    <td key={`${key}-t${m}`} className={`${CELL} font-semibold`}
      style={{ ...stick(OFF_TOT, W_TOTAL), background: bg, zIndex: 6,
        ...(pctOn ? {} : EDGE_R) }}
      title={RS === 1 ? undefined
        : (m === 'a' ? 'Allocated — counted on the Task Assigned Date'
          : 'Closed — counted on the Task End Date')}>
      {/* the letter rides IN the cell, in a fixed left gutter, so a row still
          says which measure it is once the split header has scrolled away */}
      {RS === 1 ? numCell(m === 'a' ? t.a : t.c) : (
        <div className="flex items-center gap-1">
          <span className="w-2.5 shrink-0 text-left text-[9px] font-bold">
            {MARK[m]}
          </span>
          <span className="flex-1 text-center">{numCell(m === 'a' ? t.a : t.c)}</span>
        </div>
      )}
    </td>
  );
  const totalPctCell = (t, key, bg) => (
    <td key={`${key}-tp`} rowSpan={RS}
      className={`${CELL} font-semibold align-middle`}
      style={{ ...stick(OFF_TOTP, W_PCT), background: bg, zIndex: 6, ...EDGE_R }}
      title="Closure rate for the whole period — Closed ÷ Allocated × 100">
      {pctCell(t.c, t.a)}
    </td>
  );
  // border-r on the last one: it has no neighbour to draw its right edge, so
  // scrolled fully right the table used to end on an open side. `first` is the
  // A row: the rate cell is emitted once there and merged down the pair.
  const dateCells = (t, m, key, first) => {
    const out = [];
    shownBuckets.forEach((b, k) => {
      const last = k === shownBuckets.length - 1;
      out.push(
        <td key={`${key}-${m}${b.i}`} style={cellCol}
          className={last && !pctCols ? `${CELL} border-r` : CELL}>
          {numCell(t[COL[m]][b.i])}
        </td>);
      if (pctCols && first) {
        out.push(
          <td key={`${key}-p${b.i}`} rowSpan={RS} style={pctCol}
            className={`${CELL} align-middle text-[10px]${last ? ' border-r' : ''}`}
            title="Closed ÷ Allocated × 100 for this column">
            {pctCell(t.cc[b.i], t.ac[b.i])}
          </td>);
      }
    });
    return out;
  };

  // ---- Open SR (Open SR Load Report) - BRANCH WISE ONLY -------------------
  // It has no engineer dimension, so it is ONE cell merged down the branch's
  // whole block, sitting right beside the branch it belongs to. On a totals row
  // it carries that row's own sum.
  const openOf = (bi) => openBr[bi] || 0;
  const openSum = (list) => list.reduce((n, bi) => n + openOf(bi), 0);
  const openCell = (key, rowSpan, bg, v) => (
    <td key={`${key}-op`} rowSpan={rowSpan}
      style={{ ...stick(OFF_OPEN, W_OPEN), background: bg, zIndex: 6 }}
      className={`${CELL} align-middle font-semibold !border-l-0 border-r border-gray-400`}
      title={'Open SR \u2014 every row of the Open SR Load Report, counted in the branch of'
        + ' its INSTANCE ID [Asset #] (the customer) on its SR CREATED DATE'}>
      {numCell(v)}
    </td>
  );

  // One entity -> RS <tr>s. `labelCells` are the pinned label cells (their own
  // rowSpan={RS} merges them down the pair), emitted on the first row only.
  const entityRows = (key, t, bg, labelCells, opt = {}) => MEAS.map((m, k) => {
    const cells = [
      ...(k === 0 ? labelCells : []),
      totalCell(t, m, key, bg),
      ...(pctOn && k === 0 ? [totalPctCell(t, key, bg)] : []),
      ...dateCells(t, m, key, k === 0),
    ].filter(Boolean);
    return (
      <tr key={`${key}-${m}`} className={opt.trClass} style={{ background: bg }}>
        {opt.white ? cells.map((c) => React.cloneElement(c, {
          className: `${c.props.className} !text-white${
            k === 0 && opt.cellClass ? ` ${opt.cellClass}` : ''}`,
          style: { ...(c.props.style || {}), background: bg, color: '#fff' },
        })) : cells}
      </tr>
    );
  });

  const seOpenCols = openBranches.size > 0;
  const stick = (left, w, extra = '') => ({
    position: 'sticky', left, width: w, minWidth: w, maxWidth: w, zIndex: 5, ...(extra || {}),
  });
  const OFF_BRANCH = W_GRP;
  const OFF_OPEN = W_GRP + W_BRANCH;                   // Open SR (branch wise)
  const OFF_UID = OFF_OPEN + W_OPEN;
  const OFF_NAME = OFF_UID + W_UID;
  const OFF_TOT = OFF_UID + (seOpenCols ? W_UID + W_NAME : 0);  // the ONE total
  // wider when it carries both measures, so each half of its split header fits
  const W_TOTAL = RS > 1 ? 96 : W_TOT;
  const W_PCT = 58;                     // the pinned closure-rate column —
                                        // wide enough to print its formula
  const OFF_TOTP = OFF_TOT + W_TOTAL;   // only used while pctOn
  const W_PIN_TAIL = seOpenCols ? W_UID + W_NAME : 0;
  // A totals row labels itself in the Branch column and keeps its OWN Open SR
  // cell, so these widths stop before that column.
  const W_LABEL_ALL = W_GRP + W_BRANCH;                // grand / region (from col 1)
  // (the one Total Task column is pinned separately — see totalCell)
  const W_LABEL_BR = W_BRANCH;                         // group total (arrow spans col 1)
  const W_CAPTION = W_UID + W_NAME;                    // the merged SE UID + Name caption
  // A real border, not an inset shadow — it is the divider after SE Name
  // and has to render like the rest of the grid.
  // Closes the frozen block (Branch / SE UID / SE Name / Allocated Total Task).
  // A NORMAL 1px grid line, not a heavy rule — the soft drop shadow is what
  // signals the freeze, so a dark border on top of it read as a black bar.
  // The inset lines repeat the .pms-grid hairlines: an inline boxShadow
  // replaces the CSS one, so they have to be carried here too.
  const EDGE_R = { borderRight: `1px solid ${GRID.div}`,
    boxShadow: `inset -1px 0 0 0 ${GRID.div}, inset 0 -1px 0 0 ${GRID.line},`
      + ' 2px 0 5px -2px var(--pms-edge-shadow)' };
  const GRP_A = C_GRP_A, GRP_B = C_GRP_B;              // group column, per group

  const toggle = (setter) => (key) => setter((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const toggleGroup = toggle(setOpenGroups);
  const toggleBranch = toggle(setOpenBranches);
  const toggleSE = toggle(setOpenSE);

  // ---- rows ----------------------------------------------------------------
  const rows = [];
  // key: it is handed back inside an array of label cells, so React needs one
  const branchCell = (bi, label, meta2, rowSpan, open, onClick, bg) => (
    <td key={`br${bi}`} rowSpan={rowSpan} onClick={onClick} title={branches[bi]}
      style={{ ...stick(OFF_BRANCH, W_BRANCH), background: bg || GRID.bandA, zIndex: 6 }}
      className="px-1.5 py-1.5 text-left text-[10.5px] font-semibold text-black border-b border-r border-gray-400 align-middle cursor-pointer pms-hover leading-tight">
      {/* The arrow's width is ALWAYS reserved, even on a row that has none
          (a collapsed group). Rendering it conditionally left those branch
          names flush while the others were pushed right by 12px, so the
          column read as a ragged edge instead of one line. */}
      {/* the column is tight, so the name ellipsizes on ONE line — the td's
          title already carries the full branch name for the hover */}
      <div className="flex items-center">
        <span className={`inline-block w-3 shrink-0 text-[8px] text-gray-600 transition-transform ${open ? 'rotate-90' : ''}`}>
          {open !== null ? '▶' : ''}
        </span>
        <span className="truncate">{label}</span>
      </div>
      {meta2 && <span className="block mt-0.5 pl-3 text-[8.5px] font-normal text-gray-600">{meta2}</span>}
    </td>
  );
  // A collapsed row has no engineer of its own, so its SE UID + SE Name columns
  // merge into ONE labelled cell rather than showing two blank dashes: a run of
  // blank white cells reads as a hole in the grid the moment the browser drops
  // the 1px hairlines (zoomed out, fractional display scaling).
  const pinLabel = (text, keyBase, bg) => (seOpenCols ? [
    <td key={`${keyBase}-pl`} colSpan={2} rowSpan={RS}
      style={{ position: 'sticky', left: OFF_UID, zIndex: 6, background: bg,
        width: W_UID + W_NAME, minWidth: W_UID + W_NAME, maxWidth: W_UID + W_NAME,
        ...EDGE_R }}
      className="px-1.5 py-1 text-center align-middle text-[10px] text-black border-b border-gray-400">
      {text}
    </td>,
  ] : []);

  // An SR Type row belongs to the engineer above it, so it keeps BOTH pinned
  // columns: the SE UID column carries the caption, the SE Name column the type
  // itself — plain text, indented under the engineer's name. The caption is ONE
  // merged cell down the engineer's whole block (span, on its first row only).
  // Its tint is deliberately outside the row palette: the cell it meets above
  // is an engineer's UID and below a Sub Total, and it has to read apart from
  // both even when the browser drops the 1px rules.
  // The SR Type block is ONE flat colour — caption cell, name cell and every
  // date column alike — so it reads as a single sub-section under its engineer
  // and stands apart from the grey engineer rows.
  const TYPE_BG = C_TYPE;
  const typeCells = (type, keyBase, bg, span) => (seOpenCols ? [
    ...(span ? [
      <td key={`${keyBase}-tu`} rowSpan={span}
        style={{ ...stick(OFF_UID, W_UID), background: TYPE_BG, zIndex: 6 }}
        className="px-1 py-1 text-center align-middle text-[9px] text-black border-b border-r border-gray-400">
        SR Type
      </td>] : []),
    <td key={`${keyBase}-tn`} rowSpan={RS}
      style={{ ...stick(OFF_NAME, W_NAME), background: bg, ...EDGE_R }}
      className="pl-6 pr-1 py-1 text-left align-middle text-[10.5px] text-black border-b border-gray-400">
      <div className="truncate" title={type}>{type}</div>
    </td>,
  ] : []);
  // uid + name pair. `arrow` turns the name cell into the SR Type toggle.
  const uidNameCells = (uid, name, keyBase, bg, opt = {}) => (seOpenCols ? [
    <td key={`${keyBase}-u`} rowSpan={RS} style={{ ...stick(OFF_UID, W_UID), background: bg }}
      className="px-1 py-1 text-center align-middle text-[9.5px] text-black tabular-nums border-b border-r border-gray-400">
      <div className="truncate" title={uid || undefined}>{uid || Z}</div>
    </td>,
    <td key={`${keyBase}-n`} rowSpan={RS} onClick={opt.onClick}
      style={{ ...stick(OFF_NAME, W_NAME), background: bg, ...EDGE_R }}
      className={`px-1 py-1 text-left align-middle text-[10.5px] text-black border-b border-gray-400 ${
        opt.onClick ? 'cursor-pointer pms-hover' : ''}`}>
      <div className="flex items-center gap-1">
        {opt.arrow !== undefined && (
          <span className={`inline-block w-2.5 shrink-0 text-[8px] text-gray-600 transition-transform ${
            opt.arrow ? 'rotate-90' : ''}`}>▶</span>
        )}
        <span className="truncate" title={name || undefined}>{name || Z}</span>
      </div>
    </td>,
  ] : []);

  // The group column is ONE merged cell spanning every row of the group, with
  // the arrow centred in it. Emitted on the group's first row only — the count
  // below must match the rows actually pushed or the sticky columns drift.
  const grpTd = (key, gi, single, rowSpan, opened) => (
    <td key={key} rowSpan={rowSpan} onClick={single ? undefined : () => toggleGroup(gi)}
      // alternating tints: a constant colour made consecutive groups read as one
      // unbroken strip as soon as the 1px rules stopped painting
      style={{ ...stick(0, W_GRP), background: gi % 2 ? GRP_B : GRP_A, zIndex: 6 }}
      className={`text-center align-middle border-b border-r border-gray-400 ${single ? '' : 'cursor-pointer pms-hover'}`}>
      {!single && (
        <span className={`inline-block text-[11px] font-bold text-gray-700 transition-transform ${opened ? 'rotate-90' : ''}`}>▶</span>
      )}
    </td>
  );
  // Rows one branch contributes: its engineers, their opened SR Type rows and
  // the Sub Total — or a single row when the branch itself is collapsed.
  const branchRowCount = (bi) => (openBranches.has(bi)
    ? seOf(bi).reduce((n, ei) => n + 1 + (openSE.has(ei) ? headsOf(ei).length : 0), 0) + 1
    : 1);

  // Every pinned block used to be one flat colour — white branch cells, a grey
  // group strip — so wherever two of them met, the only thing separating them
  // was a 1px rule. Zoomed out or on a fractional-DPI screen the browser drops
  // those rules and the blocks merge into one featureless slab. Alternating
  // tints (the engineer rows already did this) keep every block separable no
  // matter how the hairlines render.
  // ONE counter for every block in the Branch Name column — collapsed rows AND
  // the tall cell of an expanded branch. Two separate counters could hand the
  // same tint to two adjacent blocks, which is exactly when the column looked
  // like it had lost its rule.
  const BAND_A = C_BAND_A, BAND_B = C_BAND_B;
  let band = 0;
  const bandBg = () => ((band++ % 2) ? BAND_B : BAND_A);

  const renderGroup = (g, gi) => {
    const single = g.length === 1;
    const open = single || openGroups.has(gi);

    if (!open) {
      const bg = bandBg();
      rows.push(...entityRows(`g${gi}`, sumBranches(g), bg, [
        grpTd(`g${gi}c`, gi, single, RS, false),
        branchCell(g[0], shortBranch(branches[g[0]]), `+${g.length - 1} BR`, RS, null,
          () => toggleGroup(gi), bg),
        openCell(`g${gi}`, RS, bg, openSum(g)),
        ...pinLabel('Group Total', `g${gi}`, bg),
      ]));
      return;
    }

    // rowSpans are in GRID rows, so an entity count multiplies by RS
    const groupSpan = (g.reduce((n, bi) => n + branchRowCount(bi), 0)
      + (single ? 0 : 1)) * RS;
    let firstRow = true;
    const gcell = (key) => {
      if (!firstRow) return null;
      firstRow = false;
      return grpTd(key, gi, single, groupSpan, true);
    };

    g.forEach((bi) => {
      const bOpen = openBranches.has(bi);
      const ses = seOf(bi);
      const bTot = sumBranch(bi);
      const seLabel = `${ses.length} SE${ses.length > 1 ? 's' : ''}`;

      if (!bOpen) {
        const bg = bandBg();
        rows.push(...entityRows(`b${bi}`, bTot, bg, [
          gcell(`b${bi}c`),
          branchCell(bi, shortBranch(branches[bi]), seLabel, RS, false,
            () => toggleBranch(bi), bg),
          openCell(`b${bi}`, RS, bg, openOf(bi)),
          ...pinLabel('Branch Total', `b${bi}`, bg),
        ]));
        return;
      }

      const span = branchRowCount(bi) * RS;
      const brBg = bandBg();         // shares the counter above, so the whole
                                     // Branch Name column strictly alternates
      // Engineer rows alternate the two palest blues; their SR Type rows are one
      // flat deeper blue, so an expanded block is identifiable at a glance.
      ses.forEach((ei, i) => {
        const hs = headsOf(ei);
        const opened = openSE.has(ei);
        // An engineer whose SR Type dropdown is OPEN — or who was picked in the
        // SE filter — gets the strongest blue in the block, so the row heading
        // the SR Type rows underneath it is unmistakable.
        const hilite = opened || seSel.has(ei);
        // The tint comes from the engineer's POSITION in the branch, never from a
        // running counter: a counter that only advanced on un-highlighted rows
        // let a highlighted engineer consume no slot, so every row below it
        // flipped parity and two whites (or two blues) ended up adjacent.
        const bg = hilite ? C_SEL : (i % 2 ? C_ROW_B : C_ROW_A);
        rows.push(...entityRows(`b${bi}e${ei}`, emp[ei], bg, [
          gcell(`b${bi}e${ei}c`),
          i === 0 && branchCell(bi, shortBranch(branches[bi]), seLabel,
            span, true, () => toggleBranch(bi), brBg),
          i === 0 && openCell(`b${bi}`, span, brBg, openOf(bi)),
          ...uidNameCells(employees[ei].u, employees[ei].n, `b${bi}e${ei}`, bg,
            { arrow: hs.length ? opened : undefined,
              onClick: hs.length ? () => toggleSE(ei) : undefined }),
        ], { trClass: hilite ? 'font-semibold' : undefined }));
        // ROW-WISE SR Type bifurcation, one entity per type the engineer has.
        if (opened) {
          hs.forEach(({ h, hi, d }) => {
            // an SR Type row has no UID of its own, so the SE UID column carries
            // the caption and the SE Name column the type name
            const cbg = TYPE_BG;
            rows.push(...entityRows(`b${bi}e${ei}h${hi}`, d, cbg, [
              gcell(`b${bi}e${ei}h${hi}c`),
              ...typeCells(h, `b${bi}e${ei}h${hi}`, cbg,
                hi === hs[0].hi ? hs.length * RS : 0),
            ]));
          });
        }
      });
      rows.push(...entityRows(`b${bi}tot`, bTot, C_SUBTOT, [
        gcell(`b${bi}totc`),
        <td key={`b${bi}tot-l`} colSpan={2} rowSpan={RS}
          style={{ position: 'sticky', left: OFF_UID, zIndex: 6,
            width: W_UID + W_NAME, minWidth: W_UID + W_NAME, maxWidth: W_UID + W_NAME,
            background: C_SUBTOT, ...EDGE_R }}
          className="px-1.5 py-1 text-center align-middle text-[10.5px] text-black border-b border-gray-400">
          Sub Total
        </td>,
      ], { trClass: 'font-bold' }));
    });

    if (!single) {
      rows.push(...entityRows(`g${gi}tot`, sumBranches(g), C_GRPTOT, [
        gcell(`g${gi}totc`),
        <td key={`g${gi}tot-l`} rowSpan={RS}
          style={{ position: 'sticky', left: OFF_BRANCH, zIndex: 6,
            width: W_LABEL_BR, minWidth: W_LABEL_BR, maxWidth: W_LABEL_BR,
            background: C_GRPTOT }}
          className="px-1.5 py-1.5 text-center align-middle text-[11px] text-black border-y border-r border-gray-400">
          Sub Total
        </td>,
        openCell(`g${gi}tot`, RS, C_GRPTOT, openSum(g)),
        ...(seOpenCols ? [
          <td key={`g${gi}tot-c`} colSpan={2} rowSpan={RS}
            style={{ position: 'sticky', left: OFF_UID, zIndex: 6,
              width: W_CAPTION, minWidth: W_CAPTION, maxWidth: W_CAPTION,
              background: C_GRPTOT, ...EDGE_R }}
            className="px-1.5 py-1 text-center align-middle text-[10px] text-black border-y border-gray-400">
            {g.length} branches
          </td>] : []),
      ], { trClass: 'font-bold' }));
    }
  };

  // ---- MH / KA total rows --------------------------------------------------
  // A region roll-up after the LAST group of that region: MH closes right after
  // the Ahilyanagar group (the last MH row the backend sends), KA at the very
  // bottom, immediately above the Grand Total. Read off branch_regions, so a new
  // branch lands in its own region's total without touching this file.
  const regionAt = (gi) => regionOf(visibleGroups[gi][0]);
  const lastOfRegion = {};
  visibleGroups.forEach((g, gi) => { lastOfRegion[regionAt(gi)] = gi; });
  const regionRows = (rg) => {
    const list = allVisible.filter((bi) => regionOf(bi) === rg);
    if (!list.length) return [];
    return entityRows(`rg${rg}`, sumBranches(list), C_REGION, [
      /* every pinned label column merged into one centred cell, like Grand
         Total — the group arrow column included, so it starts at left: 0
         (both totals are pinned separately, in totalCells) */
      <td key={`rg${rg}-l`} colSpan={2} rowSpan={RS}
        style={{ position: 'sticky', left: 0, zIndex: 6,
          width: W_LABEL_ALL, minWidth: W_LABEL_ALL, maxWidth: W_LABEL_ALL,
          background: C_REGION }}
        className="px-1.5 py-1.5 text-center align-middle text-[11px] border-y border-r border-gray-400">
        {rg} Total
      </td>,
      openCell(`rg${rg}`, RS, C_REGION, openSum(list)),
      ...(seOpenCols ? [
        <td key={`rg${rg}-c`} colSpan={2} rowSpan={RS}
          style={{ position: 'sticky', left: OFF_UID, zIndex: 6,
            width: W_CAPTION, minWidth: W_CAPTION, maxWidth: W_CAPTION,
            background: C_REGION, ...EDGE_R }}
          className="px-1.5 py-1 text-center align-middle text-[10px] border-y border-gray-400">
          {list.length} branch{list.length === 1 ? '' : 'es'}
        </td>] : []),
    ], { trClass: 'font-bold text-white', white: true });
  };

  visibleGroups.forEach((g, gi) => {
    renderGroup(g, gi);
    if (lastOfRegion[regionAt(gi)] === gi) rows.push(...regionRows(regionAt(gi)));
  });

  const colCount = 1 + 1 + 1 + (seOpenCols ? 2 : 0) + 1 + (pctOn ? 1 : 0)
    + shownBuckets.length * (pctCols ? 2 : 1);

  // ---- header --------------------------------------------------------------
  const thBase = 'px-1.5 py-1.5 text-[9.5px] font-semibold text-black text-center border-b border-l border-gray-400 whitespace-nowrap';
  const grpTh = 'px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-black text-center border-b border-l border-gray-400 whitespace-nowrap';
  // every header cell carries the SAME grey, applied inline
  const HB = { background: C_HEAD };
  const granLabel = (GRANS.find((x) => x.v === gran) || GRANS[0]).t;
  const bandTitle = split === 'alloc'
    ? `SR Allocated Based on Task Assigned Date — ${granLabel}`
    : split === 'close'
      ? `SR Closed Based on Task End Date — ${granLabel}`
      : `A = Allocated Based on Assigned Date · C = Closed Based on Task End Date${
        pctCols ? ' · % = C ÷ A × 100 beside each column' : ''} — ${granLabel}`;

  // ---- export --------------------------------------------------------------
  // The workbook is the table: a blue ERP band carrying the selected period,
  // the two grouped header rows, branch → engineer → SR Type → Sub Total and
  // the dark Grand Total row. Every engineer's SR Type rows are written whether
  // or not their ▶ is open on screen, the same way the sheet always lists the
  // engineers of a collapsed branch.
  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    // Two frames: one to paint the button's spinner, one so the browser has
    // actually finished that paint before the main thread is taken.
    await new Promise((res) => { requestAnimationFrame(() => requestAnimationFrame(res)); });
    try {
      const _ex = await import('exceljs');
      const ExcelJS = _ex.default || _ex;

      // the light-blue GRID set, mirroring the screen. Spelled out as hex here
      // because exceljs wants ARGB strings, not CSS colours.
      const BRAND = '2F3192', GRPHEAD = 'E8F3FC', SUBHEAD = 'E8F3FC', GRIDLINE = '9FC0DF',
        SE_A = 'FBFDFF', SE_B = 'F1F8FE', CHILD = 'E4F0FB', BTOT = 'DCEBF9',
        GTOT = 'CBE1F5', REGTOT = '5E8FC2';
      const A = (hex) => ({ argb: `FF${hex}` });
      const thin = { style: 'thin', color: A(GRIDLINE) };
      const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
      // A day-wise sheet with the rate columns is ~70 columns x ~1,500 rows —
      // near 100k cells. Building a fresh fill / font object for each one is
      // what made the click feel like a freeze, so every distinct style is
      // built ONCE and shared; exceljs collapses shared references into one
      // style record on write, so the file is smaller too.
      const _fills = new Map();
      const fill = (hex) => {
        let f = _fills.get(hex);
        if (!f) {
          f = { type: 'pattern', pattern: 'solid', fgColor: A(hex) };
          _fills.set(hex, f);
        }
        return f;
      };
      const _fonts = new Map();
      const font = (o) => {
        const key = `${o.bold ? 'b' : ''}|${o.color ? o.color.argb : ''}`;
        let f = _fonts.get(key);
        if (!f) { f = { size: 10, ...o }; _fonts.set(key, f); }
        return f;
      };
      // indent 1: Excel has NO cell padding, so left-aligned text sits hard
      // against the cell border unless it is indented. One character of indent
      // is what makes a name column read as a column and not as a wall.
      const CENTER = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const LEFT = { horizontal: 'left', vertical: 'middle', indent: 1 };
      const MIDDLE = { vertical: 'middle' };
      // Zeros stay real NUMBERS (so the columns still add up and chart) but
      // print as an empty cell, exactly like the screen.
      const F_CNT = '#,##0;-#,##0;""';
      const F_PCT = '0.0;-0.0;"";""';          // the 4th part covers a blank cell
      const N = (v) => Number(v) || 0;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'KALA Care Global LLP';
      const ws = wb.addWorksheet('SR Allocation', {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        // Excel's default row is tight enough that a grid this dense reads as
        // one slab; a couple of points of air makes the rows separable on
        // screen and in print.
        properties: { defaultRowHeight: 16 },
      });
      const ROW_H = 16;
      // No frozen panes and no row grouping: the sheet opens flat with every
      // column visible.

      // ---- column widths, MEASURED from what is actually written ----------
      // Fixed widths guessed up front cannot know that this period has a
      // five-digit task count or a 24-character engineer name, so the sheet
      // used to open cramped — values hard against the borders, a wide number
      // one digit away from '####'. Every cell reports its printed size instead
      // and each column takes the widest thing in it plus a couple of
      // characters of air (setColWidths, after the last row is written).
      // Two array writes per cell, so it costs nothing on the ~100k-cell sheet.
      const wCol = [], padCol = [];
      const bump = (c, n) => { if (!(wCol[c] >= n)) wCol[c] = n; };
      // printed length under the '#,##0' formats: digits + thousands separators
      const numW = (v) => {
        const d = String(Math.abs(Math.round(v))).length;
        return d + Math.floor((d - 1) / 3) + (v < 0 ? 1 : 0);
      };
      const measure = (c, v, o) => {
        // an aligned-left column also carries an indent, so it needs one more
        // character than its text
        if (o.align && o.align.horizontal && o.align.horizontal !== 'center') padCol[c] = 3;
        if (v === '' || v === null || v === undefined) return;
        if (typeof v === 'number') { bump(c, numW(v)); return; }
        const t = String(v);
        // A HEADER wraps, so only its longest WORD has to fit on one line;
        // ordinary text has to fit whole. That keeps a two-line date title from
        // widening its column to the whole caption.
        if (o.hdr) t.split(/[\s]+/).forEach((w) => bump(c, w.length));
        else bump(c, t.length);
      };
      const setColWidths = (last) => {
        const MINW = 8, MAXW = 34;
        for (let c = 1; c <= last; c++) {
          const w = Math.min(MAXW, Math.max(MINW, (wCol[c] || 0) + (padCol[c] || 2)));
          // exceljs OMITS a <col> whose width is exactly 9 (its own default) and
          // Excel then falls back to ITS default, 8.43 — narrower than measured.
          // A hair over keeps the entry, so the column is the width computed.
          ws.getColumn(c).width = w === 9 ? 9.1 : w;
        }
      };

      const put = (r, c, v, o = {}) => {
        const cl = ws.getCell(r, c);
        cl.value = v === null || v === undefined ? '' : v;
        cl.border = BORDER;
        cl.font = font(o.font || {});
        if (o.fill) cl.fill = fill(o.fill);
        cl.alignment = o.align || MIDDLE;
        if (o.fmt) cl.numFmt = o.fmt;
        measure(c, v, o);
        return cl;
      };

      // Both totals, the A / C marker ('Both' only), then one column per date
      // bucket — the sheet mirrors the screen, so A and C are ROWS, not columns.
      const C_BR = 1, C_OPEN = 2, C_UID = 3, C_NAME = 4;
      const C_AC = 5;                        // only written when RS > 1
      const C_TOT = RS > 1 ? 6 : 5;          // ONE total, read per row
      const C_TOTP = C_TOT + 1;              // its closure rate (pctOn only)
      const C_D0 = C_TOT + (pctOn ? 2 : 1);
      const STEP = pctCols ? 2 : 1;          // count column + its rate column
      const dcol = (k) => C_D0 + k * STEP;
      const LAST = C_D0 + shownBuckets.length * STEP - 1;
      // ---- row 1: the blue ERP band with the selected period ----
      for (let c = 1; c <= LAST; c++) put(1, c, '', { fill: BRAND });
      const tick = [];
      if (weekSel.size) tick.push(`${weekSel.size} of ${weeks.length} weeks`);
      if (daySel.size) tick.push(`${daySel.size} days ticked`);
      if (monthSel.size) tick.push(`${monthSel.size} months ticked`);
      // WHAT WAS EXPORTED: the sheet carries ONLY the rows the filters leave on
      // screen — it is written from visibleGroups / seOf, the very sets the
      // table renders — so the band names the Branch / SE selection behind it.
      // A saved file can then be read back without guessing what produced it.
      const SEP = '   \u00b7   ';
      const pick = (sel, label, name) => (!sel.size ? ''
        : SEP + label + ': ' + (sel.size <= 3
          ? [...sel].map(name).join(', ') : `${sel.size} selected`));
      const brTxt = pick(brSel, 'Branch', (bi) => shortBranch(branches[bi]));
      const seTxt = pick(seSel, 'SE', (ei) => employees[ei].n);
      ws.getCell(1, 1).value = 'Service Engineer Performance Based on Task End'
        + '   ·   EFSR: Allocated Based on Task Assigned Date,'
        + ' Closed Based on Task End Date   ·   '
        + `${fmtD(start)} → ${fmtD(end)} (${inclDays(start, end)} days)   ·   ${granLabel}`
        + `   ·   date columns: ${(SPLITS.find((s) => s.v === split) || SPLITS[0]).t}`
        + (tick.length ? `   ·   ${tick.join(' · ')}` : '')
        + brTxt + seTxt
        + (q ? `   ·   Filter: ${q}` : '');
      ws.getCell(1, 1).font = { size: 12, bold: true, color: A('FFFFFF') };
      ws.getCell(1, 1).alignment = LEFT;
      ws.mergeCells(1, 1, 1, LAST);
      ws.getRow(1).height = 22;

      // ---- rows 2-3: the two grouped header rows ----
      // hdr: measured by longest WORD, since a header cell wraps (see measure)
      const HD = { font: { bold: true, color: A('111827') }, fill: SUBHEAD, align: CENTER, hdr: true };
      const GH = { font: { bold: true, color: A('111827') }, fill: GRPHEAD, align: CENTER, hdr: true };
      const tall = (c, text) => { put(2, c, text, HD); put(3, c, '', HD); ws.mergeCells(2, c, 3, c); };
      tall(C_BR, 'Branch Name');
      tall(C_OPEN, 'Open SR');
      tall(C_UID, 'SE UID');
      tall(C_NAME, 'SE Name / SR Type');
      if (RS > 1) tall(C_AC, 'A / C');
      tall(C_TOT, split === 'alloc' ? 'Allocated Total Task'
        : split === 'close' ? 'Closed Total Task' : 'Total Task (A / C)');
      if (pctOn) tall(C_TOTP, '% Closed');
      if (shownBuckets.length) {
        for (let c = C_D0; c <= LAST; c++) put(2, c, '', GH);
        ws.getCell(2, C_D0).value = bandTitle;
        if (LAST > C_D0) ws.mergeCells(2, C_D0, 2, LAST);
        shownBuckets.forEach((b, k) => put(3, dcol(k),
          b.sub ? `${b.label}\n${b.sub}` : b.label, HD));
        if (pctCols) shownBuckets.forEach((_b, k) => put(3, dcol(k) + 1, '%', HD));
      }
      ws.getRow(2).height = 20;
      ws.getRow(3).height = 34;

      let r = 4;
      // ONE entity -> RS sheet rows (an A row and a C row when both measures are
      // shown). The label columns and the two totals are entity-level, so they
      // are written on the first row and MERGED down the pair — the same reading
      // as the screen, and nothing is repeated.
      //   opt.br           text for the Branch Name column (totals rows)
      //   opt.mergeBr      merge Branch Name down the pair (rows outside a
      //                    branch block, whose column is merged separately)
      //   opt.mergeUid     false while an outer merge already covers SE UID
      // The per-cell option objects are built ONCE per entity, not per cell:
      // spreading `o` inside the column loops allocated a fresh object for every
      // one of the sheet's ~100k cells, which is most of what the export spent
      // its time on.
      const entity = (t, o, opt = {}) => {
        const bold = font({ ...(o.font || {}), bold: true });
        const oLeft = { ...o, align: LEFT };
        const oCent = { ...o, align: CENTER };
        const oCnt = { ...o, align: CENTER, fmt: F_CNT };
        const oCntB = { ...oCnt, font: bold };
        const oPctB = { ...o, align: CENTER, fmt: F_PCT, font: bold };
        const oPct = { ...o, align: CENTER, fmt: F_PCT };
        const pv = (cl, al) => (al > 0 ? +((cl / al) * 100).toFixed(1) : null);
        const r0 = r;
        MEAS.forEach((m, k) => {
          const first = k === 0;
          put(r, C_BR, first ? (opt.br || '') : '', oLeft);
          // branch wise: written once, then merged down the pair / the block
          put(r, C_OPEN, first && opt.open !== undefined ? N(opt.open) : '', oCntB);
          put(r, C_UID, first ? (opt.uid || '') : '', oCent);
          put(r, C_NAME, first ? (opt.name || '') : '', oLeft);
          if (RS > 1) put(r, C_AC, MARK[m], { ...oCent, font: bold });
          // the total belongs to the ROW's measure, so it is never merged down
          put(r, C_TOT, N(m === 'a' ? t.a : t.c), oCntB);
          shownBuckets.forEach((b, k2) => put(r, dcol(k2), N(t[COL[m]][b.i]), oCnt));
          // The RATE belongs to the bucket, not to a measure: a real number
          // (one decimal, blank when there was nothing to divide by), written on
          // the first row and merged down the pair below — as on screen.
          if (pctOn) {
            put(r, C_TOTP, first ? pv(t.c, t.a) : null, oPctB);
            if (pctCols) {
              shownBuckets.forEach((b, k2) => put(r, dcol(k2) + 1,
                first ? pv(t.cc[b.i], t.ac[b.i]) : null, oPct));
            }
          }
          ws.getRow(r).height = ROW_H;
          r += 1;
        });
        if (RS > 1) {
          const cols = [C_NAME];
          if (opt.mergeUid !== false) cols.push(C_UID);
          if (opt.mergeBr) cols.push(C_BR, C_OPEN);
          // every rate column spans the A / C pair, exactly like the screen
          if (pctOn) {
            cols.push(C_TOTP);
            if (pctCols) shownBuckets.forEach((_b, k2) => cols.push(dcol(k2) + 1));
          }
          cols.forEach((c) => ws.mergeCells(r0, c, r - 1, c));
        }
        return r0;
      };

      // Writing ~100k cells takes a few seconds whatever we do, so the loop
      // hands the main thread back every few branches: the spinner keeps
      // turning and the page stays alive instead of looking frozen.
      const breathe = () => new Promise((res) => { setTimeout(res, 0); });
      for (let gi = 0; gi < visibleGroups.length; gi += 1) {
        const g = visibleGroups[gi];
        const single = g.length === 1;
        for (const bi of g) {          // eslint-disable-line no-restricted-syntax
          const ses = seOf(bi);
          const rFirst = r;
          ses.forEach((ei, i) => {
            const bg = i % 2 ? SE_B : SE_A;
            const r0 = entity(emp[ei], { fill: bg },
              { uid: employees[ei].u || '', name: employees[ei].n });
            // the branch name goes on the first row of the block and is merged
            // down it below, so it keeps a plain background like the screen
            if (i === 0) {
              put(r0, C_BR, shortBranch(branches[bi]), { align: LEFT, font: { bold: true } });
              put(r0, C_OPEN, N(openOf(bi)),
                  { align: CENTER, fmt: F_CNT, font: { bold: true } });
            }
            // The 'SR Type' caption is ONE merged cell down the engineer's type
            // block, exactly like the screen — repeated on every row it read as
            // noise instead of a column heading for the block.
            const hs = headsOf(ei);
            const rType0 = r;
            hs.forEach(({ h, d }, k) => {
              entity(d, { fill: CHILD },
                { uid: k === 0 ? 'SR Type' : '', name: `    ${h}`, mergeUid: false });
            });
            // a 1x1 merge is invalid, so a single type row just keeps its label
            if (r - 1 > rType0) ws.mergeCells(rType0, C_UID, r - 1, C_UID);
          });
          entity(sumBranch(bi), { fill: BTOT, font: { bold: true } },
            { name: `Sub Total (${ses.length} SE${ses.length === 1 ? '' : 's'})` });
          if (r - 1 > rFirst) {
            ws.mergeCells(rFirst, C_BR, r - 1, C_BR);
            ws.mergeCells(rFirst, C_OPEN, r - 1, C_OPEN);   // one branch, one count
          }
          await breathe();             // eslint-disable-line no-await-in-loop
        }
        if (!single) {
          entity(sumBranches(g), { fill: GTOT, font: { bold: true } },
            { br: 'Sub Total', name: `${g.length} branches`, mergeBr: true,
              open: openSum(g) });
        }
        // the region roll-up, in the same place as on screen: MH after its last
        // group (Ahilyanagar), KA at the bottom just above the Grand Total
        if (lastOfRegion[regionAt(gi)] === gi) {
          const rg = regionAt(gi);
          const list = allVisible.filter((bi) => regionOf(bi) === rg);
          if (list.length) {
            entity(sumBranches(list), { fill: REGTOT, font: { bold: true, color: A('FFFFFF') } },
              { br: `${rg} Total`, open: openSum(list),
                name: `${list.length} branch${list.length === 1 ? '' : 'es'}`, mergeBr: true });
          }
        }
      }

      const rGrand = entity(grand, { fill: BRAND, font: { bold: true, color: A('FFFFFF') } },
        { br: 'Grand Total', name: 'All branches', mergeBr: true,
          open: openSum(allVisible) });
      for (let k = rGrand; k < r; k++) ws.getRow(k).height = 20;

      // every cell is written, so the columns can now size themselves
      setColWidths(LAST);

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `PMS_SR_Allocation_${start}_to_${end}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('SR Allocation exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const seItems = [];
  branches.forEach((b, bi) => {
    if (brSel.size && !brSel.has(bi)) return;
    byBranch[bi].forEach((ei) => seItems.push({ v: ei, t: employees[ei].n, sub: shortBranch(b) }));
  });
  seItems.sort((a, b) => a.t.localeCompare(b.t));
  const dayItems = [];
  for (let ds = start; ds <= end; ds = addDays(ds, 1)) {
    dayItems.push({ v: ds, t: fmtD(ds), sub: DOW[pd(ds).getDay()] });
  }
  // the months the period touches — the tick list of the Month wise columns
  const monthItems = [];
  for (let cur = `${start.slice(0, 7)}-01`; cur && cur <= end;) {
    const d0 = pd(cur);
    monthItems.push({ v: cur.slice(0, 7), t: fmtM(cur) });
    cur = iso(new Date(d0.getFullYear(), d0.getMonth() + 1, 1));
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* ---- title bar: TWO rows. The title and its period line share the
           first one; EVERY filter control sits on the second, so a report with
           many controls no longer squeezes the title into a narrow column. ---- */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
        {/* items-baseline: the small grey period line sits ON the title's
            baseline rather than floating at its mid-height */}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className="text-sm font-extrabold text-gray-900">Service Engineer Performance Based on Task End</p>
          <p className="text-[10px] text-gray-400">
            {fmtD(start)} → {fmtD(end)} · {nb} {gran} column{nb > 1 ? 's' : ''}
            {weekSel.size ? ` · ${weekSel.size} week${weekSel.size > 1 ? 's' : ''} ticked` : ''}
            {daySel.size ? ` · ${daySel.size} day${daySel.size > 1 ? 's' : ''} ticked` : ''}
            {monthSel.size ? ` · ${monthSel.size} month${monthSel.size > 1 ? 's' : ''} ticked` : ''}
          </p>
        </div>
        {/* every filter / toggle / export control, pushed to the RIGHT edge
            under the title. FilterRow keeps them on ONE line by narrowing the
            SEARCH BOX when they would spill (see index.css) — watch = everything
            that changes the row's WIDTH: the granularity (which tick filter is
            shown), the split ('% Closed' exists on Both only), a label growing
            ('Expand all' -> 'Collapse all'), a count replacing 'All'. */}
        <FilterRow watch={`${gran}-${split}-${pctMode}-${anyOpen}-${exporting}`
          + `-${brSel.size}-${seSel.size}-${weekSel.size}-${daySel.size}-${monthSel.size}`}>
          {/* Column granularity — Day / Week / Month */}
          {/* One toggle for the whole tree: it reads the state, so it says
              Collapse while anything is open and Expand while everything is shut.
              It opens groups and branches down to the ENGINEER rows (an engineer's own SR Type rows stay on their own arrow). */}
          <button onClick={() => {
            if (anyOpen) {
              setOpenGroups(new Set());
              setOpenBranches(new Set());
              setOpenSE(new Set());
            } else {
              setOpenGroups(new Set(visibleGroups.map((_g, i) => i)));
              setOpenBranches(new Set(allVisible));
            }
          }}
            title={anyOpen ? 'Fold every group and branch back'
              : 'Open every group and branch down to the engineer rows'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              anyOpen ? 'text-white border-[#2f3192]' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
            style={anyOpen ? { backgroundColor: THEME } : {}}>
            <span className={`text-[8px] transition-transform ${anyOpen ? 'rotate-90' : ''}`}>▶</span>
            {anyOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <SingleSelect label="Columns" items={GRANS} value={gran} onChange={setGranPick} />
          {/* What the date columns carry — the two totals are always both shown */}
          <SingleSelect label="Date split" items={SPLITS} value={split} onChange={setSplit} />
          {/* The rate needs both measures to divide, so it only exists on 'Both'
              — and turning the split away from it puts the rate away too. */}
          {split === 'both' && (
            <SingleSelect label="% Closed" items={PCT_MODES} value={pctMode}
              onChange={setPctMode} />
          )}

          {/* ONE tick filter, the one that matches the date columns on screen:
              Day wise → Days, Week wise → Weeks, Month wise → Months. */}
          {gran === 'day' && (
            <MultiSelect label="Days" selected={daySel} onChange={setDaySel} items={dayItems} />
          )}
          {gran === 'week' && (
            <MultiSelect label="Weeks" searchable={false} selected={weekSel} onChange={setWeekSel}
              items={weeks.map((w) => ({ v: w.n, t: w.label, sub: w.range }))} />
          )}
          {gran === 'month' && (
            <MultiSelect label="Months" searchable={false} selected={monthSel} onChange={setMonthSel}
              items={monthItems} />
          )}
          <MultiSelect label="Branch" selected={brSel} onChange={(s) => { setBrSel(s); setSeSel(new Set()); }}
            items={branches.map((b, bi) => ({ v: bi, t: shortBranch(b), sub: data.branch_ids[bi] }))} />
          <MultiSelect label="SE" selected={seSel} onChange={setSeSel} items={seItems} align="right" />

          {/* pms-search: the ONE control in the row that flexes — it gives
              width back instead of letting the buttons squash (index.css) */}
          <div className="relative pms-search">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter branch or SE"
              className="border border-gray-300 rounded-lg pl-7 pr-2.5 py-1.5 text-xs bg-white text-gray-800 focus:outline-none focus:ring-1"
              style={{ '--tw-ring-color': THEME }} />
          </div>

          {canExportExcel() && (
            <button onClick={exportExcel} disabled={exporting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait">
              {exporting ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300"
                  style={{ borderTopColor: THEME }} />
              ) : <ArrowUpTrayIcon className="h-3.5 w-3.5" />}
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          )}
        </FilterRow>
      </div>

      {/* pb-1: the Grand Total is PINNED to the bottom of the viewport,
          so padding under the table reads as a gap beneath it */}
      <div className="px-2 pt-2 pb-1">
        {meta.unmastered > 0 && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            <b>{nf(meta.unmastered)}</b> EFSR row{meta.unmastered > 1 ? 's carry' : ' carries'} a
            <i> Service Engineer UID</i> that is not in the SE UID Master — still counted, under the
            file&apos;s own SE name. Open <b>Profile → SE UID Master</b> to map them.
          </div>
        )}
        {/* An EFSR row can carry another dealer's SD BRANCH CODE. Those SRs are
            counted in the branch their ENGINEER belongs to, so they never grow a
            ghost branch — but an engineer who has no KALA branch in EFSR OR in
            MaxTTR cannot be placed at all, and lands in Unmapped Branch. Shown
            only while that branch is actually IN the grid below. */}
        {unmappedSEs.length > 0 && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            <b>{nf(unmappedTot.a)}</b> allocated
            {unmappedTot.c > 0 ? <> and <b>{nf(unmappedTot.c)}</b> closed</> : null} SR in this
            period {unmappedSEs.length > 1 ? 'sit' : 'sits'} under <b>Unmapped Branch</b> —
            {' '}<b>{unmappedSEs.map((ei) => employees[ei].n).join(', ')}</b>
            {' '}{unmappedSEs.length > 1 ? 'have' : 'has'} no KALA branch in the EFSR or MaxTTR
            files, so the report cannot tell which branch to count {unmappedSEs.length > 1 ? 'them' : 'them'} in.
            They join a branch automatically as soon as one of their SRs carries a KALA branch code.
          </div>
        )}
        <div className="border border-gray-400 rounded-xl overflow-hidden">
          <HScrollBox watch={`${gran}-${split}-${pctMode}-${seOpenCols}-${rows.length}-${shownBuckets.length}-${openSE.size}`}>
            <table className="pms-grid border-separate [border-spacing:0]" style={{ width: 'max-content', minWidth: '100%' }}>
              <thead style={{ position: 'relative', zIndex: 30 }}>
                <tr>
                  <th rowSpan={2} style={{ ...stick(0, W_GRP), zIndex: 12, ...HB }}
                    /* border-r: the body's group cells draw one, the header did not,
                       leaving the vertical line broken across the title rows */
                    className={`${grpTh} !border-l-0 border-r border-gray-400`} />
                  <th rowSpan={2} style={{ ...stick(OFF_BRANCH, W_BRANCH), zIndex: 12, ...HB }}
                    className={`${grpTh} !whitespace-normal border-r border-gray-400`}>Branch Name</th>
                  {/* branch wise only - no engineer dimension */}
                  <th rowSpan={2} style={{ ...stick(OFF_OPEN, W_OPEN), zIndex: 12, ...HB }}
                    className={`${thBase} !whitespace-normal !border-l-0 border-r border-gray-400`}
                    title={'Open SR \u2014 every row of the Open SR Load Report, counted in the'
                      + ' branch of its INSTANCE ID [Asset #] (the customer) on its SR CREATED DATE'}>
                    Open<br />SR
                  </th>
                  {/* !border-l-0: the cell on the left already draws that line —
                      two adjacent 1px borders would render as a double rule. */}
                  {seOpenCols && (
                    <th rowSpan={2} style={{ ...stick(OFF_UID, W_UID), zIndex: 12, ...HB }}
                      className={`${grpTh} !whitespace-normal !border-l-0 border-r border-gray-400`}>SE UID</th>
                  )}
                  {seOpenCols && (
                    <th rowSpan={2} style={{ ...stick(OFF_NAME, W_NAME), zIndex: 12, ...HB, ...EDGE_R }}
                      className={`${grpTh} !whitespace-normal !border-l-0`}>SE Name</th>
                  )}
                  {/* ONE Total Task column. With both measures shown its header is
                      SPLIT IN HALF by the same hairline the grid draws elsewhere:
                      the top half names the first row of every entity, the bottom
                      half the second — which is exactly how the rows are written,
                      so no separate A / C column is needed. */}
                  <th rowSpan={2}
                    style={{ ...stick(OFF_TOT, W_TOTAL), zIndex: 12, ...HB, ...EDGE_R }}
                    className={`${thBase} !whitespace-normal ${RS > 1 ? '!p-0' : ''}`}
                    title={split === 'alloc'
                      ? 'EFSR rows counted on their TASK ASSIGNED DATE — the same figure as Allocated SR in Employee Productivity'
                      : split === 'close'
                        ? 'EFSR rows counted on their TASK END DATE — when the engineer finished the job'
                        : 'Every branch, engineer and total is written as TWO rows:'
                          + ' Allocated (Task Assigned Date) then Closed (Task End Date)'}>
                    {RS === 1 ? (
                      <>{split === 'alloc' ? 'Allocated' : 'Closed'}<br />Total Task</>
                    ) : (
                      <div className="leading-tight">
                        <div className="px-0.5 py-1.5"
                          style={{ borderBottom: `1px solid ${GRID.line}` }}>
                          Allocated Total Task
                        </div>
                        <div className="px-0.5 py-1.5">Closed Total Task</div>
                      </div>
                    )}
                  </th>
                  {pctOn && (
                    <th rowSpan={2}
                      style={{ ...stick(OFF_TOTP, W_PCT), zIndex: 12, ...HB, ...EDGE_R }}
                      className={`${thBase} !whitespace-normal`}
                      title="Closure rate for the whole period — Closed ÷ Allocated × 100">
                      %
                      <span className="block font-normal normal-case tracking-normal text-[8px] leading-tight">
                        C ÷ A × 100
                      </span>
                    </th>
                  )}
                  {shownBuckets.length > 0 && (
                    <th colSpan={shownBuckets.length * (pctCols ? 2 : 1)}
                      className={`${grpTh} !font-bold`} style={HB}>
                      {bandTitle}
                    </th>
                  )}
                </tr>
                <tr>
                  {shownBuckets.map((b) => [
                    <th key={b.i} className={`${thBase} !whitespace-normal`}
                      style={{ ...cellCol, ...HB }} title={b.sub || b.label}>
                      {b.label}
                      {b.sub && <span className="block font-normal text-[8.5px] text-gray-700">{b.sub}</span>}
                    </th>,
                    pctCols ? (
                      <th key={`${b.i}-p`} className={`${thBase} !whitespace-normal`}
                        style={{ ...pctCol, ...HB }}
                        title={`Closed ÷ Allocated × 100 for ${b.label}`}>
                        %
                      </th>
                    ) : null,
                  ])}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="text-center py-6 text-xs text-gray-500 border-b border-gray-400">
                      No SR allocation in this selection.
                    </td>
                  </tr>
                ) : rows}
              </tbody>
              {/* Grand Total lives in a <tfoot> so it can float at the bottom
                  of the viewport the same way the head floats at the top. */}
              <tfoot style={{ position: 'relative', zIndex: 28 }}>
                {entityRows('grand', grand, C_GRAND, [
                  <td key="grand-l" colSpan={2} rowSpan={RS}
                    style={{ position: 'sticky', left: 0, zIndex: 6,
                      width: W_LABEL_ALL, minWidth: W_LABEL_ALL, maxWidth: W_LABEL_ALL,
                      background: C_GRAND }}
                    className="px-1.5 py-1.5 text-center align-middle text-[11px] border-y border-r border-gray-900">
                    Grand Total
                  </td>,
                  openCell('grand', RS, C_GRAND, openSum(allVisible)),
                  ...(seOpenCols ? [
                    <td key="grand-c" colSpan={2} rowSpan={RS}
                      style={{ position: 'sticky', left: OFF_UID, zIndex: 6,
                        width: W_CAPTION, minWidth: W_CAPTION, maxWidth: W_CAPTION,
                        background: C_GRAND, ...EDGE_R }}
                      className="px-1.5 py-1 text-center align-middle text-[10px] border-y border-gray-900">
                      All branches
                    </td>] : []),
                ], { trClass: 'font-bold text-white', white: true,
                  cellClass: '!border-t !border-t-gray-900' })}
              </tfoot>
            </table>
          </HScrollBox>
        </div>

      </div>
    </div>
  );
};

export default SRAllocationReport;
