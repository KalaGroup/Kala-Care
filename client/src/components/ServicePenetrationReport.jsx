import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import {
  XL, A, CENTER, LEFT, F_CNT, loadExcelJS, newSheet, saveBook,
} from '../utils/pmsExport';
import { GRID } from './reportChrome';

/* ----------------------------------------------------------------------------
   Annual Reports → SERVICE PENETRATION — how much of the installed base was
   actually touched by a closed service call.

   Source (GET /pms/report/annual/service-penetration, fetched by the page):

   POPULATION — the ASSET DETAILED master.
     Ind / PG Population   assets whose SEGMENT is IND / PG, Grand Total the two
     added up. Each asset counts once, in its own BRANCH ID, on its COMMISSIONING
     DATE, and the figure is CUMULATIVE: the installed base AS ON the end of the
     period, not what was commissioned inside it. Assets the ERP has retired
     (asset operational status 'Inactive') are out of the base.

   UNQ AST SR CLOSED — the RESPONSE TIME & MaxTTR file.
     The number of DISTINCT ASSETS with at least one SR CLOSED inside the period.
     Unique means unique: an asset with five closed SRs counts ONCE. Because such
     a count cannot be added up day by day the way a population can, the payload
     ships ONE ROW PER ASSET with the days it was serviced on —
     sr_records[[branchIdx, segmentIdx, day, day, …]], each day an offset from
     meta.sr_day0 — and the rows with a day inside the period are counted here.

   PEN % — closed ÷ population × 100, per segment and for the two together.
     Only the TOTAL is shaded, against PEN_TARGET — which is never shown to the
     reader, by request: it is a fill threshold, not a figure on the sheet.

   Both halves stay RAW per-day, so a new period re-aggregates here with no
   refetch. Region and overall rows SUM their branches, the way the workbook does.
---------------------------------------------------------------------------- */

const pd = (s) => new Date(s + 'T00:00:00');
const fmtD = (s) => (s ? pd(s).toLocaleDateString('en-GB',
  { day: '2-digit', month: 'short', year: '2-digit' }) : '');
const nf = (v) => (v ? v.toLocaleString('en-IN') : '-');
const shortBranch = (b) => String(b || '').replace(/^KALA\s*Care\s*Global\s*LLP\s*[-–]\s*/i, '');

// The shading threshold, and ONLY that: business asked for the 60 % target to
// stop being written anywhere on the sheet or in the export, so nothing names it
// to the reader any more — it just decides where the Total Pen % cell turns
// green. No figure in the report depends on it.
const PEN_TARGET = 60;

// closed ÷ population, as whole percent — null when the branch has no assets in
// the base at all, which is a dash rather than a zero.
const pct = (closed, pop) => (pop > 0 ? Math.round((closed * 100) / pop) : null);

// Only the TOTAL Pen % is painted — the Sales & Labour report's % Achieved
// fills, read against THIS sheet's target instead of 100 %: at or above target
// green, within a fifth of it yellow, further off amber. A dash stays neutral.
// The classes live in index.css so both reports paint the same percentage the
// same colour; PCT_XL are the identical fills for the exported workbook.
const penCls = (p) => (!p ? '' : p >= PEN_TARGET ? 'pms-pct-good'
  : p >= PEN_TARGET * 0.8 ? 'pms-pct-mid' : 'pms-pct-low');
const PCT_XL = { 'pms-pct-good': '86EFAC', 'pms-pct-mid': 'FDE047', 'pms-pct-low': 'FDBA74' };
const penFill = (p) => PCT_XL[penCls(p)] || null;

// The branch id's trailing number, so rows read 1..7 / 8..14 whatever order the
// payload registered them in (Parbhani is not in the ERP list, so it arrives
// last — the sheet still wants it inside the MH block).
const branchNo = (id) => {
  const m = String(id || '').match(/_(\d+)$/);
  return m ? Number(m[1]) : 9999;
};

const ServicePenetrationReport = ({ data, periodFrom, periodTo }) => {
  const { branches = [], branch_ids: ids = [], branch_regions: regions = [],
    records = [], sr_records: srRecords = [], meta = {} } = data || {};
  const start = periodFrom || meta.min_date || '';
  const end = periodTo || meta.max_date || '';

  // ---- population as on `end`, serviced assets inside [start, end] --------
  const rows = useMemo(() => {
    const pop = branches.map(() => [0, 0]);            // [IND, PG]
    records.forEach(([bi, ds, si, n]) => {
      if (ds <= end && pop[bi]) pop[bi][si] += n;      // the LIVE installed base
    });

    // Day offsets, the same scale the payload was built on.
    const closed = branches.map(() => [0, 0]);
    if (meta.sr_day0 && start && end) {
      const day0 = pd(meta.sr_day0).getTime();
      const dayNo = (iso) => Math.round((pd(iso).getTime() - day0) / 86400000);
      const lo = dayNo(start);
      const hi = dayNo(end);
      srRecords.forEach((row) => {
        const bi = row[0];
        if (!closed[bi]) return;
        for (let i = 2; i < row.length; i += 1) {      // ONE hit is enough
          if (row[i] >= lo && row[i] <= hi) { closed[bi][row[1]] += 1; break; }
        }
      });
    }

    const order = branches
      .map((_b, bi) => bi)
      .sort((a, b) => {
        const ra = String(regions[a]).toUpperCase() === 'KA' ? 1 : 0;
        const rb = String(regions[b]).toUpperCase() === 'KA' ? 1 : 0;
        return ra - rb || branchNo(ids[a]) - branchNo(ids[b]);
      });
    return { pop, closed, order };
  }, [branches, records, srRecords, regions, ids, start, end, meta.sr_day0]);

  const { pop, closed, order } = rows;
  const regionOf = (bi) => (String(regions[bi]).toUpperCase() === 'KA' ? 'KA' : 'MH');
  // [indPop, pgPop, indClosed, pgClosed] for a set of branches.
  const sum = (list) => list.reduce((t, bi) => [t[0] + pop[bi][0], t[1] + pop[bi][1],
    t[2] + closed[bi][0], t[3] + closed[bi][1]], [0, 0, 0, 0]);

  // ---- cells --------------------------------------------------------------
  const CELL = 'px-2 py-1.5 text-center text-[11px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
  const LEFT_C = 'px-2 py-1.5 text-left text-[11px] text-black border-b border-l border-gray-400';
  const TH = 'px-2 py-1.5 text-[10px] font-semibold text-black text-center border-b border-l border-gray-400 leading-tight';

  const penTxt = (p) => (p === null ? '-' : `${p}%`);

  const dataRow = (key, bid, name, v, style, cls = '') => {
    const [pi, pp, ci, cp] = v;
    const tot = pct(ci + cp, pi + pp);
    // The painted cell drops the row's white-text class — the fill carries its
    // own dark text, the way the Sales & Labour total rows do.
    const fill = penCls(tot);
    return (
      <tr key={key} style={style}>
        <td className={`${CELL} ${cls} !border-l-0 tabular-nums`}>{bid}</td>
        <td className={`${LEFT_C} ${cls} font-semibold`} title={name}>
          <div className="truncate max-w-[150px]">{name}</div>
        </td>
        <td className={`${CELL} ${cls}`}>{nf(pi)}</td>
        <td className={`${CELL} ${cls}`}>{nf(pp)}</td>
        <td className={`${CELL} ${cls} font-semibold`}>{nf(pi + pp)}</td>
        <td className={`${CELL} ${cls}`}>{nf(ci)}</td>
        <td className={`${CELL} ${cls}`}>{nf(cp)}</td>
        <td className={`${CELL} ${cls} font-semibold`}>{nf(ci + cp)}</td>
        <td className={`${CELL} ${cls} font-semibold`}>{penTxt(pct(ci, pi))}</td>
        <td className={`${CELL} ${cls} font-semibold`}>{penTxt(pct(cp, pp))}</td>
        <td className={`${CELL} ${fill || cls} font-semibold border-r`}>{penTxt(tot)}</td>
      </tr>
    );
  };

  const body = [];
  ['MH', 'KA'].forEach((rg) => {
    const list = order.filter((bi) => regionOf(bi) === rg);
    if (!list.length) return;
    list.forEach((bi, i) => body.push(dataRow(`b${bi}`, ids[bi], shortBranch(branches[bi]),
      [pop[bi][0], pop[bi][1], closed[bi][0], closed[bi][1]],
      { background: i % 2 ? GRID.rowB : GRID.rowA })));
    body.push(dataRow(`t${rg}`, '', `${rg} Total`, sum(list),
      { background: GRID.region, color: '#fff' }, '!text-white font-bold'));
  });
  const [gInd, gPg, gCi, gCp] = sum(order);

  // ---- export ---------------------------------------------------------------
  // The sheet is the table: the ERP band with the period, the same three column
  // groups, the MH / KA blocks with their totals and the overall row. Counts and
  // percentages are written as REAL numbers so the workbook can be charted.
  const exportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const cols = [{ width: 12 }, { width: 24 }, { width: 13 }, { width: 13 },
        { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 },
        { width: 11 }, { width: 11 }, { width: 11 }];
      const { wb, ws, put } = newSheet(ExcelJS, 'Service Penetration',
        `Service Penetration   ${'·'}   population as on ${fmtD(end)}`
        + `   ${'·'}   SRs closed ${fmtD(start)} ${'→'} ${fmtD(end)}`, cols);

      const HD = { font: { bold: true, color: A('111827') }, fill: XL.HEAD, align: CENTER };
      ['Branch', 'BRANCH NAME',
        'Ind Population', 'PG Population', 'Grand Total',
        'IND Unq Ast SR Closed', 'PG Unq Ast SR Closed', 'Total Unq Ast SR Closed',
        'IND Pen%', 'PG Pen%', 'Total Pen %'].forEach((h, i) => put(2, i + 1, h, HD));
      ws.getRow(2).height = 30;

      let r = 3;
      const line = (bid, name, v, o = {}) => {
        const [pi, pp, ci, cp] = v;
        put(r, 1, bid, { ...o, align: CENTER });
        put(r, 2, name, { ...o, align: LEFT });
        const num = { ...o, align: CENTER, fmt: F_CNT };
        const bold = { ...num, font: { ...(o.font || {}), bold: true } };
        put(r, 3, pi, num);
        put(r, 4, pp, num);
        put(r, 5, pi + pp, bold);
        put(r, 6, ci, num);
        put(r, 7, cp, num);
        put(r, 8, ci + cp, bold);
        // A real fraction formatted as a percentage — no population is an
        // empty cell, not a zero. Only the TOTAL carries the good / mid / low
        // fill, exactly as it reads on screen.
        const tot = pct(ci + cp, pi + pp);
        [pct(ci, pi), pct(cp, pp), tot].forEach((p, i) => put(
          r, 9 + i, p === null ? '' : p / 100,
          { ...bold, fmt: '0%', ...(i === 2 && penFill(p)
            ? { fill: penFill(p), font: { bold: true, color: A('111827') } } : {}) }));
        r += 1;
      };

      ['MH', 'KA'].forEach((rg) => {
        const list = order.filter((bi) => regionOf(bi) === rg);
        if (!list.length) return;
        list.forEach((bi, i) => line(ids[bi], shortBranch(branches[bi]),
          [pop[bi][0], pop[bi][1], closed[bi][0], closed[bi][1]],
          { fill: i % 2 ? XL.ROW_B : XL.ROW_A }));
        line('', `${rg} Total`, sum(list),
          { fill: XL.REGION, font: { bold: true, color: A('FFFFFF') } });
      });
      line('', 'KCGL Overall', [gInd, gPg, gCi, gCp],
        { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } });
      ws.getRow(r - 1).height = 18;

      await saveBook(wb, `PMS_Service_Penetration_${start}_to_${end}.xlsx`);
      toast.success('Service Penetration exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  const gPen = pct(gCi + gCp, gInd + gPg);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="py-0.5 mr-auto">
          <p className="text-xs font-bold text-gray-800">Service Penetration</p>
          <p className="text-[10px] text-gray-400">
            Installed base as on {fmtD(end)} · unique assets with an SR closed {fmtD(start)} → {fmtD(end)}
          </p>
        </div>
        {meta.sr_max_date && end > meta.sr_max_date && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            SRs are closed only up to {fmtD(meta.sr_max_date)} — upload the Response Time
            &amp; MaxTTR file for the later months
          </span>
        )}
        {meta.no_date_rows > 0 && (
          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            {nf(meta.no_date_rows)} asset{meta.no_date_rows > 1 ? 's have' : ' has'} no
            commissioning date — outside every period
          </span>
        )}
        {canExportExcel() && (
          <button onClick={exportExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
            <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Export
          </button>
        )}
      </div>

      <div className="p-2">
        <div className="border border-gray-400 rounded-xl overflow-hidden overflow-x-auto">
          <table className="pms-grid border-separate [border-spacing:0] w-full"
            style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th rowSpan={2} className={`${TH} !border-l-0`} style={{ background: GRID.head, width: 90 }}>
                  Branch
                </th>
                <th rowSpan={2} className={TH} style={{ background: GRID.head, width: 160 }}>
                  BRANCH NAME
                </th>
                <th colSpan={3} className={TH} style={{ background: GRID.head }}>
                  Population
                  <span className="block font-normal text-[8.5px] text-gray-600">
                    as on {fmtD(end)}
                  </span>
                </th>
                <th colSpan={3} className={TH} style={{ background: GRID.head }}>
                  Unq Ast SR Closed
                  <span className="block font-normal text-[8.5px] text-gray-600">
                    {fmtD(start)} → {fmtD(end)}
                  </span>
                </th>
                <th colSpan={3} className={`${TH} border-r`} style={{ background: GRID.head }}>
                  Pen %
                  <span className="block font-normal text-[8.5px] text-gray-600">
                    closed ÷ population
                  </span>
                </th>
              </tr>
              <tr>
                {['Ind', 'PG', 'Grand Total', 'IND', 'PG', 'Total', 'IND', 'PG', 'Total']
                  .map((h, i) => (
                    <th key={i} className={`${TH}${i === 8 ? ' border-r' : ''}`}
                      style={{ background: GRID.head, width: i > 5 ? 74 : 88 }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>{body}</tbody>
            <tfoot>
              <tr className="font-bold text-white" style={{ background: GRID.grand }}>
                <td className={`${CELL} !border-l-0 !text-white`} />
                <td className={`${LEFT_C} !text-white font-bold`}>KCGL Overall</td>
                <td className={`${CELL} !text-white`}>{nf(gInd)}</td>
                <td className={`${CELL} !text-white`}>{nf(gPg)}</td>
                <td className={`${CELL} !text-white`}>{nf(gInd + gPg)}</td>
                <td className={`${CELL} !text-white`}>{nf(gCi)}</td>
                <td className={`${CELL} !text-white`}>{nf(gCp)}</td>
                <td className={`${CELL} !text-white`}>{nf(gCi + gCp)}</td>
                <td className={`${CELL} !text-white`}>{penTxt(pct(gCi, gInd))}</td>
                <td className={`${CELL} !text-white`}>{penTxt(pct(gCp, gPg))}</td>
                <td className={`${CELL} border-r ${penCls(gPen) || '!text-white'}`}>
                  {penTxt(gPen)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ServicePenetrationReport;
