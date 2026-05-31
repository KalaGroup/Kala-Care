import React, { useState, useEffect } from 'react';
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
  BuildingOffice2Icon
} from '@heroicons/react/24/outline';
import { CiFlag1 } from "react-icons/ci";

function Navbar({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [engagementDropdownOpen, setEngagementDropdownOpen] = useState(false);
  const [showTerminologyModal, setShowTerminologyModal] = useState(false);
  const [expenseDropdownOpen, setExpenseDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
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
        { symbol: "✓", meaning: "In Campaign", description: "Customer is in campaign" },
        { symbol: "T", meaning: "Transferred", description: "Customer tranferred from old campaign" },
        { symbol: "W", meaning: "Work in Progress", description: "Ongoing" },
        { symbol: "C", meaning: "Completed", description: "Business converted" },
        { symbol: "R", meaning: "Rejected", description: "Rejected by customer" },
        { symbol: "FR", meaning: "Rescheduled", description: "Follow-up rescheduled" }
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
              <h2 className="text-base font-semibold text-gray-900">Terminology Guide</h2>
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

  // Send logout time to backend (manual or auto), then clear session
  const recordLogoutAndClear = async (logoutType = 'manual') => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (stored.session_id) {
        // Use the SAME axios path style as the login call (/api/users/...)
        // so the request actually reaches the backend.
        await axios.post(`${import.meta.env.VITE_BACKEND_URL}/users/logout`, {
          session_id: stored.session_id,
          logout_type: logoutType,
        });
      }
    } catch (e) {
      console.error('Logout tracking failed:', e);
      // never block logout on a tracking failure
    } finally {
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('token');
      navigate('/login');
    }
  };

  const handleLogout = () => {
    recordLogoutAndClear('manual');
  };

  // ---- Auto-logout after 10 minutes of inactivity ----
  useEffect(() => {
    if (!user) return;

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
        description: 'Create & track campaigns',
        allowedRoles: ['master_admin', 'it_admin']
      }
    ];

    const hiddenUserIds = ['31240001', '31250001', '31240012'];
    const restrictedPaths = ['/import', '/campaigns'];
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
      description: 'Campaign-based customer interactions',
      allowedRoles: ['master_admin', 'it_admin', 'branch_admin', 'employee']
    },
    {
      path: '/customer-engagement-2',
      name: 'Non-Drive Data',
      description: 'Non-campaign customer interactions',
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
      // {
      //   path: '/knowledge-bank',
      //   name: 'Knowledge Bank',
      //   icon: BookOpenIcon,
      //   description: 'Knowledge base & resources',
      //   allowedRoles: ['master_admin', 'it_admin']
      // },
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
                          onClick={() => {
                            if (isMobile) setSidebarOpen(false);
                          }}
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
                          onClick={() => {
                            if (isMobile) setSidebarOpen(false);
                          }}
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