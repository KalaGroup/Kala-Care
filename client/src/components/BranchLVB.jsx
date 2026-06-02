import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import BranchLVBHistory from './BranchLVBHistory';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const GST_STATE_MAP = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra',
  '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh (New)', '38': 'Ladakh', '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

/* ═══════════════════════════════════════════════════════════════════════════════
   BranchLVB — Local Vendor Bills tab
   Extracted verbatim from BranchAdminExpense.jsx. No logic changed.
   Shared helpers come in as props from the parent.
═══════════════════════════════════════════════════════════════════════════════ */
const BranchLVB = ({
  user,
  userBranch,
  isAdmin,
  themeColor,
  themeDark,
  themeLight,
  canExport,
  exportToExcel,
  getBranchLabel,
  isUploadAllowed,
  getUploadRestrictionMessage,
  branchLimits,
  submitRule,
}) => {
  // ── Local Vendor Bills states ──
  const [lvbVendors, setLvbVendors] = useState([]);
  const [lvbBills, setLvbBills] = useState([]);
  const [loadingLvbBills, setLoadingLvbBills] = useState(false);
  const [lvbBillsHasMore, setLvbBillsHasMore] = useState(true);
  const [lvbBillsSkip, setLvbBillsSkip] = useState(0);
  const [lvbBillsLoadingMore, setLvbBillsLoadingMore] = useState(false);
  const [submittingLvb, setSubmittingLvb] = useState(false);
  const [lvbSearch, setLvbSearch] = useState('');
  const [lvbStartDate, setLvbStartDate] = useState('');
  const [lvbEndDate, setLvbEndDate] = useState('');

  // LVB period-view state (mirrors OE)
  const [selectedLvbPeriod, setSelectedLvbPeriod] = useState(null);
  const [lvbSubmitterSearch, setLvbSubmitterSearch] = useState('');
  const [lvbPeriodFromDate, setLvbPeriodFromDate] = useState('');
  const [lvbPeriodToDate, setLvbPeriodToDate] = useState('');
  const [lvbDetailSearch, setLvbDetailSearch] = useState('');
  const [lvbDetailVendor, setLvbDetailVendor] = useState('');
  const [lvbDetailVerifiedOnly, setLvbDetailVerifiedOnly] = useState(false);

  // ── LVB Temp/Draft state ──
  const [lvbTempDrafts, setLvbTempDrafts] = useState([]);
  const [loadingLvbTemp, setLoadingLvbTemp] = useState(false);
  const [lvbTempSelected, setLvbTempSelected] = useState({});
  const [lvbTempEditingId, setLvbTempEditingId] = useState(null);
  const [lvbTempEditForm, setLvbTempEditForm] = useState({});
  const [submittingLvbTemp, setSubmittingLvbTemp] = useState(false);

  const [showLvbHistoryModal, setShowLvbHistoryModal] = useState(false);

  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorCheckStatus, setVendorCheckStatus] = useState(null);

  // Add Vendor modal
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [savingVendor, setSavingVendor] = useState(false);
  const [vendorForm, setVendorForm] = useState({
    name: '', gst_no: '', address: '', state: ''
  });

  const [lvbForm, setLvbForm] = useState({
    vendor_name: '',
    vendor_id: null,
    is_registered: false,
    gst_no: '',
    invoice_date: new Date().toISOString().split('T')[0],
    invoice_number: '',
    payment_amount: '',
    shop_name: '',
    description: '',
    remark: '',
    customer_name: '',
    customer_invoice_no: '',
    customer_sr_no: '',
    customer_invoice_amount: '',
    line_work_amount: '',
  });

  const [vendorSearchInput, setVendorSearchInput] = useState('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const [filteredVendorSuggestions, setFilteredVendorSuggestions] = useState([]);

  /* ─────────────────────────────────────────────────────────────────────────────
     PRINT — Local Vendor Bills Report (period drill-in)
   ───────────────────────────────────────────────────────────────────────────── */
  const printLvbReport = (period) => {
    if (!period || !period.records || period.records.length === 0) {
      toast.error('No records to print');
      return;
    }

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

    let grandTotal = 0;
    const rowsHtml = period.records.map((r, idx) => {
      const amt = parseFloat(r.payment_amount || 0) || 0;
      grandTotal += amt;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${fmtDate(r.invoice_date)}</td>
          <td class="al">${escape(r.vendor_name || '-')}</td>
          <td>${r.is_registered ? 'GST' : 'URD'}</td>
          <td>${escape(r.invoice_number || '-')}</td>
          <td style="text-align:right;">₹${amt.toFixed(2)}</td>
          <td class="al">${escape(r.shop_name || '-')}</td>
          <td class="al">${escape(r.customer_name || '-')}</td>
          <td>${escape(r.customer_invoice_no || '-')}</td>
          <td>${escape(r.customer_sr_no || '-')}</td>
          <td style="text-align:right;">₹${(parseFloat(r.customer_invoice_amount || 0) || 0).toFixed(2)}</td>
          <td style="text-align:right;">₹${(parseFloat(r.line_work_amount || 0) || 0).toFixed(2)}</td>
          <td class="al">${escape(r.description || '-')}</td>
        </tr>
      `;
    }).join('');

    const voucherLabel = Array.from(new Set(period.records.map(r => r.submit_voucher_no).filter(Boolean))).join(', ') || '-';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Local Vendor Bills — ${escape(getBranchLabel(userBranch))}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 8px; color: #000; }
    .company-header { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 8px; padding: 6px; border: 1.5px solid #000; background: #f5f5f5; }
    .info-table { width: 100%; margin-bottom: 8px; border-collapse: collapse; }
    .info-table td { padding: 4px 8px; font-size: 11px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; }
    .info-table .title-cell { font-weight: bold; background: #d4d4d4; text-align: center; font-size: 13px; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.data th, table.data td { border: 1px solid #000; padding: 3px 4px; text-align: center; font-size: 9px; word-wrap: break-word; overflow-wrap: break-word; vertical-align: middle; }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; font-size: 9.5px; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
    .grp-vendor { background: #dbe4f0; }
    .grp-customer { background: #e8e0f0; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 16px; background: #2f3192; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; z-index: 1000; }
    .print-btn:hover { background: #1e1f6b; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>

  <div class="company-header">KALA Care Global LLP, ${escape(getBranchLabel(userBranch))}</div>

  <table class="info-table">
    <tr>
      <td class="title-cell" colspan="2">Local Vendor Bills</td>
      <td class="label">Branch Code :</td>
      <td>${escape(userBranch)}</td>
      <td class="label">Submitted By :</td>
      <td>${escape(period.submittedBy || '-')}</td>
    </tr>
    <tr>
      <td class="label">Voucher No. :</td>
      <td>${escape(voucherLabel)}</td>
      <td class="label">Period :</td>
      <td>${fmtDate(period.periodStart)} — ${fmtDate(period.periodEnd)}</td>
      <td class="label">Total Amount :</td>
      <td>₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  </table>

  <table class="data">
    <colgroup>
      <col style="width:3%;" /><col style="width:7%;" /><col style="width:11%;" /><col style="width:5%;" />
      <col style="width:8%;" /><col style="width:8%;" /><col style="width:9%;" />
      <col style="width:9%;" /><col style="width:9%;" /><col style="width:6%;" />
      <col style="width:8%;" /><col style="width:7%;" /><col style="width:10%;" />
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2">SL no.</th>
        <th class="grp-vendor" colspan="6">Vendor Details</th>
        <th class="grp-customer" colspan="6">Customer Invoice Details</th>
      </tr>
      <tr>
        <th class="grp-vendor">Invoice Date</th>
        <th class="grp-vendor">Vendor Name</th>
        <th class="grp-vendor">Type</th>
        <th class="grp-vendor">Invoice No.</th>
        <th class="grp-vendor">Payment Amount</th>
        <th class="grp-vendor">URD Vendor</th>
        <th class="grp-customer">Customer Name</th>
        <th class="grp-customer">Customer Invoice Number</th>
        <th class="grp-customer">SR no.</th>
        <th class="grp-customer">Customer Invoice Amount</th>
        <th class="grp-customer">Line Work Amount</th>
        <th class="grp-customer">Description</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:right;">Grand Total (${period.records.length} record${period.records.length === 1 ? '' : 's'}):</td>
        <td style="text-align:right;">₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td colspan="7"></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1400,height=900');
    if (!w) { toast.error('Please allow pop-ups for this site to print'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ─── LVB grouping (by submitted voucher; period = min→max date) ─── */
  const lvbPeriodGroups = useMemo(() => {
    if (!lvbBills || lvbBills.length === 0) return [];

    const groups = new Map();
    lvbBills.forEach(bill => {
      const d = bill.invoice_date ? new Date(bill.invoice_date) : null;
      if (!d || isNaN(d.getTime())) return;

      const submitter = bill.created_by_name || 'Unknown';
      const voucher = bill.submit_voucher_no || 'No Voucher';
      const groupKey = `${voucher}__${submitter}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          periodStart: null,
          periodEnd: null,
          submittedBy: submitter,
          records: [],
          totalAmount: 0,
          verifiedAmount: 0,
        });
      }
      const g = groups.get(groupKey);
      g.records.push(bill);
      if (!g.periodStart || d < g.periodStart) g.periodStart = d;
      if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      const amt = parseFloat(bill.payment_amount || 0);
      g.totalAmount += amt;
      if (bill.verification_status === 'Verified') g.verifiedAmount += amt;
    });

    return Array.from(groups.values())
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
  }, [lvbBills]);

  const filteredLvbPeriodGroups = useMemo(() => {
    return lvbPeriodGroups.filter(g => {
      if (lvbSubmitterSearch) {
        const q = lvbSubmitterSearch.toLowerCase();
        if (!String(g.submittedBy || '').toLowerCase().includes(q)) return false;
      }
      if (lvbPeriodFromDate) {
        const from = new Date(lvbPeriodFromDate);
        from.setHours(0, 0, 0, 0);
        if (g.periodEnd < from) return false;
      }
      if (lvbPeriodToDate) {
        const to = new Date(lvbPeriodToDate);
        to.setHours(23, 59, 59, 999);
        if (g.periodStart > to) return false;
      }
      return true;
    });
  }, [lvbPeriodGroups, lvbSubmitterSearch, lvbPeriodFromDate, lvbPeriodToDate]);

  const filteredLvbDetailRecords = useMemo(() => {
    if (!selectedLvbPeriod) return [];
    return selectedLvbPeriod.records.filter(r => {
      if (lvbDetailVerifiedOnly && r.verification_status !== 'Verified') return false;
      if (lvbDetailVendor && r.vendor_name !== lvbDetailVendor) return false;
      if (lvbDetailSearch) {
        const q = lvbDetailSearch.toLowerCase();
        const hit = [
          r.vendor_name, r.gst_no, r.invoice_number, r.customer_name,
          r.customer_invoice_no, r.customer_sr_no, r.shop_name,
          r.description, r.remark,
        ].some(v => String(v || '').toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    }).sort((a, b) => new Date(a.invoice_date || 0) - new Date(b.invoice_date || 0));
  }, [selectedLvbPeriod, lvbDetailSearch, lvbDetailVendor, lvbDetailVerifiedOnly]);

  const filteredLvbDetailTotals = useMemo(() => {
    const total = filteredLvbDetailRecords.reduce((s, r) => s + (parseFloat(r.payment_amount) || 0), 0);
    const verified = filteredLvbDetailRecords
      .filter(r => r.verification_status === 'Verified')
      .reduce((s, r) => s + (parseFloat(r.payment_amount) || 0), 0);
    return { total, verified };
  }, [filteredLvbDetailRecords]);

  useEffect(() => {
    setLvbDetailSearch('');
    setLvbDetailVendor('');
    setLvbDetailVerifiedOnly(false);
  }, [selectedLvbPeriod?.key]);

  const fetchLvbVendors = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/vendors`, {
        params: { branch_code: userBranch }
      });
      setLvbVendors(data);
    } catch {
      console.error('Failed to load vendors');
    }
  };

  const fetchLvbBills = async (reset = false) => {
    if (reset) { setLvbBills([]); setLvbBillsSkip(0); }
    const skip = reset ? 0 : lvbBillsSkip;
    reset ? setLoadingLvbBills(true) : setLvbBillsLoadingMore(true);
    try {
      const params = new URLSearchParams({ branch_code: userBranch, skip, limit: 50 });
      if (lvbSearch) params.append('search', lvbSearch);
      if (lvbStartDate) params.append('start_date', lvbStartDate);
      if (lvbEndDate) params.append('end_date', lvbEndDate);
      const { data } = await axios.get(`${API_BASE_URL}/lvb/bills?${params}`);
      setLvbBills(prev => reset ? data : [...prev, ...data]);
      setLvbBillsSkip(skip + 50);
      setLvbBillsHasMore(data.length === 50);
    } catch {
      toast.error('Failed to load bills');
    } finally {
      reset ? setLoadingLvbBills(false) : setLvbBillsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLvbVendors();
    fetchLvbBills(true);
    fetchLvbTempDrafts();
    setSelectedLvbPeriod(null); // reset drill-in when filters change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lvbSearch, lvbStartDate, lvbEndDate]);

  const handleVendorNameInput = (value) => {
    setVendorSearchInput(value);
    setLvbForm(prev => ({ ...prev, vendor_name: value, vendor_id: null, is_registered: false, gst_no: '' }));
    if (value.trim().length >= 1) {
      const matches = lvbVendors.filter(v =>
        v.name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredVendorSuggestions(matches);
      setVendorDropdownOpen(true);
    } else {
      setVendorDropdownOpen(false);
      setFilteredVendorSuggestions([]);
    }
  };

  const handleVendorSelect = (vendor) => {
    setVendorSearchInput(vendor.name);
    setLvbForm(prev => ({
      ...prev,
      vendor_name: vendor.name,
      vendor_id: vendor.id,
      is_registered: vendor.is_registered,
      gst_no: vendor.gst_no || '',
      shop_name: '',
    }));
    setVendorCheckStatus('existing');
    setVendorDropdownOpen(false);
  };

  const handleVendorBlur = async () => {
    const name = vendorSearchInput.trim();
    if (!name) return;

    // If already resolved (user picked from dropdown or already checked), skip
    if (vendorCheckStatus === 'existing' || vendorCheckStatus === 'new_gst' || vendorCheckStatus === 'urd') return;

    setVendorCheckStatus('checking');

    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/vendors/check`, { params: { name } });

      if (data.exists) {
        handleVendorSelect(data.vendor);
        setVendorCheckStatus('existing');
      } else {
        const result = await Swal.fire({
          title: `Is "${name}" GST Registered?`,
          text: 'Select whether this vendor is GST registered or a URD (Unregistered Dealer) purchase.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Yes, GST Registered',
          cancelButtonText: 'No (URD Purchase)',
          confirmButtonColor: '#2f3192',
          cancelButtonColor: '#6b7280',
          reverseButtons: false,
        });

        if (result.isConfirmed) {
          setVendorForm(prev => ({ ...prev, name, gst_no: '', address: '', state: '' }));
          setLvbForm(prev => ({
            ...prev,
            vendor_name: name,
            vendor_id: null,
            is_registered: true,
            gst_no: '',
            shop_name: '',
          }));
          setVendorCheckStatus('new_gst');
        } else if (result.dismiss === Swal.DismissReason.cancel) {
          setLvbForm(prev => ({
            ...prev,
            vendor_name: 'URD Purchase',
            vendor_id: null,
            is_registered: false,
            gst_no: '',
            shop_name: '',
          }));
          setVendorSearchInput('URD Purchase');
          setVendorCheckStatus('urd');
        } else {
          setVendorCheckStatus(null);
        }
      }
    } catch {
      setVendorCheckStatus(null);
      toast.error('Could not check vendor. Please try again.');
    }
  };

  const handleSaveNewVendor = async () => {
    if (!vendorForm.name.trim()) { toast.error('Vendor name is required'); return; }
    if (!vendorForm.gst_no.trim()) { toast.error('GST number is required'); return; }
    if (vendorForm.gst_no.trim().length !== 15) { toast.error('GST number must be exactly 15 characters'); return; }

    setSavingVendor(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/lvb/vendors`, {
        ...vendorForm,
        is_registered: true,
        branch_code: userBranch,
        created_by: user?.name || 'System',
      });
      toast.success('Vendor saved successfully!');
      setLvbVendors(prev => [...prev, data]);
      setLvbForm(prev => ({
        ...prev,
        vendor_name: data.name,
        vendor_id: data.id,
        is_registered: true,
        gst_no: data.gst_no || '',
      }));
      setVendorSearchInput(data.name);
      setVendorCheckStatus('existing');
      setShowAddVendorModal(false);
      setVendorForm({ name: '', gst_no: '', address: '', state: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save vendor');
    } finally {
      setSavingVendor(false);
    }
  };

  const handleGstChange = (value, target) => {
    const upper = value.toUpperCase();
    const stateCode = upper.substring(0, 2);
    const autoState = GST_STATE_MAP[stateCode] || '';
    if (target === 'vendorForm') {
      setVendorForm(prev => ({ ...prev, gst_no: upper, state: autoState }));
    }
  };

  const handleLvbSubmit = async (e) => {
    e.preventDefault();
    // All fields are compulsory EXCEPT remark
    // URD Vendor Name only required for URD purchases
    const isURD = lvbForm.vendor_name === 'URD Purchase' || (!lvbForm.is_registered && lvbForm.vendor_name);
    if (!lvbForm.vendor_name || !lvbForm.invoice_date || !lvbForm.invoice_number ||
      !lvbForm.payment_amount || !lvbForm.customer_name || !lvbForm.customer_invoice_no ||
      !lvbForm.customer_sr_no || !lvbForm.customer_invoice_amount ||
      !lvbForm.line_work_amount || !lvbForm.description ||
      (isURD && !lvbForm.shop_name)) {
      toast.error('Please fill all required fields (only Remark is optional)');
      return;
    }
    setSubmittingLvb(true);
    try {
      // ⚠️ posts to /temp instead of /
      await axios.post(`${API_BASE_URL}/lvb/bills/temp`, {
        ...lvbForm,
        payment_amount: parseFloat(lvbForm.payment_amount),
        customer_invoice_amount: parseFloat(lvbForm.customer_invoice_amount),
        line_work_amount: parseFloat(lvbForm.line_work_amount),
        branch_code: userBranch,
        created_by: String(user?.user_id || user?.id || ''),
        created_by_name: user?.name || 'System',
      });
      toast.success('Saved as draft');
      setLvbForm({
        vendor_name: '', vendor_id: null, is_registered: false, gst_no: '',
        invoice_date: new Date().toISOString().split('T')[0],
        invoice_number: '', payment_amount: '', shop_name: '', description: '', remark: '',
        customer_name: '', customer_invoice_no: '', customer_sr_no: '',
        customer_invoice_amount: '', line_work_amount: '',
      });
      setVendorSearchInput('');
      setVendorCheckStatus(null);
      fetchLvbTempDrafts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save draft');
    } finally {
      setSubmittingLvb(false);
    }
  };

  const handleDeleteLvbBill = async (id) => {
    const result = await Swal.fire({
      title: 'Delete this bill?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      await axios.delete(`${API_BASE_URL}/lvb/bills/${id}`);
      toast.success('Bill deleted');
      setLvbBills(prev => prev.filter(b => b.id !== id));
    } catch {
      toast.error('Failed to delete bill');
    }
  };

  const fetchLvbTempDrafts = async () => {
    setLoadingLvbTemp(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/bills/temp/list`, {
        params: { branch_code: userBranch }
      });
      setLvbTempDrafts(data);
      setLvbTempSelected({});
    } catch {
      toast.error('Failed to load drafts');
    } finally {
      setLoadingLvbTemp(false);
    }
  };

  const handleDeleteLvbTemp = async (id) => {
    const result = await Swal.fire({
      title: 'Delete this draft?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      await axios.delete(`${API_BASE_URL}/lvb/bills/temp/${id}`);
      toast.success('Draft deleted');
      fetchLvbTempDrafts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleStartEditLvbTemp = (d) => {
    setLvbTempEditingId(d.id);
    setLvbTempEditForm({
      invoice_date: d.invoice_date ? d.invoice_date.split('T')[0] : '',
      invoice_number: d.invoice_number || '',
      payment_amount: d.payment_amount || '',
      customer_name: d.customer_name || '',
      customer_invoice_no: d.customer_invoice_no || '',
      customer_sr_no: d.customer_sr_no || '',
      customer_invoice_amount: d.customer_invoice_amount || '',
      line_work_amount: d.line_work_amount || '',
      shop_name: d.shop_name || '',
      description: d.description || '',
      remark: d.remark || '',
    });
  };

  const handleSaveEditLvbTemp = async () => {
    try {
      await axios.put(`${API_BASE_URL}/lvb/bills/temp/${lvbTempEditingId}`, {
        ...lvbTempEditForm,
        payment_amount: parseFloat(lvbTempEditForm.payment_amount),
        customer_invoice_amount: parseFloat(lvbTempEditForm.customer_invoice_amount),
        line_work_amount: parseFloat(lvbTempEditForm.line_work_amount),
      });
      toast.success('Draft updated');
      setLvbTempEditingId(null);
      setLvbTempEditForm({});
      fetchLvbTempDrafts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update');
    }
  };

  const handleSubmitLvbTempToMain = async () => {
    if (!isAdmin && !isUploadAllowed()) {
      toast.error(getUploadRestrictionMessage());
      return;
    }
    const ids = Object.keys(lvbTempSelected).filter(k => lvbTempSelected[k]).map(Number);
    if (ids.length === 0) { toast.error('Select at least one draft'); return; }

    const confirmResult = await Swal.fire({
      title: `Submit ${ids.length} draft(s)?`,
      text: 'They will move out of drafts and into Bill Records. This cannot be undone.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2f3192',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, submit',
      reverseButtons: true,
    });
    if (!confirmResult.isConfirmed) return;

    setSubmittingLvbTemp(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/lvb/bills/temp/submit-to-main`, {
        temp_ids: ids,
        branch_code: userBranch,
      });
      toast.success(
        data.submit_voucher_no
          ? `${data.moved_count} record(s) submitted · Voucher: ${data.submit_voucher_no}`
          : `${data.moved_count} record(s) submitted`
      ); fetchLvbTempDrafts();
      fetchLvbBills(true);
    } catch {
      toast.error('Failed to submit');
    } finally {
      setSubmittingLvbTemp(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     JSX RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <div className="space-y-3">

        {/* ── FORM ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-xs font-bold text-white tracking-wide">Add Local Vendor Bill</h2>
          </div>

          <form onSubmit={handleLvbSubmit} className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">

              {/* Vendor Name with onBlur check */}
              <div className="relative col-span-2 md:col-span-2 lg:col-span-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Vendor Name *
                </label>
                <div className="flex gap-1 items-stretch">
                  {/* Make this wrapper flex-1 and min-w-0 so it can shrink inside the grid cell */}
                  <div className="relative flex-1 min-w-0">
                    {/* Custom dropdown trigger button — full width, truncates long names */}
                    <button
                      type="button"
                      onClick={() => setShowVendorDropdown(!showVendorDropdown)}
                      className="w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none text-black flex items-center justify-between gap-2"
                      style={{
                        borderColor: vendorCheckStatus === 'existing'
                          ? '#16a34a'
                          : vendorCheckStatus === 'urd'
                            ? '#6b7280'
                            : '#e2e8f0',
                        background: 'white'
                      }}
                    >
                      <span className="truncate text-left">
                        {lvbForm.vendor_name === 'URD Purchase'
                          ? 'URD Purchase (Unregistered Dealer)'
                          : lvbForm.vendor_name || '— Select Vendor —'}
                      </span>
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Custom dropdown menu */}
                    {showVendorDropdown && (
                      <>
                        {/* Click outside to close */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowVendorDropdown(false)}
                        />

                        {/* Dropdown is absolutely positioned so it can be wider than the trigger
          without affecting the grid layout. left-0 anchors it; min-w-full
          matches the trigger width, max-w avoids it blowing past the viewport. */}
                        <div className="absolute left-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-full w-max max-w-[320px] max-h-60 overflow-y-auto">
                          {/* Select option */}
                          <div
                            className="px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer truncate"
                            onClick={() => {
                              setLvbForm(prev => ({
                                ...prev,
                                vendor_name: '',
                                vendor_id: null,
                                is_registered: false,
                                gst_no: ''
                              }));
                              setVendorSearchInput('');
                              setVendorCheckStatus(null);
                              setShowVendorDropdown(false);
                            }}
                          >
                            — Select Vendor —
                          </div>

                          {/* URD Purchase option */}
                          <div
                            className="px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer truncate"
                            onClick={() => {
                              setLvbForm(prev => ({
                                ...prev,
                                vendor_name: 'URD Purchase',
                                vendor_id: null,
                                is_registered: false,
                                gst_no: '',
                                shop_name: '',
                              }));
                              setVendorSearchInput('URD Purchase');
                              setVendorCheckStatus('urd');
                              setShowVendorDropdown(false);
                            }}
                          >
                            URD Purchase (Unregistered Dealer)
                          </div>

                          {/* Vendors list */}
                          {lvbVendors.map(v => (
                            <div
                              key={v.id}
                              className="px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer truncate"
                              onClick={() => {
                                setLvbForm(prev => ({
                                  ...prev,
                                  vendor_name: v.name,
                                  vendor_id: v.id,
                                  is_registered: v.is_registered,
                                  gst_no: v.gst_no || '',
                                  shop_name: '',
                                }));
                                setVendorSearchInput(v.name);
                                setVendorCheckStatus('existing');
                                setShowVendorDropdown(false);
                              }}
                            >
                              {v.name}{v.is_registered ? ` (GST: ${v.gst_no || 'N/A'})` : ' (URD)'}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Status badges */}
                    {vendorCheckStatus === 'existing' && (
                      <p className="text-[10px] mt-0.5 text-green-600 font-semibold truncate">
                        ✓ {lvbForm.is_registered ? `GST: ${lvbForm.gst_no || 'N/A'}` : 'URD Vendor'}
                      </p>
                    )}
                    {vendorCheckStatus === 'urd' && (
                      <p className="text-[10px] mt-0.5 text-gray-500 font-semibold truncate">
                        ✎ URD Purchase — enter URD Vendor Name below
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setVendorForm({ name: '', gst_no: '', address: '', state: '' });
                      setShowAddVendorModal(true);
                    }}
                    className="px-2 py-1.5 text-white text-[10px] font-bold rounded-lg whitespace-nowrap self-start flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                    title="Add new vendor"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Invoice Date *</label>
                <input
                  type="date"
                  value={lvbForm.invoice_date}
                  onChange={e => setLvbForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  // ✅ min = lvb_days ago (from DB), max = today
                  min={isAdmin ? '' : (() => {
                    const d = new Date();
                    d.setDate(d.getDate() - (branchLimits.lvb_days || 30));
                    return d.toISOString().split('T')[0];
                  })()}
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              {/* Invoice Number */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Invoice Number *</label>
                <input
                  type="text"
                  value={lvbForm.invoice_number}
                  onChange={e => setLvbForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  placeholder="Enter invoice number"
                  required
                />
              </div>

              {/* Payment Amount */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Payment Amount (₹) *</label>
                <input
                  type="number"
                  value={lvbForm.payment_amount}
                  onChange={e => setLvbForm(prev => ({ ...prev, payment_amount: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  step="0.01"
                  placeholder="0.00"
                  required
                />
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={lvbForm.customer_name}
                  onChange={e => setLvbForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  placeholder="Enter customer name"
                  required
                />
              </div>

              {/* Customer Invoice No. */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Customer Invoice No. *</label>
                <input
                  type="text"
                  value={lvbForm.customer_invoice_no}
                  onChange={e => setLvbForm(prev => ({ ...prev, customer_invoice_no: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  placeholder="Customer invoice number"
                  required
                />
              </div>

              {/* Customer SR No. */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">SR No. *</label>
                <input
                  type="text"
                  value={lvbForm.customer_sr_no}
                  onChange={e => setLvbForm(prev => ({ ...prev, customer_sr_no: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  placeholder="Service Request No."
                  required
                />
              </div>

              {/* Customer Invoice Amount */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Customer Invoice Amount (₹) *</label>
                <input
                  type="number"
                  value={lvbForm.customer_invoice_amount}
                  onChange={e => setLvbForm(prev => ({ ...prev, customer_invoice_amount: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  step="0.01"
                  placeholder="0.00"
                  required
                />
              </div>

              {/* Line Work Amount */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Line Work Amount (₹) *</label>
                <input
                  type="number"
                  value={lvbForm.line_work_amount}
                  onChange={e => setLvbForm(prev => ({ ...prev, line_work_amount: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  step="0.01"
                  placeholder="0.00"
                  required
                />
              </div>

              {/* URD Vendor Name — only for URD */}
              {(vendorCheckStatus === 'urd' || lvbForm.vendor_name === 'URD Purchase') && (
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">URD Vendor Name *</label>
                  <input
                    type="text"
                    value={lvbForm.shop_name}
                    onChange={e => setLvbForm(prev => ({ ...prev, shop_name: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                    onFocus={e => e.target.style.borderColor = themeColor}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    placeholder="Enter shop / store name"
                    required
                  />
                </div>
              )}

              {/* Remark */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Remark</label>
                <input
                  type="text"
                  value={lvbForm.remark}
                  onChange={e => setLvbForm(prev => ({ ...prev, remark: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  placeholder="Optional"
                />
              </div>

              {/* Description */}
              <div className="col-span-2 md:col-span-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Description *</label>
                <textarea
                  value={lvbForm.description}
                  onChange={e => setLvbForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black resize-none"
                  onFocus={e => e.target.style.borderColor = themeColor}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  rows="2"
                  placeholder="Item details / purpose..."
                  required
                />
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setLvbForm({
                    vendor_name: '', vendor_id: null, is_registered: false, gst_no: '',
                    invoice_date: new Date().toISOString().split('T')[0],
                    invoice_number: '', payment_amount: '', shop_name: '', description: '', remark: '',
                    customer_name: '', customer_invoice_no: '', customer_sr_no: '',
                    customer_invoice_amount: '', line_work_amount: '',
                  });
                  setVendorSearchInput('');
                  setVendorCheckStatus(null);
                }}

                className="px-4 py-1.5 border border-gray-300 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submittingLvb}
                className="px-5 py-1.5 text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
              >
                {submittingLvb
                  ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Submitting...</>
                  : <><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Save Bill</>
                }
              </button>
            </div>
          </form>
        </div>

        {/* ── DRAFTS TABLE ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b flex justify-between items-center" style={{ backgroundColor: themeLight }}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs font-bold text-black">Drafts (Pending Submit)</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                {lvbTempDrafts.length}
              </span>

              {/* ✅ Total Amount + Date Range badges */}
              {lvbTempDrafts.length > 0 && (() => {
                const totalAmount = lvbTempDrafts.reduce((s, d) => s + parseFloat(d.payment_amount || 0), 0);
                const dates = lvbTempDrafts
                  .map(d => d.invoice_date)
                  .filter(Boolean)
                  .map(d => new Date(d))
                  .filter(d => !isNaN(d.getTime()));
                const minDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
                const maxDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
                const fmt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                return (
                  <>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold whitespace-nowrap">
                      Total: ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {minDate && maxDate && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold whitespace-nowrap">
                        {fmt(minDate)} → {fmt(maxDate)}
                      </span>
                    )}
                  </>
                );
              })()}

              {!isAdmin && !isUploadAllowed() && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-semibold">
                  Submit not allowed today — {getUploadRestrictionMessage()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canExport && lvbTempDrafts.length > 0 && (
                <button
                  onClick={() => exportToExcel(
                    lvbTempDrafts,
                    `lvb_drafts_${userBranch}.xlsx`,
                    [
                      { key: 'invoice_date', label: 'Invoice Date' },
                      { key: 'vendor_name', label: 'Vendor Name' },
                      { key: 'gst_no', label: 'GST No.' },
                      { key: 'invoice_number', label: 'Invoice No.' },
                      { key: 'payment_amount', label: 'Amount (₹)' },
                      { key: 'customer_name', label: 'Customer Name' },
                      { key: 'customer_invoice_no', label: 'Cust. Invoice No.' },
                      { key: 'customer_sr_no', label: 'SR No.' },
                      { key: 'customer_invoice_amount', label: 'Cust. Invoice Amt' },
                      { key: 'line_work_amount', label: 'Line Work Amt' },
                      { key: 'shop_name', label: 'URD Vendor Name' },
                      { key: 'description', label: 'Description' },
                      { key: 'remark', label: 'Remark' },
                    ]
                  )}
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-white text-[10px] font-semibold rounded-lg"
                  style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                  </svg>
                  Export
                </button>
              )}
              <button
                onClick={handleSubmitLvbTempToMain}
                disabled={submittingLvbTemp || (!isAdmin && !isUploadAllowed()) || Object.values(lvbTempSelected).filter(Boolean).length === 0}
                className="px-3 py-1.5 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 flex items-center gap-1"
                style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                title={!isAdmin && !isUploadAllowed() ? getUploadRestrictionMessage() : ''}
              >
                {submittingLvbTemp
                  ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Submitting...</>
                  : `Submit Selected (${Object.values(lvbTempSelected).filter(Boolean).length})`}
              </button>
            </div>
          </div>

          {loadingLvbTemp ? (
            <div className="text-center py-12 text-xs text-gray-500">Loading drafts...</div>
          ) : lvbTempDrafts.length === 0 ? (
            <div className="text-center py-12 text-xs text-gray-400">No drafts. Add via the form above.</div>
          ) : (
            <div className="overflow-x-auto" style={{ maxHeight: '320px' }}>
              <table className="w-full border-collapse" style={{ minWidth: '1700px' }}>
                <thead className="sticky top-0 z-10">
                  <tr style={{ backgroundColor: '#fff7ed' }}>
                    <th
                      className="px-2 py-1.5 text-[10px] font-bold border-b-2 border-r border-gray-200 text-center"
                      style={{
                        width: '40px',
                        position: 'sticky',
                        left: 0,
                        zIndex: 20,
                        backgroundColor: '#fff7ed',
                        boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                      }}
                    >
                      <input
                        type="checkbox"
                        disabled
                        className="cursor-not-allowed opacity-50"
                        checked={lvbTempDrafts.length > 0 && lvbTempDrafts.every(d => lvbTempSelected[d.id])}
                        title="Select rows individually"
                      />
                    </th>
                    {['Sr.No.', 'Invoice Date', 'Vendor Name', 'Type', 'GST No.', 'Invoice No.', 'Amount (₹)', 'Customer Name', 'Cust. Invoice No.', 'SR No.', 'Cust. Invoice Amt (₹)', 'Line Work Amt (₹)', 'URD Vendor Name', 'Description', 'Remark', 'Actions'].map((c, i) => (
                      <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-b-2 border-r border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...lvbTempDrafts].sort((a, b) => new Date(a.invoice_date || 0) - new Date(b.invoice_date || 0)).map((d, idx) => {
                    const isEditing = lvbTempEditingId === d.id;
                    return (
                      <tr key={d.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                        <td
                          className="px-2 py-0.5 border-r border-gray-100 text-center"
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 5,
                            backgroundColor: 'white',
                            boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                          }}
                        >
                          <input type="checkbox" checked={!!lvbTempSelected[d.id]} onChange={e => setLvbTempSelected(prev => ({ ...prev, [d.id]: e.target.checked }))} />
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input type="date" value={lvbTempEditForm.invoice_date} onChange={e => setLvbTempEditForm(p => ({ ...p, invoice_date: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : (d.invoice_date ? new Date(d.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          <div className="truncate max-w-[140px]" title={d.vendor_name}>{d.vendor_name || '-'}</div>
                        </td>
                        {/* Type (NEW) — GST / URD badge */}
                        <td className="px-2 py-0.5 border-r border-gray-100 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${d.is_registered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {d.is_registered ? 'GST' : 'URD'}
                          </span>
                        </td>

                        {/* GST No. (NEW) */}
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          <div className="truncate max-w-[120px]" title={d.gst_no || ''}>{d.gst_no || '-'}</div>
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input value={lvbTempEditForm.invoice_number} onChange={e => setLvbTempEditForm(p => ({ ...p, invoice_number: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : (d.invoice_number || '-')}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-center whitespace-nowrap">
                          {isEditing
                            ? <input type="number" value={lvbTempEditForm.payment_amount} onChange={e => setLvbTempEditForm(p => ({ ...p, payment_amount: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : `₹${parseFloat(d.payment_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input value={lvbTempEditForm.customer_name} onChange={e => setLvbTempEditForm(p => ({ ...p, customer_name: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : <div className="truncate max-w-[140px]" title={d.customer_name}>{d.customer_name || '-'}</div>}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input value={lvbTempEditForm.customer_invoice_no} onChange={e => setLvbTempEditForm(p => ({ ...p, customer_invoice_no: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : (d.customer_invoice_no || '-')}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input value={lvbTempEditForm.customer_sr_no} onChange={e => setLvbTempEditForm(p => ({ ...p, customer_sr_no: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : (d.customer_sr_no || '-')}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">
                          {isEditing
                            ? <input type="number" value={lvbTempEditForm.customer_invoice_amount} onChange={e => setLvbTempEditForm(p => ({ ...p, customer_invoice_amount: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : `₹${parseFloat(d.customer_invoice_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">
                          {isEditing
                            ? <input type="number" value={lvbTempEditForm.line_work_amount} onChange={e => setLvbTempEditForm(p => ({ ...p, line_work_amount: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : `₹${parseFloat(d.line_work_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input value={lvbTempEditForm.shop_name} onChange={e => setLvbTempEditForm(p => ({ ...p, shop_name: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : <div className="truncate max-w-[120px]" title={d.shop_name}>{d.shop_name || '-'}</div>}
                        </td>
                        {/* Description (NEW) */}
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input value={lvbTempEditForm.description || ''} onChange={e => setLvbTempEditForm(p => ({ ...p, description: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : <div className="truncate max-w-[140px]" title={d.description || ''}>{d.description || '-'}</div>}
                        </td>
                        <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                          {isEditing
                            ? <input value={lvbTempEditForm.remark} onChange={e => setLvbTempEditForm(p => ({ ...p, remark: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                            : <div className="truncate max-w-[100px]" title={d.remark}>{d.remark || '-'}</div>}
                        </td>
                        <td className="px-2 py-0.5 text-center">
                          <div className="flex gap-1 justify-center">
                            {isEditing ? (
                              <>
                                <button onClick={handleSaveEditLvbTemp} className="text-green-600 hover:text-green-800" title="Save">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </button>
                                <button onClick={() => { setLvbTempEditingId(null); setLvbTempEditForm({}); }} className="text-gray-500 hover:text-gray-700" title="Cancel">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleStartEditLvbTemp(d)} className="text-blue-600 hover:text-blue-800" title="Edit">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={() => handleDeleteLvbTemp(d.id)} className="text-red-600 hover:text-red-800" title="Delete">
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </>
                            )}
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

        {/* ── BILL RECORDS — Period summary by default, drill-in to detail ── */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b flex justify-between items-center" style={{ backgroundColor: themeLight }}>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs font-bold text-black">
                {selectedLvbPeriod ? 'Period Details' : 'Bill Records (By Period)'}
              </h2>

              {!loadingLvbBills && !selectedLvbPeriod && lvbPeriodGroups.length > 0 && (
                <>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                    {lvbPeriodGroups.length} period{lvbPeriodGroups.length === 1 ? '' : 's'}
                  </span>
                  {(() => {
                    const vouchers = Array.from(new Set(filteredLvbPeriodGroups.flatMap(g => g.records.map(r => r.submit_voucher_no).filter(Boolean))));
                    if (vouchers.length === 0) return null;
                    return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ backgroundColor: themeLight, color: themeColor }}>
                        Voucher{vouchers.length > 1 ? 's' : ''}: {vouchers.join(', ')}
                      </span>
                    );
                  })()}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold whitespace-nowrap">
                    Grand Total: ₹{filteredLvbPeriodGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold whitespace-nowrap">
                    Verified: ₹{filteredLvbPeriodGroups.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-semibold whitespace-nowrap">
                    Rule: {submitRule?.rule_type === 'weekdays' ? 'Weekly periods' : '15-day periods'}
                  </span>
                </>
              )}

              {selectedLvbPeriod && (
                <>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold whitespace-nowrap">
                    {selectedLvbPeriod.periodStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} → {selectedLvbPeriod.periodEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold whitespace-nowrap">
                    Submitted By: {selectedLvbPeriod.submittedBy}
                  </span>
                  {(() => {
                    const vouchers = Array.from(new Set(selectedLvbPeriod.records.map(r => r.submit_voucher_no).filter(Boolean)));
                    return vouchers.length > 0 ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap font-mono" style={{ backgroundColor: themeLight, color: themeColor }}>
                        Voucher{vouchers.length > 1 ? 's' : ''}: {vouchers.join(', ')}
                      </span>
                    ) : null;
                  })()}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold whitespace-nowrap">
                    Records: {selectedLvbPeriod.records.length}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold whitespace-nowrap">
                    Total: ₹{selectedLvbPeriod.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold whitespace-nowrap">
                    Verified: ₹{selectedLvbPeriod.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedLvbPeriod && (
                <button
                  onClick={() => setSelectedLvbPeriod(null)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                  style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back
                </button>
              )}
              {selectedLvbPeriod && (
                <button
                  onClick={() => printLvbReport(selectedLvbPeriod)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                  title="Print this period's Local Vendor Bills report"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
              )}
              {canExport && lvbBills.length > 0 && (
                <button
                  onClick={() => exportToExcel(
                    selectedLvbPeriod ? filteredLvbDetailRecords : lvbBills,
                    `lvb_${userBranch}.xlsx`,
                    [
                      { key: 'invoice_date', label: 'Invoice Date' },
                      { key: 'vendor_name', label: 'Vendor Name' },
                      { key: 'gst_no', label: 'GST No.' },
                      { key: 'invoice_number', label: 'Invoice No.' },
                      { key: 'payment_amount', label: 'Amount (₹)' },
                      { key: 'customer_name', label: 'Customer Name' },
                      { key: 'customer_invoice_no', label: 'Customer Invoice No.' },
                      { key: 'customer_sr_no', label: 'SR No.' },
                      { key: 'customer_invoice_amount', label: 'Customer Invoice Amount (₹)' },
                      { key: 'line_work_amount', label: 'Line Work Amount (₹)' },
                      { key: 'shop_name', label: 'URD Vendor Name' },
                      { key: 'description', label: 'Description' },
                      { key: 'remark', label: 'Remark' },
                      { key: 'created_by_name', label: 'Added By' },
                      { key: 'ho_paid_date', label: 'HO Paid Date' },
                    ]
                  )}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                  style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                  </svg>
                  Export
                </button>
              )}
              <button
                onClick={() => setShowLvbHistoryModal(true)}
                className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History
              </button>
            </div>
          </div>

          {loadingLvbBills && lvbBills.length === 0 ? (
            <div className="text-center py-16">
              <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-xs text-gray-500">Loading bills...</p>
            </div>
          ) : lvbBills.length === 0 ? (
            <div className="text-center py-16">
              <svg className="h-12 w-12 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-xs text-gray-500 font-medium">No bills found</p>
              <p className="text-[11px] text-gray-400 mt-1">Add a bill using the form above</p>
            </div>
          ) : selectedLvbPeriod ? (
            /* ─── DETAIL VIEW: inner filter bar + this period's records ─── */
            <>
              <div className="px-3 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">Filter records:</span>

                <div className="relative flex-1 min-w-[180px]">
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search vendor, invoice, customer, shop, description..."
                    value={lvbDetailSearch}
                    onChange={(e) => setLvbDetailSearch(e.target.value)}
                    className="w-full pl-6 pr-6 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-black"
                  />
                  {lvbDetailSearch && (
                    <button onClick={() => setLvbDetailSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>

                <select
                  value={lvbDetailVendor}
                  onChange={(e) => setLvbDetailVendor(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Vendors</option>
                  {Array.from(new Set(selectedLvbPeriod.records.map(r => r.vendor_name).filter(Boolean)))
                    .sort()
                    .map(v => <option key={v} value={v}>{v}</option>)}
                </select>

                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer transition-all ${lvbDetailVerifiedOnly
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                    }`}
                  title="Show only verified records"
                >
                  <input
                    type="checkbox"
                    checked={lvbDetailVerifiedOnly}
                    onChange={(e) => setLvbDetailVerifiedOnly(e.target.checked)}
                    className="hidden"
                  />
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Verified Only
                </label>

                {(lvbDetailSearch || lvbDetailVendor || lvbDetailVerifiedOnly) && (
                  <button
                    onClick={() => { setLvbDetailSearch(''); setLvbDetailVendor(''); setLvbDetailVerifiedOnly(false); }}
                    className="px-2 py-1 text-[10px] text-red-600 border border-red-300 rounded-lg hover:bg-red-50 whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}

                <span className="ml-auto text-[10px] text-gray-600">
                  Showing <strong>{filteredLvbDetailRecords.length}</strong> of <strong>{selectedLvbPeriod.records.length}</strong> · Total{' '}
                  <strong className="text-blue-700">₹{filteredLvbDetailTotals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> · Verified{' '}
                  <strong className="text-emerald-700">₹{filteredLvbDetailTotals.verified.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </span>
              </div>

              <div className="overflow-x-auto" style={{ maxHeight: '480px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}>
                <table className="border-collapse w-full" style={{ minWidth: '1100px' }}>
                  <thead className="sticky top-0 z-10">
                    <tr style={{ backgroundColor: '#f0f1ff' }}>
                      {[
                        { label: 'Sr.No.', w: '45px' },
                        { label: 'Invoice Date', w: '100px' },
                        { label: 'Vendor Name', w: '160px' },
                        { label: 'Type', w: '70px' },
                        { label: 'GST No.', w: '120px' },
                        { label: 'Invoice No.', w: '110px' },
                        { label: 'Amount (₹)', w: '110px' },
                        { label: 'Customer Name', w: '150px' },
                        { label: 'Cust. Invoice No.', w: '120px' },
                        { label: 'SR No.', w: '100px' },
                        { label: 'Cust. Invoice Amt (₹)', w: '130px' },
                        { label: 'Line Work Amt (₹)', w: '120px' },
                        { label: 'URD Vendor Name', w: '120px' },
                        { label: 'Description', w: '160px' },
                        { label: 'Remark', w: '120px' },
                        { label: 'Status', w: '90px' },
                      ].map((col, i) => (
                        <th key={i}
                          className="px-2 py-2 text-[10px] font-bold text-gray-600 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap"
                          style={{ width: col.w, minWidth: col.w, backgroundColor: '#f0f1ff' }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLvbDetailRecords.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="text-center py-10 text-xs text-gray-400">
                          No records match your filters in this period.{' '}
                          <button
                            onClick={() => { setLvbDetailSearch(''); setLvbDetailVendor(''); setLvbDetailVerifiedOnly(false); }}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            Clear filters
                          </button>
                        </td>
                      </tr>
                    ) : filteredLvbDetailRecords.map((bill, idx) => (
                      <tr key={bill.id} className="hover:bg-blue-50/40 transition-colors" style={{ height: '34px' }}>
                        <td className="px-2 py-1 text-[11px] text-black text-center font-medium border-r border-gray-100">{idx + 1}</td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100 whitespace-nowrap">
                          {bill.invoice_date ? new Date(bill.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.vendor_name || ''}>{bill.vendor_name || '-'}</div></td>
                        <td className="px-2 py-1 text-center border-r border-gray-100">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${bill.is_registered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {bill.is_registered ? 'GST' : 'URD'}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.gst_no || ''}>{bill.gst_no || '-'}</div></td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.invoice_number || ''}>{bill.invoice_number || '-'}</div></td>
                        <td className="px-2 py-1 text-[11px] font-bold text-black text-center border-r border-gray-100 whitespace-nowrap">
                          ₹{parseFloat(bill.payment_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.customer_name || ''}>{bill.customer_name || '-'}</div></td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.customer_invoice_no || ''}>{bill.customer_invoice_no || '-'}</div></td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.customer_sr_no || ''}>{bill.customer_sr_no || '-'}</div></td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100 whitespace-nowrap">
                          ₹{parseFloat(bill.customer_invoice_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100 whitespace-nowrap">
                          ₹{parseFloat(bill.line_work_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.shop_name || ''}>{bill.shop_name || '-'}</div></td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.description || ''}>{bill.description || '-'}</div></td>
                        <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={bill.remark || ''}>{bill.remark || '-'}</div></td>
                        <td className="px-2 py-1 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${bill.verification_status === 'Verified' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {bill.verification_status || 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0">
                    <tr style={{ backgroundColor: '#f0f1ff' }}>
                      <td colSpan={6} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                        {(lvbDetailSearch || lvbDetailVendor || lvbDetailVerifiedOnly) ? 'Filtered Total' : 'Period Total'}
                      </td>
                      <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>
                        ₹{filteredLvbDetailTotals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td colSpan={9} className="border-t-2 border-gray-200" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          ) : (
            /* ─── SUMMARY VIEW: one row per period (filtered) ─── */
            <div className="overflow-x-auto" style={{ maxHeight: '480px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}>
              <table className="w-full border-collapse" style={{ minWidth: '1040px' }}>
                <thead className="sticky top-0 z-10">
                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                    {[
                      { label: 'Sr. No.', w: '60px' },
                      { label: 'Period (Start → End)', w: '280px' },
                      { label: 'Submitted By', w: '200px' },
                      { label: 'Voucher No.', w: '140px' },
                      { label: 'Records', w: '90px' },
                      { label: 'Total Amount', w: '160px' },
                      { label: 'Verified Amount', w: '160px' },
                    ].map((col, i) => (
                      <th key={i}
                        className="px-3 py-2 text-[11px] font-bold text-gray-700 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap"
                        style={{ width: col.w, minWidth: col.w, backgroundColor: '#f0f1ff' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lvbPeriodGroups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-xs text-gray-400">
                        No periods yet.
                      </td>
                    </tr>
                  ) : lvbPeriodGroups.map((g, idx) => {
                    const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                    const vouchers = Array.from(new Set(g.records.map(r => r.submit_voucher_no).filter(Boolean)));
                    const voucherLabel = vouchers.length ? vouchers.join(', ') : '-';
                    return (
                      <tr
                        key={g.key}
                        className="hover:bg-blue-50 transition-colors"
                        style={{ height: '40px' }}
                      >
                        <td className="px-3 py-1 text-[12px] text-center font-medium border-r border-gray-100">{idx + 1}</td>
                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-gray-800">{fmt(g.periodStart)}</span>
                            <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                            <span className="font-semibold text-gray-800">{fmt(g.periodEnd)}</span>
                          </span>
                        </td>
                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-medium text-purple-700">
                          {g.submittedBy}
                        </td>
                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                          <span
                            onClick={(e) => { e.stopPropagation(); setSelectedLvbPeriod(g); }}
                            className="underline cursor-pointer hover:font-bold font-mono"
                            style={{ color: themeColor, textUnderlineOffset: '2px' }}
                            title="Click to view this period's records"
                          >
                            {voucherLabel}
                          </span>
                        </td>
                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">
                          {g.records.length}
                        </td>
                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-blue-700 whitespace-nowrap">
                          ₹{g.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-1 text-[12px] text-center font-bold text-emerald-700 whitespace-nowrap">
                          ₹{g.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0">
                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                    <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                      Grand Total ({filteredLvbPeriodGroups.length} period{filteredLvbPeriodGroups.length === 1 ? '' : 's'})
                    </td>
                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">
                      {filteredLvbPeriodGroups.reduce((s, g) => s + g.records.length, 0)}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-blue-700 whitespace-nowrap">
                      ₹{filteredLvbPeriodGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">
                      ₹{filteredLvbPeriodGroups.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {lvbBillsHasMore && !loadingLvbBills && lvbBills.length > 0 && !selectedLvbPeriod && (
            <div className="text-center py-3 border-t bg-gray-50">
              <button onClick={() => fetchLvbBills(false)} disabled={lvbBillsLoadingMore}
                className="px-5 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 mx-auto"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                {lvbBillsLoadingMore
                  ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Loading...</>
                  : 'Load More'}
              </button>
            </div>
          )}
        </div>

        {showAddVendorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

              {/* Header */}
              <div className="px-4 py-3 flex justify-between items-center shrink-0"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <h2 className="text-sm font-bold text-white">Add New Vendor</h2>
                </div>
                <button onClick={() => setShowAddVendorModal(false)}
                  className="w-7 h-7 bg-white rounded-lg flex items-center justify-center">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>

                {/* ── Add Form ── */}
                <div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Vendor Name *</label>
                      <input
                        type="text"
                        value={vendorForm.name}
                        onChange={e => setVendorForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                        onFocus={e => e.target.style.borderColor = themeColor}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        placeholder="Enter vendor name"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">GST Number *</label>
                      <input
                        type="text"
                        value={vendorForm.gst_no}
                        onChange={e => {
                          const upper = e.target.value.toUpperCase();
                          const stateCode = upper.substring(0, 2);
                          const autoState = GST_STATE_MAP[stateCode] || '';
                          setVendorForm(prev => ({ ...prev, gst_no: upper, state: autoState }));
                        }}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none text-black font-mono"
                        onFocus={e => e.target.style.borderColor = themeColor}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        placeholder="e.g. 27AABCU9603R1ZX"
                        maxLength={15}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">State (auto-filled)</label>
                        <input
                          type="text"
                          value={vendorForm.state}
                          readOnly
                          className="w-full px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                          placeholder="Auto from GST"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Address</label>
                        <textarea
                          value={vendorForm.address}
                          onChange={e => setVendorForm(prev => ({ ...prev, address: e.target.value }))}
                          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none text-black resize-none"
                          onFocus={e => e.target.style.borderColor = themeColor}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                          placeholder="Full vendor address"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Existing Vendors — Card Grid ── */}
                {lvbVendors.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                      All Vendors ({lvbVendors.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-1 gap-2">
                      {lvbVendors.map((v, idx) => (
                        <div key={v.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-blue-50/40 transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-[11px] font-bold text-gray-800 leading-tight">{v.name}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${v.is_registered ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                              {v.is_registered ? 'GST' : 'URD'}
                            </span>
                          </div>
                          {v.is_registered && v.gst_no && (
                            <p className="text-[10px] text-gray-500 font-mono mb-0.5">GST: {v.gst_no}</p>
                          )}
                          {v.state && (
                            <p className="text-[10px] text-gray-500 mb-0.5">📍 {v.state}</p>
                          )}
                          {v.address && (
                            <p className="text-[10px] text-gray-400 leading-tight line-clamp-2" title={v.address}>{v.address}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
                <button
                  onClick={() => setShowAddVendorModal(false)}
                  className="px-4 py-1.5 border border-gray-300 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNewVendor}
                  disabled={savingVendor || !vendorForm.name.trim() || !vendorForm.gst_no.trim()}
                  className="px-5 py-1.5 text-white text-xs font-bold rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                >
                  {savingVendor
                    ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving...</>
                    : <><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Save Vendor</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showLvbHistoryModal && (
        <BranchLVBHistory
          branchCode={userBranch}
          branchName={getBranchLabel(userBranch)}
          themeColor={themeColor}
          canExport={canExport}
          onClose={() => setShowLvbHistoryModal(false)}
        />
      )}
    </>
  );
};

export default BranchLVB;