import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  PresentationChartLineIcon, PlusIcon, TrashIcon, ArrowPathIcon,
  ArrowDownTrayIcon, DocumentDuplicateIcon, BuildingOffice2Icon,
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

// ERP branches for quick seeding of a month (region prefilled).
const ERP_BRANCHES = [
  { region: 'MH', branch_id: '420435_1', branch_name: 'Ch.Sambhaji Nagar' },
  { region: 'MH', branch_id: '420435_2', branch_name: 'Ahilyanagar' },
  { region: 'MH', branch_id: '420435_3', branch_name: 'Beed' },
  { region: 'MH', branch_id: '420435_4', branch_name: 'Nanded' },
  { region: 'MH', branch_id: '420435_5', branch_name: 'Babhaleshwar' },
  { region: 'MH', branch_id: '420435_6', branch_name: 'Latur' },
  { region: 'KA', branch_id: '420435_8', branch_name: 'Hubli' },
  { region: 'KA', branch_id: '420435_9', branch_name: 'Belagavi' },
  { region: 'KA', branch_id: '420435_10', branch_name: 'Hospet' },
  { region: 'KA', branch_id: '420435_11', branch_name: 'Ballari' },
  { region: 'KA', branch_id: '420435_12', branch_name: 'Bagalkot' },
  { region: 'KA', branch_id: '420435_13', branch_name: 'Gulbarga' },
  { region: 'KA', branch_id: '420435_14', branch_name: 'Bijapur' },
];

const currentMonth = () => new Date().toISOString().slice(0, 7);

const prevMonthOf = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const inputCls =
  'w-full border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-1';
const thCls =
  'px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap bg-gray-50 border-b border-gray-200';

// ---------------------------------------------------------------------------

const AOPMaster = () => {
  const [tab, setTab] = useState('targets'); // 'targets' | 'srtypes'

  // ---- Target Master state ----
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);

  // ---- SR Type Master state ----
  const [srItems, setSrItems] = useState([]);
  const [headChoices, setHeadChoices] = useState(['Warranty', 'Post Warranty', 'AMC', 'KOEL AMC', 'OTC Order']);
  const [loadingSr, setLoadingSr] = useState(false);
  const [savingSr, setSavingSr] = useState(false);

  // ---------------- Target Master ----------------

  const loadTargets = useCallback(async (m) => {
    setLoadingTargets(true);
    try {
      const res = await fetch(`${API}/pms/targets?month=${m}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load targets');
      setRows((data.items || []).map((r) => ({ ...r, _dirty: false })));
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

  const addRow = () => {
    setRows((prev) => [...prev, {
      region: 'MH', branch_id: '', branch_name: '', responsible_person: '',
      spare_target: '', labour_target: '', _dirty: true,
    }]);
  };

  const loadErpBranches = () => {
    setRows((prev) => {
      const have = new Set(prev.map((r) => r.branch_id));
      const add = ERP_BRANCHES
        .filter((b) => !have.has(b.branch_id))
        .map((b) => ({ ...b, responsible_person: '', spare_target: '', labour_target: '', _dirty: true }));
      if (!add.length) toast('All ERP branches are already listed');
      return [...prev, ...add];
    });
  };

  const removeRow = async (idx) => {
    const row = rows[idx];
    if (row.id) {
      try {
        const res = await fetch(`${API}/pms/targets/${row.id}`, { method: 'DELETE', headers: authHeaders() });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Delete failed');
        toast.success('Row deleted');
      } catch (e) {
        toast.error(e.message);
        return;
      }
    }
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveTargets = async () => {
    const valid = rows.filter((r) => String(r.branch_id || '').trim());
    if (!valid.length) { toast.error('Nothing to save — add at least one branch row'); return; }
    setSavingTargets(true);
    try {
      const res = await fetch(`${API}/pms/targets/bulk`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ month, rows: valid }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');
      toast.success(`Saved ${data.saved} target row(s)`);
      setRows((data.items || []).map((r) => ({ ...r, _dirty: false })));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingTargets(false);
    }
  };

  const copyPrevMonth = async () => {
    const from = prevMonthOf(month);
    try {
      const res = await fetch(`${API}/pms/targets/copy`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ from_month: from, to_month: month }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || data.message || 'Copy failed');
      toast.success(`Copied ${data.copied} row(s) from ${from}`);
      setRows((data.items || []).map((r) => ({ ...r, _dirty: false })));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const exportTargets = () => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    const head = ['Region', 'Branch ID', 'Branch Name', 'Responsible Person', 'Spare Target', 'Labour Target'];
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
            <div className="flex-1" />
            <button onClick={loadErpBranches}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <BuildingOffice2Icon className="h-3.5 w-3.5" /> Load ERP Branches
            </button>
            <button onClick={copyPrevMonth}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <DocumentDuplicateIcon className="h-3.5 w-3.5" /> Copy {prevMonthOf(month)}
            </button>
            <button onClick={exportTargets}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={addRow}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <PlusIcon className="h-3.5 w-3.5" /> Add Row
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
                  <th className={thCls} style={{ width: 130 }}>Spare Target ₹</th>
                  <th className={thCls} style={{ width: 130 }}>Labour Target ₹</th>
                  <th className={thCls} style={{ width: 60 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingTargets ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-500">Loading targets…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-500">
                    No targets set for {month}. Use “Load ERP Branches”, “Copy {prevMonthOf(month)}” or “Add Row”.
                  </td></tr>
                ) : rows.map((r, idx) => (
                  <tr key={r.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-2 py-1">
                      <select value={r.region || ''} onChange={(e) => setRow(idx, 'region', e.target.value)}
                        className={inputCls} style={{ '--tw-ring-color': themeColor }}>
                        <option value="">—</option>
                        <option value="MH">MH</option>
                        <option value="KA">KA</option>
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.branch_id || ''} onChange={(e) => setRow(idx, 'branch_id', e.target.value)}
                        placeholder="420435_1" className={inputCls} style={{ '--tw-ring-color': themeColor }} />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.branch_name || ''} onChange={(e) => setRow(idx, 'branch_name', e.target.value)}
                        placeholder="Branch name" className={inputCls} style={{ '--tw-ring-color': themeColor }} />
                    </td>
                    <td className="px-2 py-1">
                      <input value={r.responsible_person || ''} onChange={(e) => setRow(idx, 'responsible_person', e.target.value)}
                        placeholder="Branch manager" className={inputCls} style={{ '--tw-ring-color': themeColor }} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min="0" value={r.spare_target ?? ''} onChange={(e) => setRow(idx, 'spare_target', e.target.value)}
                        placeholder="0" className={`${inputCls} text-right`} style={{ '--tw-ring-color': themeColor }} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min="0" value={r.labour_target ?? ''} onChange={(e) => setRow(idx, 'labour_target', e.target.value)}
                        placeholder="0" className={`${inputCls} text-right`} style={{ '--tw-ring-color': themeColor }} />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button onClick={() => removeRow(idx)} title="Delete row"
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-4 text-[11px] text-gray-600">
              <span>Branches: <b>{rows.length}</b></span>
              <span>Total Spare Target: <b>₹ {rows.reduce((s, r) => s + (parseFloat(r.spare_target) || 0), 0).toLocaleString('en-IN')}</b></span>
              <span>Total Labour Target: <b>₹ {rows.reduce((s, r) => s + (parseFloat(r.labour_target) || 0), 0).toLocaleString('en-IN')}</b></span>
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
            <button onClick={() => setSrItems((prev) => [...prev, { sr_type: '', head: '' }])}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              <PlusIcon className="h-3.5 w-3.5" /> Add Row
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
                  <tr><td colSpan={3} className="text-center py-8 text-gray-500">Loading SR types…</td></tr>
                ) : srItems.length === 0 ? (
                  <tr><td colSpan={3} className="text-center py-8 text-gray-500">No SR types yet.</td></tr>
                ) : srItems.map((it, idx) => (
                  <tr key={it.id ?? `new-${idx}`} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-2 py-1 text-center text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1">
                      <input value={it.sr_type || ''} onChange={(e) => setSrItem(idx, 'sr_type', e.target.value)}
                        placeholder="e.g. Bandhan Premium" className={inputCls}
                        style={{ '--tw-ring-color': themeColor }} disabled={!!it.id} />
                    </td>
                    <td className="px-2 py-1">
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
      </div>
    </div>
  );
};

export default AOPMaster;
