import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import {
  XL, A, CENTER, LEFT, loadExcelJS, newSheet, saveBook,
} from '../utils/pmsExport';
import { GRID, THEME, HScrollBox } from './reportChrome';

/* ----------------------------------------------------------------------------
   Annual Reports → CUSTOMER DELIGHT INDEX (CDI).

   Source (GET /pms/report/annual/cdi, fetched by the page): the CDI DETAIL
   REPORT and only it. Every feedback row falls in one of three buckets, read
   off its 'CDI CATEGORY' — Promotor(09-10), Detractor(00 - 06), everything
   else Passive — and is counted on ACTIVITY END DATE, in the branch its
   BRANCH NAME resolves to. The score of any set of rows is

       CDI % = (Promotor − Detractor) / (Promotor + Passive + Detractor) × 100

   so it is NOT an average of the rows below it: every total row is scored from
   its OWN feedback counts. That is why a region row can sit outside the range
   of its branches.

   THE COLUMNS FOLLOW THE FINANCIAL YEAR the period picker lands in:
     Cumm FY(n−2) / FY(n−1)  those whole financial years, whatever the period
     AOP                     the target from AOP & Master → CDI Target
     Cumm FY(n)              the selected period, inside its own FY
     month columns           Apr onward, one per whole month of the period
     Week-1, Week-2 …        the WORKING month — the last month of the period
                             when it has not finished yet — split into its
                             Mon–Sun calendar weeks instead of one column
   A finished financial year therefore reads as twelve month columns and no
   weeks; the running one stops at the working month and opens it up by week.

   Payload: records[[branchIdx, isoActivityEndDate, bucketIdx, count]] — raw
   per-day, so every column above is re-aggregated here without a refetch.
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

// The branch id's trailing number, so the rows read 1..7 / 8..14 whatever
// order the payload registered them in.
const branchNo = (id) => {
  const m = String(id || '').match(/_(\d+)$/);
  return m ? Number(m[1]) : 9999;
};

// [Promotor, Detractor, Passive] -> the score. No feedback at all = no score,
// which the sheet shows as a dash rather than 0%.
const scoreOf = (t) => {
  const total = t[0] + t[1] + t[2];
  return total ? ((t[0] - t[1]) / total) * 100 : null;
};
// The sheet is ALL percentages, so the '%' sign is said ONCE at the top of
// the table instead of on every one of the hundreds of cells: the columns then
// read as plain comparable numbers. No feedback at all stays a dash, not 0.
const pct = (v) => (v === null ? '–' : `${Math.round(v)}`);
const addTo = (a, b) => { a[0] += b[0]; a[1] += b[1]; a[2] += b[2]; };

// Mon–Sun calendar weeks of ONE month, clipped to the period. Week-1 is the
// month's first week however short it is, so the numbering is the month's own
// and does not shift when the period starts mid-month.
const weeksOfMonth = (ym, winStart, winEnd) => {
  const first = `${ym}-01`;
  const last = monthEndOf(ym);
  const out = [];
  let cur = first;
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

const CustomerDelightIndexReport = ({ data, fy: pickedFy }) => {
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

  const { branches = [], branch_ids: ids = [], branch_regions: regions = [],
    records = [], targets = {}, meta = {} } = data || {};

  const agg = useMemo(() => {
    const dataMin = meta.min_date || '';
    const dataMax = meta.max_date || '';
    if (!dataMin || !dataMax) return null;

    // ONE financial year owns the sheet, and it is the one picked at the top —
    // nothing here is a free from/to range.
    const fy = Number.isFinite(pickedFy) ? pickedFy : fyOf(dataMax);
    const winStart = `${fy}-04-01`;
    const fyEnd = `${fy + 1}-03-31`;
    // A running FY stops at the last day feedback exists for; a finished one
    // runs to 31 Mar.
    const winEnd = dataMax < fyEnd ? dataMax : fyEnd;
    // A year the feedback file does not reach — before the first row or after
    // the last. Say so instead of drawing a sheet of dashes.
    if (winEnd < winStart || winEnd < dataMin) {
      return { fy, empty: true, winStart, winEnd: fyEnd };
    }

    // ---- columns -----------------------------------------------------------
    // The working month is the FY's last month while it is still running; it
    // gives up its month column and is opened by week instead.
    const endMonth = winEnd.slice(0, 7);
    const working = winEnd < monthEndOf(endMonth) ? endMonth : null;

    const cols = [
      { key: `cum${fy - 2}`, label: `Cumm ${fyShort(fy - 2)}`,
        sub: `${fmtD(`${fy - 2}-04-01`)} – ${fmtD(`${fy - 1}-03-31`)}`,
        start: `${fy - 2}-04-01`, end: `${fy - 1}-03-31`, kind: 'prev' },
      { key: `cum${fy - 1}`, label: `Cumm ${fyShort(fy - 1)}`,
        sub: `${fmtD(`${fy - 1}-04-01`)} – ${fmtD(`${fy}-03-31`)}`,
        start: `${fy - 1}-04-01`, end: `${fy}-03-31`, kind: 'prev' },
      { key: 'aop', label: 'AOP', sub: `target ${fyShort(fy)}`, kind: 'aop' },
      { key: `cum${fy}`, label: `Cumm ${fyShort(fy)}`,
        sub: `${fmtD(winStart)} – ${fmtD(winEnd)}`,
        start: winStart, end: winEnd, kind: 'cum' },
    ];

    for (let m = 0; m < 12; m += 1) {
      const y = m < 9 ? fy : fy + 1;
      const ym = `${y}-${String(((3 + m) % 12) + 1).padStart(2, '0')}`;
      // The working month keeps its own column AND is opened by week after it:
      // the month is what the business reports, the weeks are how it is watched.
      const mStart = `${ym}-01`;
      const mEnd = monthEndOf(ym);
      if (mStart > winEnd) continue;
      if (mEnd < dataMin) continue;      // no feedback existed yet — dead column
      cols.push({ key: ym, label: monthLabel(ym), kind: 'month',
        start: mStart, end: mEnd < winEnd ? mEnd : winEnd });
    }
    if (working) {
      weeksOfMonth(working, winStart, winEnd).forEach((w) => cols.push({
        key: `${working}-w${w.n}`, label: `Week-${w.n}`, kind: 'week',
        sub: `${fmtD(w.start)} – ${fmtD(w.end)}`, start: w.start, end: w.end,
      }));
    }

    // ---- one pass over the raw records fills every column ------------------
    const nb = branches.length;
    // sums[colIdx][branchIdx] = [Promotor, Detractor, Passive]
    const sums = cols.map(() => Array.from({ length: nb }, () => [0, 0, 0]));
    records.forEach(([bi, ds, ci, n]) => {
      if (bi >= nb) return;
      cols.forEach((c, i) => {
        if (c.kind === 'aop' || ds < c.start || ds > c.end) return;
        sums[i][bi][ci] += n;
      });
    });

    // ---- rows: MH block, KA block, overall ---------------------------------
    const regionOf = (bi) => (String(regions[bi]).toUpperCase() === 'KA' ? 'KA' : 'MH');
    const order = branches
      .map((_b, bi) => bi)
      .sort((a, b) => {
        const ra = regionOf(a) === 'KA' ? 1 : 0;
        const rb = regionOf(b) === 'KA' ? 1 : 0;
        return ra - rb || branchNo(ids[a]) - branchNo(ids[b]);
      });

    // The two region blocks, then the company total closing the sheet. The
    // total is scored from ALL feedback, like every other row, and takes the
    // master's one company target.
    const rows = [];
    ['MH', 'KA'].forEach((rg) => {
      const list = order.filter((bi) => regionOf(bi) === rg);
      if (!list.length) return;
      rows.push({ kind: 'region', region: rg, members: list,
        label: `CUSTOMER DELIGHT INDEX (CDI) (${rg})`,
        aopKey: `${fy}|region|${rg}` });
      list.forEach((bi) => rows.push({ kind: 'branch', members: [bi],
        label: `${ids[bi]}_${shortBranch(branches[bi])}`,
        aopKey: `${fy}|branch|${ids[bi]}` }));
    });
    rows.push({ kind: 'overall', members: order,
      label: 'CUSTOMER DELIGHT INDEX (CDI) (OVERALL)',
      aopKey: `${fy}|overall|ALL` });

    // Every row is scored from its OWN feedback, never averaged from the rows
    // under it — the formula has no meaning on percentages.
    const cells = rows.map((r) => cols.map((c, i) => {
      if (c.kind === 'aop') {
        const t = r.aopKey ? targets[r.aopKey] : undefined;
        return { score: t === undefined || t === null ? null : Number(t), aop: true };
      }
      const t = [0, 0, 0];
      r.members.forEach((bi) => addTo(t, sums[i][bi]));
      return { score: scoreOf(t), counts: t };
    }));

    return { fy, cols, rows, cells, winStart, winEnd, working };
  }, [branches, ids, regions, records, targets, meta.min_date, meta.max_date,
    pickedFy]);

  // ---- cells ---------------------------------------------------------------
  const CELL = 'px-2 py-1.5 text-center text-[11px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
  // The Contents column WRAPS — 'CUSTOMER DELIGHT INDEX (CDI) (OVERALL)' does
  // not fit the frozen column on one line, and an ellipsis hides which row it is.
  const LEFTC = 'px-2 py-1.5 text-left text-[11px] text-black border-b border-l border-gray-400 leading-tight';
  const TH = 'px-2 py-1.5 text-[10px] font-semibold text-black text-center border-b border-l border-gray-400 leading-tight';
  // Sized to the BRANCH labels — '420435_1_Ch.Sambhaji Nagar' is the longest of
  // them and fits on one line. The three long region / overall labels wrap onto
  // a second line instead, which costs three rows of height and buys every data
  // column ~80px of width.
  const nCols = (agg && agg.cols) ? agg.cols.length : 1;
  const W_NAME = (boxW && boxW < 900) ? 140 : 170;
  const W_COL = Math.max(58, Math.floor(((boxW || 1200) - W_NAME - 6) / nCols));

  const exportExcel = async () => {
    if (!agg) return;
    try {
      const ExcelJS = await loadExcelJS();
      const cols = [{ width: 42 }, ...agg.cols.map(() => ({ width: 14 }))];
      const { wb, ws, put } = newSheet(ExcelJS, 'Customer Delight Index',
        `Customer Delight Index (CDI)   ${'·'}   ${fyShort(agg.fy)}`
        + `   ${'·'}   ${fmtDayYr(agg.winStart)} ${'→'} ${fmtDayYr(agg.winEnd)}`,
        cols);

      // The header carries TWO lines — the column name and the dates it covers.
      // They are written as rich text so the date line can be smaller and grey,
      // the way it reads on screen: at one size the dates wrapped onto a third
      // line and the fixed row height cut them off.
      const HD = { font: { bold: true, color: A('111827') }, fill: XL.HEAD, align: CENTER };
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

      // Every number on this sheet is judged against an AOP, so — as on screen —
      // the ROW stays light and the CELL carries the verdict. A dark blue region
      // row would print its tone under white text, which hides the one thing on
      // the row worth reading.
      const STYLE = {
        region: { fill: XL.SC_REGION, font: { bold: true } },
        overall: { fill: XL.SC_TOT, font: { bold: true } },
      };
      // met the AOP · within 5 points of it · further short. The AOP column is
      // never scored against itself.
      const toneXl = (cells, cell) => {
        if (cell.aop || cell.score === null) return null;
        const aopCell = cells.find((c) => c.aop);
        const aop = aopCell ? aopCell.score : null;
        if (aop === null || aop === undefined) return null;
        if (cell.score >= aop) return { fill: XL.OK, ink: XL.OK_INK };
        if (cell.score >= aop - 5) return { fill: XL.NEAR, ink: XL.NEAR_INK };
        return { fill: XL.MISS, ink: XL.MISS_INK };
      };
      let r = 3;
      agg.rows.forEach((row, ri) => {
        const o = STYLE[row.kind] || { fill: ri % 2 ? XL.ROW_B : XL.ROW_A };
        put(r, 1, row.label, { ...o, align: LEFT });
        agg.cells[ri].forEach((cell, ci) => {
          // a real number, formatted as a percentage, so the sheet can be
          // charted and sorted; no feedback stays an empty cell
          const value = cell.score === null ? '' : cell.score / 100;
          const tn = toneXl(agg.cells[ri], cell);
          put(r, ci + 2, value, tn
            ? { ...o, align: CENTER, fmt: '0%', fill: tn.fill,
              font: { ...(o.font || {}), bold: true, color: A(tn.ink) } }
            : { ...o, align: CENTER, fmt: '0%' });
        });
        r += 1;
      });

      // A workbook has no tooltips to hover, so the sheet says on itself what
      // its three tints mean — the same key the screen carries.
      r += 1;
      put(r, 1, 'AOP key — each cell against its own AOP target',
        { align: LEFT, font: { bold: true } });
      [['Met AOP', XL.OK, XL.OK_INK],
        ['Within 5%', XL.NEAR, XL.NEAR_INK],
        ['Over 5% below', XL.MISS, XL.MISS_INK],
      ].forEach(([t, fill, ink], i) => put(r, i + 2, t,
        { fill, align: CENTER, font: { bold: true, color: A(ink) } }));

      await saveBook(wb, `PMS_Customer_Delight_Index_${agg.winStart}_to_${agg.winEnd}.xlsx`);
      toast.success('Customer Delight Index exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  if (!agg) {
    return (
      <div className="px-3 py-10 text-center text-sm text-gray-400">
        No customer feedback yet — upload the CDI Detail Report on the Data Upload page.
      </div>
    );
  }

  // A financial year the feedback file has not reached yet.
  if (agg.empty) {
    return (
      <div className="px-3 py-10 text-center text-sm text-gray-400">
        No customer feedback in {fyShort(agg.fy)} — the CDI Detail Report runs
        {' '}{fmtDayYr(meta.min_date)} → {fmtDayYr(meta.max_date)}.
      </div>
    );
  }

  // A score is tinted by how it did against its own AOP:
  //   met it            green
  //   within 5 points   yellow
  //   further short     amber
  // No AOP on the row, no tint — an untargeted row is not failing at anything.
  const toneOf = (cells, cell) => {
    if (cell.aop || cell.score === null) return null;
    const aopCell = cells.find((c) => c.aop);
    const aop = aopCell ? aopCell.score : null;
    if (aop === null || aop === undefined) return null;
    if (cell.score >= aop) return { background: GRID.ok, color: GRID.okInk };
    if (cell.score >= aop - 5) return { background: GRID.near, color: GRID.nearInk };
    return { background: GRID.miss, color: GRID.missInk };
  };

  // No strong blue bands here: every number on this sheet is judged against an
  // AOP, and a white-on-blue region row fought its own tint for attention. The
  // hierarchy is carried by weight and a light step of tint instead.
  const rowStyle = (row, ri) => {
    if (row.kind === 'overall') return { background: GRID.grpTot };
    if (row.kind === 'region') return { background: GRID.subTot };
    return { background: ri % 2 ? GRID.rowB : GRID.rowA };
  };
  const rowCls = (row) => (row.kind === 'region' || row.kind === 'overall'
    ? 'font-bold' : '');

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <div className="mr-auto min-w-0">
          <p className="text-[12.5px] font-bold text-black leading-tight">
            Customer Delight Index (CDI) — <span style={{ color: THEME }}>{fyShort(agg.fy)}</span>
            <span className="ml-1.5 font-semibold text-gray-500">· all values %</span>
          </p>
          <p className="text-[10px] text-gray-600 leading-tight">
            {fmtDayYr(agg.winStart)} → {fmtDayYr(agg.winEnd)} ·
            {' '}score = (Promotor − Detractor) ÷ all feedback × 100
            {agg.working && ` · ${monthLabel(agg.working)} is still running, so its weeks follow it`}
          </p>
        </div>
        {/* The AOP key, on the right with the other controls. Each chip carries
            the exact rule as well as a label: a colour people act on has to say
            what it means rather than be learned. */}
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
        {meta.unmapped_branch_rows > 0 && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            {nf(meta.unmapped_branch_rows)} feedback row{meta.unmapped_branch_rows > 1 ? 's' : ''} whose
            BRANCH NAME matches no branch — counted under Unmapped Branch
          </span>
        )}
        {meta.no_date_rows > 0 && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            {nf(meta.no_date_rows)} row{meta.no_date_rows > 1 ? 's have' : ' has'} no
            activity end date — outside every period
          </span>
        )}
        {canExportExcel() && (
          <button onClick={exportExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
          </button>
        )}
      </div>

      <div className="p-2" ref={boxRef}>
        {/* the header row rides down the page, so the column a score sits under
            is still readable at the bottom of a long branch list */}
        <HScrollBox watch={`${agg.cols.length}-${agg.rows.length}`}>
          {/* the frame goes on a wrapper, not the table — see the note in
              ServiceLoadResponseReport: a table border doubles the right-hand
              rule and the square header cells paint over its rounded corners */}
          <div className="border border-gray-400 rounded-xl overflow-hidden">
          <table className="pms-grid border-separate [border-spacing:0]"
            style={{ minWidth: '100%' }}>
            <thead className="relative" style={{ zIndex: 25 }}>
              <tr>
                <th className={`${TH} !border-l-0 sticky left-0 z-30`}
                  style={{ background: GRID.head, width: W_NAME, minWidth: W_NAME }}>
                  Contents
                  <span className="block font-normal text-[8.5px] text-gray-600">
                    all values in %
                  </span>
                </th>
                {agg.cols.map((c) => (
                  <th key={c.key}
                    className={TH}
                    style={{ background: GRID.head, width: W_COL, minWidth: W_COL }}>
                    {c.label}
                    {c.sub && (
                      <span className="block font-normal text-[8.5px] text-gray-600">{c.sub}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agg.rows.map((row, ri) => {
                const style = rowStyle(row, ri);
                const cls = rowCls(row);
                return (
                  <tr key={row.label + ri} style={style}>
                    <td className={`${LEFTC} ${cls} !border-l-0 sticky left-0 z-10 font-semibold`}
                      style={{ background: style.background, width: W_NAME, minWidth: W_NAME }}
                      title={row.label}>
                      <div style={{ maxWidth: W_NAME - 16 }}>{row.label}</div>
                    </td>
                    {agg.cells[ri].map((cell, ci) => {
                      const tone = toneOf(agg.cells[ri], cell);
                      return (
                        <td key={agg.cols[ci].key}
                          className={`${CELL} ${tone ? '!font-semibold' : cls}`}
                          style={tone || undefined}
                          title={cell.counts
                            ? `Promotor ${cell.counts[0]} · Passive ${cell.counts[2]} · `
                              + `Detractor ${cell.counts[1]} · total ${cell.counts[0] + cell.counts[1] + cell.counts[2]}`
                            : undefined}>
                          {pct(cell.score)}
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
      </div>
    </div>
  );
};

export default CustomerDelightIndexReport;
