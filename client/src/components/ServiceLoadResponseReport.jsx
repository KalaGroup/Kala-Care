import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import {
  XL, A, CENTER, LEFT, F_CNT, loadExcelJS, newSheet, saveBook,
} from '../utils/pmsExport';
import { GRID, THEME, TopScrollbar, HScrollBox, MultiSelect } from './reportChrome';

/* ----------------------------------------------------------------------------
   Annual Reports → SERVICE LOAD AND RESPONSE.

   Source (GET /pms/report/annual/service-load): the RESPONSE TIME & MaxTTR
   DETAILS import and only it, counted on SR CLOSE DATE in the branch its
   BRANCH ID resolves to.

   The printed sheet is four pages; this is SIX TABS — its response page carries
   two independent measures, and its closing all-branch blocks summarise the
   whole sheet rather than belonging to the 48-hour page. Same rows, same order:

     Service Load              the SR-type-wise breakdown (grouped by the
                               'SR Type Master (Service Load)') and its Total,
                               then the same load again by branch under MH / KA,
                               closing on the Grand Total
     Productivity              Calls PP PD per region, branch and overall, plus
                               the 'Service Request Closure (Nos.)' month strip
     4 Hrs Response            4 HRS RESPONSE % per region and branch
     SR Closed 24 Hrs          SR CLOSED WITHIN 24 HRS % per region and branch
     SR Closed 48 Hrs          SR CLOSED WITHIN 48 HRS % per region and branch
     Overall & FTR/FVR         the two all-branch blocks the printed sheet
                               closes on: MAX TTR Overall, and the FTR / FVR
                               figures TYPED in AOP & Master (nothing uploaded
                               can produce them, so they are asserted)

   One fetch and one aggregation serve them all: switching tab only picks which
   of the already-built rows to draw.

THE THREE COMPLIANCE PERCENTAGES ARE SCOPED TO SR TYPE 'Warranty' and read
   two different columns — 'Response Time' for the 4-hour row, 'MaxTTR on SR
   Closed in hrs' for the 24 and 48-hour ones, because responding and closing
   are different measures. Both are taken from the file as they stand and never
   recomputed from timestamps: SR OPEN DATE is a SCHEDULED date on planned work,
   often LATER than the close date, so open -> close is not a service level on
   42% of the file.

   A NEGATIVE duration is EXCLUDED from both halves. Such a row is planned work
   closed before its scheduled date, so there is no elapsed time to score —
   neither a pass nor a breach. That is why these rows divide by 'scorable
   Warranty SRs' rather than by the SR count the Service Load tab shows, and a
   cell says on hover how many it left out.

   PRODUCTIVITY divides by the branch's SE HEADCOUNT, typed in the AOP master,
   times its working days. The file only names engineers who closed something,
   which would flatter any branch with a person on leave. Working days are exact
   — days in the window, minus Sundays, minus the region's ticked holidays — so a
   week containing 15 Aug loses that day.

   EVERY PERCENTAGE ROW IS SCORED FROM ITS OWN SRs, never averaged from the
   rows beneath it: a region row divides the region's compliant SRs by the
   region's SRs. That is why a region row can sit outside the range of its
   branches. Productivity is the same — a region's closures over the region's
   man-days, not the mean of its branches.

   ACROSS TIME, THOUGH, A CUMULATIVE COLUMN IS AN AVERAGE. A month or a week
   column is one window and is scored directly, but Cumm FY(n) scores each of
   its months on its own and then takes the mean of those percentages — the
   business reads a year as 'how we did each month, on average'. One ratio over
   the whole year is a different number (FY26-27 to date: 57% averaged against
   56.6% straight) because it lets a heavy month drown out a light one. A month
   with no SR at all has no percentage and is left out of the mean.

   THE COLUMNS FOLLOW THE FINANCIAL YEAR picked at the top, identically to the
   CDI sheet: Cumm FY(n−2) / FY(n−1), the AOP, Cumm FY(n), then one column per
   whole month, with the WORKING month (the last one, while it is still running)
   opened up into its Mon–Sun weeks instead.

   Payload: records[[branchIdx, isoCloseDate, headIdx, n, within4hrs, closed24,
   closed48, …]] — raw per-day, so every column above is re-aggregated here
   without a refetch. headIdx −1 is the 'no head' bucket: those SRs get their own
   balancing row and nothing else. There is no engineer dimension: productivity
   divides by the branch's TYPED headcount, so the file's SE names are not read.
---------------------------------------------------------------------------- */

const pd = (s) => new Date(s + 'T00:00:00');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtD = (s) => (s ? pd(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');
const fmtDayYr = (s) => (s ? pd(s).toLocaleDateString('en-GB',
  { day: '2-digit', month: 'short', year: '2-digit' }) : '');
const shortBranch = (b) => String(b || '').replace(/^KALA\s*Care\s*Global\s*LLP\s*[-–]\s*/i, '');
const nf = (v) => (v || 0).toLocaleString('en-IN');

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym) => `${MONTH_SHORT[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`;
const fyOf = (isoDate) => {
  const y = Number(isoDate.slice(0, 4));
  return Number(isoDate.slice(5, 7)) >= 4 ? y : y - 1;
};
const fyShort = (fy) => `FY${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
const daysInMonth = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const monthEndOf = (ym) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
const inclDays = (a, b) => Math.round((pd(b) - pd(a)) / 86400000) + 1;

// The branch id's trailing number, so the rows read 1..7 / 8..14 whatever order
// the payload registered them in.
const branchNo = (id) => {
  const m = String(id || '').match(/_(\d+)$/);
  return m ? Number(m[1]) : 9999;
};

// Non-Sunday days of a month — the working-days fallback when the AOP master
// has no row for it (the same rule the backend's report uses).
const sundaysExcluded = (y, m) => {
  const dim = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= dim; d += 1) if (new Date(y, m - 1, d).getDay() !== 0) n += 1;
  return n;
};

// The twelve 'YYYY-MM' of a financial year, April first.
const fyMonths = (fy) => Array.from({ length: 12 }, (_v, i) => {
  const m = 4 + i;
  return m <= 12 ? `${fy}-${String(m).padStart(2, '0')}`
    : `${fy + 1}-${String(m - 12).padStart(2, '0')}`;
});

// Mon–Sun calendar weeks of ONE month, clipped to the period. Week-1 is the
// month's first week however short it is, so the numbering is the month's own
// and does not shift when the period starts mid-month.
const weeksOfMonth = (ym, winStart, winEnd) => {
  const last = monthEndOf(ym);
  const out = [];
  let cur = `${ym}-01`;
  let n = 1;
  while (cur <= last) {
    const dowMon = (pd(cur).getDay() + 6) % 7;          // Mon = 0
    let we = addDays(cur, 6 - dowMon);
    if (we > last) we = last;
    const s = cur > winStart ? cur : winStart;
    const e = we < winEnd ? we : winEnd;
    if (s <= e) out.push({ n, start: s, end: e });
    cur = addDays(we, 1);
    n += 1;
  }
  return out;
};

// ---- the four pages of the printed sheet -----------------------------------
// The tabs whose cells are percentages judged against an AOP — the ones that
// carry the colour key, on screen and in the workbook alike.
const SCORED_SECTIONS = ['resp4', 'closed24', 'closed48', 'overall'];

const SECTIONS = [
  { key: 'load', name: 'Service Load',
    sub: 'SR-type-wise load per branch', sheet: 'Service Load',
    formula: 'Count = SRs closed in the period',
    note: 'Total = the head rows added up' },
  { key: 'productivity', name: 'Productivity',
    sub: 'Calls per person per day', sheet: 'Productivity',
    formula: 'Calls PP PD = closures ÷ (SE headcount × working days)',
    note: 'headcount from AOP & Master · working days exclude Sundays and holidays' },
  { key: 'resp4', name: '4 Hrs Response',
    sub: 'Responded within 4 hrs', sheet: '4 Hrs Response',
    formula: '% = Warranty SRs with Response Time ≤ 4 hrs ÷ scorable Warranty SRs × 100',
    note: "SR TYPE 'Warranty' only · negative durations excluded" },
  { key: 'closed24', name: 'SR Closed 24 Hrs',
    sub: 'Closed within 24 hrs', sheet: 'SR Closed 24 Hrs',
    formula: '% = Warranty SRs with MaxTTR ≤ 24 hrs ÷ scorable Warranty SRs × 100',
    note: 'from MaxTTR on SR Closed in hrs · negative durations excluded' },
  { key: 'closed48', name: 'SR Closed 48 Hrs',
    sub: 'Closed within 48 hrs', sheet: 'SR Closed 48 Hrs',
    formula: '% = Warranty SRs with MaxTTR ≤ 48 hrs ÷ scorable Warranty SRs × 100',
    note: 'from MaxTTR on SR Closed in hrs · negative durations excluded' },
  { key: 'overall', name: 'Overall & FTR/FVR',
    sub: 'All-branch MaxTTR · first time right', sheet: 'Overall and FTR-FVR',
    formula: 'MAX TTR = all 14 branches pooled, then scored',
    note: 'FTR / FVR are typed in AOP & Master, not counted' },
];

// ---- the sheet's row metrics -----------------------------------------------
// count   an SR count       heads: which breakdown heads to add up
// prod    Calls PP PD       count ÷ (working days × distinct engineers)
// resp4 / closed24 / closed48   a compliance share; the number is the record's
//                               matching numerator slot
// The accumulator, slot by slot:
//   [0] SRs in the cell — the LOAD, every SR type
//   [1] Warranty SRs answered <= 4 hrs      [2] Warranty SRs scorable for that
//   [3] Warranty SRs closed <= 24 hrs       [4] ...<= 48 hrs
//   [5] Warranty SRs scorable for closure   [6] Warranty SRs in the cell
//
// Each compliance measure carries its OWN denominator: all three are scoped to
// SR TYPE 'Warranty', the 4-hour one reads Response Time and the other two read
// MaxTTR on SR Closed in hrs, and a NEGATIVE duration in either column is out of
// both halves — planned work closed before its scheduled date has no duration to
// score. So the three cannot share the SR count the Service Load tab shows.
const PCT_NUM = { resp4: [1, 2], closed24: [3, 5], closed48: [4, 5] };
const WARRANTY_N = 6;
const SLOTS = 7;
// FTR and FVR are not counted from anything — they are typed into AOP & Master
// and printed as entered. Keyed by what the column COVERS: a month, or a whole
// financial year for the Cumm columns.
const MANUAL_METRICS = { ftr: true, fvr: true };
const METRIC_LABEL = {
  resp4: '4 HRS RESPONSE', closed24: 'SR CLOSED WITHIN 24 HRS',
  closed48: 'SR CLOSED WITHIN 48 HRS',
  ftr: '(FIRST TIME RIGHT) FTR %', fvr: '(FIRST VISIT REPORT) FVR %',
};

// Which stored period a column reads. A month column takes its own month; a
// Cumm FY column the whole year; a week has no typed figure of its own.
const manualPeriodOf = (c) => (c.kind === 'month' ? c.key
  : ((c.kind === 'prev' || c.kind === 'cum') ? `FY${c.fy}` : null));

const fmtCount = (v) => (v ? nf(v) : '–');
// No '%' in the cell: the header says it once, and 18 columns of repeated
// symbols cost width the numbers need. A ratio keeps its decimal.
const fmtPct = (v) => (v === null ? '–' : `${Math.round(v)}`);
const fmtRatio = (v) => (v === null ? '–' : v.toFixed(1));

const ServiceLoadResponseReport = ({ data, fy: pickedFy }) => {
  const { branches = [], branch_ids: ids = [], branch_regions: regions = [],
    groups = [], heads = [], records = [],
    working_days: wdMaster = {}, holidays = {}, se_counts: seCounts = {},
    targets = {}, pct_targets: pctTargets = {},
    manual = {}, meta = {} } = data || {};

  const stripRef = useRef(null);
  const [sec, setSec] = useState(SECTIONS[0].key);
  // How much room the grid actually has. Columns were a fixed 76px, so a year
  // with its weeks open ran past the page and the last ones simply could not be
  // seen. They now share what is available and only fall back to scrolling when
  // even the minimum will not fit.
  const boxRef = useRef(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const read = () => setBoxW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Which branch GROUPS are opened out into their branches. Empty = all
  // collapsed, so the sheet opens on one row per group and the reader drills in
  // — the same first move the SR Allocation report makes.
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggleGroup = (gi) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(gi)) next.delete(gi); else next.add(gi);
    return next;
  });

  // Which heads the load Total, the percentages and productivity are measured
  // on. Empty = every head — what the printed sheet does.
  const [selHeads, setSelHeads] = useState(() => new Set());

  const agg = useMemo(() => {
    const dataMin = meta.min_date || '';
    const dataMax = meta.max_date || '';
    if (!dataMin || !dataMax) return null;

    const fy = Number.isFinite(pickedFy) ? pickedFy : fyOf(dataMax);
    const winStart = `${fy}-04-01`;
    const fyEnd = `${fy + 1}-03-31`;
    // A running FY stops at the last day an SR was closed on; a finished one
    // runs to 31 Mar.
    const winEnd = dataMax < fyEnd ? dataMax : fyEnd;
    if (winEnd < winStart || winEnd < dataMin) {
      return { fy, empty: true, winStart, winEnd: fyEnd };
    }

    // ---- columns -----------------------------------------------------------
    const endMonth = winEnd.slice(0, 7);
    const working = winEnd < monthEndOf(endMonth) ? endMonth : null;

    const cols = [
      { key: `cum${fy - 2}`, label: `Cumm ${fyShort(fy - 2)}`,
        sub: `${fmtD(`${fy - 2}-04-01`)} – ${fmtD(`${fy - 1}-03-31`)}`,
        start: `${fy - 2}-04-01`, end: `${fy - 1}-03-31`, kind: 'prev', fy: fy - 2 },
      { key: `cum${fy - 1}`, label: `Cumm ${fyShort(fy - 1)}`,
        sub: `${fmtD(`${fy - 1}-04-01`)} – ${fmtD(`${fy}-03-31`)}`,
        start: `${fy - 1}-04-01`, end: `${fy}-03-31`, kind: 'prev', fy: fy - 1 },
      { key: 'aop', label: 'AOP', sub: `target ${fyShort(fy)}`, kind: 'aop' },
      { key: `cum${fy}`, label: `Cumm ${fyShort(fy)}`,
        sub: `${fmtD(winStart)} – ${fmtD(winEnd)}`,
        start: winStart, end: winEnd, kind: 'cum', fy },
    ];

    // The working month keeps its own column AND is opened by week after it:
    // the month is what the business reports, the weeks are how it is watched.
    fyMonths(fy).forEach((ym) => {
      const mStart = `${ym}-01`;
      const mEnd = monthEndOf(ym);
      if (mStart > winEnd) return;
      if (mEnd < dataMin) return;         // no SR was closed yet — dead column
      cols.push({ key: ym, label: monthLabel(ym), kind: 'month',
        start: mStart, end: mEnd < winEnd ? mEnd : winEnd });
    });
    if (working) {
      weeksOfMonth(working, winStart, winEnd).forEach((w) => cols.push({
        key: `${working}-w${w.n}`, label: `Week-${w.n}`, kind: 'week',
        sub: `${fmtD(w.start)} – ${fmtD(w.end)}`, start: w.start, end: w.end,
      }));
    }

    // ---- one pass over the raw records fills every column ------------------
    const nb = branches.length;
    const nh = heads.length;
    const NOHEAD = nh;                     // the payload's headIdx −1 lands here
    // sums[colIdx][branchIdx][headIdx] = [n, within4, closed24, closed48]
    const sums = cols.map(() => Array.from({ length: nb }, () =>
      Array.from({ length: nh + 1 }, () => new Array(SLOTS).fill(0))));
    // A CUMULATIVE column also keeps its months apart, because its three
    // compliance percentages are the AVERAGE OF THE MONTHLY figures, not one
    // ratio over the whole year — see pctOf() below. Only the FY columns need
    // it, so only they carry the extra map.
    const mSums = cols.map((c) => ((c.kind === 'prev' || c.kind === 'cum')
      ? Array.from({ length: nb }, () =>
        Array.from({ length: nh + 1 }, () => new Map()))
      : null));
    records.forEach((rec) => {
      const [bi, ds, hi] = rec;
      if (bi >= nb) return;
      const h = hi < 0 ? NOHEAD : hi;
      if (h > NOHEAD) return;
      const ym = ds.slice(0, 7);
      cols.forEach((c, i) => {
        if (c.kind === 'aop' || ds < c.start || ds > c.end) return;
        const t = sums[i][bi][h];
        for (let k = 0; k < SLOTS; k += 1) t[k] += rec[3 + k] || 0;
        if (!mSums[i]) return;
        const mm = mSums[i][bi][h];
        const v = mm.get(ym) || new Array(SLOTS).fill(0);
        for (let k = 0; k < SLOTS; k += 1) v[k] += rec[3 + k] || 0;
        mm.set(ym, v);
      });
    });

    // ---- working days of each column, per region --------------------------
    // Each touched month contributes its AOP-master value, prorated by how many
    // of its days the column actually covers — the same rule the Employee
    // Productivity report uses, so the two reports cannot disagree.
    // Working days of ANY window, exactly: the days in it, minus Sundays,
    // minus that region's ticked holidays. Counting day by day rather than
    // prorating a monthly total is what makes a WEEK right — the week holding
    // 15 Aug has to lose that one day, which a month-level figure cannot say.
    // A month with NO holiday ticked keeps the AOP master's typed number
    // (prorated), so a hand-set working-day count is still honoured; the moment
    // the calendar has something to say, the calendar wins. Same precedence the
    // Sales/Labour report uses.
    const offOf = (region) => new Set(holidays[region === 'KA' ? 'KA' : 'MH'] || []);
    const wdOfRange = (s, e, region) => {
      if (!s || !e || e < s) return 0;
      const off = offOf(region);
      const r = region === 'KA' ? 'ka' : 'mh';
      let total = 0;
      let cur = s;
      while (cur <= e) {
        const ym = cur.slice(0, 7);
        const mEnd = monthEndOf(ym);
        const segEnd = mEnd < e ? mEnd : e;
        const y = Number(ym.slice(0, 4));
        const mm = Number(ym.slice(5, 7));
        // does this month have any holiday ticked at all?
        let ticked = false;
        for (let d = 1; d <= daysInMonth(ym); d += 1) {
          if (off.has(`${ym}-${String(d).padStart(2, '0')}`)) { ticked = true; break; }
        }
        if (ticked) {
          let n = 0;
          let day = cur;
          while (day <= segEnd) {
            if (pd(day).getDay() !== 0 && !off.has(day)) n += 1;
            day = addDays(day, 1);
          }
          total += n;
        } else {
          const row = (wdMaster.months || {})[ym] || (wdMaster.universal || {})[ym.slice(5, 7)];
          const base = (row && row[r]) || sundaysExcluded(y, mm);
          total += base * (inclDays(cur, segEnd) / daysInMonth(ym));
        }
        cur = addDays(segEnd, 1);
      }
      return total;
    };
    const wdOf = cols.map((c) => (c.kind === 'aop' ? null : {
      MH: wdOfRange(c.start, c.end, 'MH'), KA: wdOfRange(c.start, c.end, 'KA'),
    }));
    // Every 'YYYY-MM' a window touches.
    const monthsOf = (lo, hi) => {
      const out = [];
      let cur = lo;
      while (cur <= hi) {
        const ym = cur.slice(0, 7);
        out.push(ym);
        cur = addDays(monthEndOf(ym), 1);
      }
      return out;
    };
    // One month's working days, clipped to the column — the last month of a
    // running year is only counted as far as the data goes.
    const wdOfMonthIn = (ym, region, lo, hi) => {
      const a = `${ym}-01` > lo ? `${ym}-01` : lo;
      const b = monthEndOf(ym) < hi ? monthEndOf(ym) : hi;
      return b < a ? 0 : wdOfRange(a, b, region);
    };

    // ---- branch order: MH block then KA, each by branch number ------------
    const regionOf = (bi) => (String(regions[bi]).toUpperCase() === 'KA' ? 'KA' : 'MH');
    const order = branches
      .map((_b, bi) => bi)
      .sort((a, b) => {
        const ra = regionOf(a) === 'KA' ? 1 : 0;
        const rb = regionOf(b) === 'KA' ? 1 : 0;
        return ra - rb || branchNo(ids[a]) - branchNo(ids[b]);
      });
    const byRegion = { MH: order.filter((bi) => regionOf(bi) === 'MH'),
      KA: order.filter((bi) => regionOf(bi) === 'KA') };
    const branchLabel = (bi) => `${ids[bi]}_${shortBranch(branches[bi])}`;

    // The payload's branch groups, sorted into their region and into branch
    // order inside it. A branch the backend put in no group arrives as a group
    // of one and simply stays a plain row with no arrow.
    const regionGroups = { MH: [], KA: [] };
    const srcGroups = groups.length ? groups : order.map((bi) => [bi]);
    srcGroups.forEach((g, gi) => {
      const members = g.filter((bi) => bi < nb)
        .sort((a, b) => branchNo(ids[a]) - branchNo(ids[b]));
      if (!members.length) return;
      regionGroups[regionOf(members[0])].push({ gi, members });
    });
    ['MH', 'KA'].forEach((rg) => regionGroups[rg].sort(
      (a, b) => branchNo(ids[a.members[0]]) - branchNo(ids[b.members[0]])));

    // One region's branch block: a GROUP row per multi-branch group, then its
    // branches — which the table hides until the group is opened. `aopKeyOf` is
    // null for the count rows, whose AOP is summed from the monthly master
    // instead; a group row never carries a percentage target, because the master
    // sets those per branch, region and company, not per display group.
    const branchBlock = (target, rg, metric, aopKeyOf) => {
      regionGroups[rg].forEach(({ gi, members }) => {
        const multi = members.length > 1;
        if (multi) {
          push({ sec: target, kind: 'group', gi, metric, members,
            heads: measured, label: branchLabel(members[0]),
            extra: `+${members.length - 1} BR`, aopSum: metric === 'count',
            // A Sub Total is a scored row like any other, so it needs a target
            // to be scored against. The master sets percentage targets per
            // branch, region and company — a display group is none of those, so
            // it inherits its REGION's, which is the level it sits inside.
            aopKey: metric === 'count' ? undefined
              : `${fy}|${metric}|region|${rg}` });
        }
        members.forEach((bi) => push({ sec: target, kind: 'branch', metric,
          members: [bi], heads: measured, label: branchLabel(bi),
          hideUnder: multi ? gi : null, aopSum: metric === 'count',
          aopKey: aopKeyOf ? aopKeyOf(bi) : undefined }));
      });
    };

    // The region label the sheet prints. It IS the master's own code — the
    // printed Excel writes 'KAR', the ERP calls the region 'KA' everywhere
    // else, and matching the ERP wins so the two never read as two regions.
    const rgName = (rg) => (rg === 'KA' ? 'KA' : 'MH');

    // The heads the Total / percentage / productivity rows are measured on.
    const measured = heads.map((_h, i) => i).filter((i) => !selHeads.size || selHeads.has(i));

    // Is any SR outside the head master? Only then does the sheet grow the
    // balancing line, so a complete master prints exactly the printed shape.
    const cumCol = cols.findIndex((c) => c.kind === 'cum');
    let noHeadTotal = 0;
    if (cumCol >= 0) order.forEach((bi) => { noHeadTotal += sums[cumCol][bi][NOHEAD][0]; });

    const rows = [];
    const push = (r) => rows.push(r);

    // ===== TAB 1 — SERVICE LOAD (Nos.) ====================================
    heads.forEach((h, hi) => push({ sec: 'load', kind: 'head', metric: 'count',
      members: order, heads: [hi], label: h,
      muted: selHeads.size > 0 && !selHeads.has(hi) }));
    if (noHeadTotal > 0) {
      push({ sec: 'load', kind: 'gap', metric: 'count', members: order,
        heads: [NOHEAD], label: 'Not mapped to a head' });
    }
    push({ sec: 'load', kind: 'total', metric: 'count', members: order,
      heads: measured, label: 'Total', aopSum: true });

    // The same load again, cut by branch instead of by SR Type — a different
    // question, so the two blocks are separated rather than run together.
    push({ sec: 'load', kind: 'spacer' });

    ['MH', 'KA'].forEach((rg) => {
      if (!byRegion[rg].length) return;
      push({ sec: 'load', kind: 'region', metric: 'count', members: byRegion[rg],
        heads: measured, label: rgName(rg), aopSum: true });
      branchBlock('load', rg, 'count', null);
    });
    push({ sec: 'load', kind: 'grand', metric: 'count', members: order,
      heads: measured, label: 'Grand Total', aopSum: true });

    // ===== TAB 2 — PRODUCTIVITY (Calls PP PD) =============================
    ['MH', 'KA'].forEach((rg) => {
      if (!byRegion[rg].length) return;
      push({ sec: 'productivity', kind: 'region', metric: 'prod',
        members: byRegion[rg], heads: measured,
        label: `Productivity – ${rgName(rg)}`,
        aopKey: `${fy}|productivity|region|${rg}` });
      branchBlock('productivity', rg, 'prod',
        (bi) => `${fy}|productivity|branch|${ids[bi]}`);
    });
    push({ sec: 'productivity', kind: 'overall', metric: 'prod', members: order,
      heads: measured, label: 'Productivity – Calls PP PD (Overall)',
      aopKey: `${fy}|productivity|overall|ALL` });

    // ===== TABS 3-5 — the three compliance measures =======================
    // A tab holding ONE block takes its title from the tab itself, so only the
    // 48 Hrs tab — which also carries the all-branch MAX TTR block — prints an
    // in-table header to tell the two apart.
    const pctBlock = (target, m, withHeader = false) => {
      if (withHeader) push({ sec: target, kind: 'section', label: METRIC_LABEL[m] });
      ['MH', 'KA'].forEach((rg) => {
        if (!byRegion[rg].length) return;
        push({ sec: target, kind: 'region', metric: m, members: byRegion[rg],
          heads: measured, label: `${METRIC_LABEL[m]} ${rgName(rg)}`,
          aopKey: `${fy}|${m}|region|${rg}` });
        branchBlock(target, rg, m, (bi) => `${fy}|${m}|branch|${ids[bi]}`);
      });
    };
    pctBlock('resp4', 'resp4');
    pctBlock('closed24', 'closed24');
    pctBlock('closed48', 'closed48');

    // ===== TAB 6 — the two all-branch blocks the sheet closes on ==========
    // Both are company-level only: MAX TTR restates the three measures over
    // every branch at once, and the file flags FTR / FVR per SR without the
    // branch split the printed sheet gives the measures above.
    // 'metric', not 'overall': on every other tab an overall row CLOSES a list
    // of branches and earns the dark band, but here the company figure IS the
    // content. Five dark rows in a row would be a wall with no hierarchy, so
    // these read as ordinary data under a dark heading — the same shape as the
    // rest of the sheet.
    push({ sec: 'overall', kind: 'section', label: 'MAX TTR Overall (All Branches)' });
    ['resp4', 'closed24', 'closed48'].forEach((m) => push({
      sec: 'overall', kind: 'metric', metric: m, members: order, heads: measured,
      label: METRIC_LABEL[m], aopKey: `${fy}|${m}|overall|ALL`,
    }));
    push({ sec: 'overall', kind: 'spacer' });
    push({ sec: 'overall', kind: 'section', label: 'FTR / FVR (All Branches)' });
    ['ftr', 'fvr'].forEach((m) => push({
      sec: 'overall', kind: 'metric', metric: m, members: order, heads: measured,
      label: METRIC_LABEL[m], aopKey: `${fy}|${m}|overall|ALL`,
    }));

    // ---- the AOP column ---------------------------------------------------
    // A COUNT row's AOP is the sum of its branches' monthly targets inside the
    // financial year — one master figure, so branch, region, Total and the month
    // strip can never disagree. A PERCENTAGE or ratio row cannot be summed, so
    // it takes the target saved for that row.
    const months = fyMonths(fy);
    const aopOf = (row) => {
      if (row.metric === 'count') {
        if (!row.aopSum) return null;
        let t = 0, any = false;
        row.members.forEach((bi) => months.forEach((m) => {
          const v = targets[`${m}|${ids[bi]}`];
          if (v !== undefined && v !== null) { t += Number(v); any = true; }
        }));
        return any ? t : null;
      }
      const v = row.aopKey ? pctTargets[row.aopKey] : undefined;
      return v === undefined || v === null ? null : Number(v);
    };

    // ---- the cells --------------------------------------------------------
    const cells = rows.map((row) => {
      if (row.kind === 'section' || row.kind === 'spacer') return null;
      const aop = aopOf(row);
      // A TYPED row is looked up, never aggregated: no records feed it, so a
      // period nobody has filled in stays a dash rather than becoming 0%.
      if (MANUAL_METRICS[row.metric]) {
        return cols.map((c) => {
          if (c.kind === 'aop') return { v: aop, aop: true };
          const period = manualPeriodOf(c);
          const v = period === null ? undefined : manual[`${row.metric}|${period}`];
          return { v: v === undefined || v === null ? null : Number(v),
            typed: true, period };
        });
      }
      return cols.map((c, i) => {
        if (c.kind === 'aop') return { v: aop, aop: true };
        const t = new Array(SLOTS).fill(0);
        row.members.forEach((bi) => row.heads.forEach((h) => {
          const s = sums[i][bi][h];
          for (let k = 0; k < SLOTS; k += 1) t[k] += s[k];
        }));
        if (row.metric === 'count') return { v: t[0] };
        if (row.metric === 'prod') {
          // man-days = each branch's SE HEADCOUNT × its own region's working
          // days. The headcount is the establishment typed in the AOP master,
          // NOT the engineers who happen to appear in the file: counting only
          // those who closed something would flatter every branch with anyone on
          // leave. Region and overall rows SUM man-days, so a big branch weighs
          // more than a small one.
          let manDays = 0;
          let people = 0;
          row.members.forEach((bi) => {
            const n = Number(seCounts[ids[bi]] || 0);
            people += n;
            manDays += n * ((wdOf[i] || {})[regionOf(bi) === 'KA' ? 'KA' : 'MH'] || 0);
          });
          // A month or a week is one window and is divided once. A CUMULATIVE
          // column takes the MEAN OF ITS MONTHS, the same rule the three
          // compliance percentages follow — each month against its own
          // availability, so a light month and a heavy one weigh the same and
          // nobody counts as available for a month they did not work.
          if (mSums[i]) {
            const per = new Map();                  // ym -> [closures, man-days]
            const bump = (ym, k, v) => {
              const a = per.get(ym) || [0, 0];
              a[k] += v;
              per.set(ym, a);
            };
            row.members.forEach((bi) => {
              row.heads.forEach((h) => mSums[i][bi][h]
                .forEach((v, ym) => bump(ym, 0, v[0])));
              const reg = regionOf(bi) === 'KA' ? 'KA' : 'MH';
              const head = Number(seCounts[ids[bi]] || 0);
              if (!head) return;
              // every month the window touches, not only the ones this branch
              // closed something in: the engineers were on the payroll either way
              monthsOf(c.start, c.end).forEach((ym) => bump(
                ym, 1, head * wdOfMonthIn(ym, reg, c.start, c.end)));
            });
            let sum = 0;
            let months = 0;
            per.forEach(([mn, mMd]) => {
              if (mMd <= 0) return;                 // nobody available, no ratio
              sum += mn / mMd;
              months += 1;
            });
            return { v: months ? sum / months : null,
              n: t[0], people, manDays, months };
          }
          return { v: manDays > 0 ? t[0] / manDays : null,
            n: t[0], people, manDays };
        }
        const [slot, denSlot] = PCT_NUM[row.metric];
        const num = t[slot];
        const den = t[denSlot];
        // A MONTH or a WEEK is one window, so it is scored directly. A
        // CUMULATIVE column is scored month by month and those percentages are
        // then averaged — the business reads a year as 'how we did each month,
        // on average', which a single ratio over the whole year is not: a heavy
        // month would otherwise drown out a light one.
        if (!mSums[i]) {
          return { v: den ? (num / den) * 100 : null, n: den, num,
            skipped: t[WARRANTY_N] - den };
        }
        const perMonth = new Map();
        row.members.forEach((bi) => row.heads.forEach((h) => {
          mSums[i][bi][h].forEach((v, ym) => {
            const acc = perMonth.get(ym) || [0, 0];
            acc[0] += v[denSlot];
            acc[1] += v[slot];
            perMonth.set(ym, acc);
          });
        }));
        let pctSum = 0;
        let months = 0;
        perMonth.forEach(([mDen, mNum]) => {
          if (!mDen) return;               // nothing to score that month
          pctSum += (mNum / mDen) * 100;
          months += 1;
        });
        return { v: months ? pctSum / months : null,
          n: den, num, months, skipped: t[WARRANTY_N] - den };
      });
    });

    // Which row indices each tab draws.
    const bySec = {};
    SECTIONS.forEach((sc) => { bySec[sc.key] = []; });
    rows.forEach((r, i) => bySec[r.sec].push(i));

    // ---- the 'Service Request Closure (Nos.)' month strip ----------------
    // The printed sheet's own little table on the Productivity page: each month
    // of the financial year's AOP target against what was actually closed,
    // whatever the column layout above is doing.
    const inMeasured = new Set(measured);
    // ONE pass over the records, bucketed by month — scanning all 17k records
    // once per month would be twelve times the work for the same twelve numbers.
    const closedIn = {};
    records.forEach(([bi, ds, hi, n]) => {
      if (bi >= nb || ds < winStart || ds > winEnd) return;
      if (!inMeasured.has(hi < 0 ? NOHEAD : hi)) return;
      const m = ds.slice(0, 7);
      closedIn[m] = (closedIn[m] || 0) + n;
    });
    const strip = months.map((m) => {
      let target = 0;
      let hasTarget = false;
      order.forEach((bi) => {
        const v = targets[`${m}|${ids[bi]}`];
        if (v !== undefined && v !== null) { target += Number(v); hasTarget = true; }
      });
      // A month the financial year has not reached shows a dash, not a zero.
      const started = `${m}-01` <= winEnd;
      return { month: m, label: monthLabel(m), target: hasTarget ? target : null,
        actual: started ? (closedIn[m] || 0) : null };
    });

    return { fy, cols, rows, cells, bySec, strip, winStart, winEnd, working,
      noHeadTotal, measured };
  }, [branches, ids, regions, groups, heads, records, wdMaster,
    holidays, seCounts, targets, pctTargets, manual, meta.min_date,
    meta.max_date, pickedFy, selHeads]);

  const cur = SECTIONS.find((s) => s.key === sec) || SECTIONS[0];
  // The rows this tab draws, and the stripe each one takes.
  //
  // Which rows: a branch inside a multi-branch group appears only while that
  // group is open. Filtering here rather than inside the aggregation keeps a
  // toggle free — every row and cell is already built, opening one reveals it.
  //
  // Which stripe: counted over what is ON SCREEN, so opening a group does not
  // leave the rows after it flipped, and restarted at every heading so each
  // block begins on the light tone instead of wherever the last one stopped.
  const { visible, bandOf } = useMemo(() => {
    if (!agg || !agg.bySec) return { visible: [], bandOf: new Map() };
    const rows = (agg.bySec[cur.key] || []).filter((ri) => {
      const r = agg.rows[ri];
      return r.hideUnder == null || openGroups.has(r.hideUnder);
    });
    const bands = new Map();
    let band = 0;
    rows.forEach((ri) => {
      const r = agg.rows[ri];
      if (r.hideUnder != null) return;                  // flat block, no stripe
      if (r.kind === 'branch' || r.kind === 'gap' || r.kind === 'head'
        || r.kind === 'metric'
        || (r.kind === 'group' && !openGroups.has(r.gi))) {
        bands.set(ri, band % 2);
        band += 1;
        return;
      }
      band = 0;                                         // a heading resets it
    });
    return { visible: rows, bandOf: bands };
  }, [agg, cur.key, openGroups]);

  // ---- cells ---------------------------------------------------------------
  const CELL = 'px-2 py-1.5 text-center text-[11px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
  const LEFTC = 'px-2 py-1.5 text-left text-[11px] text-black border-b border-l border-gray-400 leading-tight';
  const TH = 'px-2 py-1.5 text-[10px] font-bold text-black text-center border-b border-l border-gray-400 leading-tight';
  // The Contents column is sized to the longest BRANCH label
  // ('420435_1_Ch.Sambhaji Nagar'); on a narrow page it gives ground first,
  // because a truncated name with a tooltip beats a column nobody can see.
  const nCols = (agg && agg.cols) ? agg.cols.length : 1;
  const W_NAME = (boxW && boxW < 900) ? 150 : 210;
  // Share what is left between the data columns, never below what a 5-digit
  // count needs. Hitting that floor is what turns the scrollbar on.
  const W_COL = Math.max(58, Math.floor(((boxW || 1200) - W_NAME - 6) / nCols));

  const fmtOf = (row) => (row.metric === 'count' ? fmtCount
    : (row.metric === 'prod' ? fmtRatio : fmtPct));

  // A percentage cell is tinted by how it did against its own AOP:
  //   met it            green
  //   within 5 points   yellow
  //   further short     amber
  // Counts are not scored this way — a branch closing fewer SRs than target has
  // not failed at anything, it simply had less work. No AOP, no tint.
  const toneOf = (row, cells, cell) => {
    if (!PCT_NUM[row.metric] && !MANUAL_METRICS[row.metric]) return null;
    if (cell.aop || cell.v === null) return null;
    const aopCell = cells.find((c) => c.aop);
    const aop = aopCell ? aopCell.v : null;
    if (aop === null || aop === undefined) return null;
    if (cell.v >= aop) return { background: GRID.ok, color: GRID.okInk };
    if (cell.v >= aop - 5) return { background: GRID.near, color: GRID.nearInk };
    return { background: GRID.miss, color: GRID.missInk };
  };

  const cellText = (row, cell) => {
    if (cell.aop) {
      if (cell.v === null) return '–';
      if (row.metric === 'count') return nf(Math.round(cell.v));
      if (row.metric === 'prod') return cell.v.toFixed(1);
      return `${Math.round(cell.v)}`;
    }
    return fmtOf(row)(cell.v);
  };

  const cellTitle = (row, cell) => {
    if (cell.aop) return 'AOP target — AOP & Master → Service Load AOP';
    if (cell.typed) {
      return cell.period === null
        ? 'Typed per month and per year — a week has no figure of its own'
        : `Typed for ${cell.period} in AOP & Master → Service Load AOP`;
    }
    if (row.metric === 'count') return undefined;
    if (row.metric === 'prod') {
      const base = `${nf(cell.n)} closures · ${cell.people} SE on the books · `
        + `${cell.manDays.toFixed(1)} man-days`;
      return cell.months
        ? `mean of ${cell.months} monthly figure${cell.months > 1 ? 's' : ''} · ${base} over the whole period`
        : base;
    }
    const left = cell.skipped > 0
      ? ` · ${nf(cell.skipped)} left out (closed before its due date)` : '';
    if (cell.months) {
      return `average of ${cell.months} monthly figure${cell.months > 1 ? 's' : ''}`
        + ` · ${nf(cell.num)} of ${nf(cell.n)} Warranty SRs over the whole period${left}`;
    }
    return `${nf(cell.num)} of ${nf(cell.n)} Warranty SRs${left}`;
  };

  // One worksheet per tab. `keys` picks which: the Export button writes the tab
  // on screen alone, Export all tabs writes the whole printed sheet. Nothing
  // else changes between the two — a single-tab file is that same sheet, by
  // itself, so the two are interchangeable to whoever receives one.
  const exportExcel = async (keys = null) => {
    if (!agg) return;
    const picked = keys ? SECTIONS.filter((sc) => keys.includes(sc.key)) : SECTIONS;
    try {
      const ExcelJS = await loadExcelJS();
      const widths = [{ width: 44 }, ...agg.cols.map(() => ({ width: 13 }))];
      const HD = { font: { bold: true, color: A('111827') }, fill: XL.HEAD, align: CENTER };
      // A spreadsheet has no arrows to click, so it carries every branch row
      // whatever is open on screen — a collapsed group must never mean a
      // silently missing branch in the file somebody circulates.
      const indent = (row) => (row.hideUnder != null ? `    ${row.label}` : row.label);
      const STYLE = {
        section: { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } },
        overall: { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } },
        grand: { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } },
        group: { fill: XL.SUBTOT, font: { bold: true } },
        gap: { fill: XL.TYPE },
        region: { fill: XL.REGION, font: { bold: true, color: A('FFFFFF') } },
        total: { fill: XL.REGION, font: { bold: true, color: A('FFFFFF') } },
      };
      // A percentage row is judged against its own AOP, and the workbook says so
      // exactly the way the screen does: the ROW stays light and the CELL carries
      // the verdict. Put a tone on a white-on-blue Total and the tone is what
      // gets lost, which is the one thing on the row worth reading.
      const isScored = (row) => !!(PCT_NUM[row.metric] || MANUAL_METRICS[row.metric]);
      const SCORED = {
        overall: { fill: XL.SC_TOT, font: { bold: true } },
        grand: { fill: XL.SC_TOT, font: { bold: true } },
        total: { fill: XL.SC_TOT, font: { bold: true } },
        region: { fill: XL.SC_REGION, font: { bold: true } },
        group: { fill: XL.SC_GROUP, font: { bold: true } },
      };
      // met the AOP · within 5 points of it · further short — and the AOP cell
      // itself is never scored against itself.
      const toneXl = (row, cells, cell) => {
        if (!isScored(row) || cell.aop || cell.v === null) return null;
        const aopCell = cells.find((c) => c.aop);
        const aop = aopCell ? aopCell.v : null;
        if (aop === null || aop === undefined) return null;
        if (cell.v >= aop) return { fill: XL.OK, ink: XL.OK_INK };
        if (cell.v >= aop - 5) return { fill: XL.NEAR, ink: XL.NEAR_INK };
        return { fill: XL.MISS, ink: XL.MISS_INK };
      };
      let wb = null;

      picked.forEach((sc) => {
        const idxs = agg.bySec[sc.key] || [];
        if (!idxs.length) return;
        const made = newSheet(ExcelJS, sc.sheet,
          `Service Load and Response — ${sc.name}   ·   ${fyShort(agg.fy)}`
          + `   ·   ${fmtDayYr(agg.winStart)} → ${fmtDayYr(agg.winEnd)}`,
          widths, wb);
        wb = made.wb;
        const { ws, put } = made;

        put(2, 1, 'Contents', HD);
        agg.cols.forEach((c, i) => {
          const cl = put(2, i + 2, c.label, HD);
          if (c.sub) {
            cl.value = { richText: [
              { text: c.label, font: { bold: true, size: 10, color: A('111827') } },
              { text: `\n${c.sub}`, font: { size: 8, color: A('6B7280') } },
            ] };
          }
        });
        ws.getRow(2).height = 30;

        let r = 3;
        let band = 0;
        idxs.forEach((ri) => {
          const row = agg.rows[ri];
          if (row.kind === 'spacer') {          // the same gap, in the workbook
            r += 1;
            band = 0;
            return;
          }
          // The screen's ladder, in the file. The workbook is always expanded,
          // so every group is a Sub Total heading its flat band of branches;
          // collapsed groups do not exist here, and a lone branch simply keeps
          // striping with the ones around it.
          let o;
          if (row.kind !== 'section' && isScored(row)) {
            o = SCORED[row.kind];
            if (o) band = 0;
            else if (row.hideUnder != null) o = { fill: XL.SC_BAND };
            else {
              o = { fill: band % 2 ? XL.ROW_B : XL.ROW_A };
              band += 1;
            }
          } else if (row.kind === 'branch' && row.hideUnder != null) {
            o = { fill: XL.BAND };
          } else if (STYLE[row.kind]) {
            o = STYLE[row.kind];
            if (row.kind !== 'gap') band = 0;
          } else {
            o = { fill: band % 2 ? XL.ROW_B : XL.ROW_A };
            band += 1;
          }
          put(r, 1, row.kind === 'group'
            ? `Sub Total — ${row.label} ${row.extra}` : indent(row),
            { ...o, align: LEFT });
          if (row.kind === 'section') {
            agg.cols.forEach((_c, ci) => put(r, ci + 2, '', { ...o, align: CENTER }));
            r += 1;
            return;
          }
          // Real numbers, formatted — so the sheet can be charted and sorted.
          const fmt = row.metric === 'count' ? F_CNT
            : (row.metric === 'prod' ? '0.0' : '0%');
          agg.cells[ri].forEach((cell, ci) => {
            const raw = cell.v;
            const value = raw === null ? ''
              : ((PCT_NUM[row.metric] || MANUAL_METRICS[row.metric]) ? raw / 100 : raw);
            const tn = toneXl(row, agg.cells[ri], cell);
            put(r, ci + 2, value, tn
              ? { ...o, align: CENTER, fmt, fill: tn.fill,
                font: { ...(o.font || {}), bold: true, color: A(tn.ink) } }
              : { ...o, align: CENTER, fmt });
          });
          r += 1;
        });

        // The month strip belongs to the Productivity page, as it is printed.
        if (sc.key === 'productivity') {
          r += 1;
          const H = { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } };
          put(r, 1, 'Service Request Closure (Nos.)', { ...H, align: LEFT });
          agg.strip.forEach((s, i) => put(r, i + 2, s.label, { ...H, align: CENTER }));
          put(r, agg.strip.length + 2, 'Total', { ...H, align: CENTER });
          r += 1;
          [['AOP Target', 'target'], ['Actual Achievement', 'actual']].forEach(([lbl, k], j) => {
            const o = { fill: j ? XL.ROW_B : XL.ROW_A };
            put(r, 1, lbl, { ...o, align: LEFT });
            let tot = 0;
            agg.strip.forEach((s, i) => {
              if (s[k] !== null) tot += s[k];
              put(r, i + 2, s[k] === null ? '' : s[k], { ...o, align: CENTER, fmt: F_CNT });
            });
            put(r, agg.strip.length + 2, tot,
              { ...o, align: CENTER, fmt: F_CNT, font: { bold: true } });
            r += 1;
          });
        }

        // A workbook has no tooltips to hover, so a sheet whose cells are tinted
        // says on itself what the three tints mean — the screen's own key.
        if (SCORED_SECTIONS.includes(sc.key)) {
          r += 1;
          put(r, 1, 'AOP key — each cell against its own AOP target',
            { align: LEFT, font: { bold: true } });
          [['Met AOP', XL.OK, XL.OK_INK],
            ['Within 5%', XL.NEAR, XL.NEAR_INK],
            ['Over 5% below', XL.MISS, XL.MISS_INK],
          ].forEach(([t, fill, ink], i) => put(r, i + 2, t,
            { fill, align: CENTER, font: { bold: true, color: A(ink) } }));
        }
      });

      if (!wb) { toast.error('Nothing to export'); return; }
      const sheets = wb.worksheets.length;
      // A one-tab file says which tab in its name, so two of them never land in
      // the same folder under the same name.
      const only = picked.length === 1
        ? `_${picked[0].sheet.replace(/[^A-Za-z0-9]+/g, '_')}` : '';
      await saveBook(wb,
        `PMS_Service_Load_and_Response${only}_${agg.winStart}_to_${agg.winEnd}.xlsx`);
      toast.success(picked.length === 1
        ? `${picked[0].name} exported`
        : `Service Load and Response exported — ${sheets} sheet${sheets > 1 ? 's' : ''}`);
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  if (!agg) {
    return (
      <div className="px-3 py-10 text-center text-sm text-gray-400">
        No closed SRs yet — upload the Response Time &amp; MaxTTR Details file on
        the Data Upload page.
      </div>
    );
  }

  if (agg.empty) {
    return (
      <div className="px-3 py-10 text-center text-sm text-gray-400">
        No SR closed in {fyShort(agg.fy)} — the Response Time &amp; MaxTTR file
        runs {fmtDayYr(meta.min_date)} → {fmtDayYr(meta.max_date)}.
      </div>
    );
  }

  // The tint ladder, darkest first. Every step is a real level of the sheet, so
  // no two adjacent blocks share a tone even when the browser drops the 1px
  // hairlines:
  //   grand   the company rows and the block headers   (white text)
  //   region  MH / KA and the Totals                   (white text)
  //   sel     an OPEN group's Sub Total — the palette's strongest light tint,
  //           documented for exactly this: heading its own rows
  //   grpB    that group's branches, ONE flat tone so the opened block reads as
  //           a single unit rather than a fresh stripe pattern
  //   subTot  a group still collapsed — it is a total, but a quiet one
  //   type    the 'Not mapped to a head' balancing row
  //   rowA/B  the SR-Type rows and the branches that stand on their own
  // Is this row's number judged against an AOP? If so it must not sit on a
  // strong blue band: the tint is the loudest thing on a scored row, and a
  // white-on-blue Total fought it for attention. Those rows keep their PLACE in
  // the hierarchy through weight and a light step of tint instead.
  const scored = (row) => !!(PCT_NUM[row.metric] || MANUAL_METRICS[row.metric]);

  const rowStyle = (row, band, open) => {
    if (row.kind === 'section') return { background: GRID.grand, color: '#fff' };
    if (scored(row)) {
      if (row.kind === 'overall' || row.kind === 'grand' || row.kind === 'total') {
        return { background: GRID.grpTot };
      }
      if (row.kind === 'region') return { background: GRID.subTot };
      if (row.kind === 'group') return { background: open ? GRID.grpB : GRID.bandB };
      if (row.hideUnder != null) return { background: GRID.bandA };
      return { background: band ? GRID.rowB : GRID.rowA };
    }
    if (row.kind === 'overall' || row.kind === 'grand') {
      return { background: GRID.grand, color: '#fff' };
    }
    if (row.kind === 'region' || row.kind === 'total') {
      return { background: GRID.region, color: '#fff' };
    }
    if (row.kind === 'gap') return { background: GRID.type };
    // An OPEN group heads its own block, and its branches share one flat tone.
    if (row.kind === 'group' && open) return { background: GRID.sel };
    if (row.hideUnder != null) return { background: GRID.grpB };
    // Everything else in the branch block — a collapsed group and a branch that
    // stands alone — is the SAME level of the sheet, so the two alternate
    // together on one counter. Giving collapsed groups a tint of their own left
    // Hubli and Belagavi (groups of one) reading as a different kind of row
    // from the groups above and below them, which they are not.
    if (row.kind === 'group' || row.kind === 'branch') {
      return { background: band ? GRID.bandB : GRID.bandA };
    }
    return { background: band ? GRID.rowB : GRID.rowA };
  };
  // A scored row carries its rank in WEIGHT, not in white-on-blue.
  const rowCls = (row) => {
    if (row.kind === 'section') return '!text-white font-bold';
    if (scored(row)) {
      return ['overall', 'grand', 'total', 'region', 'group'].includes(row.kind)
        ? 'font-bold' : '';
    }
    return ['overall', 'region', 'total', 'grand'].includes(row.kind)
      ? '!text-white font-bold' : '';
  };

  const unmapped = Object.entries(meta.unmapped_types || {});
  // Only the tabs whose cells are percentages carry the AOP key.
  const SHOW_KEY = SCORED_SECTIONS.includes(sec);
  const stripTotal = (k) => agg.strip.reduce((a, s) => a + (s[k] || 0), 0);
  // A branch inside a multi-branch group is drawn only while that group is
  // open. Filtering here rather than inside the aggregation keeps a toggle free:
  // every row and cell is already built, opening one just reveals it.

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <div className="mr-auto min-w-0">
          <p className="text-[12.5px] font-bold text-black leading-tight">
            Service Load and Response — <span style={{ color: THEME }}>{fyShort(agg.fy)}</span>
            {SHOW_KEY && <span className="ml-1.5 font-semibold text-gray-500">· all values %</span>}
          </p>
          <p className="text-[10px] text-gray-600 leading-tight">
            {fmtDayYr(agg.winStart)} → {fmtDayYr(agg.winEnd)} · counted on SR close date
            {agg.working && ` · ${monthLabel(agg.working)} is still running, so its weeks follow it`}
          </p>
        </div>
        {/* The AOP key, on the right with the other controls. Each chip carries
            the exact rule as well as the label: a colour that people act on has
            to say what it means, not be learned. */}
        {SHOW_KEY && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mr-0.5">
              AOP
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold whitespace-nowrap"
              style={{ background: GRID.ok, color: GRID.okInk }}
              title="On target — met or beat this row's AOP">
              Met AOP
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold whitespace-nowrap"
              style={{ background: GRID.near, color: GRID.nearInk }}
              title="Short of the AOP, but within 5%">
              Within 5%
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold whitespace-nowrap"
              style={{ background: GRID.miss, color: GRID.missInk }}
              title="More than 5% below the AOP">
              Over 5% below
            </span>
          </div>
        )}

        {/* Which heads the Total, the percentages and productivity are measured
            on. Empty = every head, which is what the printed sheet does; a KOEL
            SLA quoted on breakdown work alone is a business definition, so it is
            a control rather than a hard-coded filter. */}
        <MultiSelect label="Measured on" align="right" searchable={false}
          items={heads.map((h, i) => ({ v: i, t: h }))}
          selected={selHeads}
          onChange={(next) => setSelHeads(next.size === heads.length ? new Set() : next)} />

        {canExportExcel() && (
          <>
            <button onClick={() => exportExcel([sec])}
              title={`Export the tab on screen (${SECTIONS.find((sc) => sc.key === sec)?.name}) — one sheet`}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={() => exportExcel(null)}
              title="Export the whole printed sheet — every tab, one sheet each"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white border border-transparent rounded-lg hover:opacity-90"
              style={{ backgroundColor: THEME }}>
              <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export all tabs
            </button>
          </>
        )}
      </div>

      {/* ---- the sheet's pages, as a GRID rather than a wrapping row: equal
           columns keep the five buttons the same width instead of letting the
           longest label set the pace. ---- */}
      <div className="px-2 py-2 bg-gray-50 border-b border-gray-200 grid grid-cols-6 gap-1.5">
        {SECTIONS.map((sc) => (
          <button key={sc.key} type="button" onClick={() => setSec(sc.key)}
            className={`px-3 py-1.5 rounded-lg text-[11.5px] font-bold border text-center transition-colors ${
              sc.key === sec ? 'text-white border-transparent shadow-sm'
                : 'text-black bg-white border-gray-300 hover:bg-gray-100'}`}
            style={sc.key === sec ? { backgroundColor: THEME } : {}}>
            {sc.name}
            <span className={`block font-medium text-[9.5px] ${
              sc.key === sec ? 'text-white/85' : 'text-gray-700'}`}>{sc.sub}</span>
          </button>
        ))}
      </div>

      {(unmapped.length > 0
        || meta.unmapped_branch_rows > 0 || meta.no_date_rows > 0) && (
        <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-1.5">
          {unmapped.length > 0 && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1"
              title={unmapped.map(([t, n]) => `${t} — ${nf(n)} SRs`).join('\n')}>
              {unmapped.length} SR Type{unmapped.length > 1 ? 's' : ''} with no head
              {' '}({nf(unmapped.reduce((a, [, n]) => a + n, 0))} SRs) — counted in the
              {' '}all-types line only. Map them in AOP &amp; Master → SR Type Master (Service Load)
            </span>
          )}
          {meta.unmapped_branch_rows > 0 && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              {nf(meta.unmapped_branch_rows)} SRs on a branch code no master knows —
              {' '}counted under Unmapped Branch
            </span>
          )}
          {meta.no_date_rows > 0 && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
              {nf(meta.no_date_rows)} SR{meta.no_date_rows > 1 ? 's have' : ' has'} no
              close date — outside every period
            </span>
          )}
        </div>
      )}

      <div className="p-2" ref={boxRef}>
        {cur.key === 'overall' && Object.keys(manual).length === 0 && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[11px] text-amber-800">
              The <b>FTR</b> and <b>FVR</b> rows are typed, not counted — nothing in
              the uploaded files can produce them. Fill them in at
              {' '}<b>AOP &amp; Master → Service Load AOP</b>, month by month and per
              cumulative year, and they appear here exactly as entered.
            </p>
          </div>
        )}

        {/* HScrollBox pins the header row as the page scrolls, so the column a
            number sits under is still readable at the bottom of a long branch
            list — the same behaviour the Employee Productivity grid has. It owns
            the horizontal scrollbar too. */}
        <HScrollBox watch={`${cur.key}-${agg.cols.length}-${visible.length}`}>
          {/* The frame lives on a WRAPPER, never on the table. A border on the
              table itself doubles up against the cells' own rules — a second
              hairline down the right edge — and its rounded corners get painted
              over by the square header cells. overflow-hidden on the wrapper is
              what actually clips those corners, and it does not interfere with
              the pinned header: HScrollBox only ever moves the thead DOWN,
              inside the table's own height. */}
          <div className="border border-gray-400 rounded-xl overflow-hidden">
          <table className="pms-grid border-separate [border-spacing:0]"
            style={{ minWidth: '100%' }}>
            <thead className="relative" style={{ zIndex: 25 }}>
              <tr>
                <th className={`${TH} !border-l-0 sticky left-0 z-30`}
                  style={{ background: GRID.head, width: W_NAME, minWidth: W_NAME }}>
                  Contents
                </th>
                {agg.cols.map((c) => (
                  <th key={c.key}
                    className={TH}
                    style={{ background: GRID.head, width: W_COL, minWidth: W_COL }}>
                    {c.label}
                    {c.sub && (
                      <span className="block font-medium text-[8.5px] text-gray-700">{c.sub}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((ri) => {
                const row = agg.rows[ri];
                // An open group stops being 'the first branch, +2 more' and
                // becomes the Sub Total of the branches listed under it.
                const grpOpen = row.kind === 'group' && openGroups.has(row.gi);
                const label = grpOpen ? 'Sub Total' : row.label;
                if (row.kind === 'spacer') {
                  // A gap, not a row: no label, no numbers, just air between
                  // the SR-Type block and the branch block.
                  return (
                    <tr key={`sp${ri}`} aria-hidden="true">
                      {/* Air, and nothing else: no rule on any side, or the gap
                          reads as an empty data row instead of a break. bandA is
                          the palette's plain white and its dark-mode counterpart,
                          so it stays air in both themes. The table's outer frame
                          is drawn by the scroll container, not by these cells,
                          so dropping the borders costs no edge. */}
                      <td className="!border-0 sticky left-0 z-10"
                        style={{ background: GRID.bandA, height: 12, width: W_NAME, minWidth: W_NAME }} />
                      <td className="!border-0"
                        style={{ background: GRID.bandA, height: 12 }}
                        colSpan={agg.cols.length} />
                    </tr>
                  );
                }
                const style = rowStyle(row, bandOf.get(ri) || 0, grpOpen);
                const cls = rowCls(row);
                if (row.kind === 'section') {
                  return (
                    <tr key={`s${ri}`} style={style}>
                      <td className={`${LEFTC} ${cls} !border-l-0 sticky left-0 z-10`}
                        style={{ background: style.background, width: W_NAME, minWidth: W_NAME }}>
                        {row.label}
                      </td>
                      <td className={`${CELL} ${cls}`} colSpan={agg.cols.length} />
                    </tr>
                  );
                }
                return (
                  <tr key={`${row.label}-${ri}`} style={style}
                    className={row.muted ? 'opacity-50' : undefined}>
                    <td className={`${LEFTC} ${cls} !border-l-0 sticky left-0 z-10 font-semibold${
                      row.kind === 'group' ? ' cursor-pointer pms-hover' : ''}`}
                      style={{ background: style.background, width: W_NAME, minWidth: W_NAME }}
                      title={row.kind === 'group'
                        ? `${row.label} +${row.members.length - 1} more — click to ${
                          grpOpen ? 'collapse' : 'expand'}`
                        : row.label}
                      onClick={row.kind === 'group' ? () => toggleGroup(row.gi) : undefined}>
                      <div className="flex items-center gap-1"
                        style={{ maxWidth: W_NAME - 12 }}>
                        {/* The arrow's width is reserved on EVERY branch-level
                            row, so a group's name and its branches' names start
                            on the same pixel instead of a ragged edge. */}
                        {(row.kind === 'group' || row.hideUnder != null) && (
                          <span className={`inline-block w-3 shrink-0 text-[8px] text-gray-600 transition-transform${
                            grpOpen ? ' rotate-90' : ''}`}>
                            {row.kind === 'group' ? '▶' : ''}
                          </span>
                        )}
                        <span className="truncate">{label}</span>
                        {row.extra && !grpOpen && (
                          <span className="shrink-0 text-[9px] font-normal text-gray-500">
                            {row.extra}
                          </span>
                        )}
                      </div>
                    </td>
                    {agg.cells[ri].map((cell, ci) => {
                      const tone = toneOf(row, agg.cells[ri], cell);
                      return (
                        <td key={agg.cols[ci].key}
                          className={`${CELL} ${tone ? '!font-semibold' : cls}`}
                          style={tone || undefined}
                          title={cellTitle(row, cell)}>
                          {cellText(row, cell)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </HScrollBox>

        {/* ---- Service Request Closure (Nos.) — printed on the Productivity
             page of the sheet, so it lives on that tab ---- */}
        {cur.key === 'productivity' && (
          <>
            <p className="mt-3 mb-1 px-1 text-[11px] font-bold text-gray-800">
              Service Request Closure (Nos.)
              <span className="ml-2 font-normal text-[10px] text-gray-400">
                AOP &amp; Master → Service Load AOP, against what was closed
              </span>
            </p>
            <TopScrollbar scrollRef={stripRef} watch={agg.strip.length} />
            <div ref={stripRef} className="border border-gray-400 rounded-xl overflow-hidden overflow-x-auto">
              <table className="pms-grid border-separate [border-spacing:0]" style={{ minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th className={`${TH} !border-l-0 sticky left-0 z-20`}
                      style={{ background: GRID.head, width: 190, minWidth: 190 }}>
                      Service Request Closure (Nos.)
                    </th>
                    {agg.strip.map((s) => (
                      <th key={s.month} className={TH}
                        style={{ background: GRID.head, width: 70, minWidth: 70 }}>
                        {s.label}
                      </th>
                    ))}
                    <th className={TH}
                      style={{ background: GRID.head, width: 76, minWidth: 76 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[['AOP Target', 'target'], ['Actual Achievement', 'actual']].map(([lbl, k], j) => {
                    const bg = j ? GRID.rowB : GRID.rowA;
                    return (
                      <tr key={k} style={{ background: bg }}>
                        <td className={`${LEFTC} !border-l-0 sticky left-0 z-10 font-semibold`}
                          style={{ background: bg, width: 190, minWidth: 190 }}>{lbl}</td>
                        {agg.strip.map((s) => (
                          <td key={s.month} className={CELL}>
                            {s[k] === null ? '–' : nf(s[k])}
                          </td>
                        ))}
                        <td className={`${CELL} font-bold`}>{nf(stripTotal(k))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* The tab's formula, as a footnote under the numbers it produced. */}
        <div className="mt-3 pt-2 px-1 border-t border-gray-200 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600">
            Formula
          </span>
          <code className="font-mono text-[11px] font-bold text-black">
            {cur.formula}
          </code>
          <span className="text-[10px] text-gray-600">· {cur.note}</span>
        </div>
      </div>
    </div>
  );
};

export default ServiceLoadResponseReport;
