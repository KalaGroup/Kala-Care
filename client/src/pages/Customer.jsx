import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  UserIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  IdentificationIcon,
  CalendarIcon,
  HomeIcon,
  WrenchIcon,
  FunnelIcon,
  ChevronDownIcon,
  XMarkIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  CreditCardIcon,
  CurrencyRupeeIcon,
  TagIcon,
  BuildingOffice2Icon,
  ArrowDownTrayIcon,
  EyeIcon,
  DocumentMagnifyingGlassIcon,
  CogIcon,
  BoltIcon,
  BeakerIcon,
  ChartBarIcon,
  CircleStackIcon,
  CloudIcon,
  CpuChipIcon,
  CubeIcon,
  CubeTransparentIcon,
  DocumentArrowDownIcon,
  DocumentCheckIcon,
  SparklesIcon,
  TableCellsIcon,
  WrenchScrewdriverIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { CiExport } from "react-icons/ci";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// Table configurations with correct endpoints
const TABLES = [
  {
    id: 'customers',
    name: 'Customers',
    icon: UserIcon,
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    endpoint: '/customers/',
    singleEndpoint: (id) => `/customers/${id}`,
    updateEndpoint: (id) => `/customers/${id}`,
    deleteEndpoint: (id) => `/customers/${id}`,
    bulkDeleteEndpoint: '/customers/bulk-delete',
    exportEndpoint: '/customers/export',
    supportsPagination: true
  },
  {
    id: 'amc_agreements',
    name: 'AMC Agreements',
    icon: DocumentTextIcon,
    color: '#10B981',
    bgColor: '#fdf4ec',
    endpoint: '/customers/amc-agreements/',
    singleEndpoint: (id) => `/customers/amc-agreements/${id}`,
    updateEndpoint: (id) => `/customers/amc-agreements/${id}`,
    deleteEndpoint: (id) => `/customers/amc-agreements/${id}`,
    bulkDeleteEndpoint: '/customers/amc-agreements/bulk-delete',
    exportEndpoint: '/customers/amc-agreements/export',
    supportsPagination: true
  },
  {
    id: 'asset_detailed',
    name: 'Asset Detailed',
    icon: CpuChipIcon,
    color: '#F59E0B',
    bgColor: '#FFFBEB',
    endpoint: '/customers/asset-detailed/',
    singleEndpoint: (id) => `/customers/asset-detailed/${id}`,
    updateEndpoint: (id) => `/customers/asset-detailed/${id}`,
    deleteEndpoint: (id) => `/customers/asset-detailed/${id}`,
    bulkDeleteEndpoint: '/customers/asset-detailed/bulk-delete',
    exportEndpoint: '/customers/asset-detailed/export',
    supportsPagination: true
  },
  {
    id: 'asset_services',
    name: 'Asset Services',
    icon: WrenchScrewdriverIcon,
    color: '#EF4444',
    bgColor: '#FEF2F2',
    endpoint: '/customers/asset-services/',
    singleEndpoint: (id) => `/customers/asset-services/${id}`,
    updateEndpoint: (id) => `/customers/asset-services/${id}`,
    deleteEndpoint: (id) => `/customers/asset-services/${id}`,
    bulkDeleteEndpoint: '/customers/asset-services/bulk-delete',
    exportEndpoint: '/customers/asset-services/export',
    supportsPagination: true
  },
  {
    id: 'anubandhan_plus',
    name: 'Anubandhan Plus',
    icon: SparklesIcon,
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    endpoint: '/customers/anubandhan-plus/',
    singleEndpoint: (id) => `/customers/anubandhan-plus/${id}`,
    updateEndpoint: (id) => `/customers/anubandhan-plus/${id}`,
    deleteEndpoint: (id) => `/customers/anubandhan-plus/${id}`,
    bulkDeleteEndpoint: '/customers/anubandhan-plus/bulk-delete',
    exportEndpoint: '/customers/anubandhan-plus/export',
    supportsPagination: true
  },
  {
    id: 'anubandhan',
    name: 'Anubandhan',
    icon: DocumentDuplicateIcon,
    color: '#EC4899',
    bgColor: '#FDF2F8',
    endpoint: '/customers/anubandhan/',
    singleEndpoint: (id) => `/customers/anubandhan/${id}`,
    updateEndpoint: (id) => `/customers/anubandhan/${id}`,
    deleteEndpoint: (id) => `/customers/anubandhan/${id}`,
    bulkDeleteEndpoint: '/customers/anubandhan/bulk-delete',
    exportEndpoint: '/customers/anubandhan/export',
    supportsPagination: true
  },
  {
    id: 'bandhan_plus',
    name: 'Bandhan Plus',
    icon: SparklesIcon,
    color: '#14B8A6',
    bgColor: '#F0FDFA',
    endpoint: '/customers/bandhan-plus/',
    singleEndpoint: (id) => `/customers/bandhan-plus/${id}`,
    updateEndpoint: (id) => `/customers/bandhan-plus/${id}`,
    deleteEndpoint: (id) => `/customers/bandhan-plus/${id}`,
    bulkDeleteEndpoint: '/customers/bandhan-plus/bulk-delete',
    exportEndpoint: '/customers/bandhan-plus/export',
    supportsPagination: true
  },
  {
    id: 'pulse',
    name: 'Pulse Quotations',
    icon: BoltIcon,
    color: '#F97316',
    bgColor: '#FFF7ED',
    endpoint: '/customers/pulse-quotations/',
    singleEndpoint: (id) => `/customers/pulse-quotations/${id}`,
    updateEndpoint: (id) => `/customers/pulse-quotations/${id}`,
    deleteEndpoint: (id) => `/customers/pulse-quotations/${id}`,
    bulkDeleteEndpoint: '/customers/pulse-quotations/bulk-delete',
    exportEndpoint: '/customers/pulse-quotations/export',
    supportsPagination: true
  },
  {
    id: 'regular_bandhan',
    name: 'Regular Bandhan',
    icon: CircleStackIcon,
    color: '#6B7280',
    bgColor: '#F9FAFB',
    endpoint: '/customers/regular-bandhan/',
    singleEndpoint: (id) => `/customers/regular-bandhan/${id}`,
    updateEndpoint: (id) => `/customers/regular-bandhan/${id}`,
    deleteEndpoint: (id) => `/customers/regular-bandhan/${id}`,
    bulkDeleteEndpoint: '/customers/regular-bandhan/bulk-delete',
    exportEndpoint: '/customers/regular-bandhan/export',
    supportsPagination: true
  },
  {
    id: 'lms_data',
    name: 'LMS Data',
    icon: ChartBarIcon,
    color: '#06B6D4',
    bgColor: '#ECFEFF',
    endpoint: '/customers/lms-data/',
    singleEndpoint: (id) => `/customers/lms-data/${id}`,
    updateEndpoint: (id) => `/customers/lms-data/${id}`,
    deleteEndpoint: (id) => `/customers/lms-data/${id}`,
    bulkDeleteEndpoint: '/customers/lms-data/bulk-delete',
    exportEndpoint: '/customers/lms-data/export',
    supportsPagination: true
  },
  {
    id: 'open_sr_load_reports',
    name: 'Open SR Load Reports',
    icon: DocumentTextIcon,
    color: '#A78BFA',
    bgColor: '#F5F3FF',
    endpoint: '/customers/open-sr-load-reports/',
    singleEndpoint: (id) => `/customers/open-sr-load-reports/${id}`,
    updateEndpoint: (id) => `/customers/open-sr-load-reports/${id}`,
    deleteEndpoint: (id) => `/customers/open-sr-load-reports/${id}`,
    bulkDeleteEndpoint: '/customers/open-sr-load-reports/bulk-delete',
    exportEndpoint: '/customers/open-sr-load-reports/export',
    supportsPagination: true
  }
];

// Helper function to determine field type based on column name and sample data
const getFieldType = (column, sampleValue) => {
  if (column.includes('date') || column === 'created_at' || column === 'updated_at' ||
    column === 'agreement_start_date' || column === 'agreement_end_date' ||
    column === 'commissioning_date' || column === 'installation_date' ||
    column === 'last_sr_close_date' || column === 'last_oil_change_date' ||
    column === 'created_date_time' || column === 'date_of_payment' ||
    column === 'payment_update_date_time' || column === 'quotation_expiry_date' ||
    column === 'lead_created_date' || column === 'quote_submitted_date' ||
    column === 'quotation_submit_date' || column === 'quotation_approval_date' ||
    column === 'order_creation_date' || column === 'payment_update_date' ||
    column === 'warranty_expiry_date' || column === 'agreement_created_date' ||
    column === 'sr_due_date' || column === 'appointment_date' ||
    column === 'task_start_date' || column === 'task_end_date' ||
    column === 'under_monitoring_date' || column === 'actual_sr_due_date' ||
    column === 'close_date_time' || column === 'asm_ase_remarks_date' ||
    column === 'krm_active_date' || column === 'krm_inactive_date' ||
    column === 'krm_subscription_start_date' || column === 'krm_subscription_end_date' ||
    column === 'qualifying_date' || column === 'next_action_date') {
    return 'date';
  }

  if (column.includes('amount') || column.includes('price') || column.includes('kva') ||
    column.includes('years') || column.includes('count') || column === 'quote_price' ||
    column === 'actual_amount' || column === 'total_amount' || column === 'labor_amount' ||
    column === 'parts_amount' || column === 'quotation_value_including_tax' ||
    column.includes('rating') || column === 'no_of_years' || column === 'number_of_agreement_years' ||
    column === 'last_agreement_no_of_years' || column.includes('phone') || column.includes('mobile') ||
    column === 'pincode' || column === 'account_no' || column === 'transaction_id' ||
    column === 'agent_id' || column === 'sd_id' || column === 'branch_id' ||
    column === 'id_col' || column === 'pulse_id' || column === 'pulse_instance_id' ||
    column === 'service_request_no' || column === 'ticket_no' || column === 'agreement_no' ||
    column === 'account_id' || column === 'efsr_krm_number') {
    return 'string';
  }

  if (column.includes('is_') || column.includes('flag') || column === 'quote_revised_flag' ||
    column === 'new_price_applicable' || column === 'is_expired' || column === 'is_invoice_sent' ||
    column === 'is_refund' || column === 'is_neft_confirm' || column === 'is_cheque_confirm' ||
    column === 'oil_change_flg' || column === 'claim_created' || column === 'repeat' ||
    column === 'convert_pm_to_wet_pm_flag' || column === 'wet_pm_due_flag' ||
    column === 'csp_prepone_flag' || column === 'bandhan_pm_sr_closure_within_15_days_flag' ||
    column === 'bandhan_pm_sr_closure_90_days_max_after_pm_due_date_flag' ||
    column === 'bandhan_job_card_creation_prior_to_60_days_flag') {
    return 'boolean';
  }

  if (column === 'id' || column === 'instance_id' || column === 'created_at' || column === 'updated_at') {
    return 'readonly';
  }

  if (sampleValue !== undefined) {
    if (typeof sampleValue === 'boolean') return 'boolean';
    if (typeof sampleValue === 'number') {
      if (Number.isInteger(sampleValue) &&
        (column.includes('years') || column.includes('count') || column === 'no_of_years' ||
          column === 'number_of_agreement_years' || column === 'last_agreement_no_of_years')) {
        return 'integer';
      }
      return 'float';
    }
    if (sampleValue instanceof Date) return 'date';
  }

  return 'text';
};

// Resizable Table Header Component
const ResizableHeader = ({ children, width, onResize, onResizeStart, onResizeEnd, className, isResizing }) => {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <th
      className={`${className} relative select-none`}
      style={{ width: width ? `${width}px` : 'auto', minWidth: '80px' }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
      </div>
      <div
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500 transition-all ${isResizing ? 'bg-blue-600 w-1.5' : isHovering ? 'bg-blue-400 w-1' : ''
          }`}
        onMouseDown={onResizeStart}
        style={{ userSelect: 'none' }}
      />
    </th>
  );
};

// Sortable Table Header Component
const SortableTableHeader = ({ id, children, className, style, width, onResizeStart, isResizing }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: isDragging ? 'grabbing' : 'grab',
    backgroundColor: isDragging ? '#f3f4f6' : 'transparent',
    opacity: isDragging ? 0.5 : 1,
    width: width ? `${width}px` : 'auto',
    minWidth: '80px',
    ...style,
  };

  const handleDragHandleClick = (e) => {
    e.stopPropagation();
  };

  return (
    <th
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      className={`${className} relative select-none`}
    >
      <div className="flex items-center gap-1">
        <div
          className="cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100"
          {...listeners}
          onClick={handleDragHandleClick}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm10-8a2 2 0 10-4 0 2 2 0 004 0zm0 8a2 2 0 10-4 0 2 2 0 004 0zm0-16a2 2 0 10-4 0 2 2 0 004 0z" />
          </svg>
        </div>
        <span>{children}</span>
      </div>
      <div
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500 transition-all ${isResizing ? 'bg-blue-600 w-1.5' : ''
          }`}
        onMouseDown={onResizeStart}
        style={{ userSelect: 'none' }}
      />
    </th>
  );
};

// Fixed Table Header Component
const FixedTableHeader = ({ children, className, width, onResizeStart, isResizing }) => {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <th
      className={`${className} relative select-none`}
      style={{ width: width ? `${width}px` : 'auto', minWidth: '60px' }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
      </div>
      <div
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500 transition-all ${isResizing ? 'bg-blue-600 w-1.5' : isHovering ? 'bg-blue-400 w-1' : ''
          }`}
        onMouseDown={onResizeStart}
        style={{ userSelect: 'none' }}
      />
    </th>
  );
};

// Pagination Component
const Pagination = ({ currentPage, totalPages, onPageChange, totalCount, pageSize }) => {
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="text-xs text-black">
        Showing <span className="font-medium">{startRecord}</span> to <span className="font-medium">{endRecord}</span> of{' '}
        <span className="font-medium">{totalCount}</span> records
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-all"
        >
          <div className="flex">
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </div>
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-all"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </button>

        {getPageNumbers().map((page, index) => (
          <button
            key={index}
            onClick={() => typeof page === 'number' && onPageChange(page)}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all ${page === currentPage
              ? 'bg-blue-600 text-white shadow-md'
              : page === '...'
                ? 'cursor-default bg-transparent'
                : 'border border-gray-300 hover:bg-gray-100 text-black'
              }`}
            disabled={page === '...'}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-all"
        >
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-all"
        >
          <div className="flex">
            <ChevronRightIcon className="h-3.5 w-3.5" />
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </div>
        </button>
      </div>
    </div>
  );
};

const Customer = () => {
  const themeColor = '#2f3192';
  const tableContainerRef = useRef(null);
  const topScrollBarRef = useRef(null);
  const tablesScrollRef = useRef(null);

  // Get current user from localStorage
  const [currentUser, setCurrentUser] = useState(null);

  // State for current table
  const [currentTable, setCurrentTable] = useState(TABLES[0]);
  const [tableData, setTableData] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  const [columnTypes, setColumnTypes] = useState({});
  const [columnOrder, setColumnOrder] = useState([]);

  // Column width states
  const [columnWidths, setColumnWidths] = useState({});
  const [resizingColumn, setResizingColumn] = useState(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  // UI States
  const [loading, setLoading] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(50);

  // Table counts state
  const [tableCounts, setTableCounts] = useState({});

  // Store data per table to maintain state when switching tabs
  const [tablesDataCache, setTablesDataCache] = useState({});
  const [tablesColumnsCache, setTablesColumnsCache] = useState({});
  const [tablesPageCache, setTablesPageCache] = useState({});
  const [tablesSelectedRowsCache, setTablesSelectedRowsCache] = useState({});
  const [tablesSearchCache, setTablesSearchCache] = useState({});
  const [tablesTotalCountCache, setTablesTotalCountCache] = useState({});

  // Modal States
  const [showViewModal, setShowViewModal] = useState(false);
  const [customerCompleteData, setCustomerCompleteData] = useState(null);
  const [loadingCompleteData, setLoadingCompleteData] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Fetch all table counts
  const fetchAllTableCounts = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/customers/counts/all`);
      setTableCounts(response.data);
    } catch (error) {
      console.error('Error fetching table counts:', error);
    }
  };

  // Load saved column order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem(`customer_${currentTable.id}_column_order`);
    if (savedOrder && tableColumns.length > 0) {
      try {
        const parsedOrder = JSON.parse(savedOrder);
        const currentColumnsSet = new Set(tableColumns);
        const savedOrderValid = parsedOrder.every(col => currentColumnsSet.has(col));
        if (savedOrderValid) {
          setColumnOrder(parsedOrder);
          return;
        }
      } catch (e) {
        console.error('Error parsing saved column order:', e);
      }
    }
    setColumnOrder([...tableColumns]);
  }, [currentTable.id, tableColumns]);

  // Load saved column widths from localStorage
  useEffect(() => {
    const savedWidths = localStorage.getItem(`customer_${currentTable.id}_column_widths`);
    if (savedWidths) {
      try {
        const parsedWidths = JSON.parse(savedWidths);
        setColumnWidths(parsedWidths);
      } catch (e) {
        console.error('Error parsing saved column widths:', e);
      }
    }
  }, [currentTable.id]);

  // Save column order to localStorage
  useEffect(() => {
    if (columnOrder.length > 0 && tableColumns.length > 0) {
      localStorage.setItem(`customer_${currentTable.id}_column_order`, JSON.stringify(columnOrder));
    }
  }, [columnOrder, currentTable.id, tableColumns]);

  // Save column widths to localStorage
  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) {
      localStorage.setItem(`customer_${currentTable.id}_column_widths`, JSON.stringify(columnWidths));
    }
  }, [columnWidths, currentTable.id]);

  // Get user from sessionStorage on component mount
  useEffect(() => {
    const userData = sessionStorage.getItem('user');
    if (userData) {
      try {
        setCurrentUser(JSON.parse(userData));
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    fetchAllTableCounts();
  }, []);

  // Export permission - fetched from backend API (same as Dashboard)
  const [canExport, setCanExport] = useState(false);

  // Fetch export permission from API
  const fetchExportPermission = useCallback(async () => {
    if (!currentUser?.user_id) return;
    try {
      const payload = {
        user_id: currentUser.user_id || currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        branch: currentUser.branch
      };
      const response = await axios.post(
        `${API_BASE_URL}/performance/check-export-permission`,
        payload
      );
      setCanExport(response.data?.can_export || false);
    } catch (error) {
      console.error('Error fetching export permission:', error);
      setCanExport(false);
    }
  }, [currentUser]);

  // Fetch permission when currentUser becomes available
  useEffect(() => {
    if (currentUser?.user_id) {
      fetchExportPermission();
    }
  }, [currentUser?.user_id, fetchExportPermission]);

  // When table changes, restore its cached data or fetch fresh data
  useEffect(() => {
    const cachedData = tablesDataCache[currentTable.id];
    const cachedColumns = tablesColumnsCache[currentTable.id];
    const cachedPage = tablesPageCache[currentTable.id];
    const cachedSelectedRows = tablesSelectedRowsCache[currentTable.id] || [];
    const cachedSearch = tablesSearchCache[currentTable.id];
    const cachedTotalCount = tablesTotalCountCache[currentTable.id];

    // Check if search term has changed for this table
    if (cachedSearch !== undefined && cachedSearch !== globalSearchTerm) {
      // Search term changed, need to refetch
      setTableData([]);
      setCurrentPage(1);
      setSelectedRows([]);
      fetchData(1, globalSearchTerm);
    } else if (cachedData && cachedData.length > 0 && cachedTotalCount) {
      // Restore from cache
      setTableData(cachedData);
      setTableColumns(cachedColumns || []);
      setCurrentPage(cachedPage || 1);
      setSelectedRows(cachedSelectedRows);
      setTotalCount(cachedTotalCount);
    } else {
      // Fetch fresh data
      setTableData([]);
      setCurrentPage(1);
      setSelectedRows([]);
      fetchData(1, globalSearchTerm);
    }
  }, [currentTable.id]);

  // Set up scroll synchronization
  useEffect(() => {
    const tableContainer = tableContainerRef.current;
    const topScrollBar = topScrollBarRef.current;

    if (!tableContainer || !topScrollBar) return;

    const updateTopScrollWidth = () => {
      // Get the actual table element
      const tableElement = tableContainer.querySelector('table');
      if (tableElement && topScrollBar) {
        // Get the actual scroll width of the table
        const tableWidth = tableElement.scrollWidth;
        // Create or get the inner div
        let innerDiv = topScrollBar.querySelector('div');
        if (innerDiv) {
          innerDiv.style.width = `${tableWidth}px`;
        }
      }
    };

    const handleTableScroll = () => {
      if (topScrollBar.scrollLeft !== tableContainer.scrollLeft) {
        topScrollBar.scrollLeft = tableContainer.scrollLeft;
      }
    };

    const handleTopScroll = () => {
      if (tableContainer.scrollLeft !== topScrollBar.scrollLeft) {
        tableContainer.scrollLeft = topScrollBar.scrollLeft;
      }
    };

    // Initial width update
    setTimeout(updateTopScrollWidth, 100);

    // Update width when table content changes
    const observer = new MutationObserver(updateTopScrollWidth);
    if (tableContainer) {
      observer.observe(tableContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }

    tableContainer.addEventListener('scroll', handleTableScroll);
    topScrollBar.addEventListener('scroll', handleTopScroll);

    // Update on window resize
    window.addEventListener('resize', updateTopScrollWidth);

    return () => {
      tableContainer.removeEventListener('scroll', handleTableScroll);
      topScrollBar.removeEventListener('scroll', handleTopScroll);
      window.removeEventListener('resize', updateTopScrollWidth);
      observer.disconnect();
    };
  }, [tableData, columnWidths]);

  // Column resize handlers
  const handleResizeStart = (e, columnId) => {
    e.preventDefault();
    setResizingColumn(columnId);
    setStartX(e.clientX);
    setStartWidth(columnWidths[columnId] || 150);

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!resizingColumn) return;

    const diff = e.clientX - startX;
    const newWidth = Math.max(80, startWidth + diff);
    setColumnWidths(prev => ({
      ...prev,
      [resizingColumn]: newWidth
    }));
  };

  const handleResizeEnd = () => {
    setResizingColumn(null);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  const HIDDEN_FIELDS = {
    'customers': ['id', 'created_at', 'updated_at', 'last_updated_by'],
    'amc_agreements': ['id', 'created_at', 'updated_at', 'zone_name', 'sd_id', 'sd_name'],
    'asset_detailed': ['id', 'created_at', 'updated_at', 'zone_name', 'sd_id', 'sd_name', 'asset_number'],
    'asset_services': ['id', 'created_at', 'updated_at', 'zone_name', 'sd_id', 'sd_name'],
    'anubandhan_plus': ['id', 'created_at', 'updated_at', 'zone', 'payment_type', 'transaction_id', 'bank_name', 'account_no', 'date_of_payment', 'payment_update_date_time', 'is_neft_confirm', 'is_cheque_confirm', 'cheque_deposited_address', 'cheque_given_dealership', 'cheque_deposited', 'cheque_to_dealer', 'employee_name', 'pulse_id', 'is_invoice_sent', 'is_refund', 'agent_id', 'quote_price', 'quotation_value_including_tax', 'name_of_agent', 'actual_amount', 'reason_of_short_payment', 'status_updated_by_admin', 'quotation_expiry_date', 'is_expired', 'payment_updated_month', 'pulse_instance_id', 'new_price_applicable'],
    'anubandhan': ['id', 'created_at', 'updated_at', 'id_col', 'zone', 'payment_type', 'transaction_id', 'bank_name', 'account_no', 'date_of_payment', 'payment_update_date_time', 'is_neft_confirm', 'is_cheque_confirm', 'cheque_deposited_address', 'cheque_given_dealership', 'cheque_deposited', 'cheque_to_dealer', 'employee_name', 'pulse_id', 'is_invoice_sent', 'is_refund', 'agent_id', 'quote_price', 'quotation_value_including_tax', 'name_of_agent', 'actual_amount', 'reason_of_short_payment', 'status_updated_by_admin', 'quotation_expiry_date', 'is_expired', 'payment_updated_month', 'pulse_instance_id', 'new_price_applicable'],
    'bandhan_plus': ['id', 'created_at', 'updated_at', 'id_col', 'zone', 'payment_type', 'transaction_id', 'bank_name', 'account_no', 'date_of_payment', 'payment_update_date_time', 'is_neft_confirm', 'is_cheque_confirm', 'cheque_deposited_address', 'cheque_given_dealership', 'cheque_deposited', 'cheque_to_dealer', 'employee_name', 'pulse_id', 'is_invoice_sent', 'is_refund', 'agent_id', 'quote_price', 'quotation_value_including_tax', 'name_of_agent', 'actual_amount', 'reason_of_short_payment', 'status_updated_by_admin', 'is_expired', 'payment_updated_month', 'pulse_instance_id', 'new_price_applicable'],
    'pulse': ['id', 'created_at', 'updated_at', 'exception_enquiry_no', 'lead_no', 'quotation_lead_assigned_name', 'quotation_lead_assigned_job_title', 'quotation_lead_assigned_phone', 'quotation_lead_assigned_uid'],
    'regular_bandhan': ['id', 'created_at', 'updated_at', 'zone', 'actual_amount', 'reason_of_short_payment', 'status_updated_by_admin'],
    'lms_data': [
      'id', 'created_at', 'updated_at',
      // existing hidden
      'sd_name', 'sd_id', 'zone', 'instance_id_col', 'order_number', 'order_creation_date',
      // columns with no data in new file (always blank) — hide them
      'product_list', 'product_type',
      // new but low-value-to-show columns — hide to keep table readable
      'sr_sub_type_2', 'tele_caller_uid', 'tele_caller_mobile_number',
      'enquiry_allocation_remarks', 'engine_app_code', 'efsr_contact_name',
      'efsr_customer_number', 'qualifying_date', 'quotation_lead_assigned_uid',
      'service_engineer_uid', 'sic_code', 'sic_code_type',
      'labour_invoice_number', 'part_invoice_amount', 'part_invoice_number',
      'lead_assign_to_sd', 'new_contact'
    ],
    'open_sr_load_reports': ['id', 'created_at', 'updated_at']
  };

  const fetchData = async (pageNum = 1, searchValue = globalSearchTerm) => {
    setLoading(true);

    try {
      const skip = (pageNum - 1) * pageSize;
      const params = {
        skip: skip,
        limit: pageSize
      };

      if (searchValue && searchValue.trim()) {
        params.search = searchValue.trim();
      }

      const response = await axios.get(`${API_BASE_URL}${currentTable.endpoint}`, {
        params: params
      });

      let newData = response.data;

      // IMPORTANT: Get total count from response headers
      // The backend sets 'x-total-count' header
      const totalCountFromHeader = response.headers['x-total-count'];
      let totalRecords = 0;

      if (totalCountFromHeader) {
        totalRecords = parseInt(totalCountFromHeader);
      } else {
        // Fallback: if no header, use array length
        totalRecords = Array.isArray(newData) ? newData.length : 0;
      }

      // Ensure newData is an array
      if (!Array.isArray(newData)) {
        newData = [];
      }

      setTableData(newData);
      setTotalCount(totalRecords);
      setSelectedRows([]);

      // Cache the data for this table
      setTablesDataCache(prev => ({
        ...prev,
        [currentTable.id]: newData
      }));
      setTablesPageCache(prev => ({
        ...prev,
        [currentTable.id]: pageNum
      }));
      setTablesSearchCache(prev => ({
        ...prev,
        [currentTable.id]: searchValue
      }));
      setTablesTotalCountCache(prev => ({
        ...prev,
        [currentTable.id]: totalRecords
      }));

      if (newData.length > 0) {
        const hiddenFields = HIDDEN_FIELDS[currentTable.id] || ['id', 'created_at', 'updated_at'];
        const columns = Object.keys(newData[0]).filter(key => !hiddenFields.includes(key));
        setTableColumns(columns);
        setTablesColumnsCache(prev => ({
          ...prev,
          [currentTable.id]: columns
        }));

        const types = {};
        columns.forEach(col => {
          types[col] = getFieldType(col, newData[0][col]);
        });
        setColumnTypes(types);

        const defaultWidths = {};
        columns.forEach(col => {
          if (!columnWidths[col]) {
            defaultWidths[col] = 150;
          }
        });
        if (Object.keys(defaultWidths).length > 0) {
          setColumnWidths(prev => ({ ...prev, ...defaultWidths }));
        }

        if (!columnWidths['sno-col']) {
          setColumnWidths(prev => ({ ...prev, 'sno-col': 80 }));
        }
        if (canExport && !columnWidths['select-col']) {
          setColumnWidths(prev => ({ ...prev, 'select-col': 50 }));
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(`Failed to fetch ${currentTable.name}: ${error.response?.data?.detail || error.message}`);
      setTableData([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    const totalPagesCount = Math.ceil(totalCount / pageSize);
    if (newPage < 1 || newPage > totalPagesCount) return;
    setCurrentPage(newPage);
    fetchData(newPage, globalSearchTerm);
    // Scroll to top of table
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  };

  // Handle column drag end
  const handleColumnDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);

        const newOrder = [...items];
        const [movedItem] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, movedItem);

        return newOrder;
      });
    }
  };

  // Improved search change handler that properly handles spaces and special characters
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setGlobalSearchTerm(value);

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    setLoading(true);

    const timeout = setTimeout(() => {
      // Clear all caches when search changes
      setTablesDataCache({});
      setTablesColumnsCache({});
      setTablesPageCache({});
      setTablesSelectedRowsCache({});
      setTablesSearchCache({});
      setTablesTotalCountCache({});

      // Reset current table data
      setTableData([]);
      setCurrentPage(1);
      setSelectedRows([]);

      // Pass the raw search value to the API - backend will handle the search properly
      fetchData(1, value);
    }, 500);

    setSearchTimeout(timeout);
  };

  const handleClearSearch = () => {
    setGlobalSearchTerm('');
    // Clear all caches including the full data cache
    setTablesDataCache({});
    setTablesColumnsCache({});
    setTablesPageCache({});
    setTablesSelectedRowsCache({});
    setTablesSearchCache({});
    setTablesTotalCountCache({});
    setTableData([]);
    setCurrentPage(1);
    setSelectedRows([]);
    fetchData(1, '');
  };

  // Clear all selected rows
  const handleClearSelection = () => {
    setSelectedRows([]);
    setTablesSelectedRowsCache(prev => ({
      ...prev,
      [currentTable.id]: []
    }));
    toast.success('All selections cleared');
  };

  // Fetch customer complete data by instance_id
  const fetchCustomerCompleteData = async (instanceId) => {
    setLoadingCompleteData(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/customers/instance/${instanceId}/complete-data`);
      setCustomerCompleteData(response.data);
    } catch (error) {
      console.error('Error fetching customer complete data:', error);
      toast.error('Failed to load customer complete data');
    } finally {
      setLoadingCompleteData(false);
    }
  };

  // Handle export with permission check
  const handleExport = async () => {
    if (!canExport) {
      toast.error("You don't have permission to export data");
      return;
    }

    if (!currentUser?.user_id) {
      toast.error("User not authenticated");
      return;
    }

    const toastId = toast.loading('Preparing export...');

    try {
      let exportData = [];
      let filename = '';

      if (selectedRows.length > 0) {
        const fetchPromises = selectedRows.map(id =>
          axios.get(`${API_BASE_URL}${currentTable.singleEndpoint(id)}`, {
            headers: { 'user-id': currentUser.user_id }
          })
        );
        const responses = await Promise.all(fetchPromises);
        exportData = responses.map(res => res.data);
        filename = `${currentTable.id}_selected_${selectedRows.length}_records_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else {
        const response = await axios.get(`${API_BASE_URL}${currentTable.exportEndpoint}`, {
          headers: { 'user-id': currentUser.user_id }
        });
        exportData = Array.isArray(response.data) ? response.data : [response.data];
        filename = `${currentTable.id}_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      }

      if (!exportData || exportData.length === 0) {
        toast.dismiss(toastId);
        toast.error('No data to export');
        return;
      }

      const hiddenFields = HIDDEN_FIELDS[currentTable.id] || ['id', 'created_at', 'updated_at'];
      const filteredData = exportData.map((record, index) => {
        const filteredRecord = { 'Sr. No.': index + 1 };
        Object.keys(record).forEach(key => {
          if (!hiddenFields.includes(key)) {
            let value = record[key];
            if (value === null || value === undefined) {
              value = '';
            } else if (typeof value === 'boolean') {
              value = value ? 'Yes' : 'No';
            } else if (value instanceof Date) {
              value = value.toLocaleDateString();
            } else if (typeof value === 'object') {
              value = JSON.stringify(value);
            }
            filteredRecord[key] = value;
          }
        });
        return filteredRecord;
      });

      const worksheet = XLSX.utils.json_to_sheet(filteredData);
      const maxWidth = 50;
      const colWidths = {};
      filteredData.forEach(row => {
        Object.keys(row).forEach(key => {
          const value = row[key] ? String(row[key]).length : 10;
          colWidths[key] = Math.min(maxWidth, Math.max(colWidths[key] || 0, value));
        });
      });

      if (filteredData.length > 0) {
        worksheet['!cols'] = Object.keys(filteredData[0]).map(key => ({
          wch: Math.min(colWidths[key] + 2, maxWidth)
        }));
      }

      const workbook = XLSX.utils.book_new();
      const sheetName = currentTable.name.replace(/[\\/*?:\[\]]/g, '_').substring(0, 31);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.dismiss(toastId);
      toast.success(selectedRows.length > 0
        ? `Exported ${selectedRows.length} selected records as Excel file`
        : 'Export completed successfully as Excel file'
      );
    } catch (error) {
      toast.dismiss(toastId);
      console.error('Export error:', error);
      if (error.response?.status === 403) {
        toast.error("You don't have permission to export data");
      } else {
        toast.error('Failed to export data: ' + (error.response?.data?.detail || error.message));
      }
    }
  };

  // Handle row selection
  const handleRowSelect = (recordId) => {
    setSelectedRows(prev => {
      const newSelection = prev.includes(recordId)
        ? prev.filter(id => id !== recordId)
        : [...prev, recordId];

      setTablesSelectedRowsCache(prevCache => ({
        ...prevCache,
        [currentTable.id]: newSelection
      }));

      return newSelection;
    });
  };

  const handleSelectAll = () => {
    if (selectedRows.length === tableData.length) {
      setSelectedRows([]);
      setTablesSelectedRowsCache(prev => ({
        ...prev,
        [currentTable.id]: []
      }));
    } else {
      const allIds = tableData.map(r => r.id);
      setSelectedRows(allIds);
      setTablesSelectedRowsCache(prev => ({
        ...prev,
        [currentTable.id]: allIds
      }));
      toast.success(`${tableData.length} records selected for export`);
    }
  };

  const handleView = (record, e) => {
    if (e) e.stopPropagation();
    setSelectedRecord(record);

    if (currentTable.id === 'customers' && record.instance_id) {
      fetchCustomerCompleteData(record.instance_id);
    }

    setShowViewModal(true);
  };

  // Helper functions
  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  // Improved highlight text function that properly handles spaces and special characters
  const highlightText = (text, search) => {
    if (!search || !text || text === '-') return text;

    const searchValue = search.toLowerCase().trim();
    const textValue = String(text).toLowerCase();

    // Check if text contains the search term
    if (!textValue.includes(searchValue)) return text;

    // Escape special regex characters in search term
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Create regex that matches whole words or partial matches
    const regex = new RegExp(`(${escapedSearch})`, 'gi');
    const parts = String(text).split(regex);

    return (
      <>
        {parts.map((part, index) => {
          if (part && part.toLowerCase() === searchValue) {
            return (
              <span key={index} className="font-medium text-black px-0.5 rounded" style={{ backgroundColor: '#ffdb62' }}>
                {part}
              </span>
            );
          }
          return part;
        })}
      </>
    );
  };

  // Render related table in modal
  const renderRelatedTable = (title, data, tableId) => {
    if (!data || data.length === 0) return null;

    const tableConfig = TABLES.find(t => t.id === tableId);
    const tableColor = tableConfig?.color || '#6B7280';
    const tableBgColor = tableConfig?.bgColor || '#F9FAFB';
    const Icon = tableConfig?.icon || DocumentTextIcon;

    const columns = Object.keys(data[0]).filter(key =>
      !['id', 'instance_id', 'created_at', 'updated_at'].includes(key)
    );

    return (
      <div className="mb-5 border rounded-lg overflow-hidden shadow-sm" style={{ borderColor: `${tableColor}40` }}>
        <div className="px-3 py-2.5 border-b flex items-center gap-1.5" style={{ backgroundColor: tableBgColor, borderBottomColor: `${tableColor}30` }}>
          <Icon className="h-4 w-4" style={{ color: tableColor }} />
          <h3 className="text-xs font-semibold" style={{ color: tableColor }}>
            {title} <span className="text-[11px] font-normal text-black ml-1.5">({data.length} records)</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium text-black uppercase tracking-wider whitespace-nowrap border-r border-gray-200">Sr.No.</th>
                {columns.map((col, idx) => (
                  <th key={col} className={`px-2.5 py-1.5 text-left font-medium text-black uppercase tracking-wider whitespace-nowrap ${idx !== columns.length - 1 ? 'border-r border-gray-200' : ''}`}>
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {data.map((record, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-black text-center border-r border-gray-200">{idx + 1}</td>
                  {columns.map((col, colIdx) => (
                    <td key={col} className={`px-2.5 py-1.5 whitespace-nowrap text-black ${colIdx !== columns.length - 1 ? 'border-r border-gray-200' : ''}`}>
                      {formatValue(record[col])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Get ordered columns for display
  const getOrderedColumns = () => {
    if (columnOrder.length === tableColumns.length && columnOrder.every(col => tableColumns.includes(col))) {
      return columnOrder;
    }
    return tableColumns;
  };

  const FIXED_COLUMNS = ['select-col', 'sno-col'];

  // Format count display
  const formatCount = (count) => {
    if (count === undefined || count === null) return '';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="min-h-screen py-0">
      <div className="max-w-7xl mx-auto px-2 sm:px-3 lg:px-4">
        {/* Header Section with Title and Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 sm:gap-3 mb-1 sm:mb-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div>
              <h1 className="text-base sm:text-lg lg:text-xl font-bold text-black">Customers - Raw Data</h1>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-2.5">
            <div className="relative w-72">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-black" />
              <input
                type="text"
                placeholder={`Search across all tables...`}
                className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-black rounded-lg"
                style={{ '--tw-ring-color': themeColor }}
                value={globalSearchTerm}
                onChange={handleSearchChange}
              />
              {globalSearchTerm && (
                <button onClick={handleClearSearch} className="absolute right-2.5 top-1/2 transform -translate-y-1/2">
                  <XMarkIcon className="h-3.5 w-3.5 text-black hover:text-gray-600" />
                </button>
              )}
            </div>

            {selectedRows.length > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-100 px-2.5 py-1.5 rounded-lg">
                <span className="text-xs text-blue-700 font-medium">{selectedRows.length} selected</span>
                <button onClick={handleClearSelection} className="p-0.5 hover:bg-blue-100 rounded">
                  <XMarkIcon className="h-3.5 w-3.5 text-blue-700" />
                </button>
              </div>
            )}

            {canExport && (
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-all whitespace-nowrap">
                <CiExport className="h-3.5 w-3.5" style={{ color: themeColor }} />
                <span className="text-xs font-medium text-black">Export {selectedRows.length > 0 ? `Selected (${selectedRows.length})` : 'All'}</span>
              </button>
            )}
          </div>

          {/* Mobile Action Buttons */}
          <div className="flex lg:hidden items-center gap-1.5">
            <button onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)} className="p-1.5 bg-white rounded-lg shadow-sm border border-gray-200">
              <FunnelIcon className="h-4 w-4" style={{ color: themeColor }} />
            </button>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1.5 bg-white rounded-lg shadow-sm border border-gray-200">
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} style={{ color: themeColor }} />
            </button>
          </div>
        </div>

        {/* Mobile Filters Panel */}
        {isMobileFiltersOpen && (
          <div className="lg:hidden mb-3 bg-white rounded-lg shadow-lg border border-gray-200 p-3 animate-slideDown">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-black" />
              <input
                type="text"
                placeholder="Search across all tables..."
                className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 text-black"
                style={{ '--tw-ring-color': themeColor }}
                value={globalSearchTerm}
                onChange={handleSearchChange}
              />
              {globalSearchTerm && (
                <button onClick={handleClearSearch} className="absolute right-2.5 top-1/2 transform -translate-y-1/2">
                  <XMarkIcon className="h-3.5 w-3.5 text-black hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mb-3 space-y-1.5 p-3 bg-white rounded-lg shadow-lg border border-gray-200 animate-slideDown">
            {selectedRows.length > 0 && (
              <div className="flex items-center justify-between bg-blue-50 px-2.5 py-1.5 rounded-lg">
                <span className="text-xs text-blue-700 font-medium">{selectedRows.length} selected</span>
                <button onClick={handleClearSelection} className="p-0.5 hover:bg-blue-100 rounded">
                  <XMarkIcon className="h-3.5 w-3.5 text-blue-700" />
                </button>
              </div>
            )}
            {canExport && (
              <button onClick={handleExport} className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs text-black">
                <CiExport className="h-3.5 w-3.5" style={{ color: themeColor }} />
                <span>Export {selectedRows.length > 0 ? `Selected (${selectedRows.length})` : 'All'}</span>
              </button>
            )}
          </div>
        )}

        {/* Table Selection Row with Counts */}
        <div className="w-full overflow-x-auto scrollbar-thin mb-1.5 pb-0.5" ref={tablesScrollRef}>
          <div className="flex gap-1.5 min-w-max">
            {TABLES.map((table) => {
              const Icon = table.icon;
              const isSelected = currentTable.id === table.id;
              const count = tableCounts[table.id];
              const countDisplay = formatCount(count);

              return (
                <button
                  key={table.id}
                  onClick={() => {
                    setCurrentTable(table);
                    setIsMobileMenuOpen(false);
                    setIsMobileFiltersOpen(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap
                    ${isSelected ? 'bg-white shadow-md border-2' : 'bg-gray-300 hover:bg-gray-400 border-2 border-transparent'}`}
                  style={isSelected ? { borderColor: table.color, color: table.color } : { color: 'black' }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{table.name}</span>
                  {count !== undefined && (
                    <span
                      className={`ml-0.5 text-[10px] px-1 py-0.5 rounded-full ${isSelected
                        ? 'bg-opacity-20'
                        : 'bg-gray-400 bg-opacity-30'
                        }`}
                      style={isSelected ? { backgroundColor: `${table.color}20`, color: table.color } : { color: 'black' }}
                    >
                      {countDisplay}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Data Table */}
        <div className="w-full bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div ref={topScrollBarRef} className="hidden sm:block sticky top-0 z-10 bg-gray-50 border-b border-gray-200 overflow-x-auto scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
            <div className="h-0.5"></div>
          </div>

          <div ref={tableContainerRef} className="h-[calc(100vh-280px)] sm:h-[650px] lg:h-[750px] overflow-auto scrollbar-thin">
            {loading && tableData.length === 0 ? (
              <div className="p-10 text-center">
                <ArrowPathIcon className="h-10 w-10 animate-spin mx-auto" style={{ color: themeColor }} />
                <p className="mt-3 text-xs text-black">Loading data...</p>
              </div>
            ) : tableData.length === 0 ? (
              <div className="p-10 text-center">
                <DocumentTextIcon className="h-14 w-14 mx-auto text-gray-300" />
                <p className="mt-3 text-black font-medium text-xs">No records found</p>
                <p className="text-xs text-black mt-0.5">
                  {globalSearchTerm ? `No results found for "${globalSearchTerm}"` : 'No data available'}
                </p>
                {globalSearchTerm && (
                  <button onClick={handleClearSearch} className="mt-3 px-3 py-1.5 text-xs text-white rounded-lg" style={{ backgroundColor: themeColor }}>
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <DndContext collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
                <SortableContext items={[...FIXED_COLUMNS, ...getOrderedColumns()]} strategy={horizontalListSortingStrategy}>
                  <table className="w-full border-collapse min-w-[800px]">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {canExport && (
                          <FixedTableHeader className="px-2.5 py-1 w-10 bg-gray-50 border-r-2 border-gray-300" width={columnWidths['select-col'] || 50} onResizeStart={(e) => handleResizeStart(e, 'select-col')} isResizing={resizingColumn === 'select-col'}>
                            <input type="checkbox" checked={selectedRows.length === tableData.length && tableData.length > 0} onChange={handleSelectAll} className="rounded border-gray-300 w-3.5 h-3.5 cursor-pointer" style={{ accentColor: themeColor }} />
                          </FixedTableHeader>
                        )}
                        <FixedTableHeader className="px-2.5 py-1 text-left text-[11px] font-medium text-black uppercase tracking-wider min-w-[60px] whitespace-nowrap border-r-2 border-gray-300" width={columnWidths['sno-col'] || 80} onResizeStart={(e) => handleResizeStart(e, 'sno-col')} isResizing={resizingColumn === 'sno-col'}>
                          Sr. No.
                        </FixedTableHeader>
                        {getOrderedColumns().map((column, index) => (
                          <SortableTableHeader key={column} id={column} className={`px-2.5 py-1 text-left text-[11px] font-medium text-black uppercase tracking-wider min-w-[140px] whitespace-nowrap ${index !== getOrderedColumns().length - 1 ? 'border-r-2 border-gray-300' : ''}`} width={columnWidths[column] || 150} onResizeStart={(e) => handleResizeStart(e, column)} isResizing={resizingColumn === column}>
                            {column.replace(/_/g, ' ')}
                          </SortableTableHeader>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tableData.map((record, index) => (
                        <tr key={record.id || record.instance_id || index} className="hover:bg-gray-50 transition-all group cursor-pointer" onClick={(e) => handleView(record, e)}>
                          {canExport && (
                            <td className="px-2.5 py-1 bg-white group-hover:bg-gray-50 border-r-2 border-gray-200" style={{ width: columnWidths['select-col'] || 50 }} onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedRows.includes(record.id)} onChange={() => handleRowSelect(record.id)} className="rounded border-gray-300 w-3.5 h-3.5 cursor-pointer" style={{ accentColor: themeColor }} />
                            </td>
                          )}
                          <td className="px-2.5 py-1 text-xs text-black text-center bg-white group-hover:bg-gray-50 border-r-2 border-gray-200" style={{ width: columnWidths['sno-col'] || 80 }}>
                            {(currentPage - 1) * pageSize + index + 1}
                          </td>
                          {getOrderedColumns().map((column, colIndex) => (
                            <td key={column} className={`px-2.5 py-1 text-xs text-black whitespace-nowrap ${colIndex !== getOrderedColumns().length - 1 ? 'border-r-2 border-gray-200' : ''}`} style={{ width: columnWidths[column] || 150 }}>
                              {highlightText(formatValue(record[column]), globalSearchTerm)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Pagination Component */}
          {totalCount > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              totalCount={totalCount}
              pageSize={pageSize}
            />
          )}
        </div>
      </div>

      {/* View Modal */}
      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex justify-between items-center shrink-0">
              <h3 className="text-sm font-semibold text-black flex items-center gap-1.5">
                <EyeIcon className="h-4 w-4" style={{ color: themeColor }} />
                {currentTable.id === 'customers' ? `Customer Details - ${selectedRecord.customer_name || selectedRecord.instance_id}` : `Record Details - ID: ${selectedRecord.id}`}
              </h3>
              <button onClick={() => { setShowViewModal(false); setCustomerCompleteData(null); }} className="p-1 text-black hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {currentTable.id === 'customers' ? (
                loadingCompleteData ? (
                  <div className="text-center py-6">
                    <ArrowPathIcon className="h-6 w-6 animate-spin mx-auto" style={{ color: themeColor }} />
                    <p className="mt-1.5 text-xs text-black">Loading customer data...</p>
                  </div>
                ) : customerCompleteData ? (
                  <div>
                    <div className="mb-5 border rounded-lg overflow-hidden shadow-sm" style={{ borderColor: `${currentTable.color}40` }}>
                      <div className="px-3 py-2.5 border-b flex items-center gap-1.5" style={{ backgroundColor: currentTable.bgColor, borderBottomColor: `${currentTable.color}30` }}>
                        <UserIcon className="h-4 w-4" style={{ color: currentTable.color }} />
                        <h3 className="text-xs font-semibold" style={{ color: currentTable.color }}>Customer Information</h3>
                      </div>
                      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {Object.entries(customerCompleteData.customer || {}).map(([key, value]) => (
                          key !== 'id' && key !== 'created_at' && key !== 'updated_at' && (
                            <div key={key} className="border-b border-gray-100 pb-1.5">
                              <span className="text-[11px] text-black capitalize block">{key.replace(/_/g, ' ')}:</span>
                              <p className="text-xs font-medium mt-0.5 break-words text-black">{formatValue(value)}</p>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                    {customerCompleteData.amc_agreements?.length > 0 && renderRelatedTable('AMC Agreements', customerCompleteData.amc_agreements, 'amc_agreements')}
                    {customerCompleteData.asset_detailed?.length > 0 && renderRelatedTable('Asset Detailed', customerCompleteData.asset_detailed, 'asset_detailed')}
                    {customerCompleteData.asset_services?.length > 0 && renderRelatedTable('Asset Services', customerCompleteData.asset_services, 'asset_services')}
                    {customerCompleteData.anubandhan_plus_quotes?.length > 0 && renderRelatedTable('Anubandhan Plus Quotes', customerCompleteData.anubandhan_plus_quotes, 'anubandhan_plus')}
                    {customerCompleteData.anubandhan_quotes?.length > 0 && renderRelatedTable('Anubandhan Quotes', customerCompleteData.anubandhan_quotes, 'anubandhan')}
                    {customerCompleteData.bandhan_plus_quotes?.length > 0 && renderRelatedTable('Bandhan Plus Quotes', customerCompleteData.bandhan_plus_quotes, 'bandhan_plus')}
                    {customerCompleteData.pulse_quotations?.length > 0 && renderRelatedTable('Pulse Quotations', customerCompleteData.pulse_quotations, 'pulse')}
                    {customerCompleteData.regular_bandhan?.length > 0 && renderRelatedTable('Regular Bandhan', customerCompleteData.regular_bandhan, 'regular_bandhan')}
                    {customerCompleteData.lms_data?.length > 0 && renderRelatedTable('LMS Data', customerCompleteData.lms_data, 'lms_data')}
                    {customerCompleteData.open_sr_load_reports?.length > 0 && renderRelatedTable('Open SR Load Reports', customerCompleteData.open_sr_load_reports, 'open_sr_load_reports')}
                  </div>
                ) : (
                  <p className="text-center text-black py-3 text-xs">No customer data available</p>
                )
              ) : (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(selectedRecord).map(([key, value]) => (
                      key !== 'id' && key !== 'created_at' && key !== 'updated_at' && (
                        <div key={key} className="border-b border-gray-100 pb-1.5">
                          <span className="text-[11px] text-black capitalize block">{key.replace(/_/g, ' ')}:</span>
                          <p className="text-xs font-medium mt-0.5 break-words text-black">{formatValue(value)}</p>
                        </div>
                      )
                    ))}
                  </div>
                  {selectedRecord.created_at && (
                    <div className="mt-3 pt-3 border-t border-gray-200 text-[11px] text-black">
                      <p>Created: {new Date(selectedRecord.created_at).toLocaleString()}</p>
                      {selectedRecord.updated_at && <p className="mt-0.5">Last Updated: {new Date(selectedRecord.updated_at).toLocaleString()}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button onClick={() => { setShowViewModal(false); setCustomerCompleteData(null); }} className="px-3 py-1.5 text-xs font-medium text-black bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default Customer;