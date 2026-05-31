import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const Spin = ({ color }) => (
  <svg className="animate-spin h-4 w-4" style={color ? { color } : undefined} viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const inr = (n) => `₹${parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

/**
 * BranchLVBHistory — branch-scoped Local Vendor Bills history (voucher-wise).
 * Paid date is VIEW-ONLY here (branch users can only see the HO Paid Date, not edit it).
 *
 * Props:
 *   branchCode  — current user's branch code (e.g. "420435_1")
 *   branchName  — display label for the branch
 *   themeColor  — primary theme color
 *   canExport   — whether to show Export buttons (default false)
 *   onClose     — close handler
 */
const BranchLVBHistory = ({ branchCode, branchName, themeColor = '#2f3192', canExport = false, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Self-contained Excel export (no dependency on the parent)
  const exportToExcel = (data, filename, headers) => {
    const escape = (val) =>
      val === null || val === undefined
        ? ''
        : String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const headerRow = headers
      .map(h => `<th style="background:${themeColor};color:#fff;font-weight:bold;padding:4px 8px;border:1px solid #ccc;">${escape(h.label)}</th>`)
      .join('');
    const bodyRows = data
      .map(row => `<tr>${headers.map(h => `<td style="padding:4px 8px;border:1px solid #ddd;">${escape(row[h.key])}</td>`).join('')}</tr>`)
      .join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table>${`<tr>${headerRow}</tr>`}${bodyRows}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/bills/history/vouchers`, {
        params: { branch_code: branchCode },
      });
      setGroups(data.groups || []);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, [branchCode]);

  const openVoucher = async (g) => {
    setSelected(g);
    setLoadingRecords(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/bills/history/voucher-records`, {
        params: { submit_voucher_no: g.submit_voucher_no, branch_code: branchCode },
      });
      setRecords(data || []);
    } catch {
      toast.error('Failed to load voucher records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const recTotal = records.reduce((s, r) => s + parseFloat(r.payment_amount || 0), 0);

  const PaidBadge = ({ value }) =>
    value ? (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold whitespace-nowrap">
        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        {fmtDate(value)}
      </span>
    ) : (
      <span className="text-[10px] text-gray-400 italic">Not paid</span>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[98vw] max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-4 py-3 flex justify-between items-center shrink-0" style={{ background: themeColor }}>
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-white">
              Local Vendor Bills History — {branchName || branchCode}
            </h2>
            {!loading && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                {selected ? `${records.length} records` : `${groups.length} vouchers`}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
            <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        {!loading && (
          <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
            {!selected ? (
              <>
                <span className="text-[10px] font-bold text-gray-500 uppercase">Branch:</span>
                <span className="text-[11px] font-bold" style={{ color: themeColor }}>
                  {branchName || branchCode} ({branchCode})
                </span>
                {canExport && groups.length > 0 && (
                  <button
                    onClick={() => exportToExcel(
                      groups.map(g => ({
                        submit_voucher_no: g.submit_voucher_no,
                        period: `${g.period_start_display} → ${g.period_end_display}`,
                        submitted_by: g.submitted_by, verified_by: g.verified_by,
                        record_count: g.record_count, total_amount: g.total_amount,
                        paid_date: g.paid_date || '',
                      })),
                      `lvb_history_vouchers_${branchCode}.xlsx`,
                      [
                        { key: 'submit_voucher_no', label: 'Voucher No.' },
                        { key: 'period', label: 'Period' },
                        { key: 'submitted_by', label: 'Submitted By' },
                        { key: 'verified_by', label: 'Verified By' },
                        { key: 'record_count', label: 'Records' },
                        { key: 'total_amount', label: 'Total Amount (₹)' },
                        { key: 'paid_date', label: 'HO Paid Date' },
                      ]
                    )}
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
                  <span className="text-[11px] text-gray-600">Period:</span>
                  <span className="text-[11px] font-bold">{selected.period_start_display} → {selected.period_end_display}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-[11px] text-gray-600">Total:</span>
                  <span className="text-[11px] font-bold text-blue-700">{inr(recTotal)}</span>
                  {selected.paid_date && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="text-[11px] text-gray-600">HO Paid:</span>
                      <PaidBadge value={selected.paid_date} />
                    </>
                  )}
                </div>
                {canExport && (
                  <button
                    onClick={() => exportToExcel(
                      records,
                      `lvb_history_voucher_${selected.submit_voucher_no}_${branchCode}.xlsx`,
                      [
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
                      ]
                    )}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg"
                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                    Export Records
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
          {loading ? (
            <div className="text-center py-20"><Spin color={themeColor} /><p className="text-xs text-gray-500 mt-2">Loading…</p></div>
          ) : !selected ? (
            /* ── VOUCHER SUMMARY ── */
            groups.length === 0 ? (
              <div className="text-center py-20 text-xs text-gray-500">No vouchers found for this branch</div>
            ) : (
              <table className="border-collapse w-full">
                <thead className="sticky top-0 z-10"><tr style={{ backgroundColor: '#f0f1ff' }}>
                  {['Sr. No.', 'Voucher No.', 'Period (Start → End)', 'Submitted By', 'Verified By', 'Records', 'Total Amount', 'HO Paid Date'].map((c, i) => (
                    <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase text-center" style={{ backgroundColor: '#f0f1ff' }}>{c}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {groups.map((g, idx) => (
                    <tr key={`${g.branch_code}-${g.submit_voucher_no}`} className="hover:bg-blue-50/40" style={{ height: '38px' }}>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                        <button onClick={() => openVoucher(g)} className="underline hover:font-bold bg-transparent border-0 p-0" style={{ color: themeColor }}>{g.submit_voucher_no}</button>
                      </td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center whitespace-nowrap">{g.period_start_display} → {g.period_end_display}</td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center"><span className="truncate" title={g.submitted_by}>{g.submitted_by}</span></td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center"><span className="truncate" title={g.verified_by}>{g.verified_by}</span></td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">{inr(g.total_amount)}</td>
                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                        {g.paid_date ? (
                          <PaidBadge value={g.paid_date} />
                        ) : g.paid_count > 0 ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{g.paid_count}/{g.record_count} mixed</span>
                        ) : <span className="text-[10px] text-gray-400 italic">Not paid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0"><tr style={{ backgroundColor: '#f0f1ff' }}>
                  <td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total ({groups.length} voucher{groups.length === 1 ? '' : 's'})</td>
                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">{groups.reduce((s, g) => s + (g.record_count || 0), 0)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-blue-700 whitespace-nowrap">{inr(groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0))}</td>
                  <td className="border-t-2 border-gray-200" />
                </tr></tfoot>
              </table>
            )
          ) : loadingRecords ? (
            <div className="text-center py-20"><Spin color={themeColor} /><p className="text-xs text-gray-500 mt-2">Loading records…</p></div>
          ) : (
            /* ── VOUCHER RECORDS (HO Paid Date is view-only) ── */
            <table className="border-collapse w-full" style={{ minWidth: '1850px' }}>
              <thead className="sticky top-0 z-10"><tr style={{ backgroundColor: '#f0f1ff' }}>
                {['Sr.', 'Invoice Date', 'Vendor Name', 'GST No.', 'Invoice No.', 'Customer Name', 'Cust. Invoice No.', 'SR No.', 'Cust. Invoice Amt (₹)', 'Line Work Amt (₹)', 'Shop Name', 'Description', 'Amount (₹)', 'Remark', 'Verified By', 'Submitted By', 'HO Paid Date'].map((c, i) => (
                  <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase text-center whitespace-nowrap" style={{ backgroundColor: '#f0f1ff' }}>{c}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((rec, idx) => (
                  <tr key={rec.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                    <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{fmtDate(rec.invoice_date)}</td>
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
                      <PaidBadge value={rec.ho_paid_date} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0"><tr style={{ backgroundColor: '#f0f1ff' }}>
                <td colSpan={12} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
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

export default BranchLVBHistory;