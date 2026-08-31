import React from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { canExportExcel } from '../utils/exportPermission';
import {
  XL, A, CENTER, LEFT, F_CNT, loadExcelJS, newSheet, saveBook,
} from '../utils/pmsExport';
import { GRID } from './reportChrome';

/* ----------------------------------------------------------------------------
   Annual Reports → AMC & BANDHAN PROJECTION.

   TWO SOURCES, because the sheet asks two different questions and no one file
   answers both (see _annual_amc_bandhan_data):

     the YEAR's AMC     every ACTIVE agreement in the AMC Population Report, of
                        EVERY agreement type, in the month of its AGREEMENT
                        START DATE
     the MONTH's        the four Bandhan QUOTE files — Anubandhan Plus,
     business           Anubandhan, Bandhan Plus, Regular Bandhan — on PAYMENT
                        UPDATE DATE AND TIME, one row per quote

   Both arrive as raw monthly counts, so the live columns are derived here with
   no refetch.

   The sheet is ONE FINANCIAL YEAR wide, and that year is NOT a choice: the
   backend reports the year the agreements run to (meta.fy) and the page picks
   only how far into it to read (`upto`). A year starting Apr 2026 is called F27,
   the year it ENDS in. With meta.fy = 2026 and upto = Jun 2026:

     F26 ACT D/BAMC            AOP master — last year's actual
     F27 PROJ AOP D/BAMC       AOP master — this year's projection
     BEST ACT AOP D/BAMC (M)   AOP master — the year's best month
     F27 YTD ACT AMC NOS       COUNTED: LIVE agreements - Active AND not yet
                               expired, every type. A POPULATION as on today, so
                               neither the year nor `upto` moves it.
     Jun-26 Act                COUNTED: that month's PAYMENTS from the quote
                               files. The only column `upto` moves.

   THE FIRST THREE COLUMNS ARE THE AOP MASTER'S, AND NOTHING ELSE'S. They are
   figures the business asserts, so nothing in the data seeds, raises, lowers or
   back-fills them — an unset cell prints a dash, never something derived behind
   the reader's back. (Last year's actual could not be counted honestly anyway:
   the AMC Population file is a snapshot keyed on instance id, one row per genset
   carrying only its latest agreement, so a renewal overwrites the agreement it
   replaced and a closed year's count shrinks every month — FY26 counts 937
   today against the 1,353 the business closed it with.)

   Every column adds up the same way: a region or company row is the SUM of its
   branches. The three AOP figures sum their typed values and stay null until at
   least one branch has one, so an unfilled region reads as empty rather than as
   a target of zero.

   The month picker moves the LAST COLUMN ONLY. Everything else belongs to the
   year, not to the month being read: the two AOP figures, the best-month mark,
   and the year's AMC count.
---------------------------------------------------------------------------- */

const pd = (s) => new Date(s + 'T00:00:00');
const fmtMon = (s) => (s ? pd(s).toLocaleDateString('en-GB',
  { month: 'short', year: '2-digit' }) : '');
const shortBranch = (b) => String(b || '').replace(/^KALA\s*Care\s*Global\s*LLP\s*[-–]\s*/i, '');
const branchNo = (id) => {
  const m = String(id || '').match(/_(\d+)$/);
  return m ? Number(m[1]) : 9999;
};
const nf = (v) => (v ? Number(v).toLocaleString('en-IN') : '');

// The financial year (Apr–Mar) an ISO date falls in, and the F<yy> the business
// calls it: FY starting Apr 2026 is 'F27', the year it ENDS in.
const fyOfIso = (d) => (Number(d.slice(5, 7)) >= 4
  ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);
const fLabel = (fy) => `F${String(fy + 1).slice(-2)}`;
// The 12 'YYYY-MM' of a financial year, April first.
const fyMonths = (fy) => Array.from({ length: 12 }, (_v, i) => {
  const m = 4 + i;
  return m <= 12 ? `${fy}-${String(m).padStart(2, '0')}`
    : `${fy + 1}-${String(m - 12).padStart(2, '0')}`;
});

// upto  'YYYY-MM' - the month the LAST column shows, and the only choice the
//       page offers. The YEAR is not one: it is meta.fy, the running financial
//       year. A from/to date range was tried first and read as a filter that did
//       nothing, because every other column belongs to the year, not to a range.
// tabs  the AMC report's own tab strip, rendered INSIDE this sheet's header
//       row rather than above it - two stacked bars for one report read as
//       two headers, and the row already had the space.
const AmcBandhanProjectionReport = ({ data, upto: uptoProp, tabs = null }) => {
  const { branches = [], branch_ids: ids = [], branch_regions: regions = [],
    active_nos: activeNos = [], pay_records: payRecords = [],
    koel_active: koelActive = 0,
    targets = {}, meta = {} } = data || {};

  const regionOf = (bi) => (String(regions[bi]).toUpperCase() === 'KA' ? 'KA' : 'MH');
  const order = branches
    .map((_b, bi) => bi)
    .sort((a, b) => {
      const ra = regionOf(a) === 'KA' ? 1 : 0;
      const rb = regionOf(b) === 'KA' ? 1 : 0;
      return ra - rb || branchNo(ids[a]) - branchNo(ids[b]);
    });

  // ---- the financial year, and how far into it we are ---------------------
  // The year comes from the backend (meta.fy) — it is the year the agreements
  // run to, not a choice. The fallback only covers the frame before the payload
  // lands.
  const fy = Number.isFinite(meta.fy) && meta.fy !== null ? meta.fy
    : (meta.max_month ? fyOfIso(`${meta.max_month}-01`) : new Date().getFullYear());
  const months = fyMonths(fy);
  // Clamped into the year, so a month outside it can never blank the sheet.
  const raw = uptoProp || meta.max_month || months[11];
  const upto = raw < months[0] ? months[0] : (raw > months[11] ? months[11] : raw);

  // ---- the month series, per branch ---------------------------------------
  // The AMC column needs no series at all: it is one live-agreement count per
  // branch (activeNos), with no date filter of any kind. Only the month column
  // walks a calendar, and it walks the quote files' payments.
  const payOf = branches.map(() => ({}));
  payRecords.forEach(([bi, m, n]) => {
    if (payOf[bi]) payOf[bi][m] = (payOf[bi][m] || 0) + n;
  });

  // One row's five figures. `list` is the branches it covers, so a region and
  // the company row are computed exactly like a branch: the three AOP figures
  // are ADDED UP from their branches, the two counted ones from their branches'
  // monthly series.
  const figures = (list) => {
    // this row's month-by-month payments
    const monthly = {};
    list.forEach((bi) => {
      months.forEach((m) => {
        const v = payOf[bi][m];
        if (v) monthly[m] = (monthly[m] || 0) + v;
      });
    });

    // The first THREE columns come from the AOP master and from nowhere else:
    // last year's actual, this year's projection, and the year's best month are
    // all figures the business asserts. Nothing in the data seeds, raises or
    // back-fills any of them, so an unset cell stays a dash instead of showing
    // something derived behind the reader's back.
    //
    // Each is summed over the row's branches, and a null stays null until at
    // least one branch has a figure - so a region nobody has filled in reads as
    // empty rather than as a target of zero. `missing` counts the branches still
    // unset, which is how a part-filled total can say so.
    const aop = (field) => {
      let total = null, missing = 0;
      list.forEach((bi) => {
        const v = (targets[`${fy}|${ids[bi]}`] || {})[field];
        if (v === null || v === undefined) { missing += 1; return; }
        total = (total || 0) + v;
      });
      return { total, missing };
    };
    const priorA = aop('prior');
    const projA = aop('proj');
    const bestA = aop('best');

    return {
      prior: priorA.total,
      priorMissing: priorA.missing,
      priorBy: list.length === 1
        ? (targets[`${fy}|${ids[list[0]]}`] || {}).prior_by : null,
      priorAt: list.length === 1
        ? (targets[`${fy}|${ids[list[0]]}`] || {}).prior_at : null,
      proj: projA.total,
      projMissing: projA.missing,
      best: bestA.total,
      bestMissing: bestA.missing,
      // AMC: every ACTIVE agreement this branch holds, of every type. A
      // POPULATION — no date filter of any kind, not the year and not the month,
      // so it reads the same whatever is picked above. The month picker moves
      // `month` alone.
      ytd: list.reduce((sum, bi) => sum + (activeNos[bi] || 0), 0),
      month: monthly[upto] || 0,
    };
  };

  const COLS = [
    `${fLabel(fy - 1)} ACT D/BAMC`,
    `${fLabel(fy)} PROJ AOP D/BAMC`,
    'BEST ACT AOP D/BAMC (M)',
    `${fLabel(fy)} YTD ACT AMC NOS`,
    `${fmtMon(`${upto}-01`) || 'Month'} Act`,
  ];
  // What each heading means, on hover. The headings are abbreviations, so the
  // column itself has to be able to explain them - the same order as COLS.
  const COL_TIPS = [
    `${fLabel(fy - 1)} ACT — last year's actual (Apr ${fy - 1} to Mar ${fy}).`
    + ' Entered in AOP Master, AMC & Bandhan AOP. Empty until then.',
    `${fLabel(fy)} PROJ AOP — this year's target. Entered in AOP Master, AMC & Bandhan AOP.`,
    'BEST ACT (M) — the best month for the year. Entered in AOP Master, AMC & Bandhan'
    + ' AOP; nothing in the data changes it.',
    'YTD ACT AMC — every agreement stamped Active in the AMC Population Report,'
    + ' of every type except KOEL Agreement, which has its own row under the'
    + ' total. NO date filter of any kind: not the year, not the month above,'
    + ' and not the agreement’s own end date — so this column ties to the'
    + ' Active count in the file itself.',
    'That MONTH\'s business, from the four Bandhan quote files (Anubandhan Plus,'
    + ' Anubandhan, Bandhan Plus, Regular Bandhan) on PAYMENT UPDATE DATE AND'
    + ' TIME, branch wise. Money received, not cover starting — the only column'
    + ' the month picker moves.',
  ];
  const valsOf = (f) => [f.prior, f.proj, f.best, f.ytd, f.month];

  const KOEL_TIP = 'KOEL\u2019s own corporate cover \u2014 sold by KOEL, not by this'
    + ' dealership, so it is kept off the branch rows and off KCGL TOTAL and'
    + ' counted here instead. Live agreements only, the same test as the column'
    + ' above. No AOP and no quote payments: nobody targets KOEL\u2019s own sales.';
  const GRAND_TIP = 'KCGL TOTAL + ' + (meta.koel_agreement_type || 'KOEL Agreement')
    + ' \u2014 every live agreement in the AMC Population Report, whoever sold it.';

  const CELL = 'px-2 py-1.5 text-center text-[11px] text-black tabular-nums border-b border-l border-gray-400 whitespace-nowrap';
  const LCELL = 'px-2 py-1.5 text-left text-[11px] text-black border-b border-l border-gray-400';
  const TH = 'px-2 py-1.5 text-[10px] font-semibold text-black text-center border-b border-l border-gray-400 leading-tight';

  // tip0: what the LAST-FY cell says on hover — who put the figure there, or
  // that nobody has yet. On HOVER only, so the sheet stays one clean number per
  // cell (the export carries the same thing as a cell note).
  const row = (key, bid, name, vals, style, cls = '', tip0 = undefined) => (
    <tr key={key} style={style}>
      <td className={`${CELL} ${cls} !border-l-0`}>{bid}</td>
      <td className={`${LCELL} ${cls} font-semibold`} title={name}>
        <div className="truncate max-w-[150px]">{name}</div>
      </td>
      {vals.map((v, i) => (
        <td key={COLS[i]}
          className={`${CELL} ${cls}${
            v === null || v === undefined || v === 0 ? ' text-gray-400' : ''
          }${i === vals.length - 1 ? ' border-r' : ''}`}
          title={i === 0 ? tip0 : undefined}>
          {v === null || v === undefined ? '–' : (nf(v) || '–')}
        </td>
      ))}
    </tr>
  );

  // Who put last year's figure there — the one number on the sheet that is
  // asserted rather than counted, so it carries its author.
  const fmtWhen = (iso) => (iso
    ? pd(iso.slice(0, 10)).toLocaleDateString('en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const priorTip = (f, members) => {
    if (f.prior === null || f.prior === undefined) {
      return `${fLabel(fy - 1)} ACT is not set. Fill it in AOP Master → AMC & Bandhan AOP`
        + ' (the Fill from counted button puts the counted figure in).';
    }
    if (f.priorMissing) {
      return `${f.priorMissing} of ${members} branches have no ${fLabel(fy - 1)} ACT set,`
        + ' so this total covers only the rest.';
    }
    return f.priorBy
      ? `Set by ${f.priorBy}${f.priorAt ? ` on ${fmtWhen(f.priorAt)}` : ''}.`
      : `${fLabel(fy - 1)} ACT, as entered in the AOP master.`;
  };

  // Unmapped Branch is a DIAGNOSTIC, not a branch: it holds whatever carried a
  // branch id no master knows. A real KALA branch keeps its row even with
  // nothing in it — the sheet is meant to list all of them — but this bucket
  // earns its row only when it actually carries a figure IN THE YEAR ON SCREEN.
  // (Today it holds 12 quote payments with no branch id, all of them in earlier
  // years, so it drew a row of five dashes.) It is never silently dropped when
  // it does hold something: the note under the table then says so.
  const isUnmapped = (bi) => String(ids[bi] || '').toUpperCase() === 'UNMAPPED';
  const hasFigures = (bi) => valsOf(figures([bi])).some((v) => v);
  const shown = order.filter((bi) => !isUnmapped(bi) || hasFigures(bi));

  const body = [];
  ['MH', 'KA'].forEach((rg) => {
    const list = shown.filter((bi) => regionOf(bi) === rg);
    if (!list.length) return;
    list.forEach((bi, i) => {
      const f = figures([bi]);
      body.push(row(`b${bi}`, ids[bi], shortBranch(branches[bi]), valsOf(f),
        { background: i % 2 ? GRID.rowB : GRID.rowA }, '',
        priorTip(f, 1)));
    });
    const rf = figures(list);
    body.push(row(`t${rg}`, '', `${rg} TOTAL`, valsOf(rf),
      { background: GRID.region, color: '#fff' }, '!text-white font-bold',
      priorTip(rf, list.length)));
  });
  const overall = figures(shown);

  // Cities the territory list (QUOTE_CITY_BRANCH) has never been told about,
  // biggest first. Their paid quotes ARE counted - on the Unmapped Branch row -
  // so the money is never lost; what is missing is only which branch should get
  // the credit, and naming the cities is the only way anyone can supply that.
  const unmappedCities = Object.entries(meta.pay_unmapped_cities || {})
    .sort((a, b) => b[1] - a[1]);
  const unmappedTotal = unmappedCities.reduce((t, [, n]) => t + n, 0);

  // ---- the two rows UNDER the company total -------------------------------
  // KOEL AGREEMENT is KOEL's own corporate cover. The dealership does not sell
  // it, so it is kept off every branch row and off KCGL TOTAL — crediting a
  // branch with it would be crediting business that branch did not do. It has
  // no AOP of its own (nobody targets KOEL's own sales), no best month and no
  // payments in the quote files, so only the AMC column carries a figure.
  //
  // GRAND TOTAL then adds the two back together, which is the point of showing
  // them apart: the sheet still ends on the WHOLE live population, with the part
  // the branches own visible as its own line.
  const koelRow = {
    prior: null, priorMissing: 0, proj: null, projMissing: 0,
    best: null, bestMissing: 0,
    ytd: koelActive,
    month: null,          // the quote files hold no KOEL Agreement
  };
  const grand = {
    ...overall,
    ytd: (overall.ytd || 0) + (koelActive || 0),
  };

  // ---- export --------------------------------------------------------------
  const exportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const cols = [{ width: 13 }, { width: 26 }, ...COLS.map(() => ({ width: 17 }))];
      const { wb, ws, put } = newSheet(ExcelJS, 'AMC & Bandhan Projection',
        `AMC & Bandhan Projection   ${'·'}   FY ${fy}-${String(fy + 1).slice(-2)}`
        + `   ${'·'}   D/BAMC = Dealer + Bandhan agreements, on Agreement Start Date`
        + `   ${'·'}   AMC: the year${' '}${'·'}   `
        + `${fmtMon(`${upto}-01`)}: quote payments that month`,
        cols);

      const HD = { font: { bold: true, color: A('111827') }, fill: XL.HEAD, align: CENTER };
      ['Branch', 'BRANCH NAME', ...COLS].forEach((h, i) => put(2, i + 1, h, HD));
      ws.getRow(2).height = 34;

      let r = 3;
      const line = (bid, name, vals, o = {}) => {
        put(r, 1, bid, { ...o, align: CENTER });
        put(r, 2, name, { ...o, align: LEFT });
        vals.forEach((v, i) => put(r, 3 + i,
          v === null || v === undefined ? '' : v,
          { ...o, align: CENTER, fmt: F_CNT }));
        ws.getRow(r).height = 16;
        r += 1;
      };

      ['MH', 'KA'].forEach((rg) => {
        const list = shown.filter((bi) => regionOf(bi) === rg);
        if (!list.length) return;
        list.forEach((bi, i) => {
          const f = figures([bi]);
          line(ids[bi], shortBranch(branches[bi]), valsOf(f),
            { fill: i % 2 ? XL.ROW_B : XL.ROW_A });
        });
        const rf = figures(list);
        line('', `${rg} TOTAL`, valsOf(rf),
          { fill: XL.REGION, font: { bold: true, color: A('FFFFFF') } });
      });
      line('', 'KCGL TOTAL', valsOf(overall),
        { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } });
      line('', `${meta.koel_agreement_type || 'KOEL Agreement'} (overall)`,
        valsOf(koelRow), { fill: XL.ROW_B, font: { bold: true } });
      line('', 'GRAND TOTAL', valsOf(grand),
        { fill: XL.BRAND, font: { bold: true, color: A('FFFFFF') } });

      await saveBook(wb, `PMS_AMC_Bandhan_Projection_FY${fy}-${String(fy + 1).slice(-2)}.xlsx`);
      toast.success('AMC & Bandhan Projection exported');
    } catch (e) {
      toast.error('Export failed: ' + e.message);
    }
  };

  const noTargets = !shown.some((bi) => targets[`${fy}|${ids[bi]}`]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* ONE row: the report's own tabs, then the title and its period line,
          then Export — mr-auto on the text block does the pushing. */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {tabs}
        <div className="mr-auto flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <p className="text-sm font-extrabold text-gray-900">AMC &amp; Bandhan Projection</p>
          <p className="text-[10px] text-gray-400">
            {fLabel(fy)} · FY {fy}–{String(fy + 1).slice(-2)} · AMC for the year
            {' '}· {fmtMon(`${upto}-01`)} for the month column
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
        {noTargets && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            No <b>{fLabel(fy)} PROJ AOP</b> for FY {fy}–{String(fy + 1).slice(-2)} — enter it
            in <b>AOP Master → AMC &amp; Bandhan AOP</b>.
          </div>
        )}
        <div className="border border-gray-400 rounded-xl overflow-x-auto">
          <table className="pms-grid border-separate [border-spacing:0] w-full"
            style={{ minWidth: 'max-content' }}>
            <thead>
              <tr>
                <th className={`${TH} !border-l-0`} style={{ background: GRID.head, width: 90 }}>
                  Branch
                </th>
                <th className={TH} style={{ background: GRID.head, width: 170 }}>BRANCH NAME</th>
                {COLS.map((c, i) => (
                  <th key={c} className={`${TH}${i === COLS.length - 1 ? ' border-r' : ''}`}
                    title={COL_TIPS[i]}
                    style={{ background: i === 2 ? GRID.typed : GRID.head, width: 120 }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{body}</tbody>
            <tfoot>
              <tr className="font-bold text-white" style={{ background: GRID.grand }}>
                <td className={`${CELL} !text-white !border-l-0`} />
                <td className={`${LCELL} !text-white font-bold`}>KCGL TOTAL</td>
                {valsOf(overall).map((v, i) => (
                  <td key={COLS[i]} className={`${CELL} !text-white${
                    i === COLS.length - 1 ? ' border-r' : ''}`}
                    title={i === 0 ? priorTip(overall, shown.length) : undefined}>
                    {v === null || v === undefined ? '–' : (nf(v) || '–')}
                  </td>
                ))}
              </tr>
              {/* KOEL's own cover, and then the whole population. Lighter than
                  the two totals around them so the eye still reads KCGL TOTAL
                  and GRAND TOTAL as the lines that matter. */}
              <tr style={{ background: GRID.subTot }}>
                <td className={`${CELL} !border-l-0`} />
                <td className={LCELL} title={KOEL_TIP}>
                  <span className="font-semibold">
                    {meta.koel_agreement_type || 'KOEL Agreement'}
                  </span>
                  <span className="ml-1 text-[9px] text-gray-500">overall</span>
                </td>
                {valsOf(koelRow).map((v, i) => (
                  <td key={COLS[i]}
                    className={`${CELL}${v ? '' : ' text-gray-400'}${
                      i === COLS.length - 1 ? ' border-r' : ''}`}
                    title={i === 3 ? KOEL_TIP : undefined}>
                    {v === null || v === undefined ? '–' : (nf(v) || '–')}
                  </td>
                ))}
              </tr>
              <tr className="font-bold text-white" style={{ background: GRID.grand }}>
                <td className={`${CELL} !text-white !border-l-0`} />
                <td className={`${LCELL} !text-white font-bold`} title={GRAND_TIP}>
                  GRAND TOTAL
                </td>
                {valsOf(grand).map((v, i) => (
                  <td key={COLS[i]} className={`${CELL} !text-white${
                    i === COLS.length - 1 ? ' border-r' : ''}`}
                    title={i === 3 ? GRAND_TIP : undefined}>
                    {v === null || v === undefined ? '–' : (nf(v) || '–')}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* No explanation under the table by request. What it would have said
            lives in the block comment at the top of this file: which three
            columns are the AOP master's, what the AMC population counts, and
            which file the month column comes from. The tallies (counted, the
            type mix, quote rows never paid) are in the payload's meta if they
            are ever needed again.

            The ONE thing that does surface: cities the territory list has never
            been told about. Their quotes are real business sitting on the
            Unmapped Branch row, and the only way anyone can fix that is by being
            told WHICH cities - a silent bucket would just be wrong every month
            with nobody able to say why. */}
        {unmappedCities.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <p>
              <b>{nf(unmappedTotal)} paid quote{unmappedTotal === 1 ? '' : 's'}</b>
              {' '}could not be placed on a branch — their city is not in the
              territory list, so they sit on the <b>Unmapped Branch</b> row.
              Send these city names to have them added:
            </p>
            <p className="mt-1 leading-relaxed">
              {unmappedCities.map(([city, n], i) => (
                <span key={city}>
                  {i > 0 && <span className="text-amber-500">{' · '}</span>}
                  <span className="font-semibold">{city}</span>
                  <span className="text-amber-700"> ({nf(n)})</span>
                </span>
              ))}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AmcBandhanProjectionReport;
