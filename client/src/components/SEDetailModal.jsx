import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { canExportExcel } from '../utils/exportPermission';
import { loadExcelJS, newSheet, saveBook, XL, CENTER, LEFT } from '../utils/pmsExport';
import { THEME, GRID } from './reportChrome';

/* ----------------------------------------------------------------------------
   SE drill-down — the RECORDS behind one engineer's numbers.

   Both PMS reports print counts per Service Engineer; clicking the SE name
   opens this box on the rows those counts were made of, for the period the
   report is already showing. Nothing is aggregated here: what the table lists
   IS what the cell counted, so a branch head can read the figure SR by SR.

   mode='ep'    Employee Productivity -> the CLOSE SR rows (Response Time &
                MaxTTR file). ONE list. The engineer is addressed by NAME +
                BRANCH, because that report keeps an engineer with rows in two
                branches as two rows.

   mode='srar'  SR Allocation -> the EFSR appointments, as TWO TABS, one per
                figure the report prints:
                  Allocated   TASK ASSIGNED DATE in the period   (opens first)
                  Closed      TASK END DATE in the period
                They overlap on the rows both assigned and finished here, so
                the tabs deliberately do not add up.

   THE DATE THAT DRIVES THE COUNT IS THE FIRST COLUMN, and pinned: Task
   Assigned / Task End on SR Allocation, SR Close Date on Employee
   Productivity. Everything else the import stored follows — including the
   file's DYNAMIC columns (extra_columns), so the popup shows the whole row as
   the file delivered it, not only the part the report reads.
---------------------------------------------------------------------------- */

const API = import.meta.env.VITE_BACKEND_URL;
const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

const nf = (v) => (v || 0).toLocaleString('en-IN');
const Z = '—';
const W_SR = 56;                       // the Sr.NO. column

/* A collapsed border is DROPPED on a sticky cell the moment it scrolls — which
   is why the frozen columns lost their grid lines the instant the table moved
   sideways. So this table is built the way the PMS report grids are: separated
   borders, and .pms-grid paints every hairline as an INSET BOX-SHADOW, which a
   sticky cell keeps. The frozen block is then closed with a real right border
   plus a soft drop shadow, so the scrolling columns visibly pass UNDER it.
   The inline shadow replaces the CSS one, so it repeats the two hairlines. */
const EDGE_R = {
  borderRight: `1px solid ${GRID.div}`,
  boxShadow: `inset -1px 0 0 0 ${GRID.div}, inset 0 -1px 0 0 ${GRID.line},`
    + ' 2px 0 5px -2px var(--pms-edge-shadow)',
};

// ISO datetime -> '17 Jul 26, 12:29'. The time matters here: two appointments
// of the same day are told apart by it.
const fmtDT = (s) => {
  if (!s) return Z;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${hm}`;
};
const fmtD = (s) => {
  if (!s) return Z;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? String(s)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};
// Excel must receive a real Date or the column stops being a date column.
const xlDate = (s) => (s ? new Date(s) : '');

// What a cell actually PRINTS — the formatted text, not the stored value. The
// search box and the highlight both work off this as well as the raw value, so
// typing either '2026-07-17' or '17 Jul' finds the same date cell.
const cellText = (c, v) => (v === null || v === undefined || v === ''
  ? '' : String(c.fmt ? c.fmt(v) : v));

// Every occurrence of the search text, painted yellow inside the cell.
const Mark = ({ text, q }) => {
  const t = String(text);
  if (!q) return t;
  const lower = t.toLowerCase();
  if (!lower.includes(q)) return t;
  const out = [];
  let from = 0, k = 0, i = lower.indexOf(q);
  while (i >= 0) {
    if (i > from) out.push(t.slice(from, i));
    out.push(
      // a literal yellow, not a token: it has to read the same in both themes
      <mark key={`m${k}`} className="rounded-[2px] bg-yellow-300 px-[1px] text-black">
        {t.slice(i, i + q.length)}
      </mark>,
    );
    k += 1;
    from = i + q.length;
    i = lower.indexOf(q, from);
  }
  if (from < t.length) out.push(t.slice(from));
  return out;
};

// The two cuts of the EFSR rows the SR Allocation report is read as.
const SR_TABS = [
  { v: 'alloc', t: 'Allocated',
    hint: 'Rows with a TASK ASSIGNED DATE inside the period — the report’s Allocated Total Task',
    test: (r) => r.allocated_in },
  { v: 'close', t: 'Closed',
    hint: 'Rows with a TASK END DATE inside the period — the report’s Closed Total Task. '
      + 'Includes work that was allocated in an earlier period.',
    test: (r) => r.closed_in },
];

/* ---- the two column sets ---------------------------------------------------
   key  field on the record        t    header
   w    px width                   xl   excel width
   fmt  cell renderer              date real date (excel + centred)
   num  numeric (centred)          pin  frozen at the left edge
   why  header tooltip — used on the columns the counts are made on         */
const EP_COLS = [
  { key: 'close_date', t: 'SR Close Date', w: 128, fmt: fmtDT, date: true, pin: true, xl: 18,
    why: 'THE COLUMN THIS REPORT COUNTS ON — a row is a Close SR on this date' },
  { key: 'sr_number', t: 'SR Number', w: 105, pin: true, xl: 16 },
  { key: 'sr_type', t: 'SR Type', w: 150, xl: 22 },
  { key: 'sr_subtype', t: 'SR Sub Type', w: 130, xl: 20 },
  { key: 'head', t: 'SR Type Head', w: 120, xl: 18,
    why: 'The SR Type Master (MaxTTR) head — the report’s SR Type split' },
  { key: 'segment', t: 'Segment', w: 74, xl: 10 },
  { key: 'product_segment', t: 'Product Segment', w: 120, xl: 18 },
  { key: 'goem_oem', t: 'GOEM / OEM', w: 100, xl: 15 },
  { key: 'application_code', t: 'Application Code', w: 120, xl: 18 },
  { key: 'account', t: 'Account', w: 230, xl: 34 },
  { key: 'instance_id', t: 'Instance ID', w: 95, xl: 14 },
  { key: 'engine_no', t: 'Engine Serial No', w: 130, xl: 19 },
  { key: 'branch', t: 'Branch', w: 130, xl: 20 },
  { key: 'branch_id', t: 'Branch ID', w: 90, xl: 13 },
  { key: 'zone', t: 'Zone', w: 100, xl: 15 },
  { key: 'asm_name', t: 'ASM Name', w: 140, xl: 20 },
  { key: 'sd_id', t: 'SD ID', w: 90, xl: 13 },
  { key: 'sd_name', t: 'SD Name', w: 170, xl: 25 },
  { key: 'sr_open_date', t: 'SR Open Date', w: 128, fmt: fmtDT, date: true, xl: 18 },
  { key: 'task_start_date', t: 'Task Start Date', w: 128, fmt: fmtDT, date: true, xl: 18 },
  { key: 'task_end_date', t: 'Task End Date', w: 128, fmt: fmtDT, date: true, xl: 18 },
  { key: 'response_range', t: 'Response Time Range (hrs)', w: 130, xl: 20 },
  { key: 'response_time', t: 'Response Time', w: 105, xl: 15 },
  { key: 'maxttr_task_hrs', t: 'MaxTTR on Task Closed (hrs)', w: 135, xl: 20 },
  { key: 'maxttr_sr_hrs', t: 'MaxTTR on SR Closed (hrs)', w: 135, xl: 20 },
  { key: 'se_name', t: 'SE Name', w: 150, xl: 22 },
  { key: 'se_ticket', t: 'SE Ticket No', w: 105, xl: 15 },
  { key: 'remarks', t: 'Engineer Remarks', w: 280, xl: 42 },
];

const SRAR_COLS = [
  // The two dates the report's two figures are counted on, first and frozen.
  { key: 'assigned_date', t: 'Task Assigned Date', w: 132, fmt: fmtDT, date: true, pin: true, xl: 19,
    why: 'THE COLUMN ALLOCATED IS COUNTED ON — the day the SR was given to the engineer' },
  { key: 'end_date', t: 'Task End Date', w: 132, fmt: fmtDT, date: true, pin: true, xl: 19,
    why: 'THE COLUMN CLOSED IS COUNTED ON — the day the engineer finished the job' },
  { key: 'appointment_no', t: 'Appointment No', w: 125, xl: 19,
    why: 'One row per appointment (a dispatch) — the record key of the EFSR file' },
  { key: 'sr_number', t: 'SR Number', w: 105, xl: 16 },
  { key: 'sr_type', t: 'SR Type', w: 150, xl: 22 },
  { key: 'head', t: 'SR Type Head', w: 120, xl: 18,
    why: 'The SR Type Master (EFSR) head — the report’s row-wise SR Type split' },
  { key: 'sr_status', t: 'SR Status', w: 140, xl: 21 },
  { key: 'sr_closed_date', t: 'SR Closed Date', w: 120, fmt: fmtD, date: true, xl: 17,
    why: 'The BACK-OFFICE closure. NOT what this report counts, and blank on '
      + 'many rows the engineer has actually finished.' },
  { key: 'days', t: 'Days Taken', w: 80, num: true, xl: 11,
    why: 'Task End Date − Task Assigned Date' },
  { key: 'account', t: 'Account', w: 230, xl: 34 },
  { key: 'customer_name', t: 'Customer Name', w: 170, xl: 25 },
  { key: 'customer_contact', t: 'Customer Contact', w: 120, xl: 18 },
  { key: 'instance_id', t: 'Instance ID', w: 95, xl: 14 },
  { key: 'branch_code', t: 'SD Branch Code', w: 110, xl: 16 },
  { key: 'se_uid', t: 'SE UID', w: 105, xl: 15 },
  { key: 'se_name', t: 'SE Name (file)', w: 150, xl: 22 },
  { key: 'site', t: 'Installation Site Address', w: 280, xl: 42 },
];

const SEDetailModal = ({ mode, name, uid, branch, branchId, region, from, to, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // SR Allocation opens on ALLOCATED — the figure the report is named for.
  const [tab, setTab] = useState('alloc');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: '', dir: 1 });
  const [busy, setBusy] = useState(false);

  // 'ep-other' is the MH Other / KA Other row: the same Close SR record shape
  // as one engineer's drill-down, but the rows of a whole REGION done by
  // engineers who belong to another branch — so it reads like 'ep' throughout
  // and only the URL differs.
  const isOther = mode === 'ep-other';
  const isEP = mode === 'ep' || isOther;
  const canExport = canExportExcel();

  // Esc closes, and the page behind must not scroll while the box is open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const p = new URLSearchParams({ date_from: from || '', date_to: to || '' });
        if (isOther) {
          p.set('region', region || '');
        } else {
          p.set('name', name || '');
          if (isEP) p.set('branch_id', branchId || '');
        }
        const url = `${API}/pms/report/${isEP ? 'employee-productivity' : 'sr-allocation'}`
          + `/${isOther ? 'other-records' : 'se-records'}?${p.toString()}`;
        const res = await fetch(url, { headers: authHeaders() });
        const d = await res.json();
        if (!alive) return;
        if (!res.ok || !d.success) throw new Error(d.message || d.detail || 'Failed to load');
        setData(d);
      } catch (e) { if (alive) setError(e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [isEP, name, branchId, from, to]);

  // The import's own DYNAMIC columns come last, under their original file
  // header, so nothing the file carried is missing from the drill-down — minus
  // the handful whose header is simply the file's spelling of a column that
  // already has a field of its own, which would otherwise print twice.
  const cols = useMemo(() => {
    const base = isEP ? EP_COLS : SRAR_COLS;
    const tight = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
    const dup = new Set(['instanceid', 'account', 'customername',
      'customercontactnumber', 'installationsiteaddress']);
    const extra = (data?.extra_columns || [])
      .filter((h) => !dup.has(tight(h)))
      .map((h) => ({ key: `x:${h}`, t: h, w: 150, xl: 22, extra: true }));
    return [...base, ...extra];
  }, [isEP, data]);

  // Left offsets for the frozen columns, Sr.NO. first.
  const pinLeft = useMemo(() => {
    const out = {};
    let x = W_SR;
    cols.forEach((c) => { if (c.pin) { out[c.key] = x; x += c.w; } });
    return out;
  }, [cols]);
  // The column that CLOSES the frozen block — it carries the divider.
  const lastPin = useMemo(() => {
    const p = cols.filter((c) => c.pin);
    return p.length ? p[p.length - 1].key : null;
  }, [cols]);

  // The tab counts ARE the report's own figures: alloc = Allocated Total Task,
  // close = Closed Total Task — so the row's numbers stay on screen.
  const counts = useMemo(() => {
    const rs = (data && data.records) || [];
    return {
      alloc: rs.filter((r) => r.allocated_in).length,
      close: rs.filter((r) => r.closed_in).length,
    };
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    // Dynamic columns are flattened onto the row so sorting, the search box and
    // the export treat them exactly like a stored one.
    let list = (data.records || []).map((r) => {
      const flat = { ...r };
      Object.entries(r.extra || {}).forEach(([k, v]) => { flat[`x:${k}`] = v; });
      return flat;
    });
    if (!isEP) {
      const t = SR_TABS.find((x) => x.v === tab) || SR_TABS[0];
      list = list.filter(t.test);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => cols.some((c) => {
        const v = r[c.key];
        if (v === null || v === undefined || v === '') return false;
        // the stored value AND the printed one, so a formatted date is findable
        return String(v).toLowerCase().includes(q)
          || cellText(c, v).toLowerCase().includes(q);
      }));
    }
    if (sort.key) {
      const c = cols.find((x) => x.key === sort.key);
      list = [...list].sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key];
        if (av === null || av === undefined || av === '') return 1;
        if (bv === null || bv === undefined || bv === '') return -1;
        const d = c?.num ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
        return d * sort.dir;
      });
    }
    return list;
  }, [data, isEP, tab, query, sort, cols]);

  const tabTotal = isEP ? (data?.records || []).length : (counts[tab] || 0);
  const hl = query.trim().toLowerCase();      // what the cells paint yellow

  const toggleSort = (key) => setSort((s) =>
    (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));

  // Exports exactly what is on screen — the open tab, after the search box.
  const exportExcel = useCallback(async () => {
    if (!data || busy) return;
    setBusy(true);
    try {
      const ExcelJS = await loadExcelJS();
      const period = `${fmtD(from)} to ${fmtD(to)}`;
      const tabName = isEP ? 'Close SR'
        : (SR_TABS.find((x) => x.v === tab)?.t || 'Allocated');
      const title = `${tabName} records — ${name}${branch ? ` (${branch})` : ''}`
        + ` — ${period} — ${rows.length} record(s)`;
      const { wb, ws, put } = newSheet(ExcelJS, tabName.replace(/[^A-Za-z ]/g, ''),
        title, cols.map((c) => ({ width: c.xl || 16 })));

      let r = 2;
      cols.forEach((c, i) => put(r, i + 1, c.t,
        { font: { bold: true, size: 10 }, fill: XL.HEAD, align: CENTER }));
      const head = r;
      r += 1;
      rows.forEach((row, i) => {
        cols.forEach((c, j) => {
          const raw = row[c.key];
          const v = c.date ? xlDate(raw) : (raw === null || raw === undefined ? '' : raw);
          put(r, j + 1, v, {
            fill: i % 2 ? XL.ROW_B : XL.ROW_A,
            fmt: c.date ? 'dd-mmm-yy hh:mm' : undefined,
            align: c.num || c.date ? CENTER : LEFT,
          });
        });
        r += 1;
      });
      ws.views = [{ state: 'frozen', ySplit: head }];
      ws.autoFilter = { from: { row: head, column: 1 },
        to: { row: head, column: cols.length } };

      const slug = String(name || 'SE').replace(/[^A-Za-z0-9]+/g, '_');
      await saveBook(wb, `${tabName.replace(/[^A-Za-z]/g, '')}_${slug}_${from}_to_${to}.xlsx`);
      toast.success('Records exported');
    } catch (e) {
      toast.error(e.message || 'Export failed');
    } finally { setBusy(false); }
  }, [data, busy, isEP, tab, cols, rows, name, branch, from, to]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative flex max-h-[94vh] w-full max-w-[98vw] flex-col overflow-hidden
        rounded-xl bg-white shadow-2xl">

        {/* ---- header ---------------------------------------------------- */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-2.5"
          style={{ background: THEME }}>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold text-white">{name || Z}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-white/85">
              {uid && <span>SE UID: <b className="tabular-nums">{uid}</b></span>}
              {branch && <span>Branch: <b>{branch}</b></span>}
              <span>Period: <b>{fmtD(from)} – {fmtD(to)}</b></span>
              <span className="rounded bg-white/15 px-1.5 py-[1px]">
                {isEP ? 'Close SR — Response Time & MaxTTR file, on SR CLOSE DATE'
                  : 'Allocated / Closed — EFSR file, on TASK ASSIGNED / TASK END DATE'}
              </span>
            </div>
          </div>
          {/* the app's standard modal close: a white rounded square on the
              coloured header, its cross turning 90° on hover */}
          <button onClick={onClose} aria-label="Close modal"
            className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
              bg-white transition-all duration-200 hover:bg-white/90 active:bg-white/80">
            <svg className="h-4 w-4 text-black transition-transform duration-200 group-hover:rotate-90"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ---- tabs (SR Allocation) + search + export --------------------- */}
        {!loading && !error && data && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-1.5">
            {!isEP && (
              <div className="flex items-center gap-1">
                {SR_TABS.map((x) => (
                  <button key={x.v} onClick={() => setTab(x.v)} title={x.hint}
                    className={`rounded px-2.5 py-[4px] text-[11px] font-semibold transition-colors ${
                      tab === x.v ? 'text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                    style={tab === x.v
                      ? { background: THEME }
                      : { background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
                    {x.t} <span className="tabular-nums">({nf(counts[x.v])})</span>
                  </button>
                ))}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search records…"
                className="h-7 w-52 rounded border border-gray-300 px-2 text-[11px] outline-none
                  focus:border-gray-500" />
              {canExport && (
                <button onClick={exportExcel} disabled={busy || !rows.length}
                  className="h-7 rounded px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: THEME }}>
                  {busy ? 'Exporting…' : 'Export Excel'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---- the records ------------------------------------------------ */}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && (
            <div className="flex justify-center py-14">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200"
                style={{ borderTopColor: THEME }} />
            </div>
          )}
          {!loading && error && (
            <div className="px-4 py-10 text-center text-[12px] text-red-600">{error}</div>
          )}
          {!loading && !error && !rows.length && (
            <div className="px-4 py-10 text-center text-[12px] text-gray-500">
              {query.trim()
                ? 'No record matches the search in this tab.'
                : 'No records for this engineer in the selected period.'}
            </div>
          )}
          {/* width:max-content — every column keeps the width it was given
              instead of being squeezed to the box, so the frozen block and the
              scrolling columns line up whatever the zoom. */}
          {!loading && !error && !!rows.length && (
            <table className="pms-grid border-separate [border-spacing:0] text-[10.5px]"
              style={{ width: 'max-content', minWidth: '100%' }}>
              <thead>
                <tr>
                  {/* sticky on BOTH axes: it is the top-left corner of the grid */}
                  <th className="px-1.5 py-1.5 text-center text-[9.5px] font-semibold text-gray-700"
                    style={{ background: GRID.head, width: W_SR, minWidth: W_SR, maxWidth: W_SR,
                      position: 'sticky', top: 0, left: 0, zIndex: 30 }}>Sr.NO.</th>
                  {cols.map((c) => (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      title={c.why ? `${c.why}\n\nClick to sort` : 'Click to sort'}
                      className="cursor-pointer select-none px-1.5 py-1.5
                        text-left text-[9.5px] font-semibold text-gray-700 hover:brightness-95"
                      style={{ background: GRID.head, width: c.w, minWidth: c.w, maxWidth: c.w,
                        position: 'sticky', top: 0,
                        ...(c.pin ? { left: pinLeft[c.key], zIndex: 30 } : { zIndex: 20 }),
                        ...(c.key === lastPin ? EDGE_R : null) }}>
                      {c.t}
                      {sort.key === c.key && (
                        <span className="ml-0.5 text-[8px]">{sort.dir > 0 ? '▲' : '▼'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const bg = i % 2 ? GRID.rowB : GRID.rowA;
                  return (
                    <tr key={`${r.appointment_no || r.sr_number || i}-${i}`} style={{ background: bg }}>
                      {/* a frozen cell must carry its OWN opaque fill — the row's
                          background scrolls away underneath it */}
                      <td className="px-1.5 py-1 text-center tabular-nums text-gray-500"
                        style={{ background: bg, width: W_SR, minWidth: W_SR, maxWidth: W_SR,
                          position: 'sticky', left: 0, zIndex: 10 }}>{i + 1}</td>
                      {cols.map((c) => {
                        const v = r[c.key];
                        const txt = cellText(c, v);
                        return (
                          <td key={c.key}
                            className={`px-1.5 py-1 align-middle ${
                              c.num || c.date ? 'text-center tabular-nums' : 'text-left'}`}
                            style={{ width: c.w, minWidth: c.w, maxWidth: c.w,
                              ...(c.pin ? { background: bg, position: 'sticky',
                                left: pinLeft[c.key], zIndex: 10 } : null),
                              ...(c.key === lastPin ? EDGE_R : null) }}>
                            <div className="truncate" title={txt || undefined}>
                              {txt ? <Mark text={txt} q={hl} /> : Z}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ---- footer ------------------------------------------------------ */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200
          bg-gray-50 px-4 py-1.5 text-[10px] text-gray-600">
          <span>
            Showing <b className="tabular-nums">{nf(rows.length)}</b>
            {tabTotal !== rows.length && ` of ${nf(tabTotal)}`} record(s)
            {!isEP && ` — ${SR_TABS.find((x) => x.v === tab)?.t}`}
          </span>
          <span className="truncate">
            {isEP
              ? 'One row per SR NUMBER, counted on SR Close Date — the same rule as the report column.'
              : 'One row per APPOINTMENT (a dispatch), so one SR re-attempted counts more than once.'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SEDetailModal;
