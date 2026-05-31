import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const SOURCE_META = {
  service_engineer: { short: 'SE', label: 'Service Engineer', accent: '#1e40af', bg: '#dbeafe',
    bulkUrl: '/tada-ho/history/bulk-paid-date', amountKey: 'total_amount',
    groupKey: (r) => (r.service_engineer_name || r.engineer_name || 'Unknown') },
  sales: { short: 'S&BM', label: 'Sales & BM', accent: '#7c3aed', bg: '#f3e8ff',
    bulkUrl: '/tada-salesbm/history/bulk-paid-date', amountKey: 'total_amount',
    groupKey: (r) => (r.engineer_name || 'Unknown') },
  bill_wise: { short: 'BW', label: 'Bill Wise', accent: '#ea580c', bg: '#ffedd5',
    bulkUrl: '/tada-bill-wise/history/bulk-paid-date', amountKey: 'amount',
    groupKey: (r) => ((r.entry_type === 'BM' ? r.customer_name : r.engineer_name) || 'Unknown') },
};

// ── Curated column sets per source (exact, in order) ──
const COLS = {
  service_engineer: [
    { l: 'Installation Site Address', k: 'installation_site_address', narrow: true },
    { l: 'Account', k: 'account' },
    { l: 'Service Request No.', k: 'service_request_no' },
    { l: 'SR Sub Type', k: 'sr_sub_type' },
    { l: 'SR Trip Start Date & Time', k: 'sr_trip_start_datetime' },
    { l: 'SR Reach at Site Date & Time', k: 'sr_reach_at_site_datetime' },
    { l: 'KMs Travelled', k: 'kms_travelled' },
    { l: 'Two Way KM', k: 'two_way_km' },
    { l: 'Branch Verified KM', k: 'branch_verified_km' },
    { l: 'Branch Verification Remark', k: 'km_verification_remark' },
    { l: 'HO Corrected KM', k: 'ho_corrected_km' },
    { l: 'DA Amount', k: 'da_amount', money: true },
    { l: 'Freight Charges', k: 'freight_charges', money: true },
    { l: 'Total Amount', k: 'total_amount', money: true },
    { l: 'HO Remark', k: 'ho_remark' },
    { l: 'Appointment No.', k: 'appointment_number' },
    { l: 'SR Type', k: 'sr_type' },
    { l: 'SR Due Date', k: 'sr_due_date' },
    { l: 'Task Start Date', k: 'task_start_date' },
    { l: 'Task End Date', k: 'task_end_date' },
    { l: 'Task Status', k: 'task_status' },
    { l: 'Task Assigned Date & Time', k: 'task_assigned_datetime' },
    { l: 'SR Trip Start Lat Long', k: 'sr_trip_start_lat_long' },
    { l: 'SR Reach at Site Lat Long', k: 'sr_reach_at_site_lat_long' },
    { l: 'SR Closed Date', k: 'sr_closed_date' },
    { l: 'SR Status', k: 'sr_status' },
    { l: 'Submitted By', k: '_submitted_by' },
    { l: 'Verified By', k: '_verified_by' },
  ],
  sales: [
    { l: 'Date', k: 'date' },
    { l: 'SR/Inv/Engine No.', k: 'sr_invoice_engine_no' },
    { l: 'Customer', k: 'customer_name' },
    { l: 'Location', k: 'location' },
    { l: 'Work Description', k: 'work_description' },
    { l: 'KM 2-Way', k: 'two_way_km' },
    { l: 'HO Corrected KM', k: 'ho_corrected_km' },
    { l: 'Rate', k: 'rate', money: true },
    { l: 'DA Amount', k: 'da', money: true },
    { l: 'HO Remark', k: 'ho_remark' },
    { l: 'Labour Sale Exp.', k: 'labour_sale_expected', money: true },
    { l: 'Part Sale Exp.', k: 'part_sale_expected', money: true },
    { l: 'Remark', k: 'remark' },
    { l: 'Submitted By', k: '_submitted_by' },
    { l: 'Verified By', k: '_verified_by' },
  ],
  bill_wise_se: [
    { l: 'Type', k: 'entry_type', badge: true },
    { l: 'Date', k: 'date' },
    { l: 'SR No.', k: 'service_request_no' },
    { l: 'Account', k: 'account' },
    { l: 'Installation Site Address', k: 'installation_site_address', narrow: true },
    { l: 'SR Type', k: 'sr_type' },
    { l: 'Expense Head', k: 'expenses_head' },
    { l: 'Amount', k: 'amount', money: true },
    { l: 'Work Description', k: 'work_description' },
    { l: 'KMs Travelled', k: 'kms_travelled' },
    { l: 'Task Status', k: 'task_status' },
    { l: 'Appointment No.', k: 'appointment_number' },
    { l: 'Task Start Date', k: 'task_start_date' },
    { l: 'Task End Date', k: 'task_end_date' },
    { l: 'Bill Submitted', k: 'bill_submitted' },
    { l: 'Submitted By', k: '_submitted_by' },
    { l: 'Verified By', k: '_verified_by' },
  ],
  bill_wise_bm: [
    { l: 'Type', k: 'entry_type', badge: true },
    { l: 'Date', k: 'date' },
    { l: 'Customer Name', k: 'customer_name' },
    { l: 'SR No. / Inv / Engine', k: 'sr_invoice_engine_no' },
    { l: 'Location', k: 'location' },
    { l: 'Expense Head', k: 'expenses_head' },
    { l: 'Amount', k: 'amount', money: true },
    { l: 'Bill Submitted', k: 'bill_submitted' },
    { l: 'Work Description', k: 'work_description' },
    { l: 'Remark', k: 'remark' },
    { l: 'Work Status', k: 'work_status' },
    { l: 'Submitted By', k: '_submitted_by' },
    { l: 'Verified By', k: '_verified_by' },
  ],
};

// Pick the right column set. Bill Wise depends on the records' entry_type.
const getCols = (src, recs = []) => {
  if (src !== 'bill_wise') return COLS[src] || [];
  const allBM = recs.length > 0 && recs.every(r => r.entry_type === 'BM');
  return allBM ? COLS.bill_wise_bm : COLS.bill_wise_se;
};

const money = (v) => {
  const n = parseFloat(v);
  return (!isNaN(n) && n !== 0) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
};

const rawVal = (rec, c) => {
  if (c.k === '_submitted_by') return rec.created_by || rec.uploaded_by || '';
  if (c.k === '_verified_by') return rec.submitted_by_name || '';
  return rec[c.k] ?? '';
};

const TADAHistoryModal = ({ branch, themeColor, onClose, canExport = false }) => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [data, setData] = useState({
    service_engineer: { records: [], groups: [] },
    sales: { records: [], groups: [] },
    bill_wise: { records: [], groups: [] },
  });
  const [selectedVoucher, setSelectedVoucher] = useState(null);  // { ...group, _source }
  const [selectedEngineer, setSelectedEngineer] = useState(null); // { name, records }
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paidInputs, setPaidInputs] = useState({});
  const [applying, setApplying] = useState({});

  useEffect(() => {
    if (!branch) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [seR, seG, sbR, sbG, bwR, bwG] = await Promise.all([
          axios.get(`${API_BASE_URL}/tada-ho/branch-history`, { params: { branch_code: branch.branch_code } }),
          axios.get(`${API_BASE_URL}/tada-ho/branch-history-vouchers`, { params: { branch_code: branch.branch_code } }),
          axios.get(`${API_BASE_URL}/tada-salesbm/history`, { params: { branch_code: branch.branch_code } }),
          axios.get(`${API_BASE_URL}/tada-salesbm/history/grouped`, { params: { branch_code: branch.branch_code } }),
          axios.get(`${API_BASE_URL}/tada-bill-wise/history`, { params: { branch_code: branch.branch_code } }),
          axios.get(`${API_BASE_URL}/tada-bill-wise/history/vouchers`, { params: { branch_code: branch.branch_code } }),
        ]);
        if (!alive) return;
        setData({
          service_engineer: { records: seR.data || [], groups: seG.data?.groups || [] },
          sales: { records: sbR.data || [], groups: sbG.data?.groups || [] },
          bill_wise: { records: bwR.data || [], groups: bwG.data?.groups || [] },
        });
      } catch {
        toast.error('Failed to load history');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [branch]);

  const isAll = activeTab === 'all';

  const switchTab = (t) => {
    setActiveTab(t); setSelectedVoucher(null); setSelectedEngineer(null);
    setSearch(''); setDateFrom(''); setDateTo('');
  };

  const allGroups = useMemo(() => {
    if (isAll) {
      return ['service_engineer', 'sales', 'bill_wise'].flatMap(src =>
        (data[src].groups || []).map(g => ({ ...g, _source: src }))
      );
    }
    return (data[activeTab].groups || []).map(g => ({ ...g, _source: activeTab }));
  }, [isAll, activeTab, data]);

  const filteredGroups = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allGroups.filter(g => {
      const matchSearch = !s ||
        String(g.voucher_no || '').toLowerCase().includes(s) ||
        String(g.submitted_by || g.uploaded_by || '').toLowerCase().includes(s) ||
        String(g.verified_by || '').toLowerCase().includes(s) ||
        String(SOURCE_META[g._source]?.label || '').toLowerCase().includes(s);
      const ps = g.period_start || null;
      const pe = g.period_end || null;
      const matchFrom = !dateFrom || !pe || pe >= dateFrom;
      const matchTo = !dateTo || !ps || ps <= dateTo;
      return matchSearch && matchFrom && matchTo;
    });
  }, [allGroups, search, dateFrom, dateTo]);

  const voucherRecords = useMemo(() => {
    if (!selectedVoucher) return [];
    const src = selectedVoucher._source;
    const idSet = new Set(selectedVoucher.record_ids || []);
    return (data[src].records || []).filter(r => idSet.has(r.id));
  }, [selectedVoucher, data]);

  const engineerGroups = useMemo(() => {
    if (!selectedVoucher) return [];
    const src = selectedVoucher._source;
    const keyOf = SOURCE_META[src].groupKey;
    const amtKey = SOURCE_META[src].amountKey;
    const map = {};
    voucherRecords.forEach(r => {
      const name = (keyOf(r) || 'Unknown').toString().trim() || 'Unknown';
      if (!map[name]) map[name] = { name, records: [], total: 0, paid: 0 };
      map[name].records.push(r);
      map[name].total += parseFloat(r[amtKey]) || 0;
      if (r.paid_date) map[name].paid += 1;
    });
    return Object.values(map).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [selectedVoucher, voucherRecords]);

  const detailSrc = selectedVoucher ? selectedVoucher._source : null;
  const detailMeta = detailSrc ? SOURCE_META[detailSrc] : null;
  const detailAmtKey = detailSrc ? SOURCE_META[detailSrc].amountKey : 'total_amount';
  const level3Cols = useMemo(
    () => (detailSrc && selectedEngineer) ? getCols(detailSrc, selectedEngineer.records) : [],
    [detailSrc, selectedEngineer]
  );

  const applyPaid = async (group) => {
    const src = group._source;
    const bulkUrl = SOURCE_META[src].bulkUrl;
    const key = `${src}__${group.voucher_no}`;
    const value = paidInputs[key] ?? group.paid_date ?? '';
    if (!value) { toast.error('Pick a paid date first'); return; }
    if (!group.record_ids?.length) { toast.error('No records in this voucher'); return; }
    setApplying(p => ({ ...p, [key]: true }));
    try {
      await axios.put(`${API_BASE_URL}${bulkUrl}`, { record_ids: group.record_ids, paid_date: value });
      const idSet = new Set(group.record_ids);
      setData(prev => ({
        ...prev,
        [src]: {
          records: prev[src].records.map(r => idSet.has(r.id) ? { ...r, paid_date: value } : r),
          groups: prev[src].groups.map(g => g.voucher_no === group.voucher_no
            ? { ...g, paid_date: value, paid_count: group.record_ids.length } : g),
        },
      }));
      toast.success(`Applied to ${group.record_ids.length} record(s)`);
    } catch {
      toast.error('Failed to apply paid date');
    } finally {
      setApplying(p => ({ ...p, [key]: false }));
    }
  };

  const cell = (rec, c) => {
    if (c.badge) {
      const bm = rec.entry_type === 'BM';
      return <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
        style={bm ? { background: '#f3e8ff', color: '#7c3aed' } : { background: '#dbeafe', color: '#1e40af' }}>
        {bm ? 'BM' : 'SE'}</span>;
    }
    const v = rawVal(rec, c);
    if (c.money) return <span className="font-semibold">{money(v)}</span>;
    if (c.narrow) {
      return <div className="overflow-hidden text-ellipsis whitespace-nowrap mx-auto" style={{ maxWidth: '150px' }} title={String(v || '')}>
        {(v === '' || v === null || v === undefined) ? '-' : String(v)}</div>;
    }
    return <span title={String(v ?? '')}>{(v === '' || v === null || v === undefined) ? '-' : String(v)}</span>;
  };

  // ── EXPORT ──
  const exportVoucherList = () => {
    const rows = filteredGroups.map((g, i) => ({
      'Sr. No.': i + 1,
      ...(isAll ? { 'Source': SOURCE_META[g._source]?.label } : {}),
      'Voucher No.': g.voucher_no,
      'Submitted By': g.submitted_by || g.uploaded_by || '-',
      'Verified By': g.verified_by || '-',
      'Period': g.period_start_display === g.period_end_display ? g.period_start_display : `${g.period_start_display} → ${g.period_end_display}`,
      'Engineers': g.engineer_count ?? '-',
      'Records': g.record_count,
      'Total Amount': parseFloat(g.total_amount || 0),
      'Paid Date': g.paid_date || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vouchers');
    XLSX.writeFile(wb, `History_${isAll ? 'All' : SOURCE_META[activeTab].short}_${branch?.branch_name || ''}.xlsx`);
  };

  const exportRecords = (records, src, fileLabel) => {
    const cols = getCols(src, records);
    const rows = records.map((rec, i) => {
      const o = { 'Sr.': i + 1 };
      cols.forEach(c => {
        if (c.badge) o[c.l] = rec.entry_type === 'BM' ? 'BM' : 'SE';
        else o[c.l] = c.money ? (parseFloat(rawVal(rec, c)) || 0) : (rawVal(rec, c) ?? '');
      });
      o['Paid Date'] = rec.paid_date || '';
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Records');
    XLSX.writeFile(wb, `${fileLabel}.xlsx`);
  };

  const ExportBtn = ({ onClick }) => canExport ? (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white rounded-lg"
      style={{ background: 'linear-gradient(135deg, #047857, #065f46)' }}>
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Export Excel
    </button>
  ) : null;

  const totalCount = data.service_engineer.groups.length + data.sales.groups.length + data.bill_wise.groups.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[98vw] max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header + tabs */}
        <div className="px-4 py-2 flex justify-between items-center shrink-0 gap-3 flex-wrap" style={{ background: themeColor }}>
          <h2 className="text-sm font-semibold text-white whitespace-nowrap">History — {branch?.branch_name}</h2>
          {!loading && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => switchTab('all')}
                className="px-3 py-1 text-[11px] font-bold rounded-md transition-all"
                style={{ backgroundColor: activeTab === 'all' ? '#fff' : 'rgba(255,255,255,0.15)', color: activeTab === 'all' ? themeColor : '#fff' }}>
                All ({totalCount})
              </button>
              {Object.entries(SOURCE_META).map(([key, t]) => (
                <button key={key} onClick={() => switchTab(key)}
                  className="px-3 py-1 text-[11px] font-bold rounded-md transition-all"
                  style={{ backgroundColor: activeTab === key ? '#fff' : 'rgba(255,255,255,0.15)', color: activeTab === key ? themeColor : '#fff' }}>
                  {t.label} ({data[key].groups.length})
                </button>
              ))}
            </div>
          )}
          <button onClick={onClose} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter bar (voucher list only) */}
        {!loading && !selectedVoucher && (
          <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={isAll ? 'Search by voucher, submitted by, verified by, or type...' : 'Search by voucher no., submitted by, or verified by...'}
                className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
              <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">Period:</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <span className="text-[10px] text-gray-400">to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            {(search || dateFrom || dateTo) && (
              <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
                className="px-2 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50">Clear</button>
            )}
            <ExportBtn onClick={exportVoucherList} />
            <span className="text-[10px] text-gray-500 ml-auto">{filteredGroups.length} voucher(s)</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
          {loading ? (
            <div className="text-center py-20">
              <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-500">Loading history…</p>
            </div>
          ) : !selectedVoucher ? (
            /* ── LEVEL 1: VOUCHER LIST ── */
            filteredGroups.length === 0 ? (
              <div className="text-center py-20 text-sm text-gray-500">No vouchers found</div>
            ) : (
              <table className="border-collapse w-full">
                <thead className="sticky top-0 z-10">
                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                    {['Sr. No.', ...(isAll ? ['Source'] : []), 'Voucher No.', 'Submitted By', 'Verified By', 'Period', 'Engineers', 'Records', 'Total Amount', 'Paid Date (whole voucher)'].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[11px] font-bold text-gray-700 border border-gray-200 uppercase tracking-wide whitespace-nowrap text-center" style={{ backgroundColor: '#f0f1ff' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((g, idx) => {
                    const src = g._source;
                    const sm = SOURCE_META[src];
                    const key = `${src}__${g.voucher_no}`;
                    const val = paidInputs[key] ?? g.paid_date ?? '';
                    return (
                      <tr key={key} className="hover:bg-blue-50 transition-colors" style={{ height: '40px' }}>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center font-medium">{idx + 1}</td>
                        {isAll && (
                          <td className="px-3 py-1 border border-gray-200 text-center">
                            <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap"
                              style={{ background: sm.bg, color: sm.accent }}>{sm.short}</span>
                          </td>
                        )}
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center">
                          <button onClick={() => { setSelectedVoucher(g); setSelectedEngineer(null); }} className="underline hover:font-bold bg-transparent border-0 p-0" style={{ color: themeColor }}>
                            {g.voucher_no}
                          </button>
                        </td>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center"><div className="truncate" title={g.submitted_by || g.uploaded_by}>{g.submitted_by || g.uploaded_by || '-'}</div></td>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center"><div className="truncate" title={g.verified_by}>{g.verified_by || '-'}</div></td>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center whitespace-nowrap">
                          {g.period_start_display === g.period_end_display ? g.period_start_display : `${g.period_start_display} → ${g.period_end_display}`}
                        </td>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center font-semibold">{g.engineer_count ?? '-'}</td>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center font-bold">{g.record_count}</td>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center font-bold text-blue-700">{money(g.total_amount)}</td>
                        <td className="px-3 py-1 border border-gray-200 text-[12px] text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input type="date" value={val}
                              onChange={(e) => setPaidInputs(p => ({ ...p, [key]: e.target.value }))}
                              className="px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                              style={{ width: '125px' }} />
                            <button onClick={() => applyPaid(g)} disabled={applying[key]}
                              className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                              {applying[key] ? '...' : 'Apply'}
                            </button>
                            {g.paid_count > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: g.paid_date ? '#d1fae5' : '#fef3c7', color: g.paid_date ? '#065f46' : '#92400e' }}>
                                {g.paid_date ? 'All paid' : `${g.paid_count}/${g.record_count} mixed`}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                    <td colSpan={isAll ? 7 : 6} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border border-gray-200">Grand Total ({filteredGroups.length} vouchers)</td>
                    <td className="px-3 py-1.5 text-[12px] font-bold text-center border border-gray-200">{filteredGroups.reduce((s, g) => s + (g.record_count || 0), 0)}</td>
                    <td className="px-3 py-1.5 text-[12px] font-bold text-center border border-gray-200" style={{ color: themeColor }}>
                      {money(filteredGroups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0))}
                    </td>
                    <td className="border border-gray-200" />
                  </tr>
                </tfoot>
              </table>
            )
          ) : !selectedEngineer ? (
            /* ── LEVEL 2: ENGINEER / CUSTOMER LIST ── */
            <>
              <div className="px-4 py-2 border-b bg-white flex items-center gap-2 flex-wrap">
                <button onClick={() => setSelectedVoucher(null)}
                  className="inline-flex items-center gap-1 text-sm font-bold underline" style={{ color: themeColor }}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  Back to Vouchers
                </button>
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                  style={{ background: detailMeta.bg, color: detailMeta.accent }}>{detailMeta.label}</span>
                <h3 className="text-xs font-semibold text-black">Voucher <span style={{ color: detailMeta.accent }}>{selectedVoucher.voucher_no}</span></h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: detailMeta.bg, color: detailMeta.accent }}>
                  {selectedVoucher.period_start_display} → {selectedVoucher.period_end_display}
                </span>
                <span className="text-[10px] text-gray-500">Submitted by: <strong>{selectedVoucher.submitted_by || selectedVoucher.uploaded_by}</strong></span>
                <span className="text-[10px] text-gray-500">Verified by: <strong>{selectedVoucher.verified_by || '-'}</strong></span>
                <div className="ml-auto"><ExportBtn onClick={() => exportRecords(voucherRecords, detailSrc, `Voucher_${selectedVoucher.voucher_no}`)} /></div>
              </div>
              <table className="border-collapse w-full">
                <thead className="sticky top-0 z-10">
                  <tr style={{ backgroundColor: detailMeta.bg }}>
                    {['Sr. No.', 'Engineer / Customer', 'No. of Records', 'Total Amount', 'Paid'].map((h, i) => (
                      <th key={i} className="px-3 py-2 text-[11px] font-bold text-gray-700 border border-gray-200 uppercase whitespace-nowrap text-center">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {engineerGroups.map((eg, idx) => (
                    <tr key={eg.name} className="hover:bg-blue-50 transition-colors" style={{ height: '38px' }}>
                      <td className="px-3 py-1 border border-gray-200 text-[12px] text-center font-medium">{idx + 1}</td>
                      <td className="px-3 py-1 border border-gray-200 text-[12px] text-center">
                        <button onClick={() => setSelectedEngineer(eg)} className="underline hover:font-bold bg-transparent border-0 p-0" style={{ color: detailMeta.accent }}>{eg.name}</button>
                      </td>
                      <td className="px-3 py-1 border border-gray-200 text-[12px] text-center font-bold">{eg.records.length}</td>
                      <td className="px-3 py-1 border border-gray-200 text-[12px] text-center font-bold text-blue-700">{money(eg.total)}</td>
                      <td className="px-3 py-1 border border-gray-200 text-[12px] text-center">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                          style={eg.paid === eg.records.length ? { background: '#d1fae5', color: '#065f46' } : { background: '#fef3c7', color: '#92400e' }}>
                          {eg.paid}/{eg.records.length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr style={{ backgroundColor: detailMeta.bg }}>
                    <td colSpan={2} className="px-3 py-1.5 text-[12px] font-bold text-right border border-gray-200" style={{ color: detailMeta.accent }}>Grand Total ({engineerGroups.length})</td>
                    <td className="px-3 py-1.5 text-[12px] font-bold text-center border border-gray-200">{voucherRecords.length}</td>
                    <td className="px-3 py-1.5 text-[12px] font-bold text-center border border-gray-200" style={{ color: detailMeta.accent }}>
                      {money(voucherRecords.reduce((s, r) => s + parseFloat(r[detailAmtKey] || 0), 0))}
                    </td>
                    <td className="border border-gray-200" />
                  </tr>
                </tfoot>
              </table>
            </>
          ) : (
            /* ── LEVEL 3: ENGINEER'S RECORDS — SOURCE-SPECIFIC COLUMNS ── */
            <>
              <div className="px-4 py-2 border-b bg-white flex items-center gap-2 flex-wrap">
                <button onClick={() => setSelectedEngineer(null)}
                  className="inline-flex items-center gap-1 text-sm font-bold underline" style={{ color: themeColor }}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  Back to List
                </button>
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                  style={{ background: detailMeta.bg, color: detailMeta.accent }}>{detailMeta.label}</span>
                <h3 className="text-xs font-semibold text-black">
                  Voucher <span style={{ color: detailMeta.accent }}>{selectedVoucher.voucher_no}</span> — <span className="text-purple-700">{selectedEngineer.name}</span>
                </h3>
                <span className="text-[10px] text-gray-500">{selectedEngineer.records.length} record(s)</span>
                <div className="ml-auto"><ExportBtn onClick={() => exportRecords(selectedEngineer.records, detailSrc, `Voucher_${selectedVoucher.voucher_no}_${selectedEngineer.name}`)} /></div>
              </div>
              <div className="overflow-x-auto">
                <table className="border-collapse w-full" style={{ minWidth: 'max-content' }}>
                  <thead className="sticky top-0 z-10">
                    <tr style={{ backgroundColor: detailMeta.bg }}>
                      <th className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-300 uppercase text-center">Sr.</th>
                      {level3Cols.map((c, i) => (
                        <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-300 uppercase whitespace-nowrap text-center"
                          style={c.narrow ? { width: '150px', maxWidth: '150px' } : undefined}>{c.l}</th>
                      ))}
                      <th className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-300 uppercase text-center">Paid Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEngineer.records.map((rec, idx) => (
                      <tr key={rec.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                        <td className="px-2 py-0.5 border border-gray-300 text-[11px] text-center">{idx + 1}</td>
                        {level3Cols.map((c, i) => (
                          <td key={i} className={`px-2 py-0.5 border border-gray-300 text-[11px] text-center ${c.narrow ? '' : 'whitespace-nowrap'}`}
                            style={c.narrow ? { width: '150px', maxWidth: '150px' } : undefined}>{cell(rec, c)}</td>
                        ))}
                        <td className="px-2 py-0.5 border border-gray-300 text-[11px] text-center font-semibold text-green-700">{rec.paid_date || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0">
                    <tr style={{ backgroundColor: detailMeta.bg }}>
                      <td colSpan={level3Cols.length + 2} className="px-3 py-1.5 text-[11px] font-bold text-right border border-gray-300" style={{ color: detailMeta.accent }}>
                        Total: {money(selectedEngineer.records.reduce((s, r) => s + parseFloat(r[detailAmtKey] || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
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

export default TADAHistoryModal;