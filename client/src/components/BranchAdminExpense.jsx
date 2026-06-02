import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { useInView } from 'react-intersection-observer';
import Swal from 'sweetalert2';
import BranchTADAHistory from './BranchTADAHistory';
import BranchOEHistory from './BranchOEhistory';
import BranchOE from './BranchOE';
import BranchLVB from './BranchLVB';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

/* ─── Debounce hook ─────────────────────────────────────────────────────────── */
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
};

/* ─── Blue-theme highlight for search matches ───────────────────────────────── */
const Highlight = ({ text, query }) => {
  const str = text !== null && text !== undefined ? String(text) : '';
  if (!query || !str) return <>{str || '-'}</>;
  const q = query.trim();
  if (!q) return <>{str}</>;
  const idx = str.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{str}</>;
  return (
    <>
      {str.slice(0, idx)}
      <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', borderRadius: '3px', padding: '0 2px', fontWeight: 700 }}>
        {str.slice(idx, idx + q.length)}
      </span>
      {str.slice(idx + q.length)}
    </>
  );
};

/* ─── Excel-style Column Filter Dropdown ────────────────────────────────────── */
const ColumnFilterDropdown = ({ x, y, options, initialSelected, onApply, onClose, themeColor }) => {
  const [selected, setSelected] = React.useState(new Set(initialSelected));
  const [search, setSearch] = React.useState('');

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const toggle = (val) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(filtered));
  const clearAll = () => setSelected(new Set());

  // Auto-adjust position if dropdown would overflow screen
  const adjustedX = Math.min(x, window.innerWidth - 230);
  const adjustedY = Math.min(y, window.innerHeight - 340);

  return (
    <div
      className="bg-white border border-gray-300 rounded-lg shadow-2xl"
      style={{
        position: 'fixed',
        top: `${adjustedY}px`,
        left: `${adjustedX}px`,
        zIndex: 9999,
        width: '220px',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b" style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">Filter Task Status</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 text-black"
          autoFocus
        />
        <div className="flex gap-3 mt-1.5">
          <button onClick={selectAll} className="text-[10px] font-semibold text-blue-600 hover:underline">Select All</button>
          <button onClick={clearAll} className="text-[10px] font-semibold text-red-600 hover:underline">Clear</button>
        </div>
      </div>

      {/* Options */}
      <div className="overflow-y-auto py-1" style={{ maxHeight: '180px', scrollbarWidth: 'thin' }}>
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-[10px] text-gray-400 italic text-center">
            {options.length === 0 ? 'No values available' : 'No matches'}
          </div>
        ) : filtered.map(opt => (
          <label key={opt} className="flex items-center gap-2 px-3 py-1 hover:bg-blue-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(opt)}
              onChange={() => toggle(opt)}
              className="cursor-pointer"
            />
            <span className="text-[11px] text-gray-800 truncate" title={opt}>{opt}</span>
          </label>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t bg-gray-50 flex justify-end gap-1.5">
        <button
          onClick={onClose}
          className="px-2.5 py-1 text-[10px] font-semibold border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          onClick={() => onApply(selected)}
          className="px-3 py-1 text-[10px] font-bold text-white rounded shadow-sm"
          style={{ background: `linear-gradient(135deg, ${themeColor}, #335478)` }}
        >
          Apply{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>
    </div>
  );
};

const ALL_COLUMNS = [
  { key: 'select', label: '', width: 36 },
  { key: 'sr_no', label: 'Sr. No.', width: 30 },
  { key: 'appointment_number', label: 'Appointment No.', width: 95 },
  { key: 'sd_branch_name', label: 'SD Branch Name', width: 90 },
  { key: 'sd_branch_code', label: 'SD Branch Code', width: 85 },
  { key: 'installation_site_address', label: 'Installation Site Address', width: 120 },
  { key: 'instance_id', label: 'Instance ID', width: 85 },
  { key: 'engine_application_code', label: 'Engine App. Code', width: 90 },
  { key: 'engine_serial_number', label: 'Engine Serial No.', width: 95 },
  { key: 'account', label: 'Account', width: 130 },
  { key: 'account_id', label: 'Account ID', width: 80 },
  { key: 'service_request_no', label: 'Service Request No.', width: 80 },
  { key: 'sr_type', label: 'SR Type', width: 70 },
  { key: 'sr_sub_type', label: 'SR Sub Type', width: 60 },
  { key: 'sr_due_date', label: 'SR Due Date', width: 80 },
  { key: 'task_start_date', label: 'Task Start Date', width: 85 },
  { key: 'task_end_date', label: 'Task End Date', width: 85 },
  { key: 'task_status', label: 'Task Status', width: 75 },
  { key: 'task_assigned_datetime', label: 'Task Assigned Date & Time', width: 105 },
  { key: 'task_assign_vs_trip_start', label: 'Task Assign vs Trip Start', width: 100 },
  { key: 'sr_trip_start_datetime', label: 'SR Trip Start Date & Time', width: 105 },
  { key: 'sr_reach_at_site_datetime', label: 'SR Reach at Site Date & Time', width: 110 },
  { key: 'sr_trip_start_lat_long', label: 'SR Trip Start Lat Long', width: 120 },
  { key: 'sr_reach_at_site_lat_long', label: 'SR Reach at Site Lat Long', width: 125 },
  { key: 'kms_travelled', label: 'KMs Travelled', width: 62 },
  { key: 'sr_closed_date', label: 'SR Closed Date', width: 85 },
  { key: 'sr_status', label: 'SR Status', width: 75 },
  { key: 'asset_primary_contact_no', label: 'Asset Primary Contact', width: 100 },
  { key: 'voc', label: 'VOC', width: 130 },
  { key: 'service_engineer_name', label: 'Service Engineer Name', width: 105 },
  { key: 'service_engineer_uid', label: 'Service Engineer UID', width: 95 },
  { key: 'employee_id', label: 'Employee ID', width: 90 },
  { key: 'customer_name', label: 'Customer Name', width: 110 },
  { key: 'customer_contact_number', label: 'Customer Contact', width: 95 },
  { key: 'customer_remark', label: 'Customer Remark', width: 130 },
  { key: 'problem_summary', label: 'Problem Summary', width: 130 },
  { key: 'nature_of_failure', label: 'Nature of Failure', width: 105 },
  { key: 'action_taken', label: 'Action Taken', width: 130 },
  { key: 'engineer_remark', label: 'Engineer Remark', width: 130 },
  { key: 'exception_remark', label: 'Exception Remark', width: 130 },
  { key: 'otp_remark', label: 'OTP Remark', width: 95 },
  { key: 'pdf_generated', label: 'PDF Generated', width: 85 },
  { key: 'two_way_km', label: 'Two Way KM', width: 60 },
  { key: 'branch_verified_km', label: 'Branch Verified KM', width: 85 },
  { key: 'km_verification_remark', label: 'Branch Verification Remark', width: 117 },
  { key: 'km_rate', label: 'KM Rate', width: 70 },
  { key: 'da_amount', label: 'DA Amount', width: 62 },
  { key: 'freight_charges', label: 'Freight Charges', width: 80 },
  { key: 'total_amount', label: 'Total Amount', width: 85 },
  { key: 'actions', label: 'Actions', width: 60 },
];

const DEFAULT_COL_ORDER = ALL_COLUMNS.map(c => c.key);
const COL_MAP = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c]));

// Keys that get search highlighting
const SEARCHABLE_KEYS = new Set([
  'appointment_number', 'sd_branch_name', 'sd_branch_code', 'instance_id',
  'engine_serial_number', 'account', 'service_request_no', 'service_engineer_name',
  'service_engineer_uid', 'employee_id', 'customer_name', 'customer_contact_number', 'uploaded_by',
  'account_id', 'voc',
]);

/* ─── Branch map ────────────────────────────────────────────────────────────── */
const BRANCH_MAP = {
  HO: 'Pune Office', '420435_1': 'Ch.Sambhaji Nagar', '420435_2': 'Ahilyanagar',
  '420435_3': 'Beed', '420435_4': 'Nanded', '420435_5': 'Babhaleshwar',
  '420435_6': 'Latur', '420435_7': 'Parbhani', '420435_8': 'Hubli',
  '420435_9': 'Belagavi', '420435_10': 'Hospet', '420435_11': 'Ballari',
  '420435_12': 'Bagalkot', '420435_13': 'Gulbarga', '420435_14': 'Bijapur',
};

const BATCH_SIZE = 100;

// ─────────────────────────────────────────────────────────────
// Manual Entry Modal — kept outside parent for fast typing
// ─────────────────────────────────────────────────────────────
const ManualEntryModalComponent = ({ show, onClose, onSubmit, submitting, userBranch, themeColor, themeDark, initialForm, userName, tadaDays = 30, existingRecords = [], onSalesBmSaved, onBillWiseSaved }) => {
  const [activeTab, setActiveTab] = React.useState('manual');

  // ── SR Number autocomplete state ─────────────────────────────────────
  const [srSuggestions, setSrSuggestions] = React.useState([]);
  const [showSrDropdown, setShowSrDropdown] = React.useState(false);

  // ── Manual entry mode + picked-SR banner info ────────────────────────
  const [manualMode, setManualMode] = React.useState('sr'); // 'sr' | 'no_sr'
  const [pickedSr, setPickedSr] = React.useState(null);      // { service_request_no, appointment_number } | null
  const srInputRef = React.useRef(null);                     // anchor for the fixed-position dropdown

  // ── Branch engineers from BranchEmployee table ───────────────────────────
  const [branchEngineerList, setBranchEngineerList] = React.useState([]);

  React.useEffect(() => {
    if (!show || !userBranch) return;
    // In ManualEntryModalComponent, inside fetchEngineers:
    const fetchEngineers = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/expense/branch-employees`, {
          params: { branch_code: userBranch }
        });
        setBranchEngineerList(res.data || []);
      } catch (err) {
        console.error('Failed to fetch branch engineers:', err);
      }
    };
    fetchEngineers();
  }, [show, userBranch]);

  // DB-column → form-key mapping (EXCLUDES Service Engineer Name & UID by design)
  const RECORD_TO_FORM_MAP = {
    appointment_number: 'Appointment Number',
    installation_site_address: 'Installation Site Address',
    account: 'Account',
    account_id: 'Account ID',
    sd_branch_name: 'SD Branch Name',
    sd_branch_code: 'SD Branch Code',
    instance_id: 'Instance ID',
    engine_application_code: 'Engine Application Code',
    engine_serial_number: 'Engine Serial Number',
    sr_type: 'SR Type',
    sr_sub_type: 'SR Sub Type',
    sr_due_date: 'SR Due date',
    task_start_date: 'Task Start Date',
    task_end_date: 'Task End Date',
    task_status: 'Task Status',
    task_assigned_datetime: 'Task Assigned Date & Time',
    task_assign_vs_trip_start: 'Task Assign v.s Trip Start',
    sr_trip_start_datetime: 'SR Trip Start Date & Time',
    sr_reach_at_site_datetime: 'SR Reach at Site Date & Time',
    sr_trip_start_lat_long: 'SR Trip Start Lat Long',
    sr_reach_at_site_lat_long: 'SR Reach at site Lat long',
    kms_travelled: 'KMs Travelled',
    sr_closed_date: 'SR Closed Date',
    sr_status: 'SR Status',
    asset_primary_contact_no: 'Asset Primary Contact No.',
    voc: 'VOC',
    customer_name: 'Customer Name',
    customer_contact_number: 'Customer contact number',
    customer_remark: 'Customer Remark',
    problem_summary: 'Problem Summary',
    nature_of_failure: 'Nature of Failure',
    action_taken: 'Action Taken',
    engineer_remark: 'Engineer Remark',
    exception_remark: 'Exception Remark',
    otp_remark: 'OTP Remark',
    pdf_generated: 'PDF Generated',
    // NOTE: service_engineer_name & service_engineer_uid are intentionally NOT mapped
  };

  // Type in SR No. → filter records in same branch with engineer assigned
  const handleSrNumberChange = (value) => {
    setForm(prev => ({ ...prev, 'Service Request No.': value }));

    const q = String(value || '').trim().toLowerCase();
    if (q.length < 2) {
      setSrSuggestions([]);
      setShowSrDropdown(false);
      return;
    }

    const matches = (existingRecords || []).filter(r => {
      const sr = String(r.service_request_no || '').toLowerCase();
      const branch = String(r.branch_code || r.sd_branch_code || '').trim();
      const engName = String(r.service_engineer_name || '').trim();
      return sr.includes(q) && branch === userBranch && engName !== '';
    });

    // Deduplicate by (SR No. + Engineer UID) — one row per SR/engineer combo
    const seen = new Set();
    const unique = [];
    for (const r of matches) {
      const k = `${r.service_request_no}__${r.service_engineer_uid || ''}`;
      if (!seen.has(k)) { seen.add(k); unique.push(r); }
      if (unique.length >= 10) break;
    }

    setSrSuggestions(unique);
    setShowSrDropdown(unique.length > 0);
  };

  // Click an engineer suggestion → autofill everything EXCEPT SE Name & UID
  const handlePickSrRecord = (record) => {
    setForm(prev => {
      const next = { ...prev };
      Object.entries(RECORD_TO_FORM_MAP).forEach(([recKey, formKey]) => {
        const val = record[recKey];
        if (val === null || val === undefined || String(val).trim() === '') return;

        if (formKey === 'SR Due date' || formKey === 'SR Closed Date') {
          const d = new Date(val);
          next[formKey] = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(val);
        } else {
          next[formKey] = String(val);
        }
      });
      next['Service Request No.'] = String(record.service_request_no || '');
      // Auto-fill engineer UID from the existing SR record (locked, non-editable)
      next['Service Engineer UID'] = String(record.service_engineer_uid || '');
      // Look up employee_id for this UID from branchEngineerList
      const matchedEng = branchEngineerList.find(
        en => en.employee_uid === String(record.service_engineer_uid || '').trim()
      );
      next['Employee ID'] = matchedEng ? (matchedEng.employee_id || '') : '';
      // Clear name so user must pick from dropdown
      next['Service Engineer Name'] = '';
      return next;
    });
    setShowSrDropdown(false);
    setSrSuggestions([]);
    setPickedSr({
      service_request_no: record.service_request_no || '',
      appointment_number: record.appointment_number || '',
      service_engineer_name: record.service_engineer_name || '',
      service_engineer_uid: record.service_engineer_uid || '',
    });
    toast.success(`Auto-filled from SR ${record.service_request_no}. Please select Service Engineer Name.`);
  };

  // TADA date range based on branch rule
  const tadaDateRange = React.useMemo(() => {
    const today = new Date();
    const max = today.toISOString().split('T')[0];
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - (Number(tadaDays) || 30));
    const min = minDate.toISOString().split('T')[0];
    return { min, max };
  }, [tadaDays]); // 'manual' | 'sales' | 'km_wise' | 'bill_wise'
  const [form, setForm] = React.useState(initialForm);

  // ── Sales & BM TADA tab state ─────────────────────────────────────
  const SALES_BM_INITIAL = {
    date: new Date().toISOString().slice(0, 10),
    sr_invoice_engine_no: '',
    customer_name: '',
    location: '',
    one_way_km: '',
    work_description: '',
    remark: '',
    engineer_name: '',
    engineer_uid: '',
    employee_id: '',
    labour_sale_expected: '',
    part_sale_expected: '',
  };
  const [salesBmForm, setSalesBmForm] = React.useState(SALES_BM_INITIAL);
  const [salesBmAutoCalc, setSalesBmAutoCalc] = React.useState({
    two_way_km: '0', rate: '0', da: '0', amount: '0', total_amount: '0',
  });
  const [submittingSalesBm, setSubmittingSalesBm] = React.useState(false);

  const WORK_DESC_OPTIONS = [
    'AMC', 'Battery', 'Coolant', 'RECD', 'DFK', 'MLT',
    'New Life Engine', 'Oil Service Enquiry', 'DEF', 'Allied Oil', 'KRM', 'Other'
  ];

  // ── Bill Wise tab state (two sub-tabs: Service Engineer / Branch Manager) ──
  const BILL_WISE_EXPENSE_HEAD_OPTIONS = [
    'Lodging Charges Exps', 'Food Expenses', 'Petrol/Diesel Expenses',
    'Printing & Stationery', 'Staff Welfare Exps', 'Training Exps - Food',
    'Training Exps Lodging', 'Travelling & Conveyance Exps', 'Other Exps',
  ];
  const BILL_WISE_BM_WORK_DESC_OPTIONS = [
    'AMC', 'Battery', 'Coolant', 'RECD', 'DFK', 'MLT', 'New Life Engine',
    'Oil Service Enquiry', 'DEF', 'Allied Oil', 'KRM', 'Other',
  ];
  const BILL_WISE_BM_WORK_STATUS_OPTIONS = ['Pending', 'Completed'];

  const BW_SE_HEADER_INITIAL = {
    engineer_name: '', employee_id: '', service_engineer_uid: '',
    work_description: '', service_request_no: '', appointment_number: '',
    account: '', installation_site_address: '', sr_type: '',
    task_status: '', kms_travelled: '', task_start_date: '', task_end_date: '',
  };
  const BW_BM_HEADER_INITIAL = {
    customer_name: '', sr_invoice_engine_no: '', installation_site_address: '', work_description: '', remark: '', work_status: '',
  };
  const BW_NEW_BILL = () => ({
    date: new Date().toISOString().slice(0, 10),
    expenses_head: '', amount: '', bill_submitted: '',
  });

  const [billWiseSubTab, setBillWiseSubTab] = React.useState('se'); // 'se' | 'bm'
  const [bwSeHeader, setBwSeHeader] = React.useState(BW_SE_HEADER_INITIAL);
  const [bwBmHeader, setBwBmHeader] = React.useState(BW_BM_HEADER_INITIAL);
  const [bwSeBillDraft, setBwSeBillDraft] = React.useState(BW_NEW_BILL());
  const [bwBmBillDraft, setBwBmBillDraft] = React.useState(BW_NEW_BILL());
  const [bwSeBills, setBwSeBills] = React.useState([]); // added bill line items
  const [bwBmBills, setBwBmBills] = React.useState([]);
  const [submittingBillWise, setSubmittingBillWise] = React.useState(false);

  // Reset everything when modal opens + fetch initial branch rate & DA
  React.useEffect(() => {
    if (!show) return;

    setForm({ ...initialForm, 'SD Branch Code': userBranch || '' });
    setSalesBmForm(SALES_BM_INITIAL);
    setBillWiseSubTab('se');
    setBwSeHeader(BW_SE_HEADER_INITIAL);
    setBwBmHeader(BW_BM_HEADER_INITIAL);
    setBwSeBillDraft(BW_NEW_BILL());
    setBwBmBillDraft(BW_NEW_BILL());
    setBwSeBills([]);
    setBwBmBills([]);
    setActiveTab('manual');
    setManualMode('sr');
    setPickedSr(null);
    setSalesBmAutoCalc({ two_way_km: '0', rate: '0', da: '0', amount: '0', total_amount: '0' });

    if (!userBranch) return;

    // Fetch initial rate for Sales & BM TADA
    const fetchInitialRates = async () => {
      try {
        const res = await axios.post(`${API_BASE_URL}/tada-salesbm/calculate`, {
          branch_code: userBranch,
          one_way_km: '0',
        });
        setSalesBmAutoCalc({
          two_way_km: String(res.data?.two_way_km ?? '0'),
          rate: String(res.data?.rate ?? '0'),
          da: String(res.data?.da ?? '0'),
          amount: String(res.data?.amount ?? '0'),
          total_amount: String(res.data?.total_amount ?? '0'),
        });
      } catch (err) {
        console.error('[TADA] Failed to fetch Sales BM initial rate:', err?.response?.data || err.message);
      }
    };

    fetchInitialRates();
  }, [show, userBranch, initialForm]);

  // Bill Wise SE — SR No. autocomplete state (same UX as "Use Service Request No.")
  const [bwSeSrSuggestions, setBwSeSrSuggestions] = React.useState([]);
  const [bwSeShowSrDropdown, setBwSeShowSrDropdown] = React.useState(false);
  const bwSeSrInputRef = React.useRef(null);

  // SE: Service Request No. dropdown → auto-fill SR-linked fields
  // (Moved above the early return so hook order stays stable.)
  const bwSrOptions = React.useMemo(() => {
    const seen = new Set();
    const out = [];
    (existingRecords || []).forEach(r => {
      const sr = String(r.service_request_no || '').trim();
      const branch = String(r.branch_code || r.sd_branch_code || '').trim();
      if (!sr || branch !== userBranch) return;
      if (seen.has(sr)) return;
      seen.add(sr);
      out.push(r);
    });
    return out;
  }, [existingRecords, userBranch]);

  if (!show) return null;

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  // ─────────── SALES & BM TADA handlers ───────────
  const recalcSalesBm = async (oneWayKm) => {
    if (!oneWayKm || isNaN(parseFloat(oneWayKm))) {
      setSalesBmAutoCalc({ two_way_km: '0', rate: '0', da: '0', amount: '0', total_amount: '0' });
      return;
    }
    try {
      const res = await axios.post(`${API_BASE_URL}/tada-salesbm/calculate`, {
        branch_code: userBranch,
        one_way_km: String(oneWayKm),
      });
      setSalesBmAutoCalc({
        two_way_km: String(res.data?.two_way_km ?? '0'),
        rate: String(res.data?.rate ?? '0'),
        da: String(res.data?.da ?? '0'),
        amount: String(res.data?.amount ?? '0'),
        total_amount: String(res.data?.total_amount ?? '0'),
      });
    } catch (err) {
      console.error('Sales BM calc error:', err);
    }
  };

  const handleSalesBmFieldChange = (field, value) => {
    setSalesBmForm(prev => ({ ...prev, [field]: value }));
    if (field === 'one_way_km') recalcSalesBm(value);
    // Auto-fill engineer UID and employee_id when engineer is selected
    if (field === 'engineer_name') {
      const eng = branchEngineerList.find(e => e.employee_name === value);
      if (eng) {
        setSalesBmForm(prev => ({
          ...prev,
          engineer_name: value,
          engineer_uid: eng.employee_uid || '',
          employee_id: eng.employee_id || '',
        }));
      } else {
        setSalesBmForm(prev => ({
          ...prev,
          engineer_name: value,
          engineer_uid: '',
          employee_id: '',
        }));
      }
    }
  };

  const handleSalesBmSubmit = async () => {
    const required = ['date', 'customer_name', 'location', 'one_way_km',
      'work_description', 'engineer_name', 'employee_id'];
    const missing = required.filter(f => !String(salesBmForm[f] || '').trim());
    if (missing.length > 0) {
      toast.error(`Required fields missing: ${missing.join(', ')}`);
      return;
    }

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'Save Sales & BM TADA Entry?',
      html: `
      <div style="text-align:left;font-size:13px;line-height:1.7">
        <b>Date:</b> ${salesBmForm.date}<br/>
        <b>Customer:</b> ${salesBmForm.customer_name}<br/>
        <b>Engineer:</b> ${salesBmForm.engineer_name}<br/>
        <b>1 Way KM:</b> ${salesBmForm.one_way_km} &nbsp;|&nbsp; <b>2 Way KM:</b> ${salesBmAutoCalc.two_way_km}<br/>
        <hr style="margin:8px 0;border-color:#e5e7eb"/>
        <b>Rate:</b> ₹${salesBmAutoCalc.rate} &nbsp;|&nbsp; <b>DA:</b> ₹${salesBmAutoCalc.da}<br/>
        <b>Amount:</b> ₹${salesBmAutoCalc.amount}<br/>
        <b>Total:</b> <span style="color:${themeColor};font-weight:bold;font-size:15px">₹${salesBmAutoCalc.total_amount}</span>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: 'Yes, Submit',
      cancelButtonText: 'Cancel',
      confirmButtonColor: themeColor,
      reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;

    setSubmittingSalesBm(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/tada-salesbm/create`, {
        ...salesBmForm,
        branch_code: userBranch,
        created_by: userName || 'System',
      });
      await Swal.fire({
        icon: 'success',
        title: 'Submitted!',
        text: `Sales & BM entry saved (Total: ₹${res.data.total_amount})`,
        confirmButtonColor: themeColor,
        timer: 2200,
        showConfirmButton: false,
      });
      setSalesBmForm(SALES_BM_INITIAL);
      setSalesBmAutoCalc({ two_way_km: '0', rate: '0', da: '0', amount: '0', total_amount: '0' });
      // Navigate parent to Verify → Sales & BM TADA tab
      if (typeof onSalesBmSaved === 'function') onSalesBmSaved();
    } catch (err) {
      Swal.fire({
        icon: 'error', title: 'Error',
        text: err.response?.data?.detail || err.message || 'Submission failed',
        confirmButtonColor: themeColor,
      });
    } finally {
      setSubmittingSalesBm(false);
    }
  };

  // ─────────── BILL WISE handlers (SE + BM) ───────────

  // SE: engineer dropdown → auto-fill employee id + uid
  const handleBwSeEngineerChange = (name) => {
    const eng = branchEngineerList.find(e => e.employee_name === name);
    setBwSeHeader(prev => ({
      ...prev,
      engineer_name: name,
      employee_id: eng ? (eng.employee_id || '') : '',
      service_engineer_uid: eng ? (eng.employee_uid || '') : '',
    }));
  };

  // Type in SR No. → show matching records in this branch
  const handleBwSeSrNumberChange = (value) => {
    setBwSeHeader(prev => ({ ...prev, service_request_no: value }));
    const q = String(value || '').trim().toLowerCase();
    if (q.length < 2) {
      setBwSeSrSuggestions([]);
      setBwSeShowSrDropdown(false);
      return;
    }
    const matches = (existingRecords || []).filter(r => {
      const sr = String(r.service_request_no || '').toLowerCase();
      const branch = String(r.branch_code || r.sd_branch_code || '').trim();
      return sr.includes(q) && branch === userBranch;
    });
    const seen = new Set();
    const unique = [];
    for (const r of matches) {
      const k = `${r.service_request_no}__${r.service_engineer_uid || ''}`;
      if (!seen.has(k)) { seen.add(k); unique.push(r); }
      if (unique.length >= 10) break;
    }
    setBwSeSrSuggestions(unique);
    setBwSeShowSrDropdown(unique.length > 0);
  };

  // Click a suggestion → autofill SR-linked fields
  const handleBwSePickSr = (record) => {
    handleBwSeSrChange(record.service_request_no || '');
    setBwSeShowSrDropdown(false);
    setBwSeSrSuggestions([]);
  };

  const handleBwSeSrChange = (srNo) => {
    const rec = bwSrOptions.find(r => String(r.service_request_no) === String(srNo));
    setBwSeHeader(prev => ({
      ...prev,
      service_request_no: srNo,
      appointment_number: rec ? (rec.appointment_number || '') : '',
      account: rec ? (rec.account || '') : '',
      installation_site_address: rec ? (rec.installation_site_address || '') : '',
      sr_type: rec ? (rec.sr_type || '') : '',
      task_status: rec ? (rec.task_status || '') : '',
      kms_travelled: rec ? (rec.kms_travelled || '') : '',
      task_start_date: rec ? (rec.task_start_date || '') : '',
      task_end_date: rec ? (rec.task_end_date || '') : '',
    }));
  };

  const handleAddBwSeBill = () => {
    const b = bwSeBillDraft;
    if (!String(b.date || '').trim() || !String(b.expenses_head || '').trim() ||
      !String(b.amount || '').trim() || !String(b.bill_submitted || '').trim()) {
      toast.error('Fill Date, Expense Head, Amount and Bill Submitted before adding');
      return;
    }
    setBwSeBills(prev => [...prev, { ...b }]);
    setBwSeBillDraft(BW_NEW_BILL());
  };

  const handleAddBwBmBill = () => {
    const b = bwBmBillDraft;
    if (!String(b.date || '').trim() || !String(b.expenses_head || '').trim() ||
      !String(b.amount || '').trim() || !String(b.bill_submitted || '').trim()) {
      toast.error('Fill Date, Expense Head, Amount and Bill Submitted before adding');
      return;
    }
    setBwBmBills(prev => [...prev, {
      date: b.date,
      expenses_head: b.expenses_head,
      amount: b.amount,
      bill_submitted: b.bill_submitted,
    }]);
    setBwBmBillDraft(BW_NEW_BILL());
  };

  const handleBillWiseSubmit = async () => {
    const isSE = billWiseSubTab === 'se';

    // Header validation — labels match the on-screen field names
    if (isSE) {
      const reqd = [
        ['engineer_name', 'Service Engineer Name'],
        ['service_request_no', 'Service Request No.'],
        ['work_description', 'Work Description / Purpose'],
      ];
      const miss = reqd.filter(([k]) => !String(bwSeHeader[k] || '').trim()).map(([, l]) => l);
      if (miss.length > 0) {
        toast.error(`Required fields missing:\n• ${miss.join('\n• ')}`, { duration: 6000 });
        return;
      }

      // Block save if {Employee ID + SR No. + Appointment No.} already exists in TADA —
      // ANY status (Pending OR Verified). existingRecords = [...allRecords, ...submittedRecords],
      // i.e. drafts (TADAImportTemp) + submitted-to-HO (TADAImport). Backend additionally
      // guards TADAHistory, which isn't loaded here.
      const seCombo = `${String(bwSeHeader.employee_id || '').trim()}__${String(bwSeHeader.service_request_no || '').trim()}__${String(bwSeHeader.appointment_number || '').trim()}`;
      const verifiedClash = (existingRecords || []).some(r => {
        if (String(r.verification_status || '').trim() !== 'Verified') return false;
        const k = `${String(r.employee_id || '').trim()}__${String(r.service_request_no || '').trim()}__${String(r.appointment_number || '').trim()}`;
        return k === seCombo;
      });
      if (verifiedClash) {
        toast.error(
          'This record is already Verified in TADA. Bill Wise (Service Engineer) entry cannot be saved.',
          { duration: 7000 }
        );
        return;
      }
    } else {
      const reqd = [
        ['customer_name', 'Customer Name'],
        ['sr_invoice_engine_no', 'SR No. / Invoice No. / Engine No.'],
        ['installation_site_address', 'Location'],
        ['work_description', 'Work Description'],
        ['remark', 'Remark'],
        ['work_status', 'Work Status'],
      ];
      const miss = reqd.filter(([k]) => !String(bwBmHeader[k] || '').trim()).map(([, l]) => l);
      if (miss.length > 0) {
        toast.error(`Required fields missing:\n• ${miss.join('\n• ')}`, { duration: 6000 });
        return;
      }
    }

    const bills = isSE ? bwSeBills : bwBmBills;
    if (bills.length === 0) {
      toast.error('Add at least one bill line item before saving');
      return;
    }

    const header = isSE ? bwSeHeader : bwBmHeader;
    const total = bills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);

    const confirm = await Swal.fire({
      icon: 'question',
      title: `Save ${bills.length} Bill Wise record(s)?`,
      html: `
        <div style="text-align:left;font-size:13px;line-height:1.7">
          <b>Type:</b> ${isSE ? 'Service Engineer' : 'Branch Manager'}<br/>
          <b>${isSE ? 'Engineer' : 'Customer'}:</b> ${isSE ? header.engineer_name : header.customer_name}<br/>
          <b>Bills:</b> ${bills.length}<br/>
          <b>Total Amount:</b> <span style="color:${themeColor};font-weight:bold">₹${total.toFixed(2)}</span>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Yes, Save',
      cancelButtonText: 'Cancel',
      confirmButtonColor: themeColor,
      reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;

    setSubmittingBillWise(true);
    try {
      await axios.post(`${API_BASE_URL}/tada-bill-wise/create`, {
        entry_type: isSE ? 'SE' : 'BM',
        branch_code: userBranch,
        created_by: userName || 'System',
        ...header,
        bills,
      });
      await Swal.fire({
        icon: 'success',
        title: 'Saved!',
        text: `${bills.length} Bill Wise record(s) saved (₹${total.toFixed(2)})`,
        confirmButtonColor: themeColor,
        timer: 2200,
        showConfirmButton: false,
      });
      if (isSE) {
        setBwSeHeader(BW_SE_HEADER_INITIAL);
        setBwSeBills([]);
        setBwSeBillDraft(BW_NEW_BILL());
      } else {
        setBwBmHeader(BW_BM_HEADER_INITIAL);
        setBwBmBills([]);
        setBwBmBillDraft(BW_NEW_BILL());
      }
      // Navigate parent to Verify → Bill Wise tab
      if (typeof onBillWiseSaved === 'function') onBillWiseSaved();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.response?.data?.detail || err.message || 'Submission failed',
        confirmButtonColor: themeColor,
      });
    } finally {
      setSubmittingBillWise(false);
    }
  };

  // ─────────── TADA Manual (existing) ───────────
  const _taskStatusVal = String(form['Task Status'] || '').trim();
  const _srStatusVal = String(form['SR Status'] || '').trim();
  const _taskCompletedRequired = _taskStatusVal === 'Completed';
  const _srClosedRequired = _srStatusVal === 'Closed';

  const fields = [
    { key: 'Appointment Number', type: 'text', required: true },
    { key: 'Service Request No.', type: 'text' },
    { key: 'Installation Site Address', type: 'text', required: true },
    { key: 'Account', type: 'text', required: true },
    { key: 'SR Type', type: 'text', required: true },
    { key: 'SR Sub Type', type: 'text', required: true },
    { key: 'SR Due date', type: 'date', required: true },
    { key: 'Task Status', type: 'select', required: true, options: ['In Progress', 'Reached At Site', 'Cancelled', 'Completed'] },
    { key: 'Task Start Date', type: 'text', required: _taskCompletedRequired },
    { key: 'Task End Date', type: 'text', required: _taskCompletedRequired },
    { key: 'Task Assigned Date & Time', type: 'text', required: _taskCompletedRequired },
    { key: 'SR Trip Start Date & Time', type: 'text', required: true },
    { key: 'SR Reach at Site Date & Time', type: 'text', required: true },
    { key: 'SR Trip Start Lat Long', type: 'text', required: true },
    { key: 'SR Reach at site Lat long', type: 'text', required: true },
    { key: 'Service Engineer Name', type: 'engineer_select', required: true },
    { key: 'Service Engineer UID', type: 'text' },
    { key: 'Employee ID', type: 'text' },
    { key: 'SR Status', type: 'select', required: true, options: ['Closed', 'Service Engineer Assigned', 'Cancelled'] },
    { key: 'SR Closed Date', type: 'date', required: _srClosedRequired },
    { key: 'KMs Travelled(1 Way)', type: 'number' },
  ];
  const VISIBLE_KEYS = new Set([
    'Installation Site Address', 'Account', 'Service Request No.', 'Appointment Number',
    'SR Type', 'SR Sub Type', 'SR Due date', 'Task Start Date', 'Task End Date',
    'Task Status', 'Task Assigned Date & Time', 'SR Trip Start Date & Time',
    'SR Reach at Site Date & Time', 'SR Trip Start Lat Long', 'SR Reach at site Lat long',
    'KMs Travelled(1 Way)', 'SR Closed Date', 'SR Status',
    'Service Engineer Name', 'Service Engineer UID', 'Employee ID',
  ]);
  const visibleFields = fields.filter(f => VISIBLE_KEYS.has(f.key));

  const handleClear = () => {
    const cleared = {};
    Object.keys(form).forEach(k => { cleared[k] = k === 'SD Branch Code' ? userBranch : ''; });
    setForm(cleared);
    toast.success('Form cleared');
  };

  // Light tint derived from the theme color (modal is a standalone component,
  // so it can't see themeLight from the parent — define it here).
  const themeLight = 'rgba(47,49,146,0.07)';

  // Shared styles
  const labelCls = "block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1 leading-tight";
  const inputCls = "w-full px-2 py-1.5 text-[11px] border border-gray-200 rounded-md focus:outline-none text-black";
  const readOnlyCls = "w-full px-2 py-1.5 text-[11px] border border-gray-200 rounded-md bg-gray-100 text-gray-700 font-semibold cursor-not-allowed";

  const WORK_STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled'];
  const EXPENSES_HEAD_OPTIONS = ['Travel', 'Labour', 'Material', 'Spare Parts', 'Tools', 'Consumables', 'Miscellaneous'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full overflow-hidden" style={{ maxHeight: '94vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header — now contains the 4 tabs */}
        <div className="px-4 py-2 flex justify-between items-center gap-3 flex-wrap"
          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})`, flexShrink: 0 }}>

          <div className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <h2 className="text-xs font-bold text-white tracking-wide whitespace-nowrap">Add Record Manually</h2>
          </div>

          {/* 4 tabs sitting inside the blue header */}
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { id: 'manual', label: 'TADA Manual' },
              { id: 'sales_bm', label: 'Sales & BM TADA' },
              { id: 'bill_wise', label: 'Bill Wise Submission' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-3 py-1 text-[11px] font-bold rounded-md transition-all whitespace-nowrap"
                style={{
                  backgroundColor: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.15)',
                  color: activeTab === t.id ? themeColor : '#fff',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-6 h-6 bg-white text-black rounded-md flex items-center justify-center hover:bg-gray-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* ─────── MANUAL TAB ─────── */}
        {activeTab === 'manual' && (() => {
          // Keys that stay editable after an SR is auto-filled
          const EDITABLE_AFTER_FILL = new Set([
            'Service Engineer Name', 'KMs Travelled',
            // Service Engineer UID and Employee ID are NOT editable after fill
          ]);
          // Fields shown in "No Service Request Number" mode (all editable)
          const NO_SR_KEYS = [
            'Installation Site Address', 'Account', 'SR Type',
            'SR Trip Start Date & Time', 'SR Reach at Site Date & Time',
            'Service Engineer Name', 'Service Engineer UID', 'Employee ID', 'KMs Travelled(1 Way)',
          ];

          // Renders one field either editable or as a read-only display box
          const renderManualField = (f, fi, editable) => {
            // Service Engineer UID and Employee ID are always read-only
            if (f.key === 'Service Engineer UID' || f.key === 'Employee ID') {
              const v = form[f.key];
              const display = v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '-';
              return (
                <div key={fi}>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-0.5 leading-tight">
                    {f.key}
                  </label>
                  <div className="w-full px-2 py-1 text-[11px] border border-gray-100 rounded-md bg-gray-100 text-gray-600 truncate font-mono">
                    {display}
                  </div>
                </div>
              );
            }

            // Engineer Name: always a dropdown of branch engineers
            if (f.key === 'Service Engineer Name') {
              return (
                <div key={fi}>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-0.5 leading-tight">
                    Service Engineer Name {f.required && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={form['Service Engineer Name'] || ''}
                    onChange={e => {
                      const selectedName = e.target.value;
                      const eng = branchEngineerList.find(en => en.employee_name === selectedName);
                      updateField('Service Engineer Name', selectedName);
                      if (eng) {
                        updateField('Service Engineer UID', eng.employee_uid || '');
                        updateField('Employee ID', eng.employee_id || '');
                      } else {
                        updateField('Service Engineer UID', '');
                        updateField('Employee ID', '');
                      }
                    }}
                    disabled={!editable}
                    className={`w-full px-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none text-black bg-white ${!editable ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    onFocus={e => editable && (e.target.style.borderColor = themeColor)}
                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
                  >
                    <option value="">— Select Engineer —</option>
                    {branchEngineerList.map((eng, i) => (
                      <option key={i} value={eng.employee_name}>
                        {eng.employee_name}{eng.designation ? ` (${eng.designation})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            if (!editable) {
              const v = form[f.key];
              const display = v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '-';
              return (
                <div key={fi}>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-0.5 leading-tight">
                    {f.key} {f.required && <span className="text-red-500">*</span>}
                  </label>
                  <div
                    className="w-full px-2 py-1 text-[11px] border border-gray-100 rounded-md bg-gray-50 text-gray-600 truncate"
                    title={display}
                  >
                    {display}
                  </div>
                </div>
              );
            }
            return (
              <div key={fi} className={f.wide ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}>
                <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-0.5 leading-tight">
                  {f.key} {f.required && <span className="text-red-500">*</span>}
                </label>
                {f.type === 'select' ? (
                  <select
                    value={form[f.key] || ''}
                    onChange={e => updateField(f.key, e.target.value)}
                    className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none text-black bg-white"
                    onFocus={e => e.target.style.borderColor = themeColor}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  >
                    <option value="">— Select —</option>
                    {f.options.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                  </select>
                ) : (() => {
                  const nowLocal = (() => {
                    const d = new Date();
                    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
                  })();
                  return (
                    <input
                      type={f.type}
                      value={form[f.key] || ''}
                      onChange={e => updateField(f.key, e.target.value)}
                      className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none text-black"
                      onFocus={e => e.target.style.borderColor = themeColor}
                      onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                      placeholder={f.required ? 'Required' : 'Optional'}
                      step={f.type === 'number' ? '0.01' : undefined}
                      max={f.type === 'datetime-local' ? nowLocal : undefined}
                    />
                  );
                })()}
              </div>
            );
          };

          return (
            <>
              <div className="px-4 py-3" style={{ overflowY: 'auto', flex: '0 1 auto', scrollbarWidth: 'thin' }}>

                {/* Mode toggle */}
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setManualMode('sr')}
                    className="px-3 py-1 text-[11px] font-bold rounded-md border transition-all"
                    style={{
                      backgroundColor: manualMode === 'sr' ? themeColor : '#fff',
                      color: manualMode === 'sr' ? '#fff' : '#374151',
                      borderColor: manualMode === 'sr' ? themeColor : '#e5e7eb',
                    }}
                  >
                    Use Service Request No.
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Switch to manual entry — blank everything except branch code
                      const cleared = {};
                      Object.keys(form).forEach(k => { cleared[k] = k === 'SD Branch Code' ? userBranch : ''; });
                      setForm(cleared);
                      setPickedSr(null);
                      setSrSuggestions([]);
                      setShowSrDropdown(false);
                      setManualMode('no_sr');
                    }}
                    className="px-3 py-1 text-[11px] font-bold rounded-md border transition-all"
                    style={{
                      backgroundColor: manualMode === 'no_sr' ? themeColor : '#fff',
                      color: manualMode === 'no_sr' ? '#fff' : '#374151',
                      borderColor: manualMode === 'no_sr' ? themeColor : '#e5e7eb',
                    }}
                  >
                    Without Service Request No.
                  </button>
                </div>

                {/* Top banner — Only Service Engineer Name */}
                {manualMode === 'sr' && pickedSr?.service_engineer_name && (
                  <div className="mb-2 text-xs font-medium text-[#2f3192]">
                    Using Service Engineer: {pickedSr.service_engineer_name}
                  </div>
                )}

                {manualMode === 'no_sr' ? (
                  /* ─── NO SR NUMBER: top row 4 fields, second row 5 fields ─── */
                  <>
                    {/* FIRST ROW - 4 fields */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-2.5 gap-y-2 mb-3">
                      {[
                        { key: 'Installation Site Address', type: 'text', required: true },
                        { key: 'Account', type: 'text', required: true },
                        { key: 'SR Type', type: 'text', required: true },
                        { key: 'SR Trip Start Date & Time', type: 'datetime-local', required: true },
                      ].map((f, fi) => renderManualField(f, fi, true))}
                    </div>

                    {/* SECOND ROW - 5 fields: SR Reach at Site Date & Time, Service Engineer Name, Service Engineer UID, Employee ID, KMs Travelled */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-2.5 gap-y-2">
                      {[
                        { key: 'SR Reach at Site Date & Time', type: 'datetime-local', required: true },
                        { key: 'Service Engineer Name', type: 'engineer_select', required: true },
                        { key: 'Service Engineer UID', type: 'text' },
                        { key: 'Employee ID', type: 'text' },
                        { key: 'KMs Travelled(1 Way)', type: 'number' },
                      ].map((f, fi) => renderManualField(f, fi, true))}
                    </div>
                  </>


                ) : (() => {
                  /* ─── SR MODE: SR autocomplete first, top fields 4/row, then a 6-field last row ─── */
                  const LAST_ROW_KEYS = [
                    'Service Engineer Name', 'Service Engineer UID', 'Employee ID',
                    'SR Status', 'SR Closed Date', 'KMs Travelled(1 Way)',
                  ];
                  const remaining = visibleFields.filter(f => f.key !== 'Service Request No.');
                  const topFields = pickedSr ? remaining.filter(f => !LAST_ROW_KEYS.includes(f.key)) : [];
                  const lastRowFields = pickedSr
                    ? LAST_ROW_KEYS.map(k => remaining.find(f => f.key === k)).filter(Boolean)
                    : [];

                  return (
                    <>
                      {/* Top: SR No. + all other auto-filled fields, 5 per row */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-2.5 gap-y-2">
                        {/* Service Request No. — always first & editable */}
                        <div key="sr" className={!pickedSr ? 'col-span-2 md:col-span-3 lg:col-span-5 flex items-end gap-3' : ''}>
                          <div className={!pickedSr ? 'w-64 shrink-0' : ''}>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase tracking-wide mb-0.5 leading-tight">
                              Service Request No. <span className="text-red-500">*</span>
                            </label>
                            <input
                              ref={srInputRef}
                              type="text"
                              value={form['Service Request No.'] || ''}
                              onChange={e => handleSrNumberChange(e.target.value)}
                              onFocus={e => {
                                e.target.style.borderColor = themeColor;
                                if (srSuggestions.length > 0) setShowSrDropdown(true);
                              }}
                              onBlur={e => {
                                e.target.style.borderColor = '#e2e8f0';
                                setTimeout(() => setShowSrDropdown(false), 200);
                              }}
                              className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none text-black"
                              placeholder="Type SR No. to search…"
                              autoComplete="off"
                            />
                            {showSrDropdown && srSuggestions.length > 0 && srInputRef.current && (() => {
                              const rect = srInputRef.current.getBoundingClientRect();
                              const width = Math.max(rect.width, 320);
                              const left = Math.min(rect.left, window.innerWidth - width - 8);
                              const top = Math.min(rect.bottom + 4, window.innerHeight - 280);
                              return (
                                <div
                                  className="bg-white border border-gray-300 rounded-lg shadow-2xl overflow-y-auto"
                                  style={{
                                    position: 'fixed',
                                    top: `${top}px`,
                                    left: `${left}px`,
                                    width: `${width}px`,
                                    maxHeight: '260px',
                                    zIndex: 99999,
                                  }}
                                  onMouseDown={e => e.preventDefault()}
                                >
                                  <div className="px-2 py-1 border-b bg-blue-50 text-[9px] font-bold text-blue-700 uppercase tracking-wide sticky top-0">
                                    {srSuggestions.length} match{srSuggestions.length > 1 ? 'es' : ''} — click to auto-fill
                                  </div>
                                  {srSuggestions.map((r, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => handlePickSrRecord(r)}
                                      className="w-full px-2 py-1.5 text-left hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-bold text-gray-800 truncate" title={r.service_engineer_name || ''}>
                                          {r.service_engineer_name || '-'}
                                        </span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0 font-mono">
                                          UID: {r.service_engineer_uid || '-'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] font-mono text-blue-700 font-semibold shrink-0">SR: {r.service_request_no}</span>
                                        <span className="text-[9px] text-gray-300">·</span>
                                        <span className="text-[9px] font-mono text-gray-600 shrink-0">Appt: {r.appointment_number || '-'}</span>
                                        <span className="text-[9px] text-gray-300">·</span>
                                        <span className="text-[9px] text-gray-500 truncate">{r.account || r.installation_site_address || '-'}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          {!pickedSr && (
                            <p className="text-[11px] text-gray-400 italic pb-1">
                              Type a Service Request No. and pick a match to auto-fill. Then enter Service Engineer Name, UID and KMs Travelled.
                            </p>
                          )}
                        </div>

                        {/* All fields except the 6 reserved for the last row */}
                        {topFields.map((f, fi) => renderManualField(f, fi, EDITABLE_AFTER_FILL.has(f.key)))}
                      </div>

                      {/* Last row: exactly 6 fields */}
                      {lastRowFields.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-2.5 gap-y-2 mt-2">
                          {lastRowFields.map((f, fi) => renderManualField(f, fi, EDITABLE_AFTER_FILL.has(f.key)))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="border-t px-4 py-2.5 flex justify-between items-center bg-gray-50" style={{ flexShrink: 0 }}>
                <button onClick={handleClear} className="px-3 py-1.5 border border-gray-300 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                  Clear Form
                </button>
                <div className="flex gap-2 items-center">
                  <button onClick={onClose} className="px-3 py-1.5 border border-gray-300 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const seName = (form['Service Engineer Name'] || '').trim();
                      if (!seName) {
                        toast.error('Service Engineer Name is required.');
                        return;
                      }
                      onSubmit(form);
                    }}
                    disabled={submitting}
                    className="px-4 py-1.5 text-white text-[11px] font-bold rounded-md disabled:opacity-40 flex items-center gap-1.5"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                  >
                    {submitting ? 'Saving…' : 'Save Record'}
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {/* ─────── SALES & BM TADA TAB ─────── */}
        {activeTab === 'sales_bm' && (
          <>
            <div className="px-4 py-3" style={{ overflowY: 'auto', flex: '0 1 auto', scrollbarWidth: 'thin' }}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2.5">

                {/* Date */}
                <div>
                  <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                  <input type="date" value={salesBmForm.date}
                    onChange={e => handleSalesBmFieldChange('date', e.target.value)}
                    className={inputCls} min={tadaDateRange.min} max={tadaDateRange.max} />
                </div>

                {/* SR / Invoice / Engine No */}
                <div>
                  <label className={labelCls}>SR No. / Invoice No. / Engine No.</label>
                  <input type="text" value={salesBmForm.sr_invoice_engine_no}
                    onChange={e => handleSalesBmFieldChange('sr_invoice_engine_no', e.target.value)}
                    placeholder="Enter any one" className={inputCls} />
                </div>

                {/* Customer Name */}
                <div>
                  <label className={labelCls}>Customer Name <span className="text-red-500">*</span></label>
                  <input type="text" value={salesBmForm.customer_name}
                    onChange={e => handleSalesBmFieldChange('customer_name', e.target.value)}
                    placeholder="Enter Customer Name" className={inputCls} />
                </div>

                {/* Location */}
                <div>
                  <label className={labelCls}>Location <span className="text-red-500">*</span></label>
                  <input type="text" value={salesBmForm.location}
                    onChange={e => handleSalesBmFieldChange('location', e.target.value)}
                    placeholder="Enter Location" className={inputCls} />
                </div>

                {/* 1 Way KM */}
                <div>
                  <label className={labelCls}>1 Way KM <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" value={salesBmForm.one_way_km}
                    onChange={e => handleSalesBmFieldChange('one_way_km', e.target.value)}
                    placeholder="Enter 1 Way KM" className={inputCls} />
                </div>

                {/* 2 Way KM (auto) */}
                <div>
                  <label className={labelCls}>2 Way KM</label>
                  <input type="text" value={salesBmAutoCalc.two_way_km} readOnly className={readOnlyCls} />
                </div>

                {/* Amount */}
                <div>
                  <label className={labelCls}>Amount</label>
                  <input type="text" value={`₹${salesBmAutoCalc.amount}`} readOnly className={readOnlyCls} />
                </div>

                {/* DA */}
                <div>
                  <label className={labelCls}>DA</label>
                  <input type="text" value={`₹${salesBmAutoCalc.da}`} readOnly className={readOnlyCls} />
                </div>

                {/* Total Amount */}
                <div>
                  <label className={labelCls}>Total Amount</label>
                  <input type="text" value={`₹${salesBmAutoCalc.total_amount}`} readOnly className={readOnlyCls} />
                </div>

                {/* Work Description dropdown */}
                <div>
                  <label className={labelCls}>Work Description <span className="text-red-500">*</span></label>
                  <select value={salesBmForm.work_description}
                    onChange={e => handleSalesBmFieldChange('work_description', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    <option value="">— Select —</option>
                    {WORK_DESC_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                {/* Remark */}
                <div>
                  <label className={labelCls}>Remark <span className="text-red-500">*</span></label>
                  <input type="text" value={salesBmForm.remark}
                    onChange={e => handleSalesBmFieldChange('remark', e.target.value)}
                    placeholder="Enter remark" className={inputCls} />
                </div>
                {/* Engineer Name dropdown */}
                <div>
                  <label className={labelCls}>Engineer Name <span className="text-red-500">*</span></label>
                  <select value={salesBmForm.engineer_name}
                    onChange={e => handleSalesBmFieldChange('engineer_name', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    <option value="">— Select Engineer —</option>
                    {branchEngineerList.map((eng, i) => (
                      <option key={i} value={eng.employee_name}>
                        {eng.employee_name}{eng.designation ? ` (${eng.designation})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Engineer UID (auto-filled, read-only, optional) */}
                <div>
                  <label className={labelCls}>Engineer UID</label>
                  <input type="text" value={salesBmForm.engineer_uid} readOnly className={readOnlyCls}
                    placeholder="Auto-filled from Engineer" />
                </div>

                {/* Employee ID (auto-filled, read-only) */}
                <div>
                  <label className={labelCls}>Employee ID <span className="text-red-500">*</span></label>
                  <input type="text" value={salesBmForm.employee_id} readOnly className={readOnlyCls}
                    placeholder="Auto-filled from Engineer" />
                </div>

                {/* Labour Sale Expected */}
                <div>
                  <label className={labelCls}>Labour Sale Expected</label>
                  <input type="number" step="0.01" value={salesBmForm.labour_sale_expected}
                    onChange={e => handleSalesBmFieldChange('labour_sale_expected', e.target.value)}
                    placeholder="₹ 0.00" className={inputCls} />
                </div>

                {/* Part Sale Expected */}
                <div>
                  <label className={labelCls}>Part Sale Expected</label>
                  <input type="number" step="0.01" value={salesBmForm.part_sale_expected}
                    onChange={e => handleSalesBmFieldChange('part_sale_expected', e.target.value)}
                    placeholder="₹ 0.00" className={inputCls} />
                </div>

              </div>
            </div>

            <div className="border-t px-4 py-2.5 flex justify-between items-center bg-gray-50" style={{ flexShrink: 0 }}>
              <button
                onClick={() => {
                  setSalesBmForm(SALES_BM_INITIAL);
                  setSalesBmAutoCalc({ two_way_km: '0', rate: '0', da: '0', amount: '0', total_amount: '0' });
                  toast.success('Form cleared');
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
              >Clear Form</button>
              <div className="flex gap-2 items-center">
                <button onClick={onClose}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={handleSalesBmSubmit} disabled={submittingSalesBm}
                  className="px-4 py-1.5 text-white text-[11px] font-bold rounded-md disabled:opacity-40"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                  {submittingSalesBm ? 'Submitting…' : 'Save Sales & BM'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─────── BILL WISE TAB (two sub-tabs: Service Engineer / Branch Manager) ─────── */}
        {activeTab === 'bill_wise' && (
          <>
            <div className="px-4 py-3" style={{ overflowY: 'auto', flex: '0 1 auto', scrollbarWidth: 'thin' }}>

              {/* Sub-tab toggle */}
              <div className="flex items-center gap-1.5 mb-3">
                {[
                  { id: 'se', label: 'Service Engineer' },
                  { id: 'bm', label: 'Branch Manager' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBillWiseSubTab(t.id)}
                    className="px-3 py-1 text-[11px] font-bold rounded-md border transition-all"
                    style={{
                      backgroundColor: billWiseSubTab === t.id ? themeColor : '#fff',
                      color: billWiseSubTab === t.id ? '#fff' : '#374151',
                      borderColor: billWiseSubTab === t.id ? themeColor : '#e5e7eb',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ===== SERVICE ENGINEER SUB-TAB ===== */}
              {billWiseSubTab === 'se' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-2 gap-y-2">
                    {/* Service Engineer Name */}
                    <div>
                      <label className={labelCls}>Service Engineer Name <span className="text-red-500">*</span></label>
                      <select value={bwSeHeader.engineer_name}
                        onChange={e => handleBwSeEngineerChange(e.target.value)}
                        className={`${inputCls} bg-white`}>
                        <option value="">— Select Engineer —</option>
                        {branchEngineerList.map((eng, i) => (
                          <option key={i} value={eng.employee_name}>
                            {eng.employee_name}{eng.designation ? ` (${eng.designation})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Employee ID (auto) */}
                    <div>
                      <label className={labelCls}>Employee ID</label>
                      <input type="text" value={bwSeHeader.employee_id} readOnly className={readOnlyCls} placeholder="Auto" />
                    </div>
                    {/* Service Engineer UID (auto) */}
                    <div>
                      <label className={labelCls}>Service Engineer UID</label>
                      <input type="text" value={bwSeHeader.service_engineer_uid} readOnly className={readOnlyCls} placeholder="Auto" />
                    </div>
                    {/* Service Request No. — autocomplete (same UX as "Use Service Request No.") */}
                    <div>
                      <label className={labelCls}>Service Request No. <span className="text-red-500">*</span></label>
                      <input
                        ref={bwSeSrInputRef}
                        type="text"
                        value={bwSeHeader.service_request_no || ''}
                        onChange={e => handleBwSeSrNumberChange(e.target.value)}
                        onFocus={() => { if (bwSeSrSuggestions.length > 0) setBwSeShowSrDropdown(true); }}
                        onBlur={() => setTimeout(() => setBwSeShowSrDropdown(false), 200)}
                        className={inputCls}
                        placeholder="Type SR No. to search…"
                        autoComplete="off"
                      />
                      {bwSeShowSrDropdown && bwSeSrSuggestions.length > 0 && bwSeSrInputRef.current && (() => {
                        const rect = bwSeSrInputRef.current.getBoundingClientRect();
                        const width = Math.max(rect.width, 320);
                        const left = Math.min(rect.left, window.innerWidth - width - 8);
                        const top = Math.min(rect.bottom + 4, window.innerHeight - 280);
                        return (
                          <div
                            className="bg-white border border-gray-300 rounded-lg shadow-2xl overflow-y-auto"
                            style={{
                              position: 'fixed',
                              top: `${top}px`,
                              left: `${left}px`,
                              width: `${width}px`,
                              maxHeight: '260px',
                              zIndex: 99999,
                            }}
                            onMouseDown={e => e.preventDefault()}
                          >
                            <div className="px-2 py-1 border-b bg-blue-50 text-[9px] font-bold text-blue-700 uppercase tracking-wide sticky top-0">
                              {bwSeSrSuggestions.length} match{bwSeSrSuggestions.length > 1 ? 'es' : ''} — click to auto-fill
                            </div>
                            {bwSeSrSuggestions.map((r, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => handleBwSePickSr(r)}
                                className="w-full px-2 py-1.5 text-left hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-gray-800 truncate" title={r.service_engineer_name || ''}>
                                    {r.service_engineer_name || '-'}
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0 font-mono">
                                    UID: {r.service_engineer_uid || '-'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] font-mono text-blue-700 font-semibold shrink-0">SR: {r.service_request_no}</span>
                                  <span className="text-[9px] text-gray-300">·</span>
                                  <span className="text-[9px] font-mono text-gray-600 shrink-0">Appt: {r.appointment_number || '-'}</span>
                                  <span className="text-[9px] text-gray-300">·</span>
                                  <span className="text-[9px] text-gray-500 truncate">{r.account || r.installation_site_address || '-'}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {/* Work Description / Purpose */}
                    <div>
                      <label className={labelCls}>Work Description / Purpose <span className="text-red-500">*</span></label>
                      <textarea rows={2} value={bwSeHeader.work_description}
                        onChange={e => setBwSeHeader(p => ({ ...p, work_description: e.target.value }))}
                        placeholder="Describe the work / purpose" className={`${inputCls} resize-none`} />
                    </div>
                  </div>

                  {/* Auto-filled SR fields (read-only) — 4 per row */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-2 mt-2">
                    {[
                      ['Appointment Number', 'appointment_number'],
                      ['Account', 'account'],
                      ['Installation Site Address', 'installation_site_address'],
                      ['SR Type', 'sr_type'],
                      ['Task Status', 'task_status'],
                      ['KMs Travelled', 'kms_travelled'],
                      ['Task Start Date', 'task_start_date'],
                      ['Task End Date', 'task_end_date'],
                    ].map(([lbl, key]) => (
                      <div key={key}>
                        <label className={labelCls}>{lbl}</label>
                        <input type="text" value={bwSeHeader[key] || ''} readOnly className={readOnlyCls} placeholder="Auto from SR" />
                      </div>
                    ))}
                  </div>

                  {/* Repeatable bill sub-section */}
                  <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: themeColor, backgroundColor: themeLight }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-x-3 gap-y-2.5 items-end">
                      <div>
                        <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                        <input type="date" value={bwSeBillDraft.date}
                          onChange={e => setBwSeBillDraft(p => ({ ...p, date: e.target.value }))}
                          className={inputCls} min={tadaDateRange.min} max={tadaDateRange.max} />
                      </div>
                      <div>
                        <label className={labelCls}>Expense Head <span className="text-red-500">*</span></label>
                        <select value={bwSeBillDraft.expenses_head}
                          onChange={e => setBwSeBillDraft(p => ({ ...p, expenses_head: e.target.value }))}
                          className={`${inputCls} bg-white`}>
                          <option value="">— Select —</option>
                          {BILL_WISE_EXPENSE_HEAD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Amount (₹) <span className="text-red-500">*</span></label>
                        <input type="number" step="0.01" value={bwSeBillDraft.amount}
                          onChange={e => setBwSeBillDraft(p => ({ ...p, amount: e.target.value }))}
                          placeholder="0.00" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Bill Submitted <span className="text-red-500">*</span></label>
                        <select value={bwSeBillDraft.bill_submitted}
                          onChange={e => setBwSeBillDraft(p => ({ ...p, bill_submitted: e.target.value }))}
                          className={`${inputCls} bg-white`}>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>
                      <div>
                        <button type="button" onClick={handleAddBwSeBill}
                          className="w-full px-3 py-1.5 text-white text-[11px] font-bold rounded-md"
                          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                          + Add Bill
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Added bills list (bottom of form) */}
                  {bwSeBills.length > 0 && (
                    <div className="mt-3 border rounded-lg overflow-hidden">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr style={{ backgroundColor: '#f0f1ff' }}>
                            {['Sr.', 'Date', 'Expense Head', 'Amount (₹)', 'Bill Submitted', ''].map((h, i) => (
                              <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-b border-r last:border-r-0 border-gray-200 uppercase text-center">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {bwSeBills.map((b, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/40">
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{idx + 1}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{b.date}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{b.expenses_head}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold">₹{parseFloat(b.amount || 0).toFixed(2)}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{b.bill_submitted}</td>
                              <td className="px-2 py-1 text-center">
                                <button type="button" onClick={() => setBwSeBills(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-red-600 hover:text-red-800" title="Remove">
                                  <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: '#f0f1ff' }}>
                            <td colSpan={3} className="px-2 py-1 text-[11px] font-bold text-right border-t-2 border-gray-200">Total</td>
                            <td className="px-2 py-1 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700">
                              ₹{bwSeBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0).toFixed(2)}
                            </td>
                            <td colSpan={2} className="border-t-2 border-gray-200" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* ===== BRANCH MANAGER SUB-TAB ===== */}
              {billWiseSubTab === 'bm' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-2.5">
                    <div>
                      <label className={labelCls}>Customer Name <span className="text-red-500">*</span></label>
                      <input type="text" value={bwBmHeader.customer_name}
                        onChange={e => setBwBmHeader(p => ({ ...p, customer_name: e.target.value }))}
                        placeholder="Enter Customer Name" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>SR No. / Invoice No. / Engine No. <span className="text-red-500">*</span></label>
                      <input type="text" value={bwBmHeader.sr_invoice_engine_no}
                        onChange={e => setBwBmHeader(p => ({ ...p, sr_invoice_engine_no: e.target.value }))}
                        placeholder="Enter any one" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Location <span className="text-red-500">*</span></label>
                      <input type="text" value={bwBmHeader.installation_site_address}
                        onChange={e => setBwBmHeader(p => ({ ...p, installation_site_address: e.target.value }))}
                        placeholder="Enter Location" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Work Description <span className="text-red-500">*</span></label>
                      <select value={bwBmHeader.work_description}
                        onChange={e => setBwBmHeader(p => ({ ...p, work_description: e.target.value }))}
                        className={`${inputCls} bg-white`}>
                        <option value="">— Select —</option>
                        {BILL_WISE_BM_WORK_DESC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Remark <span className="text-red-500">*</span></label>
                      <input type="text" value={bwBmHeader.remark}
                        onChange={e => setBwBmHeader(p => ({ ...p, remark: e.target.value }))}
                        placeholder="Enter remark" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Work Status <span className="text-red-500">*</span></label>
                      <select value={bwBmHeader.work_status}
                        onChange={e => setBwBmHeader(p => ({ ...p, work_status: e.target.value }))}
                        className={`${inputCls} bg-white`}>
                        <option value="">— Select —</option>
                        {BILL_WISE_BM_WORK_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Repeatable bill sub-section */}
                  <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: themeColor, backgroundColor: themeLight }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-x-3 gap-y-2.5 items-end">
                      <div>
                        <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                        <input type="date" value={bwBmBillDraft.date}
                          onChange={e => setBwBmBillDraft(p => ({ ...p, date: e.target.value }))}
                          className={inputCls} min={tadaDateRange.min} max={tadaDateRange.max} />
                      </div>
                      <div>
                        <label className={labelCls}>Expense Head <span className="text-red-500">*</span></label>
                        <select value={bwBmBillDraft.expenses_head}
                          onChange={e => setBwBmBillDraft(p => ({ ...p, expenses_head: e.target.value }))}
                          className={`${inputCls} bg-white`}>
                          <option value="">— Select —</option>
                          {BILL_WISE_EXPENSE_HEAD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Amount (₹) <span className="text-red-500">*</span></label>
                        <input type="number" step="0.01" value={bwBmBillDraft.amount}
                          onChange={e => setBwBmBillDraft(p => ({ ...p, amount: e.target.value }))}
                          placeholder="0.00" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Bill Submitted <span className="text-red-500">*</span></label>
                        <select value={bwBmBillDraft.bill_submitted}
                          onChange={e => setBwBmBillDraft(p => ({ ...p, bill_submitted: e.target.value }))}
                          className={`${inputCls} bg-white`}>
                          <option value="">— Select —</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>
                      <div>
                        <button type="button" onClick={handleAddBwBmBill}
                          className="w-full px-3 py-1.5 text-white text-[11px] font-bold rounded-md"
                          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                          + Add Bill
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Added bills list */}
                  {bwBmBills.length > 0 && (
                    <div className="mt-3 border rounded-lg overflow-hidden">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr style={{ backgroundColor: '#f0f1ff' }}>
                            {['Sr.', 'Date', 'Expense Head', 'Amount (₹)', 'Bill Submitted', ''].map((h, i) => (
                              <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-b border-r last:border-r-0 border-gray-200 uppercase text-center">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {bwBmBills.map((b, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/40">
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{idx + 1}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{b.date}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{b.expenses_head}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold">₹{parseFloat(b.amount || 0).toFixed(2)}</td>
                              <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{b.bill_submitted || '-'}</td>
                              <td className="px-2 py-1 text-center">
                                <button type="button" onClick={() => setBwBmBills(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-red-600 hover:text-red-800" title="Remove">
                                  <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: '#f0f1ff' }}>
                            <td colSpan={3} className="px-2 py-1 text-[11px] font-bold text-right border-t-2 border-gray-200">Total</td>
                            <td className="px-2 py-1 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700">
                              ₹{bwBmBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0).toFixed(2)}
                            </td>
                            <td colSpan={2} className="border-t-2 border-gray-200" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t px-4 py-2.5 flex justify-between items-center bg-gray-50" style={{ flexShrink: 0 }}>
              <button
                onClick={() => {
                  if (billWiseSubTab === 'se') {
                    setBwSeHeader(BW_SE_HEADER_INITIAL); setBwSeBills([]); setBwSeBillDraft(BW_NEW_BILL());
                  } else {
                    setBwBmHeader(BW_BM_HEADER_INITIAL); setBwBmBills([]); setBwBmBillDraft(BW_NEW_BILL());
                  }
                  toast.success('Bill Wise form cleared');
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
              >
                Clear Form
              </button>
              <div className="flex gap-2 items-center">
                <button onClick={onClose} className="px-3 py-1.5 border border-gray-300 rounded-md text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                  Cancel
                </button>
                <button
                  onClick={handleBillWiseSubmit}
                  disabled={submittingBillWise}
                  className="px-4 py-1.5 text-white text-[11px] font-bold rounded-md disabled:opacity-40 flex items-center gap-1.5"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                >
                  {submittingBillWise ? 'Saving…' : `Save ${billWiseSubTab === 'se' ? bwSeBills.length : bwBmBills.length} Bill(s)`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Wrap with React.memo so it never re-renders when parent re-renders
const ManualEntryModalMemo = React.memo(ManualEntryModalComponent);

const MANUAL_FORM_INITIAL = {
  'SD Branch Name': '', 'SD Branch Code': '', 'Installation Site Address': '',
  'Instance ID': '', 'Engine Application Code': '', 'Engine Serial Number': '',
  'Account': '', 'Account ID': '',
  'Service Request No.': '', 'Appointment Number': '',
  'SR Type': '', 'SR Sub Type': '', 'SR Due date': '',
  'Task Start Date': '', 'Task End Date': '', 'Task Status': '',
  'Task Assigned Date & Time': '', 'Task Assign v.s Trip Start': '',
  'SR Trip Start Date & Time': '', 'SR Reach at Site Date & Time': '',
  'SR Trip Start Lat Long': '', 'SR Reach at site Lat long': '',
  'KMs Travelled': '', 'SR Closed Date': '', 'SR Status': '',
  'Asset Primary Contact No.': '', 'VOC': '',
  'Service Engineer Name': '', 'Service Engineer UID': '', 'Employee ID': '',
  'Customer Name': '', 'Customer contact number': '', 'Customer Remark': '',
  'Problem Summary': '', 'Nature of Failure': '', 'Action Taken': '',
  'Engineer Remark': '', 'Exception Remark': '', 'OTP Remark': '', 'PDF Generated': '',
};

/* ═══════════════════════════════════════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════════════════════════════════════ */
const BranchAdminExpense = () => {
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const themeColor = '#2f3192';
  const themeDark = '#335478';
  const themeLight = 'rgba(47,49,146,0.07)';
  const [selectedEngineer, setSelectedEngineer] = useState('');
  const [historyReachDateFrom, setHistoryReachDateFrom] = useState('');
  const [historyReachDateTo, setHistoryReachDateTo] = useState('');
  const [showCustomerDetailModal, setShowCustomerDetailModal] = useState(false);
  const [selectedCustomerRecordId, setSelectedCustomerRecordId] = useState(null);
  const [showBranchRateModal, setShowBranchRateModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);

  /* ── Manual Entry Modal ── */
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [submittingManual, setSubmittingManual] = useState(false);

  // KM Rates for DA/Total calculation (same logic as HOExpense)
  const [kmRates, setKmRates] = useState({});
  const [submittedDAAmounts, setSubmittedDAAmounts] = useState({});
  const [submittedTotalAmounts, setSubmittedTotalAmounts] = useState({});

  // ── LVB Temp/Draft state ─────────────────────────────────────────────────────
  const [lvbTempDrafts, setLvbTempDrafts] = useState([]);
  const [loadingLvbTemp, setLoadingLvbTemp] = useState(false);
  const [lvbTempSelected, setLvbTempSelected] = useState({});
  const [lvbTempEditingId, setLvbTempEditingId] = useState(null);
  const [lvbTempEditForm, setLvbTempEditForm] = useState({});
  const [submittingLvbTemp, setSubmittingLvbTemp] = useState(false);
  const [unverifyingTadaTemp, setUnverifyingTadaTemp] = useState(false);
  const [salesHoKmFilter, setSalesHoKmFilter] = useState(false);
  const [kmWiseHoKmFilter, setKmWiseHoKmFilter] = useState(false);
  const [salesVerifiedOnly, setSalesVerifiedOnly] = useState(false);
  const [kmWiseVerifiedOnly, setKmWiseVerifiedOnly] = useState(false);
  const [billWiseVerifiedOnly, setBillWiseVerifiedOnly] = useState(false);

  const isAdmin = user?.role === 'master_admin' || user?.role === 'it_admin';
  const userBranch = String(user?.branch || '').trim();
  const [canExport, setCanExport] = useState(false);

  const [branchLimits, setBranchLimits] = useState({
    tada_days: 30,
    office_expense_days: 30,
    lvb_days: 30,
  });

  // Submit-day rule loaded from DB for the current user's branch
  const [submitRule, setSubmitRule] = useState(null); // { rule_type, allowed_values }

  const exportToExcel = (data, filename, headers) => {
    // Build an array-of-objects keyed by the human-readable label so the
    // sheet header row matches what the user sees on screen.
    const norm = (val) => {
      if (val === null || val === undefined) return '';
      return val;
    };
    const rows = (data || []).map(row => {
      const obj = {};
      headers.forEach(h => { obj[h.label] = norm(row[h.key]); });
      return obj;
    });

    // Create a real .xlsx workbook via SheetJS (already imported as XLSX).
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: headers.map(h => h.label),
    });

    // Auto-size columns to roughly the widest cell in each.
    ws['!cols'] = headers.map(h => {
      let maxLen = h.label.length;
      rows.forEach(r => {
        const v = r[h.label];
        const len = v === null || v === undefined ? 0 : String(v).length;
        if (len > maxLen) maxLen = len;
      });
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // Ensure the filename ends in .xlsx (matches the real OOXML output).
    const finalName = /\.xlsx$/i.test(filename) ? filename : `${filename}.xlsx`;
    XLSX.writeFile(wb, finalName);
  };

  /* ── Tab ── */
  const [activeTab, setActiveTab] = useState('tada');
  const [tadaSubTab, setTadaSubTab] = useState('drafts'); // 'drafts' | 'verified' | 'submitted'
  const [verifyingTadaTemp, setVerifyingTadaTemp] = useState(false);
  const pendingVerifiedTabRef = useRef(null);
  const [drillInEngineer, setDrillInEngineer] = useState(null); // { name, uid } | null
  const [selectedVoucher, setSelectedVoucher] = useState(null); // SE: { voucher, submittedBy, start, end, rows } | null
  const [selectedSalesVoucher, setSelectedSalesVoucher] = useState(null);
  const [selectedBillWiseVoucher, setSelectedBillWiseVoucher] = useState(null);
  const [verifyDataFilter, setVerifyDataFilter] = useState(false); // submitted-tab drill-in: show only Verified rows
  const [hoKmFilter, setHoKmFilter] = useState(false); // secondary filter: only rows with non-empty ho_corrected_km
  const [submittedRecords, setSubmittedRecords] = useState([]);
  const [loadingSubmitted, setLoadingSubmitted] = useState(false);

  // ── Submitted view inner tabs: 'se' (existing) | 'sales' (new) ──────────────
  const [submittedInnerTab, setSubmittedInnerTab] = useState('se');
  // Verified page inner tab: 'se' | 'sales_bm'
  const [verifiedInnerTab, setVerifiedInnerTab] = useState('se');
  const [salesRecords, setSalesRecords] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [salesSelectedPeriod, setSalesSelectedPeriod] = useState(null);
  // ── KM Wise (Submitted → KM Wise inner tab) ─────────────────────────────
  const [kmWiseRecords, setKmWiseRecords] = useState([]);
  const [loadingKmWise, setLoadingKmWise] = useState(false);
  const [kmWiseSelectedPeriod, setKmWiseSelectedPeriod] = useState(null);

  const fetchKmWiseRecords = useCallback(async () => {
    setLoadingKmWise(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada-km-wise/records`, {
        params: { branch_code: userBranch, limit: 1000 }
      });
      setKmWiseRecords(data || []);
    } catch {
      toast.error('Failed to load KM Wise records');
    } finally {
      setLoadingKmWise(false);
    }
  }, [userBranch]);

  // ── Bill Wise (Submitted → Bill Wise inner tab) ─────────────────────────
  const [billWiseRecords, setBillWiseRecords] = useState([]);
  const [loadingBillWise, setLoadingBillWise] = useState(false);
  const [billWiseSelectedPeriod, setBillWiseSelectedPeriod] = useState(null);

  const fetchBillWiseRecords = useCallback(async () => {
    setLoadingBillWise(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada-bill-wise/submitted/records`, { // Submitted tab
        params: { branch_code: userBranch, limit: 1000 }
      });
      setBillWiseRecords(data || []);
    } catch {
      toast.error('Failed to load Bill Wise records');
    } finally {
      setLoadingBillWise(false);
    }
  }, [userBranch]);

  // ── Bill Wise DRAFTS (TADABillWiseTemp) — shown on Verify page ──
  const [billWiseDrafts, setBillWiseDrafts] = useState([]);
  const [loadingBillWiseDrafts, setLoadingBillWiseDrafts] = useState(false);
  const [billWiseDraftSelected, setBillWiseDraftSelected] = useState({});
  const [submittingBillWiseToHo, setSubmittingBillWiseToHo] = useState(false);

  // Persisted SE block combos across temp + main + history (block stays after submit/move)
  const [billWiseBlockedCombos, setBillWiseBlockedCombos] = useState([]);
  const fetchBillWiseBlockedCombos = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada-bill-wise/blocked-combos`, {
        params: { branch_code: userBranch }
      });
      setBillWiseBlockedCombos(data?.combos || []);
    } catch {
      // non-fatal — frontend draft-derived combos still apply
    }
  }, [userBranch]);

  const fetchBillWiseDrafts = useCallback(async () => {
    setLoadingBillWiseDrafts(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada-bill-wise/records`, { // temp drafts → Verify tab
        params: { branch_code: userBranch, limit: 1000 }
      });
      setBillWiseDrafts(data || []);
    } catch {
      toast.error('Failed to load Bill Wise drafts');
    } finally {
      setLoadingBillWiseDrafts(false);
    }
  }, [userBranch]);

  const handleDeleteBillWiseDraft = async (id) => {
    const result = await Swal.fire({
      title: 'Delete this record?',
      text: 'This Bill Wise draft will be permanently removed.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      await axios.delete(`${API_BASE_URL}/tada-bill-wise/records/${id}`);
      setBillWiseDrafts(prev => prev.filter(r => r.id !== id));
      setBillWiseDraftSelected(prev => { const n = { ...prev }; delete n[id]; return n; });
      fetchBillWiseBlockedCombos();   // delete removes the combo → TADA draft unblocks
      toast.success('Record deleted');
    } catch (err) {
      if (err.response?.status === 404) {
        setBillWiseDrafts(prev => prev.filter(r => r.id !== id));
        setBillWiseDraftSelected(prev => { const n = { ...prev }; delete n[id]; return n; });
        toast.success('Record removed');
      } else {
        toast.error(err.response?.data?.detail || 'Failed to delete record');
      }
    }
  };

  const handleSubmitBillWiseToHo = async () => {
    if (!isAdmin && !isUploadAllowed()) { toast.error(getUploadRestrictionMessage()); return; }
    const ids = Object.keys(billWiseDraftSelected).filter(k => billWiseDraftSelected[k]).map(Number);
    if (ids.length === 0) { toast.error('Select at least one record'); return; }

    const totalCount = billWiseDrafts.length;
    const remaining = totalCount - ids.length;
    let ok;
    if (remaining > 0) {
      ok = await Swal.fire({
        icon: 'warning',
        title: 'Some records not selected',
        html: `${ids.length} record(s) will be submitted to HO.<br/><b>${remaining}</b> record(s) are not selected and will stay pending.`,
        showCancelButton: true,
        confirmButtonColor: '#2f3192', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Submit anyway', cancelButtonText: 'Go back',
        reverseButtons: true,
      });
    } else {
      ok = await Swal.fire({
        title: `Submit all ${ids.length} record(s) to HO?`,
        text: 'After submit you cannot edit them.',
        icon: 'question', showCancelButton: true,
        confirmButtonColor: '#2f3192', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, submit', reverseButtons: true,
      });
    }
    if (!ok.isConfirmed) return;
    setSubmittingBillWiseToHo(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada-bill-wise/submit`, {
        temp_ids: ids, branch_code: userBranch,
      });
      toast.success(data.voucher_no ? `Submitted! Voucher: ${data.voucher_no}` : (data.message || 'Submitted to HO'));
      setBillWiseDrafts(prev => prev.filter(r => !ids.includes(r.id)));
      setBillWiseDraftSelected({});
      fetchBillWiseBlockedCombos();   // combos persist via main table — keep block list fresh
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit');
    } finally {
      setSubmittingBillWiseToHo(false);
    }
  };

  const fetchSalesRecords = useCallback(async () => {
    setLoadingSales(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada-salesbm/submitted/records`, {
        params: { branch_code: userBranch, limit: 1000 }
      });
      setSalesRecords(data || []);
    } catch {
      toast.error('Failed to load Sales & BM records');
    } finally {
      setLoadingSales(false);
    }
  }, [userBranch]);

  // Sales & BM DRAFTS (SalesBMTemp) — shown on Verify page
  const [salesBmDrafts, setSalesBmDrafts] = useState([]);
  const [loadingSalesBmDrafts, setLoadingSalesBmDrafts] = useState(false);
  const [salesBmDraftPeriod, setSalesBmDraftPeriod] = useState(null);
  const [submittingSalesBmToHo, setSubmittingSalesBmToHo] = useState(false);
  const [salesBmDraftSelected, setSalesBmDraftSelected] = useState({});
  // ── Bill Wise DRAFT period drill-in (Verify tab) ──
  const [billWiseDraftPeriod, setBillWiseDraftPeriod] = useState(null);

  const fetchSalesBmDrafts = useCallback(async () => {
    setLoadingSalesBmDrafts(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada-salesbm/records`, {
        params: { branch_code: userBranch, limit: 1000 }
      });
      setSalesBmDrafts(data || []);
    } catch {
      toast.error('Failed to load Sales & BM drafts');
    } finally {
      setLoadingSalesBmDrafts(false);
    }
  }, [userBranch]);

  const handleSubmitSalesBmToHo = async () => {
    if (!isAdmin && !isUploadAllowed()) { toast.error(getUploadRestrictionMessage()); return; }
    const ids = Object.keys(salesBmDraftSelected).filter(k => salesBmDraftSelected[k]).map(Number);
    if (ids.length === 0) { toast.error('Select at least one record'); return; }

    const totalCount = salesBmDrafts.length;
    const remaining = totalCount - ids.length;
    let ok;
    if (remaining > 0) {
      ok = await Swal.fire({
        icon: 'warning',
        title: 'Some records not selected',
        html: `${ids.length} record(s) will be submitted to HO.<br/><b>${remaining}</b> record(s) are not selected and will stay pending.`,
        showCancelButton: true,
        confirmButtonColor: '#2f3192', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Submit anyway', cancelButtonText: 'Go back',
        reverseButtons: true,
      });
    } else {
      ok = await Swal.fire({
        title: `Submit all ${ids.length} record(s) to HO?`,
        text: 'After submit you cannot edit them.',
        icon: 'question', showCancelButton: true,
        confirmButtonColor: '#2f3192', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, submit', reverseButtons: true,
      });
    }
    if (!ok.isConfirmed) return;
    setSubmittingSalesBmToHo(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada-salesbm/submit`, {
        temp_ids: ids, branch_code: userBranch,
      });
      toast.success(data.voucher_no ? `Submitted! Voucher: ${data.voucher_no}` : (data.message || 'Submitted to HO'));
      setSalesBmDrafts(prev => prev.filter(r => !ids.includes(r.id)));
      setSalesBmDraftSelected({});
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit');
    } finally {
      setSubmittingSalesBmToHo(false);
    }
  };

  const handleDeleteSalesBmDraft = async (id) => {
    const result = await Swal.fire({
      title: 'Delete this record?',
      text: 'This Sales & BM draft will be permanently removed.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      await axios.delete(`${API_BASE_URL}/tada-salesbm/records/${id}`);
      setSalesBmDrafts(prev => prev.filter(r => r.id !== id));
      setSalesBmDraftSelected(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast.success('Record deleted');
    } catch (err) {
      if (err.response?.status === 404) {
        // Already gone on the server — just remove it from the view.
        setSalesBmDrafts(prev => prev.filter(r => r.id !== id));
        setSalesBmDraftSelected(prev => { const n = { ...prev }; delete n[id]; return n; });
        toast.success('Record removed');
      } else {
        toast.error(err.response?.data?.detail || 'Failed to delete record');
      }
    }
  };

  const fetchSubmittedRecords = useCallback(async () => {
    setLoadingSubmitted(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada/submitted/records`, {
        params: { branch_code: userBranch }
      });
      setSubmittedRecords(data || []);
    } catch {
      toast.error('Failed to load submitted records');
    } finally {
      setLoadingSubmitted(false);
    }
  }, [userBranch]);

  useEffect(() => {
    if (activeTab === 'tada' && tadaSubTab === 'submitted') {
      fetchSubmittedRecords();
    }
  }, [activeTab, tadaSubTab, fetchSubmittedRecords]);

  // Submitted → Sales & BM (main table)
  useEffect(() => {
    if (activeTab === 'tada' && tadaSubTab === 'submitted' && submittedInnerTab === 'sales') {
      fetchSalesRecords();
    }
  }, [activeTab, tadaSubTab, submittedInnerTab, fetchSalesRecords]);

  // Verified → Sales & BM (temp table)
  useEffect(() => {
    if (activeTab === 'tada' && tadaSubTab === 'verified' && verifiedInnerTab === 'sales_bm') {
      fetchSalesBmDrafts();
    }
  }, [activeTab, tadaSubTab, verifiedInnerTab, fetchSalesBmDrafts]);

  // Verified → Bill Wise (temp table)
  useEffect(() => {
    if (activeTab === 'tada' && tadaSubTab === 'verified' && verifiedInnerTab === 'bill_wise') {
      fetchBillWiseDrafts();
    }
  }, [activeTab, tadaSubTab, verifiedInnerTab, fetchBillWiseDrafts]);

  // Drafts (Pending for Verification): load Bill Wise SE drafts + persisted block
  // combos (temp+main+history) so any TADA draft with a Bill Wise (SE) entry stays blocked.
  useEffect(() => {
    if (activeTab === 'tada' && tadaSubTab === 'drafts') {
      fetchBillWiseDrafts();
      fetchBillWiseBlockedCombos();
    }
  }, [activeTab, tadaSubTab, fetchBillWiseDrafts, fetchBillWiseBlockedCombos]);

  // Fetch Bill Wise records when user opens Submitted → Bill Wise
  useEffect(() => {
    if (activeTab === 'tada' && tadaSubTab === 'submitted' && submittedInnerTab === 'bill_wise') {
      fetchBillWiseRecords();
    }
  }, [activeTab, tadaSubTab, submittedInnerTab, fetchBillWiseRecords]);

  // Reset inner tab + sales drill-in when leaving Submitted
  useEffect(() => {
    if (tadaSubTab !== 'submitted') {
      setSubmittedInnerTab('se');
      setSelectedVoucher(null);
      setSelectedSalesVoucher(null);
      setSelectedBillWiseVoucher(null);
      setSalesSelectedPeriod(null);
      setKmWiseSelectedPeriod(null);
      setBillWiseSelectedPeriod(null);
      setSalesHoKmFilter(false);
      setKmWiseHoKmFilter(false);
      setSalesVerifiedOnly(false);
      setKmWiseVerifiedOnly(false);
      setBillWiseVerifiedOnly(false);
    }
  }, [tadaSubTab]);

  useEffect(() => {
    setSelectedEngineer('');
    setDrillInEngineer(null);
    setSelectedVoucher(null);
    setVerifyDataFilter(false);
    setHoKmFilter(false);
    setTadaSelected({});
    if (pendingVerifiedTabRef.current) {
      setVerifiedInnerTab(pendingVerifiedTabRef.current);
      pendingVerifiedTabRef.current = null;
    } else if (tadaSubTab !== 'verified') {
      // Only reset to 'se' when actually leaving the Verified tab,
      // never when we just navigated INTO it from a save.
      setVerifiedInnerTab('se');
    }
    setSalesBmDraftPeriod(null);
    setSalesBmDraftSelected({});
    setBillWiseDraftSelected({});
    setBillWiseDraftPeriod(null);
  }, [tadaSubTab]);

  /* ── Import modal ── */
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadResult, setUploadResult] = useState(null); // NEW: holds detailed import result

  /* ── Data accumulation ── */
  const [allRecords, setAllRecords] = useState([]);
  const [nextSkip, setNextSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const autoLoadRef = useRef(false);

  /* ── Search ── */
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 280);
  useEffect(() => { setIsSearching(false); }, [debouncedSearch]);

  /* ── Inline Editing States ── */
  const [editingCell, setEditingCell] = useState(null);
  const [tadaSelected, setTadaSelected] = useState({});

  /* ── Excel-style Task Status column filter ── */
  const [activeColumnFilter, setActiveColumnFilter] = useState(null);
  // activeColumnFilter = { x, y, options, selected, onApply } | null
  const [mainTaskStatusFilter, setMainTaskStatusFilter] = useState(new Set());
  const [historyAllTaskStatusFilter, setHistoryAllTaskStatusFilter] = useState(new Set());
  const [historyPeriodTaskStatusFilter, setHistoryPeriodTaskStatusFilter] = useState(new Set());

  const [submittingTadaTemp, setSubmittingTadaTemp] = useState(false);
  const [editInputValue, setEditInputValue] = useState('');
  const [savingVerification, setSavingVerification] = useState(false);
  const [localValues, setLocalValues] = useState({});

  /* ── Pending KM (frontend-only, not yet saved to DB) ── */
  const PENDING_KM_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
  const REMARK_MIN_LEN = 4;
  const [pendingKM, setPendingKM] = useState({});       // { recordId: kmValue }
  const pendingTimersRef = useRef({});                  // { recordId: timeoutId }

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyEngineer, setHistoryEngineer] = useState('');

  // History tab state — All Records vs By Submission Period
  const [historyTab, setHistoryTab] = useState('all'); // 'all' | 'periods'
  const [historyGrouped, setHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingHistoryGrouped, setLoadingHistoryGrouped] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  // ─── History modal: main tab switcher ──────────────────────────────
  const [historyMainTab, setHistoryMainTab] = useState('service_engineer'); // 'service_engineer' | 'sales' | 'km_wise' | 'bill_wise'

  // ─── Sales sub-tab inside history modal ────────────────────────────
  const [salesHistoryRecords, setSalesHistoryRecords] = useState([]);
  const [salesHistoryGrouped, setSalesHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [loadingSalesHistoryGrouped, setLoadingSalesHistoryGrouped] = useState(false);
  const [salesHistoryTab, setSalesHistoryTab] = useState('all'); // 'all' | 'periods'
  const [salesSelectedHistoryPeriod, setSalesSelectedHistoryPeriod] = useState(null);
  const [salesHistorySearch, setSalesHistorySearch] = useState('');

  // ─── KM Wise sub-tab inside history modal ──────────────────────────
  const [kmWiseHistoryRecords, setKmWiseHistoryRecords] = useState([]);
  const [kmWiseHistoryGrouped, setKmWiseHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingKmWiseHistory, setLoadingKmWiseHistory] = useState(false);
  const [loadingKmWiseHistoryGrouped, setLoadingKmWiseHistoryGrouped] = useState(false);
  const [kmWiseHistoryTab, setKmWiseHistoryTab] = useState('all');
  const [kmWiseSelectedHistoryPeriod, setKmWiseSelectedHistoryPeriod] = useState(null);
  const [kmWiseHistorySearch, setKmWiseHistorySearch] = useState('');

  // ─── Bill Wise sub-tab inside history modal ────────────────────────
  const [billWiseHistoryRecords, setBillWiseHistoryRecords] = useState([]);
  const [billWiseHistoryGrouped, setBillWiseHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingBillWiseHistory, setLoadingBillWiseHistory] = useState(false);
  const [loadingBillWiseHistoryGrouped, setLoadingBillWiseHistoryGrouped] = useState(false);
  const [billWiseHistoryTab, setBillWiseHistoryTab] = useState('all');
  const [billWiseSelectedHistoryPeriod, setBillWiseSelectedHistoryPeriod] = useState(null);
  const [billWiseHistorySearch, setBillWiseHistorySearch] = useState('');

  const summaryTopScrollBarRef = useRef(null);
  const summaryTableContainerRef = useRef(null);
  const submittedTopScrollBarRef = useRef(null);
  const submittedTableContainerRef = useRef(null);

  const columnOrder = [
    'select', 'sr_no',
    'installation_site_address', 'account', 'service_request_no', 'sr_sub_type',
    'sr_trip_start_datetime', 'sr_reach_at_site_datetime',
    'kms_travelled', 'two_way_km', 'branch_verified_km', 'km_verification_remark',
    'da_amount', 'freight_charges', 'total_amount', 'appointment_number', 'sr_type', 'sr_due_date',
    'task_start_date', 'task_end_date', 'task_status', 'task_assigned_datetime',
    'sr_trip_start_lat_long', 'sr_reach_at_site_lat_long',
    'sr_closed_date', 'sr_status',
    'service_engineer_name', 'service_engineer_uid', 'employee_id', 'actions',
  ];
  /* ── Refs ── */
  const tableContainerRef = useRef(null);
  const topScrollBarRef = useRef(null);
  const { ref: sentinelRef, inView } = useInView({ threshold: 0.1, triggerOnce: false });

  /* ─────────────────────────────────────────────────────────────────────────────
     CORE FETCH — one batch
  ───────────────────────────────────────────────────────────────────────────── */
  const fetchBatch = useCallback(async (skip) => {
    if (loadingRecords) return false;
    setLoadingRecords(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/tada/temp/records`, {
        params: { skip, limit: BATCH_SIZE, branch_code: userBranch },
      });
      const batch = Array.isArray(data) ? data : [];

      setAllRecords(prev => {
        const ids = new Set(prev.map(r => r.id));
        const fresh = batch.filter(r => !ids.has(r.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });

      const more = batch.length === BATCH_SIZE;
      setNextSkip(skip + batch.length);
      setHasMore(more);
      return more;
    } catch {
      toast.error('Failed to load TADA records');
      setHasMore(false);
      return false;
    } finally {
      setLoadingRecords(false);
    }
  }, [loadingRecords]);

  useEffect(() => {
    const checkExportPermission = async () => {
      try {
        const userId = user?.user_id || user?.id;
        if (!userId) return;
        const res = await axios.get(`${API_BASE_URL}/tada-ho/check-export-permission`, {
          params: { user_id: userId }
        });
        setCanExport(res.data.can_export);
      } catch (err) {
        console.error('Could not verify export permission', err);
        setCanExport(false);
      }
    };
    checkExportPermission();
  }, []);

  // ── Fetch per-branch upload day limits from DB ──
  useEffect(() => {
    const fetchBranchLimits = async () => {
      if (!userBranch) return;
      try {
        const { data } = await axios.get(`${API_BASE_URL}/branch-upload-limits`);
        const myRow = (data || []).find(r => r.branch_code === userBranch);
        if (myRow) {
          setBranchLimits({
            tada_days: myRow.tada_days || 30,
            office_expense_days: myRow.office_expense_days || 30,
            lvb_days: myRow.lvb_days || 30,
          });
        }
      } catch (err) {
        console.error('Failed to fetch branch upload limits — using defaults (30/30/30)', err);
      }
    };
    fetchBranchLimits();
  }, [userBranch]);

  // ── Fetch submit-day rule from DB for current branch ──
  useEffect(() => {
    const fetchSubmitRule = async () => {
      if (!userBranch) return;
      try {
        const { data } = await axios.get(`${API_BASE_URL}/branch-submit-limits`);
        const myRow = (data || []).find(r => r.branch_code === userBranch);
        if (myRow) {
          setSubmitRule({
            rule_type: myRow.rule_type,
            allowed_values: myRow.allowed_values || [],
          });
        }
      } catch (err) {
        console.error('Failed to fetch submit-day rule — falling back to hardcoded', err);
      }
    };
    fetchSubmitRule();
  }, [userBranch]);

  useEffect(() => {
    if (activeTab === 'tada') {
      setAllRecords([]);
      setNextSkip(0);
      setHasMore(true);
      autoLoadRef.current = false;
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'tada') return;
    if (allRecords.length === 0 && hasMore && !loadingRecords) {
      fetchBatch(0);
    }
  }, [activeTab, allRecords.length]);

  useEffect(() => {
    if (activeTab !== 'tada') return;
    if (!hasMore || loadingRecords) return;
    if (allRecords.length === 0) return;
    const timer = setTimeout(() => {
      fetchBatch(nextSkip);
    }, 120);
    return () => clearTimeout(timer);
  }, [allRecords.length, hasMore, loadingRecords]);

  useEffect(() => {
    if (inView && hasMore && !loadingRecords && activeTab === 'tada') {
      fetchBatch(nextSkip);
    }
  }, [inView]);

  /* ── Helpers for task status column filter ── */
  const getUniqueTaskStatuses = (records) => {
    const set = new Set();
    (records || []).forEach(r => {
      const s = String(r.task_status || '').trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  };

  const openTaskStatusFilter = (e, records, currentFilter, setFilter) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveColumnFilter({
      x: rect.left,
      y: rect.bottom + 4,
      options: getUniqueTaskStatuses(records),
      selected: new Set(currentFilter),
      onApply: (newSet) => {
        setFilter(newSet);
        setActiveColumnFilter(null);
      },
    });
  };

  useEffect(() => {
    setHistoryPeriodTaskStatusFilter(new Set());
  }, [selectedPeriod?.key]);

  /* ─────────────────────────────────────────────────────────────────────────────
     UPDATE KM VERIFICATION
  ───────────────────────────────────────────────────────────────────────────── */
  const updateKMVerification = async (recordId, field, value) => {
    setSavingVerification(true);
    try {
      const updateData = {};
      if (field === 'branch_verified_km') {
        updateData.branch_verified_km = value;
      } else if (field === 'km_verification_remark') {
        updateData.km_verification_remark = value;
      }

      await axios.put(`${API_BASE_URL}/tada/temp/records/${recordId}/verify-km`, updateData);

      toast.success(`${field === 'branch_verified_km' ? 'Verified KM' : 'Verification remark'} updated successfully`);
    } catch (error) {
      console.error('Error updating verification:', error);
      toast.error('Failed to update');
    } finally {
      setSavingVerification(false);
    }
  };

  const handleLocalValueChange = (recordId, field, value) => {
    setLocalValues(prev => ({
      ...prev,
      [`${recordId}_${field}`]: value
    }));
  };

  const handleManualSubmit = async (manualForm) => {
    // ── Always-required fields ──
    // In no_sr mode, only these fields are required; others are allowed null
    const isNoSrMode = !String(manualForm['Appointment Number'] || '').trim();
    const alwaysRequired = isNoSrMode
      ? [
        'Installation Site Address', 'Account', 'SR Type',
        'SR Trip Start Date & Time', 'SR Reach at Site Date & Time',
        'Service Engineer Name',
      ]
      : [
        'Installation Site Address', 'Account', 'Appointment Number',
        'SR Type', 'SR Sub Type', 'SR Due date',
        'SR Trip Start Date & Time', 'SR Reach at Site Date & Time',
        'SR Trip Start Lat Long', 'SR Reach at site Lat long',
        'Task Status', 'SR Status',
      ];
    const missing = alwaysRequired.filter(f => !String(manualForm[f] || '').trim());

    // ── Conditional: Task Status = Completed ⇒ task dates required (only in SR mode) ──
    const taskStatus = String(manualForm['Task Status'] || '').trim();
    if (!isNoSrMode && taskStatus === 'Completed') {
      ['Task Start Date', 'Task End Date', 'Task Assigned Date & Time'].forEach(k => {
        if (!String(manualForm[k] || '').trim()) {
          missing.push(`${k} (required when Task Status = Completed)`);
        }
      });
    }

    // ── Conditional: SR Status = Closed ⇒ SR Closed Date required (only in SR mode) ──
    const srStatus = String(manualForm['SR Status'] || '').trim();
    if (!isNoSrMode && srStatus === 'Closed') {
      if (!String(manualForm['SR Closed Date'] || '').trim()) {
        missing.push('SR Closed Date (required when SR Status = Closed)');
      }
    }

    if (missing.length > 0) {
      toast.error(`Please fill required fields:\n• ${missing.join('\n• ')}`, { duration: 7000 });
      return;
    }

    setSubmittingManual(true);
    try {
      // Normalize datetime-local values (YYYY-MM-DDTHH:mm) → "M/D/YYYY, h:mm AM/PM"
      const toDisplayDT = (v) => {
        if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v))) return v;
        const d = new Date(v);
        if (isNaN(d.getTime())) return v;
        return d.toLocaleString('en-US', {
          day: 'numeric', month: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', hour12: true,
        });
      };
      const normalizedForm = {
        ...manualForm,
        'SR Trip Start Date & Time': toDisplayDT(manualForm['SR Trip Start Date & Time']),
        'SR Reach at Site Date & Time': toDisplayDT(manualForm['SR Reach at Site Date & Time']),
      };

      // Build an Excel file in-memory from the form, then POST to the same endpoint
      const ws = XLSX.utils.json_to_sheet([normalizedForm]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const file = new File([blob], 'manual_entry.xlsx', { type: blob.type });

      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(
        `${API_BASE_URL}/tada/upload?branch_code=${encodeURIComponent(userBranch)}&uploaded_by=${encodeURIComponent(user?.name || 'System')}`,
        fd, { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const data = res.data || {};
      const status = data.status || 'success';
      const msg = data.message || 'Record added successfully';
      const added = (data.new_records || 0) + (data.updated_records || 0);

      // Show toast based on backend status
      if (status === 'duplicate') {
        toast.error(msg, { duration: 6000 });
      } else if (status === 'error') {
        toast.error(msg, { duration: 6000 });
      } else if (status === 'warning' || added === 0) {
        toast(msg, { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(msg);
      }

      // Only close the modal + refresh table if a row was actually added/updated
      if (added > 0) {
        setShowManualEntryModal(false);
        setAllRecords([]); setNextSkip(0); setHasMore(true); autoLoadRef.current = false;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add record');
    } finally {
      setSubmittingManual(false);
    }
  };

  // Clears a record's pending KM from frontend AND removes the pending input value.
  const clearPendingKM = useCallback((recordId, opts = {}) => {
    if (pendingTimersRef.current[recordId]) {
      clearTimeout(pendingTimersRef.current[recordId]);
      delete pendingTimersRef.current[recordId];
    }
    setPendingKM(prev => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
    if (opts.clearInput !== false) {
      setLocalValues(prev => {
        const next = { ...prev };
        delete next[`${recordId}_branch_verified_km`];
        return next;
      });
    }
  }, []);

  // Clear all pending timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pendingTimersRef.current).forEach(t => clearTimeout(t));
      pendingTimersRef.current = {};
    };
  }, []);

  /* ── Dual-scrollbar sync for Verified/Submitted summary table ── */
  useEffect(() => {
    const main = summaryTableContainerRef.current;
    const top = summaryTopScrollBarRef.current;
    if (!main || !top) return;
    const onMain = () => { top.scrollLeft = main.scrollLeft; };
    const onTop = () => { main.scrollLeft = top.scrollLeft; };
    main.addEventListener('scroll', onMain);
    top.addEventListener('scroll', onTop);
    return () => {
      main.removeEventListener('scroll', onMain);
      top.removeEventListener('scroll', onTop);
    };
  });

  /* ── Dual-scrollbar sync for Submitted detail table ── */
  useEffect(() => {
    const main = submittedTableContainerRef.current;
    const top = submittedTopScrollBarRef.current;
    if (!main || !top) return;

    // Dynamically measure actual table width and set phantom div width
    const syncPhantomWidth = () => {
      const phantom = top.firstChild;
      if (phantom && main.scrollWidth > 0) {
        phantom.style.width = `${main.scrollWidth}px`;
      }
    };
    syncPhantomWidth();
    // Re-measure after a small delay (lets the table fully paint)
    const timer = setTimeout(syncPhantomWidth, 100);

    const onMain = () => { top.scrollLeft = main.scrollLeft; };
    const onTop = () => { main.scrollLeft = top.scrollLeft; };
    main.addEventListener('scroll', onMain);
    top.addEventListener('scroll', onTop);
    window.addEventListener('resize', syncPhantomWidth);

    return () => {
      clearTimeout(timer);
      main.removeEventListener('scroll', onMain);
      top.removeEventListener('scroll', onTop);
      window.removeEventListener('resize', syncPhantomWidth);
    };
  }, [submittedRecords, loadingSubmitted, drillInEngineer, tadaSubTab]);

  const handleSaveValue = async (recordId, field, value) => {
    // NEW — Freight Charges save (immediate, no pending state)
    if (field === 'freight_charges') {
      const freightStr = String(value ?? '').trim();
      setSavingVerification(true);
      try {
        await axios.put(`${API_BASE_URL}/tada/temp/records/${recordId}/verify-km`, {
          freight_charges: freightStr,
        });
        toast.success('Freight charges saved');
        setAllRecords(prev => prev.map(r =>
          r.id === recordId ? { ...r, freight_charges: freightStr } : r
        ));
        setLocalValues(prev => {
          const next = { ...prev };
          delete next[`${recordId}_freight_charges`];
          return next;
        });
      } catch (err) {
        console.error('Freight save failed', err);
        toast.error('Failed to save freight charges');
      } finally {
        setSavingVerification(false);
      }
      return;
    }

    // ─── Branch Verified KM ──────────────────────────────────────────
    // DO NOT call backend. Hold in frontend "pending" state for 3 min.
    if (field === 'branch_verified_km') {
      const kmStr = String(value ?? '').trim();

      if (kmStr === '') {
        clearPendingKM(recordId);
        return;
      }

      setPendingKM(prev => ({ ...prev, [recordId]: kmStr }));

      if (pendingTimersRef.current[recordId]) {
        clearTimeout(pendingTimersRef.current[recordId]);
      }
      pendingTimersRef.current[recordId] = setTimeout(() => {
        toast.error('3 minutes elapsed — KM removed because no valid remark was added');
        clearPendingKM(recordId);
      }, PENDING_KM_TIMEOUT_MS);

      toast.success(`KM held. Add a remark (min ${REMARK_MIN_LEN} chars) within 3 minutes to save.`);
      return;
    }

    // ─── Branch Verification Remark ──────────────────────────────────
    if (field === 'km_verification_remark') {
      const remark = String(value ?? '').trim();

      // Empty remark — do not call backend
      if (remark === '') return;

      // Length check — do not call backend
      if (remark.length < REMARK_MIN_LEN) {
        toast.error(`Branch Verification Remark must be at least ${REMARK_MIN_LEN} characters`);
        return;
      }

      // Valid remark — save (with pending KM if present)
      const pendingKm = pendingKM[recordId];

      setSavingVerification(true);
      try {
        if (pendingKm !== undefined && pendingKm !== '') {
          await axios.put(`${API_BASE_URL}/tada/temp/records/${recordId}/verify-km`, {
            branch_verified_km: pendingKm,
            km_verification_remark: remark,
          });
          toast.success('Verified KM and remark saved');

          setAllRecords(prev => prev.map(r =>
            r.id === recordId
              ? { ...r, branch_verified_km: pendingKm, km_verification_remark: remark }
              : r
          ));

          clearPendingKM(recordId, { clearInput: true });
          setLocalValues(prev => {
            const next = { ...prev };
            delete next[`${recordId}_km_verification_remark`];
            return next;
          });
        } else {
          await axios.put(`${API_BASE_URL}/tada/temp/records/${recordId}/verify-km`, {
            km_verification_remark: remark,
          });
          toast.success('Verification remark saved');

          setAllRecords(prev => prev.map(r =>
            r.id === recordId ? { ...r, km_verification_remark: remark } : r
          ));
          setLocalValues(prev => {
            const next = { ...prev };
            delete next[`${recordId}_km_verification_remark`];
            return next;
          });
        }
      } catch (err) {
        console.error('Verify save failed', err);
        toast.error('Failed to save');
      } finally {
        setSavingVerification(false);
      }
      return;
    }
  };

  /* ── Handle double click to edit ── */
  const handleDoubleClick = (record, field, currentValue) => {
    const isVerified = record.verification_status === 'Verified';
    if (!isVerified && (field === 'branch_verified_km' || field === 'km_verification_remark')) {
      setEditingCell({ id: record.id, field, value: currentValue || '' });
      setEditInputValue(currentValue || '');
    }
  };

  const handleOpenCustomerDetail = (record) => {
    setSelectedCustomerRecordId(record.id);
    setShowCustomerDetailModal(true);
  };

  const handleCloseCustomerDetail = () => {
    setShowCustomerDetailModal(false);
    setSelectedCustomerRecordId(null);
  };

  /* ── Handle edit save on blur or enter ── */
  const handleEditSave = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const valueToSave = editInputValue;
    // Reset editor UI first so inline cell re-renders normally
    setEditingCell(null);
    setEditInputValue('');
    await handleSaveValue(id, field, valueToSave);
  };

  const handleEditKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditInputValue('');
    }
  };

  const handleDeleteTadaRow = async (recordId) => {
    const result = await Swal.fire({
      title: 'Remove this row?',
      text: 'It will be removed from drafts. You can re-import the file to bring it back.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, remove',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;
    try {
      await axios.delete(`${API_BASE_URL}/tada/temp/records/${recordId}`);
      setAllRecords(prev => prev.filter(r => r.id !== recordId));
      setTadaSelected(prev => { const n = { ...prev }; delete n[recordId]; return n; });
      toast.success('Row removed from drafts');
    } catch {
      toast.error('Failed to remove row');
    }
  };

  const handleSubmitTadaTemp = async () => {
    if (!isAdmin && !isUploadAllowed()) {
      toast.error(getUploadRestrictionMessage());
      return;
    }
    // Submit only the selected rows that pass the current filter
    const ids = filteredRecords
      .map(r => r.id)
      .filter(id => tadaSelected[id]);

    if (ids.length === 0) {
      toast.error('Select at least one row to submit');
      return;
    }

    // Warn if some records in this tab were left unselected; else plain confirm
    const remaining = filteredRecords.filter(r => !ids.includes(r.id));
    if (remaining.length > 0) {
      const proceed = await Swal.fire({
        icon: 'warning',
        title: 'Some records not selected',
        html: `${ids.length} record(s) will be submitted to HO.<br/><b>${remaining.length}</b> record(s) in this tab are not selected and will stay pending.`,
        showCancelButton: true,
        confirmButtonColor: '#2f3192',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Submit anyway',
        cancelButtonText: 'Go back',
        reverseButtons: true,
      });
      if (!proceed.isConfirmed) return;
    } else {
      const proceed = await Swal.fire({
        icon: 'question',
        title: `Submit all ${ids.length} record(s)?`,
        text: 'After submit, you cannot edit or remove them.',
        showCancelButton: true,
        confirmButtonColor: '#2f3192',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, submit',
        cancelButtonText: 'Cancel',
        reverseButtons: true,
      });
      if (!proceed.isConfirmed) return;
    }

    setSubmittingTadaTemp(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada/temp/submit`, {
        temp_ids: ids,
        branch_code: userBranch,
      });
      toast.success(data.voucher_no ? `Submitted! Voucher: ${data.voucher_no}` : (data.message || 'Submitted'));
      setAllRecords(prev => prev.filter(r => !ids.includes(r.id)));
      setTadaSelected({});
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit');
    } finally {
      setSubmittingTadaTemp(false);
    }
  };

  const handleVerifyTadaTemp = async () => {
    // Branch-level verify only acts on Drafts (Pending) rows that are selected
    let ids = filteredRecords
      .map(r => r.id)
      .filter(id => tadaSelected[id]);

    // Hard block: never verify rows that already have a Bill Wise (SE) entry
    const blockedIds = filteredRecords
      .filter(r => isRecordBlockedByBillWise(r))
      .map(r => r.id);
    if (blockedIds.length > 0) {
      ids = ids.filter(id => !blockedIds.includes(id));
    }

    if (ids.length === 0) {
      toast.error('Select at least one row to verify');
      return;
    }

    // Frontend pre-check: KM/remark are optional, but if a remark is typed it must be ≥ REMARK_MIN_LEN chars
    const selectedRows = filteredRecords.filter(r => ids.includes(r.id));
    const badRemark = selectedRows.filter(r => {
      const remark = String(r.km_verification_remark ?? '').trim();
      return remark !== '' && remark.length < REMARK_MIN_LEN;
    });
    if (badRemark.length > 0) {
      toast.error(`${badRemark.length} row(s) have a remark shorter than ${REMARK_MIN_LEN} characters. Either clear it or extend it.`);
      return;
    }

    // 🚫 Block any selected row that has a Branch Verified KM entered
    // (typed, held as pending, or already saved) but NO valid saved remark.
    const kmWithoutRemark = selectedRows.filter(r => {
      const typed = localValues[`${r.id}_branch_verified_km`];
      const pending = pendingKM[r.id];
      const saved = r.branch_verified_km;
      const hasKm =
        (typed !== undefined && String(typed).trim() !== '') ||
        (pending !== undefined && String(pending).trim() !== '') ||
        (saved !== null && saved !== undefined && String(saved).trim() !== '');
      const remark = String(r.km_verification_remark ?? '').trim();
      return hasKm && remark.length < REMARK_MIN_LEN;
    });
    if (kmWithoutRemark.length > 0) {
      toast.error(
        `${kmWithoutRemark.length} record(s) have a Branch Verified KM but no saved remark. ` +
        `Add a remark (min ${REMARK_MIN_LEN} characters) and let it save before verifying — ` +
        `KM cannot be saved without a remark.`,
        { duration: 7000 }
      );
      return;
    }

    // Calculate counts by Task Status from the selected records
    const taskStatusCounts = {};
    selectedRows.forEach(r => {
      const status = String(r.task_status || '').trim();
      if (status) {
        taskStatusCounts[status] = (taskStatusCounts[status] || 0) + 1;
      }
    });

    // Cancelled-only totals (2-way KM + amount), computed exactly like the draft cells
    const cancelledRows = selectedRows.filter(
      r => String(r.task_status || '').trim() === 'Cancelled'
    );
    let cancelledTwoWayKm = 0;
    let cancelledTotalAmount = 0;
    cancelledRows.forEach(r => {
      cancelledTwoWayKm += parseFloat(r.two_way_km) || 0;

      // Effective KM priority: typed → pending → saved branch_verified_km → two_way_km
      let km = null;
      const typed = localValues[`${r.id}_branch_verified_km`];
      const pending = pendingKM[r.id];
      if (typed !== undefined && String(typed).trim() !== '') {
        km = parseFloat(typed);
      } else if (pending !== undefined && String(pending).trim() !== '') {
        km = parseFloat(pending);
      } else if (r.branch_verified_km && String(r.branch_verified_km).trim() !== '') {
        km = parseFloat(r.branch_verified_km);
      } else if (r.two_way_km && String(r.two_way_km).trim() !== '') {
        km = parseFloat(r.two_way_km);
      }
      if (km !== null && !isNaN(km)) {
        const da = calculateDAmount(r, km, allRecords) || 0;
        const freight = parseFloat(r.freight_charges || 0) || 0;
        const total = calculateTotalAmountDynamic(r, km, da, allRecords, freight);
        if (total !== null && total !== undefined) cancelledTotalAmount += total;
      }
    });

    // Build status message for confirmation
    let statusMessage = '';
    if (Object.keys(taskStatusCounts).length > 0) {
      statusMessage = '<br/><br/><div style="text-align:left; font-size:13px;"><strong>Task Status Summary:</strong><ul style="margin:5px 0 0 20px;">';
      for (const [status, count] of Object.entries(taskStatusCounts)) {
        statusMessage += `<li><strong>${status}:</strong> ${count}</li>`;
      }
      statusMessage += '</ul>';

      // Show Cancelled totals ONLY when at least one Cancelled record is selected
      if (cancelledRows.length > 0) {
        statusMessage += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
        <strong>Cancelled Records (${cancelledRows.length}):</strong>
        <div style="margin-top:4px;">Total 2 Way KM: <strong>${cancelledTwoWayKm.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        <div>Amount: <strong style="color:#2f3192;">₹${cancelledTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
      </div>`;
      }

      statusMessage += '</div>';
    }

    const result = await Swal.fire({
      title: `Verify ${ids.length} record(s)?`,
      html: `Verified rows move to the Verified tab. KM and remark will be locked.${statusMessage}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2f3192',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, verify',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setVerifyingTadaTemp(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada/temp/verify`, {
        temp_ids: ids,
        branch_code: userBranch,
      });

      // Get the success message from API or use default
      const successMsg = data.message || `Verified ${ids.length} record(s)`;

      // Show success message with task status summary
      await Swal.fire({
        icon: 'success',
        title: 'Verified Successfully!',
        html: `${successMsg}${statusMessage}`,
        confirmButtonColor: '#2f3192',
        timer: 4000,
        timerProgressBar: true,
      });

      // Flip status locally so rows hop to the Verified tab without a refetch
      setAllRecords(prev => prev.map(r =>
        ids.includes(r.id) ? { ...r, verification_status: 'Verified' } : r
      ));
      setTadaSelected({});
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to verify');
    } finally {
      setVerifyingTadaTemp(false);
    }
  };

  const handleUnverifyTadaTemp = async () => {
    const ids = filteredRecords
      .map(r => r.id)
      .filter(id => tadaSelected[id]);

    if (ids.length === 0) {
      toast.error('Select at least one row to unverify');
      return;
    }

    const result = await Swal.fire({
      title: `Unverify ${ids.length} record(s)?`,
      text: 'These rows will move back to Drafts. KM and remark will become editable again.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, unverify',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setUnverifyingTadaTemp(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada/temp/unverify`, {
        temp_ids: ids,
        branch_code: userBranch,
      });
      toast.success(data.message || 'Unverified — moved back to Drafts');
      // Flip status locally so rows return to the Drafts tab without a refetch
      setAllRecords(prev => prev.map(r =>
        ids.includes(r.id) ? { ...r, verification_status: 'Pending' } : r
      ));
      setTadaSelected({});
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to unverify');
    } finally {
      setUnverifyingTadaTemp(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     PRINT — Engineer TADA Report
  ───────────────────────────────────────────────────────────────────────────── */
  const printEngineerTadaReport = (records, engineerName, engineerUid, voucherNo = '') => {
    if (!records || records.length === 0) {
      toast.error('No records to print');
      return;
    }

    // From / To dates from SR Reach at Site
    const dates = records
      .map(r => r.sr_reach_at_site_datetime)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()));
    const fromDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
    const toDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    const fmtDt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
    const fmtDateOnly = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

    // Employee ID — take the first non-empty value from the records
    const employeeId = (records.find(r => r.employee_id && String(r.employee_id).trim() !== '') || {}).employee_id || '-';

    // 2-Way KM priority: branch_verified_km (if non-empty) → two_way_km
    const getRowKm = (r) => {
      if (r.branch_verified_km !== null && r.branch_verified_km !== undefined && String(r.branch_verified_km).trim() !== '') {
        const v = parseFloat(r.branch_verified_km);
        if (!isNaN(v)) return v;
      }
      const t = parseFloat(r.two_way_km);
      return isNaN(t) ? 0 : t;
    };

    // Rate for this row (with HO fallback)
    const getRowRate = (r) => {
      const effectiveBranch = getEffectiveBranchForRecord(r, records);
      const rate = getBranchDARate(effectiveBranch);
      return rate ? (rate.km_rate || 0) : 0;
    };

    // DA for this row (uses the KM from getRowKm)
    const getRowDA = (r) => {
      const km = getRowKm(r);
      const da = calculateDAmount(r, km, records);
      return da || 0;
    };

    // Freight charges for this row
    const getRowFreight = (r) => parseFloat(r.freight_charges || 0) || 0;

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    let grandTotalKm = 0, grandTotalAmount = 0, grandTotalDA = 0, grandTotalFreight = 0;
    const rowsHtml = records.map((r, idx) => {
      const km = getRowKm(r);
      const rate = getRowRate(r);
      const amount = km * rate;
      const da = getRowDA(r);
      const freight = getRowFreight(r);
      const total = amount + da + freight;
      grandTotalKm += km;
      grandTotalAmount += amount;
      grandTotalDA += da;
      grandTotalFreight += freight;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td class="al" contenteditable="true">${escape(r.installation_site_address || '-')}</td>
          <td class="al">${escape(r.account || '-')}</td>
          <td>${escape(r.service_request_no || '-')}</td>
          <td>${escape(r.sr_sub_type || '-')}</td>
          <td>${escape(r.sr_trip_start_datetime || '-')}</td>
          <td>${escape(r.sr_reach_at_site_datetime || '-')}</td>
          <td>${km > 0 ? km.toFixed(2) : '-'}</td>
          <td>${amount > 0 ? '₹' + amount.toFixed(2) : '-'}</td>
          <td>${da > 0 ? '₹' + da.toFixed(2) : '-'}</td>
          <td>${freight > 0 ? '₹' + freight.toFixed(2) : '-'}</td>
          <td>${total > 0 ? '₹' + total.toFixed(2) : '-'}</td>
          <td class="al">${escape(r.km_verification_remark || '-')}</td>
        </tr>
      `;
    }).join('');

    const grandTotal = grandTotalAmount + grandTotalDA + grandTotalFreight;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TADA Report — ${escape(engineerName)}</title>
<style>
    @page { size: A4 landscape; margin: 5mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 6px; color: #000; }
    .company-header {
      text-align: center;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 8px;
      padding: 7px;
      border: 1.5px solid #000;
      background: #f5f5f5;
    }
    .info-table { width: 100%; margin-bottom: 8px; border-collapse: collapse; }
    .info-table td { padding: 5px 7px; font-size: 12px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; width: 14%; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.data th, table.data td {
      border: 1px solid #000;
      padding: 4px 3px;
      text-align: center;
      font-size: 10px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      vertical-align: middle;
    }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; font-size: 10.5px; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
    .print-btn {
      position: fixed; top: 10px; right: 10px;
      padding: 8px 16px; background: #2f3192; color: white;
      border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;
      z-index: 1000;
    }
    .print-btn:hover { background: #1e1f6b; }
    [contenteditable="true"] {
      outline: none;
      cursor: text;
      transition: background 0.15s;
    }
    [contenteditable="true"]:hover {
      background: #fff9c4 !important;
      box-shadow: inset 0 0 0 1px #fbc02d;
    }
    [contenteditable="true"]:focus {
      background: #fff59d !important;
      box-shadow: inset 0 0 0 2px #f57f17;
    }
    .edit-hint {
      position: fixed;
      top: 10px;
      left: 10px;
      padding: 8px 14px;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #f59e0b;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      z-index: 1000;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    @media print {
      .print-btn { display: none; }
      .edit-hint { display: none; }
      [contenteditable="true"]:hover,
      [contenteditable="true"]:focus {
        background: transparent !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="edit-hint">✎ Click "Installation Site Address" cells to edit · Press Print when ready</div>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>

  <div class="company-header">KALA Care Global LLP, ${escape(getBranchLabel(userBranch))}</div>

  <table class="info-table">
    <tr>
      <td class="label">Voucher No. :</td>
      <td>${escape(voucherNo || '-')}</td>
      <td class="label">Service Engineer Name :</td>
      <td>${escape(engineerName)}</td>
      <td class="label">Branch Name:</td>
      <td>${escape(getBranchLabel(userBranch))} (${escape(userBranch)})</td>
    </tr>
    <tr>
      <td class="label">UID:</td>
      <td>${escape(engineerUid || '-')}</td>
      <td class="label">Period :</td>
      <td>${fmtDt(fromDate)} - ${fmtDt(toDate)}</td>
      <td class="label">Employee ID :</td>
      <td>${escape(employeeId)}</td>
    </tr>
  </table>

  <table class="data" style="table-layout:fixed;">
    <colgroup>
      <col style="width:3%;" />
      <col style="width:22%;" />
      <col style="width:12%;" />
      <col style="width:8%;" />
      <col style="width:5%;" />
      <col style="width:8%;" />
      <col style="width:8%;" />
      <col style="width:5%;" />
      <col style="width:6%;" />
      <col style="width:5%;" />
      <col style="width:5%;" />
      <col style="width:6%;" />
      <col style="width:7%;" />
    </colgroup>
    <thead>
      <tr>
        <th>SL.NO</th>
        <th>Installation Site Address</th>
        <th>Account</th>
        <th>Service Request No.</th>
        <th>SR Sub Type</th>
        <th>SR Trip Start Date &amp; Time</th>
        <th>SR Reach at Site Date &amp; Time</th>
        <th>2 Way KM</th>
        <th>Amount (Rate 3/-)</th>
        <th>DA</th>
        <th>Freight</th>
        <th>Total Amount</th>
        <th>Remark</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="7" style="text-align: right;">Grand Total (${records.length} record${records.length === 1 ? '' : 's'}):</td>
        <td>${grandTotalKm.toFixed(2)}</td>
        <td>₹${grandTotalAmount.toFixed(2)}</td>
        <td>₹${grandTotalDA.toFixed(2)}</td>
        <td>₹${grandTotalFreight.toFixed(2)}</td>
        <td>₹${grandTotal.toFixed(2)}</td>
        <td>-</td>
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

  /* ─── PRINT — Voucher Engineer Summary (one row per engineer only) ─── */
  const printVoucherTadaReport = (voucherGroup) => {
    if (!voucherGroup || !voucherGroup.rows || voucherGroup.rows.length === 0) {
      toast.error('No records to print');
      return;
    }
    const voucherNo = voucherGroup.voucher || '-';

    // Group voucher rows by engineer (name + uid) — same shape as the on-screen summary
    const groups = new Map();
    voucherGroup.rows.forEach(r => {
      const name = String(r.service_engineer_name || 'Unknown').trim() || 'Unknown';
      const uid = String(r.service_engineer_uid || '').trim();
      const key = `${name}__${uid}`;
      if (!groups.has(key)) groups.set(key, { name, uid, rows: [] });
      groups.get(key).rows.push(r);
    });
    const engineerGroups = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    const fmtDt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

    const getRowKm = (r) => {
      if (r.branch_verified_km !== null && r.branch_verified_km !== undefined && String(r.branch_verified_km).trim() !== '') {
        const v = parseFloat(r.branch_verified_km);
        if (!isNaN(v)) return v;
      }
      const t = parseFloat(r.two_way_km);
      return isNaN(t) ? 0 : t;
    };
    const getRowAmount = (r) => {
      const eb = getEffectiveBranchForRecord(r, voucherGroup.rows);
      const rate = getBranchDARate(eb);
      const km = getRowKm(r);
      return km * (rate ? (rate.km_rate || 0) : 0);
    };
    const getRowDA = (r) => calculateDAmount(r, getRowKm(r), voucherGroup.rows) || 0;
    const getRowFreight = (r) => parseFloat(r.freight_charges || 0) || 0;

    let gKm = 0, gAmount = 0, gDA = 0, gFreight = 0, gCount = 0, gVerified = 0;

    const rowsHtml = engineerGroups.map((eng, idx) => {
      const dates = eng.rows.map(r => r.sr_reach_at_site_datetime).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
      const fromDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
      const toDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

      let km = 0, amount = 0, da = 0, freight = 0, verified = 0;
      eng.rows.forEach(r => {
        const rKm = getRowKm(r);
        const rAmount = getRowAmount(r);
        const rDA = getRowDA(r);
        const rFreight = getRowFreight(r);
        const rTotal = rAmount + rDA + rFreight;
        km += rKm; amount += rAmount; da += rDA; freight += rFreight;
        if (r.verification_status === 'Verified') verified += rTotal;
      });
      const total = amount + da + freight;
      // Show verified amount when it exists (> 0), else fall back to total
      const displayAmount = verified > 0 ? verified : total;

      gKm += km; gAmount += amount; gDA += da; gFreight += freight; gCount += eng.rows.length;
      gVerified += verified;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${fromDate && toDate ? `${fmtDt(fromDate)} - ${fmtDt(toDate)}` : '-'}</td>
          <td class="al">${escape(eng.name)}</td>
          <td>${escape(eng.uid || '-')}</td>
          <td>${eng.rows.length}</td>
          <td>${displayAmount > 0 ? '₹' + displayAmount.toFixed(2) : '-'}</td>
        </tr>`;
    }).join('');

    const gTotal = gAmount + gDA + gFreight;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TADA Voucher Summary — ${escape(voucherNo)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 10px; color: #000; }
    .company-header { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 10px; padding: 8px; border: 1.5px solid #000; background: #f5f5f5; }
    .info-table { width: 100%; margin-bottom: 10px; border-collapse: collapse; }
    .info-table td { padding: 6px 10px; font-size: 13px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; width: 18%; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.data th, table.data td { border: 1px solid #000; padding: 7px 5px; text-align: center; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; vertical-align: middle; }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; font-size: 13px; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
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
      <td class="label">Voucher No. :</td>
      <td>${escape(voucherNo)}</td>
      <td class="label">Submitted By :</td>
      <td>${escape(voucherGroup.submittedBy || '-')}</td>
    </tr>
    <tr>
      <td class="label">Branch :</td>
      <td>${escape(getBranchLabel(userBranch))} (${escape(userBranch)})</td>
      <td class="label">No. of Engineers :</td>
      <td>${engineerGroups.length}</td>
    </tr>
  </table>
  <table class="data">
    <thead>
      <tr>
        <th style="width:50px;">Sr. No.</th>
        <th style="width:220px;">Period (SR Reach at Site)</th>
        <th>Employee Name</th>
        <th style="width:110px;">UID</th>
        <th style="width:120px;">No. of Activity</th>
        <th style="width:150px;">Total Amount</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right;">Grand Total (${engineerGroups.length} engineer${engineerGroups.length === 1 ? '' : 's'}):</td>
        <td>${gCount}</td>
        <td>₹${(gVerified > 0 ? gVerified : gTotal).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!printWindow) { toast.error('Please allow pop-ups for this site to print'); return; }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  /* ─── PRINT — Sales & BM: single engineer detail ─── */
  const printSalesEngineerReport = (records, engineerName, voucherNo = '') => {
    if (!records || records.length === 0) { toast.error('No records to print'); return; }

    const dates = records.map(r => r.date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
    const fromDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
    const toDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    const fmtDt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

    const uidRec = records.find(r => r.engineer_uid || r.service_engineer_uid) || {};
    const uid = uidRec.engineer_uid || uidRec.service_engineer_uid || '-';
    const employeeId = (records.find(r => r.employee_id && String(r.employee_id).trim() !== '') || {}).employee_id || '-';

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    let gOne = 0, gTwo = 0, gAmt = 0, gDA = 0, gTot = 0, gLab = 0, gPart = 0;
    const rowsHtml = records.map((r, idx) => {
      const one = parseFloat(r.one_way_km) || 0;
      const two = parseFloat(r.two_way_km) || 0;
      const amt = parseFloat(r.amount) || 0;
      const da = parseFloat(r.da) || 0;
      const tot = parseFloat(r.total_amount) || 0;
      const lab = parseFloat(r.labour_sale_expected) || 0;
      const part = parseFloat(r.part_sale_expected) || 0;
      gOne += one; gTwo += two; gAmt += amt; gDA += da; gTot += tot; gLab += lab; gPart += part;
      return `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
        <td>${escape(r.sr_invoice_engine_no || '-')}</td>
        <td class="al">${escape(r.customer_name || '-')}</td>
        <td class="al">${escape(r.location || '-')}</td>
        <td>${one > 0 ? one.toFixed(2) : '-'}</td>
        <td>${two > 0 ? two.toFixed(2) : '-'}</td>
        <td>${amt > 0 ? '₹' + amt.toFixed(2) : '-'}</td>
        <td>${da > 0 ? '₹' + da.toFixed(2) : '-'}</td>
        <td>${tot > 0 ? '₹' + tot.toFixed(2) : '-'}</td>
        <td class="al">${escape(r.work_description || '-')}</td>
        <td>${lab > 0 ? '₹' + lab.toFixed(2) : '-'}</td>
        <td>${part > 0 ? '₹' + part.toFixed(2) : '-'}</td>
        <td class="al" contenteditable="true">${escape(r.remark || '-')}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sales & BM TADA — ${escape(engineerName)}</title>
  <style>
    @page { size: A4 landscape; margin: 5mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 6px; color: #000; }
    .company-header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 8px; padding: 7px; border: 1.5px solid #000; background: #f5f5f5; }
    .info-table { width: 100%; margin-bottom: 8px; border-collapse: collapse; }
    .info-table td { padding: 5px 7px; font-size: 12px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; width: 14%; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.data th, table.data td { border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; vertical-align: middle; }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; font-size: 10.5px; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 16px; background: #2f3192; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; z-index: 1000; }
    .print-btn:hover { background: #1e1f6b; }
    [contenteditable="true"] { outline: none; cursor: text; }
    [contenteditable="true"]:hover { background: #fff9c4 !important; box-shadow: inset 0 0 0 1px #fbc02d; }
    [contenteditable="true"]:focus { background: #fff59d !important; box-shadow: inset 0 0 0 2px #f57f17; }
    .edit-hint { position: fixed; top: 10px; left: 10px; padding: 8px 14px; background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; border-radius: 4px; font-size: 11px; font-weight: bold; z-index: 1000; }
    @media print { .print-btn, .edit-hint { display: none; } [contenteditable="true"]:hover, [contenteditable="true"]:focus { background: transparent !important; box-shadow: none !important; } }
  </style>
</head>
<body>
  <div class="edit-hint">✎ Click "Remark" cells to edit · Press Print when ready</div>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>

  <div class="company-header">KALA Care Global LLP, ${escape(getBranchLabel(userBranch))}</div>

  <table class="info-table">
    <tr>
      <td class="label">Voucher No. :</td><td>${escape(voucherNo || '-')}</td>
      <td class="label">Engineer Name :</td><td>${escape(engineerName)}</td>
      <td class="label">Branch Name:</td><td>${escape(getBranchLabel(userBranch))} (${escape(userBranch)})</td>
    </tr>
    <tr>
      <td class="label">UID:</td><td>${escape(uid)}</td>
      <td class="label">Period :</td><td>${fmtDt(fromDate)} - ${fmtDt(toDate)}</td>
      <td class="label">Employee ID :</td><td>${escape(employeeId)}</td>
    </tr>
  </table>

  <table class="data">
    <colgroup>
      <col style="width:3%;" /><col style="width:7%;" /><col style="width:9%;" /><col style="width:11%;" />
      <col style="width:9%;" /><col style="width:5%;" /><col style="width:5%;" /><col style="width:6%;" />
      <col style="width:5%;" /><col style="width:6%;" /><col style="width:13%;" /><col style="width:6%;" />
      <col style="width:5%;" /><col style="width:10%;" />
    </colgroup>
    <thead>
      <tr>
        <th>Sr.No.</th><th>Date</th><th>SR/Invoice/Engine</th><th>Customer Name</th><th>Location</th>
        <th>1 Way KM</th><th>2 Way KM</th><th>Amount</th><th>DA</th><th>Total Amount</th>
        <th>Work Description</th><th>Labour Sale Exp.</th><th>Part Sale Exp.</th><th>Remark</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:right;">Grand Total (${records.length} record${records.length === 1 ? '' : 's'}):</td>
        <td>${gOne.toFixed(2)}</td>
        <td>${gTwo.toFixed(2)}</td>
        <td>₹${gAmt.toFixed(2)}</td>
        <td>₹${gDA.toFixed(2)}</td>
        <td>₹${gTot.toFixed(2)}</td>
        <td>-</td>
        <td>₹${gLab.toFixed(2)}</td>
        <td>₹${gPart.toFixed(2)}</td>
        <td>-</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1400,height=900');
    if (!w) { toast.error('Please allow pop-ups for this site to print'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ─── PRINT — Sales & BM: voucher summary (one row per engineer) ─── */
  const printSalesVoucherReport = (voucherGroup) => {
    if (!voucherGroup || !voucherGroup.rows || voucherGroup.rows.length === 0) { toast.error('No records to print'); return; }
    const voucherNo = voucherGroup.voucher || '-';
    const engineerGroups = groupSalesByEngineer(voucherGroup.rows);

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    const fmtDt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

    let gCount = 0, gTotal = 0, gVerified = 0;
    const rowsHtml = engineerGroups.map((g, idx) => {
      gCount += g.records.length; gTotal += g.totalAmount; gVerified += g.verifiedAmount;
      const display = g.verifiedAmount > 0 ? g.verifiedAmount : g.totalAmount;
      return `
      <tr>
        <td>${idx + 1}</td>
        <td>${g.periodStart && g.periodEnd ? `${fmtDt(g.periodStart)} - ${fmtDt(g.periodEnd)}` : '-'}</td>
        <td class="al">${escape(g.engineerName)}</td>
        <td>${g.records.length}</td>
        <td>${display > 0 ? '₹' + display.toFixed(2) : '-'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sales & BM TADA Voucher Summary — ${escape(voucherNo)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 10px; color: #000; }
    .company-header { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 10px; padding: 8px; border: 1.5px solid #000; background: #f5f5f5; }
    .info-table { width: 100%; margin-bottom: 10px; border-collapse: collapse; }
    .info-table td { padding: 6px 10px; font-size: 13px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; width: 18%; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.data th, table.data td { border: 1px solid #000; padding: 7px 5px; text-align: center; font-size: 13px; word-wrap: break-word; vertical-align: middle; }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
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
      <td class="label">Voucher No. :</td><td>${escape(voucherNo)}</td>
      <td class="label">Submitted By :</td><td>${escape(voucherGroup.submittedBy || '-')}</td>
    </tr>
    <tr>
      <td class="label">Branch :</td><td>${escape(getBranchLabel(userBranch))} (${escape(userBranch)})</td>
      <td class="label">No. of Engineers :</td><td>${engineerGroups.length}</td>
    </tr>
  </table>
  <table class="data">
    <thead>
      <tr>
        <th style="width:50px;">Sr. No.</th>
        <th style="width:220px;">Period (Date)</th>
        <th>Engineer Name</th>
        <th style="width:120px;">No. of Activity</th>
        <th style="width:150px;">Total Amount</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;">Grand Total (${engineerGroups.length} engineer${engineerGroups.length === 1 ? '' : 's'}):</td>
        <td>${gCount}</td>
        <td>₹${(gVerified > 0 ? gVerified : gTotal).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1400,height=900');
    if (!w) { toast.error('Please allow pop-ups for this site to print'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ─── PRINT — Bill Wise: voucher summary (one row per engineer/customer) ─── */
  const printBillWiseVoucherReport = (voucherGroup) => {
    if (!voucherGroup || !voucherGroup.rows || voucherGroup.rows.length === 0) { toast.error('No records to print'); return; }
    const voucherNo = voucherGroup.voucher || '-';
    const engineerGroups = groupBillWiseByEngineer(voucherGroup.rows);

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    const fmtDt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

    let gCount = 0, gTotal = 0, gVerified = 0;
    const rowsHtml = engineerGroups.map((g, idx) => {
      gCount += g.records.length; gTotal += g.totalAmount; gVerified += g.verifiedAmount;
      const display = g.verifiedAmount > 0 ? g.verifiedAmount : g.totalAmount;
      return `
      <tr>
        <td>${idx + 1}</td>
        <td>${g.periodStart && g.periodEnd ? `${fmtDt(g.periodStart)} - ${fmtDt(g.periodEnd)}` : '-'}</td>
        <td class="al">${escape(g.engineerName)}</td>
        <td>${g.records.length}</td>
        <td>${display > 0 ? '₹' + display.toFixed(2) : '-'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill Wise Voucher Summary — ${escape(voucherNo)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 0; padding: 10px; color: #000; }
    .company-header { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 10px; padding: 8px; border: 1.5px solid #000; background: #f5f5f5; }
    .info-table { width: 100%; margin-bottom: 10px; border-collapse: collapse; }
    .info-table td { padding: 6px 10px; font-size: 13px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; width: 18%; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.data th, table.data td { border: 1px solid #000; padding: 7px 5px; text-align: center; font-size: 13px; word-wrap: break-word; vertical-align: middle; }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
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
      <td class="label">Voucher No. :</td><td>${escape(voucherNo)}</td>
      <td class="label">Submitted By :</td><td>${escape(voucherGroup.submittedBy || '-')}</td>
    </tr>
    <tr>
      <td class="label">Branch :</td><td>${escape(getBranchLabel(userBranch))} (${escape(userBranch)})</td>
      <td class="label">No. of Records :</td><td>${engineerGroups.length}</td>
    </tr>
  </table>
  <table class="data">
    <thead>
      <tr>
        <th style="width:50px;">Sr. No.</th>
        <th style="width:200px;">Period (Date)</th>
        <th>Engineer / Customer</th>
        <th style="width:120px;">No. of Activity</th>
        <th style="width:150px;">Total Amount</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;">Grand Total (${engineerGroups.length} record${engineerGroups.length === 1 ? '' : 's'}):</td>
        <td>${gCount}</td>
        <td>₹${(gVerified > 0 ? gVerified : gTotal).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1400,height=900');
    if (!w) { toast.error('Please allow pop-ups for this site to print'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ─── PRINT — Bill Wise: single engineer/customer detail ─── */
  const printBillWiseEngineerReport = (records, engineerName, voucherNo = '') => {
    if (!records || records.length === 0) { toast.error('No records to print'); return; }
    const isBM = (records[0]?.entry_type) === 'BM';

    const dates = records.map(r => r.date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
    const fromDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
    const toDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    const fmtDt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    const money = v => v && parseFloat(v) !== 0 ? '₹' + parseFloat(v).toFixed(2) : '-';

    let gTotal = 0;
    const rowsHtml = records.map((r, idx) => {
      gTotal += parseFloat(r.amount || 0) || 0;
      if (isBM) {
        return `
        <tr>
          <td>${idx + 1}</td>
          <td>${r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
          <td class="al">${escape(r.customer_name || '-')}</td>
          <td>${escape(r.sr_invoice_engine_no || '-')}</td>
          <td class="al" contenteditable="true">${escape(r.installation_site_address || '-')}</td>
          <td>${escape(r.expenses_head || '-')}</td>
          <td>${money(r.amount)}</td>
          <td class="al">${escape(r.work_description || '-')}</td>
          <td class="al">${escape(r.remark || '-')}</td>
        </tr>`;
      }
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
          <td>${escape(r.service_request_no || '-')}</td>
          <td class="al">${escape(r.account || '-')}</td>
          <td class="al" contenteditable="true">${escape(r.installation_site_address || '-')}</td>
          <td>${escape(r.sr_type || '-')}</td>
          <td>${escape(r.expenses_head || '-')}</td>
          <td>${money(r.amount)}</td>
          <td class="al">${escape(r.work_description || '-')}</td>
        </tr>`;
    }).join('');

    const empId = (records.find(r => r.employee_id && String(r.employee_id).trim() !== '') || {}).employee_id || '-';
    const uid = (records.find(r => r.service_engineer_uid && String(r.service_engineer_uid).trim() !== '') || {}).service_engineer_uid || '-';

    const headHtml = isBM
      ? `<th>Sr.No.</th><th>Date</th><th>Customer Name</th><th>SR No. / Inv / Engine</th><th>Location</th><th>Expense Head</th><th>Amount</th><th>Work Description</th><th>Remark</th>`
      : `<th>Sr.No.</th><th>Date</th><th>SR No.</th><th>Account</th><th>Installation Site Address</th><th>SR Type</th><th>Expense Head</th><th>Amount</th><th>Work Description</th>`;
    const footColspan = isBM ? 6 : 7;
    const footTail = isBM ? 2 : 1;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill Wise — ${escape(engineerName)}</title>
  <style>
    @page { size: A4 landscape; margin: 5mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 6px; color: #000; }
    .company-header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 8px; padding: 7px; border: 1.5px solid #000; background: #f5f5f5; }
    .info-table { width: 100%; margin-bottom: 8px; border-collapse: collapse; }
    .info-table td { padding: 5px 7px; font-size: 12px; border: 1px solid #666; }
    .info-table .label { font-weight: bold; background: #ececec; width: 14%; }
    table.data { width: 100%; border-collapse: collapse; }
    table.data th, table.data td { border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 10px; word-wrap: break-word; overflow-wrap: break-word; vertical-align: middle; }
    table.data td.al { text-align: left; }
    table.data th { background: #c5c5c5; font-weight: bold; font-size: 10.5px; }
    table.data tfoot td { font-weight: bold; background: #e8e8e8; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 16px; background: #2f3192; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; z-index: 1000; }
    .print-btn:hover { background: #1e1f6b; }
    [contenteditable="true"] { outline: none; cursor: text; transition: background 0.15s; }
    [contenteditable="true"]:hover { background: #fff9c4 !important; box-shadow: inset 0 0 0 1px #fbc02d; }
    [contenteditable="true"]:focus { background: #fff59d !important; box-shadow: inset 0 0 0 2px #f57f17; }
    .edit-hint { position: fixed; top: 10px; left: 10px; padding: 8px 14px; background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; border-radius: 4px; font-size: 11px; font-weight: bold; z-index: 1000; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    @media print { .print-btn, .edit-hint { display: none; } [contenteditable="true"]:hover, [contenteditable="true"]:focus { background: transparent !important; box-shadow: none !important; } }
  </style>
</head>
<body>
  <div class="edit-hint">✎ Click the "${isBM ? 'Location' : 'Installation Site Address'}" cells to edit · Press Print when ready</div>
  <button class="print-btn" onclick="window.print()">🖨 Print</button>

  <div class="company-header">KALA Care Global LLP, ${escape(getBranchLabel(userBranch))}</div>

  <table class="info-table">
    <tr>
      <td class="label">Voucher No. :</td><td>${escape(voucherNo || '-')}</td>
      <td class="label">${isBM ? 'Customer / Employee' : 'Engineer Name'} :</td><td>${escape(engineerName)}</td>
      <td class="label">Branch Name:</td><td>${escape(getBranchLabel(userBranch))} (${escape(userBranch)})</td>
    </tr>
    <tr>
      <td class="label">UID:</td><td>${escape(uid)}</td>
      <td class="label">Period :</td><td>${fmtDt(fromDate)} - ${fmtDt(toDate)}</td>
      <td class="label">Employee ID :</td><td>${escape(empId)}</td>
    </tr>
  </table>

  <table class="data" style="table-layout:fixed;">
    <colgroup>
      ${isBM
        ? `<col style="width:4%;" /><col style="width:8%;" /><col style="width:14%;" /><col style="width:13%;" /><col style="width:20%;" /><col style="width:11%;" /><col style="width:8%;" /><col style="width:13%;" /><col style="width:9%;" />`
        : `<col style="width:4%;" /><col style="width:8%;" /><col style="width:10%;" /><col style="width:13%;" /><col style="width:16%;" /><col style="width:9%;" /><col style="width:13%;" /><col style="width:8%;" /><col style="width:19%;" />`
      }
    </colgroup>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="${footColspan}" style="text-align:right;">Grand Total (${records.length} record${records.length === 1 ? '' : 's'}):</td>
        <td>₹${gTotal.toFixed(2)}</td>
        <td colspan="${footTail}"></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1400,height=900');
    if (!w) { toast.error('Please allow pop-ups for this site to print'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const filteredRecords = useMemo(() => {
    let records = allRecords;

    if (!isAdmin && userBranch) {
      records = records.filter(r =>
        String(r.branch_code || '').trim() === userBranch
      );
    }

    // ── Filter by branch-level verification_status based on sub-tab ──
    if (tadaSubTab === 'drafts') {
      records = records.filter(r => (r.verification_status || 'Pending') !== 'Verified');
    } else if (tadaSubTab === 'verified') {
      records = records.filter(r => r.verification_status === 'Verified');
    }

    // ── Engineer filter ──
    if (selectedEngineer) {
      records = records.filter(r =>
        String(r.service_engineer_name || '').trim() === selectedEngineer
      );
    }

    // ── Drill-in engineer filter (Verified / Submitted tabs) ──
    if (drillInEngineer) {
      records = records.filter(r =>
        String(r.service_engineer_name || '').trim() === drillInEngineer.name &&
        String(r.service_engineer_uid || '').trim() === drillInEngineer.uid
      );
    }

    // Task Status filter (Excel-style)
    if (mainTaskStatusFilter.size > 0) {
      records = records.filter(r =>
        mainTaskStatusFilter.has(String(r.task_status || '').trim())
      );
    }

    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      records = records.filter(r =>
        String(r.appointment_number || '').toLowerCase().includes(q) ||
        String(r.sd_branch_name || '').toLowerCase().includes(q) ||
        String(r.sd_branch_code || '').toLowerCase().includes(q) ||
        String(r.instance_id || '').toLowerCase().includes(q) ||
        String(r.engine_serial_number || '').toLowerCase().includes(q) ||
        String(r.account || '').toLowerCase().includes(q) ||
        String(r.account_id || '').toLowerCase().includes(q) ||
        String(r.service_request_no || '').toLowerCase().includes(q) ||
        String(r.service_engineer_name || '').toLowerCase().includes(q) ||
        String(r.service_engineer_uid || '').toLowerCase().includes(q) ||
        String(r.customer_name || '').toLowerCase().includes(q) ||
        String(r.customer_contact_number || '').toLowerCase().includes(q) ||
        String(r.voc || '').toLowerCase().includes(q) ||
        String(r.uploaded_by || '').toLowerCase().includes(q)
      );
    }

    return records;
  }, [allRecords, isAdmin, userBranch, debouncedSearch, selectedEngineer, tadaSubTab, drillInEngineer, mainTaskStatusFilter]);

  /* ─── Engineer list for current branch (for dropdown) ──────────────────────── */
  /* Source = drafts when on Drafts tab, submitted when on Submitted tab        */
  const branchEngineers = useMemo(() => {
    // Pick the right source based on which sub-tab is active
    const sourceRecords = tadaSubTab === 'submitted'
      ? (submittedRecords || [])
      : allRecords;

    let records = sourceRecords;
    if (!isAdmin && userBranch) {
      records = records.filter(r =>
        String(r.branch_code || '').trim() === userBranch
      );
    }
    const engMap = new Map();
    records.forEach(r => {
      const name = String(r.service_engineer_name || '').trim();
      if (name) {
        const uid = String(r.service_engineer_uid || '').trim();
        const key = `${name}__${uid}`;
        if (!engMap.has(key)) engMap.set(key, { name, uid });
      }
    });
    return Array.from(engMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRecords, submittedRecords, tadaSubTab, isAdmin, userBranch]);

  /* ─── Stats for selected engineer (or whole branch by default) ─────────────── */
  const engineerStats = useMemo(() => {
    let records = allRecords;
    if (!isAdmin && userBranch) {
      records = records.filter(r =>
        String(r.branch_code || '').trim() === userBranch
      );
    }
    if (selectedEngineer) {
      records = records.filter(r =>
        String(r.service_engineer_name || '').trim() === selectedEngineer
      );
    }

    // Total 2-way KM
    const totalTwoWayKm = records.reduce(
      (sum, r) => sum + (parseFloat(r.two_way_km) || 0),
      0
    );

    // Start / End date based on SR Reach at Site Date & Time
    const reachDates = records
      .map(r => r.sr_reach_at_site_datetime)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()));

    let startDate = null;
    let endDate = null;
    if (reachDates.length > 0) {
      startDate = new Date(Math.min(...reachDates.map(d => d.getTime())));
      endDate = new Date(Math.max(...reachDates.map(d => d.getTime())));
    }

    return {
      count: records.length,
      totalTwoWayKm,
      startDate,
      endDate,
    };
  }, [allRecords, isAdmin, userBranch, selectedEngineer]);

  const isUploadAllowed = () => {
    if (isAdmin) return true; // master_admin and it_admin always allowed

    // Use DB-driven rule if loaded; else fall back to hardcoded defaults
    if (submitRule && Array.isArray(submitRule.allowed_values)) {
      const now = new Date();
      if (submitRule.rule_type === 'weekdays') {
        return submitRule.allowed_values.includes(now.getDay());
      } else if (submitRule.rule_type === 'month_dates') {
        return submitRule.allowed_values.includes(now.getDate());
      }
    }

    // Fallback (only runs if rule hasn't loaded yet)
    const now = new Date();
    const day = now.getDay();
    const date = now.getDate();
    const groupA = ['420435_3', '420435_1', '420435_2', '420435_6', '420435_4', '420435_5', '420435_7'];
    if (groupA.includes(userBranch)) {
      return day === 1 || day === 2;
    }
    return [1, 2, 3, 16, 17, 18].includes(date);
  };

  const getUploadRestrictionMessage = () => {
    if (submitRule && Array.isArray(submitRule.allowed_values) && submitRule.allowed_values.length) {
      if (submitRule.rule_type === 'weekdays') {
        const names = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
        const days = submitRule.allowed_values.map(v => names[v] || v).join(', ');
        return `Submit is only allowed on: ${days}.`;
      } else if (submitRule.rule_type === 'month_dates') {
        const dates = [...submitRule.allowed_values].sort((a, b) => a - b).join(', ');
        return `Submit is only allowed on dates: ${dates} of each month.`;
      }
    }

    // Fallback
    const groupA = ['420435_3', '420435_1', '420435_2', '420435_6', '420435_4', '420435_5', '420435_7'];
    if (groupA.includes(userBranch)) {
      return 'Submit is only allowed on Monday and Tuesday.';
    }
    return 'Submit is only allowed on dates 1, 2, 3, 16, 17 and 18 of each month.';
  };

  /* ── Dual-scrollbar sync ── */
  useEffect(() => {
    const main = tableContainerRef.current;
    const top = topScrollBarRef.current;
    if (!main || !top) return;
    const onMain = () => { top.scrollLeft = main.scrollLeft; };
    const onTop = () => { main.scrollLeft = top.scrollLeft; };
    main.addEventListener('scroll', onMain);
    top.addEventListener('scroll', onTop);
    return () => {
      main.removeEventListener('scroll', onMain);
      top.removeEventListener('scroll', onTop);
    };
  });

  /* ── Date formatters ── */
  const fmtDate = v => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  const fmtDT = v => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

  // Group records by voucher_no → one row per voucher (uses submittedTotalAmounts for SE).
  const buildVoucherGroups = (records, amountResolver) => {
    const m = new Map();
    (records || []).forEach(r => {
      const v = r.voucher_no || 'No Voucher';
      if (!m.has(v)) m.set(v, {
        voucher: v,
        submittedBy: r.uploaded_by || r.created_by || '-',
        rows: [], total: 0, verified: 0, start: null, end: null,
      });
      const g = m.get(v);
      g.rows.push(r);
      const amt = amountResolver(r);
      g.total += amt;
      if (r.verification_status === 'Verified') g.verified += amt;
      const d = r.sr_reach_at_site_datetime ? new Date(r.sr_reach_at_site_datetime) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.start || d < g.start) g.start = d;
        if (!g.end || d > g.end) g.end = d;
      }
    });
    return Array.from(m.values()).sort((a, b) => String(b.voucher).localeCompare(String(a.voucher)));
  };

  // Voucher groups keyed on r.date (Sales / Bill Wise). amountResolver(r) → number.
  const buildVoucherGroupsByDate = (records, amountResolver) => {
    const m = new Map();
    (records || []).forEach(r => {
      const v = r.voucher_no || 'No Voucher';
      if (!m.has(v)) m.set(v, {
        voucher: v,
        submittedBy: r.uploaded_by || r.created_by || '-',
        rows: [], total: 0, verified: 0, start: null, end: null,
      });
      const g = m.get(v);
      g.rows.push(r);
      const amt = amountResolver(r);
      g.total += amt;
      if (r.verification_status === 'Verified') g.verified += amt;
      const d = r.date ? new Date(r.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.start || d < g.start) g.start = d;
        if (!g.end || d > g.end) g.end = d;
      }
    });
    return Array.from(m.values()).sort((a, b) => String(b.voucher).localeCompare(String(a.voucher)));
  };

  // Group Sales rows by engineer (same shape as salesPeriodGroups).
  const groupSalesByEngineer = (rows) => {
    const groups = new Map();
    (rows || []).forEach(rec => {
      const eng = String(rec.engineer_name || 'Unknown').trim() || 'Unknown';
      if (!groups.has(eng)) groups.set(eng, {
        key: eng, engineerName: eng, entryType: rec.entry_type || 'SE',
        periodStart: null, periodEnd: null, records: [],
        totalKm: 0, totalAmount: 0, verifiedAmount: 0, verifiedCount: 0,
      });
      const g = groups.get(eng);
      g.records.push(rec);
      const d = rec.date ? new Date(rec.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.periodStart || d < g.periodStart) g.periodStart = d;
        if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      }
      g.totalKm += parseFloat(rec.two_way_km || 0) || 0;
      const amt = parseFloat(rec.total_amount || 0) || 0;
      g.totalAmount += amt;
      if (rec.verification_status === 'Verified') { g.verifiedAmount += amt; g.verifiedCount += 1; }
    });
    return Array.from(groups.values()).sort((a, b) => a.engineerName.localeCompare(b.engineerName));
  };

  // Group Bill Wise rows by engineer/customer (same shape as billWisePeriodGroups).
  const groupBillWiseByEngineer = (rows) => {
    const groups = new Map();
    (rows || []).forEach(rec => {
      const isBM = rec.entry_type === 'BM';
      const eng = String((isBM ? rec.created_by : rec.engineer_name) || 'Unknown').trim() || 'Unknown';
      const key = `${rec.entry_type || 'SE'}__${eng}`;
      if (!groups.has(key)) groups.set(key, {
        key, engineerName: eng, entryType: rec.entry_type || 'SE',
        periodStart: null, periodEnd: null, records: [],
        totalAmount: 0, verifiedAmount: 0, verifiedCount: 0,
      });
      const g = groups.get(key);
      g.records.push(rec);
      const d = rec.date ? new Date(rec.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.periodStart || d < g.periodStart) g.periodStart = d;
        if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      }
      const amt = parseFloat(rec.amount || 0) || 0;
      g.totalAmount += amt;
      if (rec.verification_status === 'Verified') { g.verifiedAmount += amt; g.verifiedCount += 1; }
    });
    return Array.from(groups.values()).sort((a, b) => a.engineerName.localeCompare(b.engineerName));
  };

  // Combos {Employee ID + SR No. + Appointment No.} that already have a
  // Bill Wise (Service Engineer) entry. Such TADA drafts must NOT be verified.
  const billWiseSeBlockedCombos = useMemo(() => {
    const set = new Set();
    // Currently-loaded SE drafts → immediate reflection right after a new save
    (billWiseDrafts || []).forEach(r => {
      if ((r.entry_type || 'SE') !== 'SE') return;
      const k = `${String(r.employee_id || '').trim()}__${String(r.service_request_no || '').trim()}__${String(r.appointment_number || '').trim()}`;
      set.add(k);
    });
    // Persisted combos across temp + main + history → block stays even after
    // the Bill Wise record is submitted to HO / moved to history. Only deleting
    // the Bill Wise record removes its combo, which unblocks the TADA draft.
    (billWiseBlockedCombos || []).forEach(k => set.add(k));
    return set;
  }, [billWiseDrafts, billWiseBlockedCombos]);

  const isRecordBlockedByBillWise = useCallback((record) => {
    if (!record) return false;
    const k = `${String(record.employee_id || '').trim()}__${String(record.service_request_no || '').trim()}__${String(record.appointment_number || '').trim()}`;
    return billWiseSeBlockedCombos.has(k);
  }, [billWiseSeBlockedCombos]);

  const renderCell = (record, key, idx) => {
    if (key === 'select') {
      const blocked = tadaSubTab === 'drafts' && isRecordBlockedByBillWise(record);
      return (
        <div className="flex justify-center">
          <input
            type="checkbox"
            disabled={blocked}
            checked={!blocked && !!tadaSelected[record.id]}
            onChange={e => {
              if (blocked) return;
              setTadaSelected(prev => ({ ...prev, [record.id]: e.target.checked }));
            }}
            className={blocked ? 'cursor-not-allowed opacity-40' : ''}
            title={blocked ? 'Blocked — a Bill Wise (Service Engineer) entry already exists for this record' : undefined}
          />
        </div>
      );
    }
    if (key === 'actions') {
      return (
        <div className="flex justify-center">
          <button
            onClick={() => handleDeleteTadaRow(record.id)}
            className="text-red-600 hover:text-red-800"
            title="Remove row"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      );
    }
    if (key === 'sr_no') {
      return <div className="text-[11px] truncate text-center">{idx + 1}</div>;
    }

    const val = record[key];
    const q = debouncedSearch.trim();
    const isVerified = record.verification_status === 'Verified';
    const localKey = `${record.id}_${key}`;
    const localValue = localValues[localKey];
    const displayValue = localValue !== undefined ? localValue : (val || '');

    if (editingCell?.id === record.id && editingCell?.field === key) {
      return (
        <div className="px-1">
          <input
            type={key === 'branch_verified_km' ? 'number' : 'text'}
            value={editInputValue}
            onChange={(e) => setEditInputValue(e.target.value)}
            onBlur={handleEditSave}
            onKeyDown={handleEditKeyPress}
            className="w-full px-1 py-0.5 text-[11px] border rounded focus:outline-none focus:ring-1"
            style={{ borderColor: themeColor, outline: 'none' }}
            autoFocus
            step={key === 'branch_verified_km' ? '0.01' : undefined}
          />
        </div>
      );
    }

    // Branch Verified KM column
    if (key === 'branch_verified_km') {
      if (isVerified) {
        return (
          <div className="text-[11px] truncate text-center font-medium text-gray-700">
            {displayValue || '-'}
          </div>
        );
      }
      return (
        <div className="px-0">
          <input
            type="number"
            value={displayValue}
            onChange={(e) => handleLocalValueChange(record.id, key, e.target.value)}
            onBlur={(e) => handleSaveValue(record.id, key, e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSaveValue(record.id, key, e.target.value);
              }
            }}
            className="w-full px-1 py-0.5 text-[11px] border rounded focus:outline-none focus:ring-1"
            style={{ borderColor: themeColor, outline: 'none' }}
            step="0.01"
            placeholder="Enter KM"
          />
        </div>
      );
    }

    // KM Verification Remark column
    if (key === 'km_verification_remark') {
      if (isVerified) {
        return (
          <div className="text-[11px] truncate text-left text-gray-700" title={displayValue || '-'}>
            {displayValue || '-'}
          </div>
        );
      }
      return (
        <div className="px-0">
          <input
            type="text"
            value={displayValue}
            onChange={(e) => handleLocalValueChange(record.id, key, e.target.value)}
            onBlur={(e) => handleSaveValue(record.id, key, e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSaveValue(record.id, key, e.target.value);
              }
            }}
            className="w-full px-1 py-0.5 text-[11px] border rounded focus:outline-none focus:ring-1"
            style={{ borderColor: themeColor, outline: 'none' }}
            placeholder="Enter remark"
          />
        </div>
      );
    }

    // Freight Charges column
    if (key === 'freight_charges') {
      if (isVerified) {
        return (
          <div className="text-[11px] truncate text-center font-medium text-gray-700">
            {displayValue && parseFloat(displayValue) !== 0
              ? `₹${parseFloat(displayValue).toFixed(2)}`
              : '-'}
          </div>
        );
      }
      return (
        <div className="px-0">
          <input
            type="number"
            value={displayValue}
            onChange={(e) => handleLocalValueChange(record.id, key, e.target.value)}
            onBlur={(e) => handleSaveValue(record.id, key, e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleSaveValue(record.id, key, e.target.value);
            }}
            className="w-full px-1 py-0.5 text-[11px] border rounded focus:outline-none focus:ring-1"
            style={{ borderColor: themeColor, outline: 'none' }}
            step="0.01"
            placeholder="Enter ₹"
          />
        </div>
      );
    }

    // ─── Frontend-only computed columns: KM Rate / DA / Total ───────────────
    // Priority: currently typing → pending (held) → saved branch_verified_km → two_way_km (default)
    // NOTE: These are NOT saved to backend. Only shown so branch admin sees the amount live.
    const getDraftEffectiveKM = () => {
      const typed = localValues[`${record.id}_branch_verified_km`];
      if (typed !== undefined && String(typed).trim() !== '') {
        const v = parseFloat(typed);
        if (!isNaN(v)) return v;
      }
      const pending = pendingKM[record.id];
      if (pending !== undefined && String(pending).trim() !== '') {
        const v = parseFloat(pending);
        if (!isNaN(v)) return v;
      }
      if (record.branch_verified_km && String(record.branch_verified_km).trim() !== '') {
        const v = parseFloat(record.branch_verified_km);
        if (!isNaN(v)) return v;
      }
      if (record.two_way_km && String(record.two_way_km).trim() !== '') {
        const v = parseFloat(record.two_way_km);
        if (!isNaN(v)) return v;
      }
      return null;
    };

    if (key === 'km_rate') {
      const effBranch = getEffectiveBranchForRecord(record, allRecords);
      const rate = getBranchDARate(effBranch);
      if (!rate || !rate.km_rate) {
        return <div className="text-[11px] text-center text-gray-400">-</div>;
      }
      return (
        <div className="text-[11px] text-center font-semibold text-gray-700">
          ₹{rate.km_rate.toFixed(2)}
        </div>
      );
    }

    if (key === 'da_amount') {
      const km = getDraftEffectiveKM();
      const da = calculateDAmount(record, km, allRecords);
      if (da === null || da === undefined || da === 0) {
        return <div className="text-[11px] text-center text-gray-400">-</div>;
      }
      return (
        <div className="text-[11px] text-center font-semibold text-green-700">
          ₹{da.toFixed(2)}
        </div>
      );
    }

    if (key === 'total_amount') {
      const km = getDraftEffectiveKM();
      const da = calculateDAmount(record, km, allRecords) || 0;
      const typedFreight = localValues[`${record.id}_freight_charges`];
      const freightVal = typedFreight !== undefined ? typedFreight : record.freight_charges;
      const total = calculateTotalAmountDynamic(record, km, da, allRecords, freightVal);
      if (total === null || total === undefined || total === 0) {
        return <div className="text-[11px] text-center text-gray-400">-</div>;
      }
      return (
        <div className="text-[11px] text-center font-bold text-blue-700">
          ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      );
    }

    // Regular cell rendering
    if (key === 'sr_status') {
      const v = val || '-';
      return (
        <div className="flex justify-center">
          <span className={`px-1.5 py-0.5 rounded-full text-[9px] whitespace-nowrap ${v === 'Closed' ? 'text-black' : 'text-black'}`}>
            {v}
          </span>
        </div>
      );
    }
    if (key === 'uploaded_at') {
      const formatted = fmtDT(val);
      return <div className="text-[11px] truncate text-center" title={formatted}>{formatted}</div>;
    }
    if (key === 'sr_due_date' || key === 'sr_closed_date') {
      const formatted = fmtDate(val);
      return <div className="text-[11px] truncate text-center" title={formatted}>{formatted}</div>;
    }

    // Checkbox for verification status column
    if (key === 'verification_status') {
      const isVerified = record.verification_status === 'Verified';
      return (
        <div className="flex justify-center">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${isVerified
            ? 'bg-green-100 text-green-800'
            : 'bg-yellow-100 text-yellow-800'
            }`}>
            {record.verification_status || 'Pending'}
          </span>
        </div>
      );
    }

    const str = val !== null && val !== undefined ? String(val) : '';
    const displayStr = str || '-';

    if (q && SEARCHABLE_KEYS.has(key)) {
      return (
        <div className="text-[11px] truncate text-center" title={displayStr}>
          <Highlight text={str} query={q} />
        </div>
      );
    }
    return <div className="text-[11px] truncate text-center" title={displayStr}>{displayStr}</div>;
  };

  /* ── Total table width for top scrollbar phantom ── */
  const totalTableWidth = columnOrder.reduce((s, k) => s + (COL_MAP[k]?.width || 120), 0);

  const getBranchLabel = c => BRANCH_MAP[c] || c || 'No Branch';
  const getRoleLabel = () => ({ master_admin: 'Master Admin', it_admin: 'IT Admin', branch_admin: 'Branch Admin', employee: 'Employee' }[user?.role] || 'User');

  /* ─── Effective KM rate for the current user's branch (with HO fallback) ──── */
  const myBranchRateInfo = useMemo(() => {
    if (!userBranch || Object.keys(kmRates).length === 0) return null;

    const pick = (code) => {
      const r = kmRates[code];
      if (!r) return null;
      const km_rate = parseFloat(r.km_rate) || 0;
      const range_amount = parseFloat(r.range_amount) || 0;
      const above_amount = parseFloat(r.above_amount) || 0;
      if (km_rate === 0 && range_amount === 0 && above_amount === 0) return null;
      return {
        km_rate,
        range_start_km: r.range_start_km != null ? parseFloat(r.range_start_km) : null,
        range_end_km: r.range_end_km != null ? parseFloat(r.range_end_km) : null,
        range_amount,
        above_km: r.above_km != null ? parseFloat(r.above_km) : null,
        above_amount,
      };
    };

    // Try the user's own branch first; if no rate is configured, fall back to HO
    const own = pick(userBranch);
    if (own) return { source: userBranch, sourceLabel: getBranchLabel(userBranch), ...own };
    const ho = pick('HO');
    if (ho) return { source: 'HO', sourceLabel: 'HO (fallback)', ...ho };
    return null;
  }, [kmRates, userBranch]);

  /* ─── Sales grouping (by engineer name, date range min→max) ───────────────── */
  const salesPeriodGroups = useMemo(() => {
    if (!salesRecords || salesRecords.length === 0) return [];

    const groups = new Map();
    salesRecords.forEach(rec => {
      const eng = String(rec.engineer_name || 'Unknown').trim() || 'Unknown';
      const groupKey = eng;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          engineerName: eng,
          entryType: rec.entry_type || 'SE',
          periodStart: null,
          periodEnd: null,
          records: [],
          totalKm: 0,
          totalAmount: 0,
          verifiedAmount: 0,
          verifiedCount: 0,
        });
      }
      const g = groups.get(groupKey);
      g.records.push(rec);
      const d = rec.date ? new Date(rec.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.periodStart || d < g.periodStart) g.periodStart = d;
        if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      }
      g.totalKm += parseFloat(rec.two_way_km || 0) || 0;
      const amt = parseFloat(rec.total_amount || 0) || 0;
      g.totalAmount += amt;
      if (rec.verification_status === 'Verified') {
        g.verifiedAmount += amt;
        g.verifiedCount += 1;
      }
    });

    return Array.from(groups.values())
      .sort((a, b) => a.engineerName.localeCompare(b.engineerName));
  }, [salesRecords]);

  const salesBmDraftPeriodGroups = useMemo(() => {
    if (!salesBmDrafts || salesBmDrafts.length === 0) return [];
    const groups = new Map();
    salesBmDrafts.forEach(rec => {
      const eng = String(rec.engineer_name || 'Unknown').trim() || 'Unknown';
      const groupKey = eng;
      if (!groups.has(groupKey)) groups.set(groupKey, {
        key: groupKey, engineerName: eng, periodStart: null, periodEnd: null,
        records: [], totalKm: 0, totalAmount: 0,
      });
      const g = groups.get(groupKey);
      g.records.push(rec);
      const d = rec.date ? new Date(rec.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.periodStart || d < g.periodStart) g.periodStart = d;
        if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      }
      g.totalKm += parseFloat(rec.two_way_km || 0) || 0;
      g.totalAmount += parseFloat(rec.total_amount || 0) || 0;
    });
    return Array.from(groups.values()).sort((a, b) => a.engineerName.localeCompare(b.engineerName));
  }, [salesBmDrafts]);

  /* ─── Bill Wise DRAFT grouping (SE → engineer, BM → customer; date range min→max) ── */
  const billWiseDraftPeriodGroups = useMemo(() => {
    if (!billWiseDrafts || billWiseDrafts.length === 0) return [];
    const groups = new Map();
    billWiseDrafts.forEach(rec => {
      const isBM = rec.entry_type === 'BM';
      const label = String((isBM ? rec.created_by : rec.engineer_name) || 'Unknown').trim() || 'Unknown';
      const groupKey = `${rec.entry_type || 'SE'}__${label}`;
      if (!groups.has(groupKey)) groups.set(groupKey, {
        key: groupKey, entryType: rec.entry_type || 'SE', name: label,
        periodStart: null, periodEnd: null, records: [], totalAmount: 0,
      });
      const g = groups.get(groupKey);
      g.records.push(rec);
      const d = rec.date ? new Date(rec.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.periodStart || d < g.periodStart) g.periodStart = d;
        if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      }
      g.totalAmount += parseFloat(rec.amount || 0) || 0;
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [billWiseDrafts]);

  /* ─── KM Wise grouping (by engineer name, date range min→max) ────── */
  const kmWisePeriodGroups = useMemo(() => {
    if (!kmWiseRecords || kmWiseRecords.length === 0) return [];

    const groups = new Map();
    kmWiseRecords.forEach(rec => {
      const eng = String(rec.engineer_name || 'Unknown').trim() || 'Unknown';
      const groupKey = eng;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          engineerName: eng,
          entryType: rec.entry_type || 'SE',
          periodStart: null,
          periodEnd: null,
          records: [],
          totalKm: 0,
          totalAmount: 0,
          verifiedAmount: 0,
          verifiedCount: 0,
        });
      }
      const g = groups.get(groupKey);
      g.records.push(rec);
      const d = rec.date ? new Date(rec.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.periodStart || d < g.periodStart) g.periodStart = d;
        if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      }
      g.totalKm += parseFloat(rec.km || 0) || 0;
      const amt = parseFloat(rec.amount || 0) || 0;
      g.totalAmount += amt;
      if (rec.verification_status === 'Verified') {
        g.verifiedAmount += amt;
        g.verifiedCount += 1;
      }
    });

    return Array.from(groups.values())
      .sort((a, b) => a.engineerName.localeCompare(b.engineerName));
  }, [kmWiseRecords]);

  /* ─── Bill Wise grouping (by engineer/customer name, date range min→max) ──── */
  const billWisePeriodGroups = useMemo(() => {
    if (!billWiseRecords || billWiseRecords.length === 0) return [];

    const groups = new Map();
    billWiseRecords.forEach(rec => {
      const isBM = rec.entry_type === 'BM';
      const eng = String((isBM ? rec.created_by : rec.engineer_name) || 'Unknown').trim() || 'Unknown';
      const groupKey = `${rec.entry_type || 'SE'}__${eng}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          engineerName: eng,
          entryType: rec.entry_type || 'SE',
          periodStart: null,
          periodEnd: null,
          records: [],
          totalAmount: 0,
          verifiedAmount: 0,
          verifiedCount: 0,
        });
      }
      const g = groups.get(groupKey);
      g.records.push(rec);
      const d = rec.date ? new Date(rec.date) : null;
      if (d && !isNaN(d.getTime())) {
        if (!g.periodStart || d < g.periodStart) g.periodStart = d;
        if (!g.periodEnd || d > g.periodEnd) g.periodEnd = d;
      }
      const amt = parseFloat(rec.amount || 0) || 0;
      g.totalAmount += amt;
      if (rec.verification_status === 'Verified') {
        g.verifiedAmount += amt;
        g.verifiedCount += 1;
      }
    });

    return Array.from(groups.values())
      .sort((a, b) => a.engineerName.localeCompare(b.engineerName));
  }, [billWiseRecords]);

  /* ─────────────────────────────────────────────────────────────────────────────
     FILE HELPERS
  ───────────────────────────────────────────────────────────────────────────── */
  const readExcelFile = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

  const validateAndPreview = async file => {
    setPreviewLoading(true); setValidationResult(null); setFilePreview(null); setShowPreview(false);
    try {
      const data = await readExcelFile(file);
      setFilePreview(data.slice(0, 10));

      // ── Client-side validation: required fields must not be empty ──
      const alwaysRequired = [
        'Installation Site Address', 'Account', 'Service Request No.', 'Appointment Number',
        'SR Type', 'SR Sub Type', 'SR Due date',
        'SR Trip Start Date & Time', 'SR Reach at Site Date & Time',
        'SR Trip Start Lat Long', 'SR Reach at site Lat long',
        'Service Engineer Name', 'Service Engineer UID',
        'Task Status', 'SR Status',
      ];

      const emptyFieldRows = {}; // { fieldName: [rowNumbers] }
      const isEmpty = v => v === null || v === undefined || String(v).trim() === '';

      data.forEach((row, idx) => {
        const rowNumber = idx + 2; // +1 for 0-index, +1 for header row

        // Always-required
        alwaysRequired.forEach(field => {
          if (isEmpty(row[field])) {
            if (!emptyFieldRows[field]) emptyFieldRows[field] = [];
            emptyFieldRows[field].push(rowNumber);
          }
        });

        // Conditional: Task Status = Completed ⇒ task dates required
        const taskStatus = String(row['Task Status'] || '').trim().toLowerCase();
        if (taskStatus === 'completed') {
          ['Task Start Date', 'Task End Date', 'Task Assigned Date & Time'].forEach(field => {
            if (isEmpty(row[field])) {
              const key = `${field} (required when Task Status = Completed)`;
              if (!emptyFieldRows[key]) emptyFieldRows[key] = [];
              emptyFieldRows[key].push(rowNumber);
            }
          });
        }

        // Conditional: SR Status = Closed ⇒ SR Closed Date required
        const srStatus = String(row['SR Status'] || '').trim().toLowerCase();
        if (srStatus === 'closed') {
          if (isEmpty(row['SR Closed Date'])) {
            const key = 'SR Closed Date (required when SR Status = Closed)';
            if (!emptyFieldRows[key]) emptyFieldRows[key] = [];
            emptyFieldRows[key].push(rowNumber);
          }
        }
      });

      const emptyFieldNames = Object.keys(emptyFieldRows);
      if (emptyFieldNames.length > 0) {
        const errorMessages = emptyFieldNames.map(field => {
          const rows = emptyFieldRows[field];
          const rowsStr = rows.length > 5
            ? `${rows.slice(0, 5).join(', ')}... (+${rows.length - 5} more)`
            : rows.join(', ');
          return `"${field}" is empty in row(s): ${rowsStr}.`;
        });
        const fullMessage = errorMessages.join('\n');
        setValidationResult({ valid: false, message: fullMessage });
        toast.error(
          `${emptyFieldNames.length} column(s) have empty values:\n${errorMessages.join('\n')}`,
          { duration: 10000 }
        );
        return false;
      }

      // ── If client-side check passes, proceed with API validation ──
      const fd = new FormData(); fd.append('file', file);
      const res = await axios.post(`${API_BASE_URL}/tada/validate`, fd);
      setValidationResult(res.data);
      if (!res.data.valid) { toast.error(res.data.message); return false; }
      setShowPreview(true); toast.success('File format is valid!'); return true;
    } catch { toast.error('Failed to validate file'); return false; }
    finally { setPreviewLoading(false); }
  };

  const handleFileSelect = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { toast.error('Please select an Excel file (.xlsx or .xls)'); return; }
    setSelectedFile(file); await validateAndPreview(file);
  };

  const closeImportModal = () => {
    setShowImportModal(false); setSelectedFile(null);
    setValidationResult(null); setFilePreview(null); setShowPreview(false);
    setUploadResult(null); // NEW
  };

  const handleUpload = async () => {
    if (!selectedFile) { toast.error('Please select a file first'); return; }
    setUploading(true);
    setUploadResult(null); // clear previous result
    const fd = new FormData(); fd.append('file', selectedFile);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/tada/upload?branch_code=${encodeURIComponent(userBranch)}&uploaded_by=${encodeURIComponent(user?.name || 'System')}`,
        fd, { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      const data = res.data || {};
      const status = data.status || 'success';
      const msg = data.message || 'File uploaded';
      const added = (data.new_records || 0) + (data.updated_records || 0);

      // Show toast based on backend status
      if (status === 'duplicate') {
        toast.error(msg, { duration: 6000 });
      } else if (status === 'error') {
        toast.error(msg, { duration: 6000 });
      } else if (status === 'warning' || added === 0) {
        toast(msg, { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(msg);
      }

      // Store the result so the modal can show the breakdown.
      // DO NOT close the modal — let the user close it manually.
      setUploadResult({
        status,
        message: msg,
        total_processed: data.total_processed || 0,
        new_records: data.new_records || 0,
        updated_records: data.updated_records || 0,
        error_records: data.error_records || 0,
        duplicate_skipped: data.duplicate_skipped || 0,
        already_submitted_skipped: data.already_submitted_skipped || 0,
        history_skipped: data.history_skipped || 0,
        date_skipped: data.date_skipped || 0,
        days_limit: data.days_limit || 30,
      });

      // If anything was actually added, refresh the table in the background
      // (modal stays open so user can review the breakdown).
      if (added > 0) {
        setAllRecords([]); setNextSkip(0); setHasMore(true); autoLoadRef.current = false;
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to upload file';
      toast.error(errorMsg);
      setUploadResult({
        status: 'error',
        message: errorMsg,
        total_processed: 0,
        new_records: 0,
        updated_records: 0,
        error_records: 0,
        duplicate_skipped: 0,
        already_submitted_skipped: 0,
        history_skipped: 0,
        date_skipped: 0,
        days_limit: 30,
      });
    } finally { setUploading(false); }
  };

  const SalesBmDraftView = () => {
    if (loadingSalesBmDrafts) {
      return <div className="text-center py-16"><p className="text-sm text-gray-500">Loading Sales & BM TADA…</p></div>;
    }
    if (salesBmDrafts.length === 0) {
      return (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500 font-medium">No Sales & BM drafts yet</p>
          <p className="text-xs text-gray-400 mt-1">Add entries from the Manual modal → Sales & BM TADA tab</p>
        </div>
      );
    }
    const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!salesBmDraftPeriod) {
      return (
        <div className="overflow-auto" style={{ maxHeight: '700px', scrollbarWidth: 'thin' }}>
          <table className="border-collapse w-full" style={{ minWidth: '1100px' }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: '#f0f1ff' }}>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 text-center" style={{ width: '44px', backgroundColor: '#f0f1ff' }}>
                  {(() => {
                    const allIds = salesBmDraftPeriodGroups.flatMap(g => g.records.map(r => r.id));
                    const allSel = allIds.length > 0 && allIds.every(id => salesBmDraftSelected[id]);
                    const someSel = allIds.some(id => salesBmDraftSelected[id]) && !allSel;
                    return (
                      <input
                        type="checkbox"
                        disabled
                        className="cursor-not-allowed opacity-50"
                        checked={allSel}
                        ref={el => { if (el) el.indeterminate = someSel; }}
                        title="Select periods individually"
                      />
                    );
                  })()}
                </th>
                {['Sr. No.', 'Date Range', 'Engineer Name', 'No. of Customer Visits', 'Total Amount'].map((l, i) => (
                  <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 last:border-r-0 text-center" style={{ backgroundColor: '#f0f1ff' }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {salesBmDraftPeriodGroups.map((g, idx) => {
                const ids = g.records.map(r => r.id);
                const allSel = ids.length > 0 && ids.every(id => salesBmDraftSelected[id]);
                const someSel = ids.some(id => salesBmDraftSelected[id]) && !allSel;
                return (
                  <tr key={g.key} className="hover:bg-blue-50" style={{ height: '38px' }}>
                    <td className="px-3 py-1 text-center border-r border-gray-100">
                      <input
                        type="checkbox"
                        checked={allSel}
                        ref={el => { if (el) el.indeterminate = someSel; }}
                        onChange={e => {
                          const next = { ...salesBmDraftSelected };
                          if (e.target.checked) ids.forEach(id => { next[id] = true; });
                          else ids.forEach(id => { delete next[id]; });
                          setSalesBmDraftSelected(next);
                        }}
                        title={`Select all of ${g.engineerName}'s records in this period`}
                      />
                    </td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-medium">{idx + 1}</td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                      <span onClick={() => setSalesBmDraftPeriod(g)} className="underline cursor-pointer hover:font-bold" style={{ color: themeColor }}>
                        {fmt(g.periodStart)} → {fmt(g.periodEnd)}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-semibold text-black">{g.engineerName}</td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.records.length}</td>
                    <td className="px-3 py-1 text-[12px] text-center font-bold text-purple-700">₹{g.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr style={{ backgroundColor: '#f0f1ff' }}>
                <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                  Grand Total ({salesBmDraftPeriodGroups.length} period{salesBmDraftPeriodGroups.length === 1 ? '' : 's'})
                </td>
                <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">
                  {salesBmDraftPeriodGroups.reduce((s, g) => s + g.records.length, 0)}
                </td>
                <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700">
                  ₹{salesBmDraftPeriodGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }
    return (
      <>
        <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
          <button onClick={() => setSalesBmDraftPeriod(null)} className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>← Back</button>
          <span className="text-[11px] text-gray-600">Engineer:</span>
          <span className="text-[11px] font-bold text-purple-700">{salesBmDraftPeriod.engineerName}</span>
          <span className="text-gray-300">|</span>
          <span className="text-[11px] text-gray-600">Period:</span>
          <span className="text-[11px] font-bold text-gray-800">{fmt(salesBmDraftPeriod.periodStart)} → {fmt(salesBmDraftPeriod.periodEnd)}</span>
          <span className="text-gray-300">|</span>
          <span className="text-[11px] text-gray-600">Records:</span><span className="text-[11px] font-bold">{salesBmDraftPeriod.records.length}</span>
          <span className="text-gray-300">|</span>
          <span className="text-[11px] text-gray-600">Total:</span><span className="text-[11px] font-bold text-purple-700">₹{salesBmDraftPeriod.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="overflow-auto" style={{ maxHeight: '650px', scrollbarWidth: 'thin' }}>
          <table className="border-collapse w-full" style={{ minWidth: '2020px' }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: '#f0f1ff' }}>
                {[
                  { l: 'Sel', w: 40 }, { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 },
                  { l: 'SR/Invoice/Engine', w: 150 },
                  { l: 'Customer', w: 160 }, { l: 'Location', w: 140 },
                  { l: '1 Way KM', w: 80 }, { l: '2 Way KM', w: 80 },
                  { l: 'Amount', w: 90 }, { l: 'DA', w: 80 }, { l: 'Total', w: 100 },
                  { l: 'Work Description', w: 160 },
                  { l: 'Labour Sale Exp.', w: 110 }, { l: 'Part Sale Exp.', w: 100 },
                  { l: 'Remark', w: 150 },
                  { l: 'Engineer', w: 150 }, { l: 'Engineer UID', w: 110 }, { l: 'Employee ID', w: 100 },
                  { l: 'Action', w: 70 },
                ].map((c, i) => {
                  return (
                    <th key={i} className="px-2 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap" style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#f0f1ff' }}>{c.l}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {salesBmDraftPeriod.records.map((rec, idx) => (
                <tr key={rec.id || idx} className="hover:bg-blue-50/30" style={{ height: '32px' }}>
                  <td className="px-2 py-1 text-center border-r border-gray-100">
                    <input type="checkbox" checked={!!salesBmDraftSelected[rec.id]} onChange={e => setSalesBmDraftSelected(prev => ({ ...prev, [rec.id]: e.target.checked }))} />
                  </td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{idx + 1}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 whitespace-nowrap">{rec.date ? new Date(rec.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.sr_invoice_engine_no || ''}>{rec.sr_invoice_engine_no || '-'}</div></td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.customer_name || ''}>{rec.customer_name || '-'}</div></td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.location || ''}>{rec.location || '-'}</div></td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.one_way_km || '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-semibold">{rec.two_way_km || '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.amount && parseFloat(rec.amount) !== 0 ? `₹${parseFloat(rec.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 text-green-700 font-semibold">{rec.da && parseFloat(rec.da) !== 0 ? `₹${rec.da}` : '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold text-blue-700">{rec.total_amount && parseFloat(rec.total_amount) !== 0 ? `₹${parseFloat(rec.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.work_description || ''}>{rec.work_description || '-'}</div></td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.labour_sale_expected && parseFloat(rec.labour_sale_expected) !== 0 ? `₹${parseFloat(rec.labour_sale_expected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.part_sale_expected && parseFloat(rec.part_sale_expected) !== 0 ? `₹${parseFloat(rec.part_sale_expected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.remark || ''}>{rec.remark || '-'}</div></td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate font-semibold text-black" title={rec.engineer_name || ''}>{rec.engineer_name || '-'}</div></td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.engineer_uid || ''}>{rec.engineer_uid || '-'}</div></td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.employee_id || ''}>{rec.employee_id || '-'}</div></td>
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={() => { console.log('Deleting Sales&BM rec:', rec); handleDeleteSalesBmDraft(rec.id); }}
                      className="text-red-600 hover:text-red-800"
                      title={`Delete (id=${rec.id})`}
                    >
                      <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  const BillWiseDraftView = () => {
    if (loadingBillWiseDrafts) {
      return <div className="text-center py-16"><p className="text-sm text-gray-500">Loading Bill Wise…</p></div>;
    }
    if (billWiseDrafts.length === 0) {
      return (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500 font-medium">No Bill Wise drafts yet</p>
          <p className="text-xs text-gray-400 mt-1">Add entries from the Manual modal → Bill Wise Submission tab</p>
        </div>
      );
    }
    const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const money = v => v && parseFloat(v) !== 0 ? `₹${parseFloat(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
    const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

    // ── SUMMARY (one row per period + engineer/customer) ──
    if (!billWiseDraftPeriod) {
      return (
        <div className="overflow-auto" style={{ maxHeight: '700px', scrollbarWidth: 'thin' }}>
          <table className="border-collapse w-full" style={{ minWidth: '1150px' }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: '#f0f1ff' }}>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 text-center" style={{ width: '44px', backgroundColor: '#f0f1ff' }}>
                  {(() => {
                    const allIds = billWiseDraftPeriodGroups.flatMap(g => g.records.map(r => r.id));
                    const allSel = allIds.length > 0 && allIds.every(id => billWiseDraftSelected[id]);
                    const someSel = allIds.some(id => billWiseDraftSelected[id]) && !allSel;
                    return (
                      <input type="checkbox" disabled
                        className="cursor-not-allowed opacity-50"
                        checked={allSel}
                        ref={el => { if (el) el.indeterminate = someSel; }}
                        title="Select periods individually" />
                    );
                  })()}
                </th>
                {['Sr. No.', 'Date Range', 'Type', 'Engineer / Customer', 'Records', 'Total Amount'].map((l, i) => (
                  <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 last:border-r-0 text-center" style={{ backgroundColor: '#f0f1ff' }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {billWiseDraftPeriodGroups.map((g, idx) => {
                const ids = g.records.map(r => r.id);
                const allSel = ids.length > 0 && ids.every(id => billWiseDraftSelected[id]);
                const someSel = ids.some(id => billWiseDraftSelected[id]) && !allSel;
                const isBM = g.entryType === 'BM';
                return (
                  <tr key={g.key} className="hover:bg-blue-50" style={{ height: '38px' }}>
                    <td className="px-3 py-1 text-center border-r border-gray-100">
                      <input type="checkbox" checked={allSel}
                        ref={el => { if (el) el.indeterminate = someSel; }}
                        onChange={e => {
                          const next = { ...billWiseDraftSelected };
                          if (e.target.checked) ids.forEach(id => { next[id] = true; });
                          else ids.forEach(id => { delete next[id]; });
                          setBillWiseDraftSelected(next);
                        }} />
                    </td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-medium">{idx + 1}</td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                      <span onClick={() => setBillWiseDraftPeriod(g)} className="underline cursor-pointer hover:font-bold" style={{ color: themeColor }}>
                        {fmt(g.periodStart)} → {fmt(g.periodEnd)}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-center border-r border-gray-100">
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${isBM ? 'bg-indigo-100 text-indigo-700' : 'bg-cyan-100 text-cyan-700'}`}>{g.entryType}</span>
                    </td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-semibold text-black">{g.name}</td>
                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.records.length}</td>
                    <td className="px-3 py-1 text-[12px] text-center font-bold text-purple-700">₹{g.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr style={{ backgroundColor: '#f0f1ff' }}>
                <td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                  Grand Total ({billWiseDraftPeriodGroups.length} group{billWiseDraftPeriodGroups.length === 1 ? '' : 's'})
                </td>
                <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">
                  {billWiseDraftPeriodGroups.reduce((s, g) => s + g.records.length, 0)}
                </td>
                <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700">
                  ₹{billWiseDraftPeriodGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }

    // ── DRILL-IN (this group's records) ──
    const isBM = billWiseDraftPeriod.entryType === 'BM';
    return (
      <>
        <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
          <button onClick={() => setBillWiseDraftPeriod(null)} className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>← Back</button>
          <span className="text-[11px] text-gray-600">Period:</span>
          <span className="text-[11px] font-bold text-gray-800">{fmt(billWiseDraftPeriod.periodStart)} → {fmt(billWiseDraftPeriod.periodEnd)}</span>
          <span className="text-gray-300">|</span>
          <span className="text-[11px] text-gray-600">{isBM ? 'Employee' : 'Engineer'}:</span>
          <span className="text-[11px] font-bold text-purple-700">{billWiseDraftPeriod.name}</span>
          <span className="text-gray-300">|</span>
          <span className="text-[11px] text-gray-600">Records:</span><span className="text-[11px] font-bold">{billWiseDraftPeriod.records.length}</span>
          <span className="text-gray-300">|</span>
          <span className="text-[11px] text-gray-600">Total:</span><span className="text-[11px] font-bold text-purple-700">₹{billWiseDraftPeriod.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="overflow-auto" style={{ maxHeight: '650px', scrollbarWidth: 'thin' }}>
          <table className="border-collapse w-full" style={{ minWidth: isBM ? '1510px' : '2450px' }}>

            <thead className="sticky top-0 z-10">
              <tr style={{ backgroundColor: '#f0f1ff' }}>
                {(isBM
                  ? [{ l: 'Sel', w: 40 }, { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 }, { l: 'Customer', w: 170 }, { l: 'SR/Inv/Engine', w: 160 }, { l: 'Location', w: 150 }, { l: 'Expense Head', w: 150 }, { l: 'Amount', w: 110 }, { l: 'Bill Submitted', w: 100 }, { l: 'Work Description', w: 200 }, { l: 'Remark', w: 160 }, { l: 'Work Status', w: 110 }, { l: 'Employee Name', w: 170 }, { l: 'Action', w: 70 }]
                  : [{ l: 'Sel', w: 40 }, { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 }, { l: 'SR No.', w: 130 }, { l: 'Account', w: 150 }, { l: 'Installation Site Address', w: 110 }, { l: 'SR Type', w: 110 }, { l: 'Expense Head', w: 150 }, { l: 'Amount', w: 110 }, { l: 'Work Description', w: 180 },
                  { l: 'KMs Travelled', w: 100 }, { l: 'Task Status', w: 110 }, { l: 'Appt No.', w: 120 }, { l: 'Task Start Date', w: 120 }, { l: 'Task End Date', w: 120 }, { l: 'Engineer', w: 150 }, { l: 'Emp ID', w: 90 }, { l: 'UID', w: 100 }, { l: 'Bill Subm.', w: 90 }, { l: 'Action', w: 70 }]
                ).map((c, i) => (
                  <th key={i} className="px-2 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap" style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#f0f1ff' }}>{c.l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {billWiseDraftPeriod.records.map((rec, idx) => (
                <tr key={rec.id || idx} className="hover:bg-blue-50/30" style={{ height: '32px' }}>
                  <td className="px-2 py-1 text-center border-r border-gray-100">
                    <input type="checkbox" checked={!!billWiseDraftSelected[rec.id]} onChange={e => setBillWiseDraftSelected(prev => ({ ...prev, [rec.id]: e.target.checked }))} />
                  </td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{idx + 1}</td>
                  <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 whitespace-nowrap">{fmtD(rec.date)}</td>
                  {isBM ? (
                    <>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.customer_name || ''}>{rec.customer_name || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.sr_invoice_engine_no || ''}>{rec.sr_invoice_engine_no || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.installation_site_address || ''}>{rec.installation_site_address || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.expenses_head || ''}>{rec.expenses_head || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold text-blue-700">{money(rec.amount)}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.bill_submitted || '-'}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.work_description || ''}>{rec.work_description || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.remark || ''}>{rec.remark || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.work_status || '-'}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate font-semibold text-black" title={rec.created_by || ''}>{rec.created_by || '-'}</div></td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.service_request_no || ''}>{rec.service_request_no || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.account || ''}>{rec.account || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate max-w-[110px] mx-auto" title={rec.installation_site_address || ''}>{rec.installation_site_address || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.sr_type || ''}>{rec.sr_type || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.expenses_head || ''}>{rec.expenses_head || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold text-blue-700">{money(rec.amount)}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.work_description || ''}>{rec.work_description || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.kms_travelled || '-'}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.task_status || '-'}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.appointment_number || ''}>{rec.appointment_number || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.task_start_date || '-'}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.task_end_date || '-'}</td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate font-semibold text-black" title={rec.engineer_name || ''}>{rec.engineer_name || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.employee_id || ''}>{rec.employee_id || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.service_engineer_uid || ''}>{rec.service_engineer_uid || '-'}</div></td>
                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.bill_submitted || '-'}</td>
                    </>
                  )}
                  <td className="px-2 py-1 text-center">
                    <button onClick={() => handleDeleteBillWiseDraft(rec.id)} className="text-red-600 hover:text-red-800" title={`Delete (id=${rec.id})`}>
                      <svg className="h-3.5 w-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     IMPORT MODAL
  ───────────────────────────────────────────────────────────────────────────── */
  const ImportModal = () => {
    if (!showImportModal) return null;
    const previewCols = filePreview?.length ? Object.keys(filePreview[0]) : [];
    const expectedCols = [
      'SD Branch Name', 'SD Branch Code', 'Installation Site Address', 'Instance ID',
      'Engine Application Code', 'Engine Serial Number', 'Account', 'Account ID',
      'Service Request No.', 'Appointment Number', 'SR Type', 'SR Sub Type', 'SR Due date',
      'Task Start Date', 'Task End Date', 'Task Status', 'Task Assigned Date & Time',
      'Task Assign v.s Trip Start', 'SR Trip Start Date & Time', 'SR Reach at Site Date & Time',
      'SR Trip Start Lat Long', 'SR Reach at site Lat long', 'KMs Travelled', 'SR Closed Date',
      'SR Status', 'Asset Primary Contact No.', 'VOC', 'Service Engineer Name', 'Service Engineer UID',
      'Customer Name', 'Customer contact number', 'Customer Remark', 'Problem Summary',
      'Nature of Failure', 'Action Taken', 'Engineer Remark', 'Exception Remark', 'OTP Remark', 'PDF Generated',
    ];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[92vh] flex flex-col">
          <div className="flex-shrink-0 px-6 py-4 flex justify-between items-center rounded-t-2xl"
            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
            <h2 className="text-sm font-bold text-white tracking-wide">Import TADA Data</h2>
            <button
              onClick={closeImportModal}
              className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <h3 className="text-xs font-bold text-blue-800 mb-2">Expected Columns ({expectedCols.length}):</h3>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {expectedCols.map((col, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] bg-white text-blue-700 border border-blue-200 font-medium">{col}</span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Select Excel File</label>
              <div
                onClick={() => document.getElementById('tada-file-input').click()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/40"
                style={{ borderColor: validationResult?.valid ? '#16a34a' : '#d1d5db' }}
              >
                <input id="tada-file-input" type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                <div className="flex flex-col items-center gap-2">
                  <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <p className="text-sm text-gray-600 font-medium">{selectedFile ? selectedFile.name : 'Click to select or drag & drop'}</p>
                  <p className="text-xs text-gray-400">Supports .xlsx, .xls files</p>
                </div>
              </div>
            </div>

            {/* ─── NEW: Upload Result Breakdown ─── */}
            {uploadResult && (
              <div
                className={`p-4 rounded-xl border-2 ${uploadResult.status === 'success'
                  ? 'bg-green-50 border-green-300'
                  : uploadResult.status === 'duplicate'
                    ? 'bg-orange-50 border-orange-300'
                    : uploadResult.status === 'warning'
                      ? 'bg-yellow-50 border-yellow-300'
                      : 'bg-red-50 border-red-300'
                  }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  {uploadResult.status === 'success' ? (
                    <svg className="h-6 w-6 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : uploadResult.status === 'duplicate' ? (
                    <svg className="h-6 w-6 text-orange-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-6 w-6 text-red-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p
                      className={`text-sm font-bold ${uploadResult.status === 'success'
                        ? 'text-green-800'
                        : uploadResult.status === 'duplicate'
                          ? 'text-orange-800'
                          : uploadResult.status === 'warning'
                            ? 'text-yellow-800'
                            : 'text-red-800'
                        }`}
                    >
                      {uploadResult.status === 'success'
                        ? '✓ Import Completed'
                        : uploadResult.status === 'duplicate'
                          ? '⚠ All records already exist'
                          : uploadResult.status === 'warning'
                            ? '⚠ No records were added'
                            : '✗ Import Failed'}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">{uploadResult.message}</p>
                  </div>
                </div>

                {/* Detailed Breakdown Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                  <div className="bg-white rounded-lg p-2.5 border border-green-200">
                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Newly Added</p>
                    <p className="text-lg font-bold text-green-700 mt-0.5">{uploadResult.new_records}</p>
                  </div>

                  <div className="bg-white rounded-lg p-2.5 border border-blue-200">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Updated</p>
                    <p className="text-lg font-bold text-blue-700 mt-0.5">{uploadResult.updated_records}</p>
                  </div>

                  <div className="bg-white rounded-lg p-2.5 border border-orange-200">
                    <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wide" title="Same row appeared more than once in the uploaded file, OR already exists in Drafts">
                      Duplicates in File / Drafts
                    </p>
                    <p className="text-lg font-bold text-orange-700 mt-0.5">{uploadResult.duplicate_skipped}</p>
                  </div>

                  <div className="bg-white rounded-lg p-2.5 border border-purple-200">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide" title="Already submitted to HO (in main TADA table)">
                      Already Submitted to HO
                    </p>
                    <p className="text-lg font-bold text-purple-700 mt-0.5">{uploadResult.already_submitted_skipped}</p>
                  </div>

                  <div className="bg-white rounded-lg p-2.5 border border-gray-300">
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide" title="Already moved to History (archived/paid)">
                      Already in History
                    </p>
                    <p className="text-lg font-bold text-gray-700 mt-0.5">{uploadResult.history_skipped}</p>
                  </div>

                  <div className="bg-white rounded-lg p-2.5 border border-yellow-200">
                    <p
                      className="text-[10px] font-bold text-yellow-700 uppercase tracking-wide"
                      title={`SR Closed Date older than ${uploadResult.days_limit} days`}
                    >
                      Older than {uploadResult.days_limit} days
                    </p>
                    <p className="text-lg font-bold text-yellow-700 mt-0.5">{uploadResult.date_skipped}</p>
                  </div>

                  <div className="bg-white rounded-lg p-2.5 border border-red-200">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide" title="Rows that errored out during processing (e.g. missing appointment number)">
                      Errors
                    </p>
                    <p className="text-lg font-bold text-red-700 mt-0.5">{uploadResult.error_records}</p>
                  </div>

                  <div className="bg-white rounded-lg p-2.5 border border-indigo-200">
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Total Processed</p>
                    <p className="text-lg font-bold text-indigo-700 mt-0.5">{uploadResult.total_processed}</p>
                  </div>
                </div>

                {/* Explanation of skipped categories */}
                {(uploadResult.duplicate_skipped > 0 ||
                  uploadResult.already_submitted_skipped > 0 ||
                  uploadResult.history_skipped > 0 ||
                  uploadResult.date_skipped > 0 ||
                  uploadResult.error_records > 0) && (
                    <div className="mt-3 bg-white/60 rounded-lg p-3 border border-gray-200">
                      <p className="text-[11px] font-bold text-gray-700 mb-1.5">Why were some rows skipped?</p>
                      <ul className="text-[11px] text-gray-600 space-y-1 list-disc list-inside">
                        {uploadResult.duplicate_skipped > 0 && (
                          <li>
                            <strong>{uploadResult.duplicate_skipped}</strong> row(s) appeared more than once in the
                            same file OR already exist in your Drafts tab.
                          </li>
                        )}
                        {uploadResult.already_submitted_skipped > 0 && (
                          <li>
                            <strong>{uploadResult.already_submitted_skipped}</strong> row(s) have already been
                            submitted to HO (visible in the Submitted tab).
                          </li>
                        )}
                        {uploadResult.history_skipped > 0 && (
                          <li>
                            <strong>{uploadResult.history_skipped}</strong> row(s) are already in the History
                            table (archived/paid records).
                          </li>
                        )}
                        {uploadResult.date_skipped > 0 && (
                          <li>
                            <strong>{uploadResult.date_skipped}</strong> row(s) had an SR Closed Date older than{' '}
                            <strong>{uploadResult.days_limit} days</strong> (branch upload window).
                          </li>
                        )}
                        {uploadResult.error_records > 0 && (
                          <li>
                            <strong>{uploadResult.error_records}</strong> row(s) had errors (e.g. missing
                            Appointment Number) and could not be processed.
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
              </div>
            )}

            {previewLoading && (
              <div className="text-center py-6">
                <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <p className="text-xs text-gray-500">Loading preview…</p>
              </div>
            )}

            {showPreview && filePreview?.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-700">Preview — First {filePreview.length} rows</h3>
                  <span className="text-[10px] text-gray-400">{previewCols.length} columns detected</span>
                </div>
                <div className="overflow-x-auto max-h-72">
                  <table className="min-w-full text-[11px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-center font-semibold text-gray-600 border border-gray-200 whitespace-nowrap">#</th>
                        {previewCols.map((col, i) => (
                          <th key={i} className="px-2 py-1.5 text-center font-semibold text-gray-600 border border-gray-200 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filePreview.map((row, i) => (
                        <tr key={i} className="border border-gray-200 hover:bg-gray-50">
                          <td className="px-2 py-1.5 text-center text-gray-500 border border-gray-200">{i + 1}</td>
                          {previewCols.map((col, j) => (
                            <td key={j} className="px-2 py-1.5 text-center text-gray-800 whitespace-nowrap max-w-[180px] truncate border border-gray-200">
                              {row[col] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 border-t px-6 py-4 flex justify-between items-center rounded-b-2xl bg-gray-50">
            <div className="text-[11px] text-gray-500">
              {uploadResult ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Review the import summary above, then close manually.
                </span>
              ) : (
                <span>Select a file to begin import</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeImportModal}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {uploadResult ? 'Close' : 'Cancel'}
              </button>
              {!uploadResult && (
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || !validationResult?.valid || uploading}
                  className="px-5 py-2 text-white text-xs font-bold rounded-lg disabled:opacity-40 flex items-center gap-2 transition-all"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                >
                  {uploading && (
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {uploading ? 'Uploading…' : 'Import File'}
                </button>
              )}
              {uploadResult && (
                <button
                  onClick={() => {
                    // Allow user to import another file without closing fully
                    setSelectedFile(null);
                    setValidationResult(null);
                    setFilePreview(null);
                    setShowPreview(false);
                    setUploadResult(null);
                  }}
                  className="px-5 py-2 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Import Another File
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ─── KM Rate / DA / Total calculation logic (mirrors HOExpense) ──────────── */
  const loadKMRates = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/expense/branch-km-rates`);
      const rates = {};
      (data || []).forEach(rate => {
        rates[rate.branch_code] = {
          km_rate: rate.km_rate,
          range_start_km: rate.range_start_km,
          range_end_km: rate.range_end_km,
          range_amount: rate.range_amount,
          above_km: rate.above_km,
          above_amount: rate.above_amount,
        };
      });
      setKmRates(rates);
    } catch (err) {
      console.error('Failed to load KM rates', err);
    }
  }, []);

  const getBranchDARate = useCallback((branchCode) => {
    const r = kmRates[branchCode];
    if (!r) return null;
    return {
      range_start_km: r.range_start_km != null ? parseFloat(r.range_start_km) : null,
      range_end_km: r.range_end_km != null ? parseFloat(r.range_end_km) : null,
      range_amount: r.range_amount ? parseFloat(r.range_amount) : 0,
      above_km: r.above_km != null ? parseFloat(r.above_km) : null,
      above_amount: r.above_amount ? parseFloat(r.above_amount) : 0,
      km_rate: r.km_rate ? parseFloat(r.km_rate) : 0,
    };
  }, [kmRates]);

  // Find engineer's primary branch from a given record list
  const findEngineerPrimaryBranch = useCallback((engineerUid, recordsList) => {
    const engRecs = recordsList.filter(r => r.service_engineer_uid === engineerUid);
    if (engRecs.length === 0) return null;
    const branchCount = {};
    engRecs.forEach(r => {
      const b = r.sd_branch_code;
      if (b) branchCount[b] = (branchCount[b] || 0) + 1;
    });
    let primary = null;
    let max = 0;
    Object.entries(branchCount).forEach(([b, c]) => {
      if (c > max) { max = c; primary = b; }
    });
    return primary;
  }, []);

  const getEffectiveBranchForRecord = useCallback((record, recordsList) => {
    let rate = getBranchDARate(record.sd_branch_code);
    if (rate && (rate.range_amount > 0 || rate.above_amount > 0 || rate.km_rate > 0)) {
      return record.sd_branch_code;
    }
    if (record.service_engineer_uid) {
      const primary = findEngineerPrimaryBranch(record.service_engineer_uid, recordsList);
      if (primary) {
        rate = getBranchDARate(primary);
        if (rate && (rate.range_amount > 0 || rate.above_amount > 0 || rate.km_rate > 0)) {
          return primary;
        }
      }
    }
    const hoRate = getBranchDARate('HO');
    if (hoRate && (hoRate.range_amount > 0 || hoRate.above_amount > 0 || hoRate.km_rate > 0)) {
      return 'HO';
    }
    return record.sd_branch_code;
  }, [getBranchDARate, findEngineerPrimaryBranch]);

  // Effective KM priority: ho_corrected_km -> branch_verified_km -> two_way_km
  const getEffectiveKM = useCallback((record) => {
    if (record.ho_corrected_km && String(record.ho_corrected_km).trim() !== '') {
      const km = parseFloat(record.ho_corrected_km);
      if (!isNaN(km)) return km;
    }
    if (record.branch_verified_km && String(record.branch_verified_km).trim() !== '') {
      const km = parseFloat(record.branch_verified_km);
      if (!isNaN(km)) return km;
    }
    if (record.two_way_km && String(record.two_way_km).trim() !== '') {
      const km = parseFloat(record.two_way_km);
      if (!isNaN(km)) return km;
    }
    return null;
  }, []);

  const calculateDAmount = useCallback((record, effectiveKM, recordsList) => {
    if (effectiveKM === null) return null;
    const effectiveBranch = getEffectiveBranchForRecord(record, recordsList);
    const rate = getBranchDARate(effectiveBranch);
    if (!rate) return null;
    let da = 0;
    if (rate.range_start_km !== null && rate.range_end_km !== null) {
      if (effectiveKM >= rate.range_start_km && effectiveKM <= rate.range_end_km) {
        da = rate.range_amount;
      } else if (rate.above_km !== null && effectiveKM > rate.above_km) {
        da = rate.above_amount;
      }
    } else if (rate.above_km !== null) {
      if (effectiveKM > rate.above_km) da = rate.above_amount;
    }
    return da;
  }, [getBranchDARate, getEffectiveBranchForRecord]);

  const calculateTotalAmountDynamic = useCallback((record, effectiveKM, daAmount, recordsList, freightCharges = 0) => {
    if (effectiveKM === null) return null;
    const effectiveBranch = getEffectiveBranchForRecord(record, recordsList);
    const rate = getBranchDARate(effectiveBranch);
    if (!rate || rate.km_rate === 0) return null;
    const freight = parseFloat(freightCharges) || 0;
    return (effectiveKM * rate.km_rate) + (daAmount || 0) + freight;
  }, [getBranchDARate, getEffectiveBranchForRecord]);

  // Load KM rates once on mount (needed for DA/Total calculation in submitted view)
  useEffect(() => {
    loadKMRates();
  }, [loadKMRates]);

  // Recalculate DA/Total whenever submittedRecords or kmRates change
  useEffect(() => {
    if (!submittedRecords || submittedRecords.length === 0) {
      setSubmittedDAAmounts({});
      setSubmittedTotalAmounts({});
      return;
    }
    const newDA = {};
    const newTotal = {};
    submittedRecords.forEach(record => {
      const isVerified = record.verification_status === 'Verified';
      // For verified records with stored amounts, use them as-is (HO already locked them in)
      if (isVerified && record.da_amount && record.total_amount) {
        newDA[record.id] = record.da_amount;
        newTotal[record.id] = record.total_amount;
      } else {
        const km = getEffectiveKM(record);
        const da = calculateDAmount(record, km, submittedRecords);
        const freight = parseFloat(record.freight_charges || 0) || 0;
        const total = calculateTotalAmountDynamic(record, km, da, submittedRecords, freight);
        if (da !== null) newDA[record.id] = da.toFixed(2);
        if (total !== null) newTotal[record.id] = total.toFixed(2);
      }
    });
    setSubmittedDAAmounts(newDA);
    setSubmittedTotalAmounts(newTotal);
  }, [submittedRecords, kmRates, getEffectiveKM, calculateDAmount, calculateTotalAmountDynamic]);

  /* ═══════════════════════════════════════════════════════════════════════════
     JSX RENDER
  ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen">
      <div className="max-w-full mx-auto px-3 sm:px-4">

        <div className="mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-black">Expense Tracker</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {user?.name} · {getRoleLabel()} · {userBranch} — {getBranchLabel(userBranch)}
              </p>
            </div>

            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 self-start sm:self-auto">
              {[{ id: 'tada', label: 'TA-DA' }, { id: 'office', label: 'Office Expense' }, { id: 'vendor', label: 'Local Vendor Bills' }].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className="px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: activeTab === t.id ? 'white' : 'transparent',
                    color: activeTab === t.id ? themeColor : '#6B7280',
                    boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === 'tada' && (() => {
          const isSubmittedView = tadaSubTab === 'submitted';

          // Apply same filters (branch / engineer / search / drill-in) on submitted records too
          const filteredSubmitted = (submittedRecords || []).filter(r => {
            if (!isAdmin && userBranch && String(r.branch_code || '').trim() !== userBranch) return false;
            if (selectedEngineer && String(r.service_engineer_name || '').trim() !== selectedEngineer) return false;
            if (drillInEngineer) {
              if (String(r.service_engineer_name || '').trim() !== drillInEngineer.name) return false;
              if (String(r.service_engineer_uid || '').trim() !== drillInEngineer.uid) return false;
            }
            // 3rd-level voucher scoping (Submitted → SE)
            if (selectedVoucher && submittedInnerTab === 'se' && (r.voucher_no || 'No Voucher') !== selectedVoucher.voucher) return false;
            // Verified-only filter (Submitted tab, drilled-in via Verify Data button)
            if (verifyDataFilter && drillInEngineer) {
              if (r.verification_status !== 'Verified') return false;
            }
            // Secondary filter: HO Corrected KM must be non-empty (only meaningful when Verified-only is on)
            if (hoKmFilter && drillInEngineer && verifyDataFilter) {
              if (r.ho_corrected_km === null || r.ho_corrected_km === undefined || String(r.ho_corrected_km).trim() === '') return false;
            }
            // Task Status filter (Excel-style)
            if (mainTaskStatusFilter.size > 0 && !mainTaskStatusFilter.has(String(r.task_status || '').trim())) return false;
            const q = debouncedSearch.trim().toLowerCase();
            if (!q) return true;
            return [
              r.appointment_number, r.sd_branch_name, r.sd_branch_code, r.instance_id,
              r.engine_serial_number, r.account, r.account_id, r.service_request_no,
              r.service_engineer_name, r.service_engineer_uid, r.customer_name,
              r.customer_contact_number, r.voc, r.uploaded_by,
            ].some(v => String(v || '').toLowerCase().includes(q));
          });

          const activeRecords = isSubmittedView ? filteredSubmitted : filteredRecords;
          const activeAllRecords = isSubmittedView ? (submittedRecords || []) : allRecords;
          const activeLoading = isSubmittedView ? loadingSubmitted : loadingRecords;

          const activeStats = (() => {
            // ─── Verified → Sales & BM TADA inner tab ──────────────────────
            if (tadaSubTab === 'verified' && verifiedInnerTab === 'sales_bm') {
              const totalKm = salesBmDrafts.reduce((s, r) => s + (parseFloat(r.two_way_km) || 0), 0);
              const dates = salesBmDrafts.map(r => r.date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
              const startDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
              const endDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
              const totalAmount = salesBmDrafts.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
              return { count: salesBmDrafts.length, totalTwoWayKm: totalKm, startDate, endDate, totalAmount, verifiedAmount: 0 };
            }

            // ─── Verified → Bill Wise inner tab (no KM) ────────────────────
            if (tadaSubTab === 'verified' && verifiedInnerTab === 'bill_wise') {
              const dates = billWiseDrafts.map(r => r.date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
              const startDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
              const endDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
              const totalAmount = billWiseDrafts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
              return { count: billWiseDrafts.length, totalTwoWayKm: 0, startDate, endDate, totalAmount, verifiedAmount: 0 };
            }

            // ─── Submitted → Sales inner tab ───────────────────────────────
            if (isSubmittedView && submittedInnerTab === 'sales') {
              const totalKm = salesRecords.reduce((s, r) => s + (parseFloat(r.two_way_km) || 0), 0);
              const dates = salesRecords.map(r => r.date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
              const startDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
              const endDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
              const totalAmount = salesRecords.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
              const verifiedAmount = salesRecords
                .filter(r => r.verification_status === 'Verified')
                .reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
              return { count: salesRecords.length, totalTwoWayKm: totalKm, startDate, endDate, totalAmount, verifiedAmount };
            }

            // ─── Submitted → KM Wise inner tab ─────────────────────────────
            if (isSubmittedView && submittedInnerTab === 'km_wise') {
              const totalKm = kmWiseRecords.reduce((s, r) => s + (parseFloat(r.km) || 0), 0);
              const dates = kmWiseRecords.map(r => r.date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
              const startDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
              const endDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
              const totalAmount = kmWiseRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
              const verifiedAmount = kmWiseRecords
                .filter(r => r.verification_status === 'Verified')
                .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
              return { count: kmWiseRecords.length, totalTwoWayKm: totalKm, startDate, endDate, totalAmount, verifiedAmount };
            }

            // ─── Submitted → Bill Wise inner tab (no KM) ───────────────────
            if (isSubmittedView && submittedInnerTab === 'bill_wise') {
              const dates = billWiseRecords.map(r => r.date).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
              const startDate = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
              const endDate = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
              const totalAmount = billWiseRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
              const verifiedAmount = billWiseRecords
                .filter(r => r.verification_status === 'Verified')
                .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
              return { count: billWiseRecords.length, totalTwoWayKm: 0, startDate, endDate, totalAmount, verifiedAmount };
            }

            // ─── Default: Service Engineer (and Drafts/Verified views) ─────
            const totalTwoWayKm = activeRecords.reduce((sum, r) => sum + (parseFloat(r.two_way_km) || 0), 0);
            const reachDates = activeRecords
              .map(r => r.sr_reach_at_site_datetime)
              .filter(Boolean)
              .map(d => new Date(d))
              .filter(d => !isNaN(d.getTime()));
            const startDate = reachDates.length ? new Date(Math.min(...reachDates.map(d => d.getTime()))) : null;
            const endDate = reachDates.length ? new Date(Math.max(...reachDates.map(d => d.getTime()))) : null;

            // ── Money totals ──
            let totalAmount = 0;
            let verifiedAmount = 0;
            if (isSubmittedView) {
              activeRecords.forEach(r => {
                const calc = submittedTotalAmounts[r.id];
                const amt = parseFloat(calc !== undefined ? calc : (r.total_amount || 0)) || 0;
                totalAmount += amt;
                if (r.verification_status === 'Verified') verifiedAmount += amt;
              });
            } else {
              // ── Drafts: compute dynamically (frontend-only, same priority as cells) ──
              activeRecords.forEach(r => {
                let km = null;
                const typed = localValues[`${r.id}_branch_verified_km`];
                const pending = pendingKM[r.id];
                if (typed !== undefined && String(typed).trim() !== '') {
                  km = parseFloat(typed);
                } else if (pending !== undefined && String(pending).trim() !== '') {
                  km = parseFloat(pending);
                } else if (r.branch_verified_km && String(r.branch_verified_km).trim() !== '') {
                  km = parseFloat(r.branch_verified_km);
                } else if (r.two_way_km && String(r.two_way_km).trim() !== '') {
                  km = parseFloat(r.two_way_km);
                }
                if (km === null || isNaN(km)) return;
                const da = calculateDAmount(r, km, allRecords) || 0;
                const freight = parseFloat(r.freight_charges || 0) || 0;
                const total = calculateTotalAmountDynamic(r, km, da, allRecords, freight);
                if (total !== null && total !== undefined) totalAmount += total;
              });
            }

            return { count: activeRecords.length, totalTwoWayKm, startDate, endDate, totalAmount, verifiedAmount };
          })();

          // ── Summary-view flag: Verified or Submitted tab, no drill-in yet ──
          const isSummaryView = (tadaSubTab === 'verified' || tadaSubTab === 'submitted') && !drillInEngineer;

          // ── Engineer summary (one row per engineer) ──
          // Voucher summary (Submitted → SE only). For Verified tab there is no voucher layer.
          const voucherSummary = (isSummaryView && isSubmittedView && submittedInnerTab === 'se')
            ? buildVoucherGroups(
              activeRecords,
              (r) => {
                const calc = submittedTotalAmounts[r.id];
                return parseFloat(calc !== undefined ? calc : (r.total_amount || 0)) || 0;
              }
            )
            : [];

          // Engineer table source: on Submitted+SE it's the chosen voucher's rows; otherwise all active records.
          const engineerSourceRecords =
            (isSubmittedView && submittedInnerTab === 'se')
              ? (selectedVoucher ? selectedVoucher.rows : [])
              : activeRecords;

          const engineerSummary = (() => {
            if (!isSummaryView) return [];
            const groups = new Map();
            engineerSourceRecords.forEach(r => {
              const name = String(r.service_engineer_name || '').trim();
              if (!name) return;
              const uid = String(r.service_engineer_uid || '').trim();
              const key = `${name}__${uid}`;
              if (!groups.has(key)) groups.set(key, { name, uid, rows: [], rowIds: [] });
              const g = groups.get(key);
              g.rows.push(r);
              if (r.id !== undefined) g.rowIds.push(r.id);
            });

            return Array.from(groups.values()).map(g => {
              const reaches = g.rows
                .map(r => r.sr_reach_at_site_datetime)
                .filter(Boolean)
                .map(d => new Date(d))
                .filter(d => !isNaN(d.getTime()));
              const periodStart = reaches.length ? new Date(Math.min(...reaches.map(d => d.getTime()))) : null;
              const periodEnd = reaches.length ? new Date(Math.max(...reaches.map(d => d.getTime()))) : null;
              const totalKm = g.rows.reduce((s, r) => s + (parseFloat(r.two_way_km) || 0), 0);

              let totalAmount = 0;
              let verifiedAmount = 0;
              if (isSubmittedView) {
                g.rows.forEach(r => {
                  const calc = submittedTotalAmounts[r.id];
                  const amt = parseFloat(calc !== undefined ? calc : (r.total_amount || 0)) || 0;
                  totalAmount += amt;
                  if (r.verification_status === 'Verified') verifiedAmount += amt;
                });
              } else {
                // Verified tab — compute from saved branch_verified_km (fallback two_way_km)
                g.rows.forEach(r => {
                  let km = null;
                  if (r.branch_verified_km && String(r.branch_verified_km).trim() !== '') {
                    km = parseFloat(r.branch_verified_km);
                  } else if (r.two_way_km && String(r.two_way_km).trim() !== '') {
                    km = parseFloat(r.two_way_km);
                  }
                  if (km === null || isNaN(km)) return;
                  const da = calculateDAmount(r, km, allRecords) || 0;
                  const freight = parseFloat(r.freight_charges || 0) || 0;
                  const total = calculateTotalAmountDynamic(r, km, da, allRecords, freight);
                  if (total !== null && total !== undefined) totalAmount += total;
                });
              }

              return {
                name: g.name, uid: g.uid, count: g.rows.length, rowIds: g.rowIds, rows: g.rows,
                periodStart, periodEnd, totalKm, totalAmount, verifiedAmount,
              };
            }).sort((a, b) => a.name.localeCompare(b.name));
          })();

          return (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">

              {/* ── Header (search + action buttons) ── */}
              <div className="px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between"
                style={{ backgroundColor: themeLight }}>

                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xs font-bold text-black">
                    {tadaSubTab === 'submitted'
                      ? (submittedInnerTab === 'sales'
                        ? 'Submitted Sales & BM Records'
                        : submittedInnerTab === 'bill_wise'
                          ? 'Submitted Bill Wise Records'
                          : 'Submitted TADA Records')
                      : tadaSubTab === 'verified'
                        ? 'Verified TADA Records'
                        : 'TADA Drafts'}
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                    {tadaSubTab === 'verified' && verifiedInnerTab === 'sales_bm'
                      ? salesBmDrafts.length
                      : tadaSubTab === 'verified' && verifiedInnerTab === 'bill_wise'
                        ? billWiseDrafts.length
                        : tadaSubTab === 'submitted' && submittedInnerTab === 'sales'
                          ? salesRecords.length
                          : tadaSubTab === 'submitted' && submittedInnerTab === 'bill_wise'
                            ? billWiseRecords.length
                            : activeRecords.length}
                  </span>
                  {activeLoading && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </span>
                  )}
                  {savingVerification && (
                    <span className="text-[10px] text-green-600 flex items-center gap-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Saving...
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">

                  {/* Search box */}
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => { setIsSearching(true); setSearchTerm(e.target.value); }}
                      placeholder="Search Instance ID, SR No., Customer, Engineer…"
                      className="pl-8 pr-8 py-1.5 text-[11px] border border-gray-300 rounded-lg bg-white text-black placeholder-gray-400 w-full sm:w-80 transition-all outline-none"
                      style={{ borderColor: searchTerm ? themeColor : '' }}
                      onFocus={e => { e.target.style.borderColor = themeColor; e.target.style.boxShadow = `0 0 0 2px rgba(47,49,146,0.15)`; }}
                      onBlur={e => { e.target.style.borderColor = searchTerm ? themeColor : ''; e.target.style.boxShadow = ''; }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* ─── Primary actions (always visible) ─── */}

                  {/* Refresh */}
                  <button
                    onClick={async () => {
                      if (isSubmittedView) {
                        fetchSubmittedRecords();
                      } else {
                        // Clear pending KM timers + state
                        Object.keys(pendingTimersRef.current).forEach(id => clearTimeout(pendingTimersRef.current[id]));
                        pendingTimersRef.current = {};
                        setPendingKM({});
                        setLocalValues({});
                        // Clear local state
                        setAllRecords([]);
                        setNextSkip(0);
                        setHasMore(true);
                        setTadaSelected({});
                        autoLoadRef.current = false;
                        toast.success('Refreshing...');
                        // Force-fetch first batch immediately (don't rely on useEffect)
                        await fetchBatch(0);
                      }
                    }}
                    disabled={activeLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all whitespace-nowrap disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
                    title="Refresh records"
                  >
                    Refresh
                  </button>

                  {/* Verify — only on Drafts tab */}
                  {tadaSubTab === 'drafts' && (
                    <button
                      onClick={handleVerifyTadaTemp}
                      disabled={
                        verifyingTadaTemp ||
                        Object.values(tadaSelected).filter(Boolean).length === 0
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow-md transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)' }}
                      title="Branch-verify selected drafts (moves them to the Verified tab)"
                    >
                      {verifyingTadaTemp ? 'Verifying…' : `Verify (${Object.values(tadaSelected).filter(Boolean).length})`}
                    </button>
                  )}

                  {/* Unverify + Submit to HO — only on Verified tab, SE inner tab */}
                  {tadaSubTab === 'verified' && verifiedInnerTab === 'se' && (
                    <>
                      <button
                        onClick={handleUnverifyTadaTemp}
                        disabled={
                          unverifyingTadaTemp ||
                          Object.values(tadaSelected).filter(Boolean).length === 0
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow-md transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                        title="Move selected verified rows back to Drafts"
                      >
                        {unverifyingTadaTemp
                          ? 'Unverifying…'
                          : `Unverify (${Object.values(tadaSelected).filter(Boolean).length})`}
                      </button>

                      <button
                        onClick={handleSubmitTadaTemp}
                        disabled={
                          submittingTadaTemp ||
                          (!isAdmin && !isUploadAllowed()) ||
                          Object.values(tadaSelected).filter(Boolean).length === 0
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow-md transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                        title={!isAdmin && !isUploadAllowed() ? getUploadRestrictionMessage() : 'Send selected verified rows to HO'}
                      >
                        {submittingTadaTemp
                          ? 'Submitting…'
                          : `Submit to HO (${Object.values(tadaSelected).filter(Boolean).length})`}
                      </button>
                    </>
                  )}

                  {/* ─── Hamburger Menu (☰) — secondary actions ─── */}
                  <div className="relative">
                    <button
                      onClick={() => setShowActionMenu(prev => !prev)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-white text-[11px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all whitespace-nowrap"
                      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                      title={showActionMenu ? "Close menu" : "More actions"}
                    >
                      {showActionMenu ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      )}
                      {showActionMenu ? 'Close' : 'Menu'}
                    </button>

                    {showActionMenu && (
                      <>
                        {/* Click-outside backdrop */}
                        <div
                          className="fixed inset-0"
                          style={{ zIndex: 40 }}
                          onClick={() => setShowActionMenu(false)}
                        />

                        {/* Dropdown panel */}
                        <div
                          className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl overflow-hidden"
                          style={{ zIndex: 50, minWidth: '140px' }}
                        >
                          {/* History */}
                          <button
                            onClick={() => {
                              setShowActionMenu(false);
                              setShowHistoryModal(true);
                            }}
                            className="w-full px-2.5 py-1.5 text-left text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                          >
                            <span
                              className="w-5 h-5 rounded flex items-center justify-center"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                            >
                              <svg
                                className="h-3 w-3 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </span>
                            History
                          </button>

                          {/* KM Rate */}
                          {/* <button
                            onClick={() => { setShowActionMenu(false); setShowBranchRateModal(true); }}
                            className="w-full px-3 py-2 text-left text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                            title="View KM rate & DA slabs for your branch"
                          >
                            <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </span>
                            KM Rate
                          </button> */}

                          {/* Export — only if user has export permission */}
                          {canExport && (
                            <button
                              onClick={() => {
                                setShowActionMenu(false);
                                const exportCols = ALL_COLUMNS.filter(c => c.key !== 'sr_no' && c.key !== 'select' && c.key !== 'actions');
                                exportToExcel(
                                  activeRecords,
                                  `tada_${userBranch}_${isSubmittedView ? 'submitted' : 'drafts'}.xlsx`,
                                  exportCols.map(c => ({ key: c.key, label: c.label }))
                                );
                              }}
                              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                            >
                              <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                </svg>
                              </span>
                              Export
                            </button>
                          )}

                          {/* Print — only on Submitted → Service Engineer with drill-in */}
                          {tadaSubTab === 'submitted' && submittedInnerTab === 'se' && drillInEngineer && (
                            <button
                              onClick={() => {
                                setShowActionMenu(false);
                                printEngineerTadaReport(activeRecords, drillInEngineer.name, drillInEngineer.uid);
                              }}
                              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                              title={`Print TADA report for ${drillInEngineer.name}`}
                            >
                              <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                              </span>
                              Print Report
                            </button>
                          )}

                          {/* Import File + Manual — only on Drafts tab */}
                          {tadaSubTab === 'drafts' && (
                            <>
                              <button
                                onClick={() => { setShowActionMenu(false); setShowImportModal(true); }}
                                className="w-full px-3 py-2 text-left text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                              >
                                <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                  </svg>
                                </span>
                                Import File
                              </button>

                              <button
                                onClick={() => { setShowActionMenu(false); setShowManualEntryModal(true); }}
                                className="w-full px-3 py-2 text-left text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                              >
                                <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)' }}>
                                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                </span>
                                Manual
                              </button>
                            </>
                          )}

                          {/* Manual — also on Verified and Submitted tabs */}
                          {(tadaSubTab === 'verified' || tadaSubTab === 'submitted') && (
                            <button
                              onClick={() => { setShowActionMenu(false); setShowManualEntryModal(true); }}
                              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                            >
                              <span className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)' }}>
                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </span>
                              Manual
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Sub-tab pills + Engineer Filter + Stats Bar ── */}
              <div className="px-2 py-1 border-b bg-white flex items-center gap-1.5 flex-nowrap overflow-x-auto">

                {/* Drafts | Submitted pills */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 shrink-0">
                  {[
                    { id: 'drafts', label: 'Pending for Verification' },
                    { id: 'verified', label: 'Verified' },
                    { id: 'submitted', label: 'Submitted' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTadaSubTab(t.id)}
                      className="px-2 py-0.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap"
                      style={{
                        backgroundColor: tadaSubTab === t.id ? 'white' : 'transparent',
                        color: tadaSubTab === t.id ? themeColor : '#6B7280',
                        boxShadow: tadaSubTab === t.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {tadaSubTab === 'drafts' && (
                  <>
                    <label className="text-[10px] font-bold text-black uppercase tracking-wide whitespace-nowrap shrink-0">
                      Engineer:
                    </label>
                    <select
                      value={selectedEngineer}
                      onChange={(e) => setSelectedEngineer(e.target.value)}
                      className="px-1.5 py-0.5 text-[11px] border border-gray-300 rounded-md bg-white text-black focus:outline-none focus:ring-1 w-[140px] shrink-0 truncate"
                      style={{ borderColor: selectedEngineer ? themeColor : '' }}
                      onFocus={e => { e.target.style.borderColor = themeColor; e.target.style.boxShadow = `0 0 0 2px rgba(47,49,146,0.15)`; }}
                      onBlur={e => { e.target.style.borderColor = selectedEngineer ? themeColor : ''; e.target.style.boxShadow = ''; }}
                      title={selectedEngineer || `All Engineers (${branchEngineers.length})`}
                    >
                      <option value="">All ({branchEngineers.length})</option>
                      {branchEngineers.map((eng, idx) => (
                        <option key={idx} value={eng.name}>
                          {eng.name}{eng.uid ? ` — ${eng.uid}` : ''}
                        </option>
                      ))}
                    </select>
                    {selectedEngineer && (
                      <button
                        onClick={() => setSelectedEngineer('')}
                        className="text-[10px] font-semibold text-red-500 hover:text-red-700 flex items-center gap-0.5 whitespace-nowrap shrink-0"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Clear
                      </button>
                    )}
                  </>
                )}

                {(tadaSubTab === 'verified' || tadaSubTab === 'submitted') && drillInEngineer && (
                  <button
                    onClick={() => { setDrillInEngineer(null); setVerifyDataFilter(false); setHoKmFilter(false); setTadaSelected({}); }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                    title="Back to engineer list"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back · {drillInEngineer.name}{drillInEngineer.uid ? ` (${drillInEngineer.uid})` : ''}
                  </button>
                )}

                {tadaSubTab === 'submitted' && drillInEngineer && verifyDataFilter && (
                  <button
                    onClick={() => setHoKmFilter(v => !v)}
                    className={
                      hoKmFilter
                        ? "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md text-white shrink-0"
                        : "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md text-indigo-700 bg-white border border-indigo-300 shrink-0 hover:bg-indigo-50"
                    }
                    style={hoKmFilter ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)' } : undefined}
                    title={hoKmFilter ? 'Hiding rows without HO Corrected KM — click to clear' : 'Click to show only rows where HO Corrected KM is filled'}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                    HO Verify KM only
                    {hoKmFilter && (
                      <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                )}

                {mainTaskStatusFilter.size > 0 && (
                  <button
                    onClick={() => setMainTaskStatusFilter(new Set())}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white shrink-0"
                    style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
                    title="Clear Task Status filter"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                    Task: {Array.from(mainTaskStatusFilter).join(', ')}
                    <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {/* Spacer pushes stats to right */}
                <div className="flex-1" />

                {/* Stats Strip */}
                <div className="flex items-center gap-1 shrink-0">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md" style={{ backgroundColor: themeLight }}>
                    <span className="text-[9px] font-bold text-gray-500 uppercase">Records:</span>
                    <span className="text-[10px] font-bold" style={{ color: themeColor }}>{activeStats.count}</span>
                  </div>
                  {/* {!(isSubmittedView && submittedInnerTab === 'bill_wise') && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-100">
                      <span className="text-[9px] font-bold text-blue-600 uppercase">Total 2-Way KM:</span>
                      <span className="text-[10px] font-bold text-blue-800">
                        {activeStats.totalTwoWayKm.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )} */}
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-50 border border-green-100">
                    <span className="text-[9px] font-bold text-green-600 uppercase">Start Date:</span>
                    <span className="text-[10px] font-bold text-green-800">
                      {activeStats.startDate
                        ? activeStats.startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-50 border border-orange-100">
                    <span className="text-[9px] font-bold text-orange-600 uppercase">End Date:</span>
                    <span className="text-[10px] font-bold text-orange-800">
                      {activeStats.endDate
                        ? activeStats.endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '-'}
                    </span>
                  </div>
                  {/* ── Money totals (Total Amount = both views, Verified Amount = submitted only) ── */}
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 border border-purple-100">
                    <span className="text-[9px] font-bold text-purple-600 uppercase">Total Amount:</span>
                    <span className="text-[10px] font-bold text-purple-800">
                      ₹{activeStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {isSubmittedView && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-100">
                      <span className="text-[9px] font-bold text-emerald-600 uppercase">Verified Amount:</span>
                      <span className="text-[10px] font-bold text-emerald-800">
                        ₹{activeStats.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {Object.keys(kmRates).length === 0 && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 font-semibold whitespace-nowrap"
                      title="KM rates not loaded yet — totals may be incomplete"
                    >
                      {/* ⚠ Rates loading… */}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Table area (swaps between summary / drill-in / drafts) ── */}
              {activeLoading && activeAllRecords.length === 0 ? (
                <div className="text-center py-20">
                  <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-600">
                    {isSubmittedView ? 'Loading submitted records…' : 'Loading TADA records…'}
                  </p>
                  {!isSubmittedView && (
                    <p className="text-xs text-gray-400 mt-1">Fetching all data in batches, please wait</p>
                  )}
                </div>
              ) : isSummaryView ? (
                <>
                  {/* ── Inner tabs (Verified view) ── */}
                  {tadaSubTab === 'verified' && (
                    <div className="px-3 py-1.5 border-b bg-white flex items-center gap-1.5">
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                        {[
                          { id: 'se', label: 'Service Engineer' },
                          { id: 'sales_bm', label: 'Sales & BM TADA' },
                          { id: 'bill_wise', label: 'Bill Wise' },
                        ].map(t => (
                          <button
                            key={t.id}
                            onClick={() => { setVerifiedInnerTab(t.id); setSalesBmDraftPeriod(null); setSalesBmDraftSelected({}); setBillWiseDraftSelected({}); setBillWiseDraftPeriod(null); }}
                            className="px-3 py-0.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap"
                            style={{
                              backgroundColor: verifiedInnerTab === t.id ? 'white' : 'transparent',
                              color: verifiedInnerTab === t.id ? themeColor : '#6B7280',
                              boxShadow: verifiedInnerTab === t.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      {verifiedInnerTab === 'sales_bm' && (
                        <div className="ml-auto flex items-center gap-2">
                          {canExport && salesBmDrafts.length > 0 && (
                            <button
                              onClick={() => exportToExcel(
                                salesBmDrafts,
                                `sales_bm_verified_${userBranch}.xlsx`,
                                [
                                  { key: 'date', label: 'Date' },
                                  { key: 'sr_invoice_engine_no', label: 'SR/Invoice/Engine' },
                                  { key: 'customer_name', label: 'Customer Name' },
                                  { key: 'location', label: 'Location' },
                                  { key: 'one_way_km', label: '1 Way KM' },
                                  { key: 'two_way_km', label: '2 Way KM' },
                                  { key: 'amount', label: 'Amount' },
                                  { key: 'da', label: 'DA' },
                                  { key: 'total_amount', label: 'Total Amount' },
                                  { key: 'work_description', label: 'Work Description' },
                                  { key: 'labour_sale_expected', label: 'Labour Sale Expected' },
                                  { key: 'part_sale_expected', label: 'Part Sale Expected' },
                                  { key: 'remark', label: 'Remark' },
                                  { key: 'engineer_name', label: 'Engineer Name' },
                                  { key: 'engineer_uid', label: 'Engineer UID' },
                                  { key: 'employee_id', label: 'Employee ID' },
                                ]
                              )}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-white text-[11px] font-semibold rounded-md shadow-sm"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                              </svg>
                              Export
                            </button>
                          )}
                          <button
                            onClick={handleSubmitSalesBmToHo}
                            disabled={submittingSalesBmToHo || Object.values(salesBmDraftSelected).filter(Boolean).length === 0 || (!isAdmin && !isUploadAllowed())}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-white text-[11px] font-bold rounded-md shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                            title={!isAdmin && !isUploadAllowed() ? getUploadRestrictionMessage() : 'Submit selected to HO'}
                          >
                            {submittingSalesBmToHo ? 'Submitting…' : `Submit to HO (${Object.values(salesBmDraftSelected).filter(Boolean).length})`}
                          </button>
                        </div>
                      )}
                      {verifiedInnerTab === 'bill_wise' && (
                        <div className="ml-auto flex items-center gap-2">
                          {canExport && billWiseDrafts.length > 0 && (
                            <button
                              onClick={() => exportToExcel(
                                billWiseDrafts,
                                `bill_wise_verified_${userBranch}.xlsx`,
                                [
                                  { key: 'entry_type', label: 'Type' },
                                  { key: 'date', label: 'Date' },
                                  { key: 'engineer_name', label: 'Engineer Name' },
                                  { key: 'created_by', label: 'Employee / Created By' },
                                  { key: 'customer_name', label: 'Customer Name' },
                                  { key: 'sr_invoice_engine_no', label: 'SR/Invoice/Engine' },
                                  { key: 'service_request_no', label: 'SR No.' },
                                  { key: 'appointment_number', label: 'Appointment No.' },
                                  { key: 'account', label: 'Account' },
                                  { key: 'installation_site_address', label: 'Location / Site Address' },
                                  { key: 'sr_type', label: 'SR Type' },
                                  { key: 'task_status', label: 'Task Status' },
                                  { key: 'kms_travelled', label: 'KMs Travelled' },
                                  { key: 'task_start_date', label: 'Task Start Date' },
                                  { key: 'task_end_date', label: 'Task End Date' },
                                  { key: 'expenses_head', label: 'Expense Head' },
                                  { key: 'amount', label: 'Amount' },
                                  { key: 'bill_submitted', label: 'Bill Submitted' },
                                  { key: 'work_description', label: 'Work Description' },
                                  { key: 'remark', label: 'Remark' },
                                  { key: 'work_status', label: 'Work Status' },
                                  { key: 'employee_id', label: 'Employee ID' },
                                  { key: 'service_engineer_uid', label: 'Service Engineer UID' },
                                ]
                              )}
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-white text-[11px] font-semibold rounded-md shadow-sm"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                              </svg>
                              Export
                            </button>
                          )}
                          <button
                            onClick={handleSubmitBillWiseToHo}
                            disabled={submittingBillWiseToHo || Object.values(billWiseDraftSelected).filter(Boolean).length === 0 || (!isAdmin && !isUploadAllowed())}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-white text-[11px] font-bold rounded-md shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                            title={!isAdmin && !isUploadAllowed() ? getUploadRestrictionMessage() : 'Submit selected to HO'}
                          >
                            {submittingBillWiseToHo ? 'Submitting…' : `Submit to HO (${Object.values(billWiseDraftSelected).filter(Boolean).length})`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Inner tabs (Submitted view) ── */}
                  {tadaSubTab === 'submitted' && (
                    <div className="px-3 py-1.5 border-b bg-white flex items-center gap-1.5">
                      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                        {[
                          { id: 'se', label: 'Service Engineer' },
                          { id: 'sales', label: 'Sales & BM TADA' },
                          { id: 'bill_wise', label: 'Bill Wise' },
                        ].map(t => (
                          <button
                            key={t.id}
                            onClick={() => {
                              setSubmittedInnerTab(t.id);
                              setSelectedVoucher(null);
                              setSelectedSalesVoucher(null);
                              setSelectedBillWiseVoucher(null);
                              setSalesSelectedPeriod(null);
                              setKmWiseSelectedPeriod(null);
                              setBillWiseSelectedPeriod(null);
                              setDrillInEngineer(null);
                              setSalesHoKmFilter(false);
                              setKmWiseHoKmFilter(false);
                              setSalesVerifiedOnly(false);
                              setKmWiseVerifiedOnly(false);
                              setBillWiseVerifiedOnly(false);
                            }}
                            className="px-3 py-0.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap"
                            style={{
                              backgroundColor: submittedInnerTab === t.id ? 'white' : 'transparent',
                              color: submittedInnerTab === t.id ? themeColor : '#6B7280',
                              boxShadow: submittedInnerTab === t.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── SE VOUCHER LEVEL (Submitted only) ── */}
                  {tadaSubTab === 'submitted' && submittedInnerTab === 'se' && !selectedVoucher && (
                    voucherSummary.length === 0 ? (
                      <div className="text-center py-16">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No submitted records yet</p>
                      </div>
                    ) : (
                      <div className="overflow-auto" style={{ maxHeight: '700px', scrollbarWidth: 'thin' }}>
                        <table className="border-collapse w-full" style={{ minWidth: '1180px' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {['Sr. No.', 'Date Range', 'Submitted By', 'Voucher No.', 'Records', 'Total Amount', 'Verified Amount'].map((l, i) => (
                                <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap" style={{ backgroundColor: '#f0f1ff' }}>{l}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {voucherSummary.map((g, idx) => {
                              const fmt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                              return (
                                <tr key={g.voucher} className="hover:bg-blue-50 transition-colors" style={{ height: '38px' }}>
                                  <td className="px-3 py-1 text-[12px] text-center font-medium border-r border-gray-100">{idx + 1}</td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 whitespace-nowrap">
                                    {g.start && g.end ? `${fmt(g.start)} → ${fmt(g.end)}` : '-'}
                                  </td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-semibold text-black">{g.submittedBy}</td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                    <span
                                      onClick={() => { setSelectedVoucher(g); setDrillInEngineer(null); setTadaSelected({}); }}
                                      className="underline cursor-pointer hover:font-bold font-mono"
                                      style={{ color: themeColor }}
                                      title="Click to view engineers in this voucher"
                                    >
                                      {g.voucher}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.rows.length}</td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-purple-700 whitespace-nowrap">
                                    ₹{g.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-1 text-[12px] text-center font-bold text-emerald-700 whitespace-nowrap">
                                    ₹{g.verified.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="sticky bottom-0">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                                Grand Total ({voucherSummary.length} voucher{voucherSummary.length === 1 ? '' : 's'})
                              </td>
                              <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">
                                {voucherSummary.reduce((s, g) => s + g.rows.length, 0)}
                              </td>
                              <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700 whitespace-nowrap">
                                ₹{voucherSummary.reduce((s, g) => s + g.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">
                                ₹{voucherSummary.reduce((s, g) => s + g.verified, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                  )}

                  {/* ── Back-to-Vouchers bar (Submitted + SE, voucher chosen) ── */}
                  {tadaSubTab === 'submitted' && submittedInnerTab === 'se' && selectedVoucher && !drillInEngineer && (
                    <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setSelectedVoucher(null); setTadaSelected({}); }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md"
                        style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to Vouchers
                      </button>
                      <span className="text-[11px] text-gray-600">Voucher:</span>
                      <span className="text-[11px] font-bold font-mono text-gray-800">{selectedVoucher.voucher}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-[11px] text-gray-600">Submitted By:</span>
                      <span className="text-[11px] font-bold text-purple-700">{selectedVoucher.submittedBy}</span>
                      <button
                        onClick={() => printVoucherTadaReport(selectedVoucher)}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md shadow-sm"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                        title={`Print all engineers in voucher ${selectedVoucher.voucher}`}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print All Engineers
                      </button>
                    </div>
                  )}

                  {/* ── SE branch (engineer summary) ── */}
                  {(
                    (tadaSubTab === 'verified' && verifiedInnerTab === 'se') ||
                    (tadaSubTab === 'submitted' && submittedInnerTab === 'se' && selectedVoucher)
                  ) && (
                      engineerSummary.length === 0 ? (
                        <div className="text-center py-16">
                          <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87M9 7a4 4 0 118 0 4 4 0 01-8 0z" />
                          </svg>
                          <p className="text-sm text-gray-500 font-medium">
                            No {tadaSubTab === 'verified' ? 'verified' : 'submitted'} records yet
                          </p>
                        </div>
                      ) : (() => {
                        const summaryMinWidth = tadaSubTab === 'submitted' ? 1260 : 960;
                        return (
                          <>
                            <div
                              ref={summaryTopScrollBarRef}
                              className="overflow-x-auto border-b border-gray-200 bg-gray-50"
                              style={{ scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9', overflowY: 'hidden' }}
                            >
                              <div style={{ width: `${summaryMinWidth}px`, height: '1px' }} />
                            </div>
                            <div
                              ref={summaryTableContainerRef}
                              className="overflow-auto"
                              style={{ maxHeight: '700px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}
                            >
                              <table className="border-collapse w-full" style={{ minWidth: `${summaryMinWidth}px` }}>
                                <thead className="sticky top-0 z-10">
                                  <tr className="border-b-2 border-gray-200" style={{ backgroundColor: '#f0f1ff' }}>
                                    {tadaSubTab === 'verified' && (
                                      <th className="px-2 py-0 text-[10px] font-bold border-r border-gray-300 text-center" style={{ width: '50px', backgroundColor: '#f0f1ff', height: '26px' }}>
                                        <input
                                          type="checkbox"
                                          disabled
                                          className="cursor-not-allowed opacity-50"
                                          checked={engineerSummary.length > 0 && engineerSummary.every(g => g.rowIds.length > 0 && g.rowIds.every(id => tadaSelected[id]))}
                                          ref={el => {
                                            if (!el) return;
                                            const allSel = engineerSummary.every(g => g.rowIds.length > 0 && g.rowIds.every(id => tadaSelected[id]));
                                            const anySel = engineerSummary.some(g => g.rowIds.some(id => tadaSelected[id]));
                                            el.indeterminate = anySel && !allSel;
                                          }}
                                          onChange={e => {
                                            if (e.target.checked) {
                                              const next = { ...tadaSelected };
                                              engineerSummary.forEach(g => g.rowIds.forEach(id => { next[id] = true; }));
                                              setTadaSelected(next);
                                            } else {
                                              const next = { ...tadaSelected };
                                              engineerSummary.forEach(g => g.rowIds.forEach(id => { delete next[id]; }));
                                              setTadaSelected(next);
                                            }
                                          }}
                                          title="Select all engineers"
                                        />
                                      </th>
                                    )}
                                    <th className="px-2 py-0 text-[10px] font-bold text-gray-700 border-r border-gray-300 uppercase tracking-wide text-center" style={{ width: '60px', backgroundColor: '#f0f1ff', height: '26px' }}>Sr. No.</th>
                                    <th className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r border-gray-300 uppercase tracking-tight text-center leading-[1.1] align-middle" style={{ width: '260px', backgroundColor: '#f0f1ff', whiteSpace: 'normal', wordBreak: 'break-word', height: '26px' }}>Period (SR Reach at Site Date)</th>
                                    <th className="px-2 py-0 text-[10px] font-bold text-gray-700 border-r border-gray-300 uppercase tracking-wide text-center" style={{ width: '220px', backgroundColor: '#f0f1ff', height: '26px' }}>Engineer Name</th>
                                    <th className="px-2 py-0 text-[10px] font-bold text-gray-700 border-r border-gray-300 uppercase tracking-wide text-center" style={{ width: '100px', backgroundColor: '#f0f1ff', height: '26px' }}>Number of Activity</th>
                                    <th className="px-2 py-0 text-[10px] font-bold text-gray-700 border-r border-gray-300 uppercase tracking-wide text-center" style={{ width: '160px', backgroundColor: '#f0f1ff', height: '26px' }}>Total Amount</th>
                                    {isSubmittedView && (
                                      <th className="px-2 py-0 text-[10px] font-bold text-gray-700 border-r border-gray-300 uppercase tracking-wide text-center" style={{ width: '160px', backgroundColor: '#f0f1ff', height: '26px' }}>Verified Amount</th>
                                    )}
                                    {isSubmittedView && (
                                      <th className="px-2 py-0 text-[10px] font-bold text-gray-700 border-r border-gray-300 uppercase tracking-wide text-center" style={{ width: '140px', backgroundColor: '#f0f1ff', height: '26px' }}>Verify Data</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {engineerSummary.map((eng, idx) => {
                                    const allSel = eng.rowIds.length > 0 && eng.rowIds.every(id => tadaSelected[id]);
                                    const someSel = eng.rowIds.some(id => tadaSelected[id]) && !allSel;
                                    const fmt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                                    return (
                                      <tr
                                        key={`${eng.name}__${eng.uid}`}
                                        className="hover:bg-blue-50/50 transition-colors"
                                        style={{ height: '22px' }}
                                      >
                                        {tadaSubTab === 'verified' && (
                                          <td className="px-2 py-1 border-r border-gray-100 text-center" onClick={e => e.stopPropagation()}>
                                            <input
                                              type="checkbox"
                                              checked={allSel}
                                              ref={el => { if (el) el.indeterminate = someSel; }}
                                              onChange={e => {
                                                if (e.target.checked) {
                                                  const next = { ...tadaSelected };
                                                  eng.rowIds.forEach(id => { next[id] = true; });
                                                  setTadaSelected(next);
                                                } else {
                                                  const next = { ...tadaSelected };
                                                  eng.rowIds.forEach(id => { delete next[id]; });
                                                  setTadaSelected(next);
                                                }
                                              }}
                                              title={`Select all of ${eng.name}'s records`}
                                            />
                                          </td>
                                        )}
                                        <td className="px-2 py-1 border-r border-gray-100 text-[11px] text-center font-medium">{idx + 1}</td>
                                        <td className="px-2 py-1 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">
                                          {eng.periodStart && eng.periodEnd ? (
                                            <span
                                              onClick={() => {
                                                setDrillInEngineer({ name: eng.name, uid: eng.uid });
                                                setTadaSelected({});
                                              }}
                                              className="inline-flex items-center gap-1 underline cursor-pointer transition-all hover:font-bold"
                                              style={{ color: themeColor, textUnderlineOffset: '2px' }}
                                              title="Click to view this engineer's records"
                                            >
                                              {fmt(eng.periodStart)} → {fmt(eng.periodEnd)}
                                            </span>
                                          ) : '-'}
                                        </td>
                                        <td className="px-2 py-1 border-r border-gray-100 text-[11px] text-center">
                                          <div className="flex items-center justify-center gap-1.5">
                                            <span className="font-semibold text-gray-800">{eng.name}</span>
                                            {tadaSubTab === 'submitted' && submittedInnerTab === 'se' && selectedVoucher && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); printEngineerTadaReport(eng.rows, eng.name, eng.uid, selectedVoucher.voucher); }}
                                                className="inline-flex items-center justify-center text-purple-600 hover:text-purple-800"
                                                title={`Print ${eng.name}'s records (Voucher ${selectedVoucher.voucher})`}
                                              >
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-2 py-1 border-r border-gray-100 text-[11px] text-center font-semibold">{eng.count}</td>
                                        <td className="px-2 py-1 border-r border-gray-100 text-[11px] text-center font-bold text-purple-700">
                                          ₹{eng.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        {isSubmittedView && (
                                          <td className="px-2 py-1 border-r border-gray-100 text-[11px] text-center font-bold text-emerald-700">
                                            ₹{eng.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </td>
                                        )}
                                        {isSubmittedView && (() => {
                                          const verifiedCount = (eng.rows || []).filter(r => r.verification_status === 'Verified').length;
                                          return (
                                            <td className="px-2 py-1 border-r border-gray-100 text-center" onClick={e => e.stopPropagation()}>
                                              <button
                                                onClick={() => {
                                                  setDrillInEngineer({ name: eng.name, uid: eng.uid });
                                                  setVerifyDataFilter(true);
                                                  setHoKmFilter(false);
                                                  setTadaSelected({});
                                                }}
                                                disabled={verifiedCount === 0}
                                                className="inline-flex items-center gap-1 px-2 py-0 text-white text-[10px] font-bold rounded-md shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                                title={verifiedCount > 0 ? `Show ${verifiedCount} verified record(s) for ${eng.name}` : 'No verified records for this engineer'}
                                              >
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Verify Data ({verifiedCount})
                                              </button>
                                            </td>
                                          );
                                        })()}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="sticky bottom-0">
                                  <tr style={{ backgroundColor: '#f0f1ff', height: '22px' }}>
                                    {tadaSubTab === 'verified' && <td className="border-t-2 border-gray-200" />}
                                    <td colSpan={3} className="px-3 py-1 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                                      Grand Total ({engineerSummary.length} engineer{engineerSummary.length === 1 ? '' : 's'})
                                    </td>
                                    <td className="px-2 py-1 text-[11px] font-bold text-center border-t-2 border-gray-200">
                                      {engineerSummary.reduce((s, g) => s + g.count, 0)}
                                    </td>
                                    <td className="px-2 py-1 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700">
                                      ₹{engineerSummary.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    {isSubmittedView && (
                                      <td className="px-2 py-1 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700">
                                        ₹{engineerSummary.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                    )}
                                    {isSubmittedView && (
                                      <td className="border-t-2 border-gray-200" />
                                    )}
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </>
                        );
                      })()
                    )}

                  {/* ── Sales & BM branch (Verified tab) ── */}
                  {tadaSubTab === 'verified' && verifiedInnerTab === 'sales_bm' && (
                    <SalesBmDraftView />
                  )}

                  {/* ── Bill Wise branch (Verified tab) ── */}
                  {tadaSubTab === 'verified' && verifiedInnerTab === 'bill_wise' && (
                    <BillWiseDraftView />
                  )}

                  {/* ── SALES branch ── */}
                  {tadaSubTab === 'submitted' && submittedInnerTab === 'sales' && (
                    loadingSales ? (
                      <div className="text-center py-16">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading sales records…</p>
                      </div>
                    ) : salesRecords.length === 0 ? (
                      <div className="text-center py-16">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No Sales & BM records yet</p>
                        <p className="text-xs text-gray-400 mt-1">Add entries from the Manual modal → Sales & BM TADA tab</p>
                      </div>
                    ) : !salesSelectedPeriod ? (
                      !selectedSalesVoucher ? (() => {
                        const salesVoucherGroups = buildVoucherGroupsByDate(
                          salesRecords, (r) => parseFloat(r.total_amount || 0) || 0
                        );
                        const fmt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                        return (
                          <div className="overflow-auto" style={{ maxHeight: '700px', scrollbarWidth: 'thin' }}>
                            <table className="border-collapse w-full" style={{ minWidth: '1180px' }}>
                              <thead className="sticky top-0 z-10">
                                <tr style={{ backgroundColor: '#f0f1ff' }}>
                                  {['Sr. No.', 'Date Range', 'Submitted By', 'Voucher No.', 'Records', 'Total Amount', 'Verified Amount'].map((l, i) => (
                                    <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap" style={{ backgroundColor: '#f0f1ff' }}>{l}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {salesVoucherGroups.map((g, idx) => (
                                  <tr key={g.voucher} className="hover:bg-blue-50" style={{ height: '38px' }}>
                                    <td className="px-3 py-1 text-[12px] text-center font-medium border-r border-gray-100">{idx + 1}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 whitespace-nowrap">{g.start && g.end ? `${fmt(g.start)} → ${fmt(g.end)}` : '-'}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-semibold text-black">{g.submittedBy}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                      <span onClick={() => setSelectedSalesVoucher(g)} className="underline cursor-pointer hover:font-bold font-mono" style={{ color: themeColor }}>{g.voucher}</span>
                                    </td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.rows.length}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-purple-700 whitespace-nowrap">₹{g.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-3 py-1 text-[12px] text-center font-bold text-emerald-700 whitespace-nowrap">₹{g.verified.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="sticky bottom-0">
                                <tr style={{ backgroundColor: '#f0f1ff' }}>
                                  <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total ({salesVoucherGroups.length} voucher{salesVoucherGroups.length === 1 ? '' : 's'})</td>
                                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">{salesVoucherGroups.reduce((s, g) => s + g.rows.length, 0)}</td>
                                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700 whitespace-nowrap">₹{salesVoucherGroups.reduce((s, g) => s + g.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">₹{salesVoucherGroups.reduce((s, g) => s + g.verified, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        );
                      })() : (() => {
                        const salesEngineerGroups = groupSalesByEngineer(selectedSalesVoucher.rows);
                        return (
                          <>
                            <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
                              <button onClick={() => setSelectedSalesVoucher(null)} className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                Back to Vouchers
                              </button>
                              <span className="text-[11px] text-gray-600">Voucher:</span>
                              <span className="text-[11px] font-bold font-mono text-gray-800">{selectedSalesVoucher.voucher}</span>
                              <button
                                onClick={() => printSalesVoucherReport(selectedSalesVoucher)}
                                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md shadow-sm"
                                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                                title={`Print all engineers in voucher ${selectedSalesVoucher.voucher}`}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print All Engineers
                              </button>
                            </div>
                            <div className="overflow-auto" style={{ maxHeight: '650px', scrollbarWidth: 'thin' }}>
                              <table className="border-collapse w-full" style={{ minWidth: '1280px' }}>
                                <thead className="sticky top-0 z-10">
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    {[
                                      { label: 'Sr. No.', w: '60px' }, { label: 'Date Range', w: '260px' }, { label: 'Engineer Name', w: '180px' },
                                      { label: 'Number of Activity', w: '120px' }, { label: 'Total Amount', w: '140px' }, { label: 'Verified Amount', w: '140px' }, { label: 'Verify Data', w: '140px' },
                                    ].map((c, i) => (
                                      <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap" style={{ width: c.w, minWidth: c.w, backgroundColor: '#f0f1ff' }}>{c.label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {salesEngineerGroups.map((g, idx) => {
                                    const fmt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                                    return (
                                      <tr key={g.key} className="hover:bg-blue-50" style={{ height: '38px' }}>
                                        <td className="px-3 py-1 text-[12px] text-center font-medium border-r border-gray-100">{idx + 1}</td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                          <span onClick={() => setSalesSelectedPeriod(g)} className="inline-flex items-center gap-1.5 underline cursor-pointer hover:font-bold" style={{ color: themeColor }}>
                                            <span>{fmt(g.periodStart)}</span>
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                            <span>{fmt(g.periodEnd)}</span>
                                          </span>
                                        </td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                          <div className="flex items-center justify-center gap-1.5">
                                            <span className="font-semibold text-black">{g.engineerName}</span>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); printSalesEngineerReport(g.records, g.engineerName, selectedSalesVoucher.voucher); }}
                                              className="inline-flex items-center justify-center text-purple-600 hover:text-purple-800"
                                              title={`Print ${g.engineerName}'s records (Voucher ${selectedSalesVoucher.voucher})`}
                                            >
                                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                              </svg>
                                            </button>
                                          </div>
                                        </td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.records.length}</td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-purple-700 whitespace-nowrap">₹{g.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-emerald-700 whitespace-nowrap">₹{g.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-1 text-center">
                                          <button onClick={() => { setSalesSelectedPeriod(g); setSalesVerifiedOnly(true); }} disabled={g.verifiedCount === 0} className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-bold rounded-md disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Verify Data ({g.verifiedCount})
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="sticky bottom-0">
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    <td colSpan={3} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total ({salesEngineerGroups.length} engineer{salesEngineerGroups.length === 1 ? '' : 's'})</td>
                                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">{salesEngineerGroups.reduce((s, g) => s + g.records.length, 0)}</td>
                                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700 whitespace-nowrap">₹{salesEngineerGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">₹{salesEngineerGroups.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="border-t-2 border-gray-200" />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => { setSalesSelectedPeriod(null); setSalesHoKmFilter(false); setSalesVerifiedOnly(false); }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md"
                            style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                          </button>
                          {canExport && (
                            <button
                              onClick={() => exportToExcel(
                                salesSelectedPeriod.records
                                  .filter(r => !salesHoKmFilter || (r.ho_corrected_km !== null && r.ho_corrected_km !== undefined && String(r.ho_corrected_km).trim() !== ''))
                                  .filter(r => !salesVerifiedOnly || r.verification_status === 'Verified'),
                                `sales_${salesSelectedPeriod.engineerName}_${userBranch}.xlsx`,
                                [
                                  { key: 'date', label: 'Date' },
                                  { key: 'sr_invoice_engine_no', label: 'SR/Invoice/Engine' },
                                  { key: 'customer_name', label: 'Customer Name' },
                                  { key: 'location', label: 'Location' },
                                  { key: 'one_way_km', label: '1 Way KM' },
                                  { key: 'two_way_km', label: '2 Way KM' },
                                  { key: 'amount', label: 'Amount' },
                                  { key: 'da', label: 'DA' },
                                  { key: 'total_amount', label: 'Total Amount' },
                                  { key: 'work_description', label: 'Work Description' },
                                  { key: 'labour_sale_expected', label: 'Labour Sale Expected' },
                                  { key: 'part_sale_expected', label: 'Part Sale Expected' },
                                  { key: 'remark', label: 'Remark' },
                                  { key: 'engineer_name', label: 'Engineer Name' },
                                  { key: 'engineer_uid', label: 'Engineer UID' },
                                  { key: 'employee_id', label: 'Employee ID' },
                                  { key: 'ho_corrected_km', label: 'HO Corrected KM' },
                                  { key: 'ho_remark', label: 'HO Remark' },
                                  { key: 'verification_status', label: 'Status' },
                                  { key: 'created_by', label: 'Created By' },
                                ]
                              )}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md shadow-sm"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                              </svg>
                              Export
                            </button>
                          )}
                          {salesVerifiedOnly && (
                            <button
                              onClick={() => setSalesVerifiedOnly(false)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              title="Showing only verified records — click to show all"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Verified Only
                              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          <span className="text-[11px] text-gray-600">Engineer:</span>
                          <span className="text-[11px] font-bold text-purple-700">{salesSelectedPeriod.engineerName}</span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Period:</span>
                          <span className="text-[11px] font-bold text-gray-800">
                            {salesSelectedPeriod.periodStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' → '}
                            {salesSelectedPeriod.periodEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Records:</span>
                          <span className="text-[11px] font-bold text-gray-800">{salesSelectedPeriod.records.length}</span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Total KM:</span>
                          <span className="text-[11px] font-bold text-blue-700">
                            {salesSelectedPeriod.totalKm.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Total:</span>
                          <span className="text-[11px] font-bold text-purple-700">
                            ₹{salesSelectedPeriod.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Verified:</span>
                          <span className="text-[11px] font-bold text-emerald-700">
                            ₹{salesSelectedPeriod.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setSalesHoKmFilter(v => !v)}
                            className={
                              salesHoKmFilter
                                ? "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white"
                                : "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50"
                            }
                            style={salesHoKmFilter ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)' } : undefined}
                            title={salesHoKmFilter ? 'Hiding rows without HO Corrected KM — click to clear' : 'Show only rows where HO Corrected KM is filled'}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                            </svg>
                            HO Verify KM only
                            {salesHoKmFilter && (
                              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        </div>

                        <div className="overflow-auto" style={{ maxHeight: '650px', scrollbarWidth: 'thin' }}>
                          <table className="border-collapse w-full" style={{ minWidth: '2320px' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {[
                                  { label: 'Sr.', w: '50px' },
                                  { label: 'Date', w: '100px' },
                                  { label: 'SR/Invoice/Engine', w: '150px' },
                                  { label: 'Customer Name', w: '160px' },
                                  { label: 'Location', w: '140px' },
                                  { label: '1 Way KM', w: '90px' },
                                  { label: '2 Way KM', w: '90px' },
                                  { label: 'Amount', w: '100px' },
                                  { label: 'DA', w: '80px' },
                                  { label: 'Total Amount', w: '110px' },
                                  { label: 'Work Description', w: '200px' },
                                  { label: 'Labour Sale Exp.', w: '110px' },
                                  { label: 'Part Sale Exp.', w: '110px' },
                                  { label: 'Remark', w: '150px' },
                                  { label: 'Engineer Name', w: '150px' },
                                  { label: 'Engineer UID', w: '110px' },
                                  { label: 'Employee ID', w: '100px' },
                                  { label: 'HO Corrected KM', w: '110px' },
                                  { label: 'HO Remark', w: '160px' },
                                  { label: 'Status', w: '95px' },
                                  { label: 'Created By', w: '110px' },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-2 py-2 text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap"
                                    style={{ width: c.w, minWidth: c.w, backgroundColor: '#f0f1ff' }}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {salesSelectedPeriod.records
                                .filter(r => !salesHoKmFilter || (r.ho_corrected_km !== null && r.ho_corrected_km !== undefined && String(r.ho_corrected_km).trim() !== ''))
                                .filter(r => !salesVerifiedOnly || r.verification_status === 'Verified')
                                .map((rec, idx) => {
                                  const isVerified = rec.verification_status === 'Verified';
                                  return (
                                    <tr key={rec.id || idx} className="hover:bg-blue-50/30" style={{ height: '32px' }}>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{idx + 1}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 whitespace-nowrap">
                                        {rec.date ? new Date(rec.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.sr_invoice_engine_no || rec.sr_number || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.customer_name || ''}>{rec.customer_name || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.location || ''}>{rec.location || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.one_way_km || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-semibold">{rec.two_way_km || rec.km_two_way || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        {rec.amount && parseFloat(rec.amount) !== 0 ? `₹${parseFloat(rec.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 text-green-700 font-semibold">
                                        {rec.da && parseFloat(rec.da) !== 0 ? `₹${rec.da}` : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold text-blue-700">
                                        {rec.total_amount && parseFloat(rec.total_amount) !== 0
                                          ? `₹${parseFloat(rec.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                          : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.work_description || rec.description_of_work || ''}>{rec.work_description || rec.description_of_work || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        {rec.labour_sale_expected && parseFloat(rec.labour_sale_expected) !== 0 ? `₹${parseFloat(rec.labour_sale_expected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        {rec.part_sale_expected && parseFloat(rec.part_sale_expected) !== 0 ? `₹${parseFloat(rec.part_sale_expected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.remark || ''}>{rec.remark || '-'}</div></td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate font-semibold text-black" title={rec.engineer_name || ''}>{rec.engineer_name || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.engineer_uid || rec.service_engineer_uid || ''}>{rec.engineer_uid || rec.service_engineer_uid || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.employee_id || ''}>{rec.employee_id || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.ho_corrected_km || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.ho_remark || ''}>{rec.ho_remark || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-center border-r border-gray-100">
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                          {rec.verification_status || 'Pending'}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center">
                                        <div className="truncate" title={rec.created_by || ''}>{rec.created_by || '-'}</div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  )}
                  {/* ── KM WISE branch ── */}
                  {tadaSubTab === 'submitted' && submittedInnerTab === 'km_wise' && (
                    loadingKmWise ? (
                      <div className="text-center py-16">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading KM Wise records…</p>
                      </div>
                    ) : kmWiseRecords.length === 0 ? (
                      <div className="text-center py-16">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No KM Wise records yet</p>
                        <p className="text-xs text-gray-400 mt-1">Add KM Wise entries from the Manual modal to see them here</p>
                      </div>
                    ) : !kmWiseSelectedPeriod ? (
                      <div className="overflow-auto" style={{ maxHeight: '700px', scrollbarWidth: 'thin' }}>
                        <table className="border-collapse w-full" style={{ minWidth: '1280px' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {[
                                { label: 'Sr. No.', w: '60px' },
                                { label: 'Date Range', w: '260px' },
                                { label: 'Engineer Name', w: '180px' },
                                { label: 'Number of Activity', w: '120px' },
                                { label: 'Total Amount', w: '140px' },
                                { label: 'Verified Amount', w: '140px' },
                                { label: 'Verify Data', w: '140px' },
                              ].map((c, i) => (
                                <th key={i}
                                  className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap"
                                  style={{ width: c.w, minWidth: c.w, backgroundColor: '#f0f1ff' }}>
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {kmWisePeriodGroups.map((g, idx) => {
                              const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                              return (
                                <tr
                                  key={g.key}
                                  className="hover:bg-blue-50 transition-colors"
                                  style={{ height: '38px' }}
                                >
                                  <td className="px-3 py-1 text-[12px] text-center font-medium border-r border-gray-100">{idx + 1}</td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                    <span
                                      onClick={() => setKmWiseSelectedPeriod(g)}
                                      className="inline-flex items-center gap-1.5 underline cursor-pointer transition-all hover:font-bold"
                                      style={{ color: themeColor, textUnderlineOffset: '2px' }}
                                      title="Click to view this period's KM Wise records"
                                    >
                                      <span>{fmt(g.periodStart)}</span>
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                      </svg>
                                      <span>{fmt(g.periodEnd)}</span>
                                    </span>
                                  </td>
                                  <td className="px-3 py-1 text-center border-r border-gray-100">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${g.entryType === 'BM' ? 'bg-indigo-100 text-indigo-700' : 'bg-cyan-100 text-cyan-700'}`}>
                                      {g.entryType || 'SE'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-semibold text-black">
                                    {g.engineerName}
                                  </td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.records.length}</td>                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-purple-700 whitespace-nowrap">
                                    ₹{g.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-emerald-700 whitespace-nowrap">
                                    ₹{g.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-1 text-center">
                                    <button
                                      onClick={() => {
                                        setKmWiseSelectedPeriod(g);
                                        setKmWiseVerifiedOnly(true);
                                      }}
                                      disabled={g.verifiedCount === 0}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-bold rounded-md shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                      style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                      title={g.verifiedCount > 0 ? `Show ${g.verifiedCount} verified record(s)` : 'No verified records in this period'}
                                    >
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      Verify Data ({g.verifiedCount})
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="sticky bottom-0">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td colSpan={3} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                                Grand Total ({kmWisePeriodGroups.length} period{kmWisePeriodGroups.length === 1 ? '' : 's'})
                              </td>
                              <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">
                                {kmWisePeriodGroups.reduce((s, g) => s + g.records.length, 0)}
                              </td>
                              <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700 whitespace-nowrap">
                                ₹{kmWisePeriodGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">
                                ₹{kmWisePeriodGroups.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="border-t-2 border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <>
                        <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => { setKmWiseSelectedPeriod(null); setKmWiseHoKmFilter(false); setKmWiseVerifiedOnly(false); }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md"
                            style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                          </button>
                          {canExport && (
                            <button
                              onClick={() => exportToExcel(
                                kmWiseSelectedPeriod.records
                                  .filter(r => !kmWiseHoKmFilter || (r.ho_corrected_km !== null && r.ho_corrected_km !== undefined && String(r.ho_corrected_km).trim() !== ''))
                                  .filter(r => !kmWiseVerifiedOnly || r.verification_status === 'Verified'),
                                `km_wise_${userBranch}.xlsx`,
                                [
                                  { key: 'date', label: 'Date' },
                                  { key: 'engineer_name', label: 'Engineer Name' },
                                  { key: 'customer_name', label: 'Customer Name' },
                                  { key: 'sr_invoice_engine_no', label: 'SR / Invoice / Engine No.' },
                                  { key: 'work_description', label: 'Work Description' },
                                  { key: 'km', label: 'KM' },
                                  { key: 'rate', label: 'Rate' },
                                  { key: 'da', label: 'DA' },
                                  { key: 'amount', label: 'Amount' },
                                  { key: 'work_status', label: 'Work Status' },
                                  { key: 'asset_count', label: 'Asset Count' },
                                  { key: 'kva_hp', label: 'KVA / HP' },
                                  { key: 'ho_corrected_km', label: 'HO Corrected KM' },
                                  { key: 'ho_remark', label: 'HO Remark' },
                                  { key: 'verification_status', label: 'Status' },
                                  { key: 'created_by', label: 'Created By' },
                                ]
                              )}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md shadow-sm"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                              </svg>
                              Export
                            </button>
                          )}
                          {kmWiseVerifiedOnly && (
                            <button
                              onClick={() => setKmWiseVerifiedOnly(false)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              title="Showing only verified records — click to show all"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Verified Only
                              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          <span className="text-[11px] text-gray-600">Period:</span>
                          <span className="text-[11px] font-bold text-gray-800">
                            {kmWiseSelectedPeriod.periodStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' → '}
                            {kmWiseSelectedPeriod.periodEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Records:</span>
                          <span className="text-[11px] font-bold text-gray-800">{kmWiseSelectedPeriod.records.length}</span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Total KM:</span>
                          <span className="text-[11px] font-bold text-blue-700">
                            {kmWiseSelectedPeriod.totalKm.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Total:</span>
                          <span className="text-[11px] font-bold text-purple-700">
                            ₹{kmWiseSelectedPeriod.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Verified:</span>
                          <span className="text-[11px] font-bold text-emerald-700">
                            ₹{kmWiseSelectedPeriod.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setKmWiseHoKmFilter(v => !v)}
                            className={
                              kmWiseHoKmFilter
                                ? "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white"
                                : "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50"
                            }
                            style={kmWiseHoKmFilter ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)' } : undefined}
                            title={kmWiseHoKmFilter ? 'Hiding rows without HO Corrected KM — click to clear' : 'Show only rows where HO Corrected KM is filled'}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                            </svg>
                            HO Verify KM only
                            {kmWiseHoKmFilter && (
                              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        </div>
                        <div className="overflow-auto" style={{ maxHeight: '650px', scrollbarWidth: 'thin' }}>
                          <table className="border-collapse w-full" style={{ minWidth: '1950px' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {[
                                  { label: 'Sr.No', w: '50px' },
                                  { label: 'Date', w: '100px' },
                                  { label: 'Engineer Name', w: '150px' },
                                  { label: 'Customer Name', w: '160px' },
                                  { label: 'SR / Invoice / Engine No.', w: '160px' },
                                  { label: 'Work Description', w: '200px' },
                                  { label: 'KM', w: '70px' },
                                  { label: 'Rate', w: '80px' },
                                  { label: 'DA', w: '80px' },
                                  { label: 'Amount', w: '110px' },
                                  { label: 'Work Status', w: '110px' },
                                  { label: 'Asset Count', w: '90px' },
                                  { label: 'KVA / HP', w: '90px' },
                                  { label: 'HO Corrected KM', w: '110px' },
                                  { label: 'HO Remark', w: '160px' },
                                  { label: 'Status', w: '95px' },
                                  { label: 'Created By', w: '110px' },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-2 py-2 text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap"
                                    style={{ width: c.w, minWidth: c.w, backgroundColor: '#f0f1ff' }}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {kmWiseSelectedPeriod.records
                                .filter(r => !kmWiseHoKmFilter || (r.ho_corrected_km !== null && r.ho_corrected_km !== undefined && String(r.ho_corrected_km).trim() !== ''))
                                .filter(r => !kmWiseVerifiedOnly || r.verification_status === 'Verified')
                                .map((rec, idx) => {
                                  const isVerified = rec.verification_status === 'Verified';
                                  return (
                                    <tr key={rec.id || idx} className="hover:bg-blue-50/30" style={{ height: '32px' }}>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{idx + 1}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 whitespace-nowrap">
                                        {rec.date ? new Date(rec.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate font-semibold text-black" title={rec.engineer_name || ''}>{rec.engineer_name || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.customer_name || ''}>{rec.customer_name || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.sr_invoice_engine_no || ''}>{rec.sr_invoice_engine_no || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.work_description || ''}>{rec.work_description || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-semibold">{rec.km || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.rate ? `₹${rec.rate}` : '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 text-green-700 font-semibold">
                                        {rec.da && parseFloat(rec.da) !== 0 ? `₹${rec.da}` : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold text-blue-700">
                                        {rec.amount && parseFloat(rec.amount) !== 0
                                          ? `₹${parseFloat(rec.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                          : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.work_status || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.asset_count || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.kva_hp || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.ho_corrected_km || '-'}</td>
                                      <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">
                                        <div className="truncate" title={rec.ho_remark || ''}>{rec.ho_remark || '-'}</div>
                                      </td>
                                      <td className="px-2 py-1 text-center border-r border-gray-100">
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                          {rec.verification_status || 'Pending'}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1 text-[11px] text-center">
                                        <div className="truncate" title={rec.created_by || ''}>{rec.created_by || '-'}</div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )
                  )}

                  {/* ── BILL WISE branch (no KM column) ── */}
                  {tadaSubTab === 'submitted' && submittedInnerTab === 'bill_wise' && (
                    loadingBillWise ? (
                      <div className="text-center py-16">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading Bill Wise records…</p>
                      </div>
                    ) : billWiseRecords.length === 0 ? (
                      <div className="text-center py-16">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No Bill Wise records yet</p>
                        <p className="text-xs text-gray-400 mt-1">Add Bill Wise entries from the Manual modal to see them here</p>
                      </div>
                    ) : !billWiseSelectedPeriod ? (
                      !selectedBillWiseVoucher ? (() => {
                        const bwVoucherGroups = buildVoucherGroupsByDate(
                          billWiseRecords, (r) => parseFloat(r.amount || 0) || 0
                        );
                        const fmt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                        return (
                          <div className="overflow-auto" style={{ maxHeight: '700px', scrollbarWidth: 'thin' }}>
                            <table className="border-collapse w-full" style={{ minWidth: '1180px' }}>
                              <thead className="sticky top-0 z-10">
                                <tr style={{ backgroundColor: '#f0f1ff' }}>
                                  {['Sr. No.', 'Date Range', 'Submitted By', 'Voucher No.', 'Records', 'Total Amount', 'Verified Amount'].map((l, i) => (
                                    <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap" style={{ backgroundColor: '#f0f1ff' }}>{l}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {bwVoucherGroups.map((g, idx) => (
                                  <tr key={g.voucher} className="hover:bg-blue-50" style={{ height: '38px' }}>
                                    <td className="px-3 py-1 text-[12px] text-center font-medium border-r border-gray-100">{idx + 1}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 whitespace-nowrap">{g.start && g.end ? `${fmt(g.start)} → ${fmt(g.end)}` : '-'}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-semibold text-black">{g.submittedBy}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                      <span onClick={() => setSelectedBillWiseVoucher(g)} className="underline cursor-pointer hover:font-bold font-mono" style={{ color: themeColor }}>{g.voucher}</span>
                                    </td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.rows.length}</td>
                                    <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-purple-700 whitespace-nowrap">₹{g.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-3 py-1 text-[12px] text-center font-bold text-emerald-700 whitespace-nowrap">₹{g.verified.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="sticky bottom-0">
                                <tr style={{ backgroundColor: '#f0f1ff' }}>
                                  <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total ({bwVoucherGroups.length} voucher{bwVoucherGroups.length === 1 ? '' : 's'})</td>
                                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">{bwVoucherGroups.reduce((s, g) => s + g.rows.length, 0)}</td>
                                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700 whitespace-nowrap">₹{bwVoucherGroups.reduce((s, g) => s + g.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">₹{bwVoucherGroups.reduce((s, g) => s + g.verified, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        );
                      })() : (() => {
                        const bwEngineerGroups = groupBillWiseByEngineer(selectedBillWiseVoucher.rows);
                        return (
                          <>
                            <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
                              <button onClick={() => setSelectedBillWiseVoucher(null)} className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                Back to Vouchers
                              </button>
                              <span className="text-[11px] text-gray-600">Voucher:</span>
                              <span className="text-[11px] font-bold font-mono text-gray-800">{selectedBillWiseVoucher.voucher}</span>
                              <button
                                onClick={() => printBillWiseVoucherReport(selectedBillWiseVoucher)}
                                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md shadow-sm"
                                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                                title={`Print all records in voucher ${selectedBillWiseVoucher.voucher}`}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print All Engineers
                              </button>
                            </div>
                            <div className="overflow-auto" style={{ maxHeight: '650px', scrollbarWidth: 'thin' }}>
                              <table className="border-collapse w-full" style={{ minWidth: '1200px' }}>
                                <thead className="sticky top-0 z-10">
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    {[
                                      { label: 'Sr. No.', w: '60px' }, { label: 'Date Range', w: '240px' }, { label: 'Type', w: '70px' }, { label: 'Engineer / Customer', w: '180px' },
                                      { label: 'Number of Activity', w: '120px' }, { label: 'Total Amount', w: '150px' }, { label: 'Verified Amount', w: '150px' }, { label: 'Verify Data', w: '140px' },
                                    ].map((c, i) => (
                                      <th key={i} className="px-3 py-2 text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap" style={{ width: c.w, minWidth: c.w, backgroundColor: '#f0f1ff' }}>{c.label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {bwEngineerGroups.map((g, idx) => {
                                    const fmt = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                                    return (
                                      <tr key={g.key} className="hover:bg-blue-50" style={{ height: '38px' }}>
                                        <td className="px-3 py-1 text-[12px] text-center font-medium border-r border-gray-100">{idx + 1}</td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                          <span onClick={() => setBillWiseSelectedPeriod(g)} className="inline-flex items-center gap-1.5 underline cursor-pointer hover:font-bold" style={{ color: themeColor }}>
                                            <span>{fmt(g.periodStart)}</span>
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                            <span>{fmt(g.periodEnd)}</span>
                                          </span>
                                        </td>
                                        <td className="px-3 py-1 text-center border-r border-gray-100">
                                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${g.entryType === 'BM' ? 'bg-indigo-100 text-indigo-700' : 'bg-cyan-100 text-cyan-700'}`}>{g.entryType || 'SE'}</span>
                                        </td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100">
                                          <div className="flex items-center justify-center gap-1.5">
                                            <span className="font-semibold text-black">{g.engineerName}</span>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); printBillWiseEngineerReport(g.records, g.engineerName, selectedBillWiseVoucher.voucher); }}
                                              className="inline-flex items-center justify-center text-purple-600 hover:text-purple-800"
                                              title={`Print ${g.engineerName}'s records (Voucher ${selectedBillWiseVoucher.voucher})`}
                                            >
                                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                              </svg>
                                            </button>
                                          </div>
                                        </td>                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold">{g.records.length}</td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-purple-700 whitespace-nowrap">₹{g.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-1 text-[12px] text-center border-r border-gray-100 font-bold text-emerald-700 whitespace-nowrap">₹{g.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-1 text-center">
                                          <button onClick={() => { setBillWiseSelectedPeriod(g); setBillWiseVerifiedOnly(true); }} disabled={g.verifiedCount === 0} className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-bold rounded-md disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Verify Data ({g.verifiedCount})
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="sticky bottom-0">
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total ({bwEngineerGroups.length} group{bwEngineerGroups.length === 1 ? '' : 's'})</td>
                                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200">{bwEngineerGroups.reduce((s, g) => s + g.records.length, 0)}</td>
                                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-purple-700 whitespace-nowrap">₹{bwEngineerGroups.reduce((s, g) => s + g.totalAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-3 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 text-emerald-700 whitespace-nowrap">₹{bwEngineerGroups.reduce((s, g) => s + g.verifiedAmount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="border-t-2 border-gray-200" />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <div className="px-3 py-2 border-b bg-blue-50 flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => { setBillWiseSelectedPeriod(null); setBillWiseVerifiedOnly(false); }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md"
                            style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                          </button>
                          {canExport && (() => {
                            const isBM = (billWiseSelectedPeriod.records[0]?.entry_type) === 'BM';
                            const rows = billWiseSelectedPeriod.records.filter(r => !billWiseVerifiedOnly || r.verification_status === 'Verified');
                            const bmCols = [
                              { key: 'date', label: 'Date' },
                              { key: 'customer_name', label: 'Customer Name' },
                              { key: 'sr_invoice_engine_no', label: 'SR No. / Inv / Engine' },
                              { key: 'installation_site_address', label: 'Location' },
                              { key: 'expenses_head', label: 'Expense Head' },
                              { key: 'amount', label: 'Amount' },
                              { key: 'bill_submitted', label: 'Bill Submitted' },
                              { key: 'work_description', label: 'Work Description' },
                              { key: 'remark', label: 'Remark' },
                              { key: 'work_status', label: 'Work Status' },
                              { key: 'created_by', label: 'Employee Name' },
                              { key: 'verification_status', label: 'Status' },
                            ];
                            const seCols = [
                              { key: 'date', label: 'Date' },
                              { key: 'service_request_no', label: 'SR No.' },
                              { key: 'account', label: 'Account' },
                              { key: 'installation_site_address', label: 'Installation Site Address' },
                              { key: 'sr_type', label: 'SR Type' },
                              { key: 'expenses_head', label: 'Expense Head' },
                              { key: 'amount', label: 'Amount' },
                              { key: 'work_description', label: 'Work Description' },
                              { key: 'kms_travelled', label: 'KMs Travelled' },
                              { key: 'task_status', label: 'Task Status' },
                              { key: 'appointment_number', label: 'Appointment No.' },
                              { key: 'task_start_date', label: 'Task Start Date' },
                              { key: 'task_end_date', label: 'Task End Date' },
                              { key: 'engineer_name', label: 'Engineer' },
                              { key: 'employee_id', label: 'Emp ID' },
                              { key: 'service_engineer_uid', label: 'UID' },
                              { key: 'bill_submitted', label: 'Bill Submitted' },
                              { key: 'verification_status', label: 'Status' },
                              { key: 'created_by', label: 'Created By' },
                            ];
                            return (
                              <button
                                onClick={() => exportToExcel(rows, `bill_wise_${billWiseSelectedPeriod.engineerName}_${userBranch}.xlsx`, isBM ? bmCols : seCols)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-white text-[10px] font-semibold rounded-md shadow-sm"
                                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                </svg>
                                Export
                              </button>
                            );
                          })()}
                          {billWiseVerifiedOnly && (
                            <button
                              onClick={() => setBillWiseVerifiedOnly(false)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white"
                              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              title="Showing only verified records — click to show all"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Verified Only
                              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          <span className="text-[11px] text-gray-600">{billWiseSelectedPeriod.entryType === 'BM' ? 'Employee:' : 'Engineer:'}</span>
                          <span className="text-[11px] font-bold text-purple-700">{billWiseSelectedPeriod.engineerName}</span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Period:</span>
                          <span className="text-[11px] font-bold text-gray-800">
                            {billWiseSelectedPeriod.periodStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' → '}
                            {billWiseSelectedPeriod.periodEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Records:</span>
                          <span className="text-[11px] font-bold text-gray-800">{billWiseSelectedPeriod.records.length}</span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Total:</span>
                          <span className="text-[11px] font-bold text-purple-700">
                            ₹{billWiseSelectedPeriod.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-[11px] text-gray-600">Verified:</span>
                          <span className="text-[11px] font-bold text-emerald-700">
                            ₹{billWiseSelectedPeriod.verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        {(() => {
                          const isBM = (billWiseSelectedPeriod.records[0]?.entry_type) === 'BM';
                          const money = v => v && parseFloat(v) !== 0 ? `₹${parseFloat(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';

                          const seCols = [
                            { label: 'Sr.No.', w: '50px' }, { label: 'Date', w: '100px' }, { label: 'SR No.', w: '150px' },
                            { label: 'Account', w: '150px' }, { label: 'Installation Site Address', w: '110px' },
                            { label: 'SR Type', w: '110px' }, { label: 'Expense Head', w: '150px' },
                            { label: 'Amount', w: '110px' }, { label: 'Work Description', w: '200px' },
                            { label: 'KMs Travelled', w: '100px' }, { label: 'Task Status', w: '110px' },
                            { label: 'Appointment No.', w: '130px' }, { label: 'Task Start Date', w: '120px' },
                            { label: 'Task End Date', w: '120px' }, { label: 'Engineer', w: '170px' },
                            { label: 'Emp ID', w: '90px' }, { label: 'UID', w: '100px' }, { label: 'Bill Submitted', w: '90px' },
                            { label: 'Status', w: '95px' }, { label: 'Created By', w: '120px' },
                          ];
                          const bmCols = [
                            { label: 'Sr.No.', w: '50px' }, { label: 'Date', w: '100px' },
                            { label: 'Customer Name', w: '170px' }, { label: 'SR No. / Inv / Engine', w: '170px' },
                            { label: 'Location', w: '150px' },
                            { label: 'Expense Head', w: '150px' }, { label: 'Amount', w: '110px' },
                            { label: 'Bill Submitted', w: '100px' },
                            { label: 'Work Description', w: '220px' }, { label: 'Remark', w: '160px' }, { label: 'Work Status', w: '110px' },
                            { label: 'Employee Name', w: '170px' }, { label: 'Status', w: '95px' },
                          ];
                          const cols = isBM ? bmCols : seCols;
                          const rows = billWiseSelectedPeriod.records.filter(r => !billWiseVerifiedOnly || r.verification_status === 'Verified');

                          return (
                            <div className="overflow-auto" style={{ maxHeight: '650px', scrollbarWidth: 'thin' }}>
                              <table className="border-collapse w-full" style={{ minWidth: isBM ? '1760px' : '2550px' }}>
                                <thead className="sticky top-0 z-10">
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    {cols.map((c, i) => (
                                      <th key={i}
                                        className="px-2 py-2 text-[10px] font-bold text-gray-700 uppercase tracking-wide border-b-2 border-r border-gray-200 last:border-r-0 text-center whitespace-nowrap"
                                        style={{ width: c.w, minWidth: c.w, backgroundColor: '#f0f1ff' }}>
                                        {c.label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {rows.map((rec, idx) => {
                                    const isVerified = rec.verification_status === 'Verified';
                                    return (
                                      <tr key={rec.id || idx} className="hover:bg-blue-50/30" style={{ height: '32px' }}>
                                        <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{idx + 1}</td>
                                        <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 whitespace-nowrap">
                                          {rec.date ? new Date(rec.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                        </td>

                                        {isBM ? (
                                          <>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.customer_name || ''}>{rec.customer_name || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.sr_invoice_engine_no || ''}>{rec.sr_invoice_engine_no || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.installation_site_address || ''}>{rec.installation_site_address || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.expenses_head || ''}>{rec.expenses_head || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold text-blue-700">{money(rec.amount)}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.bill_submitted || '-'}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.work_description || ''}>{rec.work_description || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.remark || ''}>{rec.remark || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.work_status || '-'}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate font-semibold text-black" title={rec.created_by || ''}>{rec.created_by || '-'}</div></td>
                                          </>
                                        ) : (
                                          <>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.service_request_no || ''}>{rec.service_request_no || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.account || ''}>{rec.account || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate max-w-[110px] mx-auto" title={rec.installation_site_address || ''}>{rec.installation_site_address || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.sr_type || ''}>{rec.sr_type || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.expenses_head || ''}>{rec.expenses_head || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100 font-bold text-blue-700">{money(rec.amount)}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.work_description || ''}>{rec.work_description || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.kms_travelled || '-'}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.task_status || '-'}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.appointment_number || ''}>{rec.appointment_number || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.task_start_date || '-'}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.task_end_date || '-'}</td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate font-semibold text-black" title={rec.engineer_name || ''}>{rec.engineer_name || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.employee_id || ''}>{rec.employee_id || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100"><div className="truncate" title={rec.service_engineer_uid || ''}>{rec.service_engineer_uid || '-'}</div></td>
                                            <td className="px-2 py-1 text-[11px] text-center border-r border-gray-100">{rec.bill_submitted || '-'}</td>
                                          </>
                                        )}

                                        <td className="px-2 py-1 text-center border-r border-gray-100">
                                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {rec.verification_status || 'Pending'}
                                          </span>
                                        </td>

                                        {!isBM && (
                                          <td className="px-2 py-1 text-[11px] text-center"><div className="truncate" title={rec.created_by || ''}>{rec.created_by || '-'}</div></td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </>
                    )
                  )}
                </>
              ) : isSubmittedView ? (
                /* SUBMITTED TABLE - matches HOExpense engineer details structure */
                activeRecords.length === 0 ? (
                  <div className="text-center py-16">
                    <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm text-gray-500 font-medium">No submitted records yet</p>
                    <p className="text-xs text-gray-400 mt-1">Submit drafts and they'll appear here</p>
                  </div>
                ) : (
                  <>
                    <div
                      ref={submittedTopScrollBarRef}
                      className="overflow-x-auto border-b border-gray-200 bg-gray-50"
                      style={{ scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9', overflowY: 'hidden' }}
                    >
                      <div style={{ width: '3400px', height: '1px' }} />
                    </div>
                    <div
                      ref={submittedTableContainerRef}
                      className="overflow-auto"
                      style={{ maxHeight: '700px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}
                    >
                      <style>{`
  .submitted-tada-table { table-layout: fixed !important; }
  .submitted-tada-table th:nth-child(2),
  .submitted-tada-table td:nth-child(2) {
   width: 140px !important;
  min-width: 140px !important;
  max-width: 140px !important;
  }
  .submitted-tada-table th:nth-child(3),
  .submitted-tada-table td:nth-child(3) {
    width: 80px !important;
    min-width: 80px !important;
    max-width: 80px !important;
  }
  .submitted-tada-table th:nth-child(4),
  .submitted-tada-table td:nth-child(4) {
    width: 90px !important;
    min-width: 90px !important;
    max-width: 90px !important;
  }
  .submitted-tada-table th {
    white-space: normal !important;
    word-break: break-word !important;
    line-height: 1.15 !important;
  }
  .submitted-tada-table td {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`}</style>
                      <table className="border-collapse submitted-tada-table" style={{ minWidth: '3270px', tableLayout: 'fixed' }}>
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b-2 border-gray-200" style={{ backgroundColor: '#f0f1ff' }}>
                            {[
                              { label: 'Sr. No.', width: 30 },
                              { label: 'Installation Site Address', width: 80 },
                              { label: 'Account', width: 90 },
                              { label: 'Service Request No.', width: 100 },
                              { label: 'SR Sub Type', width: 75 },
                              { label: 'SR Trip Start Date & Time', width: 105 },
                              { label: 'SR Reach at Site Date & Time', width: 110 },
                              { label: 'KMs Travelled', width: 75 },
                              { label: 'Two Way KM', width: 75 },
                              { label: 'Branch Verified KM', width: 95 },
                              { label: 'Branch Verification Remark', width: 130 },
                              { label: 'HO Corrected KM', width: 95 },
                              { label: 'DA Amount', width: 75 },
                              { label: 'Freight Charges', width: 80 },
                              { label: 'Total Amount', width: 85 },
                              { label: 'HO Remark', width: 130 },
                              { label: 'Voucher No.', width: 130 },
                              { label: 'Appointment No.', width: 95 },
                              { label: 'SR Type', width: 70 },
                              { label: 'SR Due Date', width: 80 },
                              { label: 'Task Start Date', width: 85 },
                              { label: 'Task End Date', width: 85 },
                              { label: 'Task Status', width: 75 },
                              { label: 'Task Assigned Date & Time', width: 105 },
                              { label: 'Task Assign vs Trip Start', width: 100 },
                              { label: 'SR Trip Start Lat Long', width: 120 },
                              { label: 'SR Reach at Site Lat Long', width: 125 },
                              { label: 'SR Closed Date', width: 85 },
                              { label: 'SR Status', width: 75 },
                              { label: 'Service Engineer Name', width: 105 },
                              { label: 'Service Engineer UID', width: 95 },
                              { label: 'Employee ID', width: 90 },
                              { label: 'Status', width: 80 },
                              { label: 'Uploaded By', width: 105 },
                              { label: 'Uploaded At', width: 115 },
                            ].map((col, i) => {
                              if (col.label === 'Task Status') {
                                const isActive = mainTaskStatusFilter.size > 0;
                                return (
                                  <th key={i}
                                    className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r last:border-r-0 border-gray-300 uppercase tracking-tight text-center leading-[1.1] align-middle"
                                    style={{
                                      width: `${col.width}px`,
                                      minWidth: `${col.width}px`,
                                      backgroundColor: '#f0f1ff',
                                      whiteSpace: 'normal',
                                      wordBreak: 'break-word',
                                      height: '32px',
                                    }}>
                                    <div className="flex items-center justify-center gap-1">
                                      <span>{col.label}</span>
                                      <button
                                        onClick={(e) => openTaskStatusFilter(e, submittedRecords, mainTaskStatusFilter, setMainTaskStatusFilter)}
                                        className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                        title={isActive ? `Filtering: ${mainTaskStatusFilter.size} value(s)` : 'Filter Task Status'}
                                      >
                                        <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                                        </svg>
                                      </button>
                                    </div>
                                  </th>
                                );
                              }
                              return (
                                <th key={i}
                                  className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r last:border-r-0 border-gray-300 uppercase tracking-tight text-center leading-[1.1] align-middle"
                                  style={{
                                    width: `${col.width}px`,
                                    minWidth: `${col.width}px`,
                                    backgroundColor: '#f0f1ff',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word',
                                    height: '32px',
                                  }}>
                                  {col.label}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {activeRecords.map((rec, idx) => {
                            const isVerified = rec.verification_status === 'Verified';
                            const calcDA = submittedDAAmounts[rec.id];
                            const displayDA = calcDA !== undefined ? calcDA : (rec.da_amount || null);
                            const calcTotal = submittedTotalAmounts[rec.id];
                            const displayTotal = calcTotal !== undefined ? calcTotal : (rec.total_amount || null);

                            // KM Rate - calculate dynamically same as HOExpense
                            const effectiveBranch = (() => {
                              let rate = kmRates[rec.sd_branch_code];
                              if (rate && (parseFloat(rate.range_amount) > 0 || parseFloat(rate.above_amount) > 0 || parseFloat(rate.km_rate) > 0)) {
                                return rec.sd_branch_code;
                              }
                              const hoRate = kmRates['HO'];
                              if (hoRate && (parseFloat(hoRate.range_amount) > 0 || parseFloat(hoRate.above_amount) > 0 || parseFloat(hoRate.km_rate) > 0)) {
                                return 'HO';
                              }
                              return rec.sd_branch_code;
                            })();
                            const branchRate = kmRates[effectiveBranch];
                            const dynamicKmRate = branchRate && parseFloat(branchRate.km_rate) > 0 ? parseFloat(branchRate.km_rate) : null;
                            const displayKmRate = dynamicKmRate !== null ? dynamicKmRate : (rec.km_rate_applied || null);

                            return (
                              <tr key={rec.id || idx} className="hover:bg-blue-50/30 transition-colors duration-75" style={{ height: '24px' }}>
                                {/* Sr. No. */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '55px', minWidth: '55px' }}>{idx + 1}</td>
                                {/* Installation Site Address */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }} title={rec.installation_site_address}>{rec.installation_site_address || '-'}</td>
                                {/* Account */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} title={rec.account}>{rec.account || '-'}</td>
                                {/* Service Request No. */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '155px', minWidth: '155px' }}>{rec.service_request_no || '-'}</td>
                                {/* SR Sub Type */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '120px', minWidth: '120px' }}>{rec.sr_sub_type || '-'}</td>
                                {/* SR Trip Start Date & Time */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '185px', minWidth: '185px' }}>{rec.sr_trip_start_datetime || '-'}</td>
                                {/* SR Reach at Site Date & Time */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '195px', minWidth: '195px' }}>{rec.sr_reach_at_site_datetime || '-'}</td>
                                {/* KMs Travelled */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold" style={{ width: '105px', minWidth: '105px' }}>{rec.kms_travelled || '-'}</td>
                                {/* Two Way KM */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '100px', minWidth: '100px' }}>{rec.two_way_km || '-'}</td>
                                {/* Branch Verified KM */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '150px', minWidth: '150px' }}>{rec.branch_verified_km || '-'}</td>
                                {/* Branch Verification Remark */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }} title={rec.km_verification_remark}>{rec.km_verification_remark || '-'}</td>
                                {/* HO Corrected KM */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '150px', minWidth: '150px' }}>{rec.ho_corrected_km || '-'}</td>
                                {/* DA Amount */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold" style={{ width: '100px', minWidth: '100px' }}>
                                  {displayDA && parseFloat(displayDA) !== 0 ? (
                                    <span style={{ color: isVerified ? '#1e40af' : '#059669' }}>
                                      ₹{parseFloat(displayDA).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : <span className="text-gray-400">-</span>}
                                </td>
                                {/* Freight Charges */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold" style={{ width: '95px', minWidth: '95px' }}>
                                  {rec.freight_charges && parseFloat(rec.freight_charges) !== 0 ? (
                                    <span className="text-orange-700">
                                      ₹{parseFloat(rec.freight_charges).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : <span className="text-gray-400">-</span>}
                                </td>
                                {/* Total Amount */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold" style={{ width: '120px', minWidth: '120px' }}>
                                  {displayTotal && parseFloat(displayTotal) !== 0 ? (
                                    <span style={{ color: isVerified ? '#1e40af' : '#059669' }}>
                                      ₹{parseFloat(displayTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  ) : <span className="text-gray-400">-</span>}
                                </td>
                                {/* HO Remark */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }} title={rec.ho_remark}>{rec.ho_remark || '-'}</td>
                                {/* Voucher No. */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate font-mono" style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} title={rec.voucher_no}>{rec.voucher_no || '-'}</td>
                                {/* Appointment No. */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '140px', minWidth: '140px', maxWidth: '140px' }} title={rec.appointment_number}>{rec.appointment_number || '-'}</td>
                                {/* SR Type */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '100px', minWidth: '100px' }}>{rec.sr_type || '-'}</td>
                                {/* SR Due Date */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '115px', minWidth: '115px' }}>{fmtDate(rec.sr_due_date)}</td>
                                {/* Task Start Date */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '155px', minWidth: '155px' }}>{rec.task_start_date || '-'}</td>
                                {/* Task End Date */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '155px', minWidth: '155px' }}>{rec.task_end_date || '-'}</td>
                                {/* Task Status */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '100px', minWidth: '100px' }}>{rec.task_status || '-'}</td>
                                {/* Task Assigned Date & Time */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '185px', minWidth: '185px' }}>{rec.task_assigned_datetime || '-'}</td>
                                {/* Task Assign vs Trip Start */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '185px', minWidth: '185px' }}>{rec.task_assign_vs_trip_start || '-'}</td>
                                {/* SR Trip Start Lat Long */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '200px', minWidth: '200px' }}>{rec.sr_trip_start_lat_long || '-'}</td>
                                {/* SR Reach at Site Lat Long */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '200px', minWidth: '200px' }}>{rec.sr_reach_at_site_lat_long || '-'}</td>
                                {/* SR Closed Date */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '125px', minWidth: '125px' }}>{fmtDate(rec.sr_closed_date)}</td>
                                {/* SR Status */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-center" style={{ width: '120px', minWidth: '120px' }}>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] whitespace-nowrap ${rec.sr_status === 'Closed' ? 'bg-green-100 text-green-800' : rec.sr_status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {rec.sr_status || '-'}
                                  </span>
                                </td>
                                {/* Service Engineer Name */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '150px', minWidth: '150px', maxWidth: '150px' }} title={rec.service_engineer_name}>{rec.service_engineer_name || '-'}</td>
                                {/* Service Engineer UID */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} title={rec.service_engineer_uid}>{rec.service_engineer_uid || '-'}</td>
                                {/* Employee ID */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} title={rec.employee_id}>{rec.employee_id || '-'}</td>
                                {/* Status (Verification Status) */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-center" style={{ width: '110px', minWidth: '110px' }}>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                    {rec.verification_status || 'Pending'}
                                  </span>
                                </td>
                                {/* Uploaded By */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ width: '150px', minWidth: '150px', maxWidth: '150px' }} title={rec.uploaded_by}>{rec.uploaded_by || '-'}</td>
                                {/* Uploaded At */}
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center" style={{ width: '170px', minWidth: '170px' }}>
                                  {rec.uploaded_at ? new Date(rec.uploaded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              ) : (
                /* DRAFTS TABLE (Service Engineer only) */
                <>
                  <div
                    ref={topScrollBarRef}
                    className="overflow-x-auto border-b border-gray-200 bg-gray-50"
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#a5b4fc #f1f5f9',
                      overflowY: 'hidden'
                    }}
                  >
                    <div style={{ width: `${totalTableWidth}px`, height: '1px' }} />
                  </div>

                  <div
                    ref={tableContainerRef}
                    className={filteredRecords.length > 0 ? "overflow-auto" : "overflow-hidden"}
                    style={{ maxHeight: '700px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}
                  >
                    <table className="border-collapse"
                      style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px`, tableLayout: 'fixed' }}>
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b-2 border-gray-200" style={{ backgroundColor: '#f0f1ff' }}>
                          {columnOrder.map(key => {
                            const col = COL_MAP[key];
                            if (!col) return null;

                            if (key === 'select') {
                              const allSelected = filteredRecords.length > 0 && filteredRecords.every(r => tadaSelected[r.id]);
                              const someSelected = filteredRecords.some(r => tadaSelected[r.id]) && !allSelected;
                              return (
                                <th
                                  key={key}
                                  className="px-2 py-0.5 text-[10px] font-bold text-gray-700 border-r border-gray-300 text-center"
                                  style={{
                                    width: `${col.width}px`,
                                    minWidth: `${col.width}px`,
                                    backgroundColor: '#f0f1ff',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 20,
                                    boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    disabled
                                    className="cursor-not-allowed opacity-50"
                                    checked={allSelected}
                                    ref={el => { if (el) el.indeterminate = someSelected; }}
                                    title="Select rows individually"
                                  />
                                </th>
                              );
                            }

                            if (key === 'task_status') {
                              const isActive = mainTaskStatusFilter.size > 0;
                              return (
                                <th key={key}
                                  className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r last:border-r-0 border-gray-300 uppercase tracking-tight text-center leading-[1.1] align-middle"
                                  style={{
                                    width: `${col.width}px`,
                                    minWidth: `${col.width}px`,
                                    backgroundColor: '#f0f1ff',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word',
                                    height: '32px',
                                  }}>
                                  <div className="flex items-center justify-center gap-1">
                                    <span>{col.label}</span>
                                    <button
                                      onClick={(e) => openTaskStatusFilter(e, activeAllRecords, mainTaskStatusFilter, setMainTaskStatusFilter)}
                                      className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                      title={isActive ? `Filtering: ${mainTaskStatusFilter.size} value(s)` : 'Filter Task Status'}
                                    >
                                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                                      </svg>
                                    </button>
                                  </div>
                                </th>
                              );
                            }

                            return (
                              <th key={key}
                                className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r last:border-r-0 border-gray-300 uppercase tracking-tight text-center leading-[1.1] align-middle"
                                style={{
                                  width: `${col.width}px`,
                                  minWidth: `${col.width}px`,
                                  backgroundColor: '#f0f1ff',
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  height: '32px',
                                }}>
                                {col.label}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className={`divide-y divide-gray-100 transition-opacity duration-150 ${isSearching ? 'opacity-50' : 'opacity-100'}`}>
                        {filteredRecords.map((record, idx) => {
                          // Columns that should NOT open the detail modal when clicked
                          const NON_CLICKABLE_COLS = new Set(['select', 'branch_verified_km', 'km_verification_remark', 'freight_charges', 'km_rate', 'da_amount', 'total_amount', 'actions']);

                          // Block (dull) any TADA draft that already has a Bill Wise (SE) entry
                          const blockedByBillWise = isRecordBlockedByBillWise(record);

                          return (
                            <tr
                              key={`${record.id}-${idx}`}
                              className="hover:bg-blue-50/30 transition-colors duration-75"
                              style={{
                                height: '32px',
                                ...(blockedByBillWise ? { opacity: 0.45, backgroundColor: '#f3f4f6' } : {}),
                              }}
                              title={blockedByBillWise ? 'A Bill Wise (Service Engineer) entry exists for this record — verification is blocked' : undefined}
                            >
                              {columnOrder.map(key => {
                                const col = COL_MAP[key];
                                if (!col) return null;
                                const isSticky = key === 'select';
                                const isClickable = !NON_CLICKABLE_COLS.has(key);

                                return (
                                  <td
                                    key={key}
                                    className="px-2 py-0.5 border-r last:border-r-0 border-gray-100 overflow-hidden align-middle"
                                    onDoubleClick={(e) => {
                                      if (!isClickable) return;
                                      // Ignore clicks on interactive elements inside the cell
                                      if (e.target.closest('input, button, select, textarea, label, a, svg')) return;
                                      handleOpenCustomerDetail(record);
                                    }}
                                    style={{
                                      width: `${col.width}px`,
                                      minWidth: `${col.width}px`,
                                      maxWidth: `${col.width}px`,
                                      cursor: isClickable ? 'pointer' : 'default',
                                      ...(isSticky ? {
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 5,
                                        backgroundColor: 'white',
                                        boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                      } : {}),
                                    }}
                                    title={isClickable ? 'Double-click to view details & verify KM' : undefined}
                                  >
                                    {renderCell(record, key, idx)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div ref={sentinelRef} className="h-8" />

                    {loadingRecords && allRecords.length > 0 && (
                      <div className="text-center py-4 border-t border-gray-100">
                        <div className="inline-flex items-center gap-2 text-xs text-gray-500">
                          <svg className="animate-spin h-4 w-4" style={{ color: themeColor }} viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Loading more… ({allRecords.length} records loaded so far)
                        </div>
                      </div>
                    )}

                    {!hasMore && !loadingRecords && allRecords.length > 0 && (
                      <div className="text-center py-3">
                        <span className="text-[11px] text-gray-400 font-medium">
                          ✓ All records loaded · Showing {filteredRecords.length}
                          {!isAdmin && userBranch ? ` uploaded by Branch "${userBranch}"` : ''}
                        </span>
                      </div>
                    )}

                    {filteredRecords.length === 0 && allRecords.length > 0 && !loadingRecords && (
                      <div className="text-center py-16">
                        <svg className="h-12 w-12 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <p className="text-sm text-gray-500 font-medium">No records match your search</p>
                        <button onClick={() => setSearchTerm('')} className="mt-2 text-xs font-semibold underline" style={{ color: themeColor }}>Clear search</button>
                      </div>
                    )}
                  </div>

                  {!loadingRecords && allRecords.length === 0 && !hasMore && (
                    <div className="text-center py-16">
                      <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <p className="text-sm text-gray-500 font-medium">No TADA records found</p>
                      <p className="text-xs text-gray-400 mt-1">Click "Import File" to upload TADA data</p>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* History Modal — delegated to BranchTADAHistory */}
        {showHistoryModal && (
          <BranchTADAHistory
            branchCode={userBranch}
            branchName={getBranchLabel(userBranch)}
            themeColor={themeColor}
            canExport={canExport}
            onClose={() => setShowHistoryModal(false)}
          />
        )}

        {activeTab === 'office' && (
          <BranchOE
            user={user}
            userBranch={userBranch}
            isAdmin={isAdmin}
            themeColor={themeColor}
            themeDark={themeDark}
            themeLight={themeLight}
            canExport={canExport}
            exportToExcel={exportToExcel}
            getBranchLabel={getBranchLabel}
            isUploadAllowed={isUploadAllowed}
            getUploadRestrictionMessage={getUploadRestrictionMessage}
            branchLimits={branchLimits}
            submitRule={submitRule}
          />
        )}

        {activeTab === 'vendor' && (
          <BranchLVB
            user={user}
            userBranch={userBranch}
            isAdmin={isAdmin}
            themeColor={themeColor}
            themeDark={themeDark}
            themeLight={themeLight}
            canExport={canExport}
            exportToExcel={exportToExcel}
            getBranchLabel={getBranchLabel}
            isUploadAllowed={isUploadAllowed}
            getUploadRestrictionMessage={getUploadRestrictionMessage}
            branchLimits={branchLimits}
            submitRule={submitRule}
          />
        )}

        <ImportModal />
        {/* Excel-style column filter dropdown — rendered at root for proper z-index */}
        {activeColumnFilter && (
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: 9998 }}
              onClick={() => setActiveColumnFilter(null)}
            />
            <ColumnFilterDropdown
              x={activeColumnFilter.x}
              y={activeColumnFilter.y}
              options={activeColumnFilter.options}
              initialSelected={activeColumnFilter.selected}
              onApply={activeColumnFilter.onApply}
              onClose={() => setActiveColumnFilter(null)}
              themeColor={themeColor}
            />
          </>
        )}
        <ManualEntryModalMemo
          show={showManualEntryModal}
          onClose={() => setShowManualEntryModal(false)}
          onSubmit={handleManualSubmit}
          submitting={submittingManual}
          userBranch={userBranch}
          themeColor={themeColor}
          themeDark={themeDark}
          initialForm={MANUAL_FORM_INITIAL}
          userName={user?.name}
          tadaDays={branchLimits?.tada_days || 30}
          existingRecords={[...allRecords, ...submittedRecords]}
          onSalesBmSaved={() => {
            setShowManualEntryModal(false);
            pendingVerifiedTabRef.current = 'sales_bm';
            setActiveTab('tada');
            setTadaSubTab('verified');
            setVerifiedInnerTab('sales_bm');
            setSalesBmDraftPeriod(null);
            setSalesBmDraftSelected({});
            fetchSalesBmDrafts();
          }}
          onBillWiseSaved={() => {
            setShowManualEntryModal(false);
            pendingVerifiedTabRef.current = 'bill_wise';
            setActiveTab('tada');
            setTadaSubTab('verified');
            setVerifiedInnerTab('bill_wise');
            setBillWiseDraftSelected({});
            setBillWiseDraftPeriod(null);
            fetchBillWiseDrafts();
          }}
        />
        {/* ─── Branch KM Rate & DA Modal (read-only, current user's branch) ─── */}
        {showBranchRateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

              {/* Header */}
              <div className="px-5 py-3 flex justify-between items-center shrink-0"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h2 className="text-sm font-bold text-white">
                    KM Rate & DA — {getBranchLabel(userBranch)}
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                    {userBranch}
                  </span>
                </div>
                <button
                  onClick={() => setShowBranchRateModal(false)}
                  className="w-7 h-7 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                >
                  <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>
                {!myBranchRateInfo ? (
                  <div className="text-center py-10">
                    <svg className="h-12 w-12 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-gray-500 font-medium">No KM rate configured</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Please contact HO to set up KM rates for branch {userBranch}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Source info */}
                    <div className="px-3 py-2 rounded-lg flex items-center gap-2 text-[11px]"
                      style={{ backgroundColor: myBranchRateInfo.source === userBranch ? themeLight : '#fef3c7' }}>
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24"
                        stroke={myBranchRateInfo.source === userBranch ? themeColor : '#92400e'}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-semibold" style={{ color: myBranchRateInfo.source === userBranch ? themeColor : '#92400e' }}>
                        {myBranchRateInfo.source === userBranch
                          ? `Rates configured directly for ${getBranchLabel(userBranch)}.`
                          : `No rate set for your branch — falling back to HO rates.`}
                      </span>
                    </div>

                    {/* KM Rate card */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Per KM Rate</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-1xl font-bold" style={{ color: themeColor }}>
                          ₹{myBranchRateInfo.km_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-gray-500">/ KM travelled</span>
                      </div>
                    </div>

                    {/* DA Slabs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Range-based DA */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Range-based DA</h3>
                        {myBranchRateInfo.range_start_km !== null && myBranchRateInfo.range_end_km !== null && myBranchRateInfo.range_amount > 0 ? (
                          <>
                            <p className="text-[11px] text-gray-600 mb-1">
                              For trips between
                              <strong className="text-gray-800"> {myBranchRateInfo.range_start_km} KM</strong>
                              {' '}and{' '}
                              <strong className="text-gray-800">{myBranchRateInfo.range_end_km} KM</strong>:
                            </p>
                            <p className="text-base font-bold text-green-700">
                              ₹{myBranchRateInfo.range_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">Not configured</p>
                        )}
                      </div>

                      {/* Above-range DA */}
                      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Above-range DA</h3>
                        {myBranchRateInfo.above_km !== null && myBranchRateInfo.above_amount > 0 ? (
                          <>
                            <p className="text-[11px] text-gray-600 mb-1">
                              For trips greater than
                              <strong className="text-gray-800"> {myBranchRateInfo.above_km} KM</strong>:
                            </p>
                            <p className="text-base font-bold text-blue-700">
                              ₹{myBranchRateInfo.above_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">Not configured</p>
                        )}
                      </div>
                    </div>

                    {/* Formula hint */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] text-gray-600">
                      <p className="font-semibold text-gray-700 mb-1">How total is computed:</p>
                      <p>
                        <strong>Total = (Effective KM × ₹{myBranchRateInfo.km_rate.toFixed(2)}) + Applicable DA</strong>
                      </p>
                      <p className="mt-1 text-gray-500">
                        Effective KM uses HO-corrected → Branch-verified → 2-Way KM (in that order of priority). DA is applied based on the slab the effective KM falls into.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 px-5 py-3 border-t bg-gray-50 flex justify-end">
                <button
                  onClick={() => setShowBranchRateModal(false)}
                  className="px-5 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Customer Detail Modal (TADA Drafts) ───────────────────────────── */}
        {showCustomerDetailModal && (() => {
          const r = allRecords.find(rec => rec.id === selectedCustomerRecordId);
          if (!r) return null;
          const isVerified = r.verification_status === 'Verified';
          const _taskCompletedRequired = String(r.task_status || '').trim() === 'Completed';
          const _srClosedRequired = String(r.sr_status || '').trim() === 'Closed';
          const localBvkKey = `${r.id}_branch_verified_km`;
          const localBvrKey = `${r.id}_km_verification_remark`;
          const bvkDisplay = localValues[localBvkKey] !== undefined ? localValues[localBvkKey] : (r.branch_verified_km || '');
          const bvrDisplay = localValues[localBvrKey] !== undefined ? localValues[localBvrKey] : (r.km_verification_remark || '');
          const srNo = filteredRecords.findIndex(x => x.id === r.id) + 1;

          const fields = [
            // 1. SD Branch Name
            { key: 'SD Branch Name', type: 'text' },
            // 2. SD Branch Code
            { key: 'SD Branch Code', type: 'text' },
            // 3. Installation Site Address
            { key: 'Installation Site Address', type: 'text', wide: true, required: true },
            // 4. Instance ID
            { key: 'Instance ID', type: 'text' },
            // 5. Engine Application Code
            { key: 'Engine Application Code', type: 'text' },
            // 6. Engine Serial Number
            { key: 'Engine Serial Number', type: 'text' },
            // 7. Account
            { key: 'Account', type: 'text', required: true },
            // 8. Account ID
            { key: 'Account ID', type: 'text' },
            // 9. Service Request No.
            { key: 'Service Request No.', type: 'text', required: true },
            // 10. Appointment Number
            { key: 'Appointment Number', type: 'text', required: true },
            // 11. SR Type
            { key: 'SR Type', type: 'text', required: true },
            // 12. SR Sub Type
            { key: 'SR Sub Type', type: 'text', required: true },
            // 13. SR Due date
            { key: 'SR Due date', type: 'date', required: true },
            // 14. Task Start Date  (conditional: required if Task Status = Completed)
            {
              key: 'Task Start Date', type: 'text', required: _taskCompletedRequired,
              hint: 'Required when Task Status = Completed'
            },
            // 15. Task End Date  (conditional)
            {
              key: 'Task End Date', type: 'text', required: _taskCompletedRequired,
              hint: 'Required when Task Status = Completed'
            },
            // 16. Task Status  (dropdown — always required)
            {
              key: 'Task Status', type: 'select', required: true,
              options: ['In Progress', 'Reached At Site', 'Cancelled', 'Completed']
            },
            // 17. Task Assigned Date & Time  (conditional)
            {
              key: 'Task Assigned Date & Time', type: 'text', required: _taskCompletedRequired,
              hint: 'Required when Task Status = Completed'
            },
            // 18. Task Assign v.s Trip Start
            { key: 'Task Assign v.s Trip Start', type: 'text' },
            // 19. SR Trip Start Date & Time
            { key: 'SR Trip Start Date & Time', type: 'text', required: true },
            // 20. SR Reach at Site Date & Time
            { key: 'SR Reach at Site Date & Time', type: 'text', required: true },
            // 21. SR Trip Start Lat Long
            { key: 'SR Trip Start Lat Long', type: 'text', required: true },
            // 22. SR Reach at site Lat long
            { key: 'SR Reach at site Lat long', type: 'text', required: true },
            // 23. KMs Travelled
            { key: 'KMs Travelled', type: 'number' },
            // 24. SR Closed Date  (conditional: required if SR Status = Closed)
            {
              key: 'SR Closed Date', type: 'date', required: _srClosedRequired,
              hint: 'Required when SR Status = Closed'
            },
            // 25. SR Status  (dropdown — always required)
            {
              key: 'SR Status', type: 'select', required: true,
              options: ['Closed', 'Service Engineer Assigned', 'Cancelled']
            },
            // 26. Asset Primary Contact No.
            { key: 'Asset Primary Contact No.', type: 'text' },
            // 27. VOC
            { key: 'VOC', type: 'text', wide: true },
            // 28. Service Engineer Name
            { key: 'Service Engineer Name', type: 'text', required: true },
            // 29. Service Engineer UID
            { key: 'Service Engineer UID', type: 'text' },
            // 30. Customer Name
            { key: 'Customer Name', type: 'text' },
            // 31. Customer contact number
            { key: 'Customer contact number', type: 'text' },
            // 32. Customer Remark
            { key: 'Customer Remark', type: 'text', wide: true },
            // 33. Problem Summary
            { key: 'Problem Summary', type: 'text', wide: true },
            // 34. Nature of Failure
            { key: 'Nature of Failure', type: 'text', wide: true },
            // 35. Action Taken
            { key: 'Action Taken', type: 'text', wide: true },
            // 36. Engineer Remark
            { key: 'Engineer Remark', type: 'text', wide: true },
            // 37. Exception Remark
            { key: 'Exception Remark', type: 'text', wide: true },
            // 38. OTP Remark
            { key: 'OTP Remark', type: 'text' },
            // 39. PDF Generated
            { key: 'PDF Generated', type: 'text' },
          ];

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="px-5 py-3 flex justify-between items-center shrink-0"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h2 className="text-sm font-bold text-white">Customer Record — Sr.No. {srNo}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                      {r.appointment_number || '-'}
                    </span>
                  </div>
                  <button
                    onClick={handleCloseCustomerDetail}
                    className="w-7 h-7 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                  >
                    <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin' }}>

                  {/* Read-only field grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {fields.map((f, i) => {
                      // Map form-style key (e.g. "Task Start Date") → record column (e.g. "task_start_date")
                      const recordKey = f.key
                        .toLowerCase()
                        .replace(/&/g, 'and')
                        .replace(/v\.s/g, 'vs')
                        .replace(/[^a-z0-9\s]/g, '')
                        .trim()
                        .replace(/\s+/g, '_');
                      // Custom mappings for fields where the auto-conversion doesn't match the DB column
                      const keyOverrides = {
                        sr_due_date: 'sr_due_date',
                        sr_reach_at_site_lat_long: 'sr_reach_at_site_lat_long',
                        customer_contact_number: 'customer_contact_number',
                        asset_primary_contact_no: 'asset_primary_contact_no',
                        task_assign_vs_trip_start: 'task_assign_vs_trip_start',
                      };
                      const finalKey = keyOverrides[recordKey] || recordKey;
                      const value = r[finalKey];
                      const display = value !== null && value !== undefined && String(value).trim() !== ''
                        ? String(value) : '-';
                      return (
                        <div key={i} className={f.wide ? 'md:col-span-2 lg:col-span-3' : ''}>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                            {f.key} {f.required && <span className="text-red-500">*</span>}
                          </label>
                          <div className="w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-700 min-h-[30px] break-words">
                            {display}
                          </div>
                          {f.hint && (
                            <p className="text-[9px] text-gray-400 mt-0.5 italic">{f.hint}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Editable verification block */}
                  <div className="mt-5 p-4 rounded-xl border-2" style={{ borderColor: themeColor, backgroundColor: themeLight }}>
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke={themeColor}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: themeColor }}>
                        Branch Verification
                      </h3>
                      {isVerified && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">
                          Locked — already verified
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                          Branch Verified KM *
                        </label>
                        {isVerified ? (
                          <div className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-100 text-gray-700 min-h-[30px]">
                            {bvkDisplay || '-'}
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            value={bvkDisplay}
                            onChange={(e) => handleLocalValueChange(r.id, 'branch_verified_km', e.target.value)}
                            onBlur={(e) => handleSaveValue(r.id, 'branch_verified_km', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveValue(r.id, 'branch_verified_km', e.target.value);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 text-black bg-white"
                            style={{ borderColor: themeColor }}
                            placeholder="Enter verified KM"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                          Branch Verification Remark *
                        </label>
                        {isVerified ? (
                          <div className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-100 text-gray-700 min-h-[30px]">
                            {bvrDisplay || '-'}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={bvrDisplay}
                            onChange={(e) => handleLocalValueChange(r.id, 'km_verification_remark', e.target.value)}
                            onBlur={(e) => handleSaveValue(r.id, 'km_verification_remark', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveValue(r.id, 'km_verification_remark', e.target.value);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 text-black bg-white"
                            style={{ borderColor: themeColor }}
                            placeholder="Enter verification remark"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-1">
                          Freight Charges (₹)
                        </label>
                        {isVerified ? (
                          <div className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-100 text-gray-700 min-h-[30px]">
                            {r.freight_charges ? `₹${parseFloat(r.freight_charges).toFixed(2)}` : '-'}
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            value={localValues[`${r.id}_freight_charges`] !== undefined
                              ? localValues[`${r.id}_freight_charges`]
                              : (r.freight_charges || '')}
                            onChange={(e) => handleLocalValueChange(r.id, 'freight_charges', e.target.value)}
                            onBlur={(e) => handleSaveValue(r.id, 'freight_charges', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveValue(r.id, 'freight_charges', e.target.value);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-1 text-black bg-white"
                            style={{ borderColor: themeColor }}
                            placeholder="Enter freight charges"
                          />
                        )}
                      </div>
                    </div>

                    {!isVerified && (
                      <p className="text-[10px] text-gray-500 mt-3 flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Add the remark first, then enter the verified KM. Changes save automatically on blur or Enter, and reflect in the main table.
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer with Actions */}
                <div className="shrink-0 px-5 py-3 border-t bg-gray-50 flex justify-between items-center gap-2">
                  <button
                    onClick={async () => {
                      await handleDeleteTadaRow(r.id);
                      handleCloseCustomerDetail();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow-md transition-all"
                    style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove Row
                  </button>

                  <button
                    onClick={handleCloseCustomerDetail}
                    className="px-5 py-1.5 text-white text-xs font-bold rounded-lg shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <style>{`
        /* Freeze header row in every scroll container */
        thead.sticky { position: sticky; top: 0; z-index: 10; }
        thead.sticky th { position: sticky; top: 0; }

        .overflow-auto::-webkit-scrollbar,
        .overflow-x-auto::-webkit-scrollbar { width:6px; height:6px; }
        .overflow-auto::-webkit-scrollbar-track,
        .overflow-x-auto::-webkit-scrollbar-track { background:#f1f5f9; border-radius:4px; }
        .overflow-auto::-webkit-scrollbar-thumb,
        .overflow-x-auto::-webkit-scrollbar-thumb { background:#a5b4fc; border-radius:4px; }
        .overflow-auto::-webkit-scrollbar-thumb:hover,
        .overflow-x-auto::-webkit-scrollbar-thumb:hover { background:#6366f1; }
        tbody tr:hover td[style*="sticky"] { background-color:#eff6ff !important; }
      
        /* Submitted/Drafts tables use tableLayout:fixed — thead widths win.
           Strip any inline width/min-width/max-width on tds so they can't fight back. */
        table[style*="table-layout: fixed"] tbody td,
        table[style*="tableLayout: fixed"] tbody td {
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
        }
        
        .truncate {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        td[title]:hover {
          cursor: help;
        }
        
        tbody tr {
          height: 32px;
        }
        
        th, td {
          vertical-align: middle;
        }
        
        .overflow-x-auto {
          overflow-x: auto;
          overflow-y: hidden;
        }
      `}</style>
    </div>
  );
};

export default BranchAdminExpense;