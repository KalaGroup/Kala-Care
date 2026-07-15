import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PiHandshakeDuotone } from "react-icons/pi";
import Swal from 'sweetalert2';
import axios from 'axios';
import SitemapModal from './SitemapModal';
import { prefetchRoute } from '../routePrefetch';
import { applyTheme } from '../theme';

import {
  Bars3Icon,
  XMarkIcon,
  DocumentArrowUpIcon,
  UsersIcon,
  MegaphoneIcon,
  TableCellsIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  SunIcon,
  MoonIcon,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon,
  HomeIcon,
  CloudArrowUpIcon,
  UserGroupIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  CurrencyRupeeIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
  EyeIcon,
  PencilSquareIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { CiFlag1 } from "react-icons/ci";

// 'YYYY-MM' for an <input type="month"> from an ISO date string.
const isoToMonthInput = (iso) => (iso ? String(iso).slice(0, 7) : '');

// "Apr 2025" from an ISO date string (or a 'YYYY-MM' month value).
const formatMonthYear = (value) => {
  if (!value) return '';
  const iso = value.length === 7 ? `${value}-01` : value; // accept 'YYYY-MM'
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// Plain day number (e.g. 20250415) from 'YYYY-MM-DD' or an ISO datetime string.
// Comparing these as numbers avoids ALL timezone off-by-one issues in filters.
const toDayNum = (value) => {
  if (!value) return null;
  const digits = String(value).slice(0, 10).replace(/-/g, ''); // 'YYYYMMDD'
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
};

// Product/service name for a drive (handles the different field names backends use).
const productOf = (c) =>
  ((c?.service || c?.product || c?.product_name || '').trim() || '—');

// Short date for the drive list table, e.g. "Jan 5, 2026".
const formatDriveDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return 'Invalid Date';
  }
};

// ---- Static data hoisted to module scope so it isn't re-allocated on every
// render of the Navbar (which wraps every page). Pure constants only. ----

// Accent colors as CSS variables so NIGHT MODE can swap them (see index.css).
// Light-mode values are identical to the old hardcoded colors.
const themeColor = 'var(--erp-accent)';
const logoutColor = 'var(--erp-ink)';

// Generate shades of the theme color
const themeShades = {
  light: 'var(--erp-accent-light)',
  medium: 'var(--erp-accent-medium)',
  dark: 'var(--erp-accent-dark)',
};

// Main nav item list. Lives at module scope (hover state passed in as props)
// so its component identity is stable across Navbar re-renders — defined
// inline it remounted on every hover, replaying the label fade animation.
const NavLinks = ({ items, collapsed = false, onClick = () => { }, hoveredItem, setHoveredItem }) => (
  <nav className="space-y-0.5">
    {items.map((item) => (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onClick}
        onMouseEnter={() => setHoveredItem(item.path)}
        onMouseLeave={() => setHoveredItem(null)}
        className={({ isActive }) =>
          `group relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200 min-w-full w-max ${isActive
            ? 'text-gray-900 font-medium'
            : 'text-black hover:text-gray-900'
          } ${collapsed ? 'justify-center' : ''}`
        }
        style={({ isActive }) => ({
          backgroundColor: isActive ? themeShades.light : 'transparent',
          color: isActive ? themeColor : undefined
        })}
        title={collapsed ? item.name : ''}
      >
        {({ isActive }) => (
          <>
            <item.icon
              className={`
                h-3.5 w-3.5 transition-all duration-200 flex-shrink-0
                ${collapsed ? 'mx-auto' : ''}
              `}
              style={{
                color: isActive ? themeColor :
                  hoveredItem === item.path ? themeColor : '#6B7280'
              }}
            />

            {!collapsed && (
              <>
                <span className="nav-label-fade flex-1 text-sm font-medium whitespace-nowrap">
                  {item.name}
                </span>
              </>
            )}

            {/* Tooltip for collapsed mode */}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                {item.name}
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
              </div>
            )}
          </>
        )}
      </NavLink>
    ))}
  </nav>
);

// Branch mapping
const branchMap = {
  'HO': 'Pune Office',
  '420435_1': 'Ch.Sambhaji Nagar',
  '420435_2': 'Ahilyanagar',
  '420435_3': 'Beed',
  '420435_4': 'Nanded',
  '420435_5': 'Babhaleshwar',
  '420435_6': 'Latur',
  '420435_8': 'Hubli',
  '420435_9': 'Belagavi',
  '420435_10': 'Hospet',
  '420435_11': 'Ballari',
  '420435_12': 'Bagalkot',
  '420435_13': 'Gulbarga',
  '420435_14': 'Bijapur'
};

// Role display names
const roleMap = {
  'master_admin': 'Master Admin',
  'branch_admin': 'Branch Admin',
  'employee': 'Employee'
};

// Terminology data
const terminologyData = {
  statusIndicators: {
    title: "Status Indicators",
    items: [
      { symbol: "✓", meaning: "In Drive", description: "Customer is in drive" },
      { symbol: "T", meaning: "Transferred", description: "Customer tranferred from old drive" },
      { symbol: "W", meaning: "Work in Progress", description: "Ongoing" },
      { symbol: "C", meaning: "Completed", description: "Business converted" },
      { symbol: "R", meaning: "Rejected", description: "Rejected by customer" },
      { symbol: "F", meaning: "Followup", description: "Follow-up rescheduled" },
      { symbol: "NC", meaning: "Not Connected", description: "Call not connected during follow-up" }
    ]
  },
  flagIndicators: {
    title: "Follow-up Flags",
    items: [
      { symbol: "C1", meaning: "15 Days", description: "Follow-up within 15 days" },
      { symbol: "C2", meaning: "30 Days", description: "Follow-up within 30 days" },
      { symbol: "C3", meaning: "45 Days", description: "Follow-up within 45 days" },
      { symbol: "C4", meaning: "60 Days", description: "Follow-up within 60 days" },
      { symbol: "C5", meaning: "75 Days", description: "Follow-up within 75 days" },
      { symbol: "C6", meaning: "90 Days", description: "Follow-up within 90 days" },
      { symbol: "C7", meaning: "90+ Days", description: "Follow-up after 90 days" }
    ]
  }
};

// Customer Engagement dropdown items
const engagementItems = [
  {
    path: '/customer-engagement',
    name: 'Drive Data',
    description: 'Drive-based customer interactions',
    allowedRoles: ['master_admin', 'branch_admin', 'employee']
  },
  {
    path: '/customer-engagement-2',
    name: 'Non-Drive Data',
    description: 'Non-drive customer interactions',
    allowedRoles: ['master_admin', 'branch_admin', 'employee']
  }
];

const expenseTrackingItems = [
  {
    path: '/expense-dashboard',
    name: 'Dashboard',
    description: 'Expense Dashboard View',
    allowedRoles: ['master_admin', 'branch_admin', 'employee']
  },
  {
    path: '/expense',
    name: 'Expense',
    description: 'Expense Entry & Management',
    allowedRoles: ['master_admin', 'branch_admin', 'employee']
  }
];

// ← added
const partDetailItems = [
  { path: '/maintenance-schedule', name: 'Quotation Template' },
  { path: '/maintenance-reports', name: 'Activity Reports' },
];

function Navbar({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [engagementDropdownOpen, setEngagementDropdownOpen] = useState(false);
  const [showTerminologyModal, setShowTerminologyModal] = useState(false);
  const [showSitemapModal, setShowSitemapModal] = useState(false);
  const [expenseDropdownOpen, setExpenseDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [partInfoDropdownOpen, setPartInfoDropdownOpen] = useState(false);   // ← added
  const [engagementMastersDropdownOpen, setEngagementMastersDropdownOpen] = useState(false);   // ← added

  // Drive List modal
  const [showDriveNamesModal, setShowDriveNamesModal] = useState(false);
  const [driveCampaigns, setDriveCampaigns] = useState([]);
  const [driveNamesLoading, setDriveNamesLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [driveSort, setDriveSort] = useState({ key: null, dir: 'asc' }); // sort by 'name' | 'product'
  const [driveDateFrom, setDriveDateFrom] = useState(''); // filter: drive active on/after this date
  const [driveDateTo, setDriveDateTo] = useState('');     // filter: drive active on/before this date
  // Editable fields live in a SEPARATE table — kept in local state here.
  // Each entry: { display_name, data_start, data_end, remark } (data_* are 'YYYY-MM').
  const [driveMeta, setDriveMeta] = useState({});
  const [durationFrom, setDurationFrom] = useState(''); // 'YYYY-MM' filter
  const [durationTo, setDurationTo] = useState('');     // 'YYYY-MM' filter
  const [driveStatusFilter, setDriveStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  // View / Edit detail modal (opened from the Actions column).
  const [driveModalMode, setDriveModalMode] = useState(null); // 'view' | 'edit' | null
  const [activeDrive, setActiveDrive] = useState(null);       // campaign row being viewed/edited
  const [editForm, setEditForm] = useState({ display_name: '', data_start: '', data_end: '', remark: '' });
  const [editSaving, setEditSaving] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Night mode — a `dark` class on <html> drives all colors (see index.css).
  // index.html applies the saved theme before the app loads, so reading the
  // class here is always in sync with what the user last chose.
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  const toggleTheme = () => {
    const next = !darkMode;
    const theme = next ? 'dark' : 'light';
    applyTheme(theme);
    setDarkMode(next);

    // Persist per-user so the preference follows the account across
    // devices/sessions (login re-applies it from the DB). Best-effort —
    // the local toggle already applied either way.
    try {
      const stored = JSON.parse(sessionStorage.getItem('user') || 'null');
      if (stored?.user_id) {
        sessionStorage.setItem('user', JSON.stringify({ ...stored, theme }));
        axios.put(`${import.meta.env.VITE_BACKEND_URL}/users/theme`, {
          user_id: stored.user_id,
          theme,
        }).catch((e) => console.warn('Theme save failed:', e?.message));
      }
    } catch (e) {
      console.warn('Theme save skipped:', e?.message);
    }
  };

  // ── Auto-hide sidebar (hover to open) ─────────────────────────────────
  // When ON, the sidebar rests as a slim icon rail and glides open while
  // the mouse is over it; moving away tucks it back in. Desktop only —
  // mobile keeps its hamburger behaviour. Preference persists locally.
  const [autoHide, setAutoHide] = useState(() => {
    try { return localStorage.getItem('kc_sidebar_autohide') === '1'; } catch { return false; }
  });
  const autoHideRef = useRef(autoHide);
  useEffect(() => { autoHideRef.current = autoHide; }, [autoHide]);
  const hoverCloseTimer = useRef(null);
  useEffect(() => () => clearTimeout(hoverCloseTimer.current), []);

  const toggleAutoHide = () => {
    const next = !autoHide;
    setAutoHide(next);
    try { localStorage.setItem('kc_sidebar_autohide', next ? '1' : '0'); } catch { /* best-effort */ }
    if (!isMobile) setSidebarOpen(!next);   // ON → tuck away now, OFF → pin open
  };

  const handleSidebarHoverEnter = () => {
    if (!autoHideRef.current || isMobile) return;
    clearTimeout(hoverCloseTimer.current);
    if (!sidebarOpen) {
      // Re-open the dropdown of whichever section the user is currently in,
      // so the expanded rail lands them exactly where they are.
      if (isExpenseActive()) setExpenseDropdownOpen(true);
      else if (isPartInfoActive()) setPartInfoDropdownOpen(true);
      else if (isEngagementActive()) setEngagementDropdownOpen(true);
      else if (isEngagementMastersActive()) setEngagementMastersDropdownOpen(true);
      setSidebarOpen(true);
    }
  };

  const handleSidebarHoverLeave = () => {
    if (!autoHideRef.current || isMobile) return;
    // Small grace period so skimming past the edge doesn't flicker the rail.
    clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => setSidebarOpen(false), 300);
  };

  // While auto-hide is on, hovering a section header slides its submenu open
  // (accordion style — sibling sections tuck away) so the rail feels fluid:
  // glide in, sweep down the sections, submenus follow the pointer.
  const hoverOpenDropdown = (which) => {
    if (!autoHideRef.current || isMobile) return;
    setEngagementMastersDropdownOpen(which === 'masters');
    setPartInfoDropdownOpen(which === 'partinfo');
    setEngagementDropdownOpen(which === 'engagement');
    setExpenseDropdownOpen(which === 'expense');
  };

  // Read the raw string every render (cheap) but only JSON.parse when the
  // stored value actually changes. This keeps freshness identical to the old
  // per-render parse while giving `user` a stable identity, so the effects
  // depending on [user] stop tearing down / re-subscribing on every render.
  const userStr = sessionStorage.getItem('user');
  const user = useMemo(() => (userStr ? JSON.parse(userStr) : null), [userStr]);

  // Function to get branch display name
  const getBranchDisplayName = (branchCode) => {
    return branchMap[branchCode] || branchCode || 'No Branch';
  };

  // Role checks
  const isAdmin = user?.role === 'master_admin' || user?.role === 'branch_admin';
  const isMasterOrITAdmin = user?.role === 'master_admin';
  const isMasterAdmin = user?.role === 'master_admin';
  const isEmployee = user?.role === 'employee';

  // Terminology Modal Component - Compact version
  const TerminologyModal = () => {
    if (!showTerminologyModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 max-md:p-2 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
          {/* Modal Header - Compact */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">Abbreviations Guide</h2>
            </div>
            <button
              onClick={() => setShowTerminologyModal(false)}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <XMarkIcon className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          {/* Modal Body - Compact */}
          <div className="p-3 overflow-y-auto max-h-[calc(85vh-50px)] space-y-3">
            {/* Status Indicators */}
            <div className="bg-gray-50 rounded p-2">
              <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: themeColor }}></span>
                {terminologyData.statusIndicators.title}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {terminologyData.statusIndicators.items.map((item, idx) => (
                  <div key={idx} className="bg-white rounded p-1.5 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-800">{item.symbol}</span>
                      <span className="text-xs font-medium" style={{ color: themeColor }}>{item.meaning}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Flag Indicators */}
            <div className="bg-gray-50 rounded p-2">
              <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: themeColor }}></span>
                {terminologyData.flagIndicators.title}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {terminologyData.flagIndicators.items.map((item, idx) => (
                  <div key={idx} className="bg-white rounded p-1.5 border border-gray-100 text-center">
                    <div className="text-sm font-bold text-gray-800">{item.symbol}</div>
                    <div className="text-xs font-medium" style={{ color: themeColor }}>{item.meaning}</div>
                    <p className="text-[11px] text-gray-500">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Modal Footer - Compact */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-1.5 flex justify-end">
            <button
              onClick={() => setShowTerminologyModal(false)}
              className="px-3 py-1 text-xs font-medium rounded hover:opacity-90 transition-all"
              style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`, color: 'white' }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Handle responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        // Desktop: honour auto-hide — rest collapsed until hovered.
        setSidebarOpen(!autoHideRef.current);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar on route change for mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location, isMobile]);

  // Close dropdown when sidebar is collapsed
  useEffect(() => {
    if (!sidebarOpen) {
      setEngagementDropdownOpen(false);
      setExpenseDropdownOpen(false);
      setBranchDropdownOpen(false);
      setPartInfoDropdownOpen(false);   // ← added
      setEngagementMastersDropdownOpen(false);   // ← added
    }
  }, [sidebarOpen]);

  // Close branch dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (branchDropdownOpen && !event.target.closest('.branch-switcher-dropdown')) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [branchDropdownOpen]);

  // Fetch ALL drives (active + inactive) AND the separate drive-meta table when
  // the modal opens, then seed the editable Duration/Remark from the meta rows.
  useEffect(() => {
    if (!showDriveNamesModal) return;
    let cancelled = false;

    (async () => {
      if (driveCampaigns.length === 0) setDriveNamesLoading(true);
      try {
        const base = import.meta.env.VITE_BACKEND_URL;
        const [campRes, metaRes] = await Promise.all([
          fetch(`${base}/v1/campaigns/`),
          fetch(`${base}/v1/campaigns/drive-meta/all`),
        ]);

        const [campData, metaData] = await Promise.all([
          campRes.ok ? campRes.json() : [],
          metaRes.ok ? metaRes.json() : [],
        ]);
        const all = Array.isArray(campData) ? campData : [];
        const metaList = Array.isArray(metaData) ? metaData : [];

        // Map the separate meta rows by campaign_id.
        const metaById = {};
        metaList.forEach((m) => { metaById[m.campaign_id] = m; });

        if (!cancelled) {
          setDriveCampaigns(all);
          const seed = {};
          all.forEach((c) => {
            const m = metaById[c.id];
            seed[c.id] = {
              display_name: m?.display_name || '',
              data_start: isoToMonthInput(m?.data_start_date),
              data_end: isoToMonthInput(m?.data_end_date),
              remark: m?.drive_remark || '',
            };
          });
          setDriveMeta(seed);
        }
      } catch {
        if (!cancelled && driveCampaigns.length === 0) setDriveCampaigns([]);
      } finally {
        if (!cancelled) setDriveNamesLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDriveNamesModal]);

  // Click a sortable column: 1st click → ascending, 2nd → descending,
  // 3rd → off (back to original order).
  const toggleDriveSort = (key) => {
    setDriveSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  // Effective drive name = override from the meta table if set, else the real name.
  const driveDisplayName = (c) => (driveMeta[c.id]?.display_name || c.name || '').trim() || '—';

  // Open the read-only View modal for a drive.
  const openDriveView = (c) => {
    setActiveDrive(c);
    setDriveModalMode('view');
  };

  // Open the Edit modal, seeding the form from the current meta values.
  const openDriveEdit = (c) => {
    const m = driveMeta[c.id] || {};
    setActiveDrive(c);
    setEditForm({
      display_name: m.display_name || '',
      data_start: m.data_start || '',
      data_end: m.data_end || '',
      remark: m.remark || '',
    });
    setDriveModalMode('edit');
  };

  const closeDriveDetail = () => {
    setDriveModalMode(null);
    setActiveDrive(null);
    setEditSaving(false);
  };

  // Save the Edit form to the SEPARATE table ONLY. The real campaign (its name,
  // product, dates) is NEVER modified — only campaign_drive_meta changes.
  const saveEditForm = async () => {
    if (!activeDrive) return;
    const id = activeDrive.id;
    const name = (editForm.display_name || '').trim();

    setEditSaving(true);
    try {
      const body = {
        display_name: name || null,
        data_start_date: editForm.data_start ? `${editForm.data_start}-01` : null,
        data_end_date: editForm.data_end ? `${editForm.data_end}-01` : null,
        drive_remark: editForm.remark ?? '',
      };
      await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/campaigns/${id}/drive-meta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Reflect locally so the table updates without a refetch.
      setDriveMeta((prev) => ({
        ...prev,
        [id]: {
          display_name: name,
          data_start: editForm.data_start || '',
          data_end: editForm.data_end || '',
          remark: editForm.remark || '',
        },
      }));
      closeDriveDetail();
    } catch (e) {
      console.error('Failed to save drive meta:', e);
    } finally {
      setEditSaving(false);
    }
  };

  // Drives filtered by search (name + product), the Start/End date fields,
  // AND the data-duration window, then sorted when a column is selected.
  const visibleDrives = useMemo(() => {
    // --- Start / End date filter (field-based, compared as plain day numbers
    // so there are NO timezone off-by-one problems) ---
    // "Start Date (from)": keep drives that start on/after this date.
    // "End Date (to)":     keep drives that end on/before this date.
    const fromNum = toDayNum(driveDateFrom);
    const toNum = toDayNum(driveDateTo);
    const inRange = (c) => {
      if (fromNum == null && toNum == null) return true;
      const startNum = toDayNum(c.start_date);
      const endNum = toDayNum(c.end_date);
      if (fromNum != null && startNum != null && startNum < fromNum) return false;
      if (toNum != null && endNum != null && endNum > toNum) return false;
      return true;
    };

    // --- Data-duration overlap filter (month numbers, e.g. 202504) ---
    const monthNum = (ym) => (ym ? Number(ym.replace('-', '')) : null);
    const dFrom = monthNum(durationFrom);
    const dTo = monthNum(durationTo);
    const inDuration = (c) => {
      if (dFrom == null && dTo == null) return true;
      const m = driveMeta[c.id] || {};
      const ds = monthNum(m.data_start);
      const de = monthNum(m.data_end);
      if (ds == null && de == null) return false; // no duration set -> excluded while filtering
      if (dFrom != null && de != null && de < dFrom) return false;
      if (dTo != null && ds != null && ds > dTo) return false;
      return true;
    };

    // --- Status filter (All / Active / Inactive) ---
    const inStatus = (c) => {
      if (driveStatusFilter === 'all') return true;
      const isActive = (c.status || '').toLowerCase() === 'active';
      return driveStatusFilter === 'active' ? isActive : !isActive;
    };

    // --- Search: campaign name (override + real) and product ONLY ---
    const term = driveSearch.trim().toLowerCase();
    let list = driveCampaigns.filter((c) => {
      if (!inRange(c)) return false;
      if (!inDuration(c)) return false;
      if (!inStatus(c)) return false;
      if (!term) return true;
      const overrideName = (driveMeta[c.id]?.display_name || '').toLowerCase();
      const realName = (c.name || '').toLowerCase();
      const product = productOf(c).toLowerCase();
      return overrideName.includes(term) || realName.includes(term) || product.includes(term);
    });

    if (driveSort.key) {
      const valueOf = (c) => {
        if (driveSort.key === 'product') return productOf(c).toLowerCase();
        if (driveSort.key === 'description') return (driveMeta[c.id]?.display_name || '').toLowerCase();
        // 'name' → sort by the real (original) drive name
        return (c.name || '').toLowerCase();
      };
      list = [...list].sort((a, b) => {
        const cmp = valueOf(a).localeCompare(valueOf(b));
        return driveSort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [driveCampaigns, driveSearch, driveSort, driveDateFrom, driveDateTo, durationFrom, durationTo, driveStatusFilter, driveMeta]);

  // Send logout time to backend (manual or auto), then clear session.
  // Uses sendBeacon so the redirect is INSTANT and isn't blocked by the
  // tracking request — the logout is still recorded server-side.
  const recordLogoutAndClear = (logoutType = 'manual') => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (stored.session_id) {
        const url = `${import.meta.env.VITE_BACKEND_URL}/users/logout`;
        const payload = JSON.stringify({
          session_id: stored.session_id,
          logout_type: logoutType,
        });

        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        } else {
          // Fallback: fire without awaiting so it never blocks logout.
          axios.post(url, JSON.parse(payload)).catch((e) =>
            console.error('Logout tracking failed:', e)
          );
        }
      }
    } catch (e) {
      console.error('Logout tracking failed:', e);
    } finally {
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('token');
      navigate('/login');
    }
  };

  const handleLogout = () => {
    recordLogoutAndClear('manual');
  };

  // Anywhere on the Drive (/customer-engagement) or Non-Drive (/customer-engagement-2)
  // data pages → open Knowledge Bank in a small CHROME POPUP WINDOW (not a new tab),
  // so the user never loses their working page. The fixed window name
  // "knowledgeBankPopup" means a second click reuses the same popup instead of
  // opening another one. Everywhere else it navigates normally in the same tab.
  const ENGAGEMENT_DATA_PATHS = ['/customer-engagement', '/customer-engagement-2'];
  const handleOtherPageClick = (e, path) => {
    if (path === '/knowledge-book' && ENGAGEMENT_DATA_PATHS.includes(location.pathname)) {
      e.preventDefault();
      const w = 1000, h = 700;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      window.open(
        '/knowledge-book?popup=1',
        'knowledgeBankPopup',
        `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
    }
    if (isMobile) setSidebarOpen(false);
  };

  // ---- Auto-logout after 10 minutes of inactivity ----
  useEffect(() => {
    if (!user) return;

    // Users exempt from auto-logout (set in .env, comma-separated)
    const noAutoLogoutIds = (import.meta.env.VITE_NO_AUTO_LOGOUT_USER_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    if (noAutoLogoutIds.includes(String(user.user_id))) return;

    const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
    const CHECK_INTERVAL_MS = 30 * 1000;   // check every 30s

    // Activity handlers just stamp a timestamp — O(1), no timer churn.
    let lastActivity = Date.now();
    const markActivity = () => { lastActivity = Date.now(); };

    // mousemove/scroll fire constantly, so throttle the timestamp write to once
    // every 1s. A plain variable write is cheap, but this avoids even that on
    // every single frame.
    let throttled = false;
    const onActivity = () => {
      if (throttled) return;
      throttled = true;
      markActivity();
      setTimeout(() => { throttled = false; }, 1000);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));

    // ONE interval does the deciding — not the event handlers.
    const interval = setInterval(() => {
      if (Date.now() - lastActivity >= INACTIVITY_MS) {
        clearInterval(interval);
        recordLogoutAndClear('auto');
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      events.forEach(evt => window.removeEventListener(evt, onActivity));
    };
  }, [user]);

  // Record logout when the tab/window is closing (browser kills the page, so a
  // normal fetch won't finish — sendBeacon is allowed to complete during unload).
  useEffect(() => {
    if (!user) return;

    const sendLogoutBeacon = () => {
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (stored.session_id && navigator.sendBeacon) {
        const url = `${import.meta.env.VITE_BACKEND_URL}/users/logout`;
        const blob = new Blob(
          [JSON.stringify({ session_id: stored.session_id, logout_type: 'close' })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(url, blob);
      }
    };

    // pagehide fires on tab close, navigation, and (on mobile) when the app is
    // backgrounded — more reliable than beforeunload across browsers.
    window.addEventListener('pagehide', sendLogoutBeacon);

    return () => {
      window.removeEventListener('pagehide', sendLogoutBeacon);
    };
  }, [user]);

  const handleBranchSwitch = (branchObj) => {
    if (branchObj.branch === user.branch) return;
    setBranchDropdownOpen(false);
    Swal.fire({
      title: 'Switch Branch?',
      text: `Switch active branch to ${branchObj.branch_name}? The page will reload.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2f3192',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Yes, switch',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        const updated = {
          ...user,
          branch: branchObj.branch,
          branch_name: branchObj.branch_name
        };
        sessionStorage.setItem('user', JSON.stringify(updated));
        window.location.reload();
      }
    });
  };

  // Filter navigation items based on user role
  const getMainNavItems = () => {
    const allItems = [
      {
        path: '/dashboard',
        name: 'Dashboard',
        icon: HomeIcon,
        description: 'View your dashboard',
        allowedRoles: ['master_admin', 'branch_admin', 'employee']
      }
    ];

    const hiddenUserIds = (import.meta.env.VITE_RESTRICTED_USER_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean); const restrictedPaths = ['/import', '/campaigns'];
    return allItems.filter(item => {
      if (hiddenUserIds.includes(String(user?.user_id)) && restrictedPaths.includes(item.path)) {
        return false;
      }
      return item.allowedRoles.includes(user?.role);
    });
  };

  // Only rebuilt when the user actually changes — not on every hover/route render.
  const mainNavItems = useMemo(() => getMainNavItems(), [user]);

  // Engagement Masters dropdown items — master/IT admin only.
  // (Moved out of the flat main nav into one grouped dropdown.)
  const getEngagementMastersItems = () => {
    const allItems = [
      {
        path: '/import',
        name: 'Data - Upload',
        icon: CloudArrowUpIcon,
        description: 'Upload customer data',
        allowedRoles: ['master_admin']
      },
      {
        path: '/customers',
        name: 'Customers Data Hub',
        icon: UserGroupIcon,
        description: 'Manage your clients',
        allowedRoles: ['master_admin']
      },
      {
        path: '/campaigns',
        name: 'Drive Creation',
        icon: CiFlag1,
        description: 'Create & track drives',
        allowedRoles: ['master_admin']
      }
    ];

    // Keep the same restricted-user hiding the old flat nav used.
    const hiddenUserIds = (import.meta.env.VITE_RESTRICTED_USER_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    const restrictedPaths = ['/import', '/campaigns'];
    return allItems.filter(item => {
      if (hiddenUserIds.includes(String(user?.user_id)) && restrictedPaths.includes(item.path)) {
        return false;
      }
      return item.allowedRoles.includes(user?.role);
    });
  };

  const engagementMastersItems = useMemo(() => getEngagementMastersItems(), [user]);

  const isEngagementMastersActive = () =>
    location.pathname === '/import' ||
    location.pathname === '/customers' ||
    location.pathname === '/campaigns';

  // Other standalone pages (not in dropdown) - Filtered by role
  const getOtherPagesItems = () => {
    const allOtherPagesItems = [
      {
        path: '/mom-tracking',
        name: 'MOM Tracking',
        icon: ClipboardDocumentListIcon,
        description: 'Minutes of Meeting tracking',
        allowedRoles: ['master_admin']
      },
      {
        path: '/knowledge-book',
        name: 'Knowledge Bank',
        icon: BookOpenIcon,
        description: 'Product brochures, photos, videos & documents',
        allowedRoles: ['master_admin', 'branch_admin', 'employee']

      },
      // {
      //   path: '/sales-finance',
      //   name: 'Sales',
      //   icon: CurrencyRupeeIcon,
      //   description: 'Sales and financial management',
      //   allowedRoles: ['master_admin']
      // }
    ];

    return allOtherPagesItems.filter(item =>
      item.allowedRoles.includes(user?.role)
    );
  };

  const otherPagesItems = useMemo(() => getOtherPagesItems(), [user]);

  // Check if any engagement route is active
  const isEngagementActive = () => {
    return location.pathname === '/customer-engagement' ||
      location.pathname === '/customer-engagement-2';
  };

  const isPartInfoActive = () =>
    location.pathname === '/maintenance-schedule' ||
    location.pathname === '/maintenance-reports';

  // Master Admin / IT Admin always have access.
  // Branch Admin and Employee need explicit permission (can_access_expense)
  // granted from the Profile page edit modal.
  const canAccessExpensePages = () => {
    if (!user) return false;
    if (user.role === 'master_admin') {
      return true;
    }
    if (user.role === 'branch_admin' || user.role === 'employee') {
      return user.can_access_expense === true;
    }
    return false;
  };

  // Add function to check if any expense route is active
  const isExpenseActive = () => {
    return location.pathname === '/expense' || location.pathname === '/expense-dashboard';
  };

  const Logo = ({ collapsed }) => {
    if (logoError) {
      return (
        <div
          className={`${collapsed ? 'h-8 w-8' : 'h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-17 lg:w-17'} rounded-xl flex items-center justify-center text-white font-bold text-base shadow-md`}
          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
        >
          {user?.name?.charAt(0) || 'K'}
        </div>
      );
    }

    return (
      <div className="relative flex-shrink-0">
        <img
          src="/logo.png"
          alt="KALA Care Logo"
          className={`object-contain ${collapsed ? 'h-8 w-8' : 'h-15 w-15 sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-22 lg:w-22'}`}
          onError={() => setLogoError(true)}
        />
      </div>
    );
  };

  // Don't render navbar if no user
  if (!user) {
    return <>{children}</>;
  }

  // When Knowledge Bank opens in its own Chrome popup window, render ONLY the
  // page — no sidebar/header/modals. Detected two ways so it keeps working even
  // if the user navigates inside the popup:
  //   1. the ?popup=1 flag we add to the popup URL, and
  //   2. the window name ("knowledgeBankPopup"), preserved across navigations.
  const isKnowledgeBankPopup =
    window.name === 'knowledgeBankPopup' ||
    new URLSearchParams(location.search).get('popup') === '1';

  if (isKnowledgeBankPopup) {
    return (
      <main className="flex flex-col h-screen overflow-auto bg-[#EEEEEE]">
        <div className="flex-1 py-2 overflow-y-auto">
          {children}
        </div>
      </main>
    );
  }

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get role display name (roleMap is a module-scope constant)
  const getRoleDisplayName = (role) => {
    return roleMap[role] || role;
  };

  // Delegated prefetch for every link in the sidebar: on hover/touch, find the
  // nearest anchor and warm its route chunk so the click renders instantly.
  const handleNavLinkPrefetch = (e) => {
    const link = e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    try {
      prefetchRoute(new URL(link.href, window.location.origin).pathname);
    } catch { /* malformed href — nothing to prefetch */ }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#EEEEEE]">
      {/* Terminology Modal */}
      <TerminologyModal />

      {/* ERP Sitemap — helicopter view (Master Admin only) */}
      {showSitemapModal && isMasterAdmin && (
        <SitemapModal onClose={() => setShowSitemapModal(false)} />
      )}

      {/* Drive List Modal — ALL drives (active + inactive). Duration / Remark /
          display name are editable via the Actions column (View / Edit) and
          saved to the SEPARATE campaign_drive_meta table — the real drive is
          never changed. */}
      {showDriveNamesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 max-md:p-2 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-[95vw] w-full max-h-[95vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 flex justify-between items-center">
              <h2 className="text-base font-semibold text-gray-900">Drive List Information</h2>
              <button
                onClick={() => {
                  setShowDriveNamesModal(false);
                  setDriveSearch('');
                  setDriveDateFrom(''); setDriveDateTo('');
                  setDurationFrom(''); setDurationTo('');
                  setDriveStatusFilter('all');
                }}
                className="p-1 rounded hover:bg-gray-100 transition-colors"
              >
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Filters */}
            <div className="px-4 py-2 border-b border-gray-100">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col flex-1 min-w-[180px] max-sm:min-w-full">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Search</label>
                  <input
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    placeholder="Search drive name / product…"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col max-sm:w-full">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Status</label>
                  <select
                    value={driveStatusFilter}
                    onChange={(e) => setDriveStatusFilter(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-2 max-sm:w-full"
                    style={{ '--tw-ring-color': themeColor }}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex flex-col max-sm:w-full">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Start Date (from)</label>
                  <input
                    type="date"
                    value={driveDateFrom}
                    max={driveDateTo || undefined}
                    onChange={(e) => setDriveDateFrom(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2 max-sm:w-full"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col max-sm:w-full">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">End Date (to)</label>
                  <input
                    type="date"
                    value={driveDateTo}
                    min={driveDateFrom || undefined}
                    onChange={(e) => setDriveDateTo(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2 max-sm:w-full"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col max-sm:w-full">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Data Duration (from)</label>
                  <input
                    type="month"
                    value={durationFrom}
                    max={durationTo || undefined}
                    onChange={(e) => setDurationFrom(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2 max-sm:w-full"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col max-sm:w-full">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Data Duration (to)</label>
                  <input
                    type="month"
                    value={durationTo}
                    min={durationFrom || undefined}
                    onChange={(e) => setDurationTo(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2 max-sm:w-full"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                {(driveDateFrom || driveDateTo || durationFrom || durationTo || driveStatusFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setDriveDateFrom(''); setDriveDateTo('');
                      setDurationFrom(''); setDurationTo('');
                      setDriveStatusFilter('all');
                    }}
                    className="px-2 py-1 text-[11px] font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors whitespace-nowrap max-sm:w-full"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="p-3 flex-1 min-h-0 flex flex-col overflow-hidden">
              {driveNamesLoading ? (
                <div className="text-center py-8 text-xs text-gray-500">Loading drives…</div>
              ) : visibleDrives.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">No drives found.</div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs border-collapse table-fixed max-md:min-w-[1000px]">
                    <colgroup>
                      <col className="w-12" />{/* Sr. No. */}
                      <col className="w-40" />{/* Drive Name (real/original) */}
                      <col className="w-40" />{/* Drive Description (edited name) */}
                      <col className="w-36" />{/* Drive Product */}
                      <col className="w-44" />{/* Drive Data Duration */}
                      <col className="w-24" />{/* Start Date */}
                      <col className="w-24" />{/* End Date */}
                      <col className="w-24" />{/* Drive Status */}
                      <col className="w-64" />{/* Drive Remark — wraps, grows row height */}
                      <col className="w-24" />{/* Actions */}
                    </colgroup>
                    <thead>
                      <tr className="text-left text-gray-800" style={{ backgroundColor: themeShades.light }}>
                        <th className="px-2 py-2 font-semibold text-center whitespace-nowrap border border-gray-300">Sr. No.</th>
                        <th
                          onClick={() => toggleDriveSort('name')}
                          className="px-3 py-2 font-semibold whitespace-nowrap border border-gray-300 cursor-pointer select-none hover:bg-black/5"
                          title="Sort by drive name"
                        >
                          <span className="inline-flex items-center gap-1">
                            Drive Name
                            <span className="flex flex-col -space-y-1">
                              <ChevronUpIcon strokeWidth={3} className={`h-2.5 w-2.5 ${driveSort.key === 'name' && driveSort.dir === 'asc' ? 'text-[#2f3192]' : 'text-gray-400'}`} />
                              <ChevronDownIcon strokeWidth={3} className={`h-2.5 w-2.5 ${driveSort.key === 'name' && driveSort.dir === 'desc' ? 'text-[#2f3192]' : 'text-gray-400'}`} />
                            </span>
                          </span>
                        </th>
                        <th
                          onClick={() => toggleDriveSort('description')}
                          className="px-3 py-2 font-semibold whitespace-nowrap border border-gray-300 cursor-pointer select-none hover:bg-black/5"
                          title="Sort by drive description"
                        >
                          <span className="inline-flex items-center gap-1">
                            Drive Description
                            <span className="flex flex-col -space-y-1">
                              <ChevronUpIcon strokeWidth={3} className={`h-2.5 w-2.5 ${driveSort.key === 'description' && driveSort.dir === 'asc' ? 'text-[#2f3192]' : 'text-gray-400'}`} />
                              <ChevronDownIcon strokeWidth={3} className={`h-2.5 w-2.5 ${driveSort.key === 'description' && driveSort.dir === 'desc' ? 'text-[#2f3192]' : 'text-gray-400'}`} />
                            </span>
                          </span>
                        </th>
                        <th
                          onClick={() => toggleDriveSort('product')}
                          className="px-3 py-2 font-semibold whitespace-nowrap border border-gray-300 cursor-pointer select-none hover:bg-black/5"
                          title="Sort by product"
                        >
                          <span className="inline-flex items-center gap-1">
                            Drive Product
                            <span className="flex flex-col -space-y-1">
                              <ChevronUpIcon strokeWidth={3} className={`h-2.5 w-2.5 ${driveSort.key === 'product' && driveSort.dir === 'asc' ? 'text-[#2f3192]' : 'text-gray-400'}`} />
                              <ChevronDownIcon strokeWidth={3} className={`h-2.5 w-2.5 ${driveSort.key === 'product' && driveSort.dir === 'desc' ? 'text-[#2f3192]' : 'text-gray-400'}`} />
                            </span>
                          </span>
                        </th>
                        <th className="px-3 py-2 font-semibold text-center whitespace-nowrap border border-gray-300">Drive Data Duration</th>
                        <th className="px-3 py-2 font-semibold text-center whitespace-nowrap border border-gray-300">Start Date</th>
                        <th className="px-3 py-2 font-semibold text-center whitespace-nowrap border border-gray-300">End Date</th>
                        <th className="px-3 py-2 font-semibold text-center whitespace-nowrap border border-gray-300">Drive Status</th>
                        <th className="px-3 py-2 font-semibold text-center border border-gray-300">Drive Remark</th>
                        <th className="px-3 py-2 font-semibold text-center whitespace-nowrap border border-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDrives.map((c, i) => {
                        const meta = driveMeta[c.id] || { display_name: '', data_start: '', data_end: '', remark: '' };
                        const active = (c.status || '').toLowerCase() === 'active';
                        const durationText =
                          meta.data_start || meta.data_end
                            ? `${formatMonthYear(meta.data_start) || '—'} to ${formatMonthYear(meta.data_end) || '—'}`
                            : '—';
                        return (
                          <tr key={c.id} className="hover:bg-gray-50 align-top">
                            <td className="px-3 py-2 text-center text-gray-500 border border-gray-200">{i + 1}</td>
                            {/* Drive Name = real/original name only, truncated with full text in title */}
                            <td className="px-3 py-2 font-medium text-black border border-gray-200">
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || themeColor }} />
                                <span className="truncate min-w-0" title={c.name || ''}>
                                  {c.name || '—'}
                                </span>
                              </span>
                            </td>
                            {/* Drive Description = edited/display name, truncated with full text in title */}
                            <td className="px-3 py-2 text-black border border-gray-200">
                              <span className="block truncate" title={meta.display_name || ''}>
                                {meta.display_name || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-black whitespace-nowrap border border-gray-200 text-center">{productOf(c)}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap border border-gray-200 text-center">{durationText}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap border border-gray-200 text-center">{formatDriveDate(c.start_date)}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap border border-gray-200 text-center">
                              {c.end_date ? formatDriveDate(c.end_date) : 'Ongoing'}
                            </td>
                            <td className="px-3 py-2 text-center border border-gray-200">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600 border border-gray-200">
                              <span className="block whitespace-pre-wrap break-words">
                                {meta.remark || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2 border border-gray-200">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openDriveView(c)}
                                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                                  title="View"
                                >
                                  <EyeIcon className="h-4 w-4" style={{ color: themeColor }} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDriveEdit(c)}
                                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                                  title="Edit"
                                >
                                  <PencilSquareIcon className="h-4 w-4 text-gray-600" />
                                </button>
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

            {!driveNamesLoading && driveCampaigns.length > 0 && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-1.5 flex justify-between items-center max-md:flex-wrap max-md:gap-2">
                <span className="text-[11px] text-gray-400">
                  {visibleDrives.length} of {driveCampaigns.length} drive(s)
                </span>
                <button
                  onClick={() => {
                    setShowDriveNamesModal(false);
                    setDriveSearch('');
                    setDriveDateFrom(''); setDriveDateTo('');
                    setDurationFrom(''); setDurationTo('');
                    setDriveStatusFilter('all');
                  }}
                  className="px-3 py-1 text-xs font-medium rounded hover:opacity-90 transition-all"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`, color: 'white' }}
                >
                  Got it
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drive View / Edit detail modal — edits write ONLY to campaign_drive_meta.
          The real drive name / product / dates are never modified. */}
      {driveModalMode && activeDrive && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 max-md:p-2 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[88vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 flex justify-between items-center">
              <h2 className="text-base font-semibold text-gray-900">
                {driveModalMode === 'edit' ? 'Edit Drive Info' : 'Drive Details'}
              </h2>
              <button onClick={closeDriveDetail} className="p-1 rounded hover:bg-gray-100 transition-colors">
                <XMarkIcon className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto overflow-x-hidden space-y-3 text-xs">
              {driveModalMode === 'view' ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">Drive Name</span>
                    <span className="col-span-2 min-w-0 text-black font-medium break-words">{driveDisplayName(activeDrive)}</span>
                  </div>
                  {driveMeta[activeDrive.id]?.display_name && (
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-gray-500 font-medium">Drive Discription</span>
                      <span className="col-span-2 min-w-0 text-gray-600 break-words">{activeDrive.name}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">Product</span>
                    <span className="col-span-2 min-w-0 text-black break-words">{productOf(activeDrive)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">Data Duration</span>
                    <span className="col-span-2 min-w-0 text-black break-words">
                      {(() => {
                        const m = driveMeta[activeDrive.id] || {};
                        return m.data_start || m.data_end
                          ? `${formatMonthYear(m.data_start) || '—'} to ${formatMonthYear(m.data_end) || '—'}`
                          : '—';
                      })()}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">Start Date</span>
                    <span className="col-span-2 min-w-0 text-black break-words">{formatDriveDate(activeDrive.start_date)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">End Date</span>
                    <span className="col-span-2 min-w-0 text-black break-words">
                      {activeDrive.end_date ? formatDriveDate(activeDrive.end_date) : 'Ongoing'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">Status</span>
                    <span className="col-span-2 min-w-0">
                      {(activeDrive.status || '').toLowerCase() === 'active'
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Active</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">Inactive</span>}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">Created By</span>
                    <span className="col-span-2 min-w-0 text-black break-words">{activeDrive.created_by_name || '—'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-gray-500 font-medium">Remark</span>
                    <span className="col-span-2 min-w-0 text-black whitespace-pre-wrap break-words">{driveMeta[activeDrive.id]?.remark || '—'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded bg-gray-50 border border-gray-100 px-2 py-1.5 text-[11px] text-gray-500">
                    Editing here updates this list only. The real drive
                    (<span className="font-medium text-gray-700">{activeDrive.name}</span> · {productOf(activeDrive)}) is not changed.
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-gray-600">Drive Discription</label>
                    <input
                      type="text"
                      value={editForm.display_name}
                      placeholder={activeDrive.name || 'Drive name'}
                      onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': themeColor }}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-gray-600">Data Duration</label>
                    <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
                      <input
                        type="month"
                        value={editForm.data_start}
                        max={editForm.data_end || undefined}
                        onChange={(e) => setEditForm((f) => ({ ...f, data_start: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': themeColor }}
                      />
                      <span className="text-gray-400 text-[11px] max-sm:text-center">to</span>
                      <input
                        type="month"
                        value={editForm.data_end}
                        min={editForm.data_start || undefined}
                        onChange={(e) => setEditForm((f) => ({ ...f, data_end: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': themeColor }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-gray-600">Remark</label>
                    <textarea
                      rows={3}
                      value={editForm.remark}
                      placeholder="Add remark…"
                      onChange={(e) => setEditForm((f) => ({ ...f, remark: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2 resize-none"
                      style={{ '--tw-ring-color': themeColor }}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2 flex justify-end gap-2 max-md:flex-wrap">
              {driveModalMode === 'edit' ? (
                <>
                  <button
                    onClick={closeDriveDetail}
                    disabled={editSaving}
                    className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditForm}
                    disabled={editSaving}
                    className="px-3 py-1 text-xs font-medium rounded hover:opacity-90 transition-all disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`, color: 'white' }}
                  >
                    {editSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => openDriveEdit(activeDrive)}
                  className="px-3 py-1 text-xs font-medium rounded hover:opacity-90 transition-all"
                  style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})`, color: 'white' }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar. One delegated handler warms the target page's JS chunk the
          moment the user hovers (desktop) or touches (mobile) ANY link inside
          the sidebar — by the time they finish the click, the chunk is usually
          already cached and the page opens instantly. */}
      <aside
        onMouseOver={handleNavLinkPrefetch}
        onTouchStart={handleNavLinkPrefetch}
        onMouseEnter={handleSidebarHoverEnter}
        onMouseLeave={handleSidebarHoverLeave}
        className={`
        fixed md:relative md:translate-x-0
        h-full bg-white backdrop-blur-xl
        border-r border-gray-200/50
        transition-all duration-500 z-30
        shadow-xl shadow-gray-200/20
        ${sidebarOpen ? 'w-56' : 'w-14'}
        ${isMobile ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full') : ''}
      `}
        style={{ transitionTimingFunction: 'cubic-bezier(0.33, 1, 0.68, 1)' }}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header - Logo and Name Centered */}
          <div className={`bg-[#ffdb62] flex items-center justify-center ${sidebarOpen ? 'pt-0 pb-1' : 'py-1'} ${sidebarOpen ? 'px-4' : 'px-2'}`}>
            <div className="flex flex-col items-center justify-center w-full">
              <div className={`${sidebarOpen ? 'mb-0' : 'mb-0'}`}>
                <Logo collapsed={!sidebarOpen} />
              </div>
              {sidebarOpen && (
                <div className="nav-label-fade flex flex-col items-center w-full">
                  <span className="text-[15px] font-bold text-[#2f3192] leading-tight text-center">
                    KALA Care Global LLP.,
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Toggle button positioned in the middle of sidebar */}
          {!isMobile && !sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition-all bg-white shadow-md border border-gray-200 z-40"
              aria-label="Expand sidebar"
            >
              <ChevronDoubleRightIcon className="h-3 w-3" />
            </button>
          )}

          {!isMobile && sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute -right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition-all bg-white shadow-md border border-gray-200 z-40"
              aria-label="Collapse sidebar"
            >
              <ChevronDoubleLeftIcon className="h-3 w-3" />
            </button>
          )}

          {/* Main Navigation - Scrollable Area with Fixed Bottom Info Button.
              Expanded: clip so the horizontal scroll stays inside. Collapsed:
              let overflow show so click-open flyout submenus can pop out over
              the page instead of being clipped at the narrow sidebar edge. */}
          <div className={`flex-1 flex flex-col min-h-0 ${sidebarOpen ? 'overflow-hidden' : 'overflow-visible'}`}>
            {/* Scrollable Navigation Links.
                Expanded: vertical (top↕bottom) scroll only — horizontal scroll is
                disabled (overflow-x hidden). Collapsed: overflow visible so the
                click-open flyout submenus can escape the narrow sidebar. */}
            <div
              className={`flex-1 min-h-0 ${sidebarOpen ? 'overflow-y-auto overflow-x-hidden nav-scroll' : 'overflow-visible'}`}
              style={{ scrollbarWidth: sidebarOpen ? 'thin' : 'none' }}
            >
              <style>
                {`
                  /* Thin vertical (top↕bottom) scrollbar only — shown when the
                     sidebar is expanded. No horizontal scrollbar. */
                  .nav-scroll::-webkit-scrollbar {
                    width: 7px;
                  }
                  .nav-scroll::-webkit-scrollbar-track {
                    background: transparent;
                  }
                  .nav-scroll::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 7px;
                  }
                  .nav-scroll::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                  }
                  /* Submenu open/close — always-mounted grid-rows collapse so
                     BOTH expanding and collapsing glide smoothly (conditional
                     render used to snap shut with no close animation). */
                  .nav-dd-wrap {
                    display: grid;
                    grid-template-rows: 0fr;
                    transition: grid-template-rows .45s cubic-bezier(.33, 1, .68, 1);
                  }
                  .nav-dd-wrap.nav-dd-open { grid-template-rows: 1fr; }
                  .nav-dd-inner {
                    overflow: hidden;
                    min-height: 0;
                    opacity: 0;
                    transform: translateY(-6px);
                    visibility: hidden; /* keeps closed submenu links out of the tab order */
                    transition: opacity .3s ease, transform .45s cubic-bezier(.33, 1, .68, 1), visibility 0s .45s;
                  }
                  .nav-dd-wrap.nav-dd-open .nav-dd-inner {
                    opacity: 1;
                    transform: none;
                    visibility: visible;
                    transition: opacity .35s ease .08s, transform .45s cubic-bezier(.33, 1, .68, 1);
                  }
                  /* Labels fade+slide in as the rail expands instead of popping */
                  .nav-label-fade { animation: navLabelIn .4s ease .12s both; }
                  @keyframes navLabelIn {
                    from { opacity: 0; transform: translateX(-6px); }
                    to   { opacity: 1; transform: none; }
                  }
                `}
              </style>
              {/* Inner content wrapper. Expanded → min-w-full w-max so each row's
                  active highlight spans the full row width; the outer handles
                  vertical scrolling (horizontal is clipped, no bar).
                  Collapsed → no clipping so flyouts can escape the sidebar. */}
              <div
                className={`py-1.5 ${sidebarOpen ? 'min-w-full w-max pl-3 pr-6' : 'overflow-visible w-full px-2'}`}
              >
              <NavLinks items={mainNavItems} collapsed={!sidebarOpen} hoveredItem={hoveredItem} setHoveredItem={setHoveredItem} />

              {/* Engagement Masters — master/IT admin only. Groups Data-Upload,
                  Customers Data Bouquet and Drive Creation under one dropdown. */}
              {isMasterOrITAdmin && engagementMastersItems.length > 0 && (
                sidebarOpen ? (
                  <div className="mt-1">
                    <button
                      onClick={() => setEngagementMastersDropdownOpen(!engagementMastersDropdownOpen)}
                      onMouseEnter={() => { setHoveredItem('engagement-masters'); hoverOpenDropdown('masters'); }}
                      onMouseLeave={() => setHoveredItem(null)}
                      className={`
                        min-w-full w-max group relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200
                        ${isEngagementMastersActive() ? 'text-black font-medium' : 'text-black hover:text-black'}
                      `}
                      style={{
                        backgroundColor: (isEngagementMastersActive() || engagementMastersDropdownOpen) ? themeShades.light : 'transparent'
                      }}
                    >
                      <TableCellsIcon
                        className="h-3.5 w-3.5 transition-all duration-200 flex-shrink-0"
                        style={{
                          color: isEngagementMastersActive() ? themeColor :
                            hoveredItem === 'engagement-masters' ? themeColor : '#6B7280'
                        }}
                      />
                      <span className="nav-label-fade flex-1 text-sm font-medium whitespace-nowrap text-left text-black">
                        Engagement Masters
                      </span>
                      {engagementMastersDropdownOpen ? (
                        <ChevronUpIcon className="h-2.5 w-2.5 text-black" />
                      ) : (
                        <ChevronDownIcon className="h-2.5 w-2.5 text-black" />
                      )}
                    </button>

                    <div className={`nav-dd-wrap ${(engagementMastersDropdownOpen || isEngagementMastersActive()) ? 'nav-dd-open' : ''}`}>
                      <div className="nav-dd-inner">
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-200 pl-1.5">
                        {engagementMastersItems.map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => { if (isMobile) setSidebarOpen(false); }}
                            className={({ isActive }) =>
                              `group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-all duration-200 text-sm min-w-full w-max ${isActive
                                ? 'text-gray-900 font-medium'
                                : 'text-black hover:text-gray-900'
                              }`
                            }
                            style={({ isActive }) => ({
                              backgroundColor: isActive ? themeShades.light : 'transparent',
                              color: isActive ? themeColor : undefined
                            })}
                          >
                            {({ isActive }) => (
                              <>
                                <item.icon
                                  className="h-3.5 w-3.5 flex-shrink-0 transition-all duration-200"
                                  style={{ color: isActive ? themeColor : '#6B7280' }}
                                />
                                <span className="flex-1 whitespace-nowrap">{item.name}</span>
                              </>
                            )}
                          </NavLink>
                        ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Collapsed mode */
                  <div className="relative mt-2 group/flyout">
                    <button
                      onClick={() => setEngagementMastersDropdownOpen(!engagementMastersDropdownOpen)}
                      className="w-full group relative flex items-center justify-center px-2 py-1 rounded-lg transition-all duration-200"
                      title="Engagement Masters"
                    >
                      <TableCellsIcon
                        className="h-3.5 w-3.5 transition-all duration-200"
                        style={{ color: isEngagementMastersActive() ? themeColor : '#6B7280' }}
                      />
                      {/* Tooltip removed — the hover flyout already shows the submenu. */}
                    </button>

                    {/* Hover the icon to reveal this submenu; hidden otherwise.
                        The before-bridge keeps hover continuous across the gap. */}
                    <div className="hidden group-hover/flyout:block absolute left-full top-0 ml-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50 before:content-[''] before:absolute before:-left-2 before:top-0 before:h-full before:w-2">
                        {engagementMastersItems.map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => {
                              setEngagementMastersDropdownOpen(false);
                              if (isMobile) setSidebarOpen(false);
                            }}
                            className={({ isActive }) =>
                              `flex items-center gap-2 px-2 py-1 text-sm transition-colors ${isActive
                                ? 'text-gray-900 font-medium'
                                : 'text-black hover:text-gray-900 hover:bg-gray-50'
                              }`
                            }
                            style={({ isActive }) => ({
                              color: isActive ? themeColor : undefined,
                              backgroundColor: isActive ? themeShades.light : 'transparent'
                            })}
                          >
                            {({ isActive }) => (
                              <>
                                <item.icon
                                  className="h-3.5 w-3.5 flex-shrink-0"
                                  style={{ color: isActive ? themeColor : '#6B7280' }}
                                />
                                <span className="truncate">{item.name}</span>
                              </>
                            )}
                          </NavLink>
                        ))}
                      </div>
                  </div>
                )
              )}

              {/* Part Detail Info — visible ONLY to master/IT admin.
                  Branch admin and employee do not see this section at all. */}
              {isMasterOrITAdmin && (
                sidebarOpen ? (
                  <div className="mt-1">
                    <button
                      onClick={() => setPartInfoDropdownOpen(!partInfoDropdownOpen)}
                      onMouseEnter={() => { setHoveredItem('part-detail-info'); hoverOpenDropdown('partinfo'); }}
                      onMouseLeave={() => setHoveredItem(null)}
                      className={`
          min-w-full w-max group relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200
          ${isPartInfoActive() ? 'text-black font-medium' : 'text-black hover:text-black'}
        `}
                      style={{
                        backgroundColor: (isPartInfoActive() || partInfoDropdownOpen) ? themeShades.light : 'transparent'
                      }}
                    >
                      <ClipboardDocumentListIcon
                        className="h-3.5 w-3.5 transition-all duration-200 flex-shrink-0"
                        style={{
                          color: isPartInfoActive() ? themeColor :
                            hoveredItem === 'part-detail-info' ? themeColor : '#6B7280'
                        }}
                      />
                      <span className="nav-label-fade flex-1 text-sm font-medium whitespace-nowrap text-left text-black">
                        Part Detail Info
                      </span>
                      {partInfoDropdownOpen ? (
                        <ChevronUpIcon className="h-2.5 w-2.5 text-black" />
                      ) : (
                        <ChevronDownIcon className="h-2.5 w-2.5 text-black" />
                      )}
                    </button>

                    <div className={`nav-dd-wrap ${(partInfoDropdownOpen || isPartInfoActive()) ? 'nav-dd-open' : ''}`}>
                      <div className="nav-dd-inner">
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-200 pl-1.5">
                        {partDetailItems.map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => {
                              if (isMobile) setSidebarOpen(false);
                            }}
                            className={({ isActive }) =>
                              `group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-all duration-200 text-sm min-w-full w-max ${isActive
                                ? 'text-black font-medium'
                                : 'text-black hover:text-black'
                              }`
                            }
                            style={({ isActive }) => ({
                              backgroundColor: isActive ? themeShades.light : 'transparent',
                              color: isActive ? 'var(--erp-ink)' : undefined
                            })}
                          >
                            {({ isActive }) => (
                              <>
                                <div
                                  className="w-1 h-1 rounded-full"
                                  style={{
                                    backgroundColor: isActive ? 'var(--erp-ink)' : '#D1D5DB'
                                  }}
                                />
                                <span className="flex-1 whitespace-nowrap">{item.name}</span>
                              </>
                            )}
                          </NavLink>
                        ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Collapsed mode */
                  <div className="relative mt-2 group/flyout">
                    <button
                      onClick={() => setPartInfoDropdownOpen(!partInfoDropdownOpen)}
                      className="w-full group relative flex items-center justify-center px-2 py-1 rounded-lg transition-all duration-200"
                      title="Part Detail Info"
                    >
                      <ClipboardDocumentListIcon
                        className="h-3.5 w-3.5 transition-all duration-200"
                        style={{ color: '#6B7280' }}
                      />
                      {/* Tooltip removed — the hover flyout already shows the submenu. */}
                    </button>

                    {/* Hover the icon to reveal this submenu; hidden otherwise. */}
                    <div className="hidden group-hover/flyout:block absolute left-full top-0 ml-2 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50 before:content-[''] before:absolute before:-left-2 before:top-0 before:h-full before:w-2">
                        {partDetailItems.map((item) => (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => {
                              setPartInfoDropdownOpen(false);
                              if (isMobile) setSidebarOpen(false);
                            }}
                            className={({ isActive }) =>
                              `block px-2 py-1 text-sm transition-colors ${isActive
                                ? 'text-black font-medium'
                                : 'text-black hover:text-black hover:bg-gray-50'
                              }`
                            }
                            style={({ isActive }) => ({
                              color: isActive ? 'var(--erp-ink)' : undefined,
                              backgroundColor: isActive ? themeShades.light : 'transparent'
                            })}
                          >
                            {item.name}
                          </NavLink>
                        ))}
                      </div>
                  </div>
                )
              )}

              {/* Customer Engagement Dropdown */}

              {/* Customer Engagement Dropdown */}
              {sidebarOpen ? (
                <div className="mt-1">
                  <button
                    onClick={() => setEngagementDropdownOpen(!engagementDropdownOpen)}
                    onMouseEnter={() => { setHoveredItem('customer-engagement'); hoverOpenDropdown('engagement'); }}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`
        min-w-full w-max group relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200
        ${isEngagementActive() ? 'text-black font-medium' : 'text-black hover:text-black'}
      `}
                    style={{
                      backgroundColor: (isEngagementActive() || engagementDropdownOpen) ? themeShades.light : 'transparent'
                    }}
                  >
                    <PiHandshakeDuotone
                      className="h-3.5 w-3.5 transition-all duration-200 flex-shrink-0"
                      style={{
                        color: isEngagementActive() ? 'var(--erp-ink)' :
                          hoveredItem === 'customer-engagement' ? 'var(--erp-ink)' : 'var(--erp-ink)'
                      }}
                    />
                    <span className="nav-label-fade flex-1 text-sm font-medium whitespace-nowrap text-left text-black">
                      Customer Engagement
                    </span>
                    {engagementDropdownOpen ? (
                      <ChevronUpIcon className="h-2.5 w-2.5 text-black" />
                    ) : (
                      <ChevronDownIcon className="h-2.5 w-2.5 text-black" />
                    )}
                  </button>

                  {/* Dropdown Items */}
                  <div className={`nav-dd-wrap ${(engagementDropdownOpen || isEngagementActive()) ? 'nav-dd-open' : ''}`}>
                    <div className="nav-dd-inner">
                      <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-200 pl-1.5">
                      {/* Drive List Info — opens the modal (not a route); shown first.
                          Master Admin / IT Admin only. */}
                      {isMasterOrITAdmin && (
                        <button
                          type="button"
                          onClick={() => { setShowDriveNamesModal(true); if (isMobile) setSidebarOpen(false); }}
                          className="min-w-full w-max group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-all duration-200 text-sm text-black hover:text-black hover:bg-gray-50"
                        >
                          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#D1D5DB' }} />
                          <span className="flex-1 whitespace-nowrap text-left">Drive List Info</span>
                        </button>
                      )}

                      {engagementItems.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={() => {
                            if (isMobile) setSidebarOpen(false);
                          }}
                          className={({ isActive }) =>
                            `group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-all duration-200 text-sm min-w-full w-max ${isActive
                              ? 'text-black font-medium'
                              : 'text-black hover:text-black'
                            }`
                          }
                          style={({ isActive }) => ({
                            backgroundColor: isActive ? themeShades.light : 'transparent',
                            color: isActive ? 'var(--erp-ink)' : undefined
                          })}
                        >
                          {({ isActive }) => (
                            <>
                              <div
                                className="w-1 h-1 rounded-full"
                                style={{
                                  backgroundColor: isActive ? 'var(--erp-ink)' : '#D1D5DB'
                                }}
                              />
                              <span className="flex-1 whitespace-nowrap">{item.name}</span>
                            </>
                          )}
                        </NavLink>
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Collapsed mode */
                <div className="relative mt-2 group/flyout">
                  <button
                    onClick={() => setEngagementDropdownOpen(!engagementDropdownOpen)}
                    className="w-full group relative flex items-center justify-center px-2 py-1 rounded-lg transition-all duration-200"
                    title="Customer Engagement"
                  >
                    <PiHandshakeDuotone
                      className="h-3.5 w-3.5 transition-all duration-200"
                      style={{
                        color: 'var(--erp-ink)'
                      }}
                    />
                    {/* Tooltip removed — the hover flyout already shows the submenu. */}
                  </button>

                  {/* Hover the icon to reveal this submenu; hidden otherwise. */}
                  <div className="hidden group-hover/flyout:block absolute left-full top-0 ml-2 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50 before:content-[''] before:absolute before:-left-2 before:top-0 before:h-full before:w-2">
                      {/* Drive List Info — opens the modal (not a route); shown first.
                          Master Admin / IT Admin only. */}
                      {isMasterOrITAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowDriveNamesModal(true);
                            setEngagementDropdownOpen(false);
                            if (isMobile) setSidebarOpen(false);
                          }}
                          className="block w-full text-left px-2 py-1.5 text-sm text-black hover:bg-gray-50"
                        >
                          Drive List Info
                        </button>
                      )}

                      {engagementItems.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={() => {
                            setEngagementDropdownOpen(false);
                            if (isMobile) setSidebarOpen(false);
                          }}
                          className={({ isActive }) =>
                            `block px-2 py-1 text-sm transition-colors ${isActive
                              ? 'text-black font-medium'
                              : 'text-black hover:text-black hover:bg-gray-50'
                            }`
                          }
                          style={({ isActive }) => ({
                            color: isActive ? 'var(--erp-ink)' : undefined,
                            backgroundColor: isActive ? themeShades.light : 'transparent'
                          })}
                        >
                          {item.name}
                        </NavLink>
                      ))}
                    </div>
                </div>
              )}

              {/* Expense Tracking Dropdown Section */}
              {canAccessExpensePages() && (
                <div className="mt-1 pt-0">
                  {sidebarOpen ? (
                    <div className="mt-1">
                      <button
                        onClick={() => setExpenseDropdownOpen(!expenseDropdownOpen)}
                        onMouseEnter={() => { setHoveredItem('expense-tracking'); hoverOpenDropdown('expense'); }}
                        onMouseLeave={() => setHoveredItem(null)}
                        className={`
            min-w-full w-max group relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200
            ${isExpenseActive() ? 'text-black font-medium' : 'text-black hover:text-black'}
          `}
                        style={{
                          backgroundColor: (isExpenseActive() || expenseDropdownOpen) ? themeShades.light : 'transparent'
                        }}
                      >
                        <BanknotesIcon
                          className="h-3.5 w-3.5 transition-all duration-200 flex-shrink-0"
                          style={{
                            color: isExpenseActive() ? 'var(--erp-ink)' :
                              hoveredItem === 'expense-tracking' ? 'var(--erp-ink)' : 'var(--erp-ink)'
                          }}
                        />
                        <span className="nav-label-fade flex-1 text-sm font-medium whitespace-nowrap text-left text-black">
                          Expense Tracking
                        </span>
                        {expenseDropdownOpen ? (
                          <ChevronUpIcon className="h-2.5 w-2.5 text-black" />
                        ) : (
                          <ChevronDownIcon className="h-2.5 w-2.5 text-black" />
                        )}
                      </button>

                      {/* Dropdown Items */}
                      <div className={`nav-dd-wrap ${(expenseDropdownOpen || isExpenseActive()) ? 'nav-dd-open' : ''}`}>
                        <div className="nav-dd-inner">
                          <div className="ml-5 mt-0.5 space-y-0.5 border-l border-gray-200 pl-1.5">
                          {expenseTrackingItems.map((item) => (
                            <NavLink
                              key={item.path}
                              to={item.path}
                              onClick={() => {
                                if (isMobile) setSidebarOpen(false);
                              }}
                              className={({ isActive }) =>
                                `group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-all duration-200 text-sm min-w-full w-max ${isActive
                                  ? 'text-black font-medium'
                                  : 'text-black hover:text-black'
                                }`
                              }
                              style={({ isActive }) => ({
                                backgroundColor: isActive ? themeShades.light : 'transparent',
                                color: isActive ? 'var(--erp-ink)' : undefined
                              })}
                            >
                              {({ isActive }) => (
                                <>
                                  <div
                                    className="w-1 h-1 rounded-full"
                                    style={{
                                      backgroundColor: isActive ? 'var(--erp-ink)' : '#D1D5DB'
                                    }}
                                  />
                                  <span className="flex-1 whitespace-nowrap">{item.name}</span>
                                </>
                              )}
                            </NavLink>
                          ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Collapsed mode */
                    <div className="relative mt-2 group/flyout">
                      <button
                        onClick={() => setExpenseDropdownOpen(!expenseDropdownOpen)}
                        className="w-full group relative flex items-center justify-center px-2 py-1 rounded-lg transition-all duration-200"
                        title="Expense Tracking"
                      >
                        <BanknotesIcon
                          className="h-3.5 w-3.5 transition-all duration-200"
                          style={{
                            color: 'var(--erp-ink)'
                          }}
                        />
                        {/* Tooltip removed — the hover flyout already shows the submenu. */}
                      </button>

                      {/* Hover the icon to reveal this submenu; hidden otherwise. */}
                      <div className="hidden group-hover/flyout:block absolute left-full top-0 ml-2 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50 before:content-[''] before:absolute before:-left-2 before:top-0 before:h-full before:w-2">
                          {expenseTrackingItems.map((item) => (
                            <NavLink
                              key={item.path}
                              to={item.path}
                              onClick={() => {
                                setExpenseDropdownOpen(false);
                                if (isMobile) setSidebarOpen(false);
                              }}
                              className={({ isActive }) =>
                                `block px-2 py-1 text-sm transition-colors ${isActive
                                  ? 'text-black font-medium'
                                  : 'text-black hover:text-black hover:bg-gray-50'
                                }`
                              }
                              style={({ isActive }) => ({
                                color: isActive ? 'var(--erp-ink)' : undefined,
                                backgroundColor: isActive ? themeShades.light : 'transparent'
                              })}
                            >
                              {item.name}
                            </NavLink>
                          ))}
                        </div>
                    </div>
                  )}
                </div>
              )}

              {/* Other Pages (MOM Tracking, Sales) - Only show if user has access */}
              {otherPagesItems.length > 0 && (
                <div className="mt-1 pt-0">
                  {sidebarOpen ? (
                    <div className="space-y-1">
                      {otherPagesItems.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={(e) => handleOtherPageClick(e, item.path)}
                          onMouseEnter={() => setHoveredItem(item.path)}
                          onMouseLeave={() => setHoveredItem(null)}
                          className={({ isActive }) =>
                            `group relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200 min-w-full w-max ${isActive
                              ? 'text-gray-900 font-medium'
                              : 'text-black hover:text-gray-900'
                            }`
                          }
                          style={({ isActive }) => ({
                            backgroundColor: isActive ? themeShades.light : 'transparent',
                            color: isActive ? themeColor : undefined
                          })}
                        >
                          {({ isActive }) => (
                            <>
                              <item.icon
                                className="h-3.5 w-3.5 transition-all duration-200 flex-shrink-0"
                                style={{
                                  color: isActive ? themeColor :
                                    hoveredItem === item.path ? themeColor : '#6B7280'
                                }}
                              />
                              <span className="flex-1 text-sm font-medium whitespace-nowrap">
                                {item.name}
                              </span>
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  ) : (
                    /* Collapsed mode */
                    <div className="space-y-1">
                      {otherPagesItems.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={(e) => handleOtherPageClick(e, item.path)}
                          className={({ isActive }) =>
                            `group relative flex items-center justify-center px-1 py-1 rounded-lg transition-all duration-200`
                          }
                          title={item.name}
                        >
                          <item.icon
                            className="h-3.5 w-3.5 transition-all duration-200"
                            style={{
                              color: isActive => isActive ? themeColor : '#6B7280'
                            }}
                          />
                          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                            {item.name}
                            <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                          </div>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>

            {/* Fixed Info Buttons at Bottom of White Section - Non-scrollable */}
            <div className={`flex-shrink-0 px-2 pb-2 pt-1 mt-auto flex items-center gap-1 ${sidebarOpen ? 'flex-row' : 'flex-col'}`}>
              {/* Sitemap — helicopter view of the whole ERP (Master Admin only) */}
              {isMasterAdmin && (
                <button
                  onClick={() => setShowSitemapModal(true)}
                  onMouseEnter={() => setHoveredItem('sitemap')}
                  onMouseLeave={() => setHoveredItem(null)}
                  className="group relative flex items-center justify-center px-2 py-0.5 rounded-md transition-all duration-200 hover:bg-gray-100 active:scale-[0.98] flex-shrink-0"
                >
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                    <svg className="w-3 h-3" style={{ color: themeColor }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="9" y="3" width="6" height="4.5" rx="1" />
                      <rect x="3" y="16.5" width="6" height="4.5" rx="1" />
                      <rect x="15" y="16.5" width="6" height="4.5" rx="1" />
                      <path strokeLinecap="round" d="M12 7.5v3.5M12 11H6v5.5M12 11h6v5.5" />
                    </svg>
                  </div>
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                    ERP Sitemap
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                  </div>
                </button>
              )}

              <button
                onClick={() => setShowTerminologyModal(true)}
                onMouseEnter={() => setHoveredItem('terminology')}
                onMouseLeave={() => setHoveredItem(null)}
                className={`group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md w-full transition-all duration-200
hover:bg-gray-100 active:scale-[0.98]
${sidebarOpen ? 'justify-start' : 'justify-center'}`}
              >
                {/* Icon */}
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                  <span
                    className="text-[9px] font-semibold"
                    style={{ color: themeColor }}
                  >
                    AB
                  </span>
                </div>

                {/* Full Label */}
                {sidebarOpen && (
                  <span className="text-[11px] font-medium text-gray-700 whitespace-nowrap">
                    Abbreviations Guide
                  </span>
                )}

                {/* Tooltip (collapsed) */}
                {!sidebarOpen && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                    Abbreviations Guide
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Profile and Logout Section at BOTTOM with margin bottom - UPDATED with NavLink */}
          <div className="flex-shrink-0 px-3 pb-3 pt-2 space-y-1.5 bg-[#ffdb62]">
            {/* Compact strip — Auto-Hide + Light/Night share ONE row side by side */}
            <div className={sidebarOpen ? 'flex items-stretch gap-1' : 'space-y-1.5'}>
            {/* Auto-hide (hover to open) toggle — desktop only */}
            {!isMobile && (sidebarOpen ? (
              <button
                type="button"
                onClick={toggleAutoHide}
                className={`flex-1 flex items-center justify-center h-6 rounded-full border transition-all duration-200 active:scale-95 ${autoHide ? 'shadow-sm' : 'bg-gray-100 hover:bg-gray-200'}`}
                style={autoHide ? { backgroundColor: themeColor, borderColor: 'rgba(146, 64, 14, 0.4)' } : { borderColor: 'rgba(146, 64, 14, 0.4)' }}
                title={autoHide ? 'Auto-Hide is ON — menu opens on hover, tucks away after. Click to pin the menu open.' : 'Auto-Hide the menu — it will open on hover and minimize when you move away. Click to turn on.'}
              >
                <svg className={`h-3.5 w-3.5 transition-colors ${autoHide ? 'text-white' : 'text-gray-500'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleAutoHide}
                className="w-full group relative flex items-center justify-center py-0.5 rounded-lg transition-all duration-200"
                title={autoHide ? 'Pin menu open' : 'Auto-hide menu (open on hover)'}
              >
                <span className={`flex items-center justify-center h-5 w-5 rounded-full border transition-colors ${autoHide ? 'shadow-sm' : ''}`}
                  style={autoHide ? { backgroundColor: themeColor, borderColor: 'rgba(146, 64, 14, 0.4)' } : { borderColor: 'rgba(146, 64, 14, 0.4)' }}>
                  <svg className={`h-3.5 w-3.5 ${autoHide ? 'text-white' : 'text-gray-500'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                  </svg>
                </span>
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {autoHide ? 'Pin Menu Open' : 'Auto-Hide Menu (hover to open)'}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              </button>
            ))}

            {/* Dark / Light mode toggle */}
            {sidebarOpen ? (
              <button
                type="button"
                onClick={toggleTheme}
                className={`flex-1 flex items-center justify-center h-6 rounded-full border transition-all duration-200 active:scale-95 ${darkMode ? 'shadow-sm' : 'bg-gray-100 hover:bg-gray-200'}`}
                style={darkMode ? { backgroundColor: themeColor, borderColor: 'rgba(146, 64, 14, 0.4)' } : { borderColor: 'rgba(146, 64, 14, 0.4)' }}
                title={darkMode ? 'Night Mode is ON — click to switch to light mode' : 'Switch to Night Mode (dark theme)'}
              >
                {darkMode ? (
                  <MoonIcon className="h-3.5 w-3.5 text-white" />
                ) : (
                  <SunIcon className="h-3.5 w-3.5" style={{ color: '#92400e' }} />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full group relative flex items-center justify-center py-0.5 rounded-lg transition-all duration-200"
                title={darkMode ? 'Switch to light mode' : 'Switch to night mode'}
              >
                <span className="flex items-center justify-center h-5 w-5 rounded-full border" style={{ borderColor: 'rgba(146, 64, 14, 0.4)' }}>
                  {darkMode ? (
                    <MoonIcon className="h-4 w-4 text-sky-400" />
                  ) : (
                    <SunIcon className="h-4 w-4" style={{ color: '#92400e' }} />
                  )}
                </span>
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                  {darkMode ? 'Switch to Light Mode' : 'Switch to Night Mode'}
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              </button>
            )}
            </div>

            {/* User Info Section - Changed from div to NavLink */}
            {sidebarOpen ? (
              <div className="space-y-1.5">
                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    `px-2 py-1.5 bg-gray-50/50 rounded-lg cursor-pointer hover:bg-gray-100/80 transition-colors block`
                  }
                  onClick={() => {
                    if (isMobile) setSidebarOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-semibold text-[#2f3192] underline hover:font-bold truncate">
                        {user?.name || 'User'}
                      </span>
                      <div className="flex flex-col space-y-1">
                        <span className="text-[10px] truncate">
                          <span className="font-semibold text black">Branch: </span>
                          {user?.branch || 'N/A'} - {getBranchDisplayName(user?.branch)}
                        </span>
                        <span className="text-[10px] truncate">
                          <span className="font-semibold text black">Role: </span>
                          {getRoleDisplayName(user?.role)}
                        </span>
                      </div>
                    </div>
                  </div>
                </NavLink>

                {/* Branch Switcher Dropdown - only when user has multiple branches */}
                {user?.branches && user.branches.length > 1 && (
                  <div className="relative branch-switcher-dropdown">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBranchDropdownOpen(!branchDropdownOpen);
                      }}
                      className="w-full flex items-center justify-between px-2 py-1 bg-white hover:bg-gray-50 rounded-md border border-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <BuildingOffice2Icon
                          className="h-3 w-3 flex-shrink-0"
                          style={{ color: themeColor }}
                        />
                        <span className="text-[10px] font-medium text-gray-700 truncate">
                          Switch Branch
                        </span>
                      </div>
                      {branchDropdownOpen ? (
                        <ChevronUpIcon className="h-2.5 w-2.5 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronDownIcon className="h-2.5 w-2.5 text-gray-500 flex-shrink-0" />
                      )}
                    </button>

                    {branchDropdownOpen && (
                      <div className="absolute bottom-full mb-1 left-0 right-0 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50 max-h-48 overflow-y-auto">
                        {user.branches.map((b) => {
                          const isActive = b.branch === user.branch;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              disabled={isActive}
                              onClick={() => handleBranchSwitch(b)}
                              className={`w-full text-left px-2 py-1 text-[10px] transition-colors flex items-center gap-1.5 ${isActive
                                ? 'bg-green-50 text-green-800 cursor-default font-semibold'
                                : 'text-gray-700 hover:bg-gray-50 cursor-pointer'
                                }`}
                            >
                              {isActive && <span className="text-green-600">✓</span>}
                              {!isActive && b.is_primary && (
                                <span className="text-yellow-500">★</span>
                              )}
                              <span className="truncate">
                                {b.branch_name} ({b.branch})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <NavLink
                  to="/profile"
                  className="w-full group relative flex items-center justify-center py-0.5"
                  title="Profile"
                  onClick={() => {
                    if (isMobile) setSidebarOpen(false);
                  }}
                >
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center text-white font-semibold text-xs shadow-md"
                    style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeShades.dark})` }}
                  >
                    {getUserInitials()}
                  </div>
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                    <div className="whitespace-nowrap text-sm">{user?.name || 'User'}</div>
                    <div className="whitespace-nowrap text-[10px] opacity-75">Branch: {getBranchDisplayName(user?.branch)}</div>
                    <div className="whitespace-nowrap text-[10px] opacity-75">Role: {getRoleDisplayName(user?.role)}</div>
                    {user?.branches && user.branches.length > 1 && (
                      <div className="whitespace-nowrap text-[10px] opacity-75 mt-0.5 pt-0.5 border-t border-gray-700">
                        Expand sidebar to switch branch
                      </div>
                    )}
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                  </div>
                </NavLink>
              </div>
            )}

            {/* Logout Button */}
            {!sidebarOpen ? (
              <button
                onClick={handleLogout}
                className="w-full group relative flex items-center justify-center py-0.5 rounded-lg transition-all duration-200"
                title="Logout"
              >
                <ArrowLeftOnRectangleIcon
                  className="h-4 w-4 transition-all duration-200"
                  style={{ color: logoutColor }}
                  onMouseEnter={() => setHoveredItem('logout')}
                  onMouseLeave={() => setHoveredItem(null)}
                />
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible hover:font-bold transition-all whitespace-nowrap z-50">
                  Logout
                  <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full group relative flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200 hover:bg-red-50"
                onMouseEnter={() => setHoveredItem('logout')}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  color: logoutColor,
                  backgroundColor: hoveredItem === 'logout' ? 'rgba(239, 68, 68, 0.1)' : 'transparent'
                }}
              >
                <ArrowLeftOnRectangleIcon
                  className="h-4 w-4 transition-all duration-200 flex-shrink-0"
                  style={{ color: logoutColor }}
                />
                <span className="flex-1 text-sm font-medium text-left hover:font-bold">Logout</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-auto">
        {/* Mobile Header */}
        {isMobile && (
          <header className="sticky top-0 z-10 bg-white backdrop-blur-xl border-b border-gray-200/50 px-3 h-14 max-sm:h-16 flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Logo />
            </div>

            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg text-black hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Open menu"
            >
              <Bars3Icon className="h-4 w-4" />
            </button>
          </header>
        )}

        {/* Page Content */}
        <div className="flex-1 py-2 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default Navbar;