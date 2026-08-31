import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import {
  XL, A, CENTER, LEFT, F_CNT, loadExcelJS, newSheet, saveBook,
} from '../utils/pmsExport';
import { GRID } from './reportChrome';

/* ----------------------------------------------------------------------------
   Annual Reports → AMC report → the AMC tab (the business calls the sheet just
   "AMC").

   One row per AGREEMENT CATEGORY — and, unlike every other annual sheet, SIX
   source files, because each row is counted where that row is actually recorded:

     KOEL Bandhan MH / KA            the four BANDHAN QUOTE files (Anubandhan,
                                     Anubandhan Plus, Bandhan, Bandhan Plus), on
                                     PAYMENT UPDATE DATE TIME, split on the
                                     quote's own STATE column. A Bandhan sale is
                                     a PAID QUOTE, and the quote files are where
                                     that payment lands
     KOEL Bandhan Total              those two added up
     KALA AMC                        AMC Population, active 'Dealer Agreement'
                                     on AGREEMENT START DATE
     KOEL Corporate AMC              the same, active 'KOEL Agreement'
     AMC Expired During the Month    the AMC Agreement Expiry Planner, on
                                     AGREEMENT END DATE
     AMC Renewed During the Month    those same rows, matched by INSTANCE ID into
                                     the quote files — against the SAME records
                                     the Bandhan rows count (payment date set AND
                                     status 'Payment Success'), counted in the
                                     month the OLD cover expires
     Live AMC (KOEL+KALA) OVERALL    KOEL Bandhan + KALA AMC

   THE COLUMNS — one financial year, and only the RUNNING one:
     AOP           the year's target, from AOP Master → AMC & Bandhan AOP
     Cumm FY(n)    the year so far, counted, 1 April → today
     month columns Apr onward, one per month reached
     Week-1, 2 …   the working month (the one today falls in) ALSO broken into
                   its Mon–Sun weeks — a breakdown BESIDE its month column, not
                   instead of it, which is how the business prints the sheet
   A finished financial year reads as twelve month columns and no weeks.

   NO CLOSED-YEAR COLUMNS, deliberately — for the AMC-Population rows.
   amc_agreements is a SNAPSHOT keyed on INSTANCE ID: one row per genset, always
   its LATEST agreement, so a renewal OVERWRITES the agreement it replaced and a
   closed year's sales leak away month by month. A column that wrong is worse
   than no column, so the sheet prints only the running year. (The quote files
   behind the Bandhan rows do NOT decay — a paid quote stays a paid quote — but
   the sheet keeps one column set for every row rather than showing history for
   some rows and not others.)

   The AOP is the one figure that cannot be counted, and it is not typed here
   either: it belongs to the AOP master like every other target, in the second
   table of its AMC & Bandhan AOP tab. A TOTAL row with no AOP of its own falls
   back to the sum of its parts', and says so on hover.

   The second table, KCGL Total AMC, plans against the SUM of every branch's
   'F<yy> PROJ AOP D/BAMC' — the first table of that same AOP master tab — spread
   equally across the twelve months. The yearly plan therefore lives in exactly
   one place, per branch where it is actually owned, and the company row is
   derived from it rather than typed a second time and left to drift. Its Ach row
   is KOEL BANDHAN TOTAL: the plan is a Bandhan plan, so it is measured against
   the Bandhan rows and not against the wider Live AMC total.

   Payload: records[[seriesIdx, isoDate, count]] — raw per-day, so every column
   above is re-aggregated here without a refetch.
---------------------------------------------------------------------------- */

const pd = (s) => new Date(`${s}T00:00:00`);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtD = (s) => (s ? pd(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '');
const nf = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('en-IN'));

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym) => `${MONTH_SHORT[Number(ym.slice(5, 7)) - 1]}-${ym.slice(2, 4)}`;
const fyShort = (fy) => `FY${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
const daysInMonth = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const monthEndOf = (ym) => `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
// The twelve 'YYYY-MM' of a financial year, April first.
const fyMonths = (fy) => Array.from({ length: 12 }, (_v, i) => {
  const m = 4 + i;
  return m <= 12 ? `${fy}-${String(m).padStart(2, '0')}`
    : `${fy + 1}-${String(m - 12).padStart(2, '0')}`;
});

// Mon–Sun calendar weeks of ONE month, clipped to the window. Week-1 is the
// month's first week however short it is, so the numbering is the month's own
// and does not shift when the window starts or ends mid-month. Same helper the
// CDI sheet uses, so the two read their weeks identically.
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

// An AOP split EQUALLY across twelve months. The remainder is spread one apiece
// over the first months rather than rounded away, so the twelve cells always add
// back to the AOP exactly — a plan row whose months do not tie to its own total
// reads as an arithmetic bug however small the gap.
const equalSplit = (total) => {
  if (total === null || total === undefined) return null;
  const base = Math.floor(total / 12);
  const extra = total - base * 12;
  return Array.from({ length: 12 }, (_v, i) => base + (i < extra ? 1 : 0));
};

const AmcMonthlyReport = ({ data, fy: pickedFy, tabs = null }) => {
  const sheetRows = (data && data.rows) || [];
  const aop = (data && data.aop) || {};
  // {fy -> every branch's D/BAMC projection added up} — the KCGL plan's total.
  const dbamcAop = (data && data.dbamc_aop) || {};
  const meta = (data && data.meta) || {};

  // Everything the sheet is measured over, in ONE memo — the same shape the CDI
  // and Service Load sheets use. It reads `data` directly rather than values
  // destructured out of it, so the whole aggregate hangs off one dependency.
  //
  //   the WINDOW    April of the financial year → the earlier of today and
  //                 31 March. Clipped to TODAY, not to the payload's own max
  //                 date: expiries are counted on the agreement END date, which
  //                 runs years ahead, and a sheet that printed "AMC Expired" for
  //                 months that have not happened yet would be reporting the
  //                 future as achievement.
  //   byDay         per series, [day, count] ASCENDING. Sorted because spanOf
  //                 stops as soon as it passes a span's end — the backend
  //                 already ships them in order, but a wrong order would not
  //                 fail loudly, it would just undercount.
  //   cols          every month the window reaches, then the WORKING month's
  //                 weeks after them. The working month keeps its OWN column: on
  //                 the business's sheet the Jul-26 column is the whole month so
  //                 far and Week-2 / Week-3 are two weeks inside it, so the weeks
  //                 are a breakdown BESIDE the month, not instead of it. A closed
  //                 year has twelve month columns and no weeks at all.
  const agg = useMemo(() => {
    const series = (data && data.series) || [];
    const records = (data && data.records) || [];
    const mt = (data && data.meta) || {};

    const fy = Number.isFinite(pickedFy) && pickedFy !== null ? pickedFy
      : (Number.isFinite(mt.fy) ? mt.fy : new Date().getFullYear());
    const today = mt.today || iso(new Date());
    const winStart = `${fy}-04-01`;
    const fyEnd = `${fy + 1}-03-31`;
    const winEnd = today < fyEnd ? today : fyEnd;
    const closed = winEnd >= fyEnd;

    const seriesIdx = {};
    series.forEach((name, i) => { seriesIdx[name] = i; });
    const perSeries = series.map(() => []);
    records.slice().sort((x, y) => (x[1] < y[1] ? -1 : 1))
      .forEach((rec) => {
        const bucket = perSeries[rec[0]];
        if (bucket) bucket.push([rec[1], rec[2]]);
      });

    const cols = [];
    fyMonths(fy).filter((m) => m <= winEnd.slice(0, 7)).forEach((ym) => {
      const from = `${ym}-01`;
      const to = monthEndOf(ym);
      cols.push({ key: ym, label: monthLabel(ym), kind: 'month', ym,
        from: from > winStart ? from : winStart, to: to < winEnd ? to : winEnd });
    });
    // Only a month that has not finished is worth opening up: a full month's
    // weeks add five columns that say nothing its own column did not.
    const working = closed ? null
      : (winEnd < monthEndOf(winEnd.slice(0, 7)) ? winEnd.slice(0, 7) : null);
    if (working) {
      weeksOfMonth(working, winStart, winEnd).forEach((w) => cols.push({
        key: `${working}-w${w.n}`, label: `Week-${w.n}`, kind: 'week',
        ym: working, from: w.start, to: w.end,
      }));
    }

    return { fy, winStart, winEnd, closed, cols, byDay: perSeries, seriesIdx };
  }, [data, pickedFy]);

  const { fy, winStart, winEnd, closed, cols } = agg;

  // Sum one series over an inclusive date span. Ascending, so it stops early.
  const spanOf = (name, from, to) => {
    const days = agg.byDay[agg.seriesIdx[name]];
    if (!days) return 0;
    let t = 0;
    for (let i = 0; i < days.length; i += 1) {
      const d = days[i][0];
      if (d > to) break;
      if (d >= from) t += days[i][1];
    }
    return t;
  };

  // ---- a row's numbers ---------------------------------------------------
  // A 'series' row counts its own series; a 'sum' row adds the rows it names, so
  // a total is always built from the same spans as the rows under it.
  const partsOf = (row) => (row.counted === 'sum' ? (row.of || []) : [row.key]);
  const countSpan = (row, from, to) => partsOf(row)
    .reduce((t, s) => t + spanOf(s, from, to), 0);

  // The AOP, from the master. Set on the row itself wins; a total with nothing
  // set falls back to the sum of its parts'. Never counted — a target is
  // asserted or it is absent.
  const aopOf = (row) => {
    const own = aop[`${fy}|${row.key}`];
    if (own && own.nos !== null && own.nos !== undefined) {
      return { v: own.nos, derived: false, by: own.by };
    }
    if (row.counted !== 'sum') return { v: null, derived: false, by: null };
    let sum = null;
    (row.of || []).forEach((k) => {
      const p = aop[`${fy}|${k}`];
      if (p && p.nos !== null && p.nos !== undefined) sum = (sum || 0) + p.nos;
    });
    return { v: sum, derived: sum !== null, by: null };
  };

  // Cumm FY(n): the running year as counted, April → the window end.
  const cummNow = (row) => countSpan(row, winStart, winEnd);

  // Every row prints the business of the column's own span — the month, or the
  // week. Corporate AMC was briefly a running total instead; it is a plain
  // monthly count like the rest now.
  const cellValue = (row, c) => countSpan(row, c.from, c.to);

  // ---- KCGL Total AMC: the year's plan, month by month -------------------
  // The TOTAL is every branch's 'F<yy> PROJ AOP D/BAMC' added up — the first
  // table of AOP Master → AMC & Bandhan AOP, which is where the yearly plan is
  // actually owned — spread equally over the twelve months. Nothing is typed for
  // this row: a company figure entered separately would drift from the branch
  // figures it is supposed to be the sum of.
  // Ach is KOEL BANDHAN TOTAL. The plan is a Bandhan plan, so it is measured
  // against the Bandhan rows — not against Live AMC, which also carries KALA's
  // own AMC and would read as achievement the plan never asked for.
  const achRow = sheetRows.find((r) => r.key === 'bandhan_total') || null;
  const planMonths = fyMonths(fy);
  const branchAop = dbamcAop[String(fy)];
  const planTotal = branchAop === null || branchAop === undefined ? null : branchAop;
  const planSplit = equalSplit(planTotal);
  const achOf = (ym) => {
    if (!achRow) return null;
    const from = `${ym}-01`;
    const to = monthEndOf(ym);
    if (from > winEnd) return null;               // a month that has not started
    return countSpan(achRow, from, to < winEnd ? to : winEnd);
  };
  const achTotal = achRow ? countSpan(achRow, winStart, winEnd) : 0;

  // ---- chrome ------------------------------------------------------------
  const CELL = 'px-2 py-1.5 text-center text-[11px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
  const LCELL = 'px-2 py-1.5 text-left text-[11px] text-black border-b border-l border-gray-400';
  const TH = 'px-2 py-1.5 text-[10px] font-semibold text-black text-center border-b border-l border-gray-400 leading-tight';

  const AOP_TIP = 'AOP — this year’s target for the row. Entered in AOP Master →'
    + ' AMC & Bandhan AOP, in the AMC Report AOP table under the branch tables.';
  const CUMM_TIP = `Cumm ${fyShort(fy)} — counted live, 1 Apr ${fy} to ${fmtD(winEnd)}.`
    + ' Only the RUNNING year is shown: the AMC Population file keeps just each'
    + ' genset’s latest agreement, so a closed year’s count decays as gensets renew.';

  const QUOTE_FILES = 'Anubandhan, Anubandhan Plus, Bandhan and Bandhan Plus'
    + ' Quotes Reports';

  const rowTip = (row) => {
    if (row.key === 'bandhan_mh' || row.key === 'bandhan_kar') {
      return `Paid quotes from the ${QUOTE_FILES}, counted on PAYMENT UPDATE DATE`
        + ' TIME — a quote with no payment update has not been bought, so it does'
        + ' not count. Split on the quote\u2019s own STATE column: '
        + (row.key === 'bandhan_kar' ? 'Karnataka only.'
          : 'everything that is not Karnataka, so a state spelt a new way lands'
            + ' here rather than being dropped.');
    }
    if (row.key === 'koel_corp') {
      return 'The AMC Population Report’s active ‘KOEL Agreement’ rows, on'
        + ' AGREEMENT START DATE — KOEL’s own corporate cover.';
    }
    if (row.key === 'expired') {
      return 'The AMC Agreement Expiry Planner, counted on AGREEMENT END DATE —'
        + ' the month the cover runs out. Future months are not shown: the sheet'
        + ' stops at today.';
    }
    if (row.key === 'renewed') {
      return 'Those same expiring agreements, matched by INSTANCE ID into the four'
        + ' quote files — against the SAME records the KOEL Bandhan rows count:'
        + ' a PAYMENT UPDATE DATE TIME set AND a STATUS of ‘Payment Success’.'
        + ' Counted in the month the OLD cover expires, not the month it was paid'
        + ' for — so this row divides straight into the one above it: N ran out,'
        + ' M of those N came back.';
    }
    if (row.counted === 'sum') {
      const names = (row.of || [])
        .map((k) => (sheetRows.find((r) => r.key === k) || {}).name || k);
      return `Counted as ${names.join(' + ')}.`;
    }
    if (row.key === 'kala_amc') {
      return 'The AMC Population Report’s active ‘Dealer Agreement’ rows, on'
        + ' AGREEMENT START DATE — the dealership’s own AMC.';
    }
    return '';
  };

  const aopTip = (row, t) => {
    if (t.derived) {
      const names = (row.of || [])
        .map((k) => (sheetRows.find((r) => r.key === k) || {}).name || k);
      return `No AOP set on this row — showing the sum of ${names.join(' + ')}.`
        + ' Set one in the AOP master to override it.';
    }
    if (t.v === null) {
      return 'Not set — enter it in AOP Master → AMC & Bandhan AOP, in the'
        + ' AMC Report AOP table.';
    }
    return t.by ? `Set by ${t.by}, in the AOP master.` : AOP_TIP;
  };

  // ---- export ------------------------------------------------------------
  const exportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const head = ['Contents', 'AOP', `Cumm ${fyShort(fy)}`, ...cols.map((c) => c.label)];
      const wcols = [{ width: 30 }, { width: 12 }, { width: 14 },
        ...cols.map(() => ({ width: 10 }))];
      const { wb, ws, put } = newSheet(ExcelJS, 'AMC',
        `AMC   ·   ${fyShort(fy)}   ·   AMC Population Report`
        + `   ·   1 Apr ${fy} → ${fmtD(winEnd)}`, wcols);

      const HD = { font: { bold: true, color: A('111827') }, fill: XL.HEAD, align: CENTER };
      head.forEach((h, i) => put(2, i + 1, h, HD));
      ws.getRow(2).height = 30;

      let r = 3;
      sheetRows.forEach((row, i) => {
        const o = row.highlight
          ? { fill: XL.REGION, font: { bold: true, color: A('FFFFFF') } }
          : { fill: i % 2 ? XL.ROW_B : XL.ROW_A };
        put(r, 1, row.name, { ...o, align: LEFT, font: { bold: true, ...(o.font || {}) } });
        const t = aopOf(row);
        const cl = put(r, 2, t.v === null ? '' : t.v, { ...o, align: CENTER, fmt: F_CNT });
        if (t.derived) cl.note = 'Sum of the rows this total covers — no AOP set on the row itself.';
        put(r, 3, cummNow(row), { ...o, align: CENTER, fmt: F_CNT });
        cols.forEach((cc, j) => {
          put(r, 4 + j, cellValue(row, cc), { ...o, align: CENTER, fmt: F_CNT });
        });
        ws.getRow(r).height = 16;
        r += 1;
      });

      // The second table, two rows below the first.
      r += 2;
      ['KCGL Total AMC', 'TOTAL', ...planMonths.map(monthLabel)]
        .forEach((h, i) => put(r, i + 1, h, HD));
      ws.getRow(r).height = 22;
      r += 1;
      const plLine = (label, total, valueOf, o) => {
        put(r, 1, label, { ...o, align: LEFT, font: { bold: true, ...(o.font || {}) } });
        put(r, 2, total === null ? '' : total, { ...o, align: CENTER, fmt: F_CNT });
        planMonths.forEach((m, i) => {
          const v = valueOf(m, i);
          put(r, 3 + i, v === null || v === undefined ? '' : v,
            { ...o, align: CENTER, fmt: F_CNT });
        });
        ws.getRow(r).height = 18;
        r += 1;
      };
      plLine('AOP Plan', planTotal, (_m, i) => (planSplit ? planSplit[i] : null),
        { fill: XL.ROW_A });
      plLine('Ach', achTotal, (m) => achOf(m), { fill: XL.ROW_B });

      await saveBook(wb, `PMS_AMC_${fyShort(fy)}.xlsx`);
      toast.success('AMC sheet exported');
    } catch (e) {
      toast.error(`Export failed: ${e.message}`);
    }
  };

  // ---- render ------------------------------------------------------------
  const noAop = !sheetRows.some((r) => aop[`${fy}|${r.key}`]);
  const unmapped = Object.keys(meta.unmapped_types || {});

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* ONE row: the report's own tabs, then this sheet's title and period,
          then Export — mr-auto on the text block does the pushing. */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {tabs}
        <div className="mr-auto flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className="text-sm font-extrabold text-gray-900">AMC</p>
          <p className="text-[10px] text-gray-400">
            {fyShort(fy)} · 1 Apr {fy} → {fmtD(winEnd)}
            {closed ? ' · the year is closed, so no week columns'
              : ` · ${monthLabel(winEnd.slice(0, 7))} is still running, so its weeks are shown too`}
          </p>
        </div>
        {canExportExcel() && (
          <button onClick={exportExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
          </button>
        )}
      </div>

      <div className="px-2 pt-2 pb-1">
        {unmapped.length > 0 && (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-800">
            {unmapped.length} agreement type{unmapped.length === 1 ? '' : 's'} in the
            file{' '}<b>{unmapped.join(', ')}</b>{' '}
            {unmapped.length === 1 ? 'belongs' : 'belong'} to no row of this sheet,
            so {unmapped.length === 1 ? 'it is' : 'they are'} not counted anywhere.
          </div>
        )}
        {noAop && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
No <b>AOP</b> for {fyShort(fy)} yet — enter it in <b>AOP Master →
            AMC &amp; Bandhan AOP</b>, in the <b>AMC Report AOP</b> table under the
            branch tables.
          </div>
        )}

        <div className="border border-gray-400 rounded-xl overflow-x-auto">
          <table className="pms-grid border-separate [border-spacing:0] w-full"
            style={{ minWidth: 'max-content' }}>
            <thead>
              <tr>
                <th className={`${TH} !border-l-0 text-left`}
                  style={{ background: GRID.head, width: 210 }}>
                  Contents
                </th>
                <th className={TH} title={AOP_TIP}
                  style={{ background: GRID.typed, width: 82 }}>
                  AOP
                </th>
                <th className={TH} title={CUMM_TIP}
                  style={{ background: GRID.head, width: 92 }}>
                  Cumm {fyShort(fy)}
                </th>
                {cols.map((c, i) => (
                  <th key={c.key} className={`${TH}${i === cols.length - 1 ? ' border-r' : ''}`}
                    title={c.kind === 'week'
                      ? `${fmtD(c.from)} → ${fmtD(c.to)}`
                      : `${monthLabel(c.ym)} · ${fmtD(c.from)} → ${fmtD(c.to)}`}
                    style={{ background: c.kind === 'week' ? GRID.bandB : GRID.head, width: 64 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheetRows.map((row, i) => {
                const hl = !!row.highlight;
                const style = hl ? { background: GRID.region, color: '#fff' }
                  : { background: i % 2 ? GRID.rowB : GRID.rowA };
                const cls = hl ? '!text-white font-bold' : '';
                const t = aopOf(row);
                const cum = cummNow(row);
                return (
                  <tr key={row.key} style={style}>
                    <td className={`${LCELL} ${cls} !border-l-0 font-semibold`}
                      title={rowTip(row)}>
                      {row.name}
                    </td>
                    <td className={`${CELL} ${cls}${t.v === null ? ' text-gray-400' : ''}${
                      t.derived && !hl ? ' italic text-gray-500' : ''}`}
                      title={aopTip(row, t)}>
                      {t.v === null ? '–' : nf(t.v)}
                    </td>
                    <td className={`${CELL} ${cls}${cum ? '' : ' text-gray-400'}`} title={CUMM_TIP}>
                      {cum ? nf(cum) : '–'}
                    </td>
                    {cols.map((c, j) => {
                      const v = cellValue(row, c);
                      return (
                        <td key={c.key} className={`${CELL} ${cls}${v ? '' : ' text-gray-400'}${
                          j === cols.length - 1 ? ' border-r' : ''}`}>
                          {v ? nf(v) : '–'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ===== KCGL Total AMC — the year's AOP, month by month ===== */}
        <div className="mt-3 mb-1 flex flex-wrap items-baseline gap-x-2">
          <p className="text-xs font-extrabold text-gray-900">KCGL Total AMC</p>
          <p className="text-[10px] text-gray-400">
            every branch&apos;s {fyShort(fy)} D/BAMC AOP added up, split
            equally across the months, against the counted{' '}
            {achRow ? achRow.name : 'Bandhan'}
          </p>
        </div>
        <div className="border border-gray-400 rounded-xl overflow-x-auto">
          <table className="pms-grid border-separate [border-spacing:0] w-full"
            style={{ minWidth: 'max-content' }}>
            <thead>
              <tr>
                <th className={`${TH} !border-l-0`} style={{ background: GRID.head, width: 130 }}>
                  KCGL Total AMC
                </th>
                <th className={TH} style={{ background: GRID.head, width: 74 }}>TOTAL</th>
                {planMonths.map((m, i) => (
                  <th key={m} className={`${TH}${i === 11 ? ' border-r' : ''}`}
                    style={{ background: GRID.head, width: 64 }}>
                    {monthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: GRID.rowA }}>
                <td className={`${LCELL} !border-l-0 font-semibold`}
                  title={planTotal === null
                    ? `No F${String(fy + 1).slice(-2)} PROJ AOP D/BAMC set for any branch`
                      + ' — enter it in AOP Master → AMC & Bandhan AOP.'
                    : `${nf(planTotal)} — every branch's F${String(fy + 1).slice(-2)} PROJ`
                      + ' AOP D/BAMC added up, split equally across the twelve months.'
                      + ' The remainder goes one apiece to the first months, so the'
                      + ' months always add back to the total.'}>
                  AOP Plan
                </td>
                <td className={`${CELL} font-bold${planTotal === null ? ' text-gray-400' : ''}`}>
                  {planTotal === null ? '–' : nf(planTotal)}
                </td>
                {planMonths.map((m, i) => (
                  <td key={m} className={`${CELL}${planSplit ? '' : ' text-gray-400'}${
                    i === 11 ? ' border-r' : ''}`}>
                    {planSplit ? nf(planSplit[i]) : '–'}
                  </td>
                ))}
              </tr>
              <tr style={{ background: GRID.rowB }}>
                <td className={`${LCELL} !border-l-0 font-semibold`}
                  title={achRow ? `Counted: ${achRow.name}.` : ''}>
                  Ach
                </td>
                <td className={`${CELL} font-bold`}>{achTotal ? nf(achTotal) : '–'}</td>
                {planMonths.map((m, i) => {
                  const v = achOf(m);
                  return (
                    <td key={m} className={`${CELL}${v ? '' : ' text-gray-400'}${
                      i === 11 ? ' border-r' : ''}`}>
                      {v === null ? '' : (v ? nf(v) : '–')}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AmcMonthlyReport;
