import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import BranchOEHistory from './BranchOEhistory';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

/* ═══════════════════════════════════════════════════════════════════════════════
   BranchOE — Office Expense tab
   Extracted verbatim from BranchAdminExpense.jsx. No logic changed.
   Shared helpers come in as props from the parent.
═══════════════════════════════════════════════════════════════════════════════ */
const BranchOE = ({
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
    /* ── Expense heads ── */
    const [expenseHeads, setExpenseHeads] = useState([]);
    const [selectedSubheads, setSelectedSubheads] = useState([]);

    /* ── OE Temp/Draft state ── */
    const [oeTempDrafts, setOeTempDrafts] = useState([]);
    const [loadingOeTemp, setLoadingOeTemp] = useState(false);
    const [oeTempSelected, setOeTempSelected] = useState({});      // {id: true/false}
    const [oeTempEditingId, setOeTempEditingId] = useState(null);
    const [oeTempEditForm, setOeTempEditForm] = useState({});
    const [submittingOeTemp, setSubmittingOeTemp] = useState(false);
    const [selectedOEPeriod, setSelectedOEPeriod] = useState(null);

    // Outer (period summary) filters — match period table columns
    const [oeSubmitterSearch, setOeSubmitterSearch] = useState('');
    const [oePeriodFromDate, setOePeriodFromDate] = useState('');
    const [oePeriodToDate, setOePeriodToDate] = useState('');

    // Inner (period detail) filters
    const [oeDetailSearch, setOeDetailSearch] = useState('');
    const [oeDetailHead, setOeDetailHead] = useState('');
    const [oeDetailVerifiedOnly, setOeDetailVerifiedOnly] = useState(false);

    /* ── Main office expenses table ── */
    const [officeExpenses, setOfficeExpenses] = useState([]);
    const [loadingOfficeExpenses, setLoadingOfficeExpenses] = useState(false);
    const [officeExpenseForm, setOfficeExpenseForm] = useState({
        paid_date: new Date().toISOString().split('T')[0],
        expenses_head: '',
        sub_head: '',
        expenses_description: '',
        description: '',
        internal_branch_name: '',
        paid_to: '',
        invoice_no: '',
        amount: '',
        remark: '',
        paid_by: user?.name || '',
        voucher_no: ''
    });
    const [submittingExpense, setSubmittingExpense] = useState(false);
    const [officeExpenseSearch, setOfficeExpenseSearch] = useState('');
    const [officeExpenseStartDate, setOfficeExpenseStartDate] = useState('');
    const [officeExpenseEndDate, setOfficeExpenseEndDate] = useState('');
    const [officeExpenseHead, setOfficeExpenseHead] = useState('');
    const [officeExpenseSkip, setOfficeExpenseSkip] = useState(0);
    const [officeExpenseHasMore, setOfficeExpenseHasMore] = useState(true);
    const [officeExpenseLoadingMore, setOfficeExpenseLoadingMore] = useState(false);

    const [showOEHistoryModal, setShowOEHistoryModal] = useState(false);

    // ── Branch Imprest view (read-only) ──
    const [showBranchImprestModal, setShowBranchImprestModal] = useState(false);
    const [branchImprestData, setBranchImprestData] = useState({ entries: [], total: 0, count: 0 });
    const [loadingBranchImprest, setLoadingBranchImprest] = useState(false);

    /* ── Refs ── */
    const oeTableContainerRef = useRef(null);
    const oeTopScrollBarRef = useRef(null);
    const oeTableRef = useRef(null);

    /* ─────────────────────────────────────────────────────────────────────────────
       PRINT — Office Expense Report (period drill-in)
    ───────────────────────────────────────────────────────────────────────────── */
    const printOfficeExpenseReport = async (period) => {
        if (!period || !period.records || period.records.length === 0) {
            toast.error('No records to print');
            return;
        }

        // Fetch imprest amount if not already loaded
        let imprestTotal = branchImprestData.total || 0;
        if (!imprestTotal) {
            try {
                const { data } = await axios.get(`${API_BASE_URL}/imprest/branch/${userBranch}`);
                imprestTotal = parseFloat(data.total) || 0;
            } catch (err) {
                imprestTotal = 0;
            }
        }

        const escape = (val) => {
            if (val === null || val === undefined) return '';
            return String(val)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        };

        const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

        let grandTotal = 0;
        const rowsHtml = period.records.map((r, idx) => {
            const amt = parseFloat(r.amount || 0) || 0;
            grandTotal += amt;
            return `
        <tr>
          <td>${idx + 1}</td>
          <td>${fmtDate(r.paid_date)}</td>
          <td class="al">${escape(r.sub_head || '-')}</td>
          <td class="al">${escape(r.expenses_head || '-')}</td>
          <td class="al">${escape(r.internal_branch_name || '-')}</td>
          <td>${escape(r.invoice_no || '-')}</td>
          <td style="text-align: right;">₹${amt.toFixed(2)}</td>
          <td class="al">${escape(r.paid_to || '-')}</td>
          <td>${escape(r.submit_voucher_no || '-')}</td>
          <td class="al">${escape(r.expenses_description || '-')}</td>
        </tr>
      `;
        }).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Office Expenses — ${escape(getBranchLabel(userBranch))}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; margin: 0; padding: 8px; color: #000; }
    .company-header {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 8px;
      padding: 6px;
      border: 1.5px solid #000;
      background: #f5f5f5;
    }
    .info-table { width: 100%; margin-bottom: 8px; border-collapse: collapse; }
    .info-table td { padding: 4px 8px; font-size: 11px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; width: 18%; }
    .info-table .title-cell {
      font-weight: bold;
      background: #d4d4d4;
      text-align: center;
      font-size: 13px;
    }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.data th, table.data td {
      border: 1px solid #000;
      padding: 2px 3px;
      text-align: center;
      font-size: 8px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      vertical-align: middle;
    }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; font-size: 9.5px; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
    .print-btn {
      position: fixed; top: 10px; right: 10px;
      padding: 8px 16px; background: #2f3192; color: white;
      border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;
      z-index: 1000;
    }
    .print-btn:hover { background: #1e1f6b; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>

  <div class="company-header">KALA Care Global LLP, ${escape(getBranchLabel(userBranch))}</div>

  <table class="info-table">
    <tr>
      <td class="title-cell" colspan="2">Office Expenses</td>
      <td class="label">Branch Code :</td>
      <td>${escape(userBranch)}</td>
      <td class="label">Branch Employee :</td>
      <td>${escape(period.submittedBy || '-')}</td>
    </tr>
    <tr>
      <td class="label">Voucher No. :</td>
      <td>${escape(Array.from(new Set(period.records.map(r => r.submit_voucher_no).filter(Boolean))).join(', ') || '-')}</td>
      <td class="label">Period :</td>
      <td>${fmtDate(period.periodStart)} — ${fmtDate(period.periodEnd)}</td>
      <td class="label">Imprest Holding Amount :</td>
      <td>₹${imprestTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  </table>

  <table class="data">
    <thead>
      <tr>
        <th style="width: 40px;">SL no.</th>
        <th style="width: 75px;">Paid Date</th>
        <th style="width: 100px;">Expenses Sub Head</th>
        <th style="width: 95px;">Expenses Head (GL Code)</th>
        <th style="width: 100px;">Internal Branch Name</th>
        <th style="width: 130px;">Invoice No. / Stock transfer No. / SR no. / DC no. / Ref.no</th>
        <th style="width: 85px;">Amount</th>
        <th style="width: 100px;">Paid TO</th>
        <th style="width: 95px;">Voucher NO.</th>
        <th>Expenses Description</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align: right;">Grand Total (${period.records.length} record${period.records.length === 1 ? '' : 's'}):</td>
        <td style="text-align: right;">₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

        const printWindow = window.open('', '_blank', 'width=1400,height=900');
        if (!printWindow) {
            toast.error('Please allow pop-ups for this site to print');
            return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    };

    /* ─────────────────────────────────────────────────────────────────────────────
       PRINT — Single Office Expense Voucher
     ───────────────────────────────────────────────────────────────────────────── */
    const printOfficeExpenseVoucher = (r) => {
        if (!r) { toast.error('No record to print'); return; }

        const escape = (val) => {
            if (val === null || val === undefined) return '';
            return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };
        const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
        const amt = parseFloat(r.amount || 0) || 0;

        // Amount in words (Indian numbering)
        const numberToWords = (num) => {
            if (num === 0) return 'Zero';
            const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
                'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
            const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
            const twoDigits = (n) => n < 20 ? a[n] : `${b[Math.floor(n / 10)]}${n % 10 ? ' ' + a[n % 10] : ''}`;
            const threeDigits = (n) => `${n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : ''}${n % 100 ? twoDigits(n % 100) : ''}`;
            let result = '';
            const crore = Math.floor(num / 10000000); num %= 10000000;
            const lakh = Math.floor(num / 100000); num %= 100000;
            const thousand = Math.floor(num / 1000); num %= 1000;
            const hundred = num;
            if (crore) result += threeDigits(crore) + ' Crore ';
            if (lakh) result += twoDigits(lakh) + ' Lakh ';
            if (thousand) result += twoDigits(thousand) + ' Thousand ';
            if (hundred) result += threeDigits(hundred);
            return result.trim();
        };

        const rupees = Math.floor(amt);
        const paise = Math.round((amt - rupees) * 100);
        let words = numberToWords(rupees) + ' Rupees';
        if (paise > 0) words += ` and ${numberToWords(paise)} Paise`;
        words += ' Only';

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Voucher — ${escape(r.submit_voucher_no || '')}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 10px; color: #000; }
    .voucher-box { border: 1.5px solid #000; padding: 18px 24px; }
    .v-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 22px; }
    table.v-head { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    table.v-head td { padding: 3px 6px; font-size: 13px; vertical-align: top; }
    .lbl { font-weight: bold; }
    table.v-body { width: 100%; border-collapse: collapse; }
    table.v-body td { padding: 5px 6px; font-size: 13px; vertical-align: top; }
    .amt-col { border-left: 1px solid #000; text-align: right; width: 160px; }
    .amt-head { border-left: 1px solid #000; font-weight: bold; width: 160px; }
    .total-row td { border-top: 1px solid #000; font-weight: bold; padding-top: 6px; }
    .words-row td { padding-top: 14px; }
    .sign-row { margin-top: 60px; display: flex; justify-content: space-between; }
    .sign-row span { font-size: 13px; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 16px; background: #2f3192; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; z-index: 1000; }
    .print-btn:hover { background: #1e1f6b; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>
  <div class="voucher-box">
    <div class="v-title">Voucher</div>

    <table class="v-head">
      <tr>
        <td style="width: 60%;"><span class="lbl">Branch Name:</span> ${escape(getBranchLabel(userBranch))} (${escape(userBranch)})</td>
        <td><span class="lbl">Voucher No.</span> ${escape(r.submit_voucher_no || '-')}</td>
      </tr>
      <tr>
        <td></td>
        <td><span class="lbl">Date:</span> ${fmtDate(r.paid_date)}</td>
      </tr>
    </table>

    <table class="v-body">
      <tr>
        <td><span class="lbl">Expenses GL Code:</span> ${escape(r.expenses_head || '-')}</td>
        <td class="amt-head">Amount</td>
      </tr>
      <tr>
        <td><span class="lbl">Expenses Sub Head:</span> ${escape(r.sub_head || '-')}</td>
        <td class="amt-col">${amt.toFixed(2)}</td>
      </tr>
      <tr>
        <td><span class="lbl">Internal Branch Name:</span> ${escape(r.internal_branch_name || '-')}</td>
        <td class="amt-col"></td>
      </tr>
      <tr>
        <td><span class="lbl">Paid To:</span> ${escape(r.paid_to || '-')}</td>
        <td class="amt-col"></td>
      </tr>
      <tr>
        <td><span class="lbl">Ref. no.:</span> ${escape(r.invoice_no || '-')}</td>
        <td class="amt-col"></td>
      </tr>
      <tr>
        <td><span class="lbl">Description:</span> ${escape(r.expenses_description || '-')}</td>
        <td class="amt-col"></td>
      </tr>
      <tr class="total-row">
        <td></td>
        <td class="amt-col" style="border-left: 1px solid #000;">${amt.toFixed(2)}</td>
      </tr>
      <tr class="words-row">
        <td colspan="2"><span class="lbl">Amount in Words:</span> ${escape(words)}</td>
      </tr>
    </table>

    <div class="sign-row">
      <span>Prepared By</span>
      <span>Checked By</span>
      <span>Receiver's Signature</span>
    </div>
  </div>
</body>
</html>`;

        const w = window.open('', '_blank', 'width=900,height=1100');
        if (!w) { toast.error('Please allow pop-ups for this site to print'); return; }
        w.document.open(); w.document.write(html); w.document.close();
    };

    /* ─── Office Expense grouping (by submitted voucher; period = min→max date) ─── */
    const oePeriodGroups = useMemo(() => {
        if (!officeExpenses || officeExpenses.length === 0) return [];

        const groups = new Map();
        officeExpenses.forEach(exp => {
            const d = exp.paid_date ? new Date(exp.paid_date) : null;
            if (!d || isNaN(d.getTime())) return;

            const submitter = exp.created_by_name || exp.paid_by || 'Unknown';
            const voucher = exp.submit_voucher_no || 'No Voucher';
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
            g.records.push(exp);
            if (!g.periodStart || d < g.periodStart) g.periodStart = d;
            if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
            const amt = parseFloat(exp.amount || 0);
            g.totalAmount += amt;
            if (exp.verification_status === 'Verified') g.verifiedAmount += amt;
        });

        return Array.from(groups.values())
            .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
    }, [officeExpenses]);

    /* ─── Filtered period groups (outer table) ───────────────────────────────── */
    const filteredPeriodGroups = useMemo(() => {
        return oePeriodGroups.filter(g => {
            if (oeSubmitterSearch) {
                const q = oeSubmitterSearch.toLowerCase();
                if (!String(g.submittedBy || '').toLowerCase().includes(q)) return false;
            }
            if (oePeriodFromDate) {
                const from = new Date(oePeriodFromDate);
                from.setHours(0, 0, 0, 0);
                if (g.periodEnd < from) return false;
            }
            if (oePeriodToDate) {
                const to = new Date(oePeriodToDate);
                to.setHours(23, 59, 59, 999);
                if (g.periodStart > to) return false;
            }
            return true;
        });
    }, [oePeriodGroups, oeSubmitterSearch, oePeriodFromDate, oePeriodToDate]);

    /* ─── Filtered detail records (inner table) ──────────────────────────────── */
    const filteredDetailRecords = useMemo(() => {
        if (!selectedOEPeriod) return [];
        return selectedOEPeriod.records.filter(r => {
            if (oeDetailVerifiedOnly && r.verification_status !== 'Verified') return false;
            if (oeDetailHead && r.expenses_head !== oeDetailHead) return false;
            if (oeDetailSearch) {
                const q = oeDetailSearch.toLowerCase();
                const hit = [
                    r.paid_to, r.invoice_no, r.voucher_no, r.paid_by,
                    r.expenses_head, r.sub_head, r.expenses_description, r.description, r.remark,
                ].some(v => String(v || '').toLowerCase().includes(q));
                if (!hit) return false;
            }
            return true;
        }).sort((a, b) => new Date(a.paid_date || 0) - new Date(b.paid_date || 0));
    }, [selectedOEPeriod, oeDetailSearch, oeDetailHead, oeDetailVerifiedOnly]);

    const filteredDetailTotals = useMemo(() => {
        const total = filteredDetailRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        const verified = filteredDetailRecords
            .filter(r => r.verification_status === 'Verified')
            .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        return { total, verified };
    }, [filteredDetailRecords]);

    /* ─── Reset inner filters whenever drill-in period changes ───────────────── */
    useEffect(() => {
        setOeDetailSearch('');
        setOeDetailHead('');
        setOeDetailVerifiedOnly(false);
    }, [selectedOEPeriod?.key]);

    const fetchOfficeExpenses = useCallback(async (reset = false) => {
        if (reset) {
            setOfficeExpenses([]);
            setOfficeExpenseSkip(0);
        }

        const currentSkip = reset ? 0 : officeExpenseSkip;

        if (!reset && officeExpenseLoadingMore) return;

        reset ? setLoadingOfficeExpenses(true) : setOfficeExpenseLoadingMore(true);

        try {
            const params = new URLSearchParams({
                branch_code: userBranch,
                skip: currentSkip,
                limit: 50
            });

            if (officeExpenseStartDate) params.append('start_date', officeExpenseStartDate);
            if (officeExpenseEndDate) params.append('end_date', officeExpenseEndDate);
            if (officeExpenseHead) params.append('expenses_head', officeExpenseHead);
            if (officeExpenseSearch) params.append('search', officeExpenseSearch);

            const { data } = await axios.get(`${API_BASE_URL}/office-expenses/?${params}`);

            setOfficeExpenses(prev => reset ? data : [...prev, ...data]);
            setOfficeExpenseSkip(currentSkip + 50);
            setOfficeExpenseHasMore(data.length === 50);
        } catch (error) {
            console.error('Error fetching office expenses:', error);
            toast.error('Failed to load office expenses');
        } finally {
            reset ? setLoadingOfficeExpenses(false) : setOfficeExpenseLoadingMore(false);
        }
    }, [userBranch, officeExpenseStartDate, officeExpenseEndDate, officeExpenseHead, officeExpenseSearch, officeExpenseSkip]);

    // Handle form input changes
    const handleOfficeExpenseInputChange = (e) => {
        const { name, value } = e.target;
        setOfficeExpenseForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmitOfficeExpense = async (e) => {
        e.preventDefault();
        // ✅ NO upload-window check here. Drafts can be added any day.
        // All fields are compulsory EXCEPT remark
        if (!officeExpenseForm.paid_date || !officeExpenseForm.expenses_head ||
            !officeExpenseForm.sub_head || !officeExpenseForm.internal_branch_name ||
            !officeExpenseForm.paid_to ||
            !officeExpenseForm.invoice_no || !officeExpenseForm.amount ||
            !officeExpenseForm.paid_by ||
            !officeExpenseForm.expenses_description) {
            toast.error('Please fill all required fields (only Remark is optional)');
            return;
        }

        setSubmittingExpense(true);
        try {
            // Store expenses_head as "GL Code - Branch Name".
            // Derive the clean GL code from the selected sub head so it never double-appends.
            const glMatch = allSubheads.find(x => x.subhead === officeExpenseForm.sub_head);
            const glCode = glMatch ? glMatch.head : officeExpenseForm.expenses_head;
            const payload = {
                ...officeExpenseForm,
                expenses_head: glCode ? `${glCode} - ${getBranchLabel(userBranch)}` : '',
                amount: parseFloat(officeExpenseForm.amount),
                branch_code: userBranch,
                created_by: String(user?.user_id || user?.id || ''),
                created_by_name: user?.name || 'System',
            };
            // ⚠️ posts to /temp instead of /
            await axios.post(`${API_BASE_URL}/office-expenses/temp`, payload);
            toast.success('Saved as draft');

            setOfficeExpenseForm({
                paid_date: new Date().toISOString().split('T')[0],
                expenses_head: '', sub_head: '', expenses_description: '',
                description: '', internal_branch_name: '', paid_to: '', invoice_no: '', amount: '',
                remark: '', paid_by: user?.name || '', voucher_no: ''
            });
            fetchOeTempDrafts();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to save draft');
        } finally {
            setSubmittingExpense(false);
        }
    };

    // Delete office expense
    const handleDeleteOfficeExpense = async (id) => {
        const result = await Swal.fire({
            title: 'Delete this expense?',
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
            await axios.delete(`${API_BASE_URL}/office-expenses/${id}`);
            toast.success('Expense deleted successfully');
            fetchOfficeExpenses(true);
        } catch (error) {
            console.error('Error deleting expense:', error);
            toast.error('Failed to delete expense');
        }
    };

    // Fetch expense heads from backend
    const fetchExpenseHeads = async () => {
        try {
            const { data } = await axios.get(`${API_BASE_URL}/office-expenses/expense-heads`);
            setExpenseHeads(data);
        } catch (error) {
            console.error('Error fetching expense heads:', error);
            toast.error('Failed to load expense categories');
        }
    };

    // One entry per subhead, carrying its parent head. Handles ["a"] or [{id,name}].
    const allSubheads = useMemo(() => {
        const out = [];
        (expenseHeads || []).forEach(h => {
            let subs = h.subheads;
            if (typeof subs === 'string') { try { subs = JSON.parse(subs || '[]'); } catch { subs = []; } }
            (subs || []).forEach(s => {
                const name = typeof s === 'string' ? s : (s?.name || '');
                if (name) out.push({ subhead: name, head: h.name });
            });
        });
        return out;
    }, [expenseHeads]);

    // Pick a subhead (labelled "Exps. Sub Head") → auto-fill parent head (labelled "Expense Head (GL Code)")
    const handleSubheadSelect = (e) => {
        const sub = e.target.value;
        const match = allSubheads.find(x => x.subhead === sub);
        setOfficeExpenseForm(prev => ({
            ...prev,
            sub_head: sub,
            expenses_head: match ? match.head : '',
        }));
    };

    // ─── Paid Date limits: branch users restricted to office_expense_days (from DB) ──
    const getPaidDateLimits = () => {
        const today = new Date();
        const maxDate = today.toISOString().split('T')[0];
        if (isAdmin) {
            return { minDate: '', maxDate };
        }
        const days = branchLimits.office_expense_days || 30;
        const minD = new Date(today);
        minD.setDate(today.getDate() - days);
        const minDate = minD.toISOString().split('T')[0];
        return { minDate, maxDate };
    };
    const paidDateLimits = getPaidDateLimits();

    const fetchOeTempDrafts = async () => {
        setLoadingOeTemp(true);
        try {
            const { data } = await axios.get(`${API_BASE_URL}/office-expenses/temp/list`, {
                params: { branch_code: userBranch }
            });
            setOeTempDrafts(data);
            setOeTempSelected({});
        } catch {
            toast.error('Failed to load drafts');
        } finally {
            setLoadingOeTemp(false);
        }
    };

    const handleDeleteOeTemp = async (id) => {
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
            await axios.delete(`${API_BASE_URL}/office-expenses/temp/${id}`);
            toast.success('Draft deleted');
            fetchOeTempDrafts();
        } catch {
            toast.error('Failed to delete');
        }
    };

    const handleStartEditOeTemp = (draft) => {
        setOeTempEditingId(draft.id);
        // Recover the clean GL code from the sub head (stored value is "GL Code - Branch Name").
        const glMatch = allSubheads.find(x => x.subhead === draft.sub_head);
        setOeTempEditForm({
            paid_date: draft.paid_date ? draft.paid_date.split('T')[0] : '',
            expenses_head: glMatch ? glMatch.head : (draft.expenses_head || ''),
            sub_head: draft.sub_head || '',
            expenses_description: draft.expenses_description || '',
            internal_branch_name: draft.internal_branch_name || '',
            paid_to: draft.paid_to || '',
            invoice_no: draft.invoice_no || '',
            amount: draft.amount || '',
            remark: draft.remark || '',
            voucher_no: draft.voucher_no || '',
            paid_by: user?.name || draft.paid_by || '',
        });
    };

    // Edit-mode subhead select → auto-fill parent head (mirrors handleSubheadSelect)
    const handleEditSubheadSelect = (e) => {
        const sub = e.target.value;
        const match = allSubheads.find(x => x.subhead === sub);
        setOeTempEditForm(prev => ({
            ...prev,
            sub_head: sub,
            expenses_head: match ? match.head : '',
        }));
    };

    const handleSaveEditOeTemp = async () => {
        // All fields compulsory EXCEPT remark (same rule as Add form)
        if (!oeTempEditForm.paid_date || !oeTempEditForm.expenses_head ||
            !oeTempEditForm.sub_head || !oeTempEditForm.internal_branch_name ||
            !oeTempEditForm.paid_to || !oeTempEditForm.invoice_no ||
            !oeTempEditForm.amount || !oeTempEditForm.paid_by ||
            !oeTempEditForm.expenses_description) {
            toast.error('Please fill all required fields (only Remark is optional)');
            return;
        }
        try {
            // Same "GL Code - Branch Name" rule on edit. Derive GL code from sub head to avoid double-append.
            const glMatch = allSubheads.find(x => x.subhead === oeTempEditForm.sub_head);
            const glCode = glMatch ? glMatch.head : oeTempEditForm.expenses_head;
            await axios.put(`${API_BASE_URL}/office-expenses/temp/${oeTempEditingId}`, {
                ...oeTempEditForm,
                expenses_head: glCode ? `${glCode} - ${getBranchLabel(userBranch)}` : '',
                amount: parseFloat(oeTempEditForm.amount),
            });
            toast.success('Draft updated');
            setOeTempEditingId(null);
            setOeTempEditForm({});
            fetchOeTempDrafts();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to update');
        }
    };

    const handleSubmitOeTempToMain = async () => {
        if (!isAdmin && !isUploadAllowed()) {
            toast.error(getUploadRestrictionMessage());
            return;
        }
        const ids = Object.keys(oeTempSelected).filter(k => oeTempSelected[k]).map(Number);
        if (ids.length === 0) { toast.error('Select at least one draft'); return; }

        const confirmResult = await Swal.fire({
            title: `Submit ${ids.length} draft(s)?`,
            text: 'They will move out of drafts and into Expense Records. This cannot be undone.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2f3192',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Yes, submit',
            reverseButtons: true,
        });
        if (!confirmResult.isConfirmed) return;

        setSubmittingOeTemp(true);
        try {
            const { data } = await axios.post(`${API_BASE_URL}/office-expenses/temp/submit-to-main`, {
                temp_ids: ids,
                branch_code: userBranch,
            });
            toast.success(
                data.submit_voucher_no
                    ? `${data.moved_count} record(s) submitted · Voucher: ${data.submit_voucher_no}`
                    : `${data.moved_count} record(s) submitted`
            );
            fetchOeTempDrafts();
            fetchOfficeExpenses(true);  // refresh main table
        } catch {
            toast.error('Failed to submit');
        } finally {
            setSubmittingOeTemp(false);
        }
    };

    const openBranchImprestModal = async () => {
        setShowBranchImprestModal(true);
        setLoadingBranchImprest(true);
        try {
            const { data } = await axios.get(`${API_BASE_URL}/imprest/branch/${userBranch}`);
            setBranchImprestData({
                entries: data.entries || [],
                total: parseFloat(data.total) || 0,
                count: data.count || 0,
            });
        } catch (err) {
            toast.error('Failed to load imprest amount');
            setBranchImprestData({ entries: [], total: 0, count: 0 });
        } finally {
            setLoadingBranchImprest(false);
        }
    };

    /* ── Dual-scrollbar sync (OE) ── */
    useEffect(() => {
        const main = oeTableContainerRef.current;
        const top = oeTopScrollBarRef.current;
        const tbl = oeTableRef.current;
        if (!main || !top) return;

        if (tbl) {
            const phantom = top.firstChild;
            if (phantom) phantom.style.width = `${tbl.scrollWidth}px`;
        }

        const onMain = () => { top.scrollLeft = main.scrollLeft; };
        const onTop = () => { main.scrollLeft = top.scrollLeft; };

        main.addEventListener('scroll', onMain);
        top.addEventListener('scroll', onTop);

        return () => {
            main.removeEventListener('scroll', onMain);
            top.removeEventListener('scroll', onTop);
        };
    }, [officeExpenses, loadingOfficeExpenses]);

    // Load data on mount + whenever filters change (component only mounts on the Office tab)
    useEffect(() => {
        fetchOfficeExpenses(true);
        fetchExpenseHeads();
        fetchOeTempDrafts();
        setSelectedOEPeriod(null); // reset drill-in when filters change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [officeExpenseStartDate, officeExpenseEndDate, officeExpenseHead, officeExpenseSearch]);

    /* ═══════════════════════════════════════════════════════════════════════════
       JSX RENDER
    ═══════════════════════════════════════════════════════════════════════════ */
    return (
        <>
            <div className="space-y-3">
                {/* Form Section */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                        <div className="flex items-center gap-2">
                            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <h2 className="text-xs font-bold text-white tracking-wide">Add Office Expense</h2>
                        </div>
                        <button
                            onClick={openBranchImprestModal}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                            style={{ color: themeColor }}
                            title="View Imprest Amount for this branch"
                        >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Imprest
                        </button>
                    </div>

                    <form onSubmit={handleSubmitOfficeExpense} className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Expense Date *</label>
                                <input
                                    type="date"
                                    name="paid_date"
                                    value={officeExpenseForm.paid_date}
                                    onChange={handleOfficeExpenseInputChange}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:border-transparent text-black"
                                    style={{ '--tw-ring-color': themeColor }}
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    min={paidDateLimits.minDate}
                                    max={paidDateLimits.maxDate}
                                    required
                                />
                            </div>

                            {/* Exps. Sub Head — lists ALL subheads across every head */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Exps. Sub Head *</label>
                                <select
                                    name="sub_head"
                                    value={officeExpenseForm.sub_head}
                                    onChange={handleSubheadSelect}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    required
                                >
                                    <option value="">Select Expense Head</option>
                                    {allSubheads.map((s, idx) => (
                                        <option key={`${s.head}__${s.subhead}__${idx}`} value={s.subhead}>{s.subhead}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Expense Head (GL Code) — read-only, auto-filled from the chosen head's parent */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Expense Head (GL Code) *</label>
                                <input
                                    type="text"
                                    name="expenses_head"
                                    value={officeExpenseForm.expenses_head}
                                    readOnly
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                    placeholder="Auto-filled from Exps. Sub Head"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Internal Branch Name *</label>
                                <input
                                    type="text"
                                    name="internal_branch_name"
                                    value={officeExpenseForm.internal_branch_name}
                                    onChange={handleOfficeExpenseInputChange}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    placeholder="Enter internal branch name"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Paid To *</label>
                                <input
                                    type="text"
                                    name="paid_to"
                                    value={officeExpenseForm.paid_to}
                                    onChange={handleOfficeExpenseInputChange}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    placeholder="Enter payee name"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Invoice / SR No. / Ref. No. *</label>
                                <input
                                    type="text"
                                    name="invoice_no"
                                    value={officeExpenseForm.invoice_no}
                                    onChange={handleOfficeExpenseInputChange}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    placeholder="Reference number"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Amount (₹) *</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={officeExpenseForm.amount}
                                    onChange={handleOfficeExpenseInputChange}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    step="0.01"
                                    placeholder="0.00"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Voucher No. (Auto)</label>
                                <input
                                    type="text"
                                    name="voucher_no"
                                    value={officeExpenseForm.voucher_no}
                                    readOnly
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed font-mono"
                                    placeholder="Auto-assigned on submit"
                                    title="Auto-generated per branch per financial year. Cannot be edited."
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Paid By *</label>
                                <input
                                    type="text"
                                    name="paid_by"
                                    value={officeExpenseForm.paid_by}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                    readOnly
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Remark</label>
                                <input
                                    type="text"
                                    name="remark"
                                    value={officeExpenseForm.remark}
                                    onChange={handleOfficeExpenseInputChange}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    placeholder="Optional remark"
                                />
                            </div>

                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Expenses Description *</label>
                                <textarea
                                    name="expenses_description"
                                    value={officeExpenseForm.expenses_description}
                                    onChange={handleOfficeExpenseInputChange}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none text-black resize-none"
                                    onFocus={e => e.target.style.borderColor = themeColor}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    rows="2"
                                    placeholder="Detailed description of the expense..."
                                    required
                                />
                            </div>
                        </div>

                        <div className="mt-3 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setOfficeExpenseForm({
                                    paid_date: new Date().toISOString().split('T')[0],
                                    expenses_head: '', sub_head: '', expenses_description: '',
                                    description: '', internal_branch_name: '', paid_to: '', invoice_no: '', amount: '',
                                    remark: '', paid_by: user?.name || '', voucher_no: ''
                                })}
                                className="px-4 py-1.5 border border-gray-300 text-xs font-semibold text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                Clear
                            </button>
                            <button
                                type="submit"
                                disabled={submittingExpense}
                                className="px-5 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                            >
                                {submittingExpense ? (
                                    <>
                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        Save
                                    </>
                                )}
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
                                {oeTempDrafts.length}
                            </span>

                            {/* ✅ Total Amount + Date Range badges (only when drafts exist) */}
                            {oeTempDrafts.length > 0 && (() => {
                                const totalAmount = oeTempDrafts.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
                                const dates = oeTempDrafts
                                    .map(d => d.paid_date)
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
                            {canExport && oeTempDrafts.length > 0 && (
                                <button
                                    onClick={() => exportToExcel(
                                        oeTempDrafts,
                                        `oe_drafts_${userBranch}.xlsx`,
                                        [
                                            { key: 'paid_date', label: 'Date' },
                                            { key: 'sub_head', label: 'Exps. Sub Head' },
                                            { key: 'expenses_head', label: 'Expense Head (GL Code)' },
                                            { key: 'internal_branch_name', label: 'Internal Branch Name' },
                                            { key: 'paid_to', label: 'Paid To' },
                                            { key: 'invoice_no', label: 'Invoice / SR No. / Ref. No.' },
                                            { key: 'amount', label: 'Amount (₹)' },
                                            { key: 'voucher_no', label: 'Voucher No.' },
                                            { key: 'paid_by', label: 'Paid By' },
                                            { key: 'remark', label: 'Remark' },
                                            { key: 'expenses_description', label: 'Description' },
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
                                onClick={handleSubmitOeTempToMain}
                                disabled={submittingOeTemp || (!isAdmin && !isUploadAllowed()) || Object.values(oeTempSelected).filter(Boolean).length === 0}
                                className="px-3 py-1.5 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 flex items-center gap-1"
                                style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                                title={!isAdmin && !isUploadAllowed() ? getUploadRestrictionMessage() : ''}
                            >
                                {submittingOeTemp
                                    ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Submitting...</>
                                    : `Submit Selected (${Object.values(oeTempSelected).filter(Boolean).length})`}
                            </button>
                        </div>
                    </div>

                    {loadingOeTemp ? (
                        <div className="text-center py-12 text-xs text-gray-500">Loading drafts...</div>
                    ) : oeTempDrafts.length === 0 ? (
                        <div className="text-center py-12 text-xs text-gray-400">No drafts. Add via the form above.</div>
                    ) : (
                        <div className="overflow-x-auto" style={{ maxHeight: '320px' }}>
                            <table className="w-full border-collapse" style={{ minWidth: '1300px' }}>
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
                                                checked={oeTempDrafts.length > 0 && oeTempDrafts.every(d => oeTempSelected[d.id])}
                                                title="Select rows individually"
                                            />
                                        </th>
                                        {['Sr.No.', 'Date', 'Exps. Sub Head', 'Expense Head (GL Code)', 'Internal Branch Name', 'Invoice / SR No. / Ref. No.', 'Amount (₹)', 'Paid To', 'Voucher No.', 'Description', 'Remark', 'Paid By', 'Actions'].map((c, i) => (
                                            <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-b-2 border-r border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center">{c}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {[...oeTempDrafts].sort((a, b) => new Date(a.paid_date || 0) - new Date(b.paid_date || 0)).map((d, idx) => {
                                        const isEditing = oeTempEditingId === d.id;
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
                                                    <input type="checkbox" checked={!!oeTempSelected[d.id]} onChange={e => setOeTempSelected(prev => ({ ...prev, [d.id]: e.target.checked }))} />
                                                </td>
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input type="date" value={oeTempEditForm.paid_date} min={paidDateLimits.minDate} max={paidDateLimits.maxDate} onChange={e => setOeTempEditForm(p => ({ ...p, paid_date: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" required />
                                                        : (d.paid_date ? new Date(d.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-')}
                                                </td>
                                                {/* Exps. Sub Head = sub_head (dropdown → auto-fills GL Code) */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <select value={oeTempEditForm.sub_head} onChange={handleEditSubheadSelect} className="px-1 py-0.5 text-[10px] border rounded w-full bg-white" required>
                                                            <option value="">Select Expense Head</option>
                                                            {allSubheads.map((s, i) => (
                                                                <option key={`${s.head}__${s.subhead}__${i}`} value={s.subhead}>{s.subhead}</option>
                                                            ))}
                                                        </select>
                                                        : (d.sub_head || '-')}
                                                </td>
                                                {/* Expense Head (GL Code) = expenses_head (read-only, auto-filled) */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.expenses_head} readOnly className="px-1 py-0.5 text-[10px] border rounded w-full bg-gray-50 text-gray-500 cursor-not-allowed" placeholder="Auto" />
                                                        : (d.expenses_head || '-')}
                                                </td>
                                                {/* Internal Branch Name */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.internal_branch_name} onChange={e => setOeTempEditForm(p => ({ ...p, internal_branch_name: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                                                        : (d.internal_branch_name || '-')}
                                                </td>
                                                {/* Invoice / SR No. / Ref. No. */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.invoice_no} onChange={e => setOeTempEditForm(p => ({ ...p, invoice_no: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                                                        : (d.invoice_no || '-')}
                                                </td>
                                                {/* Amount */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-center whitespace-nowrap">
                                                    {isEditing
                                                        ? <input type="number" value={oeTempEditForm.amount} onChange={e => setOeTempEditForm(p => ({ ...p, amount: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                                                        : `₹${parseFloat(d.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                                                </td>
                                                {/* Paid To */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.paid_to} onChange={e => setOeTempEditForm(p => ({ ...p, paid_to: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                                                        : (d.paid_to || '-')}
                                                </td>
                                                {/* Voucher No. (cannot edit) */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.voucher_no || ''} readOnly className="px-1 py-0.5 text-[10px] border rounded w-full bg-gray-50 text-gray-500 cursor-not-allowed font-mono" title="Auto-assigned. Cannot be edited." />
                                                        : (d.voucher_no || '-')}
                                                </td>
                                                {/* Description */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.expenses_description || ''} onChange={e => setOeTempEditForm(p => ({ ...p, expenses_description: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                                                        : <div className="truncate max-w-[180px]" title={d.expenses_description || d.description || ''}>{d.expenses_description || d.description || '-'}</div>}
                                                </td>
                                                {/* Remark */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.remark} onChange={e => setOeTempEditForm(p => ({ ...p, remark: e.target.value }))} className="px-1 py-0.5 text-[10px] border rounded w-full" />
                                                        : (d.remark || '-')}
                                                </td>
                                                {/* Paid By (auto = logged-in user, read-only) */}
                                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                                    {isEditing
                                                        ? <input value={oeTempEditForm.paid_by || ''} readOnly className="px-1 py-0.5 text-[10px] border rounded w-full bg-gray-50 text-gray-500 cursor-not-allowed" />
                                                        : (d.paid_by || '-')}
                                                </td>
                                                <td className="px-2 py-0.5 text-center">
                                                    <div className="flex gap-1 justify-center">
                                                        {isEditing ? (
                                                            <>
                                                                <button onClick={handleSaveEditOeTemp} className="text-green-600 hover:text-green-800" title="Save">
                                                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                                </button>
                                                                <button onClick={() => { setOeTempEditingId(null); setOeTempEditForm({}); }} className="text-gray-500 hover:text-gray-700" title="Cancel">
                                                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => handleStartEditOeTemp(d)} className="text-blue-600 hover:text-blue-800" title="Edit">
                                                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                                </button>
                                                                {/* <button onClick={() => handleDeleteOeTemp(d.id)} className="text-red-600 hover:text-red-800" title="Delete">
                                                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                </button> */}
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

                {/* Table — Period summary by default, drill-in to detail when a row is clicked */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="px-4 py-2.5 border-b flex justify-between items-center" style={{ backgroundColor: themeLight }}>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xs font-bold text-black">
                                {selectedOEPeriod ? 'Period Details' : 'Expense Records (By Period)'}
                            </h2>

                            {!loadingOfficeExpenses && !selectedOEPeriod && oePeriodGroups.length > 0 && (
                                <>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                                        {oePeriodGroups.length} period{oePeriodGroups.length === 1 ? '' : 's'}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold whitespace-nowrap">
                                        Grand Total: ₹{filteredPeriodGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold whitespace-nowrap">
                                        Verified: ₹{filteredPeriodGroups.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-semibold whitespace-nowrap">
                                        Rule: {submitRule?.rule_type === 'weekdays' ? 'Weekly periods' : '15-day periods'}
                                    </span>
                                </>
                            )}

                            {selectedOEPeriod && (
                                <>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold whitespace-nowrap">
                                        {selectedOEPeriod.periodStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} → {selectedOEPeriod.periodEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold whitespace-nowrap">
                                        Submitted By: {selectedOEPeriod.submittedBy}
                                    </span>
                                    {(() => {
                                        const vouchers = Array.from(new Set(selectedOEPeriod.records.map(r => r.submit_voucher_no).filter(Boolean)));
                                        return vouchers.length > 0 ? (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap font-mono" style={{ backgroundColor: themeLight, color: themeColor }}>
                                                Voucher{vouchers.length > 1 ? 's' : ''}: {vouchers.join(', ')}
                                            </span>
                                        ) : null;
                                    })()}
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold whitespace-nowrap">
                                        Records: {selectedOEPeriod.records.length}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold whitespace-nowrap">
                                        Total: ₹{selectedOEPeriod.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold whitespace-nowrap">
                                        Verified: ₹{selectedOEPeriod.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedOEPeriod && (
                                <button
                                    onClick={() => setSelectedOEPeriod(null)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                                    style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                                >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    Back
                                </button>
                            )}
                            {selectedOEPeriod && (
                                <button
                                    onClick={() => printOfficeExpenseReport(selectedOEPeriod)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                                    style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                                    title="Print this period's Office Expense report"
                                >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    Print
                                </button>
                            )}
                            {canExport && officeExpenses.length > 0 && (
                                <button
                                    onClick={() => exportToExcel(
                                        selectedOEPeriod ? filteredDetailRecords : officeExpenses,
                                        `office_expenses_${userBranch}.xlsx`,
                                        [
                                            { key: 'paid_date', label: 'Date' },
                                            { key: 'sub_head', label: 'Exps. Sub Head' },
                                            { key: 'expenses_head', label: 'Expense Head (GL Code)' },
                                            { key: 'internal_branch_name', label: 'Internal Branch Name' },
                                            { key: 'paid_to', label: 'Paid To' },
                                            { key: 'invoice_no', label: 'Invoice / SR No. / Ref. No.' },
                                            { key: 'amount', label: 'Amount (₹)' },
                                            { key: 'voucher_no', label: 'Voucher No.' },
                                            { key: 'paid_by', label: 'Paid By' },
                                            { key: 'remark', label: 'Remark' },
                                            { key: 'expenses_description', label: 'Description' },
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
                                onClick={() => setShowOEHistoryModal(true)}
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

                    {loadingOfficeExpenses && officeExpenses.length === 0 ? (
                        <div className="text-center py-16">
                            <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <p className="text-xs text-gray-500">Loading expenses...</p>
                        </div>
                    ) : officeExpenses.length === 0 ? (
                        <div className="text-center py-16">
                            <svg className="h-12 w-12 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-xs text-gray-500 font-medium">No expenses found</p>
                            <p className="text-[11px] text-gray-400 mt-1">Add your first expense using the form above</p>
                        </div>
                    ) : selectedOEPeriod ? (
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
                                        placeholder="Search paid to, invoice, voucher, description..."
                                        value={oeDetailSearch}
                                        onChange={(e) => setOeDetailSearch(e.target.value)}
                                        className="w-full pl-6 pr-6 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-black"
                                    />
                                    {oeDetailSearch && (
                                        <button onClick={() => setOeDetailSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </div>

                                <select
                                    value={oeDetailHead}
                                    onChange={(e) => setOeDetailHead(e.target.value)}
                                    className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                >
                                    <option value="">All Expense Codes</option>
                                    {Array.from(new Set(selectedOEPeriod.records.map(r => r.expenses_head).filter(Boolean)))
                                        .sort()
                                        .map(h => <option key={h} value={h}>{h}</option>)}
                                </select>

                                <label
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer transition-all ${oeDetailVerifiedOnly
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                                        }`}
                                    title="Show only verified records"
                                >
                                    <input
                                        type="checkbox"
                                        checked={oeDetailVerifiedOnly}
                                        onChange={(e) => setOeDetailVerifiedOnly(e.target.checked)}
                                        className="hidden"
                                    />
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Verified Only
                                </label>

                                {(oeDetailSearch || oeDetailHead || oeDetailVerifiedOnly) && (
                                    <button
                                        onClick={() => { setOeDetailSearch(''); setOeDetailHead(''); setOeDetailVerifiedOnly(false); }}
                                        className="px-2 py-1 text-[10px] text-red-600 border border-red-300 rounded-lg hover:bg-red-50 whitespace-nowrap"
                                    >
                                        Clear
                                    </button>
                                )}

                                <span className="ml-auto text-[10px] text-gray-600">
                                    Showing <strong>{filteredDetailRecords.length}</strong> of <strong>{selectedOEPeriod.records.length}</strong> · Total{' '}
                                    <strong className="text-blue-700">₹{filteredDetailTotals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> · Verified{' '}
                                    <strong className="text-emerald-700">₹{filteredDetailTotals.verified.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                                </span>
                            </div>

                            <div className="overflow-x-auto" style={{ maxHeight: '480px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}>
                                <table className="w-full border-collapse" style={{ minWidth: '1000px' }}>
                                    <thead className="sticky top-0 z-10">
                                        <tr style={{ backgroundColor: '#f0f1ff' }}>
                                            {[
                                                { label: 'Sr.No.', w: '45px' },
                                                { label: 'Date', w: '90px' },
                                                { label: 'Exps. Sub Head', w: '130px' },
                                                { label: 'Expense Head (GL Code)', w: '110px' },
                                                { label: 'Internal Branch Name', w: '130px' },
                                                { label: 'Invoice / SR No. / Ref. No.', w: '110px' },
                                                { label: 'Amount (₹)', w: '100px' },
                                                { label: 'Paid To', w: '130px' },
                                                { label: 'Voucher No.', w: '100px' },
                                                { label: 'Description', w: '180px' },
                                                { label: 'Remark', w: '130px' },
                                                { label: 'Paid By', w: '110px' },
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
                                        {filteredDetailRecords.length === 0 ? (
                                            <tr>
                                                <td colSpan={12} className="text-center py-10 text-xs text-gray-400">
                                                    No records match your filters in this period.{' '}
                                                    <button
                                                        onClick={() => { setOeDetailSearch(''); setOeDetailHead(''); setOeDetailVerifiedOnly(false); }}
                                                        className="text-blue-600 hover:underline font-semibold"
                                                    >
                                                        Clear filters
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : filteredDetailRecords.map((expense, idx) => (
                                            <tr key={expense.id} className="hover:bg-blue-50/40 transition-colors" style={{ height: '34px' }}>
                                                <td className="px-2 py-1 text-[11px] text-black text-center font-medium border-r border-gray-100">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span>{idx + 1}</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); printOfficeExpenseVoucher(expense); }}
                                                            className="text-purple-600 hover:text-purple-800"
                                                            title="Print voucher for this record"
                                                        >
                                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100 whitespace-nowrap">
                                                    {expense.paid_date ? new Date(expense.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                                </td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.sub_head || ''}>{expense.sub_head || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.expenses_head || ''}>{expense.expenses_head || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.internal_branch_name || ''}>{expense.internal_branch_name || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.invoice_no || ''}>{expense.invoice_no || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] font-bold text-black text-center border-r border-gray-100 whitespace-nowrap">
                                                    ₹{parseFloat(expense.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.paid_to || ''}>{expense.paid_to || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.voucher_no || ''}>{expense.voucher_no || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.expenses_description || expense.description || ''}>{expense.expenses_description || expense.description || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.remark || ''}>{expense.remark || '-'}</div></td>
                                                <td className="px-2 py-1 text-[11px] text-black text-center border-r border-gray-100"><div className="truncate" title={expense.paid_by || ''}>{expense.paid_by || '-'}</div></td>
                                                <td className="px-2 py-1 text-center">
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${expense.verification_status === 'Verified' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                        {expense.verification_status || 'Pending'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="sticky bottom-0">
                                        <tr style={{ backgroundColor: '#f0f1ff' }}>
                                            <td colSpan={6} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                                                {(oeDetailSearch || oeDetailHead || oeDetailVerifiedOnly) ? 'Filtered Total' : 'Period Total'}
                                            </td>
                                            <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>
                                                ₹{filteredDetailTotals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td colSpan={6} className="border-t-2 border-gray-200" />
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
                                    {oePeriodGroups.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-10 text-xs text-gray-400">
                                                No periods yet.
                                            </td>
                                        </tr>
                                    ) : oePeriodGroups.map((g, idx) => {
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
                                                        onClick={(e) => { e.stopPropagation(); setSelectedOEPeriod(g); }}
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
                                            Grand Total ({filteredPeriodGroups.length} period{filteredPeriodGroups.length === 1 ? '' : 's'})
                                        </td>
                                        <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">
                                            {filteredPeriodGroups.reduce((s, g) => s + g.records.length, 0)}
                                        </td>
                                        <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-blue-700 whitespace-nowrap">
                                            ₹{filteredPeriodGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">
                                            ₹{filteredPeriodGroups.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {officeExpenseHasMore && !loadingOfficeExpenses && officeExpenses.length > 0 && !selectedOEPeriod && (
                        <div className="text-center py-3 border-t bg-gray-50">
                            <button
                                onClick={() => fetchOfficeExpenses(false)}
                                disabled={officeExpenseLoadingMore}
                                className="px-5 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 mx-auto"
                                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                            >
                                {officeExpenseLoadingMore ? (
                                    <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Loading...</>
                                ) : 'Load More'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Office Expense History — delegated to BranchOEHistory */}
            {showOEHistoryModal && (
                <BranchOEHistory
                    branchCode={userBranch}
                    branchName={getBranchLabel(userBranch)}
                    themeColor={themeColor}
                    canExport={canExport}
                    onClose={() => setShowOEHistoryModal(false)}
                />
            )}

            {/* ─── Branch Imprest Amount Modal (read-only) ─────────────────────── */}
            {showBranchImprestModal && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

                        {/* Header */}
                        <div className="px-5 py-3 flex justify-between items-center shrink-0" style={{ background: themeColor }}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h2 className="text-sm font-semibold text-white">
                                    Imprest Amount — {getBranchLabel(userBranch)}
                                </h2>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                                    {userBranch}
                                </span>
                            </div>
                            <button
                                onClick={() => setShowBranchImprestModal(false)}
                                className="w-7 h-7 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                            >
                                <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>
                            {loadingBranchImprest ? (
                                <div className="text-center py-10">
                                    <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <p className="text-xs text-gray-500">Loading imprest data...</p>
                                </div>
                            ) : branchImprestData.entries.length === 0 ? (
                                <div className="text-center py-10">
                                    <svg className="h-12 w-12 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm text-gray-500 font-medium">No imprest amount configured</p>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Please contact HO to set up imprest amounts for your branch.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Summary card */}
                                    <div className="border rounded-lg overflow-hidden mb-4" style={{ borderColor: '#E5E7EB' }}>
                                        <div className="px-3 py-2.5" style={{ backgroundColor: themeLight }}>
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-[11px] font-semibold text-black">Total Imprest Amount</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                                        {branchImprestData.count} {branchImprestData.count === 1 ? 'entry' : 'entries'}
                                                    </p>
                                                </div>
                                                <span className="text-base font-bold" style={{ color: themeColor }}>
                                                    ₹{branchImprestData.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Entries table */}
                                    <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                                        <table className="w-full border-collapse">
                                            <thead>
                                                <tr style={{ backgroundColor: themeLight }}>
                                                    <th className="px-3 py-2 text-[10px] font-bold text-black uppercase tracking-wide text-left border-b" style={{ borderColor: '#E5E7EB', width: '50px' }}>
                                                        Sr.No.
                                                    </th>
                                                    <th className="px-3 py-2 text-[10px] font-bold text-black uppercase tracking-wide text-left border-b" style={{ borderColor: '#E5E7EB' }}>
                                                        Name
                                                    </th>
                                                    <th className="px-3 py-2 text-[10px] font-bold text-black uppercase tracking-wide text-right border-b" style={{ borderColor: '#E5E7EB', width: '140px' }}>
                                                        Amount (₹)
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {branchImprestData.entries.map((entry, idx) => (
                                                    <tr key={entry.id || idx} className="hover:bg-gray-50 border-b last:border-b-0" style={{ borderColor: '#E5E7EB' }}>
                                                        <td className="px-3 py-2 text-[11px] text-gray-700">{idx + 1}</td>
                                                        <td className="px-3 py-2 text-[11px] text-gray-800 font-medium">{entry.name || '-'}</td>
                                                        <td className="px-3 py-2 text-[11px] text-right font-semibold text-gray-800">
                                                            ₹{parseFloat(entry.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ backgroundColor: themeLight }}>
                                                    <td colSpan="2" className="px-3 py-2 text-[11px] font-bold text-right text-black border-t-2" style={{ borderColor: themeColor }}>
                                                        Total
                                                    </td>
                                                    <td className="px-3 py-2 text-[11px] font-bold text-right border-t-2" style={{ borderColor: themeColor, color: themeColor }}>
                                                        ₹{branchImprestData.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
                            {canExport && branchImprestData.entries.length > 0 && (
                                <button
                                    onClick={() => exportToExcel(
                                        branchImprestData.entries,
                                        `imprest_${userBranch}.xlsx`,
                                        [
                                            { key: 'name', label: 'Name' },
                                            { key: 'amount', label: 'Amount (₹)' },
                                        ]
                                    )}
                                    className="px-4 py-1.5 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                >
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                    </svg>
                                    Export
                                </button>
                            )}
                            <button
                                onClick={openBranchImprestModal}
                                disabled={loadingBranchImprest}
                                className="px-4 py-1.5 border border-gray-300 text-xs font-semibold text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Refresh
                            </button>
                            <button
                                onClick={() => setShowBranchImprestModal(false)}
                                className="px-5 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm"
                                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BranchOE;