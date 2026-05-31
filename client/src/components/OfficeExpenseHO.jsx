import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import OfficeExpenseHistoryModal from './OfficeExpenseHistoryModal';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const inr = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Spin = ({ color }) => (
  <svg className="animate-spin h-6 w-6 mx-auto" style={color ? { color } : undefined} viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const OfficeExpenseHO = ({
  themeColor, themeShades, branchMap, branchOrder, user, canExport, exportToExcel,
  onOpenExpenseHead, onOpenImprest,
}) => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [verifyMap, setVerifyMap] = useState({});
  const [savingMap, setSavingMap] = useState({});
  const [tab, setTab] = useState('pending');
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadVouchers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/office-expenses/vouchers`);
      setGroups(data.groups || []);
    } catch {
      toast.error('Failed to load vouchers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVouchers(); }, []);

  const openVoucher = async (g) => {
    setSelected(g);
    setTab('pending');
    setLoadingRecords(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/office-expenses/voucher-records`, {
        params: { submit_voucher_no: g.submit_voucher_no, branch_code: g.branch_code || undefined },
      });
      setRecords(data || []);
      const v = {};
      (data || []).forEach(r => { v[r.id] = r.verification_status === 'Verified'; });
      setVerifyMap(v);
    } catch {
      toast.error('Failed to load voucher records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const backToVouchers = () => {
    setSelected(null);
    setRecords([]);
    loadVouchers();
  };

  const toggleVerify = async (id, current) => {
    const next = !current;
    setVerifyMap(prev => ({ ...prev, [id]: next }));
    setSavingMap(prev => ({ ...prev, [id]: true }));
    try {
      const { data } = await axios.put(
        `${API_BASE_URL}/office-expenses/${id}/verify`, null,
        { params: { verified_by_name: user?.name || 'HO', verified_by_id: String(user?.user_id || user?.id || '') } }
      );
      const verified = data.verification_status === 'Verified';
      setVerifyMap(prev => ({ ...prev, [id]: verified }));
      setRecords(prev => prev.map(r => r.id === id
        ? { ...r, verification_status: data.verification_status, verified_by_name: data.verified_by_name }
        : r));
      toast.success(verified ? 'Verified!' : 'Unverified!', { duration: 1000 });
    } catch {
      setVerifyMap(prev => ({ ...prev, [id]: current }));
      toast.error('Failed to update');
    } finally {
      setSavingMap(prev => ({ ...prev, [id]: false }));
    }
  };

  const submitVerified = async () => {
    const ids = records.filter(r => r.verification_status === 'Verified').map(r => r.id);
    if (!ids.length) { toast.error('No verified records to submit'); return; }
    const res = await Swal.fire({
      title: 'Submit to History?',
      html: `Move <strong>${ids.length}</strong> verified record(s) of voucher <strong>${selected.submit_voucher_no}</strong> to history?<br/>This cannot be undone.`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, submit!', reverseButtons: true,
    });
    if (!res.isConfirmed) return;
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/office-expenses/submit-to-history`, {
        expense_ids: ids,
        submitted_by_name: user?.name || 'HO',
        submitted_by_id: String(user?.user_id || user?.id || ''),
      });
      await Swal.fire({ title: 'Done!', text: `${data.moved_count} record(s) moved to history.`, icon: 'success', timer: 2000, confirmButtonColor: themeColor });
      backToVouchers();
    } catch {
      toast.error('Failed to submit to history');
    } finally {
      setSubmitting(false);
    }
  };

  const visibleGroups = useMemo(
    () => groups.filter(g => !branchFilter || g.branch_code === branchFilter),
    [groups, branchFilter]
  );
  const tabRecords = useMemo(
    () => records.filter(r => tab === 'verified' ? r.verification_status === 'Verified' : r.verification_status !== 'Verified'),
    [records, tab]
  );
  const pendingCount = records.filter(r => r.verification_status !== 'Verified').length;
  const verifiedCount = records.filter(r => r.verification_status === 'Verified').length;
  const tabTotal = tabRecords.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const verifiedTotal = records.filter(r => r.verification_status === 'Verified').reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header / Toolbar */}
      <div className="px-3 py-2 border-b flex flex-wrap justify-between items-center gap-2" style={{ backgroundColor: themeShades.light }}>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xs font-bold text-black">Office Expense — Voucher Wise Verification</h2>
          {!selected && !branchFilter && (
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded-lg text-black">
              <option value="">All Branches</option>
              {branchOrder.map(code => <option key={code} value={code}>{branchMap[code]} ({code})</option>)}
            </select>
          )}
          {!selected && branchFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white" style={{ background: themeColor }}>
              {branchMap[branchFilter]} ({branchFilter})
              <button onClick={() => setBranchFilter('')} className="ml-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>History</button>
          {onOpenExpenseHead && (
            <button onClick={onOpenExpenseHead}
              className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>Expense Head</button>
          )}
          {onOpenImprest && (
            <button onClick={onOpenImprest}
              className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>Imprest</button>
          )}
        </div>
      </div>

      {/* Drill-down header */}
      {selected && (
        <div className="px-3 py-1.5 border-b bg-gray-50 flex flex-col gap-2">

          {/* Row 1: Back + voucher context + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={backToVouchers}
              className="inline-flex items-center gap-1 text-sm font-bold underline" style={{ color: themeColor }}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Back to Vouchers
            </button>
            <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-200 flex-wrap">
              <span className="text-[11px] text-gray-600">Voucher:</span>
              <span className="text-[11px] font-bold text-purple-700">{selected.submit_voucher_no}</span>
              <span className="text-gray-300">|</span>
              <span className="text-[11px] text-gray-600">Branch:</span>
              <span className="text-[11px] font-bold">{branchMap[selected.branch_code] || selected.branch_code}</span>
              <span className="text-gray-300">|</span>
              <span className="text-[11px] text-gray-600">Submitted By:</span>
              <span className="text-[11px] font-bold text-purple-700">{selected.submitted_by}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {canExport && (
                <button
                  onClick={() => exportToExcel(
                    tabRecords,
                    `oe_voucher_${selected.submit_voucher_no}_${selected.branch_code}.xlsx`,
                    [
                      { key: 'paid_date', label: 'Date' },
                      { key: 'internal_branch_name', label: 'Internal Branch' },
                      { key: 'sub_head', label: 'Exps. Sub Head' },
                      { key: 'expenses_head', label: 'Expense Head (GL Code)' },
                      { key: 'expenses_description', label: 'Description' },
                      { key: 'paid_to', label: 'Paid To' },
                      { key: 'invoice_no', label: 'Invoice No.' },
                      { key: 'amount', label: 'Amount (₹)' },
                      { key: 'voucher_no', label: 'Voucher No.' },
                      { key: 'paid_by', label: 'Paid By' },
                      { key: 'verified_by_name', label: 'Verified By' },
                      { key: 'remark', label: 'Remark' },
                      { key: 'verification_status', label: 'Status' },
                    ]
                  )}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg"
                  style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                  </svg>
                  Export Records
                </button>
              )}
              <button onClick={submitVerified} disabled={submitting || verifiedCount === 0}
                className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                {submitting ? 'Submitting…' : `Submit Verified (${verifiedCount})`}
              </button>
            </div>
          </div>

          {/* Row 2: Tabs + stats */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setTab('pending')}
              className="px-3 py-1 text-[11px] font-semibold rounded-md border"
              style={{ backgroundColor: tab === 'pending' ? themeColor : '#f9fafb', color: tab === 'pending' ? 'white' : '#374151', borderColor: tab === 'pending' ? themeColor : '#e5e7eb' }}>
              Pending ({pendingCount})
            </button>
            <button onClick={() => setTab('verified')}
              className="px-3 py-1 text-[11px] font-semibold rounded-md border"
              style={{ backgroundColor: tab === 'verified' ? '#059669' : '#f9fafb', color: tab === 'verified' ? 'white' : '#374151', borderColor: tab === 'verified' ? '#059669' : '#e5e7eb' }}>
              Verified ({verifiedCount})
            </button>

            <span className="mx-1 h-5 w-px bg-gray-300" />

            <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 border border-blue-100">
              <span className="text-[9px] font-bold text-blue-600 uppercase">Tab Total:</span>
              <span className="text-[10px] font-bold text-blue-800">{inr(tabTotal)}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 border border-emerald-100">
              <span className="text-[9px] font-bold text-emerald-600 uppercase">Verified Amount:</span>
              <span className="text-[10px] font-bold text-emerald-800">{inr(verifiedTotal)}</span>
            </div>
          </div>

        </div>
      )}

      {/* Body */}
      <div className="overflow-auto" style={{ maxHeight: '600px', scrollbarWidth: 'thin' }}>
        {loading ? (
          <div className="text-center py-16"><Spin color={themeColor} /><p className="text-xs text-gray-500 mt-2">Loading vouchers…</p></div>
        ) : !selected ? (
          /* ── FIRST TABLE: ALL VOUCHERS ── */
          visibleGroups.length === 0 ? (
            <div className="text-center py-16 text-xs text-gray-500">No vouchers found</div>
          ) : (
            <table className="border-collapse w-full">
              <thead className="sticky top-0 z-10"><tr style={{ backgroundColor: '#f0f1ff' }}>
                {['Sr. No.', 'Voucher No.', 'Period (Start → End)', 'Submitted By', 'Records', 'Total Amount', 'Verified Amount', 'Branch Name'].map((c, i) => (
                  <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase text-center whitespace-nowrap" style={{ backgroundColor: '#f0f1ff' }}>{c}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {visibleGroups.map((g, idx) => (
                  <tr key={`${g.branch_code}-${g.submit_voucher_no}`} className="hover:bg-blue-50/40" style={{ height: '38px' }}>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                      <button onClick={() => openVoucher(g)} className="text-[#2f3192] underline hover:font-bold bg-transparent border-0 p-0">{g.submit_voucher_no}</button>
                    </td>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center whitespace-nowrap">{g.period_start_display} → {g.period_end_display}</td>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center"><span className="truncate" title={g.submitted_by}>{g.submitted_by}</span></td>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">{inr(g.total_amount)}</td>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-emerald-700">{inr(g.verified_amount)}</td>
                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">{branchMap[g.branch_code] || g.branch_code}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0"><tr style={{ backgroundColor: '#f0f1ff' }}>
                <td colSpan={4} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">{visibleGroups.reduce((s, g) => s + (g.record_count || 0), 0)}</td>
                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200 text-blue-700">{inr(visibleGroups.reduce((s, g) => s + g.total_amount, 0))}</td>
                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200 text-emerald-700">{inr(visibleGroups.reduce((s, g) => s + g.verified_amount, 0))}</td>
                <td className="border-t-2 border-gray-200" />
              </tr></tfoot>
            </table>
          )
        ) : loadingRecords ? (
          <div className="text-center py-16"><Spin color={themeColor} /><p className="text-xs text-gray-500 mt-2">Loading records…</p></div>
        ) : (
          /* ── VOUCHER RECORDS FOR VERIFICATION ── */
          <table className="border-collapse w-full" style={{ minWidth: '1700px' }}>
            <thead className="sticky top-0 z-10"><tr style={{ backgroundColor: '#f0f1ff' }}>
              {['Verify', 'Sr.', 'Date', 'Internal Branch', 'Exps. Sub Head', 'Expense Head (GL Code)', 'Description', 'Paid To', 'Invoice No.', 'Amount (₹)', 'Voucher No.', 'Paid By', 'Verified By', 'Remark', 'Status'].map((c, i) => (
                <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase text-center whitespace-nowrap" style={{ backgroundColor: '#f0f1ff' }}>{c}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {tabRecords.map((rec, idx) => {
                const isVerified = verifyMap[rec.id] ?? (rec.verification_status === 'Verified');
                const isSaving = savingMap[rec.id];
                return (
                  <tr key={rec.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input type="checkbox" checked={isVerified} onChange={() => toggleVerify(rec.id, isVerified)} className="w-4 h-4 cursor-pointer" />
                        {isSaving && (
                          <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-medium">{idx + 1}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{rec.paid_date ? new Date(rec.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.internal_branch_name}>{rec.internal_branch_name || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.sub_head}>{rec.sub_head || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.expenses_head}>{rec.expenses_head || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.expenses_description || rec.description}>{rec.expenses_description || rec.description || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.paid_to}>{rec.paid_to || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.invoice_no}>{rec.invoice_no || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-center whitespace-nowrap">{inr(rec.amount)}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate">{rec.voucher_no || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate">{rec.paid_by || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-emerald-700"><div className="truncate" title={rec.verified_by_name}>{rec.verified_by_name || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.remark}>{rec.remark || '-'}</div></td>
                    <td className="px-2 py-0.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {isVerified ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0"><tr style={{ backgroundColor: '#f0f1ff' }}>
              <td colSpan={9} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">{tab === 'verified' ? 'Verified Total' : 'Pending Total'}</td>
              <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>{inr(tabTotal)}</td>
              <td colSpan={5} className="border-t-2 border-gray-200" />
            </tr></tfoot>
          </table>
        )}
      </div>

      {showHistory && (
        <OfficeExpenseHistoryModal
          themeColor={themeColor}
          themeDark={themeShades.dark}
          branchMap={branchMap}
          branchOrder={branchOrder}
          canExport={canExport}
          exportToExcel={exportToExcel}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
};

export default OfficeExpenseHO;