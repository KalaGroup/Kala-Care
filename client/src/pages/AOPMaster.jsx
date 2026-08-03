import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  PresentationChartLineIcon, PlusIcon, ArrowPathIcon,
  ArrowDownTrayIcon, BuildingOffice2Icon, XMarkIcon,
  TagIcon, CheckIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// PMS → AOP Master
//   Tab 1: Target Master   — branch-wise monthly Spare / Labour targets
//   Tab 2: SR Type Master  — Service Report Type → Head mapping
// Backend: server/app/routes/pms_routes.py (master admin only)
// ============================================================================

const API = import.meta.env.VITE_BACKEND_URL;

// -- Theme (same as Knowledge Bank) --------------------------------
const themeColor = '#2f3192';
const themeDark = '#23255f';
const themeSoft = 'rgba(47, 49, 146, 0.10)';

// Headers every PMS call sends — backend enforces master admin.
const authHeaders = () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  return { 'user-id': String(u.user_id || ''), 'user-role': u.role || '' };
};

const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

const currentMonth = () => new Date().toISOString().slice(0, 7);

// Targets are ENTERED and DISPLAYED in Lakh (23 = ₹23,00,000) but stored in
// rupees in the DB, which is what the report math uses.
const LAKH = 100000;
const rupeesToLakh = (v) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '';
  return n === 0 ? 0 : parseFloat((n / LAKH).toFixed(4));
};
const lakhToRupees = (v) => (parseFloat(v) || 0) * LAKH;
const lakhRow = (r) => ({
  ...r,
  spare_target: rupeesToLakh(r.spare_target),
  labour_target: rupeesToLakh(r.labour_target),
});

const inputCls =
  'w-full border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-1';
// Grid-style tables — every cell bordered.
const thCls =
  'px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap bg-gray-50 border border-gray-200';
const tdCls = 'px-2 py-1 border border-gray-200';

// ---------------------------------------------------------------------------

const AOPMaster = () => {
  const [tab, setTab] = useState('targets'); // 'targets' | 'srtypes'

  // ---- Target Master state ----
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  // Working days of the month (default = all days except Sundays; editable)
  const [workingDays, setWorkingDays] = useState('');
  const [defaultWd, setDefaultWd] = useState(null);

  // ---- SR Type Master state ----
  const [srItems, setSrItems] = useState([]);
  const [headChoices, setHeadChoices] = useState(['Warranty', 'Post Warranty', 'AMC', 'KOEL AMC', 'OTC Order']);
  const [heads, setHeads] = useState([]);          // Head master rows [{id, name}]
  const [newHead, setNewHead] = useState('');
  const [showHeadModal, setShowHeadModal] = useState(false);
  const [loadingSr, setLoadingSr] = useState(false);
  const [savingSr, setSavingSr] = useState(false);

  // ---------------- Target Master ----------------

  const loadTargets = useCallback(async (m) => {
    setLoadingTargets(true);
    try {
      const res = await fetch(`${API}/pms/targets?month=${m}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load targets');
      // Prefilled rows (all ERP branches + their Branch Admin) arrive unsaved —
      // marked dirty so “Save All” stores them. Rupees → Lakh for display.
      setRows((data.items || []).map((r) => ({ ...lakhRow(r), _dirty: !!data.prefill })));
      setWorkingDays(String(data.working_days ?? ''));
      setDefaultWd(data.default_working_days ?? null);
    } catch (e) {
      toast.error(e.message);
      setRows([]);
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  useEffect(() => { loadTargets(month); }, [month, loadTargets]);

  const setRow = (idx, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value, _dirty: true } : r)));
  };

  const saveTargets = async () => {
    const valid = rows.filter((r) => String(r.branch_id || '').trim());
    if (!valid.length) { toast.error('Nothing to save — add at least one branch row'); return; }
    setSavingTargets(true);
    try {
      const res = await fetch(`${API}/pms/targets/bulk`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({
          month,
          // Entered in Lakh → stored in rupees
          rows: valid.map((r) => ({
            ...r,
            spare_target: lakhToRupees(r.spare_target),
            labour_target: lakhToRupees(r.labour_target),
          })),
          working_days: parseInt(workingDays, 10) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      toast.success(`Saved ${data.saved} target row(s)`);
      setRows((data.items || []).map((r) => ({ ...lakhRow(r), _dirty: false })));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingTargets(false);
    }
  };

  const exportTargets = () => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    const head = ['Region', 'Branch ID', 'Branch Name', 'Responsible Person', 'Spare Target (Lakh)', 'Labour Target (Lakh)'];
    const lines = [head.join(',')].concat(rows.map((r) =>
      [r.region, r.branch_id, r.branch_name, r.responsible_person, r.spare_target, r.labour_target]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    ));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `AOP_Targets_${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------------- SR Type Master ----------------

  const loadSrTypes = useCallback(async () => {
    setLoadingSr(true);
    try {
      const res = await fetch(`${API}/pms/sr-types`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load SR types');
      setSrItems(data.items || []);
      if (data.head_choices?.length) setHeadChoices(data.head_choices);
      setHeads(data.heads || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingSr(false);
    }
  }, []);

  useEffect(() => { if (tab === 'srtypes') loadSrTypes(); }, [tab, loadSrTypes]);

  const setSrItem = (idx, field, value) => {
    setSrItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  // ---- Head master (feeds the Head dropdown) ----
  const addHead = async () => {
    const name = newHead.trim();
    if (!name) { toast.error('Enter a head name'); return; }
    try {
      const res = await fetch(`${API}/pms/heads`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Add failed');
      setHeads(data.items || []);
      setHeadChoices((data.items || []).map((h) => h.name));
      setNewHead('');
      toast.success(`Head “${name}” added`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteHead = async (h) => {
    try {
      const res = await fetch(`${API}/pms/heads/${h.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Delete failed');
      setHeads(data.items || []);
      setHeadChoices((data.items || []).map((x) => x.name));
      toast.success(`Head “${h.name}” removed`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const srAction = async (path, okMsg) => {
    try {
      const res = await fetch(`${API}/pms/sr-types/${path}`, { method: 'POST', headers: jsonHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Action failed');
      setSrItems(data.items || []);
      toast.success(okMsg(data));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const saveSrTypes = async () => {
    setSavingSr(true);
    try {
      const res = await fetch(`${API}/pms/sr-types`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ items: srItems.filter((i) => String(i.sr_type || '').trim()) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      setSrItems(data.items || []);
      toast.success('SR Type mapping saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingSr(false);
    }
  };

  const dirtyCount = rows.filter((r) => r._dirty).length;

  // ---------------- render ----------------

  return (
    <div className="min-h-screen font-sans">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 pb-10 max-md:px-2">

        {/* ===== Hero header (same style as Knowledge Bank) ===== */}
        <div className="rounded-2xl px-3 sm:px-5 py-3 mb-3 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(120deg, ${themeColor} 0%, ${themeDark} 100%)` }}>
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="absolute right-16 -bottom-12 h-24 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/15 backdrop-blur-sm">
                <PresentationChartLineIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold leading-tight">AOP Master</h1>
                <p className="text-[11px] text-white/70 leading-tight">
                  Branch-wise monthly targets &amp; SR Type mapping for the PMS report
                </p>
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium bg-white/15 text-white">
                Month: <b className="font-bold">{month}</b>
              </span>
            </div>
          </div>
        </div>

        {/* ===== Tab bar (KB style) ===== */}
        <div className="flex items-center gap-1.5 mb-3">
          {[
            { key: 'targets', name: 'Target Master', icon: BuildingOffice2Icon },
            { key: 'srtypes', name: 'SR Type Master', icon: TagIcon },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold flex-shrink-0 transition ${
                tab === t.key ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
              style={tab === t.key ? { backgroundColor: themeColor } : {}}>
              <t.icon className="h-4 w-4" />
              {t.name}
            </button>
          ))}
        </div>

      {/* ================= TARGET MASTER ================= */}
      {tab === 'targets' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-gray-500 mb-0.5">Target Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className={inputCls} style={{ '--tw-ring-color': themeColor, width: 150 }} />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-medium text-gray-500 mb-0.5">
                Working Days{defaultWd != null ? ` (default ${defaultWd} — Sundays excluded)` : ''}
              </label>
              <input type="number" min="1" max="31" value={workingDays}
                onChange={(e) => setWorkingDays(e.target.value)}
                onFocus={(e) => e.target.select()}
                className={inputCls} style={{ '--tw-ring-color': themeColor, width: 90 }} />
            </div>
            <div className="flex-1" />
            <button onClick={exportTargets}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={saveTargets} disabled={savingTargets}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: themeColor }}>
              <CheckIcon className="h-3.5 w-3.5" />
              {savingTargets ? 'Saving…' : `Save All${dirtyCount ? ` (${dirtyCount})` : ''}`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[820px]">
              <thead>
                <tr>
                  <th className={thCls} style={{ width: 90 }}>Region</th>
                  <th className={thCls} style={{ width: 130 }}>Branch ID</th>
                  <th className={thCls}>Branch Name</th>
                  <th className={thCls}>Responsible Person</th>
                  <th className={thCls} style={{ width: 130 }}>Spare Target (Lakh ₹)</th>
                  <th className={thCls} style={{ width: 130 }}>Labour Target (Lakh ₹)</th>
                </tr>
              </thead>
              <tbody>
                {loadingTargets ? (
                  <tr><td colSpan={6} className="border border-gray-200">
                    <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <ArrowPathIcon className="h-7 w-7 animate-spin" />
                      <p className="text-sm">Loading targets…</p>
                    </div>
                  </td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="border border-gray-200">
                    <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <BuildingOffice2Icon className="h-8 w-8" />
                      <p className="text-sm text-center px-4">
                        No branches found for {month}.
                      </p>
                    </div>
                  </td></tr>
                ) : rows.map((r, idx) => (
                  <tr key={r.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className={tdCls}>
                      <select value={r.region || ''} onChange={(e) => setRow(idx, 'region', e.target.value)}
                        className={inputCls} style={{ '--tw-ring-color': themeColor }}>
                        <option value="">—</option>
                        <option value="MH">MH</option>
                        <option value="KA">KA</option>
                      </select>
                    </td>
                    {/* Fixed columns — plain text, not editable */}
                    <td className={`${tdCls} text-gray-700`}>{r.branch_id || '—'}</td>
                    <td className={`${tdCls} text-gray-700`}>{r.branch_name || '—'}</td>
                    <td className={`${tdCls} text-gray-700`}>{r.responsible_person || '—'}</td>
                    <td className={tdCls}>
                      <input type="number" min="0" step="0.01" value={r.spare_target ?? ''} onChange={(e) => setRow(idx, 'spare_target', e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="e.g. 23 = ₹23 Lakh" title="Enter in Lakh — 23 means ₹23,00,000"
                        className={`${inputCls} text-right`} style={{ '--tw-ring-color': themeColor }} />
                    </td>
                    <td className={tdCls}>
                      <input type="number" min="0" step="0.01" value={r.labour_target ?? ''} onChange={(e) => setRow(idx, 'labour_target', e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="e.g. 23 = ₹23 Lakh" title="Enter in Lakh — 23 means ₹23,00,000"
                        className={`${inputCls} text-right`} style={{ '--tw-ring-color': themeColor }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-4 text-[11px] text-gray-600">
              <span>Branches: <b>{rows.length}</b></span>
              <span>Total Spare Target: <b>{parseFloat(rows.reduce((s, r) => s + (parseFloat(r.spare_target) || 0), 0).toFixed(2))} Lakh</b> (₹ {(rows.reduce((s, r) => s + (parseFloat(r.spare_target) || 0), 0) * 100000).toLocaleString('en-IN')})</span>
              <span>Total Labour Target: <b>{parseFloat(rows.reduce((s, r) => s + (parseFloat(r.labour_target) || 0), 0).toFixed(2))} Lakh</b> (₹ {(rows.reduce((s, r) => s + (parseFloat(r.labour_target) || 0), 0) * 100000).toLocaleString('en-IN')})</span>
            </div>
          )}
        </div>
      )}

      {/* ================= SR TYPE MASTER ================= */}
      {tab === 'srtypes' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500 flex-1 min-w-[220px]">
              Map each Service Report Type (from the Excel files) to a reporting Head —
              Warranty, Post Warranty, AMC, KOEL AMC or OTC Order.
            </p>
            <button onClick={() => srAction('sync', (d) => `Synced — ${d.added} new SR type(s) from data`)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowPathIcon className="h-3.5 w-3.5" /> Sync from data
            </button>
            <button onClick={() => srAction('reset', () => 'Default mapping restored')}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowPathIcon className="h-3.5 w-3.5" /> Reset defaults
            </button>
            <button onClick={() => setShowHeadModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <TagIcon className="h-3.5 w-3.5" /> Head Master
            </button>
            <button onClick={saveSrTypes} disabled={savingSr}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: themeColor }}>
              <CheckIcon className="h-3.5 w-3.5" /> {savingSr ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[520px]">
              <thead>
                <tr>
                  <th className={thCls} style={{ width: 60 }}>Sr. No.</th>
                  <th className={thCls}>SR Type (from Excel)</th>
                  <th className={thCls} style={{ width: 180 }}>Head</th>
                </tr>
              </thead>
              <tbody>
                {loadingSr ? (
                  <tr><td colSpan={3} className="border border-gray-200">
                    <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <ArrowPathIcon className="h-7 w-7 animate-spin" />
                      <p className="text-sm">Loading SR types…</p>
                    </div>
                  </td></tr>
                ) : srItems.length === 0 ? (
                  <tr><td colSpan={3} className="border border-gray-200">
                    <div className="h-72 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <TagIcon className="h-8 w-8" />
                      <p className="text-sm">No SR types yet.</p>
                    </div>
                  </td></tr>
                ) : srItems.map((it, idx) => (
                  <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className={`${tdCls} text-center text-gray-500`}>{idx + 1}</td>
                    {/* SR Type comes from the Excel data — plain text, not editable */}
                    <td className={`${tdCls} text-gray-700`}>{it.sr_type || '—'}</td>
                    <td className={tdCls}>
                      <select value={it.head || ''} onChange={(e) => setSrItem(idx, 'head', e.target.value)}
                        className={inputCls} style={{ '--tw-ring-color': themeColor }}>
                        <option value="">— select head —</option>
                        {headChoices.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= HEAD MASTER MODAL ================= */}
      {showHeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <TagIcon className="h-4 w-4" style={{ color: themeColor }} /> Head Master
              </h2>
              <button onClick={() => setShowHeadModal(false)} className="p-1 rounded hover:bg-gray-100">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-[11px] text-gray-500 mb-3">
                These heads appear in the Head dropdown of the SR Type mapping. A head
                that is in use by SR types cannot be removed.
              </p>
              <div className="space-y-1.5">
                {heads.map((h) => (
                  <div key={h.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50/60">
                    <span className="text-xs font-medium text-gray-800">{h.name}</span>
                    <button onClick={() => deleteHead(h)} title={`Remove “${h.name}”`}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {heads.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No heads yet.</p>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
              <input value={newHead} onChange={(e) => setNewHead(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addHead(); }}
                placeholder="New head name…"
                className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs text-black focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': themeColor }} />
              <button onClick={addHead}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-90"
                style={{ backgroundColor: themeColor }}>
                <PlusIcon className="h-3.5 w-3.5" /> Add Head
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default AOPMaster;
