import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ClipboardList, Building2, Plus, Trash2, CheckCircle2,
  AlertTriangle, CalendarDays, Users, X, CornerUpRight, Flag,
  BarChart3, Check, User, ListChecks, Zap, ChevronRight, ChevronLeft,
  ChevronDown, FileText, MapPin, UserPlus, Download, Search, Lock,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import * as XLSX from 'xlsx-js-style';

/* ============================================================
   THEME — everything on screen follows the Kala Care system
   brand (indigo). The Excel export now uses the same indigo
   header styling (the old green fill is gone).
   ============================================================ */
const BRAND = '#2f3192';
const BRAND_DARK = '#23255f';
const BRAND_SOFT = 'rgba(47,49,146,0.10)';
const SHEET = BRAND;                // sheet chrome = system brand
const SHEET_DARK = BRAND_DARK;
const SHEET_SOFT = BRAND_SOFT;

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;      // already ends in /api
const MOM_API = `${API_BASE_URL}/mom`;

/* Row status (Task rows only — Information rows have no status) */
const STATUS = {
  pending: { label: 'Pending', color: '#64748b', soft: 'rgba(100,116,139,0.12)' },
  in_progress: { label: 'In Progress', color: '#d97706', soft: 'rgba(217,119,6,0.12)' },
  completed: { label: 'Completed', color: '#059669', soft: 'rgba(5,150,105,0.12)' },
  overdue: { label: 'Overdue', color: '#dc2626', soft: 'rgba(220,38,38,0.12)' },
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

/* Suggested types — the select also has an "Other — type manually…" option */
const MEETING_TYPES = ['Monthly Branch Review', 'Weekly Sync', 'Special / Ad-hoc'];

/* Column widths of the two sheet tables (kept in sync with the
   top scrollbar strip above the main table) */
const SHEET_MINW = '80rem';
const CARRY_MINW = '78rem';

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
const daysFromDue = (due) => Math.round((today0() - new Date(due)) / 86400000); // +ve = overdue
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

function exportMeetingExcel(m, brandColor = BRAND) {
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
  const ST_COLOR = { completed: '059669', in_progress: 'B45309', pending: '64748B', overdue: 'DC2626' };
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

  /* remark-history columns: one per unique past review date */
  const histDates = [...new Set(m.rows.flatMap((r) => (r.prevRemarks || []).map((p) => p.date)))].sort();
  const FIXED = 5; // Discussion Area … Due Date
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
    ['Branch(es):', branchNames], ['Meeting Type:', m.type || ''],
    ['Conducted By:', m.conductedBy || ''],
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
  const head = ['Discussion Area', 'Discussion points', 'Responsibility', 'Action flag', 'Due Date',
    ...histDates.map((d) => `Remarks - ${fmtDDMMYY(d)}`), `Remarks - ${fmtDDMMYY(m.date)}`, 'Status'];
  const headRow = head.map((h) => txt(h, S.head));
  while (headRow.length < totalCols) headRow.push(txt('', S.head));
  push(headRow);

  /* Table body — carried rows first, then fresh; zebra shading */
  const ordered = [...m.rows.filter((r) => r.carried), ...m.rows.filter((r) => !r.carried)];
  ordered.forEach((r, i) => {
    const alt = i % 2 === 1;
    const isT = r.flag === 'T';
    const od = isT && r.status !== 'completed' && r.due && new Date(r.due) < today0();
    const stKey = !isT ? null : od ? 'overdue' : r.status;
    const row = [
      txt(r.area + (r.carried ? '  (C/F)' : ''), r.carried ? { ...cell(alt), font: { ...cell(alt).font, bold: true, color: { rgb: 'B45309' } } } : cell(alt)),
      txt(r.point, cell(alt)),
      txt(respArr(r.resp).join(', ') || (isT ? '' : '-'), cell(alt)),
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
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 26 }, { wch: 40 }, { wch: 24 }, { wch: 9 }, { wch: 12 },
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
  : <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: BRAND }}><User size={9} /> Employee</span>);
const CatDot = React.memo(({ color, title }) => <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color || '#94a3b8' }} title={title} />);
/* initials avatar — deterministic colour per name */
const AVATAR_HUES = ['#2f3192', '#0d9488', '#d97706', '#7c3aed', '#0ea5e9', '#e11d48', '#059669', '#b45309'];
const Avatar = React.memo(({ name, size = 22 }) => {
  const c = AVATAR_HUES[(name || '?').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_HUES.length];
  const init = (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42), background: c }}>{init}</span>;
});
/* overlapping avatar strip (History table) */
const AvatarStack = React.memo(({ names = [], max = 4 }) => (
  <span className="flex items-center">
    {names.slice(0, max).map((n, i) => (
      <span key={`${n}${i}`} className="rounded-full ring-2 ring-white" style={{ marginLeft: i ? -6 : 0 }}><Avatar name={n} size={20} /></span>
    ))}
    {names.length > max && <span className="ml-1 fs-9 font-bold text-gray-400">+{names.length - max}</span>}
  </span>
));
const Bar2 = React.memo(({ v }) => (
  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#eef0f3' }}>
    <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? '#059669' : v >= 40 ? '#d97706' : '#dc2626', transition: 'width .3s' }} />
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
    {[['pending', 'Pending'], ['in_progress', 'In prog'], ['completed', 'Done']].map(([k, lbl]) => (
      <button key={k} type="button" onClick={() => onChange(k)} className="px-2 py-1 fs-10 font-semibold transition"
        style={value === k ? { background: STATUS[k].color, color: '#fff' } : { color: '#9ca3af', background: '#fff' }}>{lbl}</button>
    ))}
  </div>
);
/* legend card — mirrors the "Action Flag" box on the sheet */
const FlagLegend = React.memo(() => (
  <div className="rounded-xl border border-gray-200 bg-white p-3">
    <div className="fs-10 font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Flag size={11} /> Action Flag</div>
    <div className="space-y-1">
      <div className="flex items-center gap-2 fs-11"><FlagChip f="T" small /><span className="text-gray-600">Task — owner(s), due date &amp; status</span></div>
      <div className="flex items-center gap-2 fs-11"><FlagChip f="I" small /><span className="text-gray-600">Information — can be assigned to people, no due date</span></div>
    </div>
  </div>
));
/* previous remarks chips (the accumulating "Remarks - date" columns) */
const RemarkHistory = React.memo(({ list }) => !list?.length ? <span className="fs-10 text-gray-300">—</span> : (
  <div className="space-y-1">
    {list.map((p, i) => (
      <div key={i} className="fs-10 leading-snug">
        <span className="inline-block rounded px-1.5 py-0.5 font-bold mr-1.5" style={{ background: '#f1f5f9', color: '#475569' }}>{fmtDDMMYY(p.date)}</span>
        <span className="text-gray-600">{p.text || <i className="text-gray-400">status: {STATUS[p.status]?.label}</i>}</span>
      </div>
    ))}
  </div>
));

/* ============================================================
   EXPORT COLOUR MODAL — pick the Excel theme colour just before
   the file is generated (presets + free colour picker).
   ============================================================ */
const EXPORT_PRESETS = [
  ['#2f3192', 'Kala indigo'], ['#0d9488', 'Teal'], ['#059669', 'Green'],
  ['#d97706', 'Amber'], ['#f59e0b', 'Amber gold'], ['#7c3aed', 'Purple'],
  ['#1d4ed8', 'Blue'], ['#475569', 'Slate'],
];
function ExportColorModal({ onExport, onClose }) {
  const [color, setColor] = useState(BRAND);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}>
            <Download size={18} style={{ color }} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-800 leading-tight">Export to Excel</h3>
            <p className="fs-11 text-gray-400 mt-0.5">Pick the colour used for the title band &amp; table header</p>
          </div>
          <button onClick={onClose} className="ml-auto -mr-1 -mt-1 rounded-lg p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-50"><X size={16} /></button>
        </div>
        <div className="px-5 pb-1">
          <div className="grid grid-cols-4 gap-2">
            {EXPORT_PRESETS.map(([c, label]) => (
              <button key={c} type="button" onClick={() => setColor(c)} title={label}
                className="rounded-xl p-1.5 flex flex-col items-center gap-1 transition"
                style={color.toLowerCase() === c ? { border: `1.5px solid ${c}`, background: `${c}0d` } : { border: '1.5px solid #e6e9f0' }}>
                <span className="h-6 w-full rounded-lg flex items-center justify-center" style={{ background: c }}>
                  {color.toLowerCase() === c && <Check size={12} color="#fff" />}
                </span>
                <span className="fs-9 text-gray-500 truncate w-full text-center">{label}</span>
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 rounded cursor-pointer border-0 bg-transparent p-0" />
            <span className="fs-11 text-gray-600 font-semibold">Custom colour…</span>
            <span className="ml-auto fs-10 font-mono text-gray-400 uppercase">{color}</span>
          </label>
          {/* mini preview of the sheet band */}
          <div className="mt-3 rounded-lg overflow-hidden border border-gray-100">
            <div className="py-1.5 text-center fs-10 font-bold text-white" style={{ background: color }}>Minutes of Meeting</div>
            <div className="py-1 text-center fs-9 text-white/80" style={{ background: `#${shadeHex(color, -0.25)}` }}>Branch · Date · Type</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 mt-3 border-t border-gray-100" style={{ background: '#fafbfd' }}>
          <button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 fs-12 font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onExport(color)} className="kc-lift inline-flex items-center gap-1.5 rounded-lg px-4 py-2 fs-12 font-bold text-white" style={{ background: `linear-gradient(120deg, ${color}, #${shadeHex(color, -0.25)})` }}>
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>
    </div>
  );
}

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
              <span key={n} className="inline-flex items-center gap-1 rounded-full pl-0.5 pr-1.5 py-0.5 fs-10 font-semibold" style={{ background: BRAND_SOFT, color: BRAND }}>
                <Avatar name={n} size={14} /><span className="truncate" style={{ maxWidth: '5.5rem' }}>{n.split(' ')[0]}</span>
              </span>
            ))}
            {value.length > 2 && <span className="fs-10 font-bold" style={{ color: BRAND }}>+{value.length - 2}</span>}
          </span>
        )}
        <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && pos && (
        <div ref={popRef} className="fixed z-[80] rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
          style={{ left: pos.left, top: pos.top, width: pos.width, ...(pos.up ? { transform: 'translateY(-100%)' } : {}) }}>
          <div className="px-2.5 py-1.5 fs-9 font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100 flex items-center justify-between">
            <span>Assign responsibility</span>
            <span className="rounded-full px-1.5 py-0.5" style={{ background: BRAND_SOFT, color: BRAND }}>{value.length}</span>
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

const FontScale = React.memo(() => <style>{`@keyframes livedot{0%,100%{opacity:1}50%{opacity:.35}} @keyframes pop{0%{transform:scale(.4)}70%{transform:scale(1.2)}100%{transform:scale(1)}} .kc-pop{animation:pop .18s ease-out} .kc-lift{transition:transform .15s ease,box-shadow .15s ease} .kc-lift:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(35,37,95,.35)} .kc-input{background:#f7f8fc;border:1.5px solid #e6e9f0;border-radius:10px;transition:border-color .15s,box-shadow .15s,background .15s} .kc-input:focus,.kc-input:focus-within{background:#fff;border-color:#2f3192;box-shadow:0 0 0 3px rgba(47,49,146,.10);outline:none} .kc-grid{background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 1px,transparent 1px 13px),repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 1px,transparent 1px 13px)} .kc-scroll::-webkit-scrollbar{height:6px;width:6px} .kc-scroll::-webkit-scrollbar-thumb{background:#d5d9e6;border-radius:8px} .kc-scroll::-webkit-scrollbar-thumb:hover{background:#bfc5d8} .kc-scroll::-webkit-scrollbar-track{background:transparent} .fs-9{font-size:9px;line-height:1.3} .fs-10{font-size:10px;line-height:1.35} .fs-11{font-size:11px;line-height:1.4} .fs-12{font-size:12px;line-height:1.45} .fs-13{font-size:13px;line-height:1.45} .mom-sheet td,.mom-sheet th{border:1px solid #e2e8f0} .mom-sheet thead th{text-align:center;vertical-align:middle} .mom-sheet input,.mom-sheet select,.mom-sheet textarea{background:transparent;border-radius:6px;transition:box-shadow .12s,background .12s} .mom-sheet input:hover,.mom-sheet select:hover,.mom-sheet textarea:hover{background:#f6f8fc} .mom-sheet input:focus,.mom-sheet select:focus,.mom-sheet textarea:focus{background:#fff;box-shadow:inset 0 0 0 1.5px ${BRAND}55} .mom-sheet tbody tr:nth-child(even){background:#fbfcfe} .mom-sheet tbody tr:hover{background:#f2f6ff} .mom-sheet .no-ring:focus{box-shadow:none;background:#fff}`}</style>);

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function MOMTracking() {
  /* who is logged in (used for employees API + "Conducted by") */
  const me = useMemo(() => { try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; } }, []);
  const authHeaders = useMemo(() => (me?.user_id ? { 'user-id': me.user_id, 'user-role': me.role || '' } : {}), [me]);
  /* Excel export permission — Master Admin always, others via can_export on the users table */
  const canExport = me?.role === 'master_admin' || me?.can_export === true;

  const [master, setMaster] = useState(DEFAULT_MASTER);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [history, setHistory] = useState({});
  const [view, setView] = useState('new');            // new | history | reports

  // Deep-link support: the ERP Sitemap opens a specific view or the masters
  // box via router state — navigate('/mom-tracking', { state: { openView:
  // 'reports' } }) or { state: { openMasters: true } }. The state is consumed
  // immediately so a refresh doesn't re-apply it.
  const routerLocation = useLocation();
  const routerNavigate = useNavigate();
  useEffect(() => {
    const s = routerLocation.state;
    if (!s) return;
    if (s.openView) setView(s.openView);
    if (s.openMasters) setMasterOpen(true);
    if (s.openView || s.openMasters) {
      routerNavigate(routerLocation.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);
  const [masterOpen, setMasterOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [viewMtg, setViewMtg] = useState(null);
  const [histSource, setHistSource] = useState('loading'); // loading | api | error
  const [saving, setSaving] = useState(false);
  const [showAllAtt, setShowAllAtt] = useState(false);   // attendee strip: collapsed by default
  const topScrollRef = useRef(null);      // synced horizontal scrollbar shown ABOVE the sheet
  const mainScrollRef = useRef(null);

  /* ---- employees from backend ---- */
  const [employees, setEmployees] = useState([]);
  const [empSource, setEmpSource] = useState('loading'); // loading | api | error
  useEffect(() => {
    let alive = true;
    if (!me?.user_id || !API_BASE_URL) { setEmpSource('error'); return; }
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

  /* ---- meeting setup (Step 1 — "set all this before starting") ---- */
  const [step, setStep] = useState(1);                // 1 setup · 2 meeting sheet
  const [branches, setBranches] = useState([]);       // MULTI-select — one or more branches per meeting
  const [manualBranches, setManualBranches] = useState([]);  // branches typed in by the admin
  const [manualBranch, setManualBranch] = useState('');
  const [mDate, setMDate] = useState(iso(new Date()));  // mandatory — defaults to today
  const [mLocation, setMLocation] = useState('');
  const [mType, setMType] = useState(MEETING_TYPES[0]);
  const [attendees, setAttendees] = useState([]);
  const [manualName, setManualName] = useState('');
  const [pickBr, setPickBr] = useState('all');        // "Add from employees" picker
  const [pickEmp, setPickEmp] = useState('');
  const [picked, setPicked] = useState(new Set());    // which master points to discuss

  const isCustomType = !MEETING_TYPES.includes(mType);
  const branchLabel = useMemo(() => branches.map((b) => b.name).join(' + '), [branches]);

  const togglePick = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickAll = () => setPicked(new Set(master.map((p) => p.id)));
  const pickNone = () => setPicked(new Set());

  /* ---- meeting sheet (Step 2) ---- */
  const [rows, setRows] = useState([]);               // current discussion rows
  const [carry, setCarry] = useState([]);             // pending tasks from previous meetings
  const [newArea, setNewArea] = useState('');
  const [newCat, setNewCat] = useState('Other');

  const ping = (msg, type = 'ok') => (type === 'err' ? toast.error(msg) : toast.success(msg));
  const catColor = (n) => categories[n] || '#94a3b8';

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

  /* employees belonging to one branch */
  const branchEmployees = (b) => {
    if (!b) return [];
    if (b.manual) return [];   // manually added branches have no employees on file
    if (empSource === 'api') return employees.filter((e) => e.branch === b.code || e.branch_name === b.name).map((e) => ({ name: e.name, user_id: e.user_id }));
    return [];
  };

  /* every employee of every branch — feeds the "Add from employees"
     picker (step 1) and the "Employee joined? Select…" control (step 2) */
  const allEmployees = useMemo(() => {
    if (empSource === 'api') return employees.map((e) => ({ name: e.name, user_id: e.user_id, branch: e.branch, branchName: e.branch_name || e.branch }));
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empSource, employees]);
  const remainingEmployees = useMemo(() => {
    const inAtt = new Set(attendees.map((a) => a.name.toLowerCase()));
    const seen = new Set(); const out = [];
    allEmployees.forEach((e) => {
      const k = e.name.toLowerCase();
      if (inAtt.has(k) || seen.has(k)) return;
      seen.add(k);
      out.push({ ...e, key: `${e.name}|${e.branch || ''}` });
    });
    return out;
  }, [allEmployees, attendees]);
  const pickable = useMemo(() => remainingEmployees.filter((e) => pickBr === 'all' || e.branch === pickBr), [remainingEmployees, pickBr]);

  const allBranchOptions = useMemo(() => {
    const seen = new Set(branchOptions.map((b) => b.code));
    return [...branchOptions, ...manualBranches.filter((b) => !seen.has(b.code))];
  }, [branchOptions, manualBranches]);

  /* what will carry forward from the selected branches */
  const carryPreview = useMemo(() => (branches.length ? collectCarry(history, branches.map((b) => b.code)).length : 0), [branches, history]);
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
  const toggleBranch = (b) => {
    const on = branches.some((x) => x.code === b.code);
    const next = on ? branches.filter((x) => x.code !== b.code) : [...branches, b];
    setBranches(next);
    syncAttendees(next);
    if (branches.length === 0 && next.length === 1) setPicked(new Set(master.map((p) => p.id)));  // first branch → all points pre-ticked
    setRows([]); setCarry([]);                       // selection changed → discard previous sheet prefill
  };
  const addManualBranch = () => {
    const n = manualBranch.trim();
    if (!n) return;
    if (allBranchOptions.some((b) => b.name.toLowerCase() === n.toLowerCase())) return ping('A branch with this name already exists', 'err');
    const b = { code: `MB-${Date.now().toString(36)}`, name: n, region: 'Manual', manual: true };
    setManualBranches((p) => [...p, b]);
    const next = [...branches, b];
    setBranches(next);
    syncAttendees(next);
    if (branches.length === 0) setPicked(new Set(master.map((p) => p.id)));
    setRows([]); setCarry([]);
    setManualBranch('');
    ping('Branch added — pick its attendees from employees or add them manually');
  };
  /* a manual branch can be deleted only while NO saved meeting uses it */
  const manualBranchLocked = (b) => (history[b.code] || []).length > 0;
  const deleteManualBranch = (b) => {
    if (manualBranchLocked(b)) return ping('This branch is used in saved minutes — it can no longer be deleted', 'err');
    setManualBranches((p) => p.filter((x) => x.code !== b.code));
    if (branches.some((x) => x.code === b.code)) {
      const next = branches.filter((x) => x.code !== b.code);
      setBranches(next);
      syncAttendees(next);
      setRows([]); setCarry([]);
    }
    ping('Manual branch removed');
  };
  const addEmployeeAttendee = (e) => {
    setAttendees((p) => [...p, { id: uid('a'), name: e.name, user_id: e.user_id, source: 'employee', present: true, branch: e.branchName, extra: true }]);
    ping(`${e.name} added to attendees`);
  };
  const addPicked = () => {
    const emp = pickable.find((e) => e.key === pickEmp);
    if (!emp) return;
    addEmployeeAttendee(emp);
    setPickEmp('');
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

  const openSheet = () => {
    if (!branches.length) return ping('Select at least one branch', 'err');
    if (!mDate) return ping('Meeting date is mandatory', 'err');
    if (!mLocation.trim()) return ping('Please set the meeting location', 'err');
    if (!mType.trim()) return ping('Set the meeting type (pick one or type your own)', 'err');
    if (!attendees.some((a) => a.present)) return ping('Mark at least one attendee as present', 'err');
    const pickedPoints = master.filter((p) => picked.has(p.id));
    if (!pickedPoints.length) return ping('Select at least one point to discuss', 'err');
    /* only the SELECTED master points pre-fill the sheet; anything already
       typed against a still-selected point survives a trip back to setup */
    setRows((prev) => {
      const byMaster = new Map(prev.filter((r) => r.masterId).map((r) => [r.masterId, r]));
      const custom = prev.filter((r) => !r.masterId);   // rows added live during the meeting
      const fromMaster = pickedPoints.map((p) => byMaster.get(p.id) || ({
        id: uid(), trackId: uid('t'), masterId: p.id, area: p.title, category: p.category,
        point: '', resp: [], due: '', flag: 'I', status: 'pending', remark: '',
        originDate: mDate, prevRemarks: [],
      }));
      return [...fromMaster, ...custom];
    });
    setCarry((prev) => prev.length ? prev : collectCarry(history, branches.map((b) => b.code)));
    setStep(2);
  };
  const resetWizard = () => {
    setStep(1); setBranches([]); setAttendees([]); setManualName(''); setPicked(new Set()); setShowAllAtt(false);
    setManualBranch(''); setPickBr('all'); setPickEmp('');
    setMDate(iso(new Date())); setMLocation(''); setMType(MEETING_TYPES[0]);
    setRows([]); setCarry([]);
  };

  /* ---------- Step-2 (sheet) actions ---------- */
  const presentNames = useMemo(() => attendees.filter((a) => a.present).map((a) => a.name), [attendees]);
  const ATT_PREVIEW = 6;                                   // chips shown before "+N more"
  const attPreview = showAllAtt ? attendees : attendees.slice(0, ATT_PREVIEW);
  const attHidden = Math.max(0, attendees.length - ATT_PREVIEW);
  const updRow = (id, patch) => setRows((p) => p.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    /* Information rows CAN carry responsibility (info directed at people),
       but never a due date or a status — those belong to Tasks only */
    if (patch.flag === 'T' && !next.due) next.due = iso(addDays(new Date(mDate || iso(new Date())), 7));
    if (patch.flag === 'I') { next.due = ''; next.status = 'pending'; }
    return next;
  }));
  const delRow = (id) => setRows((p) => p.filter((r) => r.id !== id));
  const askDelRow = (r) => setConfirm({
    title: 'Remove this row?',
    meta: r.area,
    note: (r.point?.trim() || r.remark?.trim()) ? 'Anything typed in it will be lost.' : '',
    yesLabel: 'Yes, remove',
    onYes: () => { delRow(r.id); setConfirm(null); },
  });
  const addRow = () => {
    const a = newArea.trim();
    if (!a) return ping('Type a discussion area first', 'err');
    setRows((p) => [...p, { id: uid(), trackId: uid('t'), masterId: null, area: a, category: newCat, point: '', resp: [], due: '', flag: 'I', status: 'pending', remark: '', originDate: mDate, prevRemarks: [] }]);
    setNewArea(''); ping('Row added to the sheet');
  };
  const updCarry = (id, patch) => setCarry((p) => p.map((c) => c.id === id ? { ...c, ...patch } : c));

  const { taskCount, infoCount, blankCount, unassigned } = useMemo(() => ({
    taskCount: rows.filter((r) => r.flag === 'T').length + carry.filter((c) => c.status !== 'completed').length,
    infoCount: rows.filter((r) => r.flag === 'I' && (r.point.trim() || r.remark.trim() || respArr(r.resp).length)).length,
    blankCount: rows.filter((r) => r.flag === 'I' && !r.point.trim() && !r.remark.trim() && !respArr(r.resp).length).length,
    unassigned: rows.filter((r) => r.flag === 'T' && !respArr(r.resp).length).length
      + carry.filter((c) => c.status !== 'completed' && !respArr(c.resp).length).length,
  }), [rows, carry]);

  const finalize = () => {
    if (!branches.length || !mDate) return ping('Meeting setup is incomplete — go back and check branch & date', 'err');
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
        const kept = rows.filter((r) => !(r.flag === 'I' && !r.point.trim() && !r.remark.trim() && !respArr(r.resp).length));
        const allRows = [...carry, ...kept];
        setSaving(true);
        const payload = {
          branchCode: branches[0].code, branchName: branchLabel,
          branches: branches.map(({ code, name }) => ({ code, name })),
          date: mDate, location: mLocation.trim(), type: mType.trim(),
          attendees: attendees.map((a) => ({ name: a.name, source: a.source, present: a.present, user_id: a.user_id || null, branch: a.branch || null })),
          rows: allRows.map((r) => ({
            trackId: r.trackId, masterId: r.masterId ?? null, area: r.area, category: r.category,
            point: r.point || '', resp: respArr(r.resp), due: r.due || '', flag: r.flag,
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
          .finally(() => setSaving(false));
      },
    });
  };

  /* delete a saved meeting (Master Admin, API mode) — removed from every
     branch list it was filed under */
  const deleteMeeting = (m) => setConfirm({
    title: 'Delete this meeting?',
    meta: `${m.branchName} · ${fmt(m.date)} · ${m.type}`,
    note: 'This permanently removes the sheet, its attendees and all rows.',
    yesLabel: 'Yes, delete',
    onYes: async () => {
      try {
        await axios.delete(`${MOM_API}/meetings/${m.id}`, { headers: authHeaders });
        setHistory((h) => {
          const next = {};
          Object.entries(h).forEach(([k, ms]) => { next[k] = ms.filter((x) => x.id !== m.id); });
          return next;
        });
        setConfirm(null); ping('Meeting deleted');
      } catch (e) { ping(e?.response?.data?.detail || 'Could not delete meeting', 'err'); }
    },
  });

  /* Master-setup persistence (null while API unreachable → modal stays local-only) */
  const persist = histSource === 'api' ? {
    addPoint: (title, category) => axios.post(`${MOM_API}/master-points`, { title, category }, { headers: authHeaders }).then((r) => r.data.item),
    updatePoint: (id, data) => axios.put(`${MOM_API}/master-points/${id}`, data, { headers: authHeaders }),
    deletePoint: (id) => axios.delete(`${MOM_API}/master-points/${id}`, { headers: authHeaders }),
    addCategory: (name, color) => axios.post(`${MOM_API}/categories`, { name, color }, { headers: authHeaders }),
    updateCategory: (name, color) => axios.put(`${MOM_API}/categories/${encodeURIComponent(name)}`, { color }, { headers: authHeaders }),
    deleteCategory: (name) => axios.delete(`${MOM_API}/categories/${encodeURIComponent(name)}`, { headers: authHeaders }),
  } : null;

  /* export flow: any export button opens the colour picker first;
     the file is generated with the colour the user chooses */
  const [exportReq, setExportReq] = useState(null);       // meeting object waiting for a colour
  const exportDraft = () => setExportReq({
    branchName: branchLabel, branches: branches.map(({ code, name }) => ({ code, name })),
    date: mDate, location: mLocation, type: mType,
    conductedBy: me?.name || 'Master Admin', attendees, rows: [...carry, ...rows],
  });

  /* ========================================================
     RENDER
     ======================================================== */
  return (
    <div className="font-sans">
      <FontScale />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pb-2 max-md:px-2">

        {/* ===== HERO (same pattern as Knowledge Bank) ===== */}
        <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden" style={{ background: `linear-gradient(120deg, ${BRAND} 0%, ${BRAND_DARK} 100%)` }}>
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
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
              <button onClick={() => setMasterOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-1.5 text-[12px] font-medium transition">
                <ListChecks className="h-3.5 w-3.5" /> Master setup
              </button>
            </div>
          </div>
        </div>

        {/* ===== VIEW TABS + STEP INDICATOR ===== */}
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm w-fit max-sm:max-w-full max-sm:overflow-x-auto">
            {[{ k: 'new', label: 'New meeting', icon: Zap }, { k: 'history', label: 'History', icon: FileText }, { k: 'reports', label: 'Reports', icon: BarChart3 }].map((t) => (
              <button key={t.k} onClick={() => setView(t.k)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 fs-12 font-semibold transition" style={view === t.k ? { background: BRAND_SOFT, color: BRAND } : { color: '#6b7280' }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          {view === 'new' && (
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm max-md:flex-wrap max-md:gap-2">
              {/* Back */}
              <button onClick={() => setStep(1)} disabled={step === 1}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 fs-11 font-semibold transition disabled:opacity-35 text-gray-600 hover:bg-gray-50">
                <ChevronLeft size={14} /> Back
              </button>
              <span className="h-6 w-px bg-gray-100" />
              {[{ n: 1, label: 'Meeting setup', sub: branches.length ? `${branches.length} branch${branches.length > 1 ? 'es' : ''} · ${picked.size} points` : 'branches · attendees · points' },
                { n: 2, label: 'Meeting sheet', sub: step === 2 ? 'live' : 'discussion table' }].map((s, i) => (
                <React.Fragment key={s.n}>
                  {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
                  <div className="flex items-center gap-2 px-2 py-1 rounded-md" style={step === s.n ? { background: BRAND_SOFT } : {}}>
                    <span className="h-5 w-5 rounded-full flex items-center justify-center fs-10 font-bold" style={step >= s.n ? { background: BRAND, color: '#fff' } : { background: '#eef0f3', color: '#9ca3af' }}>
                      {step > s.n ? <Check size={11} /> : s.n}
                    </span>
                    <div className="leading-tight">
                      <div className="fs-11 font-bold" style={{ color: step === s.n ? BRAND : '#6b7280' }}>{s.label}</div>
                      <div className="fs-9 text-gray-400 truncate" style={{ maxWidth: '9rem' }}>{s.sub}</div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
              <span className="h-6 w-px bg-gray-100" />
              {/* Next / Finalize */}
              <button onClick={() => (step === 1 ? openSheet() : finalize())}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 fs-11 font-bold text-white transition hover:opacity-90"
                style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>
                {step === 1 ? <>Next <ChevronRight size={14} /></> : <><CheckCircle2 size={14} /> Finalize</>}
              </button>
            </div>
          )}
        </div>

        {/* ================================================
            STEP 1 — MEETING SETUP (before starting)
            ================================================ */}
        {view === 'new' && step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* ---- meeting details ---- */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: BRAND_SOFT }}><CalendarDays size={15} style={{ color: BRAND }} /></span>
                <h2 className="text-[13px] font-bold text-gray-800">Meeting details</h2>
              </div>

              <label className="block">
                <span className="fs-11 font-semibold text-gray-500">Date <span className="text-red-400">*</span> <span className="fs-9 font-normal">(mandatory — defaults to today)</span></span>
                <div className="kc-input mt-1 flex items-center gap-2 px-3 py-2" style={!mDate ? { borderColor: '#f87171' } : {}}>
                  <CalendarDays size={14} className="text-gray-400" />
                  <input type="date" required value={mDate} onChange={(e) => setMDate(e.target.value)} className="w-full fs-12 text-gray-700 outline-none bg-transparent" />
                </div>
                {!mDate && <div className="fs-9 mt-1 font-semibold" style={{ color: '#dc2626' }}>Meeting date is required to start the sheet.</div>}
              </label>

              <label className="block">
                <span className="fs-11 font-semibold text-gray-500">Location <span className="text-red-400">*</span></span>
                <div className="kc-input mt-1 flex items-center gap-2 px-3 py-2">
                  <MapPin size={14} className="text-gray-400" />
                  <input value={mLocation} onChange={(e) => setMLocation(e.target.value)} placeholder="e.g. Branch Office — Conference Room" className="w-full fs-12 text-gray-700 outline-none bg-transparent" />
                </div>
              </label>

              <label className="block">
                <span className="fs-11 font-semibold text-gray-500">Meeting type <span className="text-red-400">*</span></span>
                <select value={isCustomType ? '__custom' : mType} onChange={(e) => setMType(e.target.value === '__custom' ? '' : e.target.value)} className="kc-input mt-1 w-full px-3 py-2 fs-12 text-gray-700">
                  {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom">Other — type manually…</option>
                </select>
                {isCustomType && (
                  <input autoFocus value={mType} onChange={(e) => setMType(e.target.value)}
                    placeholder="Type the meeting type (e.g. Quarterly Business Review)…"
                    className="kc-input mt-1.5 w-full px-3 py-2 fs-12 text-gray-700" />
                )}
              </label>

              <FlagLegend />
            </div>

            {/* ---- branches (multi-select + manual add) ---- */}
            <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: BRAND_SOFT }}><Building2 size={15} style={{ color: BRAND }} /></span>
                  <h2 className="text-[13px] font-bold text-gray-800">Branches <span className="text-red-400">*</span></h2>
                  <span className="fs-11 text-gray-400">select one or more — a joint review can cover multiple branches</span>
                </div>
                <span className="fs-10 rounded-full px-2 py-0.5 font-bold" style={{ background: BRAND_SOFT, color: BRAND }}>{branches.length} selected</span>
              </div>

              <div className="p-3 flex-1">
                {branches.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                    {branches.map((b) => (
                      <span key={b.code} className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-1 fs-10 font-bold" style={{ background: BRAND_SOFT, color: BRAND }}>
                        <Building2 size={10} /> {b.name}
                        {b.manual && <span className="rounded-full px-1 fs-9 font-bold" style={{ background: 'rgba(217,119,6,0.18)', color: '#b45309' }} title="Manually added branch">M</span>}
                        <button onClick={() => toggleBranch(b)} className="rounded-full p-0.5 hover:bg-white/70" title="Remove branch"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 overflow-y-auto kc-scroll pr-1" style={{ maxHeight: '13rem' }}>
                  {allBranchOptions.map((b) => {
                    const on = branches.some((x) => x.code === b.code);
                    const locked = b.manual && manualBranchLocked(b);
                    return (
                      <div key={b.code} role="button" tabIndex={0} onClick={() => toggleBranch(b)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBranch(b); } }}
                        className="kc-lift flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition cursor-pointer"
                        style={on
                          ? { border: `1.5px solid ${BRAND}`, background: 'rgba(47,49,146,0.06)' }
                          : { border: '1.5px solid #e6e9f0', background: '#fff' }}>
                        <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                          {on && <Check size={11} color="#fff" className="kc-pop" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`fs-12 block truncate ${on ? 'text-gray-800 font-semibold' : 'text-gray-500'}`} title={b.name}>{b.name}</span>
                          <span className="fs-9 text-gray-400 block truncate">{b.manual ? 'Manually added' : (b.region || '\u00A0')}</span>
                        </span>
                        {b.manual && (locked
                          ? <span className="flex-shrink-0 rounded-lg p-1 text-gray-300" title="Used in saved minutes \u2014 this branch can no longer be deleted"><Lock size={13} /></span>
                          : <button type="button" onClick={(e) => { e.stopPropagation(); deleteManualBranch(b); }}
                              className="flex-shrink-0 rounded-lg p-1 text-gray-300 hover:text-red-500 hover:bg-red-50" title="Delete this manual branch">
                              <Trash2 size={13} />
                            </button>)}
                      </div>
                    );
                  })}
                </div>
                {branches.length > 0 && (
                  <div className="mt-2.5 fs-10 text-gray-400 flex items-center gap-2 flex-wrap">
                    <span>last meeting across selected: <b className="text-gray-600">{fmt(lastAcross)}</b></span>
                    {carryPreview > 0 && <span className="rounded-full px-1.5 py-0.5 font-bold" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>{carryPreview} open task{carryPreview > 1 ? 's' : ''} will carry forward</span>}
                  </div>
                )}
              </div>

              {/* add a branch manually — it has no employees on file, so its
                  attendees come from the pickers in the Attendees card below */}
              <div className="mt-auto flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 flex-wrap" style={{ background: '#fafafc' }}>
                <Building2 size={14} className="text-gray-400 flex-shrink-0" />
                <input value={manualBranch} onChange={(e) => setManualBranch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManualBranch()}
                  placeholder="Branch not on the list? Add it manually — then pick its attendees below…" className="flex-1 fs-12 bg-transparent outline-none text-gray-700" style={{ minWidth: '12rem' }} />
                <button onClick={addManualBranch} className="rounded-lg px-3 py-1.5 fs-11 font-semibold text-white" style={{ background: BRAND }}>Add branch manually</button>
              </div>
            </div>

            {/* ---- attendees ---- */}
            <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BRAND_SOFT }}><Users size={15} style={{ color: BRAND }} /></span>
                  <h2 className="text-[13px] font-bold text-gray-800 flex-shrink-0">Attendees</h2>
                  {branches.length
                    ? <span className="fs-11 text-gray-400 truncate">employees of <b className="text-gray-600">{branchLabel}</b> auto-loaded{empSource === 'error' && ' (employees API not reachable)'}</span>
                    : <span className="fs-11 text-gray-400">select branches to auto-load their employees</span>}
                </div>
                <span className="fs-10 rounded-full px-2 py-0.5 font-bold flex-shrink-0" style={{ background: BRAND_SOFT, color: BRAND }}>
                  {attendees.filter((a) => a.present).length} present / {attendees.length}
                </span>
              </div>

              {/* attendee table — mirrors the "Sr. No. | Attendees" block of the sheet */}
              <div className="flex-1 overflow-y-auto kc-scroll max-lg:overflow-x-auto" style={{ maxHeight: '21rem' }}>
                {attendees.length === 0 ? (
                  <div className="p-8 text-center fs-12 text-gray-400">No attendees yet — pick branches (their employees load automatically) or use the pickers below.</div>
                ) : (
                  <table className="w-full fs-12 max-md:min-w-[520px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="sticky top-0 z-10 px-4 py-2 font-semibold border-b border-gray-100" style={{ width: '4rem', background: '#f7f8fc' }}>Sr. No.</th>
                        <th className="sticky top-0 z-10 px-3 py-2 font-semibold border-b border-gray-100" style={{ background: '#f7f8fc' }}>Attendee</th>
                        <th className="sticky top-0 z-10 px-3 py-2 font-semibold border-b border-gray-100" style={{ background: '#f7f8fc' }}>Source / Branch</th>
                        <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-center border-b border-gray-100" style={{ width: '7rem', background: '#f7f8fc' }}>Present</th>
                        <th className="sticky top-0 z-10 border-b border-gray-100" style={{ width: '3rem', background: '#f7f8fc' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.map((a, i) => (
                        <tr key={a.id} className={`border-t border-gray-50 ${!a.present ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar name={a.name} size={24} /><span className="font-medium text-gray-800">{a.name}</span></div></td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <SourceBadge source={a.source} />
                              {a.branch && <span className="fs-9 text-gray-400">{a.branch}</span>}
                              {a.extra && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: BRAND_SOFT, color: BRAND }} title="Explicitly added from the employee list">added</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => togglePresent(a.id)} className="inline-flex items-center gap-1.5 fs-10 font-semibold" style={{ color: a.present ? '#059669' : '#9ca3af' }} title={a.present ? 'Mark absent' : 'Mark present'}>
                              <span className="relative rounded-full transition-colors" style={{ width: 30, height: 17, background: a.present ? '#059669' : '#d7dbe4' }}>
                                <span className="absolute rounded-full bg-white shadow transition-all" style={{ width: 13, height: 13, top: 2, left: a.present ? 15 : 2 }} />
                              </span>
                              {a.present ? 'Present' : 'Absent'}
                            </button>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {(a.source === 'manual' || a.extra) && <button onClick={() => removeAttendee(a.id)} className="text-gray-300 hover:text-red-500" title="Remove"><Trash2 size={14} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* add from employees (any branch) — staffs manually-added branches too */}
              <div className="border-t border-gray-100" style={{ background: '#fafafc' }}>
                <div className="flex items-center gap-2 px-4 py-2 flex-wrap border-b border-gray-100">
                  <Users size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="fs-10 font-semibold text-gray-400">Add from employees</span>
                  <select value={pickBr} onChange={(e) => { setPickBr(e.target.value); setPickEmp(''); }} disabled={!branches.length}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 fs-11 text-gray-700 outline-none disabled:opacity-40">
                    <option value="all">All branches</option>
                    {branchOptions.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
                  </select>
                  <select value={pickEmp} onChange={(e) => setPickEmp(e.target.value)} disabled={!branches.length || !pickable.length}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 fs-11 text-gray-700 outline-none disabled:opacity-40" style={{ minWidth: '11rem' }}>
                    <option value="">{pickable.length ? 'Select employee…' : 'No more employees'}</option>
                    {pickable.map((e) => <option key={e.key} value={e.key}>{e.name}{e.branchName ? ` — ${e.branchName}` : ''}</option>)}
                  </select>
                  <button onClick={addPicked} disabled={!pickEmp} className="rounded-lg px-3 py-1 fs-11 font-semibold text-white disabled:opacity-40" style={{ background: BRAND }}>Add</button>
                  <span className="fs-9 text-gray-400">staff a manually-added branch, or invite people from other branches</span>
                </div>
                {/* add manually (guests / non-employees) */}
                <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
                  <UserPlus size={14} className="text-gray-400 flex-shrink-0" />
                  <input value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManual()}
                    placeholder="Add an attendee manually (guest, HO visitor, area manager…)" className="flex-1 fs-12 bg-transparent outline-none text-gray-700" disabled={!branches.length} />
                  <button onClick={addManual} disabled={!branches.length} className="rounded-lg px-3 py-1.5 fs-11 font-semibold text-white disabled:opacity-40" style={{ background: BRAND }}>Add manually</button>
                </div>
              </div>
            </div>

            {/* ---- points to discuss (select the agenda for THIS meeting) ---- */}
            <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: BRAND_SOFT }}><ListChecks size={15} style={{ color: BRAND }} /></span>
                  <h2 className="text-[13px] font-bold text-gray-800">Points to discuss</h2>
                  <span className="fs-11 text-gray-400">tick the master points for this meeting's agenda — only ticked points appear on the sheet</span>
                </div>
                <div className="flex items-center gap-2 max-md:flex-wrap">
                  <span className="fs-10 rounded-full px-2 py-0.5 font-bold" style={{ background: BRAND_SOFT, color: BRAND }}>{picked.size} of {master.length} selected</span>
                  <button onClick={pickAll} className="fs-11 font-semibold rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50">Select all</button>
                  <button onClick={pickNone} className="fs-11 font-semibold rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50">Clear</button>
                </div>
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {master.map((p) => {
                  const on = picked.has(p.id);
                  return (
                    <button key={p.id} onClick={() => togglePick(p.id)} className="kc-lift flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition"
                      style={on
                        ? { border: `1.5px solid ${BRAND}`, background: 'rgba(47,49,146,0.06)', boxShadow: '0 4px 12px -8px rgba(47,49,146,.4)' }
                        : { border: '1.5px solid #e6e9f0', background: '#fff' }}>
                      <span className="h-4 w-4 rounded border flex items-center justify-center flex-shrink-0" style={on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#cfcfe0' }}>
                        {on && <Check size={11} color="#fff" className="kc-pop" />}
                      </span>
                      <CatDot color={catColor(p.category)} title={p.category} />
                      <span className={`fs-12 flex-1 min-w-0 truncate ${on ? 'text-gray-800 font-semibold' : 'text-gray-500'}`} title={p.title}>{p.title}</span>
                      <span className="fs-9 font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: catColor(p.category), background: `${catColor(p.category)}14` }}>{p.category}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 flex-wrap gap-2" style={{ background: '#fafafc' }}>
                <span className="fs-11 text-gray-400">Set everything above first — the meeting sheet opens with these details locked in. Extra points, employees and guests can still be added live during the meeting.</span>
                <button onClick={openSheet} className="kc-lift inline-flex items-center gap-2 rounded-xl px-5 py-2.5 fs-12 font-bold text-white max-sm:w-full max-sm:justify-center" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})`, boxShadow: '0 6px 16px -6px rgba(47,49,146,.55)' }}>
                  <Zap size={15} /> Start meeting — open sheet <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================
            STEP 2 — MEETING SHEET (Excel format)
            ================================================ */}
        {view === 'new' && step === 2 && (
          <div className="space-y-3">

            {/* ---- sheet header block (like the top of the Excel) ---- */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b border-gray-100" style={{ background: 'linear-gradient(120deg, #f6f7fd, #eef0fa)' }}>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 fs-10 font-bold text-white" style={{ background: BRAND }}>
                    <span className="h-2 w-2 rounded-full bg-white" style={{ animation: 'livedot 1.4s infinite' }} /> LIVE
                  </span>
                  <div className="text-sm font-bold uppercase" style={{ letterSpacing: '0.16em', color: BRAND_DARK }}>Minutes of Meeting</div>
                </div>
                <div className="flex items-center gap-2 max-md:flex-wrap">
                  {canExport && <button onClick={exportDraft} className="kc-lift inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 fs-11 font-semibold" style={{ borderColor: '#dfe3f2', color: BRAND }}><Download size={13} /> Export Excel</button>}
                  <button onClick={() => setStep(1)} className="kc-lift inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 fs-11 font-semibold" style={{ borderColor: '#dfe3f2', color: '#5b6170' }}><ChevronLeft size={13} /> Setup</button>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100 border-b border-gray-100 max-sm:grid-cols-1">
                {[['Date', fmt(mDate), CalendarDays], ['Location', mLocation, MapPin], [branches.length > 1 ? 'Branches' : 'Branch', branchLabel, Building2], ['Meeting type', mType, FileText]].map(([l, v, Icon]) => (
                  <div key={l} className="px-3 py-2 flex items-center gap-2 min-w-0">
                    <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: SHEET_SOFT }}><Icon size={14} style={{ color: SHEET_DARK }} /></span>
                    <div className="min-w-0"><div className="fs-9 uppercase tracking-wide text-gray-400">{l}</div><div className="fs-12 font-semibold text-gray-800 truncate" title={v}>{v}</div></div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap fs-11">
                  <Users size={13} className="text-gray-400 flex-shrink-0" />
                  <span className="fs-10 font-semibold text-gray-400 flex-shrink-0">{presentNames.length}/{attendees.length} present</span>
                  {attPreview.map((a) => (
                    <span key={a.id}
                      className="inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-2 py-1 fs-10 font-medium border transition cursor-pointer select-none"
                      style={a.present
                        ? { background: SHEET_SOFT, borderColor: 'transparent', color: BRAND }
                        : { borderColor: '#e5e7eb', color: '#b7bcc6', textDecoration: 'line-through' }}
                      onClick={() => togglePresent(a.id)}
                      title={a.present ? 'Click to mark absent' : 'Click to mark present'}>
                      <span style={!a.present ? { filter: 'grayscale(1)', opacity: .55 } : {}}><Avatar name={a.name} size={16} /></span> {a.name}
                      {a.source === 'manual' && <span className="rounded-full px-1 fs-9 font-bold" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }} title="Manually added">M</span>}
                      {(a.source === 'manual' || a.extra) && (
                        <button onClick={(e) => { e.stopPropagation(); removeAttendee(a.id); }} className="rounded-full p-0.5 text-gray-300 hover:text-red-500" title="Remove"><Trash2 size={10} /></button>
                      )}
                    </span>
                  ))}
                  {attHidden > 0 && !showAllAtt && (
                    <button onClick={() => setShowAllAtt(true)} className="inline-flex items-center rounded-full px-2.5 py-1 fs-10 font-bold transition hover:opacity-80" style={{ background: BRAND_SOFT, color: BRAND }}>+{attHidden} more</button>
                  )}
                  {showAllAtt && attendees.length > ATT_PREVIEW && (
                    <button onClick={() => setShowAllAtt(false)} className="inline-flex items-center rounded-full px-2.5 py-1 fs-10 font-bold transition hover:opacity-80" style={{ background: '#f1f3f9', color: '#5b6170' }}>Show less</button>
                  )}
                  {/* an EMPLOYEE joined mid-meeting → select them (no need to type manually) */}
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 pl-2 pr-1.5 py-1" title="An employee joined the meeting? Select them here — they're added as an Employee, not a manual entry">
                    <Users size={11} className="text-gray-400" />
                    <select value="" onChange={(e) => { const emp = remainingEmployees.find((x) => x.key === e.target.value); if (emp) addEmployeeAttendee(emp); }}
                      className="fs-10 bg-transparent outline-none text-gray-700" style={{ maxWidth: '10.5rem' }}>
                      <option value="">Employee joined? Select…</option>
                      {remainingEmployees.map((e) => <option key={e.key} value={e.key}>{e.name}{e.branchName ? ` — ${e.branchName}` : ''}</option>)}
                    </select>
                  </span>
                  {/* guests / non-employees can still be typed in */}
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 pl-2 pr-1 py-1">
                    <UserPlus size={11} className="text-gray-400" />
                    <input value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManual()}
                      placeholder="Add guest…" className="fs-10 bg-transparent outline-none text-gray-700" style={{ width: '6.5rem' }} />
                    <button onClick={addManual} className="rounded-full px-1.5 py-0.5 fs-9 font-bold text-white" style={{ background: SHEET }}>Add</button>
                  </span>
                </div>
                <div className="flex items-center gap-3 fs-10 text-gray-500">
                  <span className="inline-flex items-center gap-1"><FlagChip f="T" small /> Task</span>
                  <span className="inline-flex items-center gap-1"><FlagChip f="I" small /> Information</span>
                </div>
              </div>
            </div>

            {/* ---- SECTION A · review of previous meetings ---- */}
            {carry.length > 0 && (
              <div className="rounded-2xl border overflow-hidden bg-white shadow-sm" style={{ borderColor: 'rgba(217,119,6,0.35)' }}>
                <div className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap" style={{ background: 'rgba(217,119,6,0.08)' }}>
                  <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(217,119,6,0.14)' }}><CornerUpRight size={14} style={{ color: '#b45309' }} /></span>
                    <span className="fs-13 font-bold" style={{ color: '#b45309' }}>Previous meeting — pending tasks</span>
                    <span className="rounded-full px-2 py-0.5 fs-10 font-bold bg-white" style={{ color: '#b45309' }}>{carry.length}</span>
                  </div>
                  <span className="fs-10 font-medium" style={{ color: '#b45309' }}>update status &amp; add this meeting's remark for each</span>
                </div>
                <div className="overflow-x-auto kc-scroll">
                  <table className="mom-sheet w-full fs-12" style={{ borderCollapse: 'collapse', minWidth: CARRY_MINW }}>
                    <thead>
                      <tr style={{ background: '#fdf6ec', color: '#92600a' }}>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.5rem' }}>Sr</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '14rem' }}>Discussion Area / Point</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '12.5rem' }}>Responsibility</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '5rem' }}>Action flag</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8.5rem' }}>Due Date</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '12rem' }}>Previous remarks</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '12rem' }}>Remark — this meeting</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '11rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {carry.map((c, i) => {
                        const od = c.due ? daysFromDue(c.due) : 0;
                        const isOd = c.status !== 'completed' && c.due && od > 0;
                        return (
                          <tr key={c.id} className={c.status === 'completed' ? 'opacity-60' : ''}>
                            <td className="px-2 py-2 text-center text-gray-500">{i + 1}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <CatDot color={catColor(c.category)} title={c.category} />
                                <span className={`font-semibold text-gray-800 ${c.status === 'completed' ? 'line-through' : ''}`}>{c.area}</span>
                                {isOd && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 fs-9 font-semibold" style={{ background: STATUS.overdue.soft, color: STATUS.overdue.color }}><AlertTriangle size={9} /> {od}d overdue</span>}
                              </div>
                              {c.point && <div className="fs-11 text-gray-500 mt-0.5">{c.point}</div>}
                              <div className="fs-9 text-gray-400 mt-0.5">raised {fmt(c.originDate || c.srcDate)}</div>
                            </td>
                            <td className="px-1 py-1">
                              <RespPicker value={respArr(c.resp)} options={presentNames} onChange={(v) => updCarry(c.id, { resp: v })} />
                            </td>
                            <td className="px-2 py-2 text-center"><FlagChip f={c.flag} small /></td>
                            <td className="px-1 py-1"><input type="date" value={c.due} onChange={(e) => updCarry(c.id, { due: e.target.value })} className="w-full fs-11 text-gray-700 outline-none px-1 py-1 rounded" title="Extend / change due date" /></td>
                            <td className="px-2 py-2"><RemarkHistory list={c.prevRemarks} /></td>
                            <td className="px-1 py-1"><input value={c.remark} onChange={(e) => updCarry(c.id, { remark: e.target.value })} placeholder="Remark for this meeting…" className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded" /></td>
                            <td className="px-2 py-2"><SegStatus value={c.status} onChange={(v) => updCarry(c.id, { status: v })} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ---- SECTION B · current discussion table ---- */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: SHEET_SOFT }}><ListChecks size={15} style={{ color: SHEET_DARK }} /></span>
                  <span className="fs-13 font-bold text-gray-800">Discussion — current meeting</span>
                  <span className="fs-10 text-gray-400">assign one or more owners · T needs a due date, Information doesn't</span>
                </div>
                <span className="fs-10 text-gray-400">{rows.filter((r) => r.flag === 'T').length} tasks · {infoCount} info</span>
              </div>
              <div ref={topScrollRef} onScroll={() => { if (mainScrollRef.current && topScrollRef.current) mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft; }} className="overflow-x-auto kc-scroll border-b border-gray-50" style={{ height: 10 }}>
                <div style={{ width: SHEET_MINW, height: 1 }} />
              </div>
              <div ref={mainScrollRef} onScroll={() => { if (mainScrollRef.current && topScrollRef.current) topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft; }} className="overflow-x-auto kc-scroll">
                <table className="mom-sheet w-full fs-12" style={{ borderCollapse: 'collapse', minWidth: SHEET_MINW }}>
                  <thead>
                    <tr style={{ background: '#f1f3fb', color: BRAND_DARK }}>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.8rem' }}>Sr.no</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '12rem' }}>Discussion Area</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '15rem' }}>Discussion points</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '13rem' }}>Responsibility</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '5rem' }}>Action flag</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8.5rem' }}>Due Date</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '12rem' }}>Remarks</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8.5rem' }}>Status</th>
                      <th style={{ width: '2.5rem' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isT = r.flag === 'T';
                      return (
                        <tr key={r.id}>
                          <td className="px-2 py-2 text-center text-gray-500">{i + 1}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1.5">
                              <CatDot color={catColor(r.category)} title={r.category} />
                              <span className="font-semibold text-gray-800">{r.area}</span>
                            </div>
                            <div className="fs-9 mt-0.5 font-medium" style={{ color: catColor(r.category) }}>{r.category}</div>
                          </td>
                          <td className="px-1 py-1 align-top">
                            <textarea rows={1} value={r.point}
                              ref={(el) => el && autoGrow(el)}
                              onChange={(e) => { autoGrow(e.target); updRow(r.id, { point: e.target.value }); }}
                              placeholder="What was discussed / decided…"
                              className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded resize-none overflow-hidden" style={{ minHeight: '2rem' }} />
                          </td>
                          <td className="px-1 py-1">
                            <RespPicker value={respArr(r.resp)} options={presentNames} onChange={(v) => updRow(r.id, { resp: v })} />
                          </td>
                          <td className="px-2 py-2 text-center"><FlagToggle value={r.flag} onChange={(f) => updRow(r.id, { flag: f })} /></td>
                          <td className="px-1 py-1">
                            {isT
                              ? <input type="date" value={r.due} onChange={(e) => updRow(r.id, { due: e.target.value })} className="w-full fs-11 text-gray-700 outline-none px-1 py-1 rounded" />
                              : <div className="text-center fs-11 text-gray-300" title="Information rows don't need a due date">—</div>}
                          </td>
                          <td className="px-1 py-1"><input value={r.remark} onChange={(e) => updRow(r.id, { remark: e.target.value })} placeholder="Remark…" className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded" /></td>
                          <td className="px-1 py-1">
                            {isT ? (
                              <select value={r.status} onChange={(e) => updRow(r.id, { status: e.target.value })} className="w-full fs-11 font-semibold outline-none px-1.5 py-1.5 rounded-lg" style={{ color: STATUS[r.status].color, background: STATUS[r.status].soft }}>
                                <option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
                              </select>
                            ) : <div className="text-center fs-11 text-gray-300">—</div>}
                          </td>
                          <td className="px-1 py-2 text-center"><button onClick={() => askDelRow(r)} className="text-gray-300 hover:text-red-500" title="Remove row"><Trash2 size={14} /></button></td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center fs-12 text-gray-400">No rows — add a discussion area below.</td></tr>}
                  </tbody>
                </table>
              </div>
              {/* add custom row */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 flex-wrap" style={{ background: '#fafafc' }}>
                <Plus size={14} className="text-gray-400" />
                <input value={newArea} onChange={(e) => setNewArea(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRow()} placeholder="Add a new discussion area raised during the meeting…" className="flex-1 fs-12 bg-transparent outline-none text-gray-700" style={{ minWidth: '14rem' }} />
                <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 fs-11 bg-white outline-none">{Object.keys(categories).map((c) => <option key={c}>{c}</option>)}</select>
                <button onClick={addRow} className="rounded-lg px-3 py-1.5 fs-11 font-semibold text-white" style={{ background: SHEET }}>Add row</button>
              </div>
            </div>

            {/* ---- finalize bar ---- */}
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white shadow-sm px-3 py-2.5 flex-wrap">
              <button onClick={() => setStep(1)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 fs-12 font-semibold text-gray-600 hover:bg-gray-50"><ChevronLeft size={15} /> Back to setup</button>
              <div className="flex items-center gap-3 flex-wrap">
                {unassigned > 0 && <span className="fs-11 font-semibold inline-flex items-center gap-1" style={{ color: '#dc2626' }}><AlertTriangle size={13} /> {unassigned} task{unassigned > 1 ? 's' : ''} without responsibility</span>}
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 fs-11 font-semibold" style={{ background: FLAG.T.bg, color: FLAG.T.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: FLAG.T.color }} /><b className="tabular-nums">{taskCount}</b> tasks</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 fs-11 font-semibold" style={{ background: FLAG.I.bg, color: FLAG.I.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: FLAG.I.color }} /><b className="tabular-nums">{infoCount}</b> info</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 fs-11 font-semibold" style={{ background: '#f1f3f9', color: '#5b6170' }}><CornerUpRight size={11} /><b className="tabular-nums">{carry.length}</b> carried</span>
                <button onClick={finalize} className="kc-lift inline-flex items-center gap-2 rounded-xl px-5 py-2.5 fs-12 font-bold text-white max-sm:w-full max-sm:justify-center" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})`, boxShadow: '0 6px 16px -6px rgba(47,49,146,.55)' }}><CheckCircle2 size={15} /> Finalize &amp; save</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== HISTORY ===== */}
        {view === 'history' && <HistoryView history={history} branches={branchOptions} onView={setViewMtg} onDelete={deleteMeeting} canDelete={histSource === 'api' && me?.role === 'master_admin'} canExport={canExport} onExport={setExportReq} source={histSource} />}

        {/* ===== REPORTS ===== */}
        {view === 'reports' && <ReportsView history={history} branches={branchOptions} />}
      </div>

      {/* ===== MASTER SETUP MODAL ===== */}
      {masterOpen && <MasterModal master={master} setMaster={setMaster} categories={categories} setCategories={setCategories} persist={persist} onClose={() => setMasterOpen(false)} ping={ping} />}

      {/* ===== VIEW MEETING (sheet replica) ===== */}
      {viewMtg && <MeetingSheetModal data={viewMtg} categories={categories} canExport={canExport} onExport={setExportReq} onClose={() => setViewMtg(null)} />}

      {/* ===== EXPORT COLOUR PICKER ===== */}
      {exportReq && <ExportColorModal onExport={(c) => { exportMeetingExcel(exportReq, c); setExportReq(null); }} onClose={() => setExportReq(null)} />}

      {/* ===== CONFIRM (finalize) ===== */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-lg:max-h-[90vh] max-lg:overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                    <s.icon size={15} className="mx-auto mb-1" style={{ color: s.color }} />
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
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 fs-12 font-semibold text-gray-600 hover:bg-gray-50 max-sm:w-full">Cancel</button>
              <button onClick={confirm.onYes} disabled={saving} className="kc-lift inline-flex items-center gap-1.5 rounded-lg px-4 py-2 fs-12 font-bold text-white disabled:opacity-60 max-sm:w-full max-sm:justify-center" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>
                <CheckCircle2 size={15} /> {saving ? 'Saving…' : (confirm.yesLabel || 'Yes, finalize')}
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
  const [showAll, setShowAll] = useState(false);
  const catColor = (n) => (categories && categories[n]) || '#94a3b8';
  const present = useMemo(() => data.attendees.filter((a) => a.present), [data]);
  const ordered = useMemo(
    () => [...data.rows.filter((r) => r.carried), ...data.rows.filter((r) => !r.carried)],
    [data],
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-4 py-3 flex items-start justify-between rounded-t-2xl border-b border-gray-100 max-md:flex-wrap max-md:gap-2" style={{ background: 'linear-gradient(120deg, #f6f7fd, #eef0fa)' }}>
          <div className="min-w-0">
            <div className="fs-9 uppercase tracking-wide text-gray-400" style={{ letterSpacing: '0.14em' }}>Minutes of Meeting</div>
            <div className="text-base font-bold text-gray-800">{data.branchName}</div>
            {data.branches?.length > 1 && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                {data.branches.map((b) => <span key={b.code} className="rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: BRAND }}>{b.name}</span>)}
              </div>
            )}
            <div className="fs-10 mt-0.5 text-gray-500 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {fmt(data.date)}</span>
              {data.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {data.location}</span>}
              <span>{data.type}</span><span>by {data.conductedBy}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 max-md:flex-wrap">
            {canExport && <button onClick={() => onExport(data)} className="kc-lift inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 fs-11 font-bold max-sm:text-xs max-sm:px-2" style={{ borderColor: '#dfe3f2', color: BRAND }}><Download size={13} /> Download Excel</button>}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* attendees + legend */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap fs-12 text-gray-500">
              <Users size={13} className="text-gray-400" /> Attendees:
              <span className="fs-10 font-semibold text-gray-400">{present.length} present</span>
              {(showAll ? present : present.slice(0, 8)).map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 pl-1 pr-2.5 py-1 fs-10 font-medium text-gray-700">
                  <Avatar name={a.name} size={16} />{a.name}
                  {a.branch && <span className="fs-9 text-gray-400">· {a.branch}</span>}
                  {a.source === 'manual' && <span className="rounded-full px-1 fs-9 font-bold" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }} title="Manually added">M</span>}
                </span>
              ))}
              {present.length > 8 && (
                <button onClick={() => setShowAll((v) => !v)} className="inline-flex items-center rounded-full px-2.5 py-1 fs-10 font-bold transition hover:opacity-80" style={{ background: BRAND_SOFT, color: BRAND }}>
                  {showAll ? 'Show less' : `+${present.length - 8} more`}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 fs-10 text-gray-500">
              <span className="inline-flex items-center gap-1"><FlagChip f="T" small /> Task</span>
              <span className="inline-flex items-center gap-1"><FlagChip f="I" small /> Information</span>
            </div>
          </div>

          {/* the sheet — same column order as the live table & the Excel */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="mom-sheet w-full fs-11" style={{ borderCollapse: 'collapse', minWidth: '66rem' }}>
              <thead>
                <tr style={{ background: '#f1f3fb', color: BRAND_DARK }}>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.8rem' }}>Sr.no</th>
                  <th className="px-2 py-2 fs-11 font-bold">Discussion Area</th>
                  <th className="px-2 py-2 fs-11 font-bold">Discussion points</th>
                  <th className="px-2 py-2 fs-11 font-bold">Responsibility</th>
                  <th className="px-2 py-2 fs-11 font-bold">Action flag</th>
                  <th className="px-2 py-2 fs-11 font-bold">Due Date</th>
                  <th className="px-2 py-2 fs-11 font-bold">Remarks (history)</th>
                  <th className="px-2 py-2 fs-11 font-bold">Remark — {fmtDDMMYY(data.date)}</th>
                  <th className="px-2 py-2 fs-11 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 text-center text-gray-500">{i + 1}{r.carried && <div className="fs-9 font-bold" style={{ color: '#b45309' }}>C/F</div>}</td>
                    <td className="px-2 py-2"><div className="flex items-center gap-1.5"><CatDot color={catColor(r.category)} title={r.category} /><span className="font-semibold text-gray-800">{r.area}</span></div></td>
                    <td className="px-2 py-2 text-gray-700">{r.point || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2">
                      {respArr(r.resp).length ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {respArr(r.resp).map((n) => (
                            <span key={n} className="inline-flex items-center gap-1 rounded-full pl-0.5 pr-1.5 py-0.5 fs-10 font-semibold" style={{ background: BRAND_SOFT, color: BRAND }}>
                              <Avatar name={n} size={14} />{n.split(' ')[0]}
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-center"><FlagChip f={r.flag} small /></td>
                    <td className="px-2 py-2 text-center text-gray-600">{r.flag === 'T' ? fmt(r.due) : '—'}</td>
                    <td className="px-2 py-2"><RemarkHistory list={r.prevRemarks} /></td>
                    <td className="px-2 py-2 text-gray-700">{r.remark || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-center"><StatusBadge r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   HISTORY VIEW — branch sidebar + searchable, sortable table
   ============================================================ */
function HistoryView({ history, branches, onView, onDelete, canDelete, canExport, onExport, source }) {
  /* the sidebar also lists branches that ONLY exist in history
     (e.g. manually added ones) */
  const allBranches = useMemo(() => {
    const map = new Map(branches.map((b) => [b.code, { ...b }]));
    Object.keys(history).forEach((code) => {
      if (!map.has(code)) {
        const m = (history[code] || [])[0];
        map.set(code, { code, name: m?.branches?.find((x) => x.code === code)?.name || m?.branchName || code, manual: true });
      }
    });
    return [...map.values()];
  }, [branches, history]);

  const [code, setCode] = useState(allBranches[0]?.code);
  useEffect(() => { if (allBranches.length && !allBranches.some((b) => b.code === code)) setCode(allBranches[0].code); }, [allBranches, code]);
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [asc, setAsc] = useState(false);
  useEffect(() => { setQ(''); setTypeF('all'); }, [code]);

  const meetings = history[code] || [];
  const types = useMemo(() => [...new Set(meetings.map((m) => m.type).filter(Boolean))], [meetings]);
  const shown = useMemo(() => meetings
    .filter((m) => (typeF === 'all' || m.type === typeF)
      && (!q || [m.type, m.location, m.conductedBy].join(' ').toLowerCase().includes(q.toLowerCase())))
    .slice()
    .sort((a, b) => asc ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || '')),
  [meetings, q, typeF, asc]);

  const openCount = (c) => {
    const seen = new Set(); let o = 0;
    (history[c] || []).forEach((m) => m.rows.forEach((r) => {
      if (r.flag !== 'T' || seen.has(r.trackId)) return;
      seen.add(r.trackId);
      if (r.status !== 'completed') o++;
    }));
    return o;
  };
  const selBranch = allBranches.find((b) => b.code === code);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
      <aside className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-fit">
        <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700 flex items-center gap-2"><Building2 size={14} style={{ color: BRAND }} /> Branches{source === 'error' && <span className="ml-auto fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: 'rgba(220,38,38,0.12)', color: '#b91c1c' }} title="MOM API not reachable">offline</span>}</div>
        <div className="overflow-y-auto kc-scroll" style={{ maxHeight: '26rem' }}>
          {allBranches.map((b) => {
            const oc = openCount(b.code);
            return (
              <button key={b.code} onClick={() => setCode(b.code)} className="w-full text-left px-3 py-2 border-b border-gray-50 transition" style={code === b.code ? { background: BRAND_SOFT } : {}}>
                <div className="flex items-center justify-between gap-2">
                  <span className="fs-12 font-medium truncate" style={code === b.code ? { color: BRAND } : { color: '#374151' }}>{b.name}</span>
                  {oc > 0 && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }} title="Open tasks">{oc}</span>}
                </div>
                <div className="fs-10 text-gray-400">{(history[b.code] || []).length} meetings{b.manual ? ' · manual' : ''}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
        {/* toolbar: search · type filter · sort */}
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BRAND_SOFT }}><FileText size={15} style={{ color: BRAND }} /></span>
            <div className="min-w-0">
              <div className="fs-13 font-bold text-gray-800 truncate">{selBranch?.name || '—'}</div>
              <div className="fs-10 text-gray-400">{meetings.length} meeting{meetings.length === 1 ? '' : 's'} recorded{shown.length !== meetings.length ? ` · ${shown.length} shown` : ''}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="kc-input flex items-center gap-1.5 px-2 py-1.5">
              <Search size={12} className="text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search type / location / person…" className="fs-11 bg-transparent outline-none text-gray-700" style={{ width: '11rem' }} />
            </span>
            <select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="kc-input px-2 py-1.5 fs-11 text-gray-700">
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => setAsc((a) => !a)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 fs-11 font-semibold text-gray-600 hover:bg-gray-50" title="Toggle sort order">
              <CalendarDays size={12} /> {asc ? 'Oldest first' : 'Newest first'}
            </button>
          </div>
        </div>

        {source === 'loading' && <div className="p-10 text-center fs-12 text-gray-400">Loading meetings…</div>}
        {source !== 'loading' && meetings.length === 0 && <div className="p-10 text-center fs-12 text-gray-400">No meetings recorded for this branch yet — finalize one from "New meeting".</div>}
        {source !== 'loading' && meetings.length > 0 && shown.length === 0 && <div className="p-10 text-center fs-12 text-gray-400">Nothing matches the current search / filter.</div>}

        {shown.length > 0 && (
          <div className="overflow-x-auto kc-scroll">
            <table className="w-full fs-12" style={{ minWidth: '58rem' }}>
              <thead>
                <tr className="text-left text-gray-500">
                  {[['Meeting', ''], ['Conducted by', ''], ['Attendees', ''], ['Rows', 'text-center'], ['Tasks', 'text-center'], ['Progress', ''], ['', 'text-right']].map(([h, extra], i) => (
                    <th key={i} className={`sticky top-0 z-10 px-3 py-2 fs-10 font-bold uppercase tracking-wide border-b border-gray-100 ${extra}`} style={{ background: '#f7f8fc' }}>{h}</th>
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
                    <tr key={m.id} className="border-t border-gray-50 transition hover:bg-[#f7f9ff]">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-10 w-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0" style={{ background: '#eef0fa', color: BRAND, border: '1px solid #e2e6f5' }}>
                            <span className="fs-13 font-bold leading-none">{new Date(m.date).getDate()}</span>
                            <span className="fs-9 leading-none mt-0.5">{new Date(m.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="fs-12 font-bold text-gray-800 flex items-center gap-1.5 flex-wrap">
                              {m.type || 'Meeting'}
                              {m.branches?.length > 1 && <span className="fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: BRAND_SOFT, color: BRAND }} title={m.branches.map((b) => b.name).join(' + ')}>{m.branches.length} branches</span>}
                            </div>
                            <div className="fs-10 text-gray-400 truncate flex items-center gap-1" style={{ maxWidth: '15rem' }}><MapPin size={9} className="flex-shrink-0" /> {m.location || '—'} · {fmt(m.date)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><Avatar name={m.conductedBy} size={20} /><span className="fs-11 text-gray-700 truncate" style={{ maxWidth: '8rem' }}>{m.conductedBy}</span></div></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><AvatarStack names={presentN} /><span className="fs-9 text-gray-400 flex-shrink-0">{presentN.length} present</span></div></td>
                      <td className="px-3 py-2.5 text-center text-gray-700 font-semibold">{m.rows.length}</td>
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
                          {canExport && <button onClick={() => onExport(m)} title="Download Excel" className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"><Download size={13} /></button>}
                          {canDelete && <button onClick={() => onDelete(m)} title="Delete meeting" className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>}
                          <button onClick={() => onView(m)} className="kc-lift rounded-lg px-2.5 py-1.5 fs-11 font-bold text-white" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>View sheet</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   REPORTS VIEW — latest state per tracked task (no double count),
   with a branch scope filter and extra breakdowns:
   status pie · completion by branch · category split · monthly
   trend · overdue ageing · owner workload · branch summary
   ============================================================ */
function ReportsView({ history, branches }) {
  const allBranches = useMemo(() => {
    const map = new Map(branches.map((b) => [b.code, { ...b }]));
    Object.keys(history).forEach((code) => {
      if (!map.has(code)) {
        const m = (history[code] || [])[0];
        map.set(code, { code, name: m?.branches?.find((x) => x.code === code)?.name || m?.branchName || code, manual: true });
      }
    });
    return [...map.values()];
  }, [branches, history]);
  const [scope, setScope] = useState('all');

  const d = useMemo(() => {
    const inScope = (m) => scope === 'all' || (m.branches?.length ? m.branches.some((b) => b.code === scope) : m.branchCode === scope);
    /* multi-branch meetings are filed under several branches — count each once */
    const uniq = new Map();
    Object.values(history).forEach((ms) => ms.forEach((m) => { if (inScope(m)) uniq.set(m.id, m); }));
    const all = [...uniq.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const seen = new Set(); const latest = [];
    let info = 0, attP = 0, attT = 0;
    all.forEach((m) => {
      attP += m.attendees.filter((a) => a.present).length; attT += m.attendees.length;
      m.rows.forEach((r) => {
        if (r.flag !== 'T') { info++; return; }
        if (seen.has(r.trackId)) return;
        seen.add(r.trackId); latest.push(r);
      });
    });
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
    const trend = months.map((mo) => ({ name: mo.name, meetings: all.filter((m) => (m.date || '').startsWith(mo.key)).length }));

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

    /* branch-wise summary */
    const branchRows = (scope === 'all' ? allBranches : allBranches.filter((b) => b.code === scope)).map((b) => {
      const ms = history[b.code] || [];
      const s2 = new Set(); let done = 0, tot = 0, open = 0, od = 0, inf = 0, p2 = 0, t2 = 0;
      ms.forEach((m) => {
        p2 += m.attendees.filter((a) => a.present).length; t2 += m.attendees.length;
        m.rows.forEach((r) => {
          if (r.flag !== 'T') { inf++; return; }
          if (s2.has(r.trackId)) return;
          s2.add(r.trackId); tot++;
          if (r.status === 'completed') done++;
          else { open++; if (isOverdue(r)) od++; }
        });
      });
      return { name: b.name, last: ms[0]?.date, meetings: ms.length, tasks: tot, done, open, overdue: od, info: inf, att: t2 ? Math.round(p2 / t2 * 100) : 0, completion: tot ? Math.round(done / tot * 100) : 0 };
    }).sort((a, b) => b.meetings - a.meetings || a.name.localeCompare(b.name));

    return {
      meetings: all.length,
      completion: latest.length ? Math.round(completed / latest.length * 100) : 0,
      open: latest.length - completed,
      overdue: overRows.length,
      info,
      avg: all.length ? (latest.length / all.length).toFixed(1) : '0',
      att: attT ? Math.round(attP / attT * 100) : 0,
      covered: scope === 'all' ? branchRows.filter((b) => b.meetings > 0).length : 1,
      pie: [
        { name: 'Completed', value: completed, color: '#059669' },
        { name: 'In Progress', value: inProg, color: '#d97706' },
        { name: 'Pending', value: pend, color: '#64748b' },
        { name: 'Overdue', value: overRows.length, color: '#dc2626' },
      ],
      cats: Object.values(catMap).sort((a, b) => (b.done + b.open) - (a.done + a.open)),
      trend, owners, aging, branchRows,
      compBar: branchRows.map((b) => ({ name: b.name, completion: b.completion })),
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
          <BarChart3 size={15} style={{ color: BRAND }} /> Detailed reports
          <span className="fs-10 font-normal text-gray-400">latest state per tracked task — carried tasks are never double-counted</span>
        </div>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="kc-input px-2.5 py-1.5 fs-11 font-semibold text-gray-700">
          <option value="all">All branches</option>
          {allBranches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>
      </div>

      {/* KPI grid — two rows */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KPI icon={CalendarDays} label="Total meetings" value={d.meetings} color={BRAND} />
        <KPI icon={CheckCircle2} label="Task completion" value={`${d.completion}%`} color="#059669" />
        <KPI icon={ListChecks} label="Open tasks" value={d.open} color="#d97706" />
        <KPI icon={AlertTriangle} label="Overdue tasks" value={d.overdue} color="#dc2626" />
        <KPI icon={FileText} label="Information shared" value={d.info} color="#2563eb" hint="Information rows across all meetings" />
        <KPI icon={Zap} label="Avg tasks / meeting" value={d.avg} color="#b45309" />
        <KPI icon={Users} label="Attendance rate" value={`${d.att}%`} color="#7c3aed" hint="Present / listed attendees across meetings" />
        <KPI icon={Building2} label="Branches covered" value={d.covered} color="#0d9488" />
      </div>

      {/* charts — row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Tasks by status <span className="fs-10 font-normal text-gray-400">(latest state per task)</span></div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart><Pie data={d.pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>{d.pie.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie><Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3">
          <div className="fs-12 font-bold text-gray-700 mb-2">Task completion % by branch</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.compBar} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => `${v}%`} /><Bar dataKey="completion" radius={[0, 4, 4, 0]} fill={BRAND} />
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
                <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
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
              <Tooltip /><Bar dataKey="meetings" name="Meetings" fill={BRAND} radius={[4, 4, 0, 0]} />
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
                <Tooltip /><Bar dataKey="v" name="Overdue tasks" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700">Responsibility workload <span className="fs-10 font-normal text-gray-400">(top owners by open tasks)</span></div>
          {d.owners.length === 0 ? (
            <div className="p-8 text-center fs-11 text-gray-400">No tasks assigned yet.</div>
          ) : (
            <div className="overflow-x-auto kc-scroll">
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
                      <td className="px-3 py-1.5 text-center">{o.overdue > 0 ? <span className="font-semibold text-red-500">{o.overdue}</span> : <span className="text-gray-300">0</span>}</td>
                      <td className="px-3 py-1.5 text-center text-gray-600">{o.done}</td>
                      <td className="px-3 py-1.5"><Bar2 v={Math.round(o.done / Math.max(1, o.done + o.open) * 100)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* branch-wise summary — extended */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700">Branch-wise summary</div>
        <div className="overflow-x-auto kc-scroll">
          <table className="w-full fs-12" style={{ minWidth: '52rem' }}>
            <thead><tr className="text-left text-gray-500" style={{ background: SHEET_SOFT }}>
              <th className="px-3 py-1.5 font-semibold">Branch</th><th className="px-3 py-1.5 font-semibold">Last meeting</th>
              <th className="px-3 py-1.5 font-semibold text-center">Meetings</th><th className="px-3 py-1.5 font-semibold text-center">Tasks</th>
              <th className="px-3 py-1.5 font-semibold text-center">Done</th><th className="px-3 py-1.5 font-semibold text-center">Open</th>
              <th className="px-3 py-1.5 font-semibold text-center">Overdue</th><th className="px-3 py-1.5 font-semibold text-center">Info</th>
              <th className="px-3 py-1.5 font-semibold text-center">Attendance</th><th className="px-3 py-1.5 font-semibold" style={{ width: '8rem' }}>Completion</th>
            </tr></thead>
            <tbody>
              {d.branchRows.map((b) => (
                <tr key={b.name} style={{ borderTop: '1px solid #f6f6f9' }}>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{b.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{fmt(b.last)}</td>
                  <td className="px-3 py-1.5 text-center text-gray-700">{b.meetings}</td>
                  <td className="px-3 py-1.5 text-center text-gray-700">{b.tasks}</td>
                  <td className="px-3 py-1.5 text-center text-gray-600">{b.done}</td>
                  <td className="px-3 py-1.5 text-center">{b.open > 0 ? <span className="font-semibold" style={{ color: '#b45309' }}>{b.open}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-1.5 text-center">{b.overdue > 0 ? <span className="font-semibold text-red-500">{b.overdue}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-1.5 text-center text-gray-600">{b.info}</td>
                  <td className="px-3 py-1.5 text-center text-gray-600">{b.meetings ? `${b.att}%` : '—'}</td>
                  <td className="px-3 py-1.5"><div className="flex items-center gap-2"><div className="flex-1"><Bar2 v={b.completion} /></div><span className="fs-10 text-gray-500" style={{ width: '2rem', textAlign: 'right' }}>{b.completion}%</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MASTER SETUP MODAL — discussion areas & categories
   ============================================================ */
function MasterModal({ master, setMaster, categories, setCategories, persist, onClose, ping }) {
  const [tab, setTab] = useState('points');
  const [title, setTitle] = useState('');
  const catKeys = Object.keys(categories);
  const [cat, setCat] = useState(catKeys[0]);
  const [newCat, setNewCat] = useState('');
  const [newColor, setNewColor] = useState(NEW_CAT_COLORS[0]);

  const fail = (e, msg) => ping(e?.response?.data?.detail || msg, 'err');

  const add = async () => {
    const t = title.trim(); if (!t) return;
    try {
      if (persist) {
        const item = await persist.addPoint(t, cat);
        setMaster((p) => [...p, { id: String(item.id), title: item.title, category: item.category }]);
      } else setMaster((p) => [...p, { id: uid('m'), title: t, category: cat }]);
      setTitle(''); ping('Master point added');
    } catch (e) { fail(e, 'Could not add the point'); }
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
    try {
      if (persist) await persist.addCategory(n, newColor);
      setCategories((c) => ({ ...c, [n]: newColor })); setNewCat('');
      setNewColor(NEW_CAT_COLORS[(catKeys.length + 1) % NEW_CAT_COLORS.length]); ping('Category added');
    } catch (e) { fail(e, 'Could not add the category'); }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '86vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between rounded-t-2xl border-b border-gray-100" style={{ background: 'linear-gradient(120deg, #f6f7fd, #eef0fa)' }}>
          <div>
            <div className="text-sm font-bold text-gray-800">Master setup</div>
            <div className="fs-10 text-gray-400">Discussion areas pre-filled into every new meeting sheet</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-2 border-b border-gray-100 max-sm:overflow-x-auto">
          {[['points', `Discussion areas (${master.length})`], ['cats', `Categories (${catKeys.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="rounded-t-md px-3 py-2 fs-12 font-semibold transition" style={tab === k ? { color: BRAND, borderBottom: `2px solid ${BRAND}` } : { color: '#9ca3af' }}>{l}</button>
          ))}
        </div>

        {tab === 'points' ? (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 max-sm:flex-wrap" style={{ background: '#fafafc' }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a new discussion area…" className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 fs-12 outline-none" />
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 fs-12 bg-white outline-none">{catKeys.map((c) => <option key={c}>{c}</option>)}</select>
              <button onClick={add} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white inline-flex items-center gap-1" style={{ background: BRAND }}><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {master.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                  <CatDot color={categories[p.category]} title={p.category} />
                  <input value={p.title} onChange={(e) => rename(p.id, e.target.value)} onBlur={() => commitTitle(p.id)} className="flex-1 fs-12 text-gray-800 bg-transparent outline-none border-b border-transparent focus:border-gray-200 py-0.5" />
                  <select value={p.category} onChange={(e) => recat(p.id, e.target.value)} className="rounded-md border border-gray-200 px-1.5 py-1 fs-10 bg-white outline-none">{catKeys.map((c) => <option key={c}>{c}</option>)}</select>
                  <button onClick={() => remove(p.id)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between max-md:flex-wrap max-md:gap-2">
              <span className="fs-10 text-gray-400">{master.length} areas · changes apply to new meetings</span>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 max-sm:flex-wrap" style={{ background: '#fafafc' }}>
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-8 w-9 rounded cursor-pointer border border-gray-200 p-0.5" title="Pick a colour" />
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCat()} placeholder="Add a new category…" className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 fs-12 outline-none" />
              <button onClick={addCat} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white inline-flex items-center gap-1" style={{ background: BRAND }}><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {catKeys.map((name) => {
                const used = master.filter((p) => p.category === name).length;
                return (
                  <div key={name} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                    <input type="color" value={categories[name]} onChange={(e) => setCatColor(name, e.target.value)} onBlur={() => commitColor(name)} className="h-6 w-8 rounded cursor-pointer border border-gray-200 p-0.5" title="Change colour" />
                    <span className="flex-1 fs-12 font-medium text-gray-800">{name}</span>
                    <span className="fs-10 text-gray-400">{used} point{used === 1 ? '' : 's'}</span>
                    <button onClick={() => removeCat(name)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between max-md:flex-wrap max-md:gap-2">
              <span className="fs-10 text-gray-400">Deleting a category moves its points to another one</span>
              <button onClick={onClose} className="rounded-lg px-3 py-1.5 fs-12 font-semibold text-white" style={{ background: BRAND }}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}