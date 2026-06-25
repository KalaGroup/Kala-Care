import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PiHandshakeDuotone } from "react-icons/pi";
import Swal from 'sweetalert2';
import axios from 'axios';

import {
  Bars3Icon,
  XMarkIcon,
  DocumentArrowUpIcon,
  UsersIcon,
  MegaphoneIcon,
  TableCellsIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
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
  PencilSquareIcon
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

function Navbar({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [engagementDropdownOpen, setEngagementDropdownOpen] = useState(false);
  const [showTerminologyModal, setShowTerminologyModal] = useState(false);
  const [expenseDropdownOpen, setExpenseDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
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

  const user = JSON.parse(sessionStorage.getItem('user'));

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

  // Function to get branch display name
  const getBranchDisplayName = (branchCode) => {
    return branchMap[branchCode] || branchCode || 'No Branch';
  };

  // Role checks
  const isAdmin = user?.role === 'master_admin' || user?.role === 'it_admin' || user?.role === 'branch_admin';
  const isMasterOrITAdmin = user?.role === 'master_admin' || user?.role === 'it_admin';
  const isEmployee = user?.role === 'employee';

  const themeColor = '#2f3192';
  const logoutColor = '#000000';

  // Generate shades of the theme color
  const themeShades = {
    light: 'rgba(64, 96, 147, 0.1)',
    medium: 'rgba(64, 96, 147, 0.5)',
    dark: '#335478',
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
        { symbol: "FR", meaning: "Rescheduled", description: "Follow-up rescheduled" },
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

  // Terminology Modal Component - Compact version
  const TerminologyModal = () => {
    if (!showTerminologyModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
        setSidebarOpen(true);
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

        const campData = campRes.ok ? await campRes.json() : [];
        const metaData = metaRes.ok ? await metaRes.json() : [];
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

  // On the customer info page (taking follow-ups) → open Knowledge Bank in a small
  // CHROME POPUP WINDOW (not a new tab). The fixed window name "knowledgeBankPopup"
  // means a second click reuses the same popup instead of opening another one.
  // Everywhere else it navigates normally in the same tab.
  const handleOtherPageClick = (e, path) => {
    if (path === '/knowledge-book' && sessionStorage.getItem('onCustomerInfoPage') === 'true') {
      e.preventDefault();
      const w = 1000, h = 700;
      const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
      window.open(
        '/knowledge-book',
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
        allowedRoles: ['master_admin', 'it_admin', 'branch_admin', 'employee']
      },
      {
        path: '/import',
        name: 'Data - Upload',
        icon: CloudArrowUpIcon,
        description: 'Upload customer data',
        allowedRoles: ['master_admin', 'it_admin']
      },
      {
        path: '/customers',
        name: 'Customers Data Bouquet',
        icon: UserGroupIcon,
        description: 'Manage your clients',
        allowedRoles: ['master_admin', 'it_admin']
      },
      {
        path: '/campaigns',
        name: 'Drive Creation',
        icon: CiFlag1,
        description: 'Create & track drives',
        allowedRoles: ['master_admin', 'it_admin']
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

  const mainNavItems = getMainNavItems();

  // Customer Engagement dropdown items
  const engagementItems = [
    {
      path: '/customer-engagement',
      name: 'Drive Data',
      description: 'Drive-based customer interactions',
      allowedRoles: ['master_admin', 'it_admin', 'branch_admin', 'employee']
    },
    {
      path: '/customer-engagement-2',
      name: 'Non-Drive Data',
      description: 'Non-drive customer interactions',
      allowedRoles: ['master_admin', 'it_admin', 'branch_admin', 'employee']
    }
  ];

  const expenseTrackingItems = [
    {
      path: '/expense-dashboard',
      name: 'Dashboard',
      description: 'Expense Dashboard View',
      allowedRoles: ['master_admin', 'it_admin', 'branch_admin', 'employee']
    },
    {
      path: '/expense',
      name: 'Expense',
      description: 'Expense Entry & Management',
      allowedRoles: ['master_admin', 'it_admin', 'branch_admin', 'employee']
    }
  ];

  // Other standalone pages (not in dropdown) - Filtered by role
  const getOtherPagesItems = () => {
    const allOtherPagesItems = [
      {
        path: '/mom-tracking',
        name: 'MOM Tracking',
        icon: ClipboardDocumentListIcon,
        description: 'Minutes of Meeting tracking',
        allowedRoles: ['master_admin', 'it_admin']
      },
      {
        path: '/knowledge-book',
        name: 'Knowledge Bank',
        icon: BookOpenIcon,
        description: 'Product brochures, photos, videos & documents',
        allowedRoles: ['master_admin', 'it_admin', 'branch_admin', 'employee']

      },
      // {
      //   path: '/sales-finance',
      //   name: 'Sales',
      //   icon: CurrencyRupeeIcon,
      //   description: 'Sales and financial management',
      //   allowedRoles: ['master_admin', 'it_admin']
      // }
    ];

    return allOtherPagesItems.filter(item =>
      item.allowedRoles.includes(user?.role)
    );
  };

  const otherPagesItems = getOtherPagesItems();

  // Check if any engagement route is active
  const isEngagementActive = () => {
    return location.pathname === '/customer-engagement' ||
      location.pathname === '/customer-engagement-2';
  };

  // Master Admin / IT Admin always have access.
  // Branch Admin and Employee need explicit permission (can_access_expense)
  // granted from the Profile page edit modal.
  const canAccessExpensePages = () => {
    if (!user) return false;
    if (user.role === 'master_admin' || user.role === 'it_admin') {
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

  const NavLinks = ({ items, collapsed = false, onClick = () => { } }) => (
    <nav className="space-y-0.5">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onClick}
          onMouseEnter={() => setHoveredItem(item.path)}
          onMouseLeave={() => setHoveredItem(null)}
          className={({ isActive }) =>
            `group relative flex items-center gap-1 px-1 py-1 rounded-lg transition-all duration-200 ${isActive
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
                  <span className="flex-1 text-sm font-medium truncate">
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

  // Get role display name
  const getRoleDisplayName = (role) => {
    const roleMap = {
      'master_admin': 'Master Admin',
      'it_admin': 'IT Admin',
      'branch_admin': 'Branch Admin',
      'employee': 'Employee'
    };
    return roleMap[role] || role;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#EEEEEE]">
      {/* Terminology Modal */}
      <TerminologyModal />

      {/* Drive List Modal — ALL drives (active + inactive). Duration / Remark /
          display name are editable via the Actions column (View / Edit) and
          saved to the SEPARATE campaign_drive_meta table — the real drive is
          never changed. */}
      {showDriveNamesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
                <div className="flex flex-col flex-1 min-w-[180px]">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Search</label>
                  <input
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    placeholder="Search drive name / product…"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Status</label>
                  <select
                    value={driveStatusFilter}
                    onChange={(e) => setDriveStatusFilter(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black bg-white focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': themeColor }}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Start Date (from)</label>
                  <input
                    type="date"
                    value={driveDateFrom}
                    max={driveDateTo || undefined}
                    onChange={(e) => setDriveDateFrom(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">End Date (to)</label>
                  <input
                    type="date"
                    value={driveDateTo}
                    min={driveDateFrom || undefined}
                    onChange={(e) => setDriveDateTo(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Data Duration (from)</label>
                  <input
                    type="month"
                    value={durationFrom}
                    max={durationTo || undefined}
                    onChange={(e) => setDurationFrom(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': themeColor }}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] font-medium text-gray-500 mb-0.5">Data Duration (to)</label>
                  <input
                    type="month"
                    value={durationTo}
                    min={durationFrom || undefined}
                    onChange={(e) => setDurationTo(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
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
                    className="px-2 py-1 text-[11px] font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors whitespace-nowrap"
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
                  <table className="w-full text-xs border-collapse table-fixed">
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
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-1.5 flex justify-between items-center">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
                    <div className="flex items-center gap-2">
                      <input
                        type="month"
                        value={editForm.data_start}
                        max={editForm.data_end || undefined}
                        onChange={(e) => setEditForm((f) => ({ ...f, data_start: e.target.value }))}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs text-black focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': themeColor }}
                      />
                      <span className="text-gray-400 text-[11px]">to</span>
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

            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2 flex justify-end gap-2">
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

      {/* Sidebar */}
      <aside className={`
        fixed md:relative md:translate-x-0
        h-full bg-white backdrop-blur-xl
        border-r border-gray-200/50
        transition-all duration-300 ease-in-out z-30
        shadow-xl shadow-gray-200/20
        ${sidebarOpen ? 'w-56' : 'w-14'}
        ${isMobile ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full') : ''}
      `}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header - Logo and Name Centered */}
          <div className={`bg-[#ffdb62] flex items-center justify-center ${sidebarOpen ? 'pt-0 pb-1' : 'py-1'} ${sidebarOpen ? 'px-4' : 'px-2'}`}>
            <div className="flex flex-col items-center justify-center w-full">
              <div className={`${sidebarOpen ? 'mb-0' : 'mb-0'}`}>
                <Logo collapsed={!sidebarOpen} />
              </div>
              {sidebarOpen && (
                <div className="flex flex-col items-center w-full">
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

          {/* Main Navigation - Scrollable Area with Fixed Bottom Info Button */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Scrollable Navigation Links */}
            <div className="flex-1 overflow-y-auto py-3 px-3 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <style>
                {`
                  .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                  }
                `}
              </style>
              <NavLinks items={mainNavItems} collapsed={!sidebarOpen} />

              {/* Customer Engagement Dropdown */}
              {sidebarOpen ? (
                <div className="mt-0">
                  <button
                    onClick={() => setEngagementDropdownOpen(!engagementDropdownOpen)}
                    onMouseEnter={() => setHoveredItem('customer-engagement')}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`
        w-full group relative flex items-center gap-1 px-1 py-1 rounded-lg transition-all duration-200
        ${isEngagementActive() ? 'text-black font-medium' : 'text-black hover:text-black'}
      `}
                    style={{
                      backgroundColor: (isEngagementActive() || engagementDropdownOpen) ? themeShades.light : 'transparent'
                    }}
                  >
                    <PiHandshakeDuotone
                      className="h-3.5 w-3.5 transition-all duration-200 flex-shrink-0"
                      style={{
                        color: isEngagementActive() ? 'black' :
                          hoveredItem === 'customer-engagement' ? 'black' : 'black'
                      }}
                    />
                    <span className="flex-1 text-sm font-medium truncate text-left text-black">
                      Customer Engagement
                    </span>
                    {engagementDropdownOpen ? (
                      <ChevronUpIcon className="h-2.5 w-2.5 text-black" />
                    ) : (
                      <ChevronDownIcon className="h-2.5 w-2.5 text-black" />
                    )}
                  </button>

                  {/* Dropdown Items */}
                  {(engagementDropdownOpen || isEngagementActive()) && (
                    <div className="ml-5 mt-1 space-y-0.5 border-l border-gray-200 pl-1.5">
                      {/* Drive List Info — opens the modal (not a route); shown first.
                          Master Admin / IT Admin only. */}
                      {isMasterOrITAdmin && (
                        <button
                          type="button"
                          onClick={() => { setShowDriveNamesModal(true); if (isMobile) setSidebarOpen(false); }}
                          className="w-full group relative flex items-center gap-1 px-1 py-1 rounded-md transition-all duration-200 text-sm text-black hover:text-black hover:bg-gray-50"
                        >
                          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#D1D5DB' }} />
                          <span className="flex-1 truncate text-left">Drive List Info</span>
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
                            `group relative flex items-center gap-1 px-1 py-1 rounded-md transition-all duration-200 text-sm ${isActive
                              ? 'text-black font-medium'
                              : 'text-black hover:text-black'
                            }`
                          }
                          style={({ isActive }) => ({
                            backgroundColor: isActive ? themeShades.light : 'transparent',
                            color: isActive ? 'black' : undefined
                          })}
                        >
                          {({ isActive }) => (
                            <>
                              <div
                                className="w-1 h-1 rounded-full"
                                style={{
                                  backgroundColor: isActive ? 'black' : '#D1D5DB'
                                }}
                              />
                              <span className="flex-1 truncate">{item.name}</span>
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Collapsed mode */
                <div className="relative mt-2">
                  <button
                    onClick={() => setEngagementDropdownOpen(!engagementDropdownOpen)}
                    className="w-full group relative flex items-center justify-center px-2 py-1.5 rounded-lg transition-all duration-200"
                    title="Customer Engagement"
                  >
                    <PiHandshakeDuotone
                      className="h-3.5 w-3.5 transition-all duration-200"
                      style={{
                        color: 'black'
                      }}
                    />
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                      Customer Engagement
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                    </div>
                  </button>

                  {(engagementDropdownOpen || isEngagementActive()) && (
                    <div className="absolute left-full top-0 ml-2 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50">
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
                            `block px-2 py-1.5 text-sm transition-colors ${isActive
                              ? 'text-black font-medium'
                              : 'text-black hover:text-black hover:bg-gray-50'
                            }`
                          }
                          style={({ isActive }) => ({
                            color: isActive ? 'black' : undefined,
                            backgroundColor: isActive ? themeShades.light : 'transparent'
                          })}
                        >
                          {item.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Expense Tracking Dropdown Section */}
              {canAccessExpensePages() && (
                <div className="mt-0 pt-0">
                  {sidebarOpen ? (
                    <div className="mt-0">
                      <button
                        onClick={() => setExpenseDropdownOpen(!expenseDropdownOpen)}
                        onMouseEnter={() => setHoveredItem('expense-tracking')}
                        onMouseLeave={() => setHoveredItem(null)}
                        className={`
            w-full group relative flex items-center gap-1 px-1 py-1 rounded-lg transition-all duration-200
            ${isExpenseActive() ? 'text-black font-medium' : 'text-black hover:text-black'}
          `}
                        style={{
                          backgroundColor: (isExpenseActive() || expenseDropdownOpen) ? themeShades.light : 'transparent'
                        }}
                      >
                        <BanknotesIcon
                          className="h-3.5 w-3.5 transition-all duration-200 flex-shrink-0"
                          style={{
                            color: isExpenseActive() ? 'black' :
                              hoveredItem === 'expense-tracking' ? 'black' : 'black'
                          }}
                        />
                        <span className="flex-1 text-sm font-medium truncate text-left text-black">
                          Expense Tracking
                        </span>
                        {expenseDropdownOpen ? (
                          <ChevronUpIcon className="h-2.5 w-2.5 text-black" />
                        ) : (
                          <ChevronDownIcon className="h-2.5 w-2.5 text-black" />
                        )}
                      </button>

                      {/* Dropdown Items */}
                      {(expenseDropdownOpen || isExpenseActive()) && (
                        <div className="ml-5 mt-1 space-y-0.5 border-l border-gray-200 pl-1.5">
                          {expenseTrackingItems.map((item) => (
                            <NavLink
                              key={item.path}
                              to={item.path}
                              onClick={() => {
                                if (isMobile) setSidebarOpen(false);
                              }}
                              className={({ isActive }) =>
                                `group relative flex items-center gap-1 px-1 py-1 rounded-md transition-all duration-200 text-sm ${isActive
                                  ? 'text-black font-medium'
                                  : 'text-black hover:text-black'
                                }`
                              }
                              style={({ isActive }) => ({
                                backgroundColor: isActive ? themeShades.light : 'transparent',
                                color: isActive ? 'black' : undefined
                              })}
                            >
                              {({ isActive }) => (
                                <>
                                  <div
                                    className="w-1 h-1 rounded-full"
                                    style={{
                                      backgroundColor: isActive ? 'black' : '#D1D5DB'
                                    }}
                                  />
                                  <span className="flex-1 truncate">{item.name}</span>
                                </>
                              )}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Collapsed mode */
                    <div className="relative mt-2">
                      <button
                        onClick={() => setExpenseDropdownOpen(!expenseDropdownOpen)}
                        className="w-full group relative flex items-center justify-center px-2 py-1.5 rounded-lg transition-all duration-200"
                        title="Expense Tracking"
                      >
                        <BanknotesIcon
                          className="h-3.5 w-3.5 transition-all duration-200"
                          style={{
                            color: 'black'
                          }}
                        />
                        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                          Expense Tracking
                          <div className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                        </div>
                      </button>

                      {(expenseDropdownOpen || isExpenseActive()) && (
                        <div className="absolute left-full top-0 ml-2 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50">
                          {expenseTrackingItems.map((item) => (
                            <NavLink
                              key={item.path}
                              to={item.path}
                              onClick={() => {
                                setExpenseDropdownOpen(false);
                                if (isMobile) setSidebarOpen(false);
                              }}
                              className={({ isActive }) =>
                                `block px-2 py-1.5 text-sm transition-colors ${isActive
                                  ? 'text-black font-medium'
                                  : 'text-black hover:text-black hover:bg-gray-50'
                                }`
                              }
                              style={({ isActive }) => ({
                                color: isActive ? 'black' : undefined,
                                backgroundColor: isActive ? themeShades.light : 'transparent'
                              })}
                            >
                              {item.name}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Other Pages (MOM Tracking, Sales) - Only show if user has access */}
              {otherPagesItems.length > 0 && (
                <div className="mt-0 pt-0">
                  {sidebarOpen ? (
                    <div className="space-y-0.5">
                      {otherPagesItems.map((item) => (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={(e) => handleOtherPageClick(e, item.path)}
                          onMouseEnter={() => setHoveredItem(item.path)}
                          onMouseLeave={() => setHoveredItem(null)}
                          className={({ isActive }) =>
                            `group relative flex items-center gap-1 px-1 py-1 rounded-lg transition-all duration-200 ${isActive
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
                              <span className="flex-1 text-sm font-medium truncate">
                                {item.name}
                              </span>
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  ) : (
                    /* Collapsed mode */
                    <div className="space-y-0.5">
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

            {/* Fixed Info Button at Bottom of White Section - Non-scrollable */}
            <div className="flex-shrink-0 px-2 pb-2 pt-1 mt-auto">
              <button
                onClick={() => setShowTerminologyModal(true)}
                onMouseEnter={() => setHoveredItem('terminology')}
                onMouseLeave={() => setHoveredItem(null)}
                className={`group relative flex items-center gap-1.5 px-2 py-1 rounded-md w-full transition-all duration-200 
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
                      <div className="flex flex-col space-y-0.5">
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
                  style={{ color: hoveredItem === 'logout' ? logoutColor : '#000000' }}
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
          <header className="sticky top-0 z-10 bg-white backdrop-blur-xl border-b border-gray-200/50 px-3 h-14 flex items-center justify-between">
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