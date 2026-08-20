import React from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import {
  XL, A, CENTER, LEFT, loadExcelJS, newSheet, saveBook,
} from '../utils/pmsExport';
import { GRID } from './reportChrome';

/* ----------------------------------------------------------------------------
   Annual Reports → AMC & BANDHAN PROJECTION.

   LAYOUT ONLY — no figures yet, by request. Every value column shows a dash;
   the branch rows, the MH / KA blocks and their totals come from the same
   branch list the Service Penetration payload carries, so the sheet already has
   its real shape and the numbers can be dropped in column by column once each
   source and formula is agreed.
---------------------------------------------------------------------------- */

const pd = (s) => new Date(s + 'T00:00:00');
const fmtMon = (s) => (s ? pd(s).toLocaleDateString('en-GB',
  { month: 'short', year: '2-digit' }) : '');
const shortBranch = (b) => String(b || '').replace(/^KALA\s*Care\s*Global\s*LLP\s*[-–]\s*/i, '');
const branchNo = (id) => {
  const m = String(id || '').match(/_(\d+)$/);
  return m ? Number(m[1]) : 9999;
};

const AmcBandhanProjectionReport = ({ data, periodTo }) => {
  const { branches = [], branch_ids: ids = [], branch_regions: regions = [] } = data || {};
  const regionOf = (bi) => (String(regions[bi]).toUpperCase() === 'KA' ? 'KA' : 'MH');
  const order = branches
    .map((_b, bi) => bi)
    .sort((a, b) => {
      const ra = regionOf(a) === 'KA' ? 1 : 0;
      const rb = regionOf(b) === 'KA' ? 1 : 0;
      return ra - rb || branchNo(ids[a]) - branchNo(ids[b]);
    });

  // The last column follows the period, the way the sheet names its month.
  const COLS = ['F26 ACT D/BAMC', 'F27 PROJ AOP D/BAMC', 'BEST ACT AOP D/BAMC (M)',
    'F27 YTD ACT D/BAMC NOS', `${fmtMon(periodTo) || 'Month'} Act`];

  const CELL = 'px-2 py-1.5 text-center text-[11px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
  const LEFT = 'px-2 py-1.5 text-left text-[11px] text-black border-b border-l border-gray-400';
  const TH = 'px-2 py-1.5 text-[10px] font-semibold text-black text-center border-b border-l border-gray-400 leading-tight';

  const row = (key, bid, name, style, cls = '') => (
    <tr key={key} style={style}>
      <td className={`${CELL} ${cls} !border-l-0`}>{bid}</td>
      <td className={`${LEFT} ${cls} font-semibold`} title={name}>
        <div className="truncate max-w-[150px]">{name}</div>
      </td>
      {COLS.map((c, i) => (
        <td key={c} className={`${CELL} ${cls} text-gray-400${
          i === COLS.length - 1 ? ' border-r' : ''}`}>–</td>
      ))}
    </tr>
  );

  const body = [];
  ['MH', 'KA'].forEach((rg) => {
    const list = order.filter((bi) => regionOf(bi) === rg);
    if (!list.length) return;
    list.forEach((bi, i) => body.push(row(`b${bi}`, ids[bi], shortBranch(branches[bi]),
      { background: i % 2 ? GRID.rowB : GRID.rowA })));
    body.push(row(`t${rg}`, '', `${rg} TOTAL`,
      { background: GRID.region, color: '#fff' }, '!text-white font-bold'));
  });

  // ---- export ---------------------------------------------------------------
  // Layout only, like the screen: the branch rows and the totals are written,
  // every value column is left EMPTY. That makes the sheet a ready template.
  const exportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const cols = [{ width: 12 }, { width: 26 }, ...COLS.map(() => ({ width: 16 }))];
      const { wb, ws, put } = newSheet(ExcelJS, 'AMC & Bandhan Projection',
        `AMC & Bandhan Projection   ${'\u00b7'}   layout only `
        + `${'\u2014'} the figures are not wired up yet`, cols);

      const HD = { font: { bold: true, color: A('111827') }, fill: XL.HEAD, align: CENTER };
      ['Branch', 'BRANCH NAME', ...COLS].forEach((h, i) => put(2, i + 1, h, HD));
      ws.getRow(2).height = 30;

      let r = 3;
      const line = (bid, name, o = {}) => {
        put(r, 1, bid, { ...o, align: CENTER });
        put(r, 2, name, { ...o, align: LEFT });
        COLS.forEach((_c, i) => put(r, 3 + i, '', { ...o, align: CENTER }));
        r += 1;
      };
      ['MH', 'KA'].forEach((rg) => {
        const list = order.filter((bi) => regionOf(bi) === rg);
        if (!list.length) return;
        list.forEach((bi, i) => line(ids[bi], shortBranch(branches[bi]),
          { fill: i % 2 ? XL.ROW_B : XL.ROW_A }));
        line('', `${rg} TOTAL`, { fill: XL.REGION, font: { bold: true, color: A('FFFFFF') } });
      });
      line('', 'KCGL TOTAL', { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } });
      ws.getRow(r - 1).height = 18;

      await saveBook(wb, 'PMS_AMC_Bandhan_Projection.xlsx');
      toast.success('AMC & Bandhan Projection exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="py-0.5 mr-auto">
          <p className="text-xs font-bold text-gray-800">AMC &amp; Bandhan Projection</p>
          <p className="text-[10px] text-gray-400">
            Layout only — the figures are not wired up yet
          </p>
        </div>
        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
          No data source agreed yet for these columns
        </span>
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
            style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th className={`${TH} !border-l-0`} style={{ background: GRID.head, width: 90 }}>Branch</th>
                <th className={TH} style={{ background: GRID.head, width: 170 }}>BRANCH NAME</th>
                {COLS.map((c, i) => (
                  <th key={c} className={`${TH} ${i === COLS.length - 1 ? 'border-r' : ''}`}
                    style={{ background: GRID.head, width: 110 }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>{body}</tbody>
            <tfoot>
              <tr className="font-bold text-white" style={{ background: GRID.grand }}>
                <td className={`${CELL} !border-l-0 !text-white`} />
                <td className={`${LEFT} !text-white font-bold`}>KCGL TOTAL</td>
                {COLS.map((c, i) => (
                  <td key={c} className={`${CELL} !text-white${
                    i === COLS.length - 1 ? ' border-r' : ''}`}>–</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AmcBandhanProjectionReport;
