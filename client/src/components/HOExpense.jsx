import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Swal from 'sweetalert2';
import TADAHistoryModal from './TADAHistoryModal';
import OfficeExpenseHO from './OfficeExpenseHO';
import LocalVendorBillHO from './LocalVendorBillHO';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

/* ─── Draggable column header ───────────────────────────────────────────────── */
const SortableTableHeader = ({ id, children, className, style }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        backgroundColor: isDragging ? '#dbeafe' : undefined,
        zIndex: isDragging ? 20 : undefined,
        ...style,
      }}
      {...attributes}
      className={`${className} select-none`}
    >
      <div
        className="flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing"
        {...listeners}
        style={{ minHeight: '100%' }}
      >
        <svg className="w-3 h-3 shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm10-8a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm0-16a2 2 0 10-4 0 2 2 0 004 0z" />
        </svg>
        <span
          className="leading-[1.15]"
          style={{
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          title={typeof children === 'string' ? children : undefined}
        >
          {children}
        </span>
      </div>
    </th>
  );
};

/* ─── Excel-style Column Filter Dropdown ────────────────────────────────────── */
const ColumnFilterDropdown = ({ x, y, options, initialSelected, onApply, onClose, themeColor, label = 'Task Status' }) => {
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
      <div className="px-3 py-2 border-b" style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">Filter {label}</span>
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
  { key: 'sr_no', label: 'Sr. No.', width: 50 },
  { key: 'appointment_number', label: 'Appointment No.', width: 95 },
  { key: 'installation_site_address', label: 'Installation Site Address', width: 160 },
  { key: 'account', label: 'Account', width: 130 },
  { key: 'service_request_no', label: 'Service Request No.', width: 100 },
  { key: 'sr_type', label: 'SR Type', width: 70 },
  { key: 'sr_sub_type', label: 'SR Sub Type', width: 75 },
  { key: 'sr_due_date', label: 'SR Due Date', width: 80 },
  { key: 'task_start_date', label: 'Task Start Date', width: 85 },
  { key: 'task_end_date', label: 'Task End Date', width: 85 },
  { key: 'task_status', label: 'Task Status', width: 75 },
  { key: 'task_assigned_datetime', label: 'Task Assigned Date & Time', width: 115 },
  { key: 'sr_reach_at_site_datetime', label: 'SR Reach at Site Date & Time', width: 120 },
  { key: 'km_verification_remark', label: 'Branch Verification Remark', width: 145 },
  { key: 'sr_trip_start_datetime', label: 'SR Trip Start Date & Time', width: 115 },
  { key: 'sr_trip_start_lat_long', label: 'SR Trip Start Lat Long', width: 120 },
  { key: 'sr_reach_at_site_lat_long', label: 'SR Reach at Site Lat Long', width: 125 },
  { key: 'kms_travelled', label: 'KMs Travelled', width: 75 },
  { key: 'sr_closed_date', label: 'SR Closed Date', width: 85 },
  { key: 'sr_status', label: 'SR Status', width: 75 },
  { key: 'two_way_km', label: 'Two Way KM', width: 75 },
  { key: 'branch_verified_km', label: 'Branch Verified KM', width: 95 },
  { key: 'km_verification_remark', label: 'Branch Verification Remark', width: 130 },
  { key: 'ho_corrected_km', label: 'HO Corrected KM', width: 95 },
  { key: 'km_rate_applied', label: 'KM Rate', width: 70 },
  { key: 'da_amount', label: 'DA Amount', width: 75 },
  { key: 'freight_charges', label: 'Freight Charges', width: 90 },
  { key: 'total_amount', label: 'Total Amount', width: 85 },
  { key: 'ho_remark', label: 'HO Remark', width: 130 },
  { key: 'verification_status', label: 'Verify', width: 70 },
];

const OE_TABLE_COLS = [
  { w: 60 }, { w: 45 }, { w: 95 }, { w: 130 }, { w: 130 },
  { w: 110 }, { w: 180 }, { w: 130 }, { w: 110 }, { w: 105 },
  { w: 100 }, { w: 110 }, { w: 130 }, { w: 90 },
];
const oeTableActualWidth = OE_TABLE_COLS.reduce((s, c) => s + c.w, 0);

const DEFAULT_COL_ORDER = [
  'verification_status', // Verify — moved to start
  'sr_no',
  'installation_site_address',
  'account',
  'service_request_no',
  'sr_sub_type',
  'sr_trip_start_datetime',
  'sr_reach_at_site_datetime',
  'kms_travelled',
  'two_way_km',
  'branch_verified_km',
  'km_verification_remark',
  'ho_corrected_km',
  'ho_remark',
  'km_rate_applied',
  'da_amount',
  'freight_charges',
  'total_amount',
  'appointment_number',
  'sr_type',
  'sr_due_date',
  'task_start_date',
  'task_end_date',
  'task_status',
  'task_assigned_datetime',
  'sr_trip_start_lat_long',
  'sr_reach_at_site_lat_long',
  'sr_closed_date',
  'sr_status',
];

const COL_MAP = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c]));

const exportToExcel = (data, filename, headers) => {
  const norm = (val) => (val === null || val === undefined ? '' : val);
  const rows = (data || []).map(row => {
    const obj = {};
    headers.forEach(h => { obj[h.label] = norm(row[h.key]); });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: headers.map(h => h.label) });
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
  const finalName = /\.xlsx$/i.test(filename) ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
};

// Define branch order - specific sequence for display
const BRANCH_ORDER = [
  'HO',
  '420435_1',
  '420435_2',
  '420435_3',
  '420435_4',
  '420435_5',
  '420435_6',
  '420435_7',
  '420435_8',
  '420435_9',
  '420435_10',
  '420435_11',
  '420435_12',
  '420435_13',
  '420435_14'
];

/* ─── Imprest Amount Modal ───────────────────────────────────────── */
const ImprestModal = ({
  branches,
  loading,
  saving,
  onClose,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntry,
  onSaveAll,
  themeColor,
  themeDark,
}) => {
  const themeLight = 'rgba(64, 96, 147, 0.1)';

  // global totals
  const grandTotal = branches.reduce(
    (sum, b) => sum + b.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    0,
  );
  const totalEntries = branches.reduce((n, b) => n + b.entries.length, 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div
          className="sticky top-0 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center"
          style={{ background: themeColor }}
        >
          <h2 className="text-sm sm:text-base font-semibold text-white">Manage Imprest Amount</h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
          {loading ? (
            <div className="text-center py-10 text-black text-[11px] sm:text-xs">
              <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading branches…
            </div>
          ) : branches.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-black text-[11px] sm:text-xs">
              No branches available.
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {branches.map((b) => {
                const branchTotal = b.entries.reduce(
                  (s, e) => s + (Number(e.amount) || 0),
                  0,
                );
                return (
                  <div
                    key={b.branch_code}
                    className="border rounded-lg overflow-hidden"
                    style={{ borderColor: '#E5E7EB' }}
                  >
                    {/* Branch header */}
                    <div
                      className="px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center"
                      style={{ backgroundColor: themeLight }}
                    >
                      <div>
                        <h3 className="text-[11px] sm:text-xs font-semibold text-black">
                          {b.branch_name}
                          <span className="ml-1.5 text-[10px] font-normal text-gray-500">
                            ({b.branch_code})
                          </span>
                        </h3>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {b.entries.length} entr{b.entries.length === 1 ? 'y' : 'ies'} ·
                          Total ₹{branchTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <button
                        onClick={() => onAddEntry(b.branch_code)}
                        className="px-2 sm:px-3 py-1 text-white text-[10px] sm:text-[11px] font-medium rounded-lg transition-all"
                        style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
                      >
                        + Add Entry
                      </button>
                    </div>

                    {/* Entries */}
                    <div className="px-3 sm:px-4 py-2 sm:py-3">
                      {b.entries.length === 0 ? (
                        <p className="text-[10px] sm:text-[11px] text-gray-400 italic text-center py-2">
                          No entries yet. Click <strong>+ Add Entry</strong> to begin.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {b.entries.map((e) => {
                            const key = e.id ?? e._tmpId;
                            return (
                              <div
                                key={key}
                                className="flex items-center gap-2 pl-3 border-l-2"
                                style={{ borderColor: 'rgba(64, 96, 147, 0.5)' }}
                              >
                                <input
                                  type="text"
                                  value={e.name}
                                  onChange={(ev) =>
                                    onUpdateEntry(b.branch_code, key, 'name', ev.target.value)
                                  }
                                  placeholder="Enter name (e.g. Petty Cash)"
                                  className="flex-1 px-2 py-1 border rounded-lg text-[10px] sm:text-xs text-black focus:outline-none focus:ring-2"
                                  style={{ borderColor: '#D1D5DB' }}
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] sm:text-[11px] text-gray-600">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={e.amount}
                                    onChange={(ev) =>
                                      onUpdateEntry(b.branch_code, key, 'amount', ev.target.value)
                                    }
                                    placeholder="0.00"
                                    className="w-28 px-2 py-1 border rounded-lg text-[10px] sm:text-xs text-black text-right focus:outline-none focus:ring-2"
                                    style={{ borderColor: '#D1D5DB' }}
                                  />
                                </div>
                                <button
                                  onClick={() => onRemoveEntry(b.branch_code, key)}
                                  title="Delete entry"
                                  className="p-1 text-red-600 hover:text-red-800"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div className="text-[10px] sm:text-[11px] text-black">
            <span className="font-semibold">{branches.length}</span> branch(es) ·{' '}
            <span className="font-semibold">{totalEntries}</span> entries · Grand Total{' '}
            <span className="font-bold" style={{ color: themeColor }}>
              ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 sm:px-4 py-1.5 sm:py-2 border rounded-lg text-[11px] sm:text-xs font-medium text-black hover:bg-gray-50 transition-colors disabled:opacity-40"
              style={{ borderColor: '#D1D5DB' }}
            >
              Cancel
            </button>
            <button
              onClick={onSaveAll}
              disabled={loading || saving}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-white text-[11px] sm:text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeDark})` }}
            >
              {saving && (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saving ? 'Saving…' : 'Save All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const HOExpense = () => {
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const [canExport, setCanExport] = useState(false);
  const [vendorBranchFilter, setVendorBranchFilter] = useState('');
  const [historyReachDateFrom, setHistoryReachDateFrom] = useState('');
  const [historyReachDateTo, setHistoryReachDateTo] = useState('');
  // SR Reach at Site Date filter (for engineer detail table)
  const [recordsReachDateFrom, setRecordsReachDateFrom] = useState('');
  const [recordsReachDateTo, setRecordsReachDateTo] = useState('');
  const [recordsTwoWayKmFilter, setRecordsTwoWayKmFilter] = useState(''); // '' | '10' | '30' | ... | '500'
  const [engineerDetailTab, setEngineerDetailTab] = useState('pending'); // 'pending' | 'verified'

  /* ── Excel-style column filters (Task Status + SR Type) ── */
  const [activeColumnFilter, setActiveColumnFilter] = useState(null);
  const [engineerTaskStatusFilter, setEngineerTaskStatusFilter] = useState(new Set());
  const [historyAllTaskStatusFilter, setHistoryAllTaskStatusFilter] = useState(new Set());
  const [historyPeriodTaskStatusFilter, setHistoryPeriodTaskStatusFilter] = useState(new Set());
  const [engineerSrTypeFilter, setEngineerSrTypeFilter] = useState(new Set());
  const [historyAllSrTypeFilter, setHistoryAllSrTypeFilter] = useState(new Set());
  const [historyPeriodSrTypeFilter, setHistoryPeriodSrTypeFilter] = useState(new Set());
  // Manual entry filters (file_name === 'manual_entry.xlsx')
  const [engineerManualFilter, setEngineerManualFilter] = useState(false);
  const [historyAllManualFilter, setHistoryAllManualFilter] = useState(false);
  const [historyPeriodManualFilter, setHistoryPeriodManualFilter] = useState(false);


  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const [infoPopoverPos, setInfoPopoverPos] = useState({ top: 0, left: 0 });
  const infoButtonRef = useRef(null);

  /* ── Imprest Amount modal ── */
  const [showImprestModal, setShowImprestModal] = useState(false);
  const [imprestLoading, setImprestLoading] = useState(false);
  const [imprestSaving, setImprestSaving] = useState(false);
  const [imprestBranches, setImprestBranches] = useState([]);
  // Shape: [{ branch_code, branch_name, entries: [{ id?, name, amount, _tmpId? }] }]
  const [allBranchesList, setAllBranchesList] = useState([]); // master list of branches

  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    employee_name: '',
    employee_id: '',
    employee_uid: '',
    designation: '',
  });
  const [branchEmployees, setBranchEmployees] = useState([]);
  const [loadingBranchEmployees, setLoadingBranchEmployees] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  // shape: { id, employee_name, employee_id, designation } or null
  const [savingEmployeeId, setSavingEmployeeId] = useState(null);

  const themeColor = '#2f3192';
  const themeShades = {
    light: 'rgba(64, 96, 147, 0.1)',
    medium: 'rgba(64, 96, 147, 0.5)',
    dark: '#335478',
  };

  const branchMap = {
    'HO': 'Pune Office',
    '420435_1': 'Ch.Sambhaji Nagar',
    '420435_2': 'Ahilyanagar',
    '420435_3': 'Beed',
    '420435_4': 'Nanded',
    '420435_5': 'Babhaleshwar',
    '420435_6': 'Latur',
    '420435_7': 'Parbhani',
    '420435_8': 'Hubli',
    '420435_9': 'Belagavi',
    '420435_10': 'Hospet',
    '420435_11': 'Ballari',
    '420435_12': 'Bagalkot',
    '420435_13': 'Gulbarga',
    '420435_14': 'Bijapur'
  };

  const [activeTab, setActiveTab] = useState('tada');
  const [showKMRateModal, setShowKMRateModal] = useState(false);
  const [showExpenseHeadModal, setShowExpenseHeadModal] = useState(false);

  // TADA Navigation States
  const [branches, setBranches] = useState([]);
  const [selectedBranchForSummary, setSelectedBranchForSummary] = useState(null);
  const [engineerSummary, setEngineerSummary] = useState([]);
  const [voucherGroups, setVoucherGroups] = useState([]);          // [{ voucher_no, engineers, total, record_count, verified_count, engineer_count }]
  const [selectedVoucher, setSelectedVoucher] = useState(null);    // voucher group currently drilled into
  const [selectedEngineerDetail, setSelectedEngineerDetail] = useState(null);
  const [engineerRecords, setEngineerRecords] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyBranch, setHistoryBranch] = useState(null);

  // New: History tab state
  const [historyTab, setHistoryTab] = useState('all'); // 'all' | 'periods'
  const [historyGrouped, setHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingHistoryGrouped, setLoadingHistoryGrouped] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null); // clicked period for drill-down

  // ─── History modal: main tab switcher ──────────────────────────────
  const [historyMainTab, setHistoryMainTab] = useState('all'); // 'all' | 'service_engineer' | 'sales' | 'km_wise' | 'bill_wise'

  // ─── ALL tab (combined view) ───
  const [allHistoryDateFrom, setAllHistoryDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [allHistoryDateTo, setAllHistoryDateTo] = useState(
    () => new Date().toISOString().split('T')[0]
  );

  // ─── Sales sub-tab inside history modal ────────────────────────────
  const [salesHistoryRecords, setSalesHistoryRecords] = useState([]);
  const [salesHistoryGrouped, setSalesHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [loadingSalesHistoryGrouped, setLoadingSalesHistoryGrouped] = useState(false);
  const [salesHistoryTab, setSalesHistoryTab] = useState('all'); // 'all' | 'periods'
  const [salesSelectedPeriod, setSalesSelectedPeriod] = useState(null);
  const [salesPaidDateEdits, setSalesPaidDateEdits] = useState({});
  const [salesPaidDateSaving, setSalesPaidDateSaving] = useState({});
  const [salesPaidDateTimers, setSalesPaidDateTimers] = useState({});
  const [salesPeriodPaidInputs, setSalesPeriodPaidInputs] = useState({});
  const [salesPeriodPaidApplying, setSalesPeriodPaidApplying] = useState({});
  const [salesHistorySearch, setSalesHistorySearch] = useState('');

  // ─── KM Wise sub-tab inside history modal ──────────────────────────
  const [kmWiseHistoryRecords, setKmWiseHistoryRecords] = useState([]);
  const [kmWiseHistoryGrouped, setKmWiseHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingKmWiseHistory, setLoadingKmWiseHistory] = useState(false);
  const [loadingKmWiseHistoryGrouped, setLoadingKmWiseHistoryGrouped] = useState(false);
  const [kmWiseHistoryTab, setKmWiseHistoryTab] = useState('all');
  const [kmWiseSelectedPeriod, setKmWiseSelectedPeriod] = useState(null);
  const [kmWisePaidDateEdits, setKmWisePaidDateEdits] = useState({});
  const [kmWisePaidDateSaving, setKmWisePaidDateSaving] = useState({});
  const [kmWisePaidDateTimers, setKmWisePaidDateTimers] = useState({});
  const [kmWisePeriodPaidInputs, setKmWisePeriodPaidInputs] = useState({});
  const [kmWisePeriodPaidApplying, setKmWisePeriodPaidApplying] = useState({});
  const [kmWiseHistorySearch, setKmWiseHistorySearch] = useState('');

  // ─── Bill Wise sub-tab inside history modal ────────────────────────
  const [billWiseHistoryRecords, setBillWiseHistoryRecords] = useState([]);
  const [billWiseHistoryGrouped, setBillWiseHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingBillWiseHistory, setLoadingBillWiseHistory] = useState(false);
  const [loadingBillWiseHistoryGrouped, setLoadingBillWiseHistoryGrouped] = useState(false);
  const [billWiseHistoryTab, setBillWiseHistoryTab] = useState('all');
  const [billWiseSelectedPeriod, setBillWiseSelectedPeriod] = useState(null);
  const [billWisePaidDateEdits, setBillWisePaidDateEdits] = useState({});
  const [billWisePaidDateSaving, setBillWisePaidDateSaving] = useState({});
  const [billWisePaidDateTimers, setBillWisePaidDateTimers] = useState({});
  const [billWisePeriodPaidInputs, setBillWisePeriodPaidInputs] = useState({});
  const [billWisePeriodPaidApplying, setBillWisePeriodPaidApplying] = useState({});
  const [billWiseHistorySearch, setBillWiseHistorySearch] = useState('');

  // TADA Loading States
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingEngineerSummary, setLoadingEngineerSummary] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyEngineer, setHistoryEngineer] = useState('');
  const [engineerCalculatedTotals, setEngineerCalculatedTotals] = useState({});
  const [loadingCalculatedTotals, setLoadingCalculatedTotals] = useState(false);

  // ─── Branch Sales states ─────────────────────────────────
  const [branchSalesSummary, setBranchSalesSummary] = useState({ rule_type: '', groups: [] });
  const [loadingSalesSummary, setLoadingSalesSummary] = useState(false);
  const [selectedSalesPeriod, setSelectedSalesPeriod] = useState(null);
  const [salesPeriodRecords, setSalesPeriodRecords] = useState([]);
  const [loadingSalesPeriodRecords, setLoadingSalesPeriodRecords] = useState(false);
  const [salesVerificationStatus, setSalesVerificationStatus] = useState({});
  const [salesLocalCorrections, setSalesLocalCorrections] = useState({});
  const [salesLocalRemarks, setSalesLocalRemarks] = useState({});
  const [salesSavingStates, setSalesSavingStates] = useState({});
  const [salesSaveTimeouts, setSalesSaveTimeouts] = useState({});
  const [submittingSalesToHistory, setSubmittingSalesToHistory] = useState(false);
  const [salesKmFilter, setSalesKmFilter] = useState(''); // '' | '10' | '30' | ...

  // ─── Branch KM Wise states ─────────────────────────────────────────────
  const [branchKmWiseSummary, setBranchKmWiseSummary] = useState({ rule_type: '', groups: [] });
  const [loadingKmWiseSummary, setLoadingKmWiseSummary] = useState(false);
  const [selectedKmWisePeriod, setSelectedKmWisePeriod] = useState(null);
  const [kmWisePeriodRecords, setKmWisePeriodRecords] = useState([]);
  const [loadingKmWisePeriodRecords, setLoadingKmWisePeriodRecords] = useState(false);
  const [kmWiseVerificationStatus, setKmWiseVerificationStatus] = useState({});
  const [kmWiseLocalCorrections, setKmWiseLocalCorrections] = useState({});
  const [kmWiseLocalRemarks, setKmWiseLocalRemarks] = useState({});
  const [kmWiseSavingStates, setKmWiseSavingStates] = useState({});
  const [kmWiseSaveTimeouts, setKmWiseSaveTimeouts] = useState({});
  const [submittingKmWiseToHistory, setSubmittingKmWiseToHistory] = useState(false);
  const [kmWiseKmFilter, setKmWiseKmFilter] = useState('');

  // ─── Branch Bill Wise states ────────────────────────────────────────────
  const [branchBillWiseSummary, setBranchBillWiseSummary] = useState({ rule_type: '', groups: [] });
  const [loadingBillWiseSummary, setLoadingBillWiseSummary] = useState(false);
  const [selectedBillWisePeriod, setSelectedBillWisePeriod] = useState(null);
  const [selectedBillWiseEngineer, setSelectedBillWiseEngineer] = useState(null); // {type:'SE'|'BM', name, records}
  const [billWisePeriodRecords, setBillWisePeriodRecords] = useState([]);
  const [loadingBillWisePeriodRecords, setLoadingBillWisePeriodRecords] = useState(false);
  const [billWiseVerificationStatus, setBillWiseVerificationStatus] = useState({});
  const [billWiseSavingStates, setBillWiseSavingStates] = useState({});
  const [submittingBillWiseToHistory, setSubmittingBillWiseToHistory] = useState(false);

  // ─── Sales & BM (merged Sales + KM Wise), voucher-wise like Service Engineer ───
  const [loadingSalesBM, setLoadingSalesBM] = useState(false);
  const [salesBMVoucherGroups, setSalesBMVoucherGroups] = useState([]);
  const [selectedSalesBMVoucher, setSelectedSalesBMVoucher] = useState(null);
  const [selectedSalesBMEngineer, setSelectedSalesBMEngineer] = useState(null);
  const [salesBMRecords, setSalesBMRecords] = useState([]);
  const [salesBMVerify, setSalesBMVerify] = useState({});
  const [salesBMCorr, setSalesBMCorr] = useState({});
  const [salesBMRemark, setSalesBMRemark] = useState({});
  const [salesBMSaving, setSalesBMSaving] = useState({});
  const [salesBMTimers, setSalesBMTimers] = useState({});
  const [submittingSalesBM, setSubmittingSalesBM] = useState(false);
  const [salesBMKmFilter, setSalesBMKmFilter] = useState('');
  const [salesBMTab, setSalesBMTab] = useState('pending'); // 'pending' | 'verified'
  const [salesBMDA, setSalesBMDA] = useState({});          // { recordId: 'manual DA' }

  // Loading states for KM and Expense
  const [loadingKMRates, setLoadingKMRates] = useState(false);
  const [addingHead, setAddingHead] = useState(false);
  const [addingSubheadForId, setAddingSubheadForId] = useState(null);

  // Paid Date editing state
  const [paidDateEdits, setPaidDateEdits] = useState({});       // { recordId: 'YYYY-MM-DD' }
  const [paidDateSaving, setPaidDateSaving] = useState({});     // { recordId: true }
  const [paidDateTimers, setPaidDateTimers] = useState({});     // debounce per row
  const [periodPaidInputs, setPeriodPaidInputs] = useState({}); // { 'periodKey': 'YYYY-MM-DD' }
  const [periodPaidApplying, setPeriodPaidApplying] = useState({}); // { 'periodKey': true }

  // ─── Branch upload-day limits ───
  const [showDayLimitsModal, setShowDayLimitsModal] = useState(false);
  const [dayLimits, setDayLimits] = useState({});            // { branch_code: {tada_days, office_expense_days, lvb_days} }
  const [originalDayLimits, setOriginalDayLimits] = useState({});
  const [loadingDayLimits, setLoadingDayLimits] = useState(false);
  const [savingDayLimits, setSavingDayLimits] = useState(false);

  // ─── Branch SUBMIT-day limits (weekday or month-date based) ───
  const [showSubmitLimitsModal, setShowSubmitLimitsModal] = useState(false);
  const [submitLimits, setSubmitLimits] = useState({});         // { branch_code: {rule_type, allowed_values} }
  const [originalSubmitLimits, setOriginalSubmitLimits] = useState({});
  const [loadingSubmitLimits, setLoadingSubmitLimits] = useState(false);
  const [savingSubmitLimits, setSavingSubmitLimits] = useState(false);

  // State for KM rates
  const [kmRates, setKmRates] = useState({});
  const [originalKmRates, setOriginalKmRates] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const [showVendorListModal, setShowVendorListModal] = useState(false);
  const [vendorList, setVendorList] = useState([]);
  const [loadingVendorList, setLoadingVendorList] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');

  const [dynamicDAAmounts, setDynamicDAAmounts] = useState({});
  const [dynamicTotalAmounts, setDynamicTotalAmounts] = useState({});
  const [localDAAmounts, setLocalDAAmounts] = useState({});
  const [localFreightAmounts, setLocalFreightAmounts] = useState({});

  // State for expense heads
  const [expenseHeads, setExpenseHeads] = useState([]);
  const [newExpenseHead, setNewExpenseHead] = useState('');
  const [editingHead, setEditingHead] = useState(null);

  // Separate state for each subhead input
  const [subheadInputs, setSubheadInputs] = useState({});

  // Edit subhead states
  const [editingSubhead, setEditingSubhead] = useState(null);

  // Auto-save states for editable columns
  const [localKMCorrections, setLocalKMCorrections] = useState({});
  const [localRemarks, setLocalRemarks] = useState({});
  const [savingStates, setSavingStates] = useState({});
  const [verificationStatus, setVerificationStatus] = useState({});
  const [selectAll, setSelectAll] = useState(false);
  const [bulkVerifying, setBulkVerifying] = useState(false);
  const [saveTimeouts, setSaveTimeouts] = useState({});

  const [loadingMoveToHistory, setLoadingMoveToHistory] = useState(false);
  // Table States
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('hoExpense_col_order_v2');
      if (saved && Array.isArray(JSON.parse(saved))) {
        const savedOrder = JSON.parse(saved);
        // Append columns added after the saved order (e.g. freight_charges)
        const missing = DEFAULT_COL_ORDER.filter(k => !savedOrder.includes(k));
        return [...savedOrder, ...missing];
      }
    } catch { }
    return DEFAULT_COL_ORDER;
  });

  const tableContainerRef = useRef(null);
  const topScrollBarRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('hoExpense_col_order_v2', JSON.stringify(columnOrder));
  }, [columnOrder]);

  // Reset local states only when ENGINEER changes (not when records merely refresh)
  useEffect(() => {
    if (engineerRecords.length > 0) {
      const initialKMs = {};
      const initialRemarks = {};
      const initialVerification = {};
      const initialDAs = {};
      const initialFreights = {};
      engineerRecords.forEach(record => {
        initialKMs[record.id] = record.ho_corrected_km || '';
        initialRemarks[record.id] = record.ho_remark || '';
        initialVerification[record.id] = record.verification_status === 'Verified';
        initialFreights[record.id] = record.freight_charges || '';
        // Seed manual DA from saved value if it differs from what the rule would give.
        // This way, refreshing the page shows the previously-saved manual override in the input.
        const savedDA = record.da_amount;
        if (savedDA !== null && savedDA !== undefined && savedDA !== '' && record.verification_status !== 'Verified') {
          const effectiveKM = getEffectiveKM(record);
          const ruleDA = calculateDAmount(record, effectiveKM);
          const savedNum = parseFloat(savedDA);
          // Only treat it as manual override if saved value differs from rule value
          if (!isNaN(savedNum) && (ruleDA === null || Math.abs(savedNum - ruleDA) > 0.001)) {
            initialDAs[record.id] = String(savedDA);
          } else {
            initialDAs[record.id] = '';
          }
        } else {
          initialDAs[record.id] = '';
        }
      });
      setLocalKMCorrections(initialKMs);
      setLocalRemarks(initialRemarks);
      setVerificationStatus(initialVerification);
      setLocalDAAmounts(initialDAs);
      setLocalFreightAmounts(initialFreights);
      setSelectAll(false);
    }
    // Only reset when engineer UID changes, not on every records change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEngineerDetail?.uid]);

  const getBranchDisplayName = (branchCode) => {
    return branchMap[branchCode] || branchCode || 'No Branch';
  };

  const getUserTypeDisplay = () => {
    if (user?.role === 'master_admin') return 'Master Admin';
    if (user?.role === 'it_admin') return 'IT Admin';
    if (user?.role === 'employee' && user?.branch === 'HO') return 'HO Employee';
    return 'User';
  };

  /* ── Helpers for column filters (Task Status + SR Type) ── */
  const getUniqueTaskStatuses = (records) => {
    const set = new Set();
    (records || []).forEach(r => {
      const s = String(r.task_status || '').trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  };

  const getUniqueColumnValues = (records, columnKey) => {
    const set = new Set();
    (records || []).forEach(r => {
      const s = String(r[columnKey] || '').trim();
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
      label: 'Task Status',
      options: getUniqueTaskStatuses(records),
      selected: new Set(currentFilter),
      onApply: (newSet) => {
        setFilter(newSet);
        setActiveColumnFilter(null);
      },
    });
  };

  const openSrTypeFilter = (e, records, currentFilter, setFilter) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveColumnFilter({
      x: rect.left,
      y: rect.bottom + 4,
      label: 'SR Type',
      options: getUniqueColumnValues(records, 'sr_type'),
      selected: new Set(currentFilter),
      onApply: (newSet) => {
        setFilter(newSet);
        setActiveColumnFilter(null);
      },
    });
  };

  // Reset filters when context changes
  useEffect(() => {
    setEngineerTaskStatusFilter(new Set());
    setEngineerSrTypeFilter(new Set());
    setEngineerManualFilter(false);
  }, [selectedEngineerDetail?.uid]);

  useEffect(() => {
    setHistoryPeriodTaskStatusFilter(new Set());
    setHistoryPeriodSrTypeFilter(new Set());
    setHistoryPeriodManualFilter(false);
  }, [selectedPeriod?.period_start, selectedPeriod?.period_end]);

  // Auto-save function with debounce
  const autoSaveField = useCallback(async (recordId, field, value, originalValue, suppressToast = false) => {
    if (saveTimeouts[recordId]) {
      clearTimeout(saveTimeouts[recordId]);
    }

    if (value === originalValue) return;

    setSavingStates(prev => ({ ...prev, [recordId]: true }));

    const timeoutId = setTimeout(async () => {
      try {
        const updateData = {};

        if (field === 'ho_corrected_km') {
          updateData.ho_corrected_km = value;
        } else if (field === 'ho_remark') {
          updateData.ho_remark = value;
        } else if (field === 'da_amount') {
          updateData.da_amount = value;
        } else if (field === 'freight_charges') {
          updateData.freight_charges = value;
        } else if (field === 'total_amount') {
          updateData.total_amount = value;
        }

        await axios.put(`${API_BASE_URL}/tada-ho/engineer-records/${recordId}`, updateData);

        setEngineerRecords(prev => prev.map(record =>
          record.id === recordId
            ? { ...record, [field]: value }
            : record
        ));

        if (!suppressToast) {
          const fieldLabel = field === 'ho_corrected_km' ? 'KM correction'
            : field === 'ho_remark' ? 'Remark'
              : field === 'da_amount' ? 'DA amount'
                : field === 'freight_charges' ? 'Freight charges'
                  : field === 'total_amount' ? 'Total amount'
                    : 'Field';
          toast.success(`${fieldLabel} saved!`, { duration: 1500 });
        }
      } catch (error) {
        console.error('Error auto-saving:', error);
        toast.error('Failed to save automatically');
      } finally {
        setSavingStates(prev => ({ ...prev, [recordId]: false }));
      }
    }, 1000);

    setSaveTimeouts(prev => ({ ...prev, [recordId]: timeoutId }));
  }, [saveTimeouts]);

  const handleKMCorrectionChange = (recordId, value, originalValue) => {
    setLocalKMCorrections(prev => ({ ...prev, [recordId]: value }));
    autoSaveField(recordId, 'ho_corrected_km', value, originalValue);
    setEngineerRecords(prev => prev.map(record =>
      record.id === recordId
        ? { ...record, ho_corrected_km: value }
        : record
    ));
  };

  const handleRemarkChange = (recordId, value, originalValue) => {
    setLocalRemarks(prev => ({ ...prev, [recordId]: value }));
    autoSaveField(recordId, 'ho_remark', value, originalValue);
  };

  // HO can manually override the DA amount for a single row.
  // Empty value → falls back to rule-based DA. Non-empty value → saved to DB
  // and used for total calculation. Engineer sees whatever is in DB.
  const handleDAAmountChange = (recordId, value, originalValue) => {
    // 1. Update the input box immediately — this is the source of truth for what's displayed
    setLocalDAAmounts(prev => ({ ...prev, [recordId]: value }));

    const record = engineerRecords.find(r => r.id === recordId);
    if (!record) return;

    const effectiveKM = getEffectiveKM(record);
    const effectiveBranch = getEffectiveBranchForRecord(record);
    const branchRate = getBranchDARate(effectiveBranch);

    let newDA = null;
    let newTotal = null;

    if (value !== '' && !isNaN(parseFloat(value))) {
      // Manual DA provided
      newDA = parseFloat(value).toFixed(2);
      if (effectiveKM !== null && branchRate && branchRate.km_rate > 0) {
        newTotal = ((effectiveKM * branchRate.km_rate) + parseFloat(value) + getEffectiveFreight(record)).toFixed(2);
      }
    } else {
      // Cleared → use rule-based DA
      const ruleDA = calculateDAmount(record, effectiveKM);
      const ruleTotal = calculateTotalAmountDynamic(record, effectiveKM, ruleDA);
      if (ruleDA !== null) newDA = ruleDA.toFixed(2);
      if (ruleTotal !== null) newTotal = ruleTotal.toFixed(2);
    }

    // 2. Update display values
    if (newDA !== null) {
      setDynamicDAAmounts(prev => ({ ...prev, [recordId]: newDA }));
    }
    if (newTotal !== null) {
      setDynamicTotalAmounts(prev => ({ ...prev, [recordId]: newTotal }));
    }

    // 3. Save DA to DB (with toast)
    autoSaveField(recordId, 'da_amount', value, originalValue);

    // 4. Save Total to DB silently (no toast — to avoid double notification)
    if (newTotal !== null) {
      autoSaveField(recordId, 'total_amount', newTotal, record.total_amount || '', true);
    }
  };

  // HO can edit freight charges (originally filled by branch admin). Freight is
  // added on top of (KM × rate) + DA to produce the total.
  const handleFreightChange = (recordId, value, originalValue) => {
    setLocalFreightAmounts(prev => ({ ...prev, [recordId]: value }));

    const record = engineerRecords.find(r => r.id === recordId);
    if (!record) return;

    const effectiveKM = getEffectiveKM(record);
    const effectiveBranch = getEffectiveBranchForRecord(record);
    const branchRate = getBranchDARate(effectiveBranch);
    const freight = (value !== '' && !isNaN(parseFloat(value))) ? parseFloat(value) : 0;

    // DA currently in effect: manual override if present, else rule-based
    const manualDA = localDAAmounts[recordId];
    let daNum;
    if (manualDA !== undefined && manualDA !== '' && !isNaN(parseFloat(manualDA))) {
      daNum = parseFloat(manualDA);
    } else {
      daNum = calculateDAmount(record, effectiveKM) || 0;
    }

    let newTotal = null;
    if (effectiveKM !== null && branchRate && branchRate.km_rate > 0) {
      newTotal = ((effectiveKM * branchRate.km_rate) + daNum + freight).toFixed(2);
      setDynamicTotalAmounts(prev => ({ ...prev, [recordId]: newTotal }));
    }

    autoSaveField(recordId, 'freight_charges', value, originalValue);
    if (newTotal !== null) {
      autoSaveField(recordId, 'total_amount', newTotal, record.total_amount || '', true);
    }
  };

  const handleVerificationToggle = async (recordId, currentStatus) => {
    const newStatus = !currentStatus;
    const newVerificationStatus = { ...verificationStatus, [recordId]: newStatus };
    setVerificationStatus(newVerificationStatus);

    const allSelected = engineerRecords.every(record =>
      (record.id === recordId ? newStatus : verificationStatus[record.id])
    );
    setSelectAll(allSelected);
    setSavingStates(prev => ({ ...prev, [recordId]: true }));

    try {
      const calculatedDA = dynamicDAAmounts[recordId];
      const calculatedTotal = dynamicTotalAmounts[recordId];

      const updateData = {
        verification_status: newStatus ? 'Verified' : 'Pending'
      };

      if (newStatus) {
        if (calculatedDA) updateData.da_amount = calculatedDA;
        if (calculatedTotal) updateData.total_amount = calculatedTotal;
      }

      await axios.put(`${API_BASE_URL}/tada-ho/engineer-records/${recordId}`, updateData);

      setEngineerRecords(prev => prev.map(record =>
        record.id === recordId
          ? {
            ...record,
            verification_status: newStatus ? 'Verified' : 'Pending',
            da_amount: newStatus ? (calculatedDA || record.da_amount) : record.da_amount,
            total_amount: newStatus ? (calculatedTotal || record.total_amount) : record.total_amount
          }
          : record
      ));

      toast.success(`Record ${newStatus ? 'verified' : 'unverified'}!`, { duration: 1500 });

      if (newStatus) {
        setDynamicDAAmounts(prev => ({ ...prev, [recordId]: calculatedDA || prev[recordId] }));
        setDynamicTotalAmounts(prev => ({ ...prev, [recordId]: calculatedTotal || prev[recordId] }));
      }

      if (!newStatus) {
        const record = engineerRecords.find(r => r.id === recordId);
        if (record) {
          setLocalKMCorrections(prev => ({ ...prev, [recordId]: record.ho_corrected_km || '' }));
          setLocalRemarks(prev => ({ ...prev, [recordId]: record.ho_remark || '' }));
        }
      }

    } catch (error) {
      console.error('Error updating verification:', error);
      toast.error('Failed to update verification status');
      setVerificationStatus(prev => ({ ...prev, [recordId]: currentStatus }));
    } finally {
      setSavingStates(prev => ({ ...prev, [recordId]: false }));
    }
  };

  const handleSelectAll = async () => {
    // Tab-aware: on Verified tab → unverify all (false); on Pending tab → verify all (true)
    const newSelectAll = engineerDetailTab === 'verified' ? false : true;
    setSelectAll(newSelectAll);

    // Optimistically update UI
    const newVerificationStatus = {};
    engineerRecords.forEach(record => {
      newVerificationStatus[record.id] = newSelectAll;
    });
    setVerificationStatus(newVerificationStatus);

    // Only act on records whose current status differs from the target
    // (i.e. on Pending tab → only verify pending rows; on Verified tab → only unverify verified rows)
    const recordsToProcess = engineerRecords.filter(r => {
      const isCurrentlyVerified = r.verification_status === 'Verified';
      return newSelectAll ? !isCurrentlyVerified : isCurrentlyVerified;
    });

    if (recordsToProcess.length === 0) {
      setBulkVerifying(false);
      return;
    }

    setBulkVerifying(true);
    let successCount = 0;
    let errorCount = 0;

    for (const record of recordsToProcess) {
      const calculatedDA = dynamicDAAmounts[record.id];
      const calculatedTotal = dynamicTotalAmounts[record.id];

      try {
        const updateData = {
          verification_status: newSelectAll ? 'Verified' : 'Pending'
        };
        if (newSelectAll) {
          if (calculatedDA) updateData.da_amount = calculatedDA;
          if (calculatedTotal) updateData.total_amount = calculatedTotal;
        }

        await axios.put(`${API_BASE_URL}/tada-ho/engineer-records/${record.id}`, updateData);

        setEngineerRecords(prev => prev.map(r =>
          r.id === record.id
            ? {
              ...r,
              verification_status: newSelectAll ? 'Verified' : 'Pending',
              da_amount: newSelectAll ? (calculatedDA || r.da_amount) : r.da_amount,
              total_amount: newSelectAll ? (calculatedTotal || r.total_amount) : r.total_amount,
            }
            : r
        ));

        if (newSelectAll) {
          setDynamicDAAmounts(prev => ({ ...prev, [record.id]: calculatedDA || prev[record.id] }));
          setDynamicTotalAmounts(prev => ({ ...prev, [record.id]: calculatedTotal || prev[record.id] }));
        }
        successCount++;
      } catch (error) {
        console.error(`Error processing record ${record.id}:`, error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${newSelectAll ? 'Verified' : 'Unverified'} ${successCount} records successfully!`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to process ${errorCount} records`);
    }

    setBulkVerifying(false);
  };

  const handleBulkVerify = async () => {
    const recordsToProcess = engineerRecords.filter(record => verificationStatus[record.id]);

    if (recordsToProcess.length === 0) {
      toast.error('No records selected');
      return;
    }

    setBulkVerifying(true);
    let successCount = 0;
    let errorCount = 0;
    let verifiedCount = 0;
    let unverifiedCount = 0;

    for (const record of recordsToProcess) {
      const isCurrentlyVerified = record.verification_status === 'Verified';
      const newStatus = !isCurrentlyVerified;
      const calculatedDA = dynamicDAAmounts[record.id];
      const calculatedTotal = dynamicTotalAmounts[record.id];

      try {
        const updateData = {
          verification_status: newStatus ? 'Verified' : 'Pending'
        };

        if (newStatus) {
          if (calculatedDA) updateData.da_amount = calculatedDA;
          if (calculatedTotal) updateData.total_amount = calculatedTotal;
        }

        await axios.put(`${API_BASE_URL}/tada-ho/engineer-records/${record.id}`, updateData);

        setEngineerRecords(prev => prev.map(r =>
          r.id === record.id
            ? {
              ...r,
              verification_status: newStatus ? 'Verified' : 'Pending',
              da_amount: newStatus ? (calculatedDA || r.da_amount) : r.da_amount,
              total_amount: newStatus ? (calculatedTotal || r.total_amount) : r.total_amount
            }
            : r
        ));

        if (newStatus) {
          verifiedCount++;
          setDynamicDAAmounts(prev => ({ ...prev, [record.id]: calculatedDA || prev[record.id] }));
          setDynamicTotalAmounts(prev => ({ ...prev, [record.id]: calculatedTotal || prev[record.id] }));
        } else {
          unverifiedCount++;
        }
        successCount++;
      } catch (error) {
        console.error(`Error processing record ${record.id}:`, error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      if (verifiedCount > 0 && unverifiedCount > 0) {
        toast.success(`${verifiedCount} verified, ${unverifiedCount} unverified successfully!`);
      } else if (verifiedCount > 0) {
        toast.success(`Verified ${verifiedCount} records successfully!`);
      } else if (unverifiedCount > 0) {
        toast.success(`Unverified ${unverifiedCount} records successfully!`);
      }

      if (errorCount > 0) {
        toast.error(`Failed to process ${errorCount} records`);
      }

      const updatedVerificationStatus = {};
      engineerRecords.forEach(record => {
        const updatedRecord = engineerRecords.find(r => r.id === record.id);
        if (updatedRecord) {
          updatedVerificationStatus[record.id] = updatedRecord.verification_status === 'Verified';
        }
      });
      setVerificationStatus(updatedVerificationStatus);
      setSelectAll(false);
    } else if (errorCount > 0) {
      toast.error('Failed to process records');
    }

    setBulkVerifying(false);
  };

  const loadBranches = async () => {
    setLoadingBranches(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/tada-ho/branches-with-managers`);
      const branchDataMap = {};
      response.data.forEach(branch => {
        branchDataMap[branch.branch_code] = branch;
      });

      const sortedBranches = [];
      BRANCH_ORDER.forEach((branchCode, index) => {
        if (branchDataMap[branchCode]) {
          sortedBranches.push({
            ...branchDataMap[branchCode],
            sr_no: index + 1,
            sales_bm_count: 0,
            bill_wise_count: 0,
          });
        } else {
          sortedBranches.push({
            sr_no: index + 1,
            branch_code: branchCode,
            branch_name: branchMap[branchCode],
            branch_manager: 'Not Assigned',
            engineer_count: 0,
            sales_bm_count: 0,
            bill_wise_count: 0,
          });
        }
      });

      // Fetch counts from Sales, KM Wise, Bill Wise tables in parallel
      const countPromises = sortedBranches.map(async (branch) => {
        try {
          const [salesBMRes, billWiseRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/tada-salesbm/branch-engineers-summary`, {
              params: { branch_code: branch.branch_code }
            }).catch(() => ({ data: [] })),
            axios.get(`${API_BASE_URL}/tada-bill-wise/branch-summary`, {
              params: { branch_code: branch.branch_code }
            }).catch(() => ({ data: { groups: [] } })),
          ]);

          const salesBMCount = (salesBMRes.data || []).reduce((s, e) => s + (e.total_sr_count || 0), 0);
          const billWiseCount = (billWiseRes.data?.groups || []).reduce((s, g) => s + (g.record_count || 0), 0);

          return {
            branch_code: branch.branch_code,
            sales_bm_count: salesBMCount,
            bill_wise_count: billWiseCount,
          };
        } catch {
          return {
            branch_code: branch.branch_code,
            sales_bm_count: 0,
            bill_wise_count: 0,
          };
        }
      });

      const counts = await Promise.all(countPromises);
      const countsMap = {};
      counts.forEach(c => { countsMap[c.branch_code] = c; });

      const enrichedBranches = sortedBranches.map(b => ({
        ...b,
        sales_bm_count: countsMap[b.branch_code]?.sales_bm_count || 0,
        bill_wise_count: countsMap[b.branch_code]?.bill_wise_count || 0,
      }));

      setBranches(enrichedBranches);
    } catch (error) {
      console.error('Error loading branches:', error);
      toast.error('Failed to load branches');
    } finally {
      setLoadingBranches(false);
    }
  };

  // Calculate total amount for a list of records (engineer-scoped).
  // Mirrors the Details-view logic but is self-contained and takes records as input
  // so it can be used in the engineer-summary list before any engineer is selected.
  const calculateTotalForRecords = (records) => {
    if (!records || records.length === 0) return 0;

    // Build branch-frequency map FROM THIS ENGINEER'S records (not global state)
    const branchCount = {};
    records.forEach(r => {
      if (r.branch_code) branchCount[r.branch_code] = (branchCount[r.branch_code] || 0) + 1;
    });
    let primaryBranch = null, maxCount = 0;
    Object.entries(branchCount).forEach(([b, c]) => {
      if (c > maxCount) { maxCount = c; primaryBranch = b; }
    });

    const resolveBranch = (rec) => {
      let rate = getBranchDARate(rec.branch_code);
      if (rate && (rate.range_amount > 0 || rate.above_amount > 0 || rate.km_rate > 0)) return rec.branch_code;
      if (primaryBranch) {
        rate = getBranchDARate(primaryBranch);
        if (rate && (rate.range_amount > 0 || rate.above_amount > 0 || rate.km_rate > 0)) return primaryBranch;
      }
      const ho = getBranchDARate('HO');
      if (ho && (ho.range_amount > 0 || ho.above_amount > 0 || ho.km_rate > 0)) return 'HO';
      return rec.branch_code;
    };

    let total = 0;
    records.forEach(record => {
      // If already verified with stored amount, use stored value (matches Details view)
      if (record.verification_status === 'Verified' && record.total_amount) {
        total += parseFloat(record.total_amount) || 0;
        return;
      }
      // Otherwise compute dynamically
      const effectiveKM = getEffectiveKM(record);
      if (effectiveKM === null) return;

      const branch = resolveBranch(record);
      const rate = getBranchDARate(branch);
      if (!rate || rate.km_rate === 0) return;

      let da = 0;
      if (rate.range_start_km !== null && rate.range_end_km !== null) {
        if (effectiveKM >= rate.range_start_km && effectiveKM <= rate.range_end_km) da = rate.range_amount;
        else if (rate.above_km !== null && effectiveKM > rate.above_km) da = rate.above_amount;
      } else if (rate.above_km !== null && effectiveKM > rate.above_km) {
        da = rate.above_amount;
      }
      const freight = parseFloat(record.freight_charges) || 0;
      total += (effectiveKM * rate.km_rate) + da + freight;
    });
    return total;
  };

  const loadEngineersSummary = async (branch) => {
    setLoadingEngineerSummary(true);
    setSelectedBranchForSummary(branch);
    setSelectedEngineerDetail(null);
    setEngineerRecords([]);
    setEngineerCalculatedTotals({});
    setSelectedVoucher(null);
    setVoucherGroups([]);
    setSelectedSalesPeriod(null);
    setSalesPeriodRecords([]);
    setSelectedKmWisePeriod(null);
    setKmWisePeriodRecords([]);
    setSelectedBillWisePeriod(null);
    setSelectedBillWiseEngineer(null);
    setBillWisePeriodRecords([]);
    loadSalesBMVouchers(branch); // merged Sales & BM, voucher-wise
    loadBranchBillWiseSummary(branch); // load Bill Wise summary in parallel
    try {
      const response = await axios.get(`${API_BASE_URL}/tada-ho/branch-engineers-summary`, {
        params: { branch_code: branch.branch_code }
      });
      setEngineerSummary(response.data);

      // Fetch each engineer's records in parallel: calculate dynamic total AND
      // collect records so we can group them by voucher number for the new
      // Branch → Voucher → Engineer → Records drill-down.
      setLoadingCalculatedTotals(true);
      const totalsPromises = response.data.map(eng =>
        axios.get(`${API_BASE_URL}/tada-ho/engineer-records`, {
          params: { engineer_uid: eng.engineer_uid, branch_code: branch.branch_code }
        })
          .then(res => ({
            uid: eng.engineer_uid,
            name: eng.engineer_name,
            records: res.data || [],
            total: calculateTotalForRecords(res.data),
          }))
          .catch(() => ({ uid: eng.engineer_uid, name: eng.engineer_name, records: [], total: 0 }))
      );
      const results = await Promise.all(totalsPromises);

      const totalsMap = {};
      const voucherMap = {}; // voucher_no -> { uid -> { engineer_uid, engineer_name, records } }
      results.forEach(({ uid, name, records, total }) => {
        totalsMap[uid] = total;
        records.forEach(rec => {
          const v = String(rec.voucher_no || '').trim() || 'No Voucher';
          if (!voucherMap[v]) voucherMap[v] = {};
          if (!voucherMap[v][uid]) voucherMap[v][uid] = { engineer_uid: uid, engineer_name: name, records: [] };
          voucherMap[v][uid].records.push(rec);
        });
      });
      setEngineerCalculatedTotals(totalsMap);

      const fmtPeriod = (d) => d
        ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : null;

      const builtVoucherGroups = Object.entries(voucherMap).map(([voucher_no, engMap]) => {
        const engineers = Object.values(engMap).map(e => {
          // Engineer's SR Reach-at-Site date range within this voucher
          const dates = e.records
            .map(r => r.sr_reach_at_site_datetime ? new Date(r.sr_reach_at_site_datetime) : null)
            .filter(d => d && !isNaN(d.getTime()));
          const minDate = dates.length ? new Date(Math.min(...dates)) : null;
          const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
          return {
            engineer_uid: e.engineer_uid,
            engineer_name: e.engineer_name,
            record_count: e.records.length,
            verified_count: e.records.filter(r => r.verification_status === 'Verified').length,
            total: calculateTotalForRecords(e.records),
            period_start: fmtPeriod(minDate),
            period_end: fmtPeriod(maxDate),
          };
        }).sort((a, b) => String(a.engineer_name).localeCompare(String(b.engineer_name)));

        // Who submitted this voucher to HO — distinct uploaders across all its records
        const submitterSet = new Set();
        Object.values(engMap).forEach(e => {
          e.records.forEach(r => {
            const by = String(r.uploaded_by || '').trim();
            if (by) submitterSet.add(by);
          });
        });
        const submitted_by = submitterSet.size > 0 ? Array.from(submitterSet).join(', ') : '-';

        return {
          voucher_no,
          submitted_by,
          engineers,
          engineer_count: engineers.length,
          record_count: engineers.reduce((s, e) => s + e.record_count, 0),
          verified_count: engineers.reduce((s, e) => s + e.verified_count, 0),
          total: engineers.reduce((s, e) => s + e.total, 0),
        };
      }).sort((a, b) => String(a.voucher_no).localeCompare(String(b.voucher_no)));
      setVoucherGroups(builtVoucherGroups);
    } catch (error) {
      console.error('Error loading engineer summary:', error);
      toast.error('Failed to load engineer data');
    } finally {
      setLoadingEngineerSummary(false);
      setLoadingCalculatedTotals(false);
    }
  };

  // ─── Load sales summary (grouped) for a branch ────────────
  const loadBranchSalesSummary = async (branch) => {
    setLoadingSalesSummary(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/tada-sales/branch-summary`, {
        params: { branch_code: branch.branch_code },
      });
      setBranchSalesSummary(res.data || { rule_type: '', groups: [] });
    } catch (e) {
      console.error(e);
      setBranchSalesSummary({ rule_type: '', groups: [] });
    } finally {
      setLoadingSalesSummary(false);
    }
  };

  const loadSalesPeriodRecords = async (group) => {
    setLoadingSalesPeriodRecords(true);
    setSelectedSalesPeriod(group);
    try {
      const res = await axios.get(`${API_BASE_URL}/tada-sales/branch-records`, {
        params: {
          branch_code: selectedBranchForSummary.branch_code,
          period_start: group.period_start,
          period_end: group.period_end,
          engineer_name: group.engineer_name,
        },
      });
      const records = res.data || [];
      setSalesPeriodRecords(records);
      const verify = {}, corrections = {}, remarks = {};
      records.forEach(r => {
        verify[r.id] = r.verification_status === 'Verified';
        corrections[r.id] = r.ho_corrected_km || '';
        remarks[r.id] = r.ho_remark || '';
      });
      setSalesVerificationStatus(verify);
      setSalesLocalCorrections(corrections);
      setSalesLocalRemarks(remarks);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load sales records');
    } finally {
      setLoadingSalesPeriodRecords(false);
    }
  };
  // ─── Auto-save sales field with debounce ──────────────────
  const autoSaveSalesField = useCallback((recordId, field, value, originalValue) => {
    if (salesSaveTimeouts[recordId]) clearTimeout(salesSaveTimeouts[recordId]);
    if (value === originalValue) return;
    setSalesSavingStates(prev => ({ ...prev, [recordId]: true }));

    const t = setTimeout(async () => {
      try {
        const body = { [field]: value };
        const { data } = await axios.put(
          `${API_BASE_URL}/tada-sales/records/${recordId}/update`, body
        );
        // Server returns recomputed rate/da/total when ho_corrected_km changes
        setSalesPeriodRecords(prev => prev.map(r =>
          r.id === recordId
            ? {
              ...r,
              [field]: value,
              ...(field === 'ho_corrected_km' ? {
                rate: data.rate, da: data.da, total_amount: data.total_amount,
              } : {}),
            }
            : r
        ));
        toast.success('Saved', { duration: 1000 });
      } catch {
        toast.error('Failed to save');
      } finally {
        setSalesSavingStates(prev => ({ ...prev, [recordId]: false }));
      }
    }, 800);
    setSalesSaveTimeouts(prev => ({ ...prev, [recordId]: t }));
  }, [salesSaveTimeouts]);

  const handleSalesKMCorrectionChange = (recordId, value, originalValue) => {
    setSalesLocalCorrections(prev => ({ ...prev, [recordId]: value }));
    autoSaveSalesField(recordId, 'ho_corrected_km', value, originalValue);
  };

  const handleSalesRemarkChange = (recordId, value, originalValue) => {
    setSalesLocalRemarks(prev => ({ ...prev, [recordId]: value }));
    autoSaveSalesField(recordId, 'ho_remark', value, originalValue);
  };

  const handleSalesVerificationToggle = async (recordId, currentStatus) => {
    const newStatus = !currentStatus;
    setSalesVerificationStatus(prev => ({ ...prev, [recordId]: newStatus }));
    setSalesSavingStates(prev => ({ ...prev, [recordId]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-sales/records/${recordId}/update`, {
        verification_status: newStatus ? 'Verified' : 'Pending',
      });
      setSalesPeriodRecords(prev => prev.map(r =>
        r.id === recordId ? { ...r, verification_status: newStatus ? 'Verified' : 'Pending' } : r
      ));
      toast.success(newStatus ? 'Verified!' : 'Unverified!', { duration: 1000 });
    } catch {
      setSalesVerificationStatus(prev => ({ ...prev, [recordId]: currentStatus }));
      toast.error('Failed to update');
    } finally {
      setSalesSavingStates(prev => ({ ...prev, [recordId]: false }));
    }
  };

  // ─── Submit verified sales rows to history ────────────────
  const submitVerifiedSalesToHistory = async () => {
    const verifiedIds = salesPeriodRecords
      .filter(r => salesVerificationStatus[r.id] && r.verification_status === 'Verified')
      .map(r => r.id);

    if (verifiedIds.length === 0) {
      toast.error('No verified records to submit');
      return;
    }

    const result = await Swal.fire({
      title: 'Submit to History?',
      html: `Move <strong>${verifiedIds.length}</strong> verified sales record(s) to history?<br/>This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, submit!',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setSubmittingSalesToHistory(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada-sales/submit-to-history`, {
        record_ids: verifiedIds,
        submitted_by_name: user?.name || 'HO',
        submitted_by_uid: String(user?.user_id || user?.id || ''),
      });
      await Swal.fire({
        title: 'Done!',
        text: `${data.moved_count} record(s) moved to history.`,
        icon: 'success',
        timer: 2000,
        confirmButtonColor: themeColor,
      });
      // Reload summary + close detail view
      setSelectedSalesPeriod(null);
      setSalesPeriodRecords([]);
      if (selectedBranchForSummary) {
        loadBranchSalesSummary(selectedBranchForSummary);
      }
    } catch {
      toast.error('Failed to submit to history');
    } finally {
      setSubmittingSalesToHistory(false);
    }
  };

  // ─── Filter records by KM threshold (Excel-style >) ───────
  const filteredSalesRecords = useMemo(() => {
    if (!salesKmFilter) return salesPeriodRecords;
    const threshold = parseFloat(salesKmFilter);
    return salesPeriodRecords.filter(r => {
      const km = parseFloat(r.ho_corrected_km || r.km_two_way || 0);
      return !isNaN(km) && km > threshold;
    });
  }, [salesPeriodRecords, salesKmFilter]);

  const salesTotalAmount = useMemo(
    () => filteredSalesRecords.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
    [filteredSalesRecords]
  );
  const salesVerifiedAmount = useMemo(
    () => filteredSalesRecords
      .filter(r => r.verification_status === 'Verified')
      .reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
    [filteredSalesRecords]
  );

  // ─── Load KM Wise summary for a branch ───────────────────────────────
  const loadBranchKmWiseSummary = async (branch) => {
    setLoadingKmWiseSummary(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/tada-km-wise/branch-summary`, {
        params: { branch_code: branch.branch_code },
      });
      setBranchKmWiseSummary(res.data || { rule_type: '', groups: [] });
    } catch (e) {
      console.error(e);
      setBranchKmWiseSummary({ rule_type: '', groups: [] });
    } finally {
      setLoadingKmWiseSummary(false);
    }
  };

  const loadKmWisePeriodRecords = async (group) => {
    setLoadingKmWisePeriodRecords(true);
    setSelectedKmWisePeriod(group);
    try {
      const res = await axios.get(`${API_BASE_URL}/tada-km-wise/branch-records`, {
        params: {
          branch_code: selectedBranchForSummary.branch_code,
          period_start: group.period_start,
          period_end: group.period_end,
          engineer_name: group.engineer_name,
        },
      });
      const records = res.data || [];
      setKmWisePeriodRecords(records);
      const verify = {}, corrections = {}, remarks = {};
      records.forEach(r => {
        verify[r.id] = r.verification_status === 'Verified';
        corrections[r.id] = r.ho_corrected_km || '';
        remarks[r.id] = r.ho_remark || '';
      });
      setKmWiseVerificationStatus(verify);
      setKmWiseLocalCorrections(corrections);
      setKmWiseLocalRemarks(remarks);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load KM Wise records');
    } finally {
      setLoadingKmWisePeriodRecords(false);
    }
  };

  // ─── Auto-save KM Wise field with debounce ───────────────────────────
  const autoSaveKmWiseField = useCallback((recordId, field, value, originalValue) => {
    if (kmWiseSaveTimeouts[recordId]) clearTimeout(kmWiseSaveTimeouts[recordId]);
    if (value === originalValue) return;
    setKmWiseSavingStates(prev => ({ ...prev, [recordId]: true }));

    const t = setTimeout(async () => {
      try {
        const body = { [field]: value };
        const { data } = await axios.put(
          `${API_BASE_URL}/tada-km-wise/records/${recordId}/update`, body
        );
        setKmWisePeriodRecords(prev => prev.map(r =>
          r.id === recordId
            ? {
              ...r,
              [field]: value,
              ...(field === 'ho_corrected_km' ? {
                rate: data.rate, da: data.da, amount: data.amount,
              } : {}),
            }
            : r
        ));
        toast.success('Saved', { duration: 1000 });
      } catch {
        toast.error('Failed to save');
      } finally {
        setKmWiseSavingStates(prev => ({ ...prev, [recordId]: false }));
      }
    }, 800);
    setKmWiseSaveTimeouts(prev => ({ ...prev, [recordId]: t }));
  }, [kmWiseSaveTimeouts]);

  const handleKmWiseKMCorrectionChange = (recordId, value, originalValue) => {
    setKmWiseLocalCorrections(prev => ({ ...prev, [recordId]: value }));
    autoSaveKmWiseField(recordId, 'ho_corrected_km', value, originalValue);
  };

  const handleKmWiseRemarkChange = (recordId, value, originalValue) => {
    setKmWiseLocalRemarks(prev => ({ ...prev, [recordId]: value }));
    autoSaveKmWiseField(recordId, 'ho_remark', value, originalValue);
  };

  const handleKmWiseVerificationToggle = async (recordId, currentStatus) => {
    const newStatus = !currentStatus;
    setKmWiseVerificationStatus(prev => ({ ...prev, [recordId]: newStatus }));
    setKmWiseSavingStates(prev => ({ ...prev, [recordId]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-km-wise/records/${recordId}/update`, {
        verification_status: newStatus ? 'Verified' : 'Pending',
      });
      setKmWisePeriodRecords(prev => prev.map(r =>
        r.id === recordId ? { ...r, verification_status: newStatus ? 'Verified' : 'Pending' } : r
      ));
      toast.success(newStatus ? 'Verified!' : 'Unverified!', { duration: 1000 });
    } catch {
      setKmWiseVerificationStatus(prev => ({ ...prev, [recordId]: currentStatus }));
      toast.error('Failed to update');
    } finally {
      setKmWiseSavingStates(prev => ({ ...prev, [recordId]: false }));
    }
  };

  // ─── Submit verified KM Wise rows to history ─────────────────────────
  const submitVerifiedKmWiseToHistory = async () => {
    const verifiedIds = kmWisePeriodRecords
      .filter(r => kmWiseVerificationStatus[r.id] && r.verification_status === 'Verified')
      .map(r => r.id);

    if (verifiedIds.length === 0) {
      toast.error('No verified records to submit');
      return;
    }

    const result = await Swal.fire({
      title: 'Submit to History?',
      html: `Move <strong>${verifiedIds.length}</strong> verified KM Wise record(s) to history?<br/>This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, submit!',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setSubmittingKmWiseToHistory(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada-km-wise/submit-to-history`, {
        record_ids: verifiedIds,
        submitted_by_name: user?.name || 'HO',
        submitted_by_uid: String(user?.user_id || user?.id || ''),
      });
      await Swal.fire({
        title: 'Done!',
        text: `${data.moved_count} record(s) moved to history.`,
        icon: 'success',
        timer: 2000,
        confirmButtonColor: themeColor,
      });
      setSelectedKmWisePeriod(null);
      setKmWisePeriodRecords([]);
      if (selectedBranchForSummary) {
        loadBranchKmWiseSummary(selectedBranchForSummary);
      }
    } catch {
      toast.error('Failed to submit to history');
    } finally {
      setSubmittingKmWiseToHistory(false);
    }
  };

  const fetchBranchEmployees = async (branchCode) => {
    setLoadingBranchEmployees(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/expense/branch-employees`, {
        params: { branch_code: branchCode }
      });
      setBranchEmployees(data);
    } catch {
      toast.error('Failed to load employees');
    } finally {
      setLoadingBranchEmployees(false);
    }
  };

  // ─── Filter KM Wise records by KM threshold ──────────────────────────
  const filteredKmWiseRecords = useMemo(() => {
    if (!kmWiseKmFilter) return kmWisePeriodRecords;
    const threshold = parseFloat(kmWiseKmFilter);
    return kmWisePeriodRecords.filter(r => {
      const km = parseFloat(r.ho_corrected_km || r.km || 0);
      return !isNaN(km) && km > threshold;
    });
  }, [kmWisePeriodRecords, kmWiseKmFilter]);

  const kmWiseTotalAmount = useMemo(
    () => filteredKmWiseRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [filteredKmWiseRecords]
  );
  const kmWiseVerifiedAmount = useMemo(
    () => filteredKmWiseRecords
      .filter(r => r.verification_status === 'Verified')
      .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [filteredKmWiseRecords]
  );

  // ─── Load Bill Wise summary for a branch ─────────────────────────────
  const loadBranchBillWiseSummary = async (branch) => {
    setLoadingBillWiseSummary(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/tada-bill-wise/branch-vouchers`, {
        params: { branch_code: branch.branch_code },
      });
      setBranchBillWiseSummary(res.data || { groups: [] });
    } catch (e) {
      console.error(e);
      setBranchBillWiseSummary({ groups: [] });
    } finally {
      setLoadingBillWiseSummary(false);
    }
  };

  // `group` is now a VOUCHER group: { voucher_no, submitted_by, ... }
  const loadBillWisePeriodRecords = async (group) => {
    setLoadingBillWisePeriodRecords(true);
    setSelectedBillWisePeriod(group);
    setSelectedBillWiseEngineer(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/tada-bill-wise/voucher-records`, {
        params: {
          branch_code: selectedBranchForSummary.branch_code,
          voucher_no: group.voucher_no,
        },
      });
      const records = res.data || [];
      setBillWisePeriodRecords(records);
      const verify = {};
      records.forEach(r => {
        verify[r.id] = r.verification_status === 'Verified';
      });
      setBillWiseVerificationStatus(verify);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load Bill Wise records');
    } finally {
      setLoadingBillWisePeriodRecords(false);
    }
  };

  // ─── Verify / Unverify a single row ──────────────────────────────────
  const handleBillWiseVerificationToggle = async (recordId, currentStatus) => {
    const newStatus = !currentStatus;
    setBillWiseVerificationStatus(prev => ({ ...prev, [recordId]: newStatus }));
    setBillWiseSavingStates(prev => ({ ...prev, [recordId]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-bill-wise/records/${recordId}/update`, {
        verification_status: newStatus ? 'Verified' : 'Pending',
      });
      setBillWisePeriodRecords(prev => prev.map(r =>
        r.id === recordId ? { ...r, verification_status: newStatus ? 'Verified' : 'Pending' } : r
      ));
      toast.success(newStatus ? 'Verified!' : 'Unverified!', { duration: 1000 });
    } catch {
      setBillWiseVerificationStatus(prev => ({ ...prev, [recordId]: currentStatus }));
      toast.error('Failed to update');
    } finally {
      setBillWiseSavingStates(prev => ({ ...prev, [recordId]: false }));
    }
  };

  // ─── Submit verified rows to history ─────────────────────────────────
  const submitVerifiedBillWiseToHistory = async () => {
    const verifiedIds = billWisePeriodRecords
      .filter(r => billWiseVerificationStatus[r.id] && r.verification_status === 'Verified')
      .map(r => r.id);

    if (verifiedIds.length === 0) {
      toast.error('No verified records to submit');
      return;
    }

    const result = await Swal.fire({
      title: 'Submit to History?',
      html: `Move <strong>${verifiedIds.length}</strong> verified Bill Wise record(s) to history?<br/>This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, submit!',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setSubmittingBillWiseToHistory(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada-bill-wise/submit-to-history`, {
        record_ids: verifiedIds,
        submitted_by_name: user?.name || 'HO',
        submitted_by_uid: String(user?.user_id || user?.id || ''),
      });
      await Swal.fire({
        title: 'Done!',
        text: `${data.moved_count} record(s) moved to history.`,
        icon: 'success',
        timer: 2000,
        confirmButtonColor: themeColor,
      });
      setSelectedBillWisePeriod(null);
      setSelectedBillWiseEngineer(null);
      setBillWisePeriodRecords([]);
      if (selectedBranchForSummary) {
        loadBranchBillWiseSummary(selectedBranchForSummary);
      }
    } catch {
      toast.error('Failed to submit to history');
    } finally {
      setSubmittingBillWiseToHistory(false);
    }
  };

  // ─── Memos for totals ────────────────────────────────────────────────
  const billWiseTotalAmount = useMemo(
    () => billWisePeriodRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [billWisePeriodRecords]
  );
  const billWiseVerifiedAmount = useMemo(
    () => billWisePeriodRecords
      .filter(r => r.verification_status === 'Verified')
      .reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [billWisePeriodRecords]
  );

  // ═══════════ Sales & BM (merged) loaders/handlers ═══════════
  const loadSalesBMVouchers = async (branch) => {
    setLoadingSalesBM(true);
    setSelectedSalesBMVoucher(null);
    setSelectedSalesBMEngineer(null);
    setSalesBMRecords([]);
    try {
      const engRes = await axios.get(`${API_BASE_URL}/tada-salesbm/branch-engineers-summary`, {
        params: { branch_code: branch.branch_code },
      });
      const engineers = engRes.data || [];
      const results = await Promise.all(engineers.map(e =>
        axios.get(`${API_BASE_URL}/tada-salesbm/engineer-records`, {
          params: { branch_code: branch.branch_code, engineer_uid: e.engineer_uid || '', engineer_name: e.engineer_name || '' },
        }).then(r => ({ e, records: r.data || [] })).catch(() => ({ e, records: [] }))
      ));

      const vmap = {};
      results.forEach(({ e, records }) => {
        records.forEach(rec => {
          const v = String(rec.voucher_no || '').trim() || 'No Voucher';
          const uid = e.engineer_uid || e.engineer_name;
          if (!vmap[v]) vmap[v] = {};
          if (!vmap[v][uid]) vmap[v][uid] = { engineer_uid: e.engineer_uid, engineer_name: e.engineer_name, records: [] };
          vmap[v][uid].records.push(rec);
        });
      });

      const groups = Object.entries(vmap).map(([voucher_no, engMap]) => {
        const fmtP = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
        const engs = Object.values(engMap).map(en => {
          const ds = en.records.map(r => { const d = new Date(r.date); return isNaN(d.getTime()) ? null : d; }).filter(Boolean);
          const minD = ds.length ? new Date(Math.min(...ds)) : null;
          const maxD = ds.length ? new Date(Math.max(...ds)) : null;
          return {
            engineer_uid: en.engineer_uid,
            engineer_name: en.engineer_name,
            records: en.records,
            record_count: en.records.length,
            verified_count: en.records.filter(r => r.verification_status === 'Verified').length,
            total: en.records.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
            period_start: fmtP(minD),
            period_end: fmtP(maxD),
          };
        }).sort((a, b) => String(a.engineer_name).localeCompare(String(b.engineer_name)));
        const submitterSet = new Set();
        engs.forEach(en => en.records.forEach(r => { if (r.created_by) submitterSet.add(r.created_by); }));
        return {
          voucher_no,
          submitted_by: submitterSet.size ? Array.from(submitterSet).join(', ') : '-',
          engineers: engs,
          engineer_count: engs.length,
          record_count: engs.reduce((s, e) => s + e.record_count, 0),
          verified_count: engs.reduce((s, e) => s + e.verified_count, 0),
          total: engs.reduce((s, e) => s + e.total, 0),
        };
      }).sort((a, b) => String(a.voucher_no).localeCompare(String(b.voucher_no)));

      setSalesBMVoucherGroups(groups);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load Sales & BM');
      setSalesBMVoucherGroups([]);
    } finally {
      setLoadingSalesBM(false);
    }
  };

  const openSalesBMEngineer = (engineer) => {
    setSelectedSalesBMEngineer(engineer);
    setSalesBMTab('pending');
    const recs = engineer.records || [];
    setSalesBMRecords(recs);
    const v = {}, c = {}, r = {}, d = {};
    recs.forEach(x => {
      v[x.id] = x.verification_status === 'Verified';
      c[x.id] = x.ho_corrected_km || '';
      r[x.id] = x.ho_remark || '';
      d[x.id] = '';
    });
    setSalesBMVerify(v); setSalesBMCorr(c); setSalesBMRemark(r); setSalesBMDA(d);
  };

  const autoSaveSalesBMField = useCallback((recordId, field, value, originalValue) => {
    if (salesBMTimers[recordId]) clearTimeout(salesBMTimers[recordId]);
    if (value === originalValue) return;
    setSalesBMSaving(prev => ({ ...prev, [recordId]: true }));
    const t = setTimeout(async () => {
      try {
        const { data } = await axios.put(`${API_BASE_URL}/tada-salesbm/records/${recordId}/update`, { [field]: value });
        setSalesBMRecords(prev => prev.map(r =>
          r.id === recordId ? {
            ...r, [field]: value,
            ...(field === 'ho_corrected_km' ? { rate: data.rate, da: data.da, amount: data.amount, total_amount: data.total_amount } : {}),
          } : r
        ));
        if (field === 'ho_corrected_km') setSalesBMDA(prev => ({ ...prev, [recordId]: '' }));
        toast.success('Saved', { duration: 1000 });
      } catch {
        toast.error('Failed to save');
      } finally {
        setSalesBMSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 800);
    setSalesBMTimers(prev => ({ ...prev, [recordId]: t }));
  }, [salesBMTimers]);

  const handleSalesBMVerifyToggle = async (recordId, currentStatus) => {
    const newStatus = !currentStatus;
    setSalesBMVerify(prev => ({ ...prev, [recordId]: newStatus }));
    setSalesBMSaving(prev => ({ ...prev, [recordId]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-salesbm/records/${recordId}/update`, {
        verification_status: newStatus ? 'Verified' : 'Pending',
      });
      setSalesBMRecords(prev => prev.map(r =>
        r.id === recordId ? { ...r, verification_status: newStatus ? 'Verified' : 'Pending' } : r));
      toast.success(newStatus ? 'Verified!' : 'Unverified!', { duration: 1000 });
    } catch {
      setSalesBMVerify(prev => ({ ...prev, [recordId]: currentStatus }));
      toast.error('Failed to update');
    } finally {
      setSalesBMSaving(prev => ({ ...prev, [recordId]: false }));
    }
  };

  const submitVerifiedSalesBM = async () => {
    const verifiedIds = salesBMRecords
      .filter(r => r.verification_status === 'Verified')
      .map(r => r.id);
    if (verifiedIds.length === 0) { toast.error('No verified records to submit'); return; }

    const result = await Swal.fire({
      title: 'Submit to History?',
      html: `Move <strong>${verifiedIds.length}</strong> verified Sales & BM record(s) to history?<br/>This cannot be undone.`,
      icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, submit!', reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setSubmittingSalesBM(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/tada-salesbm/submit-to-history`, {
        record_ids: verifiedIds,
        submitted_by_name: user?.name || 'HO',
        submitted_by_uid: String(user?.user_id || user?.id || ''),
      });
      await Swal.fire({ title: 'Done!', text: `${data.moved_count} record(s) moved to history.`, icon: 'success', timer: 2000, confirmButtonColor: themeColor });
      setSelectedSalesBMEngineer(null);
      setSelectedSalesBMVoucher(null);
      if (selectedBranchForSummary) loadSalesBMVouchers(selectedBranchForSummary);
    } catch {
      toast.error('Failed to submit to history');
    } finally {
      setSubmittingSalesBM(false);
    }
  };

  const filteredSalesBMRecords = useMemo(() => {
    if (!salesBMKmFilter) return salesBMRecords;
    const t = parseFloat(salesBMKmFilter);
    return salesBMRecords.filter(r => {
      const km = parseFloat(r.ho_corrected_km || r.two_way_km || 0);
      return !isNaN(km) && km > t;
    });
  }, [salesBMRecords, salesBMKmFilter]);

  const salesBMTotalAmount = useMemo(
    () => filteredSalesBMRecords.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
    [filteredSalesBMRecords]
  );
  const salesBMVerifiedAmount = useMemo(
    () => filteredSalesBMRecords.filter(r => r.verification_status === 'Verified')
      .reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
    [filteredSalesBMRecords]
  );

  // HO manual DA: total = amount (rate × km) + DA. Persists da + total_amount.
  const handleSalesBMDAChange = (recordId, value) => {
    setSalesBMDA(prev => ({ ...prev, [recordId]: value }));
    const rec = salesBMRecords.find(r => r.id === recordId);
    if (!rec) return;
    const amount = parseFloat(rec.amount) || 0;
    const da = (value !== '' && !isNaN(parseFloat(value))) ? parseFloat(value) : 0;
    const newTotal = (amount + da).toFixed(2);
    setSalesBMRecords(prev => prev.map(r =>
      r.id === recordId ? { ...r, da: value === '' ? r.da : da.toFixed(2), total_amount: newTotal } : r));

    if (salesBMTimers[recordId]) clearTimeout(salesBMTimers[recordId]);
    setSalesBMSaving(prev => ({ ...prev, [recordId]: true }));
    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/tada-salesbm/records/${recordId}/update`, { da: value, total_amount: newTotal });
        toast.success('Saved', { duration: 1000 });
      } catch {
        toast.error('Failed to save');
      } finally {
        setSalesBMSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 800);
    setSalesBMTimers(prev => ({ ...prev, [recordId]: t }));
  };

  const tabSalesBMRecords = useMemo(() => filteredSalesBMRecords.filter(r => {
    const v = r.verification_status === 'Verified';
    return salesBMTab === 'verified' ? v : !v;
  }), [filteredSalesBMRecords, salesBMTab]);

  const salesBMPendingCount = filteredSalesBMRecords.filter(r => r.verification_status !== 'Verified').length;
  const salesBMVerifiedCount = filteredSalesBMRecords.filter(r => r.verification_status === 'Verified').length;
  const salesBMTabTotal = tabSalesBMRecords.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);

  const loadEngineerDetails = async (engineerUid, engineerName, branchCode) => {
    setLoadingRecords(true);
    setSelectedEngineerDetail({ uid: engineerUid, name: engineerName });
    setEngineerRecords([]);

    try {
      const response = await axios.get(`${API_BASE_URL}/tada-ho/engineer-records`, {
        params: {
          engineer_uid: engineerUid,
          branch_code: branchCode
        }
      });
      const allRecords = response.data || [];
      // When drilling in from a voucher, only show that voucher's records
      const records = selectedVoucher
        ? allRecords.filter(r => (String(r.voucher_no || '').trim() || 'No Voucher') === selectedVoucher.voucher_no)
        : allRecords;
      setEngineerRecords(records);
      if (records.length > 0) {
        toast.success(`Loaded ${records.length} records for ${engineerName}`);
      }
      // No toast for empty state — the UI itself shows the clean message
    } catch (error) {
      console.error('Error loading engineer records:', error);
      toast.error('Failed to load engineer records');
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleSelectVoucher = (voucherGroup) => {
    setSelectedVoucher(voucherGroup);
    setSelectedEngineerDetail(null);
    setEngineerRecords([]);
  };

  const handleBackToVouchers = () => {
    setSelectedVoucher(null);
    setSelectedEngineerDetail(null);
    setEngineerRecords([]);
  };

  const handleBackToBranches = () => {
    setSelectedBranchForSummary(null);
    setEngineerSummary([]);
    setVoucherGroups([]);
    setSelectedVoucher(null);
    setSelectedEngineerDetail(null);
    setEngineerRecords([]);
    setSalesBMVoucherGroups([]);
    setSelectedSalesBMVoucher(null);
    setSelectedSalesBMEngineer(null);
    setSalesBMRecords([]);
    setBranchBillWiseSummary({ rule_type: '', groups: [] });
    setSelectedBillWisePeriod(null);
    setSelectedBillWiseEngineer(null);
    setBillWisePeriodRecords([]);
  };


  // Handle back to engineer summary from details
  const handleBackToEngineersList = () => {
    setSelectedEngineerDetail(null);
    setEngineerRecords([]);
  };

  // Column drag handler
  const handleColumnDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setColumnOrder(items => {
      const next = [...items];
      const [moved] = next.splice(items.indexOf(active.id), 1);
      next.splice(items.indexOf(over.id), 0, moved);
      return next;
    });
  };

  const loadBranchHistory = (branch) => {
    setHistoryBranch(branch);
    setShowHistoryModal(true);
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setHistoryBranch(null);
  };

  // Auto-save a single row's paid_date with debounce
  const handlePaidDateChange = (recordId, value) => {
    setPaidDateEdits(prev => ({ ...prev, [recordId]: value }));

    if (paidDateTimers[recordId]) clearTimeout(paidDateTimers[recordId]);
    setPaidDateSaving(prev => ({ ...prev, [recordId]: true }));

    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/tada-ho/history/${recordId}/paid-date`, {
          paid_date: value || null
        });
        setHistoryRecords(prev => prev.map(r => r.id === recordId ? { ...r, paid_date: value || null } : r));
        toast.success('Paid date saved', { duration: 1200 });
      } catch (e) {
        console.error(e);
        toast.error('Failed to save paid date');
      } finally {
        setPaidDateSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 700);
    setPaidDateTimers(prev => ({ ...prev, [recordId]: t }));
  };

  // Apply a paid_date to every row inside one period bucket
  const handlePeriodPaidApply = async (group) => {
    const key = `${group.uploaded_by}__${group.period_start}__${group.period_end}`;
    const value = periodPaidInputs[key] ?? group.paid_date ?? '';
    if (!value) {
      toast.error('Please pick a paid date first');
      return;
    }
    if (!group.record_ids?.length) {
      toast.error('No records in this period');
      return;
    }

    const result = await Swal.fire({
      title: 'Apply Paid Date?',
      html: `Set paid date <strong>${value}</strong> on <strong>${group.record_ids.length}</strong> record(s) for <strong>${group.uploaded_by}</strong> (${group.period_start_display} → ${group.period_end_display})?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: themeColor,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, apply',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setPeriodPaidApplying(prev => ({ ...prev, [key]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-ho/history/bulk-paid-date`, {
        record_ids: group.record_ids,
        paid_date: value,
      });
      const idSet = new Set(group.record_ids);
      setHistoryRecords(prev => prev.map(r => idSet.has(r.id) ? { ...r, paid_date: value } : r));
      setPaidDateEdits(prev => {
        const next = { ...prev };
        group.record_ids.forEach(id => { next[id] = value; });
        return next;
      });
      setHistoryGrouped(prev => ({
        ...prev,
        groups: (prev.groups || []).map(g =>
          (g.uploaded_by === group.uploaded_by &&
            g.period_start === group.period_start &&
            g.period_end === group.period_end)
            ? { ...g, paid_date: value, paid_count: group.record_ids.length }
            : g
        ),
      }));
      toast.success(`Applied to ${group.record_ids.length} record(s)`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to apply paid date');
    } finally {
      setPeriodPaidApplying(prev => ({ ...prev, [key]: false }));
    }
  };

  // ─── Sales: auto-save single row paid_date ─────────────────────────
  const handleSalesPaidDateChange = (recordId, value) => {
    setSalesPaidDateEdits(prev => ({ ...prev, [recordId]: value }));
    if (salesPaidDateTimers[recordId]) clearTimeout(salesPaidDateTimers[recordId]);
    setSalesPaidDateSaving(prev => ({ ...prev, [recordId]: true }));

    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/tada-sales/history/${recordId}/paid-date`, {
          paid_date: value || null,
        });
        setSalesHistoryRecords(prev => prev.map(r => r.id === recordId ? { ...r, paid_date: value || null } : r));
        toast.success('Paid date saved', { duration: 1200 });
      } catch (e) {
        console.error(e);
        toast.error('Failed to save paid date');
      } finally {
        setSalesPaidDateSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 700);
    setSalesPaidDateTimers(prev => ({ ...prev, [recordId]: t }));
  };

  // ─── Sales: bulk apply paid_date to a period ───────────────────────
  const handleSalesPeriodPaidApply = async (group) => {
    const key = `${group.uploaded_by}__${group.period_start}__${group.period_end}`;
    const value = salesPeriodPaidInputs[key] ?? group.paid_date ?? '';
    if (!value) { toast.error('Please pick a paid date first'); return; }
    if (!group.record_ids?.length) { toast.error('No records in this period'); return; }

    const result = await Swal.fire({
      title: 'Apply Paid Date?',
      html: `Set paid date <strong>${value}</strong> on <strong>${group.record_ids.length}</strong> sales record(s) for <strong>${group.uploaded_by}</strong> (${group.period_start_display} → ${group.period_end_display})?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: themeColor,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, apply',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setSalesPeriodPaidApplying(prev => ({ ...prev, [key]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-sales/history/bulk-paid-date`, {
        record_ids: group.record_ids,
        paid_date: value,
      });
      const idSet = new Set(group.record_ids);
      setSalesHistoryRecords(prev => prev.map(r => idSet.has(r.id) ? { ...r, paid_date: value } : r));
      setSalesPaidDateEdits(prev => {
        const next = { ...prev };
        group.record_ids.forEach(id => { next[id] = value; });
        return next;
      });
      setSalesHistoryGrouped(prev => ({
        ...prev,
        groups: (prev.groups || []).map(g =>
          (g.uploaded_by === group.uploaded_by &&
            g.period_start === group.period_start &&
            g.period_end === group.period_end)
            ? { ...g, paid_date: value, paid_count: group.record_ids.length }
            : g
        ),
      }));
      toast.success(`Applied to ${group.record_ids.length} record(s)`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to apply paid date');
    } finally {
      setSalesPeriodPaidApplying(prev => ({ ...prev, [key]: false }));
    }
  };

  // ─── KM Wise: auto-save single row paid_date ───────────────────────
  const handleKmWisePaidDateChange = (recordId, value) => {
    setKmWisePaidDateEdits(prev => ({ ...prev, [recordId]: value }));
    if (kmWisePaidDateTimers[recordId]) clearTimeout(kmWisePaidDateTimers[recordId]);
    setKmWisePaidDateSaving(prev => ({ ...prev, [recordId]: true }));

    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/tada-km-wise/history/${recordId}/paid-date`, {
          paid_date: value || null,
        });
        setKmWiseHistoryRecords(prev => prev.map(r => r.id === recordId ? { ...r, paid_date: value || null } : r));
        toast.success('Paid date saved', { duration: 1200 });
      } catch (e) {
        console.error(e);
        toast.error('Failed to save paid date');
      } finally {
        setKmWisePaidDateSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 700);
    setKmWisePaidDateTimers(prev => ({ ...prev, [recordId]: t }));
  };

  // ─── KM Wise: bulk apply paid_date to a period ─────────────────────
  const handleKmWisePeriodPaidApply = async (group) => {
    const key = `${group.uploaded_by}__${group.period_start}__${group.period_end}`;
    const value = kmWisePeriodPaidInputs[key] ?? group.paid_date ?? '';
    if (!value) { toast.error('Please pick a paid date first'); return; }
    if (!group.record_ids?.length) { toast.error('No records in this period'); return; }

    const result = await Swal.fire({
      title: 'Apply Paid Date?',
      html: `Set paid date <strong>${value}</strong> on <strong>${group.record_ids.length}</strong> KM Wise record(s) for <strong>${group.uploaded_by}</strong> (${group.period_start_display} → ${group.period_end_display})?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: themeColor,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, apply',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setKmWisePeriodPaidApplying(prev => ({ ...prev, [key]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-km-wise/history/bulk-paid-date`, {
        record_ids: group.record_ids,
        paid_date: value,
      });
      const idSet = new Set(group.record_ids);
      setKmWiseHistoryRecords(prev => prev.map(r => idSet.has(r.id) ? { ...r, paid_date: value } : r));
      setKmWisePaidDateEdits(prev => {
        const next = { ...prev };
        group.record_ids.forEach(id => { next[id] = value; });
        return next;
      });
      setKmWiseHistoryGrouped(prev => ({
        ...prev,
        groups: (prev.groups || []).map(g =>
          (g.uploaded_by === group.uploaded_by &&
            g.period_start === group.period_start &&
            g.period_end === group.period_end)
            ? { ...g, paid_date: value, paid_count: group.record_ids.length }
            : g
        ),
      }));
      toast.success(`Applied to ${group.record_ids.length} record(s)`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to apply paid date');
    } finally {
      setKmWisePeriodPaidApplying(prev => ({ ...prev, [key]: false }));
    }
  };

  // ─── Bill Wise: auto-save single row paid_date ─────────────────────
  const handleBillWisePaidDateChange = (recordId, value) => {
    setBillWisePaidDateEdits(prev => ({ ...prev, [recordId]: value }));
    if (billWisePaidDateTimers[recordId]) clearTimeout(billWisePaidDateTimers[recordId]);
    setBillWisePaidDateSaving(prev => ({ ...prev, [recordId]: true }));

    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/tada-bill-wise/history/${recordId}/paid-date`, {
          paid_date: value || null,
        });
        setBillWiseHistoryRecords(prev => prev.map(r => r.id === recordId ? { ...r, paid_date: value || null } : r));
        toast.success('Paid date saved', { duration: 1200 });
      } catch (e) {
        console.error(e);
        toast.error('Failed to save paid date');
      } finally {
        setBillWisePaidDateSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 700);
    setBillWisePaidDateTimers(prev => ({ ...prev, [recordId]: t }));
  };

  // ─── Bill Wise: bulk apply paid_date to a period ───────────────────
  const handleBillWisePeriodPaidApply = async (group) => {
    const key = `${group.uploaded_by}__${group.period_start}__${group.period_end}`;
    const value = billWisePeriodPaidInputs[key] ?? group.paid_date ?? '';
    if (!value) { toast.error('Please pick a paid date first'); return; }
    if (!group.record_ids?.length) { toast.error('No records in this period'); return; }

    const result = await Swal.fire({
      title: 'Apply Paid Date?',
      html: `Set paid date <strong>${value}</strong> on <strong>${group.record_ids.length}</strong> Bill Wise record(s) for <strong>${group.uploaded_by}</strong> (${group.period_start_display} → ${group.period_end_display})?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: themeColor,
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, apply',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setBillWisePeriodPaidApplying(prev => ({ ...prev, [key]: true }));
    try {
      await axios.put(`${API_BASE_URL}/tada-bill-wise/history/bulk-paid-date`, {
        record_ids: group.record_ids,
        paid_date: value,
      });
      const idSet = new Set(group.record_ids);
      setBillWiseHistoryRecords(prev => prev.map(r => idSet.has(r.id) ? { ...r, paid_date: value } : r));
      setBillWisePaidDateEdits(prev => {
        const next = { ...prev };
        group.record_ids.forEach(id => { next[id] = value; });
        return next;
      });
      setBillWiseHistoryGrouped(prev => ({
        ...prev,
        groups: (prev.groups || []).map(g =>
          (g.uploaded_by === group.uploaded_by &&
            g.period_start === group.period_start &&
            g.period_end === group.period_end)
            ? { ...g, paid_date: value, paid_count: group.record_ids.length }
            : g
        ),
      }));
      toast.success(`Applied to ${group.record_ids.length} record(s)`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to apply paid date');
    } finally {
      setBillWisePeriodPaidApplying(prev => ({ ...prev, [key]: false }));
    }
  };

  // Dual scrollbar sync
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
  }, [engineerRecords]);

  const totalTableWidth = columnOrder.reduce((s, k) => s + (COL_MAP[k]?.width || 120), 0);

  const getBranchDARate = (branchCode) => {
    const branchRate = kmRates[branchCode];
    if (!branchRate) return null;
    return {
      range_start_km: branchRate.range_start_km ? parseFloat(branchRate.range_start_km) : null,
      range_end_km: branchRate.range_end_km ? parseFloat(branchRate.range_end_km) : null,
      range_amount: branchRate.range_amount ? parseFloat(branchRate.range_amount) : 0,
      above_km: branchRate.above_km ? parseFloat(branchRate.above_km) : null,
      above_amount: branchRate.above_amount ? parseFloat(branchRate.above_amount) : 0,
      km_rate: branchRate.km_rate ? parseFloat(branchRate.km_rate) : 0
    };
  };

  const findEngineerPrimaryBranch = (engineerUid) => {
    const engineerRecordsList = engineerRecords.filter(r => r.service_engineer_uid === engineerUid);
    if (engineerRecordsList.length === 0) return null;
    const branchCount = {};
    engineerRecordsList.forEach(record => {
      const branch = record.branch_code;
      if (branch) branchCount[branch] = (branchCount[branch] || 0) + 1;
    });
    let primaryBranch = null;
    let maxCount = 0;
    Object.entries(branchCount).forEach(([branch, count]) => {
      if (count > maxCount) {
        maxCount = count;
        primaryBranch = branch;
      }
    });
    return primaryBranch;
  };

  const getEffectiveBranchForRecord = (record) => {
    let branchRate = getBranchDARate(record.branch_code);
    if (branchRate && (branchRate.range_amount > 0 || branchRate.above_amount > 0 || branchRate.km_rate > 0)) {
      return record.branch_code;
    }
    if (record.service_engineer_uid) {
      const primaryBranch = findEngineerPrimaryBranch(record.service_engineer_uid);
      if (primaryBranch) {
        branchRate = getBranchDARate(primaryBranch);
        if (branchRate && (branchRate.range_amount > 0 || branchRate.above_amount > 0 || branchRate.km_rate > 0)) {
          return primaryBranch;
        }
      }
    }
    const hoRate = getBranchDARate('HO');
    if (hoRate && (hoRate.range_amount > 0 || hoRate.above_amount > 0 || hoRate.km_rate > 0)) {
      return 'HO';
    }
    return record.branch_code;
  };

  const getEffectiveKM = (record) => {
    if (record.ho_corrected_km && record.ho_corrected_km.trim() !== '') {
      const km = parseFloat(record.ho_corrected_km);
      if (!isNaN(km)) return km;
    }
    if (record.branch_verified_km && record.branch_verified_km.trim() !== '') {
      const km = parseFloat(record.branch_verified_km);
      if (!isNaN(km)) return km;
    }
    if (record.two_way_km && record.two_way_km.trim() !== '') {
      const km = parseFloat(record.two_way_km);
      if (!isNaN(km)) return km;
    }
    return null;
  };

  // Effective freight for the open engineer's records: prefer the value HO is
  // editing (localFreightAmounts), else the stored freight_charges.
  const getEffectiveFreight = (record) => {
    const local = localFreightAmounts[record.id];
    const raw = (local !== undefined && local !== '') ? local : record.freight_charges;
    const f = parseFloat(raw);
    return isNaN(f) ? 0 : f;
  };

  const calculateDAmount = (record, effectiveKM) => {
    if (effectiveKM === null) return null;
    const effectiveBranch = getEffectiveBranchForRecord(record);
    const branchRate = getBranchDARate(effectiveBranch);
    if (!branchRate) return null;
    let daAmount = 0;
    if (branchRate.range_start_km !== null && branchRate.range_end_km !== null) {
      if (effectiveKM >= branchRate.range_start_km && effectiveKM <= branchRate.range_end_km) {
        daAmount = branchRate.range_amount;
      } else if (branchRate.above_km !== null && effectiveKM > branchRate.above_km) {
        daAmount = branchRate.above_amount;
      }
    } else if (branchRate.above_km !== null) {
      if (effectiveKM > branchRate.above_km) {
        daAmount = branchRate.above_amount;
      }
    }
    return daAmount;
  };

  const calculateTotalAmountDynamic = (record, effectiveKM, daAmount) => {
    if (effectiveKM === null) return null;
    const effectiveBranch = getEffectiveBranchForRecord(record);
    const branchRate = getBranchDARate(effectiveBranch);
    if (!branchRate || branchRate.km_rate === 0) return null;
    const freight = getEffectiveFreight(record);
    const total = (effectiveKM * branchRate.km_rate) + (daAmount || 0) + freight;
    return total;
  };

  const updateAllCalculations = useCallback(() => {
    const newDAAmounts = {};
    const newTotalAmounts = {};
    engineerRecords.forEach(record => {
      const isVerified = record.verification_status === 'Verified';

      // Check if HO has manually typed a DA value for this row
      const manualDA = localDAAmounts[record.id];
      const hasManualDA = manualDA !== undefined && manualDA !== '' && !isNaN(parseFloat(manualDA));

      if (isVerified && record.da_amount && record.total_amount) {
        // Verified rows: keep stored values
        newDAAmounts[record.id] = record.da_amount;
        newTotalAmounts[record.id] = record.total_amount;
      } else if (hasManualDA) {
        // Manual override: use typed value, recalc total
        const daAmount = parseFloat(manualDA);
        const effectiveKM = getEffectiveKM(record);
        const effectiveBranch = getEffectiveBranchForRecord(record);
        const branchRate = getBranchDARate(effectiveBranch);

        newDAAmounts[record.id] = daAmount.toFixed(2);

        if (effectiveKM !== null && branchRate && branchRate.km_rate > 0) {
          const total = (effectiveKM * branchRate.km_rate) + daAmount + getEffectiveFreight(record);
          newTotalAmounts[record.id] = total.toFixed(2);
        }
      } else {
        // Default: rule-based calculation
        const effectiveKM = getEffectiveKM(record);
        const daAmount = calculateDAmount(record, effectiveKM);
        const totalAmount = calculateTotalAmountDynamic(record, effectiveKM, daAmount);
        if (daAmount !== null) newDAAmounts[record.id] = daAmount.toFixed(2);
        if (totalAmount !== null) newTotalAmounts[record.id] = totalAmount.toFixed(2);
      }
    });
    setDynamicDAAmounts(newDAAmounts);
    setDynamicTotalAmounts(newTotalAmounts);
  }, [engineerRecords, kmRates, localDAAmounts, localFreightAmounts]);

  useEffect(() => {
    if (engineerRecords.length > 0) {
      updateAllCalculations();
    }
  }, [engineerRecords, kmRates, localDAAmounts, localFreightAmounts]);

  // Refresh current view function
  const refreshCurrentView = useCallback(async () => {
    if (selectedEngineerDetail && selectedBranchForSummary) {
      // Refresh engineer records
      await loadEngineerDetails(selectedEngineerDetail.uid, selectedEngineerDetail.name, selectedBranchForSummary.branch_code);
      toast.success('Records refreshed!', { duration: 1500 });
    } else if (selectedBranchForSummary) {
      // Refresh engineer summary
      await loadEngineersSummary(selectedBranchForSummary);
      toast.success('Engineer list refreshed!', { duration: 1500 });
    } else {
      // Refresh branch list
      await loadBranches();
      toast.success('Branch list refreshed!', { duration: 1500 });
    }
  }, [selectedEngineerDetail, selectedBranchForSummary, loadEngineerDetails, loadEngineersSummary, loadBranches]);

  // Updated refresh function with loading state
  const refreshCurrentView2 = useCallback(async () => {
    setRefreshing(true);
    try {
      if (selectedEngineerDetail && selectedBranchForSummary) {
        await loadEngineerDetails(selectedEngineerDetail.uid, selectedEngineerDetail.name, selectedBranchForSummary.branch_code);
        toast.success('Records refreshed!', { duration: 1500 });
      } else if (selectedBranchForSummary) {
        await loadEngineersSummary(selectedBranchForSummary);
        toast.success('Engineer list refreshed!', { duration: 1500 });
      } else {
        await loadBranches();
        toast.success('Branch list refreshed!', { duration: 1500 });
      }
    } catch (error) {
      toast.error('Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }, [selectedEngineerDetail, selectedBranchForSummary]);

  const renderCell = (record, key, idx) => {
    if (key === 'sr_no') {
      return <div className="text-[11px] truncate text-center">{idx + 1}</div>;
    }

    if (key === 'ho_corrected_km') {
      const currentValue = localKMCorrections[record.id] !== undefined
        ? localKMCorrections[record.id]
        : (record.ho_corrected_km || '');
      const isSaving = savingStates[record.id];
      const isVerified = verificationStatus[record.id] || record.verification_status === 'Verified';

      return (
        <div className="relative">
          <input
            type="number"
            value={currentValue}
            onChange={(e) => handleKMCorrectionChange(record.id, e.target.value, record.ho_corrected_km || '')}
            placeholder="Enter KM"
            className={`w-full px-1 py-0.5 text-[11px] border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center ${isVerified ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
            step="0.01"
            disabled={isVerified}
          />
          {isSaving && !isVerified && (
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
              <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>
      );
    }

    if (key === 'ho_remark') {
      const currentValue = localRemarks[record.id] !== undefined
        ? localRemarks[record.id]
        : (record.ho_remark || '');
      const isSaving = savingStates[record.id];
      const isVerified = verificationStatus[record.id] || record.verification_status === 'Verified';

      return (
        <div className="relative">
          <input
            type="text"
            value={currentValue}
            onChange={(e) => handleRemarkChange(record.id, e.target.value, record.ho_remark || '')}
            placeholder="Add remark"
            className={`w-full px-1 py-0.5 text-[11px] border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${isVerified ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
            disabled={isVerified}
          />
          {isSaving && !isVerified && (
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
              <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>
      );
    }

    if (key === 'verification_status') {
      const isVerified = verificationStatus[record.id] || record.verification_status === 'Verified';
      const isSaving = savingStates[record.id];

      return (
        <div className="flex justify-center items-center gap-1">
          <input
            type="checkbox"
            checked={isVerified}
            onChange={() => handleVerificationToggle(record.id, isVerified)}
            className="w-4 h-4 cursor-pointer"
          />
          {isSaving && (
            <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
      );
    }

    const val = record[key];
    const displayStr = (val !== null && val !== undefined) ? String(val) : '-';

    if (key === 'sr_status') {
      return (
        <div className="flex justify-center">
          <span className={`px-1.5 py-0.5 rounded-full text-[9px] whitespace-nowrap ${val === 'Closed' ? 'bg-green-100 text-green-800' :
            val === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
            {displayStr}
          </span>
        </div>
      );
    }

    if (key === 'kms_travelled') {
      return <div className="text-[11px] truncate text-center font-semibold">{displayStr}</div>;
    }

    if (key === 'da_amount') {
      const isVerified = verificationStatus[record.id] || record.verification_status === 'Verified';
      const isSaving = savingStates[record.id];

      // The input shows: whatever HO has typed (could be empty string to clear)
      const currentInputValue = localDAAmounts[record.id] !== undefined
        ? localDAAmounts[record.id]
        : '';

      const hasManualValue = currentInputValue !== '' && !isNaN(parseFloat(currentInputValue));

      // Compute rule-based DA for placeholder hint
      const effectiveKM = getEffectiveKM(record);
      const ruleDA = calculateDAmount(record, effectiveKM);
      // Placeholder shows rule value, but '-' if rule gives 0 or null (no DA applicable)
      const placeholder = (ruleDA !== null && ruleDA > 0) ? `₹${ruleDA}` : '-';

      // For verified rows, just show the stored value (read-only)
      if (isVerified) {
        const rawValue = dynamicDAAmounts[record.id] !== undefined
          ? dynamicDAAmounts[record.id]
          : record.da_amount;
        const numValue = parseFloat(rawValue);
        const displayValue = !isNaN(numValue) ? numValue : null;
        return (
          <div className="text-[11px] truncate text-center font-semibold" style={{ color: '#1e40af' }}>
            {displayValue !== null ? `₹${displayValue}` : '-'}
          </div>
        );
      }

      // Editable for pending rows
      return (
        <div className="relative">
          <input
            type="number"
            value={currentInputValue}
            onChange={(e) => handleDAAmountChange(record.id, e.target.value, record.da_amount || '')}
            placeholder={placeholder}
            className={`w-full px-1 py-0.5 text-[11px] border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center font-semibold ${hasManualValue
              ? 'border-orange-400 bg-orange-50 text-orange-700'
              : 'border-gray-300 text-green-700'
              }`}
            step="0.01"
            title={hasManualValue
              ? `Manually overridden by HO (rule says: ${ruleDA !== null ? '₹' + ruleDA : 'N/A'})`
              : `Auto-calculated from rule${ruleDA !== null ? ': ₹' + ruleDA : ''}. Type a value to override.`}
          />
          {isSaving && (
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
              <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>
      );
    }

    if (key === 'freight_charges') {
      const isVerified = verificationStatus[record.id] || record.verification_status === 'Verified';
      const isSaving = savingStates[record.id];
      const currentValue = localFreightAmounts[record.id] !== undefined
        ? localFreightAmounts[record.id]
        : (record.freight_charges || '');

      if (isVerified) {
        const num = parseFloat(currentValue);
        return (
          <div className="text-[11px] truncate text-center font-semibold" style={{ color: '#7c3aed' }}>
            {!isNaN(num) && num !== 0 ? `₹${num}` : '-'}
          </div>
        );
      }
      return (
        <div className="relative">
          <input
            type="number"
            value={currentValue}
            onChange={(e) => handleFreightChange(record.id, e.target.value, record.freight_charges || '')}
            placeholder="₹0"
            className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-center font-semibold text-purple-700"
            step="0.01"
            title="Freight charges (added to total). Editable by HO."
          />
          {isSaving && (
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
              <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>
      );
    }

    if (key === 'km_rate_applied') {
      const effectiveBranch = getEffectiveBranchForRecord(record);
      const branchRate = getBranchDARate(effectiveBranch);
      const dynamicRate = branchRate && branchRate.km_rate > 0 ? branchRate.km_rate : null;
      const displayValue = dynamicRate !== null ? dynamicRate : (record.km_rate_applied || '-');
      return (
        <div className="text-[11px] truncate text-center font-semibold">
          {displayValue !== '-' ? `₹${displayValue}` : '-'}
        </div>
      );
    }

    if (key === 'total_amount') {
      const dynamicValue = dynamicTotalAmounts[record.id];
      const isVerified = record.verification_status === 'Verified';
      const rawValue = dynamicValue !== undefined ? dynamicValue : record.total_amount;
      const numValue = parseFloat(rawValue);
      const displayValue = (!isNaN(numValue) && numValue !== 0) ? numValue : '-';

      return (
        <div className="text-[11px] truncate text-center font-bold" style={{ color: isVerified ? '#1e40af' : '#059669' }}>
          {displayValue !== '-' ? `₹${displayValue}` : '-'}
        </div>
      );
    }

    return <div className="text-[11px] truncate text-center" title={displayStr}>{displayStr}</div>;
  };

  const loadKMRates = async () => {
    setLoadingKMRates(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/expense/branch-km-rates`);
      const rates = {};
      response.data.forEach(rate => {
        rates[rate.branch_code] = {
          km_rate: rate.km_rate,
          range_start_km: rate.range_start_km,
          range_end_km: rate.range_end_km,
          range_amount: rate.range_amount,
          above_km: rate.above_km,
          above_amount: rate.above_amount
        };
      });

      const allRates = {};
      Object.keys(branchMap).forEach(branch => {
        allRates[branch] = rates[branch] || {
          km_rate: '',
          range_start_km: '',
          range_end_km: '',
          range_amount: '',
          above_km: '',
          above_amount: ''
        };
      });
      setKmRates(allRates);
      setOriginalKmRates(JSON.parse(JSON.stringify(allRates)));
    } catch (error) {
      console.error('Error loading KM rates:', error);
    } finally {
      setLoadingKMRates(false);
    }
  };

  const loadExpenseHeads = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/expense/expense-heads`);
      setExpenseHeads(response.data);
      const initialInputs = {};
      response.data.forEach(head => {
        initialInputs[head.id] = '';
      });
      setSubheadInputs(initialInputs);
    } catch (error) {
      console.error('Error loading expense heads:', error);
    }
  };

  useEffect(() => {
    loadBranches();
    loadKMRates();
    loadExpenseHeads();

    // Check export permission
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

    return () => {
      Object.values(saveTimeouts).forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const saveKMRates = async () => {
    setLoadingKMRates(true);
    try {
      const ratesData = Object.entries(kmRates).map(([branch_code, data]) => ({
        branch_code,
        branch_name: branchMap[branch_code],
        km_rate: parseFloat(data.km_rate) || 0,
        range_start_km: data.range_start_km ? parseFloat(data.range_start_km) : null,
        range_end_km: data.range_end_km ? parseFloat(data.range_end_km) : null,
        range_amount: parseFloat(data.range_amount) || 0,
        above_km: data.above_km ? parseFloat(data.above_km) : null,
        above_amount: parseFloat(data.above_amount) || 0
      }));

      await axios.post(`${API_BASE_URL}/expense/branch-km-rates/bulk`, ratesData, {
        params: { created_by: user?.name || 'System' }
      });

      toast.success('KM & DA rates saved successfully!');
      setShowKMRateModal(false);
      loadKMRates();
    } catch (error) {
      console.error('Error saving rates:', error);
      toast.error('Failed to save rates');
    } finally {
      setLoadingKMRates(false);
    }
  };

  useEffect(() => {
    setRecordsReachDateFrom('');
    setRecordsReachDateTo('');
    setRecordsTwoWayKmFilter('');
  }, [selectedEngineerDetail?.uid]);

  const filteredEngineerRecords = useMemo(() => {
    if (!recordsReachDateFrom && !recordsReachDateTo && !recordsTwoWayKmFilter) return engineerRecords;
    return engineerRecords.filter(r => {
      // SR Reach at Site Date filter
      let reachDate = '';
      if (r.sr_reach_at_site_datetime) {
        const d = new Date(r.sr_reach_at_site_datetime);
        if (!isNaN(d.getTime())) {
          reachDate = d.toISOString().substring(0, 10);
        }
      }
      const matchFrom = !recordsReachDateFrom || (reachDate && reachDate >= recordsReachDateFrom);
      const matchTo = !recordsReachDateTo || (reachDate && reachDate <= recordsReachDateTo);
      if (!matchFrom || !matchTo) return false;

      // Two Way KM filter (greater-than threshold, Excel-style)
      if (recordsTwoWayKmFilter) {
        const km = parseFloat(r.two_way_km);
        if (isNaN(km)) return false;
        const threshold = parseFloat(recordsTwoWayKmFilter);
        if (km <= threshold) return false;
      }
      return true;
    });
  }, [engineerRecords, recordsReachDateFrom, recordsReachDateTo, recordsTwoWayKmFilter]);

  const tabFilteredEngineerRecords = useMemo(() => {
    return filteredEngineerRecords.filter(r => {
      const isVerified = r.verification_status === 'Verified';
      const tabMatch = engineerDetailTab === 'verified' ? isVerified : !isVerified;
      if (!tabMatch) return false;
      if (engineerTaskStatusFilter.size > 0 && !engineerTaskStatusFilter.has(String(r.task_status || '').trim())) {
        return false;
      }
      if (engineerSrTypeFilter.size > 0 && !engineerSrTypeFilter.has(String(r.sr_type || '').trim())) {
        return false;
      }
      if (engineerManualFilter && String(r.file_name || '').trim() !== 'manual_entry.xlsx') {
        return false;
      }
      return true;
    });
  }, [filteredEngineerRecords, engineerDetailTab, engineerTaskStatusFilter, engineerSrTypeFilter, engineerManualFilter]);

  const matchEngineerColumnFilters = useCallback((r) => {
    if (engineerTaskStatusFilter.size > 0 && !engineerTaskStatusFilter.has(String(r.task_status || '').trim())) return false;
    if (engineerSrTypeFilter.size > 0 && !engineerSrTypeFilter.has(String(r.sr_type || '').trim())) return false;
    if (engineerManualFilter && String(r.file_name || '').trim() !== 'manual_entry.xlsx') return false;
    return true;
  }, [engineerTaskStatusFilter, engineerSrTypeFilter, engineerManualFilter]);

  const filteredTotalAmount = useMemo(() => {
    const source = filteredEngineerRecords.filter(matchEngineerColumnFilters);
    return source.reduce((sum, r) => {
      const amt = parseFloat(dynamicTotalAmounts[r.id] ?? r.total_amount ?? 0) || 0;
      return sum + amt;
    }, 0);
  }, [filteredEngineerRecords, dynamicTotalAmounts, matchEngineerColumnFilters]);

  const filteredVerifiedAmount = useMemo(() => {
    const source = filteredEngineerRecords.filter(matchEngineerColumnFilters);
    return source.reduce((sum, r) => {
      if (r.verification_status !== 'Verified') return sum;
      const amt = parseFloat(dynamicTotalAmounts[r.id] ?? r.total_amount ?? 0) || 0;
      return sum + amt;
    }, 0);
  }, [filteredEngineerRecords, dynamicTotalAmounts, matchEngineerColumnFilters]);

  // Open modal: fetch existing imprest + ensure every branch is represented
  const openImprestModal = async () => {
    setShowImprestModal(true);
    setImprestLoading(true);
    try {
      // 1. fetch existing imprest entries grouped by branch
      const res = await axios.get(`${API_BASE_URL}/imprest/all`);
      const groupedFromBackend = res.data?.branches || {};

      // 2. build the branch list directly from BRANCH_ORDER + branchMap
      //    (already defined at the top of this file — no extra fetch needed)
      const merged = BRANCH_ORDER.map((code) => {
        const entries = (groupedFromBackend[code] || []).map((e) => ({
          id: e.id,
          name: e.name ?? '',
          amount: e.amount ?? 0,
        }));
        return {
          branch_code: code,
          branch_name: branchMap[code] || code,
          entries,
        };
      });

      setImprestBranches(merged);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to load Imprest data');
      setImprestBranches([]);
    } finally {
      setImprestLoading(false);
    }
  };

  const closeImprestModal = () => {
    if (imprestSaving) return;
    setShowImprestModal(false);
    setImprestBranches([]);
  };

  // Add an empty entry row to a specific branch card
  const addImprestEntry = (branchCode) => {
    setImprestBranches((prev) =>
      prev.map((b) =>
        b.branch_code === branchCode
          ? {
            ...b,
            entries: [
              ...b.entries,
              { name: '', amount: 0, _tmpId: `tmp-${Date.now()}-${Math.random()}` },
            ],
          }
          : b,
      ),
    );
  };

  // Remove an entry row (by id if persisted, otherwise by _tmpId)
  const removeImprestEntry = (branchCode, idOrTmp) => {
    setImprestBranches((prev) =>
      prev.map((b) =>
        b.branch_code === branchCode
          ? {
            ...b,
            entries: b.entries.filter(
              (e) => (e.id ?? e._tmpId) !== idOrTmp,
            ),
          }
          : b,
      ),
    );
  };

  // Edit a field of an entry
  const updateImprestEntry = (branchCode, idOrTmp, field, value) => {
    setImprestBranches((prev) =>
      prev.map((b) =>
        b.branch_code === branchCode
          ? {
            ...b,
            entries: b.entries.map((e) =>
              (e.id ?? e._tmpId) === idOrTmp
                ? { ...e, [field]: field === 'amount' ? Number(value) || 0 : value }
                : e,
            ),
          }
          : b,
      ),
    );
  };

  // Submit everything
  const saveImprestAll = async () => {
    // basic validation
    for (const b of imprestBranches) {
      for (const e of b.entries) {
        if (!e.name || !e.name.trim()) {
          toast.error(`Empty name in branch ${b.branch_code}`);
          return;
        }
        if (e.amount === '' || isNaN(Number(e.amount)) || Number(e.amount) < 0) {
          toast.error(`Invalid amount in branch ${b.branch_code} for "${e.name}"`);
          return;
        }
      }
    }

    setImprestSaving(true);
    try {
      const payload = {
        branches: imprestBranches.map((b) => ({
          branch_code: b.branch_code,
          entries: b.entries.map((e) => ({
            ...(e.id ? { id: e.id } : {}),
            name: e.name.trim(),
            amount: Number(e.amount) || 0,
          })),
        })),
        created_by: user?.name || 'System',
      };

      const res = await axios.post(
        `${API_BASE_URL}/imprest/bulk-save?created_by=${encodeURIComponent(user?.name || 'System')}`,
        payload,
      );

      toast.success(res.data?.message || 'Imprest Amounts saved');
      closeImprestModal();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save Imprest Amounts');
    } finally {
      setImprestSaving(false);
    }
  };

  const addExpenseHead = async () => {
    if (!newExpenseHead.trim()) return;
    setAddingHead(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/expense/expense-heads`,
        { name: newExpenseHead },
        { params: { created_by: user?.name || 'System' } }
      );
      setExpenseHeads(prev => [...prev, response.data]);
      setSubheadInputs(prev => ({ ...prev, [response.data.id]: '' }));
      setNewExpenseHead('');
      toast.success('Expense head added successfully!');
    } catch (error) {
      console.error('Error adding expense head:', error);
      toast.error(error.response?.data?.detail || 'Failed to add expense head');
    } finally {
      setAddingHead(false);
    }
  };

  const updateExpenseHead = async (id) => {
    if (!editingHead.name.trim()) return;
    try {
      const response = await axios.put(`${API_BASE_URL}/expense/expense-heads/${id}`,
        { name: editingHead.name },
        { params: { updated_by: user?.name || 'System' } }
      );
      setExpenseHeads(prev => prev.map(head => head.id === id ? response.data : head));
      setEditingHead(null);
      toast.success('Expense head updated successfully!');
    } catch (error) {
      console.error('Error updating expense head:', error);
      toast.error('Failed to update expense head');
    }
  };

  const deleteExpenseHead = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense head?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/expense/expense-heads/${id}`);
      setExpenseHeads(prev => prev.filter(head => head.id !== id));
      setSubheadInputs(prev => {
        const newInputs = { ...prev };
        delete newInputs[id];
        return newInputs;
      });
      toast.success('Expense head deleted successfully!');
    } catch (error) {
      console.error('Error deleting expense head:', error);
      toast.error('Failed to delete expense head');
    }
  };

  const addSubhead = async (headId) => {
    const subheadName = subheadInputs[headId];
    if (!subheadName || !subheadName.trim()) return;
    setAddingSubheadForId(headId);
    try {
      const response = await axios.post(`${API_BASE_URL}/expense/expense-heads/${headId}/subheads`,
        { name: subheadName },
        { params: { created_by: user?.name || 'System' } }
      );
      setExpenseHeads(prev => prev.map(head =>
        head.id === headId ? { ...head, subheads: response.data.subheads } : head
      ));
      setSubheadInputs(prev => ({ ...prev, [headId]: '' }));
      toast.success('Subhead added successfully!');
    } catch (error) {
      console.error('Error adding subhead:', error);
      toast.error('Failed to add subhead');
    } finally {
      setAddingSubheadForId(null);
    }
  };

  const updateSubhead = async (headId, subheadId, newName) => {
    if (!newName || !newName.trim()) {
      setEditingSubhead(null);
      return;
    }
    try {
      const response = await axios.put(`${API_BASE_URL}/expense/expense-heads/${headId}/subheads/${subheadId}`,
        { name: newName },
        { params: { updated_by: user?.name || 'System' } }
      );
      setExpenseHeads(prev => prev.map(head =>
        head.id === headId ? { ...head, subheads: response.data.subheads } : head
      ));
      setEditingSubhead(null);
      toast.success('Subhead updated successfully!');
    } catch (error) {
      console.error('Error updating subhead:', error);
      toast.error('Failed to update subhead');
    }
  };

  const deleteSubhead = async (headId, subheadId) => {
    if (!window.confirm('Are you sure you want to delete this subhead?')) return;
    try {
      const response = await axios.delete(`${API_BASE_URL}/expense/expense-heads/${headId}/subheads/${subheadId}`, {
        params: { updated_by: user?.name || 'System' }
      });
      setExpenseHeads(prev => prev.map(head =>
        head.id === headId ? { ...head, subheads: response.data.subheaders } : head
      ));
      toast.success('Subhead deleted successfully!');
    } catch (error) {
      console.error('Error deleting subhead:', error);
      toast.error('Failed to delete subhead');
    }
  };

  const handleKMRateChange = (branch, field, value) => {
    setKmRates(prev => ({
      ...prev,
      [branch]: {
        ...prev[branch],
        [field]: value === '' ? '' : parseFloat(value)
      }
    }));
  };

  const hasKMRateChanges = () => {
    return JSON.stringify(kmRates) !== JSON.stringify(originalKmRates);
  };

  const handleKeyPress = (e, callback) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      callback();
    }
  };

  // Move SELECTED verified records to history (only the ones checked in the table)
  // If all engineers in the branch are fully verified, offer choice: submit all OR only this engineer
  const moveVerifiedToHistory = async () => {
    if (!selectedEngineerDetail) return;

    // Get IDs of records that are ACTUALLY verified for THIS engineer
    // (intersect checkbox state with real verified rows in engineerRecords to avoid stale state)
    const currentEngineerVerifiedIds = engineerRecords
      .filter(r => r.verification_status === 'Verified' || verificationStatus[r.id] === true)
      .filter(r => r.verification_status === 'Verified') // only actually verified ones get submitted
      .map(r => r.id);

    const selectedRecordIds = currentEngineerVerifiedIds;

    if (selectedRecordIds.length === 0) {
      toast.error('No verified records to submit');
      return;
    }

    // Check if EVERY engineer in this branch has all their SRs verified
    const allEngineersFullyVerified =
      engineerSummary.length > 1 &&
      engineerSummary.every(
        eng => (eng.total_sr_count || 0) > 0 && eng.verified_sr_count === eng.total_sr_count
      );

    // Total verified count across the WHOLE branch (for the "Submit All" label)
    const totalVerifiedAcrossBranch = engineerSummary.reduce(
      (sum, eng) => sum + (eng.verified_sr_count || 0),
      0
    );

    // Verified count for THIS engineer (for the "Only This Engineer" label)
    const currentEngineerVerifiedCount =
      engineerSummary.find(e => e.engineer_uid === selectedEngineerDetail.uid)?.verified_sr_count
      ?? selectedRecordIds.length;

    let submitAll = false;

    if (allEngineersFullyVerified) {
      // 3-option dialog: Submit All / Only This Engineer / Cancel
      const result = await Swal.fire({
        title: 'All Engineers Verified!',
        html: `
          All engineers in <strong>${selectedBranchForSummary.branch_name}</strong> have their records verified.<br/><br/>
          <div style="text-align:left; display:inline-block; margin-top:4px;">
            <div style="margin-bottom:6px;">
              <span style="display:inline-block; width:10px; height:10px; background:#059669; border-radius:50%; margin-right:6px;"></span>
              <strong>Submit All Engineers:</strong> ${totalVerifiedAcrossBranch} records
            </div>
            <div>
              <span style="display:inline-block; width:10px; height:10px; background:#2f3192; border-radius:50%; margin-right:6px;"></span>
              <strong>Only ${selectedEngineerDetail.name}:</strong> ${currentEngineerVerifiedCount} records
            </div>
          </div>
          <br/><br/>
          <span style="color:#dc2626; font-size:12px;">This action cannot be undone!</span>
        `,
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#059669',
        denyButtonColor: '#2f3192',
        cancelButtonColor: '#6b7280',
        confirmButtonText: `Submit All (${totalVerifiedAcrossBranch})`,
        denyButtonText: `Only This Engineer (${currentEngineerVerifiedCount})`,
        cancelButtonText: 'Cancel',
        reverseButtons: true,
      });

      if (result.isDismissed || (!result.isConfirmed && !result.isDenied)) return; // Cancel
      submitAll = result.isConfirmed; // confirm = All, deny = only this engineer
    } else {
      // Original single-engineer confirmation
      const result = await Swal.fire({
        title: 'Are you sure?',
        html: `You are about to submit <strong>${selectedRecordIds.length}</strong> verified record(s) to history.<br/><br/>This action cannot be undone!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, submit them!',
        cancelButtonText: 'Cancel',
        reverseButtons: true
      });

      if (!result.isConfirmed) {
        return; // User cancelled
      }
    }

    setLoadingMoveToHistory(true);

    try {
      // Get user info from sessionStorage
      const user = JSON.parse(sessionStorage.getItem('user') || '{}');

      if (submitAll) {
        // Fetch every engineer's records and collect verified IDs GROUPED BY ENGINEER
        const perEngineerPromises = engineerSummary.map(eng =>
          axios
            .get(`${API_BASE_URL}/tada-ho/engineer-records`, {
              params: {
                engineer_uid: eng.engineer_uid,
                branch_code: selectedBranchForSummary.branch_code,
              },
            })
            .then(res => ({
              engineer_uid: eng.engineer_uid,
              engineer_name: eng.engineer_name,
              ids: (res.data || [])
                .filter(r => r.verification_status === 'Verified')
                .map(r => r.id),
            }))
            .catch(() => ({ engineer_uid: eng.engineer_uid, engineer_name: eng.engineer_name, ids: [] }))
        );
        const perEngineerResults = await Promise.all(perEngineerPromises);
        const groupsWithIds = perEngineerResults.filter(g => g.ids.length > 0);

        if (groupsWithIds.length === 0) {
          toast.error('No verified records found across engineers');
          setLoadingMoveToHistory(false);
          return;
        }

        // Call the engineer-scoped endpoint ONCE PER ENGINEER with that engineer's UID
        let totalMoved = 0;
        let errorCount = 0;
        const failedEngineers = [];

        for (const group of groupsWithIds) {
          try {
            const resp = await axios.post(
              `${API_BASE_URL}/tada-ho/engineer/${group.engineer_uid}/move-selected-to-history`,
              {
                record_ids: group.ids,
                submitted_by_name: user?.name || 'Unknown',
                submitted_by_uid: String(user?.id || user?.uid || user?.employee_id || 'Unknown'),
              }
            );
            totalMoved += resp.data?.moved_count ?? group.ids.length;
          } catch (e) {
            console.error(`Error moving records for engineer ${group.engineer_name}:`, e);
            errorCount++;
            failedEngineers.push(group.engineer_name);
          }
        }

        await Swal.fire({
          title: errorCount === 0 ? 'Submitted!' : 'Partially Submitted',
          text:
            errorCount === 0
              ? `Successfully moved ${totalMoved} records from all engineers to history.`
              : `Moved ${totalMoved} records. Failed for: ${failedEngineers.join(', ')}.`,
          icon: errorCount === 0 ? 'success' : 'warning',
          confirmButtonColor: themeColor,
          timer: 2500,
          showConfirmButton: true,
        });

        setSelectAll(false);
        setVerificationStatus({});
        handleBackToEngineersList();
        if (selectedBranchForSummary) {
          await loadEngineersSummary(selectedBranchForSummary);
        }
      } else {
        // ── Single-engineer path (unchanged behavior) ──
        const requestBody = {
          record_ids: selectedRecordIds,
          submitted_by_name: user?.name || 'Unknown',
          submitted_by_uid: String(user?.id || user?.uid || user?.employee_id || 'Unknown'),
        };

        const response = await axios.post(
          `${API_BASE_URL}/tada-ho/engineer/${selectedEngineerDetail.uid}/move-selected-to-history`,
          requestBody
        );

        await Swal.fire({
          title: 'Submitted!',
          text: `Successfully moved ${response.data.moved_count} records to history.`,
          icon: 'success',
          confirmButtonColor: themeColor,
          timer: 2200,
          showConfirmButton: true,
        });

        setSelectAll(false);
        setVerificationStatus({});

        await loadEngineerDetails(
          selectedEngineerDetail.uid,
          selectedEngineerDetail.name,
          selectedBranchForSummary.branch_code
        );
        if (selectedBranchForSummary) {
          await loadEngineersSummary(selectedBranchForSummary);
        }
      }

    } catch (error) {
      console.error('Error moving records to history:', error);

      // Show error SweetAlert
      await Swal.fire({
        title: 'Error!',
        text: 'Failed to move records to history. Please try again.',
        icon: 'error',
        confirmButtonColor: themeColor
      });
    } finally {
      setLoadingMoveToHistory(false);
    }
  };

  const loadVendorList = async () => {
    setLoadingVendorList(true);
    setShowVendorListModal(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}/lvb/vendors`);
      setVendorList(data);
    } catch {
      toast.error('Failed to load vendor list');
    } finally {
      setLoadingVendorList(false);
    }
  };

  // ─── Branch SUBMIT-day-limits handlers ─────────────────────
  const loadSubmitLimits = async () => {
    setLoadingSubmitLimits(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/branch-submit-limits`);
      const map = {};
      (res.data || []).forEach(row => {
        map[row.branch_code] = {
          rule_type: row.rule_type,
          allowed_values: Array.isArray(row.allowed_values) ? [...row.allowed_values] : [],
        };
      });
      // Ensure every branch is represented
      BRANCH_ORDER.forEach(code => {
        if (!map[code]) {
          const weekdayBranches = ['420435_3', '420435_1', '420435_2', '420435_6', '420435_4', '420435_5', '420435_7'];
          map[code] = weekdayBranches.includes(code)
            ? { rule_type: 'weekdays', allowed_values: [1, 2] }
            : { rule_type: 'month_dates', allowed_values: [1, 2, 3, 16, 17, 18] };
        }
      });
      setSubmitLimits(map);
      setOriginalSubmitLimits(JSON.parse(JSON.stringify(map)));
    } catch (e) {
      toast.error('Failed to load submit limits');
      console.error(e);
    } finally {
      setLoadingSubmitLimits(false);
    }
  };

  const openSubmitLimitsModal = () => {
    loadSubmitLimits();
    setShowSubmitLimitsModal(true);
  };

  const handleSubmitRuleTypeChange = (branchCode, newType) => {
    setSubmitLimits(prev => ({
      ...prev,
      [branchCode]: {
        rule_type: newType,
        // Reset to sensible defaults when switching type
        allowed_values: newType === 'weekdays' ? [1, 2] : [1, 2, 3, 16, 17, 18],
      },
    }));
  };

  const toggleSubmitValue = (branchCode, value) => {
    setSubmitLimits(prev => {
      const cur = prev[branchCode] || { rule_type: 'month_dates', allowed_values: [] };
      const set = new Set(cur.allowed_values);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return {
        ...prev,
        [branchCode]: {
          ...cur,
          allowed_values: Array.from(set).sort((a, b) => a - b),
        },
      };
    });
  };

  const countSubmitLimitChanges = () => {
    return Object.keys(submitLimits).filter(code => {
      const cur = submitLimits[code];
      const orig = originalSubmitLimits[code];
      if (!orig) return true;
      if (cur.rule_type !== orig.rule_type) return true;
      const a = (cur.allowed_values || []).join(',');
      const b = (orig.allowed_values || []).join(',');
      return a !== b;
    }).length;
  };

  const hasSubmitLimitChanges = () => countSubmitLimitChanges() > 0;

  const saveSubmitLimits = async () => {
    // Validate: at least one value selected per branch
    for (const code of Object.keys(submitLimits)) {
      const r = submitLimits[code];
      if (!r.allowed_values || r.allowed_values.length === 0) {
        toast.error(`${branchMap[code] || code}: select at least one day`);
        return;
      }
    }

    setSavingSubmitLimits(true);
    try {
      const payload = {
        limits: Object.keys(submitLimits).map(code => ({
          branch_code: code,
          rule_type: submitLimits[code].rule_type,
          allowed_values: submitLimits[code].allowed_values,
          updated_by: user?.name || 'admin',
        })),
      };
      await axios.put(`${API_BASE_URL}/branch-submit-limits/bulk`, payload);
      toast.success('Submit limits updated');
      setOriginalSubmitLimits(JSON.parse(JSON.stringify(submitLimits)));
      setShowSubmitLimitsModal(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save submit limits');
      console.error(e);
    } finally {
      setSavingSubmitLimits(false);
    }
  };

  // ─── Branch upload-day-limits handlers ─────────────────────
  const loadDayLimits = async () => {
    setLoadingDayLimits(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/branch-upload-limits`);
      const fromDb = {};
      (res.data || []).forEach(row => {
        fromDb[row.branch_code] = {
          tada_days: row.tada_days,
          office_expense_days: row.office_expense_days,
          lvb_days: row.lvb_days,
        };
      });
      // Merge with BRANCH_ORDER so every branch shows up (default 30 for missing)
      const merged = {};
      BRANCH_ORDER.forEach(code => {
        merged[code] = fromDb[code] || { tada_days: 30, office_expense_days: 30, lvb_days: 30 };
      });
      setDayLimits(merged);
      setOriginalDayLimits(JSON.parse(JSON.stringify(merged)));
    } catch (e) {
      toast.error('Failed to load day limits');
      console.error(e);
    } finally {
      setLoadingDayLimits(false);
    }
  };

  const openDayLimitsModal = () => {
    loadDayLimits();
    setShowDayLimitsModal(true);
  };

  const handleDayLimitChange = (branchCode, field, value) => {
    const num = parseInt(value, 10);
    setDayLimits(prev => ({
      ...prev,
      [branchCode]: {
        ...prev[branchCode],
        [field]: isNaN(num) || num < 1 ? '' : num,
      },
    }));
  };

  const countDayLimitChanges = () => {
    return Object.keys(dayLimits).filter(code => {
      const cur = dayLimits[code];
      const orig = originalDayLimits[code] || {};
      return cur.tada_days !== orig.tada_days
        || cur.office_expense_days !== orig.office_expense_days
        || cur.lvb_days !== orig.lvb_days;
    }).length;
  };

  const hasDayLimitChanges = () => countDayLimitChanges() > 0;

  const saveDayLimits = async () => {
    // Validate all values are positive ints
    for (const code of Object.keys(dayLimits)) {
      const r = dayLimits[code];
      if (!Number.isInteger(r.tada_days) || r.tada_days < 1
        || !Number.isInteger(r.office_expense_days) || r.office_expense_days < 1
        || !Number.isInteger(r.lvb_days) || r.lvb_days < 1) {
        toast.error(`Invalid value for branch ${code}. All days must be ≥ 1.`);
        return;
      }
    }

    setSavingDayLimits(true);
    try {
      const payload = {
        limits: Object.keys(dayLimits).map(code => ({
          branch_code: code,
          tada_days: dayLimits[code].tada_days,
          office_expense_days: dayLimits[code].office_expense_days,
          lvb_days: dayLimits[code].lvb_days,
          updated_by: user?.name || 'admin',
        })),
      };
      await axios.put(`${import.meta.env.VITE_BACKEND_URL}/branch-upload-limits/bulk`, payload);
      toast.success('Day limits updated');
      setOriginalDayLimits(JSON.parse(JSON.stringify(dayLimits)));
      setShowDayLimitsModal(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save day limits');
      console.error(e);
    } finally {
      setSavingDayLimits(false);
    }
  };

  const selectedCount = Object.values(verificationStatus).filter(v => v).length;

  return (
    <div className="min-h-screen">
      <div className="max-w-full mx-auto px-3 sm:px-4">

        {/* Header */}
        <div className="mb-2 sm:mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-xl font-bold text-black">Expense Tracker</h1>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-xs sm:text-sm text-black/70">
                  {user?.name} • {getUserTypeDisplay()} • {user?.branch} - {getBranchDisplayName(user?.branch)}
                </span>
                <button
                  onClick={openDayLimitsModal}
                  style={{
                    padding: '3px 8px',
                    background: themeColor,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '10px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                  title="Set per-branch upload day limits"
                >
                  Branch Old Day Limits
                </button>
                <button
                  onClick={openSubmitLimitsModal}
                  style={{
                    padding: '3px 8px',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '10px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                  title="Set per-branch submit day rules (weekdays / month dates)"
                >
                  Branch Submit Limits
                </button>
              </div>
            </div>

            <div className="flex gap-1 sm:gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTab('tada');
                  loadBranches();
                }}
                className="px-1 sm:px-2 py-1.5 sm:py-1 text-[11px] sm:text-sm font-medium rounded-md transition-all"
                style={{
                  backgroundColor: activeTab === 'tada' ? 'white' : 'transparent',
                  color: activeTab === 'tada' ? themeColor : '#6B7280',
                  boxShadow: activeTab === 'tada' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                TA-DA
              </button>
              <button
                onClick={() => setActiveTab('office')}
                className="px-1 sm:px-2 py-1.5 sm:py-1 text-[11px] sm:text-sm font-medium rounded-md transition-all"
                style={{
                  backgroundColor: activeTab === 'office' ? 'white' : 'transparent',
                  color: activeTab === 'office' ? themeColor : '#6B7280',
                  boxShadow: activeTab === 'office' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                Office Expense
              </button>
              <button
                onClick={() => setActiveTab('vendor')}
                className="px-1 sm:px-2 py-1.5 sm:py-1 text-[11px] sm:text-sm font-medium rounded-md transition-all"
                style={{
                  backgroundColor: activeTab === 'vendor' ? 'white' : 'transparent',
                  color: activeTab === 'vendor' ? themeColor : '#6B7280',
                  boxShadow: activeTab === 'vendor' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                Local Vendor Bills
              </button>
            </div>
          </div>
        </div>

        {/* TADA Tab */}
        {activeTab === 'tada' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">

            {/* Branch Table View (First Table) */}
            {!selectedBranchForSummary && !selectedEngineerDetail && (
              <>
                <div className="px-2 sm:px-3 py-1 sm:py-1 border-b flex justify-between items-center" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                  <h2 className="text-[11px] sm:text-xs font-semibold text-black">Branch List</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={refreshCurrentView2}
                      disabled={refreshing}
                      className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                    >
                      {refreshing ? (
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      Refresh
                    </button>
                    {canExport && (
                      <button
                        onClick={() => exportToExcel(
                          branches.map(b => ({
                            ...b,
                            total_count: (b.engineer_count || 0) + (b.sales_bm_count || 0) + (b.bill_wise_count || 0),
                          })),
                          'branches.xlsx',
                          [
                            { key: 'sr_no', label: 'Sr. No.' },
                            { key: 'branch_name', label: 'Branch Name' },
                            { key: 'branch_code', label: 'Branch Code' },
                            { key: 'branch_manager', label: 'Branch Manager' },
                            { key: 'engineer_count', label: 'Engineers' },
                            { key: 'sales_bm_count', label: 'Sales & BM' },
                            { key: 'bill_wise_count', label: 'Bill Wise' },
                            { key: 'total_count', label: 'Total' },
                          ]
                        )}
                        className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                        </svg>
                        Export
                      </button>
                    )}
                    <button
                      onClick={() => setShowKMRateModal(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Branch KM Rate
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  {loadingBranches ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                      <p className="mt-2 text-sm text-gray-600">Loading branches...</p>
                    </div>
                  ) : branches.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No branches found</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="border border-gray-300 px-4 py-2 text-center text-xs font-semibold text-black">Sr. No.</th>
                            <th className="border border-gray-300 px-4 py-2 text-center text-xs font-semibold text-black">Branch Name</th>
                            <th className="border border-gray-300 px-4 py-2 text-center text-xs font-semibold text-black">Branch Code</th>
                            <th className="border border-gray-300 px-4 py-2 text-center text-xs font-semibold text-black">To Concern Person</th>
                            <th className="border border-gray-300 px-0 py-2 text-center text-xs font-semibold text-black">Service Engineers</th>
                            <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-black">Sales &amp; BM</th>
                            <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-black">Bill Wise</th>
                            <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-black">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branches.map((branch) => {
                            const total = (branch.engineer_count || 0) + (branch.sales_bm_count || 0) + (branch.bill_wise_count || 0);
                            return (
                              <tr key={branch.branch_code} className="hover:bg-gray-50">
                                <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{branch.sr_no}</td>
                                <td className="border border-gray-300 px-4 py-0 text-sm font-medium">
                                  <button
                                    onClick={() => loadEngineersSummary(branch)}
                                    className="text-[#2f3192] underline hover:font-bold cursor-pointer bg-transparent border-0 p-0 text-left"
                                  >
                                    {branch.branch_name}
                                  </button>
                                </td>
                                <td className="border border-gray-300 px-4 py-0 text-sm text-black text-center">{branch.branch_code}</td>
                                <td className="border border-gray-300 px-4 py-0 text-sm text-black text-center">{branch.branch_manager || '-'}</td>
                                <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black font-semibold">
                                  {branch.engineer_count || 0}
                                </td>
                                <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black">
                                  <span className="px-2 py-0.5 rounded-full text-black font-semibold text-xs">
                                    {branch.sales_bm_count || 0}
                                  </span>
                                </td>
                                <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black">
                                  <span className="px-2 py-0.5 rounded-full text-black font-semibold text-xs">
                                    {branch.bill_wise_count || 0}
                                  </span>
                                </td>
                                <td className="border border-gray-300 px-2 py-0 text-center text-sm font-bold" style={{ color: themeColor }}>
                                  {total}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-100">
                          <tr>
                            <td colSpan="4" className="border border-gray-300 px-4 py-1 text-right text-sm font-semibold text-black">Grand Total:</td>
                            <td className="border border-gray-300 px-2 py-1 text-center text-sm font-bold text-black">
                              {branches.reduce((total, branch) => total + (branch.engineer_count || 0), 0)}
                            </td>
                            <td className="border border-gray-300 px-2 py-1 text-center text-sm font-bold text-blue-700">
                              {branches.reduce((total, branch) => total + (branch.sales_bm_count || 0), 0)}
                            </td>
                            <td className="border border-gray-300 px-2 py-1 text-center text-sm font-bold text-orange-700">
                              {branches.reduce((total, branch) => total + (branch.bill_wise_count || 0), 0)}
                            </td>
                            <td className="border border-gray-300 px-2 py-1 text-center text-sm font-bold" style={{ color: themeColor }}>
                              {branches.reduce((total, branch) =>
                                total + (branch.engineer_count || 0) + (branch.sales_bm_count || 0) + (branch.bill_wise_count || 0), 0
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Engineer Summary View (Second Table) */}
            {selectedBranchForSummary && !selectedEngineerDetail && (
              <>
                {!selectedSalesPeriod && !selectedKmWisePeriod && !selectedBillWisePeriod && !selectedSalesBMVoucher && !selectedSalesBMEngineer && (
                  <>
                    <div className="px-2 sm:px-3 py-1 sm:py-1 border-b flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleBackToBranches}
                          className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold transition-all"
                          style={{ color: themeColor }}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                          Back to Branches
                        </button>
                        {selectedVoucher && (
                          <button
                            onClick={handleBackToVouchers}
                            className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold transition-all"
                            style={{ color: themeColor }}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Vouchers
                          </button>
                        )}
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          {selectedVoucher
                            ? <>Engineers — Voucher <span className="text-purple-700">{selectedVoucher.voucher_no}</span></>
                            : <>Vouchers - {selectedBranchForSummary.branch_name}</>}
                        </h2>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">
                          {selectedBranchForSummary.branch_code}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={refreshCurrentView2}
                          disabled={refreshing}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                        >
                          {refreshing ? (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          Refresh
                        </button>
                        <button
                          onClick={() => loadBranchHistory(selectedBranchForSummary)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                          style={{ background: `linear-gradient(135deg, #059669, #047857)` }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          History
                        </button>
                        {canExport && (
                          <button
                            onClick={() => exportToExcel(
                              engineerSummary,
                              `engineers_${selectedBranchForSummary?.branch_code}.xlsx`,
                              [
                                { key: 'engineer_name', label: 'Engineer Name' },
                                { key: 'engineer_uid', label: 'Engineer UID' },
                                { key: 'total_sr_count', label: 'Total SR' },
                                { key: 'verified_sr_count', label: 'Verified SR' },
                                { key: 'total_amount', label: 'Total Amount' },
                                { key: 'start_date', label: 'Start Date' },
                                { key: 'end_date', label: 'End Date' },
                              ]
                            )}
                            className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                            </svg>
                            Export
                          </button>
                        )}
                        <button
                          onClick={() => setShowKMRateModal(true)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Branch KM Rate
                        </button>
                        <button
                          onClick={() => {
                            const branchCode = selectedBranchForSummary?.branch_code || user?.branch;
                            setShowAddEmployeeModal(true);
                            fetchBranchEmployees(branchCode);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Add Employee
                        </button>
                      </div>
                    </div>

                    <div className="p-4">
                      {loadingEngineerSummary ? (
                        <div className="text-center py-8">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                          <p className="mt-2 text-sm text-gray-600">Loading vouchers...</p>
                        </div>
                      ) : !selectedVoucher ? (
                        /* ── VOUCHER SUMMARY TABLE ── */
                        voucherGroups.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">No vouchers found for this branch</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse border border-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Sr. No.</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Voucher No.</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Submitted By</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Engineers</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Total SR</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Verified SR</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Total Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {voucherGroups.map((vg, idx) => (
                                  <tr key={vg.voucher_no} className="hover:bg-gray-50">
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{idx + 1}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-sm font-medium">
                                      <button
                                        onClick={() => handleSelectVoucher(vg)}
                                        className="text-[#2f3192] underline hover:font-bold cursor-pointer bg-transparent border-0 p-0 text-left"
                                      >
                                        {vg.voucher_no}
                                      </button>
                                    </td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">
                                      <span className="truncate" title={vg.submitted_by}>{vg.submitted_by || '-'}</span>
                                    </td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black font-semibold">{vg.engineer_count}</td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black">{vg.record_count}</td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black">{vg.verified_count}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-black">
                                      {vg.total && vg.total !== 0
                                        ? `₹${vg.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-100">
                                <tr className="font-bold">
                                  <td colSpan="3" className="border border-gray-300 px-2 py-0.5 text-right text-sm font-semibold text-black">Grand Total:</td>
                                  <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                    {voucherGroups.reduce((s, v) => s + (v.engineer_count || 0), 0)}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                    {voucherGroups.reduce((s, v) => s + (v.record_count || 0), 0)}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                    {voucherGroups.reduce((s, v) => s + (v.verified_count || 0), 0)}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold" style={{ color: themeColor }}>
                                    {(() => {
                                      const sum = voucherGroups.reduce((s, v) => s + (v.total || 0), 0);
                                      return sum !== 0 ? `₹${sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
                                    })()}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )
                      ) : (
                        /* ── ENGINEERS WITHIN SELECTED VOUCHER ── */
                        selectedVoucher.engineers.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">No engineers found for this voucher</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse border border-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Sr. No.</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Engineer Name</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Engineer UID</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Period</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Total SR</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Verified SR</th>
                                  <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Total Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedVoucher.engineers.map((engineer, idx) => (
                                  <tr key={engineer.engineer_uid} className="hover:bg-gray-50">
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{idx + 1}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-sm font-medium">
                                      <button
                                        onClick={() => loadEngineerDetails(engineer.engineer_uid, engineer.engineer_name, selectedBranchForSummary.branch_code)}
                                        className="text-[#2f3192] underline hover:font-bold cursor-pointer bg-transparent border-0 p-0 text-left"
                                      >
                                        {engineer.engineer_name}
                                      </button>
                                    </td>
                                    <td className="border border-gray-300 px-4 py-0 text-sm text-black">{engineer.engineer_uid}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black whitespace-nowrap">
                                      {engineer.period_start
                                        ? (engineer.period_start === engineer.period_end
                                          ? engineer.period_start
                                          : `${engineer.period_start} → ${engineer.period_end}`)
                                        : '-'}
                                    </td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{engineer.record_count}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{engineer.verified_count}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-black">
                                      {engineer.total && engineer.total !== 0
                                        ? `₹${engineer.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-100">
                                <tr className="font-bold">
                                  <td colSpan="4" className="border border-gray-300 px-2 py-0.5 text-right text-sm font-semibold text-black">Total:</td>
                                  <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                    {selectedVoucher.engineers.reduce((s, e) => s + (e.record_count || 0), 0)}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                    {selectedVoucher.engineers.reduce((s, e) => s + (e.verified_count || 0), 0)}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold" style={{ color: themeColor }}>
                                    {(() => {
                                      const sum = selectedVoucher.engineers.reduce((s, e) => s + (e.total || 0), 0);
                                      return sum !== 0 ? `₹${sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
                                    })()}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )
                      )}
                    </div>
                  </>
                )}

                {/* ═══════════ SALES & BM (merged, voucher-wise like Service Engineer) ═══════════ */}
                {selectedBranchForSummary && !selectedEngineerDetail && !selectedVoucher && !selectedBillWisePeriod && (
                  <>
                    <div className="px-2 sm:px-3 py-1 border-b border-t flex justify-between items-center" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2">
                        {selectedSalesBMEngineer ? (
                          <>
                            <button onClick={handleBackToBranches}
                              className="inline-flex items-center gap-1 text-sm font-bold underline" style={{ color: themeColor }}>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                              Back to Branches
                            </button>
                            <button onClick={() => { setSelectedSalesBMEngineer(null); setSalesBMRecords([]); }}
                              className="inline-flex items-center gap-1 text-sm font-bold underline" style={{ color: themeColor }}>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                              Back to Engineers
                            </button>
                          </>
                        ) : selectedSalesBMVoucher ? (
                          <>
                            <button onClick={handleBackToBranches}
                              className="inline-flex items-center gap-1 text-sm font-bold underline" style={{ color: themeColor }}>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                              Back to Branches
                            </button>
                            <button onClick={() => setSelectedSalesBMVoucher(null)}
                              className="inline-flex items-center gap-1 text-sm font-bold underline" style={{ color: themeColor }}>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                              Back to Vouchers
                            </button>
                          </>
                        ) : null}
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          {selectedSalesBMEngineer
                            ? <>Sales &amp; BM Records — <span className="text-purple-700">{selectedSalesBMEngineer.engineer_name}</span></>
                            : selectedSalesBMVoucher
                              ? <>Sales &amp; BM — Voucher <span className="text-purple-700">{selectedSalesBMVoucher.voucher_no}</span></>
                              : <>Sales &amp; BM — {selectedBranchForSummary.branch_name}</>}
                        </h2>
                      </div>
                      <div className="flex gap-2 items-center">
                        {canExport && !selectedSalesBMVoucher && (
                          <button
                            onClick={() => exportToExcel(
                              salesBMVoucherGroups,
                              `salesbm_vouchers_${selectedBranchForSummary?.branch_code}.xlsx`,
                              [
                                { key: 'voucher_no', label: 'Voucher No.' },
                                { key: 'submitted_by', label: 'Submitted By' },
                                { key: 'engineer_count', label: 'Engineers' },
                                { key: 'record_count', label: 'Total SR' },
                                { key: 'verified_count', label: 'Verified SR' },
                                { key: 'total', label: 'Total Amount' },
                              ]
                            )}
                            className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg shadow-md hover:shadow-lg"
                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" /></svg>
                            Export
                          </button>
                        )}
                        {canExport && selectedSalesBMVoucher && !selectedSalesBMEngineer && (
                          <button
                            onClick={() => exportToExcel(
                              (selectedSalesBMVoucher.engineers || []).map(en => ({
                                ...en,
                                period: en.period_start ? (en.period_start === en.period_end ? en.period_start : `${en.period_start} → ${en.period_end}`) : '-',
                              })),
                              `salesbm_engineers_${selectedSalesBMVoucher.voucher_no}.xlsx`,
                              [
                                { key: 'engineer_name', label: 'Engineer Name' },
                                { key: 'engineer_uid', label: 'Engineer UID' },
                                { key: 'period', label: 'Period' },
                                { key: 'record_count', label: 'Total SR' },
                                { key: 'verified_count', label: 'Verified SR' },
                                { key: 'total', label: 'Total Amount' },
                              ]
                            )}
                            className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg shadow-md hover:shadow-lg"
                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" /></svg>
                            Export
                          </button>
                        )}
                        {selectedSalesBMEngineer && (
                          <>
                            <div className="flex items-center gap-1 px-2 py-1 border border-purple-200 rounded-lg bg-purple-50">
                              <span className="text-[10px] font-bold text-purple-600 uppercase">KM &gt;</span>
                              <select value={salesBMKmFilter} onChange={e => setSalesBMKmFilter(e.target.value)}
                                className="px-1 py-0.5 border border-gray-300 rounded text-[11px] bg-white">
                                <option value="">All</option>
                                {['10', '30', '50', '75', '100', '150', '200', '300', '500'].map(v => <option key={v} value={v}>{v}</option>)}
                              </select>
                            </div>
                            {canExport && (
                              <button
                                onClick={() => exportToExcel(
                                  tabSalesBMRecords,
                                  `salesbm_${selectedSalesBMEngineer.engineer_name}_${salesBMTab}.xlsx`,
                                  [
                                    { key: 'date', label: 'Date' },
                                    { key: 'sr_invoice_engine_no', label: 'SR/Inv/Engine No.' },
                                    { key: 'customer_name', label: 'Customer' },
                                    { key: 'location', label: 'Location' },
                                    { key: 'work_description', label: 'Work Description' },
                                    { key: 'labour_sale_expected', label: 'Labour Sale Exp.' },
                                    { key: 'part_sale_expected', label: 'Part Sale Exp.' },
                                    { key: 'remark', label: 'Remark' },
                                    { key: 'two_way_km', label: 'KM 2-Way' },
                                    { key: 'ho_corrected_km', label: 'HO Corrected KM' },
                                    { key: 'rate', label: 'Rate' },
                                    { key: 'da', label: 'DA' },
                                    { key: 'total_amount', label: 'Amount' },
                                    { key: 'ho_remark', label: 'HO Remark' },
                                    { key: 'verification_status', label: 'Status' },
                                  ]
                                )}
                                className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg shadow-md hover:shadow-lg"
                                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" /></svg>
                                Export
                              </button>
                            )}
                            <button onClick={submitVerifiedSalesBM} disabled={submittingSalesBM}
                              className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40"
                              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                              {submittingSalesBM ? 'Submitting...' : 'Submit Verified'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stats + Tabs — only in records detail */}
                    {selectedSalesBMEngineer && (
                      <div className="px-3 py-1.5 border-b bg-white flex flex-wrap gap-2 items-center">
                        {/* Pending / Verified tabs (like Service Engineer) */}
                        <button
                          onClick={() => setSalesBMTab('pending')}
                          className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                          style={{
                            backgroundColor: salesBMTab === 'pending' ? themeColor : '#f9fafb',
                            color: salesBMTab === 'pending' ? 'white' : '#374151',
                            borderColor: salesBMTab === 'pending' ? themeColor : '#e5e7eb',
                          }}
                        >
                          Pending ({salesBMPendingCount})
                        </button>
                        <button
                          onClick={() => setSalesBMTab('verified')}
                          className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                          style={{
                            backgroundColor: salesBMTab === 'verified' ? '#059669' : '#f9fafb',
                            color: salesBMTab === 'verified' ? 'white' : '#374151',
                            borderColor: salesBMTab === 'verified' ? '#059669' : '#e5e7eb',
                          }}
                        >
                          Verified ({salesBMVerifiedCount})
                        </button>

                        <span className="mx-1 h-5 w-px bg-gray-300" />

                        {/* Period range for this engineer */}
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-purple-50 border border-purple-100">
                          <span className="text-[9px] font-bold text-purple-600 uppercase">Period:</span>
                          <span className="text-[10px] font-bold text-purple-800 whitespace-nowrap">
                            {selectedSalesBMEngineer.period_start
                              ? (selectedSalesBMEngineer.period_start === selectedSalesBMEngineer.period_end
                                ? selectedSalesBMEngineer.period_start
                                : `${selectedSalesBMEngineer.period_start} → ${selectedSalesBMEngineer.period_end}`)
                              : '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                          <span className="text-[9px] font-bold text-gray-500 uppercase">Count:</span>
                          <span className="text-[10px] font-bold text-gray-800">{tabSalesBMRecords.length}</span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 border border-blue-100">
                          <span className="text-[9px] font-bold text-blue-600 uppercase">Total Amount:</span>
                          <span className="text-[10px] font-bold text-blue-800">₹{salesBMTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-50 border border-green-100">
                          <span className="text-[9px] font-bold text-green-600 uppercase">Verified Amount:</span>
                          <span className="text-[10px] font-bold text-green-800">₹{salesBMVerifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    <div className={selectedSalesBMEngineer ? '' : 'p-4'}>
                      {loadingSalesBM ? (
                        <div className="text-center py-6">
                          <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-xs text-gray-500">Loading Sales &amp; BM...</p>
                        </div>
                      ) : !selectedSalesBMVoucher ? (
                        /* ── VOUCHER SUMMARY ── */
                        salesBMVoucherGroups.length === 0 ? (
                          <div className="text-center py-6 text-xs text-gray-500">No Sales &amp; BM records for this branch</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse border border-gray-200">
                              <thead className="bg-gray-50"><tr>
                                {['Sr. No.', 'Voucher No.', 'Submitted By', 'Engineers', 'Total SR', 'Verified SR', 'Total Amount'].map(h =>
                                  <th key={h} className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">{h}</th>)}
                              </tr></thead>
                              <tbody>
                                {salesBMVoucherGroups.map((vg, idx) => (
                                  <tr key={vg.voucher_no} className="hover:bg-gray-50">
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm">{idx + 1}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-sm font-medium">
                                      <button onClick={() => setSelectedSalesBMVoucher(vg)} className="text-[#2f3192] underline hover:font-bold bg-transparent border-0 p-0">{vg.voucher_no}</button>
                                    </td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm"><span className="truncate" title={vg.submitted_by}>{vg.submitted_by}</span></td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm font-semibold">{vg.engineer_count}</td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm">{vg.record_count}</td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm">{vg.verified_count}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold">
                                      {vg.total ? `₹${vg.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-100"><tr className="font-bold">
                                <td colSpan="3" className="border border-gray-300 px-2 py-0.5 text-right text-sm font-semibold text-black">Grand Total:</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold">{salesBMVoucherGroups.reduce((s, v) => s + v.engineer_count, 0)}</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold">{salesBMVoucherGroups.reduce((s, v) => s + v.record_count, 0)}</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold">{salesBMVoucherGroups.reduce((s, v) => s + v.verified_count, 0)}</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold" style={{ color: themeColor }}>
                                  {(() => { const sum = salesBMVoucherGroups.reduce((s, v) => s + v.total, 0); return sum ? `₹${sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'; })()}
                                </td>
                              </tr></tfoot>
                            </table>
                          </div>
                        )
                      ) : !selectedSalesBMEngineer ? (
                        /* ── ENGINEERS IN VOUCHER ── */
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-200">
                            <thead className="bg-gray-50"><tr>
                              {['Sr. No.', 'Engineer Name', 'Engineer UID', 'Period', 'Total SR', 'Verified SR', 'Total Amount'].map(h =>
                                <th key={h} className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">{h}</th>)}
                            </tr></thead>
                            <tbody>
                              {selectedSalesBMVoucher.engineers.map((en, idx) => (
                                <tr key={en.engineer_uid || en.engineer_name} className="hover:bg-gray-50">
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm">{idx + 1}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-sm font-medium">
                                    <button onClick={() => openSalesBMEngineer(en)} className="text-[#2f3192] underline hover:font-bold bg-transparent border-0 p-0">{en.engineer_name}</button>
                                  </td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm">{en.engineer_uid || '-'}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm whitespace-nowrap">
                                    {en.period_start ? (en.period_start === en.period_end ? en.period_start : `${en.period_start} → ${en.period_end}`) : '-'}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-0 text-center text-sm">{en.record_count}</td>
                                  <td className="border border-gray-300 px-2 py-0 text-center text-sm">{en.verified_count}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold">
                                    {en.total ? `₹${en.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        /* ── RECORDS DETAIL (HO edit + verify) ── */
                        <div className="overflow-auto" style={{ maxHeight: '550px', scrollbarWidth: 'thin' }}>
                          <table className="w-full border-collapse border border-gray-200" style={{ minWidth: '2100px' }}>
                            <thead className="sticky top-0 z-20"><tr style={{ backgroundColor: '#f0f1ff' }}>
                              {[['Verify', 60, true], ['Sr.', 45], ['Date', 90], ['SR/Inv/Engine No.', 150], ['Customer', 160], ['Location', 140], ['KM 2-Way', 80], ['HO Corrected KM', 110], ['Rate', 70], ['DA', 90], ['Amount', 95], ['HO Remark', 150], ['Work Description', 180], ['Labour Sale Exp.', 120], ['Part Sale Exp.', 120], ['Remark', 150], ['Status', 90]].map(([l, w, sticky], i) =>
                                <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-200 uppercase text-center" style={{ minWidth: `${w}px`, backgroundColor: '#f0f1ff', ...(sticky && { position: 'sticky', left: 0, zIndex: 30, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)' }) }}>{l}</th>)}
                            </tr></thead>
                            <tbody>
                              {tabSalesBMRecords.map((rec, idx) => {
                                const isVerified = salesBMVerify[rec.id] ?? (rec.verification_status === 'Verified');
                                const corr = salesBMCorr[rec.id] !== undefined ? salesBMCorr[rec.id] : (rec.ho_corrected_km || '');
                                const rem = salesBMRemark[rec.id] !== undefined ? salesBMRemark[rec.id] : (rec.ho_remark || '');
                                const daVal = salesBMDA[rec.id] !== undefined && salesBMDA[rec.id] !== '' ? salesBMDA[rec.id] : (rec.da || '');
                                const isSaving = salesBMSaving[rec.id];
                                return (
                                  <tr key={rec.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                                    <td className="px-2 py-0.5 border border-gray-200 text-center" style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: isVerified ? '#f0fdf4' : '#ffffff', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)' }}>
                                      <input type="checkbox" checked={isVerified} onChange={() => handleSalesBMVerifyToggle(rec.id, isVerified)} className="w-4 h-4 cursor-pointer" />
                                    </td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-medium">{idx + 1}</td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.date || '-'}</td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.sr_invoice_engine_no}>{rec.sr_invoice_engine_no || '-'}</div></td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.customer_name}>{rec.customer_name || '-'}</div></td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.location}>{rec.location || '-'}</div></td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.two_way_km || '-'}</td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-center">
                                      <div className="relative">
                                        <input type="number" step="0.01" value={corr} disabled={isVerified}
                                          onChange={e => { setSalesBMCorr(p => ({ ...p, [rec.id]: e.target.value })); autoSaveSalesBMField(rec.id, 'ho_corrected_km', e.target.value, rec.ho_corrected_km || ''); }}
                                          placeholder="Enter KM"
                                          className={`w-full px-1 py-0.5 text-[11px] border rounded text-center ${isVerified ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`} />
                                        {isSaving && (
                                          <svg className="absolute right-1 top-1/2 -translate-y-1/2 animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                          </svg>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-semibold">{rec.rate ? `₹${rec.rate}` : '-'}</td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-center">
                                      {isVerified ? (
                                        <span className="text-[11px] font-semibold text-green-700">{(parseFloat(rec.da) && parseFloat(rec.da) !== 0) ? `₹${rec.da}` : '-'}</span>
                                      ) : (
                                        <input type="number" step="0.01" value={daVal}
                                          onChange={e => handleSalesBMDAChange(rec.id, e.target.value)}
                                          placeholder="₹0"
                                          className="w-full px-1 py-0.5 text-[11px] border border-gray-300 rounded text-center font-semibold text-green-700"
                                          title="DA editable by HO (added to amount for total)" />
                                      )}
                                    </td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-bold text-blue-700">{(parseFloat(rec.total_amount) && parseFloat(rec.total_amount) !== 0) ? `₹${rec.total_amount}` : '-'}</td>
                                    <td className="px-2 py-0.5 border border-gray-200">
                                      <input type="text" value={rem} disabled={isVerified}
                                        onChange={e => { setSalesBMRemark(p => ({ ...p, [rec.id]: e.target.value })); autoSaveSalesBMField(rec.id, 'ho_remark', e.target.value, rec.ho_remark || ''); }}
                                        placeholder="Add remark"
                                        className={`w-full px-1 py-0.5 text-[11px] border rounded ${isVerified ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`} />
                                    </td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.work_description}>{rec.work_description || '-'}</div></td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.labour_sale_expected || '-'}</td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.part_sale_expected || '-'}</td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.remark}>{rec.remark || '-'}</div></td>
                                    <td className="px-2 py-0.5 border border-gray-200 text-center">
                                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{isVerified ? 'Verified' : 'Pending'}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="sticky bottom-0"><tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td className="border border-gray-200" style={{ position: 'sticky', left: 0, zIndex: 25, backgroundColor: '#f0f1ff', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)' }} />
                              <td colSpan={9} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border border-gray-200">
                                {salesBMKmFilter ? `Filtered Total (KM > ${salesBMKmFilter})` : 'Grand Total'}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border border-gray-200" style={{ color: themeColor }}>
                                ₹{salesBMTabTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={6} className="border border-gray-200" />
                            </tr></tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════════ BILL WISE VOUCHER SUMMARY TABLE ═══════════ */}
                {selectedBranchForSummary && !selectedEngineerDetail && !selectedVoucher && !selectedBillWisePeriod && !selectedSalesPeriod && !selectedKmWisePeriod && !selectedSalesBMVoucher && !selectedSalesBMEngineer && (
                  <>
                    <div className="px-2 sm:px-3 py-1 border-b border-t flex justify-between items-center" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          Bill Wise — {selectedBranchForSummary.branch_name}
                        </h2>
                      </div>
                      {canExport && branchBillWiseSummary.groups?.length > 0 && (
                        <button
                          onClick={() => exportToExcel(
                            branchBillWiseSummary.groups,
                            `billwise_vouchers_${selectedBranchForSummary?.branch_code}.xlsx`,
                            [
                              { key: 'voucher_no', label: 'Voucher No.' },
                              { key: 'submitted_by', label: 'Submitted By' },
                              { key: 'record_count', label: 'No. of Activity' },
                              { key: 'verified_count', label: 'Verified' },
                              { key: 'total_amount', label: 'Total Amount' },
                              { key: 'verified_amount', label: 'Verified Amount' },
                            ]
                          )}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg shadow-md hover:shadow-lg"
                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" /></svg>
                          Export
                        </button>
                      )}
                    </div>

                    <div className="p-4">
                      {loadingBillWiseSummary ? (
                        <div className="text-center py-6">
                          <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-xs text-gray-500">Loading Bill Wise vouchers...</p>
                        </div>
                      ) : !branchBillWiseSummary.groups?.length ? (
                        <div className="text-center py-6 text-xs text-gray-500">No Bill Wise vouchers for this branch</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                {['Sr. No.', 'Voucher No.', 'Submitted By', 'No. of Activity', 'Verified', 'Total Amount', 'Verified Amount'].map(h =>
                                  <th key={h} className="border border-gray-300 px-2 py-1.5 text-center text-xs font-semibold text-black">{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {branchBillWiseSummary.groups.map((vg, idx) => (
                                <tr key={vg.voucher_no} className="hover:bg-gray-50">
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{idx + 1}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-sm font-medium">
                                    <button
                                      onClick={() => loadBillWisePeriodRecords(vg)}
                                      className="text-[#2f3192] underline hover:font-bold cursor-pointer bg-transparent border-0 p-0 text-left"
                                    >
                                      {vg.voucher_no}
                                    </button>
                                  </td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">
                                    <span className="truncate" title={vg.submitted_by}>{vg.submitted_by || '-'}</span>
                                  </td>
                                  <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black font-semibold">{vg.record_count}</td>
                                  <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black">{vg.verified_count}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-black">
                                    ₹{parseFloat(vg.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-green-700">
                                    ₹{parseFloat(vg.verified_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-100">
                              <tr className="font-bold">
                                <td colSpan="3" className="border border-gray-300 px-2 py-0.5 text-right text-sm font-semibold text-black">Grand Total:</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  {branchBillWiseSummary.groups.reduce((s, v) => s + (v.record_count || 0), 0)}
                                </td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  {branchBillWiseSummary.groups.reduce((s, v) => s + (v.verified_count || 0), 0)}
                                </td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  ₹{branchBillWiseSummary.groups.reduce((s, v) => s + parseFloat(v.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-green-700">
                                  ₹{branchBillWiseSummary.groups.reduce((s, v) => s + parseFloat(v.verified_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════════ BILL WISE VOUCHER DETAIL (Engineer/Customer list → records) ═══════════ */}
                {selectedBranchForSummary && !selectedEngineerDetail && selectedBillWisePeriod && (
                  <>
                    {/* Header bar */}
                    <div className="px-2 sm:px-3 py-1.5 border-b flex flex-wrap justify-between items-center gap-2" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleBackToBranches}
                          className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold"
                          style={{ color: themeColor }}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                          Back to Branches
                        </button>
                        {selectedBillWiseEngineer ? (
                          <button
                            onClick={() => setSelectedBillWiseEngineer(null)}
                            className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold"
                            style={{ color: themeColor }}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to List
                          </button>
                        ) : (
                          <button
                            onClick={() => { setSelectedBillWisePeriod(null); setBillWisePeriodRecords([]); setSelectedBillWiseEngineer(null); }}
                            className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold"
                            style={{ color: themeColor }}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Vouchers
                          </button>
                        )}
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          {selectedBillWiseEngineer
                            ? <>Bill Wise — <span className="text-purple-700">{selectedBillWiseEngineer.name}</span> ({selectedBillWiseEngineer.type})</>
                            : <>Bill Wise — Voucher <span className="text-purple-700">{selectedBillWisePeriod.voucher_no}</span></>}
                        </h2>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">
                          Period: {selectedBillWisePeriod.period_start_display === selectedBillWisePeriod.period_end_display
                            ? selectedBillWisePeriod.period_start_display
                            : `${selectedBillWisePeriod.period_start_display} → ${selectedBillWisePeriod.period_end_display}`}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">
                          Submitted by: {selectedBillWisePeriod.submitted_by || '-'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {canExport && !selectedBillWiseEngineer && (
                          <button
                            onClick={() => {
                              const map = {};
                              billWisePeriodRecords.forEach(r => {
                                const type = r.entry_type === 'BM' ? 'BM' : 'SE';
                                const name = (type === 'SE' ? r.engineer_name : r.customer_name) || 'Unknown';
                                const key = `${type}__${name}`;
                                if (!map[key]) map[key] = { type, name, record_count: 0, verified_count: 0, total: 0, verified_total: 0 };
                                const g = map[key];
                                g.record_count += 1;
                                const amt = parseFloat(r.amount) || 0;
                                g.total += amt;
                                if (r.verification_status === 'Verified') { g.verified_count += 1; g.verified_total += amt; }
                              });
                              const groups = Object.values(map).sort((a, b) => String(a.name).localeCompare(String(b.name)));
                              exportToExcel(
                                groups,
                                `billwise_${selectedBillWisePeriod.voucher_no}_list.xlsx`,
                                [
                                  { key: 'type', label: 'Type' },
                                  { key: 'name', label: 'Engineer / Customer' },
                                  { key: 'record_count', label: 'No. of Activity' },
                                  { key: 'verified_count', label: 'Verified' },
                                  { key: 'total', label: 'Total Amount' },
                                  { key: 'verified_total', label: 'Verified Amount' },
                                ]
                              );
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg shadow-md hover:shadow-lg"
                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" /></svg>
                            Export
                          </button>
                        )}
                        {canExport && selectedBillWiseEngineer && (
                          <button
                            onClick={() => {
                              const isBM = selectedBillWiseEngineer.type === 'BM';
                              const headers = isBM
                                ? [
                                  { key: 'date', label: 'Date' },
                                  { key: 'customer_name', label: 'Customer Name' },
                                  { key: 'sr_invoice_engine_no', label: 'SR No. / Inv / Engine' },
                                  { key: 'location', label: 'Location' },
                                  { key: 'expenses_head', label: 'Expense Head' },
                                  { key: 'amount', label: 'Amount' },
                                  { key: 'bill_submitted', label: 'Bill Submitted' },
                                  { key: 'work_description', label: 'Work Description' },
                                  { key: 'remark', label: 'Remark' },
                                  { key: 'work_status', label: 'Work Status' },
                                  { key: 'verification_status', label: 'Status' },
                                ]
                                : [
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
                                  { key: 'bill_submitted', label: 'Bill Submitted Status' },
                                  { key: 'verification_status', label: 'Status' },
                                ];
                              exportToExcel(
                                selectedBillWiseEngineer.records || [],
                                `billwise_${selectedBillWiseEngineer.name}_${selectedBillWiseEngineer.type}.xlsx`,
                                headers
                              );
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg shadow-md hover:shadow-lg"
                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" /></svg>
                            Export
                          </button>
                        )}
                        {selectedBillWiseEngineer && (
                          <button
                            onClick={submitVerifiedBillWiseToHistory}
                            disabled={submittingBillWiseToHistory}
                            className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40"
                            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                          >
                            {submittingBillWiseToHistory ? 'Submitting...' : 'Submit Verified'}
                          </button>
                        )}
                      </div>
                    </div>

                    {loadingBillWisePeriodRecords ? (
                      <div className="text-center py-10">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-gray-500">Loading...</p>
                      </div>
                    ) : !selectedBillWiseEngineer ? (
                      /* ── ENGINEER (SE) / CUSTOMER (BM) LIST ── */
                      (() => {
                        const map = {};
                        billWisePeriodRecords.forEach(r => {
                          const type = r.entry_type === 'BM' ? 'BM' : 'SE';
                          const name = (type === 'SE' ? r.engineer_name : r.customer_name) || 'Unknown';
                          const key = `${type}__${name}`;
                          if (!map[key]) map[key] = { type, name, records: [], record_count: 0, verified_count: 0, total: 0, verified_total: 0 };
                          const g = map[key];
                          g.records.push(r);
                          g.record_count += 1;
                          const amt = parseFloat(r.amount) || 0;
                          g.total += amt;
                          if (r.verification_status === 'Verified') { g.verified_count += 1; g.verified_total += amt; }
                        });
                        const groups = Object.values(map).sort((a, b) => String(a.name).localeCompare(String(b.name)));
                        return groups.length === 0 ? (
                          <div className="text-center py-8 text-xs text-gray-500">No records in this voucher</div>
                        ) : (
                          <div className="p-4 overflow-x-auto">
                            <table className="min-w-full border-collapse border border-gray-200">
                              <thead className="bg-gray-50"><tr>
                                {['Sr. No.', 'Type', 'Engineer / Customer', 'No. of Activity', 'Verified', 'Total Amount', 'Verified Amount'].map(h =>
                                  <th key={h} className="border border-gray-300 px-2 py-1.5 text-center text-xs font-semibold text-black">{h}</th>)}
                              </tr></thead>
                              <tbody>
                                {groups.map((g, idx) => (
                                  <tr key={`${g.type}__${g.name}`} className="hover:bg-gray-50">
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm">{idx + 1}</td>
                                    <td className="border border-gray-300 px-2 py-0 text-center">
                                      <span className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                                        style={g.type === 'BM' ? { background: '#f3e8ff', color: '#7c3aed' } : { background: '#dbeafe', color: '#1e40af' }}>
                                        {g.type}
                                      </span>
                                    </td>
                                    <td className="border border-gray-300 px-4 py-0 text-sm font-medium">
                                      <button onClick={() => setSelectedBillWiseEngineer(g)} className="text-[#2f3192] underline hover:font-bold bg-transparent border-0 p-0 text-left">{g.name}</button>
                                    </td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm font-semibold">{g.record_count}</td>
                                    <td className="border border-gray-300 px-2 py-0 text-center text-sm">{g.verified_count}</td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-black">
                                      ₹{g.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-green-700">
                                      ₹{g.verified_total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-100"><tr className="font-bold">
                                <td colSpan="3" className="border border-gray-300 px-2 py-0.5 text-right text-sm font-semibold text-black">Grand Total:</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold">{groups.reduce((s, g) => s + g.record_count, 0)}</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold">{groups.reduce((s, g) => s + g.verified_count, 0)}</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  ₹{groups.reduce((s, g) => s + g.total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-green-700">
                                  ₹{groups.reduce((s, g) => s + g.verified_total, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr></tfoot>
                            </table>
                          </div>
                        );
                      })()
                    ) : (
                      /* ── RECORDS FOR ONE ENGINEER/CUSTOMER — type-specific columns ── */
                      (() => {
                        const isBM = selectedBillWiseEngineer.type === 'BM';
                        const rows = selectedBillWiseEngineer.records || [];
                        const cols = isBM
                          ? [
                            { key: '_verify', l: 'Verify', w: 60, sticky: true },
                            { key: '_sr', l: 'Sr. No.', w: 45 },
                            { key: 'date', l: 'Date', w: 90 },
                            { key: 'customer_name', l: 'Customer Name', w: 180 },
                            { key: 'sr_invoice_engine_no', l: 'SR No. / Inv / Engine', w: 160 },
                            { key: 'location', l: 'Location', w: 140 },
                            { key: 'expenses_head', l: 'Expense Head', w: 150 },
                            { key: '_amount', l: 'Amount', w: 110 },
                            { key: 'bill_submitted', l: 'Bill Submitted', w: 100 },
                            { key: 'work_description', l: 'Work Description', w: 220 },
                            { key: 'remark', l: 'Remark', w: 160 },
                            { key: 'work_status', l: 'Work Status', w: 110 },
                            { key: '_status', l: 'Status', w: 90 },
                          ]
                          : [
                            { key: '_verify', l: 'Verify', w: 60, sticky: true },
                            { key: '_sr', l: 'Sr. No.', w: 45 },
                            { key: 'date', l: 'Date', w: 90 },
                            { key: 'service_request_no', l: 'SR No.', w: 130 },
                            { key: 'account', l: 'Account', w: 160 },
                            { key: 'installation_site_address', l: 'Installation Site Address', w: 120 },
                            { key: 'sr_type', l: 'SR Type', w: 100 },
                            { key: 'expenses_head', l: 'Expense Head', w: 140 },
                            { key: '_amount', l: 'Amount', w: 110 },
                            { key: 'work_description', l: 'Work Description', w: 200 },
                            { key: 'kms_travelled', l: 'KMs Travelled', w: 90 },
                            { key: 'task_status', l: 'Task Status', w: 100 },
                            { key: 'appointment_number', l: 'Appointment No.', w: 130 },
                            { key: 'task_start_date', l: 'Task Start Date', w: 110 },
                            { key: 'task_end_date', l: 'Task End Date', w: 110 },
                            { key: 'bill_submitted', l: 'Bill Submitted Status', w: 130 },
                            { key: '_status', l: 'Status', w: 90 },
                          ];
                        const minW = cols.reduce((s, c) => s + c.w, 0);
                        const amountColIdx = cols.findIndex(c => c.key === '_amount');
                        const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                        const verifiedTotal = rows.reduce((s, r) => {
                          const v = billWiseVerificationStatus[r.id] ?? (r.verification_status === 'Verified');
                          return v ? s + (parseFloat(r.amount) || 0) : s;
                        }, 0);
                        return (
                          <>
                            {/* Stats */}
                            <div className="px-3 py-1.5 border-b bg-white flex flex-wrap gap-2 items-center">
                              <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                                <span className="text-[9px] font-bold text-gray-500 uppercase">Count:</span>
                                <span className="text-[10px] font-bold text-gray-800">{rows.length}</span>
                              </div>
                              <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 border border-blue-100">
                                <span className="text-[9px] font-bold text-blue-600 uppercase">Total Amount:</span>
                                <span className="text-[10px] font-bold text-blue-800">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-50 border border-green-100">
                                <span className="text-[9px] font-bold text-green-600 uppercase">Verified Amount:</span>
                                <span className="text-[10px] font-bold text-green-800">₹{verifiedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>

                            <div className="overflow-auto" style={{ maxHeight: '550px', scrollbarWidth: 'thin' }}>
                              <table className="w-full border-collapse border border-gray-300" style={{ minWidth: `${minW}px` }}>
                                <thead className="sticky top-0 z-20">
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    {cols.map((c, i) => (
                                      <th key={i}
                                        className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-300 uppercase tracking-wide whitespace-nowrap text-center"
                                        style={{
                                          width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#f0f1ff',
                                          ...(c.sticky && { position: 'sticky', left: 0, zIndex: 30, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)' }),
                                        }}>
                                        {c.l}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((rec, idx) => {
                                    const isVerified = billWiseVerificationStatus[rec.id] ?? (rec.verification_status === 'Verified');
                                    const isSaving = billWiseSavingStates[rec.id];
                                    const rowBg = isVerified ? '#f0fdf4' : '#ffffff';
                                    return (
                                      <tr key={rec.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                                        {cols.map((c, ci) => {
                                          if (c.key === '_verify') {
                                            return (
                                              <td key={ci} className="px-2 py-0.5 border border-gray-300 text-center"
                                                style={{ position: 'sticky', left: 0, zIndex: 10, backgroundColor: rowBg, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)' }}>
                                                <div className="flex items-center justify-center gap-1">
                                                  <input type="checkbox" checked={isVerified} onChange={() => handleBillWiseVerificationToggle(rec.id, isVerified)} className="w-4 h-4 cursor-pointer" />
                                                  {isSaving && (
                                                    <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                  )}
                                                </div>
                                              </td>
                                            );
                                          }
                                          if (c.key === '_sr') {
                                            return <td key={ci} className="px-2 py-0.5 border border-gray-300 text-[11px] text-center font-medium">{idx + 1}</td>;
                                          }
                                          if (c.key === '_amount') {
                                            return (
                                              <td key={ci} className="px-2 py-0.5 border border-gray-300 text-[11px] text-center font-bold text-blue-700">
                                                {(parseFloat(rec.amount) && parseFloat(rec.amount) !== 0) ? `₹${parseFloat(rec.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                              </td>
                                            );
                                          }
                                          if (c.key === 'work_status') {
                                            return (
                                              <td key={ci} className="px-2 py-0.5 border border-gray-300 text-center">
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700">{rec.work_status || '-'}</span>
                                              </td>
                                            );
                                          }
                                          if (c.key === '_status') {
                                            return (
                                              <td key={ci} className="px-2 py-0.5 border border-gray-300 text-center">
                                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                  {isVerified ? 'Verified' : 'Pending'}
                                                </span>
                                              </td>
                                            );
                                          }
                                          const val = rec[c.key];
                                          return (
                                            <td key={ci} className="px-2 py-0.5 border border-gray-300 text-[11px]"
                                              style={{ width: `${c.w}px`, minWidth: `${c.w}px`, maxWidth: `${c.w}px` }}>
                                              <div className="truncate text-center" title={val || ''}>{val || '-'}</div>
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="sticky bottom-0">
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    <td className="border border-gray-300" style={{ position: 'sticky', left: 0, zIndex: 25, backgroundColor: '#f0f1ff', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)' }} />
                                    <td colSpan={amountColIdx - 1} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border border-gray-300">Grand Total</td>
                                    <td className="px-2 py-1.5 text-[11px] font-bold text-center border border-gray-300" style={{ color: themeColor }}>
                                      ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td colSpan={cols.length - amountColIdx - 1} className="border border-gray-300" />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </>
                )}
              </>
            )}

            {/* Engineer Details View (Third Table - Detailed Records) */}
            {selectedEngineerDetail && (
              <>
                <div className="px-2 sm:px-3 py-1 sm:py-1 border-b flex justify-between items-center" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBackToBranches}
                      className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold transition-all"
                      style={{ color: themeColor }}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Back to Branches
                    </button>
                    <button
                      onClick={handleBackToEngineersList}
                      className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold transition-all"
                      style={{ color: themeColor }}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Back to Engineers
                    </button>
                    <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                      TADA Records - {selectedEngineerDetail.name}
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                      Total: {engineerRecords.length}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={refreshCurrentView2}
                      disabled={refreshing}
                      className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                    >
                      {refreshing ? (
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      Refresh
                    </button>
                    {canExport && (
                      <button
                        onClick={() => {
                          const exportCols = columnOrder
                            .map(key => COL_MAP[key])
                            .filter(Boolean)
                            .filter(c => !['verification_status', 'ho_corrected_km', 'ho_remark'].includes(c.key));
                          const enriched = engineerRecords.map(r => ({
                            ...r,
                            da_amount: dynamicDAAmounts[r.id] ?? r.da_amount,
                            total_amount: dynamicTotalAmounts[r.id] ?? r.total_amount,
                          }));
                          exportToExcel(
                            enriched,
                            `tada_${selectedEngineerDetail?.name}_records.xlsx`,
                            exportCols.map(c => ({ key: c.key, label: c.label }))
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                        </svg>
                        Export
                      </button>
                    )}
                    <button
                      onClick={() => setShowKMRateModal(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Branch KM Rate
                    </button>
                  </div>
                </div>

                {/* ── Combined Row: Tabs + Tab Stats + Branch Info Hover Button ── */}
                {engineerRecords.length > 0 && (() => {
                  const currentEng = engineerSummary.find(e => e.engineer_uid === selectedEngineerDetail?.uid);

                  // Tab-specific stats — respect both Task Status and SR Type filters so tab counts match visible rows
                  const pendingCount = filteredEngineerRecords.filter(r => r.verification_status !== 'Verified' && matchEngineerColumnFilters(r)).length;
                  const verifiedCount = filteredEngineerRecords.filter(r => r.verification_status === 'Verified' && matchEngineerColumnFilters(r)).length;

                  const tabRecords = tabFilteredEngineerRecords;
                  const tabCount = tabRecords.length;
                  const tabAmount = tabRecords.reduce((sum, r) => {
                    const amt = parseFloat(dynamicTotalAmounts[r.id] ?? r.total_amount ?? 0) || 0;
                    return sum + amt;
                  }, 0);

                  const dates = tabRecords
                    .map(r => r.sr_reach_at_site_datetime ? new Date(r.sr_reach_at_site_datetime) : null)
                    .filter(d => d && !isNaN(d));
                  const minDate = dates.length ? new Date(Math.min(...dates)) : null;
                  const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
                  const fmt = (d) => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

                  const isVerifiedTab = engineerDetailTab === 'verified';

                  // Branch-level totals (for popover)
                  let totalAmount = 0;
                  let verifiedAmount = 0;
                  engineerRecords.forEach(r => {
                    const amt = parseFloat(dynamicTotalAmounts[r.id] ?? r.total_amount ?? 0) || 0;
                    totalAmount += amt;
                    if (r.verification_status === 'Verified') verifiedAmount += amt;
                  });

                  return (
                    <div className="px-3 py-1.5 border-b bg-white flex flex-wrap items-center gap-1.5">
                      {/* Tab buttons */}
                      <button
                        onClick={() => setEngineerDetailTab('pending')}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: engineerDetailTab === 'pending' ? themeColor : '#f9fafb',
                          color: engineerDetailTab === 'pending' ? 'white' : '#374151',
                          borderColor: engineerDetailTab === 'pending' ? themeColor : '#e5e7eb',
                        }}
                      >
                        Pending ({pendingCount})
                      </button>
                      <button
                        onClick={() => setEngineerDetailTab('verified')}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: engineerDetailTab === 'verified' ? '#059669' : '#f9fafb',
                          color: engineerDetailTab === 'verified' ? 'white' : '#374151',
                          borderColor: engineerDetailTab === 'verified' ? '#059669' : '#e5e7eb',
                        }}
                      >
                        Verified ({verifiedCount})
                      </button>

                      <span className="mx-1 h-5 w-px bg-gray-300" />

                      {engineerTaskStatusFilter.size > 0 && (
                        <button
                          onClick={() => setEngineerTaskStatusFilter(new Set())}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white"
                          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
                          title="Clear Task Status filter"
                        >
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                          </svg>
                          Task: {Array.from(engineerTaskStatusFilter).join(', ')}
                          <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      {engineerSrTypeFilter.size > 0 && (
                        <button
                          onClick={() => setEngineerSrTypeFilter(new Set())}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md text-white"
                          style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
                          title="Clear SR Type filter"
                        >
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                          </svg>
                          SR Type: {Array.from(engineerSrTypeFilter).join(', ')}
                          <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}

                      {/* Manual Entry filter toggle */}
                      {(() => {
                        const manualCount = filteredEngineerRecords.filter(r => String(r.file_name || '').trim() === 'manual_entry.xlsx').length;
                        return (
                          <button
                            onClick={() => setEngineerManualFilter(v => !v)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md transition-all border"
                            style={{
                              background: engineerManualFilter ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#fff',
                              color: engineerManualFilter ? '#fff' : '#92400e',
                              borderColor: engineerManualFilter ? '#d97706' : '#fcd34d',
                            }}
                            title={engineerManualFilter ? 'Showing only Manual Entries — click to clear' : 'Show only Manual Entries (file_name = manual_entry.xlsx)'}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Manual Entries ({manualCount})
                            {engineerManualFilter && (
                              <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })()}

                      {/* Tab-specific stats */}
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 border border-gray-200">
                        <span className="text-[9px] font-bold text-gray-500 uppercase">Count:</span>
                        <span className="text-[10px] font-bold text-gray-800">{tabCount}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                        <span className="text-[9px] font-bold text-blue-600 uppercase">
                          {isVerifiedTab ? 'Verified Amount:' : 'Pending Amount:'}
                        </span>
                        <span className="text-[10px] font-bold text-blue-800">
                          ₹{tabAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 border border-green-100">
                        <span className="text-[9px] font-bold text-green-600 uppercase">Start Date:</span>
                        <span className="text-[10px] font-bold text-green-800">{fmt(minDate)}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 border border-orange-100">
                        <span className="text-[9px] font-bold text-orange-600 uppercase">End Date:</span>
                        <span className="text-[10px] font-bold text-orange-800">{fmt(maxDate)}</span>
                      </div>

                      {/* Right-side Branch Info button with hover popover */}
                      {currentEng && (
                        <div className="ml-auto relative">
                          <button
                            ref={infoButtonRef}
                            onMouseEnter={() => {
                              if (infoButtonRef.current) {
                                const rect = infoButtonRef.current.getBoundingClientRect();
                                setInfoPopoverPos({
                                  top: rect.bottom + 8,
                                  left: rect.right - 320
                                });
                                setShowInfoPopover(true);
                              }
                            }}
                            onMouseLeave={() => setShowInfoPopover(false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-white rounded-md transition-all shadow-sm hover:shadow-md"
                            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                          >
                            Table Info
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Fixed-position popover - escapes parent overflow clipping */}
                          <div
                            onMouseEnter={() => setShowInfoPopover(true)}
                            onMouseLeave={() => setShowInfoPopover(false)}
                            className="bg-white rounded-lg shadow-2xl border border-gray-200 min-w-[320px] overflow-hidden"
                            style={{
                              position: 'fixed',
                              top: `${infoPopoverPos.top}px`,
                              left: `${infoPopoverPos.left}px`,
                              zIndex: 999999,
                              display: showInfoPopover ? 'block' : 'none'
                            }}
                          >
                            {/* small arrow */}
                            <div className="absolute -top-1.5 right-4 w-3 h-3 bg-white border-l border-t border-gray-200 transform rotate-45"></div>

                            {/* Header */}
                            <div className="px-3 py-2 border-b border-gray-100" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                              <div className="flex items-center gap-1.5">
                                <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span className="text-[11px] font-bold text-white uppercase tracking-wide">Engineer Table Information</span>
                              </div>
                            </div>

                            {/* Body - 2 column grid: Label | Value */}
                            <div className="p-2 bg-white">
                              <div className="space-y-1">
                                {/* Branch Name */}
                                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1 h-1 rounded-full" style={{ backgroundColor: themeColor }}></span>
                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Branch</span>
                                  </div>
                                  <span className="text-[11px] font-bold" style={{ color: themeColor }}>
                                    {selectedBranchForSummary?.branch_name || '-'}
                                  </span>
                                </div>

                                {/* Branch Code */}
                                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1 h-1 rounded-full bg-purple-500"></span>
                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Branch Code</span>
                                  </div>
                                  <span className="text-[11px] font-bold text-purple-700 font-mono">
                                    {selectedBranchForSummary?.branch_code || '-'}
                                  </span>
                                </div>

                                <div className="border-t border-gray-100 my-1"></div>

                                {/* Start Date */}
                                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1 h-1 rounded-full bg-green-500"></span>
                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Start Date</span>
                                  </div>
                                  <span className="text-[11px] font-bold text-green-700">
                                    {currentEng.start_date || '-'}
                                  </span>
                                </div>

                                {/* End Date */}
                                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1 h-1 rounded-full bg-orange-500"></span>
                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">End Date</span>
                                  </div>
                                  <span className="text-[11px] font-bold text-orange-700">
                                    {currentEng.end_date || '-'}
                                  </span>
                                </div>

                                <div className="border-t border-gray-100 my-1"></div>

                                {/* Total Amount */}
                                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-blue-50/60">
                                  <div className="flex items-center gap-1.5">
                                    <svg className="h-3 w-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                                    </svg>
                                    <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Total Amount</span>
                                  </div>
                                  <span className="text-[12px] font-extrabold text-blue-800">
                                    ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>

                                {/* Verified Amount */}
                                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-emerald-50/60">
                                  <div className="flex items-center gap-1.5">
                                    <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Verified Amount</span>
                                  </div>
                                  <span className="text-[12px] font-extrabold text-emerald-800">
                                    ₹{verifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Combined: Bulk Verification + SR Reach Date Filter */}
                {engineerRecords.length > 0 && (
                  <div className="px-4 py-1.5 border-b bg-gray-50 flex flex-wrap justify-between items-center gap-2">
                    {/* Left: Verify All / Unverify All */}
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        {/* <button
                          onClick={handleSelectAll}
                          disabled={bulkVerifying || engineerRecords.length === 0}
                          className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 transition-colors"
                          style={{
                            background: engineerDetailTab === 'verified'
                              ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                              : 'linear-gradient(135deg, #059669, #047857)'
                          }}
                        >
                          {bulkVerifying
                            ? (engineerDetailTab === 'verified' ? 'Unverifying...' : 'Verifying...')
                            : (engineerDetailTab === 'verified' ? 'Unverify All' : 'Verify All')}
                        </button> */}
                      </label>
                      <span className="text-xs text-gray-500">
                        Selected: {selectedCount} of {engineerRecords.length}
                      </span>
                    </div>

                    {/* Middle: SR Reach at Site Date Filter + Two Way KM Filter */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
                        <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">SR Reach at Site Date:</span>
                        <input
                          type="date"
                          value={recordsReachDateFrom}
                          onChange={e => setRecordsReachDateFrom(e.target.value)}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="SR Reach at Site From"
                        />
                        <span className="text-[10px] text-gray-400">to</span>
                        <input
                          type="date"
                          value={recordsReachDateTo}
                          onChange={e => setRecordsReachDateTo(e.target.value)}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="SR Reach at Site To"
                        />
                      </div>

                      {/* Two Way KM Filter (Excel-style) */}
                      <div className="flex items-center gap-0.5 px-1 py-1 border border-purple-200 rounded-lg bg-purple-50">
                        <span className="text-[10px] font-bold text-purple-600 whitespace-nowrap">2W KM:</span>
                        <select
                          value={recordsTwoWayKmFilter}
                          onChange={e => setRecordsTwoWayKmFilter(e.target.value)}
                          className="px-1 py-0 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                          title="Filter records by Two Way KM"
                        >
                          <option value="">All</option>
                          <option value="10">&gt; 10</option>
                          <option value="30">&gt; 30</option>
                          <option value="50">&gt; 50</option>
                          <option value="75">&gt; 75</option>
                          <option value="100">&gt; 100</option>
                          <option value="150">&gt; 150</option>
                          <option value="200">&gt; 200</option>
                          <option value="300">&gt; 300</option>
                          <option value="400">&gt; 400</option>
                          <option value="500">&gt; 500</option>
                        </select>
                      </div>

                      {(recordsReachDateFrom || recordsReachDateTo || recordsTwoWayKmFilter) && (
                        <>
                          <button
                            onClick={() => { setRecordsReachDateFrom(''); setRecordsReachDateTo(''); setRecordsTwoWayKmFilter(''); }}
                            className="px-2 py-1 text-[10px] text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                          >
                            Clear
                          </button>
                          <span className="text-[10px] text-gray-500 whitespace-nowrap">
                            Showing <strong className="text-blue-700">{filteredEngineerRecords.length}</strong> of <strong>{engineerRecords.length}</strong>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Right: Verify + Submit buttons */}
                    <div className="flex items-center gap-2">
                      {/* <button
                        onClick={handleBulkVerify}
                        disabled={selectedCount === 0 || bulkVerifying}
                        className="px-4 py-1.5 text-white text-xs font-semibold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: engineerDetailTab === 'verified'
                            ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                            : `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`
                        }}
                      >
                        {bulkVerifying ? (
                          <span className="flex items-center gap-1">
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Processing...
                          </span>
                        ) : (
                          engineerDetailTab === 'verified' ? `Unverify (${selectedCount})` : `Verify (${selectedCount})`
                        )}
                      </button> */}
                      {(() => {
                        const verifiedInDb = engineerRecords.filter(r => r.verification_status === 'Verified').length;
                        return (
                          <button
                            onClick={() => moveVerifiedToHistory()}
                            disabled={loadingMoveToHistory || verifiedInDb === 0}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                            title={verifiedInDb === 0 ? 'No verified records to submit' : `Submit ${verifiedInDb} verified record(s)`}
                          >
                            {loadingMoveToHistory ? (
                              <>
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Submitting...
                              </>
                            ) : (
                              `Submit${verifiedInDb > 0 ? ` (${verifiedInDb})` : ''}`
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {loadingRecords ? (
                  <div className="text-center py-20">
                    <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">Loading records...</p>
                  </div>
                ) : engineerRecords.length === 0 ? (
                  <div className="text-center py-16 px-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: '#d1fae5' }}>
                      <svg className="h-9 w-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-base text-gray-800 font-semibold mb-1">All records submitted to history</p>
                    <p className="text-sm text-gray-500 mb-5">
                      No pending records for <strong>{selectedEngineerDetail?.name}</strong>. Every verified record has been moved to history.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={handleBackToEngineersList}
                        className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold transition-all"
                        style={{ color: themeColor }}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Engineers
                      </button>
                      <button
                        onClick={() => loadBranchHistory(selectedBranchForSummary)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:shadow-md transition-all"
                        style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        View History
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      ref={topScrollBarRef}
                      className="overflow-x-auto border-b border-gray-200 bg-gray-50"
                      style={{ scrollbarWidth: 'thin', overflowY: 'hidden' }}
                    >
                      <div style={{ width: `${totalTableWidth}px`, height: '1px' }} />
                    </div>

                    <div
                      ref={tableContainerRef}
                      className="overflow-auto"
                      style={{ maxHeight: '600px', scrollbarWidth: 'thin' }}
                    >
                      <DndContext collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                          <table className="border-collapse" style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px`, tableLayout: 'fixed' }}>
                            <thead className="sticky top-0 z-10">
                              <tr className="border-b-2 border-gray-200" style={{ backgroundColor: '#f0f1ff' }}>
                                {columnOrder.map(key => {
                                  const col = COL_MAP[key];
                                  if (!col) return null;
                                  if (key === 'task_status') {
                                    const isActive = engineerTaskStatusFilter.size > 0;
                                    return (
                                      <SortableTableHeader key={key} id={key}
                                        className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r last:border-r-0 border-gray-300 uppercase tracking-tight text-center align-middle"
                                        style={{
                                          width: `${col.width}px`,
                                          minWidth: `${col.width}px`,
                                          backgroundColor: '#f0f1ff',
                                          height: '35px',
                                        }}>
                                        <span className="inline-flex items-center justify-center gap-1">
                                          <span>{col.label}</span>
                                          <button
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => openTaskStatusFilter(e, engineerRecords, engineerTaskStatusFilter, setEngineerTaskStatusFilter)}
                                            className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                            title={isActive ? `Filtering: ${engineerTaskStatusFilter.size} value(s)` : 'Filter Task Status'}
                                          >
                                            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                              <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                                            </svg>
                                          </button>
                                        </span>
                                      </SortableTableHeader>
                                    );
                                  }
                                  if (key === 'sr_type') {
                                    const isActive = engineerSrTypeFilter.size > 0;
                                    return (
                                      <SortableTableHeader key={key} id={key}
                                        className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r last:border-r-0 border-gray-300 uppercase tracking-tight text-center align-middle"
                                        style={{
                                          width: `${col.width}px`,
                                          minWidth: `${col.width}px`,
                                          backgroundColor: '#f0f1ff',
                                          height: '35px',
                                        }}>
                                        <span className="inline-flex items-center justify-center gap-1">
                                          <span>{col.label}</span>
                                          <button
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => openSrTypeFilter(e, engineerRecords, engineerSrTypeFilter, setEngineerSrTypeFilter)}
                                            className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                            title={isActive ? `Filtering: ${engineerSrTypeFilter.size} value(s)` : 'Filter SR Type'}
                                          >
                                            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                              <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                                            </svg>
                                          </button>
                                        </span>
                                      </SortableTableHeader>
                                    );
                                  }
                                  return (
                                    <SortableTableHeader key={key} id={key}
                                      className="px-1 py-0 text-[10px] font-bold text-gray-700 border-r last:border-r-0 border-gray-300 uppercase tracking-tight text-center align-middle"
                                      style={{
                                        width: `${col.width}px`,
                                        minWidth: `${col.width}px`,
                                        backgroundColor: '#f0f1ff',
                                        height: '35px',
                                      }}>
                                      {col.label}
                                    </SortableTableHeader>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {tabFilteredEngineerRecords.map((record, idx) => (
                                <tr key={record.id} className="hover:bg-blue-50/30 transition-colors duration-75" style={{ height: '32px' }}>
                                  {columnOrder.map(key => {
                                    const col = COL_MAP[key];
                                    if (!col) return null;
                                    return (
                                      <td key={key}
                                        className="px-2 py-0.5 border-r last:border-r-0 border-gray-100 overflow-hidden align-middle"
                                        style={{ width: `${col.width}px`, minWidth: `${col.width}px`, maxWidth: `${col.width}px` }}>
                                        {renderCell(record, key, idx)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </SortableContext>
                      </DndContext>
                    </div>
                    {/* Bottom Totals — based on filtered SR Reach at Site Date */}
                    <div className="px-3 py-2 border-t bg-gray-50 flex flex-wrap items-center justify-end gap-2">
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                        <span className="text-[9px] font-bold text-blue-600 uppercase">
                          {(recordsReachDateFrom || recordsReachDateTo || recordsTwoWayKmFilter || engineerTaskStatusFilter.size > 0 || engineerSrTypeFilter.size > 0) ? 'Filtered Total Amount:' : 'Total Amount:'}
                        </span>
                        <span className="text-[11px] font-bold text-blue-800">
                          ₹{filteredTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-100">
                        <span className="text-[9px] font-bold text-emerald-600 uppercase">
                          {(recordsReachDateFrom || recordsReachDateTo || recordsTwoWayKmFilter || engineerTaskStatusFilter.size > 0 || engineerSrTypeFilter.size > 0) ? 'Filtered Verified Amount:' : 'Verified Amount:'}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-800">
                          ₹{filteredVerifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {showHistoryModal && (
          <TADAHistoryModal
            branch={historyBranch}
            themeColor={themeColor}
            onClose={closeHistoryModal}
            canExport={canExport}
          />
        )}

        {activeTab === 'office' && (
          <OfficeExpenseHO
            themeColor={themeColor}
            themeShades={themeShades}
            branchMap={branchMap}
            branchOrder={BRANCH_ORDER}
            user={user}
            canExport={canExport}
            exportToExcel={exportToExcel}
            onOpenExpenseHead={() => setShowExpenseHeadModal(true)}
            onOpenImprest={openImprestModal}
          />
        )}

        {activeTab === 'vendor' && (
          <>
            <LocalVendorBillHO
              themeColor={themeColor}
              themeShades={themeShades}
              branchMap={branchMap}
              branchOrder={BRANCH_ORDER}
              user={user}
              canExport={canExport}
              exportToExcel={exportToExcel}
              onOpenVendorList={loadVendorList}
            />

            {/* Vendor List Modal */}
            {showVendorListModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="px-4 py-3 flex justify-between items-center shrink-0" style={{ background: themeColor }}>
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">All Vendors</h2>
                      {!loadingVendorList && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">{vendorList.length} vendors</span>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowVendorListModal(false); setVendorSearch(''); setVendorBranchFilter(''); }}
                      className="w-7 h-7 bg-white rounded-lg flex items-center justify-center"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Search and Filter Bar */}
                  {!loadingVendorList && vendorList.length > 0 && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                      {/* Search */}
                      <div className="relative flex-1 min-w-[180px]">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={vendorSearch}
                          onChange={e => setVendorSearch(e.target.value)}
                          placeholder="Search by vendor name, GST no..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {vendorSearch && (
                          <button onClick={() => setVendorSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Branch Filter */}
                      <select
                        value={vendorBranchFilter}
                        onChange={e => setVendorBranchFilter(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="">All Branches</option>
                        {BRANCH_ORDER.map(code => (
                          <option key={code} value={code}>{branchMap[code]} ({code})</option>
                        ))}
                      </select>

                      {/* Clear */}
                      {(vendorSearch || vendorBranchFilter) && (
                        <button
                          onClick={() => { setVendorSearch(''); setVendorBranchFilter(''); }}
                          className="px-2 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                        >
                          Clear
                        </button>
                      )}

                      {/* Export Button */}
                      {canExport && (
                        <button
                          onClick={() => {
                            const filtered = vendorList.filter(v => {
                              const sl = vendorSearch.toLowerCase();
                              const matchesSearch = !vendorSearch || [
                                v.name, v.gst_no, v.branch_code,
                                branchMap[v.branch_code], v.address, v.state,
                              ].some(val => val && val.toLowerCase().includes(sl));
                              const matchesBranch = !vendorBranchFilter || v.branch_code === vendorBranchFilter;
                              return matchesSearch && matchesBranch;
                            });
                            exportToExcel(
                              filtered,
                              'vendor_list.xlsx',
                              [
                                { key: 'name', label: 'Vendor Name' },
                                { key: 'gst_no', label: 'GST No.' },
                                { key: 'branch_code', label: 'Branch Code' },
                                { key: 'branch_name', label: 'Branch Name' },
                                { key: 'state', label: 'State' },
                                { key: 'address', label: 'Address' },
                              ]
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                          </svg>
                          Export
                        </button>
                      )}
                    </div>
                  )}

                  {/* Body */}
                  <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                    {loadingVendorList ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-gray-500">Loading vendors...</p>
                      </div>
                    ) : vendorList.length === 0 ? (
                      <div className="text-center py-20">
                        <p className="text-xs text-gray-500 font-medium">No vendors found</p>
                      </div>
                    ) : (() => {
                      const filtered = vendorList.filter(v => {
                        const sl = vendorSearch.toLowerCase();
                        const matchesSearch = !vendorSearch || [
                          v.name, v.gst_no, v.branch_code,
                          branchMap[v.branch_code], v.address, v.state,
                        ].some(val => val && val.toLowerCase().includes(sl));
                        const matchesBranch = !vendorBranchFilter || v.branch_code === vendorBranchFilter;
                        return matchesSearch && matchesBranch;
                      });
                      return filtered.length === 0 ? (
                        <div className="text-center py-20">
                          <p className="text-xs text-gray-500">No vendors match your filters</p>
                          <button onClick={() => { setVendorSearch(''); setVendorBranchFilter(''); }} className="mt-2 text-xs text-blue-600 hover:underline">Clear</button>
                        </div>
                      ) : (
                        <table className="border-collapse w-full">
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {['Sr.', 'Vendor Name', 'GST No.', 'Branch', 'State', 'Address'].map((col, i) => (
                                <th key={i} className="px-3 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center" style={{ backgroundColor: '#f0f1ff' }}>
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filtered.map((vendor, idx) => (
                              <tr key={vendor.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                                <td className="px-3 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{idx + 1}</td>
                                <td className="px-3 py-0.5 border-r border-gray-100 text-[11px] text-black font-medium">
                                  <div className="truncate max-w-[180px]" title={vendor.name}>{vendor.name || '-'}</div>
                                </td>
                                <td className="px-3 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate max-w-[120px]" title={vendor.gst_no}>{vendor.gst_no || '-'}</div>
                                </td>
                                <td className="px-3 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate max-w-[130px]" title={branchMap[vendor.branch_code]}>{branchMap[vendor.branch_code] || '-'}</div>
                                </td>
                                <td className="px-3 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate max-w-[100px]" title={vendor.state}>{vendor.state || '-'}</div>
                                </td>
                                <td className="px-3 py-0.5 border-r border-gray-100 text-[11px] text-black">
                                  <div className="truncate max-w-[200px]" title={vendor.address || ''}>{vendor.address || '-'}</div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      {vendorSearch || vendorBranchFilter ? (
                        (() => {
                          const filtered = vendorList.filter(v => {
                            const sl = vendorSearch.toLowerCase();
                            const matchesSearch = !vendorSearch || [
                              v.name, v.gst_no, v.branch_code,
                              branchMap[v.branch_code], v.address, v.state,
                            ].some(val => val && val.toLowerCase().includes(sl));
                            const matchesBranch = !vendorBranchFilter || v.branch_code === vendorBranchFilter;
                            return matchesSearch && matchesBranch;
                          });
                          return <><strong>{filtered.length}</strong> of <strong>{vendorList.length}</strong> vendors</>;
                        })()
                      ) : (
                        <><strong>{vendorList.length}</strong> total vendors</>
                      )}
                    </span>
                    <button
                      onClick={() => { setShowVendorListModal(false); setVendorSearch(''); setVendorBranchFilter(''); }}
                      className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* KM Rate Modal */}
        {showKMRateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
              <div className="sticky top-0 px-3 sm:px-4 py-3 flex justify-between items-center" style={{ background: themeColor }}>
                <h2 className="text-xs sm:text-sm font-semibold text-white">Branch KM & DA Rates</h2>
                <button onClick={() => setShowKMRateModal(false)} className="w-6 h-6 bg-white rounded-lg flex items-center justify-center transition-all">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-3 sm:p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 100px)' }}>
                <div className="space-y-2 sm:space-y-3">
                  {BRANCH_ORDER.map((branchCode) => {
                    const branchName = branchMap[branchCode];
                    const branchData = kmRates[branchCode] || {};
                    return (
                      <div key={branchCode} className="bg-gray-50 rounded-lg p-2 sm:p-3 hover:shadow-md transition-shadow">
                        <h3 className="text-xs sm:text-sm font-bold text-gray-800 mb-2 pb-1.5 border-b" style={{ borderColor: themeColor + '40' }}>
                          {branchName} ({branchCode})
                        </h3>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
                          <div className="bg-white rounded-lg p-2 shadow-sm">
                            <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">KM Rate</label>
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-600 font-medium text-xs">₹</span>
                              <input type="number" value={branchData.km_rate || ''} onChange={(e) => handleKMRateChange(branchCode, 'km_rate', e.target.value)} onKeyPress={(e) => e.key === 'Enter' && saveKMRates()} placeholder="0.00" className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all text-gray-900" />
                              <span className="text-gray-600 text-xs font-medium">/ KM</span>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 shadow-sm">
                            <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Range-based DA</label>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1"><input type="number" value={branchData.range_start_km || ''} onChange={(e) => handleKMRateChange(branchCode, 'range_start_km', e.target.value)} placeholder="From km" className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 text-gray-900" /></div>
                                <span className="text-gray-400 text-[10px]">→</span>
                                <div className="flex-1"><input type="number" value={branchData.range_end_km || ''} onChange={(e) => handleKMRateChange(branchCode, 'range_end_km', e.target.value)} placeholder="To km" className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 text-gray-900" /></div>
                              </div>
                              <div className="flex items-center gap-1.5"><span className="text-gray-600 font-medium text-xs">₹</span><input type="number" value={branchData.range_amount || ''} onChange={(e) => handleKMRateChange(branchCode, 'range_amount', e.target.value)} placeholder="Amount" className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 text-gray-900" /></div>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-2 shadow-sm">
                            <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Above Range DA</label>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5"><span className="text-gray-600 font-medium text-[10px]">Greater than</span><input type="number" value={branchData.above_km || ''} onChange={(e) => handleKMRateChange(branchCode, 'above_km', e.target.value)} placeholder="km" className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 text-gray-900" /><span className="text-gray-400 text-[10px]">km</span></div>
                              <div className="flex items-center gap-1.5"><span className="text-gray-600 font-medium text-xs">₹</span><input type="number" value={branchData.above_amount || ''} onChange={(e) => handleKMRateChange(branchCode, 'above_amount', e.target.value)} placeholder="Amount" className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 text-gray-900" /></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="sticky bottom-0 bg-white px-3 sm:px-4 py-2 flex justify-end gap-2">
                <button onClick={() => setShowKMRateModal(false)} className="px-3 sm:px-4 py-1.5 border-2 border-gray-300 rounded-lg text-[10px] sm:text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all">Cancel</button>
                <button onClick={saveKMRates} disabled={!hasKMRateChanges() || loadingKMRates} className="px-3 sm:px-4 py-1.5 text-white text-[10px] sm:text-xs font-semibold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>{loadingKMRates ? (<span className="flex items-center gap-1.5"><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Saving...</span>) : 'Save All Rates'}</button>
              </div>
            </div>
          </div>
        )}

        {showAddEmployeeModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

              {/* Header */}
              <div
                className="px-5 py-3 flex justify-between items-center shrink-0"
                style={{ background: themeColor }}
              >
                <h2 className="text-sm font-semibold text-white">Add Employee</h2>
                <button
                  onClick={() => {
                    setShowAddEmployeeModal(false);
                    setEmployeeForm({ employee_name: '', employee_id: '', employee_uid: '', designation: '' });
                    setBranchEmployees([]);
                  }}
                  disabled={addingEmployee}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100 disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Form Body - fixed, no scroll */}
              <div className="px-5 py-4 space-y-3 shrink-0 border-b border-gray-100">

                {/* Branch */}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Branch</label>
                  <div
                    className="px-3 py-2 rounded-lg text-xs font-medium text-white"
                    style={{ background: themeColor }}
                  >
                    {selectedBranchForSummary
                      ? `${selectedBranchForSummary.branch_name} (${selectedBranchForSummary.branch_code})`
                      : `${getBranchDisplayName(user?.branch)} (${user?.branch})`}
                  </div>
                </div>

                {/* Name + ID row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                      Employee Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={employeeForm.employee_name}
                      onChange={e => setEmployeeForm(prev => ({ ...prev, employee_name: e.target.value }))}
                      placeholder="Enter name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1"
                      style={{ '--tw-ring-color': themeColor }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                      Employee ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={employeeForm.employee_id}
                      onChange={e => setEmployeeForm(prev => ({ ...prev, employee_id: e.target.value }))}
                      placeholder="Enter ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1"
                    />
                  </div>
                </div>

                {/* UID + Designation row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                      Employee UID
                    </label>
                    <input
                      type="text"
                      value={employeeForm.employee_uid}
                      onChange={e => setEmployeeForm(prev => ({ ...prev, employee_uid: e.target.value }))}
                      placeholder="Enter UID (optional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                      Designation <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={employeeForm.designation}
                      onChange={e => setEmployeeForm(prev => ({ ...prev, designation: e.target.value }))}
                      placeholder="Enter designation"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1"
                    />
                  </div>
                </div>

                {/* Add button */}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={async () => {
                      const { employee_name, employee_id, designation } = employeeForm;
                      if (!employee_name.trim() || !employee_id.trim() || !designation.trim()) {
                        toast.error('All fields are required');
                        return;
                      }
                      const branchCode = selectedBranchForSummary?.branch_code || user?.branch;
                      setAddingEmployee(true);
                      try {
                        await axios.post(
                          `${API_BASE_URL}/expense/branch-employees`,
                          {
                            employee_name: employee_name.trim(),
                            employee_id: employee_id.trim(),
                            employee_uid: employeeForm.employee_uid.trim() || null,
                            designation: designation.trim(),
                          },
                          { params: { branch_code: branchCode, created_by: user?.name || 'System' } }
                        );
                        toast.success('Employee added successfully!');
                        setEmployeeForm({ employee_name: '', employee_id: '', employee_uid: '', designation: '' });
                        fetchBranchEmployees(branchCode); // refresh list
                      } catch (err) {
                        toast.error(err.response?.data?.detail || 'Failed to add employee');
                      } finally {
                        setAddingEmployee(false);
                      }
                    }}
                    disabled={addingEmployee}
                    className="px-5 py-2 text-white text-xs font-semibold rounded-lg disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                  >
                    {addingEmployee ? (
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                    {addingEmployee ? 'Adding...' : 'Add Employee'}
                  </button>
                </div>
              </div>

              {/* Employee Records Table - scrollable, fixed height */}
              <div className="flex flex-col shrink-0" style={{ height: '260px' }}>

                {/* Table header label */}
                <div
                  className="px-4 py-2 flex items-center justify-between shrink-0"
                  style={{ backgroundColor: 'rgba(64, 96, 147, 0.08)' }}
                >
                  <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">
                    Branch Employees
                  </span>
                  {loadingBranchEmployees ? (
                    <svg className="animate-spin h-3 w-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: themeColor }}
                    >
                      {branchEmployees.length} record{branchEmployees.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="overflow-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
                  {loadingBranchEmployees ? (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400">
                      Loading employees...
                    </div>
                  ) : branchEmployees.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400 italic">
                      No employees added yet for this branch.
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left" style={{ minWidth: '500px' }}>
                      <thead className="sticky top-0 z-10">
                        <tr style={{ backgroundColor: '#f0f1ff' }}>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-600 uppercase tracking-wide border-b border-gray-200 text-center w-10">Sr.</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-600 uppercase tracking-wide border-b border-gray-200">Name</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-600 uppercase tracking-wide border-b border-gray-200">Employee ID</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-600 uppercase tracking-wide border-b border-gray-200">UID</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-600 uppercase tracking-wide border-b border-gray-200">Designation</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-600 uppercase tracking-wide border-b border-gray-200 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branchEmployees.map((emp, idx) => {
                          const isEditing = editingEmployee?.id === emp.id;
                          const isSaving = savingEmployeeId === emp.id;
                          return (
                            <tr
                              key={emp.id}
                              className="transition-colors"
                              style={{
                                borderBottom: '1px solid #f0f0f0',
                                backgroundColor: isEditing ? '#fffbeb' : 'transparent',
                              }}
                            >
                              <td className="px-3 py-2 text-[11px] text-gray-500 text-center font-medium">
                                {idx + 1}
                              </td>

                              {/* Name */}
                              <td className="px-2 py-1.5 text-[11px]">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingEmployee.employee_name}
                                    onChange={e => setEditingEmployee(prev => ({ ...prev, employee_name: e.target.value }))}
                                    className="w-full px-2 py-1 border border-yellow-400 rounded text-[11px] focus:outline-none focus:ring-1"
                                  />
                                ) : (
                                  <span className="font-semibold text-gray-800">{emp.employee_name}</span>
                                )}
                              </td>

                              <td className="px-2 py-1.5 text-[11px]">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingEmployee.employee_id}
                                    onChange={e => setEditingEmployee(prev => ({ ...prev, employee_id: e.target.value }))}
                                    className="w-full px-2 py-1 border border-yellow-400 rounded text-[11px] font-mono focus:outline-none focus:ring-1"
                                  />
                                ) : (
                                  <span className="text-gray-600 font-mono">{emp.employee_id}</span>
                                )}
                              </td>

                              <td className="px-2 py-1.5 text-[11px]">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingEmployee.employee_uid || ''}
                                    onChange={e => setEditingEmployee(prev => ({ ...prev, employee_uid: e.target.value }))}
                                    placeholder="UID (optional)"
                                    className="w-full px-2 py-1 border border-yellow-400 rounded text-[11px] font-mono focus:outline-none focus:ring-1"
                                  />
                                ) : (
                                  <span className="text-gray-500 font-mono">{emp.employee_uid || '-'}</span>
                                )}
                              </td>

                              {/* Designation */}
                              <td className="px-2 py-1.5 text-[11px]">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingEmployee.designation}
                                    onChange={e => setEditingEmployee(prev => ({ ...prev, designation: e.target.value }))}
                                    className="w-full px-2 py-1 border border-yellow-400 rounded text-[11px] focus:outline-none focus:ring-1"
                                  />
                                ) : (
                                  <span className="text-gray-600">{emp.designation}</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="px-2 py-1.5 text-center">
                                {isSaving ? (
                                  <svg className="animate-spin h-4 w-4 mx-auto text-blue-500" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                ) : isEditing ? (
                                  <div className="flex items-center justify-center gap-2">
                                    {/* Save */}
                                    <button
                                      onClick={async () => {
                                        if (!editingEmployee.employee_name.trim() || !editingEmployee.employee_id.trim() || !editingEmployee.designation.trim()) {
                                          toast.error('All fields are required');
                                          return;
                                        }
                                        setSavingEmployeeId(emp.id);
                                        try {
                                          await axios.put(
                                            `${API_BASE_URL}/expense/branch-employees/${emp.id}`,
                                            {
                                              employee_name: editingEmployee.employee_name.trim(),
                                              employee_id: editingEmployee.employee_id.trim(),
                                              employee_uid: editingEmployee.employee_uid?.trim() || null,
                                              designation: editingEmployee.designation.trim(),
                                            },
                                            { params: { updated_by: user?.name || 'System' } }
                                          );
                                          toast.success('Employee updated!');
                                          setEditingEmployee(null);
                                          const branchCode = selectedBranchForSummary?.branch_code || user?.branch;
                                          fetchBranchEmployees(branchCode);
                                        } catch (err) {
                                          toast.error(err.response?.data?.detail || 'Failed to update');
                                        } finally {
                                          setSavingEmployeeId(null);
                                        }
                                      }}
                                      title="Save"
                                      className="p-1 rounded text-green-600 hover:bg-green-50"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </button>
                                    {/* Cancel */}
                                    <button
                                      onClick={() => setEditingEmployee(null)}
                                      title="Cancel"
                                      className="p-1 rounded text-gray-500 hover:bg-gray-100"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-2">
                                    {/* Edit */}
                                    <button
                                      onClick={() => setEditingEmployee({
                                        id: emp.id,
                                        employee_name: emp.employee_name,
                                        employee_id: emp.employee_id,
                                        employee_uid: emp.employee_uid || '',
                                        designation: emp.designation,
                                      })}
                                      title="Edit"
                                      className="p-1 rounded text-blue-600 hover:bg-blue-50"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    {/* Delete */}
                                    <button
                                      onClick={async () => {
                                        const result = await Swal.fire({
                                          title: 'Delete Employee?',
                                          html: `Remove <strong>${emp.employee_name}</strong> from this branch?`,
                                          icon: 'warning',
                                          showCancelButton: true,
                                          confirmButtonColor: '#d33',
                                          cancelButtonColor: '#6b7280',
                                          confirmButtonText: 'Yes, delete',
                                          reverseButtons: true,
                                        });
                                        if (!result.isConfirmed) return;
                                        setSavingEmployeeId(emp.id);
                                        try {
                                          await axios.delete(
                                            `${API_BASE_URL}/expense/branch-employees/${emp.id}`,
                                            { params: { updated_by: user?.name || 'System' } }
                                          );
                                          toast.success('Employee removed!');
                                          const branchCode = selectedBranchForSummary?.branch_code || user?.branch;
                                          fetchBranchEmployees(branchCode);
                                        } catch (err) {
                                          toast.error(err.response?.data?.detail || 'Failed to delete');
                                        } finally {
                                          setSavingEmployeeId(null);
                                        }
                                      }}
                                      title="Delete"
                                      className="p-1 rounded text-red-600 hover:bg-red-50"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Imprest Amount Modal */}
        {showImprestModal && (
          <ImprestModal
            branches={imprestBranches}
            loading={imprestLoading}
            saving={imprestSaving}
            onClose={closeImprestModal}
            onAddEntry={addImprestEntry}
            onRemoveEntry={removeImprestEntry}
            onUpdateEntry={updateImprestEntry}
            onSaveAll={saveImprestAll}
            themeColor={themeColor}
            themeDark={themeShades.dark}
          />
        )}

        {/* Expense Head Modal */}
        {showExpenseHeadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden">
              <div className="sticky top-0 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center" style={{ background: themeColor }}>
                <h2 className="text-sm sm:text-base font-semibold text-white">Manage Expense Heads</h2>
                <button onClick={() => setShowExpenseHeadModal(false)} className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
                <div className="mb-6 p-3 sm:p-4 rounded-lg" style={{ backgroundColor: themeShades.light }}>
                  <h3 className="text-[11px] sm:text-xs font-semibold text-black mb-2 sm:mb-3">Add New Expense Head</h3>
                  <div className="flex gap-2"><input type="text" value={newExpenseHead} onChange={(e) => setNewExpenseHead(e.target.value)} onKeyPress={(e) => handleKeyPress(e, addExpenseHead)} placeholder="Enter expense head name" className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 border rounded-lg text-[11px] sm:text-xs focus:outline-none focus:ring-2 transition-all text-black" style={{ borderColor: '#D1D5DB' }} /><button onClick={addExpenseHead} disabled={addingHead || !newExpenseHead.trim()} className="px-3 sm:px-4 py-1.5 sm:py-2 text-white text-[11px] sm:text-xs font-medium rounded-lg transition-all disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>{addingHead ? 'Adding...' : 'Add Head'}</button></div>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  {expenseHeads.map((head) => (
                    <div key={head.id} className="border rounded-lg overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
                      <div className="px-3 sm:px-4 py-2 sm:py-3 flex justify-between items-center" style={{ backgroundColor: themeShades.light }}>
                        {editingHead?.id === head.id ? (
                          <div className="flex-1 flex gap-2"><input type="text" value={editingHead.name} onChange={(e) => setEditingHead({ ...editingHead, name: e.target.value })} onKeyPress={(e) => handleKeyPress(e, () => updateExpenseHead(head.id))} className="flex-1 px-2 sm:px-3 py-1 border rounded-lg text-[11px] sm:text-xs focus:outline-none focus:ring-2" autoFocus /><button onClick={() => updateExpenseHead(head.id)} className="p-1 text-green-600 hover:text-green-800"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button><button onClick={() => setEditingHead(null)} className="p-1 text-gray-600 hover:text-gray-800"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                        ) : (<><h3 className="text-[11px] sm:text-xs font-semibold text-black">{head.name}</h3><div className="flex gap-2"><button onClick={() => setEditingHead({ id: head.id, name: head.name })} className="p-1 text-blue-600 hover:text-blue-800"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button><button onClick={() => deleteExpenseHead(head.id)} className="p-1 text-red-600 hover:text-red-800"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></>)}
                      </div>
                      <div className="px-3 sm:px-4 py-2 sm:py-3"><h4 className="text-[10px] sm:text-xs font-medium text-black mb-2">Subheads:</h4>{head.subheads && head.subheads.length > 0 && (<div className="space-y-1.5 mb-3">{head.subheads.map((subhead) => (<div key={subhead.id} className="flex justify-between items-center pl-3 border-l-2" style={{ borderColor: themeShades.medium }}>{editingSubhead?.headId === head.id && editingSubhead?.subheadId === subhead.id ? (<div className="flex-1 flex gap-2"><input type="text" value={editingSubhead.newName} onChange={(e) => setEditingSubhead({ ...editingSubhead, newName: e.target.value })} onKeyPress={(e) => handleKeyPress(e, () => updateSubhead(head.id, subhead.id, editingSubhead.newName))} className="flex-1 px-2 py-0.5 border rounded text-[10px] sm:text-xs focus:outline-none focus:ring-2" autoFocus /><button onClick={() => updateSubhead(head.id, subhead.id, editingSubhead.newName)} className="text-green-600"><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button><button onClick={() => setEditingSubhead(null)} className="text-gray-600"><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>) : (<><span className="text-[10px] sm:text-xs text-black">{subhead.name}</span><div className="flex gap-1"><button onClick={() => setEditingSubhead({ headId: head.id, subheadId: subhead.id, newName: subhead.name })} className="p-0.5 text-blue-600 hover:text-blue-800"><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button><button onClick={() => deleteSubhead(head.id, subhead.id)} className="p-0.5 text-red-600 hover:text-red-800"><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></>)}</div>))}</div>)}<div className="flex gap-2 mt-2"><input type="text" value={subheadInputs[head.id] || ''} onChange={(e) => setSubheadInputs(prev => ({ ...prev, [head.id]: e.target.value }))} onKeyPress={(e) => handleKeyPress(e, () => addSubhead(head.id))} placeholder="Add new subhead..." className="flex-1 px-2 sm:px-3 py-1 border rounded-lg text-[10px] sm:text-xs focus:outline-none focus:ring-2" style={{ borderColor: '#D1D5DB' }} /><button onClick={() => addSubhead(head.id)} disabled={!subheadInputs[head.id]?.trim() || addingSubheadForId === head.id} className="px-2 py-1 text-white text-[10px] font-medium rounded-lg disabled:opacity-50 whitespace-nowrap" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>{addingSubheadForId === head.id ? 'Adding...' : 'Add Subhead'}</button></div></div>
                    </div>
                  ))}
                  {expenseHeads.length === 0 && (<div className="text-center py-6 sm:py-8 text-black text-[11px] sm:text-xs">No expense heads added yet. Add your first expense head above.</div>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {showDayLimitsModal && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => !savingDayLimits && setShowDayLimitsModal(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: '10px', width: '90%', maxWidth: '780px',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }}
            >
              {/* Header */}
              <div style={{
                background: themeColor, color: '#fff', padding: '12px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px' }}>Branch Old Upload Day Limits</span>
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                    background: 'rgba(255,255,255,0.2)',
                  }}>
                    {Object.keys(dayLimits).length} branches
                  </span>
                </div>
                <button
                  onClick={() => setShowDayLimitsModal(false)}
                  disabled={savingDayLimits}
                  style={{
                    background: '#fff', color: '#444', border: 'none', borderRadius: '6px',
                    width: '26px', height: '26px', cursor: 'pointer', fontSize: '14px',
                  }}
                >✕</button>
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loadingDayLimits ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading…</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f0f1ff', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '8px 10px', fontWeight: 500, color: '#555', borderBottom: '1px solid #ddd', fontSize: '12px', width: '36px' }}>Sr.No</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500, color: '#555', borderBottom: '1px solid #ddd', fontSize: '12px' }}>Branch</th>
                        <th style={{ padding: '8px 10px', fontWeight: 500, color: '#555', borderBottom: '1px solid #ddd', fontSize: '12px', width: '110px' }}>TADA (days)</th>
                        <th style={{ padding: '8px 10px', fontWeight: 500, color: '#555', borderBottom: '1px solid #ddd', fontSize: '12px', width: '130px' }}>Office Exp. (days)</th>
                        <th style={{ padding: '8px 10px', fontWeight: 500, color: '#555', borderBottom: '1px solid #ddd', fontSize: '12px', width: '110px' }}>LVB (days)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BRANCH_ORDER.map((code, idx) => {
                        const cur = dayLimits[code] || { tada_days: 30, office_expense_days: 30, lvb_days: 30 };
                        const orig = originalDayLimits[code] || {};
                        const tadaMod = cur.tada_days !== orig.tada_days;
                        const oeMod = cur.office_expense_days !== orig.office_expense_days;
                        const lvbMod = cur.lvb_days !== orig.lvb_days;
                        const rowMod = tadaMod || oeMod || lvbMod;

                        const inputStyle = (mod) => ({
                          width: '70px', padding: '4px 6px', textAlign: 'center',
                          border: `1px solid ${mod ? '#f59e0b' : '#ccc'}`,
                          borderRadius: '4px', fontSize: '13px',
                        });

                        return (
                          <tr key={code} style={{
                            borderBottom: '1px solid #eee',
                            background: rowMod ? '#fffbeb' : 'transparent',
                          }}>
                            <td style={{ padding: '6px 10px', textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <div style={{ fontWeight: 500 }}>{branchMap[code] || code}</div>
                              <div style={{ fontSize: '11px', color: '#999' }}>{code}</div>
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              <input type="number" min="1" max="3650"
                                value={cur.tada_days}
                                onChange={e => handleDayLimitChange(code, 'tada_days', e.target.value)}
                                style={inputStyle(tadaMod)} />
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              <input type="number" min="1" max="3650"
                                value={cur.office_expense_days}
                                onChange={e => handleDayLimitChange(code, 'office_expense_days', e.target.value)}
                                style={inputStyle(oeMod)} />
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              <input type="number" min="1" max="3650"
                                value={cur.lvb_days}
                                onChange={e => handleDayLimitChange(code, 'lvb_days', e.target.value)}
                                style={inputStyle(lvbMod)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div style={{
                padding: '12px 18px', borderTop: '1px solid #eee', background: '#fafafa',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {hasDayLimitChanges() ? (
                    <><span style={{ color: '#f59e0b', fontWeight: 600 }}>● </span>
                      {countDayLimitChanges()} branch{countDayLimitChanges() === 1 ? '' : 'es'} modified</>
                  ) : 'No changes'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowDayLimitsModal(false)}
                    disabled={savingDayLimits}
                    style={{
                      padding: '7px 16px', fontSize: '12px',
                      border: '1px solid #ccc', borderRadius: '6px',
                      background: '#fff', cursor: 'pointer',
                    }}
                  >Cancel</button>
                  <button
                    onClick={saveDayLimits}
                    disabled={savingDayLimits || !hasDayLimitChanges()}
                    style={{
                      padding: '7px 16px', fontSize: '12px', color: '#fff',
                      border: 'none', borderRadius: '6px', fontWeight: 500,
                      background: hasDayLimitChanges() && !savingDayLimits
                        ? `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`
                        : '#aaa',
                      cursor: hasDayLimitChanges() && !savingDayLimits ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {savingDayLimits ? 'Saving…' : 'Save All Limits'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showSubmitLimitsModal && (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => !savingSubmitLimits && setShowSubmitLimitsModal(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: '10px', width: '95%', maxWidth: '1100px',
                maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }}
            >
              {/* Header */}
              <div style={{
                background: '#059669', color: '#fff', padding: '12px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px' }}>Branch Data Submit Day Rules</span>
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '999px',
                    background: 'rgba(255,255,255,0.2)',
                  }}>
                    {Object.keys(submitLimits).length} branches
                  </span>
                </div>
                <button
                  onClick={() => setShowSubmitLimitsModal(false)}
                  disabled={savingSubmitLimits}
                  style={{
                    background: '#fff', color: '#444', border: 'none', borderRadius: '6px',
                    width: '26px', height: '26px', cursor: 'pointer', fontSize: '14px',
                  }}
                >✕</button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
                {loadingSubmitLimits ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading…</div>
                ) : (
                  BRANCH_ORDER.map((code, idx) => {
                    const cur = submitLimits[code] || { rule_type: 'month_dates', allowed_values: [] };
                    const orig = originalSubmitLimits[code];
                    const mod = !orig
                      || cur.rule_type !== orig.rule_type
                      || (cur.allowed_values || []).join(',') !== (orig.allowed_values || []).join(',');

                    return (
                      <div key={code} style={{
                        border: `1px solid ${mod ? '#f59e0b' : '#e5e7eb'}`,
                        background: mod ? '#fffbeb' : '#fff',
                        borderRadius: '8px', padding: '10px 12px', marginBottom: '8px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{idx + 1}. {branchMap[code] || code}</span>
                            <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>({code})</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleSubmitRuleTypeChange(code, 'weekdays')}
                              style={{
                                padding: '4px 10px', fontSize: '11px', borderRadius: '5px',
                                border: `1px solid ${cur.rule_type === 'weekdays' ? '#059669' : '#ccc'}`,
                                background: cur.rule_type === 'weekdays' ? '#059669' : '#fff',
                                color: cur.rule_type === 'weekdays' ? '#fff' : '#444',
                                cursor: 'pointer', fontWeight: 500,
                              }}
                            >Weekdays</button>
                            <button
                              onClick={() => handleSubmitRuleTypeChange(code, 'month_dates')}
                              style={{
                                padding: '4px 10px', fontSize: '11px', borderRadius: '5px',
                                border: `1px solid ${cur.rule_type === 'month_dates' ? '#059669' : '#ccc'}`,
                                background: cur.rule_type === 'month_dates' ? '#059669' : '#fff',
                                color: cur.rule_type === 'month_dates' ? '#fff' : '#444',
                                cursor: 'pointer', fontWeight: 500,
                              }}
                            >Month Dates</button>
                          </div>
                        </div>

                        {cur.rule_type === 'weekdays' ? (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {[
                              { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
                              { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
                            ].map(d => {
                              const on = cur.allowed_values.includes(d.v);
                              return (
                                <button
                                  key={d.v}
                                  onClick={() => toggleSubmitValue(code, d.v)}
                                  style={{
                                    padding: '5px 12px', fontSize: '11px', borderRadius: '5px',
                                    border: `1px solid ${on ? '#059669' : '#ccc'}`,
                                    background: on ? '#059669' : '#fff',
                                    color: on ? '#fff' : '#444',
                                    cursor: 'pointer', fontWeight: 500, minWidth: '46px',
                                  }}
                                >{d.l}</button>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))', gap: '4px' }}>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                              const on = cur.allowed_values.includes(d);
                              return (
                                <button
                                  key={d}
                                  onClick={() => toggleSubmitValue(code, d)}
                                  style={{
                                    padding: '4px 0', fontSize: '11px', borderRadius: '4px',
                                    border: `1px solid ${on ? '#059669' : '#ddd'}`,
                                    background: on ? '#059669' : '#fff',
                                    color: on ? '#fff' : '#666',
                                    cursor: 'pointer', fontWeight: on ? 600 : 400,
                                  }}
                                >{d}</button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div style={{
                padding: '12px 18px', borderTop: '1px solid #eee', background: '#fafafa',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {hasSubmitLimitChanges() ? (
                    <><span style={{ color: '#f59e0b', fontWeight: 600 }}>● </span>
                      {countSubmitLimitChanges()} branch{countSubmitLimitChanges() === 1 ? '' : 'es'} modified</>
                  ) : 'No changes'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowSubmitLimitsModal(false)}
                    disabled={savingSubmitLimits}
                    style={{
                      padding: '7px 16px', fontSize: '12px',
                      border: '1px solid #ccc', borderRadius: '6px',
                      background: '#fff', cursor: 'pointer',
                    }}
                  >Cancel</button>
                  <button
                    onClick={saveSubmitLimits}
                    disabled={savingSubmitLimits || !hasSubmitLimitChanges()}
                    style={{
                      padding: '7px 16px', fontSize: '12px', color: '#fff',
                      border: 'none', borderRadius: '6px', fontWeight: 500,
                      background: hasSubmitLimitChanges() && !savingSubmitLimits
                        ? 'linear-gradient(135deg, #059669, #047857)'
                        : '#aaa',
                      cursor: hasSubmitLimitChanges() && !savingSubmitLimits ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {savingSubmitLimits ? 'Saving…' : 'Save All Rules'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Excel-style column filter dropdown — rendered at root for proper z-index */}
      {
        activeColumnFilter && (
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
              label={activeColumnFilter.label || 'Task Status'}
            />
          </>
        )
      }

      <style>{`
        .overflow-auto::-webkit-scrollbar,
        .overflow-x-auto::-webkit-scrollbar { width: 6px; height: 9px; }
        .overflow-auto::-webkit-scrollbar-track,
        .overflow-x-auto::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .overflow-auto::-webkit-scrollbar-thumb,
        .overflow-x-auto::-webkit-scrollbar-thumb { background: #a5b4fc; border-radius: 4px; }
        .overflow-auto::-webkit-scrollbar-thumb:hover,
        .overflow-x-auto::-webkit-scrollbar-thumb:hover { background: #6366f1; }
        .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        td[title]:hover { cursor: help; }
        tbody tr { height: 32px; }
        th, td { vertical-align: middle; }
      `}</style>
    </div >
  );
};

export default HOExpense;