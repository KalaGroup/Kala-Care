import React, { useState, useMemo, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ClipboardList, Building2, Plus, Trash2, CheckCircle2,
  AlertTriangle, CalendarDays, Users, X, CornerUpRight, Flag,
  BarChart3, Check, User, ListChecks, Zap, ChevronRight, ChevronLeft,
  FileText, MapPin, UserPlus, Download,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import * as XLSX from 'xlsx-js-style';

/* ============================================================
   THEME — everything on screen follows the Kala Care system
   brand (indigo). The green 00CC99 is used ONLY inside the
   exported Excel file, matching the sample sheet format.
   ============================================================ */
const BRAND = '#2f3192';
const BRAND_DARK = '#23255f';
const BRAND_SOFT = 'rgba(47,49,146,0.10)';
const SHEET = BRAND;                // sheet chrome = system brand
const SHEET_DARK = BRAND_DARK;
const SHEET_SOFT = BRAND_SOFT;
const SHEET_XLS = '00CC99';         // exact fill used in the Excel export only

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

const MEETING_TYPES = ['Monthly Branch Review', 'Weekly Sync', 'Special / Ad-hoc'];

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
   DEMO DATA — used only when the employees API is unreachable,
   so the page still works standalone.
   ============================================================ */
const DEMO_BRANCHES = [
  { code: 'HO', name: 'Pune Office', region: 'Head Office' },
  { code: 'B1', name: 'Ch.Sambhaji Nagar', region: 'Maharashtra' },
  { code: 'B2', name: 'Ahilyanagar', region: 'Maharashtra' },
  { code: 'B3', name: 'Beed', region: 'Maharashtra' },
  { code: 'B4', name: 'Nanded', region: 'Maharashtra' },
  { code: 'B5', name: 'Babhaleshwar', region: 'Maharashtra' },
  { code: 'B6', name: 'Latur', region: 'Maharashtra' },
  { code: 'B7', name: 'Parbhani', region: 'Maharashtra' },
  { code: 'B8', name: 'Hubli', region: 'Karnataka' },
  { code: 'B9', name: 'Belagavi', region: 'Karnataka' },
  { code: 'B10', name: 'Hospet', region: 'Karnataka' },
  { code: 'B11', name: 'Ballari', region: 'Karnataka' },
  { code: 'B12', name: 'Bagalkot', region: 'Karnataka' },
  { code: 'B13', name: 'Gulbarga', region: 'Karnataka' },
  { code: 'B14', name: 'Bijapur', region: 'Karnataka' },
];
const DEMO_STAFF = ['Rahul Deshmukh', 'Sneha Patil', 'Amit Kulkarni', 'Pooja Joshi',
  'Vikram Shetty', 'Anjali Rao', 'Suresh Naik', 'Kiran More'];

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
const isOverdue = (r) => r.flag === 'T' && r.status !== 'completed' && r.due && new Date(r.due) < today0();
const effStatus = (r) => r.status === 'completed' ? 'completed' : isOverdue(r) ? 'overdue' : r.status;
const autoGrow = (el) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
const daysFromDue = (due) => Math.round((today0() - new Date(due)) / 86400000); // +ve = overdue
const taskRows = (m) => m.rows.filter((r) => r.flag === 'T');
const progress = (m) => { const t = taskRows(m); return t.length ? Math.round(t.filter((r) => r.status === 'completed').length / t.length * 100) : 100; };

/* deterministic prng so demo history is stable between reloads */
const seeded = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, a) => a[Math.floor(r() * a.length)];

/* ============================================================
   SEED HISTORY (demo) — two past meetings per branch.
   Rows share a trackId across meetings, so pending Tasks carry
   forward with their full "Remarks - date" history, exactly like
   the accumulating remark columns in the Excel sample.
   ============================================================ */
const POINTS_POOL = [
  ['Close the MTD sales gap — push priority leads', 'Sales'],
  ['Recover top 3 overdue payments (>60 days)', 'Finance'],
  ['Finish AMC renewal calls for expiring contracts', 'Service'],
  ['Clear installation backlog from last fortnight', 'Service'],
  ['Resolve escalated customer complaint — 2nd visit', 'Service'],
  ['Call back monsoon-offer campaign leads', 'Marketing'],
  ['Reorder fast-moving spares (compressor, filters)', 'Service'],
  ['Fix repeated late check-ins of field team', 'People'],
  ['Submit pending TADA & OE vouchers', 'Finance'],
];
const REMARK_POOL = [
  'Discussed in detail, owner to follow up.',
  'Partially done — balance next week.',
  'Customer informed, awaiting confirmation.',
  'Escalated to HO for approval.',
  'On track, no blockers.',
  'Delayed due to staff shortage.',
];

function buildHistory() {
  const map = {};
  DEMO_BRANCHES.forEach((b, bi) => {
    const r = seeded(bi * 7919 + 13);
    const mgr = DEMO_STAFF[bi % DEMO_STAFF.length];
    const staff = [0, 1, 2, 3].map((i) => DEMO_STAFF[(bi + i) % DEMO_STAFF.length]);
    const att = (extra) => [
      ...staff.map((n, i) => ({ id: uid('a'), name: n, source: 'employee', present: i < 3 + (extra % 2) })),
      ...(extra ? [{ id: uid('a'), name: 'Guest — Area Manager', source: 'manual', present: true }] : []),
    ];

    /* ---- meeting 1 (≈35 days ago) ---- */
    const d1 = iso(addDays(new Date(), -35));
    const rows1 = Array.from({ length: 5 }).map((_, i) => {
      const [pt, cat] = POINTS_POOL[(bi + i) % POINTS_POOL.length];
      const area = DEFAULT_MASTER[(bi + i) % DEFAULT_MASTER.length];
      const isTask = i < 4;
      return {
        id: uid(), trackId: uid('t'), area: area.title, category: cat, point: pt,
        resp: isTask ? pick(r, staff) : '', due: isTask ? iso(addDays(new Date(d1), 7 + Math.floor(r() * 10))) : '',
        flag: isTask ? 'T' : 'I', status: isTask ? (r() < 0.4 ? 'completed' : 'in_progress') : 'pending',
        remark: pick(r, REMARK_POOL), originDate: d1, prevRemarks: [],
      };
    });
    const m1 = { id: uid('m'), branchCode: b.code, branchName: b.name, date: d1, location: `${b.name} — Branch Office`, type: 'Monthly Branch Review', conductedBy: mgr, attendees: att(0), rows: rows1 };

    /* ---- meeting 2 (≈7 days ago): carries m1's open tasks ---- */
    const d2 = iso(addDays(new Date(), -7));
    const carried = rows1.filter((x) => x.flag === 'T' && x.status !== 'completed').map((x) => ({
      ...x, id: uid(), carried: true,
      prevRemarks: [{ date: d1, text: x.remark, status: x.status, by: mgr }],
      status: r() < 0.45 ? 'completed' : r() < 0.5 ? 'in_progress' : 'pending',
      remark: pick(r, REMARK_POOL),
      due: r() < 0.3 ? iso(addDays(new Date(d2), 10)) : x.due, // sometimes extended
    }));
    const fresh = Array.from({ length: 3 }).map((_, i) => {
      const [pt, cat] = POINTS_POOL[(bi + i + 4) % POINTS_POOL.length];
      const area = DEFAULT_MASTER[(bi + i + 5) % DEFAULT_MASTER.length];
      const isTask = i < 2;
      return {
        id: uid(), trackId: uid('t'), area: area.title, category: cat, point: pt,
        resp: isTask ? pick(r, staff) : '', due: isTask ? iso(addDays(new Date(d2), 5 + Math.floor(r() * 12))) : '',
        flag: isTask ? 'T' : 'I', status: 'pending', remark: i === 2 ? 'Noted for information.' : '',
        originDate: d2, prevRemarks: [],
      };
    });
    const m2 = { id: uid('m'), branchCode: b.code, branchName: b.name, date: d2, location: `${b.name} — Conference Room`, type: 'Monthly Branch Review', conductedBy: mgr, attendees: att(1), rows: [...carried, ...fresh] };

    map[b.code] = [m2, m1];
  });
  return map;
}

/* Collect still-open Tasks for a branch (latest state per trackId). */
function collectCarry(history, branchCode) {
  const seen = new Set(); const out = [];
  (history[branchCode] || []).forEach((m) => {
    m.rows.forEach((r) => {
      if (r.flag !== 'T' || seen.has(r.trackId)) { if (r.trackId) seen.add(r.trackId); return; }
      seen.add(r.trackId);
      if (r.status !== 'completed') {
        out.push({
          ...r, id: uid(), carried: true, srcDate: m.date,
          prevRemarks: [...(r.prevRemarks || []), { date: m.date, text: r.remark || '', status: r.status, by: m.conductedBy }],
          remark: '',
        });
      }
    });
  });
  return out;
}

/* ============================================================
   EXCEL EXPORT — replicates the sample sheet exactly:
   • merged "Minutes of Meeting" title with 00CC99 fill
   • Date / Location block, Sr.No + Attendees, Action-Flag legend
   • main table: Sr.no | Discussion Area | Discussion points |
     Responsibility | Due Date | Action flag | Status |
     Remarks - <date> … (one column per past review) | current
   ============================================================ */
function exportMeetingExcel(m) {
  const thin = { style: 'thin', color: { rgb: 'FF9CA3AF' } };
  const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
  const S = {
    title: { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { fgColor: { rgb: SHEET_XLS } }, border: BORDER },
    label: { font: { bold: true, sz: 10 }, border: BORDER, alignment: { vertical: 'center' } },
    value: { font: { sz: 10 }, border: BORDER, alignment: { vertical: 'center', wrapText: true } },
    head: { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: SHEET_XLS } }, border: BORDER, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
    cell: { font: { sz: 10 }, border: BORDER, alignment: { vertical: 'top', wrapText: true } },
    cellC: { font: { sz: 10 }, border: BORDER, alignment: { horizontal: 'center', vertical: 'top' } },
  };
  const txt = (v, s) => ({ v: v ?? '', t: 's', s });

  /* remark-history columns: one per unique past review date */
  const histDates = [...new Set(m.rows.flatMap((r) => (r.prevRemarks || []).map((p) => p.date)))].sort();
  const FIXED = 7; // Sr.no … Status
  const totalCols = FIXED + histDates.length + 1;

  const aoa = []; const merges = [];
  const push = (row) => { aoa.push(row); return aoa.length - 1; };
  const pad = (row) => { while (row.length < totalCols) row.push(txt('', S.value)); return row; };

  /* Row 0 — merged title */
  push(pad([txt('Minutes of Meeting', S.title)]));
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

  /* Info block: labels A, values B · Sr.No C · Attendees D:F · legend G:H */
  const info = [
    ['Date:', fmtDDMMYY(m.date)], ['Location:', m.location || ''],
    ['Branch:', m.branchName || ''], ['Meeting Type:', m.type || ''],
    ['Conducted By:', m.conductedBy || ''],
  ];
  const present = m.attendees.filter((a) => a.present);
  const blockRows = Math.max(info.length, present.length + 1, 3);
  for (let i = 0; i < blockRows; i++) {
    const row = [];
    row[0] = txt(info[i]?.[0] || '', S.label);
    row[1] = txt(info[i]?.[1] || '', S.value);
    if (i === 0) { row[2] = txt('Sr. No.', S.label); row[3] = txt('Attendees:', S.label); }
    else if (present[i - 1]) {
      const a = present[i - 1];
      row[2] = txt(String(i), { ...S.cellC, alignment: { horizontal: 'center', vertical: 'center' } });
      row[3] = txt(a.name + (a.source === 'manual' ? '  (Manually added)' : ''), S.value);
    } else { row[2] = txt('', S.value); row[3] = txt('', S.value); }
    row[4] = txt('', S.value); row[5] = txt('', S.value);
    if (i === 0) { row[6] = txt('Action Flag', S.label); row[7] = txt('', S.label); }
    else if (i === 1) { row[6] = txt('T', S.label); row[7] = txt('Task', S.label); }
    else if (i === 2) { row[6] = txt('I', S.label); row[7] = txt('Information', S.label); }
    else { row[6] = txt('', S.value); row[7] = txt('', S.value); }
    const rIdx = push(pad(row));
    merges.push({ s: { r: rIdx, c: 3 }, e: { r: rIdx, c: 5 } });                 // attendee name D:F
    if (i === 0) merges.push({ s: { r: rIdx, c: 6 }, e: { r: rIdx, c: 7 } });    // "Action Flag" G:H
  }

  push(pad([]));                                                                  // spacer

  /* Table header */
  const head = ['Sr.no', 'Discussion Area', 'Discussion points', 'Responsibility', 'Due Date', 'Action flag', 'Status',
    ...histDates.map((d) => `Remarks - ${fmtDDMMYY(d)}`), `Remarks - ${fmtDDMMYY(m.date)}`];
  push(head.map((h) => txt(h, S.head)));

  /* Table body — carried rows first, then fresh */
  const ordered = [...m.rows.filter((r) => r.carried), ...m.rows.filter((r) => !r.carried)];
  ordered.forEach((r, i) => {
    const isT = r.flag === 'T';
    const row = [
      txt(String(i + 1) + (r.carried ? ' (C/F)' : ''), S.cellC),
      txt(r.area, S.cell),
      txt(r.point, S.cell),
      txt(r.resp || (isT ? '' : '-'), S.cell),
      txt(isT ? fmtDDMMYY(r.due) : '-', S.cellC),
      txt(r.flag, S.cellC),
      txt(isT ? STATUS[r.status]?.label || r.status : '-', S.cellC),
    ];
    histDates.forEach((d) => {
      const pr = (r.prevRemarks || []).find((p) => p.date === d);
      row.push(txt(pr ? pr.text : '', S.cell));
    });
    row.push(txt(r.remark || '', S.cell));
    push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 8 }, { wch: 26 }, { wch: 42 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 13 },
    ...histDates.map(() => ({ wch: 26 })), { wch: 28 }];
  ws['!rows'] = [{ hpt: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MOM');
  XLSX.writeFile(wb, `MOM_${(m.branchName || 'Branch').replace(/[^\w]+/g, '_')}_${m.date}.xlsx`);
}

/* ============================================================
   SMALL UI PIECES
   ============================================================ */
const StatusBadge = ({ r }) => {
  if (r.flag !== 'T') return <span className="fs-10 text-gray-300">—</span>;
  const s = STATUS[effStatus(r)];
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 fs-10 font-semibold" style={{ background: s.soft, color: s.color }}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />{s.label}</span>;
};
const FlagChip = ({ f, small }) => (
  <span className={`inline-flex items-center gap-1 rounded font-bold ${small ? 'px-1.5 py-0.5 fs-9' : 'px-2 py-0.5 fs-10'}`} style={{ background: FLAG[f].bg, color: FLAG[f].color }}>
    <span className="font-black">{f}</span>{!small && FLAG[f].label}
  </span>
);
const SourceBadge = ({ source }) => source === 'manual'
  ? <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }}><UserPlus size={9} /> Manually added</span>
  : <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 fs-9 font-bold" style={{ background: BRAND_SOFT, color: BRAND }}><User size={9} /> Employee</span>;
const CatDot = ({ color, title }) => <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color || '#94a3b8' }} title={title} />;
/* initials avatar — deterministic colour per name */
const AVATAR_HUES = ['#2f3192', '#0d9488', '#d97706', '#7c3aed', '#0ea5e9', '#e11d48', '#059669', '#b45309'];
const Avatar = ({ name, size = 22 }) => {
  const c = AVATAR_HUES[(name || '?').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_HUES.length];
  const init = (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42), background: c }}>{init}</span>;
};
const Bar2 = ({ v }) => (
  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#eef0f3' }}>
    <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? '#059669' : v >= 40 ? '#d97706' : '#dc2626', transition: 'width .3s' }} />
  </div>
);
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
const FlagLegend = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-3">
    <div className="fs-10 font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Flag size={11} /> Action Flag</div>
    <div className="space-y-1">
      <div className="flex items-center gap-2 fs-11"><FlagChip f="T" small /><span className="text-gray-600">Task — needs owner, due date &amp; status</span></div>
      <div className="flex items-center gap-2 fs-11"><FlagChip f="I" small /><span className="text-gray-600">Information — shared for awareness only</span></div>
    </div>
  </div>
);
/* previous remarks chips (the accumulating "Remarks - date" columns) */
const RemarkHistory = ({ list }) => !list?.length ? <span className="fs-10 text-gray-300">—</span> : (
  <div className="space-y-1">
    {list.map((p, i) => (
      <div key={i} className="fs-10 leading-snug">
        <span className="inline-block rounded px-1.5 py-0.5 font-bold mr-1.5" style={{ background: '#f1f5f9', color: '#475569' }}>{fmtDDMMYY(p.date)}</span>
        <span className="text-gray-600">{p.text || <i className="text-gray-400">status: {STATUS[p.status]?.label}</i>}</span>
      </div>
    ))}
  </div>
);

const FontScale = () => <style>{`@keyframes livedot{0%,100%{opacity:1}50%{opacity:.35}} @keyframes pop{0%{transform:scale(.4)}70%{transform:scale(1.2)}100%{transform:scale(1)}} .kc-pop{animation:pop .18s ease-out} .kc-lift{transition:transform .15s ease,box-shadow .15s ease} .kc-lift:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(35,37,95,.35)} .kc-input{background:#f7f8fc;border:1.5px solid #e6e9f0;border-radius:10px;transition:border-color .15s,box-shadow .15s,background .15s} .kc-input:focus,.kc-input:focus-within{background:#fff;border-color:#2f3192;box-shadow:0 0 0 3px rgba(47,49,146,.10);outline:none} .kc-grid{background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 1px,transparent 1px 13px),repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 1px,transparent 1px 13px)} .kc-scroll::-webkit-scrollbar{height:6px;width:6px} .kc-scroll::-webkit-scrollbar-thumb{background:#d5d9e6;border-radius:8px} .kc-scroll::-webkit-scrollbar-thumb:hover{background:#bfc5d8} .kc-scroll::-webkit-scrollbar-track{background:transparent} .fs-9{font-size:9px;line-height:1.3} .fs-10{font-size:10px;line-height:1.35} .fs-11{font-size:11px;line-height:1.4} .fs-12{font-size:12px;line-height:1.45} .fs-13{font-size:13px;line-height:1.45} .mom-sheet td,.mom-sheet th{border:1px solid #e2e8f0} .mom-sheet input,.mom-sheet select,.mom-sheet textarea{background:transparent;border-radius:6px;transition:box-shadow .12s,background .12s} .mom-sheet input:hover,.mom-sheet select:hover,.mom-sheet textarea:hover{background:#f6f8fc} .mom-sheet input:focus,.mom-sheet select:focus,.mom-sheet textarea:focus{background:#fff;box-shadow:inset 0 0 0 1.5px ${BRAND}55} .mom-sheet tbody tr:nth-child(even){background:#fbfcfe} .mom-sheet tbody tr:hover{background:#f2f6ff} .mom-sheet .no-ring:focus{box-shadow:none;background:#fff}`}</style>;

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
  const [masterOpen, setMasterOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [viewMtg, setViewMtg] = useState(null);
  const [histSource, setHistSource] = useState('loading'); // loading | api | demo
  const [saving, setSaving] = useState(false);
  const [showAllAtt, setShowAllAtt] = useState(false);   // attendee strip: collapsed by default
  const topScrollRef = useRef(null);      // synced horizontal scrollbar shown ABOVE the sheet
  const mainScrollRef = useRef(null);

  /* ---- employees from backend (fallback → demo staff) ---- */
  const [employees, setEmployees] = useState([]);
  const [empSource, setEmpSource] = useState('loading'); // loading | api | demo
  useEffect(() => {
    let alive = true;
    if (!me?.user_id || !API_BASE_URL) { setEmpSource('demo'); return; }
    axios.get(`${API_BASE_URL}/users/employees`, { headers: { 'user-id': me.user_id } })
      .then((res) => {
        if (!alive) return;
        if (res.data?.success && Array.isArray(res.data.employees)) {
          setEmployees(res.data.employees.filter((e) => !e.is_blocked));
          setEmpSource('api');
        } else setEmpSource('demo');
      })
      .catch(() => alive && setEmpSource('demo'));
    return () => { alive = false; };
  }, [me]);

  /* ---- MOM data from the backend (fallback → seeded demo history) ---- */
  useEffect(() => {
    let alive = true;
    const loadDemo = () => { if (!alive) return; setHistory(buildHistory()); setHistSource('demo'); };
    if (!API_BASE_URL) { loadDemo(); return; }
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
        (m.data.meetings || []).forEach((mt) => { (map[mt.branchCode] = map[mt.branchCode] || []).push(mt); });
        setHistory(map); setHistSource('api');
      } else loadDemo();
    }).catch(loadDemo);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* branch options: real branches from API when available, else demo */
  const branchOptions = useMemo(() => {
    if (empSource === 'api' && employees.length) {
      const seen = new Map();
      employees.forEach((e) => { if (e.branch && !seen.has(e.branch)) seen.set(e.branch, { code: e.branch, name: e.branch_name || e.branch, region: '' }); });
      return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    return DEMO_BRANCHES;
  }, [empSource, employees]);

  /* ---- meeting setup (Step 1 — "set all this before starting") ---- */
  const [step, setStep] = useState(1);                // 1 setup · 2 meeting sheet
  const [branch, setBranch] = useState(null);
  const [mDate, setMDate] = useState(iso(new Date()));  // Date = current by default
  const [mLocation, setMLocation] = useState('');
  const [mType, setMType] = useState(MEETING_TYPES[0]);
  const [attendees, setAttendees] = useState([]);
  const [manualName, setManualName] = useState('');
  const [picked, setPicked] = useState(new Set());    // which master points to discuss

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

  /* header pills — latest state per tracked task across all branches */
  const stats = useMemo(() => {
    let meetings = 0, open = 0, overdue = 0;
    Object.values(history).forEach((ms) => {
      meetings += ms.length;
      const seen = new Set();
      ms.forEach((m) => m.rows.forEach((r) => {
        if (r.flag !== 'T' || seen.has(r.trackId)) return;
        seen.add(r.trackId);
        if (r.status !== 'completed') { open++; if (isOverdue(r)) overdue++; }
      }));
    });
    return { meetings, open, overdue };
  }, [history]);

  const branchMeta = (code) => {
    const ms = history[code] || [];
    const seen = new Set(); let open = 0;
    ms.forEach((m) => m.rows.forEach((r) => { if (r.flag === 'T' && !seen.has(r.trackId)) { seen.add(r.trackId); if (r.status !== 'completed') open++; } }));
    return { last: ms[0]?.date, open, count: ms.length };
  };

  /* employees belonging to the chosen branch */
  const branchEmployees = (b) => {
    if (!b) return [];
    if (empSource === 'api') return employees.filter((e) => e.branch === b.code || e.branch_name === b.name).map((e) => ({ name: e.name, user_id: e.user_id }));
    const r = seeded(b.code.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
    const n = 4 + Math.floor(r() * 2);
    return Array.from({ length: n }).map((_, i) => DEMO_STAFF[(Math.floor(r() * 8) + i) % DEMO_STAFF.length]).filter((v, i, a) => a.indexOf(v) === i).map((name) => ({ name }));
  };

  /* ---------- Step-1 actions ---------- */
  const chooseBranch = (b) => {
    setBranch(b);
    setAttendees(branchEmployees(b).map((e) => ({ id: uid('a'), name: e.name, user_id: e.user_id, source: 'employee', present: true })));
    setPicked(new Set(master.map((p) => p.id)));   // all pre-ticked — untick what won't be discussed
    setRows([]); setCarry([]);                      // branch changed → discard any previous sheet data
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
    if (!branch) return ping('Select a branch first', 'err');
    if (!mLocation.trim()) return ping('Please set the meeting location', 'err');
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
        point: '', resp: '', due: '', flag: 'I', status: 'pending', remark: '',
        originDate: mDate, prevRemarks: [],
      }));
      return [...fromMaster, ...custom];
    });
    setCarry((prev) => prev.length ? prev : collectCarry(history, branch.code));
    setStep(2);
  };
  const resetWizard = () => {
    setStep(1); setBranch(null); setAttendees([]); setManualName(''); setPicked(new Set()); setShowAllAtt(false);
    setMDate(iso(new Date())); setMLocation(''); setMType(MEETING_TYPES[0]);
    setRows([]); setCarry([]);
  };

  /* ---------- Step-2 (sheet) actions ---------- */
  const presentNames = attendees.filter((a) => a.present).map((a) => a.name);
  const ATT_PREVIEW = 6;                                   // chips shown before "+N more"
  const attPreview = showAllAtt ? attendees : attendees.slice(0, ATT_PREVIEW);
  const attHidden = Math.max(0, attendees.length - ATT_PREVIEW);
  const updRow = (id, patch) => setRows((p) => p.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    /* assigning a responsibility on an Information row promotes it to a Task */
    if (patch.resp && r.flag === 'I') { next.flag = 'T'; if (!next.due) next.due = iso(addDays(new Date(mDate), 7)); }
    if (patch.flag === 'T' && !next.due) next.due = iso(addDays(new Date(mDate), 7));
    if (patch.flag === 'I') { next.resp = ''; next.due = ''; next.status = 'pending'; }
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
    setRows((p) => [...p, { id: uid(), trackId: uid('t'), masterId: null, area: a, category: newCat, point: '', resp: '', due: '', flag: 'I', status: 'pending', remark: '', originDate: mDate, prevRemarks: [] }]);
    setNewArea(''); ping('Row added to the sheet');
  };
  const updCarry = (id, patch) => setCarry((p) => p.map((c) => c.id === id ? { ...c, ...patch } : c));

  const taskCount = rows.filter((r) => r.flag === 'T').length + carry.filter((c) => c.status !== 'completed').length;
  const infoCount = rows.filter((r) => r.flag === 'I' && (r.point.trim() || r.remark.trim())).length;
  const blankCount = rows.filter((r) => r.flag === 'I' && !r.point.trim() && !r.remark.trim() && !r.resp).length;
  const unassigned = rows.filter((r) => r.flag === 'T' && !r.resp).length;

  const finalize = () => {
    if (unassigned) return ping(`${unassigned} Task row(s) have no Responsibility — assign or switch them to "I"`, 'err');
    if (taskCount === 0 && infoCount === 0 && carry.length === 0)
      return ping('Nothing recorded yet — note at least one point or assign a task', 'err');
    setConfirm({
      title: 'Finalize minutes?',
      meta: `${branch.name} · ${fmt(mDate)} · ${mType}`,
      stats: [
        { label: 'Tasks assigned', value: taskCount, color: '#d97706', icon: Zap },
        { label: 'Information', value: infoCount, color: '#2563eb', icon: FileText },
        { label: 'Carried reviewed', value: carry.length, color: '#b45309', icon: CornerUpRight },
      ],
      note: blankCount ? `${blankCount} untouched blank row${blankCount > 1 ? 's' : ''} will be skipped.` : '',
      onYes: () => {
        const kept = rows.filter((r) => !(r.flag === 'I' && !r.point.trim() && !r.remark.trim() && !r.resp));
        const allRows = [...carry, ...kept];
        if (histSource === 'api') {
          setSaving(true);
          const payload = {
            branchCode: branch.code, branchName: branch.name, date: mDate,
            location: mLocation.trim(), type: mType,
            attendees: attendees.map((a) => ({ name: a.name, source: a.source, present: a.present, user_id: a.user_id || null })),
            rows: allRows.map((r) => ({
              trackId: r.trackId, masterId: r.masterId ?? null, area: r.area, category: r.category,
              point: r.point || '', resp: r.resp || '', due: r.due || '', flag: r.flag,
              status: r.status, remark: r.remark || '', originDate: r.originDate || r.srcDate || '',
              carried: !!r.carried, prevRemarks: r.prevRemarks || [],
            })),
          };
          axios.post(`${MOM_API}/meetings`, payload, { headers: authHeaders })
            .then((res) => {
              if (!res.data?.success) throw new Error('Save failed');
              const mt = res.data.meeting;
              setHistory((h) => ({ ...h, [mt.branchCode]: [mt, ...(h[mt.branchCode] || [])] }));
              setConfirm(null); ping('Minutes saved'); resetWizard(); setView('history');
            })
            .catch((e) => ping(e?.response?.data?.detail || 'Could not save minutes — is the server running?', 'err'))
            .finally(() => setSaving(false));
        } else {
          const mtg = {
            id: uid('m'), branchCode: branch.code, branchName: branch.name,
            date: mDate, location: mLocation.trim(), type: mType,
            conductedBy: me?.name || 'Master Admin',
            attendees, rows: allRows,
          };
          setHistory((h) => ({ ...h, [branch.code]: [mtg, ...(h[branch.code] || [])] }));
          setConfirm(null); ping('Minutes saved (demo — not persisted)'); resetWizard(); setView('history');
        }
      },
    });
  };

  /* delete a saved meeting (Master Admin, API mode) */
  const deleteMeeting = (m) => setConfirm({
    title: 'Delete this meeting?',
    meta: `${m.branchName} · ${fmt(m.date)} · ${m.type}`,
    note: 'This permanently removes the sheet, its attendees and all rows.',
    yesLabel: 'Yes, delete',
    onYes: async () => {
      try {
        await axios.delete(`${MOM_API}/meetings/${m.id}`, { headers: authHeaders });
        setHistory((h) => ({ ...h, [m.branchCode]: (h[m.branchCode] || []).filter((x) => x.id !== m.id) }));
        setConfirm(null); ping('Meeting deleted');
      } catch (e) { ping(e?.response?.data?.detail || 'Could not delete meeting', 'err'); }
    },
  });

  /* Master-setup persistence (null in demo mode → modal stays local-only) */
  const persist = histSource === 'api' ? {
    addPoint: (title, category) => axios.post(`${MOM_API}/master-points`, { title, category }, { headers: authHeaders }).then((r) => r.data.item),
    updatePoint: (id, data) => axios.put(`${MOM_API}/master-points/${id}`, data, { headers: authHeaders }),
    deletePoint: (id) => axios.delete(`${MOM_API}/master-points/${id}`, { headers: authHeaders }),
    addCategory: (name, color) => axios.post(`${MOM_API}/categories`, { name, color }, { headers: authHeaders }),
    updateCategory: (name, color) => axios.put(`${MOM_API}/categories/${encodeURIComponent(name)}`, { color }, { headers: authHeaders }),
    deleteCategory: (name) => axios.delete(`${MOM_API}/categories/${encodeURIComponent(name)}`, { headers: authHeaders }),
  } : null;

  /* export the live draft too */
  const exportDraft = () => exportMeetingExcel({
    branchName: branch?.name, date: mDate, location: mLocation, type: mType,
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
              {[{ n: 1, label: 'Meeting setup', sub: branch ? `${branch.name} · ${picked.size} points` : 'location · attendees · points' },
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
                <span className="fs-11 font-semibold text-gray-500">Branch <span className="text-red-400">*</span></span>
                <select value={branch?.code || ''} onChange={(e) => { const b = branchOptions.find((x) => x.code === e.target.value); if (b) chooseBranch(b); }}
                  className="kc-input mt-1 w-full px-3 py-2 fs-12 text-gray-700">
                  <option value="" disabled>Select branch…</option>
                  {branchOptions.map((b) => <option key={b.code} value={b.code}>{b.name}{b.region ? ` — ${b.region}` : ''}</option>)}
                </select>
                {branch && (() => { const meta = branchMeta(branch.code); return (
                  <div className="mt-1 fs-10 text-gray-400">last meeting {fmt(meta.last)}{meta.open > 0 && <span className="ml-2 rounded-full px-1.5 py-0.5 font-bold" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>{meta.open} open task{meta.open > 1 ? 's' : ''} will carry forward</span>}</div>
                ); })()}
              </label>

              <label className="block">
                <span className="fs-11 font-semibold text-gray-500">Date <span className="fs-9 font-normal">(defaults to today)</span></span>
                <div className="kc-input mt-1 flex items-center gap-2 px-3 py-2">
                  <CalendarDays size={14} className="text-gray-400" />
                  <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className="w-full fs-12 text-gray-700 outline-none bg-transparent" />
                </div>
              </label>

              <label className="block">
                <span className="fs-11 font-semibold text-gray-500">Location <span className="text-red-400">*</span></span>
                <div className="kc-input mt-1 flex items-center gap-2 px-3 py-2">
                  <MapPin size={14} className="text-gray-400" />
                  <input value={mLocation} onChange={(e) => setMLocation(e.target.value)} placeholder="e.g. Branch Office — Conference Room" className="w-full fs-12 text-gray-700 outline-none bg-transparent" />
                </div>
              </label>

              <label className="block">
                <span className="fs-11 font-semibold text-gray-500">Meeting type</span>
                <select value={mType} onChange={(e) => setMType(e.target.value)} className="kc-input mt-1 w-full px-3 py-2 fs-12 text-gray-700">
                  {MEETING_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>

              <FlagLegend />
            </div>

            {/* ---- attendees ---- */}
            <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: BRAND_SOFT }}><Users size={15} style={{ color: BRAND }} /></span>
                  <h2 className="text-[13px] font-bold text-gray-800">Attendees</h2>
                  {branch
                    ? <span className="fs-11 text-gray-400">branch employees of <b className="text-gray-600">{branch.name}</b> loaded automatically{empSource === 'demo' && ' (demo — employees API not reachable)'}</span>
                    : <span className="fs-11 text-gray-400">select a branch to auto-load its employees</span>}
                </div>
                <span className="fs-10 rounded-full px-2 py-0.5 font-bold" style={{ background: BRAND_SOFT, color: BRAND }}>
                  {attendees.filter((a) => a.present).length} present / {attendees.length}
                </span>
              </div>

              {/* attendee table — mirrors the "Sr. No. | Attendees" block of the sheet */}
              <div className="flex-1 overflow-y-auto kc-scroll max-lg:overflow-x-auto" style={{ maxHeight: '21rem' }}>
                {attendees.length === 0 ? (
                  <div className="p-8 text-center fs-12 text-gray-400">No attendees yet — pick a branch, its employees will appear here.</div>
                ) : (
                  <table className="w-full fs-12 max-md:min-w-[480px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="sticky top-0 z-10 px-4 py-2 font-semibold border-b border-gray-100" style={{ width: '4rem', background: '#f7f8fc' }}>Sr. No.</th>
                        <th className="sticky top-0 z-10 px-3 py-2 font-semibold border-b border-gray-100" style={{ background: '#f7f8fc' }}>Attendee</th>
                        <th className="sticky top-0 z-10 px-3 py-2 font-semibold border-b border-gray-100" style={{ background: '#f7f8fc' }}>Source</th>
                        <th className="sticky top-0 z-10 px-3 py-2 font-semibold text-center border-b border-gray-100" style={{ width: '7rem', background: '#f7f8fc' }}>Present</th>
                        <th className="sticky top-0 z-10 border-b border-gray-100" style={{ width: '3rem', background: '#f7f8fc' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {attendees.map((a, i) => (
                        <tr key={a.id} className={`border-t border-gray-50 ${!a.present ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar name={a.name} size={24} /><span className="font-medium text-gray-800">{a.name}</span></div></td>
                          <td className="px-3 py-2"><SourceBadge source={a.source} /></td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => togglePresent(a.id)} className="inline-flex items-center gap-1.5 fs-10 font-semibold" style={{ color: a.present ? '#059669' : '#9ca3af' }} title={a.present ? 'Mark absent' : 'Mark present'}>
                              <span className="relative rounded-full transition-colors" style={{ width: 30, height: 17, background: a.present ? '#059669' : '#d7dbe4' }}>
                                <span className="absolute rounded-full bg-white shadow transition-all" style={{ width: 13, height: 13, top: 2, left: a.present ? 15 : 2 }} />
                              </span>
                              {a.present ? 'Present' : 'Absent'}
                            </button>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {a.source === 'manual' && <button onClick={() => removeAttendee(a.id)} className="text-gray-300 hover:text-red-500" title="Remove"><Trash2 size={14} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* add manually */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 max-sm:flex-wrap" style={{ background: '#fafafc' }}>
                <UserPlus size={14} className="text-gray-400 flex-shrink-0" />
                <input value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManual()}
                  placeholder="Add an attendee manually (guest, HO visitor, area manager…)" className="flex-1 fs-12 bg-transparent outline-none text-gray-700" disabled={!branch} />
                <button onClick={addManual} disabled={!branch} className="rounded-lg px-3 py-1.5 fs-11 font-semibold text-white disabled:opacity-40" style={{ background: BRAND }}>Add manually</button>
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
                <span className="fs-11 text-gray-400">Set everything above first — the meeting sheet opens with these details locked in. Extra points can still be added live during the meeting.</span>
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
                {[['Date', fmt(mDate), CalendarDays], ['Location', mLocation, MapPin], ['Branch', branch?.name, Building2], ['Meeting type', mType, FileText]].map(([l, v, Icon]) => (
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
                      {a.source === 'manual' && (
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
                  {/* late joiners can be added mid-meeting */}
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 pl-2 pr-1 py-1">
                    <UserPlus size={11} className="text-gray-400" />
                    <input value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManual()}
                      placeholder="Add attendee…" className="fs-10 bg-transparent outline-none text-gray-700" style={{ width: '7.5rem' }} />
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
                  <table className="mom-sheet w-full fs-12" style={{ borderCollapse: 'collapse', minWidth: '68rem' }}>
                    <thead>
                      <tr className="text-left" style={{ background: '#fdf6ec', color: '#92600a' }}>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.5rem' }}>Sr</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '15rem' }}>Discussion Area / Point</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '12rem' }}>Responsibility</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8.5rem' }}>Due Date</th>
                        <th className="px-2 py-2 fs-11 font-bold text-center" style={{ width: '3.5rem' }}>Flag</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ width: '11rem' }}>Status</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '13rem' }}>Previous remarks</th>
                        <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '13rem' }}>Remark — this meeting</th>
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
                              <select value={c.resp || ''} onChange={(e) => updCarry(c.id, { resp: e.target.value })} className="w-full fs-11 text-gray-700 outline-none px-1 py-1.5 rounded" title="Reassign this task">
                                <option value="">— Unassigned —</option>
                                {presentNames.map((n) => <option key={n} value={n}>{n}</option>)}
                                {c.resp && !presentNames.includes(c.resp) && <option value={c.resp}>{c.resp} (absent)</option>}
                              </select>
                            </td>
                            <td className="px-1 py-1"><input type="date" value={c.due} onChange={(e) => updCarry(c.id, { due: e.target.value })} className="w-full fs-11 text-gray-700 outline-none px-1 py-1 rounded" title="Extend / change due date" /></td>
                            <td className="px-2 py-2 text-center"><FlagChip f={c.flag} small /></td>
                            <td className="px-2 py-2"><SegStatus value={c.status} onChange={(v) => updCarry(c.id, { status: v })} /></td>
                            <td className="px-2 py-2"><RemarkHistory list={c.prevRemarks} /></td>
                            <td className="px-1 py-1"><input value={c.remark} onChange={(e) => updCarry(c.id, { remark: e.target.value })} placeholder="Remark for this meeting…" className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded" /></td>
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
                  <span className="fs-10 text-gray-400">selected points pre-filled · assign as Task (T) or mark Information (I)</span>
                </div>
                <span className="fs-10 text-gray-400">{rows.filter((r) => r.flag === 'T').length} tasks · {infoCount} info</span>
              </div>
              <div ref={topScrollRef} onScroll={() => { if (mainScrollRef.current && topScrollRef.current) mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft; }} className="overflow-x-auto kc-scroll border-b border-gray-50" style={{ height: 10 }}>
                <div style={{ width: '76.5rem', height: 1 }} />
              </div>
              <div ref={mainScrollRef} onScroll={() => { if (mainScrollRef.current && topScrollRef.current) topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft; }} className="overflow-x-auto kc-scroll">
                <table className="mom-sheet w-full fs-12" style={{ borderCollapse: 'collapse', minWidth: '76.5rem' }}>
                  <thead>
                    <tr className="text-left" style={{ background: '#f1f3fb', color: BRAND_DARK }}>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.8rem' }}>Sr.no</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '13rem' }}>Discussion Area</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '16rem' }}>Discussion points</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '12.5rem' }}>Responsibility</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8.5rem' }}>Due Date</th>
                      <th className="px-2 py-2 fs-11 font-bold text-center" style={{ width: '5.5rem' }}>Action flag</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ width: '8.5rem' }}>Status</th>
                      <th className="px-2 py-2 fs-11 font-bold" style={{ minWidth: '13rem' }}>Remarks</th>
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
                            <select value={r.resp} onChange={(e) => updRow(r.id, { resp: e.target.value })} className="w-full fs-11 text-gray-700 outline-none px-1 py-1.5 rounded" title="Assign to an attendee (turns the row into a Task)">
                              <option value="">— Unassigned —</option>
                              {presentNames.map((n) => <option key={n} value={n}>{n}</option>)}
                              {r.resp && !presentNames.includes(r.resp) && <option value={r.resp}>{r.resp} (absent)</option>}
                            </select>
                          </td>
                          <td className="px-1 py-1">
                            {isT
                              ? <input type="date" value={r.due} onChange={(e) => updRow(r.id, { due: e.target.value })} className="w-full fs-11 text-gray-700 outline-none px-1 py-1 rounded" />
                              : <div className="text-center fs-11 text-gray-300">—</div>}
                          </td>
                          <td className="px-2 py-2 text-center"><FlagToggle value={r.flag} onChange={(f) => updRow(r.id, { flag: f })} /></td>
                          <td className="px-1 py-1">
                            {isT ? (
                              <select value={r.status} onChange={(e) => updRow(r.id, { status: e.target.value })} className="w-full fs-11 font-semibold outline-none px-1.5 py-1.5 rounded-lg" style={{ color: STATUS[r.status].color, background: STATUS[r.status].soft }}>
                                <option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
                              </select>
                            ) : <div className="text-center fs-11 text-gray-300">—</div>}
                          </td>
                          <td className="px-1 py-1"><input value={r.remark} onChange={(e) => updRow(r.id, { remark: e.target.value })} placeholder="Remark…" className="no-ring w-full fs-11 text-gray-700 outline-none px-1.5 py-1.5 rounded" /></td>
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
        {view === 'history' && <HistoryView history={history} branches={branchOptions} onView={setViewMtg} onDelete={deleteMeeting} canDelete={histSource === 'api' && me?.role === 'master_admin'} canExport={canExport} source={histSource} />}

        {/* ===== REPORTS ===== */}
        {view === 'reports' && <ReportsView history={history} branches={branchOptions} />}
      </div>

      {/* ===== MASTER SETUP MODAL ===== */}
      {masterOpen && <MasterModal master={master} setMaster={setMaster} categories={categories} setCategories={setCategories} persist={persist} onClose={() => setMasterOpen(false)} ping={ping} />}

      {/* ===== VIEW MEETING (sheet replica) ===== */}
      {viewMtg && <MeetingSheetModal data={viewMtg} categories={categories} canExport={canExport} onClose={() => setViewMtg(null)} />}

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
function MeetingSheetModal({ data, categories, canExport, onClose }) {
  const [showAll, setShowAll] = useState(false);
  const catColor = (n) => (categories && categories[n]) || '#94a3b8';
  const present = data.attendees.filter((a) => a.present);
  const ordered = [...data.rows.filter((r) => r.carried), ...data.rows.filter((r) => !r.carried)];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '92vh' }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-4 py-3 flex items-start justify-between rounded-t-2xl border-b border-gray-100 max-md:flex-wrap max-md:gap-2" style={{ background: 'linear-gradient(120deg, #f6f7fd, #eef0fa)' }}>
          <div>
            <div className="fs-9 uppercase tracking-wide text-gray-400" style={{ letterSpacing: '0.14em' }}>Minutes of Meeting</div>
            <div className="text-base font-bold text-gray-800">{data.branchName}</div>
            <div className="fs-10 mt-0.5 text-gray-500 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {fmt(data.date)}</span>
              {data.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {data.location}</span>}
              <span>{data.type}</span><span>by {data.conductedBy}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 max-md:flex-wrap">
            {canExport && <button onClick={() => exportMeetingExcel(data)} className="kc-lift inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 fs-11 font-bold max-sm:text-xs max-sm:px-2" style={{ borderColor: '#dfe3f2', color: BRAND }}><Download size={13} /> Download Excel</button>}
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

          {/* the sheet */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="mom-sheet w-full fs-11" style={{ borderCollapse: 'collapse', minWidth: '64rem' }}>
              <thead>
                <tr className="text-left" style={{ background: '#f1f3fb', color: BRAND_DARK }}>
                  <th className="px-2 py-2 fs-11 font-bold" style={{ width: '2.8rem' }}>Sr.no</th>
                  <th className="px-2 py-2 fs-11 font-bold">Discussion Area</th>
                  <th className="px-2 py-2 fs-11 font-bold">Discussion points</th>
                  <th className="px-2 py-2 fs-11 font-bold">Responsibility</th>
                  <th className="px-2 py-2 fs-11 font-bold">Due Date</th>
                  <th className="px-2 py-2 fs-11 font-bold text-center">Flag</th>
                  <th className="px-2 py-2 fs-11 font-bold">Status</th>
                  <th className="px-2 py-2 fs-11 font-bold">Remarks (history)</th>
                  <th className="px-2 py-2 fs-11 font-bold">Remark — {fmtDDMMYY(data.date)}</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2 text-center text-gray-500">{i + 1}{r.carried && <div className="fs-9 font-bold" style={{ color: '#b45309' }}>C/F</div>}</td>
                    <td className="px-2 py-2"><div className="flex items-center gap-1.5"><CatDot color={catColor(r.category)} title={r.category} /><span className="font-semibold text-gray-800">{r.area}</span></div></td>
                    <td className="px-2 py-2 text-gray-700">{r.point || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-gray-700">{r.resp || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-2 text-gray-600">{r.flag === 'T' ? fmt(r.due) : '—'}</td>
                    <td className="px-2 py-2 text-center"><FlagChip f={r.flag} small /></td>
                    <td className="px-2 py-2"><StatusBadge r={r} /></td>
                    <td className="px-2 py-2"><RemarkHistory list={r.prevRemarks} /></td>
                    <td className="px-2 py-2 text-gray-700">{r.remark || <span className="text-gray-300">—</span>}</td>
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
   HISTORY VIEW
   ============================================================ */
function HistoryView({ history, branches, onView, onDelete, canDelete, canExport, source }) {
  const [code, setCode] = useState(branches[0]?.code);
  const meetings = history[code] || [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
      <aside className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-fit">
        <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700 flex items-center gap-2"><Building2 size={14} style={{ color: BRAND }} /> Branches{source === 'demo' && <span className="ml-auto fs-9 font-bold rounded-full px-1.5 py-0.5" style={{ background: 'rgba(217,119,6,0.14)', color: '#b45309' }} title="MOM API not reachable — showing sample data">demo</span>}</div>
        <div className="overflow-y-auto kc-scroll" style={{ maxHeight: '24rem' }}>
          {branches.map((b) => (
            <button key={b.code} onClick={() => setCode(b.code)} className="w-full text-left px-3 py-2 border-b border-gray-50 transition" style={code === b.code ? { background: BRAND_SOFT } : {}}>
              <div className="fs-12 font-medium" style={code === b.code ? { color: BRAND } : { color: '#374151' }}>{b.name}</div>
              <div className="fs-10 text-gray-400">{(history[b.code] || []).length} meetings</div>
            </button>
          ))}
        </div>
      </aside>
      <div className="lg:col-span-3 space-y-2.5">
        {source === 'loading' && <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center fs-12 text-gray-400">Loading meetings…</div>}
        {source !== 'loading' && meetings.length === 0 && <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center fs-12 text-gray-400">No meetings recorded for this branch yet — finalize one from “New meeting”.</div>}
        {meetings.map((m) => {
          const tasks = taskRows(m); const pr = progress(m);
          const open = tasks.filter((r) => r.status !== 'completed').length;
          return (
            <div key={m.id} className="kc-lift rounded-2xl border border-gray-200 bg-white shadow-sm p-3 flex items-center gap-3 flex-wrap">
              <div className="h-11 w-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0" style={{ background: '#eef0fa', color: BRAND, border: '1px solid #e2e6f5' }}>
                <span className="text-sm font-bold leading-none">{new Date(m.date).getDate()}</span>
                <span className="fs-9 leading-none mt-0.5">{new Date(m.date).toLocaleDateString(undefined, { month: 'short' })}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="fs-12 font-bold text-gray-800">{m.type}</div>
                <div className="fs-10 text-gray-400 truncate">{fmt(m.date)} · {m.location || '—'} · by {m.conductedBy} · {m.attendees.filter((a) => a.present).length} present</div>
              </div>
              <div className="text-center"><div className="text-sm font-bold text-gray-800">{m.rows.length}</div><div className="fs-9 text-gray-400">rows</div></div>
              <div className="text-center"><div className="text-sm font-bold text-gray-800">{tasks.length}</div><div className="fs-9 text-gray-400">tasks</div></div>
              <div className="w-24">
                <div className="flex justify-between fs-9 mb-1"><span className="text-gray-400">{pr}% closed</span>{open > 0 && <span className="font-semibold text-red-500">{open} open</span>}</div>
                <Bar2 v={pr} />
              </div>
              {canExport && <button onClick={() => exportMeetingExcel(m)} title="Download Excel" className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"><Download size={14} /></button>}
              {canDelete && <button onClick={() => onDelete(m)} title="Delete meeting" className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>}
              <button onClick={() => onView(m)} className="kc-lift rounded-lg px-3 py-1.5 fs-12 font-bold text-white" style={{ background: `linear-gradient(120deg, ${BRAND}, ${BRAND_DARK})` }}>View sheet</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   REPORTS VIEW — latest state per tracked task (no double count)
   ============================================================ */
function ReportsView({ history, branches }) {
  const d = useMemo(() => {
    let completed = 0, inProgress = 0, pending = 0, overdue = 0, total = 0, meetings = 0;
    const perBranch = branches.map((b) => {
      const ms = history[b.code] || []; meetings += ms.length;
      const seen = new Set(); let bDone = 0, bTot = 0, bOpen = 0, bOver = 0;
      ms.forEach((m) => m.rows.forEach((r) => {
        if (r.flag !== 'T' || seen.has(r.trackId)) return;
        seen.add(r.trackId); total++; bTot++;
        if (r.status === 'completed') { completed++; bDone++; }
        else {
          bOpen++;
          if (isOverdue(r)) { overdue++; bOver++; }
          else if (r.status === 'in_progress') inProgress++;
          else pending++;
        }
      }));
      return { name: b.name, last: ms[0]?.date, meetings: ms.length, open: bOpen, overdue: bOver, completion: bTot ? Math.round(bDone / bTot * 100) : 0 };
    });
    return {
      perBranch, meetings,
      completion: total ? Math.round(completed / total * 100) : 0, overdue,
      avg: meetings ? (total / meetings).toFixed(1) : 0,
      pie: [
        { name: 'Completed', value: completed, color: '#059669' },
        { name: 'In Progress', value: inProgress, color: '#d97706' },
        { name: 'Pending', value: pending, color: '#64748b' },
        { name: 'Overdue', value: overdue, color: '#dc2626' },
      ],
      compBar: perBranch.map((b) => ({ name: b.name, completion: b.completion })),
    };
  }, [history, branches]);

  const KPI = ({ icon: Icon, label, value, color }) => (
    <div className="kc-lift flex items-center gap-3 rounded-2xl border border-gray-200 bg-white shadow-sm px-3.5 py-3">
      <span className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}><Icon size={19} style={{ color }} /></span>
      <div><div className="text-xl font-extrabold text-gray-800 tabular-nums leading-none">{value}</div><div className="fs-10 text-gray-500 mt-1">{label}</div></div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KPI icon={CalendarDays} label="Total meetings" value={d.meetings} color={BRAND} />
        <KPI icon={CheckCircle2} label="Task completion" value={`${d.completion}%`} color="#059669" />
        <KPI icon={AlertTriangle} label="Overdue tasks" value={d.overdue} color="#dc2626" />
        <KPI icon={Zap} label="Avg tasks / meeting" value={d.avg} color="#d97706" />
      </div>
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
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2.5 border-b border-gray-100 fs-12 font-bold text-gray-700">Branch-wise summary</div>
        <div className="overflow-x-auto kc-scroll">
          <table className="w-full fs-12 max-md:min-w-[600px]">
            <thead><tr className="text-left text-gray-500" style={{ background: SHEET_SOFT }}>
              <th className="px-3 py-1.5 font-semibold">Branch</th><th className="px-3 py-1.5 font-semibold">Last meeting</th>
              <th className="px-3 py-1.5 font-semibold text-center">Meetings</th><th className="px-3 py-1.5 font-semibold text-center">Open</th>
              <th className="px-3 py-1.5 font-semibold text-center">Overdue</th><th className="px-3 py-1.5 font-semibold" style={{ width: '8rem' }}>Completion</th>
            </tr></thead>
            <tbody>
              {d.perBranch.map((b) => (
                <tr key={b.name} style={{ borderTop: '1px solid #f6f6f9' }}>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{b.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{fmt(b.last)}</td>
                  <td className="px-3 py-1.5 text-center text-gray-700">{b.meetings}</td>
                  <td className="px-3 py-1.5 text-center text-gray-700">{b.open}</td>
                  <td className="px-3 py-1.5 text-center">{b.overdue > 0 ? <span className="font-semibold text-red-500">{b.overdue}</span> : <span className="text-gray-300">0</span>}</td>
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