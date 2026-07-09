import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import toast from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { useNavigate, useLocation } from 'react-router-dom';
import { canExportExcel } from '../utils/exportPermission';
import {
  MegaphoneIcon,
  PlusIcon,
  XMarkIcon,
  FunnelIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  PencilIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  ArrowPathIcon,
  DocumentArrowUpIcon,
  DocumentDuplicateIcon,
  DocumentIcon,
  CloudArrowUpIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  PaperClipIcon,
  EyeIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Squares2X2Icon,
  TableCellsIcon
} from '@heroicons/react/24/outline';
// Code-split the heavy customer-followups modal into its own chunk (loads in the
// background; it's mounted-but-closed so there is no visual change).
const CampaignCustomersFollowupModal = lazy(() => import('../components/CampaignCustomersFollowupModal'));

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

// ---- Modern date picker helpers ----
// State keeps dates as 'YYYY-MM-DD' strings; react-datepicker uses Date objects.
// Parse as local midnight to avoid timezone off-by-one shifts.
const toYMD = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const fromYMD = (s) => (s ? new Date(`${s}T00:00:00`) : null);
const DATE_INPUT_CLASS =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-black cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#2f3192]/40 focus:border-[#2f3192] disabled:opacity-50 disabled:cursor-not-allowed';

// ⚡ Module-level cache: lives for the whole browser tab session (NOT reset on
// component unmount). Reopening the Campaign page reads from here instantly
// instead of refetching. Keyed by the active service+status filter so each
// filter combination caches independently.
const campaignCache = {
  data: {},        // { "<service>|<status>": sortedCampaigns[] }
  counts: {},      // { campaignId: { pending, completed } }  (shared across filters)
  services: null,  // services[] (filter-independent)
  stats: null,     // dashboard stats (filter-independent)
};
const cacheKey = (service, status) => `${service}|${status}`;

// Drive color palette — full grid: 12 hues × 6 shades (light → dark),
// then a neutrals + brand row. A free "custom" picker below the grid
// lets the user choose ANY color beyond these.
const COLOR_GRID_ROWS = [
  ['#fca5a5', '#fdba74', '#fcd34d', '#fde047', '#86efac', '#5eead4', '#67e8f9', '#7dd3fc', '#93c5fd', '#a5b4fc', '#d8b4fe', '#f9a8d4'],
  ['#f87171', '#fb923c', '#fbbf24', '#facc15', '#4ade80', '#2dd4bf', '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#c084fc', '#f472b6'],
  ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'],
  ['#dc2626', '#ea580c', '#d97706', '#ca8a04', '#16a34a', '#0d9488', '#0891b2', '#0284c7', '#2563eb', '#4f46e5', '#9333ea', '#db2777'],
  ['#b91c1c', '#c2410c', '#b45309', '#a16207', '#15803d', '#0f766e', '#0e7490', '#0369a1', '#1d4ed8', '#4338ca', '#7e22ce', '#be185d'],
  ['#991b1b', '#9a3412', '#92400e', '#854d0e', '#166534', '#115e59', '#155e75', '#075985', '#1e40af', '#3730a3', '#6b21a8', '#9d174d'],
  ['#000000', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f5f5f5', '#ffffff', '#2f3192', '#ffdb62'],
];
const colorGridColors = COLOR_GRID_ROWS.flat();

// Full-grid color picker used by both the Create and Edit drive modals.
// Collapsed by default (compact trigger showing the current color); click
// to expand the grid. Picking a swatch closes it again. Stores the same
// hex string as before — only the picking UI is richer.
const DriveColorPicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        title={open ? 'Hide colors' : 'Choose color'}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span
            className="w-5 h-5 rounded-md border border-black/10 flex-shrink-0"
            style={{ backgroundColor: value || '#2f3192' }}
          />
          <span className="text-xs font-mono text-gray-600 uppercase truncate">
            {value || 'Select color'}
          </span>
        </span>
        {open ? (
          <ChevronUpIcon className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronDownIcon className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="mt-2 p-2 border border-gray-200 rounded-lg bg-white shadow-sm w-fit max-w-full">
          <div className="grid grid-cols-12 gap-1.5">
            {colorGridColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-5 h-5 rounded-md border border-black/10 transition-transform hover:scale-110 ${value === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : ''}`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] text-gray-500">Custom:</span>
            <input
              type="color"
              value={value || '#2f3192'}
              onChange={(e) => onChange(e.target.value)}
              className="w-8 h-6 p-0 border border-gray-300 rounded cursor-pointer"
              title="Pick any custom color"
            />
            <span className="text-[11px] font-mono text-gray-500 uppercase">{value || '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Transfer status options — mapped to FollowUp.status values.
// 'completed' is intentionally NOT transferable.
const TRANSFER_STATUS_OPTIONS = [
  { value: 'wip', label: 'Work in Progress', short: 'WIP', badge: 'bg-blue-100 text-blue-700' },
  { value: 'rescheduled', label: 'Followup Reschedule', short: 'FR', badge: 'bg-amber-100 text-amber-700' },
  { value: 'rejected', label: 'Rejected', short: 'R', badge: 'bg-red-100 text-red-700' },
  { value: 'not_connected', label: 'Not Connected', short: 'NC', badge: 'bg-gray-200 text-gray-700' },
  { value: 'pending', label: 'Pending (no status)', short: 'P', badge: 'bg-purple-100 text-purple-700' },
];
const ALL_TRANSFER_STATUS_VALUES = TRANSFER_STATUS_OPTIONS.map(o => o.value);

// Financial-year string like "26-27" (Indian FY starts in April).
// You can hardcode return '26-27' instead if you want it fixed.
const getFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 = Jan
  const startYear = month >= 3 ? year : year - 1; // April or later -> current year
  const yy = (n) => String(n).slice(-2);
  return `${yy(startYear)}-${yy(startYear + 1)}`;
};

// CSP detection: any product whose name contains "csp" (case-insensitive)
// counts as CSP — e.g. "CSP", "CSP Battery", "Oil CSP".
const isCspService = (service) =>
  !!service && String(service).toLowerCase().includes('csp');

// Required columns and field mapping for the SP Info (CSP) file
const SP_INFO_REQUIRED_COLUMNS = [
  'ZONE NAME', 'SD ID', 'SD NAME', 'BRANCH ID', 'BRANCH NAME', 'GOEM OEM',
  'SR NUMBER', 'SR OPEN DATE', 'SR CLOSE DATE', 'SR TYPE', 'SR SUBTYPE', 'SR STATUS',
  'SEGMENT', 'PRODUCT SEGMENT', 'INSTANCE ID', 'APPLICATION CODE', 'ENGINE SERIAL NUMBER',
  'ACCOUNT NAME', 'CUSTOMER NAME', 'CUSTOMER PHONE NUMBER', 'SR INSTALLATION SITE ADDRESS', 'OIL CHANGE FLAG'
];

const SP_INFO_COLUMN_MAP = {
  'ZONE NAME': 'zone_name',
  'SD ID': 'sd_id',
  'SD NAME': 'sd_name',
  'BRANCH ID': 'branch_id',
  'BRANCH NAME': 'branch_name',
  'GOEM OEM': 'goem_oem',
  'SR NUMBER': 'sr_number',
  'SR OPEN DATE': 'sr_open_date',
  'SR CLOSE DATE': 'sr_close_date',
  'SR TYPE': 'sr_type',
  'SR SUBTYPE': 'sr_subtype',
  'SR STATUS': 'sr_status',
  'SEGMENT': 'segment',
  'PRODUCT SEGMENT': 'product_segment',
  'INSTANCE ID': 'instance_id',
  'APPLICATION CODE': 'application_code',
  'ENGINE SERIAL NUMBER': 'engine_serial_number',
  'ACCOUNT NAME': 'account_name',
  'CUSTOMER NAME': 'customer_name',
  'CUSTOMER PHONE NUMBER': 'customer_phone_number',
  'SR INSTALLATION SITE ADDRESS': 'sr_installation_site_address',
  'OIL CHANGE FLAG': 'oil_change_flag'
};

// CSP-only Service Cycle (KOEL preventive-maintenance) defaults for Letter Master.
// Mirrors the Send Letter wizard so a CSP format can ship its own default rows.
const DEFAULT_SERVICE_CYCLE_INTRO =
  'KOEL Preventive Maintenance Guidelines\nAs per KOEL guidelines, the preventive maintenance schedule is as follows:';
const SERVICE_CYCLE_COLS = [
  { key: 'service_type', label: 'Service Type' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'remarks', label: 'Remarks' },
];

const blankServiceCycleRow = () => ({ service_type: '', schedule: '', remarks: '' });

// Auto-growing textarea — height follows its content (no manual drag handle).
// Grows when text wraps to more lines, shrinks back down when text is removed.
// React.memo: pure w.r.t. props, so unrelated parent re-renders are skipped.
const AutoGrowTextarea = React.memo(({ value, minRows = 1, className = '', style, ...props }) => {
  const ref = useRef(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';                 // reset first so scrollHeight is accurate
    el.style.height = `${el.scrollHeight}px`; // grow/shrink to fit content
  };

  useEffect(() => { resize(); }, [value]);    // re-fit whenever value changes (typing + edit mode)

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onInput={resize}
      className={className}
      style={{ resize: 'none', overflow: 'hidden', ...style }}
      {...props}
    />
  );
});
const Campaign = () => {
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showEditCampaign, setShowEditCampaign] = useState(false);
  const [showDeleteServiceConfirm, setShowDeleteServiceConfirm] = useState(false);
  const [selectedService, setSelectedService] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [importedFile, setImportedFile] = useState(null);
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [selectedCampaignForModal, setSelectedCampaignForModal] = useState(null);

  // ⚡ Asset-transfer picker: when the chosen product already has active drives,
  // the user picks which of them to pull assets from (and inactivate).
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferCandidates, setTransferCandidates] = useState([]); // active drives, same product
  const [selectedTransferIds, setSelectedTransferIds] = useState([]); // checkbox selections
  const [checkingTransfer, setCheckingTransfer] = useState(false);

  // Validation states
  const [validAssets, setValidAssets] = useState([]);
  const [invalidAssets, setInvalidAssets] = useState([]);
  const [isValidating, setIsValidating] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [campaignCounts, setCampaignCounts] = useState({});
  const [loadingMore, setLoadingMore] = useState(false);
  // ⚡ Progressive render: how many campaign cards are currently painted.
  // Starts small so the first cards show instantly, then grows in chunks.
  const [visibleCount, setVisibleCount] = useState(8);
  const navigate = useNavigate();
  const [showDeleteCampaignConfirm, setShowDeleteCampaignConfirm] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showEditServiceForm, setShowEditServiceForm] = useState(false);
  const [editServiceData, setEditServiceData] = useState({
    id: null,
    name: '',
    description: ''
  });
  const [editServiceLoading, setEditServiceLoading] = useState(false);

  // Which last-follow-up statuses to carry over during transfer.
  // All transferable statuses are selected by default.
  const [selectedTransferStatuses, setSelectedTransferStatuses] = useState(ALL_TRANSFER_STATUS_VALUES);

  // ==================== Letter Master states ====================
  const LETTER_ATTACHMENT_EXTS = ['mp4', 'jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv'];

  const [showLetterMaster, setShowLetterMaster] = useState(false);
  const [showLetterFormatForm, setShowLetterFormatForm] = useState(false);
  const [showLetterFormatView, setShowLetterFormatView] = useState(false);
  const [letterFormats, setLetterFormats] = useState([]);
  const [letterFormatsLoading, setLetterFormatsLoading] = useState(false);
  const [letterFormatSaving, setLetterFormatSaving] = useState(false);
  const [viewingLetterFormat, setViewingLetterFormat] = useState(null);
  // True while the full format (incl. heavy attachment content) is being fetched
  // on demand for view/edit. The list endpoint returns attachment metadata only,
  // so we hydrate the actual base64 content lazily when a format is opened.
  const [letterFormatHydrating, setLetterFormatHydrating] = useState(false);
  // Serial No lock: true once a letter has already been sent with the format being edited
  const [serialLocked, setSerialLocked] = useState(false);
  const [serialLockLoading, setSerialLockLoading] = useState(false);

  // Deep-link support: the ERP Sitemap opens a specific box via router state —
  // navigate('/campaigns', { state: { openModal: 'letter-master' } }). The
  // state is consumed immediately so a refresh doesn't re-apply it.
  const routerLocation = useLocation();
  const routerNavigate = useNavigate();
  useEffect(() => {
    const modal = routerLocation.state?.openModal;
    if (modal) {
      if (modal === 'create-drive') setShowCampaignForm(true);
      if (modal === 'add-service') setShowServiceForm(true);
      if (modal === 'letter-master') setShowLetterMaster(true);
      if (modal === 'branch-email') setShowBranchEmailMaster(true);
      routerNavigate(routerLocation.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.state]);

  // Branch Email Master
  const [showBranchEmailMaster, setShowBranchEmailMaster] = useState(false);
  const [branchEmails, setBranchEmails] = useState([]);          // [{ code, name, emails: [] }]
  const [branchEmailsLoading, setBranchEmailsLoading] = useState(false);
  const [branchEmailsSaving, setBranchEmailsSaving] = useState(false);
  const [branchEmailErrors, setBranchEmailErrors] = useState({});
  const [branchEmailInputs, setBranchEmailInputs] = useState({}); // { [code]: 'typing...' }

  const BRANCH_LIST = [
    { code: '420435_1', name: 'Ch.Sambhaji Nagar' },
    { code: '420435_2', name: 'Ahilyanagar' },
    { code: '420435_3', name: 'Beed' },
    { code: '420435_4', name: 'Nanded' },
    { code: '420435_5', name: 'Babhaleshwar' },
    { code: '420435_6', name: 'Latur' },
    { code: '420435_7', name: 'Parbhani' },
    { code: '420435_8', name: 'Hubli' },
    { code: '420435_9', name: 'Belagavi' },
    { code: '420435_10', name: 'Hospet' },
    { code: '420435_11', name: 'Ballari' },
    { code: '420435_12', name: 'Bagalkot' },
    { code: '420435_13', name: 'Gulbarga' },
    { code: '420435_14', name: 'Bijapur' },
  ];
  const [letterFormatData, setLetterFormatData] = useState({
    id: null,
    format_type_name: '',
    products: [],
    reference_no: '',
    expiry_date: '',
    default_attachments: [],
    start_para: '',
    end_para: '',
    // CSP-only Service Cycle defaults
    include_service_cycle: false,
    service_cycle_intro: DEFAULT_SERVICE_CYCLE_INTRO,
    service_cycle_rows: []
  });

  const [goemOemList, setGoemOemList] = useState([]);
  const [showRecipientForm, setShowRecipientForm] = useState(false);

  // Blank rule template
  const blankRule = () => ({
    _key: Date.now() + Math.random(),
    branch_codes: [],
    goem_oems: [],
    to_emails: [],
    cc_emails: [],
    _toInput: '',
    _ccInput: '',
    _toError: '',
    _ccError: '',
    _goemSelect: '',
  });

  const [recipientRules, setRecipientRules] = useState([]);

  const themeColor = '#2f3192';
  const themeShades = {
    light: 'rgba(64, 96, 147, 0.1)',
    medium: 'rgba(64, 96, 147, 0.5)',
    dark: '#335478',
  };

  // State for data from API — seeded from the module cache so a revisit paints
  // immediately with whatever was loaded last time (then refreshes in background).
  const [campaigns, setCampaigns] = useState(
    () => campaignCache.data[cacheKey('all', 'active')] || []
  );
  const [services, setServices] = useState(() => campaignCache.services || []);
  const [stats, setStats] = useState(
    () => campaignCache.stats || {
      total_campaigns: 0,
      active_campaigns: 0,
      total_customers: 0,
      total_completed: 0
    }
  );

  // Refs to prevent duplicate requests
  const fetchingRef = useRef(false);
  const initialLoadRef = useRef(false);
  const filterTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Drives list view: 'grid' cards or 'table' rows (choice remembered)
  const [campaignView, setCampaignView] = useState(() => {
    try { return localStorage.getItem('campaignView') === 'table' ? 'table' : 'grid'; } catch { return 'grid'; }
  });
  const switchCampaignView = (v) => {
    setCampaignView(v);
    try { localStorage.setItem('campaignView', v); } catch { /* storage unavailable */ }
  };

  const [newCampaign, setNewCampaign] = useState({
    name: '',
    service: '',
    description: '',
    color: '#406093',
    start_date: '',
    end_date: '',
    status: 'active',
    asset_numbers: [],
    scripts: []
  });

  const [editCampaignData, setEditCampaignData] = useState({
    id: null,
    name: '',
    service: '',
    description: '',
    color: '',
    start_date: '',
    end_date: '',
    status: '',
    asset_numbers: [],
    scripts: []
  });

  const [newService, setNewService] = useState({
    name: '',
    description: ''
  });

  const openFollowupModal = (campaign, e) => {
    e.stopPropagation();
    setSelectedCampaignForModal(campaign);
    setShowFollowupModal(true);
  };

  const toggleTransferStatus = (value) => {
    setSelectedTransferStatuses(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  };

  // Total assets that will actually move, given selected drives + statuses.
  const transferableCount = useMemo(() => {
    let total = 0;
    for (const c of transferCandidates) {
      if (!selectedTransferIds.includes(c.id)) continue;
      const bd = c.status_breakdown || {};
      for (const st of selectedTransferStatuses) total += bd[st] || 0;
    }
    return total;
  }, [transferCandidates, selectedTransferIds, selectedTransferStatuses]);

  // On mount: if we already have cached data for the current filter, show it
  // instantly and skip the blocking fetch. Otherwise fetch normally.
  useEffect(() => {
    const key = cacheKey(selectedService, selectedStatus);

    if (campaignCache.services) {
      setServices(campaignCache.services);
    } else {
      fetchServices();
    }

    if (campaignCache.data[key]) {
      setCampaigns(campaignCache.data[key]);
      setCampaignCounts(campaignCache.counts);
      initialLoadRef.current = true;
      // refresh quietly in the background so cache doesn't go stale
      fetchCampaignsLazy({ background: true });
    } else {
      fetchCampaignsLazy();
    }

    if (campaignCache.stats) {
      setStats(campaignCache.stats);
    } else {
      fetchStats();
    }
  }, []);

  // Debounced filter change
  useEffect(() => {
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }

    filterTimeoutRef.current = setTimeout(() => {
      if (initialLoadRef.current) {
        fetchCampaignsLazy();
      }
    }, 300);

    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, [selectedService, selectedStatus]);

  const fetchServices = async () => {
    if (serviceLoading) return;

    setServiceLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services`);
      if (!response.ok) throw new Error('Failed to fetch services');
      const data = await response.json();
      campaignCache.services = data;
      setServices(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load products');
    } finally {
      setServiceLoading(false);
    }
  };

  const parseAssetWithBranch = (value) => {
    if (!value) return null;

    const strValue = String(value).trim();

    const match = strValue.match(/^(\d+)\(([^)]+)\)$/);

    if (match) {
      return {
        asset_number: match[1],
        branch_id: match[2]
      };
    }

    return {
      asset_number: strValue,
      branch_id: null
    };
  };

  const [pendingBranchUpdates, setPendingBranchUpdates] = useState([]);

  // SP Info (CSP) file states
  const [spInfoFile, setSpInfoFile] = useState(null);
  const [spInfoData, setSpInfoData] = useState([]);
  const [spInfoLoading, setSpInfoLoading] = useState(false);

  const handleEditService = async (e) => {
    e.preventDefault();

    if (!editServiceData.name) {
      toast.error('Product name is required');
      return;
    }

    setEditServiceLoading(true);
    const editToast = toast.loading('Updating product...');

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services/${editServiceData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editServiceData.name,
          description: editServiceData.description || ''
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update product');
      }

      const data = await response.json();

      setServices(services.map(s => s.id === data.id ? data : s));
      setShowEditServiceForm(false);
      setEditServiceData({ id: null, name: '', description: '' });
      toast.dismiss(editToast);
      toast.success('Product updated successfully!');
      fetchServices();
    } catch (err) {
      toast.dismiss(editToast);
      toast.error(err.message || 'Failed to update product');
    } finally {
      setEditServiceLoading(false);
    }
  };

  const handleCampaignClick = (campaign) => {
    navigate('/customer-engagement', {
      state: {
        campaign: campaign,
        campaignId: campaign.id
      }
    });
  };

  const openEditServiceModal = (service, e) => {
    e.stopPropagation();
    setEditServiceData({
      id: service.id,
      name: service.name,
      description: service.description || ''
    });
    setShowEditServiceForm(true);
  };

  // Add this helper function near your other utility functions (around line 200-250)
  const isPastDate = (dateString) => {
    if (!dateString) return false;
    const selectedDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate < today;
  };

  // Optimized lazy loading implementation with duplicate prevention.
  // Pass { background: true } to refresh without clearing the screen or
  // showing the skeleton (used when we already painted from cache).
  const fetchCampaignsLazy = async ({ background = false } = {}) => {
    // Prevent duplicate requests
    if (fetchingRef.current) {
      return;
    }

    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    fetchingRef.current = true;
    if (!background) setLoading(true);

    // Only clear the screen on a foreground load; a background refresh keeps
    // the cached cards visible until fresh data replaces them.
    if (!background) {
      setCampaigns([]);
      setCampaignCounts({});
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      let url = `${API_BASE_URL}/v1/campaigns/?`;
      const params = [];
      if (selectedService && selectedService !== 'all') {
        params.push(`service=${encodeURIComponent(selectedService)}`);
      }
      if (selectedStatus && selectedStatus !== 'all') {
        params.push(`status=${selectedStatus}`);
      }
      url += params.join('&');

      const response = await fetch(url, {
        headers: {
          ...getUserHeaders()
        },
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to fetch drives');
      const data = await response.json();

      const campaignsWithAssets = data.map(campaign => ({
        ...campaign,
        asset_numbers: campaign.asset_numbers || []
      }));

      const sortedCampaigns = campaignsWithAssets.sort((a, b) => {
        const dateA = new Date(a.created_at || a.updated_at || 0);
        const dateB = new Date(b.created_at || b.updated_at || 0);
        return dateB - dateA;
      });

      // Set all campaigns at once for better performance + write to cache
      setCampaigns(sortedCampaigns);
      campaignCache.data[cacheKey(selectedService, selectedStatus)] = sortedCampaigns;
      initialLoadRef.current = true;

    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error(err.message || 'Failed to load drives');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const fetchCampaignCounts = useCallback(async (campaignId) => {
    // Don't fetch if already have counts
    if (campaignCounts[campaignId]) return;

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${campaignId}/counts`);
      if (response.ok) {
        const data = await response.json();
        campaignCache.counts[campaignId] = data; // persist across navigation
        setCampaignCounts(prev => ({
          ...prev,
          [campaignId]: data
        }));
      }
    } catch (err) {
      console.error('Failed to fetch drive counts:', err);
    }
  }, [campaignCounts]);

  // Load counts only for the campaigns currently revealed on screen.
  // Computes the visible slice inline (from campaigns + visibleCount) so it
  // does NOT depend on `visibleCampaigns`, which is declared lower in the file.
  useEffect(() => {
    const revealed = campaigns.slice(0, visibleCount);
    if (revealed.length > 0) {
      const loadCountsInBatches = async () => {
        for (let i = 0; i < revealed.length; i += 5) {
          const batch = revealed.slice(i, i + 5);
          await Promise.all(batch.map(campaign => fetchCampaignCounts(campaign.id)));
          if (i + 5 < revealed.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      };

      loadCountsInBatches();
    }
  }, [campaigns, visibleCount, fetchCampaignCounts]);

  const getUserHeaders = () => {
    const userData = sessionStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        return {
          'X-User-Id': user.user_id || user.id || '',
          'X-User-Name': user.name || ''
        };
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }
    return {};
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/stats/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      const nextStats = {
        total_campaigns: data.total_campaigns,
        active_campaigns: data.active_campaigns,
        total_customers: data.total_customers,
        total_completed: data.total_completed || 0
      };
      campaignCache.stats = nextStats;
      setStats(nextStats);
    } catch (err) {
      toast.error(err.message || 'Failed to load statistics');
    }
  };

  const validateAssets = async (assetList) => {
    if (!assetList || assetList.length === 0) {
      setValidAssets([]);
      setInvalidAssets([]);
      return { valid: [], invalid: [] };
    }

    setIsValidating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/validate-assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(assetList)
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.status}`);
      }

      const data = await response.json();

      let valid = [];
      let invalid = [];

      if (Array.isArray(data)) {
        valid = data;
        invalid = assetList.filter(asset => !valid.includes(asset));
      } else if (data.valid_assets && data.invalid_assets) {
        valid = data.valid_assets;
        invalid = data.invalid_assets;
      } else if (data.valid && data.invalid) {
        valid = data.valid;
        invalid = data.invalid;
      } else {
        valid = assetList;
        invalid = [];
      }

      setValidAssets(valid);
      setInvalidAssets(invalid);

      return { valid, invalid };
    } catch (err) {
      console.error('Validation error:', err);
      toast.error('Failed to validate assets: ' + err.message);
      setValidAssets([]);
      setInvalidAssets(assetList);
      return { valid: [], invalid: assetList };
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileImport = async (e, isEdit = false) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
      toast.error('Please upload only Excel files (.xlsx, .xls, .csv)');
      e.target.value = '';
      return;
    }

    setImportLoading(true);
    const importToast = toast.loading('Reading file...');

    try {
      const data = await readExcelFile(file);

      if (data.length === 0) {
        toast.error('File is empty');
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      const firstRow = data[0];
      const hasBranchCodeColumn = Object.keys(firstRow).some(key =>
        key.toLowerCase() === 'branch code' ||
        key.toLowerCase() === 'branch_code' ||
        key.toLowerCase() === 'branchcode' ||
        key.toLowerCase() === 'branch'
      );

      if (!hasBranchCodeColumn) {
        toast.error('❌ File must contain a "Branch Code" column. Please add Branch Code column to your Excel file.', {
          duration: 6000,
        });
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      const extractedAssets = [];
      const extractedBranchUpdates = [];

      for (const item of data) {
        let assetNumberValue = null;
        if (item['ASSET NUMBER']) assetNumberValue = item['ASSET NUMBER'];
        else if (item['asset_number']) assetNumberValue = item['asset_number'];
        else if (item['Asset Number']) assetNumberValue = item['Asset Number'];
        else if (item['Asset']) assetNumberValue = item['Asset'];
        else if (item['asset']) assetNumberValue = item['asset'];
        else if (item['ASSET']) assetNumberValue = item['ASSET'];

        let branchCodeValue = null;
        if (item['Branch Code']) branchCodeValue = item['Branch Code'];
        else if (item['branch_code']) branchCodeValue = item['branch_code'];
        else if (item['BRANCH CODE']) branchCodeValue = item['BRANCH CODE'];
        else if (item['BRANCH Code']) branchCodeValue = item['BRANCH Code'];
        else if (item['Branch CODE']) branchCodeValue = item['Branch CODE'];
        else if (item['BranchCode']) branchCodeValue = item['BranchCode'];
        else if (item['branch']) branchCodeValue = item['branch'];
        else if (item['BRANCH']) branchCodeValue = item['BRANCH'];

        if (assetNumberValue) {
          const parsedAsset = parseAssetWithBranch(assetNumberValue);

          if (parsedAsset) {
            extractedAssets.push(parsedAsset.asset_number);

            const branchId = parsedAsset.branch_id || (branchCodeValue ? String(branchCodeValue).trim() : null);

            if (branchId) {
              extractedBranchUpdates.push({
                asset_number: parsedAsset.asset_number,
                branch_id: branchId
              });
            } else {
              console.warn(`No branch code found for asset: ${parsedAsset.asset_number}`);
            }
          }
        }
      }

      if (extractedAssets.length === 0) {
        toast.error('No valid asset numbers found in the file');
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      if (extractedBranchUpdates.length === 0) {
        toast.error('❌ No branch codes found in the file. Please ensure each row has a Branch Code value.', {
          duration: 5000,
        });
        e.target.value = '';
        setImportLoading(false);
        toast.dismiss(importToast);
        return;
      }

      const uniqueImportedAssets = [...new Set(extractedAssets)];

      const uniqueBranchUpdates = [];
      const assetMap = new Map();
      for (const update of extractedBranchUpdates) {
        assetMap.set(update.asset_number, update.branch_id);
      }
      for (const [asset_number, branch_id] of assetMap) {
        uniqueBranchUpdates.push({ asset_number, branch_id });
      }

      setImportedFile(file);
      setPendingBranchUpdates(uniqueBranchUpdates);

      let allAssets;
      if (isEdit) {
        const currentAssets = editCampaignData.asset_numbers || [];
        allAssets = [...new Set([...currentAssets, ...uniqueImportedAssets])];
        setEditCampaignData(prev => ({
          ...prev,
          asset_numbers: allAssets
        }));
      } else {
        const currentAssets = newCampaign.asset_numbers || [];
        allAssets = [...new Set([...currentAssets, ...uniqueImportedAssets])];
        setNewCampaign(prev => ({
          ...prev,
          asset_numbers: allAssets
        }));
      }

      // Start validation immediately without awaiting — show success toast first
      toast.dismiss(importToast);
      toast.success(`✅ Imported ${uniqueImportedAssets.length} unique asset numbers`);
      toast.success(`✅ Found ${uniqueBranchUpdates.length} branch codes to update`, {
        duration: 4000,
      });

      // Validate in background so UI is not blocked
      validateAssets(allAssets);
    } catch (err) {
      toast.dismiss(importToast);
      toast.error('Failed to read file: ' + err.message);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const updateBranchCodes = async (branchUpdates) => {
    if (!branchUpdates || branchUpdates.length === 0) {
      return { success: [], failed: [], not_found: [] };
    }

    const userData = sessionStorage.getItem('user');
    let userId = null;
    let userName = null;

    if (userData) {
      try {
        const user = JSON.parse(userData);
        userId = user.user_id || user.id;
        userName = user.name;
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    }

    const updateToast = toast.loading(`Updating ${branchUpdates.length} branch codes in customer records...`);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/update-branch-codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId || '',
          'X-User-Name': userName || ''
        },
        body: JSON.stringify(branchUpdates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update branch codes');
      }

      const results = await response.json();

      toast.dismiss(updateToast);

      if (results.success.length > 0) {
        toast.success(`✅ Updated ${results.success.length} customer branch codes`, { duration: 4000 });
      }

      if (results.not_found.length > 0) {
        toast.error(`⚠️ ${results.not_found.length} asset numbers not found in customer table`, { duration: 5000 });
      }

      if (results.failed.length > 0) {
        toast.error(`❌ Failed to update ${results.failed.length} branch codes`, { duration: 4000 });
      }

      return results;
    } catch (err) {
      toast.dismiss(updateToast);
      toast.error('Failed to update branch codes: ' + err.message);
      return { success: [], failed: [], not_found: [] };
    }
  };

  const readExcelFile = (file, options = {}) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, options);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleSpInfoImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
      toast.error('Please upload only Excel files (.xlsx, .xls, .csv)');
      e.target.value = '';
      return;
    }

    setSpInfoLoading(true);
    const spToast = toast.loading('Reading CSP Info file...');

    try {
      // Read raw rows and data in a single parallel pass
      const [data, headerRow] = await Promise.all([
        readExcelFile(file),
        readExcelFile(file, { header: 1 })
      ]);

      if (data.length === 0) {
        toast.dismiss(spToast);
        toast.error('SP Info file is empty');
        e.target.value = '';
        setSpInfoLoading(false);
        return;
      }

      const normalize = (k) => String(k).trim().toUpperCase().replace(/\s+/g, ' ');

      const headerCells = (headerRow && headerRow[0]) ? headerRow[0] : [];
      const presentColumns = headerCells
        .filter(h => h !== undefined && h !== null && String(h).trim() !== '')
        .map(normalize);

      // Verify the file format (all required columns must be present)
      const missingColumns = SP_INFO_REQUIRED_COLUMNS.filter(col => !presentColumns.includes(col));

      if (missingColumns.length > 0) {
        toast.dismiss(spToast);
        toast.error(`❌ File format is mismatched. Missing required column(s): ${missingColumns.join(', ')}. Please upload a file with the exact CSP Info format.`, {
          duration: 8000,
        });
        e.target.value = '';
        setSpInfoFile(null);
        setSpInfoData([]);
        setSpInfoLoading(false);
        return;
      }

      // Helper: format Excel date cells (Date objects or serial numbers) to "DD-MMM-YYYY"
      const formatSpDate = (value) => {
        if (value === undefined || value === null || value === '') return null;

        let dateObj = null;

        if (value instanceof Date && !isNaN(value)) {
          dateObj = value;
        } else if (typeof value === 'number') {
          // Excel serial number -> JS Date (Excel epoch starts 1899-12-30)
          dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
        } else {
          const parsed = new Date(value);
          if (!isNaN(parsed)) dateObj = parsed;
        }

        // If we couldn't parse it as a date, keep the original trimmed text
        if (!dateObj || isNaN(dateObj)) return String(value).trim();

        const day = String(dateObj.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[dateObj.getMonth()];
        const year = dateObj.getFullYear();
        return `${day}-${month}-${year}`;
      };

      const DATE_FIELDS = new Set(['sr_open_date', 'sr_close_date']);

      // Process rows in a deferred non-blocking way using chunked processing
      toast.dismiss(spToast);
      const processToast = toast.loading(`Processing ${data.length} rows...`);

      // Use setTimeout to yield to the browser between chunks
      const CHUNK_SIZE = 500;
      const allMapped = [];

      const processChunk = (startIdx) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const end = Math.min(startIdx + CHUNK_SIZE, data.length);
            for (let i = startIdx; i < end; i++) {
              const row = data[i];
              const normalizedRow = {};
              Object.keys(row).forEach(key => {
                normalizedRow[normalize(key)] = row[key];
              });
              const mapped = {};
              Object.entries(SP_INFO_COLUMN_MAP).forEach(([col, field]) => {
                const value = normalizedRow[col];
                if (DATE_FIELDS.has(field)) {
                  mapped[field] = formatSpDate(value);
                } else {
                  mapped[field] = (value === undefined || value === null) ? null : String(value).trim();
                }
              });
              allMapped.push(mapped);
            }
            resolve();
          }, 0);
        });
      };

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        await processChunk(i);
      }

      setSpInfoFile(file);
      setSpInfoData(allMapped);

      toast.dismiss(processToast);
      toast.success(`✅ Loaded ${allMapped.length} CSP Info rows`);
    } catch (err) {
      toast.dismiss(spToast);
      toast.error('Failed to read SP Info file: ' + err.message);
    } finally {
      setSpInfoLoading(false);
      e.target.value = '';
    }
  };

  const uploadSpInfo = async (campaignId) => {
    if (!spInfoData || spInfoData.length === 0) return;

    const spToast = toast.loading('Saving SP Info data...');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${campaignId}/sp-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(spInfoData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save SP Info');
      }

      const result = await response.json();
      toast.dismiss(spToast);
      toast.success(`SP Info saved (${result.inserted} added, ${result.updated} updated)`);
      return result;
    } catch (err) {
      toast.dismiss(spToast);
      toast.error('Failed to save SP Info: ' + err.message);
    }
  };

  const handlePdfUpload = async (e, isEdit = false) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload only PDF files');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size should be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Content = reader.result.split(',')[1];
      const scriptObj = {
        name: file.name,
        content: base64Content,
        type: 'pdf',
        size: file.size,
        uploaded_at: new Date().toISOString()
      };

      if (isEdit) {
        setEditCampaignData(prev => ({
          ...prev,
          scripts: [...prev.scripts, scriptObj]
        }));
      } else {
        setNewCampaign(prev => ({
          ...prev,
          scripts: [...prev.scripts, scriptObj]
        }));
      }
      toast.success('PDF uploaded successfully');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeScript = (index, isEdit = false) => {
    if (isEdit) {
      setEditCampaignData(prev => ({
        ...prev,
        scripts: prev.scripts.filter((_, i) => i !== index)
      }));
    } else {
      setNewCampaign(prev => ({
        ...prev,
        scripts: prev.scripts.filter((_, i) => i !== index)
      }));
    }
  };

  const removeAssetNumber = async (assetNumber, isEdit = false) => {
    let updatedAssets;
    if (isEdit) {
      updatedAssets = editCampaignData.asset_numbers.filter(num => num !== assetNumber);
      setEditCampaignData(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    } else {
      updatedAssets = newCampaign.asset_numbers.filter(num => num !== assetNumber);
      setNewCampaign(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    }
    await validateAssets(updatedAssets);
  };

  // Remove ALL invalid (not found) asset numbers at once
  const removeAllInvalidAssets = async (isEdit = false) => {
    if (invalidAssets.length === 0) return;

    const invalidSet = new Set(invalidAssets);
    let updatedAssets;

    if (isEdit) {
      updatedAssets = editCampaignData.asset_numbers.filter(num => !invalidSet.has(num));
      setEditCampaignData(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    } else {
      updatedAssets = newCampaign.asset_numbers.filter(num => !invalidSet.has(num));
      setNewCampaign(prev => ({
        ...prev,
        asset_numbers: updatedAssets
      }));
    }

    const removedCount = invalidAssets.length;
    await validateAssets(updatedAssets);
    toast.success(`Removed ${removedCount} invalid asset number${removedCount > 1 ? 's' : ''}`);
  };

  // Clicking "Create Drive" no longer creates immediately. It first checks
  // whether the chosen PRODUCT already has active drives. If it does, we open
  // the transfer picker; otherwise we create straight away.
  const handleCreateCampaign = async (e) => {
    e.preventDefault();

    if (!newCampaign.name) {
      toast.error('Drive name is required');
      return;
    }
    if (!newCampaign.service) {
      toast.error('Please select a product');
      return;
    }
    if (!newCampaign.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (invalidAssets.length > 0) {
      toast.error('Please remove all invalid asset numbers before creating drive');
      return;
    }
    if (newCampaign.asset_numbers.length === 0) {
      toast.error('Please add at least one valid asset number');
      return;
    }

    // Ask the backend if this product already has active drives.
    setCheckingTransfer(true);
    const checkToast = toast.loading('Checking existing drives...');
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/campaigns/active/by-service?service=${encodeURIComponent(newCampaign.service)}`,
        { headers: { ...getUserHeaders() } }
      );
      toast.dismiss(checkToast);

      if (response.ok) {
        const activeCampaigns = await response.json();
        if (Array.isArray(activeCampaigns) && activeCampaigns.length > 0) {
          // Let the user choose which drives to transfer from.
          setTransferCandidates(activeCampaigns);
          setSelectedTransferIds([]);
          setShowTransferModal(true);
          setCheckingTransfer(false);
          return; // wait for the user's choice in the modal
        }
      }
    } catch (err) {
      toast.dismiss(checkToast);
      // If the check fails, just fall through and create without transfer.
    }
    setCheckingTransfer(false);

    // No active drives for this product → create straight away.
    await submitCampaign([]);
  };

  const submitCampaign = async (transferIds = []) => {
    setCreateLoading(true);
    const createToast = toast.loading('Creating drive...');

    try {
      const campaignData = {
        name: newCampaign.name,
        service: newCampaign.service,
        description: newCampaign.description || '',
        color: newCampaign.color || '#406093',
        start_date: newCampaign.start_date || null,
        end_date: newCampaign.end_date || null,
        status: newCampaign.status || 'active',
        asset_numbers: newCampaign.asset_numbers,
        scripts: newCampaign.scripts
      };

      // Build query params: which drives to pull from + which statuses to carry over.
      let url = `${API_BASE_URL}/v1/campaigns/`;
      const qsParts = [];
      if (transferIds.length > 0) {
        transferIds.forEach(id => qsParts.push(`transfer_from_campaign_ids=${id}`));
        // statuses are guaranteed non-empty here (button is disabled otherwise)
        selectedTransferStatuses.forEach(st =>
          qsParts.push(`transfer_statuses=${encodeURIComponent(st)}`)
        );
      }
      if (qsParts.length > 0) url += `?${qsParts.join('&')}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(campaignData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create drive');
      }

      const data = await response.json();

      if (pendingBranchUpdates.length > 0) {
        toast.loading('Updating branch codes in customer records...', { id: 'branch-update' });
        const branchResults = await updateBranchCodes(pendingBranchUpdates);

        if (branchResults.success.length > 0) {
          toast.success(`Updated ${branchResults.success.length} customer branch codes`, { id: 'branch-update' });
        } else if (branchResults.not_found.length > 0) {
          toast.warning(`${branchResults.not_found.length} asset numbers not found in customer table`, { id: 'branch-update' });
        }
      }

      if (isCspService(newCampaign.service) && spInfoData.length > 0) {
        await uploadSpInfo(data.id);
      }

      // Show the new drive instantly.
      const newCampaignObj = { ...data, asset_numbers: data.asset_numbers || [] };
      setCampaigns(prev => [newCampaignObj, ...prev]);

      // Close everything.
      setShowTransferModal(false);
      setTransferCandidates([]);
      setSelectedTransferIds([]);
      setShowCampaignForm(false);
      resetForm();
      setPendingBranchUpdates([]);
      toast.dismiss(createToast);

      if (transferIds.length > 0) {
        toast.success(`Drive created — assets transferred from ${transferIds.length} drive${transferIds.length > 1 ? 's' : ''}`);
      } else {
        toast.success('Drive created successfully!');
      }

      // Transferred drives are now inactive — quietly resync.
      fetchCampaignsLazy({ background: true });
      fetchStats();
    } catch (err) {
      toast.dismiss(createToast);
      toast.error(err.message || 'Failed to create drive');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditCampaign = async (e) => {
    e.preventDefault();

    if (!editCampaignData.name || !editCampaignData.service) {
      toast.error('Drive name and product are required');
      return;
    }
    if (!editCampaignData.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (invalidAssets.length > 0) {
      toast.error('Please remove all invalid asset numbers before updating drive');
      return;
    }

    setEditLoading(true);
    const editToast = toast.loading('Updating drive...');

    try {
      const updateData = {
        id: editCampaignData.id,
        name: editCampaignData.name,
        service: editCampaignData.service,
        description: editCampaignData.description || '',
        color: editCampaignData.color || '#406093',
        start_date: editCampaignData.start_date || null,
        end_date: editCampaignData.end_date || null,
        status: editCampaignData.status || 'active',
        asset_numbers: editCampaignData.asset_numbers,
        scripts: editCampaignData.scripts || []
      };

      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${editCampaignData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getUserHeaders()
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update drive');
      }

      const data = await response.json();

      if (pendingBranchUpdates.length > 0) {
        toast.loading('Updating branch codes in customer records...', { id: 'branch-update' });
        const branchResults = await updateBranchCodes(pendingBranchUpdates);

        if (branchResults.success.length > 0) {
          toast.success(`Updated ${branchResults.success.length} customer branch codes`, { id: 'branch-update' });
        } else if (branchResults.not_found.length > 0) {
          toast.warning(`${branchResults.not_found.length} asset numbers not found in customer table`, { id: 'branch-update' });
        }
      }

      if (isCspService(editCampaignData.service) && spInfoData.length > 0) {
        await uploadSpInfo(data.id);
      }

      setCampaigns(campaigns.map(c => c.id === data.id ? { ...data, asset_numbers: data.asset_numbers || [] } : c));

      setShowEditCampaign(false);
      setSelectedCampaign(null);
      setPendingBranchUpdates([]);
      // Reset CSP Info File state so it never carries into the next drive.
      setSpInfoFile(null);
      setSpInfoData([]);
      toast.dismiss(editToast);
      toast.success('Drive updated successfully!');

      await fetchStats();
    } catch (err) {
      toast.dismiss(editToast);
      toast.error(err.message || 'Failed to update drive');
    } finally {
      setEditLoading(false);
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();

    if (!newService.name) {
      toast.error('Product name is required');
      return;
    }

    setServiceLoading(true);
    const serviceToast = toast.loading('Adding product...');

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newService),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to add product');
      }

      const data = await response.json();
      setServices([...services, data]);
      setShowServiceForm(false);
      setNewService({ name: '', description: '' });
      toast.dismiss(serviceToast);
      toast.success('Product added successfully!');
      fetchServices();
    } catch (err) {
      toast.dismiss(serviceToast);
      toast.error(err.message || 'Failed to add product');
    } finally {
      setServiceLoading(false);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete) return;

    setServiceLoading(true);
    const deleteToast = toast.loading('Deleting product...');

    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/services/${serviceToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete product');
      }

      setServices(services.filter(s => s.id !== serviceToDelete.id));
      setShowDeleteServiceConfirm(false);
      setServiceToDelete(null);
      toast.dismiss(deleteToast);
      toast.success('Product deleted successfully!');
      fetchServices();
    } catch (err) {
      toast.dismiss(deleteToast);
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setServiceLoading(false);
    }
  };

  // ==================== Letter Master handlers ====================
  const fetchLetterFormats = async () => {
    setLetterFormatsLoading(true);
    try {
      // include_attachment_content=false -> list returns attachment metadata only
      // (fast). Full content is hydrated on demand when a format is viewed/edited.
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/letter-master/formats?include_attachment_content=false`);
      if (!response.ok) throw new Error('Failed to fetch letter formats');
      const data = await response.json();
      setLetterFormats(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load letter formats');
    } finally {
      setLetterFormatsLoading(false);
    }
  };

  const openLetterMaster = () => {
    setShowLetterMaster(true);
    fetchLetterFormats();
    fetchGoemOemList();
  };

  const fetchGoemOemList = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/letter-master/goem-oem-list`);
      if (response.ok) {
        const data = await response.json();
        setGoemOemList(data);
      }
    } catch (err) {
      console.error('Failed to fetch GOEM list:', err);
    }
  };

  // Convert raw DB rules → UI rules (add temp input/error fields)
  const dbRulesToUiRules = (rules) =>
    (rules || []).map(r => ({
      _key: Date.now() + Math.random(),
      branch_codes: r.branch_codes || [],
      // backward compatible: old rules stored a single goem_oem string
      goem_oems: r.goem_oems || (r.goem_oem ? [r.goem_oem] : []),
      to_emails: r.to_emails || [],
      cc_emails: r.cc_emails || [],
      _toInput: '',
      _ccInput: '',
      _toError: '',
      _ccError: '',
      _goemSelect: '',
    }));

  // Convert UI rules → clean DB payload (strip temp fields)
  const uiRulesToDbRules = (rules) =>
    rules.map(r => ({
      branch_codes: r.branch_codes || [],
      goem_oems: r.goem_oems || [],
      to_emails: r.to_emails || [],
      cc_emails: r.cc_emails || [],
    }));

  const validateSingleEmail = (email) => {
    if (!email || !email.trim()) return false;
    return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  };

  const addEmailToRule = (ruleKey, field, inputField, errorField) => {
    setRecipientRules(prev => prev.map(r => {
      if (r._key !== ruleKey) return r;
      const email = r[inputField].trim();
      if (!email) return r;
      if (!validateSingleEmail(email)) {
        return { ...r, [errorField]: `"${email}" is not a valid email` };
      }
      if (r[field].includes(email.toLowerCase())) {
        return { ...r, [inputField]: '', [errorField]: 'Email already added' };
      }
      return {
        ...r,
        [field]: [...r[field], email.toLowerCase()],
        [inputField]: '',
        [errorField]: '',
      };
    }));
  };

  const removeEmailFromRule = (ruleKey, field, email) => {
    setRecipientRules(prev => prev.map(r =>
      r._key !== ruleKey ? r : { ...r, [field]: r[field].filter(e => e !== email) }
    ));
  };

  const toggleBranchInRule = (ruleKey, branchCode) => {
    setRecipientRules(prev => prev.map(r => {
      if (r._key !== ruleKey) return r;
      const has = r.branch_codes.includes(branchCode);
      return { ...r, branch_codes: has ? r.branch_codes.filter(b => b !== branchCode) : [...r.branch_codes, branchCode] };
    }));
  };

  const updateRuleField = (ruleKey, field, value) => {
    setRecipientRules(prev => prev.map(r =>
      r._key !== ruleKey ? r : { ...r, [field]: value }
    ));
  };

  const addGoemToRule = (ruleKey) => {
    setRecipientRules(prev => prev.map(r => {
      if (r._key !== ruleKey) return r;
      const goem = (r._goemSelect || '').trim();
      if (!goem) return r;
      if (r.goem_oems.includes(goem)) return { ...r, _goemSelect: '' };
      return { ...r, goem_oems: [...r.goem_oems, goem], _goemSelect: '' };
    }));
  };

  const removeGoemFromRule = (ruleKey, goem) => {
    setRecipientRules(prev => prev.map(r =>
      r._key !== ruleKey ? r : { ...r, goem_oems: r.goem_oems.filter(g => g !== goem) }
    ));
  };

  const addRecipientRule = () => {
    setRecipientRules(prev => [...prev, blankRule()]);
  };

  const removeRecipientRule = async (ruleKey) => {
    const ruleIdx = recipientRules.findIndex(r => r._key === ruleKey);
    const result = await Swal.fire({
      title: 'Remove Rule?',
      text: `Are you sure you want to remove Rule ${ruleIdx + 1}? All To/CC emails and branch assignments in this rule will be lost.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Remove',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
    });
    if (result.isConfirmed) {
      setRecipientRules(prev => prev.filter(r => r._key !== ruleKey));
      toast.success(`Rule ${ruleIdx + 1} removed`);
    }
  };

  // Which branch codes are already claimed by earlier rules
  const getClaimedBranches = (upToKey) => {
    const claimed = new Set();
    for (const r of recipientRules) {
      if (r._key === upToKey) break;
      r.branch_codes.forEach(b => claimed.add(b));
    }
    return claimed;
  };

  const fetchBranchEmails = async () => {
    setBranchEmailsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/branch-email-master`);
      if (!response.ok) throw new Error('Failed to fetch branch emails');
      const data = await response.json();
      // Merge DB data with BRANCH_LIST so all 14 branches always show
      const emailMap = {};
      data.forEach(row => {
        // backward compatible: old rows had a single `email`
        emailMap[row.branch_code] = (row.emails && row.emails.length > 0)
          ? row.emails
          : (row.email ? [row.email] : []);
      });
      setBranchEmails(
        BRANCH_LIST.map(b => ({ ...b, emails: emailMap[b.code] || [] }))
      );
    } catch (err) {
      toast.error(err.message || 'Failed to load branch emails');
      setBranchEmails(BRANCH_LIST.map(b => ({ ...b, emails: [] })));
    } finally {
      setBranchEmailsLoading(false);
    }
  };

  const openBranchEmailMaster = () => {
    setShowBranchEmailMaster(true);
    setBranchEmailErrors({});
    setBranchEmailInputs({});
    fetchBranchEmails();
  };

  const validateEmail = (email) => {
    if (!email || email.trim() === '') return true; // blank is allowed
    return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  };

  const handleBranchEmailInputChange = (code, value) => {
    setBranchEmailInputs(prev => ({ ...prev, [code]: value }));
    // Live validation of what's being typed
    if (value && !validateEmail(value)) {
      setBranchEmailErrors(prev => ({ ...prev, [code]: 'Invalid email address' }));
    } else {
      setBranchEmailErrors(prev => { const n = { ...prev }; delete n[code]; return n; });
    }
  };

  const addBranchEmail = (code) => {
    const value = (branchEmailInputs[code] || '').trim();
    if (!value) return;
    if (!validateEmail(value)) {
      setBranchEmailErrors(prev => ({ ...prev, [code]: 'Invalid email address' }));
      return;
    }
    setBranchEmails(prev => prev.map(b => {
      if (b.code !== code) return b;
      if (b.emails.includes(value.toLowerCase())) return b; // no duplicates
      return { ...b, emails: [...b.emails, value.toLowerCase()] };
    }));
    setBranchEmailInputs(prev => ({ ...prev, [code]: '' }));
    setBranchEmailErrors(prev => { const n = { ...prev }; delete n[code]; return n; });
  };

  const removeBranchEmail = (code, email) => {
    setBranchEmails(prev => prev.map(b =>
      b.code !== code ? b : { ...b, emails: b.emails.filter(e => e !== email) }
    ));
  };

  const handleSaveBranchEmails = async () => {
    // Chips are validated on add, but double-check before saving
    const errors = {};
    branchEmails.forEach(b => {
      b.emails.forEach(em => {
        if (em && !validateEmail(em)) errors[b.code] = 'Invalid email address';
      });
    });
    if (Object.keys(errors).length > 0) {
      setBranchEmailErrors(errors);
      toast.error('Please fix invalid email addresses before saving');
      return;
    }

    setBranchEmailsSaving(true);
    const saveToast = toast.loading('Saving branch emails...');
    try {
      const payload = {
        entries: branchEmails.map(b => ({
          branch_code: b.code,
          branch_name: b.name,
          emails: b.emails
        }))
      };
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/branch-email-master/bulk-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserHeaders() },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save branch emails');
      }
      const result = await response.json();
      toast.dismiss(saveToast);
      if (result.errors && result.errors.length > 0) {
        toast.error(`Saved ${result.saved} branches. ${result.errors.length} failed.`);
      } else {
        toast.success(`✅ Saved ${result.saved} branch${result.saved !== 1 ? 'es' : ''} successfully!`);
      }
    } catch (err) {
      toast.dismiss(saveToast);
      toast.error(err.message || 'Failed to save branch emails');
    } finally {
      setBranchEmailsSaving(false);
    }
  };

  const resetLetterFormatForm = () => {
    setLetterFormatData({
      id: null,
      format_type_name: '',
      products: [],
      reference_no: '',
      serial_start: '1',
      expiry_date: '',
      note: '',
      customer_detail_fields: ['instance_id'],
      engagement_detail_fields: [],
      default_attachments: [],
      start_para: '',
      end_para: '',
      include_service_cycle: false,
      service_cycle_intro: DEFAULT_SERVICE_CYCLE_INTRO,
      service_cycle_rows: []
    });
    setRecipientRules([]);
    setShowRecipientForm(false);
    setSerialLocked(false);          // a new format is never locked
    setSerialLockLoading(false);
  };

  const openAddLetterFormat = () => {
    resetLetterFormatForm();
    setShowLetterFormatForm(true);
  };

  // Fetch a single format WITH its full attachment content (the list endpoint
  // returns attachment metadata only). Returns null on failure.
  const fetchFullLetterFormat = async (formatId) => {
    if (!formatId) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/campaigns/letter-master/formats/${formatId}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to fetch full letter format:', e);
    }
    return null;
  };

  const openEditLetterFormat = (fmt) => {
    const product = (fmt.products || [])[0] || '';
    setLetterFormatData({
      id: fmt.id,
      format_type_name: fmt.format_type_name || '',
      products: product ? [product] : [],
      reference_no: fmt.reference_no || buildReferenceNo(product, fmt.id),
      serial_start: fmt.serial_start || '1',
      expiry_date: fmt.expiry_date ? fmt.expiry_date.split('T')[0] : '',
      _originalExpiry: fmt.expiry_date ? fmt.expiry_date.split('T')[0] : '',
      note: fmt.note || '',
      customer_detail_fields: fmt.customer_detail_fields || [],
      engagement_detail_fields: fmt.engagement_detail_fields || [],
      // Metadata-only for instant open; real content is hydrated just below.
      default_attachments: fmt.default_attachments || [],
      start_para: fmt.start_para || '',
      end_para: fmt.end_para || '',
      // CSP-only Service Cycle defaults
      include_service_cycle: !!fmt.include_service_cycle,
      service_cycle_intro: fmt.service_cycle_intro || DEFAULT_SERVICE_CYCLE_INTRO,
      service_cycle_rows: Array.isArray(fmt.service_cycle_rows) ? fmt.service_cycle_rows : []
    });
    setRecipientRules(dbRulesToUiRules(fmt.default_recipients || []));
    setShowRecipientForm((fmt.default_recipients || []).length > 0);
    setShowLetterFormatForm(true);

    // Lock the Serial No box if a letter has already been sent with this format
    setSerialLocked(false);
    checkLetterFormatSerialLock(fmt.id);

    // Hydrate the real attachment content on demand. While this is in flight the
    // Save button and attachment uploader are disabled (see the form JSX) so a
    // stripped-content attachment list can never be saved and no race can drop a
    // freshly added attachment.
    if ((fmt.default_attachments || []).length > 0) {
      setLetterFormatHydrating(true);
      fetchFullLetterFormat(fmt.id).then(full => {
        if (full && Array.isArray(full.default_attachments)) {
          setLetterFormatData(prev =>
            prev.id === fmt.id
              ? { ...prev, default_attachments: full.default_attachments }
              : prev
          );
        }
        setLetterFormatHydrating(false);
      });
    }
  };

  // Ask the backend whether this format already sent letters (locks Serial No)
  const checkLetterFormatSerialLock = async (formatId) => {
    if (!formatId) { setSerialLocked(false); return; }
    setSerialLockLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/campaigns/letter-master/formats/${formatId}/usage`);
      if (res.ok) {
        const d = await res.json();
        setSerialLocked(!!d.serial_locked);
      } else {
        setSerialLocked(false);
      }
    } catch (e) {
      setSerialLocked(false);
    } finally {
      setSerialLockLoading(false);
    }
  };

  const openViewLetterFormat = (fmt) => {
    setViewingLetterFormat(fmt);
    setShowLetterFormatView(true);

    // Attachment download links need the base64 content, which the list omits —
    // hydrate the full format on demand and patch it in.
    if ((fmt.default_attachments || []).length > 0) {
      setLetterFormatHydrating(true);
      fetchFullLetterFormat(fmt.id).then(full => {
        if (full && Array.isArray(full.default_attachments)) {
          setViewingLetterFormat(prev =>
            prev && prev.id === fmt.id
              ? { ...prev, default_attachments: full.default_attachments }
              : prev
          );
        }
        setLetterFormatHydrating(false);
      });
    }
  };

  // Reference No: KCGL/<FY>/<product>[-N]/BranchCode/serial no
  // N = how many OTHER letter formats already use this same product. So the
  // first format with a product stays plain ("Battery"), the next becomes
  // "Battery-1", the one after "Battery-2", and so on. The format currently
  // being edited is excluded from the count via editingId.
  // "BranchCode" and "serial no" remain literal words, filled per customer
  // when the letter is actually generated.
  const buildReferenceNo = (product, editingId = null) => {
    if (!product) return '';
    const count = letterFormats.filter(
      f => (f.products || []).includes(product) && f.id !== editingId
    ).length;
    const suffix = count > 0 ? `-${count}` : '';
    // Remove spaces from the product name in the reference number only,
    // e.g. "Oil Change" -> "OilChange". The stored product name keeps its spaces.
    const productPart = product.replace(/\s+/g, '');
    return `KCGL/${getFinancialYear()}/${productPart}${suffix}/Branch_Code/Serial_No`;
  };

  // Only ONE product per letter format. Selecting a product (or "Select
  // Product" to clear) rebuilds the reference number.
  const selectLetterProduct = (productName) => {
    setLetterFormatData(prev => {
      const csp = isCspService(productName);
      return {
        ...prev,
        products: productName ? [productName] : [],
        reference_no: buildReferenceNo(productName, prev.id),
        // Leaving CSP -> switch Service Cycle off so a non-CSP format never carries it
        include_service_cycle: csp ? prev.include_service_cycle : false
      };
    });
  };

  // ----- CSP-only Service Cycle row editing (Letter Master defaults) -----
  const setServiceCycleCell = (idx, key, value) =>
    setLetterFormatData(prev => ({
      ...prev,
      service_cycle_rows: (prev.service_cycle_rows || []).map((r, i) =>
        i === idx ? { ...r, [key]: value } : r
      )
    }));

  const addServiceCycleRow = () =>
    setLetterFormatData(prev => ({
      ...prev,
      service_cycle_rows: [...(prev.service_cycle_rows || []), blankServiceCycleRow()]
    }));

  const removeServiceCycleRow = (idx) =>
    setLetterFormatData(prev => ({
      ...prev,
      service_cycle_rows: (prev.service_cycle_rows || []).filter((_, i) => i !== idx)
    }));

  const CUSTOMER_DETAIL_OPTIONS = [
    { value: 'instance_id', label: 'Instance ID' },
    { value: 'account_name', label: 'Account Name' },
    { value: 'kva_rating', label: 'KVA Rating' },
    { value: 'commissioning_date', label: 'Commissioning Date' },
    { value: 'application_code', label: 'Application Code' },
    { value: 'engine_no', label: 'Engine No.' },
    { value: 'engine_model', label: 'Engine Model' },
    { value: 'warranty_expiry', label: 'Warranty Expiry' },
    { value: 'product_segment', label: 'Product Segment' },
    { value: 'engine_series', label: 'Engine Series' },
    { value: 'segment', label: 'Segment' },
  ];

  const ENGAGEMENT_DETAIL_OPTIONS = [
    { value: 'followup_history', label: 'Followups History' },
    { value: 'quotation_history', label: 'Quotation History' },
    { value: 'letter_history', label: 'Letter History' },
  ];

  const toggleLetterCheckbox = (field, value) => {
    setLetterFormatData(prev => {
      const current = prev[field] || [];
      return {
        ...prev,
        [field]: current.includes(value)
          ? current.filter(v => v !== value)
          : [...current, value]
      };
    });
  };

  const handleLetterAttachmentUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const accepted = [];
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!LETTER_ATTACHMENT_EXTS.includes(ext)) {
        toast.error(`"${file.name}" is not allowed. Use mp4, jpg, png, pdf, word or excel files.`);
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`"${file.name}" is larger than 25MB`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) {
      e.target.value = '';
      return;
    }

    let pending = accepted.length;
    accepted.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Content = reader.result.split(',')[1];
        const attachmentObj = {
          name: file.name,
          content: base64Content,
          type: file.type || 'application/octet-stream',
          size: file.size,
          uploaded_at: new Date().toISOString()
        };
        setLetterFormatData(prev => ({
          ...prev,
          default_attachments: [...prev.default_attachments, attachmentObj]
        }));
        pending -= 1;
        if (pending === 0) {
          toast.success(`Added ${accepted.length} attachment${accepted.length > 1 ? 's' : ''}`);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeLetterAttachment = (index) => {
    setLetterFormatData(prev => ({
      ...prev,
      default_attachments: prev.default_attachments.filter((_, i) => i !== index)
    }));
  };

  const handleSaveLetterFormat = async (e) => {
    e.preventDefault();
    // Never save while attachment content is still being hydrated — otherwise we
    // could persist attachments with their base64 content stripped.
    if (letterFormatHydrating) {
      toast('Please wait — loading existing attachments…');
      return;
    }
    if (!letterFormatData.format_type_name.trim()) {
      toast.error('Format Type Name is required');
      return;
    }

    // Block past expiry dates — but allow an already-saved past date to remain
    // untouched (e.g. a format that was set to a future date and has since expired,
    // now being edited for some other reason).
    if (
      letterFormatData.expiry_date &&
      isPastDate(letterFormatData.expiry_date) &&
      letterFormatData.expiry_date !== letterFormatData._originalExpiry
    ) {
      toast.error('Expiry Date cannot be a past date. Please select today or a future date.');
      return;
    }

    setLetterFormatSaving(true);
    const isEdit = !!letterFormatData.id;
    const saveToast = toast.loading(isEdit ? 'Updating format...' : 'Saving format...');

    try {
      const product = letterFormatData.products[0] || '';
      const isCsp = isCspService(product);
      // Keep only non-blank rows, and only for a CSP product with the toggle on.
      const cleanServiceCycleRows = (isCsp && letterFormatData.include_service_cycle)
        ? (letterFormatData.service_cycle_rows || []).filter(r =>
          (r.service_type || '').trim() || (r.schedule || '').trim() || (r.remarks || '').trim()
        )
        : [];
      const payload = {
        format_type_name: letterFormatData.format_type_name.trim(),
        products: product ? [product] : [],
        reference_no: product
          ? (letterFormatData.reference_no || buildReferenceNo(product, letterFormatData.id))
          : '',
        serial_start: letterFormatData.serial_start || '1',
        expiry_date: letterFormatData.expiry_date || null,
        note: letterFormatData.note || '',
        customer_detail_fields: ['instance_id', ...((letterFormatData.customer_detail_fields || []).filter(f => f !== 'instance_id'))],
        engagement_detail_fields: letterFormatData.engagement_detail_fields || [],
        default_recipients: uiRulesToDbRules(recipientRules),
        default_attachments: letterFormatData.default_attachments,
        start_para: letterFormatData.start_para || '',
        end_para: letterFormatData.end_para || '',
        // CSP-only Service Cycle defaults
        include_service_cycle: isCsp ? !!letterFormatData.include_service_cycle : false,
        service_cycle_intro: letterFormatData.service_cycle_intro || DEFAULT_SERVICE_CYCLE_INTRO,
        service_cycle_rows: cleanServiceCycleRows
      };

      const url = isEdit
        ? `${API_BASE_URL}/v1/campaigns/letter-master/formats/${letterFormatData.id}`
        : `${API_BASE_URL}/v1/campaigns/letter-master/formats`;

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserHeaders() },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save format');
      }

      const data = await response.json();
      setLetterFormats(prev =>
        isEdit ? prev.map(f => (f.id === data.id ? data : f)) : [data, ...prev]
      );

      toast.dismiss(saveToast);
      toast.success(isEdit ? 'Format updated successfully!' : 'Format saved successfully!');
      setShowLetterFormatForm(false);
      resetLetterFormatForm();
    } catch (err) {
      toast.dismiss(saveToast);
      toast.error(err.message || 'Failed to save format');
    } finally {
      setLetterFormatSaving(false);
    }
  };

  const handleDeleteLetterFormat = async (fmt) => {
    const result = await Swal.fire({
      title: 'Delete Format?',
      html: `Are you sure you want to delete <b>"${fmt.format_type_name}"</b>?<br/>` +
        `<span style="color:#ef4444;font-size:12px;">This action cannot be undone.</span>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
    });
    if (!result.isConfirmed) return;

    const delToast = toast.loading('Deleting format...');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/letter-master/formats/${fmt.id}`, {
        method: 'DELETE',
        headers: { ...getUserHeaders() }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete format');
      }
      setLetterFormats(prev => prev.filter(f => f.id !== fmt.id));
      toast.dismiss(delToast);
      toast.success('Format deleted successfully!');
    } catch (err) {
      toast.dismiss(delToast);
      toast.error(err.message || 'Failed to delete format');
    }
  };

  const handleRefresh = async () => {
    if (refreshLoading) return;

    setRefreshLoading(true);
    const refreshToast = toast.loading('Refreshing data...');
    try {
      await Promise.all([fetchCampaignsLazy(), fetchStats(), fetchServices()]);
      toast.dismiss(refreshToast);
      toast.success('Data refreshed successfully!');
    } catch (error) {
      toast.dismiss(refreshToast);
      toast.error('Failed to refresh data');
    } finally {
      setRefreshLoading(false);
    }
  };

  const openEditModal = (campaign, e) => {
    e.stopPropagation();

    setEditCampaignData({
      id: campaign.id,
      name: campaign.name,
      service: campaign.service,
      description: campaign.description || '',
      color: campaign.color || '#406093',
      start_date: campaign.start_date ? campaign.start_date.split('T')[0] : '',
      end_date: campaign.end_date ? campaign.end_date.split('T')[0] : '',
      status: campaign.status,
      asset_numbers: campaign.asset_numbers || [],
      scripts: campaign.scripts || []
    });
    setImportedFile(null);
    // Clear any CSP Info File left over from a previous create/edit so it can't
    // be uploaded against the drive being opened now.
    setSpInfoFile(null);
    setSpInfoData([]);
    setShowEditCampaign(true);          // open instantly
    validateAssets(campaign.asset_numbers || []); // validate in background (shows the spinner)
  };

  const openDeleteServiceConfirm = (service, e) => {
    e.stopPropagation();
    setServiceToDelete(service);
    setShowDeleteServiceConfirm(true);
  };

  const resetForm = () => {
    setNewCampaign({
      name: '',
      service: '',
      description: '',
      color: '#406093',
      start_date: '',
      end_date: '',
      status: 'active',
      asset_numbers: [],
      scripts: []
    });
    setImportedFile(null);
    setValidAssets([]);
    setInvalidAssets([]);
    setPendingBranchUpdates([]);
    setSpInfoFile(null);
    setSpInfoData([]);
    // clear the asset-transfer picker state too
    setShowTransferModal(false);
    setTransferCandidates([]);
    setSelectedTransferIds([]);
    setSelectedTransferStatuses(ALL_TRANSFER_STATUS_VALUES);
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const exportInvalidAssets = () => {
    if (invalidAssets.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(
      invalidAssets.map(asset => ({ 'Invalid Asset Number': asset }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invalid Assets');
    const fileName = `invalid_assets_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${invalidAssets.length} invalid asset numbers to Excel`);
  };

  // Recompute only when the source list or the search term actually changes.
  const filteredCampaigns = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return campaigns.filter(campaign =>
      campaign.name.toLowerCase().includes(term) ||
      campaign.description?.toLowerCase().includes(term)
    );
  }, [campaigns, searchTerm]);

  // ⚡ Progressive reveal: after the first batch paints, grow visibleCount in
  // chunks on each animation frame until all filtered cards are shown.
  // The first cards appear immediately; the rest stream in without blocking.
  useEffect(() => {
    if (visibleCount >= filteredCampaigns.length) return;
    const id = requestAnimationFrame(() => {
      setVisibleCount((c) => Math.min(c + 8, filteredCampaigns.length));
    });
    return () => cancelAnimationFrame(id);
  }, [visibleCount, filteredCampaigns.length]);

  // Reset the reveal window whenever the filtered set changes (search/filter/refetch)
  useEffect(() => {
    setVisibleCount(8);
  }, [searchTerm, selectedService, selectedStatus, campaigns.length]);

  // Only the cards currently revealed get rendered (memoized)
  const visibleCampaigns = useMemo(
    () => filteredCampaigns.slice(0, visibleCount),
    [filteredCampaigns, visibleCount]
  );

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const openDeleteCampaignConfirm = (campaign) => {
    setCampaignToDelete(campaign);
    setShowDeleteCampaignConfirm(true);
  };

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    setDeleteLoading(true);
    const deleteToast = toast.loading('Deleting drive...');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/campaigns/${campaignToDelete.id}`, {
        method: 'DELETE',
        headers: { ...getUserHeaders() }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to delete drive');
      }

      // Backend blocked the delete because the campaign is already in use
      if (data.deleted === false) {
        toast.dismiss(deleteToast);
        toast(data.message || 'Drive is already in use and cannot be removed', {
          icon: '⚠️',
          duration: 5000,
        });
        setShowDeleteCampaignConfirm(false);
        setCampaignToDelete(null);
        return;
      }

      setCampaigns(prev => prev.filter(c => c.id !== campaignToDelete.id));
      setShowDeleteCampaignConfirm(false);
      setCampaignToDelete(null);
      toast.dismiss(deleteToast);
      toast.success('Drive deleted successfully!');
      fetchStats();
    } catch (err) {
      toast.dismiss(deleteToast);
      toast.error(err.message || 'Failed to delete drive');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Skeleton loader component for campaigns
  const CampaignSkeleton = () => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-[280px] animate-pulse">
      <div className="px-3 py-2.5 bg-gray-200 shrink-0">
        <div className="h-5 bg-gray-300 rounded w-3/4"></div>
      </div>
      <div className="flex-1 p-3 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded w-full"></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
        </div>
        <div className="flex items-center justify-between pt-3 mt-auto">
          <div className="h-6 bg-gray-200 rounded w-20"></div>
          <div className="flex items-center gap-3">
            <div className="h-6 bg-gray-200 rounded w-16"></div>
            <div className="h-6 w-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Modern themed calendar styling for the react-datepicker date fields */}
      <style>{`
        .camp-popper { z-index: 9999 !important; }
        .camp-calendar {
          font-family: inherit;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          box-shadow: 0 14px 38px rgba(47, 49, 146, 0.18);
          overflow: hidden;
          padding-bottom: 6px;
        }
        .camp-calendar .react-datepicker__header {
          background: linear-gradient(135deg, #2f3192, #335478);
          border-bottom: none;
          padding-top: 12px;
        }
        .camp-calendar .react-datepicker__current-month {
          color: #fff;
          font-weight: 700;
          font-size: 0.85rem;
          margin-bottom: 6px;
        }
        .camp-calendar .react-datepicker__day-name {
          color: rgba(255, 255, 255, 0.85);
          font-weight: 600;
          width: 2rem;
          line-height: 2rem;
        }
        .camp-calendar .react-datepicker__day {
          width: 2rem;
          line-height: 2rem;
          margin: 2px;
          border-radius: 9999px;
          color: #111827;
          transition: background .15s ease, color .15s ease;
        }
        .camp-calendar .react-datepicker__day:hover { background: #e0e7ff; }
        .camp-calendar .react-datepicker__day--selected,
        .camp-calendar .react-datepicker__day--keyboard-selected {
          background: #2f3192 !important;
          color: #fff !important;
        }
        .camp-calendar .react-datepicker__day--today { font-weight: 700; color: #2f3192; }
        .camp-calendar .react-datepicker__day--selected.react-datepicker__day--today { color: #fff; }
        .camp-calendar .react-datepicker__day--disabled { color: #d1d5db; }
        .camp-calendar .react-datepicker__day--outside-month { color: #cbd5e1; }
        .camp-calendar .react-datepicker__navigation { top: 12px; }
        .camp-calendar .react-datepicker__navigation-icon::before { border-color: #fff; }
        .camp-calendar .react-datepicker__triangle { display: none; }

        /* Clear (×) button — subtle gray pill, red on hover */
        .camp-dp-wrapper .react-datepicker__close-icon {
          right: 10px;
          padding: 0;
          height: 100%;
          display: flex;
          align-items: center;
        }
        .camp-dp-wrapper .react-datepicker__close-icon::after {
          background-color: #f1f5f9;
          color: #64748b;
          height: 18px;
          width: 18px;
          font-size: 14px;
          line-height: 1;
          border-radius: 9999px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 0 0 1px #e2e8f0;
          transition: background-color .15s ease, color .15s ease, box-shadow .15s ease;
        }
        .camp-dp-wrapper .react-datepicker__close-icon:hover::after {
          background-color: #ef4444;
          color: #fff;
          box-shadow: inset 0 0 0 1px #ef4444;
        }
      `}</style>
      <div className="max-w-7xl mx-auto px-4 sm:px-3 max-md:px-2">
        {/* Header Section */}
        <div className="flex flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="text-base sm:text-lg lg:text-xl font-bold text-black mb-1">
              Create Your Drive!!!
            </h1>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end max-md:flex-wrap">
            <div className="flex sm:hidden items-center gap-1.5">
              <div className="bg-white rounded-lg shadow-sm px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <div className="p-0.5 rounded" style={{ backgroundColor: themeShades.light }}>
                    <MegaphoneIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                  </div>
                  <span className="text-xs font-bold text-black">{stats.total_campaigns}</span>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm px-2 py-1.5">
                <div className="flex items-center gap-1">
                  <div className="p-0.5 rounded" style={{ backgroundColor: themeShades.light }}>
                    <CheckCircleIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                  </div>
                  <span className="text-xs font-bold text-black">{stats.active_campaigns}</span>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <div className="bg-white rounded-lg shadow-sm px-3 py-1">
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-black">Total:</span>
                    <span className="text-sm font-bold text-black">{stats.total_campaigns}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm px-3 py-1">
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5">
                    <span className="text-xs text-black">Active:</span>
                    <span className="text-sm font-bold text-black">{stats.active_campaigns}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 max-md:flex-wrap">
              <button
                onClick={() => {
                  resetForm();
                  setShowCampaignForm(true);
                }}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                style={{ background: "#2f3192" }}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                <span className="text-xs">Create</span>
              </button>

              <button
                onClick={() => setShowServiceForm(true)}
                disabled={serviceLoading}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{ background: "#2f3192" }}
              >
                {serviceLoading ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" style={{ color: 'white' }} />
                ) : (
                  <PlusIcon className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">Service/Product</span>
              </button>

              <button
                onClick={openLetterMaster}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                style={{ background: "#2f3192" }}
              >
                <DocumentTextIcon className="h-3.5 w-3.5" />
                <span className="text-xs">Letter Master</span>
              </button>

              <button
                onClick={handleRefresh}
                disabled={refreshLoading}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md hover:opacity-90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                style={{ background: "#2f3192" }}
              >
                {refreshLoading ? (
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" style={{ color: 'white' }} />
                ) : (
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                )}
                <span className="text-xs">Refresh</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-lg p-1.5 px-3 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
              <div className="lg:hidden">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <FunnelIcon className="h-4 w-4" style={{ color: themeColor }} />
                  <span className="text-xs text-black">Filter by:</span>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={loading}
                  >
                    <option value="all">All Service/Products</option>
                    {services.map(service => (
                      <option key={service.id} value={service.name}>
                        {service.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={loading}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <FunnelIcon className="h-4 w-4 shrink-0" style={{ color: themeColor }} />
                  <span className="text-xs text-black">Filter by:</span>
                </div>

                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all text-black"
                  style={{ '--tw-ring-color': themeColor }}
                  disabled={loading}
                >
                  <option value="all">All Service/Products</option>
                  {services.map(service => (
                    <option key={service.id} value={service.name}>
                      {service.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all text-black"
                  style={{ '--tw-ring-color': themeColor }}
                  disabled={loading}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-72">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search drives..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full border-2 border-black rounded-md px-2 py-1.5 text-xs focus:ring-2 transition-all text-black"
                  style={{ '--tw-ring-color': themeColor }}
                  disabled={loading}
                />
              </div>

              {/* Card / Table view toggle — same pattern as Knowledge Bank */}
              <div className="flex rounded-lg border border-gray-300 bg-white overflow-hidden shrink-0 shadow-sm">
                <button
                  onClick={() => switchCampaignView('grid')}
                  className="p-2 transition"
                  style={campaignView === 'grid' ? { backgroundColor: 'var(--erp-accent)', color: '#fff' } : { color: '#6b7280' }}
                  title="Card view"
                >
                  <Squares2X2Icon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => switchCampaignView('table')}
                  className="p-2 transition"
                  style={campaignView === 'table' ? { backgroundColor: 'var(--erp-accent)', color: '#fff' } : { color: '#6b7280' }}
                  title="Table view"
                >
                  <TableCellsIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Create Campaign Modal */}
        {showCampaignForm && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !createLoading && setShowCampaignForm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Create New Drive</h2>
                <button
                  onClick={() => !createLoading && setShowCampaignForm(false)}
                  className="w-7 h-7 bg-white rounded-lg text-black flex items-center justify-center"
                  disabled={createLoading}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCampaign} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Drive Name *</label>
                  <input
                    type="text"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    placeholder="e.g., Summer Oil Change Drive"
                    disabled={createLoading}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Service/Product *</label>
                  <select
                    value={newCampaign.service}
                    onChange={(e) => {
                      const nextService = e.target.value;
                      setNewCampaign({ ...newCampaign, service: nextService });
                      // Leaving CSP -> drop any loaded CSP Info File so it can
                      // never be uploaded against a non-CSP drive.
                      if (!isCspService(nextService)) {
                        setSpInfoFile(null);
                        setSpInfoData([]);
                      }
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={createLoading}
                    required
                  >
                    <option value="">Select Product</option>
                    {services.map(service => (
                      <option key={service.id} value={service.name}>{service.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Description</label>
                  <textarea
                    value={newCampaign.description}
                    onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    rows="2"
                    placeholder="Drive description..."
                    disabled={createLoading}
                  />
                </div>

                {/* Import Excel Section */}
                <div className="border border-dashed border-gray-300 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-black mb-1.5">
                    Import Asset Numbers from Excel (ASSET NUMBER, BRANCH CODE) *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleFileImport(e, false)}
                      className="hidden"
                      id="file-upload"
                      disabled={importLoading || createLoading}
                    />
                    <label
                      htmlFor="file-upload"
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${importLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                        }`}
                      style={{ borderColor: importLoading ? '#9CA3AF' : themeColor }}
                    >
                      {importLoading ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                      ) : (
                        <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                      )}
                      <span className="text-sm text-black">
                        {importedFile ? importedFile.name : 'Choose Excel file'}
                      </span>
                    </label>
                  </div>

                  {/* Asset Validation Preview */}
                  {(newCampaign.asset_numbers.length > 0 || isValidating) && (
                    <div className="mt-3 space-y-2">
                      {isValidating && (
                        <div className="flex items-center justify-center py-3">
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                          <span className="ml-2 text-sm text-black">Validating assets...</span>
                        </div>
                      )}

                      {!isValidating && (
                        <>
                          {validAssets.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-md p-3">
                              <p className="text-xs font-semibold text-green-700 mb-1.5">
                                ✓ Valid Assets ({validAssets.length}):
                              </p>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {validAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs"
                                  >
                                    {asset}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {invalidAssets.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                              <div className="flex items-center justify-between mb-1.5 max-sm:flex-wrap max-sm:gap-1">
                                <p className="text-xs font-semibold text-red-700">
                                  ✗ Not Found in Database ({invalidAssets.length}):
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => removeAllInvalidAssets(false)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-0.5"
                                  >
                                    <XMarkIcon className="h-3 w-3" />
                                    Remove All
                                  </button>
                                  {canExportExcel() && (
                                    <button
                                      type="button"
                                      onClick={exportInvalidAssets}
                                      className="export-btn text-xs font-medium flex items-center gap-0.5 px-2 py-0.5 rounded"
                                    >
                                      <DocumentArrowUpIcon className="h-3 w-3" />
                                      Export
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {invalidAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs"
                                  >
                                    {asset}
                                    <button
                                      type="button"
                                      onClick={() => removeAssetNumber(asset, false)}
                                      className="hover:text-red-600"
                                    >
                                      <XMarkIcon className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="bg-gray-50 rounded-md p-2.5">
                            <p className="text-xs font-semibold text-black">
                              Total: {newCampaign.asset_numbers.length} assets ({validAssets.length} valid, {invalidAssets.length} invalid)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* SP Info Upload Section - only for CSP products (name contains "csp") */}
                {isCspService(newCampaign.service) && (
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload CSP Info File (CSP) — columns must match the CSP Info format
                    </label>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-2">
                      <p className="text-[11px] font-semibold text-blue-800 mb-1">
                        Required columns (exact names, any order):
                      </p>
                      <p className="text-[11px] text-blue-700 leading-relaxed break-words">
                        {SP_INFO_REQUIRED_COLUMNS.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleSpInfoImport}
                        className="hidden"
                        id="sp-info-upload"
                        disabled={spInfoLoading || createLoading}
                      />
                      <label
                        htmlFor="sp-info-upload"
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${spInfoLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                          }`}
                        style={{ borderColor: spInfoLoading ? '#9CA3AF' : themeColor }}
                      >
                        {spInfoLoading ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                        ) : (
                          <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        )}
                        <span className="text-sm text-black">
                          {spInfoFile ? spInfoFile.name : 'Choose CSP Info Excel file'}
                        </span>
                      </label>
                    </div>
                    {spInfoData.length > 0 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-md p-2.5">
                        <p className="text-xs font-semibold text-green-700">
                          ✓ {spInfoData.length} CSP Info rows ready to upload
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Upload and Color Selection */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload Script PDFs (Max 10MB each)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => handlePdfUpload(e, false)}
                        className="hidden"
                        id="pdf-upload"
                        disabled={createLoading}
                      />
                      <label
                        htmlFor="pdf-upload"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all hover:border-[#406093]"
                        style={{ borderColor: themeColor }}
                      >
                        <CloudArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        <span className="text-sm text-black">Choose PDF file</span>
                      </label>
                    </div>

                    {newCampaign.scripts.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-black mb-1.5">
                          Uploaded Scripts ({newCampaign.scripts.length}):
                        </p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-gray-50 rounded-md">
                          {newCampaign.scripts.map((script, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-white rounded-md border">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <DocumentIcon className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                <span className="text-xs text-black truncate">{script.name}</span>
                                <span className="text-xs text-black shrink-0">
                                  ({(script.size / 1024).toFixed(2)} KB)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeScript(index, false)}
                                className="text-red-500 hover:text-red-700 shrink-0 ml-1"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">Drive Color</label>
                    <DriveColorPicker
                      value={newCampaign.color}
                      onChange={(c) => setNewCampaign({ ...newCampaign, color: c })}
                    />
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">Start Date *</label>
                    <DatePicker
                      selected={fromYMD(newCampaign.start_date)}
                      onChange={(d) => {
                        const newStartDate = toYMD(d);
                        if (newStartDate && isPastDate(newStartDate)) {
                          toast.error('Start date cannot be a past date. Please select today or a future date.');
                          return;
                        }
                        if (newCampaign.end_date && newStartDate > newCampaign.end_date) {
                          setNewCampaign({ ...newCampaign, start_date: newStartDate, end_date: '' });
                          toast.error('End date cannot be before start date. Please re-select end date.');
                        } else {
                          setNewCampaign({ ...newCampaign, start_date: newStartDate });
                        }
                      }}
                      minDate={new Date()}
                      dateFormat="dd MMM yyyy"
                      placeholderText="Select start date"
                      disabled={createLoading}
                      className={DATE_INPUT_CLASS}
                      wrapperClassName="w-full block camp-dp-wrapper"
                      calendarClassName="camp-calendar"
                      popperClassName="camp-popper"
                      portalId="camp-datepicker-portal"
                      showPopperArrow={false}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">End Date</label>
                    <DatePicker
                      selected={fromYMD(newCampaign.end_date)}
                      onChange={(d) => {
                        const newEndDate = toYMD(d);
                        if (newCampaign.start_date && newEndDate && newEndDate < newCampaign.start_date) {
                          toast.error('End date cannot be before start date');
                          return;
                        }
                        setNewCampaign({ ...newCampaign, end_date: newEndDate });
                      }}
                      minDate={fromYMD(newCampaign.start_date) || new Date()}
                      dateFormat="dd MMM yyyy"
                      placeholderText="Select end date (optional)"
                      disabled={createLoading}
                      isClearable={!createLoading}
                      className={DATE_INPUT_CLASS}
                      wrapperClassName="w-full block camp-dp-wrapper"
                      calendarClassName="camp-calendar"
                      popperClassName="camp-popper"
                      portalId="camp-datepicker-portal"
                      showPopperArrow={false}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createLoading || checkingTransfer || !newCampaign.name || !newCampaign.service || !newCampaign.start_date || newCampaign.asset_numbers.length === 0 || invalidAssets.length > 0} className="w-full text-white font-medium rounded-md py-2.5 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  {createLoading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                      Creating...
                    </>
                  ) : checkingTransfer ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                      Checking...
                    </>
                  ) : 'Create Drive'}
                </button>
                {invalidAssets.length > 0 && (
                  <p className="text-xs text-red-600 text-center">
                    Please remove all invalid assets before creating the drive
                  </p>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Transfer Assets Modal — choose active same-product drives + which
            statuses to pull assets from. Selected drives are set to inactive. */}
        {showTransferModal && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-[70] p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/30"
              onClick={() => !createLoading && setShowTransferModal(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <DocumentDuplicateIcon className="h-4 w-4 text-white shrink-0" />
                  <h2 className="text-sm lg:text-base font-semibold text-white truncate">Transfer Assets</h2>
                </div>
                <button
                  onClick={() => !createLoading && setShowTransferModal(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={createLoading}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 lg:p-5 overflow-y-auto custom-scrollbar">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
                  <p className="text-xs text-blue-800">
                    The product <span className="font-semibold">"{newCampaign.service}"</span> already has{' '}
                    <span className="font-semibold">{transferCandidates.length}</span> active drive
                    {transferCandidates.length > 1 ? 's' : ''}. Select the drive(s) and the asset
                    statuses you want to carry into this new drive.{' '}
                    <span className="font-semibold">Selected drives will be set to inactive.</span>
                  </p>
                </div>

                {/* Status filter — which last-follow-up statuses to carry over */}
                <div className="border border-gray-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-black">Transfer assets with status:</p>
                    <span className="text-[11px] text-gray-500">{selectedTransferStatuses.length} selected</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                    {TRANSFER_STATUS_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedTransferStatuses.includes(opt.value)}
                          onChange={() => toggleTransferStatus(opt.value)}
                          className="rounded border-gray-300"
                          style={{ accentColor: themeColor }}
                          disabled={createLoading}
                        />
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${opt.badge}`}>
                          {opt.short}
                        </span>
                        <span className="text-xs text-black group-hover:text-[#2f3192] transition-colors">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Status comes from each asset's latest follow-up in the source drive. Completed assets are never transferred.
                  </p>
                  {selectedTransferIds.length > 0 && selectedTransferStatuses.length === 0 && (
                    <p className="text-[11px] text-red-500 mt-1">Select at least one status to transfer.</p>
                  )}
                </div>

                {/* Select all */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-black cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTransferIds.length === transferCandidates.length && transferCandidates.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTransferIds(transferCandidates.map(c => c.id));
                        } else {
                          setSelectedTransferIds([]);
                        }
                      }}
                      className="rounded border-gray-300"
                      style={{ accentColor: themeColor }}
                    />
                    Select all
                  </label>
                  <span className="text-xs text-gray-500">{selectedTransferIds.length} selected</span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {transferCandidates.map(c => {
                    const checked = selectedTransferIds.includes(c.id);
                    const bd = c.status_breakdown || {};
                    const thisMovable = selectedTransferStatuses.reduce((sum, st) => sum + (bd[st] || 0), 0);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${checked ? 'border-[#2f3192] bg-[#2f3192]/5' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTransferIds(prev => [...prev, c.id]);
                            } else {
                              setSelectedTransferIds(prev => prev.filter(id => id !== c.id));
                            }
                          }}
                          className="mt-0.5 rounded border-gray-300"
                          style={{ accentColor: themeColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-black truncate">{c.name}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <UserGroupIcon className="h-3 w-3" style={{ color: themeColor }} />
                              {c.asset_count} asset{c.asset_count !== 1 ? 's' : ''}
                            </span>
                            {c.start_date && <span>Start: {formatDate(c.start_date)}</span>}
                            {c.created_by_name && <span>By: {c.created_by_name}</span>}
                          </div>

                          {/* Per-status breakdown */}
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            {TRANSFER_STATUS_OPTIONS.map(opt => {
                              const n = bd[opt.value] || 0;
                              if (n === 0) return null;
                              const active = selectedTransferStatuses.includes(opt.value);
                              return (
                                <span
                                  key={opt.value}
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${opt.badge} ${active ? '' : 'opacity-40 line-through'}`}
                                  title={`${opt.label}: ${n}${active ? '' : ' (excluded)'}`}
                                >
                                  {opt.short} {n}
                                </span>
                              );
                            })}
                            {(bd.completed || 0) > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600 opacity-70"
                                title={`Completed — not transferred: ${bd.completed}`}
                              >
                                ✓ {bd.completed} kept
                              </span>
                            )}
                          </div>

                          {checked && (
                            <p className="text-[11px] mt-1 font-medium" style={{ color: themeColor }}>
                              {thisMovable} asset{thisMovable !== 1 ? 's' : ''} will move from this drive
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 lg:px-5 py-3 border-t flex gap-3 max-sm:flex-col max-sm:items-stretch">
                <button
                  onClick={() => !createLoading && setShowTransferModal(false)}
                  disabled={createLoading}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitCampaign(selectedTransferIds)}
                  disabled={createLoading || (selectedTransferIds.length > 0 && selectedTransferStatuses.length === 0)}
                  className="flex-1 text-white font-medium rounded-md py-2 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  {createLoading ? (
                    <><ArrowPathIcon className="h-4 w-4 animate-spin" /> Creating...</>
                  ) : (
                    selectedTransferIds.length > 0
                      ? `Transfer & Create (${transferableCount})`
                      : 'Create Without Transfer'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Campaign Modal */}
        {showEditCampaign && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !editLoading && setShowEditCampaign(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Edit Drive</h2>
                <button
                  onClick={() => !editLoading && setShowEditCampaign(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={editLoading}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleEditCampaign} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Drive Name *</label>
                  <input
                    type="text"
                    value={editCampaignData.name}
                    onChange={(e) => setEditCampaignData({ ...editCampaignData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={editLoading}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Service/Product *</label>
                  <select
                    value={editCampaignData.service}
                    onChange={(e) => {
                      const nextService = e.target.value;
                      setEditCampaignData({ ...editCampaignData, service: nextService });
                      // Leaving CSP -> drop any loaded CSP Info File.
                      if (!isCspService(nextService)) {
                        setSpInfoFile(null);
                        setSpInfoData([]);
                      }
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={editLoading}
                    required
                  >
                    <option value="">Select Product</option>
                    {services.map(service => (
                      <option key={service.id} value={service.name}>{service.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Description</label>
                  <textarea
                    value={editCampaignData.description}
                    onChange={(e) => setEditCampaignData({ ...editCampaignData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    rows="2"
                    disabled={editLoading}
                  />
                </div>

                {/* Import Excel Section for Edit */}
                <div className="border border-dashed border-gray-300 rounded-lg p-4">
                  <label className="block text-xs font-semibold text-black mb-1.5">
                    Import Additional Asset Numbers (ASSET NUMBER, BRANCH CODE)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => handleFileImport(e, true)}
                      className="hidden"
                      id="edit-file-upload"
                      disabled={importLoading || editLoading}
                    />
                    <label
                      htmlFor="edit-file-upload"
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${importLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                        }`}
                      style={{ borderColor: importLoading ? '#9CA3AF' : themeColor }}
                    >
                      {importLoading ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                      ) : (
                        <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                      )}
                      <span className="text-sm text-black">
                        {importedFile ? importedFile.name : 'Choose Excel file'}
                      </span>
                    </label>
                  </div>

                  {/* Asset Validation Preview for Edit */}
                  {(editCampaignData.asset_numbers.length > 0 || isValidating) && (
                    <div className="mt-3 space-y-2">
                      {isValidating && (
                        <div className="flex items-center justify-center py-3">
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                          <span className="ml-2 text-sm text-black">Validating assets...</span>
                        </div>
                      )}

                      {!isValidating && (
                        <>
                          {validAssets.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-md p-3">
                              <p className="text-xs font-semibold text-green-700 mb-1.5">
                                ✓ Valid Assets ({validAssets.length}):
                              </p>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {validAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs"
                                  >
                                    {asset}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {invalidAssets.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3">
                              <div className="flex items-center justify-between mb-1.5 max-sm:flex-wrap max-sm:gap-1">
                                <p className="text-xs font-semibold text-red-700">
                                  ✗ Not Found in Database ({invalidAssets.length}):
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => removeAllInvalidAssets(true)}
                                    className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-0.5"
                                  >
                                    <XMarkIcon className="h-3 w-3" />
                                    Remove All
                                  </button>
                                  {canExportExcel() && (
                                    <button
                                      type="button"
                                      onClick={exportInvalidAssets}
                                      className="export-btn text-xs font-medium flex items-center gap-0.5 px-2 py-0.5 rounded"
                                    >
                                      <DocumentArrowUpIcon className="h-3 w-3" />
                                      Export
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {invalidAssets.map((asset, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs"
                                  >
                                    {asset}
                                    <button
                                      type="button"
                                      onClick={() => removeAssetNumber(asset, true)}
                                      className="hover:text-red-600"
                                    >
                                      <XMarkIcon className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="bg-gray-50 rounded-md p-2.5">
                            <p className="text-xs font-semibold text-black">
                              Total: {editCampaignData.asset_numbers.length} assets ({validAssets.length} valid, {invalidAssets.length} invalid)
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* SP Info Upload Section for Edit - only for CSP products (name contains "csp") */}
                {isCspService(editCampaignData.service) && (
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload SP Info File (CSP) — re-uploading updates rows by Instance ID
                    </label>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-2">
                      <p className="text-[11px] font-semibold text-blue-800 mb-1">
                        Required columns (exact names, any order):
                      </p>
                      <p className="text-[11px] text-blue-700 leading-relaxed break-words">
                        {SP_INFO_REQUIRED_COLUMNS.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleSpInfoImport}
                        className="hidden"
                        id="edit-sp-info-upload"
                        disabled={spInfoLoading || editLoading}
                      />
                      <label
                        htmlFor="edit-sp-info-upload"
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all ${spInfoLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#406093]'
                          }`}
                        style={{ borderColor: spInfoLoading ? '#9CA3AF' : themeColor }}
                      >
                        {spInfoLoading ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: themeColor }} />
                        ) : (
                          <DocumentArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        )}
                        <span className="text-sm text-black">
                          {spInfoFile ? spInfoFile.name : 'Choose CSP Info Excel file'}
                        </span>
                      </label>
                    </div>
                    {spInfoData.length > 0 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-md p-2.5">
                        <p className="text-xs font-semibold text-green-700">
                          ✓ {spInfoData.length} CSP Info rows ready to upload
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF Upload and Color Selection for Edit */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-dashed border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">
                      Upload Script PDFs (Max 10MB each)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => handlePdfUpload(e, true)}
                        className="hidden"
                        id="edit-pdf-upload"
                        disabled={editLoading}
                      />
                      <label
                        htmlFor="edit-pdf-upload"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all hover:border-[#406093]"
                        style={{ borderColor: themeColor }}
                      >
                        <CloudArrowUpIcon className="h-4 w-4" style={{ color: themeColor }} />
                        <span className="text-sm text-black">Choose PDF file</span>
                      </label>
                    </div>

                    {editCampaignData.scripts.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-black mb-1.5">
                          Uploaded Scripts ({editCampaignData.scripts.length}):
                        </p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-gray-50 rounded-md">
                          {editCampaignData.scripts.map((script, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-white rounded-md border">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <DocumentIcon className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                <span className="text-xs text-black truncate">{script.name}</span>
                                <span className="text-xs text-black shrink-0">
                                  ({(script.size / 1024).toFixed(2)} KB)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeScript(index, true)}
                                className="text-red-500 hover:text-red-700 shrink-0 ml-1"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border border-gray-300 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-black mb-1.5">Drive Color</label>
                    <DriveColorPicker
                      value={editCampaignData.color}
                      onChange={(c) => setEditCampaignData({ ...editCampaignData, color: c })}
                    />
                  </div>
                </div>

                {/* Dates and Status */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    {/* commented by nik
                    <label className="block text-xs font-semibold text-black mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={editCampaignData.start_date}
                      required
                      onChange={(e) => {
                        const newStartDate = e.target.value;
                        if (isPastDate(newStartDate)) {
                          toast.error('Start date cannot be a past date. Please select today or a future date.');
                          return;
                        }
                        if (editCampaignData.end_date && newStartDate > editCampaignData.end_date) {
                          setEditCampaignData({
                            ...editCampaignData,
                            start_date: newStartDate,
                            end_date: ''
                          });
                          toast.error('End date cannot be before start date. Please re-select end date.');
                        } else {
                          setEditCampaignData({ ...editCampaignData, start_date: newStartDate });
                        }
                      }}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                      style={{ '--tw-ring-color': themeColor }}
                      disabled={editLoading}
                      min={new Date().toISOString().split('T')[0]} // Add this line
                    /> */}
                    <label className="block text-xs font-semibold text-black mb-1">Start Date *</label>
                    <DatePicker
                      selected={fromYMD(editCampaignData.start_date)}
                      onChange={(d) => {
                        // Editing: let the user pick start/end dates freely — no past-date lock.
                        setEditCampaignData({ ...editCampaignData, start_date: toYMD(d) });
                      }}
                      dateFormat="dd MMM yyyy"
                      placeholderText="Select start date"
                      disabled={editLoading}
                      className={DATE_INPUT_CLASS}
                      wrapperClassName="w-full block camp-dp-wrapper"
                      calendarClassName="camp-calendar"
                      popperClassName="camp-popper"
                      portalId="camp-datepicker-portal"
                      showPopperArrow={false}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">End Date</label>
                    <DatePicker
                      selected={fromYMD(editCampaignData.end_date)}
                      onChange={(d) => {
                        const newEndDate = toYMD(d);
                        if (editCampaignData.start_date && newEndDate && newEndDate < editCampaignData.start_date) {
                          toast.error('End date cannot be before start date');
                          return;
                        }
                        // Setting the end date to today or a future date auto-activates the drive.
                        const activate = !!newEndDate && !isPastDate(newEndDate);
                        const wasInactive = editCampaignData.status !== 'active';
                        setEditCampaignData(prev => ({
                          ...prev,
                          end_date: newEndDate,
                          ...(activate ? { status: 'active' } : {})
                        }));
                        if (activate && wasInactive) {
                          toast.success('Drive set to Active — end date is in the future');
                        }
                      }}
                      minDate={fromYMD(editCampaignData.start_date) || undefined}
                      dateFormat="dd MMM yyyy"
                      placeholderText="Select end date (optional)"
                      disabled={editLoading}
                      isClearable={!editLoading}
                      className={DATE_INPUT_CLASS}
                      wrapperClassName="w-full block camp-dp-wrapper"
                      calendarClassName="camp-calendar"
                      popperClassName="camp-popper"
                      portalId="camp-datepicker-portal"
                      showPopperArrow={false}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">Status</label>
                    <div className="flex gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setEditCampaignData({ ...editCampaignData, status: "active" })}
                        className={`flex-1 px-2 py-1 rounded-md text-sm font-medium transition-all ${editCampaignData.status === "active"
                          ? "bg-green-500 text-white"
                          : "bg-gray-100 text-black hover:bg-gray-200"
                          }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditCampaignData({ ...editCampaignData, status: "inactive" })}
                        className={`flex-1 px-2 py-1 rounded-md text-sm font-medium transition-all ${editCampaignData.status === "inactive"
                          ? "bg-gray-500 text-white"
                          : "bg-gray-100 text-black hover:bg-gray-200"
                          }`}
                      >
                        Inactive
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={editLoading || !editCampaignData.name || !editCampaignData.service || !editCampaignData.start_date || editCampaignData.asset_numbers.length === 0 || invalidAssets.length > 0} className="w-full text-white font-medium rounded-md py-1.5 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  {editLoading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                      Updating...
                    </>
                  ) : 'Update Drive'}
                </button>
                {invalidAssets.length > 0 && (
                  <p className="text-xs text-red-600 text-center">
                    Please remove all invalid assets before updating the drive
                  </p>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Add Service Modal */}
        {showServiceForm && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !serviceLoading && setShowServiceForm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-md max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Add New Product</h2>
                <button
                  onClick={() => !serviceLoading && setShowServiceForm(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={serviceLoading}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleAddService} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Product Name *</label>
                  <input
                    type="text"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    placeholder="e.g., Battery"
                    disabled={serviceLoading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={serviceLoading || !newService.name}
                  className="w-full text-white font-medium rounded-md py-1.5 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                >
                  {serviceLoading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                      Adding...
                    </>
                  ) : 'Add Product'}
                </button>
              </form>

              {/* Products List Section with Scrollbar */}
              {services.length > 0 && (
                <div className="px-4 lg:px-5 pb-5">
                  <div className="border-t pt-4">
                    <h3 className="text-xs font-semibold text-black mb-2.5 flex items-center gap-1.5">
                      Available Products ({services.length})
                    </h3>
                    <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {services.map(service => (
                        <div
                          key={service.id}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-all group"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-black truncate">{service.name}</p>
                            {service.description && (
                              <p className="text-xs text-black truncate mt-0.5">{service.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 ml-2">
                            <button
                              onClick={(e) => openEditServiceModal(service, e)}
                              className="p-1 text-black hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                              title="Edit product"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => openDeleteServiceConfirm(service, e)}
                              className="p-1 text-black hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                              title="Delete product"
                            >
                              <XMarkIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Service Modal */}
        {showEditServiceForm && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !editServiceLoading && setShowEditServiceForm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-md">
              <div className="px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">Edit Product</h2>
                <button
                  onClick={() => !editServiceLoading && setShowEditServiceForm(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={editServiceLoading}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleEditService} className="p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Product Name *</label>
                  <input
                    type="text"
                    value={editServiceData.name}
                    onChange={(e) => setEditServiceData({ ...editServiceData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    placeholder="e.g., Battery"
                    disabled={editServiceLoading}
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEditServiceForm(false)}
                    disabled={editServiceLoading}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editServiceLoading || !editServiceData.name}
                    className="flex-1 text-white font-medium rounded-md py-2 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                  >
                    {editServiceLoading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                        Updating...
                      </>
                    ) : 'Update Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Service Confirmation Modal */}
        {showDeleteServiceConfirm && serviceToDelete && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-0 lg:p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => !serviceLoading && setShowDeleteServiceConfirm(false)}
            />

            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-md">
              <div className="px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl bg-red-500 flex justify-between items-center">
                <h2 className="text-sm lg:text-base font-semibold text-white">Delete Product</h2>
                <button
                  onClick={() => !serviceLoading && setShowDeleteServiceConfirm(false)}
                  className="text-white hover:text-gray-200 p-0.5"
                  disabled={serviceLoading}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 lg:p-5">
                <p className="text-sm lg:text-sm text-black mb-4">
                  Are you sure you want to delete product <span className="font-semibold">{serviceToDelete.name}</span>?
                  This action cannot be undone if the product is not used in any drive.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => !serviceLoading && setShowDeleteServiceConfirm(false)}
                    disabled={serviceLoading}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteService}
                    disabled={serviceLoading}
                    className="flex-1 px-3 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {serviceLoading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" style={{ color: 'white' }} />
                        Deleting...
                      </>
                    ) : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Letter Master Modal (table) */}
        {showLetterMaster && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-50 p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/20"
              onClick={() => setShowLetterMaster(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <div className="flex items-center gap-2">
                  <DocumentTextIcon className="h-4 w-4 text-white" />
                  <h2 className="text-sm lg:text-base font-semibold text-white">Letter Master</h2>
                </div>
                <button
                  onClick={() => setShowLetterMaster(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 lg:p-5 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <p className="text-xs text-gray-500">
                    {letterFormats.length} format{letterFormats.length !== 1 ? 's' : ''} saved
                  </p>
                  <div className="flex items-center gap-2 max-sm:flex-wrap max-sm:gap-2">
                    <button
                      onClick={openBranchEmailMaster}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                      style={{ background: "#2f3192" }}
                    >
                      <EnvelopeIcon className="h-3.5 w-3.5" />
                      Branch Email Master
                    </button>
                    <button
                      onClick={openAddLetterFormat}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all shadow-sm hover:shadow-md whitespace-nowrap"
                      style={{ background: "#2f3192" }}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      Add Format Type
                    </button>
                  </div>
                </div>

                {letterFormatsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <ArrowPathIcon className="h-5 w-5 animate-spin" style={{ color: themeColor }} />
                    <span className="ml-2 text-sm text-black">Loading formats...</span>
                  </div>
                ) : letterFormats.length === 0 ? (
                  <div className="text-center py-10">
                    <DocumentTextIcon className="h-10 w-10 mx-auto mb-3" style={{ color: themeColor }} />
                    <p className="text-sm text-black">No letter formats yet</p>
                    <button onClick={openAddLetterFormat} className="mt-2 text-sm font-medium hover:underline" style={{ color: themeColor }}>
                      Add your first format
                    </button>
                  </div>
                ) : (
                  <div className="relative border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto overflow-y-auto max-h-[55vh] custom-scrollbar">
                      <table className="text-xs" style={{ minWidth: '1120px', width: '100%', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '150px' }} />
                          <col style={{ width: '100px' }} />
                          <col style={{ width: '150px' }} />
                          <col style={{ width: '170px' }} />
                          <col style={{ width: '105px' }} />
                          <col style={{ width: '105px' }} />
                          <col style={{ width: '115px' }} />
                          <col style={{ width: '95px' }} />
                          <col style={{ width: '95px' }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10">
                          <tr className="text-center text-black" style={{ backgroundColor: themeShades.light }}>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Format Type</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Products</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Description</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Reference No</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Expiry Date</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Customer Details</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Engagement Details</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Attachments</th>
                            <th className="px-3 py-2.5 font-semibold text-center border-b border-gray-200 whitespace-nowrap">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {letterFormats.map((fmt, rowIdx) => (
                            <tr
                              key={fmt.id}
                              className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors align-middle ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                            >
                              {/* Format Type */}
                              <td className="px-3 py-2.5 text-center">
                                <span className="text-black font-semibold text-xs leading-tight block truncate" title={fmt.format_type_name}>
                                  {fmt.format_type_name}
                                </span>
                              </td>

                              {/* Products */}
                              <td className="px-3 py-2.5 text-center">
                                {(fmt.products || []).length === 0 ? (
                                  <span className="text-gray-400">—</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 justify-center">
                                    {(fmt.products || []).map((p, i) => (
                                      <span key={i} className="inline-flex items-center px-1.5 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded text-[11px] font-medium">
                                        {p}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>

                              {/* Description (note) */}
                              <td className="px-3 py-2.5 text-center">
                                {fmt.note ? (
                                  <span
                                    className="text-[11px] text-gray-600 block truncate text-center"
                                    title={fmt.note}
                                  >
                                    {fmt.note}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>

                              {/* Reference No */}
                              <td className="px-3 py-2.5 text-center">
                                {fmt.reference_no ? (
                                  <span
                                    className="font-mono text-[11px] text-gray-600 block truncate text-center"
                                    title={fmt.reference_no}
                                  >
                                    {fmt.reference_no}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>

                              {/* Expiry Date */}
                              <td className="px-3 py-2.5 text-center">
                                {fmt.expiry_date ? (
                                  <span className="text-[11px] text-gray-700 whitespace-nowrap">
                                    {formatDate(fmt.expiry_date)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>

                              {/* Customer Details count */}
                              <td className="px-3 py-2.5 text-center">
                                {(() => {
                                  const fields = ['instance_id', ...((fmt.customer_detail_fields || []).filter(f => f !== 'instance_id'))];
                                  return fields.length > 0 ? (
                                    <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded-full text-[11px] font-semibold">
                                      ✓ {fields.length} field{fields.length > 1 ? 's' : ''}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  );
                                })()}
                              </td>

                              {/* Engagement Details count */}
                              <td className="px-3 py-2.5 text-center">
                                {(fmt.engagement_detail_fields || []).length > 0 ? (
                                  <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[11px] font-semibold">
                                    ✓ {fmt.engagement_detail_fields.length} field{fmt.engagement_detail_fields.length > 1 ? 's' : ''}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>

                              {/* Default Attachments */}
                              <td className="px-3 py-2.5 text-center">
                                {(fmt.default_attachments || []).length > 0 ? (
                                  <span className="inline-flex items-center justify-center gap-1 text-[11px] text-gray-700">
                                    <PaperClipIcon className="h-3 w-3 text-gray-500 shrink-0" />
                                    {fmt.default_attachments.length} file{fmt.default_attachments.length > 1 ? 's' : ''}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">None</span>
                                )}
                              </td>

                              {/* Action */}
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => openViewLetterFormat(fmt)}
                                    className="p-1 text-black hover:text-[#2f3192] hover:bg-[#2f3192]/10 rounded-md transition-all"
                                    title="View format"
                                  >
                                    <EyeIcon className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => openEditLetterFormat(fmt)}
                                    className="p-1 text-black hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                                    title="Edit format"
                                  >
                                    <PencilIcon className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteLetterFormat(fmt)}
                                    className="p-1 text-black hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                                    title="Delete format"
                                  >
                                    <TrashIcon className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Branch Email Master Modal */}
        {showBranchEmailMaster && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-[65] p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/30"
              onClick={() => !branchEmailsSaving && setShowBranchEmailMaster(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div
                className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, #335478, #2f3192)` }}
              >
                <div className="flex items-center gap-2">
                  <EnvelopeIcon className="h-4 w-4 text-white shrink-0" />
                  <h2 className="text-sm lg:text-base font-semibold text-white">Branch Email Master</h2>
                </div>
                <button
                  onClick={() => !branchEmailsSaving && setShowBranchEmailMaster(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100"
                  disabled={branchEmailsSaving}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-5">
                {branchEmailsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <ArrowPathIcon className="h-5 w-5 animate-spin" style={{ color: themeColor }} />
                    <span className="ml-2 text-sm text-black">Loading branch emails...</span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-3">
                      Enter the email address for each branch. Leave blank if not applicable.
                    </p>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                      <table className="w-full text-xs max-lg:min-w-[560px]" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '40px' }} />
                          <col style={{ width: '120px' }} />
                          <col style={{ width: '130px' }} />
                          <col />
                        </colgroup>
                        <thead>
                          <tr style={{ backgroundColor: themeShades.light }}>
                            <th className="px-3 py-2.5 text-center font-semibold text-black border-b border-gray-200">#</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-black border-b border-gray-200">Branch Code</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-black border-b border-gray-200">Branch Name</th>
                            <th className="px-3 py-2.5 text-left font-semibold text-black border-b border-gray-200">Email Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branchEmails.map((branch, idx) => (
                            <tr
                              key={branch.code}
                              className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                            >
                              {/* Sr No */}
                              <td className="px-3 py-2 text-center text-gray-400 font-mono">{idx + 1}</td>

                              {/* Branch Code */}
                              <td className="px-3 py-2">
                                <span className="font-mono text-[11px] text-[#2f3192] font-semibold">{branch.code}</span>
                              </td>

                              {/* Branch Name */}
                              <td className="px-3 py-2">
                                <span className="text-black font-medium">{branch.name}</span>
                              </td>

                              {/* Email Input (multiple) */}
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1">
                                  <div className="flex gap-1.5">
                                    <input
                                      type="email"
                                      value={branchEmailInputs[branch.code] || ''}
                                      onChange={(e) => handleBranchEmailInputChange(branch.code, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          addBranchEmail(branch.code);
                                        }
                                      }}
                                      placeholder="e.g. branch@example.com"
                                      disabled={branchEmailsSaving}
                                      className={`flex-1 border rounded-md px-2.5 py-1.5 text-xs focus:ring-2 transition-all bg-white text-black ${branchEmailErrors[branch.code]
                                        ? 'border-red-400 focus:ring-red-300'
                                        : 'border-gray-300 focus:ring-[#2f3192]/30'
                                        }`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => addBranchEmail(branch.code)}
                                      disabled={branchEmailsSaving || !(branchEmailInputs[branch.code] || '').trim()}
                                      className="px-2.5 py-1.5 text-xs text-white rounded-md transition-all disabled:opacity-50"
                                      style={{ background: themeColor }}
                                    >
                                      Add
                                    </button>
                                  </div>
                                  {branchEmailErrors[branch.code] && (
                                    <span className="text-[10px] text-red-500">{branchEmailErrors[branch.code]}</span>
                                  )}
                                  {branch.emails.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {branch.emails.map(em => (
                                        <span key={em} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px]">
                                          {em}
                                          <button type="button" onClick={() => removeBranchEmail(branch.code, em)}>
                                            <XMarkIcon className="h-3 w-3 hover:text-blue-600" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">No emails added</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 lg:px-5 py-3 border-t bg-white flex items-center justify-between gap-3 max-sm:flex-wrap">
                <p className="text-xs text-gray-500">
                  {branchEmails.filter(b => b.emails.length > 0).length} of {branchEmails.length} branches have emails
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => !branchEmailsSaving && setShowBranchEmailMaster(false)}
                    disabled={branchEmailsSaving}
                    className="px-4 py-1 border border-gray-300 rounded-md text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveBranchEmails}
                    disabled={branchEmailsSaving || branchEmailsLoading}
                    className="px-4 py-1 text-white font-medium rounded-md text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    style={{ background: `linear-gradient(135deg, #335478, #2f3192)` }}
                  >
                    {branchEmailsSaving ? (
                      <><ArrowPathIcon className="h-4 w-4 animate-spin" /> Saving...</>
                    ) : (
                      <>
                        <CheckCircleIcon className="h-4 w-4" />
                        Save All Emails
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add / Edit Letter Format Modal */}
        {showLetterFormatForm && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-[60] p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/30"
              onClick={() => !letterFormatSaving && setShowLetterFormatForm(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <h2 className="text-sm lg:text-base font-semibold text-white">
                  {letterFormatData.id ? 'Edit Format Type' : 'Add Format Type'}
                </h2>
                <button onClick={() => !letterFormatSaving && setShowLetterFormatForm(false)}
                  className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100" disabled={letterFormatSaving}>
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveLetterFormat} className="p-4 lg:p-5 overflow-y-auto custom-scrollbar space-y-4">

                {/* 1) Product — select first */}
                <div>
                  <label className="block text-xs font-semibold text-black mb-1.5">Product</label>
                  <select
                    value={letterFormatData.products[0] || ''}
                    onChange={(e) => selectLetterProduct(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={letterFormatSaving}
                  >
                    <option value="">Select Product</option>
                    {services.map(service => (
                      <option key={service.id} value={service.name}>{service.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Note: One product per letter format. If the same product is reused in another format, its reference number is numbered -1, -2, and so on.
                  </p>
                </div>

                {/* 1b) Note — optional, shown after product select */}
                {letterFormatData.products.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1">
                      Description <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={letterFormatData.note || ''}
                      onChange={(e) => setLetterFormatData({ ...letterFormatData, note: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                      style={{ '--tw-ring-color': themeColor, minHeight: '60px' }}
                      placeholder="Any internal note about this letter format..."
                      disabled={letterFormatSaving}
                      rows={2}
                    />
                  </div>
                )}

                {/* 2) Reference No — split into boxes; Serial No is editable inline */}
                {letterFormatData.products.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-black mb-1.5">Reference No</label>
                    <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-1">
                      {(letterFormatData.reference_no || '').split('/').map((part, idx, arr) => {
                        const labels = ['Prefix', 'FY', 'Product', 'Branch Code', 'Serial No'];
                        const isSerialNo = idx === arr.length - 1;
                        return (
                          <React.Fragment key={idx}>
                            <div className="flex flex-col shrink-0">
                              <span className="text-[10px] text-gray-500 mb-0.5">
                                {labels[idx] || `Part ${idx + 1}`}
                              </span>
                              {isSerialNo ? (
                                <input
                                  type="number"
                                  min="1"
                                  value={letterFormatData.serial_start || '1'}
                                  onChange={(e) => setLetterFormatData({ ...letterFormatData, serial_start: e.target.value })}
                                  className={`border rounded-md px-2 py-2 text-sm text-center font-mono ${serialLocked ? 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed' : 'border-[#2f3192] bg-white text-black'}`}
                                  style={{ minWidth: '90px', width: '90px' }}
                                  disabled={letterFormatSaving || serialLocked}
                                  placeholder="1"
                                  title={serialLocked ? 'Locked — a letter has already been sent with this format' : 'Enter starting serial number'}
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={part}
                                  readOnly
                                  title={part}
                                  className="border border-gray-300 rounded-md px-2 py-2 text-sm text-center bg-gray-50 text-black font-mono cursor-not-allowed"
                                  style={{ width: `${Math.max(part.length, 8) + 6}ch`, minWidth: '90px' }}
                                />
                              )}
                            </div>
                            {idx < arr.length - 1 && (
                              <span className="text-gray-400 font-bold self-end mb-2.5">/</span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      <span className="font-semibold">Branch Code</span> is filled automatically per customer.{' '}
                      <span className="font-semibold">Serial No</span> box is editable — set the starting number for this format.
                    </p>
                    {serialLocked && (
                      <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                        🔒 Serial No is locked because a letter has already been sent with this format — it can no longer be changed.
                      </p>
                    )}
                    {serialLockLoading && (
                      <p className="text-[11px] text-gray-400 mt-1">Checking serial lock…</p>
                    )}
                  </div>
                )}

                {/* 3) Format Type Name */}
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Format Type Name *</label>
                  <input
                    type="text"
                    value={letterFormatData.format_type_name}
                    onChange={(e) => setLetterFormatData({ ...letterFormatData, format_type_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    placeholder="e.g., Oil Change Reminder"
                    disabled={letterFormatSaving}
                    required
                  />
                </div>

                {/* 3b) Expiry Date */}
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">
                    Expiry Date <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={letterFormatData.expiry_date || ''}
                    onChange={(e) => {
                      const newExpiry = e.target.value;
                      if (newExpiry && isPastDate(newExpiry)) {
                        toast.error('Expiry Date cannot be a past date. Please select today or a future date.');
                        return;
                      }
                      setLetterFormatData({ ...letterFormatData, expiry_date: newExpiry });
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black"
                    style={{ '--tw-ring-color': themeColor }}
                    disabled={letterFormatSaving}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Date after which this letter format should no longer be used. Cannot be a past date.
                  </p>
                </div>

                {/* 4) Customer Detail Fields — checkboxes */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <label className="block text-xs font-semibold text-black mb-2">
                    Customer Details to show in Reference{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 max-sm:grid-cols-1">
                    {CUSTOMER_DETAIL_OPTIONS.map(opt => {
                      const isDefault = opt.value === 'instance_id';
                      return (
                        <label key={opt.value} className={`flex items-center gap-2 group ${isDefault ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={isDefault ? true : (letterFormatData.customer_detail_fields || []).includes(opt.value)}
                            onChange={() => {
                              if (isDefault) return;
                              toggleLetterCheckbox('customer_detail_fields', opt.value);
                            }}
                            className="rounded border-gray-300"
                            style={{ accentColor: themeColor }}
                            disabled={letterFormatSaving || isDefault}
                          />
                          <span className={`text-xs transition-colors ${isDefault ? 'text-[#2f3192] font-semibold' : 'text-black group-hover:text-[#2f3192]'}`}>
                            {opt.label}{isDefault && <span className="ml-1 text-[10px] text-gray-400 font-normal">(default)</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* 5) Start Paragraph */}
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">Start Paragraph:</label>
                  <textarea
                    value={letterFormatData.start_para}
                    onChange={(e) => setLetterFormatData({ ...letterFormatData, start_para: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black leading-relaxed"
                    style={{ '--tw-ring-color': themeColor, minHeight: '150px' }}
                    placeholder={"Opening paragraph..."}
                    disabled={letterFormatSaving}
                  />
                </div>

                {/* 5b) CSP-only Service Cycle — shows ONLY when the selected product contains "csp".
                    Ships default Service Cycle rows used by the Send Letter wizard. */}
                {isCspService(letterFormatData.products[0]) && (
                  <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-black cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!letterFormatData.include_service_cycle}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLetterFormatData(prev => ({
                              ...prev,
                              include_service_cycle: true,
                              // seed ONE default row the first time it's enabled
                              service_cycle_rows: (prev.service_cycle_rows && prev.service_cycle_rows.length > 0)
                                ? prev.service_cycle_rows
                                : [blankServiceCycleRow()]
                            }));
                          } else {
                            setLetterFormatData(prev => ({ ...prev, include_service_cycle: false }));
                          }
                        }}
                        className="rounded border-gray-300"
                        style={{ accentColor: themeColor }}
                        disabled={letterFormatSaving}
                      />
                      Include Service Cycle <span className="text-gray-400 font-normal">(CSP only)</span>
                    </label>

                    {letterFormatData.include_service_cycle && (
                      <div className="pt-1 space-y-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-0.5">Intro text (editable)</label>
                          <textarea
                            value={letterFormatData.service_cycle_intro}
                            onChange={(e) => setLetterFormatData({ ...letterFormatData, service_cycle_intro: e.target.value })}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-[12px] leading-relaxed bg-white text-black"
                            rows={2}
                            disabled={letterFormatSaving}
                          />
                        </div>

                        <div className="overflow-x-auto border border-gray-300 rounded-lg bg-white shadow-sm">
                          <table className="w-full text-[11px] border-collapse max-md:min-w-[480px]">
                            <thead>
                              <tr className="bg-gradient-to-b from-gray-50 to-gray-100 text-gray-600">
                                {SERVICE_CYCLE_COLS.map(c => (
                                  <th key={c.key} className="px-2.5 py-2 text-left font-semibold uppercase tracking-wide text-[10px] border border-gray-300 whitespace-nowrap">
                                    {c.label}
                                  </th>
                                ))}
                                <th className="px-1 py-2 text-center font-semibold border border-gray-300 w-[36px]"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(letterFormatData.service_cycle_rows || []).map((row, idx) => (
                                <tr key={idx} className="align-top hover:bg-[#2f3192]/[0.03] transition-colors">
                                  <td className="p-0 border border-gray-300 align-top focus-within:ring-1 focus-within:ring-inset focus-within:ring-[#2f3192] focus-within:bg-blue-50/40">
                                    <input
                                      value={row.service_type}
                                      onChange={(e) => setServiceCycleCell(idx, 'service_type', e.target.value)}
                                      className="w-full bg-transparent border-0 outline-none focus:ring-0 px-2.5 py-1.5 text-[11px] text-black placeholder-gray-300"
                                      placeholder="e.g. B Check"
                                      disabled={letterFormatSaving}
                                    />
                                  </td>
                                  <td className="p-0 border border-gray-300 align-top focus-within:ring-1 focus-within:ring-inset focus-within:ring-[#2f3192] focus-within:bg-blue-50/40">
                                    <AutoGrowTextarea
                                      value={row.schedule}
                                      onChange={(e) => setServiceCycleCell(idx, 'schedule', e.target.value)}
                                      className="w-full block bg-transparent border-0 outline-none focus:ring-0 px-2.5 py-1.5 text-[11px] text-black placeholder-gray-300"
                                      minRows={2}
                                      placeholder="e.g. Each 500 hours or 12 months"
                                      disabled={letterFormatSaving}
                                    />
                                  </td>
                                  <td className="p-0 border border-gray-300 align-top focus-within:ring-1 focus-within:ring-inset focus-within:ring-[#2f3192] focus-within:bg-blue-50/40">
                                    <AutoGrowTextarea
                                      value={row.remarks}
                                      onChange={(e) => setServiceCycleCell(idx, 'remarks', e.target.value)}
                                      className="w-full block bg-transparent border-0 outline-none focus:ring-0 px-2.5 py-1.5 text-[11px] text-black placeholder-gray-300"
                                      minRows={2}
                                      placeholder="Remarks"
                                      disabled={letterFormatSaving}
                                    />
                                  </td>
                                  <td className="p-0 border border-gray-300 text-center align-middle">
                                    <button type="button" title="Remove this row"
                                      onClick={() => removeServiceCycleRow(idx)}
                                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded p-1 transition-colors"
                                      disabled={letterFormatSaving}>
                                      <XMarkIcon className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {(letterFormatData.service_cycle_rows || []).length === 0 && (
                                <tr>
                                  <td colSpan="4" className="px-2 py-3 text-center text-[10px] text-gray-400 border border-gray-300">
                                    No rows. Click "Add Row" to start.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <button type="button" onClick={addServiceCycleRow}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-white rounded-md hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: themeColor }}
                          disabled={letterFormatSaving}>
                          <PlusIcon className="h-3 w-3" /> Add Row
                        </button>
                        <p className="text-[11px] text-gray-500">
                          These default rows appear in the Send Letter wizard for CSP letters and can still be edited there per customer.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 6) Engagement Details — checkboxes (after start paragraph) */}
                <div className="border border-gray-200 rounded-lg p-3">
                  <label className="block text-xs font-semibold text-black mb-2">
                    Engagement Details{' '}
                    <span className="text-gray-400 font-normal">(optional — shown between paragraphs)</span>
                  </label>
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                    {ENGAGEMENT_DETAIL_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={(letterFormatData.engagement_detail_fields || []).includes(opt.value)}
                          onChange={() => toggleLetterCheckbox('engagement_detail_fields', opt.value)}
                          className="rounded border-gray-300"
                          style={{ accentColor: themeColor }}
                          disabled={letterFormatSaving}
                        />
                        <span className="text-xs text-black group-hover:text-[#2f3192] transition-colors">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 7) End Paragraph */}
                <div>
                  <label className="block text-xs font-semibold text-black mb-1">End Paragraph:</label>
                  <textarea
                    value={letterFormatData.end_para}
                    onChange={(e) => setLetterFormatData({ ...letterFormatData, end_para: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 transition-all bg-white text-black leading-relaxed"
                    style={{ '--tw-ring-color': themeColor, minHeight: '150px' }}
                    placeholder={"Closing paragraph..."}
                    disabled={letterFormatSaving}
                  />
                </div>

                {/* 8) Default To/CC Recipients */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecipientForm(prev => {
                        if (!prev && recipientRules.length === 0) {
                          setRecipientRules([blankRule()]);
                        }
                        return !prev;
                      });
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-all"
                    disabled={letterFormatSaving}
                  >
                    <div className="flex items-center gap-2">
                      <EnvelopeIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                      <span className="text-xs font-semibold text-black">Add default To/CC</span>
                      {recipientRules.length > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-[#2f3192] text-white rounded-full text-[10px] font-semibold">
                          {recipientRules.length} rule{recipientRules.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-400 text-xs">{showRecipientForm ? '▲ collapse' : '▼ expand'}</span>
                  </button>

                  {showRecipientForm && (
                    <div className="p-3 space-y-4 border-t border-gray-100">
                      <p className="text-[11px] text-gray-500">
                        Note: Set default To/CC email addresses per branch and GOEM. Branches not assigned to any rule will use their Branch Email Master address. Leave branch checkboxes empty on a rule to apply it to all remaining unmatched branches.
                      </p>

                      {recipientRules.map((rule, ruleIdx) => {
                        const claimed = getClaimedBranches(rule._key);
                        const available = BRANCH_LIST.filter(b => !claimed.has(b.code));
                        const isLast = ruleIdx === recipientRules.length - 1;

                        return (
                          <div key={rule._key} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
                            {/* Rule header */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-[#2f3192]">
                                Rule {ruleIdx + 1}
                                {rule.branch_codes.length === 0
                                  ? <span className="ml-1 text-[10px] text-gray-400 font-normal">(applies to all remaining branches)</span>
                                  : <span className="ml-1 text-[10px] text-gray-400 font-normal">({rule.branch_codes.length} branch{rule.branch_codes.length > 1 ? 'es' : ''})</span>
                                }
                              </span>
                              <button
                                type="button"
                                onClick={() => removeRecipientRule(rule._key)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                title="Remove this rule"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Branch checkboxes */}
                            <div>
                              <p className="text-[11px] font-semibold text-black mb-1.5">
                                Branches
                              </p>
                              {available.length === 0 ? (
                                <p className="text-[11px] text-gray-400 italic">All branches assigned to earlier rules.</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-sm:grid-cols-1">
                                  {available.map(b => (
                                    <label key={b.code} className="flex items-center gap-1.5 cursor-pointer group">
                                      <input
                                        type="checkbox"
                                        checked={rule.branch_codes.includes(b.code)}
                                        onChange={() => toggleBranchInRule(rule._key, b.code)}
                                        className="rounded border-gray-300"
                                        style={{ accentColor: themeColor }}
                                        disabled={letterFormatSaving}
                                      />
                                      <span className="text-[11px] text-black group-hover:text-[#2f3192] transition-colors leading-tight">
                                        <span className="font-mono text-gray-400">{b.code}</span> {b.name}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* GOEM multi-select */}
                            <div>
                              <label className="block text-[11px] font-semibold text-black mb-1">
                                GOEM / OEM Filter <span className="text-gray-400 font-normal">(optional — add one or more; leave empty for all)</span>
                              </label>
                              <div className="flex gap-1.5 mb-1.5">
                                <select
                                  value={rule._goemSelect || ''}
                                  onChange={(e) => updateRuleField(rule._key, '_goemSelect', e.target.value)}
                                  className="flex-1 border border-gray-300 rounded-md px-2.5 py-1.5 text-xs bg-white text-black focus:ring-2 transition-all"
                                  style={{ '--tw-ring-color': themeColor }}
                                  disabled={letterFormatSaving}
                                >
                                  <option value="">— Select GOEM —</option>
                                  {goemOemList
                                    .filter(g => !rule.goem_oems.includes(g))
                                    .map(g => (
                                      <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => addGoemToRule(rule._key)}
                                  className="px-2.5 py-1.5 text-xs text-white rounded-md transition-all disabled:opacity-50"
                                  style={{ background: themeColor }}
                                  disabled={letterFormatSaving || !rule._goemSelect}
                                >
                                  Add
                                </button>
                              </div>
                              {rule.goem_oems.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {rule.goem_oems.map(g => (
                                    <span key={g} className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[11px] font-medium">
                                      {g}
                                      <button type="button" onClick={() => removeGoemFromRule(rule._key, g)}>
                                        <XMarkIcon className="h-3 w-3 hover:text-orange-900" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-gray-400">No GOEM filter — applies to all GOEMs</p>
                              )}
                            </div>

                            {/* To emails */}
                            <div>
                              <label className="block text-[11px] font-semibold text-black mb-1">To Emails</label>
                              <div className="flex gap-1.5 mb-1.5">
                                <input
                                  type="text"
                                  value={rule._toInput}
                                  onChange={(e) => updateRuleField(rule._key, '_toInput', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addEmailToRule(rule._key, 'to_emails', '_toInput', '_toError');
                                    }
                                  }}
                                  placeholder="email@example.com"
                                  className={`flex-1 border rounded-md px-2.5 py-1.5 text-xs bg-white text-black focus:ring-2 transition-all ${rule._toError ? 'border-red-400' : 'border-gray-300'}`}
                                  style={{ '--tw-ring-color': themeColor }}
                                  disabled={letterFormatSaving}
                                />
                                <button
                                  type="button"
                                  onClick={() => addEmailToRule(rule._key, 'to_emails', '_toInput', '_toError')}
                                  className="px-2.5 py-1.5 text-xs text-white rounded-md transition-all"
                                  style={{ background: themeColor }}
                                  disabled={letterFormatSaving}
                                >
                                  Add
                                </button>
                              </div>
                              {rule._toError && <p className="text-[10px] text-red-500 mb-1">{rule._toError}</p>}
                              {rule.to_emails.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {rule.to_emails.map(email => (
                                    <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px]">
                                      {email}
                                      <button type="button" onClick={() => removeEmailFromRule(rule._key, 'to_emails', email)}>
                                        <XMarkIcon className="h-3 w-3 hover:text-blue-600" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {rule.to_emails.length === 0 && <p className="text-[10px] text-gray-400">No To emails added</p>}
                            </div>

                            {/* CC emails */}
                            <div>
                              <label className="block text-[11px] font-semibold text-black mb-1">CC Emails</label>
                              <div className="flex gap-1.5 mb-1.5">
                                <input
                                  type="text"
                                  value={rule._ccInput}
                                  onChange={(e) => updateRuleField(rule._key, '_ccInput', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      addEmailToRule(rule._key, 'cc_emails', '_ccInput', '_ccError');
                                    }
                                  }}
                                  placeholder="email@example.com"
                                  className={`flex-1 border rounded-md px-2.5 py-1.5 text-xs bg-white text-black focus:ring-2 transition-all ${rule._ccError ? 'border-red-400' : 'border-gray-300'}`}
                                  style={{ '--tw-ring-color': themeColor }}
                                  disabled={letterFormatSaving}
                                />
                                <button
                                  type="button"
                                  onClick={() => addEmailToRule(rule._key, 'cc_emails', '_ccInput', '_ccError')}
                                  className="px-2.5 py-1.5 text-xs text-white rounded-md transition-all"
                                  style={{ background: themeColor }}
                                  disabled={letterFormatSaving}
                                >
                                  Add
                                </button>
                              </div>
                              {rule._ccError && <p className="text-[10px] text-red-500 mb-1">{rule._ccError}</p>}
                              {rule.cc_emails.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {rule.cc_emails.map(email => (
                                    <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded text-[11px]">
                                      {email}
                                      <button type="button" onClick={() => removeEmailFromRule(rule._key, 'cc_emails', email)}>
                                        <XMarkIcon className="h-3 w-3 hover:text-green-600" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {rule.cc_emails.length === 0 && <p className="text-[10px] text-gray-400">No CC emails added</p>}
                            </div>
                          </div>
                        );
                      })}

                      {/* Add another rule button */}
                      {(() => {
                        // Count all branches claimed across ALL rules
                        const allClaimed = new Set(
                          recipientRules.flatMap(r => r.branch_codes)
                        );
                        const allBranchesClaimed = allClaimed.size >= BRANCH_LIST.length;
                        // Also disable if any existing rule has branch_codes = [] (catches all remaining)
                        const hasOpenRule = recipientRules.some(r => r.branch_codes.length === 0);
                        const isDisabled = letterFormatSaving || allBranchesClaimed || hasOpenRule;

                        return (
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={addRecipientRule}
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md text-xs font-medium transition-all ${isDisabled
                                ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                                : 'border-[#2f3192] text-[#2f3192] hover:bg-[#2f3192]/5 cursor-pointer'
                                }`}
                              disabled={isDisabled}
                              title={
                                allBranchesClaimed
                                  ? 'All branches have been assigned to existing rules'
                                  : hasOpenRule
                                    ? 'A rule with no branch selected already covers all remaining branches'
                                    : 'Add another branch rule'
                              }
                            >
                              <PlusIcon className="h-3.5 w-3.5" />
                              Add Another Branch Rule
                            </button>
                            {(allBranchesClaimed || hasOpenRule) && (
                              <p className="text-[10px] text-gray-400 text-center">
                                {allBranchesClaimed
                                  ? 'All 14 branches have been assigned — no more rules can be added.'
                                  : 'A catch-all rule (no branch selected) already covers all remaining branches.'}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* 9) Default Attachment */}
                <div>
                  <label className="block text-xs font-semibold text-black mb-1.5">Default Attachment</label>
                  <input type="file" multiple accept=".mp4,.jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.xls,.csv" onChange={handleLetterAttachmentUpload} className="hidden" id="letter-attach-upload" disabled={letterFormatSaving || letterFormatHydrating} />
                  <label htmlFor="letter-attach-upload"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed rounded-md cursor-pointer transition-all hover:border-[#2f3192]"
                    style={{ borderColor: themeColor }}>
                    <PaperClipIcon className="h-4 w-4" style={{ color: themeColor }} />
                    <span className="text-sm text-black">Attach files (optional)</span>
                  </label>
                  <p className="text-[11px] text-gray-500 mt-1">mp4, jpg, png, pdf, word, excel — single, multiple or none.</p>

                  {letterFormatHydrating && (
                    <p className="text-[11px] text-[#2f3192] mt-1 flex items-center gap-1">
                      <ArrowPathIcon className="h-3 w-3 animate-spin" /> Loading existing attachments…
                    </p>
                  )}

                  {letterFormatData.default_attachments.length > 0 && (
                    <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto p-2 bg-gray-50 rounded-md">
                      {letterFormatData.default_attachments.map((att, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-white rounded-md border">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <DocumentIcon className="h-3.5 w-3.5 text-[#2f3192] shrink-0" />
                            <span className="text-xs text-black truncate">{att.name}</span>
                            <span className="text-xs text-gray-500 shrink-0">({(att.size / 1024).toFixed(0)} KB)</span>
                          </div>
                          <button type="button" onClick={() => removeLetterAttachment(index)} disabled={letterFormatSaving || letterFormatHydrating} className="text-red-500 hover:text-red-700 shrink-0 ml-1 disabled:opacity-40 disabled:cursor-not-allowed">
                            <XMarkIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => !letterFormatSaving && setShowLetterFormatForm(false)} disabled={letterFormatSaving}
                    className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={letterFormatSaving || letterFormatHydrating || !letterFormatData.format_type_name.trim()}
                    className="flex-1 text-white font-medium rounded-md py-1 text-sm hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                    {letterFormatSaving ? (<><ArrowPathIcon className="h-4 w-4 animate-spin" /> Saving...</>) : 'Save Format'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Letter Format Modal */}
        {showLetterFormatView && viewingLetterFormat && (
          <div className="fixed inset-0 flex items-end lg:items-center justify-center z-[60] p-3">
            <div
              className="absolute inset-0 backdrop-blur-sm bg-black/30"
              onClick={() => setShowLetterFormatView(false)}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full lg:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
              <div className="sticky top-0 px-4 py-3 lg:px-5 lg:py-3.5 rounded-t-xl flex justify-between items-center z-10"
                style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <EyeIcon className="h-4 w-4 text-white shrink-0" />
                  <h2 className="text-sm lg:text-base font-semibold text-white truncate">{viewingLetterFormat.format_type_name}</h2>
                </div>
                <button onClick={() => setShowLetterFormatView(false)} className="w-7 h-7 bg-white text-black rounded-lg flex items-center justify-center hover:bg-gray-100">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 lg:p-5 overflow-y-auto custom-scrollbar space-y-4">

                {/* Product */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Products</p>
                  {(viewingLetterFormat.products || []).length === 0 ? (
                    <span className="text-sm text-gray-400">None</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {viewingLetterFormat.products.map((p, idx) => (
                        <span key={idx} className="inline-flex items-center px-2 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded text-xs font-medium">{p}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Note */}
                {viewingLetterFormat.note && (
                  <div>
                    <p className="text-xs font-semibold text-black mb-1.5">Note</p>
                    <div className="border border-gray-200 rounded-md p-2.5 bg-yellow-50">
                      <p className="text-sm text-black whitespace-pre-wrap break-words">{viewingLetterFormat.note}</p>
                    </div>
                  </div>
                )}

                {/* Reference No + Serial Start */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Reference No</p>
                  {viewingLetterFormat.reference_no ? (
                    <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-1">
                      {viewingLetterFormat.reference_no.split('/').map((part, idx, arr) => {
                        const labels = ['Prefix', 'FY', 'Product', 'Branch Code', 'Serial No'];
                        const isSerialNo = idx === arr.length - 1;
                        return (
                          <React.Fragment key={idx}>
                            <div className="flex flex-col shrink-0">
                              <span className="text-[10px] text-gray-500 mb-0.5">{labels[idx] || `Part ${idx + 1}`}</span>
                              <div className={`border rounded-md px-2 py-1.5 text-sm text-center font-mono ${isSerialNo ? 'border-[#2f3192] bg-[#2f3192]/5 text-[#2f3192] font-semibold' : 'border-gray-200 bg-gray-50 text-black'}`}
                                style={{ minWidth: '90px' }}>
                                {isSerialNo ? (viewingLetterFormat.serial_start || '1') : part}
                              </div>
                            </div>
                            {idx < arr.length - 1 && (
                              <span className="text-gray-400 font-bold self-end mb-2">/</span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : <span className="text-sm text-gray-400">—</span>}
                </div>

                {/* Format Type Name */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Format Type Name</p>
                  <span className="text-sm text-black">{viewingLetterFormat.format_type_name || '—'}</span>
                </div>

                {/* Expiry Date */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Expiry Date</p>
                  <span className="text-sm text-black">
                    {viewingLetterFormat.expiry_date ? formatDate(viewingLetterFormat.expiry_date) : '—'}
                  </span>
                </div>

                {/* Customer Detail Fields */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Customer Details in Reference</p>
                  {(viewingLetterFormat.customer_detail_fields || []).length === 0 ? (
                    <span className="text-sm text-gray-400">None selected</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {['instance_id', ...(viewingLetterFormat.customer_detail_fields || []).filter(f => f !== 'instance_id')].map((val, idx) => {
                        const CUSTOMER_DETAIL_OPTIONS = [
                          { value: 'instance_id', label: 'Instance ID' },
                          { value: 'account_name', label: 'Account Name' },
                          { value: 'kva_rating', label: 'KVA Rating' },
                          { value: 'commissioning_date', label: 'Commissioning Date' },
                          { value: 'application_code', label: 'Application Code' },
                          { value: 'engine_no', label: 'Engine No.' },
                          { value: 'engine_model', label: 'Engine Model' },
                          { value: 'warranty_expiry', label: 'Warranty Expiry' },
                          { value: 'product_segment', label: 'Product Segment' },
                          { value: 'engine_series', label: 'Engine Series' },
                          { value: 'segment', label: 'Segment' },
                        ];
                        const opt = CUSTOMER_DETAIL_OPTIONS.find(o => o.value === val);
                        const isDefault = val === 'instance_id';
                        return (
                          <span key={idx} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${isDefault ? 'bg-[#2f3192] text-white' : 'bg-[#2f3192]/10 text-[#2f3192]'}`}>
                            {opt ? opt.label : val}
                            {isDefault && <span className="text-[10px] opacity-75">(default)</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Start Paragraph */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Start Para</p>
                  <div className="border border-gray-200 rounded-md p-3 bg-gray-50 max-h-[30vh] overflow-y-auto">
                    {viewingLetterFormat.start_para ? (
                      <pre className="text-sm text-black whitespace-pre-wrap break-words font-sans leading-relaxed">{viewingLetterFormat.start_para}</pre>
                    ) : <span className="text-sm text-gray-400">No start paragraph provided</span>}
                  </div>
                </div>

                {/* Service Cycle (CSP only) */}
                {viewingLetterFormat.include_service_cycle && (
                  <div>
                    <p className="text-xs font-semibold text-black mb-1.5">Service Cycle (CSP)</p>
                    {viewingLetterFormat.service_cycle_intro && (
                      <p className="text-[12px] text-gray-600 whitespace-pre-wrap mb-1.5">{viewingLetterFormat.service_cycle_intro}</p>
                    )}
                    {(viewingLetterFormat.service_cycle_rows || []).length === 0 ? (
                      <span className="text-sm text-gray-400">No rows configured</span>
                    ) : (
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-[11px] max-md:min-w-[420px]">
                          <thead className="bg-gray-100">
                            <tr>
                              {SERVICE_CYCLE_COLS.map(c => (
                                <th key={c.key} className="px-2 py-1 text-left font-semibold text-black border-r border-gray-200 whitespace-nowrap">{c.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {viewingLetterFormat.service_cycle_rows.map((row, idx) => (
                              <tr key={idx} className="border-t border-gray-100 align-top">
                                <td className="px-2 py-1 border-r border-gray-100 text-black">{row.service_type || '-'}</td>
                                <td className="px-2 py-1 border-r border-gray-100 text-black whitespace-pre-wrap">{row.schedule || '-'}</td>
                                <td className="px-2 py-1 border-r border-gray-100 text-black whitespace-pre-wrap">{row.remarks || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Engagement Detail Fields */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Engagement Details</p>
                  {(viewingLetterFormat.engagement_detail_fields || []).length === 0 ? (
                    <span className="text-sm text-gray-400">None selected</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(viewingLetterFormat.engagement_detail_fields || []).map((val, idx) => {
                        const ENGAGEMENT_DETAIL_OPTIONS = [
                          { value: 'followup_history', label: 'Followups History' },
                          { value: 'quotation_history', label: 'Quotation History' },
                          { value: 'letter_history', label: 'Letter History' },
                        ];
                        const opt = ENGAGEMENT_DETAIL_OPTIONS.find(o => o.value === val);
                        return (
                          <span key={idx} className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                            {opt ? opt.label : val}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* End Paragraph */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">End Para</p>
                  <div className="border border-gray-200 rounded-md p-3 bg-gray-50 max-h-[30vh] overflow-y-auto">
                    {viewingLetterFormat.end_para ? (
                      <pre className="text-sm text-black whitespace-pre-wrap break-words font-sans leading-relaxed">{viewingLetterFormat.end_para}</pre>
                    ) : <span className="text-sm text-gray-400">No end paragraph provided</span>}
                  </div>
                </div>

                {/* Default Recipients */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Default To/CC Recipients</p>
                  {(viewingLetterFormat.default_recipients || []).length === 0 ? (
                    <span className="text-sm text-gray-400">None configured</span>
                  ) : (
                    <div className="space-y-2">
                      {(viewingLetterFormat.default_recipients || []).map((rule, idx) => (
                        <div key={idx} className="border border-gray-200 rounded-md p-2.5 bg-gray-50 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[#2f3192]">Rule {idx + 1}:</span>
                            {(rule.branch_codes || []).length === 0 ? (
                              <span className="text-[11px] text-gray-500 italic">All remaining branches</span>
                            ) : (
                              (rule.branch_codes || []).map(code => {
                                const branch = BRANCH_LIST.find(b => b.code === code);
                                return (
                                  <span key={code} className="inline-flex items-center px-1.5 py-0.5 bg-[#2f3192]/10 text-[#2f3192] rounded text-[10px] font-medium">
                                    {branch ? branch.name : code}
                                  </span>
                                );
                              })
                            )}
                            {(rule.goem_oems && rule.goem_oems.length > 0
                              ? rule.goem_oems
                              : (rule.goem_oem ? [rule.goem_oem] : [])
                            ).map(g => (
                              <span key={g} className="inline-flex items-center px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">
                                GOEM: {g}
                              </span>
                            ))}
                          </div>
                          {(rule.to_emails || []).length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[10px] font-semibold text-gray-500">To:</span>
                              {rule.to_emails.map(e => (
                                <span key={e} className="text-[11px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">{e}</span>
                              ))}
                            </div>
                          )}
                          {(rule.cc_emails || []).length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[10px] font-semibold text-gray-500">CC:</span>
                              {rule.cc_emails.map(e => (
                                <span key={e} className="text-[11px] px-1.5 py-0.5 bg-green-100 text-green-800 rounded">{e}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Default Attachments */}
                <div>
                  <p className="text-xs font-semibold text-black mb-1.5">Default Attachments</p>
                  {(viewingLetterFormat.default_attachments || []).length === 0 ? (
                    <span className="text-sm text-gray-400">None</span>
                  ) : (
                    <div className="space-y-1.5">
                      {viewingLetterFormat.default_attachments.map((att, idx) => (
                        att.content ? (
                          <a key={idx} href={`data:${att.type};base64,${att.content}`} download={att.name}
                            className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border hover:bg-gray-100 transition-all">
                            <DocumentIcon className="h-3.5 w-3.5 text-[#2f3192] shrink-0" />
                            <span className="text-xs text-black truncate flex-1">{att.name}</span>
                            <span className="text-xs text-gray-500">({(att.size / 1024).toFixed(0)} KB)</span>
                          </a>
                        ) : (
                          <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border opacity-70">
                            <DocumentIcon className="h-3.5 w-3.5 text-[#2f3192] shrink-0" />
                            <span className="text-xs text-black truncate flex-1">{att.name}</span>
                            {letterFormatHydrating
                              ? <ArrowPathIcon className="h-3 w-3 animate-spin text-gray-400" />
                              : <span className="text-xs text-gray-500">({(att.size / 1024).toFixed(0)} KB)</span>}
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>

              </div>

              <div className="px-4 lg:px-5 py-3 border-t flex justify-end gap-2">
                <button onClick={() => { setShowLetterFormatView(false); openEditLetterFormat(viewingLetterFormat); }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white font-medium rounded-md transition-all"
                  style={{ background: "#2f3192" }}>
                  <PencilIcon className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => setShowLetterFormatView(false)}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-md text-black hover:bg-gray-50 transition-all">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Campaigns Grid with Optimized Loading */}
        <div className={campaignView === 'table' ? 'mb-6' : 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6'}>
          {/* Show loading skeletons while campaigns are being loaded */}
          {loading && campaigns.length === 0 && (
            <>
              <CampaignSkeleton />
              <CampaignSkeleton />
              <CampaignSkeleton />
              <CampaignSkeleton />
            </>
          )}

          {/* TABLE VIEW — every drive as one row */}
          {!loading && campaignView === 'table' && filteredCampaigns.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden animate-cardIn">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b-2 border-gray-200">
                      <th className="px-3 py-2 text-center font-bold text-black w-12">Sr.</th>
                      <th className="px-3 py-2 text-left font-bold text-black">Drive Name</th>
                      <th className="px-3 py-2 text-left font-bold text-black">Service / Product</th>
                      <th className="px-3 py-2 text-center font-bold text-black">Status</th>
                      <th className="px-3 py-2 text-center font-bold text-black whitespace-nowrap">Start Date</th>
                      <th className="px-3 py-2 text-center font-bold text-black whitespace-nowrap">End Date</th>
                      <th className="px-3 py-2 text-center font-bold text-black">Assets</th>
                      <th className="px-3 py-2 text-center font-bold text-black">Pending</th>
                      <th className="px-3 py-2 text-center font-bold text-black">Completed</th>
                      <th className="px-3 py-2 text-left font-bold text-black whitespace-nowrap">Created By</th>
                      <th className="px-3 py-2 text-center font-bold text-black">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCampaigns.map((campaign, index) => (
                      <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-center text-black tabular-nums">{index + 1}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleCampaignClick(campaign)}
                            className="flex items-center gap-2 font-semibold text-black hover:underline text-left"
                            title="Open drive"
                          >
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: campaign.color || themeColor }} />
                            <span className="truncate max-w-[260px]" title={campaign.name}>{campaign.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-[11px] font-medium px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full whitespace-nowrap">
                            {campaign.service}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] capitalize ${getStatusBadgeClass(campaign.status)}`}>
                            {campaign.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-black whitespace-nowrap">{formatDate(campaign.start_date)}</td>
                        <td className="px-3 py-2 text-center text-black whitespace-nowrap">{campaign.end_date ? formatDate(campaign.end_date) : 'Ongoing'}</td>
                        <td className="px-3 py-2 text-center text-black tabular-nums">{campaign.asset_numbers?.length || 0}</td>
                        <td className="px-3 py-2 text-center text-black tabular-nums">
                          {campaignCounts[campaign.id]?.pending !== undefined
                            ? campaignCounts[campaign.id].pending
                            : campaign.asset_numbers?.length || 0}
                        </td>
                        <td className="px-3 py-2 text-center text-green-600 font-semibold tabular-nums">
                          {campaignCounts[campaign.id]?.completed || 0}
                        </td>
                        <td className="px-3 py-2 text-black whitespace-nowrap">{campaign.created_by_name || '-'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={(e) => openFollowupModal(campaign, e)}
                              className="px-2 py-1 text-[10px] font-medium text-white bg-[#2f3192] rounded-md hover:bg-[#2f3192]/90 transition-all whitespace-nowrap"
                              title="View customer follow-ups"
                            >
                              View All
                            </button>
                            <button
                              onClick={(e) => openEditModal(campaign, e)}
                              className="p-1 rounded-md hover:bg-gray-100 transition-all"
                              title="Edit drive"
                            >
                              <PencilIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                            </button>
                            {campaign.status === 'inactive' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openDeleteCampaignConfirm(campaign); }}
                                className="p-1 rounded-md hover:bg-red-50 transition-all"
                                title="Delete drive"
                              >
                                <TrashIcon className="h-3.5 w-3.5 text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-50 border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-500 text-center">
                {filteredCampaigns.length} drive{filteredCampaigns.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* Show campaigns progressively — first batch instantly, rest stream in */}
          {!loading && campaignView === 'grid' && visibleCampaigns.map((campaign, index) => (
            <div
              key={campaign.id}
              className="animate-cardIn"
              style={{ animationDelay: `${(index % 8) * 70}ms` }}
            >
              <div className="group bg-white rounded-xl shadow-md overflow-hidden flex flex-col h-[250px] transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                <div className="px-3 py-2 flex justify-between items-center shrink-0" style={{ backgroundColor: campaign.color || themeColor }}>
                  <h3
                    className="font-semibold text-white text-sm lg:text-base truncate pr-2 hover:underline cursor-pointer"
                    onClick={() => handleCampaignClick(campaign)}
                  >
                    {campaign.name}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${getStatusBadgeClass(campaign.status)}`}>
                      {campaign.status}
                    </span>
                    <button
                      onClick={(e) => openEditModal(campaign, e)}
                      className="p-1 text-white hover:bg-white/20 rounded-md transition-all"
                      title="Edit drive"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    {campaign.status === 'inactive' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openDeleteCampaignConfirm(campaign); }}
                        className="p-1 text-white hover:bg-white/20 rounded-md transition-all"
                        title="Delete drive"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  <div className="mb-3">
                    <p className="text-sm text-black break-words whitespace-pre-wrap">
                      {campaign.description || 'No description provided'}
                    </p>
                  </div>

                  {campaign.scripts && campaign.scripts.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-black mb-1">Scripts ({campaign.scripts?.length || 0}):</p>
                      <div className="flex flex-wrap gap-2">
                        {campaign.scripts?.slice(0, 2).map((script, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs text-black">
                            <DocumentIcon className="h-3 w-3 text-red-500 shrink-0" />
                            <span className="truncate max-w-[150px]">{script.name}</span>
                          </div>
                        ))}
                        {campaign.scripts?.length > 2 && (
                          <p className="text-xs text-black">+{campaign.scripts.length - 2} more</p>
                        )}
                      </div>
                    </div>
                  )}

                  {campaign.created_by_name && (
                    <div className="mb-2 text-xs text-black">
                      Created by: {campaign.created_by_name} {campaign.created_by_id && `(ID: ${campaign.created_by_id})`}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-3 max-sm:grid-cols-1">
                    <div className="flex items-center gap-1.5 text-sm min-w-0">
                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" style={{ color: themeColor }} />
                      <span className="text-black truncate">
                        Start: {formatDate(campaign.start_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm min-w-0">
                      <ClockIcon className="h-3.5 w-3.5 shrink-0" style={{ color: themeColor }} />
                      <span className="text-black truncate">
                        End: {campaign.end_date ? formatDate(campaign.end_date) : 'Ongoing'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t mt-auto max-sm:flex-wrap max-sm:gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full truncate max-w-[120px]">
                        {campaign.service}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      <button
                        onClick={(e) => openFollowupModal(campaign, e)}
                        className="px-2 py-1 text-xs font-medium text-white bg-[#2f3192] rounded-md hover:bg-[#2f3192]/90 transition-all whitespace-nowrap"
                        title="View customer follow-ups"
                      >
                        View All
                      </button>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-sm text-black" title="Pending Follow-ups">
                          <UserGroupIcon className="h-3.5 w-3.5" style={{ color: themeColor }} />
                          <span>
                            {campaignCounts[campaign.id]?.pending !== undefined
                              ? campaignCounts[campaign.id].pending
                              : campaign.asset_numbers?.length || 0}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-sm text-green-600" title="Completed Follow-ups">
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                          <span>{campaignCounts[campaign.id]?.completed || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!loading && filteredCampaigns.length === 0 && campaigns.length === 0 && (
            <div className="col-span-1 lg:col-span-2 text-center py-10 bg-white rounded-xl">
              <MegaphoneIcon className="h-10 w-10 mx-auto mb-3" style={{ color: themeColor }} />
              <p className="text-sm text-black">No drives found</p>
              <button
                onClick={() => {
                  resetForm();
                  setShowCampaignForm(true);
                }}
                className="mt-2 text-sm font-medium hover:underline"
                style={{ color: themeColor }}
              >
                Create your first drive
              </button>
            </div>
          )}

          {!loading && filteredCampaigns.length === 0 && campaigns.length > 0 && (
            <div className="col-span-1 lg:col-span-2 text-center py-10 bg-white rounded-xl">
              <MagnifyingGlassIcon className="h-10 w-10 mx-auto mb-3" style={{ color: themeColor }} />
              <p className="text-sm text-black">No Drives match your search criteria</p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-sm font-medium hover:underline"
                style={{ color: themeColor }}
              >
                Clear search
              </button>
            </div>
          )}

          {showDeleteCampaignConfirm && campaignToDelete && (
            <div className="fixed inset-0 flex items-center justify-center z-50 p-3">
              <div
                className="absolute inset-0 backdrop-blur-sm bg-black/20"
                onClick={() => !deleteLoading && setShowDeleteCampaignConfirm(false)}
              />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-full bg-red-100">
                  <XMarkIcon className="h-7 w-7 text-red-500" />
                </div>
                <h2 className="text-base font-bold text-black mb-1">Delete Drive?</h2>
                <p className="text-sm text-gray-500 mb-1">
                  Are you really sure you want to permanently delete
                </p>
                <p className="text-sm font-semibold text-black mb-4">
                  "{campaignToDelete.name}"?
                </p>
                <p className="text-xs text-red-500 mb-5">
                  ⚠️ This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => !deleteLoading && setShowDeleteCampaignConfirm(false)}
                    disabled={deleteLoading}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-black hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    No, Keep it
                  </button>
                  <button
                    onClick={handleDeleteCampaign}
                    disabled={deleteLoading}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {deleteLoading ? (
                      <><ArrowPathIcon className="h-4 w-4 animate-spin" /> Deleting...</>
                    ) : 'Yes, Delete!'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Customer Follow-ups Modal */}
      <Suspense fallback={null}>
        <CampaignCustomersFollowupModal
          isOpen={showFollowupModal}
          onClose={() => {
            setShowFollowupModal(false);
            setSelectedCampaignForModal(null);
          }}
          campaign={selectedCampaignForModal}
          apiBaseUrl={API_BASE_URL}
        />
      </Suspense>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        
        .overflow-y-auto {
          scrollbar-width: thin;
        }

        @keyframes cardIn {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animate-cardIn {
          opacity: 0;
          animation: cardIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </div>
  );
};

export default Campaign;