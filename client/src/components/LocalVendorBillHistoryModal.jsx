import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
const inr = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Spin = ({ color }) => (
  <svg className="animate-spin h-4 w-4" style={color ? { color } : undefined} viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const LocalVendorBillHistoryModal = ({
  themeColor, themeDark, branchMap, branchOrder, canExport, exportToExcel, onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [voucherSort, setVoucherSort] = useState(''); // '' | 'asc' | 'desc'
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const [paidEdits, setPaidEdits] = useState({});
  const [paidSaving, setPaidSaving] = useState({});
  const [paidTimers, setPaidTimers] = useState({});
  const [bulkPaid, setBulkPaid] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/bills/history/vouchers`);
      setGroups(data.groups || []);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);

  const openVoucher = async (g) => {
    setSelected(g);
    setBulkPaid(g.paid_date || '');
    setLoadingRecords(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/bills/history/voucher-records`, {
        params: { submit_voucher_no: g.submit_voucher_no, branch_code: g.branch_code || undefined },
      });
      setRecords(data || []);
      const seed = {};
      (data || []).forEach(r => { seed[r.id] = r.ho_paid_date || ''; });
      setPaidEdits(seed);
    } catch {
      toast.error('Failed to load voucher records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const handlePaidChange = (id, value) => {
    setPaidEdits(prev => ({ ...prev, [id]: value }));
    if (paidTimers[id]) clearTimeout(paidTimers[id]);
    setPaidSaving(prev => ({ ...prev, [id]: true }));
    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/lvb/bills/history/${id}/paid-date`, { paid_date: value || null });
        setRecords(prev => prev.map(r => r.id === id ? { ...r, ho_paid_date: value || null } : r));
        toast.success('Paid date saved', { duration: 1000 });
      } catch {
        toast.error('Failed to save paid date');
      } finally {
        setPaidSaving(prev => ({ ...prev, [id]: false }));
      }
    }, 700);
    setPaidTimers(prev => ({ ...prev, [id]: t }));
  };

  const applyBulkPaid = async () => {
    if (!bulkPaid) { toast.error('Pick a paid date first'); return; }
    const ids = records.map(r => r.id);
    if (!ids.length) return;
    setBulkApplying(true);
    try {
      await axios.put(`${API_BASE_URL}/lvb/bills/history/bulk-paid-date`, { record_ids: ids, paid_date: bulkPaid });
      setRecords(prev => prev.map(r => ({ ...r, ho_paid_date: bulkPaid })));
      setPaidEdits(prev => { const n = { ...prev }; ids.forEach(id => { n[id] = bulkPaid; }); return n; });
      setGroups(prev => prev.map(g =>
        (g.submit_voucher_no === selected.submit_voucher_no && g.branch_code === selected.branch_code)
          ? { ...g, paid_date: bulkPaid, paid_count: ids.length } : g));
      toast.success(`Applied to ${ids.length} bill(s)`);
    } catch {
      toast.error('Failed to apply');
    } finally {
      setBulkApplying(false);
    }
  };

  const visibleGroups = useMemo(() => {
    const out = groups.filter(g => !branchFilter || g.branch_code === branchFilter);
    if (voucherSort) {
      out.sort((a, b) => {
        const cmp = String(a.submit_voucher_no || '').localeCompare(
          String(b.submit_voucher_no || ''), undefined, { numeric: true, sensitivity: 'base' }
        );
        return voucherSort === 'asc' ? cmp : -cmp;
      });
    }
    return out;
  }, [groups, branchFilter, voucherSort]);
  const recTotal = records.reduce((s, r) => s + parseFloat(r.payment_amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[98vw] max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-4 py-3 flex justify-between items-center shrink-0" style={{ background: themeColor }}>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-white">Local Vendor Bills History — Voucher Wise</h2>
            {!loading && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                {selected ? `${records.length} records` : `${visibleGroups.length} vouchers`}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        {!loading && (
          <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
            {!selected ? (
              <>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Branch:</label>
                <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                  className="px-2 py-1 text-[11px] border border-gray-300 rounded-md bg-white">
                  <option value="">All Branches</option>
                  {branchOrder.map(code => <option key={code} value={code}>{branchMap[code]} ({code})</option>)}
                </select>
                {branchFilter && (
                  <button onClick={() => setBranchFilter('')}
                    className="px-1.5 py-0.5 text-[10px] text-red-600 border border-red-300 rounded hover:bg-red-50">Clear</button>
                )}
                <div className="flex items-center gap-1 px-2 py-1 border border-indigo-200 rounded-lg bg-indigo-50">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase whitespace-nowrap">Voucher:</span>
                  <button
                    onClick={() => setVoucherSort(s => s === 'asc' ? '' : 'asc')}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold transition-all"
                    style={voucherSort === 'asc'
                      ? { background: themeColor, color: '#fff' }
                      : { background: '#fff', color: '#374151', border: '1px solid #c7d2fe' }}
                    title="Sort by voucher code ascending"
                  >
                    A → Z
                  </button>
                  <button
                    onClick={() => setVoucherSort(s => s === 'desc' ? '' : 'desc')}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold transition-all"
                    style={voucherSort === 'desc'
                      ? { background: themeColor, color: '#fff' }
                      : { background: '#fff', color: '#374151', border: '1px solid #c7d2fe' }}
                    title="Sort by voucher code descending"
                  >
                    Z → A
                  </button>
                  {voucherSort && (
                    <button
                      onClick={() => setVoucherSort('')}
                      className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-red-600 hover:bg-red-50"
                      title="Clear sort"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {canExport && visibleGroups.length > 0 && (
                  <button
                    onClick={() => exportToExcel(visibleGroups.map(g => ({
                      submit_voucher_no: g.submit_voucher_no,
                      branch_name: branchMap[g.branch_code] || g.branch_code,
                      period: `${g.period_start_display} → ${g.period_end_display}`,
                      submitted_by: g.submitted_by, verified_by: g.verified_by,
                      record_count: g.record_count, total_amount: g.total_amount,
                      paid_date: g.paid_date || '',
                    })), 'lvb_history_vouchers.xlsx', [
                      { key: 'submit_voucher_no', label: 'Voucher No.' },
                      { key: 'branch_name', label: 'Branch' },
                      { key: 'period', label: 'Period' },
                      { key: 'submitted_by', label: 'Submitted By' },
                      { key: 'verified_by', label: 'Verified By' },
                      { key: 'record_count', label: 'Records' },
                      { key: 'total_amount', label: 'Total Amount (₹)' },
                      { key: 'paid_date', label: 'Paid Date' },
                    ])}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg"
                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                    Export Vouchers
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => { setSelected(null); setRecords([]); }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Vouchers
                </button>
                <div className="flex items-center gap-2 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-200 flex-wrap">
                  <span className="text-[11px] text-gray-600">Voucher:</span>
                  <span className="text-[11px] font-bold text-purple-700">{selected.submit_voucher_no}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-[11px] text-gray-600">Branch:</span>
                  <span className="text-[11px] font-bold">{branchMap[selected.branch_code] || selected.branch_code}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-[11px] text-gray-600">Period:</span>
                  <span className="text-[11px] font-bold">{selected.period_start_display} → {selected.period_end_display}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-[11px] text-gray-600">Total:</span>
                  <span className="text-[11px] font-bold text-blue-700">{inr(recTotal)}</span>
                </div>
                {canExport && (
                  <button
                    onClick={() => exportToExcel(records, `lvb_history_voucher_${selected.submit_voucher_no}_${selected.branch_code}.xlsx`, [
                      { key: 'branch_code', label: 'Branch' },
                      { key: 'invoice_date', label: 'Invoice Date' },
                      { key: 'vendor_name', label: 'Vendor Name' },
                      { key: 'gst_no', label: 'GST No.' },
                      { key: 'invoice_number', label: 'Invoice No.' },
                      { key: 'customer_name', label: 'Customer Name' },
                      { key: 'customer_invoice_no', label: 'Cust. Invoice No.' },
                      { key: 'customer_sr_no', label: 'SR No.' },
                      { key: 'customer_invoice_amount', label: 'Cust. Invoice Amt (₹)' },
                      { key: 'line_work_amount', label: 'Line Work Amt (₹)' },
                      { key: 'shop_name', label: 'Shop Name' },
                      { key: 'description', label: 'Description' },
                      { key: 'payment_amount', label: 'Amount (₹)' },
                      { key: 'remark', label: 'Remark' },
                      { key: 'verified_by_name', label: 'Verified By' },
                      { key: 'submitted_by_name', label: 'Submitted By' },
                      { key: 'ho_paid_date', label: 'HO Paid Date' },
                    ])}
                    className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg"
                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                    Export Records
                  </button>
                )}
                <div className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Set Paid Date (all):</span>
                  <input type="date" value={bulkPaid} onChange={e => setBulkPaid(e.target.value)}
                    className="px-1.5 py-1 border border-gray-300 rounded text-[11px]" style={{ width: '125px' }} />
                  <button onClick={applyBulkPaid} disabled={bulkApplying}
                    className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                    {bulkApplying ? '...' : 'Apply'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
          {loading ? (
            <div className="text-center py-20"><Spin color={themeColor} /><p className="text-xs text-gray-500 mt-2">Loading…</p></div>
          ) : !selected ? (
            visibleGroups.length === 0 ? (
              <div className="text-center py-20 text-xs text-gray-500">No vouchers found</div>
            ) : (
              <table className="border-collapse w-full">
                <thead className="sticky top-0 z-10"><tr style={{ backgroundColor: '#f0f1ff' }}>
                  {['Sr. No.', 'Voucher No.', 'Period (Start → End)', 'Submitted By', 'Verified By', 'Records', 'Total Amount', 'Paid Date', 'Branch Name'].map((c, i) => (
                    <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase text-center" style={{ backgroundColor: '#f0f1ff' }}>{c}</th>
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
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center"><span className="truncate" title={g.verified_by}>{g.verified_by}</span></td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">{inr(g.total_amount)}</td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                        {g.paid_date ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold">
                            {new Date(g.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        ) : g.paid_count > 0 ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{g.paid_count}/{g.record_count} mixed</span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">{branchMap[g.branch_code] || g.branch_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : loadingRecords ? (
            <div className="text-center py-20"><Spin color={themeColor} /><p className="text-xs text-gray-500 mt-2">Loading records…</p></div>
          ) : (
            <table className="border-collapse w-full" style={{ minWidth: '1950px' }}>
              <thead className="sticky top-0 z-10"><tr style={{ backgroundColor: '#f0f1ff' }}>
                {['Sr.', 'Branch', 'Invoice Date', 'Vendor Name', 'GST No.', 'Invoice No.', 'Customer Name', 'Cust. Invoice No.', 'SR No.', 'Cust. Invoice Amt (₹)', 'Line Work Amt (₹)', 'Shop Name', 'Description', 'Amount (₹)', 'Remark', 'Verified By', 'Submitted By', 'HO Paid Date'].map((c, i) => (
                  <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase text-center whitespace-nowrap" style={{ backgroundColor: '#f0f1ff' }}>{c}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((rec, idx) => (
                  <tr key={rec.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={branchMap[rec.branch_code]}>{branchMap[rec.branch_code] || rec.branch_code || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{rec.invoice_date ? new Date(rec.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.vendor_name}>{rec.vendor_name || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{rec.gst_no || '-'}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{rec.invoice_number || '-'}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.customer_name}>{rec.customer_name || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{rec.customer_invoice_no || '-'}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{rec.customer_sr_no || '-'}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-center whitespace-nowrap">{inr(rec.customer_invoice_amount)}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-center whitespace-nowrap">{inr(rec.line_work_amount)}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.shop_name}>{rec.shop_name || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.description}>{rec.description || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-center whitespace-nowrap">{inr(rec.payment_amount)}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.remark}>{rec.remark || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-emerald-700"><div className="truncate" title={rec.verified_by_name}>{rec.verified_by_name || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center"><div className="truncate" title={rec.submitted_by_name}>{rec.submitted_by_name || '-'}</div></td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                      <div className="relative flex items-center justify-center">
                        <input type="date" value={paidEdits[rec.id] ?? rec.ho_paid_date ?? ''}
                          onChange={(e) => handlePaidChange(rec.id, e.target.value)}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px]" style={{ width: '125px' }} />
                        {paidSaving[rec.id] && (
                          <svg className="absolute -right-1 animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0"><tr style={{ backgroundColor: '#f0f1ff' }}>
                <td colSpan={13} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>{inr(recTotal)}</td>
                <td colSpan={4} className="border-t-2 border-gray-200" />
              </tr></tfoot>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
        </div>
      </div>
    </div>
  );
};

export default LocalVendorBillHistoryModal;