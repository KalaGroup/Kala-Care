import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ClipboardList, Building2, Plus, Trash2, CheckCircle2,
  AlertTriangle, CalendarDays, Users, X, CornerUpRight,
  BarChart3, Check, User, ListChecks, Zap,
  ChevronDown, FileText, MapPin, UserPlus, Upload, Search, RotateCcw,
  Crown,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
// xlsx-js-style is heavy (~140kB gzip) and only needed when a user actually
// exports to Excel — loaded on demand inside exportMeetingExcel() so it never
// weighs down the initial MOM page load (esp. for employees who only view).

/* ============================================================
   THEME — everything on screen follows the Kala Care system
   brand (indigo). The Excel export now uses the same indigo
   header styling (the old green fill is gone).
   ============================================================ */
const BRAND = '#2f3192';
const BRAND_DARK = '#23255f';
const BRAND_SOFT = 'rgba(47,49,146,0.10)';
const INK = 'var(--mom-ink)';       // theme-adaptive: near-black in light, light-grey in dark

// Compact Recharts tooltips — keeps the hover info box small on every chart
const TIP_PROPS = {
    contentStyle: { fontSize: 11, padding: '5px 8px', borderRadius: 8, lineHeight: 1.4 },
    itemStyle: { fontSize: 11, padding: '1px 0' },
    labelStyle: { fontSize: 11, fontWeight: 600 },
};
const SHEET = BRAND;                // sheet chrome = system brand
const SHEET_DARK = BRAND_DARK;
const SHEET_SOFT = BRAND_SOFT;

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;      // already ends in /api
const MOM_API = `${API_BASE_URL}/mom`;

/* Row status (Task rows only — Information rows have no status) */
const STATUS = {
  pending: { label: 'Pending', color: '#64748b', soft: 'rgba(100,116,139,0.12)' },
  in_progress: { label: 'WIP', color: '#d97706', soft: 'rgba(217,119,6,0.12)' },
  completed: { label: 'Completed', color: '#059669', soft: 'rgba(5,150,105,0.12)' },
  overdue: { label: 'Overdue', color: '#f87171', soft: 'rgba(248,113,113,0.12)' },
};

/* Action flag — exactly as in the sheet legend: T = Task, I = Information */
const FLAG = {
  T: { label: 'Task', color: '#b45309', bg: 'rgba(217,119,6,0.14)' },
  I: { label: 'Information', color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' },
};

const DEFAULT_CATEGORIES = {
  Sales: '#2f3192', Service: '#0d9488', Finance: '#059669',
  People: '#7c3aed', Marketing: '#d97706', Other: '#64748b',
};
const NEW_CAT_COLORS = ['#0ea5e9', '#e11d48', '#16a34a', '#9333ea', '#f59e0b', '#475569', '#db2777', '#0d9488'];
/* master meeting types — local fallback while the API is unreachable;
   the real list comes from /mom/bootstrap and is managed in Master setup */
const DEFAULT_MEETING_TYPES = [
  { id: 'd1', name: 'Monthly Branch Review' },
  { id: 'd2', name: 'Weekly Review' },
  { id: 'd3', name: 'Sales Review' },
  { id: 'd4', name: 'Service Review' },
  { id: 'd5', name: 'Special / Ad-hoc' },
];

/* Suggested types — the select also has an "Other — type manually…" option */

/* Column widths of the two sheet tables (kept in sync with the
   top scrollbar strip above the main table) */
const SHEET_MINW = '96rem';
const CARRY_MINW = '100rem';

/* ============================================================
   MASTER DISCUSSION AREAS (editable via "Master setup")
   These pre-fill the Discussion Area column of every new sheet.
   ============================================================ */
const DEFAULT_MASTER = [
  { id: 'm1', title: 'Sales target vs achievement (MTD)', category: 'Sales' },
  { id: 'm2', title: 'Outstanding payments & collections', category: 'Finance' },
  { id: 'm3', title: 'AMC renewals due this month', category: 'Service' },
  { id: 'm4', title: 'Pending service calls / installations', category: 'Service' },
  { id: 'm5', title: 'Customer complaints & escalations', category: 'Service' },
  { id: 'm6', title: 'Active campaign progress & follow-ups', category: 'Marketing' },
  { id: 'm7', title: 'Spare parts / inventory status', category: 'Service' },
  { id: 'm8', title: 'Staff attendance & performance', category: 'People' },
  { id: 'm9', title: 'Expense vouchers pending approval', category: 'Finance' },
  { id: 'm10', title: 'Local marketing / lead generation', category: 'Marketing' },
  { id: 'm11', title: 'Training & skill development', category: 'People' },
  { id: 'm12', title: 'Any other business (AOB)', category: 'Other' },
];

/* ============================================================
   HELPERS
   ============================================================ */
let _uid = 0;
const uid = (p = 'r') => `${p}${Date.now().toString(36)}${(_uid++).toString(36)}`;
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmt = (s) => s ? new Date(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';
const fmtDDMMYY = (s) => { if (!s) return ''; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
/* responsibility can be a legacy string or (now) an array of names */
const respArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
const isOverdue = (r) => r.flag === 'T' && r.status !== 'completed' && r.due && new Date(r.due) < today0();
const effStatus = (r) => r.status === 'completed' ? 'completed' : isOverdue(r) ? 'overdue' : r.status;
const autoGrow = (el) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
/* bullet-list typing for Discussion points / Remark fields —
   Enter starts a "● " line (and bullets the line just typed if it has
   none yet); Enter on an empty bullet removes it (exits the list);
   Backspace right after the marker deletes the bullet itself. */
const BULLET = '● ';
const handleBulletKeys = (e, value, commit) => {
  const el = e.target;
  const start = el.selectionStart, end = el.selectionEnd;
  const setCaret = (pos) => requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = pos; } catch { /* field gone */ } });
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const before = value.slice(0, start), after = value.slice(end);
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = before.slice(lineStart);
    if (/^\s*[•●]\s*$/.test(line) && line.length) {
      commit(value.slice(0, lineStart) + after);          // empty bullet → remove it
      setCaret(lineStart);
      return;
    }
    /* the first typed line gets its bullet on the first Enter too */
    const needsOwn = line.trim() && !/^\s*[•●]/.test(line);
    const fixedBefore = needsOwn ? value.slice(0, lineStart) + BULLET + line : before;
    const insert = !fixedBefore ? BULLET : '\n' + BULLET;
    commit(fixedBefore + insert + after);
    setCaret(fixedBefore.length + insert.length);
  } else if (e.key === 'Backspace' && start === end && start > 0) {
    const before = value.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    if (/^\s*[•●]\s?$/.test(before.slice(lineStart))) {
      e.preventDefault();
      commit(value.slice(0, lineStart) + value.slice(start));   // delete the whole marker
      setCaret(lineStart);
    }
  }
};
const daysFromDue = (due) => Math.round((today0() - new Date(due)) / 86400000); // +ve = overdue
/* consecutive rows sharing a Discussion Area are grouped so tables can draw
   the area cell ONCE (rowSpan) with its Discussion Points stacked beside it */
const groupConsecutive = (list, keyFn) => {
  const groups = [];
  list.forEach((item, i) => {
    const key = keyFn(item, i);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item); else groups.push({ key, items: [item] });
  });
  return groups;
};
/* generic list → Excel download used by the table "Excel" buttons across MOM
   (branded bold header row, auto column widths). xlsx-js-style is loaded on
   demand, same as the meeting-sheet export. */
async function exportTableExcel(fileBase, headers, rows2d, opts = {}) {
  const _xlsx = await import('xlsx-js-style');
  const XLSX = _xlsx.utils ? _xlsx : (_xlsx.default || _xlsx);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows2d]);
  ws['!cols'] = headers.map((h, i) => ({
    wch: Math.min(60, Math.max(String(h).length + 2, ...rows2d.map((r) => String(r[i] ?? '').split('\n')[0].length + 2), 8)),
  }));
  headers.forEach((_, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '2F3192' } }, alignment: { vertical: 'center', wrapText: true } };
  });
  /* wrap every data cell so bullet points / multi-line remarks show on their
     own lines, and size each row to fit its tallest cell. Cells of merged
     (grouped) columns are centered like on screen. */
  const mergeCols = opts.mergeCols || [];
  const rowHeights = [{ hpt: 20 }];
  rows2d.forEach((r, ri) => {
    let maxLines = 1;
    r.forEach((v, ci) => {
      const lines = String(v ?? '').split('\n').length;
      if (lines > maxLines) maxLines = lines;
      const cell = ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })];
      if (cell) cell.s = mergeCols.includes(ci)
        ? { alignment: { vertical: 'center', horizontal: 'center', wrapText: true } }
        : { alignment: { vertical: 'top', wrapText: true } };
    });
    rowHeights.push({ hpt: Math.min(220, 14 * maxLines + 6) });
  });
  ws['!rows'] = rowHeights;
  /* merge the grouped columns (Sr. No. / Discussion Area) across each
     area group — same layout as the on-screen tables */
  if (mergeCols.length && opts.groupSizes?.length) {
    const merges = [];
    let r = 1;                                     // data starts under the header row
    opts.groupSizes.forEach((n) => {
      if (n > 1) mergeCols.forEach((c) => merges.push({ s: { r, c }, e: { r: r + n - 1, c } }));
      r += n;
    });
    if (merges.length) ws['!merges'] = merges;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MOM');
  XLSX.writeFile(wb, `${fileBase}_${iso(new Date())}.xlsx`);
}
/* remark trail → readable multi-line cell text */
const remarksText = (list) => (list || []).map((p) =>
  `${fmtDDMMYY(p.date)}${p.status ? ` [${STATUS[p.status]?.label || p.status}]` : ''}${p.by ? ` by ${p.by}` : ''}${p.text ? ` — ${p.text}` : ''}`).join('\n');
/* shared look for the small table "Excel" buttons */
const XL_BTN = 'export-btn kc-lift inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 fs-10 font-bold';

/* group key for live-sheet rows — master rows group by their master point,
   everything else (custom rows, shifted carried tasks) by area text, so a
   carried point slots under an already-present Discussion Area */
const sheetGroupKey = (r) => r.masterId ? `m-${r.masterId}` : (r.area ? `a-${r.area.trim().toLowerCase()}` : `x-${r.id}`);
const taskRows = (m) => m.rows.filter((r) => r.flag === 'T');
const progress = (m) => { const t = taskRows(m); return t.length ? Math.round(t.filter((r) => r.status === 'completed').length / t.length * 100) : 100; };

/* Collect still-open Tasks across all selected branches
   (latest state per trackId — branch arrays are newest-first). */
function collectCarry(history, codes) {
  const seen = new Set(); const out = [];
  (codes || []).forEach((code) => (history[code] || []).forEach((m) => {
    m.rows.forEach((r) => {
      if (r.flag !== 'T' || !r.trackId || seen.has(r.trackId)) { if (r.trackId) seen.add(r.trackId); return; }
      seen.add(r.trackId);
      if (r.status !== 'completed') {
        out.push({
          ...r, resp: respArr(r.resp), id: uid(), carried: true, srcDate: m.date,
          prevRemarks: [...(r.prevRemarks || []), { date: m.date, text: r.remark || '', status: r.status, by: m.conductedBy }],
          remark: '',
        });
      }
    });
  }));
  return out;
}

/* ============================================================
   BRANCH ATTRIBUTION — a task / info row belongs to the branch(es)
   of its RESPONSIBLE people (looked up in the meeting's attendee
   list, where each employee carries their branch). Owners from two
   branches → the row counts in BOTH branches. Rows whose owners
   can't be resolved to a branch (guests, no responsibility) fall
   back to the meeting's own branch(es).
   ============================================================ */
const buildBranchNameToCode = (allBranches, meetings) => {
  const map = new Map();
  allBranches.forEach((b) => {
    if (b.name) map.set(String(b.name).toLowerCase(), b.code);
    if (b.code) map.set(String(b.code).toLowerCase(), b.code);   // legacy rows that stored the code
  });
  meetings.forEach((m) => (m.branches || []).forEach((b) => {
    if (b.name && !map.has(String(b.name).toLowerCase())) map.set(String(b.name).toLowerCase(), b.code);
  }));
  return map;
};
const makeRowBranchCodes = (nameToCode) => {
  const attCache = new Map();               // meeting id → attendee name → branch label
  return (r, m) => {
    let byName = attCache.get(m.id);
    if (!byName) {
      byName = new Map((m.attendees || []).map((a) => [String(a.name || '').toLowerCase(), a.branch]));
      attCache.set(m.id, byName);
    }
    const codes = new Set();
    respArr(r.resp).forEach((n) => {
      const bn = byName.get(String(n).toLowerCase());
      const code = bn ? nameToCode.get(String(bn).toLowerCase()) : null;
      if (code) codes.add(code);
    });
    if (!codes.size) (m.branches?.length ? m.branches.map((b) => b.code) : [m.branchCode]).forEach((c) => c && codes.add(c));
    return codes;
  };
};

/* ============================================================
   EXCEL EXPORT — same layout as the register sheet:
   • title band + table header in a colour the user picks at
     export time (defaults to the system brand)
   • Date / Location / Branch(es) block, Sr.No + Attendees,
     Action-Flag legend
   • column order: Discussion Area | Discussion points |
     Responsibility | Action flag | Due Date |
     Remarks - <past dates>… | Remarks - <this meeting> | Status
   • zebra body rows + colour-coded Status text
   ============================================================ */
/* mix a hex colour toward black (pct<0) or white (pct>0) → 'RRGGBB' */
const shadeHex = (hex, pct) => {
  const n = (hex || BRAND).replace('#', '');
  const t = pct < 0 ? 0 : 255, p = Math.abs(pct);
  return [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16);
    return Math.round(v + (t - v) * p).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
};

async function exportMeetingExcel(m, brandColor = '#000080') {
  const thin = { style: 'thin', color: { rgb: 'FFD3D8E6' } };
  const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
  const C = {
    brand: shadeHex(brandColor, 0),
    dark: shadeHex(brandColor, -0.25),
    soft: shadeHex(brandColor, 0.92),
    zebra: shadeHex(brandColor, 0.96),
    ink: '1F2937',
    label: shadeHex(brandColor, -0.15),
  };
  const ST_COLOR = { completed: '059669', in_progress: 'B45309', pending: '64748B', overdue: 'F87171' };
  const S = {
    title: { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { fgColor: { rgb: C.brand } }, border: BORDER },
    sub: { font: { sz: 10, color: { rgb: shadeHex(brandColor, 0.88) } }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { fgColor: { rgb: C.dark } }, border: BORDER },
    label: { font: { bold: true, sz: 10, color: { rgb: C.label } }, fill: { fgColor: { rgb: C.soft } }, border: BORDER, alignment: { vertical: 'center' } },
    value: { font: { sz: 10, color: { rgb: C.ink } }, border: BORDER, alignment: { vertical: 'center', wrapText: true } },
    head: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: C.brand } }, border: BORDER, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
  };
  const cell = (alt) => ({ font: { sz: 10, color: { rgb: C.ink } }, border: BORDER, alignment: { vertical: 'top', wrapText: true }, ...(alt ? { fill: { fgColor: { rgb: C.zebra } } } : {}) });
  const cellC = (alt, extraFont = {}) => ({ font: { sz: 10, color: { rgb: C.ink }, ...extraFont }, border: BORDER, alignment: { horizontal: 'center', vertical: 'top' }, ...(alt ? { fill: { fgColor: { rgb: C.zebra } } } : {}) });
  const txt = (v, s) => ({ v: v ?? '', t: 's', s });

  const branchNames = m.branches?.length ? m.branches.map((b) => b.name || b.code).join(' + ') : (m.branchName || '');
  const heads = (m.heads || []).map((h) => String(h).trim()).filter(Boolean);

  /* remark-history columns: one per unique past review date */
  const histDates = [...new Set(m.rows.flatMap((r) => (r.prevRemarks || []).map((p) => p.date)))].sort();
  const FIXED = 6; // Discussion Area … Due Date (incl. the head column)
  const totalCols = Math.max(FIXED + histDates.length + 2, 8); // + current remark + Status (info block needs ≥ 8)

  const aoa = []; const merges = [];
  const push = (row) => { aoa.push(row); return aoa.length - 1; };
  const pad = (row) => { while (row.length < totalCols) row.push(txt('', S.value)); return row; };

  /* Rows 0–1 — merged title + summary band */
  push(pad([txt('Minutes of Meeting', S.title)]));
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
  push(pad([txt(`${branchNames} · ${fmtDDMMYY(m.date)} · ${m.type || ''}`, S.sub)]));
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });

  /* Info block: labels A, values B · Attendees C:F (numbered names, one
     merged column) · legend G:H */
  const info = [
    ['Date:', fmtDDMMYY(m.date)], ['Location:', m.location || ''],
    ['Branches:', branchNames], ['Meeting Type:', m.type || ''],
    ['Conducted By:', m.conductedBy || ''],
    ['Meeting Head(s):', heads.join(', ')],
  ];
  const present = m.attendees.filter((a) => a.present);
  const blockRows = Math.max(info.length, present.length + 1, 3);
  for (let i = 0; i < blockRows; i++) {
    const row = [];
    row[0] = txt(info[i]?.[0] || '', info[i] ? S.label : S.value);
    row[1] = txt(info[i]?.[1] || '', S.value);
    const attStyle = i === 0 ? S.label : S.value;
    const attText = i === 0
      ? 'Attendees:'
      : present[i - 1]
        ? `${i}. ${present[i - 1].name}${present[i - 1].branch ? ` (${present[i - 1].branch})` : ''}${present[i - 1].source === 'manual' ? '  (Manually added)' : ''}`
        : '';
    row[2] = txt(attText, attStyle); row[3] = txt('', attStyle); row[4] = txt('', attStyle); row[5] = txt('', attStyle);
    if (i === 0) { row[6] = txt('Action Flag', S.label); row[7] = txt('', S.label); }
    else if (i === 1) { row[6] = txt('T', S.label); row[7] = txt('Task', S.value); }
    else if (i === 2) { row[6] = txt('I', S.label); row[7] = txt('Information', S.value); }
    else { row[6] = txt('', S.value); row[7] = txt('', S.value); }
    const rIdx = push(pad(row));
    merges.push({ s: { r: rIdx, c: 2 }, e: { r: rIdx, c: 5 } });                 // attendee column C:F
    if (i === 0) merges.push({ s: { r: rIdx, c: 6 }, e: { r: rIdx, c: 7 } });    // "Action Flag" G:H
  }

  push(pad([]));                                                                  // spacer

  /* Table header — requested column sequence, Status last */
  const head = ['Discussion Area', 'Discussion points', 'Responsibility', 'Task Assigned By (Head)', 'Action flag', 'Due Date',
    ...histDates.map((d) => `Remark/Observation/Action - ${fmtDDMMYY(d)}`), `Remark/Observation/Action - ${fmtDDMMYY(m.date)}`, 'Status'];
  const headRow = head.map((h) => txt(h, S.head));
  while (headRow.length < totalCols) headRow.push(txt('', S.head));
  push(headRow);

  /* Table body — carried rows first, then fresh; zebra shading. Consecutive
     rows of the same Discussion Area are grouped: the area cell is MERGED
     across its point-rows, exactly like the on-screen sheet, and the C/F
     marker moves to the point text. */
  const ordered = [...m.rows.filter((r) => r.carried), ...m.rows.filter((r) => !r.carried)];
  const areaGroups = groupConsecutive(ordered, (r) => (r.area || '').trim().toLowerCase());
  const bodyStart = aoa.length;
  let ri = 0;
  areaGroups.forEach((g) => {
    if (g.items.length > 1) merges.push({ s: { r: bodyStart + ri, c: 0 }, e: { r: bodyStart + ri + g.items.length - 1, c: 0 } });
    g.items.forEach((r) => {
      const alt = false;                       // zebra shading removed — all rows white
      const isT = r.flag === 'T';
      const od = isT && r.status !== 'completed' && r.due && new Date(r.due) < today0();
      const stKey = !isT ? null : od ? 'overdue' : r.status;
      const areaStyle = { ...cell(alt), alignment: { vertical: 'center', horizontal: 'center', wrapText: true } };
      const pointStyle = r.carried ? { ...cell(alt), font: { ...cell(alt).font, color: { rgb: '92400E' } } } : cell(alt);
      const row = [
        txt(r.area, areaStyle),
        txt((r.carried ? '(C/F)  ' : '') + (r.point || ''), pointStyle),
        txt(respArr(r.resp).join(', ') || (isT ? '' : '-'), cell(alt)),
        txt(r.assignedBy || '-', cellC(alt)),
        txt(r.flag, cellC(alt, { bold: true })),
        txt(isT ? fmtDDMMYY(r.due) : '-', cellC(alt)),
      ];
      histDates.forEach((d) => {
        const pr = (r.prevRemarks || []).find((p) => p.date === d);
        row.push(txt(pr ? pr.text : '', cell(alt)));
      });
      row.push(txt(r.remark || '', cell(alt)));
      row.push(txt(isT ? (od ? 'Overdue' : (STATUS[r.status]?.label || r.status)) : '-',
        stKey ? cellC(alt, { bold: true, color: { rgb: ST_COLOR[stKey] || ST_COLOR.pending } }) : cellC(alt)));
      push(row);
      ri++;
    });
  });

  const _xlsx = await import('xlsx-js-style');
  const XLSX = _xlsx.utils ? _xlsx : (_xlsx.default || _xlsx);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 26 }, { wch: 40 }, { wch: 24 }, { wch: 20 }, { wch: 9 }, { wch: 12 },
    ...histDates.map(() => ({ wch: 26 })), { wch: 28 }, { wch: 12 }];
  ws['!rows'] = [{ hpt: 26 }, { hpt: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MOM');
  const fileBase = (m.branches?.length ? m.branches.map((b) => b.name || b.code).join('_') : (m.branchName || 'Branch')).replace(/[^\w]+/g, '_');
  XLSX.writeFile(wb, `MOM_${fileBase}_${m.date}.xlsx`);
}

/* ============================================================
   SMALL UI PIECES
   ============================================================ */
const StatusBadge = React.memo(({ r }) => {
  if (r.flag !== 'T') return <span className="fs-10 text-gray-300">—</span>;
  const s = STATUS[effStatus(r)];
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: s.soft, color: s.color }}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />{s.label}</span>;
});
const FlagChip = React.memo(({ f, small }) => (
  <span className={`inline-flex items-center gap-1 rounded font-bold ${small ? 'px-1.5 py-0.5 fs-9' : 'px-2 py-0.5 fs-10'}`} style={{ background: FLAG[f].bg, color: FLAG[f].color }}>
    <span className="font-black">{f}</span>{!small && FLAG[f].label}
  </span>
));
const SourceBadge = React.memo(({ source }) => source === 'manual'
  ? <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }}><UserPlus size={9} /> Manually added</span>
  : <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: INK }}><User size={9} /> Employee</span>);
const CatDot = React.memo(({ color, title }) => <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color || '#94a3b8' }} title={title} />);
/* initials avatar removed — names are shown as plain text */
const Avatar = React.memo(() => null);
/* overlapping avatar strip (History table) — initials circles removed */
const AvatarStack = React.memo(({ names = [], max = 4 }) => (
  <span className="flex items-center">
    {names.length > max && <span className="ml-1 fs-9 font-bold text-gray-400">+{names.length - max}</span>}
  </span>
));
const Bar2 = React.memo(({ v }) => (
  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#eef0f3' }}>
    <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? '#059669' : v >= 40 ? '#d97706' : '#f87171', transition: 'width .3s' }} />
  </div>
));
/* T / I toggle used inside the sheet */
const FlagToggle = ({ value, onChange }) => (
  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
    {['T', 'I'].map((f) => (
      <button key={f} type="button" onClick={() => onChange(f)} title={FLAG[f].label}
        className="px-2.5 py-1 fs-11 font-black transition"
        style={value === f ? { background: f === 'T' ? '#d97706' : '#2563eb', color: '#fff' } : { color: '#9ca3af', background: '#fff' }}>
        {f}
      </button>
    ))}
  </div>
);
const SegStatus = ({ value, onChange }) => (
  <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
    {[['pending', 'Pending'], ['in_progress', 'WIP'], ['completed', 'Done']].map(([k, lbl]) => (
      <button key={k} type="button" onClick={() => onChange(k)} className="px-2 py-1 fs-10 font-semibold transition"
        style={value === k ? { background: STATUS[k].color, color: '#fff' } : { color: '#9ca3af', background: '#fff' }}>{lbl}</button>
    ))}
  </div>
);
/* generic dropdown shell — trigger render-prop + panel that closes on
   outside click. Children can be a function receiving close() so list
   items can dismiss the panel after acting. */
function Dropdown({ trigger, children, panelClass = '', panelStyle, hover = false }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef(null);
  const panelRef = useRef(null);
  const hoverTimer = useRef(null);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  /* hover mode — panel opens while the mouse is over the box and closes as
     soon as the pointer moves away (small delay bridges the trigger→panel gap) */
  const hoverProps = hover ? {
    onMouseEnter: () => { clearTimeout(hoverTimer.current); setOpen(true); },
    onMouseLeave: () => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setOpen(false), 150); },
  } : {};
  useEffect(() => {
    if (!open) return undefined;
    /* flip the panel to right-aligned when its left-anchored position would
       run past the viewport edge (and right-aligning actually fits) */
    const pw = panelRef.current?.offsetWidth || 0;
    const r = ref.current?.getBoundingClientRect();
    if (r && pw) setAlignRight(r.left + pw > window.innerWidth - 8 && r.right - pw >= 8);
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="relative" ref={ref} {...hoverProps}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div ref={panelRef} className={`absolute z-[60] mt-1 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden ${panelClass}`}
          style={{ ...(alignRight ? { right: 0 } : { left: 0 }), ...panelStyle }}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
/* previous remarks chips (the accumulating "Remarks - date" columns) */
const RemarkHistory = React.memo(({ list }) => !list?.length ? <span className="fs-10 text-gray-300">—</span> : (
  <div>
    {list.map((p, i) => {
      const st = STATUS[p.status];
      return (
        <div key={i} className="py-1" style={i > 0 ? { borderTop: '1px solid #e4e7f2' } : undefined}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="fs-10 font-bold" style={{ color: '#475569' }}>{fmtDDMMYY(p.date)}</span>
            {st && <span className="rounded-full px-1.5 py-0.5 fs-10 font-bold" style={{ background: st.soft, color: st.color }}>{st.label}</span>}
            {p.by && <span className="fs-10 text-gray-400">by {p.by}</span>}
          </div>
          {p.text
            ? <div className="fs-12 text-black mt-0.5 leading-snug" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{p.text}</div>
            : <div className="fs-10 text-gray-400 mt-0.5 italic">no remark noted</div>}
        </div>
      );
    })}
  </div>
));

/* dual-scrollbar wrapper — renders a thin phantom scrollbar ABOVE the real
   scroll container and keeps the two in lockstep, so wide tables can be
   scrolled left↔right from the top without going to the bottom edge first */
const DualScroll = ({ className = 'overflow-x-auto kc-scroll', style, children }) => {
  const topRef = useRef(null);
  const mainRef = useRef(null);
  useEffect(() => {
    const main = mainRef.current, top = topRef.current;
    if (!main || !top) return;
    const syncPhantomWidth = () => {
      const phantom = top.firstChild;
      if (phantom && main.scrollWidth > 0) phantom.style.width = `${main.scrollWidth}px`;
    };
    syncPhantomWidth();
    const timer = setTimeout(syncPhantomWidth, 100);
    const onMain = () => { top.scrollLeft = main.scrollLeft; };
    const onTop = () => { main.scrollLeft = top.scrollLeft; };
    main.addEventListener('scroll', onMain);
    top.addEventListener('scroll', onTop);
    window.addEventListener('resize', syncPhantomWidth);
    return () => {
      clearTimeout(timer);
      main.removeEventListener('scroll', onMain);
      top.removeEventListener('scroll', onTop);
      window.removeEventListener('resize', syncPhantomWidth);
    };
  });
  return (
    <>
      <div ref={topRef} className="overflow-x-auto kc-scroll" style={{ overflowY: 'hidden' }}>
        <div style={{ height: 1 }} />
      </div>
      <div ref={mainRef} className={className} style={style}>{children}</div>
    </>
  );
};

/* per-row head picker — the meeting head who assigns the task is also the
   one responsible for it, so ONE choice covers both (headResp is kept
   mirrored for the saved data). Values already saved on the row stay
   selectable even if the head list changed since. */
const HeadCell = ({ row, heads = [], onChange }) => {
  const opts = [...new Set([...heads, row.assignedBy].filter(Boolean))];
  return (
    <select value={row.assignedBy || ''}
      onChange={(e) => onChange({ assignedBy: e.target.value, headResp: e.target.value })}
      title={row.assignedBy || 'Which meeting head assigned (and is responsible for) this task'}
      className="w-full fs-11 text-gray-700 outline-none px-1 py-1 rounded cursor-pointer"
      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      <option value="">— Select head —</option>
      {opts.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
};

/* ============================================================
   RESPONSIBILITY PICKER — multi-select of present attendees.
   Renders its dropdown with position:fixed so it is never
   clipped by the sheet's horizontal-scroll container.
   ============================================================ */
const RespPicker = ({ value = [], options = [], onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const openIt = () => {
    if (disabled || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const up = r.bottom + 264 > window.innerHeight;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 248)),
      top: up ? r.top - 6 : r.bottom + 4,
      up,
      width: Math.max(r.width, 232),
    });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const closeAll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', closeAll, true);
    window.addEventListener('resize', closeAll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', closeAll, true);
      window.removeEventListener('resize', closeAll);
    };
  }, [open]);
  const toggle = (n) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  const absent = value.filter((v) => !options.includes(v));
  return (
    <>
      <button type="button" ref={btnRef} onClick={() => (open ? setOpen(false) : openIt())}
        className="w-full flex items-center justify-between gap-1 rounded px-1.5 py-1 fs-11 text-left transition hover:bg-[#f6f8fc]"
        style={{ minHeight: 30 }} title="Assign one or more attendees">
        {value.length === 0 ? (
          <span className="text-gray-400">— Unassigned —</span>
        ) : (
          <span className="flex items-center gap-1 flex-wrap min-w-0">
            {value.slice(0, 2).map((n) => (
              <span key={n} className="inline-flex items-center justify-center rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: BRAND_SOFT, color: INK }}>
                <span className="truncate" style={{ maxWidth: '5.5rem' }}>{n.split(' ')[0]}</span>
              </span>
            ))}
            {value.length > 2 && <span className="fs-10 font-bold" style={{ color: INK }}>+{value.length - 2}</span>}
          </span>
        )}
        <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && pos && (
        <div ref={popRef} className="fixed z-[80] rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
          style={{ left: pos.left, top: pos.top, width: pos.width, ...(pos.up ? { transform: 'translateY(-100%)' } : {}) }}>
          <div className="px-2.5 py-1.5 fs-9 font-bold uppercase tracking-wide text-black border-b border-gray-100 flex items-center justify-between">
            <span>Assign responsibility</span>
            <span className="rounded-full px-1.5 py-0.5" style={{ background: BRAND_SOFT, color: INK }}>{value.length}</span>
          </div>
          <div className="max-h-52 overflow-y-auto kc-scroll py-1">
            {options.length === 0 && absent.length === 0 && (
              <div className="px-3 py-2 fs-10 text-gray-400">No attendees marked present yet.</div>
            )}
            {options.map((n) => {
              const on = value.includes(n);
              return (
                <button key={n} type="button" onClick={() => toggle(n)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-50">
                  <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                    {on && <Check size={11} color="#fff" />}
                  </span>
                  <Avatar name={n} size={18} />
                  <span className="fs-11 text-gray-700 flex-1 truncate">{n}</span>
                </button>
              );
            })}
            {absent.map((n) => (
              <button key={n} type="button" onClick={() => toggle(n)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-50">
                <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={{ background: '#b45309', borderColor: '#b45309' }}>
                  <Check size={11} color="#fff" />
                </span>
                <Avatar name={n} size={18} />
                <span className="fs-11 text-gray-500 flex-1 truncate">{n}</span>
                <span className="fs-9 font-bold flex-shrink-0" style={{ color: '#b45309' }}>absent</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

const FontScale = React.memo(() => <style>{`@keyframes livedot{0%,100%{opacity:1}50%{opacity:.35}} @keyframes pop{0%{transform:scale(.4)}70%{transform:scale(1.2)}100%{transform:scale(1)}} .kc-pop{animation:pop .18s ease-out} .kc-lift{transition:transform .15s ease,box-shadow .15s ease} .kc-lift:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(35,37,95,.35)} .kc-input{background:#f7f8fc;border:1.5px solid #e6e9f0;border-radius:10px;transition:border-color .15s,box-shadow .15s,background .15s} .kc-input:focus,.kc-input:focus-within{background:#fff;border-color:#2f3192;box-shadow:0 0 0 3px rgba(47,49,146,.10);outline:none} .kc-input::placeholder,.kc-input input::placeholder{font-size:10px;font-weight:500;color:#9ca3af} .kc-grid{background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 1px,transparent 1px 13px),repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 1px,transparent 1px 13px)} .kc-scroll::-webkit-scrollbar{height:6px;width:6px} .kc-scroll::-webkit-scrollbar-thumb{background:#d5d9e6;border-radius:8px} .kc-scroll::-webkit-scrollbar-thumb:hover{background:#bfc5d8} .kc-scroll::-webkit-scrollbar-track{background:transparent} .fs-9{font-size:9px;line-height:1.3} .fs-10{font-size:10px;line-height:1.35} .fs-11{font-size:11px;line-height:1.4} .fs-12{font-size:12px;line-height:1.45} .fs-13{font-size:13px;line-height:1.45} .mom-sheet td,.mom-sheet th{border:1px solid #cbd5e1} .mom-sheet thead th{text-align:center;vertical-align:middle} .mom-sheet input,.mom-sheet select,.mom-sheet textarea{background:transparent;border-radius:6px;transition:box-shadow .12s,background .12s} .mom-sheet input:hover,.mom-sheet select:hover,.mom-sheet textarea:hover{background:#f6f8fc} .mom-sheet input:focus,.mom-sheet select:focus,.mom-sheet textarea:focus{background:#fff;box-shadow:inset 0 0 0 1.5px ${BRAND}55} .mom-sheet tbody tr:nth-child(even){background:#fbfcfe}`}</style>);

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function MOMTracking() {
  /* who is logged in (used for employees API + "Conducted by") */
  const me = useMemo(() => { try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; } }, []);
  const authHeaders = useMemo(() => (me?.user_id ? { 'user-id': me.user_id, 'user-role': me.role || '' } : {}), [me]);
  /* Excel export permission — Master Admin always, others via can_export on the users table */
  const canExport = me?.role === 'master_admin' || me?.can_export === true;
  const role = me?.role || 'employee';
  const isMaster = role === 'master_admin';

  const [master, setMaster] = useState(DEFAULT_MASTER);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [meetingTypes, setMeetingTypes] = useState(DEFAULT_MEETING_TYPES);
  const [history, setHistory] = useState({});
  // Non-master users (branch admin / employee) only get the personal report view.
  const [view, setView] = useState(isMaster ? 'new' : 'mine');   // new | history | reports | mine
  // flat, de-duplicated meeting list (history keys the same meeting under every branch)
  const allMeetings = useMemo(() => {
    const seen = new Map();
    Object.values(history).forEach((list) => list.forEach((m) => { if (!seen.has(m.id)) seen.set(m.id, m); }));
    return [...seen.values()];
  }, [history]);
  // whose report the "mine" view shows: self by default; master admin can pick any employee
  const selfPerson = useMemo(() => ({ name: me?.name, user_id: me?.user_id, branch: me?.branch, branch_name: me?.branch_name }), [me]);
  const [pickedEmp, setPickedEmp] = useState(null);
  const reportPerson = (isMaster && pickedEmp) ? pickedEmp : selfPerson;

  // Deep-link support: the ERP Sitemap opens a specific view or the masters
  // box via router state — navigate('/mom-tracking', { state: { openView:
  // 'reports' } }) or { state: { openMasters: true } }. The state is consumed
  // immediately so a refresh doesn't re-apply it.
  const routerLocation = useLocation();
  const routerNavigate = useNavigate();
  useEffect(() => {
    const s = routerLocation.state;
    if (!s) return;
    if (s.openView && isMaster) setView(s.openView);
    if (s.openMasters && isMaster) setMasterOpen(true);
    if (s.openView || s.openMasters) {
      routerNavigate(routerLocation.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);
  const [masterOpen, setMasterOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);  // async onYes running → spinner on the Yes button
  const [viewMtg, setViewMtg] = useState(null);
  const [histBranch, setHistBranch] = useState(null);   // branch pre-selected when Reports jumps to History
  const [histSource, setHistSource] = useState('loading'); // loading | api | error
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);      // sync guard — a double-click can fire before the disabled state renders
  const [showAllAtt, setShowAllAtt] = useState(false);   // attendee strip: collapsed by default
  const topScrollRef = useRef(null);      // synced horizontal scrollbar shown ABOVE the sheet
  const mainScrollRef = useRef(null);

  /* ---- employees from backend ---- */
  const [employees, setEmployees] = useState([]);
  const [empSource, setEmpSource] = useState('loading'); // loading | api | error
  useEffect(() => {
    let alive = true;
    // Only master admin can (and needs to) list employees — the /users/employees
    // endpoint 403s for branch admin / employee, so skip it entirely for them.
    if (!isMaster || !me?.user_id || !API_BASE_URL) { setEmpSource('error'); return; }
    axios.get(`${API_BASE_URL}/users/employees`, { headers: { 'user-id': me.user_id } })
      .then((res) => {
        if (!alive) return;
        if (res.data?.success && Array.isArray(res.data.employees)) {
          setEmployees(res.data.employees.filter((e) => !e.is_blocked));
          setEmpSource('api');
        } else setEmpSource('error');
      })
      .catch(() => alive && setEmpSource('error'));
    return () => { alive = false; };
  }, [me]);

  /* a meeting is filed under EVERY branch it covers */
  const fanOut = (h, mt) => {
    const codes = mt.branches?.length ? mt.branches.map((b) => b.code) : [mt.branchCode];
    const next = { ...h };
    codes.forEach((c) => { next[c] = [mt, ...(next[c] || [])]; });
    return next;
  };

  /* ---- MOM data from the backend ---- */
  useEffect(() => {
    let alive = true;
    const loadFailed = () => { if (!alive) return; setHistory({}); setHistSource('error'); };
    if (!API_BASE_URL) { loadFailed(); return; }
    Promise.all([
      axios.get(`${MOM_API}/bootstrap`, { headers: authHeaders }),
      axios.get(`${MOM_API}/meetings`, { headers: authHeaders }),
    ]).then(([b, m]) => {
      if (!alive) return;
      if (b.data?.success) {
        const pts = (b.data.masterPoints || []).map((p) => ({ id: String(p.id), title: p.title, category: p.category }));
        if (pts.length) setMaster(pts);
        const cats = {};
        (b.data.categories || []).forEach((c) => { cats[c.name] = c.color; });
        if (Object.keys(cats).length) setCategories(cats);
        const types = (b.data.meetingTypes || []).map((t) => ({ id: t.id, name: t.name }));
        if (types.length) setMeetingTypes(types);
      }
      if (m.data?.success) {
        const map = {};
        (m.data.meetings || []).forEach((mt) => {
          const codes = mt.branches?.length ? mt.branches.map((x) => x.code) : [mt.branchCode];
          codes.forEach((c) => { (map[c] = map[c] || []).push(mt); });
        });
        setHistory(map); setHistSource('api');
      } else loadFailed();
    }).catch(loadFailed);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* branch options: real branches from the employees API */
  const branchOptions = useMemo(() => {
    if (empSource === 'api' && employees.length) {
      const seen = new Map();
      employees.forEach((e) => { if (e.branch && !seen.has(e.branch)) seen.set(e.branch, { code: e.branch, name: e.branch_name || e.branch, region: '' }); });
      return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [];
  }, [empSource, employees]);

  /* ---- meeting setup (merged into the one-tab sheet screen) ---- */
  const [branches, setBranches] = useState([]);       // MULTI-select — one or more branches per meeting
  const [manualBranches, setManualBranches] = useState([]);  // branches typed in by the admin
  const [manualBranch, setManualBranch] = useState('');
  const [mDate, setMDate] = useState(iso(new Date()));  // mandatory — defaults to today
  const [mLocation, setMLocation] = useState('');
  const [mType, setMType] = useState('');
  const [attendees, setAttendees] = useState([]);
  const [manualName, setManualName] = useState('');
  const [picked, setPicked] = useState(new Set());    // which master points to discuss
  /* meeting heads — the logged-in conductor is the first head by default;
     more heads can be picked from the attendees or typed in manually */
  const [heads, setHeads] = useState(me?.name ? [me.name] : []);
  const [manualHead, setManualHead] = useState('');
  const toggleHead = (n) => {
    /* the logged-in conductor is always a meeting head — can't be removed */
    if (n === me?.name) return ping('You conduct this meeting — you always stay a meeting head', 'err');
    setHeads((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]);
  };
  const removeHead = (n) => {
    if (n === me?.name) return;
    setHeads((p) => p.filter((x) => x !== n));
  };
  const addManualHead = () => {
    const n = manualHead.trim();
    if (!n) return;
    if (heads.some((h) => h.toLowerCase() === n.toLowerCase())) return ping('Already a meeting head', 'err');
    setHeads((p) => [...p, n]); setManualHead('');
  };
  /* head-picker options: the logged-in user + every listed attendee */
  const headOptions = useMemo(() => {
    const seen = new Set(); const out = [];
    [me?.name, ...attendees.map((a) => a.name)].forEach((n) => {
      if (!n || seen.has(n.toLowerCase())) return;
      seen.add(n.toLowerCase()); out.push(n);
    });
    return out;
  }, [me, attendees]);

  const branchLabel = useMemo(() => branches.map((b) => b.name).join(' + '), [branches]);

  /* meeting-type combobox — free text + a dropdown of every type used in
     saved meetings (most recently used first), defaults appended at the end */
  const [typeDdOpen, setTypeDdOpen] = useState(false);
  const typeDdRef = useRef(null);
  useEffect(() => {
    if (!typeDdOpen) return;
    const close = (e) => { if (typeDdRef.current && !typeDdRef.current.contains(e.target)) setTypeDdOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [typeDdOpen]);
  const usedMeetingTypes = useMemo(() => {
    const seen = new Map();                       // lowercase -> { name, date of last use }
    Object.values(history).forEach((ms) => ms.forEach((m) => {
      const t = (m.type || '').trim();
      if (!t) return;
      const k = t.toLowerCase();
      const prev = seen.get(k);
      if (!prev || (m.date || '') > prev.date) seen.set(k, { name: t, date: m.date || '' });
    }));
    return [...seen.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((x) => x.name);
  }, [history]);

  /* a master row on the sheet counts as "filled" once anything is typed
     in it — unselecting its point would drop that data with the row */
  const rowFilled = (r) => !!(r && ((r.point || '').trim() || (r.remark || '').trim() || respArr(r.resp).length));
  const togglePick = (p) => {
    const on = picked.has(p.id);
    if (on && rows.some((r) => r.masterId === p.id && rowFilled(r))) {
      setConfirm({
        title: 'Unselect this discussion point?',
        meta: p.title,
        note: 'This point already has data filled in on the meeting sheet. Unselecting it removes its row — everything typed in it will be lost. Tick it again before opening the sheet to get the data back.',
        yesLabel: 'Yes, unselect',
        onYes: () => { setPicked((s) => { const n = new Set(s); n.delete(p.id); return n; }); setConfirm(null); },
      });
      return;
    }
    setPicked((s) => { const n = new Set(s); if (on) n.delete(p.id); else n.add(p.id); return n; });
  };
  const pickAll = () => setPicked(new Set(master.map((p) => p.id)));
  const pickNone = () => {
    const filled = rows.filter((r) => r.masterId && picked.has(r.masterId) && rowFilled(r)).length;
    if (filled) {
      setConfirm({
        title: 'Clear all selected points?',
        meta: `${filled} point${filled > 1 ? 's' : ''} already filled on the meeting sheet`,
        note: 'Clearing the selection removes their rows from the sheet — everything typed in them will be lost.',
        yesLabel: 'Yes, clear all',
        onYes: () => { setPicked(new Set()); setConfirm(null); },
      });
      return;
    }
    setPicked(new Set());
  };

  /* ---- meeting sheet (Step 2) ---- */
  const [rows, setRows] = useState([]);               // current discussion rows
  const [carry, setCarry] = useState([]);             // pending tasks from previous meetings
  const [newCat] = useState('Other');
  const rowsRef = useRef(rows);                       // fresh rows inside rebuildCarry
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  /* ---- shift a previous-meeting task into the current discussion table
     (via the "Discuss" checkbox on its row) ---- */
  /* masterId is cleared so the points↔rows sync treats the moved task as a
     custom row and never drops it; `carried` stays true so the C/F badge,
     remark history and Excel keep working */
  const moveCarryToRows = (id) => {
    const c = carry.find((x) => x.id === id);
    if (!c) return;
    setCarry((p) => p.filter((x) => x.id !== id));
    setRows((p) => {
      /* if the same Discussion Area is already on the sheet, the carried
         point slots in UNDER it (adopting its master link so the group
         survives the points↔rows sync); otherwise it lands at the end */
      const areaKey = (c.area || '').trim().toLowerCase();
      let at = -1;
      for (let i = p.length - 1; i >= 0; i--) {
        if ((p[i].area || '').trim().toLowerCase() === areaKey) { at = i; break; }
      }
      if (at < 0) return [...p, { ...c, masterId: null }];
      const moved = { ...c, masterId: p[at].masterId || null };
      return [...p.slice(0, at + 1), moved, ...p.slice(at + 1)];
    });
    ping(`"${c.area}" moved into the current-meeting discussion`);
  };
  const returnRowToCarry = (id) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    setRows((p) => p.filter((x) => x.id !== id));
    setCarry((p) => [...p, r]);
    ping('Task moved back to the previous-meeting pending list');
  };

  const ping = (msg, type = 'ok') => (type === 'err' ? toast.error(msg) : toast.success(msg));
  const catColor = (n) => categories[n] || '#94a3b8';

  /* ---------- draft persistence (survives refresh / power cut) ----------
     The whole in-progress wizard — setup fields, branches, attendees,
     picked points, sheet rows and carried-task edits — is mirrored into
     localStorage while the user works, restored on the next visit, and
     cleared when the minutes are saved (resetWizard). */
  const DRAFT_KEY = `mom_draft_${me?.user_id || 'local'}`;
  const draftReady = useRef(false);          // don't overwrite the stored draft before it's been read
  useEffect(() => {
    if (!isMaster) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const fresh = d && (!d.savedAt || Date.now() - d.savedAt < 7 * 86400000);   // drafts expire after 7 days
        if (fresh && (d.branches?.length || d.rows?.length || d.mLocation || d.mType)) {
          setBranches(d.branches || []);
          setManualBranches(d.manualBranches || []);
          if (d.mDate) setMDate(d.mDate);
          setMLocation(d.mLocation || '');
          setMType(d.mType || '');
          setAttendees(d.attendees || []);
          setPicked(new Set(d.picked || []));
          if (d.heads?.length) setHeads(d.heads);
          setRows(d.rows || []);
          setCarry(d.carry || []);
          ping('Restored your unsaved meeting draft');
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } }
    draftReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isMaster || !draftReady.current) return undefined;
    const t = setTimeout(() => {                       // small debounce — don't write on every keystroke
      try {
        const hasData = branches.length || rows.length || carry.length || attendees.length
          || picked.size || mLocation.trim() || mType.trim();
        if (!hasData) { localStorage.removeItem(DRAFT_KEY); return; }
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          branches, manualBranches, mDate, mLocation, mType, heads,
          attendees, picked: [...picked], rows, carry, savedAt: Date.now(),
        }));
      } catch { /* storage full / unavailable — draft simply not kept */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaster, branches, manualBranches, mDate, mLocation, mType, heads, attendees, picked, rows, carry]);

  /* header pills — latest state per tracked task, meetings counted once
     even when they cover several branches */
  const stats = useMemo(() => {
    const uniq = new Map();
    Object.values(history).forEach((ms) => ms.forEach((m) => uniq.set(m.id, m)));
    let open = 0, overdue = 0;
    const seen = new Set();
    [...uniq.values()].sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach((m) => m.rows.forEach((r) => {
      if (r.flag !== 'T' || seen.has(r.trackId)) return;
      seen.add(r.trackId);
      if (r.status !== 'completed') { open++; if (isOverdue(r)) overdue++; }
    }));
    return { meetings: uniq.size, open, overdue };
  }, [history]);

  /* branch list for the History dropdown in the tab row — real branches plus
     history-only (manually added) ones that still have meetings */
  const histAllBranches = useMemo(() => {
    const map = new Map(branchOptions.map((b) => [b.code, { ...b }]));
    Object.keys(history).forEach((code) => {
      if (map.has(code) || !(history[code] || []).length) return;
      const m = history[code][0];
      map.set(code, { code, name: m?.branches?.find((x) => x.code === code)?.name || m?.branchName || code, manual: true });
    });
    return [...map.values()];
  }, [branchOptions, history]);

  /* employees belonging to one branch */
  const branchEmployees = (b) => {
    if (!b) return [];
    if (b.manual) return [];   // manually added branches have no employees on file
    if (empSource === 'api') return employees.filter((e) => e.branch === b.code || e.branch_name === b.name).map((e) => ({ name: e.name, user_id: e.user_id }));
    return [];
  };

  const allBranchOptions = useMemo(() => {
    const seen = new Set(branchOptions.map((b) => b.code));
    return [...branchOptions, ...manualBranches.filter((b) => !seen.has(b.code))];
  }, [branchOptions, manualBranches]);

  /* what will carry forward from the selected branches */
  const carryPreview = useMemo(() => (branches.length ? collectCarry(history, branches.map((b) => b.code)).length : 0), [branches, history]);
  /* open tasks per branch — shown inside the branch dropdown */
  const branchCarryCounts = useMemo(() => {
    const out = {};
    Object.keys(history).forEach((code) => { out[code] = collectCarry(history, [code]).length; });
    return out;
  }, [history]);
  const lastAcross = useMemo(() => {
    const ds = branches.map((b) => (history[b.code] || [])[0]?.date).filter(Boolean).sort();
    return ds[ds.length - 1];
  }, [branches, history]);

  /* rebuild the auto-loaded employee attendees whenever the branch
     selection changes; manual and explicitly picked people are kept */
  const syncAttendees = (bs) => setAttendees((prev) => {
    const kept = prev.filter((a) => a.source === 'manual' || a.extra);
    const prevEmp = new Map(prev.filter((a) => a.source === 'employee' && !a.extra).map((a) => [a.name.toLowerCase(), a]));
    const seen = new Set(kept.map((a) => a.name.toLowerCase()));
    const auto = [];
    bs.forEach((b) => branchEmployees(b).forEach((e) => {
      const k = e.name.toLowerCase();
      if (seen.has(k)) return; seen.add(k);
      const old = prevEmp.get(k);
      auto.push(old ? { ...old, branch: b.name } : { id: uid('a'), name: e.name, user_id: e.user_id, source: 'employee', present: true, branch: b.name });
    }));
    return [...auto, ...kept];
  });

  /* ---------- Step-1 actions ---------- */
  /* rebuild the carry-forward list for a new branch selection, KEEPING any
     edits (remark / status / due / owners) already made to tasks still carried */
  const rebuildCarry = (bs) => setCarry((prev) => {
    const prevBy = new Map(prev.map((c) => [c.trackId, c]));
    /* tasks already dragged onto the current-meeting sheet stay there —
       don't resurrect them in the carry list */
    const onSheet = new Set(rowsRef.current.filter((r) => r.carried).map((r) => r.trackId));
    return collectCarry(history, bs.map((b) => b.code))
      .filter((c) => !onSheet.has(c.trackId))
      .map((c) => prevBy.get(c.trackId) || c);
  });
  /* apply a branch-selection change WITHOUT losing the meeting sheet:
     discussion rows survive untouched, attendees & carried tasks re-sync */
  const applyBranches = (next) => { setBranches(next); syncAttendees(next); rebuildCarry(next); };

  /* what gets affected if branch b is unselected — drives the warning shown
     when the branch's employees already have work on the running sheet */
  const branchRemovalImpact = (b, next) => {
    const stay = new Set(attendees.filter((a) => a.source === 'manual' || a.extra).map((a) => a.name.toLowerCase()));
    next.forEach((x) => branchEmployees(x).forEach((e) => stay.add(e.name.toLowerCase())));
    const leaving = new Set(branchEmployees(b).map((e) => e.name.toLowerCase()).filter((n) => !stay.has(n)));
    const hasLeaving = (r) => respArr(r.resp).some((n) => leaving.has(n.toLowerCase()));
    const assigned = rows.filter(hasLeaving).length + carry.filter(hasLeaving).length;
    const remainIds = new Set(collectCarry(history, next.map((x) => x.code)).map((c) => c.trackId));
    const freshBy = new Map(collectCarry(history, [b.code]).map((c) => [c.trackId, c]));
    const dropped = carry.filter((c) => !remainIds.has(c.trackId));
    const edited = dropped.filter((c) => {
      const f = freshBy.get(c.trackId);
      return (c.remark || '').trim() || (f && (c.status !== f.status || c.due !== f.due));
    }).length;
    return { assigned, dropped: dropped.length, edited };
  };
  const confirmBranchRemoval = (b, imp, onYes) => {
    const bits = [];
    if (imp.assigned) bits.push(`${imp.assigned} row(s) on the sheet are assigned to employees of this branch — the rows and their data stay, but those people are removed from the attendee list (they'll show as absent)`);
    if (imp.dropped) bits.push(`${imp.dropped} carried task(s) from this branch will be removed from the sheet${imp.edited ? ` — ${imp.edited} of them already have this meeting's updates typed in, and those updates will be lost` : ''}`);
    setConfirm({
      title: `Unselect ${b.name}?`,
      meta: 'This branch is already part of the running meeting',
      note: `${bits.join('. ')}.`,
      yesLabel: 'Yes, unselect branch',
      onYes: () => { onYes(); setConfirm(null); },
    });
  };

  const toggleBranch = (b) => {
    const on = branches.some((x) => x.code === b.code);
    const next = on ? branches.filter((x) => x.code !== b.code) : [...branches, b];
    if (on) {
      const imp = branchRemovalImpact(b, next);
      if (imp.assigned || imp.dropped) {
        confirmBranchRemoval(b, imp, () => { applyBranches(next); ping(`${b.name} removed from the meeting`); });
        return;
      }
    }
    applyBranches(next);
  };
  const addManualBranch = () => {
    const n = manualBranch.trim();
    if (!n) return;
    if (allBranchOptions.some((b) => b.name.toLowerCase() === n.toLowerCase())) return ping('A branch with this name already exists', 'err');
    const b = { code: `MB-${Date.now().toString(36)}`, name: n, region: 'Manual', manual: true };
    setManualBranches((p) => [...p, b]);
    applyBranches([...branches, b]);
    setManualBranch('');
    ping('Branch added — pick its attendees from employees or add them manually');
  };
  /* deleting a manual branch only removes it from the picker —
     saved minutes keep their own copy of the branch, so history is safe */
  const deleteManualBranch = (b) => {
    const selected = branches.some((x) => x.code === b.code);
    const next = branches.filter((x) => x.code !== b.code);
    const doDelete = () => {
      setManualBranches((p) => p.filter((x) => x.code !== b.code));
      if (selected) applyBranches(next);
      ping('Manual branch removed');
    };
    if (selected) {
      const imp = branchRemovalImpact(b, next);
      if (imp.assigned || imp.dropped) { confirmBranchRemoval(b, imp, doDelete); return; }
    }
    doDelete();
  };
  const addManual = () => {
    const n = manualName.trim();
    if (!n) return;
    if (attendees.some((a) => a.name.toLowerCase() === n.toLowerCase())) return ping('Attendee already in the list', 'err');
    setAttendees((p) => [...p, { id: uid('a'), name: n, source: 'manual', present: true }]);
    setManualName(''); ping('Attendee added manually');
  };
  const togglePresent = (id) => setAttendees((p) => p.map((a) => a.id === id ? { ...a, present: !a.present } : a));
  const removeAttendee = (id) => setAttendees((p) => p.filter((a) => a.id !== id));

  /* one-tab mode: ticking a master point adds its row to the sheet
     instantly, unticking removes it (togglePick / pickNone warn first when
     the row is filled). Rows already typed against a still-ticked point are
     kept untouched; custom rows always survive. Skips the very first run so
     a restored draft's rows aren't wiped before its picked-set lands. */
  const rowSyncReady = useRef(false);
  useEffect(() => {
    if (!rowSyncReady.current) { rowSyncReady.current = true; return; }
    setRows((prev) => {
      /* one Discussion Area can hold SEVERAL point-rows — keep every row of
         a still-ticked master (in sheet order), not just the first one.
         Rows whose masterId is NOT in the current master list (e.g. a draft
         restored before the API master list arrives) are NEVER dropped —
         they ride along as custom rows and re-attach once their master
         point is known again. */
      const masterIds = new Set(master.map((p) => String(p.id)));
      const byMaster = new Map();                       // masterId -> [rows]
      prev.forEach((r) => {
        if (!r.masterId || !masterIds.has(String(r.masterId))) return;
        const k = String(r.masterId);
        if (!byMaster.has(k)) byMaster.set(k, []);
        byMaster.get(k).push(r);
      });
      const custom = prev.filter((r) => !r.masterId || !masterIds.has(String(r.masterId)));
      const fromMaster = master.filter((p) => picked.has(p.id)).flatMap((p) => byMaster.get(String(p.id)) || [{
        id: uid(), trackId: uid('t'), masterId: p.id, area: p.title, category: p.category,
        point: '', resp: [], due: '', flag: 'I', status: 'pending', remark: '',
        originDate: mDate, prevRemarks: [],
      }]);
      return [...fromMaster, ...custom];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, master]);

  /* carried tasks follow the branch selection live; when the meeting
     history arrives after branches were already chosen (e.g. a restored
     draft), rebuild the carry list — edits are kept per trackId */
  useEffect(() => {
    if (branches.length) rebuildCarry(branches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const resetWizard = () => {
    setBranches([]); setAttendees([]); setManualName(''); setPicked(new Set()); setShowAllAtt(false);
    setManualBranch('');
    setHeads(me?.name ? [me.name] : []); setManualHead('');
    setMDate(iso(new Date())); setMLocation(''); setMType('');
    setRows([]); setCarry([]);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
  };
  /* the top-bar Reset button — warns before wiping the whole wizard */
  const askReset = () => {
    const hasData = branches.length || rows.length || carry.length || attendees.length
      || picked.size || mLocation.trim() || mType.trim();
    if (!hasData) { resetWizard(); return; }
    setConfirm({
      title: 'Reset this meeting?',
      meta: branchLabel ? `${branchLabel} · ${fmt(mDate)}` : 'Unsaved meeting draft',
      note: 'Everything will be cleared — branches, attendees, selected points and all data typed on the meeting sheet. The auto-saved draft is removed too. This cannot be undone.',
      yesLabel: 'Yes, reset all',
      onYes: () => { resetWizard(); setConfirm(null); ping('Meeting cleared — start fresh'); },
    });
  };

  /* ---------- Step-2 (sheet) actions ---------- */
  const presentNames = useMemo(() => attendees.filter((a) => a.present).map((a) => a.name), [attendees]);
  /* Responsibility options — present attendees EXCLUDING the meeting heads
     (heads assign & supervise; they aren't task owners) */
  const respOptions = useMemo(() => presentNames.filter((n) => !heads.includes(n)), [presentNames, heads]);
  const ATT_PREVIEW = 6;                                   // chips shown before "+N more"
  const attPreview = showAllAtt ? attendees : attendees.slice(0, ATT_PREVIEW);
  const attHidden = Math.max(0, attendees.length - ATT_PREVIEW);
  const updRow = (id, patch) => setRows((p) => p.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    /* I (Information) is for EVERYONE — no owners, no due date, no status.
       T (Task) is user-wise — picking any owner flips the row to T
       automatically, and switching to I clears the owners again. */
    if (patch.resp !== undefined && respArr(patch.resp).length && next.flag !== 'T') next.flag = 'T';
    if (next.flag === 'T' && r.flag !== 'T' && !next.due) next.due = iso(addDays(new Date(mDate || iso(new Date())), 7));
    if (patch.flag === 'T' && !next.due) next.due = iso(addDays(new Date(mDate || iso(new Date())), 7));
    if (patch.flag === 'I') { next.due = ''; next.status = 'pending'; next.resp = []; }
    return next;
  }));
  /* removing the LAST row of a master point also unticks the point —
     otherwise the live points↔rows sync would put the row straight back.
     When the area still has other point-rows, only this row goes. */
  const delRow = (id) => {
    const r = rows.find((x) => x.id === id);
    if (r?.masterId && rows.filter((x) => x.masterId === r.masterId).length <= 1) {
      setPicked((s) => { const n = new Set(s); n.delete(r.masterId); return n; });
    }
    setRows((p) => p.filter((x) => x.id !== id));
  };
  /* one Discussion Area → many Discussion Points: adds a fresh point-row
     right below, under the same area, with its own owners, due date,
     status and remark — reports count every point separately */
  const addPointRow = (rowId) => {
    setRows((prev) => {
      const i = prev.findIndex((x) => x.id === rowId);
      if (i < 0) return prev;
      const src = prev[i];
      const nr = {
        id: uid(), trackId: uid('t'), masterId: src.masterId || null,
        area: src.area, category: src.category, point: '', resp: [], due: '',
        flag: 'I', status: 'pending', remark: '', carried: false,
        originDate: mDate, prevRemarks: [],
      };
      return [...prev.slice(0, i + 1), nr, ...prev.slice(i + 1)];
    });
  };
  const askDelRow = (r) => {
    setConfirm({
      title: 'Remove this row?',
      meta: r.area,
      note: r.carried
        ? 'This carried task is removed from this meeting\'s sheet only — it stays open in history and will carry forward again next meeting. Use the ↱ arrow instead to send it back to the pending list above.'
        : ((r.point?.trim() || r.remark?.trim()) ? 'Anything typed in it will be lost.' : ''),
      yesLabel: 'Yes, remove',
      onYes: () => { delRow(r.id); setConfirm(null); },
    });
  };
  const addRow = () => {
    const defCat = newCat || Object.keys(categories)[0] || '';
    setRows((p) => [...p, { id: uid(), trackId: uid('t'), masterId: null, area: '', category: defCat, point: '', resp: [], due: '', flag: 'I', status: 'pending', remark: '', originDate: mDate, prevRemarks: [] }]);
  };
  /* a blank row's Discussion Area is picked from the master points (no
     free typing) — selecting one converts the row in place, keeping
     anything already typed in it, and ticks the point so the live
     points↔rows sync owns it from here on */
  const assignMasterToRow = (rowId, pid) => {
    const p = master.find((x) => x.id === pid);
    if (!p) return;
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, masterId: p.id, area: p.title, category: p.category } : r));
    setPicked((s) => { const n = new Set(s); n.add(p.id); return n; });
  };
  const updCarry = (id, patch) => setCarry((p) => p.map((c) => c.id === id ? { ...c, ...patch } : c));

  /* carried-tasks table filters — multi-select status & category via
     checkboxes; an empty selection = show all (display only; edits still
     land on the full carry list by id) */
  const [carryStatusF, setCarryStatusF] = useState([]);   // ['pending','overdue',…]
  const [carryCatF, setCarryCatF] = useState([]);         // category names

  /* dual scrollbar for the carried-tasks table — a thin phantom bar on top
     mirrors the real container so users can scroll right without first
     scrolling to the bottom of the (tall) table */
  const carryTopScrollRef = useRef(null);
  const carryMainScrollRef = useRef(null);
  useEffect(() => {
    const main = carryMainScrollRef.current;
    const top = carryTopScrollRef.current;
    if (!main || !top) return;
    const syncPhantomWidth = () => {
      const phantom = top.firstChild;
      if (phantom && main.scrollWidth > 0) phantom.style.width = `${main.scrollWidth}px`;
    };
    syncPhantomWidth();
    const timer = setTimeout(syncPhantomWidth, 100);
    const onMain = () => { top.scrollLeft = main.scrollLeft; };
    const onTop = () => { main.scrollLeft = top.scrollLeft; };
    main.addEventListener('scroll', onMain);
    top.addEventListener('scroll', onTop);
    window.addEventListener('resize', syncPhantomWidth);
    return () => {
      clearTimeout(timer);
      main.removeEventListener('scroll', onMain);
      top.removeEventListener('scroll', onTop);
      window.removeEventListener('resize', syncPhantomWidth);
    };
  });
  const toggleIn = (setter) => (v) => setter((p) => p.includes(v) ? p.filter((x) => x !== v) : [...p, v]);
  const toggleCarryStatus = toggleIn(setCarryStatusF);
  const toggleCarryCat = toggleIn(setCarryCatF);
  const carryCats = useMemo(() => [...new Set(carry.map((c) => c.category).filter(Boolean))].sort(), [carry]);
  const shownCarry = useMemo(() => carry.filter((c) => {
    const isOd = c.status !== 'completed' && c.due && daysFromDue(c.due) > 0;
    const okStatus = !carryStatusF.length
      || carryStatusF.some((f) => f === 'overdue' ? isOd : c.status === f);
    const okCat = !carryCatF.length || carryCatF.includes(c.category);
    return okStatus && okCat;
  }), [carry, carryStatusF, carryCatF]);

  const { taskCount, infoCount, blankCount, unassigned } = useMemo(() => ({
    taskCount: rows.filter((r) => r.flag === 'T').length + carry.filter((c) => c.status !== 'completed').length,
    infoCount: rows.filter((r) => r.flag === 'I' && (r.point.trim() || r.remark.trim() || respArr(r.resp).length)).length,
    blankCount: rows.filter((r) => r.flag === 'I' && !r.point.trim() && !r.remark.trim() && !respArr(r.resp).length).length,
    unassigned: rows.filter((r) => r.flag === 'T' && !respArr(r.resp).length).length
      + carry.filter((c) => c.status !== 'completed' && !respArr(c.resp).length).length,
  }), [rows, carry]);

  const finalize = () => {
    if (!branches.length) return ping('Select at least one branch', 'err');
    if (!mDate) return ping('Meeting date is mandatory', 'err');
    if (!mLocation.trim()) return ping('Please set the meeting location', 'err');
    if (!mType.trim()) return ping('Set the meeting type (pick one or type your own)', 'err');
    if (!attendees.some((a) => a.present)) return ping('Mark at least one attendee as present', 'err');
    if (unassigned) return ping(`${unassigned} Task row(s) have no Responsibility — assign someone or switch them to "I"`, 'err');
    if (taskCount === 0 && infoCount === 0 && carry.length === 0)
      return ping('Nothing recorded yet — note at least one point or assign a task', 'err');
    setConfirm({
      title: 'Finalize minutes?',
      meta: `${branchLabel} · ${fmt(mDate)} · ${mType}`,
      stats: [
        { label: 'Tasks assigned', value: taskCount, color: '#d97706', icon: Zap },
        { label: 'Information', value: infoCount, color: '#2563eb', icon: FileText },
        { label: 'Carried reviewed', value: carry.length, color: '#b45309', icon: CornerUpRight },
      ],
      note: blankCount ? `${blankCount} untouched blank row${blankCount > 1 ? 's' : ''} will be skipped.` : '',
      onYes: () => {
        if (savingRef.current) return;   // a save is already in flight — ignore the extra click
        savingRef.current = true;
        const kept = rows.filter((r) => !(r.flag === 'I' && !r.point.trim() && !r.remark.trim() && !respArr(r.resp).length));
        const allRows = [...carry, ...kept];
        setSaving(true);
        const payload = {
          branchCode: branches[0].code, branchName: branchLabel,
          branches: branches.map(({ code, name }) => ({ code, name })),
          date: mDate, location: mLocation.trim(), type: mType.trim(),
          heads: heads.map((h) => h.trim()).filter(Boolean),
          attendees: attendees.map((a) => ({ name: a.name, source: a.source, present: a.present, user_id: a.user_id || null, branch: a.branch || null })),
          rows: allRows.map((r) => ({
            trackId: r.trackId, masterId: r.masterId ?? null, area: r.area, category: r.category,
            point: r.point || '', resp: respArr(r.resp),
            assignedBy: r.assignedBy || '', headResp: r.headResp || '',
            due: r.due || '', flag: r.flag,
            status: r.status, remark: r.remark || '', originDate: r.originDate || r.srcDate || '',
            carried: !!r.carried, prevRemarks: r.prevRemarks || [],
          })),
        };
        axios.post(`${MOM_API}/meetings`, payload, { headers: authHeaders })
          .then((res) => {
            if (!res.data?.success) throw new Error('Save failed');
            const mt = res.data.meeting;
            setHistory((h) => fanOut(h, mt));
            setConfirm(null); ping('Minutes saved'); resetWizard(); setView('history');
          })
          .catch((e) => ping(e?.response?.data?.detail || 'Could not save minutes — is the server running?', 'err'))
          .finally(() => { savingRef.current = false; setSaving(false); });
      },
    });
  };

  /* delete a saved meeting (Master Admin, API mode) — removed from every
     branch list it was filed under */
  const deleteMeeting = (m) => {
    const brNames = (m.branches || []).map((b) => b.name).filter(Boolean);
    setConfirm({
      title: 'Delete this meeting?',
      meta: `${m.branchName} · ${fmt(m.date)} · ${m.type}`,
      note: brNames.length > 1
        ? `This meeting was held with ${brNames.length} branches (${brNames.join(', ')}) — it will be deleted from the history of ALL of them. The sheet, its attendees and all rows are permanently removed.`
        : 'This permanently removes the sheet, its attendees and all rows.',
      yesLabel: 'Yes, delete',
      onYes: async () => {
        try {
          await axios.delete(`${MOM_API}/meetings/${m.id}`, { headers: authHeaders });
          setHistory((h) => {
            const next = {};
            /* drop branch keys left with no meetings, so deleted-out branches
               don't linger in the History sidebar as bare codes */
            Object.entries(h).forEach(([k, ms]) => {
              const left = ms.filter((x) => x.id !== m.id);
              if (left.length) next[k] = left;
            });
            return next;
          });
          setConfirm(null); ping('Meeting deleted');
        } catch (e) { ping(e?.response?.data?.detail || 'Could not delete meeting', 'err'); }
      },
    });
  };

  /* Master-setup persistence (null while API unreachable → modal stays local-only) */
  const persist = histSource === 'api' ? {
    addPoint: (title, category) => axios.post(`${MOM_API}/master-points`, { title, category }, { headers: authHeaders }).then((r) => r.data.item),
    updatePoint: (id, data) => axios.put(`${MOM_API}/master-points/${id}`, data, { headers: authHeaders }),
    deletePoint: (id) => axios.delete(`${MOM_API}/master-points/${id}`, { headers: authHeaders }),
    addMeetingType: (name) => axios.post(`${MOM_API}/meeting-types`, { name }, { headers: authHeaders }).then((r) => r.data.item),
    deleteMeetingType: (id) => axios.delete(`${MOM_API}/meeting-types/${id}`, { headers: authHeaders }),
    addCategory: (name, color) => axios.post(`${MOM_API}/categories`, { name, color }, { headers: authHeaders }),
    updateCategory: (name, color) => axios.put(`${MOM_API}/categories/${encodeURIComponent(name)}`, { color }, { headers: authHeaders }),
    deleteCategory: (name) => axios.delete(`${MOM_API}/categories/${encodeURIComponent(name)}`, { headers: authHeaders }),
  } : null;

  /* export flow: one fixed navy theme — the file downloads straight away,
     no colour picker. Every export button is gated by canExport. */
  const doExport = (m) => exportMeetingExcel(m).catch(() => toast.error('Could not generate the Excel file'));
  const exportDraft = () => doExport({
    branchName: branchLabel, branches: branches.map(({ code, name }) => ({ code, name })),
    date: mDate, location: mLocation, type: mType,
    conductedBy: me?.name || 'Master Admin', heads, attendees, rows: [...carry, ...rows],
  });

  /* ========================================================
     RENDER
     ======================================================== */
  return (
    <div className="font-sans mom-anim">
      <FontScale />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pb-2 max-md:px-2">

        {/* ===== HERO (same pattern as Knowledge Bank) ===== */}
        <div className="kc-in rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden" style={{ background: `linear-gradient(120deg, ${BRAND} 0%, ${BRAND_DARK} 100%)` }}>
          <div className="kc-float absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="kc-float-2 absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm"><ClipboardList className="h-5 w-5" /></div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold leading-tight">MOM Tracking</h1>
                <p className="text-[11px] text-white/70 leading-tight">Minutes of Meeting register · Excel-format sheet with task &amp; remark tracking</p>
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 text-white px-2.5 py-1 text-[11px] font-medium">Meetings: <b className="font-bold">{stats.meetings}</b></span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 text-white px-2.5 py-1 text-[11px] font-medium">Open tasks: <b className="font-bold">{stats.open}</b></span>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-white" style={stats.overdue > 0 ? { background: 'rgba(248,113,113,0.3)' } : { background: 'rgba(255,255,255,0.15)' }}>Overdue: <b className="font-bold">{stats.overdue}</b></span>
              {isMaster && (
                <button onClick={() => setMasterOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                  <ListChecks className="h-3.5 w-3.5" /> Master setup
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ===== VIEW TABS ===== */}
        <div className="kc-in flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm w-fit max-sm:max-w-full max-sm:overflow-x-auto">
            {(isMaster
              ? [{ k: 'new', label: 'New meeting', icon: Zap }, { k: 'history', label: 'MOM History', icon: FileText }, { k: 'reports', label: 'Reports', icon: BarChart3 }, { k: 'mine', label: 'Employee report', icon: Users }]
              : [{ k: 'mine', label: 'My MOM', icon: Users }]
            ).map((t) => (
              <button key={t.k} onClick={() => setView(t.k)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 fs-13 font-semibold transition ${view === t.k ? 'mom-tab-active' : ''}`} style={view === t.k ? { background: BRAND_SOFT, color: INK } : { color: '#6b7280' }}>
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>
          {isMaster && view === 'history' && (
            <select value={histBranch || '__all__'} onChange={(e) => setHistBranch(e.target.value)}
              className="kc-input px-2 py-1.5 fs-12 font-bold text-gray-800 bg-white shadow-sm"
              title="Filter MOM History by branch" style={{ maxWidth: '16rem' }}>
              <option value="__all__">All branches - {stats.meetings}</option>
              {histAllBranches.map((b) => (
                <option key={b.code} value={b.code}>{b.name} - {(history[b.code] || []).length}{b.manual ? ' · manual' : ''}</option>
              ))}
            </select>
          )}
          {isMaster && view === 'new' && (
            <button onClick={askReset} title="Clear the whole meeting and start over"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 fs-12 font-semibold transition shadow-sm"
              style={{ background: 'rgba(248,113,113,0.10)', borderColor: 'rgba(248,113,113,0.35)', color: '#ef4444' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.20)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.10)'; }}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>

        {/* ================================================
            NEW MEETING — ONE TAB (setup & live sheet merged,
            everything editable in place — Excel format)
            ================================================ */}
        {view === 'new' && (
          <div className="kc-fade space-y-3">

            {/* ---- sheet header block — chrome + editable meta + attendees + points ---- */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm" style={{ overflow: 'visible' }}>
              <div className="mom-view-head mom-live-head rounded-t-2xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-gray-200" style={{ background: '#ffda6e' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.10)' }}>
                    <ClipboardList size={17} style={{ color: '#1f2937' }} />
                  </span>
                  <div className="min-w-0">
                    <div className="fs-13 sm:text-base font-bold leading-tight text-gray-900">Minutes of Meeting</div>
                    <div className="fs-10 font-medium leading-tight" style={{ color: 'rgba(0,0,0,0.55)' }}>Live sheet — fill, assign &amp; finalize from this one screen</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 max-md:flex-wrap">
                  {canExport && <button onClick={exportDraft} className="export-btn kc-lift inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 fs-11 font-semibold" style={{ borderColor: '#dfe3f2', color: INK }}><Upload size={13} /> Export Excel</button>}
                </div>
              </div>
              {/* meta grid — narrow Date, wider Location / Branch(es) / Type, all editable in place */}
              <div className="grid grid-cols-2 lg:grid-cols-[0.6fr_1.1fr_1fr_1fr_1.2fr] divide-x divide-gray-100 border-b border-gray-100 max-sm:grid-cols-1">
                {/* Date */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Date <span className="text-red-300">*</span></div>
                    <input type="date" required value={mDate} onChange={(e) => setMDate(e.target.value)}
                      className="kc-input mt-0.5 w-full fs-12 font-semibold text-gray-800 outline-none px-2 py-1"
                      style={!mDate ? { borderColor: '#f87171' } : {}} />
                  </div>
                </div>
                {/* Location */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Location <span className="text-red-300">*</span></div>
                    <input value={mLocation} onChange={(e) => setMLocation(e.target.value)} placeholder="e.g. Branch Office"
                      className="kc-input mt-0.5 w-full fs-12 font-semibold text-gray-800 outline-none px-2 py-1" />
                  </div>
                </div>
                {/* Branch(es) — multi-select dropdown; employees auto-load as attendees */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Branches <span className="text-red-300">*</span></div>
                    <Dropdown hover panelClass="w-72 max-w-[90vw]"
                      trigger={({ open, toggle }) => (
                        <button type="button" onClick={toggle}
                          className="kc-input mt-0.5 w-full flex items-center justify-between gap-1.5 px-2 py-1 fs-12 font-semibold text-gray-800 text-left"
                          title={branches.length ? branchLabel : 'Select one or more branches'}
                          style={open ? { borderColor: BRAND, background: '#fff', boxShadow: '0 0 0 3px rgba(47,49,146,.10)' } : {}}>
                          <span className="truncate flex-1 min-w-0" style={!branches.length ? { color: '#9ca3af', fontWeight: 500, fontSize: '10px' } : {}}>{branches.length ? branchLabel : 'Select branches…'}</span>
                          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
                        </button>
                      )}>
                      <div className="px-3 py-1.5 fs-9 font-bold uppercase tracking-wide text-black border-b border-gray-100 flex items-center justify-between gap-2">
                        <span>Branches — one or more</span>
                        <span className="rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: INK }}>{branches.length}</span>
                      </div>
                      <div className="max-h-56 overflow-y-auto kc-scroll py-1">
                        {allBranchOptions.length === 0 && (
                          <div className="px-3 py-2 fs-11 text-gray-400">No branches on file{empSource === 'error' ? ' — employees API not reachable' : ''}. Add one manually below.</div>
                        )}
                        {allBranchOptions.map((b) => {
                          const on = branches.some((x) => x.code === b.code);
                          const emps = branchEmployees(b).length;
                          const pend = branchCarryCounts[b.code] || 0;
                          const sub = [b.manual ? 'manual' : (b.region || ''), emps ? `${emps} employee${emps > 1 ? 's' : ''}` : '', pend ? `${pend} pending task${pend > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
                          return (
                            <div key={b.code} role="button" tabIndex={0} onClick={() => toggleBranch(b)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBranch(b); } }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 cursor-pointer">
                              <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                                {on && <Check size={11} color="#fff" className="kc-pop" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`fs-12 block truncate text-gray-800 ${on ? 'font-semibold' : ''}`} title={b.name}>{b.name}</span>
                                {sub && <span className="fs-9 text-gray-400 block truncate">{sub}</span>}
                              </span>
                              {b.manual && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); deleteManualBranch(b); }}
                                  className="flex-shrink-0 rounded-lg p-1 text-gray-300 hover:text-red-400 hover:bg-red-50" title="Delete this manual branch">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="px-3 py-1.5 border-t border-gray-100 fs-10 text-gray-400" style={{ background: '#fafbfd' }}>
                        {branches.length
                          ? <>last meeting across selected: <b className="text-gray-600">{fmt(lastAcross)}</b>{carryPreview > 0 && <span className="ml-1.5 rounded-full px-1.5 py-0.5 font-bold" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>{carryPreview} open task{carryPreview > 1 ? 's' : ''} carry forward</span>}</>
                          : 'employees of selected branches auto-load as attendees'}
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-gray-100" style={{ background: '#fafafc' }}>
                        <Building2 size={12} className="text-gray-400 flex-shrink-0" />
                        <input value={manualBranch} onChange={(e) => setManualBranch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManualBranch()}
                          placeholder="Branch not on the list? Add manually…" className="kc-input flex-1 fs-11 text-gray-700 outline-none min-w-0 px-2 py-1" />
                        <button onClick={addManualBranch} className="rounded-lg px-2.5 py-1 fs-10 font-bold text-white flex-shrink-0" style={{ background: BRAND }}>Add</button>
                      </div>
                    </Dropdown>
                  </div>
                </div>
                {/* Meeting type — free text + previously used types */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1 relative" ref={typeDdRef}>
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Meeting type <span className="text-red-300">*</span></div>
                    <div className="kc-input mt-0.5 flex items-center px-2 py-1 relative">
                      <input value={mType} onChange={(e) => setMType(e.target.value)} placeholder="Type or pick…"
                        className="w-full fs-12 font-semibold text-gray-800 outline-none bg-transparent pr-5" />
                      <button type="button" onClick={() => setTypeDdOpen((o) => !o)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100"
                        title="Show previously used meeting types">
                        <ChevronDown size={13} className={`text-gray-500 transition-transform ${typeDdOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {typeDdOpen && (() => {
                      const masterNames = new Set(meetingTypes.map((t) => t.name.toLowerCase()));
                      const histOnly = usedMeetingTypes.filter((t) => !masterNames.has(t.toLowerCase()));
                      const isSel = (n) => mType.trim().toLowerCase() === n.toLowerCase();
                      const Row = ({ name }) => (
                        <button type="button" onClick={() => { setMType(name); setTypeDdOpen(false); }}
                          className="w-full text-left px-3 py-1.5 fs-12 flex items-center gap-2 transition-colors"
                          style={isSel(name) ? { background: BRAND_SOFT, color: BRAND, fontWeight: 700 } : { color: '#1f2937' }}
                          onMouseEnter={(e) => { if (!isSel(name)) e.currentTarget.style.background = '#f7f9ff'; }}
                          onMouseLeave={(e) => { if (!isSel(name)) e.currentTarget.style.background = ''; }}>
                          <span className="h-4 w-4 rounded-full border flex items-center justify-center flex-shrink-0"
                            style={isSel(name) ? { background: BRAND, borderColor: BRAND } : { borderColor: '#d7dbe7' }}>
                            {isSel(name) && <Check size={10} color="#fff" className="kc-pop" />}
                          </span>
                          <span className="truncate">{name}</span>
                        </button>
                      );
                      const Head = ({ icon: Icon, label, count }) => (
                        <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1.5 fs-9 font-bold uppercase tracking-wide border-b border-gray-100"
                          style={{ background: '#f4f6fb', color: BRAND }}>
                          <Icon size={11} className="flex-shrink-0" />
                          <span className="flex-1">{label}</span>
                          <span className="rounded-full px-1.5 py-0.5 fs-9 font-bold bg-white" style={{ color: BRAND }}>{count}</span>
                        </div>
                      );
                      return (
                        <div className="kc-scale-in absolute z-[60] mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden" style={{ minWidth: '16rem' }}>
                          <div className="max-h-64 overflow-y-auto kc-scroll">
                            <Head icon={ListChecks} label="Master meeting types" count={meetingTypes.length} />
                            {meetingTypes.length === 0 && (
                              <div className="px-3 py-2.5 fs-11 text-gray-400">No master types yet — add them in Master setup.</div>
                            )}
                            <div className="py-1">
                              {meetingTypes.map((t) => <Row key={`mt-${t.id}`} name={t.name} />)}
                            </div>
                            {histOnly.length > 0 && (
                              <>
                                <Head icon={RotateCcw} label="Previously used" count={histOnly.length} />
                                <div className="py-1">
                                  {histOnly.map((t) => <Row key={`h-${t}`} name={t} />)}
                                </div>
                              </>
                            )}
                          </div>
                          <div className="px-3 py-1.5 border-t border-gray-100 fs-10 text-gray-400" style={{ background: '#fafbfd' }}>
                            or type your own in the box above
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                {/* Meeting heads — the logged-in conductor plus any other head(s) */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Meeting heads</div>
                    <Dropdown panelClass="w-72 max-w-[90vw]"
                      trigger={({ open, toggle }) => (
                        <button type="button" onClick={toggle}
                          className="kc-input mt-0.5 w-full flex items-center justify-between gap-1.5 px-2 py-1 fs-12 font-semibold text-gray-800 text-left"
                          title={heads.length ? heads.join(', ') : 'Select one or more meeting heads'}
                          style={open ? { borderColor: BRAND, background: '#fff', boxShadow: '0 0 0 3px rgba(47,49,146,.10)' } : {}}>
                          <span className="truncate flex-1 min-w-0" style={!heads.length ? { color: '#9ca3af', fontWeight: 500, fontSize: '10px' } : {}}>
                            {heads.length ? heads.join(', ') : 'Select heads…'}
                          </span>
                          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
                        </button>
                      )}>
                      <div className="px-3 py-1.5 fs-9 font-bold uppercase tracking-wide text-black border-b border-gray-100 flex items-center justify-between gap-2">
                        <span>Meeting heads — one or more</span>
                        <span className="rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: INK }}>{heads.length}</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto kc-scroll py-1">
                        {[...new Set([...headOptions, ...heads])].map((n) => {
                          const on = heads.includes(n);
                          const isSelf = n === me?.name;
                          return (
                            <div key={n} role="button" tabIndex={0} onClick={() => toggleHead(n)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHead(n); } }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 ${isSelf ? 'cursor-default' : 'cursor-pointer'}`}
                              title={isSelf ? 'You conduct this meeting — always a meeting head' : (on ? 'Untick to remove as head' : 'Tick to make a meeting head')}>
                              <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: isSelf ? '#9ca3af' : BRAND, borderColor: isSelf ? '#9ca3af' : BRAND } : { borderColor: '#cfcfe0' }}>
                                {on && <Check size={11} color="#fff" className="kc-pop" />}
                              </span>
                              <span className={`fs-11 flex-1 min-w-0 truncate text-gray-700 ${on ? 'font-semibold' : ''}`}>{n}</span>
                              {isSelf
                                ? <span className="fs-9 font-bold rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: BRAND_SOFT, color: INK }}>you</span>
                                : on && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); removeHead(n); }}
                                    className="flex-shrink-0 rounded-lg p-1 text-gray-300 hover:text-red-400 hover:bg-red-50" title="Remove this meeting head">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-gray-100" style={{ background: '#fafafc' }}>
                        <Crown size={12} className="text-gray-400 flex-shrink-0" />
                        <input value={manualHead} onChange={(e) => setManualHead(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManualHead()}
                          placeholder="Head not on the list? Add manually…" className="kc-input flex-1 fs-11 text-gray-700 outline-none min-w-0 px-2 py-1" />
                        <button onClick={addManualHead} className="rounded-lg px-2.5 py-1 fs-10 font-bold text-white flex-shrink-0" style={{ background: BRAND }}>Add</button>
                      </div>
                    </Dropdown>
                  </div>
                </div>
              </div>
              {/* ---- row 2: attendees · add employee / guest · points to discuss · legend ---- */}
              <div className="grid grid-cols-2 lg:grid-cols-[1.1fr_1fr_1.2fr_0.7fr] divide-x divide-gray-100 max-sm:grid-cols-1">
                {/* Attendees — count in the box, full list (present toggles) in the dropdown */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Attendees <span className="text-red-300">*</span></div>
                    <Dropdown hover panelClass="w-80 max-w-[90vw]"
                      trigger={({ open, toggle }) => (
                        <button type="button" onClick={toggle}
                          className="kc-input mt-0.5 w-full flex items-center justify-between gap-1.5 px-2 py-1 fs-12 font-semibold text-gray-800 text-left"
                          title="See the attendee list & mark who is present"
                          style={open ? { borderColor: BRAND, background: '#fff', boxShadow: '0 0 0 3px rgba(47,49,146,.10)' } : {}}>
                          <span className="truncate flex-1 min-w-0" style={!attendees.length ? { color: '#9ca3af', fontWeight: 500, fontSize: '10px' } : {}}>
                            {attendees.length ? `${presentNames.length}/${attendees.length} present` : 'No attendees yet…'}
                          </span>
                          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
                        </button>
                      )}>
                      <div className="px-3 py-1.5 fs-9 font-bold uppercase tracking-wide text-black border-b border-gray-100 flex items-center justify-between gap-2">
                        <span>Attendees — tick = present</span>
                        <span className="rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: INK }}>{presentNames.length}/{attendees.length}</span>
                      </div>
                      <div className="max-h-64 overflow-y-auto kc-scroll py-1">
                        {attendees.length === 0 && (
                          <div className="px-3 py-2 fs-11 text-gray-400">No attendees yet — select branches (their employees auto-load), or add a guest in the next box.</div>
                        )}
                        {attendees.map((a) => (
                          <div key={a.id} role="button" tabIndex={0} onClick={() => togglePresent(a.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePresent(a.id); } }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 cursor-pointer"
                            title={a.present ? 'Click to mark absent' : 'Click to mark present'}>
                            <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={a.present ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                              {a.present && <Check size={11} color="#fff" className="kc-pop" />}
                            </span>
                            <span className={`fs-11 flex-1 min-w-0 truncate ${a.present ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{a.name}</span>
                            {a.branch && <span className="fs-9 font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#eef0fa', color: '#4b4e9e' }}>{a.branch}</span>}
                            {a.source === 'manual' && <span className="rounded-full px-1 fs-9 font-bold flex-shrink-0" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }} title="Manually added guest">M</span>}
                            {(a.source === 'manual' || a.extra) && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); removeAttendee(a.id); }} className="flex-shrink-0 rounded-lg p-1 text-black hover:text-red-500 hover:bg-red-50" title="Remove"><Trash2 size={12} /></button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-1.5 border-t border-gray-100 fs-10 text-gray-400" style={{ background: '#fafbfd' }}>
                        employees of the selected branches auto-load as attendees
                      </div>
                    </Dropdown>
                  </div>
                </div>
                {/* Add guest — type & Add = guest (M); employees auto-load via branches */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Add guest</div>
                    <div className="kc-input mt-0.5 w-full flex items-center gap-1 px-2 py-1">
                      <input value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManual()}
                        placeholder="Type guest name…" className="flex-1 min-w-0 fs-12 font-semibold text-gray-800 outline-none bg-transparent" />
                      <button type="button" onClick={addManual} className="rounded px-2 py-0.5 fs-10 font-bold text-white flex-shrink-0" style={{ background: BRAND }} title="Add the typed name as a guest (manually added)">Add</button>
                    </div>
                  </div>
                </div>
                {/* Points to discuss — ticking a point adds its row to the sheet instantly */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Points to discuss</div>
                    <Dropdown hover panelClass="w-80 max-w-[90vw]"
                      trigger={({ open, toggle }) => (
                        <button type="button" onClick={toggle}
                          className="kc-input mt-0.5 w-full flex items-center justify-between gap-1.5 px-2 py-1 fs-12 font-semibold text-gray-800 text-left"
                          style={open ? { borderColor: BRAND, background: '#fff', boxShadow: '0 0 0 3px rgba(47,49,146,.10)' } : {}}>
                          <span className="truncate flex-1" style={!picked.size ? { color: '#9ca3af', fontWeight: 500, fontSize: '10px' } : {}}>
                            {picked.size ? `${picked.size} of ${master.length} selected` : 'Select master points…'}
                          </span>
                          <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
                        </button>
                      )}>
                  <div className="px-3 py-1.5 fs-9 font-bold uppercase tracking-wide text-black border-b border-gray-100 flex items-center justify-between gap-2">
                    <span>Master discussion areas</span>
                    <span className="flex items-center gap-1 normal-case tracking-normal">
                      <button type="button" onClick={pickAll} className="fs-10 font-bold hover:underline" style={{ color: BRAND }}>Select all</button>
                      <span className="text-gray-300">·</span>
                      <button type="button" onClick={pickNone} className="fs-10 font-bold hover:underline" style={{ color: BRAND }}>Clear</button>
                    </span>
                  </div>
                  <div className="max-h-60 overflow-y-auto kc-scroll py-1">
                    {master.map((p) => {
                      const on = picked.has(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => togglePick(p)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50">
                          <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                            {on && <Check size={11} color="#fff" className="kc-pop" />}
                          </span>
                          <span className={`fs-11 flex-1 min-w-0 truncate text-gray-700 ${on ? 'font-semibold' : ''}`} title={p.title}>{p.title}</span>
                          <span className="fs-9 font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: 'var(--mom-chip-fg)', background: 'var(--mom-chip-bg)' }}>{p.category}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-3 py-1.5 border-t border-gray-100 fs-10 text-gray-400" style={{ background: '#fafbfd' }}>
                    ticked points appear as rows on the sheet below — untick removes the row (warns if filled)
                  </div>
                    </Dropdown>
                  </div>
                </div>
                {/* Action-flag legend */}
                <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="fs-9 font-bold uppercase tracking-wide text-black pb-1">Action flag</div>
                    <div className="mt-1.5 flex items-center gap-3 fs-10 text-gray-500 flex-wrap">
                      <span className="inline-flex items-center gap-1"><FlagChip f="T" small /> Task</span>
                      <span className="inline-flex items-center gap-1"><FlagChip f="I" small /> Information</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ---- SECTION A · review of previous meetings ---- */}
            {carry.length > 0 && (
              // overflow stays visible so the filter dropdown panels can open
              // past the box edge — the table wrapper clips its own corners
              <div className="rounded-2xl border bg-white shadow-sm" style={{ borderColor: 'rgba(47,49,146,0.35)' }}>
                <div className="rounded-t-2xl flex items-center justify-between gap-2 px-3 py-2 flex-wrap" style={{ background: 'rgba(47,49,146,0.08)' }}>
                  <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(47,49,146,0.14)' }}><CornerUpRight size={14} style={{ color: BRAND }} /></span>
                    <span className="fs-13 font-bold" style={{ color: BRAND }}>Previous meeting — pending tasks</span>
                    <span className="rounded-full px-2 py-0.5 fs-10 font-bold bg-white" style={{ color: BRAND }}>{shownCarry.length !== carry.length ? `${shownCarry.length} / ${carry.length}` : carry.length}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {canExport && shownCarry.length > 0 && (
                      <button type="button" onClick={() => {
                        const gs = groupConsecutive(shownCarry, (c) => (c.area || '').trim().toLowerCase());
                        exportTableExcel('MOM_pending_tasks',
                          ['Sr. No.', 'Discussion Area', 'Discussion Points', 'Responsibility', 'Assigned by (Head)', 'Flag', 'Due Date', 'Previous remarks', 'Remark — this meeting', 'Status'],
                          gs.flatMap((g, gIdx) => g.items.map((c) => [
                            gIdx + 1, c.area, c.point || '', respArr(c.resp).join(', '), c.assignedBy || '', c.flag, c.due ? fmtDDMMYY(c.due) : '', remarksText(c.prevRemarks), c.remark || '', STATUS[c.status]?.label || c.status,
                          ])),
                          { mergeCols: [0, 1], groupSizes: gs.map((g) => g.items.length) }).catch(() => toast.error('Could not generate the Excel file'));
                      }}
                        className={XL_BTN} title="Download this pending-tasks table as Excel">
                        <Upload size={11} /> Export Excel
                      </button>
                    )}
                    {[
                      {
                        label: 'status', selected: carryStatusF, toggle: toggleCarryStatus, clear: () => setCarryStatusF([]),
                        items: [['pending', 'Pending'], ['in_progress', 'WIP'], ['completed', 'Completed'], ['overdue', 'Overdue']],
                      },
                      {
                        label: 'categories', selected: carryCatF, toggle: toggleCarryCat, clear: () => setCarryCatF([]),
                        items: carryCats.map((c) => [c, c]),
                      },
                    ].map((f) => (
                      <Dropdown key={f.label} hover panelClass="w-52" panelStyle={{ left: 'auto', right: 0 }}
                        trigger={({ open, toggle }) => (
                          <button type="button" onClick={toggle} title={`Filter carried tasks by ${f.label} — tick one or more`}
                            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1 fs-11 font-semibold"
                            style={{ borderColor: 'rgba(47,49,146,0.25)', color: BRAND, ...(open ? { boxShadow: '0 0 0 3px rgba(47,49,146,.10)' } : {}) }}>
                            {f.selected.length ? `${f.selected.length} ${f.label}` : `All ${f.label}`}
                            <ChevronDown size={11} className="flex-shrink-0" />
                          </button>
                        )}>
                        <div className="px-3 py-1.5 fs-9 font-bold uppercase tracking-wide text-black border-b border-gray-100 flex items-center justify-between gap-2">
                          <span>Filter {f.label}</span>
                          {f.selected.length > 0 && <button type="button" onClick={f.clear} className="fs-10 font-bold normal-case tracking-normal hover:underline" style={{ color: BRAND }}>Clear</button>}
                        </div>
                        <div className="max-h-56 overflow-y-auto kc-scroll py-1">
                          {f.items.length === 0 && <div className="px-3 py-2 fs-10 text-gray-400">Nothing to filter.</div>}
                          {f.items.map(([val, lbl]) => {
                            const on = f.selected.includes(val);
                            return (
                              <button key={val} type="button" onClick={() => f.toggle(val)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50">
                                <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                                  {on && <Check size={11} color="#fff" className="kc-pop" />}
                                </span>
                                <span className={`fs-11 flex-1 truncate text-gray-700 ${on ? 'font-semibold' : ''}`}>{lbl}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="px-3 py-1.5 border-t border-gray-100 fs-10 text-gray-400" style={{ background: '#fafbfd' }}>
                          nothing ticked = show all
                        </div>
                      </Dropdown>
                    ))}
                  </div>
                </div>
                <div ref={carryTopScrollRef} className="overflow-x-auto kc-scroll" style={{ overflowY: 'hidden' }}>
                  <div style={{ width: CARRY_MINW, height: 1 }} />
                </div>
                <div ref={carryMainScrollRef} className="overflow-x-auto kc-scroll rounded-b-2xl">
                  <table className="mom-sheet w-full fs-12" style={{ borderCollapse: 'collapse', minWidth: CARRY_MINW }}>
                    <thead>
                      <tr style={{ background: '#f1f3fb', color: INK }}>
                        <th className="px-1 py-2 fs-10 font-bold" style={{ width: '2.6rem' }} title="Tick to move the task into the current-meeting discussion">Discuss</th>
                        <th className="px-1 py-2 fs-11 font-bold" style={{ width: '2rem' }}>Sr. No.</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '10rem' }}>Discussion Area</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '12rem' }}>Discussion Points</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '7rem' }}>Responsibility</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '6.5rem' }}>Assigned by (Head)</th>
                        <th className="px-1 py-2 fs-10 font-bold" style={{ width: '3rem' }}>Flag</th>
                        <th className="px-1 py-2 fs-11 font-bold" style={{ width: '6rem' }}>Due Date</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '18rem' }}>Previous remarks</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '16rem' }}>Remark/Observation/Action — this meeting</th>
                        <th className="px-1 py-2 fs-11 font-bold" style={{ width: '6.5rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownCarry.length === 0 && (
                        <tr><td colSpan={11} className="px-3 py-5 text-center fs-12 text-gray-400">No carried tasks match the current status / category filter.</td></tr>
                      )}
                      {groupConsecutive(shownCarry, (c) => (c.area || '').toLowerCase()).flatMap((g, gIdx) => g.items.map((c, gi) => {
                        const od = c.due ? daysFromDue(c.due) : 0;
                        const isOd = c.status !== 'completed' && c.due && od > 0;
                        return (
                          <tr key={c.id} className={c.status === 'completed' ? 'opacity-60' : ''}>
                            <td className="px-1 py-2 text-center">
                              <input type="checkbox" checked={false} onChange={() => moveCarryToRows(c.id)}
                                className="h-4 w-4 cursor-pointer align-middle" style={{ accentColor: BRAND }}
                                title="Tick to move this task into the current-meeting discussion table below" />
                            </td>
                            {gi === 0 && <td rowSpan={g.items.length} className="px-1 py-2 text-center text-black align-middle">{gIdx + 1}</td>}
                            {gi === 0 && <td rowSpan={g.items.length} className="px-2 py-2 align-middle text-center">
                              <span className="font-semibold text-black">{c.area}</span>
                            </td>}
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {c.point
                                  ? <span className={`fs-11 text-black ${c.status === 'completed' ? 'line-through' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>{c.point}</span>
                                  : <span className="fs-11 text-gray-300">—</span>}
                                {isOd && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 fs-9 font-semibold" style={{ background: STATUS.overdue.soft, color: STATUS.overdue.color }}><AlertTriangle size={9} /> {od}d overdue</span>}
                              </div>
                              <div className="fs-9 text-black mt-0.5">raised {fmt(c.originDate || c.srcDate)}</div>
                            </td>
                            {/* read-only here — tick "Discuss" to move the task below and edit everything */}
                            <td className="px-2 py-2" title='Read-only — tick "Discuss" to edit this on the current-meeting sheet'>
                              {respArr(c.resp).length ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {respArr(c.resp).map((n) => (
                                    <span key={n} className="inline-flex items-center justify-center rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: BRAND_SOFT, color: INK }}>{n.split(' ')[0]}</span>
                                  ))}
                                </div>
                              ) : <span className="fs-11 text-gray-300">—</span>}
                            </td>
                            <td className="px-2 py-2 text-center fs-11 text-black" title='Read-only — tick "Discuss" to edit this on the current-meeting sheet'>{c.assignedBy || <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-2 text-center"><FlagChip f={c.flag} small /></td>
                            <td className="px-2 py-2 text-center fs-11 text-black" title='Read-only — tick "Discuss" to edit this on the current-meeting sheet'>{c.due ? fmt(c.due) : <span className="text-gray-300">—</span>}</td>
                            <td className="px-2 py-2"><RemarkHistory list={c.prevRemarks} /></td>
                            <td className="px-1 py-1 mom-fill">
                              <textarea rows={1} value={c.remark}
                                ref={(el) => el && autoGrow(el)}
                                onChange={(e) => { autoGrow(e.target); updCarry(c.id, { remark: e.target.value }); }}
                                onKeyDown={(e) => handleBulletKeys(e, c.remark, (v) => updCarry(c.id, { remark: v }))}
                                placeholder="Remark for this meeting…" className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded resize-none overflow-hidden" style={{ minHeight: '2rem' }} /></td>
                            <td className="px-1 py-1">
                              <select value={c.status} onChange={(e) => updCarry(c.id, { status: e.target.value })}
                                className="w-full fs-11 font-semibold outline-none px-1 py-1.5 rounded-lg cursor-pointer"
                                style={{ color: STATUS[c.status].color, background: STATUS[c.status].soft }}>
                                <option value="pending">Pending</option><option value="in_progress">WIP</option><option value="completed">Completed</option>
                              </select>
                            </td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ---- SECTION B · current discussion table (carried tasks arrive
                 here via the "Discuss" checkbox on the pending list above) ---- */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: SHEET_SOFT }}><ListChecks size={15} style={{ color: SHEET_DARK }} /></span>
                  <span className="fs-13 font-bold text-gray-800">Discussion — current meeting</span>
                </div>
                <span className="fs-10 text-gray-400">{rows.filter((r) => r.flag === 'T').length} tasks · {infoCount} info</span>
              </div>
              <div ref={topScrollRef} onScroll={() => { if (mainScrollRef.current && topScrollRef.current) mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft; }} className="overflow-x-auto kc-scroll border-b border-gray-50" style={{ height: 10 }}>
                <div style={{ width: SHEET_MINW, height: 1 }} />
              </div>
              <div ref={mainScrollRef} onScroll={() => { if (mainScrollRef.current && topScrollRef.current) topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft; }} className="overflow-x-auto kc-scroll">
                <table className="mom-sheet w-full fs-12" style={{ borderCollapse: 'collapse', minWidth: SHEET_MINW }}>
                  <thead>
                    <tr style={{ background: '#f1f3fb', color: INK }}>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.8rem' }}>Sr.no</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '12rem' }}>Discussion Area</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '15rem' }}>Discussion points</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8rem' }}>Responsibility</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '7.75rem' }}>Assigned by (Head)</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '5rem' }}>Action flag</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8.5rem' }}>Due Date</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '16rem' }}>Remark/Observation/Action</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '6.5rem' }}>Status</th>
                      <th className="px-1 py-2 fs-11 font-bold" style={{ width: '3.5rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      /* consecutive rows of the same Discussion Area are grouped —
                         the area cell is drawn ONCE (rowSpan) with its Discussion
                         Points stacked beside it, one sheet row per point */
                      const groups = groupConsecutive(rows, sheetGroupKey).map((g) => ({ key: g.key, rows: g.items }));
                      return groups.flatMap((g, gIdx) => g.rows.map((r, gi) => {
                      const isT = r.flag === 'T';
                      return (
                        <tr key={r.id}>
                          {gi === 0 && <td rowSpan={g.rows.length} className="px-2 py-2 text-center text-gray-500 align-middle">{gIdx + 1}</td>}
                          {gi === 0 && <td rowSpan={g.rows.length} className="px-2 py-2 align-middle text-center">
                            {(r.masterId === null && !r.area) ? (
                              <>
                                <select value="" onChange={(e) => assignMasterToRow(r.id, e.target.value)}
                                  className="no-ring w-full fs-12 font-semibold text-gray-800 outline-none px-1 py-1 rounded cursor-pointer"
                                  title="Pick a master discussion area — only points not already on the sheet are listed">
                                  <option value="">
                                    {master.some((p) => !picked.has(p.id)) ? 'Select discussion area…' : 'All master points are already on the sheet'}
                                  </option>
                                  {master.filter((p) => !picked.has(p.id)).map((p) => (
                                    <option key={p.id} value={p.id}>{p.title} — {p.category}</option>
                                  ))}
                                </select>
                                <div className="fs-9 mt-0.5 font-medium text-gray-400">from master points only</div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-gray-800">{r.area}</span>
                                </div>
                                <div className="fs-11 mt-0.5 font-bold text-gray-600">{r.category}</div>
                              </>
                            )}
                          </td>}
                          <td className="px-1 py-1 align-top mom-fill">
                            {r.carried && (
                              <div className="px-1.5 pt-1">
                                <span className="fs-9 font-bold rounded px-1 py-0.5" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }} title="Carried forward from a previous meeting">C/F · raised {fmt(r.originDate || r.srcDate)}</span>
                              </div>
                            )}
                            <textarea rows={1} value={r.point}
                              ref={(el) => el && autoGrow(el)}
                              onChange={(e) => { autoGrow(e.target); updRow(r.id, { point: e.target.value }); }}
                              onKeyDown={(e) => handleBulletKeys(e, r.point, (v) => updRow(r.id, { point: v }))}
                              placeholder="What was discussed / decided…"
                              className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded resize-none overflow-hidden" style={{ minHeight: '2rem' }} />
                            {gi === g.rows.length - 1 && !!r.area && (
                              <button onClick={() => addPointRow(r.id)}
                                className="mb-1 ml-1.5 inline-flex items-center gap-1 fs-10 font-bold rounded-lg px-1.5 py-0.5"
                                style={{ color: '#047857', background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.25)' }}
                                title="Add another discussion point under this Discussion Area — each point gets its own owners, due date, status and remark">
                                <Plus size={11} strokeWidth={2.5} /> point
                              </button>
                            )}
                          </td>
                          <td className="px-1 py-1">
                            <RespPicker value={respArr(r.resp)} options={respOptions} onChange={(v) => updRow(r.id, { resp: v })} />
                          </td>
                          <td className="px-1 py-1"><HeadCell row={r} heads={heads} onChange={(patch) => updRow(r.id, patch)} /></td>
                          <td className="px-2 py-2 text-center"><FlagToggle value={r.flag} onChange={(f) => updRow(r.id, { flag: f })} /></td>
                          <td className="px-1 py-1">
                            {isT
                              ? <input type="date" value={r.due} onChange={(e) => updRow(r.id, { due: e.target.value })} className="w-full fs-11 text-gray-700 outline-none px-1 py-1 rounded" />
                              : <div className="text-center fs-11 text-gray-300" title="Information rows don't need a due date">—</div>}
                          </td>
                          <td className="px-1 py-1 mom-fill">
                            {r.carried && r.prevRemarks?.length > 0 && <div className="px-1.5 pt-1"><RemarkHistory list={r.prevRemarks} /></div>}
                            <textarea rows={1} value={r.remark}
                              ref={(el) => el && autoGrow(el)}
                              onChange={(e) => { autoGrow(e.target); updRow(r.id, { remark: e.target.value }); }}
                              onKeyDown={(e) => handleBulletKeys(e, r.remark, (v) => updRow(r.id, { remark: v }))}
                              placeholder="Remark…" className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded resize-none overflow-hidden" style={{ minHeight: '2rem' }} />
                          </td>
                          <td className="px-1 py-1">
                            {isT ? (
                              <select value={r.status} onChange={(e) => updRow(r.id, { status: e.target.value })} className="w-full fs-11 font-semibold outline-none px-1.5 py-1.5 rounded-lg" style={{ color: STATUS[r.status].color, background: STATUS[r.status].soft }}>
                                <option value="pending">Pending</option><option value="in_progress">WIP</option><option value="completed">Completed</option>
                              </select>
                            ) : <div className="text-center fs-11 text-gray-300">—</div>}
                          </td>
                          <td className="px-1 py-2">
                            <div className="flex items-center justify-center gap-1.5">
                              {r.carried && (
                                <button onClick={() => returnRowToCarry(r.id)} className="text-gray-700 hover:text-amber-600" title="Shift back to the previous-meeting pending list (top)">
                                  <CornerUpRight size={14} strokeWidth={2.25} />
                                </button>
                              )}
                              <button onClick={() => askDelRow(r)} className="text-gray-700 hover:text-red-500" title="Remove row">
                                <Trash2 size={14} strokeWidth={2.25} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                      }));
                    })()}
                    {rows.length === 0 && <tr><td colSpan={10} className="px-3 text-center fs-12 text-gray-400" style={{ height: '7rem', verticalAlign: 'middle' }}>No rows — add a discussion area below{carry.length > 0 ? ', or tick "Discuss" on a pending task above' : ''}.</td></tr>}
                    {/* add custom row — button lives in the Discussion Area column so the
                         last row keeps the full sheet grid lines */}
                    <tr style={{ background: '#fafbfd' }}>
                      <td className="px-2 py-2 text-center text-gray-300">{groupConsecutive(rows, sheetGroupKey).length + 1}</td>
                      <td className="p-0">
                        <button onClick={addRow} type="button"
                          className="mom-addrow w-full flex items-center justify-start gap-1.5 px-3 py-2 fs-11 font-bold transition hover:bg-[#eef2ff]"
                          style={{ color: BRAND, background: 'transparent', border: 'none' }}
                          title="Pick the new row's Discussion Area from the master points (only points not already on the sheet are listed)">
                          <Plus size={14} /> Add row
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <span className="fs-10 font-normal text-gray-400 max-sm:hidden">— pick its Discussion Area from the master points</span>
                      </td>
                      <td /><td /><td /><td /><td /><td /><td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- finalize bar ---- */}
            <div className="flex justify-end">
              <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-gray-200 bg-white shadow-sm px-3 py-1.5">
                {unassigned > 0 && <span className="fs-11 font-semibold inline-flex items-center gap-1" style={{ color: '#f87171' }}><AlertTriangle size={13} /> {unassigned} task{unassigned > 1 ? 's' : ''} without responsibility</span>}
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 fs-11 font-semibold" style={{ background: FLAG.T.bg, color: FLAG.T.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: FLAG.T.color }} /><b className="tabular-nums">{taskCount}</b> tasks</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 fs-11 font-semibold" style={{ background: FLAG.I.bg, color: FLAG.I.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: FLAG.I.color }} /><b className="tabular-nums">{infoCount}</b> info</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 fs-11 font-semibold" style={{ background: '#f1f3f9', color: '#5b6170' }}><CornerUpRight size={11} /><b className="tabular-nums">{carry.length}</b> carried</span>
                <button onClick={finalize} className="kc-lift inline-flex items-center gap-2 rounded-xl px-5 py-1.5 fs-12 font-bold text-white max-sm:w-full max-sm:justify-center" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})`, boxShadow: '0 6px 16px -6px rgba(47,49,146,.55)' }}><CheckCircle2 size={15} /> Finalize &amp; save</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== HISTORY ===== */}
        {view === 'history' && <HistoryView history={history} branches={branchOptions} onView={setViewMtg} onDelete={deleteMeeting} canDelete={histSource === 'api' && me?.role === 'master_admin'} canExport={canExport} onExport={doExport} source={histSource} initialCode={histBranch} />}

        {/* ===== REPORTS ===== */}
        {view === 'reports' && <ReportsView history={history} branches={branchOptions} canExport={canExport} onView={setViewMtg} onOpenBranch={(code) => { setHistBranch(code); setView('history'); }} />}

        {/* ===== MY MOM / EMPLOYEE REPORT ===== */}
        {view === 'mine' && (
          <div className="kc-in space-y-3">
            {isMaster && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3 flex items-center gap-2 flex-wrap">
                <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BRAND_SOFT }}><Users size={15} style={{ color: INK }} /></span>
                <span className="fs-12 font-bold text-gray-700">Employee report</span>
                <select value={pickedEmp?.user_id || ''}
                  onChange={(e) => { const emp = employees.find((x) => String(x.user_id) === e.target.value); setPickedEmp(emp ? { name: emp.name, user_id: emp.user_id, branch: emp.branch, branch_name: emp.branch_name } : null); }}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 fs-12 text-gray-700 outline-none" style={{ minWidth: '16rem' }}>
                  <option value="">— Myself ({me?.name}) —</option>
                  {employees.map((emp) => <option key={emp.user_id} value={emp.user_id}>{emp.name}{emp.branch ? ` · ${emp.branch_name || emp.branch}` : ''}</option>)}
                </select>
                {pickedEmp && <button onClick={() => setPickedEmp(null)} className="fs-11 font-semibold text-gray-500 hover:text-gray-700">Reset to myself</button>}
              </div>
            )}
            <PersonReport meetings={allMeetings} person={reportPerson} canExport={canExport} onExport={doExport} onView={setViewMtg} />
          </div>
        )}
      </div>

      {/* ===== MASTER SETUP MODAL ===== */}
      {masterOpen && <MasterModal master={master} setMaster={setMaster} categories={categories} setCategories={setCategories} meetingTypes={meetingTypes} setMeetingTypes={setMeetingTypes} persist={persist} onClose={() => setMasterOpen(false)} ping={ping} />}

      {/* ===== VIEW MEETING (sheet replica) ===== */}
      {viewMtg && <MeetingSheetModal data={viewMtg} categories={categories} canExport={canExport} onExport={doExport} onClose={() => setViewMtg(null)} />}

      {/* ===== CONFIRM (finalize) ===== */}
      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirm(null)}>
          <div className="kc-scale-in bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-lg:max-h-[90vh] max-lg:overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* header */}
            <div className="px-5 pt-5 pb-4 flex items-start gap-3">
              <span className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: SHEET_SOFT }}>
                <ClipboardList size={22} style={{ color: SHEET_DARK }} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-800 leading-tight">{confirm.title}</h3>
                <p className="fs-11 text-gray-400 mt-0.5 truncate">{confirm.meta}</p>
              </div>
              <button onClick={() => setConfirm(null)} className="ml-auto -mr-1 -mt-1 rounded-lg p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-50"><X size={16} /></button>
            </div>
            {/* summary tiles */}
            {confirm.stats && (
              <div className="px-5 grid grid-cols-3 gap-2">
                {confirm.stats.map((s) => (
                  <div key={s.label} className="rounded-xl border border-gray-100 px-2.5 py-2.5 text-center" style={{ background: '#fafbfd' }}>
                    <div className="text-lg font-bold leading-none" style={{ color: s.value ? '#1f2937' : '#c3c9d4' }}>{s.value}</div>
                    <div className="fs-9 text-gray-400 mt-1 leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            {/* note + info line */}
            <div className="px-5 pt-3 space-y-1.5">
              {confirm.note && (
                <p className="fs-11 flex items-start gap-1.5 rounded-lg px-2.5 py-2" style={{ background: 'rgba(217,119,6,0.08)', color: '#92600a' }}>
                  <AlertTriangle size={13} className="mt-px flex-shrink-0" /> {confirm.note}
                </p>
              )}
              <p className="fs-11 text-gray-400">Once finalized, the sheet is saved to History and open tasks will carry forward to the next meeting.</p>
            </div>
            {/* actions */}
            <div className="flex justify-end gap-2 px-5 py-4 mt-2 border-t border-gray-100 max-sm:flex-col max-sm:items-stretch" style={{ background: '#fafbfd' }}>
              <button onClick={() => setConfirm(null)} disabled={saving || confirmBusy} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 fs-11 font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 max-sm:w-full">Cancel</button>
              <button
                onClick={() => {
                  const r = confirm.onYes?.();
                  /* async actions (delete meeting etc.) keep the dialog open with
                     a spinner on this button until the request settles */
                  if (r && typeof r.then === 'function') {
                    setConfirmBusy(true);
                    r.finally(() => setConfirmBusy(false));
                  }
                }}
                disabled={saving || confirmBusy}
                className="kc-lift inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 fs-11 font-bold text-white disabled:opacity-60 max-sm:w-full max-sm:justify-center" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>
                {(saving || confirmBusy)
                  ? <span className="h-3 w-3 rounded-full animate-spin flex-shrink-0" style={{ border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff' }} />
                  : <CheckCircle2 size={13} />}
                {(saving || confirmBusy) ? 'Please wait…' : (confirm.yesLabel || 'Yes, finalize')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MEETING SHEET MODAL — read-only replica + Excel download
   ============================================================ */
function MeetingSheetModal({ data, categories, canExport, onExport, onClose }) {
  const catColor = (n) => (categories && categories[n]) || '#94a3b8';
  const present = useMemo(() => data.attendees.filter((a) => a.present), [data]);
  const ordered = useMemo(
    () => [...data.rows.filter((r) => r.carried), ...data.rows.filter((r) => !r.carried)],
    [data],
  );
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="kc-scale-in bg-white rounded-2xl shadow-2xl w-full max-w-7xl flex flex-col" style={{ maxHeight: '96vh' }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="mom-view-head px-4 py-3 flex items-start justify-between rounded-t-2xl border-b border-gray-100 max-md:flex-wrap max-md:gap-2" style={{ background: 'linear-gradient(120deg, #f6f7fd, #eef0fa)' }}>
          <div className="min-w-0">
            {/* row 1 — label + branch title inline */}
            <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
              <span className="fs-10 uppercase tracking-wide text-black font-semibold flex-shrink-0" style={{ letterSpacing: '0.14em' }}>Minutes of Meeting</span>
              <span className="text-l font-bold text-gray-800 leading-tight truncate min-w-0">{data.branchName}</span>
            </div>
            {/* row 2 — meta + attendees dropdown + action-flag legend, all in one line */}
            <div className="fs-12 mt-1 text-black flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {fmt(data.date)}</span>
              {data.location && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {data.location}</span>}
              <span>{data.type}</span><span>by {data.conductedBy}</span>
              {data.heads?.length > 0 && (
                <span className="inline-flex items-center gap-1"><Crown size={13} /> Head{data.heads.length > 1 ? 's' : ''}: <b>{data.heads.join(', ')}</b></span>
              )}
              <Dropdown panelClass="w-80 max-w-[90vw]"
                trigger={({ open, toggle }) => (
                  <button type="button" onClick={toggle}
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1 fs-12 font-bold"
                    style={{ borderColor: '#dfe3f2', color: INK }} title="See the attendee list">
                    <Users size={13} /> Attendees: {present.length} present
                    <ChevronDown size={12} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                )}>
                <div className="px-3 py-1.5 fs-9 font-bold uppercase tracking-wide text-black border-b border-gray-100 flex items-center justify-between gap-2">
                  <span>Attendees — present</span>
                  <span className="rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: INK }}>{present.length}</span>
                </div>
                <div className="max-h-64 overflow-y-auto kc-scroll py-1">
                  {present.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="fs-10 text-gray-400 flex-shrink-0" style={{ width: '1.4rem', textAlign: 'right' }}>{i + 1}.</span>
                      <span className="fs-11 text-gray-700 flex-1 truncate">{a.name}</span>
                      {a.branch && <span className="fs-9 font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#eef0fa', color: '#4b4e9e' }}>{a.branch}</span>}
                      {a.source === 'manual' && <span className="rounded-full px-1 fs-9 font-bold flex-shrink-0" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }} title="Manually added">M</span>}
                    </div>
                  ))}
                </div>
              </Dropdown>
              <div className="flex items-center gap-3 fs-11 text-black">
                <span className="inline-flex items-center gap-1"><FlagChip f="T" small /> Task</span>
                <span className="inline-flex items-center gap-1"><FlagChip f="I" small /> Information</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 max-md:flex-wrap">
            {canExport && <button onClick={() => onExport(data)} className="export-btn kc-lift inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 fs-11 font-bold max-sm:text-xs max-sm:px-2" style={{ borderColor: '#dfe3f2', color: INK }}><Upload size={13} /> Export Excel</button>}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* the sheet — same column order as the live table & the Excel */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <DualScroll>
            <table className="mom-sheet w-full fs-11" style={{ borderCollapse: 'collapse', minWidth: '96rem' }}>
              <thead>
                <tr style={{ background: '#f1f3fb', color: INK }}>
                  <th className="px-1 py-2 fs-11 font-bold" style={{ width: '2.4rem' }}>Sr.no</th>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '10rem' }}>Discussion Area</th>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '11rem' }}>Discussion points</th>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ width: '9rem' }}>Responsibility</th>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8rem' }}>Assigned by (Head)</th>
                  <th className="px-1 py-2 fs-10 font-bold" style={{ width: '3rem' }}>Flag</th>
                  <th className="px-1 py-2 fs-11 font-bold" style={{ width: '6rem' }}>Due Date</th>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '19rem' }}>Remarks (history)</th>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '17rem' }}>Remark/Observation/Action — {fmtDDMMYY(data.date)}</th>
                  <th className="px-1 py-2 fs-11 font-bold" style={{ width: '6rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {groupConsecutive(ordered, (r) => (r.area || '').toLowerCase()).flatMap((g, gIdx) => g.items.map((r, gi) => (
                  <tr key={r.id}>
                    {gi === 0 && <td rowSpan={g.items.length} className="px-2 py-2 text-center text-black align-middle">{gIdx + 1}</td>}
                    {gi === 0 && <td rowSpan={g.items.length} className="px-2 py-2 align-middle text-center"><span className="font-semibold text-black">{r.area}</span></td>}
                    <td className="px-2 py-2 text-black" style={{ whiteSpace: 'pre-wrap' }}>
                      {r.carried && <span className="fs-9 font-bold mr-1" style={{ color: '#b45309' }} title="Carried forward from a previous meeting">C/F</span>}
                      {r.point || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2">
                      {respArr(r.resp).length ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {respArr(r.resp).map((n) => (
                            <span key={n} className="inline-flex items-center justify-center rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: BRAND_SOFT, color: INK }}>
                              {n.split(' ')[0]}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center text-black">{r.assignedBy || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-center"><FlagChip f={r.flag} small /></td>
                    <td className="px-2 py-2 text-center text-black">{r.flag === 'T' ? fmt(r.due) : '—'}</td>
                    <td className="px-2 py-2"><RemarkHistory list={r.prevRemarks} /></td>
                    <td className="px-2 py-2 text-black" style={{ whiteSpace: 'pre-wrap' }}>{r.remark || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-center"><StatusBadge r={r} /></td>
                  </tr>
                )))}
              </tbody>
            </table>
            </DualScroll>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   HISTORY VIEW — branch sidebar + searchable, sortable table
   ============================================================ */
function HistoryView({ history, branches, onView, onDelete, canDelete, canExport, onExport, source, initialCode }) {
  /* the sidebar also lists branches that ONLY exist in history
     (e.g. manually added ones) */
  const allBranches = useMemo(() => {
    const map = new Map(branches.map((b) => [b.code, { ...b }]));
    Object.keys(history).forEach((code) => {
      /* history-only branches (e.g. manually added) appear ONLY while they
         still have meetings — never as a bare "MB-…" code with 0 meetings */
      if (map.has(code) || !(history[code] || []).length) return;
      const m = history[code][0];
      map.set(code, { code, name: m?.branches?.find((x) => x.code === code)?.name || m?.branchName || code, manual: true });
    });
    return [...map.values()];
  }, [branches, history]);

  const ALL_CODE = '__all__';
  const [code, setCode] = useState(initialCode || ALL_CODE);
  useEffect(() => { if (initialCode) setCode(initialCode); }, [initialCode]);
  useEffect(() => { if (code !== ALL_CODE && allBranches.length && !allBranches.some((b) => b.code === code)) setCode(ALL_CODE); }, [allBranches, code]);
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [asc, setAsc] = useState(false);
  useEffect(() => { setQ(''); setTypeF('all'); }, [code]);

  /* every meeting once (multi-branch meetings are filed under each branch) */
  const allMeetingsList = useMemo(() => {
    const seen = new Map();
    Object.values(history).forEach((ms) => ms.forEach((m) => { if (!seen.has(m.id)) seen.set(m.id, m); }));
    return [...seen.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [history]);

  const meetings = code === ALL_CODE ? allMeetingsList : (history[code] || []);
  const types = useMemo(() => [...new Set(meetings.map((m) => m.type).filter(Boolean))], [meetings]);
  const shown = useMemo(() => meetings
    .filter((m) => (typeF === 'all' || m.type === typeF)
      && (!q || [m.type, m.location, m.conductedBy].join(' ').toLowerCase().includes(q.toLowerCase())))
    .slice()
    .sort((a, b) => asc ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || '')),
  [meetings, q, typeF, asc]);

  /* KPI stats — tasks are attributed to the branch(es) of their RESPONSIBLE
     people (same rule as Reports), scoped to the branch picked in the dropdown */
  const rowCodes = useMemo(() => makeRowBranchCodes(buildBranchNameToCode(allBranches, allMeetingsList)), [allBranches, allMeetingsList]);
  const scopeStats = useMemo(() => {
    const inBranch = (r, m) => code === ALL_CODE || rowCodes(r, m).has(code);
    const seen = new Set();
    let tasks = 0, done = 0, wip = 0, pending = 0, overdue = 0, info = 0;
    allMeetingsList.forEach((m) => m.rows.forEach((r) => {
      if (r.flag !== 'T') { if (inBranch(r, m)) info++; return; }
      if (seen.has(r.trackId)) return;            // latest state per tracked task
      seen.add(r.trackId);
      if (!inBranch(r, m)) return;
      tasks++;
      if (r.status === 'completed') done++;
      else if (isOverdue(r)) overdue++;
      else if (r.status === 'in_progress') wip++;
      else pending++;
    }));
    return { meetings: meetings.length, tasks, info, wip, pending, done, overdue, completion: tasks ? Math.round(done / tasks * 100) : 0 };
  }, [allMeetingsList, meetings.length, code, rowCodes]);

  /* drill-down box — opened by clicking a KPI count */
  const [drill, setDrill] = useState(null);   // { filter }
  const DRILL_LABEL = { tasks: 'All tasks', done: 'Completed tasks', wip: 'WIP tasks', pending: 'Pending tasks', overdue: 'Overdue tasks', info: 'Information rows' };
  const selBranchName = code === ALL_CODE ? 'All branches' : (allBranches.find((b) => b.code === code)?.name || code);
  const drillRows = useMemo(() => {
    if (!drill) return [];
    /* same responsibility-based attribution as the KPI counts */
    const inBranch = (r, m) => code === ALL_CODE || rowCodes(r, m).has(code);
    const out = [];
    if (drill.filter === 'info') {
      allMeetingsList.forEach((m) => m.rows.forEach((r) => { if (r.flag === 'I' && inBranch(r, m)) out.push({ ...r, meeting: m }); }));
      return out;
    }
    const seen = new Set();
    allMeetingsList.forEach((m) => m.rows.forEach((r) => {
      if (r.flag !== 'T' || seen.has(r.trackId)) return;
      seen.add(r.trackId);                        // latest state per tracked task
      if (!inBranch(r, m)) return;
      out.push({ ...r, meeting: m });
    }));
    return out.filter((t) =>
      drill.filter === 'done' ? t.status === 'completed'
        : drill.filter === 'overdue' ? isOverdue(t)
          : drill.filter === 'wip' ? (t.status === 'in_progress' && !isOverdue(t))
            : drill.filter === 'pending' ? (t.status === 'pending' && !isOverdue(t))
              : true);
  }, [drill, code, allMeetingsList, rowCodes]);
  const KPI_COLS = [
    { key: 'meetings', label: 'Meetings', icon: CalendarDays, color: BRAND },
    { key: 'tasks', label: 'Tasks', icon: ListChecks, color: BRAND },
    { key: 'info', label: 'Info', icon: FileText, color: '#2563eb' },
    { key: 'wip', label: 'WIP', icon: Zap, color: '#d97706' },
    { key: 'pending', label: 'Pending', icon: ClipboardList, color: '#64748b' },
    { key: 'done', label: 'Completed', icon: CheckCircle2, color: '#059669' },
    { key: 'overdue', label: 'Overdue', icon: AlertTriangle, color: '#f87171' },
  ];

  return (
    <div className="space-y-3">
      {/* KPI boxes — counts follow the branch picked in the tab-row dropdown; click a count to see its rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {KPI_COLS.map((c) => {
          const isMeetings = c.key === 'meetings';
          const clickable = isMeetings || scopeStats[c.key] > 0;
          const active = isMeetings ? !drill : drill?.filter === c.key;
          return (
            <button key={c.key} type="button" disabled={!clickable}
              onClick={() => clickable && setDrill(isMeetings ? null : (drill?.filter === c.key ? null : { filter: c.key }))}
              style={active ? { borderColor: BRAND, boxShadow: '0 0 0 2px rgba(47,49,146,0.15)' } : {}}
              className={`kc-lift group flex items-center gap-2.5 rounded-2xl border border-gray-200 bg-white shadow-sm px-3 py-2.5 text-left ${clickable ? '' : 'cursor-default'}`}
              title={isMeetings ? 'Show the meetings list' : (clickable ? `See these ${c.label.toLowerCase()} in detail` : '')}>
              <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${c.color}1a` }}><c.icon size={14} style={{ color: c.color }} /></span>
              <span>
                <span className={`block text-lg font-extrabold text-black tabular-nums leading-none ${clickable ? 'group-hover:text-[#2f3192] group-hover:underline' : ''}`}>{scopeStats[c.key]}</span>
                <span className={`block fs-10 font-semibold text-black mt-1 ${clickable ? 'group-hover:text-[#2f3192]' : ''}`}>{c.label}</span>
              </span>
            </button>
          );
        })}
        <div className="kc-lift flex items-center gap-2.5 rounded-2xl border border-gray-200 bg-white shadow-sm px-3 py-2.5">
          <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(5,150,105,0.1)' }}><BarChart3 size={14} style={{ color: '#059669' }} /></span>
          <span className="flex-1 min-w-0"><span className="block text-lg font-extrabold text-black tabular-nums leading-none">{scopeStats.completion}%</span><span className="block fs-10 font-semibold text-black mt-1 mb-1">Completion</span><Bar2 v={scopeStats.completion} /></span>
        </div>
      </div>

    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
        {!drill && <>
        {/* toolbar: branch picker · search · type filter · sort */}
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BRAND_SOFT }}><FileText size={15} style={{ color: INK }} /></span>
            <div className="min-w-0">
              <div className="fs-13 font-bold text-gray-800 truncate flex items-center gap-1.5">
                {selBranchName}
                {source === 'error' && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171' }} title="MOM API not reachable">offline</span>}
              </div>
              <div className="fs-10 text-gray-400">{meetings.length} meeting{meetings.length === 1 ? '' : 's'} recorded{shown.length !== meetings.length ? ` · ${shown.length} shown` : ''}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canExport && shown.length > 0 && (
              <button type="button" onClick={() => exportTableExcel(`MOM_history_${selBranchName.replace(/\s+/g, '_')}`,
                ['Sr. No.', 'Date', 'Meeting type', 'Location', 'Branch(es)', 'Conducted by', 'Attendees (present)', 'Tasks done', 'Tasks total', 'Progress %'],
                shown.map((m, i) => {
                  const tasks = taskRows(m); const done = tasks.filter((r) => r.status === 'completed').length;
                  const presentN = m.attendees.filter((a) => a.present).map((a) => a.name);
                  const brName = m.branches?.length ? m.branches.map((b) => b.name || b.code).join(', ') : (m.branchName || m.branchCode);
                  return [i + 1, fmtDDMMYY(m.date), m.type || 'Meeting', m.location || '', brName, m.conductedBy || '', presentN.join(', '), done, tasks.length, progress(m)];
                })).catch(() => toast.error('Could not generate the Excel file'))}
                className={XL_BTN} title="Download this meetings list as Excel">
                <Upload size={11} /> Export Excel
              </button>
            )}
            <span className="kc-input flex items-center gap-1.5 px-2 py-1.5">
              <Search size={12} className="text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search type / location / person…" className="fs-11 bg-transparent outline-none text-gray-700" style={{ width: '11rem' }} />
            </span>
            <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="kc-input px-2 py-1.5 fs-11 text-gray-700">
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={asc ? 'asc' : 'desc'} onChange={(e) => setAsc(e.target.value === 'asc')}
              className="kc-input px-2 py-1.5 fs-11 font-semibold text-gray-700 outline-none" title="Sort meetings by date">
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
        </div>

        {source === 'loading' && <div className="p-10 text-center fs-12 text-gray-400">Loading meetings…</div>}
        {source !== 'loading' && meetings.length === 0 && <div className="p-10 text-center fs-12 text-gray-400">No meetings recorded for this branch yet — finalize one from "New meeting".</div>}
        {source !== 'loading' && meetings.length > 0 && shown.length === 0 && <div className="p-10 text-center fs-12 text-gray-400">Nothing matches the current search / filter.</div>}

        {shown.length > 0 && (
          <DualScroll>
            <table className="mom-sheet w-full fs-12" style={{ borderCollapse: 'collapse', minWidth: '62rem' }}>
              <thead>
                <tr className="text-center text-black">
                  {[['Date'], ['Meeting type & location'], ['Conducted by'], ['Attendees'], ['Tasks'], ['Progress'], ['Action']].map(([h], i) => (
                    <th key={i} className="sticky top-0 z-10 px-3 py-2 fs-10 font-bold uppercase tracking-wide" style={{ background: '#f7f8fc' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const tasks = taskRows(m);
                  const done = tasks.filter((r) => r.status === 'completed').length;
                  const open = tasks.length - done;
                  const over = tasks.filter((r) => isOverdue(r)).length;
                  const pr = progress(m);
                  const presentN = m.attendees.filter((a) => a.present).map((a) => a.name);
                  return (
                    <tr key={m.id}>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="fs-12 font-bold" style={{ color: BRAND }}>{fmtDDMMYY(m.date).replaceAll('/', '-')}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="fs-12 font-bold text-gray-800 flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="truncate" style={{ maxWidth: '10rem' }} title={m.type || 'Meeting'}>{m.type || 'Meeting'}</span>
                          {m.branches?.length > 1 && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: BRAND_SOFT, color: INK }} title={m.branches.map((b) => b.name).join(' + ')}>{m.branches.length} branches</span>}
                        </div>
                        <div className="fs-10 text-black flex items-center gap-1 min-w-0" style={{ maxWidth: '10rem' }} title={m.location || '—'}>
                          <MapPin size={9} className="flex-shrink-0" />
                          <span className="truncate min-w-0">{m.location || '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><Avatar name={m.conductedBy} size={20} /><span className="fs-11 text-gray-700 truncate" style={{ maxWidth: '8rem' }}>{m.conductedBy}</span></div></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5 min-w-0" title={presentN.join(', ')}><span className="fs-11 text-gray-700 truncate" style={{ maxWidth: '13rem' }}>{presentN.join(', ') || '—'}</span><span className="fs-9 text-gray-400 flex-shrink-0">({presentN.length})</span></div></td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="fs-12 font-bold text-gray-800">{done}<span className="fs-10 font-normal text-gray-400">/{tasks.length}</span></div>
                        <div className="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
                          {open > 0 && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: 'rgba(217,119,6,0.12)', color: '#b45309' }}>{open} open</span>}
                          {over > 0 && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: STATUS.overdue.soft, color: STATUS.overdue.color }}>{over} overdue</span>}
                          {open === 0 && tasks.length > 0 && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: 'rgba(5,150,105,0.12)', color: '#059669' }}>all closed</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" style={{ width: '7.5rem' }}>
                        <div className="flex justify-between fs-9 mb-1"><span className="text-gray-400">{pr}% closed</span></div>
                        <Bar2 v={pr} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {canExport && <button onClick={() => onExport(m)} title="Export Excel" className="export-btn rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"><Upload size={13} /></button>}
                          {canDelete && <button onClick={() => onDelete(m)} title="Delete meeting" className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-50"><Trash2 size={13} /></button>}
                          <button onClick={() => onView(m)} className="kc-lift rounded-lg px-2.5 py-1.5 fs-11 font-bold text-white" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>View sheet</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DualScroll>
        )}
        </>}

      {/* ===== DRILL-DOWN — rendered IN PLACE of the meetings list ===== */}
      {drill && (
        <>
            <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-gray-100" style={{ background: 'linear-gradient(120deg, #f6f7fd, #eef0fa)' }}>
              <div className="min-w-0">
                <div className="text-base font-bold text-gray-800 truncate">{selBranchName} — {DRILL_LABEL[drill.filter]}</div>
                <div className="fs-10 text-black">{drillRows.length} row{drillRows.length === 1 ? '' : 's'} · latest state per tracked task{code !== ALL_CODE ? ' · counted here because a responsible employee belongs to this branch' : ''} · click View to open the meeting sheet · click the Meetings box above to go back to the list</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canExport && drillRows.length > 0 && (
                  <button type="button" onClick={() => {
                    const gs = groupConsecutive(drillRows, (t) => (t.area || '').toLowerCase());
                    const isAll = code === ALL_CODE;
                    exportTableExcel(`MOM_${(DRILL_LABEL[drill.filter] || 'report').replace(/\s+/g, '_')}`,
                      ['Sr. No.', ...(isAll ? ['Branch'] : []), 'Discussion Area', 'Discussion Points', 'Category', 'Assigned by (Head)', 'Assigned to', 'Meeting', 'Due Date', 'Status', 'Remarks'],
                      gs.flatMap((g, gIdx) => g.items.map((t) => {
                        const rem = [...(t.prevRemarks || [])];
                        if (t.remark?.trim()) rem.push({ date: t.meeting.date, text: t.remark, status: t.status, by: t.assignedBy || (t.meeting.heads || [])[0] || t.meeting.conductedBy });
                        const brName = t.meeting.branches?.length ? t.meeting.branches.map((b) => b.name || b.code).join(', ') : (t.meeting.branchName || t.meeting.branchCode || '');
                        return [gIdx + 1, ...(isAll ? [brName] : []), t.area, t.point || '', t.category || '', t.assignedBy || '', respArr(t.resp).join(', '), `${t.meeting.type || 'Meeting'} · ${fmtDDMMYY(t.meeting.date)}`, t.due ? fmtDDMMYY(t.due) : '', isOverdue(t) ? 'Overdue' : (STATUS[t.status]?.label || t.status), remarksText(rem)];
                      })),
                      { mergeCols: isAll ? [0, 2] : [0, 1], groupSizes: gs.map((g) => g.items.length) }).catch(() => toast.error('Could not generate the Excel file'));
                  }}
                    className={XL_BTN} title="Download this report as Excel">
                    <Upload size={11} /> Export Excel
                  </button>
                )}
              </div>
            </div>
            <DualScroll className="overflow-x-auto kc-scroll max-h-[34rem] overflow-y-auto">
                <table className="mom-sheet w-full fs-11" style={{ borderCollapse: 'collapse', minWidth: '86rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f3fb', color: INK }}>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.6rem' }}>Sr. No.</th>
                      {code === ALL_CODE && <th className="px-2 py-2 fs-11 font-bold" style={{ width: '9rem' }}>Branch</th>}
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '9rem' }}>Discussion Area</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '11rem' }}>Discussion Points</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '7rem' }}>Category</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '10rem' }}>Assigned by (Head)</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '12rem' }}>Assigned to</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '12rem' }}>Meeting</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '7.5rem' }}>Due Date</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '7rem' }}>Status</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '14rem' }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillRows.length === 0 && <tr><td colSpan={code === ALL_CODE ? 11 : 10} className="px-3 py-6 text-center fs-12 text-gray-400">No rows in this bucket.</td></tr>}
                    {groupConsecutive(drillRows, (t) => (t.area || '').toLowerCase()).flatMap((g, gIdx) => g.items.map((t, gi) => {
                      /* all remarks on this task — carried history plus the one
                         from its latest meeting — each with date, status and head */
                      const remarks = [...(t.prevRemarks || [])];
                      if (t.remark?.trim()) remarks.push({ date: t.meeting.date, text: t.remark, status: t.status, by: t.assignedBy || (t.meeting.heads || [])[0] || t.meeting.conductedBy });
                      const brName = t.meeting.branches?.length ? t.meeting.branches.map((b) => b.name || b.code).join(', ') : (t.meeting.branchName || t.meeting.branchCode || '—');
                      return (
                        <tr key={`${t.meeting.id}-${t.trackId || t.id || gi}`}>
                          {gi === 0 && <td rowSpan={g.items.length} className="px-2 py-2 text-center text-black align-middle">{gIdx + 1}</td>}
                          {code === ALL_CODE && <td className="px-2 py-2 text-center fs-11 text-black">{brName}</td>}
                          {gi === 0 && <td rowSpan={g.items.length} className="px-2 py-2 align-middle text-center">
                            <div className="font-semibold text-black">{t.area}</div>
                          </td>}
                          <td className="px-2 py-2">
                            {t.carried && <span className="fs-9 font-bold rounded px-1 py-0.5 mr-1" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }} title="Carried forward from a previous meeting">C/F</span>}
                            {t.point ? <div className="fs-11 text-black inline" style={{ whiteSpace: 'pre-wrap' }}>{t.point}</div> : <span className="text-gray-300">—</span>}
                            <div className="fs-9 text-gray-400 mt-0.5">raised {fmt(t.originDate)}</div>
                          </td>
                          <td className="px-2 py-2 text-center text-black">{t.category || '—'}</td>
                          <td className="px-2 py-2 text-center text-black">{t.assignedBy || <span className="text-gray-300">—</span>}</td>
                          <td className="px-2 py-2">
                            {respArr(t.resp).length ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {respArr(t.resp).map((n) => (
                                  <span key={n} className="inline-flex items-center rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: BRAND_SOFT, color: INK }}>{n}</span>
                                ))}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-2">
                            <div className="fs-11 font-semibold text-black">{t.meeting.type || 'Meeting'}</div>
                            <div className="fs-9 text-gray-400">{fmt(t.meeting.date)}{t.meeting.location ? ` · ${t.meeting.location}` : ''}</div>
                            {onView && <button type="button" onClick={() => onView(t.meeting)} className="mt-1 fs-9 font-bold rounded px-1.5 py-0.5 text-white" style={{ background: BRAND }}>View</button>}
                          </td>
                          <td className="px-2 py-2 text-center text-black">
                            {t.due ? fmt(t.due) : '—'}
                            {isOverdue(t) && <div className="fs-9 font-bold" style={{ color: STATUS.overdue.color }}>{daysFromDue(t.due)}d overdue</div>}
                          </td>
                          <td className="px-2 py-2 text-center"><StatusBadge r={t} /></td>
                          <td className="px-2 py-2">
                            {remarks.length === 0 ? <span className="text-gray-300">—</span> : (
                              <div className="overflow-y-auto kc-scroll pr-1" style={{ minWidth: '14rem', maxWidth: '18rem', maxHeight: '9rem' }}>
                                <RemarkHistory list={remarks} />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
            </DualScroll>
        </>
      )}
      </div>
    </div>
  );
}

/* SVG donut arc path (clockwise), start/end in degrees from 12 o'clock */
const donutArc = (cx, cy, r, startAng, endAng) => {
  const pt = (ang) => { const a = (ang - 90) * Math.PI / 180; return `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`; };
  const large = (endAng - startAng) % 360 > 180 ? 1 : 0;
  return `M ${pt(startAng)} A ${r} ${r} 0 ${large} 1 ${pt(endAng)}`;
};

/* Detailed meeting grid (enrolled meetings / branch meetings) — full
   columns with attendees, task breakdown, and View / Excel actions. */
function MeetingGrid({ title, meetings, onView, onExport }) {
  const today = iso(new Date());
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700 flex items-center justify-between gap-2">
        <span>{title}</span>
        {onExport && meetings.length > 0 && (
          <button type="button" onClick={() => exportTableExcel(`MOM_${title.replace(/[^\w]+/g, '_')}`,
            ['Sr. No.', 'Date', 'Meeting type', 'Location', 'Branch(es)', 'Present', 'Points', 'Tasks done', 'Tasks total'],
            meetings.map((m, i) => {
              const present = (m.attendees || []).filter((a) => a.present !== false);
              const tasks = (m.rows || []).filter((r) => r.flag === 'T');
              const doneT = tasks.filter((r) => r.status === 'completed').length;
              const brName = m.branches?.length ? m.branches.map((b) => b.name || b.code).join(', ') : (m.branchName || m.branchCode);
              return [i + 1, fmtDDMMYY(m.date), m.type || 'Meeting', m.location || '', brName, present.length, (m.rows || []).length, doneT, tasks.length];
            })).catch(() => toast.error('Could not generate the Excel file'))}
            className={XL_BTN} title="Download this list as Excel">
            <Upload size={11} /> Export Excel
          </button>
        )}
      </div>
      <DualScroll className="overflow-x-auto kc-scroll max-h-[26rem] overflow-y-auto">
        <table className="mom-sheet w-full fs-11" style={{ borderCollapse: 'collapse', minWidth: '48rem' }}>
          <thead className="sticky top-0 z-10"><tr className="text-center text-black" style={{ background: '#f4f6fb' }}>
            <th className="px-3 py-2 font-semibold">Sr. No.</th>
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Location</th>
            <th className="px-3 py-2 font-semibold">Branch</th>
            <th className="px-3 py-2 font-semibold">Present</th>
            <th className="px-3 py-2 font-semibold">Points</th>
            <th className="px-3 py-2 font-semibold">Tasks</th>
            <th className="px-3 py-2 font-semibold">Action</th>
          </tr></thead>
          <tbody>
            {meetings.length === 0 && <tr><td colSpan={9} className="px-3 text-center text-gray-400" style={{ height: '8rem', verticalAlign: 'middle' }}>No meetings yet.</td></tr>}
            {meetings.map((m, idx) => {
              const present = (m.attendees || []).filter((a) => a.present !== false);
              const tasks = (m.rows || []).filter((r) => r.flag === 'T');
              const doneT = tasks.filter((r) => r.status === 'completed').length;
              const odT = tasks.filter((r) => r.status !== 'completed' && r.due && r.due < today).length;
              const brName = m.branches?.length ? m.branches.map((b) => b.name || b.code).join(', ') : (m.branchName || m.branchCode);
              return (
                <tr key={m.id} className="border-t border-gray-50">
                  <td className="px-3 py-2 text-center text-black">{idx + 1}</td>
                  <td className="px-3 py-2 font-semibold text-black whitespace-nowrap">{fmt(m.date)}</td>
                  <td className="px-3 py-2 text-black">{m.type || 'Meeting'}</td>
                  <td className="px-3 py-2 text-black truncate" style={{ maxWidth: '10rem' }} title={m.location || ''}>{m.location || '—'}</td>
                  <td className="px-3 py-2 text-black truncate" style={{ maxWidth: '10rem' }} title={brName}>{brName}</td>
                  <td className="px-3 py-2 text-center text-black" title={present.map((a) => a.name).join(', ')}>{present.length}</td>
                  <td className="px-3 py-2 text-center text-black">{(m.rows || []).length}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <span className="font-bold text-black">{doneT}/{tasks.length}</span>
                    {odT > 0 && <span className="ml-1 fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: STATUS.overdue.soft, color: STATUS.overdue.color }}>{odT} od</span>}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-center">
                    {onView && <button onClick={() => onView(m)} className="fs-10 font-bold rounded-lg text-white px-2 py-1 mr-1" style={{ background: BRAND }}>View</button>}
                    {onExport && <button onClick={() => onExport(m)} className="export-btn fs-10 font-bold rounded-lg border px-2 py-1 inline-flex items-center gap-1" title="Download this meeting's sheet as Excel"><Upload size={11} /> Excel</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DualScroll>
    </div>
  );
}

/* ============================================================
   PERSON REPORT — a single person's MOM footprint, computed
   client-side from the full meeting list:
     • meetings they were enrolled in (present attendee)
     • tasks assigned to them (owner name match), latest state
     • meetings held in their branch
     • charts: task-status donut + attendance trend
   Used for self (employee / branch admin) and, for master admin,
   for any picked employee.
   ============================================================ */
function PersonReport({ meetings, person, canExport, onExport, onView }) {
  const norm = (s) => (s || '').trim().toLowerCase();
  const data = useMemo(() => {
    const all = meetings || [];
    const attendedBy = (m) => (m.attendees || []).some((a) => a.present !== false && (
      (person.user_id && a.user_id && String(a.user_id) === String(person.user_id)) ||
      (a.name && person.name && norm(a.name) === norm(person.name))
    ));
    const inBranch = (m) => person.branch && (m.branches?.length ? m.branches.some((b) => b.code === person.branch) : m.branchCode === person.branch);
    const attended = all.filter(attendedBy).sort((a, b) => new Date(b.date) - new Date(a.date));
    const branchM = all.filter(inBranch).sort((a, b) => new Date(b.date) - new Date(a.date));

    // tasks assigned to the person, scoped to meetings they were enrolled in,
    // de-duplicated across carried meetings by trackId (keep latest state).
    const owns = (r) => r.flag === 'T' && respArr(r.resp).some((n) => norm(n) === norm(person.name));
    const byTrack = new Map();
    attended.forEach((m) => (m.rows || []).forEach((r) => {
      if (!owns(r)) return;
      const prev = byTrack.get(r.trackId);
      const rec = { ...r, meetingDate: m.date, meetingType: m.type, meetingLocation: m.location, meeting: m };
      if (!prev || new Date(m.date) > new Date(prev.meetingDate)) byTrack.set(r.trackId, rec);
    }));
    const today = iso(new Date());
    const tasks = [...byTrack.values()].sort((a, b) => new Date(b.meetingDate) - new Date(a.meetingDate));
    const isOd = (t) => t.status !== 'completed' && t.due && t.due < today;
    const done = tasks.filter((t) => t.status === 'completed').length;
    const overdue = tasks.filter(isOd).length;
    const inprog = tasks.filter((t) => t.status === 'in_progress' && !isOd(t)).length;
    const pending = tasks.length - done - overdue - inprog;

    // attendance trend — last 6 months
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }), count: 0 }); }
    const mIdx = new Map(months.map((m, i) => [m.key, i]));
    attended.forEach((m) => { const d = new Date(m.date); const k = `${d.getFullYear()}-${d.getMonth()}`; if (mIdx.has(k)) months[mIdx.get(k)].count += 1; });

    return { attended, branchM, tasks, done, overdue, inprog, pending, open: tasks.length - done, months, isOd,
      completion: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  }, [meetings, person]);

  const total = data.tasks.length;
  const seg = [
    { label: 'Completed', value: data.done, color: STATUS.completed.color },
    { label: 'Overdue', value: data.overdue, color: STATUS.overdue.color },
    { label: 'WIP', value: data.inprog, color: STATUS.in_progress.color },
    { label: 'Pending', value: data.pending, color: STATUS.pending.color },
  ];
  let ang = 0;
  const arcs = seg.filter((s) => s.value > 0).map((s) => { const sweep = (s.value / total) * 360; const a = { color: s.color, start: ang, end: ang + sweep }; ang += sweep; return a; });
  const maxMonth = Math.max(1, ...data.months.map((m) => m.count));

  const Stat = ({ label, value, color }) => (
    <div className="kc-pop-in kc-lift rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-center">
      <div className="text-xl font-bold leading-none" style={{ color: value ? (color || '#000') : '#000' }}>{value}</div>
      <div className="fs-10 font-semibold text-black mt-1 leading-tight">{label}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat label="Meetings attended" value={data.attended.length} />
        <Stat label="Branch meetings" value={data.branchM.length} />
        <Stat label="Completed" value={data.done} color={STATUS.completed.color} />
        <Stat label="Open" value={data.open} color={STATUS.in_progress.color} />
        <Stat label="Overdue" value={data.overdue} color={STATUS.overdue.color} />
        <Stat label="Completion %" value={data.completion} color={data.completion >= 70 ? STATUS.completed.color : (data.completion >= 40 ? STATUS.in_progress.color : STATUS.overdue.color)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="fs-12 font-bold text-gray-700 mb-2">Task status</div>
          {total === 0 ? <div className="fs-11 text-gray-400 py-10 text-center">No tasks assigned yet.</div> : (
            <div className="flex items-center gap-4">
              <svg width="120" height="120" viewBox="0 0 120 120" className="mom-donut flex-shrink-0">
                <circle cx="60" cy="60" r="42" fill="none" stroke="#edeff4" strokeWidth="14" />
                {arcs.length === 1
                  ? <circle cx="60" cy="60" r="42" fill="none" stroke={arcs[0].color} strokeWidth="14" />
                  : arcs.map((a, i) => <path key={i} d={donutArc(60, 60, 42, a.start, a.end)} fill="none" stroke={a.color} strokeWidth="14" />)}
                <text x="60" y="58" textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: 'var(--mom-ink)' }}>{total}</text>
                <text x="60" y="74" textAnchor="middle" style={{ fontSize: 9, fill: '#9ca3af' }}>tasks</text>
              </svg>
              <div className="space-y-1 flex-1">
                {seg.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 fs-11">
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-gray-600 flex-1">{s.label}</span>
                    <span className="font-bold text-gray-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="fs-12 font-bold text-gray-700 mb-2">Meetings attended (last 6 months)</div>
          <div className="flex items-end gap-2" style={{ height: 96 }}>
            {data.months.map((m) => (
              <div key={m.key} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="fs-9 font-bold text-gray-500">{m.count || ''}</div>
                <div className="w-full rounded-t" style={{ height: `${Math.round((m.count / maxMonth) * 70)}px`, minHeight: m.count ? 4 : 2, background: m.count ? BRAND : '#e5e7eb' }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-1">{data.months.map((m) => <div key={m.key} className="flex-1 text-center fs-9 text-gray-400">{m.label}</div>)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700 flex items-center justify-between flex-wrap gap-1">
          <span>Tasks assigned to {person.name || 'you'} ({total})</span>
          <span className="flex items-center gap-2">
            {total > 0 && <span className="fs-10 font-semibold text-gray-400">{data.done} done · {data.open} open · {data.overdue} overdue</span>}
            {canExport && total > 0 && (
              <button type="button" onClick={() => {
                const gs = groupConsecutive(data.tasks, (t) => (t.area || '').toLowerCase());
                exportTableExcel(`MOM_tasks_${(person.name || 'me').replace(/\s+/g, '_')}`,
                  ['Sr. No.', 'Discussion Area', 'Discussion Points', 'Remarks', 'Category', 'Owners', 'Meeting', 'Due Date', 'Status'],
                  gs.flatMap((g, gIdx) => g.items.map((t) => {
                    const rem = [...(t.prevRemarks || [])];
                    if (t.remark?.trim()) rem.push({ date: t.meetingDate, text: t.remark, status: t.status, by: t.assignedBy || (t.meeting?.heads || [])[0] || t.meeting?.conductedBy });
                    return [gIdx + 1, t.area, t.point || '', remarksText(rem), t.category || '', respArr(t.resp).join(', '), `${t.meetingType || 'Meeting'} · ${fmtDDMMYY(t.meetingDate)}`, t.due ? fmtDDMMYY(t.due) : '', data.isOd(t) ? 'Overdue' : (STATUS[t.status]?.label || t.status)];
                  })),
                  { mergeCols: [0, 1], groupSizes: gs.map((g) => g.items.length) }).catch(() => toast.error('Could not generate the Excel file'));
              }}
                className={XL_BTN} title="Download this table as Excel">
                <Upload size={11} /> Export Excel
              </button>
            )}
          </span>
        </div>
        <DualScroll className="overflow-x-auto kc-scroll max-h-[26rem] overflow-y-auto">
          <table className="mom-sheet w-full fs-11" style={{ borderCollapse: 'collapse', minWidth: '66rem' }}>
            <thead className="sticky top-0 z-10"><tr className="text-center text-black" style={{ background: '#f4f6fb' }}>
              <th className="px-3 py-2 font-semibold">Sr. No.</th>
              <th className="px-3 py-2 font-semibold">Discussion Area</th>
              <th className="px-3 py-2 font-semibold">Discussion Points</th>
              <th className="px-3 py-2 font-semibold">Remark</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Owners</th>
              <th className="px-3 py-2 font-semibold">Meeting</th>
              <th className="px-3 py-2 font-semibold">Due</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Action</th>
            </tr></thead>
            <tbody>
              {data.tasks.length === 0 && <tr><td colSpan={10} className="px-3 text-center text-gray-400" style={{ height: '8rem', verticalAlign: 'middle' }}>No tasks assigned.</td></tr>}
              {groupConsecutive(data.tasks, (t) => (t.area || '').toLowerCase()).flatMap((g, gIdx) => g.items.map((t, gi) => {
                const od = data.isOd(t);
                const st = od ? STATUS.overdue : (STATUS[t.status] || STATUS.pending);
                const odDays = od ? Math.max(1, Math.floor((new Date(iso(new Date())) - new Date(t.due)) / 86400000)) : 0;
                /* all remarks on this task — carried history plus the one from
                   its latest meeting — each with date, status and by whom */
                const remarks = [...(t.prevRemarks || [])];
                if (t.remark?.trim()) remarks.push({ date: t.meetingDate, text: t.remark, status: t.status, by: t.assignedBy || (t.meeting?.heads || [])[0] || t.meeting?.conductedBy });
                return (
                  <tr key={t.trackId} className="border-t border-gray-50 align-top">
                    {gi === 0 && <td rowSpan={g.items.length} className="px-3 py-2 text-center text-black align-middle">{gIdx + 1}</td>}
                    {gi === 0 && <td rowSpan={g.items.length} className="px-3 py-2 align-middle text-center"><div className="font-semibold text-black" style={{ minWidth: '9rem' }}>{t.area}</div></td>}
                    <td className="px-3 py-2">{t.point ? <div className="fs-12 text-black" style={{ minWidth: '12rem', maxWidth: '18rem', whiteSpace: 'pre-wrap' }}>{t.point}</div> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2">
                      {remarks.length === 0 ? <span className="text-gray-300">—</span> : (
                        <div className="overflow-y-auto kc-scroll pr-1" style={{ minWidth: '14rem', maxWidth: '18rem', maxHeight: '9rem' }}>
                          <RemarkHistory list={remarks} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-black whitespace-nowrap">{t.category || '—'}</td>
                    <td className="px-3 py-2 text-black" style={{ maxWidth: '11rem' }}>{respArr(t.resp).join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-black whitespace-nowrap">{t.meetingType || 'Meeting'}<div className="fs-9 text-black">{fmt(t.meetingDate)}</div></td>
                    <td className="px-3 py-2 text-black whitespace-nowrap">{t.due ? fmt(t.due) : '—'}{odDays > 0 && <div className="fs-9 font-bold" style={{ color: STATUS.overdue.color }}>{odDays}d overdue</div>}</td>
                    <td className="px-3 py-2"><span className="inline-block rounded-full px-2 py-0.5 fs-10 font-bold whitespace-nowrap" style={{ color: st.color, background: st.soft }}>{st.label}</span></td>
                    <td className="px-2 py-2 text-center">{onView && t.meeting && <button onClick={() => onView(t.meeting)} className="fs-10 font-bold rounded-lg text-white px-2 py-1" style={{ background: BRAND }}>View</button>}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </DualScroll>
      </div>

      <MeetingGrid title={`Meetings enrolled in (${data.attended.length})`} meetings={data.attended} onView={onView} onExport={canExport ? onExport : null} />
      <MeetingGrid title={`Meetings held in branch (${data.branchM.length})`} meetings={data.branchM} onView={onView} onExport={canExport ? onExport : null} />
    </div>
  );
}

/* ============================================================
   REPORTS VIEW — latest state per tracked task (no double count),
   with a branch scope filter and extra breakdowns:
   status pie · completion by branch · category split · monthly
   trend · overdue ageing · owner workload · branch summary
   ============================================================ */
function ReportsView({ history, branches, canExport, onView, onOpenBranch }) {
  const allBranches = useMemo(() => {
    const map = new Map(branches.map((b) => [b.code, { ...b }]));
    Object.keys(history).forEach((code) => {
      /* history-only branches (e.g. manually added) appear ONLY while they
         still have meetings — never as a bare "MB-…" code with 0 meetings */
      if (map.has(code) || !(history[code] || []).length) return;
      const m = history[code][0];
      map.set(code, { code, name: m?.branches?.find((x) => x.code === code)?.name || m?.branchName || code, manual: true });
    });
    return [...map.values()];
  }, [branches, history]);
  const [scope, setScope] = useState('all');

  const d = useMemo(() => {
    const inScope = (m) => scope === 'all' || (m.branches?.length ? m.branches.some((b) => b.code === scope) : m.branchCode === scope);
    /* multi-branch meetings are filed under several branches — count each once */
    const uniq = new Map();
    Object.values(history).forEach((ms) => ms.forEach((m) => { if (!uniq.has(m.id)) uniq.set(m.id, m); }));
    const all = [...uniq.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const scoped = all.filter(inScope);          // meetings held for/covering the scope branch

    /* tasks are attributed to the branch(es) of their RESPONSIBLE people —
       a task owned by employees of two branches counts for both branches */
    const rowCodes = makeRowBranchCodes(buildBranchNameToCode(allBranches, all));
    const inBranch = (r, m) => scope === 'all' || rowCodes(r, m).has(scope);

    const seen = new Set(); const latestAll = [];
    let info = 0;
    all.forEach((m) => {
      m.rows.forEach((r) => {
        if (r.flag !== 'T') { if (inBranch(r, m)) info++; return; }
        if (seen.has(r.trackId)) return;
        seen.add(r.trackId); latestAll.push({ r, m });
      });
    });
    const latest = latestAll.filter(({ r, m }) => inBranch(r, m)).map((x) => x.r);
    const completed = latest.filter((r) => r.status === 'completed').length;
    const overRows = latest.filter((r) => isOverdue(r));
    const inProg = latest.filter((r) => r.status === 'in_progress' && !isOverdue(r)).length;
    const pend = latest.filter((r) => r.status === 'pending' && !isOverdue(r)).length;

    /* tasks by category (done vs still open) */
    const catMap = {};
    latest.forEach((r) => {
      const c = r.category || 'Other';
      catMap[c] = catMap[c] || { name: c, done: 0, open: 0 };
      if (r.status === 'completed') catMap[c].done++; else catMap[c].open++;
    });

    /* meetings per month — last 6 months */
    const months = [...Array(6)].map((_, i) => {
      const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - (5 - i));
      return { key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`, name: dt.toLocaleDateString(undefined, { month: 'short' }) };
    });
    const trend = months.map((mo) => ({ name: mo.name, meetings: scoped.filter((m) => (m.date || '').startsWith(mo.key)).length }));

    /* per-owner workload (a task with 3 owners counts for each of them) */
    const own = {};
    latest.forEach((r) => respArr(r.resp).forEach((n) => {
      own[n] = own[n] || { name: n, open: 0, overdue: 0, done: 0 };
      if (r.status === 'completed') own[n].done++;
      else { own[n].open++; if (isOverdue(r)) own[n].overdue++; }
    }));
    const owners = Object.values(own).sort((a, b) => b.open - a.open || b.overdue - a.overdue).slice(0, 8);

    /* overdue ageing buckets */
    const aging = [{ name: '1–7 d', v: 0 }, { name: '8–14 d', v: 0 }, { name: '15–30 d', v: 0 }, { name: '30+ d', v: 0 }];
    overRows.forEach((r) => { const dd = daysFromDue(r.due); aging[dd <= 7 ? 0 : dd <= 14 ? 1 : dd <= 30 ? 2 : 3].v++; });

    /* completion % per branch — same responsibility-based attribution */
    const per = new Map((scope === 'all' ? allBranches : allBranches.filter((b) => b.code === scope))
      .map((b) => [b.code, { name: b.name, done: 0, tot: 0 }]));
    latestAll.forEach(({ r, m }) => rowCodes(r, m).forEach((c) => {
      const s = per.get(c); if (!s) return;
      s.tot++; if (r.status === 'completed') s.done++;
    }));
    const compBar = [...per.values()].map((b) => ({ name: b.name, completion: b.tot ? Math.round(b.done / b.tot * 100) : 0 }));

    return {
      meetings: scoped.length,
      completion: latest.length ? Math.round(completed / latest.length * 100) : 0,
      open: latest.length - completed,
      overdue: overRows.length,
      info,
      avg: scoped.length ? (latest.length / scoped.length).toFixed(1) : '0',
      pie: [
        { name: 'Completed', value: completed, color: '#059669' },
        { name: 'WIP', value: inProg, color: '#d97706' },
        { name: 'Pending', value: pend, color: '#64748b' },
        { name: 'Overdue', value: overRows.length, color: '#f87171' },
      ],
      cats: Object.values(catMap).sort((a, b) => (b.done + b.open) - (a.done + a.open)),
      trend, owners, aging, compBar,
    };
  }, [history, allBranches, scope]);

  const KPI = ({ icon: Icon, label, value, color, hint }) => (
    <div className="kc-lift flex items-center gap-3 rounded-2xl border border-gray-200 bg-white shadow-sm px-3.5 py-3" title={hint || ''}>
      <span className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}><Icon size={19} style={{ color }} /></span>
      <div><div className="text-xl font-extrabold text-gray-800 tabular-nums leading-none">{value}</div><div className="fs-10 text-gray-500 mt-1">{label}</div></div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* scope */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="fs-12 font-bold text-gray-700 flex items-center gap-2">
          <BarChart3 size={15} style={{ color: INK }} /> Detailed reports
        </div>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="kc-input px-2.5 py-1.5 fs-11 font-semibold text-gray-700">
          <option value="all">All branches</option>
          {allBranches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
      </div>

      {/* KPI grid — one row of six */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <KPI icon={CalendarDays} label="Total meetings" value={d.meetings} color={BRAND} />
        <KPI icon={CheckCircle2} label="Task completion" value={`${d.completion}%`} color="#059669" />
        <KPI icon={ListChecks} label="Open tasks" value={d.open} color="#d97706" />
        <KPI icon={AlertTriangle} label="Overdue tasks" value={d.overdue} color="#f87171" />
        <KPI icon={FileText} label="Information shared" value={d.info} color="#2563eb" hint="Information rows across all meetings" />
        <KPI icon={Zap} label="Avg tasks / meeting" value={d.avg} color="#b45309" />
      </div>

      {/* charts — row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Tasks by status <span className="fs-10 font-normal text-gray-400">(latest state per task)</span></div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart><Pie data={d.pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>{d.pie.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie><Tooltip {...TIP_PROPS} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Task completion % by branch</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.compBar} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9 }} />
              <Tooltip {...TIP_PROPS} formatter={(v) => `${v}%`} /><Bar dataKey="completion" radius={[0, 4, 4, 0]} fill={BRAND} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* charts — row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Tasks by category <span className="fs-10 font-normal text-gray-400">(done vs still open)</span></div>
          {d.cats.length === 0 ? (
            <div className="flex items-center justify-center fs-11 text-gray-400" style={{ height: 210 }}>No tasks recorded yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={d.cats} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={78} tick={{ fontSize: 9 }} />
                <Tooltip {...TIP_PROPS} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="done" name="Completed" stackId="a" fill="#059669" />
                <Bar dataKey="open" name="Open" stackId="a" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Meetings per month <span className="fs-10 font-normal text-gray-400">(last 6 months)</span></div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={d.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip {...TIP_PROPS} /><Bar dataKey="meetings" name="Meetings" fill={BRAND} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* charts — row 3: ageing + owner workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Overdue ageing <span className="fs-10 font-normal text-gray-400">(days past due date)</span></div>
          {d.overdue === 0 ? (
            <div className="flex flex-col items-center justify-center fs-11 text-gray-400" style={{ height: 210 }}>
              <CheckCircle2 size={22} className="mb-1" style={{ color: '#059669' }} /> No overdue tasks right now.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={d.aging}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip {...TIP_PROPS} /><Bar dataKey="v" name="Overdue tasks" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700 flex items-center justify-between gap-2">
            <span>Responsibility workload <span className="fs-10 font-normal text-gray-400">(top owners by open tasks)</span></span>
            {canExport && d.owners.length > 0 && (
              <button type="button" onClick={() => exportTableExcel('MOM_responsibility_workload',
                ['Sr. No.', 'Person', 'Open', 'Overdue', 'Completed'],
                d.owners.map((o, i) => [i + 1, o.name, o.open, o.overdue, o.done])).catch(() => toast.error('Could not generate the Excel file'))}
                className={XL_BTN} title="Download this table as Excel">
                <Upload size={11} /> Export Excel
              </button>
            )}
          </div>
          {d.owners.length === 0 ? (
            <div className="p-8 text-center fs-11 text-gray-400">No tasks assigned yet.</div>
          ) : (
            <DualScroll>
              <table className="w-full fs-12" style={{ minWidth: '26rem' }}>
                <thead>
                  <tr className="text-left text-gray-500" style={{ background: '#f7f8fc' }}>
                    <th className="px-3 py-1.5 fs-10 font-bold uppercase tracking-wide">Person</th>
                    <th className="px-3 py-1.5 fs-10 font-bold uppercase tracking-wide text-center">Open</th>
                    <th className="px-3 py-1.5 fs-10 font-bold uppercase tracking-wide text-center">Overdue</th>
                    <th className="px-3 py-1.5 fs-10 font-bold uppercase tracking-wide text-center">Done</th>
                    <th className="px-3 py-1.5 fs-10 font-bold uppercase tracking-wide" style={{ width: '7rem' }}>Closure</th>
                  </tr>
                </thead>
                <tbody>
                  {d.owners.map((o) => (
                    <tr key={o.name} style={{ borderTop: '1px solid #f6f6f9' }}>
                      <td className="px-3 py-1.5"><div className="flex items-center gap-1.5"><Avatar name={o.name} size={20} /><span className="font-medium text-gray-800 truncate" style={{ maxWidth: '9rem' }}>{o.name}</span></div></td>
                      <td className="px-3 py-1.5 text-center font-semibold" style={{ color: o.open ? '#b45309' : '#9ca3af' }}>{o.open}</td>
                      <td className="px-3 py-1.5 text-center">{o.overdue > 0 ? <span className="font-semibold text-red-400">{o.overdue}</span> : <span className="text-gray-300">0</span>}</td>
                      <td className="px-3 py-1.5 text-center text-gray-600">{o.done}</td>
                      <td className="px-3 py-1.5"><Bar2 v={Math.round(o.done / Math.max(1, o.done + o.open) * 100)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DualScroll>
          )}
        </div>
      </div>

    </div>
  );
}

/* ============================================================
   MASTER SETUP MODAL — discussion areas & categories
   ============================================================ */
function MasterModal({ master, setMaster, categories, setCategories, meetingTypes, setMeetingTypes, persist, onClose, ping }) {
  const [tab, setTab] = useState('points');
  const [title, setTitle] = useState('');
  const catKeys = Object.keys(categories);
  const [cat, setCat] = useState(catKeys[0]);
  const [newCat, setNewCat] = useState('');
  const [newColor, setNewColor] = useState(NEW_CAT_COLORS[0]);
  const [newType, setNewType] = useState('');
  const [busyAdd, setBusyAdd] = useState(false);   // an Add request is in flight → spinner on the button

  const fail = (e, msg) => ping(e?.response?.data?.detail || msg, 'err');

  const add = async () => {
    const t = title.trim(); if (!t) return;
    setBusyAdd(true);
    try {
      if (persist) {
        const item = await persist.addPoint(t, cat);
        setMaster((p) => [...p, { id: String(item.id), title: item.title, category: item.category }]);
      } else setMaster((p) => [...p, { id: uid('m'), title: t, category: cat }]);
      setTitle(''); ping('Master point added');
    } catch (e) { fail(e, 'Could not add the point'); }
    finally { setBusyAdd(false); }
  };
  const rename = (id, v) => setMaster((p) => p.map((x) => x.id === id ? { ...x, title: v } : x));
  const commitTitle = (id) => {
    if (!persist) return;
    const pt = master.find((x) => x.id === id);
    if (pt?.title.trim()) persist.updatePoint(id, { title: pt.title.trim() }).catch((e) => fail(e, 'Could not save the title'));
  };
  const recat = (id, v) => {
    setMaster((p) => p.map((x) => x.id === id ? { ...x, category: v } : x));
    if (persist) persist.updatePoint(id, { category: v }).catch((e) => fail(e, 'Could not save the category'));
  };
  const remove = async (id) => {
    try {
      if (persist) await persist.deletePoint(id);
      setMaster((p) => p.filter((x) => x.id !== id));
    } catch (e) { fail(e, 'Could not delete the point'); }
  };

  const addCat = async () => {
    const n = newCat.trim(); if (!n) return;
    if (categories[n]) return ping('Category already exists', 'err');
    setBusyAdd(true);
    try {
      if (persist) await persist.addCategory(n, newColor);
      setCategories((c) => ({ ...c, [n]: newColor })); setNewCat('');
      setNewColor(NEW_CAT_COLORS[(catKeys.length + 1) % NEW_CAT_COLORS.length]); ping('Category added');
    } catch (e) { fail(e, 'Could not add the category'); }
    finally { setBusyAdd(false); }
  };
  const setCatColor = (n, v) => setCategories((c) => ({ ...c, [n]: v }));
  const commitColor = (n) => {
    if (persist) persist.updateCategory(n, categories[n]).catch((e) => fail(e, 'Could not save the colour'));
  };
  const removeCat = async (n) => {
    const rest = catKeys.filter((k) => k !== n);
    if (!rest.length) return ping('Keep at least one category', 'err');
    const fallback = rest[0];
    try {
      if (persist) await persist.deleteCategory(n);
      setMaster((p) => p.map((x) => x.category === n ? { ...x, category: fallback } : x));
      setCategories((c) => { const { [n]: _drop, ...others } = c; return others; });
      ping(`Category removed — its points moved to ${fallback}`);
    } catch (e) { fail(e, 'Could not delete the category'); }
  };

  const addType = async () => {
    const n = newType.trim(); if (!n) return;
    if (meetingTypes.some((t) => t.name.toLowerCase() === n.toLowerCase())) return ping('Meeting type already exists', 'err');
    setBusyAdd(true);
    try {
      if (persist) {
        const item = await persist.addMeetingType(n);
        setMeetingTypes((p) => [...p, { id: item.id, name: item.name }]);
      } else setMeetingTypes((p) => [...p, { id: uid('mt'), name: n }]);
      setNewType(''); ping('Meeting type added');
    } catch (e) { fail(e, 'Could not add the meeting type'); }
    finally { setBusyAdd(false); }
  };
  const removeType = async (t) => {
    try {
      if (persist) await persist.deleteMeetingType(t.id);
      setMeetingTypes((p) => p.filter((x) => x.id !== t.id));
    } catch (e) { fail(e, 'Could not delete the meeting type'); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="kc-scale-in bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '86vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="mom-view-head px-4 py-3 flex items-center justify-between rounded-t-2xl border-b border-gray-100" style={{ background: 'linear-gradient(120deg, #f6f7fd, #eef0fa)' }}>
          <div>
            <div className="text-sm font-bold text-gray-800">Master setup</div>
            <div className="fs-10 text-gray-400">Discussion areas pre-filled into every new meeting sheet</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-2 border-b border-gray-100 max-sm:overflow-x-auto">
          {[['points', `Discussion areas (${master.length})`], ['cats', `Categories (${catKeys.length})`], ['types', `Meeting types (${meetingTypes.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="rounded-t-md px-3 py-2 fs-12 font-semibold transition" style={tab === k ? { color: BRAND, borderBottom: `2px solid ${BRAND}` } : { color: '#9ca3af' }}>{l}</button>
          ))}
        </div>

        {tab === 'points' ? (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 max-sm:flex-wrap" style={{ background: '#fafafc' }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a new discussion area…" className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 fs-12 outline-none" />
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 fs-12 bg-white outline-none">{catKeys.map((c) => <option key={c}>{c}</option>)}</select>
              <button onClick={add} disabled={busyAdd} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ background: BRAND }}>{busyAdd ? <span className="h-3 w-3 rounded-full animate-spin" style={{ border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff' }} /> : <Plus className="h-3.5 w-3.5" />} {busyAdd ? 'Adding…' : 'Add'}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {master.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                  <input value={p.title} onChange={(e) => rename(p.id, e.target.value)} onBlur={() => commitTitle(p.id)} className="flex-1 fs-12 text-gray-800 bg-transparent outline-none border-b border-transparent focus:border-gray-200 py-0.5" />
                  <select value={p.category} onChange={(e) => recat(p.id, e.target.value)} className="rounded-md border border-gray-200 px-1.5 py-1 fs-11 font-bold text-gray-600 bg-white outline-none">{catKeys.map((c) => <option key={c}>{c}</option>)}</select>
                  <button onClick={() => remove(p.id)} className="text-black hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between max-md:flex-wrap max-md:gap-2">
              <span className="fs-10 text-gray-400">{master.length} areas · changes apply to new meetings</span>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Done</button>
            </div>
          </>
        ) : tab === 'cats' ? (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 max-sm:flex-wrap" style={{ background: '#fafafc' }}>
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCat()} placeholder="Add a new category…" className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 fs-12 outline-none" />
              <button onClick={addCat} disabled={busyAdd} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ background: BRAND }}>{busyAdd ? <span className="h-3 w-3 rounded-full animate-spin" style={{ border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff' }} /> : <Plus className="h-3.5 w-3.5" />} {busyAdd ? 'Adding…' : 'Add'}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {catKeys.map((name) => {
                const used = master.filter((p) => p.category === name).length;
                return (
                  <div key={name} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                    <span className="flex-1 fs-12 font-medium text-gray-800">{name}</span>
                    <span className="fs-10 text-gray-400">{used} point{used === 1 ? '' : 's'}</span>
                    <button onClick={() => removeCat(name)} className="text-black hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between max-md:flex-wrap max-md:gap-2">
              <span className="fs-10 text-gray-400">Deleting a category moves its points to another one</span>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 max-sm:flex-wrap" style={{ background: '#fafafc' }}>
              <input value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addType()} placeholder="Add a new meeting type…" className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 fs-12 outline-none" />
              <button onClick={addType} disabled={busyAdd} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white inline-flex items-center gap-1 disabled:opacity-60" style={{ background: BRAND }}>{busyAdd ? <span className="h-3 w-3 rounded-full animate-spin" style={{ border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff' }} /> : <Plus className="h-3.5 w-3.5" />} {busyAdd ? 'Adding…' : 'Add'}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {meetingTypes.length === 0 && <div className="px-3 py-6 text-center fs-11 text-gray-400">No meeting types yet — add one above.</div>}
              {meetingTypes.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                  <span className="flex-1 fs-12 font-medium text-gray-800">{t.name}</span>
                  <button onClick={() => removeType(t)} className="text-black hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between max-md:flex-wrap max-md:gap-2">
              <span className="fs-10 text-gray-400">These types appear in the Meeting-type dropdown on New meeting</span>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}