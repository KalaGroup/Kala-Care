import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import { THEME, GRID, HScrollBox, MultiSelect, FilterRow } from './reportChrome';
import SEDetailModal from './SEDetailModal';

/* ----------------------------------------------------------------------------
   Employee Productivity (Service Engineer Productivity) — PMS report.
   Layout: prototypes/EPR-6.0.html, in the application theme.

   Source (GET /pms/report/employee-productivity, fetched ONCE by the page):
     Allocate SR   SRs ASSIGNED to the engineer, from the EFSR Report, matched
                   on SERVICE ENGINEER UID (SE UID Master), counted on TASK
                   ASSIGNED DATE and split by the 'SR Type Master (EFSR)'.
                   HIDDEN since 2026-08-19 — see SHOW_ALLOC below: the payload
                   and every roll-up still carry it, only the columns are gone.
     Close SR      every SR in the 'Response Time & MaxTTR Details' import that
                   has a close date and an SE name, counted on SR CLOSE DATE
                   under the SE NAME, in the MaxTTR row's own BRANCH ID
                   (the labour file is NOT involved)
     SR Type       the MaxTTR row's SR TYPE, mapped through the
                   'SR Type Master (MaxTTR)' to its head
     Working Days  month-wise working-days master (AOP Master), per region
                   (MH / KA), prorated to the selected days. The toolbar's
                   'Working Days' button hides the column (screen AND export) —
                   Productivity still divides by it either way.
     Days present  distinct SR TASK END DATEs in the MaxTTR file — attendance on
     on Task end   the day the engineer FINISHED the job in the field, not the
                   day the office closed the SR
                   Working Days and Days present are PER-ENGINEER figures, so
                   they print on ENGINEER ROWS ONLY: every roll-up (branch /
                   group / region / Grand Total) leaves both blank instead of
                   summing man-days into a number nobody reads. See ROW_SE.
     Productivity  Close SR / Working Days
     CDI           feedback from the CDI Detail Report, matched on X TECHNICIAN
                   NAME and counted on ACTIVITY END DATE:
                   Passive, Detractor and % = (P - D) / (P + D + Passive) x 100.
                   The columns show PASSIVE (not Promotor) since 2026-08-20 —
                   Promotor is still counted and still drives the %.
     Leads         distinct LMS LEAD NUMBERs of the engineer's SE UID (SE UID
                   Master maps SE NAME -> UID), on LEAD CREATED DATE, split by
                   'Lead Raised For' through the Lead Category Master
     Conv. Amount  those leads' PART (Spare) / LABOUR INVOICE AMOUNT, dated on
                   the ORDER's own creation date instead of the lead's: the
                   ORDER CREATION DATE comes from 'LMS Data from Insia', looked
                   up per LEAD NUMBER. A lead with no order there (or a blank /
                   '0' / 'N/A' date) contributes nothing, and Spare additionally
                   EXCLUDES 'OTC Quotation' rows. The lead COUNTS above are
                   unaffected — they stay on LEAD CREATED DATE, which is why the
                   two arrive as separate record streams.
                   Each of the two is split SE | Other. The true TOTAL rows —
                   Sub Total, MH / KA Total, Grand Total — merge that pair into
                   one figure; the collapsed Branch / Group Total rows keep it
                   split, since they are the folded view's data rows.
     Other         the middle sub-column of each: conversions that belong to NO
                   engineer — the lead has no Service Engineer UID, or one the
                   SE UID Master does not know. Held per BRANCH
                   (other_conv_records is keyed on the BRANCH index), so it
                   never enters the engineer roster: as an 'Other'
                   pseudo-engineer it inflated every branch's SE headcount and
                   handed the branch a phantom engineer's working days. It
                   prints on branch / group / region / Grand Total rows only;
                   an engineer row leaves it blank and its Total is just its own
                   SE figure.

   The payload is raw per-day records, so the period (page picker), the week
   ticks and every filter re-aggregate client-side without a refetch.
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
const shortBranch = (b) => String(b || '').replace(/^KALA\s*Care\s*Global\s*LLP\s*[-–]\s*/i, '');

const num2 = (v) => (Number.isFinite(v) ? v : 0).toFixed(2);
const num1 = (v) => (Number.isFinite(v) ? v : 0).toFixed(1);
const fmtAmt = (v) => Math.round(v).toLocaleString('en-IN');
// 'YYYY-MM' -> 'July 2026', for the HR attendance column's tooltip.
const fmtMonth = (m) => (m
  ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  : '');

// Calendar weeks (Mon–Sun) clipped to the period; the first and last may be
// partial. Same split as the prototype.
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

// Non-Sunday days of a month — the working-days fallback when the AOP master
// has no row for it (the same rule the backend's report uses).
const sundaysExcluded = (y, m) => {
  const dim = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= dim; d++) if (new Date(y, m - 1, d).getDay() !== 0) n++;
  return n;
};

// Pinned-column widths (must match the sticky left offsets below). Kept tight
// so the data columns get the room — long names ellipsize and carry the full
// text in their tooltip.
const W_GRP = 26, W_BRANCH = 116, W_UID = 72, W_NAME = 124;

// Fixed width for every SR Type / Product Wise Lead Count column: their titles
// wrap onto two lines so the columns stay narrow and the table stays compact.
const W_SUB = 54;
const W_AMT = 72;          // Spare / Labour Conv. Amount
const subCol = { width: W_SUB, minWidth: W_SUB, maxWidth: W_SUB };
const amtCol = { width: W_AMT, minWidth: W_AMT, maxWidth: W_AMT };
const W_FOLD = 62;         // a folded SR Type / Lead Count band

// 2026-08-19: 'Allocated SR' and its 'SR Type (Allocated)' split are HIDDEN
// everywhere the report is read — on screen and in the export. The EFSR
// aggregation behind them is deliberately LEFT INTACT (the payload still ships
// allocate_records, every roll-up still sums t.alloc / t.eheads and the
// 'engineer did something' test still counts an allocation), so bringing the
// band back is this one flag, not a rebuild. openAlloc keeps its own state for
// the same reason.
const SHOW_ALLOC = false;

// Table palette — LIGHT BLUE, from the shared GRID set (reportChrome). It
// replaces the old white/grey one; adjacent blocks still never share a tint, so
// rows stay separable even when the browser drops the 1px rules.
const C_HEAD = GRID.head;                            // every header cell
const C_ROW_A = GRID.rowA, C_ROW_B = GRID.rowB;      // engineer rows
const C_BAND_A = GRID.bandA, C_BAND_B = GRID.bandB;  // collapsed rows / branch
const C_GRP_A = GRID.grpA, C_GRP_B = GRID.grpB;      // group arrow column
const C_SUBTOT = GRID.subTot, C_GRPTOT = GRID.grpTot; // Sub Total rows
const C_REGION = GRID.region;                        // MH / KA total rows
const C_GRAND = GRID.grand;                          // Grand Total (ERP blue)
// The three section dividers: after SE Name, before Close SR, before Number of Lead
const DIV = `1px solid ${GRID.div}`;
const foldCol = { width: W_FOLD, minWidth: W_FOLD, maxWidth: W_FOLD };

// Row kinds. Working Days and Days present on Task end are per-engineer
// figures: ROW_SE prints them, every roll-up (ROW_TOTAL) leaves them blank.
const ROW_SE = 'se', ROW_TOTAL = 'total';

// A column title that is ONE long word cannot break inside the 54px SR Type /
// Lead columns, so it used to bleed over the cell edge and read as if it sat in
// the neighbouring column ('Unmapped' did). Header cells therefore hyphenate:
// `hyphens: auto` breaks the word properly ('Un-' / 'mapped') and break-word is
// the fallback for a browser that will not hyphenate, so nothing ever spills.
const wrapTh = { hyphens: 'auto', WebkitHyphens: 'auto', overflowWrap: 'break-word' };

// The two titles the BACKEND generates rather than the master ('Unmapped' for an
// SR Type / lead category with no head, 'Unspecified' for a blank one) carry a
// SOFT HYPHEN at the point English hyphenation would break them anyway. That
// makes the wrap exact instead of leaving it to the browser's dictionary: the
// cell reads 'Un-' / 'mapped', never 'Unmappe' / 'd'. Every other title is
// master text and is left exactly as typed.
const SHY = '\u00ad';        // U+00AD, invisible unless the line wraps
const TH_WRAP = { unmapped: `Un${SHY}mapped`, unspecified: `Un${SHY}specified` };
const thLabel = (t) => TH_WRAP[String(t || '').trim().toLowerCase()] || t;

// periodFrom / periodTo: the page's applied report period (ISO strings).
// preloaded: an already-fetched payload (the page loads it once so it knows the
// matched date range) — when given, no fetch happens.
const EmployeeProductivityReport = ({ periodFrom, periodTo, preloaded }) => {
  const [data, setData] = useState(preloaded || null);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState('');

  const [showWeeks, setShowWeeks] = useState(false);
  // Working Days column visibility — a COLUMN toggle like the fold arrows, so
  // it deliberately stays out of the "re-minimize the tree" effect below.
  // Productivity divides by Working Days whether the column is shown or not.
  const [showWD, setShowWD] = useState(true);
  const [weekSel, setWeekSel] = useState(() => new Set());     // empty = all
  const [brSel, setBrSel] = useState(() => new Set());         // branch indices
  const [seSel, setSeSel] = useState(() => new Set());         // employee indices
  // The SE name opens the drill-down: the MaxTTR rows this engineer's Close SR
  // figure was counted from, for the period the table is showing.
  const [seDetail, setSeDetail] = useState(null);
  const [query, setQuery] = useState('');
  // SR Type and Product Wise Lead Count start OPEN — the arrow in their group
  // header folds them away and brings them back.
  const [openAlloc, setOpenAlloc] = useState(true);
  const [openSR, setOpenSR] = useState(true);
  const [openLead, setOpenLead] = useState(true);
  const [openCDI, setOpenCDI] = useState(true);     // folds like the SR Type bands
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [openBranches, setOpenBranches] = useState(() => new Set());

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

  const start = periodFrom || data?.meta?.min_date || '';
  const end = periodTo || data?.meta?.max_date || '';

  // A new period invalidates the week ticks (W3 of July is not W3 of August).
  useEffect(() => { setWeekSel(new Set()); }, [start, end]);

  // ANY control in the filter bar re-MINIMIZES the report: every opened group
  // and branch folds back, so a fresh selection is always read from the top
  // (group / branch totals) down instead of landing in the middle of someone's
  // old drill-down. That is EVERY bar control — period, Weekly Close SR, week
  // ticks, Branch, SE, search. Only the fold arrows in the table HEADER (SR Type
  // Allocated / Closed, CDI, Lead Count) leave the rows alone: they hide columns,
  // they do not change the selection.
  useEffect(() => {
    setOpenGroups(new Set());
    setOpenBranches(new Set());
  }, [start, end, showWeeks, weekSel, brSel, seSel, query]);

  // ---- aggregate the raw records into the current selection ----------------
  const agg = useMemo(() => {
    if (!data || !start || !end || start > end) return null;
    const { branches = [], branch_regions: regions = [], employees = [],
      heads = [], lead_categories: cats = [], efsr_heads: eheads = [],
      sr_records: srRec = [], lead_records: ldRec = [], conv_records: cvRec = [],
      other_conv_records: ocRec = [], cross_records: xRec = [],
      attendance_records: atRec = [], attendance_months: atMonths = [],
      present_records: prRec = [],
      allocate_records: alRec = [], cdi_records: cdiRec = [],
      working_days: wdMaster = {} } = data;

    const weeks = buildWeeks(start, end);
    // Mon-anchored index so a date maps straight to its week column.
    const anchor = addDays(start, -((pd(start).getDay() + 6) % 7));
    const weekOf = (ds) => Math.floor(diffDays(anchor, ds) / 7);
    // A record counts only when its date is INSIDE the period — the `ds` check
    // is not redundant. The week index is Mon-anchored while a period rarely
    // starts on a Monday or ends on a Sunday, so the first and last weeks are
    // partial: for 01 Jul (Wed) → 31 Jul (Fri), week 0 also covers 29-30 Jun and
    // the last week 01-02 Aug. Those dates mapped to a VALID week index and were
    // counted, inflating every column (Allocated, Close SR, Days Present, CDI,
    // leads) by roughly four days of volume and breaking the tie-up with the SR
    // Allocation report, which clips strictly to the period.
    const on = (ds) => {
      if (ds < start || ds > end) return false;
      const wi = weekOf(ds);
      return wi >= 0 && wi < weeks.length
        && (weekSel.size === 0 || weekSel.has(weeks[wi].n));
    };

    // ---- working days of the SELECTED days, per region --------------------
    // Each touched month contributes its master value, prorated by how many of
    // its days are actually selected.
    //
    // ONE THING IS EXCLUDED that used to be counted: DAYS THE DATA HAS NOT
    // REACHED. The master's figure is the whole month's AVAILABLE man-days,
    // and the files stop on the 24th of August — six of them have not been
    // reported on by anything. Widening the period to the 31st divided the same
    // work by a full month of man-days and reported every engineer low, which
    // also made the rate depend on how far past the data the reader happened to
    // drag the picker. It changes nothing for the DEFAULT period, which already
    // ends at max_date.
    //
    // on() is belt and braces: buildWeeks() already clips the first and last
    // week to the period, so no day outside it reaches here — but the record
    // counts above all go through on(), and a man-day figure has no business
    // trusting a different rule from the volumes it divides.
    //
    // The same rule is in sePerformanceModel's workDaysOf(), because SE
    // Performance must quote the same productivity for the same engineer.
    // CHANGE BOTH OR NEITHER.
    const dataEnd = data?.meta?.max_date || end;
    const monthSel = {};                       // 'YYYY-MM' -> selected day count
    weeks.forEach((w) => {
      if (weekSel.size && !weekSel.has(w.n)) return;
      for (let i = 0; i < w.days; i++) {
        const ds = addDays(w.start, i);
        if (!on(ds) || ds > dataEnd) continue;
        const key = ds.slice(0, 7);
        monthSel[key] = (monthSel[key] || 0) + 1;
      }
    });
    const wdOf = (region) => {
      const r = region === 'KA' ? 'ka' : 'mh';
      let total = 0;
      Object.entries(monthSel).forEach(([m, selDays]) => {
        const [y, mm] = m.split('-').map(Number);
        const row = (wdMaster.months || {})[m] || (wdMaster.universal || {})[m.slice(5, 7)];
        const base = (row && row[r]) || sundaysExcluded(y, mm);
        total += base * (selDays / new Date(y, mm, 0).getDate());
      });
      return total;
    };
    const wdByRegion = { MH: wdOf('MH'), KA: wdOf('KA') };

    // ---- per-employee accumulation ----------------------------------------
    const blank = () => ({
      alloc: 0, eheads: new Array(eheads.length).fill(0),
      cdi: [0, 0, 0],                       // Promotor / Detractor / Passive
      sr: 0, heads: new Array(heads.length).fill(0),
      weekly: new Array(weeks.length).fill(0), days: new Set(),
      leads: 0, cats: new Array(cats.length).fill(0),
      spare: 0, labour: 0,
      hr: 0,                       // HR attendance days, this month only
    });
    const emp = employees.map(blank);

    /* HR attendance is a WHOLE-month figure, so it is only offered when the
       period IS exactly one uploaded calendar month — 01 Jul to 31 Jul and
       nothing else. A part month would divide that month's work by a full
       month of attendance and read low. null = not available for this period. */
    const hrMonth = (() => {
      if (!start || !end) return null;
      const m = start.slice(0, 7);
      if (end.slice(0, 7) !== m || start.slice(8) !== '01') return null;
      const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
      if (Number(end.slice(8)) !== last) return null;
      return atMonths.includes(m) ? m : null;
    })();
    if (hrMonth) {
      atRec.forEach(([ei, m, d]) => {
        if (m !== hrMonth) return;
        const e = emp[ei];
        if (e) e.hr += d;
      });
    }

    srRec.forEach(([ei, ds, hi, n]) => {
      if (!on(ds)) return;
      const wi = weekOf(ds);
      const e = emp[ei];
      if (!e) return;
      e.sr += n;
      e.heads[hi] = (e.heads[hi] || 0) + n;
      e.weekly[wi] += n;
    });
    alRec.forEach(([ei, ds, hi, n]) => {
      if (!on(ds)) return;
      const e = emp[ei];
      if (!e) return;
      e.alloc += n;
      e.eheads[hi] = (e.eheads[hi] || 0) + n;
    });
    cdiRec.forEach(([ei, ds, k, n]) => {
      if (!on(ds)) return;
      const e = emp[ei];
      if (e) e.cdi[k] += n;
    });
    // Days Present is attendance: every day the engineer closed an SR.
    prRec.forEach(([ei, ds]) => {
      if (!on(ds)) return;
      if (emp[ei]) emp[ei].days.add(ds);
    });
    // Lead COUNTS — on LEAD CREATED DATE.
    ldRec.forEach(([ei, ds, ci, n]) => {
      if (!on(ds)) return;
      const e = emp[ei];
      if (!e) return;
      e.leads += n;
      e.cats[ci] = (e.cats[ci] || 0) + n;
    });
    // Conv. AMOUNTS — a separate stream because they are dated on the ORDER
    // CREATION DATE ('LMS Data from Insia'), not on the lead's created date, so
    // the same lead lands in one period for its count and another for its
    // money. Spare already has 'OTC Quotation' removed server-side.
    cvRec.forEach(([ei, ds, spare, labour]) => {
      if (!on(ds)) return;
      const e = emp[ei];
      if (!e) return;
      e.spare += spare || 0;
      e.labour += labour || 0;
    });

    // 'Other' — the conversions of leads with NO Service Engineer, keyed on the
    // BRANCH, so they never enter the engineer roster (which would corrupt every
    // branch's SE headcount and working days). Own columns, branch rows only.
    // ---- 'MH Other' / 'KA Other' — SRs an engineer closed in someone else's
    // branch. Held per BRANCH like otherBr, never as an engineer: the whole
    // point is that this work carries NO working days into any branch.
    const crossBr = branches.map(() => ({
      sr: 0, heads: new Array(heads.length).fill(0),
      weekly: new Array(weeks.length).fill(0),
    }));
    xRec.forEach(([bi, ds, hi, n]) => {
      if (!on(ds)) return;
      const c = crossBr[bi];
      if (!c) return;
      c.sr += n;
      c.heads[hi] = (c.heads[hi] || 0) + n;
      c.weekly[weekOf(ds)] += n;
    });

    const otherBr = branches.map(() => ({ spare: 0, labour: 0 }));
    ocRec.forEach(([bi, ds, spare, labour]) => {
      if (!on(ds)) return;
      const o = otherBr[bi];
      if (!o) return;
      o.spare += spare || 0;
      o.labour += labour || 0;
    });

    // A row is shown only when the engineer did something in the selection —
    // AND he was still employed in it. An engineer whose last working day falls
    // BEFORE the period start is off the roster for that period: he is nobody's
    // headcount, so his working days must not sit in a branch's denominator.
    // Only a last day that is actually KNOWN can hide anyone (see _left_dates).
    const active = emp.map((e, ei) => {
      const left = employees[ei]?.left;
      if (left && left < start) return false;
      return e.sr > 0 || e.alloc > 0 || e.leads > 0
        || e.days.size > 0 || e.spare > 0 || e.labour > 0
        || e.cdi[0] > 0 || e.cdi[1] > 0 || e.cdi[2] > 0;
    });

    // Working days are a per-engineer figure; branch/group/grand rows sum them
    // (available man-days), the same way Days Present sums.
    const workOf = (ei) => wdByRegion[(regions[employees[ei].b] || 'MH') === 'KA' ? 'KA' : 'MH'];

    const byBranch = branches.map(() => []);
    employees.forEach((e, ei) => { if (active[ei]) byBranch[e.b].push(ei); });
    byBranch.forEach((list) => list.sort((a, b) =>
      employees[a].n.localeCompare(employees[b].n)));

    return { weeks, weekOf, heads, cats, eheads, emp, active, byBranch, workOf,
      wdByRegion, otherBr, crossBr, hrMonth };
  }, [data, start, end, weekSel]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
          style={{ borderTopColor: THEME }} />
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
          No data yet — upload the <b>'Response Time &amp; MaxTTR Details'</b> file on the
          Data Upload page. Every SR in it with a close date and an SE name is counted here.
        </div>
      </div>
    );
  }
  if (!agg) {
    return <div className="px-3 pb-4 pt-2 text-sm text-gray-500">No valid reporting period.</div>;
  }

  const { meta, branches, employees, groups = [] } = data;
  const { weeks, heads, cats, eheads, emp, byBranch, workOf, otherBr,
    crossBr, hrMonth } = agg;
  // Only the ticked weeks get a column; each keeps `i`, its index into the
  // per-week totals, so dropping columns never shifts the data.
  const shownWeeks = weeks
    .map((w, i) => ({ ...w, i }))
    .filter((w) => weekSel.size === 0 || weekSel.has(w.n));
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
  // A branch row that has to print even with no engineer under it: the
  // unattributed conversion money, and — on the two 'Other' rows — the SRs an
  // engineer closed outside his own branch.
  const hasOther = (bi) => otherBr[bi].spare > 0 || otherBr[bi].labour > 0
    || crossBr[bi].sr > 0;
  // A branch whose only figure in the period is unattributed money still has to
  // show, or the Grand Total would not add up to the rows above it. Skipped
  // while an SE filter / search is on: those narrow to named engineers, and an
  // engineer-less branch answers neither.
  const branchOn = (bi) => (!brSel.size || brSel.has(bi))
    && (seOf(bi).length > 0 || (!seSel.size && !q && hasOther(bi)));

  // ---- roll-ups ------------------------------------------------------------
  const zero = () => ({
    alloc: 0, eheads: new Array(eheads.length).fill(0), cdi: [0, 0, 0],
    sr: 0, heads: new Array(heads.length).fill(0),
    weekly: new Array(weeks.length).fill(0), present: 0, work: 0, hr: 0,
    leads: 0, cats: new Array(cats.length).fill(0), spare: 0, labour: 0,
    // Unattributed (no-SE) conversion money — a BRANCH figure, so it is added
    // by the branch roll-ups below and stays 0 on every engineer row.
    oSpare: 0, oLabour: 0,
  });
  const addBranchOther = (t, bi) => {
    t.oSpare += otherBr[bi].spare;
    t.oLabour += otherBr[bi].labour;
    // Cross-branch SRs ride on the BRANCH, never on an engineer, so they reach
    // the branch / region / Grand totals here and bring no working days with
    // them. On a real branch every one of these is 0.
    const c = crossBr[bi];
    t.sr += c.sr;
    c.heads.forEach((v, i) => { t.heads[i] += v; });
    c.weekly.forEach((v, i) => { t.weekly[i] += v; });
    return t;
  };
  const addSE = (t, ei) => {
    const e = emp[ei];
    t.sr += e.sr; t.alloc += e.alloc;
    t.leads += e.leads; t.spare += e.spare; t.labour += e.labour;
    e.eheads.forEach((v, i) => { t.eheads[i] += v; });
    e.cdi.forEach((v, i) => { t.cdi[i] += v; });
    t.present += e.days.size; t.work += workOf(ei); t.hr += e.hr;
    e.heads.forEach((v, i) => { t.heads[i] += v; });
    e.cats.forEach((v, i) => { t.cats[i] += v; });
    e.weekly.forEach((v, i) => { t.weekly[i] += v; });
    return t;
  };
  const seRow = (ei) => addSE(zero(), ei);
  const sumBranch = (bi) => addBranchOther(seOf(bi).reduce((t, ei) => addSE(t, ei), zero()), bi);
  const sumBranches = (list) => list.reduce(
    (t, bi) => addBranchOther(seOf(bi).reduce((x, ei) => addSE(x, ei), t), bi), zero());

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
  const anyOpen = openGroups.size > 0 || openBranches.size > 0;

  // ---- cells ---------------------------------------------------------------
  // Zero placeholder: a plain dash that inherits the cell colour, so it is
  // black on normal rows and white on the dark Grand Total row.
  // Productivity is FIXED to Working Days. HR attendance and Days present are
  // shown beside it as information, but the figure the business compares
  // branches on has one definition and does not move with a dropdown.
  // Divided by the ROUNDED working days, so a reader checking the arithmetic by
  // hand gets the printed number back instead of one off by the proration.
  const prDenom = (t) => Math.round(t.work);

  const Z = <span>-</span>;
  const numCell = (v) => (v ? v.toLocaleString('en-IN') : Z);
  const amtCell = (v) => (v ? fmtAmt(v) : Z);

  // Working Days / Days present print on ENGINEER rows only — every other row
  // is a roll-up, where a summed man-day figure means nothing. Passed explicitly
  // (not inferred) so a new row kind has to say which it is.
  // `merge` controls the Other column inside an expanded branch, where it is a
  // BRANCH figure and a dash repeated on every engineer row says nothing:
  //   {mode:'start', span, t}  one cell spanning the engineer rows, branch value
  //   {mode:'skip'}            no cell at all — the span above covers this row
  //   null                     one cell for this row alone
  // There is no Total COLUMN: every roll-up row (Sub Total, Branch/Group/Region
  // Total, Grand Total) merges its SE and Other cells into ONE cell holding
  // SE + Other, so the total is read where a total belongs.
  // `combine` is for the true TOTAL rows — Sub Total, MH / KA Total and the
  // Grand Total — where one figure is what is read, so SE and Other merge into
  // a single cell. The collapsed Branch Total / Group Total rows are the data
  // rows of the folded view and keep the split visible.
  const dataCells = (t, key, kind = ROW_TOTAL, merge = null, combine = false) => {
    const perSE = kind === ROW_SE;
    const cells = [];
    const cls = 'px-1 py-1 text-center text-[10.5px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
    const clsAmt = 'px-1 py-1 text-right text-[10.5px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
    // Allocate SR (EFSR) and its SR Type split came BEFORE Close SR — hidden
    // now (SHOW_ALLOC), which makes Close SR the first data column, so it takes
    // over the !border-l-0: the pinned SE Name cell already draws that edge and
    // two 1px borders meeting there render as a double rule.
    if (SHOW_ALLOC) {
      cells.push(<td key={`${key}-al`} className={`${cls} font-semibold !border-l-0`}>{numCell(t.alloc)}</td>);
      if (openAlloc) {
        eheads.forEach((h, i) => cells.push(
          <td key={`${key}-e${i}`} className={cls} style={subCol}>{numCell(t.eheads[i])}</td>));
      } else {
        cells.push(<td key={`${key}-ex`} className={cls} style={foldCol} />);
      }
    }
    cells.push(<td key={`${key}-sr`}
      className={`${cls} font-semibold${SHOW_ALLOC ? '' : ' !border-l-0'}`}
      style={SHOW_ALLOC ? { borderLeft: DIV } : undefined}>{numCell(t.sr)}</td>);
    if (showWeeks) {
      shownWeeks.forEach((w) => {
        cells.push(
          <td key={`${key}-w${w.i}`} className={cls} style={subCol}>
            {numCell(t.weekly[w.i])}
          </td>);
      });
    }
    if (openSR) {
      heads.forEach((h, i) => cells.push(
        <td key={`${key}-h${i}`} className={cls} style={subCol}>{numCell(t.heads[i])}</td>));
    } else {
      cells.push(<td key={`${key}-hx`} className={cls} style={foldCol} />);
    }
    // The three per-engineer day columns travel together behind one toggle, in
    // the order the business reads them: the man-days the master ALLOWS, then
    // what HR says he was there for, then the days the service files show him
    // finishing a job on.
    if (showWD) {
      cells.push(<td key={`${key}-wd`} className={cls}>
        {perSE && t.work ? Math.round(t.work).toLocaleString('en-IN') : Z}</td>);
      if (hrMonth) {
        cells.push(<td key={`${key}-hr`} className={cls}>
          {perSE && t.hr ? num2(t.hr).replace(/\.00$/, '') : Z}</td>);
      }
      cells.push(<td key={`${key}-dp`} className={cls}>{perSE ? numCell(t.present) : Z}</td>);
    }
    // Productivity is Close SR / WORKING DAYS (the available man-days), not
    // / Days Present, and it prints on EVERY row — a roll-up still divides by
    // the man-days of its engineers even though the column above it is blank.
    // Divided by the ROUNDED working days, so on an engineer row a reader
    // checking the arithmetic by hand gets the printed number back instead of
    // one off by the proration remainder.
    const denom = prDenom(t);
    cells.push(
      <td key={`${key}-pr`} className={`${cls} font-semibold`}>
        {denom > 0 ? num2(t.sr / denom) : Z}
      </td>);
    // CDI: Passive / Detractor / % — (P - D) over ALL feedback, incl. Passive.
    // The split shows PASSIVE (cdi[2]), not Promotor (cdi[0]): Promotor is the
    // bucket the % already speaks for, Passive is the one that was invisible.
    // Both are still counted — the % formula is untouched.
    const cdiAll = t.cdi[0] + t.cdi[1] + t.cdi[2];
    if (openCDI) {
      cells.push(<td key={`${key}-cp`} className={cls} style={{ ...subCol, borderLeft: DIV }}>{numCell(t.cdi[2])}</td>);
      cells.push(<td key={`${key}-cd`} className={cls} style={subCol}>{numCell(t.cdi[1])}</td>);
    }
    // The % column SURVIVES the fold: folding CDI drops Promotor and Detractor
    // and keeps the score, which is what the CDI band is actually read on.
    cells.push(
      // key must stay unique across the whole row: the folded Lead Count cell
      // below once used '-cx' too, and React then mis-reconciled the duplicate
      // into extra copies of this cell, pushing every later column out of line.
      <td key={`${key}-cpct`} className={`${cls} font-semibold`}
        style={openCDI ? subCol : { ...foldCol, borderLeft: DIV }}>
        {cdiAll ? num1((t.cdi[0] - t.cdi[1]) / cdiAll * 100) : Z}
      </td>);
    cells.push(<td key={`${key}-ld`} className={cls} style={{ borderLeft: DIV }}>{numCell(t.leads)}</td>);
    if (openLead) {
      cats.forEach((c, i) => cells.push(
        <td key={`${key}-c${i}`} className={cls} style={subCol}>{numCell(t.cats[i])}</td>));
    } else {
      cells.push(<td key={`${key}-cx`} className={cls} style={foldCol} />);
    }
    // Conversion amounts are the LAST six columns — the only right-aligned ones.
    // Each of the two runs SE | Other | Total, where 'Other' is the money of
    // leads that carry no Service Engineer. Other belongs to the BRANCH, not to
    // any one person, so an engineer row leaves it blank and its Total is just
    // its own SE figure; every roll-up carries all three.
    const mMode = merge && merge.mode;
    const mT = mMode === 'start' ? merge.t : t;
    // The vertically merged Other cell carries the BRANCH's figure and wears
    // the Sub Total tint, so the block reads as one branch-level number.
    const mStyle = mMode === 'start'
      ? { ...amtCol, background: C_SUBTOT, verticalAlign: 'middle' }
      : amtCol;
    // Every row keeps SE and Other in their OWN columns — a roll-up that merged
    // them into one total hid the split exactly where it is most read (the
    // collapsed Branch / Group / Region / Grand Total rows, which have no
    // engineer rows underneath to show it).
    const amtPair = (which, seVal, oVal, lastCol) => {
      const isLast = lastCol ? ' border-r' : '';
      if (!perSE) {
        if (combine) {
          cells.push(
            <td key={`${key}-${which}tot`} colSpan={2}
              className={`${clsAmt} font-semibold${isLast}`}
              style={{ width: W_AMT * 2, minWidth: W_AMT * 2, maxWidth: W_AMT * 2,
                borderLeft: DIV }}>
              {amtCell(seVal + oVal)}
            </td>);
          return;
        }
        cells.push(<td key={`${key}-${which}se`} className={`${clsAmt} font-semibold`}
          style={{ ...amtCol, borderLeft: DIV }}>{amtCell(seVal)}</td>);
        cells.push(<td key={`${key}-${which}o`} className={`${clsAmt} font-semibold${isLast}`}
          style={amtCol}>{amtCell(oVal)}</td>);
        return;
      }
      cells.push(<td key={`${key}-${which}se`} className={clsAmt}
        style={{ ...amtCol, borderLeft: DIV }}>{amtCell(seVal)}</td>);
      if (mMode === 'skip') return;      // covered by the rowSpan above
      cells.push(<td key={`${key}-${which}o`}
        {...(mMode === 'start' ? { rowSpan: merge.span } : {})}
        className={`${clsAmt}${mMode === 'start' ? ' font-semibold' : ''}${isLast}`}
        style={mStyle}>
        {mMode === 'start' ? amtCell(which === 's' ? mT.oSpare : mT.oLabour) : Z}</td>);
    };
    amtPair('s', t.spare, t.oSpare, false);
    // border-r on the last column: it has no neighbour to draw its right edge,
    // so scrolled fully right the table used to end open.
    amtPair('l', t.labour, t.oLabour, true);
    return cells;
  };

  const seOpen = openBranches.size > 0;
  const stick = (left, w, extra = '') => ({
    position: 'sticky', left, width: w, minWidth: w, maxWidth: w, zIndex: 5, ...(extra || {}),
  });
  const OFF_BRANCH = W_GRP;
  const OFF_UID = W_GRP + W_BRANCH;
  const OFF_NAME = W_GRP + W_BRANCH + W_UID;
  // Totals rows merge their pinned label columns into ONE centred cell.
  const W_PIN_TAIL = seOpen ? W_UID + W_NAME : 0;
  const W_LABEL_ALL = W_GRP + W_BRANCH + W_PIN_TAIL;   // grand total (from col 1)
  const W_LABEL_BR = W_BRANCH + W_PIN_TAIL;            // group total (arrow spans col 1)
  // A real border, not an inset shadow: it is one of the three section
  // dividers and has to render like the rest of the grid.
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

  // ---- rows ----------------------------------------------------------------
  const rows = [];
  const branchCell = (bi, label, meta2, rowSpan, open, onClick, bg) => (
    <td rowSpan={rowSpan} onClick={onClick} title={branches[bi]}
      style={{ ...stick(OFF_BRANCH, W_BRANCH), background: bg || GRID.bandA, zIndex: 6 }}
      className="px-1.5 py-1.5 text-left text-[10.5px] font-semibold text-black border-b border-r border-gray-400 align-middle cursor-pointer pms-hover leading-tight">
      {/* The arrow's width is ALWAYS reserved, even on a row that has none
          (a collapsed group). Rendering it conditionally left those branch
          names flush while the others were pushed right by 12px, so the
          column read as a ragged edge instead of one line. */}
      <span className={`inline-block w-3 text-[8px] text-gray-600 transition-transform ${open ? 'rotate-90' : ''}`}>
        {open !== null ? '▶' : ''}
      </span>
      {label}
      {meta2 && <span className="block mt-0.5 text-[8.5px] font-normal text-gray-600">{meta2}</span>}
    </td>
  );
  // A collapsed row has no engineer of its own, so its SE UID + SE Name columns
  // merge into ONE labelled cell rather than showing two blank dashes: a run of
  // blank white cells reads as a hole in the grid the moment the browser drops
  // the 1px hairlines (zoomed out, fractional display scaling).
  const pinLabel = (text, keyBase, bg) => (seOpen ? [
    <td key={`${keyBase}-pl`} colSpan={2}
      style={{ position: 'sticky', left: OFF_UID, zIndex: 6, background: bg,
        width: W_UID + W_NAME, minWidth: W_UID + W_NAME, maxWidth: W_UID + W_NAME,
        ...EDGE_R }}
      className="px-1.5 py-1 text-center text-[10px] text-black border-b border-gray-400">
      {text}
    </td>,
  ] : []);
  const uidNameCells = (uid, name, keyBase, bg, indent = false, onName = null) => (seOpen ? [
    <td key={`${keyBase}-u`} style={{ ...stick(OFF_UID, W_UID), background: bg }}
      className="px-1 py-1 text-center text-[9.5px] text-black tabular-nums border-b border-r border-gray-400">
      <div className="truncate" title={uid || undefined}>{uid || Z}</div>
    </td>,
    // A td ignores text-overflow, so the ellipsis lives on an inner block; the
    // full name is always in the tooltip.
    // On an ENGINEER row the name also opens the drill-down: the Close SR rows
    // the row's figures were counted from. Total / Sub Total rows pass no
    // handler, so they stay plain text.
    <td key={`${keyBase}-n`} style={{ ...stick(OFF_NAME, W_NAME), background: bg, ...EDGE_R }}
      className={`${indent ? 'pl-2.5' : ''} px-1 py-1 text-left text-[10.5px] text-black border-b border-gray-400`}>
      <div className={`truncate ${onName ? 'cursor-pointer underline decoration-dotted underline-offset-2 hover:decoration-solid' : ''}`}
        title={onName ? `${name} — click for the Close SR records` : (name || undefined)}
        onClick={onName || undefined}>{name || Z}</div>
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
      const t = sumBranches(g);
      const bg = bandBg();
      rows.push(
        <tr key={`g${gi}`} style={{ background: bg }}>
          {grpTd(`g${gi}c`, gi, single, 1, false)}
          {branchCell(g[0], shortBranch(branches[g[0]]), `+${g.length - 1} BR`, 1, null, () => toggleGroup(gi), bg)}
          {pinLabel('Group Total', `g${gi}`, bg)}
          {dataCells(t, `g${gi}`)}
        </tr>
      );
      return;
    }

    // Rows this group will push: per branch, 1 when collapsed, else its SE rows
    // + a branch-total row; plus the group's own Total row (multi-branch only).
    const groupSpan = g.reduce((n, bi) =>
      n + (openBranches.has(bi) ? seOf(bi).length + 1 : 1), 0) + (single ? 0 : 1);
    let firstRow = true;
    const gcell = (key) => {
      if (!firstRow) return null;
      firstRow = false;
      return grpTd(key, gi, single, groupSpan, true);
    };

    g.forEach((bi) => {
      // 'MH Other' / 'KA Other': a branch row with no engineers under it, holding
      // the SRs its region's engineers closed outside their own branch. There is
      // nothing to expand, so the cell opens the RECORDS instead.
      const isOtherBr = String(data.branch_ids[bi] || '').startsWith('OTHER_');
      const bOpen = openBranches.has(bi) && !isOtherBr;
      const ses = seOf(bi);
      const bTot = sumBranch(bi);
      const seLabel = isOtherBr ? 'click for records'
        : `${ses.length} SE${ses.length > 1 ? 's' : ''}`;

      if (!bOpen) {
        const bg = bandBg();
        rows.push(
          <tr key={`b${bi}`} style={{ background: bg }}>
            {gcell(`b${bi}c`)}
            {branchCell(bi, shortBranch(branches[bi]), seLabel, 1, false,
              isOtherBr
                ? () => setSeDetail({ other: true, name: branches[bi],
                  region: data.branch_regions[bi] })
                : () => toggleBranch(bi), bg)}
            {pinLabel('Branch Total', `b${bi}`, bg)}
            {dataCells(bTot, `b${bi}`)}
          </tr>
        );
        return;
      }

      const span = ses.length + 1;   // SE rows + the branch-total row
      const brBg = bandBg();         // shares the counter above, so the whole
                                     // Branch Name column strictly alternates
      // Other is a branch figure: ONE cell spanning the ENGINEER rows. It stops
      // above the Sub Total row, which merges its own SE + Other into a single
      // total cell. A branch with no engineer rows has nothing to span.
      const oMerge = ses.length
        ? { mode: 'start', span: ses.length, t: bTot } : null;
      ses.forEach((ei, i) => {
        const bg = i % 2 ? C_ROW_B : C_ROW_A;
        rows.push(
          <tr key={`b${bi}e${ei}`} style={{ background: bg }}>
            {gcell(`b${bi}e${ei}c`)}
            {i === 0 && branchCell(bi, shortBranch(branches[bi]), seLabel, span, true,
              () => toggleBranch(bi), brBg)}
            {uidNameCells(employees[ei].u, employees[ei].n, `b${bi}e${ei}`, bg, true,
              () => setSeDetail({ name: employees[ei].n, uid: employees[ei].u,
                branch: shortBranch(branches[employees[ei].b]),
                branchId: data.branch_ids[employees[ei].b] }))}
            {dataCells(seRow(ei), `b${bi}e${ei}`, ROW_SE,
              i === 0 ? oMerge : { mode: 'skip' })}
          </tr>
        );
      });
      rows.push(
        <tr key={`b${bi}tot`} className="font-bold" style={{ background: C_SUBTOT }}>
          {gcell(`b${bi}totc`)}
          {/* the branch-name cell rowSpans over this row, so the label merges
              the SE UID + SE Name columns */}
          <td colSpan={2} style={{ position: 'sticky', left: OFF_UID, zIndex: 6,
            width: W_UID + W_NAME, minWidth: W_UID + W_NAME, maxWidth: W_UID + W_NAME,
            background: C_SUBTOT, ...EDGE_R }}
            className="px-1.5 py-1 text-center text-[10.5px] text-black border-b border-gray-400">
            Sub Total
          </td>
          {dataCells(bTot, `b${bi}tot`, ROW_TOTAL, null, true)}
        </tr>
      );
    });

    if (!single) {
      const t = sumBranches(g);
      rows.push(
        <tr key={`g${gi}tot`} className="font-bold" style={{ background: C_GRPTOT }}>
          {gcell(`g${gi}totc`)}
          {/* Branch + SE UID + SE Name merged into one centred label */}
          <td colSpan={seOpen ? 3 : 1} style={{ position: 'sticky', left: OFF_BRANCH, zIndex: 6,
            width: W_LABEL_BR, minWidth: W_LABEL_BR, maxWidth: W_LABEL_BR,
            background: C_GRPTOT, ...EDGE_R }}
            className="px-1.5 py-1.5 text-center text-[11px] text-black border-y border-gray-400">
            Sub Total
          </td>
          {dataCells(t, `g${gi}tot`, ROW_TOTAL, null, true)}
        </tr>
      );
    }
  };

  // ---- MH / KA total rows --------------------------------------------------
  // A region roll-up after the LAST group of that region: MH closes right after
  // the Ahilyanagar group (the last MH row the backend sends), KA at the very
  // bottom, immediately above the Grand Total. Read off branch_regions, so a new
  // branch lands in its own region's total without touching this file.
  const regionAt = (gi) => regionOf(visibleGroups[gi][0]);
  // A user scoped to their own branches (every non-HO Branch Admin / Employee —
  // the backend flags their payload `branch_scoped`) gets NO region row: an
  // 'MH Total' over one or two of MH's branches is not the region's total, it
  // is their own Grand Total wearing the region's name. Left empty, the two
  // `lastOfRegion[...] === gi` gates below never fire, on screen or in the
  // Excel export.
  const lastOfRegion = {};
  if (!data.branch_scoped) {
    visibleGroups.forEach((g, gi) => { lastOfRegion[regionAt(gi)] = gi; });
  }
  const regionRow = (rg) => {
    const list = allVisible.filter((bi) => regionOf(bi) === rg);
    if (!list.length) return null;
    return (
      <tr key={`rg${rg}`} className="font-bold text-white" style={{ background: C_REGION }}>
        {/* every pinned column merged into one centred label, like Grand Total */}
        <td colSpan={seOpen ? 4 : 2} style={{ position: 'sticky', left: 0, zIndex: 6,
          width: W_LABEL_ALL, minWidth: W_LABEL_ALL, maxWidth: W_LABEL_ALL,
          background: C_REGION, ...EDGE_R }}
          className="px-1.5 py-1.5 text-center text-[11px] border-y border-gray-400">
          {rg} Total
        </td>
        {dataCells(sumBranches(list), `rg${rg}`, ROW_TOTAL, null, true).map((c) =>
          React.cloneElement(c, {
            className: `${c.props.className} !text-white`,
            style: { ...(c.props.style || {}), background: C_REGION, color: '#fff' },
          }))}
      </tr>
    );
  };

  visibleGroups.forEach((g, gi) => {
    renderGroup(g, gi);
    if (lastOfRegion[regionAt(gi)] === gi) {
      const r = regionRow(regionAt(gi));
      if (r) rows.push(r);
    }
  });

  const grand = sumBranches(allVisible);
  const colCount = 1 + 1 + (seOpen ? 2 : 0)
    + (SHOW_ALLOC ? 1 + (openAlloc ? eheads.length : 1) : 0)
    + 1 + (showWeeks ? shownWeeks.length : 0)
    + (openSR ? heads.length : 1)
    + (showWD ? (hrMonth ? 3 : 2) : 0) + 1
    + (openCDI ? 3 : 1) + 3 + (openLead ? cats.length : 1);

  // ---- header --------------------------------------------------------------
  // Dark-grey grid, black titles.
  const thBase = 'px-1.5 py-1.5 text-[9.5px] font-semibold text-black text-center border-b border-l border-gray-400 whitespace-nowrap';
  const grpTh = 'px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-black text-center border-b border-l border-gray-400 whitespace-nowrap';
  // every header cell carries the SAME grey, applied inline so no Tailwind
  // bg-* class can slip a different shade in
  const HB = { background: C_HEAD };

  // ---- export --------------------------------------------------------------
  // Written with exceljs (loaded on demand, same as the Sales & Labour report)
  // so the workbook is the table, not a flat dump: one blue ERP band carrying
  // the selected period, the SAME two grouped header rows with merged group
  // titles, branch → engineer → Sub Total hierarchy (collapsible in Excel via
  // row outlining) and the dark Grand Total row. Zeros export blank, matching
  // the dash on screen.
  const exportExcel = async () => {
    try {
      const _ex = await import('exceljs');
      const ExcelJS = _ex.default || _ex;

      // -- palette (the values the page paints with) --
      // the light-blue GRID set, mirroring the screen. Spelled out as hex here
      // because exceljs wants ARGB strings, not CSS colours.
      const BRAND = '2F3192', GRPHEAD = 'E8F3FC', SUBHEAD = 'E8F3FC',
        GRIDLINE = '9FC0DF', WKCOL = 'E8F3FC', SE_A = 'FBFDFF', SE_B = 'F1F8FE',
        BTOT = 'DCEBF9', GTOT = 'CBE1F5', REGTOT = '5E8FC2';
      const A = (hex) => ({ argb: `FF${hex}` });
      const thin = { style: 'thin', color: A(GRIDLINE) };
      const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
      const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: A(hex) });
      // indent 1: Excel has NO cell padding, so left/right aligned text sits
      // hard against the cell border unless it is indented. One character of
      // indent is what makes a name column read as a column and not as a wall.
      const CENTER = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const RIGHT = { horizontal: 'right', vertical: 'middle', indent: 1 };
      const LEFT = { horizontal: 'left', vertical: 'middle', indent: 1 };
      // Every value is written as a real NUMBER (0 included) — the zero part of
      // the format shows the same "-" the screen does, so nothing looks blank
      // and the columns still add up.
      const F_CNT = '#,##0;-#,##0;"-"', F_AMT = '#,##0;-#,##0;"-"', F_PR = '0.00;-0.00;"-"';
      const N = (v) => Number(v) || 0;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'KALA Care Global LLP';
      const ws = wb.addWorksheet('Employee Productivity', {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        // Excel's default row is tight enough that a grid this dense reads as
        // one slab; a couple of points of air makes the rows separable.
        properties: { defaultRowHeight: 16 },
      });
      // Deliberately NO frozen panes, NO row grouping and NO outline gutter:
      // the sheet must open flat with every column visible. (Setting
      // ws.properties.outlineProperties would also corrupt the file — exceljs
      // writes <pageSetUpPr> before <outlinePr> inside <sheetPr>, the reverse of
      // the order the XLSX schema fixes, and Excel then refuses to open it.)

      // ---- column widths, MEASURED from what is actually written ----------
      // Fixed widths guessed up front cannot know that this period has a
      // five-digit SR count or a 24-character engineer name, so the sheet used
      // to open cramped — values hard against the borders, a wide number one
      // digit away from '####'. Every cell reports its printed size instead and
      // each column takes the widest thing in it plus a couple of characters of
      // air (setColWidths, after the last row is written).
      const wCol = [], padCol = [];
      const bump = (c, n) => { if (!(wCol[c] >= n)) wCol[c] = n; };
      // printed length under the '#,##0' formats: digits + thousands separators
      const numW = (v) => {
        const d = String(Math.abs(Math.round(v))).length;
        return d + Math.floor((d - 1) / 3) + (v < 0 ? 1 : 0);
      };
      const measure = (c, v, o) => {
        // an aligned-left / right column also carries an indent, so it needs
        // one more character than its text
        if (o.align && o.align.horizontal && o.align.horizontal !== 'center') padCol[c] = 3;
        if (v === '' || v === null || v === undefined) return;
        if (typeof v === 'number') { bump(c, numW(v)); return; }
        const t = String(v);
        // A HEADER wraps, so only its longest WORD has to fit on one line;
        // ordinary text has to fit whole. That keeps 'Productivity (Close SR
        // / Working Days)' a normal column instead of a 25-character one.
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
        cl.font = { size: 10, ...(o.font || {}) };
        if (o.fill) cl.fill = fill(o.fill);
        cl.alignment = o.align || { vertical: 'middle' };
        if (o.fmt) cl.numFmt = o.fmt;
        measure(c, v, o);
        return cl;
      };

      // ---- column layout, mirroring the screen ----
      // A folded band exports as no columns at all — the sheet mirrors the
      // screen, the same rule the un-ticked week columns follow.
      const xHeads = openSR ? heads : [];
      const xCats = openLead ? cats : [];
      // Allocated SR is hidden (SHOW_ALLOC), so nAL / xEHeads collapse to
      // nothing and every column index after them shifts left — the same way a
      // folded band already exports as no columns at all.
      const nAL = SHOW_ALLOC ? 1 : 0;
      const xEHeads = SHOW_ALLOC && openAlloc ? eheads : [];
      // The toolbar's day-columns toggle. HR attendance only exists for a
      // period that is exactly one uploaded month, so it is 3 columns then and
      // 2 otherwise — the export mirrors the screen exactly.
      const nHR = showWD && hrMonth ? 1 : 0;
      const nWD = showWD ? 1 : 0;
      const nDP = showWD ? 1 : 0;
      // folded CDI still exports its % column — the same thing the screen keeps
      const nCDI = openCDI ? 3 : 1;
      const C_CPCT_OFF = openCDI ? 2 : 0;     // where % sits inside the band
      const C_BR = 1, C_UID = 2, C_NAME = 3;
      const C_AL = 4;                       // Allocate SR (hidden: nAL = 0)
      const C_EHEAD = C_AL + nAL;           // its SR Type split
      const C_SR = C_EHEAD + xEHeads.length;   // Close SR
      const C_WK = C_SR + 1;
      const nWk = showWeeks ? shownWeeks.length : 0;
      const C_HEAD = C_WK + nWk;
      const C_WD = C_HEAD + xHeads.length;
      const C_HR = C_WD + nWD;
      const C_DP = C_HR + nHR, C_PR = C_DP + nDP;
      const C_CDI = C_PR + 1;                 // Passive / Detractor / %
      const C_LD = C_CDI + nCDI;
      const C_CAT = C_LD + 1;
      // Spare Conv. Amount and Labour Conv. Amount are each SE | Other. There is
      // no Total column: a roll-up row merges its two cells into one total.
      const C_SPARE = C_CAT + xCats.length;
      const C_SP_OT = C_SPARE + 1;
      const C_LAB = C_SPARE + 2;
      const C_LB_OT = C_LAB + 1;
      const LAST = C_LB_OT;

      // ---- row 1: the blue ERP band with the selected period ----
      for (let c = 1; c <= LAST; c++) put(1, c, '', { fill: BRAND });
      const wkTxt = weekSel.size
        ? `${weekSel.size} of ${weeks.length} weeks` : `all ${weeks.length} weeks`;
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
      ws.getCell(1, 1).value = 'Service Engineer Productivity Based on SR Close   ·   '
        + `${fmtD(start)} → ${fmtD(end)} (${inclDays(start, end)} days)   ·   ${wkTxt}`
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
      // a title that spans both header rows
      const tall = (c, text, o = HD) => { put(2, c, text, o); put(3, c, '', o); ws.mergeCells(2, c, 3, c); };
      // a group title over its own sub-columns
      const band2 = (c, n, text) => {
        if (n <= 0) return;                       // folded band: no columns
        for (let k = 0; k < n; k++) put(2, c + k, '', GH);
        ws.getCell(2, c).value = text;
        if (n > 1) ws.mergeCells(2, c, 2, c + n - 1);   // a 1x1 merge is invalid
      };

      tall(C_BR, 'Branch Name');
      tall(C_UID, 'SE UID');
      tall(C_NAME, 'SE Name');
      if (nAL) tall(C_AL, 'Allocated SR');
      band2(C_EHEAD, xEHeads.length, 'SR Type (Allocated)');
      xEHeads.forEach((h, k) => put(3, C_EHEAD + k, h, HD));
      tall(C_SR, 'Close SR');
      if (nWk) {
        band2(C_WK, nWk, 'Weekly Close SR');
        shownWeeks.forEach((w, k) => put(3, C_WK + k, `${w.label}\n${w.range}`,
          { ...HD, fill: WKCOL }));
      }
      band2(C_HEAD, xHeads.length, 'SR Type (Closed)');
      xHeads.forEach((h, k) => put(3, C_HEAD + k, h, HD));
      if (nWD) tall(C_WD, 'Working Days');
      if (nHR) tall(C_HR, 'HR wise\nattendance');
      if (nDP) tall(C_DP, 'Days present\non Task end');
      // the derived column carries its formula in the title, as on screen
      tall(C_PR, 'Productivity\n(Close SR ÷ Working Days)');
      if (openCDI) {
        band2(C_CDI, 3, 'CDI');
        ['Passive', 'Detractor', '%\n(P − D) ÷ all × 100']
          .forEach((h, k) => put(3, C_CDI + k, h, HD));
      } else {
        tall(C_CDI, 'CDI %\n(P − D) ÷ all × 100');
      }
      tall(C_LD, 'Number of Lead');
      band2(C_CAT, xCats.length, 'Product Wise Lead Count');
      xCats.forEach((c, k) => put(3, C_CAT + k, c, HD));
      band2(C_SPARE, 2, 'Spare Conv. Amount');
      ['SE', 'Other'].forEach((h, k) => put(3, C_SPARE + k, h, HD));
      band2(C_LAB, 2, 'Labour Conv. Amount');
      ['SE', 'Other'].forEach((h, k) => put(3, C_LAB + k, h, HD));
      ws.getRow(2).height = 20;
      ws.getRow(3).height = 38;

      // ---- body ----
      // One data row. `o` carries the row's fill / font so totals read as totals.
      // skipOther: the Other / Total cells are written once for the whole branch
      // block and merged down, so the rows inside it must not overwrite them.
      const dataRow = (r, t, o = {}, kind = ROW_TOTAL, skipOther = false) => {
        // the screen's rule, in the sheet: Working Days / Days present are
        // per-engineer, so a roll-up row leaves both blank
        const perSE = kind === ROW_SE;
        if (nAL) put(r, C_AL, N(t.alloc), { ...o, align: CENTER, fmt: F_CNT, font: { ...(o.font || {}), bold: true } });
        xEHeads.forEach((h, k) => put(r, C_EHEAD + k, N(t.eheads[k]), { ...o, align: CENTER, fmt: F_CNT }));
        put(r, C_SR, N(t.sr), { ...o, align: CENTER, fmt: F_CNT, font: { ...(o.font || {}), bold: true } });
        shownWeeks.forEach((w, k) => {
          if (!nWk) return;
          put(r, C_WK + k, N(t.weekly[w.i]), { ...o, align: CENTER, fmt: F_CNT, fill: o.fill || WKCOL });
        });
        xHeads.forEach((h, k) => put(r, C_HEAD + k, N(t.heads[k]), { ...o, align: CENTER, fmt: F_CNT }));
        if (nWD) put(r, C_WD, perSE ? N(Math.round(t.work)) : '', { ...o, align: CENTER, fmt: F_CNT });
        if (nHR) put(r, C_HR, perSE && t.hr ? t.hr : '', { ...o, align: CENTER, fmt: F_CNT });
        if (nDP) put(r, C_DP, perSE ? N(t.present) : '', { ...o, align: CENTER, fmt: F_CNT });
        // The SAME divisor as the screen: the ROUNDED working days, so the
        // sheet's Productivity ties up with its own Working Days column instead
        // of carrying the proration remainder.
        put(r, C_PR, prDenom(t) > 0 ? +(t.sr / prDenom(t)).toFixed(2) : 0,
          { ...o, align: CENTER, fmt: F_PR, font: { ...(o.font || {}), bold: true } });
        const cdiAll = t.cdi[0] + t.cdi[1] + t.cdi[2];
        if (openCDI) {
          // cdi[2] = Passive, the column that replaced Promotor on screen
          put(r, C_CDI, N(t.cdi[2]), { ...o, align: CENTER, fmt: F_CNT });
          put(r, C_CDI + 1, N(t.cdi[1]), { ...o, align: CENTER, fmt: F_CNT });
        }
        put(r, C_CDI + C_CPCT_OFF,
          cdiAll ? +(((t.cdi[0] - t.cdi[1]) / cdiAll) * 100).toFixed(1) : 0,
          { ...o, align: CENTER, fmt: '0.0;-0.0;"-"', font: { ...(o.font || {}), bold: true } });
        put(r, C_LD, N(t.leads), { ...o, align: CENTER, fmt: F_CNT });
        xCats.forEach((c, k) => put(r, C_CAT + k, N(t.cats[k]), { ...o, align: CENTER, fmt: F_CNT }));
        // Other is a BRANCH figure: an engineer row leaves it empty and its Total
        // is its own SE figure, exactly as on screen.
        const amt = { ...o, align: RIGHT, fmt: F_AMT };
        const amtB = { ...amt, font: { ...(o.font || {}), bold: true } };
        if (!perSE) {
          // The sheet only ever writes TOTAL rows (it always expands a branch),
          // so SE and Other merge into one figure, as they do on screen.
          [[C_SPARE, C_SP_OT, t.spare + t.oSpare],
           [C_LAB, C_LB_OT, t.labour + t.oLabour]].forEach(([c1, c2, v]) => {
            put(r, c1, N(Math.round(v)), amtB);
            put(r, c2, '', amtB);
            ws.mergeCells(r, c1, r, c2);
            ws.getCell(r, c1).alignment = { vertical: 'middle', horizontal: 'right' };
          });
          return;
        }
        put(r, C_SPARE, N(Math.round(t.spare)), amt);
        put(r, C_LAB, N(Math.round(t.labour)), amt);
        if (skipOther) return;
        put(r, C_SP_OT, '', amt);
        put(r, C_LB_OT, '', amt);
      };
      // The branch's Other figure, written once at the top of the ENGINEER rows
      // and merged down them — the sheet's echo of the screen's rowSpan. It
      // stops above the Sub Total row, which carries its own merged total.
      const mergedOther = (rFrom, rTo, t) => {
        const st = { fill: BTOT, align: RIGHT, fmt: F_AMT, font: { bold: true } };
        [[C_SP_OT, t.oSpare], [C_LB_OT, t.oLabour]].forEach(([c, v]) => {
          put(rFrom, c, N(Math.round(v)), st);
          for (let rr = rFrom + 1; rr <= rTo; rr++) put(rr, c, '', st);
          if (rTo > rFrom) ws.mergeCells(rFrom, c, rTo, c);
          ws.getCell(rFrom, c).alignment = { vertical: 'middle', horizontal: 'right' };
        });
      };
      const labelRow = (r, branch, uid, name, o = {}) => {
        put(r, C_BR, branch, { ...o, align: LEFT });
        put(r, C_UID, uid, { ...o, align: CENTER });
        put(r, C_NAME, name, { ...o, align: LEFT });
      };

      let r = 4;
      visibleGroups.forEach((g, gi) => {
        const single = g.length === 1;
        g.forEach((bi) => {
          const ses = seOf(bi);
          const rFirst = r;
          // No separate branch summary row — the Sub Total row below already
          // carries the branch's figures, so each branch appears once.
          const bTotX = sumBranch(bi);
          ses.forEach((ei, i) => {
            const bg = i % 2 ? SE_B : SE_A;
            labelRow(r, '', employees[ei].u || '', employees[ei].n, { fill: bg });
            // the branch name goes on the first engineer row and is merged down
            // the block, so it keeps a plain background like the screen
            if (i === 0) put(r, C_BR, shortBranch(branches[bi]), { align: LEFT, font: { bold: true } });
            dataRow(r, seRow(ei), { fill: bg }, ROW_SE, ses.length > 0);
            r += 1;
          });
          labelRow(r, ses.length ? '' : shortBranch(branches[bi]), '',
            `Sub Total (${ses.length} SE${ses.length === 1 ? '' : 's'})`,
            { fill: BTOT, font: { bold: true } });
          dataRow(r, bTotX, { fill: BTOT, font: { bold: true } });
          r += 1;
          // the branch name spans its engineers + Sub Total, like the screen
          if (r - 1 > rFirst) ws.mergeCells(rFirst, C_BR, r - 1, C_BR);
          // Other spans the ENGINEER rows only (r - 2 is the last of them):
          // the Sub Total row holds its own merged SE + Other total.
          if (ses.length) mergedOther(rFirst, r - 2, bTotX);
        });
        if (!single) {
          labelRow(r, 'Sub Total', '', `${g.length} branches`, { fill: GTOT, font: { bold: true } });
          dataRow(r, sumBranches(g), { fill: GTOT, font: { bold: true } });
          r += 1;
        }
        // the region roll-up, in the same place as on screen: MH after its last
        // group (Ahilyanagar), KA at the bottom just above the Grand Total
        if (lastOfRegion[regionAt(gi)] === gi) {
          const rg = regionAt(gi);
          const list = allVisible.filter((bi) => regionOf(bi) === rg);
          if (list.length) {
            const RT = { fill: REGTOT, font: { bold: true, color: A('FFFFFF') } };
            labelRow(r, `${rg} Total`, '', `${list.length} branch${list.length === 1 ? '' : 'es'}`, RT);
            dataRow(r, sumBranches(list), RT);
            r += 1;
          }
        }
      });

      // ---- grand total, in the brand colour ----
      const GT = { fill: BRAND, font: { bold: true, color: A('FFFFFF') } };
      labelRow(r, 'Grand Total', '', 'All branches', GT);
      dataRow(r, grand, GT);
      ws.getRow(r).height = 20;

      // every cell is written, so the columns can now size themselves
      setColWidths(LAST);

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `PMS_Employee_Productivity_${start}_to_${end}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Employee Productivity exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  const seItems = [];
  branches.forEach((b, bi) => {
    if (brSel.size && !brSel.has(bi)) return;
    byBranch[bi].forEach((ei) => seItems.push({ v: ei, t: employees[ei].n, sub: shortBranch(b) }));
  });
  seItems.sort((a, b) => a.t.localeCompare(b.t));

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* ---- title bar: TWO rows. The title and its period line share the
           first one; EVERY filter control sits on the second, so a report with
           many controls no longer squeezes the title into a narrow column. ---- */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
        {/* items-baseline: the small grey period line sits ON the title's
            baseline rather than floating at its mid-height */}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className="text-sm font-extrabold text-gray-900">Service Engineer Productivity Based on SR Close</p>
          <p className="text-[10px] text-gray-400">
            {fmtD(start)} → {fmtD(end)} · {weeks.length} week{weeks.length > 1 ? 's' : ''}
            {weekSel.size ? ` · ${weekSel.size} ticked` : ''}
          </p>
        </div>
        {/* every filter / toggle / export control, pushed to the RIGHT edge
            under the title. FilterRow keeps them on ONE line by narrowing the
            SEARCH BOX when they would spill (see index.css) — watch = everything
            that changes the row's WIDTH: a control appearing (the Weeks ticks
            ride with Weekly Close SR), a label growing ('Expand all' ->
            'Collapse all'), a trigger's count replacing 'All'. */}
        <FilterRow watch={`${showWeeks}-${showWD}-${anyOpen}-${weeks.length}`
          + `-${brSel.size}-${seSel.size}-${weekSel.size}`}>
          {/* One toggle for the whole tree: it reads the state, so it says
              Collapse while anything is open and Expand while everything is shut.
              It opens groups and branches down to the ENGINEER rows. */}
          <button onClick={() => {
            if (anyOpen) {
              setOpenGroups(new Set());
              setOpenBranches(new Set());
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

          <button
            onClick={() => {
              // Turning the weekly columns OFF also clears the week ticks: the
              // ticks filter the WHOLE report, not just those columns, so leaving
              // them set behind a hidden dropdown would filter invisibly.
              if (showWeeks) setWeekSel(new Set());
              setShowWeeks(!showWeeks);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showWeeks ? 'text-white border-[#2f3192]' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
            style={showWeeks ? { backgroundColor: THEME } : {}}>
            <span className={`text-[8px] transition-transform ${showWeeks ? 'rotate-90' : ''}`}>▶</span>
            {/* the weekly columns split CLOSE SR, not the allocated one — say so */}
            Weekly Close SR{weeks.length > 1 ? ` (W1–W${weeks.length})` : ''}
          </button>

          {/* The Weeks ticks belong to the weekly columns, so the dropdown only
              exists while they are shown. */}
          {showWeeks && (
            <MultiSelect label="Weeks" searchable={false} selected={weekSel} onChange={setWeekSel}
              items={weeks.map((w) => ({ v: w.n, t: w.label, sub: w.range }))} />
          )}

          {/* A COLUMN toggle, not a filter: it hides the three per-engineer DAY
              columns — Working Days, HR wise attendance (only for an uploaded
              month) and Days present — on screen and in the export, and changes
              nothing else. Productivity keeps dividing by whichever of them its
              own header names, so the button never moves a number — which is why
              it does not re-minimize the tree the way the filters above do. */}
          <button onClick={() => setShowWD(!showWD)}
            title={showWD ? 'Hide the day columns (screen and export)'
              : 'Show the day columns — Working Days, HR attendance, Days present'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showWD ? 'text-white border-[#2f3192]' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
            style={showWD ? { backgroundColor: THEME } : {}}>
            <span className={`text-[8px] transition-transform ${showWD ? 'rotate-90' : ''}`}>▶</span>
            Day columns
          </button>

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
            <button onClick={exportExcel}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
          )}
        </FilterRow>
      </div>

      {/* pb-1: the Grand Total is PINNED to the bottom of the viewport,
          so padding under the table reads as a gap beneath it */}
      <div className="px-2 pt-2 pb-1">
        {meta.unlinked_leads > 0 && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            <b>{meta.unlinked_leads.toLocaleString('en-IN')}</b> lead{meta.unlinked_leads > 1 ? 's are' : ' is'} not
            counted — their LMS <i>Service Engineer UID</i> is not in the SE UID Master. Open
            <b> Profile → SE UID Master</b> and add the UID to that engineer&apos;s row.
          </div>
        )}
        <div className="border border-gray-400 rounded-xl overflow-hidden">
          <HScrollBox watch={`${showWeeks}-${showWD}-${seOpen}-${openAlloc}-${openSR}-${openCDI}-${openLead}-${rows.length}-${shownWeeks.length}-${heads.length}`}>
            <table className="pms-grid border-separate [border-spacing:0]" style={{ width: 'max-content', minWidth: '100%' }}>
              <thead style={{ position: 'relative', zIndex: 30 }}>
                <tr>
                  <th rowSpan={2} style={{ ...stick(0, W_GRP), zIndex: 12, ...HB }}
                    /* border-r: the body's group cells draw one, the header did not,
                       leaving the vertical line broken across the title rows */
                    className={`${grpTh} !border-l-0 border-r border-gray-400`} />
                  <th rowSpan={2} style={{ ...stick(OFF_BRANCH, W_BRANCH), zIndex: 12, ...HB }}
                    className={`${grpTh} !whitespace-normal border-r border-gray-400`}>Branch Name</th>
                  {/* !border-l-0: the cell on the left already draws that line —
                      two adjacent 1px borders would render as a double rule. */}
                  {seOpen && (
                    <th rowSpan={2} style={{ ...stick(OFF_UID, W_UID), zIndex: 12, ...HB }}
                      className={`${grpTh} !whitespace-normal !border-l-0 border-r border-gray-400`}>SE UID</th>
                  )}
                  {seOpen && (
                    <th rowSpan={2} style={{ ...stick(OFF_NAME, W_NAME), zIndex: 12, ...HB, ...EDGE_R }}
                      className={`${grpTh} !whitespace-normal !border-l-0`}>SE Name</th>
                  )}
                  {SHOW_ALLOC && (
                    <th rowSpan={2} style={HB} className={`${thBase} !border-l-0`}>Allocated<br />SR</th>
                  )}
                  {SHOW_ALLOC && (openAlloc ? (
                    <th colSpan={eheads.length} onClick={() => setOpenAlloc(false)} style={HB}
                      className={`${grpTh} cursor-pointer pms-hover`}
                      title="Hide the allocated SR Type split">
                      <span className="inline-block mr-1 text-[9px] rotate-90">▶</span>SR Type (Allocated)
                    </th>
                  ) : (
                    <th rowSpan={2} style={{ ...foldCol, ...HB }} onClick={() => setOpenAlloc(true)}
                      className={`${grpTh} !whitespace-normal cursor-pointer pms-hover`}
                      title="Show the allocated SR Type split">
                      <span className="inline-block mr-1 text-[9px]">▶</span>SR Type (Alloc.)
                    </th>
                  ))}
                  {/* first data column while Allocated SR is hidden — it drops the
                      section divider and takes the !border-l-0 instead */}
                  <th rowSpan={2} style={SHOW_ALLOC ? { ...HB, borderLeft: DIV } : HB}
                    className={`${thBase}${SHOW_ALLOC ? '' : ' !border-l-0'}`}>Close<br />SR</th>
                  {showWeeks && (
                    <th colSpan={shownWeeks.length} className={grpTh} style={HB}>Weekly Close SR</th>
                  )}
                  {openSR ? (
                    <th colSpan={heads.length} onClick={() => setOpenSR(false)} style={HB}
                      className={`${grpTh} cursor-pointer pms-hover`}
                      title="Hide the SR Type split">
                      <span className="inline-block mr-1 text-[9px] rotate-90">▶</span>SR Type (Closed)
                    </th>
                  ) : (
                    <th rowSpan={2} style={{ ...foldCol, ...HB }} onClick={() => setOpenSR(true)}
                      className={`${grpTh} !whitespace-normal cursor-pointer pms-hover`}
                      title="Show the SR Type split">
                      <span className="inline-block mr-1 text-[9px]">▶</span>SR Type (Closed)
                    </th>
                  )}
                  {showWD && (
                    <th rowSpan={2} style={HB} className={thBase}>Working<br />Days</th>
                  )}
                  {showWD && hrMonth && (
                    <th rowSpan={2} className={`${thBase} !whitespace-normal`}
                      style={{ width: 78, minWidth: 78, maxWidth: 78, ...HB }}
                      title={`HR's own days worked in ${fmtMonth(hrMonth)}, off the attendance file `
                        + 'uploaded on the SE UID Master (Profile). Present and Out Door Duty count a day each '
                        + 'and a Half Day counts half; leave, absent, weekly off, C off and holidays count '
                        + 'nothing. A whole-month figure, so the column appears only while the period is '
                        + 'exactly one uploaded calendar month — a dash is an engineer HR’s file does not list.'}>
                      HR wise<br />attendance
                    </th>
                  )}
                  {showWD && (
                    <th rowSpan={2} className={`${thBase} !whitespace-normal`}
                      style={{ width: 78, minWidth: 78, maxWidth: 78, ...HB }}
                      title="Distinct SR TASK END DATEs — the days the engineer finished a job in the field">
                      Days present<br />on Task end
                    </th>
                  )}
                  {/* The derived column names its own divisor, and lets it be
                      changed — the three day columns measure different things
                      and the business reads productivity against each of them. */}
                  <th rowSpan={2} className={`${thBase} !whitespace-normal`}
                    style={{ width: 78, minWidth: 78, maxWidth: 78, ...HB }}>
                    Product-<br />ivity
                    <span className="block font-normal text-[8px] leading-tight text-gray-600">
                      Close SR ÷ Working Days
                    </span>
                  </th>
                  {openCDI ? (
                    <th colSpan={3} onClick={() => setOpenCDI(false)} style={{ ...HB, borderLeft: DIV }}
                      className={`${grpTh} cursor-pointer pms-hover`}
                      title="Hide the CDI split">
                      <span className="inline-block mr-1 text-[9px] rotate-90">▶</span>CDI
                    </th>
                  ) : (
                    /* folded: Promotor + Detractor go, the % column stays */
                    <th rowSpan={2} style={{ ...foldCol, ...HB, borderLeft: DIV }} onClick={() => setOpenCDI(true)}
                      className={`${grpTh} !whitespace-normal cursor-pointer pms-hover`}
                      title="Show the CDI split (Passive / Detractor)">
                      <span className="inline-block mr-1 text-[9px]">▶</span>CDI %
                      <span className="block font-normal normal-case tracking-normal text-[8px] leading-tight text-gray-600">
                        (P − D) ÷ all × 100
                      </span>
                    </th>
                  )}
                  <th rowSpan={2} style={{ ...HB, borderLeft: DIV }} className={thBase}>Number<br />of Lead</th>
                  {openLead ? (
                    <th colSpan={cats.length} onClick={() => setOpenLead(false)} style={HB}
                      className={`${grpTh} cursor-pointer pms-hover`}
                      title="Hide the product-wise lead split">
                      <span className="inline-block mr-1 text-[9px] rotate-90">▶</span>Product Wise Lead Count
                    </th>
                  ) : (
                    <th rowSpan={2} style={{ ...foldCol, ...HB }} onClick={() => setOpenLead(true)}
                      className={`${grpTh} !whitespace-normal cursor-pointer pms-hover`}
                      title="Show the product-wise lead split">
                      <span className="inline-block mr-1 text-[9px]">▶</span>Lead Count
                    </th>
                  )}
                  <th colSpan={2} style={{ ...HB, borderLeft: DIV }} className={grpTh}
                    title="Part Invoice Amount, on the ORDER CREATION DATE (LMS Data from Insia, matched on Lead Number). Excludes OTC Quotation.">
                    Spare Conv. Amount</th>
                  <th colSpan={2} style={{ ...HB, borderLeft: DIV }} className={grpTh}
                    title="Labour Invoice Amount, on the ORDER CREATION DATE (LMS Data from Insia, matched on Lead Number).">
                    Labour Conv. Amount</th>
                </tr>
                <tr>
                  {SHOW_ALLOC && openAlloc && eheads.map((h) => (
                    <th key={`e-${h}`} className={`${thBase} !whitespace-normal`}
                      lang="en" style={{ ...subCol, ...HB, ...wrapTh }} title={h}>{thLabel(h)}</th>
                  ))}
                  {showWeeks && shownWeeks.map((w) => (
                    <th key={w.n} className={`${thBase} !whitespace-normal`}
                      style={{ ...subCol, ...HB }} title={w.range}>
                      {w.label}<span className="block font-normal text-[8.5px] text-gray-600">{w.range}</span>
                    </th>
                  ))}
                  {/* lang + wrapTh: 'Unmapped' is one long word and used to
                      overflow its 54px column; it now hyphenates inside it. */}
                  {openSR && heads.map((h) => (
                    <th key={h} className={`${thBase} !whitespace-normal`}
                      lang="en" style={{ ...subCol, ...HB, ...wrapTh }} title={h}>{thLabel(h)}</th>
                  ))}
                  {openCDI && (
                    <th className={`${thBase} !whitespace-normal`} lang="en"
                      style={{ ...subCol, ...HB, ...wrapTh, borderLeft: DIV }}
                      title="Passive feedback - neither Promotor nor Detractor">Passive</th>
                  )}
                  {openCDI && (
                    <th className={`${thBase} !whitespace-normal`} style={{ ...subCol, ...HB }}>Detractor</th>
                  )}
                  {openCDI && (
                  <th className={`${thBase} !whitespace-normal`}
                    style={{ width: 70, minWidth: 70, maxWidth: 70, ...HB }}>
                    %
                    <span className="block font-normal text-[8px] leading-tight text-gray-600">
                      (P − D) ÷ all × 100
                    </span>
                  </th>
                  )}
                  {openLead && cats.map((c) => (
                    <th key={c} className={`${thBase} !whitespace-normal`}
                      lang="en" style={{ ...subCol, ...HB, ...wrapTh }} title={c}>{thLabel(c)}</th>
                  ))}
                  <th className={thBase} style={{ ...amtCol, ...HB, borderLeft: DIV }}
                    title="Spare converted by THIS engineer">SE</th>
                  <th className={thBase} style={{ ...amtCol, ...HB }}
                    title="Spare converted on leads that carry NO Service Engineer - a BRANCH figure. Every total row merges SE + Other into one cell.">
                    Other</th>
                  <th className={thBase} style={{ ...amtCol, ...HB, borderLeft: DIV }}
                    title="Labour converted by THIS engineer">SE</th>
                  <th className={thBase} style={{ ...amtCol, ...HB }}
                    title="Labour converted on leads that carry NO Service Engineer - a BRANCH figure. Every total row merges SE + Other into one cell.">
                    Other</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="text-center py-6 text-xs text-gray-500 border-b border-gray-400">
                      No engineer activity in this selection.
                    </td>
                  </tr>
                ) : rows}
              </tbody>
              {/* Grand Total lives in a <tfoot> so it can float at the bottom
                  of the viewport the same way the head floats at the top. */}
              <tfoot style={{ position: 'relative', zIndex: 28 }}>
                <tr className="font-bold text-white">
                  {/* every pinned column merged into one centred label */}
                  <td colSpan={seOpen ? 4 : 2} style={{ position: 'sticky', left: 0, zIndex: 6,
                    width: W_LABEL_ALL, minWidth: W_LABEL_ALL, maxWidth: W_LABEL_ALL,
                    background: C_GRAND, ...EDGE_R }}
                    className="px-1.5 py-1.5 text-center text-[11px] border-y border-gray-900">
                    Grand Total
                  </td>
                  {dataCells(grand, 'grand', ROW_TOTAL, null, true).map((c) =>
                    React.cloneElement(c, {
                      className: `${c.props.className} !text-white !border-t !border-t-gray-900`,
                      style: { ...(c.props.style || {}), background: C_GRAND, color: '#fff' },
                    }))}
                </tr>
              </tfoot>
            </table>
          </HScrollBox>
        </div>

      </div>

      {/* The engineer's own Close SR records — opened from the SE name, bounded
          by the SAME period the table is showing so the count matches the row. */}
      {seDetail && (
        <SEDetailModal mode={seDetail.other ? 'ep-other' : 'ep'}
          name={seDetail.name} uid={seDetail.uid} region={seDetail.region}
          branch={seDetail.branch} branchId={seDetail.branchId}
          from={start} to={end} onClose={() => setSeDetail(null)} />
      )}
    </div>
  );
};

export default EmployeeProductivityReport;
