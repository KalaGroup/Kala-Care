import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Swal from 'sweetalert2';

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
  { key: 'sr_reach_at_site_datetime', label: 'SR Reach at Site Date & Time', width: 110 },
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

const DEFAULT_COL_ORDER = ALL_COLUMNS.map(c => c.key);
const COL_MAP = Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c]));

const exportToExcel = (data, filename, headers) => {
  // Build HTML table string that Excel can open natively
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  const headerRow = headers.map(h => `<th style="background:#2f3192;color:#fff;font-weight:bold;padding:4px 8px;border:1px solid #ccc;">${escape(h.label)}</th>`).join('');
  const bodyRows = data.map(row =>
    `<tr>${headers.map(h => `<td style="padding:4px 8px;border:1px solid #ddd;">${escape(row[h.key])}</td>`).join('')}</tr>`
  ).join('');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
    <body><table>${`<tr>${headerRow}</tr>`}${bodyRows}</table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
  const [lvbTab, setLvbTab] = useState('pending'); // 'pending' | 'verified'

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
  const [oeHistoryPeriodsBranch, setOeHistoryPeriodsBranch] = useState('');

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

  // OE history — periods tab
  const [oeHistoryTab, setOeHistoryTab] = useState('all');
  const [oeHistoryGrouped, setOeHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingOEHistoryGrouped, setLoadingOEHistoryGrouped] = useState(false);
  const [oeSelectedPeriod, setOeSelectedPeriod] = useState(null);
  const [oePaidDateEdits, setOePaidDateEdits] = useState({});
  const [oePaidDateSaving, setOePaidDateSaving] = useState({});
  const [oePaidDateTimers, setOePaidDateTimers] = useState({});
  const [oePeriodPaidInputs, setOePeriodPaidInputs] = useState({});
  const [oePeriodPaidApplying, setOePeriodPaidApplying] = useState({});

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
  const [billWisePeriodRecords, setBillWisePeriodRecords] = useState([]);
  const [loadingBillWisePeriodRecords, setLoadingBillWisePeriodRecords] = useState(false);
  const [billWiseVerificationStatus, setBillWiseVerificationStatus] = useState({});
  const [billWiseSavingStates, setBillWiseSavingStates] = useState({});
  const [submittingBillWiseToHistory, setSubmittingBillWiseToHistory] = useState(false);

  // Loading states for KM and Expense
  const [loadingKMRates, setLoadingKMRates] = useState(false);
  const [addingHead, setAddingHead] = useState(false);
  const [addingSubheadForId, setAddingSubheadForId] = useState(null);
  const oeTableContainerRef = useRef(null);
  const oeTopScrollBarRef = useRef(null);

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

  // Local Vendor Bills states
  const [lvbBills, setLvbBills] = useState([]);
  const [loadingLvbBills, setLoadingLvbBills] = useState(false);
  const [lvbVerificationStatus, setLvbVerificationStatus] = useState({});
  const [lvbSelectAll, setLvbSelectAll] = useState(false);
  const [lvbBulkVerifying, setLvbBulkVerifying] = useState(false);
  const [submittingLvbToHistory, setSubmittingLvbToHistory] = useState(false);
  const [selectedBranchLvb, setSelectedBranchLvb] = useState('');
  const [lvbMainDateFrom, setLvbMainDateFrom] = useState('');
  const [lvbMainDateTo, setLvbMainDateTo] = useState('');
  const [showLvbHistoryModal, setShowLvbHistoryModal] = useState(false);
  const [lvbHistoryRecords, setLvbHistoryRecords] = useState([]);
  const [loadingLvbHistory, setLoadingLvbHistory] = useState(false);
  const [lvbHistorySearch, setLvbHistorySearch] = useState('');
  const [lvbHistoryDateFrom, setLvbHistoryDateFrom] = useState('');
  const [lvbHistoryDateTo, setLvbHistoryDateTo] = useState('');
  const [lvbHistoryInvoiceDateFrom, setLvbHistoryInvoiceDateFrom] = useState('');
  const [lvbHistoryInvoiceDateTo, setLvbHistoryInvoiceDateTo] = useState('');
  const [lvbHistoryBranch, setLvbHistoryBranch] = useState('');

  // LVB history — periods tab
  const [lvbHistoryTab, setLvbHistoryTab] = useState('all');
  const [lvbHistoryGrouped, setLvbHistoryGrouped] = useState({ rule_type: '', period_days: 0, groups: [] });
  const [loadingLvbHistoryGrouped, setLoadingLvbHistoryGrouped] = useState(false);
  const [lvbSelectedPeriod, setLvbSelectedPeriod] = useState(null);
  const [lvbPaidDateEdits, setLvbPaidDateEdits] = useState({});
  const [lvbPaidDateSaving, setLvbPaidDateSaving] = useState({});
  const [lvbPaidDateTimers, setLvbPaidDateTimers] = useState({});
  const [lvbPeriodPaidInputs, setLvbPeriodPaidInputs] = useState({});
  const [lvbPeriodPaidApplying, setLvbPeriodPaidApplying] = useState({});
  const [lvbHistoryPeriodsBranch, setLvbHistoryPeriodsBranch] = useState('');

  // State for KM rates
  const [kmRates, setKmRates] = useState({});
  const [originalKmRates, setOriginalKmRates] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const [showVendorListModal, setShowVendorListModal] = useState(false);
  const [vendorList, setVendorList] = useState([]);
  const [loadingVendorList, setLoadingVendorList] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const lvbTableContainerRef = useRef(null);
  const lvbTopScrollBarRef = useRef(null);
  const lvbTableRef = useRef(null);

  const [dynamicDAAmounts, setDynamicDAAmounts] = useState({});
  const [dynamicTotalAmounts, setDynamicTotalAmounts] = useState({});
  const [localDAAmounts, setLocalDAAmounts] = useState({});

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

  // Office Expense HO states
  const [hoOfficeExpenses, setHoOfficeExpenses] = useState([]);
  const [loadingHoOfficeExpenses, setLoadingHoOfficeExpenses] = useState(false);
  const [hoOEVerificationStatus, setHoOEVerificationStatus] = useState({});
  const [hoOESelectAll, setHoOESelectAll] = useState(false);
  const [submittingOEToHistory, setSubmittingOEToHistory] = useState(false);
  const [showOEHistoryModal, setShowOEHistoryModal] = useState(false);
  const [oeHistoryRecords, setOeHistoryRecords] = useState([]);
  const [loadingOEHistory, setLoadingOEHistory] = useState(false);
  const [oeTab, setOeTab] = useState('pending'); // 'pending' | 'verified'
  const [oeHistorySearch, setOeHistorySearch] = useState('');
  const [oeHistoryDateFrom, setOeHistoryDateFrom] = useState('');
  const [oeHistoryDateTo, setOeHistoryDateTo] = useState('');
  const [oeHistoryPaidDateFrom, setOeHistoryPaidDateFrom] = useState('');
  const [oeHistoryPaidDateTo, setOeHistoryPaidDateTo] = useState('');
  const [oeHistoryBranch, setOeHistoryBranch] = useState('');
  const [selectedBranchOE, setSelectedBranchOE] = useState('');
  const [oeMainDateFrom, setOeMainDateFrom] = useState('');
  const [oeMainDateTo, setOeMainDateTo] = useState('');
  const [hoOEBulkVerifying, setHoOEBulkVerifying] = useState(false);
  const oeTableRef = useRef(null);

  const [loadingMoveToHistory, setLoadingMoveToHistory] = useState(false);
  // Table States
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('hoExpense_col_order');
      if (saved && Array.isArray(JSON.parse(saved))) {
        return JSON.parse(saved);
      }
    } catch { }
    return DEFAULT_COL_ORDER;
  });

  const tableContainerRef = useRef(null);
  const topScrollBarRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('hoExpense_col_order', JSON.stringify(columnOrder));
  }, [columnOrder]);

  // Reset local states only when ENGINEER changes (not when records merely refresh)
  useEffect(() => {
    if (engineerRecords.length > 0) {
      const initialKMs = {};
      const initialRemarks = {};
      const initialVerification = {};
      const initialDAs = {};
      engineerRecords.forEach(record => {
        initialKMs[record.id] = record.ho_corrected_km || '';
        initialRemarks[record.id] = record.ho_remark || '';
        initialVerification[record.id] = record.verification_status === 'Verified';
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
        newTotal = ((effectiveKM * branchRate.km_rate) + parseFloat(value)).toFixed(2);
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
            sales_count: 0,
            km_wise_count: 0,
            bill_wise_count: 0,
          });
        } else {
          sortedBranches.push({
            sr_no: index + 1,
            branch_code: branchCode,
            branch_name: branchMap[branchCode],
            branch_manager: 'Not Assigned',
            engineer_count: 0,
            sales_count: 0,
            km_wise_count: 0,
            bill_wise_count: 0,
          });
        }
      });

      // Fetch counts from Sales, KM Wise, Bill Wise tables in parallel
      const countPromises = sortedBranches.map(async (branch) => {
        try {
          const [salesRes, kmWiseRes, billWiseRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/tada-sales/branch-summary`, {
              params: { branch_code: branch.branch_code }
            }).catch(() => ({ data: { groups: [] } })),
            axios.get(`${API_BASE_URL}/tada-km-wise/branch-summary`, {
              params: { branch_code: branch.branch_code }
            }).catch(() => ({ data: { groups: [] } })),
            axios.get(`${API_BASE_URL}/tada-bill-wise/branch-summary`, {
              params: { branch_code: branch.branch_code }
            }).catch(() => ({ data: { groups: [] } })),
          ]);

          const salesCount = (salesRes.data?.groups || []).reduce((s, g) => s + (g.record_count || 0), 0);
          const kmWiseCount = (kmWiseRes.data?.groups || []).reduce((s, g) => s + (g.record_count || 0), 0);
          const billWiseCount = (billWiseRes.data?.groups || []).reduce((s, g) => s + (g.record_count || 0), 0);

          return {
            branch_code: branch.branch_code,
            sales_count: salesCount,
            km_wise_count: kmWiseCount,
            bill_wise_count: billWiseCount,
          };
        } catch {
          return {
            branch_code: branch.branch_code,
            sales_count: 0,
            km_wise_count: 0,
            bill_wise_count: 0,
          };
        }
      });

      const counts = await Promise.all(countPromises);
      const countsMap = {};
      counts.forEach(c => { countsMap[c.branch_code] = c; });

      const enrichedBranches = sortedBranches.map(b => ({
        ...b,
        sales_count: countsMap[b.branch_code]?.sales_count || 0,
        km_wise_count: countsMap[b.branch_code]?.km_wise_count || 0,
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
      total += (effectiveKM * rate.km_rate) + da;
    });
    return total;
  };

  const loadEngineersSummary = async (branch) => {
    setLoadingEngineerSummary(true);
    setSelectedBranchForSummary(branch);
    setSelectedEngineerDetail(null);
    setEngineerRecords([]);
    setEngineerCalculatedTotals({});
    setSelectedSalesPeriod(null);
    setSalesPeriodRecords([]);
    setSelectedKmWisePeriod(null);
    setKmWisePeriodRecords([]);
    setSelectedBillWisePeriod(null);
    setBillWisePeriodRecords([]);
    loadBranchSalesSummary(branch); // load sales summary in parallel
    loadBranchKmWiseSummary(branch); // load KM Wise summary in parallel
    loadBranchBillWiseSummary(branch); // load Bill Wise summary in parallel
    try {
      const response = await axios.get(`${API_BASE_URL}/tada-ho/branch-engineers-summary`, {
        params: { branch_code: branch.branch_code }
      });
      setEngineerSummary(response.data);

      // Fetch each engineer's records in parallel and calculate dynamic total
      setLoadingCalculatedTotals(true);
      const totalsPromises = response.data.map(eng =>
        axios.get(`${API_BASE_URL}/tada-ho/engineer-records`, {
          params: { engineer_uid: eng.engineer_uid, branch_code: branch.branch_code }
        })
          .then(res => ({ uid: eng.engineer_uid, total: calculateTotalForRecords(res.data) }))
          .catch(() => ({ uid: eng.engineer_uid, total: 0 }))
      );
      const results = await Promise.all(totalsPromises);
      const totalsMap = {};
      results.forEach(({ uid, total }) => { totalsMap[uid] = total; });
      setEngineerCalculatedTotals(totalsMap);
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
      const res = await axios.get(`${API_BASE_URL}/tada-bill-wise/branch-summary`, {
        params: { branch_code: branch.branch_code },
      });
      setBranchBillWiseSummary(res.data || { rule_type: '', groups: [] });
    } catch (e) {
      console.error(e);
      setBranchBillWiseSummary({ rule_type: '', groups: [] });
    } finally {
      setLoadingBillWiseSummary(false);
    }
  };

  const loadBillWisePeriodRecords = async (group) => {
    setLoadingBillWisePeriodRecords(true);
    setSelectedBillWisePeriod(group);
    try {
      const res = await axios.get(`${API_BASE_URL}/tada-bill-wise/branch-records`, {
        params: {
          branch_code: selectedBranchForSummary.branch_code,
          period_start: group.period_start,
          period_end: group.period_end,
          engineer_name: group.engineer_name,
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
      const records = response.data || [];
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

  const handleBackToBranches = () => {
    setSelectedBranchForSummary(null);
    setEngineerSummary([]);
    setSelectedEngineerDetail(null);
    setEngineerRecords([]);
    setBranchSalesSummary({ rule_type: '', groups: [] });
    setSelectedSalesPeriod(null);
    setSalesPeriodRecords([]);
    setBranchKmWiseSummary({ rule_type: '', groups: [] });
    setSelectedKmWisePeriod(null);
    setKmWisePeriodRecords([]);
    setBranchBillWiseSummary({ rule_type: '', groups: [] });
    setSelectedBillWisePeriod(null);
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

  const loadBranchHistory = async (branch) => {
    setLoadingHistory(true);
    setLoadingHistoryGrouped(true);
    setLoadingSalesHistory(true);
    setLoadingSalesHistoryGrouped(true);
    setLoadingKmWiseHistory(true);
    setLoadingKmWiseHistoryGrouped(true);
    setLoadingBillWiseHistory(true);
    setLoadingBillWiseHistoryGrouped(true);
    setHistoryBranch(branch);
    setShowHistoryModal(true);
    setHistoryMainTab('all');
    setHistoryTab('periods');
    setSalesHistoryTab('periods');
    setKmWiseHistoryTab('periods');
    setBillWiseHistoryTab('periods');
    setSelectedPeriod(null);
    setSalesSelectedPeriod(null);
    setKmWiseSelectedPeriod(null);
    setBillWiseSelectedPeriod(null);
    try {
      const [
        allRes, groupedRes,
        salesAllRes, salesGroupedRes,
        kmAllRes, kmGroupedRes,
        billAllRes, billGroupedRes,
      ] = await Promise.all([
        axios.get(`${API_BASE_URL}/tada-ho/branch-history`, { params: { branch_code: branch.branch_code } }),
        axios.get(`${API_BASE_URL}/tada-ho/branch-history-grouped`, { params: { branch_code: branch.branch_code } }),
        axios.get(`${API_BASE_URL}/tada-sales/history`, { params: { branch_code: branch.branch_code } }),
        axios.get(`${API_BASE_URL}/tada-sales/history/grouped`, { params: { branch_code: branch.branch_code } }),
        axios.get(`${API_BASE_URL}/tada-km-wise/history`, { params: { branch_code: branch.branch_code } }),
        axios.get(`${API_BASE_URL}/tada-km-wise/history/grouped`, { params: { branch_code: branch.branch_code } }),
        axios.get(`${API_BASE_URL}/tada-bill-wise/history`, { params: { branch_code: branch.branch_code } }),
        axios.get(`${API_BASE_URL}/tada-bill-wise/history/grouped`, { params: { branch_code: branch.branch_code } }),
      ]);
      setHistoryRecords(allRes.data);
      setHistoryGrouped(groupedRes.data || { rule_type: '', period_days: 0, groups: [] });
      setSalesHistoryRecords(salesAllRes.data || []);
      setSalesHistoryGrouped(salesGroupedRes.data || { rule_type: '', period_days: 0, groups: [] });
      setKmWiseHistoryRecords(kmAllRes.data || []);
      setKmWiseHistoryGrouped(kmGroupedRes.data || { rule_type: '', period_days: 0, groups: [] });
      setBillWiseHistoryRecords(billAllRes.data || []);
      setBillWiseHistoryGrouped(billGroupedRes.data || { rule_type: '', period_days: 0, groups: [] });

      // Seed Service Engineer paid_date editors
      const seed = {};
      (allRes.data || []).forEach(r => { seed[r.id] = r.paid_date || ''; });
      setPaidDateEdits(seed);
      setPaidDateSaving({});
      setPeriodPaidInputs({});
      setPeriodPaidApplying({});

      // Seed Sales paid_date editors
      const salesSeed = {};
      (salesAllRes.data || []).forEach(r => { salesSeed[r.id] = r.paid_date || ''; });
      setSalesPaidDateEdits(salesSeed);
      setSalesPaidDateSaving({});
      setSalesPeriodPaidInputs({});
      setSalesPeriodPaidApplying({});

      // Seed KM Wise paid_date editors
      const kmSeed = {};
      (kmAllRes.data || []).forEach(r => { kmSeed[r.id] = r.paid_date || ''; });
      setKmWisePaidDateEdits(kmSeed);
      setKmWisePaidDateSaving({});
      setKmWisePeriodPaidInputs({});
      setKmWisePeriodPaidApplying({});

      // Seed Bill Wise paid_date editors
      const billSeed = {};
      (billAllRes.data || []).forEach(r => { billSeed[r.id] = r.paid_date || ''; });
      setBillWisePaidDateEdits(billSeed);
      setBillWisePaidDateSaving({});
      setBillWisePeriodPaidInputs({});
      setBillWisePeriodPaidApplying({});
    } catch (error) {
      console.error('Error loading history:', error);
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
      setLoadingHistoryGrouped(false);
      setLoadingSalesHistory(false);
      setLoadingSalesHistoryGrouped(false);
      setLoadingKmWiseHistory(false);
      setLoadingKmWiseHistoryGrouped(false);
      setLoadingBillWiseHistory(false);
      setLoadingBillWiseHistoryGrouped(false);
    }
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setHistoryRecords([]);
    setSalesHistoryRecords([]);
    setKmWiseHistoryRecords([]);
    setBillWiseHistoryRecords([]);
    setHistorySearch('');
    setSalesHistorySearch('');
    setKmWiseHistorySearch('');
    setBillWiseHistorySearch('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setHistoryReachDateFrom('');
    setHistoryReachDateTo('');
    setHistoryEngineer('');
    setHistoryMainTab('all');
    setHistoryTab('periods');
    setSalesHistoryTab('periods');
    setKmWiseHistoryTab('periods');
    setBillWiseHistoryTab('periods');
    setSelectedPeriod(null);
    setSalesSelectedPeriod(null);
    setKmWiseSelectedPeriod(null);
    setBillWiseSelectedPeriod(null);
    setHistoryGrouped({ rule_type: '', period_days: 0, groups: [] });
    setSalesHistoryGrouped({ rule_type: '', period_days: 0, groups: [] });
    setKmWiseHistoryGrouped({ rule_type: '', period_days: 0, groups: [] });
    setBillWiseHistoryGrouped({ rule_type: '', period_days: 0, groups: [] });
    setPaidDateEdits({});
    setPaidDateSaving({});
    setPeriodPaidInputs({});
    setPeriodPaidApplying({});
    setSalesPaidDateEdits({});
    setSalesPaidDateSaving({});
    setSalesPeriodPaidInputs({});
    setSalesPeriodPaidApplying({});
    setKmWisePaidDateEdits({});
    setKmWisePaidDateSaving({});
    setKmWisePeriodPaidInputs({});
    setKmWisePeriodPaidApplying({});
    setBillWisePaidDateEdits({});
    setBillWisePaidDateSaving({});
    setBillWisePeriodPaidInputs({});
    setBillWisePeriodPaidApplying({});
    setHistoryAllTaskStatusFilter(new Set());
    setHistoryPeriodTaskStatusFilter(new Set());
    setHistoryAllSrTypeFilter(new Set());
    setHistoryPeriodSrTypeFilter(new Set());
    setHistoryAllManualFilter(false);
    setHistoryPeriodManualFilter(false);
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
    const total = (effectiveKM * branchRate.km_rate) + (daAmount || 0);
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
          const total = (effectiveKM * branchRate.km_rate) + daAmount;
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
  }, [engineerRecords, kmRates, localDAAmounts]);

  useEffect(() => {
    if (engineerRecords.length > 0) {
      updateAllCalculations();
    }
  }, [engineerRecords, kmRates, localDAAmounts]);

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

  const filteredOfficeExpenses = useMemo(() => {
    return hoOfficeExpenses.filter(e => {
      const pd = e.paid_date ? String(e.paid_date).substring(0, 10) : '';
      const matchFrom = !oeMainDateFrom || (pd && pd >= oeMainDateFrom);
      const matchTo = !oeMainDateTo || (pd && pd <= oeMainDateTo);
      return matchFrom && matchTo;
    });
  }, [hoOfficeExpenses, oeMainDateFrom, oeMainDateTo]);

  const tabFilteredOfficeExpenses = useMemo(() => {
    return filteredOfficeExpenses.filter(e => {
      const isVerified = e.verification_status === 'Verified';
      return oeTab === 'verified' ? isVerified : !isVerified;
    });
  }, [filteredOfficeExpenses, oeTab]);

  const oeSelectedCount = Object.values(hoOEVerificationStatus).filter(Boolean).length;
  const oePendingCount = filteredOfficeExpenses.filter(e => e.verification_status !== 'Verified').length;
  const oeVerifiedCount = filteredOfficeExpenses.filter(e => e.verification_status === 'Verified').length;

  const filteredLvbBills = useMemo(() => {
    return lvbBills.filter(b => {
      const id = b.invoice_date ? String(b.invoice_date).substring(0, 10) : '';
      const matchFrom = !lvbMainDateFrom || (id && id >= lvbMainDateFrom);
      const matchTo = !lvbMainDateTo || (id && id <= lvbMainDateTo);
      return matchFrom && matchTo;
    });
  }, [lvbBills, lvbMainDateFrom, lvbMainDateTo]);

  const tabFilteredLvbBills = useMemo(() => {
    return filteredLvbBills.filter(b => {
      const isVerified = b.verification_status === 'Verified';
      return lvbTab === 'verified' ? isVerified : !isVerified;
    });
  }, [filteredLvbBills, lvbTab]);

  const lvbSelectedCount = Object.values(lvbVerificationStatus).filter(Boolean).length;
  const lvbPendingCount = filteredLvbBills.filter(b => b.verification_status !== 'Verified').length;
  const lvbVerifiedCount = filteredLvbBills.filter(b => b.verification_status === 'Verified').length;

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

  const fetchHoOfficeExpenses = async (branchCode = '') => {
    setLoadingHoOfficeExpenses(true);
    try {
      const params = new URLSearchParams({ limit: 200 });
      if (branchCode) params.append('branch_code', branchCode);
      const { data } = await axios.get(`${API_BASE_URL}/office-expenses/?${params}`);
      setHoOfficeExpenses(data);
      const initVerify = {};
      data.forEach(e => { initVerify[e.id] = e.verification_status === 'Verified'; });
      setHoOEVerificationStatus(initVerify);
      setHoOESelectAll(false);
    } catch {
      toast.error('Failed to load office expenses');
    } finally {
      setLoadingHoOfficeExpenses(false);
    }
  };

  const handleHoOEVerifyToggle = async (expenseId, currentStatus) => {
    try {
      const { data } = await axios.put(
        `${API_BASE_URL}/office-expenses/${expenseId}/verify`,
        null,
        { params: { verified_by_name: user?.name || 'HO', verified_by_id: String(user?.user_id || user?.id || '') } }
      );
      setHoOEVerificationStatus(prev => ({ ...prev, [expenseId]: data.verification_status === 'Verified' }));
      setHoOfficeExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, verification_status: data.verification_status } : e));
      toast.success(data.verification_status === 'Verified' ? 'Verified!' : 'Unverified!', { duration: 1200 });
    } catch {
      toast.error('Failed to update verification');
    }
  };

  const handleHoOESelectAll = async () => {
    // Tab-aware: verified tab → unverify all (false); pending tab → verify all (true)
    const targetVerified = oeTab === 'verified' ? false : true;
    setHoOESelectAll(targetVerified);

    // Optimistically update UI for visible (tab-filtered) records
    const newStatus = { ...hoOEVerificationStatus };
    tabFilteredOfficeExpenses.forEach(e => { newStatus[e.id] = targetVerified; });
    setHoOEVerificationStatus(newStatus);

    // Only process records in the current tab whose status differs from the target
    const recordsToProcess = tabFilteredOfficeExpenses.filter(e => {
      const isCurrentlyVerified = e.verification_status === 'Verified';
      return targetVerified ? !isCurrentlyVerified : isCurrentlyVerified;
    });

    if (recordsToProcess.length === 0) {
      setHoOEBulkVerifying(false);
      return;
    }

    setHoOEBulkVerifying(true);
    let successCount = 0;
    let errorCount = 0;

    for (const expense of recordsToProcess) {
      try {
        const { data } = await axios.put(
          `${API_BASE_URL}/office-expenses/${expense.id}/verify`,
          null,
          { params: { verified_by_name: user?.name || 'HO', verified_by_id: String(user?.user_id || user?.id || '') } }
        );
        setHoOfficeExpenses(prev => prev.map(e =>
          e.id === expense.id ? { ...e, verification_status: data.verification_status } : e
        ));
        setHoOEVerificationStatus(prev => ({ ...prev, [expense.id]: data.verification_status === 'Verified' }));
        successCount++;
      } catch {
        errorCount++;
      }
    }

    if (successCount > 0) toast.success(`${targetVerified ? 'Verified' : 'Unverified'} ${successCount} records!`);
    if (errorCount > 0) toast.error(`Failed: ${errorCount} records`);

    setHoOEBulkVerifying(false);
  };

  const handleHoOEBulkVerify = async () => {
    const selected = hoOfficeExpenses.filter(e => hoOEVerificationStatus[e.id]);
    if (!selected.length) { toast.error('No records selected'); return; }
    setHoOEBulkVerifying(true);
    for (const expense of selected) {
      try {
        const { data } = await axios.put(
          `${API_BASE_URL}/office-expenses/${expense.id}/verify`,
          null,
          { params: { verified_by_name: user?.name || 'HO', verified_by_id: String(user?.user_id || user?.id || '') } }
        );
        setHoOfficeExpenses(prev => prev.map(e => e.id === expense.id ? { ...e, verification_status: data.verification_status } : e));
        setHoOEVerificationStatus(prev => ({ ...prev, [expense.id]: data.verification_status === 'Verified' }));
      } catch { /* continue */ }
    }
    toast.success('Bulk verification done!');
    setHoOEBulkVerifying(false);
  };

  const handleHoOESubmitToHistory = async () => {
    const selectedIds = Object.keys(hoOEVerificationStatus)
      .filter(id => hoOEVerificationStatus[id])
      .map(Number);

    const verifiedSelected = hoOfficeExpenses
      .filter(e => selectedIds.includes(e.id) && e.verification_status === 'Verified')
      .map(e => e.id);

    if (!verifiedSelected.length) {
      toast.error('No verified records selected to submit');
      return;
    }

    const result = await Swal.fire({
      title: 'Submit to History?',
      html: `Move <strong>${verifiedSelected.length}</strong> verified record(s) to history?<br/>This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, submit!',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setSubmittingOEToHistory(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/office-expenses/submit-to-history`, {
        expense_ids: verifiedSelected,
        submitted_by_name: user?.name || 'HO',
        submitted_by_id: String(user?.user_id || user?.id || ''),
      });
      await Swal.fire({ title: 'Done!', text: `${data.moved_count} records moved to history.`, icon: 'success', timer: 2000, confirmButtonColor: themeColor });
      fetchHoOfficeExpenses(selectedBranchOE);
    } catch {
      toast.error('Failed to submit to history');
    } finally {
      setSubmittingOEToHistory(false);
    }
  };

  const loadOEHistory = async () => {
    setLoadingOEHistory(true);
    setLoadingOEHistoryGrouped(true);
    setShowOEHistoryModal(true);
    setOeHistorySearch(''); setOeHistoryDateFrom(''); setOeHistoryDateTo('');
    setOeHistoryBranch(''); setOeHistoryPaidDateFrom(''); setOeHistoryPaidDateTo('');
    setOeHistoryTab('periods'); setOeSelectedPeriod(null);
    setOeHistoryPeriodsBranch('');
    try {
      const [listRes, groupedRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/office-expenses/history/list?limit=500`),
        axios.get(`${API_BASE_URL}/office-expenses/history/grouped`),
      ]);
      setOeHistoryRecords(listRes.data);
      setOeHistoryGrouped(groupedRes.data || { rule_type: '', period_days: 0, groups: [] });
      const seed = {};
      (listRes.data || []).forEach(r => { seed[r.id] = r.ho_paid_date || ''; });
      setOePaidDateEdits(seed);
      setOePaidDateSaving({}); setOePeriodPaidInputs({}); setOePeriodPaidApplying({});
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoadingOEHistory(false);
      setLoadingOEHistoryGrouped(false);
    }
  };

  const handleOEPaidDateChange = (recordId, value) => {
    setOePaidDateEdits(prev => ({ ...prev, [recordId]: value }));
    if (oePaidDateTimers[recordId]) clearTimeout(oePaidDateTimers[recordId]);
    setOePaidDateSaving(prev => ({ ...prev, [recordId]: true }));
    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/office-expenses/history/${recordId}/paid-date`, {
          paid_date: value || null,
        });
        setOeHistoryRecords(prev => prev.map(r => r.id === recordId ? { ...r, ho_paid_date: value || null } : r));
        toast.success('Paid date saved', { duration: 1200 });
      } catch {
        toast.error('Failed to save paid date');
      } finally {
        setOePaidDateSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 700);
    setOePaidDateTimers(prev => ({ ...prev, [recordId]: t }));
  };

  const handleOEPeriodPaidApply = async (group) => {
    const key = `${group.branch_code}__${group.uploaded_by}__${group.period_start}__${group.period_end}`;
    const value = oePeriodPaidInputs[key] ?? group.paid_date ?? '';
    if (!value) { toast.error('Pick a paid date first'); return; }
    if (!group.record_ids?.length) { toast.error('No records in this period'); return; }

    const result = await Swal.fire({
      title: 'Apply Paid Date?',
      html: `Set <strong>${value}</strong> on <strong>${group.record_ids.length}</strong> record(s) for <strong>${group.uploaded_by}</strong> (${group.period_start_display} → ${group.period_end_display})?`,
      icon: 'question', showCancelButton: true,
      confirmButtonColor: themeColor, cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, apply', reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setOePeriodPaidApplying(prev => ({ ...prev, [key]: true }));
    try {
      await axios.put(`${API_BASE_URL}/office-expenses/history/bulk-paid-date`, {
        record_ids: group.record_ids, paid_date: value,
      });
      const idSet = new Set(group.record_ids);
      setOeHistoryRecords(prev => prev.map(r => idSet.has(r.id) ? { ...r, ho_paid_date: value } : r));
      setOePaidDateEdits(prev => {
        const next = { ...prev };
        group.record_ids.forEach(id => { next[id] = value; });
        return next;
      });
      setOeHistoryGrouped(prev => ({
        ...prev,
        groups: (prev.groups || []).map(g =>
          (g.branch_code === group.branch_code &&
            g.uploaded_by === group.uploaded_by &&
            g.period_start === group.period_start &&
            g.period_end === group.period_end)
            ? { ...g, paid_date: value, paid_count: group.record_ids.length }
            : g
        ),
      }));
      toast.success(`Applied to ${group.record_ids.length} record(s)`);
    } catch {
      toast.error('Failed to apply paid date');
    } finally {
      setOePeriodPaidApplying(prev => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    if (activeTab === 'office') {
      fetchHoOfficeExpenses(selectedBranchOE);
    }
  }, [activeTab, selectedBranchOE]);

  useEffect(() => {
    const main = oeTableContainerRef.current;
    const top = oeTopScrollBarRef.current;
    const tbl = oeTableRef.current;
    if (!main || !top) return;

    // Sync phantom div width to actual table width
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
  }, [hoOfficeExpenses, loadingHoOfficeExpenses]);

  const fetchLvbBills = async (branchCode = '') => {
    setLoadingLvbBills(true);
    try {
      const params = new URLSearchParams({ limit: 200 });
      if (branchCode) params.append('branch_code', branchCode);
      const { data } = await axios.get(`${API_BASE_URL}/lvb/bills?${params}`);
      setLvbBills(data);
      const initVerify = {};
      data.forEach(b => { initVerify[b.id] = b.verification_status === 'Verified'; });
      setLvbVerificationStatus(initVerify);
      setLvbSelectAll(false);
    } catch {
      toast.error('Failed to load vendor bills');
    } finally {
      setLoadingLvbBills(false);
    }
  };

  const handleLvbVerifyToggle = async (billId, currentStatus) => {
    // currentStatus comes from isVerified = lvbVerificationStatus[bill.id] ?? (bill.verification_status === 'Verified')
    // We need the ACTUAL server state to know what the API will toggle to
    const actualBill = lvbBills.find(b => b.id === billId);
    const actualServerStatus = actualBill?.verification_status === 'Verified';
    const expectedNewStatus = !actualServerStatus; // what server will return after toggle

    // Optimistically update UI to expected result
    setLvbVerificationStatus(prev => ({ ...prev, [billId]: expectedNewStatus }));
    setLvbBills(prev => prev.map(b =>
      b.id === billId
        ? { ...b, verification_status: expectedNewStatus ? 'Verified' : 'Pending' }
        : b
    ));

    try {
      const { data } = await axios.put(
        `${API_BASE_URL}/lvb/bills/${billId}/verify`,
        null,
        { params: { verified_by_name: user?.name || 'HO', verified_by_id: String(user?.user_id || user?.id || '') } }
      );
      const serverVerified = data.verification_status === 'Verified';
      setLvbVerificationStatus(prev => ({ ...prev, [billId]: serverVerified }));
      setLvbBills(prev => prev.map(b =>
        b.id === billId
          ? { ...b, verification_status: data.verification_status, verified_by_name: data.verified_by_name }
          : b
      ));
      toast.success(serverVerified ? 'Verified!' : 'Unverified!', { duration: 1200 });
    } catch {
      // Roll back to actual previous server state
      setLvbVerificationStatus(prev => ({ ...prev, [billId]: actualServerStatus }));
      setLvbBills(prev => prev.map(b =>
        b.id === billId
          ? { ...b, verification_status: actualServerStatus ? 'Verified' : 'Pending' }
          : b
      ));
      toast.error('Failed to update verification');
    }
  };

  const handleLvbSelectAll = async () => {
    // Tab-aware: verified tab → unverify all (false); pending tab → verify all (true)
    const targetVerified = lvbTab === 'verified' ? false : true;
    setLvbSelectAll(targetVerified);

    // Optimistically update UI for visible (tab-filtered) records
    const newStatus = { ...lvbVerificationStatus };
    tabFilteredLvbBills.forEach(b => { newStatus[b.id] = targetVerified; });
    setLvbVerificationStatus(newStatus);

    // Only process records in the current tab whose status differs from the target
    const recordsToProcess = tabFilteredLvbBills.filter(b => {
      const isCurrentlyVerified = b.verification_status === 'Verified';
      return targetVerified ? !isCurrentlyVerified : isCurrentlyVerified;
    });

    if (recordsToProcess.length === 0) {
      setLvbBulkVerifying(false);
      return;
    }

    setLvbBulkVerifying(true);
    let successCount = 0;
    let errorCount = 0;

    for (const bill of recordsToProcess) {
      try {
        const { data } = await axios.put(
          `${API_BASE_URL}/lvb/bills/${bill.id}/verify`,
          null,
          { params: { verified_by_name: user?.name || 'HO', verified_by_id: String(user?.user_id || user?.id || '') } }
        );
        setLvbBills(prev => prev.map(b =>
          b.id === bill.id
            ? { ...b, verification_status: data.verification_status, verified_by_name: data.verified_by_name }
            : b
        ));
        setLvbVerificationStatus(prev => ({ ...prev, [bill.id]: data.verification_status === 'Verified' }));
        successCount++;
      } catch {
        errorCount++;
      }
    }

    if (successCount > 0) toast.success(`${targetVerified ? 'Verified' : 'Unverified'} ${successCount} bills!`);
    if (errorCount > 0) toast.error(`Failed: ${errorCount} bills`);

    setLvbBulkVerifying(false);
  };

  const handleLvbBulkVerify = async () => {
    const selected = lvbBills.filter(b => lvbVerificationStatus[b.id]);
    if (!selected.length) { toast.error('No records selected'); return; }
    setLvbBulkVerifying(true);

    for (const bill of selected) {
      const currentChecked = lvbVerificationStatus[bill.id];
      // Optimistic update
      setLvbVerificationStatus(prev => ({ ...prev, [bill.id]: !currentChecked }));
      try {
        const { data } = await axios.put(
          `${API_BASE_URL}/lvb/bills/${bill.id}/verify`,
          null,
          { params: { verified_by_name: user?.name || 'HO', verified_by_id: String(user?.user_id || user?.id || '') } }
        );
        const serverVerified = data.verification_status === 'Verified';
        setLvbVerificationStatus(prev => ({ ...prev, [bill.id]: serverVerified }));
        setLvbBills(prev => prev.map(b =>
          b.id === bill.id
            ? { ...b, verification_status: data.verification_status, verified_by_name: data.verified_by_name }
            : b
        ));
      } catch {
        // Roll back this one
        setLvbVerificationStatus(prev => ({ ...prev, [bill.id]: currentChecked }));
      }
    }
    toast.success('Bulk verification done!');
    setLvbBulkVerifying(false);
  };

  const handleLvbSubmitToHistory = async () => {
    const selectedIds = Object.keys(lvbVerificationStatus).filter(id => lvbVerificationStatus[id]).map(Number);
    const verifiedSelected = lvbBills.filter(b => selectedIds.includes(b.id) && b.verification_status === 'Verified').map(b => b.id);
    if (!verifiedSelected.length) { toast.error('No verified records selected to submit'); return; }

    const result = await Swal.fire({
      title: 'Submit to History?',
      html: `Move <strong>${verifiedSelected.length}</strong> verified bill(s) to history?<br/>This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, submit!',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setSubmittingLvbToHistory(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/lvb/bills/submit-to-history`, {
        bill_ids: verifiedSelected,
        submitted_by_name: user?.name || 'HO',
        submitted_by_id: String(user?.user_id || user?.id || ''),
      });
      await Swal.fire({ title: 'Done!', text: `${data.moved_count} bills moved to history.`, icon: 'success', timer: 2000, confirmButtonColor: themeColor });
      fetchLvbBills(selectedBranchLvb);
    } catch {
      toast.error('Failed to submit to history');
    } finally {
      setSubmittingLvbToHistory(false);
    }
  };

  const loadLvbHistory = async () => {
    setLoadingLvbHistory(true);
    setLoadingLvbHistoryGrouped(true);
    setShowLvbHistoryModal(true);
    // Reset history-specific filters so main-table filters don't leak in
    setLvbHistorySearch('');
    setLvbHistoryDateFrom('');
    setLvbHistoryDateTo('');
    setLvbHistoryBranch('');
    setLvbHistoryInvoiceDateFrom('');
    setLvbHistoryInvoiceDateTo('');
    setLvbHistoryTab('periods');
    setLvbSelectedPeriod(null);
    setLvbHistoryPeriodsBranch('');
    try {
      const [listRes, groupedRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/lvb/bills/history?limit=500`),
        axios.get(`${API_BASE_URL}/lvb/bills/history/grouped`),
      ]);
      setLvbHistoryRecords(listRes.data);
      setLvbHistoryGrouped(groupedRes.data || { rule_type: '', period_days: 0, groups: [] });
      const seed = {};
      (listRes.data || []).forEach(r => { seed[r.id] = r.ho_paid_date || ''; });
      setLvbPaidDateEdits(seed);
      setLvbPaidDateSaving({});
      setLvbPeriodPaidInputs({});
      setLvbPeriodPaidApplying({});
    } catch {
      toast.error('Failed to load history');
    } finally {
      setLoadingLvbHistory(false);
      setLoadingLvbHistoryGrouped(false);
    }
  };

  const handleLvbPaidDateChange = (recordId, value) => {
    setLvbPaidDateEdits(prev => ({ ...prev, [recordId]: value }));
    if (lvbPaidDateTimers[recordId]) clearTimeout(lvbPaidDateTimers[recordId]);
    setLvbPaidDateSaving(prev => ({ ...prev, [recordId]: true }));
    const t = setTimeout(async () => {
      try {
        await axios.put(`${API_BASE_URL}/lvb/bills/history/${recordId}/paid-date`, {
          paid_date: value || null,
        });
        setLvbHistoryRecords(prev => prev.map(r => r.id === recordId ? { ...r, ho_paid_date: value || null } : r));
        toast.success('Paid date saved', { duration: 1200 });
      } catch {
        toast.error('Failed to save paid date');
      } finally {
        setLvbPaidDateSaving(prev => ({ ...prev, [recordId]: false }));
      }
    }, 700);
    setLvbPaidDateTimers(prev => ({ ...prev, [recordId]: t }));
  };

  const handleLvbPeriodPaidApply = async (group) => {
    const key = `${group.branch_code}__${group.uploaded_by}__${group.period_start}__${group.period_end}`;
    const value = lvbPeriodPaidInputs[key] ?? group.paid_date ?? '';
    if (!value) { toast.error('Pick a paid date first'); return; }
    if (!group.record_ids?.length) { toast.error('No records in this period'); return; }

    const result = await Swal.fire({
      title: 'Apply Paid Date?',
      html: `Set <strong>${value}</strong> on <strong>${group.record_ids.length}</strong> bill(s) for <strong>${group.uploaded_by}</strong> (${group.period_start_display} → ${group.period_end_display})?`,
      icon: 'question', showCancelButton: true,
      confirmButtonColor: themeColor, cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, apply', reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    setLvbPeriodPaidApplying(prev => ({ ...prev, [key]: true }));
    try {
      await axios.put(`${API_BASE_URL}/lvb/bills/history/bulk-paid-date`, {
        record_ids: group.record_ids, paid_date: value,
      });
      const idSet = new Set(group.record_ids);
      setLvbHistoryRecords(prev => prev.map(r => idSet.has(r.id) ? { ...r, ho_paid_date: value } : r));
      setLvbPaidDateEdits(prev => {
        const next = { ...prev };
        group.record_ids.forEach(id => { next[id] = value; });
        return next;
      });
      setLvbHistoryGrouped(prev => ({
        ...prev,
        groups: (prev.groups || []).map(g =>
          (g.branch_code === group.branch_code &&
            g.uploaded_by === group.uploaded_by &&
            g.period_start === group.period_start &&
            g.period_end === group.period_end)
            ? { ...g, paid_date: value, paid_count: group.record_ids.length }
            : g
        ),
      }));
      toast.success(`Applied to ${group.record_ids.length} bill(s)`);
    } catch {
      toast.error('Failed to apply paid date');
    } finally {
      setLvbPeriodPaidApplying(prev => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    if (activeTab === 'vendor') {
      fetchLvbBills(selectedBranchLvb);
    }
  }, [activeTab, selectedBranchLvb]);

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

  useEffect(() => {
    const main = lvbTableContainerRef.current;
    const top = lvbTopScrollBarRef.current;
    const tbl = lvbTableRef.current;
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
  }, [lvbBills, loadingLvbBills]);

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
                            total_count: (b.engineer_count || 0) + (b.sales_count || 0) + (b.km_wise_count || 0) + (b.bill_wise_count || 0),
                          })),
                          'branches.xlsx',
                          [
                            { key: 'sr_no', label: 'Sr. No.' },
                            { key: 'branch_name', label: 'Branch Name' },
                            { key: 'branch_code', label: 'Branch Code' },
                            { key: 'branch_manager', label: 'Branch Manager' },
                            { key: 'engineer_count', label: 'Engineers' },
                            { key: 'sales_count', label: 'Sales' },
                            { key: 'km_wise_count', label: 'KM Wise' },
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
                            <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-black">Sales</th>
                            <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-black">KM Wise</th>
                            <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-black">Bill Wise</th>
                            <th className="border border-gray-300 px-2 py-2 text-center text-xs font-semibold text-black">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branches.map((branch) => {
                            const total = (branch.engineer_count || 0) + (branch.sales_count || 0) + (branch.km_wise_count || 0) + (branch.bill_wise_count || 0);
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
                                    {branch.sales_count || 0}
                                  </span>
                                </td>
                                <td className="border border-gray-300 px-2 py-0 text-center text-sm text-black">
                                  <span className="px-2 py-0.5 rounded-full text-black font-semibold text-xs">
                                    {branch.km_wise_count || 0}
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
                              {branches.reduce((total, branch) => total + (branch.sales_count || 0), 0)}
                            </td>
                            <td className="border border-gray-300 px-2 py-1 text-center text-sm font-bold text-purple-700">
                              {branches.reduce((total, branch) => total + (branch.km_wise_count || 0), 0)}
                            </td>
                            <td className="border border-gray-300 px-2 py-1 text-center text-sm font-bold text-orange-700">
                              {branches.reduce((total, branch) => total + (branch.bill_wise_count || 0), 0)}
                            </td>
                            <td className="border border-gray-300 px-2 py-1 text-center text-sm font-bold" style={{ color: themeColor }}>
                              {branches.reduce((total, branch) =>
                                total + (branch.engineer_count || 0) + (branch.sales_count || 0) + (branch.km_wise_count || 0) + (branch.bill_wise_count || 0), 0
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
                {!selectedSalesPeriod && !selectedKmWisePeriod && !selectedBillWisePeriod && (
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
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">Engineers - {selectedBranchForSummary.branch_name}</h2>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700">
                          ID: {selectedBranchForSummary.branch_code}
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
                          <p className="mt-2 text-sm text-gray-600">Loading engineers...</p>
                        </div>
                      ) : engineerSummary.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No engineers found for this branch</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Sr. No.</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Engineer Name</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Engineer UID</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Total SR</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Verified SR</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Total Amount</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Total Verify Amount</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">Start Date</th>
                                <th className="border border-gray-300 px-2 py-1 text-center text-xs font-semibold text-black">End Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {engineerSummary.map((engineer, idx) => (
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
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{engineer.total_sr_count}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{engineer.verified_sr_count}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-black">
                                    {loadingCalculatedTotals && engineerCalculatedTotals[engineer.engineer_uid] === undefined ? (
                                      <svg className="inline animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                      </svg>
                                    ) : (
                                      (parseFloat(engineerCalculatedTotals[engineer.engineer_uid]) && parseFloat(engineerCalculatedTotals[engineer.engineer_uid]) !== 0)
                                        ? `₹${parseFloat(engineerCalculatedTotals[engineer.engineer_uid]).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '-'
                                    )}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm font-semibold text-black">
                                    {(parseFloat(engineer.total_amount) && parseFloat(engineer.total_amount) !== 0)
                                      ? `₹${parseFloat(engineer.total_amount).toLocaleString()}`
                                      : '-'}
                                  </td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{engineer.start_date || '-'}</td>
                                  <td className="border border-gray-300 px-4 py-0 text-center text-sm text-black">{engineer.end_date || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-100">
                              <tr className="font-bold">
                                <td colSpan="3" className="border border-gray-300 px-2 py-0.5 text-right text-sm font-semibold text-black">Total:</td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  {engineerSummary.reduce((sum, eng) => sum + (eng.total_sr_count || 0), 0)}
                                </td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  {engineerSummary.reduce((sum, eng) => sum + (eng.verified_sr_count || 0), 0)}
                                </td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  {(() => {
                                    const sum = engineerSummary.reduce((s, eng) => s + parseFloat(engineerCalculatedTotals[eng.engineer_uid] || 0), 0);
                                    return sum !== 0 ? `₹${sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';
                                  })()}
                                </td>
                                <td className="border border-gray-300 px-2 py-0.5 text-center text-sm font-bold text-black">
                                  {(() => {
                                    const sum = engineerSummary.reduce((s, eng) => s + parseFloat(eng.total_amount || 0), 0);
                                    return sum !== 0 ? `₹${sum.toLocaleString()}` : '-';
                                  })()}
                                </td>
                                <td colSpan="2" className="border border-gray-300 px-2 py-0.5 font-semibold text-sm"><span className='font-bold'>To Concern Person:</span> {selectedBranchForSummary?.branch_manager || 'N/A'}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ─────── SALES SUMMARY TABLE ─────── */}
                {selectedBranchForSummary && !selectedEngineerDetail && !selectedSalesPeriod && !selectedKmWisePeriod && !selectedBillWisePeriod && (
                  <>
                    <div className="px-2 sm:px-3 py-1 border-b border-t flex justify-between items-center" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          Sales - {selectedBranchForSummary.branch_name}
                        </h2>

                      </div>
                    </div>

                    <div className="p-4">
                      {loadingSalesSummary ? (
                        <div className="text-center py-6">
                          <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-xs text-gray-500">Loading sales summary...</p>
                        </div>
                      ) : !branchSalesSummary.groups?.length ? (
                        <div className="text-center py-6 text-xs text-gray-500">No sales records for this branch</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Sr. No.</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Date (Period)</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Engineer Name</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">No. of Activity</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Total KM</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Total Amount</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Verified Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {branchSalesSummary.groups.map((g, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">{idx + 1}</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">
                                    <button
                                      onClick={() => loadSalesPeriodRecords(g)}
                                      className="text-[#2f3192] underline hover:font-bold cursor-pointer bg-transparent border-0 p-0"
                                    >
                                      {g.period_start_display} → {g.period_end_display}
                                    </button>
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-purple-700">
                                    {g.engineer_name || '-'}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">{g.record_count}</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">{g.total_km.toFixed(2)} km</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-black">
                                    ₹{parseFloat(g.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-green-700">
                                    ₹{parseFloat(g.verified_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-100">
                              <tr>
                                <td colSpan="3" className="border border-gray-300 px-3 py-1 text-right text-sm font-semibold">Grand Total:</td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">
                                  {branchSalesSummary.groups.reduce((s, g) => s + g.record_count, 0)}
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">
                                  {branchSalesSummary.groups.reduce((s, g) => s + g.total_km, 0).toFixed(2)} km
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold text-black">
                                  ₹{branchSalesSummary.groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold text-green-700">
                                  ₹{branchSalesSummary.groups.reduce((s, g) => s + parseFloat(g.verified_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ─────── SALES PERIOD DETAIL VIEW ─────── */}
                {selectedBranchForSummary && !selectedEngineerDetail && selectedSalesPeriod && (
                  <>
                    <div className="px-2 sm:px-3 py-1.5 border-b flex flex-wrap justify-between items-center gap-2" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => { setSelectedSalesPeriod(null); setSalesPeriodRecords([]); }}
                          className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold"
                          style={{ color: themeColor }}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                          Back to Sales Periods
                        </button>
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          Sales: <span className="text-purple-700">{selectedSalesPeriod.engineer_name}</span> ({selectedSalesPeriod.period_start_display} → {selectedSalesPeriod.period_end_display})
                        </h2>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                          {filteredSalesRecords.length} / {salesPeriodRecords.length} records
                        </span>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        {/* KM Filter */}
                        <div className="flex items-center gap-1 px-2 py-1 border border-purple-200 rounded-lg bg-purple-50">
                          <span className="text-[10px] font-bold text-purple-600 uppercase whitespace-nowrap">KM &gt;</span>
                          <select
                            value={salesKmFilter}
                            onChange={e => setSalesKmFilter(e.target.value)}
                            className="px-1 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                          >
                            <option value="">All</option>
                            <option value="10">10</option>
                            <option value="30">30</option>
                            <option value="50">50</option>
                            <option value="75">75</option>
                            <option value="100">100</option>
                            <option value="150">150</option>
                            <option value="200">200</option>
                            <option value="300">300</option>
                            <option value="500">500</option>
                          </select>
                          {salesKmFilter && (
                            <button onClick={() => setSalesKmFilter('')} className="text-red-600 hover:text-red-800">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <button
                          onClick={submitVerifiedSalesToHistory}
                          disabled={submittingSalesToHistory}
                          className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40"
                          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                        >
                          {submittingSalesToHistory ? 'Submitting...' : 'Submit Verified'}
                        </button>
                      </div>
                    </div>

                    {/* Top stats */}
                    <div className="px-3 py-1.5 border-b bg-white flex flex-wrap gap-2 items-center">
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                        <span className="text-[9px] font-bold text-gray-500 uppercase">Count:</span>
                        <span className="text-[10px] font-bold text-gray-800">{filteredSalesRecords.length}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 border border-blue-100">
                        <span className="text-[9px] font-bold text-blue-600 uppercase">Total Amount:</span>
                        <span className="text-[10px] font-bold text-blue-800">
                          ₹{salesTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-50 border border-green-100">
                        <span className="text-[9px] font-bold text-green-600 uppercase">Verified Amount:</span>
                        <span className="text-[10px] font-bold text-green-800">
                          ₹{salesVerifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {loadingSalesPeriodRecords ? (
                      <div className="text-center py-10">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-gray-500">Loading...</p>
                      </div>
                    ) : (
                      <div className="overflow-auto" style={{ maxHeight: '550px', scrollbarWidth: 'thin' }}>
                        <table className="w-full border-collapse border border-gray-200" style={{ minWidth: '1650px' }}>
                          <thead className="sticky top-0 z-20">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {[
                                { l: 'Verify', w: 60, sticky: true },
                                { l: 'Sr.', w: 45 },
                                { l: 'Date', w: 90 }, { l: 'SR No.', w: 90 },
                                { l: 'Engineer Name', w: 150 },
                                { l: 'Customer Name', w: 160 }, { l: 'Location', w: 140 },
                                { l: 'Description', w: 180 }, { l: 'KM 2-Way', w: 80 },
                                { l: 'HO Corrected KM', w: 110 }, { l: 'Rate', w: 70 },
                                { l: 'DA', w: 80 }, { l: 'Total', w: 95 },
                                { l: 'HO Remark', w: 150 }, { l: 'Status', w: 90 },
                              ].map((c, i) => (
                                <th key={i}
                                  className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-200 uppercase tracking-wide whitespace-nowrap text-center"
                                  style={{
                                    width: `${c.w}px`,
                                    minWidth: `${c.w}px`,
                                    backgroundColor: '#f0f1ff',
                                    ...(c.sticky && {
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 30,
                                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                    }),
                                  }}>
                                  {c.l}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSalesRecords.map((rec, idx) => {
                              const isVerified = salesVerificationStatus[rec.id] ?? (rec.verification_status === 'Verified');
                              const currCorrected = salesLocalCorrections[rec.id] !== undefined ? salesLocalCorrections[rec.id] : (rec.ho_corrected_km || '');
                              const currRemark = salesLocalRemarks[rec.id] !== undefined ? salesLocalRemarks[rec.id] : (rec.ho_remark || '');
                              const isSaving = salesSavingStates[rec.id];
                              const rowBg = isVerified ? '#f0fdf4' : '#ffffff';
                              return (
                                <tr key={rec.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                                  <td
                                    className="px-2 py-0.5 border border-gray-200 text-center"
                                    style={{
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 10,
                                      backgroundColor: rowBg,
                                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isVerified}
                                      onChange={() => handleSalesVerificationToggle(rec.id, isVerified)}
                                      className="w-4 h-4 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-medium">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.date || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.sr_number || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate font-semibold text-purple-700" title={rec.engineer_name}>{rec.engineer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.customer_name}>{rec.customer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.location}>{rec.location || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.description_of_work}>{rec.description_of_work || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.km_two_way || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-center">
                                    <div className="relative">
                                      <input
                                        type="number"
                                        value={currCorrected}
                                        onChange={(e) => handleSalesKMCorrectionChange(rec.id, e.target.value, rec.ho_corrected_km || '')}
                                        disabled={isVerified}
                                        placeholder="Enter KM"
                                        className={`w-full px-1 py-0.5 text-[11px] border rounded text-center ${isVerified ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`}
                                        step="0.01"
                                      />
                                      {isSaving && (
                                        <svg className="absolute right-1 top-1/2 -translate-y-1/2 animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-semibold">
                                    {rec.rate ? `₹${rec.rate}` : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-semibold text-green-700">
                                    {(parseFloat(rec.da) && parseFloat(rec.da) !== 0) ? `₹${rec.da}` : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-bold text-blue-700">
                                    {(parseFloat(rec.total_amount) && parseFloat(rec.total_amount) !== 0) ? `₹${rec.total_amount}` : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200">
                                    <input
                                      type="text"
                                      value={currRemark}
                                      onChange={(e) => handleSalesRemarkChange(rec.id, e.target.value, rec.ho_remark || '')}
                                      disabled={isVerified}
                                      placeholder="Add remark"
                                      className={`w-full px-1 py-0.5 text-[11px] border rounded ${isVerified ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`}
                                    />
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-center">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                      {isVerified ? 'Verified' : 'Pending'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="sticky bottom-0 z-20">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td
                                className="border border-gray-200"
                                style={{
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 25,
                                  backgroundColor: '#f0f1ff',
                                  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                }}
                              />
                              <td colSpan={11} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border border-gray-200">
                                {salesKmFilter ? `Filtered Total (KM > ${salesKmFilter})` : 'Grand Total'}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border border-gray-200" style={{ color: themeColor }}>
                                ₹{salesTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={2} className="border border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* ═══════════ KM WISE SUMMARY TABLE ═══════════ */}
                {selectedBranchForSummary && !selectedEngineerDetail && !selectedKmWisePeriod && !selectedSalesPeriod && !selectedBillWisePeriod && (
                  <>
                    <div className="px-2 sm:px-3 py-1 border-b border-t flex justify-between items-center" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          KM Wise - {selectedBranchForSummary.branch_name}
                        </h2>

                      </div>
                    </div>

                    <div className="p-4">
                      {loadingKmWiseSummary ? (
                        <div className="text-center py-6">
                          <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-xs text-gray-500">Loading KM Wise summary...</p>
                        </div>
                      ) : !branchKmWiseSummary.groups?.length ? (
                        <div className="text-center py-6 text-xs text-gray-500">No KM Wise records for this branch</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Sr. No.</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Date (Period)</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Engineer Name</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">No. of Activity</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Total KM</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Total Amount</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Verified Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {branchKmWiseSummary.groups.map((g, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">{idx + 1}</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">
                                    <button
                                      onClick={() => loadKmWisePeriodRecords(g)}
                                      className="text-[#2f3192] underline hover:font-bold cursor-pointer bg-transparent border-0 p-0"
                                    >
                                      {g.period_start_display} → {g.period_end_display}
                                    </button>
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-purple-700">
                                    {g.engineer_name || '-'}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">{g.record_count}</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">{g.total_km.toFixed(2)} km</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-black">
                                    ₹{parseFloat(g.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-green-700">
                                    ₹{parseFloat(g.verified_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-100">
                              <tr>
                                <td colSpan="3" className="border border-gray-300 px-3 py-1 text-right text-sm font-semibold">Grand Total:</td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">
                                  {branchKmWiseSummary.groups.reduce((s, g) => s + g.record_count, 0)}
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">
                                  {branchKmWiseSummary.groups.reduce((s, g) => s + g.total_km, 0).toFixed(2)} km
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold text-black">
                                  ₹{branchKmWiseSummary.groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold text-green-700">
                                  ₹{branchKmWiseSummary.groups.reduce((s, g) => s + parseFloat(g.verified_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════════ KM WISE PERIOD DETAIL VIEW ═══════════ */}
                {selectedBranchForSummary && !selectedEngineerDetail && selectedKmWisePeriod && (
                  <>
                    <div className="px-2 sm:px-3 py-1.5 border-b flex flex-wrap justify-between items-center gap-2" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => { setSelectedKmWisePeriod(null); setKmWisePeriodRecords([]); }}
                          className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold"
                          style={{ color: themeColor }}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                          Back to KM Wise Periods
                        </button>
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          KM Wise: <span className="text-purple-700">{selectedKmWisePeriod.engineer_name}</span> ({selectedKmWisePeriod.period_start_display} → {selectedKmWisePeriod.period_end_display})
                        </h2>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                          {filteredKmWiseRecords.length} / {kmWisePeriodRecords.length} records
                        </span>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <div className="flex items-center gap-1 px-2 py-1 border border-purple-200 rounded-lg bg-purple-50">
                          <span className="text-[10px] font-bold text-purple-600 uppercase whitespace-nowrap">KM &gt;</span>
                          <select
                            value={kmWiseKmFilter}
                            onChange={e => setKmWiseKmFilter(e.target.value)}
                            className="px-1 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                          >
                            <option value="">All</option>
                            <option value="10">10</option>
                            <option value="30">30</option>
                            <option value="50">50</option>
                            <option value="75">75</option>
                            <option value="100">100</option>
                            <option value="150">150</option>
                            <option value="200">200</option>
                            <option value="300">300</option>
                            <option value="500">500</option>
                          </select>
                          {kmWiseKmFilter && (
                            <button onClick={() => setKmWiseKmFilter('')} className="text-red-600 hover:text-red-800">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <button
                          onClick={submitVerifiedKmWiseToHistory}
                          disabled={submittingKmWiseToHistory}
                          className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40"
                          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                        >
                          {submittingKmWiseToHistory ? 'Submitting...' : 'Submit Verified'}
                        </button>
                      </div>
                    </div>

                    {/* Top stats */}
                    <div className="px-3 py-1.5 border-b bg-white flex flex-wrap gap-2 items-center">
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                        <span className="text-[9px] font-bold text-gray-500 uppercase">Count:</span>
                        <span className="text-[10px] font-bold text-gray-800">{filteredKmWiseRecords.length}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 border border-blue-100">
                        <span className="text-[9px] font-bold text-blue-600 uppercase">Total Amount:</span>
                        <span className="text-[10px] font-bold text-blue-800">
                          ₹{kmWiseTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-50 border border-green-100">
                        <span className="text-[9px] font-bold text-green-600 uppercase">Verified Amount:</span>
                        <span className="text-[10px] font-bold text-green-800">
                          ₹{kmWiseVerifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {loadingKmWisePeriodRecords ? (
                      <div className="text-center py-10">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-gray-500">Loading...</p>
                      </div>
                    ) : (
                      <div className="overflow-auto" style={{ maxHeight: '550px', scrollbarWidth: 'thin' }}>
                        <table className="w-full border-collapse border border-gray-200" style={{ minWidth: '1850px' }}>
                          <thead className="sticky top-0 z-20">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {[
                                { l: 'Verify', w: 60, sticky: true },
                                { l: 'Sr.', w: 45 },
                                { l: 'Date', w: 90 },
                                { l: 'Engineer Name', w: 150 },
                                { l: 'Customer Name', w: 160 },
                                { l: 'SR/Invoice/Engine No.', w: 140 }, { l: 'Work Description', w: 180 },
                                { l: 'KM', w: 70 }, { l: 'HO Corrected KM', w: 110 },
                                { l: 'Work Status', w: 100 }, { l: 'Asset Count', w: 80 },
                                { l: 'KVA/HP', w: 80 }, { l: 'Labour Sale', w: 90 },
                                { l: 'Part Sale', w: 90 }, { l: 'Rate', w: 70 },
                                { l: 'DA', w: 80 }, { l: 'Amount', w: 95 },
                                { l: 'HO Remark', w: 150 }, { l: 'Status', w: 90 },
                              ].map((c, i) => (
                                <th key={i}
                                  className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-200 uppercase tracking-wide whitespace-nowrap text-center"
                                  style={{
                                    width: `${c.w}px`,
                                    minWidth: `${c.w}px`,
                                    backgroundColor: '#f0f1ff',
                                    ...(c.sticky && {
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 30,
                                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                    }),
                                  }}>
                                  {c.l}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredKmWiseRecords.map((rec, idx) => {
                              const isVerified = kmWiseVerificationStatus[rec.id] ?? (rec.verification_status === 'Verified');
                              const currCorrected = kmWiseLocalCorrections[rec.id] !== undefined ? kmWiseLocalCorrections[rec.id] : (rec.ho_corrected_km || '');
                              const currRemark = kmWiseLocalRemarks[rec.id] !== undefined ? kmWiseLocalRemarks[rec.id] : (rec.ho_remark || '');
                              const isSaving = kmWiseSavingStates[rec.id];
                              const rowBg = isVerified ? '#f0fdf4' : '#ffffff';
                              return (
                                <tr key={rec.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                                  <td
                                    className="px-2 py-0.5 border border-gray-200 text-center"
                                    style={{
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 10,
                                      backgroundColor: rowBg,
                                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isVerified}
                                      onChange={() => handleKmWiseVerificationToggle(rec.id, isVerified)}
                                      className="w-4 h-4 cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-medium">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.date || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate font-semibold text-purple-700" title={rec.engineer_name}>{rec.engineer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.customer_name}>{rec.customer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.sr_invoice_engine_no}>{rec.sr_invoice_engine_no || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px]"><div className="truncate" title={rec.work_description}>{rec.work_description || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.km || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-center">
                                    <div className="relative">
                                      <input
                                        type="number"
                                        value={currCorrected}
                                        onChange={(e) => handleKmWiseKMCorrectionChange(rec.id, e.target.value, rec.ho_corrected_km || '')}
                                        disabled={isVerified}
                                        placeholder="Enter KM"
                                        className={`w-full px-1 py-0.5 text-[11px] border rounded text-center ${isVerified ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`}
                                        step="0.01"
                                      />
                                      {isSaving && (
                                        <svg className="absolute right-1 top-1/2 -translate-y-1/2 animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700">
                                      {rec.work_status || '-'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.asset_count || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.kva_hp || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.labour_sale_expected ? `₹${rec.labour_sale_expected}` : '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center">{rec.part_sale_expected ? `₹${rec.part_sale_expected}` : '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-semibold">
                                    {rec.rate ? `₹${rec.rate}` : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-semibold text-green-700">
                                    {(parseFloat(rec.da) && parseFloat(rec.da) !== 0) ? `₹${rec.da}` : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-[11px] text-center font-bold text-blue-700">
                                    {(parseFloat(rec.amount) && parseFloat(rec.amount) !== 0) ? `₹${rec.amount}` : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200">
                                    <input
                                      type="text"
                                      value={currRemark}
                                      onChange={(e) => handleKmWiseRemarkChange(rec.id, e.target.value, rec.ho_remark || '')}
                                      disabled={isVerified}
                                      placeholder="Add remark"
                                      className={`w-full px-1 py-0.5 text-[11px] border rounded ${isVerified ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'}`}
                                    />
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-200 text-center">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                      {isVerified ? 'Verified' : 'Pending'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="sticky bottom-0 z-20">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td
                                className="border border-gray-200"
                                style={{
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 25,
                                  backgroundColor: '#f0f1ff',
                                  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                }}
                              />
                              <td colSpan={15} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border border-gray-200">
                                {kmWiseKmFilter ? `Filtered Total (KM > ${kmWiseKmFilter})` : 'Grand Total'}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border border-gray-200" style={{ color: themeColor }}>
                                ₹{kmWiseTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={2} className="border border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* ═══════════ BILL WISE SUMMARY TABLE ═══════════ */}
                {selectedBranchForSummary && !selectedEngineerDetail && !selectedBillWisePeriod && !selectedSalesPeriod && !selectedKmWisePeriod && (
                  <>
                    <div className="px-2 sm:px-3 py-1 border-b border-t flex justify-between items-center" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          Bill Wise - {selectedBranchForSummary.branch_name}
                        </h2>

                      </div>
                    </div>

                    <div className="p-4">
                      {loadingBillWiseSummary ? (
                        <div className="text-center py-6">
                          <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: themeColor }} viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <p className="text-xs text-gray-500">Loading Bill Wise summary...</p>
                        </div>
                      ) : !branchBillWiseSummary.groups?.length ? (
                        <div className="text-center py-6 text-xs text-gray-500">No Bill Wise records for this branch</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse border border-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Sr. No.</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Date (Period)</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Engineer Name</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">No. of Activity</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Total Amount</th>
                                <th className="border border-gray-300 px-3 py-1.5 text-center text-xs font-semibold text-black">Verified Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {branchBillWiseSummary.groups.map((g, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">{idx + 1}</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm">
                                    <button
                                      onClick={() => loadBillWisePeriodRecords(g)}
                                      className="text-[#2f3192] underline hover:font-bold cursor-pointer bg-transparent border-0 p-0"
                                    >
                                      {g.period_start_display} → {g.period_end_display}
                                    </button>
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-purple-700">
                                    {g.engineer_name || '-'}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">{g.record_count}</td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-black">
                                    ₹{parseFloat(g.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-1 text-center text-sm font-semibold text-green-700">
                                    ₹{parseFloat(g.verified_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-gray-100">
                              <tr>
                                <td colSpan="3" className="border border-gray-300 px-3 py-1 text-right text-sm font-semibold">Grand Total:</td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold">
                                  {branchBillWiseSummary.groups.reduce((s, g) => s + g.record_count, 0)}
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold text-black">
                                  ₹{branchBillWiseSummary.groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border border-gray-300 px-3 py-1 text-center text-sm font-bold text-green-700">
                                  ₹{branchBillWiseSummary.groups.reduce((s, g) => s + parseFloat(g.verified_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════════ BILL WISE PERIOD DETAIL VIEW ═══════════ */}
                {selectedBranchForSummary && !selectedEngineerDetail && selectedBillWisePeriod && (
                  <>
                    <div className="px-2 sm:px-3 py-1.5 border-b flex flex-wrap justify-between items-center gap-2" style={{ backgroundColor: themeShades.light, borderColor: '#E5E7EB' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => { setSelectedBillWisePeriod(null); setBillWisePeriodRecords([]); }}
                          className="inline-flex items-center gap-1 text-sm font-bold underline hover:font-extrabold"
                          style={{ color: themeColor }}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                          Back to Bill Wise Periods
                        </button>
                        <h2 className="text-[11px] sm:text-xs font-semibold text-black">
                          Bill Wise: <span className="text-purple-700">{selectedBillWisePeriod.engineer_name}</span> ({selectedBillWisePeriod.period_start_display} → {selectedBillWisePeriod.period_end_display})
                        </h2>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                          {billWisePeriodRecords.length} records
                        </span>
                      </div>
                      <button
                        onClick={submitVerifiedBillWiseToHistory}
                        disabled={submittingBillWiseToHistory}
                        className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40"
                        style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                      >
                        {submittingBillWiseToHistory ? 'Submitting...' : 'Submit Verified'}
                      </button>
                    </div>

                    {/* Top stats */}
                    <div className="px-3 py-1.5 border-b bg-white flex flex-wrap gap-2 items-center">
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-200">
                        <span className="text-[9px] font-bold text-gray-500 uppercase">Count:</span>
                        <span className="text-[10px] font-bold text-gray-800">{billWisePeriodRecords.length}</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 border border-blue-100">
                        <span className="text-[9px] font-bold text-blue-600 uppercase">Total Amount:</span>
                        <span className="text-[10px] font-bold text-blue-800">
                          ₹{billWiseTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-50 border border-green-100">
                        <span className="text-[9px] font-bold text-green-600 uppercase">Verified Amount:</span>
                        <span className="text-[10px] font-bold text-green-800">
                          ₹{billWiseVerifiedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
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
                    ) : (
                      <div className="overflow-auto" style={{ maxHeight: '550px', scrollbarWidth: 'thin' }}>
                        <table className="w-full border-collapse border border-gray-300" style={{ minWidth: '1560px' }}>
                          <thead className="sticky top-0 z-20">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {[
                                { l: 'Verify', w: 60, sticky: true },
                                { l: 'Sr.', w: 45 },
                                { l: 'Date', w: 90 },
                                { l: 'Engineer Name', w: 150 },
                                { l: 'Customer Name', w: 160 },
                                { l: 'SR/Invoice/Engine No.', w: 150 }, { l: 'Expenses Head', w: 140 },
                                { l: 'Work Description', w: 220 }, { l: 'Work Status', w: 100 },
                                { l: 'Amount', w: 110 }, { l: 'Status', w: 90 },
                              ].map((c, i) => (
                                <th key={i}
                                  className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border border-gray-300 uppercase tracking-wide whitespace-nowrap text-center"
                                  style={{
                                    width: `${c.w}px`,
                                    minWidth: `${c.w}px`,
                                    backgroundColor: '#f0f1ff',
                                    ...(c.sticky && {
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 30,
                                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                    }),
                                  }}>
                                  {c.l}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {billWisePeriodRecords.map((rec, idx) => {
                              const isVerified = billWiseVerificationStatus[rec.id] ?? (rec.verification_status === 'Verified');
                              const isSaving = billWiseSavingStates[rec.id];
                              const rowBg = isVerified ? '#f0fdf4' : '#ffffff';
                              return (
                                <tr key={rec.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                                  <td
                                    className="px-2 py-0.5 border border-gray-300 text-center"
                                    style={{
                                      position: 'sticky',
                                      left: 0,
                                      zIndex: 10,
                                      backgroundColor: rowBg,
                                      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                    }}
                                  >
                                    <div className="flex items-center justify-center gap-1">
                                      <input
                                        type="checkbox"
                                        checked={isVerified}
                                        onChange={() => handleBillWiseVerificationToggle(rec.id, isVerified)}
                                        className="w-4 h-4 cursor-pointer"
                                      />
                                      {isSaving && (
                                        <svg className="animate-spin h-3 w-3 text-blue-500" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px] text-center font-medium">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px] text-center">{rec.date || '-'}</td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px]"><div className="truncate font-semibold text-purple-700" title={rec.engineer_name}>{rec.engineer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px]"><div className="truncate" title={rec.customer_name}>{rec.customer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px]"><div className="truncate" title={rec.sr_invoice_engine_no}>{rec.sr_invoice_engine_no || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px]"><div className="truncate" title={rec.expenses_head}>{rec.expenses_head || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px]"><div className="truncate" title={rec.work_description}>{rec.work_description || '-'}</div></td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px] text-center">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700">
                                      {rec.work_status || '-'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-[11px] text-center font-bold text-blue-700">
                                    {(parseFloat(rec.amount) && parseFloat(rec.amount) !== 0) ? `₹${parseFloat(rec.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border border-gray-300 text-center">
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                      {isVerified ? 'Verified' : 'Pending'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="sticky bottom-0 z-20">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td
                                className="border border-gray-300"
                                style={{
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 25,
                                  backgroundColor: '#f0f1ff',
                                  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)',
                                }}
                              />
                              <td colSpan={8} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border border-gray-300">
                                Grand Total
                              </td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border border-gray-300" style={{ color: themeColor }}>
                                ₹{billWiseTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="border border-gray-300" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
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

        {/* History Modal */}
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[98vw] max-h-[92vh] overflow-hidden flex flex-col">

              {/* Modal Header — now contains the 4 main tabs */}
              <div className="px-4 py-2 flex justify-between items-center shrink-0 gap-3 flex-wrap" style={{ background: themeColor }}>
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h2 className="text-sm font-semibold text-white whitespace-nowrap">
                    History - {historyBranch?.branch_name}
                  </h2>
                  {!loadingHistory && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                      {historyMainTab === 'all'
                        ? `${(historyGrouped.groups?.length || 0) + (salesHistoryGrouped.groups?.length || 0) + (kmWiseHistoryGrouped.groups?.length || 0) + (billWiseHistoryGrouped.groups?.length || 0)} periods`
                        : historyMainTab === 'sales'
                          ? (salesHistoryTab === 'all' ? `${salesHistoryRecords.length} records` : `${salesHistoryGrouped.groups?.length || 0} periods`)
                          : historyMainTab === 'km_wise'
                            ? (kmWiseHistoryTab === 'all' ? `${kmWiseHistoryRecords.length} records` : `${kmWiseHistoryGrouped.groups?.length || 0} periods`)
                            : historyMainTab === 'bill_wise'
                              ? (billWiseHistoryTab === 'all' ? `${billWiseHistoryRecords.length} records` : `${billWiseHistoryGrouped.groups?.length || 0} periods`)
                              : (historyTab === 'all' ? `${historyRecords.length} records` : `${historyGrouped.groups?.length || 0} periods`)}
                    </span>
                  )}
                </div>

                {/* 5 main tabs — ALL + 4 individual */}
                {!loadingHistory && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => { setHistoryMainTab('all'); setSelectedPeriod(null); setSalesSelectedPeriod(null); setKmWiseSelectedPeriod(null); setBillWiseSelectedPeriod(null); }}
                      className="px-3 py-1 text-[11px] font-bold rounded-md transition-all"
                      style={{
                        backgroundColor: historyMainTab === 'all' ? '#fff' : 'rgba(255,255,255,0.15)',
                        color: historyMainTab === 'all' ? themeColor : '#fff',
                      }}
                    >
                      ALL ({(historyGrouped.groups?.length || 0) + (salesHistoryGrouped.groups?.length || 0) + (kmWiseHistoryGrouped.groups?.length || 0) + (billWiseHistoryGrouped.groups?.length || 0)})
                    </button>
                    <button
                      onClick={() => { setHistoryMainTab('service_engineer'); setSalesSelectedPeriod(null); setKmWiseSelectedPeriod(null); setBillWiseSelectedPeriod(null); }}
                      className="px-3 py-1 text-[11px] font-bold rounded-md transition-all"
                      style={{
                        backgroundColor: historyMainTab === 'service_engineer' ? '#fff' : 'rgba(255,255,255,0.15)',
                        color: historyMainTab === 'service_engineer' ? themeColor : '#fff',
                      }}
                    >
                      Service Engineer ({historyRecords.length})
                    </button>
                    <button
                      onClick={() => { setHistoryMainTab('sales'); setSelectedPeriod(null); setKmWiseSelectedPeriod(null); setBillWiseSelectedPeriod(null); }}
                      className="px-3 py-1 text-[11px] font-bold rounded-md transition-all"
                      style={{
                        backgroundColor: historyMainTab === 'sales' ? '#fff' : 'rgba(255,255,255,0.15)',
                        color: historyMainTab === 'sales' ? themeColor : '#fff',
                      }}
                    >
                      Sales ({salesHistoryRecords.length})
                    </button>
                    <button
                      onClick={() => { setHistoryMainTab('km_wise'); setSelectedPeriod(null); setSalesSelectedPeriod(null); setBillWiseSelectedPeriod(null); }}
                      className="px-3 py-1 text-[11px] font-bold rounded-md transition-all"
                      style={{
                        backgroundColor: historyMainTab === 'km_wise' ? '#fff' : 'rgba(255,255,255,0.15)',
                        color: historyMainTab === 'km_wise' ? themeColor : '#fff',
                      }}
                    >
                      KM Wise ({kmWiseHistoryRecords.length})
                    </button>
                    <button
                      onClick={() => { setHistoryMainTab('bill_wise'); setSelectedPeriod(null); setSalesSelectedPeriod(null); setKmWiseSelectedPeriod(null); }}
                      className="px-3 py-1 text-[11px] font-bold rounded-md transition-all"
                      style={{
                        backgroundColor: historyMainTab === 'bill_wise' ? '#fff' : 'rgba(255,255,255,0.15)',
                        color: historyMainTab === 'bill_wise' ? themeColor : '#fff',
                      }}
                    >
                      Bill Wise ({billWiseHistoryRecords.length})
                    </button>
                  </div>
                )}

                <button
                  onClick={closeHistoryModal}
                  className="w-7 h-7 bg-white rounded-lg flex items-center justify-center transition-all"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* ════════════ ALL (COMBINED) SECTION ════════════ */}
              {historyMainTab === 'all' && (
                <>
                  {/* Filter bar */}
                  <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
                      <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">Submission Date:</span>
                      <input
                        type="date"
                        value={allHistoryDateFrom}
                        onChange={e => setAllHistoryDateFrom(e.target.value)}
                        className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-gray-400">to</span>
                      <input
                        type="date"
                        value={allHistoryDateTo}
                        onChange={e => setAllHistoryDateTo(e.target.value)}
                        className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() - 30);
                        setAllHistoryDateFrom(d.toISOString().split('T')[0]);
                        setAllHistoryDateTo(new Date().toISOString().split('T')[0]);
                      }}
                      className="px-2 py-1 text-[10px] font-semibold border border-gray-300 rounded-lg hover:bg-white text-gray-700"
                    >
                      Last 30 Days
                    </button>
                    <button
                      onClick={() => {
                        setAllHistoryDateFrom('');
                        setAllHistoryDateTo('');
                      }}
                      className="px-2 py-1 text-[10px] text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                    >
                      Clear
                    </button>
                    <span className="text-[10px] text-gray-500 ml-2">
                      Showing periods between <strong>{allHistoryDateFrom || 'beginning'}</strong> and <strong>{allHistoryDateTo || 'now'}</strong>
                    </span>
                  </div>

                  {/* Body — combined "By Submission Period" view */}
                  <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                    {loadingHistory ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading combined history…</p>
                      </div>
                    ) : (() => {
                      // Tag each group with its source type + sort priority
                      const tagged = [
                        ...(historyGrouped.groups || []).map(g => ({ ...g, _type: 'Service Engineer', _typeOrder: 1, _color: '#1e40af', _bg: '#dbeafe' })),
                        ...(salesHistoryGrouped.groups || []).map(g => ({ ...g, _type: 'Sales', _typeOrder: 2, _color: '#7c3aed', _bg: '#f3e8ff' })),
                        ...(kmWiseHistoryGrouped.groups || []).map(g => ({ ...g, _type: 'KM Wise', _typeOrder: 3, _color: '#0891b2', _bg: '#cffafe' })),
                        ...(billWiseHistoryGrouped.groups || []).map(g => ({ ...g, _type: 'Bill Wise', _typeOrder: 4, _color: '#ea580c', _bg: '#ffedd5' })),
                      ];

                      // Filter by PERIOD overlap with the chosen date range.
                      // A period passes if its [period_start, period_end] intersects [From, To].
                      const filtered = tagged.filter(g => {
                        const pStart = g.period_start ? String(g.period_start).substring(0, 10) : null;
                        const pEnd = g.period_end ? String(g.period_end).substring(0, 10) : null;
                        if (!pStart || !pEnd) return true; // keep if no period info

                        // period_end must be >= From (period hasn't ended before the range starts)
                        if (allHistoryDateFrom && pEnd < allHistoryDateFrom) return false;
                        // period_start must be <= To (period hasn't started after the range ends)
                        if (allHistoryDateTo && pStart > allHistoryDateTo) return false;
                        return true;
                      });

                      // Sort: by type order first (SE → Sales → KM Wise → Bill Wise), then newest period_end DESC within each type
                      filtered.sort((a, b) => {
                        if (a._typeOrder !== b._typeOrder) return a._typeOrder - b._typeOrder;
                        return String(b.period_end || '').localeCompare(String(a.period_end || ''));
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-20">
                            <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-gray-500 font-medium">No history periods in the selected date range</p>
                          </div>
                        );
                      }

                      const totalRecords = filtered.reduce((s, g) => s + (g.record_count || 0), 0);
                      const totalAmount = filtered.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0);
                      const seCount = filtered.filter(g => g._type === 'Service Engineer').length;
                      const salesCount = filtered.filter(g => g._type === 'Sales').length;
                      const kmCount = filtered.filter(g => g._type === 'KM Wise').length;
                      const billCount = filtered.filter(g => g._type === 'Bill Wise').length;

                      return (
                        <>
                          {/* Per-type counters */}
                          <div className="px-4 py-2 border-b bg-white flex flex-wrap items-center gap-2">
                            <span className="text-[11px] px-2 py-1 rounded-md font-bold border" style={{ background: '#dbeafe', color: '#1e40af', borderColor: '#bfdbfe' }}>Service Engineer ({seCount})</span>
                            <span className="text-[11px] px-2 py-1 rounded-md font-bold border" style={{ background: '#f3e8ff', color: '#7c3aed', borderColor: '#e9d5ff' }}>Sales ({salesCount})</span>
                            <span className="text-[11px] px-2 py-1 rounded-md font-bold border" style={{ background: '#cffafe', color: '#0891b2', borderColor: '#a5f3fc' }}>KM Wise ({kmCount})</span>
                            <span className="text-[11px] px-2 py-1 rounded-md font-bold border" style={{ background: '#ffedd5', color: '#ea580c', borderColor: '#fed7aa' }}>Bill Wise ({billCount})</span>
                          </div>

                          {/* Combined By-Submission-Period table */}
                          <table className="border-collapse w-full">
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {[
                                  { label: 'Sr. No.', width: 60 },
                                  { label: 'Type', width: 140 },
                                  { label: 'Period (Submission)', width: 280 },
                                  { label: 'Engineer / Submitted By', width: 200 },
                                  { label: 'Records', width: 90 },
                                  { label: 'Total Amount', width: 150 },
                                  { label: 'Paid Status', width: 140 },
                                ].map((col, i) => (
                                  <th key={i}
                                    className="px-3 py-2 text-[11px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ width: `${col.width}px`, backgroundColor: '#f0f1ff' }}>
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {filtered.map((g, idx) => (
                                <tr key={`${g._type}-${idx}`} className="hover:bg-blue-50 transition-colors" style={{ height: '38px' }}>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-center">
                                    <span
                                      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                                      style={{ background: g._bg, color: g._color }}
                                    >
                                      {g._type}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                    <button
                                      onClick={() => {
                                        if (g._type === 'Service Engineer') { setHistoryMainTab('service_engineer'); setHistoryTab('periods'); setSelectedPeriod(g); }
                                        else if (g._type === 'Sales') { setHistoryMainTab('sales'); setSalesHistoryTab('periods'); setSalesSelectedPeriod(g); }
                                        else if (g._type === 'KM Wise') { setHistoryMainTab('km_wise'); setKmWiseHistoryTab('periods'); setKmWiseSelectedPeriod(g); }
                                        else if (g._type === 'Bill Wise') { setHistoryMainTab('bill_wise'); setBillWiseHistoryTab('periods'); setBillWiseSelectedPeriod(g); }
                                      }}
                                      className="inline-flex items-center gap-1.5 underline hover:font-bold cursor-pointer bg-transparent border-0 p-0"
                                      style={{ color: themeColor }}
                                      title="Open this period in its tab"
                                    >
                                      <span>{g.period_start_display}</span>
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                      </svg>
                                      <span>{g.period_end_display}</span>
                                    </button>
                                  </td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                    <div className="truncate" title={g.engineer_name || g.uploaded_by || ''}>
                                      {g.engineer_name ? <span className="font-semibold text-purple-700">{g.engineer_name}</span> : g.uploaded_by || '-'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">
                                    ₹{parseFloat(g.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                    {g.paid_count > 0 ? (
                                      <span
                                        className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                                        style={{
                                          background: g.paid_date ? '#d1fae5' : '#fef3c7',
                                          color: g.paid_date ? '#065f46' : '#92400e',
                                        }}
                                      >
                                        {g.paid_date ? `Paid: ${g.paid_date}` : `${g.paid_count}/${g.record_count} mixed`}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-gray-400">Unpaid</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="sticky bottom-0">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                <td colSpan={4} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total ({filtered.length} periods)</td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">{totalRecords}</td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200" style={{ color: themeColor }}>
                                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border-t-2 border-gray-200" />
                              </tr>
                            </tfoot>
                          </table>
                        </>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  {!loadingHistory && (
                    <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        Click any period row to open it in its dedicated tab
                      </span>
                      <button onClick={closeHistoryModal} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                    </div>
                  )}
                </>
              )}
              {/* ════════════ END ALL SECTION ════════════ */}

              {/* ════════════ SERVICE ENGINEER SECTION ════════════ */}
              {historyMainTab === 'service_engineer' && (
                <>
                  {/* Tab Bar */}
                  {!loadingHistory && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setHistoryTab('all'); setSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: historyTab === 'all' ? themeColor : '#fff',
                          color: historyTab === 'all' ? 'white' : '#374151',
                          borderColor: historyTab === 'all' ? themeColor : '#e5e7eb',
                        }}
                      >
                        All Records ({historyRecords.length})
                      </button>
                      <button
                        onClick={() => { setHistoryTab('periods'); setSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: historyTab === 'periods' ? '#059669' : '#fff',
                          color: historyTab === 'periods' ? 'white' : '#374151',
                          borderColor: historyTab === 'periods' ? '#059669' : '#e5e7eb',
                        }}
                      >
                        By Submission Period ({historyGrouped.groups?.length || 0})
                      </button>

                      {/* Rule info — only when NOT in period detail */}
                      {historyTab === 'periods' && !selectedPeriod && historyGrouped.rule_type && (
                        <span className="text-[10px] text-gray-600 ml-2 px-2 py-1 bg-white rounded border border-gray-200">
                          Rule: <strong>{historyGrouped.rule_type === 'weekdays' ? 'Weekly' : 'Monthly'}</strong>
                          {' • '}Period size: <strong>{historyGrouped.period_days} days</strong>
                        </span>
                      )}

                      {/* Period info inline (merged from old blue bar) + Back button */}
                      {historyTab === 'periods' && selectedPeriod && (
                        <>
                          <div className="flex items-center gap-2 ml-2 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-200 flex-wrap">
                            <span className="text-[11px] text-gray-600">Period:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {selectedPeriod.period_start_display} → {selectedPeriod.period_end_display}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Submitted By:</span>
                            <span className="text-[11px] font-bold text-purple-700">{selectedPeriod.uploaded_by}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Records:</span>
                            <span className="text-[11px] font-bold text-gray-800">{selectedPeriod.record_count}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Total:</span>
                            <span className="text-[11px] font-bold text-blue-700">
                              ₹{parseFloat(selectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {selectedPeriod.paid_date && (
                              <>
                                <span className="text-gray-300">|</span>
                                <span className="text-[11px] text-gray-600">Paid:</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold">
                                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  {new Date(selectedPeriod.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            {/* Manual Entries toggle for period drill-down */}
                            {(() => {
                              const idSet = new Set(selectedPeriod.record_ids || []);
                              const sourceRecords = historyRecords.filter(r => idSet.has(r.id));
                              const manualCount = sourceRecords.filter(r => String(r.file_name || '').trim() === 'manual_entry.xlsx').length;
                              return (
                                <button
                                  onClick={() => setHistoryPeriodManualFilter(v => !v)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg transition-all border"
                                  style={{
                                    background: historyPeriodManualFilter ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#fff',
                                    color: historyPeriodManualFilter ? '#fff' : '#92400e',
                                    borderColor: historyPeriodManualFilter ? '#d97706' : '#fcd34d',
                                  }}
                                  title={historyPeriodManualFilter ? 'Showing only Manual Entries — click to clear' : 'Show only Manual Entries (file_name = manual_entry.xlsx)'}
                                >

                                  Manual ({manualCount})
                                  {historyPeriodManualFilter && (
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })()}
                            {canExport && (
                              <button
                                onClick={() => {
                                  const idSet = new Set(selectedPeriod.record_ids || []);
                                  const periodRecords = historyRecords.filter(r => idSet.has(r.id));
                                  exportToExcel(periodRecords, `history_period_${historyBranch?.branch_code}_${selectedPeriod.period_start}_to_${selectedPeriod.period_end}.xlsx`, [
                                    { key: 'appointment_number', label: 'Appointment No.' },
                                    { key: 'service_engineer_name', label: 'Engineer Name' },
                                    { key: 'service_engineer_uid', label: 'Engineer UID' },
                                    { key: 'sd_branch_name', label: 'Branch' },
                                    { key: 'installation_site_address', label: 'Installation Address' },
                                    { key: 'account', label: 'Account' },
                                    { key: 'service_request_no', label: 'SR No.' },
                                    { key: 'sr_type', label: 'SR Type' },
                                    { key: 'sr_sub_type', label: 'SR Sub Type' },
                                    { key: 'sr_due_date', label: 'SR Due Date' },
                                    { key: 'task_start_date', label: 'Task Start Date' },
                                    { key: 'task_end_date', label: 'Task End Date' },
                                    { key: 'task_status', label: 'Task Status' },
                                    { key: 'sr_reach_at_site_datetime', label: 'SR Reach at Site Date & Time' },
                                    { key: 'kms_travelled', label: 'KMs Travelled' },
                                    { key: 'two_way_km', label: 'Two Way KM' },
                                    { key: 'branch_verified_km', label: 'Branch Verified KM' },
                                    { key: 'ho_corrected_km', label: 'HO Corrected KM' },
                                    { key: 'km_rate_applied', label: 'KM Rate' },
                                    { key: 'da_amount', label: 'DA Amount' },
                                    { key: 'total_amount', label: 'Total Amount' },
                                    { key: 'ho_remark', label: 'HO Remark' },
                                    { key: 'verification_status', label: 'Verification Status' },
                                    { key: 'submitted_by_name', label: 'Submitted By' },
                                    { key: 'moved_at', label: 'Submitted At' },
                                    { key: 'paid_date', label: 'Paid Date' },
                                  ]);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
                                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                </svg>
                                Export
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedPeriod(null)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                              </svg>
                              Back
                            </button>
                          </div>
                        </>
                      )}

                      {/* Export for periods SUMMARY view (when NOT drilled in) */}
                      {historyTab === 'periods' && !selectedPeriod && canExport && historyGrouped.groups?.length > 0 && (
                        <button
                          onClick={() => {
                            const exportData = historyGrouped.groups.map(g => ({
                              period_start: g.period_start_display,
                              period_end: g.period_end_display,
                              uploaded_by: g.uploaded_by,
                              record_count: g.record_count,
                              total_amount: g.total_amount,
                              paid_date: g.paid_date || '',
                              paid_count: g.paid_count || 0,
                            }));
                            exportToExcel(exportData, `history_periods_${historyBranch?.branch_code}.xlsx`, [
                              { key: 'period_start', label: 'Period Start' },
                              { key: 'period_end', label: 'Period End' },
                              { key: 'uploaded_by', label: 'Submitted By' },
                              { key: 'record_count', label: 'Number of Activity' },
                              { key: 'total_amount', label: 'Total Amount (₹)' },
                              { key: 'paid_date', label: 'Paid Date' },
                              { key: 'paid_count', label: 'Paid Count' },
                            ]);
                          }}
                          className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                          </svg>
                          Export Periods
                        </button>
                      )}

                    </div>
                  )}

                  {/* ─────────── ALL RECORDS TAB ─────────── */}
                  {historyTab === 'all' && !loadingHistory && historyRecords.length > 0 && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                      {/* Search */}
                      <div className="relative flex-1 min-w-[200px]">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={historySearch}
                          onChange={e => setHistorySearch(e.target.value)}
                          placeholder="Search by engineer, SR no, appointment no, account..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {historySearch && (
                          <button onClick={() => setHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <select
                        value={historyEngineer}
                        onChange={e => setHistoryEngineer(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="">All Engineers</option>
                        {Array.from(
                          new Map(
                            historyRecords
                              .filter(r => r.service_engineer_uid)
                              .map(r => [r.service_engineer_uid, r.service_engineer_name || r.service_engineer_uid])
                          ).entries()
                        )
                          .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
                          .map(([uid, name]) => (
                            <option key={uid} value={uid}>{name}</option>
                          ))}
                      </select>

                      <div className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg bg-white">
                        <span className="text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">Submitted:</span>
                        <input type="date" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)} className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <span className="text-[10px] text-gray-400">to</span>
                        <input type="date" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)} className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>

                      <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
                        <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">SR Reach:</span>
                        <input type="date" value={historyReachDateFrom} onChange={e => setHistoryReachDateFrom(e.target.value)} className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <span className="text-[10px] text-gray-400">to</span>
                        <input type="date" value={historyReachDateTo} onChange={e => setHistoryReachDateTo(e.target.value)} className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>

                      {/* Manual Entries toggle */}
                      {(() => {
                        const manualCount = historyRecords.filter(r => String(r.file_name || '').trim() === 'manual_entry.xlsx').length;
                        return (
                          <button
                            onClick={() => setHistoryAllManualFilter(v => !v)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-bold rounded-lg transition-all border whitespace-nowrap"
                            style={{
                              background: historyAllManualFilter ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#fff',
                              color: historyAllManualFilter ? '#fff' : '#92400e',
                              borderColor: historyAllManualFilter ? '#d97706' : '#fcd34d',
                            }}
                            title={historyAllManualFilter ? 'Showing only Manual Entries — click to clear' : 'Show only Manual Entries (file_name = manual_entry.xlsx)'}
                          >

                            Manual ({manualCount})
                            {historyAllManualFilter && (
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })()}

                      {(historySearch || historyDateFrom || historyDateTo || historyReachDateFrom || historyReachDateTo || historyEngineer || historyAllManualFilter) && (
                        <button
                          onClick={() => { setHistorySearch(''); setHistoryDateFrom(''); setHistoryDateTo(''); setHistoryReachDateFrom(''); setHistoryReachDateTo(''); setHistoryEngineer(''); setHistoryAllManualFilter(false); }}
                          className="px-2 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                        >
                          Clear
                        </button>
                      )}

                      {canExport && (
                        <button
                          onClick={() => {
                            const toExport = (window.__historyFiltered || historyRecords);
                            exportToExcel(toExport, `history_${historyBranch?.branch_code}.xlsx`, [
                              { key: 'appointment_number', label: 'Appointment No.' },
                              { key: 'service_engineer_name', label: 'Engineer Name' },
                              { key: 'service_engineer_uid', label: 'Engineer UID' },
                              { key: 'sd_branch_name', label: 'Branch' },
                              { key: 'installation_site_address', label: 'Installation Address' },
                              { key: 'account', label: 'Account' },
                              { key: 'service_request_no', label: 'SR No.' },
                              { key: 'sr_type', label: 'SR Type' },
                              { key: 'sr_sub_type', label: 'SR Sub Type' },
                              { key: 'sr_due_date', label: 'SR Due Date' },
                              { key: 'task_start_date', label: 'Task Start Date' },
                              { key: 'task_end_date', label: 'Task End Date' },
                              { key: 'task_status', label: 'Task Status' },
                              { key: 'kms_travelled', label: 'KMs Travelled' },
                              { key: 'sr_closed_date', label: 'SR Closed Date' },
                              { key: 'sr_status', label: 'SR Status' },
                              { key: 'two_way_km', label: 'Two Way KM' },
                              { key: 'branch_verified_km', label: 'Branch Verified KM' },
                              { key: 'km_verification_remark', label: 'Branch Verification Remark' },
                              { key: 'ho_corrected_km', label: 'HO Corrected KM' },
                              { key: 'km_rate_applied', label: 'KM Rate' },
                              { key: 'da_amount', label: 'DA Amount' },
                              { key: 'total_amount', label: 'Total Amount' },
                              { key: 'ho_remark', label: 'HO Remark' },
                              { key: 'verification_status', label: 'Verification Status' },
                              { key: 'submitted_by_name', label: 'Submitted By' },
                              { key: 'moved_at', label: 'Submitted At' },
                              { key: 'paid_date', label: 'Paid Date' },
                            ]
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
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

                  {/* Modal Body */}
                  <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                    {loadingHistory ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading history records...</p>
                      </div>
                    ) : historyRecords.length === 0 ? (
                      <div className="text-center py-20">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No history records found for this branch</p>
                      </div>
                    ) : historyTab === 'all' ? (() => {
                      // ALL RECORDS TAB BODY
                      const filtered = historyRecords.filter(record => {
                        const searchLower = historySearch.toLowerCase();
                        const matchesSearch = !historySearch || [
                          record.service_engineer_name, record.service_engineer_uid,
                          record.appointment_number, record.service_request_no, record.account,
                          record.sr_type, record.sr_sub_type, record.installation_site_address,
                          record.submitted_by_name,
                        ].some(val => val && val.toLowerCase().includes(searchLower));

                        const movedDate = record.moved_at ? record.moved_at.substring(0, 10) : '';
                        const matchesFrom = !historyDateFrom || movedDate >= historyDateFrom;
                        const matchesTo = !historyDateTo || movedDate <= historyDateTo;

                        let reachDate = '';
                        if (record.sr_reach_at_site_datetime) {
                          const d = new Date(record.sr_reach_at_site_datetime);
                          if (!isNaN(d.getTime())) {
                            reachDate = d.toISOString().substring(0, 10);
                          }
                        }
                        const matchesReachFrom = !historyReachDateFrom || (reachDate && reachDate >= historyReachDateFrom);
                        const matchesReachTo = !historyReachDateTo || (reachDate && reachDate <= historyReachDateTo);

                        const matchesEngineer = !historyEngineer || record.service_engineer_uid === historyEngineer;
                        const matchesTaskStatus = historyAllTaskStatusFilter.size === 0 ||
                          historyAllTaskStatusFilter.has(String(record.task_status || '').trim());
                        const matchesSrType = historyAllSrTypeFilter.size === 0 ||
                          historyAllSrTypeFilter.has(String(record.sr_type || '').trim());
                        const matchesManual = !historyAllManualFilter || String(record.file_name || '').trim() === 'manual_entry.xlsx';
                        return matchesSearch && matchesFrom && matchesTo && matchesReachFrom && matchesReachTo && matchesEngineer && matchesTaskStatus && matchesSrType && matchesManual;
                      });
                      window.__historyFiltered = filtered;

                      return filtered.length === 0 ? (
                        <div className="text-center py-20">
                          <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <p className="text-sm text-gray-500 font-medium">No records match your search/filter</p>
                          <button onClick={() => { setHistorySearch(''); setHistoryDateFrom(''); setHistoryDateTo(''); setHistoryReachDateFrom(''); setHistoryReachDateTo(''); setHistoryEngineer(''); }} className="mt-2 text-xs text-blue-600 hover:underline">Clear</button>
                        </div>
                      ) : (
                        <table className="border-collapse w-full" style={{ minWidth: '2800px', tableLayout: 'fixed' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {[
                                { label: 'Sr. No.', width: 50 },
                                { label: 'Appointment No.', width: 115 },
                                { label: 'Engineer Name', width: 140 },
                                { label: 'Engineer UID', width: 100 },
                                { label: 'Branch', width: 130 },
                                { label: 'Installation Address', width: 220 },
                                { label: 'Account', width: 160 },
                                { label: 'SR No.', width: 100 },
                                { label: 'SR Type', width: 85 },
                                { label: 'SR Sub Type', width: 95 },
                                { label: 'SR Due Date', width: 100 },
                                { label: 'Task Start Date', width: 110 },
                                { label: 'Task End Date', width: 110 },
                                { label: 'Task Status', width: 90 },
                                { label: 'Task Assigned\nDate & Time', width: 125 },
                                { label: 'Task Assign vs\nTrip Start', width: 120 },
                                { label: 'SR Trip Start\nDate & Time', width: 125 },
                                { label: 'SR Reach at Site\nDate & Time', width: 140 },
                                { label: 'SR Trip Start\nLat Long', width: 130 },
                                { label: 'SR Reach at Site\nLat Long', width: 145 },
                                { label: 'KMs\nTravelled', width: 80 },
                                { label: 'SR Closed Date', width: 110 },
                                { label: 'SR Status', width: 95 },
                                { label: 'Two Way KM', width: 85 },
                                { label: 'Branch Verified\nKM', width: 105 },
                                { label: 'Branch Verification\nRemark', width: 150 },
                                { label: 'HO Corrected\nKM', width: 100 },
                                { label: 'KM Rate', width: 80 },
                                { label: 'DA Amount', width: 90 },
                                { label: 'Total Amount', width: 100 },
                                { label: 'HO Remark', width: 160 },
                                { label: 'Verification\nStatus', width: 100 },
                                { label: 'Submitted By', width: 130 },
                                { label: 'Submitted At', width: 140 },
                                { label: 'Paid Date', width: 145 },
                              ].map((col, i) => {
                                if (col.label === 'Task Status') {
                                  const isActive = historyAllTaskStatusFilter.size > 0;
                                  return (
                                    <th key={i}
                                      title={col.label.replace(/\n/g, ' ')}
                                      className="px-1 py-0.5 text-[10px] font-bold text-gray-700 border-r border-b border-gray-300 uppercase tracking-tight text-center align-middle"
                                      style={{
                                        width: `${col.width}px`,
                                        minWidth: `${col.width}px`,
                                        maxWidth: `${col.width}px`,
                                        backgroundColor: '#f0f1ff',
                                        whiteSpace: 'pre-line',
                                        wordBreak: 'break-word',
                                        overflowWrap: 'break-word',
                                        overflow: 'visible',
                                        minHeight: '34px',
                                        height: '34px',
                                        lineHeight: '1.15',
                                      }}>
                                      <div className="flex items-center justify-center gap-1">
                                        <span>{col.label}</span>
                                        <button
                                          onClick={(e) => openTaskStatusFilter(e, historyRecords, historyAllTaskStatusFilter, setHistoryAllTaskStatusFilter)}
                                          className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                          title={isActive ? `Filtering: ${historyAllTaskStatusFilter.size} value(s)` : 'Filter Task Status'}
                                        >
                                          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                                          </svg>
                                        </button>
                                      </div>
                                    </th>
                                  );
                                }
                                if (col.label === 'SR Type') {
                                  const isActive = historyAllSrTypeFilter.size > 0;
                                  return (
                                    <th key={i}
                                      title={col.label.replace(/\n/g, ' ')}
                                      className="px-1 py-0.5 text-[10px] font-bold text-gray-700 border-r border-b border-gray-300 uppercase tracking-tight text-center align-middle"
                                      style={{
                                        width: `${col.width}px`,
                                        minWidth: `${col.width}px`,
                                        maxWidth: `${col.width}px`,
                                        backgroundColor: '#f0f1ff',
                                        whiteSpace: 'pre-line',
                                        wordBreak: 'break-word',
                                        overflowWrap: 'break-word',
                                        overflow: 'visible',
                                        minHeight: '34px',
                                        height: '34px',
                                        lineHeight: '1.15',
                                      }}>
                                      <div className="flex items-center justify-center gap-1">
                                        <span>{col.label}</span>
                                        <button
                                          onClick={(e) => openSrTypeFilter(e, historyRecords, historyAllSrTypeFilter, setHistoryAllSrTypeFilter)}
                                          className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                          title={isActive ? `Filtering: ${historyAllSrTypeFilter.size} value(s)` : 'Filter SR Type'}
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
                                    title={col.label.replace(/\n/g, ' ')}
                                    className="px-1 py-0.5 text-[10px] font-bold text-gray-700 border-r border-b border-gray-300 uppercase tracking-tight text-center align-middle"
                                    style={{
                                      width: `${col.width}px`,
                                      minWidth: `${col.width}px`,
                                      maxWidth: `${col.width}px`,
                                      backgroundColor: '#f0f1ff',
                                      whiteSpace: 'pre-line',
                                      wordBreak: 'break-word',
                                      overflowWrap: 'break-word',
                                      overflow: 'hidden',
                                      minHeight: '34px',
                                      height: '34px',
                                      lineHeight: '1.15',
                                    }}>
                                    {col.label}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filtered.map((record, idx) => (
                              <tr key={record.id} className="hover:bg-blue-50/30 transition-colors" style={{ height: '32px' }}>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '115px' }} title={record.appointment_number || ''}>{record.appointment_number || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '140px' }} title={record.service_engineer_name || ''}>{record.service_engineer_name || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.service_engineer_uid || ''}>{record.service_engineer_uid || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '130px' }} title={record.sd_branch_name || record.sd_branch_code || ''}>{record.sd_branch_name || record.sd_branch_code || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '220px' }} title={record.installation_site_address || ''}>{record.installation_site_address || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '160px' }} title={record.account || ''}>{record.account || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.service_request_no || ''}>{record.service_request_no || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '85px' }} title={record.sr_type || ''}>{record.sr_type || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '95px' }} title={record.sr_sub_type || ''}>{record.sr_sub_type || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.sr_due_date || ''}>{record.sr_due_date || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '110px' }} title={record.task_start_date || ''}>{record.task_start_date || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '110px' }} title={record.task_end_date || ''}>{record.task_end_date || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '90px' }} title={record.task_status || ''}>{record.task_status || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '125px' }} title={record.task_assigned_datetime || ''}>{record.task_assigned_datetime || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '120px' }} title={record.task_assign_vs_trip_start || ''}>{record.task_assign_vs_trip_start || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '125px' }} title={record.sr_trip_start_datetime || ''}>{record.sr_trip_start_datetime || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '140px' }} title={record.sr_reach_at_site_datetime || ''}>{record.sr_reach_at_site_datetime || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '130px' }} title={record.sr_trip_start_lat_long || ''}>{record.sr_trip_start_lat_long || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '145px' }} title={record.sr_reach_at_site_lat_long || ''}>{record.sr_reach_at_site_lat_long || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold truncate" style={{ maxWidth: '80px' }} title={record.kms_travelled || ''}>{record.kms_travelled || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '110px' }} title={record.sr_closed_date || ''}>{record.sr_closed_date || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-center" title={record.sr_status || ''}>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] whitespace-nowrap ${record.sr_status === 'Closed' ? 'bg-green-100 text-green-800' : record.sr_status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {record.sr_status || '-'}
                                  </span>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '85px' }} title={record.two_way_km || ''}>{record.two_way_km || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '105px' }} title={record.branch_verified_km || ''}>{record.branch_verified_km || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '150px' }} title={record.km_verification_remark || ''}>{record.km_verification_remark || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.ho_corrected_km || ''}>{record.ho_corrected_km || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '80px' }} title={record.km_rate_applied || ''}>{record.km_rate_applied || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-green-700 truncate" style={{ maxWidth: '90px' }} title={(parseFloat(record.da_amount) && parseFloat(record.da_amount) !== 0) ? `₹${record.da_amount}` : ''}>{(parseFloat(record.da_amount) && parseFloat(record.da_amount) !== 0) ? `₹${record.da_amount}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700 truncate" style={{ maxWidth: '100px' }} title={(parseFloat(record.total_amount) && parseFloat(record.total_amount) !== 0) ? `₹${record.total_amount}` : ''}>{(parseFloat(record.total_amount) && parseFloat(record.total_amount) !== 0) ? `₹${record.total_amount}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '160px' }} title={record.ho_remark || ''}>{record.ho_remark || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-center" title={record.verification_status || ''}>
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-green-100 text-green-800 whitespace-nowrap">{record.verification_status || '-'}</span>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '130px' }} title={record.submitted_by_name || ''}>{record.submitted_by_name || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '140px' }} title={record.moved_at ? record.moved_at.substring(0, 16).replace('T', ' ') : ''}>{record.moved_at ? record.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="date"
                                      value={paidDateEdits[record.id] ?? record.paid_date ?? ''}
                                      onChange={(e) => handlePaidDateChange(record.id, e.target.value)}
                                      className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      style={{ width: '125px' }}
                                    />
                                    {paidDateSaving[record.id] && (
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
                        </table>
                      );
                    })() : (
                      /* ─────────── BY SUBMISSION PERIOD TAB ─────────── */
                      !selectedPeriod ? (
                        /* Period summary table */
                        historyGrouped.groups?.length === 0 ? (
                          <div className="text-center py-20">
                            <p className="text-sm text-gray-500 font-medium">No grouped periods available</p>
                            <p className="text-[11px] text-gray-400 mt-1">No history records have a valid SR Reach at Site date.</p>
                          </div>
                        ) : (
                          <table className="border-collapse w-full">
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {[
                                  { label: 'Sr. No.', width: 60 },
                                  { label: 'Period (SR Reach at Site)', width: 320 },
                                  { label: 'Submitted By (HO Uploader)', width: 200 },
                                  { label: 'Number of Activity', width: 110 },
                                  { label: 'Total Amount', width: 160 },
                                  { label: 'Paid Date (Apply to All)', width: 240 },
                                ].map((col, i) => (
                                  <th key={i}
                                    className="px-3 py-2 text-[11px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ width: `${col.width}px`, backgroundColor: '#f0f1ff' }}>
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {historyGrouped.groups.map((g, idx) => (
                                <tr
                                  key={idx}
                                  className="hover:bg-blue-50 transition-colors"
                                  style={{ height: '38px' }}
                                >
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                    <button
                                      onClick={() => setSelectedPeriod(g)}
                                      className="inline-flex items-center gap-1.5 underline hover:font-bold transition-all cursor-pointer bg-transparent border-0 p-0"
                                      style={{ color: themeColor }}
                                      title="Click to view records in this period"
                                    >
                                      <span>{g.period_start_display}</span>
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                      </svg>
                                      <span>{g.period_end_display}</span>
                                    </button>
                                  </td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                    <span className="px-2 py-0.5 rounded-full font-medium">
                                      {g.uploaded_by}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">
                                    ₹{parseFloat(g.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                    {(() => {
                                      const key = `${g.uploaded_by}__${g.period_start}__${g.period_end}`;
                                      const val = periodPaidInputs[key] ?? g.paid_date ?? '';
                                      const applying = periodPaidApplying[key];
                                      return (
                                        <div className="flex items-center justify-center gap-1">
                                          <input
                                            type="date"
                                            value={val}
                                            onChange={(e) => setPeriodPaidInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            style={{ width: '125px' }}
                                          />
                                          <button
                                            onClick={() => handlePeriodPaidApply(g)}
                                            disabled={applying}
                                            className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                            title="Apply this date to every record in this period"
                                          >
                                            {applying ? '...' : 'Apply'}
                                          </button>
                                          {g.paid_count > 0 && (
                                            <span
                                              className="text-[9px] px-1.5 py-0.5 rounded-full"
                                              style={{
                                                background: g.paid_date ? '#d1fae5' : '#fef3c7',
                                                color: g.paid_date ? '#065f46' : '#92400e',
                                              }}
                                              title={g.paid_date ? 'All records share this date' : 'Mixed paid dates'}
                                            >
                                              {g.paid_date ? 'All paid' : `${g.paid_count}/${g.record_count} mixed`}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="sticky bottom-0">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                <td colSpan={3} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">
                                  {historyGrouped.groups.reduce((s, g) => s + (g.record_count || 0), 0)}
                                </td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200" style={{ color: themeColor }}>
                                  ₹{historyGrouped.groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border-t-2 border-gray-200" />
                              </tr>
                            </tfoot>
                          </table>
                        )
                      ) : (() => {
                        const idSet = new Set(selectedPeriod.record_ids || []);
                        let periodRecords = historyRecords.filter(r => idSet.has(r.id));
                        if (historyPeriodTaskStatusFilter.size > 0) {
                          periodRecords = periodRecords.filter(r =>
                            historyPeriodTaskStatusFilter.has(String(r.task_status || '').trim())
                          );
                        }
                        if (historyPeriodSrTypeFilter.size > 0) {
                          periodRecords = periodRecords.filter(r =>
                            historyPeriodSrTypeFilter.has(String(r.sr_type || '').trim())
                          );
                        }
                        if (historyPeriodManualFilter) {
                          periodRecords = periodRecords.filter(r =>
                            String(r.file_name || '').trim() === 'manual_entry.xlsx'
                          );
                        }
                        return (
                          <table className="border-collapse w-full" style={{ minWidth: '2800px', tableLayout: 'fixed' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {[
                                  { label: 'Sr. No.', width: 50 },
                                  { label: 'Appointment No.', width: 115 },
                                  { label: 'Engineer Name', width: 140 },
                                  { label: 'Engineer UID', width: 100 },
                                  { label: 'Branch', width: 130 },
                                  { label: 'Installation Address', width: 220 },
                                  { label: 'Account', width: 160 },
                                  { label: 'SR No.', width: 100 },
                                  { label: 'SR Type', width: 85 },
                                  { label: 'SR Sub Type', width: 95 },
                                  { label: 'SR Due Date', width: 100 },
                                  { label: 'Task Start Date', width: 110 },
                                  { label: 'Task End Date', width: 110 },
                                  { label: 'Task Status', width: 90 },
                                  { label: 'Task Assigned\nDate & Time', width: 125 },
                                  { label: 'Task Assign vs\nTrip Start', width: 120 },
                                  { label: 'SR Trip Start\nDate & Time', width: 125 },
                                  { label: 'SR Reach at Site\nDate & Time', width: 140 },
                                  { label: 'SR Trip Start\nLat Long', width: 130 },
                                  { label: 'SR Reach at Site\nLat Long', width: 145 },
                                  { label: 'KMs\nTravelled', width: 80 },
                                  { label: 'SR Closed Date', width: 110 },
                                  { label: 'SR Status', width: 95 },
                                  { label: 'Two Way KM', width: 85 },
                                  { label: 'Branch Verified\nKM', width: 105 },
                                  { label: 'Branch Verification\nRemark', width: 150 },
                                  { label: 'HO Corrected\nKM', width: 100 },
                                  { label: 'KM Rate', width: 80 },
                                  { label: 'DA Amount', width: 90 },
                                  { label: 'Total Amount', width: 100 },
                                  { label: 'HO Remark', width: 160 },
                                  { label: 'Verification\nStatus', width: 100 },
                                  { label: 'Submitted By', width: 130 },
                                  { label: 'Submitted At', width: 140 },
                                  { label: 'Paid Date', width: 145 },
                                ].map((col, i) => {
                                  if (col.label === 'Task Status') {
                                    const isActive = historyPeriodTaskStatusFilter.size > 0;
                                    const sourceRecords = historyRecords.filter(r => idSet.has(r.id));
                                    return (
                                      <th key={i}
                                        title={col.label.replace(/\n/g, ' ')}
                                        className="px-1 py-0.5 text-[10px] font-bold text-gray-700 border-r border-b border-gray-300 uppercase tracking-tight text-center align-middle"
                                        style={{
                                          width: `${col.width}px`,
                                          minWidth: `${col.width}px`,
                                          maxWidth: `${col.width}px`,
                                          backgroundColor: '#f0f1ff',
                                          whiteSpace: 'pre-line',
                                          wordBreak: 'break-word',
                                          overflowWrap: 'break-word',
                                          overflow: 'visible',
                                          minHeight: '34px',
                                          height: '34px',
                                          lineHeight: '1.15',
                                        }}>
                                        <div className="flex items-center justify-center gap-1">
                                          <span>{col.label}</span>
                                          <button
                                            onClick={(e) => openTaskStatusFilter(e, sourceRecords, historyPeriodTaskStatusFilter, setHistoryPeriodTaskStatusFilter)}
                                            className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                            title={isActive ? `Filtering: ${historyPeriodTaskStatusFilter.size} value(s)` : 'Filter Task Status'}
                                          >
                                            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                              <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-.553.894l-4 2A1 1 0 019 21v-8.586L3.293 6.707A1 1 0 013 6V4z" />
                                            </svg>
                                          </button>
                                        </div>
                                      </th>
                                    );
                                  }
                                  if (col.label === 'SR Type') {
                                    const isActive = historyPeriodSrTypeFilter.size > 0;
                                    const sourceRecords = historyRecords.filter(r => idSet.has(r.id));
                                    return (
                                      <th key={i}
                                        title={col.label.replace(/\n/g, ' ')}
                                        className="px-1 py-0.5 text-[10px] font-bold text-gray-700 border-r border-b border-gray-300 uppercase tracking-tight text-center align-middle"
                                        style={{
                                          width: `${col.width}px`,
                                          minWidth: `${col.width}px`,
                                          maxWidth: `${col.width}px`,
                                          backgroundColor: '#f0f1ff',
                                          whiteSpace: 'pre-line',
                                          wordBreak: 'break-word',
                                          overflowWrap: 'break-word',
                                          overflow: 'visible',
                                          minHeight: '34px',
                                          height: '34px',
                                          lineHeight: '1.15',
                                        }}>
                                        <div className="flex items-center justify-center gap-1">
                                          <span>{col.label}</span>
                                          <button
                                            onClick={(e) => openSrTypeFilter(e, sourceRecords, historyPeriodSrTypeFilter, setHistoryPeriodSrTypeFilter)}
                                            className={`p-0.5 rounded transition-colors ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-500'}`}
                                            title={isActive ? `Filtering: ${historyPeriodSrTypeFilter.size} value(s)` : 'Filter SR Type'}
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
                                      title={col.label.replace(/\n/g, ' ')}
                                      className="px-1 py-0.5 text-[10px] font-bold text-gray-700 border-r border-b border-gray-300 uppercase tracking-tight text-center align-middle"
                                      style={{
                                        width: `${col.width}px`,
                                        minWidth: `${col.width}px`,
                                        maxWidth: `${col.width}px`,
                                        backgroundColor: '#f0f1ff',
                                        whiteSpace: 'pre-line',
                                        wordBreak: 'break-word',
                                        overflowWrap: 'break-word',
                                        overflow: 'hidden',
                                        minHeight: '34px',
                                        height: '34px',
                                        lineHeight: '1.15',
                                      }}>
                                      {col.label}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {periodRecords.map((record, idx) => (
                                <tr key={record.id} className="hover:bg-blue-50/30 transition-colors" style={{ height: '32px' }}>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '115px' }} title={record.appointment_number || ''}>{record.appointment_number || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '140px' }} title={record.service_engineer_name || ''}>{record.service_engineer_name || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.service_engineer_uid || ''}>{record.service_engineer_uid || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '130px' }} title={record.sd_branch_name || record.sd_branch_code || ''}>{record.sd_branch_name || record.sd_branch_code || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '220px' }} title={record.installation_site_address || ''}>{record.installation_site_address || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '160px' }} title={record.account || ''}>{record.account || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.service_request_no || ''}>{record.service_request_no || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '85px' }} title={record.sr_type || ''}>{record.sr_type || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '95px' }} title={record.sr_sub_type || ''}>{record.sr_sub_type || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.sr_due_date || ''}>{record.sr_due_date || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '110px' }} title={record.task_start_date || ''}>{record.task_start_date || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '110px' }} title={record.task_end_date || ''}>{record.task_end_date || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '90px' }} title={record.task_status || ''}>{record.task_status || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '125px' }} title={record.task_assigned_datetime || ''}>{record.task_assigned_datetime || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '120px' }} title={record.task_assign_vs_trip_start || ''}>{record.task_assign_vs_trip_start || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '125px' }} title={record.sr_trip_start_datetime || ''}>{record.sr_trip_start_datetime || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '140px' }} title={record.sr_reach_at_site_datetime || ''}>{record.sr_reach_at_site_datetime || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '130px' }} title={record.sr_trip_start_lat_long || ''}>{record.sr_trip_start_lat_long || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '145px' }} title={record.sr_reach_at_site_lat_long || ''}>{record.sr_reach_at_site_lat_long || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold truncate" style={{ maxWidth: '80px' }} title={record.kms_travelled || ''}>{record.kms_travelled || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '110px' }} title={record.sr_closed_date || ''}>{record.sr_closed_date || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-center" title={record.sr_status || ''}>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] whitespace-nowrap ${record.sr_status === 'Closed' ? 'bg-green-100 text-green-800' : record.sr_status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                      {record.sr_status || '-'}
                                    </span>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '85px' }} title={record.two_way_km || ''}>{record.two_way_km || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '105px' }} title={record.branch_verified_km || ''}>{record.branch_verified_km || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '150px' }} title={record.km_verification_remark || ''}>{record.km_verification_remark || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '100px' }} title={record.ho_corrected_km || ''}>{record.ho_corrected_km || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '80px' }} title={record.km_rate_applied || ''}>{record.km_rate_applied || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-green-700 truncate" style={{ maxWidth: '90px' }} title={(parseFloat(record.da_amount) && parseFloat(record.da_amount) !== 0) ? `₹${record.da_amount}` : ''}>{(parseFloat(record.da_amount) && parseFloat(record.da_amount) !== 0) ? `₹${record.da_amount}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700 truncate" style={{ maxWidth: '100px' }} title={(parseFloat(record.total_amount) && parseFloat(record.total_amount) !== 0) ? `₹${record.total_amount}` : ''}>{(parseFloat(record.total_amount) && parseFloat(record.total_amount) !== 0) ? `₹${record.total_amount}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '160px' }} title={record.ho_remark || ''}>{record.ho_remark || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-center" title={record.verification_status || ''}>
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-green-100 text-green-800 whitespace-nowrap">{record.verification_status || '-'}</span>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '130px' }} title={record.submitted_by_name || ''}>{record.submitted_by_name || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center truncate" style={{ maxWidth: '140px' }} title={record.moved_at ? record.moved_at.substring(0, 16).replace('T', ' ') : ''}>{record.moved_at ? record.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="date"
                                        value={paidDateEdits[record.id] ?? record.paid_date ?? ''}
                                        onChange={(e) => handlePaidDateChange(record.id, e.target.value)}
                                        className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        style={{ width: '125px' }}
                                      />
                                      {paidDateSaving[record.id] && (
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
                          </table>
                        );
                      })()
                    )}
                  </div>

                  {/* Modal Footer */}
                  {!loadingHistory && (() => {
                    if (historyTab === 'periods') {
                      if (selectedPeriod) {
                        const idSet = new Set(selectedPeriod.record_ids || []);
                        const periodRecords = historyRecords.filter(r => idSet.has(r.id));
                        const total = periodRecords.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
                        return (
                          <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                              <span>Period: <strong className="text-gray-800">{selectedPeriod.period_start_display} → {selectedPeriod.period_end_display}</strong></span>
                              <span>|</span>
                              <span>Records: <strong className="text-gray-800">{periodRecords.length}</strong></span>
                              <span>|</span>
                              <span>Amount: <strong className="text-blue-700">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setSelectedPeriod(null)} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-blue-700 border-blue-300 hover:bg-blue-50">← Back</button>
                              <button onClick={closeHistoryModal} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                            </div>
                          </div>
                        );
                      }
                      const totalRecs = historyGrouped.groups?.reduce((s, g) => s + (g.record_count || 0), 0) || 0;
                      const totalAmt = historyGrouped.groups?.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0) || 0;
                      return (
                        <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>Total Periods: <strong className="text-gray-800">{historyGrouped.groups?.length || 0}</strong></span>
                            <span>|</span>
                            <span>Total Records: <strong className="text-gray-800">{totalRecs}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-blue-700">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </div>
                          <button onClick={closeHistoryModal} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                        </div>
                      );
                    }
                    // ALL records footer
                    const filtered = historyRecords.filter(record => {
                      const searchLower = historySearch.toLowerCase();
                      const matchesSearch = !historySearch || [
                        record.service_engineer_name, record.service_engineer_uid,
                        record.appointment_number, record.service_request_no, record.account,
                        record.sr_type, record.sr_sub_type, record.installation_site_address,
                        record.submitted_by_name,
                      ].some(val => val && val.toLowerCase().includes(searchLower));
                      const movedDate = record.moved_at ? record.moved_at.substring(0, 10) : '';
                      const matchesFrom = !historyDateFrom || movedDate >= historyDateFrom;
                      const matchesTo = !historyDateTo || movedDate <= historyDateTo;
                      let reachDate = '';
                      if (record.sr_reach_at_site_datetime) {
                        const d = new Date(record.sr_reach_at_site_datetime);
                        if (!isNaN(d.getTime())) {
                          reachDate = d.toISOString().substring(0, 10);
                        }
                      }
                      const matchesReachFrom = !historyReachDateFrom || (reachDate && reachDate >= historyReachDateFrom);
                      const matchesReachTo = !historyReachDateTo || (reachDate && reachDate <= historyReachDateTo);
                      const matchesEngineer = !historyEngineer || record.service_engineer_uid === historyEngineer;
                      const matchesTaskStatus = historyAllTaskStatusFilter.size === 0 ||
                        historyAllTaskStatusFilter.has(String(record.task_status || '').trim());
                      const matchesSrType = historyAllSrTypeFilter.size === 0 ||
                        historyAllSrTypeFilter.has(String(record.sr_type || '').trim());
                      const matchesManual = !historyAllManualFilter || String(record.file_name || '').trim() === 'manual_entry.xlsx';
                      return matchesSearch && matchesFrom && matchesTo && matchesReachFrom && matchesReachTo && matchesEngineer && matchesTaskStatus && matchesSrType && matchesManual;
                    });
                    const filteredCount = filtered.length;
                    const filteredTotal = filtered.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);
                    const isFiltered = historySearch || historyDateFrom || historyDateTo || historyReachDateFrom || historyReachDateTo || historyEngineer;
                    return (
                      <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{isFiltered ? <>Showing <strong>{filteredCount}</strong> of <strong>{historyRecords.length}</strong> records</> : <>Total Records: <strong>{filteredCount}</strong></>}</span>
                          <span>|</span>
                          <span>{isFiltered ? 'Filtered' : 'Total'} Amount: <strong className="text-blue-700">₹{filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          {isFiltered && (
                            <>
                              <span>|</span>
                              <span>All Amount: <strong className="text-gray-700">₹{historyRecords.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </>
                          )}
                        </div>
                        <button onClick={closeHistoryModal} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors">Close</button>
                      </div>
                    );
                  })()}
                </>
              )}
              {/* ════════════ END SERVICE ENGINEER SECTION ════════════ */}

              {/* ════════════ SALES SECTION ════════════ */}
              {historyMainTab === 'sales' && (
                <>
                  {/* Sales Sub-tab Bar */}
                  {!loadingSalesHistory && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setSalesHistoryTab('all'); setSalesSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: salesHistoryTab === 'all' ? themeColor : '#fff',
                          color: salesHistoryTab === 'all' ? 'white' : '#374151',
                          borderColor: salesHistoryTab === 'all' ? themeColor : '#e5e7eb',
                        }}
                      >
                        All Records ({salesHistoryRecords.length})
                      </button>
                      <button
                        onClick={() => { setSalesHistoryTab('periods'); setSalesSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: salesHistoryTab === 'periods' ? '#059669' : '#fff',
                          color: salesHistoryTab === 'periods' ? 'white' : '#374151',
                          borderColor: salesHistoryTab === 'periods' ? '#059669' : '#e5e7eb',
                        }}
                      >
                        By Submission Period ({salesHistoryGrouped.groups?.length || 0})
                      </button>

                      {salesHistoryTab === 'periods' && !salesSelectedPeriod && salesHistoryGrouped.rule_type && (
                        <span className="text-[10px] text-gray-600 ml-2 px-2 py-1 bg-white rounded border border-gray-200">
                          Rule: <strong>{salesHistoryGrouped.rule_type === 'weekdays' ? 'Weekly' : 'Monthly'}</strong>
                          {' • '}Period size: <strong>{salesHistoryGrouped.period_days} days</strong>
                        </span>
                      )}

                      {salesHistoryTab === 'periods' && salesSelectedPeriod && (
                        <>
                          <div className="flex items-center gap-2 ml-2 px-2.5 py-1 bg-purple-50 rounded-lg border border-purple-200 flex-wrap">
                            <span className="text-[11px] text-gray-600">Period:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {salesSelectedPeriod.period_start_display} → {salesSelectedPeriod.period_end_display}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Engineer:</span>
                            <span className="text-[11px] font-bold text-purple-700">{salesSelectedPeriod.engineer_name || '-'}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Submitted By:</span>
                            <span className="text-[11px] font-bold text-gray-800">{salesSelectedPeriod.uploaded_by}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Records:</span>
                            <span className="text-[11px] font-bold text-gray-800">{salesSelectedPeriod.record_count}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Total:</span>
                            <span className="text-[11px] font-bold text-blue-700">
                              ₹{parseFloat(salesSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <button
                            onClick={() => setSalesSelectedPeriod(null)}
                            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Sales All Records search bar */}
                  {!loadingSalesHistory && salesHistoryTab === 'all' && salesHistoryRecords.length > 0 && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[200px]">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={salesHistorySearch}
                          onChange={e => setSalesHistorySearch(e.target.value)}
                          placeholder="Search by customer, SR no, location, submitted by..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        {salesHistorySearch && (
                          <button onClick={() => setSalesHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {canExport && (
                        <button
                          onClick={() => {
                            const toExport = window.__salesHistoryFiltered || salesHistoryRecords;
                            exportToExcel(toExport, `sales_history_${historyBranch?.branch_code}.xlsx`, [
                              { key: 'date', label: 'Date' },
                              { key: 'sr_number', label: 'SR No.' },
                              { key: 'engineer_name', label: 'Engineer Name' },
                              { key: 'customer_name', label: 'Customer Name' },
                              { key: 'location', label: 'Location' },
                              { key: 'description_of_work', label: 'Description' },
                              { key: 'km_two_way', label: 'KM 2-Way' },
                              { key: 'ho_corrected_km', label: 'HO Corrected KM' },
                              { key: 'rate', label: 'Rate' },
                              { key: 'da', label: 'DA' },
                              { key: 'total_amount', label: 'Total Amount' },
                              { key: 'ho_remark', label: 'HO Remark' },
                              { key: 'submitted_by_name', label: 'Submitted By' },
                              { key: 'moved_at', label: 'Submitted At' },
                              { key: 'paid_date', label: 'Paid Date' },
                            ]);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
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

                  {/* Sales Body */}
                  <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                    {loadingSalesHistory ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: '#7c3aed' }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading sales history...</p>
                      </div>
                    ) : salesHistoryRecords.length === 0 ? (
                      <div className="text-center py-20">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No sales history records found</p>
                      </div>
                    ) : salesHistoryTab === 'all' ? (() => {
                      const sl = salesHistorySearch.toLowerCase();
                      const filtered = salesHistoryRecords.filter(r => !salesHistorySearch || [
                        r.customer_name, r.sr_number, r.location, r.description_of_work,
                        r.submitted_by_name,
                      ].some(v => v && v.toLowerCase().includes(sl)));
                      window.__salesHistoryFiltered = filtered;

                      return filtered.length === 0 ? (
                        <div className="text-center py-20">
                          <p className="text-sm text-gray-500">No matching records</p>
                        </div>
                      ) : (
                        <table className="border-collapse w-full" style={{ minWidth: '1750px' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#f3e8ff' }}>
                              {[
                                { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 }, { l: 'SR No.', w: 110 },
                                { l: 'Engineer Name', w: 150 },
                                { l: 'Customer Name', w: 180 }, { l: 'Location', w: 140 },
                                { l: 'Description', w: 200 }, { l: 'KM 2-Way', w: 85 },
                                { l: 'HO Corrected KM', w: 110 }, { l: 'Rate', w: 80 },
                                { l: 'DA', w: 90 }, { l: 'Total', w: 100 },
                                { l: 'HO Remark', w: 160 }, { l: 'Submitted By', w: 140 },
                                { l: 'Submitted At', w: 140 }, { l: 'Paid Date', w: 150 },
                              ].map((c, i) => (
                                <th key={i}
                                  className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                  style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#f3e8ff' }}>
                                  {c.l}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filtered.map((r, idx) => (
                              <tr key={r.id} className="hover:bg-purple-50/30" style={{ height: '34px' }}>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.date || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.sr_number || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate font-semibold text-purple-700" title={r.engineer_name}>{r.engineer_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.customer_name}>{r.customer_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.location}>{r.location || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.description_of_work}>{r.description_of_work || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.km_two_way || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.ho_corrected_km || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold">{r.rate ? `₹${r.rate}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-green-700">{(parseFloat(r.da) && parseFloat(r.da) !== 0) ? `₹${r.da}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700">{(parseFloat(r.total_amount) && parseFloat(r.total_amount) !== 0) ? `₹${r.total_amount}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.ho_remark}>{r.ho_remark || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.submitted_by_name || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{r.moved_at ? r.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="date"
                                      value={salesPaidDateEdits[r.id] ?? r.paid_date ?? ''}
                                      onChange={(e) => handleSalesPaidDateChange(r.id, e.target.value)}
                                      className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500"
                                      style={{ width: '125px' }}
                                    />
                                    {salesPaidDateSaving[r.id] && (
                                      <svg className="absolute -right-1 animate-spin h-3 w-3 text-purple-500" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="sticky bottom-0">
                            <tr style={{ backgroundColor: '#f3e8ff' }}>
                              <td colSpan={11} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200" style={{ color: '#7c3aed' }}>
                                ₹{filtered.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={4} className="border-t-2 border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })() : (
                      !salesSelectedPeriod ? (
                        salesHistoryGrouped.groups?.length === 0 ? (
                          <div className="text-center py-20">
                            <p className="text-sm text-gray-500 font-medium">No grouped periods available</p>
                          </div>
                        ) : (
                          <table className="border-collapse w-full">
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f3e8ff' }}>
                                {[
                                  { label: 'Sr. No.', width: 60 },
                                  { label: 'Period (Sales Date)', width: 280 },
                                  { label: 'Engineer Name', width: 160 },
                                  { label: 'Submitted By (HO Uploader)', width: 180 },
                                  { label: 'Records', width: 90 },
                                  { label: 'Total Amount', width: 140 },
                                  { label: 'Paid Date (Apply to All)', width: 240 },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-3 py-2 text-[11px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ minWidth: `${c.width}px`, backgroundColor: '#f3e8ff' }}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {salesHistoryGrouped.groups.map((g, idx) => {
                                const key = `${g.uploaded_by}__${g.period_start}__${g.period_end}`;
                                const val = salesPeriodPaidInputs[key] ?? g.paid_date ?? '';
                                const applying = salesPeriodPaidApplying[key];
                                return (
                                  <tr key={idx} className="hover:bg-purple-50" style={{ height: '38px' }}>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <button
                                        onClick={() => setSalesSelectedPeriod(g)}
                                        className="inline-flex items-center gap-1.5 underline hover:font-bold cursor-pointer bg-transparent border-0 p-0"
                                        style={{ color: '#2f3192' }}
                                      >
                                        <span>{g.period_start_display}</span>
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                        <span>{g.period_end_display}</span>
                                      </button>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-semibold text-purple-700">
                                      <div className="truncate" title={g.engineer_name || '-'}>{g.engineer_name || '-'}</div>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <div className="truncate" title={g.created_by_names || '-'}>{g.created_by_names || '-'}</div>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">
                                      ₹{parseFloat(g.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <input
                                          type="date"
                                          value={val}
                                          onChange={(e) => setSalesPeriodPaidInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                          className="px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500"
                                          style={{ width: '125px' }}
                                        />
                                        <button
                                          onClick={() => handleSalesPeriodPaidApply(g)}
                                          disabled={applying}
                                          className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                        >
                                          {applying ? '...' : 'Apply'}
                                        </button>
                                        {g.paid_count > 0 && (
                                          <span
                                            className="text-[9px] px-1.5 py-0.5 rounded-full"
                                            style={{
                                              background: g.paid_date ? '#d1fae5' : '#fef3c7',
                                              color: g.paid_date ? '#065f46' : '#92400e',
                                            }}
                                          >
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
                              <tr style={{ backgroundColor: '#f3e8ff' }}>
                                <td colSpan={5} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">
                                  {salesHistoryGrouped.groups.reduce((s, g) => s + (g.record_count || 0), 0)}
                                </td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200" style={{ color: '#7c3aed' }}>
                                  ₹{salesHistoryGrouped.groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border-t-2 border-gray-200" />
                              </tr>
                            </tfoot>
                          </table>
                        )
                      ) : (() => {
                        const idSet = new Set(salesSelectedPeriod.record_ids || []);
                        const periodRecords = salesHistoryRecords.filter(r => idSet.has(r.id));
                        return (
                          <table className="border-collapse w-full" style={{ minWidth: '1750px' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f3e8ff' }}>
                                {[
                                  { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 }, { l: 'SR No.', w: 110 },
                                  { l: 'Engineer Name', w: 150 },
                                  { l: 'Customer Name', w: 180 }, { l: 'Location', w: 140 },
                                  { l: 'Description', w: 200 }, { l: 'KM 2-Way', w: 85 },
                                  { l: 'HO Corrected KM', w: 110 }, { l: 'Rate', w: 80 },
                                  { l: 'DA', w: 90 }, { l: 'Total', w: 100 },
                                  { l: 'HO Remark', w: 160 }, { l: 'Submitted By', w: 140 },
                                  { l: 'Submitted At', w: 140 }, { l: 'Paid Date', w: 150 },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#f3e8ff' }}>
                                    {c.l}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {periodRecords.map((r, idx) => (
                                <tr key={r.id} className="hover:bg-purple-50/30" style={{ height: '34px' }}>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.date || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.sr_number || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate font-semibold text-purple-700" title={r.engineer_name}>{r.engineer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.customer_name}>{r.customer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.location}>{r.location || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.description_of_work}>{r.description_of_work || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.km_two_way || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.ho_corrected_km || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold">{r.rate ? `₹${r.rate}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-green-700">{(parseFloat(r.da) && parseFloat(r.da) !== 0) ? `₹${r.da}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700">{(parseFloat(r.total_amount) && parseFloat(r.total_amount) !== 0) ? `₹${r.total_amount}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.ho_remark}>{r.ho_remark || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.submitted_by_name || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{r.moved_at ? r.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="date"
                                        value={salesPaidDateEdits[r.id] ?? r.paid_date ?? ''}
                                        onChange={(e) => handleSalesPaidDateChange(r.id, e.target.value)}
                                        className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-purple-500"
                                        style={{ width: '125px' }}
                                      />
                                      {salesPaidDateSaving[r.id] && (
                                        <svg className="absolute -right-1 animate-spin h-3 w-3 text-purple-500" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })()
                    )}
                  </div>

                  {/* Sales Footer */}
                  {!loadingSalesHistory && (
                    <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        {salesHistoryTab === 'periods' && salesSelectedPeriod ? (
                          <>
                            <span>Period: <strong className="text-gray-800">{salesSelectedPeriod.period_start_display} → {salesSelectedPeriod.period_end_display}</strong></span>
                            <span>|</span>
                            <span>Records: <strong className="text-gray-800">{salesSelectedPeriod.record_count}</strong></span>
                            <span>|</span>
                            <span>Amount: <strong className="text-purple-700">₹{parseFloat(salesSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        ) : salesHistoryTab === 'periods' ? (
                          <>
                            <span>Total Periods: <strong className="text-gray-800">{salesHistoryGrouped.groups?.length || 0}</strong></span>
                            <span>|</span>
                            <span>Total Records: <strong className="text-gray-800">{salesHistoryGrouped.groups?.reduce((s, g) => s + (g.record_count || 0), 0) || 0}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-purple-700">₹{(salesHistoryGrouped.groups?.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        ) : (
                          <>
                            <span>Total Records: <strong className="text-gray-800">{salesHistoryRecords.length}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-purple-700">₹{salesHistoryRecords.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        )}
                      </div>
                      <button onClick={closeHistoryModal} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                    </div>
                  )}
                </>
              )}
              {/* ════════════ END SALES SECTION ════════════ */}

              {/* ════════════ KM WISE SECTION ════════════ */}
              {historyMainTab === 'km_wise' && (
                <>
                  {/* KM Wise Sub-tab Bar */}
                  {!loadingKmWiseHistory && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setKmWiseHistoryTab('all'); setKmWiseSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: kmWiseHistoryTab === 'all' ? themeColor : '#fff',
                          color: kmWiseHistoryTab === 'all' ? 'white' : '#374151',
                          borderColor: kmWiseHistoryTab === 'all' ? themeColor : '#e5e7eb',
                        }}
                      >
                        All Records ({kmWiseHistoryRecords.length})
                      </button>
                      <button
                        onClick={() => { setKmWiseHistoryTab('periods'); setKmWiseSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: kmWiseHistoryTab === 'periods' ? '#059669' : '#fff',
                          color: kmWiseHistoryTab === 'periods' ? 'white' : '#374151',
                          borderColor: kmWiseHistoryTab === 'periods' ? '#059669' : '#e5e7eb',
                        }}
                      >
                        By Submission Period ({kmWiseHistoryGrouped.groups?.length || 0})
                      </button>

                      {kmWiseHistoryTab === 'periods' && !kmWiseSelectedPeriod && kmWiseHistoryGrouped.rule_type && (
                        <span className="text-[10px] text-gray-600 ml-2 px-2 py-1 bg-white rounded border border-gray-200">
                          Rule: <strong>{kmWiseHistoryGrouped.rule_type === 'weekdays' ? 'Weekly' : 'Monthly'}</strong>
                          {' • '}Period size: <strong>{kmWiseHistoryGrouped.period_days} days</strong>
                        </span>
                      )}

                      {kmWiseHistoryTab === 'periods' && kmWiseSelectedPeriod && (
                        <>
                          <div className="flex items-center gap-2 ml-2 px-2.5 py-1 bg-cyan-50 rounded-lg border border-cyan-200 flex-wrap">
                            <span className="text-[11px] text-gray-600">Period:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {kmWiseSelectedPeriod.period_start_display} → {kmWiseSelectedPeriod.period_end_display}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Engineer:</span>
                            <span className="text-[11px] font-bold text-purple-700">{kmWiseSelectedPeriod.engineer_name || '-'}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Submitted By:</span>
                            <span className="text-[11px] font-bold text-cyan-700">{kmWiseSelectedPeriod.uploaded_by}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Records:</span>
                            <span className="text-[11px] font-bold text-gray-800">{kmWiseSelectedPeriod.record_count}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Total:</span>
                            <span className="text-[11px] font-bold text-blue-700">
                              ₹{parseFloat(kmWiseSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <button
                            onClick={() => setKmWiseSelectedPeriod(null)}
                            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] text-cyan-700 border border-cyan-300 rounded-lg hover:bg-cyan-50"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* KM Wise All Records search bar */}
                  {!loadingKmWiseHistory && kmWiseHistoryTab === 'all' && kmWiseHistoryRecords.length > 0 && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[200px]">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={kmWiseHistorySearch}
                          onChange={e => setKmWiseHistorySearch(e.target.value)}
                          placeholder="Search by customer, SR/Invoice/Engine no, work, submitted by..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                        {kmWiseHistorySearch && (
                          <button onClick={() => setKmWiseHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {canExport && (
                        <button
                          onClick={() => {
                            const toExport = window.__kmWiseHistoryFiltered || kmWiseHistoryRecords;
                            exportToExcel(toExport, `km_wise_history_${historyBranch?.branch_code}.xlsx`, [
                              { key: 'date', label: 'Date' },
                              { key: 'engineer_name', label: 'Engineer Name' },
                              { key: 'customer_name', label: 'Customer Name' },
                              { key: 'sr_invoice_engine_no', label: 'SR/Invoice/Engine No.' },
                              { key: 'work_description', label: 'Work Description' },
                              { key: 'km', label: 'KM' },
                              { key: 'ho_corrected_km', label: 'HO Corrected KM' },
                              { key: 'work_status', label: 'Work Status' },
                              { key: 'asset_count', label: 'Asset Count' },
                              { key: 'kva_hp', label: 'KVA/HP' },
                              { key: 'labour_sale_expected', label: 'Labour Sale' },
                              { key: 'part_sale_expected', label: 'Part Sale' },
                              { key: 'rate', label: 'Rate' },
                              { key: 'da', label: 'DA' },
                              { key: 'amount', label: 'Amount' },
                              { key: 'ho_remark', label: 'HO Remark' },
                              { key: 'submitted_by_name', label: 'Submitted By' },
                              { key: 'moved_at', label: 'Submitted At' },
                              { key: 'paid_date', label: 'Paid Date' },
                            ]);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
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

                  {/* KM Wise Body */}
                  <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                    {loadingKmWiseHistory ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: '#0891b2' }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading KM Wise history...</p>
                      </div>
                    ) : kmWiseHistoryRecords.length === 0 ? (
                      <div className="text-center py-20">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No KM Wise history records found</p>
                      </div>
                    ) : kmWiseHistoryTab === 'all' ? (() => {
                      const sl = kmWiseHistorySearch.toLowerCase();
                      const filtered = kmWiseHistoryRecords.filter(r => !kmWiseHistorySearch || [
                        r.customer_name, r.sr_invoice_engine_no, r.work_description,
                        r.work_status, r.submitted_by_name,
                      ].some(v => v && v.toLowerCase().includes(sl)));
                      window.__kmWiseHistoryFiltered = filtered;

                      return filtered.length === 0 ? (
                        <div className="text-center py-20">
                          <p className="text-sm text-gray-500">No matching records</p>
                        </div>
                      ) : (
                        <table className="border-collapse w-full" style={{ minWidth: '1950px' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#cffafe' }}>
                              {[
                                { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 },
                                { l: 'Engineer Name', w: 150 },
                                { l: 'Customer Name', w: 180 }, { l: 'SR/Inv/Engine No.', w: 150 },
                                { l: 'Work Description', w: 200 }, { l: 'KM', w: 70 },
                                { l: 'HO Corrected KM', w: 110 }, { l: 'Work Status', w: 100 },
                                { l: 'Asset Count', w: 80 }, { l: 'KVA/HP', w: 80 },
                                { l: 'Labour Sale', w: 90 }, { l: 'Part Sale', w: 90 },
                                { l: 'Rate', w: 70 }, { l: 'DA', w: 80 },
                                { l: 'Amount', w: 100 }, { l: 'HO Remark', w: 150 },
                                { l: 'Submitted By', w: 140 }, { l: 'Submitted At', w: 140 },
                                { l: 'Paid Date', w: 150 },
                              ].map((c, i) => (
                                <th key={i}
                                  className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                  style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#cffafe' }}>
                                  {c.l}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filtered.map((r, idx) => (
                              <tr key={r.id} className="hover:bg-cyan-50/30" style={{ height: '34px' }}>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.date || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate font-semibold text-purple-700" title={r.engineer_name}>{r.engineer_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.customer_name}>{r.customer_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.sr_invoice_engine_no}>{r.sr_invoice_engine_no || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.work_description}>{r.work_description || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.km || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.ho_corrected_km || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700">{r.work_status || '-'}</span>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.asset_count || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.kva_hp || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.labour_sale_expected ? `₹${r.labour_sale_expected}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.part_sale_expected ? `₹${r.part_sale_expected}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold">{r.rate ? `₹${r.rate}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-green-700">{(parseFloat(r.da) && parseFloat(r.da) !== 0) ? `₹${r.da}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700">{(parseFloat(r.amount) && parseFloat(r.amount) !== 0) ? `₹${r.amount}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.ho_remark}>{r.ho_remark || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.submitted_by_name || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{r.moved_at ? r.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="date"
                                      value={kmWisePaidDateEdits[r.id] ?? r.paid_date ?? ''}
                                      onChange={(e) => handleKmWisePaidDateChange(r.id, e.target.value)}
                                      className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      style={{ width: '125px' }}
                                    />
                                    {kmWisePaidDateSaving[r.id] && (
                                      <svg className="absolute -right-1 animate-spin h-3 w-3 text-cyan-500" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="sticky bottom-0">
                            <tr style={{ backgroundColor: '#cffafe' }}>
                              <td colSpan={15} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200" style={{ color: '#0891b2' }}>
                                ₹{filtered.reduce((s, r) => s + parseFloat(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={4} className="border-t-2 border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })() : (
                      !kmWiseSelectedPeriod ? (
                        kmWiseHistoryGrouped.groups?.length === 0 ? (
                          <div className="text-center py-20">
                            <p className="text-sm text-gray-500 font-medium">No grouped periods available</p>
                          </div>
                        ) : (
                          <table className="border-collapse w-full">
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#cffafe' }}>
                                {[
                                  { label: 'Sr. No.', width: 60 },
                                  { label: 'Period (Activity Date)', width: 280 },
                                  { label: 'Engineer Name', width: 160 },
                                  { label: 'Submitted By (HO Uploader)', width: 180 },
                                  { label: 'Records', width: 90 },
                                  { label: 'Total Amount', width: 140 },
                                  { label: 'Paid Date (Apply to All)', width: 240 },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-3 py-2 text-[11px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ minWidth: `${c.width}px`, backgroundColor: '#cffafe' }}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {kmWiseHistoryGrouped.groups.map((g, idx) => {
                                const key = `${g.uploaded_by}__${g.period_start}__${g.period_end}`;
                                const val = kmWisePeriodPaidInputs[key] ?? g.paid_date ?? '';
                                const applying = kmWisePeriodPaidApplying[key];
                                return (
                                  <tr key={idx} className="hover:bg-cyan-50" style={{ height: '38px' }}>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <button
                                        onClick={() => setKmWiseSelectedPeriod(g)}
                                        className="inline-flex items-center gap-1.5 underline hover:font-bold cursor-pointer bg-transparent border-0 p-0"
                                        style={{ color: '#2f3192' }}
                                      >
                                        <span>{g.period_start_display}</span>
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                        <span>{g.period_end_display}</span>
                                      </button>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-semibold text-purple-700">
                                      <div className="truncate" title={g.engineer_name || '-'}>{g.engineer_name || '-'}</div>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <div className="truncate" title={g.created_by_names || '-'}>{g.created_by_names || '-'}</div>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">
                                      ₹{parseFloat(g.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <input
                                          type="date"
                                          value={val}
                                          onChange={(e) => setKmWisePeriodPaidInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                          className="px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                          style={{ width: '125px' }}
                                        />
                                        <button
                                          onClick={() => handleKmWisePeriodPaidApply(g)}
                                          disabled={applying}
                                          className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                        >
                                          {applying ? '...' : 'Apply'}
                                        </button>
                                        {g.paid_count > 0 && (
                                          <span
                                            className="text-[9px] px-1.5 py-0.5 rounded-full"
                                            style={{
                                              background: g.paid_date ? '#d1fae5' : '#fef3c7',
                                              color: g.paid_date ? '#065f46' : '#92400e',
                                            }}
                                          >
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
                              <tr style={{ backgroundColor: '#cffafe' }}>
                                <td colSpan={5} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">
                                  {kmWiseHistoryGrouped.groups.reduce((s, g) => s + (g.record_count || 0), 0)}
                                </td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200" style={{ color: '#0891b2' }}>
                                  ₹{kmWiseHistoryGrouped.groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border-t-2 border-gray-200" />
                              </tr>
                            </tfoot>
                          </table>
                        )
                      ) : (() => {
                        const idSet = new Set(kmWiseSelectedPeriod.record_ids || []);
                        const periodRecords = kmWiseHistoryRecords.filter(r => idSet.has(r.id));
                        return (
                          <table className="border-collapse w-full" style={{ minWidth: '1950px' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#cffafe' }}>
                                {[
                                  { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 },
                                  { l: 'Engineer Name', w: 150 },
                                  { l: 'Customer Name', w: 180 }, { l: 'SR/Inv/Engine No.', w: 150 },
                                  { l: 'Work Description', w: 200 }, { l: 'KM', w: 70 },
                                  { l: 'HO Corrected KM', w: 110 }, { l: 'Work Status', w: 100 },
                                  { l: 'Asset Count', w: 80 }, { l: 'KVA/HP', w: 80 },
                                  { l: 'Labour Sale', w: 90 }, { l: 'Part Sale', w: 90 },
                                  { l: 'Rate', w: 70 }, { l: 'DA', w: 80 },
                                  { l: 'Amount', w: 100 }, { l: 'HO Remark', w: 150 },
                                  { l: 'Submitted By', w: 140 }, { l: 'Submitted At', w: 140 },
                                  { l: 'Paid Date', w: 150 },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#cffafe' }}>
                                    {c.l}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {periodRecords.map((r, idx) => (
                                <tr key={r.id} className="hover:bg-cyan-50/30" style={{ height: '34px' }}>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.date || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate font-semibold text-purple-700" title={r.engineer_name}>{r.engineer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.customer_name}>{r.customer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.sr_invoice_engine_no}>{r.sr_invoice_engine_no || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.work_description}>{r.work_description || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.km || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.ho_corrected_km || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700">{r.work_status || '-'}</span>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.asset_count || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.kva_hp || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.labour_sale_expected ? `₹${r.labour_sale_expected}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.part_sale_expected ? `₹${r.part_sale_expected}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold">{r.rate ? `₹${r.rate}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-semibold text-green-700">{(parseFloat(r.da) && parseFloat(r.da) !== 0) ? `₹${r.da}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700">{(parseFloat(r.amount) && parseFloat(r.amount) !== 0) ? `₹${r.amount}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.ho_remark}>{r.ho_remark || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.submitted_by_name || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{r.moved_at ? r.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="date"
                                        value={kmWisePaidDateEdits[r.id] ?? r.paid_date ?? ''}
                                        onChange={(e) => handleKmWisePaidDateChange(r.id, e.target.value)}
                                        className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                        style={{ width: '125px' }}
                                      />
                                      {kmWisePaidDateSaving[r.id] && (
                                        <svg className="absolute -right-1 animate-spin h-3 w-3 text-cyan-500" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })()
                    )}
                  </div>

                  {/* KM Wise Footer */}
                  {!loadingKmWiseHistory && (
                    <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        {kmWiseHistoryTab === 'periods' && kmWiseSelectedPeriod ? (
                          <>
                            <span>Period: <strong className="text-gray-800">{kmWiseSelectedPeriod.period_start_display} → {kmWiseSelectedPeriod.period_end_display}</strong></span>
                            <span>|</span>
                            <span>Records: <strong className="text-gray-800">{kmWiseSelectedPeriod.record_count}</strong></span>
                            <span>|</span>
                            <span>Amount: <strong className="text-cyan-700">₹{parseFloat(kmWiseSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        ) : kmWiseHistoryTab === 'periods' ? (
                          <>
                            <span>Total Periods: <strong className="text-gray-800">{kmWiseHistoryGrouped.groups?.length || 0}</strong></span>
                            <span>|</span>
                            <span>Total Records: <strong className="text-gray-800">{kmWiseHistoryGrouped.groups?.reduce((s, g) => s + (g.record_count || 0), 0) || 0}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-cyan-700">₹{(kmWiseHistoryGrouped.groups?.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        ) : (
                          <>
                            <span>Total Records: <strong className="text-gray-800">{kmWiseHistoryRecords.length}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-cyan-700">₹{kmWiseHistoryRecords.reduce((s, r) => s + parseFloat(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        )}
                      </div>
                      <button onClick={closeHistoryModal} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                    </div>
                  )}
                </>
              )}
              {/* ════════════ END KM WISE SECTION ════════════ */}

              {/* ════════════ BILL WISE SECTION ════════════ */}
              {historyMainTab === 'bill_wise' && (
                <>
                  {/* Bill Wise Sub-tab Bar */}
                  {!loadingBillWiseHistory && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setBillWiseHistoryTab('all'); setBillWiseSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: billWiseHistoryTab === 'all' ? themeColor : '#fff',
                          color: billWiseHistoryTab === 'all' ? 'white' : '#374151',
                          borderColor: billWiseHistoryTab === 'all' ? themeColor : '#e5e7eb',
                        }}
                      >
                        All Records ({billWiseHistoryRecords.length})
                      </button>
                      <button
                        onClick={() => { setBillWiseHistoryTab('periods'); setBillWiseSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: billWiseHistoryTab === 'periods' ? '#059669' : '#fff',
                          color: billWiseHistoryTab === 'periods' ? 'white' : '#374151',
                          borderColor: billWiseHistoryTab === 'periods' ? '#059669' : '#e5e7eb',
                        }}
                      >
                        By Submission Period ({billWiseHistoryGrouped.groups?.length || 0})
                      </button>

                      {billWiseHistoryTab === 'periods' && !billWiseSelectedPeriod && billWiseHistoryGrouped.rule_type && (
                        <span className="text-[10px] text-gray-600 ml-2 px-2 py-1 bg-white rounded border border-gray-200">
                          Rule: <strong>{billWiseHistoryGrouped.rule_type === 'weekdays' ? 'Weekly' : 'Monthly'}</strong>
                          {' • '}Period size: <strong>{billWiseHistoryGrouped.period_days} days</strong>
                        </span>
                      )}

                      {billWiseHistoryTab === 'periods' && billWiseSelectedPeriod && (
                        <>
                          <div className="flex items-center gap-2 ml-2 px-2.5 py-1 bg-orange-50 rounded-lg border border-orange-200 flex-wrap">
                            <span className="text-[11px] text-gray-600">Period:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {billWiseSelectedPeriod.period_start_display} → {billWiseSelectedPeriod.period_end_display}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Engineer:</span>
                            <span className="text-[11px] font-bold text-purple-700">{billWiseSelectedPeriod.engineer_name || '-'}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Submitted By:</span>
                            <span className="text-[11px] font-bold text-orange-700">{billWiseSelectedPeriod.uploaded_by}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Records:</span>
                            <span className="text-[11px] font-bold text-gray-800">{billWiseSelectedPeriod.record_count}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Total:</span>
                            <span className="text-[11px] font-bold text-blue-700">
                              ₹{parseFloat(billWiseSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <button
                            onClick={() => setBillWiseSelectedPeriod(null)}
                            className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-50"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Bill Wise All Records search bar */}
                  {!loadingBillWiseHistory && billWiseHistoryTab === 'all' && billWiseHistoryRecords.length > 0 && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[200px]">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={billWiseHistorySearch}
                          onChange={e => setBillWiseHistorySearch(e.target.value)}
                          placeholder="Search by customer, SR/Invoice/Engine no, expense head, submitted by..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                        {billWiseHistorySearch && (
                          <button onClick={() => setBillWiseHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {canExport && (
                        <button
                          onClick={() => {
                            const toExport = window.__billWiseHistoryFiltered || billWiseHistoryRecords;
                            exportToExcel(toExport, `bill_wise_history_${historyBranch?.branch_code}.xlsx`, [
                              { key: 'date', label: 'Date' },
                              { key: 'engineer_name', label: 'Engineer Name' },
                              { key: 'customer_name', label: 'Customer Name' },
                              { key: 'sr_invoice_engine_no', label: 'SR/Invoice/Engine No.' },
                              { key: 'expenses_head', label: 'Expenses Head' },
                              { key: 'work_description', label: 'Work Description' },
                              { key: 'work_status', label: 'Work Status' },
                              { key: 'amount', label: 'Amount' },
                              { key: 'submitted_by_name', label: 'Submitted By' },
                              { key: 'moved_at', label: 'Submitted At' },
                              { key: 'paid_date', label: 'Paid Date' },
                            ]);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
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

                  {/* Bill Wise Body */}
                  <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                    {loadingBillWiseHistory ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: '#ea580c' }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm text-gray-500">Loading Bill Wise history...</p>
                      </div>
                    ) : billWiseHistoryRecords.length === 0 ? (
                      <div className="text-center py-20">
                        <svg className="h-14 w-14 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-gray-500 font-medium">No Bill Wise history records found</p>
                      </div>
                    ) : billWiseHistoryTab === 'all' ? (() => {
                      const sl = billWiseHistorySearch.toLowerCase();
                      const filtered = billWiseHistoryRecords.filter(r => !billWiseHistorySearch || [
                        r.customer_name, r.sr_invoice_engine_no, r.expenses_head,
                        r.work_description, r.work_status, r.submitted_by_name,
                      ].some(v => v && v.toLowerCase().includes(sl)));
                      window.__billWiseHistoryFiltered = filtered;

                      return filtered.length === 0 ? (
                        <div className="text-center py-20">
                          <p className="text-sm text-gray-500">No matching records</p>
                        </div>
                      ) : (
                        <table className="border-collapse w-full" style={{ minWidth: '1660px' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#ffedd5' }}>
                              {[
                                { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 },
                                { l: 'Engineer Name', w: 150 },
                                { l: 'Customer Name', w: 180 }, { l: 'SR/Inv/Engine No.', w: 150 },
                                { l: 'Expense Head', w: 150 }, { l: 'Work Description', w: 220 },
                                { l: 'Work Status', w: 110 }, { l: 'Amount', w: 110 },
                                { l: 'Submitted By', w: 140 }, { l: 'Submitted At', w: 140 },
                                { l: 'Paid Date', w: 150 },
                              ].map((c, i) => (
                                <th key={i}
                                  className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                  style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#ffedd5' }}>
                                  {c.l}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filtered.map((r, idx) => (
                              <tr key={r.id} className="hover:bg-orange-50/30" style={{ height: '34px' }}>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.date || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate font-semibold text-purple-700" title={r.engineer_name}>{r.engineer_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.customer_name}>{r.customer_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.sr_invoice_engine_no}>{r.sr_invoice_engine_no || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.expenses_head}>{r.expenses_head || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.work_description}>{r.work_description || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700">{r.work_status || '-'}</span>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700">{(parseFloat(r.amount) && parseFloat(r.amount) !== 0) ? `₹${parseFloat(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.submitted_by_name || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{r.moved_at ? r.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="date"
                                      value={billWisePaidDateEdits[r.id] ?? r.paid_date ?? ''}
                                      onChange={(e) => handleBillWisePaidDateChange(r.id, e.target.value)}
                                      className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-orange-500"
                                      style={{ width: '125px' }}
                                    />
                                    {billWisePaidDateSaving[r.id] && (
                                      <svg className="absolute -right-1 animate-spin h-3 w-3 text-orange-500" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="sticky bottom-0">
                            <tr style={{ backgroundColor: '#ffedd5' }}>
                              <td colSpan={8} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200" style={{ color: '#ea580c' }}>
                                ₹{filtered.reduce((s, r) => s + parseFloat(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td colSpan={3} className="border-t-2 border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })() : (
                      !billWiseSelectedPeriod ? (
                        billWiseHistoryGrouped.groups?.length === 0 ? (
                          <div className="text-center py-20">
                            <p className="text-sm text-gray-500 font-medium">No grouped periods available</p>
                          </div>
                        ) : (
                          <table className="border-collapse w-full">
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#ffedd5' }}>
                                {[
                                  { label: 'Sr. No.', width: 60 },
                                  { label: 'Period (Activity Date)', width: 280 },
                                  { label: 'Engineer Name', width: 160 },
                                  { label: 'Submitted By (HO Uploader)', width: 180 },
                                  { label: 'Records', width: 90 },
                                  { label: 'Total Amount', width: 140 },
                                  { label: 'Paid Date (Apply to All)', width: 240 },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-3 py-2 text-[11px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ minWidth: `${c.width}px`, backgroundColor: '#ffedd5' }}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {billWiseHistoryGrouped.groups.map((g, idx) => {
                                const key = `${g.uploaded_by}__${g.period_start}__${g.period_end}`;
                                const val = billWisePeriodPaidInputs[key] ?? g.paid_date ?? '';
                                const applying = billWisePeriodPaidApplying[key];
                                return (
                                  <tr key={idx} className="hover:bg-orange-50" style={{ height: '38px' }}>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <button
                                        onClick={() => setBillWiseSelectedPeriod(g)}
                                        className="inline-flex items-center gap-1.5 underline hover:font-bold cursor-pointer bg-transparent border-0 p-0"
                                        style={{ color: '#2f3192' }}
                                      >
                                        <span>{g.period_start_display}</span>
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                        <span>{g.period_end_display}</span>
                                      </button>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-semibold text-purple-700">
                                      <div className="truncate" title={g.engineer_name || '-'}>{g.engineer_name || '-'}</div>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <div className="truncate" title={g.created_by_names || '-'}>{g.created_by_names || '-'}</div>
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">
                                      ₹{parseFloat(g.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <input
                                          type="date"
                                          value={val}
                                          onChange={(e) => setBillWisePeriodPaidInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                          className="px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-orange-500"
                                          style={{ width: '125px' }}
                                        />
                                        <button
                                          onClick={() => handleBillWisePeriodPaidApply(g)}
                                          disabled={applying}
                                          className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                        >
                                          {applying ? '...' : 'Apply'}
                                        </button>
                                        {g.paid_count > 0 && (
                                          <span
                                            className="text-[9px] px-1.5 py-0.5 rounded-full"
                                            style={{
                                              background: g.paid_date ? '#d1fae5' : '#fef3c7',
                                              color: g.paid_date ? '#065f46' : '#92400e',
                                            }}
                                          >
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
                              <tr style={{ backgroundColor: '#ffedd5' }}>
                                <td colSpan={5} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">
                                  {billWiseHistoryGrouped.groups.reduce((s, g) => s + (g.record_count || 0), 0)}
                                </td>
                                <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200" style={{ color: '#ea580c' }}>
                                  ₹{billWiseHistoryGrouped.groups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="border-t-2 border-gray-200" />
                              </tr>
                            </tfoot>
                          </table>
                        )
                      ) : (() => {
                        const idSet = new Set(billWiseSelectedPeriod.record_ids || []);
                        const periodRecords = billWiseHistoryRecords.filter(r => idSet.has(r.id));
                        return (
                          <table className="border-collapse w-full" style={{ minWidth: '1660px' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#ffedd5' }}>
                                {[
                                  { l: 'Sr.', w: 50 }, { l: 'Date', w: 100 },
                                  { l: 'Engineer Name', w: 150 },
                                  { l: 'Customer Name', w: 180 }, { l: 'SR/Inv/Engine No.', w: 150 },
                                  { l: 'Expense Head', w: 150 }, { l: 'Work Description', w: 220 },
                                  { l: 'Work Status', w: 110 }, { l: 'Amount', w: 110 },
                                  { l: 'Submitted By', w: 140 }, { l: 'Submitted At', w: 140 },
                                  { l: 'Paid Date', w: 150 },
                                ].map((c, i) => (
                                  <th key={i}
                                    className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ width: `${c.w}px`, minWidth: `${c.w}px`, backgroundColor: '#ffedd5' }}>
                                    {c.l}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {periodRecords.map((r, idx) => (
                                <tr key={r.id} className="hover:bg-orange-50/30" style={{ height: '34px' }}>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.date || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate font-semibold text-purple-700" title={r.engineer_name}>{r.engineer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.customer_name}>{r.customer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.sr_invoice_engine_no}>{r.sr_invoice_engine_no || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.expenses_head}>{r.expenses_head || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px]"><div className="truncate" title={r.work_description}>{r.work_description || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700">{r.work_status || '-'}</span>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center font-bold text-blue-700">{(parseFloat(r.amount) && parseFloat(r.amount) !== 0) ? `₹${parseFloat(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">{r.submitted_by_name || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center whitespace-nowrap">{r.moved_at ? r.moved_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="date"
                                        value={billWisePaidDateEdits[r.id] ?? r.paid_date ?? ''}
                                        onChange={(e) => handleBillWisePaidDateChange(r.id, e.target.value)}
                                        className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-orange-500"
                                        style={{ width: '125px' }}
                                      />
                                      {billWisePaidDateSaving[r.id] && (
                                        <svg className="absolute -right-1 animate-spin h-3 w-3 text-orange-500" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })()
                    )}
                  </div>

                  {/* Bill Wise Footer */}
                  {!loadingBillWiseHistory && (
                    <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        {billWiseHistoryTab === 'periods' && billWiseSelectedPeriod ? (
                          <>
                            <span>Period: <strong className="text-gray-800">{billWiseSelectedPeriod.period_start_display} → {billWiseSelectedPeriod.period_end_display}</strong></span>
                            <span>|</span>
                            <span>Records: <strong className="text-gray-800">{billWiseSelectedPeriod.record_count}</strong></span>
                            <span>|</span>
                            <span>Amount: <strong className="text-orange-700">₹{parseFloat(billWiseSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        ) : billWiseHistoryTab === 'periods' ? (
                          <>
                            <span>Total Periods: <strong className="text-gray-800">{billWiseHistoryGrouped.groups?.length || 0}</strong></span>
                            <span>|</span>
                            <span>Total Records: <strong className="text-gray-800">{billWiseHistoryGrouped.groups?.reduce((s, g) => s + (g.record_count || 0), 0) || 0}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-orange-700">₹{(billWiseHistoryGrouped.groups?.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        ) : (
                          <>
                            <span>Total Records: <strong className="text-gray-800">{billWiseHistoryRecords.length}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-orange-700">₹{billWiseHistoryRecords.reduce((s, r) => s + parseFloat(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </>
                        )}
                      </div>
                      <button onClick={closeHistoryModal} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                    </div>
                  )}
                </>
              )}
              {/* ════════════ END BILL WISE SECTION ════════════ */}
            </div>
          </div>
        )}

        {activeTab === 'office' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            {/* Header bar */}
            <div className="px-3 py-2 border-b flex flex-wrap justify-between items-center gap-2" style={{ backgroundColor: themeShades.light }}>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs font-bold text-black">Office Expense Entries</h2>
                {!loadingHoOfficeExpenses && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                    {hoOfficeExpenses.length}
                  </span>
                )}
                {/* Branch filter */}
                <select
                  value={selectedBranchOE}
                  onChange={e => setSelectedBranchOE(e.target.value)}
                  className="w-40 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none text-black truncate"
                  onFocus={e => (e.target.style.borderColor = themeColor)}
                  onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                >
                  <option value="">All Branches</option>
                  {BRANCH_ORDER.map(code => (
                    <option key={code} value={code}>
                      {branchMap[code]} ({code})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
                  <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">Paid Date:</span>
                  <input
                    type="date"
                    value={oeMainDateFrom}
                    onChange={e => setOeMainDateFrom(e.target.value)}
                    className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="Paid Date From"
                  />
                  <span className="text-[10px] text-gray-400">to</span>
                  <input
                    type="date"
                    value={oeMainDateTo}
                    onChange={e => setOeMainDateTo(e.target.value)}
                    className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="Paid Date To"
                  />
                </div>

                {(oeMainDateFrom || oeMainDateTo) && (
                  <button
                    onClick={() => { setOeMainDateFrom(''); setOeMainDateTo(''); }}
                    className="px-2 py-1 text-[10px] text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                {canExport && (
                  <button
                    onClick={() => {
                      const exportCols = [
                        { key: 'paid_date', label: 'Date' },
                        { key: 'branch_code', label: 'Branch' },
                        { key: 'expenses_head', label: 'Expense Head' },
                        { key: 'sub_head', label: 'Sub Head' },
                        { key: 'expenses_description', label: 'Description' },
                        { key: 'paid_to', label: 'Paid To' },
                        { key: 'invoice_no', label: 'Invoice No.' },
                        { key: 'amount', label: 'Amount (₹)' },
                        { key: 'voucher_no', label: 'Voucher No.' },
                        { key: 'paid_by', label: 'Paid By' },
                        { key: 'remark', label: 'Remark' },
                        { key: 'verification_status', label: 'Status' },
                      ];
                      exportToExcel(hoOfficeExpenses, 'office_expenses.xlsx', exportCols);
                    }}
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
                  onClick={loadOEHistory}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                  style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                >
                  History
                </button>
                <button
                  onClick={() => setShowExpenseHeadModal(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Expense Head
                </button>
                <button
                  onClick={openImprestModal}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  Imprest
                </button>
              </div>
            </div>

            {/* Stats Bar */}
            {hoOfficeExpenses.length > 0 && (() => {
              const filteredOE = hoOfficeExpenses.filter(e => {
                const pd = e.paid_date ? String(e.paid_date).substring(0, 10) : '';
                const matchFrom = !oeMainDateFrom || (pd && pd >= oeMainDateFrom);
                const matchTo = !oeMainDateTo || (pd && pd <= oeMainDateTo);
                return matchFrom && matchTo;
              });
              const isOEVerified = (e) => (hoOEVerificationStatus[e.id] ?? e.verification_status === 'Verified');
              const totalAmt = hoOfficeExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
              const filteredAmt = filteredOE.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
              const verifiedAmt = hoOfficeExpenses.filter(isOEVerified).reduce((s, e) => s + parseFloat(e.amount || 0), 0);
              const filteredVerifiedAmt = filteredOE.filter(isOEVerified).reduce((s, e) => s + parseFloat(e.amount || 0), 0);
              const isFiltered = oeMainDateFrom || oeMainDateTo;
              return (
                <div className="px-3 py-2 border-b bg-white flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 border border-gray-200">
                    <span className="text-[9px] font-bold text-gray-500 uppercase">Total:</span>
                    <span className="text-[10px] font-bold text-gray-800">{hoOfficeExpenses.length}</span>
                  </div>
                  {isFiltered && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                      <span className="text-[9px] font-bold text-blue-600 uppercase">Filtered:</span>
                      <span className="text-[10px] font-bold text-blue-800">{filteredOE.length}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 border border-purple-100">
                    <span className="text-[9px] font-bold text-purple-600 uppercase">Total Amount:</span>
                    <span className="text-[10px] font-bold text-purple-800">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {isFiltered && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                      <span className="text-[9px] font-bold text-blue-600 uppercase">Filtered Amount:</span>
                      <span className="text-[10px] font-bold text-blue-800">₹{filteredAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-100">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Verified Amount:</span>
                    <span className="text-[10px] font-bold text-emerald-800">₹{verifiedAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {isFiltered && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-teal-50 border border-teal-200">
                      <span className="text-[9px] font-bold text-teal-600 uppercase">Filtered Verified Amount:</span>
                      <span className="text-[10px] font-bold text-teal-800">₹{filteredVerifiedAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {isFiltered && (oeMainDateFrom || oeMainDateTo) && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 border border-orange-100">
                      <span className="text-[9px] font-bold text-orange-600 uppercase">Date Range:</span>
                      <span className="text-[10px] font-bold text-orange-800">{oeMainDateFrom || '...'} → {oeMainDateTo || '...'}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Tabs + Bulk action bar */}
            {hoOfficeExpenses.length > 0 && (
              <div className="px-3 py-1.5 border-b bg-gray-50 flex flex-wrap justify-between items-center gap-2">
                {/* Left: Tabs + Verify/Unverify All */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setOeTab('pending')}
                    className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                    style={{
                      backgroundColor: oeTab === 'pending' ? themeColor : '#f9fafb',
                      color: oeTab === 'pending' ? 'white' : '#374151',
                      borderColor: oeTab === 'pending' ? themeColor : '#e5e7eb',
                    }}
                  >
                    Pending ({oePendingCount})
                  </button>
                  <button
                    onClick={() => setOeTab('verified')}
                    className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                    style={{
                      backgroundColor: oeTab === 'verified' ? '#059669' : '#f9fafb',
                      color: oeTab === 'verified' ? 'white' : '#374151',
                      borderColor: oeTab === 'verified' ? '#059669' : '#e5e7eb',
                    }}
                  >
                    Verified ({oeVerifiedCount})
                  </button>

                  <span className="mx-1 h-5 w-px bg-gray-300" />

                  {/* <button
                    onClick={handleHoOESelectAll}
                    disabled={hoOEBulkVerifying || tabFilteredOfficeExpenses.length === 0}
                    className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 transition-colors"
                    style={{
                      background: oeTab === 'verified'
                        ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                        : 'linear-gradient(135deg, #059669, #047857)'
                    }}
                  >
                    {hoOEBulkVerifying
                      ? (oeTab === 'verified' ? 'Unverifying...' : 'Verifying...')
                      : (oeTab === 'verified' ? 'Unverify All' : 'Verify All')}
                  </button> */}

                  <span className="text-[11px] text-gray-400">
                    Selected: {oeSelectedCount} of {hoOfficeExpenses.length}
                  </span>
                </div>

                {/* Right: action buttons (tab-aware) */}
                <div className="flex gap-2">
                  {/* <button
                    onClick={handleHoOEBulkVerify}
                    disabled={hoOEBulkVerifying || oeSelectedCount === 0}
                    className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 flex items-center gap-1"
                    style={{
                      background: oeTab === 'verified'
                        ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                        : `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`
                    }}
                  >
                    {hoOEBulkVerifying
                      ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Processing...</>
                      : (oeTab === 'verified' ? `Unverify (${oeSelectedCount})` : `Verify (${oeSelectedCount})`)}
                  </button> */}

                  {/* Submit button only shows on Verified tab */}
                  {oeTab === 'verified' && (
                    <button
                      onClick={handleHoOESubmitToHistory}
                      disabled={submittingOEToHistory || oeSelectedCount === 0}
                      className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 flex items-center gap-1"
                      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                    >
                      {submittingOEToHistory
                        ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Submitting...</>
                        : `Submit (${oeSelectedCount})`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Table */}
            {loadingHoOfficeExpenses ? (
              <div className="text-center py-16">
                <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-xs text-gray-500">Loading expenses...</p>
              </div>
            ) : hoOfficeExpenses.length === 0 ? (
              <div className="text-center py-16">
                <svg className="h-12 w-12 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs text-gray-500 font-medium">No office expenses found</p>
              </div>
            ) : (
              <>
                <div
                  ref={oeTopScrollBarRef}
                  className="overflow-x-auto border-b border-gray-200 bg-gray-50"
                  style={{ scrollbarWidth: 'thin', overflowY: 'hidden', height: '12px' }}
                >
                  <div style={{ width: '0px', height: '1px' }} />
                </div>
                <div ref={oeTableContainerRef} className="overflow-auto" style={{ maxHeight: '600px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}>
                  <table ref={oeTableRef} className="border-collapse w-full" style={{ minWidth: `${oeTableActualWidth}px` }}>                    <thead className="sticky top-0 z-10">
                    <tr style={{ backgroundColor: '#f0f1ff' }}>
                      {[
                        { label: 'Verify', w: 60 },
                        { label: 'Sr.', w: 45 },
                        { label: 'Date', w: 95 },
                        { label: 'Branch', w: 130 },
                        { label: 'Expense Head', w: 130 },
                        { label: 'Sub Head', w: 110 },
                        { label: 'Description', w: 180 },
                        { label: 'Paid To', w: 130 },
                        { label: 'Invoice No.', w: 110 },
                        { label: 'Amount (₹)', w: 105 },
                        { label: 'Voucher No.', w: 100 },
                        { label: 'Paid By', w: 110 },
                        { label: 'Remark', w: 130 },
                        { label: 'Status', w: 90 },
                      ].map((col, i) => (
                        <th key={i}
                          className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                          style={{ width: `${col.w}px`, minWidth: `${col.w}px`, backgroundColor: '#f0f1ff' }}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tabFilteredOfficeExpenses.map((expense, idx) => {
                        const isVerified = hoOEVerificationStatus[expense.id] ?? (expense.verification_status === 'Verified');
                        return (
                          <tr key={expense.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                            {/* Verify checkbox */}
                            <td className="px-2 py-0.5 border-r border-gray-100 text-center align-middle">
                              <input
                                type="checkbox"
                                checked={isVerified}
                                onChange={() => handleHoOEVerifyToggle(expense.id, isVerified)}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center font-medium">{idx + 1}</td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                              {expense.paid_date ? new Date(expense.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={branchMap[expense.branch_code] || expense.branch_code}>{branchMap[expense.branch_code] || expense.branch_code || '-'}</div>
                            </td>
                            {[expense.expenses_head, expense.sub_head, expense.expenses_description || expense.description, expense.paid_to, expense.invoice_no].map((val, i) => (
                              <td key={i} className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                <div className="truncate" title={val || ''}>{val || '-'}</div>
                              </td>
                            ))}
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                              ₹{parseFloat(expense.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={expense.voucher_no || ''}>{expense.voucher_no || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={expense.paid_by || ''}>{expense.paid_by || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={expense.remark || ''}>{expense.remark || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {isVerified ? 'Verified' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr style={{ backgroundColor: '#f0f1ff' }}>
                        <td colSpan={9} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                          {oeTab === 'verified' ? 'Verified Total' : 'Pending Total'}
                          {(oeMainDateFrom || oeMainDateTo) ? ' (Filtered)' : ''}
                        </td>
                        <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>
                          ₹{tabFilteredOfficeExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={5} className="border-t-2 border-gray-200" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            {showOEHistoryModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-[98vw] max-h-[92vh] overflow-hidden flex flex-col">

                  {/* Header */}
                  <div className="px-4 py-3 flex justify-between items-center shrink-0" style={{ background: themeColor }}>
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">Office Expense History</h2>
                      {!loadingOEHistory && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                          {oeHistoryTab === 'all' ? `${oeHistoryRecords.length} records` : `${oeHistoryGrouped.groups?.length || 0} periods`}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setShowOEHistoryModal(false);
                        setOeHistorySearch(''); setOeHistoryDateFrom(''); setOeHistoryDateTo('');
                        setOeHistoryBranch(''); setOeHistoryPaidDateFrom(''); setOeHistoryPaidDateTo('');
                        setOeHistoryTab('all'); setOeSelectedPeriod(null);
                      }}
                      className="w-7 h-7 bg-white rounded-lg flex items-center justify-center"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Tab Bar */}
                  {!loadingOEHistory && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setOeHistoryTab('all'); setOeSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: oeHistoryTab === 'all' ? themeColor : '#fff',
                          color: oeHistoryTab === 'all' ? 'white' : '#374151',
                          borderColor: oeHistoryTab === 'all' ? themeColor : '#e5e7eb',
                        }}
                      >
                        All Records ({oeHistoryRecords.length})
                      </button>
                      <button
                        onClick={() => { setOeHistoryTab('periods'); setOeSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: oeHistoryTab === 'periods' ? '#059669' : '#fff',
                          color: oeHistoryTab === 'periods' ? 'white' : '#374151',
                          borderColor: oeHistoryTab === 'periods' ? '#059669' : '#e5e7eb',
                        }}
                      >
                        By Submission Period ({oeHistoryGrouped.groups?.length || 0})
                      </button>

                      {oeHistoryTab === 'periods' && !oeSelectedPeriod && oeHistoryGrouped.rule_type && (
                        <span className="text-[10px] text-gray-600 ml-2 px-2 py-1 bg-white rounded border border-gray-200">
                          {oeHistoryGrouped.rule_type === 'mixed' ? (
                            <>Rule: <strong>Mixed</strong> (per-branch — weekly or monthly 15-day)</>
                          ) : (
                            <>
                              Rule: <strong>{oeHistoryGrouped.rule_type === 'weekdays' ? 'Weekly' : 'Monthly'}</strong>
                              {' • '}Period size: <strong>{oeHistoryGrouped.period_days} days</strong>
                            </>
                          )}
                        </span>
                      )}

                      {/* Branch filter — only on periods tab, not in drill-down */}
                      {oeHistoryTab === 'periods' && !oeSelectedPeriod && (
                        <div className="flex items-center gap-1 ml-2">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Branch:</label>
                          <select
                            value={oeHistoryPeriodsBranch}
                            onChange={e => setOeHistoryPeriodsBranch(e.target.value)}
                            className="px-2 py-1 text-[11px] border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="">All Branches</option>
                            {BRANCH_ORDER.map(code => (
                              <option key={code} value={code}>{branchMap[code]} ({code})</option>
                            ))}
                          </select>
                          {oeHistoryPeriodsBranch && (
                            <button
                              onClick={() => setOeHistoryPeriodsBranch('')}
                              className="px-1.5 py-0.5 text-[10px] text-red-600 border border-red-300 rounded hover:bg-red-50"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}

                      {/* Period info inline + Back button */}
                      {oeHistoryTab === 'periods' && oeSelectedPeriod && (
                        <>
                          <div className="flex items-center gap-2 ml-2 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-200 flex-wrap">
                            <span className="text-[11px] text-gray-600">Branch:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {branchMap[oeSelectedPeriod.branch_code] || oeSelectedPeriod.branch_code || '-'}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Period:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {oeSelectedPeriod.period_start_display} → {oeSelectedPeriod.period_end_display}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Submitted By:</span>
                            <span className="text-[11px] font-bold text-purple-700">{oeSelectedPeriod.uploaded_by}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Records:</span>
                            <span className="text-[11px] font-bold text-gray-800">{oeSelectedPeriod.record_count}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Total:</span>
                            <span className="text-[11px] font-bold text-blue-700">
                              ₹{parseFloat(oeSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {oeSelectedPeriod.paid_date && (
                              <>
                                <span className="text-gray-300">|</span>
                                <span className="text-[11px] text-gray-600">Paid:</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold">
                                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  {new Date(oeSelectedPeriod.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            {canExport && (
                              <button
                                onClick={() => {
                                  const idSet = new Set(oeSelectedPeriod.record_ids || []);
                                  const periodRecords = oeHistoryRecords.filter(r => idSet.has(r.id));
                                  exportToExcel(periodRecords, `oe_history_period_${oeSelectedPeriod.branch_code}_${oeSelectedPeriod.period_start}_to_${oeSelectedPeriod.period_end}.xlsx`, [
                                    { key: 'branch_code', label: 'Branch' },
                                    { key: 'paid_date', label: 'Date' },
                                    { key: 'expenses_head', label: 'Expense Head' },
                                    { key: 'sub_head', label: 'Sub Head' },
                                    { key: 'expenses_description', label: 'Description' },
                                    { key: 'paid_to', label: 'Paid To' },
                                    { key: 'invoice_no', label: 'Invoice No.' },
                                    { key: 'amount', label: 'Amount (₹)' },
                                    { key: 'voucher_no', label: 'Voucher No.' },
                                    { key: 'paid_by', label: 'Paid By' },
                                    { key: 'remark', label: 'Remark' },
                                    { key: 'submitted_by_name', label: 'Submitted By' },
                                    { key: 'moved_at', label: 'Submitted At' },
                                    { key: 'ho_paid_date', label: 'HO Paid Date' },
                                  ]);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
                                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                </svg>
                                Export
                              </button>
                            )}
                            <button
                              onClick={() => setOeSelectedPeriod(null)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                              </svg>
                              Back
                            </button>
                          </div>
                        </>
                      )}

                      {/* Export for OE periods SUMMARY view (when NOT drilled in) */}
                      {oeHistoryTab === 'periods' && !oeSelectedPeriod && canExport && oeHistoryGrouped.groups?.length > 0 && (
                        <button
                          onClick={() => {
                            const filteredGroups = oeHistoryGrouped.groups.filter(
                              g => !oeHistoryPeriodsBranch || g.branch_code === oeHistoryPeriodsBranch
                            );
                            const exportData = filteredGroups.map(g => ({
                              branch_code: g.branch_code,
                              branch_name: branchMap[g.branch_code] || g.branch_code,
                              rule_type: g.rule_type === 'weekdays' ? 'Weekly' : '15-day',
                              period_start: g.period_start_display,
                              period_end: g.period_end_display,
                              uploaded_by: g.uploaded_by,
                              record_count: g.record_count,
                              total_amount: g.total_amount,
                              paid_date: g.paid_date || '',
                              paid_count: g.paid_count || 0,
                            }));
                            exportToExcel(exportData, `oe_history_periods.xlsx`, [
                              { key: 'branch_code', label: 'Branch Code' },
                              { key: 'branch_name', label: 'Branch Name' },
                              { key: 'rule_type', label: 'Rule Type' },
                              { key: 'period_start', label: 'Period Start' },
                              { key: 'period_end', label: 'Period End' },
                              { key: 'uploaded_by', label: 'Submitted By' },
                              { key: 'record_count', label: 'Number of Activity' },
                              { key: 'total_amount', label: 'Total Amount (₹)' },
                              { key: 'paid_date', label: 'Paid Date' },
                              { key: 'paid_count', label: 'Paid Count' },
                            ]);
                          }}
                          className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                          </svg>
                          Export Periods
                        </button>
                      )}
                    </div>
                  )}

                  {/* Filter Bar — only on All Records tab */}
                  {!loadingOEHistory && oeHistoryRecords.length > 0 && oeHistoryTab === 'all' && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                      {/* Search */}
                      <div className="relative flex-1 min-w-[200px]">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={oeHistorySearch}
                          onChange={e => setOeHistorySearch(e.target.value)}
                          placeholder="Search by expense head, paid to, submitted by, branch..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {oeHistorySearch && (
                          <button onClick={() => setOeHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>

                      {/* Branch Filter */}
                      <select
                        value={oeHistoryBranch}
                        onChange={e => setOeHistoryBranch(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">All Branches</option>
                        {BRANCH_ORDER.map(code => (
                          <option key={code} value={code}>{branchMap[code]} ({code})</option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
                        <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">Paid Date:</span>
                        <input
                          type="date"
                          value={oeHistoryPaidDateFrom}
                          onChange={e => setOeHistoryPaidDateFrom(e.target.value)}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="Paid Date From"
                        />
                        <span className="text-[10px] text-gray-400">to</span>
                        <input
                          type="date"
                          value={oeHistoryPaidDateTo}
                          onChange={e => setOeHistoryPaidDateTo(e.target.value)}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="Paid Date To"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-500 whitespace-nowrap">Submitted From:</label>
                        <input
                          type="date"
                          value={oeHistoryDateFrom}
                          onChange={e => setOeHistoryDateFrom(e.target.value)}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-500 whitespace-nowrap">To:</label>
                        <input
                          type="date"
                          value={oeHistoryDateTo}
                          onChange={e => setOeHistoryDateTo(e.target.value)}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      {(oeHistorySearch || oeHistoryDateFrom || oeHistoryDateTo || oeHistoryBranch || oeHistoryPaidDateFrom || oeHistoryPaidDateTo) && (
                        <button
                          onClick={() => { setOeHistorySearch(''); setOeHistoryDateFrom(''); setOeHistoryDateTo(''); setOeHistoryBranch(''); setOeHistoryPaidDateFrom(''); setOeHistoryPaidDateTo(''); }}
                          className="px-2 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                        >
                          Clear
                        </button>
                      )}

                      {canExport && (
                        <button
                          onClick={() => {
                            const toExport = window.__oeHistoryFiltered || oeHistoryRecords;
                            exportToExcel(toExport, `office_expense_history.xlsx`, [
                              { key: 'branch_code', label: 'Branch' },
                              { key: 'paid_date', label: 'Date' },
                              { key: 'expenses_head', label: 'Expense Head' },
                              { key: 'sub_head', label: 'Sub Head' },
                              { key: 'expenses_description', label: 'Description' },
                              { key: 'paid_to', label: 'Paid To' },
                              { key: 'invoice_no', label: 'Invoice No.' },
                              { key: 'amount', label: 'Amount (₹)' },
                              { key: 'voucher_no', label: 'Voucher No.' },
                              { key: 'paid_by', label: 'Paid By' },
                              { key: 'remark', label: 'Remark' },
                              { key: 'submitted_by_name', label: 'Submitted By' },
                              { key: 'moved_at', label: 'Submitted At' },
                              { key: 'ho_paid_date', label: 'HO Paid Date' },
                            ]);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
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
                    {loadingOEHistory ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-gray-500">Loading history...</p>
                      </div>
                    ) : oeHistoryRecords.length === 0 ? (
                      <div className="text-center py-20">
                        <p className="text-xs text-gray-500 font-medium">No history records found</p>
                      </div>
                    ) : oeHistoryTab === 'all' ? (() => {
                      /* ─────────── ALL RECORDS TAB BODY ─────────── */
                      const filtered = oeHistoryRecords.filter(rec => {
                        const searchLower = oeHistorySearch.toLowerCase();
                        const matchesSearch = !oeHistorySearch || [
                          rec.expenses_head, rec.sub_head, rec.paid_to,
                          rec.submitted_by_name, rec.verified_by_name,
                          rec.paid_by, rec.branch_code, branchMap[rec.branch_code],
                          rec.expenses_description, rec.remark, rec.invoice_no,
                        ].some(v => v && v.toLowerCase().includes(searchLower));

                        const movedDate = rec.moved_at ? rec.moved_at.substring(0, 10) : '';
                        const matchesFrom = !oeHistoryDateFrom || movedDate >= oeHistoryDateFrom;
                        const matchesTo = !oeHistoryDateTo || movedDate <= oeHistoryDateTo;
                        const matchesBranch = !oeHistoryBranch || rec.branch_code === oeHistoryBranch;

                        const paidDate = rec.paid_date ? String(rec.paid_date).substring(0, 10) : '';
                        const matchesPaidFrom = !oeHistoryPaidDateFrom || (paidDate && paidDate >= oeHistoryPaidDateFrom);
                        const matchesPaidTo = !oeHistoryPaidDateTo || (paidDate && paidDate <= oeHistoryPaidDateTo);

                        return matchesSearch && matchesFrom && matchesTo && matchesBranch && matchesPaidFrom && matchesPaidTo;
                      });

                      window.__oeHistoryFiltered = filtered;

                      return filtered.length === 0 ? (
                        <div className="text-center py-20">
                          <p className="text-xs text-gray-500 font-medium">No records match your filters</p>
                          <button onClick={() => { setOeHistorySearch(''); setOeHistoryDateFrom(''); setOeHistoryDateTo(''); setOeHistoryBranch(''); setOeHistoryPaidDateFrom(''); setOeHistoryPaidDateTo(''); }} className="mt-2 text-xs text-blue-600 hover:underline">Clear</button>
                        </div>
                      ) : (
                        <table className="border-collapse w-full" style={{ minWidth: '1650px' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {['Sr.', 'Branch', 'Date', 'Expense Head', 'Sub Head', 'Description', 'Paid To', 'Invoice No.', 'Amount (₹)', 'Voucher No.', 'Paid By', 'Remark', 'Submitted By', 'Submitted At', 'HO Paid Date'].map((col, i) => (
                                <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center" style={{ backgroundColor: '#f0f1ff' }}>
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filtered.map((rec, idx) => (
                              <tr key={rec.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{idx + 1}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={branchMap[rec.branch_code] || rec.branch_code}>{branchMap[rec.branch_code] || rec.branch_code || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                  {rec.paid_date ? new Date(rec.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={rec.expenses_head || ''}>{rec.expenses_head || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={rec.sub_head || ''}>{rec.sub_head || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={rec.expenses_description || rec.description || ''}>{rec.expenses_description || rec.description || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={rec.paid_to || ''}>{rec.paid_to || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={rec.invoice_no || ''}>{rec.invoice_no || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                  ₹{parseFloat(rec.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate">{rec.voucher_no || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate">{rec.paid_by || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate">{rec.remark || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={rec.submitted_by_name || ''}>{rec.submitted_by_name || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                  {rec.moved_at ? rec.moved_at.substring(0, 16).replace('T', ' ') : '-'}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="date"
                                      value={oePaidDateEdits[rec.id] ?? rec.ho_paid_date ?? ''}
                                      onChange={(e) => handleOEPaidDateChange(rec.id, e.target.value)}
                                      className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      style={{ width: '125px' }}
                                    />
                                    {oePaidDateSaving[rec.id] && (
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
                          <tfoot className="sticky bottom-0">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td colSpan={8} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>
                                ₹{filtered.reduce((s, r) => s + parseFloat(r.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td colSpan={7} className="border-t-2 border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })() : (
                      /* ─────────── BY SUBMISSION PERIOD TAB ─────────── */
                      !oeSelectedPeriod ? (
                        /* Period summary table */
                        oeHistoryGrouped.groups?.length === 0 ? (
                          <div className="text-center py-20">
                            <p className="text-sm text-gray-500 font-medium">No grouped periods available</p>
                            <p className="text-[11px] text-gray-400 mt-1">No history records have a valid paid date.</p>
                          </div>
                        ) : (
                          <table className="border-collapse w-full">
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {[
                                  { label: 'Sr. No.', width: 60 },
                                  { label: 'Branch', width: 160 },
                                  { label: 'Rule', width: 90 },
                                  { label: 'Period (Paid Date)', width: 300 },
                                  { label: 'Submitted By (Branch)', width: 180 },
                                  { label: 'Number of Activity', width: 110 },
                                  { label: 'Total Amount', width: 150 },
                                  { label: 'HO Paid Date (Apply to All)', width: 260 },
                                ].map((col, i) => (
                                  <th key={i}
                                    className="px-3 py-2 text-[11px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                    style={{ width: `${col.width}px`, backgroundColor: '#f0f1ff' }}>
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {oeHistoryGrouped.groups
                                .filter(g => !oeHistoryPeriodsBranch || g.branch_code === oeHistoryPeriodsBranch)
                                .map((g, idx) => {
                                  const key = `${g.branch_code}__${g.uploaded_by}__${g.period_start}__${g.period_end}`;
                                  const val = oePeriodPaidInputs[key] ?? g.paid_date ?? '';
                                  const applying = oePeriodPaidApplying[key];
                                  return (
                                    <tr
                                      key={idx}
                                      className="hover:bg-blue-50 transition-colors"
                                      style={{ height: '38px' }}
                                    >
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <div className="truncate" title={branchMap[g.branch_code] || g.branch_code}>
                                          {branchMap[g.branch_code] || g.branch_code || '-'}
                                        </div>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <span
                                          className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                                          style={{
                                            background: g.rule_type === 'weekdays' ? '#dbeafe' : '#fef3c7',
                                            color: g.rule_type === 'weekdays' ? '#1e40af' : '#92400e',
                                          }}
                                          title={g.rule_type === 'weekdays' ? '7-day weekly bucket' : '15-day half-month bucket'}
                                        >
                                          {g.rule_type === 'weekdays' ? 'Weekly' : '15-day'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <button
                                          onClick={() => setOeSelectedPeriod(g)}
                                          className="inline-flex items-center gap-1.5 underline hover:font-bold transition-all cursor-pointer bg-transparent border-0 p-0"
                                          style={{ color: themeColor }}
                                          title="Click to view records in this period"
                                        >
                                          <span>{g.period_start_display}</span>
                                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                          </svg>
                                          <span>{g.period_end_display}</span>
                                        </button>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <span className="px-2 py-0.5 rounded-full font-medium">{g.uploaded_by}</span>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">
                                        ₹{parseFloat(g.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <input
                                            type="date"
                                            value={val}
                                            onChange={(e) => setOePeriodPaidInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            style={{ width: '125px' }}
                                          />
                                          <button
                                            onClick={() => handleOEPeriodPaidApply(g)}
                                            disabled={applying}
                                            className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                            title="Apply this date to every record in this period"
                                          >
                                            {applying ? '...' : 'Apply'}
                                          </button>
                                          {g.paid_count > 0 && (
                                            <span
                                              className="text-[9px] px-1.5 py-0.5 rounded-full"
                                              style={{
                                                background: g.paid_date ? '#d1fae5' : '#fef3c7',
                                                color: g.paid_date ? '#065f46' : '#92400e',
                                              }}
                                              title={g.paid_date ? 'All records share this date' : 'Mixed paid dates'}
                                            >
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
                              {(() => {
                                const filteredGroups = oeHistoryGrouped.groups.filter(
                                  g => !oeHistoryPeriodsBranch || g.branch_code === oeHistoryPeriodsBranch
                                );
                                return (
                                  <tr style={{ backgroundColor: '#f0f1ff' }}>
                                    <td colSpan={5} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                                      {oeHistoryPeriodsBranch ? `Filtered Total (${branchMap[oeHistoryPeriodsBranch]})` : 'Grand Total'}
                                    </td>
                                    <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">
                                      {filteredGroups.reduce((s, g) => s + (g.record_count || 0), 0)}
                                    </td>
                                    <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200" style={{ color: themeColor }}>
                                      ₹{filteredGroups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="border-t-2 border-gray-200" />
                                  </tr>
                                );
                              })()}
                            </tfoot>
                          </table>
                        )
                      ) : (() => {
                        /* DRILL-DOWN: only records inside the selected period bucket */
                        const idSet = new Set(oeSelectedPeriod.record_ids || []);
                        const periodRecords = oeHistoryRecords.filter(r => idSet.has(r.id));
                        return (
                          <table className="border-collapse w-full" style={{ minWidth: '1650px' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {['Sr.', 'Branch', 'Date', 'Expense Head', 'Sub Head', 'Description', 'Paid To', 'Invoice No.', 'Amount (₹)', 'Voucher No.', 'Paid By', 'Remark', 'Submitted By', 'Submitted At', 'HO Paid Date'].map((col, i) => (
                                  <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center" style={{ backgroundColor: '#f0f1ff' }}>
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {periodRecords.map((rec, idx) => (
                                <tr key={rec.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={branchMap[rec.branch_code] || rec.branch_code}>{branchMap[rec.branch_code] || rec.branch_code || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                    {rec.paid_date ? new Date(rec.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={rec.expenses_head || ''}>{rec.expenses_head || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={rec.sub_head || ''}>{rec.sub_head || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={rec.expenses_description || rec.description || ''}>{rec.expenses_description || rec.description || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={rec.paid_to || ''}>{rec.paid_to || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={rec.invoice_no || ''}>{rec.invoice_no || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                    ₹{parseFloat(rec.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate">{rec.voucher_no || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate">{rec.paid_by || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate">{rec.remark || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={rec.submitted_by_name || ''}>{rec.submitted_by_name || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                    {rec.moved_at ? rec.moved_at.substring(0, 16).replace('T', ' ') : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="date"
                                        value={oePaidDateEdits[rec.id] ?? rec.ho_paid_date ?? ''}
                                        onChange={(e) => handleOEPaidDateChange(rec.id, e.target.value)}
                                        className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        style={{ width: '125px' }}
                                      />
                                      {oePaidDateSaving[rec.id] && (
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
                          </table>
                        );
                      })()
                    )}
                  </div>

                  {/* Footer */}
                  {!loadingOEHistory && (() => {
                    if (oeHistoryTab === 'periods') {
                      if (oeSelectedPeriod) {
                        const idSet = new Set(oeSelectedPeriod.record_ids || []);
                        const periodRecords = oeHistoryRecords.filter(r => idSet.has(r.id));
                        const total = periodRecords.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
                        return (
                          <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                              <span>Period: <strong className="text-gray-800">{oeSelectedPeriod.period_start_display} → {oeSelectedPeriod.period_end_display}</strong></span>
                              <span>|</span>
                              <span>Records: <strong className="text-gray-800">{periodRecords.length}</strong></span>
                              <span>|</span>
                              <span>Amount: <strong className="text-blue-700">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setOeSelectedPeriod(null)} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-blue-700 border-blue-300 hover:bg-blue-50">← Back</button>
                              <button onClick={() => { setShowOEHistoryModal(false); setOeHistorySearch(''); setOeHistoryDateFrom(''); setOeHistoryDateTo(''); setOeHistoryBranch(''); setOeHistoryPaidDateFrom(''); setOeHistoryPaidDateTo(''); setOeHistoryTab('all'); setOeSelectedPeriod(null); }} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                            </div>
                          </div>
                        );
                      }
                      const filteredGroups = (oeHistoryGrouped.groups || []).filter(
                        g => !oeHistoryPeriodsBranch || g.branch_code === oeHistoryPeriodsBranch
                      );
                      const totalRecs = filteredGroups.reduce((s, g) => s + (g.record_count || 0), 0);
                      const totalAmt = filteredGroups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0);
                      return (
                        <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>Total Periods: <strong className="text-gray-800">{filteredGroups.length}</strong></span>
                            {oeHistoryPeriodsBranch && (
                              <>
                                <span>|</span>
                                <span className="text-blue-700">Filtered by: <strong>{branchMap[oeHistoryPeriodsBranch]}</strong></span>
                              </>
                            )}
                            <span>|</span>
                            <span>Total Records: <strong className="text-gray-800">{totalRecs}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-blue-700">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </div>
                          <button onClick={() => { setShowOEHistoryModal(false); setOeHistorySearch(''); setOeHistoryDateFrom(''); setOeHistoryDateTo(''); setOeHistoryBranch(''); setOeHistoryPaidDateFrom(''); setOeHistoryPaidDateTo(''); setOeHistoryTab('all'); setOeSelectedPeriod(null); setOeHistoryPeriodsBranch(''); }} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                        </div>
                      );
                    }
                    // ALL records footer
                    const filtered = window.__oeHistoryFiltered || oeHistoryRecords;
                    const filteredAmt = filtered.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
                    const totalAmt = oeHistoryRecords.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
                    const isFiltered = oeHistorySearch || oeHistoryDateFrom || oeHistoryDateTo || oeHistoryBranch || oeHistoryPaidDateFrom || oeHistoryPaidDateTo;
                    return (
                      <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center gap-2">
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          <span>Total Records: <strong className="text-gray-800">{oeHistoryRecords.length}</strong></span>
                          {isFiltered && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>Filtered: <strong className="text-blue-700">{filtered.length}</strong></span>
                            </>
                          )}
                          <span className="text-gray-300">|</span>
                          <span>Total Amount: <strong className="text-gray-800">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          {isFiltered && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>Filtered Amount: <strong className="text-blue-700">₹{filteredAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </>
                          )}
                        </div>
                        <button onClick={() => { setShowOEHistoryModal(false); setOeHistorySearch(''); setOeHistoryDateFrom(''); setOeHistoryDateTo(''); setOeHistoryBranch(''); setOeHistoryPaidDateFrom(''); setOeHistoryPaidDateTo(''); setOeHistoryTab('all'); setOeSelectedPeriod(null); }} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 whitespace-nowrap">Close</button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'vendor' && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b flex flex-wrap justify-between items-center gap-2" style={{ backgroundColor: themeShades.light }}>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs font-bold text-black">Local Vendor Bills</h2>
                {!loadingLvbBills && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: themeColor }}>
                    {lvbBills.length}
                  </span>
                )}
                <select
                  value={selectedBranchLvb}
                  onChange={e => setSelectedBranchLvb(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none text-black"
                >
                  <option value="">All Branches</option>
                  {BRANCH_ORDER.map(code => (
                    <option key={code} value={code}>{branchMap[code]} ({code})</option>
                  ))}
                </select>
                {/* Invoice Date Filter */}
                <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
                  <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">Invoice Date:</span>
                  <input
                    type="date"
                    value={lvbMainDateFrom}
                    onChange={e => setLvbMainDateFrom(e.target.value)}
                    className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="Invoice Date From"
                  />
                  <span className="text-[10px] text-gray-400">to</span>
                  <input
                    type="date"
                    value={lvbMainDateTo}
                    onChange={e => setLvbMainDateTo(e.target.value)}
                    className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="Invoice Date To"
                  />
                </div>

                {(lvbMainDateFrom || lvbMainDateTo) && (
                  <button
                    onClick={() => { setLvbMainDateFrom(''); setLvbMainDateTo(''); }}
                    className="px-2 py-1 text-[10px] text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={loadVendorList}
                  className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-semibold rounded-lg shadow-sm hover:shadow-md transition-all"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  View Vendors
                </button>
                {canExport && (
                  <button
                    onClick={() => exportToExcel(lvbBills, 'local_vendor_bills.xlsx', [
                      { key: 'invoice_date', label: 'Invoice Date' },
                      { key: 'branch_code', label: 'Branch' },
                      { key: 'vendor_name', label: 'Vendor Name' },
                      { key: 'gst_no', label: 'GST No.' },
                      { key: 'invoice_number', label: 'Invoice No.' },
                      { key: 'customer_name', label: 'Customer Name' },
                      { key: 'customer_invoice_no', label: 'Customer Invoice No.' },
                      { key: 'customer_sr_no', label: 'SR No.' },
                      { key: 'customer_invoice_amount', label: 'Customer Invoice Amount (₹)' },
                      { key: 'line_work_amount', label: 'Line Work Amount (₹)' },
                      { key: 'shop_name', label: 'Shop Name' },
                      { key: 'description', label: 'Description' },
                      { key: 'payment_amount', label: 'Amount (₹)' },
                      { key: 'remark', label: 'Remark' },
                      { key: 'verified_by_name', label: 'Verified By' },
                      { key: 'verification_status', label: 'Status' },
                    ])}
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
                  onClick={loadLvbHistory}
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

            {/* Stats Bar */}
            {lvbBills.length > 0 && (() => {
              const filteredLvb = lvbBills.filter(b => {
                const id = b.invoice_date ? String(b.invoice_date).substring(0, 10) : '';
                const matchFrom = !lvbMainDateFrom || (id && id >= lvbMainDateFrom);
                const matchTo = !lvbMainDateTo || (id && id <= lvbMainDateTo);
                return matchFrom && matchTo;
              });
              const isLvbVerified = (b) => (lvbVerificationStatus[b.id] ?? b.verification_status === 'Verified');
              const totalAmt = lvbBills.reduce((s, b) => s + parseFloat(b.payment_amount || 0), 0);
              const filteredAmt = filteredLvb.reduce((s, b) => s + parseFloat(b.payment_amount || 0), 0);
              const verifiedAmt = lvbBills.filter(isLvbVerified).reduce((s, b) => s + parseFloat(b.payment_amount || 0), 0);
              const filteredVerifiedAmt = filteredLvb.filter(isLvbVerified).reduce((s, b) => s + parseFloat(b.payment_amount || 0), 0);
              const isFiltered = lvbMainDateFrom || lvbMainDateTo;
              return (
                <div className="px-3 py-2 border-b bg-white flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 border border-gray-200">
                    <span className="text-[9px] font-bold text-gray-500 uppercase">Total:</span>
                    <span className="text-[10px] font-bold text-gray-800">{lvbBills.length}</span>
                  </div>
                  {isFiltered && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                      <span className="text-[9px] font-bold text-blue-600 uppercase">Filtered:</span>
                      <span className="text-[10px] font-bold text-blue-800">{filteredLvb.length}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 border border-purple-100">
                    <span className="text-[9px] font-bold text-purple-600 uppercase">Total Amount:</span>
                    <span className="text-[10px] font-bold text-purple-800">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {isFiltered && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 border border-blue-100">
                      <span className="text-[9px] font-bold text-blue-600 uppercase">Filtered Amount:</span>
                      <span className="text-[10px] font-bold text-blue-800">₹{filteredAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-100">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase">Verified Amount:</span>
                    <span className="text-[10px] font-bold text-emerald-800">₹{verifiedAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  {isFiltered && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-teal-50 border border-teal-200">
                      <span className="text-[9px] font-bold text-teal-600 uppercase">Filtered Verified Amount:</span>
                      <span className="text-[10px] font-bold text-teal-800">₹{filteredVerifiedAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {isFiltered && (lvbMainDateFrom || lvbMainDateTo) && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 border border-orange-100">
                      <span className="text-[9px] font-bold text-orange-600 uppercase">Date Range:</span>
                      <span className="text-[10px] font-bold text-orange-800">{lvbMainDateFrom || '...'} → {lvbMainDateTo || '...'}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Tabs + Bulk action bar */}
            {lvbBills.length > 0 && (
              <div className="px-3 py-1.5 border-b bg-gray-50 flex flex-wrap justify-between items-center gap-2">
                {/* Left: Tabs + Verify/Unverify All */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setLvbTab('pending')}
                    className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                    style={{
                      backgroundColor: lvbTab === 'pending' ? themeColor : '#f9fafb',
                      color: lvbTab === 'pending' ? 'white' : '#374151',
                      borderColor: lvbTab === 'pending' ? themeColor : '#e5e7eb',
                    }}
                  >
                    Pending ({lvbPendingCount})
                  </button>
                  <button
                    onClick={() => setLvbTab('verified')}
                    className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                    style={{
                      backgroundColor: lvbTab === 'verified' ? '#059669' : '#f9fafb',
                      color: lvbTab === 'verified' ? 'white' : '#374151',
                      borderColor: lvbTab === 'verified' ? '#059669' : '#e5e7eb',
                    }}
                  >
                    Verified ({lvbVerifiedCount})
                  </button>

                  <span className="mx-1 h-5 w-px bg-gray-300" />

                  {/* <button
                    onClick={handleLvbSelectAll}
                    disabled={lvbBulkVerifying || tabFilteredLvbBills.length === 0}
                    className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 transition-colors"
                    style={{
                      background: lvbTab === 'verified'
                        ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                        : 'linear-gradient(135deg, #059669, #047857)'
                    }}
                  >
                    {lvbBulkVerifying
                      ? (lvbTab === 'verified' ? 'Unverifying...' : 'Verifying...')
                      : (lvbTab === 'verified' ? 'Unverify All' : 'Verify All')}
                  </button> */}

                  <span className="text-[11px] text-gray-400">
                    Selected: {lvbSelectedCount} of {lvbBills.length}
                  </span>
                </div>

                {/* Right: action buttons (tab-aware) */}
                <div className="flex gap-2">
                  {/* <button
                    onClick={handleLvbBulkVerify}
                    disabled={lvbBulkVerifying || lvbSelectedCount === 0}
                    className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 flex items-center gap-1"
                    style={{
                      background: lvbTab === 'verified'
                        ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                        : `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`
                    }}
                  >
                    {lvbBulkVerifying
                      ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Processing...</>
                      : (lvbTab === 'verified' ? `Unverify (${lvbSelectedCount})` : `Verify (${lvbSelectedCount})`)}
                  </button> */}

                  {/* Submit button only shows on Verified tab */}
                  {lvbTab === 'verified' && (
                    <button
                      onClick={handleLvbSubmitToHistory}
                      disabled={submittingLvbToHistory || lvbSelectedCount === 0}
                      className="px-3 py-1 text-white text-[10px] font-bold rounded-lg disabled:opacity-40 flex items-center gap-1"
                      style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                    >
                      {submittingLvbToHistory
                        ? <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Submitting...</>
                        : `Submit (${lvbSelectedCount})`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Table */}
            {loadingLvbBills ? (
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
                <p className="text-xs text-gray-500 font-medium">No local vendor bills found</p>
              </div>
            ) : (
              <>
                <div
                  ref={lvbTopScrollBarRef}
                  className="overflow-x-auto border-b border-gray-200 bg-gray-50"
                  style={{ scrollbarWidth: 'thin', overflowY: 'hidden', height: '12px' }}
                >
                  <div style={{ width: '0px', height: '1px' }} />
                </div>
                <div ref={lvbTableContainerRef} className="overflow-auto" style={{ maxHeight: '600px', scrollbarWidth: 'thin', scrollbarColor: '#a5b4fc #f1f5f9' }}>
                  <table ref={lvbTableRef} className="border-collapse w-full" style={{ minWidth: '1200px' }}>
                    <thead className="sticky top-0 z-10">
                      <tr style={{ backgroundColor: '#f0f1ff' }}>
                        {[
                          { label: 'Verify', w: 60 },
                          { label: 'Sr.', w: 45 },
                          { label: 'Invoice Date', w: 110 },
                          { label: 'Branch', w: 130 },
                          { label: 'Vendor Name', w: 160 },
                          { label: 'GST No.', w: 130 },
                          { label: 'Invoice No.', w: 120 },
                          { label: 'Customer Name', w: 160 },
                          { label: 'Cust. Invoice No.', w: 130 },
                          { label: 'SR No.', w: 110 },
                          { label: 'Cust. Invoice Amt (₹)', w: 140 },
                          { label: 'Line Work Amt (₹)', w: 130 },
                          { label: 'Shop Name', w: 150 },
                          { label: 'Description', w: 180 },
                          { label: 'Amount (₹)', w: 110 },
                          { label: 'Remark', w: 130 },
                          { label: 'Status', w: 90 },
                        ].map((col, i) => (
                          <th key={i}
                            className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                            style={{ width: `${col.w}px`, minWidth: `${col.w}px`, backgroundColor: '#f0f1ff' }}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tabFilteredLvbBills.map((bill, idx) => {
                        const isVerified = lvbVerificationStatus[bill.id] ?? (bill.verification_status === 'Verified');
                        return (
                          <tr key={bill.id} className={`transition-colors ${isVerified ? 'bg-green-50/40' : 'hover:bg-blue-50/30'}`} style={{ height: '34px' }}>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-center align-middle">
                              <input type="checkbox" checked={isVerified} onChange={() => handleLvbVerifyToggle(bill.id, isVerified)} className="w-4 h-4 cursor-pointer" />
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center font-medium">{idx + 1}</td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                              {bill.invoice_date ? new Date(bill.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={branchMap[bill.branch_code] || bill.branch_code}>{branchMap[bill.branch_code] || bill.branch_code || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={bill.vendor_name}>{bill.vendor_name || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{bill.gst_no || '-'}</td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{bill.invoice_number || '-'}</td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={bill.customer_name || ''}>{bill.customer_name || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={bill.customer_invoice_no || ''}>{bill.customer_invoice_no || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={bill.customer_sr_no || ''}>{bill.customer_sr_no || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                              ₹{parseFloat(bill.customer_invoice_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                              ₹{parseFloat(bill.line_work_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={bill.shop_name || ''}>{bill.shop_name || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={bill.description || ''}>{bill.description || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                              ₹{parseFloat(bill.payment_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                              <div className="truncate" title={bill.remark || ''}>{bill.remark || '-'}</div>
                            </td>
                            <td className="px-2 py-0.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {isVerified ? 'Verified' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0">
                      <tr style={{ backgroundColor: '#f0f1ff' }}>
                        <td colSpan={14} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                          {lvbTab === 'verified' ? 'Verified Total' : 'Pending Total'}
                          {(lvbMainDateFrom || lvbMainDateTo) ? ' (Filtered)' : ''}
                        </td>
                        <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>
                          ₹{tabFilteredLvbBills.reduce((s, b) => s + parseFloat(b.payment_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={2} className="border-t-2 border-gray-200" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

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

            {/* History Modal */}
            {showLvbHistoryModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-[98vw] max-h-[92vh] overflow-hidden flex flex-col">

                  {/* Modal Header */}
                  <div className="px-4 py-3 flex justify-between items-center shrink-0" style={{ background: themeColor }}>
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h2 className="text-sm font-semibold text-white">Local Vendor Bills History</h2>
                      {!loadingLvbHistory && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 text-white">
                          {lvbHistoryTab === 'all' ? `${lvbHistoryRecords.length} records` : `${lvbHistoryGrouped.groups?.length || 0} periods`}
                        </span>
                      )}
                    </div>
                    <button onClick={() => {
                      setShowLvbHistoryModal(false);
                      setLvbHistorySearch(''); setLvbHistoryDateFrom(''); setLvbHistoryDateTo('');
                      setLvbHistoryBranch(''); setLvbHistoryInvoiceDateFrom(''); setLvbHistoryInvoiceDateTo('');
                      setLvbHistoryTab('all'); setLvbSelectedPeriod(null); setLvbHistoryPeriodsBranch('');
                    }} className="w-7 h-7 bg-white rounded-lg flex items-center justify-center">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Tab Bar */}
                  {!loadingLvbHistory && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-100 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setLvbHistoryTab('all'); setLvbSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: lvbHistoryTab === 'all' ? themeColor : '#fff',
                          color: lvbHistoryTab === 'all' ? 'white' : '#374151',
                          borderColor: lvbHistoryTab === 'all' ? themeColor : '#e5e7eb',
                        }}
                      >
                        All Records ({lvbHistoryRecords.length})
                      </button>
                      <button
                        onClick={() => { setLvbHistoryTab('periods'); setLvbSelectedPeriod(null); }}
                        className="px-3 py-1 text-[11px] font-semibold rounded-md transition-all border"
                        style={{
                          backgroundColor: lvbHistoryTab === 'periods' ? '#059669' : '#fff',
                          color: lvbHistoryTab === 'periods' ? 'white' : '#374151',
                          borderColor: lvbHistoryTab === 'periods' ? '#059669' : '#e5e7eb',
                        }}
                      >
                        By Submission Period ({lvbHistoryGrouped.groups?.length || 0})
                      </button>

                      {lvbHistoryTab === 'periods' && !lvbSelectedPeriod && lvbHistoryGrouped.rule_type && (
                        <span className="text-[10px] text-gray-600 ml-2 px-2 py-1 bg-white rounded border border-gray-200">
                          {lvbHistoryGrouped.rule_type === 'mixed' ? (
                            <>Rule: <strong>Mixed</strong> (per-branch — weekly or monthly 15-day)</>
                          ) : (
                            <>
                              Rule: <strong>{lvbHistoryGrouped.rule_type === 'weekdays' ? 'Weekly' : 'Monthly'}</strong>
                              {' • '}Period size: <strong>{lvbHistoryGrouped.period_days} days</strong>
                            </>
                          )}
                        </span>
                      )}

                      {/* Branch filter — only on periods tab, not in drill-down */}
                      {lvbHistoryTab === 'periods' && !lvbSelectedPeriod && (
                        <div className="flex items-center gap-1 ml-2">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Branch:</label>
                          <select
                            value={lvbHistoryPeriodsBranch}
                            onChange={e => setLvbHistoryPeriodsBranch(e.target.value)}
                            className="px-2 py-1 text-[11px] border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="">All Branches</option>
                            {BRANCH_ORDER.map(code => (
                              <option key={code} value={code}>{branchMap[code]} ({code})</option>
                            ))}
                          </select>
                          {lvbHistoryPeriodsBranch && (
                            <button
                              onClick={() => setLvbHistoryPeriodsBranch('')}
                              className="px-1.5 py-0.5 text-[10px] text-red-600 border border-red-300 rounded hover:bg-red-50"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      )}

                      {/* Period info inline + Back button */}
                      {lvbHistoryTab === 'periods' && lvbSelectedPeriod && (
                        <>
                          <div className="flex items-center gap-2 ml-2 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-200 flex-wrap">
                            <span className="text-[11px] text-gray-600">Branch:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {branchMap[lvbSelectedPeriod.branch_code] || lvbSelectedPeriod.branch_code || '-'}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Period:</span>
                            <span className="text-[11px] font-bold text-gray-800">
                              {lvbSelectedPeriod.period_start_display} → {lvbSelectedPeriod.period_end_display}
                            </span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Submitted By:</span>
                            <span className="text-[11px] font-bold text-purple-700">{lvbSelectedPeriod.uploaded_by}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Bills:</span>
                            <span className="text-[11px] font-bold text-gray-800">{lvbSelectedPeriod.record_count}</span>
                            <span className="text-gray-300">|</span>
                            <span className="text-[11px] text-gray-600">Total:</span>
                            <span className="text-[11px] font-bold text-blue-700">
                              ₹{parseFloat(lvbSelectedPeriod.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {lvbSelectedPeriod.paid_date && (
                              <>
                                <span className="text-gray-300">|</span>
                                <span className="text-[11px] text-gray-600">Paid:</span>
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 text-[10px] font-bold">
                                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  {new Date(lvbSelectedPeriod.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            {canExport && (
                              <button
                                onClick={() => {
                                  const idSet = new Set(lvbSelectedPeriod.record_ids || []);
                                  const periodRecords = lvbHistoryRecords.filter(r => idSet.has(r.id));
                                  exportToExcel(periodRecords, `lvb_history_period_${lvbSelectedPeriod.branch_code}_${lvbSelectedPeriod.period_start}_to_${lvbSelectedPeriod.period_end}.xlsx`, [
                                    { key: 'branch_code', label: 'Branch' },
                                    { key: 'invoice_date', label: 'Invoice Date' },
                                    { key: 'vendor_name', label: 'Vendor Name' },
                                    { key: 'gst_no', label: 'GST No.' },
                                    { key: 'invoice_number', label: 'Invoice No.' },
                                    { key: 'customer_name', label: 'Customer Name' },
                                    { key: 'customer_invoice_no', label: 'Customer Invoice No.' },
                                    { key: 'customer_sr_no', label: 'SR No.' },
                                    { key: 'customer_invoice_amount', label: 'Customer Invoice Amount (₹)' },
                                    { key: 'line_work_amount', label: 'Line Work Amount (₹)' },
                                    { key: 'shop_name', label: 'Shop Name' },
                                    { key: 'description', label: 'Description' },
                                    { key: 'payment_amount', label: 'Amount (₹)' },
                                    { key: 'remark', label: 'Remark' },
                                    { key: 'submitted_by_name', label: 'Submitted By' },
                                    { key: 'moved_at', label: 'Submitted At' },
                                    { key: 'ho_paid_date', label: 'HO Paid Date' },
                                  ]);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
                                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                                </svg>
                                Export
                              </button>
                            )}
                            <button
                              onClick={() => setLvbSelectedPeriod(null)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                              </svg>
                              Back
                            </button>
                          </div>
                        </>
                      )}

                      {/* Export for LVB periods SUMMARY view (when NOT drilled in) */}
                      {lvbHistoryTab === 'periods' && !lvbSelectedPeriod && canExport && lvbHistoryGrouped.groups?.length > 0 && (
                        <button
                          onClick={() => {
                            const filteredGroups = lvbHistoryGrouped.groups.filter(
                              g => !lvbHistoryPeriodsBranch || g.branch_code === lvbHistoryPeriodsBranch
                            );
                            const exportData = filteredGroups.map(g => ({
                              branch_code: g.branch_code,
                              branch_name: branchMap[g.branch_code] || g.branch_code,
                              rule_type: g.rule_type === 'weekdays' ? 'Weekly' : '15-day',
                              period_start: g.period_start_display,
                              period_end: g.period_end_display,
                              uploaded_by: g.uploaded_by,
                              record_count: g.record_count,
                              total_amount: g.total_amount,
                              paid_date: g.paid_date || '',
                              paid_count: g.paid_count || 0,
                            }));
                            exportToExcel(exportData, `lvb_history_periods.xlsx`, [
                              { key: 'branch_code', label: 'Branch Code' },
                              { key: 'branch_name', label: 'Branch Name' },
                              { key: 'rule_type', label: 'Rule Type' },
                              { key: 'period_start', label: 'Period Start' },
                              { key: 'period_end', label: 'Period End' },
                              { key: 'uploaded_by', label: 'Submitted By' },
                              { key: 'record_count', label: 'Bill Count' },
                              { key: 'total_amount', label: 'Total Amount (₹)' },
                              { key: 'paid_date', label: 'Paid Date' },
                              { key: 'paid_count', label: 'Paid Count' },
                            ]);
                          }}
                          className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
                          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l-4-4m0 0L8 8m4-4v12M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
                          </svg>
                          Export Periods
                        </button>
                      )}
                    </div>
                  )}

                  {/* Filter Bar — only on All Records tab */}
                  {!loadingLvbHistory && lvbHistoryRecords.length > 0 && lvbHistoryTab === 'all' && (
                    <div className="shrink-0 px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[200px]">
                        <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input type="text" value={lvbHistorySearch} onChange={e => setLvbHistorySearch(e.target.value)}
                          placeholder="Search by vendor, invoice no, shop name, submitted by..."
                          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        {lvbHistorySearch && (
                          <button onClick={() => setLvbHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                      <select value={lvbHistoryBranch} onChange={e => setLvbHistoryBranch(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">All Branches</option>
                        {BRANCH_ORDER.map(code => <option key={code} value={code}>{branchMap[code]} ({code})</option>)}
                      </select>
                      <div className="flex items-center gap-1 px-2 py-1 border border-blue-200 rounded-lg bg-blue-50">
                        <span className="text-[10px] font-bold text-blue-600 uppercase whitespace-nowrap">Invoice Date:</span>
                        <input type="date" value={lvbHistoryInvoiceDateFrom} onChange={e => setLvbHistoryInvoiceDateFrom(e.target.value)}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <span className="text-[10px] text-gray-400">to</span>
                        <input type="date" value={lvbHistoryInvoiceDateTo} onChange={e => setLvbHistoryInvoiceDateTo(e.target.value)}
                          className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-500 whitespace-nowrap">Submitted From:</label>
                        <input type="date" value={lvbHistoryDateFrom} onChange={e => setLvbHistoryDateFrom(e.target.value)}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-500 whitespace-nowrap">To:</label>
                        <input type="date" value={lvbHistoryDateTo} onChange={e => setLvbHistoryDateTo(e.target.value)}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      {(lvbHistorySearch || lvbHistoryDateFrom || lvbHistoryDateTo || lvbHistoryBranch || lvbHistoryInvoiceDateFrom || lvbHistoryInvoiceDateTo) && (
                        <button onClick={() => { setLvbHistorySearch(''); setLvbHistoryDateFrom(''); setLvbHistoryDateTo(''); setLvbHistoryBranch(''); setLvbHistoryInvoiceDateFrom(''); setLvbHistoryInvoiceDateTo(''); }}
                          className="px-2 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 whitespace-nowrap">
                          Clear
                        </button>
                      )}
                      {canExport && (
                        <button
                          onClick={() => {
                            const toExport = window.__lvbHistoryFiltered || lvbHistoryRecords;
                            exportToExcel(toExport, 'local_vendor_bills_history.xlsx', [
                              { key: 'branch_code', label: 'Branch' },
                              { key: 'invoice_date', label: 'Invoice Date' },
                              { key: 'vendor_name', label: 'Vendor Name' },
                              { key: 'gst_no', label: 'GST No.' },
                              { key: 'invoice_number', label: 'Invoice No.' },
                              { key: 'customer_name', label: 'Customer Name' },
                              { key: 'customer_invoice_no', label: 'Customer Invoice No.' },
                              { key: 'customer_sr_no', label: 'SR No.' },
                              { key: 'customer_invoice_amount', label: 'Customer Invoice Amount (₹)' },
                              { key: 'line_work_amount', label: 'Line Work Amount (₹)' },
                              { key: 'shop_name', label: 'Shop Name' },
                              { key: 'description', label: 'Description' },
                              { key: 'payment_amount', label: 'Amount (₹)' },
                              { key: 'remark', label: 'Remark' },
                              { key: 'submitted_by_name', label: 'Submitted By' },
                              { key: 'moved_at', label: 'Submitted At' },
                              { key: 'ho_paid_date', label: 'HO Paid Date' },
                            ]);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-white text-[10px] font-medium rounded-lg transition-all hover:shadow-md"
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
                    {loadingLvbHistory ? (
                      <div className="text-center py-20">
                        <svg className="animate-spin h-7 w-7 mx-auto mb-3" style={{ color: themeColor }} viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-gray-500">Loading history...</p>
                      </div>
                    ) : lvbHistoryRecords.length === 0 ? (
                      <div className="text-center py-20">
                        <p className="text-xs text-gray-500 font-medium">No history records found</p>
                      </div>
                    ) : lvbHistoryTab === 'all' ? (() => {
                      /* ─────────── ALL RECORDS TAB BODY ─────────── */
                      const filtered = lvbHistoryRecords.filter(rec => {
                        const sl = lvbHistorySearch.toLowerCase();
                        const matchesSearch = !lvbHistorySearch || [
                          rec.vendor_name, rec.invoice_number, rec.shop_name,
                          rec.submitted_by_name, rec.verified_by_name, rec.description,
                          rec.branch_code, branchMap[rec.branch_code],
                        ].some(v => v && v.toLowerCase().includes(sl));
                        const movedDate = rec.moved_at ? rec.moved_at.substring(0, 10) : '';
                        const matchesFrom = !lvbHistoryDateFrom || movedDate >= lvbHistoryDateFrom;
                        const matchesTo = !lvbHistoryDateTo || movedDate <= lvbHistoryDateTo;
                        const matchesBranch = !lvbHistoryBranch || rec.branch_code === lvbHistoryBranch;
                        const invDate = rec.invoice_date ? String(rec.invoice_date).substring(0, 10) : '';
                        const matchesInvFrom = !lvbHistoryInvoiceDateFrom || (invDate && invDate >= lvbHistoryInvoiceDateFrom);
                        const matchesInvTo = !lvbHistoryInvoiceDateTo || (invDate && invDate <= lvbHistoryInvoiceDateTo);
                        return matchesSearch && matchesFrom && matchesTo && matchesBranch && matchesInvFrom && matchesInvTo;
                      });
                      window.__lvbHistoryFiltered = filtered;

                      return filtered.length === 0 ? (
                        <div className="text-center py-20">
                          <p className="text-xs text-gray-500">No records match your filters</p>
                          <button onClick={() => { setLvbHistorySearch(''); setLvbHistoryDateFrom(''); setLvbHistoryDateTo(''); setLvbHistoryBranch(''); setLvbHistoryInvoiceDateFrom(''); setLvbHistoryInvoiceDateTo(''); }} className="mt-2 text-xs text-blue-600 hover:underline">Clear</button>
                        </div>
                      ) : (
                        <table className="border-collapse w-full" style={{ minWidth: '1550px' }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              {['Sr.', 'Branch', 'Invoice Date', 'Vendor Name', 'GST No.', 'Invoice No.', 'Customer Name', 'Cust. Invoice No.', 'SR No.', 'Cust. Invoice Amt (₹)', 'Line Work Amt (₹)', 'Shop Name', 'Description', 'Amount (₹)', 'Remark', 'Submitted By', 'Submitted At', 'HO Paid Date'].map((col, i) => (
                                <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center" style={{ backgroundColor: '#f0f1ff' }}>
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filtered.map((rec, idx) => (
                              <tr key={rec.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{idx + 1}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                  <div className="truncate" title={branchMap[rec.branch_code] || rec.branch_code}>{branchMap[rec.branch_code] || rec.branch_code || '-'}</div>
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                  {rec.invoice_date ? new Date(rec.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate" title={rec.vendor_name}>{rec.vendor_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.gst_no || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.invoice_number || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate" title={rec.customer_name}>{rec.customer_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.customer_invoice_no || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.customer_sr_no || '-'}</td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                  ₹{parseFloat(rec.customer_invoice_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                  ₹{parseFloat(rec.line_work_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.shop_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.description || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                  ₹{parseFloat(rec.payment_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.remark || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.submitted_by_name || '-'}</div></td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                  {rec.moved_at ? rec.moved_at.substring(0, 16).replace('T', ' ') : '-'}
                                </td>
                                <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                  <div className="relative flex items-center justify-center">
                                    <input
                                      type="date"
                                      value={lvbPaidDateEdits[rec.id] ?? rec.ho_paid_date ?? ''}
                                      onChange={(e) => handleLvbPaidDateChange(rec.id, e.target.value)}
                                      className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      style={{ width: '125px' }}
                                    />
                                    {lvbPaidDateSaving[rec.id] && (
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
                          <tfoot className="sticky bottom-0">
                            <tr style={{ backgroundColor: '#f0f1ff' }}>
                              <td colSpan={13} className="px-3 py-1.5 text-[11px] font-bold text-gray-600 text-right border-t-2 border-gray-200">Grand Total</td>
                              <td className="px-2 py-1.5 text-[11px] font-bold text-center border-t-2 border-gray-200 whitespace-nowrap" style={{ color: themeColor }}>
                                ₹{filtered.reduce((s, r) => s + parseFloat(r.payment_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td colSpan={5} className="border-t-2 border-gray-200" />
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })() : (
                      /* ─────────── BY SUBMISSION PERIOD TAB ─────────── */
                      !lvbSelectedPeriod ? (
                        lvbHistoryGrouped.groups?.length === 0 ? (
                          <div className="text-center py-20">
                            <p className="text-sm text-gray-500 font-medium">No grouped periods available</p>
                            <p className="text-[11px] text-gray-400 mt-1">No history records have a valid invoice date.</p>
                          </div>
                        ) : (() => {
                          const filteredGroups = lvbHistoryGrouped.groups.filter(
                            g => !lvbHistoryPeriodsBranch || g.branch_code === lvbHistoryPeriodsBranch
                          );
                          return filteredGroups.length === 0 ? (
                            <div className="text-center py-20">
                              <p className="text-sm text-gray-500 font-medium">No periods for selected branch</p>
                              <button onClick={() => setLvbHistoryPeriodsBranch('')} className="mt-2 text-xs text-blue-600 hover:underline">Clear branch filter</button>
                            </div>
                          ) : (
                            <table className="border-collapse w-full">
                              <thead className="sticky top-0 z-10">
                                <tr style={{ backgroundColor: '#f0f1ff' }}>
                                  {[
                                    { label: 'Sr. No.', width: 60 },
                                    { label: 'Branch', width: 160 },
                                    { label: 'Rule', width: 90 },
                                    { label: 'Period (Invoice Date)', width: 300 },
                                    { label: 'Submitted By (Branch)', width: 180 },
                                    { label: 'Bill Count', width: 110 },
                                    { label: 'Total Amount', width: 150 },
                                    { label: 'HO Paid Date (Apply to All)', width: 260 },
                                  ].map((col, i) => (
                                    <th key={i}
                                      className="px-3 py-2 text-[11px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center"
                                      style={{ width: `${col.width}px`, backgroundColor: '#f0f1ff' }}>
                                      {col.label}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {filteredGroups.map((g, idx) => {
                                  const key = `${g.branch_code}__${g.uploaded_by}__${g.period_start}__${g.period_end}`;
                                  const val = lvbPeriodPaidInputs[key] ?? g.paid_date ?? '';
                                  const applying = lvbPeriodPaidApplying[key];
                                  return (
                                    <tr
                                      key={idx}
                                      className="hover:bg-blue-50 transition-colors"
                                      style={{ height: '38px' }}
                                    >
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-medium">{idx + 1}</td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <div className="truncate" title={branchMap[g.branch_code] || g.branch_code}>
                                          {branchMap[g.branch_code] || g.branch_code || '-'}
                                        </div>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <span
                                          className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                                          style={{
                                            background: g.rule_type === 'weekdays' ? '#dbeafe' : '#fef3c7',
                                            color: g.rule_type === 'weekdays' ? '#1e40af' : '#92400e',
                                          }}
                                          title={g.rule_type === 'weekdays' ? '7-day weekly bucket' : '15-day half-month bucket'}
                                        >
                                          {g.rule_type === 'weekdays' ? 'Weekly' : '15-day'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <button
                                          onClick={() => setLvbSelectedPeriod(g)}
                                          className="inline-flex items-center gap-1.5 underline hover:font-bold transition-all cursor-pointer bg-transparent border-0 p-0"
                                          style={{ color: themeColor }}
                                          title="Click to view bills in this period"
                                        >
                                          <span>{g.period_start_display}</span>
                                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                          </svg>
                                          <span>{g.period_end_display}</span>
                                        </button>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <span className="px-2 py-0.5 rounded-full font-medium">{g.uploaded_by}</span>
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold">{g.record_count}</td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center font-bold text-blue-700">
                                        ₹{parseFloat(g.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-3 py-1 border-r border-gray-100 text-[12px] text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <input
                                            type="date"
                                            value={val}
                                            onChange={(e) => setLvbPeriodPaidInputs(prev => ({ ...prev, [key]: e.target.value }))}
                                            className="px-1.5 py-1 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            style={{ width: '125px' }}
                                          />
                                          <button
                                            onClick={() => handleLvbPeriodPaidApply(g)}
                                            disabled={applying}
                                            className="px-2 py-1 text-[10px] text-white rounded-md disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                                            title="Apply this date to every bill in this period"
                                          >
                                            {applying ? '...' : 'Apply'}
                                          </button>
                                          {g.paid_count > 0 && (
                                            <span
                                              className="text-[9px] px-1.5 py-0.5 rounded-full"
                                              style={{
                                                background: g.paid_date ? '#d1fae5' : '#fef3c7',
                                                color: g.paid_date ? '#065f46' : '#92400e',
                                              }}
                                              title={g.paid_date ? 'All bills share this date' : 'Mixed paid dates'}
                                            >
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
                                  <td colSpan={5} className="px-3 py-1.5 text-[12px] font-bold text-gray-600 text-right border-t-2 border-gray-200">
                                    {lvbHistoryPeriodsBranch ? `Filtered Total (${branchMap[lvbHistoryPeriodsBranch]})` : 'Grand Total'}
                                  </td>
                                  <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200">
                                    {filteredGroups.reduce((s, g) => s + (g.record_count || 0), 0)}
                                  </td>
                                  <td className="px-3 py-1.5 text-[12px] font-bold text-center border-t-2 border-gray-200" style={{ color: themeColor }}>
                                    ₹{filteredGroups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="border-t-2 border-gray-200" />
                                </tr>
                              </tfoot>
                            </table>
                          );
                        })()
                      ) : (() => {
                        const idSet = new Set(lvbSelectedPeriod.record_ids || []);
                        const periodRecords = lvbHistoryRecords.filter(r => idSet.has(r.id));
                        return (
                          <table className="border-collapse w-full" style={{ minWidth: '1550px' }}>
                            <thead className="sticky top-0 z-10">
                              <tr style={{ backgroundColor: '#f0f1ff' }}>
                                {['Sr.', 'Branch', 'Invoice Date', 'Vendor Name', 'GST No.', 'Invoice No.', 'Customer Name', 'Cust. Invoice No.', 'SR No.', 'Cust. Invoice Amt (₹)', 'Line Work Amt (₹)', 'Shop Name', 'Description', 'Amount (₹)', 'Remark', 'Submitted By', 'Submitted At', 'HO Paid Date'].map((col, i) => (
                                  <th key={i} className="px-2 py-1.5 text-[10px] font-bold text-gray-700 border-r border-b-2 border-gray-200 last:border-r-0 uppercase tracking-wide whitespace-nowrap text-center" style={{ backgroundColor: '#f0f1ff' }}>
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {periodRecords.map((rec, idx) => (
                                <tr key={rec.id} className="hover:bg-blue-50/30" style={{ height: '34px' }}>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{idx + 1}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">
                                    <div className="truncate" title={branchMap[rec.branch_code] || rec.branch_code}>{branchMap[rec.branch_code] || rec.branch_code || '-'}</div>
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                    {rec.invoice_date ? new Date(rec.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate" title={rec.vendor_name}>{rec.vendor_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.gst_no || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.invoice_number || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate" title={rec.customer_name}>{rec.customer_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.customer_invoice_no || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center">{rec.customer_sr_no || '-'}</td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                    ₹{parseFloat(rec.customer_invoice_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                    ₹{parseFloat(rec.line_work_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.shop_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.description || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] font-bold text-black text-center whitespace-nowrap">
                                    ₹{parseFloat(rec.payment_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.remark || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center"><div className="truncate">{rec.submitted_by_name || '-'}</div></td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-black text-center whitespace-nowrap">
                                    {rec.moved_at ? rec.moved_at.substring(0, 16).replace('T', ' ') : '-'}
                                  </td>
                                  <td className="px-2 py-0.5 border-r border-gray-100 text-[11px] text-center">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="date"
                                        value={lvbPaidDateEdits[rec.id] ?? rec.ho_paid_date ?? ''}
                                        onChange={(e) => handleLvbPaidDateChange(rec.id, e.target.value)}
                                        className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        style={{ width: '125px' }}
                                      />
                                      {lvbPaidDateSaving[rec.id] && (
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
                          </table>
                        );
                      })()
                    )}
                  </div>

                  {/* Footer */}
                  {!loadingLvbHistory && (() => {
                    if (lvbHistoryTab === 'periods') {
                      if (lvbSelectedPeriod) {
                        const idSet = new Set(lvbSelectedPeriod.record_ids || []);
                        const periodRecords = lvbHistoryRecords.filter(r => idSet.has(r.id));
                        const total = periodRecords.reduce((s, r) => s + parseFloat(r.payment_amount || 0), 0);
                        return (
                          <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                              <span>Period: <strong className="text-gray-800">{lvbSelectedPeriod.period_start_display} → {lvbSelectedPeriod.period_end_display}</strong></span>
                              <span>|</span>
                              <span>Bills: <strong className="text-gray-800">{periodRecords.length}</strong></span>
                              <span>|</span>
                              <span>Amount: <strong className="text-blue-700">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => setLvbSelectedPeriod(null)} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-blue-700 border-blue-300 hover:bg-blue-50">← Back</button>
                              <button onClick={() => { setShowLvbHistoryModal(false); setLvbHistorySearch(''); setLvbHistoryDateFrom(''); setLvbHistoryDateTo(''); setLvbHistoryBranch(''); setLvbHistoryInvoiceDateFrom(''); setLvbHistoryInvoiceDateTo(''); setLvbHistoryTab('all'); setLvbSelectedPeriod(null); setLvbHistoryPeriodsBranch(''); }} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                            </div>
                          </div>
                        );
                      }
                      const filteredGroups = (lvbHistoryGrouped.groups || []).filter(
                        g => !lvbHistoryPeriodsBranch || g.branch_code === lvbHistoryPeriodsBranch
                      );
                      const totalRecs = filteredGroups.reduce((s, g) => s + (g.record_count || 0), 0);
                      const totalAmt = filteredGroups.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0);
                      return (
                        <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center">
                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>Total Periods: <strong className="text-gray-800">{filteredGroups.length}</strong></span>
                            {lvbHistoryPeriodsBranch && (
                              <>
                                <span>|</span>
                                <span className="text-blue-700">Filtered by: <strong>{branchMap[lvbHistoryPeriodsBranch]}</strong></span>
                              </>
                            )}
                            <span>|</span>
                            <span>Total Bills: <strong className="text-gray-800">{totalRecs}</strong></span>
                            <span>|</span>
                            <span>Total Amount: <strong className="text-blue-700">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          </div>
                          <button onClick={() => { setShowLvbHistoryModal(false); setLvbHistorySearch(''); setLvbHistoryDateFrom(''); setLvbHistoryDateTo(''); setLvbHistoryBranch(''); setLvbHistoryInvoiceDateFrom(''); setLvbHistoryInvoiceDateTo(''); setLvbHistoryTab('all'); setLvbSelectedPeriod(null); setLvbHistoryPeriodsBranch(''); }} className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100">Close</button>
                        </div>
                      );
                    }
                    // ALL records footer
                    const filtered = window.__lvbHistoryFiltered || lvbHistoryRecords;
                    const filteredAmt = filtered.reduce((s, r) => s + parseFloat(r.payment_amount || 0), 0);
                    const totalAmt = lvbHistoryRecords.reduce((s, r) => s + parseFloat(r.payment_amount || 0), 0);
                    const isFiltered = lvbHistorySearch || lvbHistoryDateFrom || lvbHistoryDateTo || lvbHistoryBranch || lvbHistoryInvoiceDateFrom || lvbHistoryInvoiceDateTo;
                    return (
                      <div className="shrink-0 px-4 py-2 border-t bg-gray-50 flex justify-between items-center gap-2">
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          <span>Total Records: <strong className="text-gray-800">{lvbHistoryRecords.length}</strong></span>
                          {isFiltered && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>Filtered: <strong className="text-blue-700">{filtered.length}</strong></span>
                            </>
                          )}
                          <span className="text-gray-300">|</span>
                          <span>Total Amount: <strong className="text-gray-800">₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                          {isFiltered && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span>Filtered Amount: <strong className="text-blue-700">₹{filteredAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </>
                          )}
                        </div>
                        <button onClick={() => { setShowLvbHistoryModal(false); setLvbHistorySearch(''); setLvbHistoryDateFrom(''); setLvbHistoryDateTo(''); setLvbHistoryBranch(''); setLvbHistoryInvoiceDateFrom(''); setLvbHistoryInvoiceDateTo(''); setLvbHistoryTab('all'); setLvbSelectedPeriod(null); setLvbHistoryPeriodsBranch(''); }}
                          className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 whitespace-nowrap">Close</button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
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
              <div className="sticky bottom-0 bg-white border-t px-4 sm:px-6 py-3 sm:py-4 flex justify-end"><button onClick={() => setShowExpenseHeadModal(false)} className="px-3 sm:px-4 py-1.5 sm:py-2 border rounded-lg text-[11px] sm:text-xs font-medium text-black hover:bg-gray-50 transition-colors" style={{ borderColor: '#D1D5DB' }}>Close</button></div>
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